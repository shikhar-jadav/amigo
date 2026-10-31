"""Operator CLI for the local Talos gateway."""
import asyncio
import argparse
import json
import os
import secrets
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

import uvicorn
from pydantic import ValidationError

from .config import ModelConfig, load_config, state_dir
from .plugins import PluginRegistry
from .protocol import protocol_json_schema
from .skills import eligible_skills
from .operations import GatewayLock, export_diagnostics
from .operations import sanitize
from .providers import model_candidates, provider_for


def _print(value: Any, as_json: bool = True) -> None:
    print(json.dumps(value, indent=2, default=str) if as_json else str(value))


def _config_issues(error: Exception) -> list[dict[str, str]]:
    if isinstance(error, ValidationError):
        return [
            {"path": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
            for item in error.errors()
        ]
    return [{"path": "config", "message": "Configuration could not be parsed or read"}]


async def _verify_inference(config: Any) -> str:
    config_data = config.model_dump(by_alias=True, exclude_none=True)
    selected_model = config.agents.defaults.model
    errors = []
    for candidate in model_candidates(selected_model, config_data):
        configured = provider_for(candidate, config_data)
        if configured is None:
            continue
        provider, provider_model = configured
        try:
            response = await asyncio.wait_for(
                provider.complete(
                    [{"role": "user", "content": "Reply with a short readiness confirmation."}],
                    provider_model,
                ),
                timeout=30,
            )
        except (RuntimeError, asyncio.TimeoutError, OSError) as exc:
            errors.append(f"{candidate}: {exc}")
            continue
        if isinstance(response, str) and response.strip():
            return candidate
        errors.append(f"{candidate}: provider returned no text response")

    if not errors:
        raise RuntimeError(
            "No real inference provider is configured; the echo model is development-only. "
            "Configure agents.defaults.model and models.<id>, or use --baseline."
        )
    raise RuntimeError("Inference verification failed: " + "; ".join(errors))


def _write_private_config(root: Path, config: Any) -> Path:
    target = root / "amigo.json5"
    content = json.dumps(config.model_dump(by_alias=True, exclude_none=True), indent=2) + "\n"
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=root,
            prefix=".amigo-config-",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)
        if os.name != "nt":
            temporary_path.chmod(0o600)
        os.replace(temporary_path, target)
        if os.name != "nt":
            target.chmod(0o600)
        return target
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(prog="amigo")
    commands = parser.add_subparsers(dest="command", required=True)
    gateway = commands.add_parser("gateway")
    gateway.add_argument("action", choices=["run", "status", "probe", "diagnostics"], nargs="?", default="run")
    onboard = commands.add_parser("onboard", aliases=["setup"])
    onboard.add_argument("--baseline", action="store_true", help="Create secure baseline config and workspace without an inference check")
    onboard.add_argument("--non-interactive", action="store_true", help="Run without prompting; this is the default")
    onboard.add_argument("--model", help="Select an already configured model")
    onboard.add_argument("--workspace", help="Set the agent workspace directory")
    for name in ("doctor", "status"):
        commands.add_parser(name)
    for name, actions in {
        "agent": ["list", "run", "wait", "abort"],
        "channel": ["list", "status", "capabilities"],
        "node": ["list", "pending", "describe", "invoke", "host"],
        "approval": ["list", "resolve"],
        "plugin": ["list", "install", "enable", "disable", "inspect", "doctor", "reload", "uninstall", "init", "validate", "call"],
        "skill": ["list", "check", "install", "verify"],
        "model": ["list", "set"],
        "browser": ["status", "profiles", "tabs", "open", "create-profile"],
        "heartbeat": ["status", "enable", "disable", "run"],
        "usage": ["show"],
        "session": ["list", "show", "reset", "delete", "cleanup", "compact"],
        "cron": ["list", "add", "remove", "run", "runs", "enable", "disable", "edit"],
        "pairing": ["list", "approve", "reject"],
        "memory": ["status", "index", "search", "add", "delete", "dream"],
        "security": ["audit", "preset"],
        "config": ["get", "validate", "apply", "migrate"],
        "backup": ["create", "verify", "restore"],
        "audit": ["list"],
        "protocol": ["schema"],
    }.items():
        alias = {"plugin": "plugins", "skill": "skills", "model": "models", "session": "sessions"}.get(name)
        sub = commands.add_parser(name, aliases=[alias] if alias else [])
        sub.add_argument("action", choices=actions)
        sub.add_argument("value", nargs="?")
        sub.add_argument("--json", action="store_true")
        sub.add_argument("--output")
        if name == "security":
            sub.add_argument("--deep", action="store_true", help="Include database and workspace integrity checks")
        if name == "cron":
            schedule = sub.add_mutually_exclusive_group()
            schedule.add_argument("--cron", dest="cron_expression")
            schedule.add_argument("--at", dest="run_at")
            schedule.add_argument("--every-seconds", type=int)
            sub.add_argument("--name")
            sub.add_argument("--tz", dest="timezone")
            sub.add_argument("--message")
            sub.add_argument("--session-key")
            sub.add_argument("--channel", dest="delivery_channel")
            sub.add_argument("--to", dest="delivery_peer_id")
        if name == "node":
            sub.add_argument("--url", default="ws://127.0.0.1:18800/gateway", help="Gateway WebSocket URL (remote gateways require wss://)")
    args = parser.parse_args()
    args.command = {"plugins": "plugin", "skills": "skill", "models": "model", "sessions": "session", "setup": "onboard"}.get(args.command, args.command)
    if args.command == "node" and args.action == "host":
        from .node_host import HeadlessNodeHost
        from websockets.exceptions import WebSocketException

        try:
            host = HeadlessNodeHost.from_state_dir(args.value or "", os.environ.get("TALOS_NODE_TOKEN"), state_dir())
            result = asyncio.run(host.run(args.url))
            if result.get("status") == "pairing_required":
                result["next"] = f"Approve with amigo pairing approve {result['deviceId']}, then set TALOS_NODE_TOKEN and run this command again."
            _print(result)
            return
        except (OSError, RuntimeError, TimeoutError, ValueError, WebSocketException) as exc:
            _print({"ok": False, "error": {"type": type(exc).__name__, "message": str(exc)}})
            raise SystemExit(1) from exc
    root = state_dir()
    root.mkdir(parents=True, exist_ok=True)
    try:
        config = load_config()
    except (ValidationError, ValueError, OSError) as exc:
        if args.command == "doctor":
            _print({"ok": False, "stateDir": str(root), "checks": [{"id": "config", "status": "error", "issues": _config_issues(exc)}]})
            raise SystemExit(1) from exc
        if args.command == "security" and args.action == "audit":
            _print({"ok": False, "deep": args.deep, "findings": [{"id": "config-invalid", "severity": "critical", "message": "Configuration failed to load; run amigo doctor for details", "issues": _config_issues(exc)}]})
            raise SystemExit(1) from exc
        raise
    from .app import create_app
    app = create_app()
    if args.command == "gateway":
        if args.action == "status":
            _print({"pidFileExists": (root / "gateway.pid").exists(), "port": config.gateway.port})
            return
        if args.action == "probe":
            import urllib.request
            with urllib.request.urlopen(f"http://127.0.0.1:{config.gateway.port}/health", timeout=3) as response:
                _print(json.loads(response.read()))
            return
        if args.action == "diagnostics":
            _print(export_diagnostics(root, root / "diagnostics.json", config.model_dump(by_alias=True), []))
            return
        lock = GatewayLock(root)
        lock.acquire()
        try:
            uvicorn.run(app, host="127.0.0.1", port=config.gateway.port, http="h11")
        finally:
            lock.release()
        return
    if args.command == "doctor":
        result = asyncio.run(app.state.dispatch("doctor", {}))
        _print(result)
        if result.get("ok") is False:
            raise SystemExit(1)
        return
    if args.command == "status":
        result = {"ok": True, "version": app.version, "stateDir": str(root), "config": sanitize(config.model_dump(by_alias=True)), "sessions": len(app.state.store.list_sessions()), "models": list(config.models)}
        _print(result)
        return
    if args.command == "onboard":
        try:
            if args.model:
                if args.model != "echo" and args.model not in config.models:
                    raise ValueError(f"Model {args.model!r} is not configured in amigo.json5")
                config.agents.defaults.model = args.model
            elif (
                config.agents.defaults.model == "echo"
                and not config.models
                and os.environ.get("MISTRAL_API_KEY", "").strip()
            ):
                model_name = "codestral-2508"
                config.models[model_name] = ModelConfig(
                    provider="openai-compatible",
                    model=model_name,
                    baseUrl="https://api.mistral.ai/v1",
                    apiKeyEnv="MISTRAL_API_KEY",
                )
                config.agents.defaults.model = model_name
            if args.workspace:
                config.agents.defaults.workspace = str(Path(args.workspace).expanduser().resolve())
            if not args.baseline:
                verified_model = asyncio.run(_verify_inference(config))
            else:
                verified_model = None

            if config.gateway.auth.mode == "token" and not config.gateway.auth.token:
                config.gateway.auth.token = os.environ.get("TALOS_GATEWAY_TOKEN") or secrets.token_urlsafe(32)
            target_config = _write_private_config(root, config)
            workspace = Path(config.agents.defaults.workspace or (root / "workspace")).expanduser()
            workspace.mkdir(parents=True, exist_ok=True)
            seeds = {
                "SOUL.md": "# Soul\nBe helpful, honest, and safe.\n",
                "IDENTITY.md": "# Identity\nName: Amigo\n",
                "USER.md": "# User\n",
                "MEMORY.md": "# Memory\n",
            }
            for filename, content in seeds.items():
                seed_path = workspace / filename
                if not seed_path.exists():
                    seed_path.write_text(content, encoding="utf-8")
            with app.state.store._connect() as db:
                integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"SQLite readiness check failed: {integrity}")
            _print({
                "ok": True,
                "stateDir": str(root),
                "config": str(target_config),
                "workspace": str(workspace),
                "gatewayAuth": "configured" if config.gateway.auth.mode == "token" else "disabled",
                "inferenceVerified": verified_model is not None,
                "model": verified_model or config.agents.defaults.model,
                "channels": app.state.channels.list(),
                "skillsReady": True,
                "databaseReady": True,
            })
        except (RuntimeError, ValueError, OSError) as exc:
            phase = "setup" if args.baseline else "inference"
            _print({"ok": False, "error": {"type": "onboarding_failed", "phase": phase, "message": str(exc)}})
            sys.exit(1)
        return
    if args.command == "protocol":
        content = json.dumps(protocol_json_schema(), indent=2)
        if args.output:
            Path(args.output).write_text(content + "\n", encoding="utf-8")
        else:
            print(content)
        return
    if args.command == "plugin":
        registry = app.state.plugin_registry or PluginRegistry(root / "plugins")
        if args.action == "list": result = {"plugins": registry.list()}
        elif args.action == "install": result = {"plugin": registry.install(Path(args.value))}
        elif args.action in {"enable", "disable"}: result = {"plugin": registry.set_enabled(args.value, args.action == "enable")}
        elif args.action == "inspect": result = {"plugin": next(item for item in registry.list() if item["id"] == args.value)}
        elif args.action == "init": result = {"path": str(registry.init(args.value or "new-plugin"))}
        elif args.action == "uninstall": result = {"removed": registry.uninstall(args.value or "")}
        elif args.action == "validate":
            from .plugins import PluginManifest
            result = {"manifest": PluginManifest.model_validate_json(Path(args.value).read_text("utf-8")).model_dump()}
        elif args.action == "call":
            result = asyncio.run(registry.invoke_isolated(args.value or "", "call", {}))
        elif args.action == "reload": result = {"plugins": registry.reload()}
        elif args.action == "doctor":
            result = asyncio.run(app.state.dispatch("plugins.doctor", {}))
        else: result = {"ok": True, "plugins": registry.list()}
        _print(result)
        return
    if args.command == "skill":
        if args.action == "install":
            from .skills import install_skill
            result = {"skill": install_skill(Path(args.value or ""), root / "skills")}
        elif args.action == "verify":
            from .skills import skill_card
            result = {"card": skill_card(Path(args.value or ""))}
        else:
            result = {"skills": eligible_skills([root / "skills", Path.cwd() / "skills"])}
        _print(result)
        return
    async def run_rpc() -> Any:
        dispatch = app.state.dispatch
        action, value = args.action, args.value
        if args.command == "model":
            if action == "set": return await dispatch("models.set", {"model": value}, "cli-model-set")
            return await dispatch("models.list", {})
        if args.command == "agent":
            if action == "list": return await dispatch("agents.list", {})
            if action == "run": return await dispatch("agent", {"message": value or "", "sessionKey": "main"}, f"cli-agent-{uuid.uuid4()}")
            if action == "wait": return await dispatch("agent.wait", {"runId": value or "", "timeout": 30})
            return await dispatch("agent.abort", {"runId": value or ""})
        if args.command == "channel":
            return await dispatch({"list": "channels.list", "status": "channels.status", "capabilities": "channels.capabilities"}[action], {})
        if args.command == "node":
            if action == "invoke":
                payload = json.loads(value or "{}")
                if not isinstance(payload, dict): raise ValueError("node invoke expects a JSON object")
                return await dispatch("node.invoke", payload, f"cli-node-invoke-{uuid.uuid4()}")
            method = {"list": "node.list", "pending": "node.pending", "describe": "node.describe"}[action]
            return await dispatch(method, {"deviceId": value} if action == "describe" else {})
        if args.command == "approval":
            if action == "list": return await dispatch("approvals.get", {})
            payload = json.loads(value or "{}")
            if not isinstance(payload, dict): raise ValueError("approval resolve expects a JSON object")
            return await dispatch("approvals.resolve", payload, f"cli-approval-resolve-{uuid.uuid4()}")
        if args.command == "browser":
            params = {"url": value, "id": "amigo", "name": "Managed Browser"}
            method = {"status": "browser.status", "profiles": "browser.profiles", "tabs": "browser.tabs", "open": "browser.open", "create-profile": "browser.create-profile"}[action]
            return await dispatch(method, params, f"cli-browser-{action}-{value}" if action == "create-profile" else None)
        if args.command == "heartbeat":
            method = {"status": "system.heartbeat.status", "enable": "system.heartbeat.enable", "disable": "system.heartbeat.disable", "run": "system.heartbeat.run"}[action]
            return await dispatch(method, {}, f"cli-heartbeat-{action}" if action in {"enable", "disable", "run"} else None)
        if args.command == "usage":
            return await dispatch("status.usage", {})
        if args.command == "session":
            mapping = {"list": ("sessions.list", {}), "show": ("sessions.get", {"sessionId": value}), "reset": ("sessions.reset", {"sessionId": value}), "delete": ("sessions.delete", {"sessionId": value}), "cleanup": ("sessions.cleanup", {}), "compact": ("sessions.compact", json.loads(value or "{}"))}
        elif args.command == "cron":
            add_params = json.loads(value or "{}") if action == "add" else {}
            if action == "add":
                if args.cron_expression is not None:
                    add_params.update({"scheduleKind": "cron", "schedule": args.cron_expression})
                elif args.run_at is not None:
                    add_params.update({"scheduleKind": "at", "runAt": args.run_at})
                elif args.every_seconds is not None:
                    add_params.update({"scheduleKind": "every", "intervalSeconds": args.every_seconds})
                for argument, parameter in (("name", "name"), ("timezone", "timezone"), ("message", "message"), ("session_key", "sessionKey"), ("delivery_channel", "deliveryChannel"), ("delivery_peer_id", "deliveryPeerId")):
                    supplied = getattr(args, argument)
                    if supplied is not None:
                        add_params[parameter] = supplied
            mapping = {"list": ("cron.list", {}), "add": ("cron.add", add_params), "remove": ("cron.rm", {"id": value}), "run": ("cron.run", {"id": value}), "runs": ("cron.runs", {"id": value}), "enable": ("cron.enable", {"id": value}), "disable": ("cron.disable", {"id": value}), "edit": ("cron.edit", json.loads(value or "{}"))}
        elif args.command == "pairing":
            mapping = {"list": ("pairing.list", {}), "approve": ("pairing.approve", {"deviceId": value}), "reject": ("pairing.reject", {"deviceId": value})}
        elif args.command == "memory":
            mapping = {"status": ("memory.status", {}), "index": ("memory.index", {}), "search": ("memory.search", {"query": value or ""}), "add": ("memory.add", json.loads(value or "{}")), "delete": ("memory.delete", {"id": value}), "dream": ("memory.dream", {})}
        elif args.command == "security":
            mapping = {"audit": ("security.audit", {"deep": args.deep}), "preset": ("security.preset", {"name": value or "strict"})}
        elif args.command == "config":
            mapping = {"get": ("config.get", {}), "validate": ("config.validate", {"config": json.loads(value or "{}")}), "apply": ("config.apply", {"patch": json.loads(value or "{}")} ), "migrate": ("config.migrate", {"config": json.loads(value or "{}")} )}
        elif args.command == "backup":
            return _backup(root, action, value)
        elif args.command == "audit":
            mapping = {"list": ("audit.list", {})}
        else:
            raise ValueError(f"Unsupported command {args.command}")
        method, params = mapping[action]
        side_effecting = {"agent", "sessions.reset", "sessions.delete", "sessions.cleanup", "sessions.compact", "cron.add", "cron.rm", "cron.run", "cron.edit", "cron.enable", "cron.disable", "pairing.approve", "pairing.reject", "security.preset", "config.apply", "memory.add", "memory.index", "memory.delete", "approvals.resolve", "plugins.install", "plugins.enable", "plugins.disable", "plugins.uninstall", "plugins.reload", "models.set", "system.heartbeat.enable", "system.heartbeat.disable", "system.heartbeat.run", "node.invoke"}
        key = f"cli-{uuid.uuid4()}" if method in side_effecting else None
        return await dispatch(method, params, key)
    try:
        result = asyncio.run(run_rpc())
        _print(result)
        if isinstance(result, dict) and result.get("ok") is False:
            sys.exit(1)
    except Exception as exc:
        _print({"ok": False, "error": {"type": "cli_error", "message": str(exc)}})
        sys.exit(1)


def _backup(root: Path, action: str, destination: str | None) -> dict[str, Any]:
    from .backup import create_backup, restore_backup, verify_backup
    source = root / "talos.sqlite3"
    target = Path(destination) if destination else root / "backups" / f"talos-{source.stat().st_mtime_ns}.sqlite3"
    if action == "create":
        manifest = create_backup(source, target)
        return {"created": True, "path": str(target), "manifest": manifest}
    if action == "verify":
        return verify_backup(target if destination else source)
    if action == "restore":
        if not destination:
            raise ValueError("backup restore requires the backup file path")
        return restore_backup(Path(destination), source)
    raise ValueError("Unknown backup action")


if __name__ == "__main__":
    main()
