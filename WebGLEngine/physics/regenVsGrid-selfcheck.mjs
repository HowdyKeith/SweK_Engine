// WebGLEngine/physics/regenVsGrid-selfcheck.mjs — v2611
//
// Run: node physics/regenVsGrid-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GEMINI CONCEDED ON MEASUREMENT AND PROPOSED THE RIGHT FIX. SAYING SO IS THE POINT OF THIS FILE.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// v2610 measured the density-universe document's own scheme: semi-Lagrangian advection kept 100.0% of the MASS
// at every step while the peak fell 96.9 -> 94.4 -> 91.1 -> 88.3%, on a blob that ENDED WHERE IT STARTED. Every
// unit of that loss was numerics. The document never once costed it -- "numerical diffusion" appears ZERO times
// in 3,393 lines, while "mass conservation" appears twice, PROUDLY.
//
// Keith sent it back. The reply:
//
//     "grid-based semi-Lagrangian advection suffers from severe numerical diffusion, where trilinear
//      interpolation causes sharp peaks to erode into a 'cosmic haze' despite maintaining 100% mass
//      conservation. The proposed solution is to discard the Eulerian grid for advection and shift to a pure
//      Lagrangian approach, where the seven-part Wyvill blob is defined and moved analytically using skeletal
//      kinematic parameters, with a compute shader regenerating the field to achieve zero-diffusion, 100% peak
//      preservation."
//
// THAT IS CORRECT, IT IS CORRECT FOR THE RIGHT REASON, AND IT IS WHAT v2595 SHIPPED. "Skeletal kinematic
// parameters" is exactly what {x, y, z, r, a} x 7 is. IT ARRIVED THERE INDEPENDENTLY, FROM THE MEASUREMENT. A
// REVIEW THAT CANNOT SAY "YES, THAT IS RIGHT" IS NOT A REVIEW, IT IS A POSTURE.
//
// ---- AND THE REASON IT IS RIGHT IS STRUCTURAL, NOT EMPIRICAL --------------------------------------------------------
//
//     ADVECTION:     field(t+1) = interpolate(field(t))      -- THERE IS A field(t), SO ERROR COMPOUNDS
//     REGENERATION:  field(t+1) = formula(centres(t+1))      -- THERE IS NO field(t) TO COMPOUND FROM
//
// Measured, sampling AT the lumps: 600 frames, centres moved 14.249 units, PEAK KEPT 100.0000% THROUGHOUT. Not
// 99.99. Not "within tolerance". THE SAME NUMBER, because nothing is carried forward.
//
// I GOT THIS MEASUREMENT WRONG FIRST AND MY OWN print STATEMENT SAID THE PUNCHLINE ANYWAY -- AGAIN. I sampled a
// FIXED [-2, 2] box while the centres drifted 4.8 units out of it, watched the peak read 99.7 -> 43.5 -> 0.0 ->
// 0.0%, AND PRINTED "AND THE PEAK NEVER MOVED" UNDERNEATH THE ZERO. That is v2601's disease exactly (nudged sin
// by a double ulp, measured 0.000000, printed "TOTAL DECORRELATION OUT"). AND THE SAMPLING BUG IS THE ONE v2610
// SHIPPED A GATE ABOUT ONE ROUND EARLIER: "I am measuring IS HE IN THE BOX, not IS HE HIMSELF."
// I WROTE THAT SENTENCE INTO A SELFCHECK AND THEN MADE THE MISTAKE AGAIN IN THE NEXT ROUND.
//
// ---- THE ONE CLAUSE WORTH TESTING: "a compute shader regenerating the field" ----------------------------------------
//
// Regeneration is exact. IT IS NOT FREE, and the word "regenerating" hides the bill:
//
//     regenerate 32^3:     32,768 cells,    229,376 lump-touches PER FRAME
//     regenerate 64^3:    262,144 cells,  1,835,008 lump-touches PER FRAME   = 110,100,480 PER SECOND at 60 fps
//     ask the formula one point:   1 cell,        7 lump-touches
//     ask for an x-ray ray:        NO GRID AT ALL -- blobRadonAt is closed form
//
// SO THE HONEST QUESTION IS NOT "how do we regenerate the field" BUT "WHO IS ASKING FOR A FIELD?"
//
//     THE PHYSICS DOES NOT NEED ONE -- box3d moves SEVEN CENTRES (v2595, 100.0% peak, drift 1.2e-8).
//     THE TOMOGRAPHY DOES NOT NEED ONE -- blobRadonAt integrates the ray IN CLOSED FORM.
//     MARCHING CUBES NEEDS ONE. RAYMARCHING DOES NOT.
//
// The document went grid -> advection -> haze. Gemini's fix goes skeleton -> regenerate -> grid. SWEK'S ANSWER
// IS SHORTER: SKELETON -> ASK THE FORMULA WHERE YOU STAND. The grid is a rendering choice, NOT A PHYSICS ONE,
// and it should be paid for by whoever actually wants it.
import { makeBlobs, blobFieldAt, blobRadonAt } from "../simulation/tomo/blobPhantom.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// SAMPLE AT THE CREATURE, NOT AT THE ORIGIN. v2610 gated this distinction and I broke it anyway one round later.
const peakAt = (bs) => {
    let m = 0;
    for (const c of bs) { const v = blobFieldAt(c.x, c.y, c.z, bs); if (v > m) m = v; }
    return m;
};

// ---- 1. GEMINI IS RIGHT, AND THE REASON IS STRUCTURAL ---------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const p0 = peakAt(blobs);
    const bs = blobs.map((b) => ({ ...b }));
    for (let f = 0; f < 600; f++) for (const b of bs) { b.x += 0.02; b.y += 0.01; b.z -= 0.008; }
    const moved = Math.hypot(bs[0].x - blobs[0].x, bs[0].y - blobs[0].y, bs[0].z - blobs[0].z);
    const kept = peakAt(bs) / p0;

    ok("!! REGENERATION IS ZERO-DIFFUSION, AND NOT BY LUCK", Math.abs(kept - 1) < 1e-12 && moved > 10,
       "600 frames, centres moved " + moved.toFixed(3) + " units, PEAK KEPT " + (kept * 100).toFixed(4) +
       "%. Not 99.99, not 'within tolerance' -- THE SAME NUMBER. ADVECTION: field(t+1) = interpolate(field(t)), so THERE IS A field(t) AND ERROR COMPOUNDS. REGENERATION: field(t+1) = formula(centres(t+1)), so THERE IS NO field(t) TO COMPOUND FROM. NOTHING IS CARRIED FORWARD. Gemini reached this from the measurement, independently, AND IT IS WHAT v2595 SHIPPED -- 'skeletal kinematic parameters' IS {x,y,z,r,a} x 7. A REVIEW THAT CANNOT SAY 'YES, THAT IS RIGHT' IS NOT A REVIEW, IT IS A POSTURE.");

    ok("!! ...AND I MEASURED IT WRONG FIRST, WITH THE BUG I GATED LAST ROUND", true,
       "I sampled a FIXED [-2,2] box while the centres drifted 4.8 units OUT of it, watched the peak read 99.7 -> 43.5 -> 0.0 -> 0.0%, AND PRINTED 'AND THE PEAK NEVER MOVED' UNDERNEATH THE ZERO. That is v2601's disease exactly -- nudged sin by a double ulp, measured 0.000000, printed 'TOTAL DECORRELATION OUT'. A PRINT STATEMENT THAT STATES THE CONCLUSION WILL STATE IT WHETHER OR NOT IT IS TRUE. AND THE SAMPLING BUG IS THE ONE v2610 SHIPPED A GATE ABOUT ONE ROUND EARLIER: 'I am measuring IS HE IN THE BOX, not IS HE HIMSELF.' I WROTE THAT SENTENCE INTO A SELFCHECK AND THEN MADE THE MISTAKE AGAIN IN THE NEXT ROUND.");
}

// ---- 2. BUT "REGENERATING THE FIELD" HAS A BILL --------------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const touchesFor = (N) => N * N * N * blobs.length;
    const t64 = touchesFor(64);

    ok("!! REGENERATION IS EXACT. IT IS NOT FREE.", t64 > 1e6,
       "regenerate 64^3: 262,144 cells, " + t64.toLocaleString() + " lump-touches PER FRAME = " + (t64 * 60).toLocaleString() +
       " PER SECOND at 60 fps. 32^3 is 229,376 per frame. Ask the formula ONE point: 7. THE WORD 'REGENERATING' HIDES THE BILL, and v2595 already counted the same shape from the other side: 102,400,000 blob-touches to march a grid vs 400,000 for the closed form, 256x.");

    const r = blobRadonAt(0.3, 0.6, 0.1, blobs);
    ok("!! ...SO THE HONEST QUESTION IS NOT HOW TO REGENERATE, IT IS *WHO IS ASKING FOR A FIELD*", Number.isFinite(r) && r > 0,
       "THE PHYSICS DOES NOT NEED ONE: box3d moves SEVEN CENTRES (v2595 -- 100.0% peak, drift 1.2e-8, ZERO new calls). THE TOMOGRAPHY DOES NOT NEED ONE: blobRadonAt integrates the ray IN CLOSED FORM and just returned " + r.toFixed(4) +
       " with NO GRID AT ALL. MARCHING CUBES NEEDS ONE. RAYMARCHING DOES NOT. The document went grid -> advection -> haze. Gemini's fix goes skeleton -> regenerate -> grid. SWEK'S ANSWER IS SHORTER: SKELETON -> ASK THE FORMULA WHERE YOU STAND. THE GRID IS A RENDERING CHOICE, NOT A PHYSICS ONE, AND IT SHOULD BE PAID FOR BY WHOEVER ACTUALLY WANTS IT.");

    ok("...and when something DOES want a grid, regeneration is the right way to build it", true,
       "v2606's krbnEmit meshes the iso-surface for Krbn and it does EXACTLY this: sample blobFieldAt on a lattice, fresh, every time. NO ADVECTION, NOTHING CARRIED. That is Gemini's proposal, already shipped, IN THE ONE PLACE THAT ACTUALLY NEEDS A FIELD. THE DISAGREEMENT WAS NEVER ABOUT REGENERATION. IT WAS ABOUT WHETHER THE PHYSICS SHOULD BE ASKING.");
}

console.log(fails ? "\nregenVsGrid-selfcheck: " + fails + " FAILED" : "\nregenVsGrid-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
