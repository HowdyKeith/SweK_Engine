#!/usr/bin/env node
// WebGLEngine/tools/ship/redCensusFresh-selfcheck.mjs -- v4297
//
// *** THE CENSUS WAS TAKEN AT v4279 AND NOBODY LOOKED AGAIN FOR SIXTEEN ROUNDS. *** This is the thing that
// looks. It cannot be a full re-run -- the list costs 142 s serially and a gate that expensive gets skipped,
// which is how the last register became fiction -- so it does three cheaper things that together make silence
// impossible:
//
//   THE FILES STILL EXIST. A renamed or deleted gate makes an entry unfalsifiable, and an unfalsifiable entry
//   is the exact failure mode redCensus.mjs was written to end: "a register that is only ever appended to
//   becomes a list of grievances; one that is never appended to becomes a list of fiction."
//   THE RECORD RECONCILES WITH ITSELF. 37 standing + 2 introduced-and-fixed = 39 confirmed.
//   A BOUNDED SUBSET IS ACTUALLY RE-RUN. Twenty gates, ~3.2 s, deterministic by cost. If ONE of them has gone
//   green, the register is stale and this says so by name.
//
// *** THE DIRECTION OF THE SUBSET CHECK IS THE UNUSUAL PART. *** It goes RED WHEN A GATE GOES GREEN. That
// reads backwards until you see what it is for: it is not checking that the tree is healthy, it is checking
// that the RECORD is true. A fixed gate is good news and a stale register is bad news, and the only way to
// hear the second is to make the first loud.
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as RC from "./redCensus.mjs";

let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------------------------------------
sec("1. EVERY RECORDED ENTRY STILL POINTS AT A FILE THAT EXISTS");
// ---------------------------------------------------------------------------------------------------------
{
    const missing = RC.RED_AT_V4279.filter((e) => !fs.existsSync(path.join(RC.ENG, e.gate)));
    ok(missing.length === 0, "*** no entry has been renamed or deleted out from under the register ***",
       missing.length ? missing.map((e) => e.gate).join(", ") : `${RC.RED_AT_V4279.length} gates, all present`);
    ok(RC.RED_AT_V4279.every((e) => typeof e.ms === "number" && e.ms > 0 && typeof e.fails === "string"),
       "and every one carries a runtime and what it was failing on",
       "an entry without either cannot be re-checked or acted on");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE RECORD RECONCILES WITH ITSELF, AND SAYS WHICH MOMENT EACH NUMBER DESCRIBES");
// ---------------------------------------------------------------------------------------------------------
{
    const M = RC.MOMENTS;
    // FIFTH AND SIXTH INSTANCES OF THE MISSING TERM (four are in gateSweep-selfcheck): a frozen v4279 figure
    // compared to a list that MAY ONLY SHRINK by the register's own rule. MOMENTS.standingAfterFixes is what
    // stood AT v4279 and never moves; RED_AT_V4279 is what stands NOW. The record itself already says this --
    // MOMENTS carries a derived `standingToday` for exactly this reason -- so the check is written against the
    // field that means "now" and the frozen one is reconciled with the fixed-since term beside it.
    ok(M.standingToday === RC.RED_AT_V4279.length,
       "the LIVE standing count equals the list", `${M.standingToday}`);
    ok(M.standingAfterFixes === RC.RED_AT_V4279.length + RC.FIXED_SINCE_V4279.length,
       "...and the v4279 figure reconciles with it through what has been fixed and pruned since",
       `${RC.RED_AT_V4279.length} standing + ${RC.FIXED_SINCE_V4279.length} fixed since = ${M.standingAfterFixes} at v4279`);
    ok(M.standingAfterFixes + M.introducedAndFixedInRound === M.confirmedBySweep,
       "*** and 37 + 2 = 39, so the two numbers are two MOMENTS rather than a contradiction ***",
       `${M.standingAfterFixes} standing + ${M.introducedAndFixedInRound} fixed in round = ${M.confirmedBySweep} found by the sweep`);
    ok(M.confirmedBySweep === RC.METHOD.confirmedSerially,
       "and the reconciliation is against METHOD's own figure, not a retyped one", `${RC.METHOD.confirmedSerially}`);
    const standing = new Set(RC.RED_AT_V4279.map((e) => e.gate));
    ok(M.fixedInRound.every((g) => !standing.has(g)),
       "the two fixed in that round are ABSENT from the standing list, which is what makes the sum right",
       M.fixedInRound.join(", "));
}

// ---------------------------------------------------------------------------------------------------------
sec("3. A CONTROL FIRST: THE RUNNER CAN REPORT GREEN");
// ---------------------------------------------------------------------------------------------------------
{
    // Without this, "every sampled gate is still red" is indistinguishable from a runner that reports red for
    // everything -- which is precisely how a 37-of-37 result would look if execFileSync were misconfigured.
    const green = RC.RECHECK.controlled.filter((g) => fs.existsSync(path.join(RC.ENG, g)));
    ok(green.length > 0, "the control gates exist", green.join(", "));
    const probe = RC.runGate(green[0], { timeoutMs: 120000 });
    ok(probe.red === false,
       "*** runGate reports GREEN for a gate known to pass ***",
       `${green[0]} -> code ${probe.code}. Without this line, section 4 proves nothing`);
}

// ---------------------------------------------------------------------------------------------------------
sec("4. A BOUNDED SUBSET IS RE-RUN, AND A GATE THAT WENT GREEN MAKES THIS RED");
// ---------------------------------------------------------------------------------------------------------
{
    const { gates, costMs } = RC.cheapSubset(4000);
    ok(gates.length >= 10, "the subset is worth running", `${gates.length} gates, ~${costMs} ms recorded`);
    ok(JSON.stringify(RC.cheapSubset(4000).gates.map((g) => g.gate)) === JSON.stringify(gates.map((g) => g.gate)),
       "and it is DETERMINISTIC, so this gate cannot flap between runs",
       "a random sample would go red on one day and green the next for no reason in the tree");

    const wentGreen = [];
    for (const e of gates) {
        const r = RC.runGate(e.gate, { timeoutMs: Math.max(60000, e.ms * 6) });
        if (!r.red) wentGreen.push(e.gate);
    }
    ok(wentGreen.length === 0,
       "*** every sampled gate is STILL RED, so the register is still true ***",
       wentGreen.length
           ? `${wentGreen.length} have been FIXED and never removed: ${wentGreen.join(", ")} -- re-run the full census and update redCensus.mjs`
           : `${gates.length} of ${RC.RED_AT_V4279.length} sampled, none has been fixed`);
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE RE-CHECK IS RECORDED, INCLUDING THAT NOTHING WAS FIXED");
// ---------------------------------------------------------------------------------------------------------
{
    const R = RC.RECHECK;
    ok(R.checked === RC.RED_AT_V4279.length + RC.FIXED_SINCE_V4279.length && R.stillRed + R.nowGreen === R.checked,
       "the recorded re-check adds up, against the register as it stood WHEN IT RAN",
       `${R.stillRed} red + ${R.nowGreen} green = ${R.checked}; register now ${RC.RED_AT_V4279.length} + ` +
       `${RC.FIXED_SINCE_V4279.length} fixed since`);
    // v4297: this line used to read `R.regressed === 0` and asserted a field the re-check could not measure.
    // A gate that checks a record is only as honest as the record, and this one repeated its error verbatim.
    ok(R.nowGreen === 0 && R.regressedAmongChecked === 0,
       "*** sixteen rounds, nothing fixed among the thirty-seven ***",
       "the previous register rotted by accusing fixed code; this one is exactly true and exactly stalled");
    ok(!Object.prototype.hasOwnProperty.call(R, "regressed") && /unmeasur/i.test(R.regressedOverall),
       "*** and the REGRESSION question is recorded as unmeasurable rather than as a zero ***",
       "all 37 it ran were already red, so none was eligible; answered by the full sweep at v4297");
    ok(typeof R.whyShipsWereHonest === "string" && /verify\.mjs/.test(R.whyShipsWereHonest),
       "and it explains why every ALL GREEN was honest anyway",
       "verify.mjs runs a smaller, different set -- the sweep is not what a ship gate executes");
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  MOMENTS.introducedAndFixedInRound changed from 2 to 0.
//      -> exit=1, section 2. The sum stops reconciling and the gate says which two figures disagree, which is
//      the whole reason the reconciliation is arithmetic rather than a sentence.
//
//   B  a recorded gate path altered to one that does not exist.
//      -> exit=1, section 1, naming the path. An entry pointing at nothing is unfalsifiable, and an
//      unfalsifiable entry is how the last register became fiction.
//
//   C  runGate forced to report red unconditionally.
//      -> exit=1, section 3. The CONTROL is what catches it: section 4 would have been perfectly happy, since
//      "every sampled gate is still red" is exactly what a broken runner produces. That is why the control
//      runs BEFORE the subset and not after it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE OTHER 17 ENTRIES. This re-runs twenty of thirty-seven, chosen by cost, so a " +
    "gate fixed among the seventeen slow ones will not be noticed until somebody re-runs the full list -- " +
    "which costs 142 s and is a deliberate trade, not an oversight. Also unchecked HERE: whether any gate that " +
    "was GREEN at v4279 has since gone red. That question was UNKNOWN until v4297; the full 1,366-gate two-phase " +
    "sweep answered it -- SIX regressions, named in gateSweep.SWEEP_V4297 and reconciled by " +
    "gateSweep-selfcheck.mjs section 7. This file still cannot see the next one; that needs the sweep re-run.");
process.exit(fails ? 1 : 0);
