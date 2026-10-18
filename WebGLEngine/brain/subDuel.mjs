// WebGLEngine/brain/subDuel.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SUBMARINE DUEL: two boats in the same water for up to four minutes, each with the sonar of physics/mechanics/subSonar.mjs, four torpedoes (physics/mechanics/subTorpedo.mjs) and 100 hit points. It is
// brain/dogfightTask.mjs for the sea. Side A is the pilot under test; side B is a scripted drone (brain/subTactics.mjs: patrol, quiet, evader, hunter). The score is for A: damage dealt less damage taken (in hit
// points / 100), +0.5 for sinking B (plus up to +0.5 more for doing it EARLY: 0.5 x the fraction of the four minutes left) and -0.5 for LOSING THE BOAT, by a torpedo or by the floor, the surface or the crush depth.
//
//   THE BOATS     the vessel of physics/mechanics/subModel6dof.mjs (the EXPLORER), flown by the same MOTION pilot as every task before this one -- the PD autopilot or the connectome-wired network -- through the same
//                 (state, target, current) -> { pitch, yaw, thrust, ballast } contract; `actuators` puts the slew limits of subActuators.mjs between the pilot and the hull. A boat is lost to the floor (50 m), the surface, the crush
//                 depth or a torpedo; it is told its own position (a perfect fix: said plainly) and nothing about the other boat's.
//   THE LOOK      every boat looks at 2 Hz (every 15th tick, staggered by 7 ticks per boat id) and ONLY THEN its tactician decides. It is handed: its own gauges; passive CONTACTS (a bearing and an elevation, no range) on
//                 the other boat and on every enemy TORPEDO (classified as a torpedo: a fast screw is unmistakable -- a simplification, said); ECHOES from its own pings (bearing, elevation, range); and the PINGS it heard from
//                 the other boat (a bearing to the pinger, no range). The tactician answers { depth, heading, speed, fire, ping }; depth/heading/speed are held until the next look.
//   FIRING        a torpedo leaves along the NOSE (the boat's heading and pitch), 6 m ahead; four per boat; a 10-second reload between shots. A boat that cannot point its nose at the target cannot shoot it.
//   PINGING       an echo is computed at the moment of the ping and delivered at the pinger's next look; the other boat is told of the ping at ITS next look (a ping is heard from ~10 km).
//   THE TORPEDOES step every tick, each homing on the loudest enemy boat in its cone, and their detonations are applied to hit points the tick they happen; a boat at 0 is sunk at once.
//
// Deterministic from a seed: the start geometry, the drone's drift and every sonar look are functions of the scenario seed and the tick. Pure: no DOM, no Math.random, no clock.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as K from "../physics/mechanics/subSonar.mjs";
import * as Tp from "../physics/mechanics/subTorpedo.mjs";
import { createActuators } from "../physics/mechanics/subActuators.mjs";
import * as AS from "./autopilotSub.mjs";
import * as TA from "./subTactics.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const DT = S.DT, SECONDS = 240, LOOK_EVERY = 15, STAGGER = 7, AMMO = 4, RELOAD_TICKS = 300, HP = 100, KILL_BONUS = 0.5, SPEED_BONUS = 0.5;
export const KINDS = TA.SCRIPTED_KINDS;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A scenario: { seed, kind (the drone B), a: { depth, heading, speed }, b: { pos [x, y], depth, heading, speed }, drift }. A starts at the origin heading 0; B 250..450 m away within 60 degrees of A's nose. */
export function scenario(seed, kind = "patrol") {
    if (!KINDS.includes(kind)) throw new Error(`subDuel.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 71) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const range = u(250, 450), bearing = u(-1.05, 1.05);
    return Object.freeze({
        seed, kind, a: Object.freeze({ depth: u(20, 32), heading: 0, speed: 2 }),
        b: Object.freeze({ pos: Object.freeze([range * Math.cos(bearing), -range * Math.sin(bearing)]), depth: u(15, 40), heading: u(-Math.PI, Math.PI), speed: kind === "quiet" ? 0.5 : 2 }), drift: u(-0.006, 0.006),
    });
}

let MODEL = null;
const duelModel = () => MODEL || (MODEL = S.createSubModel());

/**
 * Fight one duel. `side` is { tactics: (obs) -> { depth, heading, speed, fire, ping } (a FRESH one: it has memory), pilot: (state, target, current) -> controls } for A; B is the scenario's scripted drone flown by the
 * PD autopilot. Options: { seconds, dt, actuators (a rate set: both boats), model, opponent (a { tactics, pilot } that replaces the drone: a test, or self-play) }. Returns { score, winner ("A" | "B" | "draw"), hp: [A, B], damage: [dealt by A, dealt by B], fired: [A, B], hits: [A, B],
 * pings: [A, B], fates: [A, B] ("afloat" | "sunk" | "grounded" | "broached" | "crushed" | "lost"), ticks, events (what happened: { tick, type: "fire" | "ping" | "hit" | "loss", boat, ... }), fingerprint }. Deterministic.
 */
export function duel(side, sc, { seconds = SECONDS, dt = DT, actuators = null, model = duelModel(), opponent = null } = {}) {
    const total = Math.round(seconds / dt), seed = sc.seed, events = [];
    const mk = (id, start, tactics, pilot) => ({ id, state: S.createState({ depth: start.depth, pos: start.pos ? [start.pos[0], start.pos[1], -start.depth] : [0, 0, -start.depth], speed: start.speed, heading: start.heading, model }), tactics, pilot, act: actuators ? createActuators(actuators) : null,
        hp: HP, ammo: AMMO, cooldown: 0, target: { depth: start.depth, heading: start.heading, speed: start.speed }, alive: true, fate: "afloat", echoes: [], pings: [], dealt: 0, fired: 0, hits: 0, pinged: 0 });
    const A = mk(1, sc.a, side.tactics, side.pilot), B = mk(2, sc.b, opponent ? opponent.tactics : TA.scripted(sc.kind, { drift: sc.drift }), opponent ? opponent.pilot : AS.pilot()), boats = [A, B], torps = [];
    let nextTorp = 1, h = 0x811c9dc5, flown = 0;
    const plat = (b) => K.platformOf(b.state);
    const att = (b) => S.attitude(b.state);
    const others = (b) => boats.filter((o) => o !== b && o.alive);

    for (let tick = 0; tick < total; tick++) {
        // ---- the looks: observation, decision, launch, ping ----
        for (const b of boats) {
            if (!b.alive || (tick + STAGGER * b.id) % LOOK_EVERY !== 0) continue;
            const a = att(b), me = plat(b), contacts = [];
            for (const o of others(b)) { const c = K.listen(me, plat(o), { seed, tick, channel: b.id }); if (c) contacts.push({ kind: "boat", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); }
            for (const t of torps) { if (t.status !== "running" || t.owner === b.id) continue; const c = K.listen(me, Tp.platformOf(t), { seed, tick, channel: b.id + 10 + t.id, sl: K.SONAR.torpedoSL }); if (c) contacts.push({ kind: "torpedo", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); }
            const obs = { t: tick * dt, self: { depth: a.depth, heading: a.heading, speed: a.speed, x: b.state.pos[0], y: b.state.pos[1], hp: b.hp, ammo: b.ammo, ready: b.cooldown <= 0 && b.ammo > 0 }, contacts, echoes: b.echoes, pings: b.pings };
            b.echoes = []; b.pings = [];
            const cmd = b.tactics(obs) || {};
            b.target = { depth: clamp(Number.isFinite(cmd.depth) ? cmd.depth : a.depth, 12, 45), heading: Number.isFinite(cmd.heading) ? cmd.heading : a.heading, speed: clamp(Number.isFinite(cmd.speed) ? cmd.speed : a.speed, 0.3, 4.5) };
            if (cmd.fire === true && b.ammo > 0 && b.cooldown <= 0) { torps.push(Tp.launch(b.id, { pos: b.state.pos, heading: a.heading, pitch: a.pitch }, { id: nextTorp++ })); b.ammo--; b.fired++; b.cooldown = RELOAD_TICKS; events.push({ tick, type: "fire", boat: b.id }); }
            if (cmd.ping === true) {
                b.pinged++; events.push({ tick, type: "ping", boat: b.id });
                for (const o of others(b)) {
                    const e = K.ping(me, plat(o), { seed, tick, channel: b.id }); if (e) b.echoes.push({ bearing: e.bearing, elevation: e.elevation, range: e.range });
                    const heard = K.pingHeard(plat(o), me, { seed, tick, channel: o.id + 20 }); if (heard) o.pings.push({ bearing: heard.bearing });
                }
            }
        }
        // ---- the hulls ----
        for (const b of boats) {
            if (!b.alive) continue;
            const ctl = b.pilot(b.state, b.target, [0, 0, 0]), res = S.stepSub(model, b.state, b.act ? b.act.step(ctl, dt) : ctl, dt);
            b.state = res.state; if (b.cooldown > 0) b.cooldown--;
            if (res.status !== "submerged") { b.alive = false; b.fate = res.status; events.push({ tick, type: "loss", boat: b.id, why: res.status }); }
        }
        // ---- the torpedoes ----
        const targets = boats.filter((b) => b.alive).map((b) => ({ id: b.id, pos: b.state.pos, heading: att(b).heading, speed: att(b).speed }));
        for (let i = 0; i < torps.length; i++) {
            if (torps[i].status !== "running") continue;
            const r = Tp.stepTorpedo(torps[i], targets, { dt, tick, seed, floor: model.spec.seabed }); torps[i] = r.torpedo;
            if (r.event) {
                const victim = boats.find((b) => b.id === r.event.target), owner = boats.find((b) => b.id === torps[i].owner);
                victim.hp = Math.max(0, victim.hp - r.event.damage); owner.dealt += Math.min(r.event.damage, victim.hp + r.event.damage); owner.hits++; events.push({ tick, type: "hit", boat: owner.id, target: victim.id, damage: r.event.damage });
                if (victim.hp <= 0 && victim.alive) { victim.alive = false; victim.fate = "sunk"; events.push({ tick, type: "loss", boat: victim.id, why: "sunk" }); }
            }
        }
        flown++;
        if (tick % 30 === 0) for (const b of boats) for (const c of [b.state.pos[0], b.state.pos[1], b.state.pos[2]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
        if (!A.alive || !B.alive) break;
    }
    const dmgA = A.dealt, dmgB = B.dealt, sunkB = B.fate === "sunk", lostA = !A.alive;
    const score = (dmgA - dmgB) / HP + (sunkB ? KILL_BONUS : 0) - (lostA ? KILL_BONUS : 0) + (sunkB && !lostA ? SPEED_BONUS * (1 - flown / total) : 0);
    const winner = A.alive && !B.alive ? "A" : B.alive && !A.alive ? "B" : "draw";
    return { score, winner, hp: [A.hp, B.hp], damage: [dmgA, dmgB], fired: [A.fired, B.fired], hits: [A.hits, B.hits], pings: [A.pinged, B.pinged], fates: [A.fate, B.fate], ticks: flown, events, seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16) };
}


/**
 * The score of a duel result FROM A SIDE'S POINT OF VIEW (who = "A" or "B"): the same formula duel() scores A with, written for either side, so a tactician can be graded in either seat. A duel's own `score` is
 * scoreFor(result, "A"). `seconds` is the duel's length (the speed bonus is the fraction of it left).
 */
export function scoreFor(result, who = "A", seconds = SECONDS) {
    const me = who === "A" ? 0 : 1, you = 1 - me, total = Math.round(seconds / DT), lost = result.fates[me] !== "afloat", sunkYou = result.fates[you] === "sunk";
    return (result.damage[me] - result.damage[you]) / HP + (sunkYou ? KILL_BONUS : 0) - (lost ? KILL_BONUS : 0) + (sunkYou && !lost ? SPEED_BONUS * (1 - result.ticks / total) : 0);
}

// ---- the sides, the sets ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A side factory for the hand tactician with `theta` and a motion pilot (default the PD autopilot): call it once per duel. */
export const sideHand = (theta = TA.THETA_DEFAULT, pilot = null) => () => ({ tactics: TA.makeTactician(theta), pilot: pilot || AS.pilot() });

const WIDE = (kind, a, b) => Array.from({ length: b - a + 1 }, (_, i) => scenario(a + i, kind));
const mk = (a, b) => Object.freeze(KINDS.flatMap((k) => WIDE(k, a, b)));
export const TRAIN_SET = mk(1, 6), HELD_OUT_SET = mk(11, 16), BASELINE_SET = mk(501, 506), AUDIT_SET = mk(51, 58);   // AUDIT_SET: NOT YET READ

/** `sideFactory` over a set: { score (the mean), runs, wins, losses, draws, byKind }. */
export function evaluate(sideFactory, set, opts = {}) {
    const runs = set.map((sc) => duel(sideFactory(), sc, opts)), byKind = {};
    for (const k of KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
    return { score: runs.reduce((a, r) => a + r.score, 0) / runs.length, runs, wins: runs.filter((r) => r.winner === "A").length, losses: runs.filter((r) => r.winner === "B").length, draws: runs.filter((r) => r.winner === "draw").length, byKind };
}
export const describeEval = (r) => `${r.score.toFixed(4)} (${KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.wins} W ${r.losses} L ${r.draws} D)`;
