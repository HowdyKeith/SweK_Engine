// WebGLEngine/physics/render/microfacet-selfcheck.mjs -- v3490
//
// Run: node physics/render/microfacet-selfcheck.mjs   (~2s)
//
// *** THE FURNACE TEST'S ACTUAL PURPOSE: DOES THIS MATERIAL MODEL CONSERVE ENERGY. *** v3467 built the furnace
// for a Lambertian surface, where the answer is the albedo and the fault is a wrong sampler. That is not what
// the test is for in practice -- its real job is the one below, and SweK could not ask it until now because it
// had no BRDF beyond a constant.
//
// *** THE RESULT, AND IT IS THIS SESSION'S RECURRING ONE AGAIN: THE CHECK EVERYBODY WRITES FIRST -- "does the
// NDF integrate to one" -- IS BIT-BLIND TO TWO OF THE THREE PLANTS, INCLUDING THE ONE A REAL PERSON ACTUALLY
// MAKES. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ndfIntegral, furnaceIntegral, directionalAlbedo, D, G1, G2, Lambda, sampleHalfVector, sampleDirPdf, bounceWeight, bsdfEval, misWeight } from "./microfacet.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const ALPHAS = [0.05, 0.1, 0.2, 0.4, 0.6, 1.0];
const ANGLES = [0.9, 0.5, 0.2];

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE NDF NORMALISES, AND THE RESIDUAL IS THE INTEGRATOR'S -- PROVEN BY REFINEMENT, NOT BY TOLERANCE
 * --------------------------------------------------------------------------------------------------------- */
{
    const vals = ALPHAS.map((a) => ndfIntegral(a));
    say(`INT D cos dm over the hemisphere: ${vals.map((v) => v.toFixed(9)).join(", ")}`);
    ok("!! *** D IS A DISTRIBUTION: IT INTEGRATES TO 1 AT EVERY ROUGHNESS ***",
       vals.every((v) => Math.abs(v - 1) < 1e-5),
       "This is what makes D a normal DISTRIBUTION rather than a lobe shape. A wrong constant in it is invisible in a picture -- it rescales every highlight equally and reads as a brighter material.");

    const refine = [500, 1000, 2000, 4000, 8000].map((N) => Math.abs(ndfIntegral(0.05, { N }) - 1));
    const ratios = refine.slice(1).map((v, i) => refine[i] / v);
    say(`refinement at the sharpest lobe (alpha 0.05): ${refine.map((v) => v.toExponential(2)).join(" -> ")}  ratios ${ratios.map((r) => r.toFixed(3)).join(", ")}`);
    ok("!! *** THE RESIDUAL IS THE QUADRATURE'S AND ITS ORDER IS EXACTLY 2, MEASURED RATHER THAN ASSERTED ***",
       ratios.every((r) => r > 3.9 && r < 4.1),
       "*** THE ERROR QUARTERS EVERY TIME THE GRID DOUBLES, which is midpoint quadrature's own claim and not a tolerance anybody chose. A residual that did NOT fall at that rate would mean the identity itself was broken rather than merely under-resolved -- so this separates 'the integrator is coarse' from 'the physics is wrong', and only one of those is acceptable. The sharpest lobe is used because a narrow one is the hardest case, not the easiest. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE WEAK WHITE FURNACE TEST: ONE AT EVERY ROUGHNESS AND EVERY ANGLE
 * --------------------------------------------------------------------------------------------------------- */
{
    const grid = ALPHAS.map((a) => ANGLES.map((c) => furnaceIntegral(a, c)));
    for (let i = 0; i < ALPHAS.length; i++) say(`  alpha ${String(ALPHAS[i]).padEnd(5)} weak furnace at cos_o ${ANGLES.join("/")}: ${grid[i].map((v) => v.toFixed(6)).join("  ")}`);
    ok("!! *** THE WEAK FURNACE TEST READS 1, EVERYWHERE ON THE GRID ***",
       grid.every((row) => row.every((v) => Math.abs(v - 1) < 2e-3)),
       "*** IT HOLDS ONLY IF D AND G1 ARE MUTUALLY CONSISTENT, which is the entire reason this test exists rather than being a restatement of section 1. It is a parameter-that-must-not-matter key with TWO parameters -- roughness AND view angle -- and nothing in the integrand is told the answer. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THREE PLANTS, AND THE CHECK EVERYBODY WRITES FIRST IS BLIND TO TWO OF THEM ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const cleanNdf = ndfIntegral(0.4), cleanWeak = furnaceIntegral(0.5, 0.5);

    const noPiNdf = ndfIntegral(0.4, { plant: { noPi: true } });
    say(`noPi: NDF ${noPiNdf.toFixed(6)} against pi = ${Math.PI.toFixed(6)}`);
    ok("!! the missing-pi plant lands on a PREDICTED CONSTANT with no free parameter",
       Math.abs(noPiNdf - Math.PI) < 1e-4,
       "Drop the normalising pi and the integral reads EXACTLY pi. A predicted factor rather than 'too big' -- v3467's rule, in a different subject.");

    const noJacNdf = ndfIntegral(0.4, { plant: {}, noJacobian: true });
    const noJacWeak = furnaceIntegral(0.5, 0.5, { noJacobian: true });
    say(`noJacobian: NDF ${noJacNdf.toFixed(9)} (clean ${cleanNdf.toFixed(9)}) | weak furnace ${noJacWeak.toFixed(6)}`);
    ok("!! *** DROPPING THE HALF-VECTOR JACOBIAN READS EXACTLY FOUR, AND THE NDF CHECK IS BIT-BLIND TO IT ***",
       Math.abs(noJacWeak / cleanWeak - 4) < 0.01 && noJacNdf === cleanNdf,
       "*** THERE IS NO 4 IN D, so a normalisation error living in the BRDF cannot be seen by the check that normalises the DISTRIBUTION -- and a factor of four is not subtle, it is a surface four times too bright. The two checks are one section apart and only one of them can find it. ***");

    const beckNdf = ALPHAS.map((a) => ndfIntegral(a, { plant: { beckmann: true } }));
    const beckWeak = ALPHAS.map((a) => furnaceIntegral(a, 0.5, { plant: { beckmann: true } }));
    say(`mismatched Lambda (Beckmann's, used with GGX's D): weak furnace ${beckWeak.map((v) => v.toFixed(4)).join(", ")} across alpha ${ALPHAS.join(", ")}`);
    ok("!! *** THE PLANT A REAL PERSON MAKES: A MASKING FUNCTION FROM A DIFFERENT DISTRIBUTION ***",
       beckWeak[beckWeak.length - 1] > 1.25 && ALPHAS.every((a, i) => beckNdf[i] === ndfIntegral(a)),
       "*** BOTH FORMS ARE PUBLISHED BESIDE EACH OTHER AND NEITHER LOOKS WRONG ON ITS OWN. Beckmann's Lambda is a real function, correctly implemented here, and it belongs to a different microfacet distribution. IT LEAVES D UNTOUCHED, so section 1 is bit-blind to it, AND IT LEAVES THE PICTURE PLAUSIBLE. This pairing is precisely what the weak white furnace test was invented to catch. ***");

    ok("!! *** AND IT IS INVISIBLE AT LOW ROUGHNESS, WHICH IS WHERE ANYBODY WOULD TEST FIRST ***",
       Math.abs(beckWeak[0] - 1) < 0.01 && beckWeak[beckWeak.length - 1] - 1 > 0.25,
       `${(Math.abs(beckWeak[0] - 1) * 100).toFixed(2)}% off at alpha ${ALPHAS[0]} against ${((beckWeak[beckWeak.length - 1] - 1) * 100).toFixed(1)}% at alpha 1.0. *** AT A SMOOTH ROUGHNESS THE ERROR SITS INSIDE ANY TOLERANCE ANYBODY WOULD WRITE, and a suite that swept only the glossy end would certify it. THE CASES ARE TOLD APART BY THE TREND, NOT BY WHETHER THE NUMBER IS SMALL -- v3420's Hall rule arriving in rendering. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE STRONG TEST: WHERE THE ENERGY ACTUALLY GOES
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = ALPHAS.map((a) => ({ a, E: ANGLES.map((c) => directionalAlbedo(a, c)) }));
    for (const r of rows) say(`  alpha ${String(r.a).padEnd(5)} E at cos_o ${ANGLES.join("/")}: ${r.E.map((v) => v.toFixed(6)).join("  ")}   deficit head-on ${(1 - r.E[0]).toExponential(2)}`);

    ok("!! *** A WHITE, NON-ABSORBING GGX SURFACE THROWS AWAY UP TO 67% OF THE LIGHT ***",
       rows.every((r) => r.E.every((v) => v <= 1 + 1e-6)) && rows[rows.length - 1].E[0] < 0.4,
       "*** F = 1 AND THERE IS NO ABSORPTION ANYWHERE IN THE MODEL, so a conserving BRDF would return exactly 1. The shortfall IS the energy that scattering BETWEEN microfacets would have returned and single-scattering GGX never does. It is not a bug and it is not a tolerance -- it is a measured curve, and a renderer that shipped it without knowing the number is one that cannot tell this from a wrong constant. ***");

    ok("...and the deficit is MONOTONE in roughness at every angle",
       ANGLES.every((_, j) => rows.every((r, i) => i === 0 || r.E[j] <= rows[i - 1].E[j] + 1e-9)),
       "A single reading could be matched by a wrong constant; a curve that falls at every angle as roughness rises could not.");

    ok("!! *** AND THE SMOOTH END IS THE DANGEROUS END: 0.3% AT alpha 0.05 AGAINST 67% AT alpha 1 ***",
       1 - rows[0].E[0] < 0.01 && 1 - rows[rows.length - 1].E[0] > 0.6,
       "The same shape as the Beckmann plant one section up, and for the same reason: A MATERIAL MODEL THAT IS 0.3% DARK PASSES EVERY EYE AND EVERY TOLERANCE, and the model that is 67% dark is the SAME MODEL at a knob setting somebody will use.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE ORDERING BETWEEN HEAD-ON AND GRAZING INVERTS, AND THE CROSSING IS RECOVERED BY BISECTION ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const gap = (a) => directionalAlbedo(a, 0.9, { N: 300, M: 300 }) - directionalAlbedo(a, 0.2, { N: 300, M: 300 });
    let lo = 0.05, hi = 0.6;
    const gLo = gap(lo), gHi = gap(hi);
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (Math.sign(gap(mid)) === Math.sign(gLo)) lo = mid; else hi = mid; }
    const cross = (lo + hi) / 2;
    say(`E(head-on) - E(grazing): ${gLo.toExponential(2)} at alpha 0.05, ${gHi.toExponential(2)} at alpha 0.6 -- crossing bisected to alpha = ${cross.toFixed(6)}`);

    ok("!! *** WHICH VIEW ANGLE LOSES MORE ENERGY DEPENDS ON THE ROUGHNESS, AND THE TWO REGIMES SWAP ***",
       gLo > 0 && gHi < 0 && cross > 0.2 && cross < 0.5,
       "*** AT A SMOOTH ROUGHNESS THE GRAZING VIEW LOSES MORE; AT A ROUGH ONE THE HEAD-ON VIEW DOES. The curves CROSS, and the crossing is recovered from the SIGN of a comparison with nothing in the loop told where it is -- friction's bifurcation key (v3200) in a new subject. A wrong masking function would have to reproduce both regimes AND the location where they swap, which a single reading at one angle could never ask for. ***");

    const hc = directionalAlbedo(0.8, 0.5), sep = directionalAlbedo(0.8, 0.5, { plant: { separable: true } });
    say(`height-correlated ${hc.toFixed(6)} against separable G1(o)G1(i) ${sep.toFixed(6)} at alpha 0.8`);
    ok("!! the separable form is NOT a plant, it is the other legitimate choice -- and the two are measurably different",
       sep < hc && (hc - sep) / hc > 0.02,
       `${((hc - sep) / hc * 100).toFixed(2)}% apart. Assuming masking and shadowing are INDEPENDENT loses more energy than accounting for their correlation, which is what 'height-correlated' means. NAMING IT A DIFFERENT MODEL RATHER THAN A FAULT IS THE POINT: a gate that failed on it would be asserting a preference, and one that ignored it would let a silent substitution pass.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html imports the model and calls the furnace integrals",
       /from\s*"\/physics\/render\/microfacet\.mjs"/.test(src) && /directionalAlbedo\(/.test(src),
       "A .mjs with no page is the CLI-only deliverable this project refuses. The assertion is on the IMPORT and the CALL rather than on the name appearing, because a check counting its own prose is this tree's most-committed defect.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. SAMPLING: THE HALF-VECTOR SAMPLER, ITS PDF, AND THE ALGEBRA THAT COLLAPSES eval*cosI/pdf INTO bounceWeight
 * --------------------------------------------------------------------------------------------------------- */
{
    const { rng } = await import("./furnace.mjs");

    // sampleHalfVector: the samples it draws must actually be distributed proportional to D(cosH)*cosH -- not
    // merely "look plausible". Checked by the importance-sampling identity E[1/pdf(X)] = measure(domain): if
    // p(wh) = D(cosH,alpha)*cosH is really the density sampleHalfVector draws from, averaging the RECIPROCAL of
    // that density over its own samples must converge to the solid angle of the hemisphere, 2*pi -- exactly, no
    // free parameter, and independent of the fact that ndfIntegral already proved D*cosH integrates to 1
    // (that proved the FORMULA normalises; this proves the SAMPLER actually follows it).
    for (const alpha of [0.3, 0.6]) {
        const rand = rng(alpha === 0.3 ? 71 : 73);
        let acc = 0, n = 250000;
        for (let i = 0; i < n; i++) {
            const s = sampleHalfVector(rand(), rand(), alpha);
            const cosH = s[1];
            acc += 1 / (D(cosH, alpha) * cosH);
        }
        const estimate = acc / n;
        ok(`!! *** sampleHalfVector's OWN SAMPLES, IMPORTANCE-WEIGHTED BY D*cosH, RECOVER THE HEMISPHERE'S 2*pi (alpha ${alpha}) ***`,
           Math.abs(estimate / (2 * Math.PI) - 1) < 0.02,
           `${estimate.toFixed(4)} against 2*pi = ${(2 * Math.PI).toFixed(4)}. A sampler that drew from the wrong density (wrong CDF inversion, swapped u1/u2, wrong axis) would bias this estimate away from 2*pi even though every individual sample still looks like a plausible unit vector on the hemisphere.`);
    }

    // Every half-vector must be a unit vector on the upper hemisphere -- the domain sampleDirPdf's Jacobian and
    // bsdfEval's cosH both assume.
    {
        const rand = rng(77);
        let maxLenErr = 0, minCosH = Infinity;
        for (let i = 0; i < 20000; i++) {
            const s = sampleHalfVector(rand(), rand(), 0.4);
            maxLenErr = Math.max(maxLenErr, Math.abs(s[0] * s[0] + s[1] * s[1] + s[2] * s[2] - 1));
            minCosH = Math.min(minCosH, s[1]);
        }
        ok("!! sampleHalfVector returns unit vectors with cosH >= 0", maxLenErr < 1e-9 && minCosH >= 0,
           `worst |len^2-1|: ${maxLenErr.toExponential(2)}, min cosH: ${minCosH.toFixed(6)} over 20000 draws.`);
    }

    // sampleDirPdf: the Jacobian term is exactly 1/(4|dotOH|), so at FIXED cosH and alpha the pdf must scale as
    // exactly 1/dotOH -- an exact algebraic ratio with no quadrature or Monte Carlo involved.
    {
        const cosH = 0.83, alpha = 0.35;
        const p1 = sampleDirPdf(cosH, 0.2, alpha), p2 = sampleDirPdf(cosH, 0.6, alpha);
        ok("!! sampleDirPdf scales as exactly 1/|dotOH| at fixed cosH and alpha (the reflection Jacobian, isolated)",
           Math.abs((p1 * 0.2) / (p2 * 0.6) - 1) < 1e-12,
           `pdf(dotOH=0.2)*0.2 = ${(p1 * 0.2).toFixed(9)} against pdf(dotOH=0.6)*0.6 = ${(p2 * 0.6).toFixed(9)}. Anything other than a bare 1/dotOH dependence -- a missing abs, a stray factor of cosO -- would break this ratio.`);
    }

    // bsdfEval: Helmholtz reciprocity. f(wo,wi) must equal f(wi,wo) -- swapping cosO and cosI leaves D(cosH)
    // untouched (it does not see the swap at all) and G2's height-correlated form is manifestly symmetric in its
    // two cosines, so the whole expression must be invariant. This is an EXACT identity, not a measured one.
    {
        const rand = rng(83);
        let maxAsym = 0, allNonNeg = true;
        for (let i = 0; i < 500; i++) {
            const cosO = 0.05 + 0.9 * rand(), cosI = 0.05 + 0.9 * rand(), cosH = 0.05 + 0.9 * rand(), alpha = 0.05 + 0.9 * rand();
            const fwd = bsdfEval(cosO, cosI, cosH, alpha), rev = bsdfEval(cosI, cosO, cosH, alpha);
            maxAsym = Math.max(maxAsym, Math.abs(fwd - rev) / Math.max(fwd, rev, 1e-300));
            if (fwd < 0) allNonNeg = false;
        }
        ok("!! *** bsdfEval OBEYS HELMHOLTZ RECIPROCITY: f(cosO,cosI) === f(cosI,cosO), EXACTLY, OVER 500 RANDOM CONFIGURATIONS ***",
           maxAsym < 1e-12 && allNonNeg,
           `worst relative |f(o,i)-f(i,o)|: ${maxAsym.toExponential(2)}. A physically-based BRDF must be symmetric under exchanging the incoming and outgoing directions -- a bug that mixed up which cosine gets which role (e.g. only cosO appearing in G2, or the wrong one in the denominator) would break this while D and G2's own checks elsewhere stay green.`);
    }

    // bounceWeight: the throughput weight is DERIVED algebraically from f*cosI/pdf (the comment above it in
    // microfacet.mjs shows the cancellation), so the two must agree numerically -- checked with bsdfEval and
    // sampleDirPdf computed independently, not by re-reading the comment.
    {
        const rand = rng(89);
        let maxRel = 0;
        for (let i = 0; i < 500; i++) {
            const cosO = 0.05 + 0.9 * rand(), cosI = 0.05 + 0.9 * rand(), cosH = 0.05 + 0.9 * rand(),
                  dotOH = 0.05 + 0.9 * rand(), alpha = 0.05 + 0.9 * rand(), F = 0.3 + 0.6 * rand();
            const w = bounceWeight(cosO, cosI, cosH, dotOH, alpha, { F });
            const viaEval = bsdfEval(cosO, cosI, cosH, alpha, { F }) * cosI / sampleDirPdf(cosH, dotOH, alpha);
            maxRel = Math.max(maxRel, Math.abs(w - viaEval) / Math.max(Math.abs(w), Math.abs(viaEval), 1e-300));
        }
        ok("!! *** bounceWeight === bsdfEval(...) * cosI / sampleDirPdf(...), THE ALGEBRAIC REDUCTION VERIFIED NUMERICALLY OVER 500 RANDOM CONFIGURATIONS ***",
           maxRel < 1e-9,
           `worst relative disagreement: ${maxRel.toExponential(2)}. bounceWeight is a hand-simplified closed form of f*cos_i/pdf with D cancelled out; this ties it back to bsdfEval and sampleDirPdf, computed independently, so an arithmetic slip in the simplification (wrong power of cosH, dropped |wo.wh|) cannot pass unnoticed just because it still looks like a plausible weight.`);

        ok("...and bounceWeight is exactly 0 below the horizon on either side, which the reduced form does not enforce on its own",
           bounceWeight(-0.1, 0.5, 0.8, 0.5, 0.4) === 0 && bounceWeight(0.5, -0.1, 0.8, 0.5, 0.4) === 0,
           "the closed form F*G2*|wo.wh|/(cosO*cosH) has no cosI in it at all, so the cosI<=0 guard is the ONLY thing stopping a light-leak weight from a direction below the surface -- an easy line to lose while simplifying the algebra.");
    }

    // misWeight: the balance heuristic. p_i/(p1+p2) summed over the two strategies is 1 BY CONSTRUCTION -- an
    // exact identity, and the reason combining two sampling strategies does not double- or under-count energy.
    {
        const rand = rng(97);
        let maxDev = 0, allBounded = true;
        for (let i = 0; i < 2000; i++) {
            const p1 = rand() * 10, p2 = rand() * 10;
            const w1 = misWeight(p1, p2), w2 = misWeight(p2, p1);
            maxDev = Math.max(maxDev, Math.abs(w1 + w2 - 1));
            if (w1 < 0 || w1 > 1 || w2 < 0 || w2 > 1) allBounded = false;
        }
        ok("!! *** THE BALANCE-HEURISTIC WEIGHTS SUM TO EXACTLY 1 FOR EVERY PAIR OF POSITIVE PDFS, OVER 2000 RANDOM PAIRS ***",
           maxDev < 1e-12 && allBounded,
           `worst |misWeight(p1,p2)+misWeight(p2,p1)-1|: ${maxDev.toExponential(2)}. This is the whole reason MIS does not double-count: the two strategies' weights partition unity exactly, by construction, for every pair of positive sample densities -- not approximately for some of them.`);
        ok("...and misWeight(0,0) = 0 rather than NaN, the degenerate case where neither strategy could have sampled the direction",
           misWeight(0, 0) === 0, `misWeight(0,0) = ${misWeight(0, 0)}.`);
    }
}

console.log(fails ? "\nmicrofacet-selfcheck: " + fails + " FAILED" : "\nmicrofacet-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
