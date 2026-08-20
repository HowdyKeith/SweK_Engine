// FILE: simulation/PathPlanner.js
// VERSION: v1 (Round 158)
//
// A* path planner for ground units over the terrain heightmap. Returns
// a list of waypoints from a start to a goal that avoids steep slopes
// and impassable terrain. Self-contained — takes a heightAt(x,z) query
// function and a few tunables in the constructor.
//
// Usage:
//   const planner = new PathPlanner({
//       heightAt: (x, z) => world._heightAt(x, z),
//       gridSize: 4,      // path resolution (world units per cell)
//       maxStepUp:   3,   // can climb up this many units between cells
//       maxStepDown: 6,   // can drop down this many units
//       maxSearch: 2000,  // node-expansion budget per plan
//       waterLevel: 0,    // optional: cells at/below this y are impassable
//   });
//
//   const path = planner.plan(start.x, start.z, goal.x, goal.z);
//   if (path) { /* path is an array of {x, z} world-space waypoints */ }
//
// Notes:
//
// • Grid cells are aligned to (0,0) in world space; a request from
//   non-snapped coordinates still works (we snap inside).
//
// • Diagonal moves cost √2; straight moves cost 1; both pay an
//   additional slope-penalty proportional to the |height delta|.
//   So the planner prefers flat over hilly even when both are
//   traversable, and refuses anything beyond maxStepUp/Down.
//
// • Heuristic is Chebyshev distance (admissible for 8-connected
//   grids with diagonal cost √2 ≈ 1.414).
//
// • Budgeted by node-expansion count. If we run out of budget we
//   return the best partial path (closest node to goal) so a unit
//   doesn't just freeze when the goal is unreachable.

const SQRT2 = Math.SQRT2;

// 8-connected neighbor offsets + their step costs
const NEIGHBORS = [
    { dx: -1, dz:  0, cost: 1 },
    { dx:  1, dz:  0, cost: 1 },
    { dx:  0, dz: -1, cost: 1 },
    { dx:  0, dz:  1, cost: 1 },
    { dx: -1, dz: -1, cost: SQRT2 },
    { dx:  1, dz: -1, cost: SQRT2 },
    { dx: -1, dz:  1, cost: SQRT2 },
    { dx:  1, dz:  1, cost: SQRT2 },
];

export class PathPlanner {

    constructor(opts = {}) {
        this.heightAt   = opts.heightAt;
        this.gridSize   = opts.gridSize   ?? 4;
        this.maxStepUp   = opts.maxStepUp   ?? 3;
        this.maxStepDown = opts.maxStepDown ?? 6;
        this.maxSearch  = opts.maxSearch  ?? 2000;
        this.waterLevel = opts.waterLevel ?? null;   // null = no water test
        this.slopePenalty = opts.slopePenalty ?? 0.35; // extra cost per Δh

        if (typeof this.heightAt !== "function") {
            throw new Error("[PathPlanner] heightAt(x,z) function is required");
        }
    }

    // Public — plan a path from (sx,sz) to (gx,gz) in world space.
    // Returns either an array of waypoints { x, z, y } or null if no
    // route was found AND no useful partial was reached.
    plan(sx, sz, gx, gz) {
        const g = this.gridSize;
        const startCell = this._toCell(sx, sz);
        const goalCell  = this._toCell(gx, gz);

        if (startCell.cx === goalCell.cx && startCell.cz === goalCell.cz) {
            return [{ x: gx, z: gz, y: this.heightAt(gx, gz) }];
        }

        // Open set: min-heap by f-score. Closed set: visited cells.
        // We use Maps keyed by "cx,cz" strings — fast enough for 2K nodes.
        const open = new MinHeap();
        const came = new Map();      // "cx,cz" → "parentKey"
        const gScore = new Map();    // "cx,cz" → cost-so-far

        const startKey = key(startCell.cx, startCell.cz);
        const goalKey  = key(goalCell.cx,  goalCell.cz);

        gScore.set(startKey, 0);
        open.push({
            key: startKey, cx: startCell.cx, cz: startCell.cz,
            f: this._heuristic(startCell, goalCell),
            g: 0,
        });

        // Track best-so-far (closest to goal) for the fallback path.
        let bestNode = { key: startKey, cx: startCell.cx, cz: startCell.cz };
        let bestH = this._heuristic(startCell, goalCell);

        let expanded = 0;
        while (!open.isEmpty() && expanded < this.maxSearch) {
            const cur = open.pop();
            if (cur.key === goalKey) {
                return this._reconstruct(came, cur, gx, gz);
            }
            expanded++;

            const curY = this.heightAt(cur.cx * g, cur.cz * g);
            if (this.waterLevel != null && curY <= this.waterLevel) {
                // Standing on water — skip expansion. (Should not happen
                // for start, but defensive.)
                continue;
            }

            for (const n of NEIGHBORS) {
                const nx = cur.cx + n.dx;
                const nz = cur.cz + n.dz;
                const nKey = key(nx, nz);

                const nY = this.heightAt(nx * g, nz * g);
                if (this.waterLevel != null && nY <= this.waterLevel) continue;

                const dh = nY - curY;
                if (dh >  this.maxStepUp)   continue;
                if (dh < -this.maxStepDown) continue;

                const stepCost = n.cost + Math.abs(dh) * this.slopePenalty;
                const tentativeG = cur.g + stepCost;
                const prevG = gScore.get(nKey);
                if (prevG != null && tentativeG >= prevG) continue;

                came.set(nKey, cur.key);
                gScore.set(nKey, tentativeG);
                const h = this._heuristic({ cx: nx, cz: nz }, goalCell);
                open.push({
                    key: nKey, cx: nx, cz: nz,
                    g: tentativeG, f: tentativeG + h,
                });
                if (h < bestH) {
                    bestH = h;
                    bestNode = { key: nKey, cx: nx, cz: nz };
                }
            }
        }

        // No exact route — return partial path toward closest reached.
        if (bestNode.key === startKey) return null;
        return this._reconstruct(came,
            { key: bestNode.key, cx: bestNode.cx, cz: bestNode.cz },
            bestNode.cx * g, bestNode.cz * g);
    }

    // Same as plan(), but also smooths the result by removing waypoints
    // that lie on a near-straight line between their neighbors. Reduces
    // jitter and makes the path visually cleaner without changing its
    // shape meaningfully.
    planSmoothed(sx, sz, gx, gz) {
        const raw = this.plan(sx, sz, gx, gz);
        if (!raw || raw.length < 3) return raw;
        const out = [raw[0]];
        for (let i = 1; i < raw.length - 1; i++) {
            const a = raw[i - 1], b = raw[i], c = raw[i + 1];
            // Cross product of (b-a) × (c-b). Near zero = collinear.
            const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
            if (Math.abs(cross) > 0.5) out.push(b);  // keep corner
        }
        out.push(raw[raw.length - 1]);
        return out;
    }

    // ---- internals ----

    _toCell(wx, wz) {
        return {
            cx: Math.round(wx / this.gridSize),
            cz: Math.round(wz / this.gridSize),
        };
    }

    _heuristic(a, b) {
        // Chebyshev (admissible for 8-connected with diagonal=√2)
        const dx = Math.abs(a.cx - b.cx);
        const dz = Math.abs(a.cz - b.cz);
        return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    }

    _reconstruct(came, endNode, finalX, finalZ) {
        const path = [];
        let k = endNode.key;
        const g = this.gridSize;
        // Walk back from end; collect cells
        while (k != null) {
            const [cxStr, czStr] = k.split(",");
            const cx = +cxStr, cz = +czStr;
            path.push({ x: cx * g, z: cz * g, y: this.heightAt(cx * g, cz * g) });
            k = came.get(k);
        }
        path.reverse();
        // Replace last node with the exact goal (so unit reaches it,
        // not the cell center)
        if (path.length > 0) {
            path[path.length - 1] = {
                x: finalX, z: finalZ, y: this.heightAt(finalX, finalZ),
            };
        }
        return path;
    }
}

function key(cx, cz) { return cx + "," + cz; }

// --- MinHeap (binary) ---
// Tiny implementation — A* runs hot, want allocation-light comparisons.
class MinHeap {
    constructor() { this.data = []; }
    isEmpty() { return this.data.length === 0; }
    push(node) {
        this.data.push(node);
        this._bubbleUp(this.data.length - 1);
    }
    pop() {
        if (this.data.length === 0) return null;
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }
    _bubbleUp(i) {
        const a = this.data;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].f > a[i].f) {
                [a[i], a[p]] = [a[p], a[i]];
                i = p;
            } else break;
        }
    }
    _sinkDown(i) {
        const a = this.data;
        const n = a.length;
        while (true) {
            const l = 2 * i + 1, r = 2 * i + 2;
            let smallest = i;
            if (l < n && a[l].f < a[smallest].f) smallest = l;
            if (r < n && a[r].f < a[smallest].f) smallest = r;
            if (smallest === i) break;
            [a[i], a[smallest]] = [a[smallest], a[i]];
            i = smallest;
        }
    }
}
