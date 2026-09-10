// WebGLEngine/vba/runtimeGap.mjs -- v4462
//
// *** #129 ASKS WHAT IS MISSING BESIDES THREADS IF THE VBA TRANSMITTER WERE THE SweK RUNTIME INSTEAD OF
// NODE/BUN. MEASURED, THREADS ARE THE SECOND-SMALLEST GAP OF TWELVE, AND THE QUESTION HAS ITS SCALE INVERTED. ***
//
// The item's phrasing carries an assumption -- that threads are the big one and the rest is detail. Counted
// over the 3,816 runtime source files in this tree (vendor, node_modules and dist excluded), COMMENT-STRIPPED:
//
//     ES modules              3525 files   92.4%
//     closures as values      3405 files   89.2%
//     async / await           1314 files   34.5%
//     typed arrays             662 files   17.4%
//     Promises                 329 files    8.7%
//     fetch / XHR              223 files    5.9%
//     performance.now          202 files    5.3%
//     requestAnimationFrame    116 files    3.1%
//     WebGL                    102 files    2.7%
//     WebGPU                    35 files    0.9%
//     workers / threads         22 files    0.6%     <-- the thing the item asks "besides"
//     WebAssembly               22 files    0.6%   <-- tied with it, and the tie is this round's own doing
//
// *** FIRST-CLASS FUNCTIONS ARE 155 TIMES MORE OF THIS TREE THAN THREADS ARE. *** 3,405 files against 22. A
// runtime that had threads and no closures could run 0.6% of what a runtime with closures and no threads
// could. So the answer to "what is missing besides threads" is: nearly all of it, and threads barely register.
//
// ---- *** AND THE GAP IS INVERTED FROM INTUITION IN THE OTHER DIRECTION TOO. *** ---------------------------
//
// The two capabilities anyone would guess are hardest to find outside a browser -- a network stack and a GPU
// renderer -- ARE THE TWO THE VBA SIDE ALREADY HAS. And the network one does not even need the archive to say
// so: vba/modGPUBrain.bas in THIS tree drives WinHttp.WinHttpRequest.5.1 asynchronously with a pile-up guard,
// and ai-bridge/fps-vba/modFPSControl.bas does the same through MSXML2.ServerXMLHTTP.6.0. The GPU one does
// need it -- vba/archiveManifest.mjs, read against a real archive (SweK_VBA_v3499, PROVISIONAL is false),
// records an `engine` part that declares its own GL entry points, and *** THAT IS THE ONE ROW IN THIS FILE
// THAT RESTS ON THE ARCHIVE. *** What is missing is the mundane substrate underneath -- modules, closures,
// async, typed arrays -- which is 90% of the tree and none of which a Winsock library can supply.
//
// ---- THREE CLASSES OF EVIDENCE, AND THEY MUST NOT BE MIXED --------------------------------------------------
//
// This file makes claims of three different strengths and marks every row with which one it is, because the
// temptation in a round like this is to write a tidy table where "VBA has no closures" and "the transmitter's
// HTTP server works" sit in the same column looking equally established. They are not:
//
//   MEASURED     the file counts above. Re-derivable from this tree by census(), and the gate re-runs it.
//   LANGUAGE     a property of VBA7 itself -- no first-class function values, no module imports, no async,
//                no typed arrays. Stable and documented, and NOT a claim about Keith's code.
//   ARCHIVE      a claim about the archive: that the transmitter serves HTTP, that the engine draws GL. It
//                comes from a manifest read against a real listing, but *** NO EXCEL HAS EVER RUN AGAINST IT
//                FROM THIS BOX *** -- excel.html says so of itself, and v4159's gate says so of itself. An
//                ARCHIVE row is the weakest thing here and is never to be promoted by proximity to a
//                measured one.
"use strict";

/** The census patterns. Each is the narrowest thing that still catches the capability's real uses. */
export const PATTERNS = Object.freeze({
    "ES modules":            /^\s*(import|export)\s/m,
    "closures as values":    /=>|\bfunction\s*\(/,
    "async/await":           /\basync\s|\bawait\s/,
    // *** THIS ROW NAMED SEVEN OF THE ELEVEN TYPED-ARRAY CONSTRUCTORS AND CALLED THE RESULT "typed arrays". ***
    // Found at v4560 by a round that added two files which allocate nothing but typed arrays and watched this
    // row NOT MOVE: the ones they use -- the 64-bit float array and the 32-bit unsigned integer array -- were
    // both outside the list, along with the 8- and 16-bit signed arrays and the two big-integer ones. Measured
    // across the tree, 233 files match the complete set and NOT the old one: 798 -> 1031, a 29% undercount, in
    // a row that has been re-taken by hand for ninety rounds. Same species as the WebGL lookbehind at v4547 and
    // the comment strip at v4462 -- every previous re-take asked whether the number CHANGED and none asked what
    // it was counting. The list is now the whole set the language defines rather than the subset this tree
    // happened to use the day the row was written.
    "typed arrays":          /(Float32Array|Float64Array|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|BigInt64Array|BigUint64Array|ArrayBuffer|DataView)/,
    "Promises":              /(new Promise|Promise\.(all|race|resolve|reject))/,
    "fetch/XHR":             /(fetch\(|XMLHttpRequest)/,
    "performance.now":       /performance\.now/,
    "requestAnimationFrame": /requestAnimationFrame/,
    // *** THE LOOKBEHIND IS A FIX, NOT A FLOURISH, AND IT IS WORTH 13 FILES. *** Without it this row counted
    // `--enable-webgl"` -- a CHROMIUM LAUNCH FLAG -- as a WebGL consumer. Measured on the real tree: 13 of the
    // 155 files this row scored had NO other match of any kind, only that flag, and they are gates that drive a
    // browser rather than code that touches a context. Same defect class as the comment strip above, one layer
    // further in: the strip removes prose ABOUT a capability, and this removes an ARGUMENT ASKING FOR one. A
    // file that asks Chromium to enable WebGL is not a file that uses WebGL, and the row said it was.
    // The pattern still matches its own source text (`]webgl` is not `-webgl`), which the self-match row needs.
    "WebGL":                 /((?<![-\w])webgl2?["')]|WebGL2?RenderingContext)/,
    "WebGPU":                /(navigator\.gpu|requestAdapter)/,
    "workers/threads":       /(new Worker|SharedArrayBuffer|Atomics\.|worker_threads)/,
    "WebAssembly":           /WebAssembly/,
});

/**
 * *** COMMENTS OUT BEFORE ANY OF THESE PATTERNS RUNS, AND IT CHANGED THE ANSWER. *** Raw against stripped:
 * typed arrays 692 -> 659, workers 32 -> 21, requestAnimationFrame 129 -> 114. Eleven of the thirty-two
 * "threaded" files were prose ABOUT threads -- a third of the row the item is built on. The same defect this
 * tree has found five times (v4421, v4424, v4429, ...), and the row it would have inflated is the headline one.
 */
export const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/** Count, per capability, how many of `files` ({path, text}) use it in CODE. */
export function census(files, patterns = PATTERNS) {
    const out = {};
    for (const k of Object.keys(patterns)) out[k] = 0;
    for (const f of files) {
        const code = stripComments(f.text);
        for (const [k, re] of Object.entries(patterns)) if (re.test(code)) out[k]++;
    }
    return { files: files.length, counts: out };
}

/** The census as rows, biggest first -- the ordering IS the finding, so it is derived and never typed. */
export function ranked(c) {
    return Object.entries(c.counts).sort((a, b) => b[1] - a[1])
        .map(([capability, n]) => ({ capability, files: n, pct: (100 * n / c.files) }));
}

export const EVIDENCE = Object.freeze(["measured", "language", "archive"]);

/**
 * What the VBA side offers, one row per capability, each tagged with HOW that is known AND -- since v4462's
 * sabotage pass -- with the BYTES that corroborate it.
 *
 * *** THE `has` COLUMN IS THE ONE A TABLE LIKE THIS GETS WRONG, BECAUSE NOTHING PUSHES BACK ON IT. *** The
 * first draft of this file declared an evidence CLASS per row and stopped there, so flipping "closures as
 * values" to `has: true` -- crediting VBA with the single capability this whole finding says it lacks -- was
 * a silent pass. A class name is a label, not a check. So every `has: true` row now names a `via`:
 *
 *   {kind: "vba-source", token}   a token that must appear in the .bas/.cls/.frm files IN THIS TREE
 *   {kind: "manifest", part, marker}   a part id and a marker that vba/archiveManifest.mjs must really hold
 *
 * and every `has: false` row carries `via: null`. The gate requires both directions, and requires the
 * corroborator to actually be found, so a flipped row has to invent bytes that exist before it can pass.
 *
 * *** POINTING THE ROWS AT BYTES IMMEDIATELY CORRECTED TWO OF THEM. *** (1) performance.now said
 * "QueryPerformanceCounter through the WinAPI declares the archive already carries" -- and this tree's VBA
 * contains no QueryPerformanceCounter at all. What it declares is kernel32 GetTickCount, at ~15.6ms, which
 * is a whole frame of quantisation at 60fps. (2) fetch/XHR was filed as an ARCHIVE claim about the
 * transmitter's servers, and the client half needs no archive: vba/modGPUBrain.bas creates
 * WinHttp.WinHttpRequest.5.1 and ai-bridge/fps-vba/modFPSControl.bas creates MSXML2.ServerXMLHTTP.6.0, both
 * async with a pile-up guard, both readable from this box. So *** ONLY ONE ROW IN THIS TABLE ACTUALLY RESTS
 * ON THE ARCHIVE, AND IT IS WebGL *** -- there is no GL of any kind in the in-tree VBA.
 */
export const VBA_SIDE = Object.freeze([
    Object.freeze({ capability: "ES modules", has: false, evidence: "language", via: null,
        note: "VBA has modules and no module SYSTEM -- no import, no export, no resolution, one flat name space per project" }),
    Object.freeze({ capability: "closures as values", has: false, evidence: "language", via: null,
        note: "no first-class function values; AddressOf yields a pointer usable only by API callbacks, and captures nothing" }),
    Object.freeze({ capability: "async/await", has: false, evidence: "language", via: null,
        note: "single-threaded and synchronous; DoEvents yields the message pump, which is not a continuation" }),
    Object.freeze({ capability: "typed arrays", has: false, evidence: "language", via: null,
        note: "Variant and fixed-type arrays exist; a contiguous byte-addressable buffer with views over it does not" }),
    Object.freeze({ capability: "Promises", has: false, evidence: "language", via: null,
        note: "follows from the absence of async/await: nothing to represent a value that is not ready yet" }),
    Object.freeze({ capability: "WebAssembly", has: false, evidence: "language", via: null,
        note: "no engine to host a module; the 21 files that touch it would need a native shim per call site" }),
    Object.freeze({ capability: "WebGPU", has: false, evidence: "language", via: null,
        note: "no adapter and no shading language binding; the archive GL engine is fixed-function OpenGL, not WebGPU" }),
    Object.freeze({ capability: "workers/threads", has: false, evidence: "language", via: null,
        note: "the item's own premise, and the second-smallest gap of the twelve rather than the defining one" }),
    Object.freeze({ capability: "requestAnimationFrame", has: false, evidence: "language", via: null,
        note: "no vsync callback; a timer loop is the substitute and is not the same contract with the compositor" }),
    // ---- the three VBA actually has, each pointed at bytes ----------------------------------------------
    Object.freeze({ capability: "performance.now", has: true, evidence: "language",
        via: Object.freeze({ kind: "vba-source", token: "GetTickCount" }),
        note: "kernel32 GetTickCount, declared PtrSafe in vba/modGPUBrain.bas -- but at ~15.6ms it quantises to " +
              "a whole frame at 60fps, so it is the capability at a resolution that cannot time frames" }),
    Object.freeze({ capability: "fetch/XHR", has: true, evidence: "language",
        via: Object.freeze({ kind: "vba-source", token: "WinHttp.WinHttpRequest" }),
        note: "async HTTP needs no archive: modGPUBrain.bas drives WinHttp.WinHttpRequest.5.1 with a pile-up " +
              "guard, and the transmitter adds the SERVER half (manifest part `transmitter`) on top of that" }),
    Object.freeze({ capability: "WebGL", has: true, evidence: "archive",
        via: Object.freeze({ kind: "manifest", part: "engine", marker: "modGL_Declares" }),
        note: "the OpenGL render engine draws through real GL -- manifest part `engine`. THE ONLY ROW HERE " +
              "resting on the archive: the in-tree VBA contains no GL call, no WGL context and no D3D of any kind" }),
]);

/** Rows whose truth rests on the archive rather than on the language. The weakest claims, listed as such. */
export const archiveRows = () => VBA_SIDE.filter((r) => r.evidence === "archive");

/** What v4462 measured. Re-take with: node tools/ship/runtimeGap-selfcheck.mjs */
export const MEASURED_AT_V4462 = Object.freeze({
    // *** THESE ARE THE SHIPPED-STATE COUNTS, AND THE FIRST SET WAS TAKEN BEFORE THIS ROUND'S OWN FILES
    // EXISTED. *** Measured at 3,795 files / 21 threads / 3,387 closures; adding runtimeGap.mjs and its gate
    // moved every row by one or two and the ratio from 161 to 154. The gate re-derives the census on each run
    // against the tree AS IT SHIPS, so the pre-round numbers would have been red forever. v4424 shipped a
    // round whose census counted its own changelog; this is the same shape, caught by the check rather than
    // by luck, and the numbers below are the ones a reader can reproduce. They moved a second time when
    // origin/main was merged in before shipping -- TWICE, and the gate caught it both times. First v4449 and
    // v4450 (four rows, four files). Then TEN concurrent versions, v4452 to v4461, which moved five rows and
    // thirteen files and pushed the ratio from 154 to 155. Then v4463's own two files, one round later, moved
    // two more rows -- the FOURTH drift this table has survived, and the fourth time the gate named it. A table
    // read back rather than re-derived would have shipped the first set of numbers four times over. *** AND THE ROUND'S OWN NUMBER COLLIDED: *** a
    // concurrent session shipped a different v4451 and reached main first, so this round is v4462.
    //
    // *** AND A THIRD MERGE MOVED THEM AGAIN, WHICH IS THE POINT OF RE-DERIVING RATHER THAN READING BACK. ***
    // v4477 merged this round's branch, and the census grew by 54 files: 3814 -> 3868. Eight of the twelve rows
    // moved -- ES modules +54, closures +50, async/await +20, typed arrays +29, Promises +3, fetch/XHR +1,
    // WebGPU +10 -- and threads and WebAssembly did NOT, which is the finding surviving a 54-file arrival
    // rather than a claim needing protection. The ratio went 155 -> 157. The comment above says a table read
    // back rather than re-derived would have shipped the first set three times over; this is the fourth, and
    // the gate caught it every time. THE HEADLINE IS UNCHANGED: threads still rank eleventh of twelve.
    // AND A FIFTH TIME, one merge later: v4463 arrived while v4477 was verifying and added two more files
    // (3868 -> 3870, ES modules and closures +2 and +1). FIVE RE-DERIVATIONS, FIVE DIFFERENT TABLES, ONE
    // UNCHANGED HEADLINE -- threads have read 22 through every one of them. A row that survives five
    // independent populations is a finding; a row read back from the first would have been wrong five times.
    // v4487 -- 3887, MEASURED. A TENTH re-derivation in ten rounds, and the round that took it is the one
    // that measured how few frozen numbers anything checks -- THIS ONE IS CHECKED, by its own gate, on all
    // twelve rows, which v4462 fixed here after shipping with three. assertionShape shipped the identical
    // defect at v4480 and it was found by corruption rather than by reading. THREADS: 22 THROUGH ALL TEN.
    // v4485 -- 3885, MEASURED. A NINTH re-derivation in nine rounds. Two files added, and exactly two rows
    // moved by two: ES modules and closures. async/await did NOT move, because neither new file awaits --
    // a census whose rows all moved together under a two-file addition would be measuring the tree's size
    // rather than its capabilities. THREADS HAVE READ 22 THROUGH ALL NINE.
    // v4484 -- 3883, MEASURED. AN EIGHTH re-derivation in eight rounds. This round added ONE file and
    // touched five, so ES modules moved by one and closures by TWO -- the second is ui/stageInfo, which
    // gained a closure when its hardcoded path became a call. A census pinned to a file count cannot see
    // that, which is why it is re-taken and never incremented. THREADS HAVE READ 22 THROUGH ALL EIGHT.
    // v4483 -- 3882, MEASURED. A SEVENTH re-derivation in seven rounds. This round's two files are ES
    // modules using closures and NOT using await, so exactly two rows moved by two and ten did not move at
    // all -- and async/await stayed at 1342, which last round moved. A census whose rows all move together
    // under a two-file addition would be measuring the tree's size; two of twelve moving is the shape that
    // says the patterns discriminate. THREADS HAVE READ 22 THROUGH ALL SEVEN.
    // v4482 -- 3880, MEASURED, AND RE-TAKEN A SECOND TIME IN THE SAME ROUND: the first reading of 3879 was
    // taken after recordDrift.mjs existed and before its gate did, and it was stale by the time the file it
    // was measuring the cost of was finished. The ship verify caught it, not me. That is a SIXTH
    // re-derivation and the sixth different table -- and threads have still read 22 through every one.
    // It is also the exact record this round's own recordDrift.mjs does NOT check, for the reason recorded
    // there: this module has zero imports on purpose, so the walker cannot live in it and the drift
    // detector cannot see it. The one record left unwatched is the one that went stale.
    // And v4481's note on this line was WRONG: it said budgetMargin's two files
    // "sit outside the population that census walks", which is why the total had not moved. They are both in
    // the walked set -- checked directly -- so that explanation does not hold and I cannot reconstruct why
    // the earlier reading was 3878. What survives is the rule the wrong explanation was reaching for: this
    // number is MEASURED every round, never incremented from the last one, and a reason invented to explain a
    // count is worth less than re-taking it. FIVE ROUNDS RUNNING this table has been re-taken by hand.
    // v4536 -- RE-TAKEN AT THE MERGE: 4066 -> 4069. Both lines added files in the same window -- two here
    // for the partition scorer and one on main for the provenance gate -- and each side's note was right for
    // a tree holding only its own. Re-derived from the merged tree rather than summed from the two notes.
    // v4537 -- RE-TAKEN: 4071 -> 4073, the two files of the backlog-absence round.
    files: 4073,                  // v4526 merge: 3887 -> 4002, this branch's rounds; v4527: 4004; v4528: 4007; v4529: 4009; v4530: 4011; v4533: 4012 (ai-bridge/runBusy.js); v4536: 4014 (physics/mesh/uvUnwrap.mjs and its gate); v4537: 4016 (physics/mesh/uvLscm.mjs and its gate); v4539: 4018 (physics/render/splitSum.mjs and its gate); v4543: 4020 (nav/navmesh.mjs and its gate); v4544: 4022 (physics/character/terrainWalk.mjs and its gate); v4545: 4023 (tools/ship/navWiring-selfcheck.mjs); v4546: 4024 (tools/ship/navWiringLive-selfcheck.mjs; the harness is HTML and not counted); v4547: 4025 (tools/ship/engineSceneBot-selfcheck.mjs); v4548: 4029 (tools/ship/treeRead.mjs, tools/ship/recordReach.mjs and their two gates); v4550: 4031 (tools/export/glbConformance.mjs and its gate); v4552: 4033 (nav/detourScale.mjs and its gate; the terrain fixture is JSON and not counted); v4554: 4035 (world/surfaceProbe.mjs and its gate); v4555: 4036 (world/chunk-selfcheck.mjs; the module it gates already existed); v4556: 4038 (tools/ship/versionMarker.js and its gate -- .js RATHER THAN .cjs on purpose: this walk matches .js/.mjs and NOT .cjs, so the first draft of that module was invisible here and moved this count by one where a module-plus-gate round moves it by two); v4557: 4039 (tools/ship/ritualCoherence-selfcheck.mjs; the ritual it gates already existed); v4559: 4041 (ui/pipboyItems.mjs and its gate); v4560: 4043 (tools/mesh/xatlasRef.mjs and its gate; the C++ harness and the JSON record are neither .js nor .mjs and are not counted); v4563: 4044 (world/fluidSystem-selfcheck.mjs; the module it gates already existed); v4564: 4052 -- 4050 with NO NEW FILE, the walk starting to count the six .cjs modules it had never been able to see, then 4052 for tools/ship/sourceKind.mjs and its gate; v4566: 4056 for the incremental-sweep round -- tools/ship/inputProbe.mjs, tools/ship/inputSets.mjs, tools/ship/recordInputs.mjs and tools/ship/inputSets-selfcheck.mjs. FOUR files for one gate, which is unusual here and is the shape of the thing: the probe must be a SEPARATE module because it is loaded with --import into the gate being measured, the rule has to be importable by both the recorder and quickSweep, and the recorder is the expensive pass nobody wants inside the rule; v4567: 4062 for the loader-hook probe -- tools/ship/probe/{record,fsShim,fsPromisesShim,cpShim,cpWrap,hooks}.mjs. SIX files and NO new gate, which is the opposite of the usual shape: a module.register() hook needs its shims in their own directory so the hook can tell the shim's own import of the real builtin from everybody else's by a single prefix test, and the wrappers are shared between the ESM shim and the CJS patch so the two cannot make different judgements about the same spawn
                          // ROUNDS, THREE RE-TAKES, each caught by the ship gate rather than by me.
                          // RE-TAKEN TWICE IN TWO ROUNDS, and the second time only because the ship gate
                          // caught it: v4478's re-take was correct for v4478 and stale the moment v4479
                          // added its own two files. A twelve-row census pinned to a file count is a
                          // number every round that adds a module must re-take, which is the cost of
                          // pinning it and is paid here rather than loosened.
    // v4478 -- RE-TAKEN, not adjusted: physics/render/wgslArc.mjs and its gate are two more ES modules that
    // use closures and await, so three rows moved by exactly two each and the other nine did not move at all.
    // A census whose rows move together under a two-file addition would be measuring the tree's size rather
    // than its capabilities; three of twelve moving is the shape that says the patterns are discriminating.
    // v4526 MERGE -- RE-TAKEN on the merged tree, not adjusted: this branch's forty-six sidebar rounds (the device path,
    // Slug on the device, the sandbox on WebGPU, the racing city) are ES modules with closures and await, WebGL and WebGPU
    // consumers, and ONE more WebAssembly user (the racing pages load box3d's wasm in the browser) -- so ten of twelve rows
    // moved, raf and threads did not, and wasm passed threads by one: 23 against 22. The census is measuring capabilities
    // and this branch added capabilities, which is the shape the v4478 note above says a discriminating census should show.
    // v4527 -- RE-TAKEN: two files (physics/raceKnob.mjs and its gate) moved five rows by one to three each, the other seven not at all.
    // v4528 -- RE-TAKEN: three files (world/raceReplayBake.mjs, tools/ship/pngWrite.mjs, the gate) moved seven rows by one to three
    // each (the gate reads a WebGL2 canvas and times its runs; the encoder is typed arrays and a Promise-free node module).
    // v4529 -- RE-TAKEN: three files (world/ribbonRoad.mjs, race-terrain.html, the gate) moved eight rows by one or two (the page
    // fetches its listing and draws on WebGL2; the module is typed arrays and closures), the other four not at all.
    // v4530 -- RE-TAKEN: three files (world/crashDamage.mjs, race-crash.html, the gate) moved seven rows by one or two, fetch and
    // the other four not at all (the page fetches nothing: its city is built in the page).
    // v4533 -- RE-TAKEN: ONE file (ai-bridge/runBusy.js) moved ONE row by one, and none of the other eleven.
    // It is a table of five module paths and five small arrow predicates -- closures as values, and nothing
    // else: no fetch, no typed array, no timer. The narrowest re-take in this list, and it is here because
    // the census re-derives every row every run rather than trusting the twelve numbers below it.
    // v4536 -- RE-TAKEN: TWO files (physics/mesh/uvUnwrap.mjs and its gate) moved TWO rows by two, and none of
    // the other ten. Both are pure geometry -- imports, exports and arrow predicates over arrays, with no
    // fetch, no typed array, no timer and no GPU of any kind -- so ES modules and closures move together by
    // exactly the file count and nothing else does. Same shape as v4533's runBusy re-take, one file wider.
    // v4536 MERGE -- RE-TAKEN AGAIN after rebasing onto another line's v3904-v3906 and v4535: asyncAwait alone
    // moved, 1413 -> 1414, and the file total did not move at all. A census re-derived from the tree cannot be
    // merged; it has to be re-run on the merged tree, and the row that moved is the one that says which line's
    // work arrived rather than how much of it.
    // v4537 -- RE-TAKEN: TWO files (physics/mesh/uvLscm.mjs and its gate) moved THREE rows by two. ES modules
    // and closures again, and TYPED ARRAYS this time -- 788 -> 790 -- because a conformal solver carries
    // Float64Array coordinates and Int32Array index maps where the planar unwrapper carried plain arrays. The
    // row that moves says what the new code IS, which is the argument for re-deriving all twelve every run.
    // v4538 -- RE-TAKEN: typed arrays ALONE moved, 790 -> 792, and no other row. The two files are
    // physics/mesh/uvUnwrap.mjs and its gate, which gained Float32Array/Uint32Array when polysToMesh started
    // returning a mesh an exporter can take; nothing else about them changed shape. The row that moves says
    // what the new code IS, which is the argument for re-deriving all twelve every run.
    // v4539 -- RE-TAKEN: ES modules and closures by two (physics/render/splitSum.mjs and its gate) and NOTHING
    // else -- no typed arrays this time, because the split sum accumulates into plain numbers and returns plain
    // arrays; the LUT is a texture on a GPU and a pair of Arrays here. The row that does NOT move is as
    // informative as the one that does.
    // v4542 -- RE-TAKEN: asyncAwait 1414 -> 1415 and promises 343 -> 344, ONE file each and no other row --
    // tools/ship/shipRitual-selfcheck.mjs, which gained a single `await Promise.all(...)`. The round's other
    // three files (physics/mesh/meshCSG.mjs, its gate, and physics/mesh/uvUnwrap.mjs) moved NOTHING at all,
    // which is the informative half: an audit that adds a degenerate-triangle filter, eight boolean fixtures
    // and a ray-parity loop is arithmetic over arrays that were already there, so it changes no row of a
    // runtime-shape census. The two rows that DID move are the ones that say the ship gate started actually
    // LOADING the commands the handoff points at instead of matching their names -- the only genuinely new
    // runtime behaviour in the round, and the census found it without being told.
    // v4543 -- RE-TAKEN: ES modules and closures by two and TYPED ARRAYS by two (nav/navmesh.mjs and its
    // gate), and nothing else -- no async, no fetch, no timer, no GPU. Same shape as v4537's uvLscm re-take:
    // the typed-array row is what says the new code carries BUFFERS rather than plain arrays, which for a
    // distance transform over a quarter-million cells is the whole reason it finishes.
    // v4544 -- RE-TAKEN: ES modules and closures by two (physics/character/terrainWalk.mjs and its gate) and
    // typed arrays by ONE. *** THE NOTE HERE FIRST SAID TYPED ARRAYS DID NOT MOVE AT ALL, WRITTEN BEFORE THE
    // RE-RUN AND WRONG. *** The split is the interesting part and it took running to see: the MODULE
    // allocates none -- it reads a heightfield somebody else owns, takes a BVH somebody else built, and
    // returns plain triples -- and its GATE allocates them, for the fixtures it constructs. v4543's navmesh
    // moved this row by two because the algorithm itself carries a distance field. Two files either time,
    // and the row distinguishes code that OWNS buffers from code that is merely handed them.
    // v4545 -- RE-TAKEN, and the numbers below were WRITTEN AS A GUESS FIRST AND WERE WRONG ON THREE ROWS.
    // I predicted the wiring round's shape from the diff -- one new gate, four edited files -- and got ES
    // modules, typed arrays and Promises each off by one, in BOTH directions. The gate caught all three at
    // once. What actually moved: ES modules and closures by two (the new gate imports, and BotManager gained
    // an import it did not have), asyncAwait by one (the gate's top-level await on the worker), and typed
    // arrays and Promises NOT AT ALL -- BotManager already allocated neither, and the worker already
    // returned a Promise. This is the second consecutive round in which a census note written before the
    // re-run was wrong, which is the argument for re-running rather than reasoning about a diff.
    // v4552 -- RE-TAKEN: TWO files (nav/detourScale.mjs and its gate) moved ES modules and closures by two
    // and TYPED ARRAYS BY ONE, and nothing else -- no async, no fetch, no GPU. The typed-array row is the
    // informative one again and it splits the pair exactly the way v4544 recorded: the MODULE owns buffers
    // (Float64Array distances and an Int32Array predecessor map for a Dijkstra over 9,216 cells) and the
    // GATE does not -- it builds Int16Array fixtures, which is being HANDED buffers rather than owning them.
    // v4550 -- RE-TAKEN: TWO files (tools/export/glbConformance.mjs and its gate) moved FOUR rows by two --
    // ES modules, closures, async/await and TYPED ARRAYS -- and nothing else. The typed-array row is the
    // informative one and it is the shape v4537 and v4543 recorded: a module that OWNS buffers moves it, one
    // merely handed them does not. A glTF validator reads a BIN chunk through a DataView and reconstructs
    // accessor data, so it owns them. asyncAwait moves because the gate top-level-awaits its dynamic imports.
    // No Promises row, no fetch, no GPU: a file-format checker is arithmetic over bytes.
    // v4548 -- RE-TAKEN off the gate. FOUR files (treeRead.mjs, recordReach.mjs and their gates) moved TWO
    // rows by four and NOTHING ELSE -- no async, no typed arrays, no Promises, no GPU. That is the narrowest
    // shape a four-file round can have here, and it is the right one: this round is a filesystem walk, a
    // memo and a join over two tables, which is imports and closures and nothing more exotic. Compare
    // v4543's navmesh, four files that also moved typed arrays because the algorithm carries buffers.
    // v4547 -- RE-TAKEN off the gate, and THE ROW THAT MOVED MOST HAD NOTHING TO DO WITH THE ROUND. One new
    // file, tools/ship/engineSceneBot-selfcheck.mjs, moved four rows by one -- ES modules, closures,
    // async/await and Promises (it awaits a browser and wraps srv.listen in `new Promise`). It also moved
    // WebGL by one, and that is what made this re-take worth more than a re-type: THE ONLY WebGL TOKEN IN THE
    // FILE IS THE CHROMIUM LAUNCH FLAG `--enable-webgl`. Measured across the tree, 13 of the 155 files this
    // row scored matched on nothing else -- every one a gate that DRIVES a browser rather than code that
    // touches a context. The pattern gained a lookbehind and the row went 155 -> 141, an 8.4% correction to a
    // number that has been recorded and re-recorded for eighty-five rounds. *** THE CENSUS'S OWN HEADER HAS
    // SAID SINCE v4462 THAT COMMENT-STRIPPING MOVED THE HEADLINE ROW BY A THIRD; this is the same defect one
    // layer in, and it survived because every previous re-take checked whether the number CHANGED, never what
    // the number was counting. *** The 3.9% -> 3.5% shift does not touch the finding: threads still rank 12.
    // v4546 -- RE-TAKEN, and this time the numbers were READ OFF THE GATE rather than predicted, which is
    // what the note above says the previous two rounds should have done. ES modules and closures by one and
    // asyncAwait by one -- ONE new file, tools/ship/navWiringLive-selfcheck.mjs, which imports, closes over
    // its helpers and awaits a browser. The harness it drives is HTML and does not enter this census at all,
    // which is why the file count moves by one where a module-plus-gate round moves it by two.
    // v4560 -- RE-TAKEN: TWO files (tools/mesh/xatlasRef.mjs and its gate) moved ES modules and closures by two
    // and NOTHING else, and the row that DID NOT move is the finding. Both files allocate typed arrays and
    // little else -- the reference harness marshals vertices and indices across a process boundary -- and the
    // typed-array row sat still, because the pattern named seven of the eleven constructors and neither of the
    // two these use was among them. Widened above; the row goes 798 -> 1031 on the same tree, 233 files it had
    // never counted. THE OTHER ELEVEN ROWS ARE UNAFFECTED by that widening, which is what says it is this row's
    // definition rather than the census's population that moved, and threads still rank 12 of 12.
    // v4561 -- RE-TAKEN: no new files, ONE row moved by one. tools/mesh/xatlasRef-selfcheck.mjs gained a
    // fixture built on a 64-bit float array, and that row now counts the 64-bit float array because v4560
    // widened it. A census that had been re-taken for ninety rounds moving for a NEW reason one round after
    // the definition was corrected is the definition doing its job.
    // v4563 -- RE-TAKEN: ONE file (world/fluidSystem-selfcheck.mjs; the module it gates already existed)
    // moved two rows by one and nothing else. No typed arrays, no async, no GPU: a voxel fluid graded on a
    // hand-built chunk is arithmetic over a flat array somebody else owns.
    // v4564 -- RE-TAKEN, AND THE POPULATION GREW WITHOUT A FILE BEING WRITTEN: 4,044 -> 4,050. The walk's
    // extension rule was mjs and js, and ".cjs" matches NEITHER -- the dot is part of the pattern, so it is
    // not ".js" with a c in front. Six modules in ai-bridge/ are CommonJS, 1,471 lines, every one `require`d
    // by ai-bridge/server.js at startup, and no census in this tree had counted a line of them. THE ROW THAT
    // SAYS IT MATTERS IS TYPED ARRAYS, 1,032 -> 1,034: two of the six own buffers, which is the distinction
    // this census's own notes keep making between a module that carries data and one that is handed it.
    // ES modules does NOT move, which is the control -- CommonJS files do not import or export, so a census
    // that counted them as ES modules would be measuring its own walk rather than the tree.
    // v4564 -- RE-TAKEN a second time in the same round: TWO files (tools/ship/sourceKind.mjs and its gate)
    // moved ES modules and closures by two and nothing else. The .cjs correction above and these two files
    // are separate movements of the same row and are recorded as two, because folding them into one number
    // would lose which of them was the finding.
    // v4566 -- RE-TAKEN: four files, and FOUR rows move rather than the usual two. async/await and Promises
    // each gain one, from tools/ship/recordInputs.mjs's async worker pool over a promise-wrapped spawn --
    // the pass that probes what every gate reads. A round that adds concurrency to the ship tooling shows up
    // in the census of what this runtime uses, which is what the census is for.
    // v4567 -- RE-TAKEN: six files, three rows. async/await gains one from the loader hook's async resolve
    // and load hooks, which is the census noticing that this tree now has code running on a loader thread.
    // v4568 -- RE-TAKEN: Promises 348 -> 349 and nothing else. No new FILE, so files, ES modules and
    // closures do not move -- one existing module grew a promise, and it is sweepCoverage-selfcheck.mjs:
    // `await new Promise((r) => setTimeout(r, 400))`, waiting for a capped kill to land before counting the
    // survivors it leaves. The narrowest re-take this census has had, and it is still a re-take.
    //
    // MY FIRST DRAFT OF THIS LINE BLAMED redCensus-selfcheck, because that was the other file this round
    // made slower and the guess felt close enough to write down. The diff says zero `new Promise` were added
    // outside sweepCoverage-selfcheck. A one-row census drift is exactly where a plausible attribution goes
    // unchecked, which is what a census is for.
    // v4569 -- RE-TAKEN: one file, one row. render/exactHash.mjs is the shared home for the integer hash
    // that replaces fract(sin(dot(p,K))*43758.5453); closures does not move because the module exports named
    // functions rather than storing any, which is the distinction this census keeps making.
    // v4569 -- RE-TAKEN a second time in the round: tools/ship/exactHash-selfcheck.mjs joined, moving files
    // 4063 -> 4064 and three rows by one. async/await moves because the gate awaits a dynamic import of the
    // wormhole module -- it reads the EXPORTED shader strings rather than the file text, since codeOnly
    // deletes shader template literals and a scan through it would have passed on an empty string.
    // v4570 -- RE-TAKEN: closures 3644 -> 3645 and nothing else. No new FILE; fx/nebula/nebula.js's hash2
    // went from a function DECLARATION to a const arrow bound to exactHash2, and this census counts a
    // function stored as a value rather than declared. The narrowest kind of move it records, and it records
    // it -- a row that only moved on new files would miss every refactor.
    // v4572 -- RE-TAKEN: ES modules 3766 -> 3768 and closures-as-values 3645 -> 3647, for the two
    // files of the record-shape round (tools/ship/recordShape.mjs and its gate). Two files, two
    // modules, and two closures apiece is what a module-plus-gate round looks like here.
    // v4572b -- RE-TAKEN: ES modules 3768 -> 3769 and closures 3647 -> 3648, for the provenance gate.
    // ONE file rather than the usual two: it gates tools/ship/orphanScan.mjs, which already existed.
    // v4573 -- RE-TAKEN: ES modules 3769 -> 3771, closures 3648 -> 3650, async/await 1423 -> 1425,
    // for tools/ship/importClosure.mjs and its gate. async/await moves because both await a dynamic
    // import of the module under test -- which is the very construct the round is about.
    // v4536 -- RE-TAKEN AGAIN AT THE MERGE, the SECOND merge in two rounds where both lines re-took this
    // same table. Each side's note is right for a tree holding only its own new files and neither is right
    // for the tree holding both, so the numbers below are RE-DERIVED FROM THE MERGED TREE, never summed
    // from the two notes -- the two rounds moved different rows and the overlap is not the sum.
    // THE CONSTRUCTOR NAMES ARE NOT SPELT in this note on purpose: the census strips comments but NOT
    // strings, and a previous round moved the typed-array row 795 -> 796 on the strength of prose.
    // v4537 -- RE-TAKEN: ES modules 3773 -> 3775 and closures 3652 -> 3654, for the two files of the
    // backlog-absence round. The typed-array row does NOT move: that module reads and counts, it does not
    // carry a buffer, which is the difference from the partition scorer two rounds back.
    esModules: 3775, closures: 3654, asyncAwait: 1425, typedArrays: 1036, promises: 349,

    fetchXhr: 243, performanceNow: 220, raf: 116, webgl: 141, webgpu: 48, threads: 22, wasm: 23,
    // *** ALL TWELVE ARE CHECKED, NOT THREE. *** The gate's first draft re-derived the census and then
    // compared only files/threads/closures against it, so nine of these were decoration -- and asyncAwait was
    // already stale by one when this round's own note strings landed. Every row below is now a red if it drifts.
    threadsRank: 12,              // of 12, biggest first -- SMALLEST at the v4526 merge (second-smallest at v4462: the merge added one WebAssembly user, and 23 passes 22)
    // *** THE MODULE THAT DEFINES THE CENSUS MATCHES EVERY SINGLE ONE OF ITS OWN TWELVE PATTERNS. ***
    // Not five rows -- all twelve. runtimeGap.mjs holds the PATTERNS table, so the literal text of every
    // regex sits in it (`Float32Array`, `new Promise`, `fetch(`, `WebAssembly`, ...), and a regex source is a
    // string, which is prose the comment strip cannot reach. Its gate imports it and adds the names again.
    // So the census's own instrument is a maximal false positive for itself, and the counts above include it:
    selfCount: Object.freeze({
        "ES modules": 2, "closures as values": 2, "async/await": 1, "typed arrays": 1, "Promises": 1,
        "fetch/XHR": 1, "performance.now": 2, "requestAnimationFrame": 2, "WebGL": 1, "WebGPU": 1,
        "workers/threads": 1, "WebAssembly": 2,
    }),
    // The finding is unharmed -- it is a two-file distortion in rows of 22 to 3,506 -- but it must be stated,
    // not discovered later. Without this round's files WebAssembly is 20 and threads 21, so threads are
    // second-smallest outright; WITH them the two tie at 22 and threads hold rank 11 on the stable sort only.
    wasmWithoutSelf: 21,          // v4526 merge: 20 -> 21
    threadsWithoutSelf: 21,
    closuresOverThreads: 166,     // 3643 / 22 at v4567 (165 at v4552: 3619 / 22 (164 at v4530: 3597 / 22; 163 at v4527: 3588 / 22; 158 at v4462: 3465 / 22) -- a DERIVED ratio, so it moves whenever either row does, which is why it is re-taken rather than pinned once
    // *** ONE, NOT TWO. *** The first draft filed fetch/XHR as an archive claim too; pointing the rows at
    // bytes found the HTTP client sitting in this tree's own VBA, so only WebGL still needs the archive.
    archiveRows: 1,
    hasRows: 3,                   // performance.now, fetch/XHR, WebGL -- and every one names a corroborator
    // Also wrong in the first draft, at 8, and unchecked -- exactly the frozen-number-nobody-re-takes shape
    // this file's own header complains about. Nine of the twelve rows are language facts of absence.
    languageRowsAbsent: 9,
});
