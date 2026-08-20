# Round 311 — Face mirror demo + auto-discovery demo

Face tracking gets a visible demo with auto-discovery into the dropdown.
Also: small packaging fix — intro.mp4 (1.5 MB) excluded from the zip
going forward.

---

## FPS profile findings (from v310 run)

The profiler ran for 5 seconds and produced a clear picture:

| Section | Mean ms | % of frame |
|---|---|---|
| **render.entities** | **70.5** | **32.6%** |
| shadowPass | 7.7 | 3.6% |
| render.sky+atmosphere | 6.3 | 2.9% |
| (everything else) | <1 each | <1% |
| **Uninstrumented gap** | **~130** | **59%** |

Average: **216 ms/frame → 4.6 FPS**.

Two clear levers:

1. **`render.entities`** — single biggest measurable cost. At 70 ms/frame
   for what's probably 50-150 visible entities. Likely culprits:
   - Skinned mesh CPU work (RobotExpressive has 55 joints, runs per
     instance)
   - Per-instance matrix recomputation each frame
   - Multiple draw calls instead of a single instanced pass
2. **Uninstrumented 59 %** — about 130 ms/frame happens outside
   anything I'm timing. Candidates: GPU stall waiting on prior frames,
   browser composite of stacked overlay canvases, mesh-worker
   callbacks on the main thread, GC pauses, the `coldstart` Ollama
   warmup, or third-party content scripts ("Unchecked runtime.lastError
   ... message channel closed" — that's a Chrome extension).

Not chasing either this round (focus is face), but those are the right
next FPS targets.

### Spikes worth noting

- `render.entities` had a 145 ms frame
- `render.sky+atmosphere` had a 74 ms spike (probably the atmosphere
  system allocating a cloud burst once)

---

## Demo system — what we found

The engine has TWO ways demos enter the dropdown:

### 1. Hardcoded `DEMO_MODES` in `main.js`

Static list around line 2152. Things like boids, pinball, cellular
automata, etc. Adding here requires editing main.js.

### 2. Auto-discovered from `demos_code/*.js` (round 86)

The bridge server enumerates the folder via `readdirSync` at the
endpoint `/demos_code/list`. The browser then dynamically imports each
file. **Drop a `.js` file into `demos_code/` with a default export, restart
the bridge, refresh the page — done.** The schema:

```js
export default {
    id:    "your_demo",
    label: "VISIBLE LABEL IN DROPDOWN",
    hint:  "tooltip-style description",
    controls: ["control 1", "control 2"],   // shown in info panel
    async start(ctx) { ... },               // open
    tick(ctx, dt)    { ... },               // optional per-frame
    stop(ctx)        { ... },               // cleanup
};
```

`ctx` is the engine context — gives access to `kpop` (toast/info HUD),
`audio`, etc.

### Standalone HTML pages not in the dropdown

These open via `window.open()` from various UI buttons — not part of the
demo system:

- `face.html` — SVG face listener
- `robotface.html` — 3D Robot listener
- `aibrain.html` — VBA bridge visualizer
- `wadmap.html` — minimap companion
- `cube.html` — D3D11 cube
- `spectator.html` — viewport cast receiver
- `AudioLab.html` — Web Audio explorer
- `indexPlus.html` — alternate index
- `ha/panel.html` — HeartbeatAvatar undocked

The `audio_lab.js` demo (round 219) is the pattern for converting one
of these into a dropdown demo: wrap it in an iframe overlay.

---

## What this round ships

### `face-mirror.html` (new)

Standalone page demonstrating MediaPipe face tracking:

- **Left panel:** webcam preview with 478 cyan landmark dots drawn over
  it. Mirrored horizontally for natural feel.
- **Right panel:** stylized SVG face whose features mirror your real
  face in real time:
  - Mouth `rx` scales with `mouthWide`; `ry` scales with `mouthOpen`
  - Eyes vertical scale tied to `eyeLeft` / `eyeRight` (close on blink)
  - Eyebrows translate up/down with `browLeft` / `browRight`
  - Head SVG group rotates with `roll`, translates with `yaw`/`pitch`
- **Bottom bar:** live numeric readouts + detection FPS

Camera permission is only requested when the user clicks the "Start
camera" button. MediaPipe (~12 MB) only loads on first start.

### `demos_code/face_test.js` (new)

Thin wrapper that opens `face-mirror.html` as a fullscreen iframe
overlay. Mirrors the audio_lab.js pattern. Adds the entry
**"FACE MIRROR — MEDIAPIPE WEBCAM DEMO"** to the demo dropdown
automatically — the bridge server enumerates demos_code/ on each
`/demos_code/list` request.

ESC or the BACK button returns to the engine. The iframe receives
camera permission via `allow="camera"`.

### Packaging — `intro.mp4` excluded

The 1.5 MB intro video is no longer copied into the zip. Engine
clients that need it can keep their own copy.

---

## How to test

After unzipping into your engine root:

1. Restart the bridge server so it picks up the new `demos_code/`
   entry.
2. Reload the engine page.
3. Open the demo dropdown — **FACE MIRROR — MEDIAPIPE WEBCAM DEMO**
   should appear.
4. Pick it. The iframe overlay opens.
5. Click "Start camera". Wait ~3-5 sec for MediaPipe to load on first
   run.
6. The SVG face on the right mirrors your real face: open your mouth,
   blink, raise eyebrows, turn your head.

If the demo doesn't appear, the bridge probably wasn't restarted —
`/demos_code/list` is cached at server startup time only if the
server's mode is something other than `readdirSync` per request. (Our
server reads on every hit, so just hard-refresh.)

---

## What's still deferred to later rounds

- Wire face metrics into HeartbeatAvatar (mouse avatar mirrors user)
- Wire face metrics into robotFaceAvatar (3D robot mirrors user)
- Wire face metrics into kaiju moods (your smile → happy kaiju)
- Phoneme detection + lip-sync with PhonemeMouth.js
- Multi-face tracking
- Offline-packaged MediaPipe model files

---

## Cumulative test count (unchanged this round — no new logic)

- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**
- v308 civilian ragdolls: **30/30**
- v309 hit reactions: **24/24**
- v310 mediapipe face metrics: **22/22**
- **135/135 total**

## Files changed

- `face-mirror.html` — new, standalone demo page
- `demos_code/face_test.js` — new, dropdown entry
- Zip excludes `intro.mp4` going forward
