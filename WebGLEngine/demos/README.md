# Demos

Drop a `.json` file in this folder and it appears in the on-canvas
**🎬 Demos** menu (top-left). Click the demo's name to apply it. Click the
↻ button on the menu to re-scan the folder without reloading the page.

The folder is enumerated by the AI bridge server's `GET /demos/list`
endpoint, so the bridge needs to be running.

## Minimal format

```json
{
    "name": "Display name",
    "description": "Optional tooltip text",
    "camera": { "x": 0, "y": 60, "z": 80, "yaw": 0, "pitch": -0.4 }
}
```

The only required field is `name`. Everything else is optional.

## Optional fields

`camera` — sets the primary camera pose. Any of `x`, `y`, `z`, `yaw`,
`pitch` may be omitted; missing fields keep the current value.

`voxels` — array of `{x, y, z, v}` writes dispatched through the
command router (so persistence / WSBridge / re-mesh all happen).
Useful for sketching small structures.

```json
"voxels": [
    { "x": 0,  "y": 25, "z": 0, "v": 1 },
    { "x": 1,  "y": 25, "z": 0, "v": 1 }
]
```

`entities` — array of GLB-mesh entity spawns, dispatched as
`entity:spawnMesh` commands. Asset must already be in `GPU_Assets/`.

```json
"entities": [
    { "assetId": "alien", "x": 0, "y": 50, "z": 0, "scale": 1, "kind": "alien" }
]
```

`sequence` — instead of a single `camera`, an array of camera keyframes
that get **tweened** smoothly over their durations (cubic ease-in-out).
Each entry needs a `camera` object plus a `duration` in seconds. Total
runtime ≈ sum of durations. Loading any other demo cancels an in-flight
sequence.

```json
"sequence": [
    { "camera": { "x":  0, "y":  60, "z": 80, "yaw":  0,   "pitch": -0.4 }, "duration": 2.0 },
    { "camera": { "x": 60, "y": 110, "z": 80, "yaw": -0.6, "pitch": -0.7 }, "duration": 4.0 },
    { "camera": { "x": 22, "y":  35, "z": 18, "yaw": -1.2, "pitch": -0.2 }, "duration": 3.0 }
]
```

`structures` — high-level building primitives that get expanded into
voxel writes. Cheaper to write (and for an LLM to generate) than
explicit `voxels` arrays. Capped at 2000 expanded voxels per demo.

Available primitives (all take a `material` as one of the IDs from
`world/voxelFormat.js` — 0 = air for carving, 1 = stone, 2 = dirt,
3 = grass, 4 = sand, 10 = water, 12 = lava, 30 = memory):

```json
"structures": [
    { "kind": "box",    "x0":-2,"y0":10,"z0":-2,"x1":2,"y1":15,"z1":2, "material":1, "hollow":true },
    { "kind": "column", "x":0, "z":0, "y0":10, "y1":20, "material":1 },
    { "kind": "ring",   "cx":0, "cy":15, "cz":0, "radius":3, "material":1 },
    { "kind": "disk",   "cx":0, "cy":15, "cz":0, "radius":3, "material":1 },
    { "kind": "line",   "x0":0,"y0":10,"z0":0, "x1":10,"y1":20,"z1":10, "material":1 }
]
```

## Generating demos with Ollama

If a local Ollama daemon is running (default `localhost:11434`), the
demo menu has a **✨ generate from prompt** block at the top. Type a
short description and hit:

- `→ single` — one camera pose
- `→ sequence` — a 5-step cinematic walkthrough
- `→ structure` — voxel structure (box/column/ring/disk/line primitives) with a framing camera

The model is given the world's coordinate system, biome layout, the
primitive set (for structure mode), and a worked example. The generated
JSON is saved to `demos/` with a timestamped filename like
`gen_stone_tower_lg9k4z.json` and shows up in the menu immediately.

If Ollama isn't reachable or returns malformed JSON, the status line
shows an error and nothing is saved.

## Examples included

- `spawn.json` — default starting view
- `sky_survey.json` — high top-down to see biome distribution
- `origin_closeup.json` — low-altitude side view of the origin
- `obelisk_a.json` — camera framed on memory obelisk A
- `cinematic_obelisk.json` — 4-step sequence demonstrating the tween format
- `watchtower.json` — structure demo: hollow stone tower at origin
