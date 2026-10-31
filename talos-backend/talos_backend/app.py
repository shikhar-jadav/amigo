import asyncio
import json
import os
import secrets
import time
import base64
import hashlib
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from . import __version__
from .config import TalosConfig, config_path, load_config, state_dir
from .channels import ChannelRegistry, InboundMessage, TelegramAdapter, peer_allowed, route_agent
from .plugins import PluginRegistry, discover_plugins
from .protocol import ConnectFrame, RequestFrame
from .runtime import AgentRuntime
from .scheduler import CronScheduler, HeartbeatScheduler, parse_run_at, validate_interval, validate_timezone
from .skills import discover_skills, eligible_skills, install_skill, skill_card
from .storage import Store
from .tools import default_tools
from .browser import cdp_json, validate_browser_url
from .mcp import MCPStdioClient, mcp_server_response
from .operations import migrate_config, export_diagnostics
from .hub import HubRegistry, MAX_ARCHIVE_BYTES


A2A_MAX_REQUEST_BYTES = 1024 * 1024


def _a2a_task(store: Store, run_id: str, history_length: int = 50) -> dict[str, Any] | None:
    run = store.get_run(run_id)
    if not run:
        return None
    session = store.get_session(str(run["session_id"]))
    if not session:
        return None
    session_key = str(session["session_key"])
    context_id = session_key.split(":", 2)[2] if session_key.startswith("a2a:") and session_key.count(":") >= 2 else session_key
    state = {
        "queued": "submitted",
        "running": "working",
        "ok": "completed",
        "error": "failed",
        "aborted": "canceled",
    }.get(str(run["status"]), "failed")
    task: dict[str, Any] = {
        "id": run_id,
        "contextId": context_id,
        "status": {
            "state": state,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(run["updated_at"]))),
        },
    }
    if history_length > 0:
        history = []
        for item in store.history(session["id"], max(1, min(history_length, 100))):
            if item["role"] not in {"user", "assistant"} or str(item["content"]).startswith("[Tool result:"):
                continue
            history.append({
                "messageId": str(item["id"]),
                "role": "agent" if item["role"] == "assistant" else "user",
                "parts": [{"kind": "text", "text": item["content"]}],
                "contextId": context_id,
            })
        task["history"] = history
    if state == "completed" and run["result"]:
        result = json.loads(run["result"])
        reply = result.get("reply") if isinstance(result, dict) else None
        if isinstance(reply, str):
            task["artifacts"] = [{
                "artifactId": "reply",
                "name": "Agent reply",
                "parts": [{"kind": "text", "text": reply}],
            }]
    return task


def create_app(state_path: Path | None = None) -> FastAPI:
    in_memory = state_path is not None and str(state_path) == ":memory:"
    root = state_path or state_dir()
    if not in_memory:
        root.mkdir(parents=True, exist_ok=True)
    config = load_config(config_path(root)) if not in_memory else TalosConfig()
    store = Store(Path(":memory:") if in_memory else root / "talos.sqlite3")
    hub = None if in_memory else HubRegistry(root / "amigohub.sqlite3")
    runtime_workspace = config.agents.defaults.workspace or (str(root / "workspace") if not in_memory else None)
    runtime = AgentRuntime(store, config.gateway.maxConcurrentRuns, config.agents.defaults.timeoutSeconds, config.model_dump(by_alias=True), runtime_workspace)
    plugin_settings = {"entries": config.plugins.get("entries", {}), "allowConversationAccess": config.hooks.get("allowConversationAccess", False)}
    plugin_registry = PluginRegistry(root / "plugins", plugin_settings) if not in_memory else None
    channels = ChannelRegistry(plugin_registry)
    telegram_config = config.channels.get("telegram", {})
    telegram_token_env = str(telegram_config.get("botTokenEnv", "TELEGRAM_BOT_TOKEN"))
    telegram_token = os.environ.get(telegram_token_env)
    if telegram_config.get("enabled", True) and telegram_token:
        channels.register(TelegramAdapter(telegram_token, str(telegram_config.get("apiBase", "https://api.telegram.org"))))
    tool_registry = default_tools(root / "workspace", store)
    runtime.tools = tool_registry
    runtime.plugins = plugin_registry
    mcp_clients: dict[str, MCPStdioClient] = {}
    idempotency_lock = asyncio.Lock()
    auth_attempts: dict[str, list[float]] = {}
    delivery_tasks: set[asyncio.Task[Any]] = set()
    node_senders: dict[str, Any] = {}
    node_waiters: dict[str, tuple[str, asyncio.Future[Any]]] = {}

    async def send_node_command(device_id: str, command: str, arguments: dict[str, Any], timeout: float = 30) -> dict[str, Any]:
        sender = node_senders.get(device_id)
        if not sender:
            raise RuntimeError("Paired node is not connected")
        request_id = secrets.token_urlsafe(18)
        future = asyncio.get_running_loop().create_future()
        node_waiters[request_id] = (device_id, future)
        try:
            await sender({"type": "event", "event": "node.command", "payload": {"requestId": request_id, "deviceId": device_id, "command": command, "arguments": arguments}})
            return await asyncio.wait_for(future, timeout=max(1, min(timeout, 300)))
        finally:
            node_waiters.pop(request_id, None)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if not in_memory:
            root.mkdir(parents=True, exist_ok=True)
        scheduler = CronScheduler(store, lambda job: _run_cron_job(job, store, runtime, channels, delivery_tasks))
        heartbeat = HeartbeatScheduler(store, lambda: _run_heartbeat(store, runtime))
        for server_id, server in config.mcp.get("servers", {}).items():
            command = server.get("command")
            if command:
                client = MCPStdioClient([str(command), *[str(arg) for arg in server.get("args", [])]], server.get("env"))
                try:
                    await client.start()
                    mcp_clients[server_id] = client
                    listing = await client.request("tools/list", {})
                    for item in listing.get("tools", []):
                        async def call_mcp(arguments: dict[str, Any], _server=client, _name=item["name"]):
                            return await _server.request("tools/call", {"name": _name, "arguments": arguments})
                        tool_registry.register(f"{server_id}.{item['name']}", item.get("inputSchema", {"type": "object"}), call_mcp)
                except Exception:
                    await client.close()
        await scheduler.start()
        await heartbeat.start()
        app.state.scheduler = scheduler
        app.state.heartbeat = heartbeat
        yield
        await scheduler.stop()
        await heartbeat.stop()
        await asyncio.gather(*(client.close() for client in mcp_clients.values()), return_exceptions=True)
        for task in runtime.tasks.values():
            if not task.done():
                task.cancel()
        for task in delivery_tasks:
            if not task.done():
                task.cancel()
        if delivery_tasks:
            await asyncio.gather(*delivery_tasks, return_exceptions=True)

    app = FastAPI(title="Talos Gateway", version=__version__, lifespan=lifespan)
    app.state.store = store
    app.state.hub = hub
    app.state.runtime = runtime
    app.state.config = config
    app.state.plugin_registry = plugin_registry
    app.state.channels = channels
    app.state.tools = tool_registry

    @app.middleware("http")
    async def protect_http_auth_rate(request: Request, call_next):
        if request.url.path == "/v1/hub/packages" and request.method == "POST":
            try:
                content_length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
            if content_length > MAX_ARCHIVE_BYTES + 512 * 1024:
                return JSONResponse(status_code=413, content={"detail": "Package request exceeds the 25 MB artifact limit"})
            try:
                hub_auth(request.headers.get("authorization", "").removeprefix("Bearer "))
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        elif request.url.path == "/v1/hub/moderation/queue" or request.url.path.startswith("/v1/hub/moderation/") and request.method == "POST":
            try:
                hub_auth(request.headers.get("authorization", "").removeprefix("Bearer "), moderator=True)
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        if request.url.path not in {"/", "/health", "/ready", "/metrics"}:
            identity = request.client.host if request.client else "unknown"
            try:
                rate_limit(identity)
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)

    def auth(token: str | None) -> None:
        expected = config.gateway.auth.token
        if config.gateway.auth.mode == "none":
            return
        if not expected:
            raise HTTPException(status_code=503, detail="Gateway token is not configured; set TALOS_GATEWAY_TOKEN")
        if not token or not secrets.compare_digest(token, expected):
            raise HTTPException(status_code=401, detail="Unauthorized")

    def hub_auth(token: str | None, *, moderator: bool = False) -> None:
        env_name = "AMIGOHUB_MODERATOR_TOKEN" if moderator else "AMIGOHUB_PUBLISH_TOKEN"
        expected = os.environ.get(env_name)
        if not expected:
            raise HTTPException(status_code=503, detail=f"Set {env_name} to enable Hub writes")
        if not token or not secrets.compare_digest(token, expected):
            raise HTTPException(status_code=401, detail="Unauthorized")

    def hub_registry() -> HubRegistry:
        if hub is None:
            raise HTTPException(status_code=503, detail="AmigoHub is unavailable in in-memory mode")
        return hub

    def rate_limit(identity: str) -> None:
        now = time.time()
        attempts = [stamp for stamp in auth_attempts.get(identity, []) if now - stamp < 60]
        if len(attempts) >= int(config.security.get("authRateLimitPerMinute", 60)):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        attempts.append(now)
        auth_attempts[identity] = attempts

    async def dispatch(method: str, params: dict[str, Any], idem_key: str | None = None, scopes: set[str] | None = None) -> Any:
        required_scope = "operator.read"
        if method in {"agent", "agent.steer", "chat.send", "chat.inject", "channels.send", "sessions.reset", "sessions.delete", "sessions.patch", "sessions.cleanup", "sessions.compact", "cron.add", "cron.rm", "cron.run", "cron.edit", "cron.enable", "cron.disable", "plugins.install", "plugins.enable", "plugins.disable", "plugins.uninstall", "plugins.reload", "approvals.resolve", "tools.invoke", "node.invoke", "agents.add", "agents.delete", "models.set", "memory.add", "memory.index", "memory.delete", "system.heartbeat.enable", "system.heartbeat.disable", "system.heartbeat.run"}:
            required_scope = "operator.write"
        if method.startswith("devices.") or method.startswith("pairing.") or method == "security.preset":
            required_scope = "operator.pairing" if method.startswith("pairing.") else "operator.admin"
        if method in {"approvals.get", "approvals.resolve"}:
            required_scope = "operator.approvals"
        if method in {"config.patch", "config.apply", "models.set", "tools.invoke", "secrets.resolve", "plugins.call"}:
            required_scope = "operator.admin" if method.startswith("config.") or method == "secrets.resolve" else "operator.write"
        if scopes is not None and required_scope not in scopes and "operator.admin" not in scopes:
            raise PermissionError(f"Missing required scope: {required_scope}")
        side_effecting = method in {"agent", "agent.steer", "chat.send", "chat.inject", "channels.send", "sessions.reset", "sessions.delete", "sessions.patch", "sessions.cleanup", "sessions.compact", "cron.add", "cron.rm", "cron.run", "cron.edit", "cron.enable", "cron.disable", "config.apply", "memory.add", "memory.index", "memory.delete", "plugins.install", "plugins.enable", "plugins.disable", "plugins.uninstall", "plugins.reload", "pairing.approve", "pairing.reject", "approvals.resolve", "security.preset", "agents.add", "agents.delete", "models.set", "devices.revoke", "devices.remove", "devices.rotate", "devices.clear", "node.invoke", "system.heartbeat.enable", "system.heartbeat.disable", "system.heartbeat.run"}
        if side_effecting and not idem_key:
            raise ValueError("idempotencyKey is required for this method")
        async with idempotency_lock:
            if idem_key:
                cached = store.idempotent_get(idem_key, method)
                if cached is not None:
                    return cached
            result = await _dispatch_method(method, params, store, runtime, root, plugin_registry, tool_registry, config, send_node_command, channels, delivery_tasks)
            if idem_key:
                store.idempotent_put(idem_key, method, result)
            return result

    app.state.dispatch = dispatch

    @app.get("/")
    async def index():
        return {"name": "Talos Gateway", "version": __version__, "websocket": "/gateway"}

    @app.get("/health")
    async def health():
        return {"ok": True, "version": __version__, "time": time.time()}

    @app.get("/.well-known/agent-card.json")
    async def a2a_agent_card(request: Request):
        agent = runtime.agent_config()
        return {
            "name": "Amigo",
            "description": "Protocol-first agent gateway",
            "url": f"{str(request.base_url).rstrip('/')}/a2a",
            "version": __version__,
            "protocolVersion": "1.0",
            "capabilities": {
                "streaming": False,
                "pushNotifications": False,
                "stateTransitionHistory": False,
            },
            "defaultInputModes": ["text/plain"],
            "defaultOutputModes": ["text/plain"],
            "skills": [{
                "id": str(agent.get("id", "main")),
                "name": str(agent.get("name", "Amigo agent")),
                "description": "Accepts text messages and returns text replies.",
                "tags": ["chat"],
                "examples": [],
                "inputModes": ["text/plain"],
                "outputModes": ["text/plain"],
            }],
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer"},
            },
            "securityRequirements": [{"bearerAuth": []}],
        }

    @app.post("/a2a")
    async def a2a(request: Request, authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        raw_body = bytearray()
        async for chunk in request.stream():
            if len(raw_body) + len(chunk) > A2A_MAX_REQUEST_BYTES:
                return JSONResponse(status_code=413, content={"error": {"code": -32600, "message": "A2A request exceeds the 1 MiB limit"}})
            raw_body.extend(chunk)
        try:
            body = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JSONResponse(status_code=400, content={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
        request_id = body.get("id") if isinstance(body, dict) else None

        def error(code: int, message: str, status_code: int = 200):
            return JSONResponse(
                status_code=status_code,
                content={"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}},
            )

        if (
            not isinstance(body, dict)
            or body.get("jsonrpc") != "2.0"
            or "id" not in body
            or request_id is None
            or isinstance(request_id, bool)
            or not isinstance(request_id, (str, int, float))
        ):
            return error(-32600, "Invalid JSON-RPC request")
        method = body.get("method")
        params = body.get("params", {})
        if not isinstance(method, str) or not isinstance(params, dict):
            return error(-32600, "Invalid JSON-RPC request")

        try:
            if method in {"SendMessage", "message/send"}:
                message = params.get("message")
                if not isinstance(message, dict) or message.get("role", "user") != "user":
                    return error(-32602, "params.message must be a user message")
                message_id = message.get("messageId")
                if not isinstance(message_id, str) or not message_id or len(message_id) > 256:
                    return error(-32602, "params.message.messageId is required")
                parts = message.get("parts")
                if not isinstance(parts, list) or not parts:
                    return error(-32602, "params.message.parts must contain text")
                if any(not isinstance(part, dict) or part.get("kind") != "text" or not isinstance(part.get("text"), str) for part in parts):
                    return error(-32005, "Only text/plain message parts are supported")
                text = "\n".join(part["text"] for part in parts)
                if not text.strip():
                    return error(-32602, "Message text cannot be empty")
                context_id = message.get("contextId") or secrets.token_urlsafe(18)
                if not isinstance(context_id, str) or len(context_id) > 256:
                    return error(-32602, "contextId must be a string of at most 256 characters")
                metadata = params.get("metadata", {})
                if not isinstance(metadata, dict):
                    return error(-32602, "metadata must be an object")
                agent_id = str(metadata.get("agentId") or runtime.agent_config().get("id", "main"))
                agent = runtime.agent_config(agent_id)
                started = await dispatch(
                    "agent",
                    {
                        "agentId": agent_id,
                        "sessionKey": f"a2a:{agent_id}:{context_id}",
                        "message": text,
                    },
                    f"a2a:{message_id}",
                )
                task = _a2a_task(store, started["runId"])
                if task is None:
                    return error(-32001, "Created task could not be loaded")
                return {"jsonrpc": "2.0", "id": request_id, "result": task}
            if method in {"GetTask", "tasks/get"}:
                task_id = params.get("id", params.get("taskId"))
                if not isinstance(task_id, str) or not task_id:
                    return error(-32602, "params.id is required")
                history_length = params.get("historyLength", 50)
                if not isinstance(history_length, int) or isinstance(history_length, bool) or history_length < 0:
                    return error(-32602, "historyLength must be a non-negative integer")
                task = _a2a_task(store, task_id, history_length)
                if task is None:
                    return error(-32001, "Task not found")
                return {"jsonrpc": "2.0", "id": request_id, "result": task}
            if method in {"CancelTask", "tasks/cancel"}:
                task_id = params.get("id", params.get("taskId"))
                if not isinstance(task_id, str) or not task_id:
                    return error(-32602, "params.id is required")
                task = _a2a_task(store, task_id, 0)
                if task is None:
                    return error(-32001, "Task not found")
                if task["status"]["state"] not in {"submitted", "working"}:
                    return error(-32002, "Task is not cancelable")
                if not runtime.abort(task_id):
                    return error(-32002, "Task is not cancelable")
                running_task = runtime.tasks.get(task_id)
                if running_task:
                    await asyncio.gather(running_task, return_exceptions=True)
                canceled_task = _a2a_task(store, task_id, 0)
                return {"jsonrpc": "2.0", "id": request_id, "result": canceled_task or task}
            return error(-32601, f"Method not found: {method}")
        except PermissionError as exc:
            return error(-32000, str(exc), 403)
        except (ValueError, KeyError) as exc:
            return error(-32602, str(exc))

    @app.get("/status")
    async def gateway_status(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return {"ok": True, "version": __version__, "sessions": len(store.list_sessions()), "nodes": len(store.list_nodes()), "plugins": len(plugin_registry.list()) if plugin_registry else 0, "usage": store.usage_summary()}

    @app.get("/ready")
    async def ready():
        return {"ready": True, "database": str(store.path)}

    @app.get("/metrics")
    async def metrics():
        from fastapi.responses import PlainTextResponse
        usage = store.usage_summary()
        body = f"talos_gateway_up 1\ntalos_sessions_total {len(store.list_sessions())}\ntalos_model_calls_total {usage['calls']}\ntalos_model_input_tokens_total {usage['inputTokens']}\ntalos_model_output_tokens_total {usage['outputTokens']}\n"
        return PlainTextResponse(body, media_type="text/plain; version=0.0.4")

    @app.get("/diagnostics")
    async def diagnostics(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return export_diagnostics(root, root / "diagnostics.json", config.model_dump(by_alias=True), [{"id": "sqlite", "status": "ok"}, {"id": "gateway", "status": "running"}])

    @app.get("/v1/chat/completions")
    async def completions_get():
        raise HTTPException(status_code=405, detail="Use POST")

    @app.post("/v1/chat/completions")
    async def completions(body: dict[str, Any], authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        messages = body.get("messages") or []
        user_message = next((item.get("content", "") for item in reversed(messages) if item.get("role") == "user"), "")
        session = store.create_session(body.get("user", "openai-compatible"))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(user_message), run_id)
        result = await runtime.wait(run_id, timeout=config.agents.defaults.timeoutSeconds)
        if result is None or result["status"] == "running":
            raise HTTPException(status_code=504, detail="Agent response timed out")
        if result["status"] != "ok":
            raise HTTPException(status_code=502, detail=result.get("error") or "Agent response failed")
        reply = ((result or {}).get("result") or {}).get("reply", "")
        return {"id": run_id, "object": "chat.completion", "created": int(time.time()), "model": body.get("model", "talos-default"), "choices": [{"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}]}

    @app.post("/hooks/wake")
    async def hook_wake(body: dict[str, Any], authorization: str | None = Header(default=None), idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        if not idempotency_key:
            raise HTTPException(status_code=400, detail="Idempotency-Key header is required")
        if not store.consume_webhook_key(idempotency_key):
            raise HTTPException(status_code=409, detail="Duplicate webhook event")
        session = store.create_session(str(body.get("sessionKey", "hook:default")))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(body.get("text", "Wake")), run_id)
        return {"accepted": True, "runId": run_id}

    @app.post("/hooks/message")
    async def hook_message(body: dict[str, Any], authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        message = InboundMessage(**body)
        if message.message_id and not store.consume_webhook_key(f"message:{message.channel}:{message.account_id}:{message.message_id}"):
            raise HTTPException(status_code=409, detail="Duplicate message")
        channel_config = config.channels.get(message.channel, {})
        if not peer_allowed(channel_config, message.peer_id, message.is_group) and not store.peer_is_paired(message.channel, message.peer_id):
            challenge = store.create_pairing(f"{message.channel}:{message.peer_id}", "channel-peer", message.channel, [])
            return {**challenge, "accepted": False, "status": "pairing_required"}
        default_agent = runtime.agent_config().get("id", "main")
        agent_id = route_agent(config.bindings, message, str(default_agent))
        session = store.create_session(message.scoped_session_key(config.session.dmScope, agent_id))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], message.text, run_id, agent_id)
        return {"accepted": True, "runId": run_id, "sessionId": session["id"]}

    @app.post("/hooks/telegram")
    async def hook_telegram(body: dict[str, Any], secret_token: str | None = Header(default=None, alias="X-Telegram-Bot-Api-Secret-Token")):
        webhook_secret_env = str(telegram_config.get("webhookSecretEnv", "TELEGRAM_WEBHOOK_SECRET"))
        expected_secret = os.environ.get(webhook_secret_env)
        if not expected_secret:
            raise HTTPException(status_code=503, detail=f"Set {webhook_secret_env} to enable the Telegram webhook")
        if not secret_token or not secrets.compare_digest(secret_token, expected_secret):
            raise HTTPException(status_code=401, detail="Invalid Telegram webhook secret")
        adapter = channels.adapters.get("telegram")
        if not isinstance(adapter, TelegramAdapter):
            raise HTTPException(status_code=503, detail=f"Set {telegram_token_env} to configure the Telegram bot")
        update_id = body.get("update_id")
        if update_id is None:
            raise HTTPException(status_code=400, detail="Telegram update_id is required")
        if not store.consume_webhook_key(f"telegram:{update_id}"):
            return {"ok": True, "duplicate": True}
        incoming = body.get("message") or body.get("edited_message") or body.get("channel_post")
        if not incoming or not incoming.get("text"):
            return {"ok": True, "ignored": True}
        chat = incoming.get("chat", {})
        sender = incoming.get("from", {})
        chat_id = str(chat.get("id", ""))
        if not chat_id:
            raise HTTPException(status_code=400, detail="Telegram update has no chat id")
        is_group = chat.get("type") != "private"
        peer_id = chat_id if is_group else str(sender.get("id", chat_id))
        account_id = str(telegram_config.get("accountId", "default"))
        thread_id = incoming.get("message_thread_id")
        message = InboundMessage("telegram", account_id, peer_id, str(incoming["text"]), str(update_id), is_group, {"chatId": chat_id, "threadId": str(thread_id) if thread_id else None})
        if not peer_allowed(telegram_config, peer_id, is_group) and not store.peer_is_paired("telegram", peer_id):
            challenge = store.create_pairing(f"telegram:{peer_id}", "channel-peer", "telegram", [])
            await adapter.send(chat_id, f"Pairing required. Code: {challenge['pairingCode']}\nApprove device {challenge['deviceId']} with amigo pairing approve {challenge['deviceId']}.")
            return {"ok": True, "status": "pairing_required", "pairingCode": challenge["pairingCode"], "deviceId": challenge["deviceId"]}
        default_agent = runtime.agent_config().get("id", "main")
        agent_id = route_agent(config.bindings, message, str(default_agent))
        session = store.create_session(message.scoped_session_key(config.session.dmScope, agent_id))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], message.text, run_id, agent_id)

        async def deliver_reply() -> None:
            outcome = await runtime.wait(run_id, timeout=config.agents.defaults.timeoutSeconds)
            if outcome and outcome["status"] == "ok":
                reply = outcome.get("result", {}).get("reply", "")
                if reply:
                    await adapter.send(chat_id, reply)

        task = asyncio.create_task(deliver_reply())
        delivery_tasks.add(task)
        task.add_done_callback(delivery_tasks.discard)
        return {"ok": True, "accepted": True, "runId": run_id, "sessionId": session["id"]}

    @app.post("/hooks/agent")
    async def hook_agent(body: dict[str, Any], authorization: str | None = Header(default=None), idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")):
        return await hook_wake(body, authorization, idempotency_key)

    @app.post("/tools/invoke")
    async def tools_invoke(body: dict[str, Any], authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        policy = config.tools
        result = await tool_registry.invoke(str(body.get("name", "")), body.get("arguments", {}), policy, store)
        return result

    @app.get("/v1/responses")
    async def responses_get():
        raise HTTPException(status_code=405, detail="Use POST")

    @app.post("/v1/responses")
    async def responses(body: dict[str, Any], authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        text = str(body.get("input", ""))
        if isinstance(body.get("input"), list):
            text = "\n".join(str(item.get("content", "")) for item in body["input"] if isinstance(item, dict))
        session = store.create_session(str(body.get("user", "responses-api")))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], text, run_id)
        result = await runtime.wait(run_id, timeout=config.agents.defaults.timeoutSeconds)
        if result is None or result["status"] == "running":
            raise HTTPException(status_code=504, detail="Agent response timed out")
        if result["status"] != "ok":
            raise HTTPException(status_code=502, detail=result.get("error") or "Agent response failed")
        reply = ((result or {}).get("result") or {}).get("reply", "")
        return {"id": run_id, "object": "response", "status": "completed", "output": [{"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": reply}]}]}

    @app.post("/v1/chat/completions/stream")
    async def completions_stream(body: dict[str, Any], authorization: str | None = Header(default=None)):
        from fastapi.responses import StreamingResponse
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        messages = body.get("messages", [])
        prompt = next((item.get("content", "") for item in reversed(messages) if item.get("role") == "user"), "")
        session = store.create_session(str(body.get("user", "openai-compatible")))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(prompt), run_id)
        async def event_stream():
            async for event in runtime.stream(run_id):
                if event["payload"].get("stream") == "assistant":
                    chunk = {"id": run_id, "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": {"content": event["payload"].get("text", "")}, "finish_reason": None}]}
                    yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/plugins")
    async def plugins(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return {"plugins": plugin_registry.list() if plugin_registry else []}

    @app.get("/skills")
    async def skills(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return {"skills": eligible_skills([root / "skills", Path.cwd() / "skills"])}

    @app.get("/tools")
    async def tools_list(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return {"tools": tool_registry.list()}

    @app.post("/mcp")
    async def mcp_endpoint(body: dict[str, Any], authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return await mcp_server_response(body, tool_registry, store, config.tools)

    @app.get("/security/audit")
    async def security_audit(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return await _dispatch_method("security.audit", {}, store, runtime, root, plugin_registry, tool_registry, config)

    @app.get("/channels")
    async def channels_list(authorization: str | None = Header(default=None)):
        auth(authorization.removeprefix("Bearer ") if authorization else None)
        return {"channels": channels.list(), "configured": config.channels}

    @app.get("/v1/hub/packages")
    async def hub_packages(kind: str | None = None, query: str = "", tag: str | None = None, sort: str = "popular", limit: int = 30, offset: int = 0):
        return hub_registry().list_packages(kind=kind, query=query, tag=tag, sort=sort, limit=limit, offset=offset)

    @app.post("/v1/hub/packages")
    async def hub_publish(
        kind: str = Form(...), slug: str = Form(...), name: str = Form(...),
        description: str = Form(""), version: str = Form(...), tags: str = Form("[]"),
        changelog: str = Form(""), artifact: UploadFile = File(...),
        authorization: str | None = Header(default=None), publisher: str | None = Header(default=None, alias="X-Amigo-Publisher"),
    ):
        hub_auth(authorization.removeprefix("Bearer ") if authorization else None)
        if kind not in {"skill", "plugin"}:
            raise HTTPException(status_code=422, detail="kind must be skill or plugin")
        if not publisher:
            raise HTTPException(status_code=400, detail="X-Amigo-Publisher is required")
        try:
            parsed_tags = json.loads(tags)
            if not isinstance(parsed_tags, list) or any(not isinstance(tag, str) for tag in parsed_tags):
                raise ValueError("tags must be a JSON string array")
            binary = await artifact.read(MAX_ARCHIVE_BYTES + 1)
            if len(binary) > MAX_ARCHIVE_BYTES:
                raise ValueError("Package archive exceeds 25 MB")
            result = hub_registry().publish(kind=kind, slug=slug, name=name, description=description, publisher=publisher, version=version, tags=parsed_tags, artifact=binary, changelog=changelog)
            return {"package": result, "moderation": "pending"}
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except (ValueError, ValidationError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/v1/hub/packages/{kind}/{slug}")
    async def hub_package(kind: str, slug: str):
        package = hub_registry().get_package(kind, slug)
        if not package:
            raise HTTPException(status_code=404, detail="Hub package not found")
        return {"package": package}

    @app.get("/v1/hub/packages/{kind}/{slug}/versions")
    async def hub_package_versions(kind: str, slug: str):
        versions = hub_registry().versions(kind, slug)
        if not versions:
            raise HTTPException(status_code=404, detail="Hub package not found")
        return {"versions": versions}

    @app.get("/v1/hub/packages/{kind}/{slug}/download")
    async def hub_download(kind: str, slug: str, version: str | None = None):
        item = hub_registry().download(kind, slug, version)
        if not item:
            raise HTTPException(status_code=404, detail="Published Hub package version not found")
        return Response(item["artifact"], media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{slug}-{item["version"]}.zip"', "X-Content-SHA256": item["digest"]})

    @app.get("/v1/hub/moderation/queue")
    async def hub_moderation_queue(authorization: str | None = Header(default=None)):
        hub_auth(authorization.removeprefix("Bearer ") if authorization else None, moderator=True)
        return {"items": hub_registry().moderation_queue()}

    @app.post("/v1/hub/moderation/{package_id}/{version}")
    async def hub_moderate(package_id: str, version: str, body: dict[str, Any], authorization: str | None = Header(default=None)):
        hub_auth(authorization.removeprefix("Bearer ") if authorization else None, moderator=True)
        decision = body.get("decision")
        if decision not in {"publish", "reject", "yank"}:
            raise HTTPException(status_code=422, detail="decision must be publish, reject, or yank")
        try:
            return hub_registry().moderate(package_id, version, decision, str(body.get("moderator", "operator")), str(body.get("note", "")))
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.websocket("/gateway")
    async def gateway(ws: WebSocket):
        await ws.accept()
        try:
            nonce = secrets.token_urlsafe(32)
            await ws.send_json({"type": "event", "event": "connect.challenge", "payload": {"nonce": nonce, "protocolVersion": 1}, "seq": 0, "stateVersion": 1})
            raw = await asyncio.wait_for(ws.receive_text(), timeout=10)
            try:
                first = json.loads(raw)
                connect = ConnectFrame.model_validate(first)
            except (json.JSONDecodeError, ValidationError):
                await ws.close(code=1002, reason="First frame must be a valid connect frame")
                return
            if connect.protocolVersion != 1:
                await ws.send_json({"type": "res", "id": "connect", "ok": False, "error": {"code": "protocol_version", "message": "Supported protocol version is 1"}})
                await ws.close(code=1002)
                return
            token = connect.token
            if connect.nonce != nonce:
                await ws.close(code=1008, reason="Invalid protocol challenge")
                return
            if connect.role == "node":
                device_id = connect.deviceId or ""
                if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", device_id):
                    await ws.close(code=1008, reason="Invalid node identity")
                    return
                device = store.get_device(connect.deviceId or "")
                if not device:
                    try:
                        public_key = base64.b64decode(connect.publicKey or "", validate=True)
                        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
                        Ed25519PublicKey.from_public_bytes(public_key)
                    except (ValueError, TypeError):
                        await ws.close(code=1008, reason="Invalid node public key")
                        return
                    store.create_pairing(device_id, connect.deviceFamily or "headless", connect.platform or "unknown", connect.commands, connect.publicKey)
                    await ws.close(code=1008, reason="Node requires pairing approval")
                    return
                if device["status"] != "approved":
                    await ws.close(code=1008, reason="Node requires pairing approval")
                    return
                if not token or not secrets.compare_digest(str(device.get("token") or ""), token):
                    await ws.close(code=1008, reason="Invalid device token")
                    return
                if not device.get("public_key") or not connect.deviceSignature:
                    await ws.close(code=1008, reason="Device signature required")
                    return
                try:
                    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
                    key = Ed25519PublicKey.from_public_bytes(base64.b64decode(device["public_key"]))
                    key.verify(base64.b64decode(connect.deviceSignature), nonce.encode())
                except Exception:
                    await ws.close(code=1008, reason="Device signature invalid")
                    return
                store.update_node_presence(connect.deviceId or "", connect.caps, connect.commands, {"platform": connect.platform, "deviceFamily": connect.deviceFamily})
            else:
                if not token:
                    await ws.close(code=1008, reason="Gateway token required")
                    return
                client_ip = ws.client.host if ws.client else "unknown"
                rate_limit(client_ip)
                try:
                    auth(token)
                except HTTPException:
                    await ws.close(code=1008, reason="Unauthorized")
                    return
                declared = set(connect.commands)
                allowed = set(config.security.get("nodes", {}).get("allowCommands", []))
                denied = set(config.security.get("nodes", {}).get("denyCommands", []))
                if "system.run" in declared and ("system.run" in denied or "system.run" not in allowed):
                    await ws.close(code=1008, reason="Node command is denied by gateway policy")
                    return
            role_scopes = set(connect.scopes) if connect.scopes else {"operator.read", "operator.write"}
            if connect.role == "operator" and not (role_scopes & {"operator.read", "operator.write", "operator.admin"}):
                await ws.close(code=1008, reason="Operator requires scopes")
                return
            await ws.send_json({"type": "res", "id": "connect", "ok": True, "payload": {"type": "hello-ok", "protocolVersion": 1, "snapshot": {"health": "ok", "presence": store.list_nodes()}, "features": {"methods": ["health", "status", "system.presence", "system.heartbeat.status", "system.heartbeat.enable", "system.heartbeat.disable", "system.heartbeat.run", "agent", "agent.wait", "agent.abort", "agent.steer", "sessions.list", "sessions.get", "sessions.patch", "sessions.reset", "sessions.delete", "sessions.cleanup", "sessions.compact", "chat.history", "chat.send", "chat.inject", "channels.list", "channels.status", "channels.capabilities", "channels.send", "plugins.list", "plugins.inspect", "plugins.reload", "plugins.doctor", "plugins.install", "plugins.enable", "plugins.disable", "plugins.uninstall", "skills.list", "skills.info", "skills.install", "skills.check", "models.list", "models.status", "models.set", "models.auth.list", "models.auth.add", "cron.list", "cron.add", "cron.edit", "cron.rm", "cron.run", "cron.runs", "approvals.get", "approvals.resolve", "memory.status", "memory.get", "memory.search", "memory.add", "memory.index", "memory.delete", "security.audit", "security.preset", "doctor", "config.get", "config.schema.lookup", "config.validate", "config.patch", "config.apply", "browser.status", "browser.open", "canvas.create", "canvas.get", "tools.list", "tools.invoke", "mcp.tools.list", "mcp.serve", "node.list", "node.pending", "node.describe", "node.invoke"], "events": ["agent"]}}})
            send_lock = asyncio.Lock()
            stream_tasks: set[asyncio.Task[None]] = set()

            async def send(payload: dict[str, Any]) -> None:
                async with send_lock:
                    await ws.send_json(payload)

            async def forward_events(run_id: str) -> None:
                async for event in runtime.stream(run_id):
                    await send(event)

            if connect.role == "node" and connect.deviceId:
                node_senders[connect.deviceId] = send

            while True:
                raw = await ws.receive_text()
                try:
                    request = RequestFrame.model_validate_json(raw)
                    if connect.role == "node":
                        if request.method == "node.result":
                            pending = node_waiters.get(str(request.params.get("requestId", "")))
                            waiter = pending[1] if pending and pending[0] == connect.deviceId else None
                            if waiter and not waiter.done():
                                waiter.set_result(request.params.get("result", {}))
                            result = {"accepted": waiter is not None}
                        elif request.method == "node.heartbeat":
                            result = {"accepted": True}
                        else:
                            raise PermissionError("Node role cannot invoke operator RPC methods")
                    else:
                        result = await dispatch(request.method, request.params, request.idempotencyKey, role_scopes)
                    if request.method == "agent" and isinstance(result, dict) and result.get("runId"):
                        await send({"type": "res", "id": request.id, "ok": True, "payload": result})
                        task = asyncio.create_task(forward_events(result["runId"]))
                        stream_tasks.add(task)
                        task.add_done_callback(stream_tasks.discard)
                    else:
                        await send({"type": "res", "id": request.id, "ok": True, "payload": result})
                except (ValidationError, json.JSONDecodeError) as exc:
                    await send({"type": "res", "id": "", "ok": False, "error": {"code": "invalid_request", "message": str(exc)}})
                except Exception as exc:
                    request_id = request.id if "request" in locals() else ""
                    await send({"type": "res", "id": request_id, "ok": False, "error": {"code": "request_failed", "message": str(exc)}})
        except (WebSocketDisconnect, asyncio.TimeoutError):
            if "connect" in locals() and connect.role == "node" and connect.deviceId:
                if "send" in locals() and node_senders.get(connect.deviceId) is send:
                    node_senders.pop(connect.deviceId, None)
                for device_id, waiter in node_waiters.values():
                    if device_id == connect.deviceId and not waiter.done():
                        waiter.set_exception(RuntimeError("Paired node disconnected"))
            return

    return app


async def _dispatch_method(method: str, params: dict[str, Any], store: Store, runtime: AgentRuntime, root: Path, plugin_registry: PluginRegistry | None = None, tool_registry: Any = None, config: TalosConfig | None = None, node_command_sender: Any = None, channel_registry: ChannelRegistry | None = None, delivery_tasks: set[asyncio.Task[Any]] | None = None) -> Any:
    if method in {"health", "status"}:
        return {"ok": True, "status": "healthy", "version": __version__, "sessions": len(store.list_sessions())}
    if method == "agent":
        agent_id = str(params["agentId"]) if params.get("agentId") else None
        agent = runtime.agent_config(agent_id)
        if params.get("sessionId"):
            session = store.get_session(str(params["sessionId"]))
            if not session:
                raise ValueError("Session not found")
        else:
            key = str(params.get("sessionKey") or f"agent:{agent.get('id', 'main')}:main")
            session = store.create_session(key)
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(params.get("message", "")), run_id, agent_id)
        return {"runId": run_id, "acceptedAt": time.time(), "sessionId": session["id"], "agentId": agent.get("id", "main")}
    if method == "agent.wait":
        result = await runtime.wait(str(params.get("runId", "")), float(params.get("timeout", 30)))
        if result is None:
            raise ValueError("Unknown runId")
        return result
    if method == "agent.abort":
        return {"aborted": runtime.abort(str(params.get("runId", "")))}
    if method == "agent.steer":
        run_id = str(params.get("runId", ""))
        accepted = runtime.steer(run_id, str(params.get("message", "")))
        return {"accepted": accepted, "runId": run_id}
    if method == "system.presence":
        now = time.time()
        nodes = [{**item, "connected": now - item["lastSeen"] < 90} for item in store.list_nodes()]
        return {"gateway": {"status": "online", "time": now}, "nodes": nodes}
    if method == "node.invoke":
        device_id = str(params.get("deviceId", ""))
        command = str(params.get("command", ""))
        device = store.get_device(device_id)
        if device and device["status"] != "approved":
            device = None
        if not device:
            raise ValueError("Node is not paired")
        declared = set(device.get("scopes", []))
        policy = runtime.config.get("security", {}).get("nodes", {})
        allow = set(policy.get("allowCommands", []))
        deny = set(policy.get("denyCommands", []))
        if command not in declared or command in deny or command not in allow:
            raise PermissionError("Node command is not declared and allowed")
        if command == "system.run":
            approval = store.create_approval(command, {"_talosNodeApproval": True, "deviceId": device_id, "command": command, "arguments": params.get("arguments", {})}, device_id)
            return {"status": "approval_required", "approval": approval}
        if not node_command_sender:
            raise RuntimeError("Node command transport is unavailable")
        result = await node_command_sender(device_id, command, params.get("arguments", {}), float(params.get("timeout", 30)))
        return {"status": "ok", "deviceId": device_id, "command": command, "result": result}
    if method in {"node.list", "node.pending"}:
        nodes = store.list_nodes()
        if method == "node.pending":
            return {"nodes": [item for item in nodes if time.time() - item["lastSeen"] > 60]}
        return {"nodes": nodes}
    if method == "agents.list":
        return {"agents": runtime.config.get("agents", {}).get("list", []) or runtime.config.get("agentsList", [])}
    if method == "agents.add":
        agent_id = str(params.get("id", ""))
        entries = runtime.config.setdefault("agents", {}).setdefault("list", [])
        if not agent_id or any(item.get("id") == agent_id for item in entries):
            raise ValueError("Agent id is missing or already exists")
        default_sandbox = runtime.config.get("agents", {}).get("defaults", {}).get("sandbox", {})
        entry = {"id": agent_id, "name": params.get("name", agent_id), "workspace": params.get("workspace"), "model": params.get("model", runtime.model), "sandbox": params.get("sandbox", default_sandbox), "tools": params.get("tools", [])}
        entries.append(entry)
        return {"agent": entry}
    if method == "agents.delete":
        agent_id = str(params.get("id", ""))
        agents = runtime.config.setdefault("agents", {}).setdefault("list", [])
        before = len(agents)
        runtime.config["agents"]["list"] = [item for item in agents if item.get("id") != agent_id]
        return {"deleted": len(runtime.config["agents"]["list"]) != before}
    if method == "agents.bindings":
        return {"bindings": runtime.config.get("bindings", [])}
    if method == "plugins.call":
        if not plugin_registry:
            raise ValueError("Plugin registry unavailable")
        return await plugin_registry.invoke_isolated(str(params.get("id", "")), str(params.get("method", "")), params.get("params", {}))
    if method == "sessions.list":
        return {"sessions": store.list_sessions()}
    if method == "sessions.patch":
        session = store.get_session(str(params.get("sessionId", "")))
        if not session:
            raise ValueError("Session not found")
        metadata = json.loads(session["metadata"])
        metadata.update(params.get("metadata", {}))
        with store._connect() as db:
            db.execute("UPDATE sessions SET metadata=?,updated_at=? WHERE id=?", (json.dumps(metadata), time.time(), session["id"]))
        return {"session": store.get_session(session["id"])}
    if method == "sessions.cleanup":
        older_than = time.time() - int(params.get("maxAgeSeconds", 2592000))
        with store._connect() as db:
            stale = db.execute("SELECT id FROM sessions WHERE updated_at < ?", (older_than,)).fetchall()
            for row in stale:
                db.execute("DELETE FROM messages WHERE session_id=?", (row[0],))
                db.execute("DELETE FROM runs WHERE session_id=?", (row[0],))
                db.execute("DELETE FROM sessions WHERE id=?", (row[0],))
        return {"removed": len(stale)}
    if method == "sessions.delete":
        session = store.get_session(str(params.get("sessionId", "")))
        if not session:
            return {"deleted": False}
        with store._connect() as db:
            db.execute("DELETE FROM messages WHERE session_id=?", (session["id"],))
            db.execute("DELETE FROM runs WHERE session_id=?", (session["id"],))
            db.execute("DELETE FROM sessions WHERE id=?", (session["id"],))
        return {"deleted": True}
    if method == "sessions.reset":
        session = store.get_session(str(params.get("sessionId", "")))
        if not session:
            raise ValueError("Session not found")
        with store._connect() as db:
            db.execute("DELETE FROM messages WHERE session_id=?", (session["id"],))
        return {"reset": True, "sessionId": session["id"]}
    if method in {"sessions.get", "chat.history"}:
        session = store.get_session(str(params.get("sessionId") or params.get("sessionKey") or ""))
        if not session:
            raise ValueError("Session not found")
        return {"session": session, "messages": store.history(session["id"], int(params.get("limit", 100)))}
    if method == "sessions.compact":
        session_id = str(params.get("sessionId", ""))
        result = await runtime.compact_session(session_id, int(params.get("keepLast", 12)))
        return {"sessionId": session_id, **result}
    if method == "chat.send":
        agent_id = str(params["agentId"]) if params.get("agentId") else None
        agent = runtime.agent_config(agent_id)
        session = store.create_session(str(params.get("sessionKey") or f"agent:{agent.get('id', 'main')}:main"))
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(params.get("message", "")), run_id, agent_id)
        return {"runId": run_id, "sessionId": session["id"], "agentId": agent.get("id", "main")}
    if method == "chat.inject":
        session = store.get_session(str(params.get("sessionId") or params.get("sessionKey") or ""))
        if not session:
            raise ValueError("Session not found")
        role = str(params.get("role", "assistant"))
        if role not in {"assistant", "system"}:
            raise ValueError("chat.inject may only add assistant or system messages")
        return {"message": store.append_message(session["id"], role, str(params.get("content", "")))}
    if method in {"channels.list", "channels.status"}:
        return {"channels": channel_registry.list() if channel_registry else [{"id": "webchat", "status": "available"}]}
    if method == "channels.send":
        if not channel_registry:
            raise ValueError("Channel registry is unavailable")
        channel = str(params.get("channel", ""))
        peer_id = str(params.get("peerId", ""))
        text = params.get("text")
        metadata = params.get("metadata", {})
        if not channel or not peer_id or not isinstance(text, str) or not text:
            raise ValueError("channel, peerId, and non-empty text are required")
        if not isinstance(metadata, dict):
            raise ValueError("metadata must be an object")
        return await channel_registry.send(channel, peer_id, text, **metadata)
    if method == "channels.capabilities":
        available_channels = channel_registry.list() if channel_registry else [{"id": "webchat", "status": "available"}]
        adapters = channel_registry.adapters if channel_registry else {}
        return {"channels": [{"id": item["id"], "available": item["status"] in {"configured", "available"}, "capabilities": {"send": item["id"] in adapters or item["id"] == "webchat" or item.get("plugin", False), "receive": item["id"] in {"telegram", "webchat"}}} for item in available_channels]}
    if method == "plugins.list":
        return {"plugins": plugin_registry.list() if plugin_registry else discover_plugins(root / "plugins")}
    if method == "plugins.reload":
        return {"plugins": plugin_registry.reload() if plugin_registry else discover_plugins(root / "plugins")}
    if method == "plugins.doctor":
        entries = plugin_registry.list() if plugin_registry else discover_plugins(root / "plugins")
        findings = []
        for item in entries:
            plugin_dir = Path(item["path"]).resolve()
            if item.get("entrypoint"):
                entrypoint = (plugin_dir / item["entrypoint"]).resolve()
                if plugin_dir not in entrypoint.parents or not entrypoint.is_file():
                    findings.append({"plugin": item["id"], "severity": "error", "message": "Declared entrypoint is missing or escapes its plugin directory"})
            if item.get("permissions"):
                findings.append({"plugin": item["id"], "severity": "review", "message": "Plugin declares permissions that require operator review"})
            if not (plugin_dir / "amigo.plugin.json").is_file():
                findings.append({"plugin": item["id"], "severity": "error", "message": "Plugin manifest is missing"})
        return {"ok": not any(row["severity"] == "error" for row in findings), "plugins": len(entries), "findings": findings}
    if method == "plugins.install":
        if not plugin_registry:
            raise ValueError("Plugin registry unavailable")
        return {"plugin": plugin_registry.install(Path(str(params.get("path", ""))))}
    if method in {"plugins.enable", "plugins.disable"}:
        if not plugin_registry:
            raise ValueError("Plugin registry unavailable")
        return {"plugin": plugin_registry.set_enabled(str(params.get("id", "")), method == "plugins.enable")}
    if method == "plugins.uninstall":
        return {"removed": plugin_registry.uninstall(str(params.get("id", ""))) if plugin_registry else False}
    if method == "plugins.init":
        if not plugin_registry:
            raise ValueError("Plugin registry unavailable")
        return {"path": str(plugin_registry.init(str(params.get("id", "")), params.get("name")))}
    if method == "plugins.validate":
        manifest = PluginManifest.model_validate_json(Path(str(params.get("path", ""))).read_text("utf-8"))
        return {"valid": True, "manifest": manifest.model_dump()}
    if method == "plugins.inspect":
        plugin_id = str(params.get("id", ""))
        item = next((plugin for plugin in (plugin_registry.list() if plugin_registry else discover_plugins(root / "plugins")) if plugin["id"] == plugin_id), None)
        if not item:
            raise ValueError("Plugin is not installed")
        return {"plugin": item}
    if method == "skills.list":
        return {"skills": discover_skills([root / "skills", Path.cwd() / "skills"])}
    if method == "skills.install":
        return {"skill": install_skill(Path(str(params.get("source", ""))), root / "skills", params.get("as"))}
    if method == "skills.verify":
        return {"card": skill_card(Path(str(params.get("path", ""))))}
    if method in {"skills.info", "skills.check"}:
        found = eligible_skills([root / "skills", Path.cwd() / "skills"])
        if params.get("name"):
            found = [item for item in found if item["name"] == params["name"]]
        return {"skills": found, "eligible": len(found)}
    if method in {"models.list", "models.status"}:
        cfg = runtime.config
        models = [{"id": model_id, "provider": entry.get("provider", "openai-compatible"), "model": entry.get("model", model_id)} for model_id, entry in cfg.get("models", {}).items()]
        return {"models": models, "configured": bool(models), "active": runtime.model}
    if method == "models.set":
        model_id = str(params.get("model", ""))
        if model_id != "echo" and model_id not in runtime.config.get("models", {}):
            raise ValueError("Model is not configured")
        runtime.model = model_id
        return {"active": runtime.model}
    if method == "models.auth.list":
        return {"profiles": store.list_auth_profiles(params.get("provider"))}
    if method == "models.auth.add":
        profile_id = str(params.get("id", ""))
        provider = str(params.get("provider", ""))
        secret_ref = str(params.get("secretRef", ""))
        if not profile_id or not provider or not secret_ref:
            raise ValueError("Profile id, provider, and secretRef are required")
        return {"profile": store.add_auth_profile(profile_id, provider, str(params.get("kind", "api_key")), secret_ref, params.get("metadata"))}
    if method == "cron.list":
        return {"jobs": store.list_cron()}
    if method == "cron.runs":
        return {"runs": store.cron_runs(str(params["id"]) if params.get("id") else None)}
    if method == "cron.add":
        schedule_kind = str(params.get("scheduleKind", "cron"))
        schedule = str(params.get("schedule", ""))
        run_at = None
        interval_seconds = None
        if schedule_kind == "cron":
            from .scheduler import validate_schedule
            validate_schedule(schedule)
        elif schedule_kind == "at":
            run_at = parse_run_at(str(params.get("runAt", "")))
            schedule = ""
        elif schedule_kind == "every":
            interval_seconds = params.get("intervalSeconds")
            validate_interval(interval_seconds)
            schedule = ""
        else:
            raise ValueError("scheduleKind must be 'cron', 'at', or 'every'")
        timezone_name = str(params.get("timezone", params.get("tz", "local")))
        validate_timezone(timezone_name)
        delivery_channel, delivery_peer_id = _cron_delivery_target(params)
        return {
            "job": store.add_cron(
                str(params.get("name", "Scheduled task")),
                schedule,
                str(params.get("sessionKey", "cron:default")),
                str(params.get("message", "")),
                timezone_name,
                schedule_kind,
                run_at,
                interval_seconds,
                delivery_channel,
                delivery_peer_id,
            ),
        }
    if method == "cron.rm":
        return {"removed": store.remove_cron(str(params.get("id", "")))}
    if method in {"cron.enable", "cron.disable", "cron.edit"}:
        job_id = str(params.get("id", ""))
        job = next((item for item in store.list_cron() if item["id"] == job_id), None)
        if not job:
            raise ValueError("Cron job not found")
        with store._connect() as db:
            if method == "cron.edit":
                schedule_kind = str(params.get("scheduleKind", job.get("schedule_kind", "cron")))
                schedule = str(params.get("schedule", job["schedule"]))
                run_at = job.get("run_at")
                interval_seconds = job.get("interval_seconds")
                if schedule_kind == "cron":
                    from .scheduler import validate_schedule
                    validate_schedule(schedule)
                    run_at = interval_seconds = None
                elif schedule_kind == "at":
                    run_at = parse_run_at(str(params.get("runAt", "")))
                    interval_seconds = None
                    schedule = ""
                elif schedule_kind == "every":
                    interval_seconds = params.get("intervalSeconds")
                    validate_interval(interval_seconds)
                    run_at = None
                    schedule = ""
                else:
                    raise ValueError("scheduleKind must be 'cron', 'at', or 'every'")
                timezone_name = str(params.get("timezone", params.get("tz", job.get("timezone", "local"))))
                validate_timezone(timezone_name)
                next_run_at = run_at if schedule_kind == "at" else time.time() + interval_seconds if schedule_kind == "every" else None
                delivery_channel, delivery_peer_id = _cron_delivery_target(params, job)
                db.execute(
                    "UPDATE cron_jobs SET name=?,schedule=?,message=?,timezone=?,schedule_kind=?,run_at=?,interval_seconds=?,next_run_at=?,delivery_channel=?,delivery_peer_id=?,enabled=1 WHERE id=?",
                    (str(params.get("name", job["name"])), schedule, str(params.get("message", job["message"])), timezone_name, schedule_kind, run_at, interval_seconds, next_run_at, delivery_channel, delivery_peer_id, job_id),
                )
            else:
                db.execute("UPDATE cron_jobs SET enabled=? WHERE id=?", (1 if method == "cron.enable" else 0, job_id))
        return {"job": next(item for item in store.list_cron() if item["id"] == job_id)}
    if method == "cron.run":
        job = next((item for item in store.list_cron() if item["id"] == params.get("id")), None)
        if not job:
            raise ValueError("Cron job not found")
        run_id = await _run_cron_job(job, store, runtime, channel_registry, delivery_tasks)
        return {"accepted": True, "runId": run_id}
    if method == "approvals.get":
        return {"approvals": store.list_approvals()}
    if method == "approvals.resolve":
        approved = bool(params.get("approved", False))
        approval_id = str(params.get("id", ""))
        pending = store.get_approval(approval_id)
        resolved = store.resolve_approval(approval_id, approved)
        if resolved and approved and pending:
            payload = json.loads(pending["payload"])
            if payload.get("_talosNodeApproval"):
                if not node_command_sender:
                    raise RuntimeError("Node command transport is unavailable")
                outcome = await node_command_sender(payload["deviceId"], payload["command"], payload.get("arguments", {}))
                return {"resolved": True, "approved": True, "outcome": outcome}
            context = payload.get("executionContext") if payload.get("_talosApproval") else None
            arguments = payload.get("arguments", {}) if payload.get("_talosApproval") else payload
            outcome = await tool_registry.invoke(pending["command"], arguments, {"allow": [pending["command"]], "exec": {"security": "allow", "ask": "never"}}, store, context)
            return {"resolved": True, "approved": True, "outcome": outcome}
        return {"resolved": resolved, "approved": approved}
    if method in {"devices.list", "node.list", "pairing.list"}:
        devices = store.list_devices()
        return {"devices": devices, "pairing": [item for item in devices if item["status"] == "pending"]}
    if method == "node.describe":
        device_id = str(params.get("deviceId", ""))
        node = next((item for item in store.list_nodes() if item["deviceId"] == device_id), None)
        if not node:
            raise ValueError("Node is not connected or has not sent presence")
        pairing = next((item for item in store.list_devices() if item["id"] == device_id), None)
        return {"node": node, "pairing": pairing}
    if method in {"devices.approve", "pairing.approve", "node.approve"}:
        device_id = str(params.get("deviceId", ""))
        device = store.resolve_device(device_id, True)
        if not device:
            raise ValueError("Device not found")
        if device["family"] == "channel-peer":
            channel, _, peer_id = device_id.partition(":")
            if not channel or not peer_id:
                raise ValueError("Invalid channel pairing identity")
            store.pair_peer(channel, peer_id)
            device = {key: value for key, value in device.items() if key not in {"token", "public_key"}}
        store.audit("device.approved", {"deviceId": device["id"]})
        return {"device": device}
    if method in {"devices.reject", "pairing.reject"}:
        device = store.resolve_device(str(params.get("deviceId", "")), False)
        return {"device": device}
    if method in {"devices.revoke", "devices.remove"}:
        device_id = str(params.get("deviceId", ""))
        with store._connect() as db:
            cur = db.execute("DELETE FROM devices WHERE id=?", (device_id,))
        store.audit("device.revoked", {"deviceId": device_id})
        return {"revoked": cur.rowcount > 0}
    if method == "memory.status":
        with store._connect() as db:
            count = db.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
        return {"available": True, "backend": "sqlite", "indexed": True, "entries": count}
    if method == "memory.index":
        memories = []
        workspace = Path(str(runtime.workspace)) if runtime.workspace else root / "workspace"
        for filename in ("MEMORY.md", "memory.md"):
            source = workspace / filename
            if source.exists():
                memories.append(store.add_memory(source.read_text("utf-8"), "workspace", {"path": str(source)}))
        return {"indexed": len(memories)}
    if method == "memory.search":
        return {"memories": store.search_memory(str(params.get("query", "")), str(params.get("scope", "default")), int(params.get("limit", 20)))}
    if method == "memory.get":
        memory = store.get_memory(str(params.get("id", "")))
        if not memory:
            raise ValueError("Memory not found")
        return {"memory": memory}
    if method == "memory.add":
        return {"memory": store.add_memory(str(params.get("content", "")), str(params.get("scope", "default")), params.get("metadata"))}
    if method == "memory.delete":
        return {"deleted": store.delete_memory(str(params.get("id", "")))}
    if method == "memory.dream":
        memories = store.search_memory("", str(params.get("scope", "default")), int(params.get("limit", 100)))
        if not memories:
            return {"proposal": None, "reason": "No memories to consolidate"}
        summary = "\n".join(f"- {item['content']}" for item in memories)
        proposal = store.add_memory(summary, "proposals", {"kind": "dream", "sourceMemoryIds": [item["id"] for item in memories]})
        return {"proposal": proposal}
    if method == "status.usage":
        return store.usage_summary()
    if method == "system.heartbeat.status":
        with store._connect() as db:
            row = db.execute("SELECT * FROM heartbeat_state WHERE id=1").fetchone()
        return dict(row) if row else {"enabled": False, "last_run": None, "interval_seconds": 1800}
    if method in {"system.heartbeat.enable", "system.heartbeat.disable"}:
        enabled = method.endswith("enable")
        interval = int(params.get("intervalSeconds", 1800))
        if not 30 <= interval <= 86400:
            raise ValueError("Heartbeat interval must be between 30 and 86400 seconds")
        with store._connect() as db:
            db.execute("INSERT INTO heartbeat_state(id,enabled,interval_seconds) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,interval_seconds=excluded.interval_seconds", (int(enabled), interval))
        return {"enabled": enabled, "intervalSeconds": interval}
    if method == "system.heartbeat.run":
        session = store.create_session("main")
        run_id = store.create_run(session["id"])
        await runtime.start(session["id"], str(params.get("message", "Review HEARTBEAT.md and perform due tasks. Reply HEARTBEAT_OK if no action is needed.")), run_id)
        with store._connect() as db:
            db.execute("INSERT INTO heartbeat_state(id,enabled,last_run,interval_seconds) VALUES(1,1,?,1800) ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run", (time.time(),))
        return {"runId": run_id, "accepted": True}
    if method in {"devices.rotate", "devices.clear"}:
        device_id = str(params.get("deviceId", ""))
        if method == "devices.clear":
            with store._connect() as db:
                db.execute("DELETE FROM devices")
            return {"cleared": True}
        device = store.resolve_device(device_id, True)
        if not device:
            raise ValueError("Device not found")
        return {"device": device}
    if method == "canvas.create":
        mime_type = str(params.get("mimeType", "text/markdown"))
        return {"canvas": store.create_canvas(mime_type, str(params.get("title", "Untitled")), str(params.get("content", "")), params.get("sessionId"))}
    if method == "canvas.get":
        canvas = store.get_canvas(str(params.get("id", "")))
        if not canvas:
            raise ValueError("Canvas not found")
        return {"canvas": canvas}
    if method.startswith("browser."):
        action = method.partition(".")[2]
        profile = str(params.get("profile", "amigo"))
        if action == "status":
            profiles = store.list_browser_profiles()
            selected = next((item for item in profiles if item["id"] == profile), None)
            cdp_url = selected.get("cdp_url") if selected else None
            tabs = await cdp_json(cdp_url, "/json/list") if cdp_url else store.list_browser_tabs(profile)
            return {"running": bool(cdp_url), "profiles": profiles, "tabs": tabs}
        if action == "profiles":
            return {"profiles": store.list_browser_profiles()}
        if action == "create-profile":
            store.create_browser_profile(str(params.get("id", profile)), str(params.get("name", profile)), params.get("cdpUrl"))
            return {"created": True, "profile": profile}
        if action == "delete-profile":
            with store._connect() as db:
                cur = db.execute("DELETE FROM browser_profiles WHERE id=?", (profile,))
                db.execute("DELETE FROM browser_tabs WHERE profile_id=?", (profile,))
            return {"deleted": cur.rowcount > 0}
        if action == "tabs":
            selected = next((item for item in store.list_browser_profiles() if item["id"] == profile), None)
            return {"tabs": await cdp_json(selected["cdp_url"], "/json/list")} if selected and selected.get("cdp_url") else {"tabs": store.list_browser_tabs(profile)}
        if action == "open":
            url = validate_browser_url(str(params.get("url", "")), bool(runtime.config.get("browser", {}).get("allowPrivateNetworks", False)), set(runtime.config.get("browser", {}).get("allowedHosts", [])) or None)
            selected = next((item for item in store.list_browser_profiles() if item["id"] == profile), None)
            if selected and selected.get("cdp_url"):
                from urllib.parse import quote
                result = await cdp_json(selected["cdp_url"], "/json/new?" + quote(url, safe=":/?=&%#"))
                return {"tab": result}
            return {"tab": store.browser_open_tab(profile, url)}
        raise ValueError(f"Browser action is not available without a CDP backend: {action}")
    if method in {"talk.config", "media.capabilities"}:
        return {"providers": runtime.config.get("mediaProviders", {}), "configured": bool(runtime.config.get("mediaProviders"))}
    if method == "mcp.tools.list":
        tools = []
        for server_id, server in runtime.config.get("mcp", {}).get("servers", {}).items():
            tools.append({"server": server_id, "command": server.get("command"), "tools": []})
        return {"servers": tools}
    if method == "mcp.serve":
        return {"endpoint": "/mcp", "transport": "streamable-http", "tools": tool_registry.list() if tool_registry else []}
    if method in {"tools.list", "tools.invoke"}:
        if method == "tools.list":
            return {"tools": tool_registry.list() if tool_registry else []}
        if tool_registry is None:
            raise ValueError("Tool registry unavailable")
        return await tool_registry.invoke(str(params.get("name", "")), params.get("arguments", {}), runtime.config.get("tools", {}), store)
    if method == "secrets.resolve":
        ref = params.get("ref", {})
        if ref.get("source") == "env":
            name = str(ref.get("id", ""))
            if not name or not name.replace("_", "").isalnum():
                raise ValueError("Invalid environment secret reference")
            value = os.environ.get(name)
            if value is None:
                raise ValueError("Secret environment variable is not set")
            return {"value": value}
        if ref.get("source") == "file":
            secret_path = Path(str(ref.get("id", ""))).expanduser().resolve()
            allowed_root = root.resolve()
            if allowed_root not in secret_path.parents:
                raise ValueError("File secret reference must be inside the state directory")
            return {"value": secret_path.read_text("utf-8")}
        raise ValueError("Supported secret sources are env and state-dir file")
    if method == "security.preset":
        if params.get("name") != "strict":
            raise ValueError("Unknown security preset")
        target_config = config_path(root)
        strict = {"gateway": {"bind": "loopback", "port": 18800, "auth": {"mode": "token", "token": os.environ.get("TALOS_GATEWAY_TOKEN")}, "maxConcurrentRuns": 4}, "session": {"dmScope": "per-channel-peer"}, "agents": {"defaults": {"model": "echo", "timeoutSeconds": 300, "sandbox": {"mode": "non-main", "backend": "docker", "workspaceAccess": "ro"}}}, "security": {"dmPolicy": "pairing", "nodes": {"allowCommands": [], "denyCommands": ["system.run", "camera.snap", "screen.record"]}}, "tools": {"profile": "messaging", "exec": {"security": "deny", "ask": "always"}}}
        validated = TalosConfig.model_validate(strict)
        target_config.write_text(json.dumps(validated.model_dump(by_alias=True, exclude_none=True), indent=2), encoding="utf-8")
        store.audit("security.preset", {"name": "strict"})
        return {"applied": True, "name": "strict", "path": str(target_config)}
    if method == "security.audit":
        findings = []
        cfg = load_config(config_path(root))
        if cfg.gateway.auth.mode == "none":
            findings.append({"id": "gateway-auth-disabled", "severity": "critical", "message": "Gateway authentication is disabled"})
        if not cfg.gateway.auth.token and cfg.gateway.auth.mode == "token":
            findings.append({"id": "gateway-token-missing", "severity": "high", "message": "Set TALOS_GATEWAY_TOKEN or configure a token"})
        if not config_path(root).exists():
            findings.append({"id": "config-not-persisted", "severity": "low", "message": "Gateway is using environment/default configuration"})
        if cfg.agents.defaults.model != "echo" and cfg.agents.defaults.model not in cfg.models:
            findings.append({"id": "model-unconfigured", "severity": "high", "message": f"Active model {cfg.agents.defaults.model} has no provider configuration"})
        for channel_id, channel_cfg in cfg.channels.items():
            if channel_cfg.get("dmPolicy", "pairing") == "open":
                findings.append({"id": "channel-dm-open", "severity": "high", "message": f"Direct messages are open for channel {channel_id}"})
        for plugin in discover_plugins(root / "plugins"):
            if plugin.get("permissions"):
                findings.append({"id": "plugin-permissions-review", "severity": "medium", "message": f"Review requested permissions for plugin {plugin['id']}"})
        result = {"findings": findings, "ok": not findings}
        if params.get("deep"):
            with store._connect() as db:
                integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
            checks = [{"id": "database-integrity", "status": "ok" if integrity == "ok" else "error"}]
            if integrity != "ok":
                findings.append({"id": "database-integrity", "severity": "critical", "message": f"SQLite integrity check failed: {integrity}"})
            workspace = Path(cfg.agents.defaults.workspace or root / "workspace")
            workspace_exists = workspace.is_dir()
            checks.append({"id": "workspace", "status": "ok" if workspace_exists else "warning"})
            if not workspace_exists:
                findings.append({"id": "workspace-missing", "severity": "low", "message": f"Workspace directory does not exist: {workspace}"})
            result["deep"] = True
            result["checks"] = checks
            result["ok"] = not findings
        return result
    if method == "doctor":
        with store._connect() as db:
            integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        workspace = Path(runtime.workspace) if runtime.workspace else root / "workspace"
        checks = [
            {"id": "config", "status": "ok"},
            {"id": "sqlite", "status": "ok" if integrity == "ok" else "error", "detail": integrity},
            {"id": "gateway-token", "status": "ok" if config.gateway.auth.mode == "none" or config.gateway.auth.token else "warning"},
            {"id": "workspace", "status": "ok" if workspace.is_dir() else "warning"},
        ]
        return {"ok": all(item["status"] == "ok" for item in checks), "checks": checks, "stateDir": str(root)}
    if method == "config.get":
        return {"config": load_config(config_path(root)).model_dump(by_alias=True)}
    if method == "config.schema.lookup":
        schema = TalosConfig.model_json_schema(by_alias=True)
        path = params.get("path", [])
        if isinstance(path, str):
            path = [part for part in path.split(".") if part]
        if not isinstance(path, list) or any(not isinstance(part, str) for part in path):
            raise ValueError("Schema path must be a string or string array")
        current: Any = schema
        for part in path:
            while isinstance(current, dict) and "$ref" in current:
                reference = current["$ref"]
                if not isinstance(reference, str) or not reference.startswith("#/$defs/"):
                    raise ValueError("Unsupported config schema reference")
                current = schema["$defs"].get(reference.rsplit("/", 1)[-1])
                if current is None:
                    raise ValueError("Config schema reference is unresolved")
            if isinstance(current, dict) and part in current:
                current = current[part]
            elif isinstance(current, dict) and part in current.get("properties", {}):
                current = current["properties"][part]
            else:
                raise ValueError(f"Config schema path not found: {'.'.join(path)}")
        while isinstance(current, dict) and "$ref" in current:
            reference = current["$ref"]
            if not isinstance(reference, str) or not reference.startswith("#/$defs/"):
                raise ValueError("Unsupported config schema reference")
            current = schema["$defs"].get(reference.rsplit("/", 1)[-1])
            if current is None:
                raise ValueError("Config schema reference is unresolved")
        return {"path": path, "schema": current}
    if method == "config.validate":
        return {"valid": True, "config": TalosConfig.model_validate(params.get("config", {})).model_dump(by_alias=True)}
    if method == "config.migrate":
        migrated, changes = migrate_config(params.get("config", {}))
        validated = TalosConfig.model_validate(migrated)
        return {"config": validated.model_dump(by_alias=True, exclude_none=True), "migrations": changes}
    if method in {"config.patch", "config.apply"}:
        candidate = load_config(config_path(root)).model_dump(by_alias=True, exclude_none=True)
        patch = params.get("patch", {})
        if not isinstance(patch, dict):
            raise ValueError("Config patch must be an object")
        _deep_merge(candidate, patch)
        validated = TalosConfig.model_validate(candidate)
        target = config_path(root)
        target.write_text(json.dumps(validated.model_dump(by_alias=True, exclude_none=True), indent=2), encoding="utf-8")
        store.audit("config.applied", {"keys": sorted(patch)})
        if config is not None:
            config.gateway.port = validated.gateway.port
            config.gateway.bind = validated.gateway.bind
            config.gateway.auth.mode = validated.gateway.auth.mode
            config.gateway.auth.token = validated.gateway.auth.token
            config.gateway.maxConcurrentRuns = validated.gateway.maxConcurrentRuns
        runtime.config = validated.model_dump(by_alias=True, exclude_none=True)
        runtime.model = validated.agents.defaults.model
        runtime.timeout_seconds = validated.agents.defaults.timeoutSeconds
        return {"applied": True, "config": validated.model_dump(by_alias=True, exclude_none=True), "restartRequired": True}
    if method == "audit.list":
        return {"events": store.audit_events(int(params.get("limit", 100)))}
    raise ValueError(f"Unknown method: {method}")


def _cron_delivery_target(params: dict[str, Any], existing: dict[str, Any] | None = None) -> tuple[str | None, str | None]:
    channel = params.get("deliveryChannel", (existing or {}).get("delivery_channel"))
    peer_id = params.get("deliveryPeerId", (existing or {}).get("delivery_peer_id"))
    if channel is None and peer_id is None:
        return None, None
    if not isinstance(channel, str) or not channel.strip() or not isinstance(peer_id, str) or not peer_id.strip():
        raise ValueError("deliveryChannel and deliveryPeerId must both be non-empty strings")
    return channel, peer_id


async def _run_cron_job(
    job: dict[str, Any],
    store: Store,
    runtime: AgentRuntime,
    channels: ChannelRegistry | None = None,
    delivery_tasks: set[asyncio.Task[Any]] | None = None,
) -> str:
    session = store.create_session(job["session_key"])
    run_id = store.create_run(session["id"])
    store.record_cron_run(job["id"], run_id)
    await runtime.start(session["id"], job["message"], run_id)
    delivery_channel = job.get("delivery_channel")
    delivery_peer_id = job.get("delivery_peer_id")

    async def finish_run() -> None:
        outcome = await runtime.wait(run_id, timeout=runtime.timeout_seconds + 5)
        if not outcome or outcome["status"] == "running":
            store.finish_cron_run(run_id, "timeout")
            store.audit("cron.run_timeout", {"jobId": job["id"], "runId": run_id})
            return
        if outcome["status"] != "ok":
            store.finish_cron_run(run_id, outcome["status"])
            return
        reply = str((outcome.get("result") or {}).get("reply", ""))
        if delivery_channel and delivery_peer_id and reply and reply != "HEARTBEAT_OK":
            try:
                if channels is None:
                    raise RuntimeError("Channel delivery is unavailable")
                response = await channels.send(delivery_channel, delivery_peer_id, reply)
                if response.get("ok") is False:
                    raise RuntimeError("Channel rejected the cron announcement")
            except Exception as exc:
                store.finish_cron_run(run_id, "delivery_failed")
                store.audit("cron.delivery_failed", {
                    "jobId": job["id"],
                    "runId": run_id,
                    "channel": delivery_channel,
                    "errorType": type(exc).__name__,
                })
                return
        store.finish_cron_run(run_id, "ok")

    task = asyncio.create_task(finish_run())
    if delivery_tasks is not None:
        delivery_tasks.add(task)
        task.add_done_callback(delivery_tasks.discard)
    return run_id


async def _run_heartbeat(store: Store, runtime: AgentRuntime) -> None:
    session = store.create_session("main")
    run_id = store.create_run(session["id"])
    await runtime.start(session["id"], "Review HEARTBEAT.md and perform due tasks. Reply HEARTBEAT_OK if there is nothing to do.", run_id)
    with store._connect() as db:
        db.execute("UPDATE heartbeat_state SET last_run=? WHERE id=1", (time.time(),))


def _deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> None:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
        else:
            target[key] = value


app = create_app(Path(":memory:")) if not os.environ.get("TALOS_STATE_DIR") else create_app()
