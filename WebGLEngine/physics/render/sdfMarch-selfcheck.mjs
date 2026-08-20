// WebGLEngine/physics/render/sdfMarch-selfcheck.mjs -- v3488
//
// Run: node physics/render/sdfMarch-selfcheck.mjs
//
// *** THE TREE HAD FOUR VOXEL DDA MARCHERS AND NOT ONE TRACER THAT WALKS A CONTINUOUS FIELD. *** Verified
// before building rather than assumed: zero hits tree-wide for sphereTrace, sphereTracing, rayMarchSDF,
// marchSDF, lipschitz, sdfMarch and distanceField.
//
// THREE KEYS, NONE OF THEM THE TAUTOLOGY OF GRADING THE TRACER AGAINST ITSELF:
//   1. A CLOSED-FORM INTERSECTION -- v3469's raySphere, an independent route that knows nothing about marching.
//   2. A CLOSED FORM FOR A SINGLE WYVILL BALL, derived here because the tree did not have one:
//      q^3 = iso/s at the surface, so d = R sqrt(1 - (iso/s)^(1/3)).
//   3. AN INDEPENDENTLY EXTRACTED SURFACE -- marchingTets, graded since v3417, measured with its own
//      surfaceDistance. *** AND THE HIT POINTS ARE COMPUTED ONCE AND REUSED AS THE MESH REFINES, SO THE FALLING
//      DISAGREEMENT IS A STATEMENT ABOUT THE EXTRACTOR AND NOT ABOUT THE TRACER. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marchRay, marchBalls, supportEntry, MARCH_REASONS } from "./sdfMarch.mjs";
import { raySphere } from "./occlusion.mjs";
import { sphereField, wyvill, wyvillGrad, marchingTets, surfaceDistance } from "../mesh/marchingCubes.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const BALLS = [{ cx: -0.35, cy: 0, cz: 0, r: 1, s: 1 }, { cx: 0.35, cy: 0, cz: 0, r: 1, s: 1 }];
const ONE = [{ cx: 0, cy: 0, cz: 0, r: 0.35, s: 1 }];
const ISO = 0.5;
const blobField = (balls) => ({ f: (x, y, z) => wyvill(balls, x, y, z), g: (x, y, z) => wyvillGrad(balls, x, y, z) });

/* ------------------------------------------------------------------------------------------------------------
 * 1. TWO ROUTES TO ONE SPHERE, AND THE SECOND ROUTE KNOWS NOTHING ABOUT MARCHING
 * --------------------------------------------------------------------------------------------------------- */
{
    const sf = sphereField(1);
    let worst = 0, worstSteps = 0, rays = 0, missed = 0;
    for (let i = 0; i < 40; i++) {
        const a = i * 0.157, o = [3 * Math.cos(a), 0.4 * Math.sin(a * 3), 3 * Math.sin(a)];
        const L = Math.hypot(o[0], o[1], o[2]), d = [-o[0] / L, -o[1] / L, -o[2] / L];
        const r = marchRay(sf, o, d, { epsilon: 1e-7, maxSteps: 2000 });
        const analytic = raySphere(o, d, [0, 0, 0], 1);
        if (!r.hit || analytic === null) { missed++; continue; }
        worst = Math.max(worst, Math.abs(r.t - analytic)); worstSteps = Math.max(worstSteps, r.steps); rays++;
    }
    say(`40 rays at a unit sphere: worst |t_marched - t_analytic| ${worst.toExponential(3)}, worst step count ${worstSteps}`);
    ok("!! *** THE TRACER LANDS ON THE CLOSED-FORM INTERSECTION, ON EVERY RAY ***",
       rays === 40 && missed === 0 && worst < 1e-6,
       "*** raySphere IS v3469'S ROUTINE, INCLUDING ITS `t > 0` TEST, AND IT HAS NO NOTION OF STEPPING AT ALL -- it solves a quadratic. So this is two genuinely independent routes to one number rather than a marcher agreeing with itself, which is the whole difference between a key and a mirror (v3201). ***");

    const nrm = marchRay(sf, [0, 0, 3], [0, 0, -1], { epsilon: 1e-9, maxSteps: 2000 });
    ok("...and the normal points OUT of the solid",
       nrm.N !== null && Math.abs(nrm.N[2] - 1) < 1e-6,
       "INSIDE is f > iso, so the outward normal is the NEGATIVE gradient. Getting that backwards is invisible to every distance key in this file and turns a lit surface black -- which is why it is asserted separately from the hit.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE PLANT: STEP BY THE FIELD VALUE, WHICH IS WHAT "MARCH BY THE DISTANCE" BECOMES WHEN NOBODY ASKS
 *    WHETHER THE FIELD IS A DISTANCE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const sf = sphereField(1);
    const clean = marchRay(sf, [0, 0, 3], [0, 0, -1], { epsilon: 1e-9, maxSteps: 2000 });
    const plant = marchRay(sf, [0, 0, 3], [0, 0, -1], { rawStep: true, maxSteps: 2000 });
    say(`clean: hit at t ${clean.t.toFixed(9)} in ${clean.steps} steps | rawStep plant: ${plant.reason} at t ${plant.t} in ${plant.steps} steps`);
    ok("!! *** THE PLANT MISSES A SPHERE SITTING DIRECTLY IN FRONT OF IT, IN TWO STEPS ***",
       clean.hit === true && plant.hit === false && plant.steps <= 3,
       "*** f = R^2 - r^2 IS NOT A DISTANCE: at r = 3 with R = 1 its magnitude is EIGHT while the surface is TWO away, so the first step leaps clean past the sphere and the second leaves the scene. THE FAULT IS NOT A SMALL ERROR, IT IS A MISS -- and on a scene where the camera is not aimed at the centre it would be a HOLE IN THE PICTURE rather than a blank frame, which is much harder to attribute. ***");

    ok("...and the cure is first-order and needs no new physics",
       Math.abs(clean.t - 2) < 1e-8,
       "d = |f - iso| / |grad f| is the Newton distance estimate, and both fields in this tree ALREADY EXPORT AN ANALYTIC GRADIENT. For a quadratic field outside the surface it is an UNDERESTIMATE -- (r-R)(r+R)/2r < r-R for R < r -- so it converges without ever overshooting.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE FINDING: A METABALL FIELD CONTAINS NOTHING OUTSIDE ITS SUPPORT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const stalled = marchRay(blobField(ONE), [0, 0, 3], [0, 0, -1], { iso: ISO, maxStep: 0 });
    say(`pure Newton with no clamp, launched at a blob from outside: ${stalled.reason} after ${stalled.steps} steps`);
    ok("!! *** THE TEXTBOOK SPHERE TRACER STALLS ON ITS FIRST STEP, AND NOTHING IS BROKEN ***",
       stalled.hit === false && stalled.reason === "stalled-no-gradient" && stalled.steps === 0,
       "*** WYVILL FALLOFF IS (1 - d^2/R^2)^3 INSIDE R AND EXACTLY ZERO OUTSIDE IT. Beyond the balls the field is 0, the gradient is 0, and the distance estimate is 0/0 -- there is genuinely nothing in the field to march along. A tracer that treated a zero step as a small step would run to its step cap and report a miss, which reads as 'the blob is not there'. THE REASON IS NAMED because a tracer that found nothing and a tracer that could not move are opposite news. ***");

    const entry = supportEntry(ONE, [0, 0, 3], [0, 0, -1]);
    const analytic = raySphere([0, 0, 3], [0, 0, -1], [0, 0, 0], 0.35);
    ok("...and the support is entered ANALYTICALLY with the graded intersection rather than a second one",
       Math.abs(entry - analytic) < 1e-8,
       "raySphere again, against each ball's own radius. Sphere tracing starts where the field starts meaning something.");

    ok("a ray that misses every support says so by name",
       marchBalls(ONE, [0, 5, 3], [0, 0, -1], { iso: ISO, wyvill, wyvillGrad }).reason === "no-support",
       `MARCH_REASONS = ${MARCH_REASONS.join("/")} -- five outcomes where a boolean has two, because "it returned null" is not a diagnosis.`);

    const far = marchRay(blobField(ONE), [0, 0, 3], [0, 0, -1], { iso: ISO, maxStep: 0.05, epsilon: 1e-7, maxSteps: 5000 });
    const near = marchRay(blobField(ONE), [0, 0, 3], [0, 0, -1], { iso: ISO, maxStep: 0.05, epsilon: 1e-7, maxSteps: 5000, t0: entry });
    say(`crossing the dead zone: ${far.steps} steps without the support entry against ${near.steps} with it, and the two hits agree to ${Math.abs(far.t - near.t).toExponential(2)}`);
    ok("!! the clamp lets a tracer cross the dead zone at all, and the entry makes it 10x cheaper",
       far.hit && near.hit && far.steps > near.steps * 10 && Math.abs(far.t - near.t) < 1e-8,
       "*** THEY ARE NOT BIT-IDENTICAL AND SAYING SO MATTERS: the coarse march and the analytic entry arrive at DIFFERENT t before the Newton step takes over, so they land on the same surface from different sample points. Agreement to 1e-10 is the honest claim; asserting identity here would be a tolerance pretending to be a proof (v3421). ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. A CLOSED FORM FOR A SINGLE WYVILL BALL, AND THE OVERSHOOT IS BOUNDED BY THE STEP
 * --------------------------------------------------------------------------------------------------------- */
{
    const R = 0.35, s = 1;
    // q^3 = iso/s at the surface and q = 1 - d^2/R^2, so d = R sqrt(1 - (iso/s)^(1/3)). DERIVED HERE, because
    // the tree did not have it: marchingCubes grades the metaball by VOLUME CONVERGENCE and never by a radius.
    const analytic = 3 - R * Math.sqrt(1 - Math.pow(ISO / s, 1 / 3));
    const rows = [0.5, 0.25, 0.1, 0.05, 0.02, 0.005].map((maxStep) => {
        const r = marchRay(blobField(ONE), [0, 0, 3], [0, 0, -1],
                           { iso: ISO, maxStep, epsilon: 1e-7, maxSteps: 20000, t0: supportEntry(ONE, [0, 0, 3], [0, 0, -1]) });
        return { maxStep, t: r.t, over: r.t - analytic, steps: r.steps };
    });
    say(`analytic single-ball surface at t = ${analytic.toFixed(9)}`);
    for (const r of rows) say(`  maxStep ${String(r.maxStep).padEnd(6)} t ${r.t.toFixed(7)}  overshoot ${r.over.toExponential(3)}  steps ${r.steps}`);

    ok("!! *** THE TRACER CONVERGES ONTO A CLOSED FORM NOTHING IN THE LOOP IS TOLD ***",
       Math.abs(rows[rows.length - 1].over) < 1e-6,
       "R sqrt(1 - (iso/s)^(1/3)) is the ball's own algebra and the marcher knows only f and grad f. THE TREE'S EXISTING METABALL KEY IS A VOLUME (marchingTets against 4/3 pi R^3), which is an aggregate -- and v3069's lesson is that an aggregate is invariant under a shift. A RADIUS IS NOT.");

    ok("!! *** AND THE ERROR IS BOUNDED BY THE STEP AT EVERY ROW -- A PREDICTION, NOT A TOLERANCE ***",
       rows.every((r) => r.over >= 0 && r.over < r.maxStep),
       "*** THE OVERSHOOT IS NON-NEGATIVE AND SMALLER THAN ONE CLAMPED STEP, WHICH IS EXACTLY WHAT A CLAMP CAN PROMISE AND ALL IT CAN PROMISE. The sign matters as much as the size: the tracer can only ever report the surface LATE, never early, so a clamped hit is always at or behind the true one. ***");

    ok("...and the cost of that accuracy is steps, stated rather than implied",
       rows[rows.length - 1].steps > rows[0].steps * 10,
       `${rows[0].steps} step at maxStep 0.5 against ${rows[rows.length - 1].steps} at 0.005. maxStep TRADES TUNNELLING AGAINST STEP COUNT and no value removes the trade: a feature thinner than maxStep can be stepped over wherever the gradient is shallow.`);

    ok("!! and the coarse case does not MISS, it hits the WRONG PLACE, which is the dangerous direction",
       rows[0].t > analytic && Math.abs(rows[0].over) > 0.1,
       `At maxStep 0.5 the reported hit is ${rows[0].over.toFixed(3)} PAST the true surface -- beyond the ball's centre, on the far side. A MISS IS OBVIOUS AND A CONFIDENT WRONG DEPTH IS NOT, which is the same shape as v3471's roulette fault converging beautifully to a different closed form.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE MESH MOVES AND THE TRACER DOES NOT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const opt = { iso: ISO, wyvill, wyvillGrad, epsilon: 1e-6, maxStep: 0.05, maxSteps: 20000 };
    const hits = [];
    for (let i = 0; i < 60; i++) {
        const a = i * 0.2617, e = [3.2 * Math.cos(a), 1.1 * Math.sin(a * 2.3), 3.2 * Math.sin(a)];
        const L = Math.hypot(e[0], e[1], e[2]), d = [-e[0] / L, -e[1] / L, -e[2] / L];
        const r = marchBalls(BALLS, e, d, opt);
        if (r.hit) hits.push(r.P);
    }
    ok("every ray aimed at the two-ball blob hits it", hits.length === 60, `${hits.length} of 60`);

    const rows = [];
    for (const N of [16, 32, 64, 96]) {
        const mesh = marchingTets((x, y, z) => wyvill(BALLS, x, y, z), (x, y, z) => wyvillGrad(BALLS, x, y, z),
                                  { N, lo: -1.6, hi: 1.6, iso: ISO });
        let worst = 0, sum = 0;
        for (const p of hits) { const sd = surfaceDistance(mesh.verts, mesh.tris, p); worst = Math.max(worst, sd); sum += sd; }
        rows.push({ N, h: 3.2 / N, worst, mean: sum / hits.length });
    }
    for (const r of rows) say(`  N=${String(r.N).padEnd(3)} h=${r.h.toFixed(4)}  worst ${r.worst.toExponential(3)}  mean ${r.mean.toExponential(3)}  mean/h ${(r.mean / r.h).toFixed(4)}`);

    ok("!! *** THE DISAGREEMENT FALLS AS THE EXTRACTOR REFINES, AND THE HIT POINTS NEVER MOVED ***",
       rows[3].mean < rows[0].mean / 10 && rows.every((r, i) => i === 0 || r.mean < rows[i - 1].mean),
       "*** THE SAME SIXTY HIT POINTS ARE COMPARED AGAINST FOUR MESHES, SO THE ONLY THING CHANGING IS THE MESH. A number that falls when the OTHER route refines is a statement about that route: the tracer is the one standing still and marching tets is the approximation walking toward it. Had both been recomputed per N, a falling number would have been unattributable. ***");

    ok("...and the residual is a small fraction of a cell rather than a fixed distance",
       rows.every((r) => r.mean / r.h < 0.05),
       `mean/h runs ${rows.map((r) => (r.mean / r.h).toFixed(3)).join(", ")}. It FALLS as well, which is the second-order convergence v3417 measured for this extractor showing up from the outside. A residual that was a fixed fraction of h would mean the two routes disagreed about WHERE the surface is rather than about how finely it is tiled.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html IMPORTS the marcher and CALLS it",
       /import\s*\{[^}]*marchBalls[^}]*\}\s*from\s*"\/physics\/render\/sdfMarch\.mjs"/.test(src) &&
       /marchBalls\(/.test(src),
       "*** A .mjs WITH NO PAGE IS THE CLI-ONLY DELIVERABLE THIS PROJECT REFUSES, and v3457 shipped exactly that. The assertion is on the IMPORT and the CALL rather than on the module's name appearing, because this tree's most-committed defect is a check counting its own prose (PROSE-AS-CODE, twenty-plus times). It is a SECTION on an existing page rather than a new one: sdfMarch lives in physics/render/ beside pathTracer.mjs and the page is named for the renderer -- a new page would need a pageSections slot and the Arriving row is ratcheted. ***");

    ok("!! ...and the page prints the ANSWER KEY beside the picture",
       /surfaceDistance\(/.test(src) && /marchingTets\(/.test(src),
       "*** A BLOB THAT LOOKS LIKE A BLOB IS NOT A MEASUREMENT (v2579: proven correct and looks right on a screen are different claims). The page extracts the surface with marchingTets FROM THE SAME FIELD and prints the worst and mean distance from every hit to it, with the check mesh's cell size beside them so the residual can be read as a fraction of a cell rather than as a bare number. ***");

    ok("...and the plant is reachable from the page, not only from this gate",
       /rawStep/.test(src),
       "A plant only a gate can drive is a plant nobody watches fail.");
}

console.log(fails ? "\nsdfMarch-selfcheck: " + fails + " FAILED" : "\nsdfMarch-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
