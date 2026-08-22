// tools/roundhouse/limitReduction-selfcheck.mjs
//
// v3435 -- THE CHECK WRITTEN SIX TIMES BY HAND AND OVERCLAIMED TWICE.
//
// A general formula with a knob that, at one value, must reproduce a simpler known one: Kerr at a = 0 giving
// Schwarzschild, seismic Vp at mu = 0 giving the acoustic sound speed, Bateman at equal decay constants, FDTD
// at Courant 1. convergenceOrder already owns the limit that is APPROACHED, where the answer is a RATE. This
// owns the limit that is ATTAINED, where the value is reachable and the question is agreement AT it.
//
// *** THE FAILURE MODE IS OVERCLAIMING, NOT MISSING. *** The Kerr reduction is bit-identical at r = 6, 10 and 20
// -- so I asserted bit-identity, and the gate failed at r = 50. Running the instrument over a wider range finds
// TWO ULP at r = 50 and one more at r = 200 that I never tested by hand. The arithmetic never supported the
// claim; the three convenient sample points did.

import { attainedLimit, approachedLimit, ulpsApart } from "./limitReduction.mjs";
import { kerrCircularL } from "../../physics/blackhole/kerrLadder.mjs";
import { circularL } from "../../physics/blackhole/probe.js";
import { soundSpeedFluid } from "../../physics/acoustics/soundSpeed.mjs";
import { vP } from "../../physics/seismic/rays.mjs";
import { radialPeriodCoordinate } from "../../physics/blackhole/transfer.mjs";
import { radialOscillationPeriod } from "../../physics/blackhole/clocks.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE OVERCLAIM, CAUGHT ------------------------------------------------------------------------------------
{
    const r = attainedLimit((x) => kerrCircularL(1, 0, x, true), (x) => circularL(1, x), [6, 10, 20, 50, 200, 1000]);
    ok("!! the Kerr reduction is WITHIN ULPS, not bit-identical",
        r.verdict === "within-ulps" && r.worstUlps > 0 && r.worstUlps <= 4,
        `${r.worstUlps} ULP at r = ${r.worstAt}. Bit-identical at 6, 10 and 20 -- which is what I sampled and ` +
        "what I asserted. Over a wider range it is 2 ULP at 50 and 1 at 200, because the two expressions group " +
        "their multiplications differently and the last bit can land either way");

    ok("...and the wider range is what found it",
        r.rows.filter((x) => x.ulps > 0).length >= 2 && r.rows.slice(0, 3).every((x) => x.ulps === 0),
        "the first three points agree exactly and the later ones do not. Three convenient values are not a " +
        "range, and an instrument that took the caller's word for the sample set would have agreed with me");
}

// ---- 2. A REDUCTION THAT REALLY IS IDENTICAL -------------------------------------------------------------------------
{
    const r = attainedLimit((rho) => soundSpeedFluid(2.2e9, rho), (rho) => vP(2.2e9, 0, rho), [500, 1000, 2000, 5000, 13000]);
    ok("!! the acoustic/seismic reduction IS bit-identical, and is allowed to say so",
        r.verdict === "identical" && r.worstUlps === 0,
        "zero ULP at five densities spanning air to rock, because soundSpeedFluid CALLS vP -- one computation, " +
        "not two that agree. The instrument does not refuse to grant identity, it refuses to grant it on thin " +
        "evidence");

    ok("...and the ULP measure itself behaves",
        ulpsApart(1, 1) === 0 && ulpsApart(1, 1 + Number.EPSILON) === 1 && ulpsApart(1, 2) > 100,
        "zero for equal, one for adjacent doubles, large for genuinely different values. Relative error would " +
        "have called 2 ULP at r = 50 'agreement to 1e-16' and hidden the distinction this exists to draw");
}

// ---- 3. THE APPROACHED CASE DELEGATES RATHER THAN REIMPLEMENTS -----------------------------------------------------------
{
    const r0 = 10, exact = radialOscillationPeriod(1, r0);
    const a = approachedLimit(
        (e) => Math.abs(radialPeriodCoordinate(1, r0 * (1 - e), r0 * (1 + e)) - exact) / exact,
        [0.1, 0.05, 0.025, 0.0125], { expectOrder: 2 });
    ok("!! the transfer/epicyclic limit converges at order 2, fitted rather than eyeballed",
        a.order != null && a.matchesExpected === true,
        `fitted order ${a.order.toFixed(4)} against an expected 2, r-squared ${a.fit.r2.toFixed(6)}. Delegated to ` +
        "convergenceOrder rather than reimplemented -- that instrument already owned this half and duplicating " +
        "it would have been the mistake this lab keeps finding");

    ok("!! and the ORDER is the check, not the value",
        a.errors[a.errors.length - 1] < 1e-4 && a.order > 1.8,
        `the smallest-eccentricity error is ${a.errors[a.errors.length - 1].toExponential(2)}, which looks fine ` +
        "on its own. A wrong LINEAR term would produce an error that also looks fine at small knob while " +
        "converging at order 1 -- the value cannot tell those apart and the order can");
}

// ---- 4. A CORRECTION MADE WHILE BUILDING THIS ---------------------------------------------------------------------------
{
    ok("!! fitOrder returns the exponent as `p`, and this reads it rather than assuming `order`",
        approachedLimit((e) => e * e, [0.1, 0.05, 0.025], {}).order != null,
        "the first version looked for fit.order, got undefined, and reported 'could not fit an order' for a " +
        "clean 2.006 fit with an r-squared of 0.99998 -- a silent null dressed as a refusal, which is worse " +
        "than an error because it looks like a considered answer");
}

console.log();
if (fails) { console.log("limitReduction-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("limitReduction-selfcheck: all checks pass");
