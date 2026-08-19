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
//
// ================================================================================================================
// v3845 -- PLANTED, AND THE PLANT FOUND SOMETHING ABOUT THE DEFAULT BEFORE IT FOUND ANYTHING ABOUT THE READER
// ================================================================================================================
//
// *** THE PLANT IS THE BOUNCE-BACK INDEXING CONFUSION: reading where a population is GOING instead of where it
// CAME FROM. *** solidForce walks solid nodes and, for each population i, looks at the node at x - e_i -- the
// SOURCE -- and counts the link only if that node is fluid. Writing x + e_i instead is the single most common
// error in a momentum-exchange implementation, it is one character, and NOTHING ABOUT THE RESULT LOOKS WRONG:
// the same 432 links are walked, the sum is finite, the sign is plausible.
//
// *** ON A FLAT WALL IT MEASURES EXACTLY ZERO FORCE. *** Not a small force -- 0.0000e+0, because the outgoing
// set is symmetric about a straight boundary and every contribution cancels. So balanceErr reads EXACTLY 1: the
// channel is being driven and the instrument reports that nothing is pushing back. THE MAXIMUM POSSIBLE
// VIOLATION OF THE IDENTITY, from a defect that a reader of the code has to look twice at.
//
// MEASURED, both geometries at the device default (3500 steps):
//     balance (flat walls)   balanceErr 2.8133e-1 -> 1.0000        solidFx 5.1227e-2 -> 0.0000e+0
//     drag    (cylinder)     balanceErr 3.0242e-2 -> 9.2514e-1     cd 5.4773 -> 0.9748
//
// *** AND THE HONEST ARM IS NOT CONVERGED AT THE DEVICE DEFAULT, WHICH IS THE REAL FINDING OF THIS ROUND. ***
// The header above calls balanceErr "simultaneously 'is the force right' and 'is this reading finished'", and
// nobody had asked it the second question. MEASURED against steps, empty channel:
//     500: 7.204e-1   1000: 6.049e-1   2000: 4.431e-1   3500: 2.813e-1   6000: 1.321e-1
//     10000: 3.943e-2   20000: 1.918e-3   40000: 4.539e-6
// It converges cleanly -- and THE DEFAULT SITS AT 2.8e-1, which reads in a log exactly like "the force
// measurement is 28% wrong" when it means "the flow has not settled". So the plant separates by only 3.6x in
// `balance` despite driving the measurement to zero, and by 30.6x in `drag` where the cylinder closes the
// identity faster. *** THE PLANT IS AS STRONG AS A PLANT CAN BE AND THE BASELINE IS WEAK, AND THOSE READ
// IDENTICALLY IN A PASS/FAIL LINE (v3806's lesson on flip2d, arriving from the other side). ***
//
// NOT FIXED HERE, AND NAMED AS DEBT INSTEAD: `steps` is CLAMPED AT 20000 by this file's own validator, so the
// converged reading is not even reachable through the device, and raising the default to 20000 takes a round
// from 1.7 s to 17 s -- against this header's own "a device round should finish in seconds". Making the
// identity converge at a runtime a device can afford is a fixture question (domain size and tau, not steps),
// and that is a different round from planting the reader.
//
// *** A PLANT THAT WAS TRIED AND IS INERT, RECORDED SO NOBODY SPENDS THE ROUND AGAIN: dropping the internal-
// link guard -- the `if (solid[source]) continue` the shipped comment insists on -- CHANGES THE FORCE NOT AT
// ALL. 502 links become 1040 and fx is identical to every digit printed, because internal solid-solid links
// cancel pairwise. THE GUARD IS CORRECT AND IT IS ALSO UNTESTABLE BY THIS IDENTITY, which is a fact about the
// key and not about the guard. ***
//
// THIS IS A READER PLANT, DECLARED AS ONE. plantedError.mjs's distinction: a knob plant perturbs a physics
// INPUT and grades the whole path; a reader plant substitutes the MEASUREMENT, and is the honest choice when
// the failure being reproduced has no input that produces it. The identity here is a claim ABOUT the force
// measurement, so the defect it must catch lives in the measurement. There is no channel you can hand this
// solver that makes a correct momentum-exchange sum come out wrong.

import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { solidForce, appliedBodyForce, solidForceBalance, coefficients } from "../../simulation/lbm/windTunnel.mjs";

export const FLUID_MODES = ["balance", "drag", "sourceconfusion"];

export const FLUID_OBSERVABLES = ["balanceErr", "solidFx", "appliedFx", "massDrift", "cd", "cl", "liftToDragRatio", "reMeasured", "uMeasured", "steps"];

/**
 * *** THE PLANTED READER: solidForce WITH ITS SOURCE DIRECTION REVERSED. *** Character for character the
 * shipped walk, except that the neighbour it tests is x + e_i (where the population is GOING) instead of
 * x - e_i (where it CAME FROM). Everything else -- the factor of 2 from bounce-back, the internal-link guard,
 * the y-bounds check, the periodic x wrap -- is the shipped code, so the ONE decision under test is isolated.
 */
function solidForceSOURCECONFUSED(lbm) {
    const { nx, ny, solid, f, Q, E, idx } = lbm;
    let fx = 0, fy = 0, links = 0;
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            const k = idx(x, y);
            if (!solid[k]) continue;
            for (let i = 1; i < Q; i++) {
                const sx = (x + E[i][0] + nx) % nx;       // THE PLANT: + instead of -
                const sy = y + E[i][1];                   // THE PLANT: + instead of -
                if (sy < 0 || sy >= ny) continue;
                if (solid[idx(sx, sy)]) continue;
                const fi = f[k * Q + i];
                fx += 2 * E[i][0] * fi;
                fy += 2 * E[i][1] * fi;
                links++;
            }
        }
    }
    return { fx, fy, links };
}

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
    // *** THE VALIDATOR MUST LIST THE PLANT MODE. As a two-name test it silently reverts `sourceconfusion` to
    // `balance`, both arms read an identical number, and the plant fires at nothing -- v3806, on flip2d. ***
    if (!FLUID_MODES.includes(h.mode)) h.mode = "balance";
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

    // The plant runs the SAME channel as `balance` and differs only in how the force on the walls is read --
    // so the separation below belongs to the reader and not to a second fixture.
    let bal;
    if (h.mode === "sourceconfusion") {
        const bad = solidForceSOURCECONFUSED(lbm);
        const ap = appliedBodyForce(lbm);
        const denom = Math.abs(ap.fx) > 1e-12 ? Math.abs(ap.fx) : 1;
        bal = { solidFx: bad.fx, solidFy: bad.fy, appliedFx: ap.fx, appliedFy: ap.fy,
                relError: Math.abs(bad.fx - ap.fx) / denom };
    } else {
        bal = solidForceBalance(lbm);
    }
    const out = {
        balanceErr: bal.relError,                       // the DERIVED identity: solid force vs applied body force
        solidFx: bal.solidFx,                           // reported so "the instrument read ZERO" is visible, not inferred
        appliedFx: bal.appliedFx,
        massDrift: Math.abs(m1 - m0) / m0,              // LBM conserves mass; drift means something is wrong
        steps: c.steps,
    };
    if (h.mode === "balance" || h.mode === "sourceconfusion") return out;

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
    // "balance" stays FIRST: it owns the identity, and the plant runs its geometry.
    modes: FLUID_MODES,
    plantMode: "sourceconfusion", plantFlips: "balanceErr", plantKind: "reader",
    name: "lbm-wind-tunnel", observables: FLUID_OBSERVABLES, build: buildFluid, defaults: fluidDefaults };
