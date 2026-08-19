// WebGLEngine/bz/bzCombat.js — shots that can hit a tank.
//
// Round four gave shots something to stop against; nothing they could kill. This is the smallest honest
// thing that makes a tank a target:
//
//   * A shot is a point. A tank is an oriented box, half a tank-length by half a tank-width, one tank
//     height tall, with `pos` at the centre of its underside. A hit is the point in the box.
//   * ONE SHOT KILLS. In BZFlag a tank has no hit points; the Shield flag absorbs one hit and there are
//     no flags here, so a hit is a death. Pretending otherwise would be inventing a health bar the game
//     does not have.
//   * A tank cannot shoot itself. `_muzzleFront` is `_tankRadius + 0.1`, so a shot is born clear of its
//     own hull -- but a shot that ricochets, or a tank that reverses into its own line, would otherwise
//     kill its owner the moment the two overlap. The owner is excluded by id, not by geometry.
//
// Respawning is BZFlag's in spirit and not in detail: a free spot, chosen at random, away from everyone.
// BZFlag consults the map's `zone` blocks for spawn areas; those are parsed and not simulated (round one
// said so), and inventing a spawn policy that reads them would be inventing rules. This one is named.

"use strict";

import { free } from "./bzTank.js";
import { obstacleHit } from "./bzCollide.js";

// The tank's box, in its own frame: |x| <= dx, |y| <= dy, 0 <= z <= height.
function pointInTank(p, tank) {
    const s = tank.spec;
    const dx = p[0] - tank.pos[0], dy = p[1] - tank.pos[1], dz = p[2] - tank.pos[2];
    if (dz < 0 || dz > s.height) return false;
    const c = Math.cos(-tank.angle), sn = Math.sin(-tank.angle);
    const lx = c * dx - sn * dy, ly = sn * dx + c * dy;
    return Math.abs(lx) <= s.dx && Math.abs(ly) <= s.dy;
}

// Which tank a shot has just hit, if any. `shot.owner` never hits itself.
function shotHitsTank(shot, tanks) {
    for (const t of tanks) {
        if (t.dead) continue;
        if (shot.owner != null && t.id === shot.owner) continue;
        if (pointInTank(shot.pos, t)) return t;
    }
    return null;
}

// One shot, one death. The killer is recorded so the same owner-addressed damage wire the ES co-op layer
// uses -- esAuthority.damageEvent / validateDamage / noteDead -- can carry the news without a second
// protocol. A tank is an npc with a name.
function killTank(tank, byId, nowMs) {
    tank.dead = true;
    tank.diedAt = nowMs;
    tank.killedBy = byId != null ? String(byId) : null;
    return tank;
}

// v2188 -- SPAWN ZONES. A `zone` with a `team` list is where those teams come back. BZFlag's zones are
// oriented rectangles like everything else, so a point in one is a point in its own frame within its own
// half-extents. A team with no zone spawns anywhere, which is what a map without zones means.
function spawnZonesFor(world, team) {
    if (team == null) return [];
    return (world.zones || []).filter((z) => z.teams && z.teams.map(Number).includes(Number(team)));
}
function pointInZone(z, rnd) {
    const lx = (rnd() * 2 - 1) * z.size[0];
    const ly = (rnd() * 2 - 1) * z.size[1];
    const c = Math.cos(z.rotation || 0), s = Math.sin(z.rotation || 0);
    return [z.pos[0] + c * lx - s * ly, z.pos[1] + s * lx + c * ly];
}

// Where the flags of this map would go. `flag` on a zone names the flag types that spawn in it; `zoneflag`
// pins a specific one. We return the zones, not the flags: what a flag DOES is sixty game rules, and a map
// only says where they land. Naming that boundary is better than pretending to a flag system.
function flagZones(world) {
    return (world.zones || []).filter((z) => (z.flags && z.flags.length) || (z.zoneFlags && z.zoneFlags.length));
}

// A place to come back to. Tries random points, keeps the one furthest from everybody else, and gives up
// honestly rather than dropping a tank inside a box.
function findSpawn(world, tank, others, rnd, opts = {}) {
    const half = world.world.size / 2;
    const margin = opts.margin != null ? opts.margin : tank.spec.length;
    const tries = opts.tries || 64;
    const zones = spawnZonesFor(world, opts.team);
    let best = null, bestD = -1;
    for (let i = 0; i < tries; i++) {
        let x, y;
        if (zones.length) {
            const z = zones[Math.min(zones.length - 1, Math.floor(rnd() * zones.length))];
            [x, y] = pointInZone(z, rnd);
        } else {
            x = (rnd() * 2 - 1) * (half - margin);
            y = (rnd() * 2 - 1) * (half - margin);
        }
        const a = rnd() * Math.PI * 2;
        if (!free(world, tank, x, y, 0, a)) continue;
        let d = Infinity;
        for (const o of others) {
            if (o === tank || o.dead) continue;
            const dd = Math.hypot(o.pos[0] - x, o.pos[1] - y);
            if (dd < d) d = dd;
        }
        if (d > bestD) { bestD = d; best = { pos: [x, y, 0], angle: a }; }
    }
    return best;   // null: nowhere to stand. The caller decides what that means.
}

function respawn(tank, world, others, rnd, nowMs, afterMs) {
    if (!tank.dead || !afterMs) return false;
    if (nowMs - tank.diedAt < afterMs) return false;
    const spot = findSpawn(world, tank, others, rnd);
    if (!spot) return false;
    tank.pos = spot.pos.slice();
    tank.angle = spot.angle;
    tank.vz = 0;
    tank.onGround = true;
    tank.reload = 0;
    tank.dead = false;
    tank.diedAt = null;
    tank.killedBy = null;
    return true;
}

// Is there a clear line from a muzzle to a point? A shot is a point moving in a straight line, so the
// question is whether any obstacle sits between. Stepped, not swept: the same sub-division stepShot uses,
// for the same reason -- a 100 m/s shot must not skip a 40 cm wall.
function lineOfFire(world, from, to, step = 0.5) {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-9) return true;
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 1; i < n; i++) {
        const t = i / n;
        const p = [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t];
        for (const o of world.obstacles) {
            if (o.shootThrough) continue;
            if (pointInObstacle(o, p)) return false;
        }
    }
    return true;
}

// A point, against one obstacle. The tank's own predicate with a zero-sized box. `drivethrough` is not
// `shootthrough`: a shot is stopped by a wall you could have driven through.
function pointInObstacle(o, p) {
    const saved = o.driveThrough;
    o.driveThrough = false;
    let hit = false;
    try { hit = !!obstacleHit(o, p[0], p[1], p[2], 0, 0, 0, 0); } finally { o.driveThrough = saved; }
    return hit;
}

export { pointInTank, shotHitsTank, killTank, findSpawn, respawn, lineOfFire, pointInObstacle, spawnZonesFor, pointInZone, flagZones };
if (typeof module !== "undefined" && module.exports)
    module.exports = { pointInTank, shotHitsTank, killTank, findSpawn, respawn, lineOfFire, pointInObstacle, spawnZonesFor, pointInZone, flagZones };
