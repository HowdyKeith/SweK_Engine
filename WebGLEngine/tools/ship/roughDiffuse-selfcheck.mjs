// WebGLEngine/tools/ship/roughDiffuse-selfcheck.mjs -- v4275
//
// GRADES physics/render/roughDiffuse.mjs: a diffuse lobe that knows about roughness, which this tree had not.
//
// *** THE GAP WAS MEASURED BEFORE ANYTHING WAS BUILT. *** Nine files in this tree mention GGX; thirty-one touch
// path tracing; physics/render/microfacet.mjs has Smith masking, a furnace integral and directional albedo, and
// physics/render/energyCompensation.mjs adds back the energy single-scattering GGX loses. The diffuse lobe was
// albedo/PI, and ZERO files mentioned Oren-Nayar. A polished surface and a rough one scattered identically in
// the one lobe where roughness is the whole point.
//
// ---- AND WHAT THIS FILE REFUSES TO CLAIM -------------------------------------------------------------------------
//
// The round was suggested by portsmouth/EON-diffuse and five sibling repositories. *** NOT ONE OF THEM WAS
// OPENED: this session has no network. *** No licence was read, no analytic fit was consulted, and all six are
// recorded in world/namedNotChecked.mjs as NAMED and unchecked, which is exactly what v4268 built that register
// for. What is implemented is Oren-Nayar's published 1994 form -- textbook, older than any repository -- plus a
// compensation MEASURED by this tree's own integration. Section 4 asserts the disclaimer is present, because a
// file that quietly implied it was EON would be a claim nobody could check.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orenNayarAB, orenNayarFactor, orenNayarBrdf, directionalAlbedo, buildDiffuseTable,
         compensationAt, roughDiffuseBrdf, energyLoss, SIGMA_MAX } from "../../physics/render/roughDiffuse.mjs";
import { NAMED_SOURCES } from "../../world/namedNotChecked.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. IT REDUCES TO LAMBERT EXACTLY, NOT APPROXIMATELY");
{
    const { A, B } = orenNayarAB(0);
    ok("*** at sigma = 0 the coefficients are exactly A = 1, B = 0 ***", A === 1 && B === 0, `A=${A} B=${B}`);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
        const ci = 0.02 + 0.96 * (i / 39), co = 0.98 - 0.96 * (i / 39);
        for (const cp of [-1, -0.3, 0, 0.5, 1]) worst = Math.max(worst, Math.abs(orenNayarFactor(ci, co, cp, 0) - 1));
    }
    ok("  so the factor is exactly 1 everywhere, with no epsilon and no special case", worst === 0,
        `worst |f - 1| = ${worst}`);
    report("a model that only APPROXIMATELY reduces to the thing it generalises hides inside a tolerance for " +
        "years. This one returns the literal 1, so the Lambert path is bit-identical to what shipped before.");
    ok("  and the BRDF at sigma 0 is albedo/PI", Math.abs(orenNayarBrdf(0.8, 0.5, 0.6, 0.2, 0) - 0.8 / Math.PI) < 1e-15);
    ok("CONTROL: at sigma > 0 the factor is NOT 1", orenNayarFactor(0.3, 0.4, 1, 0.8) !== 1,
        `${orenNayarFactor(0.3, 0.4, 1, 0.8).toFixed(4)} -- otherwise the checks above pass on a stub`);
}

console.log("\n2. THE PROPERTY A BRDF MUST HAVE: RECIPROCITY");
{
    let worst = 0;
    for (const sigma of [0.1, 0.4, 0.9, SIGMA_MAX]) {
        for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
            const ci = i / 12, co = j / 12;
            for (const cp of [-0.8, 0, 0.6, 1]) {
                worst = Math.max(worst, Math.abs(orenNayarFactor(ci, co, cp, sigma) - orenNayarFactor(co, ci, cp, sigma)));
            }
        }
    }
    ok("*** f(i -> o) equals f(o -> i) exactly ***", worst === 0, `worst asymmetry ${worst}`);
    report("exact rather than within a tolerance, because the model is symmetric BY CONSTRUCTION -- alpha is " +
        "max(thetaI, thetaO) and beta is min. A tolerance here would be hiding a typo.");
}

console.log("\n3. THE ENERGY IT LOSES, AND THE ENERGY PUT BACK");
{
    ok("at sigma = 0 the integrator returns 1 to its own quadrature floor",
        Math.abs(directionalAlbedo(0.5, 0) - 1) < 1e-4, `|E - 1| = ${Math.abs(directionalAlbedo(0.5, 0) - 1).toExponential(2)}`);
    const losses = [0.2, 0.6, 1.0].map((s) => ({ s, ...energyLoss(s, { K: 9, N: 64, M: 32 }) }));
    for (const L of losses) {
        console.log(`        sigma ${L.s.toFixed(1)}  mean loss ${(L.mean * 100).toFixed(2)}%  worst ${(L.worst * 100).toFixed(2)}%`);
    }
    ok("*** plain Oren-Nayar LOSES energy, and more of it as roughness rises ***",
        losses[0].mean > 0.005 && losses[1].mean > losses[0].mean && losses[2].mean > losses[1].mean,
        `${(losses[0].mean * 100).toFixed(1)}% -> ${(losses[1].mean * 100).toFixed(1)}% -> ${(losses[2].mean * 100).toFixed(1)}%`);
    ok("  and at the roughest it is a QUARTER of the light", losses[2].mean > 0.2,
        `${(losses[2].mean * 100).toFixed(1)}% mean, ${(losses[2].worst * 100).toFixed(1)}% worst -- this is the motivation, as a number`);

    let worstComp = 0;
    for (const sigma of [0.2, 0.6, 1.0]) {
        const T = buildDiffuseTable(sigma, { K: 33, N: 96, M: 48 });
        for (let k = 0; k < 40; k++) {
            const mu = (k + 0.5) / 40;
            worstComp = Math.max(worstComp, Math.abs(directionalAlbedo(mu, sigma, { N: 96, M: 48 }) * compensationAt(T, mu) - 1));
        }
    }
    ok("*** and the compensation puts it back to better than half a percent ***", worstComp < 5e-3,
        `worst |E_compensated - 1| = ${worstComp.toExponential(3)} against a 25% loss uncompensated`);
    report("the residual is table interpolation, not the model: the table holds 33 values of mu and the check " +
        "asks for 40. A denser table shrinks it and a coarser one grows it, which is the signature of " +
        "interpolation rather than of a missing term.");
    // CONTROL: the compensated check must be able to fail.
    const T2 = buildDiffuseTable(1.0, { K: 33, N: 96, M: 48 });
    ok("CONTROL: WITHOUT the table the same points are far from 1",
        Math.abs(directionalAlbedo(0.5, 1.0, { N: 96, M: 48 }) - 1) > 0.1,
        "so the tolerance above is measuring the compensation and not a vacuous identity");
    ok("  and roughDiffuseBrdf with no table equals plain Oren-Nayar",
        roughDiffuseBrdf(1, 0.4, 0.6, 0.5, 0.8) === orenNayarBrdf(1, 0.4, 0.6, 0.5, 0.8),
        "the table is opt-in, so an existing caller gets exactly what it had");
    ok("  and with a table it does not", roughDiffuseBrdf(1, 0.4, 0.6, 0.5, 0.8, T2) !== orenNayarBrdf(1, 0.4, 0.6, 0.5, 0.8));
}

console.log("\n4. WHAT IT DOES NOT CLAIM TO BE");
{
    const src = fs.readFileSync(path.join(ENG, "physics/render/roughDiffuse.mjs"), "utf8");
    // *** A CHECK ON PROSE MUST SURVIVE REFLOWING, AND THE FIRST DRAFT OF THIS ONE DID NOT. *** It searched for
    // "THIS IS NOT THAT" contiguously; the header wraps between "THIS IS" and "NOT THAT", so it went red on a
    // file that says exactly what it was asked to say. Comment markers are stripped and whitespace collapsed,
    // so the assertion is about the SENTENCE and not about where the line happened to break.
    const prose = src.replace(/^\s*\/\/ ?/gm, " ").replace(/\s+/g, " ");
    ok("*** the header says plainly that this is NOT the suggested repository's model ***",
        /THIS IS NOT THAT/.test(prose) && /EON-diffuse/.test(prose));
    ok("CONTROL: the normaliser is doing work -- the phrase is NOT contiguous in the raw file",
        !/THIS IS NOT THAT/.test(src),
        "so this pair proves the check reads meaning rather than line breaks");
    ok("  and says why: no network, so it was never opened", /no network/.test(prose) && /never read|not read|not consulted/.test(prose));
    ok("  and points at the register that holds the unchecked name",
        /namedNotChecked/.test(prose));
    const named = NAMED_SOURCES.filter((e) => e.namedIn === "v4275 suggestion");
    ok("*** all six suggested repositories are registered as NAMED and unchecked ***", named.length === 6,
        named.map((e) => e.repo.split("/").pop()).join(", "));
    ok("  including the one this round took an idea from", named.some((e) => e.repo === "portsmouth/EON-diffuse"));
    ok("  and none of them carries a licence verdict",
        named.every((e) => !["spdx", "licence", "licenceExists", "redistributable"].some((f) => f in e)));
    ok("  and the likely-duplicate one is flagged BEFORE anybody spends a round on it",
        named.some((e) => /Trinity/.test(e.repo) && /LIKELY DUPLICATE/.test(e.wanted)),
        "four fluid solvers already ship here; v4239 found the solver was the duplicate and the sensor was not");
    report("taking an IDEA and refusing a CODEBASE is the same move v4247 made with Ramotion's gaze dwell. " +
        "The difference this time is that the idea's published form was available and its recent refinement " +
        "was not, so the file implements the former and names the latter as the thing it is not.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  1e-9 added to Oren-Nayar's A coefficient -- a perturbation far below any rendering tolerance.
//      -> exit=1, 3 red, all of them in section 1. *** THIS IS THE ARGUMENT FOR ASSERTING === 1 RATHER THAN A
//      TOLERANCE. *** A billionth is invisible to every image anyone would ever render, and it means the lobe
//      no longer reduces to Lambert -- which is a statement about the MODEL, not about a picture. A check
//      written as |f - 1| < 1e-6 would have shipped it.
//
//   B  alpha and beta stop being max/min of the two angles and become thetaI and thetaO directly.
//      -> exit=1, 4 red, and it is the most instructive of the three. Reciprocity breaks outright (worst
//      asymmetry 3.78), and the energy check inverts: the surface GAINS energy at some angles, the worst
//      "loss" reading -120%, meaning it returns more than twice what arrives. *** A NON-RECIPROCAL BRDF THAT
//      CREATES LIGHT STILL RENDERS A PERFECTLY PLAUSIBLE ROUGH SURFACE, *** which is why reciprocity is
//      checked as an identity and energy as a measured integral rather than either being left to the eye.
//
//   C  the compensation table filled with 1s instead of 1/E -- present, shaped right, doing nothing.
//      -> exit=1, 2 red. The furnace check fails and the "with a table it differs from without" check fails.
//      A table that exists and compensates nothing is the shape v4273 found in gfx/device.js's texture bind,
//      and the same lesson: an API that runs and has no effect is worse than one that refuses.
//
// None went 0 RED. A and B are the pair worth keeping: A is invisible to any tolerance-based check and B is
// invisible to any check that looks at the picture.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THIS IS THE RIGHT ROUGH-DIFFUSE MODEL. Oren-Nayar is one of several and " +
    "the field has moved on; the repository that prompted this exists precisely because the 1994 form loses " +
    "energy, which section 3 measures at 25%. What is proven is that the lobe reduces to Lambert exactly, is " +
    "reciprocal exactly, loses energy monotonically with roughness, and that the compensation built here " +
    "restores it to better than half a percent. Also unchecked: ANY CONSUMER. physics/render/pathTracer.mjs " +
    "still uses albedo/PI and this round did not change it -- wiring a new lobe into a renderer is a " +
    "behaviour change to every existing image, which is its own round with its own before-and-after.");
process.exit(fails ? 1 : 0);
