// WebGLEngine/brain/raceLockstep.mjs -- v4822
//
// THE RACE AS A LOCKSTEP SESSION: physics/box3dLockstepNet.js's transport (input delay, redundant input, per-tick hash exchange, the engine announced as part
// of the protocol) driving the race with gunners -- the cars, the turrets, the shells, the slicks, the pickups and, with `city`, the real city and the
// building blocks that fall out of it -- instead of the flight sandbox's ships.
//
// Each peer OWNS some of the cars. For a tick it asks the policies what its cars would do (createRace's propose(): the raw throttle/steer/brake and the
// gun's yaw/pitch/fire/drop/ignite), sends that AHEAD by the input delay, and steps the shared race only when it holds every peer's commands for the tick.
// Every peer -- the owner too -- steps the commands that came over the wire, never its own local answer, which is the replay path
// (raceWithGunners's inputsLog, replayGunners) with the log arriving live. So the commands the peers agreed on ARE a replay log: fed to
// replayGunners they reach the same fingerprint, which is how the gate ties this session to the contract the tree already holds.
//
// The session contract is box3dLockstep.js's (submitInputs / ready / tryStep / checkPeerHash / tick / localHash / desync), so createLockstepNet runs it
// unchanged. What this adds over the ship session: the state hash is createRace's RUNNING fingerprint (it folds the whole history, so a divergence
// stays visible at every tick after it), a peer hash that arrives BEFORE we have stepped that tick is kept and compared when we do (the ship session drops
// it, and finds the desync a tick later), and the timestep is the race's own and locked (a peer stepping another dt diverges on the first tick).
//
// What it is NOT: a netcode for a game. It is the determinism claim made falsifiable across processes and machines -- the policies are deterministic, so
// the exchange of their commands is, today, a proof that nothing in the race depends on the clock, the frame rate, the call order or a Math.random, not a
// need. A human at the wheel of one car is the same wire with a different propose().
"use strict";
import { createRace } from "./gunnerPolicy.mjs";
import { createLockstepNet } from "../physics/box3dLockstepNet.js";
import * as C from "../physics/raceCar.mjs";

/** The command a car gets when no peer owns it: coast, aim nowhere, fire nothing. */
export const NEUTRAL = Object.freeze({ throttle: 0, steer: 0, brake: 0, yaw: 0, pitch: 0, fire: 0, drop: 0, ignite: 0 });

/**
 * One peer's session. opts: { worldFrom, drivers, gunners, peers, owner (carIndex -> peerId), seed, seconds, fleet, gap, shellSpeed, pickups, city, tamper, stopTick }.
 * `tamper(tick, rec)` is a gate's hook: it may change the commands THIS peer steps (not what it sent) to stand in for a real divergence.
 */
export function createRaceSession(opts) {
    const peers = [...opts.peers].sort(), owner = opts.owner, race = createRace(opts.worldFrom, opts.drivers, opts.gunners, opts);
    const inbuf = new Map(), localHashes = new Map(), pendingPeer = new Map(), log = [];
    let tick = 0, desync = null, staleDropped = 0, lockedDt = null;
    const ownedBy = (peerId) => race.cars.map((_, i) => i).filter((i) => owner[i] === peerId);

    function submitInputs(peerId, t, inputs) {
        if (t < tick) { staleDropped++; return false; }
        if (!inbuf.has(t)) inbuf.set(t, new Map());
        inbuf.get(t).set(peerId, inputs || []);
        return true;
    }
    // v4827 -- `stopTick`: the session never steps tick `stopTick` or later. One pump can step a dozen ticks it already holds the commands for, and a page that paces the race on a clock
    // would otherwise run past the end by a different number on each machine: the running fingerprint, the log and the results it prints at the finish are all of the tick it stopped on.
    const stopAt = opts.stopTick != null ? opts.stopTick : Infinity;
    const ready = (t = tick) => { if (t >= stopAt) return false; const m = inbuf.get(t); return !!m && peers.every((p) => m.has(p)); };
    function note(peerId, t, hash) {
        const local = localHashes.get(t);
        if (local == null) { pendingPeer.set(t + "/" + peerId, hash >>> 0); return true; }   // not stepped here yet: keep it, compare when we do
        if ((local >>> 0) !== (hash >>> 0)) { desync = desync || { tick: t, peer: peerId, local: local >>> 0, remote: hash >>> 0 }; return false; }
        return true;
    }
    function tryStep(dt = C.CAR.dt) {
        if (lockedDt === null) lockedDt = dt;
        else if (dt !== lockedDt) { const e = new Error("lockstep dt changed: session locked to " + lockedDt + ", got " + dt); e.code = "LOCKSTEP_DT_MISMATCH"; throw e; }
        if (dt !== C.CAR.dt) { const e = new Error("the race steps C.CAR.dt (" + C.CAR.dt + "); lockstep was handed " + dt); e.code = "LOCKSTEP_DT_MISMATCH"; throw e; }
        if (!ready(tick)) return null;
        const m = inbuf.get(tick), byCar = new Map();
        for (const p of peers) for (const c of (m.get(p) || [])) if (c && c.car != null) byCar.set(c.car, c);
        let rec = race.cars.map((_, i) => { const c = byCar.get(i); return c ? { throttle: c.throttle, steer: c.steer, brake: c.brake, yaw: c.yaw, pitch: c.pitch, fire: c.fire, drop: c.drop, ignite: c.ignite } : { ...NEUTRAL }; });
        if (opts.tamper) rec = opts.tamper(tick, rec) || rec;
        const r = race.step(rec); log.push(rec);
        localHashes.set(tick, r.hash);
        for (const p of peers) { const k = tick + "/" + p; if (pendingPeer.has(k)) { note(p, tick, pendingPeer.get(k)); pendingPeer.delete(k); } }
        const done = tick; inbuf.delete(tick); tick++;
        return { tick: done, hash: r.hash };
    }
    return {
        submitInputs, ready, tryStep, checkPeerHash: note,
        stepDt: () => lockedDt, stopTick: () => stopAt, staleDropped: () => staleDropped, pendingTicks: () => inbuf.size,
        get tick() { return tick; },
        localHash(t) { return localHashes.get(t == null ? tick - 1 : t); },
        desync() { return desync; },
        peers, race, log, ownedBy,
        /** the commands this peer's policies give for the cars it owns, from the state now: createLockstepNet's inputFn */
        inputFn: (selfId) => () => race.propose(ownedBy(selfId)),
        fingerprint: () => race.fingerprint,
    };
}

/**
 * One peer's session AND its transport. `send(msg)` puts a message on the wire to the other peers; the caller hands every message that arrives to
 * receive(msg) and calls pump() as often as it likes (a timer, an animation frame, a test's round). backendId is the engine's identity
 * (drivePolicy.machineFingerprint): peers whose engines differ halt before stepping rather than produce a desync that looks like a bug.
 * `inputFn(session)` (v4827) replaces what this peer's cars would command -- (tick) => the commands for the cars it owns -- with something else, which is how a human
 * takes the wheel (brain/racePlay.mjs): the wire is the same, only the author of the commands differs. Without it, session.inputFn(selfId): the policies.
 */
export function createRacePeer(opts) {
    const session = createRaceSession(opts);
    const net = createLockstepNet({ session, selfId: opts.selfId, inputFn: opts.inputFn ? opts.inputFn(session) : session.inputFn(opts.selfId), send: opts.send, inputDelay: opts.inputDelay != null ? opts.inputDelay : 4, dt: C.CAR.dt, backendId: opts.backendId || null, onBackendMismatch: opts.onBackendMismatch || null, redundancy: opts.redundancy });
    return { session, net, receive: net.receive, pump: net.pump };
}
