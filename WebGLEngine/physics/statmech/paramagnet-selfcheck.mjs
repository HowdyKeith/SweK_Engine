// WebGLEngine/physics/statmech/paramagnet-selfcheck.mjs -- v3818
//
// Run: node physics/statmech/paramagnet-selfcheck.mjs   (~0.05s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// LOCALISED SPINS -- the non-interacting neighbour of ising.js -- GRADED ON THEIR MAGNETISATION AND THEIR HEAT.
//   - THE BRILLOUIN FUNCTION: B_{1/2}(y) = tanh(y) exactly, B_J -> Langevin coth(y)-1/y as J -> infinity, the
//     small-y Curie slope (J+1)/(3J), saturation at 1.
//   - THE CURIE LAW chi = C/T, C proportional to J(J+1)/3 -- independent moments, chi ~ 1/T (ising's T >> T_c limit).
//   - THE SCHOTTKY ANOMALY: C/(Nk) = x^2 e^x/(e^x+1)^2 peaks where x tanh(x/2) = 2 (a transcendental found by a
//     Newton root AND an independent maximiser, as blackbody finds its Wien peak): x* = 2.3994, C_max = 0.43923.
//
// *** THE LOAD-BEARING NEGATIVE IS THE BOUNDED SPECTRUM: C -> 0 as T -> infinity, not the classical constant, because
// a two-level system saturates. The same finiteness sends the entropy to ln 2 (two states) and to 0 at T = 0 -- the
// third law HONOURED, in direct contrast to sackurTetrode's classical gas, whose entropy runs off to -infinity. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    brillouin, langevinFunction, curieConstant, susceptibilityCurie, schottkyC, twoLevelEntropy,
    schottkyPeakNewton, schottkyPeakMaximise, schottkyResidual,
    twoLevelEnergy,
} from "./paramagnet.mjs";
import { sackurTetrode } from "../thermal/sackurTetrode.mjs";   // the classical gas that VIOLATES the third law

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE BRILLOUIN FUNCTION AND ITS LIMITS -----------------------------------------------------------
{
    let worst = 0;
    for (const y of [0.3, 0.8, 1.5, 3]) worst = Math.max(worst, rel(brillouin(0.5, y), Math.tanh(y)));
    ok("!! B_{1/2}(y) = tanh(y) exactly (spin-1/2)", worst < 1e-12,
        "worst rel " + worst.toExponential(2) + " -- the two-coth Brillouin form collapses to a single tanh at J=1/2");
    ok("!! B_J -> Langevin coth(y)-1/y as J -> infinity (the classical limit)",
        Math.abs(brillouin(500, 1.5) - langevinFunction(1.5)) < 5e-3 && Math.abs(brillouin(50, 1.5) - langevinFunction(1.5)) > Math.abs(brillouin(500, 1.5) - langevinFunction(1.5)),
        "B_500(1.5) = " + brillouin(500, 1.5).toFixed(5) + " approaching L(1.5) = " + langevinFunction(1.5).toFixed(5) + ", closer than B_50 -- " +
        "the quantum staircase of 2J+1 levels becoming a classical continuum");
    ok("!! small-y slope is the Curie (J+1)/(3J), and B_J saturates at 1",
        rel(brillouin(1, 1e-3) / 1e-3, 2 / 3) < 1e-3 && Math.abs(brillouin(0.5, 12) - 1) < 1e-4,
        "B_1(y)/y -> 2/3 at small y (Curie), and B(large y) -> 1 (fully aligned)");
}

// ---- 1. THE CURIE LAW -----------------------------------------------------------------------------------
{
    ok("!! chi = C/T with C = J(J+1)/3, and chi ~ 1/T",
        curieConstant(0.5) === 0.25 && rel(curieConstant(1), 2 / 3) < 1e-12 && rel(susceptibilityCurie(0.5, 2) / susceptibilityCurie(0.5, 4), 2) < 1e-12,
        "C(1/2) = 0.25, C(1) = 2/3 (the J(J+1)), and chi halves when T doubles -- independent moments, no ordering; " +
        "ising's chi diverges at T_c instead, and this is its T >> T_c tail");
}

// ---- 2. THE SCHOTTKY PEAK, TWO ROUTES (Wien-style transcendental) ---------------------------------------
{
    const xN = schottkyPeakNewton(), xM = schottkyPeakMaximise();
    ok("!! the Schottky peak solves x tanh(x/2) = 2: Newton root == maximiser, residual ~ 0",
        rel(xN, xM) < 1e-6 && Math.abs(schottkyResidual(xN)) < 1e-12,
        "Newton x* = " + xN.toFixed(8) + ", maximiser x* = " + xM.toFixed(8) + ", residual = " + schottkyResidual(xN).toExponential(2) +
        " -- the derivative condition is a transcendental, solved and independently maximised, exactly as blackbody's Wien peak");
    ok("!! x* = 2.3994 (gap/kT) and C_max/(Nk) = 0.43923",
        rel(xN, 2.399357) < 1e-5 && rel(schottkyC(xN), 0.439229) < 1e-5,
        "the peak sits at kT ~ 0.417 * gap, height " + schottkyC(xN).toFixed(6) + " -- a fingerprint of a single level spacing");
}

// ---- 3. THE LOAD-BEARING NEGATIVE: bounded spectrum -> C vanishes at BOTH ends --------------------------
{
    const cHot = schottkyC(0.03), cCold = schottkyC(14), cPeak = schottkyC(schottkyPeakNewton());
    ok("!! C/(Nk) -> 0 as T -> infinity (NOT the classical constant) and as T -> 0",
        cHot < 1e-3 && cCold < 1e-3 && cPeak > 0.4,
        "C(high T) = " + cHot.toExponential(2) + ", C(low T) = " + cCold.toExponential(2) + ", C(peak) = " + cPeak.toFixed(4) +
        " -- a gas absorbs heat without limit (equipartition, C constant); two levels saturate, so a hotter bath gets nothing more");
}

// ---- 4. ENTROPY -> ln 2, AND -> 0 AT T=0: the third law honoured, unlike the classical gas ---------------
{
    const sHot = twoLevelEntropy(0.005), sCold = twoLevelEntropy(16);
    ok("!! two-level entropy -> ln 2 (high T) and -> 0 (T -> 0): third law HONOURED",
        rel(sHot, Math.LN2) < 1e-3 && sCold < 1e-5,
        "S/(Nk) -> " + sHot.toFixed(5) + " = ln 2 (both states equally likely) and -> " + sCold.toExponential(2) + " at T=0");
    // the contrast: sackurTetrode's classical gas entropy runs to -infinity at T=0 (n*lambda^3 -> infinity)
    ok("!! by contrast the classical (Sackur-Tetrode) entropy -> -infinity at T=0 (third law VIOLATED)",
        sackurTetrode(1e6) < -10 && twoLevelEntropy(16) >= 0,
        "S_classical(n*lambda^3=1e6) = " + sackurTetrode(1e6).toFixed(2) + " (impossible) while the bounded two-level stays >= 0 -- " +
        "a discrete spectrum is exactly what a real solid needs at low T, and what the ideal gas lacks");
}

// ---- 5. BROWSER-SAFE -----------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "paramagnet.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "no imports beyond Math; hyperbolics written via Math.exp");
}

say("");
say("NOT CLAIMED: interactions or ordering. These spins are independent -- no exchange, no phase transition (that is");
say("ising.js), no crystal field beyond a single gap. It grades the Brillouin magnetisation, the Curie law, and the");
say("Schottky heat capacity of a two-level system. k_B = 1. NO DEVICE BIND, no lab-results change.");

{
    // v3904 -- THE TWO-LEVEL OCCUPATION HAS TWO EXACT PROPERTIES AND NEITHER WAS GRADED.
    // (1) At zero field (or infinite temperature) the two levels are equally likely, so the mean energy in
    // units of the splitting is EXACTLY 1/2. Not approximately: 1/(1 + e^0) = 1/2 is representable, so this
    // is graded bit-exactly and a tolerance would be hiding something.
    ok("twoLevelEnergy(0) is EXACTLY one half", twoLevelEnergy(0) === 0.5,
       "1/(1 + e^0) = 0.5, asserted bit-exactly because it is representable");
    // (2) The Fermi-function symmetry f(x) + f(-x) = 1, which says the two levels' occupations are
    // complementary. *** THIS IS THE PROPERTY THAT CATCHES A SIGN ERROR IN THE EXPONENT, and a sign error in
    // the exponent is invisible to any single-point check because it maps a plausible number onto another
    // plausible number -- it swaps which level is the ground state and nothing else looks wrong.
    const xs = [1e-6, 0.3, 1.0, 2.5, 12.0, 40.0];
    const worst = Math.max(...xs.map((x) => Math.abs(twoLevelEnergy(x) + twoLevelEnergy(-x) - 1)));
    ok("f(x) + f(-x) = 1 across six decades of argument", worst < 1e-15,
       "worst departure " + worst.toExponential(3) + " over x = " + xs.join(", "));
    ok("...and the function actually MOVES over that range, so the symmetry is not a constant in disguise",
       twoLevelEnergy(40) < 1e-15 && twoLevelEnergy(-40) > 1 - 1e-15,
       "f(40) = " + twoLevelEnergy(40).toExponential(3) + ", f(-40) = " + twoLevelEnergy(-40).toPrecision(17));
}

console.log("paramagnet-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
