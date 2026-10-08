// WebGLEngine/brain/raceLockstepPeer.mjs -- v4681
//
// ONE PEER OF A RACE LOCKSTEP, OVER A REAL TRANSPORT, runnable the same in a browser and in node: it takes a `transport` (send / onMessage / onClose / close --
// a browser's WebSocket wrapped, or tools/ship/miniWs.mjs's client), the box3d wasm module it will race on, and its id; it waits for the relay's
// "room ready" (a message sent to a room nobody has joined is one the protocol never resends), pumps brain/raceLockstep.mjs's session until it has
// confirmed `seconds` of race, trades one final message with the other peer (tick, hash, and a desync if it saw one), and returns what it knows.
//
//   node tools/ship/lockstepPeer.mjs --relay ws://HOST:8799 --room NAME --peer A       (and --peer B on the other machine)
//
// THE STANDARD RACE (standardRace()) is the one every peer must agree on before they connect, or they will desync at tick 0 and say so: the track of seed 1,
// three cars (the hand driver, the hand driver at 0.8 speed, the zero driver) each with a hand gunner (the zero car's gun is the zero gunner), peer A owning
// cars 0 and 2 and peer B car 1, twelve seconds, the real city with a scripted demolition (the biggest building brought down by shells, the block that falls
// hit and chipped by one more, shattering when it rests). Nothing in it reads the clock, the frame rate or Math.random.
"use strict";
import { createRacePeer } from "./raceLockstep.mjs";
import * as G from "./gunnerPolicy.mjs";
import * as D from "./drivePolicy.mjs";
import * as BT from "../world/buildingTopple.mjs";
import * as C from "../physics/raceCar.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";

export const PEERS = Object.freeze(["A", "B"]);
/** The race both peers must be handed identically. A fresh demolition script per call (it keeps state). */
export function standardRace({ seconds = 12 } = {}) {
    let script = null;
    return {
        peers: [...PEERS], owner: { 0: "A", 1: "B", 2: "A" }, seed: 1, seconds,
        drivers: [D.handWeights(), D.handWeights({ speed: 0.8 }), D.zeroWeights()], gunners: [G.handWeights(), G.handWeights(), G.zeroWeights()],
        city: { script: (t, ctx) => { if (!script) script = BT.demolitionScript(ctx.cityCtx); script(t, ctx); } },
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one peer to the end. opts: { transport, peerId, box3dMod, seconds, tamperAt, engineId, inputDelay, joinTimeoutMs, runTimeoutMs, finTimeoutMs, onStatus }.
 * `keepLog` returns the commands the pair stepped (the replay log: raceWithGunners's inputsLog). `tamperAt` makes THIS peer step different commands at that tick (a gate's stand-in for a real divergence); `engineId` overrides the engine identity it announces.
 * Resolves { peerId, agree, reason, ticks, tick, hash, fleet, desync, halted, peerFin, rounds, ms } -- never rejects on a lockstep failure, only on a broken transport.
 */
export async function runRacePeer(opts) {
    const t0 = Date.now(), seconds = opts.seconds || 12, stopTick = Math.round(seconds / C.CAR.dt), selfId = opts.peerId, tr = opts.transport, status = opts.onStatus || (() => {});
    const fleet = opts.engineId || D.machineFingerprint(opts.box3dMod), cfg = standardRace({ seconds });
    const state = { ready: false, peers: null, closed: false, fin: new Map(), halt: null };
    tr.onMessage((text) => {
        let m; try { m = JSON.parse(text); } catch (e) { return; }
        if (m.t === "room") { if (m.ready) { state.ready = true; state.peers = m.peers; } if (m.left) state.left = m.left; if (m.error) state.error = m.error; return; }
        if (m.t === "fin") { state.fin.set(m.peer, m); return; }
        if (m.t === "halt") { state.halt = m; return; }
        if (peer) peer.receive(m);
    });
    tr.onClose(() => { state.closed = true; });
    let peer = null;
    const fail = (reason, extra = {}) => ({ peerId: selfId, agree: false, reason, fleet, ticks: stopTick, tick: peer ? peer.session.tick : 0, desync: peer ? peer.session.desync() : null, halted: peer ? peer.net.halted() : null, peerFin: null, ms: Date.now() - t0, ...extra });

    const tj = Date.now(); while (!state.ready && !state.error && !state.closed && Date.now() - tj < (opts.joinTimeoutMs || 60000)) await sleep(20);
    if (state.error) return fail("the relay refused: " + state.error);
    if (!state.ready) return fail(state.closed ? "the relay closed the connection before the room filled" : "the other peer did not join the room in time");

    peer = createRacePeer({
        selfId, peers: cfg.peers, owner: cfg.owner, worldFrom: () => worldFromModule(opts.box3dMod, [0, -9.81, 0]), drivers: cfg.drivers, gunners: cfg.gunners, seed: cfg.seed, seconds, fleet, city: cfg.city,
        send: (m) => { if (!state.closed) tr.send(JSON.stringify(m)); }, backendId: fleet, inputDelay: opts.inputDelay != null ? opts.inputDelay : 4,
        tamper: opts.tamperAt != null ? (tick, rec) => (tick === opts.tamperAt ? rec.map((r, i) => (i === 1 ? { ...r, throttle: r.throttle * 0.5 } : r)) : rec) : null,
    });
    const s = peer.session; let rounds = 0, lastStatus = 0;
    const tr0 = Date.now();
    while (s.tick < stopTick && !peer.net.halted() && !s.desync() && !state.halt && !state.closed && Date.now() - tr0 < (opts.runTimeoutMs || 120000)) {
        peer.pump(); rounds++;
        if (Date.now() - lastStatus > 250) { lastStatus = Date.now(); status({ tick: s.tick, of: stopTick, lead: peer.net.lead(), hash: s.localHash(s.tick - 1) }); }
        await sleep(0);
    }
    // what we leave behind: a desync or a halt is said to the other peer, which would otherwise wait for inputs that will never come
    const desync = s.desync(), halted = peer.net.halted(), hash = s.tick >= stopTick ? s.localHash(stopTick - 1) >>> 0 : s.tick ? s.localHash(s.tick - 1) >>> 0 : null;   // the hash AT the last race tick, so two peers' reports compare
    if (desync || halted) { tr.send(JSON.stringify({ t: "halt", peer: selfId, desync, halted: halted && halted.reason })); }
    else if (s.tick >= stopTick) tr.send(JSON.stringify({ t: "fin", peer: selfId, tick: stopTick - 1, hash: s.localHash(stopTick - 1) >>> 0 }));
    const out = (agree, reason, peerFin) => ({ peerId: selfId, agree, reason, fleet, ticks: stopTick, tick: s.tick, hash, hashHex: hash == null ? null : hash.toString(16).padStart(8, "0"), desync: s.desync(), halted: peer.net.halted(), peerFin: peerFin || null, rounds, ms: Date.now() - t0, log: opts.keepLog ? s.log.slice(0, stopTick) : undefined });
    if (halted) return out(false, "halted before stepping: " + halted.reason);
    if (desync) return out(false, "DESYNC at tick " + desync.tick + " against peer " + desync.peer + " (ours " + desync.local.toString(16) + ", theirs " + desync.remote.toString(16) + ")");
    if (state.halt) return out(false, "the other peer stopped: " + (state.halt.desync ? "it saw a desync at tick " + state.halt.desync.tick : state.halt.halted || "it halted"));
    if (s.tick < stopTick) return out(false, "the race did not finish: " + (state.closed ? "the connection closed" : "timed out") + " at tick " + s.tick + " of " + stopTick);
    // the other peers' final word, which may arrive after our own last step; keep pumping so the wire stays serviced
    const peersOther = cfg.peers.filter((p) => p !== selfId), tf = Date.now();
    while (peersOther.some((p) => !state.fin.has(p)) && !state.halt && !state.closed && !s.desync() && Date.now() - tf < (opts.finTimeoutMs || 30000)) { peer.pump(); await sleep(5); }
    if (s.desync()) return out(false, "DESYNC at tick " + s.desync().tick + " against peer " + s.desync().peer);
    if (state.halt) return out(false, "the other peer stopped: " + (state.halt.desync ? "it saw a desync at tick " + state.halt.desync.tick : "it halted"));
    const fins = peersOther.map((p) => state.fin.get(p));
    if (fins.some((f) => !f)) return out(false, "the other peer's final hash never arrived");
    const mine = s.localHash(stopTick - 1) >>> 0, bad = fins.find((f) => (f.hash >>> 0) !== mine);
    if (bad) return out(false, "the final fingerprints DISAGREE at tick " + bad.tick + ": ours " + mine.toString(16) + ", peer " + bad.peer + " " + (bad.hash >>> 0).toString(16), bad);
    return out(true, "agreed on every tick: " + stopTick + " ticks, final fingerprint " + mine.toString(16).padStart(8, "0"), fins[0]);
}
