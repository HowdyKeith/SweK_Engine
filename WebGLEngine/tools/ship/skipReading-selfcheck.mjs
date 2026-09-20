// WebGLEngine/tools/ship/skipReading-selfcheck.mjs -- v4582
//
// Run: node tools/ship/skipReading-selfcheck.mjs
// RUNTIME 267 ms ALONE (median of 266/267/283) and 322 ms AT EIGHT-WIDE (median of 304/318/322/338/343). It runs
// three gates as children to ask whether they decline, which is most of that cost and is the point: a census of
// skips that read the record instead of running the gates would be asking the record to confirm itself.
//
// SABOTAGE: 15 mutations, 15 red, no 0-RED, nothing crashed -- after one 0-RED that was a defect here. Replacing
// timingKind-selfcheck's member-count condition with `true` moved nothing: a row disarmed in place is invisible to
// the gate holding it, which is v4581's ratchet-baseline finding wearing another face, so this gate now vouches for
// that pin from outside. The other fourteen: the runner blinded again; the skip test removed while output is still
// captured; the tail unbounded; SKIPPED taken out of the enum; the kind read from the other run than the
// millisecond; kindsInferred dropped by the writer again, and carried forward WITHOUT removing what was swept; the
// two runners' SKIP_LINE patterns made to differ; a skipped entry relabelled loaded; one put back into
// kindsInferred; the list emptied; placementRender's capped entry relabelled loaded; the frozen census trimmed; and
// the frozen capture cost edited so nothing came out faster.
//
// *** THREE ENTRIES IN THE SWEEP RECORD WERE A GATE SAYING "I DID NOT RUN". ***
//
// tools/ship/selfchecks.mjs has refused to record a skip as a runtime since v3941, and the note it wrote then is
// still the clearest statement of why: placementRender had been filed at its SKIP time THREE TIMES, "the budget it
// overwrites with is the time it takes to say 'I did not run', which is the shortest possible time, so THE
// RESULTING BUDGET IS ALWAYS ABSURDLY SMALL and the first timeout looks like a hang in a check that is fine."
//
// THE SWEEP NEVER GOT THAT GUARD. render/holoPicture, render/holoAgree and tools/ship/pageFxOverlay skip without a
// rasteriser, exit 0 in well under the budget, and sat in sweep-timings.json at 234, 164 and 175 ms -- 2.4x to 3.6x
// their bare skip cost, so they are LOADED measurements of a refusal. Since v4579 they also carried a confident
// `loaded` kind, which answers a question nobody asked about a number that measures nothing.
//
// AND THE TREE ALREADY SAID SO, IN THE OTHER FILE'S VOICE. gateBudget.UNRESOLVED names two of the three and its
// entry for each reads "skips without a rasteriser, so this box has never run it to completion. Its former 55ms
// entry was the SKIP time." That is the SAME OBSERVATION, recorded against gate-timings, while the sweep went on
// doing it. gateBudget-selfcheck's row "nothing sits in UNRESOLVED that gate-timings.json has already measured" is
// green and CORRECT -- it reads the guarded file. The rule held everywhere it looked.
//
// *** THE MECHANICAL REASON IS BETTER THAN FORGETFULNESS: THE SWEEP COULD NOT SEE. *** runOneAsync spawned with
// `stdio: "ignore"`. A skip's only evidence is the gate's printed declaration, and an exit code alone cannot tell a
// skip from a fast pass, so the guard was not so much forgotten as unaffordable-looking over 1,642 gates.
// MEASURED BEFORE PAYING FOR IT: piping and keeping a 4 KB tail costs 1.4 ms a gate -- inside the run-to-run noise,
// with two of eight sampled gates coming out FASTER captured -- or about 2 s across a full sweep. The
// output-blindness that prevented the repair for eleven rounds was worth two seconds.
//
// AND DRIVING THE FIXED WRITER FOUND A SECOND FAULT IN THE SAME FILE. v4579 wrote `kindsInferred`, the 1,620
// entries whose kind was back-derived rather than watched, "because an inference dressed as an observation is the
// fault five rounds of this arc have been about" -- and never taught this writer about the field. A five-gate run
// took the list from 1,620 to ZERO and left 1,637 inferred kinds presenting as observed. Found by running the
// writer, not by reading it, exactly as v4580's `complete: true` was.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KIND } from "./quickSweep.mjs";
import { UNRESOLVED } from "./gateBudget.mjs";
import { codeHas, noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const S = JSON.parse(fs.readFileSync(path.join(HERE, "sweep-timings.json"), "utf8"));
const G = JSON.parse(fs.readFileSync(path.join(HERE, "gate-timings.json"), "utf8"));
const QS = fs.readFileSync(path.join(HERE, "quickSweep.mjs"), "utf8");
const SC = fs.readFileSync(path.join(HERE, "selfchecks.mjs"), "utf8");
// v4647k -- the THIRD runner. tools/ship/sweepRotation.mjs runs every rotation through
// redCensus.runGate, into the SAME sweep-timings.json quickSweep writes.
const RC = fs.readFileSync(path.join(HERE, "redCensus.mjs"), "utf8");
import * as RCmod from "./redCensus.mjs";
import * as SR from "./sweepRotation.mjs";

// The convention, written once here and compared against BOTH runners rather than restated in each row.
const SKIP_LINE = /-selfcheck:\s*(SKIPPED|skipped)\b/;

// ---- v4647k SABOTAGES, RESULTS BY NAME ------------------------------------------------------------------
//
//   XA. runGate goes back to stdio "ignore"              -> 2 RED  (source row + the run)
//   XB. runGate calls every clean exit a skip            -> 2 RED  (source row + the control)
//   XC. the third runner uses a DIFFERENT pattern        -> 1 RED
//   XD. mergeTimings forgets the skip and writes `alone` -> 1 RED
//
// *** XD FIRST MEASURED AT ZERO, AND XA/XB AT ONE. *** Section 1 compared SOURCE TEXT, which is right for
// "do the three agree" and is not enough: deleting the skip branch from the rotation's writer -- the line
// that actually puts `skipped` in the record -- changed no row, because no row ran it. A source row grades
// a spelling. Three rows were added that DRIVE runGate and mergeTimings, and all four sabotages now land.

console.log("skipReading-selfcheck -- a gate that declined to run is not a measurement of that gate\n");

// ---------------------------------------------------------------------------
console.log("1. *** ALL THREE RUNNERS READ THE SAME DECLARATION, AND THE THIRD WAS COUNTED BY NOBODY ***");
{
    // Compared as SOURCE TEXT because the two runners cannot be made to agree by inspection of their output: one
    // writes gate-timings and one writes sweep-timings, and the whole defect was that the rule lived in one.
    const scGuard = codeHas(SC, /const declinedToRun = SKIP_LINE\.test/);
    const qsGuard = codeHas(QS, /skipped: SKIP_LINE\.test\(tail\)/);
    // *** v4647k -- THERE ARE THREE RUNNERS AND THIS SECTION COUNTED TWO. ***
    // redCensus.runGate is the third, and tools/ship/sweepRotation.mjs writes sweep-timings.json through it
    // -- the same file quickSweep writes. So one writer of that record could see a gate decline and the
    // other could not, which is the two-modules-one-convention defect a level up from the one this section
    // was written about. It had already cost something: the 2026-09-09 rotation filed placementRender at
    // 56 ms code 0, a green runtime, for a gate that prints "skipped (jsdom absent)" in 53.
    //
    // A CENSUS OF RUNNERS THAT MISSES A RUNNER is the same shape as this session's four stale censuses, and
    // it was invisible for the same reason every time: the number was typed, not derived.
    const rcGuard = codeHas(RC, /skipped: r\.status === 0 && SKIP_LINE\.test\(tail\)/);
    const qsConst = (QS.match(/const SKIP_LINE = (\/[^\n]*\/)/) || [])[1];
    const scConst = (SC.match(/const SKIP_LINE = (\/[^\n]*\/)/) || [])[1];
    const rcConst = (RC.match(/const SKIP_LINE = (\/[^\n]*\/)/) || [])[1];
    say("selfchecks.mjs SKIP_LINE", String(scConst));
    say("quickSweep.mjs  SKIP_LINE", String(qsConst));
    say("redCensus.mjs   SKIP_LINE", String(rcConst));

    ok("*** the sweep now reads the skip declaration, as the suite runner has since v3941 ***",
        scGuard && qsGuard,
        "eleven rounds of this arc have read sweep-timings.json as a record of runtimes while three of its entries " +
        "measured a gate refusing to start.");
    ok("!! *** ...and so does the THIRD runner, which writes the same record as the sweep ***",
        rcGuard,
        "redCensus.runGate ran with `stdio: \"ignore\"` -- the identical blindness, in the runner " +
        "tools/ship/sweepRotation.mjs writes sweep-timings.json through. From an exit code a skip is a fast " +
        "pass, so the guard was not forgotten, it was INVISIBLE from where the writer stood.");
    ok("!! ...and all THREE runners test the SAME pattern, character for character",
        qsConst && scConst && rcConst && qsConst === scConst && qsConst === rcConst,
        `${qsConst} in all three. Two spellings of one convention is the two-constants-one-name defect, and this ` +
        "tree has it on record in gateBudget/androidRunner's DEFAULT_BUDGET_MS. Not shared as a module: each " +
        "runner is standalone by design, so they are checked equal instead -- and the count of them is now " +
        "three, because a census that misses a member is this session's most-repeated fault.");
    // *** DRIVEN, NOT ONLY READ. *** The rows above compare SOURCE TEXT, which is right for "do the three
    // agree" and is not enough: sabotage XD deleted the skip branch from mergeTimings -- the line that
    // actually writes `skipped` into the record -- and NOTHING went red, because no row ran it. A source row
    // grades a spelling; these grade what the writer does.
    const skipRun = RCmod.runGate("tools/ship/placementRender-selfcheck.mjs", { timeoutMs: 60000 });
    const passRun = RCmod.runGate("tools/ship/timingSemantics-selfcheck.mjs", { timeoutMs: 60000 });
    ok("!! *** runGate REPORTS the skip, run here rather than read out of the source ***",
        skipRun.skipped === true && skipRun.code === 0,
        `placementRender exits ${skipRun.code} and declines; timingSemantics exits ${passRun.code} and does not`);
    ok("!! CONTROL: and a gate that really runs is not called a skip",
        passRun.skipped === false,
        "without this, `skipped: true` for everything passes the row above and marks the whole tree");

    const merged = SR.mergeTimings({ timings: {}, kinds: {} },
        [{ gate: "g", ms: 53, code: 0, finished: true, skipped: true }], "2026-09-20T00:00:00.000Z").merged;
    const mergedRun = SR.mergeTimings({ timings: {}, kinds: {} },
        [{ gate: "g", ms: 53, code: 0, finished: true, skipped: false }], "2026-09-20T00:00:00.000Z").merged;
    ok("!! *** and the ROTATION'S WRITER turns that into kind `skipped`, where it had no word for one ***",
        merged.kinds.g === KIND.SKIPPED && mergedRun.kinds.g === "alone",
        `skipped -> ${merged.kinds.g}, ran -> ${mergedRun.kinds.g}. The rule is quickSweep's character for ` +
        "character: a declaration beats everything, because a gate that declined did not run");

    ok("...and this gate tests the same one, so its own census cannot be measuring something narrower",
        String(SKIP_LINE) === qsConst,
        `${String(SKIP_LINE)} -- a census run with a looser pattern would report skips the runners never see, and ` +
        "a tighter one would miss the entries it exists to find.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE SWEEP COULD NOT SEE A SKIP, AND THAT WAS A DELIBERATE CHOICE WITH A PRICE ***");
{
    // *** THREE INSTRUMENTS, THREE ROUNDS, AND FOUR WRONG CHOICES -- WRITTEN DOWN BECAUSE THE RULE IS NOT OBVIOUS.
    //
    // Asking "is this text still in the file" has three answers depending on where the text lives, and this arc has
    // now got it wrong once per round:
    //     the raw source   -- finds the text in the COMMENT that records its removal, so the gate demands history
    //                         be deleted to go green (v4580 once, v4581 twice, here once more)
    //     codeOnly/codeHas -- strips comments AND EMPTIES STRING LITERALS: right for a condition, wrong for
    //                         anything quoted. It reduced `stdio: ["ignore", "pipe", "pipe"]` to `["", "", ""]`
    //                         and broke the clause it was brought in to fix
    //     noComments       -- strips comments, keeps strings: the instrument for a string literal in live code
    //
    // The evidence here is a spawn option, which is a STRING LITERAL IN CODE, so noComments is the one. The fourth
    // wrong choice arrived in a row whose sibling clause was already using codeHas -- the pattern being that the
    // right instrument gets reached for on the clause under thought and the convenient one on its neighbour.
    const NC = noComments(QS);
    const blind = /stdio: "ignore"/.test(NC);
    const piped = /stdio: \["ignore", "pipe", "pipe"\]/.test(NC);
    const bounded = codeHas(QS, /slice\(-4096\)/);   // a call, not a string: codeHas is right for this one
    ok("*** the runner captures output now, bounded, rather than discarding it ***",
        piped && bounded && !blind,
        "a skip produces exactly one piece of evidence -- the gate's own printed line -- and `stdio: \"ignore\"` " +
        "threw it away. From an exit code a skip is indistinguishable from a fast pass, so the guard was not " +
        "forgotten, it was INVISIBLE from where the writer stood.");
    ok("...and the tail is capped rather than accumulated, because this runner's whole point is affording everything",
        bounded,
        "4 KB kept per gate. The skip declaration is printed at the end, so a bounded tail is not a compromise " +
        "on detection -- it is the same evidence with a ceiling on memory across 1,642 children.");

    // FROZEN: eight gates, each run three times both ways, medians compared. `date`-free -- the probe timed the
    // spawn itself, so the number is the runner's cost and not a shell's.
    const CAPTURE_COST_V4582 = Object.freeze({ gates: 8, ignoreMs: 635, captureMs: 646, faster: 2 });
    const c = CAPTURE_COST_V4582;
    const perGate = (c.captureMs - c.ignoreMs) / c.gates;
    say("eight gates, ignore / capture", `${c.ignoreMs} ms / ${c.captureMs} ms = ${(c.captureMs / c.ignoreMs).toFixed(3)}x`);
    say("per-gate overhead, and over a full sweep", `${perGate.toFixed(1)} ms -> ${(perGate * 1642 / 1000).toFixed(1)} s`);
    ok("*** the cost of seeing is within noise, and it is stated as within noise rather than as a number ***",
        perGate < 5 && c.faster >= 1,
        `${perGate.toFixed(1)} ms a gate, and ${c.faster} of the ${c.gates} sampled gates came out FASTER captured ` +
        "-- which is how you know this measurement is bounded by noise and not a clean reading of the overhead. " +
        "THE CLAIM IS THE CEILING, NOT THE VALUE: a couple of seconds across a full sweep, for evidence that " +
        "three entries were not runtimes at all.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE CENSUS, DRIVEN BY RUNNING THE GATES RATHER THAN BY READING THE RECORD ***");
{
    // FROZEN. Every gate in the tree that can print the declaration, run once each at v4582, against what both
    // records held at the time. The three skippers' sweep entries were 2.4x-3.6x their bare skip cost, which is
    // the load factor -- so they were LOADED readings of a refusal, not even honest skip times.
    const CENSUS_V4582 = Object.freeze({
        skippable: 22, skipHere: 4,
        contaminated: Object.freeze([
            { gate: "render/holoAgree-selfcheck.mjs", sweepWas: 164, skipMs: 69 },
            { gate: "render/holoPicture-selfcheck.mjs", sweepWas: 234, skipMs: 69 },
            { gate: "tools/ship/pageFxOverlay-selfcheck.mjs", sweepWas: 175, skipMs: 49 },
        ]),
        // *** v4647k -- THE FOURTH SKIPPER IS MARKED NOW, AND WHAT PROTECTED IT BEFORE WAS AN ACCIDENT. ***
        // It used to sit at 20,125 ms, code 124 -- the KILLER'S CLOCK, already marked `capped` -- and v4582
        // recorded that as safe, because nothing reads a cap as a runtime. True, and it was luck: the
        // protection came from the gate having been EXILED, not from anything knowing it declines.
        //
        // That accident then cost something. The 2026-09-09 rotation filed the same gate at 56 ms, code 0 --
        // a green runtime -- because runGate ran with `stdio: "ignore"` and could not see the declaration.
        // THE THIRD RUNNER HAD THE DEFECT SECTION 1 ABOVE FIXED IN THE OTHER TWO, and it is the runner the
        // rotation writes sweep-timings.json through. v4647j could not close sweepCoverage's last three rows
        // because of that one entry; v4647k gave runGate eyes, re-timed the gate at 53 ms, and the record
        // now says `skipped` because a writer watched it decline.
        markedSince_v4647k: "tools/ship/placementRender-selfcheck.mjs",
    });
    for (const c of CENSUS_V4582.contaminated)
        say(c.gate.split("/").pop().padEnd(34), `sweep held ${c.sweepWas} ms against a ${c.skipMs} ms skip -- ${(c.sweepWas / c.skipMs).toFixed(1)}x`);

    ok("*** 22 gates in the tree can decline to run, 4 decline on this box, and 3 of those held a code-0 sweep reading ***",
        CENSUS_V4582.skippable === 22 && CENSUS_V4582.skipHere === 4 && CENSUS_V4582.contaminated.length === 3,
        "found by RUNNING all 22 and reading their output, not by pattern-matching the record. 18 of the 22 have " +
        "their dependency present here and produced real measurements, which is why this is a narrow finding and " +
        "not a claim that the record is untrustworthy.");

    ok("...and the contaminated readings were 2.4x-3.6x the bare skip cost, so they were LOADED refusals",
        CENSUS_V4582.contaminated.every((c) => c.sweepWas / c.skipMs > 2 && c.sweepWas / c.skipMs < 4),
        "the load factor applied to a gate that never started. Even as skip times they were wrong -- the sweep " +
        "measured eight-way-contended process startup for a check that does nothing.");

    ok("!! *** the fourth skipper is MARKED now, where it used to be protected by having been exiled ***",
        (S.kinds || {})[CENSUS_V4582.markedSince_v4647k] === KIND.SKIPPED,
        `${CENSUS_V4582.markedSince_v4647k} sits at ${(S.timings || {})[CENSUS_V4582.markedSince_v4647k]} ms, ` +
        `code ${(S.codes || {})[CENSUS_V4582.markedSince_v4647k]}, kind ` +
        `${(S.kinds || {})[CENSUS_V4582.markedSince_v4647k]}. It was 20,125 ms at the cap -- safe by accident, ` +
        "because an exiled gate's number is nobody's runtime. The 2026-09-09 rotation then filed it at 56 ms " +
        "code 0 through a runner that could not see the declaration, and THAT is the entry that kept " +
        "sweepCoverage red. A gate is safe when a writer watched it decline, not when it happens to be out.");
}

// ---------------------------------------------------------------------------
console.log("\n4. AND THE RECORD SAYS SO NOW, IN A KIND THE BRANCH RULE CANNOT PRODUCE");
{
    const skipped = Object.keys(S.kinds || {}).filter((g) => S.kinds[g] === KIND.SKIPPED);
    const inferred = new Set(S.kindsInferred || []);
    say("entries marked skipped", `${skipped.length}: ${skipped.map((g) => g.split("/").pop()).join(", ")}`);

    // v4647k: THREE became FOUR, and the row is what noticed. It was written saying "any fourth would show
    // up as a mismatch here rather than as a quiet relabelling", and a fourth did -- not a new skipper, but
    // the one v4582 recorded as protected-by-exile, now marked because a writer finally watched it decline.
    ok("!! *** every gate that declines here is marked skipped, and nothing else is ***",
        skipped.length === 4 && skipped.every((g) => SKIP_LINE.test(runTail(g))),
        `${skipped.length} marked, each re-run in this process and each printing the declaration -- not ` +
        "trusted from the record. Any fifth shows up here as a mismatch rather than as a quiet relabelling.");

    ok("...and none of them is marked by INFERENCE, because ms-and-code cannot see a skip",
        skipped.every((g) => !inferred.has(g)),
        "the branch rule reads a millisecond and an exit code; a skipping gate exits 0 under the budget and can " +
        "only ever be called LOADED by it. An inferred SKIPPED would be a label back-filled onto data that " +
        "cannot support it -- the fault v4579 built kindsInferred to name.");

    // *** AND THE ENUM'S COMPLETENESS IS ASSERTED SOMEWHERE, CHECKED FROM HERE BECAUSE THAT GATE CANNOT. ***
    // A sabotage replaced timingKind-selfcheck's member condition with `true` and NOTHING MOVED: a row disarmed in
    // place is invisible to the gate holding it, which is v4581's finding about a ratchet baseline wearing another
    // face. So the count lives in two places on purpose -- that gate asserts it, and this one asserts that it does.
    const TK = fs.readFileSync(path.join(HERE, "timingKind-selfcheck.mjs"), "utf8");
    ok("...and timingKind-selfcheck still PINS the number of kinds, which only a second gate can vouch for",
        codeHas(TK, /Object\.keys\(KIND\)\.length === 4/) && Object.keys(KIND).length === 4,
        "a fifth member arriving unnoticed is how a reader comes to switch on a value it has never seen, and the " +
        "row that would catch it can be replaced by `true` without its own gate noticing. When this row goes red " +
        "the answer is to look at KIND, never to delete the pin.");

    ok("...and the kind is chosen from the SAME run that produced the millisecond",
        codeHas(QS, /const skipped = r\.serialSkipped \?\? r\.parallelSkipped;/),
        "`serialSkipped ?? parallelSkipped` mirrors `serialMs ?? parallelMs` exactly. A label taken from the other " +
        "run is the drift v4579 built this map to prevent, and there are two runs per red gate.");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** AND RUNNING THE FIXED WRITER ERASED v4579'S OTHER RECORD, WHICH READING IT WOULD NOT HAVE SHOWN ***");
{
    const inferred = (S.kindsInferred || []).length;
    const kinds = Object.keys(S.kinds || {}).length;
    say("kinds / of which inferred", `${kinds} / ${inferred}`);

    ok("*** the writer carries kindsInferred forward instead of dropping it ***",
        codeHas(QS, /kindsInferred: \(prior\.kindsInferred \|\| \[\]\)\.filter/),
        "v4579 wrote the list and never taught the writer about the field, so the FIRST REAL SWEEP would drop it. " +
        "Driving this round's five-gate run took it from 1,620 to ZERO and left 1,637 inferred kinds presenting as " +
        "observed -- precisely the inference-dressed-as-observation that list exists to prevent, caused by the " +
        "mechanism meant to record it. FOUND BY RUNNING THE WRITER: reading it shows a field that is simply absent.");

    // *** v4637 -- `inferred > 1500` WAS CALIBRATED TO A FIVE-GATE RUN. *** It was written the same hour the
    // writer was fixed, when the only sweep that had run since touched five gates, so 1,620-minus-five was
    // what the list looked like. A 1,287-gate rotation then swept the tree and the list fell to 444 -- the
    // row's own upper clause working exactly as intended -- and the lower bound called it the bug returning.
    // timingKind carried the mirror image of this number (`observed < 50`) and went red on the same sweep.
    //
    // The bound that survives a sweep of any size is the CORRESPONDENCE, not the count: a gate this run swept
    // is out of the list, a gate it did not sweep is in it unless some earlier run watched it. `captured`
    // names the run, so both directions are checkable here.
    const swept = Object.keys(S.timings).filter((g) => (S.at || {})[g] === S.captured);
    const sweptButInferred = swept.filter((g) => (S.kindsInferred || []).includes(g));
    ok("...and a gate this run swept LEAVES the list, because its kind was watched",
        inferred > 0 && inferred < kinds && swept.length > 0 && sweptButInferred.length === 0,
        `${inferred} still inferred of ${kinds}; the capture swept ${swept.length} and ${sweptButInferred.length} of ` +
        "those are still called inferred. Both ends matter: a list that emptied would be the bug again, and one " +
        "that never shrank would mean sweeping a gate teaches the record nothing.");

    ok("...and the three newly-marked skips are among what left it",
        Object.keys(S.kinds).filter((g) => S.kinds[g] === KIND.SKIPPED).every((g) => !(S.kindsInferred || []).includes(g)),
        "they were in the 1,620 as `loaded` inferences. Observing them is what corrected both the kind and its " +
        "provenance, in one write.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE OTHER RECORD WAS ALREADY RIGHT, AND SAYING SO IS HALF THE FINDING");
{
    const skippers = ["render/holoAgree-selfcheck.mjs", "render/holoPicture-selfcheck.mjs", "tools/ship/pageFxOverlay-selfcheck.mjs"];
    const inGate = skippers.filter((g) => typeof (G.timings || {})[g] === "number");
    ok("*** gate-timings.json holds no entry for any of the three, which is v3941's guard working ***",
        inGate.length === 0,
        "the suite runner has excluded a skip from the record for eleven rounds. THE DEFECT WAS NEVER THAT THE " +
        "TREE DID NOT KNOW -- it was that the knowledge lived in one of two runners, which is v4580's fixture race " +
        "and v4581's prose rule wearing a third face.");

    // UNRESOLVED names two of the three and says what their old entries were. Read from the table, not quoted.
    const named = Object.keys(UNRESOLVED).filter((g) => skippers.includes(g));
    ok("...and gateBudget.UNRESOLVED had written the diagnosis down, for the other file",
        named.length === 2 && named.every((g) => /SKIP time/.test(String(UNRESOLVED[g]))),
        named.join(", ") + ' -- each says "Its former NNms entry was the SKIP time". The sentence was already in ' +
        "the tree, about gate-timings, while sweep-timings kept the number.");

    ok("...and that table's own cross-check is green for the right reason, not by luck",
        Object.keys(UNRESOLVED).every((g) => !((G.timings || {})[g] > 0)),
        "gateBudget-selfcheck asserts nothing in UNRESOLVED has been measured, reading gate-timings. It was green " +
        "before this round and is green after: THE RULE HELD EVERYWHERE IT LOOKED, and the round is about where it " +
        "did not look. A green row is not evidence that a rule is applied, only that it is applied here.");
}

/** Run a gate and hand back its output tail -- the only way to ask whether it declines to run. */
function runTail(rel) {
    const r = spawnSync(process.execPath, [path.join(ENG, rel)], { cwd: ENG, encoding: "utf8", timeout: 120000 });
    return String(r.stdout || "") + String(r.stderr || "");
}

console.log(fails ? `\nskipReading-selfcheck: ${fails} FAILED` : "\nskipReading-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
