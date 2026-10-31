"""Built-in tool registry and policy gate."""
import asyncio
from pathlib import Path
from typing import Any, Callable
from pydantic import TypeAdapter, ValidationError


class ToolRegistry:
    def __init__(self):
        self.handlers: dict[str, tuple[dict[str, Any], Callable[..., Any], bool]] = {}

    def register(self, name: str, schema: dict[str, Any], handler: Callable[..., Any], *, dangerous: bool = False) -> None:
        self.handlers[name] = (schema, handler, dangerous)

    def list(self) -> list[dict[str, Any]]:
        return [{"name": name, "inputSchema": item[0], "dangerous": item[2]} for name, item in sorted(self.handlers.items())]

    async def invoke(self, name: str, args: dict[str, Any], policy: dict[str, Any], store: Any, context: dict[str, Any] | None = None) -> dict[str, Any]:
        if name not in self.handlers:
            raise ValueError(f"Unknown tool: {name}")
        schema, handler, dangerous = self.handlers[name]
        try:
            validated_args = TypeAdapter(dict[str, Any]).validate_python(args)
            _validate_schema(schema, validated_args)
        except (ValidationError, ValueError) as exc:
            raise ValueError(f"Invalid arguments for {name}: {exc}") from exc
        allow = set(policy.get("allow", []))
        deny = set(policy.get("deny", []))
        if name in deny or (allow and name not in allow):
            raise PermissionError(f"Tool denied by policy: {name}")
        security = policy.get("exec", {}).get("security", "deny")
        ask = policy.get("exec", {}).get("ask", "always")
        if dangerous and security == "deny":
            return {"status": "denied", "reason": "Dangerous tools are disabled by policy"}
        if dangerous and ask == "always":
            approval = store.create_approval(name, {"_talosApproval": True, "arguments": args, "executionContext": context})
            return {"status": "approval_required", "approval": approval}
        if dangerous and ask == "on-miss" and name not in allow:
            approval = store.create_approval(name, {"_talosApproval": True, "arguments": args, "executionContext": context})
            return {"status": "approval_required", "approval": approval}
        result = handler(**validated_args, context=context) if name == "exec" else handler(**validated_args)
        if hasattr(result, "__await__"):
            result = await result
        store.audit("tool.invoked", {"tool": name, "arguments": _redact(args)})
        return {"status": "ok", "result": result}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[redacted]" if any(term in key.lower() for term in ("token", "secret", "password", "key")) else _redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _validate_schema(schema: dict[str, Any], value: Any, path: str = "arguments") -> None:
    expected = schema.get("type")
    type_map = {"object": dict, "array": list, "string": str, "integer": int, "number": (int, float), "boolean": bool}
    if expected in type_map and (not isinstance(value, type_map[expected]) or expected == "integer" and isinstance(value, bool)):
        raise ValueError(f"{path} must be {expected}")
    if expected == "object":
        props = schema.get("properties", {})
        missing = set(schema.get("required", [])) - value.keys()
        if missing:
            raise ValueError(f"{path} missing required keys: {sorted(missing)}")
        if schema.get("additionalProperties") is False:
            unknown = value.keys() - props.keys()
            if unknown:
                raise ValueError(f"{path} has unknown keys: {sorted(unknown)}")
        for key, item in value.items():
            if key in props:
                _validate_schema(props[key], item, f"{path}.{key}")


def default_tools(workspace: Path | None = None, store: Any = None) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register("memory.search", {"type": "object", "properties": {"query": {"type": "string"}, "scope": {"type": "string"}, "limit": {"type": "integer"}}}, lambda query, scope="default", limit=20: store.search_memory(query, scope, max(1, min(limit, 100))) if store else [])
    workspace_root = (workspace or Path.cwd()).resolve()

    def resolve_workspace_path(path: str) -> Path:
        target = (workspace_root / path).resolve()
        if target != workspace_root and workspace_root not in target.parents:
            raise PermissionError("Workspace path escapes the configured workspace")
        return target

    def list_workspace(path: str = ".") -> list[str]:
        target = resolve_workspace_path(path)
        if not target.is_dir():
            raise ValueError("Workspace path is not a directory")
        return sorted(item.name for item in target.iterdir())

    def read_workspace(path: str) -> str:
        target = resolve_workspace_path(path)
        if not target.is_file():
            raise ValueError("Workspace file does not exist")
        if target.stat().st_size > 1_000_000:
            raise ValueError("Workspace file exceeds the 1 MB read limit")
        return target.read_text(encoding="utf-8")

    def write_workspace(path: str, content: str) -> dict[str, Any]:
        target = resolve_workspace_path(path)
        if len(content.encode("utf-8")) > 1_000_000:
            raise ValueError("Workspace content exceeds the 1 MB write limit")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {"path": str(target.relative_to(workspace_root)), "bytes": len(content.encode("utf-8"))}

    registry.register("workspace.list", {"type": "object", "properties": {"path": {"type": "string"}}}, list_workspace)
    registry.register("workspace.read", {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}, read_workspace)
    registry.register("workspace.write", {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}, write_workspace, dangerous=True)
    registry.register("exec", {"type": "object", "properties": {"command": {"type": "string"}}}, _exec, dangerous=True)
    return registry


async def _exec(command: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    import asyncio
    import shlex
    from .process_env import restricted_environment
    if context and context.get("sandbox", {}).get("enabled"):
        from .sandbox import run_command
        sandbox = context["sandbox"]
        return await run_command(command, cwd=Path(context["workspace"]) if context.get("workspace") else None, workspace_access=sandbox.get("workspaceAccess", "none"), backend=sandbox.get("backend", "docker"), image=sandbox.get("image", "python:3.12-slim"), timeout=30)
    args = shlex.split(command, posix=False)
    if not args:
        raise ValueError("Command cannot be empty")
    process = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=restricted_environment())
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError("Command timed out")
    max_bytes = 1_000_000
    return {"returnCode": process.returncode, "stdout": stdout[:max_bytes].decode(errors="replace"), "stderr": stderr[:max_bytes].decode(errors="replace"), "truncated": len(stdout) > max_bytes or len(stderr) > max_bytes}
