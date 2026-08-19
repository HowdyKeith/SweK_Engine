// WebGLEngine/tools/roundhouse/twoKeyPlants-selfcheck.mjs -- v3392
//
// *** TWO DEVICES, TWO KEYS EACH, AND IN BOTH CASES ONE KEY CANNOT SEE THE PLANT AT ANY SIZE. ***
//
// The tree had already MEASURED both blindnesses and left them as comments:
//
//   v3200, inspiral: "a wrong power law integrated against its own matching closed form returns 1.695e-8 vs
//                     the correct pair's 6.406e-9 -- same order, so a wrong LAW is invisible."
//   v3299, kerr:     "horizonSumErr holds for ANY discriminant (it tests nothing)."
//
// A COMMENT IS NOT A MEASUREMENT ANYBODY CAN RE-RUN. This makes both numbers, and the numbers turn out sharper
// than the comments: inspiral's blind key does not merely miss the wrong law, it can SCORE THE WRONG LAW BETTER
// THAN THE RIGHT ONE, so tuning against it walks away from the truth. And kerr's blind key is blind by
// CONSTRUCTION rather than by tolerance -- (M+s) + (M-s) - 2M is zero for any s whatever, so no plant of that
// shape at any magnitude can move it.
//
// *** SO THE PLANT'S REAL JOB HERE IS NOT TO GRADE THE DEVICE. IT IS TO TELL A REAL KEY FROM A TAUTOLOGICAL
// ONE, USING THE SAME RUN. *** That is a use for plantedError that v2893 did not name, and it is cheaper than
// the errorPairAudit that found the same thing by reading algebra.
"use strict";
import { getDevice } from "./devices.mjs";
import { integrateInspiral } from "../../physics/orbits/inspiral.js";
import { horizons } from "../../physics/blackhole/kerr.js";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// AWAITED THROUGHOUT: several device builds are declared async, and a harness that read an observable off a
// PROMISE would measure undefined and report every plant blind -- which is precisely what the first run of
// plantedError.mjs did, and what the first run of THIS file did too. Fifth instance of writing against an
// assumed signature; caught by running it, not by reading it.
// ---- 1. THE NULL TEST, BOTH DEVICES ------------------------------------------------------------------------
const insp = await getDevice("inspiral");
const kerr = await getDevice("kerr");
{
    const i0 = await insp.build({ mode: "merger" });
    const k0 = await kerr.build({ mode: "spin", config: { M: 1, a: 0.6 } });
    ok("!! an unperturbed run trips nothing on either device",
        i0.mergerErrFrac < 1e-6 && k0.horizonProductErr < 1e-12 && k0.horizonSumErr === 0 &&
        i0.planted === false && k0.planted === false,
        "inspiral mergerErrFrac " + i0.mergerErrFrac.toExponential(3) + ", a0 exponent " +
        i0.a0Exponent.toFixed(9) + "; kerr productErr " + k0.horizonProductErr.toExponential(2) +
        ", sumErr " + k0.horizonSumErr + ". Every floor below is meaningless without this");
}

// ---- 2. INSPIRAL: THE RESIDUAL IS BLIND, AND WORSE THAN BLIND ----------------------------------------------
{
    const rows = [2, 2.5, 3, 3.5, 4].map((p) => ({ p, r: integrateInspiral({ ratePower: p }) }));
    say("da/dt = -K/a^p:  " + rows.map(({ p, r }) => "p=" + p + " -> " + r.mergerErrFrac.toExponential(3)).join("  "));
    const truth = rows.find((x) => x.p === 3).r.mergerErrFrac;
    const worst = Math.max(...rows.map((x) => x.r.mergerErrFrac));
    ok("!! *** every wrong power law lands in the SAME ORDER as the right one -- the residual cannot see the law ***",
        worst / truth < 10 && rows.every(({ r }) => r.mergerErrFrac < 1e-7),
        "spread " + (worst / truth).toFixed(2) + "x across a doubling of the exponent, all of it below 2e-8. " +
        "mergerErrFrac compares an adaptive RK4 against THE MATCHING closed form, so the law cancels and what " +
        "is left grades the INTEGRATOR -- which is doing its job either way");
    const better = rows.filter((x) => x.p !== 3 && x.r.mergerErrFrac < truth);
    ok("!! *** AND A WRONG LAW SCORES BETTER THAN THE RIGHT ONE, so tuning against this number walks AWAY from the truth ***",
        better.length > 0,
        "p = " + better.map((x) => x.p).join(", ") + " beat p = 3 (" +
        better.map((x) => x.r.mergerErrFrac.toExponential(3)).join(", ") + " against " + truth.toExponential(3) +
        "). NOT MERELY UNINFORMATIVE -- ANTI-INFORMATIVE, which is a stronger statement than v3200's note made");
}

// ---- 3. INSPIRAL: THE SCALING KEY HAS UNIT GAIN AND A FLOOR AT THE ARITHMETIC -------------------------------
{
    const tAt = (a0, p) => integrateInspiral({ a0, ratePower: p }).mergerMeasured;
    const expo = (p) => Math.log(tAt(16, p) / tAt(8, p)) / Math.LN2;
    const base = expo(3);
    const deltas = [1e-2, 1e-4, 1e-6, 1e-8, 1e-10];
    const gains = deltas.map((d) => (expo(3 + d) - base) / d);
    say("t ~ a0^n measured from the integrator alone: n = " + base.toFixed(12) + " unperturbed, " +
        expo(4).toFixed(9) + " at p = 4");
    ok("!! *** the same run's OTHER key reads the planted exponent exactly, with GAIN 1 ***",
        Math.abs(base - 4) < 1e-9 && Math.abs(expo(4) - 5) < 1e-9 &&
        gains.every((g) => Math.abs(g - 1) < 0.01),
        "gain " + gains.map((g) => g.toFixed(6)).join(", ") + " for planted departures of " +
        deltas.map((d) => d.toExponential(0)).join(", ") + ". NOTHING ANALYTIC IS COMPARED AGAINST -- the " +
        "exponent comes from two runs and a ratio -- which is exactly why the plant cannot cancel out of it");
    ok("...so the detection floor is set by the arithmetic, not by the physics",
        Math.abs((expo(3 + 1e-10) - base) / 1e-10 - 1) < 0.01,
        "a planted departure of 1e-10 in the exponent still moves the measured exponent by 1e-10. TWO KEYS ON " +
        "ONE DEVICE: one blind at any size, one live to twelve decimal places");
}

// ---- 4. KERR: BLIND BY CONSTRUCTION, WHICH IS STRONGER THAN BLIND BY TOLERANCE ------------------------------
{
    const spins = [0, 0.2, 0.6, 0.9, 0.99, 1];
    const rows = spins.map((a) => ({ a, t: horizons(1, a), p: horizons(1, a, { planted: true }) }));
    const sumErr = (h) => Math.abs(h.outer + h.inner - 2);
    const prodErr = (h, a) => Math.abs(h.outer * h.inner - a * a);
    say("linearised discriminant M-|a| for sqrt(M^2-a^2):  " +
        rows.filter((r) => r.a > 0 && r.a < 1).map((r) => "a=" + r.a + " -> prodErr " + prodErr(r.p, r.a).toFixed(3)).join("  "));
    ok("!! *** horizonSumErr is EXACTLY ZERO under the plant at every spin -- it cannot fail, ever ***",
        rows.every((r) => sumErr(r.p) === 0 && sumErr(r.t) === 0),
        "(M+s) + (M-s) - 2M is zero for ANY s, so the discriminant never appears in it. NOT A TOLERANCE THAT " +
        "IS TOO LOOSE -- A QUANTITY THE ERROR CANNOT ENTER, and no larger plant of this shape would help");
    const worst = Math.max(...rows.map((r) => prodErr(r.p, r.a)));
    ok("!! and horizonProductErr, graded against a^2, catches it by fifteen orders",
        worst > 0.1 && rows.every((r) => prodErr(r.t, r.a) < 1e-15),
        "worst " + worst.toFixed(3) + " planted against " +
        Math.max(...rows.map((r) => prodErr(r.t, r.a))).toExponential(2) + " unplanted");
    ok("!! *** and the plant AGREES AT BOTH ENDPOINTS, which is why a spot check would have passed it ***",
        prodErr(rows[0].p, 0) === 0 && prodErr(rows[rows.length - 1].p, 1) === 0,
        "exact at a = 0 and at a = M, wrong everywhere between. Checking a non-spinning hole and an extremal " +
        "one -- the two cases anybody reaches for -- would have found nothing");
}

// ---- 5. THE PLANT IS SCOPED, AND THE SCOPE IS ASSERTED ------------------------------------------------------
{
    const a = await kerr.build({ mode: "spin", config: { M: 1, a: 0.6 } });
    const b = await kerr.build({ mode: "spin", config: { M: 1, a: 0.6, planted: true } });
    const moved = Object.keys(a).filter((k) => typeof a[k] === "number" && a[k] !== b[k]);
    ok("the kerr plant reaches the horizon pair and nothing else",
        moved.includes("horizonProductErr") && moved.includes("outerHorizon") && !moved.includes("iscoPrograde"),
        "moved: " + moved.join(", ") + ". The ISCO and the photon orbits are untouched, so this plant says " +
        "nothing about them and the coverage census counts them as unplanted");
    ok("...and the horizon is read from ONE place, so a planted run cannot report an unplanted number beside it",
        b.outerHorizon === horizons(1, 0.6, { planted: true }).outer &&
        a.outerHorizon === horizons(1, 0.6).outer,
        "the first version of this bind left outerHorizon on kerrSummary's copy while the product came from the " +
        "planted pair -- TWO DECLARATIONS ABOUT ONE NUMBER, inside the round about telling keys apart");
    const i = await insp.build({ mode: "merger", config: { planted: true } });
    ok("both devices REPORT the planted flag as an observable",
        i.planted === true && b.planted === true && i.ratePower === 4,
        "so no reader can mistake a planted run for a measurement");
}

console.log(failed ? "\n[twoKeyPlants-selfcheck] FAILED " + failed : "\n[twoKeyPlants-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
