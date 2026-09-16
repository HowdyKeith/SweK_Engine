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
        // *** v4534 -- AND THEN IT MOVED TWICE MORE WITHOUT ANYBODY SEEING IT, PAST THE ROW BUILT TO CATCH
        // EXACTLY THIS. *** v4460 fixed the write-then-check that had hidden the first two moves, and the
        // fixed row DID go red -- on main, from 13afafec onward. Nothing read it: this gate runs 7.1s against
        // the sweep's 3,000 ms budget, so it is not in the ship-time sweep, and the exit code beside its name
        // in sweep-timings.json is a 0 captured "before v4408" -- a STALE GREEN of the species sweepCoverage
        // counted 371 of at v4460. THE REPAIR AT v4460 WAS REAL AND THE DRIFT STILL SHIPPED SEVENTEEN ROUNDS,
        // THREE OF THEM VERSIONED, BECAUSE A GATE THAT IS NOT RUN CANNOT FAIL.
        Object.freeze({ version: "v4504", commit: "13afafec", hash: "3f8b285e", file: "orrery.json",
            field: "bodies", bodiesTouched: 3,
            cause: "Kenney's two starter kits and morphicons vendored -- kenney-city, kenney-racing and " +
                   "morphicons arrived in vendor/ and were baked in as three new BODIES, each with its own " +
                   "orbit, stock and prices. Landed on main out of version order through the racing-city " +
                   "branch, which is why the version above is that branch's and not main's",
            control: "on today's tree, dropping those three bodies gives 6516282c; dropping kenney-city " +
                     "alone gives 54a993c9 -- so it is the bodies, and each of them" }),
        Object.freeze({ version: "v4487", commit: "149ef33a", hash: "73e6ee41", file: "orrery.json",
            field: "files", bodiesTouched: 1,
            cause: "the v4526 merge brought v4484's EIGHT KTX2/basis files into `three`'s file list -- " +
                   "basis_transcoder.js and .wasm, its PROVENANCE.txt and README.md, ktx-parse, zstddec, " +
                   "KTX2Loader and WorkerPool. stockOfFiles turns each into cargo, WHICH IS v4416'S " +
                   "MECHANISM ARRIVING A SECOND TIME, this round through a merge rather than a commit",
            control: "on today's tree, removing those eight entries from `three`'s files gives d70cf6a5" }),
        // *** v4534 -- THE MOVE THIS SHIP MADE ON PURPOSE, AND THE GATE MADE IT OWE THIS ENTRY FIRST. ***
        // The ship ritual's step 3 says to re-bake orrery.json when vendor/ has changed and it had; the baked
        // arrival dates had also drifted from git (box3d read 2026-08-31 where git says 2026-08-19), which is
        // what orreryView-selfcheck was red about and what gpuGitTime-selfcheck's arrival ORDER follows from.
        // `--write` refuses to bake a hash the record does not already name, so this entry existed before the
        // key could move -- the one place in this file where the mechanism was tested by using it.
        Object.freeze({ version: "v4534", commit: "v4534's own commit", hash: "6ab551e0", file: "orrery.json",
            field: "arrived", bodiesTouched: 16,
            cause: "the step-3 re-bake corrected every drifted arrival date against git, and a body's " +
                   "ARRIVAL sets its orbit -- v4414's field, moving for the opposite reason: that round " +
                   "flattened the dates to one day, this one restored them to what git says",
            alsoFixed: "orreryView-selfcheck and gpuGitTime-selfcheck, both red on the stale bake",
            control: "on today's tree, reverting `arrived` to the pre-bake values gives 73e6ee41, and " +
                     "setting any single body's arrived to 2026-01-02 moves the hash -- 18 of 18 tried" }),
        // *** v4560 -- THE FIRST MOVE THIS RECORD HAS EVER CAUGHT ON THE ROUND THAT CAUSED IT. *** Every
        // entry above was written after the fact, two of them seventeen rounds after. This one was owed
        // before the bake: vendoring xatlas made vendoredLicences, importPosition and orreryView go red in
        // the same minute, `--write` refuses a hash this record does not already name, and so the entry
        // came first and the key moved second. The gate is still over budget and still outside the
        // ship-time sweep -- that has not changed and is not claimed to have.
        Object.freeze({ version: "v4560", commit: "v4560's own commit", hash: "d35d45dc", file: "orrery.json",
            field: "bodies", bodiesTouched: 1,
            cause: "vendor/xatlas arrived -- jpcy/xatlas's two source files and its licence, vendored as a " +
                   "REFERENCE ORACLE for physics/mesh/uvLscm.mjs rather than as a dependency -- and a new " +
                   "directory under vendor/ is a new BODY with its own orbit, stock and prices. v4504's " +
                   "field, moving for the same reason and by one body instead of three",
            control: "on today's tree, dropping the xatlas body gives 6ab551e0 back -- EXACTLY the previous " +
                     "key, so this move is that body and nothing else" }),
        // *** AND IT MOVED A SECOND TIME IN THE SAME ROUND, FOR A REASON THE FIRST ENTRY COULD NOT HAVE
        // KNOWN: A BODY'S ARRIVAL DATE COMES FROM THE COMMIT THAT VENDORS IT, AND THAT COMMIT DOES NOT EXIST
        // WHILE THE BODY IS BEING VENDORED. *** orreryBake reads `arrived` and `sha` from git, so at the
        // first bake xatlas had neither -- the body was in the fleet with a null arrival, which is an ORBIT
        // of its own, and the key was d35d45dc. The moment the vendoring commit existed the next bake gave
        // the body its real date and the orbit moved again. Two entries for one round is the honest shape:
        // both keys were real, both were committed, and the first is not a mistake to fold away.
        Object.freeze({ version: "v4560", commit: "6b1a0686", hash: "fdc0bd02", file: "orrery.json",
            field: "arrived", bodiesTouched: 1,
            cause: "the re-bake AFTER xatlas's vendoring commit existed gave that body its real arrival date " +
                   "(null -> 2026-09-09) and therefore its real orbit. v4414's field again, for one body " +
                   "instead of fourteen, and reached this time by the ordinary two-step of vendoring rather " +
                   "than by a correction",
            control: "on today's tree, setting xatlas's `arrived` back to null gives d35d45dc -- the key this " +
                     "round committed an hour earlier -- and dropping the body entirely gives 6ab551e0. " +
                     "Setting its `sha` to null ALONE leaves the hash at fdc0bd02, so it is `arrived` and " +
                     "not `sha`, which is the same probe shaDoesNotReachTheEconomy records" }),
        // *** v4535 -- THREE MORE MOVES, NONE OF THEM SEEN UNTIL THIS GATE WAS RE-RUN AGAINST THE LIVE TREE.
        // *** Same failure mode as v4534/v4560: the gate is still over the ship-time budget (see
        // unseenBecause), so nothing ran it between fdc0bd02 being committed and now. All three verified
        // against this repository's actual commits and this tree's actual file sizes, not against the
        // gate's own failure text -- `git log --format=%H -- WebGLEngine/vendor/<name>` for each body, and
        // `ls -la` against each changed file, both re-run here.
        Object.freeze({ version: "v4535", commit: "f100cf68", hash: "9e121456", file: "orrery.json",
            field: "files", bodiesTouched: 1,
            cause: "three-webgpu's own commit says \"WIP, DO NOT MERGE: three-webgpu re-vendored to 0.185.1, " +
                   "breaks the TSL transplant pipeline\" -- it changed byte counts on five ALREADY-LISTED " +
                   "files (PROVENANCE.txt, README.md, three.core.js, three.tsl.js, three.webgpu.js), no file " +
                   "added or removed. stockOfFiles still turns each file's bytes into cargo at " +
                   "Math.max(1, round(bytes / 4096)) per file, so a big enough byte delta crosses that " +
                   "rounding boundary and moves cargo even with the file list unchanged -- v4416's mechanism, " +
                   "reached this time by a size change rather than a new entry",
            control: "on today's tree, reverting three-webgpu's five changed file byte counts (and its " +
                     "top-level `bytes`) to their pre-f100cf68 values gives cdc34cbb" }),
        Object.freeze({ version: "v4535", commit: "01fe7f4e", hash: "70cb223f", file: "orrery.json",
            field: "files", bodiesTouched: 1,
            cause: "\"box3d: add wasm-opt post-link pass, rebuild\" (Task 42) actually rebuilt box3d.wasm, " +
                   "973188 bytes to 829117 -- a real recompilation, verified against the file on disk, not a " +
                   "record edit. stockOfFiles rounds that file's cargo at 4096 bytes: 238 tons before, 202 " +
                   "after. Same per-file-bytes mechanism as the f100cf68 move above, this time a shrink",
            control: "on today's tree, reverting box3d's wasm file byte count (and its top-level `bytes`) to " +
                     "its pre-01fe7f4e value gives e6408d4d" }),
        Object.freeze({ version: "v4535", commit: "9c1d4e76", hash: "f4cf12e5", file: "orrery.json",
            field: "bodies", bodiesTouched: 1,
            cause: "vendor/draco-encoder arrived -- google/draco's own encoder build, vendored for Task 53 " +
                   "so tools/export/dracoEncode.mjs can compress voxel/welded GLB exports; a distinct body " +
                   "from vendor/draco (the decoder). A new directory under vendor/ is a new BODY with its " +
                   "own orbit, stock and prices -- v4504/v4560's field, moving the same way for one more body",
            control: "on today's tree, dropping the draco-encoder body gives 96f868f7" }),
        // *** v4621 -- A FOURTH MOVE THE SAME ROUND THIS GATE WAS RE-RUN, AND THE ONLY ONE STILL UNCOMMITTED
        // AT THE TIME THIS ENTRY WAS WRITTEN. *** "Vendor FBXLoader.js + dependency closure at r160" (b5fccadb)
        // touched vendor/three on disk; orrery.json's re-bake for it was sitting in the working tree with no
        // entry here yet, which is exactly the gap this record exists to close before it ships rather than
        // seventeen rounds after. world/orreryFleet.mjs's COMMIT_BELT_DRIFT_V4621 records the same commit
        // against the same body, independently, for a different gate.
        Object.freeze({ version: "v4621", commit: "b5fccadb", hash: "0322b336", file: "orrery.json",
            field: "files", bodiesTouched: 1,
            cause: "the FBX loader's dependency closure -- FBXLoader.js, NURBSCurve.js, NURBSUtils.js and " +
                   "fflate.module.js -- was added to `three`'s file list (four new cargo-bearing files) and " +
                   "its PROVENANCE.txt grew from 902 to 3001 bytes. v4416's mechanism a third time (after " +
                   "v4487's merge), this time from an ordinary new-loader vendoring commit",
            control: "on today's tree, reverting `three`'s file list and PROVENANCE.txt bytes to their " +
                     "pre-b5fccadb values gives f4cf12e5 -- EXACTLY the previous key, so this move is that " +
                     "body's files and nothing else" }),
    ]),
    current: "0322b336",
    // *** MEASURED AND NEGATIVE, AND IT CORRECTS MY OWN FIRST WRITING OF THE ENTRY ABOVE. *** The re-bake's
    // diff moved TWO fields on 16 bodies each, `arrived` and `sha`, and I wrote "arrived + sha" into this
    // record straight off that diff -- the exact mistake bytesDoNotReachTheEconomy exists to record, made
    // again in the same file four moves later. `sha` reaches NOTHING: each of the 18 bodies' sha set to
    // forty zeros in turn, one at a time, and the hash never moved. A DIFF NAMES WHAT CHANGED, NOT WHAT
    // COUNTED, and the only way to tell them apart is to run it.
    shaDoesNotReachTheEconomy: Object.freeze({ bodiesTried: 20, movedTheHash: 0,
        note: "against `arrived`, the same probe on the same 20 bodies: 20 of 20 moved the hash. 18 at " +
              "v4534; xatlas made it 19 at v4560; draco-encoder made it 20 at v4535 and the probe is " +
              "re-run rather than the count adjusted" }),
    // WHY THE 2026-09-07 DRIFT SHIPPED ANYWAY, read from tools/ship/sweep-timings.json rather than argued:
    // the gate is over the ship-time budget, so quickSweep does not run it, so its recorded verdict is a
    // snapshot of a tree that no longer exists. The RELATION (gate slower than budget) is asserted live in
    // universeWire-selfcheck; the readings below are the observation that prompted it, dated, not asserted.
    unseenBecause: Object.freeze({
        gate: "tools/ship/universeWire-selfcheck.mjs", observedMs: 7071, budgetMs: 3000,
        recordedCode: 0, recordedAt: "unknown -- before v4408", capturedAt: "2026-09-07T16:57:55.695Z",
        roundsShippedPast: 17, versionedShipsPast: 3,   // 13afafec..f5ab4c4d on main, first-parent; v4531-v4533
        note: "v4460's repair made this gate ABLE to fail and it did fail; nothing ran it. The stale-green " +
              "species sweepCoverage counted 371 of, arriving in the gate that documents key drift.",
    }),
    // MEASURED AND NEGATIVE, kept because it is what corrected this record: `bytes` (and so `radius`) do not
    // reach the economy. 964 bytes added to each of the 15 bodies in turn, one at a time: the hash never moved.
    bytesDoNotReachTheEconomy: Object.freeze({ bodiesTried: 20, movedTheHash: 0,
        note: "radiusFor(bytes) sets a body's drawn size and nothing the economy integrates. 15 at v4460; " +
              "every arrival since (kenney-city/-racing, morphicons, xatlas, draco-encoder) also defines " +
              "`bytes`, so re-run against today's 20 bodies rather than left at the old count" }),
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
