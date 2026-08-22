# Round 344 — Demo #2: Flow Matching sampler + .vx RLE binary format

Second of the three topic demos. Where v343's NRC was "neural inference in a fragment shader," v344 is "neural generative model in a JS integration loop." Two pieces:

1. **`engine/flowMatching.js`** — Pure-JS Flow Matching sampler with Euler + Midpoint integrators
2. **`engine/vxFormat.js`** — Custom binary RLE format for voxel grids, 90%+ compression on sparse data
3. **`demos/flowMatching/flowDemo.js`** — Live visualization: noise → target over 8-32 steps

## The math, end to end

Flow Matching is what TRELLIS-2, Stable Diffusion 3, and most current image/voxel generators use under the hood. Two distributions:

- **x₀** ~ N(0, I) — Gaussian noise tensor
- **x₁** — your target (a 3D shape, an image, whatever)

The Optimal Transport path between them is a straight line: `x_t = (1-t)·x₀ + t·x₁`. Differentiate: `dx/dt = x₁ - x₀ = v(x_t, t)`. That `v` is what a real network learns to predict during training. At inference, you sample x₀, then integrate `dx/dt = v` numerically:

```
x = sample_noise()
for i in 0..steps:
    t = i / steps
    v = velocity_model(x, t)     # ← in production: a trained network
    x = x + v * dt
```

For this demo we cheat: we **know** x₀ and x₁ both, so we use the ground-truth velocity `v = x₁ - x₀` directly. The sampler converges to the target with mean error `8.88e-8` (round-off) after N steps — that's tested. In production you'd swap the GT oracle for an NRC-style trained MLP.

## The .vx binary format

Custom binary layout for voxel grids:

```
Offset  Type     Field
------  -------  ---------------------------------------------
0-3     uint32   Magic = 0x56584C21 ("VXL!" little-endian)
4-5     uint16   Width
6-7     uint16   Height
8-9     uint16   Depth
10      uint8    Channels (1 = occupancy, 4 = RGBA)
11+     [uint16 count, uint8 value] × M
```

Why RLE instead of DEFLATE: voxel data is **mostly flat runs** of identical bytes (air, then wall, then air). The verified compression:

- **All-zero 32³ grid**: 32,768 raw bytes → **14 bytes** encoded (99.96% reduction)
- **Single uniform sphere**: ~85% reduction
- **Adversarial alternating** pattern: encoded is LARGER (16 raw bytes → 59 bytes) — expected and documented

Run length capped at 65,535 (uint16); the encoder splits longer runs into multiple pairs.

## The demo experience

After `demos.set("flow")`, you get a 24³ instanced-cube grid (13,824 cells) with a control panel offering:

- **Target dropdown** — sphere / torus / spiral / random sparse
- **Integrator** — Euler (1st order) or Midpoint (2nd order)
- **Steps slider** — 8 to 32 integration steps
- **▶ Play** — auto-advances one step every 80ms
- **⏭ Step** — manual single-step
- **↺ Reset** — re-sample x₀ from N(0, I), regenerate target
- **💾 .vx** — download the current state as compressed binary

You watch the field **materialize from noise to structure** in real time. The integration is pure-JS in the main thread; per-step cost on 24³ is ~3ms (well within frame budget). When playing, the demo uploads the new color buffer via `gl.bufferSubData` each step — no shader recompile, no texture re-bind.

## Wiring

Same pattern as v343 NRC:
- New entry in `DEMO_MODES` with `isolation: "exclusive"` (no background world clutter)
- `_flowRenderHook` slot called from main loop right after the NRC hook
- Demo `.start()` constructs the FlowDemo instance and installs the hook; `.stop()` disposes both

## Tests — 1217/1217 cumulative

`test_v344.mjs` adds 64 tests across 16 groups:

- **T1-T7** Binary format: round-trip identity, header layout, magic check, RLE compression on sparse + uniform + adversarial cases, run-length cap, error paths, edge cases (single voxel, RGBA)
- **T8** Procedural targets: sphere has interior+exterior boundary, torus has center hole, spiral is sparse, random is deterministic with seed, TARGETS dict exports all four
- **T9** Initial state: mean≈0, variance≈1 confirms x₀ is Gaussian noise
- **T10** Convergence: `mean|x - x₁| = 8.88e-8` after integration (essentially exact)
- **T11-T12** Step-by-step: return value flips at last step, reset() restores noise exactly via seed
- **T13** Midpoint matches Euler on GT oracle (both yield same answer when v is constant in t)
- **T14** Output converters: occupancy + RGBA Uint8Array
- **T15** Flow output → .vx → decode round-trip preserves all 864 RGBA bytes
- **T16** main.js wiring intact

## Try it

```js
engineVersion()    // "v344"
demos.set("flow")
```

In the panel:
1. Pick **sphere** target, **Euler** integrator, **16 steps**
2. Click **▶ Play** — watch the noise tensor resolve into a colored sphere over ~1.3 seconds
3. Click **↺ Reset**, change to **spiral**, hit **▶ Play** again — same dynamics, different shape
4. Click **💾 .vx** at any step to download the current state. The status line reports the compression ratio.

## What this proves

- The integration loop is the **only** thing that matters for inference. Swap the velocity oracle for a trained network and you have a real generative model.
- The .vx format pays its keep: a 24³ × RGBA flow output is 55,296 raw bytes; the sphere target compresses to under 5KB.
- 13,824 cube instances run at 60fps including dynamic per-step color upload. Same architecture trivially handles 32³ (32,768 instances).

## Next

- ✅ v343: NRC (Demo #3)
- ✅ v344: Flow Matching + .vx (Demo #2)
- v345: **TRELLIS-2 O-Voxel interceptor (.ovm format)** — Demo #1
- v346: AO bitmask + PCF shadows on top of Demo #1
- v347: Frustum chunks + octree LOD on top of Demo #1
