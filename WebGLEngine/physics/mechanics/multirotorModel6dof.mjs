// WebGLEngine/physics/mechanics/multirotorModel6dof.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A QUADROTOR THAT CAN FALL: four motors on a rigid body with gravity, a thrust that follows each motor's speed through a lag, a battery that runs down and sags, a motor that can fail, a body that drags through the air, and a ground. It is the multirotor's counterpart to
// physics/mechanics/rotorcraftModel6dof.mjs and flightModel6dof.mjs and is built the same way: on the rigid body (physics/mechanics/rigidBody6dof.mjs), in the same frame and with the same senses for the pilot, a trim, the attitude and rate readers, a pure classify() for the flight's fate,
// and a stepper. FLIGHT AND TRAINING ONLY: nothing here is a weapon, and nothing in the tree that uses it makes it one.
//
// CONVENTIONS -- the helicopter's, so a pilot's senses carry over. Body: nose +X, up +Z, left +Y. World: +Z up, the ground at z = 0, heading 0 = world +X, a right turn INCREASES it. The pilot sends FOUR numbers, which a fixed MIXER (mix()) turns into the four motors' commands:
//   thrust 0..1       every motor's base command: 0 is stopped, 1 is full (the thrust is proportional to the command, so 4 x the base is the fraction of the machine's total)
//   pitch  -1..+1     +1 = nose UP   = the front motors push harder than the rear ones
//   roll   -1..+1     +1 = right side DOWN = the left motors push harder than the right ones
//   yaw    -1..+1     +1 = nose RIGHT = the motors that spin counter-clockwise (seen from above) spin faster, and their reaction turns the body clockwise
// The mixer's authority (MIX) is a design number of the airframe, not of the pilot: a unit of roll or pitch moves each motor's command by 0.25, a unit of yaw by 0.12. attitude() and rates() report in the pilot's senses (bank positive right side down, pitch positive nose up, heading positive for a
// right turn; rates positive in the commanded direction). THE MOTORS ARE NUMBERED from the front right, counter-clockwise from above's other way round: 0 front right (spins clockwise), 1 front left (counter-clockwise), 2 rear left (clockwise), 3 rear right (counter-clockwise).
//
// THE MOTOR. Each motor is a first-order lag of tau = 0.03 s from the speed its command asks for, omega_cmd = omega_max x sqrt(command) x (the battery's sag factor), so that at a steady state the thrust is proportional to the command: T = kT omega^2 (1 - 0.8 v / (omega R)), the bracket
// the axial inflow's effect on a small propeller (v the speed along the thrust axis through the air: a climb loses a few percent at these tip speeds and a descent gains them; THE VORTEX RING IS NOT MODELLED, said plainly). The reaction torque on the body is Q = kQ omega^2 about the axis of the
// spin (kQ = 0.016 m x kT), plus the torque a spinning rotor's own inertia gives when it speeds up (J d omega/dt); the thrust acts at the motor's position, so the roll and pitch torques are r x F and need no extra term. A FAILED MOTOR is health 0: its command is forced to zero and it spins
// down to a stop on its lag; a health between 0 and 1 scales the command (a damaged propeller).
//
// THE AIRFRAME (INVENTED, in the sense capitalShip.mjs and gunSeats.mjs use the word: numbers of a 1.6 kg quadrotor's order, none of them fitted to a type): arm 0.25 m (the motors at +-0.177 m in each axis), I = [0.015, 0.015, 0.028] kg m^2, motors giving 9.41 N each at 1,100 rad/s (a thrust-to-weight
// of 2.4: the hover wants 0.417 of the command, 710 rad/s), propellers of 0.1 m radius. The battery holds 80 kJ, burns T^1.5 / (sqrt(2 rho A) x 0.55 x 0.8) a motor (255 W for the hover: about 5 minutes) and sags the top speed by up to 15% as it empties; at 3% charge it cuts out (the motors' commands go to zero:
// `battery` is "empty" and the machine falls). The body drags quadratically (0.012, 0.012 and 0.03 m^2 along x, y and z) and the rotors add the linear drag a rotor disc gives to sideways motion (8e-5 N s/m per rad/s of motor speed: the quadrotor's natural velocity damping, from the literature's
// first-order model of the blades' flapping). The ground is four legs at (+-0.15, +-0.15, -0.07) on springs (2,500 N/m) and dampers (30 N s/m) with regularised Coulomb friction. (THE LEGS ARE SOFT ON PURPOSE: the roll stiffness of four stiff legs on a 0.015 kg m^2 body is a mode at 170 rad/s, too near the integrator's limit at 120 Hz, and a first draft with 5,000 N/m toppled on every slope, even five degrees.)
//
// WHAT IS NOT IN IT, SAID PLAINLY: no gyroscopic coupling of the rotors (their angular momentum is the small term above and nothing more), no blade flapping beyond the linear drag, no ground effect, no vortex ring, no motor current or temperature limit, no electrical model beyond the energy (the sag is a
// linear stand-in), a motor's failure is instantaneous and total, the mass is constant, the propellers are not a hazard to the ground except through the hull points below, and the wind is uniform.
//
// THE GROUND AND THE FATE. classify() is a pure function of the state: "crashed" if a hull point (the four motors, the top plate) is at or under the ground, or if a leg arrives with a sink above 6 m/s or the body is tilted more than 50 degrees; "landed" when a leg is on the ground and none of that is so
// (a landed machine can take off again: the flight is not over); "airborne" otherwise; "lost" for a state that is not finite. stepMultirotor() on a crashed state returns it unchanged. Over a terrain (physics/mechanics/terrain.mjs; the flat ground at 0 by default) a leg is in contact when it is under the surface
// UNDER IT, the sink is the speed into the surface along its normal, and a landing on ground steeper than 25 degrees (INVENTED) is a crash named "steep slope".
//
// Pure: no DOM, no clock, no random. physics/mechanics/multirotorModel6dof-selfcheck.mjs holds this to closed forms (the hover, the thrust law, the torques of each motor, the symmetry, the lag, the battery, the failed motor, the fall) and to what the header says it is not.
"use strict";
import { createBody, step, createAccumulator, applyForceAtPoint, worldToBody, rotateByQuat } from "./rigidBody6dof.mjs";
import { FLAT, asTerrain } from "./terrain.mjs";

export const GRAVITY = 9.80665, DT = 1 / 120, AIR_DENSITY = 1.225;
const D = 0.25 / Math.SQRT2;

/** The airframe. Everything INVENTED (see the header). `spin` is +1 for a motor that turns counter-clockwise seen from above. */
export const QUAD = Object.freeze({
    name: "1.6 kg quadrotor (X layout)", mass: 1.6, inertia: Object.freeze([0.015, 0.015, 0.028]),
    motors: Object.freeze([
        Object.freeze({ pos: Object.freeze([D, -D, 0]), spin: -1 }), Object.freeze({ pos: Object.freeze([D, D, 0]), spin: 1 }),
        Object.freeze({ pos: Object.freeze([-D, D, 0]), spin: -1 }), Object.freeze({ pos: Object.freeze([-D, -D, 0]), spin: 1 }),
    ]),
    rotor: Object.freeze({ kT: 9.41 / (1100 * 1100), qOverT: 0.016, omegaMax: 1100, tau: 0.03, inertia: 3e-5, radius: 0.1, inflow: 0.8 }),
    mix: Object.freeze({ roll: 0.25, pitch: 0.25, yaw: 0.12 }),
    battery: Object.freeze({ energy: 8e4, figureOfMerit: 0.55, efficiency: 0.8, sag: 0.15, cutoff: 0.03 }),
    drag: Object.freeze({ area: Object.freeze([0.012, 0.012, 0.03]), rotor: 8e-5 }),
    legs: Object.freeze([[0.15, 0.15, -0.07], [0.15, -0.15, -0.07], [-0.15, 0.15, -0.07], [-0.15, -0.15, -0.07]]), legSpring: 2500, legDamper: 30, friction: 0.7,
    hull: Object.freeze([[D, -D, 0], [D, D, 0], [-D, D, 0], [-D, -D, 0], [0, 0, 0.06]]),   // the four motors and the top plate
    fate: Object.freeze({ maxSink: 6, maxTilt: 50 * Math.PI / 180, maxSlope: 25 * Math.PI / 180 }),
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const axisQ = (axis, angle) => { const s = Math.sin(angle / 2); return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]; };

/** The body quaternion for a heading (right turn positive), pitch (nose up positive) and bank (right side down positive): the aeroplane's and the helicopter's convention (restated, so that a gate on one model does not move when another's file does). */
export function attitudeQuat(heading = 0, pitch = 0, bank = 0) {
    return qmul(qmul(axisQ([0, 0, 1], -heading), axisQ([0, 1, 0], -pitch)), axisQ([1, 0, 0], bank));
}

/** The model: the spec, its mass and weight, and the numbers every caller needs (the thrust at full command, the hover). Build once. */
export function createMultirotorModel(spec = QUAD) {
    const r = spec.rotor, weight = spec.mass * GRAVITY, tMax = r.kT * r.omegaMax * r.omegaMax, area = Math.PI * r.radius * r.radius;
    const hoverCommand = weight / (4 * tMax);
    return Object.freeze({ spec, mass: spec.mass, inertia: spec.inertia, weight, thrustMax: tMax, discArea: area, hover: Object.freeze({ command: hoverCommand, omega: r.omegaMax * Math.sqrt(hoverCommand), thrust: weight / 4 }) });
}

/**
 * A state: the rigid body (pos, vel, q, w, mass, I) plus `omega` (the four motors' speeds, rad/s; the hover's by default), `health` (four numbers, 1 = running, 0 = failed), `energy` (J left in the battery) and `t`.
 * By default a hover at 50 m with the nose along +X; `velocity` is the ground velocity in the world frame; `failed` is a motor number or a list of them (health 0); `charge` the battery's fraction (1 = full).
 */
export function createState(model, { pos = [0, 0, 50], velocity = [0, 0, 0], heading = 0, pitch = 0, bank = 0, w = [0, 0, 0], omega = null, failed = [], charge = 1, health = null } = {}) {
    const body = createBody({ mass: model.mass, I: model.inertia, pos, vel: velocity, q: attitudeQuat(heading, pitch, bank), w });
    const dead = Array.isArray(failed) ? failed : [failed], h = health ? [...health] : [1, 1, 1, 1];
    for (const i of dead) h[i] = 0;
    return { ...body, omega: omega ? [...omega] : [0, 1, 2, 3].map((i) => (h[i] > 0 ? model.hover.omega : 0)), health: h, energy: charge * model.spec.battery.energy, t: 0 };
}

/** { pitch, bank, heading, groundSpeed, airspeed, climb, altitude, up } for a state (angles in radians in the pilot's senses). */
export function attitude(state, windWorld = [0, 0, 0]) {
    const f = rotateByQuat(state.q, [1, 0, 0]), yAxis = rotateByQuat(state.q, [0, 1, 0]), up = rotateByQuat(state.q, [0, 0, 1]);
    const air = sub(state.vel, windWorld);
    return { pitch: Math.asin(clamp(f[2], -1, 1)), bank: Math.atan2(yAxis[2], up[2]), heading: Math.atan2(-f[1], f[0]), groundSpeed: Math.hypot(state.vel[0], state.vel[1]), airspeed: norm(air), climb: state.vel[2], altitude: state.pos[2], up };
}
/** Body rates in the pilot's senses: { roll: positive right side down, pitch: positive nose up, yaw: positive nose right } (rad/s). */
export function rates(state) { return { roll: state.w[0], pitch: -state.w[1], yaw: -state.w[2] }; }

/** The four controls, each clamped to its range; a non-finite one is 0. */
export function sanitize(c = {}) {
    const f = (v) => (Number.isFinite(v) ? v : 0);
    return { thrust: clamp(f(c.thrust), 0, 1), pitch: clamp(f(c.pitch), -1, 1), roll: clamp(f(c.roll), -1, 1), yaw: clamp(f(c.yaw), -1, 1) };
}

/** The mixer: { thrust, pitch, roll, yaw } -> the four motors' commands, each clamped to [0, 1]. Pure and linear before the clamp (the gate holds both). */
export function mix(model, controls) {
    const c = sanitize(controls), m = model.spec.mix;
    return model.spec.motors.map((mo) => clamp(c.thrust + m.pitch * c.pitch * Math.sign(mo.pos[0]) + m.roll * c.roll * Math.sign(mo.pos[1]) + m.yaw * c.yaw * mo.spin, 0, 1));
}

/** The battery's fraction of charge, 0..1. */
export const charge = (model, state) => clamp(state.energy / model.spec.battery.energy, 0, 1);
/** "ok" | "empty": the battery below its cutoff cuts the motors out. */
export const batteryStatus = (model, state) => (charge(model, state) <= model.spec.battery.cutoff ? "empty" : "ok");

// ---- forces and moments -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Everything the airframe does in a state under controls and wind: { acc (the rigid body's force/torque accumulator, body frame), motors: [{ command, omegaCmd, omegaDot, thrust, torque, power }], contacts: [...], powerTotal, thrustTotal }.
 * The legs' contact forces are included, against `terrain` (physics/mechanics/terrain.mjs; the flat ground at 0 by default). Pure.
 */
export function forcesAndMoments(model, state, controls, windWorld = [0, 0, 0], terrain = FLAT) {
    const s = model.spec, r = s.rotor, acc = createAccumulator(), cmds = mix(model, controls), empty = batteryStatus(model, state) === "empty";
    const velBody = worldToBody(state.q, sub(state.vel, windWorld)), w = state.w, soc = charge(model, state), vMaxFactor = 1 - s.battery.sag * (1 - soc);
    const sq = Math.sqrt(2 * AIR_DENSITY * model.discArea);
    const motors = [];
    let torqueZ = 0, sumOmega = 0, thrustTotal = 0, powerTotal = 0;
    for (let i = 0; i < 4; i++) {
        const mo = s.motors[i], om = state.omega[i], command = empty ? 0 : cmds[i] * clamp(state.health[i], 0, 1);
        const omegaCmd = r.omegaMax * vMaxFactor * Math.sqrt(command), omegaDot = (omegaCmd - om) / r.tau;
        const vPoint = add(velBody, cross(w, mo.pos)), inflow = clamp(1 - r.inflow * vPoint[2] / Math.max(om * r.radius, 5), 0.4, 1.3);
        const thrust = r.kT * om * om * inflow, torque = r.kT * r.qOverT * om * om;
        applyForceAtPoint(acc, [0, 0, thrust], mo.pos);
        torqueZ += -mo.spin * (torque + r.inertia * omegaDot);   // the reaction on the body of a rotor that turns counter-clockwise (spin +1) is clockwise: negative about +Z
        sumOmega += om; thrustTotal += thrust;
        const power = empty ? 0 : Math.pow(Math.max(thrust, 0), 1.5) / (sq * s.battery.figureOfMerit * s.battery.efficiency); powerTotal += power;   // an empty battery gives nothing: the rotors that are still turning coast
        motors.push({ command, omegaCmd, omegaDot, thrust, torque, power });
    }
    acc.torque = add(acc.torque, [0, 0, torqueZ]);
    // the body: quadratic drag in each axis, and the rotors' linear drag on the sideways motion through the air
    applyForceAtPoint(acc, [0, 1, 2].map((i) => -0.5 * AIR_DENSITY * s.drag.area[i] * Math.abs(velBody[i]) * velBody[i]));
    applyForceAtPoint(acc, [-s.drag.rotor * sumOmega * velBody[0], -s.drag.rotor * sumOmega * velBody[1], 0]);
    // gravity, in the body frame
    applyForceAtPoint(acc, worldToBody(state.q, [0, 0, -model.weight]));
    // the ground: the legs
    const contacts = legContacts(model, state, acc, asTerrain(terrain));
    return { acc, motors, contacts, powerTotal, thrustTotal };
}

/**
 * Each leg's contact: the spring-damper force along the ground's NORMAL (the world's up on flat ground) and regularised Coulomb friction in the ground's plane, applied to `acc` (if given). Returns [{ point, z, sink, force }] for the legs on the ground: `z` the leg's height above the terrain
 * under it (negative: in it), `sink` its speed into the surface along the normal.
 */
function legContacts(model, state, acc, terrain = FLAT) {
    const s = model.spec, out = [];
    for (const p of s.legs) {
        const off = rotateByQuat(state.q, p), wWorld = rotateByQuat(state.q, state.w), z = state.pos[2] + off[2] - (terrain.flat ? 0 : terrain.height(state.pos[0] + off[0], state.pos[1] + off[1]));
        if (z >= 0) continue;
        const vPt = add(state.vel, cross(wWorld, off));
        let fWorld, sink;
        if (terrain.flat) {
            const pen = -z, Fn = Math.max(0, s.legSpring * pen - s.legDamper * vPt[2]);
            const vt = Math.hypot(vPt[0], vPt[1]), reg = vt / Math.sqrt(vt * vt + 0.05 * 0.05), Ft = s.friction * Fn * reg;
            fWorld = [vt > 1e-9 ? -Ft * vPt[0] / vt : 0, vt > 1e-9 ? -Ft * vPt[1] / vt : 0, Fn]; sink = -vPt[2];
        } else {
            const n = terrain.normal(state.pos[0] + off[0], state.pos[1] + off[1]), vN = dot(vPt, n), pen = -z * n[2], Fn = Math.max(0, s.legSpring * pen - s.legDamper * vN);
            const vT = sub(vPt, scale(n, vN)), vt = norm(vT), reg = vt / Math.sqrt(vt * vt + 0.05 * 0.05), Ft = s.friction * Fn * reg;
            fWorld = [Fn * n[0] - (vt > 1e-9 ? Ft * vT[0] / vt : 0), Fn * n[1] - (vt > 1e-9 ? Ft * vT[1] / vt : 0), Fn * n[2] - (vt > 1e-9 ? Ft * vT[2] / vt : 0)]; sink = -vN;
        }
        if (acc) applyForceAtPoint(acc, worldToBody(state.q, fWorld), p);
        out.push({ point: p, z, sink, force: fWorld });
    }
    return out;
}

// ---- the ground and the flight's fate ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** "airborne" | "landed" | "crashed" | "lost", with the numbers that decided it. A pure function of the state and the terrain (the flat ground at 0 by default). */
export function classify(model, state, terrain = FLAT) {
    if (![...state.pos, ...state.vel, ...state.q, ...state.w, ...state.omega].every(Number.isFinite)) return { status: "lost" };
    terrain = asTerrain(terrain);
    const s = model.spec, up = rotateByQuat(state.q, [0, 0, 1]), flat = terrain.flat;
    const tilt = flat ? Math.acos(clamp(up[2], -1, 1)) : Math.acos(clamp(dot(up, terrain.normal(state.pos[0], state.pos[1])), -1, 1));
    const hull = s.hull.map((p) => { const o = rotateByQuat(state.q, p); return state.pos[2] + o[2] - (flat ? 0 : terrain.height(state.pos[0] + o[0], state.pos[1] + o[1])); }), hullLow = Math.min(...hull);
    const legs = legContacts(model, state, null, terrain), sink = legs.length ? Math.max(...legs.map((k) => k.sink)) : 0;
    if (hullLow <= 0) return { status: "crashed", why: "hull", tilt, sink };
    if (legs.length && (sink > s.fate.maxSink || tilt > s.fate.maxTilt)) return { status: "crashed", why: sink > s.fate.maxSink ? "hard landing" : "tilted landing", tilt, sink };
    if (legs.length && !flat && Math.acos(clamp(terrain.normal(state.pos[0], state.pos[1])[2], -1, 1)) > s.fate.maxSlope) return { status: "crashed", why: "steep slope", tilt, sink };
    return { status: legs.length ? "landed" : "airborne", tilt, sink, legs: legs.length };
}

/**
 * The lowest leg's height above the ground under it (negative: in it). A pure function of the state and the terrain; the stepper uses it to decide how finely to integrate.
 */
export function legClearance(model, state, terrain = FLAT) {
    terrain = asTerrain(terrain);
    let low = Infinity;
    for (const p of model.spec.legs) { const off = rotateByQuat(state.q, p), z = state.pos[2] + off[2] - (terrain.flat ? 0 : terrain.height(state.pos[0] + off[0], state.pos[1] + off[1])); if (z < low) low = z; }
    return low;
}
/** Within this height of the ground (m) the step is cut into SUBSTEPS pieces: four stiff-ish legs on a body this light are a mode near the limit of a 120 Hz explicit step, and without the substeps a machine that slid to a stop kept a period-two chatter of 1.5 cm/s. Above it the arithmetic is the plain single step, to the bit. */
export const CONTACT_BAND = 0.04, SUBSTEPS = 4;

/** One tick: { state, status, ...classification, motors }. A state that has already ended (crashed, lost) is returned unchanged. A landed one steps on: a quadrotor can take off again. `terrain` is the ground (physics/mechanics/terrain.mjs; a bare function of (x, y) is accepted too). Near the ground (legClearance under CONTACT_BAND) the tick is SUBSTEPS substeps of dt / SUBSTEPS with the controls held. */
export function stepMultirotor(model, state, controls, dt = DT, windWorld = [0, 0, 0], terrain = FLAT) {
    terrain = asTerrain(terrain);
    const before = classify(model, state, terrain);
    if (before.status === "crashed" || before.status === "lost") return { state, ...before };
    const n = legClearance(model, state, terrain) < CONTACT_BAND ? SUBSTEPS : 1, h = dt / n;
    let st = state, last = null, fm = null;
    for (let k = 0; k < n; k++) {
        const f = forcesAndMoments(model, st, controls, windWorld, terrain), body = step(st, f.acc, h);
        st = { ...body, omega: st.omega.map((om, i) => Math.max(0, om + f.motors[i].omegaDot * h)), health: st.health, energy: Math.max(0, st.energy - f.powerTotal * h), t: st.t + h };
        last = classify(model, st, terrain); fm = f.motors;
        if (last.status === "crashed" || last.status === "lost") break;
    }
    return { state: st, ...last, motors: fm };
}

/** The hover: { thrust (the virtual control that holds it: every motor at the same command), command, omega, pitch: 0, roll: 0, yaw: 0, pitchAttitude: 0, bank: 0 }. A quadrotor with the same motor on every corner hovers level and needs no trim in the other three. */
export function hoverTrim(model) {
    return Object.freeze({ thrust: model.hover.command, command: model.hover.command, omega: model.hover.omega, pitch: 0, roll: 0, yaw: 0, pitchAttitude: 0, bank: 0 });
}

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const m = createMultirotorModel(), T = hoverTrim(m);
    let st = createState(m, { pos: [0, 0, 50] });
    for (let i = 0; i < 120 * 5; i++) st = stepMultirotor(m, st, { thrust: T.thrust }).state;
    return [
        "[multirotorModel6dof] a 1.6 kg quadrotor that can fall: four lagged motors, a battery that sags and runs down, a motor that can fail, drag, legs and a ground",
        `  hover: ${(T.command * 100).toFixed(1)}% command, ${T.omega.toFixed(0)} rad/s a motor, ${(m.hover.thrust).toFixed(2)} N a motor (full ${m.thrustMax.toFixed(2)} N: thrust-to-weight ${(4 * m.thrustMax / m.weight).toFixed(2)})`,
        `  5 s at the hover command from a hover at 50 m: height ${st.pos[2].toFixed(3)} m, speed ${Math.hypot(...st.vel).toFixed(4)} m/s, battery ${(charge(m, st) * 100).toFixed(2)}%`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
