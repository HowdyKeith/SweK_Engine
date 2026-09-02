// WebGLEngine/world/traderPolicy.mjs -- v4314 (Level 16)
//
// LEVEL 16: THE BRAIN AS A TRADER. A ship whose route is chosen by the engine's own policy network (brain/rl/
// dockPolicy.js FlightPolicy: the tanh MLP the docking brain flies with) instead of "the largest margin". The
// policy SCORES every candidate leg the economy offers a docked ship (world/gitEconomy.mjs candidates(): a good,
// a destination, the two prices, the distance, the destination's treasury) and the ship takes the highest score.
// Greedy is the special case "score = margin". The two see the SAME numbers -- a learner that had to discover
// prices the greedy one is simply handed would lose by construction, and that would not be a finding.
//
// Trained by the same evolution strategy the docking brain trains by (antithetic Gaussian perturbations, the
// normalised return as the advantage), over episodes that are whole economies: one policy ship among the greedy
// crew, from the same seed, for N days; the return is what the ship is worth at the end, credits plus cargo at
// base value, minus what it started with. The honest question -- does learning beat greedy in this toy economy --
// gets a number in tools/ship/traderPolicy-selfcheck.mjs, and the number is allowed to be no.
"use strict";

import { FlightPolicy } from "../brain/rl/dockPolicy.js";
import { GOODS, BASE } from "./gitEconomy.mjs";

/** What the policy sees per candidate: seven numbers, each near unit scale. */
export const OBS_DIM = 7;
export function featuresOf(c, ship, ctx) {
    const base = BASE[c.good];
    return [c.buyP / base - 1, c.sellP / base - 1, c.margin / base, Math.min(2, c.dist / (ctx.extent || 1)), Math.min(2, c.treasury / 30000),
            Math.min(2, c.stockHere / Math.max(1, ctx.holdTons || 40)), Math.min(2, c.stockThere / Math.max(1, c.needThere))];
}
/** The greedy hauler's rule as a policy, so the two are called the same way: the largest margin wins. */
export function greedyPolicy() { return (cs) => { let k = -1, best = 0; cs.forEach((c, i) => { if (c.margin > best) { best = c.margin; k = i; } }); return k < 0 ? null : k; }; }
/** A learned policy from a flat parameter vector: score every candidate, take the best; below `floor` take none (stay). */
export function learnedPolicy(params, { hidden = [8, 8], floor = -Infinity, extent = 1 } = {}) {
    const net = new FlightPolicy({ hidden, obsDim: OBS_DIM, actDim: 1 });
    net.setParams(Float32Array.from(params));
    return (cs, ship) => { let k = null, best = floor; for (let i = 0; i < cs.length; i++) { const s = net.act(featuresOf(cs[i], ship, { ...ship, extent }))[0]; if (s > best) { best = s; k = i; } } return k; };
}
export function paramCount(hidden = [8, 8]) { return new FlightPolicy({ hidden, obsDim: OBS_DIM, actDim: 1 }).getParams().length; }

/**
 * One episode: a fresh economy with the policy ship as crew member `slot`, run `days`; the return is the ship's
 * worth at the end minus at the start. `makeEconomy(policy, seed)` builds the world -- the caller decides which
 * seat the learner takes and what the rest of the crew is.
 */
export function episode(makeEconomy, policy, { seed = 7, days = 60, dt = 0.25, slot = 0 } = {}) {
    const e = makeEconomy(policy, seed, slot), ship = e.ships[slot], start = ship.store.get("credits");
    const worth = () => ship.store.get("credits") + GOODS.reduce((a, g) => a + (ship.player.cargo[g] || 0) * BASE[g], 0);
    const w0 = worth();
    for (let i = 0; i < days / dt; i++) e.step(dt);
    return { ret: worth() - w0, worth: worth(), start, trips: ship.trips, bankrupt: ship.bankrupt, accounting: e.accounting(), economy: e };
}
/** Average return of a parameter vector over `episodes` seeds. */
export function evaluateParams(makeEconomy, params, { episodes = 4, seed0 = 100, hidden = [8, 8], days = 60, extent = 1, slot = 0 } = {}) {
    let sum = 0, trips = 0, broke = 0;
    for (let k = 0; k < episodes; k++) { const r = episode(makeEconomy, learnedPolicy(params, { hidden, extent }), { seed: seed0 + k, days, slot }); sum += r.ret; trips += r.trips; if (r.bankrupt) broke++; }
    return { avgReturn: sum / episodes, avgTrips: trips / episodes, bankrupt: broke };
}
/** The greedy baseline over the same seeds, the same seat, the same days. */
export function evaluateGreedy(makeEconomy, { episodes = 4, seed0 = 100, days = 60, slot = 0 } = {}) {
    let sum = 0, trips = 0; for (let k = 0; k < episodes; k++) { const r = episode(makeEconomy, greedyPolicy(), { seed: seed0 + k, days, slot }); sum += r.ret; trips += r.trips; }
    return { avgReturn: sum / episodes, avgTrips: trips / episodes };
}

/** The docking brain's ES, over economies. Returns the best parameters and the curve of returns per iteration. */
export function trainTraderES(makeEconomy, { iters = 6, pop = 8, sigma = 0.15, lr = 0.1, hidden = [8, 8], episodes = 3, seed = 3, days = 60, extent = 1, slot = 0, onIter = null } = {}) {
    let s = (seed >>> 0) || 1; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const base = new FlightPolicy({ hidden, seed, obsDim: OBS_DIM, actDim: 1 });
    let theta = base.getParams(); const n = theta.length, scratch = new Float32Array(n);
    const evalOpts = { episodes, hidden, days, extent, slot };
    let best = { params: theta.slice(), ...evaluateParams(makeEconomy, theta, evalOpts) };
    const curve = [best.avgReturn];
    for (let it = 0; it < iters; it++) {
        const half = Math.max(1, pop >> 1), noises = [], rets = [];
        for (let i = 0; i < half; i++) { const eps = new Float32Array(n); for (let j = 0; j < n; j++) eps[j] = gauss(); noises.push(eps);
            for (const sgn of [1, -1]) { for (let j = 0; j < n; j++) scratch[j] = theta[j] + sgn * sigma * eps[j]; rets.push({ i, sgn, r: evaluateParams(makeEconomy, scratch, evalOpts).avgReturn }); } }
        const mean = rets.reduce((a, x) => a + x.r, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, x) => a + (x.r - mean) ** 2, 0) / rets.length) || 1;
        const grad = new Float32Array(n);
        for (const x of rets) { const adv = (x.r - mean) / sd, eps = noises[x.i], c = adv * x.sgn; for (let j = 0; j < n; j++) grad[j] += c * eps[j]; }
        const scale = lr / (rets.length * sigma); for (let j = 0; j < n; j++) theta[j] += scale * grad[j];
        const ev = evaluateParams(makeEconomy, theta, evalOpts); curve.push(ev.avgReturn);
        if (ev.avgReturn > best.avgReturn) best = { params: theta.slice(), ...ev };
        if (onIter) onIter({ iter: it + 1, avgReturn: ev.avgReturn, best: best.avgReturn });
    }
    return { params: Array.from(best.params), best, curve, paramCount: n };
}
