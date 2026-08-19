// tools/roundhouse/fluidBind.mjs
//
// v2816 -- roundhouse device: the WIND TUNNEL (simulation/lbm/windTunnel.mjs). The existing "lbm" device asks
// the fluid lab one question -- where shedding starts -- and this one asks the others: what force does the flow
// put on a body, and does the measurement obey conservation.
//
// ITS ANSWER KEY IS DERIVED, WHICH IS RARE AND WORTH USING. In a periodic channel at steady state the total
// force on all solids MUST equal the total applied body force, from momentum conservation alone. That identity
// is not what the momentum-exchange sum is built from, so it independently adjudicates the force measurement --
// and it is available as an observable here, which means a claim can be refused by conservation itself rather
// than by a tolerance somebody chose.
//
// It also doubles as a CONVERGENCE diagnostic: the imbalance falls toward zero as the flow settles, so
// balanceErr is simultaneously "is the force right" and "is this reading finished".
//
// Modes:
//   "balance"  -- empty channel. Observables: balanceErr (the identity), massDrift.
//   "drag"     -- cylinder in the channel. Observables: cd, cl, reMeasured, balanceErr, plus liftToDragRatio,
//                 which must be ~0 for a symmetric body and is the cheapest way to catch a broken force sum.
//
// Kept deliberately small and short: a device round should finish in seconds, and every observable here is
// meaningful at coarse resolution because they are ratios and identities, not absolute engineering values.

import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { solidForce, appliedBodyForce, solidForceBalance, coefficients } from "../../simulation/lbm/windTunnel.mjs";

export const FLUID_OBSERVABLES = ["balanceErr", "massDrift", "cd", "cl", "liftToDragRatio", "reMeasured", "uMeasured", "steps"];

// Defaults tuned so a device round finishes in a few seconds. The observables here are ratios and identities,
// so they stay meaningful at coarse resolution -- unlike an absolute engineering value, which would not.
const DEF = { nx: 72, ny: 35, tau: 0.6, g: 3e-5, D: 7, steps: 3500 };

export function fluidDefaults(hyp) {
    const h = { mode: "balance", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // bounded so a proposal cannot request a sim that never returns
    c.nx = Math.min(200, Math.max(24, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(81, Math.max(15, num(c.ny, DEF.ny) | 0));
    c.tau = Math.min(1.2, Math.max(0.52, num(c.tau, DEF.tau)));       // <0.52 goes unstable at these speeds
    c.g = Math.min(1e-4, Math.max(1e-7, num(c.g, DEF.g)));
    c.D = Math.min(Math.floor(c.ny / 3), Math.max(3, num(c.D, DEF.D) | 0));
    c.steps = Math.min(20000, Math.max(500, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!["balance", "drag"].includes(h.mode)) h.mode = "balance";
    return h;
}

export async function buildFluid(hyp, base = {}) {
    const h = fluidDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const cy = (c.ny - 1) / 2 + 0.5, cx = Math.floor(c.nx / 3);
    const inCyl = (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (c.D / 2) ** 2;

    const lbm = makeLBM({ nx: c.nx, ny: c.ny, tau: c.tau, force: [c.g, 0], ...(h.mode === "drag" ? { solidAt: inCyl } : {}) });
    const m0 = lbm.mass();
    for (let t = 0; t < c.steps; t++) lbm.step();
    const m1 = lbm.mass();
    if (!isFinite(m1) || m1 <= 0) return { error: "simulation-diverged (try a larger tau or smaller drive)" };

    const bal = solidForceBalance(lbm);
    const out = {
        balanceErr: bal.relError,                       // the DERIVED identity: solid force vs applied body force
        massDrift: Math.abs(m1 - m0) / m0,              // LBM conserves mass; drift means something is wrong
        steps: c.steps,
    };
    if (h.mode === "balance") return out;

    const f = solidForce(lbm, (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (c.D / 2) ** 2 + 2);
    let U = 0;
    for (let dy = -2; dy <= 2; dy++) U = Math.max(U, lbm.ux[lbm.idx(Math.max(1, cx - 3 * c.D), Math.round(cy) + dy)]);
    const co = coefficients(f, { rho: 1, U, D: c.D });
    out.uMeasured = U;
    out.reMeasured = U * c.D / lbm.nu;
    out.cd = co.cd;
    out.cl = co.cl;
    out.liftToDragRatio = co.cd !== 0 ? Math.abs(co.cl / co.cd) : undefined;   // ~0 for a symmetric body
    return out;
}

export const fluidDevice = {
    // v3194 -- EXPORTED. The last two devices still PROBED rather than known. v3192's scan matched files by
    // NAME PREFIX and missed both, because THE REGISTRY KEY AND THE FILE DIFFER: 'ct' lives in
    // tomographyBind.mjs and 'windtunnel' is exported as fluidDevice. A NAME IS NOT A LOCATION, and a
    // scan that assumed it was reported these two as one-moded on a lower bound. Derived from this
    // file's own default plus every mode its own build() branches on, both verified DISTINCT.
    modes: ["balance", "drag"], name: "lbm-wind-tunnel", observables: FLUID_OBSERVABLES, build: buildFluid, defaults: fluidDefaults };
