// tools/roundhouse/cartPoleBind.mjs
//
// v3995 -- THE INVERTED-PENDULUM DEVICE. physics/control/cartPole.mjs ships with this round; the bind hands it
// to the roundhouse so an optimal regulator is swept and adjudicated beside the physics devices. It is the first
// device in the lab whose subject is a CONTROLLER rather than a phenomenon.
//
// MODES:
//   "regulate"  design the LQR and report the gain, the ARE residual, and closed-loop stability by BOTH routes.
//   "margin"    the Kalman return-difference inequality |1 + L(jw)| >= 1, and the gain margin it implies.
//   "cost"      the Riccati prediction x0'Px0 against the cost a simulation actually spends.
//   "balance"   the REAL nonlinear cart-pole, released at a tilt: does the controller catch the pole?
//
// ================================================================================================================
// *** THE PLANTED ERROR IS A CORRECT LINEARISATION OF THE WRONG EQUILIBRIUM ***
// ================================================================================================================
//
// The plant linearises about the HANGING equilibrium rather than the upright one -- one sign, on gravity. That is
// not a corrupted model. It is the exactly correct linearisation of the other equilibrium of the same cart-pole,
// the one every undergraduate meets first, and a controller designed on it is a perfectly good controller FOR A
// PENDULUM THAT HANGS.
//
// AND EVERY SELF-CONSISTENT CHECK PASSES IT. Measured, on the planted design:
//   the Riccati solve converges and its ARE residual is 1.9e-12 -- as small as the honest one's 7.6e-12;
//   its closed loop is stable ON ITS OWN MODEL by both the Routh-Hurwitz and Lyapunov routes;
//   the KALMAN INEQUALITY HOLDS on its own loop, min |1+L| = 1.000000155, matching the honest one to nine digits;
//   its predicted cost matches the cost simulated on its own dynamics.
//
// Four green checks on a controller that will drop the pole in 1.36 seconds. THAT IS THE DEVICE: self-consistency
// grades the model you brought, not the one you are standing in front of.
//
// EVERY MODE REPORTS `trueClosedLoopStable` AND `poleFellAtSeconds`, deliberately rather than decoratively.
// plantedCoverage RUNS each device nominal against planted in every declared mode and counts a mode only if a
// FINITE NUMERIC observable moves -- and those two are the only quantities here that ask about the TRUE plant
// rather than the designed-for one. Without them the "margin" mode would be entirely plant-blind, because the
// Kalman inequality is a property of the loop you designed and the plant designs a perfectly good one.
"use strict";
import {
    PARAMS, linearize, lqrGain, charPoly, hurwitzStable, hurwitzRhpCount, lyapunovStable, closedLoop,
    returnDifferenceMin, gainMarginLower, optimalCost, simulateCost,
} from "../../physics/control/cartPole.mjs";

export const CART_POLE_MODES = ["regulate", "margin", "cost", "balance"];

export const CART_POLE_OBSERVABLES = [
    "trueClosedLoopStable", "poleFellAtSeconds",
    "gainX", "gainV", "gainTheta", "gainOmega", "areResidual",
    "designStableHurwitz", "designStableLyapunov", "designRhpCount", "openLoopRhpCount", "positionGainVsExact",
    "returnDifferenceMin", "satisfiesKalman", "gainMarginLower", "stableAtKappa1e6",
    "predictedCost", "simulatedCost", "costAgreement",
    "finalAngle", "finalCartPosition", "settledWithin",
    "planted",
];

const DEF = { qx: 1, qv: 1, qtheta: 10, qomega: 1, r: 0.1, tilt: 0.10, horizon: 20 };
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function cartPoleDefaults(hyp) {
    const h = { mode: "regulate", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    // Q must be positive semi-definite and R strictly positive or LQR is not defined. R = 0 is the "cheap
    // control" singular limit where the gain runs to infinity; it is clamped away from zero rather than
    // allowed, because a caller asking for free actuation is asking a different question.
    for (const k of ["qx", "qv", "qtheta", "qomega"]) c[k] = Math.min(1e4, Math.max(0, num(c[k], DEF[k])));
    c.r = Math.min(1e3, Math.max(1e-4, num(c.r, DEF.r)));
    // The tilt is clamped inside the basin the LINEAR design can recover from. Past about 0.6 rad the nonlinear
    // plant has left the regime the design was made for, and a device reporting "it fell over" there would be
    // grading the tilt rather than the controller.
    c.tilt = Math.min(0.6, Math.max(0.001, num(c.tilt, DEF.tilt)));
    c.horizon = Math.min(120, Math.max(2, num(c.horizon, DEF.horizon)));
    h.config = c;
    if (!CART_POLE_MODES.includes(h.mode)) h.mode = "regulate";
    return h;
}

export async function buildCartPole(hyp, base = {}) {
    const h = cartPoleDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const planted = !!c.planted;
    const Q = [[c.qx, 0, 0, 0], [0, c.qv, 0, 0], [0, 0, c.qtheta, 0], [0, 0, 0, c.qomega]];
    const R = [[c.r]];

    // THE TRUE PLANT IS ALWAYS UPRIGHT. The DESIGN plant is what the plant knob moves, and the gap between them
    // is the entire device.
    const truth = linearize(PARAMS, false);
    const design = linearize(PARAMS, planted);
    const g = lqrGain(design.A, design.B, Q, R);

    const trueStable = lyapunovStable(closedLoop(truth.A, truth.B, g.K));
    const sim = simulateCost({ A: truth.A, B: truth.B, K: g.K, Q, R, x0: [0, 0, c.tilt, 0],
                               dt: 1e-4, horizon: c.horizon, nonlinear: true, p: PARAMS, downward: false });
    const blank = {
        trueClosedLoopStable: trueStable ? 1 : 0,
        poleFellAtSeconds: sim.blewUp === null ? -1 : sim.blewUp,
        planted,
    };

    if (h.mode === "margin") {
        const rd = returnDifferenceMin(design.A, design.B, g.K);
        const lower = gainMarginLower(design.A, design.B, g.K);
        return {
            ...blank,
            returnDifferenceMin: rd.min, satisfiesKalman: rd.satisfiesKalman ? 1 : 0,
            gainMarginLower: lower === null ? -1 : lower,
            // *** THE LYAPUNOV ROUTE, NOT THE POLYNOMIAL ONE, AND THE MODULE HEADER CARRIES THE MEASUREMENT. ***
            // At kappa = 1e6 the closed-loop characteristic polynomial's constant term has already lost its sign
            // under Faddeev-LeVerrier, so Routh-Hurwitz calls the infinite-gain-margin case unstable.
            stableAtKappa1e6: lyapunovStable(closedLoop(design.A, design.B, g.K, 1e6)) ? 1 : 0,
        };
    }

    if (h.mode === "cost") {
        const x0 = [0, 0, c.tilt, 0];
        const pred = optimalCost(g.P, x0);
        const lin = simulateCost({ A: design.A, B: design.B, K: g.K, Q, R, x0, dt: 5e-4, horizon: 60 });
        return {
            ...blank,
            predictedCost: pred, simulatedCost: lin.cost,
            costAgreement: Math.abs(lin.cost - pred) / Math.max(1e-300, pred),
        };
    }

    if (h.mode === "balance") {
        return {
            ...blank,
            finalAngle: Math.abs(sim.finalState[2]), finalCartPosition: sim.finalState[0],
            // "settled" means the pole is upright AND the cart has stopped, not merely upright. A cart drifting
            // off the track with a beautifully vertical pole is the classic way to pass a balance check wrongly.
            settledWithin: sim.blewUp === null && Math.abs(sim.finalState[2]) < 1e-4 && Math.abs(sim.finalState[1]) < 1e-4 ? 1 : 0,
        };
    }

    // "regulate"
    const Acl = closedLoop(design.A, design.B, g.K);
    return {
        ...blank,
        gainX: g.K[0][0], gainV: g.K[0][1], gainTheta: g.K[0][2], gainOmega: g.K[0][3],
        areResidual: g.residual,
        designStableHurwitz: hurwitzStable(Acl) ? 1 : 0,
        designStableLyapunov: lyapunovStable(Acl) ? 1 : 0,
        // THE RIGHT-HALF-PLANE COUNT, not a boolean: when stability fails it says by how much. The open loop has
        // exactly one unstable root -- the falling-pole mode -- which is why this fixture is hard.
        designRhpCount: hurwitzRhpCount(Acl),
        openLoopRhpCount: hurwitzRhpCount(design.A),
        // |K1| = sqrt(qx/r) exactly, from the return-difference identity in the s -> 0 limit where the cart's
        // integrator dominates both sides. Reported as the RATIO so it reads 1 whatever the weights are.
        positionGainVsExact: Math.abs(g.K[0][0]) / Math.sqrt(c.qx / c.r),
    };
}

export const cartPoleDevice = {
    // KNOB PLANT: the perturbation replaces THE MODEL THE CONTROLLER IS DESIGNED ON, upstream of every gain and
    // every observable, so the whole path from a wrong equilibrium to a fallen pole is graded.
    plantKind: "knob",
    // v4109 -- NAMED, THE SAME COMPLETION v3851/v4088-v4108 gave the rest of this family. MEASURED, regulate
    // mode (default) both arms: poleFellAtSeconds -1 (stable, no fall) -> 1.3628, matching the header's own
    // quoted "1.36 seconds" exactly, with trueClosedLoopStable flipping 1 -> 0. Every OTHER observable --
    // areResidual, both Hurwitz/Lyapunov design-stability routes, the Kalman margin -- passes on the planted
    // design's own (wrong) model, which is the whole point this device exists to make.
    planted: { knob: "planted", observable: "poleFellAtSeconds",
               note: "the controller is linearised about the HANGING equilibrium instead of the upright one -- a correct linearisation of a different, perfectly real problem. Every self-consistency check (ARE residual, closed-loop stability, the Kalman return-difference inequality, predicted-vs-simulated cost) passes on the model it was designed for; only running the TRUE nonlinear plant shows the pole hitting the ground" },
    modes: CART_POLE_MODES,
    name: "cart-pole-lqr",
    observables: CART_POLE_OBSERVABLES,
    build: buildCartPole,
    defaults: cartPoleDefaults,
};
