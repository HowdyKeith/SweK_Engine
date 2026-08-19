// WebGLEngine/physics/render/microfacet-selfcheck.mjs -- v3490
//
// Run: node physics/render/microfacet-selfcheck.mjs   (~5s)
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
import { ndfIntegral, furnaceIntegral, directionalAlbedo, D, G1, G2, Lambda,
         sampleHalfVector, sampleDirPdf, bounceWeight, bsdfEval } from "./microfacet.mjs";
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
 * 6. *** THE SAMPLING HALF, WHICH THIS GATE HAD NEVER NAMED: FOUR EXPORTS, ZERO ASSERTIONS ***
 *
 * v3904 -- sampleHalfVector, sampleDirPdf, bounceWeight and bsdfEval shipped at v3493 and v3495 and THIS FILE
 * DID NOT CONTAIN ONE OF THEIR NAMES. They are reached only through pathTracer.mjs, so every claim about them
 * was really a claim about the PATH TRACER'S keys -- the "protected indirectly" class, and the whole point of
 * naming it is that indirect protection is a HOPE until somebody measures it. Nothing below is a mention: each
 * is an identity with a plant beside it, because a gate that only imports a symbol is how the count got here.
 * --------------------------------------------------------------------------------------------------------- */
{
    // *** THE SAMPLER'S FRAME IS Y-UP and every integral in this file is Z-UP. That is not a defect in either
    // one -- sampleHalfVector matches furnace.mjs's toWorld, which reads s[1] as the normal component -- but it
    // IS the one place a caller can be wrong while no function here is, so it is converted explicitly. ***
    const zUp = (h) => [h[0], h[2], h[1]];

    // ---- 6a. THE SAMPLER INVERTS THE NDF'S CDF, AND THAT IS AN IDENTITY RATHER THAN A HISTOGRAM ----------
    //
    // A distribution check by histogram needs a tolerance and a sample count. The inversion does not: solving
    // cos_h^2 = (1-u)/(u(a^2-1)+1) for u gives u = (1-c^2)/(c^2(a^2-1)+1), so the sample must return the very
    // u it was handed. A wrong CDF fails this at machine precision with no statistics in the way.
    let worstU = 0, worstLen = 0;
    for (const a of ALPHAS) {
        for (let i = 1; i < 400; i++) {
            const u = i / 400, h = sampleHalfVector(u, 0.37, a), c = h[1];
            worstU = Math.max(worstU, Math.abs((1 - c * c) / (c * c * (a * a - 1) + 1) - u));
            worstLen = Math.max(worstLen, Math.abs(Math.hypot(h[0], h[1], h[2]) - 1));
        }
    }
    ok("!! *** sampleHalfVector INVERTS THE GGX CDF: EVERY SAMPLE RETURNS THE u IT WAS HANDED ***",
       worstU < 1e-12,
       `worst |u_recovered - u| = ${worstU.toExponential(2)} over ${ALPHAS.length} roughnesses. THE CLOSED FORM IS ITS OWN KEY -- no histogram, no sample count, no tolerance chosen by whoever wrote the check.`);
    ok("...and it returns a unit vector, so a caller may rotate it without renormalising",
       worstLen < 1e-12, `worst ||h| - 1| = ${worstLen.toExponential(2)}`);

    // ---- 6b. THE DIRECTION PDF'S TOTAL MASS ---------------------------------------------------------------
    //
    // sampleDirPdf is the half-vector density carried through the reflection: p(wi) = D(cos_h) cos_h / (4|wo.wh|).
    // A change of variable MOVES mass and cannot create it, so integrating the result over every wi the map can
    // reach must return the NDF mass it started from -- 1 at a normal view, and LESS at a grazing one because
    // the half-vectors more than 90 degrees from wo are never reached. Both halves are asserted; reporting only
    // the first would call a correct implementation leaky at grazing.
    const dirMass = (alpha, cosO, pdf, N = 300) => {
        const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, 0, cosO];
        const dth = Math.PI / N, dph = Math.PI / N;
        let s = 0;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const ph = (j + 0.5) * dph, wi = [st * Math.cos(ph), st * Math.sin(ph), ct];
                const hx = wo[0] + wi[0], hy = wo[1] + wi[1], hz = wo[2] + wi[2], hl = Math.hypot(hx, hy, hz);
                if (hl < 1e-9) continue;
                const wh = [hx / hl, hy / hl, hz / hl], dotOH = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
                if (dotOH <= 0 || wh[2] <= 0) continue;
                s += pdf(wh[2], dotOH, alpha) * st * dth * dph;
            }
        }
        return s * 2;
    };
    // and the mass it started from: the NDF restricted to the half-vectors the reflection can actually reach.
    const reachableNdf = (alpha, cosO, N = 300) => {
        const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, 0, cosO];
        const dth = (Math.PI / 2) / N, dph = Math.PI / N;
        let s = 0;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const ph = (j + 0.5) * dph, wh = [st * Math.cos(ph), st * Math.sin(ph), ct];
                if (wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2] <= 0) continue;
                s += D(ct, alpha) * ct * st * dth * dph;
            }
        }
        return s * 2;
    };
    const good = (c, d, a) => sampleDirPdf(c, d, a);
    const headOn = ALPHAS.map((a) => dirMass(a, 1, good));
    say(`INT p(wi) dwi at a normal view: ${headOn.map((v) => v.toFixed(6)).join(", ")}`);
    ok("!! *** THE REFLECTION JACOBIAN MOVES THE NDF'S MASS AND DOES NOT CREATE IT: THE DIRECTION PDF INTEGRATES TO 1 ***",
       headOn.every((v) => Math.abs(v - 1) < 3e-3),
       "at every roughness, at a normal view. This is the property that makes the estimator's division by pdf legitimate at all, and it is the ONLY check here that can see the 1/(4|wo.wh|) -- the NDF normalisation in section 1 cannot, because there is no 4 in D.");

    // *** THE GRAZING HALF IS QUADRATURE-LIMITED AND IS THEREFORE PROVEN BY REFINEMENT RATHER THAN BY A
    // TOLERANCE, which is section 1's rule applied to a harder integrand. The two integrals are taken over
    // DIFFERENT domains -- the pdf over wi, the NDF over wh -- so their grid errors do not cancel, and at
    // alpha 0.4, cos_o 0.3 they sit 5.8e-3 apart at N = 200. A fixed tolerance here would be a number chosen
    // to make today's grid pass; that the gap FALLS as the grid refines is the statement that it is the grid.
    const grazingAt = (N) => [0.6, 0.3].flatMap((c) => ALPHAS.map((a) =>
        ({ a, c, got: dirMass(a, c, good, N), want: reachableNdf(a, c, N) })));
    const gz = [200, 400].map((N) => {
        const rows = grazingAt(N);
        return { N, rows, worst: Math.max(...rows.map((r) => Math.abs(r.got - r.want) / r.want)) };
    });
    for (const r of gz[1].rows.filter((r) => r.c === 0.6))
        say(`cos_o 0.6, alpha ${r.a}: mass ${r.got.toFixed(4)} against the reachable NDF mass ${r.want.toFixed(4)}`);
    say(`worst disagreement over all twelve: ${gz.map((g) => "N " + g.N + " -> " + g.worst.toExponential(2)).join(", ")}`);
    ok("!! at a grazing view the mass is BELOW 1, and it matches the NDF mass the reflection can reach",
       gz[1].worst < gz[0].worst && gz[1].worst < 5e-3 && gz[1].rows.some((r) => r.want < 0.9),
       `half-vectors more than 90 degrees from wo are never sampled, so the shortfall is GEOMETRY rather than a leak -- 0.80 at alpha 1, cos_o 0.6. THE RESIDUAL IS THE GRID'S AND IS SHOWN TO BE BY REFINING IT (${gz[0].worst.toExponential(2)} -> ${gz[1].worst.toExponential(2)}); a check that demanded 1 everywhere would have called a correct pdf broken, and one that only ever looked head-on could not tell the difference.`);

    const no4 = ALPHAS.map((a) => dirMass(a, 1, (c, d, al) => D(c, al) * c / Math.abs(d)) / dirMass(a, 1, good));
    ok("!! SABOTAGE: dropping the reflection Jacobian reads EXACTLY FOUR TIMES the mass, at every roughness",
       no4.every((r) => Math.abs(r - 4) < 1e-3),
       `${no4.map((r) => r.toFixed(4)).join(", ")} -- a predicted factor with no free parameter, which is how the fault is told apart from a roughness the caller did not expect.`);

    const noCos = ALPHAS.map((a) => dirMass(a, 1, (c, d, al) => D(c, al) / (4 * Math.abs(d))) / dirMass(a, 1, good));
    say(`dropping cos_h from the pdf: ${ALPHAS.map((a, i) => a + " -> x" + noCos[i].toFixed(4)).join(", ")}`);
    ok("!! *** SABOTAGE, AND IT IS THIS FILE'S OWN RULE AGAIN: 0.9% AT alpha 0.05 AND EXACTLY 2x AT alpha 1 ***",
       noCos[0] < 1.05 && Math.abs(noCos[ALPHAS.length - 1] - 2) < 1e-3,
       "A tolerance chosen at a smooth roughness would pass this plant and a renderer would be quietly 3% wrong at the next knob setting up; the fault is caught by the TREND ACROSS ROUGHNESS, not by the size of any one reading. Same shape as the energy shortfall in section 4 and as v3420's Hall rule.");

    // ---- 6c. THE CANCELLATION bounceWeight CLAIMS, DRIVEN RATHER THAN READ ---------------------------------
    //
    // The module states the algebra in its header: f cos_i / pdf = F G2 |wo.wh| / (cos_o cos_h), with D
    // cancelling out. THAT IS THREE OF THE FOUR EXPORTS IN ONE EQUATION, so driving it grades them together --
    // and it is exactly the equation whose failure a picture cannot show, because a wrong throughput is a
    // plausible material.
    let worstCancel = 0, nCfg = 0, worstPlant = 0;
    for (const a of ALPHAS) {
        for (const cosO of [1, 0.9, 0.6, 0.3]) {
            const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, 0, cosO];
            for (let i = 1; i <= 40; i++) {
                const wh = zUp(sampleHalfVector(i / 41, 0.37, a));
                const dotOH = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
                if (dotOH <= 0) continue;
                const wi = [2 * dotOH * wh[0] - wo[0], 2 * dotOH * wh[1] - wo[1], 2 * dotOH * wh[2] - wo[2]];
                const cosI = wi[2], cosH = wh[2];
                if (cosI <= 0) continue;
                const w = bounceWeight(cosO, cosI, cosH, dotOH, a);
                const viaEval = bsdfEval(cosO, cosI, cosH, a) * cosI / sampleDirPdf(cosH, dotOH, a);
                worstCancel = Math.max(worstCancel, Math.abs(w - viaEval) / Math.max(Math.abs(w), 1e-300));
                const bad = bounceWeight(cosO, cosI, cosH, dotOH, a, { wrongPdf: true });
                worstPlant = Math.max(worstPlant, Math.abs(bad - w) / Math.max(Math.abs(w), 1e-300));
                nCfg++;
            }
        }
    }
    ok("!! *** THE D IN THE BRDF AND THE D IN THE PDF CANCEL: bounceWeight IS bsdfEval * cos_i / sampleDirPdf ***",
       worstCancel < 1e-12 && nCfg > 300,
       `worst relative disagreement ${worstCancel.toExponential(2)} over ${nCfg} configurations spanning every roughness and four view angles. THE ANALYTIC FORM AND THE THREE-FUNCTION COMPUTATION ARE ONE EQUATION MEASURED TWO WAYS -- and because D cancels, this key is BLIND to a wrong D by construction, which is why sections 1-2 exist and why saying so here is part of the check.`);
    ok("!! and the module's own wrongPdf plant -- sample the NDF, divide by the cosine pdf -- is caught",
       worstPlant > 0.1,
       `worst departure ${worstPlant.toExponential(2)}. It is the commonest importance-sampling bug there is (v3468 measured its Lambertian cousin at 4/3), it was named as a PARAMETER in the module, and until now nothing drove it.`);

    // ---- 6d. bsdfEval IS THE SAME BRDF THE GRADED INTEGRALS USE -------------------------------------------
    //
    // *** A SECOND DECLARATION THAT AGREES TODAY IS STILL A SECOND DECLARATION (v3494). *** bsdfEval writes
    // D G2 F / (4 cos_o cos_i) and furnaceIntegral writes the same product inside its loop. Integrating the
    // EVALUATION against directionalAlbedo pins them together, so the day one is edited this goes red.
    const albedoByEval = (alpha, cosO, N = 300) => {
        const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, 0, cosO];
        const dth = (Math.PI / 2) / N, dph = Math.PI / N;
        let s = 0;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const ph = (j + 0.5) * dph, wi = [st * Math.cos(ph), st * Math.sin(ph), ct];
                const hx = wo[0] + wi[0], hy = wo[1] + wi[1], hz = wo[2] + wi[2], hl = Math.hypot(hx, hy, hz);
                if (hl < 1e-9) continue;
                s += bsdfEval(cosO, ct, hz / hl, alpha) * ct * st * dth * dph;
            }
        }
        return s * 2;
    };
    const pairs = [0.05, 0.4, 1.0].map((a) => ({ a, ev: albedoByEval(a, 0.9), q: directionalAlbedo(a, 0.9, { N: 300, M: 300 }) }));
    say(`E(wo) by integrating bsdfEval: ${pairs.map((p) => p.ev.toFixed(9)).join(", ")}  against directionalAlbedo ${pairs.map((p) => p.q.toFixed(9)).join(", ")}`);
    ok("!! *** THE EVALUATION AND THE INTEGRAL ARE ONE BRDF, TO THE LAST BIT ***",
       pairs.every((p) => Math.abs(p.ev - p.q) <= 1e-15 * Math.max(1, Math.abs(p.q))),
       "not a tolerance and not luck: same expression, same grid, so any edit to either one separates them immediately. THE VALUE IS THE PIN, NOT THE NUMBER -- section 4's energy shortfall is graded on directionalAlbedo, and this is what stops the function a renderer actually calls from drifting away from the function that was graded.");

    const noG2 = albedoByEval(1.0, 0.9) > 0 ? [0.05, 1.0].map((a) => {
        const so = Math.sqrt(Math.max(0, 1 - 0.81)), wo = [so, 0, 0.9];
        let s = 0; const N = 300, dth = (Math.PI / 2) / N, dph = Math.PI / N;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const ph = (j + 0.5) * dph, wi = [st * Math.cos(ph), st * Math.sin(ph), ct];
                const hx = wo[0] + wi[0], hy = wo[1] + wi[1], hz = wo[2] + wi[2], hl = Math.hypot(hx, hy, hz);
                if (hl < 1e-9 || ct <= 0) continue;
                s += D(hz / hl, a) / (4 * 0.9 * ct) * ct * st * dth * dph;
            }
        }
        return (s * 2) / albedoByEval(a, 0.9);
    }) : [];
    ok("!! SABOTAGE: dropping G2 from the evaluation is 0.06% at alpha 0.05 and 70% at alpha 1",
       noG2[0] < 1.01 && noG2[1] > 1.5,
       `x${noG2.map((r) => r.toFixed(4)).join(", x")} -- masking is what the strong furnace test is ABOUT, and at a smooth roughness its absence is inside any tolerance anybody would write. THE TREND IS THE INSTRUMENT.`);

    let worstRecip = 0;
    for (const a of ALPHAS) for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++)
        worstRecip = Math.max(worstRecip, Math.abs(bsdfEval(i / 10, j / 10, 0.8, a) - bsdfEval(j / 10, i / 10, 0.8, a)) / Math.max(bsdfEval(i / 10, j / 10, 0.8, a), 1e-300));
    ok("...and the BRDF is RECIPROCAL: swapping wo and wi returns the same value",
       worstRecip < 1e-14,
       `worst ${worstRecip.toExponential(2)}. Helmholtz reciprocity is what lets a renderer trace paths from the light instead of the eye, and next-event estimation depends on it -- bsdfEval exists to serve exactly that route.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html imports the model and calls the furnace integrals",
       /from\s*"\/physics\/render\/microfacet\.mjs"/.test(src) && /directionalAlbedo\(/.test(src),
       "A .mjs with no page is the CLI-only deliverable this project refuses. The assertion is on the IMPORT and the CALL rather than on the name appearing, because a check counting its own prose is this tree's most-committed defect.");
}

console.log(fails ? "\nmicrofacet-selfcheck: " + fails + " FAILED" : "\nmicrofacet-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
