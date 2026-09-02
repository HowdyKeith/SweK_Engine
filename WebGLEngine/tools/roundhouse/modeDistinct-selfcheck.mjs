// tools/roundhouse/modeDistinct-selfcheck.mjs -- v4190
//
// *** THE GATE FOR THE RULE THIS TREE STATES MOST OFTEN AND HAD NEVER CHECKED ACROSS THE LAB. ***
// See modeDistinct.mjs for why deviceModes.mjs could not catch this: it reads declarations and never calls
// build(), and a declaration cannot tell you whether two names run the same experiment.
//
// MEASURED at v4190: 101 devices checked, 7 unreached inside the budget, 0 threw, TEN duplicate pairs across
// eight devices. In every one of them the numbers are CORRECT -- the device computes all its observables in a
// single run and hands the same bag to more than one name -- so this is a defect of DECLARATION, not of
// physics, and the baseline below records each with the reason it exists rather than demanding eight rewrites.
//
// *** THE ASSERTION THAT MATTERS MOST IS THE ONE THAT PASSES TODAY: NO DUPLICATE PAIR INVOLVES A PLANT MODE.
// *** A plant that reads identical to its baseline appears to fire and changes nothing -- v3806 lost a round
// to exactly that on flip2d, where a validator silently reverted the plant and both arms returned the same
// number. That cannot be caught by reading either file; it needs this comparison. It holds today and this
// line is what keeps it holding.

import * as D from "./devices.mjs";
import { duplicateModes, pairKey } from "./modeDistinct.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// *** EVERY ENTRY CARRIES A REASON, AND THE REASON IS THE MODE LIST AGAINST THE BRANCHES build() ACTUALLY
// TAKES. *** A one-word entry would be a suppression wearing an explanation (knobLiveness's STILL_OK rule).
const KNOWN = {
    // DOCUMENTED IN THE BIND ITSELF at v4087, and left deliberately: `conserve` is cited BY NAME as the
    // conservation entry point in predictions.html, physics-lab.html and instruments.mjs, so collapsing it
    // into `period` is a cross-file API change. The bind says so where a reader will find it.
    "figureeight:period==conserve":
        "documented in figureEightBind at v4087; `conserve` is cited by name by three other files",

    // ONE EXPERIMENT, TWO QUESTIONS. The branch is literally `mode === "roughness" || mode === "complete"`:
    // one 12-run sweep over four amplitudes and three starts answers both, and fieldNav-selfcheck reads a
    // DISJOINT set of fields from each name (complete -> allArrived/looped, roughness ->
    // bestExcess/worstExcess/degradesWithRoughness). Correct numbers under both names.
    "fieldnav:roughness==complete":
        "shared `roughness || complete` branch; the selfcheck reads disjoint fields from each name",

    // build() BRANCHES ON `halfscale` AND NOTHING ELSE. absolute, parseval and roundtrip are three names for
    // one computation that reports all three keys at once -- so all three pair with each other.
    "fft:absolute==parseval":  "fftBind branches only on `halfscale`; the other three names share one run",
    "fft:absolute==roundtrip": "fftBind branches only on `halfscale`; the other three names share one run",
    "fft:parseval==roundtrip": "fftBind branches only on `halfscale`; the other three names share one run",

    // build() branches on `mirror` and `nosqrt`; relax and momentum both take the fallthrough.
    "thermostat:relax==momentum":
        "thermostatBind branches on `mirror` and `nosqrt` only; relax and momentum share the fallthrough",

    // build() branches on `svd` and `nofp` (keepPlastic); split and clamp both take the fallthrough.
    "mpmplastic:split==clamp":
        "mpmPlasticBind branches on `svd` and `nofp` only; split and clamp share the fallthrough",

    // withElastic keys off `noelastic`, plastic off `elastic`/`noelastic`; energy and settle give the same pair.
    "mpmcolumn:energy==settle":
        "mpmColumnBind keys only off `elastic`/`noelastic`; energy and settle produce the same run",

    // the floor offset keys off `edgefloor` alone; slide and mass both use the configured lo.
    "mpmmomentum:slide==mass":
        "mpmMomentumBind keys only off `edgefloor`; slide and mass both run at the configured floor",

    // *** NOT A DUPLICATE, AND THE ONLY ENTRY HERE THAT IS LEGITIMATE RATHER THAN RECORDED. *** vessels and
    // depth return identical OBSERVABLES and differ in the CLAIM freeSurfaceDefaults attaches -- gapEnvelope
    // against depthErrFrac -- so the mode selects which observable is adjudicated, not what is computed. The
    // sweep compares output bags and cannot see a hypothesis, which is stated in modeDistinct.mjs's header.
    "freesurface:vessels==depth":
        "LEGITIMATE: distinguished by h.claim (gapEnvelope vs depthErrFrac), which is not in the output bag",
};

const BUDGET_MS = 6000;
const t0 = Date.now();
const r = await duplicateModes(D, { budgetMs: BUDGET_MS });
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`1. THE SWEEP  (${r.checked.length} devices checked, ${r.unreached.length} unreached, ${elapsed}s)`);
{
    ok("!! the sweep is not vacuous -- it built and compared real devices",
        r.checked.length > 80,
        `${r.checked.length} devices with two or more declared modes were built in every mode and compared. ` +
        "A gate over an empty set passes forever and proves nothing");

    ok("!! ...and nothing threw, so every comparison is between two real readings",
        r.threw.length === 0,
        r.threw.length ? "THREW: " + r.threw.join(", ") : "0 build failures across the sweep");
}

console.log("\n2. *** NO DUPLICATE PAIR INVOLVES A PLANT MODE ***");
{
    const plantDupes = r.pairs.filter((p) => p.involvesPlant);
    ok("!! *** A PLANT THAT READS IDENTICAL TO ITS BASELINE FIRES AT NOTHING ***",
        plantDupes.length === 0,
        plantDupes.length
            ? "PLANT PAIR: " + plantDupes.map(pairKey).join(", ") + " -- the plant and the mode it is compared " +
              "against return the same observables, so the census reads a separation that does not exist"
            : `none of ${r.pairs.length} duplicate pairs touches a declared plantMode. v3806 lost a round to a ` +
              "validator that silently reverted its plant: both arms read an IDENTICAL number and the plant " +
              "appeared to fire. THIS IS THE LINE THAT WOULD CATCH THAT, and it cannot be caught by reading " +
              "either file -- only by building both arms and comparing them");
}

console.log("\n3. THE RATCHET -- names, not a count");
{
    const found = new Set(r.pairs.map(pairKey));
    const arrived = [...found].filter((k) => !(k in KNOWN));
    // A baselined pair whose device could not be built inside the budget is UNCONFIRMED, not fixed: calling it
    // stale would delete a real entry on the strength of a timeout. Staleness is judged over CHECKED devices only.
    const checkedSet = new Set(r.checked);
    const stale = Object.keys(KNOWN).filter((k) => !found.has(k) && checkedSet.has(k.split(":")[0]));

    ok("!! *** NO DEVICE NEWLY GAINS A MODE THAT MEASURES NOTHING NEW ***",
        arrived.length === 0,
        arrived.length
            ? "NEWLY DUPLICATED: " + arrived.join(", ") + " -- a declared mode whose output is identical to " +
              "another's is a MODE IN NAME ONLY (v3194): it inflates the mode count and gives the census a " +
              "second arm that measures nothing"
            : `${found.size} of ${Object.keys(KNOWN).length} baselined pairs still present, none new`);

    ok("...and the baseline is not stale -- every recorded pair is still genuinely identical",
        stale.length === 0,
        stale.length
            ? "STALE, DELETE THEM: " + stale.join(", ") + " -- a baseline entry whose reason has expired is a " +
              "ratchet holding nothing (v3195)"
            : "every entry whose device was reached is still a real duplicate");

    ok("!! every baseline entry carries a REASON, not a label",
        Object.values(KNOWN).every((v) => typeof v === "string" && v.length > 40),
        `${Object.keys(KNOWN).length} entries, each naming the branches build() actually takes. A one-word ` +
        "reason is a suppression wearing an explanation");
}

console.log("\n4. WHAT THE SWEEP COULD NOT AFFORD, REPORTED RATHER THAN SKIPPED");
{
    ok("!! *** THE UNREACHED SET IS A RESULT, NOT AN OMISSION ***",
        Array.isArray(r.unreached),
        (r.unreached.length ? "NOT REACHED in " + BUDGET_MS + "ms each: " + r.unreached.join(", ") : "all reached") +
        ". twof alone is 92.5s PER BUILD, measured -- so a sweep that quietly dropped it would report 'no " +
        "duplicates' over a set it never opened. A ZERO MEANS 'NONE FOUND IN WHAT WAS OPENED', NEVER 'NONE' " +
        "(knobLiveness v4042), which is why these are named here rather than absent");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the eight baselined devices are wrong. In every case the NUMBERS ARE CORRECT: the device computes " +
    "all of its observables in one run and returns the same bag under more than one name, so a caller asking " +
    "for either name gets a right answer. What is overstated is the DECLARATION -- the lab reports more " +
    "distinct experiments than it runs -- and collapsing the names is a cross-file API change per device, " +
    "which is why they are recorded here rather than rewritten in one round.");

console.log();
if (fails) { console.log("modeDistinct-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("modeDistinct-selfcheck: all checks pass");
