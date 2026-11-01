// WebGLEngine/physics/mechanics/subModel6dof.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SUBMARINE, ONCE: the underwater counterpart of physics/mechanics/flightModel6dof.mjs. A small crewless research submarine with weight, buoyancy, a ballast trim tank, a screw, one pair of stern planes and a rudder,
// flown by a pilot that sends FOUR numbers -- pitch, yaw, thrust, ballast -- and by nothing else. It is built from the same primitives the flight model uses (the rigid body in physics/mechanics/rigidBody6dof.mjs: forces
// and torques in the body frame, a unit quaternion, Euler's equations) and adds only what water has that air does not: buoyancy, a righting moment, added mass, a hull that is unstable in yaw and pitch, and a seabed.
//
// CONVENTIONS are flightModel6dof's, so the autopilots, the features and the sign gates read the same: body nose +X, up +Z, +Y the vessel's LEFT; world +Z up, THE SURFACE AT z = 0 AND THE WATER BELOW IT (depth = -z); heading 0 =
// world +X, a right turn INCREASES it. The pilot's senses:
//   pitch  +1 = stern planes set to take the nose UP     yaw  +1 = rudder to take the nose RIGHT
//   thrust -1..+1 (the screw reverses, at 60% of its forward thrust)
//   ballast -1..+1: +1 FLOODS the trim tank (the vessel gets heavier and sinks), -1 blows it (lighter, rises). It moves the weight by +-3% of the displacement and is a command, not a pump: there is no pump rate or tank state.
// attitude() and rates() report in those senses (bank positive right side down, pitch positive nose up, rates positive in the commanded direction).
//
// THE VESSEL (EXPLORER; round numbers, none fitted to anything but the closed forms the gate holds them to): 6000 kg, 8 m by 1.2 m, I = [1100, 32500, 32500] kg m^2 (these include the hull's own added inertia), neutrally
// buoyant (buoyancy = weight at ballast 0) in sea water (1025 kg/m^3). The centre of buoyancy is 0.05 m above the centre of gravity (so a tilt is RIGHTED, and righted at any speed -- including none). A screw of 3000 N
// static thrust. Axial drag 0.5 rho 0.25 (pi R^2) V|V| puts the top speed at about 4.5 m/s; a stern plane pair and a rudder (0.35 m^2, lift slope 2.5, +-0.4 rad) sit 3.2 m aft.
//
// WHAT WATER ADDS, AND HOW IT IS KEPT HONEST:
//   BUOYANCY     B = rho g V_displaced acts at the centre of buoyancy, W at the centre of gravity: net vertical force B - W(1 + 0.03 ballast + weightError) and the righting torque from the offset. Where the hull breaks the
//                surface the displaced volume falls off linearly over one hull diameter, so a vessel that broaches drops back, and a vessel above the surface is a vessel in air.
//   ADDED MASS   the integrator is given a VIRTUAL mass of 1.3 times the real one (the state carries it); the weight and buoyancy use the real mass. One number for all three axes: a slender hull's real added mass is
//                small along the axis and about its own mass across it, so this over-states surge and under-states sway and heave. The gate holds the closed forms; it does not claim the added-mass tensor.
//   DRAG         axial: -0.5 rho Cd_x A_x u|u|; crossflow: -0.5 rho Cd_y A_y v|v| (Cd_y 0.9, A_y = L D 0.7) in sway and heave, and a rotational damping (linear plus quadratic in the rate) for the crossflow drag along the hull.
//   FINS         a stern plane pair (normal +Z) and a rudder (normal +Y) at the tail: lift = q S CLa alpha, alpha = the deflection (reversed when the vessel backs) minus the flow angle AT THE FIN (the vessel's velocity plus
//                w x r), clipped at 0.35 rad (a stall with no recovery curve). They are the vessel's pitch and yaw damping and they are useless at rest: a vessel with no speed steers its depth with ballast alone.
//   MUNK MOMENT  a slender hull is unstable: its moment turns it broadside to its own motion, M = kM u w (pitch) and -kM u v (yaw), kM = 1000 kg. The fins beat it above ~2.3 m/s of speed; below that, the righting
//                moment and the pilot do. This is why the autopilot gains are not constants of the speed.
//   CURRENT      a steady water velocity (default none), like the flight model's wind: the vessel is in the WATER, so drag, fins and speed are measured relative to it.
//
// WHAT IS NOT IN IT, SAID PLAINLY: no pressure compression of the hull or water (buoyancy does not change with depth), no thermocline or salinity change, no free-surface waves, no body lift on the hull (only the fins lift),
// no propeller torque or prop wash on the fins, no added-mass tensor (one scalar, above), no cavitation, no rate limit on the planes or the tank, a bare screw curve. It is a vehicle for training and grading pilots, not
// a naval architect's model.
//
// THE ENDS. A flight ends the tick the vessel is: BROACHED (the centre of gravity above the surface), GROUNDED (the hull's underside touches the seabed), CRUSHED (deeper than the test depth) or LOST (a non-finite state).
// classify() is a pure function of the state, so stepSub() on a state that has ended returns it unchanged. Pure: no DOM, no clock, no random. physics/mechanics/subModel6dof-selfcheck.mjs holds this to closed forms.
"use strict";
import { createBody, step, createAccumulator, applyForceAtPoint, worldToBody, rotateByQuat, cross3 } from "./rigidBody6dof.mjs";

export const GRAVITY = 9.80665, DT = 1 / 30, WATER_DENSITY = 1025;

export const EXPLORER = Object.freeze({
    name: "explorer", mass: 6000, inertia: Object.freeze([1100, 32500, 32500]), length: 8, radius: 0.6,
    addedMass: 0.3, bg: 0.05, ballastRange: 0.03, thrustMax: 3000, reverseFraction: 0.6,
    cdAxial: 0.25, cdCross: 0.9, crossFill: 0.7, rotDamp: Object.freeze([2500, 14000, 14000]), rotDampQuad: Object.freeze([4000, 22000, 22000]), munk: 1000,
    finArea: 0.35, finLiftSlope: 2.5, finArm: 3.2, finMax: 0.4, finStall: 0.35,
    seabed: 50, crushDepth: 100,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** Build a vessel model from a spec (default EXPLORER): { spec, mass, vmass (the integrator's), inertia, weight, frontalArea, sideArea }. */
export function createSubModel(spec = EXPLORER) {
    return { spec, mass: spec.mass, vmass: spec.mass * (1 + spec.addedMass), inertia: [...spec.inertia], weight: spec.mass * GRAVITY, frontalArea: Math.PI * spec.radius ** 2, sideArea: spec.length * 2 * spec.radius * spec.crossFill };
}

/** The pilot's four numbers, sanitised: pitch, yaw, thrust, ballast all clamped to [-1, 1]; a NaN or an infinity is read as 0. */
export function sanitize(c = {}) {
    const o = { pitch: clamp(num(c.pitch), -1, 1), yaw: clamp(num(c.yaw), -1, 1), thrust: clamp(num(c.thrust), -1, 1), ballast: clamp(num(c.ballast), -1, 1) };
    // v4901 -- TWO OPTIONAL EXTRA COMMANDS, present in the result ONLY when the caller sent them, so a pilot that sends the four numbers gets back exactly the four it always did:
    // `blow` (0..1) the emergency blow, and `release` (0..1) the drop weight. Both are read as "on" above 0.5 and do nothing unless the model has the tank fields below.
    if (c.blow !== undefined) o.blow = clamp(num(c.blow), 0, 1);
    if (c.release !== undefined) o.release = clamp(num(c.release), 0, 1);
    return o;
}

// ---- the ballast tank, when a model has one (v4901) -------------------------------------------------------------------------------------------------------------------------------------------------------
// *** OPTIONAL, AND OFF BY DEFAULT, SO EVERY EXISTING VESSEL, PILOT AND GATE IS BIT-IDENTICAL. *** The header's ballast is a COMMAND the weight follows at once: no pump rate, no air, no emergency blow. A spec that names any of
//   tankRate        level units per second the tank can FLOOD or be blown at its normal rate (level is the ballast number: +1 full of water, -1 blown)
//   airMax          the air in the bottle, in level units: blowing the tank down by d spends d of it, flooding spends none, and with none left the tank cannot be blown at all
//   emergencyRate   with the `blow` command on, the tank is driven to -1 at THIS rate, which is faster than tankRate, spending `emergencyAirCost` (default 2) times the air per level unit
//   dropMass        the fraction of the vessel's weight a one-way DROP WEIGHT sheds when the `release` command goes on (nothing is ever taken back)
// gets a `tank` on its state ({ level, air, released }), set up on the first tick and advanced by stepSub. A spec naming ONLY dropMass keeps the instant ballast of the header (the tank state exists, its level is not used).
const TANK_FIELDS = ["tankRate", "airMax", "emergencyRate", "dropMass"];
/** Does this model have any tank field? */
export const hasTank = (model) => TANK_FIELDS.some((k) => model.spec[k] !== undefined);
/** Does its ballast have DYNAMICS (a rate, an air supply or an emergency blow), so the weight follows the tank's level and not the command? */
export const dynamicTank = (model) => ["tankRate", "airMax", "emergencyRate"].some((k) => model.spec[k] !== undefined);
/** A fresh tank: level 0 (neutral), the whole bottle, nothing dropped. */
export const initialTank = (model) => ({ level: 0, air: model.spec.airMax !== undefined ? model.spec.airMax : Infinity, released: false });
/** One tick of the tank for the sanitised command `c`: { level, air, released }. Pure. */
export function advanceTank(model, tank, c, dt = DT) {
    const s = model.spec;
    const emergency = c.blow !== undefined && c.blow > 0.5 && s.emergencyRate !== undefined;
    const target = emergency ? -1 : c.ballast, rate = emergency ? s.emergencyRate : (s.tankRate !== undefined ? s.tankRate : Infinity);
    let d = target - tank.level;
    const cap = rate * dt;
    if (d > cap) d = cap; else if (d < -cap) d = -cap;
    let air = tank.air;
    if (d < 0 && s.airMax !== undefined) {
        const cost = emergency ? (s.emergencyAirCost !== undefined ? s.emergencyAirCost : 2) : 1;
        const afford = air / cost, used = Math.min(-d, afford);   // the tank can only be blown as far as the air reaches
        d = -used; air -= used * cost;
    }
    return { level: tank.level + d, air, released: tank.released || (c.release !== undefined && c.release > 0.5 && s.dropMass !== undefined && s.dropMass > 0) };
}

/** The fraction of the hull below the surface for a centre of gravity at height z (z up, the surface at 0): 1 at z <= -R, 0 at z >= +R, linear between. */
export const submerged = (model, z) => clamp((model.spec.radius - z) / (2 * model.spec.radius), 0, 1);

// a lifting fin with its normal on body axis `ax` (2 = Z the stern planes, 1 = Y the rudder): returns the force along that axis, at the fin's own station
function finForce(model, vb, w, ax, deflection) {
    const s = model.spec, r = [-s.finArm, 0, 0], rot = cross3(w, r), vf = [vb[0] + rot[0], vb[1] + rot[1], vb[2] + rot[2]];
    const u = vf[0], vn = vf[ax], sgn = u >= 0 ? 1 : -1, alpha = clamp(deflection * s.finMax * sgn - Math.atan2(vn, Math.abs(u)), -s.finStall, s.finStall);
    return 0.5 * WATER_DENSITY * (u * u + vn * vn) * s.finArea * s.finLiftSlope * alpha;
}

/**
 * Every force and moment on the vessel in this state, body frame. `current` is the water's velocity (default still). `weightError` is a fraction of the weight the vessel is heavier than neutral (a payload, a leak;
 * default 0). Returns { acc, speed, frac, fins: { plane, rudder }, thrust }: `acc` is a rigidBody6dof accumulator ready for step().
 */
export function forcesAndMoments(model, state, controls, current = [0, 0, 0], weightError = 0) {
    const s = model.spec, c = sanitize(controls), acc = createAccumulator(), frac = submerged(model, state.pos[2]);
    const rel = [state.vel[0] - current[0], state.vel[1] - current[1], state.vel[2] - current[2]], vb = worldToBody(state.q, rel), W = model.weight, V = Math.hypot(vb[0], vb[1], vb[2]);
    // weight at the CG (the state's origin), buoyancy at the centre of buoyancy, bg above it: the righting torque
    // v4901 -- with a tank that has dynamics the weight follows the TANK'S level (what the pump has done so far), not the command; with a drop weight shed, the weight is less by dropMass. A model with neither is the line it always was.
    const tk = hasTank(model) ? (state.tank || initialTank(model)) : null, ballastNow = tk && dynamicTank(model) ? tk.level : c.ballast, shed = tk && tk.released ? s.dropMass : 0;
    applyForceAtPoint(acc, worldToBody(state.q, [0, 0, -W * (1 + s.ballastRange * ballastNow + weightError - shed)]), [0, 0, 0]);
    applyForceAtPoint(acc, worldToBody(state.q, [0, 0, W * frac]), [0, 0, s.bg]);
    if (frac > 0) {
        const k = 0.5 * WATER_DENSITY * frac;
        applyForceAtPoint(acc, [-k * s.cdAxial * model.frontalArea * vb[0] * Math.abs(vb[0]), -k * s.cdCross * model.sideArea * vb[1] * Math.abs(vb[1]), -k * s.cdCross * model.sideArea * vb[2] * Math.abs(vb[2])], [0, 0, 0]);
        const thrust = s.thrustMax * (c.thrust >= 0 ? c.thrust : c.thrust * s.reverseFraction) * frac;
        applyForceAtPoint(acc, [thrust, 0, 0], [0, 0, 0]);
        const plane = frac * finForce(model, vb, state.w, 2, -c.pitch), rudder = frac * finForce(model, vb, state.w, 1, c.yaw);
        applyForceAtPoint(acc, [0, 0, plane], [-s.finArm, 0, 0]);
        applyForceAtPoint(acc, [0, rudder, 0], [-s.finArm, 0, 0]);
        // rotational damping (crossflow along the hull) and the Munk moment, as pure torques
        acc.torque[0] -= frac * (s.rotDamp[0] + s.rotDampQuad[0] * Math.abs(state.w[0])) * state.w[0];
        acc.torque[1] += -frac * (s.rotDamp[1] + s.rotDampQuad[1] * Math.abs(state.w[1])) * state.w[1] + s.munk * vb[0] * vb[2] * frac;
        acc.torque[2] += -frac * (s.rotDamp[2] + s.rotDampQuad[2] * Math.abs(state.w[2])) * state.w[2] - s.munk * vb[0] * vb[1] * frac;
        return { acc, speed: V, frac, fins: { plane, rudder }, thrust };
    }
    return { acc, speed: V, frac, fins: { plane: 0, rudder: 0 }, thrust: 0 };
}

// ---- attitude and water data (the pilot's senses; see the header) -----------------------------------------------------------------------------------------------------------------------------------------------

const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const axisQ = (axis, angle) => { const s = Math.sin(angle / 2); return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]; };

/** The body quaternion for a heading (right turn positive), pitch (nose up positive) and bank (right side down positive): flightModel6dof.attitudeQuat's, so the two frames agree. */
export function attitudeQuat(heading = 0, pitch = 0, bank = 0) { return qmul(qmul(axisQ([0, 0, 1], -heading), axisQ([0, 1, 0], -pitch)), axisQ([1, 0, 0], bank)); }

/** A vessel state: at `depth` metres, moving at `speed` along `heading` and the climb angle `gamma`, the nose at `pitch` and the bank at `bank`, turning at `w` (body rates). It carries the model's VIRTUAL mass (see the header). */
export function createState({ depth = 30, pos = null, speed = 2, heading = 0, pitch = 0, bank = 0, gamma = 0, w = [0, 0, 0], model = null } = {}) {
    const m = model || createSubModel(), h = [Math.cos(heading), -Math.sin(heading)];
    return createBody({ mass: m.vmass, I: m.inertia, pos: pos || [0, 0, -depth], vel: [speed * Math.cos(gamma) * h[0], speed * Math.cos(gamma) * h[1], speed * Math.sin(gamma)], q: attitudeQuat(heading, pitch, bank), w });
}

/** { pitch, bank, heading, speed, alpha, beta, gamma, climb, depth } for a state (angles in radians; speed, alpha and beta RELATIVE TO THE WATER; depth positive down; alpha is the body angle of attack, beta positive when the vessel slips right). */
export function attitude(state, current = [0, 0, 0]) {
    const f = rotateByQuat(state.q, [1, 0, 0]), yAxis = rotateByQuat(state.q, [0, 1, 0]), up = rotateByQuat(state.q, [0, 0, 1]);
    const vb = worldToBody(state.q, [state.vel[0] - current[0], state.vel[1] - current[1], state.vel[2] - current[2]]), V = Math.hypot(vb[0], vb[1], vb[2]), g = Math.hypot(state.vel[0], state.vel[1], state.vel[2]);
    return {
        pitch: Math.asin(clamp(f[2], -1, 1)), bank: Math.atan2(yAxis[2], up[2]), heading: Math.atan2(-f[1], f[0]),
        speed: V, alpha: Math.atan2(-vb[2], vb[0]), beta: V > 1e-9 ? Math.asin(clamp(-vb[1] / V, -1, 1)) : 0,
        gamma: g > 1e-9 ? Math.asin(clamp(state.vel[2] / g, -1, 1)) : 0, climb: state.vel[2], depth: -state.pos[2],
    };
}

/** Body angular rates in the pilot's senses: { roll: positive right side down, pitch: positive nose up, yaw: positive nose right } (rad/s). */
export function rates(state) { return { roll: state.w[0], pitch: -state.w[1], yaw: -state.w[2] }; }

// ---- the ends ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** "submerged" | "broached" | "grounded" | "crushed" | "lost", with the numbers that decided it. A pure function of the state. */
export function classify(model, state) {
    if (![...state.pos, ...state.vel, ...state.q, ...state.w].every(Number.isFinite)) return { status: "lost" };
    const s = model.spec, z = state.pos[2], a = attitude(state);
    // the lowest point of the hull: the centre less the radius, and the half-length's share when pitched
    const low = z - (s.radius * Math.cos(a.pitch) + 0.5 * s.length * Math.abs(Math.sin(a.pitch)));
    if (z > 0) return { status: "broached", depth: -z };
    if (low <= -s.seabed) return { status: "grounded", depth: -z, sink: -state.vel[2] };
    if (-z > s.crushDepth) return { status: "crushed", depth: -z };
    return { status: "submerged", depth: -z };
}

/** One tick: { state, status, ...classification }. A state that has already ended is returned unchanged. */
export function stepSub(model, state, controls, dt = DT, current = [0, 0, 0], weightError = 0) {
    const before = classify(model, state);
    if (before.status !== "submerged") return { state, ...before };
    const next = step(state, forcesAndMoments(model, state, controls, current, weightError).acc, dt);
    if (hasTank(model)) next.tank = advanceTank(model, state.tank || initialTank(model), sanitize(controls), dt);   // v4901: the tank moves AFTER the tick it acted in, so the forces above used the level at the start of it
    return { state: next, ...classify(model, next) };
}

// ---- trim -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The thrust that holds `speed` in a straight, level, neutral vessel: drag over the thrust (forward only). The planes and ballast are zero; `feasible` is whether the screw can do it. */
export function trim(model, speed) {
    const s = model.spec, drag = 0.5 * WATER_DENSITY * s.cdAxial * model.frontalArea * speed * Math.abs(speed), thrust = speed >= 0 ? drag / s.thrustMax : drag / (s.thrustMax * s.reverseFraction);
    return { speed, pitch: 0, yaw: 0, thrust, ballast: 0, feasible: Math.abs(thrust) <= 1 };
}

/** The highest speed the screw can hold in level flight at full thrust: sqrt(T / (0.5 rho Cd A)). */
export const maxSpeed = (model) => Math.sqrt(model.spec.thrustMax / (0.5 * WATER_DENSITY * model.spec.cdAxial * model.frontalArea));

// ---- front door -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function reportLines() {
    const m = createSubModel(), lines = [`[subModel6dof] ${m.spec.name}: ${m.mass} kg (virtual ${m.vmass} kg), ${m.spec.length} m x ${2 * m.spec.radius} m, ${m.spec.thrustMax} N static thrust, weight ${m.weight.toFixed(0)} N`];
    for (const V of [1, 2, 3, 4]) { const t = trim(m, V); lines.push(`  trim ${V} m/s: thrust ${t.thrust.toFixed(3)}  ${t.feasible ? "feasible" : "NOT feasible"}`); }
    lines.push(`  top speed ${maxSpeed(m).toFixed(2)} m/s`);
    return lines;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see flightModel6dof.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
