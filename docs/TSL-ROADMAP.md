# TSL and SweK -- the roadmap (written at v4319; step 4 built at v4320, step 5 at v4321, a race painted and the rig page at v4322, linear sampling and the page's generated race at v4323, the vertex stage at v4324, a second shell and a second race at v4325, a texture across the shell boundary at v4326, a sampler at v4327, the ink layout at v4328, the module split and the front-door drawer at v4329, the compute stage at v4331, a pass that reads a buffer at v4336, an atomic one at v4337, workgroup-shared memory at v4338, an indirect dispatch at v4339)

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
   WGSL corpus compiles it as generated code. v4322: transplantIntoShell() carries a fragment into a host's own vertex shell (the fleets' lit
   layout: local, n, color), so a graph reading uv, the normal and the vertex colour crosses over; three's
   camera in the graph still refuses -- and at v4324 it need not cross: a graph that MOVES vertices (a
   positionNode) crosses without it. Three writes the displacement as statements on positionLocal before its
   camera matrices; vertexDisplacement() lifts them, and a shell that says {{DISPLACE}} in its own vertex
   stage takes them with its own transform (the fleet's record placement, its turn, the device's viewProj).
   tslRace-selfcheck section 4: the Chaos race breathing along its own normal by the generated vertex stage
   equals a hand-written twin on 36,864 of 36,864 pixels on both backends, ~720 pixels moved from the still
   race, and amp 0 draws the still race exactly; orrery-gpu.html?tsl=1 breathes.
   v4325 -- A SECOND SHELL, so that "any shell" stops being an untested word: the SPRITE layout (p, color, uv;
   no normal, and a uv that is a real attribute rather than the hull's own x and y), with the Heidler
   return-stroke current (physicsTsl makeHeidlerSpriteTsl) as the graph that suits it. physicsTsl
   heidlerSpriteShell is the fleets' own shipped sprite vertex stage plus the {{DISPLACE}} hook and its local,
   and the gate holds it to that text in both languages. The rename of three's locals is now the SHELL's map
   (tslSource DEFAULT_LOCALS, `locals` per language), so a graph that displaces along the normal into a layout
   that has none is refused BY NAME instead of renamed into a variable that layout never declares -- as is a
   fragment reading the normal there. tslRace-selfcheck section 5: the Pixel race painted by the generated
   sprite pipeline is a hand-written twin's picture on 36,864 of 36,864 pixels on both backends, 4,018 pixels
   away from the race's own bitmap look, and the pick still names it; orrery-gpu.html?tsl=1 paints it live.
   What the byte claim CANNOT see, measured: two algebraically-equal but not bit-equal rewrites of the twin
   ((i0/eta)*shape/i0 as (i0*shape)/(eta*i0); exp(log(r)*x) as pow(r, x)) moved no byte at all. The picture is
   eight bits a channel and a difference under 1/255 is below it.
   v4326 -- A TEXTURE CROSSES. Until now a shell transplant refused every texture, so the fleets' own bitmap sprite
   was the one race a graph could not paint. The SHELL now lists the textures its prefix binds (physicsTsl
   spriteAtlasShell: viewProj alone and the atlas at binding 1, exactly the fleets' sprite pipeline), the transplant
   keeps the graph's own label for them, and a texture the shell does not bind -- or a sampled one where it declares
   no sampler -- refuses by name. makeSpriteAtlasTsl is render/fleets.mjs SPRITE_WGSL written as nodes, so the twin
   is SHIPPED CODE: tslRace-selfcheck section 6 draws the fleets' own Pixel race beside the generated one and they
   agree on 36,864 of 36,864 pixels on both backends, transparent texels discarded the same, with the fleet's own
   bind hook feeding the generated shader unchanged. orrery-gpu.html?tsl=1 now paints three races from graphs.
   The finding: three's TextureNode constructor runs setUpdateMatrix(uvNode === null), so a texture node built
   WITHOUT a uv turns the uv-transform matrix on and every clone (textureLoad makes one) keeps it -- the obvious
   spelling emits an unlabelled mat3 into the fragment and is refused. Give the uv at construction and the fragment
   carries no uniform at all. Also measured and not fixed: three fetches the texel twice around a Discard that
   reads it.
   v4327 -- AND A SAMPLER. A shell may declare one (spriteLookShell's `sampler`, spriteSampledShell: viewProj, the
   atlas at 1, the sampler at 2), and the transplant rewrites three's own `<tex>_sampler` to it, so a FILTERED
   sample crosses where only a texel fetch could. Section 7: on both backends the filtered sprite drawn by the
   generated pipeline is a hand-written twin's picture on 36,864 of 36,864 pixels, and the SAME pipeline draws a
   different picture (898 pixels) when a point-sampled texture is bound to it. What decides which three emits is
   the TEXTURE, not the graph -- Linear gives textureSample, Nearest gives textureLoad and leaves the sampler
   unused, so makeSpriteSampledTsl refuses a Nearest texture. And the refusal is WGSL-side only: GLSL's sampler2D
   carries its own sampler, so a sampled graph into a sampler-less shell just works on WebGL2. orrery-gpu.html
   ?tsl=1&soft=1 draws the Glyph race sampled instead of fetched.
   v4328 -- THE INK LAYOUT, the last one the fleets have. physicsTsl inkLookShell is the Krbn race's strokes on a
   LINE-LIST: the flat layout (p, colour), no normal and no uv at all, and the first shell whose topology is not
   the default -- the descriptor carries "line-list" out to the device. makeInkTsl reads the vertex colour and
   nothing else, three emits exactly one varying for it, and a graph reaching for a uv is refused by name.
   Section 8: the Krbn strokes painted by the generated pipeline are a hand-written twin's picture on 36,864 of
   36,864 pixels on both backends. Two limits found and written down: a mistake in the SHELL moves both halves of
   a twin comparison, so the byte claim is blind to a lost topology and only the named assertion catches it; and
   the two backends do not rasterise a line the same (467 pixels washed under WebGPU, 415 under WebGL2), so a
   line-list claim is per-backend by nature. orrery-gpu.html?tsl=1 now paints FOUR races from graphs.
   With this the three fleet layouts -- lit, sprite, flat -- have all been crossed into.
   v4329 -- HOUSEKEEPING, WITH ITS PRICE MEASURED. The looks and shells moved out of render/physicsTsl.mjs (named
   for physics, holding three shells and five looks by v4328) into render/fleetTsl.mjs: physicsTsl keeps
   lyapunovNodes, heidlerNodes and the two KEYS; fleetTsl keeps the shells, the looks and the hand-written twins.
   tslPhysics-selfcheck now asks the question that keeps them apart -- does the physics module contain shader
   text at all -- so the split is checked rather than announced. v4328's note priced this at "four numbers and a
   list entry" in the backend-parity census; it cost ONE LIST ENTRY AND NO NUMBERS, because physicsTsl carried
   its markers only through the shells and left the census in the same move fleetTsl entered it. And server.html
   gains a Render TSL drawer: the four pages, plus the query variants (?tsl=1, its sampled twin, ?webgl=1) written
   out by hand because the drawer mover files pages and not URLs -- tslRace-selfcheck section 3 checks they are
   there, since a mode of a page no link reaches is reachable only by someone who already knows it. v4323: linear-filtered sampling crosses too -- three's sampler becomes
   the device's, and the generated linear badTv is the hand-written linear pass on 4,096 of 4,096 pixels on
   both backends (tslSource-selfcheck section 3); and orrery-gpu.html?tsl=1 paints the Chaos race with a
   graph three compiles at load, on whichever backend the page has (transplantIntoShell takes one language).
   The speed of the generated code is what tsl-rig.html measures on a rig.

6. **TSL COMPUTE.** BUILT at v4331, and it is the one place this tree's pair contract does not apply: WebGL2 has no
   compute stage, so gfx/device.js refuses a compute pipeline without WGSL by name and there is no GLSL half to be
   held to. render/tslSource.mjs computeShell() declares what a device compute module needs -- storage buffers bound
   BY NAME, one uniform struct -- and transplantCompute() carries three's emitted compute shader into it: the
   generated NodeBuffer_NNN becomes the shell's buffer, objectStruct becomes its uniform struct, and `enable
   subgroups;` with its @builtin(subgroup_size) is DROPPED, because three's renderer asks the adapter for that
   feature and the device never did (left in, the device refuses the module: sabotage S, 6 red).
   render/physicsTsl.mjs makeLyapunovComputeTsl sweeps r across a storage buffer; render/lyapunovWgsl.mjs
   lyapunovComputeWgsl is the hand-written twin, the module's own lyapunov() in the same shell.
   THE CLAIM IS NOT "TO THE BYTE", AND WHY IS THE FINDING: on every element whose exponent is negative the two passes
   are bit-identical (22 of 22, at both sample counts), and they part on the same five chaotic elements at both counts
   -- by 2.5e-5 after 12 iterations and 4.5e-2 after 448. Two modules compiled separately may round a multiply-add
   differently, and on a chaotic orbit that ulp is the whole difference by the end; the growth rate is the exponent
   the pass computes. Bits are asserted where bits are meaningful and the divergence is measured where they are not.
   v4336 -- AND ONE THAT READS. Every real compute pass in render/gpuDriven.mjs reads buffers as well as writing
   them. computeShell's storage entries take an `access` ("read" or the default "read_write"), because three
   declares every buffer it touches as read_write whether the graph writes to it or not -- the SHELL is where
   read-only is stated -- and transplantCompute matches a generated buffer to a shell entry BY ROLE, which one the
   body assigns to, rather than by the order three emitted them in. physicsTsl makeChaosMaskTsl is the second pass:
   it reads the sweep's buffer and writes 1 where the exponent is positive. Section 5: two dispatches on one frame's
   encoder, the second bound to the first's buffer, and the mask is the sign of the sweep's own output on all 64
   elements; every element it calls periodic above r = 3.8 lies inside [1 + sqrt(8), 3.857], the period-3 window
   whose edge this tree owns exactly. The role mapping's sabotage went 0 RED on its first run and that was the
   finding: the shell had listed the written buffer first, which is the order three emits, so position and role
   agreed and the check proved nothing. The shell now declares its input first, as the cull pass does.
   v4337 -- AND AN ATOMIC ONE. A shell entry may say `atomic: true`, declaring its elements atomic<T>, and the pair
   must agree: three writes atomicAdd(&buf.value[i], ...) and WGSL takes that pointer only into an atomic<T>, so a
   shell that forgot is refused by name rather than by the device's compiler. The counter is also a buffer the pass
   WRITES while nothing assigns to it, so the role detector looks for the atomic call as well. physicsTsl
   makeChaosTallyTsl counts the chaotic elements of the sweep into one number. Section 6, at 1024 elements over
   sixteen workgroups: the tally is exactly the number of positive elements in the buffer it read, every run.
   AND THE ATOMIC IS MEASURED RATHER THAN ASSUMED -- the same module with the atomic taken out by hand compiles,
   runs, and counts 156 to 171 against a truth of 670, a different wrong number every time: 74% to 77% of the
   increments lost to contention. At 64 elements there is one workgroup and nothing to lose, which is why the
   section runs at 1024. This is the cull pass's own shape; what is still missing before a real gpuDriven pass
   could be regenerated is an INDIRECT dispatch (the count a pass runs at living in a buffer).
   v4338 -- WORKGROUP-SHARED MEMORY. computeShell takes `shared` ([{ name, element, length }] -> var<workgroup>
   name: array<element, length>), because three declares its own WorkgroupArray_NNN in a "// locals" section the
   transplant used to drop -- which left the body naming an array nothing declared, and the device said so.
   physicsTsl makeChaosReduceTsl is the reduction: each lane writes its 1 or 0 into the shared array, the group
   waits at a barrier, lane 0 sums 64 slots and contributes ONE atomic increment. Section 7: the same 670 as the
   per-lane tally with sixteen atomic operations instead of 670, three's generated name replaced by the shell's,
   and render/wgslSpec.mjs's own parseWorkgroupVars reading array<u32, 64> = 256 bytes out of a shader nobody
   wrote -- the first generated module that scanner has had to read. THE BARRIER IS MEASURED, NOT CITED: removed,
   the same module reads 40 against 670 every run, because lane 0 sums before the other 63 have written.
   v4339 -- AN INDIRECT DISPATCH, and it took a gfx/device.js change first. The device has always had
   drawIndexedIndirect, so the GPU could decide how many INSTANCES to draw; the number of INVOCATIONS was still a
   JavaScript number. pass.dispatchIndirect(pipeline, buffer, byteOffset) reads three u32 when the command runs;
   WebGL2 refuses it by name as it refuses every compute call. physicsTsl makeDispatchSizerTsl is one lane that
   reads a count and writes those three numbers. Section 8: the sweep writes 1024 exponents, the tally counts 670
   atomically, the sizer divides by the workgroup size, and the mark pass runs 704 invocations -- 11 x 64 -- with
   nothing read back to the CPU in between; seed the same buffer with 64 or 200 and the same encoded command runs
   64 or 256. And the SHELL owns the declarations: three declares the tally atomic<u32> in the sizer's module too,
   because the flag is on the node rather than the use, and the shell ships it as a plain read-only u32.
   With this every shape render/gpuDriven.mjs's cull pass has -- reads, writes, an atomic, workgroup memory, an
   indirect dispatch -- is transplantable. What no round has done yet is write the CULL ITSELF as a graph and hold
   the fleet's own picture to it, which is what all eight sections are for.

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
