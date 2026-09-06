// WebGLEngine/render/shaderEmitters.mjs -- v4486
//
// THE SHADERS render/backendParity.mjs CANNOT SEE, AND THE TWO WAYS A CONTENT SCAN GETS THEM WRONG.
//
// ---- THE DEFERRED ROUND ----------------------------------------------------------------------------------
//
// v4483 gave render/stereographic.js a WGSL emitter beside its GLSL one, then found that backendParity's
// census calls that file "none" in BOTH languages -- and had done before the WGSL arrived. Its classify()
// finds a shader by its PREAMBLE: a version directive, a framework-style declaration, or a WebGPU stage
// attribute. AN EMITTED FUNCTION BODY HAS NO PREAMBLE. v4483 recorded that for the one file it had measured
// and refused to generalise, in as many words: "how many other emitters this census cannot see is unknown
// and is its own round." This is that round.
//
// ---- *** THE ANSWER: FOURTEEN FILES CARRY RUNNABLE SHADER TEXT THAT THE PREAMBLE CENSUS CALLS none. *** ----
//
// Against backendParity's 147 GLSL-bearing, 71 WGSL-bearing and 15 carrying both, fourteen more files hold
// shader source that a device could run and that census cannot see. They are invisible for FOUR distinct
// reasons, and the reasons matter more than the total because only one of them is fixable by widening a
// pattern:
//
//   emitted-fragment (10)      -- the shader is a function body handed to a host program that supplies the
//                                 header. There is no preamble in the file because there is no preamble in
//                                 the artifact: panini, parallaxOcclusion, stereographic, holoFoilShader,
//                                 glslFloatPack, dither, vortonNebula, NeuralRadianceCache (built line by
//                                 line into an array), ashimaNoise (held as an ARRAY OF LINES, so it is not
//                                 even one contiguous literal for a scan to find), and shaderPairs's fixture.
//   no-uniform-declaration (2) -- a COMPLETE shader that the framework tell still misses, because that tell
//                                 is a uniform declaration and neither file has one. render/transitionPass.js
//                                 carries a vertex shader driven entirely by an attribute and a varying;
//                                 shaders/voxel.frag.js is a whole fragment shader, in a file with a .js
//                                 extension and NO JavaScript in it at all, with zero uniforms.
//   assembled-fixture (1)      -- tools/ship/tslIsing-selfcheck.mjs builds a complete WGSL module by string
//                                 concatenation, so no literal in the file is a shader.
//   disarmed (1)               -- and this one closes a loop.
//
// ---- *** THE DEFENCE AGAINST A FALSE POSITIVE CREATED A FALSE NEGATIVE, AND NOTHING COUNTED IT. *** --------
//
// tools/ship/wgslLayout-selfcheck.mjs holds a complete, compilable WebGPU module. It is invisible because it
// INTERPOLATES its stage attribute from a fragment assembled one line above, under a comment that names
// exactly why: "earlier rounds where a check counted itself; the marks go in by concatenation instead."
//
// That is the correct fix for self-counting and this tree has now applied it six times -- v4462, v4479,
// v4483, v4484, v4485 and there. Every one of those disarmings also removed the file from the census that
// was supposed to see it. The habit that stops an instrument sampling itself also stops it being sampled,
// and nobody had noticed because the two effects live in different files. THE COST IS NOT AN ARGUMENT FOR
// STOPPING: it is an argument for a second census that reads BODIES rather than preambles, which is this
// module, and whose own markers are assembled for exactly the same reason.
//
// ---- *** THE SECOND CENSUS IS ADDED BESIDE THE FIRST, NOT MERGED INTO IT. *** ------------------------------
//
// classify() is not widened. Widening it would move every ratchet in backendParity at once -- glslBearing,
// glslDirective, wgslBearing, both, glslOnly, wgslOnly -- and hide what moved for a reason behind what moved
// because the definition changed. The two files now answer two different questions: backendParity counts
// files carrying a COMPLETE shader with its own header, this one counts files carrying shader BODY text at
// all. Same resolution v4485 reached for the two timing files: two questions, both answered, neither
// conflated.
//
// ---- *** AND A BODY SCAN HAS ITS OWN FAILURE, WHICH IS THE EXACT MIRROR OF SELF-CLASSIFICATION. *** ---------
//
// An instrument that names what it measures becomes a sample of it -- eight rounds of that in backendParity
// alone. Turn the instrument around and the same fact reappears wearing the other sign: A GATE THAT ASSERTS
// SOMETHING ABOUT A SHADER MUST QUOTE THE SHADER. Nineteen files in this tree carry shader tokens for no
// reason but to test for them, describe them, or name them in a sentence, and to a scan reading text they
// are indistinguishable from an emitter. They are not a defect in those files; they are the population a
// body scan must reject, and naming them is most of this module:
//
//   * a regex quoting the source it searches for -- compositeDepth, depthProject, populationRender,
//     populationPolicy, scanLimits, fleets, tslSource, tslPhysics;
//   * a call testing a string for shader text -- hmcGpu, microfacetWgsl, brickShader;
//   * a sentence, in a report label or a page, that happens to name a builtin -- krbn-lyapunov.html,
//     volume-cache.html, swiftShaderModel, swiftShaders, holoFoil, rleVolumeCache, populationUpdate.
//
// So kindOf() returns THREE values, not two. A file with no tell at all is `none`; a file whose every tell
// sits next to a regex escape, next to a test call, or alone in a low-density window is `quoter`; only what
// survives all three is `emitter`. The rejections are per-hit, so a gate that both quotes AND emits -- which
// shaderPairs-selfcheck does -- is still counted as an emitter on the hit that survives.
//
// *** AND ONE OF THE THREE CURRENTLY DOES NO WORK AT ALL, WHICH A SABOTAGE FOUND AND NOT A REVIEW. ***
// Deleting the escape rejection outright changes NOTHING: the gate stayed green, all 31 rows intact. Counted
// over every tell in the tree, the split is escape-only 0, call-only 16, both 16, rejected by neither 58 --
// so every hit the escape test catches, the call test catches too. It is kept, for two reasons that are
// stated rather than assumed: it is the cheaper and more specific of the two, and a pattern STORED in a
// constant far from the matcher that uses it would have escapes and no call within reach. That second case
// is constructed in the gate so the rejection is proved non-vacuous, and the four-way count is REPORTED
// there rather than asserted to stay at zero -- a row asserting escape-only == 0 would go red on the day the
// rejection first earned its keep, which is v4485's defect of a check that fails for succeeding.
//
// ---- *** THE PARAMETERS ARE FITTED, THE SCORE IS NOT HELD OUT, AND THE BEST SCORE WAS REFUSED. *** ----------
//
// All 33 candidate files were read by hand and labelled before any threshold was chosen; that table is
// HAND_VERIFIED below and it is the answer key. The three thresholds were then swept against it, which makes
// any agreement a FIT rather than a measurement, and the sweep is reported instead of the winner:
//
//        floor:      2     3     4     5     6     7     8
//        r= 80      32    32    29    28    28    27    25
//        r=100      32    32    30    29    28    28    27
//        r=140      32    32   *33*  31    29    28    27
//        r=200      31   [32    32    32    32]  29    27
//        r=300      30    30    31    31    32    31    31
//
// A radius of 140 with a floor of 4 agrees with all 33 rows. IT IS NOT SHIPPED. Its four immediate
// neighbours score 32, 31, 30 and 32: it is a SPIKE, and a spike on a table of hand-made labels is the shape
// of a threshold fitted to its own answer key. Radius 200 holds 32 across floors 3, 4, 5 AND 6 -- four wide,
// where every other radius manages at most two -- so the shipped setting is one of that run's two interior
// floors and the shipped claim is 32 of 33, not 33 of 33. *** v4487 ADDED A ROW AND EVERY CELL OF THIS TABLE
// MOVED BY EXACTLY ONE: *** the SHAPE -- one spike at r=140, one four-wide plateau at r=200 -- is what
// survived a change of population, which is more than the peak's score could ever say for itself. (The first draft of this paragraph said
// the run was three wide and called floor 5 its middle: it read the span from floor 4 and floor 3 scores 31
// too. The gate derives the run rather than trusting the sentence, which is why the sentence is right now.)
// The whole table is re-derived by the gate rather than quoted, so a change to any tell moves the numbers
// here or goes red.
//
// ---- *** THE ONE ROW THAT STAYS WRONG IS ONE THE TREE ALREADY DOCUMENTED AS IRREDUCIBLE. *** ----------------
//
// The residual is tools/ship/swiftShaders-selfcheck.mjs, called an emitter and it is a quoter. It discusses
// a fragment builtin across sentences dense enough in shader vocabulary to clear the floor. No threshold
// separates it, and the reason is not that the threshold is badly chosen: A GATE WHOSE CLAIM IS THAT SOME
// GENERATED SHADER IS CORRECT PROVES IT BY QUOTING THE WHOLE THING, and at that point the quote IS the
// shader. v4381 wrote that down five rounds ago about a different file -- brainTsl-selfcheck "asserts
// against brain/mlp.js's kernel BY QUOTING IT" -- and the same sentence is why this row cannot be fixed by
// tuning. It is reported by name rather than excluded, because an exclusion list is how this measurement
// stops describing the tree.
"use strict";

/**
 * *** ASSEMBLED, NEVER SPELLED, AND FOR TWO REASONS AT ONCE. ***
 *
 * backendParity classifies by looking for a preamble, so a literal here would make this module WGSL- or
 * GLSL-bearing in ITS count -- the trap v4462, v4479, v4483, v4484 and v4485 each sprang. And this module's
 * OWN census reads bodies, so a literal would make it an emitter in its own count too. It is the first file
 * in the tree that has to hide from two censuses, and tools/ship/shaderEmitters-selfcheck.mjs asserts that
 * both this module and that gate come back `none` from both.
 */
const V = "ve" + "c[234]", M = "ma" + "t[234]", S = "sam" + "pler2D";

/** A body tell is a construct that exists in the shading language and NOT in JavaScript. */
export const TELLS = Object.freeze([
    // A function whose RETURN TYPE is a shading-language vector or matrix. JavaScript has no such signature.
    Object.freeze({ lang: "glsl", name: "vectorReturn",
        re: new RegExp("(" + V + "|" + M + ")\\s+\\w+\\s*\\([^)]*\\)\\s*\\{") }),
    // *** AND THE SCALAR FORM ALONE WOULD BE WRONG, WHICH COST A WHOLE DRAFT. *** A first version accepted any
    // C-shaped definition -- a scalar or void return, a name, a parameter list, a brace -- and it matched FIVE
    // box3d rig gates, which embed C. GLSL is a C-family language and syntax cannot separate them; a
    // shading-language TYPE can. So the scalar form must carry one in its parameter list.
    Object.freeze({ lang: "glsl", name: "vectorParam",
        re: new RegExp("(flo" + "at|vo" + "id|in" + "t)\\s+\\w+\\s*\\([^)]*\\b(" + V + "|" + M + "|" + S + ")\\b[^)]*\\)\\s*\\{") }),
    Object.freeze({ lang: "glsl", name: "builtin",
        re: new RegExp("gl_" + "(FragColor|FragCoord|Position|PointSize|FragDepth)") }),
    Object.freeze({ lang: "glsl", name: "sampleCall",
        re: new RegExp("(tex" + "ture2D|tex" + "tureLod|texe" + "lFetch)\\s*\\(") }),
    Object.freeze({ lang: "wgsl", name: "typedReturn",
        re: new RegExp("f" + "n\\s+\\w+\\s*\\([^)]*\\)\\s*->\\s*(f" + "32|i" + "32|u" + "32|bo" + "ol|" + V + "(f|<))") }),
    Object.freeze({ lang: "wgsl", name: "addressSpace",
        re: new RegExp("va" + "r<\\s*(sto" + "rage|uni" + "form|works" + "group)") }),
    Object.freeze({ lang: "wgsl", name: "sizedArray",
        re: new RegExp("ar" + "ray<\\s*[iuf]" + "32\\s*,") }),
]);

/**
 * A backslash escape of the kind a regex needs and shader source never contains. Its presence beside a tell
 * says the tell is a PATTERN searching for the shader rather than the shader.
 */
export const QUOTE_ESCAPE = new RegExp("\\\\[sdwbSDW]|\\\\\\(|\\\\\\)|\\\\\\{|\\\\\\}|\\\\\\.|\\\\\\[|\\\\\\]|\\\\\\*|\\\\\\+");

/**
 * *** THE ESCAPE TELL ALONE MISSES A REGEX THAT NEEDS NO ESCAPES, AND TWO FILES PROVED IT. ***
 *
 * compositeDepth-selfcheck and tslPhysics-selfcheck each search for a shader line whose every character is
 * literal, so their patterns carry no backslash at all and read exactly like source. What gives them away is
 * what happens to the pattern: it is handed to a matcher. So the second rejection looks for the CALL.
 */
export const QUOTE_CALL = new RegExp(
    "\\.(te" + "st|ex" + "ec|ma" + "tch|inc" + "ludes|start" + "sWith|end" + "sWith|ind" + "exOf|sea" + "rch)\\s*\\(");

/** Shading-language vocabulary, counted in a window to tell a shader body from an English sentence. */
export const DENSITY_TOKENS = new RegExp(
    "\\b(ve" + "c[234]f?|ma" + "t[234]|f" + "32|i" + "32|u" + "32|flo" + "at|in" + "t|vo" + "id|le" + "t|va" + "r|re" +
    "turn|un" + "iform|var" + "ying|attr" + "ibute|gl_\\w+|f" + "n)\\b", "g");

/**
 * The three windows, in characters either side of a tell. See the sweep in the header: the density radius is
 * the CENTRE OF A PLATEAU and not the peak of the fit.
 */
export const WINDOW = Object.freeze({ escape: 60, call: 120, density: 200 });
export const DENSITY_FLOOR = 5;

/** Every body tell in a text, with where it sits. Comments are the caller's job to strip. */
export function tellHits(text) {
    const t = String(text), out = [];
    for (const tell of TELLS) {
        const re = new RegExp(tell.re.source, "g");
        let m;
        while ((m = re.exec(t)) !== null) {
            out.push({ lang: tell.lang, name: tell.name, index: m.index, length: m[0].length });
            if (m[0].length === 0) re.lastIndex++;
        }
    }
    return out.sort((a, b) => a.index - b.index);
}

function window_(text, hit, radius) {
    return text.slice(Math.max(0, hit.index - radius), hit.index + hit.length + radius);
}

/** Does this hit sit inside a pattern that SEARCHES for the shader, rather than inside the shader? */
export function quotedAt(text, hit, win = WINDOW) {
    if (QUOTE_ESCAPE.test(window_(text, hit, win.escape))) return "escape";
    if (QUOTE_CALL.test(window_(text, hit, win.call))) return "call";
    return null;
}

/** Shading-language tokens within the density radius of a hit. Prose scores one or two; a body scores many. */
export function densityAt(text, hit, radius = WINDOW.density) {
    const w = window_(text, hit, radius);
    DENSITY_TOKENS.lastIndex = 0;
    return (w.match(DENSITY_TOKENS) || []).length;
}

/**
 * `emitter` if any single hit survives all three rejections, `quoter` if hits exist and none does, `none` if
 * there are no hits. The per-hit rule is load bearing: a gate that quotes a shader in one place and builds
 * one in another is an emitter, and shaderPairs-selfcheck is exactly that file.
 *
 * The thresholds are ARGUMENTS rather than constants so that TUNING above is a checkable table and not a
 * decoration: the gate re-derives the sweep's claimed cells by calling this with those radii and floors.
 */
export function kindWith(text, radius, floor) {
    const t = String(text), hits = tellHits(t);
    if (hits.length === 0) return "none";
    const win = { escape: WINDOW.escape, call: WINDOW.call, density: radius };
    for (const h of hits) {
        if (quotedAt(t, h, win)) continue;
        if (densityAt(t, h, radius) >= floor) return "emitter";
    }
    return "quoter";
}

export function kindOf(text) {
    return kindWith(text, WINDOW.density, DENSITY_FLOOR);
}

/** Why a file with a complete or partial shader in it is invisible to a preamble census. */
export const REASONS = Object.freeze({
    EMITTED: "emitted-fragment",        // a function body; the host program supplies the header
    NO_UNIFORM: "no-uniform-declaration", // a complete shader, but the framework tell is a uniform declaration
    ASSEMBLED: "assembled-fixture",     // built from fragments at run time, so no literal is a shader
    DISARMED: "disarmed",               // markers concatenated ON PURPOSE, so a marker census cannot see it
});

/**
 * *** THE ANSWER KEY, READ BY HAND BEFORE ANY THRESHOLD WAS CHOSEN. ***
 *
 * Every file the tells fire on at all, with what it actually is. Thirty-two rows: fourteen emitters and
 * eighteen quoters. `why` is filled in for emitters only -- a quoter is not invisible, it has nothing to see.
 */
export const HAND_VERIFIED = Object.freeze([
    Object.freeze({ file: "engine/NeuralRadianceCache.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "fx/dither.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "fx/vorton/vortonNebula.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "render/holoFoilShader.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "render/panini.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "render/parallaxOcclusion.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "render/stereographic.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "render/transitionPass.js", kind: "emitter", why: REASONS.NO_UNIFORM }),
    Object.freeze({ file: "shaders/ashimaNoise.js", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "shaders/voxel.frag.js", kind: "emitter", why: REASONS.NO_UNIFORM }),
    Object.freeze({ file: "tools/ship/glslFloatPack.mjs", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "tools/ship/shaderPairs-selfcheck.mjs", kind: "emitter", why: REASONS.EMITTED }),
    Object.freeze({ file: "tools/ship/tslIsing-selfcheck.mjs", kind: "emitter", why: REASONS.ASSEMBLED }),
    Object.freeze({ file: "tools/ship/wgslLayout-selfcheck.mjs", kind: "emitter", why: REASONS.DISARMED }),
    Object.freeze({ file: "krbn-lyapunov.html", kind: "quoter", why: null }),
    Object.freeze({ file: "physics/render/microfacetWgsl-selfcheck.mjs", kind: "quoter", why: null }),
    // v4487 -- the compile census. It NAMES the fourteen emitters and quotes none of their source, so it
    // lands on the quoter side; its GATE carries the real shader text and is preamble-visible instead.
    Object.freeze({ file: "render/emitterCompile.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "render/swiftShaderModel.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/roundhouse/hmcGpu-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/brickShader-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/compositeDepth-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/depthProject-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/fleets-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/holoFoil-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/populationPolicy-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/populationRender-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/populationUpdate-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/rleVolumeCache-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/scanLimits-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/swiftShaders-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/tslPhysics-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "tools/ship/tslSource-selfcheck.mjs", kind: "quoter", why: null }),
    Object.freeze({ file: "volume-cache.html", kind: "quoter", why: null }),
]);

/** The single row the shipped thresholds get wrong, named rather than excluded. See the header. */
export const RESIDUAL = Object.freeze({
    file: "tools/ship/swiftShaders-selfcheck.mjs",
    truth: "quoter",
    reported: "emitter",
    reason: "a gate proving a generated shader correct quotes the whole thing, and then the quote IS the shader",
    precedent: "v4381, brainTsl-selfcheck: 'it asserts against brain/mlp.js's kernel BY QUOTING IT'",
});

/** The sweep behind WINDOW.density and DENSITY_FLOOR: rows are radii, columns floors 2..8, values agreement/32. */
export const TUNING = Object.freeze({
    floors: Object.freeze([2, 3, 4, 5, 6, 7, 8]),
    byRadius: Object.freeze({
        80: Object.freeze([32, 32, 29, 28, 28, 27, 25]),
        100: Object.freeze([32, 32, 30, 29, 28, 28, 27]),
        140: Object.freeze([32, 32, 33, 31, 29, 28, 27]),
        200: Object.freeze([31, 32, 32, 32, 32, 29, 27]),
        300: Object.freeze([30, 30, 31, 31, 32, 31, 31]),
    }),
    peak: Object.freeze({ radius: 140, floor: 4, agreement: 33, shipped: false,
        note: "a spike -- every neighbour reads lower -- which is what a threshold fitted to its own key looks like" }),
    shipped: Object.freeze({ radius: 200, floor: 5, agreement: 32,
        note: "inside the widest run at the best non-spike score: FOUR floors wide (3 through 6), where every other radius manages at most two" }),
    // Derived by the gate from byRadius, not typed: the length of each radius' longest run at its own best score.
    runAtBest: Object.freeze({ 80: 2, 100: 2, 140: 1, 200: 4, 300: 1 }),
});

/**
 * Walk a tree and split the files a preamble census calls `none` into emitters and quoters.
 *
 * `io` supplies { readdir, readFile, join, relative } so a gate can drive this over a fixture directory, and
 * `preambleKind` is backendParity's classify() passed in rather than imported, so this module never depends
 * on the census it is measuring against.
 */
export function census(root, io, preambleKind) {
    const skip = new Set(["node_modules", ".git", "vendor"]);
    const out = { scanned: 0, emitters: [], quoters: [], seenByPreamble: 0 };
    const walk = (dir) => {
        for (const e of io.readdir(dir)) {
            if (skip.has(e.name)) continue;
            const p = io.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs|html)$/.test(e.name)) continue;
            out.scanned++;
            const text = io.readFile(p);
            if (preambleKind(text) !== "none") { out.seenByPreamble++; continue; }
            const k = kindOf(text);
            if (k === "emitter") out.emitters.push(io.relative(root, p));
            else if (k === "quoter") out.quoters.push(io.relative(root, p));
        }
    };
    walk(root);
    out.emitters.sort();
    out.quoters.sort();
    return out;
}

/** What the shipped thresholds report over the tree at v4486. */
export const MEASURED_AT_V4486 = Object.freeze({
    at: "v4486",
    scanned: 4344,
    // The count the round is about: files carrying shader body text that backendParity calls `none`.
    handVerifiedEmitters: 14,
    handVerifiedQuoters: 19,   // 19 at v4487: render/emitterCompile.mjs
    // The shipped thresholds report 15 emitters and 17 quoters -- one row over, and RESIDUAL names it.
    reportedEmitters: 15,
    reportedQuoters: 18,
    agreement: 32,
    rows: 33,
    // Against backendParity's own figures, unchanged and deliberately not widened.
    preambleCensus: Object.freeze({ glslBearing: 148, wgslBearing: 72, both: 16 }),
    // Of the fourteen, how many are invisible for a reason a wider PATTERN could fix: the two whose only
    // problem is that the framework tell is a uniform declaration. The other twelve are structural.
    fixableByPattern: 2,
    // Which rejection actually rejects, over every tell in the tree. See the header: escapeOnly is 0 today and
    // the gate reports it rather than pinning it, because the day it stops being 0 is the day it starts working.
    rejections: Object.freeze({ escapeOnly: 0, callOnly: 16, both: 16, neither: 58 }),
});
