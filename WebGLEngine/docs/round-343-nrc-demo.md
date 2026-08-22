# Round 343 — Demo #3: Neural Radiance Cache (MLP-per-fragment)

The first of the "topic demos" from your external chat — a 3 → 8 → 8 → 3 multi-layer perceptron runs on every fragment of a 16³ grid of cubes. The 131 network weights live in a single R32F WebGL texture; the shader walks it with `texelFetch` and does the matrix multiplies and ReLU/sigmoid activations directly on the GPU.

## Why this one first

It's the smallest of the three demos. No external file format, no Python intercept, no pipeline integration. Just a network, a texture, a shader, and a demo scene. Done well, it stands alone as a portfolio piece showing "I can run neural inference inside WebGL2 with no ML libraries."

## What landed

### `engine/NeuralRadianceCache.js`

Configurable MLP class. Default dims `[3, 8, 8, 3]` for 131 weights total but accepts anything (e.g. `[3, 16, 16, 3]` = 387 weights).

Public surface:
- `randomize(seed?)` — Xavier-init with optional deterministic seed
- `evaluate([x, y, z])` — CPU forward pass (for verification, tests, and tooling)
- `train(samples, opts)` — **pure-JS SGD with hand-rolled backprop**, no TensorFlow.js
- `upload()` — flatten W's and b's, push to the R32F texture
- `bind(textureUnit)` — bind for use as a uniform sampler
- `getShaderGLSL(funcName, samplerName)` — **emits inline GLSL** that the caller pastes into their fragment shader. Loops are fully unrolled at the configured dim sizes, so the shader compiler can constant-fold the texelFetch offsets

Pure-JS SGD because pulling in TensorFlow.js (~2 MB) to train 131 floats is silly. The full backprop in `train()` is ~50 lines and faster for a network this small.

### `demos/nrc/nrcDemo.js`

The demo mode. When you switch to it:
1. Builds a 16×16×16 grid of unit cubes positioned in front of the camera
2. Each cube reads its normalized `[x, y, z]` position, passes it through the MLP in the fragment shader, and uses the output as RGB
3. A floating control panel offers two buttons:
   - **🎲 Randomize** — re-seeds the weights with Xavier init, re-uploads, instantly changes the field
   - **🏋 Train on sin·cos·sin** — generates 512 samples from a procedural target function and runs 60 epochs of SGD in 4-epoch chunks (so the UI doesn't freeze). Status line shows live loss as the grid morphs toward the target.

The grid sits at `[cam.x - 12, cam.y, cam.z - 15]` (roughly 15 units in front) on demo start.

### DEMO_MODES entry

Added alongside `kaiju` / `ogre` / `voice_lab`. Marked `isolation: "exclusive"` so the background voxel world hides for a cleaner demo presentation. Wired into the main render loop right after splats and before bloom — so the cube glow contributes to the bright pass.

## The math, end to end

```
Input: vec3 cellPos ∈ [0,1]³

Layer 1: vec8 a1 = ReLU(W1 · cellPos + b1)        W1: 8×3 = 24,  b1: 8   →  ptr += 32
Layer 2: vec8 a2 = ReLU(W2 · a1      + b2)        W2: 8×8 = 64,  b2: 8   →  ptr += 72
Layer 3: vec3 a3 = σ   (W3 · a2      + b3)        W3: 3×8 = 24,  b3: 3   →  ptr += 27

Output: fragColor = vec4(a3, 1.0)
                                                  Total weight floats: 131
```

In the shader, `nrcEvaluate_w(int idx)` is a one-liner that `texelFetch`es from the R32F texture at `ivec2(idx, 0)`. The pointer `ptr` walks forward through layers in declaration order: weights, then biases.

Sigmoid on the output layer keeps colors in `[0,1]` even with wildly-scaled training input. ReLU on the hidden layers gives the network non-linearity to actually learn non-trivial functions.

## Tests — 1154/1154 cumulative

`test_v343.mjs` adds 36 tests across 10 groups:

- **T1** Weight count math: 131 for `[3,8,8,3]`, 387 for `[3,16,16,3]`
- **T2** Hand-computed forward pass — input `[3, 1]` with known weights gives the exact expected output `1.5`. Caught a bug I'd made writing the test myself (wrong arithmetic for ReLU'd neuron) before catching the code.
- **T3-T4** Activations: ReLU(2)=2, ReLU(-2)=0, σ(0)=0.5, σ(10)>0.99
- **T5** SGD reduces loss: initial `0.138` → final `0.001` on an identity task in 100 epochs
- **T6** Loss decreased in 94 of 99 consecutive epochs — confirms training is monotonically (mostly) improving
- **T7** Upload packs weights correctly: first W at index 0, first b at index 24 (after the 24 layer-0 W's)
- **T8** GLSL generation: sampler name flows through, function name flows through, both activations appear in source, pointer advances match weight counts
- **T9** GLSL scales with dims: smaller MLP has smaller layer arrays
- **T10** Demo + main loop wiring intact

## Try it

After updating to v343:

```js
engineVersion()   // "v343"
demos.set("nrc")  // or cycle to NRC via Tab / demo panel
```

On the demo screen:
1. The grid loads with random weights → looks like colorful noise
2. Click **🎲 Randomize** a few times — every seed gives a different field
3. Click **🏋 Train on sin·cos·sin** — watch the grid morph over ~2 seconds from noise into a smooth sinusoidal pattern. Status line shows live loss.

Console API also available:
```js
// (after switching to the nrc demo)
const d = demoManager.current._nrc;
d.nrc.evaluate([0.5, 0.5, 0.5])   // CPU eval at the grid center
d.nrc.randomize(12345);             // deterministic seed for reproducibility
d.nrc.upload();
```

## What this proves about the architecture

This is the cleanest possible "ML inside the renderer" pattern:

- **No external deps** — pure WebGL2 + ~250 lines of JS
- **Hot weight reload** — `gl.texSubImage2D` updates the texture in microseconds; no shader recompile
- **Composable** — `getShaderGLSL()` returns a function you paste into ANY fragment shader. Today it colors cubes; tomorrow it can be a per-pixel ambient term on the voxel terrain.

The same pattern scales to bigger networks (`[3, 32, 32, 3]` = 1187 weights) without changing anything — just edit the dims.

## What's still pending from the demo plan

- v344: **Demo #2** — Flow-Matching sampler + RLE `.vx` voxel binary loader
- v345: **Demo #1** — TRELLIS-2 O-Voxel interceptor (.ovm format)
- v346: AO bitmask + PCF shadows for Demo #1
- v347: Frustum culling + octree LOD for Demo #1
- Benchmark Fast/Quality preset toggle — slotted in whenever

## Next?

Demo #2 (Flow Matching + .vx loader)? Or hold and verify NRC visually first?
