// tools/roundhouse/mpmGridBind.mjs -- v3790
//
// *** MPM'S GRID SOLVE, GRADED ON AN EXACT IMPULSE IDENTITY. A uniform body force g applied for dt to a total
// mass M changes total momentum by EXACTLY M*g*dt -- not approximately, because gravity is uniform. MEASURED
// in the correct order: 4.311e-16 relative error. ***
//
// *** THE PLANT IS AN ORDER OF OPERATIONS, NOT A WRONG NUMBER, AND IT IS THE ONE MPM ACTUALLY INVITES.
// `v += g*dt` is the same line either way; what differs is WHICH FIELD IS IN THE BUFFER WHEN IT RUNS. On a
// VELOCITY field every node gains the same velocity, so the momentum gain is m_i*g*dt and the total is M*g*dt.
// On a MOMENTUM field the same line adds g*dt of MOMENTUM to each node regardless of its mass, so the total
// impulse becomes (NODE COUNT)*g*dt: right units, plausible motion, WRONG PHYSICS. THE BUG SURVIVES A READING
// BECAUSE THE LINE IS IDENTICAL. ***
//
// And the tell is that it SCALES WITH THE GRID rather than with the material: refine the grid and the honest
// impulse is unchanged while the planted one moves, because more nodes carry the same mass.

import { makeGrid, p2g, rotatingBlock } from "../../physics/mpm/transfer.mjs";
import { gridStep, normalise, enforceWalls } from "../../physics/mpm/gridSolve.mjs";

export const MPMGRID_OBSERVABLES = [
    "impulseY", "expectedImpulseY", "impulseErrFrac", "impulseHolds",
    "coarseErrFrac", "fineErrFrac", "scalesWithGrid",
    "wallNormalMax", "wallsHold", "totalMass", "liveNodes", "nx",
];

export const MPMGRID_MODES = ["impulse", "resolution", "walls", "forcefirst"];

const DEF = { nx: 12, ny: 12, h: 1, gy: -9.81, dt: 1 / 120, blockN: 6 };

export function mpmGridDefaults(hyp) {
    const h = { mode: "impulse", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.nx = Math.min(64, Math.max(4, (num(c.nx, DEF.nx) | 0)));
    c.ny = Math.min(64, Math.max(4, (num(c.ny, DEF.ny) | 0)));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h) || DEF.h));
    c.dt = Math.min(0.1, Math.max(1e-5, num(c.dt, DEF.dt) || DEF.dt));
    h.config = c;
    if (!MPMGRID_MODES.includes(h.mode)) h.mode = "impulse";
    return h;
}

/**
 * A loaded grid: the same rotating block the transfer device uses, so the two devices share a fixture.
 * *** THE MATERIAL IS HELD FIXED IN WORLD UNITS WHEN THE GRID REFINES, AND MY FIRST VERSION DID NOT DO THAT.
 * It scaled the particle spacing with h, so refining shrank the block by the same factor and THE LIVE NODE
 * COUNT STAYED AT 25 -- which made the planted error read 7.937e-3 AT EVERY RESOLUTION and appeared to falsify
 * a claim that is true. REFINING A GRID MEANS MORE NODES OVER THE SAME MATERIAL; scaling the material with it
 * is a different experiment that holds the very ratio under test constant. Measured after the fix: 25 -> 64 ->
 * 169 live nodes and a planted error of 7.937e-3 -> 1.540 -> 5.706. ***
 */
function loaded(c, hScale = 1) {
    const nx = Math.round(c.nx * hScale), ny = Math.round(c.ny * hScale), h = c.h / hScale;
    const g = makeGrid(nx, ny, h);
    p2g(rotatingBlock({ nx: c.blockN, ny: c.blockN, h, spacing: 0.5, x0: 3, y0: 3 }), g, { affine: true });
    return g;
}

const errOf = (c, hScale, forceFirst) => {
    const g = loaded(c, hScale);
    const r = gridStep(g, { gy: c.gy, dt: c.dt, forceBeforeNormalise: forceFirst });
    const want = r.totalMass * c.gy * c.dt;
    return { err: Math.abs(r.impulseY - want) / Math.abs(want), r, want };
};

export async function buildMpmGrid(hyp, base = {}) {
    const h = mpmGridDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const forceFirst = h.mode === "forcefirst";
    const out = { nx: c.nx };

    if (h.mode === "walls") {
        // *** A BOUNDARY IS A VERDICT, NOT A RESIDUAL: a node on a sticky wall has EXACTLY zero velocity. ***
        const g = loaded(c);
        normalise(g);
        enforceWalls(g, { lo: 1, hi: 1, sticky: true });
        let worst = 0;
        for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
            if (i > 0 && j > 0 && i < g.nx && j < g.ny) continue;
            const k = j * (g.nx + 1) + i;
            worst = Math.max(worst, Math.abs(g.mvx[k]), Math.abs(g.mvy[k]));
        }
        out.wallNormalMax = worst;
        out.wallsHold = worst === 0;
        return out;
    }

    if (h.mode === "resolution") {
        // *** THE TELL: the honest impulse does not care about the grid, because it is weighted by MASS.
        // The planted one is weighted by NODE COUNT, so refining moves it. ***
        const coarse = errOf(c, 1, forceFirst).err, fine = errOf(c, 2, forceFirst).err;
        out.coarseErrFrac = coarse;
        out.fineErrFrac = fine;
        // The honest impulse is weighted by MASS and does not move; the planted one is weighted by NODE COUNT
        // and grows as the grid refines over the same material.
        out.scalesWithGrid = fine > Math.max(coarse * 10, 1e-6);
        return out;
    }

    const { err, r, want } = errOf(c, 1, forceFirst);
    out.impulseY = r.impulseY;
    out.expectedImpulseY = want;
    out.impulseErrFrac = err;
    out.impulseHolds = err < 1e-9;
    out.totalMass = r.totalMass;
    out.liveNodes = r.live;
    return out;
}

export const mpmGridDevice = {
    modes: MPMGRID_MODES,
    // "impulse" is FIRST so the contract compares the plant against the mode that owns the identity.
    plantMode: "forcefirst", plantFlips: "impulseErrFrac", plantKind: "mode",
    name: "mpm-grid-impulse", observables: MPMGRID_OBSERVABLES,
    build: buildMpmGrid, defaults: mpmGridDefaults,
};
