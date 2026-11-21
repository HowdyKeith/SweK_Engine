// WebGLEngine/tools/ship/tvOut-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tvOut-selfcheck.mjs      (seconds; section 4 runs a real browser and the real tvpipe when both are installed, else it says so)
//
// THIS PAGE ON A TV, HELD: the dock's TO TV / LIVE TV / TV OFF (ui/svgGaugeSet.js -> ui/tvOut.js) and the bridge's /tv/live socket
// (ai-bridge/tvpipeBridge.js attachLive). Four things hold it:
//
//   1  THE WIRE         what the page sends (encodeLiveFrame) is what the bridge reads (parseLiveFrame): the keyframe flag, the microsecond timestamp, the
//                       bytes; the size the page encodes at is even and at most 1920 x 1080; the bridge refuses an odd, huge or too-fast stream
//   2  THE LIVE SOCKET  against a stand-in SDK: the first message starts tvpipe's stream() as H.264 at that size; every frame reaches writeH264 as Annex B with
//                       its flag and time; tvpipe asking for a keyframe reaches the page, and frames that cannot start a picture are dropped until one comes;
//                       a backed-up pipe skips to the next keyframe; closing the socket ends the stream; a second start and a bad one are refused
//   3  THE DOCK         a sixth row of TO TV, LIVE TV and TV OFF, after the AI row, each wired to ui/tvOut.js; LIVE TV disabled on a page with no canvas;
//                       the bridge takes /tv/live inside its one WebSocketServer
//   4  END TO END       when installed: a headless browser draws a moving canvas, encodes it with WebCodecs and streams it through attachLive to the REAL tvpipe's
//                       browser receiver, which connects and takes the frames
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as T from "../../ui/tvOut.js";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const B = require(path.join(ENG, "ai-bridge", "tvpipeBridge.js"));
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const tick = () => new Promise((r) => setTimeout(r, 5));

console.log("tvOut-selfcheck -- this page on a TV: the dock's buttons and the live canvas\n");

console.log("1. THE WIRE");
await section(() => {
    const au = new Uint8Array([0, 0, 0, 1, 0x67, 9, 8, 7]), f = B.parseLiveFrame(Buffer.from(T.encodeLiveFrame(true, 123456789012, au))), g = B.parseLiveFrame(Buffer.from(T.encodeLiveFrame(false, 0, au)));
    ok("!! what the page sends is what the bridge reads: the keyframe flag, the timestamp in microseconds (past 2^32), the bytes", f.keyframe === true && f.ptsUs === 123456789012 && Buffer.compare(f.au, Buffer.from(au)) === 0 && g.keyframe === false && g.ptsUs === 0 && B.parseLiveFrame(Buffer.alloc(9)) === null);
    const s = (w, h) => T.liveSize(w, h);
    ok("!! the size the page encodes at is even and at most 1920 x 1080, keeping the canvas's shape", s(1280, 720).width === 1280 && s(1281, 721).width === 1280 && s(1281, 721).height === 720 && s(3840, 2160).width === 1920 && s(3840, 2160).height === 1080 && s(1000, 3000).height === 1080 && s(1000, 3000).width === 360 && s(1, 1).width === 2);
    ok("!! the bridge refuses an odd size, one over 3840 x 2160, and a rate outside 1-60", B.checkLive({ width: 1280, height: 720, fps: 30 }).ok && !B.checkLive({ width: 1281, height: 720, fps: 30 }).ok && !B.checkLive({ width: 4096, height: 2160, fps: 30 }).ok && !B.checkLive({ width: 640, height: 360, fps: 120 }).ok && !B.checkLive({}).ok);
    ok("!! the encoder is asked for high, main, then baseline H.264", T.CODECS.join() === "avc1.640028,avc1.4D4028,avc1.42E01F");
});

console.log("2. THE LIVE SOCKET (a stand-in SDK)");
await section(async () => {
    const calls = [], sess = new EventEmitter(); let full = false, ended = false, endDone; sess.done = new Promise((r) => { endDone = r; }); sess.info = { video: { codec: "h264" } };
    sess.writeH264 = (au, o) => { calls.push({ au: Buffer.from(au), ...o }); return !full; }; sess.end = async () => { ended = true; endDone({}); }; sess.stop = sess.end;
    const sdk = { stream: async (o) => { calls.push({ stream: o }); return sess; } };
    B._reset(); B._useSdk(sdk);
    const ws = new EventEmitter(), got = []; ws.send = (m) => got.push(JSON.parse(m)); ws.close = () => ws.emit("close");
    B.attachLive(ws);
    ws.emit("message", Buffer.from(T.encodeLiveFrame(true, 1, new Uint8Array([1]))), true);   // a frame before the start is ignored
    ws.emit("message", Buffer.from(JSON.stringify({ type: "start", to: "Living Room", width: 1280, height: 720, fps: 30 })), false); await tick();
    ok("!! the first message starts tvpipe's stream() as H.264 at that size and rate, to that TV; the page hears 'started'; a frame before it went nowhere", calls[0].stream && calls[0].stream.video.codec === "h264" && calls[0].stream.video.width === 1280 && calls[0].stream.video.fps === 30 && calls[0].stream.to === "Living Room" && got[0].type === "started" && got[0].session.kind === "live" && calls.length === 1);
    const send = (k, t, b) => ws.emit("message", Buffer.from(T.encodeLiveFrame(k, t, new Uint8Array(b))), true);
    send(true, 1000, [0, 0, 0, 1, 0x65]); send(false, 34000, [0, 0, 0, 1, 0x41]);
    ok("!! every frame reaches writeH264 as Annex B, with its keyframe flag and timestamp, and the bytes unchanged", calls.length === 3 && calls[1].keyframe === true && calls[1].ptsUs === 1000 && calls[1].annexB === true && calls[1].au[4] === 0x65 && calls[2].keyframe === false && calls[2].ptsUs === 34000);
    sess.emit("keyframe"); send(false, 67000, [1]); send(true, 100000, [2]);
    ok("!! TVPIPE ASKS FOR A KEYFRAME: the page is told, and frames that cannot start a picture are dropped until one comes", got.some((m) => m.type === "keyframe") && calls.length === 4 && calls[3].keyframe === true && calls[3].ptsUs === 100000);
    full = true; send(false, 133000, [3]); full = false; const n = calls.length; send(false, 166000, [4]); send(true, 200000, [5]);
    ok("!! A BACKED-UP PIPE: the page is asked for a keyframe and the frames after it wait for one, rather than falling behind", calls.length === n + 1 && calls[n].keyframe === true && got.filter((m) => m.type === "keyframe").length === 2 && B.status().sessions[0].backedUp === 1);
    ws.emit("message", Buffer.from(JSON.stringify({ type: "start", to: "TV", width: 640, height: 360, fps: 30 })), false); await tick();
    ok("!! a second start on one socket is refused", got[got.length - 1].type === "error" && /already started/.test(got[got.length - 1].error));
    ws.emit("close"); await tick();
    ok("!! CLOSING THE SOCKET ENDS THE STREAM: tvpipe plays out what it has and stops", ended && B.status().sessions[0].state === "stopped");
    const ws2 = new EventEmitter(), got2 = []; ws2.send = (m) => got2.push(JSON.parse(m)); ws2.close = () => {}; B.attachLive(ws2);
    ws2.emit("message", Buffer.from(JSON.stringify({ type: "start", to: "TV", width: 1281, height: 720, fps: 30 })), false); await tick();
    ws2.emit("message", Buffer.from(JSON.stringify({ type: "start", to: "--yes", width: 1280, height: 720, fps: 30 })), false); await tick();
    ok("!! a bad start is refused before tvpipe is asked: an odd width, a receiver that reads as an option", got2.length === 2 && got2.every((m) => m.type === "error") && /even/.test(got2[0].error) && /option/.test(got2[1].error) && calls.filter((c) => c.stream).length === 1);
    B._reset();
});

console.log("3. THE DOCK");
await section(() => {
    const sg = fs.readFileSync(path.join(ENG, "ui", "svgGaugeSet.js"), "utf8"), srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const defs = sg.slice(sg.indexOf("const DEFAULT_GAUGES"), sg.indexOf("];", sg.indexOf("const DEFAULT_GAUGES"))), order = [...defs.matchAll(/(source|action): "(\w+)"/g)].map((m) => m[2]);
    ok("!! a sixth row, TO TV, LIVE TV, TV OFF, LAST (after the AI row), so a saved dock is padded with it", order.slice(-6).join() === "claude5h,claudeweek,codex5h,tv,tvlive,tvoff" && order.length % 3 === 0 && /label: "TO TV"/.test(defs) && /label: "LIVE TV"/.test(defs) && /label: "TV OFF"/.test(defs));
    ok("!! each button imports ui/tvOut.js on its click: TV OFF stops, TO TV mirrors the page, LIVE TV streams the canvas; LIVE TV is disabled on a page with no canvas", /cfg\.action === "tv" \|\| cfg\.action === "tvlive" \|\| cfg\.action === "tvoff"/.test(sg) && /await import\("\.\/tvOut\.js"\)/.test(sg) && /tv\.stopTv\(\)/.test(sg) && /tv\.sharePage\(to\)/.test(sg) && /tv\.startLive\(to\)/.test(sg)
        && /cfg\.action === "tvlive" && typeof document !== "undefined" && !document\.querySelector\("canvas"\)\) disable/.test(sg));
    const i = srv.indexOf('wss.on("connection", (ws, req) => {');
    ok("!! the bridge takes /tv/live FIRST inside its one WebSocketServer (whose verifyClient applies the trust rule), not with a second upgrade listener", i > 0 && /if \(String\(req\.url \|\| ""\)\.split\("\?"\)\[0\] === "\/tv\/live"\) \{ tvpipeBridge\.attachLive\(ws\); return; \}/.test(srv.slice(i, i + 700)) && /verifyClient: \(info, cb\) => \{ try \{ cb\(_isTrustedReq\(info\.req\)/.test(srv));
});

console.log("4. END TO END (a real browser, the real tvpipe)");
await section(async () => {
    let sdk = null, chromium = null;
    try { sdk = await import(require.resolve("@tvpipe/sdk", { paths: [path.join(ENG, "ai-bridge")] })); } catch { /* not installed */ }
    try { chromium = require(require.resolve("playwright", { paths: [path.join(ENG, "tools", "render-qa"), ENG] })).chromium; } catch { try { chromium = (await import("playwright")).chromium; } catch { /* none */ } }
    if (!sdk || !chromium) { console.log(`  ----  skipped: ${!sdk ? "@tvpipe/sdk is not installed in ai-bridge" : "no playwright"} here`); return; }
    const { WebSocketServer } = require(require.resolve("ws", { paths: [path.join(ENG, "ai-bridge")] }));
    B._reset(); B._useSdk(sdk);
    const page = `<!doctype html><canvas id=c width=640 height=360></canvas><script type=module>
        const c = document.getElementById("c"), g = c.getContext("2d"); let t = 0; setInterval(() => { t++; g.fillStyle = "#123"; g.fillRect(0, 0, 640, 360); g.fillStyle = "#5ac8ff"; g.fillRect((t * 7) % 600, 150, 40, 40); }, 16);
        import("/ui/tvOut.js").then(async (tv) => { try { window.live = await tv.startLive("browser", { canvas: c, fps: 30, socketUrl: "ws://" + location.host + "/tv/live" }); window.ready = 1; } catch (e) { window.failed = String(e.message || e); } });</script>`;
    const srv = http.createServer((q, r) => { const u = q.url.split("?")[0]; if (u === "/t.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(page); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": "text/javascript" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    const wss = new WebSocketServer({ server: srv }); wss.on("connection", (ws, req) => { if (req.url.split("?")[0] === "/tv/live") B.attachLive(ws); else ws.close(); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const browser = await chromium.launch(), p = await browser.newPage(), errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/t.html`);
    await p.waitForFunction(() => window.ready || window.failed, null, { timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    // between the page's own keyframes (every 2 s): ask for one the way tvpipe does, and the page must answer within a few frames
    const keysBefore = await p.evaluate(() => (window.live ? window.live.stats().keys : -1)), recLive = [...B.status().sessions].find((x) => x.kind === "live");
    const live0 = recLive && B._sessionsForTest && B._sessionsForTest().get(recLive.id); if (live0 && live0.askKeyframe) live0.askKeyframe();
    await new Promise((r) => setTimeout(r, 300));
    const keysAfter = await p.evaluate(() => (window.live ? window.live.stats().keys : -1));
    await new Promise((r) => setTimeout(r, 1500));
    const pageSide = await p.evaluate(() => (window.live ? window.live.stats() : { failed: window.failed || "never started" }));
    const live = B.status().sessions.find((s) => s.kind === "live");
    ok("!! the page encoded its moving canvas with WebCodecs and sent frames; the bridge handed them to the real tvpipe, whose browser receiver connected", !pageSide.failed && pageSide.sent > 30 && !pageSide.error && live && live.state === "playing" && live.frames > 30 && live.receivers.browser && live.receivers.browser.state === "connected" && errors.length === 0,
        JSON.stringify({ page: { sent: pageSide.sent, codec: pageSide.codec, size: `${pageSide.width}x${pageSide.height}`, error: pageSide.error || pageSide.failed }, bridge: live ? { state: live.state, frames: live.frames, receivers: live.receivers, info: live.info && live.info.video } : null, errors }));
    ok("!! A KEYFRAME ASKED FOR between the page's own is answered within 300 ms", keysBefore >= 1 && keysAfter === keysBefore + 1, `keyframes sent: ${keysBefore} before the request, ${keysAfter} 300 ms after`);
    await p.evaluate(() => window.live && window.live.stop()); await new Promise((r) => setTimeout(r, 1500));
    ok("!! and closing the page's stream ends the tvpipe session", B.status().sessions.find((s) => s.kind === "live").state !== "playing");
    await browser.close(); wss.close(); srv.close(); B._reset();
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 20 mutants, 7 of ui/tvOut.js and 13 of ai-bridge/tvpipeBridge.js, each in a hard-linked copy of the tree, with the real SDK and browser: ALL 20 RED, one
// after a fix. The page: the keyframe flag inverted, the timestamp big-endian, odd sizes, no size cap, baseline asked for first, tvpipe's keyframe requests
// ignored -- GREEN at first, because the page's own keyframes every 2 s hid it, so section 4 now asks for one between them and wants it within 300 ms --,
// and AVCC instead of Annex B. The bridge: odd sizes and any rate let in, the wrong flag bit, a big-endian timestamp, frames not marked Annex B, no wait
// for a keyframe, the page not told of one, a backed-up pipe ignored, a closed socket leaving tvpipe running, a second start let in, raw video asked of
// tvpipe, the receiver unchecked, receivers read from events only.
