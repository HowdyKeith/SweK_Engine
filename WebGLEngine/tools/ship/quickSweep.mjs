#!/usr/bin/env node
// WebGLEngine/tools/ship/quickSweep.mjs -- v4303
//
// *** THE SHIP GATE RUNS A NARROWER SET THAN THE SUITE, AND THAT IS HOW SIX GATES WENT RED UNDER ALL GREEN. ***
// #134, measured at v4257: verify.mjs names one selfcheck explicitly and runs the fast physics suites; the
// 1,300-gate tree is swept by hand, when someone remembers, which at v4297 turned out to be eighteen rounds
// apart. Every regression the v4297 sweep named -- backendParity, copiedOutsideVendor, gateQuality,
// postChain, staleness, windowsImport -- was a gate that WORKED, was broken by a round that shipped ALL
// GREEN, and cost under a second to run. Five of the six cost under a second. They were cheap to run and
// nobody ran them.
//
// This is the cheap running. Given a timings file, every gate that finished under `budgetMs` last time is
// run again, `workers` at a time, with a hard cap; every red is then re-run ALONE, because v4297 measured
// that 36% of parallel reds are starvation and not failure (gateSweep.classify is the rule). The result is
// reconciled against the RED REGISTER: a red that redCensus or the v4297 record already lists is KNOWN and
// reported; a red that neither lists is NEW and is the finding this file exists to raise. verify.mjs fails
// on NEW reds only, so the 37 standing reds do not make every ship red, and a gate that goes red in a
// round is caught in that round rather than eighteen later.
//
// *** WHAT A TIMINGS FILE IS FOR, AND WHAT IT IS NOT. *** It chooses which gates are cheap enough to run
// at ship time; it is NOT a promise about the tree. The file is rewritten after every run with what was
// just observed, so a gate that has grown past the budget drops out and is NAMED in the summary as dropped,
// never silently. A gate with no timing at all -- new this round -- is always run once, so it earns one.
//
// Measured at v4303 with a 20 s cap and 8 workers over all 1,383 gates: see the changelog for the buckets.
//
// Run:  node tools/ship/quickSweep.mjs [--budget 3000] [--workers 8] [--cap 20000] [--timings <file>] [--json]
// Exit: 0 when no NEW red; 1 when a gate outside the register is red; 2 when the runner itself failed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { backfillStamps } from "./sweepCoverage.mjs";
import { boxId } from "./hostScale.mjs";
// The FAIL-line rule is IMPORTED, not re-spelled. tools/ship/failLines.mjs owns "what an assertion line
// looks like" and its own header is about exactly this problem -- "AN EXIT CODE IS NOT A FINDING". Two
// copies of that regex is how one of them quietly stops matching, which is the defect this file has spent
// the session removing from its own record.
import { FAIL_LINE } from "./failLines.mjs";
import { skippable, readRecord as readInputRecord } from "./inputSets.mjs";
import { enumerateGates, classify, VERDICT, SWEEP_V4297, ENG, exitKind, exitName, EXIT_KIND } from "./gateSweep.mjs";
import { parseArgs, refusalLines } from "./cliArgs.mjs";
import { RED_AT_V4279, RED_AT_V4408, RED_AT_V4424, RED_AT_V4476, RED_AT_V4484, RED_AT_V4531, RED_AT_V4535, UNCONFIRMED_SLOW, ALL_REGISTERED } from "./redCensus.mjs";

// *** THE TWO LINES BOTH FOUND THAT A MILLISECOND IN sweep-timings.json IS NOT ONE QUANTITY, AND BOTH FIXED
// IT -- IN DIFFERENT VOCABULARIES. THE MERGE KEEPS BOTH, BECAUSE THEY ANSWER DIFFERENT HALVES. ***
//
// v4556/v4562 (this line) measured the contention -- median 2.41x over 1,098 honest pairs -- and answered it
// with a SECOND COLUMN: `serial`, an uncontended reading refreshed on a rotation, so costOf() can return what
// a gate actually costs instead of a label on a number that is wrong.
//
// v4579/v4582 (the temporal line) measured the same gap at 1.93x and answered it with a KIND on the one
// column: loaded / alone / capped / skipped. That is strictly more than this line's `contended` boolean --
// it separates a reading that is the CAP's clock, and one where the gate DECLINED TO RUN, from a genuine
// parallel sample. Three gates were filing their skip time as an ordinary measurement.
//
// Neither subsumes the other: a kind cannot tell you what the gate costs alone, and a second column cannot
// tell you that the number in front of you measures a refusal. `contended` is now DERIVED from the kind
// below rather than decided a second time, so the two cannot disagree.

/**
 * *** v4579 -- THE THREE THINGS A MILLISECOND IN sweep-timings.json CAN BE. *** Exported so a reader asks by
 * name instead of re-deriving the branch rule, and so the one place that decides it is the one place that
 * knows: quickSweep, at the moment it writes the number.
 */
// *** v4582 -- A FOURTH KIND, BECAUSE THREE OF THESE ENTRIES WERE A GATE SAYING "I DID NOT RUN". ***
//
// LOADED, ALONE and CAPPED all answer "under what conditions was this measured". None of them answers "did the
// gate run at all", and for three entries the answer was no: render/holoPicture, render/holoAgree and
// tools/ship/pageFxOverlay skip without their dependency, exit 0 in well under the budget, and were filed as
// ordinary LOADED readings at 234, 164 and 175 ms -- 2.4x to 3.6x the bare skip cost, so they are loaded
// measurements of a refusal. tools/ship/selfchecks.mjs has refused to record a skip since v3941, after
// placementRender was filed at its skip time THREE TIMES; gateBudget.UNRESOLVED names two of these three and
// says "its former 55ms entry was the SKIP time". THE TREE KNEW, FOR THE OTHER FILE.
//
// AND THE KIND MADE IT WORSE BEFORE IT MADE IT BETTER: since v4579 those three carried a confident `loaded`
// label, which answers a question nobody was asking about a number that measures nothing.
export const KIND = Object.freeze({ LOADED: "loaded", ALONE: "alone", CAPPED: "capped", SKIPPED: "skipped" });


export const DEFAULTS = Object.freeze({ budgetMs: 3000, workers: 8, capMs: 20000, timingsFile: "tools/ship/sweep-timings.json",
                                        serialSliceMs: 15000 });

/**
 * *** WHAT THIS FILE RECORDS IS A CONTENDED SAMPLE, AND THE TREE HAS BEEN READING IT AS A COST. ***
 *
 * The parallel phase runs 8 workers on a 4-core box, so every reading it files is taken while seven other
 * gates fight it for the machine. Measured at v4562 by running the SAME sweep at 8 workers and at 1 and
 * comparing 1,011 gates that ran in both:
 *
 *     parallel / serial     p10 1.25x    MEDIAN 2.41x    p90 3.44x    max 6.88x    min 0.55x
 *     total filed time      685 s at 8 workers against 358 s at 1
 *     wall time             230 s at 8 workers against 374 s at 1
 *
 * So the parallelism buys a 1.63x WALL-CLOCK speedup and costs a 2.41x median inflation of every number the
 * tree then reads as "what this gate costs". v4408 and v4536 both repaired the EVICTION that rests on such a
 * reading -- a crosser is confirmed alone, and a crossing must reproduce -- and neither made the recorded
 * number honest, because nothing had measured how far off it was.
 *
 * `serial` holds uncontended readings: every phase-2 run is one (the box is quiet by then), and each sweep
 * spends a stated slice of wall time re-running the gates whose serial reading is oldest or absent. costOf()
 * is what a consumer should ask; timings[] remains the membership number it always was.
 */
export function costOf(t, gate) {
    const serial = t && t.serial ? t.serial[gate] : undefined;
    if (serial != null) return { ms: serial, source: "serial", at: (t.serialAt || {})[gate] || null };
    const par = t && t.timings ? t.timings[gate] : undefined;
    if (par != null) return { ms: par, source: "parallel", at: (t.at || {})[gate] || null };
    return { ms: null, source: "none", at: null };
}

/**
 * The gates a CONTENTION RATIO may be taken over: those whose filed reading is a genuine contended sample
 * AND whose serial reading is a separate, uncontended one.
 *
 * *** v4556 -- THE LIVE RE-DERIVATION OF v4562'S RATIO WAS DIVIDING 164 MEASUREMENTS BY THEMSELVES. ***
 * The obvious population is "every gate in `serial`", and it is wrong, because `timings[g]` is not always a
 * parallel sample: the line that files a row writes `r.serialMs ?? r.parallelMs`, so every gate re-run alone
 * -- every red, every budget crosser -- has THE SAME NUMBER in both fields. Divided, each one contributes
 * exactly 1.00 and drags the median down. MEASURED on the live file: 1,262 pairs read p10 1.00, median
 * 2.07x; excluding the 164 self-pairs, 1,098 pairs read p10 1.41, median 2.17x. The p10 of 1.00 was not a
 * gate that escaped contention, it was a gate compared with itself, and the gap to v4562's 2.41x was being
 * narrated as sweep-to-sweep variation.
 *
 * `contended` is the provenance this needs and the file did not carry: true when `timings[g]` came from the
 * parallel phase, false when it is a serial reading filed there. It is RECORDED AT THE MEASUREMENT rather
 * than inferred, because the only available inference is `timings[g] !== serial[g]` -- which silently drops
 * a real pair whose two readings happen to land on the same millisecond, and cannot tell a rotation's
 * uncontended reading from a contended one at all. The inference is still the FALLBACK for entries written
 * before this field existed, and the count of those is returned rather than folded in.
 */
export function contentionPairs(t, { minMs = 50 } = {}) {
    const T = (t && t.timings) || {}, S = (t && t.serial) || {}, C = (t && t.contended) || {};
    const pairs = [], inferred = [];
    // The floor is the one this population has always carried: a ratio of two sub-50ms readings is process
    // startup divided by process startup. It is a PARAMETER rather than a literal in the caller because the
    // excluded-count arithmetic below has to be taken over the same floor, and my first draft of this
    // repair took the two halves over different ones and reported 99 exclusions where there are 164.
    const eligible = Object.keys(S).filter((g) => T[g] > minMs && S[g] > minMs);
    for (const g of eligible) {
        if (C[g] === true) { pairs.push(g); continue; }
        if (C[g] === false) continue;                       // a serial reading filed in `timings`
        if (T[g] !== S[g]) { pairs.push(g); inferred.push(g); }   // no provenance on file: infer, and say so
    }
    return { pairs, inferred, eligible, excluded: eligible.length - pairs.length,
             ratios: pairs.map((g) => T[g] / S[g]).sort((a, b) => a - b) };
}

/**
 * Which gates owe a serial reading, oldest first. Pure so a gate can drive it: an absent reading sorts
 * before any present one, and ties keep enumeration order so the slice is deterministic.
 */
export function serialSliceOrder(gates, serialAt = {}) {
    return gates.slice().sort((a, b) => {
        const A = serialAt[a], B = serialAt[b];
        if (!A && !B) return 0;
        if (!A) return -1;
        if (!B) return 1;
        return A < B ? -1 : A > B ? 1 : 0;
    });
}

// *** v4582 -- DECLARED, BECAUSE THIS RUNNER'S TWO NUMBERS ARE NOT gateBudget'S AND NEVER WERE. ***
//
// tools/ship/runnerBudget-selfcheck.mjs requires every runner that budgets a gate either to read
// gateBudget.MEASURED or to say why it does not -- rigRunner was silent from v2559 to v3919 and rig.html reported
// its number as though it were the table's. THIS FILE WAS OUTSIDE THAT CHECK'S POPULATION BY ACCIDENT: the scan
// admits a runner that mentions `-selfcheck` outside its own name, and quickSweep happened never to contain the
// string until v4582's SKIP_LINE regex introduced it. So adding a skip guard revealed an eleven-round silence,
// which is the same shape as the guard itself -- a rule that held everywhere it looked.
//
// AND THE DECLARATION IS EASY TO MAKE HONESTLY, WHICH IS WHY THE SILENCE COST NOTHING TO END. Neither number is a
// per-gate timeout. `budgetMs` is a MEMBERSHIP THRESHOLD: a gate whose last reading is under 3000 ms is in the
// ship-time sweep and one over it is not, so the number is a claim about how long the sweep may take in total.
// `capMs` is a SIGKILL ceiling that exists so one hung gate cannot stop the sweep, and v4574 established that a
// reading it produces is the killer's clock and not a runtime -- which is why those entries are marked `capped`
// rather than compared against anything.
export const budgetIsOwn =
    "neither of this runner's numbers is a per-gate budget, so gateBudget.MEASURED has nothing to say about " +
    "either. budgetMs (3000) is a MEMBERSHIP THRESHOLD -- a gate under it is in the ship-time sweep, a gate over " +
    "it is not -- and is therefore a claim about the sweep's total cost, not about any gate's. capMs (20000) is a " +
    "SIGKILL ceiling so one hung gate cannot stop the sweep, and a reading it produces is the cap's clock rather " +
    "than a runtime, which is why such entries are marked `capped` and never compared against a measurement.";

/** The register: every gate whose red is already on record, with the record that names it. */
export function redRegister() {
    const reg = new Map();
    // *** BOTH MEASURED SETS BEFORE THE BUCKET, BECAUSE A MEASURED RED OUTRANKS "NOBODY LOOKED". ***
    // Two rounds on two branches each filed a set of reds the bucket had been hiding, and they name different
    // gates: v4408 took the ones the first rotation surfaced, v4424 ran all 63 of UNCONFIRMED_SLOW one at a
    // time and found three exiting 1. Neither round repaired its set -- they stay on the register, but under a
    // reason that names the failure instead of the absence of a measurement.
    // v4536: the seven loops this replaced were seven chances to forget one, and two of the three
    // readers of this register had. The population is derived from redCensus.REGISTER_LISTS now.
    for (const e of ALL_REGISTERED) reg.set(e.gate, "redCensus." + e.list);
    for (const g of UNCONFIRMED_SLOW) if (!reg.has(g)) reg.set(g, "redCensus.UNCONFIRMED_SLOW");
    for (const g of SWEEP_V4297.fromSlowBucket) if (!reg.has(g)) reg.set(g, "gateSweep.SWEEP_V4297.fromSlowBucket");
    for (const g of SWEEP_V4297.unmeasured) if (!reg.has(g)) reg.set(g, "gateSweep.SWEEP_V4297.unmeasured");
    // the six regressions are NOT in the register on purpose: they are the reds a round is meant to repair,
    // and listing them here would make their red acceptable again.
    return reg;
}

/** Read a timings file: { captured, timings: {gate:ms}, codes: {gate:exitCode}, observed: {gate:iso|null} }. Missing -> empty. */
// *** v4647 -- sweep-timings.json HAS FIFTEEN TOP-LEVEL KEYS AND NOT ONE SAYS WHOSE STOPWATCH IT WAS. ***
//
// hostScale.mjs's own v4580 header names this defect about gate-timings.json -- "NOTHING IN IT SAYS WHICH
// MACHINE PRODUCED ANY OF THEM" -- and it sits unrepaired here, in a file that is REWRITTEN EVERY RUN and
// COMMITTED. It began biting the moment a second box started running the sweep for real:
//
//   * Keith's Windows rig cannot `git pull`. Its verify run rewrites this file, git refuses to overwrite a
//     dirty working copy, and the pull aborts. That has now blocked four pulls in one session, each time
//     costing a round of confusion about why a fix had not arrived.
//   * Worse than the conflict: if that box ever committed, its readings would land in the SAME fields as this
//     one's with nothing to tell them apart. His sweep puts 231 gates over the 3,000 ms budget; this box puts
//     a handful. Those are two machines disagreeing, and the record cannot express that -- so whichever ran
//     last would simply be the truth.
//
// So the record names its box, and a DIFFERENT box writes its own file instead of overwriting this one. That
// is the tree's existing convention rather than a new idea: `.local.json` is per-machine state (see
// host-timings.local.json, vba-archive.local.json, services.local.json) and is gitignored.
//
// *** THE READERS ARE DELIBERATELY NOT REDIRECTED, AND THAT IS A LIMIT RATHER THAN AN OVERSIGHT. *** Fifteen
// modules read this file. On a foreign box they go on reading THIS box's timings, which is wrong in a way
// hostScale already exists to absorb (it scales a budget by what the local machine has actually done). What
// changes here is only that a foreign box can no longer silently overwrite the shared record, and that the
// record says who wrote it. Making fifteen readers host-aware is a different round with a different risk.
export const LOCAL_TIMINGS = "tools/ship/sweep-timings.local.json";

/**
 * Where THIS box's timings belong, and why. Returns { file, host, foreign, why }.
 *
 * An UNCLAIMED record (no host, which is every record written before v4647) is adopted by the next box to
 * write it. That is right rather than convenient: the numbers in it were produced by whichever box has been
 * running the sweep, and that is the box about to write.
 */
export function timingsTarget(prior, { file = DEFAULTS.timingsFile, local = LOCAL_TIMINGS, id = boxId() } = {}) {
    const was = prior && prior.host;
    if (!was) return { file, host: id, foreign: false, why: `no box was named in the record; ${id} adopts it` };
    if (was === id) return { file, host: id, foreign: false, why: `this box (${id}) owns the record` };
    return { file: local, host: id, foreign: true,
             why: `the record belongs to ${was} and this box is ${id} -- writing ${local} instead, because two ` +
                  `machines' runtimes in one set of fields is not a record, it is whichever ran last` };
}

export function readTimings(file = DEFAULTS.timingsFile, root = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")); } catch { return { captured: null, timings: {}, codes: {}, observed: {} }; }
}

/**
 * Which gates to run: every enumerated gate whose last observed time is under the budget, plus every gate
 * with no observation at all (new gates always earn one). Returns { run, skipped, dropped, unmeasured }.
 */
// *** v4536 -- ONE SLOW HOUR EVICTED A GATE, AND THE MEASUREMENT SAYS ONE CROSSING IS WEAK EVIDENCE. ***
//
// v4408 stopped a STARVED PARALLEL reading from evicting a gate: a green gate that crosses the budget 8-way is
// re-run alone before its time is filed. That was right and it is not enough, because the serial confirm is
// itself taken at the end of a 1,200-gate sweep and this box is not the same box from hour to hour. MEASURED
// at v4536, serial against serial, on gates whose code has not changed since the earlier reading:
//
//     microfacetVndf  3184 -> 3613   1.13x        probeLab   3193 -> 4337   1.36x
//     water2d         3143 -> 3546   1.13x        meshLine   2792 -> 3804   1.36x
//     slugReupload    3129 -> 3507   1.12x
//
// Within one hour those gates repeat to about 2% (probeLab: 4398 / 4425 / 4337). Across hours they move up to
// 36%. *** SO A SINGLE CROSSING IS A READING FROM ONE HOUR AND NOT A PROPERTY OF THE GATE, *** and roughly
// thirty gates sit close enough to 3,000 ms for that to decide their fate -- which is the treadmill that has
// fed a named straddler list in three consecutive rounds.
//
// THE REPAIR IS v4297'S OWN DISCIPLINE, APPLIED TO TIME. A red is not a red until it is confirmed alone; a
// crossing is not an eviction until it is confirmed on a LATER SWEEP. Nothing is forgiven: a gate that is
// genuinely over goes out one sweep later than it used to, and the count is visible in the timings file. This
// is not a tolerance band -- v4531 refused one, rightly, because a band forgives every future boundary case
// silently and this forgives nothing; it asks for the reading to be reproduced.
//
// AND IT IS NOT THE REPAIR THE BACKLOG PROPOSED, because that one was measured and does not work. See
// BUDGET_DRIFT_V4536 in sweepCoverage.mjs for the reference-workload experiment and why a scalar normaliser
// cannot carry this.
export const MIN_CROSSINGS_TO_EVICT = 2;

/**
 * The crossing count after a sweep: incremented for a gate that came in over budget, and DELETED for one that
 * came back under. Consecutive crossings, not a lifetime tally -- and that distinction is the whole rule. A
 * gate that straddles crosses about half the time, so a tally that never resets evicts every straddler within
 * a few sweeps while still calling itself corroboration. Pure and exported so the reset is driven on a
 * fixture: the first draft kept it inside the writer, where the only sabotage that mattered went 0 red.
 */
export function countCrossings(prior, rows, budgetMs) {
    const out = { ...(prior || {}) };
    for (const r of rows) {
        const ms = r.serialMs ?? r.parallelMs;
        if (ms > budgetMs) out[r.gate] = (out[r.gate] || 0) + 1;
        else delete out[r.gate];
    }
    return out;
}

/**
 * *** v4566 -- INCREMENTAL SELECTION, AND IT IS OFF BY DEFAULT ON PURPOSE. ***
 *
 * tools/ship/inputSets.mjs can say what each gate reads and whether any of it has moved, so a sweep could run
 * only the gates whose inputs changed. That is a real saving and it is also the only change in this file that
 * can produce a SILENT FALSE GREEN -- every other failure here announces itself, and a gate that should have
 * run and did not announces nothing at all.
 *
 * So `inputRecord` is an opt-in parameter, and the sweep's own runs report what it WOULD have skipped without
 * acting on it. That number accumulates across rounds in plain sight, which is the evidence anybody should
 * want before trusting the mechanism, and it costs one hash of each recorded input rather than a gate run.
 * When the number has been watched long enough to be boring, turning it on is a one-line change with a
 * measured history behind it instead of an argument.
 */
/**
 * *** THE FALSE REDS, AS ROWS. A NAMED FUNCTION BECAUSE AN INLINE `.length` IS WHAT THIS REPLACED. ***
 *
 * A gate that is RED under -P and GREEN alone was starved by the other workers -- redCensus's two-phase rule,
 * and the reason phase 2 exists. It was counted and the rows discarded, so Keith's gen-9 run could report
 * "143 false red", 11% of its swept population against 7 of 46 measured here, AND NAME NOT ONE OF THEM.
 *
 * Exported so a fixture can drive it: an empty list proves nothing about a mapping, and the live tree
 * produces false reds only under contention nobody can summon on demand.
 *
 * `ratio` is parallel time over serial time -- how much the other workers cost that gate.
 *
 * *** AND IT IS null FOR A CAPPED RUN, WHICH v4647c GOT WRONG ONE ROUND AFTER BUILDING THIS. *** This file's
 * own budgetIsOwn declaration, forty lines up, says it plainly: capMs is a SIGKILL ceiling and "a reading it
 * produces is the cap's clock rather than a runtime, which is why such entries are marked `capped` and NEVER
 * COMPARED AGAINST A MEASUREMENT". The first version divided that clock by a real serial time and printed the
 * quotient as starvation.
 *
 * Keith's gen-9 run is what showed it. Of the twenty worst by that bogus ratio, NINETEEN had a parallel time
 * of 20,123-23,704 ms against a cap of 20,000 -- they were KILLED, not slowed -- and the "ratio" was really
 * 20000/serialMs, so it ranked the FASTEST gates as the most starved. One was a genuine slowdown
 * (splatSort, 11,566 -> 1,715 ms) and it sorted sixteenth.
 *
 * So `capped` is its own field, read from the phase-1 timeout the row already carried, and a capped row gets
 * no ratio at all. The two populations answer different questions: a gate SLOWED 6x is fighting for CPU, a
 * gate KILLED at 20 s while taking 2 s alone is on a box that cannot run this many at once.
 */
export function falseRedsOf(rows, phase1 = new Map()) {
    return (rows || [])
        .filter((r) => r.verdict === VERDICT.GREEN && r.from === "serial")
        .map((r) => {
            const capped = !!r.parallelTimedOut;
            return { gate: r.gate, parallelMs: r.parallelMs, serialMs: r.serialMs, capped,
                     parallelCode: (phase1.get(r.gate) || {}).code ?? null,
                     ratio: !capped && r.parallelMs && r.serialMs ? +(r.parallelMs / r.serialMs).toFixed(2) : null };
        })
        // capped first -- they are the louder finding -- then real slowdowns worst-first. Never one ordering
        // over two quantities, which is what mixing a cap into a ratio produced.
        .sort((a, b) => (b.capped - a.capped) || ((b.ratio || 0) - (a.ratio || 0)));
}

/** The two populations, counted apart, because they have different causes and different answers. */
export function falseRedSplit(list) {
    const capped = (list || []).filter((f) => f.capped);
    return { capped: capped.length, slowed: (list || []).length - capped.length, of: (list || []).length };
}

export function selectGates(all, timings, budgetMs, { crossings = null, minCrossings = MIN_CROSSINGS_TO_EVICT,
                                                      inputRecord = null, skipUnchanged = false } = {}) {
    const run = [], skipped = [], unmeasured = [], onProbation = [];
    for (const g of all) {
        const ms = timings[g];
        if (ms == null) { unmeasured.push(g); run.push(g); }
        else if (ms <= budgetMs) run.push(g);
        // *** PROBATION IS FOR A GATE THAT CROSSED, NOT FOR EVERY GATE ALREADY OUT. *** The first draft ran
        // anything over budget whose count was missing, which is the ENTIRE over-budget pool -- about three
        // hundred gates, the expensive ones, twice over before the counts settled. That is the cost the
        // rotation exists to spread out, paid at ship time instead. A missing count means "evicted before
        // v4536 and not by this rule", and those stay out: sweepRotation re-times them on its own schedule.
        // budgetExile-selfcheck caught this within the round by seeding a lie and watching it get run.
        else if (crossings && crossings[g] >= 1 && crossings[g] < minCrossings) { onProbation.push(g); run.push(g); }
        else skipped.push(g);
    }
    // The incremental pass runs LAST and only narrows `run`, so every rule above still decides membership --
    // a gate this would skip is one the budget already agreed to run. Reported either way; acted on only when
    // skipUnchanged is set.
    let unchanged = [];
    if (inputRecord) {
        const keep = [];
        for (const g of run) (skippable(g, inputRecord) ? unchanged : keep).push(g);
        if (skipUnchanged) { run.length = 0; for (const g of keep) run.push(g); }
    }
    return { run, skipped, unmeasured, onProbation, unchanged };
}

/** Reconcile serial reds against the register: known (with the record that names them) versus new. */
export function reconcile(rows, register = redRegister()) {
    const known = [], fresh = [], unmeasured = [];
    for (const r of rows) {
        if (r.verdict === VERDICT.UNCONFIRMED) { unmeasured.push(r.gate); continue; }   // timed out alone: not a verdict
        if (r.verdict !== VERDICT.RED) continue;
        if (register.has(r.gate)) known.push({ gate: r.gate, record: register.get(r.gate), ms: r.serialMs });
        // *** v4647i -- NO `kind` FIELD HERE, AND THAT IS A MEASURED CORRECTION. *** The first draft stored
        // `kind` and `name` on the row. Sabotage VG deleted both and NOTHING went red in either gate: the
        // report derives the classification from `code`, so the stored copy was never read. A second
        // spelling of one rule is the defect this session has spent rounds on -- and removing it buys a
        // property worth more than the field, which is that a result saved by ANY version of this tool
        // classifies identically, because the code is the only input.
        // *** v4648 -- `fail` IS CARRIED, AND THE v4647i NOTE ABOVE IS WHY THIS ONE IS DIFFERENT. ***
        // `kind` and `name` were removed because the report DERIVED them from `code`, so the stored copy
        // was a second spelling of one rule and sabotage VG proved nothing read it. These lines cannot be
        // derived from anything: they are the gate's own output, captured by the run that produced the
        // verdict and available nowhere else once the process is gone. reportLines prints them, so the
        // sabotage that deletes this field turns the report blank rather than leaving it identical.
        //
        // THE COST OF NOT HAVING THEM, MEASURED: v4648's ship stopped on "NEW RED
        // tools/ship/sweepCoverage-selfcheck.mjs exit 1" and nothing else. That gate is green when run
        // alone, so the evidence existed for the length of one process and was discarded. A whole round
        // went into inferring the cause from concurrent copies and got it wrong twice.
        else {
            const fail = failLinesOf(r.serialTail);
            // A gate with no failing row did not FIND anything -- it DIED. What it printed last is the only
            // thing anybody on another box has to go on, so it travels with the verdict.
            fresh.push({ gate: r.gate, code: r.serialCode, ms: r.serialMs, fail,
                         died: fail.length ? null : deathTail(r.serialTail) });
        }
    }
    return { known, newRed: fresh, unmeasured };
}

// The convention every skipping gate in the tree already prints, and which selfchecks.mjs has read since v3941.
const SKIP_LINE = /-selfcheck:\s*(SKIPPED|skipped)\b/;

// The convention every skipping gate in the tree already prints, and which selfchecks.mjs has read since v3941.
/**
 * *** v4582 -- THIS RAN WITH stdio "ignore", WHICH IS WHY THE SKIP GUARD COULD NOT BE HERE. ***
 *
 * A skip produces exactly one piece of evidence -- the gate's own printed declaration -- and this runner threw
 * it away, deliberately, to stay cheap over 1,642 gates. From an exit code alone a skip is indistinguishable
 * from a fast pass, so the guard was not forgotten so much as unaffordable-looking.
 *
 * MEASURED BEFORE PAYING FOR IT: piping and keeping a 4 KB tail costs 1.4 ms a gate over eight gates timed three
 * times each -- inside the run-to-run noise, with two of the eight coming out FASTER captured -- and at most a
 * couple of seconds over a full sweep. The tail is bounded rather than accumulated because the whole point of
 * this runner is that it can afford to run everything.
 */
// *** v4568 -- THE CAP KILLED THE GATE AND LEFT ITS CHILDREN RUNNING, AND ONE OF THEM HOLDS A GPU. ***
//
// `p.kill("SIGKILL")` signals the direct child only. A gate that spawned anything of its own is SIGKILLed
// before it can clean up, its children are reparented to init, and they keep running -- for as long as they
// like. Measured on a fixture: zero orphans before, one after, from a single capped run.
//
// AND IT IS NOT A TIDINESS PROBLEM. tools/ship/headlessGpu-selfcheck.mjs deliberately spawns a child that
// PINS A WEBGPU DEVICE at module scope -- that is the trap it exists to gate -- and relies on spawnSync's
// own timeout to end it. If the PARENT is killed first that timeout never fires. One such orphan was found
// holding a device for FORTY-FOUR MINUTES on this box, and every GPU gate that ran in that window was
// competing with it. A gate slowed past the cap is then killed, orphaning more, which is a loop that grows
// the killed bucket this round is about: 140 gates, of which the GPU ones are heavily represented.
//
// `detached: true` makes the child a process-GROUP leader, and a negative pid signals the whole group -- so
// a gate's children die with it. The fallback is the old single-process kill, because a group kill can fail
// if the child never got as far as forming a group, and a cap that throws instead of killing is worse.
function runOneAsync(rel, capMs, root) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        const p = spawn(process.execPath, [rel], { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
        let tail = "";
        const keep = (d) => { tail = (tail + d).slice(-4096); };
        p.stdout.on("data", keep); p.stderr.on("data", keep);
        const timer = setTimeout(() => {
            try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch {} }
        }, capMs);
        p.on("exit", (code, sig) => { clearTimeout(timer); const ms = Date.now() - t0; resolve({ code: sig ? 124 : (code ?? 1), ms, timedOut: !!sig || ms >= capMs, skipped: SKIP_LINE.test(tail), tail }); });
        p.on("error", () => { clearTimeout(timer); resolve({ code: 1, ms: Date.now() - t0, timedOut: false, skipped: false, tail: "" }); });
    });
}

/**
 * The whole thing. Phase 1 in parallel, phase 2 serial for every phase-1 red, classify(), reconcile(), and
 * the timings file rewritten with what was seen. `onProgress(done, total)` is optional.
 */
/**
 * *** THE SKIP IS OPT-IN FOR CALLERS AND ON BY DEFAULT ONLY AT THE COMMAND LINE, AND v4574 GOT THAT BACKWARDS
 * FIRST. *** Arming meant flipping this default to true, which armed it for EVERY programmatic caller at once
 * -- and there are nine, all of them fixtures driving the sweep to watch what it does, plus budgetExile
 * re-timing one named gate. tools/ship/sweepCoverage-selfcheck.mjs went red within the minute, and it was
 * right: its 1 ms-budget fixture reported "0 gates run at a 1 ms budget, 0 confirmed alone" because the sweep
 * it was testing had skipped everything. A FIXTURE THAT SKIPS ITS OWN SUBJECT IS VACUOUS.
 *
 * The default belongs off here and true in the CLI block at the bottom of this file. A human sweeping while
 * working gets the saving by typing nothing; a caller gets a full sweep unless it says otherwise; and the
 * caller nobody has written yet inherits the safe one. That is the difference between arming a tool and
 * arming everything that holds it.
 */
export async function runQuickSweep({ budgetMs = DEFAULTS.budgetMs, workers = DEFAULTS.workers, capMs = DEFAULTS.capMs,
                                      timingsFile = DEFAULTS.timingsFile, root = ENG, gates = null, write = true, onProgress = null,
                                      serialSliceMs = DEFAULTS.serialSliceMs, skipUnchanged = false,
                                      log = (m) => console.log(m) } = {}) {
    const t00 = Date.now();
    const all = gates || enumerateGates(root);
    const prior = readTimings(timingsFile, root);
    // v4566 -- the input record is read once and used to COUNT, not to skip, unless skipUnchanged is set.
    // A missing or unreadable record yields an empty one, and skippable() answers "no recorded input set" for
    // every gate, so the sweep behaves exactly as it did before this parameter existed.
    const inputRecord = readInputRecord(root);
    const sel = selectGates(all, prior.timings || {}, budgetMs,
        { crossings: prior.crossings || {}, inputRecord, skipUnchanged });
    const phase1 = new Map();
    let next = 0, done = 0;
    async function worker() {
        while (next < sel.run.length) {
            const rel = sel.run[next++];
            phase1.set(rel, await runOneAsync(rel, capMs, root));
            done++; if (onProgress) onProgress(done, sel.run.length);
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
    // phase 2: every candidate alone, at the same cap (a gate under budget has no business needing more)
    const rows = [];
    for (const rel of sel.run) {
        const p1 = phase1.get(rel);
        const parallel = { code: p1.code, ms: p1.ms, timedOut: p1.timedOut };
        if (p1.code === 0) {
            // v4408 -- *** A GREEN GATE'S PARALLEL TIME IS NOT ITS COST, AND THIS IS WHERE THE DOOR USED TO SHUT. ***
            // The recorded timing decides membership next run, and until now a green gate never earned a serial
            // reading -- so one that passed 8-way at 3,002 ms was filed at 3,002 ms and evicted forever. v4297
            // already refused to call a starved parallel run a FAILURE; it is no better as a COST. The first
            // rotation measured the size of the error: 138 of 140 evicted gates came back at a median 2.85x
            // faster serially. So a green gate that CROSSES the budget in parallel is confirmed alone before it
            // is filed, which is the same two-phase discipline reds have had since v4297, applied to timings.
            if (p1.ms > budgetMs) {
                const conf = await runOneAsync(rel, capMs, root);
                rows.push({ gate: rel, verdict: VERDICT.GREEN, parallelMs: p1.ms, serialMs: conf.ms, serialCode: conf.code, parallelSkipped: p1.skipped, serialSkipped: conf.skipped, from: "budget-confirm", serialTimedOut: conf.timedOut, parallelTimedOut: p1.timedOut });
            } else rows.push({ gate: rel, verdict: VERDICT.GREEN, parallelMs: p1.ms, parallelTimedOut: p1.timedOut, parallelSkipped: p1.skipped });
            continue;
        }
        const p2 = await runOneAsync(rel, capMs, root);
        const serial = { code: p2.code, ms: p2.ms, timedOut: p2.timedOut };
        const c = classify(parallel, serial);   // { verdict, from, note } -- gateSweep's rule, not a copy of it
        rows.push({ gate: rel, verdict: c.verdict, from: c.from, parallelMs: p1.ms, serialMs: p2.ms, serialCode: p2.code, parallelSkipped: p1.skipped, serialSkipped: p2.skipped, serialTimedOut: p2.timedOut, parallelTimedOut: p1.timedOut, serialTail: p2.tail });
    }
    // *** AND A SLICE OF THE TREE IS RE-RUN ALONE, SO THE FILE ACCUMULATES COSTS AND NOT ONLY SAMPLES. ***
    // Phase 2 above already leaves an uncontended reading for every red and every budget crosser; this
    // extends that to the rest, oldest-first, bounded by WALL TIME rather than by a gate count -- a count
    // would need a per-gate estimate, which is the thing being measured. At the default 15 s against a
    // 230 s sweep that is 6.5% of the run and about 40 gates, so a 1,150-gate tree turns over in roughly
    // thirty sweeps. Set serialSliceMs to 0 to skip it entirely.
    const serial = { ...(prior.serial || {}) }, serialAt = { ...(prior.serialAt || {}) };
    // *** v4648 -- THE LAST FEW READINGS, BECAUSE ONE SAMPLE WAS STANDING IN FOR A PROPERTY. ***
    // `serial[g]` is the MOST RECENT uncontended reading and every consumer treats it as the gate's cost.
    // It is not: measured on recordDrift-selfcheck across consecutive sweeps on one box, 2092 / 2150 / 2233
    // -- a 7% spread, and recordReach's margin row compares it against a hard 2,200 ms cutoff, so the row
    // flipped red and green on which sweep wrote last. THAT IS THE SAME DEFECT v4536 RECORDED FOR THE BUDGET
    // ITSELF ("a single crossing is a reading from one hour and not a property of the gate") and answered
    // there with MIN_CROSSINGS_TO_EVICT; the budget refuses to act on one reading and this row did not.
    //
    // The ring is deliberately SHORT. Three readings is enough to take a median that ignores one hot sweep,
    // and short enough that a gate which genuinely gets slower is reported within three sweeps rather than
    // averaged into the past forever -- the ratchet still ratchets.
    const serialRing = { ...(prior.serialRing || {}) };
    const SERIAL_RING = 3;
    const ring = (g, ms) => { serialRing[g] = (serialRing[g] || []).concat(ms).slice(-SERIAL_RING); };
    const sliceStamp = new Date().toISOString();
    for (const r of rows) if (r.serialMs != null) { serial[r.gate] = r.serialMs; serialAt[r.gate] = sliceStamp; ring(r.gate, r.serialMs); }
    let sliced = 0;
    if (serialSliceMs > 0) {
        const owed = serialSliceOrder(sel.run.filter((g) => serialAt[g] !== sliceStamp), serialAt);
        const until = Date.now() + serialSliceMs;
        for (const rel of owed) {
            if (Date.now() >= until) break;
            const one = await runOneAsync(rel, capMs, root);
            serial[rel] = one.ms; serialAt[rel] = sliceStamp; ring(rel, one.ms); sliced++;
        }
    }
    const out0 = { at: new Date().toISOString() };
    const rec = reconcile(rows);
    const green = rows.filter((r) => r.verdict === VERDICT.GREEN).length;
    // *** v4647c -- THIS WAS `.length` AND THE ROWS WENT IN THE BIN, WHICH IS THE DEFECT THIS TREE NAMES
    // MOST OFTEN: A COUNT STANDING IN FOR A PROPERTY, IN THE SWEEP ITSELF. *** Keith's gen-9 run reported
    // "143 false red" -- 11% of the swept population, twenty times the number redCensus measured here -- and
    // NOTHING COULD SAY WHICH GATES. A population of 143 nobody can list is not a finding anybody can act on.
    //
    // gateSweep.finalize has kept the full list since it was written (out.falseReds.push(rec), with both
    // timings) and gateSweep-selfcheck asserts "each false red carries both timings, so the starvation claim
    // can be re-read later". One concept, two modules, and the one verify actually runs was the one that
    // threw the evidence away.
    //
    // `falseReds` STAYS A NUMBER because verify.mjs and the report line below both read it as one; the list
    // arrives beside it under gateSweep's own field name, so the two cannot drift into different spellings.
    const falseRedList = falseRedsOf(rows, phase1);
    const falseReds = falseRedList.length;
    // the timings file, rewritten with what was just seen (serial time where there was one)
    // v4408 -- *** PER-ENTRY PROVENANCE. *** This file used to stamp ONE `captured` date on all 1,440 entries
    // while rewriting only the ones it ran, so 502 readings carried a date they did not earn -- and the budget
    // decision is made FROM those readings, which made the exclusion a one-way door. `at` records, per entry,
    // the capture that actually observed it. Entries this run did not touch KEEP their old stamp, and an entry
    // that has never had one gets UNKNOWN_AT rather than a fabricated date: an unknown age is a finding, not a
    // default. See tools/ship/sweepCoverage.mjs.
    const timings = { ...(prior.timings || {}) }, codes = { ...(prior.codes || {}) };
    // *** v4470 MERGE -- TWO BRANCHES INVENTED THE SAME FIELD IN THE SAME WEEK, AND ONLY ONE SPELLING SURVIVES.
    // *** v4408 called it `at` and v4425 called it `observed`, for the identical reason: a row is rewritten only
    // when its gate RAN, so a whole-file `captured` date was being read as if it dated the rows. Two names for
    // one fact is how a field quietly stops being found in one of the two places -- this file's own argument
    // about ENGINE_VERSION, one level down -- so `at` is kept (it is what main ships and what backfillStamps
    // already fills) and tools/ship/budgetExile.mjs was changed to read it.
    const at = { ...(prior.at || {}) };
    // *** v4637 -- AND THE CAP IN FORCE WHEN IT WAS TAKEN, PER ENTRY, FOR THE SAME REASON `at` IS PER ENTRY.
    // *** `capMs` is a whole-file field over a file whose rows come from different runs -- exactly the shape
    // v4408 fixed for dates, left standing for the cap. It did not matter while every killed row came from
    // the same 20 s sweep; v4637's restore put the killed pass's 90 s readings back beside them, and a reader
    // asking "is this row a hair above the cap" against ONE number now gets 20,006..90,110 and no answer.
    // Written only where this run observed it. An entry from a run nothing can name has NO entry here rather
    // than the file's current cap back-filled onto it, which would be a fabricated number in the field built
    // to stop one.
    const capAt = { ...(prior.capAt || {}) };
    // *** v4579 -- WHAT THE MILLISECOND IS, NOT JUST WHAT IT IS. *** The line below files
    const sweptNow = new Set();
    // `serialMs ?? parallelMs`, so an entry is an ALONE reading when a serial run happened and a LOADED one
    // when it did not -- two different physical quantities in one column, which v4578 measured at 1.93x apart
    // and which this arc itself got wrong for nine entries by assuming the column meant one thing. Nothing
    // marked which until now. `kinds` records it AT THE MOMENT OF WRITING, where it is known for certain
    // rather than inferred later from which side of the budget the number landed on.
    const kinds = { ...(prior.kinds || {}) };
    const stamp = out0.at;
    // v4536: a crossing is COUNTED rather than acted on -- see countCrossings, which is exported and pure so
    // a gate can drive the reset on a fixture. It was NOT, in the first draft of this round, and the sabotage
    // that deleted the reset went 0 red beside a comment warning that deleting the reset is the whole risk.
    const crossings = countCrossings(prior.crossings, rows, budgetMs);
    // *** v4568 -- WHETHER THE PROCESS FINISHED IS WRITTEN HERE TOO, or the field only ever describes gates
    // the rotation happened to touch. *** sweepCoverage.census splits the killed bucket on `finished`, and a
    // split fed by one writer of two is a split that goes stale the moment the other writer runs. A sweep
    // that caps a gate must be able to say so, and a sweep that runs one to completion must be able to
    // clear a stale true -- so it is recorded in BOTH directions on every row, never only when it is false.
    const finished = { ...(prior.finished || {}) };
    const contended = { ...(prior.contended || {}) };
    // *** v4637 -- A CAP IS A LOWER BOUND, AND WRITING ONE OVER A MEASUREMENT REPLACES A FACT WITH A WEAKER
    // STATEMENT ABOUT THE SAME FACT. *** Every field above is careful that a gate's millisecond and its label
    // come from ONE run. Nothing was careful about the millisecond ITSELF: the line below assigned
    // unconditionally, so a 20 s cap landed on top of a real reading and the two are indistinguishable
    // afterwards, both being a number in `timings`.
    //
    // *** WHAT IT COST, MEASURED: v4568 SPENT A NINETY-SECOND SERIAL PASS CLEARING THE KILLED BUCKET AND ONE
    // ROUTINE SWEEP PUT IT BACK. *** The pass ran all 140 and wrote what 103 actually took; at this line's
    // parent commit the file held ZERO capped readings. A parallel line of development ran an ordinary 20 s
    // sweep, and 137 gates went real-to-cap -- 134 of them the pass's own -- against 0 going the other way.
    // 108 of the 137 discarded readings were CONSISTENT with the cap that replaced them (already above it),
    // so the sweep paid a measurement for a lower bound it already had.
    //
    // A cap says "at least capMs" and nothing more. Where the prior entry ALREADY says a larger number the
    // cap adds no information and the prior entry stands; where the prior says a SMALLER one the cap
    // contradicts it -- the gate newly exceeds this cap -- and that is news, so it is written.
    //
    // *** THE COMPARISON IS AGAINST THE PRIOR NUMBER AND NOT AGAINST "IS THE PRIOR A MEASUREMENT", because
    // A BIGGER CAP IS A BETTER LOWER BOUND THAN A SMALLER ONE. *** Eleven of the gates above sat at 90,097 ms
    // from the killed pass's own cap and were overwritten with 20,032 -- seventy seconds of established floor
    // traded for nothing, on entries a narrower rule would have called "capped either way, let it write".
    //
    // On the keep path NOTHING is written for that gate: code, kind, stamp, finished and contended stay the
    // prior run's alongside the prior millisecond, because a tuple assembled from two runs is exactly the
    // defect v4579 built `kinds` to prevent. The declined caps are reported instead, so a run never drops an
    // observation in silence.
    const supersededByCap = [];
    for (const r of rows) {
        const priorMs = (prior.timings || {})[r.gate];
        const newMs = r.serialMs ?? r.parallelMs;
        const newCode = r.serialCode ?? 0;
        const newSkipped = r.serialSkipped ?? r.parallelSkipped;
        const newIsCap = !newSkipped && (newCode === 124 || newMs >= capMs);
        if (newIsCap && priorMs != null && priorMs >= newMs &&
            (prior.kinds || {})[r.gate] !== KIND.SKIPPED) {
            // NOT added to sweptNow: the entry still carries the kind it had, inferred or not.
            supersededByCap.push({ gate: r.gate, kept: priorMs, cap: newMs });
            continue;
        }
        timings[r.gate] = r.serialMs ?? r.parallelMs; codes[r.gate] = r.serialCode ?? 0; at[r.gate] = stamp;
        capAt[r.gate] = capMs;
        // *** v4556 -- WHICH OF THE TWO MEASUREMENTS THIS ENTRY IS, WRITTEN BESIDE IT. *** The line above
        // files a SERIAL number whenever there was a serial re-run and a PARALLEL one otherwise, and until
        // now nothing recorded which. See contentionPairs(): the ratio that justifies the whole `serial`
        // map was being computed over 164 gates whose two readings are one measurement.
        finished[r.gate] = !(r.serialTimedOut ?? r.parallelTimedOut ?? false);

        // A killed reading is neither quantity -- v4574 established it is the cap's clock and not the gate's.
        // *** SKIPPED FIRST, BECAUSE IT IS A DIFFERENT QUESTION FROM THE OTHER THREE. *** Those three say under
        // what conditions the number was taken; this one says the gate declined to run, so the number measures a
        // refusal. Read from the SAME run that produced the millisecond -- `serialSkipped ?? parallelSkipped`
        // mirrors `serialMs ?? parallelMs` exactly -- because a label taken from the other run would be the drift
        // v4579 built this map to prevent.
        sweptNow.add(r.gate);
        const skipped = r.serialSkipped ?? r.parallelSkipped;
        // *** v4637 -- "WAS THIS KILLED" IS ANSWERED BY THE FACT, NOT BY COMPARING A NUMBER TO THE CAP. ***
        // `timings[g] >= capMs` is a proxy, and the same proxy KILLED_PASS_V4568's own note says it got
        // wrong: "the pass called it finished-and-failed because execFileSync's timeout can leave an exit
        // STATUS rather than a signal, so 'was this killed' was answered by comparing a number to the cap
        // instead of by the fact." `finished` IS that fact and has been in this loop since v4568. The proxy
        // reads a gate that ran 22,156 ms to completion as CAPPED whenever the file's cap is 20,000 -- and
        // after v4637's restore that describes SIXTY-SEVEN entries, every one of them code 0 and finished.
        // The cap comparison survives only where nothing observed whether the process finished.
        kinds[r.gate] = skipped ? KIND.SKIPPED
                      : (r.serialCode ?? 0) === 124 || !finished[r.gate] ? KIND.CAPPED
                      : r.serialMs != null ? KIND.ALONE : KIND.LOADED;
        // *** AND `contended` IS NOW A READING OF THE KIND RATHER THAN A SECOND DECISION ABOUT THE SAME
        // FACT. *** It was `r.serialMs == null`, which is true of a CAPPED and of a SKIPPED entry as well --
        // so it called the cap's own clock a parallel sample. The kind already separates those three, and two
        // predicates over one fact are two things that can disagree. Every existing reader of `contended` is
        // unaffected where the entry is a real sample; what changes is that a capped or skipped reading stops
        // claiming to be one.
        contended[r.gate] = kinds[r.gate] === KIND.LOADED;
    }
    backfillStamps(timings, at);
    const dropped = sel.run.filter((g) => (prior.timings || {})[g] != null && timings[g] > budgetMs);
    // *** v4647e -- WHOSE MEMBERSHIP LIST DID THIS SWEEP JUST RUN? *** budgetMs is a MEMBERSHIP THRESHOLD and
    // is deliberately NOT scaled per box (see budgetIsOwn: it is a claim about the sweep's TOTAL COST, so a
    // slower machine should include FEWER gates, not be granted a longer budget). That is right, and it has a
    // consequence nobody was stating: the membership comes from sweep-timings.json, which since v4647 belongs
    // to ONE box -- so a second machine runs the first machine's list and then discovers how much of it is
    // over budget there. Keith's gen-9 run: 219 of 1,306, seventeen per cent, against a handful here.
    //
    // Reported rather than corrected. A foreign box cannot write that record (by design -- two machines'
    // runtimes in one set of fields is whichever ran last) so it has nowhere to put a corrected membership,
    // and inventing one per box would make two boxes' "the sweep is green" mean different things silently.
    // What changes is that it no longer means them differently in SILENCE.
    const timingsHost = prior.host || null;
    const foreignTimings = !!timingsHost && timingsHost !== boxId();
    const out = {
        at: out0.at, budgetMs, workers, capMs, ms: Date.now() - t00,
        timingsHost, foreignTimings, box: boxId(),
        enumerated: all.length, ran: sel.run.length, skippedOverBudget: sel.skipped.length, newGates: sel.unmeasured,
        // v4566: what an incremental sweep WOULD have skipped. Reported on every run, acted on only under
        // skipUnchanged, so the number earns trust in public before it is allowed to change anything.
        unchangedInputs: (sel.unchanged || []).length, skippedUnchanged: skipUnchanged,
        // *** v4637 -- THE CAPS THIS RUN DECLINED TO WRITE, NAMED RATHER THAN COUNTED. *** A cap that lands
        // on a gate whose existing reading is already above it is no observation, and dropping it silently
        // is the same silence the write itself used to have. The list is what the run saw and did not keep.
        supersededByCap: supersededByCap.length, supersededGates: supersededByCap.map((x) => x.gate).sort(),
        // *** v4574 -- A SKIPPED RED IS STILL A RED, AND THE COUNT ALONE SAID OTHERWISE. ***
        // The first armed run reported "12 known red" against the full sweep's 19, because seven registered
        // reds had unchanged inputs and were skipped. Nothing was wrong and the output read like seven gates
        // had been fixed -- a SMALLER NUMBER THAT LOOKS LIKE PROGRESS, which is the shape this session has
        // found in a corpus that shrank, a skip count that rose and a sweep that filed fewer rows. So the
        // register is intersected with what was skipped and the difference is printed rather than left for a
        // reader to notice.
        knownRedSkipped: skipUnchanged
            ? (() => { const reg = redRegister(); return (sel.unchanged || []).filter((g) => reg.has(g)).length; })() : 0,
        green, falseReds, falseRedList, falseRedSplit: falseRedSplit(falseRedList), knownRed: rec.known, newRed: rec.newRed, unmeasured: rec.unmeasured, dropped,
        // v4408: green gates whose PARALLEL time crossed the budget and were re-run alone before being filed,
        // and how many of those the serial reading brought back under. The second number is the starvation.
        budgetConfirmed: rows.filter((r) => r.from === "budget-confirm").length,
        budgetRescued: rows.filter((r) => r.from === "budget-confirm" && r.serialMs <= budgetMs).length,
        // v4536: gates over budget that were RUN ANYWAY because this is their first crossing, and how many
        // crossed on this sweep. A first crossing is a reading from one hour; a second is a property.
        serialSliced: sliced, serialKnown: Object.keys(serial).length,
        onProbation: sel.onProbation, crossedOnce: Object.keys(crossings).filter((g) => crossings[g] === 1).length,
        evictable: Object.keys(crossings).filter((g) => crossings[g] >= MIN_CROSSINGS_TO_EVICT).length,
    };
    if (write) {
        // v4647 -- whose stopwatch. A foreign box writes its own file rather than overwriting this one.
        const target = timingsTarget(prior, { file: timingsFile });
        // v4647h: through the caller's sink. This line fires on a FOREIGN box -- the only kind whose
        // result gets carried to another machine -- so under --json it was the line most likely to
        // land inside the capture and the least likely to be noticed by the box that wrote it.
        if (target.foreign) log(`[sweep] NOT writing ${timingsFile}: ${target.why}`);
        fs.writeFileSync(path.join(root, target.file), JSON.stringify({
            host: target.host,
            note: "OBSERVED at the last quickSweep run: ms per gate (serial where a serial re-run happened) and exit code. " +
                  "*** `kinds` (v4579) SAYS WHICH QUANTITY EACH MS IS: `loaded` is a parallel reading taken with " +
                  "`workers` gates running at once, `alone` is a serial re-run, `capped` is the SIGKILL cap and not a " +
                  "runtime at all. The two real kinds sit about 1.93x apart (v4578), so comparing a ms against anything " +
                  "without knowing its kind is comparing two different quantities -- which is how nine entries came to " +
                  "hold the wrong one. *** Rewritten every run; " +
                  "used only to choose which gates are under the ship-time budget. Not a claim about the tree -- the register is. " +
                  "`at` is PER ENTRY (v4408): the capture that actually observed that gate. `captured` is this run's stamp and " +
                  "applies ONLY to entries whose `at` equals it -- the rest were not run and say so. " +
                  "`crossings` (v4536) counts CONSECUTIVE sweeps on which a gate came in over budget, and it takes " +
                  "two to evict: one crossing is a reading from one hour, and this box moves 12-36% between hours " +
                  "on unchanged code. A gate that comes back under loses its count entirely. " +
                  "`serial` (v4562) is the UNCONTENDED cost -- from a phase-2 run or from this sweep's rotating " +
                  "slice -- while `timings` is a sample taken while seven other gates fought for the box and " +
                  "runs a MEDIAN 2.41x above it. Ask costOf(), not timings[], for what a gate costs. " +
                  "`contended` (v4556) says WHICH of the two `timings[g]` is: true for a parallel sample, " +
                  "false for a serial reading filed there -- by a red re-run, a budget confirm, or " +
                  "sweepRotation. A ratio taken without it divides 164 measurements by themselves. Ask " +
                  "contentionPairs() for the population a contention ratio may be taken over.",
            // *** `finished` IS IN THIS LIST BECAUSE IT WAS NOT, AND THE SWEEP ERASED IT. *** v4568 added the
            // field, wrote it into a local object in the loop above, and left it out of the object actually
            // written -- so the first full sweep after the killed pass silently deleted 140 rows of
            // it and sweepCoverage's graded/no-verdict split went back to knowing nothing. THIRD TIME IN
            // THIS SESSION for the same shape: tslRace's first section deleting the keys its later sections
            // owned, inputSets.encode dropping a renamed flag, and now this. A writer that spells its fields
            // by hand is a list that has to be maintained in step with every reader of the file, and
            // ROTATION_LOST_V4461 is the same mechanism across two processes rather than inside one.
            // *** v4582 -- CARRIED FORWARD, MINUS WHAT THIS RUN ACTUALLY OBSERVED. ***
            //
            // v4579 wrote `kindsInferred` -- the 1,620 entries whose kind was BACK-DERIVED from the branch rule
            // rather than watched -- because "an inference dressed as an observation is the fault five rounds of
            // this arc have been about". It then never taught this writer about the field, so the first real
            // sweep dropped it: a five-gate run took the list from 1,620 to ZERO and left 1,637 inferred kinds
            // presenting as observed. MEASURED, not reasoned -- driving this writer on five gates is what
            // produced the empty array.
            //
            // A gate this run swept has an OBSERVED kind and leaves the list. Every other entry keeps whatever
            // it had, because this run learned nothing about it.
            kindsInferred: (prior.kindsInferred || []).filter((g) => !sweptNow.has(g)),
            captured: out.at, budgetMs, capMs, timings, codes, at, capAt, finished, crossings, serial, serialAt, serialRing, contended, kinds,
        }, null, 1) + "\n");
    }
    return out;
}

// ---- THE REPORT, AS A VALUE ---------------------------------------------------------------------------
//
// *** v4647f -- THE LINE THAT NAMES THE FALSE REDS THREW THE MOMENT THERE WERE ANY. *** v4647d added the
// block that finally names them (the round before, the sweep counted 143 starved gates and named none), and
// wrote `${capMs} ms CAP` and `${workers} of these at once` into it. Neither name exists at module scope:
// the command line holds them as `opts.capMs` and `opts.workers`, so the template literal was a
// ReferenceError -- and the block runs ONLY when `r.falseRedList.length`, which is to say ONLY when there is
// something to report. A green sweep printed fine. A sweep with a finding died before naming it.
//
// MEASURED, by running the CLI tail byte-identical with a synthetic result carrying one false red:
//
//     [quickSweep] 3 of 3 gates ... 1 false red        <- the summary line printed
//     ReferenceError: capMs is not defined  at 784:20  <- and then it died, exit 1
//
// EIGHTH crash-instead-of-a-finding this session and the purest of them: the error path and the finding path
// were the same path. `grep -c '^  FAIL'` cannot see this and neither can a green run, which is why the
// repair is not "declare capMs" -- it is to make the report A VALUE A GATE CAN CALL. reportLines() takes
// every number from the result object, so there is no scope it can reach past, and
// tools/ship/quickSweep-selfcheck.mjs calls it on a result WITH false reds.
//
// *** AND THE SAME BLOCK WAS UNREACHABLE A SECOND WAY. *** `--json` printed JSON INSTEAD of the report, so
// the run that saves the data is the run that discards the reading. Keith ran `--workers 4 --json > w4.json`
// on my instruction and was left with a pretty-printed file and a `findstr` that matched the key and none of
// the values -- my instruction, and the wrong one. Under --json the report now goes to STDERR (so the
// redirect still captures clean JSON) and `--read <file>` prints it from a saved run.
// NOT THE ONLY COPY, AND SAYING SO RATHER THAN PRETENDING OTHERWISE: tools/ship/verify.mjs prints this same
// reading again, by hand, with a `[verify]` prefix and twenty rows instead of twelve. It is left alone this
// round because it is EXERCISED ON EVERY SHIP -- which is precisely what the --json branch was not, and why
// that one rotted while this one stayed correct. A second copy that runs every time is a maintenance cost; a
// second copy that runs only when somebody redirects to a file is a trap.
// ---- READING A FILE SOMETHING ELSE WROTE ----------------------------------------------------------------
//
// *** v4647h -- `--read` CRASHED ON THE FIRST REAL FILE IT WAS POINTED AT. *** Keith pulled v4647g, ran
// `--read w4.json`, and got a bare `SyntaxError: Unexpected token 'q'` and a stack trace. The file starts
//
//     [quickSweep] 1/427
//     [quickSweep] 43/427
//     {
//      "at": ...
//
// TENTH crash-instead-of-a-finding this session, in the function I wrote TWO ROUNDS AGO whose entire job is
// to make a saved run readable. `JSON.parse` of a file a shell redirect produced, with no guard at all.
//
// *** AND THE CONTAMINATION IS THE TOOL'S OWN FAULT, NOT THE SHELL'S. *** `--json > file` was my
// instruction, and a redirect captures whatever lands on stdout -- including `[sweep] NOT writing
// <timings>: ...`, a console.log INSIDE runQuickSweep that fires on exactly one kind of box: a FOREIGN one,
// which is the only kind that would be sending a result to another machine to be read. The one line most
// likely to be in the capture is the one only the capturing box prints. So:
//
//   - `--out <file>` writes the JSON itself. No redirect, nothing to contaminate, identical on cmd,
//     PowerShell and bash. A tool that needs a shell feature to produce its output owns the bug when the
//     shell feature does something else.
//   - the sweep's own console.log is now a `log` sink the caller supplies.
//   - and this reader RECOVERS rather than throwing -- saying out loud what it skipped, because a silent
//     recovery is how a corrupt file becomes a confident wrong answer.
const TAG_LINE = /^\[[A-Za-z][\w-]*\] /;
/**
 * The assertion lines a red gate printed, from the tail the run already captured. Bounded on purpose: a
 * report is read by a person, and a gate that fails forty rows should say so rather than paste them.
 */
export function failLinesOf(tail, { max = 4 } = {}) {
    const all = String(tail || "").split("\n").filter((l) => FAIL_LINE.test(l)).map((l) => l.trimEnd());
    return all.length <= max ? all
        : all.slice(0, max).concat(`  ... and ${all.length - max} more FAIL line(s)`);
}

/**
 * *** WHAT A GATE THAT PRINTED NO FAILING ROW SAID BEFORE IT DIED. ***
 *
 * v4649. Seven gates on Keith's box exit non-zero having printed ZERO "  FAIL" lines -- five with a Windows
 * fail-fast (0xC0000409), one with an access violation, the rest with a bare exit 1. failLines reports them
 * as CRASHED and says what they were checking is UNKNOWN, which is true and is as far as anyone has got in
 * three rounds.
 *
 * But the run already keeps a 4 KB tail, and for a gate that dies mid-way THE LAST LINE IT PRINTED NAMES THE
 * LAST THING THAT RAN. A fail-fast writes nothing to stderr at all, so that line is the entire diagnosis
 * available -- it turns "contactOverlay crashed" into "contactOverlay crashed after the row about X", which
 * is a section to read instead of a file.
 *
 * Bounded and last-N because the tail is a tail: the interesting end is the end.
 */
export function deathTail(tail, { max = 3 } = {}) {
    return String(tail || "")
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.trim() && !FAIL_LINE.test(l))
        .slice(-max)
        .map((l) => l.slice(0, 200));
}

const REQUIRED = ["ran", "enumerated", "budgetMs", "green", "knownRed", "newRed", "unmeasured", "dropped"];

/**
 * Parse a saved --json result out of `text`. NEVER THROWS.
 *
 * Returns { result, skipped, error }. `skipped` is the tool-tag lines dropped to get there -- reported by
 * the caller, never swallowed. `error` is a sentence naming what the file actually looks like.
 */
export function readSaved(text) {
    const direct = tryParse(text);
    if (direct) return { result: direct, skipped: [], error: null };
    // A pretty-printed result never puts a raw newline inside a string, so dropping whole lines cannot cut
    // through one. That is a property of JSON.stringify(x, null, 1) and is why this is safe HERE and would
    // not be for arbitrary JSON.
    const lines = String(text).split(/\r?\n/);
    const skipped = [];
    let i = 0;
    while (i < lines.length && (TAG_LINE.test(lines[i]) || lines[i].trim() === "")) {
        if (lines[i].trim()) skipped.push(lines[i]);
        i++;
    }
    const rest = lines.slice(i).filter((l) => !TAG_LINE.test(l));
    for (const l of lines.slice(i)) if (TAG_LINE.test(l)) skipped.push(l);
    const salvaged = tryParse(rest.join("\n"));
    if (salvaged) return { result: salvaged, skipped, error: null };
    const first = (lines.find((l) => l.trim()) || "").slice(0, 80);
    return { result: null, skipped,
             error: first ? `not a quickSweep --json result; it starts "${first}"` : "the file is empty" };
}

function tryParse(text) {
    let v;
    try { v = JSON.parse(text); } catch { return null; }
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    // *** A SHAPE CHECK, BECAUSE "IT PARSED" IS NOT "IT IS ONE OF MINE". *** package.json parses. So does a
    // half-written file from a run that was killed. reportLines would then read undefined.length and throw,
    // which is the same crash one layer further in.
    return REQUIRED.every((k) => k in v) ? v : null;
}

// *** DERIVED FROM THE CODE WHEN THE ROW DOES NOT CARRY A KIND. *** Keith's w4b.json was written by v4647h,
// before `kind` existed, and it is the very file this round is about -- a reader that only understood rows
// written after the fix would be unable to say anything about the run that produced the finding. The code
// is in every saved result this tool has ever written, so the classification is available for all of them.
const killed = (n) => !!n && exitKind(n.code) === EXIT_KIND.OS_KILL;

/** How many of a result's NEW reds are OS kills rather than findings. Works on results saved before v4647i. */
export function crashCount(r) { return ((r && r.newRed) || []).filter(killed).length; }

export function reportLines(r) {
    const out = [];
    out.push(`[quickSweep] ${r.ran} of ${r.enumerated} gates under ${r.budgetMs} ms ran in ${(r.ms / 1000).toFixed(0)} s: ` +
        `${r.green} green, ${r.knownRed.length} known red${r.knownRedSkipped ? " (+" + r.knownRedSkipped + " skipped, still red)" : ""}, ` +
        `${r.newRed.length} NEW red${crashCount(r) ? " (" + crashCount(r) + " KILLED BY THE OS, not findings)" : ""}, ` +
        `${r.falseReds} false red, ${r.unmeasured.length} unmeasured; ` +
        `${r.skippedOverBudget} over budget skipped, ${r.newGates.length} new gates measured, ${r.dropped.length} dropped from budget`);
    // v4647 -- whose membership list this was. A foreign box runs the owning box's selection and then finds
    // out how much of it is over budget there; that is by design (budgetIsOwn) and is no longer silent.
    if (r.foreignTimings) out.push(`[quickSweep] NOTE: the membership came from ${r.timingsHost} and this is ${r.box}. ` +
        `${r.skippedOverBudget} gates were skipped as over budget by THAT box's stopwatch, not this one's.`);
    // *** NAMED, NOT ONLY COUNTED. *** A box that reports 143 of these and cannot list one has measured
    // nothing anybody can act on. Ordered by how much the parallelism cost each gate, because that is the
    // evidence that they ARE starvation and not a flake -- a ratio near 1 is a gate that was never slowed.
    if (r.falseRedList && r.falseRedList.length) {
        const sp = falseRedSplit(r.falseRedList);
        out.push(`[quickSweep] ${r.falseReds} FALSE RED (red under -P, green alone): ${sp.capped} KILLED AT THE ` +
            `${r.capMs} ms CAP, ${sp.slowed} genuinely slower. Different causes -- a gate killed at the cap while ` +
            `finishing in seconds alone is a box that cannot run ${r.workers} of these at once, not one fighting for CPU.`);
        const top = r.falseRedList.slice(0, 12);
        for (const f of top) out.push(`[quickSweep]   ` +
            (f.capped ? "CAPPED".padStart(7) : (String(f.ratio ?? "?") + "x").padStart(7)) +
            `  ${f.gate}  ${f.parallelMs} ms loaded -> ${f.serialMs} ms alone` +
            (f.parallelCode != null ? `, exit ${f.parallelCode}` : ""));
        if (r.falseRedList.length > top.length) out.push(`[quickSweep]   ... ${r.falseRedList.length - top.length} more; --json carries all of them`);
    }
    if (r.unchangedInputs) out.push(`[quickSweep] ${r.unchangedInputs} of those had NO CHANGED INPUT and ` +
        (r.skippedUnchanged ? "were SKIPPED. Pass --full to run them: a wrongly skipped gate is the one failure "
                            + "here that is silent, and tools/ship/importClosure.mjs is what bounds it"
                            : "were RUN (--full)"));
    for (const k of r.knownRed) out.push(`  known  ${k.gate}  (${k.record})`);
    // A CRASH IS NOT A FINDING, AND THE LIST USED TO SPELL THEM THE SAME. `exit 3221226505` sends a reader
    // looking for a FAIL line that was never printed; naming the kill says where to look instead.
    for (const n of r.newRed) out.push(killed(n)
        ? `  CRASH  ${n.gate}  KILLED BY THE OS: ${exitName(n.code) || n.code} after ${n.ms} ms -- no FAIL line was printed`
        : `  NEW    ${n.gate}  exit ${n.code} in ${n.ms} ms`);
    // *** AND WHAT THE GATE ACTUALLY SAID, WHICH IS THE WHOLE POINT. *** A path and an exit code cannot be
    // acted on, compared between boxes, or told apart from the same gate failing for a different reason.
    // Absent where the run captured nothing -- a crash prints no FAIL line, and saying so is the finding.
    for (const n of r.newRed) {
        const lines = (n && n.fail) || [];
        if (lines.length) { for (const l of lines) out.push("       " + l.replace(/^\s+/, "")); continue; }
        // *** v4649 -- AND WHERE IT GOT TO, FOR THE ONES THAT PRINTED NO ROW AT ALL. *** "no FAIL line was
        // printed" is true and stops one step short: the last line the gate DID print names the last row
        // that ran. On a Windows fail-fast, which writes nothing to stderr, that is the only diagnosis
        // anybody on that box can send back.
        const died = (n && n.died) || [];
        if (!died.length) continue;
        out.push("       no failing row -- the last thing it printed before it went:");
        for (const l of died) out.push("         " + String(l).replace(/^\s+/, ""));
    }
    for (const d of r.dropped) out.push(`  slower ${d}  now over budget`);
    return out;
}

// ---- THE COMMAND LINE, WHICH USED TO ACCEPT ANYTHING ----------------------------------------------------
//
// *** v4647g -- AN UNKNOWN OPTION WAS IGNORED IN SILENCE, AND THE SILENCE COST 1,914 SECONDS. ***
// Keith ran `--read w4.json` on a tree that did not yet have --read. The old `arg()` is
// `process.argv.indexOf(name)`, so an option this build does not know about matches nothing, returns its
// default, AND THE RUN PROCEEDS -- for 427 gates and 1,914 s, ending in the ReferenceError v4647f had just
// repaired, having answered a question he did not ask. The same line refuses in 81 ms now.
//
// The parser lives in tools/ship/cliArgs.mjs, with the census of the five tools that still take arguments
// the silent way and the note on --gate/--gates, two spellings of one idea live in this directory.
export const CLI = Object.freeze({
    values: Object.freeze({ "--budget": "number", "--workers": "number", "--cap": "number",
                            "--timings": "path", "--read": "path",
                            // v4647h -- THE TOOL WRITES ITS OWN FILE. `--json > file` was my instruction and
                            // it produced a file that was not JSON, because a redirect captures whatever
                            // lands on stdout and the sweep had a console.log of its own. A tool that needs
                            // a shell feature to produce its output owns the bug when the shell does
                            // something else -- and cmd, PowerShell and bash do not agree about redirects.
                            "--out": "path" }),
    // v4574: `--incremental` parses and means nothing, deliberately -- a flag in somebody's muscle memory or
    // a script should not become an error the day the default changes. That is the OPPOSITE of an unknown
    // option: this one is KNOWN to be a no-op, and being known is the whole difference.
    // v4647h -- `--no-write` exists so a run can be driven WITHOUT mutating sweep-timings.json. The gate for
    // --out needs a real command line (a source row passes on a build whose CLI never calls it -- that is how
    // the --json branch rotted), and a gate that rewrites the tree's timings file every time it runs is worse
    // than the row is worth.
    flags: Object.freeze(["--json", "--full", "--incremental", "--no-write"]),
});

// ---- CLI ------------------------------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    // *** REFUSE BEFORE SPENDING ANYTHING. *** This block runs before a single gate is enumerated, because
    // the whole finding is that the old command line spent 1,914 s answering a question nobody asked.
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("quickSweep", cli.errors, CLI)) console.error(l); process.exit(2); }
    const arg = (n, d) => (n in cli.values ? cli.values[n] : d);
    const readFrom = arg("--read", null);
    if (readFrom) {
        // A SAVED RUN IS STILL A RUN. The measurement that decides #53 -- do the cap kills collapse at four
        // workers -- was taken on Keith's box and then sat in a file nothing could print.
        let text;
        try { text = fs.readFileSync(path.resolve(readFrom), "utf8"); }
        catch (e) { console.error(`[quickSweep] cannot read ${readFrom}: ${e.message}`); process.exit(2); }
        const { result, skipped, error } = readSaved(text);
        if (!result) {
            console.error(`[quickSweep] ${readFrom} is ${error}`);
            console.error(`[quickSweep] a result comes from --out <file>, or from --json redirected to one. ` +
                          `Nothing was read.`);
            process.exit(2);
        }
        // SAID OUT LOUD. A recovery nobody is told about is how a contaminated file becomes a confident
        // wrong answer, and these lines are the evidence that the capture was contaminated at all.
        if (skipped.length) {
            console.error(`[quickSweep] ${readFrom} had ${skipped.length} non-JSON line(s) in it, skipped:`);
            for (const l of skipped.slice(0, 3)) console.error(`[quickSweep]   ${l.slice(0, 90)}`);
            if (skipped.length > 3) console.error(`[quickSweep]   ... ${skipped.length - 3} more`);
            console.error(`[quickSweep] that is a redirect capturing this tool's own stdout. Use --out <file>.`);
        }
        for (const line of reportLines(result)) console.log(line);
        process.exit(0);
    }
    // No Number() here: parseArgs already refused anything that is not a positive finite number, so a value
    // that reaches this line is one. Converting at the point of use is how `--budget --json` became NaN.
    const opts = { budgetMs: arg("--budget", DEFAULTS.budgetMs), workers: arg("--workers", DEFAULTS.workers),
                   capMs: arg("--cap", DEFAULTS.capMs), timingsFile: arg("--timings", DEFAULTS.timingsFile) };
    let lastPct = -1;
    // *** v4574 -- ARMED. THE DEFAULT IS NOW TO SKIP, AND --full IS HOW YOU TURN IT OFF. ***
    // v4566 shipped this disarmed on a sentence -- "an input set is what a gate read on ONE RUN, a sample and
    // not a specification" -- and v4573 turned that sentence into two measured properties: every gate's whole
    // STATIC import closure is in its recorded set (0 misses over 1,258 gates), and every gate with a DYNAMIC
    // reach outside its set is refused. Beside the structure: two independent probe passes agreed on 99.0% of
    // read sets, and the differential test twice -- break render/exactHash.mjs, run all 1,055 gates this would
    // have skipped, ZERO verdicts moved; break sourceScan.mjs's codeOnly, 882 skipped, ZERO moved.
    //
    // `--incremental` still parses and now means nothing, because a flag in somebody's muscle memory or a
    // script should not become an error the day the default changes.
    opts.skipUnchanged = !cli.flags.has("--full");
    if (cli.flags.has("--no-write")) opts.write = false;
    // The sweep's own chatter goes wherever the report goes, never into a capture.
    const outFile = arg("--out", null);
    const quiet = cli.flags.has("--json") || !!outFile;
    opts.log = quiet ? ((m) => process.stderr.write(m + "\n")) : ((m) => console.log(m));
    const r = await runQuickSweep({ ...opts, onProgress: (d, t) => { const pct = Math.floor(100 * d / t); if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stderr.write(`[quickSweep] ${d}/${t}\n`); } } })
        .catch((e) => { console.error("[quickSweep] runner failed: " + (e && e.message)); process.exit(2); });
    // THE REPORT IS PRINTED EITHER WAY. Under --json it goes to stderr so that `--json > file` still captures
    // clean JSON on stdout -- a redirect that swallows the reading is how w4.json came to be unreadable.
    const sink = quiet ? ((s) => process.stderr.write(s + "\n")) : ((s) => console.log(s));
    if (outFile) { fs.writeFileSync(path.resolve(outFile), JSON.stringify(r, null, 1) + "\n"); process.stderr.write(`[quickSweep] wrote ${outFile}\n`); }
    if (cli.flags.has("--json")) console.log(JSON.stringify(r, null, 1));
    for (const line of reportLines(r)) sink(line);
    process.exit(r.newRed.length ? 1 : 0);
}
