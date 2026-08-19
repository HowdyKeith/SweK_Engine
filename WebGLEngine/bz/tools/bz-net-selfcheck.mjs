// bz/tools/bz-net-selfcheck.mjs — a tank on the wire.
//
//   node bz/tools/bz-net-selfcheck.mjs
//
// The browser joins the same room the GPU Brain is already in, and none of the hard parts are BZFlag's:
// `ev/presence.js` carries the tank and `ev/esAuthority.js` carries the damage. Both were written for a
// game about spaceships and neither had to change. What this file checks is that the seam holds -- that a
// tank's id names its owner, that a hit is reported and not applied, that a replayed hit lands once, and
// that a peer who merely leaves is not a kill.
//
// It is pure, which is why bz-live-probe.mjs can play the browser's part with no browser at all: a headless
// peer that fires at a real `brain/bzPilot.mjs` process and gets killed by it uses exactly this module.

import { makeBZDB } from "../bzdb.js";
import { makeTank } from "../bzTank.js";
import { tankId, packTank, peerTanks, makeNetState, reportHits, queueDamage, ingestDamage, deadPeers, SYSTEM, MAX_INBOUND } from "../bzNet.js";
import { ownerOf, ownsNpc, validateDamage } from "../../ev/esAuthority.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const db = makeBZDB();
const spec = makeTank(db).spec;
const peer = (id, x, y, opts = {}) => ({ id, x, y, z: opts.z != null ? opts.z : 0, heading: opts.heading || 0, hp: opts.hp != null ? opts.hp : 100, bot: !!opts.bot, name: opts.name });

// --- 1. a tank's id names its owner ---------------------------------------------------------------
{
    ok("a tank is a private wing of one", tankId("brain-red") === "brain-red:0");
    ok("...and `ownerOf` hands it straight back, without a hash", ownerOf(tankId("brain-red"), ["a", "b"]) === "brain-red");
    ok("...however many peers are in the room", ownerOf(tankId("x"), []) === "x");
    ok("nobody else owns it", !ownsNpc("browser", tankId("brain-red"), ["browser", "brain-red"]));
    let threw = false;
    try { tankId("bad:id"); } catch (e) { threw = true; }
    ok("a peer id with a colon is rejected, not silently mangled", threw);
}

// --- 2. the presence packet ------------------------------------------------------------------------
{
    const t = makeTank(db, { pos: [1.2, 2.7, 3.5], angle: Math.PI / 2 });
    const p = packTank(t, "Player");
    ok("a tank rides the same packet a ship does", p.system === SYSTEM && p.name === "Player");
    ok("...carrying a z, which a ship never needed", p.z === 3.5);
    // presence rounds `heading` to an integer, and a radian rounded to an integer is 0 or 1.
    ok("heading goes out in DEGREES, because presence rounds it", p.heading === 90);
    ok("a living tank has hp", p.hp === 100);
    t.dead = true;
    ok("...and a dead one has none, which is how a killer learns it scored", packTank(t).hp === 0);
}

// --- 3. the other tanks in the room -------------------------------------------------------------------
{
    const ghosts = peerTanks([peer("brain-red", 50, 0, { heading: 90, bot: true }), peer("me", 0, 0)], "me", spec);
    ok("we are not among our own peers", ghosts.length === 1 && ghosts[0].id === "brain-red");
    ok("...and each one carries the id of the tank it owns", ghosts[0].tankId === "brain-red:0");
    ok("a bot says so", ghosts[0].bot);
    ok("a peer's heading comes back in radians", close(ghosts[0].angle, Math.PI / 2));
    ok("...and a peer with no z is on the ground", peerTanks([{ id: "p", x: 0, y: 0, heading: 0, hp: 100 }], "me", spec)[0].onGround);
    ok("a peer at hp 0 is dead", peerTanks([peer("p", 0, 0, { hp: 0 })], "me", spec)[0].dead);
}

// --- 4. a shot at a ghost, and the box it has to hit ----------------------------------------------------
{
    // The ghost faces +y, so it is six metres long along y and 2.8 wide along x. Turning its box with its
    // heading is not a nicety: a shot down its flank must miss and one at its nose must hit.
    const ghosts = peerTanks([peer("red", 50, 0, { heading: 90 })], "me", spec);
    const st = makeNetState();

    ok("a shot two metres off its flank misses", reportHits([{ pos: [52, 0, 1], dead: false }], ghosts, "me", st, 1).length === 0);
    ok("...and one 2.9 metres along its length hits", reportHits([{ pos: [50, 2.9, 1], dead: false }], ghosts, "me", st, 1).length === 1);
    ok("a shot under it misses", reportHits([{ pos: [50, 0, -0.1], dead: false }], ghosts, "me", st, 1).length === 0);
    ok("...and one over its roof too", reportHits([{ pos: [50, 0, 2.1], dead: false }], ghosts, "me", st, 1).length === 0);
    ok("a dead ghost cannot be hit again", reportHits([{ pos: [50, 0, 1], dead: false }], [{ ...ghosts[0], dead: true }], "me", st, 1).length === 0);

    const shot = { pos: [50, 0, 1], dead: false };
    const ev = reportHits([shot], ghosts, "me", st, 7)[0];
    ok("a hit is CONSUMED: the shot dies on our screen", shot.dead);
    ok("...and REPORTED, addressed to the tank's owner", ev.npcId === "red:0" && ev.from === "me");
    ok("the damage amount is 1, because one shot kills and the amount is meaningless", ev.dmgShield === 1);
    ok("...which is under validateDamage's cap of 2000, unlike the 9999 that killed nobody in v2184", ev.dmgShield < 2000);
    ok("our sequence never restarts", st.seq === 2 && reportHits([{ pos: [50, 0, 1], dead: false }], ghosts, "me", st, 8)[0].seq === 3);
}

// --- 5. the receiving end ---------------------------------------------------------------------------------
{
    const ids = ["browser", "brain-red"].sort();
    const shooter = makeNetState();
    const ghosts = peerTanks([peer("brain-red", 50, 0)], "browser", spec);
    const ev = reportHits([{ pos: [50, 0, 1], dead: false }], ghosts, "browser", shooter, 1)[0];

    const red = makeNetState();
    ok("the event is queued", queueDamage(red, ev));
    const r = ingestDamage(red, tankId("brain-red"), "brain-red", ids);
    ok("red accepts a hit on red's tank, and dies", r.killedBy === "browser" && r.taken === 1);

    // ...and nobody else does.
    const blue = makeNetState(); queueDamage(blue, ev);
    ok("the shooter does not accept its own report", ingestDamage(blue, tankId("browser"), "browser", ids).taken === 0);
    const other = makeNetState(); queueDamage(other, ev);
    ok("a bystander accepts nothing", ingestDamage(other, tankId("green"), "green", [...ids, "green"].sort()).taken === 0);

    // The replay guard. The ring redelivers; the owner does not die twice.
    const red2 = makeNetState();
    queueDamage(red2, ev); ingestDamage(red2, tankId("brain-red"), "brain-red", ids);
    queueDamage(red2, ev);
    ok("a replayed hit is dropped", ingestDamage(red2, tankId("brain-red"), "brain-red", ids).taken === 0);
    ok("...and an older sequence too", (() => { queueDamage(red2, { ...ev, seq: 0 }); return ingestDamage(red2, tankId("brain-red"), "brain-red", ids).taken === 0; })());

    // Two shooters number their events independently.
    const red3 = makeNetState();
    queueDamage(red3, { ...ev, from: "p1", seq: 9 }); ingestDamage(red3, tankId("brain-red"), "brain-red", ["brain-red", "p1", "p2"]);
    queueDamage(red3, { ...ev, from: "p2", seq: 1 });
    ok("a second shooter's low sequence is not mistaken for a replay", ingestDamage(red3, tankId("brain-red"), "brain-red", ["brain-red", "p1", "p2"]).taken === 1);

    // Junk, bounded.
    const flood = makeNetState();
    for (let i = 0; i < MAX_INBOUND + 50; i++) queueDamage(flood, { ...ev, seq: i + 1 });
    ok("the inbox is bounded: a flood costs a frame, never the loop", flood.inbox.length === MAX_INBOUND);
    ok("an event with no npcId is refused at the door", !queueDamage(makeNetState(), { type: "npcHit", from: "x" }));
    ok("...and one from another world", !queueDamage(makeNetState(), { ...ev, system: 99 }));
    ok("a self-reported hit on one's own tank is refused by validateDamage itself",
        validateDamage({ ...ev, npcId: tankId("brain-red"), from: "brain-red" }, "brain-red", ids, {}).reason === "self-reported hit on own npc");
}

// --- 6. who died, and who merely left -------------------------------------------------------------------------
{
    const st = makeNetState();
    ok("the first sighting of a peer is not a death", deadPeers(st, [peer("p", 0, 0)]).length === 0);
    ok("a wound is not a death", deadPeers(st, [peer("p", 0, 0, { hp: 30 })]).length === 0);
    ok("hp reaching zero, seen with our own eyes, is a death", deadPeers(st, [peer("p", 0, 0, { hp: 0 })]).join() === "p");
    ok("...counted once", deadPeers(st, [peer("p", 0, 0, { hp: 0 })]).length === 0);
    ok("...and again when they die again", (() => { deadPeers(st, [peer("p", 0, 0, { hp: 100 })]); return deadPeers(st, [peer("p", 0, 0, { hp: 0 })]).length === 1; })());

    // A peer who JUMPS OUT of the room looks exactly like one who died, if you only watch the peer list.
    const st2 = makeNetState();
    deadPeers(st2, [peer("q", 0, 0, { hp: 80 })]);
    ok("a peer who leaves is not a kill", deadPeers(st2, []).length === 0 && st2.prevHp.size === 0);
    ok("...and if they come back, their old hp is not held against them", deadPeers(st2, [peer("q", 0, 0, { hp: 100 })]).length === 0);
    ok("a peer reporting no hp at all is ignored, not assumed dead", deadPeers(makeNetState(), [{ id: "r", x: 0, y: 0 }]).length === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
