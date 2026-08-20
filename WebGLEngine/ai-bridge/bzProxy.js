// WebGLEngine/ai-bridge/bzProxy.js — the only way a browser meets a real bzfs.
//
//   ws://<this>/bz/ws?host=<server>&port=5154
//
// A browser cannot open a TCP socket. `bzfs` speaks nothing but TCP. So `bzflag.html` dials a WebSocket at
// this proxy, and this proxy opens the TCP socket on its behalf and copies bytes both ways, unchanged. It
// adds nothing, interprets nothing, and buffers nothing it does not have to: the BZFlag framing already
// says where every message ends, and re-framing it here would be a second opinion nobody asked for.
//
// THIS IS AN OUTBOUND TCP PROXY, and that is a dangerous thing to leave lying around. Every guard below is
// load-bearing:
//
//   * TRUSTED REQUESTS ONLY. The same `_isTrustedReq` the rest of the bridge uses -- the host, an
//     authenticated session, or a LAN peer the operator has exempted. The check is handed in, not imported,
//     so this file cannot decide for itself who is trusted.
//   * A PORT, AND ONLY A PORT. No unix sockets, no scheme, no path. `host` is a hostname or an address and
//     `port` is a number in 1..65535.
//   * NO LOOPBACK-ONLY ILLUSIONS, AND NO LINK-LOCAL. `169.254.*` is where a cloud instance keeps its
//     credentials, and a proxy that will dial it for you is a credential leak wearing a game's clothes. It
//     is refused by name, and so is `0.0.0.0` and the IPv6 equivalents.
//   * AN ALLOWLIST, IF THE OPERATOR WANTS ONE. `BZ_PROXY_ALLOW=host:port,host:port` and nothing else is
//     dialled. Unset means "anything the trust check let through", which on a laptop is the right default
//     and on a public box is not.
//   * A CONNECTION CAP, AN IDLE TIMEOUT, AND A BYTE COUNTER. A proxy nobody is watching is a proxy nobody
//     notices.
//
// The WebSocket framing is `ai-bridge/bzWsFrame.js`, written here rather than taken from `ws`, because the
// environment these tests run in does not have `ws` and a proxy that ships unproved is worse than none.

"use strict";

const net = require("net");
const {
    OP, handshakeResponse, isWebSocketUpgrade,
    binaryFrame, pongFrame, closeFrame, decodeFrames, createReassembler,
} = require("./bzWsFrame.js");

const PATH = "/bz/ws";
const MAX_CONNECTIONS = 8;
const IDLE_MS = 120000;
const MAX_FRAME = 1 << 20;

// A hostname or an address, and nothing clever. The refusals below are the point of the file.
const BAD_HOST = /^(0\.0\.0\.0|::|::0|169\.254\.|fe80:|\[?::ffff:169\.254\.)/i;

let live = new Set();
let stats = { opened: 0, refused: 0, bytesToServer: 0, bytesToBrowser: 0 };

function allowList() {
    const raw = String(process.env.BZ_PROXY_ALLOW || "").trim();
    if (!raw) return null;
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

// Returns { ok, host, port } or { ok:false, reason }.
function checkTarget(url) {
    const q = new URL(url, "http://x");
    const host = String(q.searchParams.get("host") || "").trim();
    const port = parseInt(q.searchParams.get("port") || "5154", 10);

    if (!host) return { ok: false, reason: "no host" };
    if (!/^[A-Za-z0-9._:\-\[\]]+$/.test(host)) return { ok: false, reason: "a host is a name or an address" };
    if (BAD_HOST.test(host)) return { ok: false, reason: `refusing to dial ${host}: link-local and wildcard addresses are not game servers` };
    if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false, reason: "a port is 1..65535" };

    const allow = allowList();
    if (allow && !allow.has(`${host}:${port}`)) return { ok: false, reason: `${host}:${port} is not in BZ_PROXY_ALLOW` };
    if (live.size >= MAX_CONNECTIONS) return { ok: false, reason: `already proxying ${live.size} connections` };
    return { ok: true, host, port };
}

function owns(url) { return (url || "").split("?")[0] === PATH; }

// Refuse an upgrade the way HTTP refuses anything: with a status line, and then silence.
function refuse(socket, code, text) {
    stats.refused++;
    try {
        socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        socket.destroy();
    } catch (e) { /* the socket is already gone; that is fine */ }
}

// The whole proxy. `head` is whatever bytes arrived with the upgrade request -- a browser sends none, and a
// client that sends some is a client we must not drop bytes for.
function upgrade(req, socket, head, ctx = {}) {
    if (!owns(req.url)) return false;

    const trusted = ctx.isTrusted ? !!ctx.isTrusted(req) : false;
    if (!trusted) { refuse(socket, 403, "Forbidden"); return true; }
    if (!isWebSocketUpgrade(req)) { refuse(socket, 400, "Bad Request"); return true; }

    const t = checkTarget(req.url);
    if (!t.ok) { refuse(socket, 400, "Bad Request"); if (ctx.log) ctx.log("bz proxy refused: " + t.reason); return true; }

    socket.setNoDelay(true);
    socket.write(handshakeResponse(req.headers["sec-websocket-key"]));

    const tcp = net.createConnection({ host: t.host, port: t.port });
    tcp.setNoDelay(true);
    const conn = { ws: socket, tcp, host: t.host, port: t.port, at: Date.now() };
    live.add(conn);
    stats.opened++;
    if (ctx.log) ctx.log(`bz proxy open -> ${t.host}:${t.port} (${live.size} live)`);

    let closed = false;
    const shut = (why) => {
        if (closed) return;
        closed = true;
        live.delete(conn);
        try { socket.write(closeFrame(1000, why || "")); } catch (e) {}
        try { socket.destroy(); } catch (e) {}
        try { tcp.destroy(); } catch (e) {}
        if (ctx.log) ctx.log(`bz proxy closed (${why || "done"}); ${live.size} live`);
    };

    // Either end going quiet takes the other with it. A half-open proxy is a game that has stopped and does
    // not know it.
    const idle = setInterval(() => { if (Date.now() - conn.at > IDLE_MS) shut("idle"); }, 5000);
    const touch = () => { conn.at = Date.now(); };

    // browser -> server. The payload of a binary frame IS the BZFlag stream. Nothing is added.
    const feed = createReassembler(
        (op, msg) => {
            touch();
            if (op !== OP.BINARY) return;          // a text frame is not a BZFlag message
            stats.bytesToServer += msg.length;
            tcp.write(msg);
        },
        (frame) => {
            touch();
            if (frame.opcode === OP.PING) socket.write(pongFrame(frame.payload));
            else if (frame.opcode === OP.CLOSE) shut("browser closed");
        },
        MAX_FRAME,
    );

    let inbuf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    const pump = () => {
        let out;
        try { out = decodeFrames(inbuf, MAX_FRAME); } catch (e) { shut(e.message); return; }
        inbuf = out.rest;
        for (const f of out.frames) { try { feed(f); } catch (e) { shut(e.message); return; } }
    };
    pump();

    socket.on("data", (chunk) => { inbuf = Buffer.concat([inbuf, chunk]); pump(); });
    socket.on("error", () => shut("browser error"));
    socket.on("close", () => { clearInterval(idle); shut("browser gone"); });

    // server -> browser. One binary frame per TCP chunk: the BZFlag framing already says where a message
    // ends, and a proxy that re-framed it would be a second opinion nobody asked for.
    tcp.on("connect", () => { if (ctx.log) ctx.log(`bz proxy connected to ${t.host}:${t.port}`); });
    tcp.on("data", (chunk) => { touch(); stats.bytesToBrowser += chunk.length; try { socket.write(binaryFrame(chunk)); } catch (e) { shut("browser write failed"); } });
    tcp.on("error", (e) => shut("server: " + e.message));
    tcp.on("close", () => { clearInterval(idle); shut("server closed"); });

    return true;
}

function status() {
    return {
        path: PATH,
        live: live.size,
        maxConnections: MAX_CONNECTIONS,
        allowList: allowList() ? [...allowList()] : null,
        ...stats,
    };
}

function shutdown() { for (const c of [...live]) { try { c.ws.destroy(); } catch (e) {} try { c.tcp.destroy(); } catch (e) {} } live.clear(); }
process.on("exit", shutdown);

module.exports = { owns, upgrade, status, shutdown, checkTarget, PATH, MAX_CONNECTIONS, _live: () => live.size };
