// WebGLEngine/render/emitterCompile.mjs -- v4487
//
// THE FOURTEEN EMITTERS ON A REAL DEVICE, AND THE TWO THAT WERE NOT THE SAME FUNCTION.
//
// ---- WHAT v4486 LEFT OPEN ------------------------------------------------------------------------------------
//
// render/shaderEmitters.mjs found fourteen files carrying runnable shader text that the preamble census calls
// none. It counted them. It did not run any of them, and a census of shader text that never compiles a line
// is a census of STRINGS. So this round hands every one of the fourteen to a real driver and records what
// came back, per row, with the reason for every row it could not.
//
// ---- *** THE RESULT: EVERY EMITTER COMPILES. AND TWO OF THEM WERE NOT THE SAME FUNCTION. *** -------------------
//
// NINE of the fourteen carry shader text this gate can hand to a driver itself, and all nine compiled and
// linked -- ELEVEN programs in all, because dither and vorton each ship a pair: nine GLSL through WebGL2 and
// two WGSL through WebGPU, no errors, once the call sites were written correctly. Four more have a receipt in
// another gate and one is not a shader at all; both sets are listed by name below rather than counted as
// passes. That is the boring half and it is worth stating plainly: the emitters are not broken.
//
// The interesting half is fx/dither.js, which ships a GLSL snippet AND a WGSL snippet and says of them, in
// its own header: "the shader cannot drift from the JS because the shader is a function of the JS." That is
// TRUE OF THE 64 CONSTANTS -- both are built by serialising one array, and tools/ship/dither-selfcheck.mjs
// asserts it. It is FALSE OF THE ARITHMETIC AROUND THEM, which is hand-written once per language, and there
// the three copies disagreed:
//
//     the JS      ((y % N) + N) % N        -- an explicit non-negative wrap, written deliberately
//     the GLSL    mod(fragCoord.y, N)      -- GLSL's mod FLOORS, so it agrees with the JS
//     the WGSL    fragCoord.y % N          -- WGSL's remainder keeps the DIVIDEND's sign, so it does not
//
// *** MEASURED ON THE DEVICE, 256 PROBE POINTS OVER A 16x16 COORDINATE GRID FROM -7.5 TO +7.5: *** where both
// coordinates were non-negative the WGSL matched the JS EXACTLY (0.0) and the GLSL matched to 8.894e-8, under
// the pack24 transport floor of 2.38e-7. Where either coordinate was negative -- 192 of the 256 -- the GLSL
// still matched the JS to 8.894e-8 and the WGSL was off by up to 0.984375, which is 63/64: THE ENTIRE SPAN OF
// THE OFFSET the function returns. All 192 disagreed. The two shaders were as far apart as the function can be.
//
// *** AND IT WAS LATENT, NOT LIVE, WHICH IS THE HALF AN OVERCLAIM WOULD HAVE DROPPED. *** Both shipped call
// sites pass a fragment coordinate -- gl_FragCoord in the GLSL, @builtin(position) in the WGSL of
// fx/wormhole/wormholeNebula.js, the only consumer -- and neither is ever negative. Nothing on screen was
// wrong. What was wrong was a public function that two backends were entitled to call with any coordinate,
// and the first caller to dither in a shifted, tiled or jittered space would have got a different picture on
// WebGPU with nothing to say why. The WGSL now floor-wraps and the disagreement is 0 at all 256 points.
//
// ---- *** THE CONTROL, BECAUSE ONE MEASUREMENT THAT DISAGREES IS ALSO WHAT A BROKEN INSTRUMENT LOOKS LIKE ***
//
// fx/vorton/vortonNebula.js is the tree's other dual-language emitter of this shape: a GLSL and a WGSL swirl
// built from the same JS. Put through the same harness, the same packer and the same lattice, all three agree
// -- WGSL against JS 4.439e-8, GLSL against JS 2.631e-7, GLSL against WGSL 2.439e-7, every one at or under the
// signed transport floor. So the dither number is a property of dither and not of the method.
//
// ---- *** THE HARNESS HAS A TRAP, IT IS WRITTEN DOWN, AND THIS ROUND FELL IN ANYWAY. *** ------------------------
//
// tools/ship/webgpuHarness.mjs binds an EMPTY vertex array and draws three vertices attributelessly. A vertex
// shader that reads an attribute therefore gets (0,0) three times, collapses to a degenerate triangle and
// rasterises nothing -- and the harness returns ok:true with an all-black frame. Its own header says so, at
// v4284, under "A FRAME THAT DREW NOTHING CAME BACK ok:true AND ALL ZEROES, AND COST AN HOUR", and returns
// `distinctColours` precisely so a caller can tell the two apart.
//
// The first probe of this round wrote `in vec2 aPos`, read black, and spent three rounds of debugging deciding
// the DITHER GLSL was broken before checking the count the harness had already handed it. A CONSTANT-COLOUR
// SHADER read black too, which is what finally said the frame and not the shader. Every device row below
// asserts distinctColours, and where a row legitimately draws one colour -- an unbound uniform, a shader whose
// output really is flat -- that is recorded as the expectation rather than left to look like a pass.
//
// ---- WHAT IS NOT CLAIMED --------------------------------------------------------------------------------------
//
// COMPILING IS NOT CORRECTNESS. Eleven of these twelve rows are compile-and-link receipts and nothing more:
// they say a driver accepted the text, not that the text computes what its JS twin computes. Two rows go
// further and grade values (dither, vorton), and stereographic was graded at v4483; the other nine are
// unchecked in exactly the way render/backendParity.mjs's own footer says its count is -- "it cannot tell a
// correct WGSL shader from a syntactically broken one". Naming which rows are receipts and which are
// measurements is the difference between this file and a list of green ticks.
"use strict";

/** How the census gets hold of a file's emitted text. */
export const SOURCE = Object.freeze({
    EXPORT: "export",      // an exported const or function returns it
    INSTANCE: "instance",  // it comes off an object; see NOT_CONSTRUCTIBLE below
    FILE: "file",          // the file IS the shader, or the text is read out of the file's own source
    OWN_GATE: "own-gate",  // the file is a gate that already compiles its fixture; nothing to add here
    NOT_A_SHADER: "n/a",   // a fixture shaped for a DETECTOR, never meant to reach a driver
});

/** What a row's evidence actually is. Never conflate the first with the second. */
export const EVIDENCE = Object.freeze({
    COMPILED: "compiled",  // a driver accepted it. NOT a statement about what it computes.
    GRADED: "graded",      // its values were compared against a reference, and the number is recorded
    ELSEWHERE: "elsewhere",// another gate owns the receipt
    NONE: "none",          // no device evidence, with the reason stated
});

/**
 * The census. One row per emitter in render/shaderEmitters.mjs's HAND_VERIFIED emitter set, in the same
 * order, so tools/ship/emitterCompile-selfcheck.mjs can assert the two lists are the same population --
 * a compile census that quietly dropped a row would otherwise report a perfect score over a smaller tree.
 */
export const ROWS = Object.freeze([
    Object.freeze({ file: "engine/NeuralRadianceCache.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.INSTANCE, evidence: EVIDENCE.COMPILED, distinct: 1,
        // *** THE EMITTER IS PURE AND THE CONSTRUCTOR IS NOT, WHICH IS WHY THIS ROW IS `instance`. ***
        // getShaderGLSL() reads dims, activations and layers and nothing else, but new NeuralRadianceCache()
        // takes a WebGL context and calls _initTexture() and upload(), so there is no way to ask the class
        // for its shader without a live GL. The census builds the object off the prototype and calls
        // _buildWeights(), which needs no context either. Recorded rather than refactored: moving the
        // emitter out is a change to a shipping class and this round is a measurement.
        note: "flat output at these weights, so one colour is the expectation, not a black frame" }),
    Object.freeze({ file: "fx/dither.js", langs: Object.freeze(["glsl", "wgsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.GRADED, distinct: 29,
        note: "the round's finding -- see DITHER_THREE_WAY" }),
    Object.freeze({ file: "fx/vorton/vortonNebula.js", langs: Object.freeze(["glsl", "wgsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.GRADED, distinct: 1, distinctBound: 64,
        // *** TWO NUMBERS BECAUSE THERE ARE TWO RUNS, AND A FIRST DRAFT RECORDED ONE AND CHECKED THE OTHER. ***
        // The compile row binds no uniforms and the swirl reads flat; the graded row binds all of them and
        // gets 64. Same shader. A receipt that does not say which run it came from is a receipt for whichever
        // run the reader assumes, so both are here and the gate checks each against its own section.
        note: "one colour with the uniforms unbound, 64 with them bound -- the control, see SWIRL_THREE_WAY" }),
    Object.freeze({ file: "render/holoFoilShader.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.COMPILED, distinct: 1,
        // The first call site got the argument order wrong -- holoFoil(uv, normal, 1.0) against a signature
        // of (vec3 base, float ci, vec2 uvSurf) -- and the driver said so: "no matching overloaded function".
        // The only compile failure of the round, and it was the probe, not the shader.
        note: "nine uniforms, none bound here, so the output is flat; a value grade needs them and is its own round" }),
    Object.freeze({ file: "render/panini.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.COMPILED, distinct: 64 }),
    Object.freeze({ file: "render/parallaxOcclusion.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.COMPILED, distinct: 64 }),
    Object.freeze({ file: "render/stereographic.js", langs: Object.freeze(["glsl", "wgsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.ELSEWHERE, distinct: null,
        note: "tools/ship/stereoDevice-selfcheck.mjs, v4483: WGSL against the JS to 4.99e-8, GLSL at the floor" }),
    Object.freeze({ file: "render/transitionPass.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.FILE, evidence: EVIDENCE.COMPILED, distinct: 1,
        // GLSL ES 1.00, and it reads an attribute -- so it compiles and links here and CANNOT DRAW here, for
        // the structural reason in the header. One colour is the correct outcome and is asserted as such.
        note: "wants a vertex buffer; the harness draws attributelessly, so the frame is black BY CONSTRUCTION" }),
    Object.freeze({ file: "shaders/ashimaNoise.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.COMPILED, distinct: 52,
        // v4243-v4253 settled the JS half of this against an f32-simulated JS path (snoise3 against
        // snoise3f32). That is a CPU comparison; this row is the GLSL string reaching a driver.
        note: "held as an ARRAY OF LINES, joined by the caller -- the reason no scan finds a literal here" }),
    Object.freeze({ file: "shaders/voxel.frag.js", langs: Object.freeze(["glsl"]),
        source: SOURCE.FILE, evidence: EVIDENCE.COMPILED, distinct: 1,
        note: "a whole GLSL ES 1.00 fragment shader in a .js file; flat by construction with fixed varyings" }),
    Object.freeze({ file: "tools/ship/glslFloatPack.mjs", langs: Object.freeze(["glsl"]),
        source: SOURCE.EXPORT, evidence: EVIDENCE.ELSEWHERE, distinct: null,
        note: "tools/ship/stereoDevice-selfcheck.mjs, v4483: 23 bits achieved, worst error 1.19e-7" }),
    Object.freeze({ file: "tools/ship/shaderPairs-selfcheck.mjs", langs: Object.freeze(["glsl", "wgsl"]),
        source: SOURCE.NOT_A_SHADER, evidence: EVIDENCE.NONE, distinct: null,
        note: "a fixture built to exercise a pair DETECTOR -- it contains a function named notAFunction on " +
              "purpose. Compiling it would be a category error, and skipping it silently would be worse" }),
    Object.freeze({ file: "tools/ship/tslIsing-selfcheck.mjs", langs: Object.freeze(["wgsl"]),
        source: SOURCE.OWN_GATE, evidence: EVIDENCE.ELSEWHERE, distinct: null,
        note: "assembles a complete module and runs it; that gate is the receipt" }),
    Object.freeze({ file: "tools/ship/wgslLayout-selfcheck.mjs", langs: Object.freeze(["wgsl"]),
        source: SOURCE.OWN_GATE, evidence: EVIDENCE.ELSEWHERE, distinct: null,
        note: "v4486's disarmed row: it compiles its own fixture, and hides its stage marker from the census" }),
]);

/**
 * *** THE FINDING, AS NUMBERS A LATER ROUND CAN RE-DERIVE. ***
 *
 * `before` is what the shipped WGSL did; `after` is what it does now. The gate reproduces BOTH -- it keeps
 * the old expression as a fixture and drives it beside the fixed one -- because a fix whose defect cannot
 * still be demonstrated is a claim rather than a repair.
 */
export const DITHER_THREE_WAY = Object.freeze({
    at: "v4487",
    grid: 16, samples: 256, coordFrom: -7.5, coordTo: 7.5,
    negativeSamples: 192,
    transportFloor: 2.38e-7,          // pack24 over a signed remap; see tools/ship/glslFloatPack.mjs
    nonNegative: Object.freeze({ wgslVsJs: 0, glslVsJs: 8.894e-8, glslVsWgsl: 8.894e-8 }),
    before: Object.freeze({ wgslVsJs: 0.984375, glslVsWgsl: 0.984375, disagreeing: 192,
        note: "0.984375 is 63/64, the full span of the offset: as far apart as the function can be" }),
    after: Object.freeze({ wgslVsJs: 0, glslVsWgsl: 8.894e-8, disagreeing: 0 }),
    cause: "WGSL's % keeps the dividend's sign; GLSL's mod() floors; the JS wraps explicitly. Three spellings.",
    reachable: false,
    reachability: "both shipped call sites pass a fragment coordinate (gl_FragCoord, @builtin(position)), " +
                  "which is never negative -- so nothing on screen was wrong and the divergence was latent",
    consumer: "fx/wormhole/wormholeNebula.js",
});

/** The control. Same harness, same packer, same lattice, and it agrees -- which is what makes the above a finding. */
export const SWIRL_THREE_WAY = Object.freeze({
    at: "v4487",
    samples: 64,
    transportFloor: 4.76e-7,          // the signed floor doubled by this row's 0.25 pack scale
    wgslVsJs: 4.439e-8, glslVsJs: 2.631e-7, glslVsWgsl: 2.439e-7,
    verdict: "all three at or under the floor -- the dither number is a property of dither, not of the method",
});

/** What the census reports over the tree at v4487. */
export const MEASURED_AT_V4487 = Object.freeze({
    at: "v4487",
    rows: 14,
    compiledHere: 9,       // ROWS this gate hands to a driver itself
    programsCompiled: 11,  // ...which is 11 PROGRAMS, because dither and vorton each ship a pair
    glslPrograms: 9, wgslPrograms: 2,
    gradedHere: 2,         // ...of which these two rows are compared by VALUE and not merely accepted
    receiptElsewhere: 4,   // stereographic, glslFloatPack, tslIsing, wgslLayout
    notAShader: 1,         // shaderPairs-selfcheck's detector fixture
    compileFailures: 0,
    // The one compile error of the round was a probe calling holoFoil with its arguments in the wrong order.
    probeErrors: 1,
});
