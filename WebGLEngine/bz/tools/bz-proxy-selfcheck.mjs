// bz/tools/bz-proxy-selfcheck.mjs — the browser reaches a real bzfs, and the frame codec is exact.
//
//   node bz/tools/bz-proxy-selfcheck.mjs                 (frame codec + guards; no server needed)
//   BZFS_BIN=... BZFS_MAP=... node bz/tools/bz-proxy-selfcheck.mjs   (adds the full live chain)
//
// Two halves, and they are tested the two ways those things can be tested.
//
// The FRAME CODEC (`ai-bridge/bzWsFrame.js`) is transcribed from RFC 6455, and the assertions are exact
// bytes worked out by hand from the spec -- the accept key for the RFC's own example, a masked frame
// unmasked, a server frame that is never masked. A codec round-tripped through itself proves nothing.
//
// The PROXY (`ai-bridge/bzProxy.js`) is tested over real sockets: Node's own built-in `WebSocket` -- a
// completely independent implementation of the other half of the spec -- dials the proxy, and the proxy
// dials a real `bzfs` built from BZFlag's own source. If our server framing and Node's client framing agree,
// and a real bzfs answers through them, the proxy works. That is the only test that means anything, and it
// SKIPS loudly without a bzfs rather than passing on a technicality.

import { createRequire } from "module";
import { createServer } from "http";
import { spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const wsframe = require(path.join(ENGINE, "ai-bridge", "bzWsFrame.js"));
const proxy = require(path.join(ENGINE, "ai-bridge", "bzProxy.js"));

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const hex = (b) => Buffer.from(b).toString("hex");

// --- 1. the handshake, from RFC 6455's own example ----------------------------------------------------
{
    // The spec gives this exact key and this exact accept value in section 1.3.
    ok("the accept key is sha1(key + GUID), base64 -- the RFC's own example",
        wsframe.acceptKey("dGhlIHNhbXBsZSBub25jZQ==") === "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    ok("the GUID is the constant the spec fixes, not a nonce", wsframe.GUID === "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    const r = wsframe.handshakeResponse("dGhlIHNhbXBsZSBub25jZQ==");
    ok("the response is a 101", /^HTTP\/1\.1 101 /.test(r));
    ok("...that upgrades", /Upgrade: websocket/i.test(r) && /Connection: Upgrade/i.test(r));
    ok("...and carries the accept key", /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/.test(r));

    const req = (h) => ({ headers: h });
    ok("a websocket upgrade is recognised", wsframe.isWebSocketUpgrade(req({ upgrade: "websocket", connection: "Upgrade", "sec-websocket-key": "x" })));
    ok("...case-insensitively", wsframe.isWebSocketUpgrade(req({ upgrade: "WebSocket", connection: "keep-alive, Upgrade", "sec-websocket-key": "x" })));
    ok("a plain GET is not one", !wsframe.isWebSocketUpgrade(req({})));
    ok("...nor an upgrade with no key", !wsframe.isWebSocketUpgrade(req({ upgrade: "websocket", connection: "Upgrade" })));
}

// --- 2. frames out: a server never masks --------------------------------------------------------------
{
    const small = wsframe.binaryFrame(Buffer.from([1, 2, 3]));
    ok("a small binary frame is FIN|binary, unmasked, len, payload", hex(small) === "8203010203");
    ok("...and the mask bit is clear, because a server never masks", (small[1] & 0x80) === 0);

    const at125 = wsframe.encodeFrame(2, Buffer.alloc(125));
    ok("125 bytes fit in the seven-bit length", at125[1] === 125 && at125.length === 127);
    const at126 = wsframe.encodeFrame(2, Buffer.alloc(126));
    ok("126 tips into the sixteen-bit length", at126[1] === 126 && at126.readUInt16BE(2) === 126 && at126.length === 130);
    const at65535 = wsframe.encodeFrame(2, Buffer.alloc(65535));
    ok("65535 is the last that fits in sixteen bits", at65535[1] === 126 && at65535.readUInt16BE(2) === 65535);
    const at65536 = wsframe.encodeFrame(2, Buffer.alloc(65536));
    ok("65536 tips into the sixty-four-bit length", at65536[1] === 127 && at65536.readUInt32BE(6) === 65536 && at65536.length === 65546);

    ok("a close frame carries a code", hex(wsframe.closeFrame(1000).subarray(0, 4)) === "880203e8");
    ok("a pong echoes a ping's payload", hex(wsframe.pongFrame(Buffer.from([9, 9]))) === "8a020909");
}

// --- 3. frames in: a client frame is always masked ------------------------------------------------------
{
    // Build a masked client frame by hand: FIN|binary, MASK|3, key, masked payload.
    const key = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
    const raw = Buffer.from([1, 2, 3]);
    const masked = Buffer.from(raw.map((b, i) => b ^ key[i & 3]));
    const frame = Buffer.concat([Buffer.from([0x82, 0x83]), key, masked]);
    const { frames, rest } = wsframe.decodeFrames(frame);
    ok("a masked client frame decodes", frames.length === 1 && rest.length === 0);
    ok("...unmasked back to its payload", hex(frames[0].payload) === "010203");
    ok("...as a binary frame", frames[0].opcode === wsframe.OP.BINARY && frames[0].fin);

    // TCP delivers bytes, not frames.
    const two = Buffer.concat([frame, frame]);
    ok("two frames in one segment are two frames", wsframe.decodeFrames(two).frames.length === 2);
    ok("half a frame is a partial read, not an error", (() => { const r = wsframe.decodeFrames(frame.subarray(0, 5)); return r.frames.length === 0 && r.rest.length === 5; })());

    // The guards.
    let threw;
    threw = false; try { wsframe.decodeFrames(Buffer.from([0x82, 0x03, 1, 2, 3])); } catch (e) { threw = /masked/.test(e.message); }
    ok("an UNMASKED client frame is refused: the spec says fail the connection", threw);
    // A 64-bit length with a non-zero HIGH word -- more than 4 GiB. The full 8-byte length must be present
    // for the check to fire (a shorter buffer is a partial read, not an error), so the frame carries a mask
    // key and a byte of payload space too.
    threw = false;
    try { wsframe.decodeFrames(Buffer.concat([Buffer.from([0x82, 0xff, 0, 0, 0, 1, 0, 0, 0, 0]), key, Buffer.alloc(1)])); }
    catch (e) { threw = /GiB/.test(e.message); }
    ok("a length with a non-zero high word (over 4 GiB) is refused before allocating", threw);
    threw = false; try { wsframe.decodeFrames(Buffer.concat([Buffer.from([0x82, 0xfe]), Buffer.from([0xff, 0xff]), key]), 1000); } catch (e) { threw = /cap/.test(e.message); }
    ok("a frame over the cap is refused, not allocated", threw);
    threw = false; try { wsframe.decodeFrames(Buffer.concat([Buffer.from([0xc2, 0x83]), key, masked])); } catch (e) { threw = /reserved/.test(e.message); }
    ok("a reserved bit with no extension negotiated is refused", threw);
}

// --- 4. reassembly: a message may arrive in pieces ------------------------------------------------------
{
    const msgs = [], ctrls = [];
    const feed = wsframe.createReassembler((op, m) => msgs.push({ op, m }), (f) => ctrls.push(f));
    feed({ fin: false, opcode: wsframe.OP.BINARY, payload: Buffer.from([1, 2]) });
    feed({ fin: false, opcode: wsframe.OP.CONT, payload: Buffer.from([3]) });
    feed({ fin: true, opcode: wsframe.OP.CONT, payload: Buffer.from([4, 5]) });
    ok("three fragments become one message", msgs.length === 1 && hex(msgs[0].m) === "0102030405");
    ok("...keeping the first frame's opcode", msgs[0].op === wsframe.OP.BINARY);

    // A ping may arrive in the middle of a message, and does not disturb it.
    const m2 = [], c2 = [];
    const f2 = wsframe.createReassembler((op, m) => m2.push(m), (f) => c2.push(f));
    f2({ fin: false, opcode: wsframe.OP.BINARY, payload: Buffer.from([1]) });
    f2({ fin: true, opcode: wsframe.OP.PING, payload: Buffer.from([9]) });
    f2({ fin: true, opcode: wsframe.OP.CONT, payload: Buffer.from([2]) });
    ok("a control frame in the middle of a message is delivered separately", c2.length === 1 && c2[0].opcode === wsframe.OP.PING);
    ok("...and the message still completes intact", m2.length === 1 && hex(m2[0]) === "0102");

    let threw = false;
    try { const f3 = wsframe.createReassembler(() => {}, () => {}); f3({ fin: true, opcode: wsframe.OP.CONT, payload: Buffer.alloc(0) }); } catch (e) { threw = true; }
    ok("a continuation with nothing to continue is refused", threw);
}

// --- 5. the proxy's guards, before any socket opens -----------------------------------------------------
{
    ok("the proxy owns /bz/ws", proxy.owns("/bz/ws?host=a&port=1"));
    ok("...and nothing else", !proxy.owns("/bz/status") && !proxy.owns("/ws"));

    const bad = (url) => proxy.checkTarget("http://x" + url);
    ok("a host and a port are accepted", bad("/bz/ws?host=1.2.3.4&port=5154").ok);
    ok("a missing host is refused", !bad("/bz/ws?port=5154").ok);
    ok("a port out of range is refused", !bad("/bz/ws?host=x&port=99999").ok);
    ok("REFUSING TO DIAL LINK-LOCAL: 169.254.* is where a cloud keeps its credentials", !bad("/bz/ws?host=169.254.169.254&port=80").ok
        && /link-local/.test(bad("/bz/ws?host=169.254.169.254&port=80").reason));
    ok("...and the wildcard address", !bad("/bz/ws?host=0.0.0.0&port=1").ok);
    ok("...and the IPv6 wildcard", !bad("/bz/ws?host=::&port=1").ok);
    ok("a host with a slash in it is not a host", !bad("/bz/ws?host=a%2Fb&port=1").ok);

    // The allowlist.
    process.env.BZ_PROXY_ALLOW = "gm.example:5154";
    ok("with an allowlist, only what is on it is dialled", !bad("/bz/ws?host=1.2.3.4&port=5154").ok);
    ok("...and what is on it, is", bad("/bz/ws?host=gm.example&port=5154").ok);
    delete process.env.BZ_PROXY_ALLOW;
}

// --- 6. an untrusted upgrade is refused BEFORE the socket opens -----------------------------------------
{
    const net = await import("net");
    const seen = { upgrades: 0, forbidden: false };
    const srv = createServer((req, res) => { res.writeHead(200); res.end(); });
    srv.on("upgrade", (req, socket, head) => {
        seen.upgrades++;
        proxy.upgrade(req, socket, head, { isTrusted: () => false });   // always untrusted
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const port = srv.address().port;

    const sock = net.connect(port, "127.0.0.1");
    let resp = "";
    sock.on("data", (d) => { resp += d; });
    sock.write("GET /bz/ws?host=1.2.3.4&port=5154 HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n");
    await sleep(300);
    ok("an untrusted upgrade is answered 403 and hung up", /403/.test(resp), resp.split("\r\n")[0]);
    ok("...and no TCP was ever dialled", proxy.status().opened === 0);
    try { sock.destroy(); } catch (e) {}
    await new Promise((r) => srv.close(r));
}

// --- 7. THE LIVE CHAIN: a WebSocket client -> the proxy -> a real bzfs -----------------------------------
const CANDIDATES = [process.env.BZFS_BIN, "/tmp/bz/bzflag-2.4/src/bzfs/bzfs", "/usr/local/bin/bzfs"].filter(Boolean);
const BZFS = CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const MAP = process.env.BZFS_MAP || "/tmp/bz/bzflag-2.4/misc/maps/hix.bzw";

if (!BZFS || !fs.existsSync(MAP)) {
    console.log("");
    console.log("  SKIP  the live chain needs a real bzfs. See bz/tools/bzfs-real-probe.mjs to build one.");
} else {
    const bzfs = spawn(BZFS, ["-p", "15930", "-world", MAP, "-mp", "4,4,4,4,4,4"], { stdio: ["ignore", "pipe", "pipe"] });
    await sleep(2500);

    // A bridge that hosts nothing but the proxy on its upgrade path -- the same wiring server.js uses.
    const bridge = createServer((req, res) => { res.writeHead(404); res.end(); });
    bridge.on("upgrade", (req, socket, head) => { if (proxy.owns(req.url)) proxy.upgrade(req, socket, head, { isTrusted: () => true }); });
    await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
    const proxyPort = bridge.address().port;

    // The client is bzfsClient, driven through the proxy by a `proxyUrl` -- the exact code bzflag.html runs.
    const { createClient } = await import("../net/bzfsClient.mjs");
    const { TeamColor, PlayerType } = await import("../net/bzProtocol.js");
    let accepted = false, world = null, hello = null;
    const c = createClient({
        host: "127.0.0.1", port: 15930, callsign: "browser",
        team: TeamColor.ObserverTeam, type: PlayerType.TankPlayer, udp: false, wantWorld: true,
        proxyUrl: `ws://127.0.0.1:${proxyPort}`,           // <-- the browser transport
        log: () => {},
        on: { hello: (h) => { hello = h; }, accepted: () => { accepted = true; }, world: (b, r) => { world = r; } },
    });
    await c.connect();
    for (let i = 0; i < 100 && !(accepted && world); i++) await sleep(100);

    console.log("");
    ok("a WebSocket client, through the proxy, completes BZFlag's handshake with a real bzfs", accepted, hello ? JSON.stringify(hello) : "no hello");
    ok("...speaking the same BZFS0221 it speaks over TCP", hello && hello.version === "BZFS0221");
    ok("...and MsgGetWorld arrives through the proxy, byte-exact", !!world && world.hash.ok);
    ok(`...${world ? world.obstacles.length : 0} obstacles, over a browser transport`, world && world.obstacles.length > 0);
    ok("the proxy dialled exactly one TCP connection", proxy.status().opened === 1);
    ok("...and moved bytes both ways", proxy.status().bytesToServer > 0 && proxy.status().bytesToBrowser > 0);

    c.close();
    await sleep(300);
    ok("closing the client takes the proxy connection down", proxy._live() === 0);

    try { bzfs.kill(); } catch (e) {}
    await new Promise((r) => bridge.close(r));
}

proxy.shutdown();
console.log("");
console.log("  (the frame codec is RFC 6455 by hand; the live chain is Node's own WebSocket client through");
console.log("   our proxy to a bzfs built from BZFlag's source. The browser gets the code a real server");
console.log("   already accepted over TCP, one transport swap away.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
