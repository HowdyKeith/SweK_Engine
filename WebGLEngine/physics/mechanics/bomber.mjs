// WebGLEngine/physics/mechanics/bomber.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A B-29-STYLE BOMBER: a big aircraft with four engines, a hull made of spheres, and five gun seats -- two on top, two underneath and one in the tail -- each with a gunner. Its FLIGHT is the trainer's, enlarged by dynamic similarity
// (physics/mechanics/froudeScale.mjs: lengths x s, areas x s^2, mass x s^3, speeds x sqrt(s)), so the autopilot, the fruit fly and the GPU Brain fly it through scalePilot() with no change; its GUNS are physics/mechanics/gunSeats.mjs's seats on
// flightGuns' round; its HIT VOLUME is a list of spheres (the fuselage, the wings, the four engines, the fin) because a round has to reach part of it, and a hit on an engine can put it out.
//
// THE LAYOUT IS A B-29's, SCALED, AND THE SCALE IS A CHOICE. The numbers below are in the metres of a real B-29 (a 43 m span, 30 m long; the positions are the layout as I know it and are approximate: the forward and aft upper turrets behind the cockpit and
// over the waist, the forward and aft lower turrets under them, the tail gun at the very back, four engines out along the wings) and every one is multiplied by `k = s x trainerSpan / B29 span` for a bomber of scale s, where trainerSpan = 10.6 m is the
// span the trainer is drawn at. THE DEFAULT IS s = 2 (a 21 m span, 8 tonnes), NOT s = 4 (the B-29's own span, 64 tonnes), and the reason is a measurement, not a taste: a bigger aircraft is a FASTER one under similarity (speeds x sqrt(s)), and the
// trainer-class fighters this tree has trained top out at 52.8 m/s -- the autopilot's slowest steady speed for a bomber of scale s is 30 sqrt(s) m/s (the trim table starts at 30), which is 42.4 at s = 2 and 60.0 at s = 4. At s = 2 a fighter can close on
// it from behind by 10 m/s; at s = 4 it cannot catch it at all. Raising the scale needs a faster fighter class, which is a later round and is named in the backlog. `scale` is a parameter and the gate holds the layout at any scale.
//
// WHAT IS NOT HERE, SAID PLAINLY: the real B-29's wing, power or weight distribution (it is the trainer's shape enlarged); remote-control sighting (a gunner sits in his seat and sees what his seat's hand rule is given -- gunSeats.handGunner); any interlock that keeps
// a turret from firing into the bomber's own tail or propellers; damage to the controls or the wings (a hit takes hit points; an engine's spheres, when shot to nothing, put that engine out and the thrust falls by a quarter); and a crew that can be killed.
"use strict";
import * as F from "./flightModel6dof.mjs";
import * as G from "./flightGuns.mjs";
import * as SC from "./froudeScale.mjs";
import * as GS from "./gunSeats.mjs";
import { rotateByQuat } from "./rigidBody6dof.mjs";

export const B29 = Object.freeze({ span: 43.05, length: 30.2, grossMass: 54000, name: "B-29" });   // metres and kilograms of the real aircraft the layout is taken from (approximate)
export const TRAINER_SPAN = 10.6;                // m: the span the trainer is drawn at (16 m^2 of wing at aspect ratio 7)
export const DEFAULT_SCALE = 2;
export const ENGINES = 4, HIT_POINTS = 60, ENGINE_HIT_POINTS = 8;
/** The twin machine guns of a turret, in the tree's own rounds: 300 m/s, 30 a second (two guns of 15), 800 rounds, the fighters' hit sphere (the seat does not use it). */
export const TURRET_GUN = Object.freeze({ ...G.GUN, rate: 30, magazine: 800 });

const PI = Math.PI;
/** The metres of the real aircraft -> the metres of a bomber of scale s. */
export const metresOf = (s) => (SC.similarity(s).length * TRAINER_SPAN) / B29.span;

// the hull in the B-29's own metres: [name, kind, x, y, z, radius]; +X is forward, +Y the aircraft's LEFT, +Z up, the origin the centre of mass
const PARTS_B29 = [
    ["nose", "fuselage", 11.5, 0, 0, 2.0], ["cockpit", "fuselage", 8.0, 0, 0.4, 3.0], ["forward fuselage", "fuselage", 1.5, 0, 0, 3.4], ["waist", "fuselage", -5.5, 0, 0, 3.2], ["aft fuselage", "fuselage", -11.0, 0, 0.2, 2.6], ["tail cone", "fuselage", -13.5, 0, 0.4, 1.8],
    ["left wing root", "wing", -0.5, 5.0, 0, 3.4], ["left wing", "wing", -0.5, 11.0, 0.3, 3.0], ["left wing tip", "wing", -0.5, 17.5, 0.6, 2.6],
    ["right wing root", "wing", -0.5, -5.0, 0, 3.4], ["right wing", "wing", -0.5, -11.0, 0.3, 3.0], ["right wing tip", "wing", -0.5, -17.5, 0.6, 2.6],
    ["engine 1 (outer left)", "engine", 2.5, 12.5, 0, 2.2], ["engine 2 (inner left)", "engine", 2.5, 6.5, 0, 2.2], ["engine 3 (inner right)", "engine", 2.5, -6.5, 0, 2.2], ["engine 4 (outer right)", "engine", 2.5, -12.5, 0, 2.2],
    ["fin", "fin", -13.0, 0, 4.4, 2.8],
];
// the five seats in the B-29's metres: [id, name, x, y, z, rest, up, yaw arc, pitch arc, slew yaw, slew pitch]; a ball or barbette sees a HEMISPHERE (yaw and pitch +-90 degrees about a rest axis pointing out of it), the tail a cone
const SEATS_B29 = [
    ["fwd-upper", "forward upper turret", 6.5, 0, 1.9, [0, 0, 1], [-1, 0, 0], [-PI / 2, PI / 2], [-PI / 2, PI / 2], 1.2, 1.0],
    ["fwd-lower", "forward lower turret", 6.0, 0, -1.9, [0, 0, -1], [1, 0, 0], [-PI / 2, PI / 2], [-PI / 2, PI / 2], 1.2, 1.0],
    ["aft-upper", "aft upper turret", -4.0, 0, 1.9, [0, 0, 1], [-1, 0, 0], [-PI / 2, PI / 2], [-PI / 2, PI / 2], 1.2, 1.0],
    ["aft-lower", "aft lower turret", -3.5, 0, -1.9, [0, 0, -1], [1, 0, 0], [-PI / 2, PI / 2], [-PI / 2, PI / 2], 1.2, 1.0],
    ["tail", "tail turret", -14.8, 0, 0.5, [-1, 0, 0], [0, 0, 1], [-0.6, 0.6], [-0.6, 0.6], 1.4, 1.2],
];

/**
 * A bomber of scale `scale`: { scale, k (metres of the real aircraft -> its metres), span, length, spec, model (all four engines), modelFor(n) (n engines running), parts, engines, seats, hp, cruiseSpeed, altitude }. Everything is frozen.
 * `parts` are { id, name, kind, center (body frame, m), radius, hp }; `engines` the indices of the four engine parts; `seats` the gunSeats seats at the layout's positions; `cruiseSpeed` is the slowest steady speed the autopilot holds
 * (30 sqrt(s) m/s, plus 2%) unless `speed` says otherwise.
 */
export function createBomber({ scale = DEFAULT_SCALE, speed = null, altitude = null } = {}) {
    const law = SC.similarity(scale), k = metresOf(scale), spec = SC.scaleSpec(F.TRAINER, scale), model = F.createFlightModel(spec), turret = Object.freeze({ ...TURRET_GUN });
    const parts = Object.freeze(PARTS_B29.map(([name, kind, x, y, z, r], i) => Object.freeze({ id: i, name, kind, center: Object.freeze([x * k, y * k, z * k]), radius: r * k, hp: kind === "engine" ? ENGINE_HIT_POINTS : null })));
    const seats = Object.freeze(SEATS_B29.map(([id, name, x, y, z, rest, up, ya, pa, sy, sp]) => GS.makeSeat({ id, name, mount: [x * k, y * k, z * k], rest, up, arc: { yaw: ya, pitch: pa }, slew: { yaw: sy, pitch: sp }, reach: 1.2 * k, gun: turret })));
    const engines = Object.freeze(parts.filter((p) => p.kind === "engine").map((p) => p.id));
    const cache = new Map([[ENGINES, model]]);
    const modelFor = (n) => { const m = Math.max(0, Math.min(ENGINES, Math.round(n))); if (!cache.has(m)) cache.set(m, F.createFlightModel(Object.freeze({ ...spec, thrustMax: spec.thrustMax * m / ENGINES }))); return cache.get(m); };
    return Object.freeze({ scale, k, span: TRAINER_SPAN * scale, length: B29.length * k, spec, model, modelFor, parts, engines, seats, hp: HIT_POINTS, cruiseSpeed: speed ?? 30 * Math.sqrt(scale) * 1.02, altitude: altitude ?? 250 * law.altitude, law });
}

/** The hit spheres of a bomber in the world for a state, as flightGuns.stepRounds targets would take them: [{ id, part, center, radius }] with `center` the part's centre carried by the state's position and attitude. */
export function partCentres(bomber, state) {
    return bomber.parts.map((p) => { const r = rotateByQuat(state.q, p.center); return { part: p.id, name: p.name, kind: p.kind, center: [state.pos[0] + r[0], state.pos[1] + r[1], state.pos[2] + r[2]], radius: p.radius }; });
}

/** The model for the engines still running. */
export const modelWith = (bomber, running) => bomber.modelFor(running);

export function reportLines() {
    const b = createBomber(), b4 = createBomber({ scale: 4 });
    return ["[bomber] a B-29-style bomber: the trainer enlarged by similarity, four engines, a hull of spheres, five gun seats",
        `  scale ${b.scale}: ${b.span.toFixed(1)} m span, ${b.length.toFixed(1)} m long, ${b.spec.mass.toFixed(0)} kg, cruising at ${b.cruiseSpeed.toFixed(1)} m/s; ${b.parts.length} hull spheres, ${b.seats.length} seats (${b.seats.map((s) => s.id).join(", ")}); at the B-29's own span (scale 4) ${b4.span.toFixed(1)} m and ${b4.cruiseSpeed.toFixed(1)} m/s, which the fighters cannot catch`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
