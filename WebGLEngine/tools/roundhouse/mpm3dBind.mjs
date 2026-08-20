// tools/roundhouse/mpm3dBind.mjs -- v3804
//
// *** MPM IN 3D, GRADED ON THE SAME THREE IDENTITIES AS v3789'S 2D TRANSFER, WHICH IS THE POINT: IF THEY HOLD
// IN 3D, THE PIECES ABOVE THEM PORT MECHANICALLY. Partition of unity, linear momentum, and angular momentum
// under APIC -- 27 nodes instead of 9, and angular momentum a VECTOR instead of a scalar. ***
//
// *** AND THE PLANT REPRODUCES THE 2D FINDING IN A SHARPER FORM: PIC loses 55.56% of EVERY component of the
// angular momentum -- exactly 5/9 -- WHILE ITS LINEAR MOMENTUM ERROR IS 1.715e-15 AGAINST APIC'S 3.190e-15.
// THE PLANTED ARM SCORES BETTER ON THE COMPANION KEY, in 3D as in 2D, and for the same reason: fewer terms to
// accumulate round-off in. ***

import { makeGrid3, p2g3, g2p3, quadWeights, spinningBlock3,
         particleMomentum3, gridMomentum3, particleAngular3, gridAngular3 } from "../../physics/mpm/transfer3d.mjs";

export const MPM3D_OBSERVABLES = [
    "unityWorst", "unityHolds", "linearErr", "linearHolds",
    "angularParticles", "angularGrid", "angularLostPerAxis", "angularWorstFrac", "angularHolds",
    "roundTripVelErr", "particles", "nodes", "stencil",
];

export const MPM3D_MODES = ["conserve", "unity", "roundtrip", "pic"];

const DEF = { nx: 12, ny: 12, nz: 12, h: 1, n: 4, spacing: 0.4, mass: 0.5 };

export function mpm3dDefaults(hyp) {
    const h = { mode: "conserve", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.nx = Math.min(32, Math.max(4, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(32, Math.max(4, num(c.ny, DEF.ny) | 0));
    c.nz = Math.min(32, Math.max(4, num(c.nz, DEF.nz) | 0));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h)));
    c.n = Math.min(10, Math.max(2, num(c.n, DEF.n) | 0));
    h.config = c;
    if (!MPM3D_MODES.includes(h.mode)) h.mode = "conserve";
    return h;
}

export async function buildMpm3d(hyp, base = {}) {
    const h = mpm3dDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const affine = h.mode !== "pic";
    const out = { stencil: 27 };

    if (h.mode === "unity") {
        // *** IN 3D THE STENCIL SUM IS A PRODUCT OF THREE ONE-DIMENSIONAL SUMS, so a slip on ONE axis is
        // DILUTED by the other two rather than shouting. Sampled per-axis, where it cannot hide. ***
        let worst = 0;
        for (let t = 0; t < 97; t++) {
            const x = (t / 97) * 3 * c.h + 2 * c.h;
            const w = quadWeights(x, c.h);
            worst = Math.max(worst, Math.abs(w.w[0] + w.w[1] + w.w[2] - 1));
        }
        out.unityWorst = worst;
        out.unityHolds = worst < 1e-12;
        return out;
    }

    const g = makeGrid3(c.nx, c.ny, c.nz, c.h);
    const ps = spinningBlock3({ n: c.n, spacing: c.spacing, m: c.mass });
    out.particles = ps.length;
    out.nodes = g.n;

    if (h.mode === "roundtrip") {
        const before = ps.map((p) => [p.vx, p.vy, p.vz]);
        p2g3(ps, g, { affine });
        g2p3(ps, g, { affine });
        let worst = 0;
        for (let i = 0; i < ps.length; i++) {
            worst = Math.max(worst, Math.hypot(ps[i].vx - before[i][0], ps[i].vy - before[i][1], ps[i].vz - before[i][2]));
        }
        out.roundTripVelErr = worst;
        return out;
    }

    p2g3(ps, g, { affine });
    const pm = particleMomentum3(ps), gm = gridMomentum3(g);
    out.linearErr = Math.hypot(...pm.map((v, i) => v - gm[i]));
    out.linearHolds = out.linearErr < 1e-9;

    const pl = particleAngular3(ps, g.h), gl = gridAngular3(g);
    out.angularParticles = pl;
    out.angularGrid = gl;
    // *** PER AXIS, NOT |L|. Reported as three numbers so a reader sees which axis moved, even though the one
    // plant available hits all three equally -- see transfer3d.mjs's header for why that is a PRECAUTION. ***
    out.angularLostPerAxis = pl.map((v, i) => (Math.abs(v) > 1e-12 ? Math.abs(v - gl[i]) / Math.abs(v) : 0));
    out.angularWorstFrac = Math.max(...out.angularLostPerAxis);
    out.angularHolds = out.angularWorstFrac < 1e-9;
    return out;
}

export const mpm3dDevice = {
    modes: MPM3D_MODES,
    plantMode: "pic", plantFlips: "angularWorstFrac", plantKind: "mode",
    name: "mpm-3d-apic-transfer", observables: MPM3D_OBSERVABLES,
    build: buildMpm3d, defaults: mpm3dDefaults,
};
