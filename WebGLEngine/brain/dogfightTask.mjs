// WebGLEngine/brain/dogfightTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE DOGFIGHT, AS A JOB A REAL-FLIGHT PILOT CAN BE GRADED ON: two aircraft, each with the fixed forward gun of physics/mechanics/flightGuns.mjs, in the air together for up to a minute; side A is the pilot under test,
// side B is a scripted opponent; the score is hits landed minus hits taken. It is brain/flightTask.mjs's sibling and uses its machinery on purpose: the pilots that fly it are the SAME functions (state, target, wind) ->
// { pitch, roll, yaw, throttle } -- the PD autopilot (brain/autopilotFlight.mjs), the fruit-fly network (brain/pilotFlightPolicy.mjs), the GPU network's CPU twin (brain/pilotFlightMlp.mjs) -- with no change to any of them.
//
// *** HOW A PILOT THAT ONLY TRACKS A HEADING FIGHTS: GUIDANCE IS NOT THE PILOT. *** Those pilots were trained to hold an altitude, a heading and an airspeed; none of them knows there is an opponent. So the task puts a
// GUIDANCE LAW between the fight and the pilot: pursuit() looks at the opponent, solves the gun's lead-and-drop (flightGuns.aimSolution) and hands the pilot the {heading, altitude, airspeed} that points the nose at the
// place the opponent will be -- the pilot's job is exactly the one it has always done, "get to this heading and this altitude", and the fight is what the guidance asks for. And the TRIGGER is a hand rule, not a
// control: fireControl() fires when the gun is pointed within the sphere's radius of where the lead solution says the opponent will be. WHAT THAT MEANS, SAID PLAINLY: this task grades how well a pilot FLIES THE GUIDANCE, not
// whether it has learned to dogfight -- nothing here can discover a better way to get the nose on a target than "turn toward the lead point", and no pilot decides when to shoot. A fighter pilot who learned the trigger and
// the geometry is a later round, graded on this same job.
//
//   SCENARIOS  (A is behind B except in the duel; all in still air, 300 m +- 40)
//     tail      A 250..450 m behind B, same heading +-7 degrees, +-25 m of altitude; B holds its heading, altitude and 45 m/s and does not shoot
//     offset    A 300..500 m from B, 30..70 degrees off its tail on either side, heading roughly at it; B straight and level, no shooting
//     turning   as tail, but B turns at 0.05..0.09 rad/s (the autopilot saturates at 0.11 at 45 m/s) and does not shoot
//     duel      A and B 700..1000 m apart ALONG their line of approach and 80..220 m to one side of it (704..1024 m of range), facing each other; B hunts A with the PD autopilot's pursuit and SHOOTS
//   THE OPPONENT is always the PD autopilot (a fixed reference, not the pilot under test).
//
//   THE SCORE of a fight for A is (damage dealt - damage taken) / hit points, each capped at the full hit points (20 hits of 1 damage kill), plus 0.25 (60 - t)/60 if A killed B at time t -- a quick kill beats a slow one. An aircraft
//   that reaches the ground (a crash or a touchdown) or hits the other one (closer than 6 m: both are lost) has TAKEN ITS FULL HIT POINTS: ending the fight on the ground, or in a collision, is a loss. It ends when either aircraft is destroyed or grounded, or at 60 s. The range is -1 .. 1.25.
//
// Pure: no DOM, no clock, no Math.random. The aircraft are physics/mechanics/flightModel6dof.mjs; the gun is physics/mechanics/flightGuns.mjs.
"use strict";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as AF from "./autopilotFlight.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = 1 / 30, SECONDS = 60;
export const KINDS = Object.freeze(["tail", "offset", "turning", "duel"]);
export const MIN_ALTITUDE = 120;        // guidance never asks a pilot to fly lower than this
export const MAX_RANGE = 450;           // the trigger is not pulled beyond it (a 1.5 s flight; the round lives 2 s)
export const FIRE_TOLERANCE = 1;        // fire when the predicted miss is within this many hit radii
export const SPEED_LIMITS = Object.freeze([38, 52]);
export const STANDOFF = 220;            // the range the guidance tries to hold, m
export const KILL_BONUS = 0.25;
export const BREAK_RANGE = 140, BREAK_CLOSING = 15, BREAK_TURN = 0.9, BREAK_CLIMB = 30;   // inside 140 m and closing faster than 15 m/s the guidance BREAKS OFF: it turns 0.9 rad away from the side the opponent is on and takes 30 m of separation in altitude
export const COLLISION_RANGE = 6;       // two aircraft this close have hit each other (the airframe is 10.6 m across): both are lost
export const A_ID = 1, B_ID = 2;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const fwdOf = (h) => [Math.cos(h), -Math.sin(h)], rightOf = (h) => [-Math.sin(h), -Math.cos(h)];   // heading 0 = world +X, a right turn increases it, +Y is the aircraft's left
const headingTo = (dx, dy) => Math.atan2(-dy, dx);

/** A scenario: { seed, kind, a, b (createState options), opponent: { kind: "straight" | "turn" | "hunt", rate, fires } }. Deterministic: a kind and a seed always make the same fight. */
export function scenario(seed, kind = "tail") {
    if (!KINDS.includes(kind)) throw new Error(`dogfightTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 6007 + KINDS.indexOf(kind) * 90001 + 29) >>> 0), u = (lo, hi) => lo + (hi - lo) * r(), sgn = () => (r() < 0.5 ? -1 : 1);
    const hB = u(-3, 3), altB = 300 + u(-40, 40), fB = fwdOf(hB), rB = rightOf(hB), posB = [0, 0, altB];
    const b = { pos: posB, speed: u(43, 47), heading: hB, pitch: 0.03, bank: 0, gamma: 0 };
    let a, opponent = { kind: "straight", rate: 0, fires: false };
    if (kind === "tail" || kind === "turning") {
        const d = u(250, 450), lat = u(-30, 30);
        a = { pos: [posB[0] - fB[0] * d + rB[0] * lat, posB[1] - fB[1] * d + rB[1] * lat, altB + u(-25, 25)], speed: u(40, 50), heading: hB + u(-0.12, 0.12), pitch: u(0, 0.05), bank: u(-0.1, 0.1), gamma: 0 };
        if (kind === "turning") opponent = { kind: "turn", rate: sgn() * u(0.05, 0.09), fires: false };
    } else if (kind === "offset") {
        const d = u(300, 500), phi = sgn() * u(0.52, 1.22);
        const dirx = fB[0] * Math.cos(phi) + rB[0] * Math.sin(phi), diry = fB[1] * Math.cos(phi) + rB[1] * Math.sin(phi);
        const apos = [posB[0] - dirx * d, posB[1] - diry * d, altB + u(-25, 25)];
        a = { pos: apos, speed: u(40, 50), heading: headingTo(posB[0] - apos[0], posB[1] - apos[1]) + u(-0.2, 0.2), pitch: u(0, 0.05), bank: u(-0.1, 0.1), gamma: 0 };
    } else {   // duel
        const D = u(700, 1000), lat = sgn() * u(80, 220), bearing = u(-3, 3), f = fwdOf(bearing), rr = rightOf(bearing);
        const bpos = [0, 0, altB], apos = [-f[0] * D + rr[0] * lat, -f[1] * D + rr[1] * lat, altB + u(-25, 25)];
        a = { pos: apos, speed: u(40, 50), heading: headingTo(bpos[0] - apos[0], bpos[1] - apos[1]) + u(-0.15, 0.15), pitch: u(0, 0.05), bank: u(-0.1, 0.1), gamma: 0 };
        b.heading = headingTo(apos[0] - bpos[0], apos[1] - bpos[1]) + u(-0.15, 0.15);
        opponent = { kind: "hunt", rate: 0, fires: true };
    }
    return Object.freeze({ seed, kind, a: Object.freeze(a), b: Object.freeze(b), opponent: Object.freeze(opponent) });
}

/**
 * PURSUIT GUIDANCE: what to tell a heading-altitude-airspeed pilot so that its nose ends on the opponent. The lead point is flightGuns.aimSolution's (where the opponent will be when a round fired now arrives); the heading is the
 * bearing to it, the altitude is its altitude (never below MIN_ALTITUDE), and the airspeed closes on the opponent when it is far and holds the opponent's speed when it is at STANDOFF. With no solution (the opponent is
 * outrunning the round) it is pure pursuit. Returns { target: { heading, altitude, airspeed }, range, sol }.
 */
export function pursuit(me, foe, spec = G.GUN) {
    const m = G.muzzleOf(me, spec), sol = G.aimSolution(m, foe.pos, foe.vel, spec);
    const pt = sol ? sol.point : foe.pos, range = norm(sub(foe.pos, me.pos));
    const vFoe = Math.hypot(foe.vel[0], foe.vel[1], foe.vel[2]);
    // BREAK OFF: lead pursuit flown head-on ends in a collision (two aircraft closing at 90 m/s, each turning toward the other's lead point), and a score that is mostly collisions grades the guidance, not the pilot. Inside BREAK_RANGE and
    // closing faster than BREAK_CLOSING, ask for a turn AWAY from the side the opponent is on and for altitude separation; the pursuit resumes as the range opens (the closing speed goes negative).
    const los = sub(foe.pos, me.pos), closing = range > 1e-9 ? -dot(sub(foe.vel, me.vel), los) / range : 0;
    if (range < BREAK_RANGE && closing > BREAK_CLOSING) {
        const a = F.attitude(me), f = fwdOf(a.heading), side = f[0] * los[1] - f[1] * los[0];   // (forward x line of sight).z: positive when the opponent is on the left
        return { target: { heading: a.heading + (side > 0 ? BREAK_TURN : -BREAK_TURN), altitude: Math.max(MIN_ALTITUDE, me.pos[2] + (foe.pos[2] > me.pos[2] ? -BREAK_CLIMB : BREAK_CLIMB)), airspeed: clamp(vFoe, SPEED_LIMITS[0], SPEED_LIMITS[1]) }, range, sol, breaking: true };
    }
    return { target: { heading: headingTo(pt[0] - me.pos[0], pt[1] - me.pos[1]), altitude: Math.max(MIN_ALTITUDE, pt[2]), airspeed: clamp(vFoe + 0.04 * (range - STANDOFF), SPEED_LIMITS[0], SPEED_LIMITS[1]) }, range, sol };
}

/**
 * THE TRIGGER: pull it when a round fired along the gun WOULD hit -- the gun axis is within FIRE_TOLERANCE hit radii of the lead solution at the opponent's range -- the opponent is inside MAX_RANGE and the gun has rounds.
 * Returns { fire, miss (m, the predicted distance between the round and the opponent at its time of flight), range }. A prediction on STRAIGHT lines: an opponent that turns while the round flies is missed.
 */
export function fireControl(me, foe, gun, spec = G.GUN) {
    if (gun.ammo <= 0) return { fire: false, miss: Infinity, range: Infinity };
    const m = G.muzzleOf(me, spec), sol = G.aimSolution(m, foe.pos, foe.vel, spec), range = norm(sub(foe.pos, me.pos));
    if (!sol || range > MAX_RANGE) return { fire: false, miss: Infinity, range };
    const c = clamp(dot(m.dir, sol.dir), -1, 1), miss = Math.sin(Math.acos(c)) * sol.t * spec.muzzleSpeed;
    return { fire: miss <= FIRE_TOLERANCE * spec.hitRadius, miss, range };
}

/** The opponent's guidance target for a scripted kind at time t: straight holds what it started with; turn advances the heading at `rate`. (A hunting opponent uses pursuit().) */
function scriptedTarget(sc, t) {
    const hdg = sc.opponent.kind === "turn" ? sc.b.heading + sc.opponent.rate * t : sc.b.heading;
    return { heading: hdg, altitude: sc.b.pos[2], airspeed: sc.b.speed };
}

/**
 * Fly one fight. `pilotA` is the pilot under test, (state, target, wind) -> controls. Returns { score, dealt, taken (hits), fired (rounds A fired), firedB (rounds B fired), hitRate, firstHit (s or null), killedB (s or null), statusA, statusB (airborne |
 * destroyed | collided | touchdown | crashed | lost), ticks, closest (m), minAltitude, fingerprint, seed, kind }. Deterministic.
 */
export function duel(pilotA, sc, { seconds = SECONDS, dt = DT, model = AF.defaultModel(), spec = G.GUN, specB = spec, pilotB = AF.pilot } = {}) {
    const mk = (o) => F.createState({ ...o, mass: model.mass, inertia: model.inertia });
    const A = { id: A_ID, state: mk(sc.a), gun: G.createGun(spec), hits: 0, taken: 0, status: "airborne" }, Bs = { id: B_ID, state: mk(sc.b), gun: G.createGun(specB), hits: 0, taken: 0, status: "airborne" };
    let rounds = [], firstHit = null, killedB = null, closest = Infinity, minAlt = Infinity, h = 0x811c9dc5, ticks = 0;
    const total = Math.round(seconds / dt), still = [0, 0, 0];
    for (let i = 0; i < total; i++) {
        const t = i * dt;
        const gA = pursuit(A.state, Bs.state, spec), gB = sc.opponent.kind === "hunt" ? pursuit(Bs.state, A.state, spec) : { target: scriptedTarget(sc, t) };
        const cA = pilotA(A.state, gA.target, still), cB = pilotB(Bs.state, gB.target, still);
        const fA = fireControl(A.state, Bs.state, A.gun, spec).fire, fB = sc.opponent.fires && fireControl(Bs.state, A.state, Bs.gun, spec).fire;
        const sa = G.fire(A.gun, A.state, fA, dt, A_ID), sb = G.fire(Bs.gun, Bs.state, !!fB, dt, B_ID);
        A.gun = sa.gun; Bs.gun = sb.gun;
        const ra = F.stepFlight(model, A.state, cA, dt, still), rb = F.stepFlight(model, Bs.state, cB, dt, still);
        const targets = [{ id: A_ID, from: A.state.pos, to: ra.state.pos, radius: spec.hitRadius }, { id: B_ID, from: Bs.state.pos, to: rb.state.pos, radius: spec.hitRadius }];
        const res = G.stepRounds([...rounds, ...sa.rounds, ...sb.rounds], dt, targets, { life: spec.life });
        rounds = res.rounds;
        for (const hit of res.hits) {
            if (hit.target === B_ID) { Bs.taken += spec.damage; A.hits += spec.damage; if (firstHit === null) firstHit = (i + 1) * dt; }
            else { A.taken += spec.damage; Bs.hits += spec.damage; }
        }
        A.state = ra.state; Bs.state = rb.state; ticks = i + 1;
        const range = norm(sub(A.state.pos, Bs.state.pos)); if (range < closest) closest = range;
        if (A.state.pos[2] < minAlt) minAlt = A.state.pos[2];
        if (i % 30 === 0) for (const c of [A.state.pos[0], A.state.pos[1], A.state.pos[2], Bs.state.pos[0], Bs.state.pos[1], Bs.state.pos[2], A.hits, Bs.hits]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
        if (ra.status !== "airborne") A.status = ra.status; if (rb.status !== "airborne") Bs.status = rb.status;
        if (range < COLLISION_RANGE) { A.status = "collided"; Bs.status = "collided"; }
        if (A.taken >= spec.hp) A.status = "destroyed";
        if (Bs.taken >= spec.hp) { Bs.status = "destroyed"; killedB = ticks * dt; }
        if (A.status !== "airborne" || Bs.status !== "airborne") break;
    }
    const aLost = A.status !== "airborne" ? Math.max(A.taken, spec.hp) : A.taken;   // the ground (or a kill) takes the full hit points
    const dealt = Math.min(A.hits, spec.hp), taken = Math.min(aLost, spec.hp);
    const score = (dealt - taken) / spec.hp * spec.damage + (killedB !== null && A.status === "airborne" ? KILL_BONUS * Math.max(0, seconds - killedB) / seconds : 0);
    return { score, dealt: A.hits, taken: A.taken, fired: A.gun.fired, firedB: Bs.gun.fired, hitRate: A.gun.fired ? A.hits / A.gun.fired : 0, firstHit, killedB, statusA: A.status, statusB: Bs.status, ticks, closest, minAltitude: minAlt, fingerprint: (h >>> 0).toString(16).padStart(8, "0"), seed: sc.seed, kind: sc.kind };
}

const mk = (spec) => Object.freeze(spec.flatMap(([kind, seeds]) => seeds.map((s) => scenario(s, kind))));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** The fights a pilot is graded on: six of each kind, seeds 1..6. (No pilot has trained on a dogfight yet, so there is one set and no held-out; the day one trains, the sets of flightTask.mjs's discipline apply.) */
export const DOGFIGHT_SET = mk(KINDS.map((k) => [k, range(1, 6)]));

/** A larger set to measure with, seeds 100..159 of the two kinds that tell pilots apart (the other two are won by almost any pilot that can follow a heading): sixty duels and sixty fights against a turning opponent. */
export const DOGFIGHT_BENCH_SET = mk([["duel", range(100, 159)], ["turning", range(100, 159)]]);

/** A pilot over a set: { score (mean), byKind, dealt, taken (total hits), fired, kills (B destroyed), deaths (A destroyed or grounded), results }. */
export function evaluate(pilot, set = DOGFIGHT_SET, opts = {}) {
    const results = set.map((sc) => duel(pilot, sc, opts)), byKind = {};
    for (const k of KINDS) { const rs = results.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((s, r) => s + r.score, 0) / rs.length; }
    return { score: results.reduce((s, r) => s + r.score, 0) / results.length, byKind, dealt: results.reduce((s, r) => s + r.dealt, 0), taken: results.reduce((s, r) => s + r.taken, 0), fired: results.reduce((s, r) => s + r.fired, 0),
        kills: results.filter((r) => r.statusB === "destroyed").length, deaths: results.filter((r) => r.statusA !== "airborne").length, results };
}

export function reportLines() {
    const r = evaluate(AF.pilot);
    return ["[dogfightTask] two aircraft, a fixed forward gun each, a pilot under test against a scripted opponent",
        `  ${DOGFIGHT_SET.length} fights (${KINDS.join(", ")}): the PD autopilot flying pursuit guidance scores ${r.score.toFixed(3)} (${KINDS.map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}); ${r.dealt} hits landed on ${r.fired} rounds, ${r.taken} taken, ${r.kills} kills, ${r.deaths} lost`];
}

import { pathToFileURL } from "node:url";
if (typeof process !== "undefined" && process.argv && import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); }
