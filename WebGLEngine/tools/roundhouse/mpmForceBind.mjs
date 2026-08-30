// tools/roundhouse/mpmForceBind.mjs -- v3793
//
// *** THE PIECE THAT CONNECTS THE STRESS TO THE GRID -- the first assembly in this arc rather than a new idea.
// v3791 computed a stress and v3790 stepped a grid; NOTHING JOINED THEM, so the stress was a number nobody
// spent. ***
//
// *** TWO KEYS, AND EACH IS BLIND TO WHAT THE OTHER CATCHES.
//   NEWTON'S THIRD LAW -- the internal forces sum to EXACTLY zero over the grid. Internal stress cannot
//     accelerate the centre of mass; a block cannot push itself across the room. Exact because the quadratic
//     B-spline GRADIENTS sum to exactly zero over a stencil, so each particle's contribution cancels within
//     its own nine nodes. MEASURED: 7.94e-15.
//   THE 1/h SCALING -- the force magnitude must scale as 1/h, because the weight derivative carries a chain
//     rule the weights themselves do not. MEASURED honest: 5.524e+1 at h=1 and 1.105e+2 at h=0.5, a ratio of
//     exactly 2 for a halved cell.
// *** DROPPING THE CHAIN RULE IS A REAL BUG -- every force wrong by a factor of h -- AND THE THIRD LAW CANNOT
// SEE IT AT ALL: scaling every gradient by the same constant leaves a sum of zero at zero, so the net reads
// 7.94e-15 in both arms. ONLY THE SCALING KEY CATCHES IT. ***
//
// *** AND IT IS INVISIBLE AT h = 1 BY ARITHMETIC: multiplying by h is multiplying by ONE. The default grid
// spacing anybody would test at is a spacing where THE BUG DOES NOT EXIST. That is v3763's lesson -- a key
// evaluated only where its parameter is neutral is blind -- arriving from a third direction. ***

import { makeGrid, rotatingBlock } from "../../physics/mpm/transfer.mjs";
import { lame, firstPiola } from "../../physics/mpm/constitutive.mjs";
import { stressForces, stencilGradientSum } from "../../physics/mpm/forces.mjs";

export const MPMFORCE_OBSERVABLES = [
    "netForce", "thirdLawHolds", "gradientSum", "weightSum", "stencilHolds",
    "maxForceCoarse", "maxForceFine", "scaleRatio", "scalesWithH",
    "maxForceCoarsePlanted", "maxForceFinePlanted", "scaleRatioPlanted", "scalesWithHPlanted", "h",
];

export const MPMFORCE_MODES = ["thirdlaw", "scaling", "stencil", "brokenstencil"];

const DEF = { h: 1, nx: 12, ny: 12, E: 1000, nu: 0.3, F: [1.08, 0.04, -0.02, 0.95], vol0: 0.25, blockN: 5 };

export function mpmForceDefaults(hyp) {
    const h = { mode: "thirdlaw", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.h = Math.min(4, Math.max(0.05, num(c.h, DEF.h)));
    c.nx = Math.min(48, Math.max(4, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(48, Math.max(4, num(c.ny, DEF.ny) | 0));
    c.E = Math.min(1e7, Math.max(1, num(c.E, DEF.E)));
    h.config = c;
    if (!MPMFORCE_MODES.includes(h.mode)) h.mode = "thirdlaw";
    return h;
}

const rig = (c, cellH) => {
    const g = makeGrid(c.nx, c.ny, cellH);
    const ps = rotatingBlock({ nx: c.blockN, ny: c.blockN, spacing: 0.5 * cellH, h: cellH })
        .map((p) => ({ ...p, vol0: c.vol0, F: c.F.slice(), F0: [1, 0, 0, 1] }));
    return { g, ps };
};

export async function buildMpmForce(hyp, base = {}) {
    const h = mpmForceDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const par = lame(c.E, c.nu);
    const stressOf = (F) => firstPiola(F, par);
    const broken = h.mode === "brokenstencil";
    const out = { h: c.h };

    if (h.mode === "stencil") {
        const s = stencilGradientSum(3.37, c.h);
        out.gradientSum = Math.abs(s.dSum);
        out.weightSum = s.wSum;
        out.stencilHolds = out.gradientSum < 1e-12 && Math.abs(s.wSum - 1) < 1e-12;
        return out;
    }

    if (h.mode === "scaling") {
        // *** THE KEY THE THIRD LAW CANNOT PROVIDE: force magnitude must DOUBLE when the cell HALVES. ***
        //
        // v4132 -- BOTH ARMS, WHERE ONLY THE HONEST ONE EVER RAN. physics/mpm/forces.mjs implements
        // skipChainRule -- a real, self-tested plant (its own module-scope run block exercises it directly) --
        // and its own comment there is explicit that this is "the WRONG plant" for the third-law identity,
        // because scaling every gradient by the same constant leaves a sum of zero at zero. But THIS device's
        // own header spends its whole second half arguing the opposite claim for the SCALING key: "the third
        // law cannot see it... ONLY THE SCALING KEY CATCHES IT." That claim was never wired to a measurement --
        // scaling mode called stressForces with `{}` always, so skipChainRule never ran here at all, and the
        // header's numbers (a ratio of 1 instead of 2, invisible at h=1 by arithmetic) were prose with nothing
        // behind them. Verified directly against forces.mjs before wiring this: honest ratio 2.0000000000,
        // skipChainRule ratio 1.0000000000 -- the claim was true and simply never measured here.
        const maxOf = (cellH, opts) => { const { g, ps } = rig(c, cellH);
                                   return Math.max(...stressForces(ps, g, stressOf, opts).fx); };
        out.maxForceCoarse = maxOf(c.h, {});
        out.maxForceFine = maxOf(c.h / 2, {});
        out.scaleRatio = out.maxForceFine / out.maxForceCoarse;
        out.scalesWithH = Math.abs(out.scaleRatio - 2) < 0.05;

        out.maxForceCoarsePlanted = maxOf(c.h, { skipChainRule: true });
        out.maxForceFinePlanted = maxOf(c.h / 2, { skipChainRule: true });
        out.scaleRatioPlanted = out.maxForceFinePlanted / out.maxForceCoarsePlanted;
        out.scalesWithHPlanted = Math.abs(out.scaleRatioPlanted - 2) < 0.05;
        return out;
    }

    const { g, ps } = rig(c, c.h);
    const r = stressForces(ps, g, stressOf, { breakStencil: broken });
    out.netForce = Math.hypot(r.netX, r.netY);
    out.thirdLawHolds = out.netForce < 1e-9;
    return out;
}

export const mpmForceDevice = {
    modes: MPMFORCE_MODES,
    // "thirdlaw" is FIRST so the contract compares the plant against the mode that owns the identity.
    plantMode: "brokenstencil", plantFlips: "netForce", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "netForce is the sum of internal forces over a closed body, identically 0 by Newton's third law; a broken stencil takes it 7.94e-15 -> 5.02",
    name: "mpm-internal-forces", observables: MPMFORCE_OBSERVABLES,
    build: buildMpmForce, defaults: mpmForceDefaults,
};
