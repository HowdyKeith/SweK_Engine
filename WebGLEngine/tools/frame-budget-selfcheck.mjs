// WebGLEngine/tools/frame-budget-selfcheck.mjs — v2550
//
// Run: node tools/frame-budget-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This pins the SHAPE of the flesh frame, not its speed. Timings on a 1-CPU sandbox are not the rig's timings and
// asserting a millisecond count here would be a check that fails on a fast machine -- which is a check that
// teaches people to ignore checks.
//
// What it pins is the thing that keeps getting me: WHICH STAGE DOMINATES. Handed a correct, well-cited paper
// about making isosurface extraction faster, the honest response was to measure where the frame goes -- and the
// isosurface turned out to be under 15% of it. If that ever stops being true, an isosurface paper becomes worth
// reading again, and this file should tell us so by failing.
import { profileFlesh } from "./frame-budget.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const p = profileFlesh(400, 24);
const [[, sph], [, fieldT], [, march]] = p.stages;
const share = (t) => t / p.total;

// ---- 1. THE FINDING: the flesh is SPH-bound, not isosurface-bound ------------------------------------------
{
    ok("THE SPH STEP DOMINATES THE FRAME", share(sph) > 0.5,
       (100 * share(sph)).toFixed(0) + "% of " + p.total.toFixed(2) + "ms");
    ok("...and the isosurface march is a MINORITY of it", share(march) < 0.30,
       "march is " + (100 * share(march)).toFixed(0) + "% -- halving it buys " + (100 * share(march) / 2).toFixed(0) + "%, and Amdahl does not care how good the paper is");
    // If this ever flips, an isosurface paper is worth reading again. It should arrive as a FAILURE, not as a
    // hunch someone has in eight months.
}

// ---- 2. fitGrid has already taken Wald's skip -----------------------------------------------------------------
// Wald 2005 skips empty space with a kd-tree because a 256^3 CT cube is >99% empty. fitGrid fits the box to the
// BONES, which is the same idea applied earlier and better suited to a limb.
{
    const [dx, dy, dz] = p.cells.dims;
    const fitted = dx * dy * dz;
    const cube = dx * dx * dx;
    ok("fitGrid fits the box to the bones (Wald's skip, taken earlier)", fitted < cube / 3,
       dx + "x" + dy + "x" + dz + " = " + fitted + " cells, vs " + cube + " for a cube of the long side: " + (cube / fitted).toFixed(1) + "x already skipped");
    const total = p.cells.empty + p.cells.boundary;
    ok("...which is WHY the grid is only ~75% empty and not ~99%", p.cells.empty / total > 0.5 && p.cells.empty / total < 0.92,
       (100 * p.cells.empty / total).toFixed(1) + "% empty -- a 256^3 CT volume is >99%, which is why HE needed a tree");
}

// ---- 3. the profile is a profile, not noise --------------------------------------------------------------------
{
    ok("every stage costs something measurable", p.stages.every(([, t]) => t > 0 && Number.isFinite(t)),
       p.stages.map(([n, t]) => n.split(" ")[0] + " " + t.toFixed(2)).join(", "));
    ok("the parts sum to the whole", Math.abs(p.stages.reduce((a, [, t]) => a + t, 0) - p.total) < 1e-9);
    ok("the field build sits between them", fieldT > 0 && fieldT < sph,
       "hybridGrid " + fieldT.toFixed(2) + "ms -- it reads pressure COARSE (12 cells) and interpolates onto the fine grid, which is why it is cheap");
}

console.log(fails ? "\nframe-budget-selfcheck: " + fails + " FAILED" : "\nframe-budget-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
