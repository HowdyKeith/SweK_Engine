// FILE: demos_code/aquariumEcosystem.js
// VERSION: v1 — round 420
//
// A little living ecosystem for the aquarium glass: algae grows on the
// four glass walls (logistic growth + spontaneous seeding), and snails
// crawl the glass grazing it down. Pure simulation — no GL. The aquarium
// demo renders algae as green particles clinging to the wall planes and
// snails as small entities, so this stays a testable, headless sim.
//
//   * Each wall is a (cols × rows) density grid, 0..1.
//   * grow(dt): d += (growth·d·(1-d) + seed)·dt   — S-curve toward full,
//     plus a trickle so bare glass eventually fuzzes over.
//   * Snails do greedy gradient-ascent toward the densest neighbour cell
//     and eat the cell they sit on; when their patch is barren they
//     occasionally wander to a fresh wall. Classic graze/regrow loop.

export class AquariumEcosystem {
    constructor(opts = {}) {
        this.half = opts.half ?? 32;      // tank XZ half-extent (wall distance from center)
        this.cy   = opts.cy   ?? 30;      // tank center Y
        this.hh   = opts.hh   ?? 20;      // tank half-height
        this.cols = opts.cols ?? 14;
        this.rows = opts.rows ?? 10;
        this.growth  = opts.growth  ?? 0.22;
        this.seed    = opts.seed    ?? 0.005;
        this.eatRate = opts.eatRate ?? 1.1;
        this.crawl   = opts.crawl   ?? 0.08;   // snail speed in u/v units per second
        this.rng = opts.rng ?? Math.random;

        this.walls = [];
        for (let w = 0; w < 4; w++) {
            const g = new Float32Array(this.cols * this.rows);
            for (let i = 0; i < g.length; i++) g[i] = this.rng() < 0.15 ? this.rng() * 0.3 : 0;
            this.walls.push(g);
        }
        this.snails = [];
    }

    addSnail() {
        const s = { wall: (this.rng() * 4) | 0, u: this.rng(), v: 0.2 + this.rng() * 0.6 };
        this.snails.push(s);
        return s;
    }

    cell(w, c, r)        { return this.walls[w][r * this.cols + c]; }
    setCell(w, c, r, val) { this.walls[w][r * this.cols + c] = val < 0 ? 0 : val > 1 ? 1 : val; }

    // (wall, u 0..1, v 0..1) → world point on that glass plane.
    toWorld(wall, u, v) {
        const y  = this.cy - this.hh + v * 2 * this.hh;
        const uu = -this.half + u * 2 * this.half;
        switch (wall) {
            case 0:  return { x:  this.half, y, z: uu };   // +X
            case 1:  return { x: -this.half, y, z: uu };   // -X
            case 2:  return { x: uu, y, z:  this.half };   // +Z
            default: return { x: uu, y, z: -this.half };   // -Z
        }
    }
    // Inward surface normal (points into the tank) for placing film/snails
    // just inside the glass.
    inward(wall) {
        switch (wall) {
            case 0:  return { x: -1, z: 0 };
            case 1:  return { x:  1, z: 0 };
            case 2:  return { x: 0, z: -1 };
            default: return { x: 0, z:  1 };
        }
    }

    grow(dt) {
        for (let w = 0; w < 4; w++) {
            const g = this.walls[w];
            for (let i = 0; i < g.length; i++) {
                const d = g[i];
                const nd = d + (this.growth * d * (1 - d) + this.seed) * dt;
                g[i] = nd > 1 ? 1 : nd;
            }
        }
    }

    stepSnails(dt) {
        for (const s of this.snails) {
            const col = Math.min(this.cols - 1, Math.max(0, Math.floor(s.u * this.cols)));
            const row = Math.min(this.rows - 1, Math.max(0, Math.floor(s.v * this.rows)));
            // Greedy ascent: steer toward the densest neighbouring cell.
            let bestC = col, bestR = row, bestD = this.cell(s.wall, col, row);
            for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
                const c = col + dc, r = row + dr;
                if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;
                const dd = this.cell(s.wall, c, r);
                if (dd > bestD) { bestD = dd; bestC = c; bestR = r; }
            }
            const tu = (bestC + 0.5) / this.cols, tv = (bestR + 0.5) / this.rows;
            const step = this.crawl * dt;
            s.u += Math.sign(tu - s.u) * Math.min(Math.abs(tu - s.u), step);
            s.v += Math.sign(tv - s.v) * Math.min(Math.abs(tv - s.v), step);
            // Graze the current cell.
            const here = this.cell(s.wall, col, row);
            this.setCell(s.wall, col, row, here - Math.min(here, this.eatRate * dt));
            // Barren patch → occasionally relocate to a fresh wall.
            if (bestD < 0.05 && this.rng() < 0.015) {
                s.wall = (this.rng() * 4) | 0;
                s.u = this.rng();
                s.v = 0.2 + this.rng() * 0.6;
            }
        }
    }

    update(dt) { this.grow(dt); this.stepSnails(dt); }

    totalAlgae() {
        let s = 0;
        for (const g of this.walls) for (let i = 0; i < g.length; i++) s += g[i];
        return s;
    }

    // Densest cells for rendering: [{ world, density, inward }], sorted.
    topCells(n) {
        const out = [];
        for (let w = 0; w < 4; w++)
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++) {
                    const d = this.cell(w, c, r);
                    if (d > 0.08) out.push({ w, c, r, d });
                }
        out.sort((a, b) => b.d - a.d);
        return out.slice(0, n).map(o => ({
            world:   this.toWorld(o.w, (o.c + 0.5) / this.cols, (o.r + 0.5) / this.rows),
            density: o.d,
            inward:  this.inward(o.w),
        }));
    }

    // World position of a snail, nudged just inside the glass.
    snailWorld(s, inset = 0.6) {
        const p = this.toWorld(s.wall, s.u, s.v);
        const n = this.inward(s.wall);
        return { x: p.x + n.x * inset, y: p.y, z: p.z + n.z * inset, wall: s.wall };
    }
}
