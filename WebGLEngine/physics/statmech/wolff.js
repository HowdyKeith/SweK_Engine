// WebGLEngine/physics/statmech/wolff.js — v3284
// ---------------------------------------------------------------------------------------------------------------
// THE WOLFF CLUSTER ALGORITHM — the same Ising model, a completely different way to move through its states, and
// a measurable answer to the question single-spin Metropolis cannot escape: CRITICAL SLOWING DOWN.
//
// Near T_c the correlation length diverges, so a Metropolis sweep -- which flips one spin at a time against its
// neighbours -- takes an enormous number of sweeps to produce a genuinely new configuration. The samples keep
// arriving; they just stop being independent. That is the failure mode that quietly ruins Monte Carlo estimates,
// because nothing about it LOOKS wrong: the acceptance rate is fine, the energy is fine, the error bar computed
// as if samples were independent is simply a lie.
//
// Wolff builds a CLUSTER instead: pick a site, and grow through aligned neighbours, adding each with probability
//     P_add = 1 - exp(-2J/T)
// then flip the whole cluster. The move is always accepted. That probability is not a tuning knob -- it is the
// unique value that makes the algorithm satisfy detailed balance for the Boltzmann distribution, and any other
// value silently samples the wrong distribution while still producing pretty pictures. The gate proves that by
// sabotaging it.
//
// WHAT IS BEING CLAIMED, and how it is checked:
//   1. Wolff samples THE SAME distribution -- it must reproduce Yang's exact magnetisation and the Onsager
//      Binder crossing, the identical falsifiers the Metropolis device already answers to. A faster algorithm
//      that samples a slightly different distribution is worthless and this is the only way to see it.
//   2. Wolff DOES NOT critically slow down -- measured, as an autocorrelation/ESS ratio at T_c, against
//      Metropolis on the same lattice with work counted in SPIN FLIPS, not in "sweeps" (comparing per-sweep
//      would flatter Wolff, since a cluster sweep touches more spins).
//   3. P_add = 1 - exp(-2J/T) is load-bearing: padWRONG uses 1 - exp(-J/T), a plausible-looking variant, and it
//      lands on the wrong magnetisation curve while still building clusters and still looking healthy.
//
// essOf is IMPORTED from the HMC tuner rather than rewritten: one fact, one implementation, and it is already
// gated there (initial-positive-sequence estimator).
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { essOf } from "../hmc/tune.js";

function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

export const pAddCorrect = (T, J = 1) => 1 - Math.exp(-2 * J / T);
export const pAddWRONG = (T, J = 1) => 1 - Math.exp(-J / T);      // plausible, and it samples the wrong measure

export function makeWolff({ L = 32, T = 2.269, seed = 12345, cold = false, pAdd = pAddCorrect } = {}) {
    const N = L * L;
    const s = new Int8Array(N);
    const rand = rng(seed);
    for (let i = 0; i < N; i++) s[i] = cold ? 1 : (rand() < 0.5 ? -1 : 1);
    const idx = (x, y) => ((y + L) % L) * L + ((x + L) % L);
    const stack = new Int32Array(N);
    const inCluster = new Uint8Array(N);

    // one cluster move; returns how many spins it flipped (the honest work unit)
    function clusterMove() {
        const p = pAdd(T);
        const x0 = (rand() * L) | 0, y0 = (rand() * L) | 0;
        const seedSite = idx(x0, y0);
        const sign = s[seedSite];
        let top = 0, size = 0;
        stack[top++] = seedSite; inCluster[seedSite] = 1;
        const touched = [seedSite];
        while (top > 0) {
            const i = stack[--top];
            const x = i % L, y = (i / L) | 0;
            s[i] = -sign; size++;                       // flip on the way out of the stack
            const nb = [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)];
            for (const j of nb) {
                if (!inCluster[j] && s[j] === sign && rand() < p) {
                    inCluster[j] = 1; stack[top++] = j; touched.push(j);
                }
            }
        }
        for (const i of touched) inCluster[i] = 0;
        return size;
    }
    function magnetisation() { let m = 0; for (let i = 0; i < N; i++) m += s[i]; return m / N; }
    function energy() {
        let e = 0;
        for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) e -= s[idx(x, y)] * (s[idx(x + 1, y)] + s[idx(x, y + 1)]);
        return e / N;
    }
    return { L, N, T, spins: s, idx, clusterMove, magnetisation, energy };
}

// Equilibrate then sample |M|, counting FLIPPED SPINS as the work unit so a comparison against Metropolis is
// honest (a cluster move is not a sweep, and calling it one would flatter this algorithm).
export function wolffMeasure({ L = 32, T = 2.269, seed = 12345, warmupMoves = 400, moves = 4000, pAdd = pAddCorrect } = {}) {
    const w = makeWolff({ L, T, seed, pAdd });
    let flips = 0;
    for (let i = 0; i < warmupMoves; i++) flips += w.clusterMove();
    const series = [];
    let mAbs = 0, m2 = 0, m4 = 0;
    for (let i = 0; i < moves; i++) {
        flips += w.clusterMove();
        const m = w.magnetisation();
        series.push(Math.abs(m));
        mAbs += Math.abs(m); m2 += m * m; m4 += m * m * m * m;
    }
    const n = moves;
    return { absM: mAbs / n, U4: 1 - (m4 / n) / (3 * (m2 / n) * (m2 / n)), series,
             flips, flipsPerSpin: flips / w.N, L, T };
}

// The Metropolis twin, measured in the SAME units: one "sweep" is N attempted flips, so flipsPerSpin = sweeps.
export function metropolisMeasure({ L = 32, T = 2.269, seed = 12345, warmupSweeps = 400, sweeps = 4000 } = {}) {
    const N = L * L, s = new Int8Array(N), rand = rng(seed);
    for (let i = 0; i < N; i++) s[i] = rand() < 0.5 ? -1 : 1;
    const idx = (x, y) => ((y + L) % L) * L + ((x + L) % L);
    const sweep = () => {
        for (let k = 0; k < N; k++) {
            const x = (rand() * L) | 0, y = (rand() * L) | 0, i = idx(x, y);
            const dE = 2 * s[i] * (s[idx(x + 1, y)] + s[idx(x - 1, y)] + s[idx(x, y + 1)] + s[idx(x, y - 1)]);
            if (dE <= 0 || rand() < Math.exp(-dE / T)) s[i] = -s[i];
        }
    };
    const mag = () => { let m = 0; for (let i = 0; i < N; i++) m += s[i]; return m / N; };
    for (let i = 0; i < warmupSweeps; i++) sweep();
    const series = [];
    let mAbs = 0, m2 = 0, m4 = 0;
    for (let i = 0; i < sweeps; i++) {
        sweep();
        const m = mag();
        series.push(Math.abs(m));
        mAbs += Math.abs(m); m2 += m * m; m4 += m * m * m * m;
    }
    return { absM: mAbs / sweeps, U4: 1 - (m4 / sweeps) / (3 * (m2 / sweeps) * (m2 / sweeps)), series,
             flipsPerSpin: sweeps, L, T };
}

// Effective samples PER UNIT WORK, work measured in attempted/flipped spins per site. This is the number that
// decides which algorithm to run, and it is the one critical slowing down destroys.
export function essPerWork(result) {
    const ess = essOf(result.series);
    return { ess, work: result.flipsPerSpin, essPerWork: ess / result.flipsPerSpin };
}

export { essOf };
