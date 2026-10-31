"""Local AmigoHub registry with immutable artifacts and a moderation gate."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
import uuid
import zipfile
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from .plugins import PluginManifest


PackageKind = Literal["skill", "plugin"]
MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_FILES = 1500


class HubRegistry:
    def __init__(self, database: Path):
        database.parent.mkdir(parents=True, exist_ok=True)
        self.path = database
        with self._connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS packages(
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, slug TEXT NOT NULL,
                    name TEXT NOT NULL, description TEXT NOT NULL, publisher TEXT NOT NULL,
                    tags TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                    created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    UNIQUE(kind,slug)
                );
                CREATE TABLE IF NOT EXISTS versions(
                    id TEXT PRIMARY KEY, package_id TEXT NOT NULL, version TEXT NOT NULL,
                    digest TEXT NOT NULL, size INTEGER NOT NULL, artifact BLOB NOT NULL,
                    root_prefix TEXT NOT NULL, scan TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                    changelog TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL,
                    UNIQUE(package_id,version), FOREIGN KEY(package_id) REFERENCES packages(id)
                );
                CREATE TABLE IF NOT EXISTS hub_events(
                    id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT, version_id TEXT,
                    event TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL, created_at REAL NOT NULL
                );
            """)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def publish(self, *, kind: PackageKind, slug: str, name: str, description: str,
                publisher: str, version: str, tags: list[str], artifact: bytes,
                changelog: str = "") -> dict[str, Any]:
        if kind not in {"skill", "plugin"}:
            raise ValueError("Package kind must be skill or plugin")
        slug = slug.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]", slug):
            raise ValueError("Package slug must be 3-64 lowercase letters, numbers, dots, underscores, or hyphens")
        if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?", version):
            raise ValueError("Package version must use semantic version syntax")
        publisher = publisher.strip()
        name = name.strip()
        if not publisher or len(publisher) > 128 or not name or len(name) > 160:
            raise ValueError("Publisher and package name are required")
        if not isinstance(tags, list) or len(tags) > 100 or any(not isinstance(tag, str) for tag in tags):
            raise ValueError("Tags must be a list of at most 100 strings")
        tags = sorted({tag.strip()[:80] for tag in tags if tag.strip()})[:30]
        if len(description) > 4000 or len(changelog) > 4000:
            raise ValueError("Description and changelog are limited to 4000 characters")
        if len(artifact) > MAX_ARCHIVE_BYTES:
            raise ValueError("Package archive exceeds 25 MB")
        digest = hashlib.sha256(artifact).hexdigest()
        root_prefix, scan = _inspect_archive(kind, version, artifact)
        now = time.time()
        with self._connect() as db:
            current = db.execute("SELECT * FROM packages WHERE kind=? AND slug=?", (kind, slug)).fetchone()
            if current and current["publisher"] != publisher:
                raise PermissionError("Only the package publisher may upload a new version")
            package_id = current["id"] if current else str(uuid.uuid4())
            if current and db.execute("SELECT 1 FROM versions WHERE package_id=? AND version=?", (package_id, version)).fetchone():
                raise ValueError("Package versions are immutable and cannot be republished")
            if not current:
                db.execute("INSERT INTO packages(id,kind,slug,name,description,publisher,tags,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)",
                (package_id, kind, slug, name, description, publisher, json.dumps(tags), now, now))
            version_id = str(uuid.uuid4())
            db.execute("INSERT INTO versions(id,package_id,version,digest,size,artifact,root_prefix,scan,status,changelog,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)",
                       (version_id, package_id, version, digest, len(artifact), artifact, root_prefix, json.dumps(scan), changelog[:4000], now))
            package_status = current["status"] if current else "pending"
            db.execute("UPDATE packages SET name=?,description=?,tags=?,status=?,updated_at=? WHERE id=?",
                       (name, description, json.dumps(tags), package_status, now, package_id))
            db.execute("INSERT INTO hub_events(package_id,version_id,event,actor,detail,created_at) VALUES(?,?,'package.published',?,?,?)",
                       (package_id, version_id, publisher, json.dumps({"digest": digest, "scanFindings": len(scan)}), now))
        return self.version(package_id, version)

    def version(self, package_id: str, version: str) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("""SELECT p.id,p.kind,p.slug,p.name,p.publisher,v.version,v.digest,v.size,v.scan,v.status,v.created_at
                FROM packages p JOIN versions v ON v.package_id=p.id WHERE p.id=? AND v.version=?""", (package_id, version)).fetchone()
        if not row:
            raise ValueError("Hub package version not found")
        return {**dict(row), "scan": json.loads(row["scan"])}

    def list_packages(self, *, kind: str | None = None, query: str = "", tag: str | None = None,
                      sort: str = "popular", limit: int = 30, offset: int = 0) -> dict[str, Any]:
        limit, offset = max(1, min(limit, 100)), max(0, offset)
        clauses = ["p.status='published'", "v.status='published'"]
        values: list[Any] = []
        if kind in {"skill", "plugin"}:
            clauses.append("p.kind=?")
            values.append(kind)
        if query.strip():
            clauses.append("(p.name LIKE ? OR p.description LIKE ? OR p.slug LIKE ?)")
            q = f"%{query.strip()[:100]}%"
            values.extend([q, q, q])
        if tag:
            clauses.append("p.tags LIKE ?")
            values.append(f'%"{tag[:80]}"%')
        ordering = {"recent": "p.updated_at DESC", "name": "p.name COLLATE NOCASE", "popular": "downloads DESC, p.updated_at DESC"}.get(sort, "downloads DESC, p.updated_at DESC")
        where = " AND ".join(clauses)
        with self._connect() as db:
            total = db.execute(f"SELECT COUNT(DISTINCT p.id) FROM packages p JOIN versions v ON v.package_id=p.id WHERE {where}", values).fetchone()[0]
            rows = db.execute(f"""SELECT p.id,p.kind,p.slug,p.name,p.description,p.publisher,p.tags,p.updated_at,
                v.version,v.digest,v.size,v.scan,COUNT(e.id) AS downloads
                FROM packages p JOIN versions v ON v.package_id=p.id AND v.status='published'
                    AND v.created_at=(SELECT MAX(v2.created_at) FROM versions v2 WHERE v2.package_id=p.id AND v2.status='published')
                LEFT JOIN hub_events e ON e.version_id=v.id AND e.event='package.downloaded'
                WHERE {where} GROUP BY v.id ORDER BY {ordering} LIMIT ? OFFSET ?""", (*values, limit, offset)).fetchall()
        packages = [self._public_package(row) for row in rows]
        return {"packages": packages, "count": total, "limit": limit, "offset": offset}

    def get_package(self, kind: str, slug: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("""SELECT p.*,v.version,v.digest,v.size,v.scan,v.created_at AS version_created_at,
                (SELECT COUNT(*) FROM hub_events e WHERE e.version_id=v.id AND e.event='package.downloaded') AS downloads
                FROM packages p JOIN versions v ON v.package_id=p.id
                WHERE p.kind=? AND p.slug=? AND p.status='published' AND v.status='published'
                ORDER BY v.created_at DESC LIMIT 1""", (kind, slug)).fetchone()
        return self._public_package(row) if row else None

    def versions(self, kind: str, slug: str) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("""SELECT v.version,v.digest,v.size,v.status,v.changelog,v.created_at
                FROM versions v JOIN packages p ON p.id=v.package_id
                WHERE p.kind=? AND p.slug=? AND p.status='published' AND v.status='published'
                ORDER BY v.created_at DESC""", (kind, slug)).fetchall()
        return [dict(row) for row in rows]

    def download(self, kind: str, slug: str, version: str | None = None) -> dict[str, Any] | None:
        with self._connect() as db:
            package = db.execute("SELECT * FROM packages WHERE kind=? AND slug=? AND status='published'", (kind, slug)).fetchone()
            if not package:
                return None
            row = db.execute("SELECT * FROM versions WHERE package_id=? AND status='published' AND (? IS NULL OR version=?) ORDER BY created_at DESC LIMIT 1",
                             (package["id"], version, version)).fetchone()
            if not row:
                return None
            digest = hashlib.sha256(row["artifact"]).hexdigest()
            if digest != row["digest"]:
                raise RuntimeError("Stored Hub artifact failed its SHA-256 integrity check")
            db.execute("INSERT INTO hub_events(package_id,version_id,event,actor,detail,created_at) VALUES(?,?,'package.downloaded','anonymous','{}',?)",
                       (package["id"], row["id"], time.time()))
            return {"kind": kind, "slug": slug, "version": row["version"], "digest": digest,
                    "artifact": bytes(row["artifact"]), "rootPrefix": row["root_prefix"], "size": row["size"]}

    def moderation_queue(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("""SELECT p.id AS packageId,p.kind,p.slug,p.name,p.publisher,v.version,v.digest,v.size,v.scan,v.created_at
                FROM packages p JOIN versions v ON p.id=v.package_id
                WHERE v.status='pending' ORDER BY v.created_at LIMIT ?""", (max(1, min(limit, 500)),)).fetchall()
        return [{**dict(row), "scan": json.loads(row["scan"])} for row in rows]

    def moderate(self, package_id: str, version: str, decision: Literal["publish", "reject", "yank"], moderator: str, note: str = "") -> dict[str, Any]:
        status = {"publish": "published", "reject": "rejected", "yank": "yanked"}[decision]
        now = time.time()
        with self._connect() as db:
            row = db.execute("SELECT id FROM versions WHERE package_id=? AND version=?", (package_id, version)).fetchone()
            if not row:
                raise ValueError("Hub package version not found")
            db.execute("UPDATE versions SET status=? WHERE id=?", (status, row["id"]))
            published = db.execute("SELECT 1 FROM versions WHERE package_id=? AND status='published' LIMIT 1", (package_id,)).fetchone()
            db.execute("UPDATE packages SET status=?,updated_at=? WHERE id=?", ("published" if published else "pending", now, package_id))
            db.execute("INSERT INTO hub_events(package_id,version_id,event,actor,detail,created_at) VALUES(?,?,?,?,?,?)",
                       (package_id, row["id"], f"package.{decision}", moderator, json.dumps({"note": note[:2000]}), now))
        return {"packageId": package_id, "version": version, "status": status}

    def _public_package(self, row: sqlite3.Row) -> dict[str, Any]:
        return {"id": row["id"], "kind": row["kind"], "slug": row["slug"], "name": row["name"],
                "description": row["description"], "publisher": row["publisher"], "tags": json.loads(row["tags"]),
                "version": row["version"], "sha256": row["digest"], "size": row["size"],
                "scan": json.loads(row["scan"]), "downloads": row["downloads"]}


def _inspect_archive(kind: PackageKind, version: str, artifact: bytes) -> tuple[str, list[dict[str, str]]]:
    if not artifact:
        raise ValueError("Package archive is empty")
    findings: list[dict[str, str]] = []
    try:
        archive = zipfile.ZipFile(BytesIO(artifact))
    except zipfile.BadZipFile as exc:
        raise ValueError("Package artifact must be a valid ZIP archive") from exc
    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_FILES:
            raise ValueError("Package contains too many files")
        expanded_size = 0
        safe_names = []
        seen_names: set[str] = set()
        for info in infos:
            name = info.filename.replace("\\", "/")
            raw_parts = name.rstrip("/").split("/")
            path = PurePosixPath(name)
            mode = info.external_attr >> 16
            file_type = mode & 0o170000
            if path.is_absolute() or any(part in {"", ".", ".."} for part in raw_parts) or file_type not in {0, 0o100000, 0o040000}:
                raise ValueError(f"Unsafe archive path: {info.filename}")
            if ":" in path.parts[0]:
                raise ValueError(f"Unsafe archive path: {info.filename}")
            normalized = name.rstrip("/")
            if not normalized or normalized.casefold() in seen_names:
                raise ValueError(f"Duplicate or empty archive path: {info.filename}")
            seen_names.add(normalized.casefold())
            expanded_size += info.file_size
            if info.file_size > MAX_EXPANDED_BYTES or expanded_size > MAX_EXPANDED_BYTES:
                raise ValueError("Expanded package exceeds 50 MB")
            safe_names.append(normalized)
        manifest_name = "amigo.plugin.json" if kind == "plugin" else "SKILL.md"
        candidates = [name for name in safe_names if name == manifest_name or name.endswith("/" + manifest_name)]
        if len(candidates) != 1:
            raise ValueError(f"Package must contain exactly one {manifest_name}")
        root_prefix = candidates[0][:-len(manifest_name)].rstrip("/")
        prefix = f"{root_prefix}/" if root_prefix else ""
        if any(name and root_prefix and name != root_prefix and not name.startswith(prefix) for name in safe_names):
            raise ValueError("All package files must be inside one package root")
        if kind == "plugin":
            try:
                raw_manifest = archive.read(candidates[0])
            except (OSError, RuntimeError, zipfile.BadZipFile, KeyError) as exc:
                raise ValueError("Plugin manifest could not be read from the archive") from exc
            manifest = PluginManifest.model_validate_json(raw_manifest)
            if manifest.version != version:
                raise ValueError("Plugin manifest version must match the published version")
            if manifest.entrypoint:
                entry = PurePosixPath(manifest.entrypoint)
                if entry.is_absolute() or any(part in {"", ".", ".."} for part in entry.parts):
                    raise ValueError("Plugin entrypoint must stay within the package")
                entrypoint = str(PurePosixPath(root_prefix) / entry)
                if entrypoint not in safe_names or entrypoint == root_prefix:
                    raise ValueError("Plugin entrypoint is missing from the package")
            if manifest.permissions:
                findings.append({"severity": "review", "message": "Plugin declares permissions and requires moderator review"})
            from jsonschema import Draft202012Validator
            try:
                Draft202012Validator.check_schema(manifest.configSchema)
            except Exception as exc:
                raise ValueError("Plugin configSchema is not a valid JSON Schema") from exc
        else:
            try:
                content = archive.read(candidates[0]).decode("utf-8")
            except (OSError, RuntimeError, zipfile.BadZipFile, KeyError, UnicodeDecodeError) as exc:
                raise ValueError("Skill SKILL.md must be readable UTF-8 text") from exc
            if not content.strip():
                raise ValueError("SKILL.md cannot be empty")
            if re.search(r"(?i)ignore (all|any|previous) (rules|instructions)|reveal (the )?(system prompt|secrets)", content):
                findings.append({"severity": "review", "message": "Skill content contains prompt-injection-like instructions"})
    return root_prefix, findings
