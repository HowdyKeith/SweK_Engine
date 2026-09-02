# TSL and SweK -- the roadmap (written at v4319, step 4 built at v4320)

TSL is three.js's node shading language: a shader written as JavaScript nodes that three's node builders
compile to WGSL on its WebGPU backend and to GLSL on its WebGL2 backend. SweK's own answer to "one shader,
either backend" is gfx/device.js with the pair written by hand in both languages and held to each other by
gate (142 GLSL-bearing files, 52 WGSL-bearing, 10 both at v4318). Until v4319 nothing in the tree ran TSL:
the vendored three was r160, which has no TSL entry point, and the two TSL references in the tree
(render/solidTexture.mjs, render/rebar.mjs) are algorithms rewritten in GLSL with the origin credited.

## The steps, and where each stands

1. **Vendor a TSL-capable three beside r160.** DONE at v4319: vendor/three-webgpu carries three 0.178's
   `three.webgpu.js`, `three.core.js`, `three.tsl.js` and LICENSE, with ONE edit (three.tsl.js's bare
   `'three/webgpu'` import rewritten to `'./three.webgpu.js'` so pages and the harness load it by path).
   three 0.185 was tried first and refused on this shell's Chromium (its texture views pass a `swizzle` the
   browser does not know); 0.178 runs unpatched. The two builds must never meet in one page (two copies of
   THREE break instanceof); tsl-selfcheck scans every page for that.
2. **A probe page and a gate proving TSL runs here.** DONE: tsl-probe.html (WebGPURenderer, `?webgl=1`
   forces the WebGL2 backend) and tools/ship/tsl-selfcheck.mjs section 2: a TSL colour node renders the uv
   gradient on both backends, read back through `readRenderTargetPixelsAsync`. Two measured facts a caller
   needs: the readback hands rows top-first on WebGPU and bottom-first on WebGL2; and 0.178's WebGPU readback
   undersizes its staging buffer for widths whose rows are not 256-byte aligned (32 px fails, 64 works).
3. **One effect in TSL, graded against its twin.** DONE: render/badTvTsl.mjs writes badTv once as nodes
   (Ashima's simplex and Turner's tear, constants interpolated from badTvModel.mjs). tsl-selfcheck section 3:
   on BOTH backends the TSL picture, row-mirrored, equals the device pipeline's on every one of 4,096 pixels
   (worst difference 0) and equals the CPU model's texel on every pixel. Three's WGSL builder and our
   hand-written WGSL, three's GLSL builder and our GLSL, agree to the byte on this effect.
4. **TSL as a SOURCE for gfx/device.js.** BUILT at v4320, for fragment-only effects. render/tslSource.mjs
   reads the builders' output through `WebGPURenderer.debug.getShaderAsync` (WGSL on the WebGPU backend,
   GLSL on the WebGL2 one), transplants the emitted fragment -- its helper functions and the body of main(),
   with three's names rewritten to the device's -- into the device's own full-screen shell, and hands back a
   pipeline descriptor. tslSource-selfcheck: on both backends the pipeline whose fragment three generated
   draws the hand-written pair's picture on 4,096 of 4,096 pixels, worst 0, no mirror (the device's vertex
   stage); the blackbody key transplants too. The rules are narrow and refuse by name: a bare NodeMaterial
   with fragmentNode, every uniform and texture labelled, one varying, no camera or object matrix in the
   fragment, types the device carries. The emitted pair is written to tools/ship/tsl-emitted.json and the
   WGSL corpus compiles it as generated code. Not yet: a vertex-stage transplant (three's camera in the
   graph), linear-filtered sampling on the device path, and the speed of the generated code.
5. **Physics as TSL nodes.** STARTED at v4319: render/blackbodyTsl.mjs writes Planck's shape and Wien's
   root (a TSL `Loop` of 24 Newton steps) as `Fn` nodes any node material can take; tsl-selfcheck section 4
   reads the key off both backends -- the brightest column on the n = 5 row is x_lambda = 4.965114 within a
   column, x_nu = 2.821439 for n = 3, the root itself in the blue byte. The Lyapunov and Heidler functions are
   not yet written as nodes (ln 2 at r = 4 and the Heidler peak 1 are their keys, the same as the WGSL's).
6. **Main scene migration.** NOT PLANNED. main.js renders with r160's WebGLRenderer and nothing on the ladder
   needs WebGPURenderer; the gpuDriven/fleets/terrain stack sits on gfx/device.js, not on three.

## The count that says when step 4 matters

tools/ship/shaderCensus-selfcheck.mjs has held, since v3274, that a hand-written pair is cheaper than an
IR while few files carry both languages ("if this count climbs toward twenty the arithmetic inverts, and
THAT is when to re-open the three-stage shape: parse, lower, emit per target"). The count is 12 at v4319
(3 when the line was written) and the gate is red on it, on the record. TSL is a three-stage shape someone
else maintains: the graph is the IR, and three's two builders are the emitters. Step 4 is that argument
made concrete, and section 3 of tsl-selfcheck is its first evidence: the emitted pair equals ours.

## What TSL gives that the tree does not have today

- A node graph composes: a race look, a post effect and a physics function can be one material without
  anyone writing the glue in two languages.
- Three's materials (MeshStandardNodeMaterial and the rest) take a node anywhere -- the whole PBR stack is
  available to a TSL function, which the device pipelines do not offer.
- Compute in TSL (`Fn().compute()`) is the same language as the fragment, which the tree's compute passes
  (orbits, cull, Hi-Z, the population pass) are not.

## What it costs

- 3.2 MB of vendored three beside 1.2 MB of r160, until main.js moves (step 6) or never.
- Two THREE copies in the tree, which must not share a page.
- Three's conventions where they differ from device.js: uv v = 0 at the bottom (the row mirror), readback
  row order per backend, the 256-byte row alignment of the WebGPU readback.
