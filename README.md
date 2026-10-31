# Amigo

Amigo is a self-hosted agent gateway and CLI. This repository contains the Amigo application source, installer scripts, and release automation. It does not contain user configuration, model keys, session history, workspace state, or installed plugin data. Community plugin packages are distributed through AmigoHub; `talos-cloud` is intentionally excluded.

## Install

The macOS/Linux installer is `install.sh`; the Windows installer is `install.ps1`. Both install the `talos-backend` package from PyPI using uv-managed Python 3.13. The package and installer URL become usable after the first public release.

After publication, install on macOS/Linux with:

```sh
curl -fsSL https://raw.githubusercontent.com/shikhar-jadav/amigo/main/install.sh | bash
```

On Windows PowerShell, download and run the installer with:

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/shikhar-jadav/amigo/main/install.ps1" -OutFile "$env:TEMP\amigo-install.ps1"
& "$env:TEMP\amigo-install.ps1"
```

Set `AMIGO_PACKAGE_SOURCE` only when intentionally installing from another verified source.

Set `MISTRAL_API_KEY` in the local environment or secret store, then run `amigo onboard`. If no model is configured, onboarding verifies and selects Mistral `codestral-2508` using `https://api.mistral.ai/v1`. The key is read from the environment and is never written to Amigo's config.

## Development

- Backend: [`talos-backend/README.md`](./talos-backend/README.md)
- UI: [`talos-ui/`](./talos-ui/)
- Release: publish a GitHub Release after configuring the PyPI trusted publisher for `talos-backend`.

The project is licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Commercial use requires separate written permission from the copyright holder.
