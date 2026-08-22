// WebGLEngine/bz/bzTank.js — something that drives around inside it.
//
// Every number here comes out of the state database, because in BZFlag every number does. `_tankRadius`
// is the string `"0.72 * _tankLength"`; `_reloadTime` is `"_shotRange / _shotSpeed"`, which is 3.5 seconds
// and is written nowhere. Round one built the expression evaluator for the sake of a box's default size;
// this is what it was really for.
//
// Motion, from src/bzflag/LocalPlayer.cxx (2.4 branch):
//
//   * A tank has no acceleration. Its speed IS its input times `_tankSpeed`, and its turn rate IS its
//     input times `_tankAngVel`. There is nothing to tune and nothing to integrate.
//   * Gravity is `_gravity` (-9.8) and a jump sets the vertical velocity to `_jumpVelocity` (19.0), which
//     is a jump of about 18.4 metres. That is not a typo, and it is why you can land on a box.
//   * The collision box is half a tank-length in x, half a tank-width in y, one tank-height tall, and
//     `pos` is the centre of its underside.
//
// The collision RESPONSE is ours, and is named as such: BZFlag computes an obstacle normal and slides
// along it. We try the whole move; if it is blocked we try each axis alone; if both are blocked we stop.
// It slides along a wall and it never tunnels, which is what the tests check. It is not BZFlag's bounce.

"use strict";

import { makeBZDB } from "./bzdb.js";
import { worldHit, groundHeightAt } from "./bzCollide.js";
import { tryTeleport } from "./bzTeleport.js";   // v2188 -- the doorway

// Everything the tank is, pulled through the expression evaluator once.
function tankSpec(db) {
    return {
        width: db.eval("_tankWidth"),
        length: db.eval("_tankLength"),
        height: db.eval("_tankHeight"),
        radius: db.eval("_tankRadius"),            // "0.72 * _tankLength"
        speed: db.eval("_tankSpeed"),
        angVel: db.eval("_tankAngVel"),            // radians per second
        gravity: db.eval("_gravity"),
        jumpVelocity: db.eval("_jumpVelocity"),
        muzzleHeight: db.eval("_muzzleHeight"),
        muzzleFront: db.eval("_muzzleFront"),      // "_tankRadius + 0.1"
        shotSpeed: db.eval("_shotSpeed"),
        shotRange: db.eval("_shotRange"),
        reloadTime: db.eval("_reloadTime"),        // "_shotRange / _shotSpeed" -- 3.5 seconds, written nowhere
        // LocalPlayer.cxx passes half a tank-length in x and half a tank-width in y to inBox.
        get dx() { return 0.5 * this.length; },
        get dy() { return 0.5 * this.width; },
    };
}

function makeTank(db, opts = {}) {
    const spec = tankSpec(db || makeBZDB());
    return {
        spec,
        pos: (opts.pos || [0, 0, 0]).slice(),
        angle: opts.angle || 0,
        vz: 0,
        onGround: true,
        reload: 0,
    };
}

// Is the tank's box free here? The world's walls are not obstacles -- they are the boundary.
function free(world, t, x, y, z, angle) {
    const half = world.world.size / 2;
    if (!world.world.noWalls) {
        // The tank's own box, projected onto the world axes. A rotated tank needs a rotated footprint.
        const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
        const ex = c * t.spec.dx + s * t.spec.dy, ey = s * t.spec.dx + c * t.spec.dy;
        if (x - ex < -half || x + ex > half || y - ey < -half || y + ey > half) return false;
    }
    return !worldHit(world, x, y, z, angle, t.spec.dx, t.spec.dy, t.spec.height);
}

// Where a tank comes to rest above (x, y). `groundHeightAt` finds the tallest FLAT roof, which is enough
// for a box and useless for a pyramid: a pyramid has no roof, it has a slope, and a tank that lands on one
// perches wherever the shrinking rectangle no longer contains it. So the flat answer is only a starting
// point, and we climb from it until the tank is free.
//
// Without this, falling ignored obstacles entirely: `groundHeightAt` said zero over a pyramid, the tank
// dropped to the floor, and the floor was inside the pyramid. 4,031 frames out of 6,000 in arena.bzw had
// the tank standing in something, and nothing noticed until this file counted.
function restingHeight(world, t, x, y, angle, from) {
    // A roof above the tank is a ceiling, not a floor. See groundHeightAt.
    const z0 = groundHeightAt(world, x, y, angle, t.spec.dx, t.spec.dy, from != null ? from : t.pos[2]);
    if (free(world, t, x, y, z0, angle)) return z0;
    const step = 0.05;
    const ceiling = from != null ? from : z0 + 60;
    let lo = z0, hi = null;
    for (let i = 0; i < 2000 && lo < ceiling; i++) {
        const z = lo + step;
        if (free(world, t, x, y, z, angle)) { hi = z; break; }
        lo = z;
    }
    if (hi == null) return ceiling;   // wedged: stay where we were rather than teleporting out the top
    // The coarse step found the roof to within 5cm. Bisect, or a tank lands five centimetres above a box
    // and the difference shows up the moment anyone measures it. Thirty halvings is exact enough for a
    // float and cheap enough to run every frame.
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (free(world, t, x, y, mid, angle)) hi = mid; else lo = mid;
    }
    return hi;
}

// One step. `input` is { forward: -1..1, turn: -1..1, jump: bool, fire: bool }.
//
// Order matters and is BZFlag's: turn, then move, then fall.
//
// A TURN CAN COLLIDE. A tank's footprint is 6 by 2.8, so rotating it sweeps a wider box than it occupied.
// LocalPlayer::doUpdateMotion tests the new POSITION AND THE NEW ANGLE together and expels the tank if the
// pair collides; a turn is not free. The first draft here let turns through unchecked, and a tank pressed
// against a wall rotated its own corners into it -- 4,031 frames out of 6,000 in arena.bzw, and not one of
// them a translation. A refused turn is the honest, cheap version of BZFlag's expulsion.
function stepTank(t, input, world, dt, opts) {
    const s = t.spec;
    const out = { moved: false, blocked: null, landed: false, jumped: false, fired: null };

    if (t.reload > 0) t.reload = Math.max(0, t.reload - dt);

    // 1. turn -- and put it back if it would rotate the tank into something
    const turn = Math.max(-1, Math.min(1, input.turn || 0));
    if (turn) {
        const na = t.angle + turn * s.angVel * dt;
        if (free(world, t, t.pos[0], t.pos[1], t.pos[2], na)) t.angle = na;
        else out.blocked = out.blocked || worldHit(world, t.pos[0], t.pos[1], t.pos[2], na, s.dx, s.dy, s.height) || { type: "wall" };
    }

    // 2. move, in the direction the tank faces
    const drive = Math.max(-1, Math.min(1, input.forward || 0));
    if (drive) {
        const step = drive * s.speed * dt;
        const nx = t.pos[0] + Math.cos(t.angle) * step;
        const ny = t.pos[1] + Math.sin(t.angle) * step;
        if (free(world, t, nx, ny, t.pos[2], t.angle)) {
            t.pos[0] = nx; t.pos[1] = ny; out.moved = true;
        } else {
            // Blocked. Try each axis alone: a tank driving into a wall at an angle slides along it.
            // This is OUR response, not BZFlag's normal-and-bounce, and it is why it is written here.
            out.blocked = worldHit(world, nx, ny, t.pos[2], t.angle, s.dx, s.dy, s.height);
            if (free(world, t, nx, t.pos[1], t.pos[2], t.angle)) { t.pos[0] = nx; out.moved = true; }
            else if (free(world, t, t.pos[0], ny, t.pos[2], t.angle)) { t.pos[1] = ny; out.moved = true; }
        }
    }

    // 3. jump, and fall
    if (input.jump && t.onGround) { t.vz = s.jumpVelocity; t.onGround = false; out.jumped = true; }
    if (!t.onGround || t.vz !== 0) {
        t.vz += s.gravity * dt;
        let nz = t.pos[2] + t.vz * dt;
        if (t.vz <= 0) {
            const rest = restingHeight(world, t, t.pos[0], t.pos[1], t.angle, t.pos[2]);
            if (nz <= rest) { nz = rest; t.vz = 0; t.onGround = true; out.landed = true; }
            else t.onGround = false;
        } else {
            t.onGround = false;
            // Rising into a ceiling stops the climb rather than passing through it.
            if (!free(world, t, t.pos[0], t.pos[1], nz, t.angle)) { nz = t.pos[2]; t.vz = 0; }
        }
        t.pos[2] = nz;
    } else {
        // Standing. If the floor moved out from under us -- we drove off a roof -- start falling.
        const rest = restingHeight(world, t, t.pos[0], t.pos[1], t.angle, t.pos[2]);
        if (rest < t.pos[2] - 1e-6) { t.onGround = false; t.vz = 0; }
        else if (rest > t.pos[2]) t.pos[2] = rest;   // drove up onto a low step
    }

    // 4. through the doorway. After the move, because you cross a teleporter by being in it -- and the
    //    world carries its own resolved links, so nothing that steps a tank has to know they exist.
    if (world.linking) {
        const tp = tryTeleport(world, world.linking, t, dt, opts && opts.rnd);
        if (tp) out.teleported = tp;
    }

    // 5. fire
    if (input.fire && t.reload <= 0) {
        t.reload = s.reloadTime;
        out.fired = makeShot(t);
    }
    return out;
}

// A shot leaves the muzzle: `_muzzleFront` ahead of the tank's centre, `_muzzleHeight` up, at `_shotSpeed`.
// It lives for `_shotRange / _shotSpeed` seconds -- which is exactly `_reloadTime`, so a tank has exactly
// one shot in the air at a time unless a flag says otherwise. That relationship is in the data, not in
// any line of code, and it is the reason bzdb.js evaluates rather than tabulates.
function makeShot(t) {
    const s = t.spec;
    return {
        pos: [t.pos[0] + Math.cos(t.angle) * s.muzzleFront,
            t.pos[1] + Math.sin(t.angle) * s.muzzleFront,
            t.pos[2] + s.muzzleHeight],
        vel: [Math.cos(t.angle) * s.shotSpeed, Math.sin(t.angle) * s.shotSpeed, 0],
        life: s.shotRange / s.shotSpeed,
        angle: t.angle,
    };
}

// A shot is a point. It stops at the first thing it hits, and `shootthrough` obstacles are not things.
// The step is sub-divided so a 100 m/s shot cannot pass through a 1-metre wall in a 60Hz frame.
function stepShot(shot, world, dt, maxStep = 0.5) {
    const speed = Math.hypot(shot.vel[0], shot.vel[1], shot.vel[2]);
    const steps = Math.max(1, Math.ceil((speed * dt) / maxStep));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
        const nx = shot.pos[0] + shot.vel[0] * h;
        const ny = shot.pos[1] + shot.vel[1] * h;
        const nz = shot.pos[2] + shot.vel[2] * h;
        const hit = hitObstacle(world, nx, ny, nz);
        if (hit) { shot.dead = true; return { hit }; }
        const half = world.world.size / 2;
        if (!world.world.noWalls && (Math.abs(nx) > half || Math.abs(ny) > half)) { shot.dead = true; return { hit: { type: "wall" } }; }
        if (nz < 0) { shot.dead = true; return { hit: { type: "ground" } }; }
        shot.pos[0] = nx; shot.pos[1] = ny; shot.pos[2] = nz;
    }
    shot.life -= dt;
    if (shot.life <= 0) shot.dead = true;
    return { hit: null };
}

// A point-vs-obstacle test: the same predicate as the tank's, with a zero-sized box.
function hitObstacle(world, x, y, z) {
    for (const o of world.obstacles) {
        if (o.shootThrough) continue;
        if (worldHitOne(o, x, y, z)) return o;
    }
    return null;
}
function worldHitOne(o, x, y, z) {
    const saved = o.driveThrough;
    o.driveThrough = false;                       // `drivethrough` does not mean `shootthrough`
    const hit = worldHit({ obstacles: [o] }, x, y, z, 0, 0, 0, 0);
    o.driveThrough = saved;
    return !!hit;
}

export { tankSpec, makeTank, stepTank, makeShot, stepShot, hitObstacle, free, restingHeight };
if (typeof module !== "undefined" && module.exports)
    module.exports = { tankSpec, makeTank, stepTank, makeShot, stepShot, hitObstacle, free, restingHeight };
