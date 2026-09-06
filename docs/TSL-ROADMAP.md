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
   IS THE PIN THE FLEET'S OR THE BUILD BOX'S? -- asked at v4494 (task 17), RIG-PENDING. three-probe.html is the
   instrument: it fetches a named three version's tarball from registry.npmjs.org in the browser (CORS *,
   measured), gunzips it with DecompressionStream, walks the tar (render/threeProbe.mjs untar), rewrites the
   build's two internal imports to blob URLs and imports it beside the vendored 0.178 through the SAME blob path
   (the control), then renders one TSL gradient with each into a render target and reads it back. MEASURED ON
   THIS BOX by tools/ship/threeProbe-selfcheck.mjs (the tarball cached outside the tree, served by the gate's own
   server as ?src=): the control draws on WebGPU and on three's WebGL2 backend; three@0.185.1 draws on the WebGL2
   backend and is REFUSED on WebGPU by the browser, not by three -- "Failed to execute 'createView' on
   'GPUTexture': Failed to read the 'swizzle' property from 'GPUTextureViewDescriptor': The provided value is
   not of type 'GPUTextureComponentSwizzle'" -- v4319's finding reproduced by name and pinned to a WebGPU
   dictionary this Chromium lacks (0.185's GPUTextureViewDescriptor carries `this.swizzle = 'rgba'`, "requires
   the 'texture-component-swizzle' feature; ignored otherwise", and this browser rejects the member instead of
   ignoring it). So the pin is at least the build box's. Whether a rig's Chrome knows the member is the rig's
   answer: open three-probe.html there, save the JSON as tools/ship/three-probe.json, and the gate's section 3
   says which. If a rig draws 0.185 on WebGPU, re-vendoring is a round of its own with the three pages re-graded.
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
   *** v4489 (task 15) -- THE DEVICE ASKS ITS ADAPTER NOW. *** gfx/device.js requestDevice requests the optional
   features the adapter OFFERS (DEFAULT_FEATURES: timestamp-query, subgroups, shader-f16; opts.features replaces
   the list), refuses by name a feature the caller requires and the adapter lacks (opts.requireFeatures) before
   WebGPU would throw at it, and reports what was GRANTED on device.features and device.capabilities -- the frozen
   CAPABILITIES table now says only that a backend may be granted nothing; a page reads the device. A frame with
   { timing: true } writes GPU timestamps around every compute pass and the render pass (a 64-entry query set,
   two indices a pass) and returns gpuMs { compute, render, total, passes }; WebGL2 refuses it by name with the
   CPU-time hint; the null backend records it. computeShell takes `features`, and transplantCompute keeps
   `enable subgroups;` and the builtin when the shell's device has the feature, dropping them otherwise as before.
   MEASURED on the build box: the headless Chromium's SwiftShader offers and grants timestamp-query AND subgroups
   (plus core-features-and-limits unasked, reported as it is); a timed frame of one dispatch and one draw at 32 x
   32 reads compute 0.101 ms and render 6.558 ms, held ABOVE ZERO because the first draft spelled the write
   indices without "Write" and Chromium wrote nothing for the compute pass while refusing the render pass -- a
   timed frame that read zeros and looked like a coarse clock. tools/ship/deviceFeatures-selfcheck.mjs holds the
   default list, the table, the null record, the transplant's keep and drop, and in the browser the granted set
   against the offered one, the timed and timed-read frames, 200 dispatches capped at 31 timed passes, and both
   refusals by name. NOT CLAIMED: a kernel that uses subgroup operations (none in the tree calls one), shader-f16
   (no adapter here offers it), a real GPU's timings (task 9's page).
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
   *** v4483 (task 16) -- THE TRANSPLANT WIDENED: COMPUTED AND FLAT VARYINGS, THE CAMERA IN THE FRAGMENT, A UNIFORM
   ARRAY INSIDE THE STRUCT. *** The shell transplant carried three varyings since v4322, but only bare attribute
   copies; a varying made of an EXPRESSION (varying(uv.mul(scale), "vScaled"), a flat integer band) had three write
   the expression in its vertex stage and the transplant refused it as unknown -- the one rule that kept a Slug
   graph out of the device shell. Now render/tslSource.mjs vertexVaryingBlock takes those statements BY DEPENDENCY
   (the assignment and every temporary it reads, wherever three put them: the first draft took a window and shipped
   an unwritten temporary, 0 of 16,384 pixels), a shell says where they land ({{VARYINGS}} in its VOut and out/in
   lines, {{ASSIGN}} in its vertex stage, nextLocation, outVar) and names its own matrices for three's
   (matrices: { cameraProjectionMatrix: "cam.proj" }); @interpolate(flat) / flat out|in are preserved. computeShell
   takes a uniform field { name, array: { element, length } } and folds the graph's uniformArray into the struct
   (planes.value[i] -> u.planes[i]), so a generated pass reads struct Cull's forty floats from ONE binding -- the
   limit v4364 called a limit is gone. render/tslWide.mjs is the consumer pair: a quad shell over a grid of cells
   (p, uv), the graph with vScaled = uv * scale, vLin linear in the position, vBand the CELL's column as a flat i32,
   the fragment reading cameraProjectionMatrix; and a planes pass (the least signed distance to six planes) with
   its f32 CPU twin. tools/ship/tslWide-selfcheck.mjs: on both backends the generated quad is the hand twin's
   picture on 16,384 of 16,384 pixels, AND equals quadColourAt -- a CPU function that never saw the shell -- at
   1,024 pixel centres to a byte, which is the check twin-grading cannot do (the shell's attributes had no names
   at first and the GL path bound nothing: both halves drew the same wrong picture, and only the CPU twin saw it);
   the planes pass bit for bit against its twin through one uniform binding. THE FINDING: a flat varying whose
   vertices disagree is BACKEND-DEPENDENT -- WebGPU takes a triangle's first vertex, OpenGL ES its last -- so the
   cell-constant band draws the same picture on both (0 pixels apart) and a per-vertex band draws two (8,704 of
   16,384 apart), each byte-exact against its own twin. The rule is the graph author's: compute a flat varying
   from what the primitive shares. NOT CLAIMED: a vertex-stage texture read; cameraViewMatrix (same map, unread);
   a flat u32 or vector; the Slug graph itself (task 4).

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
        MEASURED at v4484 (task 4), and the second sentence is withdrawn: render/slugTsl.mjs is Slug's fragment as
        nodes -- the sign-bit root code, the two solvers, CalcBandLoc, CalcCoverage, SlugRender's two band loops with
        their breaks, the two atlases by textureLoad (the band one texture_2d<u32> / usampler2D), the four varyings
        read by the shipped stage's names, two of them flat -- and render/tslSource.mjs (widened at v4483) carries
        the emitted fragment into the SHIPPED pipeline's own shell, text/slugShaderWgsl.js's vertex stage and
        bindings unchanged. tools/ship/slugTsl-selfcheck.mjs: on WebGPU and on WebGL2, "Sphinx 42% AV" at 28 px
        drawn by the generated fragment is the shipped pipeline's picture on 23,040 of 23,040 pixels, worst 0. What
        the emission found, each a rule written beside the code: three 0.178 has NO float-to-uint bitcast (its
        bitcast() is bitcast<f32> only), so the root code gathers the three sign bits by comparison and reads -0.0
        as positive where asuint reads its sign -- stated, and invisible in this text; three drops a conversion
        applied to a function parameter (int(offset) emitted bare, GLSL refused int + uint), so parameters are typed
        and callers convert; a texture node built without a uv turns the uv-transform on (v4326 again), so the base
        takes a uv and each load carries the label; three's WebGPU backend uploads an RGIntegerFormat texture only
        as RG32Sint/RG32Uint, and on this box's SwiftShader a data-bearing float or uint DataTexture upload takes the
        page down, so the stand-ins are data-less; the emitted core is 1.7x the hand-written one in lines. THE
        DECISION: NO TSL Slug material for the 0.178 pages -- of the three, only orrery-gpu.html draws text, through
        render/slugDevice.mjs on the device already; three cannot upload the atlas a NodeMaterial would read; the
        shipped shader already runs on the WebGPU backend. The generated pair is in the corpus from
        tools/ship/tsl-emitted-slug.json; the record is tools/ship/todo.mjs slug-node-material. NOT CLAIMED: the
        evenOdd and weight variants' pictures, another logWidth, the cost of either fragment (task 9).
     5. GPOS PairPos kerning in slugFont.js BEFORE any font is vendored: every font the plan names (Inter, Orbitron,
        Cinzel, JetBrains Mono, Source Sans 3, Cormorant, Lora, Merriweather, Fira) kerns through GPOS only, and
        layoutText reports kerningSource "none" for them today.
        BUILT at v4485 (task 5): text/slugFont.js parseGpos reads the default script's default language's 'kern'
        feature -- LookupType 2 directly or through a type 9 extension, PairPos formats 1 and 2, coverage formats 1
        and 2, class definitions in both formats -- and takes the first glyph's xAdvance from the first subtable
        that applies; the legacy table is the fallback, and layoutText's kerningSource says GPOS | kern | none.
        THE FINDING WAS THE VENDORED FONT: IBM Plex Serif has no kern table and a GPOS with one kern lookup of four
        subtables, so every label this tree drew before v4485 was unkerned and the layout said so on every call.
        tools/ship/gposKern-selfcheck.mjs holds the reader to a 326-byte GPOS table written field by field from the
        specification (two scripts, a foreign-language kern lookup that must not be read, a ligature lookup that
        must not be touched, value records with placement fields to step over, an extension at a 32-bit offset) and
        to the shipped font: A/V -50 units and symmetric, T/o -45, L/T -70, r/. -100, f/) +95, n/n 0, 1,112 kerned
        pairs over the 72-character label alphabet (800 closing, 312 opening), "Sphinx 42% AV" at 28 px 1.54 px
        narrower kerned than not. No independent oracle on the build box (no fontTools), which is why the real-font
        holds are shape and sign rather than a second reading. AND KERNING REACHED A MODEL: tools/ship/slugDevice-
        selfcheck.mjs's rasteriser model took the FIRST triangle under a pixel where the capture keeps the last drawn;
        unkerned boxes never overlapped, kerned A and V do, and the model read A's texcoord where the device wrote
        V's -- 0.636 em, both backends -- until the walk was reversed. NOT CLAIMED: contextual kerning (types 7/8,
        counted in gposKern.skipped, unfollowed), other languages, vertical kerning, device tables.
     6. Vendor OFL fonts under vendor/fonts/<family>/, static glyf instances only (the parser refuses CFF and
        ttcf by name and reads no fvar), one OFL copy per family with its Reserved Font Name, and one
        vendoredLicences.mjs entry each, because that gate requires disk and list to agree exactly.
        BUILT at v4486 (task 6), three families: vendor/fonts/cinzel (Cinzel Regular, RFN "Cinzel Decorative"),
        vendor/fonts/jetbrains-mono (JetBrains Mono Regular, no RFN), vendor/fonts/source-sans-3 (Source Sans 3
        Regular, RFN "Source", the TTF build) -- each a static glyf instance with its <Family>-OFL.txt beside it,
        under the naming world/orrery.mjs's licence matcher recognises. The registry is text/fontRegistry.mjs, not
        vendoredLicences.mjs: that gate reads the top level of vendor/ only, so vendor/fonts stays one entry under
        the Plex grant and the per-family grants, sources, fetch dates, digests and expectations live with the
        per-family facts. tools/ship/vendoredFonts-selfcheck.mjs holds disk and registry to each other both ways,
        parses every file with slugFont (glyf, not CFF), refuses a VARIABLE font by its fvar (shown on the real
        Orbitron[wght].ttf), holds each file's sha256, glyph count, unitsPerEm, kerning source and one measured pair,
        and each licence to OFL-1.1 by world/licenceBodies.mjs's own identifier with its Reserved Font Name present.
        MEASURED: Plex A/V -50, Cinzel -105, Source Sans 3 -14 (all GPOS), JetBrains Mono 0 -- a monospaced GPOS with
        no pair kerning under its default script, which the layout reports as none rather than GPOS. NOT VENDORED:
        Inter and Orbitron, the plan's minimal and sci-fi faces, reach this box only as variable builds (the static
        instances live in release archives on a host the proxy refuses), and a variable font is refused by name;
        Source Sans 3 stands in for the minimal sans. NOT CLAIMED: the three new faces' pictures (parsed and laid
        out, not rasterised -- task 7's packer and task 9's rig page draw them).
     7. Pre-pack atlases at ship time with a hash gate, after MEASURING parse+pack time; the worker is not worth
        its message-passing unless that number is over a frame.
        MEASURED AND BUILT at v4487 (task 7). The measurement first, in the harness's headless Chromium for the 67-glyph
        label alphabet, cold / warm: Plex 29 / 20 ms (parse 6, outline 3, pack 20), Cinzel 16 / 11, JetBrains Mono 8 / 8,
        Source Sans 3 10 / 13 -- about one frame, once, per family, so the worker is a won't-do (tools/ship/todo.mjs
        slug-atlas-worker) and the build step is the ticket. text/slugPack.mjs packs a family's alphabet into one
        byte-reproducible file ("SLUG", a JSON header with the atlas's shape and glyph records and the subset's cmap,
        advances, kern pairs and vertical metrics, then the rgba16float curve texels and the rg16uint band texels);
        decodePack hands back { font, atlas } where the font answers everything layoutText asks (glyphIndex, advance,
        kern, the metrics, kerningSource) and refuses outlines by name. tools/ship/packFonts.mjs bakes every
        registered family's declared alphabets (text/fontRegistry.mjs CHAR_SETS, `label` held equal to
        ev/esShipLabels.js LABEL_CHARS) to vendor/fonts/<family>/<Name>.<set>.slug.bin and writes their digests into
        the registry; without --write it reports stale / missing / current and exits 1 on either. SlugFontDevice.fromPack
        and SlugFontGPU.fromPack take a decoded pack straight to textures and a pipeline, refusing a device narrower
        than the pack was baked for. tools/ship/fontPacks-selfcheck.mjs holds every pack on disk to a fresh pack of
        its TrueType BYTE FOR BYTE (a stale pack is a red), to its digest, its decoded layout of "Sphinx 42% AV" to the
        parsed font's (indices, pen positions, width, kerning source), its atlas records and texels to packAtlas's, and
        on WebGPU and WebGL2 the phrase drawn FROM THE PACK to the parse path's picture on 23,040 of 23,040 pixels for
        all four families -- the pack path 3 to 6 ms against 15 to 52 for parse and pack in the browser. NOT CLAIMED:
        a shipped page that fetches a pack (ev/esShipLabels.js and orrery-gpu.html still parse the TrueType; the pack
        is proven equal and offered); an alphabet beyond `label`; the evenOdd and weight variants.
     8. Word wrap (maxWidth) in layoutText, pure and gated headless -- the one layout feature genuinely missing.
        BUILT at v4488 (task 8): opts.maxWidth in text/slugText.js layoutText, in the caller's units. The rules, each
        held in text/slug-selfcheck.mjs section 9 on the constructed font: a line breaks at the last space that fits
        and the space that took the break is DROPPED from the line, so a centred or right-aligned wrapped line is
        placed by its glyphs' width alone (symmetric to the unit: 40 = (2000 - 1920) / 2); a line that fits exactly
        does not wrap and one unit narrower does; kerning does not cross a soft break (C starts its line at 0, not at
        the +40 B/C pair); a word wider than the whole width breaks at the glyph that would overflow and never
        before a line's first glyph, so no line is empty and the loop always advances; a newline and a soft break
        compose; without maxWidth nothing changes. The result names its line widths (lineWidths) and how many
        breaks the width made (softBreaks). NOT CLAIMED: hyphenation, breaking at anything but U+0020, a break
        opportunity after a hyphen, and a right-to-left line, which are items 11 and below.
     9. A slug-rig.html measuring fragment cost by size, angle and band count on Keith's boxes, including one
        dense glyf CJK face, before any band-count tuning.
        BUILT at v4490 (task 9), RIG-PENDING: slug-rig.html (linked from the front door) draws a wall of glyphs per
        vendored face -- Plex, Source Sans 3, Cinzel, JetBrains Mono, and Sawarabi Gothic vendored this round as the
        dense CJK case (6,945 glyphs, static glyf, no kerning, so no label pack) -- at five sizes and three SQUASHES,
        twelve frames each, timed by the device's GPU timestamps where timestamp-query was granted and by
        performance.now() otherwise, and every row says which (`source`). Two things the item asked for are not on
        the page and the reasons are written down: the ANGLE is a squash of the y rows because the shipped vertex
        stage is a 2-D affine with no perspective to graze, and what grazing does to the fragment (one axis's pixels
        per em shrink, fwidth grows, every pixel walks its band) a squash does exactly; and the BAND COUNT is not
        varied because the atlas packs one split per glyph -- the page reports instead the atlas's own statistics
        (render/slugRig.mjs atlasStats reads every band header packAtlas wrote), which is the number tuning needs.
        MEASURED, and the plan's guess corrected: Plex's wall walks 6.55 curves per band (17 at most) and the kanji
        wall 8.00 (19 at most), 1.22x, with 39 curves a glyph against 32 -- not the "about twice" and "three times
        the curves" the gate's first draft wrote before reading the numbers. The band split does its job on the dense
        face. The gate (tools/ship/slugRig-selfcheck.mjs) holds the module headless, loads the page here on the WebGL2
        route with ?quick=1 (this box is SwiftShader, CPU-timed, and the rows say so; a presented WebGPU frame loses
        the device on the headless shell) and grades tools/ship/slug-rig.json once a rig has saved one; until then it
        says RIG-PENDING, and a quick run can never be taken for the rig's signature (the grader reports `quick`).
        No band count changes on this box's numbers: that is the rig's number to answer.
    10. Curved text by tessellated strips with per-strip Jacobians, or a planar target resampled -- never by
        bending vertices, because SlugDilate's half-pixel push needs the Jacobian constant over the quad.
        BUILT at v4491 (task 10): text/slugCurve.mjs. arcCurve (a circle parametrised by arc length, with a closed-form
        inverse that takes a branch hint) and lineCurve (the control); buildCurvedVertices cuts each glyph into strips
        along the curve -- the flat x becomes arc length, the flat y the offset along the normal -- each strip carrying
        its midpoint frame's Jacobian (T/s, N/s) and its outward push directions rotated into that frame, its edges
        placed at their own arc-length normals so adjacent strips share the edge float for float, and interior edges
        pushing only along the normal so a seam is never dilated from both sides; tessellationError measures the
        interpolated texcoord against the inverse; stripsFor is the chord-sag bound. SlugDeviceBatch.setBuilt takes the
        stream. MEASURED (Plex, 28 px, 202 px of text on r = 120): one bent quad per glyph -- the thing this item says
        never to do -- is wrong by 0.84 px, more than the half-pixel dilation it corrupts; 2 / 4 / 8 / 16 strips give
        0.35 / 0.17 / 0.08 / 0.04 px, halving per doubling: FIRST order, because a strip is a trapezoid (its far edge
        shorter by height over radius) and two affine triangles cannot interpolate a trapezoid, so the chord-sag bound
        (second order) is not the bound that matters -- stripsFor at 0.25 px buys 0.51 px of texcoord error, twice
        what it asks. On the device (tools/ship/slugCurve-selfcheck.mjs, both backends): the flat gate's rasteriser
        model with the strips' Jacobians reproduces the fragment's texcoord to 5.6e-7 em and the frame to the last
        level of 255 -- after the model learned that SlugDilate pushes half a pixel PER COMPONENT of aPos.zw (an outer
        corner moves 0.707 px, an interior one 0.5), not half a pixel along its unit vector. Against the exact planar
        resample the strips cost 5.0 of 255 on average over the lit pixels at 8 strips; the worst pixel (89) is the
        shipped evaluator's own: slugEval's coverage steps from 0.000 to 0.346 across 0.0002 em at A's texcoord
        (0.4341, 0.0537), same band index both sides, and the interpolated texcoord lands across it -- a Slug finding,
        recorded, not chased here. slug-curved.html draws four arcs (three outside, one inside) with each arc's strip
        count and measured error in its HUD. A line with one strip is buildVertices' stream float for float.
    11. Bidi shaping and the CJK fallback recorded as wont in tools/ship/todo.mjs with reasons (two-letter
        presentation-form shaping and a whole-string reverse is not UAX #9; canvas fillText is not an MSDF).
        RECORDED at v4492 (task 11): todo.mjs slug-bidi-shaping and slug-cjk-msdf-fallback, both wont, with the
        reasons measured by tools/ship/slugShaping-selfcheck.mjs rather than asserted. COUNTED: every vendored face
        maps 0 Hebrew, 0 Arabic and 0 Devanagari codepoints (Plex 754 codepoints in its cmap, Cinzel 367, JetBrains
        Mono 1,372, Source Sans 3 1,614, Sawarabi Gothic 6,884 -- all 52 basic Latin letters in each), so a Hebrew
        string on Plex is .notdef three times over and shaping has nothing to shape; the plan's whole-string reverse
        turns 'abc <hebrew> 123' into '321 <hebrew> cba', which UAX #9 does not (the Latin and the digits stay, the
        Hebrew run alone reverses). The CJK fallback's premise is gone: Sawarabi Gothic carries 4,469 CJK Unified
        ideographs and 188 kana, the rig's kanji text lays out to a real glyph for every codepoint (a control shows an
        unmapped alef IS .notdef on it), all of them pack into the atlas Slug draws from (592 curves), and the dense
        wall was measured at 1.22x Plex's curves per band at v4490. Both are rounds of their own when somebody has a
        right-to-left label to draw or a rig measures the CJK wall past 1.5 ms; neither is a fallback renderer.
    12. Measure SlugTextBatch's per-frame bufferData before any ring buffer; the plan's ring resets to 0 on
        overflow with no fence, so it overwrites text still being drawn.
        MEASURED at v4493 (task 12), and the cheap fix built instead of the ring. Both shipping consumers
        (ev/esShipLabels.js, orrery-gpu.html) call set() on every label every frame: 24 labels are 343 glyph quads
        and 115 KiB of vertices and indices a frame, 72 us of layout + buildVertices a label on this box, and before
        this round SlugDeviceBatch.set destroyed and created two buffers per label per frame (1,920 over 40 frames
        in the gate) while SlugTextBatch.set took a new bufferData store each time. Now a set() whose stream fits
        the buffers it has writes into them (queue.writeBuffer / bufferSubData) -- the queue orders that write
        behind the commands already submitted, which is the fence the plan's ring lacked, for free -- and growth
        reallocates; both batches count sets, allocations and bytes. tools/ship/slugReupload-selfcheck.mjs, 24 labels
        x 40 frames on both backends, CPU-timed with the queue drained on SwiftShader: recreate 9.6 / 0.9 ms a
        frame (WebGPU / WebGL2), reuse 8.7 / 0.6, draw-only 8.4 / 0.2; reuse allocates nothing once warm and draws
        the same pixels. AND A FINDING FROM THE SABOTAGE: skipping the index write on reuse was invisible, because
        the index stream is STRUCTURAL -- quad k is 4k + (0,1,2, 0,2,3) whatever the text -- so a store written for
        N quads already holds the indices of any M <= N. Both batches now write indices only on growth (107 KiB a
        frame instead of 115), and the gate holds the structure by name. The ring buffer is a won't-do in
        tools/ship/todo.mjs (slug-ring-buffer): nothing it would save is left to save at this label count, and its
        reset-without-a-fence is the one thing the reuse write does not do.
    13. Flip the backendParity assertion and write the measured numbers here when step 1 lands.
    PROJECTIVE SLUG TEXT -- held at v4496 (task 42). The flat gate held only the orthographic case and said
        so in its last line. render/slugProjective.mjs carries the CPU side: SlugDilate once more on the CPU
        (dilateCpu), rows for a 2-D rotation and for a text plane yawed and tilted under a real perspective
        projection (perspectiveRows, the full 4x4 applied to (x, y, 0, 1) with the z column dropped, as the
        shader reads (x, y, -, w)), and a rasteriser model whose texcoords are PERSPECTIVE-CORRECT: tex/w and
        1/w affine over the screen triangle, divided at the pixel -- what a GPU does for every varying under a
        varying w, and what the flat gate's affine model could not. MEASURED (tools/ship/slugProjective-
        selfcheck.mjs, Plex 28 px, both backends): rotated 0.5 rad, the model reproduces the fragment's own
        texcoord to 1.27e-7 em over 3,492 fragments and the frame is exact; in perspective (yaw 0.6, tilt 0.5,
        w from 115 to 244 across the text, ratio 2.11) to 2.11e-7 em over 1,985 fragments, the frame exact on
        WebGPU and within 2 of 255 on WebGL2. An affine model is 0.635 em off in perspective at every snap. And
        SlugDilate does what it was designed for: at the far corner of the last glyph the vertex-space push is
        (0.522, -0.522) and ON SCREEN (0.500, 0.500) px -- half a pixel per axis, as in the orthographic case,
        from a different push. slug-projective.html draws both cases with sliders. Rotation and projective
        placement are now measured properties of the shipped shader, which is what the Box3D ticker (task 43)
        needs before glyphs tumble.
    THE 3-D TICKER: SLUG GLYPHS AS BOX3D BODIES -- built at v4497 (task 43). render/slugTicker.mjs turns a laid-out
        string into one box3d box per inked glyph (half extents from the bbox at 0.22 units an em), drops them on a
        conveyor that drives their x velocity every tick and wraps a body past the lane back by the loop length
        (swk_body_set_transform), and draws each glyph -- one SlugDeviceBatch built with its quad centred at the
        origin -- with rows = P * V * B from the body's [x, y, z, qx, qy, qz, qw], so a tumbling glyph is the
        projective case task 42 held with a new matrix every frame and nothing new in the shader. MEASURED
        (tools/ship/slugTicker-selfcheck.mjs): 33 bodies, 900 ticks in node hash the same twice (lockstep-safe),
        every body at rest on the floor inside the lane, the conveyor holding 1.10 of 1.2 units a second (friction
        takes its share inside the step); the tick-300 snapshot on both backends within 1 of 255 of slugEval
        through the perspective-correct model per body, texcoords to 2.3e-7 em. slug-ticker.html runs it live.
        TWO FINDINGS THAT WERE NOT THE TICKER'S: *** gfx/device.js's WebGPU pass applied only the LAST uniform
        write of a frame to every draw in it *** -- queue.writeBuffer lands before the command buffer, so 33 bodies
        drawn with 33 matrices all drew at the 33rd; ev/esShipLabels.js's device path had drawn every label at the
        last label's rows on WebGPU since v4463 and its gate compared placements loosely enough not to see it.
        Fixed with a CPU shadow and a per-pipeline pool of uniform buffers (a fresh one for the first uniform()
        after a draw, reset per frame, held to four buffers over three frames), gated by
        tools/ship/deviceUniformsPerDraw-selfcheck.mjs on both backends. And vertex streams built in node carried
        the node atlas's glyph locs into the browser's atlas of a different logWidth: the browser builds its own
        bodies now; only rows cross a process boundary.
    THE SLUG GLYPH MORPH -- built at v4498 (task 44), and vendor/morphicons arrived with it. physics/mesh/
        strokeMorph.mjs derived a morph for the gauge digits (single open strokes) and wrote its refusal of
        morphicons with an expiry: closed or multi-subpath outlines are that library's half, do not re-derive it.
        Font glyphs are exactly that, so the core of guillermolg00/morphicons 1.7.1 (three files, 32 KB, MIT, no
        DOM, no dependencies; PROVENANCE.md and world/vendoredLicences.mjs paper it) is vendored and
        render/slugMorph.mjs uses it: a glyph's quadratic contours become an SVG path (M / Q / Z, em units),
        morphicons resamples each subpath to N points, pairs the subpaths of the two glyphs and interpolates, the
        polylines come back as Slug contours of degenerate quadratics (control = midpoint, the a = 0 case the
        shader handles) and text/slugAtlas.js packs that ONE glyph a frame, drawn through SlugFontDevice.fromAtlas
        with one shared pipeline. MEASURED (tools/ship/slugMorph-selfcheck.mjs, Plex 0 -> 8, 64 points a subpath):
        t = 0 and t = 1 are the plan's own samples to 1e-16 and t = 1's subpaths are the 8's resample up to a
        cyclic start shift (morphicons moved the start, not the shape); every subpath's area at t = 0.5 lies
        between its endpoints'; a frame costs 1.9 ms here (interpolate + packAtlas, 192 curves); the t = 0.5 frame
        is within 2 of 255 of slugEval on the morphed atlas on both backends; the t = 0 frame differs from the
        font's own 0 on 125 of 603 lit pixels by up to 16 of 255, which is a 64-point polyline against true curves
        at 64 px. THE FINDING: morphicons pairs the 0's two contours with the 8's three by DUPLICATING the hole,
        and under Slug's non-zero winding two coincident holes wind +2 against the outer's -1 and read as ink --
        the first frame drew a FILLED 0. Exact duplicates are dropped at the endpoints; between them the copies
        diverge and their overlap winds +2 until they separate, a brief filled lens where a hole splits (even-odd
        would fill it too, three crossings). slug-morph.html cycles a string of glyphs. An earlier draft's
        re-pin of the closing curve pinned nothing (the closure is by construction) and was removed when its
        sabotage went 0 red.
    THE LITTLE PLANET -- built at v4499 (task 45). Nothing in the tree was stereographic before: render/panini.js
        only quotes the word and is itself uncalled from main.js. render/stereographic.mjs is the projection as
        a pure function (the bake's south pole at the picture's centre, r = 1 the equator, the north pole at
        infinity; roll spins the axis, tilt leans it), a fragment pass in both languages that samples
        procPlanet's equirectangular bake through gfx/device.js with nearest sampling and the seam wrapped by
        fract, and a CPU twin that computes the same picture texel for texel. MEASURED (tools/ship/stereographic-
        selfcheck.mjs, seed 7, a 256 x 128 terran bake, a 160 x 120 frame): 2,236 of the bake's own texel-centre
        directions round-trip through dirToUv to their own texels, so the mapping is the bake's convention and not
        a second one; the pass on both backends is the CPU twin texel for texel on 19,180 / 19,172 of 19,200
        pixels at the default knobs and 19,112 at zoom 1.6, roll 0.9, tilt 0.35, the rest texel-boundary
        neighbours and every one a bake colour, never a blend. The module is the tree's 14th dual-language shader
        module (backendParity and shaderCensus baselines raised by name; the WGSL is in the corpus). little-
        planet.html is the view: seed, zoom, tilt and spin. A sabotage that removed the WGSL's fract changed no
        pixel -- (lon + pi) / 2pi is already in [0, 1] and the sampler's clamp gives the same texel at u = 1 --
        so the text hold that had stood in for it was dropped and a roll sabotage put in its place.
    THE SLUG FILL, AND THE DOOM FIRE INSIDE THE GLYPH -- built at v4500 (task 47). The Slug fragment takes an
        optional fill in both twins: under defines.fill the WGSL declares a sampler and a texture at bindings 3
        and 4 and the uniform struct gains fillRect, the GLSL a sampler2D and a vec4, and each multiplies its
        premultiplied colour by the texel sampled at the glyph's em coordinates mapped through fillRect (an em
        rectangle to uv 0..1, v flipped, the uv CLAMPED in the fragment itself). Without the flag both fragments
        are the reference's text byte for byte -- the GLSL fill is emitted from JavaScript rather than a #if,
        because a preprocessor block would have broken the capture rewrite that render/slugDevice.mjs anchors
        on the plain tail. render/slugFill.mjs is the CPU side: fillUv, nearestTexel, sampleFill, glyphRect,
        fireFill (render/doomFire.mjs stepped from a seed, as rgba8) and fillTexture. MEASURED (tools/ship/
        slugFill-selfcheck.mjs, Plex '8' at 64 px, the fire 64 x 48 stepped 40 times from seed 7): on both
        backends the filled glyph is slugEval's coverage times the fill's nearest texel on 9,216 of 9,216 pixels,
        the backends 0 apart; the plain glyph unchanged. THE FIRST RUN WAS NOT THAT: WebGPU was the key on 9,204
        and the 8 others were the glyph's dilated top edge, half a pixel above its rectangle, where the uv is
        -0.065 -- WebGL2's sampler clamped to the top row and WebGPU's wrapped to the bottom row (the fire's white
        source), 107 of 255 apart. The address mode is the sampler's default on each backend, so the fragments
        clamp the uv themselves now and the sampler is out of the picture. Sabotages red at 2 / 3 / 2 / 2: the
        GLSL uv not divided by the rectangle (355 unexplained on WebGL2, the backends 464 apart), the WGSL at the
        raw texcoord (418 on WebGPU), fillRect dropped from the uniform list (the device refuses the pipeline by
        name), the CPU key bilinear (133 on both). slug-fire.html is the view: a word with the automaton stepped
        and re-uploaded into one texture every frame (0.3 ms), stoke / damp / extinguish / relight.
    THE MELT, AND A CORRECTION TO THE FILL -- built at v4501 (task 48). THE CORRECTION FIRST: v4500 wrote that
        clamping the fill uv "takes the sampler's address mode out of the picture", and it did not. The clamp
        left the FLIPPED coordinate at exactly 1.0 wherever the shape dips below the rectangle's floor, and
        WebGPU's sampler wraps 1.0 to row 0 (the fire's dark top) where WebGL2's clamps to the last row. The
        fill gate's 8 hid it: its coverage on that edge is 0, so a wrong texel times nothing was within
        tolerance. The melt found it, because the polar interpolation sags the outer under the puddle's floor
        mid-melt with full coverage: 69 pixels on WebGPU at 7 of 255 against a key of 255. Both fragments
        now clamp the sample coordinate to the texel centres (half a texel in from either edge, by
        textureSize / textureDimensions), which is what the CPU key's nearestTexel always did. THE ROUND:
        render/slugMelt.mjs makes the task 44 morph's target a puddle -- an ellipse on the glyph's floor, 1.6
        times its width and 0.12 em tall, wound as the font winds an outer contour -- plus one PINHOLE per
        hole, a tiny contour of the hole's winding, so morphicons pairs holes with holes and each shrinks to
        nothing. MEASURED (tools/ship/slugMelt-selfcheck.mjs): without the pinholes the 0's hole is paired with
        a duplicate of the puddle and walked in its own direction, so at t = 1 a positive puddle lies over a
        negative one and the winding sums to 0.00000 -- the 0 would melt into NOTHING; the 8 sums to +0.07206,
        ink by accident. With them the 8 melts to one puddle within 0.3% of the inscribed 64-gon's area, its
        pinholes at 0. The fill rides along on one em rectangle (the glyph's bound and the puddle's, the floor
        shared), so the puddle shows the fire's source rows: mean green 176 against the glyph's 113. On both
        backends the frames at t = 0, 0.5 and 1 are coverage times the fire's nearest texel on 9,216 of 9,216
        pixels, 0 apart, through fromAtlas with ONE shared fill pipeline. Sabotage A (the puddle wound the
        other way) went red only on the headless hold: morphicons walks the target in whichever direction
        costs least against the source, so the target's winding never reaches the atlas -- the winding is
        this module's contract, not the frame's. slug-morph.html gained a melt mode (?mode=melt): each glyph
        rises from its puddle, rests, and melts back. Two a-priori holds were wrong and replaced by what was
        measured: the puddle is not "white" (14 of 329: only the source row is) and t = 0.5 does not have
        fewer lit pixels (the sag).
    THE TICKER ON FIRE, WITH A NAPALM TRAIL -- built at v4502 (task 49). render/slugNapalm.mjs: the task 43
        glyph bodies drawn through the task 47 fill (a second font device with the fill pipeline takes the same
        vertex streams; each body's fill rectangle is its own glyph's em box) and, behind each body, a trail of
        the task 48 puddle -- packed ONCE into an atlas of one glyph -- dropped flat on the floor at the body's
        past positions every 10 ticks, fading by the square of its age over 150 ticks, twelve a body at most.
        The trail is ONE vertex stream in a plane laid flat by P * V * F (world x = x, world y = a lift, world z
        = y), and text/slugText.js buildVertices now takes a glyph's own `color` (opts.color remains the default,
        every other stream unchanged), so the fade is in the stream. MEASURED (tools/ship/slugNapalm-selfcheck.mjs,
        the ticker's tick-300 snapshot in node, 33 bodies over 396 puddles at 320 x 150): the perspective-correct
        model per quad -- puddles and bodies alike -- reproduces the fragment's texcoord to 2.3e-7 em on both
        backends; the bodies alone are their key on 48,000 of 48,000 pixels on WebGPU; the trail alone and the
        two together are the composited key (colour x fire x coverage in draw order) with 0 unexplained pixels
        and worst 1 outside the ties. THREE THINGS THE KEY HAD TO LEARN, EACH A MEASURED FINDING: (1) the two
        backends agreed with each other and sat 5 to 10 levels off a key composited in f64, because the target is
        rgba8unorm and stores every quad's blend as bytes before the next reads it -- the key rounds per layer
        now, and WebGPU went from 47,802 exact to 47,996; (2) puddles of one size at nearly one z share edge
        lines on screen, so 154 pixel centres (0.3%) sit ON a quad edge where the fill rule decides -- an
        edgeDist per model triangle (render/slugProjective.mjs) counts them and the hold excludes them, WebGL2
        off the key on 24 of them, WebGPU on 2; (3) the last two pixels were the trail's end puddles straddling
        the viewport's left and right edges: a clipped quad's cut vertices are re-snapped, its edge lines move by
        up to a snap unit, and one layer of a ten-deep stack goes in or out -- a clipped quad's tie band is 1/Q.
        slug-ticker.html gained the napalm mode (?mode=napalm).
    THE TICKER GLYPH SHATTERS -- built at v4503 (task 50). render/slugShatter.mjs cuts a task 43 body's em box into
        3 x 3 cells and makes each a smaller box3d box carrying the glyph's SUB-RECTANGLE: a quad whose texcoords are
        the cell's corners in em and whose positions are the cell centred on its own body, written in the Slug vertex
        layout with the glyph's atlas words unchanged -- Slug evaluates coverage from the texcoord, so a quad spanning a
        ninth of the em box draws that ninth and nothing else, and nothing in the shader changes. The shards spawn where
        the cells were (the body's centre plus its rotation applied to each offset), inherit the body's velocity, and
        burst the way world/voxelDebrisSystem.js bursts its cubes (outward, upward, a spin) from a seeded generator, so
        the run stays deterministic under stateHash. box3d bodies cannot be removed, so shards live in a POOL: parked
        static far below the floor at `life` and reused by the next shatter; the glyph is parked the same way and returns
        at its spawn when its shards die. MEASURED (tools/ship/slugShatter-selfcheck.mjs): the cells tile the box to
        1e-12; a shard's stream is one quad with the cell's texcoords and the glyph's words; the ticker to tick 300, the
        body nearest the centre shattered: one tick later every shard is within 0.06 units of its cell, the mean
        distance from the burst grows from 0.05 to 1.7 over 90 ticks, a shard rises 0.38 above the centre, at life all
        nine are parked and the glyph is back at its spawn at the conveyor's speed, a second shatter makes no body, two
        runs hash the same. On both backends the tick-312 frame -- 32 bodies and nine shards mid-burst -- fits the
        perspective-correct model per quad to 3.3e-6 em and is slugEval's coverage stored per layer on 48,000 of 48,000
        pixels on WebGPU (worst 1 on WebGL2), the shards' ink spanning 16 x 27 px where the whole glyph would be about
        7, the parked glyph absent. A first draft of the gate let the second shatter overwrite the first's recorded
        cells and read a 0.58-unit "jump" that was the conveyor's travel. slug-ticker.html gained a shatter button and
        an every-150-ticks default, in both modes (in napalm mode the shards burn with the glyph's own fill rectangle).
    THE ZOOM BLUR BESIDE THE GOD RAYS -- built at v4504 (task 46). render/bloomPass.js's GODRAYS_FS was the tree's
        one radial march, and it is a god-ray pass: toward the sun, samples gated by luminance and by the far plane,
        decayed, added to the scene by the composite. render/zoomBlur.mjs is the other thing a radial march is for:
        every fragment averages 32 bilinear samples along its line toward a centre given as a uniform, no gate, no
        decay, the mean REPLACING the scene; both languages, a CPU twin, the sample clamped to the texel-centre range
        in the shader itself because WebGL2's sampler clamps and WebGPU's repeats (the v4500 finding again).
        MEASURED (tools/ship/zoomBlur-selfcheck.mjs, procPlanet's bake at 128 x 64 with its edges painted, a 160 x 96
        frame): within 1 of 255 of the twin on every pixel at three settings on both backends, the backends 0 apart.
        GODRAYS_FS run RAW from bloomPass.js's own text in the same page on the same scene toward the same centre: it
        lights every pixel with the depth at the far plane and no threshold, none at threshold 0.99 (the bake's
        brightest is 0.980), none at depth 0.5; on a constant grey of 128 it returns 31 (g * g * the decay sum / N,
        31.3 by the formula) where the zoom blur returns 128 on every pixel; the two frames' luminance correlates at
        0.992. Two corrections inside the round: the first gated threshold, 0.95, was NOT above the scene's brightest
        pixel; and the clamp sabotage was blind twice -- the bake is continuous across its seam so the repeating
        sampler read the clamp's own colour, and under the march the edge is one sample in 32 (0.8 of a level) --
        until the edges were painted and a strength-0 setting made the pass a plain resample. The tree's 15th
        dual-language module. zoom-blur.html: the blur following the pointer beside the god rays with their
        threshold on a slider.
    SHAPE-AWARE ASCII -- built at v4505 (task 51), after edoardolunardi/ascii-logo (MIT, (c) Codrops; read and
        hand-written, nothing copied; world/reachedLicences.mjs). tools/ship/asciiLut.mjs picks a glyph by ONE scalar
        per cell, so a diagonal edge and a flat mid-grey of the same mean get the same glyph, and its own header
        named the multi-sample category as the better method declined for the AGPL alone. render/asciiShape.mjs is
        that category under MIT: each of the 95 printable glyphs is rasterised from the vendored Plex through
        text/slugEval.js's slugRender, averaged over six discs at ascii-logo's six interior points, and the six
        columns normalised to their peaks -- DERIVED, as asciiLut derives its ramp; the table ships as a 6 x 95
        rgba8 texture quantised to bytes so the CPU twin and both fragments compare the same numbers. The cell pass
        in both languages takes the same six samples of the scene (a centre tap and six ring taps, nearest texel)
        and picks the nearest vector by squared distance, first of equals. MEASURED (tools/ship/asciiShape-
        selfcheck.mjs): the fragment's argmin is the CPU twin's on 504 of 504 cells of procPlanet's bake on both
        backends with 0 near-ties under 1e-5, the mean luminance exact; three cells of one mean (white left, white
        right, flat grey) pick "L", "4" and "1" by shape where asciiLut prints "#" three times. NOT TAKEN from
        ascii-logo: its ten outer samples and two contrast powers (weights on the same six numbers, and pow in f32
        would move the near-ties the gate counts) and its glyph sheet (ascii-shape.html prints the picks through
        Slug from the same font the vectors were measured on). Sabotage C, the table left unnormalised, left every
        cell-for-cell hold green -- both sides read the same bytes -- and was caught by the derivation holds alone:
        parity sees that two sides agree, never what they agree on.
    2D WATER -- built at v4506 (task 52), after StefanJo3107/2D-Water-Shader (MIT, (c) 2020 Stefan Jovanovic; read
        and hand-written, nothing copied; world/reachedLicences.mjs), the one repo of the shader-porting branch's
        sixteen that docs/SHADER-REPO-SWEEP.md flagged as having a falsifiable core. render/water2d.mjs: two
        displacement maps generated from a seed on the CPU (value noise), scrolled in x at two speeds and by the
        camera's x over a parallax divider, their red and green summed into an offset; the scene read at uv +
        (offset - 0.5) / amount; a tint curved per channel by the sample's own greyness; foam where both offset
        channels pass a threshold or the fragment sits below an edge line that leans with the offset. EVERY READ IS
        AN INTEGER TEXEL on both sides (floor of a fract-wrapped or clamped coordinate times the size, no sampler),
        so the CPU twin names the exact texel each fragment reads. MEASURED (tools/ship/water2d-selfcheck.mjs, a
        160 x 96 frame, 60-texel maps, a 128 x 64 scene): on a RAMP whose colour is 2 x its texel index the fragment
        reads the twin's texel on every pixel not within 2e-6 of a texel boundary (15,349 to 15,356 of 15,360 exact,
        0 wrong) and the foam mask is the twin's pixel for pixel; a camera shift of three map texels moves the mask
        exactly eight pixels on 14,592 of 14,592; procPlanet's bake with the tint and translucent foam is within 2
        of 255 off-boundary on both backends. Three corrections to the gate's own arithmetic first: a ramp of raw
        indices halved by the tint landed odd indices on a .5 that f32 and f64 round apart; 64-texel maps against
        160 x 96 put every fifth column and every third row exactly on a texel boundary; and the parallax shift was
        compared backwards (a camera moved right reads the map further along). NOT TAKEN: bilinear sampling (the
        twin can name nearest exactly and nothing else), the vertex-displacement and perspective-correction toggles,
        and the original's reflection render as the scene. water-2d.html is the view, the pointer's x the camera.
    KUGIRI, READ AND NOT TAKEN -- recorded at v4507 (task 53). edoardolunardi/kugiri (MIT) splits HTML text at the
        lines the browser already painted (Range.getClientRects, Range.extractContents, Intl.Segmenter); it has no
        DOM text to find on the Slug and WGSL text path and no wrap point to read on server.html's one-line ticker
        (ui/textMorph.js v4158 kept torph off the ticker for the throughput arithmetic; kugiri fails a step earlier).
        The consumers a wrap-aware splitter would feed exist (ui/stagger.mjs, ui/domAnimation.mjs); the front end does
        not, and no multi-line copy that should reveal line by line was named. docs/SHADER-REPO-SWEEP.md and
        world/reachedLicences.mjs carry the answer so the next round with a paragraph to reveal starts from it.
    BUILDINGS 1, CITYGEN SEEDED -- built at v4508 (task 54), the first of four rounds toward procedural buildings after
        VladimirKobranov/configurator-unreal-building (Apache-2.0; UE5, read for the rules, nothing copied). The finding
        first: world/CityGen.js drew every decision -- tier, height, footprint, position, the glass roll, the bite face,
        the topple direction, the rubble splay -- from Math.random since round 253, so the Kaiju sandbox's city could not
        be regenerated and no building claim could be held by hash. generate() takes a seed now (default 1) and draws
        from world/procPlanet.js's mulberry32; the damage rolls come from a second stream seeded from the same number,
        so a destruction sequence replays without consuming the generation stream. MEASURED (tools/ship/cityGenSeed-
        selfcheck.mjs, a recording world, radius 40, 20 buildings): seed 7 stamps 14,803 voxels the same twice, hash
        2ccc123aee1a42da, and seed 8 stamps 10,247 with a different hash; the tier weights hold over 60 seeds (sheds 36%,
        houses 30%, midrise 21%, towers 8%, skyscrapers 3%, megastructures 1% against 35/30/20/10/4/1 before packing
        rejections); a topple from seed 7 writes 164 voxels the same twice; regenerating after any damage stamps the
        first city again. The sandbox passes cityOpts through unchanged, so every sandbox city is seed 1 until a
        caller chooses one. Next: the grammar (rules as data), the facade stamper (windows, doors, party walls from
        adjacency), the lab page.
    BUILDINGS 2, THE GRAMMAR -- built at v4509 (task 55). world/buildingGrammar.mjs is the configurator's rule set as
        data, read from its one actor and hand-written (Apache-2.0; world/reachedLicences.mjs; the sweep document's
        entry): a loop over cells on three axes; a role per cell by position (corner, wall, interior, roof cap) with
        first- and last-floor variants; stairs pieces (first, main, last) on one facade at a chosen or seeded column;
        a party-wall flag PER SIDE (the actor has one, for its left and right) that blanks the face, drops its
        accessories and removes the stairs; accessories where a seeded percentage roll falls; and every roll a cell
        might need drawn BEFORE its branch, which is the actor's structure and is held here as a property. Output:
        one placement per cell and a 32-bit hash. MEASURED (tools/ship/buildingGrammar-selfcheck.mjs, headless): seed
        7 hashes 4185303142 twice and seed 8 differs; five sizes match the closed-form counts (5 x 4 x 4: 16 corners,
        40 walls, 6 roof caps, 18 interior, one stairs piece per floor); a party wall on any side blanks its 16 or 20
        cells and moves ZERO of the other 60 or 64 placements; the accessory rate over 14,400 wall cells is 25.37% at
        25 and 60.67% at 60. Sabotage A -- the blank rolls drawn only when needed -- moved 23 to 34 placements on
        three sides and none on the right, whose cells the loop visits last: a hold on one side would have been
        blind, and the gate holds all four. Next: the facade stamper, with the flags derived from adjacency.
    TEXTURE BYTES BEFORE KTX2 / BASIS -- measured at v4495 (task 18), RIG-PENDING for the asset library.
        tools/ship/textureBytes.mjs walks a folder and records every raster texture's bytes on disk and, from the
        PNG and JPEG headers, its pixel size and GPU bytes (RGBA8 with mips); decide() derives the verdict from
        the totals. THE TREE: 16 raster files, 378 KiB on disk, 18.05 MiB on the GPU, 13.8 MiB of it one 313 KB
        JPEG in demos/resume_fx and the rest sprites under 3 KB; 70 source files make textures procedurally
        against 16 that load an image. Verdict not-yet (under a 64 MiB GPU floor): a transcoder of a few hundred
        KB would be the largest texture-shaped fetch in the build, serving the smaller population. Recorded as
        wont in tools/ship/todo.mjs (ktx2-basis). The gate (tools/ship/textureBytes-selfcheck.mjs) holds the
        header readers against twins with different inputs -- pngSize against pngCoverage's full decoder on
        every tree PNG, jpegSize against the browser's own decode of the tree's JPEG and a constructed JPEG whose
        APP0 precedes its SOF0 -- and the census against an independent walk. The rig's EXTERNAL asset library
        is the population that could change the verdict: `node tools/ship/textureBytes.mjs <external>/asset_library
        --write tools/ship/texture-bytes.json` there, and section 3 grades it and re-derives the verdict.

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
        held to the 2D page's CPU positions. BUILT at v4476: render/gpuOrbits.mjs carries a KIND per record in a third
        vec4 -- a body, a satellite (its circle in the ecliptic about a parent the kernel recomputes from the parent's
        elements), a flyby (Barker's equation in f32, the cube roots in the stable form D = u - 1/u). The twins are the
        2D page's own satelliteAt and flybyAt. orrery-gpu.html builds the fleets from orrery-fleet.json (compact, so
        moons hug their planets at the system scale) and the flybys exactly as orrery.html does; 388 records -- 16
        bodies, 148 importers, 35 paperwork, 189 passing -- through one cull and one ladder, a pick naming each.
        tools/ship/gpuOrbits-selfcheck.mjs: satellites within 3e-4 (two trig terms), flybys within 2e-4, a satellite
        minus its parent IS satelliteAt, a flyby at its epoch sits at q, and the GPU's count within a radius equals
        passingWithin's. Found while building: a sabotage of the cube root's sign guard was blind because the stable
        form's argument is always positive -- the guard was dead code and is removed. NOT CLAIMED: the flyby trails
        the 2D page draws; moons tilted with their parent's plane (they circle in the ecliptic, as the 2D page draws).
     5. (task 36) Slug labels on the device path (steps 7.3 and 7.5's modules) for picked and near bodies. BUILT at
        v4477: render/sceneLabels.mjs labelsFor -- the rule is the cull's own: a record is labelled when its angular
        metric (radius over distance, cullLodCpuOne's number) reaches the scene's near-rung threshold, so the labelled
        bodies ARE the bodies drawn at the near level of detail, and the gate holds the two counts equal on cullLodCpu's
        twin; the picked record is labelled whatever its size; the projection is ev/esShipLabelsCore.js's, placed above
        the body by its projected radius. orrery-gpu.html fetches the vendored IBM Plex Serif once, packs one
        SlugFontDevice atlas on its device and draws the labels in a begin() frame over the sky and the traders, on
        either backend, with a checkbox. LIMIT, measured: the cull tests a sphere against the frustum and the label a
        point against the NDC box, so a body whose centre is just off-screen is drawn without a label. NOT CLAIMED:
        label collisions, leader lines, fading.
     6. (task 37) Promotion by measurement: the 3D page passes the 2D page's gates plus its own before the panel's
        link points at it; the 2D page stays as the reference twin. MEASURED at v4478, NOT PROMOTED, and the
        measurement is a gate: tools/ship/orreryPromotion-selfcheck.mjs is a table of ten picture facts the 2D page
        holds, each row's evidence read from the modules and the pages, and the panel's orrery button is REQUIRED to
        agree with the verdict both ways. Six rows held (the bodies from one bake; every body's place at day 0;
        the fleets; the flybys; a pick that names; the colours -- closed this round, the GPU page tinting its
        records with ui/orreryDraw.js's own STATE_COLOUR and REACHED_COLOUR through render/litSphere.mjs's baked
        palette). Four open, by name: the planet zoom level (a seeded or measured micro planet between the sky and
        the terrain), the author view, the post stage, the flyby trails. The button stays on orrery.html; each page
        links the other. The 2D page's own gates (orreryView, orreryPost) hold the data model both pages read and
        are red on trunk for reasons that are not this page's (the bake's drift, a 6/255 post-effect pixel).

10. **THE GIT TERRAIN ON THE DEVICE -- planned at v4478.** The GitHub Terrain of v4149 (world/repoHeightfield.js: a
    repository as a squarified treemap, a directory a landmass, a file a peak, data files as lakes, extensions as
    biomes) was stamped into the voxel world only, and the Worley biomes of v2779 are feature-flagged off there; the
    orrery's landing (v4317) draws a thinner ground -- hashed hills -- through gfx/device.js. Four steps put the
    treemap and its biomes on the device path; the voxel world's chunk fill, caves and meshing stay on the three.js
    and WASM path and are NOT claimed:
     1. (task 38) The treemap heightfield onto the device terrain in the orrery landing, beside the hash hills.
        BUILT at v4479: render/bodyTerrain.mjs repoTerrainOf feeds repoHeightfield's smoothed heights (a line is 80
        bytes -- the bridge's pseudo-line and this tree's measured 80.7 over 5,022 text files) into the same RGBA8
        field gpuTerrain lifts; fileAt is the treemap's own answer, the leaf whose rectangle contains the point;
        landingFor is the one door (hills | treemap), and orrery-gpu.html offers both by a select. tools/ship/
        repoLanding-selfcheck.mjs holds every texel to repoHeightfield's height (half a byte), every rectangle
        centre to its file (233 of 233 for krbn), every lake below its landmass, and on both backends a pick at a
        leaf's centre to the chunk that contains it. THE FINDING: those picks missed 6 of 6, and the reason was
        gpuTerrain's pick picture -- gpuDriven's default pick pipeline, flat and scaled by the cull radius, not the
        terrain; the v4317 hills gate tolerated one miss in four and never saw it. gpuTerrain.terrainPickPipelineDesc
        picks with the terrain's own vertex stage; the hills gate now requires 4 of 4 and gets them.
     2. (task 39) The Worley biome field as a compute pass, world/worleyBiomes.js the bit-exact twin, biome and
        blend in the field's green and blue channels. BUILT at v4480: render/worleyWgsl.mjs -- the kernel (u32
        hashing, the 3x3 feature-point search, value noise, the Whittaker if-chain) writing a packed (primary,
        secondary, blend byte) element and the raw blend per texel; biomeFlat is ONE implementation with ONE rounding
        knob, pinned to worleyBiomes.biomeAt to the bit in f64 over 4,096 random points and seeds, and with fround it
        is what the device computes: the packed element identical on 4,096 of 4,096 texels on Dawn, the raw blend
        within 5.4e-7 (one f32 ulp, the tolerance stated from it), 0 biome disagreements between the knobs. The seed
        is the body's commit (world/orrerySeed.mjs); the treemap's language biome rides in alpha. paintBiomes paints
        a landing's field through gfx/device.js on WebGPU and by the twin elsewhere, byte-identical either way;
        orrery-gpu.html paints every landing. Under the contract: PROBES, a corpus entry on both harnesses, the
        probe convention's list. NOT CLAIMED: the colours (step 3), the voxel materials, altitude cooling.
     3. (task 40) Biome colour and a water plane in gpuTerrain's fragment stage, both languages, a CPU colour twin.
        BUILT at v4481: render/gpuTerrain.mjs takes a `look` uniform -- 0 the v4300 readout to the byte, 1 the Worley
        biome (the fragment's own texel: primary * 16 + secondary in green, the blend in blue, the two shipped colours
        lerped, times the chunk's shade), 2 the treemap's language biome (alpha) -- with both palettes baked into both
        shaders from worleyBiomes.BIOMES and repoHeightfield.BIOME_ORDER; terrainColourAt is the twin. THE WATER IS
        PER LAKE, IN THE FRAGMENT, AND THE PLANE WAS MEASURED WRONG FIRST: one sheet at the level covering every lake
        bed sat at 0.80 and flooded 39 of 64 dry chunks, because a treemap's lakes lie at their own landmass's massif
        height. Each bed is already flat at its own level, so a lake texel (alpha 1) is WATER_COLOUR over the Worley
        colour beneath under either look, and nothing floods. tools/ship/terrainLook-selfcheck.mjs holds every chunk's
        pixel to the twin at worst 0 of 255 on both backends under all three looks, lake and dry rows apart; orrery-
        gpu.html offers the look by a select. NOT CLAIMED: reflections, waves, a shoreline; a language blend across a
        border (a file is one language).
     4. (task 41) Erosion measured before any port: the step-loop kernel or a written won't-do, with the numbers.
        MEASURED at v4482, and the answer is a won't-do-yet with the measurement as a gate: tools/ship/erosionMeasure-
        selfcheck.mjs. COST: a 160x160 padded tile is 1.9 / 3.0 / 2.4 ms (fill / hydraulic / thermal, median of 6) on
        a synthetic base, 12.3 ms per tile on the engine's own generator in JavaScript and 8.3 ms in the WASM crate
        (built here for wasm32 by cargo alone and driven raw), once per 128 voxels of travel and already sliced under
        a 3 ms prewarm budget -- there is no hitch for a device pass to remove. SEQUENCE: the thermal pass is Gauss-
        Seidel, and the Jacobi pass one dispatch per iteration computes differs from it on 2,678 cells from the same
        field; the hydraulic pass is 1,500 droplets in RNG order, 6,485 of the 13,162 cells it touches are written by
        two or more of them, and the same droplets in reverse order move 12,393 cells by up to 2.4 voxels. So a device
        pass is a different algorithm, not a port: no tolerance short of voxels holds it to world/erosion.js, and a
        twin off by voxels is a third generator under the rule that already forbids mixing two inside one tile (the
        JavaScript and the crate differ on 1,207 of 16,384 columns of one tile, max 2 voxels, the crate eroding in
        f64 where the JavaScript erodes a Float32Array). SENSITIVITY, measured while there: one cell moved by an f32
        ulp changes one cell beside it; every cell moved by an f32 ulp changes 25,120 of 25,600, five by a voxel or
        more; every cell moved by an f64 ulp changes nothing, the Float32Array swallowing it. Deterministic, 25,600 of
        25,600. RE-OPEN when something on the device consumes an eroded field (the orrery landing's terrain is the
        natural consumer; the voxel world's chunk fill is CPU and would only read it back), and then as a Jacobi pass
        gated to itself in f32 under docs/GPU-KERNEL-CONTRACT.md, not as a twin of erosion.js. The record is
        tools/ship/todo.mjs's erosion-device-port, and the gate holds the record to the numbers.

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
