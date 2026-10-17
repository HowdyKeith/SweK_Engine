// WebGLEngine/physics/mechanics/gunSeats.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A GUN SEAT: a gun on a mount on a body, that is AIMED by someone sitting in it. physics/mechanics/flightGuns.mjs gave an aircraft one gun fixed to its nose, aimed by flying the aircraft; this is the other kind -- a ball turret, a
// dorsal barbette, a tail position, a ship's main battery -- with an ARC it can reach, a SLEW RATE it can turn at, a magazine, and a gunner who decides where to point it and when to fire. It is the seat model the B-29-class bomber and the
// space battleship share, and it works on any body with a position, a velocity, an orientation quaternion and a body-frame spin: a flight state (flightModel6dof) or a space ship (rigidBody6dof), because both are rigidBody6dof's.
//
//   THE MOUNT   a seat is a frozen definition: { id, name, mount (body frame, m), rest (the body-frame direction the gun points at rest), up (which way is up for the mount, to say which way "yaw" and "pitch" turn; default body +Z),
//               arc: { yaw: [lo, hi], pitch: [lo, hi] } (radians, relative to rest), slew: { yaw, pitch } (rad/s), reach (m from the mount to the muzzle), gun (a flightGuns gun spec: muzzle speed, rate, magazine, life) }.
//   THE ANGLES  the seat's frame is r = rest, left = up x r, upv = r x left; the gun points along cos(p) (cos(y) r + sin(y) left) + sin(p) upv, so YAW IS POSITIVE TOWARD THE MOUNT'S LEFT (for a seat that rests forward with the default up, the body's +Y, as everywhere in this tree; for one that rests
//               up, left is whatever up x rest makes it, so say `up: [-1, 0, 0]` to have yaw turn it toward +Y) and PITCH POSITIVE TOWARD THE MOUNT'S UP. A hemisphere is yaw [-pi/2, pi/2] and pitch [-pi/2, pi/2] about a rest axis pointing out of it: a dorsal barbette rests UP and sees the upper hemisphere, a ventral ball turret rests DOWN and sees the lower one.
//   THE SLEW    a seat turns toward the angles it is told at its slew rate and no faster, one axis at a time (they are independent motors), clamped into its arc: a command outside the arc is a command for the edge. A gunner who cannot
//               out-turn a target does not hit it, which is the point of having a rate.
//   THE ROUND   the muzzle is `reach` metres from the mount along the gun; a round leaves with the body's velocity, plus the spin of the body carried to the muzzle (w x r), plus the muzzle speed along the gun -- flightGuns.fireFrom's cadence and
//               magazine, flightGuns.stepRound's exact fall. Nothing here is a hit test: rounds are stepped and tested by flightGuns.stepRounds against whatever the fight calls a target.
//   THE GUNNER  handGunner() is the rule a gunner brain is first compared with: one per seat, because it remembers what it has seen. It acts on a target `delay` seconds after the target came inside `maxRange`, and on the position the target
//               had THEN carried forward at the velocity it had then (a gunner with a sight, not an oracle: a target that holds its velocity is predicted exactly and one that changes it costs the gunner the change times the delay); it picks
//               the target a round can reach soonest INSIDE THE SEAT'S ARC, leads it with the exact solution (flightGuns.aimSolution), turns the seat to the answer with an aim error of `sigma` radians (repeatable: a seed, the seat and the
//               time), and pulls the trigger when the gun it HAS is pointed within the target's radius of where a round would hit. With no target it returns the gun to rest. WHAT IT IS NOT: a model of a person. The defaults are chosen,
//               not measured, and every number that depends on them is pinned in the gate that depends on it.
//
// WHAT IS NOT IN IT, SAID PLAINLY: no structure in the field of fire (a real turret has interlocks that keep it from shooting the tail), no recoil on the body, no ammunition feed, no heating, no parallax between several guns on one mount (a seat
// has one muzzle), no gunner's view of the target beyond its position and velocity. Pure: no DOM, no clock, no Math.random.
"use strict";
import { rotateByQuat, worldToBody } from "./rigidBody6dof.mjs";
import * as G from "./flightGuns.mjs";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); if (!(n > 1e-12)) throw new Error("gunSeats: a zero vector has no direction"); return mul(a, 1 / n); };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** A seat definition, checked and frozen. `rest` and `up` need only point the right way (they are normalised, and `up` is made perpendicular to `rest`). Throws, by name, on a seat that cannot be built. */
export function makeSeat(def) {
    if (!def || typeof def.id !== "string" || !def.id) throw new Error("gunSeats.makeSeat: a seat needs an id");
    for (const k of ["mount", "rest"]) if (!Array.isArray(def[k]) || def[k].length !== 3 || !def[k].every(Number.isFinite)) throw new Error(`gunSeats.makeSeat(${def.id}): ${k} must be three finite numbers`);
    const rest = unit(def.rest), upIn = def.up ? unit(def.up) : [0, 0, 1];
    if (norm(cross(upIn, rest)) < 1e-6) throw new Error(`gunSeats.makeSeat(${def.id}): up and rest are parallel, so the mount has no left`);
    const arc = def.arc || {}, ya = arc.yaw || [-Math.PI, Math.PI], pa = arc.pitch || [-Math.PI / 2, Math.PI / 2], slew = def.slew || {};
    if (!(ya[0] <= ya[1]) || !(pa[0] <= pa[1])) throw new Error(`gunSeats.makeSeat(${def.id}): an arc runs from low to high`);
    if (!(slew.yaw > 0) || !(slew.pitch > 0)) throw new Error(`gunSeats.makeSeat(${def.id}): a slew rate is a positive number of radians a second for yaw and for pitch`);
    const left = unit(cross(upIn, rest)), upv = cross(rest, left);
    return Object.freeze({ id: def.id, name: def.name || def.id, mount: Object.freeze([...def.mount]), rest: Object.freeze(rest), left: Object.freeze(left), upv: Object.freeze(upv), arc: Object.freeze({ yaw: Object.freeze([...ya]), pitch: Object.freeze([...pa]) }), slew: Object.freeze({ yaw: slew.yaw, pitch: slew.pitch }), reach: def.reach ?? 1, gun: def.gun || G.GUN });
}

/** The body-frame unit vector the seat points along at (yaw, pitch). */
export function dirAt(seat, yaw, pitch) {
    const c = Math.cos(pitch), cy = Math.cos(yaw) * c, sy = Math.sin(yaw) * c, sp = Math.sin(pitch);
    return [cy * seat.rest[0] + sy * seat.left[0] + sp * seat.upv[0], cy * seat.rest[1] + sy * seat.left[1] + sp * seat.upv[1], cy * seat.rest[2] + sy * seat.left[2] + sp * seat.upv[2]];
}
/** The inverse: the (yaw, pitch) at which the seat points along a body-frame direction. */
export function anglesOf(seat, dirBody) {
    const d = unit(dirBody);
    return { yaw: Math.atan2(dot(d, seat.left), dot(d, seat.rest)), pitch: Math.asin(clamp(dot(d, seat.upv), -1, 1)) };
}
/** Is (yaw, pitch) inside the seat's arc (edges included)? */
export const inArc = (seat, yaw, pitch) => yaw >= seat.arc.yaw[0] - 1e-12 && yaw <= seat.arc.yaw[1] + 1e-12 && pitch >= seat.arc.pitch[0] - 1e-12 && pitch <= seat.arc.pitch[1] + 1e-12;
/** (yaw, pitch) clamped into the arc. */
export const clampToArc = (seat, yaw, pitch) => ({ yaw: clamp(yaw, seat.arc.yaw[0], seat.arc.yaw[1]), pitch: clamp(pitch, seat.arc.pitch[0], seat.arc.pitch[1]) });

/** A fresh seat state: at rest, a full magazine. A state is a plain frozen value; stepSeat returns the next one. */
export const createSeatState = (seat) => Object.freeze({ yaw: 0, pitch: 0, gun: G.createGun(seat.gun) });

/** Where the seat's muzzle is, how fast it moves, and the world unit vector the gun points along: { pos, vel, dir }. `body` is { pos, vel, q, w } with w in the body frame. */
export function muzzleOfSeat(seat, st, body) {
    const d = dirAt(seat, st.yaw, st.pitch), local = add(seat.mount, mul(d, seat.reach));
    return { pos: add(body.pos, rotateByQuat(body.q, local)), vel: add(body.vel, rotateByQuat(body.q, cross(body.w, local))), dir: rotateByQuat(body.q, d) };
}
/** The (yaw, pitch) at which the seat must point to fire along a WORLD direction, and whether that is inside its arc: { yaw, pitch, inArc }. */
export function reachOf(seat, body, dirWorld) { const a = anglesOf(seat, worldToBody(body.q, dirWorld)); return { ...a, inArc: inArc(seat, a.yaw, a.pitch) }; }

/**
 * One tick of a seat. `cmd` is { yaw, pitch, fire } -- the angles the gunner wants (absolute, relative to rest) and the trigger. The seat clamps the wanted angles into its arc and turns toward them at its slew rate on each axis (it
 * cannot turn past a target angle in one tick), then fires from where it points NOW. Returns { state, rounds } (rounds as flightGuns': { pos, vel, age, owner }).
 */
export function stepSeat(seat, st, body, cmd, dt, owner = 0) {
    const want = clampToArc(seat, Number.isFinite(cmd.yaw) ? cmd.yaw : st.yaw, Number.isFinite(cmd.pitch) ? cmd.pitch : st.pitch);
    const move = (cur, tgt, rate) => { const d = tgt - cur, m = rate * dt; return Math.abs(d) <= m ? tgt : cur + Math.sign(d) * m; };
    const yaw = move(st.yaw, want.yaw, seat.slew.yaw), pitch = move(st.pitch, want.pitch, seat.slew.pitch);
    const next = { yaw, pitch };
    const out = G.fireFrom(st.gun, () => muzzleOfSeat(seat, next, body), !!cmd.fire, dt, owner);
    return { state: Object.freeze({ yaw, pitch, gun: out.gun }), rounds: out.rounds };
}

/**
 * A TRACK: the straight line through what a sight has measured, by least squares. `entries` is [{ t, pos }] (seconds, metres in the world); fewer than 3 entries is no track (null). Returns { t (the latest time), pos (the fitted
 * position there), vel (the slope: the target's velocity as a sight that only sees where it is would estimate it), n }. A noise-free straight-line target is recovered exactly; with noise of sigma on each position the slope's
 * standard deviation is sigma / (dt sqrt(N (N^2 - 1) / 12)) for N samples dt apart.
 */
export function fitTrack(entries) {
    const n = entries.length; if (n < 3) return null;
    const tm = entries.reduce((a, e) => a + e.t, 0) / n, pm = [0, 1, 2].map((i) => entries.reduce((a, e) => a + e.pos[i], 0) / n);
    let stt = 0; const stp = [0, 0, 0];
    for (const e of entries) { const dt = e.t - tm; stt += dt * dt; for (let i = 0; i < 3; i++) stp[i] += dt * (e.pos[i] - pm[i]); }
    if (!(stt > 1e-12)) return null;
    const vel = stp.map((v) => v / stt), last = entries[n - 1].t;
    return { t: last, pos: pm.map((v, i) => v + vel[i] * (last - tm)), vel, n };
}

/**
 * The hand gunner: one per seat, because it REMEMBERS what it has seen. decide(seat, state, body, targets, t) -> { yaw, pitch, fire, target } where `targets` is [{ id, pos, vel, radius? }] in the world and `t` is the time in seconds
 * (any origin; it must not go backwards). See the header for what it does and does not model.
 *   delay      s    THE GUNNER'S REACTION: what it knows of a target is what the target was `delay` seconds ago, carried forward at the velocity it had THEN. A target that holds its velocity is predicted exactly (the sight does
 *                   the arithmetic); one that changes it costs the gunner the change times the delay; and a target first inside `maxRange` is not acted on until `delay` seconds after it came in.
 *   sigma      rad  the aim error on each axis (a Gaussian, repeatable: the seed, the seat and the time make it)
 *   maxRange   m    how far it will shoot, measured from the body's centre
 *   tolerance       how many target radii of predicted miss it will fire within, for the gun as it points NOW
 *   burst      s    how long the trigger is HELD once the gunner has decided to fire (0, the default, is no hold: the trigger is down exactly on the ticks the gun is within tolerance). A gun that fires a round every few ticks banks a round only while the trigger STAYS down (flightGuns.fireFrom
 *                   banks nothing while it is up), so a gun of 6 or 1.5 rounds a second under an aim error that flickers the decision from tick to tick fires almost nothing -- measured: 45 rounds in 20 seconds from seats that were 'firing' on 2,500 ticks. A burst is what a hand on a trigger does.
 *   gravity    m/s^2  the fall the gunner allows the round (flightGuns.GRAVITY, 9.80665, by default; 0 for a gun in VACUUM, where a round flies straight -- the rounds themselves are the arena's to fly with the same number)
 *   observe         null (the default) gives the gunner the target's velocity as it is. { window, sigmaRange, floor } makes it a SIGHT THAT ONLY SEES WHERE THE TARGET IS: each tick it measures the target's position with a Gaussian error of
 *                   max(floor, sigmaRange x range) metres on each axis, fits a straight line (fitTrack) through the measurements of the `window` seconds that ended `delay` ago, and leads that line's slope; it acts on a target
 *                   only once three measurements are in the window. A target that holds its velocity is led to within the slope's noise; one that turns is led by the average of the window, which is behind it.
 */
export function handGunner({ delay = 0.25, sigma = 0.012, seed = 1, maxRange = 450, tolerance = 1, observe = null, gravity = G.GRAVITY, burst = 0 } = {}) {
    if (!(Number.isFinite(burst) && burst >= 0)) throw new Error(`gunSeats.handGunner: burst must be a number of seconds, 0 or more (got ${burst})`);
    let holdUntil = -Infinity;   // the time the trigger is held to, once the gunner has decided to fire
    if (!Number.isFinite(gravity)) throw new Error(`gunSeats.handGunner: gravity must be a finite number (got ${gravity})`);
    const seen = new Map();   // seat id | target id -> what was seen, oldest first: [{ t, pos, vel }]
    const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
    return function decide(seat, st, body, targets, t = 0) {
        const cur = muzzleOfSeat(seat, st, body); let best = null;
        for (const tg of targets) {
            const key = seat.id + "|" + tg.id;
            if (norm(sub(tg.pos, body.pos)) > maxRange) { seen.delete(key); continue; }
            let h = seen.get(key); if (!h) seen.set(key, h = []);
            let was, age, now;
            if (observe) {
                const orng = mulberry((seed * 15485863 + Math.round(t * 1000) * 32452843 + hash(key)) >>> 0), range = norm(sub(tg.pos, body.pos)), sig = Math.max(observe.floor ?? 0.5, (observe.sigmaRange ?? 0.01) * range);
                h.push({ t, pos: [tg.pos[0] + gauss(orng) * sig, tg.pos[1] + gauss(orng) * sig, tg.pos[2] + gauss(orng) * sig] });
                const lo = t - delay - (observe.window ?? 0.6) - 1e-9, hi = t - delay + 1e-9, win = h.filter((e) => e.t >= lo && e.t <= hi);
                while (h.length && h[0].t < lo - 0.1) h.shift();
                const fit = fitTrack(win); if (!fit) continue;
                age = t - fit.t; now = add(fit.pos, mul(fit.vel, age)); was = { vel: fit.vel };
            } else {
                h.push({ t, pos: tg.pos.slice(), vel: tg.vel.slice() });
                let k = -1; for (let i = 0; i < h.length; i++) if (h[i].t <= t - delay + 1e-9) k = i; else break;
                if (k < 0) continue;
                if (k > 0) h.splice(0, k);
                was = h[0]; age = t - was.t; now = add(was.pos, mul(was.vel, age));
            }
            const sol = G.aimSolution(cur, now, was.vel, seat.gun, gravity); if (!sol) continue;
            const a = reachOf(seat, body, sol.dir); if (!a.inArc) continue;
            if (!best || sol.t < best.sol.t) best = { tg, sol, a };
        }
        if (!best) { holdUntil = -Infinity; return { yaw: 0, pitch: 0, fire: false, target: null }; }
        const rng = mulberry((seed * 7919 + Math.round(t * 1000) * 104729 + hash(seat.id)) >>> 0), ey = sigma ? gauss(rng) * sigma : 0, ep = sigma ? gauss(rng) * sigma : 0;
        const c = clamp(dot(cur.dir, best.sol.dir), -1, 1), miss = Math.sin(Math.acos(c)) * best.sol.t * seat.gun.muzzleSpeed, radius = best.tg.radius ?? G.GUN.hitRadius;
        const aimed = miss <= tolerance * radius; if (aimed && burst > 0) holdUntil = t + burst;
        return { yaw: best.a.yaw + ey, pitch: best.a.pitch + ep, fire: aimed || t < holdUntil, target: best.tg.id };
    };
}

export function reportLines() {
    const s = makeSeat({ id: "demo", mount: [0, 0, 1], rest: [0, 0, 1], up: [-1, 0, 0], arc: { yaw: [-Math.PI / 2, Math.PI / 2], pitch: [-Math.PI / 2, Math.PI / 2] }, slew: { yaw: 1.2, pitch: 1.0 } });
    const d = dirAt(s, Math.PI / 2, 0);
    return ["[gunSeats] a gun on a mount with an arc, a slew rate and a gunner: the seat model the bomber and the battleship share",
        `  a dorsal seat (rest up, aft is its up): yaw +90 degrees points ${d.map((v) => v.toFixed(2)).join(", ")} (toward the body's +Y, its left); arc ${(s.arc.yaw[0] * 180 / Math.PI).toFixed(0)}..${(s.arc.yaw[1] * 180 / Math.PI).toFixed(0)} degrees yaw, slew ${s.slew.yaw} rad/s`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
