"""MCP stdio client and Talos server method surface."""
import asyncio
import json
from typing import Any


class MCPStdioClient:
    def __init__(self, command: list[str], env: dict[str, str] | None = None):
        self.command, self.env = command, env
        self.process: asyncio.subprocess.Process | None = None
        self.counter = 0
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        from .process_env import restricted_environment
        self.process = await asyncio.create_subprocess_exec(*self.command, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, env=restricted_environment(self.env))
        await self.request("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "talos", "version": "0.1.0"}})
        await self.notify("notifications/initialized", {})

    async def request(self, method: str, params: dict[str, Any]) -> Any:
        if not self.process or not self.process.stdin or not self.process.stdout:
            raise RuntimeError("MCP client is not started")
        async with self._lock:
            self.counter += 1
            request_id = self.counter
            self.process.stdin.write((json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}) + "\n").encode())
            await self.process.stdin.drain()
            while True:
                line = await asyncio.wait_for(self.process.stdout.readline(), timeout=30)
                if not line:
                    raise RuntimeError("MCP server closed stdout")
                response = json.loads(line)
                if response.get("id") == request_id:
                    if response.get("error"):
                        raise RuntimeError(response["error"].get("message", "MCP error"))
                    return response.get("result")

    async def notify(self, method: str, params: dict[str, Any]) -> None:
        if self.process and self.process.stdin:
            self.process.stdin.write((json.dumps({"jsonrpc": "2.0", "method": method, "params": params}) + "\n").encode())
            await self.process.stdin.drain()

    async def close(self) -> None:
        if self.process and self.process.returncode is None:
            self.process.terminate()
            await self.process.wait()


def mcp_tools_response(tools: list[dict[str, Any]]) -> dict[str, Any]:
    return {"tools": [{"name": item["name"], "description": item.get("description", ""), "inputSchema": item.get("inputSchema", {"type": "object"})} for item in tools]}


async def mcp_server_response(request: dict[str, Any], registry: Any, store: Any, policy: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params", {})
    try:
        if method == "initialize":
            result = {"protocolVersion": params.get("protocolVersion", "2025-03-26"), "capabilities": {"tools": {"listChanged": False}}, "serverInfo": {"name": "talos", "version": "0.1.0"}}
        elif method == "tools/list":
            result = mcp_tools_response(registry.list())
        elif method == "tools/call":
            outcome = await registry.invoke(params["name"], params.get("arguments", {}), policy, store)
            result = {"content": [{"type": "text", "text": json.dumps(outcome)}], "isError": outcome.get("status") != "ok"}
        elif method == "ping":
            result = {}
        else:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}}
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": str(exc)}}
