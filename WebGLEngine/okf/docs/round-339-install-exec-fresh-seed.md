---
type: doc
title: "Round 339 — Install Panel: real Execute · auto-verify on open · fresh world seed"
tags: ["swek-engine", "round-doc"]
---

# Round 339 — Install Panel: real Execute · auto-verify on open · fresh world seed

Three things in this round, two from your feedback and one that fell out of looking at the install screenshot.

## 1. The "same terrain every reset" finding — `freshWorld()`

You called it out from the screenshot: white mountains in the same spots, purple kaiju in the same spots, every reset. That's not a bug, it's by design — `main.js:664` had `new BiomeMap({ seed: 1337 })` hardcoded, and caveCarver/biomeDecorPool were similarly fixed. Deterministic procedural gen → same input seed → same world. Forever.

v339 reads the seed from `voxelengine.worldSeed` if present, default 1337 if not. Two new console helpers:

```js
freshWorld()      // picks a random seed, stores it, hard-resets
freshWorld(42)    // explicit seed if you want reproducibility
worldSeed()       // returns the current seed
```

`resetWorld()` and `hardResetWorld()` still preserve the seed (your test workflow keeps working). `freshWorld()` is the explicit "give me a different world" button.

## 2. Install Panel: ▶ Execute button + auto-verify on open

The big one. Each install panel row that has runnable commands now gets a **▶** button. Click it:

1. Auto-expands the row to show the output area
2. First time per session: confirms `"About to run install commands on YOUR machine via the bridge. Continue?"` so it's never a surprise
3. POSTs to the bridge at `/install/exec` with `{ id: "py-trimesh" }`
4. Bridge looks the id up in its server-side catalog — **the browser never sends raw commands**
5. Bridge runs each command via PowerShell, captures stdout/stderr, returns the chain
6. Output area shows each command + its output + exit code, formatted like a terminal
7. On success: auto-pings (for servers) or auto-checks the "installed" box (for filesystem items)

### Why no raw commands

If the browser could pipe any string into PowerShell on your machine, any compromised page or extension could ruin your day. The bridge keeps its own `INSTALL_CATALOG` map of id → commands. The browser sends `{ id: "py-trimesh" }` and the bridge executes its own canonical command. Three layers of defense:

- **Front-end** filters comment-only items before the request
- **Bridge** rejects unknown ids with `404 unknown_id`
- **Bridge** has its own danger regex blocking `rm -rf /`, `format c:`, `del /s`, `rd /s`, `shutdown` — even if you somehow added one to your local catalog

### dryRun support

The bridge accepts `{ id, dryRun: true }` and returns the resolved commands without running them. Useful for testing the catalog mapping.

### Per-command timeout

Each command gets 60s. The bridge stops the chain on first non-zero exit so you see the actual failure, not a cascade.

## 3. Auto-verify when the panel becomes visible

`IntersectionObserver` watches the panel root. The moment the dock slides it into view, `verifyAll()` fires (pings ComfyUI, Ollama, the bridge itself). Throttled to once per 30 seconds so opening/closing rapidly doesn't hammer your servers.

You also get the same effect from `installPanel.show()` in the console.

## What's runnable, what isn't

The bridge catalog has commands for:

- ✅ **Custom nodes**: Manager, Essentials, LayerDiffuse (git clone + pip install -r)
- ✅ **Python packages**: trimesh, pymeshlab, meshlib, imageio+opencv+easydict, nvdiffrast wheel, kiui, open-clip-torch+timm+ftfy
- ❌ **Runtimes** (ComfyUI, Ollama, bridge): launching them from inside the engine would mean tying up the bridge process. The panel shows their cmds with the **📋** copy button — you start them from your own shell.
- ❌ **Models**: too big, too gated (auth required for some), too manual. Stay with the **📋** copy + browser download flow.
- ❌ **Patches**: code edits to specific lines in Trellis's nodes.py. Not safe to auto-apply (file structure varies by fork/version). The **📋** copy of the patch + your editor remains the path.

Items that aren't runnable still show all their commands/patches/notes — they just don't get a **▶** button. The **📋** copy still works for everything.

## Tests — 1013/1013 cumulative

`test_v339.mjs` adds 47 tests across 8 groups:

- **T1** (5): `_isRunnable` correctly distinguishes empty/comment-only/real cmds
- **T2** (3): catalog has expected runnable counts per category
- **T3** (7): danger regex blocks rm/format/del/shutdown, allows pip/git/cd
- **T4** (9): bridge INSTALL_CATALOG parity — endpoints exist, every front-end runnable id is in the bridge
- **T5** (5): world seed override — localStorage key, reader function, freshWorld helper, BiomeMap uses the dynamic seed
- **T6** (8): install panel methods exist — `_executeItem`, `_isRunnable`, IntersectionObserver hook, confirm dialog, bridge URL helper
- **T7** (1): `_confirmedExec` flag persists across loads
- **T8** (8): bridge `/install/exec` handler — dryRun, unknown-id rejection, empty-cmds rejection, PowerShell invocation, exit code + timing in response

## Try it

After updating to v339:

```js
engineVersion()                  // "v339"
freshWorld()                     // random seed, hard reset, reload — new mountains
worldSeed()                      // see the current seed
installPanel.show()              // (also docked on left as "Install")
```

In the panel:
1. Click ↻ Verify All to ping ComfyUI, Ollama, bridge
2. Find an unfinished python package
3. Click ▶
4. Confirm the one-time dialog
5. Watch the output area below the row

If the bridge isn't reachable, the panel says so explicitly with the command to start it.

## Next

- v340: Ollama panel — rocking/walking/sprinting tiers, EKG removed
- v341: voice translation (Chrome lang + LibreTranslate hybrid)
- v342: Snake demo (centipede extension)
- v343: Tron demo
- OBJ preview canvas slots in wherever
- robot face-lock + body dimensions in LISTENER panel (was originally v339; bumped because the install panel exec work was higher-impact)
