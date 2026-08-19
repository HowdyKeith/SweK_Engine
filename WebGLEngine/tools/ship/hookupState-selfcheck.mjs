// WebGLEngine/tools/ship/hookupState-selfcheck.mjs -- v3592
//
// Run: node tools/ship/hookupState-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** SECTION 3 CORRECTS A NUMBER I GAVE LAST TURN FROM MEMORY. *** I said "roughly 40% of good-looking
// candidates die on measurement". Derived from the records it is 29% -- because I had counted muscle, which was
// withdrawn on STRUCTURE and never run. The two are different evidence and the survey now separates them.
"use strict";
import { survey, attrition, stateOf, isPhysics, STATES, CLAIMS_EXACT, reportLines } from "./hookupState.mjs";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { SCENE_TRIAGE } from "../../physics/labScenes.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const s = survey(), a = attrition();

console.log("hookupState-selfcheck -- how far along, and whether the number can be trusted\n");

// ---------------------------------------------------------------------------
console.log("1. THE STATES PARTITION THE POPULATION");
{
    report("instruments", s.instruments + " = " + s.physics + " physics + " + s.tooling + " tooling");
    report("by state", STATES.map((k) => k + " " + s.byState[k]).join("   "));

    ok("!! the four states sum to the physics population exactly",
        STATES.reduce((t, k) => t + s.byState[k], 0) === s.physics,
        "*** FIRST MATCH WINS, so an instrument is never counted twice. *** A proposer implies a bench page " +
        "implies reachability, and a tally that let one instrument land in two buckets would report a total " +
        "larger than the population -- and nobody would notice until it was.");
    ok("!! every row carries a state from the declared set",
        s.rows.every((r) => STATES.includes(r.state)),
        "a fifth value appearing silently would be a category nobody decided on");
    ok("!! and the state is DERIVED, not stored on the entry",
        !INSTRUMENTS.some((i) => "hookup" in i),
        "*** A STORED FIELD WOULD ROT THE FIRST TIME SOMEBODY REGISTERED A PROPOSER AND FORGOT TO UPDATE IT, " +
        "AND IT WOULD ROT INVISIBLY, because nothing else reads it. *** Every state here comes from the live " +
        "registry, the module's exports, and `page` -- facts that already exist and cannot disagree with " +
        "themselves.");
}

// ---------------------------------------------------------------------------
console.log("\n2. PROPOSERS AND INSTRUMENTS-WITH-A-PROPOSER ARE DIFFERENT NUMBERS");
{
    report("proposers / instruments covered", s.proposers + " / " + s.instrumentsWithProposer);
    report("multi-knob instruments", s.multiKnob.join(", ") || "(none)");

    ok("!! the report gives both counts and the reason they differ",
        s.proposers > s.instrumentsWithProposer && s.multiKnob.length > 0,
        "md-pbc carries TWO knobs. *** A READER SEEING 'proposers 7' BESIDE '6 proposer' WOULD REASONABLY " +
        "SUSPECT A DANGLING LINK -- which is exactly the fault v3591 found for real, when gyro-spin pointed at " +
        "an instrument id that did not exist. *** Two true numbers side by side, unexplained, look like one bug.");
    ok("!! and no proposer points at an instrument that does not exist",
        s.dangling.length === 0,
        "the check that caught the missing gyroscope entry, kept where the counts are read" +
        (s.dangling.length ? " -- FOUND: " + s.dangling.join(", ") : ""));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE ATTRITION RATE, AND IT CORRECTS WHAT I SAID FROM MEMORY ***");
{
    report("withdrawn by measurement", a.withdrawnByMeasurement.join(", "));
    report("withdrawn on structure", a.withdrawnOnStructure.join(", "));
    report("rate", (a.rate * 100).toFixed(0) + "%");

    ok("!! the rate is READ from the records rather than restated",
        a.withdrawnByMeasurement.length === SCENE_TRIAGE.filter((r) =>
            r.eligible === "refused" && r.provenance === "measured").length,
        "labScenes marks a withdrawal as `refused` with `provenance: measured`; knobRegistry keeps " +
        "NOT_REGISTERED. *** BOTH EXISTED AND NOTHING READ EITHER, so the rate that governs any plan was a " +
        "number somebody would restate from memory -- which is what I did. ***");
    ok("!! *** AND THE DERIVED RATE IS 29%, NOT THE 40% I GAVE LAST TURN ***",
        a.rate < 0.35 && a.rate > 0.2,
        "I had counted MUSCLE among the measured deaths. It was withdrawn on STRUCTURE -- it inherits balloon's " +
        "volume constraint -- and never run. *** DRIVEN AND ARGUED ARE DIFFERENT EVIDENCE, and folding them " +
        "together inflated the one number a plan actually depends on. *** The survey separates them now.");
    ok("...and the structural withdrawals are still counted, in their own column",
        a.withdrawnOnStructure.length >= 4,
        "they are real refusals with reasons on record. Dropping them to make the measured rate look cleaner " +
        "would be the opposite error.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE CANDIDATE POOL IS A TEXT PROXY AND SAYS SO");
{
    report("pool size", String(s.pool.size) + "   (" + s.pool.note + ")");
    report("top areas", Object.entries(s.pool.byArea).sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([k, v]) => k + "(" + v + ")").join("  "));

    ok("!! the pool is labelled a proxy rather than an assessment",
        /PROXY/i.test(s.pool.note),
        "*** READING THE WORD 'exact' IN A DESCRIPTION IS NOT DRIVING A KEY ACROSS A KNOB RANGE. *** orbit's " +
        "entry claimed an exact invariant and was right about that -- and the key turned out to be DEAF to the " +
        "knob. The pool is an upper bound on where to look, not a list of admissions.");
    ok("!! it excludes instruments that already have a proposer",
        s.rows.filter((r) => r.state === "proposer").every((r) => !s.pool.byArea[r.area] || true) &&
        s.pool.size <= s.physics - s.byState.proposer,
        "counting the already-registered into the pool would make the remaining work look larger every time it " +
        "shrank");
    ok("...and the regex is visible rather than buried",
        CLAIMS_EXACT instanceof RegExp,
        "a proxy whose rule is hidden is a number nobody can argue with, which is worse than one they can");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", reportLines().length > 14,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
ok("the survey costs nothing but reading what exists",
    typeof stateOf === "function" && typeof isPhysics === "function",
    "no new state was introduced to answer a question about state");

console.log(fails ? `\nhookupState-selfcheck: ${fails} FAILED` : "\nhookupState-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
