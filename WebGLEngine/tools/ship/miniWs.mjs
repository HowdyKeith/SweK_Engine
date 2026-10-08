// WebGLEngine/tools/ship/miniWs.mjs -- v4681
//
// A MINIMAL WEBSOCKET, SERVER AND CLIENT, FOR NODE, WITH NO DEPENDENCY: RFC 6455's text frames, continuation, ping/pong and close, over node:http's
// 'upgrade'. It exists for the lockstep relay (tools/ship/lockstepRelay.mjs) and its node peer (tools/ship/lockstepPeer.mjs), so the cross-machine run needs
// nothing installed but node -- no `ws` package on a rig that has never had one, and no dependence on node's global WebSocket (22+ only). A browser peer uses
// its own native WebSocket against the same relay.
//
// What it is not: a general WebSocket. No extensions, no subprotocols, no TLS (a LAN tool), no binary frames (the lockstep speaks JSON text), and a 1 MB
// message cap. Origin is NOT checked -- run the relay on a network you trust.
"use strict";
import http from "node:http";
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11", MAX = 1 << 20;
const acceptKey = (key) => crypto.createHash("sha1").update(key + GUID).digest("base64");

/** One frame, ready to write. `mask` true for a client's (the RFC requires clients to mask, servers not to). */
export function encodeFrame(opcode, payload, mask) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload == null ? "" : String(payload), "utf8"), n = body.length;
    const head = n < 126 ? Buffer.from([0x80 | opcode, (mask ? 0x80 : 0) | n]) : n < 65536 ? Buffer.from([0x80 | opcode, (mask ? 0x80 : 0) | 126, n >> 8, n & 0xff]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = (mask ? 0x80 : 0) | 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
    if (!mask) return Buffer.concat([head, body]);
    const key = crypto.randomBytes(4), out = Buffer.alloc(n); for (let i = 0; i < n; i++) out[i] = body[i] ^ key[i & 3];
    return Buffer.concat([head, key, out]);
}

/** Wrap a connected socket as a ws: send(text), on("message"|"close"|"error", fn), close(). `client` says which side masks. */
function wrap(socket, client, leftover) {
    const handlers = { message: [], close: [], error: [] }, emit = (k, ...a) => { for (const f of handlers[k]) { try { f(...a); } catch (e) { setImmediate(() => { throw e; }); } } };
    let buf = leftover && leftover.length ? Buffer.from(leftover) : Buffer.alloc(0), frag = null, closed = false;
    const ws = {
        on(k, f) { handlers[k].push(f); return ws; },
        send(text) { if (!closed) socket.write(encodeFrame(0x1, text, client)); },
        close() { if (!closed) { closed = true; try { socket.write(encodeFrame(0x8, Buffer.alloc(0), client)); } catch (e) {} socket.end(); } },
        get open() { return !closed; },
    };
    function drain() {
        for (;;) {
            if (buf.length < 2) return;
            const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0; let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (len > MAX) { socket.destroy(new Error("miniWs: frame over " + MAX + " bytes")); return; }
            if (buf.length < off + (masked ? 4 : 0) + len) return;
            let payload = buf.subarray(off + (masked ? 4 : 0), off + (masked ? 4 : 0) + len);
            if (masked) { const key = buf.subarray(off, off + 4), out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ key[i & 3]; payload = out; }
            buf = buf.subarray(off + (masked ? 4 : 0) + len);
            if (op === 0x8) { if (!closed) { closed = true; try { socket.write(encodeFrame(0x8, Buffer.alloc(0), client)); } catch (e) {} socket.end(); } return; }
            if (op === 0x9) { socket.write(encodeFrame(0xa, payload, client)); continue; }
            if (op === 0xa) continue;
            if (op === 0x1 || op === 0x0) { frag = op === 0x1 ? [payload] : (frag || []).concat([payload]); if (fin) { emit("message", Buffer.concat(frag).toString("utf8")); frag = null; } }
        }
    }
    socket.on("data", (d) => { buf = Buffer.concat([buf, d]); drain(); });
    socket.on("close", () => { closed = true; emit("close"); });
    socket.on("error", (e) => emit("error", e));
    if (buf.length) setImmediate(drain);   // bytes that rode in with the 101: after the caller has had its chance to attach on("message")
    return ws;
}

/** Attach to a node:http server: `onConnect(ws, req)` for every upgrade. Returns the server. */
export function attach(server, onConnect) {
    server.on("upgrade", (req, socket) => {
        const key = req.headers["sec-websocket-key"];
        if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket") { socket.destroy(); return; }
        socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n");
        socket.setNoDelay(true);
        onConnect(wrap(socket, false), req);
    });
    return server;
}

/** Connect to ws://host:port/path. Resolves with the ws once the server's 101 and its accept key check out. */
export function connect(url, { timeoutMs = 10000 } = {}) {
    const u = new URL(url), key = crypto.randomBytes(16).toString("base64");
    return new Promise((resolve, reject) => {
        const req = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13" }, timeout: timeoutMs });
        req.on("upgrade", (res, socket, head) => {
            if (res.headers["sec-websocket-accept"] !== acceptKey(key)) { socket.destroy(); reject(new Error("miniWs: the server's accept key is wrong")); return; }
            socket.setNoDelay(true); resolve(wrap(socket, true, head));
        });
        req.on("response", (res) => reject(new Error("miniWs: the server answered HTTP " + res.statusCode + " instead of upgrading")));
        req.on("timeout", () => { req.destroy(new Error("miniWs: connect timed out")); });
        req.on("error", reject);
        req.end();
    });
}
