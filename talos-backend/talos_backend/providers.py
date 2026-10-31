"""Model provider registry with OpenAI-compatible HTTP support."""
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


class ModelProvider(Protocol):
    async def complete(self, messages: list[dict[str, Any]], model: str, **options: Any) -> str | dict[str, Any]: ...


@dataclass
class OpenAICompatibleProvider:
    base_url: str
    api_key: str | None = None

    async def complete(self, messages: list[dict[str, Any]], model: str, **options: Any) -> str | dict[str, Any]:
        import asyncio
        return await asyncio.to_thread(self._complete_sync, messages, model, options)

    def _complete_sync(self, messages: list[dict[str, Any]], model: str, options: dict[str, Any]) -> str | dict[str, Any]:
        payload = {"model": model, "messages": messages, **{key: value for key, value in options.items() if key != "timeout"}}
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(self.base_url.rstrip("/") + "/chat/completions", data=json.dumps(payload).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=float(options.get("timeout", 120))) as response:
                data = json.loads(response.read())
            assistant = data["choices"][0]["message"]
            if assistant.get("tool_calls"):
                calls = []
                for call in assistant["tool_calls"]:
                    function = call.get("function", {})
                    try:
                        arguments = json.loads(function.get("arguments") or "{}")
                    except ValueError as exc:
                        raise RuntimeError("Provider returned invalid JSON tool arguments") from exc
                    calls.append({"id": call.get("id", ""), "name": function.get("name", ""), "arguments": arguments})
                return {"toolCalls": calls, "assistantMessage": assistant}
            return str(assistant.get("content") or "")
        except (urllib.error.URLError, KeyError, IndexError, ValueError) as exc:
            raise RuntimeError(f"Model provider request failed: {exc}") from exc


@dataclass
class AnthropicCompatibleProvider:
    base_url: str
    api_key: str | None = None

    async def complete(self, messages: list[dict[str, Any]], model: str, **options: Any) -> str | dict[str, Any]:
        import asyncio
        return await asyncio.to_thread(self._complete_sync, messages, model, options)

    def _complete_sync(self, messages: list[dict[str, Any]], model: str, options: dict[str, Any]) -> str | dict[str, Any]:
        system = "\n\n".join(item["content"] for item in messages if item["role"] == "system")
        turns: list[dict[str, Any]] = []
        for item in messages:
            role = item["role"]
            if role == "system":
                continue
            if role == "assistant" and item.get("tool_calls"):
                blocks = []
                if item.get("content"):
                    blocks.append({"type": "text", "text": str(item["content"])})
                for call in item["tool_calls"]:
                    function = call.get("function", {})
                    blocks.append({"type": "tool_use", "id": call.get("id", ""), "name": function.get("name", ""), "input": json.loads(function.get("arguments") or "{}")})
                turns.append({"role": "assistant", "content": blocks})
            elif role == "tool":
                block = {"type": "tool_result", "tool_use_id": item.get("tool_call_id", ""), "content": item.get("content", "")}
                if turns and turns[-1]["role"] == "user" and isinstance(turns[-1]["content"], list):
                    turns[-1]["content"].append(block)
                else:
                    turns.append({"role": "user", "content": [block]})
            else:
                turns.append({"role": role, "content": item.get("content", "")})
        body = {"model": model, "max_tokens": int(options.get("max_tokens", 2048)), "messages": turns}
        body.update({key: value for key, value in options.items() if key not in {"timeout", "tools", "tool_choice", "max_tokens"}})
        if system:
            body["system"] = system
        if options.get("tools"):
            body["tools"] = [{"name": item["function"]["name"], "description": item["function"].get("description", ""), "input_schema": item["function"].get("parameters", {"type": "object"})} for item in options["tools"]]
            body["tool_choice"] = {"type": "auto"} if options.get("tool_choice") in {None, "auto"} else options["tool_choice"]
        request = urllib.request.Request(self.base_url.rstrip("/") + "/messages", data=json.dumps(body).encode(), headers={"content-type": "application/json", "x-api-key": self.api_key or "", "anthropic-version": "2023-06-01"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=float(options.get("timeout", 120))) as response:
                data = json.loads(response.read())
            content = data.get("content", [])
            calls = [{"id": block.get("id", ""), "type": "function", "function": {"name": block.get("name", ""), "arguments": json.dumps(block.get("input", {}))}} for block in content if block.get("type") == "tool_use"]
            if calls:
                text = "".join(block.get("text", "") for block in content if block.get("type") == "text")
                return {"toolCalls": [{"id": call["id"], "name": call["function"]["name"], "arguments": json.loads(call["function"]["arguments"])} for call in calls], "assistantMessage": {"role": "assistant", "content": text or None, "tool_calls": calls}}
            return "".join(block.get("text", "") for block in content if block.get("type") == "text")
        except (urllib.error.URLError, KeyError, ValueError) as exc:
            raise RuntimeError(f"Anthropic provider request failed: {exc}") from exc


def provider_for(model_ref: str, config: dict[str, Any]) -> tuple[ModelProvider, str] | None:
    if model_ref == "echo":
        return None
    provider_cfg = config.get("models", {}).get(model_ref)
    if provider_cfg is None:
        return None
    if hasattr(provider_cfg, "model_dump"):
        provider_cfg = provider_cfg.model_dump()
    base_url = str(provider_cfg.get("baseUrl", "https://api.openai.com/v1"))
    env_name = str(provider_cfg.get("apiKeyEnv", "OPENAI_API_KEY"))
    import os
    api_key = os.environ.get(env_name)
    model = str(provider_cfg.get("model", model_ref))
    provider_name = str(provider_cfg.get("provider", "openai-compatible"))
    provider: ModelProvider = AnthropicCompatibleProvider(base_url or "https://api.anthropic.com/v1", str(api_key) if api_key else None) if provider_name == "anthropic" else OpenAICompatibleProvider(base_url, str(api_key) if api_key else None)
    return provider, model


def model_candidates(model_ref: str, config: dict[str, Any], *, strict: bool = False, fallbacks: list[str] | None = None) -> list[str]:
    if strict:
        return [model_ref]
    configured = fallbacks if fallbacks is not None else config.get("agents", {}).get("defaults", {}).get("fallbacks", [])
    return list(dict.fromkeys([model_ref, *configured]))


class CapabilityProvider:
    """Shared provider slot for TTS/STT/media implementations registered by plugins."""
    def __init__(self):
        self._providers: dict[str, Any] = {}

    def register(self, capability: str, provider_id: str, provider: Any) -> None:
        self._providers[f"{capability}:{provider_id}"] = provider

    def get(self, capability: str, provider_id: str) -> Any:
        result = self._providers.get(f"{capability}:{provider_id}")
        if result is None:
            raise ValueError(f"No {capability} provider registered as {provider_id}")
        return result

    def list(self, capability: str | None = None) -> list[str]:
        return sorted(key for key in self._providers if capability is None or key.startswith(capability + ":"))
