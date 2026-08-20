# Round 306 — Limb severance + HUD minimize + FPS diagnosis

Three things this round: limb-loss for ragdolled kaiju, a minimize button
on the worker HUD, and a documented diagnosis of the persistent FPS=10.

---

## 1. Limb severance (Ragdoll round 4 / Option D)

**Question asked:** "can we have a wired character/kaiju lose limbs?"

**Answer:** yes — implemented via `Ragdoll.sever(boneIdx)` and the
auto-trigger path in `RagdollIntegration`.

### How it works

A "severance" breaks the **distance constraint** that anchors a bone
subtree to the rest of the body, while leaving all internal subtree
links intact. The limb is then free to fly off under its own physics —
the rest of the body keeps settling normally.

Mechanism:
1. BFS the subtree rooted at `boneIdx` using `this.parents[]`.
2. Add `boneIdx` to `this._severedRoots` (a Set).
3. `_solveDistanceConstraints` skips the bone where `i ∈ _severedRoots`
   — this is the link from severed-root to its body parent.
4. `_solveAngleLimits` skips angle triples where the joint or its child
   is in `_severedRoots` (would otherwise pull the limb back).
5. Apply a separation impulse to every bone in the subtree by shifting
   `prevPos` backward along `separationDir` (PBD velocity is implicit
   in `curr - prev`).
6. Optional `spinSpeed` adds a perpendicular component for a tumbling
   look — computed as `separationDir × radiusFromCentroid`.

### Auto-trigger from RagdollIntegration

In `_trySpawnRagdoll`, after the ragdoll is created with directional
initialVelocity (round 305), if:
- `goreEnabled` is true (default), AND
- the hit info is fresh (within 1 sec, round 305 staleness rule), AND
- `hitMag >= severDamageThreshold` (default `0.4`)

→ call `ragdoll.severRandomLimb()` with the hit direction (plus jitter)
as the separation vector and damage-scaled separation speed (6-12 m/s).
A particle burst is sprayed at the joint world position via
`window.particles.spawn` (16 small dark-red particles with falloff
gravity, 0.9-1.5 sec TTL).

### What "limb" means

`severRandomLimb({ minDescendants })` selects from any non-root bone
whose subtree contains at least `minDescendants` descendants. For a
humanoid rig like RobotExpressive (55 joints), that includes arms,
legs, neck, and various sub-chains. For the test rig (3 joints), only
bone 1 qualifies — so simple meshes lose half the body if they go.
Selection is uniform over qualifying candidates.

### Tunables (via constructor or setters)

- `goreEnabled` — global toggle (default true)
- `severDamageThreshold` — minimum hit magnitude (default 0.4 raw damage)

### Console API

```js
window.ragdoll.gore(true|false)              // toggle gore
window.ragdoll.isGore()                      // current state
window.ragdoll.severLimb(kaijuId, dir, speed) // force-sever a limb
```

### Tests
**25/25 pass** in `/tmp/test_sever_v306.mjs`:
- Subtree BFS correctness (single arm, leg)
- Impulse application to all subtree bones, NOT to non-severed bones
- Invalid index rejection (root, -1, out-of-range)
- Distance constraint skip across severance line
- Internal subtree links preserved
- `severRandomLimb` uniform candidate selection
- Multiple severs accumulate in `_severedRoots`
- `spinSpeed` adds perpendicular kick
- Full 1-sec simulation tick after sever (limb travels >3m, body stays put)
- Manager integration

---

## 2. WorkerEcgHud — minimize button

Small `−` button in the title row, persists state in
`localStorage.workerEcgHud.minimized`. When minimized:
- canvas hides (`display:none`)
- render loop skips the per-frame draw work (still keeps the rAF
  alive for the auto-show-when-sources-appear behaviour)
- only the title row + restore button remain visible

Click `+` to restore.

---

## 3. FPS = 10 diagnosis

The WorkerEcgHud CSS bleed from round 305 is fixed (visible in the
latest screenshot — the HUD is in its corner with 8 worker rows
rendering correctly). FPS is still 10. The cause is **GPU contention
with the auto-started AI services**.

Console log from the v305 test run:
```
[main] diffuser auto-started: stable-diffusion-1.5 (pid 33268)
[main] comfyui auto-started: C:\VoxelBAK\ComfyUI_windows_portable via GPU launcher (pid 4880)
[OllamaClient] gemma3:4b streamed 18 tokens in 10.4s (1.7 tok/s)
```

A GTX 1080 has 8 GB VRAM and ~9 TFLOPS. SD 1.5 grabs ~4 GB and runs
periodic inference. ComfyUI's GPU launcher means it's competing for
the same GPU. Ollama's `gemma3:4b` at **1.7 tok/s** is unusually
slow — typical for that model on a 1080 is 30-60 tok/s — which
strongly suggests Ollama is also waiting on GPU access.

When 3 inference services + the voxel engine all share one GPU, the
GPU scheduler thrashes and the engine drops to single-digit frame
times spent waiting.

### A/B test

In the browser console:
```js
localStorage.setItem("voxelengine.diffuserAutoStart", "0");
localStorage.setItem("voxelengine.comfyuiAutoStart", "0");
// then reload the page
```

Expected: FPS jumps back to 55-60 if this is the cause.

If you NEED SD/ComfyUI running (Trellis pipeline work), one practical
option is to run them on a different machine or schedule them so the
voxel engine isn't open simultaneously. The auto-start is convenient
when you're doing AI work but punishing when you're doing engine work.

### To make this a permanent fix

Two options for a future round:
- **Flip default to opt-in.** Change line 3070 from `if (pref === "0") return;`
  to `if (pref !== "1") return;`. Users who want auto-start set the flag.
- **Detect contention and warn.** Read `r.queryAdapter()` or similar GPU
  query at boot to detect VRAM pressure, print a clear `[main] WARNING:
  diffuser + voxel engine both on GPU; consider disabling auto-start.`

Not done in v306 — let me know which approach you'd prefer.

---

## 4. "Black panels" diagnosis (open question)

From the screenshot I can see two darker rectangular areas:
- **Upper-left**, behind the NARRATIVE panel (~200×500)
- **Lower-left**, next to the STATUS panel (~200×250)

Without inspector access I can't be sure, but the most likely answers are:
1. **LCARS theme panel chrome** — the engine uses dark/black panel
   backgrounds intentionally; these look "black" against the bright
   voxel terrain but are normal UI.
2. **Empty PROMPT/SETTINGS tab content** — those side tabs may be
   collapsed but their content area is still rendered.
3. **A canvas I haven't located yet** that depended on the old
   global `canvas { width:100vw; height:100vh }` rule.

If you can right-click → Inspect on the panels in question and tell me
the element class/id, I can hunt it precisely.

---

## 5. CounterStrike map import (answer to your question)

**Yes, possible.** Realistic scope estimate below.

CS maps come in three formats depending on the version:
- **CS 1.6 / Goldsrc:** `.bsp` v30, well-documented format, brush-based
  geometry, separate `.wad` for textures
- **CS Source:** `.bsp` v19/v20, similar but with `lzma` compression
  and HDR lightmap data
- **CS 2 / CS:GO:** `.vpk` packages with `.vmap` source, very modern
  pipeline, much harder to parse

For your voxel engine the **right target is Goldsrc** — old maps like
`de_dust2`, `cs_office`, `aim_map`, `fy_iceworld`. They're small
(1-5 MB), have parsers in JS already (e.g. on GitHub: `goldsrc-bsp`,
`bsp-parser-js`), and the visual style is chunky/blocky — fits the
engine aesthetic.

### Two paths to render them

**Path A: Polygon overlay (1 round, ~80% effort)**
- Parse BSP, extract face geometry as triangle lists
- Render as a regular mesh on top of the voxel terrain (or instead of it)
- Apply lightmap textures from the BSP
- Skip brush-to-voxel conversion entirely
- **Limitation:** polygon geometry doesn't interact with the voxel
  destruction/mining system

**Path B: Voxelize the BSP (3 rounds, much more effort)**
- Sample BSP brush solids on a voxel grid (e.g. 0.25 m³ resolution)
- Convert each occupied voxel to the matching terrain ID
- Approximate texture → voxel color via dominant-color sampling
- **Wins:** full integration with destruction, lighting, biomes
- **Loses:** geometry approximation, MUCH larger memory footprint
  (a CS map at 0.25 m³ ≈ several million voxels)

My recommendation: **Path A as a v307 round** if you're interested.
The visual win is huge (de_dust2 with your engine's lighting overhead
would be striking) and the workflow is parser → renderer mount, which
matches how the assets pipeline already works.

If you want this, the next decision is the parser source — there are
MIT-licensed Goldsrc BSP parsers I can pull from for the reading code.

---

## Files changed
- `gpu/GLBParser.js` — preserve `node.name` in `_snapshotNodes`
- `simulation/Ragdoll.js` — `sever()`, `severRandomLimb()`, severance-aware
  distance + angle constraints
- `simulation/RagdollIntegration.js` — auto-sever on heavy hits, gore config,
  particle burst at severance point
- `main.js` — `window.ragdoll.gore()`, `window.ragdoll.severLimb()` API
- `ui/WorkerEcgHud.js` — minimize button with localStorage persistence
- `docs/round-306-limb-severance.md` — this doc
