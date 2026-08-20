// brain/rl/dockEnv.js -- a thruster-control DOCKING environment for the GPU Brain, same drop-in interface as
// rocketEnv (obsDim/actDim/reset/step). A ship flies on a box3d-style planar substrate: thrust along its facing,
// angular control, and NO drag -- space flight, so momentum and drift are real and the policy must anticipate and
// counter-thrust to arrive ON the target and SLOW (a dock), not just barrel into it. The physics here is a compact
// self-contained point-mass+heading model (a KinematicStub, exactly like rocketEnv's) so the learning loop runs
// headless; on a rig the same obs/action can drive an esBox3d ship for true rigid-body docking, unchanged.
//
// obs (ship-frame, 5 floats): [ relForward, relRight, velForward, velRight, dist ]  -- all normalized. Ship-frame
// so heading is implicit and the policy generalizes across approach angles.
// action (2 floats in [-1,1]): [ turn, thrust ]  (thrust mapped to [0,1]).
"use strict";

const OBS_DIM = 5, ACT_DIM = 2;
const S = 800;      // position scale (units)
const V = 300;      // velocity scale (units/s)
const TURN = 3.2;   // rad/s at full turn
const ACCEL = 340;  // units/s^2 at full thrust
const DOCK_R = 40;  // docked if within this distance...
const DOCK_V = 45;  // ...and below this speed

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

class DockEnv {
    constructor(opts = {}) { this.obsDim = OBS_DIM; this.actDim = ACT_DIM; this.dt = opts.dt || 1 / 30; this.maxSteps = opts.maxSteps || 200; this._rng = mulberry32(opts.seed || 1); }
    reset(seed) {
        if (seed != null) this._rng = mulberry32(seed);
        const r = this._rng;
        // ship near origin, target a random distance/bearing away, small random initial drift + heading
        this.x = 0; this.y = 0; this.h = r() * Math.PI * 2; this.vx = (r() - 0.5) * 120; this.vy = (r() - 0.5) * 120;
        const ang = r() * Math.PI * 2, dst = 250 + r() * 480; this.tx = Math.cos(ang) * dst; this.ty = Math.sin(ang) * dst;
        this.step_ = 0; this._prevDist = Math.hypot(this.tx - this.x, this.ty - this.y);
        return this._obs();
    }
    _obs() {
        const fx = Math.cos(this.h), fy = Math.sin(this.h), rx = -fy, ry = fx;   // forward + right unit vectors
        const dx = this.tx - this.x, dy = this.ty - this.y;
        const relF = dx * fx + dy * fy, relR = dx * rx + dy * ry, velF = this.vx * fx + this.vy * fy, velR = this.vx * rx + this.vy * ry;
        const dist = Math.hypot(dx, dy);
        return new Float32Array([relF / S, relR / S, velF / V, velR / V, dist / S]);
    }
    step(action) {
        const turn = Math.max(-1, Math.min(1, action[0])), thrust = (Math.max(-1, Math.min(1, action[1])) + 1) * 0.5;
        this.h += turn * TURN * this.dt;
        this.vx += Math.cos(this.h) * thrust * ACCEL * this.dt; this.vy += Math.sin(this.h) * thrust * ACCEL * this.dt;
        this.x += this.vx * this.dt; this.y += this.vy * this.dt;
        this.step_++;
        const dist = Math.hypot(this.tx - this.x, this.ty - this.y), speed = Math.hypot(this.vx, this.vy);
        const docked = dist < DOCK_R && speed < DOCK_V;
        // shaped reward: progress toward target, a penalty for speed once close (so it arrives slow), dock bonus
        let reward = (this._prevDist - dist) / V;
        if (dist < 120) reward -= 0.02 * (speed / V);
        if (docked) reward += 4;
        this._prevDist = dist;
        const done = docked || this.step_ >= this.maxSteps;
        return { obs: this._obs(), reward, done, info: { dist, speed, docked } };
    }
}

export { DockEnv, OBS_DIM, ACT_DIM, DOCK_R, DOCK_V, S, V };
if (typeof module !== "undefined" && module.exports) module.exports = { DockEnv, OBS_DIM, ACT_DIM, DOCK_R, DOCK_V, S, V };
