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
    const a = B.parseLiveFrame(Buffer.from(T.encodeLiveFrame(false, 5000, new Uint8Array([1, 2, 3, 4]), true)));
    ok("!! SOUND ON THE WIRE: flag 2 marks a sound frame (and not a keyframe); the bridge takes 8000-96000 Hz in one or two channels", a.audio === true && a.keyframe === false && a.ptsUs === 5000 && f.audio === false && B.checkAudio({ sampleRate: 48000, channels: 2 }).ok && !B.checkAudio({ sampleRate: 4000, channels: 2 }).ok && !B.checkAudio({ sampleRate: 48000, channels: 6 }).ok && !B.checkAudio({}).ok);
    const mono = T.toStereoS16([new Float32Array([0, 0.5, -0.5, 1])], 4, 48000), up = T.toStereoS16([new Float32Array(441), new Float32Array(441)], 441, 44100), loud = T.toStereoS16([new Float32Array([2, -2])], 2, 48000);
    ok("!! the page's mix: mono doubled to stereo, s16, a 44.1 kHz track resampled to 48 kHz, nothing past full scale", T.AUDIO.sampleRate === 48000 && T.AUDIO.channels === 2 && mono.length === 8 && mono[2] === 16384 && mono[3] === 16384 && mono[6] === 32767 && up.length === 480 * 2 && loud[0] === 32767 && loud[2] === -32768);
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
    // SOUND AND THE TV TALKING BACK
    const aud = [], s3 = new EventEmitter(); let end3; s3.done = new Promise((r) => { end3 = r; }); s3.writeH264 = () => true; s3.writeAudio = (pcm, pts) => { aud.push({ pcm, pts }); return true; }; s3.end = async () => { end3({}); }; s3.stop = s3.end;
    let opts3 = null; B._useSdk({ stream: async (o) => { opts3 = o; return s3; } });
    const ws3 = new EventEmitter(), got3 = []; ws3.send = (m) => got3.push(JSON.parse(m)); ws3.close = () => {}; B.attachLive(ws3);
    ws3.emit("message", Buffer.from(JSON.stringify({ type: "start", to: "Kitchen", width: 640, height: 360, fps: 30, audio: { sampleRate: 48000, channels: 2 } })), false); await tick();
    const pcm = new Int16Array([1000, -1000, 32767, -32768]);
    ws3.emit("message", Buffer.from(T.encodeLiveFrame(false, 21000, new Uint8Array(pcm.buffer), true)), true);
    ws3.emit("message", Buffer.from(T.encodeLiveFrame(false, 22000, new Uint8Array([1, 2, 3]), true)), true);   // not whole stereo frames: dropped
    ok("!! SOUND: a start with audio asks tvpipe for it; each sound frame reaches writeAudio as s16 with its time; a frame that is not whole stereo frames is dropped", opts3.audio && opts3.audio.sampleRate === 48000 && opts3.audio.channels === 2 && aud.length === 1 && aud[0].pts === 21000 && Array.from(aud[0].pcm).join() === "1000,-1000,32767,-32768" && /with sound 48000 Hz/.test(got3[0].session.source));
    s3.emit("receiver", { name: "Kitchen", protocol: "cast", state: "connected", delay_ms: 120 }); s3.emit("receiver", { name: "Kitchen", state: "lost" }); s3.emit("receiver", { name: "Kitchen", state: "reconnected" }); s3.emit("receiver", { name: "Kitchen", state: "ended" });
    const st3 = B.status().sessions.find((x) => x.to[0] === "Kitchen");
    ok("!! THE TV TALKS BACK: every receiver event is kept in order with its time (connected, lost, reconnected, ended), and the receiver's state and delay are current", st3.events.filter((e) => e.receiver).map((e) => e.state).join() === "connected,lost,reconnected,ended" && st3.events.every((e) => !isNaN(Date.parse(e.at))) && st3.receivers.Kitchen.state === "ended" && st3.receivers.Kitchen.delayMs === 120);
    end3({}); await tick(); await tick();
    ok("!! when the TV's own user ends it, the page is told so, in words", got3.some((m) => m.type === "ended" && /Kitchen ended it \(from the TV\)/.test(m.why)) && B.lastWhy({ events: [{ receiver: "TV", state: "gave-up" }] }) === "TV dropped out and did not come back");
    B._reset();
});

console.log("3. THE DOCK");
await section(() => {
    const sg = fs.readFileSync(path.join(ENG, "ui", "svgGaugeSet.js"), "utf8"), srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const defs = sg.slice(sg.indexOf("const DEFAULT_GAUGES"), sg.indexOf("];", sg.indexOf("const DEFAULT_GAUGES"))), order = [...defs.matchAll(/(source|action): "(\w+)"/g)].map((m) => m[2]);
    ok("!! a sixth row, TO TV, LIVE TV, TV OFF, LAST (after the AI row), so a saved dock is padded with it", order.slice(-6).join() === "claude5h,claudeweek,codex5h,tv,tvlive,tvoff" && order.length % 3 === 0 && /label: "TO TV"/.test(defs) && /label: "LIVE TV"/.test(defs) && /label: "TV OFF"/.test(defs));
    ok("!! each button imports ui/tvOut.js on its click: TV OFF stops, TO TV mirrors the page, LIVE TV streams the canvas; LIVE TV is disabled on a page with no canvas", /cfg\.action === "tv" \|\| cfg\.action === "tvlive" \|\| cfg\.action === "tvoff"/.test(sg) && /await import\("\.\/tvOut\.js"\)/.test(sg) && /tv\.stopTv\(\)/.test(sg) && /tv\.sharePage\(to\)/.test(sg) && /tv\.startLive\(to, \{ audio: !!pick\.audio \}\)/.test(sg) && /tv\.pickTv\(btn, \{ audioOption: cfg\.action === "tvlive" \}\)/.test(sg)
        && /cfg\.action === "tvlive" && typeof document !== "undefined" && !document\.querySelector\("canvas"\)\) disable/.test(sg));
    const i = srv.indexOf('wss.on("connection", (ws, req) => {');
    ok("!! the bridge takes /tv/live FIRST inside its one WebSocketServer (whose verifyClient applies the trust rule), not with a second upgrade listener", i > 0 && /if \(String\(req\.url \|\| ""\)\.split\("\?"\)\[0\] === "\/tv\/live"\) \{ tvpipeBridge\.attachLive\(ws\); return; \}/.test(srv.slice(i, i + 700)) && /verifyClient: \(info, cb\) => \{ try \{ cb\(_isTrustedReq\(info\.req\)/.test(srv));
});

await section(async () => {
    const t = Date.parse("2026-11-21T20:00:00Z"), iso = (s) => new Date(t - s * 1000).toISOString();
    const off = T.describe({ sessions: [] }), on = T.describe({ sessions: [{ kind: "live", to: ["Kitchen"], state: "playing", receivers: { Kitchen: { state: "connected", protocol: "cast" } }, events: [{ at: iso(5), receiver: "Kitchen", state: "connected" }] }] }, t);
    const bad = T.describe({ sessions: [{ kind: "share", to: ["Living Room", "Kitchen"], state: "playing", receivers: { "Living Room": { state: "connected" }, Kitchen: { state: "lost" } }, events: [{ at: iso(3), receiver: "Kitchen", state: "lost" }] }] }, t);
    ok("!! TV OFF SAYS WHAT THE TV SAYS: nothing on reads TV OFF; connected reads ON: <name> in green with who and when in its tooltip; a receiver lost reads LOST: <name> in red", off.state === "off" && off.caption === "TV OFF" && on.state === "on" && on.caption === "ON: KITCHEN" && on.color === "#5fd886" && /Kitchen connected \(cast\)/.test(on.title) && /Kitchen connected 5s ago/.test(on.title)
        && bad.state === "trouble" && bad.caption === "LOST: KITCHEN" && bad.color === "#ff6b6b" && /Living Room connected/.test(bad.title));
    let polls = 0; const seen = []; const stopW = T.watch((d) => seen.push(d.state), { intervalMs: 1, fetchStatus: async () => { polls++; return polls <= 2 ? { sessions: [{ kind: "live", to: ["K"], state: "playing", receivers: { K: { state: "connected" } } }] } : { sessions: [] }; } });
    await new Promise((r) => setTimeout(r, 80)); stopW();
    ok("!! the watcher polls while something plays and stops two polls after it ends (no endless polling on every docked page)", seen.slice(0, 2).join() === "on,on" && seen.slice(2).every((x) => x === "off") && polls === 4);
    const sg = fs.readFileSync(path.join(ENG, "ui", "svgGaugeSet.js"), "utf8");
    ok("!! the dock: one watcher for the TV row paints TV OFF (caption, colour, tooltip) and resets TO TV / LIVE TV when their session ends; TV OFF looks once on mount for a session already playing", /_tv\.stopWatch = tv\.watch\(\(d\) => \{/.test(sg) && /off\.setLabel\(d\.caption\); off\.btn\.title = d\.title;/.test(sg) && /if \(d\.state === "off"\)/.test(sg) && /cfg\.action === "tvoff" && typeof fetch === "function"\) fetch\("\/tv\/status"/.test(sg));
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
        const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination(); osc.frequency.value = 440; osc.connect(dst); osc.start();
        import("/ui/tvOut.js").then(async (tv) => { try { window.live = await tv.startLive("browser", { canvas: c, fps: 30, socketUrl: "ws://" + location.host + "/tv/live", audio: true, audioStream: dst.stream }); window.ready = 1; } catch (e) { window.failed = String(e.message || e); } });</script>`;
    const srv = http.createServer((q, r) => { const u = q.url.split("?")[0]; if (u === "/t.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(page); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": "text/javascript" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    const wss = new WebSocketServer({ server: srv }); wss.on("connection", (ws, req) => { if (req.url.split("?")[0] === "/tv/live") B.attachLive(ws); else ws.close(); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }), p = await browser.newPage(), errors = []; p.on("pageerror", (e) => errors.push(e.message));
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
    ok("!! AND ITS SOUND: a tone from a Web Audio graph, mixed to 48 kHz stereo on the page, reached tvpipe's writeAudio, and tvpipe opened the stream with audio", pageSide.audio === true && pageSide.audioSent > 20 && live && live.audioFrames > 20 && live.info && Array.isArray(live.info.audio) && live.info.audio.length > 0,
        JSON.stringify({ page: { audio: pageSide.audio, sent: pageSide.audioSent, why: pageSide.audioWhy }, bridge: live ? { audioFrames: live.audioFrames, audio: live.info && live.info.audio } : null }));
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
// SOUND AND THE TV TALKING BACK (2026-11-21, Keith: "Let the TV control the page ... Also an 'audio too' option"): 14 more mutants, 7 of each file, ALL 14
// RED (the sound flag dropped on the page and in the bridge, mono not doubled, no resampling, no clamp to full scale, a lost receiver reading as on, the
// watcher never stopping, the start not asking for sound; any sample rate let in, partial stereo frames passed on, tvpipe not asked for audio, receiver
// events not kept, the page not told why its stream ended, the receiver's delay forgotten after its first event).
