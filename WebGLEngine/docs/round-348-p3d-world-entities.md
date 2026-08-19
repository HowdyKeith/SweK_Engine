# Round 348 — P3D wired into engine asset creation (`window.p3d`)

v347's P3D was demo-only — you could view a .p3d in the dedicated demo panel, but it wasn't loadable as a world entity. **v348 fixes that.** Now P3D meshes are first-class assets parallel to splats.

## What landed

### `engine/P3dRenderer.js`

A multi-entity mesh renderer. Each `add()` creates a world entity with its own VAO + buffers + transform; all entities share one shader program (compiled once). API:

```js
renderer.add({ mesh, position?, rotation?, scale?, color?, name? }) → id
renderer.remove(id) → boolean
renderer.clear() → number removed
renderer.list() → [{ id, name, position, ... }]
renderer.update(id, patch) → boolean
renderer.render(camera) → void
renderer.dispose() → void
```

Normals are computed at add time via `computeMeshNormals` (the .p3d format intentionally doesn't store them). Lambertian + soft specular fragment shader matches the demo's look.

### `window.p3d` global

Mirrors `window.splat`. Five methods:

```js
window.p3d.load(url, opts)    // fetch → parse → add. Throws on bad magic.
window.p3d.add(mesh, opts)    // already-parsed mesh, skips fetch
window.p3d.list()             // entity snapshots [{id, name, position, ...}]
window.p3d.clear()            // remove all entities, returns count
window.p3d.remove(id)         // remove specific
window.p3d.update(id, patch)  // change position/rotation/scale/color
```

Default position when omitted: 10 units in front of the camera at eye height. Same convention as splats.

### Main loop integration

Renders right after splats, before the demo hooks. The block guards on `entities.length > 0` so it costs nothing when no .p3d entities are loaded. Profiler labels it `p3dEntities` so it shows up in the perf panel.

### Demo integration

The existing `p3d` demo gains a **📍 Place in world** button. Clicking it:
1. Calls `window.p3d.add(this.mesh, {color, name})` with the current synthetic mesh
2. Status line reports the new entity ID and total entity count
3. User exits the demo to see the placement in the actual world

This validates the full pipeline (synthetic generator → demo → window.p3d.add → world entity → main render loop) without needing a real .p3d file.

## Usage examples

### From the console

```js
// Drop a real .p3d file emitted by your Pixal3D Python pipeline
const id = await p3d.load("http://127.0.0.1:8188/view?filename=output.p3d");

// Or via the engine's static server
await p3d.load("/assets/test.p3d", { position: [0, 5, -8], color: [1, 0.4, 0.2] });

// List what's loaded
p3d.list();
// [{ id: 1, name: "output.p3d", position: [0,5,-10], rotation: 0, scale: 1, color:[...], vertCount: 642, triCount: 1280 }]

// Move it
p3d.update(1, { position: [3, 5, -8], scale: 2 });

// Remove or clear
p3d.remove(1);
p3d.clear();
```

### From a script

```js
// Programmatically build a mesh and drop it as an entity
import { generateIcosphere } from "./engine/p3dGenerator.js";
const mesh = generateIcosphere({ subdivisions: 3, radius: 2 });
window.p3d.add(mesh, { position: [10, 5, -5], color: [0.2, 0.8, 0.4] });
```

### From the demo panel

1. `demos.set("p3d")`
2. Pick a generator (e.g. **torus**)
3. Click **📍 Place in world**
4. Status: `📍 placed as world entity id=1 · 1 p3d entity in scene — exit demo to see it`
5. `demos.set(null)` (or switch demo) — the torus appears in front of the camera as a real world entity

## Tests — 1420/1420 cumulative

`test_v348.mjs` adds 51 tests across 14 groups using a stub WebGL2 context (no real GPU needed):

- **T1-T3** Construct, add, default position
- **T4** Input validation — rejects missing/malformed mesh
- **T5** `list()` returns defensive copies (mutating snapshots doesn't affect entities)
- **T6** `update()` returns true/false correctly
- **T7** `remove()` of present/already-removed/unknown ids
- **T8** `clear()` returns count, empties entities
- **T9** `render()` calls drawElements when entities exist, early-exits when empty (drew 624 indices total for icosphere + small torus)
- **T10** `dispose()` cleans up GL resources
- **T11** Main.js wiring: P3dRenderer imported, instance created, `window.p3d` exposed with all 5 methods, render hook present in main loop
- **T12** Demo has Place-in-world button + handler
- **T13** API endpoint shape (regex-checked each method exists)
- **T14** End-to-end: synthetic mesh → encodeP3D → decodeP3D → renderer.add → render

## What the asset pipeline looks like now

For each format you've integrated:

| Format | Source pipeline | Console API | Main-loop slot |
|---|---|---|---|
| `.ply` (splat) | Hunyuan3D / training scripts | `window.splat.load(url)` | after particles, before bloom |
| `.p3d` (mesh) | Pixal3D / any marching-cubes export | **`window.p3d.load(url)`** (v348) | right after splats |
| `.ovm` (voxels) | TRELLIS-2 interceptor | demo only (v345 viewer) | `ovm` demo isolation |
| `.vx` (RLE voxels) | Flow Matching sampler | demo only (v344 viewer) | `flow` demo isolation |
| `.obj` / `.glb` | TripoSR / Hunyuan / mesh tools | existing asset pipeline | world entities |

The next obvious wiring candidate is `.ovm` — make `window.ovm.load(url)` work for sparse voxel assets the same way. But that's a separate round; v348 closes the gap on P3D.

## Where Pixal3D fits

You can now:

1. **Install the deps** (v347 added `py-pixal3d-stack`, one click installs `trimesh + accelerate + safetensors + numpy + scipy`)
2. **Run the Python pipeline** (the doc has the full script — `cpu_offload_with_hook`, float16 autocast, marching cubes on CPU, `export_to_webgl_raw` writes the `.p3d` file)
3. **Drop the output** with `p3d.load("http://127.0.0.1:8188/view?filename=output.p3d")` — appears in the world as a Lambertian-shaded mesh

That's the full picture: a low-VRAM mesh path tuned for 8GB Pascal cards, end-to-end from Python inference to live in-world entity.

## Lineup

| Round | What |
|---|---|
| ✅ v343-v346 | Trilogy + AO + shadows |
| ✅ v347 | P3D viewer + editable installs |
| ✅ **v348** | **P3D as world entity (`window.p3d`)** — this |
| v349 | Maybe: `window.ovm.load(url)` for sparse voxel world entities |
| v350+ | Sister formats: `MOL!` / `MTO!` / `WND!` |
