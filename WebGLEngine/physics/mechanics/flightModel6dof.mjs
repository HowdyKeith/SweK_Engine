// WebGLEngine/physics/mechanics/flightModel6dof.mjs -- v4866
//
// REAL FLIGHT, ONCE: a light trainer aircraft with gravity, an engine, a stalling wing and three control surfaces, flown by a pilot that sends FOUR numbers -- pitch, roll, yaw, throttle -- and by nothing else. This is
// the physics under every "real flight" pilot this tree trains (the fruit-fly brain, the GPU brain, the PD autopilot): it is built from the primitives that were already here and gated -- the rigid body
// (physics/mechanics/rigidBody6dof.mjs), the lifting surface (aeroSurface.mjs, with the stall it gained this round) and the four-surface assembly with control mixing (aircraftAssembly.mjs) -- and adds only
// what they left out: weight, thrust, fuselage drag, the air each surface actually sits in (the aircraft's velocity PLUS its rotation carried to the surface: v + w x r, which is where damping comes from),
// a ground, and the two things a pilot needs before it can be asked to fly: a TRIM (the controls that hold a steady flight) and the attitude and air-data numbers it reads.
//
// *** WHAT THE EARLIER FLIGHT PAGE (es-aircraft.html) DID NOT HAVE, AND THIS DOES. *** That page has no gravity and holds a fixed heading; its "pilot" steers a point. Here the aircraft falls if it is not flown,
// stalls if it is flown too slowly, spins its nose into the wind if it slips, and ends in a crash or a touchdown. A pilot that flies this has learned to fly.
//
// CONVENTIONS -- and one the earlier modules got WRONG IN A LABEL, NOT IN A NUMBER. Body: nose +X, up +Z, and +Y is the aircraft's LEFT (a right-handed frame: up x nose = left). aircraftAssembly.mjs names [0,1,0]
// RIGHT_BODY and its header says "right = +Y"; that is the aircraft's left wing, so its "leftWing" is physically the right one. NOTHING in the physics depends on the name -- the pair is symmetric and every
// sign in this file is derived from geometry -- and this module does not use the name: its pilot senses are defined from the frame itself and proved against it in the gate:
//   pitch  +1 = stick back = nose UP     (the elevator is driven by -pitch; rotation about +Y takes the nose DOWN)
//   roll   +1 = stick right = bank RIGHT (right wing down; rotation about +X by a positive angle)
//   yaw    +1 = right pedal = nose RIGHT (rotation about +Z by a NEGATIVE angle)
//   throttle 0..1.   World: +Z up, ground at z = 0; heading 0 = world +X, a right turn INCREASES it.
// attitude() and rates() report in those same senses (bank positive right wing down, pitch positive nose up, rates positive in the commanded direction), so a controller written against them needs no sign
// juggling and the three it would get wrong are the three the gate pins.
//
// THE AIRFRAME (TRAINER; a Cessna-172-class numbers, none of them fitted to anything but the closed forms the gate holds them to): 1000 kg, I = [1300, 1800, 2700], two wing halves of 8 m^2 (aspect ratio 7, lift
// slope 5.7, incidence 2 degrees) whose centre of lift sits 2.2 m out, a horizontal tail of 1.6 m^2 at 4.2 m aft, a fin/rudder of 1.0 m^2 at the same station, a fuselage drag area of 0.5 m^2, and an engine of 4000 N
// static thrust that fades linearly to zero at 90 m/s (thrust = 4000 * throttle * max(0, 1 - V/90)). Wings, tail and fin all stall (aeroSurface.STALL: 15 degrees to separate, 8 to finish). From those numbers:
// stall speed ~26.5 m/s, trim at 45 m/s needs 3.0 degrees of pitch and 0.66 throttle, the top level speed is ~52 m/s.
//
// *** THE JET (unnumbered). *** The same module also flies JET_TRAINER, a light jet trainer of an L-39-class number set (every number invented, in that class), because a spec can now say three things the trainer's does not: spec.engine = { kind: "jet", ... } (a thrust that does NOT fade with speed:
// thrustMax x (idle + (1 - idle) spool) x (rho / rho0)^0.8 x (1 - 0.35 Mach), where `spool` is the engine's own state -- the throttle after a first-order lag of 1.5 s, carried on the flight state, defaulting to the throttle itself for a state that has none, as a trim's or a hand-built one does);
// spec.atmosphere = "isa" (the lift, the drag and the engine fly in physics/mechanics/atmosphereISA.mjs's air at the aircraft's own height, and the Mach number is its speed over that height's speed of sound); and spec.machCrit / spec.waveCoeff (a drag-area rise of wing area x 20 (M - 0.78)^4 past the
// critical Mach number, Lock's fourth-power law). THE TRAINER SAYS NONE OF THIS, and flies as it always did, TO THE BIT (the gate holds a 1,200-tick flight in wind to the number it had before). trim() takes an `altitude` (500 m by default; only a jet's trim depends on it).
// WHAT THE JET DOES NOT HAVE, SAID PLAINLY: no compressibility effect on the lift or on the control surfaces (no Prandtl-Glauert, no shock stall, no Mach tuck: the airframe's top speed is thrust-limited at Mach 0.6 and never reaches the drag rise), no afterburner, no engine failure, no flaps or slats (so the
// landing speed is the clean stall speed plus a margin, 70 m/s and not 45), no ground roll (the same first-contact-ends-the-flight ground), no air above 11,000 m, and a thrust that is the same for every Mach number at a height except the linear fade.
//
// WHAT IS NOT IN IT, SAID PLAINLY (each is a thing a better model has, and none of them is hidden by a gate that happens to pass): no air-density change with altitude (the trainer flies the lowest few hundred
// metres), no dihedral effect (a slip does not roll the wings), no fuselage lift or side force, no downwash or prop wash on the tail, no flaps, no gyroscopic or torque effect from the engine, the thrust line
// passes through the centre of mass (no thrust-pitch coupling), and no ground model beyond classification: the first contact ENDS the flight as a touchdown or a crash (below). Takeoff and landing rolls are a later
// slice. Wind enters as a uniform steady vector.
//
// THE GROUND. Three wheels (nose, two mains) and the wingtips and tail are the contact points. A flight ends the tick any of them reaches z = 0: a WHEEL contact is a TOUCHDOWN if the point's sink speed is at most
// 3 m/s, the bank at most 15 degrees and the pitch within -10..+15 degrees (a wing-low or tail-first arrival is not a landing); anything else -- a tip, the tail, an inverted aircraft, a hard arrival -- is a CRASH.
// classify() is a pure function of the state, so stepFlight() on a state that has already ended returns it unchanged: a finished flight stays finished.
// TERRAIN. The ground is physics/mechanics/terrain.mjs's height function (flat at 0 by default, and then every number is what it was before the terrain existed, to the bit): a contact point is on the ground when it is at or under the surface UNDER IT (a wing tip can be over a hill the nose is not), and a
// touchdown also needs the ground no steeper than 5 degrees (INVENTED) at the aircraft. The sink is still the point's vertical speed and the bank and pitch limits are still the world's: nothing here lands an aircraft on a slope the way a pilot would, it only refuses to call it a landing.
//
// Pure: no DOM, no clock, no random. physics/mechanics/flightModel6dof-selfcheck.mjs holds this to closed forms (free fall, damping rates, the stall speed, the phugoid period, the engine) and to symmetry.
"use strict";
import { createBody, step, createAccumulator, applyForceAtPoint, worldToBody, rotateByQuat, cross3 } from "./rigidBody6dof.mjs";
import { applySurfaceForce, STALL } from "./aeroSurface.mjs";
import { createAircraft, mixControls, withDeflection } from "./aircraftAssembly.mjs";
import { FLAT, asTerrain } from "./terrain.mjs";
import { atmosphere } from "./atmosphereISA.mjs";

export const GRAVITY = 9.80665, DT = 1 / 60;
export { STALL };

export const TRAINER = Object.freeze({
    name: "trainer", mass: 1000, inertia: Object.freeze([1300, 1800, 2700]),
    airframe: Object.freeze({
        wingSpanHalf: 2.2, wingArea: 8, wingAspectRatio: 7, wingClAlpha: 5.7, tailMountX: -4.2, tailArea: 1.6, tailAspectRatio: 4, tailClAlpha: 4.5, rudderArea: 1.0,
        elevatorMaxDeflection: 0.4, aileronMaxDeflection: 0.4, rudderMaxDeflection: 0.4,
    }),
    wingIncidence: 0.035, stall: STALL, parasiteArea: 0.5, thrustMax: 4000, propSpeed: 90, thrustPoint: Object.freeze([2, 0, 0]),
    wheels: Object.freeze([[1.8, 0, -1.3], [-0.3, 1.2, -1.3], [-0.3, -1.2, -1.3]]),
    hull: Object.freeze([[0, 5.3, 0], [0, -5.3, 0], [-5.5, 0, 0.3], [2.5, 0, 0.2]]),   // wingtips, tail, nose
    touchdown: Object.freeze({ maxSink: 3, maxBank: 15 * Math.PI / 180, minPitch: -10 * Math.PI / 180, maxPitch: 15 * Math.PI / 180, maxSlope: 5 * Math.PI / 180 }),   // maxSlope INVENTED: wheels down on ground steeper than this are a crash, not a touchdown
});

/**
 * A LIGHT JET TRAINER (an L-39-class number set; EVERY NUMBER IS INVENTED to be in that class, none is fitted to an aircraft, and the gate holds them only to the closed forms they produce): 4,500 kg, a 18.8 m^2 wing of aspect ratio 4.7, a tail sized for a tail volume of about 0.4,
 * a 16.9 kN engine. The engine is the JET law (see the header): thrust that does not die with speed, thins with the air, takes `spoolTime` to answer the throttle, and falls off with Mach number. It flies in the ISA troposphere (physics/mechanics/atmosphereISA.mjs) and
 * its drag rises past the critical Mach number. Stall is the same flat-plate stall the trainer has (15 degrees to separate), which at this wing loading is a stall speed of about 60 m/s at 1,000 m (the elevator runs out a metre per second sooner, at 61 m/s at sea level);
 * level flight is possible from there to about 194 m/s at sea level (Mach 0.57: thrust meets drag, well under the critical Mach number) and from 83 to 198 m/s at 6,000 m. MEASURED, in the gate.
 */
export const JET_TRAINER = Object.freeze({
    name: "jet trainer", mass: 4500, inertia: Object.freeze([5200, 9500, 13500]),
    airframe: Object.freeze({
        wingSpanHalf: 2.35, wingArea: 9.4, wingAspectRatio: 4.7, wingClAlpha: 4.5, tailMountX: -5.6, tailArea: 3.2, tailAspectRatio: 3.2, tailClAlpha: 3.8, rudderArea: 2.0,
        elevatorMaxDeflection: 0.4, aileronMaxDeflection: 0.15, rudderMaxDeflection: 0.4,   // the aileron is cut to 0.15 rad: at 140 m/s the trainer's 0.4 rolls a jet at 550 degrees a second (steady roll rate = effectiveness x deflection x V / the wing's arm)
    }),
    wingIncidence: 0.035, stall: STALL, parasiteArea: 0.12, thrustMax: 16900, thrustPoint: Object.freeze([-2, 0, 0]),
    engine: Object.freeze({ kind: "jet", idle: 0.04, spoolTime: 1.5, densityExp: 0.8, machDecay: 0.35 }),   // INVENTED: idle thrust 4% of full, a 1.5 s first-order spool, thrust ~ density^0.8, losing 35% of itself per Mach number
    trimSpeeds: Object.freeze(Array.from({ length: 13 }, (_, i) => 70 + 10 * i)), trimAltitudes: Object.freeze([0, 1500, 3000, 4500, 6000, 8000]),   // where a pilot's trim table is built (brain/autopilotFlight.mjs): 70..190 m/s at six heights
    atmosphere: "isa", machCrit: 0.78, waveCoeff: 20,   // INVENTED: the drag-divergence Mach number, and Lock's fourth-power law for the rise past it: CdA += wing area x 20 (M - Mcrit)^4
    wheels: Object.freeze([[3.2, 0, -1.6], [-0.4, 1.7, -1.6], [-0.4, -1.7, -1.6]]),
    hull: Object.freeze([[0, 4.7, 0], [0, -4.7, 0], [-6.5, 0, 0.4], [4.0, 0, 0.2]]),
    touchdown: Object.freeze({ maxSink: 3.5, maxBank: 12 * Math.PI / 180, minPitch: -8 * Math.PI / 180, maxPitch: 14 * Math.PI / 180, maxSlope: 5 * Math.PI / 180 }),
});

export const AIR_DENSITY = 1.225;   // the value aeroSurface.mjs uses; the trainer does not vary it (see the header) and a model with spec.atmosphere "isa" (the jet) does

/** Build a flight model from an airframe spec (default TRAINER). Returns { spec, aircraft, mass, inertia, weight }. The aircraft is aircraftAssembly's four surfaces with the wing incidence set and every surface given the stall. */
export function createFlightModel(spec = TRAINER) {
    const aircraft = createAircraft({ ...spec.airframe });
    for (const k of ["leftWing", "rightWing"]) aircraft.surfaces[k].incidence = spec.wingIncidence;
    if (spec.stall) for (const s of Object.values(aircraft.surfaces)) s.stall = { ...spec.stall };
    return { spec, aircraft, mass: spec.mass, inertia: [...spec.inertia], weight: spec.mass * GRAVITY };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** The pilot's four numbers, sanitised: pitch/roll/yaw clamped to [-1, 1], throttle to [0, 1]; a NaN or an infinity is read as 0 (so a diverged controller cannot put NaN into the physics). */
export function sanitize(c = {}) {
    return { pitch: clamp(num(c.pitch), -1, 1), roll: clamp(num(c.roll), -1, 1), yaw: clamp(num(c.yaw), -1, 1), throttle: clamp(num(c.throttle), 0, 1) };
}

/** Pilot senses -> the assembly's mixer (see the header: its positive pitch is nose DOWN, its positive roll is a LEFT bank, its positive yaw is nose LEFT). `controls` are used as given; the public functions sanitise first. */
const deflectionsOf = (model, c) => mixControls(model.aircraft, { pitch: -c.pitch, roll: -c.roll, yaw: -c.yaw });
export function surfaceDeflections(model, controls) { return deflectionsOf(model, sanitize(controls)); }

/** The extra drag area (m^2) of a model whose spec has a critical Mach number: wing area x waveCoeff x (M - Mcrit)^4 past it (Lock's fourth-power law), 0 for a model without one and below it. `air` is atmosphere() at the aircraft's height. */
function waveArea(model, V, air) {
    const spec = model.spec;
    if (!(spec.machCrit > 0) || !air) return 0;
    const M = V / air.a; if (!(M > spec.machCrit)) return 0;
    return model.aircraft.surfaces.leftWing.area * 2 * spec.waveCoeff * Math.pow(M - spec.machCrit, 4);
}

/**
 * The engine's thrust (N) at a throttle, an airspeed and a height. The PROPELLER law (a spec without an `engine`; the trainer): thrustMax x throttle x (1 - V / propSpeed), a thrust that dies at propSpeed. The JET law (spec.engine.kind "jet"):
 *   thrustMax x (idle + (1 - idle) x spool) x (rho / rho0)^densityExp x max(0, 1 - machDecay x M),
 * where `spool` is the engine's own state (state.spool, 0..1: the throttle after a first-order lag of spoolTime seconds) and defaults to the throttle itself when the state has none -- a trim, or a state a caller built by hand, is a steady state. M = V / a at the height.
 */
function thrustOf(spec, throttle, V, air, spool) {
    const e = spec.engine;
    if (!e || e.kind !== "jet") return spec.thrustMax * throttle * Math.max(0, 1 - V / spec.propSpeed);
    const a = air || atmosphere(0), s = spool === undefined ? throttle : spool;
    return spec.thrustMax * (e.idle + (1 - e.idle) * s) * Math.pow(a.rho / AIR_DENSITY, e.densityExp) * Math.max(0, 1 - e.machDecay * (V / a.a));
}

/** The force and moment sum for ALREADY-SANITISED controls. trim() calls this directly: it must be able to ask for a throttle of 1.13 to learn that a speed is out of reach, which the clamp would hide. */
function evaluate(model, state, c, windWorld) {
    const spec = model.spec, defl = deflectionsOf(model, c), acc = createAccumulator();
    const wind = [state.vel[0] - windWorld[0], state.vel[1] - windWorld[1], state.vel[2] - windWorld[2]], vb = worldToBody(state.q, wind), perSurface = {};
    const air = spec.atmosphere === "isa" ? atmosphere(state.pos[2]) : null, rho = air ? air.rho : AIR_DENSITY;   // the trainer holds the sea-level density; a model that says "isa" flies in the standard atmosphere at its own height
    for (const name of Object.keys(model.aircraft.surfaces)) {
        const s = withDeflection(model.aircraft.surfaces[name], defl[name]), r = cross3(state.w, s.mount);
        perSurface[name] = applySurfaceForce(acc, [vb[0] + r[0], vb[1] + r[1], vb[2] + r[2]], s, rho);
    }
    const V = Math.hypot(vb[0], vb[1], vb[2]);
    if (V > 1e-6) { const k = -0.5 * rho * V * (spec.parasiteArea + waveArea(model, V, air)); applyForceAtPoint(acc, [k * vb[0], k * vb[1], k * vb[2]], [0, 0, 0]); }
    const thrust = thrustOf(spec, c.throttle, V, air, state.spool);
    applyForceAtPoint(acc, [thrust, 0, 0], spec.thrustPoint);
    applyForceAtPoint(acc, worldToBody(state.q, [0, 0, -state.mass * GRAVITY]), [0, 0, 0]);   // the state's own mass: the same one the integrator divides by
    return { acc, perSurface, airspeed: V, thrust, mach: air ? V / air.a : null };
}

/**
 * Every force and moment on the aircraft in this state, body frame. `windWorld` is the air's velocity (default still). Each surface sits in the air at ITS point: the aircraft's air-relative velocity plus
 * w x r. Returns { acc, perSurface, airspeed, thrust }: `acc` is a rigidBody6dof accumulator ready for step(); perSurface is keyed like the assembly's surfaces ({force, cl, cd, alpha, q}).
 */
export function forcesAndMoments(model, state, controls, windWorld = [0, 0, 0]) { return evaluate(model, state, sanitize(controls), windWorld); }

// ---- attitude and air data (the pilot's senses; see the header) -------------------------------------------------------------------------------------------------------------------------------------------------

const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const axisQ = (axis, angle) => { const s = Math.sin(angle / 2); return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]; };

/** The body quaternion for a heading (right turn positive), pitch (nose up positive) and bank (right wing down positive): yaw about +Z by -heading, then pitch about +Y by -pitch, then roll about +X by +bank. */
export function attitudeQuat(heading = 0, pitch = 0, bank = 0) {
    return qmul(qmul(axisQ([0, 0, 1], -heading), axisQ([0, 1, 0], -pitch)), axisQ([1, 0, 0], bank));
}

/** A flight state: at `pos`, flying at `speed` along the flight path `gamma` (climb angle) in `heading`, the nose at `pitch` and the wings at `bank`, turning at `w` (body rates, default none). It carries its own mass and inertia (default the TRAINER's); weight is the state's mass times g. */
export function createState({ pos = [0, 0, 300], speed = 45, heading = 0, pitch = 0, bank = 0, gamma = 0, w = [0, 0, 0], mass = TRAINER.mass, inertia = TRAINER.inertia } = {}) {
    const h = [Math.cos(heading), -Math.sin(heading)];
    return createBody({ mass, I: inertia, pos, vel: [speed * Math.cos(gamma) * h[0], speed * Math.cos(gamma) * h[1], speed * Math.sin(gamma)], q: attitudeQuat(heading, pitch, bank), w });
}

/** { pitch, bank, heading, airspeed, alpha, beta, gamma, climb, altitude } for a state (angles in radians, in the pilot's senses; alpha is the body angle of attack, beta positive when the aircraft slips to the right). */
export function attitude(state, windWorld = [0, 0, 0]) {
    const f = rotateByQuat(state.q, [1, 0, 0]), yAxis = rotateByQuat(state.q, [0, 1, 0]), up = rotateByQuat(state.q, [0, 0, 1]);
    const vb = worldToBody(state.q, [state.vel[0] - windWorld[0], state.vel[1] - windWorld[1], state.vel[2] - windWorld[2]]), V = Math.hypot(vb[0], vb[1], vb[2]);
    return {
        pitch: Math.asin(clamp(f[2], -1, 1)), bank: Math.atan2(yAxis[2], up[2]), heading: Math.atan2(-f[1], f[0]),
        airspeed: V, alpha: Math.atan2(-vb[2], vb[0]), beta: V > 1e-9 ? Math.asin(clamp(-vb[1] / V, -1, 1)) : 0,
        gamma: Math.hypot(state.vel[0], state.vel[1], state.vel[2]) > 1e-9 ? Math.asin(clamp(state.vel[2] / Math.hypot(state.vel[0], state.vel[1], state.vel[2]), -1, 1)) : 0, climb: state.vel[2], altitude: state.pos[2],
    };
}

/** Body angular rates in the pilot's senses: { roll: positive right bank, pitch: positive nose up, yaw: positive nose right } (rad/s). */
export function rates(state) { return { roll: state.w[0], pitch: -state.w[1], yaw: -state.w[2] }; }

// ---- ground -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Where each contact point is and how fast it is sinking (z above the terrain under it, and -vz of the point: the body's velocity plus w x r). */
function contactPoints(model, state, terrain = FLAT) {
    const out = [];
    const one = (p, kind) => {
        const off = rotateByQuat(state.q, p), wb = rotateByQuat(state.q, state.w), vel = [state.vel[0] + (wb[1] * off[2] - wb[2] * off[1]), state.vel[1] + (wb[2] * off[0] - wb[0] * off[2]), state.vel[2] + (wb[0] * off[1] - wb[1] * off[0])];
        out.push({ kind, z: state.pos[2] + off[2] - (terrain.flat ? 0 : terrain.height(state.pos[0] + off[0], state.pos[1] + off[1])), sink: -vel[2] });
    };
    for (const p of model.spec.wheels) one(p, "wheel");
    for (const p of model.spec.hull) one(p, "hull");
    return out;
}

/**
 * "airborne" | "touchdown" | "crashed" | "lost" (a non-finite state), with the numbers that decided it. A pure function of the state and the terrain (physics/mechanics/terrain.mjs: the flat ground at 0 by default, and then the same bits as before it existed; a bare function of (x, y) or a spec is accepted).
 * A contact point is on the ground when it is at or under the surface UNDER IT (a wingtip can be over a hill the nose is not); a touchdown also needs the ground to be no steeper than 5 degrees (INVENTED) -- wheels down on a steep slope are a crash. The bank and pitch limits stay the WORLD's.
 */
export function classify(model, state, terrain = FLAT) {
    if (![...state.pos, ...state.vel, ...state.q, ...state.w].every(Number.isFinite)) return { status: "lost" };
    terrain = asTerrain(terrain);
    const hit = contactPoints(model, state, terrain).filter((p) => p.z <= 0);
    if (!hit.length) return { status: "airborne" };
    const a = attitude(state), t = model.spec.touchdown, sink = Math.max(...hit.map((p) => p.sink));
    const slopeOk = terrain.flat || Math.acos(Math.min(1, Math.max(-1, terrain.normal(state.pos[0], state.pos[1])[2]))) <= t.maxSlope;
    const gentle = hit.every((p) => p.kind === "wheel") && sink <= t.maxSink && Math.abs(a.bank) <= t.maxBank && a.pitch >= t.minPitch && a.pitch <= t.maxPitch && slopeOk;
    return { status: gentle ? "touchdown" : "crashed", sink, bank: a.bank, pitch: a.pitch, hull: hit.some((p) => p.kind === "hull") };
}

/** One tick: { state, status, ...classification }. A state that has already ended is returned unchanged. */
export function stepFlight(model, state, controls, dt = DT, windWorld = [0, 0, 0], terrain = FLAT) {
    terrain = asTerrain(terrain);
    const before = classify(model, state, terrain);
    if (before.status !== "airborne") return { state, ...before };
    const next = step(state, forcesAndMoments(model, state, controls, windWorld).acc, dt);
    const e = model.spec.engine;
    if (e && e.kind === "jet") { const t = sanitize(controls).throttle, s0 = state.spool === undefined ? t : state.spool; next.spool = s0 + (t - s0) * (1 - Math.exp(-dt / e.spoolTime)); }   // the engine's answer to the throttle: a state that has none starts AT the throttle
    return { state: next, ...classify(model, next, terrain) };
}

// ---- trim -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The controls that hold a steady, straight flight at `speed` and climb angle `gamma` (0 = level): a Newton solve over [pitch attitude, stick, throttle] for zero body force along X and Z and zero pitching
 * moment. Returns { speed, gamma, pitchAttitude, alpha, pitch, throttle, residual: [Fx, Fz, My], converged, feasible }: `pitch` is the stick (+ = back), `feasible` is converged with the throttle in 0..1, the
 * stick within +-1 and the wing below its stall angle -- an aircraft below its stall speed has a "solution" the aircraft cannot hold.
 */
export function trim(model, speed, { gamma = 0, altitude = 500 } = {}) {   // `altitude` matters only to a model that flies in the standard atmosphere (the jet): the trainer's trim is the same at every height
    const resid = (x) => {
        const s = createState({ pos: [0, 0, altitude], speed, pitch: x[0], gamma, mass: model.mass, inertia: model.inertia }), f = evaluate(model, s, { pitch: x[1], roll: 0, yaw: 0, throttle: x[2] }, [0, 0, 0]).acc;
        return [f.force[0], f.force[2], f.torque[1]];
    };
    let x = [gamma + 0.05, 0, 0.6], converged = false;
    for (let it = 0; it < 60; it++) {
        const r0 = resid(x), J = [];
        for (let j = 0; j < 3; j++) { const d = x.slice(); d[j] += 1e-6; const r1 = resid(d); J.push(r1.map((v, i) => (v - r0[i]) / 1e-6)); }
        const A = [0, 1, 2].map((i) => [J[0][i], J[1][i], J[2][i], -r0[i]]);
        for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-14) return fail(); for (let r = c + 1; r < 3; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; } }
        const dx = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let sum = A[i][3]; for (let k = i + 1; k < 3; k++) sum -= A[i][k] * dx[k]; dx[i] = sum / A[i][i]; }
        const lim = Math.min(1, 0.2 / Math.max(Math.abs(dx[0]), 1e-12));   // a step that moves the attitude by more than 0.2 rad is shortened
        x = x.map((v, i) => v + lim * dx[i]);
        if (!x.every(Number.isFinite)) return fail();
        if (Math.hypot(...dx) < 1e-9) { converged = true; break; }
    }
    function fail() { return { speed, gamma, pitchAttitude: NaN, alpha: NaN, pitch: NaN, throttle: NaN, residual: [NaN, NaN, NaN], converged: false, feasible: false }; }
    const residual = resid(x), alpha = x[0] - gamma, stallAngle = model.spec.stall ? model.spec.stall.angle : Infinity;
    const wingAlpha = alpha + model.spec.wingIncidence;
    return { speed, gamma, pitchAttitude: x[0], alpha, pitch: x[1], throttle: x[2], residual, converged, feasible: converged && x[2] >= 0 && x[2] <= 1 && Math.abs(x[1]) <= 1 && wingAlpha < stallAngle };
}

/** The highest speed at which level flight is feasible at full throttle (bisection on the trim; the throttle rises with speed past the minimum-power speed). */
export function maxLevelSpeed(model, lo = 40, hi = 90) {
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2, t = trim(model, mid); if (t.converged && t.throttle <= 1) lo = mid; else hi = mid; }
    return lo;
}

// ---- front door -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function reportLines() {
    const m = createFlightModel(), lines = [`[flightModel6dof] ${m.spec.name}: ${m.mass} kg, ${(m.aircraft.surfaces.leftWing.area * 2).toFixed(0)} m^2 of wing, ${m.spec.thrustMax} N static thrust, weight ${m.weight.toFixed(0)} N`];
    for (const V of [30, 38, 45, 52]) { const t = trim(m, V); lines.push(`  trim ${V} m/s: pitch ${(t.pitchAttitude * 180 / Math.PI).toFixed(2)} deg  stick ${t.pitch.toFixed(3)}  throttle ${t.throttle.toFixed(3)}  ${t.feasible ? "feasible" : "NOT feasible"}`); }
    lines.push(`  top level speed ${maxLevelSpeed(m).toFixed(1)} m/s`);
    const j = createFlightModel(JET_TRAINER), a0 = atmosphere(0), slow = (() => { let lo = 40, hi = 120; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (trim(j, mid, { altitude: 1000 }).feasible) hi = mid; else lo = mid; } return hi; })(), top = maxLevelSpeed(j, 100, 300);
    lines.push(`[flightModel6dof] ${j.spec.name}: ${j.mass} kg, ${(j.aircraft.surfaces.leftWing.area * 2).toFixed(0)} m^2 of wing, ${j.spec.thrustMax} N static thrust (a jet: it does not fade with speed, it thins with the air), weight ${j.weight.toFixed(0)} N`);
    for (const V of [100, 140, 180]) { const t = trim(j, V, { altitude: 1000 }); lines.push(`  jet trim ${V} m/s at 1,000 m: pitch ${(t.pitchAttitude * 180 / Math.PI).toFixed(2)} deg  stick ${t.pitch.toFixed(3)}  throttle ${t.throttle.toFixed(3)}  ${t.feasible ? "feasible" : "NOT feasible"}`); }
    lines.push(`  jet level flight from ${slow.toFixed(1)} m/s to ${top.toFixed(1)} m/s (Mach ${(top / a0.a).toFixed(2)} at the top, at 500 m)`);
    return lines;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
