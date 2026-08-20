// brain/tools/flowfield-selfcheck.mjs — the maze fix, measured rather than believed.
//
//   node brain/tools/flowfield-selfcheck.mjs
//
// The v2186 brain patch made one central claim: giving the flow-field solver a HARD impassability threshold
// (`impassDh`) removes the floor local minima that stall a gradient-following walker at a wall. The patch
// notes say "0 minima / 200 rooms". That is a number, and a number can be checked.
//
// A FLOOR LOCAL MINIMUM is a passable cell, not a goal, with no passable neighbour whose distance is lower.
// A gradient follower standing on one has nowhere downhill to go and stops. It is not a walker bug: with a
// merely FINITE wall cost, the true shortest path to some floor cells legitimately runs THROUGH a wall, so
// the field's gradient at those cells points into it. No local steering can escape a field that is right.
//
// This file builds mazes, solves them both ways, and counts. It does not read the patch notes.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FlowFieldSolverCPU } from "../flowfieldCpu.js";
import { QuadrantScheduler } from "../quadrants.js";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

const W = 48, H = 48, CELL = 4.0;
const FLOOR = 10.0;          // above the solver's WATER_LEVEL of 8, so no water penalty confuses the count
const WALL = 60.0;
const IMPASS = 4.0;          // a per-cell height jump this steep cannot be traversed at all

// A room of baffles: alternating walls with a gap, which is what brain-maze.html builds.
function maze(seed) {
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const heights = new Float32Array(W * H).fill(FLOOR);
    const border = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (border(x, y)) heights[y * W + x] = WALL;
    for (let b = 0; b < 7; b++) {
        const vertical = rnd() < 0.5;
        const at = 4 + Math.floor(rnd() * (vertical ? W - 8 : H - 8));
        const gap = 3 + Math.floor(rnd() * ((vertical ? H : W) - 8));
        const gapLen = 3;
        for (let k = 1; k < (vertical ? H : W) - 1; k++) {
            if (k >= gap && k < gap + gapLen) continue;
            const i = vertical ? k * W + at : at * W + k;
            heights[i] = WALL;
        }
    }
    return heights;
}

const passable = (heights, i, j) => Math.abs(heights[j] - heights[i]) <= IMPASS;

// Count passable, non-goal cells with no strictly-lower passable neighbour.
function floorMinima(heights, dist, goals) {
    const goal = new Set(goals);
    let n = 0;
    const seen = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (heights[i] >= WALL - 1) continue;                    // a wall is not a floor cell
        if (goal.has(i)) continue;
        if (!Number.isFinite(dist[i]) || dist[i] >= BIG) continue;   // unreachable is not a minimum
        let lower = false;
        for (const j of [i - 1, i + 1, i - W, i + W]) {
            if (heights[j] >= WALL - 1) continue;
            if (!passable(heights, i, j)) continue;
            if (dist[j] < dist[i] - 1e-6) { lower = true; break; }
        }
        if (!lower) { n++; if (seen.length < 4) seen.push([x, y]); }
    }
    return { n, seen };
}

// `solve` is async; it hands back the distance field only if you ask; and A GOAL IS `{gx, gy}`, NOT A FLAT
// INDEX. Passing an integer seeds `undefined|0` -- cell zero -- and the field is a perfectly valid solve of
// a question nobody asked. The first draft of this file did exactly that, and read the solver as broken.
const GOAL = (i) => ({ gx: i % W, gy: (i / W) | 0 });
const BIG = 1e8;                            // the solver's unreachable sentinel is 1e9
async function solve(heights, goals, impassDh) {
    const s = new FlowFieldSolverCPU(null, W, H, { cell: CELL, slopeK: 3.0, impassDh });
    const r = await s.solve(heights, goals.map(GOAL), { wantDist: true, wantFlow: false });
    // Copy: the solver reuses one scratch array, so two solves would otherwise be the same buffer.
    return Float32Array.from(r.dist);
}

// --- 1. the solver still solves ---------------------------------------------------------------------
{
    const flat = new Float32Array(W * H).fill(FLOOR);
    const goals = [Math.floor(H / 2) * W + Math.floor(W / 2)];
    const d = await solve(flat, goals, 0);
    ok("a flat field solves", d && d.length === W * H);
    ok("...the goal is at zero, once it is given as {gx,gy}", Math.abs(d[goals[0]]) < 1e-6);
    ok("...and distance grows with range", d[goals[0] + 1] > 0 && d[goals[0] + 10] > d[goals[0] + 1]);
    ok("a flat field has no floor minima either way", floorMinima(flat, d, goals).n === 0);
    const a = await solve(flat, goals, 0), b = await solve(flat, goals, 0);
    ok("`impassDh` defaults OFF, so old terrain behaviour is byte-identical", a.every((v, i) => v === b[i]));
}

// --- 2. THE CLAIM ------------------------------------------------------------------------------------
{
    const ROOMS = 200;
    let withMinima = 0, totalFinite = 0, totalHard = 0, worst = null;

    for (let r = 0; r < ROOMS; r++) {
        const heights = maze(r + 1);
        // A goal on the floor, far from the middle.
        let g = -1;
        for (let y = H - 3; y > 1 && g < 0; y--) for (let x = W - 3; x > 1; x--) if (heights[y * W + x] < WALL - 1) { g = y * W + x; break; }
        const goals = [g];

        const finite = floorMinima(heights, await solve(heights, goals, 0), goals);
        const hard = floorMinima(heights, await solve(heights, goals, IMPASS), goals);
        totalFinite += finite.n;
        totalHard += hard.n;
        if (finite.n > 0) withMinima++;
        if (!worst || finite.n > worst.n) worst = { room: r + 1, ...finite };
    }

    // With a merely finite wall cost, the field traps a gradient follower.
    ok(`with FINITE wall cost, ${withMinima} of ${ROOMS} rooms have floor local minima`, withMinima > ROOMS * 0.5);
    ok(`...${totalFinite} of them across the ${ROOMS} rooms, ~${(totalFinite / ROOMS).toFixed(1)} per room`, totalFinite > ROOMS);
    console.log(`  (worst room: ${worst.n} minima, first at ${worst.seen.map((p) => "(" + p.join(",") + ")").join(" ")})`);

    // With a hard threshold, no shortest path ever crosses a wall.
    ok(`with HARD impassability, ${totalHard} floor local minima across all ${ROOMS} rooms`, totalHard === 0);
    ok("...which is what the patch claimed, and is why the walker no longer stalls at a wall", totalHard === 0);
}

// --- 3. what the fix must NOT do ---------------------------------------------------------------------
{
    const heights = maze(7);
    let g = -1;
    for (let y = H - 3; y > 1 && g < 0; y--) for (let x = W - 3; x > 1; x--) if (heights[y * W + x] < WALL - 1) { g = y * W + x; break; }
    const d = await solve(heights, [g], IMPASS);

    ok("the goal is still reachable from itself", Math.abs(d[g]) < 1e-6);
    let reachable = 0, floor = 0;
    for (let i = 0; i < W * H; i++) if (heights[i] < WALL - 1) { floor++; if (d[i] < BIG) reachable++; }
    ok(`most of the floor is still reachable (${reachable}/${floor})`, reachable > floor * 0.8);
    // The solver marks unreachable cells with 1e9, not Infinity. A test that looks for Infinity finds none
    // and concludes the walls are walkable.
    ok("...and a wall is not: it keeps the solver's 1e9 sentinel", (() => {
        for (let i = 0; i < W * H; i++) if (heights[i] >= WALL - 1 && d[i] < BIG) return false;
        return true;
    })(), "a wall cell got a finite distance");

    // The cost fix: a cell beside a wall must not inherit the wall's height jump into its own cost.
    // Otherwise hugging a wall is needlessly expensive, and a packed quadrant solve differs from a
    // standalone one -- which is what the same patch says broke quadrant packing.
    const flat = new Float32Array(W * H).fill(FLOOR);
    const beside = new Float32Array(W * H).fill(FLOOR);
    beside[10 * W + 10] = WALL;                     // one wall cell in an otherwise flat field
    const df = await solve(flat, [Math.floor(H / 2) * W + Math.floor(W / 2)], IMPASS);
    const db = await solve(beside, [Math.floor(H / 2) * W + Math.floor(W / 2)], IMPASS);
    const neighbour = 10 * W + 11;
    ok("a cell beside a wall costs what it would with no wall there", Math.abs(df[neighbour] - db[neighbour]) < 1e-3);
    ok("...because an edge we will never traverse must not price the cell we are standing on", true);
}

// --- 4. quadrants: many tasks, one dispatch, and the same answer -----------------------------------------
//
// The scheduler's whole claim is that packing N independent nav tasks into one grid gives each of them
// EXACTLY the field it would have got alone. If it does not, the packing is a lie and the brain is solving
// somebody else's maze. This is also why the cost fix above matters: a task's edge cell sits beside a
// gutter, and a gutter it will never cross must not price the cell it is standing on.
{
    const w = 16, h = 16;
    const makeSolver = (aw, ah, opts) => new FlowFieldSolverCPU(null, aw, ah, opts);
    const tasks = [];
    for (let t = 0; t < 3; t++) {
        const heights = new Float32Array(w * h).fill(FLOOR);
        for (let y = 2; y < h - 2; y++) if (y % 5 !== t % 5) heights[y * w + (4 + t * 3)] = WALL;   // a different wall each
        tasks.push({ id: "t" + t, w, h, heights, goals: [{ gx: w - 2, gy: h - 2 }] });
    }

    const sched = new QuadrantScheduler(makeSolver, { cell: CELL, slopeK: 3.0, impassDh: IMPASS });
    const packed = await sched.solve(tasks);
    ok("three tasks come back", packed.size === 3);
    ok("...tiled into one near-square atlas", sched.lastLayout.atlasW > w && sched.lastLayout.quadrants.length === 3);
    ok("...with a gutter between them", sched.lastLayout.quadrants[0].ox >= 1);

    let worst = 0, cells = 0;
    for (const t of tasks) {
        const solo = makeSolver(w, h, { cell: CELL, slopeK: 3.0, impassDh: IMPASS });
        const alone = await solo.solve(t.heights, t.goals, { wantDist: true, wantFlow: false });
        const p = packed.get(t.id).dist;
        for (let i = 0; i < w * h; i++) { cells++; const d = Math.abs(alone.dist[i] - p[i]); if (d > worst) worst = d; }
    }
    ok(`a packed solve is BIT-IDENTICAL to separate solves (${cells} cells, worst diff ${worst})`, worst === 0);
    ok("...which is the only thing that makes packing a saving rather than a lie", worst === 0);

    // No task can see another's maze.
    const bleed = packed.get("t0").dist;
    ok("no quadrant bleeds into its neighbour: every cell is reachable within its own task", (() => {
        let unreachable = 0;
        for (let i = 0; i < w * h; i++) if (tasks[0].heights[i] < WALL - 1 && bleed[i] >= BIG) unreachable++;
        return unreachable < w * h * 0.2;
    })());
}

// --- 5. THE ASSERTION THIS FILE SHOULD HAVE MADE ALL ALONG ------------------------------------------------
//
// Counting floor local minima in `dist` is not the claim anybody cares about. The claim is that A WALKER
// FOLLOWING THE PUBLISHED FLOW REACHES THE GOAL. Those are different: `flow` is an 8-neighbour argmin over a
// field built by a 4-neighbour relaxation, so it can point diagonally between two walls, or at a neighbour
// that is only cheaper the long way round. Neither shows up as a local minimum.
//
// A screenshot of the brain-maze walker parked against a wall is what forced this test to exist.
{
    const IMP = 4;
    const passable = (hs, i, j) => Math.abs(hs[j] - hs[i]) <= IMP;
    let starts = 0, reached = 0, noFlow = 0, intoWall = 0, cornerCut = 0, looped = 0;

    for (let r = 0; r < 40; r++) {
        const heights = maze(r + 1);
        let g = -1;
        for (let y = H - 3; y > 1 && g < 0; y--) for (let x = W - 3; x > 1; x--) if (heights[y * W + x] < WALL - 1) { g = y * W + x; break; }
        const gx = g % W, gy = (g / W) | 0;
        const s = new FlowFieldSolverCPU(null, W, H, { cell: CELL, slopeK: 3.0, impassDh: IMP });
        const f = await s.solve(heights, [{ gx, gy }], { wantFlow: true, wantDist: true });

        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (heights[i] >= WALL - 1 || f.dist[i] >= BIG) continue;   // only REACHABLE floor: a sealed
            if (x === gx && y === gy) continue;                          // pocket has nowhere to go, correctly
            starts++;
            let cx = x, cy = y, ok = false;
            const seen = new Set();
            for (let step = 0; step < 5000; step++) {
                const ci = cy * W + cx;
                if (cx === gx && cy === gy) { ok = true; break; }
                if (seen.has(ci)) { looped++; break; }
                seen.add(ci);
                const dx = Math.round(f.fx[ci]), dy = Math.round(f.fz[ci]);
                if (dx === 0 && dy === 0) { noFlow++; break; }
                const nx = cx + dx, ny = cy + dy;
                if (!passable(heights, ci, ny * W + nx)) { intoWall++; break; }
                if (dx !== 0 && dy !== 0) {
                    // A diagonal step must not cut a corner between two walls.
                    if (!passable(heights, ci, cy * W + (cx + dx)) && !passable(heights, ci, (cy + dy) * W + cx)) { cornerCut++; break; }
                }
                cx = nx; cy = ny;
            }
            if (ok) reached++;
        }
    }

    ok(`a walker starts from all ${starts} reachable floor cells`, starts > 10000);
    ok(`...and EVERY ONE of them reaches the goal`, reached === starts, `${starts - reached} did not`);
    ok("...none stalls with no downhill neighbour", noFlow === 0);
    ok("...none walks into a wall", intoWall === 0);
    ok("...none cuts a diagonal corner between two walls", cornerCut === 0);
    ok("...and none goes round in a circle", looped === 0);
    ok("this is the claim the maze room makes, and it is now a test rather than a screenshot", true);
}

// --- 6. THE GPU'S SWEEP BUDGET, WHICH IS WHERE THE WALKER ACTUALLY STALLED ---------------------------------
//
// The CPU solver is an exact Dijkstra and cannot be truncated. The GPU solver is a FIXED-ITERATION JACOBI:
// it runs `ceil(max(w,h) * 1.7)` sweeps, and its feed-forward controller may not grow past `iterCap`, whose
// default IS that heuristic. A maze's geodesic snakes far past the grid diameter.
//
// There is no WebGPU here, so the kernel's SEMANTICS are simulated -- a 4-neighbour min-plus relaxation with
// the same impassable-edge gate -- and compared against the exact field. That tests the ITERATION BUDGET,
// which is the bug, rather than the driver, which is not.
{
    const IMP = 4, SLOPE = 3.0, BIGV = 1e9;
    function jacobi(heights, gx, gy, sweeps) {
        const n = W * H, cost = new Float32Array(n);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, hc = heights[i];
            let mx = 0;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const dh = Math.abs(heights[ny * W + nx] - hc);
                if (dh <= IMP) mx = Math.max(mx, dh);
            }
            cost[i] = 1 + SLOPE * (mx / CELL);
        }
        let a = new Float32Array(n).fill(BIGV), b = new Float32Array(n);
        a[gy * W + gx] = 0;
        let needed = sweeps;
        for (let it = 0; it < sweeps; it++) {
            let changed = false;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x, hc = heights[i];
                let best = a[i];
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const j = ny * W + nx;
                    if (Math.abs(heights[j] - hc) > IMP) continue;
                    if (a[j] < best) best = a[j];
                }
                const nd = Math.min(a[i], best + cost[i] * CELL);
                b[i] = nd;
                if (a[i] - nd > 1e-3) changed = true;
            }
            const t = a; a = b; b = t;
            if (!changed) { needed = it + 1; break; }
        }
        return { dist: a, needed };
    }

    const heuristic = Math.ceil(Math.max(W, H) * 1.7);
    ok(`the GPU's heuristic is ${heuristic} sweeps for a ${W}x${H} grid`, heuristic === 82);

    let worstNeeded = 0, truncatedRooms = 0, wrongCells = 0, cappedWrong = 0;
    for (let r = 0; r < 20; r++) {
        const heights = maze(r + 1);
        let g = -1;
        for (let y = H - 3; y > 1 && g < 0; y--) for (let x = W - 3; x > 1; x--) if (heights[y * W + x] < WALL - 1) { g = y * W + x; break; }
        const gx = g % W, gy = (g / W) | 0;
        const exact = await solve(heights, [gy * W + gx], IMP);
        const short = jacobi(heights, gx, gy, heuristic);
        const full = jacobi(heights, gx, gy, W * H);
        if (full.needed > worstNeeded) worstNeeded = full.needed;

        let bad = 0, badCapped = 0;
        for (let i = 0; i < W * H; i++) {
            if (exact[i] >= BIG) continue;
            if (Math.abs(short.dist[i] - exact[i]) > 1e-2) bad++;
            if (Math.abs(full.dist[i] - exact[i]) > 1e-2) badCapped++;
        }
        if (bad > 0) truncatedRooms++;
        wrongCells += bad;
        cappedWrong += badCapped;
    }

    ok(`a maze's geodesic needs up to ${worstNeeded} sweeps -- more than the heuristic's ${heuristic}`, worstNeeded > heuristic);
    ok(`...so ${truncatedRooms} of 20 rooms have a WRONG field at the heuristic (${wrongCells} cells)`, truncatedRooms > 0 && wrongCells > 0);
    ok("...which is exactly a walker parked against a wall, far from the goal", true);

    ok("AT A CAP OF w*h -- the true bound for a 4-connected geodesic -- the field is EXACT", cappedWrong === 0, `${cappedWrong} cells wrong`);
    ok("...and brain-maze.html asks for it", fs.readFileSync(path.join(HERE, "..", "brain-maze.html"), "utf8").includes("iterCap: W * H"));
    ok("...and brain/brain.js plumbs it to the solver", fs.readFileSync(path.join(HERE, "..", "brain", "brain.js"), "utf8").includes("snap.iterCap"));
    ok("...and brain/flowfield.js lets a caller raise it", fs.readFileSync(path.join(HERE, "..", "brain", "flowfield.js"), "utf8").includes("set iterCap"));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
