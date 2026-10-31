"""Explicit sandbox policy and safe subprocess execution backend."""
import asyncio
import tempfile
from pathlib import Path
from typing import Any


class SandboxPolicy:
    def __init__(self, mode: str = "off", scope: str = "agent", workspace_access: str = "none", workspace: Path | None = None, backend: str = "docker", image: str = "python:3.12-slim"):
        if mode not in {"off", "non-main", "all"}:
            raise ValueError("Sandbox mode must be off, non-main, or all")
        if scope not in {"agent", "session", "shared"}:
            raise ValueError("Sandbox scope must be agent, session, or shared")
        if workspace_access not in {"none", "ro", "rw"}:
            raise ValueError("Workspace access must be none, ro, or rw")
        if backend not in {"docker", "subprocess", "ssh"}:
            raise ValueError("Sandbox backend must be docker, subprocess, or ssh")
        self.mode, self.scope, self.workspace_access, self.workspace = mode, scope, workspace_access, workspace
        self.backend, self.image = backend, image

    def enabled_for(self, session_key: str) -> bool:
        is_main = session_key in {"main", "agent:main:main"} or (session_key.startswith("agent:") and session_key.endswith(":main"))
        return self.mode == "all" or (self.mode == "non-main" and not is_main)

    def workspace_for(self, session_key: str) -> Path:
        if not self.enabled_for(session_key):
            return self.workspace or Path.cwd()
        if self.scope == "shared":
            key = "shared"
        elif self.scope == "agent":
            parts = session_key.split(":")
            key = parts[1] if len(parts) > 1 and parts[0] == "agent" else parts[0]
        else:
            key = session_key.replace(":", "_")
        base = Path(tempfile.gettempdir()) / "talos-sandbox" / key
        base.resolve().relative_to(Path(tempfile.gettempdir()).resolve())
        base.mkdir(parents=True, exist_ok=True)
        return base


async def run_command(command: str, *, cwd: Path | None = None, workspace_access: str = "none", backend: str = "docker", image: str = "python:3.12-slim", timeout: float = 30) -> dict[str, Any]:
    if backend != "docker":
        raise RuntimeError(f"Sandbox backend {backend!r} does not provide an enforced container boundary")
    args = ["docker", "run", "--rm", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--pids-limit=128", "--memory=512m", "--cpus=1", "--user=65534:65534", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"]
    if cwd and workspace_access != "none":
        path = cwd.resolve()
        access = ":ro" if workspace_access == "ro" else ":rw"
        args.extend(["--volume", f"{path.as_posix()}:/workspace{access}", "--workdir", "/workspace"])
    else:
        args.extend(["--workdir", "/tmp"])
    args.extend([image, "sh", "-lc", command])
    from .process_env import restricted_environment
    process = await asyncio.create_subprocess_exec(*args, env=restricted_environment(), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError("Command timed out")
    max_bytes = 1_000_000
    return {"returnCode": process.returncode, "stdout": stdout[:max_bytes].decode(errors="replace"), "stderr": stderr[:max_bytes].decode(errors="replace"), "truncated": len(stdout) > max_bytes or len(stderr) > max_bytes}
