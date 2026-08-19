// WebGLEngine/physics/percolation/percolation.js — v3283
// ---------------------------------------------------------------------------------------------------------------
// BOND PERCOLATION on the square lattice — the cheapest deep device in the lab. Open each bond independently
// with probability p and ask: does a connected path cross the system? An emergent threshold appears, and for
// this lattice it is EXACT: p_c = 1/2, proved by Kesten from self-duality.
//
// THE KEY THAT WORKS AT FINITE SIZE (most emergent-threshold claims only hold as L -> infinity, this one does
// not wait): on an L x (L+1) rectangle — L+1 sites wide, L sites tall — the horizontal crossing and the dual
// lattice's vertical crossing are complementary events of IDENTICAL distribution at p = 1/2, so
//     P(horizontal crossing at p = 1/2) = 1/2 EXACTLY, for EVERY L.
// A finite-size statement with no finite-size allowance to argue about: measure it, and the binomial error of
// the ensemble is the entire tolerance.
//
// SECOND KEY — the exactly known 2D exponent nu = 4/3: the transition WIDTH (the p-range over which the
// crossing probability climbs from 25% to 75%) shrinks as L^(-1/nu), so doubling L multiplies the width by
// 2^(-3/4) = 0.5946... — a universal number obtained by nothing but counting clusters at two sizes.
//
// The engine is union-find with rank + path compression. neighborsWRONG is EXPORTED FOR MEASUREMENT: it drops
// one of the two bond directions' wraps subtly (skips the last column's rightward bonds), the kind of
// off-by-one a lattice loop makes; every cluster it builds is a real cluster, and the crossing probability at
// p = 1/2 drifts off the exact 1/2. Deterministic seeded RNG throughout.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

function makeRng(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }

// union-find, rank + path compression
function makeUF(n) {
    const parent = new Int32Array(n), rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => { let r = x; while (parent[r] !== r) r = parent[r];
        while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra === rb) return;
        if (rank[ra] < rank[rb]) parent[ra] = rb; else if (rank[ra] > rank[rb]) parent[rb] = ra;
        else { parent[rb] = ra; rank[ra]++; } };
    return { find, union };
}

// one realization on an L x (L+1) rectangle (W = L+1 columns, H = L rows): open bonds with prob p, ask whether
// any cluster touches both the left and right column. Virtual source/sink nodes make that one find() call.
// bondFn(x, y, dir) -> true to INCLUDE the bond in the lattice (dir 0 = right, 1 = down); the correct lattice
// includes every in-range bond, and the named-wrong variant drops some.
function crossesOnce({ L = 32, p = 0.5, seed = 1, bondFn = null } = {}) {
    const W = L + 1, H = L, n = W * H;
    const rng = makeRng(seed);
    const uf = makeUF(n + 2), SRC = n, SNK = n + 1;
    const inc = bondFn || (() => true);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x === 0) uf.union(SRC, i);
        if (x === W - 1) uf.union(SNK, i);
        if (x + 1 < W && inc(x, y, 0) && rng() < p) uf.union(i, i + 1);       // rightward bond
        if (y + 1 < H && inc(x, y, 1) && rng() < p) uf.union(i, i + W);       // downward bond
    }
    return uf.find(SRC) === uf.find(SNK);
}

// crossing probability over an ensemble.
function crossingProb({ L = 32, p = 0.5, reps = 2000, seed = 100, bondFn = null } = {}) {
    let hits = 0;
    for (let r = 0; r < reps; r++) if (crossesOnce({ L, p, seed: seed + r * 7919, bondFn })) hits++;
    return { prob: hits / reps, hits, reps, se: Math.sqrt(0.25 / reps) };
}

// transition width: the p-interval over which the crossing probability climbs from 25% to 75%, located by
// bisection on the measured curve. Shrinks as L^(-1/nu) with nu = 4/3 — the universal exponent, measurable.
function transitionWidth({ L = 32, reps = 1200, seed = 500 } = {}) {
    const probAt = (p) => crossingProb({ L, p, reps, seed: seed + Math.round(p * 100000) }).prob;
    const solve = (targetProb) => {
        let lo = 0.30, hi = 0.70;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (probAt(mid) < targetProb) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    };
    const p25 = solve(0.25), p75 = solve(0.75);
    return { width: p75 - p25, p25, p75 };
}

// NAMED-WRONG lattice: silently drops the rightward bonds of one interior column — the off-by-one a loop bound
// makes. Every cluster is still a real cluster; the crossing probability at p=1/2 is no longer 1/2.
const neighborsWRONG = (x, y, dir) => !(dir === 0 && x === 10);

export { makeRng, makeUF, crossesOnce, crossingProb, transitionWidth, neighborsWRONG };
if (typeof module !== "undefined" && module.exports) module.exports = { makeRng, makeUF, crossesOnce, crossingProb, transitionWidth, neighborsWRONG };
