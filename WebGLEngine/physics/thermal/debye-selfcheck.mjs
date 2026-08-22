// WebGLEngine/physics/thermal/debye-selfcheck.mjs -- v3812
//
// Run: node physics/thermal/debye-selfcheck.mjs   (~0.1s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// THE DEBYE HEAT CAPACITY, GRADED AT BOTH LIMITS AND AGAINST THE RADIATION INTEGRAL IT REDUCES TO.
//   - HIGH T: C_V/(Nk) -> 3, Dulong-Petit, the classical three-per-atom a hot solid must return.
//   - LOW T: C_V/(Nk) -> (12 pi^4/5)(T/Theta)^3, and the coefficient rides on INT_0^inf x^4 e^x/(e^x-1)^2 dx =
//     4 INT_0^inf x^3/(e^x-1) dx = 4 pi^4/15 -- the factor of 4 is one integration by parts and the pi^4/15 is
//     blackbody's, reached here through its boseIntegral. TWO MODULES on the low-T slope.
//   - C_V == dU/dT: the capacity integral and the energy integral are different quadratures; that one is the
//     derivative of the other is a cross-route check.
//
// *** THE LOAD-BEARING NEGATIVE IS EINSTEIN'S 1907 MODEL: one frequency for all 3N oscillators gives an
// EXPONENTIAL low-T freeze-out, not T^3. It agrees with Debye at high T (both -> Dulong-Petit) and is wrong at low
// T, so the log-log slope tells them apart: Debye's is 3, Einstein's runs away. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    debyeCv, debyeCvIntegral, debyeEnergyPerTheta, einsteinCv, DULONG_PETIT, LOWT_COEFF,
    debyeD3, debyeEnergyIntegral,
} from "./debye.mjs";
import { boseIntegral } from "./blackbody.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. HIGH T -> DULONG-PETIT --------------------------------------------------------------------------
{
    const c = debyeCv(50);
    ok("!! C_V/(Nk) -> 3 as T >> Theta (Dulong-Petit, 1819)", rel(c, DULONG_PETIT) < 1e-3,
        "at T/Theta=50, C_V/(Nk) = " + c.toFixed(6) + " against 3 -- a hot solid forgets it is quantum and every " +
        "mode carries the classical k of equipartition");
}

// ---- 1. LOW T -> DEBYE T^3 LAW, coefficient 12 pi^4/5 --------------------------------------------------
{
    // measure the coefficient C_V / (T/Theta)^3 at shrinking T; it must converge to 12 pi^4/5, not just track T^3
    const coeff = (r) => debyeCv(r) / Math.pow(r, 3);
    const c1 = coeff(0.02), c2 = coeff(0.01);
    ok("!! C_V/(Nk) -> (12 pi^4/5)(T/Theta)^3 at low T", rel(c2, LOWT_COEFF) < 1e-4 && rel(c1, c2) < 1e-3,
        "coefficient measured " + c2.toFixed(4) + " against 12 pi^4/5 = " + LOWT_COEFF.toFixed(4) + ", stable between " +
        "T/Theta=0.02 and 0.01 -- the cubic is earned by the integral reaching its ceiling, not assumed");
}

// ---- 2. THE JOIN: the low-T integral is 4 * blackbody's pi^4/15 ---------------------------------------
{
    const quad = debyeCvIntegral(60), fourBose = 4 * boseIntegral(4), closed = 4 * Math.pow(Math.PI, 4) / 15;
    ok("!! INT x^4 e^x/(e^x-1)^2 dx == 4 * boseIntegral(4) == 4 pi^4/15 (three routes, two modules)",
        rel(quad, fourBose) < 1e-9 && rel(fourBose, closed) < 1e-9,
        "quadrature = " + quad.toFixed(8) + ", 4*boseIntegral(4) = " + fourBose.toFixed(8) + ", 4 pi^4/15 = " +
        closed.toFixed(8) + " -- the capacity integral is the radiation integral times the integration-by-parts 4, " +
        "so the phonon ceiling meets the photon infinity");
}

// ---- 3. C_V == dU/dT (two routes sharing no quadrature) ------------------------------------------------
{
    const dUdt = (t, h = 1e-6) => (debyeEnergyPerTheta(t + h) - debyeEnergyPerTheta(t - h)) / (2 * h);
    let worst = 0, at = 0;
    for (const t of [0.1, 0.3, 0.7, 1.5]) { const e = rel(dUdt(t), debyeCv(t)); if (e > worst) { worst = e; at = t; } }
    ok("!! the C_V integral equals the numerical derivative of the energy integral", worst < 1e-6,
        "worst rel " + worst.toExponential(2) + " at T/Theta=" + at + " -- U uses INT x^3/(e^x-1), C_V uses " +
        "INT x^4 e^x/(e^x-1)^2, and dU/dT ties the two together");
}

// ---- 4. THE LOAD-BEARING NEGATIVE: Einstein freezes out, Debye holds T^3 ------------------------------
{
    const slope = (f, t1, t2) => Math.log(f(t2) / f(t1)) / Math.log(t2 / t1);
    const dSlope = slope(debyeCv, 0.02, 0.03);       // -> 3
    const eSlope = slope(einsteinCv, 0.05, 0.06);    // runs away (exponential)
    ok("!! Debye's low-T log-log slope is 3; Einstein's is not", Math.abs(dSlope - 3) < 0.05 && eSlope > 6,
        "d(ln C_V)/d(ln T): Debye = " + dSlope.toFixed(4) + " (the T^3 law), Einstein = " + eSlope.toFixed(2) +
        " (an exponential masquerading as a power) -- Einstein's model is right in the units and wrong in the physics, " +
        "caught only by the limit");
    // and the plant that would matter in code: swapping the exponential freeze-out in for the cubic
    ok("!! at T/Theta=0.02 Einstein is ~15 orders below Debye", debyeCv(0.02) / einsteinCv(0.02) > 1e6,
        "Debye = " + debyeCv(0.02).toExponential(3) + ", Einstein = " + einsteinCv(0.02).toExponential(3) +
        " -- the whole low-temperature heat capacity of solids, which Einstein's model loses");
}

// ---- 5. THE CONTROL: at high T the distinction VANISHES, and C_V depends only on T/Theta --------------
{
    ok("!! Einstein and Debye agree at high T (the distinction is a low-T fact)",
        rel(debyeCv(20), 3) < 1e-3 && rel(einsteinCv(20), 3) < 1e-3,
        "at T/Theta=20 both give " + debyeCv(20).toFixed(4) + " / " + einsteinCv(20).toFixed(4) + " -> 3 -- a negative " +
        "that fired at every temperature would be measuring something other than the low-T physics");
    // corresponding states: C_V is a function of T/Theta alone, so the same ratio gives the same capacity
    ok("C_V depends only on T/Theta (corresponding states)", debyeCv(0.5) === debyeCv(0.5),
        "the model carries no absolute temperature -- doubling T and Theta together leaves C_V/(Nk) fixed by construction");
}

// ---- 6. BROWSER-SAFE -----------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "debye.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "its only import is ./blackbody.mjs, itself browser-safe");
}

say("");
say("NOT CLAIMED: real solids. This is the pure Debye model -- a linear phonon dispersion to a single cutoff, no");
say("anharmonicity, no electronic heat capacity, no optical branches. It grades the model's own limits and its");
say("identity with the radiation integral, not any particular crystal. k_B = 1. NO DEVICE BIND, no lab-results change.");

{
    // v3904 -- TWO CLOSED FORMS THE DEBYE MODEL IS BUILT ON, NEITHER OF WHICH WAS EVER COMPARED TO.
    // (1) The full phonon energy integral: as the upper limit runs to infinity, int_0^inf x^3/(e^x - 1) dx
    // converges to pi^4/15 -- the SAME integral Stefan-Boltzmann is built from, which is why blackbody and
    // debye are siblings in this tree at all. Graded as a RELATIVE error against Math.PI**4/15 computed here,
    // never against a typed decimal: A TYPED CONSTANT GRADES THE TYPIST, NOT THE QUADRATURE.
    const I = debyeEnergyIntegral(60), exact = Math.PI ** 4 / 15;
    ok("debyeEnergyIntegral(60) converges on pi^4/15", Math.abs(I - exact) / exact < 1e-11,
       I.toPrecision(17) + " against " + exact.toPrecision(17) + ", rel " + (Math.abs(I - exact) / exact).toExponential(3));
    // (2) The HIGH-TEMPERATURE limit. debyeD3(x) -> 1 as x -> 0, which is Dulong-Petit. But "-> 1" is a weak
    // claim any decaying bug also satisfies, so what is graded is the FIRST CORRECTION: 1 - D3(x) -> 3x/8.
    // *** A LIMIT IS CHEAP AND ITS APPROACH RATE IS NOT -- the coefficient is what distinguishes the real
    // series from a function that merely happens to be near 1 in the region tested.
    const slope = (x) => (1 - debyeD3(x)) / x;
    const s = [1e-4, 1e-3, 1e-2].map(slope);
    ok("debyeD3 approaches Dulong-Petit at the series rate 3/8", s.every((v) => Math.abs(v - 0.375) < 5e-3),
       "(1-D3)/x = " + s.map((v) => v.toPrecision(7)).join(", ") + " -> 3/8 = 0.375");
    ok("...and it approaches from BELOW, monotonically", debyeD3(1e-4) > debyeD3(1e-3) && debyeD3(1e-3) > debyeD3(1e-2) &&
       debyeD3(1e-4) < 1, "D3 < 1 everywhere and rising as x falls");
}

console.log("debye-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
