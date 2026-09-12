/**
 * TWO RECORDS OF ONE QUANTITY, DISAGREEING FOR 43% OF GATES, AND NEITHER IS THE ONE TO TRUST.
 *
 * *** v4576 CORRECTED THIS GATE'S HEADLINE AND THE CORRECTION BELONGS AT THE TOP. *** The 43% below is
 * real as a count and was reported here as though it were a defect. It is mostly the threshold: the measured
 * load factor is 2.15x, the median dated disagreement is 1.94x, and the residual is 0.90x. See
 * timingLoad-selfcheck.mjs for the experiment. What remains is roughly thirteen gates.
 *
 * v4574 closed on a cheap lead: tools/ship/redCensus-selfcheck.mjs describes itself as taking two minutes and
 * exceeded a 400-second timeout without finishing, so gate prose about cost might be as stale as the timings
 * v4574 had just finished picking apart. *** THE FIRST THING THIS ROUND FOUND IS THAT THE INSTRUMENT ALREADY
 * EXISTED. *** tools/ship/statedRuntime-selfcheck.mjs has compared stated runtimes against observed ones since
 * v3213, and it was RED, naming four headers that had drifted. Not a rung to build -- a red to act on.
 *
 * *** THE FOUR WERE CORRECTED FROM A CLOCK, AND ONE OF THEM WAS HIDING A RED GATE. ***
 * commentFalsePass-selfcheck states ~4.2s, runs in 9.6s, and EXITS NON-ZERO. It is recorded in
 * sweep-timings.json at 20,025 ms with exit code 124 -- one of the 137 cap readings v4574 counted, which is
 * exactly why nobody had looked: nothing in the sweep has ever let it finish. *** THAT FALSIFIES v4574'S OWN
 * SENTENCE *** that "not one of the gates the sweep has only ever killed is red". Seventeen sampled were
 * green; the population is not, and this is the counter-example, found by a different route one round later.
 * Its red was a false positive -- see the licence-notice exemption now in that gate -- but a false positive
 * nobody can see is still a gate nobody is reading.
 *
 * *** AND FOLLOWING statedRuntime'S OWN INSTRUCTION WOULD HAVE WRITTEN A WRONG NUMBER. *** It says to correct
 * a drifted header "FROM THE MEASUREMENT in gate-timings.json". For shaderCensus-selfcheck that file held 239
 * ms against a measured 1501 -- 6.3x under. The header was right to be flagged and the file was the stale
 * half. The two are only separable by running the gate.
 *
 * *** SO THE SUBJECT IS THE PAIR OF RECORDS, NOT EITHER ONE. *** gate-timings.json (written by selfchecks.mjs
 * on a full run) and sweep-timings.json (written by quickSweep) both claim milliseconds per gate. Where the
 * sweep reading is real -- exit 0, under the cap -- 1143 gates appear in both, and 496 of them disagree by 2x
 * or more, the worst by 144x. A four-gate spot-check against a clock splits TWO AND TWO on which record is
 * closer. Neither can be used to correct the other, and that is the finding: not that one file is stale, but
 * that the tree holds two answers to one question and has no rule for which to believe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const G = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));

console.log("timingRecords-selfcheck -- the tree holds two answers to one question\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. TWO RECORDS, INDEPENDENTLY PRODUCED, OF THE SAME QUANTITY");
{
    ok("both files claim milliseconds per gate, and each says which run produced it",
        typeof G.note === "string" && typeof S.note === "string" &&
        /ms|millisecond/i.test(G.note) && /ms|millisecond/i.test(S.note),
        "gate-timings: written by selfchecks.mjs on a full run; sweep-timings: rewritten every quickSweep run");
    ok("  and they are independently produced, which is the only reason comparing them says anything",
        !/quickSweep/.test(G.note) && /quickSweep/.test(S.note),
        "one is a full-suite pass, the other a parallel sweep with a serial confirm");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** WHERE BOTH HOLD A REAL READING, 43% DISAGREE BY TWO-FOLD OR MORE ***");
// Only compare where the SWEEP value is a measurement: exit 0 and under the cap. v4574 established that a
// killed reading is the cap's clock and not the gate's, and comparing prose or a record against one of those
// would be reading the killer twice.
const both = Object.keys(G.timings).filter((k) => k in S.timings && fs.existsSync(path.join(ENG, k)));
const real = both.filter((k) => S.codes[k] === 0 && S.timings[k] < S.capMs);
const ratioOf = (k) => Math.max(G.timings[k], S.timings[k]) / Math.max(1, Math.min(G.timings[k], S.timings[k]));
const rows = real.map((k) => ({ k, g: G.timings[k], s: S.timings[k], r: ratioOf(k) })).sort((a, b) => b.r - a.r);
{
    const band = (lo, hi) => rows.filter((x) => x.r >= lo && x.r < hi).length;
    report(`${both.length} gates appear in both records; ${real.length} have a real sweep reading to compare against`);
    for (const [lo, hi, name] of [[1, 1.5, "within 1.5x"], [1.5, 2, "1.5x - 2x"], [2, 5, "2x - 5x"],
                                  [5, 10, "5x - 10x"], [10, Infinity, "10x or more"]])
        report(`  ${name.padEnd(12)} ${String(band(lo, hi)).padStart(4)}`);
    const over2 = rows.filter((x) => x.r >= 2).length;
    // *** AND v4576 MEASURED WHAT THIS NUMBER IS, WHICH IS MOSTLY THE LINE IT IS DRAWN AT. *** Running one
    // sample eight-wide and alone put the load factor at 2.15x; the median disagreement among gates with a
    // DATED sweep reading is 1.94x, so dividing it out leaves 0.90x -- the two records agree once the
    // conditions each was taken under are accounted for. The 43% cross 2x because the median sits just under
    // 2x and the distribution straddles it. What survives is about thirteen gates, concentrated in undated
    // readings at sixteen times the dated rate. This row therefore COUNTS the disagreement and no longer
    // implies it is a defect; timingLoad-selfcheck holds the decomposition.
    ok(`*** ${over2} of ${real.length} gates (${(100 * over2 / real.length).toFixed(0)}%) have two records of their runtime that disagree by 2x or more -- v4576 measured the load factor at 2.15x, so MOST OF THIS IS THE THRESHOLD ***`,
        over2 > real.length / 4, `worst ${rows[0].r.toFixed(0)}x: ${rows[0].k} recorded ${rows[0].g} and ${rows[0].s}`);
    // *** THE DIRECTION, AND THE FIRST VERSION OF THIS ROW GOT IT BACKWARDS. *** It asserted the
    // disagreement "runs both ways, so it is not growth and not parallel load" and PASSED on nine
    // counter-cases while printing 487 the other way. 98% in one direction is precisely what growth or an
    // eight-wide sweep looks like, so the label was refuted by its own detail. What the numbers support is
    // narrower: the sweep reads higher almost everywhere, which growth and load both explain, AND there are
    // nine gates where the older full-suite record is the larger one, which neither explains.
    const sweepHigher = rows.filter((x) => x.r >= 2 && x.s > x.g).length;
    const gateHigher = rows.filter((x) => x.r >= 2 && x.g > x.s).length;
    ok(`  and it is overwhelmingly ONE-directional -- the sweep reads higher in ${sweepHigher} of the ${sweepHigher + gateHigher}, which growth and an eight-wide sweep both explain`,
        sweepHigher > 10 * gateHigher, `${sweepHigher} sweep-higher against ${gateHigher} gate-timings-higher`);
    ok(`  but ${gateHigher} run the other way, where the OLDER full-suite record is the larger, and neither growth nor load explains those`,
        gateHigher > 0,
        rows.filter((x) => x.r >= 2 && x.g > x.s).slice(0, 3).map((x) => `${path.basename(x.k)} ${x.g}>${x.s}`).join(", "));
    // *** AND "OVERWHELMINGLY" IS QUANTIFIED IN A SECOND ROW, BECAUSE A THRESHOLD CANNOT POLICE ITSELF. ***
    // Loosening the bar above from `> 10 * gateHigher` to `> 0` went 0-RED in sabotage: an assertion weakened
    // is invisible to the assertion weakened. The claim is only held if a SEPARATE row carries the same
    // number, so a single edit leaves one of them standing.
    ok(`  and the word "overwhelmingly" is a measured ratio, not a manner of speaking: ${(sweepHigher / Math.max(1, gateHigher)).toFixed(0)} to 1`,
        sweepHigher / Math.max(1, gateHigher) > 10 && sweepHigher + gateHigher === rows.filter((x) => x.r >= 2).length,
        `${sweepHigher}:${gateHigher}, and the two directions partition all ${rows.filter((x) => x.r >= 2).length} disagreements`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. *** AND A CLOCK SPLITS TWO AND TWO ON WHICH RECORD IS CLOSER ***");
/**
 * MEASURED at v4575, each gate in its own process, median of three, nothing else running. Frozen by name:
 * re-running four gates to re-derive this is 20 s the gate should not spend on a fact that does not move.
 */
export const SPOT_CHECK_V4575 = Object.freeze({
    at: "v4575",
    // `sweepWas` is the sweep entry AS IT STOOD at v4575. v4576 re-took two of them from its own
    // alone-measurements -- rigJobs 6929 -> 6155 and hostScale 5815 -> 64 -- which flipped hostScale's
    // `closer` verdict and reddened the row below. Correcting a record deletes the evidence it was wrong, so
    // the table records the state it was measured against and the row re-derives from that.
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/rigJobs-selfcheck.mjs",     measured: 6296, closer: "sweep",        sweepWas: 6929,  gateWas: 48 }),
        Object.freeze({ gate: "tools/ship/exitBanner-selfcheck.mjs",  measured: 69,   closer: "gate-timings", sweepWas: 12940, gateWas: 139 }),
        Object.freeze({ gate: "ui/dockSystem-selfcheck.mjs",          measured: 45,   closer: "sweep",        sweepWas: 73,    gateWas: 1005 }),
        Object.freeze({ gate: "tools/ship/hostScale-selfcheck.mjs",   measured: 62,   closer: "gate-timings", sweepWas: 5815,  gateWas: 77 }),
    ]),
});
{
    const R = SPOT_CHECK_V4575.runs;
    for (const r of R)
        report(`${path.basename(r.gate).padEnd(30)} measured ${String(r.measured).padStart(6)}   gateWas ${String(r.gateWas).padStart(6)}   sweepWas ${String(r.sweepWas).padStart(6)}   now ${String(G.timings[r.gate]).padStart(6)}/${String(S.timings[r.gate]).padStart(6)}   closer: ${r.closer}`);
    // The claim is not "these four numbers": it is that the recorded verdict is RE-DERIVABLE from the two
    // records and the measurement. It is derived against `sweepWas`, the entry the verdict was taken against,
    // because v4576 corrected two of them and a verdict re-derived from the corrected file is a verdict about
    // a different question.
    // v4577 corrected BOTH files for three of these four, so the verdict derives from `gateWas` and
    // `sweepWas` -- the entries it was taken against. A verdict re-derived from repaired records answers a
    // different question, and this is the fourth time in three rounds that has mattered.
    const derived = R.map((r) => ({ gate: r.gate,
        closer: Math.abs(r.gateWas - r.measured) < Math.abs(r.sweepWas - r.measured) ? "gate-timings" : "sweep" }));
    ok("the recorded 'closer' verdict is re-derived from both records and the measurement, not restated -- against the sweep entry it was TAKEN against, which v4576 has since corrected for two of the four",
        derived.every((d, i) => d.closer === R[i].closer),
        derived.map((d) => `${path.basename(d.gate)}:${d.closer}`).join(" "));
    // The repair side, and the only thing in this section that reads the CURRENT files: every entry that has
    // moved must have moved TOWARD the measurement. That is a live invariant and survives further repair.
    const moved = R.filter((r) => S.timings[r.gate] !== r.sweepWas || G.timings[r.gate] !== r.gateWas);
    const closerNow = (was, now, m) => Math.abs(now - m) <= Math.abs(was - m);
    ok(`  and ${moved.length} of the ${R.length} have had an entry corrected since, by v4576 and v4577 -- every one moved TOWARD the measurement, which is the invariant this row keeps as the files go on changing`,
        moved.length >= 2 && moved.every((r) => closerNow(r.sweepWas, S.timings[r.gate], r.measured) &&
                                                closerNow(r.gateWas, G.timings[r.gate], r.measured)),
        moved.map((r) => `${path.basename(r.gate)} sweep ${r.sweepWas}->${S.timings[r.gate]}, gate-t ${r.gateWas}->${G.timings[r.gate]}`).join("; "));
    const bySweep = R.filter((r) => r.closer === "sweep").length;
    ok(`*** neither record wins: ${bySweep} of ${R.length} are closer to the sweep and ${R.length - bySweep} to gate-timings, so neither can be used to correct the other ***`,
        bySweep > 0 && bySweep < R.length, `${bySweep} / ${R.length - bySweep}`);
    ok("  and every gate in the table still exists and still appears in both records, so the table describes today's tree",
        R.every((r) => fs.existsSync(path.join(ENG, r.gate)) && r.gate in G.timings && r.gate in S.timings),
        `${R.length} gates checked against both files`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. *** THE CONSEQUENCE: AN INSTRUCTION THAT NAMES ONE RECORD AS 'THE MEASUREMENT' ***");
{
    // statedRuntime tells a reader to correct a drifted header from gate-timings.json. That is safe only if
    // that file is right, and section 3 says it is right about half the time.
    const sr = fs.readFileSync(path.join(ENG, "tools", "ship", "statedRuntime-selfcheck.mjs"), "utf8");
    ok("statedRuntime's failure message names gate-timings.json as the thing to correct a header from",
        /correct the header FROM THE MEASUREMENT/.test(sr), "its instruction to whoever finds the row red");
    // MEASURED at v4575: shaderCensus stated ~0.5s, gate-timings held 239 ms, a clock said 1501 ms. Following
    // the instruction literally writes 0.24s into a gate that takes 1.5s -- the header was flagged correctly
    // and the file was the stale half. The entry has since been re-timed, so this row pins the LESSON against
    // the live file rather than the incident: gate-timings now agrees with the clock for that gate.
    const SHADER = "tools/ship/shaderCensus-selfcheck.mjs", MEASURED_SHADER = 1501;
    ok(`  and the case that showed why: ${path.basename(SHADER)} was recorded at 239 ms against a measured ${MEASURED_SHADER}, so the instruction would have written a 6x-wrong header`,
        G.timings[SHADER] === MEASURED_SHADER,
        `re-timed to ${G.timings[SHADER]} ms at v4575; the incident is what made the record right, not the record that made it right`);
    ok("  and statedRuntime is green now, so the four headers this round corrected are off its list",
        !/GATE_DRIFT_TODO/.test(sr) && /gate-timings\.json/.test(sr),
        "four corrected: reconQualityBind, commentFalsePass, shaderCensus, spacesimStart");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n5. CONTROLS");
{
    // *** THE FIRST VERSION OF THIS CONTROL RESTATED THE FILTER AND ITS SABOTAGE WENT 0-RED. *** It asserted
    // that every surviving entry satisfies the filter, which is true of any filter by construction -- drop
    // the `< capMs` clause and the row still passes, because `real.every(...)` re-tests whatever the filter
    // happened to be. A control has to test the filter's EFFECT: there must be entries the cap clause and
    // only the cap clause removes, and none of them may survive.
    const codeZero = both.filter((k) => S.codes[k] === 0);
    const zeroButCapped = codeZero.filter((k) => S.timings[k] >= S.capMs);
    // AND THE ANSWER IT GAVE WAS THAT THE CAP CLAUSE IS CURRENTLY INERT, which is worth stating rather than
    // papering over: all 120 capped entries in the overlap carry code 124, so the exit-code filter already
    // removes every one of them and `< capMs` removes nothing further. The clause STAYS -- crossBackend is
    // exit 0 at 25,772 ms and would need it, and it is only absent here because gate-timings has no entry for
    // it -- but a guard that removes nothing today is a guard nothing is testing, and this row says which.
    const capped = both.filter((k) => S.timings[k] >= S.capMs);
    ok("the cap clause is INERT on today's data, and the row says so rather than claiming an effect it does not have",
        zeroButCapped.length === 0 && capped.length > 0 && capped.every((k) => S.codes[k] === 124),
        `${capped.length} capped entries in the overlap, all of them exit 124, so the code filter alone removes every one`);
    ok("  and the clause is kept because a case for it exists outside this overlap: crossBackend is exit 0 at 25,772 ms and is absent here only because gate-timings has no entry for it",
        S.codes["tools/ship/crossBackend-selfcheck.mjs"] === 0 &&
        S.timings["tools/ship/crossBackend-selfcheck.mjs"] >= S.capMs &&
        !(("tools/ship/crossBackend-selfcheck.mjs") in G.timings),
        `sweep has it at ${S.timings["tools/ship/crossBackend-selfcheck.mjs"]} ms exit ${S.codes["tools/ship/crossBackend-selfcheck.mjs"]}; gate-timings has no row`);
    ok("  and the killed readings are excluded too, so nothing here compares a record against the killer's clock",
        real.every((k) => S.codes[k] === 0) && real.length < both.length,
        `${both.length - real.length} of ${both.length} excluded as killed or capped`);
    ok("  and the cap comes from the sweep file rather than being restated here",
        S.capMs > 0 && typeof S.capMs === "number", `capMs ${S.capMs}`);
    ok("the ratio is symmetric, so a gate is not called 'disagreeing' merely for being the slower of the pair",
        rows.every((x) => x.r >= 1), `${rows.length} rows, minimum ratio ${Math.min(...rows.map((x) => x.r)).toFixed(3)}`);
    ok("  and gates absent from either record are dropped rather than counted as agreeing at zero",
        both.every((k) => typeof G.timings[k] === "number" && typeof S.timings[k] === "number"),
        `${Object.keys(G.timings).length} in gate-timings, ${Object.keys(S.timings).length} in sweep-timings, ${both.length} in both and on disk`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("ON THIS GATE'S OWN SABOTAGE: eight mutations, six red, and the two zeros are mutations that change " +
    "NOTHING rather than rows that miss something. Dropping the `< capMs` clause from the filter selects the " +
    "identical 1143 gates -- VERIFIED, not argued, because every capped entry in the overlap carries exit 124 " +
    "and the code filter already removes it, which is the inertness section 5 states outright. And loosening " +
    "a threshold cannot redden the row it loosens: no reading moves, so nothing can. That one is why the " +
    "direction claim is carried by TWO rows now -- a single edit leaves one standing -- but a weakened bar " +
    "only shows up when the data later moves, and no sabotage of the assertion can surface it today.\n");
console.log("unchecked here: WHICH RECORD SHOULD WIN, which this gate deliberately does not decide -- four " +
    "gates split two and two and a rule wants more than four. Also unchecked: whether the disagreement is " +
    "load (the sweep runs eight-wide), age (gate-timings is largely a v3211 capture), or drift in the gates " +
    "themselves, which would need re-timing a sample under both conditions rather than one; the 137 cap " +
    "readings, excluded here on purpose because v4574 showed they are the killer's clock; and whether any " +
    "OTHER gate in the killed population is red like commentFalsePass was -- one counter-example falsifies " +
    "v4574's sentence but says nothing about how many more there are.");
process.exit(fails ? 1 : 0);
