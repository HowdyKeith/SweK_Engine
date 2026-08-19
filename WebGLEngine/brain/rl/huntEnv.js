// brain/rl/huntEnv.js -- a HUNTING environment on the shared flight encoder. Same drop-in interface as dockEnv, but
// the target MOVES, and how it moves is a parameter so ONE env gives a family of tasks that all share the encoder +
// action, which is exactly what makes a policy transfer between them:
//   mode 'flee'   -> target wanders and bolts away when the hunter closes  (the hunt)
//   mode 'cross'  -> target holds a constant velocity across the field      (intercept: you must lead it)
//   mode 'static' -> target sits still                                       (a dock-like approach)
// obs = encodeFlightObs (7, ship-frame incl. target velocity); action = [turn, thrust]; caught when close.
"use strict";

import { encodeFlightObs, SHARED_OBS_DIM, ACT_DIM, S, V } from "./sharedEncoder.js";

const TURN = 3.2, ACCEL = 340, CATCH_R = 60, TGT_SPEED = 120, FLEE_R = 260;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class HuntEnv {
    constructor(opts = {}) { this.obsDim = SHARED_OBS_DIM; this.actDim = ACT_DIM; this.dt = opts.dt || 1 / 30; this.maxSteps = opts.maxSteps || 220; this.mode = opts.mode || "flee"; this._rng = mulberry32(opts.seed || 1); }
    reset(seed) {
        if (seed != null) this._rng = mulberry32(seed);
        const r = this._rng;
        this.x = 0; this.y = 0; this.h = r() * Math.PI * 2; this.vx = (r() - 0.5) * 120; this.vy = (r() - 0.5) * 120;
        const ang = r() * Math.PI * 2, dst = 300 + r() * 460; this.tx = Math.cos(ang) * dst; this.ty = Math.sin(ang) * dst;
        const tdir = r() * Math.PI * 2; this.tvx = this.mode === "static" ? 0 : Math.cos(tdir) * TGT_SPEED; this.tvy = this.mode === "static" ? 0 : Math.sin(tdir) * TGT_SPEED;
        this._th = tdir; this.step_ = 0; this._prevDist = Math.hypot(this.tx - this.x, this.ty - this.y);
        return this._obs();
    }
    _obs() { return encodeFlightObs({ x: this.x, y: this.y, h: this.h, vx: this.vx, vy: this.vy }, { x: this.tx, y: this.ty, vx: this.tvx, vy: this.tvy }); }
    _moveTarget(r) {
        if (this.mode === "static") return;
        if (this.mode === "cross") { this.tx += this.tvx * this.dt; this.ty += this.tvy * this.dt; return; }
        // flee: wander, and bolt directly away when the hunter is close
        this._th += (r() - 0.5) * 0.5;
        const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy) || 1;
        let ax = Math.cos(this._th), ay = Math.sin(this._th);
        if (d < FLEE_R) { ax = ax * 0.3 + (dx / d) * 1.2; ay = ay * 0.3 + (dy / d) * 1.2; }
        const al = Math.hypot(ax, ay) || 1; this.tvx = ax / al * TGT_SPEED; this.tvy = ay / al * TGT_SPEED;
        this.tx += this.tvx * this.dt; this.ty += this.tvy * this.dt;
        const R = 900; this.tx = Math.max(-R, Math.min(R, this.tx)); this.ty = Math.max(-R, Math.min(R, this.ty));   // keep on the field
    }
    step(action) {
        const turn = Math.max(-1, Math.min(1, action[0])), thrust = (Math.max(-1, Math.min(1, action[1])) + 1) * 0.5;
        this.h += turn * TURN * this.dt;
        this.vx += Math.cos(this.h) * thrust * ACCEL * this.dt; this.vy += Math.sin(this.h) * thrust * ACCEL * this.dt;
        this.x += this.vx * this.dt; this.y += this.vy * this.dt;
        this._moveTarget(this._rng); this.step_++;
        const dist = Math.hypot(this.tx - this.x, this.ty - this.y), speed = Math.hypot(this.vx, this.vy);
        const caught = dist < CATCH_R;
        let reward = (this._prevDist - dist) / V; if (caught) reward += 5;
        this._prevDist = dist;
        const done = caught || this.step_ >= this.maxSteps;
        return { obs: this._obs(), reward, done, info: { dist, speed, docked: caught, caught } };
    }
}

export { HuntEnv, CATCH_R };
if (typeof module !== "undefined" && module.exports) module.exports = { HuntEnv, CATCH_R };
