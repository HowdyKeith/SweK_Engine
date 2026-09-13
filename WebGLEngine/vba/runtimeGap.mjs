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
    "typed arrays":          /(Float32Array|Uint8Array|Uint16Array|Int32Array|ArrayBuffer|DataView|Uint8ClampedArray)/,
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
    // *** v4551 -- THIS LINE WAS WRONG AND STOOD FOR TWENTY-FIVE ROUNDS. *** It claimed the pattern still
    // matched its own source text, "which the self-match row needs". Measured: it did not. `webgl2?["')]`
    // against the literal `webgl2?["')]` fails -- after `webgl` the next character is `2` and then `?`, and
    // `?` is not one of the four the class allows. The self-match row kept passing because it derives over
    // runtimeGap.mjs AND its gate, and the gate matched WebGL on its own; the module was 11 of 12, not 12.
    // Found by adding CENSUS_FIELDS below, whose `"webgl"` value DOES match and took the module to 12 of 12.
    "WebGL":                 /((?<![-\w])webgl2?["')]|WebGL2?RenderingContext)/,
    "WebGPU":                /(navigator\.gpu|requestAdapter)/,
    "workers/threads":       /(new Worker|SharedArrayBuffer|Atomics\.|worker_threads)/,
    "WebAssembly":           /WebAssembly/,
});

/**
 * PATTERN LABEL -> the field MEASURED_AT_V4462 records it under, in PATTERNS order.
 *
 * *** THIS LIVES HERE AND NOT IN THE CHECKER, AND THE REASON IS A MEASUREMENT. *** v4551 added a
 * runtimeGap row to tools/ship/recordDrift.mjs's pre-flight and wrote the mapping there, as a literal
 * table of label strings. Running it moved two of the rows it was checking -- performance.now 220 -> 221
 * and requestAnimationFrame 116 -> 117 -- because the census greps FILE TEXT for those exact words and the
 * checker had just written them into a .mjs in the walked set. *** A DRIFT DETECTOR THAT CHANGES THE NUMBER
 * IT DETECTS IS NOT A DETECTOR. *** Moving it here is the right call for a second reason -- name the thing
 * once, in the file that owns both tables -- but the first reason written down for it was WRONG, and the
 * measurement is below. It said the strings cost nothing here because this file already matches all twelve
 * of its own patterns. It matched ELEVEN. The WebGL row's lookbehind (added later, and worth 13 files)
 * stopped the pattern matching its own source text, so the only WebGL hit in the pair came from the GATE,
 * and the self-match row's headline names the module while its derivation covers both files. Writing
 * `"WebGL": "webgl"` here made this file match too: WebGL 141 -> 142, selfCount 1 -> 2. So the label table
 * DID cost a row, one, and the honest description of that is not "no effect" but "one row, in the module
 * the row is about, which is where a self-inflicted count is least likely to be mistaken for the tree.
 */
export const CENSUS_FIELDS = Object.freeze({
    "ES modules": "esModules", "closures as values": "closures", "async/await": "asyncAwait",
    "typed arrays": "typedArrays", "Promises": "promises", "fetch/XHR": "fetchXhr",
    "performance.now": "performanceNow", "requestAnimationFrame": "raf",
    "WebGL": "webgl", "WebGPU": "webgpu", "workers/threads": "threads", "WebAssembly": "wasm",
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
    files: 4080,                  // v4526 merge: 3887 -> 4002, this branch's rounds; v4527: 4004; v4528: 4007; v4529: 4009; v4530: 4011; v4533: 4012 (ai-bridge/runBusy.js); v4536: 4014 (physics/mesh/uvUnwrap.mjs and its gate); v4537: 4016 (physics/mesh/uvLscm.mjs and its gate); v4539: 4018 (physics/render/splitSum.mjs and its gate); v4543: 4020 (nav/navmesh.mjs and its gate); v4544: 4022 (physics/character/terrainWalk.mjs and its gate); v4545: 4023 (tools/ship/navWiring-selfcheck.mjs); v4546: 4024 (tools/ship/navWiringLive-selfcheck.mjs; the harness is HTML and not counted); v4547: 4025 (tools/ship/engineSceneBot-selfcheck.mjs); v4548: 4029 (tools/ship/treeRead.mjs, tools/ship/recordReach.mjs and their two gates); v4550: 4031 (tools/export/glbConformance.mjs and its gate); v4551: 4045 -- FOURTEEN files at once, because this record was not re-taken for the five rounds of the FSR arc; v4552: 4048 (render/temporalReject.mjs, its WGSL and its gate); v4553: 4051 (render/temporalLock.mjs, its WGSL and its gate); v4554: 4052 (one gate; the round extended two existing modules rather than adding any); v4555: 4053 (the same shape again -- one gate, two modules extended); v4556: 4054 (and again -- three rounds running); v4557: 4055 (four); v4558: 4056 (five); v4559: 4057 (six); v4560: 4060 -- THREE, the first round of the arc to add a module, a kernel and a gate at once; v4561: 4061 (one gate; the round changed the shared harness rather than adding a module); v4562: 4062 (one gate; the round extended ringFloor and its kernel rather than adding a module); v4563: 4063 (one gate; the round extended ringFloor and temporalLock rather than adding a module); v4564: 4064 (one gate; the round added a phase form to ringFloor rather than a module); v4565: 4065 (one gate; the round composed a second step bound into ringFloor rather than adding a module); v4566: 4066 (one gate; the round gated ringFloor's ring term rather than adding a module); v4567: 4067 (one gate; the round added a yawing fixture and a row to motionVectors rather than a module); v4568: 4068 (one gate; the round added quantiles to ringFloor rather than a module); v4569: 4069 (one gate; the round brought the kernel up rather than adding a module); v4570: 4070 (one gate; the round audited the arc's twelve kernels rather than adding a module); v4571: 4071 (one gate; the round measured what a half-texel fixture hides and built the shape row rather than adding a module); v4572: 4073 -- TWO, a gate and tools/ship/temporalCorpus.mjs, the first round of this arc to add a module since v4560; v4573: 4073 (no new file; the round widened three existing gates); v4574: 4074 (one gate); v4575: 4075 (one gate); v4576: 4076 (one gate); v4577: 4077 (one gate); v4578: 4078 (one gate); v4579: 4079 (one gate); v4580: 4080 (one gate) -- AND THE workers/threads ROW DID NOT MOVE, WHICH TOOK AN EDIT TO THE ARRIVING GATE. Its first draft asserted that tools/ship/selfchecks.mjs contains no /parallelWorkers|new Worker\\(/, and the literals in that regex put the gate into THIS census's workers/threads bucket -- a MENTION counted as a USE, which would have taken closuresOverThreads from 166 to 159 and made this module's headline finding turn on a file that spawns nothing. The row was rewritten to require a SYNCHRONOUS spawn instead, which is the stronger property anyway: execFileSync in a sequential loop cannot be concurrent, and no absence needs asserting. The detector is unchanged and still counts mentions; this is recorded as its known limit rather than papered over
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
    // v4551 -- RE-TAKEN, AND FIVE ROUNDS LATE. *** THE RECORD WAS RED FOR FIVE CONSECUTIVE ROUNDS AND NOTHING
    // RAN IT. *** The FSR arc added fourteen files (fsr.js, fsrKernels.js, motionVectors.mjs, motionVectorsWgsl,
    // jitter.mjs, temporalAccumulate.mjs + Wgsl, temporalResolve.mjs + Wgsl, five gates, and three-probe.json)
    // and every one of those rounds ran gateSweep, instruments and sweepCoverage and called that the ritual.
    // This record is not in that set and neither is assertionShape's, so both drifted silently and in step.
    // v4548 already shipped a round titled "the ship ritual does not check half its own records"; the repair
    // there re-took the records and did not make the ritual reach them, and here is the same fault again.
    // FOUR of twelve rows moved and EIGHT did not, which is the discriminating shape this census exists for:
    // ES modules +14 (every file imports), closures +8, async/await +4, typed arrays +11 -- an upscaler owns
    // Float32Arrays, so the typed-array row nearly tracks the file count, the same signature v4537, v4543 and
    // v4550 recorded for modules that OWN buffers rather than being handed them. *** AND WebGPU DID NOT MOVE,
    // WHICH IS THE ROW I WOULD HAVE PREDICTED WRONG. *** Three of these files are WGSL kernels and three of the
    // gates run on a real device -- but the pattern is /(navigator\.gpu|requestAdapter)/ and every one of them
    // reaches the device through gfx/device.js or the ship harness. The census counts files that ASK FOR an
    // adapter, not files that use one, and a round that added the tree's first real temporal upscaler moved
    // that row by zero. Promises, fetch, performance.now, raf, WebGL, threads and wasm also held.
    // v4552 -- RE-TAKEN, and by the pre-flight's own prompting rather than by a search. THREE files moved four
    // rows by DIFFERENT amounts, which is the shape this census exists to show and a files-only check could
    // not: ES modules +3 (all three import), closures +2, async/await +1, typed arrays +2. The file that moves
    // only the first row is render/temporalRejectWgsl.mjs -- a module whose entire content is template strings
    // holding WGSL. It has no closure, no await and no Float32Array, because the code it carries does not run
    // in this language at all. Eight rows held, WebGPU among them, for the same reason v4551 recorded: these
    // kernels reach the device through gfx/device.js and never ask for an adapter themselves.
    // v4553 -- RE-TAKEN. Three files again, and the SAME four rows by the same amounts as v4552: ES modules
    // +3, closures +2, async/await +1, typed arrays +2. Twice running the WGSL module has moved only the
    // import row, which is now a pattern rather than an observation: a file whose whole content is template
    // strings of another language carries none of this one's capabilities.
    // v4554 -- RE-TAKEN. ONE file this time, not three: the round added a gate and extended
    // render/temporalLock.mjs and its WGSL in place rather than adding modules. The same four rows moved by
    // ONE each, which is the single-gate shape v4545 and v4547 recorded -- and it is worth noting that a round
    // whose whole subject is a new capability moved this census by exactly as much as a round that only added
    // a checker, because what this table counts is files and their imports, not what a round is about.
    // v4555 -- RE-TAKEN. One file, the same four rows by one, exactly as v4554: the round added a gate and
    // extended render/temporalLock.mjs and its WGSL in place. TWO ROUNDS RUNNING with an identical footprint
    // in this census and completely different subjects, which is the limit of what a file-and-import census
    // can say and is worth stating rather than reading the sameness as a sign the rounds were alike.
    // v4556 -- RE-TAKEN. THREE ROUNDS RUNNING with an identical footprint here: one gate, the same four rows
    // by one, two existing modules extended in place. v4555's note said two rounds of sameness was the limit
    // of what a file-and-import census can say; a third makes the point harder, because this round CHANGED A
    // PRIMITIVE THREE OTHER GATES READ and rewrote three WGSL kernels, and this table cannot see any of it.
    // That is not a defect in the census -- it counts files and imports and says so -- but a reader taking
    // these four numbers as a measure of a round's reach would be reading them for something they do not do.
    // v4557 -- RE-TAKEN. Four rounds running with an identical footprint. v4556's note already said this
    // table cannot see a round's reach; this round is the sharpest example yet, because its subject is a
    // NUMBER -- a margin that was never derived -- and a census of files and imports has no row that could
    // ever move for that.
    // v4558 -- RE-TAKEN. Five rounds running with an identical footprint, and this one is the strongest
    // case yet that the sameness means nothing: the round's subject was that a PREVIOUS round measured
    // against the wrong reference and overstated a number by five orders of magnitude. Not one row here
    // could move for that, and none did.
    esModules: 3789, closures: 3657, asyncAwait: 1438, typedArrays: 833, promises: 345,
    fetchXhr: 243, performanceNow: 220, raf: 116, webgl: 142, webgpu: 48, threads: 22, wasm: 23,
    // *** ALL TWELVE ARE CHECKED, NOT THREE. *** The gate's first draft re-derived the census and then
    // compared only files/threads/closures against it, so nine of these were decoration -- and asyncAwait was
    // already stale by one when this round's own note strings landed. Every row below is now a red if it drifts.
    threadsRank: 12,              // of 12, biggest first -- SMALLEST at the v4526 merge (second-smallest at v4462: the merge added one WebAssembly user, and 23 passes 22)
    // *** THE MODULE THAT DEFINES THE CENSUS MATCHES EVERY SINGLE ONE OF ITS OWN TWELVE PATTERNS. ***
    // Not five rows -- all twelve. *** AND THAT SENTENCE WAS FALSE OF THE MODULE FROM THE ROUND THE WebGL
    // LOOKBEHIND LANDED UNTIL v4551, WHICH IS THE FINDING. *** This table is derived over TWO files --
    // runtimeGap.mjs and its gate -- so a row the GATE alone inflates still shows a 1, and WebGL was exactly
    // that: 1, from the gate, while the module missed its own pattern. The row's headline names one file and
    // its arithmetic covers two, and nothing noticed because the number it compares against was recorded
    // from the same two files. v4551's CENSUS_FIELDS made the module match as well, so WebGL is now 2 and
    // the sentence is true for the first time -- by accident, while writing something else.
    // *** WHAT WOULD HAVE CAUGHT IT: *** a row asserting the count PER FILE rather than for the pair. Not
    // added here, because it is a different round's work and this one already grew past its rung; recorded
    // so it is not rediscovered. runtimeGap.mjs holds the PATTERNS table, so the literal text of every
    // regex sits in it (`Float32Array`, `new Promise`, `fetch(`, `WebAssembly`, ...), and a regex source is a
    // string, which is prose the comment strip cannot reach. Its gate imports it and adds the names again.
    // So the census's own instrument is a maximal false positive for itself, and the counts above include it:
    selfCount: Object.freeze({
        "ES modules": 2, "closures as values": 2, "async/await": 1, "typed arrays": 1, "Promises": 1,
        "fetch/XHR": 1, "performance.now": 2, "requestAnimationFrame": 2, "WebGL": 2, "WebGPU": 1,
        "workers/threads": 1, "WebAssembly": 2,
    }),
    // The finding is unharmed -- it is a two-file distortion in rows of 22 to 3,506 -- but it must be stated,
    // not discovered later. Without this round's files WebAssembly is 20 and threads 21, so threads are
    // second-smallest outright; WITH them the two tie at 22 and threads hold rank 11 on the stable sort only.
    wasmWithoutSelf: 21,          // v4526 merge: 20 -> 21
    threadsWithoutSelf: 21,
    closuresOverThreads: 166,     // 3656 / 22 at v4579, still 166; 3655 / 22 at v4578, still 166; 3654 / 22 at v4577, still 166; 3653 / 22 at v4576, still 166; 3652 / 22 at v4575, still 166; 3651 / 22 at v4574, still 166; 3650 / 22 at v4572, still 166; 3648 / 22 at v4571, still 166; 3647 / 22 at v4570, still 166; 3646 / 22 at v4569, still 166; 3645 / 22 at v4568, still 166; 3643 / 22 at v4567, still 166; 3642 / 22 at v4566, still 166; 3641 / 22 at v4565 -- MOVED, 165 -> 166, first time since v4551, and runtimeGap-selfcheck caught the stale value rather than a reader; 3640 / 22 at v4564; 3639 / 22 at v4563; 3638 / 22 at v4562; 3637 / 22 at v4561; 3636 / 22 at v4560; 3635 / 22 at v4559; 3634 / 22, rounded at v4551 (164 at v4530: 3597 / 22; 163 at v4527: 3588 / 22; 158 at v4462: 3465 / 22)
    // *** ONE, NOT TWO. *** The first draft filed fetch/XHR as an archive claim too; pointing the rows at
    // bytes found the HTTP client sitting in this tree's own VBA, so only WebGL still needs the archive.
    archiveRows: 1,
    hasRows: 3,                   // performance.now, fetch/XHR, WebGL -- and every one names a corroborator
    // Also wrong in the first draft, at 8, and unchecked -- exactly the frozen-number-nobody-re-takes shape
    // this file's own header complains about. Nine of the twelve rows are language facts of absence.
    languageRowsAbsent: 9,
});
