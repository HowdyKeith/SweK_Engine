// physics/sph/neighbourBakeoff-selfcheck.mjs -- v3841
//
// THE MEASUREMENT ROUND KEITH ASKED FOR: spatialGrid.js vs the Morton BVH (bvhNeighbours.mjs), same particles
// through both, and the honest comparison's three requirements met in order:
//   1. THE SAME PARTICLE SET THROUGH BOTH (deterministic, seeded here).
//   2. IDENTICAL NEIGHBOUR LISTS ASSERTED BEFORE ANY NUMBER IS BELIEVED -- and not just "the two agree", but
//      both agree with the O(N^2) BRUTE FORCE. A faster structure that returns a different set is not faster.
//   3. THE REBUILD COUNTED -- SPH particles move every step, so build cost is part of the workload, not setup.
// The reported numbers are CHECK COUNTS, not milliseconds: this sandbox is one core, so a runtime here is not a
// runtime for the rig (the standing rule). Checks are machine-independent, so they are pinned as an answer key:
// change either structure and the counts move, and this gate says so.

import { SpatialGrid } from "./spatialGrid.js";
import { buildBvh, bvhNear } from "./bvhNeighbours.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

function mulberry32(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// particles in a box of side `box`, optionally clustered into `clumps` blobs (SPH fluid is clumpy, not uniform).
function makeParticles(n, box, clumps, rng) {
    const ps = [], centers = [];
    for (let c = 0; c < clumps; c++) centers.push([rng() * box, rng() * box, rng() * box]);
    for (let i = 0; i < n; i++) {
        if (clumps) { const c = centers[(rng() * clumps) | 0], s = box * 0.08;
            ps.push({ x: c[0] + (rng() - 0.5) * s, y: c[1] + (rng() - 0.5) * s, z: c[2] + (rng() - 0.5) * s }); }
        else ps.push({ x: rng() * box, y: rng() * box, z: rng() * box });
    }
    return ps;
}

const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function exactFilter(ps, i, cands, r) {
    const r2 = r * r, p = ps[i], out = [], seen = new Set();
    for (const j of cands) { if (j === i || seen.has(j)) continue; seen.add(j);
        const q = ps[j], dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= r2) out.push(j); }
    return out.sort((a, b) => a - b);
}
function bruteNear(ps, i, r) {
    const r2 = r * r, p = ps[i], out = [];
    for (let j = 0; j < ps.length; j++) { if (j === i) continue; const q = ps[j], dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z; if (dx * dx + dy * dy + dz * dz <= r2) out.push(j); }
    return out;
}
// grid cells actually touched by a query (dedupe of the 27, matching forEachNear), for a fair traversal count.
function gridCells(grid, p) {
    const c = grid.cell, cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c);
    const keys = []; let touched = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = grid._key(cx + dx, cy + dy, cz + dz);
        if (keys.indexOf(k) >= 0) continue; keys.push(k); if (grid.map.has(k)) touched++;
    }
    return touched;
}

function run(cfg) {
    const rng = mulberry32(cfg.seed), ps = makeParticles(cfg.n, cfg.box, cfg.clumps, rng), r = cfg.r;
    const grid = new SpatialGrid(r); grid.rebuild(ps);
    const bvh = buildBvh(ps, r);
    let bvhChecks = 0, bvhCands = 0, gridCands = 0, gridCellTouches = 0, totalExact = 0, mism = 0;
    const exactOf = new Array(cfg.n);
    for (let i = 0; i < cfg.n; i++) {
        const p = ps[i];
        const g = grid.near(p.x, p.y, p.z); gridCands += g.length; gridCellTouches += gridCells(grid, p);
        const bv = bvhNear(bvh, p.x, p.y, p.z, r); bvhChecks += bv.checks; bvhCands += bv.hits.length;
        const eG = exactFilter(ps, i, g, r), eB = exactFilter(ps, i, bv.hits, r), eBrute = bruteNear(ps, i, r).sort((a, b) => a - b);
        if (!eqArr(eG, eB) || !eqArr(eG, eBrute)) mism++;
        exactOf[i] = new Set(eG); totalExact += eG.length;
    }
    // 2b) the exact relation must be symmetric: j near i  <=>  i near j
    let asym = 0; for (let i = 0; i < cfg.n; i++) for (const j of exactOf[i]) if (!exactOf[j].has(i)) asym++;
    return { ...cfg, bvhChecks, bvhCands, gridCands, gridCellTouches, totalExact, mism, asym, bvhBuilt: bvh.built, gridBuilt: grid.built, nodes: bvh.nodes.length };
}

const CONFIGS = [
    { name: "uniform-400", n: 400, box: 10, clumps: 0, r: 1.0, seed: 1 },
    { name: "clumped-400", n: 400, box: 10, clumps: 6, r: 1.0, seed: 2 },
    { name: "uniform-800", n: 800, box: 10, clumps: 0, r: 0.8, seed: 3 },
];

// *** THE RECORDED RESULT, PINNED. *** Everything above is integer/deterministic, so these counts are the same
// on any machine -- which is exactly what makes them a fair comparison and a regression tripwire. Change either
// structure and a count moves; this gate then fails and forces the number (and its reason) to be re-recorded,
// rather than the measurement silently drifting.
const EXPECTED = {
    "uniform-400": { totalExact: 622,   bvhChecks: 52082,  bvhCand: 7814,  gridCand: 3872,  gridCellTouches: 3126 },
    "clumped-400": { totalExact: 27564, bvhChecks: 97922,  bvhCand: 45004, gridCand: 38702, gridCellTouches: 3061 },
    "uniform-800": { totalExact: 1344,  bvhChecks: 123932, bvhCand: 17476, gridCand: 8230,  gridCellTouches: 6411 },
};

console.log("  config        N   exact  |  bvhChecks  bvhCand  bvhBuilt  |  gridCand  gridCells  gridBuilt");
const results = {};
for (const cfg of CONFIGS) {
    const R = run(cfg); results[cfg.name] = R;
    ok(R.mism === 0, `[${cfg.name}] neighbour lists identical (grid == bvh == brute)`);
    ok(R.asym === 0, `[${cfg.name}] neighbour relation symmetric`);
    ok(R.bvhCands >= R.totalExact && R.gridCands >= R.totalExact, `[${cfg.name}] both structures return a superset of the exact neighbours`);
    ok(R.nodes === 2 * cfg.n - 1 && R.bvhBuilt === 2 * cfg.n - 1, `[${cfg.name}] bvh is a full binary tree (2N-1 nodes)`);
    ok(R.gridBuilt === cfg.n, `[${cfg.name}] grid rebuild cost == N inserts`);
    const E = EXPECTED[cfg.name];
    ok(R.totalExact === E.totalExact && R.bvhChecks === E.bvhChecks && R.bvhCands === E.bvhCand && R.gridCands === E.gridCand && R.gridCellTouches === E.gridCellTouches,
        `[${cfg.name}] counts match the pinned answer key`);
    console.log(`  ${cfg.name.padEnd(12)} ${String(cfg.n).padStart(4)} ${String(R.totalExact).padStart(6)}  |  ${String(R.bvhChecks).padStart(8)} ${String(R.bvhCands).padStart(8)} ${String(R.bvhBuilt).padStart(8)}  |  ${String(R.gridCands).padStart(8)} ${String(R.gridCellTouches).padStart(9)} ${String(R.gridBuilt).padStart(9)}`);
}

// THE VERDICT, from the numbers, not from taste: on SPH's actual workload -- rebuilt every step -- the grid wins
// on every axis measured. It generates a TIGHTER candidate set (fewer distance tests: 3872 vs the BVH's 7814 at
// uniform-400), its query traversal is a handful of cells where the BVH visits ~130 nodes per query, and its
// rebuild is N inserts against the BVH's 2N-1 node builds PLUS an N-log-N Morton sort every frame. The BVH's box
// descent even loses the candidate-tightness battle it was supposed to win, because a middle-split over Morton
// order does not carve space as cleanly as a cell of side exactly h. This is the "measure rather than assume"
// result: the Morton BVH is the textbook faster structure and is the WRONG tool for per-step SPH here. It stays
// in the tree as the measured alternative, not the replacement -- and this gate is the receipt.
if (fail) { console.error(`\nneighbourBakeoff-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`\nneighbourBakeoff-selfcheck: all ${pass} pass. Verdict: spatialGrid wins on per-step SPH (tighter candidates, ~cells vs ~130 nodes/query, N vs 2N-1+sort rebuild).`);
