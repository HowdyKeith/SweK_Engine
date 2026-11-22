// WebGLEngine/ai-bridge/tvpipeBridge-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node ai-bridge/tvpipeBridge-selfcheck.mjs      (seconds; section 3 runs the REAL tvpipe when @tvpipe/sdk is installed in ai-bridge, else it says so)
//
// SWEK TO A TV THROUGH TVPIPE, HELD. ai-bridge/tvpipeBridge.js drives tvpipe's Node SDK for the /tv/* routes. Four things hold it:
//
//   1  WHAT IT HANDS TVPIPE   receivers and URLs checked before anything starts: no option smuggled in as a name, no password in a URL, no javascript:,
//                             data: or file:, a page only http(s), media also rtsp (go2rtc); a PIN is 4 to 8 digits
//   2  THE SESSIONS           against a stand-in SDK: share, play and the pattern reach the right SDK call with the right receivers; a TV shows one thing
//                             (a new session to it stops the old); stop one or all; a failure keeps tvpipe's error code and says it plainly; an Apple TV's PIN
//                             waits for the page and reaches tvpipe; no SDK, or old Node, is a reason, not a crash
//   3  THE REAL TVPIPE        when installed: its test pattern to tvpipe's own browser receiver, started, described and stopped, through this bridge
//   4  THE ROUTES             /tv/status, /tv/devices, /tv/share, /tv/play, /tv/pattern, /tv/stop, /tv/pin on the bridge, trusted callers only
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url), HERE = path.dirname(fileURLToPath(import.meta.url));
const B = require("./tvpipeBridge.js");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

/** A stand-in for @tvpipe/sdk: records every call; each session is an EventEmitter with stop() and done. */
function standIn({ fail = null, pinFor = null } = {}) {
    const calls = [];
    const session = (kind, src, opts) => {
        const s = new EventEmitter(); let end; s.done = new Promise((r, j) => { end = { r, j }; }); s.done.catch(() => {});
        s.receivers = new Map(); s.info = { video: { width: 1280, height: 720 } }; s.stopped = false;
        s.stop = async () => { s.stopped = true; end.r({ reason: "stopped" }); return { reason: "stopped" }; }; s._end = end;
        calls.push({ kind, src, opts, session: s }); return s;
    };
    const go = async (kind, src, opts) => {
        if (fail) { const e = new Error("stand-in failure"); e.code = fail; throw e; }
        if (pinFor && opts.onPin) calls.push({ kind: "pin", pin: await opts.onPin({ name: pinFor, address: "10.0.0.9" }) });
        return session(kind, src, opts);
    };
    return { calls, sdk: { share: (u, o) => go("share", u, o), play: (u, o) => go("play", u, o), testPattern: (o) => go("pattern", null, o),
        discover: async () => [{ name: "Living Room", model: "AppleTV14,1", addresses: ["10.0.0.9"], protocols: ["airplay"], video: true, paired: false, pin: true, airplay: { secret: 1 } }] } };
}

console.log("tvpipeBridge-selfcheck -- SweK to a TV through tvpipe\n");

console.log("1. WHAT IT HANDS TVPIPE");
await section(() => {
    const t = B.checkTarget;
    ok("!! receivers: a name, airplay:/cast:, an address, browser, or a list of up to 8; trimmed", t("Living Room").ok && t(" cast:Kitchen ").to[0] === "cast:Kitchen" && t(["browser", "192.168.1.20:7000"]).to.length === 2 && t(Array(8).fill("a")).ok);
    ok("!! refused: none, nine, empty, not a string, a control character, and a name starting '-' (tvpipe would read it as an OPTION)", !t([]).ok && !t(Array(9).fill("a")).ok && !t("").ok && !t(5).ok && !t("TV\nX").ok && !t("--tunnel").ok && !t(["ok", "-x"]).ok && /option/.test(t("--yes").why));
    const u = (x, k) => B.checkUrl(x, k);
    ok("!! a page to share is http(s), localhost included (tvpipe's browser runs ON THIS MACHINE); media may also be rtsp (go2rtc)", u("http://127.0.0.1:8787/battleship3d.html", "share").ok && u("https://x.example/a", "share").ok && u("rtsp://10.0.0.5:8554/cam", "play").ok && !u("rtsp://10.0.0.5/cam", "share").ok);
    ok("!! refused: javascript:, data:, file:, a URL with a password, a URL over 2000 characters, not a URL", !u("javascript:alert(1)", "share").ok && !u("data:text/html,x", "share").ok && !u("file:///etc/passwd", "play").ok && /password/.test(u("http://u:p@h/x", "play").why) && !u("http://h/" + "x".repeat(2000), "share").ok && !u("not a url", "share").ok && !u(undefined, "play").ok);
    ok("!! a PIN is 4 to 8 digits", B.checkPin("1234") && B.checkPin("12345678") && !B.checkPin("123") && !B.checkPin("123456789") && !B.checkPin("12a4") && !B.checkPin(null));
});

console.log("2. THE SESSIONS (a stand-in SDK)");
await section(async () => {
    B._reset(); let S = standIn(); B._useSdk(S.sdk);
    const a = await B.start("share", { to: "Living Room", url: "http://127.0.0.1:8787/battleship3d.html" });
    ok("!! share reaches sdk.share with the page and the receiver, and is playing", a.ok && S.calls[0].kind === "share" && S.calls[0].src === "http://127.0.0.1:8787/battleship3d.html" && S.calls[0].opts.to === "Living Room" && a.session.state === "playing" && a.session.info.video.width === 1280);
    S.calls[0].session.emit("receiver", { name: "Living Room", protocol: "airplay", state: "connected" });
    ok("!! a receiver's state reaches /tv/status", B.status().sessions[0].receivers["Living Room"].state === "connected" && B.status().installed);
    const b = await B.start("play", { to: ["LIVING ROOM", "Kitchen"], url: "rtsp://10.0.0.5:8554/cam" });
    ok("!! A TV SHOWS ONE THING: a new session to it (any case) stops the old first; a list is passed as a list", b.ok && S.calls[0].session.stopped && B.status().sessions.find((s) => s.id === a.session.id).state === "stopped" && Array.isArray(S.calls[1].opts.to) && S.calls[1].opts.to.length === 2);
    const c = await B.start("pattern", { to: "browser", latency: 99999 });
    ok("!! the pattern needs no URL; a different TV leaves the others playing; latency is held to 5-2000 ms", c.ok && S.calls[2].kind === "pattern" && !S.calls[1].session.stopped && S.calls[2].opts.latency === 2000);
    const stopped = await B.stop(c.session.id);
    ok("!! stop one by id, then all", stopped.join() === c.session.id && S.calls[2].session.stopped && !S.calls[1].session.stopped && (await B.stop()).length === 3 && S.calls[1].session.stopped);
    const d = await B.start("share", { to: "TV", url: "file:///etc/passwd" }), e2 = await B.start("share", { to: "--tunnel", url: "http://h/" });
    ok("!! a refused URL or receiver never reaches the SDK", !d.ok && !e2.ok && S.calls.length === 3);
    const f = await B.start("play", { to: "TV", url: "http://h/x.mp4" }); S.calls[3].session._end.j(Object.assign(new Error("lost"), { code: "no-receiver" })); await new Promise((r) => setTimeout(r, 0));
    ok("!! a session that FAILS later is marked failed, with tvpipe's code and a plain reason", f.ok && B.status().sessions.find((s) => s.id === f.session.id).state === "failed" && B.status().sessions.find((s) => s.id === f.session.id).error.code === "no-receiver" && /no TV by that name/.test(B.status().sessions.find((s) => s.id === f.session.id).error.message));
    B._reset(); S = standIn({ fail: "ffmpeg-missing" }); B._useSdk(S.sdk);
    const g = await B.start("play", { to: "TV", url: "http://h/x.mkv" });
    ok("!! a session that fails to START says why, with the code", !g.ok && g.code === "ffmpeg-missing" && /ffmpeg/.test(g.error) && g.session.state === "failed");
    B._reset(); S = standIn({ pinFor: "Living Room" }); B._useSdk(S.sdk);
    const pending = B.start("share", { to: "Living Room", url: "http://127.0.0.1:8787/x.html" }); await new Promise((r) => setTimeout(r, 0));
    const asked = B.status().pins;
    ok("!! AN APPLE TV'S PIN: the session waits, the page sees who asks; a wrong id or a bad PIN is refused; the right one reaches tvpipe", asked.length === 1 && asked[0].name === "Living Room" && !B.answerPin("pin-x", "1234").ok && !B.answerPin(asked[0].id, "12").ok && B.answerPin(asked[0].id, "4321").ok
        && (await pending).ok && S.calls[0].kind === "pin" && S.calls[0].pin === "4321" && B.status().pins.length === 0);
    const dv = await B.devices();
    ok("!! devices: tvpipe's discovery, each reduced to name, model, addresses, protocols, video, paired, pin (nothing else passed on)", dv.ok && dv.devices[0].name === "Living Room" && dv.devices[0].pin === true && dv.devices[0].paired === false && !("airplay" in dv.devices[0]));
    B._reset(); const ensured = []; B._useEnsure(() => { ensured.push(1); return { ok: false, need: "tvpipe-sdk" }; });
    const none = await B.start("pattern", { to: "browser" }, { importer: async () => { throw new Error("Cannot find package"); } });
    ok("!! NO SDK, Auto-Install off: the registry is asked, and the reason names both ways to install it; not a crash; /tv/status says not installed", !none.ok && ensured.length === 1 && /npm install @tvpipe\/sdk/.test(none.error) && /Auto-Install/.test(none.error) && B.status().installed === false && /npm install/.test(B.status().why));
    B._reset(); B._useEnsure(() => ({ ok: true, installing: true, auto: true }));
    const first = await B.start("pattern", { to: "browser" }, { importer: async () => { throw new Error("Cannot find package"); } });
    ok("!! NO SDK, Auto-Install on: FIRST USE STARTS THE INSTALL and says to try again in a minute", !first.ok && /being installed for first use/.test(first.error));
    B._reset(); B._useEnsure(() => ({ ok: false, lastErr: "exit 1 -- npm ERR! network" }));
    const broke = await B.start("pattern", { to: "browser" }, { importer: async () => { throw new Error("Cannot find package"); } });
    ok("!! a first-use install that FAILED says so, with npm's error", !broke.ok && /did not install: exit 1/.test(broke.error));
    const A = require("./autoInstall.js"), e = A.REGISTRY.find((x) => x.id === "tvpipe-sdk");
    ok("!! THE REGISTRY ENTRY: a small dep (eligible for auto-install), detected in THIS folder's node_modules, installed there with --prefix (not -g), through cmd /c on Windows", e && e.tier === "dep" && e.detect.kind === "file" && e.detect.path === path.join(HERE, "node_modules", "@tvpipe", "sdk", "package.json")
        && e.install.kind === "cmd" && e.install.unix.join(" ").startsWith(`npm install --prefix ${HERE}`) && e.install.win.slice(0, 5).join(" ") === `cmd /c npm install --prefix` && e.install.win[5] === HERE && e.install.unix.some((x) => /^@tvpipe\/sdk@/.test(x)) && e.est.downloadMB <= 100);
    B._useEnsure(null);
    await B.stop(); B._reset();
});

console.log("3. THE REAL TVPIPE");
await section(async () => {
    let real = null; try { real = await import(pathToFileURL(require.resolve("@tvpipe/sdk", { paths: [HERE] })).href); } catch { /* not installed */ }
    if (!real) { console.log(`  ----  @tvpipe/sdk is not installed here: the real run is skipped (${B.INSTALL_HINT})`); return; }
    B._reset(); B._useSdk(real);
    const r = await B.start("pattern", { to: "browser" });
    ok("!! tvpipe's test pattern starts on its own browser receiver through this bridge: H.264, a size, a player page on 127.0.0.1", r.ok && r.session.state === "playing" && r.session.info && r.session.info.video && r.session.info.video.codec === "h264" && r.session.info.video.width > 0 && /^http:\/\/127\.0\.0\.1:\d+\//.test(r.session.playerUrl || ""), r.ok ? JSON.stringify(r.session.info.video) : r.error);
    await new Promise((res) => setTimeout(res, 1000));
    const ids = await B.stop();
    ok("!! and stops when asked", ids.length === 1 && B.status().sessions[0].state === "stopped");
    B._reset();
});

console.log("4. THE ROUTES");
await section(() => {
    const srv = fs.readFileSync(path.join(HERE, "server.js"), "utf8"), i = srv.indexOf('startsWith("/tv/")'), block = srv.slice(i, i + 2200);
    ok("!! the bridge loads it and serves every /tv/ route, trusted callers only, before anything else in the block", /require\("\.\/tvpipeBridge\.js"\)/.test(srv) && i > 0 && block.indexOf("_isTrustedReq(req)") > 0 && block.indexOf("_isTrustedReq(req)") < block.indexOf("/tv/status")
        && ["/tv/status", "/tv/devices", "/tv/share", "/tv/play", "/tv/pattern", "/tv/stop", "/tv/pin"].every((r) => block.includes(`"${r}"`)));
    const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
    ok("!! @tvpipe/sdk is an OPTIONAL dependency of the bridge (the bridge starts without it)", !!(pkg.optionalDependencies && pkg.optionalDependencies["@tvpipe/sdk"]) && !(pkg.dependencies || {})["@tvpipe/sdk"]);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG:
// 16 mutants of ai-bridge/tvpipeBridge.js, each in a hard-linked copy of the tree, with the real SDK installed: ALL 16 RED, two after a fix (a name
// starting '-' let through, nine receivers, file: for media, rtsp for a page, a password in a URL, two-digit PINs, a TV given two sessions, the overlap
// compared with case -- GREEN at first, because the test's second name was already lower case, so it now asks in capitals --, latency unclamped, a later
// failure ignored, the error code dropped, the wrong PIN passed on, discovery passed on whole, no SDK thrown, stop-all stopping none, receiver events
// ignored). Also run by hand, not here: a real page shared to tvpipe's browser receiver through start("share") came out as 1080p30 H.264 with audio,
// the receiver connected (Playwright's Chromium, which as root needs --no-sandbox: a sandbox quirk, not a SweK one).
// FIRST-USE INSTALL (2026-11-21): 6 more mutants, ALL RED (the registry entry installed with -g, made a devtool so it never auto-installs, spawning npm.cmd on
// Windows; the bridge never asking the registry, not saying an install started, hiding npm's error). And run for real here: with @tvpipe/ moved out of
// node_modules, autoInstall.run("tvpipe-sdk") took detect from "missing" to "installed" (sdk + linux-x64 in ai-bridge/node_modules, package.json untouched).
