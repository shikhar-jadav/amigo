"""Gateway process state, sanitized diagnostics, and configuration migrations."""
import json
import os
import re
import time
from pathlib import Path
from typing import Any


class GatewayLock:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "gateway.pid"

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            try:
                pid = int(self.path.read_text("utf-8").strip())
                os.kill(pid, 0)
            except (ValueError, OSError):
                self.path.unlink(missing_ok=True)
            else:
                raise RuntimeError(f"Gateway already appears to run as pid {pid}")
        self.path.write_text(str(os.getpid()), encoding="utf-8")

    def release(self) -> None:
        try:
            if int(self.path.read_text("utf-8").strip()) == os.getpid():
                self.path.unlink(missing_ok=True)
        except (OSError, ValueError):
            pass


def migrate_config(data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    result = dict(data)
    migrations = []
    legacy = {"port": ("gateway", "port"), "gatewayToken": ("gateway", "auth", "token"), "model": ("agents", "defaults", "model")}
    for key, path in legacy.items():
        if key not in result:
            continue
        value = result.pop(key)
        node = result
        for part in path[:-1]:
            node = node.setdefault(part, {})
        node.setdefault(path[-1], value)
        migrations.append(f"{key} -> {'.'.join(path)}")
    return result, migrations


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[REDACTED]" if re.search(r"token|secret|password|api.?key|authorization", key, re.I) else sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        return re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._-]+", r"\1[REDACTED]", value)
    return value


def export_diagnostics(state_dir: Path, destination: Path, config: dict[str, Any], checks: list[dict[str, Any]]) -> dict[str, Any]:
    payload = {"createdAt": time.time(), "config": sanitize(config), "checks": checks, "stateFiles": sorted(path.name for path in state_dir.iterdir() if path.is_file())}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"path": str(destination), "files": len(payload["stateFiles"]), "sanitized": True}
