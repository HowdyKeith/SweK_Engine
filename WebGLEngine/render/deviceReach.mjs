// WebGLEngine/render/deviceReach.mjs -- v4488
//
// FIFTEEN FILES STILL SAY THIS BOX HAS NO GPU, AND THE FLOOR A VALUE GRADE MAY NOT CLAIM PAST.
//
// ---- WHAT v4270 CORRECTED, AND WHERE THE CORRECTION STOPPED ---------------------------------------------------
//
// v4269 wrote, in a gate's output, in its changelog and in a module header, that a WGSL port could only be
// checked structurally -- the reason given being the proposition this file counts. v4270 tested it and it was
// false: Chromium serves a WebGPU adapter over a secure origin here, tools/ship/webgpuHarness.mjs compiles
// and runs both languages, and render/backendParity.mjs carries the correction in its own header -- "That was
// inferred, never tested, and is false".
//
// *** THE CORRECTION WAS APPLIED TO THE TWO FILES IT WAS ABOUT AND TO NOTHING ELSE. *** Scanning the tree for
// a comment that asserts, of THIS ENVIRONMENT, that a shader or a device cannot be run finds eighteen lines in
// eighteen files. Three are the correction itself, quoting the claim in order to refute it. FIFTEEN ARE LIVE,
// and they have been wrong for two hundred and eighteen versions, in a tree that has since built
// stereoDevice, blendModes, gpuTimer, slugWgsl, headlessGpu and emitterCompile -- six gates that do the thing
// those fifteen comments say is impossible.
//
// *** AND THE SHARPEST ROW WAS WRITTEN AFTER THE CORRECTION. *** render/stereographic.js is stamped v4463 --
// a hundred and ninety-three versions past v4270 -- and carried the claim in the present tense. Twenty rounds
// later v4483's tools/ship/stereoDevice-selfcheck.mjs ran that exact module's shader on that exact box and
// graded it to 4.99e-8. The sentence survived the round that disproved it, in the same file.
//
// *** AND THE FIRST DRAFT OF THE TWO PARAGRAPHS ABOVE QUOTED THAT SENTENCE AND PARAPHRASED THE OTHER, SO THIS
// *** MODULE JOINED ITS OWN POPULATION AND THE GATE WENT RED BY NAME. *** Seventh instance in seven rounds --
// v4462, v4479, v4483, v4484, v4485, v4486 and here -- and the sharpest version yet: the discipline WAS
// written down twenty lines below, applied to the data ("the rows carry no quotes, on purpose"), and not to
// the prose above it. Disarming a table does not disarm a header.
//
// ---- *** THE SECOND FINDING: A SHADER WITH A SINE IN IT CANNOT BE GRADED BELOW 1.8e-4. *** ---------------------
//
// v4487 turned seven of v4486's emitters into compile receipts and left them ungraded. Grading two of them
// produced one clean answer and one that looked like a defect and is not:
//
// render/panini.js's GLSL against its JS reads 3.052e-5 in x and 8.928e-5 in y -- ninety times the pack24
// transport floor. THAT IS NOT A PORT ERROR AND THE BISECTION SAYS SO. Driving each sub-expression through
// the same harness, the same packer and the same lattice:
//
//     atan(x, -z)                        4.995e-7    at the transport floor
//     length(vec2(x, z))                 5.233e-7    at the floor
//     y / length(vec2(x, z))             5.107e-7    at the floor
//     sin(atan(x, -z))                   4.444e-5    forty-six times the floor
//     cos(atan(x, -z))                   1.797e-4    a hundred and eighty-eight times the floor
//     2 / (1 + cos(atan(x, -z)))         9.060e-5    which is panini.y's 8.928e-5, arrived at from the other end
//
// Every algebraic step is exact to the instrument and the two transcendentals are not. SwiftShader's sin and
// cos and V8's Math.sin and Math.cos are different functions to about one part in ten thousand, so
// TRIG_FLOOR is a property of the two libraries and not of any shader written above them. v4483 measured the
// same thing once, at 1.839e-4 on a spiral, and called it "the trig library"; this reproduces it on an
// unrelated function and promotes it to a floor a value grade must quote, the way every grade in this tree
// already quotes the 8-bit readback floor.
//
// *** SO panini's GLSL AND ITS JS AGREE. *** Not "to 8.9e-5" as a bare number would suggest, but to within
// the tightest bound anything containing a cosine can be held to on this box. Reporting the raw figure without
// the floor beside it would have read as a defect and started a hunt for a bug that is not there --
// which is the mistake v4483 caught itself making and this file exists to stop repeating.
//
// ---- *** AND THE ASHIMA GRADE VINDICATED A DECISION MADE ON CPU EVIDENCE ALONE. *** ----------------------------
//
// shaders/ashimaNoise.js's GLSL against shaders/ashimaNoise.mjs, on the device, over a 256-point lattice:
//
//     against snoise3f32   1.697e-7    under the 4.76e-7 transport floor -- exact to the instrument
//     against snoise3      4.078       four whole units, on a function whose range should be about [-1, 1]
//
// v4243 added snoise3f32 beside snoise3 because the f64 path disagreed with the GLSL at 76.5% of points, and
// it made that call WITHOUT A DEVICE -- by simulating f32 in JavaScript. This is the first time a driver has
// been asked, and the driver agrees with the f32 path to the floor. The f64 path is not slightly off: over
// this lattice snoise3 ranges -3.0298 to +3.2576 where snoise3f32 stays inside [-0.8466, 0.8665], because
// Ashima's permute overflows f32 in a way the algorithm depends on, so the lattice indices themselves differ.
// A DECISION TAKEN ON SIMULATED EVIDENCE, CONFIRMED ON REAL EVIDENCE FIVE HUNDRED ROUNDS LATER.
"use strict";

/** How a scanned claim relates to the truth. */
export const CLAIM = Object.freeze({
    STALE: "stale",        // asserts this box has no device; false since v4270
    CORRECTION: "correction", // quotes the claim in order to refute it
});

/**
 * *** THE ROWS CARRY NO QUOTES, ON PURPOSE. *** A census of sentences that say "there is no device here"
 * cannot store those sentences without becoming its own subject -- the trap v4462, v4479, v4483, v4484,
 * v4485 and v4486 each sprang. Each row names a FILE and the gate re-reads the line from it, so the quote
 * lives exactly once, where it was written. tools/ship/deviceReach-selfcheck.mjs asserts that neither this
 * module nor that gate is found by the scan.
 */
export const CLAIMS = Object.freeze([
    Object.freeze({ file: "face/robotFaceAvatar.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "face/skinnedFit-selfcheck.mjs", kind: CLAIM.STALE }),
    Object.freeze({ file: "fluid/mgGpuKernels.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "fluid/multigridGPU.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "fx/anime4k/anime4kKernels.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "render/backendParity.mjs", kind: CLAIM.CORRECTION }),
    Object.freeze({ file: "render/panini-selfcheck.mjs", kind: CLAIM.STALE, correctedAt: "v4488" }),
    Object.freeze({ file: "render/panini.js", kind: CLAIM.STALE, correctedAt: "v4488" }),
    Object.freeze({ file: "render/stereographic.js", kind: CLAIM.STALE, correctedAt: "v4488" }),
    Object.freeze({ file: "sim/populationReduce.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "simulation/tomo/sinogramGPU.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "tools/roundhouse/multigridGPUBind.mjs", kind: CLAIM.STALE }),
    Object.freeze({ file: "tools/ship/badTvWgsl-selfcheck.mjs", kind: CLAIM.CORRECTION }),
    Object.freeze({ file: "tools/ship/physicsSuite.mjs", kind: CLAIM.STALE }),
    Object.freeze({ file: "tools/ship/populationGPU-selfcheck.mjs", kind: CLAIM.STALE }),
    Object.freeze({ file: "tools/ship/webgpuHarness.mjs", kind: CLAIM.CORRECTION }),
    Object.freeze({ file: "ui/testMePanel.js", kind: CLAIM.STALE }),
    Object.freeze({ file: "world/spellBook.mjs", kind: CLAIM.STALE }),
]);

/**
 * *** WHAT THE THREE CORRECTED ROWS DO AND DO NOT SETTLE, BECAUSE THE TWO PROPOSITIONS ARE DIFFERENT. ***
 *
 *   "THERE IS NO DEVICE HERE"           -- false, proven, and that is what the fifteen say.
 *   "THIS PARTICULAR SHADER CANNOT RUN" -- possibly true and UNTESTED for most of them.
 *
 * tools/ship/wgslSpec-selfcheck.mjs found three shipped shaders that exceed a default device's limits, so
 * the second proposition is a real thing to be. Several of the fifteen may have meant it and written the
 * first. This round corrects the three it actually disproved BY RUNNING THEM, and leaves the rest listed
 * rather than edited: rewriting a sentence about a shader nobody drove would trade one unverified claim for
 * another.
 */
export const OPEN = Object.freeze({
    corrected: 3,
    remaining: 12,
    why: "a claim is corrected here only when this round ran the shader it is about",
    // The detector wants a negation, a verb of execution, a device-or-shader noun and a word pinning it to
    // this box, all on one comment line. It therefore MISSES a claim phrased about a file rather than a box
    // -- physics/octree/svoMarch.mjs's "this file cannot run the shader" is true of a .mjs and says nothing
    // about the environment, so it is correctly out; tools/roundhouse/magmapVariants-selfcheck.mjs's "this
    // gate cannot run WGSL" is the same shape and is a genuine miss if it meant the box. Recall is not
    // claimed; the population the detector DOES find is hand-read and complete.
    knownMisses: Object.freeze(["tools/roundhouse/magmapVariants-selfcheck.mjs"]),
});

/** The pack24 round trip over a signed remap, before any caller's own scale. */
export const TRANSPORT_FLOOR = 2.38e-7;

/**
 * *** THE FLOOR THIS ROUND NAMES: A SHADER CONTAINING A SINE OR A COSINE CANNOT BE GRADED BELOW THIS. ***
 *
 * Measured on this box, over a lattice with no transcendental in the test points (v4483's rule), by driving
 * each expression through the same harness and the same packer. It is a property of SwiftShader's trig
 * library against V8's, not of any shader. A grade that reports a tighter agreement than this for a
 * trig-bearing shader is reporting the lattice it happened to pick.
 */
export const TRIG_FLOOR = 1.797e-4;

/** The bisection behind it. Every algebraic step is at the transport floor; only the two transcendentals are not. */
export const PANINI_BISECTION = Object.freeze({
    at: "v4488", lattice: 16, packScale: 4,
    transportAtThisScale: 9.52e-7,
    steps: Object.freeze([
        Object.freeze({ expr: "atan", err: 4.995e-7, atFloor: true }),
        Object.freeze({ expr: "length", err: 5.233e-7, atFloor: true }),
        Object.freeze({ expr: "y-over-length", err: 5.107e-7, atFloor: true }),
        Object.freeze({ expr: "sin-of-atan", err: 4.444e-5, atFloor: false }),
        Object.freeze({ expr: "cos-of-atan", err: 1.797e-4, atFloor: false }),
        Object.freeze({ expr: "the-S-factor", err: 9.060e-5, atFloor: false }),
    ]),
    // *** AND THE OBVIOUS EXPLANATION WAS TESTED AND REFUSED. *** f32 conditioning would have been the easy
    // read: the projection divides by d + cos(th), which goes to zero at the horizon. Driving the JS
    // reference through Math.fround at every step moved the disagreement from 8.928e-5 to 8.923e-5 -- it
    // changed nothing -- and the worst point sits at denom = 1.9923, nowhere near the singularity.
    f32SimulatedReference: Object.freeze({ x: 3.057e-5, y: 8.923e-5, worstDenom: 1.9923,
        verdict: "conditioning ruled out before the trig was blamed" }),
});

/** render/panini.js's GLSL against its JS, and the only bound it can honestly be held to. */
export const PANINI_ON_DEVICE = Object.freeze({
    at: "v4488", lattice: 16, samples: 256,
    x: 3.052e-5, y: 8.928e-5,
    floor: TRIG_FLOOR,
    verdict: "both under the trig floor: the projection agrees, and 8.9e-5 is what a cosine costs here",
    // Two STRUCTURAL differences a value grade over this lattice cannot see, named so the next round has them:
    // the JS returns null past the horizon and the GLSL returns vec2(1e9) -- and the JS's own comment says a
    // huge number "would look like geometry and would poison any average computed over it", which is exactly
    // what the shader returns. Neither is reached by these 256 points.
    unreachedByThisLattice: Object.freeze(["the horizon sentinel: null against vec2(1e9)",
                                           "the degenerate-azimuth guard: null against no guard at all"]),
});

/** shaders/ashimaNoise.js's GLSL against both JS paths in shaders/ashimaNoise.mjs. */
export const ASHIMA_ON_DEVICE = Object.freeze({
    at: "v4488", lattice: 16, samples: 256,
    // *** THE SCALE IS PART OF THE NUMBER, AND A FIRST DRAFT RECORDED ONE SCALE AND CHECKED ANOTHER. *** The
    // probe packed the noise over [-1,1] and read 1.697e-7 against a 4.76e-7 floor; the gate packs over
    // [-4,4], where both the floor and the error are four times larger. Same agreement, different figures, and
    // an error quoted without its pack scale means nothing. These are the gate's.
    packScale: 4,
    transportAtThisScale: 9.52e-7,
    vsF32: 5.740e-7,      // snoise3f32 -- under the floor
    vsF64: 4.078,         // snoise3 -- four whole units
    f64Range: Object.freeze([-3.0298, 3.2576]),
    f32Range: Object.freeze([-0.8466, 0.8665]),
    // No trig: simplex noise is floor, fract and polynomials, so TRIG_FLOOR does not apply and the transport
    // floor is the whole budget. That is what makes this the CONTROL for the panini number.
    trigFree: true,
    verdict: "the driver agrees with the f32 path to the instrument, and the f64 path is a different function",
});

export const MEASURED_AT_V4488 = Object.freeze({
    at: "v4488",
    scannedClaims: 18, stale: 15, corrections: 3,
    correctedThisRound: 3, remaining: 12,
    versionsWrong: 218,           // v4270 to v4488
    gatesThatDoTheImpossibleThing: Object.freeze(["stereoDevice", "blendModes", "gpuTimer", "slugWgsl",
                                                  "headlessGpu", "emitterCompile"]),
    gradedThisRound: 2,           // panini, ashimaNoise
    receiptsRemaining: 5,         // of v4487's seven: NRC, holoFoil, parallaxOcclusion, transitionPass, voxel.frag
});
