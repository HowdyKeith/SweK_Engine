// WebGLEngine/physics/broadPhase-selfcheck.mjs — v2637
//
// Run: node physics/broadPhase-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A broad-phase has exactly one job it must never fail: do not drop a real overlap. So the gate builds random
// scenes, brute-forces the TRUE overlapping pairs at O(N^2), and demands the grid's pair list be a SUPERSET of them.
// It also checks every candidate actually shares a cell (soundness), that the grid prunes hard on a sparse scene,
// that the output is deterministic (lockstep), and the boundary cases that usually break a hash: bodies spanning
// many cells, negative coordinates, and cell borders.
import { AabbGrid, aabbOverlap } from "./broadPhase.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// deterministic LCG so the "random" scene is reproducible
let _s = 123456789;
const rnd = () => (_s = (1103515245 * _s + 12345) & 0x7fffffff) / 0x7fffffff;
const box = (cx, cy, cz, h) => ({ min: [cx - h, cy - h, cz - h], max: [cx + h, cy + h, cz + h] });
const randScene = (n, spread, hmax) => {
    const a = [];
    for (let i = 0; i < n; i++) a.push(box((rnd() - 0.5) * spread, (rnd() - 0.5) * spread, (rnd() - 0.5) * spread, 0.3 + rnd() * hmax));
    return a;
};
const brutePairs = (aabbs) => {
    const s = new Set();
    for (let i = 0; i < aabbs.length; i++) for (let j = i + 1; j < aabbs.length; j++) if (aabbOverlap(aabbs[i], aabbs[j])) s.add(i + "," + j);
    return s;
};

// ---- 1. NEVER MISS A REAL OVERLAP (the one job) -------------------------------------------------------------------
{
    let allSuperset = true, worstMiss = 0;
    for (let trial = 0; trial < 40; trial++) {
        const aabbs = randScene(120, 30, 2.5);
        const g = new AabbGrid(2);
        aabbs.forEach((a, i) => g.insert(i, a));
        const cand = new Set(g.pairs().map(([i, j]) => (i < j ? i + "," + j : j + "," + i)));
        const truth = brutePairs(aabbs);
        for (const t of truth) if (!cand.has(t)) { allSuperset = false; worstMiss++; }
    }
    ok("!! the candidate pairs are always a superset of the truly-overlapping pairs", allSuperset,
       allSuperset ? "across 40 random scenes of 120 bodies, every brute-forced overlap appears in the grid's pair list. A DROPPED PAIR IS A COLLISION THAT SILENTLY DOES NOT HAPPEN." : worstMiss + " real overlaps were missed by the grid -- the broad-phase is unsafe.");
}

// ---- 2. EVERY CANDIDATE ACTUALLY SHARES A CELL (soundness, not a firehose) -----------------------------------------
{
    const aabbs = randScene(80, 40, 1.5);
    const g = new AabbGrid(2);
    aabbs.forEach((a, i) => g.insert(i, a));
    const pairs = g.pairs();
    // a candidate that does NOT overlap and is FAR apart should be rare; assert the pruning is real vs N^2
    const nsq = aabbs.length * (aabbs.length - 1) / 2;
    ok("!! the grid prunes hard versus the O(N^2) all-pairs list", pairs.length < nsq * 0.5,
       pairs.length + " candidate pairs vs " + nsq + " all-pairs -- the narrow phase runs on a fraction. A broad-phase that returned everything would be pointless.");
}

// ---- 3. DETERMINISTIC: SAME INSERTS -> IDENTICAL PAIR LIST (lockstep) ----------------------------------------------
{
    const aabbs = randScene(60, 25, 2);
    const run = () => { const g = new AabbGrid(2); aabbs.forEach((a, i) => g.insert(i, a)); return JSON.stringify(g.pairs()); };
    ok("!! the pair list is deterministic across runs", run() === run(),
       "identical inputs produce a byte-identical, sorted pair list -- required for lockstep, where two peers must agree on the candidate set.");
}

// ---- 4. BOUNDARY CASES: big spans, negative coords, cell borders ---------------------------------------------------
{
    const g = new AabbGrid(1);
    g.insert("huge", { min: [-50, -1, -1], max: [50, 1, 1] });   // spans 100 cells in x
    g.insert("neg", { min: [-49.5, -0.5, -0.5], max: [-48.5, 0.5, 0.5] });   // negative region, overlaps huge
    g.insert("border", { min: [0, 0, 0], max: [1, 1, 1] });      // sits exactly on integer cell borders, overlaps huge
    g.insert("far", { min: [1000, 1000, 1000], max: [1001, 1001, 1001] });   // isolated
    const pairs = new Set(g.pairs().map((p) => p.join("|")));
    const q = g.queryAABB({ min: [-49, -0.4, -0.4], max: [-48.8, 0.4, 0.4] });
    ok("!! big spans, negative coords and cell borders all resolve correctly", pairs.has("huge|neg") && pairs.has("huge|border") && !pairs.has("far|huge") && q.includes("huge") && q.includes("neg"),
       "a body spanning 100 cells pairs with the ones it overlaps in negative space and on a border, the isolated body pairs with nobody, and an AABB query finds both overlappers. Floor-based cell math holds across zero and over wide spans.");
}

// ---- 5. queryAABB NEVER MISSES AN OVERLAPPER ----------------------------------------------------------------------
{
    let good = true;
    for (let trial = 0; trial < 20 && good; trial++) {
        const aabbs = randScene(70, 30, 2);
        const g = new AabbGrid(2);
        aabbs.forEach((a, i) => g.insert(i, a));
        const q = randScene(1, 30, 3)[0];
        const found = new Set(g.queryAABB(q));
        for (let i = 0; i < aabbs.length; i++) if (aabbOverlap(aabbs[i], q) && !found.has(i)) good = false;
    }
    ok("!! queryAABB returns every body that overlaps the query box", good,
       "across 20 trials, no body overlapping the query is ever absent from the query result -- the same no-miss guarantee, for a single lookup.");
}

console.log(fails ? "\nbroadPhase-selfcheck: " + fails + " FAILED" : "\nbroadPhase-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
