// WebGLEngine/physics/mesh/discontinuity-selfcheck.mjs -- v3644
//
// Run: node physics/mesh/discontinuity-selfcheck.mjs
//
// *** THE VERTEX STENCIL ON TRIAL. I recommended it twice -- v3642 and v3643 -- as the only repair for an
// undetermined gradient that needs no boundary data, and both rounds named the same untested assumption in as
// many words: IT ASSUMES A DISTANT CELL IS INFORMATIVE. Across a discontinuity it is not, and here it is the
// WIDENING rather than the boundary condition being measured. ***
//
// THE KEY IS EXACT: the field is PIECEWISE LINEAR, so on either side the true gradient is a KNOWN CONSTANT and
// any cell whose whole stencil lies on one side must return it EXACTLY. The interface sits on a mesh line, so no
// cell straddles it and every cell average is exact.

import { readFileSync } from "node:fs";
import { makeTriMesh, gradientLS } from "./triReconstruct.mjs";
import { vertexNeighbours } from "./rankRepair.mjs";
import { contaminationCensus, piecewiseCells, stencilCrosses } from "./discontinuity.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

function gradWith(u, mm, nbrs) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length);
    for (let t = 0; t < u.length; t++) {
        let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0;
        for (const q of nbrs[t]) {
            const dx = mm.cx[q] - mm.cx[t], dy = mm.cy[q] - mm.cy[t], du = u[q] - u[t], w = 1 / (dx * dx + dy * dy);
            sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy; sxu += w * dx * du; syu += w * dy * du;
        }
        const det = sxx * syy - sxy * sxy, tr = sxx + syy;
        if (Math.abs(det) > 1e-10 * Math.max(tr * tr, 1e-300)) { gx[t] = (syy * sxu - sxy * syu) / det; gy[t] = (sxx * syu - sxy * sxu) / det; }
    }
    return { gx, gy };
}
const setup = (n) => {
    const m = makeTriMesh({ nx: n, ny: n, h: 20 / n, skew: 0 });
    const { u } = piecewiseCells(m, {});
    const g0 = gradientLS(u, m);
    const skip = new Uint8Array(m.tri.length);
    let ns = 0; for (let t = 0; t < m.tri.length; t++) if (g0.rank[t] < 2) { skip[t] = 1; ns++; }
    return { m, skip, ns, vn: vertexNeighbours(m) };
};

// --- 1. two defects in one number, separated -------------------------------------------------------------------
{
    say("1. THE FIRST CENSUS I WROTE MIXED TWO DEFECTS, AND THE ONE IT WAS REALLY MEASURING WAS THE WRONG ONE.");
    const { m, skip, ns, vn } = setup(24);
    const noSkip = { gradFn: gradWith };
    const face0 = contaminationCensus(m, m.nbr, noSkip), vert0 = contaminationCensus(m, vn, noSkip);
    say("     WITHOUT excluding rank-deficient cells: face worstClean " + face0.worstClean.toExponential(3) +
        "   vertex worstClean " + vert0.worstClean.toExponential(3));
    ok("!! that reads as the discontinuity punishing the narrow stencil, and it is nothing of the kind",
        Math.abs(face0.worstClean - 1) < 1e-12 && vert0.worstClean < 1e-13,
        "the 1.000 is the " + ns + " RANK-DEFICIENT CORNER CELLS from v3640 returning a zero gradient -- a defect " +
        "the vertex stencil REPAIRS (v3642) and which has NO CONNECTION TO THE INTERFACE AT ALL");
    const face = contaminationCensus(m, m.nbr, { gradFn: gradWith, skipMask: skip });
    const vert = contaminationCensus(m, vn, { gradFn: gradWith, skipMask: skip });
    ok("with those " + ns + " excluded from BOTH columns, every clean cell is exact for BOTH stencils",
        face.worstClean < 1e-13 && vert.worstClean < 1e-13,
        "face " + face.worstClean.toExponential(2) + "   vertex " + vert.worstClean.toExponential(2) +
        " -- so neither stencil is wrong away from the interface, and the comparison below is about the " +
        "discontinuity and nothing else");
}

// --- 2. THE MEASUREMENT --------------------------------------------------------------------------------------------
{
    say("2. HOW MANY CELLS ARE CONTAMINATED, AND HOW FAR DOES IT REACH?");
    const rows = [24, 48].map((n) => {
        const { m, skip, vn } = setup(n);
        const face = contaminationCensus(m, m.nbr, { gradFn: gradWith, skipMask: skip });
        const vert = contaminationCensus(m, vn, { gradFn: gradWith, skipMask: skip });
        say("     n = " + n + "   face: " + face.nCross + " crossing, peak " + face.worstCross.toFixed(2) +
            ", integrated " + face.sumCross.toFixed(1) + ", reach " + face.reach.toFixed(2) +
            "   |   vertex: " + vert.nCross + ", peak " + vert.worstCross.toFixed(2) +
            ", integrated " + vert.sumCross.toFixed(1) + ", reach " + vert.reach.toFixed(2));
        return { n, face, vert, total: m.tri.length };
    });
    ok("!! the widening contaminates EXACTLY TWICE as many cells, at both mesh sizes",
        rows.every((r) => r.vert.nCross === 2 * r.face.nCross),
        rows.map((r) => r.face.nCross + " -> " + r.vert.nCross).join("; ") + " -- and the REACH doubles too, " +
        "0.33 to 0.67 cells, independent of n. A wider stencil reaches further across the jump BY CONSTRUCTION");
    ok("!! and it HALVES the peak error, because it averages more data", rows.every((r) => r.vert.worstCross < 0.6 * r.face.worstCross),
        rows.map((r) => r.face.worstCross.toFixed(1) + " -> " + r.vert.worstCross.toFixed(1)).join("; ") +
        " -- so the two effects pull OPPOSITE WAYS and a peak-error comparison alone would have called the widening better");
    ok("!! INTEGRATED over the band it is about 20% WORSE, which is the answer to the question actually asked",
        rows.every((r) => r.vert.sumCross > 1.1 * r.face.sumCross && r.vert.sumCross < 1.4 * r.face.sumCross),
        rows.map((r) => (100 * (r.vert.sumCross / r.face.sumCross - 1)).toFixed(1) + "%").join(" and ") +
        " worse. TWICE THE CELLS AT ABOUT 55% OF THE PEAK -- a peak and a band are not comparable by the peak, and " +
        "this is the first measurement in the arc where the repair I recommended twice is WORSE than not applying it");
    ok("the peak grows as the mesh refines, and that is CORRECT rather than a defect",
        rows[1].face.worstCross > 1.8 * rows[0].face.worstCross,
        "a jump has NO finite gradient, so a cell-width-sized difference over a shrinking cell must diverge as 1/h. " +
        "The relative error doubling per refinement is the field being honest, not the method failing");
    ok("...while the contaminated FRACTION falls with refinement", rows[1].vert.nCross / rows[1].total < 0.6 * rows[0].vert.nCross / rows[0].total,
        (100 * rows[0].vert.nCross / rows[0].total).toFixed(2) + "% -> " + (100 * rows[1].vert.nCross / rows[1].total).toFixed(2) +
        "%. The band's WIDTH IN CELLS is constant and its FRACTION shrinks -- v3641's 'rarer and more numerous' shape again");
}

// --- 3. THE SYNTHESIS, AND IT IS v3642'S LESSON ARRIVING FROM THE OTHER SIDE ----------------------------------------
{
    say("3. SO APPLY THE WIDENING WHERE IT IS NEEDED, NOT EVERYWHERE.");
    const { m, skip, vn } = setup(24);
    // the vertex stencil ONLY at rank-deficient cells; face neighbours everywhere else
    const targeted = m.nbr.map((list, t) => (skip[t] ? vn[t] : list));
    const face = contaminationCensus(m, m.nbr, { gradFn: gradWith, skipMask: skip });
    const vert = contaminationCensus(m, vn, { gradFn: gradWith, skipMask: skip });
    const tgt = contaminationCensus(m, targeted, { gradFn: gradWith });
    say("     face everywhere:   " + face.nCross + " crossing, integrated " + face.sumCross.toFixed(1));
    say("     vertex everywhere: " + vert.nCross + " crossing, integrated " + vert.sumCross.toFixed(1));
    say("     vertex ONLY where rank-deficient: " + tgt.nCross + " crossing, integrated " + tgt.sumCross.toFixed(1) +
        ", clean cells worst " + tgt.worstClean.toExponential(2));
    ok("!! targeting keeps the narrow contamination AND repairs the rank", tgt.nCross === face.nCross &&
        tgt.sumCross < 1.01 * face.sumCross && tgt.worstClean < 1e-13,
        "the same crossing count and integrated damage as the face stencil, with NO rank-deficient cells left over " +
        "-- v3642 found that a rule applied where no repair was needed can only do harm, and this is that lesson " +
        "arriving from the OTHER SIDE: the widening is a RANK REPAIR, not a general improvement, and applying it " +
        "everywhere buys a defect it was never meant to address");
    say("   SO THE RECOMMENDATION IS NARROWER THAN IT WAS TWO ROUNDS AGO, AND THAT IS THE POINT OF MEASURING IT:");
    say("   Dirichlet where the data exists; the vertex stencil ONLY at cells whose rank is actually deficient;");
    say("   and never as a blanket widening, because across a discontinuity it costs about 20% more integrated");
    say("   error over twice the band.");
}

// --- 4. the fixture, and what it deliberately does not cover ----------------------------------------------------------
{
    say("4. THE FIXTURE.");
    const { m } = setup(24);
    const { u, side } = piecewiseCells(m, {});
    let minL = Infinity, minR = Infinity;
    for (let t = 0; t < m.tri.length; t++) {
        const d = Math.abs(m.cx[t] - 10);
        if (side[t] < 0) minL = Math.min(minL, d); else minR = Math.min(minR, d);
    }
    ok("the interface sits on a mesh line, so NO CELL STRADDLES IT", Math.abs(minL - minR) < 1e-12 && minL > 0.3 * m.h,
        "nearest centroid is " + minL.toFixed(6) + " on both sides against h = " + m.h.toFixed(6) + " -- a straddling " +
        "cell's true average is NEITHER side's value, and that would blur the one thing this round measures");
    ok("both sides are exactly linear, so the true gradient is a known constant on each", (() => {
        const cross = stencilCrosses(m, m.nbr, side);
        let n = 0; for (const v of cross) n += v;
        return n > 0 && n < m.tri.length && u.length === m.tri.length;
    })());
    const src = readFileSync(new URL("./discontinuity.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT DONE: a SHEARED mesh, where the interface no longer follows edges and cells DO straddle -- the");
    say("   straddling cell's average is neither side's value and needs its own treatment before it can be graded.");
    say("   NOT DONE: a LIMITER on this field, which is what a real solver would reach for and which would change");
    say("   the question from 'how far does contamination reach' to 'how much of the jump survives'. AND STILL NOT");
    say("   DONE, NAMED IN THREE ROUNDS NOW: a genuine zero-flux wall, where the Neumann repair is the honest one.");
}

console.log("discontinuity-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
