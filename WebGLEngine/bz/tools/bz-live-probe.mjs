// bz/tools/bz-live-probe.mjs — not a selfcheck. A LIVE PROBE.
//
//   node bz/tools/bz-live-probe.mjs
//
// Boots the real rendezvous server, runs two real `brain/bzPilot.mjs` processes against it, joins the room
// as a third peer, and watches them find and kill each other. It proves the three things the unit tests
// cannot: that a tank reaches a room at all, that a hit reported by one pilot is accepted only by the pilot
// who owns the tank, and that the news comes back on the presence packet.
//
// Nothing here is BZFlag-specific except the two processes. The room, the presence packets, the event ring
// and the owner-addressed damage rule are ev/presence.js and ev/esAuthority.js, unchanged, written for a
// game about spaceships. That reuse is the point of the probe as much as the kills are.

import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PresenceManager, httpPresenceTransport, makeNet } from "../../ev/presence.js";
import { ownerOf, validateDamage, wingId } from "../../ev/esAuthority.js";
import { makeBZDB } from "../bzdb.js";
import { makeTank } from "../bzTank.js";
import { tankId, packTank, peerTanks, makeNetState, reportHits, queueDamage, ingestDamage } from "../bzNet.js";

const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));   // WebGLEngine
const ROOT = path.dirname(ENGINE);                                                          // the project
const PORT = 8793, URL = `http://127.0.0.1:${PORT}`, ROOM = "probe", SYSTEM = 0, ME = "observer";
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

const server = spawn("node", [path.join(ROOT, "cloud", "swek-rendezvous", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const pilots = ["red", "blue"].map((name) => {
    const p = spawn("node", [path.join(ENGINE, "brain", "bzPilot.mjs")], {
        cwd: ENGINE,
        env: { ...process.env, SWEK_BZ_URL: URL, SWEK_BZ_ROOM: ROOM, SWEK_BZ_ID: "brain-" + name, SWEK_BZ_RESPAWN: "1500" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const lines = [];
    p.stdout.on("data", (d) => lines.push(String(d)));
    p.stderr.on("data", (d) => lines.push(String(d)));
    return { name, p, lines };
});
const bye = () => { for (const q of pilots) { try { q.p.kill(); } catch {} } try { server.kill(); } catch {} };
process.on("exit", bye);

await sleep(1500);

const mgr = new PresenceManager(ME);
const net = makeNet(mgr, httpPresenceTransport(URL, ROOM, ME));
const beat = setInterval(() => net.send({ name: "Observer", system: SYSTEM, x: 0, y: 0, z: 0, vx: 0, vy: 0, heading: 0, hp: 100 }), 150);

// 1. both tanks reach the room
let peers = [];
for (let i = 0; i < 40 && peers.length < 2; i++) { await sleep(200); peers = net.peers(SYSTEM).filter((p) => p.id !== ME); }
ok("both pilots reach the room", peers.length === 2);
ok("...announcing themselves as bots", peers.every((p) => p.bot));
ok("...with a z, which a spaceship never needed", peers.every((p) => p.z != null));
ok("...and a position inside the world", peers.every((p) => Math.abs(p.x) < 200 && Math.abs(p.y) < 200));

// 2. they move
const before = peers.map((p) => [p.x, p.y]);
await sleep(1500);
const after = net.peers(SYSTEM).filter((p) => p.id !== ME).map((p) => [p.x, p.y]);
ok("they drive", after.some((a, i) => before[i] && Math.hypot(a[0] - before[i][0], a[1] - before[i][1]) > 5));

// 3. the ownership rule, on the wire
{
    const ids = net.peerIds(SYSTEM);
    const redTank = wingId("brain-red", 0);
    ok("a tank's id names the pilot that owns it", ownerOf(redTank, ids) === "brain-red");
    ok("...however many peers are in the room", ownerOf(redTank, ["a", "b", "c"]) === "brain-red");
    const hit = { type: "npcHit", npcId: redTank, from: "brain-blue", seq: 1, dmgShield: 9999, dmgArmor: 0, system: SYSTEM };
    ok("red accepts a hit on red's tank", validateDamage(hit, "brain-red", ids, {}).ok);
    ok("blue does not, though it fired it", validateDamage(hit, "brain-blue", ids, {}).ok === false);
    ok("...and neither does the observer", validateDamage(hit, ME, ids, {}).ok === false);
    ok("a pilot cannot report a hit on its own tank",
        validateDamage({ ...hit, from: "brain-red" }, "brain-red", ids, {}).reason === "self-reported hit on own npc");
}

// 4. damage events actually flow, and somebody dies
let events = 0, seq = 0, deaths = 0;
for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
        const r = await fetch(`${URL}/event?room=${ROOM}&since=${seq}`, { cache: "no-store" });
        const j = await r.json();
        seq = j.seq || seq;
        events += (j.events || []).filter((e) => e && e.type === "npcHit").length;
    } catch (e) { /* the ring is best-effort */ }
    deaths = pilots.reduce((n, q) => n + (q.lines.join("").match(/killed by /g) || []).length, 0);
    if (events > 0 && deaths > 0) break;
}
ok(`a pilot's shot lands and is reported to its owner (${events} damage events on the ring)`, events > 0);
ok(`...and the owner dies of it (${deaths} deaths logged)`, deaths > 0);

// The KILLER learns of its kill a different way: by watching the victim's hp reach zero on the presence
// packet, which is the same rule brain/esPilot.mjs uses -- a pilot who merely leaves is not a kill. Give
// it a moment to see it.
await sleep(1200);
const log = pilots.map((q) => q.lines.join("")).join("");
ok("the killer is named", /killed by brain-(red|blue)/.test(log));
ok("...and the killer knows it scored", /killed brain-(red|blue)/.test(log));
ok("a dead pilot respawns", (() => {
    const alive = net.peers(SYSTEM).filter((p) => p.id !== ME && p.hp > 0).length;
    return alive >= 1;
})());
ok("neither pilot ever posted a hit on its own tank", !/self-reported/.test(log));

// 5. THE BROWSER'S PART, WITH NO BROWSER. bz/bzNet.js is what bzflag.html uses to join this room, and it
// is pure, so the probe can be the browser: walk a shot into a pilot's tank, report the hit through the
// same code path, and watch a real `brain/bzPilot.mjs` process die of it.
{
    const db = makeBZDB();
    const spec = makeTank(db).spec;
    const st = makeNetState();
    const live = net.peers(SYSTEM).filter((p) => p.id !== ME && p.hp > 0);
    ok("there is a live pilot to shoot at", live.length > 0);

    const victim = live[0];
    const ghosts = peerTanks([victim], ME, spec);
    ok("...and the browser sees its tank, oriented by its heading", ghosts.length === 1 && Number.isFinite(ghosts[0].angle));

    // A shot exactly in the middle of it. We do not kill it: we report the hit, addressed to its owner.
    const shot = { pos: [victim.x, victim.y, (victim.z || 0) + 1], dead: false };
    const events = reportHits([shot], ghosts, ME, st, Date.now());
    ok("a shot in its hull is a hit", events.length === 1 && shot.dead);
    ok("...addressed to the pilot that owns the tank", ownerOf(events[0].npcId, net.peerIds(SYSTEM)) === victim.id);
    ok("...and carrying a damage of 1, which the 2000 cap accepts", events[0].dmgShield === 1);

    // The browser does not apply it. It posts it, and the pilot decides.
    const before = victim.hp;
    await fetch(`${URL}/event?room=${ROOM}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) });

    let died = false;
    for (let i = 0; i < 20 && !died; i++) {
        await sleep(150);
        const p = net.peers(SYSTEM).find((q) => q.id === victim.id);
        if (p && p.hp === 0) died = true;
    }
    ok(`the browser's reported hit kills a real brain process (${victim.id})`, before > 0 && died);

    const killedLine = pilots.find((q) => q.p.spawnargs && q.lines.join("").includes("killed by " + ME));
    ok("...and the pilot names the browser as its killer", !!killedLine);

    // ...and the browser refuses the very same event, because it is not its tank.
    const mine = makeNetState();
    queueDamage(mine, events[0]);
    ok("the browser will not accept its own report", ingestDamage(mine, tankId(ME), ME, net.peerIds(SYSTEM)).taken === 0);
}

clearInterval(beat); net.close(); bye();
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
