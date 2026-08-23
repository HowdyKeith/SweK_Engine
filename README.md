# SweK_Engine v3939 -- complete archive

The single source of truth: **WebGL engine + Node ai-bridge + listener + the Home
Assistant integration + the ship/verify toolchain**, in one repository. The
versioned zip (`SweK_Engine_vNNNN.zip`) is cut from this tree; the zip always
contains a single top-level folder named `SweK_Engine_vNNNN`, which is what the
in-engine updater looks for.

Current build: **v3939** (`WebGLEngine/main.js` `ENGINE_VERSION`). The brain
carries its own `BRAIN_BUILD` in `WebGLEngine/brain/brain.js`. Never reuse a
version number -- supersede forward.

## System architecture (diagram)

See **`WebGLEngine/architecture.svg`** for a one-page diagram of the whole
multi-runtime system -- how the Excel/VBA simulation, the WebGL browser engine,
the Node `ai-bridge` (:8787), the PowerShell+Python KPop Listener, and Home
Assistant fit together, plus the external services (Ollama, OSM/elevation APIs,
Twitch/Discord, games). Open it directly in a browser, or from the tray
**Open Engine -> Architecture diagram**.

## Layout
```
SweK_Engine_v3939/
├── WebGLEngine/      <- the engine. Bundles the Node bridge (ai-bridge/, :8787)
│                        with haDiscovery.js wired in, the ha/ iframe-panel
│                        installer, brain/ + brains/ (ai-brain, dashboard,
│                        commander bridge pages), and tools/ship/ -- the
│                        changelog, staleness, knowledge-index, status, verify
│                        and gate toolchain that cuts each build.
├── HomeAssistant/    <- add-on repo (ingress panel) + haDiscovery.js + wiring
│                        docs + slim-build.mjs/manifest + modHAInstall.bas.
├── KPop Listener/    <- the PowerShell listener set.
├── PetFBI/           <- the pet-tracking app.
├── TaskerBridge/     <- Android/Tasker side of the bridge.
├── raycast-extension/<- Raycast commands for the engine.
├── agent-skills/     <- packaged skills.
├── cloud/            <- hosting/deploy scaffolding.
├── diso_tools/       <- disassembly/inspection utilities.
├── strict-libm/      <- the pinned-math shim used by determinism gates.
├── Shared/           <- assets and code shared across runtimes.
├── Root Utils/       <- SESSION_START.md and the operator scripts.
└── docs/             <- long-form notes.
```

Launchers at the root: `START_SweK_LATEST.bat` / `START_NODE_Engine.bat`
(Windows), `Start Mac SweK Engine.command` / `make_Mac_SweK_Runnable.sh` (macOS),
`_SETUP.bat` for a first run.

## Build a workbook from scratch (VBASync)
> The exploded `VBAEngineCore/` and `VBAVoxelEngine/` module folders are NOT in
> this repository -- they ship separately. This section is kept because the
> import procedure is unchanged; point it at wherever you keep those folders.

1. Open your VBASync blank workbook; enable **Trust access to the VBA project object model**.
2. Import everything in `VBAEngineCore/` (or `VBAVoxelEngine/` for the other one).
   `ThisWorkbook`/`Sheet*` are document modules — paste their code.
3. Add to `ThisWorkbook`: `Private Sub Workbook_Open()` / `modInit.Init` / `End Sub`.
4. On open you land on the **Demos** sheet (menu A); buttons: each demo, Rebuild,
   Launch In-View Menu (B), List Demos, **Install HA Panel**.

## Home Assistant — two install routes, one button
`modHAInstall.InstallHAPanel` (the "Install HA Panel" sheet button) defaults to the
**add-on (ingress)** route: it opens the "My Home Assistant" redirect to add the
add-on repository, then you click Install/Start in the store. Self-contained, no
Samba, no YAML, HA handles auth/TLS. (`InstallHAPanelIframe` runs the engine's
existing `ha/install.ps1` instead — the panel_iframe-over-Samba route, no GitHub
repo needed.)

Set `HA_ADDON_REPO_URL` in `modHAInstall.bas` to your published add-on repo. For
zero-touch, also set `HA_BASE_URL` + a long-lived `HA_TOKEN`.

## Engine telemetry as HA entities (no ESPHome emulation)
`WebGLEngine/ai-bridge/haDiscovery.js` publishes MQTT discovery so the transmit
engine shows up in HA as a device: Engine Online, Tick, Enemies, Player Health,
FPS, Scene, Directives, WS Subscribers, plus solar/energy (Solar Power, Solar
Energy Today, Grid Power, Battery Level). Wire it per `HomeAssistant/HA_MQTT_WIRING.md`
(two lines in server.js + `HA_MQTT=mqtt://broker`). Adjust the solar field paths in
`haDiscovery.js` (`pick(...)`) to match your real payload.

## Delivery-mode slim build
`node HomeAssistant/slim-build.mjs` copies the allowlisted subset of `WebGLEngine/`
(per `slim.manifest.json`) into the add-on's `www/`, rewriting absolute asset paths
to relative for ingress. The full engine stays intact in the repo; HA gets the trim.
Tune the include/exclude lists to the minimum your panel needs.





## Architecture: two workbooks + Shared
- **VBAEngine/** — the full OpenGL/D3D11 engine workbook (everything render-side).
- **VBAVoxelEngine/** — the workbook wired to the WebGL/voxel engine.
- **Shared/** — functions BOTH want (bridge client, networking). Each workbook
  is built by importing its own folder **plus** `Shared/`. They stay separate
  projects (each declares its own GL/Win32 APIs; merging into one would create
  duplicate `Public Declare`s / ambiguous-name errors), but shared utilities are
  duplicated into both at import time via Shared/.








































































































































## Changelog

The full round-by-round history — 286 entries, v566 to v3939 — is in
[docs/CHANGELOG.md](docs/CHANGELOG.md). It lived here until v3941 and was 99.1% of this
file, which put the README past the size GitHub will render.


## Honest status
Nothing here was compiled in the VBE, run against a live HA/Supervisor/MQTT broker,
or rendered in a browser on my side. Verify in-app: the VBASync import + compile,
the add-on build/start + ingress panel, the MQTT device under Settings → Devices &
Services → MQTT, and the slim build loading. Bloom/tint/polish still render only on
the D3D11 backend (see VBA_Engine_Checklist.md in the EngineCore bundle).

