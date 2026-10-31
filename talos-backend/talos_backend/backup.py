"""Database backup with integrity manifest and transactional restore."""
import hashlib
import json
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any


def create_backup(database: Path, destination: Path) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as source, sqlite3.connect(destination) as target:
        source.backup(target)
        integrity = target.execute("PRAGMA integrity_check").fetchone()[0]
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    manifest = {"createdAt": time.time(), "database": destination.name, "sha256": digest, "integrity": integrity}
    destination.with_suffix(destination.suffix + ".json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def verify_backup(backup: Path) -> dict[str, Any]:
    manifest_path = backup.with_suffix(backup.suffix + ".json")
    manifest = json.loads(manifest_path.read_text("utf-8")) if manifest_path.exists() else None
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    with sqlite3.connect(backup) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
    return {"ok": integrity == "ok" and (manifest is None or manifest.get("sha256") == digest), "integrity": integrity, "sha256": digest, "manifest": manifest}


def restore_backup(backup: Path, database: Path) -> dict[str, Any]:
    verification = verify_backup(backup)
    if not verification["ok"]:
        raise ValueError("Backup failed integrity or hash verification")
    staging = database.with_suffix(database.suffix + ".restore.tmp")
    shutil.copy2(backup, staging)
    with sqlite3.connect(staging) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            staging.unlink(missing_ok=True)
            raise ValueError("Staged restore failed SQLite integrity check")
    staging.replace(database)
    return {"restored": True, "path": str(database), "sha256": verification["sha256"]}
