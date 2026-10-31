"""Channel adapter contracts, routing, and safe access defaults."""
from dataclasses import dataclass, field
import asyncio
import json
import urllib.request
from typing import Any, Protocol


@dataclass
class InboundMessage:
    channel: str
    account_id: str
    peer_id: str
    text: str
    message_id: str | None = None
    is_group: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def session_key(self) -> str:
        return f"{self.channel}:{self.account_id}:{'group' if self.is_group else 'dm'}:{self.peer_id}"

    def scoped_session_key(self, dm_scope: str = "per-channel-peer", agent_id: str = "main") -> str:
        kind = "group" if self.is_group else "dm"
        thread = self.metadata.get("threadId")
        if self.is_group:
            key = f"agent:{agent_id}:{self.account_id}:{self.channel}:group:{self.peer_id}"
        elif dm_scope == "main":
            key = f"agent:{agent_id}:main"
        elif dm_scope == "per-peer":
            key = f"agent:{agent_id}:dm:{self.peer_id}"
        elif dm_scope == "per-account-channel-peer":
            key = f"agent:{agent_id}:{self.account_id}:{self.channel}:{kind}:{self.peer_id}"
        else:
            key = f"agent:{agent_id}:{self.channel}:{kind}:{self.peer_id}"
        return f"{key}:thread:{thread}" if thread else key


class ChannelAdapter(Protocol):
    channel_id: str
    async def send(self, peer_id: str, text: str, **metadata: Any) -> dict[str, Any]: ...


class ChannelRegistry:
    def __init__(self, plugin_registry: Any = None):
        self.adapters: dict[str, ChannelAdapter] = {}
        self.plugin_registry = plugin_registry

    def register(self, adapter: ChannelAdapter) -> None:
        self.adapters[adapter.channel_id] = adapter

    def list(self) -> list[dict[str, Any]]:
        channels = [{"id": "webchat", "status": "available"}]
        channels.extend({"id": key, "status": "configured"} for key in sorted(self.adapters))
        if self.plugin_registry:
            channels.extend(
                {"id": plugin["id"], "status": "configured", "plugin": True}
                for plugin in self.plugin_registry.list()
                if plugin["enabled"] and plugin["kind"] == "channel"
            )
        return sorted(channels, key=lambda channel: channel["id"])

    async def send(self, channel: str, peer_id: str, text: str, **metadata: Any) -> dict[str, Any]:
        adapter = self.adapters.get(channel)
        if adapter:
            return await adapter.send(peer_id, text, **metadata)
        plugin = next(
            (
                item for item in self.plugin_registry.list()
                if item["id"] == channel and item["enabled"] and item["kind"] == "channel"
            ),
            None,
        ) if self.plugin_registry else None
        if not plugin:
            raise ValueError(f"Channel adapter not configured or enabled: {channel}")
        payload = {"peerId": peer_id, "text": text, "metadata": metadata}
        result = await self.plugin_registry.invoke_isolated(channel, "channel.send", payload)
        if not isinstance(result, dict):
            raise RuntimeError(f"Channel plugin returned an invalid send response: {channel}")
        return result


class TelegramAdapter:
    channel_id = "telegram"

    def __init__(self, token: str, api_base: str = "https://api.telegram.org"):
        if not token:
            raise ValueError("Telegram bot token cannot be empty")
        self.token = token
        self.api_base = api_base.rstrip("/")

    async def send(self, peer_id: str, text: str, **metadata: Any) -> dict[str, Any]:
        return await asyncio.to_thread(self._send_sync, peer_id, text)

    def _send_sync(self, peer_id: str, text: str) -> dict[str, Any]:
        body = json.dumps({"chat_id": peer_id, "text": text}).encode("utf-8")
        request = urllib.request.Request(f"{self.api_base}/bot{self.token}/sendMessage", data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read())
        if not result.get("ok"):
            raise RuntimeError("Telegram rejected sendMessage")
        message = result.get("result", {})
        return {"ok": True, "messageId": str(message.get("message_id", "")), "chatId": str(message.get("chat", {}).get("id", peer_id))}


def peer_allowed(channel_config: dict[str, Any], peer_id: str, is_group: bool = False) -> bool:
    policy = channel_config.get("groupPolicy" if is_group else "dmPolicy", "pairing")
    if policy == "open":
        return True
    allowlist = set(str(item) for item in channel_config.get("allowFrom", []))
    if peer_id in allowlist:
        return True
    if not is_group and policy == "pairing":
        return False
    return policy == "allowlist" and peer_id in allowlist


def route_agent(bindings: list[dict[str, Any]], message: InboundMessage, default_agent: str = "main") -> str:
    """Resolve the most specific matching host-authored channel binding."""
    candidates = []
    for index, binding in enumerate(bindings):
        match = binding.get("match", binding)
        peer = match.get("peer", {})
        parent_match = bool(message.metadata.get("parentPeerId") and peer.get("id") == message.metadata["parentPeerId"])
        if match.get("channel") not in (None, "*", message.channel):
            continue
        if match.get("accountId") not in (None, "*", message.account_id):
            continue
        if peer.get("id") not in (None, "*", message.peer_id) and not parent_match:
            continue
        if peer.get("kind") not in (None, "*", "group" if message.is_group else "dm"):
            continue
        if match.get("guildId") not in (None, "*", message.metadata.get("guildId")):
            continue
        if match.get("teamId") not in (None, "*", message.metadata.get("teamId")):
            continue
        required_roles = set(match.get("roles", []))
        if required_roles and not required_roles.issubset(set(message.metadata.get("roles", []))):
            continue
        if parent_match:
            rank = 1
        elif peer.get("id") == message.peer_id and peer.get("kind"):
            rank = 0
        elif peer.get("id") == "*":
            rank = 2
        elif match.get("guildId") and required_roles:
            rank = 3
        elif match.get("guildId"):
            rank = 4
        elif match.get("teamId"):
            rank = 5
        elif match.get("channel"):
            rank = 6 if match.get("accountId") else 7
        else:
            rank = 8
        candidates.append((rank, index, str(binding.get("agentId", default_agent))))
    if candidates:
        return min(candidates)[2]
    return default_agent
