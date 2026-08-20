// WebGLEngine/physics/md/neighborGrid-selfcheck.mjs — v2646
//
// Run: node physics/md/neighborGrid-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A neighbour grid is a speedup that must change nothing. So the gate pins it to the brute-force truth: the grid's
// pair set must EQUAL the O(N^2) within-cutoff set exactly (no pair missed, none invented), the forces it computes
// must match the brute-force forces, it must be deterministic run to run, and it must actually prune -- far fewer
// pairs than N^2 on a spread-out system.
import { neighborPairs, computeForcesGrid } from "./neighborGrid.js";
import { ljCoeff, ljPotential } from "./md.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

let _s = 987654321;
const rnd = () => (_s = (1103515245 * _s + 12345) & 0x7fffffff) / 0x7fffffff;
const scene = (N, spread) => { const p = new Float64Array(3 * N); for (let i = 0; i < 3 * N; i++) p[i] = (rnd() - 0.5) * spread; return p; };
const brutePairs = (pos, N, cut) => {
    const out = [], c2 = cut * cut;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
        if (dx * dx + dy * dy + dz * dz <= c2) out.push(i + "," + j);
    }
    return out.sort();
};

// ---- 1. THE GRID PAIR SET EQUALS THE BRUTE-FORCE WITHIN-CUTOFF SET EXACTLY -----------------------------------------
{
    let good = true, trials = 0;
    for (let t = 0; t < 30; t++) {
        const N = 150, cut = 2.5, pos = scene(N, 20);
        const grid = neighborPairs(pos, N, cut).map(([i, j]) => i + "," + j).sort();
        const brute = brutePairs(pos, N, cut);
        trials++;
        if (grid.length !== brute.length || grid.some((p, i) => p !== brute[i])) good = false;
    }
    ok("!! the grid's pair set is exactly the brute-force within-cutoff set", good,
       good ? "across " + trials + " scenes of 150 atoms, the cell-list pairs match the O(N^2) within-cutoff pairs exactly -- no pair missed, none invented." : "the grid disagreed with brute force on the pair set -- a missed pair is a force silently dropped.");
}

// ---- 2. GRID FORCES MATCH BRUTE-FORCE FORCES ---------------------------------------------------------------------
{
    const N = 120, cut = 2.5, eps = 1, sig2 = 1, pos = scene(N, 16);
    // brute LJ with the same cutoff
    const bruteForces = new Float64Array(3 * N); let brutePE = 0;
    const c2 = cut * cut;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
        const r2 = dx * dx + dy * dy + dz * dz; if (r2 > c2) continue;
        const k = ljCoeff(r2, eps, sig2);
        bruteForces[3 * i] += k * dx; bruteForces[3 * i + 1] += k * dy; bruteForces[3 * i + 2] += k * dz;
        bruteForces[3 * j] -= k * dx; bruteForces[3 * j + 1] -= k * dy; bruteForces[3 * j + 2] -= k * dz;
        brutePE += ljPotential(r2, eps, sig2);
    }
    const grid = computeForcesGrid(pos, N, eps, sig2, cut, ljCoeff, ljPotential);
    let worst = 0; for (let c = 0; c < 3 * N; c++) worst = Math.max(worst, Math.abs(grid.forces[c] - bruteForces[c]));
    ok("!! grid forces match the brute-force forces", worst < 1e-9 && Math.abs(grid.pe - brutePE) < 1e-9,
       "max per-component force difference " + worst.toExponential(1) + " and PE match -- the grid changes the speed, not the answer.");
}

// ---- 3. DETERMINISTIC RUN TO RUN ---------------------------------------------------------------------------------
{
    const N = 80, cut = 3, pos = scene(N, 14);
    const a = JSON.stringify(neighborPairs(pos, N, cut));
    const b = JSON.stringify(neighborPairs(pos, N, cut));
    ok("!! the neighbour set is deterministic", a === b,
       "identical positions give a byte-identical sorted pair list -- required for a lockstep MD run.");
}

// ---- 4. IT ACTUALLY PRUNES (far fewer than N^2) ------------------------------------------------------------------
{
    const N = 200, cut = 2, pos = scene(N, 30);   // spread out -> few neighbours
    const pairs = neighborPairs(pos, N, cut).length;
    const nsq = N * (N - 1) / 2;
    ok("!! the grid prunes hard versus the all-pairs count", pairs < nsq * 0.2,
       pairs + " neighbour pairs vs " + nsq + " all-pairs -- the force loop runs on a fraction, which is the whole point.");
}

console.log(fails ? "\nneighborGrid-selfcheck: " + fails + " FAILED" : "\nneighborGrid-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
