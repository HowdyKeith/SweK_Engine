// Self-check for ev/esAuthority.js — ES co-op authority.
//
// The two claims this module makes are: everyone sees the same NPCs, and exactly one peer simulates
// each. Both are testable without a network, because both are pure functions of information every peer
// already has. The churn test is the important one: it is the whole reason for rendezvous hashing over
// the obvious `peers[hash % n]`.
//
//   node ev/tools/es-authority-selfcheck.mjs

import { makeRng, hashStr, spawnSeed, ownerOf, ownsNpc, partition, validateDamage, noteAccepted, ghostAt, packNpcs, sanitizeNpc, mergeRemoteNpcs, MAX_NPCS_PER_PACKET } from "../esAuthority.js";
import { weightedPick } from "../combat.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// ---- deterministic spawn: same room + system -> same hostiles ------------------------
{
    const s1 = spawnSeed("room-a", 128), s2 = spawnSeed("room-a", 128);
    ok("same room+system -> same seed", s1 === s2);
    ok("different system -> different seed", spawnSeed("room-a", 129) !== s1);
    ok("different room -> different seed", spawnSeed("room-b", 128) !== s1);
    ok("seed is a 32-bit unsigned int", Number.isInteger(s1) && s1 >= 0 && s1 <= 0xffffffff);

    const a = makeRng(s1), b = makeRng(s2);
    const A = Array.from({ length: 8 }, () => a());
    const B = Array.from({ length: 8 }, () => b());
    ok("two peers draw the identical random stream", A.every((v, i) => v === B[i]));
    ok("the stream is not degenerate", new Set(A).size === A.length);
    ok("values are in [0,1)", A.every((v) => v >= 0 && v < 1));

    // and it actually drives combat.js, which is the point
    const rndA = makeRng(s1), rndB = makeRng(s2);
    const hA = Array.from({ length: 4 }, () => weightedPick([1, 2, 3, 4], rndA));
    const hB = Array.from({ length: 4 }, () => weightedPick([1, 2, 3, 4], rndB));
    ok("combat.js's own weightedPick is reproducible under the seed", hA.every((v, i) => v === hB[i]));
}

// ---- ownership: total, deterministic, single-owner ------------------------------------
{
    const peers = ["p3", "p1", "p2"];
    ok("owner is deterministic", ownerOf("npc9", peers) === ownerOf("npc9", peers));
    ok("owner does not depend on peer list ORDER",
        ownerOf("npc9", ["p1", "p2", "p3"]) === ownerOf("npc9", ["p3", "p2", "p1"]));
    ok("owner is one of the peers", peers.includes(ownerOf("npc9", peers)));
    ok("no peers -> no owner (nobody simulates, nothing is claimed)", ownerOf("npc9", []) === null);
    ok("single peer owns everything", ownerOf("npcX", ["solo"]) === "solo");
    ok("ownsNpc agrees with ownerOf", ownsNpc(ownerOf("npc9", peers), "npc9", peers) === true);
    ok("a non-owner does not own it", ownsNpc("nobody", "npc9", peers) === false);

    // exactly one owner per npc, across the whole population
    let multi = 0;
    for (let i = 0; i < 200; i++) {
        const o = ownerOf("npc" + i, peers);
        const owners = peers.filter((p) => ownsNpc(p, "npc" + i, peers));
        if (owners.length !== 1 || owners[0] !== o) multi++;
    }
    ok("exactly one owner per npc, 200/200", multi === 0);
}

// ---- distribution: no peer carries the whole system -----------------------------------
{
    const peers = ["a", "b", "c", "d"];
    const count = Object.fromEntries(peers.map((p) => [p, 0]));
    for (let i = 0; i < 4000; i++) count[ownerOf("npc" + i, peers)]++;
    const share = peers.map((p) => count[p] / 4000);
    const worst = Math.max(...share), best = Math.min(...share);
    ok("load is roughly even across peers (each within 20% of fair)",
        worst < 0.25 * 1.2 && best > 0.25 * 0.8);
}

// ---- THE CHURN TEST: why rendezvous hashing, and not `hash % n` ------------------------
// When a pilot jumps out, ownership of only THEIR npcs should move. Under modulo, n changes and
// essentially every npc is reassigned — the system stutters as every ship changes hands at once.
{
    const before = ["a", "b", "c", "d"];
    const after = ["a", "b", "c"];              // "d" left
    const N = 3000;

    let moved = 0, movedFromD = 0;
    for (let i = 0; i < N; i++) {
        const o1 = ownerOf("npc" + i, before), o2 = ownerOf("npc" + i, after);
        if (o1 !== o2) { moved++; if (o1 === "d") movedFromD++; }
    }
    ok("only the departed peer's npcs change hands", moved === movedFromD);
    ok("churn is about 1/n, not everything", moved / N > 0.15 && moved / N < 0.35);

    // the naive scheme, for contrast — this is what we are NOT doing
    const modOwner = (id, ps) => ps[hashStr(id) % ps.length];
    let modMoved = 0;
    for (let i = 0; i < N; i++) if (modOwner("npc" + i, before) !== modOwner("npc" + i, after)) modMoved++;
    ok("modulo hashing would reassign most npcs (>50%) — the bug we avoided", modMoved / N > 0.5);

    // joining is symmetric: a new peer takes a fair share and disturbs nothing else
    const joined = ["a", "b", "c", "d", "e"];
    let toE = 0, otherMoved = 0;
    for (let i = 0; i < N; i++) {
        const o1 = ownerOf("npc" + i, before), o2 = ownerOf("npc" + i, joined);
        if (o1 !== o2) { if (o2 === "e") toE++; else otherMoved++; }
    }
    ok("a joining peer only takes npcs, never shuffles the rest", otherMoved === 0 && toE > 0);
}

// ---- damage authority: only the owner applies ------------------------------------------
{
    const peers = ["p1", "p2"];
    const npc = "npc42";
    const owner = ownerOf(npc, peers), other = peers.find((p) => p !== owner);

    const good = { npcId: npc, dmgShield: 10, dmgArmor: 5, from: other, seq: 1 };
    ok("owner accepts a well-formed hit", validateDamage(good, owner, peers).ok === true);
    ok("a non-owner refuses to apply it", validateDamage(good, other, peers).ok === false);
    ok("...and says why", validateDamage(good, other, peers).reason === "not my npc");

    ok("missing npcId rejected", validateDamage({ dmgShield: 1, dmgArmor: 0 }, owner, peers).ok === false);
    ok("NaN damage rejected", validateDamage({ npcId: npc, dmgShield: NaN, dmgArmor: 0 }, owner, peers).ok === false);
    ok("negative damage rejected (no healing by gunfire)",
        validateDamage({ npcId: npc, dmgShield: -50, dmgArmor: 0 }, owner, peers).ok === false);
    ok("absurd damage rejected (cap)",
        validateDamage({ npcId: npc, dmgShield: 1e9, dmgArmor: 0 }, owner, peers).ok === false);
    ok("owner reporting a hit on its own npc is rejected (no self-inflicted authority)",
        validateDamage({ npcId: npc, dmgShield: 1, dmgArmor: 1, from: owner }, owner, peers).ok === false);

    // replay guard
    const seen = new Map();
    const e1 = { npcId: npc, dmgShield: 5, dmgArmor: 0, from: other, seq: 7 };
    ok("first event accepted", validateDamage(e1, owner, peers, { seen }).ok === true);
    noteAccepted(seen, e1);
    ok("the same event replayed is rejected", validateDamage(e1, owner, peers, { seen }).ok === false);
    ok("an older seq is rejected",
        validateDamage({ ...e1, seq: 3 }, owner, peers, { seen }).ok === false);
    ok("a newer seq is accepted",
        validateDamage({ ...e1, seq: 8 }, owner, peers, { seen }).ok === true);
}

// ---- ghosts: extrapolate position, never invent state -----------------------------------
{
    const st = { id: "n1", x: 0, y: 0, vx: 100, vy: 0, heading: 90, shield: 40, armor: 20, t: 1000 };
    const g = ghostAt(st, 1500);
    ok("ghost dead-reckons position", Math.abs(g.x - 50) < 1e-6);
    ok("ghost keeps the owner's hull numbers verbatim", g.shield === 40 && g.armor === 20);
    ok("ghost is marked as such", g.ghost === true);

    const far = ghostAt(st, 5000);
    ok("extrapolation is capped (never dead-reckon a lost peer across the map)", far.x === 50);
    ok("...and the ghost reports that it is stale", far.stale === true);
    ok("a fresh ghost is not stale", ghostAt(st, 1100).stale === false);
    ok("no state -> no ghost", ghostAt(null, 1000) === null);
}

// ---- replication: a peer may only speak for what it owns --------------------------------
{
    const peers = ["p1", "p2"];
    const npcs = Array.from({ length: 12 }, (_, i) => ({ id: "n" + i, x: i, y: 0, vx: 1, vy: 2, heading: 30, shield: 10, armor: 5 }));
    const mine = npcs.filter((n) => ownsNpc("p1", n.id, peers));
    const theirs = npcs.filter((n) => ownsNpc("p2", n.id, peers));
    ok("the two peers' owned sets are disjoint and complete",
        mine.length + theirs.length === 12 && mine.length > 0 && theirs.length > 0);

    const pkt = packNpcs(npcs, "p1", peers);
    ok("packNpcs only packs what I own", pkt.length === mine.length);
    ok("packed fields are rounded ints", pkt.every((n) => Number.isInteger(n.x) && Number.isInteger(n.heading)));
    ok("alive npcs carry no dead flag (bytes matter at 10Hz)", pkt.every((n) => n.dead === undefined));
    ok("packNpcs respects the per-packet cap",
        packNpcs(Array.from({ length: 500 }, (_, i) => ({ id: "z" + i })), "p1", ["p1"]).length === MAX_NPCS_PER_PACKET);

    // honest merge
    const good = mergeRemoteNpcs([{ from: "p2", npcs: packNpcs(npcs, "p2", peers), t: 100 }], "p1", peers);
    ok("merge accepts a peer's own npcs", good.taken === theirs.length && good.dropped === 0);
    ok("...and I never ingest ghosts of my own ships",
        [...good.states.keys()].every((id) => !ownsNpc("p1", id, peers)));

    // THE SPOOF: p2 claims p1's npcs. Ownership is computable by the receiver, so there is nothing to
    // negotiate — we simply drop the claim. Without this, any peer can teleport your ships or
    // resurrect the one you just killed.
    const spoof = mergeRemoteNpcs([{ from: "p2", npcs: packNpcs(npcs, "p1", peers), t: 100 }], "p1", peers);
    ok("a peer claiming npcs it does not own is rejected wholesale",
        spoof.taken === 0 && spoof.dropped === mine.length);

    // our own echo is ignored
    const echo = mergeRemoteNpcs([{ from: "p1", npcs: packNpcs(npcs, "p1", peers), t: 100 }], "p1", peers);
    ok("our own broadcast echoed back is ignored", echo.taken === 0);

    // freshest wins
    const a = { from: "p2", npcs: [{ id: theirs[0].id, x: 1, y: 0 }], t: 100 };
    const b = { from: "p2", npcs: [{ id: theirs[0].id, x: 999, y: 0 }], t: 200 };
    const m = mergeRemoteNpcs([b, a], "p1", peers);
    ok("the freshest state wins regardless of packet order", m.states.get(theirs[0].id).x === 999);
}

// ---- replication: bound everything -------------------------------------------------------
{
    const peers = ["p1", "p2"];
    const id = Array.from({ length: 30 }, (_, i) => "n" + i).find((n) => ownsNpc("p2", n, peers));

    ok("NaN coordinates become 0, not NaN", sanitizeNpc({ id, x: NaN, y: 5 }).x === 0);
    ok("Infinity is clamped, not propagated", Number.isFinite(sanitizeNpc({ id, x: Infinity }).x));
    ok("absurd coordinates are clamped to the system scale", sanitizeNpc({ id, x: 1e308 }).x === 1e7);
    ok("negative hull is floored at zero (no negative shields)", sanitizeNpc({ id, shield: -50 }).shield === 0);
    ok("an npc with no id is dropped", sanitizeNpc({ x: 1 }) === null);

    const flood = { from: "p2", npcs: Array.from({ length: 5000 }, () => ({ id, x: 1 })), t: 1 };
    const r = mergeRemoteNpcs([flood], "p1", peers);
    ok("a flood packet cannot blow up the frame (cap enforced on receive)", r.taken <= MAX_NPCS_PER_PACKET);
    ok("garbage packets are survivable", mergeRemoteNpcs([null, { from: "p2" }, 7], "p1", peers).taken === 0);
}

// ---- partition ---------------------------------------------------------------------------
{
    const peers = ["p1", "p2"];
    const npcs = Array.from({ length: 50 }, (_, i) => ({ id: "n" + i }));
    const a = partition("p1", npcs, peers), b = partition("p2", npcs, peers);
    ok("every npc is simulated by exactly one peer",
        a.mine.length + b.mine.length === npcs.length);
    ok("what I own, you ghost", a.mine.length === b.theirs.length && b.mine.length === a.theirs.length);
    ok("no npc is owned twice",
        a.mine.every((n) => !b.mine.some((m) => m.id === n.id)));
    const solo = partition("p1", npcs, ["p1"]);
    ok("single player owns everything, ghosts nothing", solo.mine.length === 50 && solo.theirs.length === 0);
    const orphan = partition("p1", npcs, []);
    ok("no peers -> nothing simulated (do not claim what you cannot own)", orphan.mine.length === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
