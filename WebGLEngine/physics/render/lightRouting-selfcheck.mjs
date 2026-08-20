// WebGLEngine/physics/render/lightRouting-selfcheck.mjs -- v3489
//
// Run: node physics/render/lightRouting-selfcheck.mjs
//
// *** EVERY LIGHT IS COLLECTED BY EXACTLY ONE ROUTE, NEVER ZERO AND NEVER TWO. ***
//
// v3474 wired next-event estimation into the renderer and got the hard half right: with direct sampling on, a
// bounce ray landing on an emitter must return NOTHING, or every surface is lit twice. What it got wrong is
// that THE GUARD WAS GLOBAL WHERE THE FACT IT GUARDS IS PER LIGHT. "The light was already added at the previous
// vertex" is true only of the lights NEE ACTUALLY SAMPLED, and NEE skips any emitter the shading point stands
// INSIDE -- there is no cone to sample from within a sphere.
//
// *** SO FOR AN ENCLOSING EMITTER, WHICH IS HOW EVERYBODY BUILDS AN ENVIRONMENT LIGHT, NEE SKIPPED IT AND THE
// GUARD SUPPRESSED THE BOUNCE RAY THAT WOULD HAVE PICKED IT UP. NEITHER ROUTE COLLECTED IT. The interior of the
// sphere reads EXACTLY 0.000000 against an albedo of 0.18 -- A BLACK SPHERE IN A LIT ROOM, not a dim one. ***
//
// The two failures are one line apart, they fail in OPPOSITE directions, and each is invisible to the fixture
// that catches the other. Both are planted; both are graded; both fixtures are kept.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, coverage } from "./pathTracer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RHO = 0.18;
const SPHERE = [{ centre: [0, 0, 0], radius: 1, albedo: RHO }];
// The furnace built out of GEOMETRY instead of out of sky(): a uniformly emitting shell enclosing everything.
// Physically the same environment, so it must give the same number -- which is what makes it an answer key
// rather than a comparison.
const ENCLOSED = [...SPHERE, { centre: [0, 0, 0], radius: 40, emit: 1, albedo: 0 }];
const SMALL = [{ centre: [0, 0, 0], radius: 1, albedo: 0.6 }, { centre: [0, 3, 0], radius: 0.5, emit: 4, albedo: 0 }];

const CAM = { w: 48, h: 48, spp: 96, seed: 5, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 5 };

/**
 * v3473's lesson, applied rather than re-learned: coverage() samples pixel CENTRES while the renderer JITTERS
 * inside the pixel, so silhouette pixels MIX the sphere and whatever is behind it. Reading them would blend the
 * shell's radiance into the sphere's and turn an exact key into an approximate one. THE EDGE IS EXCLUDED BY
 * NAME rather than absorbed into a looser tolerance.
 */
function interior(scene, opts) {
    const m = coverage(scene, opts), W = opts.w, H = opts.h, out = new Uint8Array(m.length);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        let all = 1;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!m[(y + j) * W + x + i]) all = 0;
        out[y * W + x] = all;
    }
    return out;
}
const meanOn = (v, mask) => { let s = 0, n = 0; for (let i = 0; i < v.length; i++) if (mask[i]) { s += v[i]; n++; } return { mean: s / n, n }; };

const ENC_MASK = interior(SPHERE, CAM);
const encRead = (o) => meanOn(render(ENCLOSED, { ...CAM, sky: () => 0, ...o }), ENC_MASK);

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE EXACT KEY: A FURNACE BUILT OUT OF GEOMETRY IS STILL A FURNACE
 * --------------------------------------------------------------------------------------------------------- */
{
    const on = encRead({ nee: true }), off = encRead({ nee: false });
    const viaSky = meanOn(render(SPHERE, { ...CAM, sky: () => 1, nee: true }), ENC_MASK);
    say(`enclosed furnace, ${on.n} interior pixels: nee ON ${on.mean.toFixed(6)} | nee OFF ${off.mean.toFixed(6)} | the sky() route ${viaSky.mean.toFixed(6)} | albedo ${RHO}`);

    ok("!! *** THE ENCLOSED FURNACE READS THE ALBEDO EXACTLY, BY BOTH ROUTES AND BY THE THIRD ***",
       Math.abs(on.mean - RHO) < 1e-12 && Math.abs(off.mean - RHO) < 1e-12 && Math.abs(viaSky.mean - RHO) < 1e-12,
       "*** A UNIFORMLY EMITTING SHELL AND A CONSTANT sky() ARE THE SAME ENVIRONMENT, so they must give the same number -- and that number is known in advance, which makes this an ANSWER KEY rather than a comparison between two things that could both be wrong. The direct-sampling route and the bounce-only route must also agree, and a scene where they disagree has lost or invented energy. ***");

    ok("...and the three routes agree with each other, not merely with the tolerance",
       on.mean === off.mean && off.mean === viaSky.mean,
       "Exact equality rather than a tolerance, because the furnace is exact: a constant environment, a convex sphere and cosine weighting mean every path escapes on its first bounce carrying exactly rho, so there is nothing for noise to differ in and a tolerance here would be hiding something.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE PLANT IS THE SHIPPED CODE, AND IT RENDERS A BLACK SPHERE IN A LIT ROOM ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const plant = encRead({ nee: true, plantGlobalGuard: true });
    say(`the global guard (what shipped from v3474 to v3488): ${plant.mean.toFixed(6)} against an albedo of ${RHO}`);
    ok("!! *** NOT DIM -- EXACTLY ZERO. NEITHER ROUTE COLLECTED THE LIGHT AT ALL ***",
       plant.mean === 0,
       "*** NEE SKIPS AN EMITTER THE SHADING POINT STANDS INSIDE (`if (dist <= L.radius) continue`, with the comment 'inside the light: no cone to sample' -- true, and nothing downstream had read it), AND THE GLOBAL GUARD THEN SUPPRESSED THE BOUNCE RAY THAT WOULD HAVE PICKED IT UP. An exact zero is the loudest possible reading and it still went unnoticed for fifteen versions, because no fixture in the arc ever put the camera inside a light. ***");

    ok("...and the fault is in the ROUTING, not in the scene",
       Math.abs(encRead({ nee: false }).mean - RHO) < 1e-12,
       "*** MY FIRST VERSION OF THIS LINE ASKED FOR `=== RHO` AND FAILED CORRECT CODE: the three routes agree with EACH OTHER bit for bit (asserted above) while none of them equals the DECIMAL 0.18, because 0.18 is not representable in binary. AGREEMENT BETWEEN TWO COMPUTED ROUTES AND AGREEMENT WITH A TYPED LITERAL ARE DIFFERENT CLAIMS and only the first can be exact. *** The same scene with direct sampling OFF reads the albedo. So the geometry, the emitter, the intersection and the estimator are all correct and it is specifically the decision about WHICH ROUTE COLLECTS THE LIGHT that was wrong -- which is why the fix is one rule and not a new code path.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE OPPOSITE FAILURE, ONE LINE AWAY: COLLECT IT TWICE
 * --------------------------------------------------------------------------------------------------------- */
{
    const mask = interior([SMALL[0]], { ...CAM, w: 40, h: 40 });
    const cam = { ...CAM, w: 40, h: 40, spp: 64, seed: 7, maxDepth: 4, sky: () => 0 };
    const read = (o) => meanOn(render(SMALL, { ...cam, ...o }), mask).mean;
    const base = read({ nee: true }), dbl = read({ nee: true, plantDoubleCount: true }), bsdf = read({ nee: false });
    say(`small light: nee ON ${base.toFixed(6)} | bounce-only ${bsdf.toFixed(6)} | plantDoubleCount ${dbl.toFixed(6)} (${(dbl / base).toFixed(4)}x)`);

    ok("!! *** LETTING THE BOUNCE RAY COLLECT A LIGHT NEE ALREADY SAMPLED IS A UNIFORM DOUBLING ***",
       dbl / base > 1.8 && dbl / base < 2.4,
       "v3474's original finding, still true and still gated: it looks like a brighter room rather than a bug, which is why the guard exists at all. THE FIX MUST NOT REMOVE IT -- widening the guard until the enclosing case worked would have traded a black sphere for a doubled one.");

    ok("...and the two routes still agree on this scene, which is what says the fix changed nothing here",
       Math.abs(base - bsdf) / base < 0.12,
       `${base.toExponential(3)} against ${bsdf.toExponential(3)}. The bounce-only route is the NOISY one for a light this small -- v3472 measured direct sampling 7912x tighter at r/d = 0.1 -- so the tolerance is stated as a sampling budget rather than pretending to be exact.`);

    ok("!! *** AND THE FIX IS BIT-IDENTICAL TO THE OLD CODE ON EVERY SCENE THE OLD CODE HANDLED ***",
       read({ nee: true, plantGlobalGuard: true }) === base,
       "*** plantGlobalGuard IS THE SHIPPED v3488 BEHAVIOUR, so running it beside the fix on an ordinary scene IS the regression test, and it comes back EQUAL rather than merely close. A fix to a routing rule that also moved the numbers on the scenes that already worked would be a second change hiding inside the first. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** EACH PLANT IS INVISIBLE TO THE FIXTURE THAT CATCHES THE OTHER, FOR OPPOSITE AND STATEABLE REASONS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const mask = interior([SMALL[0]], { ...CAM, w: 40, h: 40 });
    const cam = { ...CAM, w: 40, h: 40, spp: 64, seed: 7, maxDepth: 4, sky: () => 0 };
    const smallBase = meanOn(render(SMALL, { ...cam, nee: true }), mask).mean;
    const smallGuard = meanOn(render(SMALL, { ...cam, nee: true, plantGlobalGuard: true }), mask).mean;
    const encBase = encRead({ nee: true }).mean, encDbl = encRead({ nee: true, plantDoubleCount: true }).mean;

    say(`                        enclosing emitter        small light`);
    say(`  plantGlobalGuard      ${encBase ? (0).toFixed(6) : "0.000000"} (TOTAL LOSS)      ${(smallGuard / smallBase).toFixed(6)}x (BLIND)`);
    say(`  plantDoubleCount      ${(encDbl / encBase).toFixed(6)}x (BLIND)          ~2.1x (CAUGHT)`);

    ok("!! *** THE GLOBAL-GUARD PLANT IS BIT-BLIND ON THE SMALL-LIGHT SCENE ***",
       smallGuard === smallBase,
       "STATEABLE REASON: NEE successfully samples a light the shading point is OUTSIDE, so nothing is ever recorded as skipped and the per-light exemption never fires. THE WHOLE ARC FROM v3472 TO v3488 USED FIXTURES OF THIS SHAPE, WHICH IS EXACTLY WHY A TOTAL BLACKOUT SURVIVED FIFTEEN VERSIONS.");

    ok("!! *** AND THE DOUBLE-COUNT PLANT IS BIT-BLIND ON THE ENCLOSING SCENE ***",
       encDbl === encBase,
       "THE OPPOSITE REASON, WHICH IS WHAT MAKES THE PAIR WORTH KEEPING: there, NEE never collected the light in the first place, so the bounce ray was already the only route and forcing it open changes nothing. *** A SUITE HOLDING EITHER FIXTURE ALONE WOULD CERTIFY ONE OF THE TWO BUGS, and neither fixture is the 'better' one. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html carries the enclosing-emitter scene, so the case that broke is one somebody can look at",
       /emit:\s*1/.test(src) && /enclosed/.test(src),
       "A defect found headlessly and left with no way to see it is a defect nobody will recognise when it comes back. The scene is a dropdown option beside the furnace, because the two must look IDENTICAL and that is the whole claim.");
}

console.log(fails ? "\nlightRouting-selfcheck: " + fails + " FAILED" : "\nlightRouting-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
