// WebGLEngine/physics/mechanics/capitalShip.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CAPITAL SHIP FOR THE 6DOF SPACE BATTLE, in the manner of the Space Battleship Yamato (Star Blazers' Argo): a long hull, three triple main turrets (two forward, one aft), point-defence mounts on the flanks and the belly, three engine pods at
// the stern, and a forward "wave-motion cannon". It is a rigid body (physics/mechanics/rigidBody6dof.mjs) with a mass and inertia that come from its size, hit volumes that are a list of spheres (a round has to reach one, and what it reaches is
// named), and gun seats (physics/mechanics/gunSeats.mjs -- the seat model the B-29 shares) with a gunner each. The page's fighters are 3.2 units long, 8 kg and turn at several radians a second; this is 48 units long, 4,400 kg (the fighters' own
// density), and turns at no more than 0.25 rad/s^2 -- a hull whose gunners do the work.
//
// WHAT IS INVENTED, SAID PLAINLY, BECAUSE NONE OF IT IS MEASURED FROM A REAL SHIP OR A CARTOON'S DRAWINGS: every number below -- the length (48 units, about 15 fighters), the turret positions and arcs, the guns' speeds and rates, the hit points, the turn rate -- is
// a choice made so that the fight is worth watching; the layout is Yamato-LIKE (main battery forward and aft, a bridge tower amidships, engines at the tail), not Yamato's. THE WAVE-MOTION CANNON IS A FICTION, named so: a bow weapon that charges for 12 seconds,
// then fires one beam along the ship's own axis that damages everything along a line; in the arena it is a hit-scan along +X. NEWTONIAN, so: no stall, no drag, no gravity (the guns' rounds fly straight: gunSeats.handGunner's `gravity: 0`), and no
// Froude scaling -- there is no natural time scale in vacuum, so the capital ship is not the fighters enlarged (as the bomber is the trainer enlarged) but its own body with its own authority: a thrust and a limit on angular acceleration.
//
// WHAT IS NOT HERE: damage to the controls (an engine pod that is shot out takes a third of the thrust and nothing else: no yaw from the unbalanced thrust), a crew that can be killed, an interlock that keeps a turret from firing into its own hull, and the shape
// of the real ship (the hull is a row of spheres).
//
// CONVENTIONS are the 6DOF world's: the body's nose is +X (rigidBody6dofWeapon.FORWARD_BODY), +Z is the ship's up, +Y its port (left); a quaternion is Hamilton [w, x, y, z]; the angular velocity is in the body frame.
"use strict";
import { boxInertia, rotateByQuat } from "./rigidBody6dof.mjs";
import * as G from "./flightGuns.mjs";
import * as GS from "./gunSeats.mjs";

const PI = Math.PI;
export const HALF = Object.freeze([24, 4.5, 4]);           // the hull's half-extents (units): 48 long, 9 across, 8 high
export const FIGHTER = Object.freeze({ half: [1.6, 0.7, 0.7], mass: 8 });   // the page's fighter (es-box3d-6dof.html's HALF and SHIP_MASS), the density the hull is made of
export const MASS = Math.round(FIGHTER.mass * (HALF[0] * HALF[1] * HALF[2]) / (FIGHTER.half[0] * FIGHTER.half[1] * FIGHTER.half[2]) / 100) * 100;   // the fighters' density times the hull's volume, to the nearest 100
export const HIT_POINTS = 1500, THRUST_MAX = 1500, ENGINE_PODS = 3, MAX_ALPHA = 0.25;
export const AIM_RADIUS = 6;                                // what a round has to reach for a gunner or a trigger to call it a target: about the hull's beam
/** The guns' rounds, in the units of the 6DOF world (a round at 900 units a second is the fighters'): the MAIN battery's heavy slow shell, the point-defence mounts' small fast one. `damage` and `life` ride on each round (flightGuns.stepRounds' hits carry the round). */
export const MAIN_GUN = Object.freeze({ ...G.GUN, muzzleSpeed: 500, rate: 1.5, magazine: 160, life: 5, damage: 60 });
export const PD_GUN = Object.freeze({ ...G.GUN, muzzleSpeed: 1100, rate: 6, magazine: 900, life: 1.6, damage: 10 });
/** The wave-motion cannon: an INVENTED weapon (see the header). Charges for `charge` seconds, then fires one beam along the bow axis out to `range`, `beamRadius` wide, for `damage` to every craft it reaches. */
export const WAVE_GUN = Object.freeze({ name: "wave-motion cannon (invented)", muzzle: Object.freeze([25, 0, 0]), charge: 12, range: 900, beamRadius: 6, damage: 400 });

// the hit spheres: [name, kind, x, y, z, radius, hit points or null]. The hull is five overlapping spheres down the axis; the rest stand proud of it.
const PARTS = [
    ["bow", "hull", 17, 0, 0, 5.0, null], ["forward hull", "hull", 9, 0, 0, 5.2, null], ["midships", "hull", 0, 0, 0, 5.4, null], ["aft hull", "hull", -9, 0, 0, 5.2, null], ["stern", "hull", -18, 0, 0, 5.0, null],
    ["bridge", "bridge", -3, 0, 6.5, 3.5, null],
    ["main turret A", "turret", 16, 0, 5.2, 2.6, 120], ["main turret B", "turret", 9.5, 0, 5.2, 2.6, 120], ["main turret C", "turret", -14, 0, 5.2, 2.6, 120],
    ["engine pod 1", "engine", -23, -2.8, 0, 1.8, 100], ["engine pod 2", "engine", -23, 0, 0, 1.8, 100], ["engine pod 3", "engine", -23, 2.8, 0, 1.8, 100],
    ["port PD 1", "pd", 10, 4.6, 1, 1.0, 60], ["port PD 2", "pd", 0, 4.9, 1, 1.0, 60], ["port PD 3", "pd", -10, 4.6, 1, 1.0, 60],
    ["starboard PD 1", "pd", 10, -4.6, 1, 1.0, 60], ["starboard PD 2", "pd", 0, -4.9, 1, 1.0, 60], ["starboard PD 3", "pd", -10, -4.6, 1, 1.0, 60],
    ["ventral PD 1", "pd", 6, 0, -4.3, 1.0, 60], ["ventral PD 2", "pd", -8, 0, -4.3, 1.0, 60],
];
// the seats: [id, name, the part it sits in, mount, rest, up, yaw arc, pitch arc, slew yaw, slew pitch, reach, gun]. The main turrets sit on the deck and fire anywhere above it but astern of the superstructure for A and B and ahead of it for C (a 100-degree blind sector
// behind each); a flank mount sees a hemisphere facing outward from its side, a ventral one the hemisphere below.
const MAIN_ARC = { yaw: [-2.6, 2.6], pitch: [-0.05, 1.45] }, HEMI = { yaw: [-PI / 2, PI / 2], pitch: [-PI / 2, PI / 2] };
const SEATS = [
    ["main-a", "main turret A", "main turret A", [16, 0, 6.2], [1, 0, 0], [0, 0, 1], MAIN_ARC, 0.5, 0.4, 3.0, MAIN_GUN],
    ["main-b", "main turret B", "main turret B", [9.5, 0, 6.2], [1, 0, 0], [0, 0, 1], MAIN_ARC, 0.5, 0.4, 3.0, MAIN_GUN],
    ["main-c", "main turret C", "main turret C", [-14, 0, 6.2], [-1, 0, 0], [0, 0, 1], MAIN_ARC, 0.5, 0.4, 3.0, MAIN_GUN],
    ["pd-p1", "port PD 1", "port PD 1", [10, 4.8, 1], [0, 1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN], ["pd-p2", "port PD 2", "port PD 2", [0, 5.1, 1], [0, 1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN], ["pd-p3", "port PD 3", "port PD 3", [-10, 4.8, 1], [0, 1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN],
    ["pd-s1", "starboard PD 1", "starboard PD 1", [10, -4.8, 1], [0, -1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN], ["pd-s2", "starboard PD 2", "starboard PD 2", [0, -5.1, 1], [0, -1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN], ["pd-s3", "starboard PD 3", "starboard PD 3", [-10, -4.8, 1], [0, -1, 0], [0, 0, 1], HEMI, 3.0, 2.5, 1.0, PD_GUN],
    ["pd-v1", "ventral PD 1", "ventral PD 1", [6, 0, -4.5], [0, 0, -1], [1, 0, 0], HEMI, 3.0, 2.5, 1.0, PD_GUN], ["pd-v2", "ventral PD 2", "ventral PD 2", [-8, 0, -4.5], [0, 0, -1], [1, 0, 0], HEMI, 3.0, 2.5, 1.0, PD_GUN],
];

/**
 * The ship: { name, half, mass, I (the box inertia of the hull), hp, thrustMax (all pods), maxAlpha (the angular acceleration the hull can be asked for, rad/s^2, on each axis), kp / kd (the autopilot gains that make that the PD's own limit: kp = maxAlpha / pi, kd = 2 sqrt(kp), critical damping),
 * aimRadius, parts [{ id, name, kind, center (body frame), radius, hp (null for a part that has none) }], engines (the pods' part ids), seats (gunSeats seats at the layout's positions), seatPart (the part id each seat sits in), waveGun }. Everything is frozen.
 */
export function createCapitalShip() {
    const parts = Object.freeze(PARTS.map(([name, kind, x, y, z, r, hp], id) => Object.freeze({ id, name, kind, center: Object.freeze([x, y, z]), radius: r, hp })));
    const byName = new Map(parts.map((p) => [p.name, p.id]));
    const seats = Object.freeze(SEATS.map(([id, name, , mount, rest, up, arc, sy, sp, reach, gun]) => GS.makeSeat({ id, name, mount, rest, up, arc, slew: { yaw: sy, pitch: sp }, reach, gun })));
    const seatPart = Object.freeze(SEATS.map(([, , part]) => byName.get(part)));
    const kp = MAX_ALPHA / PI;
    return Object.freeze({ name: "Yamato-class battleship (invented numbers)", half: HALF, mass: MASS, I: Object.freeze(boxInertia({ m: MASS, hx: HALF[0], hy: HALF[1], hz: HALF[2] })), hp: HIT_POINTS, thrustMax: THRUST_MAX, maxAlpha: MAX_ALPHA, kp, kd: 2 * Math.sqrt(kp), aimRadius: AIM_RADIUS,
        parts, engines: Object.freeze(parts.filter((p) => p.kind === "engine").map((p) => p.id)), seats, seatPart, waveGun: WAVE_GUN });
}

/** The hit spheres of a ship in the world for a body: [{ part, name, kind, center, radius }], each part's centre carried by the body's position and attitude. */
export function partCentres(ship, body) {
    return ship.parts.map((p) => { const r = rotateByQuat(body.q, p.center); return { part: p.id, name: p.name, kind: p.kind, center: [body.pos[0] + r[0], body.pos[1] + r[1], body.pos[2] + r[2]], radius: p.radius }; });
}

/** The thrust with `running` of the engine pods still going: a pod is a third of it. */
export const thrustWith = (ship, running) => ship.thrustMax * Math.max(0, Math.min(ENGINE_PODS, Math.round(running))) / ENGINE_PODS;

/** A torque (body frame) cut to what the hull can do: no axis more than I[i] * maxAlpha. A vector inside the limit is returned as it is (the same numbers). */
export function limitTorque(ship, torque) { return torque.map((t, i) => { const m = ship.I[i] * ship.maxAlpha; return t > m ? m : t < -m ? -m : t; }); }

export function reportLines() {
    const s = createCapitalShip(), main = s.seats.filter((x) => x.gun === MAIN_GUN).length, pd = s.seats.length - main;
    return ["[capitalShip] a Yamato-like capital ship for the 6DOF space battle: a rigid hull with a mass and inertia from its size, hit spheres, gun seats with gunners, a fictional wave-motion cannon (every number invented)",
        `  ${(2 * s.half[0]).toFixed(0)} units long, ${s.mass} kg (the fighters' density), ${s.hp} hit points; ${s.parts.length} hit spheres; ${s.seats.length} seats (${main} main turrets, ${pd} point-defence mounts); ${s.engines.length} engine pods; angular acceleration limited to ${s.maxAlpha} rad/s^2 against a fighter's several; the ${s.waveGun.name} charges for ${s.waveGun.charge} s`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
