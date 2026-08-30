// bz/tools/bz-bridge-selfcheck.mjs — the buttons, and the processes behind them.
//
//   node bz/tools/bz-bridge-selfcheck.mjs
//
// `ai-bridge/bzBridge.js` is the one part of this port that starts programs. Everything else in bz/ is a
// pure function or a socket; this spawns a rendezvous server and two GPU Brain pilots because somebody
// clicked a button. So it is tested the way it will be used: over real HTTP, spawning real processes, and
// then made to prove it stops them again.
//
// The check that matters most is the first one. A route that can start a program must not be reachable
// from the internet, and the bridge cannot be allowed to decide for itself who is trusted -- the server
// hands it `isTrusted`, and an untrusted request gets 403 before the body is even read.

import { createServer } from "http";
import { shutdownServer, liveHandles, drainChildren } from "../../tools/ship/serverShutdown.mjs";
import { prose } from "../../tools/ship/sourceScan.mjs";
import { setTimeout as sleep } from "timers/promises";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const bridge = require(path.join(ENGINE, "ai-bridge", "bzBridge.js"));

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// A server that lets us decide, per request, whether the caller is trusted.
let trusted = true;
const srv = createServer((req, res) => {
    if (!bridge.owns(req.url)) { res.writeHead(404); return res.end(); }
    Promise.resolve(bridge.handle(req, res, { isTrusted: () => trusted }))
        .catch((e) => { res.writeHead(500); res.end(String(e)); });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + srv.address().port;
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body) => (await (await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })).json());

// --- 1. the gate ------------------------------------------------------------------------------------
{
    trusted = false;
    const r = await fetch(base + "/bz/status");
    ok("an untrusted request cannot even read the status", r.status === 403);
    const j = await r.json();
    ok("...and is told why", /host, session or LAN only/.test(j.error));
    const s = await fetch(base + "/bz/room/start", { method: "POST", body: "{}" });
    ok("...and certainly cannot start a process", s.status === 403);

    // Before the body is read, not after.
    ok("the bridge does not decide for itself who is trusted", !/_isTrustedReq|isLocal/.test(String(bridge.handle)));
    trusted = true;
}

// --- 2. the routes it owns, and the ones it does not ---------------------------------------------------
{
    ok("it owns exactly eighteen routes", bridge._routes.size === 18);
    ok("...including the status, the room check, the probe and the play",
        bridge.owns("/bz/status") && bridge.owns("/bz/room/check") && bridge.owns("/bz/bzfs/probe") && bridge.owns("/bz/bzfs/play"));
    ok("...and a query string does not confuse it", bridge.owns("/bz/status?x=1"));
    ok("it does not own the map, which is a static file", !bridge.owns("/bz/maps/arena.bzw"));
    ok("...nor the tank policy, which is another bridge's", !bridge.owns("/ai/brain/bz/tactics"));
    ok("an unknown /bz route is a 404, not a 500", (await fetch(base + "/bz/nope")).status === 404);
    ok("a GET to a POST route is a 405", (await (await fetch(base + "/bz/room/start")).json()).error === "POST");
}

// --- 3. nothing is running ------------------------------------------------------------------------------
{
    const s = await get("/bz/status");
    ok("with nothing started, the room is not running", s.room.running === false);
    ok("...and there are no pilots", s.pilots.length === 0);
    ok("...and the viewer link is the plain one", s.viewer === "/bzflag.html");
    ok("a brain with no room and no url is refused, not started", (await post("/bz/brain/start", { count: 1 })).error === "no room: start one, or pass a url");
}

// --- 4. start a room ---------------------------------------------------------------------------------------
{
    const r = await post("/bz/room/start", { port: 8796 });
    ok("the room starts", r.ok && r.port === 8796 && r.pid > 0);
    await sleep(700);
    const s = await get("/bz/status");
    ok("...and says so", s.room.running && s.room.port === 8796);
    ok("...with a url a pilot can use", s.room.url === "http://127.0.0.1:8796");
    ok("...and a viewer link that fills itself in", /\/bzflag\.html\?url=http:\/\/127\.0\.0\.1:8796&room=arena/.test(s.viewer));
    ok("starting it twice does not start a second one", (await post("/bz/room/start", { port: 8796 })).already === true);

    // v2192 -- the address another box can use. `127.0.0.1` is right for exactly one machine, and the panel
    // had been handing it to everybody.
    ok("...and a LAN url a peer on another box can use", Array.isArray(s.room.lanUrls));
    ok("a room with no token says it is OPEN, rather than letting anybody assume", s.room.open === true && s.room.tokened === false);
    ok("...and the panel colours that warning", /OPEN \(no token\)/.test(await (await import("fs")).readFileSync(path.join(ENGINE, "server.html"), "utf8")));

    await post("/bz/room/stop", {});
    const t = await post("/bz/room/start", { port: 8796, token: "s3cret" });
    await sleep(600);
    const st = await get("/bz/status");
    ok("a room started with a token says it has one", st.room.tokened === true && st.room.open === false);
    ok("...and the token itself is never a field in the status", !JSON.stringify(st.room).includes("s3cret"));
    ok("...but the HOST'S OWN viewer link carries it, because the panel is host-only", /token=s3cret/.test(st.viewer));
    ok("...while the link meant for somebody else shows a placeholder", st.lanViewers.every((u) => !u.includes("s3cret")));
    void t;
}

// --- 5. launch the brain ------------------------------------------------------------------------------------
{
    const r = await post("/bz/brain/start", { count: 2, room: "probe" });
    ok("two pilots start", r.ok && r.started.length === 2);
    ok("...against the room we just started", r.url === "http://127.0.0.1:8796");
    ok("more than the cap is refused politely", (await post("/bz/brain/start", { count: 99 })).started.length <= bridge.MAX_PILOTS);
    await post("/bz/brain/stop", { id: null });
    await post("/bz/brain/start", { count: 2, room: "probe" });

    // They print a `policy:` line at once and a `peers= kills= ...` line every ten seconds. Waiting for the
    // first is waiting for nothing: it arrives before either pilot has seen the other. Wait for the second.
    let s = null;
    for (let i = 0; i < 70; i++) {
        await sleep(400);
        s = await get("/bz/status");
        if (s.pilots.length === 2 && s.pilots.every((p) => p.stats && p.stats.peers != null)) break;
    }
    ok("the status lists them, running, with pids", s.pilots.length === 2 && s.pilots.every((p) => p.running && p.pid > 0));
    ok("...and parses the status line they already write", s.pilots.every((p) => p.stats && typeof p.stats.policy === "string"));
    ok("...which says they are driving on the hand policy, there being no bridge", s.pilots.every((p) => p.stats.policy === "hand"));
    ok("...and that they have found each other", s.pilots.some((p) => (p.stats.peers | 0) >= 1), JSON.stringify(s.pilots.map((p) => p.stats)));
    ok("each keeps its last line, for a panel to show", s.pilots.every((p) => typeof p.last === "string" && p.last.length));
}

// --- 6. probe a bzfs that is not there, and one that is -----------------------------------------------------
{
    const dead = await post("/bz/bzfs/probe", { host: "127.0.0.1", port: 1, callsign: "brain" });
    ok("a probe of a port nobody is listening on comes back, and does not hang", dead && dead.reached === false);
    ok("...saying it never reached a server", dead.ok === false);

    // A loopback bzfs, spoken by the same codec. Enough to prove the button reports a real handshake.
    const { createServer: tcp } = await import("net");
    const { CONNECT_HEADER, SERVER_VERSION, MSG, frame, parseFrames } = await import("../net/bzProtocol.js");
    const fake = tcp((sock) => {
        let stage = "header", buf = Buffer.alloc(0);
        sock.on("data", (c) => {
            buf = Buffer.concat([buf, c]);
            if (stage === "header") {
                if (buf.length < CONNECT_HEADER.length) return;
                buf = buf.subarray(CONNECT_HEADER.length); stage = "frames";
                sock.write(Buffer.concat([Buffer.from(SERVER_VERSION, "latin1"), Buffer.from([3])]));
                return;
            }
            const r = parseFrames(new Uint8Array(buf)); buf = Buffer.from(r.rest);
            for (const m of r.msgs) if (m.code === MSG.MsgEnter) sock.write(Buffer.from(frame(MSG.MsgAccept, new Uint8Array(0))));
        });
        sock.on("error", () => {});
    });
    await new Promise((r) => fake.listen(0, "127.0.0.1", r));
    const live = await post("/bz/bzfs/probe", { host: "127.0.0.1", port: fake.address().port, callsign: "brain" });
    ok("a probe of a server that answers reaches it", live.reached === true);
    ok("...and is accepted", live.ok === true);
    ok("...and the log says which version it spoke to", live.log.some((l) => /server BZFS0221/.test(l)));
    ok("the last probe is remembered, for a panel to show", (await get("/bz/status")).lastProbe.port === fake.address().port);
    await new Promise((r) => fake.close(r));

    // A server that refuses. The probe reports the refusal; it is a result, not an error.
    const refuse = tcp((sock) => { sock.on("data", () => sock.write(Buffer.concat([Buffer.from("BZFS9999", "latin1"), Buffer.from([0])]))); sock.on("error", () => {}); });
    await new Promise((r) => refuse.listen(0, "127.0.0.1", r));
    const bad = await post("/bz/bzfs/probe", { host: "127.0.0.1", port: refuse.address().port });
    ok("a version mismatch is reported, not swallowed", bad.ok === false && /version mismatch/.test(bad.rejected || ""));
    await new Promise((r) => refuse.close(r));
}

// --- 6b. playing needs the server's own map, and says so ------------------------------------------------------
{
    const noMap = await post("/bz/bzfs/play", { host: "127.0.0.1", port: 5154 });
    ok("play without a map is refused, not attempted", !noMap.ok);
    ok("...and the refusal explains why: the server's world is not parsed", /the SAME \.bzw the server is running/.test(noMap.error) || /same \.bzw/.test(noMap.error));
    const badMap = await post("/bz/bzfs/play", { host: "127.0.0.1", port: 5154, map: "bz/maps/nope.bzw" });
    ok("a map that does not exist is refused", !badMap.ok && /no such map/.test(badMap.error));

    const s0 = await get("/bz/status");
    ok("with nobody playing, the status says so", s0.player.running === false);

    // Play against a server that is not there: it starts, fails to connect, and exits. That is a result.
    const started = await post("/bz/bzfs/play", { host: "127.0.0.1", port: 1, map: "bz/maps/arena.bzw", seconds: 2 });
    ok("play with a map that exists starts a process", started.ok && started.pid > 0);
    ok("...against the host and port asked for", started.port === 1);
    ok("starting a second one is refused", (await post("/bz/bzfs/play", { host: "127.0.0.1", port: 1, map: "bz/maps/arena.bzw" })).error === "already playing: stop first");
    ok("the password is never echoed back", !JSON.stringify(started).toLowerCase().includes("password"));
    await sleep(600);
    const s1 = await get("/bz/status");
    ok("the status reports the map it is colliding against", s1.player.map === "bz/maps/arena.bzw");
    ok("...and never the password", !JSON.stringify(s1.player).toLowerCase().includes("password"));
    ok("stopping it stops it", (await post("/bz/bzfs/stop", {})).ok);
    await sleep(200);
    ok("...and the status agrees", (await get("/bz/status")).player.running === false);
}

// --- 6c. a room somewhere else -----------------------------------------------------------------------------
{
    const bad = await post("/bz/room/check", { url: "not a url" });
    ok("a room url that is not a url is refused before anything is sent", !bad.ok && /starts with http/.test(bad.error));
    const dead = await post("/bz/room/check", { url: "http://127.0.0.1:1" });
    ok("a room nobody is hosting says so, and does not hang", !dead.ok && dead.reached === false);

    // The room this bridge started IS a remote room, as far as the check is concerned. Section 4 left it
    // token-gated, so stop it and start an open one: a test that inherits state tests the state.
    await post("/bz/room/stop", {});
    await post("/bz/room/start", { port: 8796 });
    await sleep(700);
    const live = await post("/bz/room/check", { url: "http://127.0.0.1:8796", room: "arena" });
    ok("a room that is there answers, with a latency", live.ok && live.reached && typeof live.ms === "number");
    ok("...and says it is OPEN when it has no token", live.needsToken === false);

    await post("/bz/room/stop", {});
    await post("/bz/room/start", { port: 8796, token: "s3cret" });
    await sleep(700);
    const wants = await post("/bz/room/check", { url: "http://127.0.0.1:8796", room: "arena" });
    ok("a token-gated room refuses a check with no token, and says which", !wants.ok && wants.needsToken === true && wants.reached === true);
    const withTok = await post("/bz/room/check", { url: "http://127.0.0.1:8796", room: "arena", token: "s3cret" });
    ok("...and accepts one with", withTok.ok && withTok.needsToken === true);

    // Brains can be pointed somewhere else entirely.
    const remote = await post("/bz/brain/start", { count: 1, url: "http://127.0.0.1:8796", token: "s3cret", room: "arena" });
    ok("brains can be launched against a REMOTE room", remote.ok && remote.remote === true && remote.url === "http://127.0.0.1:8796");
    ok("...carrying the token typed for it", remote.tokened === true);
    ok("...and the token is not echoed back", !JSON.stringify(remote).includes("s3cret"));
    // Stop only the one this section started. The two from section 5 are section 7's business.
    ok("a single brain can be stopped by id", (await post("/bz/brain/stop", { id: remote.started[0] })).stopped === 1);
}

// --- 6d. the network test page's routes: a fixed script, no shell, and a password that never lands ----------
//
// A route that runs `node` is remote code execution. This one always runs `brain/bzfsPilot.mjs`, never a path
// from the request; it spawns with an argv array so nothing is ever concatenated into a command line; and
// every field is checked against a pattern BEFORE it becomes an argument. Escaping is where this kind of
// thing goes wrong, so nothing is escaped -- it is refused.
{
    const V = (b) => bridge.validateTest(b);
    const good = { mode: "observe", host: "bzflag.example", port: 5154, callsign: "geekbot" };
    ok("a well-formed test is accepted", V(good).ok);

    ok("a host with a semicolon is not a host", !V({ ...good, host: "a;rm -rf /" }).ok);
    ok("...nor one with a space", !V({ ...good, host: "a b" }).ok);
    ok("...nor one with a backtick or a $(", !V({ ...good, host: "a`id`" }).ok && !V({ ...good, host: "a$(id)" }).ok);
    ok("...and the refusal is a PATTERN, not an escape", /letters, digits, dots and dashes/.test(V({ ...good, host: "a;b" }).error));

    ok("a port outside 1..65535 is refused", !V({ ...good, port: 99999 }).ok && !V({ ...good, port: 0 }).ok);
    ok("a callsign of one character is refused, as a real bzfs refuses it", !V({ ...good, callsign: "x" }).ok);
    ok("...and one with a shell metacharacter", !V({ ...good, callsign: "a|b" }).ok);
    ok("a mode nobody defined is refused", !V({ ...good, mode: "exec" }).ok && /observe, token, play/.test(V({ ...good, mode: "exec" }).error));
    ok("seconds outside 1..600 is refused", !V({ ...good, seconds: 99999 }).ok);

    ok("a map that climbs out of the engine directory is refused", !V({ ...good, mode: "play", map: "../../etc/passwd" }).ok);
    ok("...and one that does not exist", !V({ ...good, mode: "play", map: "bz/maps/nope.bzw" }).ok);
    ok("...while the real one is fine", V({ ...good, mode: "play", map: "bz/maps/arena.bzw" }).ok);

    ok("the token test refuses to run without a password", !V({ ...good, mode: "token" }).ok);
    ok("...and says why: an unregistered callsign needs none", /unregistered callsign needs no token/.test(V({ ...good, mode: "token" }).error));

    // Run one against a port nobody is hosting. The pilot starts, fails to connect, and exits non-zero.
    // THAT IS A RESULT, NOT A CRASH, and the page says so.
    const started = await post("/bz/test/run", { mode: "observe", host: "127.0.0.1", port: 1, callsign: "geekbot", seconds: 4 });
    ok("a test starts a real bzfsPilot", started.ok && started.pid > 0);
    ok("...and reports the command it ran, as it would be typed", /node brain\/bzfsPilot\.mjs --host 127\.0\.0\.1/.test(started.command));
    ok("...with `--observe` on it", / --observe/.test(started.command));
    ok("starting a second while one runs is refused", (await post("/bz/test/run", { ...good, host: "127.0.0.1", port: 1 })).error === "a test is already running: stop it first");

    for (let i = 0; i < 40; i++) { await sleep(200); const s = await get("/bz/test/output"); if (!s.running && s.log.length) break; }
    const out = await get("/bz/test/output");
    ok("...and its output is captured, exactly as it would appear at a terminal", out.log.some((l) => /bzfsPilot/.test(l)));
    ok("...including the connection refusal, which is the point", out.log.some((l) => /ECONNREFUSED|transport error/.test(l)));
    ok("a pilot that could not connect exits non-zero, and the page calls that a result", out.exited !== 0);

    // THE PASSWORD. Never argv, never echoed, redacted from the captured output.
    await post("/bz/test/stop", {});
    await sleep(300);
    const tok = await post("/bz/test/run", { mode: "token", host: "127.0.0.1", port: 1, callsign: "geekbot", password: "hunter2", seconds: 3 });
    ok("a token test starts", tok.ok);
    ok("THE PASSWORD IS NOT IN THE COMMAND, because argv is visible to every process through `ps`",
        !JSON.stringify(tok).includes("hunter2"));
    ok("...and the command names the environment variable it travels in", /^BZFS_PASSWORD=<yours> /.test(tok.command));
    await sleep(1500);
    const ts = await get("/bz/test/output");
    ok("...and it is nowhere in the status either", !JSON.stringify(ts).includes("hunter2"));
    await post("/bz/test/stop", {});
    await sleep(300);
}

// --- 7. and it stops what it started ---------------------------------------------------------------------
{
    const st = await post("/bz/brain/stop", {});
    ok("stopping the brains stops both", st.stopped === 2);
    await sleep(300);
    ok("...and the status agrees", (await get("/bz/status")).pilots.length === 0);

    ok("stopping the room stops it", (await post("/bz/room/stop", {})).ok);
    await sleep(300);
    const s = await get("/bz/status");
    ok("...and the status agrees", s.room.running === false);
    ok("...and the viewer link goes back to the plain one", s.viewer === "/bzflag.html");
    ok("stopping what is not running is not an error", (await post("/bz/room/stop", {})).already === true);
}

// --- 8. the buttons point at routes that exist -----------------------------------------------------------
// A panel that calls `/bz/brains/start` renders perfectly and does nothing. Nothing in a browser tells you.
{
    const fs = await import("fs");
    const html = fs.readFileSync(path.join(ENGINE, "server.html"), "utf8");

    ok("the BZFlag panel has a room button", /id="bzRoomBtn"/.test(html));
    ok("...a launch button", /id="bzBrainBtn"/.test(html));
    ok("...a stop button", /id="bzStopBtn"/.test(html));
    ok("...and a bzfs probe button", /id="bzProbeBtn"/.test(html));
    ok("the drive link is filled in from the running room", /\$\$\("bzDrive"\)\.href = s\.viewer/.test(html));

    // Every /bz/ path the panel names must be a route the bridge owns. Both directions.
    const called = [...html.matchAll(/["'](\/bz\/[a-z/]+)["']/g)].map((m) => m[1]);
    const controls = called.filter((u) => u !== "/bz/maps/arena.bzw");
    ok(`the panel calls ${new Set(controls).size} /bz/ routes`, new Set(controls).size >= 8);
    const unknown = [...new Set(controls)].filter((u) => !bridge.owns(u));
    ok("...and every one of them is a route the bridge owns", unknown.length === 0, unknown.join(", "));

    // The three `/bz/test/*` routes are buttons on bzflag-test.html, not on this panel. Check them there.
    const testHtml = fs.readFileSync(path.join(ENGINE, "bzflag-test.html"), "utf8");
    const bzflagHtml = fs.readFileSync(path.join(ENGINE, "bzflag.html"), "utf8");   // build/tools panel lives here
    const unused = [...bridge._routes].filter((r) => !controls.includes(r) && !testHtml.includes(r) && !bzflagHtml.includes(r));
    ok("...and every route the bridge owns has a button, on one page or the other", unused.length === 0, unused.join(", "));
    ok("bzflag-test.html calls all three test routes", ["/bz/test/run", "/bz/test/output", "/bz/test/stop"].every((r) => testHtml.includes(r)));
    ok("...and never puts the password in a URL", !/password=/.test(testHtml));
    ok("...and clears the password box the moment it is sent", /\$\("password"\)\.value = ""/.test(testHtml));

    // v2200 -- the proxy is not a /bz/ HTTP route; it lives on the engine's WebSocket upgrade path. The
    // panel links to it and the status reports it, and neither is a route the bridge owns.
    ok("the panel links the viewer at a real server through the proxy", /bzflag\.html\?bzfs=/.test(html));
    ok("...and the network-test page", /bzflag-test\.html/.test(html));
    ok("...and shows whether the proxy has an allowlist", /allowlist/.test(html));
    ok("/bz/ws is NOT one of the bridge's HTTP routes", !bridge.owns("/bz/ws"));

    ok("the panel says the probe never spawns a tank", /never spawns a tank/.test(html));
    ok("...and that nobody has pointed it at a public server", /Nobody has pointed this at a public server/.test(prose(html)));
    ok("...and that PLAY needs the server's own map, and why", /the SAME \.bzw the server is running/.test(html) && /does not parse it/.test(html));
    ok("...and it clears the password box after sending it", /\$\$\("bzPass"\)\.value = ""/.test(html));
}

bridge.shutdown();
// v4000 -- the same teardown that fast-failed bz-tactics on Keith's Windows rig with libuv's
// UV_HANDLE_CLOSING assert. srv.close() resolves while its handles are still mid-close, and
// process.exit() inside that window is the crash. This gate has the identical shape and simply had
// not been the one run that day. See tools/ship/serverShutdown.mjs for the measurement.
await shutdownServer(srv);
// v4152 -- AND THEN WAIT FOR THE SPAWNED PROCESSES. bridge.shutdown() above is SYNCHRONOUS: stopBrains,
// stopRoom, stopPlay and stopTest each send a signal and return, so at this line the children have been ASKED
// to die and may not have done it yet. shutdownServer drains loop TURNS, which is right for sockets and cannot
// help a process the operating system has not reaped. On this box they are gone before the check; on Keith's
// Windows rig the same gate reported "STILL LIVE: Socket, Socket, ChildProcess" after 115/0.
await drainChildren();
console.log("");
console.log(`${pass} passed, ${fail} failed`);
{
    // THE TEARDOWN IS A CHECK. The crash it guards produced a PERFECT SCORELINE followed by a fast-fail,
    // so a passing count was never going to catch it coming back.
    const live = liveHandles();
    ok("nothing is still holding the event loop open at exit", live.length === 0,
        live.length ? "STILL LIVE: " + live.join(", ") : "no sockets, no server, no timers");
}
process.exit(fail ? 1 : 0);
