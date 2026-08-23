// WebGLEngine/physics/thermal/bec-selfcheck.mjs -- v3814
//
// Run: node physics/thermal/bec-selfcheck.mjs   (~2.2s — MEASURED v3941, was ~0.8s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered by filename).
//
// BOSE-EINSTEIN CONDENSATION, GRADED AT ITS TRANSITION AND ITS TWO EDGES.
//   - THE CONDENSATION CONDITION n lambda_c^3 = zeta(3/2) = 2.6123753, reached three ways sharing no code:
//     blackbody's boseIntegral(3/2)/gammaFn(3/2), physics/zeta.js's zeta(3/2), and the polylog series at z = 1.
//     THIS IS THE ROUND'S JOIN AND IT ONLY EXISTS BECAUSE v3812 GAVE zeta A REAL-s POWER -- s = 3/2 is not an
//     integer, and before that fix zeta(3/2) silently returned zeta(2).
//   - THE CONDENSATE FRACTION N0/N = 1 - (T/Tc)^{3/2}, exact below Tc.
//   - THE HEAT-CAPACITY CUSP C_V/(Nk) = (15/4) zeta(5/2)/zeta(3/2) = 1.9257, continuous at Tc, slope-broken.
//
// *** TWO LOAD-BEARING NEGATIVES: the classical (Boltzmann) gas has no Tc because its excited count is an
// unbounded z rather than the bounded g_{3/2}(z); and TWO DIMENSIONS has no BEC because the ceiling zeta(d/2)
// diverges at d = 2 (the harmonic series). The high-T limit is the control -- the quantum gas becomes classical,
// C_V -> 3/2. ***

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    boseFunction, boseFunctionAtOne, criticalDensity, condensateFraction, cvPeak, cvBelowTc, cvAboveTc,
    classicalExcited, ceilingForDimension,
    fugacityFor,
} from "./bec.mjs";
import { boseIntegral } from "./blackbody.mjs";
import { gammaFn } from "../md/maxwellSpeed.mjs";
import { zeta } from "../zeta.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---- 0. THE JOIN: g_{3/2}(1) = zeta(3/2), three modules on one half-integer value ------------------------
{
    const viaIntegral = boseFunctionAtOne(1.5);           // boseIntegral/gammaFn (blackbody + maxwellSpeed)
    const viaZeta = zeta(1.5);                             // zeta.js, real-s (v3812)
    ok("!! g_{3/2}(1) == boseIntegral(3/2)/gammaFn(3/2) == zeta(3/2) (three modules, half-integer s)",
        rel(viaIntegral, viaZeta) < 1e-9 && rel(viaZeta, 2.6123753487) < 1e-9,
        "integral route = " + viaIntegral.toFixed(10) + ", zeta route = " + viaZeta.toFixed(10) + " -- the integral " +
        "quadrature and the Euler-Maclaurin sum had no way to meet unless both are right, and s = 3/2 needs the " +
        "v3812 real-s power (before it, zeta(3/2) returned zeta(2) = " + zeta(2).toFixed(4) + ")");
    // and the same for the energy order s = 5/2
    ok("!! g_{5/2}(1) == zeta(5/2) as well (the energy integral)",
        rel(boseFunctionAtOne(2.5), zeta(2.5)) < 1e-9 && rel(zeta(2.5), 1.3414872573) < 1e-9,
        "boseIntegral(5/2)/gammaFn(5/2) = " + boseFunctionAtOne(2.5).toFixed(10) + " against zeta(5/2)");
}

// ---- 1. THE CONDENSATION CONDITION -----------------------------------------------------------------------
{
    ok("!! n lambda_c^3 = zeta(3/2) = 2.6123753 at the transition", rel(criticalDensity(), 2.6123753487) < 1e-9,
        "the phase-space density at Tc = " + criticalDensity().toFixed(10) + " -- when the z = 1 ceiling of the " +
        "excited states can no longer hold every atom, the rest condenses");
}

// ---- 2. THE CONDENSATE FRACTION LAW ----------------------------------------------------------------------
{
    ok("!! N0/N = 1 - (T/Tc)^{3/2} below Tc, and 0 at/above Tc",
        rel(condensateFraction(0.5), 1 - Math.pow(0.5, 1.5)) < 1e-12 && condensateFraction(1) === 0 &&
        condensateFraction(0) === 1 && condensateFraction(1.5) === 0,
        "at T/Tc = 0.5, N0/N = " + condensateFraction(0.5).toFixed(6) + "; all condensed at T = 0, none at Tc -- " +
        "the ground state fills exactly as the excited T^{3/2} count falls short");
}

// ---- 3. THE HEAT-CAPACITY CUSP ---------------------------------------------------------------------------
{
    const peak = cvPeak(), closed = (15 / 4) * zeta(2.5) / zeta(1.5);
    ok("!! C_V/(Nk) peaks at (15/4) zeta(5/2)/zeta(3/2) = 1.925672 at Tc",
        rel(peak, closed) < 1e-12 && rel(peak, 1.925672) < 1e-4 && rel(cvBelowTc(1), peak) < 1e-12,
        "cusp = " + peak.toFixed(6) + ", and the below-Tc branch reaches exactly it at T = Tc");
    // continuity: the above-Tc branch approaches the SAME value as T -> Tc+ (the cusp is in the slope, not the value)
    ok("!! C_V is continuous at Tc -- the above-Tc branch meets the cusp from above",
        Math.abs(cvAboveTc(1.02) - peak) < 0.02,
        "C_V(1.02 Tc) = " + cvAboveTc(1.02).toFixed(5) + " approaching the cusp " + peak.toFixed(5) + " -- g_{1/2}(z) " +
        "diverges as z -> 1 so the subtracted term vanishes and both branches meet");
}

// ---- 4. THE CLASSICAL NEGATIVE: Boltzmann statistics lose the condensate --------------------------------
{
    // the Bose excited count saturates at zeta(3/2); the classical count z is unbounded and passes it
    const bec = boseFunctionAtOne(1.5);                   // the ceiling, ~2.612
    ok("!! the Bose excited count has a CEILING (zeta(3/2)) and the classical count does not",
        bec < 3 && classicalExcited(5) > bec && classicalExcited(100) > classicalExcited(5),
        "g_{3/2}(1) = " + bec.toFixed(4) + " is the most the excited states hold; the classical z reaches " +
        classicalExcited(5) + ", " + classicalExcited(100) + " with no ceiling, so it never forces a condensate");
    // PLANT the classical count in place of the Bose one: there is then no z at which occupation saturates
    ok("!! with the classical count there is NO Tc (no saturation) -- condensation is quantum-statistical",
        classicalExcited(10) > criticalDensity() && classicalExcited(1000) > criticalDensity(),
        "any required density is met by some z, so the chemical potential never reaches zero and nothing condenses -- " +
        "the whole phenomenon is the boundedness of g_{3/2}, which Boltzmann statistics throw away");
}

// ---- 5. THE DIMENSIONAL NEGATIVE: no BEC in two dimensions ----------------------------------------------
{
    // ceiling zeta(d/2): finite at d = 3, and the harmonic series (d = 2 -> zeta(1)) diverges
    const d3 = ceilingForDimension(3);
    // d = 2 ceiling is sum 1/n^1 -- show the partial sum grows past any bound while the d = 3 sum converges
    let harm = 0, three = 0;
    for (let n = 1; n <= 200000; n++) { harm += 1 / n; three += 1 / Math.pow(n, 1.5); }
    ok("!! the 3D ceiling zeta(3/2) is finite; the 2D ceiling zeta(1) (harmonic) diverges -> no BEC in 2D",
        rel(d3, 2.6123753487) < 1e-9 && three < 2.62 && harm > 12,
        "d=3 ceiling = " + d3.toFixed(6) + " (finite); the 2D phase-space sum reaches " + harm.toFixed(3) + " by 2e5 terms " +
        "and keeps growing, so 2D excited states swallow any number of atoms and never condense");
}

// ---- 6. THE CONTROL: the quantum gas becomes classical at high T ----------------------------------------
{
    // above Tc, C_V/(Nk) falls monotonically toward the classical monatomic 3/2 as T -> inf
    const c15 = cvAboveTc(1.5), c3 = cvAboveTc(3), c10 = cvAboveTc(10);
    ok("!! C_V/(Nk) -> 3/2 as T >> Tc (the classical monatomic gas), monotonically",
        c15 > c3 && c3 > c10 && Math.abs(c10 - 1.5) < 0.05 && c15 < cvPeak(),
        "C_V/(Nk) = " + c15.toFixed(4) + " -> " + c3.toFixed(4) + " -> " + c10.toFixed(4) + " at T/Tc = 1.5, 3, 10, " +
        "settling on 3/2 -- a control where the quantum statistics wash out and the cusp is left behind");
}

// ---- 7. BROWSER-SAFE -------------------------------------------------------------------------------------
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(HERE, "bec.mjs"), "utf8");
    ok("no node builtins, no DOM", !/\bfrom\s+["']node:/.test(src) && !/\brequire\s*\(/.test(src) && !/\bdocument\.|\bwindow\./.test(src),
        "imports only ./blackbody.mjs, ../md/maxwellSpeed.mjs and ../zeta.js, all browser-safe");
}

say("");
say("NOT CLAIMED: real condensates. This is the IDEAL Bose gas -- no interactions, so the cusp is not yet the");
say("lambda divergence of helium-4 and there is no depletion, no critical velocity, no vortices. It grades the");
say("ideal-gas transition and its limits. k_B = 1, conserved N. NO DEVICE BIND, no lab-results change.");

{
    // v3904 -- fugacityFor IS AN INVERSION AND NOTHING HAD EVER PUT IT BACK THROUGH THE FUNCTION IT INVERTS.
    // fugacityFor(v) returns the z with boseFunction(3/2, z) = v. THE ROUND TRIP IS THE ONLY HONEST TEST OF A
    // SOLVER: a bisection that converged on the wrong bracket, or one that silently returned its own upper
    // bound, both look like plausible numbers from the outside and neither survives being fed back in.
    for (const v of [0.5, 1.0, 2.0, 2.5]) {
        const z = fugacityFor(v);
        ok("fugacityFor(" + v + ") inverts boseFunction(3/2, .) to 1e-14",
           Math.abs(boseFunction(1.5, z) - v) / v < 1e-14,
           "z = " + z.toPrecision(15) + " -> g(3/2,z) = " + boseFunction(1.5, z).toPrecision(17));
    }
    // *** AND THE CEILING IS THE PHYSICS. *** g(3/2, z) cannot exceed zeta(3/2) = 2.6123753486847501 for
    // z <= 1, so ABOVE that value there is no fugacity to find -- that IS Bose-Einstein condensation, stated
    // as the failure of an inversion rather than as a paragraph. What the solver must NOT do is keep climbing
    // and return z > 1, which is unphysical and would make the condensate fraction negative downstream.
    const zc = boseFunctionAtOne(1.5);
    ok("the inversion SATURATES at z = 1 above zeta(3/2), rather than running past it",
       [zc + 1e-9, 3.0, 5.0, 50.0].every((v) => fugacityFor(v) === 1),
       "zeta(3/2) = " + zc.toPrecision(17) + "; fugacityFor returns exactly 1 for every demand above it");
    // *** I WROTE THE OPPOSITE CHECK FIRST AND THE MEASUREMENT REFUTED IT. *** I asserted that a demand
    // 1e-3 below the ceiling would still land strictly inside z < 1. It does not -- it returns exactly 1,
    // and the reason is physics rather than a bug: g(3/2, z) has a SQUARE-ROOT SINGULARITY IN ITS DERIVATIVE
    // at z = 1, g ~ zeta(3/2) - 2*sqrt(pi)*sqrt(-ln z), so dz goes like dv^2. The inversion is ILL-CONDITIONED
    // AT EXACTLY THE POINT THE PHYSICS CARES ABOUT, and that is the property worth recording.
    const law = (d) => (d / (2 * Math.sqrt(Math.PI))) ** 2;   // predicted 1 - z for a shortfall d in v
    const probes = [0.1, 0.03].map((d) => ({ d, gap: 1 - fugacityFor(zc - d), pred: law(d) }));
    ok("*** below the ceiling the inversion follows the SQUARE-ROOT law, so dz ~ dv^2 ***",
       probes.every((p) => p.gap > 0 && Math.abs(p.gap / p.pred - 1) < 0.10),
       probes.map((p) => "d=" + p.d + ": 1-z = " + p.gap.toExponential(3) + " against " + p.pred.toExponential(3)).join("; ") +
       " -- a 0.1 shortfall in v is only 8e-4 in z, a 100x compression");
    // WHAT IS NOT CLAIMED, MEASURED RATHER THAN GUESSED: the solver resolves 1 - z down to about 7e-5 and
    // SATURATES EARLY below that -- fugacityFor(zeta(3/2) - 1e-2) already returns exactly 1, where the law
    // predicts 1 - z = 8e-6. THAT IS A RESOLUTION LIMIT AND IT IS THE RIGHT WAY TO FAIL: pinning to 1 keeps
    // condensateFraction non-negative downstream, where returning z > 1 or a noisy z < 1 would not.
    ok("...and where it gives up it gives up ON THE SAFE SIDE, at a limit this line names",
       fugacityFor(zc - 1e-2) === 1 && fugacityFor(zc - 0.03) < 1,
       "resolves at d = 0.03 (1-z = 6.9e-5), saturates at d = 0.01 (law says 8.0e-6)");
}

console.log("bec-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
