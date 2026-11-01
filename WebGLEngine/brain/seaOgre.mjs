// WebGLEngine/brain/seaOgre.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SEA OGRE AGAINST THE SUBS: the water-borne OGRE of the voxel tower-defence scenario (simulation/OgreScenario.js: the mk10 sub-OGRE that dives, surfaces to bombard and calls escort subs) brought onto the
// submarine arena of brain/subDuel.mjs. N defending boats (any side of brain/subTournament.mjs: a hand tactician with the PD autopilot or the connectome-wired network) hold a headquarters at the origin against ONE
// monster that is marching on it. This is ROUTE ONE of two: the OGRE here is a physics-arena body (a kinematic hull with hit zones), not the voxel game's own world; the voxel port is route two and is NOT done.
//
//   THE OGRE      a 40 m hull that steers for the headquarters at 2.6 m/s (turn limited) and is LOUD: its noise is a boat's at that speed plus 10 dB, so the defenders hear it from ~700 m. It has FOUR HIT ZONES on
//                 top of the hull (the voxel OGRE's turret hard points, translated): TUBES (bow: without them it cannot fire), SONAR (without it, it is deaf and cannot aim), CANNON (the deck gun: without it
//                 the surfaced bombardment stops) and ENGINE (stern: dead, it crawls at 40% speed). A torpedo detonates on the NEAREST zone (the proximity fuse of subTorpedo.mjs picks the closest target point): a hit on a
//                 zone damages it fully and the hull for HALF of it (a zone that is gone is no longer a target, and the next hit goes to the next nearest); a hit on the hull damages the hull only.
//                 THE CYCLE (the mk10's): 9 s SUBMERGED at 14 m (the tubes fire a torpedo every 7 s along a bearing its own sonar heard), then 5 s SURFACED at 4 m (the cannon bombards the headquarters if it is inside 220 m).
//                 PHASES by hull: under 50% it launches ESCORT subs (every 15 s, at most 2 alive, 35 s of life, 30 hit points, they hunt the nearest defender and burst on it for 35); under 20% it is BERSERK (speed
//                 x1.4, fires every 4.5 s).
//   THE DEFENDERS six torpedoes each (10 s reload), 100 hit points, the sonar of subSonar.mjs and the look/decide/hold loop of subDuel.mjs. THEY HEAR THE OGRE AND THE ESCORTS AND NOTHING FRIENDLY (an IFF
//                 filter, said plainly: a passive array cannot tell, and the duel's tacticians have no vocabulary for a friend); their torpedoes can not hit a friend either.
//   THE OUTCOME   defended (the hull is gone), breached (the OGRE closes inside 60 m of the headquarters, or the cannon takes its 100 hit points), holdout (300 s pass with neither). SCORE: the hull's damage
//                 fraction + (defended: 1 + 0.5 x the fraction of the time left) - (breached: 1) - 0.15 per defender lost.
//
// WHAT IT IS NOT: the OGRE is not a 6-DOF body (a heading, a speed and a depth step, turn-limited); its torpedoes are the defenders' torpedoes; the Sky scenario and the carrier (mk11) variant of the voxel game do
// not translate (a plane cannot take off from the water here) and are NOT here; and no human flies a boat in it: it is watched as a recording, from outside or from the bow of a defender (render/seaOgre3d.mjs).
// Deterministic from a seed. Pure: no DOM, no Math.random, no clock.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as K from "../physics/mechanics/subSonar.mjs";
import * as Tp from "../physics/mechanics/subTorpedo.mjs";
import { createActuators } from "../physics/mechanics/subActuators.mjs";
import { foldHash } from "../physics/raceCar.mjs";
import { createSquad, SQUAD } from "./subSquad.mjs";

export const TRACE_EVERY = 6;
export const DT = S.DT, SECONDS = 300, LOOK_EVERY = 15, STAGGER = 7, RELOAD_TICKS = 300, HP = 100;
export const OGRE = Object.freeze({
    id: 900, hull: 300, speed: 2.3, turnRate: 0.25, loudBonus: 10, length: 40,
    subDepth: 14, surfDepth: 4, subTicks: 270, surfTicks: 150, fireEvery: 7, berserkFireEvery: 4.5, berserkSpeed: 1.4, crawl: 0.4,
    sonarDi: 20, fireRange: 380, cannonRange: 220, cannonEvery: 2.5, cannonDamage: 6, breachRange: 60,
    phase2: 0.5, phase3: 0.2, escortEvery: 15, escortMax: 2, escortTtl: 35, escortHp: 30, escortSpeed: 3, escortBurst: 15, escortDamage: 35, spill: 0.5,
});
export const HQ_HP = 100, AMMO = 6;
/** The hit zones: { name, id, at (metres along the hull, + toward the bow), hp }. The spacing (>= 7 m) is wider than the fuse's shell so the nearest one is the one a detonation names. */
export const ZONES = Object.freeze([
    Object.freeze({ name: "tubes", id: 901, at: 14, hp: 120 }), Object.freeze({ name: "sonar", id: 902, at: 7, hp: 100 }),
    Object.freeze({ name: "cannon", id: 903, at: -7, hp: 130 }), Object.freeze({ name: "engine", id: 904, at: -14, hp: 150 }),
]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A scenario: { seed, n (defenders), ogre: { pos [x, y], heading }, defenders: [{ pos, depth, heading, speed }] }. The OGRE starts 650..800 m out at a random bearing, steering for the origin; the defenders 90..150 m out on the same side, spread across. */
export function scenario(seed, n = 3) {
    const r = mulberry((seed * 7919 + n * 104729 + 311) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const az = u(-Math.PI, Math.PI), range = u(650, 800), ox = range * Math.cos(az), oy = range * Math.sin(az);
    const toOgre = Math.atan2(-oy, ox), defenders = [];
    for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 55, out = u(90, 150), px = out * Math.cos(az) - spread * Math.sin(az), py = out * Math.sin(az) + spread * Math.cos(az);
        defenders.push(Object.freeze({ pos: Object.freeze([px, py]), depth: u(18, 30), heading: toOgre, speed: 2 }));
    }
    return Object.freeze({ seed, n, ogre: Object.freeze({ pos: Object.freeze([ox, oy]), heading: Math.atan2(oy, -ox) }), defenders: Object.freeze(defenders) });
}

let MODEL = null;
const seaModel = () => MODEL || (MODEL = S.createSubModel());

/** The target points of the OGRE (the hull and every standing zone) in the world, and its zone table. */
export function ogrePoints(o) {
    const c = Math.cos(o.heading), s = -Math.sin(o.heading), pts = [{ id: OGRE.id, pos: [o.x, o.y, -o.depth], heading: o.heading, speed: o.speed, zone: "hull" }];
    for (const z of ZONES) if (o.zones[z.name] > 0) pts.push({ id: z.id, pos: [o.x + z.at * c, o.y + z.at * s, -o.depth], heading: o.heading, speed: o.speed, zone: z.name });
    return pts;
}
/** Which phase the hull is in: 1, 2 (under 50%) or 3 (under 20%, berserk). */
export const phaseOf = (hull) => (hull < OGRE.phase3 * OGRE.hull ? 3 : hull < OGRE.phase2 * OGRE.hull ? 2 : 1);

/**
 * Fight one level. `sides` is a list of FRESH side objects { tactics, pilot } (one per defender; subTournament's makeSide(...).side()). Options: { seconds, dt, actuators, model, trace (an array pushed a frame every
 * TRACE_EVERY ticks: { tick, boats: [{ id, x, y, depth, heading, pitch, hp, alive, ammo }], torps: [{ id, owner, x, y, depth }], ogre: { x, y, depth, heading, speed, hull, surfaced, phase, zones: { tubes, sonar, cannon, engine } },
 * escorts: [{ id, x, y, depth, hp }], hq: hp, probes: [{ id, x, y, depth }], fix: null | { x, y, sources, spanDeg } }), squad (null, or { probes: [boat indices that carry probes], spread, radius }: the defenders spread, share what they hear and send probes out: brain/subSquad.mjs), start ({ hull, zones, hq, loud (dB over a boat of the same speed: the OGRE's noise, 10 by default; a quiet one is harder to find) }: a damaged OGRE or headquarters to begin with: a test, or a handicap) }. Returns { outcome, score, hull (left), hq (left), hullDamage (fraction), lost, fates, fired, hits, zones (what is left), phase, escorts (launched), ticks, events, seed, fingerprint }.
 */
export function fight(sides, sc, { seconds = SECONDS, dt = DT, actuators = null, model = seaModel(), trace = null, start = {}, squad = null } = {}) {
    if (!Array.isArray(sides) || sides.length !== sc.n) throw new Error(`seaOgre.fight: ${sc.n} defenders in the scenario, ${Array.isArray(sides) ? sides.length : 0} sides`);
    const total = Math.round(seconds / dt), seed = sc.seed, events = [], O = OGRE, loud = Number.isFinite(start.loud) ? start.loud : O.loudBonus;
    const sq = squad ? createSquad(sc.n, { axis: Math.atan2(-sc.ogre.pos[1], sc.ogre.pos[0]), ...squad }) : null, probesOf = (i) => (sq && sq.config.probes.includes(i) ? SQUAD.probesPerBoat : 0);
    const boats = sides.map((sd, i) => { const st = sc.defenders[i];
        return { id: i + 1, state: S.createState({ depth: st.depth, pos: [st.pos[0], st.pos[1], -st.depth], speed: st.speed, heading: st.heading, model }), tactics: sq ? sq.wrap(i, sd.tactics) : sd.tactics, pilot: sd.pilot, probes: probesOf(i), act: actuators ? createActuators(actuators) : null,
            hp: HP, ammo: AMMO, cooldown: 0, target: { depth: st.depth, heading: st.heading, speed: st.speed }, alive: true, fate: "afloat", echoes: [], pings: [], fired: 0, hits: 0 }; });
    const og = { x: sc.ogre.pos[0], y: sc.ogre.pos[1], depth: O.subDepth, heading: sc.ogre.heading, speed: O.speed, hull: Number.isFinite(start.hull) ? start.hull : O.hull, zones: { ...Object.fromEntries(ZONES.map((z) => [z.name, z.hp])), ...(start.zones || {}) }, cycle: 0, fireIn: Math.round(2 * 30), cannonIn: 0, escortIn: Math.round(O.escortEvery / dt), contact: null };
    const escorts = [], torps = []; let probesSent = 0; let hq = Number.isFinite(start.hq) ? start.hq : HQ_HP, nextTorp = 1, nextEscort = 1, launched = 0, h = 0x811c9dc5, flown = 0, outcome = "holdout", ogreFired = 0;
    const plat = (b) => K.platformOf(b.state), att = (b) => S.attitude(b.state);
    const ogrePlat = () => ({ pos: [og.x, og.y, -og.depth], heading: og.heading, speed: og.speed });
    const surfaced = () => og.cycle >= O.subTicks;
    const alive = () => boats.filter((b) => b.alive);

    for (let tick = 0; tick < total; tick++) {
        const phase = phaseOf(og.hull), standing = (n) => og.zones[n] > 0;
        // ---- the defenders' looks: they hear the OGRE and the escorts (never each other) and the enemy torpedoes ----
        for (const b of boats) {
            if (!b.alive || (tick + STAGGER * b.id) % LOOK_EVERY !== 0) continue;
            const a = att(b), me = plat(b), contacts = [];
            const oc = K.listen(me, ogrePlat(), { seed, tick, channel: b.id, sl: K.sourceLevel(og.speed) + loud }); if (oc) { contacts.push({ kind: "boat", bearing: oc.bearing, elevation: oc.elevation, snr: oc.snr }); if (sq) sq.report({ id: "b" + b.id, x: b.state.pos[0], y: b.state.pos[1] }, wrap(a.heading + oc.bearing), tick * dt); }
            for (const e of escorts) { const c = K.listen(me, { pos: [e.x, e.y, -e.depth], heading: e.heading, speed: O.escortSpeed }, { seed, tick, channel: b.id + 40 + e.id }); if (c) contacts.push({ kind: "boat", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); }
            for (const t of torps) { if (t.status !== "running" || t.owner !== O.id) continue; const c = K.listen(me, Tp.platformOf(t), { seed, tick, channel: b.id + 10 + t.id, sl: K.SONAR.torpedoSL }); if (c) contacts.push({ kind: "torpedo", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); }
            const obs = { t: tick * dt, self: { depth: a.depth, heading: a.heading, speed: a.speed, x: b.state.pos[0], y: b.state.pos[1], hp: b.hp, ammo: b.ammo, ready: b.cooldown <= 0 && b.ammo > 0, ...(sq ? { probes: b.probes } : {}) }, contacts, echoes: b.echoes, pings: b.pings };
            b.echoes = []; b.pings = [];
            const cmd = b.tactics(obs) || {};
            b.target = { depth: clamp(Number.isFinite(cmd.depth) ? cmd.depth : a.depth, 12, 45), heading: Number.isFinite(cmd.heading) ? cmd.heading : a.heading, speed: clamp(Number.isFinite(cmd.speed) ? cmd.speed : a.speed, 0.3, 4.5) };
            if (cmd.fire === true && b.ammo > 0 && b.cooldown <= 0) { torps.push(Tp.launch(b.id, { pos: b.state.pos, heading: a.heading, pitch: a.pitch }, { id: nextTorp++ })); b.ammo--; b.fired++; b.cooldown = RELOAD_TICKS; events.push({ tick, type: "fire", boat: b.id }); }
            if (cmd.probe === true && sq && b.probes > 0) {   // a probe, dropped SQUAD.probeAhead m along the nose at the boat's depth
                b.probes--; probesSent++; const px = b.state.pos[0] + SQUAD.probeAhead * Math.cos(a.heading), py = b.state.pos[1] - SQUAD.probeAhead * Math.sin(a.heading);
                sq.addProbe({ id: "p" + probesSent, x: px, y: py, depth: a.depth, t0: tick * dt, boat: b.id }); events.push({ tick, type: "probe", boat: b.id });
            }
            if (cmd.ping === true) {
                events.push({ tick, type: "ping", boat: b.id });
                const e = K.ping(me, ogrePlat(), { seed, tick, channel: b.id }); if (e) b.echoes.push({ bearing: e.bearing, elevation: e.elevation, range: e.range });
            }
        }
        // ---- the probes: stationary hydrophones, each listening at 2 Hz and reporting to the datalink ----
        if (sq && tick % LOOK_EVERY === 3) for (const [k, p] of sq.liveProbes(tick * dt).entries()) {
            const c = K.listen({ pos: [p.x, p.y, -p.depth], heading: 0, speed: 0.5 }, ogrePlat(), { seed, tick, channel: 70 + k, sl: K.sourceLevel(og.speed) + loud, di: SQUAD.probeDi });
            if (c) sq.report({ id: p.id, x: p.x, y: p.y }, wrap(c.bearing), tick * dt);
        }
        // ---- the OGRE: sonar (every 15th tick), steering, the cycle, the guns ----
        og.cycle = (og.cycle + 1) % (O.subTicks + O.surfTicks);
        const wantDepth = surfaced() ? O.surfDepth : O.subDepth;
        og.depth += clamp(wantDepth - og.depth, -2.0 * dt, 2.0 * dt);   // 2 m/s up or down: the 10 m between the two depths takes five seconds
        const berserk = phase === 3, vmax = O.speed * (berserk ? O.berserkSpeed : 1) * (standing("engine") ? 1 : O.crawl);
        og.speed += clamp(vmax - og.speed, -0.5 * dt, 0.5 * dt);
        const goal = Math.atan2(og.y, -og.x), turn = clamp(wrap(goal - og.heading), -O.turnRate * dt, O.turnRate * dt);
        og.heading = wrap(og.heading + turn); og.x += og.speed * Math.cos(og.heading) * dt; og.y -= og.speed * Math.sin(og.heading) * dt;
        if (tick % LOOK_EVERY === 0) {   // the OGRE's own look: the nearest defender it hears, if its sonar stands
            og.contact = null;
            if (standing("sonar")) {
                const me = { pos: [og.x, og.y, -og.depth], heading: og.heading, speed: 0.5 }; let best = null;
                for (const b of alive()) { const c = K.listen(me, plat(b), { seed, tick, channel: 90 + b.id, di: O.sonarDi }); if (c && (!best || c.snr > best.snr)) best = { c, b }; }
                if (best) { const g = K.geometry(me, plat(best.b)); og.contact = { absolute: wrap(og.heading + best.c.bearing), elevation: best.c.elevation, range: g.range, snr: best.c.snr }; }
            }
        }
        if (og.fireIn > 0) og.fireIn--;
        if (!surfaced() && og.depth >= O.subDepth - 2 && og.fireIn <= 0 && standing("tubes") && og.contact && og.contact.range <= O.fireRange) {
            torps.push(Tp.launch(O.id, { pos: [og.x + 20 * Math.cos(og.heading), og.y - 20 * Math.sin(og.heading), -og.depth], heading: og.contact.absolute, pitch: clamp(og.contact.elevation, -0.5, 0.5) }, { id: nextTorp++ }));
            og.fireIn = Math.round((berserk ? O.berserkFireEvery : O.fireEvery) / dt); ogreFired++; events.push({ tick, type: "ogre-fire" });
        }
        if (og.cannonIn > 0) og.cannonIn--;
        if (surfaced() && og.depth <= O.surfDepth + 2 && standing("cannon") && og.cannonIn <= 0 && Math.hypot(og.x, og.y) <= O.cannonRange) { hq = Math.max(0, hq - O.cannonDamage); og.cannonIn = Math.round(O.cannonEvery / dt); events.push({ tick, type: "shell", hq }); }
        if (phase >= 2) {   // the escorts
            if (og.escortIn > 0) og.escortIn--;
            if (og.escortIn <= 0 && escorts.length < O.escortMax) { escorts.push({ id: nextEscort++, x: og.x, y: og.y, depth: 20, heading: og.heading, hp: O.escortHp, ttl: Math.round(O.escortTtl / dt) }); launched++; og.escortIn = Math.round(O.escortEvery / dt); events.push({ tick, type: "escort", id: nextEscort - 1 }); }
        }
        for (const e of escorts) {   // a hunter: it steers for the nearest defender at 3 m/s and bursts on it
            e.ttl--; const near = alive().reduce((q, b) => { const d = Math.hypot(b.state.pos[0] - e.x, b.state.pos[1] - e.y, -b.state.pos[2] - e.depth); return !q || d < q.d ? { b, d } : q; }, null);
            if (!near) continue;
            const dx = near.b.state.pos[0] - e.x, dy = near.b.state.pos[1] - e.y, want = Math.atan2(-dy, dx);
            e.heading = wrap(e.heading + clamp(wrap(want - e.heading), -0.3 * dt, 0.3 * dt)); e.x += O.escortSpeed * Math.cos(e.heading) * dt; e.y -= O.escortSpeed * Math.sin(e.heading) * dt;
            e.depth += clamp(-near.b.state.pos[2] - e.depth, -1 * dt, 1 * dt);
            if (near.d <= O.escortBurst) { near.b.hp = Math.max(0, near.b.hp - O.escortDamage); e.ttl = 0; events.push({ tick, type: "burst", boat: near.b.id, damage: O.escortDamage }); if (near.b.hp <= 0 && near.b.alive) { near.b.alive = false; near.b.fate = "sunk"; events.push({ tick, type: "loss", boat: near.b.id, why: "sunk" }); } }
        }
        for (let i = escorts.length - 1; i >= 0; i--) if (escorts[i].ttl <= 0 || escorts[i].hp <= 0) escorts.splice(i, 1);
        // ---- the hulls ----
        for (const b of boats) {
            if (!b.alive) continue;
            const ctl = b.pilot(b.state, b.target, [0, 0, 0]), res = S.stepSub(model, b.state, b.act ? b.act.step(ctl, dt) : ctl, dt);
            b.state = res.state; if (b.cooldown > 0) b.cooldown--;
            if (res.status !== "submerged") { b.alive = false; b.fate = res.status; events.push({ tick, type: "loss", boat: b.id, why: res.status }); }
        }
        // ---- the torpedoes: the defenders' go for the OGRE's points and the escorts; the OGRE's for the defenders ----
        const defTargets = alive().map((b) => ({ id: b.id, pos: b.state.pos, heading: att(b).heading, speed: att(b).speed }));
        const foeTargets = [...ogrePoints(og), ...escorts.map((e) => ({ id: 800 + e.id, pos: [e.x, e.y, -e.depth], heading: e.heading, speed: O.escortSpeed }))];
        for (let i = 0; i < torps.length; i++) {
            if (torps[i].status !== "running") continue;
            const theirs = torps[i].owner === O.id, r = Tp.stepTorpedo(torps[i], theirs ? defTargets : foeTargets, { dt, tick, seed, floor: model.spec.seabed }); torps[i] = r.torpedo;
            if (!r.event) continue;
            const id = r.event.target, dmg = r.event.damage;
            if (theirs) {
                const v = boats.find((b) => b.id === id); v.hp = Math.max(0, v.hp - dmg); events.push({ tick, type: "hit", boat: 0, target: id, damage: dmg });
                if (v.hp <= 0 && v.alive) { v.alive = false; v.fate = "sunk"; events.push({ tick, type: "loss", boat: v.id, why: "sunk" }); }
            } else {
                const owner = boats.find((b) => b.id === torps[i].owner); owner.hits++;
                if (id >= 800 && id < 900) { const e = escorts.find((q) => 800 + q.id === id); if (e) { e.hp -= dmg; events.push({ tick, type: "hit", boat: owner.id, target: id, damage: dmg }); } }
                else {
                    const z = ZONES.find((q) => q.id === id);
                    if (z) { og.zones[z.name] = Math.max(0, og.zones[z.name] - dmg); og.hull = Math.max(0, og.hull - O.spill * dmg); events.push({ tick, type: "hit", boat: owner.id, target: id, damage: dmg, zone: z.name, gone: og.zones[z.name] <= 0 }); }
                    else { og.hull = Math.max(0, og.hull - dmg); events.push({ tick, type: "hit", boat: owner.id, target: id, damage: dmg, zone: "hull" }); }
                }
            }
        }
        flown++;
        if (trace && tick % TRACE_EVERY === 0) trace.push({ tick, boats: boats.map((b) => { const a = att(b); return { id: b.id, x: b.state.pos[0], y: b.state.pos[1], depth: a.depth, heading: a.heading, pitch: a.pitch, hp: b.hp, alive: b.alive, ammo: b.ammo }; }), torps: torps.filter((q) => q.status === "running").map((q) => ({ id: q.id, owner: q.owner, x: q.pos[0], y: q.pos[1], depth: -q.pos[2] })),
            ogre: { x: og.x, y: og.y, depth: og.depth, heading: og.heading, speed: og.speed, hull: og.hull, surfaced: surfaced(), phase: phaseOf(og.hull), zones: { ...og.zones } }, escorts: escorts.map((e) => ({ id: e.id, x: e.x, y: e.y, depth: e.depth, hp: e.hp })), hq, probes: sq ? sq.liveProbes(tick * dt).map((p) => ({ id: p.id, x: p.x, y: p.y, depth: p.depth })) : [], fix: sq ? sq.fix(tick * dt) : null });
        if (tick % 30 === 0) { for (const c of [og.x, og.y, og.depth, og.hull, hq]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff); for (const b of boats) for (const c of b.state.pos) h = foldHash(h, Math.round(c * 1000) & 0xffffffff); }
        if (og.hull <= 0) { outcome = "defended"; break; }
        if (hq <= 0 || Math.hypot(og.x, og.y) <= O.breachRange) { outcome = "breached"; break; }
    }
    const lost = boats.filter((b) => !b.alive).length, frac = 1 - og.hull / O.hull, left = 1 - flown / total;
    const score = frac + (outcome === "defended" ? 1 + 0.5 * left : 0) - (outcome === "breached" ? 1 : 0) - 0.15 * lost;
    return { outcome, score, hull: og.hull, hq, hullDamage: frac, lost, fates: boats.map((b) => b.fate), fired: boats.map((b) => b.fired), hits: boats.map((b) => b.hits), ogreFired, zones: { ...og.zones }, phase: phaseOf(og.hull), escorts: launched, probes: probesSent, squad: !!sq, ticks: flown, events, seed, n: sc.n, fingerprint: (h >>> 0).toString(16) };
}
