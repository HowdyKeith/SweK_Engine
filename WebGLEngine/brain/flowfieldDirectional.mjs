// WebGLEngine/brain/flowfieldDirectional.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "ITEM 2, PART 2: THE CURRENT IN THE COST" of brain/NAV_PLUS_WIP.md, written
// before this file; the gate is brain/flowfieldDirectional-selfcheck.mjs)
//
// A DIRECTIONAL ROUTE SOLVER: the distance to a goal measured in TIME, for a vessel at through-water speed V in a current that may vary in space. brain/flowfieldCpu.js (the shared solver,
// the GPU Brain fleet's drop-in) costs entering a cell the same from every side, so a current cannot enter its cost; it is NOT edited -- this is a separate solver for the nav fields.
//   * the grid and walls: the nav field's (cells of `cell` m from (x0, y0)); an edge between two cells is passable iff both are free or both are blocked (the nav field's two heights and impassDh)
//   * a backward multi-source exact Dijkstra from the goal over the 4 neighbours. WHEN NEIGHBOUR v IS RELAXED FROM THE SETTLED CELL u, THE VESSEL TRAVELS v -> u: d = unit(u - v) in world (x, y)
//   * the current at the midpoint of the two cell centres: c_par = c.d, c_perp = |c - c_par d|; impassable if c_perp >= V or g = c_par + sqrt(V^2 - c_perp^2) <= G_MIN; else
//     cost = round(cell x V / g x 1024) / 1024 (still-water metres, a whole number of 1/1024: tied routes stay EXACTLY tied, and with c = 0 every step costs exactly `cell`)
//   * dist is float32 and the relax compares in float32 (nd = fround(d + cost)); a cell is expanded once (a settled flag). The first draft of the registration copied the shared solver's
//     float64 test against float32 dist, which re-expands cells without end once costs are not whole numbers (found by the review, said in the registration)
//   * the flow is the shared solver's rule, line for line: the 8-neighbour of lowest dist
// WITH c = 0 EVERYWHERE THE FIELD IS THE SHARED SOLVER'S BIT FOR BIT on a nav field (the gate holds it). Pure: no clock, no Math.random.
"use strict";

export const BIG = 1e9, G_MIN = 0.05, QUANTUM = 1024;

/** The step cost (still-water metres) of travelling `cell` metres along the unit vector (dx, dy) in the current (cx, cy) at through-water speed V; Infinity if the vessel cannot make way along it. */
export function stepCost(cell, dx, dy, cx, cy, V) {
    if (cx === 0 && cy === 0) return cell;
    const par = cx * dx + cy * dy, px = cx - par * dx, py = cy - par * dy, perp = Math.sqrt(px * px + py * py);
    if (perp >= V) return Infinity;
    const g = par + Math.sqrt(V * V - perp * perp);
    if (!(g > G_MIN)) return Infinity;
    return Math.round((cell * V / g) * QUANTUM) / QUANTUM;
}

/** A compact binary min-heap over (dist, cell). */
class Heap {
    constructor(n) { this.d = new Float64Array(n); this.c = new Int32Array(n); this.size = 0; }
    push(d, c) {
        if (this.size >= this.d.length) { const nd = new Float64Array(this.d.length * 2), nc = new Int32Array(this.c.length * 2); nd.set(this.d); nc.set(this.c); this.d = nd; this.c = nc; }
        let i = this.size++; this.d[i] = d; this.c[i] = c;
        while (i > 0) { const p = (i - 1) >> 1; if (this.d[p] <= this.d[i]) break; this.swap(i, p); i = p; }
    }
    pop() {
        const c = this.c[0]; this.size--;
        if (this.size > 0) {
            this.d[0] = this.d[this.size]; this.c[0] = this.c[this.size];
            let i = 0;
            for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < this.size && this.d[l] < this.d[s]) s = l; if (r < this.size && this.d[r] < this.d[s]) s = r; if (s === i) break; this.swap(i, s); i = s; }
        }
        return c;
    }
    swap(a, b) { const td = this.d[a]; this.d[a] = this.d[b]; this.d[b] = td; const tc = this.c[a]; this.c[a] = this.c[b]; this.c[b] = tc; }
}

/**
 * Solve. `grid` is { w, h, cell, x0, y0 }; `blocked` a Uint8Array (1 = blocked); `goals` [{ gx, gy }]; `currentAt(x, y)` -> [cx, cy] (null or absent: still water); V the through-water speed (m/s).
 * Returns { dist (Float32Array, still-water metres; BIG unreached), fx, fz (Float32Array, the shared flow rule), pops (cells expanded) }.
 */
export function solveDirectional(grid, blocked, goals, { currentAt = null, V = 3 } = {}) {
    const { w, h, cell, x0, y0 } = grid, n = w * h;
    if (!(V > 0)) throw new Error(`flowfieldDirectional.solveDirectional: V must be a speed above 0, got ${V}`);
    if (!blocked || blocked.length !== n) throw new Error(`flowfieldDirectional.solveDirectional: blocked must have ${n} cells`);
    const dist = new Float32Array(n).fill(BIG), done = new Uint8Array(n), heap = new Heap(Math.max(1024, n));
    for (const g of goals) {
        const gx = Math.max(0, Math.min(w - 1, g.gx | 0)), gy = Math.max(0, Math.min(h - 1, g.gy | 0)), gi = gy * w + gx;
        if (dist[gi] !== 0) { dist[gi] = 0; heap.push(0, gi); }
    }
    // the cost of the step from v toward u (unit direction ux, uy), at the midpoint current; a still sea short-circuits to `cell`
    const cost = (u, v, ux, uy) => {
        if (!currentAt) return cell;
        const mx = x0 + (((u % w) + (v % w)) / 2 + 0.5) * cell, my = y0 + ((((u / w) | 0) + ((v / w) | 0)) / 2 + 0.5) * cell, c = currentAt(mx, my);
        return stepCost(cell, ux, uy, c ? c[0] : 0, c ? c[1] : 0, V);
    };
    let pops = 0;
    const relax = (v, u, ux, uy) => {
        if (done[v] || blocked[v] !== blocked[u]) return;
        const k = cost(u, v, ux, uy); if (k === Infinity) return;
        const nd = Math.fround(dist[u] + k);
        if (nd < dist[v]) { dist[v] = nd; heap.push(nd, v); }
    };
    while (heap.size > 0) {
        const u = heap.pop();
        if (done[u]) continue;
        done[u] = 1; pops++;
        const x = u % w, y = (u / w) | 0;
        // v = u - 1 lies at -x: the vessel travels v -> u, along +x; and so on
        if (x - 1 >= 0) relax(u - 1, u, 1, 0);
        if (x + 1 < w) relax(u + 1, u, -1, 0);
        if (y - 1 >= 0) relax(u - w, u, 0, 1);
        if (y + 1 < h) relax(u + w, u, 0, -1);
    }
    // the shared solver's flow rule (brain/flowfieldCpu.js), line for line
    const fx = new Float32Array(n), fz = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, here = dist[i]; let best = here, dx = 0, dy = 0;
        for (let oy = -1; oy <= 1; oy++) {
            const ny = y + oy; if (ny < 0 || ny >= h) continue;
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;
                const nx = x + ox; if (nx < 0 || nx >= w) continue;
                const dd = dist[ny * w + nx]; if (dd < best) { best = dd; dx = ox; dy = oy; }
            }
        }
        if (best < here && (dx !== 0 || dy !== 0)) { const inv = 1 / Math.sqrt(dx * dx + dy * dy); fx[i] = dx * inv; fz[i] = dy * inv; } else { fx[i] = 0; fz[i] = 0; }
    }
    return { dist, fx, fz, pops };
}
