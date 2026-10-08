// WebGLEngine/physics/mechanics/rigidBody6dofWeapon.mjs
//
// WEAPONS for rigidBody6dof.mjs ships: a straight-line projectile (no gravity, no drag -- space combat, matching
// this whole subsystem's F=ma-only scope) fired from a body-frame muzzle point in the ship's own FORWARD
// direction, plus a swept hit test against a target's OBB (physics/mechanics/rigidBody6dofCollision.mjs's
// bodyOBB/pointInOBB, itself built on the already-gated physics/obbOverlap.js). This mirrors physics/turret.mjs's
// own shape (muzzle()/fireShell()/stepShells()) rather than reinventing weapon bookkeeping, adapted from
// turret.mjs's 2D-heading world to rigidBody6dof.mjs's quaternion one.
//
// FORWARD_BODY = [1,0,0] (local +X) -- the SAME nose convention es-box3d-fly3d.html's own makeHull() and
// esFlight3dMath.js already use ("local nose = +X", es-box3d-fly3d.html's own comment), chosen here so a ship
// mesh built for the rest of this engine's ships needs no re-orientation to fly under rigidBody6dof.mjs.
// rigidBody6dof.mjs's own reportLines() demo happens to thrust along local +Z, but that is an unrelated,
// non-load-bearing illustrative choice in a generic, axis-agnostic module -- applyForceAtPoint() takes any
// body-frame direction, so choosing +X here does not conflict with anything rigidBody6dof.mjs itself commits to.
//
// TUNNELLING. A projectile can easily cover more than a target's own extent in one tick (at WEAPON.speed=900
// and a 1/30s tick, 30 units/tick against a handful-of-units hull) -- a single end-of-tick point-in-box test can
// step clean OVER a target and report no hit. segmentHitsOBB() is an EXACT segment-vs-OBB intersection test
// (Ericson, "Real-Time Collision Detection" 5.3.3, worked in the box's own local frame), not a sampled
// approximation: an earlier version of this file sampled a fixed number of points along the tick's travel
// (the same fix physics/turret.mjs's own stepShells() applies with HIT_SAMPLES=4), which is what this file's
// gate originally caught tunnelling with -- but a REVIEW found that fix itself still tunnels whenever a target
// is narrower than the sample spacing and sits off the sample grid (concretely: a 1.8-unit-wide target at
// WEAPON.speed's 30-units/tick travel, spaced 7.5 units apart at 4 samples, can sit entirely between two
// samples and never be tested at all). The exact slab test has no such gap: it finds the true entry point of
// the box's SURFACE along the segment algebraically, so there is no sample spacing for a target to hide
// between. Gated directly against the exact tunnelling case the sampled version missed.
"use strict";
import { rotateByQuat, createBody, boxInertia } from "./rigidBody6dof.mjs";
import { bodyOBB } from "./rigidBody6dofCollision.mjs";

export const FORWARD_BODY = [1, 0, 0];
export const WEAPON = { speed: 900, life: 2.5, radius: 0.12, cooldownMs: 300, muzzleBody: [1.4, 0, 0] };

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub3 = (a, b) => add3(a, b, -1);

/** A new projectile fired from `shooter`'s own forward direction, inheriting its velocity (real muzzle physics,
 * not a velocity reset -- a shot fired from a moving ship carries that motion, same as turret.mjs's fireShell). */
export function fireProjectile(shooter, opts = {}) {
    const spec = { ...WEAPON, ...opts };
    const dirWorld = rotateByQuat(shooter.q, FORWARD_BODY);
    const pos = add3(shooter.pos, rotateByQuat(shooter.q, spec.muzzleBody));
    const vel = add3(shooter.vel, dirWorld, spec.speed);
    return { pos, prevPos: pos, vel, life: spec.life, radius: spec.radius, ownerId: opts.ownerId != null ? opts.ownerId : null, team: opts.team != null ? opts.team : null, age: 0 };
}

/** Advance one tick: straight line, no forces. Returns null once life expires (this tick or already). */
export function stepProjectile(shot, dt) {
    const life = shot.life - dt;
    if (life <= 0) return null;
    return { ...shot, prevPos: shot.pos, pos: add3(shot.pos, shot.vel, dt), life, age: shot.age + dt };
}

/** Is world point `p` inside OBB `obb`, inflated by `pad` on every face? */
export function pointInOBB(p, obb, pad = 0) {
    const d = sub3(p, obb.center);
    for (let i = 0; i < 3; i++) if (Math.abs(dot3(d, obb.axes[i])) > obb.half[i] + pad) return false;
    return true;
}

/** EXACT segment-vs-OBB intersection: does `shot.prevPos -> shot.pos` (this tick's travel) enter `obb`
 * (inflated by `pad`), and if so at what fraction `t` along that segment (clamped to [0,1], so t=0 means the
 * shot started this tick already inside)? The classic slab method (Ericson 5.3.3), worked in the box's own
 * local frame via its `axes` so an arbitrarily oriented box needs no special-casing. */
export function segmentHitsOBB(shot, obb, opts = {}) {
    const pad = opts.pad || 0;
    const from = shot.prevPos, to = shot.pos;
    const d = sub3(from, obb.center), seg = sub3(to, from);
    let tmin = 0, tmax = 1;
    for (let i = 0; i < 3; i++) {
        const axis = obb.axes[i], half = obb.half[i] + pad;
        const d0 = dot3(d, axis), dseg = dot3(seg, axis);
        if (Math.abs(dseg) < 1e-12) {
            if (Math.abs(d0) > half) return { hit: false };   // parallel to this slab, outside it
        } else {
            let t1 = (-half - d0) / dseg, t2 = (half - d0) / dseg;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            tmin = Math.max(tmin, t1);
            tmax = Math.min(tmax, t2);
            if (tmin > tmax) return { hit: false };
        }
    }
    return { hit: true, t: tmin, point: add3(from, seg, tmin) };
}

/** Advance every shot, hit-test the survivors against `targets` ({id, team, body, half}), team- and self-
 * filtered. Among several targets a shot's travel segment enters this tick, the one with the SMALLEST t (the
 * one the shot's path actually reaches FIRST) wins -- not array order, which a review found could credit a
 * far target while silently passing a nearer one straight through. Returns {alive, events}; does not mutate
 * `shots`. Mirrors physics/turret.mjs's stepShells() shape. */
export function stepShots(shots, targets, dt, opts = {}) {
    const alive = [], events = [];
    for (const shot of shots) {
        const stepped = stepProjectile(shot, dt);
        if (!stepped) continue;
        let best = null;
        for (const target of targets) {
            if (target.team != null && stepped.team != null && target.team === stepped.team) continue;
            if (target.id != null && target.id === stepped.ownerId) continue;
            const obb = bodyOBB(target.body, target.half);
            const res = segmentHitsOBB(stepped, obb, { pad: (opts.pad || 0) + (stepped.radius || 0) });
            if (res.hit && (!best || res.t < best.res.t)) best = { target, res };
        }
        if (best) events.push({ targetId: best.target.id, ownerId: stepped.ownerId, point: best.res.point });
        else alive.push(stepped);
    }
    return { alive, events };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const I = boxInertia({ m: 6, hx: 4, hy: 4, hz: 4 }), half = [4, 4, 4];
    const shooter = createBody({ mass: 6, I: boxInertia({ m: 6, hx: 0.6, hy: 0.6, hz: 1.3 }), pos: [0, 0, 0] });
    const target = createBody({ mass: 6, I, pos: [16, 0, 0] });
    let shot = fireProjectile(shooter, { ownerId: "A", team: "A" });
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
        const { alive, events } = stepShots([shot], [{ id: "B", team: "B", body: target, half }], 1 / 30);
        if (events.length) hit = events[0]; else if (alive.length) shot = alive[0]; else break;
    }
    return [
        "[rigidBody6dofWeapon] a straight-line projectile fired along the shooter's own forward, hit-tested against",
        "                      a target's OBB (physics/obbOverlap.js) with an EXACT segment-vs-OBB slab test.",
        hit ? `  hit after flight: targetId=${hit.targetId} point ${hit.point.map((v) => v.toFixed(2))}` : "  (no hit within the demo's 60-tick budget)",
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
