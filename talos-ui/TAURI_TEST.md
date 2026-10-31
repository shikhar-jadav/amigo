# Talos desktop test shell

This test app loads Talos's existing UI and uses the same Cloud service, Backend agent, authentication, and API routes started by `start.ps1`.

## Build and run

From `talos-ui`, build the Windows executable:

```powershell
npm run tauri:build
```

The executable is written to `src-tauri\target\release\talos-desktop.exe`.

Start the local Talos services first with `..\start.ps1`, then launch the executable. To build and launch both with one command from the repository root, run `..\run-tauri-test.ps1`. When finished, close the app and run `..\stop.ps1` to stop the service windows.

The executable is a test shell, not a standalone distribution. Talos uses Next.js server routes, so the full application remains served by the existing Next.js process at `http://localhost:3000`. The executable includes a small bootstrap page and navigates to that local UI. Tauri's standard Next.js integration targets static exports; this setup keeps Talos's server routes available for testing. See the [Tauri Next.js guide](https://v2.tauri.app/start/frontend/nextjs/).

Windows Tauri development requires Rust with the MSVC toolchain, Microsoft C++ Build Tools, and WebView2. See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).
