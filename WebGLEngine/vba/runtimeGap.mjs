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
    "WebGL":                 /(webgl2?["')]|WebGL2?RenderingContext)/,
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
    // A SIXTH TIME, and this one is the round's OWN two files rather than a merge: render/zoomBlur.mjs and
    // its gate take the census 3870 -> 3872 and move four rows. SIX RE-DERIVATIONS, SIX DIFFERENT TABLES, ONE
    // UNCHANGED HEADLINE -- threads have read 22 through every one of them, and WebGPU did not move either
    // even though both new files are about a compute shader, because the census counts FILES THAT MENTION a
    // capability and the pair already did.
    // A SEVENTH TIME: v4479's deferralCensus.mjs and its gate take it 3872 -> 3874, moving ES modules and
    // closures by two each and nothing else. SEVEN RE-DERIVATIONS, SEVEN DIFFERENT TABLES, ONE UNCHANGED
    // HEADLINE -- threads have read 22 through every one of them, and so has WebAssembly. A row that survives
    // seven independent populations is a finding about the tree; a row read back from the first would have
    // been wrong seven times.
    // AN EIGHTH TIME: v4480's deviceReport.mjs and its gate, 3874 -> 3876. EIGHT RE-DERIVATIONS, EIGHT
    // DIFFERENT TABLES, ONE UNCHANGED HEADLINE -- threads and WebAssembly have both read 22 through every one.
    // This row has now moved for every round that added a file and never once for a reason about threads,
    // which is the strongest thing a census can say about the number it exists to report.
    // A NINTH TIME: v4481's corroborationSubmit.mjs and its gate, 3876 -> 3878. NINE RE-DERIVATIONS, NINE
    // DIFFERENT TABLES, ONE UNCHANGED HEADLINE. This row has moved for every round that added a file and never
    // once for a reason about threads -- which is the strongest thing a census can say about the number it
    // exists to report, and it is a stronger statement after nine independent populations than after one.
    // *** A TENTH TIME -- AND THE INTERESTING PART IS THAT THREE ROUND NOTES SAID SO BEFORE IT WAS TRUE. ***
    // v4485 re-derived this table because the gate went red on `typed arrays 693 -> 694`, and exactly one row
    // had moved: a `new DataView(new ArrayBuffer(8))` in v4484's own test fixture, in a gate about corroborating
    // observables. `files` did not move at all -- v4482, v4483 and v4484 edited existing files and added none.
    //
    // *** SO THE THREE NOTES BEFORE THIS ONE EACH CLAIMED A RE-DERIVATION THAT NEVER HAPPENED. *** v4482's
    // round note reads "AND FOR THE TENTH TIME runtimeGap's frozen census moved because this round touched
    // files", v4483's says ELEVENTH, v4484's says TWELFTH -- and this record still read NINTH, from v4481,
    // because nobody re-derived anything on any of those rounds. THE COUNT WAS INCREMENTED FROM THE PREVIOUS
    // NOTE RATHER THAN MEASURED, which is precisely the failure this table exists to demonstrate, committed in
    // the prose ABOUT the table by the hand that wrote it. Two of the three claims were simply false; the
    // third was true by accident, and its record was still not updated, which is why the gate caught it.
    //
    // The shipped notes are history and are not rewritten. The correction lives here, where the number does.
    // TENTH RE-DERIVATION, TENTH TABLE, ONE UNCHANGED HEADLINE: threads and WebAssembly have read 22 through
    // every one of them -- and this row has still never moved for a reason about threads.
    // AN ELEVENTH TIME, v4486, AND THIS ONE REALLY DID ADD FILES: deviceReportOne.mjs and wideSweep.mjs,
    // 3878 -> 3880, moving ES modules, closures and async/await by two each. RE-DERIVED AND RE-TYPED FROM THE
    // MEASUREMENT, which is the discipline v4485 found three round notes had skipped -- they incremented a
    // count from the previous note instead of taking it. This row is the first since then to move for the
    // reason the notes kept claiming, and the number comes from the run rather than from arithmetic on prose.
    // ELEVENTH TABLE, ONE UNCHANGED HEADLINE: threads and WebAssembly have read 22 through every one of them.
    // A TWELFTH TIME, v4487: conditioningOne.mjs, 3880 -> 3881, moving three rows by one each. RE-DERIVED FROM
    // THE RUN, which is now two rounds running -- the discipline v4485 found three notes had skipped by
    // incrementing a count from the previous note instead of taking it. TWELFTH TABLE, ONE UNCHANGED HEADLINE:
    // threads and WebAssembly have read 22 through every one, and that row has never moved for a reason about
    // threads. closuresOverThreads is a getter since v4486 and needs no hand here at all.
    files: 3881,
    esModules: 3590, closures: 3466, asyncAwait: 1341, typedArrays: 694, promises: 332,
    fetchXhr: 224, performanceNow: 202, raf: 116, webgl: 102, webgpu: 45, threads: 22, wasm: 22,
    // *** ALL TWELVE ARE CHECKED, NOT THREE. *** The gate's first draft re-derived the census and then
    // compared only files/threads/closures against it, so nine of these were decoration -- and asyncAwait was
    // already stale by one when this round's own note strings landed. Every row below is now a red if it drifts.
    threadsRank: 11,              // of 12, biggest first -- second-smallest
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
    wasmWithoutSelf: 20,
    threadsWithoutSelf: 21,
    // *** v4486 -- WAS A TYPED 157, WITH A COMMENT READING "3404 / 22" WHILE closures STOOD AT 3465. *** The
    // stored ratio drifts every time either row moves, and its own arithmetic note had gone stale three
    // re-derivations ago -- a derived number kept as a literal beside the two numbers it is derived from.
    // It is a GETTER now, so it cannot disagree with them: redCensus's v4430 inversion ("the audit is the
    // source now, and there is nothing left to retype") applied to the last hand-typed figure in this record.
    // The gate still compares it against a live re-derivation, so the row remains a real check rather than a
    // tautology -- what changed is that the two sides can no longer drift apart by neglect.
    get closuresOverThreads() { return Math.round(this.closures / this.threads); },
    // *** ONE, NOT TWO. *** The first draft filed fetch/XHR as an archive claim too; pointing the rows at
    // bytes found the HTTP client sitting in this tree's own VBA, so only WebGL still needs the archive.
    archiveRows: 1,
    hasRows: 3,                   // performance.now, fetch/XHR, WebGL -- and every one names a corroborator
    // Also wrong in the first draft, at 8, and unchecked -- exactly the frozen-number-nobody-re-takes shape
    // this file's own header complains about. Nine of the twelve rows are language facts of absence.
    languageRowsAbsent: 9,
});
