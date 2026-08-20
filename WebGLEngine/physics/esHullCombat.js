// esHullCombat.js -- real hull physics for Endless Sky combat, layered on the esBox3d flight substrate. box3d
// already makes ES ships collide (ram, bump, no-overlap); this adds the COMBAT consequences: a ram deals damage
// proportional to the impact momentum, a destroyed ship bursts into tumbling debris (box3d rigid bodies with spin),
// and asteroid fields are heavy bodies ships smash into. Collision DETECTION here is analytical (reduced-mass
// closing momentum along the contact normal) so it is deterministic and headless-testable; box3d owns the physical
// separation + tumble on a real rig. Everything is a pure function of state + a seeded RNG, so it stays in sync
// across peers under box3dLockstep. Coordinate map matches esBox3d: ES (x,y) <-> box3d (x,z), y is out-of-plane.
"use strict";

import { createESBox3D } from "./esBox3d.js";

// deterministic RNG (mulberry32) -- same seed => same debris on every peer
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createHullCombat(world, opts = {}) {
    const sub = createESBox3D(world, opts);
    const rng = mulberry32((opts.seed | 0) || 1234567);
    const recs = [];        // { rec, ship, hp, maxHp, mass, r, dead, team, cool }
    const asteroids = [];   // { idx, x, y, r, mass }
    const debris = [];      // { idx, x, y, vx, vy, r, mass, spin, ttl }
    const shots = [];       // { x, y, vx, vy, dmg, life, team, r } -- weapon fire (kinematic, gameplay not physics)
    const ramK = opts.ramDamage != null ? opts.ramDamage : 0.28;    // hp per unit velocity-change on impact
    const ramThresh = opts.ramThreshold != null ? opts.ramThreshold : 22;   // min |dv| to count as a ram (ignore grazes)
    let events = [];        // per-step log: rams + deaths + fire/hit (for the UI / audio)

    function addShip(ship, stats, hp = 100) {
        const rec = sub.add(ship, stats);
        const half = ship.half || opts.shipHalf || 30;
        const mass = (stats && stats.mass) || half * half;
        const r = { rec, ship, hp, maxHp: hp, mass, r: half, dead: false, team: ship.team || null, cool: 0, ramCool: 0 };
        recs.push(r); return r;
    }
    // fire a weapon shot from a ship along an angle (radians). Kinematic gameplay projectile, not a box3d body,
    // so it stays cheap and deterministic. Damage/speed/life tunable; the shot carries the firer's team so it
    // never hits friendlies. Caller gates cadence (cooldown lives on the rec).
    function fire(r, angle, o = {}) {
        if (r.dead) return null;
        const speed = o.speed || 620, life = o.life || 60;
        const muzzle = r.r + 6;
        shots.push({ x: r.ship.x + Math.cos(angle) * muzzle, y: r.ship.y + Math.sin(angle) * muzzle, vx: Math.cos(angle) * speed + (r.ship.vx || 0), vy: Math.sin(angle) * speed + (r.ship.vy || 0), dmg: o.dmg || 9, life, team: r.team, r: o.r || 5 });
        events.push({ type: "fire", x: r.ship.x, y: r.ship.y });
        return shots[shots.length - 1];
    }
    function addAsteroid(x, y, radius = 60) {
        const idx = world.addShip({ x, z: y, half: radius, density: opts.astDensity || 4 });
        const a = { idx, x, y, r: radius, mass: radius * radius * (opts.astDensity || 4) };
        asteroids.push(a); return a;
    }

    // read debris + asteroid transforms/velocities back from box3d after a step
    function _syncBodies() {
        const xf = world.readTransforms(), vel = world.readVelocities();
        for (const d of debris) { const o = d.idx * 7, vo = d.idx * 3; if (o + 3 <= xf.length) { d.x = xf[o]; d.y = xf[o + 2]; } if (vo + 3 <= vel.length) { d.vx = vel[vo]; d.vy = vel[vo + 2]; } }
        for (const a of asteroids) { const vo = a.idx * 3; if (vo + 3 <= vel.length) { /* asteroids may drift after impact */ } }
    }

    // one collidable snapshot: alive ships + asteroids + debris, each {x,y,vx,vy,r,mass,kind,ref}
    // a list of every collidable's world-plane position/radius, for attributing a ram to what was hit (flavor only)
    function _bodiesNear(x, y, exclude) {
        let best = null, bd = Infinity;
        for (let k = 0; k < recs.length; k++) { const r = recs[k]; if (r.dead || r === exclude) continue; const d = Math.hypot(r.ship.x - x, r.ship.y - y) - r.r; if (d < bd) { bd = d; best = { kind: "ship", ref: r }; } }
        for (const a of asteroids) { const d = Math.hypot(a.x - x, a.y - y) - a.r; if (d < bd) { bd = d; best = { kind: "asteroid", ref: a }; } }
        for (const d0 of debris) { if (d0.ttl <= 0) continue; const d = Math.hypot(d0.x - x, d0.y - y) - d0.r; if (d < bd) { bd = d; best = { kind: "debris", ref: d0 }; } }
        return best;
    }

    // ram detection by VELOCITY DELTA: a real physics backend (Jolt, box3d) resolves the collision DURING step and
    // won't let bodies overlap, so the ram shows up as the change between a ship's intended velocity (what driveShip
    // set) and its actual post-step velocity. |dv| is the impact severity; heavier ships get less dv, so mass falls
    // out naturally. Backend-agnostic (works on any world that resolves contacts) and deterministic -> lockstep-safe.
    function _resolveImpacts(vel0, vel1) {
        for (let k = 0; k < recs.length; k++) {
            const r = recs[k]; if (r.dead || r.ramCool > 0) continue;
            const i3 = r.rec.idx * 3; if (i3 + 3 > vel1.length) continue;
            const dvx = vel1[i3] - vel0[i3], dvz = vel1[i3 + 2] - vel0[i3 + 2], dv = Math.hypot(dvx, dvz);
            if (dv < ramThresh) continue;
            r.hp -= ramK * dv; r.ramCool = 8;   // debounce: one hit per collision, not per contact frame
            const hit = _bodiesNear(r.ship.x, r.ship.y, r);
            events.push({ type: "ram", into: hit ? hit.kind : "?", dv: Math.round(dv), dmg: Math.round(ramK * dv) });
        }
    }

    // a destroyed ship bursts into tumbling debris chunks (deterministic count/velocity/spin from the seeded RNG)
    function _spawnDebris(r) {
        const n = opts.debrisCount || 5;
        for (let k = 0; k < n; k++) {
            const ang = rng() * Math.PI * 2, spd = 25 + rng() * 70, dr = Math.max(4, r.r * 0.28);
            const idx = world.addShip({ x: r.ship.x, z: r.ship.y, half: dr, density: 0.8 });
            const vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd;
            world.setVelocity(idx, [vx, 0, vy]);
            const spin = (rng() - 0.5) * 5.0;
            if (typeof world.angularImpulse === "function") { try { world.angularImpulse(idx, [0, spin, 0]); } catch {} }   // tumble on rig
            debris.push({ idx, x: r.ship.x, y: r.ship.y, vx, vy, r: dr, mass: dr * dr * 0.8, spin, ttl: opts.debrisTtl || 240 });
        }
        events.push({ type: "death", x: r.ship.x, y: r.ship.y, debris: n });
    }

    function step(inputFor, dt = 1 / 30) {
        events = [];
        for (const r of recs) if (!r.dead) sub.driveShip(r.rec, (inputFor && inputFor(r.ship, r.rec)) || null, dt);
        const vel0 = world.readVelocities();     // intended velocities (post-driveShip, pre-step)
        world.step(dt, opts.substeps || 4);
        sub.sync();
        _syncBodies();
        const vel1 = world.readVelocities();     // actual velocities (after the backend resolved contacts)
        _resolveImpacts(vel0, vel1);
        _stepShots(dt);
        for (const r of recs) if (!r.dead && r.hp <= 0) { r.dead = true; _spawnDebris(r); }
        for (const d of debris) if (d.ttl > 0) d.ttl -= 1;
        for (const r of recs) { if (r.cool > 0) r.cool -= 1; if (r.ramCool > 0) r.ramCool -= 1; }
        return events;
    }

    // advance weapon shots, hit-test against enemy ships (never friendlies), apply damage, expire on hit or life.
    function _stepShots(dt) {
        for (let s = shots.length - 1; s >= 0; s--) {
            const p = shots[s]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 1;
            let hit = false;
            for (const r of recs) { if (r.dead || r.team === p.team) continue; const dx = r.ship.x - p.x, dy = r.ship.y - p.y; if (dx * dx + dy * dy <= (r.r + p.r) * (r.r + p.r)) { r.hp -= p.dmg; events.push({ type: "hit", x: p.x, y: p.y, dmg: p.dmg }); hit = true; break; } }
            if (hit || p.life <= 0) shots.splice(s, 1);
        }
    }

    return {
        addShip, addAsteroid, fire, step,
        shots: () => shots.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, team: p.team })),
        ships: () => recs.map((r) => ({ x: r.ship.x, y: r.ship.y, heading: r.ship.heading, hp: r.hp, maxHp: r.maxHp, dead: r.dead, team: r.team })),
        debris: () => debris.filter((d) => d.ttl > 0).map((d) => ({ x: d.x, y: d.y, r: d.r, spin: d.spin })),
        asteroids: () => asteroids.map((a) => ({ x: a.x, y: a.y, r: a.r })),
        aliveCount: () => recs.filter((r) => !r.dead).length,
        events: () => events,
        stateHash: () => sub.stateHash(),
        _recs: recs, _debris: debris,
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createHullCombat };
