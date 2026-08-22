// WebGLEngine/physics/box3dLockstep.js — v2271
//
// Cross-peer box3d lockstep for ES: every peer steps the SAME shared world from the SAME inputs, so a collision
// between my ship and your ship is resolved identically on both machines -- "we all watch the same pileup",
// not "each of us sees our own." This is the advanced mode owner-authoritative broadcast can't give.
//
// How it stays in sync:
//   1. Every peer registers the SAME ships in canonical id order, so box3d body indices match across machines.
//   2. Each tick, every peer broadcasts its OWNED ships' {turn,thrust}. A peer steps tick T only once it holds
//      ALL peers' inputs for T (the lockstep gate), then applies them in canonical ship order and steps once.
//   3. Because the shared engine is deterministic, identical inputs -> identical state; peers exchange stateHash per
//      tick and a mismatch is a desync.
//
// This module is the deterministic core (register / submit / gated-step / hash), testable headless against the
// planar fallback world; the transport (broadcasting inputs + hashes on the room bus) is the caller's net.

import { createESBox3D } from "./esBox3d.js";

export function createLockstepSession(opts = {}) {
    const peers = [...(opts.peers || [])].sort();               // canonical peer set (same on every machine)
    const adapter = createESBox3D(opts.world, { shipHalf: opts.shipHalf || 30 });
    const ships = [];                                            // canonical, sorted by id
    let tick = 0;
    const inbuf = new Map();      // tick -> Map(peerId -> [{shipId,turn,thrust}])
    const localHashes = new Map(); // tick -> hash
    let desync = null;

    function addShips(list) {
        const sorted = [...(list || [])].sort((a, b) => (a.ship.id < b.ship.id ? -1 : a.ship.id > b.ship.id ? 1 : 0));
        for (const { ship, owner, stats } of sorted) {
            ship._owner = owner;
            ship._bx = adapter.add(ship, stats);
            ships.push(ship);
        }
        return ships.length;
    }

    // v2493: refuse ticks we have already stepped. Nothing consumes them -- tryStep only ever looks at the CURRENT
    // tick, and inbuf.delete only fires on a step -- so before this they accumulated FOREVER on any wire that
    // reorders or retransmits. Measured: 50 dead ticks sitting complete in the buffer after stepping past them.
    // This became load-bearing the moment redundant input transmission was added, since that resends old ticks by
    // design. Returns whether it was taken, which is also how the leak is now testable at all.
    let staleDropped = 0;
    function submitInputs(peerId, t, inputs) {
        if (t < tick) { staleDropped++; return false; }
        if (!inbuf.has(t)) inbuf.set(t, new Map());
        inbuf.get(t).set(peerId, inputs || []);
        return true;
    }
    function ready(t = tick) { const m = inbuf.get(t); return !!m && peers.every((p) => m.has(p)); }

    // v3583 -- *** THE TIMESTEP IS PART OF THE LOCKSTEP CONTRACT AND NOTHING ENFORCED IT. ***
    // dt was a DEFAULT PARAMETER, so a peer that called tryStep() and a peer that called tryStep(1/60) both
    // looked correct and DIVERGED AT TICK 1 -- measured, immediately, with no error anywhere. Every other part
    // of this contract is guarded: inputs are gated on all peers arriving, ship order is canonical, hashes are
    // compared. THE ONE INPUT THAT IS NOT AN "INPUT" WAS THE ONE NOBODY CHECKED.
    //
    // *** AND IT IS WORTH SAYING WHAT v3573 DOES AND DOES NOT LICENSE, BECAUSE THE TWO CLAIMS WEAR ONE PHRASE. ***
    // That round proved exp(A*dt) carries the left half-plane onto the unit disc EXACTLY, so the unstable-mode
    // count survives discretisation at EVERY dt -- "the physics is the same at every dt" IN THE SENSE OF
    // STABILITY. Lockstep needs BIT-IDENTICAL TRAJECTORIES, a far stronger requirement that a dt mismatch
    // destroys on the first step. A STABLE SYSTEM AND A REPRODUCIBLE ONE ARE DIFFERENT PROPERTIES, and the
    // theorem that gives the first says nothing whatever about the second.
    //
    // The first step records dt; a later step with a different one THROWS rather than stepping, because null
    // already means "waiting for inputs" and a silent divergence at tick 1 is discovered as a desync forty
    // ticks later with nothing pointing back here.
    let lockedDt = null;

    // advance exactly one tick IFF all peers' inputs for the current tick are in. Returns {tick,hash} or null.
    function tryStep(dt = 1 / 30) {
        if (lockedDt === null) lockedDt = dt;
        else if (dt !== lockedDt) {
            const e = new Error("lockstep dt changed: session locked to " + lockedDt + ", got " + dt +
                                " -- peers stepping different timesteps diverge on the first step");
            e.code = "LOCKSTEP_DT_MISMATCH";
            throw e;
        }
        if (!ready(tick)) return null;
        const m = inbuf.get(tick);
        const inputFor = new Map();
        for (const p of peers) for (const inp of (m.get(p) || [])) if (inp && inp.shipId != null) inputFor.set(inp.shipId, inp);
        for (const ship of ships) {              // canonical order == same on every peer
            const inp = inputFor.get(ship.id) || { turn: 0, thrust: false };
            adapter.driveShip(ship._bx, { turn: inp.turn || 0, thrust: !!inp.thrust }, dt);
        }
        adapter.step(dt); adapter.sync();
        const hash = adapter.stateHash() >>> 0;
        localHashes.set(tick, hash);
        const done = tick; inbuf.delete(tick); tick++;
        return { tick: done, hash };
    }

    // a peer's hash for tick t; sets the desync marker if it disagrees with ours.
    function checkPeerHash(peerId, t, hash) {
        const local = localHashes.get(t);
        if (local != null && (local >>> 0) !== (hash >>> 0)) { desync = desync || { tick: t, peer: peerId, local: local >>> 0, remote: hash >>> 0 }; return false; }
        return true;
    }

    return {
        addShips, submitInputs, ready, tryStep, checkPeerHash,
        stepDt: () => lockedDt,
        staleDropped: () => staleDropped,
        pendingTicks: () => inbuf.size,
        get tick() { return tick; },
        localHash(t) { return localHashes.get(t == null ? tick - 1 : t); },
        desync() { return desync; },
        shipCount() { return ships.length; },
        peers,
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createLockstepSession };
