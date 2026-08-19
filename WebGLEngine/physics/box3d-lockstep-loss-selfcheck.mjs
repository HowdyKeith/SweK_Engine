// physics/box3d-lockstep-loss-selfcheck.mjs -- what a real network does to lockstep.
//
// The existing net selfcheck tests LATENCY, and passes 7/7. But latency is the failure the input delay was
// DESIGNED to absorb -- you fly three ticks behind your own input precisely so the wire has time. Testing that is
// testing the feature against itself.
//
// A real network does three other things, and none of them were tested: it DROPS packets, it DELIVERS THEM OUT OF
// ORDER, and it DELIVERS THEM TWICE. Cross-peer combat runs on this. What happens?
//
// THE PROMISE LOCKSTEP MAKES: two peers either compute the SAME WORLD, or they STOP. What they must never do is
// quietly compute DIFFERENT worlds -- two players each seeing themselves winning, and no error anywhere.
//
// AND THE FIRST VERSION OF THIS FILE PASSED 6/6 WHILE PROVING NOTHING, which is worth more than the file.
// Under 25% loss it reported "0 ticks compared, 0 disagreed" and called that a pass. The peers had not diverged
// because THE PEERS HAD NOT MOVED. A test that passes while the system is dead is decoration -- the same sin as a
// control that cannot fail. So every check below now demands PROGRESS as well as AGREEMENT, and the numbers got
// considerably less flattering.
//
// The design is sound: tryStep() returns null unless every peer's inputs for the current tick are in, so a lost
// packet makes a peer STALL rather than guess. Sound design and tested design are different things, and this file
// is the difference.
"use strict";
import { createLockstepSession } from "./box3dLockstep.js";
import { createLockstepNet } from "./box3dLockstepNet.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";

const rows = [];
const ok = (name, pass, detail) => rows.push({ name, pass, detail });

function shipDefs() {
    return [
        { ship: { id: "a1", x: -60, y: 0, z: 0, vx: 0, vy: 0, vz: 0, angle: 0 }, owner: "A", stats: { mass: 100 } },
        { ship: { id: "b1", x: 60, y: 0, z: 0, vx: 0, vy: 0, vz: 0, angle: Math.PI }, owner: "B", stats: { mass: 100 } },
    ];
}
const ownedInputs = (me) => (t) => [{ shipId: me === "A" ? "a1" : "b1", turn: Math.sin(t * 0.3) * 0.5, thrust: (t % 7) < 4 }];

// A deliberately hostile channel. Deterministic, so a failure can be reproduced rather than admired.
function makeChannel({ dropRate = 0, dupRate = 0, reorder = false, seed = 12345 }) {
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const q = { A: [], B: [] };
    const stats = { sent: 0, dropped: 0, duped: 0 };
    const post = (to, msg, at) => q[to].push({ msg, at });
    return {
        stats,
        sendFrom: (from) => (msg) => {
            const to = from === "A" ? "B" : "A";
            stats.sent++;
            if (rnd() < dropRate) { stats.dropped++; return; }           // gone. no retransmit exists.
            const lat = reorder ? 1 + Math.floor(rnd() * 4) : 2;         // variable latency IS reordering
            post(to, msg, lat);
            if (rnd() < dupRate) { stats.duped++; post(to, msg, lat + 1); }
        },
        pump(peerId, deliver) {
            const keep = [];
            for (const item of q[peerId]) { item.at--; if (item.at <= 0) deliver(item.msg); else keep.push(item); }
            q[peerId] = keep;
        },
    };
}

function run({ dropRate = 0, dupRate = 0, reorder = false, rounds = 240, seed = 7 }) {
    const ch = makeChannel({ dropRate, dupRate, reorder, seed });
    const sA = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 }); sA.addShips(shipDefs());
    const sB = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 }); sB.addShips(shipDefs());
    const dA = createLockstepNet({ session: sA, selfId: "A", inputFn: ownedInputs("A"), send: ch.sendFrom("A"), inputDelay: 3 });
    const dB = createLockstepNet({ session: sB, selfId: "B", inputFn: ownedInputs("B"), send: ch.sendFrom("B"), inputDelay: 3 });
    // deliver first, THEN step -- the driver's method is pump(), and `tick` is a getter, not a call. (I guessed
    // both and node told me so, which is the third time this session that reading the interface would have been
    // faster than assuming it.)
    dA.announceBackend(); dB.announceBackend();
    for (let i = 0; i < rounds; i++) {
        ch.pump("A", (m) => dA.receive(m));
        ch.pump("B", (m) => dB.receive(m));
        dA.pump(); dB.pump();
    }
    // THE ONLY QUESTION THAT MATTERS: for every tick BOTH peers actually stepped, do they agree?
    let compared = 0, disagreed = 0, firstBad = null;
    const upto = Math.min(sA.tick, sB.tick);
    for (let t = 0; t < upto; t++) {
        const ha = sA.localHash(t), hb = sB.localHash(t);
        if (ha == null || hb == null) continue;
        compared++;
        if ((ha >>> 0) !== (hb >>> 0)) { disagreed++; if (firstBad === null) firstBad = t; }
    }
    return { sA, sB, ch, compared, disagreed, firstBad, tickA: sA.tick, tickB: sB.tick,
             desync: sA.desync() || sB.desync() };
}

// 1. THE CONTROL. A perfect wire must produce a perfect match -- if this fails, nothing below means anything.
{
    const r = run({ rounds: 200 });
    ok("a perfect wire keeps two peers identical", r.compared > 50 && r.disagreed === 0 && !r.desync,
       r.compared + " ticks compared, " + r.disagreed + " disagreed, both reached tick " + r.tickA);
}
// 2. PACKET LOSS -- and this is the one that told the truth once I made it demand progress.
//    There is NO RETRANSMIT anywhere in this protocol. A peer sends its input for tick t+3 exactly once. If that
//    packet dies, every peer waits for it FOREVER, because tryStep() will not advance without it. The design is
//    safe -- it stalls rather than guessing, so the worlds never disagree -- and it is also completely fatal: the
//    game does not desync, it just stops, silently, and stays stopped.
{
    const r = run({ dropRate: 0.25, rounds: 300 });
    const progressed = r.compared > 30;
    ok("25% loss: agrees AND keeps playing", r.disagreed === 0 && !r.desync && progressed,
       r.ch.stats.dropped + "/" + r.ch.stats.sent + " dropped -> reached tick " + r.tickA + "/" + r.tickB + " in 300 rounds" +
       (progressed ? "" : "  <- DEAD. No divergence, because nothing moved. There is no retransmit: one lost packet stalls forever."));
}
// 3. REORDERING. Inputs are keyed by tick, so out-of-order should be harmless -- but "should" is not a test.
{
    const r = run({ reorder: true, rounds: 300 });
    ok("out-of-order: agrees AND keeps playing", r.disagreed === 0 && !r.desync && r.compared > 200,
       r.compared + " ticks compared, " + r.disagreed + " disagreed; reached tick " + r.tickA + "/" + r.tickB);
}
// 4. DUPLICATION. submitInputs() is a Map.set, so a duplicate should overwrite identically -- again, "should".
{
    const r = run({ dupRate: 0.3, rounds: 300 });
    ok("duplicates: agrees AND keeps playing", r.disagreed === 0 && !r.desync && r.compared > 200,
       r.ch.stats.duped + " duplicated; " + r.compared + " ticks compared, " + r.disagreed + " disagreed");
}
// 5. ALL THREE AT ONCE, which is simply what a bad wifi link is.
{
    const r = run({ dropRate: 0.15, dupRate: 0.15, reorder: true, rounds: 400, seed: 99 });
    const alive = r.compared > 200;
    ok("a bad link: agrees AND keeps playing", r.disagreed === 0 && !r.desync && alive,
       r.ch.stats.dropped + " dropped, " + r.ch.stats.duped + " duped, reordered -> " + r.compared + " ticks in 400 rounds" +
       (alive ? "" : "  <- DEAD, not desynced. Which is safe, and unplayable."));
}
// 6. AND THE THING I WENT LOOKING FOR. tryStep() does inbuf.delete(tick) and moves on. A packet that arrives LATE,
//    for a tick already stepped, used to call inbuf.set(t, ...) and create an entry NOTHING WOULD EVER CONSUME OR
//    CLEAN. On a lossy, reordering link that is a slow leak in the thing combat runs on -- and retransmission
//    resends old ticks BY DESIGN, so v2493's fix would have made it grow four times faster.
//
//    THIS CHECK WAS VACUOUS UNTIL v2496, AND A MUTATION HAD TO TELL ME SO AFTER I HAD ALREADY WRITTEN IT DOWN.
//    It asked ready(0) and expected false. But ready(t) requires EVERY peer to have submitted for t, and the check
//    submits only ONE peer's input -- so it returns false whether the stale entry was refused or filed away
//    lovingly. It passed either way. I noted this exact flaw in the v2493 changelog, fixed the CODE, and left the
//    CHECK standing. Breaking the fix on purpose is what caught it: the mutation survived, which is a hole in the
//    net rather than a bug in the engine.
//
//    Ask the session directly instead, through the surface v2493 added for exactly this reason.
{
    const r = run({ dropRate: 0.1, reorder: true, rounds: 500, seed: 4242 });
    const at = r.sA.tick;
    const droppedBefore = r.sA.staleDropped();
    const pendingBefore = r.sA.pendingTicks();
    const taken = r.sA.submitInputs("B", 0, [{ shipId: "b1", turn: 0, thrust: false }]);   // tick 0, stepped long ago
    const droppedAfter = r.sA.staleDropped();
    const pendingAfter = r.sA.pendingTicks();
    ok("a packet for an already-stepped tick is refused, not filed",
       taken === false && droppedAfter === droppedBefore + 1 && pendingAfter === pendingBefore,
       taken === false
         ? "refused at tick " + at + " (" + droppedAfter + " stale refused this run, buffer still holding " + pendingAfter + " live ticks)"
         : "ACCEPTED a tick-0 packet while at tick " + at + " -- nothing will ever consume or clean it");

    // and the leak itself, stated as the thing it is: hammer it with late packets and watch the buffer NOT grow.
    const before = r.sA.pendingTicks();
    for (let n = 0; n < 300; n++) { r.sA.submitInputs("A", n % 50, []); r.sA.submitInputs("B", n % 50, []); }
    const after = r.sA.pendingTicks();
    ok("600 late packets do not grow the input buffer", after === before,
       before + " -> " + after + " ticks pending (before v2493 this grew without bound)");
}
const pass = rows.filter((r) => r.pass).length;
console.log("[lockstep-loss] " + pass + "/" + rows.length + " pass");
for (const r of rows) console.log("   " + (r.pass ? "PASS" : "FAIL") + "  " + r.name.padEnd(48) + " " + r.detail);
if (pass !== rows.length) process.exit(1);
export { rows };
