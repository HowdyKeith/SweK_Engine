// WebGLEngine/brain/ogreSubBridge.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BRIDGE FROM THE SUB BRAINS TO THE VOXEL OGRE WORLD (route two of the Sea OGRE). simulation/OgreScenario.js has always had defender submarines launched from the dock in the sea environment (round 112): a point
// that walks at the OGRE at 9 u/s, surfaces its periscope, fires one straight torpedo and dives. This module lets the SAME entries be flown by the brains of brain/subTournament.mjs instead -- a hand tactician or a
// tuned doctrine, with the PD autopilot or the connectome-wired network under it -- through the real 6-DOF hull of physics/mechanics/subModel6dof.mjs and the sonar of subSonar.mjs.
//
//   THE MAPPING   the voxel world is small and fast and the sub model is large and slow, so the bridge scales both: ONE UNIT IS `metresPerUnit` METRES (4) and ONE VOXEL SECOND IS `timeScale` BRAIN SECONDS (4). A boat
//                 cruising at 2 m/s therefore covers 2 x 4 / 4 = 2 u/s of the world. Brain (x, y) = (x_u, z_u) x metresPerUnit, depth is the brain's own (12..45 m) and is NOT drawn (the entity stays a periscope on the
//                 surface, as before). A brain heading h points the voxel direction (cos h, -sin h) in (x, z): the engine's heading, 0 = +x, a right turn increases it. Each voxel tick the bridge runs
//                 round(dt x timeScale / DT) brain ticks (DT = 1/30), never fewer than one.
//   WHAT A BRAIN HEARS   the OGRE (a boat at 2.3 m/s plus 10 dB: loud, as in brain/seaOgre.mjs), any hostile sub of the world's list, and the world's torpedoes (class `torpedo`, the 125 dB screw) -- each through
//                 subSonar.listen, at 2 Hz of brain time, staggered per boat. Never the other defenders (the same IFF filter as seaOgre.mjs). It is told its own position (a perfect fix: said plainly) and hit points.
//   WHAT A BRAIN DOES   `step` returns the new voxel position, the heading, the brain depth, and `fire`: null or the unit voxel direction { dx, dz } along the NOSE at the moment the tactician fired (six
//                 torpedoes, a 10 s reload in BRAIN time). The scenario fires its own straight torpedo that way, and the world's own damage decides what it hits: a brain that cannot point its nose cannot shoot.
//   THE SQUAD   with `squad: { n, probes: [indices], hq }` the boats of one bridge spread on stations across the OGRE's approach, share a fix over the datalink and send stationary probes, exactly as in brain/subSquad.mjs (and
//                 the same limits); a probe is NOT drawn in the voxel world (`bridge.probes(t)` lists them for a page that would).
//   WHAT IT IS NOT: the world's torpedoes are not homing (the arena's are); the boat's depth is not in the voxel world; hit points are the entry's own (the bridge only reads them); and it is route two of the
//   level only in so far as the DEFENDER SUBS are brains -- the OGRE and its hardpoints are still the voxel game's. Said plainly.
// Pure: no DOM, no Math.random, no clock.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as K from "../physics/mechanics/subSonar.mjs";
import { createActuators } from "../physics/mechanics/subActuators.mjs";
import { createSquad, SQUAD } from "./subSquad.mjs";

export const BRIDGE = Object.freeze({ metresPerUnit: 4, timeScale: 4, lookEvery: 15, stagger: 7, ammo: 6, reloadTicks: 300, loudBonus: 10, ogreSpeed: 2.3, torpSpeed: 6.5, startDepth: 22, depthLo: 12, depthHi: 45, maxSteps: 40 });
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
let MODEL = null;
const hullModel = () => MODEL || (MODEL = S.createSubModel());

/**
 * A bridge. `sideFactory` makes a FRESH { tactics, pilot } per boat (subTournament.makeSide(...).side). Options: { metresPerUnit, timeScale, seed, actuators (a rate set), model }.
 * Returns { spawn(entry, world), step(entry, dt, world), drop(entry), cfg, boats: () => count }. A boat is stored on the entry as `entry.brain`.
 */
export function createBridge(sideFactory, { metresPerUnit = BRIDGE.metresPerUnit, timeScale = BRIDGE.timeScale, seed = 1, actuators = null, model = hullModel(), squad = null } = {}) {
    if (typeof sideFactory !== "function") throw new Error("ogreSubBridge.createBridge: a side factory is needed (subTournament.makeSide(...).side)");
    const M = metresPerUnit, cfg = Object.freeze({ metresPerUnit: M, timeScale, seed });
    let nextId = 1, sq = null, spawned = 0, probeCount = 0;   // `squad` ({ n: boats to a squad (2), probes: [indices that carry probes], hq: [x, z] in units }): the defenders spread, share and send probes, as in brain/subSquad.mjs; built at the first spawn from where the OGRE is
    const inWorld = (x, z) => [x * M, z * M];
    const toBrain = (p, depth) => [p.x * M, p.z * M, -depth];

    /** Put a brain in the entry (an object with x and z in units): it starts at the entry, nose toward the OGRE, 2 m/s at 22 m. */
    function spawn(entry, world) {
        const id = nextId++, o = world && world.ogre ? world.ogre : { x: entry.x, z: entry.z }, heading = Math.atan2(-(o.z - entry.z), o.x - entry.x), side = sideFactory(), [bx, by] = inWorld(entry.x, entry.z);
        const state = S.createState({ depth: BRIDGE.startDepth, pos: [bx, by, -BRIDGE.startDepth], speed: 2, heading, model });
        const index = spawned++ % ((squad && squad.n) || 2);
        if (squad && !sq) { const hq = squad.hq || [entry.x, entry.z]; sq = createSquad((squad.n || 2), { axis: Math.atan2(-(o.z - hq[1]), o.x - hq[0]), hq: [hq[0] * M, hq[1] * M], ...squad, probes: squad.probes || [] }); }
        entry.brain = { id, index, probes: squad && sq && sq.config.probes.includes(index) ? SQUAD.probesPerBoat : 0, state, tactics: sq ? sq.wrap(index, side.tactics) : side.tactics, pilot: side.pilot, act: actuators ? createActuators(actuators) : null, tick: 0, ammo: BRIDGE.ammo, cooldown: 0, fired: 0, echoes: [], pings: [], alive: true, status: "submerged",
            target: { depth: BRIDGE.startDepth, heading, speed: 2 }, heading, depth: BRIDGE.startDepth, lastCmd: null };
        return entry.brain;
    }
    const drop = (entry) => { entry.brain = null; };

    /**
     * One VOXEL tick of `dt` seconds. `world`: { ogre: { x, z }, hostiles: [{ x, z }], torps: [{ x, z }] } in units; `entry.hp` / `entry.maxHp` (default 30) are read for the tactician's gauge.
     * Returns { x, z, heading, depth, fire (null | { dx, dz }), ping, alive, status, steps }. A boat that is lost (the floor, the surface, the crush depth) has alive false and no further effect.
     */
    function step(entry, dt, world) {
        const b = entry.brain; if (!b) throw new Error("ogreSubBridge.step: the entry has no brain (spawn it first)");
        if (!b.alive) return { x: entry.x, z: entry.z, heading: b.heading, depth: b.depth, fire: null, ping: false, alive: false, status: b.status, steps: 0 };
        const steps = clamp(Math.round(dt * timeScale / S.DT), 1, BRIDGE.maxSteps), hpFrac = clamp((entry.hp ?? 30) / (entry.maxHp || 30), 0, 1);
        let fire = null, ping = false;
        for (let i = 0; i < steps && b.alive; i++, b.tick++) {
            if ((b.tick + BRIDGE.stagger * b.id) % BRIDGE.lookEvery === 0) {
                const a = S.attitude(b.state), me = K.platformOf(b.state), contacts = [], ch = (c) => c + seed * 7;
                const og = world && world.ogre;
                const clock = world && Number.isFinite(world.t) ? world.t : b.tick * S.DT;   // one clock for the squad: the world's (brain seconds), else this boat's own
                if (og) { const c = K.listen(me, { pos: toBrain(og, 20), heading: 0, speed: BRIDGE.ogreSpeed }, { seed, tick: b.tick, channel: ch(b.id), sl: K.sourceLevel(BRIDGE.ogreSpeed) + BRIDGE.loudBonus }); if (c) { contacts.push({ kind: "boat", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); if (sq) sq.report({ id: "b" + b.id, x: b.state.pos[0], y: b.state.pos[1] }, Math.atan2(Math.sin(a.heading + c.bearing), Math.cos(a.heading + c.bearing)), clock); }
                    if (sq) for (const [k, p] of sq.liveProbes(clock).entries()) { const pc = K.listen({ pos: [p.x, p.y, -p.depth], heading: 0, speed: 0.5 }, { pos: toBrain(og, 20), heading: 0, speed: BRIDGE.ogreSpeed }, { seed, tick: b.tick, channel: ch(70 + k), sl: K.sourceLevel(BRIDGE.ogreSpeed) + BRIDGE.loudBonus, di: SQUAD.probeDi }); if (pc) sq.report({ id: p.id, x: p.x, y: p.y }, pc.bearing, clock); } }
                (world && world.hostiles || []).forEach((h, k) => { const c = K.listen(me, { pos: toBrain(h, 20), heading: 0, speed: 3 }, { seed, tick: b.tick, channel: ch(b.id + 40 + k) }); if (c) contacts.push({ kind: "boat", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); });
                (world && world.torps || []).forEach((q, k) => { const c = K.listen(me, { pos: toBrain(q, 20), heading: 0, speed: BRIDGE.torpSpeed }, { seed, tick: b.tick, channel: ch(b.id + 10 + k), sl: K.SONAR.torpedoSL }); if (c) contacts.push({ kind: "torpedo", bearing: c.bearing, elevation: c.elevation, snr: c.snr }); });
                const obs = { t: clock, self: { depth: a.depth, heading: a.heading, speed: a.speed, x: b.state.pos[0], y: b.state.pos[1], hp: hpFrac * 100, ammo: b.ammo, ready: b.cooldown <= 0 && b.ammo > 0, ...(sq ? { probes: b.probes } : {}) }, contacts, echoes: b.echoes, pings: b.pings };
                b.echoes = []; b.pings = [];
                const cmd = b.tactics(obs) || {}; b.lastCmd = cmd;
                b.target = { depth: clamp(Number.isFinite(cmd.depth) ? cmd.depth : a.depth, BRIDGE.depthLo, BRIDGE.depthHi), heading: Number.isFinite(cmd.heading) ? cmd.heading : a.heading, speed: clamp(Number.isFinite(cmd.speed) ? cmd.speed : a.speed, 0.3, 4.5) };
                if (cmd.fire === true && b.ammo > 0 && b.cooldown <= 0) { b.ammo--; b.fired++; b.cooldown = BRIDGE.reloadTicks; fire = { dx: Math.cos(a.heading), dz: -Math.sin(a.heading) }; }
                if (cmd.probe === true && sq && b.probes > 0) { b.probes--; probeCount++; sq.addProbe({ id: "p" + probeCount, x: b.state.pos[0] + SQUAD.probeAhead * Math.cos(a.heading), y: b.state.pos[1] - SQUAD.probeAhead * Math.sin(a.heading), depth: a.depth, t0: clock, boat: b.id }); }
                if (cmd.ping === true && og) { ping = true; const e = K.ping(me, { pos: toBrain(og, 20), heading: 0, speed: BRIDGE.ogreSpeed }, { seed, tick: b.tick, channel: ch(b.id) }); if (e) b.echoes.push({ bearing: e.bearing, elevation: e.elevation, range: e.range }); }
            }
            const ctl = b.pilot(b.state, b.target, [0, 0, 0]), res = S.stepSub(model, b.state, b.act ? b.act.step(ctl, S.DT) : ctl, S.DT);
            b.state = res.state; if (b.cooldown > 0) b.cooldown--;
            if (res.status !== "submerged") { b.alive = false; b.status = res.status; }
        }
        const a = S.attitude(b.state); b.heading = a.heading; b.depth = a.depth;
        entry.x = b.state.pos[0] / M; entry.z = b.state.pos[1] / M;
        return { x: entry.x, z: entry.z, heading: a.heading, depth: a.depth, fire, ping, alive: b.alive, status: b.status, steps };
    }
    /** The live probes at the world's clock t (brain seconds), in UNITS: [{ id, x, z, depth }] -- for a page that wants to draw them. */
    const probesAt = (t) => (sq ? sq.liveProbes(t).map((p) => ({ id: p.id, x: p.x / M, z: p.y / M, depth: p.depth })) : []);
    return { spawn, step, drop, cfg, brainsMade: () => nextId - 1, probes: probesAt, probesSent: () => probeCount, squad: () => sq };
}
