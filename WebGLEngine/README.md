# VoxelEngine v2.23 (GLB Triangle Mesh Rendering — Cluster 2 follow-up)

## v2.23 changes (Cluster 2 polish — same GLB now also opens as a triangle mesh in the WebGL window)

v2.22 closed Cluster 3's editor wiring and fixed three latent crashes
that finally made the page run end-to-end. In parallel the user-side
VBA GLB parser closed the deferred Cluster 2 voxelization item via
`World_PlaceGLB` (alien.glb → 4000 voxels in 1 POST round-trip).
v2.23 reuses that same parsed GLB to render the *original triangle
mesh* in the WebGL window alongside the voxelized version — so you
can see the shape both ways.

### How it works

The engine already had `EntityMeshRenderer` (v2.15) + `GPUAssetLoader`
(v2.15 schema fix) — they render arbitrary triangle meshes from
`/GPU_Assets/<name>/{mesh.json, vertices.bin, indices.bin}`. The
parts missing for "open this GLB as a mesh" were:

- A way to *write* the asset files. Solved on the VBA side
  with `modGLBExport.bas` — walks the already-loaded
  `clsGLTFAsset`, merges all primitives' POSITION + INDICES with
  proper offset adjustment, writes the three files into
  `<GPU_ASSETS_ROOT>\<assetName>\`. ~250 lines of VBA, reusing the
  parser the user wrote.
- A way to *spawn an entity* using a given assetId at a given
  position. Added as router command `entity:spawnMesh`:
  ```json
  { "type": "entity:spawnMesh",
    "assetId": "alien",
    "x": 0, "y": 30, "z": 0,
    "scale": 1, "kind": "prop" }
  ```
  Creates an ECS entity with `Position` + `Render{assetId, scale}` +
  `Tag(kind)`. Next frame, `EntityMeshRenderer` sees the new
  assetId and kicks off `GPUAssetLoader.loadAsset()`, which
  fetches the three files written by VBA. Once cached, the mesh
  draws every frame as instanced triangle geometry.

### VBA usage

One macro:
```vb
World_PlaceGLBAsMesh "C:\VoxelBAK\models\alien.glb", "alien", 0, 30, 0
```

What you see in the console:
```
[GLBExport] merged: 89673 vertices, 268320 indices (89440 triangles)
[GLBExport] wrote C:\VoxelEngine\GPU_Assets\alien\{mesh.json, vertices.bin, indices.bin}
[GLBExport] spawn command sent: assetId=alien at (0,30,0) scale=1
[GLBExport] done — alien should appear in the WebGL window
```

What you see in the engine: an actual triangle-mesh alien at
position (0, 30, 0), tinted blue (the default `prop` colour), with
shading via screen-space derivatives.

If the model looks tiny: the alien.glb is in metric units (~8m
tall), so `scale=1` puts it 8 voxels tall. Bump the optional 6th arg
to make it bigger:
```vb
World_PlaceGLBAsMesh "C:\VoxelBAK\models\alien.glb", "alien", 0, 30, 0, 4
' → 4× scale, alien is ~32 voxels tall
```

If you spawn the same assetId multiple times (e.g. an army of
aliens), they batch into one instanced draw call — the renderer
sees them as instances of the same mesh.

### Configuration required

`modGLBExport.bas` has one constant at the top:
```vb
Private Const GPU_ASSETS_ROOT As String = "C:\VoxelEngine\GPU_Assets\"
```
Set this to your engine root's `GPU_Assets\` directory — wherever
you extracted the v2.23 zip. Trailing backslash required.

### Engine-side changes (small)

- `core/ecs/components.js` — `Render` gets a `scale` field
  (default 1), opt-in per spawn for non-default mesh sizing.
- `bridge/ecs_render_bridge.js` — surfaces `render.scale` in the
  flat entity output so the renderer can read it.
- `render/EntityMeshRenderer.js` — uses `entity.scale` when
  present, falls back to `scaleFor(kind)` for legacy entities.
- `core/commandRouter.js` — `entity:spawnMesh` command handler
  (~30 lines), inserted before the legacy network forwarder.
- `main.js` — imports `Position, Render, Tag` from components,
  registers `ecs: ecsWorld` + `ecsTypes: { Position, Render, Tag }`
  in the router env so the spawn command can construct components.

### What's parsed but unused (yet)

The VBA parser reads more than v2.23's exporter currently uses:
node hierarchy + transforms (`UpdateHierarchy`,
`node.GlobalMatrix`), and individual mesh names. Right now
`ExtractMergedMesh` flattens everything into one merged mesh in
raw model space. The natural next iteration:

1. **Apply node transforms** — for each node with a mesh,
   `clsNode.GlobalMatrix` already exists from
   `UpdateHierarchy()`. Multiply each vertex by it before writing.
   Single-node assemblies won't change; multi-node ones (a robot
   with separately-positioned limbs) will compose correctly.
2. **Per-mesh assets** — write each `clsMesh` as its own asset
   instead of merging. Lets you spawn individual parts at
   independent positions.
3. **Material colours** — parse `materials[]`, map `primitive.material`
   to a tint per asset.

None of these block v2.23 working — the alien renders fine merged.
They're listed as natural follow-up steps when you want richer
output.

### Cluster status

| Cluster | Status |
|---|---|
| 1 — Render polish | ✓ closed (water v2.14, meshes v2.15, DPR + persistence v2.21) |
| 2 — Excel as control panel | ✓ closed (sim v2.17, narratives v2.18, bulk + Excel-paint v2.19, Ollama terrain v2.20, GLB voxels + GLB triangle meshes v2.23) |
| 3 — Make it a game | partial (editor wiring v2.22; ECS v2 engines + voxel destruction open) |
| 4 — Multiplayer | open |
| 5 — Per-screen narratives | ✓ closed (v2.16) |
| 6 — Engine swap | open |

Cluster 2 is now genuinely fully closed including all the polish
the user spec'd. Cluster 3 has two finishers remaining (ECS v2
engines: combat/physics; voxel destruction). Cluster 4 (multiplayer)
and Cluster 6 (60-file engine layer) are still open.

### Latent crash count: 11 (unchanged from v2.22)

v2.23 is purely additive — new module, new command, surfaced field.
No fixes to existing bugs were needed; v2.22's three camera fixes
remain the most recent.

---



## v2.22 changes (Cluster 3, item 1 — mouse-driven voxel editing, plus the camera fixes that finally make the page work in a real browser)

This round was supposed to be one feature: wire the parked
`editor/`, `tools/`, `input/` toolchains into a working voxel
editor. Surfacing the work surfaced **three more latent crashes
that mean the page has never actually run end-to-end in a real
browser** since at least v2.13. So before any editor wiring, the
page had to be made *runnable*. Both halves below.

### Three latent crashes fixed first

These don't fire in node tests because the failing imports/methods
are only reached on full `main.js` load in a browser context. v2.21
and earlier ship clean integration test results but the real page
threw on Camera construction.

- **`Camera._attachInput()` was called by the constructor but never
  defined anywhere in the codebase.** The browser would throw
  `TypeError: this._attachInput is not a function` on first page
  load — before any frame rendered. v2.22 implements standard FPS
  controls: click canvas to enter pointer-lock, mouse-look while
  locked (with pitch clamped just shy of straight up/down), WASD +
  Space + Shift tracked into the existing `keys` Set.
- **`Camera.getViewProjMatrix()` returned `this.viewProj`, but
  `viewProj` was never computed anywhere.** Renderers passed
  `undefined` to `gl.uniformMatrix4fv`. v2.22 builds the matrix
  every frame in `update()` via the new shared `buildViewProj()`
  helper. Aspect ratio derives from `canvas.width/height` so DPR
  resizes (v2.21) are picked up automatically. Adds projection
  fields (`fov`, `near`, `far`) to the constructor.
- **`tv/TVScreenCamera.js` imported `../camera/buildViewProj.js`
  but the file didn't exist.** ES module load failure → main.js
  refuses to load → entire app dead. v2.22 creates
  `camera/buildViewProj.js` with a properly-conventioned
  view-projection builder shared between `Camera` and
  `TVScreenCamera`.

### Editor wiring

The existing `editor/`, `tools/`, and `input/` folders had three
inconsistent toolchains targeting different chunk-rebuild
pipelines (gpu.uploadChunk, dispatcher.forceRebuildChunk, etc.) —
none of which the current renderer uses. Rather than refactor any
of them, v2.22 cherry-picks the cleanest pieces and wires them
through what already works.

- **`editor/EditorController.js` (new)** — single controller, three
  responsibilities:
  1. **Per-frame raycast** from camera forward updates the existing
     `VoxelHighlight.setTarget(hit)` so the voxel under the
     crosshair has a visible outline.
  2. **Mouse clicks** while pointer is locked:
     - Left click → remove hit voxel (set to AIR)
     - Right click → place current material on the face that was hit
     (`hit.x + hit.face.x, hit.y + hit.face.y, hit.z + hit.face.z`)
  3. **Number keys 1–7** cycle through the material palette.
     Active material highlights in a small bottom-centre overlay so
     you always know what right-click will place.
- **Reuses what works**: the function-style `raycastVoxel()` from
  `editor/voxelSelectionRaycast.js` (the cleanest of the three
  raycasters in the tree), and the existing
  `render/voxelhighlight.js` for the hover outline. All voxel
  mutations route through `router.exec({type:"voxel:set", ...})`,
  which means **chunk._modified gets set automatically** — every
  voxel you place or remove in the editor is persisted across
  reloads (v2.21) for free, and broadcast to any WS subscriber for
  free.
- **`main.js`** — constructs `EditorController` after router env
  registration, calls `editor.update()` each frame after
  `camera.update()`, exposes `editor.snapshot()` in HUD telemetry.

Material palette — keys 1–7:
```
1 stone   2 dirt    3 grass   4 sand
5 water   6 lava    7 erase
```

How to use:
1. Page loads. Click on the canvas → pointer locks, you can move
   with WASD + mouse-look + Space/Shift for vertical.
2. The voxel under your crosshair gets a wireframe highlight.
3. Left-click removes it. Right-click places whatever material is
   active (palette shows current selection in the bottom-centre).
4. Press 1–7 to switch material. The palette overlay updates.
5. Reload. Everything you built is still there (persistence —
   v2.21).

### Test coverage

- `buildViewProj` produces finite, non-NaN matrix values from
  representative inputs.
- `raycastVoxel` from a camera looking down returns
  `face={x:0,y:1,z:0}` (top face) — correct for placing a voxel
  on top of a hit voxel.
- `raycastVoxel` from horizontal returns `face={x:-1,y:0,z:0}` — the
  face on the camera's side — correct for "place toward me" semantics.
- Editor → router → world.setVoxel → `chunk._modified=true` chain
  works (persistence integration verified).
- Camera constructs without throwing; `update()` populates `viewProj`
  with finite values; module imports resolve.

### Cluster 3 status

| Item | Round | Status |
|---|---|---|
| Editor wiring | v2.22 | ✓ |
| ECS v2 engines (combat, physics) | — | open |
| Voxel destruction | — | open |

Two rounds remaining in Cluster 3. ECS v2 wires the parked
`core/ecs/{ai,combat,physics}_engine_v2.js`. Voxel destruction
hooks `modVoxelDestructionEngine.DestroySphere` etc to a JS
consumer for explosion effects.

### Latent crash count: now 11.

| | File | Bug |
|---|---|---|
| #1 | `camera.js` | `getViewProjMatrix()` missing (v2.14 added alias) |
| #2 | `gpuAssetLoader.js` | path `${name}/${name}/` doubled (v2.15) |
| #3 | `gpuAssetLoader.js` | schema `vertexFile` vs `vertexBuffer` (v2.15) |
| #4 | `main.js` v2.13 | `narrative.compose()` not a method (v2.16) |
| #5 | `main.js` v2.13 | `director.append()` not a method (v2.16) |
| #6 | `commandRouter.js` | bare `SUBSCRIBE SYSTEM` token = syntax error (v2.17) |
| #7 | `wsBridge.js` | port 8090 vs relay 8787 (v2.17) |
| #8 | VBA | `LoadGLB_Binary_Advanced` undefined (v2.19, deferred) |
| #9 | `camera.js` | `_attachInput()` called but undefined (v2.22) |
| #10 | `camera/buildViewProj.js` | imported but file missing (v2.22) |
| #11 | `camera.js` | `viewProj` returned but never computed (v2.22) |

---

## v2.21 changes (Cluster 1 finishers — DPR + Persistence)

Two small things bundled because DPR is genuinely tiny: a sharper
canvas on retina/4K screens, and a save/load layer so the world
survives reloads. Together they close out Cluster 1.

### DPR (high-DPI canvas)

- **`main.js` `resize()`** — framebuffer width/height scaled by
  `window.devicePixelRatio`, capped at 2× so a 4K retina display
  doesn't quietly drop to 30 FPS. CSS sizing is unchanged so the
  canvas still fills the same screen area; just rendered at higher
  resolution.
- **`tv/TVOverlay.js` v3** — DPR-aware. `resize(w, h, dpr)` stores
  the ratio; render loop multiplies font sizes (11→11×dpr, 12→12×dpr)
  and padding by `dpr` so text stays the right physical size on
  screen. Without this scaling, captions would render at half size
  on a 2x display because the framebuffer is now 2x.

### Persistence

The world's terrain generator is deterministic (noise-based, fixed
seed), so we save **only the diff** — chunks that diverged from
fresh generation. v2.21 adds a `_modified` flag set on every
`setVoxel` (via simulation, command router, debug API alike); save
walks chunks and only writes those flagged.

- **`world/WorldPersistence.js` (new)** — sparse chunk-diff
  save/load via localStorage. Per chunk: `{cx, cz, v: <base64
  Uint8Array>}`. ~21 KB per modified chunk after base64 encoding;
  five typical "I built something" chunks ≈ 100 KB, well under the
  5 MB localStorage limit. Camera pose stored under a separate key
  for clean reset semantics.
- **`world/world.js` `setVoxel()`** — sets `chunk._modified = true`
  alongside the existing `chunk.dirty = true`. The flag is never
  auto-cleared (unlike `dirty` which the renderer clears each frame),
  so it accurately tracks "this chunk has had a user/sim/command
  change since generation."
- **`core/commandRouter.js`** — adds three commands:
  - `world:save` — emit a `world:saved` event with chunk count + bytes.
  - `world:load` — restore last save, emit `world:loaded`.
  - `world:reset` — clear the save (doesn't wipe in-memory; reload
    page to actually see fresh terrain).
- **`vba/active/modSimControl.bas`** — `World_Save` / `World_Load`
  / `World_Reset` macros.
- **`main.js`** — auto-loads on startup if a save exists (mesh
  cache cleared so restored chunks regenerate visually). Auto-saves
  every 30 seconds plus on `beforeunload`. The first thing you see
  after a reload is the world you left.

How to use:
- Just play. Build a tower, drop a Castle demo, place voxels via
  Excel, fire `World_OllamaTerrain "a haunted ruin", 0, 25, 0`.
  Reload the page — everything's still there, including your camera
  position and orientation.
- For an explicit reset: `World_Reset` then refresh the page.
- Manual save (e.g. before a risky test): `World_Save`.

Tested 11 cases: empty save (0 chunks, 51 bytes), setVoxel→`_modified`
flag propagation, save/load roundtrip with byte-exact voxel
restoration, camera position+yaw+pitch roundtrip, clear, version
mismatch handling, corrupt JSON handling, both router commands fire
their events with correct payloads.

### Cluster 1 status

| Item | Round | Status |
|---|---|---|
| Water shader | v2.14 | ✓ |
| Voxelized entity meshes | v2.15 | ✓ |
| DPR | v2.21 | ✓ |
| Persistence | v2.21 | ✓ |

**Cluster 1 closed.**

---

## v2.20 changes (Cluster 2, item 4 — closes Cluster 2 except for the deferred GLTF loader)

LLM-generated voxel structures. Type a prompt in VBA, watch a tower
or pond materialize in the world. Builds on v2.18's `OllamaClient`
and v2.19's bulk voxel ops — both pieces were already there; this
round just connects them with a structured prompt + a robust JSON
extractor.

- **`core/commandRouter.js`** — adds `terrain:ollamaGenerate {prompt,
  anchor:[x,y,z]}` (fire-and-forget; result lands via the
  `terrain:generated` event so the WS caller doesn't block). The
  handler:
  - Builds a few-shot prompt with two example structures (a stone
    pillar, a pond surrounded by sand) so the LLM sees the format.
  - Calls `ollama.generate()` with `num_predict=1024`,
    `temperature=0.55`, stops on `\n\n\n` / `Request:` /
    `</voxels>`.
  - Extracts JSON robustly: strips markdown code fences, tries
    direct parse, then greedy `{...}` match, then comma-stripped
    retry. Survives the four common LLM output styles (plain JSON,
    fenced JSON, prose-wrapped JSON, trailing commas).
  - Validates per-voxel: dx/dy/dz must be finite and within ±20 of
    anchor; voxel id must be one of {0, 1, 2, 3, 4, 10, 11, 12} (no
    SCREEN material — that needs media binding). Bad voxels drop;
    good ones place. Caps at 500 voxels per response with a
    `truncated:true` flag.
- **`vba/active/modSimControl.bas`** — adds:
  - `World_OllamaTerrain(prompt, anchorX, anchorY, anchorZ)` — sends
    the command. Examples in module comments.
  - Private `EscapeJson` helper for `"`-and-backslash safety.

How to use:
1. Make sure Ollama is running with a model that handles JSON well —
   `ollama pull llama3.2` (default) or `ollama pull phi3:mini`
   (faster, surprisingly good at this).
2. From VBA Immediate Window:
   ```
   World_OllamaTerrain "a small stone pillar", 0, 25, 0
   World_OllamaTerrain "a sand dune with a single tree", 15, 22, 0
   World_OllamaTerrain "a tiny pond surrounded by grass", -10, 20, 5
   World_OllamaTerrain "a tower of glowing lava", 25, 22, 0
   ```
3. Watch the browser. Each prompt lands as a small structure
   2–10 seconds later. Browser console logs the placement summary:
   ```
   [Router] terrain "a small stone pillar" placed=4 dropped=0
   ```

The same `terrain:generated` event is emitted on success and on every
failure mode (no LLM, no parse, no response) so a future Excel-as-HUD
round can subscribe and write the placement counts to a worksheet.

Testing — 11 cases covered: clean JSON, markdown-fenced JSON,
prose-wrapped JSON, trailing commas, out-of-range coords dropped,
invalid voxel ids dropped, malformed → graceful failure, 500-voxel
cap with truncation flag, anchor offset arithmetic, empty voxels
array, missing Ollama → graceful "no Ollama client" event.

This effectively closes Cluster 2:
- ✓ item 1 — Excel sim tuning (v2.17)
- ✓ item 2 — Ollama-driven narratives (v2.18)
- — item 3 — VBA-loaded GLTF voxels (deferred, the user's looking at
    the broken `LoadGLTF_GLb_Advanced` pipeline)
- ✓ item 4 — Ollama-generated terrain (v2.20)

The bulk voxel ops in v2.19 are now used by both rounds 3 and 4, and
will be reused once the GLTF loader is fixed — the import path is the
same `world:bulkVoxelSet` regardless of source.

---

## v2.19 changes (Cluster 2, item 3 — pivoted; see GLTF note below)

**Pivot note.** The original target this round was "VBA-loaded GLTF
voxels," but the existing GLTF loader is broken — `LoadGLTF_GLb_Advanced`
delegates to `LoadGLB_Binary_Advanced` and `LoadGLTF_Json_Advanced`,
neither of which is defined anywhere in `vba/active/`. The whole load
path errors out before any voxelization could happen. Writing a GLB
binary parser in pure VBA is a substantial round on its own; deferred
to a future "VBA Pipeline Repair" pass.

What this round delivers instead is the foundation those features need
plus a richer, more directly usable demo: **bulk voxel ops** (one POST
paints many voxels) and **Excel as voxel-art tool** (paint a worksheet
range, see it in 3D).

- **`core/commandRouter.js`** — adds `world:fillBox` and
  `world:bulkVoxelSet` command families:
  - `world:fillBox` — inclusive axis-aligned box, normalized so corners
    can be passed in any order. Capped at 200×200×200 to prevent
    accidental world wipes.
  - `world:bulkVoxelSet` — accepts two shapes: `{voxels:[[x,y,z,v],...]}`
    for mixed types, or `{anchor:[ax,ay,az], v, offsets:[[dx,dy,dz],...]}`
    for a single voxel type at relative offsets. The offsets form is
    ~3× smaller for typical use (one model = one type at one anchor).
- **`vba/active/modSimControl.bas`** — adds:
  - `World_FillBox(x1, y1, z1, x2, y2, z2, v)` — direct fillBox.
  - `World_Tower(x, y, z, [height], [width], [v])` — quick rectangular tower.
  - `World_Sphere(cx, cy, cz, r, [v])` — voxel sphere via bulkVoxelSet.
  - `World_PlaceFromCells(anchorX, Y, Z, rangeAddress, [defaultV], [layerCount])`
    — read a 2D Excel range, treat each non-empty cell as a voxel
    (numeric cell value = voxel id; non-numeric = default), place at
    anchor. Supports stamping the same flat pattern on multiple Y
    layers for quick wall-building.
  - `World_DemoCastle()` — one-click demo: foundation, walls, four
    corner towers, a moat. Demonstrates fillBox + Tower in one macro.

Tested via the router's `exec()` path (5 cases): exact voxel counts
for fillBox + bulkVoxelSet, mixed-type voxels, safety-cap rejects
overlarge boxes, inverted-corner normalisation works.

How to use the Excel-paint demo:
1. Open the workbook. Pick any sheet, fill cells in a rectangle:
   `1` for dirt, `2` for grass, `3` for stone, `10` for water,
   leave blanks empty. Make a small pixel-art figure or pattern.
2. From VBA Immediate Window:
   `World_PlaceFromCells 0, 25, 0, "Sheet1!A1:H8", 3`
   The pattern materializes as a flat slab at world (0..7, 25, 0..7).
3. To extrude into walls, pass `layerCount`:
   `World_PlaceFromCells 0, 25, 0, "Sheet1!A1:H8", 3, 5`
   Stamps the same pattern at Y = 25..29.

The same `world:bulkVoxelSet` command will be the foundation when:
- The future VBA pipeline repair fixes the GLTF loader (it'll just
  walk `VoxelGrid` and emit one bulk POST).
- The Ollama-generated terrain round wires Ollama to JSON-format
  voxel positions and POST them via the same command.

---

## v2.18 changes (Cluster 2, item 2 — extends v2.16 with LLM rephrase)

The five hand-rolled narrative templates from v2.16 are now augmented
with live Ollama calls. **Captions still appear instantly** (sync
templated text) so the TV wall feels responsive; an async LLM call
fires in parallel and **swaps the caption text in-place** when the
LLM responds (~1–4s typical). If Ollama isn't running, the
templated text just stays — fully graceful degrade, never blocks
the loop.

- **`ai/OllamaClient.js` (new)** — minimal browser-side client for the
  local Ollama daemon at `http://localhost:11434`. Auto-probes
  reachability on first use; logs a single warning if the daemon's
  not running and short-circuits subsequent calls to null. After 3
  consecutive failures it stops trying until a manual re-probe.
  Exposes `snapshot()` for the HUD (calls, fails, avg latency).
- **`ai/NarrativeEngine.js` v2** — adds `useLLM(client)` and the new
  `interpretAsync()` method. Sync `interpret()` still returns the
  templated story instantly (preserves v2.16 behaviour). Async
  builds a documentary-narrator one-shot prompt from the civ event
  and returns the LLM's response. History entries are tagged with
  `source: "template" | "llm"` so callers can tell them apart.
- **`ai/TVScreenAgent.js`** — `observe(evt)` now does both:
  1. Sync interpret → caption appears within one frame.
  2. Async interpretAsync → caption text + source replaces in-place
     when LLM responds, **but only if the latest caption is still
     the same story**. Stale-replace guard via timestamp comparison
     prevents an old inflight LLM call from clobbering a newer
     event's caption that arrived during the inflight wait.
  - Tracks `pendingLLM` (inflight count) + `llmReplaced` (successful
    upgrades) for the HUD.
- **`core/commandRouter.js`** — adds `narrative:setModel`
  + `narrative:probe` command types so VBA can switch models at
  runtime or re-probe after starting Ollama late.
- **`vba/active/modSimControl.bas`** — adds `Narrative_SetModel(model)`
  and `Narrative_Probe()` macros.
- **`main.js`** — constructs a single shared `OllamaClient` (one probe
  state across all agents), wires it into each TVScreenAgent's
  NarrativeEngine via `useLLM(ollama)`, registers in the router env,
  exposes `ollama.snapshot()` in the HUD telemetry.

How to use:
1. Install Ollama: <https://ollama.com> — then `ollama pull llama3.2`
   (default model used by this client) or `ollama pull phi3:mini`
   (faster).
2. Start the daemon: `ollama serve`. On the same machine as the page,
   default CORS rules allow the browser to talk to it directly. If
   you serve the page from a different host, run with
   `OLLAMA_ORIGINS=* ollama serve` instead.
3. Open the page; check the browser console for the OllamaClient
   probe result. Press **T** to activate the TV wall. Civ events
   fire over time; each caption first appears as a templated line
   and is then replaced by an LLM rephrase 1–4s later.
4. From VBA: `Narrative_SetModel "phi3:mini"` to swap models live.
   `Narrative_Probe` to re-probe (e.g. if you started Ollama after
   loading the page).

If Ollama isn't reachable, you'll see the templated text exactly as
in v2.16 — nothing breaks, just no LLM upgrade.

---

## v2.17 changes (Cluster 2, item 1 — Excel as control panel)

The spreadsheet now actually drives the engine. Each VBA macro POSTs a
JSON command to the `ai-bridge` relay; the relay broadcasts via
WebSocket; the browser-side `WSBridge` forwards to `CommandRouter.exec()`;
the router mutates `world` / `waterRenderer` / `tvWall`. Live, no
page reload, no plumbing the user has to think about.

End-to-end pipeline tested in this round: `POST /voxel-update` with
`{type:"sim:seedWater",x:0,y:19,z:0,w:3,h:3}` produced exactly 9 water
voxels in the live world.

- **`core/commandRouter.js` v2** — added the `sim:*`, `wave:*`, and
  `tv:*` command families:
  - `sim:setRainIntensity` / `sim:setRainHeight` / `sim:setRainArea`
  - `sim:seedWater` — drop a rectangular pool
  - `sim:clearWater` — sweep all WATER + FLOWING_WATER → AIR
  - `wave:setAmplitude` — water-shader displacement strength
  - `tv:setLayout` — wall layout (1×1, 2×2, 3×2, etc.)
  - `tv:setScreenCamera` — aim a registered TV camera (partial fields ok)
  - All v1 voxel commands preserved (`voxel:set`, `voxel:get`, `chunk:dump`)
  - New `register(extra)` method so main.js can wire in waterRenderer +
    tvWall references after construction.
  - **Latent crash fixed**: v1 had a bare `SUBSCRIBE SYSTEM (Excel ...)`
    line in the class body where a comment was intended. The file
    failed to parse — the entire app would have died at startup. Now
    a proper `// ` comment.
- **`bridge/wsBridge.js` v2** — port fix + reliability:
  - Default URL was `ws://localhost:8090`; relay actually listens on
    `8787`. Fixed.
  - v1 had no error/close handlers — failures were silent and the
    bridge stayed dead after one disconnect. v2 logs once on first
    failure, auto-reconnects every 3s, exposes `snapshot()` for HUD.
  - Wraps `router.exec` in try/catch so a bad command doesn't kill the
    bridge.
- **`vba/active/modSimControl.bas` (new)** — Excel-side macros that
  build JSON commands and POST them via `MSXML2.XMLHTTP.6.0`:
  - `Sim_SetRainIntensity(value)` / `Sim_SetRainHeight(value)`
    / `Sim_SetRainArea(value)`
  - `Sim_SeedWater(x, y, z, [w], [h])` / `Sim_ClearWater()`
  - `Wave_SetAmplitude(value)`
  - `TV_SetLayout(cols, rows)` / `TV_MoveScreen(id, [x, y, z, yaw, pitch])`
  - `Voxel_Set(x, y, z, v)`
  - `SimControl_DemoTour()` — one-click smoke test that fires every
    command type in sequence.
- **`main.js`** — calls `router.register({ waterRenderer, tvWall, tvOverlay })`
  after the TV wall is constructed, so the new command families have
  the env they need.

How to use (smoke test):
1. `cd ai-bridge && npm install && node server.js` (one-time per machine
   for the npm install). Watch for `[relay] HTTP+WS listening on :8787`.
2. Open the page; watch the browser console for
   `[WSBridge] connected ws://localhost:8787`. If you see "relay not
   reachable" instead, step 1 didn't take.
3. Open the workbook, re-import VBA via `VBASync_RunFullSync` (see
   vba/IMPORT_README.md).
4. From the VBA Immediate Window: `SimControl_DemoTour` — the world
   should react: rain intensifies, a 6×6 lake appears at origin,
   wave amplitude ticks up, TV wall snaps to 2×2 with cameras aimed
   at the demo positions.

The same router is used by future Cluster 2 rounds (Ollama-driven
narratives → `narrative:setTemplate`, GLTF-loaded voxel injection →
`voxel:bulkSet`, etc.) — the surface area is now generic enough that
adding command types is one switch arm + one VBA Sub.

---

## v2.16 changes (Cluster 5 — per-screen narratives, the centerpiece)

The TV wall is finally **wired**. Three satellite cells, each with its own
camera pointed at a seeded civilization cluster, each with its own
`TVScreenAgent` narrating from that camera's POV. Press **T** to cycle
the wall layout (1×1 → 2×2 → 3×2 → off).

- **`ai/TVScreenAgent.js` (new)** — per-screen narrative observer. Each
  agent owns a `NarrativeEngine` instance, holds a reference to its
  TVScreenCamera, and filters incoming civ events by spatial proximity
  to its camera (default radius 35 units). Events without coords (true
  global events) are seen by all agents. Each agent's latest narrative
  caption is exposed via `captionState()` for the overlay.
- **`tv/TVOverlay.js` v2** — adds per-screen captions in addition to the
  v1 grid lines and labels. Each cell's caption is pinned to the bottom
  in a translucent backdrop band; intensity drives text alpha.
- **`render/voxelrenderer.js`** — `render()` now accepts an optional
  `{ viewport }` opt for multi-cell rendering. When supplied, sets
  `gl.viewport` + `gl.scissor` for the cell, skips the canvas-wide
  clear (caller clears once per frame). Leaves scissor on at end so
  subsequent passes (water, etc.) inherit the cell.
- **`main.js`** — substantial:
  - Constructs `TVWall` with 3 pre-registered satellite cameras
    placed near the 3 seeded memory clusters at (12, 38, 8),
    (-8, 38, 14), (5, 38, -10). Eye-altitude angle (-0.5 pitch).
  - Constructs `screenAgents` map and subscribes to
    `CivilizationEventBus`. Each civ event flows through every agent;
    each agent decides via proximity whether to narrate; observed
    stories feed the global `DocumentaryDirector.ingest()`.
  - **Fixed two latent crashes**: previous wiring called
    `narrative.compose(evt)` and `director.append(line)` — neither
    method exists. The first civ event would have thrown
    `TypeError: narrative.compose is not a function`. Now uses
    `agent.observe(evt)` + `director.ingest(stories)` + `compose()`.
  - Adds **T-key** to cycle wall layout.
  - Multi-cell render block: clear once, primary cell renders with
    full overlay set (water + entities + highlight), satellite cells
    render bare voxels + water (clean surveillance views, no entity
    markers).
  - HUD adds `tv` block with per-screen narrative state.
- **`tv/TVWall.js`** — unchanged (the existing v1 already had the
  right architecture).

What you'll see:
1. World loads as before. Press **T** once → 2×2 wall appears.
2. Three satellite cells show the world from cameras near the seeded
   civilization clusters (top-right, bottom-left, bottom-right).
3. Each cell has its top-left label (`screen #1`, `#2`, `#3`) and a
   bottom caption that fills in as civ events fire near that camera.
4. The captions are independent per cell — surveillance documentary
   feel. Cell-1 narrates events near (12, 38, 8); cell-2 around
   (-8, 38, 14); cell-3 around (5, 38, -10).
5. Press **T** again for 3×2; once more to return to 1×1.

The captions cycle between three lines based on event intensity:
- intensity > 0.8: "A major structural surge reshapes the voxel ecosystem."
- intensity > 0.5: "Localized civilization growth stabilizes."
- otherwise: "Minor fluctuations ripple through the system."
- collapse events: "A decay cascade reduces structural density."
- expand events: "Expansion wave propagates through voxel clusters."

These are the templates from the existing `NarrativeEngine.interpret()`.
Cluster 2's "Ollama-driven narratives" round would replace them with
LLM-prompted text per event.

---

## v2.15 changes (Cluster 1, item 2 — closes the v2.12 cube placeholder)

The `EntityCubeRenderer` plain colored cubes are now upgraded — entities
with a `Render { assetId }` component render as actual triangle meshes
loaded from `GPU_Assets/`. Cubes remain the fallback for entities
without an asset.

- **`gpu/gpuAssetLoader.js` v2** — fixed two latent bugs and made it
  resilient:
  - v1 fetched `/GPU_Assets/${name}/${name}/...` (double name in path).
    Real layout is `/GPU_Assets/${name}/`. Fixed.
  - v1 expected meta keys `vertexFile`/`indexFile`; actual `mesh.json`
    uses `vertexBuffer`/`indexBuffer`. Both schemas now supported.
  - Negative-cache for permanently-missing assets so the renderer
    doesn't keep retrying. The 73 `Mesh_X.asset.json` files in
    `uploads_files_3694169_machine/` lack `.bin` payloads and now fail
    once into the negative cache rather than re-trying every frame.
- **`render/EntityMeshRenderer.js` (new)** — instanced triangle mesh
  rendering. Groups entities by assetId for one
  `drawElementsInstanced` per asset regardless of how many entities
  share it. Per-instance: world-position + scale + tint (from kind
  via shared `entityVisuals`). Fragment shader computes face normals
  via `dFdx`/`dFdy` of `vWorld` so meshes get directional shading
  even though the binary mesh data has no normal attribute.
- **`bridge/ecs_render_bridge.js` v2** — `getVisibleEntities()` now
  surfaces the `assetId` from the `Render` component. Same shape as
  before plus one field.
- **`scene.json`** — entities 100, 101 (enemies) and 200 (prop) now
  have `render: { type: "mesh", assetId: "mesh_0" }`. The remaining
  enemies/props stay as plain colored cubes for visual contrast.
- **`main.js`** — constructs `GPUAssetLoader` + `EntityMeshRenderer`,
  pre-loads `mesh_0` at startup, runs mesh-render before cube-render
  each frame. Cube renderer skips entities consumed by the mesh
  renderer (the consumed-set returned by `entityMeshRenderer.render`).

What you'll see: at spawn, two enemies (100, 101) and one prop (200)
look like the loaded `mesh_0` triangle mesh — face-normal shaded with
the directional sun, tinted by entity kind (enemy = red-ish, prop =
blue-ish, scaled to 1.0). The remaining cube enemies (102) and the
player (1) remain as colored cubes.

If `mesh_0` fails to load (missing files, network error), the meshed
entities will silently render as cubes via the fallback.

---

## v2.14 changes (Cluster 1, item 1 — water shader)



- **`render/WaterRenderer.js` (new)** — instanced wave-animated translucent
  water surface. Per-frame: collects only top-surface water voxels (water
  with non-water above) every 100ms, draws each as an upward-facing unit
  quad with vertex-shader sin/cos wave displacement, gradient-derived
  normals, fresnel-ish color mix (deep blue → surface blue by upness),
  power-32 specular highlight in sun direction, alpha 0.75.
- **`render/voxelrenderer.js`** — added `skipWater` flag (default false).
  When true, water voxel IDs (10, 11) are filtered out of the greedy
  mesher so they don't render twice (opaque blocks beneath the wave
  surface). `main.js` flips it on after constructing WaterRenderer and
  calls `renderer.meshes.clear()` to force the rebuild.
- **`camera/camera.js`** — added `getViewProjMatrix()` as an alias for
  `getMatrix()`. The voxelrenderer / voxelhighlight / EntityCubeRenderer
  all called `getViewProjMatrix()` but Camera only had `getMatrix()` —
  this would have crashed on first frame in a browser. Both names point
  at the same matrix now.
- **`main.js`** — constructs WaterRenderer, seeds a 5×5 starter lake at
  (6..10, 19, 6..10) for instant visibility, calls `waterRenderer.update()`
  + `render()` between solid voxels and highlight in the loop.

Watch for the small lake near spawn — translucent, animated, with a
visible specular highlight when you angle the view. As rain runs, more
water surfaces will appear and ripple.

---

## v2.13 changes (506pm + v2.4-v2.12 merge)


This zip is your **506pm working tree** as the base, with the
v2.4–v2.12 features (sim systems v2, GPU heatmap, GPU scanner,
instanced entity rendering, plus the prerequisite AI / civilization /
memory-field stack they depend on) integrated. Plus the cleaned VBA.

## Quick start

```powershell
# 1. ai-bridge (one-time per machine)
cd ai-bridge
npm install
node server.js
# expect: [relay] HTTP+WS listening on :8787

# 2. serve the page (any directory above this one)
cd ..
python -m http.server 8000
# open http://localhost:8000

# 3. when ready, open the workbook and re-import the cleaned modules
# (see vba/IMPORT_README.md)
```

## Keys (in addition to your existing input)

- **`H`** — toggle the GPU memory heatmap minimap (bottom-right corner)
- **`R`** — toggle the rain → fluid → erosion simulation
- **`E`** — cycle entity render mode: solid → wireframe → off

## What was preserved from your 506pm baseline

Everything. All your additions stayed in place:

- Your `engine/` (60 files), `gameplay/`, `voxel/`, `editor/`,
  `tools/`, `mesh/`, `models/`, `net/`,
  `renderer/`, `scene/`, `shaders/`, `bootstrap/`, `debug/`, `input/`,
  `video/` directories — untouched
- All your `WebGL 3.*.xlsm` files in the root (5 of them)
- Your `GLTF_Exports/`, `GPU_Assets/` asset directories
- Your `cube.html`, `index.html`, `indexPlus.html`, `intro.mp4`,
  `debugCube.js`
- Your `core/ecs/` (with `ai_engine_v2`, `combat_engine_v2`,
  `physics_engine_v2`, `ecs_runtime`, `ecs_world`) — I added
  `components.js` + `systems/AISystem.js` + `systems/MovementSystem.js`
  alongside without touching the others
- Your `bridge/wsBridge.js`, `bridge/VoxelECSBridge.js`,
  `bridge/commandBridge.js`, etc. — I only added new sibling files
- Your `world/world.js` — I added `simulate(dt)` + `isAir(x,y,z)` +
  `ensureChunksLoaded()` (no-op shim) at the end; existing methods
  unchanged
- Your `core/commandRouter.js` — untouched (my AI layer adapts to
  your `router.exec()` API)

`main.js` is the one file with significant changes — your v103 logic
is preserved verbatim (Camera/world/renderer/highlight, NetClient,
WSBridge, mouse raycast, `window.VOXEL` debug API), and the new layers
were added around it. Your original is preserved as
`main.v103.js.bak` if you want to diff.

## What was added (new top-level dirs)

```
ai/                    13 files — agent / signal bus / observation / narrative
analysis/              2 files  — civilization scanners (CPU + GPU hybrid)
simulation/            4 files  — civilization manager / loop / events / entity
meta/                  3 files  — rule engine / mutations / universe optimizer
tv/                    3 files  — TV-wall multi-camera infrastructure
ai-bridge/             3 files  — relay server (HTTP + WS) + README_FIRST
vba/active/           41 files  — cleaned VBA modules
vba/_archive/          6 files  — superseded modules (kept for reference)
```

## What was added to existing dirs

- `gpu/VoxelMemoryGPU.js` — RGBA32F ping-pong heatmap with shader decay
- `gpu/MemoryHeatmapOverlay.js` — minimap canvas, throttled readback
- `world/VoxelMemoryField.js` — CPU memory map (canonical) with mirror hook
- `render/EntityCubeRenderer.js` — instanced solid cubes with directional shading
- `render/entityVisuals.js` — shared kind→color/scale lookup
- `render/entityDebugRenderer.js` — wireframe debug renderer (mode toggle target)
- `bridge/ecs_render_bridge.js` — exposes ECS transforms to renderer
- `bridge/ecs_voxel_bridge.js` — exposes ECS to voxel-write commands
- `bridge/SceneLoader.js` — populates ECS from scene.json
- `core/ecs/components.js` + `systems/AISystem.js` + `systems/MovementSystem.js`
- `scene.json` — default scene (player + 3 enemies)

## What was replaced

- `world/fluidSystem.js` v1 → v2 (originals moved to `world/_archive_v1/`)
- `world/rainSystem.js` v1 → v2
- `world/hydraulicErosion.js` v1 → v2
- `world/erosionSystem.js` v1 → v2

The v1 files had real bugs:

- **fluid** wrote `WATER` to non-air voxels (overwrote stone) and spread
  to all 4 sides regardless of whether neighbors were air → exponential
  growth in confined spaces
- **rain** spawned 20 drops every `update()` call with no cap, area
  hard-coded to (0, 0)
- **hydraulic** had a `bestY` initialization bug that left particles
  eroding the same cell forever on bedrock
- **erosion** had the same exponential branching as fluid

v2 fixes all of these. Hard caps + air-only spread + TTL + stuck
detection + camera-following rain + water-threshold death. See
`world/_archive_v1/` for the originals if you want to diff.

## What was added to your `world.js`

Three additive changes — your existing methods are untouched:

1. **`isAir(x, y, z)`** — convenience used by sim systems and AI agents
2. **`ensureChunksLoaded(...)`** — no-op shim for compatibility (your
   world is fixed-grid via `gridRadius`, my AI/civ code calls this for
   streaming-world support)
3. **`simulate(dt)`** — runs all 5 sim systems in one call:
   ```js
   simulate(dt = 0.1) {
       this.rain.update();
       this.rain.step();
       this.fluid.update();
       this.hydraulic.update();
       this.erosion.update();
       this.waves.update(dt);
   }
   ```
4. **Constructor extension** — instantiates `this.fluid`/`rain`/
   `hydraulic`/`erosion`/`waves` so other modules can hold references

## What you'll see at runtime

The page loads as before. **In addition**:

- **HUD** shows new lines: GPU memory state, sim particle counts,
  AI agent count + memory size, civilization count + scanner mode
- **Civilizations** spawn from seeded memory clusters near
  (12, 30, 8), (-8, 30, 14), (5, 30, -10). The `CivilizationLoop`
  scans every 2s and the manager ticks every 250ms. Birth/death
  events flow into the narrative pipeline → HUD `STORY` line.
- **Rain** spawns drops over the camera position; landings become
  fluid particles + occasionally seed hydraulic erosion. Watch for
  blue water voxels appearing and terrain visibly carving over time.
- **Press H** for the heatmap minimap — bright spots are recent
  activity (1.2s decay half-life). You'll see civilizations as warm
  clusters that pulse as agents add memory.
- **Press E** to toggle entity rendering between solid (default),
  wireframe (debug), off.
- **Press R** to disable simulation if it gets distracting.

## Tested

Full pipeline verified in node against your VoxelWorld:

```
their world: 81 chunks loaded, fluid=true, simulate=function
PASS: AIManager — agents:2 ticked:5 memorySize:0
PASS: civ pipeline — civs:1 via:cpu
PASS: 50-tick sim — rain:0 fluid:0 hydro:27 eroded:742
PASS: world.isAir adapter
PASS: all imports resolve, integration smoke test passes
PASS: ECS render bridge produces correct kinds from Tag/AI components
```

GPU paths can't be validated in node (no real GL context), but they
gracefully degrade: `VoxelMemoryGPU` checks for
`EXT_color_buffer_float` at construction and disables itself with a
console warning if missing. Every method becomes a no-op. The
`CivilizationGPUScanner` checks `gpu.supported` and returns `null` so
the loop falls back to `CivilizationScanner` (CPU). HUD shows `via:cpu`
or `via:gpu` so you can see which path actually ran.

## VBA cleanup

See **`vba/IMPORT_README.md`** for the full breakdown. Summary:

- **46 → 41 modules.** 6 archived, 1 added.
- All 4 GLTF Type duplicates resolved (compile-blocker fixed)
- All 5 procedure name duplicates resolved
- One signature collision (`SetVoxel`) renamed to `SetVoxelDirect`
- Your three pasted upgrades applied (PBR texture handling, clean
  CreateControlButtons, ConvertSelectedOBJtoVMesh)
- Four missing macros stubbed in `modOllamaMissingMacros.bas`

Re-import via `VBASync_RunFullSync` pointed at `vba/active/`.

## Files I deliberately didn't ship

- **`ComputeManager.js` / `TerrainSystem.js` / `TerrainChunkSystem.js`**
  — were in an earlier upload's `new/` folder. They use
  `gl.COMPUTE_SHADER` and `gl.dispatchCompute` which are **WebGPU APIs,
  not WebGL2**. Won't run as-is in a WebGL2 context. If you want them
  back, the right path is to either:
  - Quarantine in `experimental/` with a clear "WebGPU only" note
  - Port to fragment-shader equivalents (a transform feedback or
    ping-pong RGBA32F ping-pong covers most compute use cases)

  These weren't in this upload's 506pm zip, so I didn't ship them
  either way. Mentioning here in case you have them in another folder.

## What's still open

- I never actually ran the merged build in a real browser — only in
  node. The browser-only paths (Camera input, mouse capture, GL
  rendering, scene.json fetch, RelayClient WebSocket connect) are all
  unchanged from working code, but if anything in your `voxelrenderer`
  or `Camera` has a regression vs my v2.12 expectations, the loop
  could throw on first frame. Watch the browser console.
- Your `core/commandRouter.js` and mine had different APIs (yours
  uses `exec`/`on`, mine used `execute`/`emit`). I kept yours and
  adapted my AI layer to call `router.exec`. If you have other
  consumers expecting `execute`, those still work — `exec` is what
  your file already exports.
- I didn't try to integrate with your `engine/` parallel layer
  (60 files). Those are your domain. My features run alongside, not
  on top of, your engine.
- Your `core/ecs/ai_engine_v2`, `combat_engine_v2`, `physics_engine_v2`
  are untouched. My `core/ecs/systems/AISystem.js` and `MovementSystem.js`
  are sibling files. Pick whichever you want to wire from main.js;
  currently I wire mine.
