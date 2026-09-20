/**
 * A HUNDRED AND THIRTY-SEVEN GATES WHOSE RECORDED TIME IS A READING OF THE KILLER.
 *
 * v4572 observed 138 entries in sweep-timings.json at or over quickSweep's 20 s SIGKILL cap and did not
 * investigate. v4573 named it as the next rung. This is that round, and the first thing it found is that the
 * tree already knew half of it: sweepCoverage's `notVerdicts` says outright that a non-zero code beside a
 * killed process is not a failure, and v4460's `standingGreens` studied the OTHER class at length -- 314
 * over-budget entries carrying a stale code 0, of which running them one at a time found twenty-two red.
 *
 * *** THIS IS THE CLASS NOBODY RAN. *** 137 entries carry code 124: killed, in parallel AND in the serial
 * re-run that every phase-1 red gets, because quickSweep files `serialMs ?? parallelMs` and the serial
 * reading hit the same cap. So they have no verdict of any kind -- not a stale one, none -- and their
 * recorded millisecond is the cap plus a few: 20006, 20008, 20009, 20027. That number is a property of the
 * killer, not of the gate. Only TWO of the 137 are named anywhere in sweepCoverage.
 *
 * *** SO SEVENTEEN OF THEM WERE LET FINISH, AND ALL SEVENTEEN ARE GREEN. *** The sample is recorded below.
 * The striking figure is not the greens, it is that SEVEN OF THE SEVENTEEN FINISH INSIDE THE 20 s CAP THEY
 * WERE KILLED AT -- 13.5 s to 19.7 s -- so for those the recorded 20,0xx is not even a lower bound worth
 * having. The rest run 20 s to 549 s: a 41x spread, all filed under one indistinguishable number.
 *
 * *** THE CONSEQUENCE IS NOT THE ONE THIS ROUND WENT LOOKING FOR. *** The hypothesis was that
 * sweepCoverage.rotation() budgets a re-timing pass by summing timings[g] and would therefore cost a cap
 * reading at 20,0xx when the truth is up to 549,048. It does not: rotation and doorCandidates both draw from
 * `c.over`, and classify() puts a killed reading in `c.killed`, a different bucket. ZERO of the 24 gates the
 * rotation picks is a cap reading. The handling is already correct, and an earlier version of this gate
 * claimed otherwise because the scratch probe that produced it built its coverage object by hand and put
 * everything in `over`. The measurement was of a rotation that does not exist.
 *
 * *** WHAT IS ACTUALLY WRONG IS THE OTHER SIDE OF THAT SAME EXCLUSION. *** rotation is the mechanism by
 * which an over-budget gate gets re-observed, and the killed bucket is outside it. So the 137 are not
 * mis-costed -- they are unreachable: nothing schedules them, which is why 129 of them still carry the
 * pre-v4408 `unknown` stamp. Their verdict is absent by construction rather than by neglect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SC from "./sweepCoverage.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
const CAP = T.capMs, BUDGET = T.budgetMs;
// *** v4637 -- THE CAP IS PER ENTRY NOW, BECAUSE THE FILE HOLDS ROWS FROM RUNS WITH DIFFERENT CAPS. ***
// Every row below used to divide by `T.capMs`, one number for the whole file, and that was right only while
// every killed row came from the same 20 s sweep. v4637 restored the killed pass's 90 s readings that a merge
// had overwritten with 20 s caps, and "is this a hair above the cap" against ONE number reads 20,006..90,110
// and answers nothing. `capAt[g]` is the cap the run that took the row was running under, written where it is
// known; where the run cannot be named the file's own cap is the documented fallback and is COUNTED, not
// hidden, so a growing fallback is visible rather than silently widening every row that uses it.
const capOf = (g) => (T.capAt || {})[g] ?? CAP;
const capNamed = (g) => (T.capAt || {})[g] != null;
const onDisk = Object.keys(T.timings).filter((g) => fs.existsSync(path.join(ENG, g)));
const c = { over: [], killed: [], under: [] };
for (const g of onDisk) c[SC.classify(T.timings[g])].push(g);

// ---- v4647l SABOTAGES, RESULTS BY NAME ------------------------------------------------------------------
//
//   YA. a moved entry is excused with no confirming runs        -> 3 RED
//   YB. the confirming runs contradict the filed reading        -> 3 RED
//   YC. excusedBy accepts the name without checking the runs    -> 1 RED
//   YD. a disagreeing gate NOT in the roll passes anyway        -> 1 RED
//   YE. the report names no gate, only counts                   -> 1 RED
//   YF. the report lists `left` while counting `agreed`         -> 1 RED
//
// *** YC AND YD BOTH MEASURED ZERO FIRST, AND THEY ARE THE TWO THAT MATTER. *** The row checking the
// corroboration was calling the very function under test -- a check grading its own copy, which this tree
// already has on record at v4443 and v4445 -- and "not in the roll" was unreachable from live data, because
// today there is exactly ONE disagreeing gate and it IS in the roll. The rule is a pure `excusedBy` now,
// driven on hand-made input through every branch that refuses. A rule tested only against today's tree is
// tested against one sample of it.

console.log("capReading-selfcheck -- the number beside a killed gate is the cap, not the gate\n");

// -----------------------------------------------------------------------------------------------------------
console.log("1. *** THE POPULATION, AND WHY ITS RECORDED MILLISECOND IS NOT A MEASUREMENT ***");
// finished: T.finished -- v4641. Without it this population includes gates that RAN TO COMPLETION over
// the cap, whose recorded millisecond IS a measurement, and the row below (every reading a hair above the
// cap) is false of them by tens of seconds. See sweepCoverage.notVerdicts for the whole finding.
const NV = SC.notVerdicts(c, { codes: T.codes, finished: T.finished });
{
    report(`${c.under.length} under the ${BUDGET} ms budget, ${c.over.length} over it, ${c.killed.length} killed at the ${CAP} ms cap`);
    // *** v4637 -- `NV.length > 100` WAS A FLOOR UNDER A POPULATION, AND THE POPULATION SHRANK BECAUSE THE
    // DEFECT WAS REPAIRED. *** It was written when 137 entries carried a killer's clock. v4637 found that
    // quickSweep's writer assigned `timings[g]` unconditionally -- so a 20 s cap landed on top of a real
    // measurement and the two are one field afterwards -- put the overwritten readings back, and 63 of these
    // are measurements again. The floor went red for the repair, which is the register-of-grievances shape
    // redCensus names. What the row is ABOUT is a property of each member and holds at any size: a non-zero
    // code beside a killed process. The count is reported, and its history with it.
    ok(`*** ${NV.length} gates carry a KILLED reading with a non-zero code, so they have no verdict of any kind ***`,
        NV.length > 0 && NV.every((g) => T.codes[g] !== 0 && T.codes[g] !== undefined),
        `notVerdicts reports ${NV.length}, down from 137 at v4573: v4637 restored 63 of them to the measurement a ` +
        `cap had been written over. sweepCoverage has said since v4460 that a non-zero code beside a killed process is not a failure`);
    // The tell that the number is the killer's: every one of them sits a hair above the cap. A gate that
    // genuinely took 20.4 s and exited would be indistinguishable from one killed at 20.0 -- which is the
    // point -- but a population whose maximum is a few hundred ms above the cap cannot be a population of
    // runtimes. Real runtimes do not cluster in a 0.3% band.
    const ms = NV.map((g) => T.timings[g]).sort((a, b) => a - b);
    const spread = ms[ms.length - 1] - ms[0];
    report(`their recorded times run ${ms[0]} to ${ms[ms.length - 1]} ms -- a spread of ${spread} ms across ` +
        `${new Set(NV.map(capOf)).size} different caps, which is why the row below divides per entry and not by ${CAP}`);
    // *** THE EXCESS OVER THE CAP IS THE QUANTITY, AND IT WAS BEING COMPUTED AGAINST THE WRONG CAP. *** Read
    // against the file's single 20,000 the population now spans 20,006..90,110 and looks like runtimes; read
    // against the cap EACH ROW WAS TAKEN UNDER it spans 6..110 ms, which is a killer's clock and nothing else.
    const excess = NV.map((g) => T.timings[g] - capOf(g)).sort((a, b) => a - b);
    const fellBack = NV.filter((g) => !capNamed(g)).length;
    ok("*** and every one of them sits within half a second ABOVE THE CAP OF THE RUN THAT TOOK IT, which is what a killer's clock looks like and not what a population of runtimes looks like ***",
        excess.length > 0 && excess.every((v) => v >= 0 && v < 500),
        `${excess[0]}..${excess[excess.length - 1]} ms over their own caps (${[...new Set(NV.map(capOf))].sort((a, b) => a - b).join(", ")}); ` +
        `${NV.length - fellBack} read a recorded cap and ${fellBack} fall back to the file's ${CAP}`);
    // v4460's class is the other one, and keeping them apart is the reason this gate exists beside that work
    // rather than on top of it.
    const SG = SC.standingGreens(c, { codes: T.codes });
    ok(`  and this is NOT v4460's population: that one is ${SG.length} over-budget entries carrying a stale code 0, where twenty-two were found red. These ${NV.length} carry 124 and were never observed at all`,
        SG.length > 0 && !SG.some((g) => NV.includes(g)),
        `standingGreens ${SG.length}, notVerdicts ${NV.length}, overlap ${SG.filter((g) => NV.includes(g)).length}`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n2. *** SEVENTEEN LET FINISH: ALL GREEN, AND SEVEN FIT INSIDE THE CAP THEY WERE KILLED AT ***");
/**
 * MEASURED at v4573, each in its own process with a wall clock around it, nothing else running. Frozen by
 * name rather than re-run: seventeen gates averaging 70 s is twenty minutes, which no gate can spend.
 */
export const LET_FINISH_V4573 = Object.freeze({
    at: "v4573", capMs: 20000,
    runs: Object.freeze([
        Object.freeze({ gate: "tools/ship/detectionFloor-selfcheck.mjs",      ms: 13473,  rc: 0 }),
        Object.freeze({ gate: "text/slug-selfcheck.mjs",                      ms: 14829,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/paintFields-selfcheck.mjs",         ms: 14496,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/loopTrace-selfcheck.mjs",           ms: 15880,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/eulerGpu-selfcheck.mjs",            ms: 18450,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/sharpPanel-selfcheck.mjs",          ms: 19721,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/carveGpu-selfcheck.mjs",            ms: 19984,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/paintTransfer-selfcheck.mjs",       ms: 20953,  rc: 0 }),
        Object.freeze({ gate: "physics/render/transmission-selfcheck.mjs",    ms: 21060,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/baselineHygiene-selfcheck.mjs",     ms: 30812,  rc: 0 }),
        Object.freeze({ gate: "tools/roundhouse/kuramoto-selfcheck.mjs",      ms: 31417,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/floors-selfcheck.mjs",              ms: 36886,  rc: 0 }),
        Object.freeze({ gate: "physics/sph/tiltPower-selfcheck.mjs",          ms: 61615,  rc: 0 }),
        Object.freeze({ gate: "tools/ship/gateSelection-selfcheck.mjs",       ms: 67823,  rc: 0 }),
        Object.freeze({ gate: "simulation/lbm/settleCurve-selfcheck.mjs",     ms: 87507,  rc: 0 }),
        Object.freeze({ gate: "tools/roundhouse/hydrostatic-selfcheck.mjs",   ms: 123439, rc: 0 }),
        Object.freeze({ gate: "tools/roundhouse/plantDirection-selfcheck.mjs", ms: 549048, rc: 0 }),
    ]),
});
{
    const R = LET_FINISH_V4573.runs, msAll = R.map((r) => r.ms);
    const under = R.filter((r) => r.ms < CAP), green = R.filter((r) => r.rc === 0);
    report(`the seventeen, in order: ${msAll.map((m) => (m / 1000).toFixed(1)).join(", ")} s`);
    // *** THE SENTENCE THIS ROW ORIGINALLY CARRIED WAS FALSIFIED ONE ROUND LATER. *** It read "not one of
    // the gates the sweep has only ever killed is red", which is true of the seventeen and was never true of
    // the population: v4575 found commentFalsePass-selfcheck red at 9.6 s while recorded at 20,025 ms with
    // exit 124 -- the same class, reached by a different route. Seventeen greens are seventeen greens; the
    // generalisation was mine and it was wrong, so the row now says what it measured.
    ok(`*** all ${R.length} SAMPLED gates are green when allowed to finish -- and the population is NOT: v4575 found commentFalsePass red in it, at 9.6 s against a recorded 20,025 ***`,
        green.length === R.length, `${green.length}/${R.length} of the sample exit 0; the sample is not the population`);
    // *** THE FIRST VERSION OF THIS ROW SAID `>= 6` AND ITS SABOTAGE WENT 0-RED. *** Moving one table entry
    // from 13,473 to 33,473 takes the count from seven to six, which `>= 6` still accepts -- a threshold set
    // one below the value it guards absorbs exactly one defect, and this table is FROZEN, so the count is
    // not an estimate that needs slack. UNDER_CAP is the number the seventeen runs produced; the row derives
    // it again from the table and the file's own cap and requires the two to agree.
    const UNDER_CAP = 7;
    ok(`*** and ${under.length} of ${R.length} finish INSIDE the ${CAP} ms cap they were killed at, the fastest in ${Math.min(...msAll)} ms ***`,
        under.length === UNDER_CAP && Math.min(...msAll) < CAP * 0.75,
        under.length === UNDER_CAP
            ? under.map((r) => `${path.basename(r.gate)} ${r.ms}`).join(", ")
            : `DERIVED ${under.length} against a recorded ${UNDER_CAP} -- the table and the cap no longer agree`);
    ok(`  and the true runtimes span ${(Math.max(...msAll) / Math.min(...msAll)).toFixed(0)}x, all of it filed under one indistinguishable number a few ms above the cap`,
        Math.max(...msAll) / Math.min(...msAll) > 20,
        `${Math.min(...msAll)} ms to ${Math.max(...msAll)} ms, every one recorded as ~${CAP}`);
    // The sample must be OF the population, or it says nothing about it. Every gate above must still be on
    // disk and still carry a killed, no-verdict reading -- if one has been re-timed since, this row says so
    // rather than leaving the table quietly describing a tree that has moved.
    // *** v4637 -- A GATE LEAVING THIS POPULATION IS THE TABLE'S PREDICTION COMING TRUE, NOT THE TABLE GOING
    // STALE, AND THE OLD ROW COULD NOT TELL THE TWO APART. ***
    //
    // It required all seventeen to still be killed-with-no-verdict. The main merge's sweep let two of them
    // finish -- paintFields and eulerGpu -- so the row reddened on the one outcome this table exists to argue
    // for: that these gates are green and fast when nothing kills them.
    //
    // *** AND THE NUMBERS ARE THE POINT. *** The table said 14496 and 18450 ms. The fresh readings are 14074
    // and 17904 -- 2.9% and 3.0% apart, on a different sweep, months later. So the departure VINDICATES the
    // measurement, and the row now says so: every entry is either still in the population, or has a fresh
    // reading that AGREES with what the table recorded. That is a stronger claim than membership, because it
    // re-checks the frozen number every time a gate escapes the cap instead of freezing it forever.
    //
    // 10% is the tolerance, and it is loose ON PURPOSE: these are whole-process runtimes on a contended box,
    // where 3% is what two honest readings of the same gate look like and a table that had drifted would be
    // out by the 41x this sample spans, not by a tenth.
    //
    // *** v4647l -- THAT 3% CAME FROM A SAMPLE OF TWO, AND THE FIRST GATE TO DISAGREE DISAGREED BY SIX TIMES
    // IT. *** The sentence above was written at v4637 from the only two gates that had left the population,
    // both agreeing to 2.9% and 3.0%. One of those two, eulerGpu, now reads 19.8% from the table -- and it
    // is the SAME gate whose agreement produced the number.
    //
    // MEASURED RATHER THAN ARGUED, three runs in one minute on an idle box:
    //
    //     15,003 / 15,136 / 16,459 ms   median 15,136, within-minute spread 9.7%
    //     table 18,450 -> 18.0% from that median; the filed 14,806 -> 2.2% from it
    //
    // So TWO things are true at once and the old row could express neither. The gate really did move -- it
    // was 17,904 at v4637 and it is ~15,100 now, confirmed three times -- AND a 10% bound sits inside this
    // gate's own within-minute spread, so a single pair of readings cannot tell drift from noise at all.
    //
    // *** A DEPARTURE THAT DISAGREES IS NOW A ROLL, NOT A RED. *** The same shape sweepCoverage uses for
    // straddlers and quickSweep uses for crossings: one reading is a hypothesis, and it takes more than one
    // to move a record. A gate whose fresh reading disagrees passes only when it is NAMED here with the runs
    // that confirm it; anything else is still red. The table's historical number is KEPT -- it was true when
    // it was taken, and deleting it would destroy the evidence this whole file exists to hold.
    const MOVED_AT_V4647L = Object.freeze([
        Object.freeze({ gate: "tools/ship/eulerGpu-selfcheck.mjs", table: 18450, now: 14806,
            runs: Object.freeze([15003, 15136, 16459]),
            why: "18,450 at the cap pass, 17,904 at v4637 (3.0% -- the reading that set this row's tolerance), " +
                 "and ~15,100 now across three runs in one minute. The 14,806 filed in sweep-timings came from " +
                 "a serial re-run this session after a `--gates` typo recorded it AT the 20,000 ms cap; it is " +
                 "2.2% from the median of the three, so the filed number is sound and the TABLE is the stale " +
                 "one. Kept rather than re-taken: 18,450 is what the gate cost when the cap was hiding it.",
        }),
    ]);
    // A roll entry earns its exemption only if its own runs corroborate the FILED reading -- otherwise
    // "named in the record" would be a way to excuse any number at all, which is the exemption-list shape
    // sweepCoverage spent three rounds getting out of.
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    // *** PURE, AND DRIVEN ON FIXTURES BELOW, BECAUSE THE FIRST DRAFT'S ROWS COULD NOT SEE IT BREAK. ***
    // Sabotage YC made this return `true` unconditionally and sabotage YD dropped the roll from the
    // partition, and BOTH went zero red: the row that checks the corroboration was calling this very
    // function (a check grading its own copy -- v4443 and v4445 in this tree), and the live data has exactly
    // one disagreeing gate which IS in the roll, so "not in the roll" was never exercised by anything.
    const excusedBy = (roll, gate, now, bound = 0.10) => {
        const e = roll.find((m) => m.gate === gate);
        if (!e || !Array.isArray(e.runs) || e.runs.length < 3 || typeof now !== "number") return false;
        return Math.abs(median(e.runs) - now) / now <= bound;
    };
    const movedOk = (r) => excusedBy(MOVED_AT_V4647L, r.gate, (T.timings || {})[r.gate]);
    const stillNV = R.filter((r) => NV.includes(r.gate));
    const left = R.filter((r) => !NV.includes(r.gate));
    const agreed = left.filter((r) => {
        const now = (T.timings || {})[r.gate];
        return typeof now === "number" && Math.abs(now - r.ms) / r.ms <= 0.10;
    });
    // *** THE COUNT AND THE LIST WERE DIFFERENT POPULATIONS, AND THE ONE THAT MATTERED WAS UNNAMED. ***
    // The old detail printed `agreed.length` and then listed `left` -- "7 LET FINISH SINCE and agreeing"
    // followed by EIGHT names -- and never said which one disagreed. Same species as the sweep that counted
    // 143 starved gates and named none. The disagreeing gates are named first now, with their percentages.
    const off = (r) => Math.abs(((T.timings || {})[r.gate] || 0) - r.ms) / r.ms;
    const disagreed = left.filter((r) => !agreed.includes(r));
    const moved = disagreed.filter(movedOk);
    const loose = disagreed.filter((r) => !movedOk(r));
    const show = (r) => `${path.basename(r.gate)} table ${r.ms} now ${(T.timings || {})[r.gate]} (${(off(r) * 100).toFixed(1)}%)`;
    // The detail is a VALUE so a row can grade it. The defect that started this round was in the detail --
    // it printed `agreed.length` and then listed `left`, "7 LET FINISH SINCE and agreeing" over EIGHT names,
    // and never said which one disagreed. A sentence nothing reads is a sentence nothing keeps honest.
    const detail = stillNV.length === R.length ? `all ${R.length} still killed-with-no-verdict` :
            `${stillNV.length} still killed-with-no-verdict; ${agreed.length} let finish since and AGREEING; ` +
            `${moved.length} let finish since and MOVED, named in MOVED_AT_V4647L with confirming runs` +
            (moved.length ? ` -- ${moved.map(show).join(", ")}` : "") +
            (loose.length ? `; ${loose.length} DISAGREEING AND UNNAMED -- ${loose.map(show).join(", ")}` : "") +
            `. Agreeing to within ${agreed.length ? (Math.max(...agreed.map(off)) * 100).toFixed(1) : "0"}%; ` +
            `a departure beyond ${10}% is a hypothesis until a round runs it again and records the readings.`;
    ok(`  and every one of the ${R.length} is still in the population it was drawn from, or its fresh reading agrees with the table`,
        stillNV.length + agreed.length + moved.length === R.length, detail);
    ok("!! ...and the sentence NAMES every gate that disagreed, which is the defect that opened this round",
        disagreed.every((r) => detail.includes(path.basename(r.gate))) &&
        (!disagreed.length || /MOVED|DISAGREEING/.test(detail)),
        `${disagreed.length} disagreeing, ${disagreed.filter((r) => detail.includes(path.basename(r.gate))).length} ` +
        "named. The old sentence counted one population and listed another, so the one gate that mattered " +
        "was the one it did not mention -- the same shape as the sweep that counted 143 starved gates and " +
        "named none.");
    // Computed HERE rather than through movedOk: a row that asks the function under test whether the
    // function under test is right cannot fail when the function is wrong.
    ok("!! ...and a MOVED entry is only excused by runs that corroborate the FILED reading",
        MOVED_AT_V4647L.every((e) => e.runs.length >= 3) &&
        MOVED_AT_V4647L.every((e) => {
            const now = (T.timings || {})[e.gate];
            return typeof now === "number" && Math.abs(median(e.runs) - now) / now <= 0.10;
        }),
        MOVED_AT_V4647L.map((e) => `${path.basename(e.gate)} ${e.runs.join("/")} -> median ` +
            `${median(e.runs)} against ${(T.timings || {})[e.gate]} filed`).join("; ") +
            ". Naming a gate must not be a way to excuse any number at all -- that is the exemption list " +
            "sweepCoverage spent three rounds getting out of.");
    // *** THE RULE, DRIVEN ON HAND-MADE INPUT. *** The live data has ONE disagreeing gate and it is in the
    // roll, so every branch that refuses is unreachable from the tree as it stands. A rule tested only
    // against today's tree is tested against one sample of it.
    const FX = [Object.freeze({ gate: "fx", table: 1000, now: 800, runs: Object.freeze([790, 800, 810]) })];
    ok("!! *** in the roll AND corroborated by three runs -> excused; and every other branch refuses ***",
        excusedBy(FX, "fx", 800) === true &&
        excusedBy(FX, "notInRoll", 800) === false &&
        excusedBy([{ gate: "fx", runs: [790] }], "fx", 800) === false &&
        excusedBy([{ gate: "fx", runs: [1600, 1610, 1620] }], "fx", 800) === false &&
        excusedBy(FX, "fx", undefined) === false,
        "named-and-corroborated passes; NOT NAMED refuses; fewer than three runs refuses; runs that " +
        "contradict the filed reading refuse; no filed reading at all refuses. Sabotage YD replaced `moved` " +
        "with `disagreed` in the partition and nothing went red, because today the two sets are equal");

    ok("!! ...and the 10% bound is at this population's NOISE FLOOR, which is why one reading cannot move a record",
        MOVED_AT_V4647L.every((e) => (Math.max(...e.runs) - Math.min(...e.runs)) / Math.min(...e.runs) > 0.05),
        MOVED_AT_V4647L.map((e) => `${path.basename(e.gate)} spread ` +
            `${(((Math.max(...e.runs) - Math.min(...e.runs)) / Math.min(...e.runs)) * 100).toFixed(1)}% in one minute`).join("; ") +
            ". The 3% this row's tolerance was argued from was a sample of TWO agreeing readings, and one of " +
            "those two is the entry above.");
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n3. THE CONSEQUENCE IS NOT MIS-COSTING -- IT IS THAT NOTHING EVER SCHEDULES THEM");
{
    // *** THE HYPOTHESIS WAS THAT A CAP READING GETS SPENT AS IF IT WERE A COST, AND IT IS WRONG. ***
    // rotation() sums timings[g] to plan a re-timing budget, so a 20,0xx lower bound standing in for 549,048
    // would wreck the plan. It cannot: rotation draws from `c.over`, and classify() files a killed reading
    // under `c.killed`. Checked rather than reasoned, because the first version of this section asserted the
    // opposite from a scratch probe that had built its own coverage object with everything in `over`.
    const rot = SC.rotation(c, { at: T.at || {}, timings: T.timings }, { slots: 24, budgetMs: 120000 });
    const capsPicked = rot.picked.filter((g) => T.timings[g] >= CAP);
    report(`rotation picks ${rot.picked.length} gates for a 120 s budget at a planned ${rot.cost} ms, ` +
        `recorded ${Math.min(...rot.picked.map((g) => T.timings[g]))}..${Math.max(...rot.picked.map((g) => T.timings[g]))} ms`);
    ok("*** no consumer spends a cap reading as a duration: rotation picks NONE of them, because classify() already separates killed from over ***",
        capsPicked.length === 0, `${capsPicked.length} of ${rot.picked.length} picked gates are cap readings`);
    ok("  and doorCandidates is clear for the same reason and its own window as well",
        SC.doorCandidates(c, { timings: T.timings }, { lo: BUDGET, hi: 6000 }).every((g) => T.timings[g] < CAP),
        `${SC.doorCandidates(c, { timings: T.timings }, { lo: BUDGET, hi: 6000 }).length} candidates, all under the cap`);
    // *** SO THE DEFECT IS THE EXCLUSION ITSELF. *** rotation is HOW an over-budget gate gets re-observed.
    // The killed bucket is outside it, so nothing ever schedules these 137 -- their absent verdict is a
    // property of the machinery, not an oversight anybody can close by re-running a sweep.
    ok("*** but rotation is the mechanism that re-observes an over-budget gate, and the killed bucket is outside it -- so these gates are not mis-costed, they are UNREACHABLE ***",
        NV.every((g) => !rot.picked.includes(g)) && c.over.every((g) => T.timings[g] < CAP),
        `${NV.length} killed gates, none reachable by the rotation that exists to re-time the slow ones`);
    // *** v4637 -- THE STAMP EVIDENCE WAS A MAJORITY TEST, AND A PASS THAT IS NOT THE ROTATION DATED HALF
    // OF THEM. *** `undated > NV.length / 2` said 129 of 137 in v4573's file. The restore put back the killed
    // pass's own readings, so 36 of the 68 now carry KILLED_PASS_V4568's stamp -- dated, but dated by a
    // hand-run serial pass, which is the opposite of the claim: the pass is what somebody had to do BECAUSE
    // the rotation cannot reach them. A majority of undated entries was only ever a proxy for that.
    //
    // The fact itself is checkable and is checked: not one of these gates was observed by the capture that
    // wrote this file. `captured` is the sweep that just ran; an entry it ran carries that stamp in `at`.
    const undated = NV.filter((g) => (T.at || {})[g] === SC.UNKNOWN_AT);
    const swept = NV.filter((g) => (T.at || {})[g] === T.captured);
    ok(`  and it shows: NOT ONE of the ${NV.length} was observed by the sweep that wrote this file`,
        NV.length > 0 && swept.length === 0,
        `${swept.length} of ${NV.length} carry the capture stamp ${T.captured}. ${undated.length} have never been ` +
        `dated at all and ${NV.filter((g) => (T.at || {})[g] === SC.KILLED_PASS_V4568.stamp).length} carry the ` +
        `killed pass's, which is a hand-run serial pass and not the rotation -- it is what the bucket being unreachable looks like`);
}

// -----------------------------------------------------------------------------------------------------------
console.log("\n4. CONTROLS");
{
    ok("the population is read from the live timings file and sweepCoverage's own classifier, not restated here",
        typeof SC.classify === "function" && typeof SC.notVerdicts === "function" && c.killed.length > 0,
        `classify() put ${c.killed.length} gates in the killed bucket`);
    ok("  and the cap and budget come from the file too, so moving either moves this gate with the tree",
        CAP === T.capMs && BUDGET === T.budgetMs && CAP > BUDGET, `budget ${BUDGET}, cap ${CAP}`);
    ok("every gate named in the frozen table exists on disk, so the sample cannot quietly describe deleted files",
        LET_FINISH_V4573.runs.every((r) => fs.existsSync(path.join(ENG, r.gate))),
        `${LET_FINISH_V4573.runs.length} paths checked`);
    ok("  and the table's cap is the file's cap -- a table measured against a different cap would not describe this population",
        LET_FINISH_V4573.capMs === CAP, `table ${LET_FINISH_V4573.capMs}, file ${CAP}`);
    // A control that can fail: the three classes must partition the gates on disk, or the counts above are
    // drawn from overlapping sets and none of them means what it says.
    ok("the three buckets partition the gates on disk, so 'under', 'over' and 'killed' are counts of disjoint things",
        c.under.length + c.over.length + c.killed.length === onDisk.length &&
        new Set([...c.under, ...c.over, ...c.killed]).size === onDisk.length,
        `${c.under.length} + ${c.over.length} + ${c.killed.length} = ${onDisk.length}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("AND AN EIGHTEENTH THAT DID NOT FINISH: tools/ship/redCensus-selfcheck.mjs, recorded at 20,021 ms " +
    "with code 124 and the pre-v4408 stamp like the rest WHEN THIS WAS WRITTEN -- v4637 restored it to the " +
    "killed pass's 45,245 ms at code 0, a measurement, which is what the file reads now -- exceeded a 400-SECOND harness timeout during this " +
    "round's own verify sweep without completing. It is not in the table above, because the table is of runs " +
    "that ENDED and a timeout is a lower bound rather than a measurement -- but it puts the population's " +
    "upper end past 400 s, beyond the 549 s this sample's slowest measured gate reached, and its own header " +
    "describes it as taking two minutes.\n");
console.log("unchecked here: THE OTHER 120. Seventeen of 137 were let finish and the table is frozen by name " +
    "because re-running it costs twenty minutes -- so this gate reports a SAMPLE and says so, and the " +
    "population it generalises to has not been observed. Also unchecked: WHY they are slow, which is a " +
    "different question from how long they take; whether any is slow for a reason that is itself a defect; " +
    "and the 181-second stall v4572 observed in headlessGpu-selfcheck, which this round tried three " +
    "hypotheses on -- the deliberately-crashing spawned child, plain concurrency at 2/4/8 copies, and a " +
    "dirty working tree -- and REFUTED all three, failing to reproduce it in roughly twenty-five runs. It " +
    "is real, it was seen twice at ~181 s, and it is not explained here.");
process.exit(fails ? 1 : 0);
