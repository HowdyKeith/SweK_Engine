// Self-check for the ES co-op DAMAGE WIRE — the path a hit takes from the client that fired it to
// the client that owns the ship it landed on.
//
// The rule the whole file exists to defend: a peer may SHOOT anything, and may only APPLY damage to
// what it owns. Everything else is an addressed event, validated by the owner and by nobody else.
//
// Two v2170 bugs are pinned here so they cannot come back quietly:
//
//   * OWNERSHIP CROSSED THE WORLDS. HRW distributed every npc id across every peer, including ids
//     only one peer had ever spawned. Measured: one browser + one brain, and the ring handed the
//     brain 2 of the browser's 8 hostiles (nobody simulated them) and the browser 5 of the brain's 8
//     (it had no entity for any of them). Wing ids ("<peer>:<n>") now go straight back to their
//     spawner. Asserted below, on the exact peer ids that produced the measurement.
//
//   * A KILL WAS NEVER ANNOUNCED. An owner that stops broadcasting a ship it destroyed leaves every
//     other client dead-reckoning a corpse forever. noteDead/deadPack keep saying so for a grace
//     window.
//
//   node ev/tools/es-damage-selfcheck.mjs

import {
    ownerOf, ownsNpc, spawnerOf, wingId, weight,
    validateDamage, noteAccepted, damageEvent, applyDamageEvent,
    makeDeadBoard, noteDead, deadPack, DEAD_GRACE_MS,
    packNpcs, mergeRemoteNpcs, sanitizeNpc, ghostAt, namespaceWing,
} from "../esAuthority.js";
import { applyDamage } from "../combat.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// --- 1. the copied damage rule has not drifted from combat.js -----------------------------
// esAuthority imports nothing, on purpose, so applyDamageEvent restates combat.applyDamage. A restated
// rule is a rule that can rot. Compare them across a grid rather than trusting the comment.
{
    let same = true, cases = 0;
    for (const shield of [0, 1, 7, 40, 100]) {
        for (const armor of [1, 5, 60]) {
            for (const ds of [0, 3, 41, 150]) {
                for (const da of [0, 2, 99]) {
                    const a = { shield, armor }, b = { shield, armor };
                    const da1 = applyDamage(a, ds, da);
                    const db1 = applyDamageEvent(b, { dmgShield: ds, dmgArmor: da });
                    cases++;
                    if (da1 !== db1 || a.shield !== b.shield || a.armor !== b.armor) same = false;
                }
            }
        }
    }
    ok(`applyDamageEvent agrees with combat.applyDamage on all ${cases} cases`, same);
}

// --- 2. a private wing belongs to its spawner, always --------------------------------------
{
    ok("a wing id names its spawner", spawnerOf("brain-abc:3") === "brain-abc");
    ok("a bare id names nobody", spawnerOf("7") === null && spawnerOf(7) === null);
    ok("wingId composes", wingId("brain-abc", 3) === "brain-abc:3");
    let threw = false;
    try { wingId("bad:id", 0); } catch (e) { threw = true; }
    ok("a peer id containing ':' is rejected, not silently mangled", threw);

    const peers = ["brain-abc", "browser-1"].sort();
    ok("the spawner owns its wing", ownerOf("brain-abc:3", peers) === "brain-abc");
    ok("...whoever else is in the room", ownerOf("brain-abc:3", ["browser-1", "browser-2"]) === "brain-abc");
    ok("...and even with no room at all", ownerOf("brain-abc:3", []) === "brain-abc");
    ok("a browser is never handed a brain's ship",
        [...Array(8).keys()].every((i) => !ownsNpc("browser-1", wingId("brain-abc", i), peers)));

    // THE v2170 REGRESSION, in the numbers that were measured.
    const wing = [...Array(8).keys()].map((i) => wingId("brain-abc", i));
    ok("v2170: the browser was told it owned 5 of the brain's 8 ships -- now it owns 0",
        wing.filter((id) => ownsNpc("browser-1", id, peers)).length === 0);
    ok("...and the brain owns all 8 of its own",
        wing.filter((id) => ownsNpc("brain-abc", id, peers)).length === 8);
}

// --- 3. the shared, deterministic world still rides the ring, untouched ---------------------
{
    const peers = ["a", "b", "c", "d"];
    const ids = [...Array(400).keys()].map((i) => "n" + i);
    const counts = new Map(peers.map((p) => [p, 0]));
    for (const id of ids) counts.set(ownerOf(id, peers), counts.get(ownerOf(id, peers)) + 1);
    const share = [...counts.values()].map((n) => n / ids.length);
    ok("bare ids still spread evenly across the ring (HRW untouched)",
        share.every((s) => s > 0.15 && s < 0.35));

    // and the property HRW exists for: a departure moves only the departed peer's ships
    const after = ["a", "b", "c"];
    const moved = ids.filter((id) => ownerOf(id, peers) !== ownerOf(id, after)).length;
    ok("one peer leaving churns ~1/n of the world, not all of it", moved / ids.length < 0.35);
    ok("weight() is still a pure function of the pair", weight("n1", "a") === weight("n1", "a"));
}

// --- 4. the round trip: shoot, report, apply, die -------------------------------------------
{
    const ME = "brain-x", THEM = "browser-1";
    const peers = [ME, THEM].sort();
    const npc = { id: wingId(ME, 0), name: "Raider", shield: 20, armor: 10, maxShield: 80, maxArmor: 60 };
    const seen = new Map();

    // the shooter builds the event; it never touches the hull
    const ev = damageEvent(npc.id, THEM, 1, 6, 4, 128, 1000);
    ok("the event is addressed by npc, not by peer", ev.npcId === npc.id && ev.from === THEM && ev.type === "npcHit");
    ok("damage is rounded to ints for the wire", Number.isInteger(ev.dmgShield) && Number.isInteger(ev.dmgArmor));

    // the owner validates, then applies
    const v = validateDamage(ev, ME, peers, { seen });
    ok("the owner accepts a hit on its own ship", v.ok);
    noteAccepted(seen, ev);
    ok("shields absorb first", applyDamageEvent(npc, ev) === false && npc.shield === 10 && npc.armor === 10);

    // ...and nobody else does
    ok("a bystander rejects the same event", validateDamage(ev, THEM, peers, {}).reason === "not my npc");
    ok("a third peer rejects it too", validateDamage(ev, "browser-2", peers, {}).ok === false);

    // replay: the ring redelivers, the owner does not double-count
    ok("a replayed sequence is dropped", validateDamage(ev, ME, peers, { seen }).reason === "stale or replayed seq");
    const older = damageEvent(npc.id, THEM, 0, 999, 999, 128, 1001);
    ok("an older sequence is dropped", validateDamage(older, ME, peers, { seen }).ok === false);
    ok("the hull was not touched by either", npc.shield === 10 && npc.armor === 10);

    // the next shot lands, and finishes it
    const ev2 = damageEvent(npc.id, THEM, 2, 15, 10, 128, 1100);
    ok("the next sequence is accepted", validateDamage(ev2, ME, peers, { seen }).ok);
    noteAccepted(seen, ev2);
    ok("the ship dies when armor reaches zero", applyDamageEvent(npc, ev2) === true && npc.armor <= 0);
}

// --- 5. validateDamage is suspicious of everything -------------------------------------------
{
    const ME = "brain-x", peers = [ME, "p"].sort();
    const id = wingId(ME, 1);
    const bad = (ev) => validateDamage(ev, ME, peers, {});
    ok("no npcId -> rejected", bad({ dmgShield: 1, dmgArmor: 1 }).reason === "no npcId");
    ok("someone else's ship -> rejected", bad(damageEvent(wingId("other", 1), "p", 1, 1, 1)).reason === "not my npc");
    ok("NaN damage -> rejected", bad({ npcId: id, dmgShield: NaN, dmgArmor: 0 }).reason === "damage not finite");
    ok("Infinity -> rejected", bad({ npcId: id, dmgShield: Infinity, dmgArmor: 0 }).ok === false);
    ok("negative damage (a heal) -> rejected", bad({ npcId: id, dmgShield: -50, dmgArmor: 0 }).reason === "negative damage");
    ok("damage above the cap -> rejected", bad({ npcId: id, dmgShield: 1e6, dmgArmor: 0 }).reason === "damage above cap");
    ok("a hit we reported on our OWN ship -> rejected",
        validateDamage({ npcId: id, from: ME, seq: 1, dmgShield: 5, dmgArmor: 5 }, ME, peers, {}).reason === "self-reported hit on own npc");
    ok("a cap can be tightened by the caller",
        validateDamage({ npcId: id, dmgShield: 50, dmgArmor: 0 }, ME, peers, { maxDamage: 10 }).ok === false);

    // two shooters number their events independently; one must not gate the other
    const seen = new Map();
    const a = damageEvent(id, "p1", 5, 1, 1), b = damageEvent(id, "p2", 1, 1, 1);
    noteAccepted(seen, a);
    ok("a second shooter's low sequence is not mistaken for a replay", validateDamage(b, ME, peers, { seen }).ok);
}

// --- 6. a kill is announced, then forgotten ---------------------------------------------------
{
    const board = makeDeadBoard();
    const npc = { id: "brain-x:2", x: 10.4, y: -3.6, vx: 0, vy: 0, heading: 90, shield: 0, armor: -4 };
    noteDead(board, npc, 1000);
    const pk = deadPack(board, 1000);
    ok("the dead are announced", pk.length === 1 && pk[0].id === npc.id && pk[0].dead === 1);
    ok("...with a hull of zero, not a negative one", pk[0].shield === 0 && pk[0].armor === 0);
    ok("...and go on being announced through the grace window", deadPack(board, 1000 + DEAD_GRACE_MS - 1).length === 1);
    ok("...then stop", deadPack(board, 1000 + DEAD_GRACE_MS + 1).length === 0);
    ok("...and the board does not grow without end", board.size === 0);
}

// --- 6b. v2172: the announcement names the killer ---------------------------------------------
// A shooter swallows its own shot and never touches the hull, so without this it can never learn that
// the hit landed. The owner says who finished it; only that peer scores it.
{
    const board = makeDeadBoard();
    const npc = { id: "brain-x:2", x: 0, y: 0, vx: 0, vy: 0, heading: 0, shield: 0, armor: 0 };
    noteDead(board, npc, 1000, "browser-1");
    const pk = deadPack(board, 1000)[0];
    ok("the kill names its killer", pk.by === "browser-1");
    ok("the credit survives sanitising (it is a whitelisted field)", sanitizeNpc(pk).by === "browser-1");
    ok("...bounded, like everything else on the wire", sanitizeNpc({ ...pk, by: "x".repeat(500) }).by.length === 64);
    ok("...and reaches the ghost the renderer sees", ghostAt({ ...sanitizeNpc(pk), t: 1000 }, 1000).by === "browser-1");

    const anon = makeDeadBoard();
    noteDead(anon, npc, 1000);
    ok("a kill with no named killer is still announced", deadPack(anon, 1000)[0].dead === 1);
    ok("...it simply credits nobody", deadPack(anon, 1000)[0].by === undefined);
}

// --- 6c. v2172: namespaceWing ------------------------------------------------------------------
{
    const ships = [{ id: 1 }, { id: 2 }];
    namespaceWing(ships, "p1", "m");
    ok("a private wing is stamped with its spawner", ships.every((e) => spawnerOf(e.id) === "p1"));
    ok("...and the tag keeps two wings apart", namespaceWing([{ id: 1 }], "p1", "p")[0].id !== ships[0].id);
    ok("no peer id -> untouched (solo play)", namespaceWing([{ id: 9 }], null, "m")[0].id === 9);
    ok("a non-array is survivable", Array.isArray(namespaceWing(null, "p1", "m")));
    let threw = false;
    try { namespaceWing([{ id: 1 }], "bad:peer", "m"); } catch (e) { threw = true; }
    ok("a peer id with a colon is rejected, not silently mangled", threw);
}

// --- 7. replication still refuses a claim the sender has no right to ---------------------------
{
    const ME = "browser-1", BRAIN = "brain-abc";
    const world = [ME, BRAIN].sort();
    const brainWing = [0, 1, 2].map((i) => ({ id: wingId(BRAIN, i), x: i, y: 0, vx: 0, vy: 0, heading: 0, shield: 5, armor: 5 }));

    const good = mergeRemoteNpcs([{ from: BRAIN, npcs: packNpcs(brainWing, BRAIN, world), t: 1 }], ME, world, { now: 2 });
    ok("a brain's wing is accepted from the brain", good.taken === 3 && good.dropped === 0);

    const forged = mergeRemoteNpcs([{ from: "browser-2", npcs: brainWing.map((e) => ({ ...e })), t: 1 }], ME, world, { now: 2 });
    ok("...and rejected wholesale from anyone else", forged.taken === 0 && forged.dropped === 3);

    ok("a browser cannot pack a wing it does not own", packNpcs(brainWing, ME, world).length === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
