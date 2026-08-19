// brain/rl/rocketEnv.js -- v2216 -- environment for the Rocket League RL spike.
//
// TWO backends behind ONE interface, the same drop-in discipline the field solvers use:
//   - KinematicStub  : a small, self-contained point-mass physics model (this file). It runs
//                      anywhere, needs no GPU and no game files, and exists to EXERCISE THE
//                      LOOP -- prove that a continuous-control head can be driven by a reward
//                      computed from a physics step and improve. It is NOT Rocket League
//                      physics; it has no car body, no aerial control, no ball spin. Treat
//                      its numbers as a wiring stand-in, exactly like the fake bzfs the BZFlag
//                      tests drive against.
//   - RocketSimBackend : the REAL physics (rocketsimBackend.js -> a rlgym_sim/RocketSim
//                      subprocess). Same interface, so the policy and the loop cannot tell
//                      which one they hold. That is the whole point: develop and test the
//                      head + loop here, swap in ground-truth physics on the rig, nothing
//                      else changes.
//
// Interface (both backends honour it):
//   env.obsDim, env.actDim
//   env.reset(seed?)            -> Float32Array obs   (length OBS_DIM)
//   env.step(action)            -> { obs, reward, done, info }
//
// The obs layout is fixed by rocketPolicy.js (20 floats). The RocketSim bridge builds the
// SAME 20 floats from rlgym's GameState so the two are interchangeable.

import { OBS_DIM, ACT_DIM } from "./rocketPolicy.js";

// --- Rocket League-ish constants (uu = unreal units), approximate on purpose --------------
const FIELD_X = 4096;      // side walls at +/-X
const FIELD_Y = 5120;      // back walls / goal line at +/-Y  (we attack +Y)
const CEIL    = 2044;
const GOAL_HALF_W = 892;   // goal mouth half-width
const GOAL_H      = 642;   // goal height
const GRAV    = 650;       // uu/s^2 down
const CAR_Z   = 17;        // resting car height
const BALL_R  = 92.75;
const CAR_R   = 150;       // collision radius (car as a fat point)
const MAX_CAR_V = 2300;
const BOOST_ACC = 991.6;   // boost accel
const THROT_ACC = 1600;    // ground throttle accel (approx, incl. drive force)
const YAW_RATE  = 3.2;     // rad/s at speed (steer)
const JUMP_V    = 580;     // jump impulse
const BALL_REST = 0.6;     // ground/wall restitution
const DT        = 1 / 15;  // 15 Hz decisions (RL 120Hz with tick-skip 8)

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// A tiny seeded PRNG so an episode is reproducible for ES evaluation.
function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad); t = Math.imul(t ^ (t >>> 15), 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}

export class KinematicStub {
    constructor(opts = {}) {
        this.obsDim = OBS_DIM;
        this.actDim = ACT_DIM;
        this.maxSteps = opts.maxSteps || 300;   // ~20 s at 15 Hz
        this.backend = "kinematic-stub";
        this._reset(opts.seed ?? 1);
    }

    _reset(seed) {
        const r = rng(seed);
        this.t = 0;
        // ball near centre with a small random nudge
        this.ball = { x: (r() * 2 - 1) * 400, y: (r() * 2 - 1) * 400, z: BALL_R + 200,
                      vx: (r() * 2 - 1) * 200, vy: (r() * 2 - 1) * 200, vz: 0 };
        // car spawns on our half (-Y), facing the ball roughly
        this.car = { x: (r() * 2 - 1) * 2000, y: -2500 - r() * 1500, z: CAR_Z,
                     vx: 0, vy: 0, vz: 0, yaw: Math.PI / 2, boost: 0.34 };
        this.prevTouch = false;
        return this.obs();
    }

    reset(seed) { return this._reset(seed ?? ((Math.random() * 1e9) | 0)); }

    obs() {
        const b = this.ball, c = this.car;
        const nx = 1 / FIELD_X, ny = 1 / FIELD_Y, nz = 1 / CEIL, nv = 1 / MAX_CAR_V;
        const out = new Float32Array(OBS_DIM);
        out[0] = clamp(b.x * nx, -2, 2); out[1] = clamp(b.y * ny, -2, 2); out[2] = clamp(b.z * nz, 0, 2);
        out[3] = clamp(b.vx * nv, -3, 3); out[4] = clamp(b.vy * nv, -3, 3); out[5] = clamp(b.vz * nv, -3, 3);
        out[6] = clamp(c.x * nx, -2, 2); out[7] = clamp(c.y * ny, -2, 2); out[8] = clamp(c.z * nz, 0, 2);
        out[9] = clamp(c.vx * nv, -3, 3); out[10] = clamp(c.vy * nv, -3, 3); out[11] = clamp(c.vz * nv, -3, 3);
        out[12] = Math.cos(c.yaw); out[13] = Math.sin(c.yaw);
        out[14] = c.boost * 2 - 1;
        out[15] = clamp((b.x - c.x) * nx, -2, 2); out[16] = clamp((b.y - c.y) * ny, -2, 2); out[17] = clamp((b.z - c.z) * nz, -2, 2);
        out[18] = clamp((0 - b.x) * nx, -2, 2); out[19] = clamp((FIELD_Y - b.y) * ny, -2, 2);
        return out;
    }

    // action: Float32Array/Array length 8 in [-1,1]. throttle steer pitch yaw roll | jump boost handbrake
    step(action) {
        const c = this.car, b = this.ball;
        const throttle = clamp(action[0], -1, 1);
        const steer    = clamp(action[1], -1, 1);
        const jump     = action[5] > 0;
        const boost    = action[6] > 0 && c.boost > 0;
        // (pitch/yaw/roll/handbrake exist in the action so the head is the right shape; the
        // stub is a ground driver and does not model air control -- that is a RocketSim-only
        // capability, honestly not faked here.)

        const grounded = c.z <= CAR_Z + 1;

        // heading accel
        const hx = Math.cos(c.yaw), hy = Math.sin(c.yaw);
        let acc = throttle * THROT_ACC + (boost ? BOOST_ACC : 0);
        c.vx += hx * acc * DT; c.vy += hy * acc * DT;
        if (boost) c.boost = Math.max(0, c.boost - DT * 0.36);   // ~1/3 tank/sec

        // steering (scaled by planar speed, like a real car)
        const spd = Math.hypot(c.vx, c.vy);
        c.yaw += steer * YAW_RATE * DT * clamp(spd / MAX_CAR_V, 0.15, 1);

        // jump
        if (jump && grounded) c.vz += JUMP_V;

        // gravity + integrate car
        c.vz -= GRAV * DT;
        c.x += c.vx * DT; c.y += c.vy * DT; c.z += c.vz * DT;
        if (c.z <= CAR_Z) { c.z = CAR_Z; if (c.vz < 0) c.vz = 0; }
        // ground friction / drag when no throttle
        if (throttle === 0 && !boost) { c.vx *= 0.985; c.vy *= 0.985; }
        // clamp car in bounds
        c.x = clamp(c.x, -FIELD_X, FIELD_X); c.y = clamp(c.y, -FIELD_Y, FIELD_Y); c.z = clamp(c.z, CAR_Z, CEIL);
        const cspd = Math.hypot(c.vx, c.vy);
        if (cspd > MAX_CAR_V) { const s = MAX_CAR_V / cspd; c.vx *= s; c.vy *= s; }

        // --- ball physics ---
        b.vz -= GRAV * DT;
        b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
        // ground bounce
        if (b.z <= BALL_R) { b.z = BALL_R; b.vz = -b.vz * BALL_REST; b.vx *= 0.97; b.vy *= 0.97; }
        // ceiling
        if (b.z >= CEIL - BALL_R) { b.z = CEIL - BALL_R; b.vz = -Math.abs(b.vz) * BALL_REST; }
        // side walls
        if (b.x <= -FIELD_X + BALL_R) { b.x = -FIELD_X + BALL_R; b.vx = Math.abs(b.vx) * BALL_REST; }
        if (b.x >= FIELD_X - BALL_R)  { b.x = FIELD_X - BALL_R;  b.vx = -Math.abs(b.vx) * BALL_REST; }

        // --- car-ball collision (a push toward ball-from-car, scaled by closing speed) ---
        let touched = false;
        const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < BALL_R + CAR_R && d > 1e-3) {
            touched = true;
            const nxu = dx / d, nyu = dy / d, nzu = dz / d;
            const carSpeed = Math.hypot(c.vx, c.vy, c.vz);
            const push = 300 + carSpeed * 0.9;
            b.vx += nxu * push; b.vy += nyu * push; b.vz += nzu * push + 120;
            // separate so they don't stick
            const overlap = (BALL_R + CAR_R) - d;
            b.x += nxu * overlap; b.y += nyu * overlap; b.z += nzu * overlap;
        }

        // --- goal / timeout ---
        let done = false, scored = 0;   // +1 opponent goal, -1 own goal
        if (b.y > FIELD_Y - BALL_R) {
            if (Math.abs(b.x) < GOAL_HALF_W && b.z < GOAL_H) { scored = 1; done = true; }
            else { b.y = FIELD_Y - BALL_R; b.vy = -Math.abs(b.vy) * BALL_REST; }   // back wall bounce
        } else if (b.y < -FIELD_Y + BALL_R) {
            if (Math.abs(b.x) < GOAL_HALF_W && b.z < GOAL_H) { scored = -1; done = true; }
            else { b.y = -FIELD_Y + BALL_R; b.vy = Math.abs(b.vy) * BALL_REST; }
        }

        this.t++;
        if (this.t >= this.maxSteps) done = true;

        // --- reward: shaped toward scoring on +Y ---
        // 1) ball velocity toward the target goal (main dense signal)
        let reward = (b.vy / MAX_CAR_V) * 0.10;
        // 2) getting the car to the ball (help early learning find contact)
        const carBall = Math.hypot(dx, dy, dz);
        reward += -carBall / (FIELD_Y * 2) * 0.02;
        // 3) a touch is good; a first touch especially
        if (touched) reward += 0.05 + (this.prevTouch ? 0 : 0.05);
        // 4) terminal
        if (scored === 1) reward += 10;
        if (scored === -1) reward -= 10;
        // 5) small time cost so dawdling is punished
        reward -= 0.002;

        this.prevTouch = touched;
        return { obs: this.obs(), reward, done, info: { scored, touched, t: this.t } };
    }
}

// Factory: pick a backend. "stub" is built in; "rocketsim" lazy-loads the subprocess backend
// so this file (and the selfcheck) never depend on a runtime that can spawn a process.
export async function makeEnv(opts = {}) {
    const backend = opts.backend || "stub";
    if (backend === "stub" || backend === "kinematic") return new KinematicStub(opts);
    if (backend === "rocketsim") {
        const { RocketSimBackend } = await import("./rocketsimBackend.js");
        const env = new RocketSimBackend(opts);
        await env.start();
        return env;
    }
    throw new Error(`unknown env backend: ${backend}`);
}

export const ENV_CONSTS = { FIELD_X, FIELD_Y, CEIL, GOAL_HALF_W, GOAL_H, MAX_CAR_V, DT };
