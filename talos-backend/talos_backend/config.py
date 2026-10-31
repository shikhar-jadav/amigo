import json
import os
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class GatewayAuth(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["token", "none"] = "token"
    token: str | None = None


class GatewayConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bind: Literal["loopback"] = "loopback"
    port: int = Field(default=18800, ge=1, le=65535)
    auth: GatewayAuth = Field(default_factory=GatewayAuth)
    maxConcurrentRuns: int = Field(default=4, ge=1, le=256)


class SandboxConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["off", "non-main", "all"] = "off"
    scope: Literal["agent", "session", "shared"] = "agent"
    backend: Literal["subprocess", "docker", "ssh"] = "docker"
    workspaceAccess: Literal["none", "ro", "rw"] = "none"
    image: str = "python:3.12-slim"


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = "openai-compatible"
    model: str
    baseUrl: str = "https://api.openai.com/v1"
    apiKeyEnv: str = "OPENAI_API_KEY"
    options: dict[str, Any] = Field(default_factory=dict)


class AgentDefaults(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timeoutSeconds: int = Field(default=300, ge=1, le=172800)
    model: str = "echo"
    workspace: str | None = None
    fallbacks: list[str] = Field(default_factory=list)
    sandbox: SandboxConfig = Field(default_factory=SandboxConfig)


class AgentsConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    defaults: AgentDefaults = Field(default_factory=AgentDefaults)
    entries: list[dict[str, Any]] = Field(default_factory=list, alias="list")


class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dmScope: Literal["main", "per-peer", "per-channel-peer", "per-account-channel-peer"] = "per-channel-peer"
    reset: dict[str, Any] = Field(default_factory=dict)
    queue: dict[str, Any] = Field(default_factory=dict)


class TalosConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_: str | None = Field(default=None, alias="$schema")
    gateway: GatewayConfig = Field(default_factory=GatewayConfig)
    agents: AgentsConfig = Field(default_factory=AgentsConfig)
    models: dict[str, ModelConfig] = Field(default_factory=dict)
    security: dict[str, Any] = Field(default_factory=dict)
    tools: dict[str, Any] = Field(default_factory=dict)
    channels: dict[str, Any] = Field(default_factory=dict)
    plugins: dict[str, Any] = Field(default_factory=dict)
    skills: dict[str, Any] = Field(default_factory=dict)
    memory: dict[str, Any] = Field(default_factory=dict)
    session: SessionConfig = Field(default_factory=SessionConfig)
    agentsList: list[dict[str, Any]] = Field(default_factory=list, alias="agentsList")
    bindings: list[dict[str, Any]] = Field(default_factory=list)
    auth: dict[str, Any] = Field(default_factory=dict)
    browser: dict[str, Any] = Field(default_factory=dict)
    mcp: dict[str, Any] = Field(default_factory=dict)
    hooks: dict[str, Any] = Field(default_factory=dict)
    cron: dict[str, Any] = Field(default_factory=dict)


def state_dir() -> Path:
    configured = os.environ.get("TALOS_STATE_DIR")
    if configured:
        return Path(configured)
    return Path.home() / ".amigo"


def config_path(directory: Path) -> Path:
    """Prefer Amigo's JSON5 config while retaining the earlier Talos filename."""
    current = directory / "amigo.json5"
    legacy = directory / "talos.json"
    return current if current.exists() or not legacy.exists() else legacy


def load_config(path: Path | None = None) -> TalosConfig:
    target = path or config_path(state_dir())
    if not target.exists():
        token = os.environ.get("TALOS_GATEWAY_TOKEN")
        return TalosConfig(gateway=GatewayConfig(auth=GatewayAuth(mode="token", token=token)))
    source = target.read_text(encoding="utf-8")
    try:
        import json5
        data = json5.loads(source)
    except ImportError:
        data = json.loads(source)
    config = TalosConfig.model_validate(data)
    env_token = os.environ.get("TALOS_GATEWAY_TOKEN")
    if env_token:
        config.gateway.auth.token = env_token
    if os.name != "nt":
        try:
            target.chmod(0o600)
        except OSError:
            pass
    return config
