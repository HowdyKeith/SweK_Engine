// tools/roundhouse/mpmRefineBind.mjs -- v3802
//
// *** SELF-CONVERGENCE UNDER REFINEMENT, WHICH v3800'S NOTES CALLED THE ONLY REMAINING MPM ROUND THAT WOULD
// SAY THE SHAPE IS TRUSTWORTHY RATHER THAN MERELY ENERGY-LEGAL. A collapsing column has NO analytic answer, so
// there is no reference to compare against -- but successive refinements must AGREE WITH EACH OTHER by a
// shrinking margin. v3802 MEASURED com.y 1.151674 / 1.373417 / 1.474780 at k = 1, 2, 4, ratio 2.188; v3846 held
// the block's world extent fixed (see DEF.blockL) and the same study reads 1.151674 / 1.371714 / 1.473512,
// RATIO 2.162, ORDER 1.11 -- first order, which is what MPM with contact and plasticity gives. ***
//
// *** AND THE ROUND'S FINDING IS THAT THE RATIO TEST CANNOT TELL YOU THAT YOU REFINED THE RIGHT THING.
// Holding the floor at a fixed CELL COUNT instead of a fixed WORLD HEIGHT moves the floor down every time the
// grid refines -- a completely different problem at each level -- and the sequence 1.1517 / 0.5840 / 0.3027
// CONVERGES JUST AS TIDILY, ratio 2.018. IT IS CONVERGING TO ZERO, because the floor is going to zero.
// A CONVERGENCE TEST GRADES THE SOLVER AND ASSUMES THE FIXTURE; ONLY AN INVARIANCE CHECK GRADES THE FIXTURE. ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { restBlock, centreOfMass, step } from "../../physics/mpm/step.mjs";

export const REFINE_OBSERVABLES = [
    "levels", "values", "diffs", "ratio", "converges",
    "floorHeights", "fixtureInvariant", "totalMasses", "massInvariant", "order",
    // v3846 -- TWO MORE THINGS THE RATIO CANNOT SEE, both found by lifting this study to the 3D loop.
    "blockExtents", "extentInvariant", "restVmax", "comDrift", "restedAtSample",
];

export const REFINE_MODES = ["refine", "cellfloor"];

/** *** THE REST TEST IS ON THE OBSERVABLE, NOT ON THE PARTICLES. *** The first version of this check used peak
 * particle speed and read 1.5e-2 / 2.5e-2 / 6.1e-3 against a 1e-2 tolerance -- FAILING A STUDY WHOSE com.y IS
 * FLAT TO SIX FIGURES, because one jittering particle sets the peak while the body it belongs to has stopped.
 * What the study samples is com.y, so what has to be stationary is com.y: comDrift is |d com.y / dt| over the
 * last REST_WINDOW seconds. On this 2D fixture it reads ~1e-4; on the 3D column at t = 2 s, still ringing, the
 * same measure reads ~1, four orders apart. A tolerance of 1e-2 world units per second sits between them and
 * is a NUMBER IN THE SOURCE, so loosening it is a deliberate act. */
export const REST_TOL = 1e-2;
export const REST_WINDOW = 0.1;

// v3846 -- blockL REPLACES A CONSTANT SPACING. The old fixture used n = 6k particles at spacing 0.2/k, whose
// extent is (6k-1)*0.2/k = 1.2 - 0.2/k -- 1.000 / 1.100 / 1.150, A BLOCK 15% BIGGER AT THE FINEST LEVEL. The
// mass was invariant and the floor was invariant, so both existing checks passed while the BODY changed size.
// Measured before changing it: the shipped fixture gives ratio 2.188, a fixed extent gives 2.162, so this was
// IMMATERIAL HERE -- but an unchecked degree of freedom in a study whose whole subject is unchecked degrees of
// freedom is worth closing, and restVmax below is the same lesson where it was NOT immaterial.
const DEF = { E: 500, nu: 0.3, gy: -9.81, floorY: 1.5, baseH: 0.5, baseSteps: 480, levels: [1, 2], blockL: 1.0 };

export function refineDefaults(hyp) {
    const h = { mode: "refine", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    if (!Array.isArray(c.levels) || c.levels.length < 2) c.levels = DEF.levels.slice();
    h.config = c;
    if (!REFINE_MODES.includes(h.mode)) h.mode = "refine";
    return h;
}

/**
 * One run at refinement level k. THE MATERIAL IS HELD FIXED IN WORLD UNITS and only the DISCRETISATION moves:
 * h and dt halve, particle count quadruples, per-particle mass and volume quarter so the TOTAL is unchanged.
 * *** v3790 MADE THE OPPOSITE MISTAKE -- scaling the material WITH the grid, which holds the very ratio under
 * test constant. REFINING MEANS MORE NODES OVER THE SAME MATERIAL. ***
 */
function runLevel(c, k, { cellFloor = false } = {}) {
    const h = c.baseH / k, dt = (1 / 240) / k;
    // *** THE PLANT: `cellFloor` pins the wall at a fixed CELL COUNT, so its WORLD HEIGHT halves each time. ***
    const lo = cellFloor ? Math.round(c.floorY / c.baseH) : Math.round(c.floorY / h);
    const g = makeGrid(16 * k, 16 * k, h);
    // spacing from the block's WORLD LENGTH, so (n-1)*spacing is blockL at every level (see DEF above).
    const n = 6 * k, spacing = c.blockL / (n - 1);
    const ps = restBlock({ n, spacing, x0: 3, y0: 2.2, m: 0.1 / (k * k), vol0: 0.04 / (k * k) });
    const params = lame(c.E, c.nu);
    const totalMass = ps.reduce((a, p) => a + p.m, 0);
    const steps = Math.round(c.baseSteps * k), back = Math.max(1, Math.round(REST_WINDOW / dt));
    let yBefore = null;
    for (let i = 0; i < steps; i++) {
        if (i === steps - back) yBefore = centreOfMass(ps).y;   // com.y one REST_WINDOW before the sample
        step(ps, g, { dt, gy: c.gy, params, plastic: true, walls: { lo, hi: lo, sticky: false } });
    }
    // *** v3846 -- THE OBSERVABLE MUST BE AT REST, OR THE STUDY IS SAMPLING A TRANSIENT. *** com.y at a fixed
    // time is only a convergence observable once the material has stopped moving; on a body still ringing, two
    // refinements differ by PHASE and the ratio measures nothing. This is what the 3D lift hit: the same column
    // in 3D is still oscillating at t = 2 s (com.y swinging 1.83 to 2.33, peak speed 3.9) and the "ratio" came
    // out 0.045 -- an apparent DIVERGENCE that was entirely an artifact of when it was sampled.
    let vmax = 0;
    for (const p of ps) { const sp = Math.hypot(p.vx, p.vy); if (sp > vmax) vmax = sp; }
    const y = centreOfMass(ps).y;
    const drift = yBefore === null ? Infinity : Math.abs(y - yBefore) / REST_WINDOW;
    return { y, floorHeight: lo * h, totalMass, particles: ps.length, vmax, comDrift: drift,
             extent: (6 * k - 1) * (c.blockL / (6 * k - 1)) };
}

export async function buildRefine(hyp, base = {}) {
    const h = refineDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const cellFloor = h.mode === "cellfloor";
    const rows = c.levels.map((k) => ({ k, ...runLevel(c, k, { cellFloor }) }));

    const values = rows.map((r) => r.y);
    const diffs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
    const out = { levels: c.levels.slice(), values, diffs };
    out.floorHeights = rows.map((r) => r.floorHeight);
    out.totalMasses = rows.map((r) => r.totalMass);
    out.blockExtents = rows.map((r) => r.extent);
    out.restVmax = rows.map((r) => r.vmax);
    out.comDrift = rows.map((r) => r.comDrift);

    // *** THE FIXTURE MUST BE THE SAME PROBLEM AT EVERY LEVEL, AND THIS IS THE CHECK THE RATIO CANNOT MAKE. ***
    const f0 = out.floorHeights[0];
    out.fixtureInvariant = out.floorHeights.every((v) => Math.abs(v - f0) < 1e-9);
    const m0 = out.totalMasses[0];
    out.massInvariant = out.totalMasses.every((v) => Math.abs(v - m0) < 1e-9);
    const e0 = out.blockExtents[0];
    out.extentInvariant = out.blockExtents.every((v) => Math.abs(v - e0) < 1e-9);
    // REST_TOL is a speed, in world units per second, against a collapse whose peak speed is ~3.9: 1e-2 is a
    // quarter of a percent of the motion the study is about. It is a NUMBER IN THE SOURCE so loosening it is
    // a deliberate act, the same rule the baselines elsewhere in this tree follow.
    out.restedAtSample = out.comDrift.every((v) => v < REST_TOL);

    if (diffs.length >= 2) {
        out.ratio = diffs[1] > 0 ? diffs[0] / diffs[1] : Infinity;
        out.order = Math.log2(out.ratio);
    } else {
        // two levels give one difference: report it and say plainly that no ratio exists
        out.ratio = null; out.order = null;
    }
    out.converges = out.fixtureInvariant && diffs.every((d, i) => i === 0 || d < diffs[i - 1]);
    return out;
}

export const refineDevice = {
    modes: REFINE_MODES,
    // "refine" is FIRST so the contract compares the plant against the mode that owns the invariance.
    plantMode: "cellfloor", plantFlips: "fixtureInvariant", plantKind: "mode",
    name: "mpm-self-convergence", observables: REFINE_OBSERVABLES,
    build: buildRefine, defaults: refineDefaults,
};
