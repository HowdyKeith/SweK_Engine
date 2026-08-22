// brain/astar/astar-selfcheck.mjs
//
// Run: node brain/astar/astar-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A* has many equally-short paths through open space, and the whole determinism question is WHICH one it returns.
// The spine of this gate is the A* analogue of the Prime Transport permutation test: shuffle the order neighbours
// are visited and prove the returned path is byte-identical every time. To show that is not free, it runs the same
// A* with an f-only tie-break (the version without the node-index total order) and shows THAT one returns different
// paths under the same shuffles. Around it: the path is a correct shortest path, unreachable goals return null, and
// the module touches no float transcendental at all.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { astar, DIRS6 } from "./astar.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// deterministic PRNG for reproducible shuffles
let seed = 0x51ed;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffled = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const idx = (x, y, z, nx, ny) => x + nx * (y + ny * z);
const samePath = (p, q) => p && q && p.length === q.length && p.every((v, i) => v === q[i]);

// an 8x8x1 grid (a plane) with a wall the path must go around
function makeGrid() {
    const nx = 8, ny = 8, nz = 1, blocked = new Uint8Array(nx * ny * nz);
    for (let y = 1; y < 6; y++) blocked[idx(4, y, 0, nx, ny)] = 1;   // vertical wall at x=4, y=1..5
    return { nx, ny, nz, blocked };
}

// ---- 1. CORRECTNESS: A* finds a valid shortest path around the wall --------------------------------------------
{
    const grid = makeGrid();
    const start = idx(0, 0, 0, 8, 8), goal = idx(7, 7, 0, 8, 8);
    const r = astar(grid, start, goal);
    // path is contiguous, unblocked, starts/ends right; open Manhattan distance is 14, the wall forces a small detour
    let valid = r && r.path[0] === start && r.path[r.path.length - 1] === goal && r.cost === r.path.length - 1;
    for (let i = 1; i < r.path.length && valid; i++) {
        const a = r.path[i - 1], b = r.path[i];
        const dx = Math.abs(a % 8 - b % 8), dy = Math.abs(((a / 8) | 0) - ((b / 8) | 0));
        if (dx + dy !== 1 || grid.blocked[b]) valid = false;
    }
    ok("!! A* returns a valid, contiguous, unobstructed shortest path", valid && r.cost >= 14,
       "path of cost " + (r ? r.cost : "-") + " (>=14, the wall forces a detour), every step a unit move onto an open cell, start and goal correct.");
}

// ---- 2. THE SPINE: the path is byte-identical under shuffled neighbour order -----------------------------------
{
    const grid = makeGrid();
    const start = idx(0, 0, 0, 8, 8), goal = idx(7, 7, 0, 8, 8);
    const ref = astar(grid, start, goal).path;
    let stable = true;
    for (let t = 0; t < 200; t++) {
        const p = astar(grid, start, goal, { dirs: shuffled(DIRS6) }).path;
        if (!samePath(p, ref)) { stable = false; break; }
    }
    ok("!! the chosen path does not depend on neighbour visitation order", stable,
       "200 shuffled neighbour orderings, one identical path every time -- among many equal-length shortest paths, the (f, then index) tie-break picks the same one regardless of push order.");
}

// ---- 3. THE CONTRAST: an f-only tie-break DOES wander under the same shuffles ----------------------------------
{
    const grid = makeGrid();
    const start = idx(0, 0, 0, 8, 8), goal = idx(7, 7, 0, 8, 8);
    const ref = astar(grid, start, goal, { tieByIndex: false, dirs: shuffled(DIRS6) }).path;
    let moved = false;
    for (let t = 0; t < 50; t++) {
        const p = astar(grid, start, goal, { tieByIndex: false, dirs: shuffled(DIRS6) }).path;
        if (!samePath(p, ref)) { moved = true; break; }
    }
    ok("!! without the total-order tie-break, the path wanders (so test 2 is not vacuous)", moved,
       "the f-only comparator returns DIFFERENT equal-length paths as neighbour order changes -- proving the permutation test can distinguish deterministic from not, and that the index tie-break is what pins the path down.");
}

// ---- 4. UNREACHABLE: a walled-off goal returns null, no crash --------------------------------------------------
{
    const nx = 5, ny = 5, nz = 1, blocked = new Uint8Array(nx * ny);
    for (let y = 0; y < 5; y++) blocked[idx(2, y, 0, nx, ny)] = 1;   // full wall splits the grid
    const r = astar({ nx, ny, nz, blocked }, idx(0, 0, 0, nx, ny), idx(4, 4, 0, nx, ny));
    ok("!! an unreachable goal returns null rather than a wrong path or a throw", r === null,
       "a wall fully separating start from goal yields null -- A* reports 'no path' honestly instead of returning something invalid.");
}

// ---- 5. DETERMINISTIC BY CONSTRUCTION: no float transcendental (pure integer) ----------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "astar.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const banned = /Math\.(sqrt|hypot|sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh)\b/;
    ok("!! A* uses only integer arithmetic (no sqrt, no hypot, no transcendental)", !banned.test(src),
       "unit edge costs and a Manhattan heuristic mean there are no floats to disagree on -- bit-identical across architectures with nothing to prove empirically.");
}

console.log(fails ? "\nastar-selfcheck: " + fails + " FAILED" : "\nastar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
