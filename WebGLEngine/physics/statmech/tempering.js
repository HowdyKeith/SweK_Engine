// WebGLEngine/physics/statmech/tempering.js — v3284
// ---------------------------------------------------------------------------------------------------------------
// PARALLEL TEMPERING (replica exchange) — run one copy of the system at each of several temperatures and let
// neighbouring copies TRADE CONFIGURATIONS. A replica stuck in a metastable state at low temperature can wander
// up the ladder, melt, and come back down somewhere else entirely. It is the standard cure for a sampler that
// is not wrong, just trapped.
//
// THE SWAP RULE IS THE WHOLE THING. Exchanging configurations between chains at beta_i and beta_j is a
// Metropolis move in the JOINT ensemble, so it must be accepted with
//     P_swap = min(1, exp( (beta_i - beta_j) * (E_i - E_j) ))
// and any other rule -- including the tempting "just swap, both are valid configurations" -- silently destroys
// the marginals. That is the trap here, and it is a quiet one: swapping unconditionally produces perfectly
// legitimate-looking chains at every temperature, all of them sampling the wrong distribution.
//
// THE KEY: after tempering, EACH replica's marginal must still be the Boltzmann distribution at ITS OWN
// temperature. There is no new physics to check against -- the answer is the same Yang magnetisation the plain
// device already owes, temperature by temperature. A sampler that moves configurations between ensembles has
// every opportunity to smear them together, and this is exactly the check that sees it.
//
// SECOND KEY, and it is an identity rather than a number: DETAILED BALANCE IS SYMMETRIC. Measured over a run,
// the number of accepted i->j swaps must equal the number of accepted j->i swaps, because the same rule governs
// both directions. It is free to compute and it catches asymmetric-indexing bugs that the marginals would only
// reveal after a long run.
//
// swapAlwaysWRONG is EXPORTED FOR MEASUREMENT.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { yangMagnetisation } from "./ising.js";

function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

// the correct joint-ensemble acceptance
export const swapAcceptCorrect = (betaI, betaJ, eI, eJ) => Math.min(1, Math.exp((betaI - betaJ) * (eI - eJ)));
// NAMED WRONG: "both configurations are legitimate, so trading them is harmless" -- it is not.
export const swapAlwaysWRONG = () => 1;

function makeReplica(L, T, seed) {
    const N = L * L, s = new Int8Array(N), rand = rng(seed);
    for (let i = 0; i < N; i++) s[i] = rand() < 0.5 ? -1 : 1;
    const idx = (x, y) => ((y + L) % L) * L + ((x + L) % L);
    return {
        L, N, T, spins: s, rand, idx,
        sweep() {
            for (let k = 0; k < N; k++) {
                const x = (rand() * L) | 0, y = (rand() * L) | 0, i = idx(x, y);
                const dE = 2 * s[i] * (s[idx(x + 1, y)] + s[idx(x - 1, y)] + s[idx(x, y + 1)] + s[idx(x, y - 1)]);
                if (dE <= 0 || rand() < Math.exp(-dE / this.T)) s[i] = -s[i];
            }
        },
        // TOTAL energy (not per spin): the swap acceptance needs the extensive quantity, and using the intensive
        // one by mistake would make every swap look nearly free on a large lattice.
        energy() {
            let e = 0;
            for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) e -= s[idx(x, y)] * (s[idx(x + 1, y)] + s[idx(x, y + 1)]);
            return e;
        },
        magnetisation() { let m = 0; for (let i = 0; i < N; i++) m += s[i]; return m / N; },
    };
}

export function runTempering({ L = 16, temps = [1.8, 2.0, 2.2, 2.4, 2.7], seed = 4242,
                               warmup = 400, sweeps = 3000, swapEvery = 5,
                               accept = swapAcceptCorrect } = {}) {
    const R = temps.length;
    const reps = temps.map((T, i) => makeReplica(L, T, seed + i * 7919));
    const swapRand = rng(seed ^ 0x5bd1);
    // stats are indexed BY TEMPERATURE SLOT, not by replica: after a swap the configuration moves, and what we
    // are measuring is the marginal at each temperature.
    const mAbs = new Array(R).fill(0), counts = new Array(R).fill(0);
    const swapTried = new Array(R - 1).fill(0), swapDone = new Array(R - 1).fill(0);
    // track which replica object currently sits in each temperature slot, and how long each replica spends in
    // each slot -- at stationarity a replica must random-walk the ladder and visit every temperature equally.
    const slot = reps.slice();
    reps.forEach((r, i) => { r.id = i; });
    const occupancy = Array.from({ length: R }, () => new Array(R).fill(0));

    for (let step = 0; step < warmup + sweeps; step++) {
        for (let i = 0; i < R; i++) { slot[i].T = temps[i]; slot[i].sweep(); }
        if (step % swapEvery === 0) {
            const parity = (step / swapEvery) % 2 === 0 ? 0 : 1;   // alternate even/odd neighbour pairs
            for (let i = parity; i < R - 1; i += 2) {
                const bi = 1 / temps[i], bj = 1 / temps[i + 1];
                const ei = slot[i].energy(), ej = slot[i + 1].energy();
                swapTried[i]++;
                if (swapRand() < accept(bi, bj, ei, ej)) {
                    const t = slot[i]; slot[i] = slot[i + 1]; slot[i + 1] = t;
                    swapDone[i]++;
                }
            }
        }
        if (step >= warmup) for (let i = 0; i < R; i++) {
            mAbs[i] += Math.abs(slot[i].magnetisation()); counts[i]++;
            occupancy[slot[i].id][i]++;
        }
    }
    return {
        temps,
        absM: mAbs.map((v, i) => v / counts[i]),
        yang: temps.map((T) => yangMagnetisation(T)),
        swapRate: swapDone.map((d, i) => d / swapTried[i]),
        // occupancy[r][i] = fraction of samples replica r spent at temperature slot i; uniform 1/R at stationarity
        occupancy: occupancy.map((row) => row.map((c) => c / sweeps)),
        L, sweeps,
    };
}

// a single-temperature control run, same lattice and budget, for the "tempering changed nothing it shouldn't" check
export function plainRun({ L = 16, T = 2.0, seed = 4242, warmup = 400, sweeps = 3000 } = {}) {
    const r = makeReplica(L, T, seed);
    for (let i = 0; i < warmup; i++) r.sweep();
    let m = 0;
    for (let i = 0; i < sweeps; i++) { r.sweep(); m += Math.abs(r.magnetisation()); }
    return { absM: m / sweeps, T, L };
}
