// WebGLEngine/physics/mechanics/rigidBody6dof.mjs
//
// A GENUINELY DYNAMICAL 6-DEGREE-OF-FREEDOM RIGID BODY -- real forces and torques integrated against mass and a
// moment-of-inertia tensor, as a NEW subsystem alongside, not a replacement for, ev/flightModel3d.js's deliberately
// kinematic arcade model (see tools/ship/nextRounds.mjs's rcforge-realistic-flight-model entry for why that one
// stays exactly what it is -- reducing to flightModel.js at pitch 0 is its own load-bearing property). This module
// is the dynamical counterpart: instead of turn/pitch/thrust directly setting heading and velocity each frame with
// a hard speed cap, a body here accumulates FORCE and TORQUE over a tick and is pushed by Newton's and Euler's
// equations -- position, velocity, orientation (a unit quaternion) and angular velocity are all genuine state, and
// nothing caps speed or snaps heading; a body that is never touched coasts and tumbles forever, exactly as a real
// object in vacuum would.
//
// THE ANGULAR HALF IS NOT REINVENTED -- IT IS physics/mechanics/freeRotation.mjs, EXTENDED WITH TORQUE. That file
// is a complete, already-gated torque-free rigid-body rotation solver (Euler's equations with the gyroscopic term,
// RK4 on body-frame angular velocity, proper q' = 1/2 q (x) (0, w) quaternion integration, renormalised every
// step). "Torque-free" there means exactly what it says: no external torque, a thrown object tumbling on its own
// angular momentum. A flying ship needs the OTHER half too -- RCS thrusters and engine gimbal apply real torque --
// so derivWithTorque()/stepOmegaWithTorque() below add an external I^-1 * torque term on top of
// freeRotation.mjs's own eulerDeriv(), and stepQuat()/rotateByQuat()/energy()/momentumBody() are reused directly,
// unmodified. With torque = [0,0,0] every tick, stepOmegaWithTorque reduces to freeRotation.mjs's own stepOmega
// VALUE-IDENTICAL under === (0/I[i] is exact in IEEE-754 for any finite nonzero I[i], and x+0 is exact; a rare
// -0 vs +0 sign-of-zero difference is possible in eulerDeriv's own internal terms and is invisible to === and to
// everything downstream) -- the same "reduces exactly to the proven lower layer" property ev/flightModel3d.js
// holds itself to against flightModel.js, proven in physics/mechanics/rigidBody6dof-selfcheck.mjs rather than assumed.
//
// THE LINEAR HALF IS NEW: F = ma via semi-implicit ("symplectic") Euler -- v += (F_world/m) dt, then p += v dt.
// Velocity under a CONSTANT force is exact regardless of step size (dv/dt = a with a constant integrates exactly
// under any Euler step, since there is no higher-order term to miss); position carries a KNOWN, predictable
// O(dt) discretisation term relative to the true continuous parabola -- x(t) = x0 + v0 t + 1/2 a t^2 + 1/2 a dt t
// -- derived once in the gate and checked to floating-point precision rather than covered by a loose tolerance.
//
// FORCE IS APPLIED IN BODY-FRAME COORDINATES, AT A BODY-FRAME POINT, so a thruster mounted off the centre of mass
// induces torque = r x F exactly as a real one would -- applyForceAtPoint() is the one primitive both the engine
// (mounted near the tail, roughly on-axis) and RCS thrusters (mounted at the hull's extremities, by design
// off-axis) go through. The engine's own net-force/net-torque decoupling is a gated property: two forces of equal
// magnitude applied at different points produce IDENTICAL linear motion (translation depends on net force alone,
// never on where it was applied) and DIFFERENT angular motion (only torque depends on the application point).
//
// WHAT THIS DELIBERATELY DOES NOT DO (first slice, matching the backlog entry's own scope): no AI, no weapon, no
// page wiring, no collision -- a pure physics substrate, gated on its own correctness alone, the same way
// ev/flightModel3d.js itself shipped and was proven before physics/esBox3d.js's fly3d mode existed to consume it.
// Body axes are ASSUMED to be principal axes (I is a 3-vector, diagonal in the body frame) -- freeRotation.mjs's
// own convention, inherited rather than generalised; a body whose mass distribution is not aligned with its hull
// axes would need a full off-diagonal tensor and a rotation to its principal frame, which neither file attempts.
// Mass is constant (no fuel-burn mass loss modelled).
"use strict";
import { boxInertia, eulerDeriv, stepQuat, rotateByQuat, energy, momentumBody, momentumMag } from "./freeRotation.mjs";

export { boxInertia, rotateByQuat, energy, momentumBody, momentumMag };   // re-exported: a caller or gate measuring
                                                                            // this module's angular state needs the
                                                                            // same helpers freeRotation.mjs already defines

// toPoseQuat() BRIDGES TWO INCOMPATIBLE CONVENTIONS THAT SHARE A NAME. This file's q (and freeRotation.mjs's own
// rotateByQuat, re-exported above) is [qw,qx,qy,qz] -- the Hamilton convention. physics/voxelPose.js's OWN
// rotateByQuat -- used by physics/obbOverlap.js's obbFromPosed(), and matching THREE.Quaternion.set(x,y,z,w) --
// takes [qx,qy,qz,qw]. Passing a rigidBody6dof.mjs state.q into either of those unconverted silently rotates by
// the WRONG axis-angle (component [0] read as x instead of w) rather than throwing -- a landmine, not a formality.
// This is a plain component reorder, proven equivalent (not assumed) against voxelPose.js's own rotateByQuat
// across random quaternions and vectors in this file's own gate, section 9.
export function toPoseQuat(q) { return [q[1], q[2], q[3], q[0]]; }

/** World-to-body rotation: the inverse of rotateByQuat(q, ·). The conjugate of a unit quaternion is its inverse,
 * so this is exact wherever the caller's own q is unit -- the same requirement this module's own quaternion
 * renormalisation (freeRotation.mjs's stepQuat) already maintains every step. Shared by
 * rigidBody6dofCollision.mjs (contact-normal-to-body-frame for the impulse solver) and brain/autopilot6dof.mjs
 * (orientation-error-to-body-frame for its torque controller) -- a general primitive of this module's own
 * quaternion convention, not specific to either consumer. */
export function worldToBody(q, v) { return rotateByQuat([q[0], -q[1], -q[2], -q[3]], v); }

const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** domega/dt WITH an applied body-frame torque on top of freeRotation.mjs's own torque-free gyroscopic term. */
export function derivWithTorque(I, w, torqueBody, opt) {
    const g = eulerDeriv(I, w, opt);
    return [g[0] + torqueBody[0] / I[0], g[1] + torqueBody[1] / I[1], g[2] + torqueBody[2] / I[2]];
}

/**
 * RK4 on body-frame angular velocity, torque held constant across the four sub-steps -- the same treatment a
 * fixed-dt control input already gets elsewhere in this engine (physics/esBox3d.js's driveShip3d holds
 * input.turn constant for the whole tick too). With torqueBody = [0,0,0] this is derivWithTorque's own
 * reduction to eulerDeriv, so the whole function reduces to freeRotation.mjs's stepOmega value-identical
 * under === (see this file's header for the -0/+0 sign-of-zero nuance that makes "bit for bit" imprecise).
 */
export function stepOmegaWithTorque(I, w, torqueBody, dt, opt) {
    const d = (ww) => derivWithTorque(I, ww, torqueBody, opt);
    const k1 = d(w);
    const k2 = d(add3(w, k1, dt / 2));
    const k3 = d(add3(w, k2, dt / 2));
    const k4 = d(add3(w, k3, dt));
    return [0, 1, 2].map((n) => w[n] + dt / 6 * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]));
}

/** A fresh force/torque accumulator for one tick. */
export function createAccumulator() { return { force: [0, 0, 0], torque: [0, 0, 0] }; }

/**
 * Apply a force in BODY-frame coordinates, at a BODY-frame point (offset from the centre of mass, default the
 * CoM itself). Off-centre application induces torque = r x F, exactly as a real thruster mounted away from the
 * CoM would -- this is the one primitive every force in the system (main engine, RCS) goes through.
 */
export function applyForceAtPoint(acc, forceBody, pointBody = [0, 0, 0]) {
    acc.force = add3(acc.force, forceBody);
    acc.torque = add3(acc.torque, cross3(pointBody, forceBody));
}

/**
 * A rigid body's state plus its constant properties. `I` is the diagonal body-frame inertia (principal moments --
 * see this file's own header for the assumption); `mass` is constant. `q` is [w,x,y,z]; `w` is body-frame angular
 * velocity, matching freeRotation.mjs's own convention throughout.
 */
export function createBody({ mass = 1, I = [1, 1, 1], pos = [0, 0, 0], vel = [0, 0, 0], q = [1, 0, 0, 0], w = [0, 0, 0] } = {}) {
    return { mass, I: [...I], pos: [...pos], vel: [...vel], q: [...q], w: [...w] };
}

/**
 * Advance one tick. `acc` (createAccumulator()/applyForceAtPoint()) carries this tick's TOTAL body-frame force
 * and torque; it is consumed, not stored on the body -- a caller accumulates fresh forces every tick, matching
 * how thrust/turn inputs are re-read every frame throughout this engine (driveShip3d, stepFlight3d) rather than
 * persisting as a standing "thruster is on" flag inside the state itself. Returns a NEW state; does not mutate.
 *
 * ORDER MATCHERS freeRotation.mjs's OWN integrate(): the quaternion advances from the PRE-step angular velocity
 * first, then angular velocity updates -- so with torqueBody = [0,0,0] the angular half of this function is
 * indistinguishable from driving freeRotation.mjs directly, step for step.
 */
export function step(state, acc, dt, opt) {
    const forceWorld = rotateByQuat(state.q, acc.force);
    const vel = add3(state.vel, scale3(forceWorld, dt / state.mass));
    const pos = add3(state.pos, scale3(vel, dt));
    const how = orientationOf(opt);
    const q = how === "rk4" ? stepQuatRk4(state.I, state.q, state.w, acc.torque, dt, opt) : stepQuat(state.q, state.w, dt);
    const w = stepOmegaWithTorque(state.I, state.w, acc.torque, dt, opt);
    return { mass: state.mass, I: [...state.I], pos, vel, q, w };
}

// 2026-11-03 (unnumbered) -- `opt.orientation`, AN OPTION OFF UNLESS ASKED, registered as a round before it was built
// (physics/mechanics/ORIENTATION_STEP_WIP.md). "euler", the default and what no option means, moves the orientation by
// freeRotation.mjs's stepQuat(): one forward step from the angular velocity at the start of the tick, which is first
// order (the spinning body measured it). "rk4" moves it by RK4 alongside the angular velocity's own RK4, each of its four
// stages with that stage's angular velocity -- the same w1..w4 stepOmegaWithTorque() forms, by the same formulas. The
// angular velocity is stepOmegaWithTorque()'s either way, and the torque is held for the tick either way, so the option
// changes the orientation and nothing else. Anything else is refused rather than read as the default.
const ORIENTATIONS = Object.freeze(["euler", "rk4"]);
export function orientationOf(opt) {
    const how = opt && opt.orientation != null ? opt.orientation : "euler";
    if (!ORIENTATIONS.includes(how)) throw new Error(`rigidBody6dof.step: orientation ${JSON.stringify(how)} is neither "euler" nor "rk4"`);
    return how;
}
/** 1/2 q (x) (0, w): stepQuat()'s own derivative, term for term. */
const quatRate = (q, w) => [
    0.5 * (-q[1] * w[0] - q[2] * w[1] - q[3] * w[2]),
    0.5 * (q[0] * w[0] + q[2] * w[2] - q[3] * w[1]),
    0.5 * (q[0] * w[1] + q[3] * w[0] - q[1] * w[2]),
    0.5 * (q[0] * w[2] + q[1] * w[1] - q[2] * w[0]),
];
const add4 = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s, a[3] + b[3] * s];
/** The orientation after one tick by RK4, its stages at stepOmegaWithTorque()'s stage angular velocities; renormalised. */
export function stepQuatRk4(I, q, w, torqueBody, dt, opt) {
    const d = (ww) => derivWithTorque(I, ww, torqueBody, opt);
    const w1 = w, a1 = d(w1), w2 = add3(w, a1, dt / 2), a2 = d(w2), w3 = add3(w, a2, dt / 2), a3 = d(w3), w4 = add3(w, a3, dt);
    const k1 = quatRate(q, w1), k2 = quatRate(add4(q, k1, dt / 2), w2), k3 = quatRate(add4(q, k2, dt / 2), w3), k4 = quatRate(add4(q, k3, dt), w4);
    const o = [0, 1, 2, 3].map((n) => q[n] + dt / 6 * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]));
    const n = Math.hypot(o[0], o[1], o[2], o[3]);
    return o.map((c) => c / n);
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const I = boxInertia({ m: 12, hx: 1.2, hy: 0.9, hz: 2.4 });
    let s = createBody({ mass: 12, I, q: [1, 0, 0, 0] });
    const acc = createAccumulator();
    applyForceAtPoint(acc, [0, 0, 40], [0.3, 0, -2.4]);   // an engine mounted off-axis (x=0.3) as well as aft (z=-2.4), thrust along local +z
    for (let i = 0; i < 60; i++) s = step(s, acc, 1 / 30);
    return [
        "[rigidBody6dof] a dynamical 6DOF rigid body -- real force/torque, F=ma and Euler's equations (via",
        "                physics/mechanics/freeRotation.mjs's own solver, extended with an applied torque term),",
        "                alongside ev/flightModel3d.js's deliberately kinematic arcade model, not in place of it.",
        `  2 s of an engine mounted 0.3 m off-axis and 2.4 m aft, thrust 40 along local +z, on a 12 kg hull:`,
        `    pos ${s.pos.map((v) => v.toFixed(3))}   vel ${s.vel.map((v) => v.toFixed(3))}`,
        `    q ${s.q.map((v) => v.toFixed(4))}   w ${s.w.map((v) => v.toFixed(4))}  (off-centre thrust induced real spin)`,
    ];
}

// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs, the gate that exists because of exactly this bug): this module is
// loaded by a PAGE as well as run as a CLI, and `process` at module top level is a ReferenceError in a
// browser -- not a caught failure, an EVALUATION failure, so the whole module fails to load and every page
// that imports it dies with it. The node:url import itself must be INSIDE the guard too, dynamically -- a
// bare top-level `import ... from "node:url"` is resolved before this line ever runs, so an unguarded import
// crashes the browser before the guard below would even get a chance to skip it.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
