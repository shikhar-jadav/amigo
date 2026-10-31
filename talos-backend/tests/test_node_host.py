import asyncio
import json
import os
import socket
import sys
import time
from pathlib import Path

import pytest

from talos_backend.app import create_app
from talos_backend.node_host import (
    MAX_COMMAND_OUTPUT_BYTES,
    execute_system_run,
    load_or_create_identity,
    validate_gateway_url,
)


def test_headless_node_identity_and_gateway_url_are_restricted(tmp_path):
    key_path = tmp_path / "node-identities" / "node-1.ed25519"
    first = load_or_create_identity(key_path.parent, "node-1")
    second = load_or_create_identity(key_path.parent, "node-1")
    assert first.private_bytes_raw() == second.private_bytes_raw()
    assert len(key_path.read_bytes()) == 32

    with pytest.raises(ValueError, match="device id"):
        load_or_create_identity(key_path.parent, "../outside")
    for reserved in ("CON", "nul.txt", "COM1", "node."):
        with pytest.raises(ValueError, match="device id"):
            load_or_create_identity(key_path.parent, reserved)
    for url in (
        "ws://gateway.example/gateway",
        "wss://user:pass@gateway.example/gateway",
        "wss://gateway.example/gateway?token=secret",
        "wss://user:secret@gateway.example/gateway",
        "ftp://gateway.example/gateway",
        None,
        "   ",
    ):
        with pytest.raises(ValueError):
            validate_gateway_url(url)
    assert validate_gateway_url("ws://127.0.0.1:18800/gateway")


def test_system_run_caps_combined_output_and_rejects_unbounded_timeout():
    script = f"import sys; sys.stdout.write('x' * {MAX_COMMAND_OUTPUT_BYTES}); sys.stderr.write('y' * 4096)"
    result = execute_system_run({"command": [sys.executable, "-c", script]})
    assert result["returnCode"] == 0
    assert result["outputLimitBytes"] == MAX_COMMAND_OUTPUT_BYTES
    assert result["outputBytes"] == MAX_COMMAND_OUTPUT_BYTES + 4096
    assert result["truncated"] is True
    assert result["truncationMarker"] == (
        f"[output truncated: {MAX_COMMAND_OUTPUT_BYTES + 4096} bytes total; "
        f"limit {MAX_COMMAND_OUTPUT_BYTES}]"
    )
    assert len(result["stdout"].encode()) + len(result["stderr"].encode()) <= MAX_COMMAND_OUTPUT_BYTES

    invalid_output = execute_system_run({
        "command": [sys.executable, "-c", "import os; os.write(1, b'\\xff\\x1b[31mred')"],
    })
    assert invalid_output["encodingErrors"] is True
    assert "\x1b" not in invalid_output["stdout"]
    assert len(invalid_output["stdout"].encode()) <= len(b"\xff\x1b[31mred")

    rejected = execute_system_run({"command": [sys.executable, "-c", "print('should not run')"], "timeout": 301})
    assert rejected["error"]["type"] == "invalid_arguments"
    assert execute_system_run({"command": [sys.executable, "\0"]})["error"]["type"] == "invalid_arguments"
    timed_out = execute_system_run({
        "command": [sys.executable, "-c", "import time; time.sleep(2)"],
        "timeout": 1,
    })
    assert timed_out["timedOut"] is True
    assert timed_out["returnCode"] != 0

    child_script = "import time; time.sleep(20)"
    parent_script = (
        "import subprocess,sys,time; "
        f"subprocess.Popen([sys.executable, '-c', {child_script!r}]); "
        "time.sleep(20)"
    )
    started = time.monotonic()
    tree_timeout = execute_system_run({
        "command": [sys.executable, "-c", parent_script],
        "timeout": 1,
    })
    assert tree_timeout["timedOut"] is True
    assert time.monotonic() - started < 8


def test_system_run_does_not_inherit_or_accept_sensitive_environment_variables(monkeypatch):
    sentinel = "node-token-must-not-reach-child"
    monkeypatch.setenv("TALOS_NODE_TOKEN", sentinel)
    monkeypatch.setenv("DATABASE_URL", sentinel)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", sentinel)
    result = execute_system_run({
        "command": [
            sys.executable,
            "-c",
            "import os; print([os.getenv(k) for k in ('TALOS_NODE_TOKEN','DATABASE_URL','AWS_ACCESS_KEY_ID')])",
        ],
    })
    assert result["stdout"].strip() == "[None, None, None]"
    assert sentinel not in result["stdout"]

    rejected = execute_system_run({
        "command": [sys.executable, "-c", "print('not run')"],
        "env": {"SERVICE_API_KEY": sentinel},
    })
    assert rejected["error"]["type"] == "invalid_arguments"


def test_headless_node_pairs_then_runs_only_after_operator_approval(tmp_path, monkeypatch):
    import base64
    import uvicorn

    monkeypatch.setenv("TALOS_GATEWAY_TOKEN", "operator-secret")
    (tmp_path / "amigo.json5").write_text(json.dumps({
        "security": {"nodes": {"allowCommands": ["system.run"], "denyCommands": []}},
    }), encoding="utf-8")
    app = create_app(tmp_path)
    server = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False))
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    listener.setblocking(False)
    port = listener.getsockname()[1]
    server_task = None
    node_process = None
    marker = tmp_path / "command-ran.txt"

    async def scenario():
        nonlocal server_task, node_process
        server_task = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            for _ in range(500):
                if server.started:
                    break
                await asyncio.sleep(0.01)
            assert server.started

            url = f"ws://127.0.0.1:{port}/gateway"
            command = [
                sys.executable,
                "-m",
                "talos_backend.cli",
                "node",
                "host",
                "headless-demo",
                "--url",
                url,
            ]
            node_env = os.environ.copy()
            node_env.pop("TALOS_GATEWAY_TOKEN", None)
            node_env.pop("TALOS_NODE_TOKEN", None)
            node_env["TALOS_STATE_DIR"] = str(tmp_path / "node-state")
            pairing_process = await asyncio.create_subprocess_exec(
                *command,
                cwd=Path(__file__).resolve().parents[1],
                env=node_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            pairing_stdout, pairing_stderr = await asyncio.wait_for(pairing_process.communicate(), timeout=10)
            assert pairing_process.returncode == 0, pairing_stderr.decode("utf-8", errors="replace")
            pairing = json.loads(pairing_stdout)
            assert pairing["status"] == "pairing_required"
            assert pairing["deviceId"] == "headless-demo"
            pending = app.state.store.get_device("headless-demo")
            assert pending and pending["status"] == "pending"
            assert base64.b64decode(pending["public_key"], validate=True)

            approved = await app.state.dispatch("pairing.approve", {"deviceId": "headless-demo"}, "approve-headless-demo")
            node_env["TALOS_NODE_TOKEN"] = approved["device"]["token"]
            node_process = await asyncio.create_subprocess_exec(
                *command,
                cwd=Path(__file__).resolve().parents[1],
                env=node_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            for _ in range(500):
                if any(node["deviceId"] == "headless-demo" for node in app.state.store.list_nodes()):
                    break
                assert node_process.returncode is None, "headless CLI exited before connecting"
                await asyncio.sleep(0.01)
            assert any(node["deviceId"] == "headless-demo" for node in app.state.store.list_nodes())

            arguments = {
                "command": [sys.executable, "-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).write_text('executed')", str(marker)],
                "timeout": 15,
            }
            request = await app.state.dispatch("node.invoke", {
                "deviceId": "headless-demo",
                "command": "system.run",
                "arguments": arguments,
            }, "request-approved-command")
            assert request["status"] == "approval_required"
            assert not marker.exists()

            resolved = await app.state.dispatch("approvals.resolve", {
                "id": request["approval"]["id"],
                "approved": True,
            }, "approve-system-run")
            assert resolved["resolved"] is True
            assert resolved["outcome"]["returnCode"] == 0
            assert marker.read_text("utf-8") == "executed"
        finally:
            if node_process and node_process.returncode is None:
                node_process.terminate()
                try:
                    await asyncio.wait_for(node_process.communicate(), timeout=5)
                except asyncio.TimeoutError:
                    node_process.kill()
                    await node_process.communicate()
            server.should_exit = True
            if server_task:
                await asyncio.wait_for(server_task, timeout=5)

    asyncio.run(scenario())
