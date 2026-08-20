// brain/rl/occludedHuntEnv.js -- a hunt where the target hides behind an ASTEROID. When the asteroid sits on the
// line between hunter and target, the target's observation is BLANKED (target fields -> 0, a visibility bit -> 0) --
// the hunter has lost line of sight. A reflex policy sees the target vanish and drifts; a MemoryPolicy that saw the
// target's heading before it disappeared can carry that in its memory pages and keep leading it, reacquiring on the
// far side. This is the concrete combat payoff of memory: tracking a target through cover.
//
// obs (8): the 7 shared-encoder floats + a visibility bit (1 = target in sight, 0 = occluded). action [turn, thrust].
"use strict";

import { encodeFlightObs, S, V } from "./sharedEncoder.js";

const TURN = 3.2, ACCEL = 340, CATCH_R = 60, TGT_SPEED = 120;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class OccludedHuntEnv {
    // v2854 -- opts.evade turns the target WHILE IT IS HIDDEN. Default 0, so every existing gate is untouched.
    //
    // WHY: v2851's taxonomy measured lostInBlackout at 0% for BOTH policies -- neither ever loses its track while
    // the target is hidden, so the task never asked memory the question it was built to ask. The reason is the
    // target: it crosses at CONSTANT VELOCITY in a straight line, and a straight line does not need remembering,
    // it needs extrapolating. A reflex policy keeps flying its current intercept and arrives correctly.
    //
    // A HEADING CHANGE DURING THE BLACKOUT IS THE ONE THING THAT BREAKS EXTRAPOLATION. Remembering where the
    // target WAS is then strictly better than assuming where it WOULD have been -- which is the only condition
    // under which memory can earn its keep here.
    constructor(opts = {}) { this.obsDim = 8; this.actDim = 2; this.dt = opts.dt || 1 / 30; this.maxSteps = opts.maxSteps || 170; this._rng = mulberry32(opts.seed || 1); this.astR = opts.astR || 150; this.evade = opts.evade || 0; this._turned = false; }
    reset(seed) {
        if (seed != null) this._rng = mulberry32(seed);
        const r = this._rng;
        this.x = 0; this.y = 0; this.h = r() * Math.PI * 2; this.vx = 0; this.vy = 0;
        // target starts off to one side, crosses the field at constant velocity
        const side = r() < 0.5 ? -1 : 1; this.tx = side * (420 + r() * 160); this.ty = (r() - 0.5) * 500;
        const tdir = Math.atan2((r() - 0.5) * 200 - this.ty, -side * 500 - this.tx); this.tvx = Math.cos(tdir) * TGT_SPEED; this.tvy = Math.sin(tdir) * TGT_SPEED;
        // asteroid sits between the hunter and the target's path so the target passes behind it
        this.ax = side * 210 + (r() - 0.5) * 80; this.ay = (r() - 0.5) * 160;
        this.step_ = 0; this._prevDist = Math.hypot(this.tx - this.x, this.ty - this.y); this._turned = false;
        return this._obs();
    }
    _occluded() {
        // target is hidden if the asteroid lies near the hunter->target segment, between them
        const dx = this.tx - this.x, dy = this.ty - this.y, len2 = dx * dx + dy * dy || 1;
        let t = ((this.ax - this.x) * dx + (this.ay - this.y) * dy) / len2;
        if (t < 0.05 || t > 0.98) return false;                 // asteroid not between them
        const px = this.x + t * dx, py = this.y + t * dy;
        return Math.hypot(this.ax - px, this.ay - py) < this.astR;
    }
    _obs() {
        const vis = this._occluded() ? 0 : 1;
        if (!vis) return new Float32Array([0, 0, (this.vx * Math.cos(this.h) + this.vy * Math.sin(this.h)) / V, (this.vx * -Math.sin(this.h) + this.vy * Math.cos(this.h)) / V, 0, 0, 0, 0]);
        const e = encodeFlightObs({ x: this.x, y: this.y, h: this.h, vx: this.vx, vy: this.vy }, { x: this.tx, y: this.ty, vx: this.tvx, vy: this.tvy });
        return new Float32Array([e[0], e[1], e[2], e[3], e[4], e[5], e[6], 1]);
    }
    step(action) {
        const turn = Math.max(-1, Math.min(1, action[0])), thrust = (Math.max(-1, Math.min(1, action[1])) + 1) * 0.5;
        this.h += turn * TURN * this.dt;
        this.vx += Math.cos(this.h) * thrust * ACCEL * this.dt; this.vy += Math.sin(this.h) * thrust * ACCEL * this.dt;
        this.x += this.vx * this.dt; this.y += this.vy * this.dt;
        // v2854 -- the evasive turn, taken ONCE, the first time the target is genuinely hidden. Once only: a
        // target that jinks every frame is unpredictable rather than memorable, and would punish memory as much
        // as reflex. One turn while out of sight is exactly the case memory should win.
        if (this.evade > 0 && !this._turned && this._occluded()) {
            const a = Math.atan2(this.tvy, this.tvx) + this.evade * (this._rng() < 0.5 ? -1 : 1);
            this.tvx = Math.cos(a) * TGT_SPEED; this.tvy = Math.sin(a) * TGT_SPEED;
            this._turned = true;
        }
        this.tx += this.tvx * this.dt; this.ty += this.tvy * this.dt; this.step_++;
        const dist = Math.hypot(this.tx - this.x, this.ty - this.y), caught = dist < CATCH_R;
        let reward = (this._prevDist - dist) / V; if (caught) reward += 5; this._prevDist = dist;
        const done = caught || this.step_ >= this.maxSteps;
        return { obs: this._obs(), reward, done, info: { dist, docked: caught, caught, occluded: this._occluded() } };
    }
}

export { OccludedHuntEnv, CATCH_R };
if (typeof module !== "undefined" && module.exports) module.exports = { OccludedHuntEnv, CATCH_R };
