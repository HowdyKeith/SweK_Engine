// WebGLEngine/physics/thermal/fermi-selfcheck.mjs -- v3815
//
// Run: node physics/thermal/fermi-selfcheck.mjs   (~0.5s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// THE DEGENERATE FERMI GAS, THE MIRROR OF bec.mjs, GRADED AT T = 0, AT LOW T, AND AGAINST ITS STATISTICS.
//   - THE FERMI INTEGRAL = Gamma(s) eta(s), the Bose integral's alternating twin (e^x+1 turns zeta into the
//     Dirichlet eta). Graded three ways: quadrature, Gamma*eta, and eta's own alternating sum. Half-integer s
//     needs the v3812 real-s zeta, exactly as BEC did.
//   - T = 0: <E> = 3/5 E_F and P = 2/5 n E_F, giving P = 2/3 U/V and the n^{5/3} polytrope that
//     physics/whiteDwarf.js's R ~ M^{-1/3} scaling rides on -- a cross-module join to the astrophysics.
//   - THE SOMMERFELD C_V/(Nk) = (pi^2/2)(T/T_F), LINEAR, its coefficient descended from pi^2/6 = zeta(2).
//
// *** THE LOAD-BEARING NEGATIVE: classical equipartition says the electronic heat capacity is a constant 3/2 Nk;
// it is measured ~1/100 of that at room temperature, and the Fermi linear-in-T law is why. It is the mirror of
// bec's negative -- there the classical gas would not CONDENSE, here it would not stay COLD. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    fermiIntegral, fermiIntegralClosed, etaDirichlet, fermiEnergyCoefficient, groundEnergyPerParticle,
    degeneracyPressure, POLYTROPE_EXPONENT, sommerfeldCoefficient, fermiCv, classicalCv, occupation,
    fermiFunction,
} from "./fermi.mjs";
import { gammaFn } from "../md/maxwellSpeed.mjs";
import { zeta } from "../zeta.js";
import { cvBelowTc } from "./bec.mjs";                 // the Bose sibling, for the statistics contrast
import { radiusSolar, chandrasekharMass } from "../whiteDwarf.js";   // the astrophysical consumer of the polytrope

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE FERMI INTEGRAL = Gamma(s) eta(s), three routes, half-integer s -------------------------------
{
    let worst = 0, at = 0;
    for (const s of [1.5, 2, 2.5, 3]) { const e = rel(fermiIntegral(s), fermiIntegralClosed(s)); if (e > worst) { worst = e; at = s; } }
    ok("!! INT x^{s-1}/(e^x+1) dx == Gamma(s) eta(s) (quadrature vs closed, incl s = 3/2, 5/2)", worst < 1e-9,
        "worst rel " + worst.toExponential(2) + " at s=" + at + " -- the alternating twin of the Bose integral; the " +
        "half-integer orders need the v3812 real-s zeta, and the e^x+1 denominator is the whole difference from blackbody's");
    ok("!! at s = 2 the Fermi integral is exactly pi^2/12", rel(fermiIntegral(2), Math.PI * Math.PI / 12) < 1e-9,
        "I(2) = " + fermiIntegral(2).toFixed(10) + " against pi^2/12 = " + (Math.PI * Math.PI / 12).toFixed(10) +
        " -- Gamma(2) eta(2) = 1 * (1/2) zeta(2)");
}

// ---- 1. THE DIRICHLET ETA: (1-2^{1-s}) zeta(s) == the alternating sum, with eta(1) = ln 2 ----------------
{
    const altSum = (s, N = 4000000) => { let a = 0; for (let n = N; n >= 1; n--) a += (n % 2 ? 1 : -1) / Math.pow(n, s); return a; };
    ok("!! eta(s) = (1-2^{1-s}) zeta(s) == sum (-1)^{n-1}/n^s", rel(etaDirichlet(2), altSum(2)) < 1e-6 && rel(etaDirichlet(3), altSum(3)) < 1e-8,
        "eta(2) = " + etaDirichlet(2).toFixed(9) + " vs alternating sum " + altSum(2).toFixed(9) + " -- the closed relation to " +
        "zeta and the raw alternating series agree, so the e^x+1 statistics really is Riemann's zeta with signs");
    ok("!! eta(1) = ln 2 (the alternating harmonic series, a removable 0*infinity)", rel(etaDirichlet(1), Math.LN2) < 1e-12,
        "eta(1) = " + etaDirichlet(1).toFixed(10) + " -- the prefactor vanishes as zeta(1) diverges, and the limit is ln 2");
}

// ---- 2. T = 0: the Fermi sphere filled solid ------------------------------------------------------------
{
    const EF = 1, n = 1;
    const uOverV = n * groundEnergyPerParticle(EF), P = degeneracyPressure(n, EF);
    ok("!! <E> = 3/5 E_F, P = 2/5 n E_F, and P = 2/3 U/V", groundEnergyPerParticle(EF) === 0.6 && P === 0.4 && rel(P, (2 / 3) * uOverV) < 1e-12,
        "<E>/E_F = 0.6, P/(n E_F) = 0.4, P/(U/V) = " + (P / uOverV).toFixed(6) + " = 2/3 -- degeneracy pressure survives to " +
        "absolute zero, the Pauli principle pushing where a classical gas at T=0 would exert nothing");
}

// ---- 3. THE POLYTROPE JOIN: P ~ n^{5/3} IS whiteDwarf's R ~ M^{-1/3} -------------------------------------
{
    const EFofN = (nn) => fermiEnergyCoefficient() * Math.pow(nn, 2 / 3);   // E_F ~ n^{2/3}
    const PofN = (nn) => degeneracyPressure(nn, EFofN(nn));
    const gammaSlope = Math.log(PofN(8) / PofN(2)) / Math.log(8 / 2);
    ok("!! P scales as n^{5/3} (the non-relativistic degenerate polytrope)", rel(gammaSlope, POLYTROPE_EXPONENT) < 1e-9,
        "d ln P/d ln n = " + gammaSlope.toFixed(6) + " = 5/3 -- E_F ~ n^{2/3} times the 2/5 n E_F pressure");
    // the JOIN: gamma = 5/3 is polytropic index n_p = 3/2, whose mass-radius law is R ~ M^{-1/3}. That is the
    // NON-RELATIVISTIC (small-M) limit of whiteDwarf.radiusSolar; near M_Ch its relativistic sqrt factor steepens
    // the slope past -1/3, which is precisely what drives the radius to zero at collapse. Read it off at small M.
    const Mch = chandrasekharMass();
    const rSlope = Math.log(radiusSolar(0.004) / radiusSolar(0.002)) / Math.log(0.004 / 0.002);
    ok("!! and that is exactly whiteDwarf's R ~ M^{-1/3} in the non-relativistic limit (5/3 -> index 3/2 -> -1/3)",
        Math.abs(rSlope - (-1 / 3)) < 0.01,
        "whiteDwarf.radiusSolar has log-log slope " + rSlope.toFixed(5) + " -> -1/3 for M << M_Ch = " + Mch.toFixed(3) +
        " (it steepens toward collapse near M_Ch); the microscopic n^{5/3} this file derives is the macroscopic scaling " +
        "that star assumes -- two modules, one polytrope");
}

// ---- 4. THE SOMMERFELD LINEAR HEAT CAPACITY -------------------------------------------------------------
{
    ok("!! C_V/(Nk) = (pi^2/2)(T/T_F), linear in T, coefficient pi^2/2", sommerfeldCoefficient() === Math.PI * Math.PI / 2 &&
        rel(fermiCv(0.01), (Math.PI * Math.PI / 2) * 0.01) < 1e-12 && rel(fermiCv(0.02) / fermiCv(0.01), 2) < 1e-12,
        "coefficient = " + sommerfeldCoefficient().toFixed(6) + " = pi^2/2, and C_V doubles when T does -- strictly linear, " +
        "because only electrons within ~kT of the Fermi surface (a fraction T/T_F) can be excited");
    ok("the Sommerfeld coefficient carries zeta(2) = pi^2/6", rel(zeta(2), Math.PI * Math.PI / 6) < 1e-12,
        "the expansion's leading term is (pi^2/6)(kT)^2 g(E_F), and pi^2/6 is zeta(2) -- the same constant the Basel problem names");
}

// ---- 5. THE LOAD-BEARING NEGATIVE: the classical electronic heat capacity is wrong by orders -------------
{
    const rApart = classicalCv() / fermiCv(0.001);
    ok("!! classical 3/2 Nk (constant) vs Fermi linear: ~300x apart at T/T_F = 0.001", classicalCv() === 1.5 && rApart > 100,
        "classical = 1.5 (T-independent), Fermi = " + fermiCv(0.001).toExponential(3) + ", a factor " + rApart.toFixed(0) +
        " -- the pre-quantum paradox of why a metal's 10^23 electrons barely warm it, resolved by Pauli and Fermi statistics");
    // the plant that matters: using the classical constant makes C_V independent of T, which the linear law never is
    ok("Fermi C_V vanishes as T -> 0 while the classical value does not", fermiCv(1e-6) < 1e-4 && classicalCv() === 1.5,
        "C_V(1e-6 T_F) = " + fermiCv(1e-6).toExponential(2) + " -> 0, the third law honoured; the classical 3/2 violates it");
}

// ---- 6. THE STATISTICS CONTRAST: Fermi ~ T, Bose ~ T^{3/2}, classical constant --------------------------
{
    const slope = (f, a, b) => Math.log(f(b) / f(a)) / Math.log(b / a);
    const fermiSlope = slope(fermiCv, 0.01, 0.02);           // 1
    const boseSlope = slope(cvBelowTc, 0.4, 0.6);            // 3/2 (bec, below Tc)
    ok("!! low-T C_V exponents: Fermi = 1, Bose = 3/2, classical = 0 -- three statistics, three laws",
        Math.abs(fermiSlope - 1) < 1e-6 && Math.abs(boseSlope - 1.5) < 1e-6,
        "d ln C_V/d ln T: Fermi = " + fermiSlope.toFixed(4) + " (this file), Bose = " + boseSlope.toFixed(4) + " (bec.mjs), " +
        "classical = 0 -- the Fermi integral is Gamma eta, the Bose integral Gamma zeta, and the sign in the denominator is the whole story");
}

// ---- 7. THE T = 0 STEP (control): a sharp Fermi surface, softening over ~T -------------------------------
{
    ok("!! occupation is a step at T = 0 (1 below E_F, 0 above) and softens to 1/2 at E_F when warm",
        occupation(0.5, 1, 0) === 1 && occupation(1.5, 1, 0) === 0 && occupation(1, 1, 0.1) === 0.5 && occupation(0.9, 1, 0.001) > 0.99,
        "n(E<E_F,T=0)=1, n(E>E_F,T=0)=0, n(E_F,T)=1/2 -- the sharp surface a classical Boltzmann tail would smear away entirely");
}

// ---- 8. BROWSER-SAFE -----------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "fermi.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "imports only ../md/maxwellSpeed.mjs and ../zeta.js, both browser-safe");
}

say("");
say("NOT CLAIMED: real metals or real white dwarfs. This is the IDEAL Fermi gas -- non-relativistic, no lattice,");
say("no band structure, no electron-electron interaction, spin folded into E_F. It grades the ideal degenerate");
say("thermodynamics and its exact join to whiteDwarf's polytrope. k_B = 1. NO DEVICE BIND, no lab-results change.");

{
    // v3904 -- THE COMPLETE FERMI-DIRAC INTEGRAL OF ORDER 1 HAS A CLOSED FORM AND NOTHING USED IT.
    // F_1(0) = int_0^inf x/(e^x + 1) dx = pi^2/12. It is the Fermi cousin of the Bose pi^2/6, and the FACTOR
    // OF TWO BETWEEN THEM IS THE STATISTICS -- eta(2) = (1 - 2^(1-2)) zeta(2). *** THIS IS THE ONE PLACE THE
    // SIGN IN THE DENOMINATOR IS GRADED BY ITS CONSEQUENCE RATHER THAN BY READING THE SOURCE: flip e^x + 1
    // to e^x - 1 and the answer moves to pi^2/6, which is a 2x miss no tolerance forgives.
    const got = fermiFunction(2, 1), exact = Math.PI ** 2 / 12;
    ok("fermiFunction(2,1) lands on pi^2/12", Math.abs(got - exact) / exact < 1e-11,
       got.toPrecision(17) + " against " + exact.toPrecision(17) + ", rel " + (Math.abs(got - exact) / exact).toExponential(3));
    ok("...and it is HALF the Bose answer, which is where the +1 shows up",
       Math.abs(got / (Math.PI ** 2 / 6) - 0.5) < 1e-11,
       "F/B = " + (got / (Math.PI ** 2 / 6)).toPrecision(12) + "; the Bose value pi^2/6 = " + (Math.PI ** 2 / 6).toPrecision(12));
}

console.log("fermi-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
