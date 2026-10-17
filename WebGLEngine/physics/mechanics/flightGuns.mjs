// WebGLEngine/physics/mechanics/flightGuns.mjs -- UNNUMBERED: the version is chosen at ship time (another chat holds v4871)
//
// A GUN FOR THE REAL-FLIGHT AIRCRAFT (physics/mechanics/flightModel6dof.mjs): one fixed forward gun, a round that falls, and an exact answer to "did it hit". It adds to the flight model only what a gun needs and
// nothing the pilot has to learn: the pilot still sends pitch, roll, yaw and throttle, and the nose it points is the gun it has -- THERE IS NO TURRET HERE. (physics/turret.mjs is the race car's, and it aims; this
// gun is aimed by flying the aircraft at the target, which is the whole difficulty of a dogfight.)
//
//   THE GUN     a muzzle 2.4 m ahead of the centre of mass on the body's X axis, boresighted 0.05 rad (2.9 degrees) BELOW the body axis -- harmonised to the trainer's trim attitude (3.0 degrees at 45 m/s), the way a real
//               fixed gun is harmonised to the attitude the aircraft flies at, so that in trimmed level flight the rounds leave along the flight path and not a hundred metres over it. Rounds leave at 300 m/s
//               RELATIVE TO THE MUZZLE, and the muzzle's velocity is the aircraft's plus its rotation carried to the muzzle (v + w x r, as the flight model does for every surface). 15 rounds a second, 300 in the
//               magazine (20 seconds of fire, then it is empty -- there is no reload), a round lives 2 s.
//   THE ROUND   a point under gravity and nothing else (no drag, no wind): EXACT, p(t) = p0 + v t - g t^2/2, so a tick of any length gives the same path and the gate can hold it to the closed form. A real round is slowed
//               by the air; that is not modelled, and it makes the lead solution below exact where a real one is an estimate.
//   THE TARGET  a sphere of 4 m radius about the target's centre of mass. The trainer is 10.6 m across, so a round 3 m over the fuselage is a hit and one 3 m past a wingtip is a miss: a CONVENIENCE, not a damage model.
//               A hit is counted, one damage each; what a hit does to the aircraft (hit points, a kill) is the task's business (brain/dogfightTask.mjs).
//   THE TEST    a round's tick is a straight segment and the target's tick is a straight segment; the test is in the TARGET'S frame, where the round's path is a straight line and the sphere is still, so it is the
//               exact first root of a quadratic and not a distance sampled at the tick's ends (a round at 345 m/s travels 11.5 m a tick, nearly three target radii: a sampled test would let rounds pass through the
//               aircraft between ticks).
//
// WHAT IS NOT IN IT, SAID PLAINLY: no drag, no wind on the round, no dispersion (every round of a burst leaves along the same line -- a real gun scatters), no recoil or weight loss as the magazine empties, no hit
// on a part (wing, tail, engine), no ejection or damage to the controls, and the sphere is round where an airframe is not. Pure: no DOM, no clock, no random.
"use strict";
import { rotateByQuat } from "./rigidBody6dof.mjs";

export const GRAVITY = 9.80665;
export const GUN = Object.freeze({
    muzzleSpeed: 300, rate: 15, magazine: 300, muzzle: Object.freeze([2.4, 0, 0]), boresight: -0.05, life: 2, hitRadius: 4, damage: 1, hp: 20,
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/** A fresh gun: full magazine, nothing banked. A gun is a plain value; fire() returns the next one. */
export const createGun = (spec = GUN) => Object.freeze({ spec, ammo: spec.magazine, credit: 0, fired: 0 });

/** Where the muzzle is, how fast it moves, and the unit vector the gun points along, all in the world: { pos, vel, dir }. `state` is a flight state (a rigid body: pos, vel, q, w with w in the BODY frame). */
export function muzzleOf(state, spec = GUN) {
    const r = spec.muzzle, offset = rotateByQuat(state.q, r), spin = rotateByQuat(state.q, cross(state.w, r));
    const dir = rotateByQuat(state.q, [Math.cos(spec.boresight), 0, Math.sin(spec.boresight)]);
    return { pos: add(state.pos, offset), vel: add(state.vel, spin), dir };
}

/**
 * One tick of the trigger. `wantFire` is held or not; the gun banks a fraction of a round per tick while it is held (credit += rate dt) and fires the whole rounds, so 15 a second is 15 a second at any tick length, and NOTHING
 * is banked while the trigger is up (a long pause does not become a long burst). The rounds appear at the muzzle at the START of the tick with the muzzle's velocity plus the muzzle speed along the gun, age 0.
 * Returns { gun, rounds }: the next gun and the rounds fired this tick (each { pos, vel, age, owner }).
 */
export function fire(gun, shooter, wantFire, dt, owner = 0) {
    return fireFrom(gun, () => muzzleOf(shooter, gun.spec), wantFire, dt, owner);
}

/**
 * The trigger for a gun that is NOT fixed to an aircraft's nose: the same cadence, magazine and round as fire(), with the muzzle handed in -- a value { pos, vel, dir } or a function that makes one (called only when a round leaves, so a
 * turret's pose is not worked out for a tick that fires nothing). physics/mechanics/gunSeats.mjs fires its turrets through this.
 */
export function fireFrom(gun, muzzle, wantFire, dt, owner = 0) {
    if (!wantFire || gun.ammo <= 0) return { gun: gun.credit === 0 ? gun : Object.freeze({ ...gun, credit: 0 }), rounds: [] };
    const credit = gun.credit + gun.spec.rate * dt, n = Math.min(Math.floor(credit + 1e-9), gun.ammo);
    const next = Object.freeze({ ...gun, ammo: gun.ammo - n, credit: gun.ammo - n <= 0 ? 0 : credit - n, fired: gun.fired + n });
    if (n <= 0) return { gun: next, rounds: [] };
    const m = typeof muzzle === "function" ? muzzle() : muzzle, v = add(m.vel, mul(m.dir, gun.spec.muzzleSpeed));
    return { gun: next, rounds: Array.from({ length: n }, () => ({ pos: m.pos.slice(), vel: v.slice(), age: 0, owner })) };
}

/** A round after dt: exact for constant gravity, whatever dt is. */
export function stepRound(round, dt, g = GRAVITY) {
    const pos = [round.pos[0] + round.vel[0] * dt, round.pos[1] + round.vel[1] * dt, round.pos[2] + round.vel[2] * dt - 0.5 * g * dt * dt];
    return { ...round, pos, vel: [round.vel[0], round.vel[1], round.vel[2] - g * dt], age: round.age + dt };
}

/**
 * The first moment in [0, 1] at which a round moving from p0 to p1 is inside a sphere of radius R whose centre moves from c0 to c1 over the same tick -- or null. Exact for straight segments: in the sphere's frame the
 * round's path is the straight line d(t) = (p0 - c0) + t ((p1 - p0) - (c1 - c0)), and |d(t)| = R is a quadratic. A round that STARTS inside is a hit at 0.
 */
export function sweepHit(p0, p1, c0, c1, R) {
    const d0 = sub(p0, c0), dv = sub(sub(p1, p0), sub(c1, c0));
    const c = dot(d0, d0) - R * R;
    if (c <= 0) return 0;
    const a = dot(dv, dv), b = 2 * dot(d0, dv);
    if (a < 1e-18) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
}

/**
 * One tick of every round in flight against the targets. `targets` is [{ id, from, to, radius, part? }] (the centre at the tick's start and end; a craft made of several spheres gives each its own target with the craft's id and a `part` label, and the hit says which part it reached). A round does not hit its own owner; it is removed on a hit, on the ground
 * (z <= 0), or when it is older than `life`. Returns { rounds (survivors), hits: [{ owner, target, part?, t, point }] }, hits in round order (`part` only when the target gave one). A round hits the EARLIEST target it reaches.
 */
export function stepRounds(rounds, dt, targets, { life = GUN.life, g = GRAVITY } = {}) {
    const alive = [], hits = [];
    for (const r of rounds) {
        const n = stepRound(r, dt, g);
        let best = null;
        for (const tg of targets) {
            if (tg.id === r.owner) continue;
            const t = sweepHit(r.pos, n.pos, tg.from, tg.to, tg.radius);
            if (t !== null && (best === null || t < best.t)) best = { t, target: tg.id, part: tg.part };
        }
        if (best) { hits.push({ owner: r.owner, target: best.target, ...(best.part !== undefined ? { part: best.part } : {}), t: best.t, point: [r.pos[0] + (n.pos[0] - r.pos[0]) * best.t, r.pos[1] + (n.pos[1] - r.pos[1]) * best.t, r.pos[2] + (n.pos[2] - r.pos[2]) * best.t] }); continue; }
        if (n.pos[2] <= 0 || n.age >= life) continue;
        alive.push(n);
    }
    return { rounds: alive, hits };
}

/**
 * Where to point the gun to hit a target that holds its velocity, allowing for the shooter's own motion, the muzzle's rotation and the round's fall: { t (time of flight), dir (unit vector along the GUN axis), range, point (where
 * the target is at t) } or null when no round can reach it (the target is moving away faster than the muzzle speed, or the solution does not converge). EXACT for this gun (rounds fall under gravity and nothing else): the
 * target is at T(t) = tp + tv t, the round at P(t) = mp + sv t + m dir t - g t^2/2 z, so m dir t = T(t) - mp - sv t + g t^2/2 z, and |that| = m t is solved for t by iteration (a contraction: the muzzle speed is
 * several times any closing speed here). `muzzle` is { pos, vel } from muzzleOf().
 */
export function aimSolution(muzzle, targetPos, targetVel, spec = GUN, g = GRAVITY) {
    const m = spec.muzzleSpeed, range = norm(sub(targetPos, muzzle.pos));
    let t = range / m;
    for (let i = 0; i < 40; i++) {
        const D = [targetPos[0] + targetVel[0] * t - muzzle.pos[0] - muzzle.vel[0] * t, targetPos[1] + targetVel[1] * t - muzzle.pos[1] - muzzle.vel[1] * t, targetPos[2] + targetVel[2] * t - muzzle.pos[2] - muzzle.vel[2] * t + 0.5 * g * t * t];
        const next = norm(D) / m;
        if (!Number.isFinite(next)) return null;
        if (Math.abs(next - t) < 1e-12) { t = next; break; }
        t = next;
        if (i === 39) return null;
    }
    if (!(t > 0)) return null;
    const D = [targetPos[0] + targetVel[0] * t - muzzle.pos[0] - muzzle.vel[0] * t, targetPos[1] + targetVel[1] * t - muzzle.pos[1] - muzzle.vel[1] * t, targetPos[2] + targetVel[2] * t - muzzle.pos[2] - muzzle.vel[2] * t + 0.5 * g * t * t];
    const L = norm(D);
    return { t, dir: mul(D, 1 / L), range, point: add(targetPos, mul(targetVel, t)) };
}

export function reportLines() {
    const q = [1, 0, 0, 0], st = { pos: [0, 0, 300], vel: [45, 0, 0], q, w: [0, 0, 0] }, m = muzzleOf(st), v = [m.vel[0] + m.dir[0] * GUN.muzzleSpeed, m.vel[1] + m.dir[1] * GUN.muzzleSpeed, m.vel[2] + m.dir[2] * GUN.muzzleSpeed];
    const a = aimSolution(m, [300, 0, 300], [45, 0, 0]);
    return [
        "[flightGuns] one fixed forward gun for flightModel6dof's trainer: exact rounds, a swept hit test, a lead-and-drop aim solution",
        `  gun: ${GUN.muzzleSpeed} m/s from the muzzle, ${GUN.rate} rounds/s, ${GUN.magazine} rounds, boresight ${(GUN.boresight * 180 / Math.PI).toFixed(1)} deg, hit sphere ${GUN.hitRadius} m, ${GUN.hp} hits to kill`,
        `  a round fired level at 45 m/s leaves at (${v[0].toFixed(1)}, ${v[1].toFixed(1)}, ${v[2].toFixed(1)}) m/s; a target 300 m ahead flying the same course needs the gun pointed ${a ? (Math.asin(a.dir[2]) * 180 / Math.PI).toFixed(2) : "?"} deg above the horizon (time of flight ${a ? a.t.toFixed(3) : "?"} s)`,
    ];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
