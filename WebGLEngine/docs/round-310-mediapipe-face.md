# Round 310 — MediaPipe face tracker (first round)

Webcam face detection via Google's MediaPipe FaceLandmarker. Lazy-loaded,
opt-in, locally-run. Nothing fetches and nothing asks for camera
permission until `face.start()` is called.

**First-round scope is just the data pipeline.** Avatar / kaiju /
expression wiring is reserved for later rounds.

---

## What this round ships

A new module `face/MediaPipeFaceTracker.js` (~450 lines) that, on
demand:

1. **Asks for webcam permission** (`getUserMedia({ video: true })`)
2. **Lazy-loads MediaPipe** (~12MB WASM + model) from CDN —
   `cdn.jsdelivr.net/npm/@mediapipe/[email protected]` and the float16
   face landmarker `.task` file
3. **Runs detection at ~30Hz** (throttled — face data doesn't need 60Hz)
4. **Exposes 478 3D landmarks** in normalized `[0..1]` image coords
5. **Exposes computed metrics** suitable for driving avatars:
   - `eyeLeft`, `eyeRight` — EAR-like openness, ~0.30 rest, <0.10 closed
   - `mouthOpen` — vertical lip distance / face height
   - `mouthWide` — corner distance / face width (smile detector)
   - `browLeft`, `browRight` — eyebrow Y relative to eye top
   - `yaw`, `pitch`, `roll` — head pose in radians, from MediaPipe's
     `facialTransformationMatrix` when available, or a cheap fallback
     using nose-vs-face-centroid offset
6. **Optional floating preview** — 160×120 webcam thumbnail with
   landmarks drawn as cyan dots and a metrics readout at bottom.
   Draggable, has a close button, parks bottom-right by default.

---

## Public API

```js
// Console — opt-in by calling start()
await window.face.start()                  // requests perms, loads MediaPipe
window.face.showPreview(true)              // floating webcam thumbnail

// Read latest detection
window.face.metrics()                      // { mouthOpen, eyeLeft, yaw, ... }
window.face.snapshot()                     // adds raw landmarks + blendShapes

// Subscribe to per-frame updates
const off = window.face.onUpdate((metrics, fullResult) => {
    // Do something — drive avatar, log, etc.
});
off()                                      // unsubscribe

// Stop everything
window.face.stop()                         // releases camera, disposes models
```

If `face.start()` is never called, **zero camera/network access happens**
— the module is fully dormant. Privacy-first by construction.

---

## Implementation notes

### Lazy loading via dynamic import

`main.js` wires `window.face` as a thin shim. The actual MediaPipe
module is only `import()`-ed inside `start()`. So:

- Cold page boot: zero impact (no fetch, no permission prompt)
- `await face.start()`: ~3-5 sec for first-time fetch + WASM init
- Subsequent starts in same session: instant (module cached)

### MediaPipe's `vision_bundle.mjs`

Loaded directly from the jsDelivr CDN as an ES module via dynamic
import. We use the `VIDEO` running mode (not `LIVE_STREAM`) because the
synchronous `detectForVideo()` call fits cleanly into a per-frame
detection loop without callback gymnastics.

GPU delegate is requested first; MediaPipe internally falls back to CPU
if the WebGL context isn't suitable for the model.

### `computeMetrics()` is a pure function

Exported separately. Takes a landmark array + optional MediaPipe
`result` and returns the metrics object. This is what the tests exercise
— no webcam needed.

The landmark indices come from MediaPipe's published face mesh topology
(478 points). Anchor points we use:

| Metric           | Indices                              |
|------------------|--------------------------------------|
| Left eye         | top=159 bot=145 L=33 R=133           |
| Right eye        | top=386 bot=374 L=362 R=263          |
| Mouth            | upper=13 lower=14 L=78 R=308         |
| Left eyebrow     | center=107 up=105                    |
| Right eyebrow    | center=336 up=334                    |
| Head pose        | nose=1 chin=152 forehead=10          |
| Face dimensions  | cheeks=234,454 forehead=10 chin=152  |

### Cleanup on stop()

`MediaStreamTrack.stop()` per track, video element removed from DOM,
FaceLandmarker `.close()` called, preview canvas removed if shown.
Page can call `start()` again afterward without leaks.

---

## What's deferred to later rounds

These were tempting to ship in one go but stay out of v310 to keep this
round focused on plumbing:

- **HeartbeatAvatar driving** — make the floating avatar mirror the
  user's face (mouth, eyes, head turn)
- **robotFaceAvatar driving** — same for the 3D robot
- **Kaiju expression link** — face-driven kaiju mood (smile = happy
  kaiju particles, etc.)
- **Phoneme detection for lip sync** — combine MediaPipe mouth shape
  with PhonemeMouth.js
- **Multi-face tracking** — currently `numFaces: 1`
- **Offline-packaged model** — currently fetched from CDN on first
  start; bundling would let this work without internet

---

## Tests — 22/22 pass (`/tmp/test_mediapipe_face_v310.mjs`)

Hand-crafted 478-landmark arrays drive `computeMetrics()`. The webcam
loop is untestable in node, but the metric math is pure and verifiable.

- Neutral face produces sensible EAR (~0.33), low mouthOpen, zero yaw
- Pulling lower lip down → `mouthOpen > 3× baseline`
- Pulling lids together → `eyeLeft/Right < 0.10` (blink)
- Spreading mouth corners → `mouthWide > 1.5× baseline` (smile)
- Raising brow center Y → `browLeft/Right` increases
- Nose offset right/left → `yaw > 0.1` / `yaw < -0.1` (fallback path)
- Identity `facialTransformationMatrix` → `yaw = pitch = roll = 0`
  (matrix path takes precedence over fallback)
- X-axis rotation matrix → non-zero roll
- Null / empty / undersized landmarks → `null` (no crash)

## Cumulative test count

- v303 joint angle limits: **21/21**
- v305 directional impulse: **18/18**
- v306 dismemberment: **20/20**
- v308 civilian ragdolls: **30/30**
- v309 hit reactions: **24/24**
- v310 mediapipe face: **22/22**
- **135/135 total**

## Files changed

- `face/MediaPipeFaceTracker.js` — new (~450 lines)
- `main.js` — `window.face` shim that dynamically imports the module
  on first `.start()` call

## Expected impact

- **No FPS impact** unless `face.start()` is called
- **When active:** detection runs on rAF throttled to 30Hz; MediaPipe
  uses its own WebGL context separate from the main canvas, so
  contention with the voxel renderer should be minimal — but if a
  noticeable FPS drop appears when face is active, `_frameProf` will
  reveal it (look for a large uninstrumented gap, since MediaPipe runs
  outside any of our instrumented sections)

## How to test in-browser

```js
await face.start()                    // grant camera permission
face.showPreview(true)                // see the dots + metrics
face.metrics()                        // current readings
face.onUpdate(m => console.log(m.mouthOpen.toFixed(2)))   // live stream
```

Open your mouth: `mouthOpen` jumps from ~0.02 to 0.15+.
Blink: `eyeLeft`/`eyeRight` drop from ~0.30 to <0.10.
Turn head left: `yaw` goes negative; right: positive.
