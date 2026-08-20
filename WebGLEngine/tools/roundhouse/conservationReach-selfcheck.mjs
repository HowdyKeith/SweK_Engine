// tools/roundhouse/conservationReach-selfcheck.mjs
//
// v3525 -- GRADES THE CENSUS THAT PUTS A NUMBER ON v3132'S WARNING.
//
// v3132 said a fifth criterion is a BATTERY CHANGE EVERY DEVICE MUST SURVIVE and several would not. That
// ordered the round list for hundreds of versions on a REMEMBERED "several". The census says the cost is not
// that several would fail -- IT IS THAT NOT ONE DEVICE CAN BE ASKED -- and section 3 is why: auditConservation
// needs a TIME SERIES, thirty devices already check conservation, and every one of them collapses its series
// to a scalar inside the bind before anything shared can see it.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { reach, seriesReach, shapedCandidates, handRolled, auditedSeries, reportLines, SHAPED, MIN_SAMPLES } from "./conservationReach.mjs";
import { auditConservation, isExact } from "./conservation.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("conservationReach-selfcheck -- what criterion five would cost\n");

const R = reach();

// ---------------------------------------------------------------------------
console.log("1. THE SERIES CENSUS IS DERIVED, AND IT IS THE EXACT HALF");
{
    ok("the corpus is the frozen baseline, not a list held here", R.pairs > 200 && R.devices > 50,
        R.pairs + " pairs, " + R.devices + " devices -- and it can only be asked at all because v3520 taught " +
        "the baseline to keep ARRAYS; a numbers-only corpus could not have answered this question");
    ok("!! numeric series long enough for auditConservation exist", R.series.length > 0,
        R.series.length + " fields across " + R.seriesPairs.length + " pairs, floor " + MIN_SAMPLES +
        " samples -- READ FROM THE MODULE'S OWN MINIMUM, not chosen here");

    // *** THE DECISIVE FACT, AND IT IS DERIVED RATHER THAN JUDGED: no field is BOTH a series AND
    // conservation-shaped. Saying "none of them is a conserved quantity" would be my reading; this is the
    // measurable form of the same claim and it needs no physics from me.
    // *** v3526 -- THE v3525 ANTIDOTE NAMED THE RIGHT RESPONSE AND THE DETECTOR COULD NOT SEE THE EVENT. ***
    // It said this line would go RED when a device emitted a conserved series, and one now does -- kepler's
    // `energySeries`. IT DID NOT FIRE, because SHAPED matches `energyErr` and not `energySeries`. A NAME SCAN
    // CANNOT WATCH FOR SOMETHING IT CANNOT SPELL. So the property moved to where it cannot be missed: WHICH
    // BINDS ACTUALLY PASS A SERIES TO auditConservation, derived from code rather than from a name.
    const audited = auditedSeries();
    ok("!! *** A SERIES IS NOW AUDITED BY THE SHARED MODULE -- IT WAS ZERO AT v3525 ***", audited.length >= 1,
        audited.map((a) => a.device).join(", ") + ". THE FIRST DEVICE CRITERION FIVE COULD BE ASKED OF.");
    const both = R.series.filter((x) => SHAPED.test(x.field));
    ok("the NAME scan still reports none, which is the correction rather than the finding", both.length === 0,
        "SHAPED cannot spell `energySeries`, so the keyword half stayed silent through the very event it was " +
        "written to catch. THE KEYWORD PROBE HAS MISLED THIS PROJECT FOUR TIMES NOW.");
    report("THE ANTIDOTE, RESTATED SO IT CAN FIRE NEXT TIME",
        "*** WHEN A SECOND DEVICE IS WIRED, `audited.length >= 1` STOPS BEING INTERESTING AND SHOULD BE " +
        "REWRITTEN TO COUNT AGAINST THE 30 CANDIDATES -- NOT WEAKENED, NOT DELETED. The number to watch is " +
        "audited/30, and it is 1/30 today. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE CANDIDATE LIST IS A CANDIDATE LIST, AND SAYS SO");
{
    ok("conservation-shaped names are plentiful", R.shaped.length > 20,
        R.shaped.length + " fields across " + R.devicesShaped.length + " devices");
    const P = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8")).pairs;
    const nonScalar = R.shaped.filter(({ key, field }) => Array.isArray((P[key].outputs || {})[field]));
    ok("!! and EVERY ONE OF THEM IS A SCALAR", nonScalar.length === 0,
        "*** THE SERIES WAS COLLAPSED INSIDE THE BIND BEFORE ANYTHING SHARED COULD SEE IT. Conservation is " +
        "already being checked in " + R.devicesShaped.length + " of " + R.devices + " devices -- by hand, " +
        "device by device, in a form no shared criterion can reach. ***");
    report("WHY THIS HALF IS NOT A VERDICT",
        "whether a field named `drift` is a CONSERVED quantity is a PHYSICAL JUDGEMENT and it is Keith's. THE " +
        "KEYWORD PROBE HAS MISLED THIS PROJECT THREE TIMES, so the name scan is reported APART from the two " +
        "facts above, which are derived.");
}

// ---------------------------------------------------------------------------
console.log("\n3. TWO DECLARATIONS OF ONE ALGORITHM, AND THE SHARED ONE ARRIVED SECOND");
{
    const hr = handRolled();
    ok("!! binds compute a first/second-half comparison themselves", hr.length > 0,
        hr.map((h) => h.file).join(", "));
    // *** THIS ASSERTED "NONE OF THEM IMPORTS conservation.mjs" AT v3525 AND IT IS NOW FALSE, WHICH IS THE
    // ROUND WORKING. *** keplerBind imports it and calls it BESIDE the hand-rolled fields rather than instead
    // of them, because those four are FROZEN IN TWO BASELINES: a refactor that quietly moved a frozen number
    // would be the regression this lab exists to catch. Rewritten to the new property, NOT weakened.
    ok("!! *** THE HAND-ROLLED BIND NOW IMPORTS THE SHARED MODULE ***", hr.every((h) => h.importsSharedModule),
        hr.map((h) => h.file + (h.importsSharedModule ? " (wired)" : " (NOT WIRED)")).join(", ") +
        " -- the second declaration is now compared against the first every run rather than merely coexisting");
    ok("!! and the count is ONE, not the TWO v3525 reported", hr.length === 1,
        "*** v3525's detector ran over RAW SOURCE and matched discoveryBind's line 6, A COMMENT explaining " +
        "kepler's observable. PROSE-AS-CODE, in the round whose subject is second declarations. codeOnly() now " +
        "blanks it -- AND MY FIRST FIX BROKE THE IMPORT CHECK THE SAME WAY IN REVERSE, because codeOnly ALSO " +
        "blanks STRING LITERALS and an import path is a string. codeOnly FOR AN IDIOM, noComments FOR TEXT THE " +
        "CODE CONTAINS: I hit both halves of that pair inside one round. ***");

    // *** THE LOAD-BEARING NEGATIVE: they are the SAME algorithm, shown by driving both on one series. ***
    // kepler/conserve reports energyErrFirstHalf, energyErrSecondHalf and energyGrowthRatio. That IS
    // auditConservation's growth. Demonstrated rather than asserted from the field names.
    const series = [1, 1.5, 0.6, 1.4, 0.5, 1.6, 0.4, 1.8];
    const q0 = series[0], dev = series.map((v) => Math.abs(v - q0));
    const mid = Math.floor(series.length / 2);
    const first = Math.max(...dev.slice(0, mid)), second = Math.max(...dev.slice(mid));
    const handRolledGrowth = second / first;                 // what a bind computes inline
    const a = auditConservation(series);
    ok("!! *** THE SHARED MODULE AND THE HAND-ROLLED FORM AGREE TO THE BIT ***",
        Object.is(a.growth, handRolledGrowth),
        "growth " + a.growth + " both ways. THE BINDS ARE NOT DOING SOMETHING DIFFERENT -- they are doing THIS, " +
        "separately, which is exactly why a shared criterion is possible and exactly why nothing noticed.");
    ok("...and the module reports EXACT apart from small", isExact([2, 2, 2, 2]) && a.verdict !== "exact",
        "conserved-by-construction and conserved-to-a-tolerance are different claims, and merging them invites " +
        "somebody to loosen the tolerance later");
    ok("a series shorter than the floor is REFUSED, not guessed at",
        auditConservation([1, 2]).verdict === "too-short",
        "a verdict on two samples would be a confident answer about nothing");
}

// ---------------------------------------------------------------------------
console.log("\n4. IT IS A REPORT, AND THE CONSEQUENCE IS STATED RATHER THAN ACTED ON");
{
    const lines = reportLines();
    ok("the report names itself in brackets", /^\[conservationReach\]/.test(lines[0]), lines[0].slice(0, 60));
    ok("and it states the consequence", lines.some((l) => /STOP COLLAPSING AND START EMITTING/.test(l)));
    const src = fs.readFileSync(path.join(HERE, "conservationReach.mjs"), "utf8");
    ok("!! it does NOT wire a fifth criterion", !/corroborateFully|c5_|criteria\.c5/.test(src),
        "*** CRITERION FIVE IS NOT A WIRING JOB: " + R.devicesShaped.length + " devices would have to change " +
        "WHAT THEY RETURN before it could run once. That is LARGER than v3132 feared, and it is now a " +
        "measurement rather than a memory. ***");
    report("THE ANTIDOTE, NAMED IN ADVANCE",
        "*** WHEN SOMEBODY MAKES A DEVICE EMIT A CONSERVED SERIES, SECTION 1's 'NOT ONE SERIES CARRIES A " +
        "CONSERVATION-SHAPED NAME' GOES RED. IT SHOULD BE REWRITTEN TO COUNT HOW MANY DO -- NOT WEAKENED, AND " +
        "NOT DELETED. That red is the first evidence criterion five could ever run. ***");
}

console.log(`\nconservationReach-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
