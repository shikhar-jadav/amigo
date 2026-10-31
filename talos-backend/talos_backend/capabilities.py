"""Open capability registry for plugin and core extension points."""
from dataclasses import dataclass
from typing import Any


EXCLUSIVE_KINDS = {"memory", "context_engine", "harness"}


@dataclass
class Capability:
    kind: str
    id: str
    implementation: Any
    owner: str = "core"
    metadata: dict[str, Any] | None = None


class CapabilityRegistry:
    def __init__(self, slots: dict[str, str] | None = None):
        self._items: dict[str, dict[str, Capability]] = {}
        self.slots = slots or {}

    def register(self, kind: str, capability_id: str, implementation: Any, *, owner: str = "core", metadata: dict[str, Any] | None = None) -> None:
        if not kind or not capability_id:
            raise ValueError("Capability kind and id are required")
        self._items.setdefault(kind, {})[capability_id] = Capability(kind, capability_id, implementation, owner, metadata or {})

    def get(self, kind: str, capability_id: str | None = None) -> Capability | None:
        if capability_id is None and kind in EXCLUSIVE_KINDS:
            capability_id = self.slots.get(kind)
            if capability_id in {None, "none"}:
                return None
        if capability_id is None:
            return None
        return self._items.get(kind, {}).get(capability_id)

    def list(self, kind: str | None = None) -> list[dict[str, Any]]:
        kinds = [kind] if kind else sorted(self._items)
        return [{"kind": item.kind, "id": item.id, "owner": item.owner, "metadata": item.metadata or {}} for key in kinds for item in self._items.get(key, {}).values()]

    def validate_contracts(self, owner: str, contracts: dict[str, list[str]]) -> list[str]:
        errors = []
        for kind, expected_ids in contracts.items():
            actual_ids = {cap.id for cap in self._items.get(kind, {}).values() if cap.owner == owner}
            errors.extend(f"{kind}:{item} declared but not registered" for item in expected_ids if item not in actual_ids)
            errors.extend(f"{kind}:{item} registered but not declared" for item in actual_ids - set(expected_ids))
        return errors
