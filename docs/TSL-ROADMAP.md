# TSL and SweK -- the roadmap (written at v4319; step 4 built at v4320, step 5 at v4321, a race painted and the rig page at v4322, linear sampling and the page's generated race at v4323, the vertex stage at v4324, a second shell and a second race at v4325, a texture across the shell boundary at v4326, a sampler at v4327, the ink layout at v4328, the module split and the front-door drawer at v4329, the compute stage at v4331, a pass that reads a buffer at v4336, an atomic one at v4337, workgroup-shared memory at v4338, an indirect dispatch at v4339/v4351, the cull's own decision at v4361, the struct element and the whole pass at v4363, the fleets variant and a uniform frustum at v4364, a SHIPPING fleet kernel held to bit for bit at v4370)

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
   indirect dispatch -- is transplantable.
   v4361 -- AND THE CULL ITSELF. physicsTsl makeCullLodTsl is render/gpuDriven.mjs cullLod() as nodes: six
   frustum-plane tests, a distance to the eye, an angular-size metric and a threshold ladder returning a LOD or -1.
   Transplanted into a device compute module it decides what the SHIPPED pass decides on all 768 instances of the
   probe's own scene -- same LOD on every one, metric identical to the last bit, 0 and not a tolerance -- with 216
   rejected by the frustum and the survivors spread 96/246/210 across three LODs, so the agreement is not two
   constants matching. Two deliberate differences live in the shell: the planes arrive in a storage buffer rather
   than struct Cull's `array<vec4<f32>, 6>` field, and the plane loop sets a flag over all six rather than returning
   on the first rejection. STILL HAND-WRITTEN: the bookkeeping half -- an atomicAdd into array<Cmd>, a struct of
   five fields with one atomic, and three vec4s per survivor at a region-major offset. computeShell has no struct
   element, so that is the next capability. Also unbuilt: the occlusion and fleet variants, where hizOccluded reads
   a depth pyramid through a pointer argument no graph here has emitted.
   v4363 -- AND THE STRUCT ELEMENT, WHICH IS THE WHOLE PASS. computeShell's storage entries take
   `struct: { name, fields: [{ name, type, atomic }] }` instead of an element, the shell declares that struct, and the
   atomic lives on a FIELD -- array<Cmd> is not an atomic buffer; one of Cmd's five members is. physicsTsl
   makeCullPassTsl is render/gpuDriven.mjs cullLodWgsl() entire: the count guard, the day-t clock gate, the frustum,
   the ladder, an atomicAdd into the region's indirect draw command and three vec4s per survivor at a region-major
   offset. Held to the SHIPPED text on one scene: the same per-region counts (96/246/210 of 768) with every one of the
   552 survivor records identical to the float, and again with the clock gate on (58/135/122, 237 bodies not yet
   vendored on day 3). The four non-atomic Cmd fields the CPU seeded come back untouched, which is where a wrong
   layout would have shown -- the atomicAdd landing on indexCount instead. WHAT IS NOT CLAIMED, because it is not
   true: the SLOT a survivor lands in. An atomicAdd hands slots out in arrival order, so the claim is the per-region
   counts and the sorted set of records, and the gate says so rather than sorting quietly.
   *** AND THE BUFFER MAPPING CHANGED, BECAUSE THIS PASS BROKE THE OLD ONE. *** three declares its storage buffers in
   the order the BODY FIRST USES them, not the order the graph created them. This pass reads extras before planes, so
   v4336's role-and-order mapping crossed the frustum buffer with the per-instance one -- two array<vec4<f32>> with
   nothing else to tell them apart. A .label()ed TSL storage node is emitted under that name, so the graph names its
   buffers and the transplant maps by name, with the roles still checked by name rather than inferred from position.
   Measured, not argued: the same module with its labels stripped draws NOTHING, 0/0/0 against 96/246/210.
   STILL HAND-WRITTEN: the occlusion and fleet variants (hizOccluded's ptr<storage, array<f32>, read> argument, and a
   two-dimensional region index), and struct Cull's `array<vec4<f32>, 6>` -- a fixed-size array in a UNIFORM struct,
   which is why the six planes arrive in a storage buffer.
   v4364 -- THE FLEETS VARIANT, AND THE FRUSTUM IN A UNIFORM. cullLodWgsl({ fleets: true }) is the configuration the
   orrery actually runs: a per-instance fleet index in its own array<u32>, clamped to the fleet count the uniforms
   carry, and a region that is fleet * lodCount + lod rather than lod alone. Generated and held to the shipped text
   over two fleets and three LODs: the same instance count in every one of the six regions (38/103/81/58/143/129) and
   all 552 records identical to the float. The 110 instances asking for fleet 7 against a count of 2 land in fleet 1
   in both passes -- and that is visible ONLY in the records: with the clamp dropped, the six counts still summed to
   552, because the device folded the out-of-range increments into the last region. The same lesson landed twice in
   one round: the first build agreed on all six counts and differed on 330 of 552 records, because the graph wrote a
   constant 0 where the shipped pass writes the clamped fleet.
   computeShell also gained `uniformArrays` -- a uniform whose ELEMENT is a fixed-size array, the type struct Cull
   gives its planes. three emits a TSL uniformArray as its own uniform BINDING rather than as a member of the scalar
   struct, so struct Cull is still two bindings for a generated pass and that is a limit, not a detail. The BYTES are
   the same forty floats: packCullUniforms lays the planes out first and the four vec4s after, so the gate slices one
   packing to drive both passes rather than packing a second copy. The graph is unmoved by where the frustum lives --
   the two transplants' bodies are the same text, because planes.element(i) is one node either way.
   AND A CORRECTION TO WHAT THIS FILE SAID TWICE: { occlusion: true } is not blocked by hizOccluded's pointer
   argument. That ptr<storage, array<f32>, read> exists because the HAND-WRITTEN side factored the test into a
   function; a graph inlines it and reads the buffer directly. What it does need is a mat4x4 uniform, two while-loops
   whose bounds are computed, and a nested tile loop -- none of which any graph here has emitted. It is the one
   variant left.
   v4370 -- AND A KERNEL THAT ALREADY SHIPS, HELD TO BIT FOR BIT. Everything above is graded against a twin written
   in this tree for the arc, or against a picture whose 8 bits a channel hide a difference under 1/255.
   tools/roundhouse/hmcGpu.mjs's WGSL_HMC is neither: it is the batch leapfrog the swek-hmc-bench fleet job runs on
   real hardware, it predates this arc by a thousand versions, and it carries its own f32 CPU mirror (Math.fround
   after every op) and the FLOOR that mirror measured. physicsTsl makeHmcLeapfrogTsl is that kernel as nodes -- one
   invocation per chain, L kick-drift-kick steps over a Gaussian potential, specified operations only (+ - * /), so
   there is no transcendental for two compilers to round differently. Measured on WebGPU against the shipped text:
   BIT-IDENTICAL on all 256 endpoint values, with both passes inside 1.371e-6 of the mirror against a 2.5e-5 floor.
   *** AND THE FIRST STATEMENT OF WHAT THAT IS WORTH WAS WRONG. *** The module's header said writing the half-kick
   as 0.5*(eps*g) rather than (0.5*eps)*g would be algebraically identical and not bit-identical. It is bit-identical
   on every value: 0.5 is a power of two, so that multiply is exact. The rule holds; the example did not. A
   re-association that IS observable is pinned beside it -- the gradient distributed, i00*qx - i00*mu0 for
   i00*(qx - mu0) -- which moves 215 of 256 endpoints by at most 1.192e-6. That is 21x INSIDE the floor and 42x
   inside the device tolerance, so every tolerance in this tree passes it and only the bit claim does not.
   NOT CLAIMED: the kernel's full signature. L and n are uniforms in WGSL_HMC and baked constants in the graph,
   because a TSL Loop wants a JavaScript bound (lyapunovNodes set that precedent at v4321). A graph whose step count
   comes from a buffer is the next thing here, and it is unbuilt.
   *** CLAIMED AT v4471 (task 30): a TSL Loop takes its bound from a NODE. *** three's LoopNode builds `end` when
   it is a node, so the bound may be a uniform or a storage buffer's element, and the sentence above was an
   assumption nobody had measured. render/physicsTsl.mjs makeLogisticStepperTsl steps the logistic map `bound`
   times with the bound read from a vec4 uniform in one variant and from a storage buffer's element 0 in the other;
   tools/ship/tslLoopBound-selfcheck.mjs emits each variant ONCE, transplants it, and runs the one module at 1, 2,
   3, 50 and 200 steps with only the buffer changed -- 1,024 orbits bit-identical to the f32 twin at every count in
   both variants, and the emitted loop reads `i < i32( u.bound.x )` and `i < i32( steps.value[ 0u ] )` from its
   text, not a literal. The two passes are in the corpus from tools/ship/tsl-emitted-loop.json. What is still not
   claimed: a bound that changes mid-dispatch and a bound per element.

7. **SLUG TEXT ON THE WebGPU BACKEND -- planned at v4457 after a review of an outside plan; item 1 built the same round.** The plan reviewed
   proposed a fresh Slug: opentype.js in a Web Worker, a TSL fragment loop, a JSON font registry, a ring buffer,
   bidi shaping, an MSDF fallback for CJK, cylindrical text, bloom. Graded against this tree it rebuilds text/
   (slugFont.js, slugAtlas.js, slugShader.js, slugEval.js, slugText.js and an 837-line gate, shipping since v3823
   in ev/esShipLabels.js) and builds it worse: its winding loop ignores the middle control point, so every curve
   is a chord; its band packer returns offset 0 for every band; its verification harness returns 1.0
   unconditionally; and its TSL uses APIs the vendored 0.178 does not have (toAttribute, mutable, UniformNode)
   while pinning three ^0.170 from unpkg. What it got RIGHT is the direction, and the tree already says so:
   backendParity-selfcheck asserts text/slugShader.js is GLSL-only, and ui/orreryPost.mjs kept canvas 2D because
   no WGSL glyph renderer exists. So the arc is, in order, with the sidebar's task numbers:
     1. text/slugShaderWgsl.js -- the WGSL twin of the Slug shader, a SHARED core (root code, the two solvers,
        CalcBandLoc, CalcCoverage, SlugRender with emsPerPixel as a parameter) wrapped twice: the fragment shader
        over textureLoad and fwidth, and a compute probe over storage buffers holding the SAME packed atlas bytes.
        Graded on the headless Dawn harness against text/slugEval.js sample by sample, and against the
        flattened-segment winding number, which is the key slug-selfcheck already trusts. BUILT at v4457: the
        twin is a second file (text/slugShaderWgsl.js) rather than a second language in slugShader.js, whose
        value is that it diffs line for line against the HLSL, so the census moves wgslOnly 47 to 48 and `both`
        stays 13. MEASURED on the headless Dawn device (tools/ship/slugWgsl-selfcheck.mjs, 5.4 s): in the sharp
        limit the GPU equals slugEval AND the winding number on 22,045 of 22,045 samples of the constructed font
        and 61,092 of 61,092 of the Plex label alphabet, exactly; at 28 and 12 px/em the worst |gpu - cpu| is
        3.1e-6 against an a-priori 1/512 (half an 8-bit step), with zero samples rounding to a different byte;
        the wrong-width probe is wrong on 9,477 of 27,957 samples of a width-128 atlas whose lists wrap; three
        transliteration plants (a dropped complement in the root code, the a == 0 branch removed, the vertical
        early-out on the wrong axis) go red at 12,148 / 2,205 / 1,462 of 22,045, each asserted to have applied
        first. SlugDilate moves a corner HALF A PIXEL PER AXIS to 3.8e-6 px under an orthographic matrix, and
        under perspective its screen shift matches the closed form sqrt(2)*sqrt(uv)/(2*(sqrt(uv)+(sqrt(2)-1)*s*t))
        to 3.6e-6 px -- which is the finding: buildVertices passes the normal as (+-1, +-1), unnormalised, and
        the reference's exact half-pixel property holds for a UNIT normal, so in perspective the per-axis push
        is off by up to 0.07 px at the test's depth. Harmless at these sizes and now written down. NOT CLAIMED:
        a frame. Nothing binds the textures or runs the vertex stream; that is step 3, and it is blocked on step 2.
        *** THE FIRST DRAFT OF THE GATE HAD AN UNREACHABLE PLANT *** (six small glyphs never leave row one, so
        the wrong-width probe went 0 of 10,016 wrong); slug-selfcheck's own plant 3 says why and the section
        was rebuilt over 66 Plex glyphs at width 128, where 432 of 965 band headers point past their row.
        *** v4464 (task 20): THE CROSS-BACKEND CORPUS NOW SEES text/. *** tools/ship/wgslCorpus.mjs's census walked
        render, physics/render and shaders, so the twin's three runnable modules were nobody's cross-backend claim
        for seven rounds; text/ is a root now, the roots are asserted by what they find, the render module compiles
        on both backends, the coverage probe is the corpus's first entry with read-only storage inputs (2,313 of
        2,313 identical through five bindings, on a width-16 atlas whose lists wrap) and the dilation probe agrees
        32 of 32. The same round answered the census line that had stood red since v4418: pathTracerGpu.traceWgsl
        and rtPipeline.pipelineWgsl fit the one-buffer signature and run on both, 576 of 576 identical each, the
        pipeline entry carrying a mirror hit shader the CPU oracle cannot express.
     2. Blend state on gfx/device.js pipelines. Slug returns colour premultiplied by coverage and needs
        (ONE, ONE_MINUS_SRC_ALPHA); the device carried topology, cull and frontFace and no blend at all, and its
        texture path uploads rgba8unorm only, where Slug needs rgba16float and rg16uint. BUILT at v4458: `blend`
        is a word on the descriptor (none, premultiplied, alpha, additive; BLEND_MODES in gfx/device.js), set at
        use() on WebGL2 beside cull and on the colour target on WebGPU, refused by name when unknown, recorded by
        the null backend, and carried by render/gpuDriven.mjs renderPipelineDesc the way topology is. MEASURED
        by tools/ship/deviceBlend-selfcheck.mjs on both real backends: each mode within 1 byte of the blend
        equation in f64, the two backends identical (pair worst 0 on all four), the untouched half exact. Three
        sabotages red at 6 / 8 / 4 checks; the third (a wrong factor in the table) left both backends agreeing
        with each other and was caught only by the equation. STILL MISSING before text can draw: depthWrite on
        the WebGL2 backend (the WebGPU pipeline honours it; the WebGL2 one has no gl.depthMask) and the two
        texture formats, both now in item 3's scope. BUILT at v4459, as item 3's first half: device.texture()
        takes `format` (rgba8unorm, rgba16float, rg16uint; TEXTURE_FORMATS), nearest forced on the integer
        format because a LINEAR filter makes it incomplete on WebGL2 and it samples black; a `source` or a render
        target with a 16-bit format is refused by name; the WebGL2 pipeline honours depthWrite (gl.depthMask) and
        depthCompare (the eight WebGPU words, mapped) at use(). MEASURED by tools/ship/deviceFormats-selfcheck.mjs
        through render/texelProbe.mjs, a shipping pair that writes a texel's BITS as bytes: 2,048 half-float bytes
        and 1,024 uint bytes exact on each backend, 0 and 65535 included, update() exact, depthWrite false letting
        the far quad through on both, and the two backends byte-identical once WebGL2's rows are turned over --
        the fetch at gl_FragCoord.y counts from the bottom, WebGPU's position.y from the top, 722 bytes differ
        without the turn, and the mapping is applied by name rather than hidden in a tolerance. Four sabotages
        red at 5 / 2 / 2 / 4. Mipmaps were split out (task 21): WebGPU has no generateMipmap, so that half is a
        blit pipeline of its own, and Slug does not need it. BUILT at v4464: `mipmaps: true` on device.texture() is
        one word for both -- gl.generateMipmap after every upload on WebGL2 with a MIPMAP min filter, and on WebGPU
        every level allocated and filled by a blit pipeline the backend owns (a full-screen triangle sampling level
        i-1 into level i with a linear clamped sampler, one pass per level, one submit), the draw sampler filtering
        between levels only for a chained texture. rg16uint and render targets are refused by name. MEASURED by
        tools/ship/deviceMipmaps-selfcheck.mjs through two new probe pairs in render/texelProbe.mjs: every level of
        a 32x32 rgba8unorm chain and levels 1 and 3 of an rgba16float chain within a byte of a CPU box filter on
        both backends (worst difference 0 across the chain on each), the sampled draw at a quarter size landing on
        level 2 where an unchained control aliases (mean stripe error 64 of 64), update() rebuilding the chain,
        and the two backends within a byte of each other on every level once WebGL2's rows are turned over. NOT
        CLAIMED: odd-sized levels, a chain from a canvas source, trilinear blending between levels.
     3. A device-path text batch, drawn on both backends and diffed, with the orrery's four fillText calls or the
        ship labels' overlay canvas as the first consumer. BUILT at v4460: render/slugDevice.mjs (SlugFontDevice,
        SlugDeviceBatch) packs the atlas into the device's rgba16float and rg16uint textures, builds one pipeline
        from the WGSL twin and the GLSL port -- the GLSL's uniform names rewritten to the struct's, the rewrite
        COUNTED (18 occurrences; the first expectation miscounted row 2 and the check refused it on its first run)
        -- and draws with premultiplied blend, no depth write, compare always. slug-device.html is the page.
        MEASURED by tools/ship/slugDevice-selfcheck.mjs on both real backends: 23,040 of 23,040 pixels EXACT against
        text/slugEval.js, the device's WebGL2 picture equal to the shipped raw-WebGL2 SlugTextBatch byte for byte,
        the two backends identical. *** AND THE KEY HAD TO LEARN WHAT A PIXEL CENTRE IS. *** Fed the exact centre,
        482 pixels missed by more than 2 and one by 43 -- while all three GPU pictures agreed. A variant of the
        pipeline writing the f32 bits of the fragment's texcoord and fwidth showed the rasteriser SNAPPING THE
        DILATED CORNERS TO 1/16 PX and interpolating each triangle from the snapped positions (texcoord off the
        centre by 0.028 px, fwidth wandering by half a percent), and Slug's estimator is locally steep enough
        (0.08 of 255 per 1e-6 em at the worst pixel) to turn that into 43. The gate now FITS the sub-pixel
        precision from the captured texcoords over 2..8 bits and no-snap: four bits here, model within 8.8e-8 em,
        and a rig with eight bits will print eight. FOUND ON THE WAY, filed as task 22: a WGSL fragment that
        declares a texture it does not read makes layout "auto" drop the binding, the device still binds it, and
        the frame is BLANK with no error -- four all-zero capture frames beside four good WebGL2 ones. FIXED at v4461:
        every declared binding carries `used` (the auto layout's own question, answered from the text), unused ones
        stay out of the bind group so the frame draws, and createBindGroup runs inside a validation error scope
        whose message a read frame rejects with and the next use() refuses with -- tools/ship/deviceUnused-selfcheck.mjs
        holds both on both backends. THE
        CONSUMER is chosen (ev/esShipLabels.js) and not wired (task 23): a WebGPU canvas pass loses the device on
        this box, so the switch can only be verified once task 19's presented-frame gate runs on the rig. THAT
        GATE EXISTS at v4462: render/devicePresent.mjs draws a known pattern on a presented canvas and reads it
        back three ways (device readback, offscreen frame, the compositor's drawImage copy); device-present.html
        runs it live; tools/ship/devicePresent-selfcheck.mjs holds WebGL2 to 0 of 2,048 differing on all three
        and names WebGPU's outcome here (device lost, the Level 11 message) as rig-pending, not red. The rig
        line is in the gate's output; the answer is Galaxina's. AND THE CONSUMER IS WIRED at v4463, safely
        before that answer: ev/esShipLabels.js draws through gfx/device.js by default (WebGPU where the page has
        it), with the v3831 raw batch as an AUTOMATIC fallback -- a lost WebGPU device rebuilds the overlay on a
        fresh canvas and the handle says so in `path` and `reason`. tools/ship/esShipLabelsDevice-selfcheck.mjs
        watches that happen on this box (device:webgpu, lost on the first presented frame, raw afterwards with
        the labels drawn), holds the device's WebGL2 labels to the raw path's picture (106 of 921,600 pixels
        differ, the raw canvas's MSAA on quad edges), and prints the rig line: on Galaxina the default path
        must read device:webgpu after a frame, with labels visible.
     4. A TSL Slug material, MEASURED first and scoped to the 0.178 pages: render/tslSource's transplant refuses
        more than one varying and Slug's vertex stage carries five, so the device shell is not its route.
     5. GPOS PairPos kerning in slugFont.js BEFORE any font is vendored: every font the plan names (Inter, Orbitron,
        Cinzel, JetBrains Mono, Source Sans 3, Cormorant, Lora, Merriweather, Fira) kerns through GPOS only, and
        layoutText reports kerningSource "none" for them today.
     6. Vendor OFL fonts under vendor/fonts/<family>/, static glyf instances only (the parser refuses CFF and
        ttcf by name and reads no fvar), one OFL copy per family with its Reserved Font Name, and one
        vendoredLicences.mjs entry each, because that gate requires disk and list to agree exactly.
     7. Pre-pack atlases at ship time with a hash gate, after MEASURING parse+pack time; the worker is not worth
        its message-passing unless that number is over a frame.
     8. Word wrap (maxWidth) in layoutText, pure and gated headless -- the one layout feature genuinely missing.
     9. A slug-rig.html measuring fragment cost by size, angle and band count on Keith's boxes, including one
        dense glyf CJK face, before any band-count tuning.
    10. Curved text by tessellated strips with per-strip Jacobians, or a planar target resampled -- never by
        bending vertices, because SlugDilate's half-pixel push needs the Jacobian constant over the quad.
    11. Bidi shaping and the CJK fallback recorded as wont in tools/ship/todo.mjs with reasons (two-letter
        presentation-form shaping and a whole-string reverse is not UAX #9; canvas fillText is not an MSDF).
    12. Measure SlugTextBatch's per-frame bufferData before any ring buffer; the plan's ring resets to 0 on
        overflow with no fence, so it overwrites text still being drawn.
    13. Flip the backendParity assertion and write the measured numbers here when step 1 lands.

8. **THE PHYSICS LAB ON THE DEVICE -- planned at v4464 after a survey of the lab's GPU paths.** The lab has one
   strong convention on the CPU side (every instrument an exact key, a gate and a registry row) and none on the GPU
   side: five physics families reach WebGPU five different ways and ZERO files under physics/ import gfx/device.js.
   The survey's gaps, in the order they close, with the sidebar's task numbers:
     1. (task 24) The XPBD cloth GPU path, reachable. physics/xpbd/xpbd-distance.wgsl, cloth-collision.wgsl and the
        two transform-feedback .vert files described a closed GPU loop since v2661 and nothing loaded them. BUILT at
        v4465: physics/xpbd/xpbdWgsl.mjs -- predict, one solve dispatch per color per iteration, finalize -- as
        compute kernels over one Step uniform and vec4 particle records, run through gfx/device.js by
        makeClothDevice() (the shipped f64 twin on any other backend, `path` saying which), and a flat mirror with one
        rounding knob pinned to clothLoop byte for byte at f64. MEASURED by tools/ship/xpbdDevice-selfcheck.mjs: each
        kernel returns the f32 mirror's bytes on the headless Dawn device (100 of 100 words, three kernels, the solve
        in place through the harnesses' new outInit); in the browser through the device, 40 frames on WebGPU are
        bit-identical to the f32 mirror on all 75 coordinates and within 6.0e-6 of the f64 solver against an
        a-priori floor of 1e-4; a second run and a within-color shuffle return the same bits; with radius 0.4 the
        path finds 1,920 pairs over 40 frames and stays deterministic. Two things the old files got wrong, found by
        writing the mirror: cloth-collision.wgsl did not accumulate lambda where clothFrame does, and the predict and
        finalize passes were WebGL2 transform-feedback shaders no single context could run beside the WebGPU solve.
        NOT CLAIMED: a GPU pair finder (contact reads the prediction back once per frame, because the pairs must be
        SORTED before anything downstream sees them), and physics-lab.html, which still draws the CPU solver.
     2. (task 25) hmcGpu.mjs and mpm/gpuKernel.mjs on the headless Dawn device; both gates said there is no GPU in
        the sandbox, which had been false since v4292. BUILT at v4466. HMC: the kernel's step text is written once
        and rendered in two binding layouts (the shipped one, byte-identical to before, and the harness's), the
        seeded 4,096-chain batch runs on Dawn and the CPU adjudicator passes it at 3.1e-6 against the earned 5e-5;
        the corpus holds the two backends to it on 16,384 floats. MPM: the four stages run on the browser's WebGPU
        through gfx/device.js (physics/mpm/mpmDevice.mjs) with the atomics contended for real, AND THE INTERPRETER'S
        f64 HAD BEEN HIDING THE RETURN MAP -- free fall 1.55e-4 relative off the graded loop, because F = U Sc V was
        rebuilt through the rasteriser's cos (4.5e-5 off at pi/4) and every resting particle dilated by 1.000126 a
        step. svd2 is trig-free now (stable half-angles, + - * / sqrt) and skips the round trip when nothing was
        clamped: 2.9e-8 / 7.4e-8 / 7.4e-8 relative in the three scenes, the free-fall key at 2.9e-7 with drift
        exactly zero, two contended runs bit-identical. gfx/device.js answers a binding's `used` per entry point,
        which is what a multi-entry module's auto layouts need and what mpm-gpu-check.html had wrong as written.
     3. (task 26) physics/ GPU kernels built through device.compute() instead of raw pipelines. BUILT at v4467:
        render/computeRun.mjs is the one way -- a kernel's buffers bound by the names its WGSL declares, one
        dispatch in a device frame, readback through the device, unknown and missing names refused by name -- and
        corpusSpec() maps the harnesses' one-buffer signature onto it, so tools/ship/deviceCompute-selfcheck.mjs
        runs every runnable corpus entry (18 kernels, 69,517 floats) through the device on the browser's WebGPU
        and holds each to the headless Dawn harness byte for byte: the device is a third path to the same bytes,
        and every kernel that joins the corpus is covered by it for free. hmc-bench.html runs its kernel through
        the runner and mpm-gpu-check.html through physics/mpm/mpmDevice.mjs; neither builds an adapter, a
        pipeline, a bind group or a staging buffer of its own any more. The device carries powerPreference to the
        adapter and the adapter's description on the handle. NOT CLAIMED: the corpus's texture entries (the
        storage-texture path has no device twin), and the pages RUNNING on a rig.
     4. (task 27) The probe convention (packUniforms + probeCpu + keyCpu) on every WebGPU physics module, with a
        census check, instead of three modules of thirty. BUILT at v4468: docs/GPU-KERNEL-CONTRACT.md writes the
        convention down with render/lyapunovWgsl.mjs as the template, and each of the nine physics kernel modules
        exports PROBES -- a manifest of { id, code, pack, cpu, key, tol | rel | graded, device } pointing at what
        the module already had, so nothing was renamed. tools/ship/probeConvention-selfcheck.mjs is the census:
        every runnable physics corpus entry must have a manifest entry and every manifest id must be a corpus id,
        and all thirteen entries run on the headless Dawn device -- nine held to their own stated tolerance (five
        at ZERO, HMC at its earned 5e-5, Heidler 1e-5, Planck 1e-5 relative, the LCG at the f32 neighbour gap),
        four graded by the gate they name (a chaotic map, a silhouette, a tangency, the MPM device path). NOT
        CLAIMED: the keys' values (each module's gate), the browser path (crossBackend and deviceCompute).
     5. (task 28) A gated step-loop helper on the device, so samplers and solvers stop hand-rolling ping-pong buffers.
        BUILT at v4469: render/stepLoop.mjs -- one state, two storage buffers, the kernel's own `src` and `dst`
        names bound alternately, N dispatches in one frame, one readback through the device, and a `perStep`
        uniform that turns each step into its own frame because a buffer written N times before one submit
        shows every step its last value. First consumer physics/chaos/logisticWgsl.mjs, chosen because the map
        is chaotic and every ping-pong mistake becomes an unrelated orbit: MEASURED by
        tools/ship/stepLoop-selfcheck.mjs, 1,024 orbits over 200 steps bit-identical to the f32 twin on the
        browser's WebGPU, odd and even step counts, two runs the same bits, and a schedule touching one step
        matched bit for bit against a control that a last-value-only uniform would have produced. The kernel is
        in the corpus and carries a manifest. NOT CLAIMED: several state buffers or kernels per step (the cloth
        loop keeps its own runner), a staging ring per step (the flowfield's shape), the brain's Deno device.
     6. (task 29) The brain's kernels exported as text and in the corpus; brain/gpu.js accepting a software adapter
        under a flag so the shipped kernels can be graded where every other GPU gate runs. BUILT at v4470:
        brain/mlp.js renders one body in two binding layouts -- the brain's (uniform first, as BatchedMLP has
        always bound it) and the harnesses' (Y at 0) -- exports both, and carries a probe manifest against
        render/brainTsl.mjs's f32 twin; brain/flowfield.js exports its four-entry module; brain/ is a census
        root; tools/ship/brainTsl-page.js imports the kernel it used to regex out of the module's source; and
        initGPU takes allowSoftware (or SWEK_ALLOW_SOFTWARE_GPU) with the refusal still the default. The
        harnesses take a [x, y, z] workgroup count, which the layer's 2-D dispatch needed. MEASURED by
        tools/ship/brainKernels-selfcheck.mjs: the probe layout on Dawn returns the twin's 128 bytes exactly,
        the shipped layout bound by the brain's names through the device returns the same bytes on the browser's
        WebGPU, the flow-field module compiles, the refusal is exercised both ways on a stubbed adapter. NOT
        CLAIMED: the brain PROCESS (Deno, its own device), the flow-field solver running here (its gate holds the
        solver to its CPU twin), sigmoid layers.
     7. (task 30) TSL compute with a loop bound read from a buffer, so TSL can generate a stepper. BUILT at v4471,
        and step 6's NOT CLAIMED line was an assumption: three's LoopNode builds a node `end`. See step 6.
     8. (task 31) The WGSL census over physics/mpm, tools/roundhouse and brain/, seeing .wgsl files too. BUILT at
        v4472: census() walks the three roots and lists every .wgsl file under its roots as a candidate keyed by
        path; 81 candidates, none unaccounted; the crossBackend gate asserts each root by what it finds and walks
        the whole tree for a .wgsl outside every root. THE FINDING, first run: brain/transport/shaders/scatter.wgsl
        declared `let target`, a WGSL reserved word, and both real backends refused it -- the three-pass transport
        route's scatter had never compiled on any device, and render/wgslSpec.mjs had called it clean since v4207
        because it did not know the reserved list. Fixed (the twin's `slot`), and the validator now carries the list.
        NOT CLAIMED: the roundhouse kernels and the transport passes RUNNING through the corpus (multi-buffer
        layouts; compile-only here, arithmetic graded by their own gates); the transport pipeline end to end on a
        device in this sandbox (brain/transport/pipeline.js takes a raw device and builds its own bind groups).

9. **THE 3D ORRERY -- planned at v4472 after a survey of orrery-gpu.html.** The GPU orrery has drawn the system
   through gfx/device.js with a perspective camera, a tilt slider, GPU-placed orbits, cull and LOD, picking and terrain
   landing since v4299 -- and reads as flat for four specific reasons, none of them a missing renderer: the bodies
   are DISCS in the orbit plane with no normal; every orbit is in ONE plane (axis and period are the only elements);
   the camera is a slider, not an orbit; and the 2D page's moons, flybys and author view are not on the GPU path.
   Six steps, in the tree's idiom (derived not typed, a CPU twin, a gate on both backends), the 2D page the product
   until the last of them:
     1. (task 32) A sphere mesh with normals and a lit pipeline in render/gpuDriven.mjs's LAYOUTS.lit, gated by the
        analytic sphere. BUILT at v4473: render/litSphere.mjs -- sphereMesh (the icosphere with normals), a lit render
        pair in both languages with a POINT light in the uniform (the orrery's is at the origin, where SweK sits) and an
        emissive word in the per-instance extras (the sun is not lit from inside); shadeAt is the fragment stage's
        arithmetic in JavaScript. tools/ship/litSphere-selfcheck.mjs holds every pixel inside the silhouette to the
        shade of the ray's first hit on a sphere the GPU never drew, on WebGPU and WebGL2 (mean 0.30/255, worst 1),
        with the flat pipeline and the emissive word as one-level controls and the silhouette at 1.0000 of a disc's
        coverage. orrery-gpu.html draws sphereMesh(1) far and sphereMesh(3) near through it; the disc ladder's frozen
        pricing still prices the silhouette, and a sphere ladder's own record is item 6's. NOT CLAIMED: specular,
        shadows, a second light.
     2. (task 33) A third orbital element -- inclination and node -- DERIVED from the vendor data the way distance comes
        from arrival date and size from bytes; positionAt and orbitWgsl extended together under the gpuOrbits gate;
        the 2D page's picture unchanged. BUILT at v4474: the tilt is the body's OPACITY (world/orrery.mjs opacityOf:
        the fraction of its bytes in files nobody can read -- wasm, fonts, images -- times a 40-degree ceiling), and
        the node is the body's phase, so at day 0 every body is where the 2D page draws it. Measured over the baked
        tree: three of fifteen tilt (fonts 38.9, box3d 31.7, wasm 25.3 degrees), twelve lie in the plane. positionAt3
        is the classical rotated circle; the kernel takes cos/sin of tilt and node precomputed in f64 and keeps its
        one trig call; the gpuOrbits gate holds the GPU to positionAt3 in three axes (worst 6.1e-5 of the axis) and
        z = 0 exactly for the untilted. positionAt is untouched: the 2D page draws the ecliptic with every orbit
        unrolled into it, which it always did. NOT CLAIMED: eccentricity; the economy's distances, which stay in the
        ecliptic projection (world/gitEconomy.mjs positionOf reads positionAt).
     3. (task 34) An orbit camera: drag to rotate, wheel to dolly, follow a picked body -- pure functions gated headless,
        the tilt slider kept as the initial pitch. BUILT at v4475: render/orbitCamera.mjs -- a frozen state (yaw, pitch,
        distance, target, follow) and dragged / dollied / withPitch / followed / retargeted / eyeOf, orbiting about +z,
        the ecliptic's north; the pitch stops short of the poles because gpuDriven's lookAt collapses to a zero basis
        there (measured: the old camera could reach it at tilt 0). tools/ship/orbitCamera-selfcheck.mjs holds the
        arithmetic: a drag turns by exactly the stated radians, a dolly scales by exactly the factor, the eye stays on
        its sphere through fifty drags, the target projects to (0, 0) through gpuDriven's own matrices, following
        moves the eye rigidly. orrery-gpu.html: drag, wheel, click a body to follow it (retargeted each frame to
        positionAt3), click space to stop; the slider is the initial pitch. NOT CLAIMED: inertia, touch, roll.
     4. (task 35) Importer moons and reached flybys as GPU records through the same cull and ladder, picked by name,
        held to the 2D page's CPU positions.
     5. (task 36) Slug labels on the device path (steps 7.3 and 7.5's modules) for picked and near bodies.
     6. (task 37) Promotion by measurement: the 3D page passes the 2D page's gates plus its own before the panel's
        link points at it; the 2D page stays as the reference twin.

## The count that says when step 4 matters

tools/ship/shaderCensus-selfcheck.mjs has held, since v3274, that a hand-written pair is cheaper than an
IR while few files carry both languages ("if this count climbs toward twenty the arithmetic inverts, and
THAT is when to re-open the three-stage shape: parse, lower, emit per target"). TSL is a three-stage shape
someone else maintains: the graph is the IR, and three's two builders are the emitters. Step 4 is that
argument made concrete, and section 3 of tsl-selfcheck is its first evidence: the emitted pair equals ours.

**The 12 recorded here at v4319 was not a real number, and neither was the 14 the register filed at v4380.**
v4383 re-measured it. The census classified a file by testing its RAW SOURCE for six tokens, two of which --
GLSL's storage qualifiers, spelled a-t-t-r-i-b-u-t-e and v-a-r-y-i-n-g -- are ordinary English words.
render/bloomFused.mjs counted as a shader pair on the sentence "attribute any difference to the SAMPLING".
Four of the fourteen carry no GLSL at all; seventy-two of the hundred and sixty-nine called GLSL-only carry
no shader source of any kind, main.js and brain/brain.js among them; and two real GLSL passes were missing
because three.js prepends their version directive. The census delegates to render/backendParity.mjs
classify() now, which has read this tree's shader languages correctly since v4269.

The honest figures are **10 both, 23 WGSL-only, 99 GLSL-only**, and the gate is green. Three to ten in
eleven hundred rounds is a real climb; the trigger is twenty and it has not fired. So the compiler stays
unbuilt -- and step 4 is the reason that costs nothing: the three-stage shape got re-opened without this
tree maintaining an IR, an emitter or a parser.

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
