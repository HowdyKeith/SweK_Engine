// FILE: worker/botPathfinder.worker.js
// VERSION: v1 - round 216
//
// Web Worker that runs A* pathfinding off the main thread. Main thread
// sends a heightmap snapshot + start/goal coords; worker returns
// waypoints. Used by BotManager so dozens of bots can request paths
// each frame without blocking rendering.
//
// Protocol:
//   IN:  { cmd: "plan", id, sx, sz, gx, gz, hm, hmStride,
//          hmOriginX, hmOriginZ, gridSize, waterLevel, maxStepUp, maxStepDown,
//          maxSearch, slopePenalty }
//   OUT: { id, path: [{x,y,z}], found: bool, expanded: number }

// Min-heap priority queue
class MinHeap {
    constructor() { this.data = []; }
    isEmpty() { return this.data.length === 0; }
    push(node) {
        this.data.push(node);
        this._bubbleUp(this.data.length - 1);
    }
    pop() {
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }
    _bubbleUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.data[p].f <= this.data[i].f) break;
            [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
            i = p;
        }
    }
    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            const l = 2 * i + 1, r = 2 * i + 2;
            let smallest = i;
            if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
            if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
            if (smallest === i) break;
            [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
            i = smallest;
        }
    }
}

const NEIGHBORS = [
    { dx:  1, dz:  0 }, { dx: -1, dz:  0 },
    { dx:  0, dz:  1 }, { dx:  0, dz: -1 },
    { dx:  1, dz:  1 }, { dx:  1, dz: -1 },
    { dx: -1, dz:  1 }, { dx: -1, dz: -1 },
];

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.cmd !== "plan") return;
    const { id, sx, sz, gx, gz, hm, hmStride, hmOriginX, hmOriginZ,
            gridSize, waterLevel, maxStepUp, maxStepDown, maxSearch,
            slopePenalty } = msg;

    const g = gridSize ?? 4;
    const wL = waterLevel ?? null;
    const upMax = maxStepUp ?? 3;
    const downMax = maxStepDown ?? 6;
    const searchMax = maxSearch ?? 2000;
    const sPenalty = slopePenalty ?? 0.35;

    // Helper: heightAt via the snapshot
    function heightAt(wx, wz) {
        const lx = wx - hmOriginX;
        const lz = wz - hmOriginZ;
        if (lx < 0 || lz < 0 || lx >= hmStride) return -9999;
        const idx = lz * hmStride + lx;
        if (idx < 0 || idx >= hm.length) return -9999;
        return hm[idx];
    }

    function toCell(x, z) {
        return { cx: Math.round(x / g), cz: Math.round(z / g) };
    }
    function toWorld(cell) {
        return { x: cell.cx * g, z: cell.cz * g };
    }
    const keyOf = (cell) => `${cell.cx},${cell.cz}`;

    const startCell = toCell(sx, sz);
    const goalCell  = toCell(gx, gz);

    if (startCell.cx === goalCell.cx && startCell.cz === goalCell.cz) {
        const w = toWorld(startCell);
        self.postMessage({ id, path: [{ x: w.x, z: w.z, y: heightAt(w.x, w.z) }], found: true, expanded: 0 });
        return;
    }

    const startKey = keyOf(startCell);
    const goalKey  = keyOf(goalCell);
    const open = new MinHeap();
    open.push({ key: startKey, cell: startCell, g: 0, f: 0, parent: null });

    const gScore = new Map();
    const closed = new Set();
    const parents = new Map();
    gScore.set(startKey, 0);

    let expanded = 0;
    let bestNode = { key: startKey, cell: startCell };
    let bestH = Math.abs(startCell.cx - goalCell.cx) + Math.abs(startCell.cz - goalCell.cz);
    let found = false;

    while (!open.isEmpty() && expanded < searchMax) {
        const cur = open.pop();
        if (cur.key === goalKey) { found = true; bestNode = cur; break; }
        if (closed.has(cur.key)) continue;
        closed.add(cur.key);
        expanded++;
        const curW = toWorld(cur.cell);
        const curY = heightAt(curW.x, curW.z);
        if (wL != null && curY <= wL) continue;

        for (const n of NEIGHBORS) {
            const nCell = { cx: cur.cell.cx + n.dx, cz: cur.cell.cz + n.dz };
            const nKey = keyOf(nCell);
            if (closed.has(nKey)) continue;
            const nW = toWorld(nCell);
            const nY = heightAt(nW.x, nW.z);
            if (wL != null && nY <= wL) continue;
            const dh = nY - curY;
            if (dh >  upMax)   continue;
            if (dh < -downMax) continue;

            const dx = nW.x - curW.x, dz = nW.z - curW.z;
            const stepCost = Math.sqrt(dx*dx + dz*dz);
            const heightCost = Math.abs(dh) * sPenalty;
            const tentativeG = cur.g + stepCost + heightCost;
            const prevG = gScore.get(nKey);
            if (prevG != null && tentativeG >= prevG) continue;
            gScore.set(nKey, tentativeG);
            parents.set(nKey, cur);
            const h = Math.hypot(nCell.cx - goalCell.cx, nCell.cz - goalCell.cz);
            const f = tentativeG + h * g;     // grid units
            open.push({ key: nKey, cell: nCell, g: tentativeG, f, parent: cur });
            if (h < bestH) {
                bestH = h;
                bestNode = { key: nKey, cell: nCell };
            }
        }
    }

    // Reconstruct path
    if (bestNode.key === startKey) {
        self.postMessage({ id, path: null, found: false, expanded });
        return;
    }
    const path = [];
    let cursor = bestNode.key;
    let safety = 0;
    while (cursor && safety++ < 1000) {
        const parent = parents.get(cursor);
        if (!parent) break;
        const cellNow = parent.cell.cx + "," + parent.cell.cz === cursor ? parent.cell : null;
        // Walk parent chain — easier to push WORLD coords
        // We stored cells in gScore-by-key, but parents Map stores parent NODE
        // Restart with linked-list traversal:
        break;
    }
    // Simpler: re-walk via parents Map
    const cellPath = [];
    let cur = bestNode;
    while (cur) {
        cellPath.unshift(cur.cell);
        const p = parents.get(cur.key);
        if (!p) break;
        cur = p;
    }
    // Convert to world coords + height lookups
    const result = cellPath.map(c => {
        const w = toWorld(c);
        return { x: w.x, z: w.z, y: heightAt(w.x, w.z) };
    });

    self.postMessage({ id, path: result, found, expanded });
};
