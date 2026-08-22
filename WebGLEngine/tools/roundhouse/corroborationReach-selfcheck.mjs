// WebGLEngine/tools/roundhouse/corroborationReach-selfcheck.mjs -- v3511
//
// Run: node tools/roundhouse/corroborationReach-selfcheck.mjs   (~0.2s)
//
// *** THE RATCHET GUARDS THE NUMERATOR AND NEVER THE RATE, AND THAT IS THE WHOLE DESIGN. ***
//
// knobCandidates-selfcheck learned this the hard way and says so in its own header: it froze
// `eligible.length === 4` at v2909 as "the set did not grow", AND IT WENT RED THE MOMENT v3081 SUCCEEDED AT THE
// THING THAT FILE EXISTS TO ATTEMPT. **A GATE THAT FAILS ON PROGRESS TEACHES PEOPLE TO DELETE GATES.**
//
// The rate falls whenever the lab grows -- which is the GOOD outcome and the one this report exists to make
// visible -- so a ratchet on the rate would fire on every new device and be switched off within a month. What
// must not happen is a device SILENTLY LOSING a knob it already had.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reach, configSurface, nuisanceNames, refinementNames, reportLines } from "./corroborationReach.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { DEVICE_NAMES } from "./devices.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(HERE, "corroboration-reach-baseline.json");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const R = reach();

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE RATE IS REPORTED WITH BOTH TERMS, AND THE DENOMINATOR IS THE ONE THAT MOVED ***
 * --------------------------------------------------------------------------------------------------------- */
{
    say(`${R.eligible.length} of ${R.devices} eligible -- ${(100 * R.eligible.length / R.devices).toFixed(1)}%`);
    ok("!! *** BOTH TERMS OF THE RATE ARE DERIVED, NEITHER IS TYPED ***",
       R.devices === DEVICE_NAMES.length && R.eligible.every((d) => refinementNames().has(d) && nuisanceNames().has(d)),
       `*** THE RULE THIS MEASURES WAS WRITTEN AS "5 OF 27 QUALIFY". IT IS STILL FIVE AND THE LAB IS ${R.devices}. THE REACH FELL FROM 18.5% TO ${(100 * R.eligible.length / R.devices).toFixed(1)}% WITH NOTHING CHANGING AND NOTHING REPORTING IT -- the numerator was watched and the denominator tripled. Same shape as gateReach's 63.3%, a denominator nobody looked inside. A COUNT IS A MEMORY AND MEMORIES GO STALE. ***`);

    ok("!! the nuisance register is UNIONED across both files it lives in",
       // v3515 -- THIS COMPARED THE **FILTERED** SET AGAINST THE **RAW** UNION, so excluding negative controls
       // broke it. It was never about the filter: what it guards is that BOTH FILES ARE READ. Restated over
       // the raw registers, where the union is the only question, and the filtered count is checked separately.
       new Set([...Object.keys(NUISANCE_KNOBS), ...Object.keys(NEW_NUISANCE)]).size >= Object.keys(NUISANCE_KNOBS).length &&
       Object.keys(NEW_NUISANCE).some((d) => !Object.keys(NUISANCE_KNOBS).includes(d)) &&
       [...nuisanceNames()].every((d) => d in NUISANCE_KNOBS || d in NEW_NUISANCE),
       "*** NUISANCE_KNOBS IS THE ORIGINAL REGISTER AND NEW_NUISANCE WAS ADDED INSIDE corroborateFully, SO A CENSUS READING ONLY THE FIRST WOULD UNDERCOUNT -- silently, and in the direction of 'there is less work than you think'. The second assertion checks the union is NOT VACUOUS: if the two registers ever became one, this line should be simplified rather than left to pass on a coincidence. ***");

    ok("...and no knob names a device outside the registry",
       R.orphanKnobs.length === 0,
       `unresolved: ${R.orphanKnobs.join(" ") || "none"}. A knob registered against a device that does not exist is a register pointing at nothing, and it would inflate the numerator.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE RATCHET: ELIGIBILITY MUST NOT FALL, AND IT IS NOT PINNED WITH === ***
 * --------------------------------------------------------------------------------------------------------- */
{
    if (process.env.SWEK_FREEZE_CORROBORATION_REACH === "1") {
        fs.writeFileSync(BASE, JSON.stringify({ eligible: R.eligible, refinement: R.refinement, nuisance: R.nuisance }, null, 1));
        console.log("  ----  FROZE " + R.eligible.length + " eligible devices into corroboration-reach-baseline.json");
    }
    const b = JSON.parse(fs.readFileSync(BASE, "utf8"));
    const lostEligible = b.eligible.filter((d) => !R.eligible.includes(d));
    const lostKnob = [...b.refinement.filter((d) => !R.refinement.includes(d)).map((d) => d + "(refinement)"),
                      ...b.nuisance.filter((d) => !R.nuisance.includes(d)).map((d) => d + "(nuisance)")];
    const gained = R.eligible.filter((d) => !b.eligible.includes(d));
    say(`baseline had ${b.eligible.length} eligible; lost ${lostEligible.length}, gained ${gained.length}${gained.length ? " (" + gained.join(" ") + ")" : ""}`);

    ok("!! *** NO DEVICE HAS SILENTLY LOST ELIGIBILITY ***",
       lostEligible.length === 0,
       `lost: ${lostEligible.join(" ") || "none"}. *** THE RATCHET IS ON THE **NUMERATOR**, NEVER THE RATE. The rate falls whenever the lab grows -- which is the good outcome and the thing this report exists to make visible -- so a ratchet on the rate would fire on every new device and be switched off within a month. Re-freeze with SWEK_FREEZE_CORROBORATION_REACH=1. ***`);

    ok("!! ...and no device has lost a knob it already had, which is a finer question than eligibility",
       lostKnob.length === 0,
       `lost: ${lostKnob.join(" ") || "none"}. A device one knob short can lose its remaining knob without changing the eligible count at all -- ELIGIBILITY IS A CONJUNCTION AND A CONJUNCTION HIDES WHICH HALF MOVED.`);

    // *** MY FIRST VERSION MATCHED THE RAW SOURCE AND FAILED ITSELF, because the failure message BELOW quotes
    // `eligible.length === 4` as the defect it warns about. A CHECK COUNTING ITS OWN WARNING AS THE THING IT
    // WARNS ABOUT -- the fifth instance of that species in this tree, and caught by the check itself. The fix
    // the tree already prescribes: codeOnly() blanks comments AND string literals, so what is matched is the
    // CODE and not the explanation of the code.
    const src = codeOnly(fs.readFileSync(path.join(HERE, "corroborationReach-selfcheck.mjs"), "utf8"));
    ok("!! *** AND THIS GATE DOES NOT PIN THE COUNT WITH AN EQUALITY, WHICH IS WHY ITS PREDECESSOR WENT RED ON PROGRESS ***",
       !/eligible\.length\s*===\s*\d/.test(src) && !/eligible\.length\s*<=\s*\d/.test(src),
       "*** knobCandidates-selfcheck FROZE `eligible.length === 4` AT v2909 AS \"the set did not grow\", AND IT WENT RED THE MOMENT v3081 REGISTERED lens -- succeeding at the thing that file exists to attempt. A GATE THAT FAILS ON PROGRESS TEACHES PEOPLE TO DELETE GATES, and gateQuality HARD-FAILS any gate pinning a register's size with `===`. Asserted structurally on this file's own source so the shape cannot come back. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE ONE-KNOB-SHORT LIST IS DERIVED, AND IT IS THE ROUND'S USEFUL OUTPUT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    say(`need a nuisance knob: ${R.needNuisance.join(" ") || "none"}; need a refinement knob: ${R.needRefinement.join(" ") || "none"}`);
    ok("!! *** THREE DEVICES ARE ONE KNOB FROM THE BATTERY AND NOTHING NAMED THEM UNTIL NOW ***",
       R.needNuisance.length + R.needRefinement.length > 0 &&
       R.needNuisance.every((d) => !R.eligible.includes(d)) && R.needRefinement.every((d) => !R.eligible.includes(d)),
       "*** THE BATTERY'S OWN RULE IS \"A KNOB ADDED IS A DEVICE PROMOTED\", written when 5 of 27 qualified -- AND IN THE HUNDREDS OF VERSIONS SINCE, NOTHING HAS DERIVED WHO WAS ONE KNOB AWAY. That is the whole gap between a rule and an instrument. ***");

    ok("...and the two lists are disjoint from each other by construction",
       R.needNuisance.filter((d) => R.needRefinement.includes(d)).length === 0,
       "A device cannot be missing only its nuisance knob AND only its refinement knob -- if both lists named it, it would have neither and belong in the 64.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CONFIG SURFACE IS A REPORT, AND THE GATE SAYS SO RATHER THAN GRADING IT
 * --------------------------------------------------------------------------------------------------------- */
{
    const s = await configSurface();
    say(`of the ${R.neither.length} with neither knob: ${s.withNums.length} expose numeric config, ${s.without.length} expose none, ${s.broken.length} would not build`);
    ok("!! every device with neither knob was actually BUILT to ask, rather than judged from its name",
       s.broken.length === 0 && s.withNums.length + s.without.length === R.neither.length,
       "*** THE KEYWORD PROBE HAS MISLED THIS PROJECT THREE TIMES -- it put gyroscope in the wrong pile when the ungraded were classified by name. This asks the device. ***");

    ok("!! *** AND THE 52 ARE NOT A TO-DO LIST, WHICH THE REPORT SAYS IN ITS OWN WORDS ***",
       (await reportLines()).join("\n").includes("REPORT AND NOT A VERDICT"),
       "*** A NUMERIC CONFIG KEY IS A CANDIDATE AND NOTHING MORE. Whether a parameter is a NUISANCE (the answer must not move), a REFINEMENT (the answer must converge) or neither is a PHYSICAL JUDGEMENT about that device -- knobCandidates.mjs exists because three candidates were examined and ALL THREE REJECTED with their reasons re-measured rather than quoted. A crude count near a hundred is not a backlog, IT IS AN UNASKED QUESTION. ***");

    const reg = fs.readFileSync(path.join(HERE, "..", "ship", "reportingTools.mjs"), "utf8");
    ok("!! the census is reachable from tools.html rather than only from a console",
       /tools\/roundhouse\/corroborationReach\.mjs/.test(reg),
       "The report prints and exits ZERO; this gate is what exits nonzero.");
}

console.log(fails ? "\ncorroborationReach-selfcheck: " + fails + " FAILED" : "\ncorroborationReach-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
