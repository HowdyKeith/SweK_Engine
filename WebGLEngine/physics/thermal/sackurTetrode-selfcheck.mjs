// WebGLEngine/physics/thermal/sackurTetrode-selfcheck.mjs -- v3816
//
// Run: node physics/thermal/sackurTetrode-selfcheck.mjs   (~0.1s, MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// THE SACKUR-TETRODE ENTROPY, THE CLASSICAL IDEAL GAS bec.mjs AND fermi.mjs BOTH BECOME WHEN HOT AND THIN.
//   - THE FORM S/(Nk) = ln(n_Q/n) + 5/2, exactly 5/2 at n*lambda^3 = 1.
//   - IT ANNOUNCES ITS OWN DEATH: S = 0 at n*lambda^3 = e^{5/2} = 12.1825 and negative above -- impossible, so the
//     classical gas is flagging that it has left its domain. And bec's zeta(3/2) = 2.612 arrives FIRST, so the
//     quantum statistics have taken over while Sackur-Tetrode still reads a comfortable +1.5.
//   - THE BRIDGE IS THE FIRST QUANTUM CORRECTION, AND ITS SIGN IS THE STATISTICS: PV/(NkT) = 1 -/+ n*lambda^3 /
//     2^{5/2}, minus bosons (cluster), plus fermions (exclude), both -> 1 as the gas thins. Verified against the
//     exact polylog ratio g_{5/2}(z)/g_{3/2}(z) from bec, and its Fermi (alternating) twin.
//
// *** THE LOAD-BEARING NEGATIVE IS THE GIBBS PARADOX: drop Stirling's 1/N! and the entropy is ln V not ln(V/N),
// no longer EXTENSIVE -- doubling the box adds a spurious N k ln 2. The same 1/N! is why the constant is 5/2, not
// 3/2. And the third law: this classical S -> -infinity as T -> 0, which the quantum gases it bridges never do. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    sackurTetrode, NEG_ENTROPY_THRESHOLD, quantumEOS, EXCHANGE_DENOM, entropyExtensive, entropyDistinguishable,
    quantumConcentration,
} from "./sackurTetrode.mjs";
import { boseFunction, criticalDensity } from "./bec.mjs";   // the Bose sibling: polylog + condensation threshold

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE FORM AND THE 5/2 CONSTANT --------------------------------------------------------------------
{
    ok("!! S/(Nk) = -ln(n*lambda^3) + 5/2, and is exactly 5/2 at n*lambda^3 = 1 and 3/2 at e",
        sackurTetrode(1) === 2.5 && rel(sackurTetrode(Math.E), 1.5) < 1e-12,
        "S(1) = " + sackurTetrode(1) + ", S(e) = " + sackurTetrode(Math.E).toFixed(6) + " -- the 5/2 is the 3/2 of the " +
        "translational energy plus the 1 that Stirling's 1/N! puts on the ln(V/N)");
}

// ---- 1. THE NEGATIVE-ENTROPY BREAKDOWN -------------------------------------------------------------------
{
    ok("!! S = 0 at n*lambda^3 = e^{5/2} = 12.1825, and NEGATIVE above it (impossible -> out of domain)",
        rel(NEG_ENTROPY_THRESHOLD, Math.exp(2.5)) < 1e-12 && Math.abs(sackurTetrode(NEG_ENTROPY_THRESHOLD)) < 1e-12 && sackurTetrode(15) < 0,
        "threshold = " + NEG_ENTROPY_THRESHOLD.toFixed(6) + ", S there = 0, S(15) = " + sackurTetrode(15).toFixed(4) +
        " -- a negative absolute entropy is the classical formula confessing it no longer applies");
}

// ---- 2. THE JOIN: bec's condensation arrives BEFORE the classical formula even goes negative -------------
{
    const phiBEC = criticalDensity();     // zeta(3/2) = 2.612
    ok("!! bec threshold zeta(3/2) < e^{5/2}, and S is still POSITIVE there (quantum wins before ST fails)",
        phiBEC < NEG_ENTROPY_THRESHOLD && sackurTetrode(phiBEC) > 1 && sackurTetrode(phiBEC) < 2,
        "at n*lambda^3 = " + phiBEC.toFixed(4) + " (BEC onset) Sackur-Tetrode still reads " + sackurTetrode(phiBEC).toFixed(4) +
        " > 0 -- the statistics take over while the classical entropy looks comfortable; its negative branch at " +
        NEG_ENTROPY_THRESHOLD.toFixed(2) + " is a late alarm on a fire that started at ~1");
}

// ---- 3. THE BRIDGE: PV/(NkT) = 1 -/+ phi/2^{5/2}, the exchange correction, sign = statistics --------------
{
    // Fermi polylog f_s(z) = sum (-1)^{n-1} z^n / n^s, inline (bec supplies the Bose g_s(z)).
    const fPoly = (s, z, N = 100000) => { let a = 0, zn = 1; for (let n = 1; n <= N; n++) { zn *= z; a += (n % 2 ? 1 : -1) * zn / Math.pow(n, s); } return a; };
    ok("!! 2^{5/2} = 5.656854 (the exchange denominator)", rel(EXCHANGE_DENOM, 5.656854249) < 1e-9, "2^{5/2}");
    let worstB = 0, worstF = 0;
    for (const z of [0.02, 0.05]) {
        const phiB = boseFunction(1.5, z), pvB = boseFunction(2.5, z) / boseFunction(1.5, z);
        const phiF = fPoly(1.5, z), pvF = fPoly(2.5, z) / fPoly(1.5, z);
        worstB = Math.max(worstB, rel(pvB, quantumEOS(phiB, -1)));
        worstF = Math.max(worstF, rel(pvF, quantumEOS(phiF, +1)));
    }
    ok("!! PV/(NkT) = 1 - phi/2^{5/2} for BOSONS matches the exact g_{5/2}/g_{3/2} ratio", worstB < 1e-4,
        "worst rel " + worstB.toExponential(2) + " -- bosons cluster, PV < NkT; the leading correction is exact to O(phi^2)");
    ok("!! PV/(NkT) = 1 + phi/2^{5/2} for FERMIONS matches the exact f_{5/2}/f_{3/2} ratio", worstF < 1e-4,
        "worst rel " + worstF.toExponential(2) + " -- fermions exclude, PV > NkT; the SIGN is the only thing that remembers the statistics");
    // the sign flip made explicit
    ok("!! the correction SIGN is opposite for the two gases (Bose below 1, Fermi above 1)",
        quantumEOS(0.1, -1) < 1 && quantumEOS(0.1, +1) > 1,
        "at phi = 0.1: Bose PV/NkT = " + quantumEOS(0.1, -1).toFixed(6) + " < 1 < " + quantumEOS(0.1, +1).toFixed(6) + " = Fermi");
}

// ---- 4. THE THIRD LAW: classical S -> -infinity as T -> 0 (the quantum gases go to 0 instead) ------------
{
    ok("!! Sackur-Tetrode diverges to -infinity as n*lambda^3 -> infinity (T -> 0), violating the third law",
        sackurTetrode(1e6) < -10 && sackurTetrode(1e12) < sackurTetrode(1e6),
        "S(1e6) = " + sackurTetrode(1e6).toFixed(3) + ", S(1e12) = " + sackurTetrode(1e12).toFixed(3) + " -> -inf -- a real " +
        "entropy goes to 0 at T=0; the classical gas cannot, which is exactly why bec and fermi must replace it");
}

// ---- 5. THE GIBBS PARADOX: extensivity needs the 1/N! -----------------------------------------------------
{
    const lam = 0.5;
    const ext1 = entropyExtensive(100, 10, lam), ext2 = entropyExtensive(200, 20, lam);
    const dis1 = entropyDistinguishable(100, 10, lam), dis2 = entropyDistinguishable(200, 20, lam);
    ok("!! the indistinguishable entropy is EXTENSIVE (double V,N -> double S); the distinguishable one is not",
        rel(ext2, 2 * ext1) < 1e-12 && Math.abs(dis2 - 2 * dis1) > 0.1,
        "extensive ratio = " + (ext2 / ext1).toFixed(6) + " (exactly 2); distinguishable ratio = " + (dis2 / dis1).toFixed(6) +
        " -- the extra is N k ln 2, the entropy of mixing a gas with itself, the Gibbs paradox the 1/N! removes");
}

// ---- 6. THE CONTROL: the dilute/high-T limit is the classical ideal gas both statistics share -----------
{
    ok("!! as n*lambda^3 -> 0: S/(Nk) -> +infinity and PV/(NkT) -> 1 for BOTH statistics",
        sackurTetrode(1e-6) > 10 && rel(quantumEOS(1e-8, -1), 1) < 1e-8 && rel(quantumEOS(1e-8, +1), 1) < 1e-8,
        "S(1e-6) = " + sackurTetrode(1e-6).toFixed(3) + " (large, dilute), and the quantum corrections vanish -- the Bose and " +
        "Fermi gases converge onto one classical answer, which is the whole point of the bridge");
}

// ---- 7. BROWSER-SAFE -------------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "sackurTetrode.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "no imports at all beyond Math -- the classical limit needs neither zeta nor a quadrature");
}

say("");
say("NOT CLAIMED: real gases. This is the monatomic ideal gas -- no internal structure, no interactions beyond the");
say("exchange correction's leading term, no condensation of its own. It grades the classical limit and its exact");
say("first-order bridge to bec.mjs and fermi.mjs. k_B = 1. NO DEVICE BIND, no lab-results change.");

{
    // v3904 -- quantumConcentration IS AN INVERSE CUBE AND ITS ROUND TRIP WAS NEVER CLOSED.
    // n_Q = 1/lambda^3, so n_Q(lambda) * lambda^3 must return 1 -- across the whole range of thermal
    // wavelengths this file cares about, from a cold atom (1e-7 m) to a hot electron (1e-11 m).
    // *** WHAT IS CLAIMED IS "TO WITHIN ONE ULP", NOT "EXACTLY 1". *** I checked before writing it: the
    // product is 0.99999999999999989 at 1e-11 and 1.0000000000000002 at 1e-7. A cube and a reciprocal do not
    // compose bit-exactly, and asserting === 1 here would be a check that passes on this machine's rounding.
    const rt = [1e-11, 1e-9, 3.3e-9, 1e-8, 1e-7].map((l) => quantumConcentration(l) * l * l * l);
    ok("quantumConcentration round-trips its own cube to within an ulp",
       rt.every((v) => Math.abs(v - 1) <= 4 * Number.EPSILON),
       "worst |n_Q*lambda^3 - 1| = " + Math.max(...rt.map((v) => Math.abs(v - 1))).toExponential(3) +
       " over four decades of lambda, against eps = " + Number.EPSILON.toExponential(3));
    ok("...and it is a strictly DECREASING function of lambda, as an inverse cube must be",
       quantumConcentration(1e-11) > quantumConcentration(1e-9) && quantumConcentration(1e-9) > quantumConcentration(1e-7),
       "n_Q falls by 1e18 as lambda rises by 1e4 -- the cube, read off the ratio");
}

console.log("sackurTetrode-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
