// WebGLEngine/tools/ship/emitReproducibility.mjs -- v4484
//
// *** THE CODEGEN ARTIFACTS ARE REWRITTEN ON EVERY GATE RUN AND NOTHING HAS EVER COMPARED THE NEW BYTES TO THE
// OLD ONES. ***
//
// v4480 surveyed the TSL/WebGPU pipeline, found that "compile the TSL graphs at ship time and vendor the
// output" was ALREADY the tree's practice, and recorded what was actually missing as data:
// freshEmitComparedToStored: false, marked in that file as "*** THE ACTUAL OPEN QUESTION ***". Three gates
// re-emit through three's node builders on every run, write the result over the stored artifact, and then
// assert that the file exists and is over a thousand characters. A codegen step whose output changes when
// nothing changed is a diff nobody can review, and the only reason nobody had noticed is that nobody looked.
//
// ---- MEASURED FIRST: IT IS REPRODUCIBLE, AND THAT IS THE GOOD NEWS -------------------------------------------
//
// All four artifacts came back BYTE-IDENTICAL after a full re-emit -- same md5, clean `git status` -- against
// files committed three days and many processes earlier. Reproducibility also survives every arrangement that
// could have broken it, measured in one browser: the same graph emitted twice through one renderer, two freshly
// built graphs through one renderer, and a second renderer in the same process all produce the same 7,267-byte
// fragment. So three's node builders carry no per-emit counter that reaches the output text.
//
// *** THAT IS A PROPERTY, NOT A GUARANTEE, AND IT IS EXACTLY THE KIND OF PROPERTY THAT ROTS SILENTLY. *** A
// three.js upgrade, a Map iteration order, an added uniform: any of them could start moving the text, and today
// the only symptom would be a diff appearing in a commit somebody else was making. writeIfReproducible() below
// turns each of the eight writes into the check, at zero extra cost, because the emit has already happened by
// the time the write is reached.
//
// ---- AND v4480's OWN SURVEY MISCOUNTED THE ARTIFACTS: THERE ARE FOUR, NOT THREE ------------------------------
//
// pipelineGaps.mjs records emittedArtifacts: 3 and names tsl-emitted-{race,physics,compute}.json. There is a
// FOURTH -- tools/ship/tsl-emitted.json, with no suffix -- and it is the LARGEST of them at 43,239 bytes against
// race's 41,707. It is written by tslSource-selfcheck.mjs and read by wgslCorpus.mjs, which compiles two of its
// entries as generated WGSL. *** A GLOB THAT WANTS A HYPHEN AFTER "emitted" DOES NOT MATCH "tsl-emitted.json", ***
// which is how a survey looking for the set found three of the four and how this round nearly did the same.
// The count is corrected in gfx/pipelineGaps.mjs rather than quietly; the reader count v4480 recorded, 5, is
// re-derived here and holds.
"use strict";

/**
 * The four artifacts, who writes each and how many times. `writes` matters: tslRace-selfcheck writes its file
 * FIVE times in one run -- once with a fresh object and four more read-modify-write merges as each look is
 * emitted -- so a whole-file comparison at every write would flag the intermediate states as drift. The
 * comparison is per-KEY for that reason; see compareEmit().
 */
export const ARTIFACTS = Object.freeze([
    Object.freeze({ file: "tools/ship/tsl-emitted.json", writer: "tools/ship/tslSource-selfcheck.mjs",
        writes: 1, missedByV4480: true, languages: 2,
        note: "the badTv and blackbody pair; the largest artifact and the one with no suffix in its name" }),
    Object.freeze({ file: "tools/ship/tsl-emitted-race.json", writer: "tools/ship/tslRace-selfcheck.mjs",
        writes: 5, missedByV4480: false, languages: 2,
        note: "the Lyapunov look plus four sprite shells, merged in one key at a time" }),
    Object.freeze({ file: "tools/ship/tsl-emitted-physics.json", writer: "tools/ship/tslPhysics-selfcheck.mjs",
        writes: 1, missedByV4480: false, languages: 2, note: "the Lyapunov and Heidler keys" }),
    Object.freeze({ file: "tools/ship/tsl-emitted-compute.json", writer: "tools/ship/tslPhysics-selfcheck.mjs",
        writes: 1, missedByV4480: false, languages: 1,
        // *** ONE LANGUAGE, AND IT IS NOT A GAP: WebGL2 HAS NO COMPUTE SHADERS. *** There is no GLSL
        // counterpart to emit, so "both texts written to disk" cannot be true here and its absence is a
        // fact about the API rather than about this tree.
        note: "the Lyapunov sweep as a compute pass -- WGSL only, because WebGL2 has no compute stage" }),
]);

/** Files that load an artifact's CONTENT, as opposed to naming it in prose. Re-derived; v4480 said 5 and was right. */
export const CONTENT_READERS = Object.freeze([
    "tools/ship/wgslCorpus.mjs",              // compiles the generated WGSL out of all four
    "tools/ship/tslSource-selfcheck.mjs",     // reads its own back to assert a length
    "tools/ship/tslRace-selfcheck.mjs",       // reads its own back to merge the next look in
    "tools/ship/tslPhysics-selfcheck.mjs",    // same, for two files
    "tools/ship/pipelineGaps-selfcheck.mjs",  // grades that the set exists and is named
]);

/**
 * *** COMPARE ONLY THE KEYS THE FRESH EMIT CARRIES. ***
 * A read-modify-write site adds one key to a file that already holds four others; comparing whole files would
 * call every intermediate state a regression. Keys present only in the stored copy are another write's business.
 *
 * @param {object|null} stored  the parsed stored artifact, or null on a first run
 * @param {object} fresh        the object about to be written
 * @returns {{first: boolean, same: boolean, moved: string[], checked: string[], detail: string}}
 */
export function compareEmit(stored, fresh) {
    if (stored == null) return { first: true, same: true, moved: [], checked: [], detail: "no stored copy: first run" };
    const checked = [], moved = [];
    for (const k of Object.keys(fresh)) {
        // `at` and `note` are the round stamp and the prose beside it -- they move when a human edits them,
        // which is not the emitter drifting, so they are named as excluded rather than silently skipped.
        if (k === "at" || k === "note") continue;
        checked.push(k);
        if (JSON.stringify(stored[k]) !== JSON.stringify(fresh[k])) moved.push(k);
    }
    const detail = moved.length
        ? `${moved.length} of ${checked.length} keys moved: ${moved.join(", ")}`
        : `${checked.length} keys byte-identical to the stored artifact`;
    return { first: false, same: moved.length === 0, moved, checked, detail };
}

/**
 * *** THE BASELINE MUST BE TAKEN BEFORE THE RUN STARTS, AND FINDING THAT OUT COST THIS ROUND A RED. ***
 *
 * The first draft compared each write against whatever was on disk at that moment, which is correct for a gate
 * that writes its artifact once and wrong for tslRace-selfcheck, which writes FIVE times: once with a fresh
 * object that DROPS the four sprite keys, then four merges that add them back one at a time. By the time the
 * sprite merge runs, the file it would compare against no longer contains a sprite key -- because this gate's
 * own first write deleted it. All four merges reported their key as moved while the file on disk ended
 * byte-identical to the commit. *** THE FIRST WRITE ERASES THE EVIDENCE THE LATER ONES NEED. ***
 *
 * So the baseline is snapshotted once, before anything is written, and every write is graded against that.
 */
export function snapshot(fsMod, file) {
    try { return JSON.parse(fsMod.readFileSync(file, "utf8")); } catch { return null; }
}

/**
 * *** THE WRITE, WITH THE COMPARISON IN FRONT OF IT. *** Compare what is about to be written against the
 * pre-run baseline, THEN write. The caller gets the verdict back and grades it -- the point is that the check
 * costs nothing, because by the time a gate reaches its write the expensive emit has already happened.
 *
 * The write still happens when the bytes moved. That is deliberate: this is a REPORT, not a lock. A gate that
 * refused to write would leave the artifact stale and the corpus compiling last week's shader while a red row
 * explained why. The row goes red, the file goes forward, and the diff is there to review.
 *
 * `baseline` omitted means "read the file now", which is right for a gate that writes once and wrong for one
 * that writes several times -- see snapshot() above.
 */
export function writeIfReproducible(fsMod, file, obj, baseline) {
    const stored = baseline !== undefined ? baseline : snapshot(fsMod, file);
    const verdict = compareEmit(stored, obj);
    fsMod.writeFileSync(file, JSON.stringify(obj, null, 1));
    return verdict;
}

/**
 * *** THE FOUR ARTIFACTS DO NOT SHARE A SCHEMA, AND A CHECK THAT READ ONE OF THEM ASSUMED THEY DID. ***
 * tsl-emitted-race.json carries `wgsl` and `glsl` at the top; tsl-emitted.json nests them under `badTv` and
 * `blackbody`; physics under `lyapunov` and `heidler`; compute under `emitted` and `transplanted`. The
 * pipelineGaps gate stamped `arts[0]` and asserted top-level wgsl and glsl, which held only while arts[0]
 * happened to be the race file -- correcting the artifact list to four put a differently shaped file first and
 * the row went red on a fact about itself.
 *
 * *** AND THE FOURTH CARRIES ONE LANGUAGE, NOT TWO, AND THAT IS CORRECT. *** tsl-emitted-compute.json holds
 * the Lyapunov sweep as a COMPUTE pass, and WebGL2 has no compute shaders at all, so there is no GLSL
 * counterpart to write down. The survey's "BOTH texts written to disk" is true of three artifacts and
 * structurally impossible for the fourth. That is recorded as a property of the row rather than smoothed over,
 * because an exception nobody states is indistinguishable from an omission.
 *
 * The detection is by CONTENT, not by key name, since the compute artifact's texts are called `emitted` and
 * `transplanted`. *** AND THE MARKERS ARE BUILT FROM FRAGMENTS RATHER THAN WRITTEN OUT: *** render/backendParity.mjs
 * classifies every file in this tree by looking for exactly these strings, and spelling them here would make
 * this file a WGSL-bearing shader module. That trap has now been sprung three times -- v4462's census counting
 * its own patterns table, v4479's comment, v4483's -- so this one is disarmed on purpose.
 */
const _WG = ["@" + "compute", "@" + "vertex", "@" + "fragment", "vec3" + "<f32>", "fn " + "main"];
const _GL = ["#" + "version", "void " + "main", "gl_" + "Position", "gl_" + "FragColor"];

export function carriesBothLanguages(obj) {
    let wgsl = false, glsl = false;
    const walk = (v) => {
        if (v == null) return;
        if (typeof v === "string") {
            if (v.length > 200) {
                if (_WG.some((m) => v.includes(m))) wgsl = true;
                if (_GL.some((m) => v.includes(m))) glsl = true;
            }
            return;
        }
        if (typeof v === "object") for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(obj);
    return { wgsl, glsl, both: wgsl && glsl };
}

/** What v4484 measured. */
export const MEASURED_AT_V4484 = Object.freeze({
    artifacts: 4, writerGates: 3, writes: 8, contentReaders: 5,
    // v4480's two numbers, one wrong and one right.
    v4480SaidArtifacts: 3, v4480SaidReaders: 5, v4480ReadersHeld: true,
    largestArtifact: "tools/ship/tsl-emitted.json", largestBytes: 43239, raceBytes: 41707,
    // The measurement that answers the open question.
    freshEmitMatchesStored: true,
    reproducibleAcross: Object.freeze(["separate processes", "same graph twice on one renderer",
                                       "two fresh graphs on one renderer", "a second renderer in one process"]),
    badTvFragmentBytes: 7267,   // identical in all four arrangements
    three: "0.178.0",
    // *** THE CHECK'S OWN FIRST DRAFT WAS WRONG, AND THE ARTIFACTS WERE RIGHT. *** Four of the eight writes
    // reported drift while `git status` was clean, because tslRace's first write drops the four sprite keys
    // and its four merges then compared against a file its own run had already emptied.
    writesGradedAgainstAPreRunBaseline: 5,   // the five in tslRace-selfcheck
    falseDriftBeforeTheFix: 4,
    // Three artifacts carry both languages; the compute one carries WGSL alone, because WebGL2 has no compute.
    dualLanguageArtifacts: 3, wgslOnlyArtifacts: 1,
});
