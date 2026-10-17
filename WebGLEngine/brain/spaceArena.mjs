// WebGLEngine/brain/spaceArena.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 6DOF SPACE BATTLE, STEPPABLE, WITH A CAPITAL SHIP IN IT. es-box3d-6dof.html runs two fleets of small fighters under real force and torque and cannot be watched a tick at a time or hold a ship with gun seats; this is the same world
// (physics/mechanics/rigidBody6dof.mjs bodies, brain/autopilot6dof.mjs's PD pilot, the page's fighter: 3.2 units long, 8 kg, 16 of thrust, a 900 unit/s gun at 3.3 shots a second, 100 hit points, 18 damage a hit) with the loop turned inside out, as
// brain/dogfightArena.mjs did for the flight fight -- and with a CAPITAL SHIP (physics/mechanics/capitalShip.mjs) that has gun seats with gunners. Two kinds of craft:
//
//   A FIGHTER   { id, team, name, kind: "fighter", state ({ pos, vel, q, w }), pilot ((body, target, opts) -> { torqueBody, thrust, firing }; default the PD autopilot) }. Against a CAPITAL SHIP it flies a doctrine of its own (see below); against a fighter it flies the page's plain pursuit.
//   A CAPITAL   { id, team, name, kind: "capital", state, ship (createCapitalShip()), gunner ((seat, k) -> decide; default gunSeats.handGunner in vacuum), behaviour: "face" (turn toward the nearest enemy at the hull's own limit) | "hold" (keep the heading), cruise (a fraction of its thrust, default 0.3) }.
//                 Its seats fire (each gunner is shown the enemy craft still flying and turns its seat and fires through gunSeats.stepSeat), its hit volume is the ship's spheres (a round names the part it reached; a turret or a PD mount shot to nothing
//                 takes its seat out of the fight, an engine pod a third of the thrust), and its wave-motion cannon -- an INVENTED weapon -- charges, and fires one hit-scan beam along the bow when an enemy is in it.
//
//   A TICK      every live craft decides from the states the tick started with; fighters and seats fire; the wave-motion cannon fires if it is charged and something is in its line; every body moves one tick; fighters that touch each other collide (brain/shipCollision6dof.mjs, as the page);
//               every round moves and is tested against the enemy craft (flightGuns.stepRounds with g = 0 and no ground: space) -- ROUNDS ARE TESTED PER TEAM AGAINST THE OTHER TEAMS' CRAFT ONLY, as the page's weapons are (so there is no friendly fire and no hold-fire rule here, unlike the flight arena); a fighter that touches a ship's
//               hull is lost and the ship takes 25; hit points gone is destroyed. THE FIGHT IS OVER when fewer than two teams have a craft flying, or at the time limit.
//
//   THE FIGHTERS' DOCTRINE AGAINST A CAPITAL SHIP is a HAND RULE, chosen, not trained, and the reason it exists is measured: the page's pilot has no braking, so a fighter that simply pursues a ship arrives at its hull at speed and rams it. A fighter APPROACHES by steering for a point 60 units to one side of the ship
//               (the side is its id's parity), thrusting; within 220 units and closing it STRAFES -- nose on the ship's lead point, thrust cut, guns firing -- and the lateral velocity it built on the way in carries it past. The learned 6DOF pilots (brain/pilot6dofPolicy.mjs) answer the same call and can fly it; nothing here was trained for it.
//
// WHAT IS NOT HERE, SAID PLAINLY: hit volumes are SPHERES, a fighter's 1.5 units (the page's are oriented boxes: tests of the page's own fighter-against-fighter fight are not this arena's); a fighter that touches a hull is lost without an impulse; ships do not collide with each other; wind and gravity do not exist (vacuum);
// a destroyed craft does not tumble (it stops, dark, where it was). stepSpaceArena() MUTATES the arena it is given. Pure otherwise: no DOM, no clock, no random.
"use strict";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as AP from "./autopilot6dof.mjs";
import * as SC from "./shipCollision6dof.mjs";

export const DT = 1 / 30;
/** The page's fighter, in this arena's numbers (es-box3d-6dof.html's HALF, SHIP_MASS, ENGINE_MOUNT, HP_MAX, SHOT_DAMAGE and RBW.WEAPON): `radius` is the hit sphere. */
export const FIGHTER = Object.freeze({ half: Object.freeze([1.6, 0.7, 0.7]), mass: 8, engineMount: Object.freeze([-1.4, 0, 0]), muzzle: Object.freeze([1.4, 0, 0]), hp: 100, radius: 1.5 });
export const FIGHTER_GUN = Object.freeze({ ...G.GUN, muzzleSpeed: 900, rate: 1000 / 300, magazine: 1e6, life: 2.5, damage: 18 });
/** The autopilot's numbers on the page (PAGE_AUTOPILOT): thrust 16, standoff 50, the weapon's speed for the lead. */
export const AUTOPILOT = Object.freeze({ weaponSpeed: 900, thrustForce: 16, standoff: 50 });
export const STRAFE_RANGE = 220, APPROACH_OFFSET = 60, RAM_DAMAGE = 25, VISION = 1500;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, fallback = [1, 0, 0]) => { const n = norm(a); return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : fallback; };

/**
 * A new arena. `crafts` are the definitions above; ids must be distinct positive integers. Returns { dt, seconds, t, i, crafts, rounds, events, done, over, autopilot }. A craft carries { id, team, name, kind, body, hp, hpMax, dead, status ("flying" | "destroyed" | "rammed"),
 * hits (damage it has dealt to the enemy), gun / seats / enginesRunning / partHp (Map part id -> hit points left) / charge / waves, last }.
 */
export function createSpaceArena({ crafts, dt = DT, seconds = 120, autopilot = AUTOPILOT } = {}) {
    if (!Array.isArray(crafts) || crafts.length < 2) throw new Error("spaceArena.createSpaceArena: an arena needs at least two crafts");
    const ids = new Set();
    for (const c of crafts) {
        if (!Number.isInteger(c.id) || c.id < 1 || ids.has(c.id)) throw new Error(`spaceArena.createSpaceArena: craft ids are distinct positive integers (got ${c.id})`);
        ids.add(c.id);
        if (c.kind !== "fighter" && c.kind !== "capital") throw new Error(`spaceArena.createSpaceArena: craft ${c.id} is a "fighter" or a "capital" (got ${c.kind})`);
        if (c.kind === "capital" && !c.ship) throw new Error(`spaceArena.createSpaceArena: craft ${c.id} is a capital ship with no ship`);
    }
    const made = crafts.map((c) => {
        const st = c.state || {}, cap = c.kind === "capital", ship = c.ship || null;
        const body = RB.createBody({ mass: cap ? ship.mass : FIGHTER.mass, I: cap ? [...ship.I] : RB.boxInertia({ m: FIGHTER.mass, hx: FIGHTER.half[0], hy: FIGHTER.half[1], hz: FIGHTER.half[2] }), pos: st.pos, vel: st.vel, q: st.q, w: st.w });
        const out = { id: c.id, team: c.team ?? c.id, name: c.name || `craft ${c.id}`, kind: c.kind, body, hp: c.hp ?? (cap ? ship.hp : FIGHTER.hp), hpMax: c.hp ?? (cap ? ship.hp : FIGHTER.hp), dead: false, status: "flying", hits: 0, last: null,
            ship, pilot: c.pilot || null, behaviour: c.behaviour || "face", cruise: c.cruise ?? 0.3, aimRadius: cap ? ship.aimRadius : FIGHTER.radius, mode: "approach", gun: cap ? null : G.createGun(FIGHTER_GUN), seats: [], enginesRunning: cap ? ship.engines.length : 0, partHp: new Map(), partHits: new Map(), charge: 0, waves: 0 };
        if (cap) {
            out.seats = ship.seats.map((seat, k) => ({ seat, state: GS.createSeatState(seat), decide: c.gunner ? c.gunner(seat, k) : GS.handGunner({ seed: c.id * 100 + k, gravity: 0, maxRange: 600, burst: 1 }), last: null, part: ship.seatPart[k] }));
            for (const p of ship.parts) if (p.hp !== null) out.partHp.set(p.id, p.hp);
        }
        return out;
    });
    return { dt, seconds, t: 0, i: 0, crafts: made, rounds: [], events: [], done: false, over: null, autopilot: { ...autopilot } };
}

const flying = (c) => !c.dead;
/** The nearest enemy craft still flying, from c, or null. Ties go to the lower id. */
export function nearestFoe(arena, c) {
    let best = null, bd = Infinity;
    for (const o of arena.crafts) {
        if (o === c || o.team === c.team || !flying(o)) continue;
        const d = norm(sub(o.body.pos, c.body.pos));
        if (d < bd || (d === bd && best && o.id < best.id)) { best = o; bd = d; }
    }
    return best;
}

/** Is a seat able to fire: the part it sits in has hit points left (a seat in a part that has none to lose always is)? */
export const seatWorks = (c, st) => !c.partHp.has(st.part) || c.partHp.get(st.part) > 0;

/**
 * What a fighter steers for and whether it may fire, against `foe`. Against a capital ship it flies the DOCTRINE in the header: approach a point APPROACH_OFFSET to the side (the side is the id's parity) with thrust, strafe within STRAFE_RANGE while closing (nose on the ship's lead, thrust cut). Against a
 * fighter it is the page's plain pursuit. Returns { target ({ pos, vel }), opts (the autopilot's), strafe (may fire) , mode }.
 */
export function fighterAim(arena, c, foe) {
    const base = { ...arena.autopilot }, rel = sub(foe.body.pos, c.body.pos), range = norm(rel);
    if (foe.kind !== "capital") return { target: { pos: foe.body.pos, vel: foe.body.vel }, opts: base, strafe: true, mode: "pursue" };
    const closing = -dot(rel, sub(foe.body.vel, c.body.vel)) / Math.max(range, 1e-9);
    if (range < STRAFE_RANGE && closing > 0) return { target: { pos: foe.body.pos, vel: foe.body.vel }, opts: { ...base, standoff: 1e9 }, strafe: true, mode: "strafe" };
    const u = unit(rel), side = cross(u, [0, 0, 1]), s = norm(side) > 1e-6 ? unit(side) : [0, 1, 0], sign = c.id % 2 === 0 ? 1 : -1;
    return { target: { pos: add(foe.body.pos, s, APPROACH_OFFSET * sign), vel: foe.body.vel }, opts: base, strafe: false, mode: "approach" };
}

/** The wave-motion cannon's beam, from the ship's bow along its axis: the craft of other teams still flying whose centre is within the beam's width (plus their own radius) of the line, out to the range. */
export function waveTargets(arena, c) {
    const w = c.ship.waveGun, fwd = RB.rotateByQuat(c.body.q, [1, 0, 0]), from = add(c.body.pos, RB.rotateByQuat(c.body.q, w.muzzle)), out = [];
    for (const o of arena.crafts) {
        if (o === c || o.team === c.team || !flying(o)) continue;
        const rel = sub(o.body.pos, from), along = dot(rel, fwd);
        if (along < 0 || along > w.range) continue;
        const perp = norm(sub(rel, [fwd[0] * along, fwd[1] * along, fwd[2] * along]));
        if (perp <= w.beamRadius + o.aimRadius) out.push(o);
    }
    return out;
}

/** One tick of every craft and every round. Mutates and returns the arena; a finished arena is returned untouched. `arena.events` is this tick's: [{ type: "hit" | "part" | "kill" | "wave" | "ram" | "collision", ... }]. */
export function stepSpaceArena(arena) {
    if (arena.done) return arena;
    const { dt } = arena, t = arena.i * dt, tEnd = (arena.i + 1) * dt, events = [], alive = arena.crafts.filter(flying), plan = new Map(), fresh = [];
    const tag = (rounds, c, gun) => rounds.map((r) => ({ ...r, team: c.team, dmg: gun.damage, life: gun.life }));
    // decisions, all from the states the tick started with
    for (const c of alive) {
        const foe = nearestFoe(arena, c);
        if (c.kind === "fighter") {
            let torque = [0, 0, 0], thrust = 0, fire = false, aim = null;
            if (foe) {
                aim = fighterAim(arena, c, foe); c.mode = aim.mode;
                const d = (c.pilot || AP.decide)(c.body, aim.target, aim.opts);
                torque = d.torqueBody; thrust = d.thrust; fire = !!d.firing && aim.strafe;
            }
            plan.set(c, { torque, thrust, fire, foe });
            c.last = { foe: foe ? foe.id : null, fire, thrust, mode: aim ? aim.mode : "idle", target: aim ? aim.target.pos : null };
        } else {
            let torque = [0, 0, 0];
            if (c.behaviour === "face" && foe) torque = CS.limitTorque(c.ship, AP.decide(c.body, { pos: foe.body.pos, vel: foe.body.vel }, { kp: c.ship.kp, kd: c.ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody);
            else torque = CS.limitTorque(c.ship, AP.decide(c.body, { pos: add(c.body.pos, RB.rotateByQuat(c.body.q, [1, 0, 0]), 1000) }, { kp: c.ship.kp, kd: c.ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody);
            plan.set(c, { torque, thrust: CS.thrustWith(c.ship, c.enginesRunning) * c.cruise, fire: false, foe });
            c.last = { foe: foe ? foe.id : null, fire: false, thrust: plan.get(c).thrust, mode: c.behaviour };
        }
    }
    // the guns: a fighter's fixed gun, then every working seat
    for (const c of alive) {
        if (c.kind === "fighter") {
            const p = plan.get(c), shot = G.fireFrom(c.gun, () => ({ pos: add(c.body.pos, RB.rotateByQuat(c.body.q, FIGHTER.muzzle)), vel: c.body.vel.slice(), dir: RB.rotateByQuat(c.body.q, [1, 0, 0]) }), p.fire, dt, c.id);
            c.gun = shot.gun; fresh.push(...tag(shot.rounds, c, FIGHTER_GUN));
        } else {
            const shown = alive.filter((o) => o.team !== c.team && norm(sub(o.body.pos, c.body.pos)) < VISION).map((o) => ({ id: o.id, pos: o.body.pos, vel: o.body.vel, radius: o.aimRadius }));
            for (const st of c.seats) {
                const cmd = seatWorks(c, st) ? st.decide(st.seat, st.state, c.body, shown, t) : { yaw: st.state.yaw, pitch: st.state.pitch, fire: false, target: null }, out = GS.stepSeat(st.seat, st.state, c.body, cmd, dt, c.id);
                st.state = out.state; st.last = cmd; fresh.push(...tag(out.rounds, c, st.seat.gun));
            }
        }
    }
    // the wave-motion cannon: it charges, and fires when something of the other teams is in its line
    const waved = new Set();
    for (const c of alive) {
        if (c.kind !== "capital") continue;
        const w = c.ship.waveGun; c.charge = Math.min(w.charge, c.charge + dt);
        if (c.charge >= w.charge) {
            const hit = waveTargets(arena, c);
            if (hit.length) {
                c.charge = 0; c.waves += 1;
                for (const o of hit) { o.hp -= w.damage; c.hits += w.damage; waved.add(o); }
                events.push({ type: "wave", t: tEnd, craft: c.id, victims: hit.map((o) => o.id), damage: w.damage });
            }
        }
    }
    // the bodies move
    const before = new Map(alive.map((c) => [c, { pos: c.body.pos.slice(), q: c.body.q.slice() }]));
    for (const c of alive) {
        const p = plan.get(c), acc = RB.createAccumulator();
        RB.applyForceAtPoint(acc, [p.thrust, 0, 0], c.kind === "fighter" ? FIGHTER.engineMount : [-CS.HALF[0], 0, 0]);
        acc.torque = p.torque.slice();
        c.body = RB.step(c.body, acc, dt);
    }
    // fighters that touch each other collide, as the page's do (the pairs of live fighters, in craft order)
    for (const e of SC.resolveShipCollisions(alive.filter((c) => c.kind === "fighter"), FIGHTER.half)) events.push({ type: "collision", t: tEnd, craft: e.a.id, with: e.b.id, damage: e.dmg });
    // every round moves and is tested against the other teams' craft
    const targetsOf = (cs) => cs.flatMap((c) => {
        const b0 = before.get(c);
        if (c.kind === "fighter") return [{ id: c.id, from: b0.pos, to: c.body.pos, radius: FIGHTER.radius }];
        const from = CS.partCentres(c.ship, { pos: b0.pos, q: b0.q }), to = CS.partCentres(c.ship, c.body);
        return from.map((p, k) => ({ id: c.id, part: p.part, from: p.center, to: to[k].center, radius: p.radius }));
    });
    const all = [...arena.rounds, ...fresh], teams = [...new Set(all.map((r) => r.team))], survivors = [], hits = [];
    for (const tm of teams) {
        const mine = all.filter((r) => r.team === tm), res = G.stepRounds(mine, dt, targetsOf(alive.filter((c) => c.team !== tm)), { g: 0, ground: null, life: 5 });
        survivors.push(...res.rounds); hits.push(...res.hits);
    }
    arena.rounds = survivors;
    const byId = new Map(arena.crafts.map((c) => [c.id, c]));
    for (const h of hits) {
        const victim = byId.get(h.target), shooter = byId.get(h.owner), dmg = h.round.dmg;
        victim.hp -= dmg; shooter.hits += dmg;
        events.push({ type: "hit", t: tEnd, shooter: shooter.id, victim: victim.id, point: h.point, damage: dmg, ...(h.part !== undefined ? { part: h.part } : {}) });
        if (h.part !== undefined) {
            victim.partHits.set(h.part, (victim.partHits.get(h.part) || 0) + dmg);
            if (victim.partHp.has(h.part)) {
                const left = victim.partHp.get(h.part) - dmg; victim.partHp.set(h.part, left);
                if (left <= 0 && left + dmg > 0) {
                    const p = victim.ship.parts[h.part];
                    if (p.kind === "engine") victim.enginesRunning -= 1;
                    events.push({ type: "part", t: tEnd, craft: victim.id, part: h.part, name: p.name, kind: p.kind, ...(p.kind === "engine" ? { running: victim.enginesRunning } : {}) });
                }
            }
        }
    }
    // a fighter that touches a ship's hull is lost, and the ship takes the ram
    for (const f of alive) {
        if (f.kind !== "fighter" || f.dead) continue;
        for (const s of alive) {
            if (s.kind !== "capital" || s.dead || s.team === f.team) continue;
            if (CS.partCentres(s.ship, s.body).some((p) => norm(sub(f.body.pos, p.center)) < p.radius + FIGHTER.radius)) {
                f.hp = 0; f.status = "rammed"; s.hp -= RAM_DAMAGE; events.push({ type: "ram", t: tEnd, craft: f.id, with: s.id, damage: RAM_DAMAGE }); break;
            }
        }
    }
    arena.i += 1; arena.t = arena.i * dt;
    for (const c of alive) {
        if (c.hp <= 0 && !c.dead) { c.dead = true; if (c.status === "flying") c.status = "destroyed"; events.push({ type: "kill", t: arena.t, craft: c.id, ...(waved.has(c) ? { by: "wave" } : {}) }); }
    }
    const teamsLeft = new Set(arena.crafts.filter(flying).map((c) => c.team));
    if (teamsLeft.size < 2) { arena.done = true; arena.over = teamsLeft.size === 1 ? "one team left flying" : "no team left flying"; }
    else if (arena.i >= Math.round(arena.seconds / dt)) { arena.done = true; arena.over = "time"; }
    arena.events = events;
    return arena;
}

/** Step until the arena is done. Returns it. */
export function runSpaceArena(arena) { while (!arena.done) stepSpaceArena(arena); return arena; }

/** The teams with a craft still flying. */
export const teamsFlying = (arena) => [...new Set(arena.crafts.filter(flying).map((c) => c.team))];

export function reportLines() {
    const ship = CS.createCapitalShip(), q = [1, 0, 0, 0];
    const crafts = [{ id: 1, team: 1, name: "capital ship", kind: "capital", ship, state: { pos: [0, 0, 0], q } }];
    for (let k = 0; k < 4; k++) crafts.push({ id: 2 + k, team: 2, name: `fighter ${k + 1}`, kind: "fighter", state: { pos: [-380 - 20 * k, (k - 1.5) * 40, (k % 2 ? 1 : -1) * 15], q } });
    const a = runSpaceArena(createSpaceArena({ crafts, seconds: 60 })), cap = a.crafts[0], fs = a.crafts.slice(1);
    return ["[spaceArena] the 6DOF space battle, steppable, with a capital ship that has gun seats: fighters (the page's) against a Yamato-like ship",
        `  four fighters against the capital ship, ${a.i} ticks (${a.over}): the ship has ${Math.max(0, cap.hp).toFixed(0)}/${cap.hpMax} hit points and ${cap.enginesRunning} engine pods, ${fs.filter((f) => f.dead).length} of 4 fighters lost, ${cap.hits} damage dealt by its guns, ${fs.reduce((x, f) => x + f.hits, 0)} by the fighters`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
