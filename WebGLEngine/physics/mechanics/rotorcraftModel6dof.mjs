// WebGLEngine/physics/mechanics/rotorcraftModel6dof.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HELICOPTER THAT CAN FALL: a single-main-rotor attack helicopter with gravity, a rotor whose speed is a state, an engine that can fail, a tail rotor, a fuselage and a ground, flown by a pilot that sends FOUR numbers -- collective, cyclic pitch, cyclic roll, pedal -- and by nothing
// else. It is the rotorcraft's counterpart to physics/mechanics/flightModel6dof.mjs and is built the same way: on the rigid body (physics/mechanics/rigidBody6dof.mjs), with the same frame and the same senses for the pilot, a trim, the attitude and rate readers a controller uses, and a classification of the ground.
//
// *** WHY A HELICOPTER IS A DIFFERENT PROBLEM FROM THE AEROPLANE'S, AND WHAT THIS MODEL HAS TO HAVE FOR THAT TO BE TRUE. *** A wing's trim is stable: disturb the aeroplane and it tends to return. A hover is an unstable equilibrium the pilot holds: the thrust vector is the lift, and tilting it is how the machine goes anywhere, so the attitude loop, the velocity loop and the altitude loop
// are one cascade and the plant is open-loop unstable in pitch and roll. And the thing that holds the lift up is the ROTOR'S SPEED, which is a state like any other: a model that holds it constant cannot fall. This one has the engine's power as a limit, the rotor's inertia as a store, the
// engine failing, and what happens next -- the rotor driven by the air going up through it (AUTOROTATION), and the descent in which the rotor sinks into its own wake (the VORTEX RING). A model without those is not a helicopter, it is a thrust vector with a picture on it.
//
// CONVENTIONS -- the aeroplane's (flightModel6dof.mjs), so a pilot's senses carry over. Body: nose +X, up +Z, left +Y. World: +Z up, the ground at z = 0, heading 0 = world +X, a right turn INCREASES it. The four controls:
//   collective 0..1   the blades' pitch, all together: 0 is the bottom of the range (a small negative pitch), 1 the top (9.7 degrees). The rotor's thrust follows it (and the air going through the disc).
//   pitch  -1..+1     +1 = stick back = the disc tilts AFT = the nose goes UP         (rotation about +Y takes the nose DOWN, so this is a negative torque about +Y)
//   roll   -1..+1     +1 = stick right = the disc tilts RIGHT = the right side goes DOWN (a positive rotation about +X)
//   yaw    -1..+1     +1 = right pedal = the tail rotor's pitch increases toward +Y (left) = the nose goes RIGHT (a negative rotation about +Z). 0 is rigged for the design hover: the tail rotor then pushes the tail RIGHT by the main rotor's torque over the tail's arm.
// attitude() and rates() report in those senses: bank positive right side down, pitch positive nose up, heading positive for a right turn; rates positive in the commanded direction.
//
// THE ROTOR, from momentum theory and blade-element theory in their textbook forms (Leishman, Principles of Helicopter Aerodynamics; Johnson, Helicopter Theory): thrust coefficient CT = (sigma a / 2)(theta0 / 3 (1 + 1.5 mu^2) - lambda / 2), with lambda = (Vc + vi) / (Omega R) the inflow through the disc and mu the
// in-plane speed over the tip speed; the induced velocity vi from Glauert's momentum equation vi = vh^2 / sqrt(Vxy^2 + (Vc + vi)^2) with vh = sqrt(T / (2 rho A)), solved with the thrust (the thrust found as the root of the blade element's against the momentum's by bisection, the last tick's vi to start Glauert's passes); in a descent of between zero and two hover-induced velocities with
// little forward speed, THE VORTEX RING STATE: the induced velocity is Johnson's empirical fit vi/vh = 1 - 1.125 x - 1.372 x^2 - 1.718 x^3 - 0.655 x^4 for x = Vc/vh in [-2, 0] (blended into Glauert's as the forward speed grows past a hover-induced velocity) AND -- INVENTED, the textbook gives power and not thrust --
// a mean thrust loss of 30% at the centre of the band (x = -1) that fades with forward speed; the retreating blades stall: CT is held below 0.12 sigma, smoothly. The shaft power is kappa T vi + T Vc + the profile power (sigma Cd0 / 8) rho A (Omega R)^3 (1 + 4.6 mu^2), kappa = 1.15; the aerodynamic torque is that over Omega. The rotor's speed obeys
//   I_r dOmega/dt = Q_engine - Q_aero,        Q_engine = clamp(Q_aero + Kgov (Omega0 - Omega), 0, Pmax / Omega),   0 with the engine out,
// so that with the engine out the rotor slows until the descent drives it (the autorotation: Q_aero goes negative as T Vc does). The torque the fuselage feels is -Q_engine about +Z (the rotor turns counter-clockwise seen from above; the reaction is the nose to the RIGHT, and the tail rotor is what stops it).
// The disc tilts (flaps) relative to the hub, a first-order lag of tau_f = 0.08 s toward the cyclic's angle (and AWAY from the machine's motion through the air: backward flapping, the speed instability) MINUS the rate the hub turns at (the disc stays where it was while the hub turns under it: that lag is the machine's rate damping); the thrust is along the disc's normal and acts at the hub, 1.6 m above the centre of mass,
// and a hingeless rotor's hub spring adds K_beta times the tilt as a moment of its own. THE TAIL ROTOR is a force along +Y at the tail (its pitch set by the pedal, plus a term that is its damping: it sees the sideways speed of the tail); a fin and a stabiliser are lifting surfaces at the tail whose lift is the weathercock and the pitch stability.
// The fuselage drag is quadratic in each body axis (0.8, 4.5 and 6.0 m^2 along x, y and z). The ground is four skids on springs and dampers with Coulomb friction; the first contact decides the flight's fate as below.
//
// THE AIRFRAME (ATTACK; INVENTED, in the sense capitalShip.mjs and gunSeats.mjs use the word: numbers of a light attack helicopter's order, none of them fitted to a type): 4,500 kg, I = [4200, 20000, 17500], a rotor of 7.3 m radius (disc loading 264 N/m^2, hover induced velocity 10.4 m/s) at 33 rad/s
// (240.9 m/s at the tip), two blades, solidity 0.075, an engine of 1.1 MW. From those numbers the hover wants 795 kW at the shaft (527 kW induced, 268 kW profile) at a collective of 0.736 (6.7 degrees of blade pitch in a range of -1.7 to 9.7) and the rotor's torque is 24.1 kN m; the gate holds the closed forms: momentum theory's hover, the trim, the climb power, the autorotation.
//
// WHAT IS NOT IN IT, SAID PLAINLY: no cross-coupling of the flapping (a cyclic input tilts the disc in the plane it was given, not 90 degrees later; the flapping with speed is the backward tilt only, with no lateral part from the inflow's gradient), no blade lag or dynamic inflow, no ground effect (the thrust does not grow near the ground), no air-density change with altitude, no compressibility, no rotor wake on the tail,
// no engine lag or temperature limit, no fuel burn (the mass is constant), the tail rotor's thrust is linear in its pitch, the VORTEX RING is a mean thrust loss and not the buffeting, and a rotor that is stopped is a rotor with no lift (nothing models a blade strike on the airframe but the tip clearance in classify()).
//
// THE GROUND AND THE FATE. Four skids at (+-1.4, +-1.0, -1.5) m. classify() is a pure function of the state: "crashed" if a hull point (the nose, the tail boom, the canopy) is on the ground, if a rotor tip is within 0.2 m of it, if a skid arrives with a sink speed of more than 4.5 m/s or with the machine more than 30 degrees
// off the level; "landed" when a skid is on the ground and none of that is so (a landed helicopter can take off again: the flight is not over); "airborne" otherwise; "lost" for a state that is not finite. stepRotor() on a crashed state returns it unchanged.
//
// Pure: no DOM, no clock, no random. physics/mechanics/rotorcraftModel6dof-selfcheck.mjs holds this to closed forms (momentum theory, the hover, the climb, the torque balance, the autorotation, the symmetry) and to what the header says it is not.
"use strict";
import { createBody, step, createAccumulator, applyForceAtPoint, worldToBody, rotateByQuat } from "./rigidBody6dof.mjs";

export const GRAVITY = 9.80665, DT = 1 / 60, AIR_DENSITY = 1.225;

/** The airframe. Everything INVENTED (see the header). `rotor.collective` is the blade pitch (rad) at collective 0 and 1; `flapMax` the disc's tilt at full cyclic (rad). */
export const ATTACK = Object.freeze({
    name: "light attack helicopter", mass: 4500, inertia: Object.freeze([4200, 20000, 17500]),
    rotor: Object.freeze({ radius: 7.3, solidity: 0.075, liftSlope: 5.7, cd0: 0.01, omega0: 33, inertia: 3000, kappa: 1.15, hub: Object.freeze([0, 0, 1.6]), kBeta: 60000, flapTau: 0.08, flapMax: 0.14, collective: Object.freeze([-0.03, 0.17]), ctOverSigmaMax: 0.12 }),
    engine: Object.freeze({ powerMax: 1.1e6, governorGain: 4000 }),
    tail: Object.freeze({ position: Object.freeze([-6.8, 0, 1.0]), radius: 1.3, solidity: 0.2, liftSlope: 5.7, omegaRatio: 5, pitchRange: 0.3 }),
    fuselage: Object.freeze({ dragArea: Object.freeze([0.8, 4.5, 6.0]) }),
    fin: Object.freeze({ position: Object.freeze([-6.4, 0, 1.2]), area: 1.2, liftSlope: 3.0 }),
    stabiliser: Object.freeze({ position: Object.freeze([-6.2, 0, 0.6]), area: 1.4, liftSlope: 3.5 }),
    skids: Object.freeze([[1.4, 1.0, -1.5], [1.4, -1.0, -1.5], [-1.4, 1.0, -1.5], [-1.4, -1.0, -1.5]]), skidSpring: 110000, skidDamper: 12000, friction: 0.6,
    hull: Object.freeze([[3.2, 0, -0.8], [-8.0, 0, 0.6], [0, 0, 1.9], [-4, 0, 1.0]]),   // the nose, the tail boom's end, the top of the mast, the boom
    fate: Object.freeze({ maxSink: 4.5, maxTilt: 30 * Math.PI / 180, tipClearance: 0.2 }),
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// ---- the rotor's aerodynamics, in pieces the gate holds to their closed forms ---------------------------------------------------------------------------------------------------------------------------------

/** Hover induced velocity of an ideal rotor of disc area A carrying thrust T: sqrt(T / (2 rho A)). */
export const hoverInduced = (T, A) => Math.sqrt(Math.max(T, 0) / (2 * AIR_DENSITY * A));

/** Momentum theory's induced velocity in a purely axial flight at x = Vc / vh (climb positive): the climb branch for x >= 0, the windmill-brake branch for x <= -2, and Johnson's empirical fit for the vortex ring state between (all as multiples of vh). */
export function inducedAxial(x) {
    if (x >= 0) return -x / 2 + Math.sqrt((x / 2) * (x / 2) + 1);
    if (x <= -2) return -x / 2 - Math.sqrt((x / 2) * (x / 2) - 1);
    return 1 - 1.125 * x - 1.372 * x * x - 1.718 * x * x * x - 0.655 * x * x * x * x;
}

/** Glauert's induced velocity for a flight with climb component Vc and in-plane speed Vxy at hover-induced velocity vh: the root of vi = vh^2 / sqrt(Vxy^2 + (Vc + vi)^2), by fixed-point passes from `guess`. */
export function inducedGlauert(vh, vc, vxy, guess = vh, passes = 8) {
    let vi = Math.max(guess, 1e-3);
    for (let k = 0; k < passes; k++) { const next = (vh * vh) / Math.max(Math.hypot(vxy, vc + vi), 1e-3); vi = 0.5 * vi + 0.5 * next; }
    return vi;
}

/** The induced velocity the model uses: Glauert's, except in a slow descent (x in [-2, 0]) where it blends toward the vortex ring state's fit as the forward speed falls below a hover-induced velocity. */
export function inducedVelocity(vh, vc, vxy, guess = vh) {
    if (!(vh > 1e-6)) return 0;   // no thrust, no induced flow
    const x = vc / vh;
    if (x >= 0) return inducedGlauert(vh, vc, vxy, guess);
    if (x <= -2) return vh * inducedAxial(x);
    const wake = Math.exp(-((vxy / (0.8 * vh)) ** 2)), ring = vh * inducedAxial(x), glauert = inducedGlauert(vh, vc, vxy, guess);
    return glauert + (ring - glauert) * wake;
}

/** The fraction of the thrust the vortex ring state costs (INVENTED: 30% at x = -1, a bell 0.55 wide, faded by the forward speed). 1 outside the ring. */
export function vortexRingFactor(vh, vc, vxy) {
    if (!(vh > 1e-6)) return 1;   // no thrust, no wake to sink into
    const x = vc / vh;
    return 1 - 0.3 * Math.exp(-(((x + 1) / 0.55) ** 2)) * Math.exp(-((vxy / vh) ** 2));
}

/** The thrust coefficient the retreating blades will give: CT held below ctMax, linear to 0.8 ctMax and smoothly saturating above it. */
export function stallLimit(ct, ctMax) {
    const knee = 0.8 * ctMax, c = Math.abs(ct), s = Math.sign(ct) || 1;
    if (c <= knee) return ct;
    return s * (ctMax - (ctMax - knee) * Math.exp(-(c - knee) / (ctMax - knee)));
}

// ---- the model ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Build a model from an airframe spec (default ATTACK): { spec, mass, inertia, weight, discArea, tipSpeed, hover: { thrust, inducedVelocity, collective, power, torque }, tailPitchRig }. The tail rotor is rigged so that pedal 0 holds the nose in the design hover. */
export function createRotorModel(spec = ATTACK) {
    const R = spec.rotor.radius, A = Math.PI * R * R, tip = spec.rotor.omega0 * R, weight = spec.mass * GRAVITY;
    const model = { spec, mass: spec.mass, inertia: [...spec.inertia], weight, discArea: A, tipSpeed: tip, tailArea: Math.PI * spec.tail.radius ** 2, tailPitchRig: 0 };
    // the hover: collective for T = weight, the power and the torque it costs (an axial, windless, level solve of the same equations the tick uses)
    const hov = rotorThrust(model, { collective: hoverCollective(model), omega: spec.rotor.omega0, vc: 0, vxy: 0, vi: hoverInduced(weight, A) });
    model.hover = { thrust: hov.thrust, inducedVelocity: hov.vi, collective: hoverCollective(model), power: hov.power, torque: hov.torque };
    // the rigging: the tail rotor's thrust that cancels the rotor's torque at the tail's arm, as a blade pitch (the linear tail model below, no inflow, no tail speed)
    const arm = -spec.tail.position[0], Ttail = -hov.torque / arm, tl = tailConstants(model);
    model.tailPitchRig = 3 * (Ttail / tl.thrustPerPitch3);
    return model;
}

function tailConstants(model) {
    const t = model.spec.tail, R = t.radius, Atail = Math.PI * R * R, tip = t.omegaRatio * model.spec.rotor.omega0 * R;
    const q = AIR_DENSITY * Atail * tip * tip, ca = t.solidity * t.liftSlope;
    return { area: Atail, tip, thrustPerPitch3: q * (ca / 2), damping: AIR_DENSITY * Atail * tip * (ca / 4) };   // thrust = thrustPerPitch3 * (pitch / 3) - damping * (the speed along the thrust axis)
}

/**
 * The rotor's thrust for a blade pitch and a flow: { thrust, vi, lambda, mu, ct, power, torque, vh, profile }. `vc` is the hub's velocity along the disc normal (up positive), `vxy` its speed in the disc's plane, `vi` the previous induced velocity (Glauert's start).
 * The thrust and the induced velocity depend on each other (CT depends on lambda, which depends on vi, which depends on the thrust through vh): the thrust is the ROOT of g(T) = T_blade-element(T) - T, found by bisection (forty halvings between 0 and the stall limit's thrust,
 * where g changes sign: g(0) >= 0 and g(Tmax) <= 0 because the blade element cannot give more than the stall limit). Where the vortex ring makes the root not unique the bisection picks one, the same one every time.
 */
export function rotorThrust(model, { collective, omega, vc, vxy, vi }) {
    const r = model.spec.rotor, A = model.discArea, R = r.radius, tip = Math.max(omega, 1e-3) * R, theta = r.collective[0] + clamp(collective, 0, 1) * (r.collective[1] - r.collective[0]);
    const sa2 = r.solidity * r.liftSlope / 2, mu = vxy / tip, ctMax = r.ctOverSigmaMax * r.solidity, q = AIR_DENSITY * A * tip * tip, start = Math.max(vi, 0.1);
    const at = (T) => {
        const vh = hoverInduced(T, A), vInd = inducedVelocity(vh, vc, vxy, start), lambda = (vc + vInd) / tip;
        const ct = stallLimit(sa2 * ((theta / 3) * (1 + 1.5 * mu * mu) - lambda / 2), ctMax);
        return { vh, vInd, lambda, ct, pred: Math.max(0, q * ct * vortexRingFactor(vh, vc, vxy)) };
    };
    let lo = 0, hi = q * ctMax * 1.05;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (at(mid).pred > mid) lo = mid; else hi = mid; }
    const T = (lo + hi) / 2, f = at(T), profile = (r.solidity * r.cd0 / 8) * AIR_DENSITY * A * tip ** 3 * (1 + 4.6 * mu * mu), shaft = r.kappa * T * f.vInd + T * vc + profile;
    return { thrust: T, vi: f.vInd, lambda: f.lambda, mu, ct: f.ct, vh: f.vh, power: shaft, torque: shaft / Math.max(omega, 1e-3), profile };
}

function hoverCollective(model) {
    // bisection on the collective for hover thrust = weight at the design rotor speed
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2, t = rotorThrust(model, { collective: mid, omega: model.spec.rotor.omega0, vc: 0, vxy: 0, vi: hoverInduced(model.weight, model.discArea) }).thrust;
        if (t < model.weight) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

// ---- state, senses ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const axisQ = (axis, angle) => { const s = Math.sin(angle / 2); return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]; };

/** The body quaternion for a heading (right turn positive), pitch (nose up positive) and bank (right side down positive): the aeroplane's convention. */
export function attitudeQuat(heading = 0, pitch = 0, bank = 0) {
    return qmul(qmul(axisQ([0, 0, 1], -heading), axisQ([0, 1, 0], -pitch)), axisQ([1, 0, 0], bank));
}

/**
 * A state: the rigid body (pos, vel, q, w, mass, I) plus the rotor's: `omega` (rad/s; the design speed by default), `flapA` and `flapB` (the disc's tilt, forward and to the right, rad), `vi` (the induced velocity, m/s), `engine` ("running" | "out") and `t`.
 * By default a hover at 100 m with the nose along +X; `velocity` is the ground velocity in the world frame.
 */
export function createState(model, { pos = [0, 0, 100], velocity = [0, 0, 0], heading = 0, pitch = 0, bank = 0, w = [0, 0, 0], omega = null, engine = "running", flap = [0, 0] } = {}) {
    const body = createBody({ mass: model.mass, I: model.inertia, pos, vel: velocity, q: attitudeQuat(heading, pitch, bank), w });
    return { ...body, omega: omega ?? model.spec.rotor.omega0, flapA: flap[0], flapB: flap[1], vi: model.hover ? model.hover.inducedVelocity : 10, engine, t: 0 };
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
    return { collective: clamp(f(c.collective), 0, 1), pitch: clamp(f(c.pitch), -1, 1), roll: clamp(f(c.roll), -1, 1), yaw: clamp(f(c.yaw), -1, 1) };
}

// ---- forces and moments -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Everything the airframe does in a state under controls and wind: { acc (the rigid body's force/torque accumulator, body frame), rotor: { thrust, vi, ... , omegaDot, engineTorque, aeroTorque }, flapDot: [da/dt, db/dt], contacts: [...] }.
 * The skids' contact forces are included. Pure.
 */
export function forcesAndMoments(model, state, controls, windWorld = [0, 0, 0]) {
    const c = sanitize(controls), s = model.spec, r = s.rotor, acc = createAccumulator();
    const velBody = worldToBody(state.q, sub(state.vel, windWorld)), w = state.w;
    // the rotor: the hub's velocity through the air, resolved on the disc's normal
    const hub = r.hub, vHub = add(velBody, cross(w, hub)), a = state.flapA, b = state.flapB;
    const n = [Math.sin(a), -Math.sin(b), Math.cos(a) * Math.cos(b)], nn = norm(n), nHat = [n[0] / nn, n[1] / nn, n[2] / nn];
    const vc = dot(vHub, nHat), vPlane = sub(vHub, scale(nHat, vc)), vxy = norm(vPlane);
    const rt = rotorThrust(model, { collective: c.collective, omega: state.omega, vc, vxy, vi: state.vi });
    applyForceAtPoint(acc, scale(nHat, rt.thrust), hub);
    acc.torque = add(acc.torque, [r.kBeta * b, r.kBeta * a, 0]);   // the hingeless hub's spring: a moment proportional to the tilt (about +X for the roll tilt, +Y for the pitch tilt; the same signs as the thrust's own)
    // the engine and the rotor's speed; the reaction torque on the fuselage
    const Qaero = rt.torque, Qmax = s.engine.powerMax / Math.max(state.omega, 0.3 * r.omega0);
    const Qeng = state.engine === "out" ? 0 : clamp(Qaero + s.engine.governorGain * (r.omega0 - state.omega), 0, Qmax);
    acc.torque = add(acc.torque, [0, 0, -Qeng]);
    const omegaDot = (Qeng - Qaero) / r.inertia;
    // the flapping: the disc lags toward the cyclic's angle, and stays where it was while the hub turns (the hub's rates carry it): da/dt = (a_cmd - a) / tau - w_y, db/dt = (b_cmd - b) / tau - w_x
    // and the disc tilts away from the machine's motion through the air (the advancing blade lifts more than the retreating one: backward flapping, k = (8/3 theta0 - 2 lambda) / (1 - mu^2/2) times mu): the speed instability that makes a hover unstable
    const theta0 = r.collective[0] + c.collective * (r.collective[1] - r.collective[0]), muX = vPlane[0] / (Math.max(state.omega, 1e-3) * r.radius), muY = vPlane[1] / (Math.max(state.omega, 1e-3) * r.radius);
    const kFlap = ((8 / 3) * theta0 - 2 * rt.lambda) / (1 - 0.5 * rt.mu * rt.mu);
    const aCmd = -c.pitch * r.flapMax - kFlap * muX, bCmd = c.roll * r.flapMax + kFlap * muY;
    const flapDot = [(aCmd - a) / r.flapTau - w[1], (bCmd - b) / r.flapTau - w[0]];
    // the tail rotor: its pitch from the pedal (rigged so 0 holds the nose in the design hover), thrust along +Y at the tail, with the damping its own inflow gives
    const tl = tailConstants(model), tail = s.tail, tailV = add(velBody, cross(w, tail.position)), pitchTail = model.tailPitchRig + c.yaw * tail.pitchRange;
    const Ftail = tl.thrustPerPitch3 * (pitchTail / 3) - tl.damping * tailV[1];
    applyForceAtPoint(acc, [0, Ftail, 0], tail.position);
    // the fin and the stabiliser: lift on the sideways and the vertical speed at their stations
    const fin = s.fin, stab = s.stabiliser, finV = add(velBody, cross(w, fin.position)), stabV = add(velBody, cross(w, stab.position)), u = (v) => Math.abs(v[0]);
    applyForceAtPoint(acc, [0, -0.5 * AIR_DENSITY * fin.area * fin.liftSlope * u(finV) * finV[1], 0], fin.position);
    applyForceAtPoint(acc, [0, 0, -0.5 * AIR_DENSITY * stab.area * stab.liftSlope * u(stabV) * stabV[2]], stab.position);
    // the fuselage: quadratic drag in each axis
    applyForceAtPoint(acc, [0, 1, 2].map((i) => -0.5 * AIR_DENSITY * s.fuselage.dragArea[i] * Math.abs(velBody[i]) * velBody[i]));
    // gravity, in the body frame
    applyForceAtPoint(acc, worldToBody(state.q, [0, 0, -model.weight]));
    // the ground: the skids
    const contacts = skidContacts(model, state, acc);
    return { acc, rotor: { ...rt, omegaDot, engineTorque: Qeng, aeroTorque: Qaero, vc, vxy, normal: nHat }, flapDot, contacts, tail: { force: Ftail, pitch: pitchTail } };
}

/** Each skid's contact: the spring-damper force along the world's up and Coulomb friction along the ground, applied to `acc` (if given). Returns [{ z, sink, force }] for the skids on the ground. */
function skidContacts(model, state, acc) {
    const s = model.spec, out = [];
    for (const p of s.skids) {
        const off = rotateByQuat(state.q, p), wWorld = rotateByQuat(state.q, state.w), z = state.pos[2] + off[2];
        if (z >= 0) continue;
        const vPt = add(state.vel, cross(wWorld, off)), pen = -z, Fn = Math.max(0, s.skidSpring * pen - s.skidDamper * vPt[2]);
        const vt = Math.hypot(vPt[0], vPt[1]), reg = vt / Math.sqrt(vt * vt + 0.05 * 0.05), Ft = s.friction * Fn * reg;
        const fWorld = [vt > 1e-9 ? -Ft * vPt[0] / vt : 0, vt > 1e-9 ? -Ft * vPt[1] / vt : 0, Fn];
        if (acc) applyForceAtPoint(acc, worldToBody(state.q, fWorld), p);
        out.push({ point: p, z, sink: -vPt[2], force: fWorld });
    }
    return out;
}

// ---- the ground and the flight's fate ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** "airborne" | "landed" | "crashed" | "lost", with the numbers that decided it. A pure function of the state. */
export function classify(model, state) {
    if (![...state.pos, ...state.vel, ...state.q, ...state.w, state.omega].every(Number.isFinite)) return { status: "lost" };
    const s = model.spec, up = rotateByQuat(state.q, [0, 0, 1]), tilt = Math.acos(clamp(up[2], -1, 1));
    const hull = s.hull.map((p) => state.pos[2] + rotateByQuat(state.q, p)[2]), hullLow = Math.min(...hull);
    const n = rotateByQuat(state.q, [Math.sin(state.flapA), -Math.sin(state.flapB), Math.cos(state.flapA) * Math.cos(state.flapB)]), hubZ = state.pos[2] + rotateByQuat(state.q, s.rotor.hub)[2];
    const tipLow = hubZ - s.rotor.radius * Math.sqrt(Math.max(0, 1 - n[2] * n[2] / (norm(n) ** 2)));
    const skids = skidContacts(model, state, null), sink = skids.length ? Math.max(...skids.map((k) => k.sink)) : 0;
    if (hullLow <= 0) return { status: "crashed", why: "hull", tilt, sink };
    if (tipLow <= s.fate.tipClearance && state.omega > 0.2 * s.rotor.omega0) return { status: "crashed", why: "rotor strike", tilt, sink };
    if (skids.length && (sink > s.fate.maxSink || tilt > s.fate.maxTilt)) return { status: "crashed", why: sink > s.fate.maxSink ? "hard landing" : "tilted landing", tilt, sink };
    return { status: skids.length ? "landed" : "airborne", tilt, sink, skids: skids.length };
}

/** One tick: { state, status, ...classification, rotor }. A state that has already ended (crashed, lost) is returned unchanged. A landed one steps on: a helicopter can take off again. */
export function stepRotor(model, state, controls, dt = DT, windWorld = [0, 0, 0]) {
    const before = classify(model, state);
    if (before.status === "crashed" || before.status === "lost") return { state, ...before };
    const f = forcesAndMoments(model, state, controls, windWorld), c = sanitize(controls), r = model.spec.rotor;
    const body = step(state, f.acc, dt);
    const a = state.flapA + f.flapDot[0] * dt, b = state.flapB + f.flapDot[1] * dt;
    const next = { ...body, omega: Math.max(0, state.omega + f.rotor.omegaDot * dt), flapA: clamp(a, -1.2 * r.flapMax, 1.2 * r.flapMax), flapB: clamp(b, -1.2 * r.flapMax, 1.2 * r.flapMax), vi: f.rotor.vi, engine: state.engine, t: state.t + dt };
    return { state: next, ...classify(model, next), rotor: f.rotor };
}

// ---- trim ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The controls and the attitude that hold the design hover still: a Newton solve over [collective, pitch, roll, yaw, pitch attitude, bank] for zero force and zero moment at rest (the flapping settled), at height `altitude`. Returns { collective, pitch, roll, yaw, pitchAttitude, bank, residual, converged }.
 * The tail rotor pushes the machine sideways, so a hover is held with the disc tilted and the machine banked a little: the answer is not zero cyclic.
 */
export function hoverTrim(model, { altitude = 100 } = {}) {
    const r = model.spec.rotor;
    const make = (x) => {
        const aCmd = -x[1] * r.flapMax, bCmd = x[2] * r.flapMax;
        return { state: createState(model, { pos: [0, 0, altitude], pitch: x[4], bank: x[5], flap: [aCmd, bCmd] }), controls: { collective: x[0], pitch: x[1], roll: x[2], yaw: x[3] } };
    };
    const resid = (x) => { const { state, controls } = make(x), f = forcesAndMoments(model, state, controls); const fw = rotateByQuat(state.q, f.acc.force); return [fw[0], fw[1], fw[2], f.acc.torque[0], f.acc.torque[1], f.acc.torque[2]]; };
    let x = [model.hover.collective, 0, 0, 0, 0, 0], converged = false;
    const scaleOf = [model.weight, model.weight, model.weight, model.weight * 2, model.weight * 2, model.weight * 2];
    for (let it = 0; it < 60; it++) {
        const r0 = resid(x), J = [];
        for (let j = 0; j < 6; j++) { const d = x.slice(); d[j] += 1e-6; const r1 = resid(d); J.push(r1.map((v, i) => (v - r0[i]) / 1e-6)); }
        const A = [0, 1, 2, 3, 4, 5].map((i) => [...[0, 1, 2, 3, 4, 5].map((j) => J[j][i]), -r0[i]]);
        let singular = false;
        for (let cc = 0; cc < 6; cc++) { let p = cc; for (let rr = cc + 1; rr < 6; rr++) if (Math.abs(A[rr][cc]) > Math.abs(A[p][cc])) p = rr; [A[cc], A[p]] = [A[p], A[cc]]; if (Math.abs(A[cc][cc]) < 1e-12) { singular = true; break; } for (let rr = cc + 1; rr < 6; rr++) { const f = A[rr][cc] / A[cc][cc]; for (let k = cc; k < 7; k++) A[rr][k] -= f * A[cc][k]; } }
        if (singular) break;
        const dx = [0, 0, 0, 0, 0, 0]; for (let i = 5; i >= 0; i--) { let sum = A[i][6]; for (let k = i + 1; k < 6; k++) sum -= A[i][k] * dx[k]; dx[i] = sum / A[i][i]; }
        const lim = Math.min(1, 0.1 / Math.max(...dx.map(Math.abs), 1e-12));
        x = x.map((v, i) => v + lim * dx[i]);
        if (!x.every(Number.isFinite)) break;
        if (Math.hypot(...dx) < 1e-10) { converged = true; break; }
    }
    const res = resid(x);
    return { collective: x[0], pitch: x[1], roll: x[2], yaw: x[3], pitchAttitude: x[4], bank: x[5], residual: res, converged: converged && res.every((v, i) => Math.abs(v) < 1e-3 * scaleOf[i]) };
}

export function reportLines() {
    const m = createRotorModel(), t = hoverTrim(m);
    return [`[rotorcraftModel6dof] ${m.spec.name}: ${m.mass} kg, a ${m.spec.rotor.radius} m rotor at ${m.spec.rotor.omega0} rad/s (disc loading ${(m.weight / m.discArea).toFixed(0)} N/m^2, hover induced velocity ${m.hover.inducedVelocity.toFixed(1)} m/s), an engine of ${(m.spec.engine.powerMax / 1e3).toFixed(0)} kW`,
        `  hover: collective ${m.hover.collective.toFixed(3)}, ${(m.hover.power / 1e3).toFixed(0)} kW at the shaft, rotor torque ${(m.hover.torque / 1e3).toFixed(1)} kN m; held still it wants collective ${t.collective.toFixed(3)}, cyclic ${t.pitch.toFixed(3)} / ${t.roll.toFixed(3)}, pedal ${t.yaw.toFixed(3)}, bank ${(t.bank * 180 / Math.PI).toFixed(1)} deg${t.converged ? "" : " (NOT CONVERGED)"}`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
