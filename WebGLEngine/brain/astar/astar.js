// brain/astar/astar.js
//
// A* pathfinding that is DETERMINISTIC BY CONSTRUCTION -- the same path on every machine, every run, no matter the
// order neighbours are visited. A* joins the brain's other search layers: the Dijkstra field (downhill-to-goal for
// every cell, for many agents heading to one goal) and Prime Transport (constrained beam search). A* is the
// single-agent point-to-point specialist: one start, one goal, heuristic-guided.
//
// TWO THINGS MAKE IT DETERMINISTIC, and both are the usual traps:
//   1. INTEGER COSTS AND HEURISTIC. Edge cost is 1, the heuristic is Manhattan distance -- all integer arithmetic,
//      no sqrt, no Math.hypot whose last bit varies between platforms. There are literally no floats to disagree on.
//   2. TOTAL-ORDER TIE-BREAK. When two open nodes share an f-score, a plain heap expands them in whatever order they
//      were pushed -- which depends on neighbour iteration order and gives a different (still shortest) path run to
//      run. Here the heap orders by (f, THEN node index), a strict total order: the next node to expand is a pure
//      function of the open set, independent of push order. So among many equal-length shortest paths, A* always
//      returns the SAME one. The gate proves it by shuffling neighbour order and getting byte-identical paths.
//
// The grid's occupancy is just a Uint8Array here; a sparse octree / SVO can provide the same `blocked` lookup later
// without touching this file -- A* is agnostic to how occupancy is stored.

// A binary min-heap keyed by (f, node). Because node indices are unique, (f, node) is a STRICT TOTAL ORDER, so the
// element popped next is uniquely determined -- the heap's internal array layout (which does depend on push order)
// cannot change which element is the minimum.
class MinHeap {
    constructor(less) { this.a = []; this._less = (i, j) => less(this.a[i], this.a[j]); }
    get size() { return this.a.length; }
    push(e) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this._less(i, p)) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; const n = a.length; for (; ;) { let s = i, l = 2 * i + 1, r = l + 1; if (l < n && this._less(l, s)) s = l; if (r < n && this._less(r, s)) s = r; if (s === i) break;[a[i], a[s]] = [a[s], a[i]]; i = s; } } return top; }
}

// the correct comparator: (f, THEN node index) -- a strict total order, so the min is unique and pop is deterministic
const TOTAL_ORDER = (x, y) => x.f < y.f || (x.f === y.f && x.node < y.node);
// the broken comparator kept only for the gate's contrast: f alone, so ties resolve by heap/push order
const F_ONLY = (x, y) => x.f < y.f;

const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// grid = { nx, ny, nz, blocked:Uint8Array }  (blocked[idx] === 1 means impassable). start/goal are node indices.
// opts.dirs lets the gate reorder neighbour visitation to prove the path does not depend on it.
// Returns { path:[nodeIdx...], cost, expanded } or null if unreachable.
export function astar(grid, start, goal, opts = {}) {
    const { nx, ny, nz, blocked } = grid;
    const N = nx * ny * nz;
    const dirs = opts.dirs || DIRS6;
    const nxny = nx * ny;
    const gx = (i) => i % nx, gy = (i) => ((i / nx) | 0) % ny, gz = (i) => (i / nxny) | 0;
    const goalx = gx(goal), goaly = gy(goal), goalz = gz(goal);
    const h = (i) => Math.abs(gx(i) - goalx) + Math.abs(gy(i) - goaly) + Math.abs(gz(i) - goalz);   // Manhattan: integer, exact, admissible for 6-connectivity

    const g = new Int32Array(N).fill(0x7fffffff);
    const cameFrom = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap(opts.tieByIndex === false ? F_ONLY : TOTAL_ORDER);
    if (blocked[start] || blocked[goal]) return null;
    g[start] = 0;
    heap.push({ node: start, f: h(start) });
    let expanded = 0;

    while (heap.size) {
        const node = heap.pop().node;
        if (closed[node]) continue;                    // lazy deletion: a stale, higher-cost entry for an already-finalized node
        closed[node] = 1; expanded++;
        if (node === goal) break;
        const x = gx(node), y = gy(node), z = gz(node), gn = g[node];
        for (let d = 0; d < dirs.length; d++) {
            const nX = x + dirs[d][0], nY = y + dirs[d][1], nZ = z + dirs[d][2];
            if (nX < 0 || nY < 0 || nZ < 0 || nX >= nx || nY >= ny || nZ >= nz) continue;
            const nb = nX + nx * (nY + ny * nZ);
            if (blocked[nb] || closed[nb]) continue;
            const ng = gn + 1;                          // unit integer edge cost
            if (ng < g[nb]) { g[nb] = ng; cameFrom[nb] = node; heap.push({ node: nb, f: ng + h(nb) }); }
        }
    }
    if (!closed[goal]) return null;
    const path = [];
    for (let cur = goal; cur !== -1; cur = cameFrom[cur]) path.push(cur);
    path.reverse();
    return { path, cost: g[goal], expanded };
}

export { DIRS6, MinHeap };
