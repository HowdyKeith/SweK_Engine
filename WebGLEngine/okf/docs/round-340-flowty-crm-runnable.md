---
type: doc
title: "Round 340 — Flowty-CRM split into 3 ▶-runnable steps"
tags: ["swek-engine", "round-doc"]
---

# Round 340 — Flowty-CRM split into 3 ▶-runnable steps

Short, focused round. v339 had Flowty-CRM as a single panel item with comment-only "guidance" — not actually runnable. You wanted the **last step** in particular to be one-click executable, both for yourself (it never ran because the `cd` got lost between shell sessions) and for whoever copies this setup later.

## What changed

The single `node-flowty-crm` item is gone. In its place: three items, each independently runnable.

| ID | Label | What it does |
|---|---|---|
| `node-flowty-crm-clone` | Flowty-CRM (1/3) — git clone | Clones the repo into `custom_nodes/`. Idempotent via `Test-Path` — skips if already there. |
| `node-flowty-crm-req` | Flowty-CRM (2/3) — requirements.txt | Installs the base Python deps. |
| `node-flowty-crm-cuda` | Flowty-CRM (3/3) — requirements-cuda.txt (THE last step) | Installs CUDA deps with `--ignore-installed nvdiffrast` so it doesn't try to source-build the rasterizer. |

Each one has its own ▶ button and its own checkbox. You can click step 3 right now to finally run the one that never ran.

## The cd-loss bug, captured

Earlier setup attempts failed because each command ran in its own PowerShell instance — `cd` in one didn't carry to the next. The bridge runs each catalog entry as a single `powershell.exe -NoProfile -Command "..."` invocation, so chained commands need to be in ONE string separated by `;`. The new entries do exactly that:

```
cd C:\...\ComfyUI-Flowty-CRM; & C:\...\python.exe -m pip install -r requirements-cuda.txt --ignore-installed nvdiffrast
```

One PowerShell process, one working directory, one pip invocation. Tests assert this (`/cd [^;]+;\s*&/`).

## Live verification

The bridge was actually spun up during testing. `/install/exec` with `dryRun:true` on `node-flowty-crm-cuda` returned:

```json
{"ok":true,"id":"node-flowty-crm-cuda","dryRun":true,
 "cmds":["cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-Flowty-CRM; & C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install -r requirements-cuda.txt --ignore-installed nvdiffrast"]}
```

Bridge also confirmed:
- Unknown ids return `{"ok":false,"error":"unknown_id"}`
- Runtime items with empty cmds return `no_commands_for_id`
- Catalog endpoint lists 16 ids including the 3 new Flowty-CRM steps

## What "for ease of install for others" means now

A fresh user setting up the engine on a new Windows box can:

1. Install ComfyUI portable + Ollama + the bridge (still manual, but copy-paste from panel)
2. Click ▶ on every node + python item in the Install panel, in order
3. Mark every model item installed after manually downloading them
4. Click ▶ on the three Flowty-CRM rows in sequence

That's a one-button-per-row install. The panel keeps state so a partial install survives reload, and `📋 Export` still drops a complete setup.ps1 to clipboard if you want the script form instead.

## Tests — 1039/1039 cumulative

`test_v340.mjs` adds 26 tests:
- Front-end has all 3 new ids, old combined id removed
- Each step has exactly 1 runnable cmd
- CUDA step has `--ignore-installed nvdiffrast`, references `requirements-cuda.txt`, cds into the right dir
- cd + & are `;`-chained in one PowerShell invocation (the bug fix)
- Bridge catalog mirrors all 3
- Clone step is idempotent (Test-Path guard)
- Engine version is v340
- Total runnable items ≥13 (got 20)

Plus the live bridge round-trip I just ran in the build:
- `/install/exec` with dryRun resolves the cuda step correctly
- Unknown ids properly 404
- Runtime items with no cmds properly reject
- `/install/catalog` lists everything

## Try it

```js
engineVersion()                 // "v340"
installPanel.show()             // open the panel
// Scroll to "🧩 ComfyUI Custom Nodes"
// You'll see Flowty-CRM (1/3), (2/3), (3/3)
// Click ▶ on (3/3) — the one that never finished
```

If the bridge is running (`node ai-bridge/server.js`), the row's output area shows the live pip output stream. If pip succeeds, the checkbox auto-ticks.

## Next

The pending queue stays the same minus the Flowty-CRM piece:

- v341: voice translation (Chrome lang + LibreTranslate hybrid)
- v342: Snake demo (centipede extension)
- v343: Tron demo
- Robot face-lock + body dimensions in LISTENER panel
- Ollama panel — rocking/walking/sprinting tiers, EKG removed
- OBJ preview canvas slots in wherever
