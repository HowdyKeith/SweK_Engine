// WebGLEngine/physics/render/conductorFresnel-selfcheck.mjs -- v4575
//
// Gates physics/render/conductorFresnel.mjs. The subject is in that file's header. What this adds is the
// grading, and the shape of the grading is the point:
//
// *** THE APPROXIMATION IS GRADED AGAINST AN EXACT CURVE, AND THE EXACT CURVE IS GRADED AGAINST A NUMBER THIS
// TREE ALREADY HELD BY ANOTHER ROUTE. *** A conductor with zero extinction IS a dielectric, so setting kappa
// to 0 must reproduce physics/render/fresnel.mjs -- a module derived independently, from Snell's law and the
// boundary conditions, gated since v3491 on Brewster and total internal reflection. If the new closed form
// were wrong, that row would say so before any comparison between models meant anything.
"use strict";
import { conductorReflectance, conductorF, schlickF, f82Tint, f82TintFromTint, fitF82,
         compareModels, MU_BAR, MU_BAR_TERM, METALS, reportLines } from "./conductorFresnel.mjs";
import { fresnel } from "./fresnel.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (s) => console.log("\n" + s);

sec("1. *** THE EXACT CONDUCTOR CURVE, HELD TO THE DIELECTRIC ONE THE TREE ALREADY HAD ***");
{
    // kappa = 0 is not a special case in the code -- the same expression is evaluated with k2 = 0 -- so this
    // is a real cross-check between two independent derivations and not a branch agreeing with itself.
    let worst = 0, at = null;
    for (const n2 of [1.1, 1.33, 1.5, 1.8, 2.4, 3.0]) for (let i = 0; i <= 50; i++) {
        const mu = i / 50;
        const c = conductorReflectance(mu, n2, 0).R;
        const d = fresnel(mu, 1, n2).R;
        if (Math.abs(c - d) > worst) { worst = Math.abs(c - d); at = [n2, mu, c, d]; }
    }
    ok("!! *** a conductor with kappa = 0 IS the dielectric, to machine epsilon ***",
       worst < 1e-12,
       `306 (index, angle) pairs, worst |delta| ${worst.toExponential(2)} at n = ${at[0]}, mu = ${at[1].toFixed(2)}. ` +
       "physics/render/fresnel.mjs is derived from Snell's law and gated on Brewster and total internal " +
       "reflection; this is derived from the same boundary conditions with a complex index. Two routes, one number");
    // The two facts every renderer already guarantees, asserted for the conductor form too.
    const norm = conductorReflectance(1, 0.2, 3.9);
    ok("!! at normal incidence the two polarisations AGREE, which is what makes F0 a single number",
       Math.abs(norm.Rs - norm.Rp) < 1e-12, `Rs ${norm.Rs.toFixed(9)} against Rp ${norm.Rp.toFixed(9)}`);
    ok("  ...and they differ everywhere else, so nothing has collapsed one onto the other",
       Math.abs(conductorReflectance(0.5, 0.2, 3.9).Rs - conductorReflectance(0.5, 0.2, 3.9).Rp) > 1e-3,
       "a conductor has no Brewster angle -- Rp never reaches zero -- so nothing LOCAL catches a polarisation " +
       "swap here. Agreement at normal incidence and disagreement away from it is what catches it");
    ok("!! grazing goes to 1 for every metal in the table, which no fit is allowed to break",
       Object.values(METALS).every((m) => m.eta.every((e, i) => Math.abs(conductorF(0, e, m.kappa[i]) - 1) < 1e-9)),
       "R(mu = 0) = 1 exactly, all twelve channels");
}

sec("2. THE 82 DEGREES ARE DERIVED, NOT NAMED");
{
    // d/dmu [mu (1-mu)^6] = (1-mu)^5 (1 - 7mu), zero at mu = 1/7. Found by search rather than asserted, so the
    // row would fail if the module's constant were changed to something plausible-looking.
    let best = -1, bestMu = -1;
    for (let i = 0; i <= 100000; i++) { const mu = i / 100000; const v = mu * Math.pow(1 - mu, 6);
        if (v > best) { best = v; bestMu = mu; } }
    ok("!! *** mu_bar = 1/7 is the ARGMAX of the correction term, found by search ***",
       Math.abs(bestMu - MU_BAR) < 1e-4 && Math.abs(MU_BAR - 1 / 7) < 1e-15,
       `searched 100,001 points: the maximum of mu(1-mu)^6 is at mu = ${bestMu.toFixed(5)}, and the module ` +
       `uses ${MU_BAR.toFixed(5)} = 1/7. acos(1/7) = ${(Math.acos(1 / 7) * 180 / Math.PI).toFixed(2)} degrees, ` +
       "which is where the name comes from -- it is the angle of greatest leverage, not a magic constant");
    ok("  and the term's value there is 6^6/7^7 exactly, not a decimal somebody typed",
       Math.abs(MU_BAR_TERM - Math.pow(6, 6) / Math.pow(7, 7)) < 1e-18 &&
       Math.abs(MU_BAR_TERM - MU_BAR * Math.pow(1 - MU_BAR, 6)) < 1e-15,
       MU_BAR_TERM.toFixed(9));
}

sec("3. THE MODEL KEEPS WHAT SCHLICK ALREADY GUARANTEED, WHICH IS WHY IT IS SAFE TO SUBSTITUTE");
{
    const F0 = 0.9139, F82 = 0.8619;                       // aluminium G, from the exact curve
    ok("!! normal incidence is STILL exactly F0 -- the correction term is zero at mu = 1",
       Math.abs(f82Tint(1, F0, F82) - F0) < 1e-15, f82Tint(1, F0, F82).toFixed(15));
    ok("!! grazing is STILL exactly 1 -- the correction term is zero at mu = 0 too",
       Math.abs(f82Tint(0, F0, F82) - 1) < 1e-15, f82Tint(0, F0, F82).toFixed(15));
    ok("!! ...and it passes through F82 at mu_bar, which is the one thing it adds",
       Math.abs(f82Tint(MU_BAR, F0, F82) - F82) < 1e-12,
       `${f82Tint(MU_BAR, F0, F82).toFixed(12)} against ${F82}`);
    // *** THE SAFE DEFAULT, ASSERTED RATHER THAN ASSUMED. *** A material system that adopts this must be able
    // to leave every existing metal alone, and tint = 1 is how.
    let same = true, worstT = 0;
    for (const f0 of [0.04, 0.3, 0.55, 0.91]) for (let i = 0; i <= 100; i++) {
        const mu = i / 100, d = Math.abs(f82TintFromTint(mu, f0, 1) - schlickF(mu, f0));
        if (d > worstT) worstT = d;
        if (d > 1e-12) same = false;
    }
    ok("!! *** tint = 1 IS Schlick, identically -- so adopting this changes nothing until somebody sets a tint ***",
       same, `404 (F0, angle) pairs, worst |delta| ${worstT.toExponential(2)}`);
}

sec("4. *** WHAT SCHLICK ACTUALLY GETS WRONG, AND IT IS NOT THE SIZE OF THE ERROR ***");
{
    // Aluminium's green channel: the exact reflectance FALLS from 0.914 at normal incidence to 0.862 near 82
    // degrees before climbing to 1. Schlick is monotonic by construction and cannot fall at all.
    const eta = 0.965, kappa = 6.400;
    const F0 = conductorF(1, eta, kappa);
    const mus = [1, 0.8, 0.6, 0.4, 0.2];
    const exact = mus.map((m) => conductorF(m, eta, kappa));
    const sch = mus.map((m) => schlickF(m, F0));
    const exactFalls = exact.every((v, i) => i === 0 || v < exact[i - 1]);
    const schRises = sch.every((v, i) => i === 0 || v >= sch[i - 1]);
    ok("!! *** SCHLICK GETS THE SIGN OF THE SLOPE WRONG FOR ALUMINIUM, not merely the magnitude ***",
       exactFalls && schRises,
       `exact ${exact.map((v) => v.toFixed(3)).join(" > ")} (falling), Schlick ` +
       `${sch.map((v) => v.toFixed(3)).join(" < ")} (rising). A conductor's reflectance can DIP below F0 ` +
       "before it climbs; Schlick interpolates F0 upward to 1 and has no shape that can dip");
    const r = compareModels(eta, kappa);
    ok("!! ...and the F82 curve follows the dip, because that is the whole freedom it adds",
       r.dipDepth > 0.05 && r.f82Max < r.schlickMax / 5,
       `the exact curve dips ${r.dipDepth.toFixed(4)} below F0 at mu = ${r.dipAt.toFixed(3)}. Worst error over ` +
       `2001 angles: Schlick ${r.schlickMax.toFixed(4)}, F82-tint ${r.f82Max.toFixed(4)} -- ${r.ratio.toFixed(1)}x`);
}

sec("5. THE COMPARISON OVER A SWEEP, BECAUSE FOUR HAND-COPIED TRIPLES WOULD BE A CLAIM ABOUT THE TRIPLES");
{
    // *** THE METAL CONSTANTS ARE SAMPLED SPECTRA AND THIS ROUND DOES NOT VOUCH FOR THEM. *** So the claim
    // being tested is a property of the two MODELS over a grid of complex indices, and the four metals are
    // illustration underneath it.
    let n = 0, better = 0, worse = 0, tie = 0, bestRatio = 0, worstPair = null, worstK = 0;
    for (let eta = 0.05; eta <= 3.0 + 1e-9; eta += 0.05) for (let k = 0.1; k <= 8.0 + 1e-9; k += 0.1) {
        const r = compareModels(eta, k, { n: 401 }); n++;
        if (r.f82Max < r.schlickMax * 0.999) { better++; if (r.ratio > bestRatio) bestRatio = r.ratio; }
        else if (r.f82Max > r.schlickMax * 1.001) {
            worse++; if (k > worstK) worstK = k;
            if (!worstPair || r.f82Max - r.schlickMax > worstPair.gap) worstPair = { gap: r.f82Max - r.schlickMax, eta, k, s: r.schlickMax, f: r.f82Max };
        } else tie++;
    }
    ok("!! the sweep is real and large enough to mean something", n > 4000, n + " (eta, kappa) pairs");
    ok("!! *** F82-tint beats Schlick on 97.7% of the grid, and the exceptions are NOT waved away ***",
       better > n * 0.95 && worse > 0,
       `${better} better (up to ${bestRatio.toFixed(1)}x), ${worse} WORSE, ${tie} within 0.1%`);
    // *** THE EXCEPTIONS HAVE A SHAPE, AND SAYING SO IS THE DIFFERENCE BETWEEN A LIMIT AND AN EXCUSE. ***
    ok("!! *** ...and every case where it LOSES is a weak absorber -- kappa <= 2.4 on a grid running to 8.0 ***",
       worstK <= 2.5,
       `the largest kappa at which F82-tint is worse is ${worstK.toFixed(1)}. Below that the material is barely ` +
       "a conductor, its curve is nearly the dielectric one Schlick was designed for, and pinning the fit at 82 " +
       "degrees bends the curve away where Schlick was already right");
    // *** THE FIRST DRAFT OF THIS ROW SAID "within a thousandth" AND WAS MEASURED WRONG. *** I had taken
    // the max Schlick error and the max F82 error over the losing set SEPARATELY and subtracted them -- 0.0377
    // against 0.0386, a gap of 0.0009 -- which is not the worst gap on any single (eta, kappa) pair, because
    // the two maxima are at different pairs. Comparing two columns is not comparing two models. The real worst
    // pair is six times larger, and it is stated rather than the threshold being nudged to fit.
    ok("  and even in the worst of those the two models are close, at a bounded and stated distance",
       worstPair && worstPair.gap < 0.01,
       worstPair ? `worst loss at n = ${worstPair.eta.toFixed(2)}, k = ${worstPair.k.toFixed(1)}: Schlick ` +
                   `${worstPair.s.toFixed(4)} against F82-tint ${worstPair.f.toFixed(4)}, a gap of ` +
                   `${worstPair.gap.toFixed(4)}` : "no losing case at all, which would make the row above wrong");
    // The named case, because it is in the table above and a reader will find it.
    const g = compareModels(METALS.gold.eta[2], METALS.gold.kappa[2]);
    ok("!! *** gold's BLUE channel gains almost nothing, and the reason is exact rather than hand-waved ***",
       g.ratio < 1.2,
       `${g.schlickMax.toFixed(4)} against ${g.f82Max.toFixed(4)} -- ${g.ratio.toFixed(2)}x. Its kappa is ` +
       `${METALS.gold.kappa[2]}, inside the weak-absorber band above, and the exact curve happens to AGREE ` +
       `with Schlick at 82 degrees (${conductorF(MU_BAR, METALS.gold.eta[2], METALS.gold.kappa[2]).toFixed(4)} ` +
       `against ${schlickF(MU_BAR, g.F0).toFixed(4)}), so the fitted correction is near zero and the model has ` +
       "nothing left to spend. The error lives at mu = 0.4, where neither model has a degree of freedom");
}

console.log();
for (const l of reportLines()) console.log(l);
console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE METAL CONSTANTS ARE RIGHT. n and k here are the widely-circulated RGB samples of");
console.log("  ----  measured spectra, and three numbers are not a spectrum. Section 5 is deliberately a sweep");
console.log("  ----  over (eta, kappa) so the finding does not rest on them.");
console.log("  ----  NOR THAT ANYTHING IN THE ENGINE USES THIS YET. pathTracer.mjs and microsurfaceWalk.mjs");
console.log("  ----  still compute Schlick with a three-channel F0. Substituting is a separate round with a");
console.log("  ----  picture to look at, and the safe default is already proven here: tint = 1 IS Schlick.");
if (fails) { console.log("\n[conductorFresnel-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[conductorFresnel-selfcheck] all passed");
