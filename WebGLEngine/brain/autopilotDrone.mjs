// WebGLEngine/brain/autopilotDrone.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HAND-WRITTEN PILOT FOR THE QUADROTOR: fly to a point, hover, climb, turn, land, recover from an upset, and bring the machine down when a motor quits -- in the pilot's senses (physics/mechanics/multirotorModel6dof.mjs), from four numbers out: thrust, pitch, roll, yaw.
// It is the baseline the learned pilots (the fruit fly's network, the GPU Brain's) are graded against and, written through a network (brain/pilotRotorPolicy.mjs's way: the laws as a sum of features), the START they are trained from. FLIGHT ONLY: nothing here aims at anything.
//
// IT IS A CASCADE OF LOOPS, AND NO LOOP HAS MEMORY (no integrator, no state: the pilot is a pure function of what the quadrotor is doing now, so it is exactly the thing a network can be). guidance() is everything that is not a sum (the rotations into the nose's frame, the modes);
// lawsFrom() is a sum of features through gains and clamps, which is what a network's output layer is. THE GAINS ARE DERIVED FROM THE AIRFRAME, NOT TUNED: the authority of each axis (the angular acceleration a unit of the control gives, worked out from the mixer, the thrust and the arm) sets the gain for a
// closed loop of a chosen natural frequency and damping:
//   POSITION -> VELOCITY    vCmd = the point's direction x min(speed, kPos x distance, sqrt(2 x brake x distance))   (a straight approach that stops AT the point; or the velocity asked for; or 0: a hover)
//   VELOCITY -> TILT        the acceleration asked = kVel x (velocity error), the tilt for it atan(a / g): pitch attitude asked = -atan(a_forward / g), bank asked = +atan(a_right / g), each held to the tilt limit (0.45 rad at height, 0.15 within a metre of the ground)
//   TILT -> TORQUE          roll = kTheta (bank error) - kQ roll rate; pitch = kTheta (pitch error) - kQ pitch rate, with kTheta = wn^2 / alpha and kQ = 2 zeta wn / alpha: wn = 14 rad/s, zeta = 0.8, alpha the angular acceleration a unit of the control gives (110.9 rad/s^2)
//   ALTITUDE -> CLIMB RATE  vsCmd = clamp(kAlt x height error, -3, +4 m/s)
//   CLIMB -> THRUST         thrust = (the hover's command x 1 / (cos bank x cos pitch), so a tilted machine holds the same lift) + kVs (vsCmd - climb), kVs = 0.17 (a 4 rad/s climb loop: the thrust gives 23.5 m/s^2 a unit)
//   HEADING -> YAW          yawRateCmd = clamp(kHdg x heading error, +-1.5 rad/s); yaw = kYaw (yawRateCmd - yaw rate), kYaw = 1.16 (a 3 rad/s yaw-rate loop: the yaw authority is 2.58 rad/s^2 a unit)
// There is no integrator, so a hover in a wind drifts a little (a wind of 6 m/s tilts the machine until the velocity error pays for the drag), and the pilot reads the ground velocity, not the air's.
//
// A MOTOR QUITTING. The pilot is told which motor (the annunciator: `state.health`), and does the one thing a pilot without the research literature does: it gives up the yaw (the three motors left cannot hold it, and a command of yaw would only waste the little authority they have), asks for no
// translation, keeps the machine level with the loops above, multiplies the thrust by 4/3 (three motors give three quarters of the lift) and comes down at a descent rate of half the height over the ground (0.8 to 3 m/s). MEASURED (brain/autopilotDrone-selfcheck.mjs): see its section on the failed motor -- it
// is the quadrotor's counterpart to the helicopter's dead man's curve, a corner that is pinned as what the hand pilot does and left for the LEARNED pilots to be tried on; nothing here claims to solve it.
//
// What it does not do: know the wind, avoid anything (there is no terrain in this task: the ground is flat at 0), see a gust coming, land on a slope, plan a path, or fly with a motor out as the literature does (a yaw-sacrificing controller that hovers while spinning).
//
// Pure: no DOM, no clock, no random.
"use strict";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";

export const AUTOPILOT_DRONE = Object.freeze({
    wn: 14, zeta: 0.8, kVel: 1.5, maxTilt: 0.45, tiltLow: 0.15, kPos: 0.6, speed: 8, brake: 2.5,
    kAlt: 1.0, vsUp: 4, vsDown: 3, kVs: 0.17,
    kHdg: 1.0, rMax: 1.5, kYaw: 1.16,
    landRate: 0.4, landMin: 0.3, landMax: 2.0, idle: 0, groundEps: 0.08,
    outRate: 0.5, outMin: 0.8, outMax: 3, outTilt: 0.2, floor: 0.3,
});
export const TARGET_DEFAULT = Object.freeze({});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- the trim and the authority: what the model's hover wants and what each control gives, computed once per model ------------------------------------------------------------------------------------------------
const TRIMS = new WeakMap();
/** { thrust (the hover's command), dAccPerThrust (the vertical acceleration a unit of thrust gives, m/s^2), alphaRoll, alphaPitch, alphaYaw (rad/s^2 a unit of the control gives), legDrop (the legs' depth under the centre) } for a multirotor model. */
export function trimOf(model) {
    let t = TRIMS.get(model);
    if (!t) {
        const s = model.spec, r = s.rotor, d = Math.abs(s.motors[0].pos[0]);
        TRIMS.set(model, t = Object.freeze({
            thrust: Q.hoverTrim(model).thrust, dAccPerThrust: 4 * model.thrustMax / model.mass,
            alphaRoll: 4 * s.mix.roll * model.thrustMax * d / s.inertia[0], alphaPitch: 4 * s.mix.pitch * model.thrustMax * d / s.inertia[1], alphaYaw: 4 * s.mix.yaw * r.qOverT * model.thrustMax / s.inertia[2],
            legDrop: -Math.min(...s.legs.map((p) => p[2])),
        }));
    }
    return t;
}
let DEFAULT_MODEL = null;
/** The default airframe's model (the 1.6 kg QUAD), built once. */
export const defaultModel = () => DEFAULT_MODEL || (DEFAULT_MODEL = Q.createMultirotorModel());

/** The attitude loop's gains for an axis of angular authority `alpha`: { kTheta, kQ }. */
export const attitudeGains = (alpha, g = AUTOPILOT_DRONE) => ({ kTheta: g.wn * g.wn / alpha, kQ: 2 * g.zeta * g.wn / alpha });

/**
 * Everything the laws use, computed once. A learned pilot's features are these, so the hand weights and the hand controller read one set of numbers.
 * `target` is { pos: [x, y] (go there and hover), velocity: [vx, vy] (world; used if there is no pos), speed (the most it will fly, m/s), altitude (world height of the centre), heading, land };
 * `opts` may hold { model } and any gain.
 */
export function guidance(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_DRONE, ...opts }, model = opts.model || defaultModel(), T = trimOf(model);
    const a = Q.attitude(state, wind), r = Q.rates(state), pos = state.pos, h = a.heading, climb = state.vel[2], G = Q.GRAVITY;
    const fwd = [Math.cos(h), -Math.sin(h)], right = [-Math.sin(h), -Math.cos(h)], cosTilt = clamp(a.up[2], 0.2, 1);
    const agl = pos[2] - T.legDrop * cosTilt, land = !!target.land;
    const working = state.health.filter((x) => x >= 0.5).length, motorOut = working < 4;
    // ---- where to go
    let vCmd = [0, 0], ePosF = 0, ePosR = 0;
    const speedCap = Math.max(0, fin(target.speed ?? g.speed));
    if (target.pos) { const ex = fin(target.pos[0] - pos[0]), ey = fin(target.pos[1] - pos[1]); ePosF = ex * fwd[0] + ey * fwd[1]; ePosR = ex * right[0] + ey * right[1]; }   // where the point is, in the nose's frame (the learned pilots read it; the loops below do not)
    if (!motorOut) {
        if (target.pos) {
            const ex = target.pos[0] - pos[0], ey = target.pos[1] - pos[1], d = Math.hypot(ex, ey);
            if (d > 0.05) { const m = Math.min(speedCap, g.kPos * d, Math.sqrt(2 * g.brake * d)); vCmd = [ex / d * m, ey / d * m]; }
        } else if (target.velocity) vCmd = [fin(target.velocity[0]), fin(target.velocity[1])];
    }
    const vMag = Math.hypot(vCmd[0], vCmd[1]);
    // ---- the height asked for
    const userZ = target.altitude != null ? fin(target.altitude) : pos[2];
    const zCmd = land ? userZ : Math.max(userZ, T.legDrop + g.floor);
    // ---- the loops' commands
    const ev = [vCmd[0] - state.vel[0], vCmd[1] - state.vel[1]], evF = ev[0] * fwd[0] + ev[1] * fwd[1], evR = ev[0] * right[0] + ev[1] * right[1];
    const tiltMax = motorOut ? g.outTilt : clamp(g.tiltLow + (g.maxTilt - g.tiltLow) * (agl - 1) / 2, g.tiltLow, g.maxTilt);
    const onGround = (land || motorOut) && agl < g.groundEps && climb > -0.8;   // the legs on the ground and the pilot meaning to be there: level, thrust at idle
    const pitchCmd = onGround ? 0 : -clamp(Math.atan(g.kVel * evF / G), -tiltMax, tiltMax), bankCmd = onGround ? 0 : clamp(Math.atan(g.kVel * evR / G), -tiltMax, tiltMax);
    let vsCmd = land ? -clamp(g.landRate * agl, g.landMin, g.landMax) : clamp(g.kAlt * (zCmd - pos[2]), -g.vsDown, g.vsUp);
    if (motorOut) vsCmd = -clamp(g.outRate * agl, g.outMin, g.outMax);
    const headingCmd = target.heading != null ? fin(target.heading) : h;
    const headingErr = wrapAngle(headingCmd - h), yawRateCmd = motorOut ? 0 : clamp(g.kHdg * headingErr, -g.rMax, g.rMax);
    const invCos = clamp(1 / cosTilt - 1, 0, 1.5);   // up[2] is the cosine of the whole tilt, pitch and bank together: the thrust that holds the same lift is the hover's over it
    const thrustFF = onGround ? g.idle : T.thrust * (4 / Math.max(working, 1)) * (1 + invCos);
    const climbErr = onGround ? 0 : vsCmd - climb;
    return {
        att: a, rates: r, climb, agl, land, motorOut, working, vCmd, vMag, zCmd, tiltMax,
        pitchErr: pitchCmd - a.pitch, bankErr: wrapAngle(bankCmd - a.bank), climbErr, vsCmd, onGround, headingErr, yawRateCmd,
        yawRateErr: motorOut ? 0 : yawRateCmd - r.yaw, thrustFF, charge: Q.charge(model, state), ePosF, ePosR,
    };
}

/** The four controls from a guidance record, by the laws in the header. NaN-safe: a non-finite number is read as 0 by `fin`. */
export function lawsFrom(gd, opts = {}) {
    const g = { ...AUTOPILOT_DRONE, ...opts }, model = opts.model || defaultModel(), T = trimOf(model), r = gd.rates;
    const kp = attitudeGains(T.alphaPitch, g), kr = attitudeGains(T.alphaRoll, g);
    const pitch = kp.kTheta * gd.pitchErr - kp.kQ * r.pitch;
    const roll = kr.kTheta * gd.bankErr - kr.kQ * r.roll;
    const yaw = g.kYaw * gd.yawRateErr;
    const thrust = gd.thrustFF + g.kVs * gd.climbErr;
    return { thrust: clamp(fin(thrust), 0, 1), pitch: clamp(fin(pitch), -1, 1), roll: clamp(fin(roll), -1, 1), yaw: clamp(fin(yaw), -1, 1) };
}

/** state, target, wind -> { controls, guidance }: the pilot. */
export function decide(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const gd = guidance(state, target, wind, opts);
    return { controls: lawsFrom(gd, opts), guidance: gd };
}
/** The pilot as a bare function (state, target, wind) -> controls. */
export const pilot = (state, target, wind, opts) => decide(state, target, wind, opts).controls;

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const m = defaultModel(), T = trimOf(m), s = Q.createState(m, { pos: [0, 0, 50] }), d = decide(s, { pos: [30, 0], altitude: 60, heading: 0.5 });
    const kp = attitudeGains(T.alphaPitch);
    return [
        "[autopilotDrone] hover, go-to, climb, turn, land, upset recovery and a gentle descent on a failed motor for multirotorModel6dof's quadrotor: a cascade of loops with no memory",
        `  hover thrust ${T.thrust.toFixed(4)}; authority ${T.alphaRoll.toFixed(1)} / ${T.alphaPitch.toFixed(1)} / ${T.alphaYaw.toFixed(2)} rad/s^2 a unit (roll / pitch / yaw); attitude gains kTheta ${kp.kTheta.toFixed(3)}, kQ ${kp.kQ.toFixed(3)}`,
        `  asked to go 30 m ahead, up 10 m and turn 29 degrees right from a hover: tilt asked ${(d.guidance.pitchErr * 180 / Math.PI).toFixed(1)} deg, climb asked ${d.guidance.vsCmd.toFixed(1)} m/s -> thrust ${d.controls.thrust.toFixed(3)} pitch ${d.controls.pitch.toFixed(3)} roll ${d.controls.roll.toFixed(3)} yaw ${d.controls.yaw.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
