// physics/xpbd/selfCollide.js
//
// Self-collision is the one XPBD extension that is not a fixed constraint: the colliding pairs are discovered fresh
// every frame from wherever the cloth happens to be. The reference doc found them with an atomicExchange linked list
// -- whose traversal order, and therefore whose pair order, depends on GPU thread scheduling. That order then feeds
// graph coloring, and two different orderings of the same pair set can produce two different colorings and two
// different solves. So the determinism hinge is: discover the pairs, then SORT them, before anything downstream ever
// sees them. A sorted pair list is a pure function of the positions, independent of how the buckets were walked.
//
// findCollisionPairs buckets particles into a spatial hash, gathers every pair closer than `thresh` that is not a
// bonded neighbour (adj), dedupes as i<j, and returns them sorted. Pure arithmetic (floor, compare) -- deterministic.

const cellOf = (v, cellSize) => Math.floor(v / cellSize);
const keyOf = (cx, cy, cz) => cx + "," + cy + "," + cz;

// visitOrder lets the gate deliberately walk the particles in a scrambled order; the SORTED output must not change.
// v3607 -- A CENSUS COUNTER, AND IT IS HERE BECAUSE TWO ROUNDS FOUND THE SAME DEFECT BY ACCIDENT. v3604 found
// that the 5x5 hanging fixture never folds; v3606 found that clothLoop-selfcheck's spine check drives a radius
// at which this function returns an EMPTY LIST every frame, so a whole PASS was being entered and never
// exercised. Both were noticed sideways. STATS makes the question askable directly: how many times did the
// pass run, and did it ever produce a contact? Two increments, no allocation, no branch on the hot path.
// NOTHING IS WRITTEN FROM HERE. This file must stay importable in a browser, so it does not touch node:fs and
// does not register an exit hook; the census SPAWNS each gate with --import tools/ship/collideCensusHook.mjs,
// which shares this module instance (ESM modules are singletons per resolved path) and does the dumping. The
// shipped path is unchanged and proven so by hash against readings taken from the pristine v3606 extract.
export const STATS = { calls: 0, empty: 0, pairs: 0, maxPairs: 0 };
export function resetStats() { STATS.calls = 0; STATS.empty = 0; STATS.pairs = 0; STATS.maxPairs = 0; }

export function findCollisionPairs(pos, N, cellSize, thresh, adj, visitOrder) {
    const order = visitOrder || Array.from({ length: N }, (_, i) => i);
    const buckets = new Map();
    for (const a of order) {
        const k = keyOf(cellOf(pos[3 * a], cellSize), cellOf(pos[3 * a + 1], cellSize), cellOf(pos[3 * a + 2], cellSize));
        (buckets.get(k) || buckets.set(k, []).get(k)).push(a);
    }
    const t2 = thresh * thresh;
    const seen = new Set();
    for (const a of order) {
        const cx = cellOf(pos[3 * a], cellSize), cy = cellOf(pos[3 * a + 1], cellSize), cz = cellOf(pos[3 * a + 2], cellSize);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const b = buckets.get(keyOf(cx + dx, cy + dy, cz + dz));
            if (!b) continue;
            for (const j of b) {
                if (j === a) continue;
                const lo = a < j ? a : j, hi = a < j ? j : a, id = lo + "_" + hi;
                if (adj.has(id) || seen.has(id)) continue;
                const ex = pos[3 * lo] - pos[3 * hi], ey = pos[3 * lo + 1] - pos[3 * hi + 1], ez = pos[3 * lo + 2] - pos[3 * hi + 2];
                if (ex * ex + ey * ey + ez * ez < t2) seen.add(id);
            }
        }
    }
    // SORT -> the result is a pure function of positions, not of bucket-walk order. (Removing this sort is the sabotage.)
    STATS.calls++; if (seen.size === 0) STATS.empty++; STATS.pairs += seen.size;
    if (seen.size > STATS.maxPairs) STATS.maxPairs = seen.size;
    return [...seen].map((s) => { const p = s.indexOf("_"); return [Number(s.slice(0, p)), Number(s.slice(p + 1))]; })
        .sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
}
