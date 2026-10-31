"""Environment allowlist for child processes that do not need gateway secrets."""
import os


def restricted_environment(overrides: dict[str, str] | None = None) -> dict[str, str]:
    names = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}
    env = {name: os.environ[name] for name in names if name in os.environ}
    if overrides:
        env.update({str(key): str(value) for key, value in overrides.items()})
    return env
