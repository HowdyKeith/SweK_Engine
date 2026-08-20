// WebGLEngine/ai-bridge/bzWsFrame.js — RFC 6455, the server half, and nothing else.
//
// A browser cannot open a TCP socket. A BZFlag server speaks nothing but TCP. So the only way the viewer
// meets a real `bzfs` is a proxy, and the only thing a browser can dial is a WebSocket.
//
// This is that half of it. It is deliberately small and deliberately its own: `ws` is already a dependency
// of this bridge, and reusing it would be less code -- but it is not installed in the environment these
// tests run in, so a proxy built on it would ship unproved. A frame codec written here is checked against
// Node's own built-in `WebSocket` client, which is a completely independent implementation. Two
// implementations, one format, the same discipline as the pack/unpack transcriptions in bz/net.
//
// From RFC 6455:
//
//   the handshake     Sec-WebSocket-Accept = base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
//                     and that GUID is not a checksum, a version, or a nonce. It is a constant, chosen so
//                     that a cache or a proxy replaying an old response cannot accidentally complete a
//                     handshake. There is no reason to remember it; there is every reason to write it down.
//
//   a frame           FIN|RSV|opcode, MASK|len7, [len16|len64], [mask key], payload
//
//   AND EVERY FRAME A CLIENT SENDS IS MASKED. Not for secrecy -- the key is right there in the frame. It
//   exists so that a hostile page cannot make a browser emit bytes that a transparent proxy would mistake
//   for an HTTP request. A server that forgets to unmask reads noise; a server that MASKS its own frames is
//   violating the spec and every client will hang up on it.

"use strict";

const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

function acceptKey(secWebSocketKey) {
    return crypto.createHash("sha1").update(String(secWebSocketKey) + GUID).digest("base64");
}

// The 101 that turns an HTTP request into a socket. `Connection: Upgrade` is not optional and neither is
// the accept key; a browser checks both and closes without a word if either is wrong.
function handshakeResponse(key) {
    return [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Accept: " + acceptKey(key),
        "", "",
    ].join("\r\n");
}

function isWebSocketUpgrade(req) {
    const h = req.headers || {};
    return String(h.upgrade || "").toLowerCase() === "websocket"
        && /(^|,)\s*upgrade\s*(,|$)/i.test(String(h.connection || ""))
        && !!h["sec-websocket-key"];
}

// --- frames out -----------------------------------------------------------------------------------------
// A server NEVER masks. The length has three forms and the boundaries are exact: 125 fits in seven bits,
// 65535 in sixteen, and anything larger takes a 64-bit field whose high half we simply do not need.
function encodeFrame(opcode, payload) {
    const data = payload || Buffer.alloc(0);
    const n = data.length;
    let header;
    if (n <= 125) {
        header = Buffer.alloc(2);
        header[1] = n;
    } else if (n <= 0xffff) {
        header = Buffer.alloc(4);
        header[1] = 126;
        header.writeUInt16BE(n, 2);
    } else {
        header = Buffer.alloc(10);
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(n, 6);
    }
    header[0] = 0x80 | (opcode & 0x0f);      // FIN, no RSV
    return Buffer.concat([header, data]);
}

const binaryFrame = (buf) => encodeFrame(OP.BINARY, Buffer.from(buf));
const pongFrame = (buf) => encodeFrame(OP.PONG, Buffer.from(buf || []));
function closeFrame(code = 1000, reason = "") {
    const r = Buffer.from(String(reason), "utf8");
    const b = Buffer.alloc(2 + r.length);
    b.writeUInt16BE(code, 0);
    r.copy(b, 2);
    return encodeFrame(OP.CLOSE, b);
}

// --- frames in ------------------------------------------------------------------------------------------
// Returns whole frames and whatever bytes are left over: TCP delivers bytes, not frames, and a browser that
// sends two frames in one segment is a browser behaving normally.
//
// `maxPayload` is not politeness. A 64-bit length field lets a peer ask for eight exabytes, and the only
// defence against a one-frame denial of service is to refuse before allocating.
function decodeFrames(buf, maxPayload = 1 << 20) {
    const frames = [];
    let at = 0;
    for (;;) {
        if (buf.length - at < 2) break;
        const b0 = buf[at], b1 = buf[at + 1];
        const fin = !!(b0 & 0x80);
        const rsv = b0 & 0x70;
        const opcode = b0 & 0x0f;
        const masked = !!(b1 & 0x80);
        let len = b1 & 0x7f;
        let p = at + 2;

        if (rsv) throw new RangeError("reserved bits set: no extension was negotiated");
        if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
        else if (len === 127) {
            if (buf.length - p < 8) break;
            const hi = buf.readUInt32BE(p), lo = buf.readUInt32BE(p + 4);
            if (hi !== 0) throw new RangeError("a frame of more than 4 GiB is not a frame");
            len = lo; p += 8;
        }
        if (len > maxPayload) throw new RangeError(`frame of ${len} bytes exceeds the ${maxPayload}-byte cap`);
        // Every client frame is masked. A server that accepts an unmasked one is a server the spec says
        // must fail the connection.
        if (!masked) throw new RangeError("a client frame must be masked");
        if (buf.length - p < 4 + len) break;

        const key = buf.subarray(p, p + 4); p += 4;
        const payload = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) payload[i] = buf[p + i] ^ key[i & 3];
        p += len;

        frames.push({ fin, opcode, payload });
        at = p;
    }
    return { frames, rest: buf.subarray(at) };
}

// A stream of frames becomes a stream of MESSAGES: a message may arrive in pieces, and a control frame may
// arrive in the middle of one. Control frames are never fragmented and never interrupt a message's order.
function createReassembler(onMessage, onControl, maxMessage = 1 << 20) {
    let parts = [], partsOp = null, size = 0;
    return function feed(frame) {
        if (frame.opcode === OP.CLOSE || frame.opcode === OP.PING || frame.opcode === OP.PONG) {
            if (!frame.fin) throw new RangeError("a control frame is never fragmented");
            return onControl(frame);
        }
        if (frame.opcode === OP.CONT) {
            if (partsOp === null) throw new RangeError("a continuation frame with nothing to continue");
        } else {
            if (partsOp !== null) throw new RangeError("a new message began before the last one ended");
            partsOp = frame.opcode;
        }
        size += frame.payload.length;
        if (size > maxMessage) throw new RangeError("message exceeds the cap");
        parts.push(frame.payload);
        if (!frame.fin) return;
        const msg = Buffer.concat(parts);
        const op = partsOp;
        parts = []; partsOp = null; size = 0;
        onMessage(op, msg);
    };
}

module.exports = {
    GUID, OP, acceptKey, handshakeResponse, isWebSocketUpgrade,
    encodeFrame, binaryFrame, pongFrame, closeFrame, decodeFrames, createReassembler,
};
