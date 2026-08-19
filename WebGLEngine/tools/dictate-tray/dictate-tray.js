#!/usr/bin/env node
// tools/dictate-tray/dictate-tray.js — v1975
// A tiny always-on dictation helper that gives you FluidVoice-style global-hotkey dictation, wired
// entirely through your local SweK bridge (nothing leaves your LAN):
//
//   press+hold the hotkey  ->  record mic (ffmpeg)  ->  release  ->
//   POST audio to  {bridge}/whisper/transcribe  (local whisper.cpp)  ->
//   optional  {bridge}/dictate/polish  (local Ollama cleanup)  ->
//   {bridge}/dictate/type  (types into whatever window has focus)
//
// It is a *client* of the bridge — it holds no models and does no STT itself, so it stays tiny and
// slots into SweK as just another peer service. Config via env or flags:
//   SWEK_BRIDGE   bridge base URL           (default http://127.0.0.1:8787)
//   SWEK_HOTKEY   push-to-talk key name     (default RIGHT ALT)   e.g. "F9", "RIGHT CONTROL"
//   SWEK_POLISH   "1" to run the Ollama polish pass (default "0")
//   SWEK_STYLE    polish style              (clean | email | notes | code-comment)
//   SWEK_MIC      ffmpeg input device       (auto-detected per OS if unset)
//   SWEK_VAD      "1" = HANDS-FREE: tap the hotkey once to start, then auto-stop after a silence gap
//                 (endpointing) instead of holding the key. Uses ffmpeg's silencedetect (no model needed);
//                 if you point the bridge at a faster-whisper server with its Silero VAD filter on, that
//                 does the finer speech/no-speech trimming server-side. (default "0" = hold-to-talk)
//   SWEK_SILENCE  seconds of trailing silence that ends a hands-free clip (default 1.2)
//   --once        record one clip immediately (no hotkey), transcribe+type, then exit (great for testing)
//
// Requires: ffmpeg on PATH (you already have it on the SweK boxes). The global hotkey uses
// node-global-key-listener (prebuilt binaries, no compile). The tray icon is optional (systray2);
// if it's missing the helper still runs headless and prints status to the console.

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const http = require("http");

const BRIDGE = (process.env.SWEK_BRIDGE || "http://127.0.0.1:8787").replace(/\/+$/, "");
const HOTKEY = (process.env.SWEK_HOTKEY || "RIGHT ALT").toUpperCase();
const DO_POLISH = process.env.SWEK_POLISH === "1";
const STYLE = process.env.SWEK_STYLE || "clean";
const VAD = process.env.SWEK_VAD === "1";                       // hands-free endpointing
const SILENCE_S = parseFloat(process.env.SWEK_SILENCE || "1.2"); // trailing silence that ends a clip
const ONCE = process.argv.includes("--once");
const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";

function log(...a) { console.log("[dictate]", ...a); }

// ---- ffmpeg mic capture -> a temp wav ----
function micArgs(outPath) {
    // 16 kHz mono wav is ideal for whisper. Device selection per OS; override with SWEK_MIC.
    const dev = process.env.SWEK_MIC;
    if (WIN)  return ["-f", "dshow", "-i", dev ? ("audio=" + dev) : "audio=default", "-ar", "16000", "-ac", "1", "-y", outPath];
    if (MAC)  return ["-f", "avfoundation", "-i", dev || ":default", "-ar", "16000", "-ac", "1", "-y", outPath];
    return ["-f", "alsa", "-i", dev || "default", "-ar", "16000", "-ac", "1", "-y", outPath];   // linux
}

let _rec = null, _recPath = null, _recording = false;
function startRec() {
    if (_recording) return;
    _recPath = path.join(os.tmpdir(), "swek-dictate-" + Date.now() + ".wav");
    const args = micArgs(_recPath);
    if (VAD) {
        // v1979 — hands-free endpointing: ffmpeg watches the input level and, after SILENCE_S seconds
        // below -35dB, we stop the clip. This is the cheap, model-free VAD; the finer Silero pass (if you
        // enabled it on a faster-whisper server) then trims the remaining edges server-side.
        args.splice(args.length - 1, 0, "-af", "silencedetect=noise=-35dB:d=" + SILENCE_S);
    }
    _rec = spawn("ffmpeg", args, { windowsHide: true });
    _rec.on("error", (e) => { log("ffmpeg error (is ffmpeg on PATH?):", e.message); _recording = false; });
    if (VAD && _rec.stderr) {
        // ffmpeg prints "silence_start" then "silence_end" on stderr; once we've heard speech and then a
        // trailing silence, end the clip automatically.
        let heardSpeech = false;
        _rec.stderr.on("data", (d) => {
            const s = String(d);
            if (s.includes("silence_end")) heardSpeech = true;   // a silence just ended = speech happened
            if (heardSpeech && s.includes("silence_start")) { log("(silence \u2014 auto-stopping)"); stopRec().then((w) => { if (w) runOnce(w); }); }
        });
    }
    _recording = true;
    setTray("rec");
    log(VAD ? ("recording (hands-free) \u2014 speak; auto-stops after " + SILENCE_S + "s silence")
           : ("recording\u2026 (release " + HOTKEY + " to transcribe)"));
}
function stopRec() {
    return new Promise((resolve) => {
        if (!_recording || !_rec) { resolve(null); return; }
        _recording = false; setTray("busy");
        _rec.once("close", () => { resolve(_recPath); });
        // ffmpeg stops cleanly on 'q' on stdin, else SIGINT
        try { _rec.stdin.write("q"); } catch { try { _rec.kill("SIGINT"); } catch {} }
        setTimeout(() => { try { _rec.kill("SIGINT"); } catch {} }, 400);
    });
}

// ---- bridge calls ----
// v1981 — honor the URL scheme: if SWEK_BRIDGE points at an https tunnel, use https + port 443, not
// plain http on :80. Pick the transport + default port from u.protocol.
const httpMod = require("http");
const httpsMod = require("https");
function _clientFor(u) { return u.protocol === "https:" ? httpsMod : httpMod; }
function _portFor(u) { return u.port || (u.protocol === "https:" ? 443 : 80); }
function post(pathname, body, isBinary) {
    return new Promise((resolve, reject) => {
        const u = new URL(BRIDGE + pathname);
        const data = isBinary ? body : Buffer.from(JSON.stringify(body || {}));
        const req = _clientFor(u).request({
            hostname: u.hostname, port: _portFor(u), path: u.pathname + u.search, method: "POST",
            headers: { "Content-Type": isBinary ? "application/octet-stream" : "application/json", "Content-Length": data.length },
        }, (res) => { let b = ""; res.on("data", (d) => b += d); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false, error: "bad json", raw: b }); } }); });
        req.on("error", reject); req.write(data); req.end();
    });
}

async function transcribe(wavPath) {
    const buf = fs.readFileSync(wavPath);
    const j = await post("/whisper/transcribe?fmt=wav", buf, true);
    return (j && (j.text || (j.ok && j.transcript))) || "";
}
async function polish(text) {
    try { const j = await post("/dictate/polish", { text, style: STYLE }); return (j && j.ok && j.text) || text; }
    catch { return text; }
}
async function typeOut(text) {
    return post("/dictate/type", { text, mode: "auto" });
}

async function runOnce(wavPath) {
    try {
        setTray("busy");
        let text = await transcribe(wavPath);
        try { fs.unlinkSync(wavPath); } catch {}
        if (!text || !text.trim()) { log("(nothing transcribed)"); setTray("idle"); return; }
        log("heard:", JSON.stringify(text.slice(0, 80)) + (text.length > 80 ? "\u2026" : ""));
        if (DO_POLISH) { text = await polish(text); log("polished."); }
        const r = await typeOut(text);
        if (r && r.ok) log("typed", r.chars, "chars (" + r.mode + ")"); else log("type failed:", (r && r.error) || "?");
    } catch (e) { log("error:", e.message); }
    finally { setTray("idle"); }
}

// ---- optional system tray (systray2). Falls back to headless if unavailable. ----
let _tray = null, _trayReady = false;
function setTray(state) { if (!_tray || !_trayReady) return; try { _tray.sendAction({ type: "update-item", item: { title: "SweK Dictate \u2014 " + state } }); } catch {} }
async function initTray() {
    let SysTray; try { SysTray = require("systray2").default || require("systray2"); } catch { log("(no tray module \u2014 running headless; hotkey still works)"); return; }
    try {
        _tray = new SysTray({ menu: {
            icon: WIN ? "" : "",   // systray2 wants a base64 icon per-OS; empty = default. Optional polish later.
            title: "SweK Dictate", tooltip: "Hold " + HOTKEY + " to dictate",
            items: [ { title: "SweK Dictate \u2014 idle", enabled: false }, { title: "Quit", enabled: true } ],
        }});
        _tray.onClick((a) => { if (a.item && /quit/i.test(a.item.title)) { try { _tray.kill(); } catch {} process.exit(0); } });
        await _tray.ready(); _trayReady = true; log("tray ready.");
    } catch (e) { log("(tray init failed, headless):", e.message); }
}

// ---- global hotkey (push-to-talk) ----
function initHotkey() {
    let GKL; try { ({ GlobalKeyboardListener: GKL } = require("node-global-key-listener")); }
    catch (e) { log("hotkey module missing \u2014 run `npm install` in tools/dictate-tray. (You can still use --once.)"); return; }
    const v = new GKL();
    let down = false;
    v.addListener(async function (e) {
        const name = (e.name || "").toUpperCase();
        if (name !== HOTKEY) return;
        if (VAD) {
            // hands-free: a single key press toggles recording on; silence auto-stops it (see startRec).
            if (e.state === "DOWN") { if (!_recording) startRec(); else { const wav = await stopRec(); if (wav) runOnce(wav); } }
            return;
        }
        // hold-to-talk
        if (e.state === "DOWN" && !down) { down = true; startRec(); }
        else if (e.state === "UP" && down) { down = false; const wav = await stopRec(); if (wav) runOnce(wav); }
    });
    log("hotkey armed: " + (VAD ? ("tap " + HOTKEY + " to dictate hands-free (auto-stops on silence)") : ("hold " + HOTKEY + " to dictate")) + ". Bridge: " + BRIDGE + (DO_POLISH ? " (polish: on, " + STYLE + ")" : ""));
}

// ---- boot ----
(async () => {
    // sanity: is the bridge reachable + does it have the type-out capability?
    try {
        const s = await new Promise((res) => { const bu = new URL(BRIDGE + "/dictate/status"); _clientFor(bu).get({ hostname: bu.hostname, port: _portFor(bu), path: bu.pathname }, (r) => { let b = ""; r.on("data", d => b += d); r.on("end", () => { try { res(JSON.parse(b)); } catch { res(null); } }); }).on("error", () => res(null)); });
        if (!s) log("warning: can't reach the SweK bridge at " + BRIDGE + " \u2014 is it running? (start the engine / server.html box)");
        else if (!s.available) log("note: type-into-app not ready on this box: " + (s.note || "unsupported"));
        else log("bridge ok \u2014 type-out via " + s.tool + (s.note ? (" (" + s.note + ")") : ""));
    } catch {}

    if (ONCE) {
        log("--once: recording ~4s, speak now\u2026");
        startRec(); setTimeout(async () => { const wav = await stopRec(); if (wav) await runOnce(wav); process.exit(0); }, 4000);
        return;
    }
    await initTray();
    initHotkey();
    log("ready. Ctrl+C to quit.");
})();
