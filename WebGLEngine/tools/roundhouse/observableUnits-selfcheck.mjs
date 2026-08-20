// tools/roundhouse/observableUnits-selfcheck.mjs
//
// v3430 -- 1129 DECLARED OBSERVABLES, NONE OF WHICH SAID WHAT THEY WERE MEASURED IN.
//
// The value-match census compares numbers and asks a PERSON whether two agreeing values are the same quantity.
// It had no way to ask whether they were even commensurable -- and a metre per second cannot equal a mass ratio
// however many digits agree.
//
// *** THE FIRST RUN RULED ZERO PAIRS INCOMPARABLE, WHICH IS THE FINDING. *** Name-based inference reached only a
// third of the observable surface: 67 of 100 matched names came back UNKNOWN, so almost no pair had both sides
// confidently typed. Inference is too thin on its own. Declaring the eleven untyped names that ACTUALLY APPEAR
// in the open backlog -- read off the census rather than guessed at -- took coverage to 79% and ruled out 11 of
// 36 open candidates.
//
// THE ASYMMETRY IS DELIBERATE. A wrong dimension that rejected a real coupling would be worse than the noise it
// removes, so this tool can only move a candidate from OPEN to REJECTED and never the reverse, and it needs TWO
// confident readings to do it. One unknown side and the pair stays open.

import { DIM, DECLARED, dimensionOf, comparable, unitCoverage } from "./observableUnits.mjs";
import { valueMatchCensus, ADJUDICATED } from "./valueMatch.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const cen = await valueMatchCensus();
const key = (h) => `${h.a.dev}/${h.a.mode}.${h.a.key}|${h.b.dev}/${h.b.mode}.${h.b.key}`;
const open = cen.matches.filter((h) => !ADJUDICATED[key(h)]);
const entries = cen.matches.flatMap((h) => [{ dev: h.a.dev, key: h.a.key }, { dev: h.b.dev, key: h.b.key }]);
const cov = unitCoverage(entries);

// ---- 1. IT FAILS SAFE: UNKNOWN NEVER MEANS DIMENSIONLESS ---------------------------------------------------------
{
    ok("!! an unrecognised observable is UNKNOWN, not dimensionless",
        dimensionOf("nosuch", "wibbleFlange").dim === DIM.UNKNOWN,
        "defaulting to dimensionless would let any unrecognised name match any ratio, which is the opposite of " +
        "conservative -- it would manufacture rejections AND false comparabilities at once");

    ok("!! a pair with one untyped side stays COMPARABLE",
        comparable("em", "cComputed", "nosuch", "wibbleFlange").comparable === true,
        "one confident reading is not enough to rule anything out. The tool can only ever move a candidate from " +
        "open to rejected, so an over-eager rejection would hide a real coupling permanently while an " +
        "over-cautious one merely leaves work for a person");

    ok("...and two confident, differing dimensions DO rule the pair out",
        comparable("em", "cComputed", "probe", "transferEcc").comparable === false,
        `a speed against a dimensionless eccentricity: ${comparable("em", "cComputed", "probe", "transferEcc").reason}`);
}

// ---- 2. EXPLICIT DECLARATION BEATS NAME INFERENCE -------------------------------------------------------------------
{
    ok("!! a declared observable reports source 'declared'",
        dimensionOf("em", "cComputed").source === "declared" && dimensionOf("em", "cComputed").dim === DIM.SPEED,
        "so a device can be made exact without waiting for all 66 to be updated, and a bad name pattern can " +
        "always be overridden rather than worked around");

    ok("...and inference still covers names that are unambiguous",
        dimensionOf("anything", "someErrFrac").dim === DIM.NONE &&
        dimensionOf("anything", "stepCount").dim === DIM.COUNT,
        "only patterns that cannot go either way are listed. A name that could plausibly be either is left to " +
        "fall through to UNKNOWN rather than guessed at");
}

// ---- 3. THE CENSUS BACKLOG ACTUALLY SHRINKS -------------------------------------------------------------------------
{
    const ruled = open.filter((h) => !comparable(h.a.dev, h.a.key, h.b.dev, h.b.key).comparable);
    ok("!! dimension rules out a real share of the open backlog",
        ruled.length >= 8,
        `${ruled.length} of ${open.length} open candidates are dimensionally impossible -- a spin period against ` +
        "a dimensionless threshold, a beam deflection against a mass ratio. Those needed a person before and now " +
        "need nobody");

    ok("!! and coverage is reported honestly rather than assumed",
        cov.declared + cov.inferred + cov.unknown === cov.total && cov.unknown > 0,
        `${cov.declared} declared, ${cov.inferred} inferred, ${cov.unknown} still unknown of ${cov.total}. The ` +
        "remaining unknowns are why this rules out 11 rather than all 18 name-pairs that LOOK incomparable -- " +
        "the crude first pass counted those by eye and this counts only what it can defend");
}

// ---- 4. WHAT THIS DOES NOT DO ----------------------------------------------------------------------------------------
{
    ok("!! same dimension does NOT mean same quantity",
        comparable("clocks", "periodPro", "pulsar", "P0").comparable === true,
        "an orbital period and a pulsar spin period are both seconds and have nothing to do with each other. " +
        "Dimension is a NECESSARY condition for a coupling, never a sufficient one -- this removes impossible " +
        "pairs and leaves every possible one for the adjudicator");

    ok("...and it would not have caught the sharpest fault in the lab",
        DECLARED["acoustics.cNewton"] === DECLARED["acoustics.cAir"],
        "Newton's isothermal sound speed is 15% wrong and DIMENSIONALLY PERFECT -- both are m/s. Units catch a " +
        "different class of error entirely, and a lab that added them and felt safer would be mistaken about " +
        "what it had bought");
}

console.log();
console.log(`  unit coverage: ${cov.declared} declared, ${cov.inferred} inferred, ${cov.unknown} unknown of ${cov.total}`);
if (fails) { console.log("observableUnits-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("observableUnits-selfcheck: all checks pass");
