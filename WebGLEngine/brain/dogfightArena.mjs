// WebGLEngine/brain/dogfightArena.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE DOGFIGHT, STEPPABLE AND FOR ANY NUMBER OF AIRCRAFT. brain/dogfightTask.mjs flies one fight between two aircraft to its end and hands back a score; a page that WATCHES a fight needs to advance it a tick at a time and read
// every aircraft's state between ticks, and the fights after the first (a bomber and the fighters that attack it, a flight of three against three) have more than two aircraft. This is the same fight with the loop turned inside out: the
// ARENA is a list of crafts, each with a team, a pilot, a gun and hit points, and stepArena() advances all of them one tick -- guidance, controls, trigger, flight, rounds, hits, collisions, destruction -- in the order dogfightTask.duel()
// does, so that a fight of two is the same fight (the gate flies the four kinds of scenario through both and compares everything duel() reports, to the bit).
//
//   A CRAFT   { id, team, name, pilot (state, target, wind) -> controls, behaviour: "hunt" (the guidance of dogfightTask.pursuit(), against the NEAREST enemy still flying) | "script" (a heading/altitude/airspeed that is a function of the time),
//               fires (does its trigger work?), spec (a flightGuns gun spec; default flightGuns.GUN), hp (default spec.hp), model (a flightModel6dof model; default the trainer), state (flightModel6dof.createState options) }
//   A TICK    each flying craft is told where to go (hunt: pursuit() of its nearest enemy from the START of the tick; script: its function), the pilot answers with controls, the trigger is read from the same pre-tick states, the guns
//             fire, every flying craft flies one tick, every round moves and is tested against every flying craft but its owner, and then the aftermath: a hit takes `spec.damage` from the victim and credits the shooter, a flight that ends
//             (the ground) marks the craft, two craft closer than COLLISION_RANGE have hit each other and BOTH are lost, and a craft whose hit points are gone is destroyed. A craft that is not flying takes no further part (it is not a target,
//             it does not fire) and keeps its last state. THE FIGHT IS OVER when fewer than two teams have a craft flying, or at the time limit.
//
//   A BOMBER  a craft may carry `bomber` (physics/mechanics/bomber.mjs): then its FLIGHT is the bomber's scaled model with the engines still running (modelFor), its pilot is wrapped to be shown the trainer's world (froudeScale.scalePilot) so the pilots
//             we have fly it, its HIT VOLUME is the bomber's spheres (a round names the part it reached; an engine shot to nothing -- 8 hits -- goes out and the thrust falls by a quarter), its hit points are the bomber's (60), and each of its
//             GUN SEATS has a gunner (gunSeats.handGunner by default, one per seat; `gunner(seat, index)` gives another) that is shown the enemy craft still flying and turns its seat and fires its twin gun through gunSeats.stepSeat, the rounds
//             owned by the bomber. A craft with no bomber is exactly what it was.
// WHAT IS NOT HERE, SAID PLAINLY: a destroyed craft does not fall (the fight of two ends the tick one is destroyed, as dogfightTask's does; a falling wreck is the page's to draw), no wind (still air, as the task's), one fixed forward gun per
// craft (gun SEATS are physics/mechanics/gunSeats.mjs and join this in the bomber's slice), and no friendly-fire rule beyond "a round does not hit its owner" (flightGuns.stepRounds'). stepArena() MUTATES the arena it is given: the page's
// loop is one object stepped 30 times a second. Pure otherwise: no DOM, no clock, no random.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as D from "./dogfightTask.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";
import * as BM from "../physics/mechanics/bomber.mjs";
import * as SC from "../physics/mechanics/froudeScale.mjs";

export const DT = D.DT, COLLISION_RANGE = D.COLLISION_RANGE;
const still = Object.freeze([0, 0, 0]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * A new arena. `crafts` are the definitions described above; ids must be distinct positive integers (a round's owner is an id). Returns { dt, t, i, crafts, rounds, events, closest, done, seconds } -- crafts in the order given.
 */
export function createArena({ crafts, dt = DT, seconds = D.SECONDS, model = AF.defaultModel(), spec = G.GUN } = {}) {
    if (!Array.isArray(crafts) || crafts.length < 2) throw new Error("dogfightArena.createArena: an arena needs at least two crafts");
    const ids = new Set();
    for (const c of crafts) {
        if (!Number.isInteger(c.id) || c.id < 1 || ids.has(c.id)) throw new Error(`dogfightArena.createArena: craft ids are distinct positive integers (got ${c.id})`);
        ids.add(c.id);
        if (typeof c.pilot !== "function") throw new Error(`dogfightArena.createArena: craft ${c.id} has no pilot function`);
        if (c.behaviour === "script" && typeof c.script !== "function") throw new Error(`dogfightArena.createArena: craft ${c.id} scripts its target but has no script function`);
    }
    const made = crafts.map((c) => {
        const bomber = c.bomber || null, m = c.model || (bomber ? bomber.model : model), sp = c.spec || spec, state = F.createState({ ...c.state, mass: m.mass, inertia: m.inertia });
        const seats = bomber ? bomber.seats.map((seat, k) => ({ seat, state: GS.createSeatState(seat), decide: c.gunner ? c.gunner(seat, k) : GS.handGunner({ seed: c.id * 100 + k }), last: null })) : [];
        return { id: c.id, team: c.team ?? c.id, name: c.name || `craft ${c.id}`, pilot: bomber ? SC.scalePilot(c.pilot, bomber.scale) : c.pilot, behaviour: c.behaviour || "hunt", script: c.script || null, fires: c.fires !== false, model: m, spec: sp, hp: c.hp ?? (bomber ? bomber.hp : sp.hp),
            state, gun: G.createGun(sp), hits: 0, taken: 0, status: "airborne", firstHitAt: null, killedAt: null, minAltitude: Infinity, maxAlpha: 0, minV: Infinity, last: null,
            bomber, seats, enginesRunning: bomber ? bomber.engines.length : 0, engineHp: new Map(bomber ? bomber.engines.map((id) => [id, bomber.parts[id].hp]) : []), aimRadius: c.aimRadius ?? (bomber ? 0.35 * bomber.span : sp.hitRadius), partHits: new Map() };
    });
    return { dt, seconds, t: 0, i: 0, crafts: made, rounds: [], events: [], closest: Infinity, done: false, over: null };
}

const flying = (c) => c.status === "airborne";
/** Have two craft hit each other? Two plain craft: closer than COLLISION_RANGE. A bomber is its spheres: the other craft is inside one of them (grown by 2 m for the other's own size) -- a fighter in the bomber's wing, not 6 m from its centre. */
function collides(A, B, range) {
    if (!A.bomber && !B.bomber) return range < COLLISION_RANGE;
    const big = A.bomber ? A : B, other = big === A ? B : A, mine = BM.partCentres(big.bomber, big.state);
    if (other.bomber) return range < COLLISION_RANGE;
    return mine.some((p) => norm(sub(other.state.pos, p.center)) < p.radius + 2);
}
/** The nearest enemy craft still flying, from c, or null. Ties go to the lower id. */
export function nearestFoe(arena, c) {
    let best = null, bd = Infinity;
    for (const o of arena.crafts) {
        if (o === c || o.team === c.team || !flying(o)) continue;
        const d = norm(sub(o.state.pos, c.state.pos));
        if (d < bd || (d === bd && best && o.id < best.id)) { best = o; bd = d; }
    }
    return best;
}

/** One tick of every craft and every round. Mutates and returns the arena; a finished arena is returned untouched. `arena.events` is this tick's: [{ type: "hit" | "kill" | "ended" | "collision", ... }]. */
export function stepArena(arena) {
    if (arena.done) return arena;
    const { dt } = arena, t = arena.i * dt, events = [];
    const alive = arena.crafts.filter(flying), plan = new Map(), fresh = [], flightModel = (c) => (c.bomber ? c.bomber.modelFor(c.enginesRunning) : c.model);
    // decisions, all from the states the tick started with
    for (const c of alive) {
        const foe = nearestFoe(arena, c);
        let target, fire = false;
        if (c.behaviour === "script") target = c.script(t);
        else if (foe) target = D.pursuit(c.state, foe.state, c.spec).target;
        else target = { heading: F.attitude(c.state).heading, altitude: c.state.pos[2], airspeed: F.attitude(c.state).airspeed };
        if (foe && c.fires) fire = D.fireControl(c.state, foe.state, c.gun, c.spec, foe.aimRadius).fire;
        const controls = c.pilot(c.state, target, still);
        plan.set(c, { target, controls, fire, foe });
        c.last = { target, controls, fire, foe: foe ? foe.id : null };
    }
    for (const c of alive) {
        const p = plan.get(c), shot = G.fire(c.gun, c.state, !!p.fire, dt, c.id);
        c.gun = shot.gun; fresh.push(...shot.rounds);
    }
    // the gun seats: each gunner is shown the enemy craft still flying (position, velocity, size) and answers with where to turn its seat and whether to fire, from the states the tick started with
    for (const c of alive) {
        if (!c.seats.length) continue;
        const shown = alive.filter((o) => o.team !== c.team).map((o) => ({ id: o.id, pos: o.state.pos, vel: o.state.vel, radius: o.bomber ? o.aimRadius : o.spec.hitRadius }));
        for (const st of c.seats) { const cmd = st.decide(st.seat, st.state, c.state, shown, t), out = GS.stepSeat(st.seat, st.state, c.state, cmd, dt, c.id); st.state = out.state; st.last = cmd; fresh.push(...out.rounds); }
    }
    const stepped = new Map();
    for (const c of alive) stepped.set(c, F.stepFlight(flightModel(c), c.state, plan.get(c).controls, dt, still));
    const targets = alive.flatMap((c) => {
        if (!c.bomber) return [{ id: c.id, from: c.state.pos, to: stepped.get(c).state.pos, radius: c.spec.hitRadius }];
        const from = BM.partCentres(c.bomber, c.state), to = BM.partCentres(c.bomber, stepped.get(c).state);
        return from.map((p, k) => ({ id: c.id, part: p.part, from: p.center, to: to[k].center, radius: p.radius }));
    });
    const res = G.stepRounds([...arena.rounds, ...fresh], dt, targets, { life: arena.crafts[0].spec.life });
    arena.rounds = res.rounds;
    const byId = new Map(arena.crafts.map((c) => [c.id, c]));
    for (const h of res.hits) {
        const victim = byId.get(h.target), shooter = byId.get(h.owner);
        victim.taken += shooter.spec.damage; shooter.hits += shooter.spec.damage;
        if (shooter.firstHitAt === null) shooter.firstHitAt = (arena.i + 1) * dt;
        events.push({ type: "hit", t: (arena.i + 1) * dt, shooter: shooter.id, victim: victim.id, point: h.point, ...(h.part !== undefined ? { part: h.part } : {}) });
        if (h.part !== undefined) {
            victim.partHits.set(h.part, (victim.partHits.get(h.part) || 0) + shooter.spec.damage);
            if (victim.engineHp.has(h.part)) {
                const left = victim.engineHp.get(h.part) - shooter.spec.damage; victim.engineHp.set(h.part, left);
                if (left <= 0 && left + shooter.spec.damage > 0) { victim.enginesRunning -= 1; events.push({ type: "engine", t: (arena.i + 1) * dt, craft: victim.id, part: h.part, name: victim.bomber.parts[h.part].name, running: victim.enginesRunning }); }
            }
        }
    }
    for (const c of alive) c.state = stepped.get(c).state;
    arena.i += 1; arena.t = arena.i * dt;
    for (const c of alive) {
        if (c.state.pos[2] < c.minAltitude) c.minAltitude = c.state.pos[2];
        const att = F.attitude(c.state); if (att.alpha > c.maxAlpha) c.maxAlpha = att.alpha; if (att.airspeed < c.minV) c.minV = att.airspeed;
        const st = stepped.get(c).status;
        if (st !== "airborne") { c.status = st; events.push({ type: "ended", t: arena.t, craft: c.id, status: st }); }
    }
    for (let a = 0; a < arena.crafts.length; a++) for (let b = a + 1; b < arena.crafts.length; b++) {
        const A = arena.crafts[a], B = arena.crafts[b];
        if (!alive.includes(A) || !alive.includes(B)) continue;
        const range = norm(sub(A.state.pos, B.state.pos));
        if (range < arena.closest) arena.closest = range;
        if (collides(A, B, range)) {
            for (const X of [A, B]) if (X.status !== "collided") { X.status = "collided"; events.push({ type: "collision", t: arena.t, craft: X.id, with: (X === A ? B : A).id }); }
        }
    }
    for (const c of alive) if (c.taken >= c.hp) { c.status = "destroyed"; c.killedAt = arena.t; events.push({ type: "kill", t: arena.t, craft: c.id }); }   // as duel(): hit points gone is "destroyed" even on the tick the ground or a collision took the craft too
    const teams = new Set(arena.crafts.filter(flying).map((c) => c.team));
    if (teams.size < 2) { arena.done = true; arena.over = teams.size === 1 ? "one team left flying" : "no team left flying"; }
    else if (arena.i >= Math.round(arena.seconds / dt)) { arena.done = true; arena.over = "time"; }
    arena.events = events;
    return arena;
}

/** Step until the arena is done. Returns it. */
export function runArena(arena) { while (!arena.done) stepArena(arena); return arena; }

/** The teams with a craft still flying. */
export const teamsFlying = (arena) => [...new Set(arena.crafts.filter(flying).map((c) => c.team))];

/**
 * A craft's fight in dogfightTask.duel()'s terms, for a fight of two: { score, dealt, taken, fired, firedB, hitRate, firstHit, killedB, statusA, statusB, ticks, closest, minAltitude, maxAlpha, minV }. `me` is the craft whose fight
 * it is, the other craft is B. The score is the task's: (damage dealt - damage taken) / hit points, each capped, plus the kill bonus for a kill while still flying; a craft that is not flying has taken its full hit points.
 */
export function resultOf(arena, meId) {
    const me = arena.crafts.find((c) => c.id === meId), foe = arena.crafts.find((c) => c.id !== meId);
    if (!me || arena.crafts.length !== 2) throw new Error("dogfightArena.resultOf: a duel-shaped result needs an arena of exactly two crafts and one of them named");
    const spec = me.spec, lost = me.status !== "airborne" ? Math.max(me.taken, spec.hp) : me.taken, dealt = Math.min(me.hits, spec.hp), taken = Math.min(lost, spec.hp);
    const killedB = foe.killedAt, seconds = arena.seconds;
    const score = (dealt - taken) / spec.hp * spec.damage + (killedB !== null && me.status === "airborne" ? D.KILL_BONUS * Math.max(0, seconds - killedB) / seconds : 0);
    return { score, dealt: me.hits, taken: me.taken, fired: me.gun.fired, firedB: foe.gun.fired, hitRate: me.gun.fired ? me.hits / me.gun.fired : 0, firstHit: me.firstHitAt, killedB, statusA: me.status, statusB: foe.status,
        ticks: arena.i, closest: arena.closest, minAltitude: me.minAltitude, maxAlpha: me.maxAlpha, minV: Number.isFinite(me.minV) ? me.minV : 0 };
}

/**
 * dogfightTask's scenario as an arena: craft 1 is A (team 1, flying `pilotA`), craft 2 is B (team 2, flying `pilotB`, hunting if the scenario says so, scripted straight or turning otherwise), the trainer, the standard gun.
 */
export function arenaFromScenario(sc, pilotA, { pilotB = AF.pilot, names = ["A", "B"], seconds = D.SECONDS, dt = DT, model = AF.defaultModel(), spec = G.GUN, specB = spec } = {}) {
    const hunt = sc.opponent.kind === "hunt";
    const script = (t) => ({ heading: sc.opponent.kind === "turn" ? sc.b.heading + sc.opponent.rate * t : sc.b.heading, altitude: sc.b.pos[2], airspeed: sc.b.speed });
    return createArena({ dt, seconds, model, spec, crafts: [
        { id: D.A_ID, team: 1, name: names[0], pilot: pilotA, behaviour: "hunt", fires: true, state: sc.a, spec },
        { id: D.B_ID, team: 2, name: names[1], pilot: pilotB, behaviour: hunt ? "hunt" : "script", script: hunt ? null : script, fires: sc.opponent.fires, state: sc.b, spec: specB },
    ] });
}

export function reportLines() {
    const sc = D.scenario(3, "duel"), arena = runArena(arenaFromScenario(sc, AF.pilot)), r = resultOf(arena, D.A_ID);
    return ["[dogfightArena] the dogfight, steppable and for any number of aircraft: a list of crafts with a team, a pilot, a gun and hit points",
        `  the PD autopilot in duel seed 3: ${arena.i} ticks (${arena.over}), A ${r.dealt} hits dealt / ${r.taken} taken, ${r.statusA} against ${r.statusB}, score ${r.score.toFixed(3)} -- the same as dogfightTask.duel() (the gate holds that to the bit)`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
