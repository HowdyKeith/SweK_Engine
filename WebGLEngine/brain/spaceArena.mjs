// WebGLEngine/brain/spaceArena.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 6DOF SPACE BATTLE, STEPPABLE, WITH A CAPITAL SHIP IN IT. es-box3d-6dof.html runs two fleets of small fighters under real force and torque and cannot be watched a tick at a time or hold a ship with gun seats; this is the same world
// (physics/mechanics/rigidBody6dof.mjs bodies, brain/autopilot6dof.mjs's PD pilot, the page's fighter: 3.2 units long, 8 kg, 16 of thrust, a 900 unit/s gun at 3.3 shots a second, 100 hit points, 18 damage a hit) with the loop turned inside out, as
// brain/dogfightArena.mjs did for the flight fight -- and with a CAPITAL SHIP (physics/mechanics/capitalShip.mjs) that has gun seats with gunners. Two kinds of craft:
//
//   A FIGHTER   { id, team, name, kind: "fighter", state ({ pos, vel, q, w }), pilot ((body, target, opts) -> { torqueBody, thrust, firing }; default the PD autopilot) }. Against a CAPITAL SHIP it flies a doctrine of its own (see below); against a fighter it flies the page's plain pursuit.
//   A CAPITAL   { id, team, name, kind: "capital", state, ship (createCapitalShip()), gunner ((seat, k) -> decide; default gunSeats.handGunner in vacuum), behaviour: "face" (turn toward the nearest enemy at the hull's own limit) | "hold" (keep the heading) | "station" (keep a slot beside another ship: see below; needs `leader` and `offset`), cruise (a fraction of its thrust, default 0.3) }.
//                 Its seats fire (each gunner is shown the enemy craft still flying and turns its seat and fires through gunSeats.stepSeat), its hit volume is the ship's spheres (a round names the part it reached; a turret or a PD mount shot to nothing
//                 takes its seat out of the fight, an engine pod a third of the thrust), and its wave-motion cannon -- an INVENTED weapon -- charges, and fires one hit-scan beam along the bow when an enemy is in it.
//
//   A HELM PILOT (a capital ship's `helmPilot`, off by default): (rule, ctx) -> { torque, thrust }, called once a tick for a ship with a helm, AFTER the rule has decided: `rule` is { torque (body frame, already limited to the hull's own), thrust (a force along the nose) } -- whatever the behaviour made of them, a station's included -- and `ctx`
//               is { body, ship, foe (the nearest enemy, or null), thrustMax (what the pods left give) }. What it returns REPLACES them, the torque limited to the hull's own again and the thrust clamped to 0..thrustMax. brain/helmPolicy.mjs is the network that fills it. A ship with no helm (the `crew` option) is not asked.
//   A TICK      every live craft decides from the states the tick started with; fighters and seats fire; the wave-motion cannon fires if it is charged and something is in its line; every body moves one tick; fighters that touch each other collide (brain/shipCollision6dof.mjs, as the page);
//               every round moves and is tested against the enemy craft (flightGuns.stepRounds with g = 0 and no ground: space) -- ROUNDS ARE TESTED PER TEAM AGAINST THE OTHER TEAMS' CRAFT ONLY, as the page's weapons are (so BY DEFAULT there is no friendly fire and no hold-fire rule, unlike the flight arena -- `friendlyFire: true` turns both on, below); a fighter that touches a ship's
//               hull is lost and the ship takes 25; hit points gone is destroyed. THE FIGHT IS OVER when fewer than two teams have a craft flying, or at the time limit.
//
//   THE FIGHTERS' DOCTRINE AGAINST A CAPITAL SHIP is a HAND RULE, chosen, not trained, and the reason it exists is measured: the page's pilot has no braking, so a fighter that simply pursues a ship arrives at its hull at speed and rams it. A fighter APPROACHES by steering for a point 60 units to one side of the ship
//               (the side is its id's parity), thrusting; within 220 units and closing it STRAFES -- nose on the ship's lead point, thrust cut, guns firing -- and the lateral velocity it built on the way in carries it past. The learned 6DOF pilots (brain/pilot6dofPolicy.mjs) answer the same call and can fly it; nothing here was trained for it.
//
//   A SHIP THAT KEEPS ITS STATION (behaviour "station", with `leader` -- the id of another capital ship -- and `offset`, [x, y, z] in the WORLD frame from the leader's centre): THE SLOT is the leader's centre plus the offset, so it moves with the leader and does NOT swing round it when the leader turns.
//               The hull has ONE thrust axis (its nose), so the follower holds the slot as a thrust-vectoring craft does: it asks for the leader's own acceleration plus STATION_KP x the position error plus STATION_KD x the velocity error, takes the part of that along the leader's nose as its throttle (never negative: it cannot brake)
//               and tilts its nose toward the rest by as much as the lateral part asks, never more than STATION_MAX_TILT (0.6 rad) -- so the lateral authority is what the throttle is, and a leader at cruise gives the follower about 0.07 of a unit per second squared of it: a slow formation. With the leader gone (destroyed) the ship faces the enemy as "face" does.
//               THE GAINS ARE CHOSEN, not tuned to anything: a natural frequency of 0.1 rad/s and critical damping. A ship with no helm (the `crew` option) holds nothing.
//   SHIPS THAT COLLIDE (the option `shipCollisions`, default off, so that every fight pinned without it is the same fight): the capital ships' HULL BOXES (capitalShip.HALF -- not the turrets and the pods, which stand on the hull) are resolved against each other every tick by brain/shipCollision6dof.mjs, the page's fighters' rule: the contact manifold, the impulse solver
//               (restitution 0.35, friction 0.5) and the ram damage -- the impulse times 0.3, CAPPED AT 25, taken by BOTH ships equally. THE CAP IS THE FIGHTERS' AND IS HERE FOR WANT OF ONE OF ITS OWN: two 1,500-hit-point ships that meet at any speed lose 25 each, and that is the rule, said plainly, not a finding about battleships. Each contact is a `collision` event with `ships: true`.
//   FRIENDLY FIRE (the option `friendlyFire`, default off, so that every fight pinned without it is the same fight): a round then hits any craft but its owner -- a team-mate, another ship of the team, and the OWNER SHIP'S OWN HULL (a round fired across the deck reaches the parts it crosses; the parts whose sphere the muzzle starts
//               inside are skipped, as a fighter is skipped by its own rounds). A hit on a team-mate takes its hit points (and a part's), is NOT credited to the shooter's `hits`, is counted in the shooter's `friendlyHits` and the victim's `friendlyTaken`, and its event says `friendly: true`. A craft's `holdFire` (default true) is
//               the rule that keeps it from doing it: a fighter does not pull its trigger while its round (a straight line in vacuum: the closest approach is closed form) would pass within a team-mate's size plus HOLD_FIRE_MARGIN (2) of it before it reached its target's range; a SEAT'S INTERLOCK is the same test with the ship's own
//               hull added -- the line from the muzzle for OWN_HULL_REACH (50) units against the ship's other parts -- and the seat keeps tracking while its trigger is held (`held` counts the ticks, on the seat and on the craft); the wave-motion cannon holds while a team-mate is in its beam. WITH `holdFire: false` the fighters shoot
//               each other and the ship shoots itself.
//
//   WRECKS, IMPACTS AND CREW (three more options, all off by default): `wrecks` -- a destroyed craft keeps its momentum and its spin, no force and no torque on it, and goes on drifting and tumbling (it is still no target and no shooter); `impact` (a round's mass, ROUND_MASS 0.002 on the page) -- a round that hits gives the victim its
//               momentum relative to it, AT THE HIT POINT, so a hit off a craft's centre spins it (and what spins a wreck is the hits that killed it); `crew` -- the ship's BRIDGE has its crew (BRIDGE_CREW 200, the hits on the bridge sphere) and each seat its GUNNER, who dies at CREW_FRACTION (half) of the hit points of the part the seat sits in, before the part is out: a seat
//               whose gunner is dead does not fire (seatWorks) although its turret stands, a ship whose bridge crew is dead has no helm -- it turns no more, its engines are set to nothing -- and its cannon, fired from the bridge, charges no more; each death is a `crew` event. THE NUMBERS ARE INVENTED, the recoil of the guns is not modelled and neither is the damage a tumbling wreck would do.
//
// WHAT IS NOT HERE, SAID PLAINLY: hit volumes are SPHERES, a fighter's 1.5 units (the page's are oriented boxes: tests of the page's own fighter-against-fighter fight are not this arena's); a fighter that touches a hull is lost without an impulse; ships collide with each other only with `shipCollisions` (hull boxes, the fighters' damage cap); wind and gravity do not exist (vacuum);
// by default a destroyed craft does not tumble (it stops, dark, where it was: `wrecks` lets it drift). stepSpaceArena() MUTATES the arena it is given. Pure otherwise: no DOM, no clock, no random.
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
export const STATION_KP = 0.01, STATION_KD = 0.2, STATION_MAX_TILT = 0.6;   // the slot controller: a natural frequency of 0.1 rad/s (kp = w^2), critical damping (kd = 2 w), and the most the nose is tilted off the leader's
export const STRAFE_RANGE = 220, APPROACH_OFFSET = 60, RAM_DAMAGE = 25, VISION = 1500, HOLD_FIRE_MARGIN = 2, OWN_HULL_REACH = 50;
/** The options below, with the numbers the scenario and the page use (all INVENTED): a round's mass for `impact`, the share of a seat's part's hit points that its gunner's life is worth for `crew`, and the bridge crew's hit points. */
export const ROUND_MASS = 0.002, CREW_FRACTION = 0.5, BRIDGE_CREW = 200;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, fallback = [1, 0, 0]) => { const n = norm(a); return n > 1e-9 ? [a[0] / n, a[1] / n, a[2] / n] : fallback; };

/**
 * A new arena. `crafts` are the definitions above; ids must be distinct positive integers. Returns { dt, seconds, t, i, crafts, rounds, events, done, over, autopilot }. A craft carries { id, team, name, kind, body, hp, hpMax, dead, status ("flying" | "destroyed" | "rammed"),
 * hits (damage it has dealt to the enemy), gun / seats / enginesRunning / partHp (Map part id -> hit points left) / charge / waves, last }.
 */
export function createSpaceArena({ crafts, dt = DT, seconds = 120, autopilot = AUTOPILOT, friendlyFire = false, wrecks = false, impact = 0, crew = false, shipCollisions = false } = {}) {
    if (!Array.isArray(crafts) || crafts.length < 2) throw new Error("spaceArena.createSpaceArena: an arena needs at least two crafts");
    const ids = new Set();
    for (const c of crafts) {
        if (!Number.isInteger(c.id) || c.id < 1 || ids.has(c.id)) throw new Error(`spaceArena.createSpaceArena: craft ids are distinct positive integers (got ${c.id})`);
        ids.add(c.id);
        if (c.kind !== "fighter" && c.kind !== "capital") throw new Error(`spaceArena.createSpaceArena: craft ${c.id} is a "fighter" or a "capital" (got ${c.kind})`);
        if (c.kind === "capital" && !c.ship) throw new Error(`spaceArena.createSpaceArena: craft ${c.id} is a capital ship with no ship`);
        if (c.helmPilot !== undefined && c.helmPilot !== null && (c.kind !== "capital" || typeof c.helmPilot !== "function")) throw new Error(`spaceArena.createSpaceArena: craft ${c.id}'s helmPilot is a function (rule, ctx) -> { torque, thrust } of a CAPITAL ship (got ${c.kind === "capital" ? typeof c.helmPilot : "a " + c.kind})`);
        if (c.behaviour !== undefined && !BEHAVIOURS.includes(c.behaviour)) throw new Error(`spaceArena.createSpaceArena: craft ${c.id}'s behaviour must be one of ${BEHAVIOURS.join(", ")} (got ${c.behaviour})`);
    }
    for (const c of crafts) if (c.behaviour === "station") {
        const lead = crafts.find((o) => o.id === c.leader);
        if (c.kind !== "capital" || !lead || lead.kind !== "capital" || lead === c) throw new Error(`spaceArena.createSpaceArena: craft ${c.id} keeps a station: that is a capital ship with a \`leader\` that is the id of ANOTHER capital ship (got ${c.leader})`);
        if (!Array.isArray(c.offset) || c.offset.length !== 3 || !c.offset.every(Number.isFinite)) throw new Error(`spaceArena.createSpaceArena: craft ${c.id} keeps a station: its \`offset\` is [x, y, z] from the leader's centre (got ${JSON.stringify(c.offset)})`);
    }
    const made = crafts.map((c) => {
        const st = c.state || {}, cap = c.kind === "capital", ship = c.ship || null;
        const body = RB.createBody({ mass: cap ? ship.mass : FIGHTER.mass, I: cap ? [...ship.I] : RB.boxInertia({ m: FIGHTER.mass, hx: FIGHTER.half[0], hy: FIGHTER.half[1], hz: FIGHTER.half[2] }), pos: st.pos, vel: st.vel, q: st.q, w: st.w });
        const out = { id: c.id, team: c.team ?? c.id, name: c.name || `craft ${c.id}`, kind: c.kind, body, hp: c.hp ?? (cap ? ship.hp : FIGHTER.hp), hpMax: c.hp ?? (cap ? ship.hp : FIGHTER.hp), dead: false, status: "flying", hits: 0, friendlyHits: 0, friendlyTaken: 0, held: 0, holdFire: c.holdFire !== false, last: null,
            ship, pilot: c.pilot || null, helmPilot: c.helmPilot || null, behaviour: c.behaviour || "face", leader: c.leader ?? null, offset: c.offset ? c.offset.slice() : null, cruise: c.cruise ?? 0.3, aimRadius: cap ? ship.aimRadius : FIGHTER.radius, mode: "approach", gun: cap ? null : G.createGun(FIGHTER_GUN), seats: [], enginesRunning: cap ? ship.engines.length : 0, partHp: new Map(), partHits: new Map(), charge: 0, waves: 0 };
        out.helm = true; out.crew = null;
        if (cap) {
            if (crew) out.crew = { bridge: BRIDGE_CREW, bridgeOut: false, seats: new Map(ship.seats.map((seat, k) => [seat.id, CREW_FRACTION * (ship.parts[ship.seatPart[k]].hp ?? 0)])), dead: new Set() };
            out.seats = ship.seats.map((seat, k) => ({ seat, state: GS.createSeatState(seat), decide: c.gunner ? c.gunner(seat, k) : GS.handGunner({ seed: c.id * 100 + k, gravity: 0, maxRange: 600, burst: 1 }), last: null, part: ship.seatPart[k], held: 0, blocked: null }));
            for (const p of ship.parts) if (p.hp !== null) out.partHp.set(p.id, p.hp);
        }
        return out;
    });
    return { dt, seconds, t: 0, i: 0, crafts: made, rounds: [], events: [], done: false, over: null, autopilot: { ...autopilot }, friendlyFire: !!friendlyFire, wrecks: !!wrecks, impact, crew: !!crew, shipCollisions: !!shipCollisions };
}

export const BEHAVIOURS = Object.freeze(["face", "hold", "station"]);
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

/** Is a seat able to fire: the part it sits in has hit points left (a seat in a part that has none to lose always is) and, with the `crew` option, its gunner is alive? */
export const seatWorks = (c, st) => (!c.partHp.has(st.part) || c.partHp.get(st.part) > 0) && !(c.crew && c.crew.dead.has(st.seat.id));

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

/** The craft of other teams still flying that the wave-motion cannon's beam reaches, from the ship's bow along its axis: those whose centre is within the beam's width (plus their own radius) of the line, out to the range. */
export function waveTargets(arena, c) { return inBeam(arena, c, (o) => o.team !== c.team); }
/** ...and the team-mates of the ship (other craft of its team, still flying) in the same beam: what the cannon holds its fire for, and with `friendlyFire` and no `holdFire` what it hits. */
export function waveMates(arena, c) { return inBeam(arena, c, (o) => o.team === c.team); }
function inBeam(arena, c, pred) {
    const w = c.ship.waveGun, fwd = RB.rotateByQuat(c.body.q, [1, 0, 0]), from = add(c.body.pos, RB.rotateByQuat(c.body.q, w.muzzle)), out = [];
    for (const o of arena.crafts) {
        if (o === c || !pred(o) || !flying(o)) continue;
        const rel = sub(o.body.pos, from), along = dot(rel, fwd);
        if (along < 0 || along > w.range) continue;
        const perp = norm(sub(rel, [fwd[0] * along, fwd[1] * along, fwd[2] * along]));
        if (perp <= w.beamRadius + o.aimRadius) out.push(o);
    }
    return out;
}

/** The closest a round (from `pos`, velocity `vel`) comes to a point moving in a straight line (from `p`, velocity `v`) inside `horizon` seconds, as { t, d }: both paths are straight in vacuum, so the minimum of |p - pos + (v - vel) t| over [0, horizon] is closed form. */
export function approach(pos, vel, p, v, horizon) {
    const r = sub(p, pos), w = sub(v, vel), ww = dot(w, w), t = ww < 1e-12 ? 0 : Math.max(0, Math.min(horizon, -dot(r, w) / ww));
    return { t, d: norm(add(r, w, t)) };
}

/**
 * The team-mate of `c` (another craft of its team, still flying) that a round fired from `muzzle` ({ pos, vel, dir }) at `speed` would come within its size plus HOLD_FIRE_MARGIN of inside `horizon` seconds, as { craft, miss, part } (the nearest such), or null. A fighter is one sphere of its hit radius; a ship is
 * each of its parts' spheres, carried at the ship's velocity for the horizon (its turning over a second or two is ignored).
 */
export function friendInLine(arena, c, muzzle, speed, horizon) {
    const vel = add(muzzle.vel, muzzle.dir, speed);
    let best = null;
    for (const f of arena.crafts) {
        if (f === c || f.team !== c.team || !flying(f)) continue;
        const spheres = f.kind === "capital" ? CS.partCentres(f.ship, f.body).map((q) => ({ center: q.center, radius: q.radius, part: q.name })) : [{ center: f.body.pos, radius: FIGHTER.radius, part: null }];
        for (const q of spheres) {
            const a = approach(muzzle.pos, vel, q.center, f.body.vel, horizon);
            if (a.d < q.radius + HOLD_FIRE_MARGIN && (best === null || a.d < best.miss)) best = { craft: f, miss: a.d, part: q.part };
        }
    }
    return best;
}

/** The name of the first part of the ship `c` carries that the line from `muzzle` along its direction crosses within OWN_HULL_REACH units, not counting a part whose sphere the muzzle is inside (the mount's own), or null. */
export function ownHullInLine(c, muzzle) {
    let best = null;
    for (const q of CS.partCentres(c.ship, c.body)) {
        const rel = sub(q.center, muzzle.pos), along = dot(rel, muzzle.dir);
        if (norm(rel) <= q.radius) continue;
        const t = Math.max(0, Math.min(OWN_HULL_REACH, along)), miss = norm(sub(rel, [muzzle.dir[0] * t, muzzle.dir[1] * t, muzzle.dir[2] * t]));
        if (miss < q.radius && (best === null || t < best.t)) best = { t, name: q.name };
    }
    return best && best.name;
}

const fighterMuzzle = (c) => ({ pos: add(c.body.pos, RB.rotateByQuat(c.body.q, FIGHTER.muzzle)), vel: c.body.vel.slice(), dir: RB.rotateByQuat(c.body.q, [1, 0, 0]) });
/** Why a seat that wants to fire may not: "hull: <part>" (its line crosses the ship's own), "friend: <craft>" (a team-mate in its line before its target) or null. */
function seatBlocked(arena, c, st, cmd) {
    const mz = GS.muzzleOfSeat(st.seat, st.state, c.body), gun = st.seat.gun, own = ownHullInLine(c, mz);
    if (own) return `hull: ${own}`;
    const target = cmd.target != null ? arena.crafts.find((o) => o.id === cmd.target) : null, range = target ? norm(sub(target.body.pos, mz.pos)) : gun.muzzleSpeed * gun.life;
    const m = friendInLine(arena, c, mz, gun.muzzleSpeed, Math.min(gun.life, range / gun.muzzleSpeed + 0.15));
    return m ? `friend: ${m.craft.name}` : null;
}

/**
 * What a ship keeping its station asks of the hull this tick, from the states the tick started with: { aim (a unit vector: where the nose should point), thrust (force along the nose), slot, error } -- or null when its leader is gone (destroyed), when the ship faces the enemy instead.
 * See the header: the leader's own acceleration, plus kp x the error and kd x the velocity error, its part along the leader's nose as the throttle and the rest as the tilt of the nose.
 */
export function stationPlan(arena, c) {
    const L = arena.crafts.find((o) => o.id === c.leader && !o.dead && o.kind === "capital"); if (!L) return null;
    const slot = add(L.body.pos, c.offset), e = sub(slot, c.body.pos), de = sub(L.body.vel, c.body.vel);
    const nL = RB.rotateByQuat(L.body.q, [1, 0, 0]), aL = L.helm ? CS.thrustWith(L.ship, L.enginesRunning) * L.cruise / L.body.mass : 0;
    const aDes = add(add(mul(nL, aL), e, STATION_KP), de, STATION_KD), aPar = dot(aDes, nL), perp = sub(aDes, mul(nL, aPar)), perpN = norm(perp);
    const tilt = Math.min(STATION_MAX_TILT, Math.atan2(perpN, Math.max(aPar, aL, 1e-9)));   // the lateral authority is what the throttle is: a floor of the leader's cruise acceleration when the part along the nose is less
    const aim = perpN > 1e-12 ? unit(add(mul(nL, Math.cos(tilt)), perp, Math.sin(tilt) / perpN)) : nL, aMax = CS.thrustWith(c.ship, c.enginesRunning) / c.body.mass;
    return { aim, thrust: Math.max(0, Math.min(aMax, aPar / Math.cos(tilt))) * c.body.mass, slot, error: norm(e) };
}

/** One tick of every craft and every round. Mutates and returns the arena; a finished arena is returned untouched. `arena.events` is this tick's: [{ type: "hit" | "part" | "kill" | "wave" | "ram" | "collision", ... }]. */
export function stepSpaceArena(arena) {
    if (arena.done) return arena;
    const { dt } = arena, t = arena.i * dt, tEnd = (arena.i + 1) * dt, events = [], alive = arena.crafts.filter(flying), plan = new Map(), fresh = [];
    const tag = (rounds, c, gun) => {
        const inside = arena.friendlyFire && c.kind === "capital" ? CS.partCentres(c.ship, c.body) : null;   // a ship's round skips the parts it is fired from inside
        return rounds.map((r) => ({ ...r, team: c.team, dmg: gun.damage, life: gun.life, ...(inside ? { skip: inside.filter((q) => norm(sub(r.pos, q.center)) <= q.radius).map((q) => q.part) } : {}) }));
    };
    // decisions, all from the states the tick started with
    for (const c of alive) {
        const foe = nearestFoe(arena, c);
        if (c.kind === "fighter") {
            let torque = [0, 0, 0], thrust = 0, fire = false, aim = null, held = false;
            if (foe) {
                aim = fighterAim(arena, c, foe); c.mode = aim.mode;
                const d = (c.pilot || AP.decide)(c.body, aim.target, aim.opts);
                torque = d.torqueBody; thrust = d.thrust; fire = !!d.firing && aim.strafe;
                if (fire && arena.friendlyFire && c.holdFire) {
                    const mz = fighterMuzzle(c), range = norm(sub(foe.body.pos, mz.pos));
                    if (friendInLine(arena, c, mz, FIGHTER_GUN.muzzleSpeed, Math.min(FIGHTER_GUN.life, range / FIGHTER_GUN.muzzleSpeed + 0.15))) { fire = false; held = true; c.held += 1; }
                }
            }
            plan.set(c, { torque, thrust, fire, foe });
            c.last = { foe: foe ? foe.id : null, fire, thrust, mode: aim ? aim.mode : "idle", target: aim ? aim.target.pos : null, held };
        } else {
            let torque = [0, 0, 0];
            const station = c.behaviour === "station" ? stationPlan(arena, c) : null;
            if (station) torque = CS.limitTorque(c.ship, AP.decide(c.body, { pos: add(c.body.pos, station.aim, 1000) }, { kp: c.ship.kp, kd: c.ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody);
            else if ((c.behaviour === "face" || c.behaviour === "station") && foe) torque = CS.limitTorque(c.ship, AP.decide(c.body, { pos: foe.body.pos, vel: foe.body.vel }, { kp: c.ship.kp, kd: c.ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody);
            else torque = CS.limitTorque(c.ship, AP.decide(c.body, { pos: add(c.body.pos, RB.rotateByQuat(c.body.q, [1, 0, 0]), 1000) }, { kp: c.ship.kp, kd: c.ship.kd, thrustForce: 0, standoff: 1e9 }).torqueBody);
            if (!c.helm) torque = [0, 0, 0];   // the bridge crew is gone: nobody turns the hull or sets the engines (`crew` option)
            let thrust = c.helm ? (station ? station.thrust : CS.thrustWith(c.ship, c.enginesRunning) * c.cruise) : 0;
            if (c.helmPilot && c.helm) {   // a helm pilot answers the rule's answer
                const pods = CS.thrustWith(c.ship, c.enginesRunning), out = c.helmPilot({ torque, thrust }, { body: c.body, ship: c.ship, foe, thrustMax: pods });
                torque = CS.limitTorque(c.ship, out.torque); thrust = Math.max(0, Math.min(pods, out.thrust));
            }
            plan.set(c, { torque, thrust, fire: false, foe });
            c.last = { foe: foe ? foe.id : null, fire: false, thrust: plan.get(c).thrust, mode: c.helm ? (c.behaviour === "station" && !station ? "face" : c.behaviour) : "no helm" };
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
                const cmd = seatWorks(c, st) ? st.decide(st.seat, st.state, c.body, shown, t) : { yaw: st.state.yaw, pitch: st.state.pitch, fire: false, target: null };
                let go = cmd; st.blocked = null;
                if (cmd.fire && arena.friendlyFire && c.holdFire) {   // the line that matters is the one the seat points along AFTER this tick's slew, so the slew is done first without the trigger
                    const aimed = GS.stepSeat(st.seat, st.state, c.body, { ...cmd, fire: false }, dt, c.id).state, why = seatBlocked(arena, c, { seat: st.seat, state: aimed }, cmd);
                    if (why) { st.blocked = why; go = { ...cmd, fire: false }; st.held += 1; c.held += 1; }
                }
                const out = GS.stepSeat(st.seat, st.state, c.body, go, dt, c.id);
                st.state = out.state; st.last = cmd; fresh.push(...tag(out.rounds, c, st.seat.gun));
            }
        }
    }
    // the wave-motion cannon: it charges, and fires when something of the other teams is in its line
    const waved = new Set();
    for (const c of alive) {
        if (c.kind !== "capital" || !c.helm) continue;   // the cannon is fired from the bridge
        const w = c.ship.waveGun; c.charge = Math.min(w.charge, c.charge + dt);
        if (c.charge >= w.charge) {
            const hit = waveTargets(arena, c), mates = arena.friendlyFire ? waveMates(arena, c) : [];
            if (hit.length && mates.length && c.holdFire) c.held += 1;   // held: a team-mate is in the beam
            else if (hit.length) {
                c.charge = 0; c.waves += 1;
                for (const o of hit) { o.hp -= w.damage; c.hits += w.damage; waved.add(o); }
                for (const o of mates) { o.hp -= w.damage; c.friendlyHits += w.damage; o.friendlyTaken += w.damage; waved.add(o); }
                events.push({ type: "wave", t: tEnd, craft: c.id, victims: hit.map((o) => o.id), ...(mates.length ? { friendly: mates.map((o) => o.id) } : {}), damage: w.damage });
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
    if (arena.wrecks) for (const c of arena.crafts) if (c.dead && !alive.includes(c)) c.body = RB.step(c.body, RB.createAccumulator(), dt);   // a wreck keeps its momentum and its spin: no force on it, no torque
    // fighters that touch each other collide, as the page's do (the pairs of live fighters, in craft order)
    for (const e of SC.resolveShipCollisions(alive.filter((c) => c.kind === "fighter"), FIGHTER.half)) events.push({ type: "collision", t: tEnd, craft: e.a.id, with: e.b.id, damage: e.dmg });
    // with `shipCollisions`, the capital ships' hull boxes collide too, by the same rule
    if (arena.shipCollisions) for (const e of SC.resolveShipCollisions(alive.filter((c) => c.kind === "capital"), CS.HALF)) events.push({ type: "collision", t: tEnd, craft: e.a.id, with: e.b.id, damage: e.dmg, ships: true });
    // every round moves and is tested against the other teams' craft
    const targetsOf = (cs) => cs.flatMap((c) => {
        const b0 = before.get(c);
        if (c.kind === "fighter") return [{ id: c.id, from: b0.pos, to: c.body.pos, radius: FIGHTER.radius }];
        const from = CS.partCentres(c.ship, { pos: b0.pos, q: b0.q }), to = CS.partCentres(c.ship, c.body);
        return from.map((p, k) => ({ id: c.id, part: p.part, from: p.center, to: to[k].center, radius: p.radius }));
    });
    const all = [...arena.rounds, ...fresh], teams = [...new Set(all.map((r) => r.team))], survivors = [], hits = [];
    if (!arena.friendlyFire) {
        for (const tm of teams) {
            const mine = all.filter((r) => r.team === tm), res = G.stepRounds(mine, dt, targetsOf(alive.filter((c) => c.team !== tm)), { g: 0, ground: null, life: 5 });
            survivors.push(...res.rounds); hits.push(...res.hits);
        }
    } else {   // FRIENDLY FIRE: every craft is a target but the round's owner (a ship's own parts, but the ones it was fired from inside)
        const everyone = targetsOf(alive), groups = new Map();
        for (const r of all) { const key = r.owner + ":" + (r.skip ? r.skip.join(",") : "-"); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
        for (const [, rs] of groups) {
            // flightGuns.stepRounds never lets a round hit a target with its owner's id, so the parts of the ship's own hull it may hit are handed to it under the id's negative and given back
            const owner = rs[0].owner, skip = rs[0].skip || null, targets = everyone.filter((q) => q.id !== owner || (skip !== null && !skip.includes(q.part))).map((q) => (q.id === owner ? { ...q, id: -q.id } : q)), res = G.stepRounds(rs, dt, targets, { g: 0, ground: null, life: 5 });
            survivors.push(...res.rounds); hits.push(...res.hits.map((h) => (h.target < 0 ? { ...h, target: -h.target } : h)));
        }
    }
    arena.rounds = survivors;
    const byId = new Map(arena.crafts.map((c) => [c.id, c]));
    for (const h of hits) {
        const victim = byId.get(h.target), shooter = byId.get(h.owner), dmg = h.round.dmg;
        const friendly = victim.team === shooter.team;   // only with friendlyFire: not the enemy's, so not the shooter's credit
        victim.hp -= dmg; if (friendly) { shooter.friendlyHits += dmg; victim.friendlyTaken += dmg; } else shooter.hits += dmg;
        events.push({ type: "hit", t: tEnd, shooter: shooter.id, victim: victim.id, point: h.point, damage: dmg, ...(friendly ? { friendly: true } : {}), ...(h.part !== undefined ? { part: h.part } : {}) });
        if (arena.impact > 0) {   // the round's momentum, relative to the victim's, goes into it: at the hit point, so a hit off its centre spins it
            const vb = victim.body, J = mul(sub(h.round.vel, vb.vel), arena.impact), tq = RB.worldToBody(vb.q, cross(sub(h.point, vb.pos), J));
            vb.vel = add(vb.vel, J, 1 / vb.mass); vb.w = [0, 1, 2].map((i) => vb.w[i] + tq[i] / vb.I[i]);
        }
        if (h.part !== undefined) {
            if (victim.crew) {   // `crew`: the bridge has its crew, and each seat its gunner, who dies at a share of the part's hit points
                const cr = victim.crew, kind = victim.ship.parts[h.part].kind;
                if (kind === "bridge" && !cr.bridgeOut) { cr.bridge -= dmg; if (cr.bridge <= 0) { cr.bridgeOut = true; victim.helm = false; events.push({ type: "crew", t: tEnd, craft: victim.id, what: "bridge" }); } }
                victim.ship.seats.forEach((seat, k) => { if (victim.ship.seatPart[k] === h.part && !cr.dead.has(seat.id)) { const left = cr.seats.get(seat.id) - dmg; cr.seats.set(seat.id, left); if (left <= 0) { cr.dead.add(seat.id); events.push({ type: "crew", t: tEnd, craft: victim.id, what: "seat", seat: seat.id, name: seat.name }); } } });
            }
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
