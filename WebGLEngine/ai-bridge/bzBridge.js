// WebGLEngine/ai-bridge/bzBridge.js — the buttons.
//
// Everything BZFlag could do, it could only do from a terminal. You could open the viewer and download the
// map; you could not start a rendezvous room, launch the GPU Brain, watch it fight, or point the protocol
// client at a real `bzfs` -- not without three shells and a memory of the environment variables.
//
// Owns:
//   GET  /bz/status              -> what is running: the room, the pilots, the last probe
//   POST /bz/room/start          -> spawn cloud/swek-rendezvous/server.js on a port
//   POST /bz/room/stop
//   POST /bz/brain/start         -> spawn N brain/bzPilot.mjs against that room
//   POST /bz/brain/stop
//   POST /bz/bzfs/probe          -> connect bz/net/bzfsClient.mjs to a real server and report what happened
//
// MUST be registered BEFORE any bridge that owns a broader prefix, and it is registered beside the others.
//
// THESE ROUTES SPAWN PROCESSES. Every one of them is behind `_isTrustedReq` -- localhost, an authenticated
// session, or a LAN peer when the operator has said LAN is exempt. A route that can start a program is a
// route that must not be reachable from the internet, and the check is in one place so it cannot be
// forgotten in a second.
//
// The pilots' stdout is parsed rather than plumbed: brain/bzPilot.mjs already prints a status line every ten
// seconds -- `peers=1 kills=3 losses=2 shots=9 policy=learned` -- and reading the line it already writes is
// better than teaching it a second way to say the same thing.

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const bzProxy = require("./bzProxy.js");   // v2200 -- the WebSocket-to-TCP proxy, for /bz/status to report

const ENGINE = path.resolve(__dirname, "..");          // WebGLEngine
const ROOT = path.resolve(ENGINE, "..");               // the project
const RENDEZVOUS = path.join(ROOT, "cloud", "swek-rendezvous", "server.js");
const PILOT = path.join(ENGINE, "brain", "bzPilot.mjs");
const CLIENT = path.join(ENGINE, "bz", "net", "bzfsClient.mjs");
const FS_PILOT = path.join(ENGINE, "brain", "bzfsPilot.mjs");   // v2191 -- the brain on somebody else's server

const MAX_PILOTS = 6;          // a room is a room, not a datacentre
const LOG_LINES = 40;
const PROBE_MS = 6000;

// v2192 -- the URL a peer on the LAN can actually use. `127.0.0.1` is the one address that is right for
// exactly one machine, and the panel had been handing it to everybody.
function lanAddresses() {
    const out = [];
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) for (const a of ifaces[name] || []) {
        if (a.family !== "IPv4" && a.family !== 4) continue;
        if (a.internal) continue;
        out.push(a.address);
    }
    return out;
}

let room = null;               // { child, port, startedAt, token, log: [] }
const pilots = new Map();      // id -> { child, id, startedAt, log: [], stats: {} }
let lastProbe = null;
let player = null;             // { child, host, port, startedAt, log: [], stats: {} }

// --- the status line brain/bzPilot.mjs already writes ------------------------------------------------
const STAT = /peers=(\d+)\s+kills=(\d+)\s+losses=(\d+)\s+shots=(\d+)\s+policy=(\w+)(?:\s+udp=(\w+))?/;
function noteLine(p, line) {
    p.log.push(line);
    if (p.log.length > LOG_LINES) p.log.shift();
    const m = STAT.exec(line);
    if (m) p.stats = { peers: +m[1], kills: +m[2], losses: +m[3], shots: +m[4], policy: m[5], udp: m[6] || null };
    if (/policy: (hand|learned)/.test(line)) p.stats.policy = /learned/.test(line) ? "learned" : "hand";
}

function capture(child, sink) {
    const feed = (buf) => String(buf).split("\n").map((s) => s.trim()).filter(Boolean).forEach(sink);
    if (child.stdout) child.stdout.on("data", feed);
    if (child.stderr) child.stderr.on("data", feed);
}

function alive(child) { return !!child && child.exitCode === null && !child.killed; }

// --- the room ------------------------------------------------------------------------------------------
function startRoom(port, token) {
    if (room && alive(room.child)) return { ok: true, already: true, port: room.port };
    if (!fs.existsSync(RENDEZVOUS)) return { ok: false, error: "cloud/swek-rendezvous/server.js is not in this tree" };
    const p = Math.max(1, Math.min(65535, parseInt(port, 10) || 8788));
    // A room with no token is open to anybody who can reach the port. On a LAN that is the point; on the
    // internet it is a room anybody can drive into, and the status says so rather than assuming.
    const t = String(token || "");
    const env = { ...process.env, PORT: String(p) };
    if (t) env.SWEK_TOKEN = t; else delete env.SWEK_TOKEN;
    const child = spawn(process.execPath, [RENDEZVOUS], { env, stdio: ["ignore", "pipe", "pipe"] });
    room = { child, port: p, token: t, startedAt: Date.now(), log: [] };
    capture(child, (l) => { room.log.push(l); if (room.log.length > LOG_LINES) room.log.shift(); });
    child.on("exit", (code) => { if (room && room.child === child) room.exited = code; });
    return { ok: true, port: p, pid: child.pid };
}

// v3107 -- what each child ACTUALLY did, filled in by the exit listeners in stopRoom/stopPlay.
const _bzLastExit = { room: null, player: null };
function bzLastExit() { return { ..._bzLastExit }; }
function stopRoom() {
    if (!room) return { ok: true, already: true };
    // v3107 -- SIGNALLING IS NOT STOPPING, AND NULLING THE HANDLE THREW AWAY THE ONLY WAY TO TELL.
    // kill() sends a signal. The child may ignore it, may take seconds, may become a zombie. This returned
    // stopped:true synchronously AND discarded the handle in the same breath, so nothing could ever check --
    // the claim was unfalsifiable by construction. The listener below records the REAL exit; the return value
    // now says what is actually true at that instant, which is that a signal was sent.
    const c = room.child;
    try { c.once("exit", (code, s) => { _bzLastExit.room = { at: Date.now(), code, sig: s }; }); } catch (e) {}
    _bzLastExit.room = null;
    try { c.kill(); } catch (e) {}
    room = null;
    return { ok: true, signalled: "SIGTERM", stopped: false, note: "signal sent; exit is reported by bzLastExit()" };
}

// --- a remote room ----------------------------------------------------------------------------------------
//
// v2194 -- a rendezvous does not have to be the one this engine started. It can be a box on the LAN, or a
// tunnel, or the Cloud Run deployment cloud/swek-rendezvous was written for. This asks whether it is there,
// whether it wants a token, and how long it takes to answer -- and it never sends the token anywhere but the
// URL the operator typed.
async function checkRoom({ url, room = "arena", token }) {
    const base = String(url || "").replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) return { ok: false, error: "a room url starts with http:// or https://" };
    const qs = "?room=" + encodeURIComponent(room) + (token ? "&token=" + encodeURIComponent(token) : "");
    const t0 = Date.now();
    try {
        const r = await fetch(base + "/presence" + qs, { headers: { accept: "application/json" } });
        const ms = Date.now() - t0;
        if (r.status === 401 || r.status === 403)
            return { ok: false, reached: true, needsToken: true, status: r.status, ms, url: base, error: "the room wants a token, and did not accept this one" };
        if (!r.ok) return { ok: false, reached: true, status: r.status, ms, url: base, error: `the room answered HTTP ${r.status}` };
        let peers = null;
        try { const j = await r.json(); peers = Array.isArray(j.peers) ? j.peers.length : (j.peers ? Object.keys(j.peers).length : null); } catch (e) {}
        return { ok: true, reached: true, needsToken: !!token, status: r.status, ms, peers, url: base, room };
    } catch (e) {
        return { ok: false, reached: false, url: base, error: "no answer: " + String(e && e.message || e) };
    }
}

// --- the brains -----------------------------------------------------------------------------------------
// `url` and `token` may name a REMOTE room -- another box, a tunnel, a VM. With neither, the pilots join the
// room this engine started, on loopback.
function startBrains({ count = 2, url, token, room: roomName = "arena", bridge, map }) {
    const n = Math.max(1, Math.min(MAX_PILOTS, parseInt(count, 10) || 1));
    if (!fs.existsSync(PILOT)) return { ok: false, error: "brain/bzPilot.mjs is not in this tree" };
    const target = url || (room && alive(room.child) ? `http://127.0.0.1:${room.port}` : null);
    if (!target) return { ok: false, error: "no room: start one, or pass a url" };

    const started = [];
    for (let i = 0; i < n; i++) {
        const id = "brain-" + Math.random().toString(36).slice(2, 7);
        const env = { ...process.env, SWEK_BZ_URL: target, SWEK_BZ_ROOM: roomName, SWEK_BZ_ID: id };
        // A token typed for a remote room wins; otherwise the local room's, if it has one.
        const tok = token || (!url && room && room.token) || "";
        if (tok) env.SWEK_BZ_TOKEN = tok;
        if (bridge) env.SWEK_BZ_BRIDGE = bridge;
        if (map) env.SWEK_BZ_MAP = map;
        const child = spawn(process.execPath, [PILOT], { cwd: ENGINE, env, stdio: ["ignore", "pipe", "pipe"] });
        const p = { child, id, startedAt: Date.now(), log: [], stats: {} };
        pilots.set(id, p);
        capture(child, (l) => noteLine(p, l));
        child.on("exit", (code) => { p.exited = code; });
        started.push(id);
    }
    return { ok: true, started, room: roomName, url: target, remote: !!url, tokened: !!(token || (!url && room && room.token)) };
}

function stopBrains(id) {
    let n = 0;
    for (const [key, p] of [...pilots]) {
        if (id && key !== id) continue;
        try { p.child.kill(); } catch (e) {}
        pilots.delete(key);
        n++;
    }
    return { ok: true, stopped: n };
}

// --- the bzfs probe -----------------------------------------------------------------------------------------
// Runs the real client for a few seconds and reports what a real server said. This is the one route that can
// reach the outside world, and it does nothing but talk: it never spawns a tank and never sends a position.
function probeBzfs({ host, port, callsign }) {
    return new Promise((resolve) => {
        if (!fs.existsSync(CLIENT)) return resolve({ ok: false, error: "bz/net/bzfsClient.mjs is not in this tree" });
        const h = String(host || "127.0.0.1");
        const p = Math.max(1, Math.min(65535, parseInt(port, 10) || 5154));
        const args = [CLIENT, "--host", h, "--port", String(p), "--callsign", String(callsign || "brain").slice(0, 31), "--observer"];
        const child = spawn(process.execPath, args, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });

        const log = [];
        capture(child, (l) => { if (log.length < LOG_LINES) log.push(l); });

        const done = (result) => {
            try { child.kill(); } catch (e) {}
            lastProbe = { host: h, port: p, at: Date.now(), ...result, log };
            resolve(lastProbe);
        };
        const timer = setTimeout(() => {
            const joined = log.join("\n");
            done({
                ok: /accepted/.test(joined),
                // A probe that connects and is refused has learned something. A probe that never connects
                // has learned something else. Both are results; neither is an error.
                reached: /server BZFS/.test(joined),
                rejected: /rejected/.test(joined) ? joined.split("rejected: ")[1].split("\n")[0] : null,
            });
        }, PROBE_MS);
        child.on("exit", () => { clearTimeout(timer); const joined = log.join("\n");
            done({ ok: /accepted/.test(joined), reached: /server BZFS/.test(joined),
                rejected: /rejected/.test(joined) ? joined.split("rejected: ")[1].split("\n")[0] : (log.length ? log[log.length - 1] : "no answer") });
        });
    });
}

// --- playing on a real bzfs ---------------------------------------------------------------------------------
//
// The observer probe talks; this one plays. It needs a `.bzw` -- the SAME map the server is running -- because
// the server's world arrives as BZFlag's binary database and bzfsClient does not parse it. A pilot given the
// wrong map drives into walls that are not there, and `brain/bzfsPilot.mjs` says so on every start.
function startPlay({ host, port, callsign, password, map, bridge: policyBridge, seconds }) {
    if (player && alive(player.child)) return { ok: false, error: "already playing: stop first" };
    if (!fs.existsSync(FS_PILOT)) return { ok: false, error: "brain/bzfsPilot.mjs is not in this tree" };
    const m = String(map || "").trim();
    if (!m) return { ok: false, error: "no map: to PLAY, hand it the same .bzw the server is running. Without one it can only observe." };
    const abs = path.isAbsolute(m) ? m : path.join(ENGINE, m);
    if (!fs.existsSync(abs)) return { ok: false, error: "no such map: " + m };

    const args = [FS_PILOT, "--host", String(host || "127.0.0.1"), "--port", String(parseInt(port, 10) || 5154),
        "--callsign", String(callsign || "brain").slice(0, 31), "--map", m];
    if (password) args.push("--password", String(password));
    if (policyBridge) args.push("--bridge", String(policyBridge));
    if (seconds) args.push("--seconds", String(parseInt(seconds, 10) || 0));

    const child = spawn(process.execPath, args, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
    player = { child, host, port, map: m, startedAt: Date.now(), log: [], stats: {} };
    // The password went into argv and nowhere else. It is not kept, not logged, and not echoed to /bz/status.
    capture(child, (l) => noteLine(player, l));
    child.on("exit", (code) => { if (player && player.child === child) player.exited = code; });
    return { ok: true, host, port, map: m, pid: child.pid };
}
function stopPlay() {
    if (!player) return { ok: true, already: true };
    // v3107 -- SIGNALLING IS NOT STOPPING, AND NULLING THE HANDLE THREW AWAY THE ONLY WAY TO TELL.
    // kill() sends a signal. The child may ignore it, may take seconds, may become a zombie. This returned
    // stopped:true synchronously AND discarded the handle in the same breath, so nothing could ever check --
    // the claim was unfalsifiable by construction. The listener below records the REAL exit; the return value
    // now says what is actually true at that instant, which is that a signal was sent.
    const c = player.child;
    try { c.once("exit", (code, s) => { _bzLastExit.player = { at: Date.now(), code, sig: s }; }); } catch (e) {}
    _bzLastExit.player = null;
    try { c.kill(); } catch (e) {}
    player = null;
    return { ok: true, signalled: "SIGTERM", stopped: false, note: "signal sent; exit is reported by bzLastExit()" };
}

// --- the network test, one button at a time ------------------------------------------------------------------
//
// v2206 -- `bzflag-test.html` has a button for each of the commands the operator was asked to run against a
// REAL, PUBLIC BZFlag server, because that is the one thing this port has never touched.
//
// A ROUTE THAT RUNS `node` IS REMOTE CODE EXECUTION, so this one is built the only way that is safe:
//
//   * THE SCRIPT IS FIXED. Always `brain/bzfsPilot.mjs`, never a path from the request.
//   * THERE IS NO SHELL. `spawn` with an argv array; nothing is ever concatenated into a command line.
//   * EVERY ARGUMENT IS VALIDATED against a pattern before it becomes an argv entry. A host with a space,
//     a semicolon, a backtick or a `$(` in it is not a host, and is refused by the pattern rather than
//     escaped by hand -- escaping is where this kind of thing goes wrong.
//   * THE PASSWORD NEVER TOUCHES `argv`, because argv is visible to every process on the box through `ps`.
//     It goes in the child's environment, and it is REDACTED out of the captured output before anybody sees
//     it, in case a future bzfsPilot ever prints it.
//   * Trusted requests only, like everything else here.

const TEST_MODES = new Set(["observe", "token", "play"]);
const RE_HOST = /^[A-Za-z0-9._-]{1,255}$/;                 // a name or an IPv4 literal. No colons, no brackets.
const RE_CALLSIGN = /^[A-Za-z0-9 _.-]{2,31}$/;             // bzfs refuses fewer than two characters (v2197)
const RE_MAP = /^[A-Za-z0-9._/-]{1,200}$/;

let test = null;   // { child, mode, host, startedAt, log: [], exited }

function validateTest(body) {
    const mode = String(body.mode || "");
    if (!TEST_MODES.has(mode)) return { ok: false, error: `mode must be one of ${[...TEST_MODES].join(", ")}` };

    const host = String(body.host || "").trim();
    if (!RE_HOST.test(host)) return { ok: false, error: "a host is a name or an address: letters, digits, dots and dashes" };

    const port = parseInt(body.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false, error: "a port is 1..65535" };

    const callsign = String(body.callsign || "").trim();
    if (!RE_CALLSIGN.test(callsign)) return { ok: false, error: "a callsign is 2 to 31 characters: letters, digits, spaces, . _ -" };

    const seconds = parseInt(body.seconds, 10) || (mode === "play" ? 120 : 20);
    if (seconds < 1 || seconds > 600) return { ok: false, error: "seconds is 1..600" };

    let map = String(body.map || "").trim();
    if (map) {
        if (!RE_MAP.test(map) || map.includes("..")) return { ok: false, error: "that is not a map path" };
        const abs = path.resolve(ENGINE, map);
        if (!abs.startsWith(ENGINE + path.sep)) return { ok: false, error: "a map lives inside the engine directory" };
        if (!fs.existsSync(abs)) return { ok: false, error: "no such map: " + map };
    }
    if (mode === "token" && !body.password) return { ok: false, error: "the token test needs a password. An unregistered callsign needs no token." };

    return { ok: true, mode, host, port, callsign, seconds, map, password: String(body.password || "") };
}

function startTest(body) {
    if (test && alive(test.child)) return { ok: false, error: "a test is already running: stop it first" };
    if (!fs.existsSync(FS_PILOT)) return { ok: false, error: "brain/bzfsPilot.mjs is not in this tree" };
    const v = validateTest(body);
    if (!v.ok) return v;

    // The argv is BUILT, never formatted. Nothing here has been through a string template.
    const args = [FS_PILOT, "--host", v.host, "--port", String(v.port), "--callsign", v.callsign, "--seconds", String(v.seconds)];
    if (v.mode !== "play") args.push("--observe");
    if (v.map) args.push("--map", v.map);

    const env = { ...process.env };
    delete env.BZFS_PASSWORD;
    if (v.mode === "token") env.BZFS_PASSWORD = v.password;   // never argv

    const child = spawn(process.execPath, args, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
    const secret = v.password;
    test = { child, mode: v.mode, host: v.host, port: v.port, callsign: v.callsign, seconds: v.seconds, startedAt: Date.now(), log: [], exited: null };
    capture(child, (l) => {
        // Redacted before it is stored, not before it is shown: a log nobody prints is still a log on disk.
        const line = secret ? l.split(secret).join("<password>") : l;
        test.log.push(line);
        if (test.log.length > 400) test.log.shift();
    });
    child.on("exit", (code) => { if (test && test.child === child) test.exited = code; });
    // The command, as it would be typed -- with the password replaced by the env var it actually travels in.
    const shown = ["node", "brain/bzfsPilot.mjs", ...args.slice(1)].join(" ");
    return { ok: true, mode: v.mode, pid: child.pid, command: v.mode === "token" ? "BZFS_PASSWORD=<yours> " + shown : shown };
}

function stopTest() {
    if (!test) return { ok: true, already: true };
    try { test.child.kill(); } catch (e) {}
    return { ok: true };
}

function testStatus() {
    if (!test) return { ok: true, running: false, log: [], mode: null };
    return {
        ok: true,
        running: alive(test.child),
        mode: test.mode, host: test.host, port: test.port, callsign: test.callsign,
        uptimeMs: Date.now() - test.startedAt,
        exited: test.exited,
        log: test.log.slice(),
    };
}

// --- status ----------------------------------------------------------------------------------------------
function status() {
    return {
        ok: true,
        room: room && alive(room.child)
            ? {
                running: true, port: room.port, pid: room.child.pid, uptimeMs: Date.now() - room.startedAt,
                url: `http://127.0.0.1:${room.port}`,
                // The addresses a peer on the LAN can use. Another box, a phone, another GPU Brain.
                lanUrls: lanAddresses().map((a) => `http://${a}:${room.port}`),
                // Whether there IS a token is not a secret; what it is, is. It appears in exactly one
                // place: the HOST'S OWN viewer link, below, because the panel is host-only and that link
                // opens in this browser. The link meant to be handed to somebody else shows a placeholder.
                tokened: !!room.token,
                open: !room.token,
            }
            : { running: false, exited: room ? room.exited : null, lanUrls: [], tokened: false, open: false },
        pilots: [...pilots.values()].map((p) => ({
            id: p.id, running: alive(p.child), pid: p.child.pid, uptimeMs: Date.now() - p.startedAt,
            exited: p.exited != null ? p.exited : null,
            stats: p.stats, last: p.log[p.log.length - 1] || null,
        })),
        maxPilots: MAX_PILOTS,
        // v2200 -- the proxy lives on the engine's own port, on its upgrade path. It is not started or
        // stopped; it is either reachable or the engine is not.
        proxy: bzProxy.status(),
        // The password is never here. It went into argv and nowhere else.
        // The map is reported whether or not the process is still up. A pilot that entered and was thrown
        // out told you something, and the map it was colliding against is half of what it told you.
        player: {
            running: !!(player && alive(player.child)),
            host: player ? player.host : null,
            port: player ? player.port : null,
            map: player ? player.map : null,
            pid: player && alive(player.child) ? player.child.pid : null,
            uptimeMs: player ? Date.now() - player.startedAt : null,
            exited: player ? (player.exited != null ? player.exited : null) : null,
            stats: player ? player.stats : {},
            last: player ? (player.log[player.log.length - 1] || null) : null,
        },
        lastProbe,
        // The viewer wants to know the url and room to join, so it does not have to be typed twice.
        viewer: room && alive(room.child)
            ? `/bzflag.html?url=http://127.0.0.1:${room.port}&room=arena` + (room.token ? `&token=${encodeURIComponent(room.token)}` : "")
            : "/bzflag.html",
        // ...and the link to hand somebody else. A viewer on another box needs a LAN address, not a loopback.
        lanViewers: room && alive(room.child)
            ? lanAddresses().map((a) => `http://${a}:${(process.env.PORT || 8787)}/bzflag.html?url=http://${a}:${room.port}&room=arena` + (room.token ? "&token=<the token>" : ""))
            : [],
    };
}

// --- the routes ---------------------------------------------------------------------------------------------
// v2239 — run the .bzw map tools + BZFlag's own maps from the panel. One job at a time (like the pilot
// test). BZFlag is NOT vendored: its maps are git-cloned into ~/.voxelbridge/bzflag, OUTSIDE the engine
// tree, so nothing under its licence ever ships inside SweK. The panel just drives the clone + the tools.
const CLONE_DIR = path.join(os.homedir(), ".voxelbridge", "bzflag");
const MAPS_DIR = path.join(CLONE_DIR, "misc", "maps");
let toolJob = null;
function _wireTool(child) {
    capture(child, (l) => { if (!toolJob) return; toolJob.log.push(l); if (toolJob.log.length > 500) toolJob.log.shift(); });
    child.on("exit", (code) => {
        if (!toolJob || toolJob.child !== child) return;
        toolJob.log.push("[exit " + code + "]");
        if (code === 0 && toolJob.queue && toolJob.queue.length) {   // chained selfcheck sequence
            const next = toolJob.queue.shift();
            toolJob.log.push("[run] node " + next.join(" ").split(os.homedir()).join("~"));
            let c; try { c = spawn(process.execPath, next, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] }); }
            catch (e) { toolJob.exited = 1; toolJob.log.push("spawn failed: " + e.message); return; }
            toolJob.child = c; _wireTool(c); return;
        }
        toolJob.exited = code;
    });
}
function _toolSpawn(name, cmd, args) {
    if (toolJob && toolJob.exited === null) return { ok: false, error: "a tool job is already running (" + toolJob.name + ")" };
    let child; try { child = spawn(cmd, args, { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { return { ok: false, error: "spawn failed: " + e.message + (cmd === "git" ? " (is git installed?)" : "") }; }
    toolJob = { name, child, log: [], exited: null, startedAt: Date.now(), queue: [] };
    _wireTool(child);
    const shown = [cmd === process.execPath ? "node" : cmd, ...args].join(" ").split(os.homedir()).join("~");
    return { ok: true, name, pid: child.pid, command: shown };
}
function toolStatus() { if (!toolJob) return { ok: true, job: null }; return { ok: true, job: { name: toolJob.name, running: toolJob.exited === null, exited: toolJob.exited, startedAt: toolJob.startedAt, log: toolJob.log.slice(-140) } }; }
function stopTool() { if (toolJob && toolJob.exited === null) { try { toolJob.child.kill(); } catch {} toolJob.exited = -1; return { ok: true, stopped: true }; } return { ok: true, note: "no tool running" }; }
function _validBzw(p) { if (typeof p !== "string" || !p) return "path required"; if (!/\.bzw$/i.test(p)) return "must be a .bzw file"; if (!fs.existsSync(p)) return "no such file: " + p; try { if (!fs.statSync(p).isFile()) return "not a file"; } catch { return "cannot stat: " + p; } return null; }
function bzwCoverage(body) { const err = _validBzw(body && body.path); if (err) return { ok: false, error: err }; return _toolSpawn("bzw-coverage", process.execPath, ["bz/tools/bzw-coverage.mjs", body.path]); }
function bzwBuild(body) { const err = _validBzw(body && body.path); if (err) return { ok: false, error: err }; let out = (body && body.out) || "out.json"; if (!/\.json$/i.test(out)) out += ".json"; out = path.basename(out); return _toolSpawn("bzw-build", process.execPath, ["bz/bzw-build.mjs", body.path, out]); }
function mapsClone() {
    if (fs.existsSync(MAPS_DIR)) return { ok: true, already: true, mapsDir: MAPS_DIR, note: "BZFlag maps already cloned at " + MAPS_DIR };
    try { fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true }); } catch {}
    return _toolSpawn("bz-maps-clone", "git", ["clone", "--depth", "1", "-b", "2.4", "https://github.com/BZFlag-Dev/bzflag", CLONE_DIR]);
}
function mapsSelfcheck() {
    if (!fs.existsSync(MAPS_DIR)) return { ok: false, error: "BZFlag maps not cloned yet - run 'Clone BZFlag maps' first", needsClone: true };
    const r = _toolSpawn("bz-selfchecks", process.execPath, ["bz/tools/bzw-selfcheck.mjs", MAPS_DIR]);
    if (r.ok && toolJob) toolJob.queue = [["bz/tools/bzw-geom-selfcheck.mjs", MAPS_DIR], ["bz/tools/bz-tank-selfcheck.mjs", MAPS_DIR]];
    return r;
}

const ROUTES = new Set(["/bz/status", "/bz/room/start", "/bz/room/stop", "/bz/room/check", "/bz/brain/start", "/bz/brain/stop",
    "/bz/bzfs/probe", "/bz/bzfs/play", "/bz/bzfs/stop",
    "/bz/test/run", "/bz/test/output", "/bz/test/stop",
    "/bz/coverage", "/bz/build", "/bz/maps/clone", "/bz/maps/selfcheck", "/bz/tools/output", "/bz/tools/stop"]);
function owns(url) { return ROUTES.has((url || "").split("?")[0]); }

function readBody(req) {
    return new Promise((resolve) => {
        let b = "";
        req.on("data", (c) => { b += c; if (b.length > 65536) b = b.slice(0, 65536); });
        req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
    });
}

async function handle(req, res, ctx = {}) {
    const sendJson = ctx.sendJson || ((o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); });
    const p = (req.url || "").split("?")[0];

    // A route that can start a program must not be reachable from the internet. One check, one place.
    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;
    if (!trusted) return sendJson({ ok: false, error: "not trusted: /bz/* controls processes and is host, session or LAN only" }, 403);

    if (req.method === "GET" && p === "/bz/status") return sendJson(status());
    if (req.method === "GET" && p === "/bz/test/output") return sendJson(testStatus());
    if (req.method === "GET" && p === "/bz/tools/output") return sendJson(toolStatus());

    if (req.method !== "POST") return sendJson({ ok: false, error: "POST" }, 405);
    const body = await readBody(req);

    if (p === "/bz/room/start") return sendJson(startRoom(body.port, body.token));
    if (p === "/bz/room/stop") return sendJson(stopRoom());
    if (p === "/bz/room/check") return sendJson(await checkRoom(body));
    if (p === "/bz/brain/start") return sendJson(startBrains(body));
    if (p === "/bz/brain/stop") return sendJson(stopBrains(body.id));
    if (p === "/bz/bzfs/probe") return sendJson(await probeBzfs(body));
    if (p === "/bz/bzfs/play") return sendJson(startPlay(body));
    if (p === "/bz/bzfs/stop") return sendJson(stopPlay());
    if (p === "/bz/test/run") return sendJson(startTest(body));
    if (p === "/bz/test/stop") return sendJson(stopTest());
    if (p === "/bz/coverage") return sendJson(bzwCoverage(body));
    if (p === "/bz/build") return sendJson(bzwBuild(body));
    if (p === "/bz/maps/clone") return sendJson(mapsClone());
    if (p === "/bz/maps/selfcheck") return sendJson(mapsSelfcheck());
    if (p === "/bz/tools/stop") return sendJson(stopTool());

    return sendJson({ ok: false, error: "no such route" }, 404);
}

// Nothing this bridge starts should outlive the engine that started it.
function shutdown() { stopBrains(); stopRoom(); stopPlay(); stopTest(); }
process.on("exit", shutdown);

module.exports = { owns, handle, status, bzLastExit, startRoom, stopRoom, checkRoom, startBrains, stopBrains, probeBzfs, startPlay, stopPlay, startTest, stopTest, testStatus, validateTest, shutdown, _routes: ROUTES, MAX_PILOTS };
