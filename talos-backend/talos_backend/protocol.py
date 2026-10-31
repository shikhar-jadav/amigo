from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConnectFrame(StrictModel):
    type: Literal["connect"]
    protocolVersion: int = 1
    role: Literal["operator", "node"] = "operator"
    token: str | None = None
    scopes: list[str] = Field(default_factory=list)
    deviceId: str | None = None
    deviceFamily: str | None = None
    platform: str | None = None
    caps: list[str] = Field(default_factory=list)
    commands: list[str] = Field(default_factory=list)
    deviceSignature: str | None = None
    nonce: str | None = None
    publicKey: str | None = None


class RequestFrame(StrictModel):
    type: Literal["req"]
    id: str = Field(min_length=1, max_length=128)
    method: str = Field(min_length=1, max_length=128)
    params: dict[str, Any] = Field(default_factory=dict)
    idempotencyKey: str | None = Field(default=None, max_length=256)


class ResponseFrame(StrictModel):
    type: Literal["res"] = "res"
    id: str
    ok: bool
    payload: Any | None = None
    error: dict[str, str] | None = None


class EventFrame(StrictModel):
    type: Literal["event"] = "event"
    event: str
    payload: dict[str, Any]
    seq: int
    stateVersion: int = 1


def protocol_json_schema() -> dict[str, Any]:
    return {
        "title": "Talos Gateway Protocol",
        "protocolVersion": 1,
        "definitions": {
            "connect": ConnectFrame.model_json_schema(),
            "request": RequestFrame.model_json_schema(),
            "response": ResponseFrame.model_json_schema(),
            "event": EventFrame.model_json_schema(),
        },
    }
