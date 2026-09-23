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
    // *** v4623 -- RE-TAKEN 4160 -> 4163 for render/murmurKit.mjs, render/murmurKitTsl.mjs and
    // tools/ship/murmurKit-selfcheck.mjs. esModules, closures and asyncAwait move with them by construction.
    // *** THE WebAssembly ROW (23 -> 24) IS NOT THIS ROUND'S AND IS NOT REPORTED AS IF IT WERE. *** It was
    // already red on a clean checkout of d2388463 -- verified by stashing this round's work entirely and
    // re-running the gate, which still failed on that one row and only that one row. Absorbing another
    // round's drift into this round's numbers without saying so would make the next reader believe five rows
    // moved here when four did.
    //
    // *** AND IT WAS A HALF-FINISHED RE-TAKE RATHER THAN A MISSED ONE, WHICH IS THE MORE INTERESTING SHAPE. ***
    // The v4622 merge DID notice: the rank note below says in so many words "WebAssembly moved to 24 (one
    // file...)" and re-took the DERIVED rank from 11 to 12 on that basis. The census row it derives FROM was
    // left at 23. So one record in this file said 24 and another said 23 for as long as nothing re-ran the
    // gate -- a derived number updated past the measurement it is derived from. The row is corrected here
    // because a red on a number nobody disputes would block every later round for a fact already agreed.
    // v4626: 4163 -> 4164 for tools/ship/murmurSpecies-selfcheck.mjs, the species gate split out of
    // murmurKit-selfcheck so neither crosses the ship-time budget as the remaining fifteen land.
    // v4627: 4164 -> 4165 for tools/ship/fixtures/tslBuilderThrows.mjs -- ONE file for a round that shipped a
    // module's worth of colour rail, because the rail went into files that already existed. The one new file
    // is a FIXTURE: a TSL builder that throws on purpose, so the row asserting that a shader which failed to
    // build is a failed render has a subject that actually fails to build. esModules and closures moved with
    // it; nothing else did, and the WebAssembly/threads rank below is untouched.
    // v4630: 4165 -> 4167 for tools/ship/murmurSpecies2-selfcheck.mjs and tools/ship/murmurSpeciesFrames.mjs,
    // the species-gate split made BEFORE the species that would have crossed the budget. Two files for ONE
    // new gate, which is the shape of a split done properly: the second gate, and the shared measurements
    // both gates import rather than each keeping a copy free to drift.
    // v4632: 4167 -> 4169 for TWO gates. tools/ship/murmurSpecies3-selfcheck.mjs carries opal and abyss, the
    // fifth and sixth of murmur's eighteen; tools/ship/murmurSpecies4-selfcheck.mjs carries droplet, split
    // out of gate two in the same round because its swell pair cost a PAIRED 206-287 ms against a 3,000 ms
    // ceiling. Neither needed a module beside it: the measurements they use were already in
    // tools/ship/murmurSpeciesFrames.mjs, which is what the v4630 split was for -- so this count moved by two
    // where a module-plus-gate round moves it by two per SUBJECT.
    // v4634: 4169 -> 4170 for tools/ship/murmurSpecies5-selfcheck.mjs (nebula and tempest). ONE file for
    // TWO species and no module beside it -- the pair needed nothing the kit did not already have, which is
    // what v4623's kit round and v4629's mh_surface round were for.
    // *** v4645 -- THE MERGE PRODUCED TWO `files:` KEYS IN THIS ONE FROZEN OBJECT AND JS TOOK THE
    // SECOND SILENTLY. *** Both lines' rounds re-took the count and each wrote its own field; taking
    // one side of one conflict hunk and keeping the other side's elsewhere left them both in. A
    // duplicate key is not a merge artefact you can see in a diff -- the file parses, the record
    // freezes, and the earlier number is simply gone. main's per-round chain is kept here as PROSE so
    // nothing is lost, and the single live field is below.
    // main's chain: v4644 -- RE-TAKEN 4182 -> 4184 for the two SUCCESS-flash gates.  // v4641 -- RE-TAKEN 4180 -> 4182 for the two mh_live gates.  // v4640 -- RE-TAKEN 4178 -> 4180 for the two prism/helix gates.  // v4639 -- RE-TAKEN 4176 -> 4178 for the two duet/chorus gates.  // v4638 -- RE-TAKEN 4174 -> 4176 for the two aura/flux gates.  // v4637 -- RE-TAKEN 4172 -> 4174 for the two arc/sol gates.  // v4636 -- RE-TAKEN 4170 -> 4172 for the two fathom/geode gates.  // v4622-merge-b -- RE-TAKEN after the actual merge landed: 4135 -> 4160.
                                   // shared history through v4582: 4079 for tools/ship/zipWriter-selfcheck.mjs (commit c3f1fecb's, not either branch's own round) -- v4526 merge: 3887 -> 4002, this branch's rounds; v4527: 4004; v4528: 4007; v4529: 4009; v4530: 4011; v4533: 4012 (ai-bridge/runBusy.js); v4536: 4014 (physics/mesh/uvUnwrap.mjs and its gate); v4537: 4016 (physics/mesh/uvLscm.mjs and its gate); v4539: 4018 (physics/render/splitSum.mjs and its gate); v4543: 4020 (nav/navmesh.mjs and its gate); v4544: 4022 (physics/character/terrainWalk.mjs and its gate); v4545: 4023 (tools/ship/navWiring-selfcheck.mjs); v4546: 4024 (tools/ship/navWiringLive-selfcheck.mjs; the harness is HTML and not counted); v4547: 4025 (tools/ship/engineSceneBot-selfcheck.mjs); v4548: 4029 (tools/ship/treeRead.mjs, tools/ship/recordReach.mjs and their two gates); v4550: 4031 (tools/export/glbConformance.mjs and its gate); v4552: 4033 (nav/detourScale.mjs and its gate; the terrain fixture is JSON and not counted); v4554: 4035 (world/surfaceProbe.mjs and its gate); v4555: 4036 (world/chunk-selfcheck.mjs; the module it gates already existed); v4556: 4038 (tools/ship/versionMarker.js and its gate -- .js RATHER THAN .cjs on purpose: this walk matches .js/.mjs and NOT .cjs, so the first draft of that module was invisible here and moved this count by one where a module-plus-gate round moves it by two); v4557: 4039 (tools/ship/ritualCoherence-selfcheck.mjs; the ritual it gates already existed); v4559: 4041 (ui/pipboyItems.mjs and its gate); v4560: 4043 (tools/mesh/xatlasRef.mjs and its gate; the C++ harness and the JSON record are neither .js nor .mjs and are not counted); v4563: 4044 (world/fluidSystem-selfcheck.mjs; the module it gates already existed); v4564: 4052 -- 4050 with NO NEW FILE, the walk starting to count the six .cjs modules it had never been able to see, then 4052 for tools/ship/sourceKind.mjs and its gate; v4566: 4056 for the incremental-sweep round -- tools/ship/inputProbe.mjs, tools/ship/inputSets.mjs, tools/ship/recordInputs.mjs and tools/ship/inputSets-selfcheck.mjs. FOUR files for one gate, which is unusual here and is the shape of the thing: the probe must be a SEPARATE module because it is loaded with --import into the gate being measured, the rule has to be importable by both the recorder and quickSweep, and the recorder is the expensive pass nobody wants inside the rule; v4567: 4062 for the loader-hook probe -- tools/ship/probe/{record,fsShim,fsPromisesShim,cpShim,cpWrap,hooks}.mjs. SIX files and NO new gate, which is the opposite of the usual shape: a module.register() hook needs its shims in their own directory so the hook can tell the shim's own import of the real builtin from everybody else's by a single prefix test, and the wrappers are shared between the ESM shim and the CJS patch so the two cannot make different judgements about the same spawn; v4577: 4074 for physics/raceKnob-selfcheck.mjs, ONE file -- the module it gates already existed, and the round wrote a gate rather than a module because MEASURED_V4527's only reader was the module's own reportLines(); v4579: 4076 for render/starField.mjs and its gate -- the shared starfield the three star pages had each hand-copied; v4580: 4078 for render/skyStars.mjs and its gate -- the engine's own night sky, which had no CPU reference at all.
                                   // DIVERGED AT 4079: this branch went its own way to 4123 via the origin/main MERGE (the 25-gate arrival re-taken alongside it -- F82 Fresnel / specular-probe family, AI-presence-orb set, FXAA, Draco encode and others -- read off census(), not guessed), then v4622 -- RE-TAKEN: 4123 -> 4135 from the ordinary growth of concurrent rounds on this same unshipped branch; see esModules/closures/asyncAwait/typedArrays/promises/fetchXhr/performanceNow/raf/threads below for what moved with it. webgpu and wasm held.
                                   // MEANWHILE origin/main went its own way from 4079 to 4104: v4584: 4081; v4585: 4083; v4586: 4087; v4587: 4090 (the three sibling gates of the v4586 knob modules: physics/apsidalKnob-, impactKnob- and hologramKnob-selfcheck.mjs); v4588: 4096 (the turret copilot: physics/turret.mjs, brain/gunnerPolicy.mjs, render/raceTurret.mjs and their gates physics/turret-, brain/gunnerPolicy- and tools/ship/raceTurret-selfcheck.mjs); v4589: 4098 (render/carViews.mjs and tools/ship/carViews-selfcheck.mjs); v4590: 4100 (physics/slick.mjs and physics/slick-selfcheck.mjs); v4591: 4102 (world/buildingTopple.mjs and world/buildingTopple-selfcheck.mjs); v4592: 4104 (physics/spellAmmo.mjs and physics/spellAmmo-selfcheck.mjs).
                                   // v4622-merge -- RE-TAKEN on this branch's actual merge of origin/main: both histories above diverged from 4079 and are both real. The final reading is a fresh census() over the merged tree.

    // v4536 -- RE-TAKEN AT THE MERGE: 4066 -> 4069. Both lines added files in the same window -- two here
    // for the partition scorer and one on main for the provenance gate -- and each side's note was right for
    // a tree holding only its own. Re-derived from the merged tree rather than summed from the two notes.
    // v4537 -- RE-TAKEN: 4071 -> 4073, the two files of the backlog-absence round.
    // v4537 -- RE-TAKEN AT THE MERGE: 4079 -> 4083, the four files this branch added across two rounds.
    // v4538 -- RE-TAKEN: 4083 -> 4085, the two files of the path-cost round.
    // v4539 -- RE-TAKEN: 4085 -> 4087, the two files of the ground-probe round.
    // v4540 -- RE-TAKEN AT THE MERGE: 4081 -> 4089.
    // v4541 -- RE-TAKEN: 4089 -> 4091, for physics/character/capsuleMove.mjs and its gate -- the
    // ordinary module-plus-gate shape, two files.
    // v4543 -- RE-TAKEN: 4091 -> 4093, for physics/character/capsuleGround.mjs and its gate.
    // v4544 -- RE-TAKEN: 4093 -> 4095, for physics/character/fallBody.mjs and its gate.
    // v4545 -- RE-TAKEN: 4095 -> 4096, for tools/ship/playerGround-selfcheck.mjs. ONE file and not two,
    // because the round's other half edits camera/camera.js, which this walk has always counted.
    // v4546 -- RE-TAKEN: 4096 -> 4097, for tools/ship/playerSlope-selfcheck.mjs. ONE file again, and for
    // the same reason: the slope rule lands in camera/camera.js, which was already counted.
    // v4547 -- RE-TAKEN: 4097 -> 4099, TWO this time -- tools/ship/controllerAgreement.mjs and its gate.
    // v4548 -- RE-TAKEN: 4099 -> 4100, for tools/ship/cameraFall-selfcheck.mjs. ONE file, and the round's
    // other half DELETES code: two copies of a fall out of camera/camera.js, which was already counted.
    // v4549 -- RE-TAKEN: 4100 -> 4101, for tools/ship/playerBody-selfcheck.mjs.
    // v4550 -- RE-TAKEN: 4101 -> 4102, for tools/ship/playerWater-selfcheck.mjs.
    // v4551 -- RE-TAKEN: 4102 -> 4103, for the device half split out of voxelAvatar-selfcheck. A SPLIT
    // MOVES THIS COUNT THOUGH NO NEW CODE WAS WRITTEN, which is what a file census measures.
    // v4552 -- RE-TAKEN: 4103 -> 4104, for tools/ship/walkGround-selfcheck.mjs.
    // v4554 -- RE-TAKEN: 4104 -> 4105, for tools/ship/kaijuGround-selfcheck.mjs.
    // *** BOTH LINES RE-TOOK THIS TABLE AGAINST A TREE THE OTHER COULD NOT SEE, AND THE READINGS BELOW ARE
    // NEITHER OF THEIRS. *** The sets overlap on everything predating the split, so the two are not summed;
    // they are RE-DERIVED by running the census over the merged tree. Both note chains are kept, because a
    // chain that loses a round stops being a history of how the number moved.
    // this line's chain:      // v4526 merge: 3887 -> 4002, this branch's rounds; v4527: 4004; v4528: 4007; v4529: 4009; v4530: 4011; v4533: 4012 (ai-bridge/runBusy.js); v4536: 4014 (physics/mesh/uvUnwrap.mjs and its gate); v4537: 4016 (physics/mesh/uvLscm.mjs and its gate); v4539: 4018 (physics/render/splitSum.mjs and its gate); v4543: 4020 (nav/navmesh.mjs and its gate); v4544: 4022 (physics/character/terrainWalk.mjs and its gate); v4545: 4023 (tools/ship/navWiring-selfcheck.mjs); v4546: 4024 (tools/ship/navWiringLive-selfcheck.mjs; the harness is HTML and not counted); v4547: 4025 (tools/ship/engineSceneBot-selfcheck.mjs); v4548: 4029 (tools/ship/treeRead.mjs, tools/ship/recordReach.mjs and their two gates); v4550: 4031 (tools/export/glbConformance.mjs and its gate); v4552: 4033 (nav/detourScale.mjs and its gate; the terrain fixture is JSON and not counted); v4554: 4035 (world/surfaceProbe.mjs and its gate); v4555: 4036 (world/chunk-selfcheck.mjs; the module it gates already existed); v4556: 4038 (tools/ship/versionMarker.js and its gate -- .js RATHER THAN .cjs on purpose: this walk matches .js/.mjs and NOT .cjs, so the first draft of that module was invisible here and moved this count by one where a module-plus-gate round moves it by two); v4557: 4039 (tools/ship/ritualCoherence-selfcheck.mjs; the ritual it gates already existed); v4559: 4041 (ui/pipboyItems.mjs and its gate); v4560: 4043 (tools/mesh/xatlasRef.mjs and its gate; the C++ harness and the JSON record are neither .js nor .mjs and are not counted); v4563: 4044 (world/fluidSystem-selfcheck.mjs; the module it gates already existed); v4564: 4052 -- 4050 with NO NEW FILE, the walk starting to count the six .cjs modules it had never been able to see, then 4052 for tools/ship/sourceKind.mjs and its gate; v4566: 4056 for the incremental-sweep round -- tools/ship/inputProbe.mjs, tools/ship/inputSets.mjs, tools/ship/recordInputs.mjs and tools/ship/inputSets-selfcheck.mjs. FOUR files for one gate, which is unusual here and is the shape of the thing: the probe must be a SEPARATE module because it is loaded with --import into the gate being measured, the rule has to be importable by both the recorder and quickSweep, and the recorder is the expensive pass nobody wants inside the rule; v4567: 4062 for the loader-hook probe -- tools/ship/probe/{record,fsShim,fsPromisesShim,cpShim,cpWrap,hooks}.mjs. SIX files and NO new gate, which is the opposite of the usual shape: a module.register() hook needs its shims in their own directory so the hook can tell the shim's own import of the real builtin from everybody else's by a single prefix test, and the wrappers are shared between the ESM shim and the CJS patch so the two cannot make different judgements about the same spawn; v4577: 4074 for physics/raceKnob-selfcheck.mjs, ONE file -- the module it gates already existed, and the round wrote a gate rather than a module because MEASURED_V4527's only reader was the module's own reportLines(); v4579: 4076 for render/starField.mjs and its gate -- the shared starfield the three star pages had each hand-copied; v4580: 4078 for render/skyStars.mjs and its gate -- the engine's own night sky, which had no CPU reference at all; v4582: 4079 for tools/ship/zipWriter-selfcheck.mjs, which is commit c3f1fecb's and not this round's; v4584: 4081
    // the FSR line's chain:   // v4526 merge: 3887 -> 4002, this branch's rounds; v4527: 4004; v4528: 4007; v4529: 4009; v4530: 4011; v4533: 4012 (ai-bridge/runBusy.js); v4536: 4014 (physics/mesh/uvUnwrap.mjs and its gate); v4537: 4016 (physics/mesh/uvLscm.mjs and its gate); v4539: 4018 (physics/render/splitSum.mjs and its gate); v4543: 4020 (nav/navmesh.mjs and its gate); v4544: 4022 (physics/character/terrainWalk.mjs and its gate); v4545: 4023 (tools/ship/navWiring-selfcheck.mjs); v4546: 4024 (tools/ship/navWiringLive-selfcheck.mjs; the harness is HTML and not counted); v4547: 4025 (tools/ship/engineSceneBot-selfcheck.mjs); v4548: 4029 (tools/ship/treeRead.mjs, tools/ship/recordReach.mjs and their two gates); v4550: 4031 (tools/export/glbConformance.mjs and its gate); v4551: 4045 -- FOURTEEN files at once, because this record was not re-taken for the five rounds of the FSR arc; v4552: 4048 (render/temporalReject.mjs, its WGSL and its gate); v4553: 4051 (render/temporalLock.mjs, its WGSL and its gate); v4554: 4052 (one gate; the round extended two existing modules rather than adding any); v4555: 4053 (the same shape again -- one gate, two modules extended); v4556: 4054 (and again -- three rounds running); v4557: 4055 (four); v4558: 4056 (five); v4559: 4057 (six); v4560: 4060 -- THREE, the first round of the arc to add a module, a kernel and a gate at once; v4561: 4061 (one gate; the round changed the shared harness rather than adding a module); v4562: 4062 (one gate; the round extended ringFloor and its kernel rather than adding a module); v4563: 4063 (one gate; the round extended ringFloor and temporalLock rather than adding a module); v4564: 4064 (one gate; the round added a phase form to ringFloor rather than a module); v4565: 4065 (one gate; the round composed a second step bound into ringFloor rather than adding a module); v4566: 4066 (one gate; the round gated ringFloor's ring term rather than adding a module); v4567: 4067 (one gate; the round added a yawing fixture and a row to motionVectors rather than a module); v4568: 4068 (one gate; the round added quantiles to ringFloor rather than a module); v4569: 4069 (one gate; the round brought the kernel up rather than adding a module); v4570: 4070 (one gate; the round audited the arc's twelve kernels rather than adding a module); v4571: 4071 (one gate; the round measured what a half-texel fixture hides and built the shape row rather than adding a module); v4572: 4073 -- TWO, a gate and tools/ship/temporalCorpus.mjs, the first round of this arc to add a module since v4560; v4573: 4073 (no new file; the round widened three existing gates); v4574: 4074 (one gate); v4575: 4075 (one gate); v4576: 4076 (one gate); v4577: 4077 (one gate); v4578: 4078 (one gate); v4579: 4079 (one gate); v4580: 4080 (one gate); v4581: 4081 (one gate); v4582: 4082 (one gate); v4583: 4083 (one gate); v4584: 4084 (one gate); v4585: 4085 (one gate); v4588: 4087 (fx/fsr/fsrGPU.js and its gate -- the FSR kernels' first caller outside a gate); v4589: 4089 (tools/ship/kernelReach.mjs and its gate); v4590: 4091 (render/temporalGPU.mjs and its gate); v4592: 4093 (render/motionVectorsGPU.mjs and its gate); v4593: 4095 (render/temporalRejectGPU.mjs and its gate) -- AND THE workers/threads ROW DID NOT MOVE, WHICH TOOK AN EDIT TO THE ARRIVING GATE. Its first draft asserted that tools/ship/selfchecks.mjs contains no /parallelWorkers|new Worker\\(/, and the literals in that regex put the gate into THIS census's workers/threads bucket -- a MENTION counted as a USE, which would have taken closuresOverThreads from 166 to 159 and made this module's headline finding turn on a file that spawns nothing. The row was rewritten to require a SYNCHRONOUS spawn instead, which is the stronger property anyway: execFileSync in a sequential loop cannot be concurrent, and no absence needs asserting. The detector is unchanged and still counts mentions; this is recorded as its known limit rather than papered over
    // *** RE-DERIVED AT THE main MERGE. *** Both lines re-took this against a tree the other could not see,
    // and the readings overlap on everything predating the split, so they are run over the merged tree rather
    // than added. Both prior readings are kept in the chain above; a discarded one is evidence about the method.
    // v4647g -- RE-DERIVED: 4286 -> 4288 for tools/ship/cliArgs.mjs and its gate. THREE of the thirteen
    // rows moved and the shape is the point: ES modules +2 and closures +2 (both files are modules and
    // both hold arrow functions), but async/await only +1 -- the gate awaits an import, the parser does
    // not await anything. A files-only check would call this a two-file round and miss that the two files
    // are not alike, which is the distinction the twelve rows beside the count exist to make.
    // v4647p -- 4288 -> 4289: tools/ship/sweepRotation-selfcheck.mjs. ES modules and closures by one
    // each; async/await unmoved, because the gate awaits nothing.
    // *** v4665 -- RE-DERIVED AT THE MERGE: both lines re-took this over their own tree, so
    // neither figure describes the union. Both histories kept; the numbers are re-derived below.
    // ---- this branch's line ----
    // (this branch's figure and its history, superseded by the merge re-derive below)
    // files: 4298,               // v4664 -- RE-DERIVED: two files (tools/ship/declaredCost.mjs, its gate); three rows moved, nine held. v4662 -- RE-DERIVED: two files (tools/ship/thrownRow.mjs, its gate); five rows moved, seven held. v4661 -- RE-DERIVED: three files (tools/ship/wasmTeardown.mjs, its gate, tools/ship/wasmExitHook.cjs); seven rows moved, five held. v4649r -- RE-DERIVED: tools/ship/pixelWorst.mjs arrived, one ES module with no closure, no await and no device call in it -- TWO rows moved and ten held. v4649 -- RE-DERIVED: tools/ship/fixtureLitter.mjs arrived, one ES module using closures and one await (a dynamic import in playwrightResolve-selfcheck at v4648r) -- four rows moved, eight held. v4647 -- RE-DERIVED after this session's own eleven files; see the note below. v4645 -- RE-DERIVED AT THE main MERGE over the merged tree. RE-DERIVED AT THE main MERGE: 4169 on this branch, 4172 on main, 4260 merged -- LESS than the sum, which is why it is run
    // ---- the murmuration line ----
    // *** v4665 -- RE-DERIVED OVER THE MERGED TREE, and it is LESS than the sum of the two lines'
    // figures for the reason the v4645 note beside this already records: the two branches share files.
    // 4298 here, 4300 on main, 4307 merged. SEVEN rows moved and five held -- ES modules +6, closures
    // +7, async/await +3, typed arrays +1, Promises +2, WebAssembly 23 -> 24. That last one is this
    // branch's tools/ship/wasmExitHook.cjs, the file the wasm census could not see either, arriving in
    // a row that counts it correctly because this census reads every extension rather than three.
    files: 4307,                              // v4660 -- RE-DERIVED: tools/ship/murmurIgniteFour-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3866 / 23 still rounds to 168).  // v4659 -- RE-DERIVED: tools/ship/murmurIgniteAxis-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3865 / 23 still rounds to 168).  // v4658 -- RE-DERIVED: tools/ship/murmurComplete-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3864 / 23 still rounds to 168).  // v4656 -- RE-DERIVED: tools/ship/murmurGesture-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3863 / 23 still rounds to 168).  // v4655 -- RE-DERIVED: tools/ship/murmurClock2-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3862 / 23 still rounds to 168).  // v4654 -- RE-DERIVED: tools/ship/murmurClock-selfcheck.mjs arrived, one ES module using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3861 / 23 still rounds to 167).  // v4653 -- RE-DERIVED: the two st.drive gates arrived, both ES modules using closures and await -- four rows moved, eight held, and closuresOverThreads did NOT move (3860 / 23 still rounds to 167).  // v4650 -- RE-DERIVED: tools/ship/murmurTempo-selfcheck.mjs arrived, one ES module using closures and one await (its render section) -- four rows moved, eight held, and closuresOverThreads did NOT move (3858 / 23 still rounds to 167).  // v4649r -- RE-DERIVED: tools/ship/pixelWorst.mjs arrived, one ES module with no closure, no await and no device call in it -- TWO rows moved and ten held. v4649 -- RE-DERIVED: tools/ship/fixtureLitter.mjs arrived, one ES module using closures and one await (a dynamic import in playwrightResolve-selfcheck at v4648r) -- four rows moved, eight held. v4647 -- RE-DERIVED after this session's own eleven files; see the note below. v4645 -- RE-DERIVED AT THE main MERGE over the merged tree. RE-DERIVED AT THE main MERGE: 4169 on this branch, 4172 on main, 4260 merged -- LESS than the sum, which is why it is run
                               // v4639: 4260 -> 4261 for tools/ship/fsrPage-selfcheck.mjs, named by the pre-flight before the verify rather than after
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
    // v4575 -- RE-TAKEN: ES modules 3771 -> 3773 and closures 3650 -> 3652, for
    // physics/render/conductorFresnel.mjs and its gate. async/await does NOT move: neither file
    // awaits anything, which is unusual for a round here and is what a pure-arithmetic module is.
    // v4576 -- RE-TAKEN: ES modules 3773 -> 3775 and closures 3652 -> 3654, for
    // tools/ship/recordTier.mjs and its gate.
    // v4577 -- RE-TAKEN: ES modules 3775 -> 3776 and closures 3654 -> 3655, for
    // physics/raceKnob-selfcheck.mjs. ONE file rather than the usual two: the module it gates already
    // existed, which is the whole reason the round wrote a gate and not a module.
    // v4578 -- RE-TAKEN: typed arrays 1034 -> 1035 and WebGL 141 -> 142, and NO new file. Both are the
    // holofoil round, and both are the census reading real new usage rather than a file count moving:
    // tools/ship/holoFoil-selfcheck.mjs now walks float64 ulps with a DataView over an ArrayBuffer to probe
    // the cell-edge boundary, and render/holoFoilShader.js names WebGL2RenderingContext, because the shared
    // integer hash needs GLSL ES 3.00 and the module now says so instead of leaving a page to find out.
    // v4579 -- RE-TAKEN: ES modules 3776 -> 3778 and closures 3655 -> 3657, for render/starField.mjs and its
    // gate. The usual two-file shape of a module-plus-gate round.
    // v4580 -- RE-TAKEN: ES modules 3778 -> 3780 and closures 3657 -> 3659, for render/skyStars.mjs and its
    // gate. The usual module-plus-gate shape.
    // v4582 -- RE-TAKEN for commit c3f1fecb's tools/ship/zipWriter-selfcheck.mjs, which arrived on main
    // alongside this round: ES modules 3780 -> 3781, closures 3659 -> 3660, async/await 1425 -> 1426 and typed
    // arrays 1035 -> 1036. ONE file moving four rows is the shape of a gate that awaits and writes bytes.
    // origin/main MERGE -- RE-TAKEN for the 25-gate arrival: ES modules 3781 -> 3824, closures 3660 -> 3700,
    // async/await 1426 -> 1444, typed arrays 1036 -> 1057, Promises 349 -> 355, WebGL 142 -> 148,
    // requestAnimationFrame 116 -> 119, WebGPU 48 -> 49 -- eight of twelve rows, all read off census().
    //
    // FOLLOW-UP -- WebGPU 49 -> 50, AND THE 49 WAS WRONG THE MOMENT IT WAS WRITTEN, NOT A DRIFT SINCE. Checked
    // against the exact commit that recorded it (a worktree pinned to 5d3d8d83, census() re-run there
    // unmodified): the tree AT THAT COMMIT already reads WebGPU 50, not 49 -- a miscount in the merge's manual
    // retake, caught here because the gate re-derives every run rather than trusting the note beside the
    // number. No file arrived and no line changed between then and now to explain the extra one; it was always
    // there. files (4123) and the other ten of twelve rows in that same retake were correct and are unchanged.
    // v4622 -- RE-TAKEN: esModules 3824 -> 3835, closures 3700 -> 3713, asyncAwait 1444 -> 1454, typedArrays
    // 1057 -> 1065, promises 355 -> 361, fetchXhr 243 -> 244, performanceNow 220 -> 222, webgl 148 -> 150,
    // raf 119 -> 120, threads 22 -> 23, from the ordinary growth of concurrent rounds on this same unshipped
    // branch. webgpu and wasm held at 50 and 23 -- verified against a fresh census() run.
    // DIVERGED FROM origin/main MERGE'S OWN 3824/3700/1444/1057/355/148/119/49-then-50: origin/main went its
    // own way through v4584-v4592 (each round's own file-by-file deltas kept below for the record) while this
    // branch took the v4622 path above.
    // v4584 -- RE-TAKEN on the tree merged with main at v4583: two files (brain/fleetRouting.mjs and its gate) moved five rows by one
    // or two (ES modules, closures, async/await, typed arrays, Promises), the other seven not at all; no page, no GPU, no thread.
    // v4585 -- RE-TAKEN: three files (physics/labHome.mjs, lab-home.html, the gate) moved five rows by one or two (ES modules,
    // closures, async/await, Promises, performance.now: the page times its own load), the other seven not at all; the ratio 166 -> 167.
    // v4586 -- RE-TAKEN: four files (physics/apsidalKnob.mjs, impactKnob.mjs, hologramKnob.mjs, labKnobs-selfcheck.mjs) moved
    // exactly two rows by four (ES modules, closures) and the other ten not at all; the ratio holds at 167 (3668 / 22).
    // v4587 -- RE-TAKEN: three files (the sibling gates physics/apsidalKnob-, impactKnob- and hologramKnob-selfcheck.mjs) moved
    // files, ES modules and closures by three each and nothing else; 3671 / 22 is still 167 threads' worth.
    // v4588 -- RE-TAKEN: six files (the turret copilot's three modules and three gates) moved files, ES modules and closures by six,
    // async/await by three, typed arrays by four, Promises, fetch/XHR and WebGL by one, performance.now by two; 3677 / 22 is still 167.
    // v4589 -- RE-TAKEN: two files (render/carViews.mjs and its gate) moved files, ES modules and closures by two, async/await,
    // typed arrays, Promises and performance.now by one; 3679 / 22 is still 167.
    // v4590 -- RE-TAKEN: two files (physics/slick.mjs and its gate): files, ES modules and closures each by two; 3681 / 22 is still 167.
    // v4591 -- RE-TAKEN: two files (world/buildingTopple.mjs and its gate): files, ES modules, closures and typed arrays each by two,
    // async/await, Promises and performance.now each by one (the gate boots the page through the harness); 3683 / 22 is still 167.
    // v4592 -- RE-TAKEN: two files (physics/spellAmmo.mjs and its gate): files, ES modules and closures each by two, async/await by one;
    // 3685 / 22 = 167.5 rounds to 168, the ratio's first move since v4585.
    // v4622-merge -- RE-TAKEN on this branch's actual merge of origin/main: both histories above diverged from
    // the same point and are both real. The final reading is a fresh census() over the merged tree.
    // v4622-merge-b -- RE-TAKEN after the actual merge landed: esModules 3835 -> 3860, closures 3713 -> 3738,
    // asyncAwait 1454 -> 1462, typedArrays 1065 -> 1073, promises 361 -> 366, fetchXhr 244 -> 245,
    // performanceNow 222 -> 227, webgl 150 -> 151, wasm 23 -> 24. threads, raf and webgpu held.
    // v4622-merge-c -- RE-TAKEN: wasm 24 -> 23. The ffmpegWasmBridge-selfcheck.mjs fix (inlining the browser-
    // context import literal instead of holding its path in a `moduleImportPath` variable, for windowsImport's
    // recognized scanner idiom) removed one of the two lines the WebAssembly pattern had matched in that file.
    // v4627 -- RE-TAKEN: esModules 3864 -> 3865, closures 3742 -> 3743, both from the one new fixture file.
    // Everything else held, which is the expected shape for a round whose work landed in existing modules.
    // v4627-merge -- RE-TAKEN AGAIN: wasm 24 -> 23, on a merge of THIS branch's own bookkeeping edits (removing
    // repaired-gate prose from redCensus.mjs's WHY_V4622 map, which had mentioned "WebAssembly" enough times to
    // matter) into this same v4623-v4627 line. Same shape as merge-c before it, same root fragility v4623's own
    // note already named: a file-level census of one literal word, re-taken by hand every time either branch's
    // bookkeeping churns. Measured, not assumed: a fresh census() reads wasm 23 on the merged tree.
    //
    // *** v4628 -- PUT BACK TO 24, BECAUSE THAT RE-TAKE'S OWN MEASUREMENT DOES NOT REPRODUCE. *** The note
    // above says a fresh census() reads 23 on the merged tree. It reads 24, at BOTH ends of that merge --
    // counted directly, with the gate's own sources() and stripComments(): 24 at 434e2073 (the merge itself,
    // in a clean worktree) and 24 at 82ebd940 (the reconciliation commit that wrote 23). The row went red the
    // moment anything ran the gate, which is how this was found rather than by reading.
    //
    // THE TWENTY-FOUR ARE NAMED HERE, so the next re-take is a diff against a list instead of a number to be
    // trusted: ai-bridge/{bgServicesBridge,grdpwasmBridge,verifiedPolygonIntersectionBridge,wasmDemoBridge,
    // wasmSandboxWorker}.js, engine/wasmSupport.mjs, physics/box3d/{box3dConformance,wasmBuild}-selfcheck.mjs,
    // physics/jolt/joltLoader.js, render/ffmpegWasmExport.mjs, simulation/life/{paramecium3d,parameciumBox3d,
    // parameciumDrive}-selfcheck.mjs, tools/crossarch-box3d.mjs, tools/crossarchBox3d-selfcheck.mjs,
    // tools/render-qa/pageRequirements.mjs, tools/roundhouse/box3dBind.mjs, tools/ship/{box3dFilter,
    // erosionMeasure,runtimeGap,wasmSupport}-selfcheck.mjs, tools/ship/register-audit.mjs, ui/voxtralBrowser.js,
    // and vba/runtimeGap.mjs itself. redCensus.mjs is NOT among them -- its mention really was removed -- and
    // register-audit.mjs IS, at both commits, so the removal the note credits did not take the count down: the
    // 24th hit was somewhere the re-take did not look. A count is not a measurement anyone can check; a list is.
    //
    // THIS IS THE THIRD TIME THIS ONE ROW HAS MOVED AND BEEN MOVED BACK (v4622's prose-versus-census split,
    // merge-c's 24 -> 23, now this), which is the fragility the notes above keep naming and nobody has fixed.
    // The fix is not another careful re-take: it is for this row to be DERIVED from the list above rather than
    // typed. Left as it stands here because that is a change to how the record works, not to what it says.
    // v4630 -- RE-TAKEN: esModules 3865 -> 3867, closures 3743 -> 3745, asyncAwait 1464 -> 1466, all from
    // the two new files. Everything else held.
    // v4632 -- RE-TAKEN: esModules 3867 -> 3869, closures 3745 -> 3747, asyncAwait 1466 -> 1468, two files
    // each. Everything else held, INCLUDING webgpu at 50 -- which is the row a reader would expect two new
    // WebGPU gates to move, and it does not, because both drive the GPU through tools/ship/webgpuHarness.mjs
    // rather than naming an API this census greps for. That is the census being honest about what it counts:
    // a file that uses WebGPU through a harness is not a file that mentions WebGPU.
    // v4634 -- RE-TAKEN: esModules 3869 -> 3870, closures 3747 -> 3748, asyncAwait 1468 -> 1469, one file.
    // v4636 -- RE-TAKEN: esModules 3870 -> 3872, closures 3748 -> 3750, asyncAwait 1469 -> 1471, TWO files
    // (tools/ship/murmurSpecies6-selfcheck.mjs and …Species7, fathom and geode). The three rows that move
    // are the three a new ES-module gate moves by construction, and the other nine held -- including
    // webgpu, which stays at 50 for the reason the note above gives: both gates drive a real GPU through
    // tools/ship/webgpuHarness.mjs rather than naming an API this census greps for.
    // v4637 -- RE-TAKEN: esModules 3872 -> 3874, closures 3750 -> 3752, asyncAwait 1471 -> 1473, TWO files
    // (tools/ship/murmurSpecies8-selfcheck.mjs and …Species9, arc and sol). The same three rows a new
    // ES-module gate moves by construction, and the same nine held -- webgpu still 50, for the same reason:
    // both gates drive a real GPU through tools/ship/webgpuHarness.mjs and never name an API this greps for.
    // v4638 -- RE-TAKEN: esModules 3874 -> 3876, closures 3752 -> 3754, asyncAwait 1473 -> 1475, TWO files
    // (…murmurSpecies10-selfcheck.mjs and …Species11, aura and flux). Three rows move, nine hold, webgpu
    // stays 50 -- the fourth round running for the same reason: the GPU is reached through a harness.
    // v4639 -- RE-TAKEN: esModules 3876 -> 3878, closures 3754 -> 3756, asyncAwait 1475 -> 1477, TWO files
    // (…murmurSpecies12-selfcheck.mjs and …Species13, duet and chorus). Three rows move, nine hold.
    // v4640 -- RE-TAKEN: esModules 3878 -> 3880, closures 3756 -> 3758, asyncAwait 1477 -> 1479, TWO files
    // (…murmurSpecies14-selfcheck.mjs and …Species15, prism and helix -- the last two of the eighteen).
    // v4644 -- RE-TAKEN: esModules 3882 -> 3884, closures 3760 -> 3762, asyncAwait 1481 -> 1483, and the
    // typed-array and promise counts did NOT move. Two more gates that read pixels back as a Uint8Array and
    // never touch one directly: they take their frames from tools/ship/murmurSpeciesFrames.mjs, which is the
    // shape a shared helper has on this census -- the count follows the import graph and not the subject.
    // v4641 -- RE-TAKEN: esModules 3880 -> 3882, closures 3758 -> 3760, asyncAwait 1479 -> 1481, TWO files
    // (tools/ship/murmurLive-selfcheck.mjs and …Live2). Three rows move, nine hold, webgpu stays 50 for the
    // sixth round running -- and this pair is the sharpest case of WHY: both gates render on a real GPU
    // through tools/ship/webgpuHarness.mjs, so neither file names a WebGPU API and the census is right not to
    // count them. `files` was updated in the v4641 commit and these three were not, which is what left this
    // gate red on its own round: a census that moves together has to be re-taken together.
    // *** v4645 -- RE-DERIVED AT THE main MERGE, every row together, which is the only way this table is ever
    // right. *** Eleven of the thirteen moved: files 4263 -> 4275, ES modules 3884 -> 3975, closures 3762 ->
    // 3844, async/await 1483 -> 1519, typed arrays 1073 -> 1123, Promises 366 -> 368, performance.now 227 ->
    // 229, rAF 120 -> 121, WebGL 151 -> 156, WebGPU 50 -> 52. Two lines each re-took this census for a tree
    // holding its own new files and neither reading was correct for the tree holding both.
    //
    // *** AND ONE ROW WENT DOWN, WHICH A MERGE CANNOT DO BY ADDING FILES. WebAssembly 24 -> 23. *** v4628's
    // note is why that took a minute instead of a round: it had just been burned by this exact row and wrote
    // the answer down as A LIST RATHER THAN A COUNT -- "a count is not a measurement anyone can check; a list
    // is" -- naming all twenty-four files. Diffing that list against a fresh census pins the missing one
    // immediately: tools/ship/register-audit.mjs, which matched on a RECORDED FAIL LINE mentioning
    // WebAssembly, from windowsImport's offender report. main's v4642 repaired windowsImport and this line's
    // rounds re-froze the audit, so the recorded line is gone and the file stops matching. The count fell
    // because a defect was fixed. Verified at both ends rather than argued: main's register-audit.mjs matches
    // the pattern after stripComments and this tree's does not.
    // *** v4647 -- RE-TAKEN AFTER THIS SESSION'S OWN ROUNDS, AND FIVE OF THIRTEEN MOVED. *** files
    // 4275 -> 4286 (eleven arrivals: six gates and five modules -- capsuleSettle, colliderFromGLB,
    // adapterRecord, ensureDxc, failLines and their gates, plus dxcResolve-selfcheck), ES modules
    // 3975 -> 3986, closures as values 3844 -> 3853, async/await 1519 -> 1521, typed arrays 1123 -> 1125,
    // WebGPU 52 -> 53. The other eight did not move, which is the shape that says the patterns discriminate
    // rather than tracking the tree's size -- this module's own v4478 note makes that argument and it holds
    // again here: eleven files arrived and Promises, fetch/XHR, performance.now, rAF, WebGL, threads and wasm
    // are all unchanged.
    //
    // *** AND NOTHING NOTICED FOR SIX ROUNDS. *** Its own comment above says this is "a number every round
    // that adds a module must re-take, which is the cost of pinning it". Six rounds added modules and none
    // re-took it. It went red on BOTH boxes, and Keith's verify named it in the drift pre-flight -- which is
    // precisely the instrument for this and only helps somebody who runs it.
    // *** v4665 -- RE-DERIVED AT THE MERGE: both lines re-took this over their own tree, so
    // neither figure describes the union. Both histories kept; the numbers are re-derived below.
    // ---- this branch's line ----
    // v4661 -- RE-DERIVED: three files arrived (tools/ship/wasmTeardown.mjs, its gate, and the CJS hook
    // tools/ship/wasmExitHook.cjs). SEVEN rows moved and five held -- files +3, ES modules +2 (the .cjs is
    // not one), closures +3, async/await +1, typed arrays +1, Promises +1, and WebAssembly 23 -> 24, which
    // is the row the round is about and the only one whose movement means anything beyond arithmetic.
    // v4662 -- RE-DERIVED: two files arrived (tools/ship/thrownRow.mjs and its gate). FIVE rows moved and
    // seven held -- files +2, ES modules +2, closures +2, async/await +1, Promises +1. typed arrays and
    // WebAssembly did NOT move, which is the shape that says these patterns discriminate: a round about
    // how a process DIES touches neither the memory nor the wasm rows.
    // v4662b -- asyncAwait 1525 -> 1526: physics/scoreDirection-selfcheck gained a top-level await when
    // the route was made to await ready() before adjudicating. ONE row moved and eleven did not.
    // v4664 -- RE-DERIVED: two files arrived (tools/ship/declaredCost.mjs and its gate). THREE rows
    // moved and nine held -- files +2, ES modules +2, closures +2. Neither async/await nor Promises
    // moved, which is right for a pair that reads headers off disk and does no I/O it can await.
    // (this branch's figure and its history, superseded by the merge re-derive below)
    // esModules: 3997, closures: 3864, asyncAwait: 1526, typedArrays: 1126, promises: 370,
    // (this branch's capability row, superseded by the merge re-derive below)
    // fetchXhr: 245, performanceNow: 229, raf: 121, webgl: 156, webgpu: 54, threads: 23, wasm: 24,
    // ---- the murmuration line, RE-DERIVED at v4665 over the merged tree ----
    esModules: 4006, closures: 3873, asyncAwait: 1535, typedArrays: 1126, promises: 370,
    // wasm 23 -> 24: this branch's tools/ship/wasmExitHook.cjs. A DUPLICATE KEY nearly hid it -- both
    // lines' capability rows survived the merge and the LATER one silently won, so the merged tree
    // would have carried main's 23 under a record claiming to describe the union. JS does not warn
    // on a repeated object key; the gate caught it because it re-derives every row rather than trusting.
    fetchXhr: 245, performanceNow: 229, raf: 121, webgl: 156, webgpu: 54, threads: 23, wasm: 24,
    // v4649r -- webgpu 53 -> 54: render/temporalResolve-selfcheck gained a navigator.gpu call when its
    // confidence bound was moved onto the per-adapter record. ONE row moved and eleven did not, which is
    // the shape that says the patterns discriminate rather than track the tree's size.
    // *** ALL TWELVE ARE CHECKED, NOT THREE. *** The gate's first draft re-derived the census and then
    // compared only files/threads/closures against it, so nine of these were decoration -- and asyncAwait was
    // already stale by one when this round's own note strings landed. Every row below is now a red if it drifts.
    // v4622 -- RE-TAKEN: 12 -> 11. threads (23) and WebAssembly (23) are now tied on the live census, and the
    // stable sort places WebAssembly (earlier in PATTERNS) at 12 and threads at 11 -- still the bottom two,
    // which is what the check actually requires (idx >= rows.length - 2).
    // v4622-merge-b -- RE-TAKEN after the actual merge landed: 11 -> 12. WebAssembly moved to 24 (one file
    // from origin/main's own history) while threads held at 23, so the tie breaks and threads is smallest
    // outright again -- still the bottom two either way.
    // v4622-merge-c -- RE-TAKEN: 12 -> 11. WebAssembly dropped back to 23 (the ffmpegWasmBridge-selfcheck.mjs
    // fix removed one of its two matched lines), re-tying threads and WebAssembly at 23 -- the stable sort
    // places WebAssembly (earlier in PATTERNS) at rank 12 and threads at rank 11, still the bottom two.
    // v4623: 11 -> 12. This is the DERIVED half of the same half-finished re-take noted on `files` above --
    // the v4622 merge corrected the prose to say WebAssembly had moved to 24 and left BOTH the census row
    // (wasm: 23) and this rank at their pre-merge values. With wasm: 24 the tie at 23 breaks and threads
    // is the smallest of the twelve outright, which is the direction the row's own headline already argued.
    // v4627-merge -- RE-TAKEN: 12 -> 11. wasm dropped back to 23 (see the note on `wasm` above), re-tying
    // threads and WebAssembly at 23; the stable sort places WebAssembly (earlier in PATTERNS) at rank 12 and
    // threads at rank 11, still the bottom two either way.
    // v4628 -- RE-TAKEN BACK: 11 -> 12, because that re-take's premise did not hold. wasm is 24 and threads
    // 23, so they are NOT tied and no stable-sort tiebreak is involved: threads is the smallest of the twelve
    // outright. Measured from ranked(census(sources())), not reasoned from the row above.
    threadsRank: 12,                // of 12, biggest first -- the SMALLEST gap on the merged tree, untied
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
    // DIVERGED FROM the origin/main MERGE'S 20/21 base: this branch took the v4622 path (168 -> 161, 3713/23)
    // while origin/main took its own v4584-v4592 path (167.5 rounding to 168, 3685/22 -- kept below).
    // v4592 (origin/main): 3685 / 22 at v4592 (167 at v4591: 3683 / 22 (167 at v4590: 3681 / 22 (167 at v4589:
    // 3679 / 22 (167 at v4588: 3677 / 22 (167 at v4587: 3671 / 22 (167 at v4586: 3668 / 22 (167 at v4585:
    // 3664 / 22 (166 at v4584: 3662 / 22 (166 at v4567: 3643 / 22 (165 at v4552: 3619 / 22 (164 at v4530:
    // 3597 / 22; 163 at v4527: 3588 / 22; 158 at v4462: 3465 / 22).
    // v4622-merge -- RE-TAKEN on this branch's actual merge of origin/main: the final reading is a fresh
    // derivation over the merged tree, not either branch's own divergent path.
    // v4622-merge-b -- RE-TAKEN after the actual merge landed: wasmWithoutSelf 21 -> 22 (wasm 24 with this
    // round's own +2 self-inflation); threadsWithoutSelf held at 22 (threads 23 with +1, unchanged).
    // v4622-merge-c -- RE-TAKEN: wasmWithoutSelf 22 -> 21 (wasm 23 with this round's own +2 self-inflation).
    // *** v4623: BACK TO 22, AND THE FLIP-FLOP IS THE FINDING. *** This field went 21 -> 22 at merge-b and
    // 22 -> 21 at merge-c, inside one round, in opposite directions. Neither move was wrong arithmetic: both
    // were derived correctly FROM `wasm`, which was itself left at the pre-merge 23 while the prose beside it
    // already said 24. A derived number fitted to a stale measurement will track the staleness exactly and
    // never look inconsistent on its own -- which is why it took a gate run on a clean checkout, not a
    // reading of the file, to see that the whole chain was one row behind. Re-measured, not re-derived: the
    // live census reads wasm 24 with this module's own +2, and 22 without it.
    // v4627-merge -- RE-TAKEN: 22 -> 21 (wasm 23 with this module's own +2 self-inflation, see the note on
    // `wasm` above).
    // v4628 -- RE-TAKEN BACK: 21 -> 22, and MEASURED rather than derived by subtracting 2 from the row above.
    // Re-running census() over sources() with vba/runtimeGap.mjs and tools/ship/runtimeGap-selfcheck.mjs
    // filtered out reads 22 directly. Both previous moves of this field were arithmetic on a number that was
    // itself wrong, which is how it flip-flopped 21 -> 22 -> 21 inside one round at v4622.
    wasmWithoutSelf: 22,
    threadsWithoutSelf: 22,       // v4622 -- RE-TAKEN: 21 -> 22 (threads 23 with this round's own +1 self-inflation)
    closuresOverThreads: 167,     // v4644 -- RE-TAKEN: 163 -> 164 (3762 / 23), the first move in twenty-two rounds, because 3760/23 rounded to 163 and 3762/23 rounds to 164. A DERIVED ratio crossing a rounding boundary is exactly why this one is re-taken rather than pinned.  // v4622-merge-b -- RE-TAKEN: 161 -> 163 (3738 / 23). A DERIVED ratio, so it moves whenever either row does, which is why it is re-taken rather than pinned once
    // *** ONE, NOT TWO. *** The first draft filed fetch/XHR as an archive claim too; pointing the rows at
    // bytes found the HTTP client sitting in this tree's own VBA, so only WebGL still needs the archive.
    archiveRows: 1,
    hasRows: 3,                   // performance.now, fetch/XHR, WebGL -- and every one names a corroborator
    // Also wrong in the first draft, at 8, and unchecked -- exactly the frozen-number-nobody-re-takes shape
    // this file's own header complains about. Nine of the twelve rows are language facts of absence.
    languageRowsAbsent: 9,
});
