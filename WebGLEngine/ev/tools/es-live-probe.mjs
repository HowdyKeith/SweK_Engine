// Not a selfcheck -- a LIVE PROBE. Boots the real rendezvous server, runs the real esPilot process
// against it, and plays the browser's part by hand: join presence, adopt the pilot's wing as ghosts,
// shoot one of them with real damageEvent packets, and watch for the corpse to come back.
//
// It proves the three things the unit tests cannot: that the pilot's ships reach a client at all,
// that a client's hits reach the pilot, and that the kill comes back on the presence packet.
//
//   node ev/tools/es-live-probe.mjs

import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import { PresenceManager, httpPresenceTransport, makeNet } from "../presence.js";
import { mergeRemoteNpcs, ghostAt, damageEvent, ownsNpc } from "../esAuthority.js";

const PORT = 8791, URL = `http://127.0.0.1:${PORT}`, ROOM = "probe", SYS = 128, ME = "browser-1";
let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

const server = spawn("node", ["../cloud/swek-rendezvous/server.js"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const pilot = spawn("node", ["brain/esPilot.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, SWEK_PILOT_URL: URL, SWEK_PILOT_ROOM: ROOM, SWEK_PILOT_SYSTEM: String(SYS),
        SWEK_PILOT_ID: "brain-probe", SWEK_PILOT_NPCS: "4", SWEK_PILOT_RESPAWN: "0" },
    stdio: ["ignore", "pipe", "pipe"],
});
const pilotLog = [];
pilot.stdout.on("data", (d) => pilotLog.push(String(d)));
pilot.stderr.on("data", (d) => pilotLog.push(String(d)));
const bye = () => { try { pilot.kill(); } catch {} try { server.kill(); } catch {} };
process.on("exit", bye);

await sleep(1200);

const mgr = new PresenceManager(ME);
const net = makeNet(mgr, httpPresenceTransport(URL, ROOM, ME));
const beat = setInterval(() => net.send({ name: "Probe", system: SYS, x: 0, y: 0, vx: 0, vy: 0, heading: 0, hp: 100 }), 150);

// 1. the pilot's wing arrives
let states = new Map();
for (let i = 0; i < 40 && states.size === 0; i++) {
    await sleep(150);
    const pk = net.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length).map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
    states = mergeRemoteNpcs(pk, ME, net.worldPeerIds(SYS), { now: Date.now() }).states;
}
ok("the pilot's wing reaches the browser", states.size === 4);
ok("the browser owns none of it", [...states.keys()].every((id) => !ownsNpc(ME, id, net.worldPeerIds(SYS))));
ok("...and every id names the pilot that spawned it", [...states.keys()].every((id) => id.startsWith("brain-probe:")));
const g = ghostAt(states.values().next().value, Date.now());
ok("a ghost has a position to draw", Number.isFinite(g.x) && Number.isFinite(g.y));

// 2. shoot one dead, the way flightView does: report, never resolve
const victim = [...states.keys()][0];
let seq = 0;
const post = (ev) => fetch(URL + "/event?room=" + ROOM, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [ev] }) }).catch(() => {});
const hull = states.get(victim).shield + states.get(victim).armor;
ok(`the target has ${hull} hull to chew through`, hull > 0);

let dead = false, hits = 0;
for (let i = 0; i < 120 && !dead; i++) {
    await post(damageEvent(victim, ME, ++seq, 6, 4, SYS));
    hits++;
    await sleep(60);
    const pk = net.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length).map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
    const m = mergeRemoteNpcs(pk, ME, net.worldPeerIds(SYS), { now: Date.now() }).states;
    const s = m.get(victim);
    if (s && s.dead) dead = true;
}
const need = Math.ceil(hull / 10);
ok(`the pilot applied the browser's hits and the ship died (${hits} reported hits, ${need} needed)`, dead);
// The floor is the assertion that matters: if the hull were being decremented twice -- once by us and
// once by the owner, the classic co-op desync -- it would have died in about half the hits. The extra
// few above `need` are detection lag: we keep firing until the corpse comes back around on a 300ms
// presence poll, and every one of those hits is correctly dropped by the owner as a hit on a dead ship.
ok("...and it was not being damaged twice (no hit under the honest floor)", hits >= need);
ok("...and no hits were silently swallowed", hits <= need + 10);
ok("the pilot logged the loss", pilotLog.join("").includes("lost brain-probe:"));
ok("...and named us as the one who did it", pilotLog.join("").includes("to " + ME));

// v2172: the kill credit comes back on the announcement, so the shooter can finally score it.
{
    const pk = net.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length).map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
    const m = mergeRemoteNpcs(pk, ME, net.worldPeerIds(SYS), { now: Date.now() }).states;
    const corpse = m.get(victim);
    ok("the corpse names its killer", !!corpse && corpse.by === ME);
    ok("...and the ghost the renderer sees carries it", ghostAt(corpse, Date.now()).by === ME);
}

// 3. a replayed hit changes nothing
const others = [...states.keys()].filter((k) => k !== victim);
await post(damageEvent(others[0], ME, 1, 9, 9, SYS));    // stale sequence: we are already past it
await sleep(400);
const pk2 = net.peers(SYS).filter((p) => Array.isArray(p.npcs) && p.npcs.length).map((p) => ({ from: p.id, npcs: p.npcs, t: p.npcT }));
const m2 = mergeRemoteNpcs(pk2, ME, net.worldPeerIds(SYS), { now: Date.now() }).states;
ok("a stale sequence cannot damage a second ship", !m2.get(others[0]).dead);
// The corpse is announced for a grace window and then dropped from the packet. Either way it is not
// alive, and with SWEK_PILOT_RESPAWN=0 it never will be again.
const vs = m2.get(victim);
ok("respawn=0 keeps the dead dead", !vs || vs.dead === true);
ok("the survivors keep flying", others.every((id) => m2.get(id) && !m2.get(id).dead));

clearInterval(beat); net.close(); bye();
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
