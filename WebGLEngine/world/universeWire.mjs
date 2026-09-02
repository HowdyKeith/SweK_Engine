// WebGLEngine/world/universeWire.mjs -- v4316
//
// THE WIRE A PAGE PICKS, AND THE HASH ANOTHER BROWSER CAN CHECK. Level 16 shared one universe between two tabs
// over a BroadcastChannel and left two remainders: a real WebRTC wire between two machines, and whether two
// DIFFERENT browsers reach the same hash. This module is what the sandbox can build of both:
//
//   wireFromParams()  -- one call that turns a page's query string into a wire in the shape the lockstep peer
//                        takes (send, onMessage): `peer=a|b` alone is the BroadcastChannel (two tabs, one
//                        browser); `peer=a&webrtc=<rendezvous>&room=<room>` is ev/p2p.js's WebRTC transport
//                        (two machines, the ai-bridge rendezvous for SDP/ICE, the data channel for the rest).
//                        The transport is INJECTED so the gate drives the mapping with a mock; the real one is
//                        browser-only and is a rig question.
//   hashKey()          -- the state hash of a fresh economy after N ticks from a seed, as a KEY another browser
//                        can compute and compare. The hash is over integers on purpose (positions are sines and
//                        cosines that engines may round differently), so the claim is: every browser that runs
//                        the sim to tick N from seed S prints this string. The gate writes Node's value to
//                        tools/ship/universe-hash-expected.json; the page prints its own beside it, and a person
//                        on Firefox or Safari reads AGREES or DIFFERS. This sandbox has one engine (V8), and says so.
"use strict";

/** The wire a page's params ask for: { kind, wire, room, rendezvous } or { kind: "none" }. `transports.p2p` is p2pTransport's signature. */
export function wireFromParams(params, transports = {}) {
    const get = (k) => (typeof params.get === "function" ? params.get(k) : params[k]) || null;
    const peer = get("peer");
    if (peer !== "a" && peer !== "b") return { kind: "none", peer: null, wire: null, why: peer ? `peer must be a or b, not ${JSON.stringify(peer)}` : "no peer named" };
    const rendezvous = get("webrtc"), room = get("room") || "swek-universe";
    if (rendezvous) {
        if (typeof transports.p2p !== "function") throw new Error("universeWire: a webrtc wire was asked for and no p2p transport was handed over (ev/p2p.js p2pTransport is browser-only)");
        const t = transports.p2p(rendezvous.replace(/\/$/, ""), room, peer, transports.p2pOpts || {});
        const w = { send: (m) => t.send(m), onMessage: null, close: () => t.close && t.close(), connections: () => (t.connections ? t.connections() : 0), kind: "webrtc" };
        t.onMessage((m) => { if (w.onMessage) w.onMessage(m); });
        return { kind: "webrtc", peer, wire: w, room, rendezvous };
    }
    if (typeof transports.broadcast !== "function") throw new Error("universeWire: a broadcast wire was asked for and no BroadcastChannel factory was handed over");
    const w = transports.broadcast(room); w.kind = "broadcast";
    return { kind: "broadcast", peer, wire: w, room, rendezvous: null };
}

/**
 * The key: a fresh economy from `makeEconomy(seed)` stepped `ticks` times at `dt`, its hash. Deterministic by
 * construction -- PROVIDED the world is the same: the orrery's orbits depend on the day the ages are measured
 * against (buildOrrery's `today`), and a different day is a different sky, different flight times, different
 * trades. So the key names its `today`, and a page building its key must build the sky for that day, not its own.
 */
export const KEY_TODAY = "2026-09-01";
export function hashKey(makeEconomy, { seed = 7, ticks = 400, dt = 0.25, today = KEY_TODAY } = {}) {
    const e = makeEconomy(seed, today);
    for (let i = 0; i < ticks; i++) e.step(dt);
    return { seed, ticks, dt, today, hash: e.hash(), tick: e.tick };
}
/** Compare a browser's key against the recorded one: the verdict a person reads. */
export function compareKey(mine, expected) {
    if (!expected) return { verdict: "NO KEY", detail: "no tools/ship/universe-hash-expected.json to compare with -- run node tools/ship/universeWire-selfcheck.mjs first" };
    if (expected.seed !== mine.seed || expected.ticks !== mine.ticks || expected.dt !== mine.dt || (expected.today || KEY_TODAY) !== (mine.today || KEY_TODAY)) return { verdict: "DIFFERENT QUESTION", detail: `the key is seed ${expected.seed}, ${expected.ticks} ticks at ${expected.dt}, the sky of ${expected.today || KEY_TODAY}; this ran seed ${mine.seed}, ${mine.ticks} at ${mine.dt}, the sky of ${mine.today || KEY_TODAY}` };
    return mine.hash === expected.hash ? { verdict: "AGREES", detail: `hash ${mine.hash} at tick ${mine.ticks}, the same as ${expected.engine || "the recorded engine"}` }
                                       : { verdict: "DIFFERS", detail: `hash ${mine.hash} here, ${expected.hash} on ${expected.engine || "the recorded engine"} -- an integer in the sim moved differently on this engine; paste this into a round` };
}
