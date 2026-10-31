# Amigo backend (Talos)

Talos is the Python backend for Amigo: a local, protocol-first agent gateway with a FastAPI HTTP surface, WebSocket RPC, SQLite state, model providers, plugins, skills, tools, scheduling, and an operator CLI. The executable name is `amigo`; `talos` remains as a compatibility alias.

## Run locally

From this directory, install the project and run `amigo onboard`, then start `amigo gateway run`. Onboarding verifies a configured real inference provider before it writes setup state; use `amigo onboard --baseline` to create the secure config and workspace without an inference check. `--non-interactive` is supported for scripts. Generated gateway tokens are stored in the private config and never printed. During development, `python -m talos_backend` starts the gateway. The default state directory is `~/.amigo`; set `TALOS_STATE_DIR` to use a different location and `TALOS_GATEWAY_TOKEN` to configure the bearer token. The config is `amigo.json5` (strictly schema-validated; ordinary JSON is also valid). Existing `talos.json` is read as a legacy config until `amigo.json5` is created.

The project is distributed under the PolyForm Noncommercial License 1.0.0. Commercial use requires separate written permission; see the repository `LICENSE` file.

The gateway binds to loopback on port `18800`. On a fresh install with `MISTRAL_API_KEY` set and no model configured, `amigo onboard` selects `codestral-2508` using `https://api.mistral.ai/v1`; it stores only the environment-variable name, never the key. Otherwise configure `agents.defaults.model` and a matching `models` entry for a real provider. `echo` is a deterministic development harness and never calls a model provider.

## Install

The repository includes `install.sh` for macOS/Linux and `install.ps1` for Windows. Both install the `talos-backend` distribution from PyPI with uv-managed Python 3.13 and add uv's tool executable directory to the user's PATH. Set `AMIGO_PACKAGE_SOURCE` to a different verified package name, local project path, or credential-free HTTPS URL to override the default. `AMIGO_PYTHON_VERSION` can select another supported Python 3.12+ version. The default package must be published before the scripts can complete an install.

After installation, open a new terminal if required and run `amigo onboard`. For the default Mistral setup, define `MISTRAL_API_KEY` in the local environment first; onboarding verifies inference before writing setup state. `amigo onboard --baseline` creates local state without claiming the agent is inference-ready. The scripts are ready for release hosting, but this repository does not publish the scripts or package to a public URL yet.

## Implemented backend surfaces

- WebSocket v1 challenge/connect handshake, operator scopes, node pairing, Ed25519 nonce verification, typed request validation, idempotency, run events, session/global concurrency lanes, and a headless Python node host with approval-gated `system.run`, argv execution, a 300-second timeout ceiling, and a 1 MiB combined output cap.
- SQLite WAL persistence for sessions, messages, runs, approvals, devices, cron, memory search, audit events, usage, pairing, browser profiles, and canvas content.
- SQLite schema version tracked with `PRAGMA user_version`; startup refuses databases created by a newer backend version.
- OpenAI and Anthropic compatible model adapters with bounded function-tool loops, model fallbacks, workspace prompt files and eligible Markdown skills, plus usage estimates.
- Plugin manifests validated before loading, local plugin lifecycle commands, subprocess-isolated community plugin calls, live cross-process enable/disable state, outbound channel-plugin routing, and manifest-declared lifecycle hooks with priority and terminal block behavior. Plugin inbound receive is not yet supported.
- Skill discovery, environment gating, install and verification; model-driven tool calls with schema/policy checks, exec approvals, and a Docker sandbox runner with no network, restricted mounts and resource limits; MCP stdio clients and authenticated HTTP MCP.
- Tool outputs are explicitly marked as untrusted before returning them to the model, with a lightweight scanner that adds warnings for common instruction override, secret exfiltration, and tool manipulation patterns.
- Cron and heartbeat schedulers, five-field cron expressions, IANA timezones, one-shot ISO-8601 jobs, recurring interval jobs with coalesced interval ticks, and optional cron result announcements to a channel (`--channel` and `--to`); authenticated/idempotent webhooks, a Telegram webhook/send adapter with pairing-based inbound access, browser URL validation/CDP profile helpers, memory search, audit, diagnostics redaction, and SQLite backup integrity checks.
- A2A 1.0 JSON-RPC text tasks with an Agent Card, authenticated send/get/cancel operations, context-backed sessions, and explicit media/streaming capability limits.
- AmigoHub skill/plugin registry API with immutable versioned ZIP artifacts, moderation, SHA-256 checks, bounded archive inspection, public discovery/download, and a separate `amigohub` CLI.
- HTTP health/readiness/status/metrics, chat completions and Responses API, plus CLI commands for gateway, onboarding, diagnostics, agents, channels, nodes, approvals, plugins, skills, models, sessions, cron, pairing, memory, security, config, backups, audit and protocol schema.

To run the Hub API with the gateway, configure `AMIGOHUB_PUBLISH_TOKEN` and `AMIGOHUB_MODERATOR_TOKEN`. Public search and download work without these tokens; publishing and moderation require their respective bearer tokens. The package publisher value is attribution metadata tied to the publish token, not a per-user identity system. Use `amigohub --help` for search, publish, moderation, and install commands. Publishers submit a ZIP containing one `SKILL.md` or `amigo.plugin.json`; new versions stay pending until a moderator publishes them.

`amigo doctor` checks config validity, SQLite integrity, gateway authentication, and workspace availability. `amigo security audit --deep` adds database-integrity and workspace checks; both commands return actionable nonzero failures for invalid configuration.

Run `amigo node host <device-id>` on the headless host for the first pairing attempt, then approve it on the Gateway with `amigo pairing approve <device-id>`. Set the returned device token in `TALOS_NODE_TOKEN` through the host's secret store and start the host command again. The host persists its Ed25519 identity under its Amigo state directory; remote Gateway URLs must use `wss://`.

Run checks from the repository root with `python -m pytest -q` and `python -m compileall -q talos-backend/talos_backend`.

## Remaining plan work

This backend does not yet implement full OpenClaw parity. A published installer and release/package source are not available in this repository yet. Missed interval ticks coalesce to one run; missed five-field cron occurrences during downtime are skipped, and stagger windows are not implemented. A2A streaming, task listing, push notifications, and non-text media are not implemented. Discord, Slack, WhatsApp and other channel transports, OAuth provider flows and comprehensive provider catalogs, SSH sandbox backend, advanced/vector memory engines, browser automation, voice/media pipelines, the full plugin hook catalog and internal hook manager, AG-UI, TUI, hosted Control UI, service managers, release/update workflows, migration tooling, and broader P1/P2 product features remain unimplemented. The Hub implementation is a local registry service; it does not include hosted multi-tenant accounts or the UI's broader creator marketplace. Docker sandbox execution requires Docker and the configured image to be available. Telegram requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`; configure Telegram's webhook URL separately. Other integrations that require external credentials or hosted services need those configured before end-to-end use.
