// tools/roundhouse/mpmTransferBind.mjs -- v3789
//
// *** THE MATERIAL POINT METHOD'S TRANSFER, GRADED ON THREE IDENTITIES. Scope stated first because the name
// oversells: this is P2G and G2P, NOT a solver -- no grid momentum solve, no constitutive model, no
// plasticity, nothing to look at. What it is, is the half of MPM that carries EXACT claims. ***
//
// *** THE KEYS ARE IDENTITIES, NOT TOLERANCES:
//   PARTITION OF UNITY -- the nine quadratic B-spline weights sum to EXACTLY 1 wherever the particle sits.
//   LINEAR MOMENTUM -- sum(m_p v_p) equals the grid's, to round-off, because mass and momentum are scattered
//     with the SAME weights.
//   ANGULAR MOMENTUM -- PIC LOSES IT, APIC CONSERVES IT EXACTLY (Jiang et al. 2015), and the code is never
//     told either fact. MEASURED on a rigidly rotating block: APIC carries 64.155 to the grid's 64.155;
//     PIC carries 64.155 and delivers 47.775, LOSING 25.53%.
// ***
//
// *** AND PIC IS THE PLANT, WHICH IS WHY THIS DEVICE IS WORTH THE ROUND: dropping the affine term leaves
// LINEAR momentum PERFECT -- 9.550e-16, marginally BETTER than APIC's 1.650e-15 -- while angular momentum
// bleeds a quarter away. A CHECK ON LINEAR MOMENTUM ALONE WOULD RATE THE PLANTED ARM HIGHER THAN THE HONEST
// ONE. Same family as v3781's Kraft sum holding at exactly 1 on a backwards Huffman tree and v3783's flat
// ladder being trivially monotone: A COMPANION KEY THAT IS BLIND BY CONSTRUCTION IS ONLY SAFE TO SHIP IF ITS
// BLINDNESS SHIPS BESIDE IT. ***

import { makeGrid, p2g, g2p, quadWeights, rotatingBlock,
         particleMomentum, gridMomentum, particleAngularMomentum, gridAngularMomentum } from "../../physics/mpm/transfer.mjs";

export const MPM_OBSERVABLES = [
    "unityWorst", "unityHolds", "linearErr", "linearHolds",
    "angularParticles", "angularGrid", "angularLostFrac", "angularHolds",
    "roundTripVelErr", "particles", "nodes", "h",
];

export const MPM_MODES = ["conserve", "unity", "roundtrip", "pic"];

const DEF = { nx: 12, ny: 12, h: 1, blockN: 6, spacing: 0.5, omega: 1.3, mass: 0.7 };

export function mpmDefaults(hyp) {
    const h = { mode: "conserve", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.nx = Math.min(64, Math.max(4, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(64, Math.max(4, num(c.ny, DEF.ny) | 0));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h)));
    c.blockN = Math.min(20, Math.max(2, num(c.blockN, DEF.blockN) | 0));
    h.config = c;
    if (!MPM_MODES.includes(h.mode)) h.mode = "conserve";
    return h;
}

const build = (c) => ({
    grid: makeGrid(c.nx, c.ny, c.h),
    ps: rotatingBlock({ nx: c.blockN, ny: c.blockN, h: c.h, spacing: c.spacing, omega: c.omega, m: c.mass }),
});

export async function buildMpmTransfer(hyp, base = {}) {
    const h = mpmDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const affine = h.mode !== "pic";          // *** "pic" IS THE PLANT: the affine term is simply not carried. ***
    const out = { h: c.h };

    if (h.mode === "unity") {
        // Sampled across a whole cell INCLUDING the awkward offsets, because a stencil slip shows at some
        // positions and not others -- testing only cell centres would miss the base-index error entirely.
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

    const { grid, ps } = build(c);
    out.particles = ps.length;
    out.nodes = grid.n;

    if (h.mode === "roundtrip") {
        // P2G then G2P on a rigid rotation: APIC reproduces the velocity field it started from.
        const before = ps.map((p) => ({ vx: p.vx, vy: p.vy }));
        p2g(ps, grid, { affine });
        g2p(ps, grid, { affine });
        let worst = 0;
        for (let i = 0; i < ps.length; i++) worst = Math.max(worst, Math.hypot(ps[i].vx - before[i].vx, ps[i].vy - before[i].vy));
        out.roundTripVelErr = worst;
        return out;
    }

    p2g(ps, grid, { affine });
    const pm = particleMomentum(ps), gm = gridMomentum(grid);
    out.linearErr = Math.hypot(pm.px - gm.px, pm.py - gm.py);
    out.linearHolds = out.linearErr < 1e-9;

    const pl = particleAngularMomentum(ps, grid.h), gl = gridAngularMomentum(grid);
    out.angularParticles = pl;
    out.angularGrid = gl;
    out.angularLostFrac = Math.abs(pl) > 0 ? Math.abs(pl - gl) / Math.abs(pl) : null;
    // *** AN IDENTITY, SO THE BAR IS ROUND-OFF AND NOT A TOLERANCE ARGUMENT. ***
    out.angularHolds = out.angularLostFrac !== null && out.angularLostFrac < 1e-9;
    return out;
}

export const mpmTransferDevice = {
    modes: MPM_MODES,
    // "conserve" is FIRST so the mode-plant contract compares the plant against the mode that owns the keys.
    plantMode: "pic", plantFlips: "angularLostFrac", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "angularLostFrac is the fraction of angular momentum lost in the particle-to-grid transfer, ideally 0 for an APIC-style conserving transfer; PIC drops the affine term and loses 25.5 percent. NOTE: linearErr actually IMPROVES under the plant (1.65e-15 -> 9.55e-16) because PIC is more damped, which is why the side-channel is reported and never promoted to a verdict",
    name: "mpm-apic-transfer", observables: MPM_OBSERVABLES,
    build: buildMpmTransfer, defaults: mpmDefaults,
};
