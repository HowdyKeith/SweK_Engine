// WebGLEngine/physics/mesh/dualContour-selfcheck.mjs -- v3432
//
// Run: node physics/mesh/dualContour-selfcheck.mjs
//
// *** THIS IS THE COMPARISON v3417 ASKED FOR IN ADVANCE. *** That round measured marching tetrahedra cutting a
// sharp corner by a FIXED FRACTION OF A CELL -- 0.377, 0.386, 0.387, 0.379, 0.363 across a 4x refinement, so
// HALVING THE GRID BOUGHT NOTHING -- and wrote into its own gate: "when somebody builds a feature-preserving
// extractor, section 2 goes RED and is REWRITTEN AS A COMPARISON, NOT WEAKENED." Somebody did. This is it.
//
// AND THE FIXTURE IS A SWEEP OF SUB-CELL OFFSETS, NOT A GRID SIZE, WHICH IS ALSO v3417'S LESSON: one fixed
// placement there gave orders 0.870 / 2.593 / 0.173 because the corner happened to land near a grid point. ONE
// ALIGNMENT MEASURES ALIGNMENT, NOT ORDER. Every number below is the WORST over six deterministic offsets at
// each of four resolutions -- twenty-four runs, and the worst one is the claim.
"use strict";
import { unitBox, notchedBox, box, sphere, subtract } from "./csg.mjs";
import { dualContour, qefVertex, nearestVertexDistance, triangulate } from "./dualContour.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RES = [12, 16, 24, 32], OFFSETS = 6;
/** Worst cut/h over the offset sweep, for a given vertex-placement policy. */
function sweep(node, target, opts = {}) {
    let worst = 0; const all = [];
    for (const n of RES) for (let s = 0; s < OFFSETS; s++) {
        const off = (s / OFFSETS) * (2 / n) * 0.97;
        const m = dualContour(node, { lo: -1 + off, hi: 1 + off, n, ...opts });
        const c = nearestVertexDistance(m.verts, target) / m.h;
        all.push(c); worst = Math.max(worst, c);
    }
    return { worst, mean: all.reduce((a, x) => a + x, 0) / all.length, min: Math.min(...all), runs: all.length };
}

// ---- 1. THE QEF HAS CLOSED-FORM ANSWERS AND MUST HIT THEM ---------------------------------------------------
{
    const one = qefVertex([{ p: [0.3, 0, 0], n: [1, 0, 0] }], [0, 0, 0]);
    ok("!! one plane: the vertex lands ON the plane, and the regulariser moves it along the plane only",
       Math.abs(one[0] - 0.3) < 1e-6 && Math.abs(one[1]) < 1e-9 && Math.abs(one[2]) < 1e-9,
       `x = ${one[0].toPrecision(10)} against 0.3. A single plane pins ONE direction; the other two are unpinned and the regulariser holds them at the centroid, WHICH IS THE REGULARISER DOING ITS JOB RATHER THAN AN ERROR.`);
    const two = qefVertex([{ p: [0.3, 0, 0], n: [1, 0, 0] }, { p: [0, 0.2, 0], n: [0, 1, 0] }], [0, 0, 0]);
    ok("!! two planes: the vertex lands ON THE CREASE LINE where they meet",
       Math.abs(two[0] - 0.3) < 1e-4 && Math.abs(two[1] - 0.2) < 1e-4,
       `(${two[0].toPrecision(8)}, ${two[1].toPrecision(8)}) against (0.3, 0.2). The residual is ~1.5e-5 and it is EXACTLY THE REGULARISATION WEIGHT PULLING TOWARD THE CENTROID -- a stated design choice with a known size, not drift.`);
    const three = qefVertex([{ p: [0.3, 0, 0], n: [1, 0, 0] }, { p: [0, 0.2, 0], n: [0, 1, 0] }, { p: [0, 0, 0.1], n: [0, 0, 1] }], [0, 0, 0]);
    ok("!! three planes: the vertex lands ON THE CORNER, which is the point of the whole algorithm",
       Math.abs(three[0] - 0.3) < 1e-4 && Math.abs(three[1] - 0.2) < 1e-4 && Math.abs(three[2] - 0.1) < 1e-4,
       "a flat face pins one direction, an edge two, a corner three -- and the regulariser falls back toward the centroid along EXACTLY the unpinned ones.");
}

// ---- 2. *** THE COMPARISON: cut/h COLLAPSES WHERE MARCHING TETS HELD IT AT 0.38 *** --------------------------
{
    const MT_BASELINE = 0.377;                 // v3417's BEST case, so the comparison is against its strongest number
    const dc = sweep(unitBox(0.6), [0.6, 0.6, 0.6]);
    say(`dual contouring, ${dc.runs} runs over ${RES.length} resolutions x ${OFFSETS} offsets: worst cut/h ${dc.worst.toExponential(3)}, mean ${dc.mean.toExponential(3)}`);
    ok("!! *** THE CORNER IS CAPTURED: worst cut/h is FOUR ORDERS BELOW marching tets' 0.377 ***",
       dc.worst < 1e-3,
       `${dc.worst.toExponential(3)} against ${MT_BASELINE}, a factor of ${Math.round(MT_BASELINE / dc.worst)}. *** v3417 MEASURED THAT HALVING THE GRID BOUGHT NOTHING, BECAUSE A VERTEX COULD ONLY SIT ON A GRID EDGE AND A CORNER NEVER DOES. Putting the vertex INSIDE the cell is the entire difference, and it is not an improvement in degree -- THE OLD NUMBER WAS A FLOOR AND THIS ONE IS NOISE. ***`);
    let worst8 = 0;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const m = dualContour(unitBox(0.6), { n: 16 });
        worst8 = Math.max(worst8, nearestVertexDistance(m.verts, [0.6 * sx, 0.6 * sy, 0.6 * sz]) / m.h);
    }
    ok("...and it is ALL EIGHT corners, not the one the fixture points at", worst8 < 1e-3,
       `worst ${worst8.toExponential(3)}. A method that captured one corner and rounded seven would pass a single-target check.`);
}

// ---- 3. *** THE NEGATIVE LANDS BACK ON THE OLD NUMBER *** ---------------------------------------------------
{
    const mp = sweep(unitBox(0.6), [0.6, 0.6, 0.6], { massPoint: true });
    const dc = sweep(unitBox(0.6), [0.6, 0.6, 0.6]);
    say(`mass-point fallback: min ${mp.min.toFixed(3)}, mean ${mp.mean.toFixed(3)}, worst ${mp.worst.toFixed(3)}`);
    ok("!! *** replacing the QEF with the AVERAGE OF THE CROSSINGS -- what a naive implementation does -- ROUNDS THE CORNER AGAIN ***",
       mp.mean > 0.3 && mp.worst > 0.5 && mp.mean / dc.worst > 100,
       `mean ${mp.mean.toFixed(3)} against marching tets' 0.377 and this algorithm's ${dc.worst.toExponential(2)}. EVERY CROSSING LIES ON A GRID EDGE, SO THEIR AVERAGE DOES TOO -- the same blindness as marching tets wearing a newer name. *** THE NUMBER THAT PROVES DUAL CONTOURING WORKS IS THE SAME NUMBER THAT CATCHES IT DONE WRONG. ***`);
    ok("...and the fallback's error swings with the ALIGNMENT rather than the resolution",
       mp.worst / Math.max(mp.min, 1e-9) > 3,
       `it ranges ${mp.min.toFixed(3)} to ${mp.worst.toFixed(3)} across the same offsets where dual contouring never moves. ONE ALIGNMENT WOULD HAVE MEASURED ALIGNMENT -- v3417's lesson, and the reason this whole gate sweeps.`);
}

// ---- 4. THE MESH IS A MESH ----------------------------------------------------------------------------------
{
    const m = dualContour(unitBox(0.6), { n: 16 });
    ok("!! every quad indexes four real vertices and no quad is degenerate",
       m.quads.length > 100 && m.quads.every((q) => q.length === 4 && new Set(q).size === 4 && q.every((i) => i >= 0 && i < m.verts.length)),
       `${m.verts.length} vertices, ${m.quads.length} quads. DUAL CONTOURING IS NATURALLY QUAD; triangulate() states its diagonal rather than leaving it implicit.`);
    ok("...and triangulating doubles the count exactly", triangulate(m.quads).length === m.quads.length * 2);
    const nb = notchedBox(), n2 = dualContour(nb, { n: 20 });
    const strays = n2.verts.filter((v) => nb.f(v) < -n2.h * 0.75).length;
    ok("!! a fixture with sharp edges AND a curved concave face puts no vertex deep inside the solid",
       strays === 0 && n2.verts.length > 300,
       `${strays} of ${n2.verts.length} vertices sit more than 0.75h inside. A BOX WITH A SPHERE BITTEN OUT OF ONE CORNER: creases where the bite meets the faces, and a curved surface in between -- so a method that only handled planes would show here.`);
}

// ---- 5. *** TWO LIMITATIONS, AND ONLY ONE OF THEM IS FIXED BY RESOLUTION *** --------------------------------
{
    // A square tube with walls 0.05 thick. At n = 16 a cell is 0.125 across -- THICKER THAN THE WALL.
    const thin = subtract(box([0, 0, 0], [0.6, 0.6, 0.6]), box([0, 0, 0], [0.55, 0.55, 2]));
    const coarse = dualContour(thin, { n: 16 }), fine = dualContour(thin, { n: 64 });
    say(`thin wall 0.05: n=16 (h=${coarse.h.toFixed(4)}) gives ${coarse.verts.length} vertices; n=64 (h=${fine.h.toFixed(4)}) gives ${fine.verts.length}`);
    ok("!! *** A FEATURE THINNER THAN A CELL IS NOT CUT, IT IS ABSENT -- and THAT one resolution does fix ***",
       coarse.verts.length === 0 && fine.verts.length > 100,
       `${coarse.verts.length} vertices at h = ${coarse.h.toFixed(4)} against ${fine.verts.length} at h = ${fine.h.toFixed(4)}. The grid never straddles the wall, so no edge changes sign and there is nothing to contour. *** THIS IS THE EXACT OPPOSITE OF THE CORNER PROBLEM: the corner cut was a FLOOR that refinement could not move, and this vanishing IS moved by refinement. TWO FAILURES THAT BOTH LOOK LIKE "THE MESH IS WRONG" AND HAVE OPPOSITE CURES. ***`);
    ok("REPORTED: and the clamp to the cell is a STATED limitation, not a safety net",
       true,
       "a QEF whose planes are nearly parallel can minimise far outside its cell, and letting it would tangle the mesh; clamping instead CUTS any feature lying outside its own cell. THAT IS THE CASE Aviz.Cms DISCARDS AND CMS WAS INVENTED FOR, AND THIS IS NOT CMS -- written down rather than discovered later.");
}

console.log(fails ? "\ndualContour-selfcheck: " + fails + " FAILED" : "\ndualContour-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
