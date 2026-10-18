// WebGLEngine/brain/autopilotRotor.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HAND-WRITTEN PILOT FOR THE HELICOPTER: fly to a point, hover, climb, land, keep off the ground, and bring the machine down when the engine quits -- in the pilot's senses (physics/mechanics/rotorcraftModel6dof.mjs), from four numbers out: collective, cyclic pitch, cyclic roll, pedal.
// It is the baseline the learned pilots (the fruit fly's network, the GPU Brain's) are graded against and, written through a network (brain/pilotFlightPolicy.mjs's way: the laws as a sum of features), the START they are trained from.
//
// IT IS A CASCADE OF LOOPS, AND NO LOOP HAS MEMORY (no integrator, no state: the pilot is a pure function of what the helicopter is doing now, so it is exactly the thing a network can be). guidance() is everything that is not a sum (the rotations into the nose's frame, the terrain, the modes);
// lawsFrom() is a sum of features through gains and clamps, which is what a network's output layer is:
//   POSITION -> VELOCITY    vCmd = the point's direction x min(speed, kPos x distance, sqrt(2 x brake x distance))   (a straight approach that stops AT the point; or the velocity asked for; or 0: a hover)
//   VELOCITY -> TILT        pitch attitude asked = -kVel x (forward velocity error), bank asked = kVel x (rightward error), each held to the tilt limit: 0.30 rad at height, 0.10 within 3 m of the ground (a rotor must not be tilted into the dirt)
//   TILT -> CYCLIC          pitch = trim + kTheta (attitude error) - kQ pitch rate;  roll = trim + kPhi (bank error) - kP roll rate     (the trim is the hover's: the disc leans a little against the tail rotor's sideways push)
//   ALTITUDE -> CLIMB RATE  vsCmd = clamp(kAlt x height error, -4, +5 m/s)
//   CLIMB -> COLLECTIVE     collective = (hover collective + the extra a tilted disc needs to hold the same lift) + kVs (vsCmd - climb)
//   HEADING -> PEDAL        yawRateCmd = clamp(kHdg x heading error, +-0.8 rad/s); pedal = trim + (the pedal a change of collective needs: -0.485 per unit, DERIVED from the model's rotor torque and tail arm, not tuned) + kYaw (yawRateCmd - yaw rate)
//                           The nose is turned into the direction of travel when there is more than 6 m/s and no heading was asked for.
// Without the pedal that goes with the collective a 30 m climb swung the nose 9.8 degrees and a takeoff 15.9; with it, 0.9 and 4.6. (The pilot reads the ground velocity, not the air's: a hover in a wind drifts a few metres, there being no integrator.)
//
// *** GROUND AVOIDANCE IS IN THE GUIDANCE, NOT IN THE LOOPS, AND IT IS WHY THIS PILOT CAN BE GIVEN A TERRAIN (`opts.terrain(x, y) -> height`; flat at 0 by default). *** The height asked for is never below the skids' height over the ground at the machine's own position plus `clearance`
// (5 m: the "floor"), and never below the floor of the ground AHEAD: the ground is sampled along the way it is going at 8, 15, 30, 50, 80, 120, 180, 260 and 360 m and the height asked for is raised to the highest floor. And a climb takes time, so the speed asked for is limited by what that costs: at each
// sample that is more than 2 m above the machine's height the speed may be no more than max(sqrt(2 x 1.2 x (d - 12 - 1 s of travel)) -- it can stop short of it -- , 0.6 x 5 x (d - 12 - 1 s of travel) / (the rise + 4) -- it can climb in time). A ridge across the way costs speed, then height, and the speed comes back as the
// machine climbs; a wall costs a stop short of it and a climb in the hover. THE PILOT PLANS ON 1.2 m/s^2 OF BRAKING AND THE MACHINE GIVES ABOUT 3: that margin is the safety of the look-ahead, and a wall closer than the machine's real stopping distance (a 150 m wall 60 m off at 24 m/s: 104 m inside it; the same wall 100 m off: cleared by 28 m)
// is not avoided. The clearances measured at 25 m/s, in the gate: ridges of 60, 120 and 200 m and walls of 40, 80 and 150 m all crossed with the skids never closer than 4.2 m (5 m asked); 100 s over rolling hills at 30 m: never closer than 18 m, never under 23.8 m/s.
// Landing (`land`) lifts the floor and descends on a profile, 0.3 of the height above the ground as a descent rate, never faster than 2 m/s and never slower than 0.25, and with the skids on the ground the collective goes to idle (0.15, zero blade pitch) and the machine is levelled.
//
// *** THE ENGINE QUITTING: AUTOROTATION. *** The pilot is told the engine is out (the annunciator, `state.engine`) or sees the rotor below 80% speed (the low-rotor horn). Then: the collective goes to the autorotation's (0.18, plus 0.1 per rad/s of rotor speed above the design: a rotor that is slow gets LESS collective, the descent drives it);
// the tail rotor is taken off (no engine, no torque for it to cancel: the pedal that brings its thrust to zero, +0.208); and the machine is flown at a glide of 28 m/s (nose down) that is SPENT on the way down -- 28 m/s above 60 m of height, 12 m/s at 8 m, linear between, with the attitude it may ask for held to 0.02 rad per metre above 2 m so that the
// nose is up in the flare and LEVEL at the touchdown. Below 25 m the collective is pulled to cushion the arrival with the energy in the rotor (a descent rate of 0.5 of the height as a rate, three times the gain), and kept until the sink is gone: cut at the first touch, the machine landed and then pitched its nose into the ground.
// MEASURED (brain/autopilotRotor-selfcheck.mjs): from 400 and 200 m at 0, 10, 20 and 30 m/s, from 100 m at 20 and 30 and from 60 m at 30 the first contact is a landing at 2.8..3.1 m/s of sink (the structure takes 4.5) and a run-on of about 15 m/s, and twelve seconds later it has not crashed; THE DEAD MAN'S CURVE IS REAL: from 30 m in a hover,
// 30 m at 10 m/s, 60 m in a hover, 20 m at 10 m/s and 45 m at 10 m/s no pilot lands this machine (the rotor's energy, 1.6 MJ, cannot arrest the descent in the height there is) and this one crashes each time, 'hard landing', at 7 to 15 m/s of sink. Those starts are a thing for the LEARNED pilots to be tried on.
//
// What it does not do: know the wind, fly an engine that quits PART-way, lose the tail rotor, land on a slope (the skids touch first), or see the terrain except as the function it is handed (a wall is a function that jumps, and a jump is seen only at the sample distances).
//
// Pure: no DOM, no clock, no random. `wind` is passed to the attitude reader (airspeed), not used by the loops.
"use strict";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";

export const AUTOPILOT_ROTOR = Object.freeze({
    kTheta: 4.0, kQ: 1.9, kPhi: 2.6, kP: 0.9,
    kVel: 0.045, maxTilt: 0.30, tiltLow: 0.10, kPos: 0.25, speed: 25, brake: 1.5,
    kAlt: 0.4, vsUp: 5, vsDown: 4, kVs: 0.12,
    kHdg: 1.2, rMax: 0.8, kYaw: 1.4, kCouple: 1,
    tiltAutoLow: 0, tiltAutoSlope: 0.02, cAuto: 0.18, cAutoMin: 0.1, cAutoMax: 0.6, landSpeed: 12, flareHeight: 60, flareLow: 8, cushionHeight: 25, kCush: 0.5, cushMin: 0.5, cushMax: 8, cushGain: 3,
    clearance: 5, brakeSafe: 1.2, margin: 12, lag: 1.0, buffer: 4, slack: 2, idle: 0.15, kOmega: 0.1, glide: 28,
});
export const TARGET_DEFAULT = Object.freeze({});
/** The distances (m) along the way the machine is going at which the ground is read. */
export const LOOKAHEAD = Object.freeze([8, 15, 30, 50, 80, 120, 180, 260, 360]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const flat = () => 0;

// ---- the trim: what the model's hover wants, computed once per model ----------------------------------------------------------------------------------------------------------------------------------------
const TRIMS = new WeakMap();
/** { collective, pitch, roll, yaw, pitchAttitude, bank (the hover trim), dTdc (the thrust per unit collective at the hover), skidDrop (the skids' depth below the centre of mass), tailOff (the pedal that brings the tail rotor's thrust to zero), pedalPerCollective (the pedal that cancels the torque a unit of collective adds) } for a rotor model, memoised. */
export function trimOf(model) {
    let t = TRIMS.get(model);
    if (!t) {
        const tr = H.hoverTrim(model), s = model.spec, vi = model.hover.inducedVelocity;
        const at = (c) => H.rotorThrust(model, { collective: c, omega: s.rotor.omega0, vc: 0, vxy: 0, vi });
        // the pedal that goes with a change of collective: the rotor's torque rises with it and the tail rotor must push the tail back harder (a LEFT pedal), by dQ/dc over the tail's arm over the tail force a unit of pedal gives
        const st = H.createState(model, {}), arm = -s.tail.position[0], dFdPedal = H.forcesAndMoments(model, st, { collective: tr.collective, yaw: 1 }).tail.force - H.forcesAndMoments(model, st, { collective: tr.collective, yaw: 0 }).tail.force;
        TRIMS.set(model, t = Object.freeze({ collective: tr.collective, pitch: tr.pitch, roll: tr.roll, yaw: tr.yaw, pitchAttitude: tr.pitchAttitude, bank: tr.bank, dTdc: (at(tr.collective + 0.05).thrust - at(tr.collective - 0.05).thrust) / 0.1,
            skidDrop: -Math.min(...s.skids.map((p) => p[2])), tailOff: -model.tailPitchRig / s.tail.pitchRange, pedalPerCollective: -((at(tr.collective + 0.05).torque - at(tr.collective - 0.05).torque) / 0.1) / (arm * dFdPedal) }));
    }
    return t;
}
let DEFAULT_MODEL = null;
/** The default airframe's rotor model (the ATTACK helicopter), built once. */
export const defaultModel = () => DEFAULT_MODEL || (DEFAULT_MODEL = H.createRotorModel());

/**
 * Everything the laws use, computed once. A learned pilot's features are these, so the hand weights and the hand controller read one set of numbers.
 * `target` is { pos: [x, y] (go there and hover), velocity: [vx, vy] (world; used if there is no pos), speed (the most it will fly, m/s), altitude (world height), agl (height of the skids above the ground; overrides altitude), heading, land };
 * `opts` may hold { model, terrain } and any gain.
 */
export function guidance(state, target = TARGET_DEFAULT, wind = [0, 0, 0], opts = {}) {
    const g = { ...AUTOPILOT_ROTOR, ...opts }, model = opts.model || defaultModel(), T = trimOf(model), terrain = opts.terrain || flat, R = model.spec.rotor;
    const a = H.attitude(state, wind), r = H.rates(state), pos = state.pos, h = a.heading, climb = state.vel[2];
    const fwd = [Math.cos(h), -Math.sin(h)], right = [-Math.sin(h), -Math.cos(h)], cosTilt = clamp(a.up[2], 0.2, 1);
    const ground = fin(terrain(pos[0], pos[1])), agl = pos[2] - T.skidDrop * cosTilt - ground, land = !!target.land;
    const engineOut = state.engine === "out" || state.omega < 0.8 * R.omega0;
    // ---- where to go
    let vCmd = [0, 0], speedCap = Math.max(0, fin(target.speed ?? g.speed));
    if (target.pos) {
        const ex = target.pos[0] - pos[0], ey = target.pos[1] - pos[1], d = Math.hypot(ex, ey);
        if (d > 0.3) { const m = Math.min(speedCap, g.kPos * d, Math.sqrt(2 * g.brake * d)); vCmd = [ex / d * m, ey / d * m]; }
    } else if (target.velocity) vCmd = [fin(target.velocity[0]), fin(target.velocity[1])];
    let vMag = Math.hypot(vCmd[0], vCmd[1]);
    if (engineOut) {   // the glide, then the speed spent on the way down: the flare is the forward speed running out as the ground comes up
        const vAuto = g.landSpeed + (g.glide - g.landSpeed) * clamp((agl - g.flareLow) / (g.flareHeight - g.flareLow), 0, 1);
        vCmd = [fwd[0] * vAuto, fwd[1] * vAuto]; vMag = vAuto;
    }
    // ---- the height asked for, and the floor under it
    const userZ = land ? ground + T.skidDrop : target.agl != null ? ground + T.skidDrop + fin(target.agl) : target.altitude != null ? fin(target.altitude) : pos[2];
    let zCmd = userZ, speedLimit = Infinity;
    if (!land) {
        const floorHere = ground + T.skidDrop + g.clearance;
        zCmd = Math.max(zCmd, floorHere);
        const vNow = Math.hypot(state.vel[0], state.vel[1]);
        if (vMag > 0.5) {
            const ux = vCmd[0] / vMag, uy = vCmd[1] / vMag;
            for (const d of LOOKAHEAD) {
                const floorAt = fin(terrain(pos[0] + ux * d, pos[1] + uy * d)) + T.skidDrop + g.clearance, need = floorAt - pos[2];
                if (floorAt > zCmd) zCmd = floorAt;
                if (need > g.slack) { const dEff = Math.max(0, d - g.lag * vNow - g.margin); speedLimit = Math.min(speedLimit, Math.max(Math.sqrt(2 * g.brakeSafe * dEff), 0.6 * g.vsUp * dEff / (need + g.buffer))); }
            }
        }
    }
    if (speedLimit < vMag) { const k = speedLimit / vMag; vCmd = [vCmd[0] * k, vCmd[1] * k]; vMag = speedLimit; }
    // ---- the loops' commands
    const ev = [vCmd[0] - state.vel[0], vCmd[1] - state.vel[1]], evF = ev[0] * fwd[0] + ev[1] * fwd[1], evR = ev[0] * right[0] + ev[1] * right[1];
    const tiltMax = engineOut ? clamp(g.tiltAutoLow + g.tiltAutoSlope * (agl - 2), g.tiltAutoLow, g.maxTilt) : clamp(g.tiltLow + (g.maxTilt - g.tiltLow) * (agl - 3) / 17, g.tiltLow, g.maxTilt);
    const onGround = (land || engineOut) && agl < 0.25 && climb > -0.8;   // skids on the ground and the pilot meaning to be there: level, collective at idle
    const pitchCmd = onGround ? 0 : T.pitchAttitude - clamp(g.kVel * evF, -tiltMax, tiltMax), bankCmd = onGround ? 0 : T.bank + clamp(g.kVel * evR, -tiltMax, tiltMax);
    let vsCmd = land ? -clamp(0.3 * agl, 0.25, 2.0) : clamp(g.kAlt * (zCmd - pos[2]), -g.vsDown, g.vsUp);
    let cushion = false;
    if (engineOut) { cushion = agl < g.cushionHeight; vsCmd = -clamp(g.kCush * agl, g.cushMin, g.cushMax); }
    const headingCmd = target.heading != null ? fin(target.heading) : vMag > 6 ? Math.atan2(-vCmd[1], vCmd[0]) : h;
    const headingErr = wrapAngle(headingCmd - h), yawRateCmd = clamp(g.kHdg * headingErr, -g.rMax, g.rMax);
    const invCos = clamp(1 / (cosTilt * Math.cos(clamp(a.pitch, -1.2, 1.2))) - 1, 0, 1.5);
    const collectiveFF = onGround ? g.idle : engineOut ? clamp(g.cAuto + g.kOmega * (state.omega - R.omega0), g.cAutoMin, g.cAutoMax) : T.collective + (model.weight / T.dTdc) * invCos;
    const climbErr = onGround || (engineOut && !cushion) ? 0 : (vsCmd - climb) * (cushion ? g.cushGain : 1);
    const collectiveCmd = clamp(collectiveFF + g.kVs * climbErr, 0, 1);
    return {
        att: a, rates: r, climb, agl, ground, engineOut, land, vCmd, vMag, zCmd, speedLimit, tiltMax,
        pitchErr: pitchCmd - a.pitch, bankErr: wrapAngle(bankCmd - a.bank), climbErr, vsCmd, onGround, cushion, headingErr, yawRateCmd, collectiveFF,
        omegaErr: state.omega - R.omega0, pitchTrim: T.pitch, rollTrim: T.roll, pedalFF: engineOut ? T.tailOff : onGround ? T.yaw : T.yaw + g.kCouple * T.pedalPerCollective * (collectiveCmd - T.collective),
    };
}

/** The four controls from a guidance record, by the laws in the header. NaN-safe: a non-finite number is read as 0 by `fin`. */
export function lawsFrom(gd, opts = {}) {
    const g = { ...AUTOPILOT_ROTOR, ...opts }, r = gd.rates;
    const pitch = gd.pitchTrim + g.kTheta * gd.pitchErr - g.kQ * r.pitch;
    const roll = gd.rollTrim + g.kPhi * gd.bankErr - g.kP * r.roll;
    const yaw = gd.pedalFF + g.kYaw * (gd.yawRateCmd - r.yaw);
    const collective = gd.collectiveFF + g.kVs * gd.climbErr;
    return { collective: clamp(fin(collective), 0, 1), pitch: clamp(fin(pitch), -1, 1), roll: clamp(fin(roll), -1, 1), yaw: clamp(fin(yaw), -1, 1) };
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
    const m = defaultModel(), T = trimOf(m), s = H.createState(m, { pos: [0, 0, 100], pitch: T.pitchAttitude, bank: T.bank }), d = decide(s, { pos: [200, 0], altitude: 120, heading: 0.5 });
    return [
        "[autopilotRotor] hover, go-to, climb, land, ground avoidance and autorotation for rotorcraftModel6dof's attack helicopter: a cascade of loops with no memory",
        `  trim: collective ${T.collective.toFixed(3)}, cyclic ${T.pitch.toFixed(3)} / ${T.roll.toFixed(3)}, bank ${(T.bank * 180 / Math.PI).toFixed(1)} deg; ${LOOKAHEAD.length} look-ahead samples out to ${LOOKAHEAD[LOOKAHEAD.length - 1]} m; autorotation collective ${AUTOPILOT_ROTOR.cAuto}, glide ${AUTOPILOT_ROTOR.glide} m/s`,
        `  asked to go 200 m ahead, up 20 m and turn 29 degrees right from a hover: tilt asked ${(d.guidance.pitchErr * 180 / Math.PI).toFixed(1)} deg, climb asked ${d.guidance.vsCmd.toFixed(1)} m/s -> collective ${d.controls.collective.toFixed(3)} pitch ${d.controls.pitch.toFixed(3)} roll ${d.controls.roll.toFixed(3)} pedal ${d.controls.yaw.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
