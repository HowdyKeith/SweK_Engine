// WebGLEngine/physics/thermal/chemicalPotential-selfcheck.mjs -- v3817
//
// Run: node physics/thermal/chemicalPotential-selfcheck.mjs   (~0.7s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// THE FINITE-T CHEMICAL POTENTIAL, THE THREAD THROUGH bec, fermi AND sackurTetrode. One density constraint
// n lambda^3 = {z | g_{3/2}(z) | f_{3/2}(z)} sets the fugacity, and mu = kT ln z. The crossover is z passing
// through 1 (mu = 0), and the statistics decide WHERE:
//   classical  mu=0 at n lambda^3 = 1
//   bosons     mu=0 at zeta(3/2) = 2.6124   (bec's condensation; mu then pins at 0)
//   fermions   mu=0 at eta(3/2)  = 0.7651   (mu keeps climbing to +E_F)
// ordered Bose > classical > Fermi, which IS the statistics: at fixed n,T the fugacities are
// z_Fermi > z_classical > z_Bose (exclusion pushes mu up, attraction pulls it down).
//
// *** THE TWO T=0 ENDS ARE OPPOSITE: Bose mu is NEVER positive (pins at 0, the condensate), Fermi mu -> +E_F with
// mu(T)/E_F = 1 - (pi^2/12)(T/T_F)^2, the coefficient being eta(2) = the Fermi integral at s=2. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    muOverKT, fugacityClassical, fugacityBose, fugacityFermi, crossoverBose, crossoverFermi, CROSSOVER_CLASSICAL,
    sommerfeldMu, SOMMERFELD_MU_COEFF, muFermiOverEF, fermiDensityFromT,
} from "./chemicalPotential.mjs";
import { criticalDensity } from "./bec.mjs";
import { etaDirichlet } from "./fermi.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE THREE mu = 0 CROSSOVER DENSITIES (z = 1), ordered Bose > classical > Fermi ------------------
{
    const dC = CROSSOVER_CLASSICAL, dB = crossoverBose(), dF = crossoverFermi();
    ok("!! mu = 0 (z = 1) at n lambda^3 = 1 (classical), zeta(3/2) = 2.6124 (Bose), eta(3/2) = 0.7651 (Fermi)",
        dC === 1 && rel(dB, criticalDensity()) < 1e-12 && rel(dF, etaDirichlet(1.5)) < 1e-12 &&
        Math.abs(muOverKT(fugacityBose(dB))) < 1e-6 && Math.abs(muOverKT(fugacityFermi(dF))) < 1e-6,
        "each maps to z = 1, mu = 0 -- Bose D = " + dB.toFixed(4) + ", Fermi D = " + dF.toFixed(4) + "; the density at which " +
        "the chemical potential changes sign is a fact about the statistics, joined from bec's zeta and fermi's eta");
    ok("!! ordered Bose > classical > Fermi", dB > dC && dC > dF,
        dB.toFixed(4) + " > 1 > " + dF.toFixed(4) + " -- a boson gas needs a much higher density than a Fermi gas to lift mu to 0");
}

// ---- 1. THE ORDERING AT FIXED DENSITY: z_Fermi > z_classical > z_Bose -----------------------------------
{
    const D = 0.5;
    const zB = fugacityBose(D), zC = fugacityClassical(D), zF = fugacityFermi(D);
    ok("!! at fixed n,T: mu_Fermi > mu_classical > mu_Bose (exclusion up, attraction down)",
        muOverKT(zB) < muOverKT(zC) && muOverKT(zC) < muOverKT(zF),
        "at n lambda^3 = 0.5: z = " + zB.toFixed(4) + " / " + zC.toFixed(4) + " / " + zF.toFixed(4) + " (Bose/cl/Fermi), so " +
        "mu/kT = " + muOverKT(zB).toFixed(4) + " < " + muOverKT(zC).toFixed(4) + " < " + muOverKT(zF).toFixed(4));
}

// ---- 2. THE BOSE CEILING: mu never positive; pins at 0 on condensation ----------------------------------
{
    ok("!! Bose fugacity stays <= 1 (mu <= 0) and pins at exactly 1 at/above zeta(3/2)",
        fugacityBose(2.0) < 1 && fugacityBose(criticalDensity()) === 1 && fugacityBose(5) === 1,
        "z(D=2.0) = " + fugacityBose(2.0).toFixed(5) + " < 1, and z = 1 exactly for D >= zeta(3/2) -- a positive mu would make " +
        "some Bose occupation 1/(e^{(e-mu)/kT}-1) negative, which is why the condensate holds mu at 0");
}

// ---- 3. THE FERMI SOMMERFELD LOW-T LAW, coefficient pi^2/12 = eta(2) ------------------------------------
{
    ok("!! the Sommerfeld coefficient is pi^2/12 = eta(2) (the Fermi integral at s=2)",
        rel(SOMMERFELD_MU_COEFF, Math.PI * Math.PI / 12) < 1e-12 && rel(SOMMERFELD_MU_COEFF, etaDirichlet(2)) < 1e-12,
        "pi^2/12 = " + SOMMERFELD_MU_COEFF.toFixed(6) + " = eta(2) -- the same alternating-zeta value fermi.mjs grades as its " +
        "s=2 integral, now setting how fast the chemical potential falls from E_F");
    // the exact inversion of f_{3/2} matches the Sommerfeld formula at low t, and (1 - mu/E_F)/t^2 -> pi^2/12
    const t = 0.05, exact = muFermiOverEF(t);
    ok("!! the exact mu(T)/E_F matches 1 - (pi^2/12) t^2 at low T", rel(exact, sommerfeldMu(t)) < 1e-4 &&
        Math.abs((1 - exact) / (t * t) - SOMMERFELD_MU_COEFF) < 0.02,
        "at T/T_F = " + t + ": exact mu/E_F = " + exact.toFixed(6) + " vs Sommerfeld " + sommerfeldMu(t).toFixed(6) + ", and " +
        "(1 - mu/E_F)/t^2 = " + ((1 - exact) / (t * t)).toFixed(4) + " approaching pi^2/12 = " + SOMMERFELD_MU_COEFF.toFixed(4));
}

// ---- 4. THE SIGN CHANGE: Fermi mu/E_F from +1 (T=0) through 0 (~T_F) to negative (classical) ------------
{
    const lo = muFermiOverEF(0.1), mid = muFermiOverEF(1.0), hi = muFermiOverEF(1.5);
    ok("!! mu/E_F CHANGES SIGN: near +1 at low T, through 0 around T_F, negative above",
        lo > 0.98 && hi < -0.5 && lo > mid && mid > hi && (mid < 0.1),
        "mu/E_F = " + lo.toFixed(4) + " (t=0.1) -> " + mid.toFixed(4) + " (t=1) -> " + hi.toFixed(4) + " (t=1.5): the crossover, " +
        "the sharp Fermi surface melting into a classical Boltzmann tail. Bosons never do this -- their mu stops at 0");
}

// ---- 5. THE CLASSICAL HIGH-T BRIDGE: all three mu/kT -> ln(n lambda^3) as the gas thins -----------------
{
    const D = 0.01, target = Math.log(D);
    const mB = muOverKT(fugacityBose(D)), mC = muOverKT(fugacityClassical(D)), mF = muOverKT(fugacityFermi(D));
    ok("!! as n lambda^3 -> 0, mu/kT -> ln(n lambda^3) for all three (sackurTetrode's classical gas)",
        rel(mC, target) < 1e-9 && Math.abs(mB - target) < 0.01 && Math.abs(mF - target) < 0.01,
        "at D = 0.01: mu/kT = " + mB.toFixed(4) + " / " + mC.toFixed(4) + " / " + mF.toFixed(4) + " (Bose/cl/Fermi), all -> ln(0.01) = " +
        target.toFixed(4) + " -- the statistics wash out and the three chemical potentials converge on the classical one");
}

// ---- 6. BROWSER-SAFE -----------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "chemicalPotential.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "imports only ./bec.mjs and ./fermi.mjs, both browser-safe");
}

say("");
say("NOT CLAIMED: real gases or the condensate's internal structure. This is the ideal-gas chemical potential --");
say("the fugacity that one density constraint fixes, read as mu = kT ln z -- across the three statistics and their");
say("shared classical limit. k_B = 1. NO DEVICE BIND, no lab-results change.");

console.log("chemicalPotential-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
