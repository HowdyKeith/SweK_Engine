// WebGLEngine/bz/bzShotFlags.js — what a flag does to a bullet.
//
// v2211. `bz/net/bzFlags.js` reads all forty-six flags off the wire and implements the eight that change the
// TANK. This file implements the five that change the SHOT, and it turns out that four of them are not
// special code at all -- they are three numbers each, and BZFlag's own flag descriptions fall straight out
// of them.
//
//     flag                 vel      life      rate      what BZFlag says it does
//     Rapid Fire (F)      x1.5     x0.5      x2.0      "Shoots more often. Shells go faster but not as far."
//     Machine Gun (MG)    x1.5     x0.1      x10.0     "Very fast reload and very short range."
//     Laser (L)         x1000.0    x0.1      x0.5      "Infinite speed and range but long reload time."
//     Thief (TH)          x8.0     x0.05     x12.0     a very fast, very short shot: 140 m, and it steals
//
// A shot's base life is `_reloadTime`, which is itself `_shotRange / _shotSpeed` = 350/100 = 3.5 seconds.
// So range is `vel * life`, and:
//
//     Rapid Fire   150 * 1.75 = 262 m   -- faster, and NOT AS FAR. The description is arithmetic.
//     Machine Gun  150 * 0.35 =  52 m   -- "very short range" is `_mGunAdLife = 1.0 / _mGunAdRate`.
//     Laser     100000 * 0.35 = 35 km   -- "infinite" is a number, and it is thirty-five kilometres.
//
// `_mGunAdLife` IS DEFINED AS `1.0 / _mGunAdRate`. The lifetime is derived from the rate: a gun that fires
// ten times as often fires shots that live a tenth as long. Nobody would guess that from the field names,
// and it is the whole reason a machine gun is a short-range weapon.
//
// The two that ARE code:
//
//   Ricochet (R)      "Shots bounce off walls. Don't shoot yourself!" -- reflect instead of dying.
//   Super Bullet (SB) "Shoots through buildings." -- through BUILDINGS. Not through the world's walls, and
//                     not through the ground. A shot that leaves the map is still a shot that is gone.
//
// AND TWO NOTES I HAD WRONG, WRITTEN FROM THE ABBREVIATION AND CORRECTED FROM `src/common/Flag.cxx`:
// `BY` (Bouncy) is "Tank can't stop bouncing" -- it is not about shots at all. `TR` (Trigger Happy) is
// "Tank can't stop firing" -- also not about the shot. Both are still `UNIMPLEMENTED`, and now for the
// right reason.

"use strict";

import { stepShot } from "./bzTank.js";

// Every multiplier below is a BZDB key, so a server that `-set`s one is obeyed.
const SHOT_MODS = {
    F: { vel: "_rFireAdVel", life: "_rFireAdLife", rate: "_rFireAdRate" },
    MG: { vel: "_mGunAdVel", life: "_mGunAdLife", rate: "_mGunAdRate" },
    L: { vel: "_laserAdVel", life: "_laserAdLife", rate: "_laserAdRate" },
    TH: { vel: "_thiefAdShotVel", life: "_thiefAdLife", rate: "_thiefAdRate" },
    R: { ricochet: true },
    SB: { superBullet: true },
};

// Named, and not implemented here, with the reason:
const SHOT_UNIMPLEMENTED = {
    GM: "guided: needs MsgGMUpdate and a target lock",
    SW: "shock wave: an area-of-effect death on drop, not a bullet",
    IB: "invisible to others: a rendering rule, and this engine's shots are already only its own",
    PZ: "phantom zone: only PZ shots may hit a phased tank",
    G: "genocide: killing one tank kills its whole team",
    SR: "steamroller: a kill by driving, not by shooting",
};

const num = (db, key, fallback) => {
    if (!db || typeof db.eval !== "function") return fallback;
    const v = db.eval(key);
    return Number.isFinite(v) && v !== 0 ? v : fallback;
};

// What this flag does to a bullet. `null` for a flag that does nothing to one.
function shotSpecFor(abbrev, db) {
    const mod = SHOT_MODS[abbrev];
    if (!mod) return null;
    return {
        abbrev,
        velMul: mod.vel ? num(db, mod.vel, 1) : 1,
        lifeMul: mod.life ? num(db, mod.life, 1) : 1,
        // A higher RATE is a SHORTER reload. `_mGunAdRate = 10` means ten times as often.
        reloadMul: mod.rate ? 1 / num(db, mod.rate, 1) : 1,
        ricochet: !!mod.ricochet,
        superBullet: !!mod.superBullet,
    };
}

// Apply it to a shot at the moment it is fired. Nothing is mutated: a flag is dropped as easily as it is
// picked up, and the next shot must not remember the last one.
function applyShotFlag(shot, abbrev, db) {
    const s = shotSpecFor(abbrev, db);
    if (!s) return { ...shot, flag: abbrev || null };
    return {
        ...shot,
        flag: abbrev,
        vel: shot.vel.map((v) => v * s.velMul),
        life: shot.life * s.lifeMul,
        ricochet: s.ricochet,
        superBullet: s.superBullet,
    };
}

// A shot's range, in metres. Every one of BZFlag's flag descriptions is this number.
function shotRange(abbrev, db) {
    const baseVel = num(db, "_shotSpeed", 100);
    const baseLife = num(db, "_reloadTime", 3.5);
    const s = shotSpecFor(abbrev, db);
    return s ? baseVel * s.velMul * baseLife * s.lifeMul : baseVel * baseLife;
}

const MAX_BOUNCES = 8;

// `hitObstacle` gives us a hit and no normal, so the normal is FOUND rather than asked for: step each axis
// on its own and see which one was blocked. It is the standard trick and it is exact for the axis-aligned
// boxes this world is made of. A hit on two axes at once is a corner, and a corner reflects both.
function reflectAxis(world, shot, prev, isBlocked) {
    const [px, py, pz] = prev;
    const [nx, ny, nz] = shot.pos;
    const bx = isBlocked(nx, py, pz);
    const by = isBlocked(px, ny, pz);
    const bz = isBlocked(px, py, nz);
    // Blocked on no single axis means the corner itself: reverse the horizontal motion, which is what a
    // bullet in the corner of two walls does.
    if (!bx && !by && !bz) return [true, true, false];
    return [bx, by, bz];
}

// One step of a shot that may bounce, may pass through buildings, and may do neither. `stepShot` is the
// unflagged physics and is not duplicated here: a second copy of the substepping would be a second set of
// tunnelling bugs.
function stepShotWith(shot, world, dt, opts = {}) {
    const maxStep = opts.maxStep || 0.5;
    let bounced = 0;

    for (let guard = 0; guard <= MAX_BOUNCES; guard++) {
        const before = shot.pos.slice();
        const r = stepShot(shot, world, dt, maxStep);

        if (!shot.dead || !r.hit) return { ...r, bounced };

        // A shot that left the world, or hit the ground, is gone whatever flag it carries. "Shoots through
        // buildings" is not "shoots through the sky".
        const isBuilding = r.hit.type !== "wall" && r.hit.type !== "ground";

        if (shot.superBullet && isBuilding) {
            // Straight through. Re-run from the far side of the obstacle rather than from where it stopped,
            // or the next step starts inside the wall and stops again immediately.
            shot.dead = false;
            shot.pos = [
                before[0] + shot.vel[0] * dt,
                before[1] + shot.vel[1] * dt,
                before[2] + shot.vel[2] * dt,
            ];
            shot.life -= dt;
            if (shot.life <= 0) shot.dead = true;
            return { hit: null, passedThrough: r.hit, bounced };
        }

        if (shot.ricochet && r.hit.type !== "ground") {
            const blocked = (x, y, z) => {
                const probe = { pos: [x, y, z], vel: [0, 0, 0], life: 1, dead: false };
                const rr = stepShot(probe, world, 0, maxStep);
                return probe.dead || !!(rr && rr.hit);
            };
            const [bx, by, bz] = reflectAxis(world, shot, before, blocked);
            if (bx) shot.vel[0] = -shot.vel[0];
            if (by) shot.vel[1] = -shot.vel[1];
            if (bz) shot.vel[2] = -shot.vel[2];
            shot.pos = before;                 // back to where it was legal, and try again with the new heading
            shot.dead = false;
            bounced++;
            if (bounced > MAX_BOUNCES) { shot.dead = true; return { hit: r.hit, bounced }; }
            continue;
        }

        return { ...r, bounced };
    }
    shot.dead = true;
    return { hit: { type: "bounces" }, bounced };
}

export { SHOT_MODS, SHOT_UNIMPLEMENTED, shotSpecFor, applyShotFlag, shotRange, stepShotWith, MAX_BOUNCES };
