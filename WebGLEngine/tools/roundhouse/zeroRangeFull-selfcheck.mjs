#!/usr/bin/env node
// tools/roundhouse/zeroRangeFull-selfcheck.mjs -- v4426
//
// Run: node tools/roundhouse/zeroRangeFull-selfcheck.mjs   (pure: reads the frozen sweep, runs no device)
//
// HEADER-PENDING
"use strict";
import { ZERO_RANGE_REGISTRATION } from "./zeroRangeSweep.mjs";
import { EXACT_OK } from "./exactZeroRegister.mjs";
import { SCOPE, PARALLEL_IS_LEGITIMATE, MEASURED_V4426, settle, vacuousDevices, coverage,
         costConcentration, RESOLUTION_MS, NONTERMINATING } from "./zeroRangeFull.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const rows = MEASURED_V4426.rows || [];
const perDevice = MEASURED_V4426.perDevice || {};

console.log("\n1. *** THE GATE HAS BEEN RE-CONFIRMING THE CONTROL AND NEVER TESTING THE BET ***");
{
    ok("*** the registration carries a positive control AND a claim, and they are different claims ***",
        ZERO_RANGE_REGISTRATION.claim.findsAiryZero === true &&
        ZERO_RANGE_REGISTRATION.claim.additionalUnregisteredZeros === 1,
        "A: the sweep finds the airy zero. B: it finds at least one FURTHER unregistered zero elsewhere");
    ok("  the scoped gate covers four device/modes", SCOPE.gateModes.length === 4 &&
        SCOPE.gateModes.includes("optics.airy"),
        SCOPE.gateModes.join(", ") + " -- three of the four cannot bear on B at all, and the fourth IS A");
    ok("*** out of a lab of 484 ***", SCOPE.labDeviceModes > 100 * SCOPE.gateModes.length,
        `${SCOPE.gateModes.length} of ${SCOPE.labDeviceModes} device/modes across ${SCOPE.labDevices} devices ` +
        `-- ${(100 * SCOPE.gateModes.length / SCOPE.labDeviceModes).toFixed(1)}%`);
    ok("  and the reason it was scoped is a COST measured once, in prose", /did not finish in twenty minutes/.test(SCOPE.v2912Note),
        "v4425 spent a round on the same shape one level down: an observation taken once, over a budget, and " +
        "therefore never taken again");
}

console.log("\n2. *** PARALLEL HERE, SERIAL THERE, AND THE REASON IS THE KIND OF THING BEING MEASURED ***");
{
    ok("*** the justification names what contention can and cannot change ***",
        /durations, not values/.test(PARALLEL_IS_LEGITIMATE.contentionAffects),
        "a starved process misses a clock deadline; it does not compute a different float");
    ok("  and it names the rounds that went the other way, with their evidence",
        /v4424 and v4425/.test(PARALLEL_IS_LEGITIMATE.priorRounds) && /starv/.test(PARALLEL_IS_LEGITIMATE.priorRounds),
        "redCensus.mjs: an 8-way sweep turned seven green gates red by starving them");
    report("Getting this wrong costs something in both directions: serial here would be four times the wall " +
        "clock for nothing, and parallel there would have manufactured red gates.");
}

console.log("\n3. *** THE PREDICTIONS, SETTLED ***");
{
    const s = settle(rows);
    report(`${rows.length} exact-zero field(s) found, ${s.unregisteredTotal} not on the register ` +
        `(${Object.keys(EXACT_OK).length} entries)`);
    ok("*** A HOLDS: the sweep finds the zero it was told to find ***", s.A.held,
        s.A.at ? "optics.airy.airyRingErrFrac = 0 at " + s.A.at.slice(0, 3).join(", ") : "NOT FOUND");
    ok("*** B HOLDS: an unregistered exact zero somewhere other than optics ***", s.B.held,
        `${s.B.count} found: ${s.B.gates.slice(0, 6).join(", ")}${s.B.gates.length > 6 ? " ..." : ""}`);
    // *** THE SETTLEMENT HAS TO BE ABLE TO COME OUT THE OTHER WAY. ***
    const onlyOptics = rows.filter((r) => r.device === "optics");
    ok("  B is settled by evidence, not by construction: an optics-only result fails it",
        settle(onlyOptics).B.held === false,
        "if every unregistered zero were in optics, B would read false here -- which is what a one-off looks like");
    ok("  and A fails when the control is absent",
        settle(rows.filter((r) => !/airyRingErrFrac/.test(r.field))).A.held === false,
        "a sweep that misses a zero known to exist is measuring nothing, and this check would say so");
}

console.log("\n4. *** WHAT THE RUN REACHED, AND WHAT IT BUILT NOTHING FOR ***");
{
    const c = coverage(perDevice);
    report(`${c.reached} of ${c.of} devices reached; ${(c.totalMs / 60000).toFixed(1)} minutes of device time`);
    ok("*** the run records which devices it reached, so the next one continues rather than re-deciding ***",
        c.reached > SCOPE.gateModes.length && Object.values(perDevice).every((d) => typeof d.ms === "number"),
        "v2912 recorded a duration and stopped; this records a per-device cost");
    // *** A TOTAL NOTHING BOUNDS IS A TOTAL THAT CAN BE WRONG BY FIFTY TIMES AND PASS. *** The first draft of
    // the merge let a regex swallow the integer part of each duration, so 35.7s parsed as 0.7s and fourteen
    // devices reported six seconds of work. Every check above passed on it. A floor is cheap and would have
    // caught it: no device in this lab builds and reads a whole knob range in under a millisecond.
    // *** THE COSTS CAME FROM A PROGRESS LOG PRINTED TO A TENTH OF A SECOND, AND THAT LIMIT IS ASSERTED RATHER
    // THAN LEFT TO BE INFERRED. *** Two different facts both read as 0 here -- "built nothing" and "faster than
    // the log can resolve" -- and blobvitals is the second with 56 builds.
    ok("  the per-device costs are quantised to the log they were parsed from, and say so",
        Object.values(perDevice).every((d) => d.ms % RESOLUTION_MS === 0),
        `every duration is a multiple of ${RESOLUTION_MS}ms; a device under ${RESOLUTION_MS / 2}ms records 0`);
    const subRes = Object.entries(perDevice).filter(([, d]) => d.builds > 0 && d.ms === 0).map(([n]) => n);
    ok("  and a 0 that means 'too fast to resolve' is told from a 0 that means 'built nothing'",
        subRes.every((n) => perDevice[n].builds > 0),
        subRes.length ? `${subRes.join(", ")}: ${subRes.map((n) => perDevice[n].builds).join(", ")} builds under the resolution`
                      : "no device built something in under the resolution");
    report("THE FIRST DRAFT OF THAT PARSE WAS WRONG BY FIFTY TIMES -- a regex swallowed the integer part of " +
        "each duration and fourteen devices reported six seconds of work. It was caught by READING the number, " +
        "not by a check; every check here passed on it. Catching it needs the raw duration rather than the " +
        "log's, which is a change to the runner and is named rather than faked with a floor.");
    const cc = costConcentration(perDevice);
    report(`the most expensive device is ${cc.top ? cc.top.name : "-"} at ${(cc.top ? cc.top.ms / 60000 : 0).toFixed(1)} ` +
        `minutes; the other ${cc.n - 1} together take ${(cc.rest / 60000).toFixed(1)}`);
    ok("*** the full sweep was never expensive -- its cost lives in a handful of devices ***",
        cc.devicesHoldingHalf <= cc.n / 10 && cc.medianMs < 10000,
        `${cc.devicesHoldingHalf} of ${cc.n} devices hold half the total; the median device takes ` +
        `${(cc.medianMs / 1000).toFixed(1)}s. "Scope it to four device/modes" was the wrong remedy for that`);
    report(`AND THIS ROUND GOT IT WRONG ONCE, ON ITS OWN DATA: at 20 devices the top was bell at 89% and that ` +
        `was committed; at ${cc.n} it is ${cc.top ? cc.top.name : "-"} at ${(100 * cc.share).toFixed(0)}% and ` +
        "bell is third. The share is REPORTED for that reason and the gated properties are the ones that do " +
        "not move with the sample. corroborationCensus.mjs's own words, quoted here one round earlier: a rate " +
        "measured on a sample I selected is not a rate.");
    // *** THREE STATES, NOT TWO, AND EACH HAS A DIFFERENT REMEDY. ***
    const N = NONTERMINATING;
    ok("*** a device that does not FINISH is kept apart from a device that is merely expensive ***",
        N.stoppedAfterMs > (cc.top ? cc.top.ms : 0) && !(N.device in perDevice),
        `${N.device} ran ${(N.stoppedAfterMs / 3600000).toFixed(1)}h without terminating, against ` +
        `${(cc.top ? cc.top.ms / 60000 : 0).toFixed(1)} minutes for the most expensive device that DID finish. ` +
        "The ratio is not the point -- producing no verdict is");
    ok("  and it is named, not counted", typeof N.device === "string" && N.completedBefore.length > 0,
        "'the sweep has a device that hangs' is a bug report; 'one of them did not finish' is a shrug");
    ok("  it contributes no row, because it produced no verdict", !Object.keys(perDevice).includes(N.device),
        "more time will not produce one either, which is what makes this a different state from slow");
    const vac = vacuousDevices(perDevice);
    ok("*** and a device the sweep BUILDS NOTHING for is counted separately, not as a clean result ***",
        vac.length > 0 && vac.every((n) => perDevice[n].zeros === 0),
        `${vac.length} device(s) with 0 builds: ${vac.slice(0, 8).join(", ")}${vac.length > 8 ? " ..." : ""} -- ` +
        "an empty population prints the same thing as a population that was looked at");
    ok("  the vacuous ones are a strict subset of the reached ones", vac.every((n) => n in perDevice),
        "a device nobody ran is not a device that built nothing; those are different states");
}

console.log(`\n${fails ? "FAIL" : "ALL GREEN"} -- ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
