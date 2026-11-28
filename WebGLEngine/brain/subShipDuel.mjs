// WebGLEngine/brain/subShipDuel.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SUB AGAINST SHIP (Keith, 2026-11-28: "then sub vs ship"). brain/subDuel.mjs's boat -- the same hull (physics/mechanics/subModel6dof.mjs), the same motion pilot and tactician
// contract, the same four torpedoes and 10-second reload, the same sonar -- against a SURFACE SHIP (physics/mechanics/surfaceShip.mjs) steered by a helm in the ship's seat
// (brain/shipHelm.mjs). Four minutes.
//
//   THE SHIP      starts 500 to 900 m off, on a course that crosses the sub's water (its closest point of approach, if it held course, 100 to 300 m from the sub: a convoy's
//                 lane through the patrol area); it has no weapon in this arena (said plainly: depth charges and a hunting escort are later rounds), so its only play is
//                 the helm's -- where it steers and how fast -- and what its hull sonar hears: the sub (a boat's noise) and every torpedo (classified, as the subs classify)
//   THE SUB       hears the ship as a BOAT contact (bearing, elevation; no range), pings for an echo off it, aims its nose and fires, as against a boat; its depth is held
//                 12 to 45 m as in the duel; it is lost to the floor, the surface or the crush depth
//   THE TORPEDOES home on the loudest target in their cone: the ship is offered as its three keel points (surfaceShip.targetsOf: the surface rule)
//   THE SCORE     for the sub: damage dealt / the ship's hit points, +0.5 for sinking it (+ up to 0.5 more for sinking it early), -0.5 for losing the boat
// Deterministic from a seed. Pure: no DOM, no Math.random, no clock.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as K from "../physics/mechanics/subSonar.mjs";
import * as Tp from "../physics/mechanics/subTorpedo.mjs";
import * as SH from "../physics/mechanics/surfaceShip.mjs";
import * as HELM from "./shipHelm.mjs";
import * as AS from "./autopilotSub.mjs";
import { duelModel } from "./subDuel.mjs";

export const DT = S.DT, SECONDS = 240, LOOK_EVERY = 15, AMMO = 4, RELOAD_TICKS = 300, SUB_HP = 100, KILL_BONUS = 0.5, SPEED_BONUS = 0.5, SHIP_ID = 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A scenario: { seed, cls, helm, sub: { depth, heading, speed }, ship: { pos, heading, speed }, cpa }. The sub starts at the origin heading 0 at 30 m. */
export function scenario(seed, { cls = "freighter", helm = "zigzag" } = {}) {
    if (!SH.SHIP_CLASSES[cls]) throw new Error(`subShipDuel.scenario: unknown class "${cls}"`);
    if (!HELM.HELMS.includes(helm)) throw new Error(`subShipDuel.scenario: unknown helm "${helm}"`);
    const r = mulberry((seed * 15485863 + Object.keys(SH.SHIP_CLASSES).indexOf(cls) * 7919 + HELM.HELMS.indexOf(helm) * 104729 + 13) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    // the ship's lane: a line passing `cpa` from the sub, crossing ahead of it within 50 degrees of its nose; the ship starts `run` back along it
    const across = u(-0.9, 0.9), cpa = u(100, 300) * (r() < 0.5 ? -1 : 1), laneHeading = wrap(across + (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2)), f = SH.forwardOf(laneHeading), n = [-f[1], f[0]], run = u(500, 900);
    const closest = [n[0] * cpa, n[1] * cpa], start = [closest[0] - f[0] * run, closest[1] - f[1] * run];
    return Object.freeze({ seed, cls, helm, cpa: Math.abs(cpa), sub: Object.freeze({ depth: 30, heading: 0, speed: 2 }), ship: Object.freeze({ pos: Object.freeze(start), heading: laneHeading, speed: SH.SHIP_CLASSES[cls].maxSpeed * HELM.HELM_DEFAULTS.cruise }) });
}

/** One duel: `side` is the sub ({ tactics, pilot } as subDuel's side). Returns { score, winner ("sub" | "ship" | "draw"), shipHp, subHp, fired, hits, events, trace? }. */
export function duel(side, sc, { seconds = SECONDS, dt = DT, model = duelModel(), helm = null, trace = null } = {}) {
    const total = Math.round(seconds / dt), seed = sc.seed, events = [], C = SH.SHIP_CLASSES[sc.cls];
    let sub = { id: 1, state: S.createState({ depth: sc.sub.depth, pos: [0, 0, -sc.sub.depth], speed: sc.sub.speed, heading: sc.sub.heading, model }), tactics: side.tactics, pilot: side.pilot || AS.pilot(), alive: true, fate: null, hp: SUB_HP, ammo: AMMO, cooldown: 0, echoes: [], pings: [], target: null, fired: 0, hits: 0 };
    let ship = SH.createShip({ cls: sc.cls, pos: sc.ship.pos, heading: sc.ship.heading, speed: sc.ship.speed }), shipAlive = true, shipCmd = { heading: ship.heading, speed: ship.speed };
    const decideShip = helm || HELM.makeHelm(sc.helm, { base: sc.ship.heading }), torps = []; let nextTorp = 1, flown = 0;
    const subPlat = () => K.platformOf(sub.state), att = () => S.attitude(sub.state);
    for (let tick = 0; tick < total; tick++) {
        // ---- the sub's look ----
        if (sub.alive && tick % LOOK_EVERY === 0) {
            const a = att(), me = subPlat(), contacts = [];
            if (shipAlive) { const c = K.listen(me, SH.platformOf(ship), { seed, tick, channel: 1, sl: SH.sourceLevelOf(ship) }); if (c) contacts.push({ kind: "boat", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); }
            const obs = { t: tick * dt, self: { depth: a.depth, heading: a.heading, speed: a.speed, x: sub.state.pos[0], y: sub.state.pos[1], hp: sub.hp, ammo: sub.ammo, ready: sub.cooldown <= 0 && sub.ammo > 0 }, contacts, echoes: sub.echoes, pings: sub.pings };
            sub.echoes = []; sub.pings = [];
            const cmd = sub.tactics(obs) || {};
            sub.target = { depth: clamp(Number.isFinite(cmd.depth) ? cmd.depth : a.depth, 12, 45), heading: Number.isFinite(cmd.heading) ? cmd.heading : a.heading, speed: clamp(Number.isFinite(cmd.speed) ? cmd.speed : a.speed, 0.3, 4.5) };
            if (cmd.fire === true && sub.ammo > 0 && sub.cooldown <= 0) { torps.push(Tp.launch(1, { pos: sub.state.pos, heading: a.heading, pitch: a.pitch }, { id: nextTorp++ })); sub.ammo--; sub.fired++; sub.cooldown = RELOAD_TICKS; events.push({ tick, type: "fire" }); }
            if (cmd.ping === true && shipAlive) { const e = K.ping(me, SH.platformOf(ship), { seed, tick, channel: 1 }); if (e) sub.echoes.push({ bearing: e.bearing, elevation: e.elevation, range: e.range }); events.push({ tick, type: "ping" }); }
        }
        // ---- the ship's look (staggered half a look from the sub's) ----
        if (shipAlive && (tick + 7) % LOOK_EVERY === 0) {
            const me = SH.platformOf(ship), contacts = [];
            if (sub.alive) { const c = K.listen(me, subPlat(), { seed, tick, channel: 30 }); if (c) contacts.push({ kind: "boat", bearing: c.bearing, snr: c.snr }); }
            for (const t of torps) { if (t.status !== "running") continue; const c = K.listen(me, Tp.platformOf(t), { seed, tick, channel: 40 + t.id, sl: K.SONAR.torpedoSL }); if (c) contacts.push({ kind: "torpedo", bearing: c.bearing, snr: c.snr }); }
            shipCmd = decideShip({ t: tick * dt, self: { x: ship.pos[0], y: ship.pos[1], heading: ship.heading, speed: ship.speed, hp: ship.hp, cls: ship.cls, maxSpeed: C.maxSpeed }, contacts }) || shipCmd;
        }
        // ---- the hulls ----
        if (sub.alive) { const res = S.stepSub(model, sub.state, sub.pilot(sub.state, sub.target || { depth: sc.sub.depth, heading: sc.sub.heading, speed: sc.sub.speed }, [0, 0, 0]), dt); sub.state = res.state; if (sub.cooldown > 0) sub.cooldown--; if (res.status !== "submerged") { sub.alive = false; sub.fate = res.status; events.push({ tick, type: "loss", who: "sub", why: res.status }); } }
        if (shipAlive) ship = SH.stepShip(ship, shipCmd, dt);
        // ---- the torpedoes ----
        const targets = shipAlive ? SH.targetsOf(ship, SHIP_ID) : [];
        for (let i = 0; i < torps.length; i++) {
            if (torps[i].status !== "running") continue;
            const r = Tp.stepTorpedo(torps[i], targets, { dt, tick, seed, floor: model.spec.seabed }); torps[i] = r.torpedo;
            if (r.event && shipAlive) { ship = Object.freeze({ ...ship, hp: Math.max(0, ship.hp - r.event.damage) }); sub.hits++; events.push({ tick, type: "hit", damage: r.event.damage, distance: r.event.distance });
                if (ship.hp <= 0) { shipAlive = false; events.push({ tick, type: "loss", who: "ship", why: "sunk" }); } }
        }
        flown++;
        if (trace && tick % 6 === 0) trace.push({ tick, sub: { x: sub.state.pos[0], y: sub.state.pos[1], depth: att().depth, heading: att().heading, alive: sub.alive }, ship: { x: ship.pos[0], y: ship.pos[1], heading: ship.heading, speed: ship.speed, hp: ship.hp, alive: shipAlive }, torps: torps.filter((t) => t.status === "running").map((t) => ({ id: t.id, x: t.pos[0], y: t.pos[1], depth: -t.pos[2] })) });
        if (!sub.alive || !shipAlive) break;
    }
    const dealt = C.hp - ship.hp, sunk = !shipAlive, lost = !sub.alive;
    const score = dealt / C.hp + (sunk ? KILL_BONUS : 0) - (lost ? KILL_BONUS : 0) + (sunk && !lost ? SPEED_BONUS * (1 - flown / total) : 0);
    return { score, winner: sunk && !lost ? "sub" : lost && !sunk ? "ship" : "draw", shipHp: ship.hp, subHp: sub.hp, subFate: sub.fate, fired: sub.fired, hits: sub.hits, ticks: flown, events, ship, sub: { pos: sub.state.pos.slice() },
        torpedoes: torps.map((t) => ({ id: t.id, status: t.status, depth: -t.pos[2] })) };
}

// ---- the command line: node brain/subShipDuel.mjs [--seeds 8] [--cls freighter,corvette,destroyer] [--helm steady,zigzag,evade] (or node tools/ship/studyCmd.mjs subShipDuel ...) ----
// the hand tactician (brain/subTactics.mjs) against every class and helm asked, on seeds 1..n: how many ships it sank, torpedoes fired and hits. NOT a registered study: a look at the arena.
if (typeof process !== "undefined" && process.argv && /subShipDuel\.mjs$/.test(process.argv[1] || "")) {   // no node import: a page may import this module
    const rest = process.argv.slice(2), opt = (k, d) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; };
    const n = Number(opt("seeds", 8)), classes = opt("cls", Object.keys(SH.SHIP_CLASSES).join(",")).split(","), helms = opt("helm", HELM.HELMS.join(",")).split(",");
    const TA = await import("./subTactics.mjs");
    console.log(`[subShipDuel] the hand tactician against each ship, seeds 1..${n} (not a registered study)`);
    for (const cls of classes) for (const helm of helms) {
        let sunk = 0, fired = 0, hits = 0;
        for (let seed = 1; seed <= n; seed++) { const r = duel({ tactics: TA.makeTactician(), pilot: AS.pilot() }, scenario(seed, { cls, helm })); if (r.winner === "sub") sunk++; fired += r.fired; hits += r.hits; }
        console.log(`  ${cls.padEnd(10)} ${helm.padEnd(7)} sunk ${sunk} of ${n}   ${hits} hits of ${fired} torpedoes`);
    }
}
