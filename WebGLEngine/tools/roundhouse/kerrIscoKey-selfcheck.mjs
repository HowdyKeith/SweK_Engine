// tools/roundhouse/kerrIscoKey-selfcheck.mjs
//
// Run: node tools/roundhouse/kerrIscoKey-selfcheck.mjs   (~0.2s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3095 -- kerr's FIRST GRADED QUANTITY AT GENERAL SPIN.
//
// v3094 audited what this device grades itself against and found nothing usable once the hole is rotating:
//   horizonSumErr    asks whether r+ + r- equals 2M. (M+s) + (M-s) is 2M for ANY s, so it is blind to the
//                    discriminant entirely -- a horizon at zero passes it. Exactly 0.000e+0, always.
//   horizonProductErr does constrain the discriminant, but is graded against its own closed form, so it returns
//                    machine epsilon and grades the arithmetic rather than the physics.
//   schwarz*Err x3   live only in mode "limit", which FORCES a = 0, and each returns exactly zero because the
//                    Kerr expressions reduce algebraically at that point.
// FIVE ERROR FIELDS, NONE OF THEM A MEASUREMENT OF A ROTATING BLACK HOLE. And v3094's own audit only saw two of
// the five, because it sampled the DEFAULT mode -- a census reporting on what it happened to sample, which is
// the same shape it was written to catch.
//
// isco() is the Bardeen-Press-Teukolsky closed form, a root of the marginal-stability condition written through
// Z1 and Z2 with their cube roots. Nothing graded it. iscoNumeric finds the SAME radius from a different
// direction: the ISCO is the innermost stable circular equatorial orbit, so it is where the orbit's specific
// energy stops falling and turns. E(r) is a conserved quantity of the orbit, not a rearrangement of the
// stability polynomial -- the two share no algebra beyond the metric they both describe.
//
// WHY 1e-8 IS THE RIGHT ANSWER AND 1e-16 WOULD BE THE ALARMING ONE. Near a minimum E(r) is quadratic, so the
// POSITION of that minimum is only recoverable to about sqrt(eps) no matter how good the search is -- a floor
// every minimum-finder has. Agreement at machine precision would mean the two routes were not independent after
// all, which is exactly the round-trip tautology the other four checks fell into. THE EPSILON ANSWER IS THE
// TELL; this one correctly declines to give it.

import { getDevice } from "./devices.mjs";
import { isco, iscoNumeric } from "../../physics/blackhole/kerr.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dev = await getDevice("kerr");
const SPINS = [0, 0.3, 0.6, 0.9, 0.99];

// ---- 1. THE TWO ROUTES AGREE ACROSS THE SPIN RANGE -------------------------------------------------------------
let worst = 0, best = 1;
{
    for (const a of SPINS) {
        const o = await dev.build({ config: { M: 1, a } });
        worst = Math.max(worst, o.iscoErrFrac); best = Math.min(best, o.iscoErrFrac);
    }
    ok("!! the closed form and the energy minimum agree across spin 0 to 0.99",
        worst < 1e-6,
        "worst relative disagreement " + worst.toExponential(2) + " over prograde AND retrograde at " +
        SPINS.length + " spins. Two routes with no shared algebra beyond the metric");
    ok("!! ...and NOT at machine precision, which is what makes it a measurement",
        best > 1e-12,
        "best " + best.toExponential(2) + ". E(r) is quadratic at its minimum, so the POSITION is recoverable " +
        "only to about sqrt(eps) -- a floor every minimum-finder has. An epsilon answer here would mean the two " +
        "routes were secretly one, which is precisely what the other four kerr checks are");
    ok("the Schwarzschild value falls out rather than being asserted",
        Math.abs(iscoNumeric(1, 0, true) - 6) / 6 < 1e-6 && isco(1, 0, true) === 6,
        "a = 0 gives 6M from both directions. NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST -- here 6M " +
        "is the textbook number both routes must independently produce, not a constant either one was handed");
}

// ---- 2. SABOTAGE, BOTH DIRECTIONS -------------------------------------------------------------------------------
// A check that only ever sees correct input proves nothing. Corrupt each route in turn; the error must move.
{
    // (a) corrupt the CLOSED FORM by comparing the numeric prograde ISCO against the RETROGRADE closed value.
    // These are the two branches of one formula, differing only by the sign of the spin term -- exactly where a
    // sign slip would live, and a device that got one branch right could otherwise hide behind the other.
    const a = 0.6;
    const wrongBranch = Math.abs(iscoNumeric(1, a, true) - isco(1, a, false)) / isco(1, a, false);
    ok("!! SABOTAGE: grading prograde against the RETROGRADE closed form is caught",
        wrongBranch > 0.1,
        "relative " + wrongBranch.toFixed(3) + " at a = " + a + " -- " +
        Math.round(wrongBranch / worst) + "x the honest residual. A sign slip on the spin term cannot pass");

    // (b) corrupt the NUMERIC route by handing it the wrong spin. If the energy function ignored a, every
    // agreement above would be an accident of Schwarzschild rather than evidence about rotation.
    const wrongSpin = Math.abs(iscoNumeric(1, 0, true) - isco(1, 0.6, true)) / isco(1, 0.6, true);
    ok("...and so is an energy function that ignores the spin",
        wrongSpin > 0.1,
        "relative " + wrongSpin.toFixed(3) + " -- the numeric route genuinely depends on a, so the agreement " +
        "above is about a ROTATING hole and not about the a = 0 case leaking through");
}

// ---- 3. WHAT THIS DOES AND DOES NOT REPLACE ----------------------------------------------------------------------
{
    const o = await dev.build({ config: { M: 1, a: 0.6 } });
    ok("horizonSumErr is still exactly zero, and is still not a measurement",
        o.horizonSumErr === 0,
        "left in place because removing it would lose the record of what it is. It grades nothing; the entry " +
        "in v3094's changelog says so, and this check keeps that statement true rather than remembered");
    ok("!! kerr now has ONE graded quantity that can fail at general spin",
        Number.isFinite(o.iscoErrFrac) && o.iscoErrFrac > 0,
        "iscoErrFrac = " + o.iscoErrFrac.toExponential(3) + " at a = 0.6. One is not many -- photonPrograde, " +
        "ergoThickness, shadowAsymmetry, omegaHorizon and the frame-dragging pair are all still ungraded, and " +
        "each would need its own second route rather than another rearrangement of the first");
}

console.log();
if (fails) { console.log("kerrIscoKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("kerrIscoKey-selfcheck: all checks pass");
