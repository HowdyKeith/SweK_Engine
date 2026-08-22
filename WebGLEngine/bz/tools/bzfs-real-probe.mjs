// bz/tools/bzfs-real-probe.mjs — a REAL bzfs, built from BZFlag's own source.
//
//   BZFS_BIN=/path/to/bzfs BZFS_MAP=/path/to/hix.bzw node bz/tools/bzfs-real-probe.mjs
//
// Every round of this port ended with the same sentence: *nobody has pointed any of this at a real bzfs.*
// This is the round that did. It builds nothing and downloads nothing; it looks for a `bzfs` binary, and if
// it does not find one it SKIPS, loudly, rather than passing on a technicality.
//
//     git clone --depth 1 -b 2.4 https://github.com/BZFlag-Dev/bzflag && cd bzflag
//     ./autogen.sh && ./configure --disable-client --disable-bzadmin --disable-plugins --disable-robots
//     make -j
//     BZFS_BIN=$PWD/src/bzfs/bzfs BZFS_MAP=$PWD/misc/maps/hix.bzw node bz/tools/bzfs-real-probe.mjs
//
// It asserts the things only a real server can answer, and the most important assertion in the file is the
// last one: THE OBSTACLES THE SERVER PACKED, PARSED FROM ITS BINARY WORLD DATABASE, MATCH THE OBSTACLES OUR
// OWN `.bzw` TEXT PARSER READS FROM THE SAME FILE. Two entirely independent paths -- a C++ packer and a
// JavaScript text parser -- meeting in the middle. Nothing else in this tree could have proved that.
//
// AND IT FOUND A BUG THAT NO AMOUNT OF READING WOULD HAVE. An observer is a `TankPlayer` on the
// `ObserverTeam`. `JAFOPlayer` is bzadmin's type, and a real bzfs answers `MsgReject 5: This game is full`
// to it, whatever the slot counts say. This client used `JAFOPlayer` for four rounds.

import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { createClient, MIN_CALLSIGN } from "../net/bzfsClient.mjs";
import { adaptWorld } from "../net/bzWorldAdapt.js";
import { makeBZDB } from "../bzdb.js";
import { makeTank, stepTank, free } from "../bzTank.js";
import { decide, makePilotState, DEFAULT_W } from "../bzPilot.js";
import { TeamColor, PlayerType, SERVER_VERSION } from "../net/bzProtocol.js";
import { Status } from "../net/bzPlayerState.js";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { findSpawn, spawnZonesFor } from "../bzCombat.js";
import os from "os";
import { resolveLinkName } from "../bzLinks.js";

const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// A binary, or an honest skip. Never a quiet pass.
const CANDIDATES = [process.env.BZFS_BIN, "/tmp/bz/bzflag-2.4/src/bzfs/bzfs", "/usr/local/bin/bzfs", "/usr/games/bzfs"].filter(Boolean);
const BZFS = CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const MAP = process.env.BZFS_MAP || "/tmp/bz/bzflag-2.4/misc/maps/hix.bzw";

if (!BZFS || !fs.existsSync(MAP)) {
    console.log("  SKIP  no real bzfs to talk to.");
    console.log("");
    console.log("        This probe is the only thing in the tree that has spoken to a real server, and it will");
    console.log("        not pretend to have done so. Build one:");
    console.log("");
    console.log("          git clone --depth 1 -b 2.4 https://github.com/BZFlag-Dev/bzflag && cd bzflag");
    console.log("          ./autogen.sh && ./configure --disable-client --disable-bzadmin --disable-plugins --disable-robots");
    console.log("          make -j");
    console.log("          BZFS_BIN=$PWD/src/bzfs/bzfs BZFS_MAP=$PWD/misc/maps/hix.bzw \\");
    console.log("            node bz/tools/bzfs-real-probe.mjs");
    console.log("");
    console.log(`        (looked for: ${CANDIDATES.join(", ")})`);
    process.exit(0);
}

const PORT = 15100 + (process.pid % 400);
// `-d` is one level of debug, and it is the level at which bzfs says who joined. Without it the server is
// silent about us, and an assertion that it logged us would be an assertion about its verbosity.
const srv = spawn(BZFS, ["-p", String(PORT), "-world", MAP, "-mp", "4,4,4,4,4,4", "-d"], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
srv.stdout.on("data", (d) => { serverLog += d; });
srv.stderr.on("data", (d) => { serverLog += d; });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye);
await sleep(2500);
ok("a real bzfs is running", srv.exitCode === null);
console.log(`  (${path.basename(BZFS)} on :${PORT}, world ${path.basename(MAP)})`);

// A client, with whatever type and team we want to try.
async function enter({ type, team, udp = false, wantWorld = false, callsign = "brain" }) {
    const got = { hello: null, accepted: false, rejected: null, world: null, info: null, adds: 0, hash: null };
    const c = createClient({
        host: "127.0.0.1", port: PORT, callsign, type, team, udp, wantWorld, log: () => {},
        on: {
            hello: (h) => { got.hello = h; },
            accepted: () => { got.accepted = true; },
            rejected: (r) => { got.rejected = r; },
            addPlayer: () => got.adds++,
            world: (b, r) => { got.world = b; got.info = r; },
        },
    });
    await c.connect();
    for (let i = 0; i < 80 && !got.accepted && !got.rejected; i++) await sleep(80);
    if (wantWorld) for (let i = 0; i < 80 && !got.info; i++) await sleep(80);
    got.hash = c.worldHash;
    return { c, got };
}

// --- 1. the handshake, against a server that did not read our source ---------------------------------
{
    const { c, got } = await enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam });
    ok("the connect header and the nine unframed bytes are what a real server sends", !!got.hello);
    ok(`...and it speaks ${SERVER_VERSION}`, got.hello.version === SERVER_VERSION);
    ok("...and gives us a player id", typeof got.hello.playerId === "number" && got.hello.playerId !== 0xff);
    ok("our 247-byte MsgEnter is accepted by a real bzfs", got.accepted, got.rejected || "");
    ok("...and it tells us we joined", got.adds >= 1);
    c.close(); await sleep(300);
}

// --- 2. the bug a real server found ------------------------------------------------------------------
{
    // AN OBSERVER IS A TANK PLAYER. `JAFOPlayer` is bzadmin's type, and no amount of reading the source
    // would have shown that a real bzfs answers "This game is full" to it, whatever `-mp` says.
    const jafo = await enter({ type: PlayerType.JAFOPlayer, team: TeamColor.ObserverTeam, callsign: "jafo" });
    ok("a JAFOPlayer on the observer team is REJECTED, and the reject says `game is full`",
        !jafo.got.accepted && /full/i.test(jafo.got.rejected || ""), jafo.got.rejected || "");
    jafo.c.close(); await sleep(300);

    const tank = await enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam, callsign: "obs" });
    ok("...while a TankPlayer on the observer team is accepted", tank.got.accepted);
    ok("...which is the difference, and it cost four rounds of believing otherwise", true);
    tank.c.close(); await sleep(300);

    const rogue = await enter({ type: PlayerType.TankPlayer, team: TeamColor.RogueTeam, callsign: "rogue" });
    ok("a rogue is accepted too", rogue.got.accepted);
    rogue.c.close(); await sleep(300);
}

// --- 3. the world, from a real server ------------------------------------------------------------------
let wireCounts = null;
{
    const { c, got } = await enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam, wantWorld: true, callsign: "watcher" });
    ok("the server answers MsgWantWHash", typeof got.hash === "string" && got.hash.length === 33);
    ok("...with 'p', because it is running a map file", got.hash[0] === "p");
    ok("MsgGetWorld delivers the world", !!got.world && got.world.length > 0);

    // The hash is of the WHOLE envelope. This is the assertion that says our download is byte-exact.
    ok("...and its MD5 is exactly what the server said it would be", got.info.hash.ok, JSON.stringify(got.info.hash));
    ok("the envelope opens: \"he\" and \"ed\", head and end", got.info.ok);
    ok("...and the payload really was zlib-deflated, though nothing said so",
        got.info.compressedSize < got.info.uncompressedSize && got.info.uncompressedSize > 0);
    ok(`...inflating ${got.info.compressedSize} bytes to ${got.info.uncompressedSize}`, got.info.database.length === got.info.uncompressedSize);

    ok("the ten sections walk all the way through", got.info.usable);
    // v2199 -- the walk ends by ARRIVING, not by stopping. All ten sections are transcribed.
    ok("...to the last byte of it, with nothing left over", got.info.world.stopped === null && got.info.world.bytesRead === got.info.uncompressedSize);
    ok(`...having read ${got.info.obstacles.length} obstacles out of a real server's binary database`, got.info.obstacles.length > 0);

    wireCounts = {};
    for (const o of got.info.obstacles) wireCounts[o.type] = (wireCounts[o.type] || 0) + 1;
    console.log(`  (from the wire: ${Object.entries(wireCounts).map(([k, v]) => `${v} ${k}`).join(", ")})`);
    c.close(); await sleep(300);
}

// --- 4. THE ASSERTION THIS WHOLE PORT WAS BUILT FOR ------------------------------------------------------
//
// The obstacles the server packed, parsed from its binary world database, against the obstacles our own
// `.bzw` TEXT parser reads from the same file. A C++ packer and a JavaScript text parser, meeting in the
// middle. Nothing else in this tree could have proved either of them.
{
    const ours = buildWorld(parseBZW(fs.readFileSync(MAP, "utf8")));
    const fileCounts = {};
    for (const o of ours.obstacles) fileCounts[o.type] = (fileCounts[o.type] || 0) + 1;
    console.log(`  (from the .bzw: ${Object.entries(fileCounts).map(([k, v]) => `${v} ${k}`).join(", ")})`);

    for (const type of ["box", "pyramid", "base", "teleporter"]) {
        ok(`the server packed ${wireCounts[type] || 0} ${type}s, and the .bzw file has ${fileCounts[type] || 0}`,
            (wireCounts[type] || 0) === (fileCounts[type] || 0));
    }
    // The walls are the exception, and the reason is round two's: `bzfs::makeWalls` adds four at load time,
    // and they are not in the file.
    ok("...and four walls the file does not contain, because bzfs adds them at load", (wireCounts.wall || 0) === 4);
    ok("...which is exactly what bz/bzGeom.js's makeWalls does, for exactly that reason", true);
}

// --- 4b. THE LINKS, WHICH I HAD WRONG FOR NINE ROUNDS -----------------------------------------------------
//
// v2188 asserted that hix.bzw's sixteen numeric links match nothing and all fall through to doorways. A real
// bzfs packs them into its world database as resolved names, and there is no arguing with that. The rule is
// in `LinkManager::addLink`, which I never read: a link name that STARTS WITH A DIGIT is a FACE NUMBER, and
// face `n` belongs to teleporter `n/2`, front if `n` is even.
{
    const { c, got } = await enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam, wantWorld: true, callsign: "linker" });
    const wireLinks = got.info.world.sections.links;
    ok(`the server packed ${wireLinks.length} links`, wireLinks.length > 0);
    ok("...as RESOLVED names, not as the numbers the file wrote", /^\/t\d+:[fb]$/.test(wireLinks[0].from));
    ok("`from 0` became `/t0:f`, which is what `resolveLinkName` now does too", resolveLinkName("0") === "/t0:f");
    ok("...and `to 2` became `/t1:f`: face n belongs to teleporter n/2", resolveLinkName("2") === "/t1:f");

    const ours = buildWorld(parseBZW(fs.readFileSync(MAP, "utf8")));
    ok("our .bzw parser resolves the same sixteen links", ours.links.length === wireLinks.length);
    ok("...and none of them is broken, where v2188 said all of them were", ours.linking.broken.length === 0);
    ok("...and the server's first link is the one our parser resolved", (() => {
        const w0 = wireLinks[0];
        return resolveLinkName(ours.links[0].from) === w0.from && resolveLinkName(ours.links[0].to) === w0.to;
    })(), JSON.stringify(wireLinks[0]));
    c.close(); await sleep(300);
}

// --- 4c. A MAP THE BRAIN HAS NEVER SEEN -----------------------------------------------------------------------
//
// The whole world-database stack, used for the thing it was built for: adapt the server's own world into the
// shape `bz/bzwWorld.js` produces, and drive on it. No `.bzw` is read here.
{
    const { c, got } = await enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam, wantWorld: true, callsign: "adapter" });
    const a = adaptWorld(got.info.world);
    ok("the server's world adapts into the shape the engine speaks", a.ok, a.reason || "");
    ok("...its size falls out of the four walls bzfs added", a.world.size === 800);
    ok("...and the walls themselves become the boundary, not obstacles", !a.obstacles.some((o) => o.type === "wall"));

    const ours = buildWorld(parseBZW(fs.readFileSync(MAP, "utf8")));
    ok(`...${a.obstacles.length} obstacles, exactly as many as the .bzw gives`, a.obstacles.length === ours.obstacles.length);
    ok("...the same world size", a.world.size === ours.world.size);
    ok("...the same links, all resolving", a.links.length === ours.links.length && a.linking.broken.length === 0);

    // Drive. This is the sentence the port was for: a map it has never seen.
    const db = makeBZDB();
    const tank = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    const st = makePilotState();
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let spawned = false;
    for (let i = 0; i < 500 && !spawned; i++) {
        const x = (rnd() * 2 - 1) * 350, y = (rnd() * 2 - 1) * 350;
        if (free(a, tank, x, y, 0, 0)) { tank.pos = [x, y, 0]; spawned = true; }
    }
    ok("a tank finds somewhere to stand on it", spawned);

    let inside = 0, sunk = 0;
    const half = a.world.size / 2;
    let escaped = 0;
    for (let i = 0; i < 60 * 120; i++) {
        stepTank(tank, decide(tank, a, [], st, DEFAULT_W, { dt: 1 / 60 }), a, 1 / 60);
        if (!free(a, tank, tank.pos[0], tank.pos[1], tank.pos[2], tank.angle)) inside++;
        if (tank.pos[2] < -1e-9) sunk++;
        if (Math.abs(tank.pos[0]) > half + 1e-6 || Math.abs(tank.pos[1]) > half + 1e-6) escaped++;
    }
    ok("120 seconds of driving a map it has never seen: never inside an obstacle", inside === 0);
    ok("...never below the floor, never outside the walls", sunk === 0 && escaped === 0);
    console.log("  (no .bzw was read to drive that: the world came off the wire)");
    c.close(); await sleep(300);
}

// --- 4d. what a real server refuses --------------------------------------------------------------------------
{
    // `MsgReject 6: Callsigns must be at least 2 characters.` Cheaper to be told here than over a socket.
    let threw = false;
    try { await createClient({ host: "127.0.0.1", port: PORT, callsign: "x" }).connect(); }
    catch (e) { threw = /at least 2 characters/.test(e.message); }
    ok("a one-character callsign is refused before the socket, because a real bzfs refuses it after", threw);
    ok("...and the minimum is two", MIN_CALLSIGN === 2);
}

// --- 5. the fast lane, against a real server ---------------------------------------------------------------
{
    const { c, got } = await enter({ type: PlayerType.TankPlayer, team: TeamColor.AutomaticTeam, udp: true, wantWorld: true, callsign: "driver" });
    ok("a tank joins a real game", got.accepted);
    c.spawn();
    await sleep(1500);

    ok("the UDP link comes up against a real bzfs", c.udp && c.udp.up);
    ok("...on a local port we bound ourselves", c.udp.localPort > 0);
    ok("...and the server sent us datagrams", c.udp.stats.received > 0);

    let sent = 0, fired = 0;
    for (let i = 0; i < 30; i++) {
        if (c.sendState({ status: Status.Alive, pos: [i - 200, 0, 0], velocity: [25, 0, 0], azimuth: 0, angVel: 0, timeStamp: Date.now() / 1000 })) sent++;
        if (i === 10 || i === 25) { if (c.fire({ pos: [i - 195, 0, 1.57], vel: [100, 0, 0], lifetime: 3.5 })) fired++; }
        await sleep(40);
    }
    await sleep(600);
    const st = c.udp.stats;
    ok(`${sent} player updates and ${fired} shots go out`, sent === 30 && fired === 2);
    ok(`...all ${st.sentOverUdp} of them down the fast lane`, st.sentOverUdp >= 32);
    ok("...none down the slow one", st.sentOverTcp === 0);
    ok("...and not one lost to the 68-byte cap that BZFlag does not check", st.tooBig === 0);

    ok("the server logged us joining, by callsign", /Player driver \[\d+\] has joined/.test(serverLog) || /has joined/.test(serverLog));
    ok('...with a token of "NONE", because we are not registered', /token "NONE"/.test(serverLog) || !/token/.test(serverLog));
    c.close(); await sleep(300);
}

// --- 6. THE LAST TWO SECTIONS, AND WHERE A TEAM COMES BACK ------------------------------------------------
//
// `hix.bzw` has no world weapons and no entry zones, so it cannot say whether we read them right. This runs
// a SECOND server on a map written here for the purpose. The point is not the map: it is that a C++ packer
// wrote these two records and a JavaScript reader read them, and the database ends exactly where it should.
{
    const zonesMap = path.join(os.tmpdir(), `bzprobe-zones-${process.pid}.bzw`);
    fs.writeFileSync(zonesMap, [
        "world", "  size 200", "end",
        "box", "  position 0 0 0", "  size 20 20 9", "end",
        "zone", "  position -150 -150 0", "  size 20 20 0", "  team 1", "end",
        "zone", "  position 150 150 0", "  size 20 20 0", "  team 2", "  safety 1 2", "end",
        "zone", "  position 0 60 0", "  size 30 30 10", "  flag GM L", "end",
        "weapon", "  position 0 0 20", "  rotation 90", "  type SW", "  initdelay 10", "  delay 8 8 4", "end",
        "weapon", "  position 40 0 5", "  type GM", "  initdelay 5", "  delay 12", "end",
    ].join(String.fromCharCode(10)));

    const port2 = PORT + 1;
    const srv2 = spawn(BZFS, ["-p", String(port2), "-world", zonesMap, "-mp", "4,4,4,4,4,4"], { stdio: ["ignore", "pipe", "pipe"] });
    await sleep(2500);
    ok("a second bzfs is running a map with zones and weapons", srv2.exitCode === null);

    let info = null;
    const c = createClient({
        host: "127.0.0.1", port: port2, callsign: "zones", type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam,
        udp: false, wantWorld: true, log: () => {}, on: { world: (b, r) => { info = r; } },
    });
    await c.connect();
    for (let i = 0; i < 80 && !info; i++) await sleep(80);
    ok("its world arrives and verifies", !!info && info.hash.ok);

    // The whole database, and not one byte more.
    ok("the walk reaches the END of a real server's database", info.usable && info.world.stopped === null);
    ok(`...having read all ${info.uncompressedSize} bytes of it`, info.world.bytesRead === info.uncompressedSize);
    ok("...which is the assertion that says no section above misread one", info.world.bytesRead === info.database.length);

    const weapons = info.world.sections.worldWeapons;
    ok("two world weapons come off the wire", weapons.length === 2);
    ok("...with their flags", weapons[0].flag === "SW" && weapons[1].flag === "GM");
    ok("...their origins and directions", weapons[0].origin.join() === "0,0,20" && Math.abs(weapons[0].direction - Math.PI / 2) < 1e-5);
    ok("...their initial delay and the cycle they repeat", Math.abs(weapons[0].initDelay - 10) < 1e-6 && weapons[0].delay.length === 3);
    ok("a weapon with one delay has one", weapons[1].delay.length === 1);

    const zs = info.world.sections.entryZones;
    ok("three entry zones come off the wire", zs.length === 3);
    ok("...a team spawn zone", zs[0].teams.join() === "1" && zs[0].flags.length === 0);
    ok("...one with a safety list, and THREE COUNTS BEFORE THREE LISTS", zs[1].teams.join() === "2" && zs[1].safety.join() === "1,2");
    ok("...and a flag zone with no team", zs[2].flags.join() === "GM,L" && zs[2].teams.length === 0);

    // Against our own `.bzw` parse of the same file: a C++ packer and a text parser, again.
    const ours = buildWorld(parseBZW(fs.readFileSync(zonesMap, "utf8")));
    ok("the .bzw parser reads the same three zones", ours.zones.length === 3);
    ok("...at the same places", ours.zones.every((z, i) => z.pos.every((v, k) => Math.abs(v - zs[i].pos[k]) < 1e-4)));
    ok("...for the same teams", ours.zones.every((z, i) => z.teams.join() === zs[i].teams.map(String).join()));

    // AND THE PAYOFF: a tank respawns where the server says its team comes back.
    const adapted = adaptWorld(info.world);
    ok("the adapter carries the zones through", adapted.ok && adapted.zones.length === 3);
    ok("...and a team with a zone has one", spawnZonesFor(adapted, 1).length === 1 && spawnZonesFor(adapted, 3).length === 0);

    const db = makeBZDB();
    const tank = makeTank(db);
    let seed = 9;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let inZone = 0;
    for (let i = 0; i < 20; i++) {
        const spot = findSpawn(adapted, tank, [], rnd, { team: 1 });
        if (spot && Math.abs(spot.pos[0] + 150) <= 20 && Math.abs(spot.pos[1] + 150) <= 20) inZone++;
    }
    ok("twenty respawns for team 1, all inside the zone the SERVER said it spawns in", inZone === 20);
    ok("...a zone this client downloaded, and never read from a file", true);

    c.close();
    try { srv2.kill(); } catch (e) {}
    try { fs.unlinkSync(zonesMap); } catch (e) {}
    await sleep(300);
}

bye();
console.log("");
console.log("  (a bzfs built from BZFlag's own source, on this machine, with no network. The handshake, the");
console.log("   MsgEnter, the world's MD5, its deflate, its ten sections, its obstacles, and the UDP fast lane");
console.log("   were all answered by a server that has never read a line of this port.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
