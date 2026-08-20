// Self-check for ES co-op replication — two peers over the real presence stack.
//
// The second peer here is deliberately HEADLESS: it never touches a canvas. It joins, is handed ships
// by rendezvous hashing, decides with esTactics, moves them, and broadcasts. That is exactly the shape
// of "the GPU Brain as a connecting client", and this test exists to prove the shape is real rather
// than plausible: combat.js, esTactics.js and esAuthority.js contain no browser API, and the HTTP
// presence transport needs only fetch.
//
//   node ev/tools/es-coop-selfcheck.mjs

import { PresenceManager, makeNet } from "../presence.js";
import { spawnEnemies, stepAI } from "../combat.js";
import { DEFAULT_W, decide as tacticsDecide } from "../esTactics.js";
import { makeRng, spawnSeed, ownsNpc, packNpcs, mergeRemoteNpcs, ghostAt,
    damageEvent, validateDamage, noteAccepted, applyDamageEvent, makeDeadBoard, noteDead, deadPack } from "../esAuthority.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// --- a shared wire both peers speak over -------------------------------------------------
const bus = [];
const mkT = () => ({ kind: "test", _f: null, send: (m) => bus.push(m), onMessage(f) { this._f = f; }, close() {} });
const tA = mkT(), tB = mkT();
const mA = new PresenceManager("pA"), mB = new PresenceManager("pB");
const netA = makeNet(mA, tA), netB = makeNet(mB, tB);
const pump = () => { while (bus.length) { const m = bus.shift(); if (m.id !== "pA") tA._f && tA._f(m); if (m.id !== "pB") tB._f && tB._f(m); } };

const SYS = 128, ROOM = "coop-test";
const classes = [{ id: 1, name: "Raider", shield: 80, armor: 60, speed: 350, accel: 250, turn: 100 }];
const spawn = () => spawnEnemies(classes, {}, { x: 0, y: 0 },
    { count: 8, speedScale: 1, minR: 1100, spread: 800, rnd: makeRng(spawnSeed(ROOM, SYS)) })
    .map((e, i) => ({ ...e, id: "n" + i, dps: 10, maxShield: e.shield, maxArmor: e.armor }));

// --- 1. both peers spawn the same world --------------------------------------------------
const worldA = spawn(), worldB = spawn();
ok("both peers spawn identical hostiles from (room, system)",
    JSON.stringify(worldA.map((e) => [e.id, e.x.toFixed(3), e.y.toFixed(3), e.heading.toFixed(3)]))
    === JSON.stringify(worldB.map((e) => [e.id, e.x.toFixed(3), e.y.toFixed(3), e.heading.toFixed(3)])));

// --- 2. they find each other, and agree who owns what -------------------------------------
netA.send({ name: "A", system: SYS, x: 0, y: 0, vx: 0, vy: 0, heading: 0 });
netB.send({ name: "B", system: SYS, x: 0, y: 0, vx: 0, vy: 0, heading: 0 });
pump();

const idsA = netA.peerIds(SYS), idsB = netB.peerIds(SYS);
ok("peer sets agree", JSON.stringify(idsA) === JSON.stringify(idsB));
ok("the peer set is scoped and sorted", idsA.length === 2 && idsA[0] === "pA");

const ownA = worldA.filter((e) => ownsNpc("pA", e.id, idsA));
const ownB = worldB.filter((e) => ownsNpc("pB", e.id, idsB));
ok("ownership partitions the world exactly once", ownA.length + ownB.length === worldA.length);
ok("both peers get ships (8 npcs, 2 peers)", ownA.length > 0 && ownB.length > 0);
ok("nobody owns the same ship twice", ownA.every((a) => !ownB.some((b) => b.id === a.id)));

// --- 3. peer B is HEADLESS: it decides + moves its ships, and never draws anything ---------
const player = { id: "pA", x: 0, y: 0, team: "player", isPlayer: true, shield: 100, armor: 100, maxShield: 100, maxArmor: 100 };
let decided = 0, fired = 0;
function brainTick(owned, dt) {
    for (const e of owned) {
        const d = tacticsDecide(e, [player], DEFAULT_W, { lastTargetId: e._tgtId, range: 1400 });
        if (!d.target) continue;
        decided++;
        e._tgtId = d.target.id;
        const ai = stepAI(e, d.target, { range: 1400, standoff: 160 });
        if (ai.firing) fired++;
        // move: intent -> motion. Physics is not the point here; authority and replication are.
        const rad = (e.heading * Math.PI) / 180;
        if (ai.thrust) { e.vx += Math.cos(rad) * 120 * dt; e.vy += Math.sin(rad) * 120 * dt; }
        e.heading += ai.turn * 90 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
    }
}

const startX = new Map(ownB.map((e) => [e.id, e.x]));
for (let i = 0; i < 30; i++) brainTick(ownB, 1 / 30);
ok("the headless peer decided a target for every ship it owns", decided >= ownB.length);
ok("...and its ships actually moved", ownB.some((e) => Math.abs(e.x - startX.get(e.id)) > 1));
ok("...and it engaged (stepAI reported firing at least once)", fired > 0);

// --- 4. it broadcasts; peer A adopts the ghosts -------------------------------------------
netB.send({ name: "B", system: SYS, x: 0, y: 0, vx: 0, vy: 0, heading: 0, npcs: packNpcs(ownB, "pB", idsB) });
pump();

const packets = netA.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length)
    .map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
ok("peer A received a packet carrying npcs", packets.length === 1 && packets[0].npcs.length === ownB.length);

const now = Date.now();
const merged = mergeRemoteNpcs(packets, "pA", idsA, { now });
ok("every broadcast ship was accepted", merged.taken === ownB.length && merged.dropped === 0);
ok("peer A did not ingest ghosts of its OWN ships",
    [...merged.states.keys()].every((id) => !ownsNpc("pA", id, idsA)));

let adopted = 0;
for (const e of worldA) {
    if (ownsNpc("pA", e.id, idsA)) continue;
    const g = ghostAt(merged.states.get(e.id), now);
    if (!g) continue;
    e.x = g.x; e.y = g.y; e.heading = g.heading; e.shield = g.shield; e.armor = g.armor; e._ghost = true;
    adopted++;
}
ok("peer A adopted every foreign ship as a ghost", adopted === ownB.length);

const converged = worldA.filter((e) => e._ghost).every((e) => {
    const truth = ownB.find((b) => b.id === e.id);
    return Math.abs(e.x - truth.x) <= 1 && Math.abs(e.y - truth.y) <= 1;   // packed as ints
});
ok("CONVERGED: peer A sees the headless peer's ships where it actually put them", converged);
ok("...and peer A is not simulating them (they are marked ghosts)",
    worldA.filter((e) => e._ghost).length === ownB.length);

// --- 5. authority holds under attack -------------------------------------------------------
{
    const spoof = mergeRemoteNpcs([{ from: "pB", npcs: packNpcs(ownA, "pA", idsA), t: now }], "pA", idsA);
    ok("a peer claiming ships it does not own is rejected wholesale",
        spoof.taken === 0 && spoof.dropped === ownA.length);

    const echo = mergeRemoteNpcs([{ from: "pA", npcs: packNpcs(ownA, "pA", idsA), t: now }], "pA", idsA);
    ok("our own broadcast echoed back is ignored", echo.taken === 0);
}

// --- 6. a silent owner goes stale, it does not teleport ------------------------------------
{
    const st = merged.states.get(ownB[0].id);
    const fresh = ghostAt(st, st.t + 200);
    const old = ghostAt(st, st.t + 30000);
    ok("a fresh ghost is not stale", fresh.stale === false);
    ok("a long-silent owner's ghost is flagged stale, not flung across the map",
        old.stale === true && Math.abs(old.x - fresh.x) < 1e6);
}

// --- 7. the headless peer leaves; its ships are reassigned, nobody else's move -------------
{
    const after = ["pA"];
    const movedToA = worldA.filter((e) => !ownsNpc("pA", e.id, idsA) && ownsNpc("pA", e.id, after));
    const stillMine = worldA.filter((e) => ownsNpc("pA", e.id, idsA));
    ok("when the headless peer leaves, its ships fall to the survivor", movedToA.length === ownB.length);
    ok("...and the survivor's own ships never changed hands",
        stillMine.every((e) => ownsNpc("pA", e.id, after)));
}

// --- 8. v2171: the shot A fires at B's ship is resolved by B, and A watches it die ----------
// This is the whole point of the round. Before it, A's shots passed through B's ships: A was not
// allowed to touch their hulls and had no way to tell B it had hit them, so they were invulnerable.
{
    const victim = ownB[0];
    const seen = new Map();
    const board = makeDeadBoard();
    const hull = victim.shield + victim.armor;

    // A fires. It resolves nothing locally -- it reports.
    const ev = damageEvent(victim.id, "pA", 1, 6, 4, SYS, 1000);
    ok("A does not touch the hull of a ship it does not own", victim.shield + victim.armor === hull);

    // Everyone on the bus sees the event. Only B may act on it.
    ok("A itself would reject its own report", validateDamage(ev, "pA", idsA, {}).ok === false);
    ok("B accepts a hit on the ship it owns", validateDamage(ev, "pB", idsB, { seen }).ok === true);
    noteAccepted(seen, ev);
    applyDamageEvent(victim, ev);
    ok("...and B is the one that moves the hull", victim.shield + victim.armor === hull - 10);

    // A keeps firing until it is dead. B announces the kill on the packet it already sends.
    let seq = 1, guard = 0;
    while (!victim.dead && guard++ < 200) {
        const e2 = damageEvent(victim.id, "pA", ++seq, 6, 4, SYS, 1000 + seq);
        if (!validateDamage(e2, "pB", idsB, { seen }).ok) break;
        noteAccepted(seen, e2);
        if (applyDamageEvent(victim, e2)) victim.dead = true;
    }
    ok("enough reported hits destroy it", victim.dead === true && guard < 200);
    noteDead(board, victim, 2000);

    const now2 = 2000;
    netB.send({ name: "B", system: SYS, x: 0, y: 0, vx: 0, vy: 0, heading: 0,
        npcs: deadPack(board, now2).concat(packNpcs(ownB.filter((e) => !e.dead), "pB", idsB)) });
    pump();

    const pkts = netA.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length)
        .map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
    const st3 = mergeRemoteNpcs(pkts, "pA", idsA, { now: now2 }).states.get(victim.id);
    ok("the kill rides the presence packet B already sends", !!st3 && st3.dead === true);

    const ghost = ghostAt(st3, now2);
    ok("A sees the ship it shot come apart, instead of dead-reckoning a corpse", ghost.dead === true);
    ok("...and the announcement stops once everyone has had time to hear it",
        deadPack(board, now2 + 5000).length === 0);
}

netA.close(); netB.close();
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
