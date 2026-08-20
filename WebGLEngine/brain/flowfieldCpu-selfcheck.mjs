// brain/flowfieldCpu-selfcheck.mjs
//
// v3337 -- THE EXACT DIJKSTRA THE GPU BRAIN IS GRADED AGAINST WAS NOT REACHING MOST OF THE MAP.
//
// This module is the reference: flowfield.js approximates Dijkstra on the GPU with ~1.7*max(w,h) parallel
// min-plus relaxation passes, and flowfieldCpu.js is "an EXACT multi-source Dijkstra with a binary heap" that
// the approximation is checked against. It had no gate of its own, which is how the following survived.
//
// *** THE FRONTIER DIED ON ANY SLOPED TERRAIN. *** Measured on a 48x48 grid, goal at (46,46):
//
//     terrain amplitude 0     -> 2304 of 2304 cells reached
//     terrain amplitude 0.1   ->  123 of 2304 cells reached
//
// A slope of one tenth of a unit stranded 95% of the map, and the shape of the reached region was a ragged blob
// around the goal -- Dijkstra stopping mid-expansion with an empty heap.
//
// THE CAUSE WAS A PRECISION MISMATCH BETWEEN TWO ARRAYS THAT HAD TO AGREE. _dist is a Float32Array; the heap
// holds Float64. _relax stored fround(nd) in _dist but pushed the unrounded nd into the heap, so on pop the
// stale-entry guard
//
//     if (d > _dist[c]) continue;
//
// read TRUE for a LIVE entry every time float32 rounded down -- about half of all pushes. Those cells were
// dropped, the frontier starved, and the solve returned early with no error and no warning.
//
// WHY IT HID: with a UNIFORM cost the distances are exact multiples of cost*cell, float32 represents them
// exactly, nothing rounds, and every cell is reached. Flat terrain -- the obvious thing to test a pathfinder on
// -- is precisely the case that cannot expose it.
//
// The fix pushes `this._dist[ni]`, the value actually stored, so the two agree by construction rather than by
// luck. These checks are written to fail on the original code.

import { FlowFieldSolverCPU } from "./flowfieldCpu.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const BIGGISH = 1e8;

function field(n, amp, base = 10) {
    const a = new Float32Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++)
        a[z * n + x] = base + amp * Math.sin(x * 0.18) * Math.cos(z * 0.15);
    return a;
}
function reach(n, amp) {
    const s = new FlowFieldSolverCPU(null, n, n, {});
    const d = s.solveSync(field(n, amp), [{ gx: n - 2, gy: n - 2 }], { wantDist: true }).dist;
    let r = 0, mx = 0;
    for (const v of d) if (v < BIGGISH) { r++; if (v > mx) mx = v; }
    return { reached: r, cells: n * n, maxCost: mx, dist: d };
}

// ---- 1. EVERY CELL OF AN OPEN MAP IS REACHED, AT EVERY ROUGHNESS -------------------------------------------------
{
    const rows = [0, 0.1, 0.4, 1.2, 3].map((a) => ({ amp: a, ...reach(48, a) }));
    ok("!! a connected 48x48 map is fully solved at every terrain amplitude",
        rows.every((r) => r.reached === r.cells),
        rows.map((r) => `amp ${r.amp}: ${r.reached}/${r.cells}`).join("  ") + ". Before the fix, amplitude 0 gave " +
        "2304 and amplitude 0.1 gave 123 -- a tenth of a unit of slope stranded 95% of the map");

    ok("!! and the FLAT case alone could never have caught it",
        reach(48, 0).reached === 2304,
        "with a uniform cost every distance is an exact multiple of cost*cell, float32 stores them exactly, and " +
        "nothing rounds. Flat terrain is the obvious test for a pathfinder and it is the one case that cannot " +
        "expose a float32/float64 disagreement");
}

// ---- 2. COST GROWS WITH ROUGHNESS, WHICH IS THE PHYSICS ------------------------------------------------------------
{
    const a = reach(48, 0), b = reach(48, 1.2), c = reach(48, 3);
    ok("!! traversal cost rises monotonically with terrain roughness",
        a.maxCost < b.maxCost && b.maxCost < c.maxCost,
        `max cost-to-go ${a.maxCost.toFixed(1)} -> ${b.maxCost.toFixed(1)} -> ${c.maxCost.toFixed(1)} for ` +
        "amplitudes 0, 1.2, 3. The cost model is 1 + slopeK*slope, so a rougher map must cost more to cross -- " +
        "and a solver that quit early would report a SMALLER max because it never got to the far corner");
}

// ---- 3. THE INVARIANT THE BUG BROKE, STATED DIRECTLY ------------------------------------------------------------------
{
    // Dijkstra's contract: a popped distance is final, so no neighbour can later be reached more cheaply than
    // its stored value. Equivalently, every reached cell's dist must be <= any neighbour's dist + edge cost.
    const n = 32, s = new FlowFieldSolverCPU(null, n, n, {});
    const d = s.solveSync(field(n, 0.7), [{ gx: n - 2, gy: n - 2 }], { wantDist: true }).dist;
    let violations = 0;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const i = z * n + x;
        if (d[i] >= BIGGISH) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
            const j = nz * n + nx;
            // relaxed edge: d[j] must not exceed d[i] + cost[j]*cell by more than float32 slack
            const edge = s._cost[j] * s.cell;
            if (d[j] > d[i] + edge + 1e-3) violations++;
        }
    }
    ok("!! no edge is left unrelaxed -- the shortest-path property actually holds",
        violations === 0,
        `${violations} violations over ${n * n} cells. This is Dijkstra's contract rather than a tolerance: if a ` +
        "neighbour could be reached more cheaply than its stored distance, the frontier skipped it. The original " +
        "code failed this massively, because dropped entries leave whole regions unrelaxed");
}

// ---- 4. THE TWO ARRAYS AGREE BY CONSTRUCTION, NOT BY LUCK ----------------------------------------------------------
{
    const src = (await import("node:fs")).readFileSync(
        new URL("./flowfieldCpu.js", import.meta.url), "utf8");
    ok("!! the heap is pushed the value _dist STORED, not the value computed",
        /_heap\.push\(this\._dist\[ni\], ni\)/.test(src) && !/_heap\.push\(nd, ni\)/.test(src),
        "pushing `nd` put full float64 precision in the heap while _dist kept fround(nd), so the stale guard " +
        "`d > _dist[c]` discarded live entries. Reading the value back makes the two agree by construction -- a " +
        "float32 output array is fine, but only one of the two may decide what the distance IS");
}

console.log();
if (fails) { console.log("flowfieldCpu-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("flowfieldCpu-selfcheck: all checks pass");
