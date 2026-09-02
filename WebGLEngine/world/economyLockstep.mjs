// WebGLEngine/world/economyLockstep.mjs -- v4314 (Level 16)
//
// LEVEL 16: TWO BROWSERS, ONE UNIVERSE. The economy is deterministic from its seed and its journal (world/
// gitEconomy.mjs), so two peers that apply the same interventions at the same ticks trade identically -- and the
// state hash says so every tick. This module puts the economy behind the SAME lockstep contract the box3d physics
// uses (physics/box3dLockstepNet.js: inputs sent ahead by `inputDelay` ticks, redundancy against loss, a hash per
// tick checked against every peer's), so the transport work already gated for the physics carries the economy
// unchanged. An "input" here is a list of interventions; a tick with none is an empty list, which still has to
// arrive -- that is what keeps the peers in step rather than merely similar.
//
// ---- THE WIRE ---------------------------------------------------------------------------------------------------------
//
// The net is pure over send()/receive(). memoryWire() pairs two peers in one process with a HOSTILE option set --
// delay, reorder, duplicate, drop -- so the gate can prove the step survives a bad link; broadcastWire() is the
// same shape over a BroadcastChannel, which is how two TABS of orrery-gpu.html share one universe. A real WebRTC
// transport (ev/p2p.js) plugs in at the same two calls and is not gated here: the rig has the browsers, this
// sandbox has one.
"use strict";

import { createLockstepNet } from "../physics/box3dLockstepNet.js";

/**
 * The economy as a lockstep session: the contract createLockstepNet drives.
 *   submitInputs(peer, tick, inputs)  -- inputs: [{ kind, args }] interventions that peer wants applied at tick
 *   ready(tick)                        -- every peer has submitted for tick
 *   tryStep(dt)                        -- apply every peer's inputs at this tick (peers in name order), step, hash
 *   checkPeerHash(peer, tick, hash)    -- against our own hash for that tick; a mismatch is a recorded desync
 */
export function economySession(economy, { peers, keepHashes = 4096 } = {}) {
    if (!Array.isArray(peers) || !peers.length) throw new Error("economySession: needs the peer ids (including our own) -- a session that does not know who must speak cannot know when it is ready");
    const ids = [...peers].sort();
    const submitted = new Map();   // tick -> Map(peer -> inputs)
    const hashes = new Map();      // tick -> hash after stepping INTO that tick
    let desyncAt = null;
    const applied = [];            // { tick, peer, kind } for observers
    function submitInputs(peer, tick, inputs) {
        if (!ids.includes(peer)) throw new Error(`economySession: inputs from ${JSON.stringify(peer)}, who is not a peer of this session (${ids.join(", ")})`);
        if (tick < economy.tick) return false;                     // late for a tick already stepped: redundancy noise, not news
        let m = submitted.get(tick); if (!m) { m = new Map(); submitted.set(tick, m); }
        if (!m.has(peer)) m.set(peer, Array.isArray(inputs) ? inputs : []);   // first arrival wins; a duplicate says the same thing
        return true;
    }
    function ready(tick) { const m = submitted.get(tick); return !!m && ids.every((p) => m.has(p)); }
    function tryStep(dt) {
        const tick = economy.tick; if (!ready(tick)) return null;
        const m = submitted.get(tick);
        for (const p of ids) for (const iv of m.get(p)) { economy.intervene(iv.kind, iv.args || {}, tick); applied.push({ tick, peer: p, kind: iv.kind }); }
        economy.step(dt);
        const h = economy.hash(); hashes.set(economy.tick, h); submitted.delete(tick);
        if (hashes.size > keepHashes) hashes.delete(hashes.keys().next().value);
        return { tick: economy.tick, hash: h };
    }
    function checkPeerHash(peer, tick, hash) {
        const ours = hashes.get(tick); if (ours == null) return null;          // not there yet, or long gone
        const same = ours === hash;
        if (!same && (desyncAt == null || tick < desyncAt.tick)) desyncAt = { tick, peer, ours, theirs: hash };
        return same;
    }
    return { get tick() { return economy.tick; }, submitInputs, ready, tryStep, checkPeerHash, localHash: (t) => hashes.get(t) || null, desync: () => desyncAt, applied, peers: ids, economy };
}

/**
 * A peer: the economy behind the physics' lockstep net. `queue(kind, args)` is how a person intervenes -- it goes
 * out as this peer's input for a future tick and is applied by everyone at that tick. pump() advances as far as
 * every peer's inputs allow; a link that is late stalls the sim rather than forking it.
 */
export function makePeer({ economy, selfId, peers, send, inputDelay = 3, dt = 0.25, maxCatchup = 8 }) {
    const session = economySession(economy, { peers });
    const outbox = [];
    const net = createLockstepNet({ session, selfId, send, inputDelay, dt, maxCatchup, inputFn: () => outbox.splice(0, outbox.length) });
    return { session, net, selfId, peers: session.peers,
             queue(kind, args = {}) { outbox.push({ kind, args }); },
             receive: (msg) => net.receive(msg), pump: () => net.pump(), get tick() { return economy.tick; }, hash: () => economy.hash(),
             desync: () => session.desync(), lead: () => net.lead(), stepped: net.stepped, applied: session.applied };
}

/**
 * Two ends of one wire in one process. `hostile`: { delay: ticks of pump before delivery, reorder: swap adjacent
 * queued messages, duplicate: deliver twice, drop: fraction dropped (0..1, seeded) }. Every option is off by
 * default. deliver() moves what is due; a gate calls it between pumps.
 */
export function memoryWire(hostile = {}, seed = 1) {
    let s = (seed >>> 0) || 1; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ends = {}, queues = { a: [], b: [] };
    const stats = { sent: 0, delivered: 0, dropped: 0, duplicated: 0, reordered: 0 };
    let clock = 0;
    const make = (me, other) => ({
        send(msg) { stats.sent++; if (hostile.drop && rnd() < hostile.drop) { stats.dropped++; return; }
            const copies = hostile.duplicate ? 2 : 1; if (copies > 1) stats.duplicated++;
            for (let c = 0; c < copies; c++) queues[other].push({ at: clock + (hostile.delay || 0), msg: JSON.parse(JSON.stringify(msg)) }); },
        onMessage: null,
    });
    ends.a = make("a", "b"); ends.b = make("b", "a");
    function deliver() {
        clock++;
        for (const k of ["a", "b"]) {
            const q = queues[k];
            if (hostile.reorder && q.length > 1 && rnd() < 0.5) { const i = Math.floor(rnd() * (q.length - 1)); [q[i], q[i + 1]] = [q[i + 1], q[i]]; stats.reordered++; }
            const due = []; const rest = []; for (const e of q) (e.at <= clock ? due : rest).push(e); queues[k] = rest;
            for (const e of due) { stats.delivered++; if (ends[k].onMessage) ends[k].onMessage(e.msg); }
        }
    }
    return { a: ends.a, b: ends.b, deliver, stats, pending: () => queues.a.length + queues.b.length };
}

/**
 * Drive two peers over a memory wire for `ticks` ticks, delivering between pumps; `interventions` is
 * [{ atTick, peer: "a"|"b", kind, args }] -- queued on that peer once its sim reaches atTick (it applies a few
 * ticks later, when the net's input for that tick comes round on both sides). Returns the hashes both reached,
 * whether they agree at every tick both stepped, and the wire's stats. This is the whole lockstep claim in one
 * call, for the gate and for a page's self-test.
 */
export function runPair({ makeEconomy, hostile = {}, ticks = 200, interventions = [], inputDelay = 3, dt = 0.25, seed = 1 }) {
    const wire = memoryWire(hostile, seed);
    const A = makePeer({ economy: makeEconomy(), selfId: "a", peers: ["a", "b"], send: (m) => wire.a.send(m), inputDelay, dt });
    const B = makePeer({ economy: makeEconomy(), selfId: "b", peers: ["a", "b"], send: (m) => wire.b.send(m), inputDelay, dt });
    wire.a.onMessage = (m) => A.receive(m); wire.b.onMessage = (m) => B.receive(m);
    let pumps = 0, guard = 0;
    const todo = interventions.map((iv) => ({ ...iv, done: false }));
    while ((A.tick < ticks || B.tick < ticks) && guard++ < ticks * 50) {
        for (const iv of todo) { const P = iv.peer === "b" ? B : A; if (!iv.done && P.tick >= (iv.atTick || 0)) { P.queue(iv.kind, iv.args); iv.done = true; } }
        A.pump(); B.pump(); wire.deliver(); pumps++;
    }
    const upTo = Math.min(A.tick, B.tick);
    let agree = true, firstDiff = null;
    for (let t = 1; t <= upTo; t++) { const ha = A.session.localHash(t), hb = B.session.localHash(t); if (ha && hb && ha !== hb) { agree = false; firstDiff = t; break; } }
    return { a: A, b: B, wire, pumps, upTo, agree, firstDiff, desyncA: A.desync(), desyncB: B.desync(), stats: wire.stats, stalled: guard >= ticks * 50 };
}

/** A BroadcastChannel wire for two tabs on one origin: the same send/onMessage shape, nothing else. */
export function broadcastWire(name = "swek-universe") {
    if (typeof BroadcastChannel === "undefined") throw new Error("broadcastWire: no BroadcastChannel here");
    const ch = new BroadcastChannel(name);
    const w = { send: (msg) => ch.postMessage(msg), onMessage: null, close: () => ch.close() };
    ch.onmessage = (e) => { if (w.onMessage) w.onMessage(e.data); };
    return w;
}
