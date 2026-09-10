// WebGLEngine/tools/ship/recordReach.mjs -- v4548
//
// *** THE SHIP RITUAL CHECKS 49 OF THIS TREE'S 93 FROZEN RECORDS. THE OTHER 44 IT DOES NOT TOUCH. ***
//
// The round that produced this file started from two gates. tools/ship/frozenRecords-selfcheck.mjs and
// tools/ship/recordDrift-selfcheck.mjs measured 3,446 ms and 3,026 ms against a 3,000 ms ship-time sweep
// budget, so neither ran at ship time -- and BUDGET_DRIFT_V4536 was added to the tree at commit 4817a29b
// without its census being re-taken, after which nine rounds shipped ALL GREEN over a record that was wrong.
// Fixing those two was the obvious job. Asking how many OTHER records are in the same position was not, and
// it is where the number is:
//
//     93 frozen records
//     49  checked at ship time -- at least one guardian gate is under the budget
//     25  guarded ONLY by gates over the budget, so the guard exists and never runs
//     19  guarded by nothing at all
//     --  44 of 93, FORTY-SEVEN PER CENT, unchecked by the ritual
//
// *** AND THREE OF THE GUARDS ARE NOT MERELY SLOW, THEY ARE AT THE TIMEOUT CAP. *** redCensus-selfcheck,
// transmission-selfcheck and dockFraming-selfcheck are recorded at 20,021 / 20,015 / 20,009 ms against a
// 20,000 ms cap -- they do not finish. FIXED_AT_V4279, BTDF_VERDICT_V4458 and NOISE_FLOOR_V4304 have a
// guardian on paper and nothing that has run in a very long time.
//
// ---- WHAT THIS MODULE IS FOR, AND WHAT IT DELIBERATELY IS NOT ----------------------------------------------
//
// It is a RATCHET, not a target. It does not claim 44 is acceptable and it does not try to fix them: three of
// those gates are at the cap and one is a twenty-second commit walk over a vendored repository, which are
// four separate rounds and not this one. What it refuses is the failure that produced it -- a record whose
// last guardian quietly drifts over the budget, and nothing anywhere says so.
//
// The population is DERIVED on every run, from tools/ship/frozenRecords.mjs's census joined to
// tools/ship/sweep-timings.json, because the whole subject of this file is a number that went stale while
// being recorded. A pinned list of unreachable records would be the same defect one level up.
//
// *** THE JOIN IS THE WHOLE INSTRUMENT AND EITHER HALF ALONE SAYS NOTHING. *** frozenRecords already knew
// which gates name which records; quickSweep already knew which gates it can afford. Neither knew that
// twenty-five records sit in the gap, because nothing had ever put the two tables next to each other.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FR from "./frozenRecords.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The sweep's own default, read rather than retyped -- see quickSweep.DEFAULTS.budgetMs. */
export const TIMINGS = "tools/ship/sweep-timings.json";

/**
 * *** A TORN READ AND A CATASTROPHE LOOK IDENTICAL TO A RATCHET, AND THIS ONE RETURNED THE CATASTROPHE. ***
 * The first draft caught a parse failure and returned an EMPTY timings map, so a read of this file WHILE
 * tools/ship/quickSweep.mjs was rewriting it made every guardian gate look unmeasured, took `unchecked` from
 * 43 to about 74, and reddened the ratchet. Measured symptom: recordReach-selfcheck went red twice inside a
 * full sweep and passed on every one of 68 runs under 16-way CPU load afterwards -- because the load was
 * never the trigger; the concurrent WRITE was. That is the "fails a ship at random and never reproduces
 * alone" shape gateSweep.mjs's own header calls the worst thing a ship-time check can be.
 *
 * `ok` is now returned rather than assumed, so a caller can refuse to judge instead of judging on nothing.
 */
export function readTimings(root = ENG) {
    try {
        const j = JSON.parse(fs.readFileSync(path.join(root, TIMINGS), "utf8"));
        const n = Object.keys(j.timings || {}).length;
        return { ...j, ok: n > 0, entries: n };
    } catch (e) {
        return { timings: {}, codes: {}, budgetMs: null, capMs: null, ok: false, entries: 0,
                 error: String(e && e.message).slice(0, 120) };
    }
}

export const CLASS = Object.freeze({
    CHECKED: "checked",            // at least one guardian gate runs at ship time
    OVER_BUDGET: "over-budget",    // guarded, but every guardian was MEASURED and is too slow for the sweep
    // *** SEPARATE FROM over-budget, BECAUSE "TOO SLOW" AND "NEVER TIMED" ARE DIFFERENT FACTS. *** A gate
    // added this round has no entry in sweep-timings.json until a sweep writes one, and the first draft
    // counted that as "does not run at ship time" -- so adding a guardian made the record it guards look
    // WORSE until the next sweep. quickSweep already keeps `unmeasured` apart from `skippedOverBudget` for
    // the same reason; this row was the only place in the tree that blurred them.
    UNMEASURED: "unmeasured",      // guarded, but no guardian has a recorded timing at all
    UNGUARDED: "unguarded",        // no gate anywhere names it
});

/**
 * Join the record census to the sweep timings and classify every record.
 *
 * `timings` and `census` are injectable so the gate can hand this a world where one gate got slower and
 * watch the count move -- a ratchet that cannot be shown to move is a number nobody has tested.
 */
export function reach({ budgetMs = null, timings = null, census = null, root = ENG } = {}) {
    const t = timings || readTimings(root);
    const budget = budgetMs ?? t.budgetMs ?? 3000;
    const c = census || FR.census();
    const timed = (g) => t.timings?.[g] != null;
    const runsAtShipTime = (g) => timed(g) && t.timings[g] <= budget;
    const rows = c.records.map((r) => {
        const cls = !r.guardians.length ? CLASS.UNGUARDED
            : r.guardians.some(runsAtShipTime) ? CLASS.CHECKED
            : r.guardians.some(timed) ? CLASS.OVER_BUDGET
            : CLASS.UNMEASURED;
        return Object.freeze({
            name: r.name, file: r.file, guardians: r.guardians, cls,
            // the cheapest guardian, so a reader knows how far from the budget the record actually is
            bestMs: r.guardians.length ? Math.min(...r.guardians.map((g) => t.timings?.[g] ?? Infinity)) : null,
        });
    });
    const by = (k) => rows.filter((r) => r.cls === k);
    const overBudget = by(CLASS.OVER_BUDGET), unguarded = by(CLASS.UNGUARDED), unmeasured = by(CLASS.UNMEASURED);
    // Gates that are the ONLY thing standing between a record and nobody checking it, and are too slow to
    // stand there. Sorted slowest first, because the three at the cap are a different problem from the
    // three that are a few hundred milliseconds over.
    const blockers = new Map();
    for (const r of overBudget) for (const g of r.guardians) {
        if (!blockers.has(g)) blockers.set(g, { gate: g, ms: t.timings?.[g] ?? null, records: [] });
        blockers.get(g).records.push(r.name);
    }
    return Object.freeze({
        // `judgeable` is false when the timings file could not be read or held nothing -- a caller must not
        // ratchet on that, because it is an absence of evidence rather than a regression.
        judgeable: t.ok !== false, timingEntries: t.entries ?? Object.keys(t.timings || {}).length,
        budgetMs: budget, capMs: t.capMs ?? null,
        total: rows.length,
        checked: by(CLASS.CHECKED).length,
        overBudget: overBudget.length,
        unmeasured: unmeasured.length,
        unguarded: unguarded.length,
        // A record whose only guardian has never been timed is NOT counted against the ratchet: it is a gate
        // waiting for its first sweep, and counting it would make adding a guardian look like a regression.
        unchecked: overBudget.length + unguarded.length,
        rows: Object.freeze(rows),
        blockers: Object.freeze([...blockers.values()].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))),
        // A gate recorded AT OR OVER the cap did not finish; it is a different fact from "slow" and is
        // counted separately so a report cannot blur them.
        // *** v4568 -- "AT THE CAP" AND "DOES NOT FINISH" ARE TWO FACTS AND THIS CONFLATED THEM. ***
        // The reading being at or over the cap was used as a proxy for the process having been cut off, which
        // is exactly the defect KILLED_PASS_V4568 is about, in the module that reports on it. It bit
        // immediately: tools/ship/redCensus-selfcheck.mjs was 90,096 ms and killed, was made to finish in
        // 45,245 ms by bounding its register re-run, and this row went on calling it a gate that "does not
        // finish" -- a claim its own recorded `finished: true` contradicts. `finished` is written by whatever
        // ran the gate, so it is asked rather than inferred; a reading with no `finished` at all is still
        // treated as unfinished, because an unknown is not a pass.
        atCap: Object.freeze([...blockers.values()]
            .filter((b) => t.capMs != null && b.ms >= t.capMs && (t.finished || {})[b.gate] !== true)
            .map((b) => b.gate)),
        // Expensive AND graded: it ran to completion, it just costs more than the cap. A different fact from
        // the one above and worth its own name, since the repair for it is speed and not a verdict.
        gradedOverCap: Object.freeze([...blockers.values()]
            .filter((b) => t.capMs != null && b.ms >= t.capMs && (t.finished || {})[b.gate] === true)
            .map((b) => b.gate)),
    });
}

/**
 * *** "UNGUARDED" WAS DOING TWO JOBS AND ONE OF THEM WAS THE WRONG QUESTION. ***
 *
 * The class above means "no gate NAMES it", and every reader of this module -- including me, for four rounds
 * -- read it as "a coverage hole somebody forgot to close". Asked properly at v4577, of the eleven:
 *
 *     9   NO CODE ANYWHERE NAMES THEM. They are prose in object form -- MEASURED_AT_V4421 records what a
 *         round changed in ev/shipDebris.mjs, REFUSAL_ATTRIBUTION_V4481 records what three 403s turned out to
 *         be. Nothing reads them because there is nothing to read them FOR. A guardian for one of these would
 *         have to re-derive a past round's measurement, which is a round each, not a gap.
 *     2   ARE read, and by something that CANNOT FAIL ON THE VALUE, which is the actionable half:
 *           MEASURED_V4527      physics/raceKnob.mjs prints it out of its own reportLines()
 *           MEASURED_AT_V4415   physics/render/pathTracerGpu.mjs feeds it to PROBES[0].key(), and the only
 *                               gate that calls key() -- tools/ship/probeConvention-selfcheck.mjs -- asserts
 *                               the values are FINITE. Measured: `hit: 0.5` -> `hit: 0.77` leaves that gate at
 *                               exit 0 with zero FAIL lines, because 0.77 is finite too.
 *
 * The second bucket is this tree's oldest defect wearing a new coat -- a row that cannot fail -- and it is
 * worth its own number because it is the one that can be repaired by a row rather than by a round.
 *
 * *** IT IS NOT FOLDED INTO reach(). *** readSites is a 216 ms scan of every source in the tree, reach() is
 * called several times per gate, and a ratchet that got slower to report a nuance is how frozenRecords-selfcheck
 * crossed the budget at v4536 in the first place.
 */
export function splitUnguarded({ census = null, root = ENG } = {}) {
    const c = census || FR.census();
    const names = c.records.filter((r) => !r.guardians.length).map((r) => r.name);
    const sites = FR.readSites(names, { root });
    const rows = names.map((n) => Object.freeze({ name: n, readBy: Object.freeze(sites.get(n) || []) }));
    return Object.freeze({
        total: rows.length,
        // named by nothing at all: documentary, and a guardian is the wrong ask
        documentary: Object.freeze(rows.filter((r) => !r.readBy.length).map((r) => r.name)),
        // named by code, but no GATE names it -- so whatever reads it cannot be failing on its value
        readUnchecked: Object.freeze(rows.filter((r) => r.readBy.length)),
        rows: Object.freeze(rows),
    });
}

/**
 * *** THE RATCHET. *** Measured at v4548, on the tree as this round left it. It is a CEILING that may fall
 * and must not rise: a round that puts a record's last guardian over the budget moves `unchecked` up and the
 * gate goes red, which is exactly what nothing did when frozenRecords-selfcheck crossed at v4536.
 *
 * These are not a target. 44 was the number BEFORE this round; the four rescued here are the two record
 * detectors' own records, recovered by making those gates 2.5x and 1.4x faster rather than by widening the
 * budget for them.
 */
export const REACH_AT_V4548 = Object.freeze({
    at: "v4548",
    budgetMs: 3000,
    // v4577: 104 -> 105 records and 72 -> 72 checked. UNGUARDED_SPLIT_V4577 landed in this very file, and the
    // ratchet went red on the round that wrote it FOR THE FOURTH TIME RUNNING -- a record in recordReach.mjs
    // is guarded only by recordReach-selfcheck.mjs naming it, which it now does. Three records LEFT the
    // unguarded bucket the same round (12 -> 9, plus this arrival = 10), and `unchecked` went 32 -> 32: two
    // of the three moved to over-budget rather than to checked, so the tier runs them and the sweep still
    // does not. That distinction is the reason this ratchet counts unchecked and not unguarded.
    // v4578: 105 -> 106 records and the ceiling did not move. SHADER_SINHASH_V4578 landed in
    // render/exactHash.mjs guarded by exactHash-selfcheck at 1,656 ms -- under the 3,000 ms budget, so it
    // arrived CHECKED. That is what adding a record properly looks like, against the nine this tree carries
    // that no code names at all.
    // v4583: 106 -> 107 and the ceiling did not move. CORPUS_AT_V4583 landed in
    // tools/export/glbConformance-selfcheck.mjs guarded by that same file at 441 ms against the 3,000 ms
    // budget, so it arrived CHECKED -- the second round running where a new record costs the unchecked
    // population nothing. Worth saying because the previous four rounds each went red here on their own
    // arrival: a record written into a module whose gate is over budget arrives unchecked, and this one was
    // written into a gate that runs at ship time on purpose.
    total: 107,
    // *** READ OFF THE INSTRUMENT, NOT PREDICTED. *** The first draft of this record guessed 53/21/19/40 from
    // which gates the round had sped up, and was wrong on three of the four: the comment-strip fix below
    // moved two records the other way at the same time, and a guess cannot see two changes at once.
    // BEFORE (93 records, both detectors over budget): 49 checked, 25 over-budget, 19 unguarded, 44 unchecked.
    beforeThisRound: Object.freeze({ total: 93, checked: 49, overBudget: 25, unguarded: 19, unchecked: 44 }),
    // AFTER, and the two movements are in opposite directions and both real:
    //   frozenRecords-selfcheck 3,289 -> 1,255 ms and recordDrift-selfcheck 3,164 -> 1,820 ms brought four
    //   records back inside the budget;
    //   stripping comments before the guardian search took TWO records OUT of "guarded" altogether, because
    //   they were credited to gates that only MENTION them in prose.
    // v4552: 94 -> 95 records and 51 -> 52 checked. nav/detourScale.mjs's MEASURED_AT_V4552 arrived with a
    // guardian already under budget, so the unchecked ceiling did not move -- which is what adding a record
    // properly looks like, against the 20 in this tree that no gate names at all.
    // v4554: 95 -> 96 records and 52 -> 53 checked. world/surfaceProbe.mjs's MEASURED_AT_V4553 arrived
    // with a guardian already under budget, so the unchecked ceiling of 43 did not move -- the second
    // round running that adding a record properly looks like this rather than like a rise.
    // v4562: 96 -> 97 records and 53 -> 54 checked. SWEEP_CONTENTION_V4562 landed in sweepCoverage.mjs and
    // its first guardian was tools/ship/quickSweep-selfcheck.mjs, which is 9.1 s SERIALLY and outside the
    // ship-time sweep -- so this ratchet went red the moment the record arrived, which is the whole point of
    // it. The two rows that grade the record were moved to sweepCoverage-selfcheck (297 ms serial, beside
    // the record it guards) and the ceiling of 43 did not move. THE RATCHET CAUGHT THE ROUND THAT WROTE IT.
    // v4565/v4566: 97 -> 101 records and 54 -> 62 checked, with unchecked DOWN from 43 to 39 -- the first
    // fall this ratchet has recorded, and it is not this round being careful: the v4565 band pass returned
    // 105 gates to the ship-time sweep (OVER_BUDGET_PASS_V4565 in tools/ship/sweepCoverage.mjs) and some of
    // them were the last guardian a record had. The ratchet only forbids a RISE, so a fall is the population
    // moving underneath it and is recorded rather than celebrated.
    //
    // *** AND IT WENT RED ON THIS ROUND'S OWN RECORD FIRST, WHICH IS THE SECOND ROUND RUNNING. ***
    // INSCOPE_ARRIVALS_SINCE_V4435 landed in tools/ship/absenceScope.mjs guarded only by
    // absenceScope-selfcheck, which measured 6,527 / 6,853 / 6,638 ms serially -- over the budget, so the
    // record was unchecked at ship time the moment it arrived, exactly as SWEEP_CONTENTION_V4562 was at
    // v4562. The repair was v4548's, not a move: the gate re-read and re-comment-stripped the whole tree once
    // per search term (7 scans = 28,507 readFileSync, 390 MB, 28,504 codeOnly calls) and tokenMatch
    // lowercased every file on every call. Memoising the walk, the read and codeOnly's answer, and replacing
    // the lowercase copy with a case-insensitive regex, took it to 2,237 ms through the rotation owner.
    // 6,853 -> 2,237 is the gate doing the same work; both changes were checked answer-for-answer against
    // uncached re-derivations (32,576 file-classifications, 40,720 tokenMatch pairs, no difference).
    // v4568: 101 -> 104 records and 62 -> 64 checked, with unchecked back UP from 39 to 40 -- and the rise
    // is honest rather than a regression to hide. The round added three records, two of them in
    // tools/ship/redCensus.mjs, whose guardian redCensus-selfcheck is 45 s and therefore outside the
    // ship-time sweep. That is the ratchet doing its job on the round that wrote it, for the third round
    // running. It is NOT moved by relocating the rows: the reds those records name are gates the sweep
    // cannot run at all, so their guardian is expensive for the same reason they are.
    checked: 64, overBudget: 19, unguarded: 21, unchecked: 40,
    // v4550 -- the UNMEASURED class was split out of over-budget after this gate went red twice inside full
    // sweeps and passed 68 times under load; the trigger was a concurrent REWRITE of sweep-timings.json, not
    // contention. Zero records sit in it on a settled tree, which is the expected reading.
    unmeasured: 0,
    // THREE, not four. The first draft of this list said four and put MEASURED_V4527 in BOTH -- rescued by
    // the faster gate AND demoted by the comment strip -- which cannot both be true of one record and was
    // caught by the gate rather than by re-reading. Its only guardian named it in a COMMENT, so the strip
    // took the guardian away entirely and there was nothing left for the speedup to rescue.
    rescued: Object.freeze(["PROBE_AT_V4536", "PROBE_AT_V4487", "DRIFT_AT_V4482"]),
    demotedByCommentStrip: Object.freeze(["BUDGET_DRIFT_V4536", "MEASURED_V4527"]),
    // The three whose guardian does not merely miss the budget but never finishes at all.
    // *** v4568 -- THIS LIST WAS "THREE GUARDIANS THAT DO NOT FINISH" AND ALL THREE FINISH. ***
    // It was built when `at or over the 20,000 ms cap` was the only fact available, and the tree read that
    // as "cut off" -- the proxy KILLED_PASS_V4568 is about, sitting in the module that reports on guardians.
    // Every one of them, measured with a cap big enough to let it end:
    //   redCensus-selfcheck    90,096 ms and KILLED -> 45,245 ms exit 0, once its register re-run was
    //                          bounded by wall clock instead of running every entry every time
    //   dockFraming-selfcheck  21,536 ms exit 0 -- over the cap and graded
    //   transmission-selfcheck 19,395 ms exit 0 -- no longer even over the cap
    // So the list is kept as the POPULATION it always named, and the claim attached to it is corrected:
    // these are expensive, not unjudged, and the repair for expensive is speed rather than a verdict.
    atCapGates: Object.freeze([
        "tools/ship/redCensus-selfcheck.mjs",
        "physics/render/transmission-selfcheck.mjs",
        "tools/ship/dockFraming-selfcheck.mjs",
    ]),
    // What v4568 measured about them, so the correction is a number rather than a retraction.
    atCapGatesFinish: Object.freeze({ of: 3, finished: 3, killed: 0,
        ms: Object.freeze({ "tools/ship/redCensus-selfcheck.mjs": 45245,
                            "tools/ship/dockFraming-selfcheck.mjs": 21536,
                            "physics/render/transmission-selfcheck.mjs": 19395 }) }),
});

/**
 * *** WHAT v4577 MEASURED: TWELVE "UNGUARDED" RECORDS, AND NOT ONE OF THEM WAS THE THING THE WORD IMPLIED. ***
 *
 * Three separate faults, each found by asking the decidable question -- does anything READ it -- instead of
 * the reported one.
 *
 *   ONE was a blind spot in the census.   ERASED_AT_V4394 is exercised on every run of
 *      tools/mutate/shadowedDefaults-selfcheck.mjs, through `agreement(rows, frozen = ERASED_AT_V4394)` called
 *      with one argument. Proven, not argued: `value: "6"` -> `"99"` takes that gate from exit 0 with zero FAIL
 *      lines to exit 1 with three. The guardian search asks which gates NAME a record and a default argument is
 *      invisible to it, exactly as a derived constant was at v4576.
 *
 *   TWO were guarded by rows that could not fail.   MEASURED_AT_V4415's only reader is PROBES[0].key(), and the
 *      only gate that calls key() asserts the values are FINITE -- `hit: 0.5` -> `hit: 0.77` left it green.
 *      MEASURED_V4527's only reader is physics/raceKnob.mjs's own reportLines(), which PRINTS it.
 *
 *   NINE are named by NO CODE ANYWHERE and a guardian is the wrong ask.   They are prose in object form.
 *
 * *** AND THE FIRST FIX FOR THE FIRST FAULT WAS WRONG IN THIS TREE'S OLDEST WAY. *** Crediting every gate whose
 * source matched `\bagreement\s*\(` gave ERASED_AT_V4394 four guardians, of which THREE were false: two gates
 * calling their own `agreement` (physics/render/samplerCheck-selfcheck.mjs, tools/ship/videoFrames-selfcheck.mjs)
 * and one where the word is English in a test label (tools/ship/shipBridge-selfcheck.mjs). The edge follows the
 * import binding now. An over-permissive matcher in the column that decides whether a record is checked at all
 * is the same defect as counting prose as code, and it is the third time this session it has had to be caught.
 */
export const UNGUARDED_SPLIT_V4577 = Object.freeze({
    at: "v4577",
    // *** THE READING SPLITS INTO A PART THAT MOVES AND A PART THAT DOES NOT, AND THE FIRST DRAFT ASSERTED
    // BOTH. *** `unguarded` asks which gates NAME a record: no timing enters it, so it is a fact about the
    // tree. `checked` and `overBudget` are the census JOINED to sweep-timings.json, and that file is written
    // by an 8-way pass -- SWEEP_CONTENTION_V4562 measured a 2.41x median inflation. MEASURED HERE, on code
    // that did not change: before the round's closing sweep this tree read 73 checked / 22 over-budget / 1
    // unmeasured, and after it read 69 / 27 / 0. FIVE records moved, all five guarded by
    // tools/ship/reportDoors-selfcheck.mjs, which reads 2877 / 2872 / 2939 / 3001 / 3025 ms over five SERIAL
    // runs against a 3,000 ms budget -- it straddles the line by itself, and the sweep's 3,093 ms reading is
    // one sample of a quantity that has no single value. So those five records' class is not a fact and is
    // not frozen as one; the structural half below is.
    // v4578 -- total RE-TAKEN 105 -> 106 for SHADER_SINHASH_V4578, which arrived checked. The other three
    // are the round's actual finding and have not moved: no clock enters them, and no record has joined or
    // left the unguarded set.
    // v4583 -- total RE-TAKEN 106 -> 107 for CORPUS_AT_V4583, which arrived checked. The unguarded set
    // did not move: no record joined or left it this round.
    structural: Object.freeze({ total: 107, unguarded: 9, documentaryOfThose: 9, readByCodeOfThose: 0 }),
    // BEFORE, on the tree this round opened on:
    before: Object.freeze({ total: 104, checked: 72, overBudget: 20, unmeasured: 0, unguarded: 12, unchecked: 32 }),
    // AFTER, as one reading rather than as a constant -- see the note above. Taken with the round's own
    // closing sweep in the timings file.
    after: Object.freeze({ total: 105, checked: 69, overBudget: 27, unmeasured: 0, unguarded: 9, unchecked: 36 }),
    // The same tree read minutes earlier, before that sweep rewrote the timings. Kept because a pair of
    // readings is the evidence for the sentence above, where one reading would just look like a regression.
    afterPriorSweep: Object.freeze({ total: 105, checked: 73, overBudget: 22, unmeasured: 1, unguarded: 9, unchecked: 31 }),
    contendedRecords: 5, contendedGuardian: "tools/ship/reportDoors-selfcheck.mjs",
    contendedGuardianSerialMs: Object.freeze([2877, 2872, 2939, 3001, 3025]),
    // The three that LEFT the unguarded set, and where they went -- because "no longer unguarded" is not
    // "now checked". Two are guarded by gates the SWEEP cannot afford (14,464 ms and ~3,500 ms), so
    // tools/ship/recordTier.mjs runs them and the ship-time sweep still does not. The third's new guardian is
    // 87 / 85 / 98 ms serially, so it is genuinely checked.
    moved: Object.freeze({ ERASED_AT_V4394: "over-budget", MEASURED_AT_V4415: "over-budget", MEASURED_V4527: "checked" }),
    // The bare-name matcher's score on the one real case, before the import binding replaced it.
    looseMatchGuardians: 4, looseMatchFalse: 3,
    // Every corruption that was run to establish a guardian is real, with the gate's before/after:
    corruptions: Object.freeze([
        Object.freeze({ record: "ERASED_AT_V4394", change: 'value: "6" -> "99"',
                        gate: "tools/mutate/shadowedDefaults-selfcheck.mjs",
                        before: Object.freeze({ exit: 0, failLines: 0 }), after: Object.freeze({ exit: 1, failLines: 3 }) }),
        Object.freeze({ record: "MEASURED_AT_V4415", change: "hit: 0.5 -> 0.77",
                        gate: "tools/ship/probeConvention-selfcheck.mjs",
                        before: Object.freeze({ exit: 0, failLines: 0 }), after: Object.freeze({ exit: 0, failLines: 0 }),
                        note: "*** THE ONE THAT DID NOT MOVE, WHICH IS THE FINDING. *** 0.77 is finite too, so " +
                              "the only row reading this record could not fail on its value" }),
    ]),
    documentary: 9,
    // *** WHAT IS NOT CLAIMED. *** That the nine are fine. They are unchecked and stay unchecked; what changed
    // is that the tree now says WHY, so the number stops reading as nine forgotten gates. Re-deriving any one
    // of them is that round's own work -- MEASURED_AT_V4421's `additiveFiles: 12` is a countable fact about
    // ev/shipDebris.mjs and nothing counts it.
    notClaimed: "that the nine documentary records are checked, or should be. Only that nothing reads them, " +
                "which is a different fact from nothing checking them and was being reported as the same one",
});

export function reportLines() {
    const r = reach();
    if (!r.judgeable) return ["[recordReach] which frozen records the ship ritual actually checks",
        `  CANNOT JUDGE: ${TIMINGS} held ${r.timingEntries} timing entries. quickSweep rewrites that file at ` +
        "the end of a run, so a read landing mid-write parses to nothing and every guardian looks unmeasured. " +
        "Reporting a percentage from that would be a catastrophic-looking number with no evidence behind it."];
    const out = [
        "[recordReach] which frozen records the ship ritual actually checks",
        `  ${r.total} records at a ${r.budgetMs} ms budget: ${r.checked} checked, ${r.overBudget} guarded only by ` +
        `over-budget gates, ${r.unmeasured} by never-timed gates, ${r.unguarded} guarded by nothing`,
        `  => ${r.unchecked} of ${r.total} (${(100 * r.unchecked / r.total).toFixed(0)}%) not checked at ship time`,
    ];
    for (const b of r.blockers.slice(0, 8))
        out.push(`    ${String(b.ms).padStart(6)} ms  ${b.gate}  (${b.records.length} record(s))`);
    if (r.atCap.length) out.push(`  AT THE ${r.capMs} ms CAP -- these do not finish: ${r.atCap.join(", ")}`);
    if (r.unguarded) {
        const u = splitUnguarded();
        out.push(`  of the ${u.total} guarded by nothing: ${u.documentary.length} are named by NO CODE AT ALL ` +
                 "(documentary -- a guardian is the wrong ask), and " + u.readUnchecked.length +
                 " are read by code that cannot fail on the value:");
        for (const r2 of u.readUnchecked) out.push(`      ${r2.name}  read in ${r2.readBy.join(", ")}`);
    }
    return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
    for (const l of reportLines()) console.log(l);
