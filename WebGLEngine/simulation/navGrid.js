// FILE: simulation/navGrid.js
//
// Coarse occupancy grid + A* over a WAD room, built from the 2D collisionWalls.
// Lets bots path around corners instead of walking into walls. Degrades to
// straight-line if no path is found (callers fall back).
//
//   const nav = new NavGrid(bounds, collisionWalls, 3);
//   const waypoints = nav.findPath(ax, az, bx, bz);   // [{x,z}, ...] or null

export class NavGrid {
  constructor(bounds, walls, cell = 3) {
    this.cell = cell;
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.blocked = new Uint8Array(this.cols * this.rows);
    this._rasterize(walls || []);
  }

  _idx(c, r) { return r * this.cols + c; }
  _cellOf(x, z) {
    return [ Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell))),
             Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell))) ];
  }
  _center(c, r) { return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell }; }
  _mark(c, r) { if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.blocked[this._idx(c, r)] = 1; }

  _rasterize(walls) {
    for (const w of walls) {
      const [c0, r0] = this._cellOf(w.x1, w.z1);
      const [c1, r1] = this._cellOf(w.x2, w.z2);
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) || 1;
      for (let s = 0; s <= steps; s++) {
        this._mark(Math.round(c0 + (c1 - c0) * s / steps), Math.round(r0 + (r1 - r0) * s / steps));
      }
    }
    // dilate by one cell so paths keep a little clearance from walls
    const src = this.blocked.slice();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (!src[this._idx(c, r)]) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) this._mark(c + dc, r + dr);
    }
  }

  // A* (8-connected, no corner cutting). Returns world waypoints or null.
  findPath(ax, az, bx, bz) {
    const [sc, sr] = this._cellOf(ax, az);
    const [gc, gr] = this._cellOf(bx, bz);
    const start = this._idx(sc, sr), goal = this._idx(gc, gr);
    const h = (i) => { const c = i % this.cols, r = (i / this.cols) | 0; return Math.abs(c - gc) + Math.abs(r - gr); };
    const open = [start], inOpen = new Set([start]);
    const came = new Map(), g = new Map([[start, 0]]), f = new Map([[start, h(start)]]);
    let guard = 0; const maxGuard = this.cols * this.rows * 4;
    while (open.length && guard++ < maxGuard) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if ((f.get(open[i]) ?? 1e9) < (f.get(open[bi]) ?? 1e9)) bi = i;
      const cur = open.splice(bi, 1)[0]; inOpen.delete(cur);
      if (cur === goal) return this._reconstruct(came, cur);
      const cc = cur % this.cols, cr = (cur / this.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = cc + dc, nr = cr + dr;
        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        const ni = this._idx(nc, nr);
        if (this.blocked[ni] && ni !== goal) continue;
        if (dc && dr && (this.blocked[this._idx(cc + dc, cr)] || this.blocked[this._idx(cc, cr + dr)])) continue; // no corner cut
        const ng = (g.get(cur) ?? 1e9) + (dc && dr ? 1.4142 : 1);
        if (ng < (g.get(ni) ?? 1e9)) {
          came.set(ni, cur); g.set(ni, ng); f.set(ni, ng + h(ni));
          if (!inOpen.has(ni)) { open.push(ni); inOpen.add(ni); }
        }
      }
    }
    return null;
  }

  _reconstruct(came, cur) {
    const out = [];
    while (cur !== undefined) { const c = cur % this.cols, r = (cur / this.cols) | 0; out.push(this._center(c, r)); cur = came.get(cur); }
    out.reverse();
    return out;
  }
}
