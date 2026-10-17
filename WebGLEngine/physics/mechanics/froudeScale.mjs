// WebGLEngine/physics/mechanics/froudeScale.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A BIGGER AIRCRAFT THAT THE PILOTS WE ALREADY HAVE CAN FLY, BY DYNAMIC SIMILARITY. physics/mechanics/flightModel6dof.mjs is a 1,000 kg trainer; a bomber is a different airframe, and every pilot this tree trained (the PD autopilot, the fruit fly,
// the GPU Brain) was trained on the trainer. FROUDE SCALING is the cheapest honest way to a bigger aircraft they can fly with NO change: make every length s times the trainer's, every area s^2, the mass s^3 (so the density is the trainer's),
// the inertia s^5, the engine s^3 (and its fade speed sqrt(s)), and leave every NON-DIMENSIONAL number alone (the aspect ratios, the lift slopes, the control deflections, the incidence, the stall angles). The air does not change (the model's
// density is one constant and gravity is g): lift and drag go as rho V^2 S, so a speed that scales as sqrt(s) makes every force scale as s^3 -- the weight's scaling -- and a moment as s^4 against an inertia of s^5, so an angular
// acceleration scales as 1/s and TIME AS sqrt(s). That is the whole law:
//
//     length x s | area x s^2 | mass x s^3 | inertia x s^5 | force and thrust x s^3 | speed x sqrt(s) | time x sqrt(s) | angular rate x 1/sqrt(s) | altitude x s
//
// A pilot is a function of what the aircraft is doing, so it is wrapped to be SHOWN the trainer's world: scalePilot() divides the position by s, the velocity by sqrt(s), the spin by 1/sqrt(s) (multiplies it by sqrt(s)) and the wind by sqrt(s), and
// the target (an altitude, a speed) the same, and passes the four controls through UNCHANGED -- they are dimensionless. And the flight is stepped at a tick sqrt(s) times longer. The gate flies the bomber and the trainer and holds the two to each
// other (to 1e-9 m in the trainer's units, over 20 s of the trainer's time) for several scales, for the autopilot and the fruit fly's weights.
//
// WHAT IT IS NOT, SAID PLAINLY: it is the TRAINER'S SHAPE ENLARGED. It has the trainer's wing loading times s (so a larger aircraft is a FASTER one: at s = 4, a B-29's span, it stalls near 53 m/s and cruises at 90, against the trainer's 26.5 and 45), the trainer's
// airfoil, one engine's thrust line (a bomber's four engines are one number here), and the trainer's stall. It is not a B-29's wing and not its power. And a bigger aircraft is a faster one, which is a FINDING for any fight it joins: the trainer-class fighters
// top out at 52.8 m/s, so a bomber scaled past s ~ 2.2 cannot be caught in a level chase. Pure: no DOM, no clock, no random.
"use strict";
import { createFlightModel } from "./flightModel6dof.mjs";

const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const need = (s) => { if (!(Number.isFinite(s) && s > 0)) throw new Error(`froudeScale: the scale must be a positive finite number (got ${s})`); return s; };

/** The scaling law as numbers, for a scale s: the factor each quantity is multiplied by. */
export function similarity(s) {
    need(s); const k = Math.sqrt(s);
    return Object.freeze({ length: s, area: s * s, volume: s ** 3, mass: s ** 3, inertia: s ** 5, force: s ** 3, moment: s ** 4, speed: k, time: k, angularRate: 1 / k, acceleration: 1, altitude: s });
}

/** A flight-model spec (flightModel6dof.TRAINER's shape) scaled by s, frozen: lengths, areas, mass, inertia, thrust, the engine's fade speed, the contact points and the touchdown sink speed scale as the law says; every dimensionless number is the original's. */
export function scaleSpec(spec, s) {
    need(s); const k = Math.sqrt(s), A = spec.airframe, s2 = s * s;
    return Object.freeze({
        ...spec, name: s === 1 ? spec.name : `${spec.name} x${s}`, mass: spec.mass * s ** 3, inertia: Object.freeze(spec.inertia.map((v) => v * s ** 5)),
        airframe: Object.freeze({ ...A, wingSpanHalf: A.wingSpanHalf * s, wingArea: A.wingArea * s2, tailMountX: A.tailMountX * s, tailArea: A.tailArea * s2, rudderArea: A.rudderArea * s2 }),
        parasiteArea: spec.parasiteArea * s2, thrustMax: spec.thrustMax * s ** 3, propSpeed: spec.propSpeed * k, thrustPoint: Object.freeze(mul(spec.thrustPoint, s)),
        wheels: Object.freeze(spec.wheels.map((p) => Object.freeze(mul(p, s)))), hull: Object.freeze(spec.hull.map((p) => Object.freeze(mul(p, s)))),
        touchdown: Object.freeze({ ...spec.touchdown, maxSink: spec.touchdown.maxSink * k }),
    });
}

/** A flight model for the scaled spec. */
export const scaleModel = (model, s) => createFlightModel(scaleSpec(model.spec, s));

/** The state a pilot is shown, in the trainer's units: position / s, velocity / sqrt(s), spin x sqrt(s), mass / s^3 and inertia / s^5 when the state carries them; the attitude is the state's own. */
export function scaleState(state, s) {
    need(s); const k = Math.sqrt(s), out = { ...state, pos: mul(state.pos, 1 / s), vel: mul(state.vel, 1 / k), w: mul(state.w, k) };
    if (typeof state.mass === "number") out.mass = state.mass / s ** 3;
    if (state.I) out.I = mul(state.I, 1 / s ** 5);
    if (state.inertia) out.inertia = mul(state.inertia, 1 / s ** 5);
    return out;
}
/** A target (heading, altitude, airspeed) in the trainer's units: the heading is an angle and stays; the altitude / s; the airspeed / sqrt(s). */
export const scaleTarget = (target, s) => { need(s); return { ...target, altitude: target.altitude / s, airspeed: target.airspeed / Math.sqrt(s) }; };
/** A wind in the trainer's units: / sqrt(s). */
export const scaleWind = (wind, s) => { need(s); return mul(wind, 1 / Math.sqrt(s)); };

/** A pilot (state, target, wind) -> controls for the scaled aircraft: it shows the trainer's pilot the trainer's world and passes the four controls through. s = 1 is the pilot itself. */
export function scalePilot(pilot, s) {
    need(s);
    if (s === 1) return pilot;
    return (state, target, wind = [0, 0, 0]) => pilot(scaleState(state, s), scaleTarget(target, s), scaleWind(wind, s));
}

export function reportLines() {
    const sim = similarity(4), spec = scaleSpec(createFlightModel().spec, 4);
    return ["[froudeScale] a bigger aircraft the existing pilots fly unchanged, by dynamic similarity: lengths x s, areas x s^2, mass x s^3, speeds and times x sqrt(s)",
        `  at s = 4 (a B-29's span): mass ${spec.mass.toFixed(0)} kg, thrust ${spec.thrustMax.toFixed(0)} N, speeds x ${sim.speed}, time x ${sim.time}, altitudes x ${sim.altitude} -- and so a stall near 53 m/s and a cruise near 90 against the trainer's 26.5 and 45`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
