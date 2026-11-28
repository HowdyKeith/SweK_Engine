// WebGLEngine/physics/mechanics/surfaceShip.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SURFACE SHIP FOR THE SUBMARINE ARENA (Keith, 2026-11-28: "then sub vs ship"). The subs' arena (brain/subDuel.mjs) has boats and torpedoes and nothing on the surface but the
// aquarium's patrolling obstacles. This is a ship a sub can hunt: a hull on the surface steered by a HELM (brain/shipHelm.mjs: heading and speed, like a sub's tactician), heard
// by the sub's sonar, and hit by the sub's torpedo.
//
//   THE HULL     a point on the surface with a heading and a speed (no roll, no pitch, no sea: said plainly), steered at most speed / turnRadius rad/s (a ship turns on a radius, so
//                it turns slowly when slow and never on the spot) and sped up or slowed at `accel`; its length, beam and DRAFT come from its class
//   THE SPEEDS   SCALED TO THIS ARENA, NOT TO REAL KNOTS: the arena's torpedo cruises at 6.5 m/s (physics/mechanics/subTorpedo.mjs, sized for boats of 4.5 m/s), so every class
//                here is slower than it -- a real destroyer's 15 m/s would outrun every torpedo in the tank and nothing could be learned. The ratios between classes are kept
//   THE NOISE    louder than a boat: the sub's source level at the same speed (subSonar.sourceLevel) plus the class's `slExtra` dB (big machinery, big screws); heard from the
//                screws' depth, 3 m down
//   THE TARGET   THE SURFACE RULE, DECIDED (2026-11-28): a torpedo is lost above 3 m (subTorpedo minDepth) and fuses within 8 m, so a ship is offered to it as THREE KEEL POINTS --
//                bow, middle and stern, at 70% of the draft BUT NEVER SHALLOWER THAN HALF A METRE UNDER THE TORPEDO'S CEILING (3.5 m) -- each a target with the ship's id: the
//                seeker homes on the loudest (all are as loud: the first, the MIDDLE), the fuse measures to the nearest, so a torpedo that runs under the bow or the stern still
//                finds the hull. The floor on the depth was found by the first duels: a corvette's keel points at 2.5 m drew every torpedo up through its 3 m ceiling, and a
//                steady corvette could not be hit -- an artefact, not a tactic. A torpedo homing at 3.5 m under a 3.6 m keel touches it; the 8 m fuse does the rest.
//                No change to the torpedo
//   THE DAMAGE   hit points by class (a ship takes more than a boat's 100); 0 sinks it
// Pure: no DOM, no Math.random, no clock.
"use strict";
import * as K from "./subSonar.mjs";
import { TORPEDO } from "./subTorpedo.mjs";

export const DT = 1 / 30;
export const SHIP_CLASSES = Object.freeze({
    freighter: Object.freeze({ length: 140, beam: 20, draft: 8, maxSpeed: 3.0, accel: 0.05, turnRadius: 420, hp: 400, slExtra: 20 }),
    corvette: Object.freeze({ length: 80, beam: 10, draft: 3.6, maxSpeed: 5.2, accel: 0.12, turnRadius: 220, hp: 220, slExtra: 14 }),
    destroyer: Object.freeze({ length: 115, beam: 12, draft: 4.6, maxSpeed: 6.0, accel: 0.1, turnRadius: 300, hp: 300, slExtra: 16 }),
});
export const KEEL_FRACTION = 0.7, SCREW_DEPTH = 3, MIN_TURN_SPEED = 0.6, BELOW_CEILING = 0.5;
/** The depth (m, positive down) a ship is offered to a torpedo at: KEEL_FRACTION of its draft, but never above the torpedo's ceiling plus BELOW_CEILING (see THE TARGET). */
export const targetDepthOf = (cls) => Math.max(SHIP_CLASSES[cls].draft * KEEL_FRACTION, TORPEDO.minDepth + BELOW_CEILING);
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A ship: { cls, pos [x, y], heading (0 = +x, turning right increases it, as the subs'), speed }. */
export function createShip({ cls = "freighter", pos = [0, 0], heading = 0, speed = null } = {}) {
    const C = SHIP_CLASSES[cls]; if (!C) throw new Error(`surfaceShip.createShip: unknown class "${cls}" (${Object.keys(SHIP_CLASSES).join(", ")})`);
    return Object.freeze({ cls, pos: Object.freeze([pos[0], pos[1]]), heading, speed: speed === null ? C.maxSpeed * 0.6 : clamp(speed, 0, C.maxSpeed), hp: C.hp });
}
/** The forward unit vector for a heading in the arena's convention (subTorpedo's: x = cos, y = -sin). */
export const forwardOf = (heading) => [Math.cos(heading), -Math.sin(heading)];
/** The most the helm may turn this tick: speed / turn radius (rad/s), at least as at MIN_TURN_SPEED (a ship with way off still answers its rudder a little). */
export const turnRateOf = (cls, speed) => Math.max(speed, MIN_TURN_SPEED) / SHIP_CLASSES[cls].turnRadius;
/** One tick toward the helm's { heading, speed }. */
export function stepShip(s, cmd, dt = DT) {
    const C = SHIP_CLASSES[s.cls], want = cmd || {};
    const th = Number.isFinite(want.heading) ? want.heading : s.heading, tv = clamp(Number.isFinite(want.speed) ? want.speed : s.speed, 0, C.maxSpeed);
    const r = turnRateOf(s.cls, s.speed) * dt, heading = wrap(s.heading + clamp(wrap(th - s.heading), -r, r));
    const speed = s.speed + clamp(tv - s.speed, -C.accel * dt, C.accel * dt), f = forwardOf(heading);
    return Object.freeze({ ...s, heading, speed, pos: Object.freeze([s.pos[0] + f[0] * speed * dt, s.pos[1] + f[1] * speed * dt]) });
}
/** Its source level (dB) at its speed: a boat's at that speed plus the class's slExtra. */
export const sourceLevelOf = (s) => K.sourceLevel(s.speed) + SHIP_CLASSES[s.cls].slExtra;
/** As a sound source for subSonar.listen: the screws, SCREW_DEPTH down (pass `sl: sourceLevelOf(s)`). */
export const platformOf = (s) => ({ pos: [s.pos[0], s.pos[1], -SCREW_DEPTH], heading: s.heading, speed: s.speed });
/** The three keel points (bow, middle, stern ... the MIDDLE first, so a seeker that takes the first of equals homes amidships), at KEEL_FRACTION of the draft. */
export function keelPoints(s) {
    const C = SHIP_CLASSES[s.cls], f = forwardOf(s.heading), z = -targetDepthOf(s.cls), h = C.length * 0.35;
    return [[s.pos[0], s.pos[1], z], [s.pos[0] + f[0] * h, s.pos[1] + f[1] * h, z], [s.pos[0] - f[0] * h, s.pos[1] - f[1] * h, z]];
}
/** As torpedo targets (subTorpedo.stepTorpedo's list): its keel points, each with the ship's id, heading, speed and source level. */
export const targetsOf = (s, id) => keelPoints(s).map((pos) => ({ id, pos, heading: s.heading, speed: s.speed, sl: sourceLevelOf(s) }));
export function reportLines() {
    return Object.entries(SHIP_CLASSES).map(([k, c]) => `[surfaceShip] ${k}: ${c.length} m, draft ${c.draft} m (target points ${Math.max(c.draft * KEEL_FRACTION, TORPEDO.minDepth + BELOW_CEILING).toFixed(1)} m down, ${(c.length * 0.35).toFixed(0)} m apart), ${c.maxSpeed} m/s (scaled under the torpedo's 6.5), turn radius ${c.turnRadius} m, ${c.hp} hp, ${c.slExtra} dB louder than a boat`);
}
