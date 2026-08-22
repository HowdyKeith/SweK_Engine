// WebGLEngine/physics/box3dLockstepNet.js — v2274
//
// The transport that RUNS a box3d lockstep across the net. Each peer generates its owned ships' {turn,thrust}
// for a tick, sends it AHEAD (tick = current + inputDelay) so the network has time to deliver, and advances the
// shared box3d world only for ticks it holds every peer's input for. After each step it broadcasts that tick's
// stateHash; incoming hashes are checked against the local one, so a divergence is caught immediately. Input
// delay is what keeps it from stalling every tick on the slowest link -- you fly `inputDelay` ticks behind your
// own input, which the sim hides.
//
// Pure over a send() callback + a receive() method, so it runs headless against a mock network (the selfcheck
// simulates two peers with latency) and, on the rig, against the room bus flightView already uses.

export function createLockstepNet(opts = {}) {
    const session = opts.session;
    const selfId = opts.selfId;
    const inputFn = opts.inputFn;                       // (tick) -> [{shipId,turn,thrust}] for OUR owned ships
    const send = opts.send || (() => {});
    const inputDelay = opts.inputDelay != null ? opts.inputDelay : 3;
    const dt = opts.dt || 1 / 30;
    const maxCatchup = opts.maxCatchup || 16;
    // v2493 -- REDUNDANT INPUT TRANSMISSION, and it is not an optimisation, it is the difference between a game
    // and a freeze.
    //
    // Every input used to be sent EXACTLY ONCE. There is no retransmit, no ack, no nack. So a single lost packet
    // meant every peer waited for it forever: tryStep() will not advance without all inputs, correctly, and that
    // input was never coming. MEASURED against a lossy channel: 0% loss plays 400 ticks; 0.5% loss plays 44 and
    // limps; 2% loss -- an ordinary wifi number -- plays FOUR TICKS AND STOPS FOREVER. It never diverges. It dies.
    // Silently, with no error anywhere, which is the worst way for anything to fail.
    //
    // The fix is old and cheap: send each input SEVERAL TIMES, in later packets. An input is {shipId,turn,thrust} --
    // a handful of bytes -- so carrying the last few ticks costs nothing next to the packet header, and a single
    // loss is covered by the very next packet. submitInputs() is idempotent (a Map.set of identical data), which
    // the duplicate-packet check already proves, so a resend is harmless by construction.
    //
    // BACKWARD COMPATIBLE ON PURPOSE: the message keeps its `tick` and `inputs` fields exactly as before and adds
    // `redun`. An older peer ignores the new field and behaves exactly as it does today; a newer peer reads both.
    // Nothing that works stops working.
    const redundancy = opts.redundancy != null ? opts.redundancy : 4;
    const myHistory = new Map();     // tick -> our inputs, kept just long enough to resend
    let nextInputTick = 0;
    const stepped = [];                                 // {tick,hash} we advanced through (for observers)

    // ---- v2475: the engine is part of the protocol -----------------------------------------------------------
    //
    // Measured on Keith's rig, 2026-07-15: two identical worlds, one per backend, drifted 0.925 m apart in 2.5
    // seconds -- AFTER box3d's WASM was rebuilt so both engines measure damping at exactly 0.05000/s and both pass
    // every exact check. That gap cannot be closed. Collisions amplify a 1e-6 m difference into 9e-2 m in 2.5s,
    // about 90,000x, so two engines would have to track each other to ~1e-9 m through every operation to stay in
    // lockstep -- and two independent codebases differ in the last bit at best. MIXED-BACKEND LOCKSTEP IS NOT
    // BROKEN; IT IS IMPOSSIBLE. Each backend IS bit-identical against itself, so lockstep is perfect when every
    // peer runs the same engine.
    //
    // box3dSyncCompare can already NAME this as the cause of a divergence. But naming it afterwards means someone
    // has already spent the afternoon. The transport should never allow the pair to form. So: announce the backend,
    // and if a peer answers with a different one, HALT before stepping rather than produce a beautiful desync that
    // looks exactly like a bug.
    const backendId = opts.backendId || null;
    const onBackendMismatch = opts.onBackendMismatch || null;
    const peerBackends = new Map();
    let halted = null;

    function announceBackend() {
        if (backendId) send({ t: "lsb", peer: selfId, backend: backendId });
    }
    function noteBackend(peer, theirs) {
        if (!theirs || peer === selfId) return;
        peerBackends.set(peer, theirs);
        if (!backendId || theirs === backendId || halted) return;
        halted = {
            reason: "peer '" + peer + "' runs " + theirs + "; we run " + backendId + ". Lockstep across two different " +
                    "physics engines cannot work -- they differ in the last bit and collisions amplify that ~90,000x " +
                    "in 2.5s, which is a metre. Halted before stepping: a desync here would look like a bug and is not.",
            ours: backendId, theirs, peer,
        };
        if (onBackendMismatch) { try { onBackendMismatch(halted); } catch {} }
    }

    function receive(msg) {
        if (!msg) return;
        if (msg.t === "lsb") { noteBackend(msg.peer, msg.backend); return; }
        if (halted) return;                             // a mixed pair produces garbage; do not accumulate it
        if (msg.t === "lsi") {
            session.submitInputs(msg.peer, msg.tick, msg.inputs);
            // the resends. Idempotent by construction, and submitInputs now refuses ticks already stepped, so an
            // old tick arriving late is dropped rather than filed somewhere nothing will ever look.
            if (Array.isArray(msg.redun)) for (const r of msg.redun) {
                if (r && r.tick != null) session.submitInputs(msg.peer, r.tick, r.inputs);
            }
        }
        else if (msg.t === "lsh") session.checkPeerHash(msg.peer, msg.tick, msg.hash);
    }

    // send our owned inputs up to inputDelay ticks ahead, then advance the sim as far as inputs allow.
    function pump() {
        if (halted) return 0;                           // refuse to advance a pair that physics forbids
        if (backendId && nextInputTick === 0) announceBackend();
        const ahead = session.tick + inputDelay;
        while (nextInputTick <= ahead) {
            const my = inputFn ? (inputFn(nextInputTick) || []) : [];
            session.submitInputs(selfId, nextInputTick, my);
            myHistory.set(nextInputTick, my);
            // carry the last few ticks along for free: one lost packet is then covered by the next one.
            const redun = [];
            for (let k = 1; k <= redundancy; k++) {
                const t = nextInputTick - k;
                if (t >= 0 && myHistory.has(t)) redun.push({ tick: t, inputs: myHistory.get(t) });
            }
            send({ t: "lsi", tick: nextInputTick, peer: selfId, inputs: my, redun });
            // do not keep history we can never usefully resend
            for (const t of myHistory.keys()) if (t < nextInputTick - redundancy - 2) myHistory.delete(t);
            nextInputTick++;
        }
        let steps = 0;
        while (session.ready(session.tick) && steps < maxCatchup) {
            const r = session.tryStep(dt);
            if (!r) break;
            send({ t: "lsh", tick: r.tick, peer: selfId, hash: r.hash });
            stepped.push(r);
            steps++;
        }
        return steps;
    }

    return {
        receive, pump, stepped, announceBackend,
        // null when the pair is sound; otherwise {reason, ours, theirs, peer} -- and pump() will not step again.
        halted: () => halted,
        backendOf: (peer) => peerBackends.get(peer) || null,
        get tick() { return session.tick; },
        redundancy,
        localHash: (t) => session.localHash(t),
        desync: () => session.desync(),
        // how far ahead our input generation is from the confirmed sim tick (should hover near inputDelay)
        lead: () => nextInputTick - session.tick,
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createLockstepNet };
