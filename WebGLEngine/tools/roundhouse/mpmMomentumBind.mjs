// tools/roundhouse/mpmMomentumBind.mjs -- v3798
//
// *** A FRICTIONLESS FLOOR EXERTS NO HORIZONTAL FORCE, SO sum(m*vx) IS CONSERVED EXACTLY. Not approximately:
// there is nothing in the system that can change it. The floor pushes UP, gravity pulls DOWN, and internal
// stress sums to zero over the grid (v3793). MEASURED: 1.184e-15 over 480 steps of a block sliding and
// landing. ***
//
// *** AND THE PLANT IS A FIXTURE MISTAKE RATHER THAN A CODE CHANGE, WHICH IS A SHAPE THIS ARC HAS NOT USED.
// Put the floor ONE cell from the domain edge instead of three and the SAME CODE loses 99.9% of the horizontal
// momentum -- 3.750000 down to 0.003025 -- on a boundary that exerts no horizontal force at all.
// THE REASON: a quadratic stencil reaches ONE CELL EACH WAY, so a particle resting a fraction above y=0 has a
// stencil base of -1. THAT NODE ROW DOES NOT EXIST, and both p2g and g2p SKIP IT: the weights stop summing to
// one and the gather silently loses whatever share those nodes carried. THE PHYSICS IS INNOCENT; THE MATERIAL
// WAS STANDING ON THE EDGE OF THE GRID. ***

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { restBlock, step } from "../../physics/mpm/step.mjs";

export const MPMMOM_OBSERVABLES = [
    "pxStart", "pxEnd", "pxErrFrac", "momentumHolds",
    "massStart", "massEnd", "massHolds", "floorOffset", "steps", "landed",
];

export const MPMMOM_MODES = ["slide", "mass", "edgefloor"];

// *** THE FLOOR SITS THREE CELLS IN, AND THAT IS THE POINT OF THE DEVICE RATHER THAN A TUNING CHOICE. ***
const DEF = { steps: 480, dt: 1 / 240, gy: -9.81, E: 500, nu: 0.3, lo: 3, vx: 1.5, n: 5 };

export function mpmMomDefaults(hyp) {
    const h = { mode: "slide", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.steps = Math.min(2000, Math.max(60, num(c.steps, DEF.steps) | 0));
    c.lo = Math.min(6, Math.max(1, num(c.lo, DEF.lo) | 0));
    h.config = c;
    if (!MPMMOM_MODES.includes(h.mode)) h.mode = "slide";
    return h;
}

const px = (ps) => ps.reduce((a, p) => a + p.m * p.vx, 0);
const mass = (ps) => ps.reduce((a, p) => a + p.m, 0);

export async function buildMpmMomentum(hyp, base = {}) {
    const h = mpmMomDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const lo = h.mode === "edgefloor" ? 1 : c.lo;      // *** THE PLANT: the floor on the domain edge. ***
    const params = lame(c.E, c.nu);
    const g = makeGrid(16, 16, 0.5);
    // start high enough above the floor that the block is airborne first and lands during the run
    const ps = restBlock({ n: c.n, spacing: 0.2, x0: 2.5, y0: 1.2 + (lo - 1) * 0.5, m: 0.1, vol0: 0.04 });
    for (const p of ps) p.vx = c.vx;                   // horizontal momentum, or the key would be VACUOUS

    const p0 = px(ps), m0 = mass(ps);
    let minY = Infinity;
    for (let i = 0; i < c.steps; i++) {
        step(ps, g, { dt: c.dt, gy: c.gy, params, plastic: true, walls: { lo, floorOnly: true, sticky: false } });
        for (const p of ps) if (p.y < minY) minY = p.y;
    }
    const p1 = px(ps), m1 = mass(ps);

    const out = { floorOffset: lo, steps: c.steps, pxStart: p0, pxEnd: p1, massStart: m0, massEnd: m1 };
    out.pxErrFrac = Math.abs(p1 - p0) / Math.abs(p0);
    out.momentumHolds = out.pxErrFrac < 1e-9;
    // the block MUST reach the floor, or the key is only testing free flight
    out.landed = minY <= (lo * 0.5) + 0.25;
    out.massHolds = m1 === m0;                          // particles are never created or destroyed
    return out;
}

export const mpmMomentumDevice = {
    modes: MPMMOM_MODES,
    // "slide" is FIRST so the contract compares the plant against the mode that owns the identity.
    plantMode: "edgefloor", plantFlips: "pxErrFrac", plantKind: "mode",
    name: "mpm-frictionless-floor", observables: MPMMOM_OBSERVABLES,
    build: buildMpmMomentum, defaults: mpmMomDefaults,
};
