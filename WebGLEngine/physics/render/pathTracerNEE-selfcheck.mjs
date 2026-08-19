// WebGLEngine/physics/render/pathTracerNEE-selfcheck.mjs -- v3474
//
// Run: node physics/render/pathTracerNEE-selfcheck.mjs
//
// *** v3472 PROVED THE DIRECT TERM ANALYTICALLY. THIS ASKS WHETHER THE RENDERER ACTUALLY COMPUTES IT. ***
//
// A diffuse surface with an emissive sphere of radius r at distance d along its normal, and no sky, receives
//
//     L_direct = rho * Le * (r/d)^2
//
// which is the same closed form v3469 derived for a cap that BLOCKS -- the same solid angle, emitting instead.
// Here it must come out of a camera, a scene graph, a shadow ray and a pdf, none of which existed when the
// formula was written.
//
// AND THE HARD PART OF WIRING NEE IN IS NOT THE SAMPLING, IT IS THE DOUBLE COUNT: with direct sampling on, the
// light at a vertex was already added at the PREVIOUS vertex, so a bounce ray landing on an emitter must return
// nothing. Forget that and every surface is lit twice -- A UNIFORM DOUBLING, which looks like a brighter room
// rather than like a bug.
"use strict";
import { render, coverage, trace, intersect } from "./pathTracer.mjs";
import { rng } from "./furnace.mjs";
import { directExact } from "./nee.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RHO = 0.6, LE = 4, R = 0.5, D = 3;
const NOSKY = () => 0;
// A big sphere acting as a flat floor under a small bright light. The shading point is the floor's top pole,
// where its normal points straight at the light -- the exact configuration v3472's formula describes.
// *** THE PROBE RAY COMES IN AT AN ANGLE BECAUSE THE LIGHT IS DIRECTLY OVER THE SHADING POINT. My first
// fixture fired straight down from [0,6,0] at the floor's pole -- THROUGH THE EMITTER AT [0,3,0] -- so every
// reading came back 4.000000, the light's own radiance, and three checks failed against code that was fine.
// FOURTH FIXTURE FAULT IN THIS ARC AND THE SAME LESSON EVERY TIME: the geometry that makes a formula simple is
// often the geometry that makes the measurement impossible.
//
// From [3,3,0] toward the origin the perpendicular distance to the light's centre is 2.12 against a radius of
// 0.5, so the probe reaches the floor cleanly while the SHADING POINT still has the light straight overhead --
// which is the configuration the closed form describes.
const EYE = [3, 3, 0];
const AIM = (() => { const l = Math.hypot(3, 3, 0); return [-3 / l, -3 / l, 0]; })();
const FLOOR_R = 200;
const SCENE = [
    { centre: [0, -FLOOR_R, 0], radius: FLOOR_R, albedo: RHO },
    { centre: [0, D, 0], radius: R, albedo: 0, emit: LE },
];

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE DIRECT TERM, THROUGH THE RENDERER
 * --------------------------------------------------------------------------------------------------------- */
{
    const rand = rng(11);
    let sum = 0, n = 40000;
    // Fire straight down at the floor's pole from just above it, so the geometry matches the closed form.
    for (let i = 0; i < n; i++) sum += trace(EYE, AIM, SCENE, rand, { maxDepth: 1, sky: NOSKY });
    const got = sum / n, want = directExact(RHO, LE, R, D);
    say(`renderer ${got.toFixed(6)} against rho*Le*(r/d)^2 = ${want.toFixed(6)}`);
    ok("!! *** THE RENDERER REPRODUCES v3472'S DIRECT TERM ***", Math.abs(got - want) / want < 1e-2,
       `*** THE FORMULA WAS DERIVED WITH NO CAMERA, NO SCENE GRAPH, NO SHADOW RAY AND NO PDF LOOKUP, AND ALL FOUR NOW STAND BETWEEN IT AND THE ANSWER. That is what makes this a second route rather than a restatement. *** maxDepth 1, so this is the direct term alone with no inter-reflection to muddy it.`);

    const rows = [[0.5, 3], [0.25, 3], [0.5, 6]].map(([r, d]) => {
        const sc = [SCENE[0], { centre: [0, d, 0], radius: r, albedo: 0, emit: LE }];
        const rr = rng(11); let acc = 0;
        for (let i = 0; i < 30000; i++) acc += trace(EYE, AIM, sc, rr, { maxDepth: 1, sky: NOSKY });
        return { r, d, got: acc / 30000, want: directExact(RHO, LE, r, d) };
    });
    for (const x of rows) say(`r=${x.r} d=${x.d}: ${x.got.toFixed(6)} against ${x.want.toFixed(6)}`);
    ok("...and across three light geometries, so the inverse-square is the renderer's too",
       rows.every((x) => Math.abs(x.got - x.want) / x.want < 2e-2),
       "Halving the radius quarters it and doubling the distance quarters it -- THE SAME EXPONENT REACHED FROM TWO DIFFERENT DIRECTIONS, which a single geometry could not distinguish.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. NEE AND BSDF SAMPLING AGREE -- AND THE DOUBLE COUNT WOULD SHOW HERE
 * --------------------------------------------------------------------------------------------------------- */
{
    const runs = (nee, seed, n = 300000) => {
        const rand = rng(seed); let acc = 0;
        for (let i = 0; i < n; i++) acc += trace(EYE, AIM, SCENE, rand, { maxDepth: 2, sky: NOSKY, nee });
        return acc / n;
    };
    const withNee = runs(true, 21), without = runs(false, 21);
    say(`with NEE ${withNee.toFixed(6)} | BSDF sampling only ${without.toFixed(6)}`);
    ok("!! *** THE TWO ROUTES AGREE, WHICH IS WHAT RULES OUT THE DOUBLE COUNT ***",
       Math.abs(withNee - without) / without < 0.05,
       `*** IF THE BOUNCE RAY STILL REPORTED THE EMITTER AFTER NEE HAD ALREADY ADDED IT, THIS WOULD READ ABOUT TWICE THE OTHER -- a uniform doubling that looks like a brighter room rather than a bug. The guard is that a non-camera ray hitting a light returns nothing, and THE ONLY THING THAT PROVES IT IS RUNNING BOTH ROUTES AND COMPARING. *** BSDF-only is the slow, obviously-correct reference here; NEE is the one that had to earn its answer.`);

    ok("...and the light is still VISIBLE to the camera, which the same guard could easily have broken",
       trace([0, D, 6], [0, 0, -1], SCENE, rng(5), { maxDepth: 2, sky: NOSKY, nee: true }) > LE * 0.99,
       `a camera ray aimed at the emitter returns its radiance. THE GUARD SUPPRESSES EMISSION ON BOUNCE RAYS AND MUST NOT SUPPRESS IT ON THE FIRST ONE -- get that wrong and the scene is lit correctly by a light you cannot see, which is a bug people ship.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. WHY IT WAS WORTH WIRING: THE NOISE
 * --------------------------------------------------------------------------------------------------------- */
{
    const spread = (nee) => {
        const xs = [];
        for (let s = 1; s <= 30; s++) {
            const rand = rng(s * 7919); let acc = 0;
            // DEPTH 2 FOR BOTH. At depth 1 a BSDF path cannot reach the light AT ALL -- it bounces once and the
            // loop ends -- so it returns a constant zero and its "spread" is zero, which read as the quieter
            // estimator. A DEGENERATE ESTIMATOR LOOKS PERFECTLY PRECISE, and comparing variances without first
            // checking both routes actually compute the quantity is how that passes for a result.
            for (let i = 0; i < 300; i++) acc += trace(EYE, AIM, SCENE, rand, { maxDepth: 2, sky: NOSKY, nee });
            xs.push(acc / 300);
        }
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const sN = spread(true), sB = spread(false);
    say(`std-dev over 30 seeds at 300 paths: NEE ${sN.toExponential(3)} | BSDF only ${sB.toExponential(3)} | ratio ${(sB / sN).toFixed(1)}x`);
    ok("!! *** AND IT IS FAR QUIETER, WHICH IS THE WHOLE REASON THE MODULE EXISTED ***", sB > sN * 3,
       `${(sB / sN).toFixed(1)}x tighter at (r/d)^2 = ${((R / D) ** 2 * 100).toFixed(1)}% coverage. v3472 measured this analytically and the module then SAT UNUSED FOR A ROUND -- graveyard counted it as debt and it WAS debt, because a variance reduction nothing calls reduces nothing.`);
}

console.log(fails ? "\npathTracerNEE-selfcheck: " + fails + " FAILED" : "\npathTracerNEE-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
