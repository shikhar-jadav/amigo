"""Approval-gated headless node host for the Gateway WebSocket protocol."""
import asyncio
import base64
import ipaddress
import json
import os
import re
import shlex
import signal
import subprocess
import threading
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

MAX_COMMAND_OUTPUT_BYTES = 1_048_576
MAX_COMMAND_TIMEOUT_SECONDS = 300
SENSITIVE_ENV_NAME = re.compile(
    r"(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|"
    r"CLIENT[_-]?SECRET|AUTH|DATABASE|CONNECTION|DSN|COOKIE|PROXY)",
    re.IGNORECASE,
)
SAFE_BASE_ENV_NAMES = {
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "SYSTEMDRIVE",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "COMSPEC",
}
WINDOWS_RESERVED_NAME = re.compile(
    r"(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?",
    re.IGNORECASE,
)


def validate_device_id(value: object) -> str:
    if (
        not isinstance(value, str)
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value)
        or value.endswith(".")
        or WINDOWS_RESERVED_NAME.fullmatch(value)
    ):
        raise ValueError("device id must be 1-128 letters, digits, dots, underscores, or hyphens")
    return value


def validate_gateway_url(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Gateway URL is required")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Gateway URL is malformed") from exc
    if parsed.scheme not in {"ws", "wss"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query:
        raise ValueError("Gateway URL must use ws/wss, have a host, and contain no credentials or fragment")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("Gateway URL port is invalid")
    if parsed.scheme == "ws" and parsed.hostname.lower() not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Unencrypted WebSocket connections are allowed only to loopback")
    return value


def load_or_create_identity(directory: Path, device_id: str) -> Ed25519PrivateKey:
    device_id = validate_device_id(device_id)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    if directory.is_symlink():
        raise ValueError("Node identity directory may not be a symlink")
    if os.name != "nt":
        directory.chmod(0o700)
    path = directory / f"{device_id}.ed25519"
    if path.is_symlink():
        raise ValueError("Node identity file may not be a symlink")
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
    except FileNotFoundError:
        key = Ed25519PrivateKey.generate()
        raw = key.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
        try:
            flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
            descriptor = os.open(path, flags, 0o600)
        except FileExistsError:
            return load_or_create_identity(directory, device_id)
        try:
            with os.fdopen(descriptor, "wb") as target:
                target.write(raw)
                target.flush()
                os.fsync(target.fileno())
        except OSError:
            path.unlink(missing_ok=True)
            raise
        if os.name != "nt":
            path.chmod(0o600)
        return key
    with os.fdopen(descriptor, "rb") as source:
        raw = source.read(33)
    if len(raw) != 32:
        raise ValueError("Node identity file is malformed")
    if os.name != "nt":
        path.chmod(0o600)
    return Ed25519PrivateKey.from_private_bytes(raw)


def _safe_text(raw: bytes) -> str:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="ignore")
    return "".join(char for char in text if char in "\r\n\t" or unicodedata.category(char) != "Cc")


def _kill_process_tree(process: subprocess.Popen[Any]) -> None:
    if os.name == "nt":
        system_root = os.environ.get("SystemRoot") or os.environ.get("WINDIR")
        taskkill = Path(system_root) / "System32" / "taskkill.exe" if system_root else None
        if taskkill and taskkill.is_file():
            try:
                subprocess.run(
                    [str(taskkill), "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                )
                return
            except (OSError, subprocess.TimeoutExpired):
                pass
        process.kill()
        return
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        process.kill()


def execute_system_run(arguments: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        return {"error": {"type": "invalid_arguments", "message": "system.run arguments must be an object"}}
    command = arguments.get("command")
    if isinstance(command, str):
        try:
            argv = shlex.split(command, posix=os.name != "nt")
        except ValueError:
            return {"error": {"type": "invalid_arguments", "message": "command quoting is invalid"}}
    elif isinstance(command, list) and all(isinstance(item, str) for item in command):
        argv = command
    else:
        return {"error": {"type": "invalid_arguments", "message": "command must be a string or string array"}}
    if not argv or not argv[0].strip() or any("\0" in item for item in argv):
        return {"error": {"type": "invalid_arguments", "message": "command arguments are empty or contain a null byte"}}

    timeout = arguments.get("timeout", 30)
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= MAX_COMMAND_TIMEOUT_SECONDS:
        return {"error": {"type": "invalid_arguments", "message": f"timeout must be between 1 and {MAX_COMMAND_TIMEOUT_SECONDS} seconds"}}

    cwd = arguments.get("cwd")
    if cwd is not None and not isinstance(cwd, str):
        return {"error": {"type": "invalid_arguments", "message": "cwd must be a path string"}}
    if cwd is not None and ("\0" in cwd or not Path(cwd).expanduser().is_dir()):
        return {"error": {"type": "invalid_arguments", "message": "cwd must name an existing directory"}}

    child_env = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in SAFE_BASE_ENV_NAMES
    }
    supplied_env = arguments.get("env")
    if supplied_env is not None:
        if not isinstance(supplied_env, dict) or any(
            not isinstance(key, str)
            or not key
            or "=" in key
            or "\0" in key
            or SENSITIVE_ENV_NAME.search(key)
            or not isinstance(value, str)
            or "\0" in value
            for key, value in supplied_env.items()
        ):
            return {"error": {"type": "invalid_arguments", "message": "env must map non-sensitive variable names to strings"}}
        child_env.update(supplied_env)

    captured = [bytearray(), bytearray()]
    captured_size = 0
    total_size = 0
    lock = threading.Lock()

    try:
        process = subprocess.Popen(
            argv,
            cwd=str(Path(cwd).expanduser()) if cwd else None,
            env=child_env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False,
            start_new_session=os.name != "nt",
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
    except (OSError, ValueError):
        return {"error": {"type": "execution_failed", "message": "command could not be started"}}

    def drain(stream: Any, index: int) -> None:
        nonlocal captured_size, total_size
        while True:
            try:
                chunk = stream.read(8192)
            except OSError:
                return
            if not chunk:
                return
            with lock:
                total_size += len(chunk)
                remaining = MAX_COMMAND_OUTPUT_BYTES - captured_size
                if remaining > 0:
                    accepted = chunk[:remaining]
                    captured[index].extend(accepted)
                    captured_size += len(accepted)

    readers = [
        threading.Thread(target=drain, args=(process.stdout, 0), daemon=True),
        threading.Thread(target=drain, args=(process.stderr, 1), daemon=True),
    ]
    for reader in readers:
        reader.start()
    timed_out = False
    try:
        return_code = process.wait(timeout=float(timeout))
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill_process_tree(process)
        return_code = process.wait()
    for reader in readers:
        reader.join()
    truncated = total_size > MAX_COMMAND_OUTPUT_BYTES
    return {
        "returnCode": return_code,
        "stdout": _safe_text(bytes(captured[0])),
        "stderr": _safe_text(bytes(captured[1])),
        "outputBytes": total_size,
        "outputLimitBytes": MAX_COMMAND_OUTPUT_BYTES,
        "truncated": truncated,
        "truncationMarker": (
            f"[output truncated: {total_size} bytes total; limit {MAX_COMMAND_OUTPUT_BYTES}]"
            if truncated
            else None
        ),
        "encodingErrors": any(
            _has_invalid_utf8(bytes(output))
            for output in captured
        ),
        "timedOut": timed_out,
    }


def _has_invalid_utf8(raw: bytes) -> bool:
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        return True
    return False


class HeadlessNodeHost:
    def __init__(self, device_id: str, token: str | None, private_key: Ed25519PrivateKey):
        self.device_id = validate_device_id(device_id)
        self.token = token.strip() if token and token.strip() else None
        self.private_key = private_key

    @classmethod
    def from_state_dir(cls, device_id: str, token: str | None, state_directory: Path) -> "HeadlessNodeHost":
        identity = load_or_create_identity(state_directory / "node-identities", device_id)
        return cls(device_id, token, identity)

    async def run(self, gateway_url: str = "ws://127.0.0.1:18800/gateway") -> dict[str, Any]:
        url = validate_gateway_url(gateway_url)
        from websockets.asyncio.client import connect
        from websockets.exceptions import ConnectionClosed

        async with connect(url, open_timeout=10, max_size=8 * MAX_COMMAND_OUTPUT_BYTES) as websocket:
            remote = websocket.remote_address
            parsed = urlsplit(url)
            if parsed.scheme == "ws" and (not remote or not ipaddress.ip_address(remote[0]).is_loopback):
                raise ValueError("Unencrypted node connection did not resolve to loopback")
            challenge_frame = json.loads(await websocket.recv())
            nonce = challenge_frame.get("payload", {}).get("nonce")
            if challenge_frame.get("event") != "connect.challenge" or not isinstance(nonce, str) or not nonce:
                raise RuntimeError("Gateway did not issue a valid node challenge")
            public_key = self.private_key.public_key().public_bytes(
                serialization.Encoding.Raw,
                serialization.PublicFormat.Raw,
            )
            frame = {
                "type": "connect",
                "role": "node",
                "protocolVersion": 1,
                "deviceId": self.device_id,
                "deviceFamily": "headless",
                "platform": os.name,
                "token": self.token,
                "nonce": nonce,
                "publicKey": base64.b64encode(public_key).decode("ascii"),
                "deviceSignature": base64.b64encode(self.private_key.sign(nonce.encode("utf-8"))).decode("ascii"),
                "commands": ["system.run"],
            }
            await websocket.send(json.dumps(frame))
            try:
                response = json.loads(await websocket.recv())
            except ConnectionClosed as exc:
                close_frame = exc.rcvd
                if close_frame and close_frame.code == 1008 and "pairing" in (close_frame.reason or "").lower():
                    return {"status": "pairing_required", "deviceId": self.device_id}
                raise
            if response.get("payload", {}).get("type") != "hello-ok":
                raise RuntimeError("Gateway rejected node connection")
            async for raw in websocket:
                message = json.loads(raw)
                if message.get("event") != "node.command":
                    continue
                payload = message.get("payload", {})
                request_id = payload.get("requestId")
                if not isinstance(request_id, str) or not request_id:
                    raise RuntimeError("Gateway sent a node command without a request id")
                if payload.get("command") == "system.run":
                    result = await asyncio.to_thread(execute_system_run, payload.get("arguments", {}))
                else:
                    result = {"error": {"type": "unsupported_command", "message": "node command is not supported"}}
                await websocket.send(json.dumps({
                    "type": "req",
                    "id": f"node-result-{request_id}",
                    "method": "node.result",
                    "params": {"requestId": request_id, "result": result},
                }, ensure_ascii=False))
            return {"status": "disconnected", "deviceId": self.device_id}
