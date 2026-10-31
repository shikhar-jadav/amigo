import json
import shutil
import subprocess
import sys
import asyncio
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PluginManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")
    name: str | None = None
    version: str
    description: str = ""
    kind: str
    entrypoint: str | None = None
    permissions: list[str] = Field(default_factory=list)
    trustTier: str = "community"
    configSchema: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "additionalProperties": False})
    contracts: dict[str, list[str]] = Field(default_factory=dict)
    hooks: dict[str, str] = Field(default_factory=dict)
    hookPriority: dict[str, int] = Field(default_factory=dict)
    runtime: str = "process"
    enabledByDefault: bool = False


def discover_plugins(directory: Path) -> list[dict[str, Any]]:
    found = []
    if not directory.exists():
        return found
    for manifest in sorted(directory.glob("*/amigo.plugin.json")):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        found.append({**PluginManifest.model_validate(data).model_dump(), "enabled": True, "path": str(manifest.parent)})
    return found


class PluginRegistry:
    """Manifest-only registry. Community plugin code is never imported by the gateway."""

    def __init__(self, directory: Path, settings: dict[str, Any] | None = None):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.state_file = directory / "registry.json"
        self.state = json.loads(self.state_file.read_text("utf-8")) if self.state_file.exists() else {"disabled": [], "enabled": []}
        self.hooks: dict[str, list[Any]] = {}
        self.settings = settings or {}

    def _refresh_state(self) -> None:
        self.state = json.loads(self.state_file.read_text("utf-8")) if self.state_file.exists() else {"disabled": [], "enabled": []}

    def list(self) -> list[dict[str, Any]]:
        self._refresh_state()
        disabled = set(self.state.get("disabled", []))
        explicitly_enabled = set(self.state.get("enabled", []))
        return [{**item, "enabled": item["id"] not in disabled and (item["id"] in explicitly_enabled or item.get("enabledByDefault", False))} for item in discover_plugins(self.directory)]

    def reload(self) -> Any:
        return self.list()

    def install(self, source: Path) -> dict[str, Any]:
        manifest_path = source / "amigo.plugin.json" if source.is_dir() else source
        data = PluginManifest.model_validate_json(manifest_path.read_text("utf-8"))
        from jsonschema import Draft202012Validator
        Draft202012Validator.check_schema(data.configSchema)
        target = self.directory / data.id
        source_dir = manifest_path.parent.resolve()
        if source_dir != target.resolve():
            if target.exists():
                raise FileExistsError(f"Plugin is already installed: {data.id}")
            target.mkdir(parents=True, exist_ok=False)
            for item in source_dir.iterdir():
                if item.is_symlink():
                    raise ValueError("Plugin packages may not contain symlinks")
                destination = target / item.name
                if item.is_dir():
                    shutil.copytree(item, destination, symlinks=False)
                elif item.is_file():
                    shutil.copy2(item, destination)
        return next(item for item in self.list() if item["id"] == data.id)

    def uninstall(self, plugin_id: str) -> bool:
        target = self.directory / plugin_id
        if not target.resolve().parent == self.directory.resolve():
            raise ValueError("Invalid plugin id")
        if not target.exists():
            return False
        shutil.rmtree(target)
        return True

    def init(self, plugin_id: str, name: str | None = None) -> Path:
        if not plugin_id or not all(char.isalnum() or char in "-_" for char in plugin_id):
            raise ValueError("Plugin id contains invalid characters")
        target = self.directory / plugin_id
        target.mkdir(parents=True, exist_ok=True)
        manifest = {"id": plugin_id, "name": name or plugin_id, "version": "0.1.0", "kind": "tool", "runtime": "process", "entrypoint": "plugin.py", "contracts": {}, "permissions": []}
        (target / "amigo.plugin.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (target / "plugin.py").write_text("import json, sys\nrequest=json.loads(sys.stdin.readline())\nprint(json.dumps({'ok': True, 'method': request['method']}))\n", encoding="utf-8")
        return target

    def set_enabled(self, plugin_id: str, enabled: bool) -> dict[str, Any]:
        if not any(item["id"] == plugin_id for item in self.list()):
            raise ValueError("Plugin is not installed")
        disabled = set(self.state.get("disabled", []))
        explicitly_enabled = set(self.state.get("enabled", []))
        if enabled:
            disabled.discard(plugin_id)
            explicitly_enabled.add(plugin_id)
        else:
            explicitly_enabled.discard(plugin_id)
            disabled.add(plugin_id)
        self.state["disabled"] = sorted(disabled)
        self.state["enabled"] = sorted(explicitly_enabled)
        self.state_file.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
        return next(item for item in self.list() if item["id"] == plugin_id)

    def register_hook(self, event: str, callback: Any) -> None:
        self.hooks.setdefault(event, []).append(callback)

    async def emit(self, event: str, payload: dict[str, Any]) -> dict[str, Any]:
        current = dict(payload)
        entries = []
        for index, plugin in enumerate(self.list()):
            if not plugin["enabled"]:
                continue
            manifest = PluginManifest.model_validate_json((Path(plugin["path"]) / "amigo.plugin.json").read_text("utf-8"))
            method = manifest.hooks.get(event)
            if method:
                plugin_cfg = self.settings.get("entries", {}).get(plugin["id"], {})
                hook_cfg = plugin_cfg.get("hooks", {})
                trusted = plugin_cfg.get("trustTier") in {"verified", "bundled"}
                if event in {"before_prompt_build", "llm_input", "llm_output"} and not trusted and not hook_cfg.get("allowPromptInjection", False):
                    continue
                entries.append((manifest.hookPriority.get(event, 0), index, plugin["id"], method))
        for _, _, plugin_id, method in sorted(entries, key=lambda entry: (-entry[0], entry[1])):
            if current.get("block") or current.get("cancel"):
                break
            plugin_cfg = self.settings.get("entries", {}).get(plugin_id, {})
            event_payload = dict(current)
            if not self.settings.get("allowConversationAccess", False) or not plugin_cfg.get("hooks", {}).get("allowConversationAccess", False):
                for key in ("messages", "text", "content", "result", "arguments", "transcript"):
                    event_payload.pop(key, None)
            response = await self.invoke_isolated(plugin_id, method, event_payload)
            if isinstance(response, dict):
                for key, value in response.items():
                    if key in {"block", "cancel"} and current.get(key) is True and value is False:
                        continue
                    current[key] = value
        for callback in self.hooks.get(event, []):
            if current.get("block") or current.get("cancel"):
                break
            result = callback(current)
            if hasattr(result, "__await__"):
                result = await result
            if isinstance(result, dict):
                current = result
        return current

    async def invoke_isolated(self, plugin_id: str, method: str, payload: dict[str, Any], timeout: float = 10) -> dict[str, Any]:
        plugin = next((item for item in self.list() if item["id"] == plugin_id and item["enabled"]), None)
        if not plugin:
            raise ValueError("Plugin is not installed or enabled")
        manifest = PluginManifest.model_validate_json((Path(plugin["path"]) / "amigo.plugin.json").read_text("utf-8"))
        if not manifest.entrypoint:
            raise ValueError("Plugin has no isolated RPC entrypoint")
        entrypoint = (Path(plugin["path"]) / manifest.entrypoint).resolve()
        if Path(plugin["path"]).resolve() not in entrypoint.parents or not entrypoint.is_file():
            raise ValueError("Plugin entrypoint escapes its package or does not exist")
        from .process_env import restricted_environment
        process = await asyncio.create_subprocess_exec(sys.executable, str(entrypoint), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(Path(plugin["path"]).resolve()), env=restricted_environment())
        request = json.dumps({"method": method, "params": payload}).encode() + b"\n"
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(request), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise ValueError("Plugin call timed out")
        if process.returncode != 0:
            raise ValueError(f"Plugin process failed: {stderr.decode(errors='replace')[:500]}")
        try:
            return json.loads(stdout.splitlines()[0])
        except (ValueError, IndexError) as exc:
            raise ValueError("Plugin returned invalid JSON-RPC output") from exc
