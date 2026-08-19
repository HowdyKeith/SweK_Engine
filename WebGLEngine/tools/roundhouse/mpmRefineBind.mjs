// tools/roundhouse/mpmRefineBind.mjs -- v3802
//
// *** SELF-CONVERGENCE UNDER REFINEMENT, WHICH v3800'S NOTES CALLED THE ONLY REMAINING MPM ROUND THAT WOULD
// SAY THE SHAPE IS TRUSTWORTHY RATHER THAN MERELY ENERGY-LEGAL. A collapsing column has NO analytic answer, so
// there is no reference to compare against -- but successive refinements must AGREE WITH EACH OTHER by a
// shrinking margin. MEASURED: com.y 1.151674 / 1.373417 / 1.474780 at k = 1, 2, 4, successive differences
// 2.217e-1 then 1.014e-1, RATIO 2.188 -- first order, which is what MPM with contact and plasticity gives. ***
//
// *** AND THE ROUND'S FINDING IS THAT THE RATIO TEST CANNOT TELL YOU THAT YOU REFINED THE RIGHT THING.
// Holding the floor at a fixed CELL COUNT instead of a fixed WORLD HEIGHT moves the floor down every time the
// grid refines -- a completely different problem at each level -- and the sequence 1.1517 / 0.5840 / 0.3027
// CONVERGES JUST AS TIDILY, ratio 2.018. IT IS CONVERGING TO ZERO, because the floor is going to zero.
// A CONVERGENCE TEST GRADES THE SOLVER AND ASSUMES THE FIXTURE; ONLY AN INVARIANCE CHECK GRADES THE FIXTURE. ***

// ================================================================================================================
// *** v3849 -- THE PLANT WORKED AND THE CENSUS COULD NOT ADJUDICATE IT, AND THE REASON IS A TYPE. ***
// ================================================================================================================
//
// plantedCoverage listed this device as DECLARED BUT DEAD -- "declared observable fixtureInvariant is not a
// finite number in both modes" -- and it has been the ONLY entry on that list. THE PLANT WAS NEVER BROKEN:
// `cellfloor` moves the floor's world height 1.5 -> 0.75 between levels exactly as its header says. What was
// broken is that `fixtureInvariant` IS A BOOLEAN, and probeModePlant requires a finite NUMBER in both arms so
// that it can watch the declared quantity MOVE. true -> false is a flip a human reads instantly and the
// census cannot measure at all.
//
// *** SO THE NUMBER THE BOOLEAN WAS HIDING IS NOW THE DECLARED ONE, AND THE BOOLEAN IS DERIVED FROM IT RATHER
// THAN COMPUTED BESIDE IT. *** floorDriftFrac is the worst fractional departure of the floor's world height
// from its value at the coarsest level; fixtureInvariant is that number being under the tolerance. ONE
// DECLARATION, TWO READINGS -- which is the rule this tree applies everywhere else, and applying it here is
// what makes the two incapable of disagreeing.
//
// MEASURED, the two arms: floorDriftFrac 0 -> 0.5, off an EXACT zero (the floor is pinned in world units, so
// its drift is not small, it is nothing). floorHeights [1.5, 1.5] -> [1.5, 0.75].
//
// *** A PLANT THAT FIRES AND CANNOT BE ASKED ABOUT IS INDISTINGUISHABLE, IN THE CENSUS, FROM NO PLANT AT ALL,
// and this one sat that way since v3802. The lesson is not "declare a number" -- it is that THE CENSUS'S
// CONTRACT IS PART OF THE INTERFACE, and a bind that satisfies its own gate while failing the contract is
// exactly the shape v3766 keeps naming: REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS. ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { restBlock, centreOfMass, step } from "../../physics/mpm/step.mjs";

export const REFINE_OBSERVABLES = [
    "levels", "values", "diffs", "ratio", "converges",
    "floorHeights", "floorDriftFrac", "fixtureInvariant", "totalMasses", "massDriftFrac", "massInvariant", "order",
];

export const REFINE_MODES = ["refine", "cellfloor"];

const DEF = { E: 500, nu: 0.3, gy: -9.81, floorY: 1.5, baseH: 0.5, baseSteps: 480, levels: [1, 2] };

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
    const ps = restBlock({ n: 6 * k, spacing: 0.2 / k, x0: 3, y0: 2.2,
                           m: 0.1 / (k * k), vol0: 0.04 / (k * k) });
    const params = lame(c.E, c.nu);
    const totalMass = ps.reduce((a, p) => a + p.m, 0);
    for (let i = 0; i < Math.round(c.baseSteps * k); i++) {
        step(ps, g, { dt, gy: c.gy, params, plastic: true, walls: { lo, hi: lo, sticky: false } });
    }
    return { y: centreOfMass(ps).y, floorHeight: lo * h, totalMass, particles: ps.length };
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

    // *** THE FIXTURE MUST BE THE SAME PROBLEM AT EVERY LEVEL, AND THIS IS THE CHECK THE RATIO CANNOT MAKE. ***
    // v3849 -- THE NUMBER IS PRIMARY AND THE BOOLEAN IS DERIVED FROM IT. Computing the two separately would
    // let them disagree; deriving one from the other means the census's numeric reading and the gate's
    // pass/fail reading are THE SAME MEASUREMENT seen twice.
    const driftFrac = (xs) => {
        const a0 = xs[0];
        if (!(Math.abs(a0) > 0)) return xs.every((v) => v === a0) ? 0 : Infinity;
        return Math.max(...xs.map((v) => Math.abs(v - a0) / Math.abs(a0)));
    };
    const f0 = out.floorHeights[0];
    out.floorDriftFrac = driftFrac(out.floorHeights);
    out.fixtureInvariant = out.floorDriftFrac < 1e-9;
    out.massDriftFrac = driftFrac(out.totalMasses);
    out.massInvariant = out.massDriftFrac < 1e-9;

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
    // v3849 -- plantFlips NAMES THE NUMBER, not the boolean derived from it. probeModePlant must watch a
    // finite quantity MOVE; true -> false is not something it can measure, and this device was the census's
    // only DECLARED BUT DEAD entry for that reason alone.
    plantMode: "cellfloor", plantFlips: "floorDriftFrac", plantKind: "mode",
    name: "mpm-self-convergence", observables: REFINE_OBSERVABLES,
    build: buildRefine, defaults: refineDefaults,
};
