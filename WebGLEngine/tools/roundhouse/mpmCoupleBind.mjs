// tools/roundhouse/mpmCoupleBind.mjs -- v3803
//
// *** TWO-MATERIAL CONTACT, WHICH IS MPM'S ACTUAL SELLING POINT OVER FLIP AND SPH: it needs NO CONTACT CODE AT
// ALL. Two bodies rasterised onto ONE shared grid cannot occupy the same node velocity, so they push each
// other apart as a consequence of the transfer -- no pairs, no broad phase, no penalty forces. THIS DEVICE
// CHECKS THAT THE CLAIM IS TRUE OF THIS IMPLEMENTATION rather than of the method in general. ***
//
// *** AND THE TWO KEYS DISAGREE, WHICH IS WHY IT IS WORTH A DEVICE.
//   MOMENTUM IS CONSERVED across the collision -- 1.850e-15 -- and it is conserved JUST AS WELL, 1.527e-14,
//     WHEN EACH BODY GETS ITS OWN GRID AND THEY PASS STRAIGHT THROUGH EACH OTHER. Two bodies that never
//     interact conserve momentum PERFECTLY; it is the cheapest thing in the world to conserve by doing nothing.
//   SEPARATION is the key that sees it: final gap +0.5527 on one shared grid, -1.4000 on two grids -- NEGATIVE,
//     which is one body INSIDE the other.
// *** A CONSERVATION LAW CANNOT DISTINGUISH CONTACT FROM GHOSTING. ***
//
// The fixture is deliberately ASYMMETRIC -- different masses AND different speeds -- because two bodies with
// equal and opposite momentum start at ZERO and conserve it VACUOUSLY. Measured that way first: px read
// 0.000000000 at every step in both arms, and the check would have passed on any code at all (v3798's lesson).

import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { restBlock, step } from "../../physics/mpm/step.mjs";

export const COUPLE_OBSERVABLES = [
    "pxStart", "pxEnd", "pxErrFrac", "momentumHolds",
    "gapStart", "gapEnd", "separated", "minGap", "interpenetrated", "grids",
];

export const COUPLE_MODES = ["contact", "separategrids"];

const DEF = { steps: 240, dt: 1 / 240, E: 500, nu: 0.3,
              left: { n: 4, spacing: 0.2, x0: 2.0, y0: 3.0, m: 0.1, vol0: 0.04, vx: 2.5 },
              right: { n: 4, spacing: 0.2, x0: 4.5, y0: 3.0, m: 0.2, vol0: 0.04, vx: -0.8 } };

export function coupleDefaults(hyp) {
    const h = { mode: "contact", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.steps = Math.min(2000, Math.max(30, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!COUPLE_MODES.includes(h.mode)) h.mode = "contact";
    return h;
}

const body = (spec) => { const ps = restBlock(spec); for (const p of ps) p.vx = spec.vx; return ps; };
const px = (ps) => ps.reduce((s, p) => s + p.m * p.vx, 0);
const gapOf = (a, b) => Math.min(...b.map((q) => q.x)) - Math.max(...a.map((q) => q.x));

export async function buildCouple(hyp, base = {}) {
    const h = coupleDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const split = h.mode === "separategrids";      // *** THE PLANT: a grid each, so neither body sees the other.
    const params = lame(c.E, c.nu);

    const a = body(c.left), b = body(c.right), all = [...a, ...b];
    const g = makeGrid(16, 16, 0.5), ga = makeGrid(16, 16, 0.5), gb = makeGrid(16, 16, 0.5);

    const p0 = px(all), gap0 = gapOf(a, b);
    let minGap = gap0;
    for (let i = 0; i < c.steps; i++) {
        if (split) {
            step(a, ga, { dt: c.dt, gy: 0, params, plastic: true, walls: null });
            step(b, gb, { dt: c.dt, gy: 0, params, plastic: true, walls: null });
        } else {
            step(all, g, { dt: c.dt, gy: 0, params, plastic: true, walls: null });
        }
        const gp = gapOf(a, b);
        if (gp < minGap) minGap = gp;
    }
    const p1 = px(all), gap1 = gapOf(a, b);

    return {
        grids: split ? 2 : 1,
        pxStart: p0, pxEnd: p1, pxErrFrac: Math.abs(p1 - p0) / Math.abs(p0),
        momentumHolds: Math.abs(p1 - p0) / Math.abs(p0) < 1e-9,
        gapStart: gap0, gapEnd: gap1, minGap,
        // *** SEPARATION IS THE KEY: the bodies must approach and then STOP approaching, never overlap. ***
        separated: minGap > 0,
        interpenetrated: minGap < 0,
    };
}

export const coupleDevice = {
    modes: COUPLE_MODES,
    // "contact" is FIRST so the contract compares the plant against the mode that owns separation.
    plantMode: "separategrids", plantFlips: "minGap", plantKind: "mode",
    name: "mpm-two-material-contact", observables: COUPLE_OBSERVABLES,
    build: buildCouple, defaults: coupleDefaults,
};
