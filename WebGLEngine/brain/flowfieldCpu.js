// flowfieldCpu.js -- CPU flow-field solver for the SweK GPU Brain fleet.
//
// PHASE A of the fleet work-stealing plan: a brain that needs no GPU, so
// the slower/simpler navigation work can live on a CPU while the real
// GPUs are freed for latency-critical or high-value solving.
//
// It is a DROP-IN for FlowFieldSolver: same constructor shape, same
// `solve(heights, goals, opts) -> { fx?, fz?, dist? }` (grid-major,
// y*w+x), same cost model (1 + slopeK*slope + waterK below water). The
// brain cannot tell which solver it holds -- it just posts fields.
//
// WHY THIS ISN'T A DOWNGRADE: the GPU version approximates Dijkstra with
// ~1.7*max(w,h) parallel min-plus relaxation passes (embarrassingly
// parallel, more total work, but each pass is one dispatch a discrete GPU
// eats for breakfast). On a CPU that parallelism buys nothing, so we do
// the thing the GPU was IMITATING: an EXACT multi-source Dijkstra with a
// binary heap. One pass, no iteration-count guessing, and the distance
// field is exact rather than converged-enough. For a 96x96 grid that is a
// few milliseconds -- fine for the low-priority fields this brain exists
// to absorb.

const WATER_LEVEL = 8.0;   // matches flowfield.js + the engine
const BIG = 1e9;

// A compact binary min-heap over (dist, cellIndex). Avoids the O(n^2) of a
// naive scan-for-min Dijkstra; for 9,216 cells it is the difference
// between "instant" and "noticeable".
class MinHeap {
    constructor(capacityHint = 1024) {
        this.dist = new Float64Array(capacityHint);
        this.cell = new Int32Array(capacityHint);
        this.size = 0;
    }
    _grow() {
        const nd = new Float64Array(this.dist.length * 2);
        const nc = new Int32Array(this.cell.length * 2);
        nd.set(this.dist); nc.set(this.cell);
        this.dist = nd; this.cell = nc;
    }
    push(d, c) {
        if (this.size >= this.dist.length) this._grow();
        let i = this.size++;
        this.dist[i] = d; this.cell[i] = c;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.dist[p] <= this.dist[i]) break;
            this._swap(i, p); i = p;
        }
    }
    pop() {
        const d = this.dist[0], c = this.cell[0];
        this.size--;
        if (this.size > 0) {
            this.dist[0] = this.dist[this.size];
            this.cell[0] = this.cell[this.size];
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1; let s = i;
                if (l < this.size && this.dist[l] < this.dist[s]) s = l;
                if (r < this.size && this.dist[r] < this.dist[s]) s = r;
                if (s === i) break;
                this._swap(i, s); i = s;
            }
        }
        return { d, c };
    }
    _swap(a, b) {
        const td = this.dist[a]; this.dist[a] = this.dist[b]; this.dist[b] = td;
        const tc = this.cell[a]; this.cell[a] = this.cell[b]; this.cell[b] = tc;
    }
}

export class FlowFieldSolverCPU {
    // Signature mirrors FlowFieldSolver(device, w, h, opts). `device` is
    // accepted and ignored so callers can swap solvers with one line.
    constructor(device, w, h, opts = {}) {
        this.w = w;
        this.h = h;
        this.cells = w * h;
        this.cell = opts.cell ?? 4.0;
        this.slopeK = opts.slopeK ?? 3.0;
        // v2186 — optional HARD impassability: a height jump steeper than impassDh (per cell)
        // cannot be traversed at all. Without it, walls have merely FINITE cost, so the true
        // shortest path to some floor cells legitimately runs THROUGH a wall — the flow/dist
        // gradient there points into the wall, creating floor "local minima" that trap any
        // gradient follower (the brain-maze walker's exact stall). With it, no shortest path
        // ever crosses a wall and the field is globally descendable (proven: 0 minima / 200
        // rooms). Default off (0) so existing terrain behaviour is byte-identical; the maze
        // page sets it. Applied as an edge filter in the relaxation, not a per-cell cost.
        this.impassDh = opts.impassDh ?? 0;
        this.waterK = opts.waterK ?? 25.0;
        this.backend = "cpu";   // fleet telemetry reads this

        // reused scratch -- same no-per-tick-churn discipline as the GPU path
        this._cost = new Float32Array(this.cells);
        this._dist = new Float32Array(this.cells);
        this._fx = new Float32Array(this.cells);
        this._fz = new Float32Array(this.cells);
        this._heap = new MinHeap(Math.max(1024, this.cells));
    }

    _idx(x, y) { return y * this.w + x; }

    // Per-cell traversal cost -- byte-for-byte the k_cost math: steepest
    // rise/drop to any 4-neighbor (out of bounds = same height), divided
    // by cell size, times slopeK; +waterK at/below water level.
    _computeCost(heights) {
        const { w, h, cell, slopeK, waterK, _cost } = this;
        const invCell = 1 / Math.max(cell, 0.001);
        const imp = this.impassDh > 0 ? this.impassDh : Infinity;   // v2186 — see below
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const hc = heights[i];
                let slope = 0;
                // v2186 — ignore IMPASSABLE neighbours when measuring the steepest slope.
                // Otherwise a cell beside a wall/gutter inherits that huge dh into its cost,
                // which (a) needlessly inflates travel cost hugging walls and (b) broke
                // quadrant packing: a task edge cell next to a gutter got a different cost
                // than in a standalone solve, so packed dist != separate dist. An edge we
                // will never traverse must not price the cell we're standing on.
                if (x - 1 >= 0) { const d = Math.abs(heights[i - 1] - hc); if (d <= imp) slope = Math.max(slope, d); }
                if (x + 1 < w)  { const d = Math.abs(heights[i + 1] - hc); if (d <= imp) slope = Math.max(slope, d); }
                if (y - 1 >= 0) { const d = Math.abs(heights[i - w] - hc); if (d <= imp) slope = Math.max(slope, d); }
                if (y + 1 < h)  { const d = Math.abs(heights[i + w] - hc); if (d <= imp) slope = Math.max(slope, d); }
                slope *= invCell;
                let c = 1 + slope * slopeK;
                if (hc <= WATER_LEVEL) c += waterK;
                _cost[i] = c;
            }
        }
    }

    // heights: Float32Array(cells); goals: [{gx, gy}] grid coords.
    // opts.wantFlow (default true), opts.wantDist (default false).
    // Returns { fx?, fz?, dist? } grid-major -- identical to the GPU solver.
    // async to match the GPU solver's signature (callers `await` it); solveSync is the same computation without the
    // promise, so deterministic callers (the fingerprint) can run it inline. The async path just forwards to it.
    async solve(heights, goals, opts = {}) { return this.solveSync(heights, goals, opts); }
    solveSync(heights, goals, opts = {}) {
        const wantFlow = opts.wantFlow !== false;
        const wantDist = opts.wantDist === true;
        const { w, h, cell, _cost, _dist, _heap } = this;

        this._computeCost(heights);
        this._heights = heights;   // v2186 — retained for the impassable-edge filter in _relax

        // Multi-source exact Dijkstra. Edge weight into cell i is
        // cost[i]*cell -- the SAME relaxation the GPU does as
        // dst = min(src, neighborMin + cost[i]*cell), but resolved exactly
        // in shortest-path order instead of by fixed-count iteration.
        _dist.fill(BIG);
        _heap.size = 0;
        let seeded = 0;
        for (const g of goals) {
            const gx = Math.max(0, Math.min(w - 1, g.gx | 0));
            const gy = Math.max(0, Math.min(h - 1, g.gy | 0));
            const gi = gy * w + gx;
            if (_dist[gi] !== 0) { _dist[gi] = 0; _heap.push(0, gi); seeded++; }
        }
        // No goals -> flat/zero field, exactly like the GPU path with an
        // all-BIG seed (nothing relaxes, flow is zero everywhere).
        if (seeded > 0) {
            while (_heap.size > 0) {
                const { d, c } = _heap.pop();
                if (d > _dist[c]) continue;            // stale heap entry
                const x = c % w, y = (c / w) | 0;
                // 4-neighbor expansion, matching k_relax's neighbor set
                if (x - 1 >= 0) this._relax(c - 1, d, c);
                if (x + 1 < w)  this._relax(c + 1, d, c);
                if (y - 1 >= 0) this._relax(c - w, d, c);
                if (y + 1 < h)  this._relax(c + w, d, c);
            }
        }

        const out = {};
        if (wantDist) out.dist = _dist.slice(0, this.cells);

        if (wantFlow) {
            // k_flow: 8-neighborhood descent toward the lowest-distance
            // neighbor, normalized; zero where no neighbor is lower.
            const { _fx, _fz } = this;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    const here = _dist[i];
                    let best = here, dx = 0, dy = 0;
                    for (let oy = -1; oy <= 1; oy++) {
                        const ny = y + oy; if (ny < 0 || ny >= h) continue;
                        for (let ox = -1; ox <= 1; ox++) {
                            if (ox === 0 && oy === 0) continue;
                            const nx = x + ox; if (nx < 0 || nx >= w) continue;
                            const dd = _dist[ny * w + nx];
                            if (dd < best) { best = dd; dx = ox; dy = oy; }
                        }
                    }
                    if (best < here && (dx !== 0 || dy !== 0)) {
                        // v2889 -- Math.hypot is NOT IEEE-specified (last ulp is the host libm's opinion) and this
                        // line ran 1800x inside the cross-machine fingerprint. dx,dy are neighbour offsets in
                        // {-1,0,1}, so sqrt(dx*dx+dy*dy) -- specified, correctly rounded -- is exact here (values
                        // are 1 or sqrt(2)) and bit-identical on every conforming machine.
                        const inv = 1 / Math.sqrt(dx * dx + dy * dy);
                        _fx[i] = dx * inv; _fz[i] = dy * inv;
                    } else {
                        _fx[i] = 0; _fz[i] = 0;
                    }
                }
            }
            out.fx = _fx.slice(0, this.cells);
            out.fz = _fz.slice(0, this.cells);
        }
        return out;
    }

    // relax neighbor `ni` given the settled distance `d` of the cell we are
    // expanding FROM. Edge weight is cost[ni]*cell (cost of entering ni),
    // exactly the GPU's `+ cost[i]*P.cell`.
    _relax(ni, d, from) {
        // v2186 — hard impassability: don't traverse an edge whose height jump exceeds
        // impassDh (per cell). Makes walls uncrossable so the field has no floor local
        // minima. from is undefined for legacy callers => filter is a no-op (impassDh 0).
        if (this.impassDh > 0 && from !== undefined && this._heights &&
            Math.abs(this._heights[ni] - this._heights[from]) > this.impassDh) return;
        const nd = d + this._cost[ni] * this.cell;
        if (nd < this._dist[ni]) {
            this._dist[ni] = nd;
            // v3337 -- PUSH THE VALUE _dist ACTUALLY STORED, NOT THE ONE WE COMPUTED.
            //
            // _dist is a Float32Array and the heap holds Float64. Pushing `nd` stored full precision in the heap
            // while _dist kept fround(nd), so on pop the stale guard `d > _dist[c]` read TRUE for a LIVE entry
            // whenever float32 rounded DOWN -- about half the time -- and the frontier died mid-expansion.
            //
            // It was invisible on flat terrain: with a uniform cost the distances are exact multiples of
            // cost*cell, float32 represents them exactly, nothing rounds, and every cell is reached. Any slope at
            // all makes the sums non-representable. Measured before the fix, 48x48: amplitude 0 reached 2304 of
            // 2304 cells; amplitude 0.1 -- a slope of one tenth of a unit -- reached 123.
            this._heap.push(this._dist[ni], ni);
        }
    }

    destroy() { /* nothing to free -- symmetry with the GPU solver's API */ }
}
