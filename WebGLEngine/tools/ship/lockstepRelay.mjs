#!/usr/bin/env node
// WebGLEngine/tools/ship/lockstepRelay.mjs -- v4822
//
// THE RELAY A LOCKSTEP RUNS THROUGH: a room of N peers, every text message one sends delivered to all the others, in order, and nothing else. It does not
// parse the lockstep, step anything or keep history; the peers' own protocol (physics/box3dLockstepNet.js: inputs sent ahead, redundantly, with a per-tick
// hash) is what holds the sim together, and what makes a relay that drops or delays a message harmless.
//
//   node tools/ship/lockstepRelay.mjs [--port 8799] [--host 0.0.0.0]
//
// A peer connects to ws://HOST:PORT/room/<name>?peer=<id>&n=<peers in the room>. When the n-th peer has joined, the relay tells EVERYONE
// {"t":"room","ready":true,"peers":[...]} -- peers hold their first input until then, since a message sent to a room nobody else has joined yet is a message the
// protocol never resends. A peer that leaves is announced {"t":"room","left":"<id>"}. No authentication, no TLS, no Origin check: a LAN tool for a run between
// your own machines (tools/ship/miniWs.mjs says so too).
"use strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attach } from "./miniWs.mjs";

/** Start a relay. Resolves { port, host, close(), rooms } once listening (port 0 picks a free one). */
export function startRelay({ port = 8799, host = "127.0.0.1", log = null } = {}) {
    const rooms = new Map();   // name -> { n, peers: Map(id -> ws) }
    const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("swek lockstep relay: ws://HOST:PORT/room/<name>?peer=<id>&n=<count>\n"); });
    attach(server, (ws, req) => {
        const u = new URL(req.url, "http://x"), m = /^\/room\/([^/]+)$/.exec(u.pathname), id = u.searchParams.get("peer"), n = Math.max(2, +u.searchParams.get("n") || 2);
        if (!m || !id) { ws.send(JSON.stringify({ t: "room", error: "connect to /room/<name>?peer=<id>&n=<count>" })); ws.close(); return; }
        const name = decodeURIComponent(m[1]);
        let room = rooms.get(name); if (!room) rooms.set(name, room = { n, peers: new Map() });
        if (room.peers.has(id)) { ws.send(JSON.stringify({ t: "room", error: "peer '" + id + "' is already in room '" + name + "'" })); ws.close(); return; }
        room.peers.set(id, ws); if (log) log("join", name, id, room.peers.size + "/" + room.n);
        if (room.peers.size >= room.n) { const ready = JSON.stringify({ t: "room", ready: true, peers: [...room.peers.keys()].sort() }); for (const w of room.peers.values()) w.send(ready); }
        ws.on("message", (text) => { for (const [pid, w] of room.peers) if (pid !== id) w.send(text); });
        ws.on("close", () => { if (room.peers.get(id) === ws) { room.peers.delete(id); for (const w of room.peers.values()) w.send(JSON.stringify({ t: "room", left: id })); if (!room.peers.size) rooms.delete(name); if (log) log("leave", name, id); } });
        ws.on("error", () => {});
    });
    return new Promise((resolve, reject) => {
        server.on("error", reject);
        server.listen(port, host, () => { const a = server.address(); resolve({ port: a.port, host, rooms, close: () => new Promise((r) => { for (const room of rooms.values()) for (const w of room.peers.values()) w.close(); server.close(() => r()); setTimeout(r, 200); }) }); });
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
    const r = await startRelay({ port: +arg("port", 8799), host: arg("host", "0.0.0.0"), log: (...a) => console.log(new Date().toISOString().slice(11, 19), ...a) });
    console.log(`lockstep relay listening on ws://${r.host}:${r.port}/room/<name>?peer=<id>&n=<count>   (Ctrl-C to stop)`);
}
