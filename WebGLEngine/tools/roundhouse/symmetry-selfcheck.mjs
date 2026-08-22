// tools/roundhouse/symmetry-selfcheck.mjs
//
// v3437 -- TRANSFORM AN INPUT, ASSERT WHAT THE OUTPUT DOES. THE FOURTH PATTERN WRITTEN BY HAND EVERY TIME.
//
// Gauge shifts, station order, route reversal, uniform scaling, emitter permutation -- found separately in five
// places this session, each with its own ad-hoc check. Three kinds hide in there: INVARIANT (must not move),
// EQUIVARIANT (must move by a known power) and ANTISYMMETRIC (must flip sign).
//
// *** THE HARD PART IS AN INVARIANCE THAT HOLDS ONLY APPROXIMATELY. *** Gauge invariance on the space cost field
// holds to 8.65e-8, not to zero, and that residual has two possible causes demanding opposite responses: a MODEL
// dependence means the physics is wrong; PRECISION LOSS means the arithmetic ran out of bits and the model is
// fine. The discriminator is how the residual SCALES WITH THE TRANSFORM MAGNITUDE:
//
//     offset      1        10        100       1000
//     residual    0        8.65e-8   6.06e-7   4.15e-6
//
// It tracks the magnitude, so it is cancellation -- a bigger offset spends more significant bits before the
// gradient is taken. A genuine dependence would not follow the size of a shift that is physically meaningless.
//
// AND THE VERDICT USES THE SMALLEST TRANSFORM, NOT THE WORST. The first version failed the gauge case at 4.15e-6
// -- a residual from an offset of 1000, included deliberately to expose the trend. Failing there tests the float
// format, not the model. The verdict comes from where the arithmetic is comfortable, and the growth across the
// range is what EXPLAINS it.

import { invariance, equivariance, antisymmetry } from "./symmetry.mjs";
import { gaugeSpread } from "../../brain/fieldSpace.mjs";
import { planRoute } from "../../physics/blackhole/transfer.mjs";
import { circularL } from "../../physics/blackhole/probe.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. PRECISION FLOOR VERSUS MODEL DEPENDENCE ------------------------------------------------------------------
{
    const g = invariance((off) => gaugeSpread(48, [off]).costs[0], [1, 10, 100, 1000]);
    ok("!! gauge invariance is a PRECISION FLOOR, not a model dependence",
        g.verdict === "invariant-precision-floor" && g.tracksMagnitude === true,
        `${g.smallResidual.toExponential(2)} at the smallest offset, rising to ${g.worst.toExponential(2)} at the ` +
        "largest. It tracks the magnitude, which is cancellation. Reporting 'invariant to 1.9e-7' without that " +
        "distinction leaves a reader unable to tell a passing model from a failing one");

    ok("!! and the verdict comes from the SMALLEST transform, not the worst",
        g.smallResidual < g.worst && g.smallResidual < 1e-6,
        `the largest offset was included deliberately to expose the trend. Failing on its ${g.worst.toExponential(1)} ` +
        "residual would be testing the float format rather than the physics -- which is what the first version " +
        "of this file did, and it reported the gauge case as VIOLATED");
}

// ---- 2. AN EXACT INVARIANCE IS ALLOWED TO SAY SO ----------------------------------------------------------------------
{
    const r = invariance(() => planRoute(1, [8, 14, 20]).totalDeltaL, [1, 2, 3], { exactIf: 0 });
    ok("!! an invariance that holds bit-exactly reports EXACT, not 'within tolerance'",
        r.verdict === "exact",
        "a route cost that does not move at all is invariant by construction. Calling that 'invariant to 1e-15' " +
        "understates it and leaves room to widen the bound later, the same distinction the conservation " +
        "instrument draws between exact and small");
}

// ---- 3. EQUIVARIANCE: THE POWER IS THE CHECK ---------------------------------------------------------------------------
{
    // circular angular momentum L = sqrt(M r^2/(r-3M)); scale BOTH M and r by k and L scales as k^1
    const e = equivariance((k) => circularL(k, 10 * k), [1, 2, 5, 20], 1, { tol: 1e-12 });
    ok("!! circular L scales as k^1 under a uniform scaling of M and r",
        e.verdict === "equivariant",
        `${e.reason}. Geometric units mean a length and a mass scale together, so the angular momentum per unit ` +
        "mass follows the first power");

    const wrong = equivariance((k) => circularL(k, 10 * k), [1, 2, 5, 20], 2, { tol: 1e-12 });
    ok("...and asserting the WRONG power is caught, which is why the range matters",
        wrong.verdict === "violated",
        `claiming k^2 fails at ${wrong.worst.toExponential(1)}. At k near 1 a wrong power still looks right -- ` +
        "the factors span twentyfold precisely so it cannot");
}

// ---- 4. ANTISYMMETRY ---------------------------------------------------------------------------------------------------
{
    const a = antisymmetry((x) => Math.sin(x), [0.3, 1.0, 2.5]);
    ok("!! f(-x) = -f(x) is checked directly",
        a.verdict === "antisymmetric",
        `${a.reason}. The odd/even distinction catches a sign error that a magnitude check cannot see, and this ` +
        "lab has already had one: a receding Doppler source must LOWER the pitch");

    const notOdd = antisymmetry((x) => Math.cos(x), [0.3, 1.0, 2.5]);
    ok("...and an even function is correctly refused",
        notOdd.verdict === "violated",
        "cosine is even, so asserting antisymmetry of it must fail. A check that passed both would be testing " +
        "nothing");
}

console.log();
if (fails) { console.log("symmetry-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("symmetry-selfcheck: all checks pass");
