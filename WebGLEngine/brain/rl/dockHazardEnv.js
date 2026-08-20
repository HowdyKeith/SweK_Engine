// brain/rl/dockHazardEnv.js -- the docking task, hardened: the target now DRIFTS (the policy must lead a moving
// dock) and the lane is strewn with ASTEROIDS the ship has to fly around. Same drop-in env interface as dockEnv,
// but a wider observation (8 floats) that adds the nearest hazard and makes the velocity channels RELATIVE to the
// target so a moving dock reads correctly. This is where the two systems meet: the hazard field is the same kind
// of obstacle the esHullCombat asteroids are, so a policy trained here transfers to docking amid real combat debris.
//
// obs (ship-frame, 8): [ relForward, relRight, relVelForward, relVelRight, dist, hazForward, hazRight, hazDist ]
// action (2 in [-1,1]): [ turn, thrust ]. A hazard hit is penalized and flagged (info.crashed) but not fatal, so
// the policy learns to avoid rather than freeze.
"use strict";

const OBS_DIM = 8, ACT_DIM = 2;
const S = 900, V = 320, TURN = 3.2, ACCEL = 340, DOCK_R = 85, DOCK_V = 100;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class DockHazardEnv {
    constructor(opts = {}) { this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.dt = opts.dt || 1 / 30; this.maxSteps = opts.maxSteps || 240; this.nHaz = opts.hazards != null ? opts.hazards : 4; this._rng = mulberry32(opts.seed || 1); }
    reset(seed) {
        if (seed != null) this._rng = mulberry32(seed);
        const r = this._rng;
        this.x = 0; this.y = 0; this.h = r() * Math.PI * 2; this.vx = (r() - 0.5) * 120; this.vy = (r() - 0.5) * 120;
        const ang = r() * Math.PI * 2, dst = 320 + r() * 460; this.tx = Math.cos(ang) * dst; this.ty = Math.sin(ang) * dst;
        const tsp = 12 + r() * 26, tdir = r() * Math.PI * 2; this.tvx = Math.cos(tdir) * tsp; this.tvy = Math.sin(tdir) * tsp;   // target drifts (catchable)
        // scatter asteroids roughly between ship and target, none right on the start or the dock
        this.haz = [];
        for (let k = 0; k < this.nHaz; k++) { let hx, hy, tries = 0; do { hx = (r() - 0.2) * this.tx + (r() - 0.5) * 260; hy = (r() - 0.2) * this.ty + (r() - 0.5) * 260; tries++; } while (tries < 8 && (Math.hypot(hx, hy) < 120 || Math.hypot(hx - this.tx, hy - this.ty) < 120)); this.haz.push({ x: hx, y: hy, r: 46 + r() * 30 }); }
        this.step_ = 0; this._prevDist = Math.hypot(this.tx - this.x, this.ty - this.y);
        return this._obs();
    }
    _nearestHaz() { let best = null, bd = Infinity; for (const a of this.haz) { const d = Math.hypot(a.x - this.x, a.y - this.y) - a.r; if (d < bd) { bd = d; best = a; } } return best; }
    _obs() {
        const fx = Math.cos(this.h), fy = Math.sin(this.h), rx = -fy, ry = fx;
        const dx = this.tx - this.x, dy = this.ty - this.y;
        const rvx = this.vx - this.tvx, rvy = this.vy - this.tvy;   // velocity relative to the (moving) target
        const relF = dx * fx + dy * fy, relR = dx * rx + dy * ry, velF = rvx * fx + rvy * fy, velR = rvx * rx + rvy * ry;
        const dist = Math.hypot(dx, dy);
        const hz = this._nearestHaz(); let hF = 0, hR = 0, hD = 1;
        if (hz) { const hx = hz.x - this.x, hy = hz.y - this.y; hF = (hx * fx + hy * fy) / S; hR = (hx * rx + hy * ry) / S; hD = Math.max(0, (Math.hypot(hx, hy) - hz.r)) / S; }
        return new Float32Array([relF / S, relR / S, velF / V, velR / V, dist / S, hF, hR, Math.min(1, hD)]);
    }
    step(action) {
        const turn = Math.max(-1, Math.min(1, action[0])), thrust = (Math.max(-1, Math.min(1, action[1])) + 1) * 0.5;
        this.h += turn * TURN * this.dt;
        this.vx += Math.cos(this.h) * thrust * ACCEL * this.dt; this.vy += Math.sin(this.h) * thrust * ACCEL * this.dt;
        this.x += this.vx * this.dt; this.y += this.vy * this.dt;
        this.tx += this.tvx * this.dt; this.ty += this.tvy * this.dt;   // target keeps drifting
        this.step_++;
        const dist = Math.hypot(this.tx - this.x, this.ty - this.y), speed = Math.hypot(this.vx - this.tvx, this.vy - this.tvy);
        // crash test against asteroids
        let crashed = false; for (const a of this.haz) if (Math.hypot(a.x - this.x, a.y - this.y) < a.r + 12) { crashed = true; break; }
        const docked = dist < DOCK_R && speed < DOCK_V;
        let reward = (this._prevDist - dist) / V;
        if (dist < 160) reward += 0.05 * (1 - Math.min(1, speed / V)) * (1 - dist / 160);   // guide the final dock: close AND slow
        if (crashed) reward -= 0.3;                 // avoid, don't freeze
        if (docked) reward += 5;
        this._prevDist = dist;
        const done = docked || this.step_ >= this.maxSteps;
        return { obs: this._obs(), reward, done, info: { dist, speed, docked, crashed } };
    }
}

export { DockHazardEnv, OBS_DIM, ACT_DIM, DOCK_R, DOCK_V, S, V };
if (typeof module !== "undefined" && module.exports) module.exports = { DockHazardEnv, OBS_DIM, ACT_DIM, DOCK_R, DOCK_V, S, V };
