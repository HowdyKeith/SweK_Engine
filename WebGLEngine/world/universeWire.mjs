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

// *** v4460 -- THE KEY WAS WRONG FOR FORTY-TWO SHIPPED VERSIONS, AND THE ONLY GATE THAT COULD SAY SO
// OVERWROTE IT EVERY RUN. *** universeWire-selfcheck computed the key, WROTE it to
// tools/ship/universe-hash-expected.json, and then asserted against the file it had just written -- so the
// row could not fail on a hash change, and the browser half read AGREES because it fetched a file the same
// run had produced. THE WHOLE CHAIN AGREED WITH ITSELF. The gate was green, exit 0, and is in no red
// register because it was never red.
//
// *** AND v4316's OWN SABOTAGE LOG NAMED THE DEFECT AND THE FIX, AND THE FIX WAS NEVER MADE. *** Its
// sabotage B reads: "The page's key, built by the same code, still AGREED with the file the same sabotaged
// code wrote -- ... and why the file another engine checks against is the one COMMITTED, not the one a page
// computes." True of the intent, false of the mechanism, for 144 rounds.
//
// WHAT ACTUALLY MOVED IT, BISECTED FILE BY FILE AND THEN FIELD BY FIELD. Both moves are orrery.json and
// NEITHER ROUND WAS ABOUT THE ECONOMY.
//
// *** AND MY FIRST TWO ATTRIBUTIONS WERE WRONG, BOTH READ OFF A DIFF HUNK INSTEAD OF MEASURED. *** I wrote
// that a body's radius is the cube root of its byte count -- which is true, radiusFor does exactly that --
// and concluded the key moved because bodies changed size. IT DOES NOT. Adding 964 bytes to each of the
// fifteen bodies IN TURN moves the hash NOT AT ALL: `bytes` feeds `radius`, and the economy never reads
// either. The sabotage that reproduced the historical change went 0 RED and that is how the story got
// corrected -- the plant that "failed" was the one saying the explanation was wrong.
//
//   v4409  2ac2a467   the last correct key, and the last time the file was committed
//
//   v4414  43f055b1   "papered is not attributed". Every body's `arrived` DATE was rewritten to 2026-08-31 --
//                     14 of 15 -- and a body's orbit is set by its age (buildOrrery: days since `arrived`,
//                     floored, into orbitFor). *** THE WHOLE SKY MOVED. *** Different orbits, different
//                     flight times, different trades. Confirmed by changing one body's `arrived` on today's
//                     tree: box3d at 2026-08-30 gives b6fd8ff5, at 2026-08-19 gives 6715cd16.
//
//   v4416  df581d2d   "five narrow patterns in one function". PROVENANCE.txt ATTRIBUTION FILES were added to
//                     six vendored dependencies -- and gitEconomy's stockOfFiles turns EVERY FILE INTO CARGO:
//                     `stock[goodOf(f.path)] += Math.max(1, Math.round(f.bytes / BYTES_PER_TON))`. Every one
//                     of the six is under 1 KB against a BYTES_PER_TON of 4096, so each rounds to ZERO and is
//                     lifted to a full ton by that Math.max. *** SIX TONS OF `docs` APPEARED IN THE SYSTEM,
//                     ONE PER LICENCE NOTE. *** draco 964 B, heerich 525 B, jolt 909 B, keyhunt 789 B,
//                     three 902 B, three-webgpu 960 B -- 4,049 bytes of attribution, six tons of freight.
//
// *** WRITING DOWN WHO OWNS A DEPENDENCY PUT CARGO ON SIX PLANETS. *** Not a defect in either round: the
// economy is stocked from the tree and the tree gained files. The defect is that the key nobody could
// re-derive went stale and the gate that published it re-baked itself green.
export const KEY_DRIFT_V4460 = Object.freeze({
    at: "v4460",
    lastCommittedCorrect: Object.freeze({ version: "v4409", commit: "2b693ec8", hash: "2ac2a467" }),
    moves: Object.freeze([
        Object.freeze({ version: "v4414", commit: "aefc87ad", hash: "43f055b1", file: "orrery.json",
            field: "arrived", bodiesTouched: 14,
            cause: "every body's arrival date rewritten to 2026-08-31, so every ORBIT moved -- a body's " +
                   "orbit is set by its age, and the economy's flight times come from the orbits",
            control: "on today's tree, box3d arrived=2026-08-30 gives b6fd8ff5 and 2026-08-19 gives 6715cd16" }),
        Object.freeze({ version: "v4416", commit: "7e680f96", hash: "df581d2d", file: "orrery.json",
            field: "files", bodiesTouched: 6,
            cause: "PROVENANCE.txt attribution files added to six vendored dependencies, and stockOfFiles " +
                   "turns every file into cargo at Math.max(1, round(bytes / 4096)) -- all six are under 1 KB " +
                   "so each rounds to ZERO and is lifted to one ton",
            cargoAdded: 6, cargoGood: "docs", attributionBytes: 4049,
            control: "adding one file entry to draco on today's tree gives deaa019b, WITH OR WITHOUT the " +
                     "body's `bytes` field updated -- so it is the file list, not the size" }),
    ]),
    current: "df581d2d",
    // MEASURED AND NEGATIVE, kept because it is what corrected this record: `bytes` (and so `radius`) do not
    // reach the economy. 964 bytes added to each of the 15 bodies in turn, one at a time: the hash never moved.
    bytesDoNotReachTheEconomy: Object.freeze({ bodiesTried: 15, movedTheHash: 0,
        note: "radiusFor(bytes) sets a body's drawn size and nothing the economy integrates" }),
    staleFor: 42,             // shipped changelog entries strictly after v4416 up to v4459, COUNTED not subtracted
    // The gate reads the file and compares. Writing is behind --write, and the default mode is asserted to
    // have left the bytes alone -- v3698's rule, the one claimCheck states about itself: A LOOP THAT BOTH
    // WRITES THE RECORD AND GRADES IT CAN MARK ITS OWN WORK PASSED.
    writeIsExplicit: "node tools/ship/universeWire-selfcheck.mjs --write",
    notClaimed: "that df581d2d is right on any engine but this one. It is Node/V8 here, and the cross-engine " +
                "answer is still a person on Firefox or Safari reading the page's line -- unchanged from " +
                "v4316. What changed is that the file they read is now the COMMITTED key rather than one " +
                "this gate wrote a second earlier.",
});
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
