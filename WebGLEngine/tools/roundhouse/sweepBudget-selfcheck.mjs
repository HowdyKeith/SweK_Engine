#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/sweepBudget-selfcheck.mjs -- v4336
//
// GRADES costRecord.mjs's sweep half and the budgets that now read it -- backlog #40.
//
// *** THE ITEM'S OWN NUMBER WAS THE FIRST THING TO CHECK AND IT DOES NOT SURVIVE. *** #40 reads
// "corroborationCensus: twof is 73% of the whole sweep". Measured against the frozen record, twof is 58.8% of
// the census BUILD sweep (458.9 s of 780.4 s over 484 device/modes) and 23.5% of the LADDER sweep (4053 s of
// 17,251 s over 116 devices). Neither is 73%. Two different sweeps with two different answers, and an item
// that names one number for both. Section 7 pins both, derived.
//
// *** AND THE REAL FINDING IS NOT twof'S SHARE, IT IS THAT NOBODY READS THE RECORD THAT MEASURES IT. ***
// 4.79 hours of measurement bought 116 sweep costs with no bounds left -- and:
//
//     sweepCostFor()     exported and documented since v4051, ZERO call sites in the tree
//     writeSweepCosts()  exported, ZERO call sites -- no path in the tree to refresh what was paid for
//     host scaling       the BUILD half got scaledCostFor at v4173 ("a frozen cost and a live deadline are
//                        different clocks"); the sweep half never got the conversion
//
// while the gate that runs the sweeps carried NINE HAND-TYPED ROUND NUMBERS, inconsistent against the record
// by three orders of magnitude: compose 730x over, galaxy 323x, blackhole 6.8x -- and quantum at 1.2x, which
// is 19% headroom on the slowest of them. The waste is not the problem. The problem is that a 730x budget
// cannot notice a device that became a hundred times slower, so the cut that would say so never happens.
//
// *** SIX OF THE NINE NOW READ THE RECORD, AND THE SEVENTH IS THE ROUND'S OWN CORRECTION. *** The first pass
// derived seven, including section 3f's, whose device list is computed from a lab-wide scan. That one came to
// 8187 s -- the group can contain twof at 4053 s and knobLiveness spends its budget PER DEVICE -- and the run
// was killed at forty minutes against a gate whose measured cost is 424 s. The record was not wrong; the call
// site was asking a different question. Its 200 000 ms is a CAP on a broad probe, not a prediction of what an
// exhaustive sweep costs, and reading one as the other is the same confusion this round removed from the
// other six. Section 2 pins that exception by name so it cannot spread, and widenStill and jointlyLive stay
// typed for the same reason: nobody has measured them.
//
// Run: node tools/roundhouse/sweepBudget-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCostRecord, sweepCostFor, sweepBudgetFor, sweepBudgetOr, costFor,
         RECORD_STALENESS } from "./costRecord.mjs";
import { knobLiveness } from "./knobLiveness.mjs";
import { hostScale } from "../ship/hostScale.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log("  ----  " + s);

const REC = readCostRecord();
const KL = "tools/roundhouse/knobLiveness-selfcheck.mjs";
const klSrc = fs.readFileSync(path.join(ENG, KL), "utf8");
const klCode = codeOnly(klSrc);

console.log("sweepBudget-selfcheck -- 4.79 hours of measurement, and what now reads it\n");

// =============================================================================================================
console.log("1. *** THE RECORD IS COMPLETE, AND THAT IS WHY A CEILING IS NO LONGER THE ANSWER ***");
{
    const sweeps = Object.keys(REC.sweepCosts || {});
    const bounds = Object.keys(REC.sweepAtLeast || {});
    ok("*** every device with a sweep cost has a MEASUREMENT, not a bound ***",
        sweeps.length > 100 && bounds.length === 0,
        `${sweeps.length} measured, ${bounds.length} still bounded. COST_RECORD.md: "a cut bound is the ` +
        `budget, not an estimate" -- ten devices carried one and all ten were paid for`);
    const total = sweeps.reduce((n, d) => n + REC.sweepCosts[d], 0);
    ok("  and the total is the 4.79 hours the record says it cost",
        Math.abs(total / 3600000 - 4.79) < 0.05, `${(total / 3600000).toFixed(2)} h across ${sweeps.length} devices`);
    ok("  the staleness applied to every budget is the one that was MEASURED, and it is one device's",
        Math.abs(RECORD_STALENESS - 712.7 / 458.9) < 1e-12 && RECORD_STALENESS > 1.5,
        `${RECORD_STALENESS.toFixed(4)} -- twof re-measured at 712.7 s against 458.9 s stored, v4173. ` +
        `Applying it lab-wide is an ASSUMPTION; the other 115 have never been re-timed`);
}

// =============================================================================================================
console.log("\n2. *** THE SWEEP BUDGETS READ THE RECORD, AND THE EXCEPTIONS ARE PINNED BY NAME ***");
{
    // A typed budget on a knobLiveness() call is the defect this round removed. The ratchet is that a new one
    // cannot appear quietly: the count is measured off the source, not remembered.
    const typedOnSweep = [...klCode.matchAll(/knobLiveness\(\{[^}]*budgetMs:\s*(\d+)/g)].map((m) => m[1]);
    // *** ONE TYPED BUDGET SURVIVES, AND IT IS THE ONE THE RECORD CANNOT ANSWER. *** Every other call names a
    // fixed handful of devices and wants them to FINISH -- the quantity costRecord measures. Section 3f's
    // list is computed from a lab-wide scan and its 200 000 ms is a deliberate CAP on a broad probe. Derived,
    // it came to 8187 s, because the group can contain twof and knobLiveness spends per device; the run was
    // killed at forty minutes against a gate that costs 424 s. The record is not wrong -- it answers a
    // different question, exactly as it does for widenStill and jointlyLive.
    ok("*** exactly one knobLiveness budget stays typed, and it is the lab-wide cap ***",
        typedOnSweep.length === 1 && typedOnSweep[0] === "200000",
        typedOnSweep.length === 1 ? `${typedOnSweep[0]} ms, on the dynamically-computed device list`
                                  : "still typed: " + typedOnSweep.join(", "));
    ok("  and it says in the file WHY it is not derived, so the exception cannot become a habit",
        /answers a different question|deliberate CAP/.test(klSrc) && /8187 s|forty-minute/.test(klSrc),
        "the reason is in the source beside the number, with what deriving it actually cost");
    const derived = (klCode.match(/sweepBudget(For|Or)\(/g) || []).length;
    ok("  and the other six really read the record rather than the calls having been deleted",
        derived === 6, `${derived} sweepBudgetFor/Or call sites in ${KL}`);
    // THE HONEST REMAINDER, PINNED. widenStill and jointlyLive are SECOND passes over rows the sweep produced,
    // and no measurement of them exists. Budgeting them from the sweep's cost would be reading one number as
    // the answer to a different question -- which is the shape being repaired, not a licence to repeat it.
    const otherTyped = [...klCode.matchAll(/(widenStill|jointlyLive)\([^)]*budgetMs:\s*(\d+)/g)]
                        .map((m) => `${m[1]} ${m[2]} ms`);
    ok("*** and the three budgets that stay typed are the two passes nobody has measured ***",
        otherTyped.length === 3 && otherTyped.every((t) => /widenStill|jointlyLive/.test(t)),
        otherTyped.join(", ") + " -- freeze a cost for these and they can be derived too");
}

// =============================================================================================================
console.log("\n3. THE DERIVED BUDGETS ACTUALLY COVER THE WORK -- RUN, NOT ASSUMED");
{
    for (const set of [["galaxy"], ["compose"], ["fragmentRotation", "entropy", "nbench", "strokeMorph"]]) {
        const b = sweepBudgetFor(set);
        const t0 = Date.now();
        const { rows, notes } = await knobLiveness({ only: set, budgetMs: b.ms });
        const took = Date.now() - t0;
        const cut = rows.filter((r) => r.incompleteKnobs || r.state === "budget-cut").length;
        ok(`  ${set.join("+")} finishes inside its derived budget`,
            cut === 0 && notes.length === 0 && took < b.ms,
            `${(took / 1000).toFixed(1)} s of ${(b.ms / 1000).toFixed(1)} s, ${rows.length} rows, ${cut} cut`);
    }
    report("the recorded sweep cost is the EXHAUSTIVE one and these calls are not, so the record over-serves " +
           "them -- conservative in the safe direction, and worth saying rather than discovering later");
}

// =============================================================================================================
console.log("\n4. *** IT FAILS CLOSED ON A DEVICE THE RECORD HAS NEVER PRICED ***");
{
    const miss = sweepBudgetFor("nosuchdevice");
    ok("*** an unpriced device returns no budget and names itself ***",
        miss.ms === null && miss.unmeasured.includes("nosuchdevice"),
        `"${miss.why}" -- a silent fallback is exactly what the typed budgets already were`);
    const floored = sweepBudgetOr("nosuchdevice", 200000);
    ok("  and a caller that must have a number writes the floor down itself",
        floored.ms === 200000 && floored.floored === true && /floor/.test(floored.why),
        `sweepBudgetOr -> ${floored.ms} ms, floored: ${floored.floored}`);
    const mixed = sweepBudgetFor(["compose", "nosuchdevice"]);
    ok("  a mixed list still budgets what it knows and still reports what it does not",
        mixed.ms !== null && mixed.unmeasured.length === 1 && mixed.measured.length === 1,
        `${mixed.ms} ms from ${mixed.measured.length} priced, ${mixed.unmeasured.length} unpriced`);
    // THE LARGEST, NOT THE SUM: knobLiveness's stopwatch is per device (v4044), so a sum would hand the
    // dearest device the whole group's allowance and the guard would stop guarding.
    const grp = sweepBudgetFor(["compose", "blackhole"]);
    ok("*** a group is budgeted by its DEAREST member, not by the sum ***",
        grp.worst.device === "blackhole" &&
        grp.ms === Math.round(sweepCostFor("blackhole", REC) * grp.scale * grp.headroom),
        `${grp.worst.device} at ${(grp.worst.ms / 1000).toFixed(1)} s decides it, not ` +
        `${((sweepCostFor("compose", REC) + sweepCostFor("blackhole", REC)) / 1000).toFixed(1)} s summed`);
}

// =============================================================================================================
console.log("\n5. THE CLOCK IS THE TREE'S OWN, NOT A SECOND ESTIMATE OF IT");
{
    const h = hostScale();
    const b = sweepBudgetFor("blackhole");
    ok("*** the host conversion is hostScale(), the same one scaledCostFor uses ***",
        b.scale === (Number.isFinite(h.scale) && h.scale > 0 ? h.scale : 1),
        `scale ${b.scale} -- v4173: "A SECOND ESTIMATE OF HOST SPEED WOULD HAVE BEEN THE WRONG FIX"`);
    const twice = sweepBudgetFor("blackhole", { scale: 2 });
    ok("  and it really multiplies -- a box twice as slow gets twice the budget",
        twice.ms === Math.round(sweepCostFor("blackhole", REC) * 2 * twice.headroom),
        `${(b.ms / 1000).toFixed(1)} s at scale ${b.scale}, ${(twice.ms / 1000).toFixed(1)} s at scale 2`);
    ok("  a missing or absurd scale falls back to 1 rather than to zero budget",
        sweepBudgetFor("blackhole", { scale: 0 }).ms > 0 && sweepBudgetFor("blackhole", { scale: NaN }).ms > 0,
        "a budget of zero would report every device as cut, which is worse than an unscaled one");
}

// =============================================================================================================
console.log("\n6. *** WHAT A DERIVED BUDGET BUYS: IT CAN NOTICE. A TYPED ONE CANNOT. ***");
{
    // The detection threshold is the factor by which a device must slow before its budget trips. For a derived
    // budget that IS the headroom. For the round numbers this round replaced it was the over-provisioning.
    const TYPED = { galaxy: 120000, compose: 200000, blackhole: 200000, quantum: 120000, nbench: 200000 };
    const rows = Object.entries(TYPED).map(([d, typed]) => {
        const m = sweepCostFor(d, REC);
        return { d, m, typed, typedFactor: typed / m, derivedFactor: sweepBudgetFor(d).ms / m };
    });
    for (const r of rows) {
        report(`${r.d.padEnd(10)} measured ${(r.m / 1000).toFixed(1).padStart(6)} s   typed budget tripped at ` +
               `${r.typedFactor.toFixed(1).padStart(6)}x slower   derived trips at ${r.derivedFactor.toFixed(2)}x`);
    }
    const worst = rows.reduce((a, b) => (a.typedFactor >= b.typedFactor ? a : b));
    ok("*** the typed budgets' detection thresholds spanned three orders of magnitude ***",
        worst.typedFactor / Math.min(...rows.map((r) => r.typedFactor)) > 100,
        `${worst.d} would not have tripped until ${worst.typedFactor.toFixed(0)}x slower; quantum at ` +
        `${rows.find((r) => r.d === "quantum").typedFactor.toFixed(2)}x. One hand set both`);
    // ROUNDING, NOT DISAGREEMENT: the budget is Math.round'ed to whole milliseconds, so a device measured at
    // 274 ms and one at 100,481 ms land a few parts per million apart. The claim is that they trip at ONE
    // factor, and the tolerance is the rounding rather than a slack somebody liked the look of.
    const spread = Math.max(...rows.map((r) => r.derivedFactor)) - Math.min(...rows.map((r) => r.derivedFactor));
    ok("  and every derived one now trips at the same stated factor",
        spread < 1e-3,
        `${rows[0].derivedFactor.toFixed(4)}x for all ${rows.length}, spread ${spread.toExponential(1)} ` +
        `(whole-millisecond rounding) -- the headroom, and nothing else`);
    // AND THE MECHANISM REALLY SPEAKS, measured rather than asserted: a budget under the cost is REPORTED.
    const short = Math.round(sweepCostFor("nbench", REC) / 6);
    const { notes } = await knobLiveness({ only: ["nbench"], budgetMs: short });
    ok("*** CONTROL: a budget below the cost produces a NAMED cut, so a slowdown would be heard ***",
        notes.length > 0 && /OVER BUDGET/.test(notes.join(" ")),
        `at ${short} ms: "${notes.join(" | ").slice(0, 110)}"`);
    const { notes: quiet } = await knobLiveness({ only: ["nbench"], budgetMs: sweepBudgetFor("nbench").ms });
    ok("  and the derived budget is silent on the same device, so the control is not simply always red",
        quiet.length === 0, `at ${sweepBudgetFor("nbench").ms} ms: nothing to report`);
}

// =============================================================================================================
console.log("\n7. #40's OWN NUMBER, MEASURED BOTH WAYS");
{
    const buildTotal = Object.values(REC.costs).reduce((n, v) => n + v, 0);
    const twofBuild = Object.entries(REC.costs).filter(([k]) => k.startsWith("twof.")).reduce((n, [, v]) => n + v, 0);
    const sweepTotal = Object.values(REC.sweepCosts).reduce((n, v) => n + v, 0);
    const twofSweep = REC.sweepCosts.twof;
    const buildPct = 100 * twofBuild / buildTotal, sweepPct = 100 * twofSweep / sweepTotal;
    // DEAREST, DERIVED: fold the 484 mode costs up to devices and take the maximum, rather than asserting a
    // name. If some other device overtakes twof one day this line says so instead of quietly staying true.
    const byDevice = {};
    for (const [k, v] of Object.entries(REC.costs)) {
        const d = k.split(".")[0]; byDevice[d] = (byDevice[d] || 0) + v;
    }
    const dearestBuild = Object.entries(byDevice).reduce((a, b) => (a[1] >= b[1] ? a : b));
    const dearestSweep = Object.entries(REC.sweepCosts).reduce((a, b) => (a[1] >= b[1] ? a : b));
    ok("*** twof is the dearest device in the lab on both measures, which is the part #40 got right ***",
        dearestBuild[0] === "twof" && dearestSweep[0] === "twof",
        `dearest build ${dearestBuild[0]} at ${(dearestBuild[1] / 1000).toFixed(0)} s, ` +
        `dearest sweep ${dearestSweep[0]} at ${(dearestSweep[1] / 1000).toFixed(0)} s`);
    ok("*** but 73% is neither of the two shares, and the two shares are not each other ***",
        Math.abs(buildPct - 73) > 10 && Math.abs(sweepPct - 73) > 10 && Math.abs(buildPct - sweepPct) > 20,
        `${buildPct.toFixed(1)}% of the census build sweep (484 device/modes), ` +
        `${sweepPct.toFixed(1)}% of the ladder sweep (116 devices) -- one item, one number, two sweeps`);
    ok("  and the concentration the item was pointing at is real on the build sweep",
        buildPct > 50, `twof alone is ${buildPct.toFixed(1)}% of the 780 s the census spends building`);
}

// ---- SABOTAGE LOG -- applied to the working tree, exit code and FAIL count read together, restored
// md5-identical (costRecord.mjs a82a027c, knobLiveness-selfcheck.mjs 37b0ca1f).
//
//   A  sweepBudgetFor sums the group instead of taking its dearest member.
//      -> exit=1, 1 red: the dearest-not-sum line, which reports "sum at 29.8 s decides it". Only one, and
//      that is right: every other check in this file uses a single device, where sum and max agree. The bug
//      it guards against is a group handing its dearest member the whole allowance, and a group is the only
//      place it can show.
//
//   B  an unpriced device is given a 20 s guess instead of being refused.
//      -> exit=1, 2 red: the refusal line (now printing a budget for "nosuchdevice") and the mixed-list line
//      (2 priced, 0 unpriced). *** THE SECOND IS THE ONE THAT MATTERS: *** a guess does not merely answer
//      wrongly, it erases the report that anything was unknown, so the caller cannot tell either.
//
//   C  one knobLiveness call site given its old typed 200000 back.
//      -> exit=1, 2 red: the ratchet naming the number still typed, and the call-site count falling 7 -> 6.
//      Both, because a single check on the count could be satisfied by adding a read somewhere else.
//
//   D  the host scale dropped from the budget arithmetic.
//      -> exit=1, 1 red, and ONLY the explicit scale:2 line catches it. hostScale() reads 1.0 in this sandbox
//      (no local runs against a MEASURED gate yet), so on THIS machine multiplying by it is a no-op and every
//      check that uses the live scale is blind to its removal. The check that passes an explicit scale is the
//      only witness here, and on Keith's rig -- where the scale is not 1 -- the others would speak too. Said
//      plainly because it is a limit of the machine, not of the check.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the 1.553x staleness measured for ONE device holds for the other 115. " +
    "Re-freezing the record is a four-hour run and its own round; until then every derived budget carries " +
    "one device's staleness as an assumption, which is why section 1 names it rather than folding it in.");
process.exit(fails ? 1 : 0);
