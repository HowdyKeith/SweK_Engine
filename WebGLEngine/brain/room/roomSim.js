// brain/room/roomSim.js -- v2227 -- a clean 3D test room for the GPU brain, now with TERRAIN.
//
// The brain has brain-maze (2D obstacle room), brain-3d (the field AS terrain), brain-quadrants
// (packing), and this: a plain 3D world to WATCH an agent cross. v2227 gives the agent something to
// do besides skirt flat walls: it now goes AROUND steep walls AND UP AND OVER climbable ramps/hills.
//
// The trick is that the brain's flow-field solver already has a SLOPE-AWARE cost model -- entering a
// cell costs 1 + slopeK*(dh/cell), and a step of >= IMPASS_DH can't be crossed. So "around vs over"
// is not scripted: a wall (a WALL_H jump, >> IMPASS_DH) is impassable and the field routes around it,
// while a ramp (a small per-cell rise, < IMPASS_DH) is traversable-but-costly and the field goes over
// it WHEN that is the shortest path (e.g. a mountain pass through a wall ridge). The walker's own
// blocked-check is now slope-aware too: it may step onto a cell only if the height difference from
// where it stands is climbable.
//
// DOM-free core (brain-room.html renders it; room-selfcheck.mjs drives it with the same CPU solver).

export const WALL_H = 4000;          // an impassable wall: a single WALL_H step is way over IMPASS_DH
export const FLOOR_H = 0;
export const FLOOR_LIFT = 10;        // snapshot lift so floors sit above the solver's water level
export const IMPASS_DH = WALL_H * 0.5;   // 2000: a per-step rise of this or more can't be climbed
export const RAMP_STEP = 240;        // height rise per cell on a ramp -- climbable (< IMPASS_DH)
export const PEAK = 1200;            // pass/hill peak -- standable (< IMPASS_DH), NOT a wall

function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class RoomWorld {
    // v2549 -- THE TICK. Nothing owned one before: the page drives the loop, stepAgent(agent,...) moves ONE
    // agent, and the bridge only relays. So the brain's trace carried `seq` -- the order THIS brain decided --
    // which is a per-process counter and CANNOT be compared across machines. Two peers resolve outcomes as the
    // network delivers them, so seq 400 here and seq 400 there are not the same moment, and diffing them
    // produces a confident, meaningless answer.
    //
    // The tick has to be stamped by whatever OWNS the world, and be carried down: sim -> snapshot -> bridge ->
    // brain -> trace. Anything invented further down is a number about the relay, not about the world.
    constructor(opts = {}) {
        this.tick = 0;
        this.W = opts.W || 40;
        this.H = opts.H || 40;
        this.CELL = opts.CELL || 4;
        this.OX = 0; this.OZ = 0;
        this.seed = (opts.seed ?? 1) >>> 0;
        this.nBoxes = opts.nBoxes ?? 14;
        this.mode = opts.mode === "flat" ? "flat" : "terrain";   // v2227 default: terrain (ramps + hills)
        this.heights = new Float32Array(this.W * this.H);
        this.boxes = [];                 // [{gx,gy,w,h}] impassable walls, for the renderer
        this.spawn = { gx: 2, gy: (this.H / 2) | 0 };
        this.goal = { gx: this.W - 3, gy: (this.H / 2) | 0 };
        this.generate(this.seed);
    }

    idx(x, y) { return y * this.W + x; }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    // a TRUE wall (can't stand on it). Climbable terrain (< IMPASS_DH) is NOT a wall.
    isWall(gx, gy) { return !this.inb(gx, gy) || this.heights[this.idx(gx, gy)] >= IMPASS_DH; }
    cellAt(x, z) { return { gx: Math.round((x - this.OX) / this.CELL), gy: Math.round((z - this.OZ) / this.CELL) }; }
    cellCenter(gx, gy) { return { x: this.OX + gx * this.CELL, z: this.OZ + gy * this.CELL }; }
    heightAt(x, z) { const c = this.cellAt(x, z); return this.inb(c.gx, c.gy) ? this.heights[this.idx(c.gx, c.gy)] : 0; }

    // SLOPE-AWARE traversability: from a cell at height `fromH`, may the agent enter (gx,gy)?
    // Yes iff in-bounds AND the step is climbable (|dh| < IMPASS_DH). This is what makes a ramp
    // passable and a wall not, and it is relative to where the agent stands.
    canEnter(fromH, gx, gy) { return this.inb(gx, gy) && Math.abs(this.heights[this.idx(gx, gy)] - fromH) < IMPASS_DH; }
    blockedFrom(fromH, x, z) { const c = this.cellAt(x, z); return !this.canEnter(fromH, c.gx, c.gy); }
    blocked(x, z) { const c = this.cellAt(x, z); return this.isWall(c.gx, c.gy); }   // absolute (renderer/goal use)

    // BFS reachability, SLOPE-AWARE: a neighbour is reachable if the step is climbable. This both
    // excludes walls and INCLUDES ramps/hills, so "the goal is reachable" is true when a mountain
    // pass exists even though a flat route is walled off.
    _reachable(from, to) {
        const { W, H } = this;
        const seen = new Uint8Array(W * H);
        const q = [from.gy * W + from.gx];
        seen[q[0]] = 1;
        const tgt = to.gy * W + to.gx;
        for (let h = 0; h < q.length; h++) {
            const c = q[h]; if (c === tgt) return true;
            const x = c % W, y = (c / W) | 0; const hc = this.heights[c];
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = ny * W + nx;
                if (seen[ni]) continue;
                if (Math.abs(this.heights[ni] - hc) >= IMPASS_DH) continue;   // too steep -> not reachable
                seen[ni] = 1; q.push(ni);
            }
        }
        return false;
    }

    generate(seed) {
        this.seed = (seed >>> 0) || 1;
        this.spawn = { gx: 2, gy: (this.H / 2) | 0 };
        this.goal = { gx: this.W - 3, gy: (this.H / 2) | 0 };
        for (let attempt = 0; attempt < 40; attempt++) {
            const rnd = mulberry32(this.seed + attempt * 7919);
            this.heights.fill(FLOOR_H); this.boxes = [];
            if (this.mode === "flat") this._genFlat(rnd); else this._genTerrain(rnd);
            if (this._reachable(this.spawn, this.goal)) return this;
        }
        this.heights.fill(FLOOR_H); this.boxes = [];   // pathological seed: an empty room is always solvable
        return this;
    }

    // original: scattered impassable walls to go AROUND
    _genFlat(rnd) {
        const { W, H } = this;
        const keepClear = (gx, gy) => { const near = (p) => Math.abs(gx - p.gx) <= 1 && Math.abs(gy - p.gy) <= 1; return near(this.spawn) || near(this.goal); };
        for (let b = 0; b < this.nBoxes; b++) {
            const bw = 1 + ((rnd() * 3) | 0), bh = 1 + ((rnd() * 3) | 0);
            const gx = 2 + ((rnd() * (W - 4 - bw)) | 0), gy = 2 + ((rnd() * (H - 4 - bh)) | 0);
            let clear = true;
            for (let y = gy; y < gy + bh && clear; y++) for (let x = gx; x < gx + bw; x++) if (keepClear(x, y)) { clear = false; break; }
            if (!clear) continue;
            for (let y = gy; y < gy + bh; y++) for (let x = gx; x < gx + bw; x++) this.heights[this.idx(x, y)] = WALL_H;
            this.boxes.push({ gx, gy, w: bw, h: bh });
        }
    }

    // v2227: a wall RIDGE splits spawn from goal, crossed only by a climbable PASS (up and over),
    // plus scattered walls to go around. The pass is the shortest path, so the field goes over it.
    _genTerrain(rnd) {
        const { W, H } = this;
        const midX = (W / 2) | 0;
        const passY = 5 + ((rnd() * (H - 10)) | 0);
        const passHalf = 3;
        const ramp = Math.max(2, (PEAK / RAMP_STEP) | 0);   // ramp radius (~5 cells)

        // the ridge wall spans the FULL height (so a flat bypass around the ends is impossible),
        // with a gap only at the pass -- the one climbable crossing.
        for (let y = 0; y < H; y++) {
            if (Math.abs(y - passY) <= passHalf) continue;
            this.heights[this.idx(midX, y)] = WALL_H;
        }
        this.boxes.push({ gx: midX, gy: 0, w: 1, h: H, ridge: true });   // renderer hint (full ridge; pass carved below)

        // the pass: a climbable hump peaking at the ridge line, ramping down on both x-sides
        for (let y = passY - passHalf; y <= passY + passHalf; y++) {
            if (!this.inb(midX, y)) continue;
            for (let dx = -ramp; dx <= ramp; dx++) {
                const x = midX + dx; if (!this.inb(x, y)) continue;
                const h = Math.max(FLOOR_H, PEAK - RAMP_STEP * Math.abs(dx));
                this.heights[this.idx(x, y)] = h;
            }
        }

        // scattered impassable walls to go AROUND, clear of spawn/goal and the pass corridor
        const keep = (gx, gy) => {
            const near = (p) => Math.abs(gx - p.gx) <= 2 && Math.abs(gy - p.gy) <= 2;
            return near(this.spawn) || near(this.goal) || Math.abs(gx - midX) <= ramp + 1;
        };
        for (let b = 0; b < 6; b++) {
            const bw = 1 + ((rnd() * 2) | 0), bh = 1 + ((rnd() * 3) | 0);
            const gx = 2 + ((rnd() * (W - 4 - bw)) | 0), gy = 2 + ((rnd() * (H - 4 - bh)) | 0);
            let ok = true;
            for (let y = gy; y < gy + bh && ok; y++) for (let x = gx; x < gx + bw; x++) if (keep(x, y)) { ok = false; break; }
            if (!ok) continue;
            for (let y = gy; y < gy + bh; y++) for (let x = gx; x < gx + bw; x++) this.heights[this.idx(x, y)] = WALL_H;
            this.boxes.push({ gx, gy, w: bw, h: bh });
        }
    }

    setGoal(gx, gy) {
        if (!this.inb(gx, gy) || this.isWall(gx, gy)) return false;   // can't sit the goal inside a wall
        this.goal = { gx, gy };
        return true;
    }

    /**
     * v2549 -- advance the world clock by one. Call ONCE per frame, before stepping agents.
     * Deliberately NOT folded into stepAgent(): ten agents in one frame is ONE tick, not ten, and a clock that
     * counts agents is not a clock.
     */
    advance() { return ++this.tick; }

    snapshotBody() {
        return {
            tick: this.tick,   // v2549 -- the shared clock. Two machines can only be compared at the same tick.
            w: this.W, h: this.H, cell: this.CELL, ox: this.OX, oz: this.OZ,
            impassDh: IMPASS_DH,
            heights: Array.from(this.heights, v => v + FLOOR_LIFT),
            goals: [{ x: this.OX + this.goal.gx * this.CELL, z: this.OZ + this.goal.gy * this.CELL }],
        };
    }
    solveHeights() { return Float32Array.from(this.heights, v => v + FLOOR_LIFT); }
    solveGoals() { return [{ gx: this.goal.gx, gy: this.goal.gy }]; }

    // basin-escaping distance descent -- SLOPE-AWARE (a neighbour is only a candidate if the step
    // from here is climbable), so the fallback never routes the agent into a wall or up a cliff.
    routeNeighbour(gx, gy, field) {
        if (!field || !field.dist) return null;
        const hereH = this.heights[this.idx(gx, gy)];
        const here = field.dist[this.idx(gx, gy)];
        let best = null, bestD = here;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = gx + dx, ny = gy + dy;
            if (!this.canEnter(hereH, nx, ny)) continue;
            const d = field.dist[this.idx(nx, ny)];
            if (d < bestD) { bestD = d; best = { gx: nx, gy: ny }; }
        }
        if (best) return best;
        let tie = null, tieG = Math.hypot(gx - this.goal.gx, gy - this.goal.gy);
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nx = gx + dx, ny = gy + dy;
            if (!this.canEnter(hereH, nx, ny)) continue;
            if (!this.canEnter(hereH, gx + dx, gy) || !this.canEnter(hereH, gx, gy + dy)) continue;
            if (field.dist[this.idx(nx, ny)] <= here) { const g = Math.hypot(nx - this.goal.gx, ny - this.goal.gy); if (g < tieG) { tieG = g; tie = { gx: nx, gy: ny }; } }
        }
        return tie;
    }

    // Advance an agent {x,z} one tick. Same flow-follow -> slide -> distance-descent structure as the
    // proven maze walker, but every blocked-check is now SLOPE-AWARE relative to where it stands, so
    // it climbs ramps and hills and only refuses steps too steep to take.
    stepAgent(agent, field, dt, speed = 18) {
        if (!field) return "no field";
        const { gx, gy } = this.cellAt(agent.x, agent.z);
        if (!this.inb(gx, gy)) return "off-grid";
        if (gx === this.goal.gx && gy === this.goal.gy) return "arrived";
        const i = this.idx(gx, gy);
        const hereH = this.heights[i];
        const step = Math.min(speed * dt, this.CELL * 0.45);
        const onWall = hereH >= IMPASS_DH;                       // shouldn't happen; escape if it does
        const fx = field.fx ? field.fx[i] : 0, fz = field.fz ? field.fz[i] : 0;
        const len = Math.hypot(fx, fz);
        const block = (x, z) => this.blockedFrom(hereH, x, z);

        if (!onWall && len > 1e-3) {
            const dx = (fx / len) * step, dz = (fz / len) * step;
            if (!block(agent.x + dx, agent.z + dz)) { agent.x += dx; agent.z += dz; return "walking"; }
            if (Math.abs(dx) > step * 0.02 && !block(agent.x + dx, agent.z)) { agent.x += dx; return "sliding-x"; }
            if (Math.abs(dz) > step * 0.02 && !block(agent.x, agent.z + dz)) { agent.z += dz; return "sliding-z"; }
        }
        const nb = this.routeNeighbour(gx, gy, field);
        if (!nb) return (len > 1e-3) ? "boxed-in" : "unreachable";
        const c = this.cellCenter(nb.gx, nb.gy);
        let ax = c.x - agent.x, az = c.z - agent.z; const al = Math.hypot(ax, az) || 1;
        ax = (ax / al) * step; az = (az / al) * step;
        if (onWall || !block(agent.x + ax, agent.z + az)) { agent.x += ax; agent.z += az; }
        else if (Math.abs(ax) > 1e-6 && !block(agent.x + ax, agent.z)) { agent.x += ax; }
        else if (Math.abs(az) > 1e-6 && !block(agent.x, agent.z + az)) { agent.z += az; }
        return "routing";
    }

    spawnAgent() { const c = this.cellCenter(this.spawn.gx, this.spawn.gy); return { x: c.x, z: c.z }; }
}
