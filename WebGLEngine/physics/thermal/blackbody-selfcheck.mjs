// WebGLEngine/physics/thermal/blackbody-selfcheck.mjs -- v3811
//
// Run: node physics/thermal/blackbody-selfcheck.mjs   (~1s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// BLACKBODY RADIATION, GRADED AGAINST MATHEMATICAL CONSTANTS AND DEFINED SI VALUES -- NOT ONE TYPED REFERENCE.
//   - THE WIEN PEAKS are roots of n*(1 - e^-x) = x, found by a Newton solver AND an independent maximiser of the
//     Planck shape: two routes sharing no code, plus the closed transcendental residual as a third.
//   - THE MASTER IDENTITY INT_0^inf x^(s-1)/(e^x-1) dx = Gamma(s) zeta(s): the total-energy integral (s=4) equals
//     6 zeta(4) = pi^4/15 and the photon-number integral (s=3) equals 2 zeta(3), with zeta reached through the
//     EXISTING physics/zeta.js and Gamma through the v3810 module -- three modules on one number.
//   - sigma = 2 pi^5 k^4 / (15 h^3 c^2) and Wien's b = h c / (x_lambda k), from the 2019-EXACT h, k, c, matched
//     against CODATA.
//
// *** THE LOAD-BEARING NEGATIVE: the wavelength peak (x=4.965) and the frequency peak (x=2.821) are DIFFERENT
// PHOTONS -- lambda_peak * nu_peak / c = 0.568, not 1 -- and a plant that converts one to the other with
// lambda*nu = c is caught. ***
//
// *** AND THE NON-INTEGER JOIN FOUND A BUG IN SHIPPED CODE, SINCE FIXED: physics/zeta.js advertised "real s" but
// ipow() computed x^s with a COUNTED LOOP (a no-Math.pow measure keeping the fleet bit-identical), so for
// non-integer s it ran ceil(s) times and zeta(2.5) silently returned zeta(3). v3811 drove it and left it FOUND,
// NOT FIXED; v3812 routed real-s powers through realPow = strictExp(s log x) composed from the tree's EXISTING
// strict-libm (tools/strictExpErf + tools/strictLog, the same libm-free exp/log zetaCritical already uses). Section 6 now CONFIRMS the identity holds
// across the reals -- it flipped from documenting the bug to corroborating the fix. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    planckShape, wienRootNewton, wienPeakMaximise, wienResidual,
    boseIntegral, boseClosed, stefanBoltzmannSigma, wienConstant, exitance,
    H_PLANCK, K_BOLTZ, C_LIGHT,
    planckNuShape, planckLambdaShape, peakWavelength,
} from "./blackbody.mjs";
import { zeta } from "../zeta.js";
import { gammaFn } from "../md/maxwellSpeed.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
// true relative error. NB: an earlier Math.max(1,|b|) guard silently turned this into an ABSOLUTE tolerance for
// small b -- the sigma (1e-8) and Wien-b (1e-3) anchors passed a planted 15->16 error because 1e-6 absolute is
// 100x sigma. Every rel() target here is O(1) or larger; the machine-zero cases use Math.abs(...) directly.
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE WIEN PEAKS: NEWTON ROOT == INDEPENDENT MAXIMISER, RESIDUAL AT MACHINE ZERO ----------------------
{
    for (const [n, lbl] of [[3, "frequency"], [5, "wavelength"]]) {
        const rN = wienRootNewton(n), rM = wienPeakMaximise(n);
        ok("!! Wien " + lbl + " peak: Newton root == golden-section maximiser (n=" + n + ")",
            rel(rN, rM) < 1e-6 && Math.abs(wienResidual(rN, n)) < 1e-12,
            "root = " + rN.toFixed(10) + ", maximiser = " + rM.toFixed(10) + ", transcendental residual = " +
            wienResidual(rN, n).toExponential(2) + " -- the root-finder solves n(1-e^-x)=x, the maximiser never " +
            "forms the derivative, so they share no code; the value is COMPUTED, which caught a digit-swap in the first draft");
    }
    // the two peaks are genuinely different numbers -- this is what makes the section-4 negative non-vacuous
    ok("the frequency and wavelength roots are different numbers",
        Math.abs(wienRootNewton(3) - wienRootNewton(5)) > 2,
        "2.821 vs 4.965 -- a gap of 2.14, not a rounding difference");
}

// ---- 1. STEFAN-BOLTZMANN: QUADRATURE == 6*zeta(4) [zeta.js join] == pi^4/15 [closed] -----------------------
{
    const quad = boseIntegral(4), viaZeta = 6 * zeta(4), closed = Math.pow(Math.PI, 4) / 15;
    ok("!! INT x^3/(e^x-1) dx == 6 zeta(4) == pi^4/15 (three routes)",
        rel(quad, viaZeta) < 1e-9 && rel(viaZeta, closed) < 1e-12,
        "quadrature = " + quad.toFixed(10) + ", 6 zeta(4) = " + viaZeta.toFixed(10) + ", pi^4/15 = " + closed.toFixed(10) +
        " -- the left side is a numerical integral of the Planck shape, the right reaches pi through physics/zeta.js; " +
        "they had no way to agree unless both are right");
}

// ---- 2. PHOTON NUMBER: QUADRATURE == 2*zeta(3) [zeta.js join, Apery] --------------------------------------
{
    const quad = boseIntegral(3), viaZeta = 2 * zeta(3);
    ok("!! INT x^2/(e^x-1) dx == 2 zeta(3) (Apery's constant)",
        rel(quad, viaZeta) < 1e-9,
        "quadrature = " + quad.toFixed(10) + ", 2 zeta(3) = " + viaZeta.toFixed(10) + ", rel " + rel(quad, viaZeta).toExponential(2) +
        " -- the photon-number moment lands on a DIFFERENT zeta value than the energy moment, so section 1 and 2 " +
        "cannot both pass by a shared constant");
}

// ---- 3. THE MASTER IDENTITY Gamma(s) zeta(s) AT INTEGER s, WHERE BOTH FACTORS ARE EXACT --------------------
{
    // s=4: Gamma(4)=6 exact; s=3: Gamma(3)=2 exact. gammaFn (the v3810 module) must reproduce those integers.
    ok("gammaFn reproduces the integer factorials the identity needs (Gamma(3)=2, Gamma(4)=6)",
        rel(gammaFn(3), 2) < 1e-12 && rel(gammaFn(4), 6) < 1e-12,
        "the join carries Gamma from physics/md/maxwellSpeed.mjs; at integer s it is an exact factorial");
    ok("!! quadrature == gammaFn(s)*zeta(s) at s=4 and s=3",
        rel(boseIntegral(4), gammaFn(4) * zeta(4)) < 1e-9 && rel(boseIntegral(3), gammaFn(3) * zeta(3)) < 1e-9,
        "the identity stated with BOTH other modules in it -- Gamma from v3810, zeta from zeta.js -- meeting a " +
        "quadrature that contains neither");
}

// ---- 4. THE LOAD-BEARING NEGATIVE: THE TWO PEAKS ARE DIFFERENT PHOTONS -------------------------------------
{
    const xL = wienRootNewton(5), xN = wienRootNewton(3);
    // If the peaks were the same photon, lambda_peak * nu_peak = c would force x_N = x_L. They don't.
    const ratio = xN / xL;               // = nu_peak * lambda_peak / c
    ok("!! lambda_peak * nu_peak / c = x_nu/x_lambda != 1 -- the peaks are different photons",
        Math.abs(ratio - 1) > 0.4,
        "ratio = " + ratio.toFixed(6) + " (about 0.568), off unity by " + (100 * Math.abs(ratio - 1)).toFixed(1) + "% -- " +
        "the peak of a spectrum depends on binning in d(lambda) or d(nu); the Jacobian reshapes it");

    // PLANT: the naive conversion. Take the wavelength peak and assume it maps to the frequency peak by lambda*nu=c,
    // i.e. predict x_nu = x_lambda. It must be caught against the true frequency root.
    const plantXnu = xL;                 // the mistake: same x for both
    ok("!! the naive lambda*nu=c peak conversion (the plant) fails against the true frequency root",
        Math.abs(plantXnu - xN) > 2,
        "plant predicts x_nu = " + plantXnu.toFixed(4) + " but the frequency peak is " + xN.toFixed(4) +
        " -- a wrong photon by 2.14 in x, which is a factor of 1.76 in energy");
}

// ---- 5. THE DIMENSIONFUL ANCHORS ARE EXACT SI, MATCHED AGAINST CODATA --------------------------------------
{
    ok("!! Stefan-Boltzmann sigma = 2 pi^5 k^4/(15 h^3 c^2) matches CODATA",
        rel(stefanBoltzmannSigma(), 5.670374419e-8) < 1e-6,
        "computed " + stefanBoltzmannSigma().toExponential(9) + " against CODATA 5.670374419e-8 -- h, k, c are exact " +
        "since 2019, so this is a defined value reproduced, not a fit");
    ok("!! Wien's displacement constant b = hc/(x_lambda k) matches CODATA",
        rel(wienConstant(), 2.897771955e-3) < 1e-6,
        "computed " + wienConstant().toExponential(9) + " against CODATA 2.897771955e-3 m K -- and it carries the " +
        "section-0 root, so a wrong root would surface here as a wrong physical constant");
    // T-scaling CONTROL: the Stefan-Boltzmann law is exactly quartic.
    ok("!! exitance is exactly quartic in T (double T -> x16)", rel(exitance(600) / exitance(300), 16) < 1e-12,
        "M(600)/M(300) = " + (exitance(600) / exitance(300)).toFixed(9) + " -- the T^4 law is the integral's scale " +
        "factor, and a shape that is right but scales wrong would pass sections 1-4 and fail here");
}

// ---- 6. THE NON-INTEGER JOIN, NOW WHOLE: the master identity holds at REAL s too (fixed in v3812) ----------
{
    // v3811 drove a bug from here: zeta.js advertised real s but ipow's counted loop ran ceil(s) times, so
    // zeta(2.5) returned zeta(3). That is now fixed -- zeta.js composes realPow from the existing tools/ strict-libm
    // -- so this section flips from documenting the bug to CONFIRMING the identity across the reals.
    // The reference stays honest: quad(s)/gammaFn(s) IS zeta(s), derived from two routes that never touch zeta.js.
    let worst = 0, at = 0;
    for (const s of [2.5, 3.5, 4.5, 6.25]) {
        const zTrue = boseIntegral(s) / gammaFn(s);   // = zeta(s), derived not typed
        const e = rel(zeta(s), zTrue);
        if (e > worst) { worst = e; at = s; }
    }
    ok("!! physics/zeta.js now agrees with the derived zeta(s) at NON-INTEGER s",
        worst < 1e-6,
        "worst rel " + worst.toExponential(2) + " at s=" + at + " -- e.g. zeta.js(2.5) = " + zeta(2.5).toFixed(10) +
        " against quadrature/Gamma = " + (boseIntegral(2.5) / gammaFn(2.5)).toFixed(10) + ". Before v3812 zeta.js(2.5) " +
        "returned zeta(3) = " + zeta(3).toFixed(10) + "; the fix is real, and this is the join that drove it");
    // so the full master identity Gamma(s) zeta(s) == quadrature now holds at real s, all three modules meeting
    const s = 2.5, off = rel(boseIntegral(s), boseClosed(s));
    ok("!! the s=2.5 master identity Gamma(s) zeta(s) == quadrature now closes (three modules, real s)",
        off < 1e-6,
        "quad = " + boseIntegral(s).toFixed(10) + " == gammaFn(2.5)*zeta.js(2.5) = " + boseClosed(s).toFixed(10) +
        ", off by " + off.toExponential(2) + " -- Gamma from v3810, zeta (now real-s) from zeta.js, quadrature holding neither");
}

// ---- 7. BROWSER-SAFE, AS THE HEADER CLAIMS (thermal radiation runs in the same browser the sim does) -------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "blackbody.mjs"), "utf8");
    ok("the module imports no node builtins and touches no DOM",
        !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "its only imports are physics/zeta.js and the v3810 module, both browser-safe");
}

say("");
say("NOT CLAIMED: real spectra. This is the ideal blackbody -- emissivity is 1 at every wavelength, and nothing");
say("here does radiative transfer, absorption, or a grey body. NOT CLAIMED: that any renderer consumes this yet;");
say("it ships as a bench module + gate (v3613's pattern), no device bind and no lab-results change. FOUND: the");
say("zeta.js real-s gap (section 6): driven here in v3811, FIXED in v3812 via the existing tools/ strict-libm -- now corroborated.");

{
    // v3904 -- THE TWO WIEN ROOTS ARE CLOSED FORMS THIS FILE SOLVES FOR AND NEVER GRADED AGAINST.
    // wienRootNewton(n) solves x = n(1 - e^-x). The two PHYSICAL cases are n=3 (spectrum per unit FREQUENCY)
    // and n=5 (per unit WAVELENGTH), and their roots are the two constants the textbooks print.
    // *** THE PAIR IS THE POINT, NOT EITHER ROOT. *** A peak in nu and a peak in lambda ARE NOT THE SAME PEAK
    // -- nu_max/c is NOT 1/lambda_max -- and the ratio 0.568252661 is the entire content of that sentence.
    // Checking only one root would pass with the other spelling substituted, and substituting one for the
    // other is the single commonest error in this corner of physics.
    const r3 = wienRootNewton(3), r5 = wienRootNewton(5);
    ok("wienRootNewton(3) hits the FREQUENCY-peak Wien root", Math.abs(r3 - 2.8214393721220787) < 1e-12,
       r3.toPrecision(17) + " against 2.8214393721220787");
    ok("wienRootNewton(5) hits the WAVELENGTH-peak Wien root", Math.abs(r5 - 4.9651142317442769) < 1e-12,
       r5.toPrecision(17) + " against 4.9651142317442769");
    ok("*** and the two peaks DISAGREE, by the ratio that says they are different questions ***",
       Math.abs(r3 / r5 - 0.56825266054974299) < 1e-12 && Math.abs(r3 - r5) > 2,
       "r3/r5 = " + (r3 / r5).toPrecision(12) + ", apart by " + (r5 - r3).toPrecision(6));
    // Wien's DISPLACEMENT law is the claim that lambda_max * T is a constant. peakWavelength divides by T, so
    // the product is constant BY CONSTRUCTION -- which is exactly why it can be graded BIT-EXACTLY rather
    // than to a tolerance. A tolerance here would hide a T-dependence that has no business existing at all.
    const prods = new Set([1, 2.7255, 100, 300, 1000, 5772, 1e5].map((T) => peakWavelength(T) * T));
    ok("peakWavelength(T)*T is BIT-IDENTICAL across five decades of T", prods.size === 1,
       "one distinct double over 7 temperatures: " + [...prods][0].toPrecision(17) + " m*K");
    ok("...and the shape functions the roots came from are the ones exported",
       typeof planckNuShape === "function" && typeof planckLambdaShape === "function" &&
       planckNuShape(r3) > 0 && planckLambdaShape(r5) > 0,
       "both shapes evaluate positive AT their own root");
}

console.log("blackbody-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
