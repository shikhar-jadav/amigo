"""Command line client for an AmigoHub HTTP registry."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from .config import state_dir
from .hub import MAX_ARCHIVE_BYTES, _inspect_archive
from .plugins import PluginRegistry
from .skills import install_skill


def _request(url: str, *, token: str | None = None, data: bytes | None = None,
             content_type: str | None = None, extra_headers: dict[str, str] | None = None) -> tuple[bytes, dict[str, str]]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    headers.update(extra_headers or {})
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read(MAX_ARCHIVE_BYTES + 1), {key.lower(): value for key, value in response.headers.items()}
    except urllib.error.HTTPError as exc:
        detail = exc.read(4096).decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("detail", detail)
        except (ValueError, AttributeError):
            pass
        raise RuntimeError(f"AmigoHub returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Cannot reach AmigoHub at {url}: {exc.reason}") from exc


def _multipart(fields: dict[str, str], filename: str, binary: bytes) -> tuple[bytes, str]:
    boundary = "----amigohub-" + os.urandom(16).hex()
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.extend([f"--{boundary}\r\n".encode(),
                       f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
                       value.encode("utf-8"), b"\r\n"])
    chunks.extend([f"--{boundary}\r\n".encode(),
                   f'Content-Disposition: form-data; name="artifact"; filename="{Path(filename).name}"\r\n'.encode(),
                   b"Content-Type: application/zip\r\n\r\n", binary, b"\r\n",
                   f"--{boundary}--\r\n".encode()])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="amigohub", description="Search, publish, moderate, and install AmigoHub packages")
    parser.add_argument("--url", default=os.environ.get("AMIGOHUB_URL", "http://127.0.0.1:18800"), help="AmigoHub gateway base URL")
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="Search published packages")
    search.add_argument("query", nargs="?", default="")
    search.add_argument("--kind", choices=["skill", "plugin"])
    search.add_argument("--tag")
    package = sub.add_parser("package", help="Publish or inspect a package")
    package_sub = package.add_subparsers(dest="package_action", required=True)
    publish = package_sub.add_parser("publish")
    publish.add_argument("kind", choices=["skill", "plugin"])
    publish.add_argument("archive", type=Path)
    publish.add_argument("--slug", required=True)
    publish.add_argument("--name", required=True)
    publish.add_argument("--version", required=True)
    publish.add_argument("--description", default="")
    publish.add_argument("--tags", default="", help="Comma-separated tags")
    publish.add_argument("--changelog", default="")
    publish.add_argument("--publisher", default=os.environ.get("AMIGOHUB_PUBLISHER", ""))
    package_sub.add_parser("queue", help="List packages awaiting moderation")
    moderate = package_sub.add_parser("moderate")
    moderate.add_argument("package_id")
    moderate.add_argument("version")
    moderate.add_argument("decision", choices=["publish", "reject", "yank"])
    moderate.add_argument("--note", default="")
    install = sub.add_parser("install", help="Install a published skill or isolated plugin")
    install.add_argument("kind", choices=["skill", "plugin"])
    install.add_argument("slug")
    install.add_argument("--version")
    install.add_argument("--state-dir", type=Path, default=state_dir())
    install.add_argument("--yes", action="store_true", help="Skip the skill prompt-content confirmation")
    return parser


def _install(args: argparse.Namespace, base_url: str) -> dict[str, Any]:
    suffix = f"?version={urllib.parse.quote(args.version)}" if args.version else ""
    url = f"{base_url}/v1/hub/packages/{args.kind}/{urllib.parse.quote(args.slug, safe='')}/download{suffix}"
    raw, headers = _request(url)
    expected_digest = headers.get("x-content-sha256")
    digest = hashlib.sha256(raw).hexdigest()
    if expected_digest and expected_digest != digest:
        raise RuntimeError("Downloaded artifact failed its SHA-256 integrity check")
    if len(raw) > MAX_ARCHIVE_BYTES:
        raise RuntimeError("Downloaded artifact exceeds 25 MB")
    disposition = headers.get("content-disposition", "")
    filename = re.search(r'filename="([^"]+)"', disposition)
    downloaded_version = args.version
    if filename and filename.group(1).startswith(f"{args.slug}-"):
        downloaded_version = filename.group(1)[len(args.slug) + 1:].removesuffix(".zip") or downloaded_version
    with tempfile.TemporaryDirectory(prefix="amigohub-") as temp:
        extracted = Path(temp) / "package"
        extracted.mkdir()
        archive_version = args.version or "0.0.0"
        if args.kind == "plugin":
            with zipfile.ZipFile(__import__("io").BytesIO(raw)) as archive:
                manifest_names = [item.filename for item in archive.infolist() if item.filename.replace("\\", "/").endswith("amigo.plugin.json")]
                if len(manifest_names) != 1:
                    raise RuntimeError("Plugin archive must contain exactly one amigo.plugin.json")
                archive_version = json.loads(archive.read(manifest_names[0])).get("version", "")
        root_prefix, _ = _inspect_archive(args.kind, archive_version, raw)
        with zipfile.ZipFile(__import__("io").BytesIO(raw)) as archive:
            for info in archive.infolist():
                relative = Path(*info.filename.replace("\\", "/").rstrip("/").split("/"))
                target = extracted / relative
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(info) as source, target.open("wb") as destination:
                        shutil.copyfileobj(source, destination)
        installed_source = extracted / root_prefix if root_prefix else extracted
        if args.kind == "skill":
            manifests = list(extracted.rglob("SKILL.md"))
            if len(manifests) != 1:
                raise RuntimeError("Skill archive must contain exactly one SKILL.md")
            skill_dir = manifests[0].parent
            if not args.yes:
                try:
                    answer = input(f"Install prompt instructions from {args.slug}? Review SKILL.md first [y/N] ")
                except EOFError:
                    answer = ""
                if answer.strip().lower() not in {"y", "yes"}:
                    return {"installed": False, "reason": "confirmation required", "sha256": digest}
            result = install_skill(skill_dir, args.state_dir / "skills", args.slug)
            origin_path = args.state_dir / "skills" / args.slug / ".origin.json"
            origin_path.write_text(json.dumps({"source": f"amigohub://skill/{args.slug}@{downloaded_version or 'latest'}", "sha256": digest}, indent=2), encoding="utf-8")
            return {"installed": True, "kind": "skill", "version": downloaded_version, "package": result, "sha256": digest}
        registry = PluginRegistry(args.state_dir / "plugins")
        result = registry.install(installed_source)
        (Path(result["path"]) / ".origin.json").write_text(json.dumps({"source": f"amigohub://plugin/{args.slug}@{downloaded_version or archive_version}", "sha256": digest}, indent=2), encoding="utf-8")
        return {"installed": True, "kind": "plugin", "version": downloaded_version or archive_version, "package": result, "sha256": digest}


def main() -> None:
    parser = _parser()
    args = parser.parse_args()
    base = args.url.rstrip("/")
    try:
        if args.command == "search":
            query = urllib.parse.urlencode({key: value for key, value in {"query": args.query, "kind": args.kind, "tag": args.tag}.items() if value})
            raw, _ = _request(f"{base}/v1/hub/packages?{query}")
            result = json.loads(raw)
        elif args.command == "install":
            result = _install(args, base)
        elif args.package_action == "publish":
            if not args.publisher:
                raise ValueError("Set AMIGOHUB_PUBLISHER or pass --publisher")
            if args.archive.stat().st_size > MAX_ARCHIVE_BYTES:
                raise ValueError("Package archive exceeds 25 MB")
            fields = {"kind": args.kind, "slug": args.slug, "name": args.name, "version": args.version,
                      "description": args.description, "tags": json.dumps([tag.strip() for tag in args.tags.split(",") if tag.strip()]),
                      "changelog": args.changelog}
            data, content_type = _multipart(fields, args.archive.name, args.archive.read_bytes())
            raw, _ = _request(f"{base}/v1/hub/packages", token=os.environ.get("AMIGOHUB_PUBLISH_TOKEN"), data=data,
                              content_type=content_type, extra_headers={"X-Amigo-Publisher": args.publisher})
            result = json.loads(raw)
        elif args.package_action == "queue":
            raw, _ = _request(f"{base}/v1/hub/moderation/queue", token=os.environ.get("AMIGOHUB_MODERATOR_TOKEN"))
            result = json.loads(raw)
        else:
            data = json.dumps({"decision": args.decision, "note": args.note}).encode()
            raw, _ = _request(f"{base}/v1/hub/moderation/{urllib.parse.quote(args.package_id)}/{urllib.parse.quote(args.version)}",
                              token=os.environ.get("AMIGOHUB_MODERATOR_TOKEN"), data=data, content_type="application/json")
            result = json.loads(raw)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": {"type": "cli_error", "message": str(exc)}}), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
