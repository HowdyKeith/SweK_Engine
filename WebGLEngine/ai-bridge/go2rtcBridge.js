// ai-bridge/go2rtcBridge.js — install / configure / detect / autostart go2rtc,
// the camera streaming server the engine's camera wall + pip-boy camera mode use
// (HTTP API at :1984, MJPEG/RTSP/WebRTC). go2rtc is a single Go binary from the
// AlexxIT/go2rtc GitHub releases. Windows/mac assets are .zip, linux are direct
// binaries — install() matches the right asset by platform/arch keywords so it
// adapts if upstream renaming changes. On non-Windows the same paths work.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

// v1508 — mgmt state (autostart flag, webcam-auto, stream-name mirror) lives in the user's persistent config
// dir, NOT inside the versioned engine folder (the in-folder copy was stripped + replaced on each update, so
// toggles silently reset). v1634 — the go2rtc BINARY + its yaml now live here too, so a version update no
// longer wipes + re-downloads go2rtc. ~/.voxelbridge survives every update.
const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const DIR = path.join(CFG_DIR, "go2rtc");                  // persistent home: binary + go2rtc.yaml live here
const VENDOR_LEGACY = path.join(__dirname, "vendor", "go2rtc");   // pre-v1634 in-tree spot (migrated out; still read as a fallback)
const CFG_MGR = path.join(CFG_DIR, "go2rtc-mgr.json");
const YAML = path.join(DIR, "go2rtc.yaml");                // go2rtc's own config (now persistent)
const PORT = 1984;
const RTSP_PORT = 8554;     // go2rtc default RTSP listen
const WEBRTC_PORT = 8555;   // matches writeConfig webrtc listen
const BIN = process.platform === "win32" ? "go2rtc.exe" : "go2rtc";

let _child = null;

function load() { try { return JSON.parse(fs.readFileSync(CFG_MGR, "utf8")); } catch { return {}; } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG_MGR, JSON.stringify(o, null, 2)); } catch {} }

function onPath() {
    try { const r = spawnSync(process.platform === "win32" ? "where" : "which", ["go2rtc"], { windowsHide: true }); const out = String((r && r.stdout) || "").trim(); return (r && r.status === 0 && out) ? out.split(/\r?\n/)[0] : ""; } catch { return ""; }
}
// v1634 — one-time lift of an existing in-tree binary (from a pre-v1634 install) to the persistent home, so a
// user who already downloaded go2rtc doesn't have to re-download after updating. The legacy spot stays a read
// fallback in case the copy can't happen. Cheap + idempotent; runs the first time the bin path is needed.
let _migrated = false;
function _migrateLegacy() {
    if (_migrated) return; _migrated = true;
    try {
        const sz = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
        const legacyBin = path.join(VENDOR_LEGACY, BIN), persistBin = path.join(DIR, BIN);
        if (sz(legacyBin) > 0 && sz(persistBin) === 0) {
            fs.mkdirSync(DIR, { recursive: true });
            fs.copyFileSync(legacyBin, persistBin);
            if (process.platform !== "win32") { try { fs.chmodSync(persistBin, 0o755); } catch {} }
            try { const ly = path.join(VENDOR_LEGACY, "go2rtc.yaml"); if (fs.existsSync(ly) && !fs.existsSync(YAML)) fs.copyFileSync(ly, YAML); } catch {}
            try { console.log("[go2rtc] moved the existing binary to ~/.voxelbridge/go2rtc so it survives engine updates"); } catch {}
        }
    } catch {}
}
function vendoredBin() { _migrateLegacy(); for (const d of [DIR, VENDOR_LEGACY]) { const p = path.join(d, BIN); try { if (fs.statSync(p).size > 0) return p; } catch {} } return ""; }
function binPath() { return vendoredBin() || onPath() || ""; }

function detectRunning(timeoutMs) {
    return new Promise((resolve) => {
        const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api", timeout: timeoutMs || 1500 }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
        req.on("error", () => resolve(false));
        req.on("timeout", () => { try { req.destroy(); } catch {} resolve(false); });
    });
}

async function status() {
    const running = await detectRunning();
    const c = load();
    return { ok: true, platform: process.platform, arch: process.arch, onPath: !!onPath(), vendored: !!vendoredBin(), binPath: binPath(), running, port: PORT, hasConfig: fs.existsSync(YAML), autostart: c.autostart === true, managedPid: _child ? _child.pid : null, restarts: _restarts, lastStderr: _lastStderr ? _lastStderr.split(/\r?\n/).filter(Boolean).slice(-3).join(" | ") : "" };
}

function pickAsset(assets) {
    const plat = process.platform, arch = process.arch;
    const want = [];
    if (plat === "win32") { want.push(arch === "arm64" ? /win.*arm64/i : /win64/i); want.push(/win64/i); }
    else if (plat === "darwin") { want.push(arch === "arm64" ? /mac.*arm64/i : /mac.*amd64/i); want.push(/mac/i); }
    else { const a = arch === "arm64" ? /linux.*arm64/i : (arch === "arm" ? /linux.*arm(?!64)/i : (arch === "ia32" ? /linux.*i386/i : /linux.*amd64/i)); want.push(a); want.push(/linux.*amd64/i); }
    for (const re of want) { const hit = assets.find(x => re.test(x.name)); if (hit) return hit; }
    return null;
}

async function install() {
    const existing = binPath();
    try {
        const rel = await fetch("https://api.github.com/repos/AlexxIT/go2rtc/releases/latest", { headers: { "User-Agent": "swek-engine", "Accept": "application/vnd.github+json" } }).then(r => r.json());
        if (!rel || !Array.isArray(rel.assets)) return { ok: false, error: "couldn't read go2rtc releases" + (rel && rel.message ? (": " + rel.message) : "") };
        const asset = pickAsset(rel.assets);
        if (!asset) return { ok: false, error: "no go2rtc asset for " + process.platform + "/" + process.arch };
        fs.mkdirSync(DIR, { recursive: true });
        const dl = await fetch(asset.browser_download_url, { headers: { "User-Agent": "swek-engine" } });
        if (!dl.ok) return { ok: false, error: "download HTTP " + dl.status };
        const buf = Buffer.from(await dl.arrayBuffer());
        if (/\.zip$/i.test(asset.name)) {
            const zp = path.join(DIR, asset.name); fs.writeFileSync(zp, buf);
            let ex;
            if (process.platform === "win32") ex = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", "Expand-Archive -Path '" + zp + "' -DestinationPath '" + DIR + "' -Force"], { windowsHide: true });
            else ex = spawnSync("unzip", ["-o", zp, "-d", DIR]);
            try { fs.unlinkSync(zp); } catch {}
            if (ex && ex.status !== 0) return { ok: false, error: "extract failed: " + String((ex.stderr || "")).slice(0, 200) };
            const found = fs.readdirSync(DIR).find(f => /^go2rtc(\.exe)?$/i.test(f));
            if (found && found !== BIN) { try { fs.renameSync(path.join(DIR, found), path.join(DIR, BIN)); } catch {} }
        } else {
            fs.writeFileSync(path.join(DIR, BIN), buf);
        }
        if (process.platform !== "win32") { try { fs.chmodSync(path.join(DIR, BIN), 0o755); } catch {} }
        if (!fs.existsSync(YAML)) writeConfig({});
        return { ok: !!vendoredBin(), binPath: binPath(), tag: rel.tag_name, replaced: !!existing };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

function writeConfig(cfg) {
    cfg = cfg || {};
    const streams = cfg.streams || (load().streams) || {};
    fs.mkdirSync(DIR, { recursive: true });
    let y = "# go2rtc.yaml \u2014 managed by SweK Engine\n";
    y += "api:\n  listen: \":" + PORT + "\"\n";
    y += "webrtc:\n  listen: \":8555\"\n";
    // v1960 — pin ffmpeg to an ABSOLUTE path so go2rtc's `ffmpeg:` transcode sources never depend on the
    // child process's PATH. On Stellar Atlas the evermeet.cx static binary lands in ~/.voxelbridge/bin,
    // which a GUI/nohup-launched bridge often drops from PATH -> "exec ffmpeg: not found" even though it's
    // installed. Telling go2rtc the exact binary kills that whole class of error. Falls back silently to
    // PATH resolution (the old behavior) if we can't resolve an absolute path.
    const ffBin = resolveFfmpegBin();
    if (ffBin) y += "ffmpeg:\n  bin: " + JSON.stringify(ffBin) + "\n";
    y += "streams:\n";
    const keys = Object.keys(streams);
    if (keys.length) for (const k of keys) y += "  " + k + ": " + streams[k] + "\n";
    else y += "  # add cameras here, e.g.:\n  # frontdoor: rtsp://user:pass@192.168.10.50:554/stream\n";
    fs.writeFileSync(YAML, y);
    return { ok: true, configPath: YAML, streams: keys, ffmpegBin: ffBin || "(PATH)" };
}
// Resolve an absolute ffmpeg path: prefer the engine's static binary, then common install locations,
// then `which/where`. Returns null if only a bare-PATH ffmpeg is available (go2rtc falls back to PATH).
function resolveFfmpegBin() {
    try { const st = require("./ffmpegStatic.js"); const p = st.binPath && st.binPath(); if (p && fs.existsSync(p)) return p; } catch {}
    const cand = process.platform === "win32"
        ? [path.join(require("os").homedir(), ".voxelbridge", "bin", "ffmpeg.exe"), "C\\:/ffmpeg/bin/ffmpeg.exe"]
        : [path.join(require("os").homedir(), ".voxelbridge", "bin", "ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
    for (const p of cand) { try { if (p && fs.existsSync(p)) return p; } catch {} }
    try {
        const which = process.platform === "win32" ? "where" : "which";
        const out = require("child_process").execFileSync(which, ["ffmpeg"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
        if (out && fs.existsSync(out)) return out;
    } catch {}
    return null;
}
// add/update a camera stream (persisted in mgr json, then regenerate the yaml)
function addStream(name, url) {
    name = String(name || "").trim().replace(/[^A-Za-z0-9_-]/g, "_"); url = String(url || "").trim();
    if (!name || !url) return { ok: false, error: "name and url are required" };
    try {
        const c = load(); c.streams = c.streams || {}; c.streams[name] = url; save(c);
        writeConfig({ streams: c.streams });
        return { ok: true, streams: Object.keys(c.streams), added: name };
    } catch (e) {
        return { ok: false, error: "couldn't write go2rtc config: " + String((e && e.message) || e) };
    }
}

function readConfig() { try { return { ok: true, configPath: YAML, yaml: fs.readFileSync(YAML, "utf8") }; } catch { return { ok: false, error: "no config", configPath: YAML }; } }

// v1960 — triage helper: TCP-connect to a camera's host:port (parsed from its rtsp:// URL) so the page can
// tell "dial tcp timeout" (network/IP/port wrong -> can't even connect) apart from "wrong response on
// DESCRIBE" (connects fine -> it's auth or the stream path). Pure reachability; no RTSP handshake.
function probeCamera(urlOrHost, cb) {
    let host = String(urlOrHost || "").trim(), port = 554;
    try {
        if (/^\w+:\/\//.test(host)) { const u = new URL(host); host = u.hostname; port = parseInt(u.port, 10) || 554; }
        else if (host.includes(":")) { const [h, p] = host.split(":"); host = h; port = parseInt(p, 10) || 554; }
    } catch {}
    if (!host) return cb({ ok: false, error: "no host to probe" });
    const net = require("net");
    const t0 = Date.now();
    const sock = new net.Socket();
    let done = false;
    const fin = (r) => { if (done) return; done = true; try { sock.destroy(); } catch {} cb(r); };
    sock.setTimeout(3500);
    sock.once("connect", () => fin({ ok: true, reachable: true, host, port, ms: Date.now() - t0, verdict: "TCP open \u2014 the camera is reachable. A DESCRIBE error now means auth or stream-path, not network." }));
    sock.once("timeout", () => fin({ ok: true, reachable: false, host, port, ms: Date.now() - t0, verdict: "TCP timeout \u2014 nothing answered at " + host + ":" + port + ". Camera offline, IP changed (DHCP), wrong port, or AP-isolated. This is network, not go2rtc." }));
    sock.once("error", (e) => fin({ ok: true, reachable: false, host, port, ms: Date.now() - t0, error: String(e && e.message || e), verdict: "Can't connect to " + host + ":" + port + " (" + String(e && e.code || e && e.message || e) + "). Network/IP/port issue, not go2rtc." }));
    try { sock.connect(port, host); } catch (e) { fin({ ok: false, error: String(e && e.message || e) }); }
}

// v1443 — local capture device as a go2rtc stream. go2rtc's ffmpeg:device source
// maps to avfoundation (macOS), dshow (Windows), or v4l2 (Linux) automatically, so
// the SAME call exposes a Mac FaceTime cam, a PC webcam, or a Linux /dev/video0.
// Requires ffmpeg on PATH for device capture (mac: brew install ffmpeg).
function localWebcamSource(device) {
    const d = (device == null || device === "") ? "0" : String(device);
    return "ffmpeg:device?video=" + encodeURIComponent(d) + "#video=h264";
}
function addLocalWebcam(name, device) { return addStream(name || "webcam", localWebcamSource(device)); }

// v1333 — list live streams for the multi-cam grid. Prefers go2rtc's own /api/streams
// (picks up HA-pushed + runtime streams); falls back to the names mirrored in go2rtc-mgr.json.
function streamsList(cb) {
    // v1530 -- one-shot guard. The success path (res 'end') answers via cb, then
    // go2rtc closes the keep-alive socket and Node emits a LATE 'error' on the
    // ClientRequest -> req.on('error', fallback) fired done() a SECOND time ->
    // sendJson tried res.writeHead() after headers were already sent ->
    // ERR_HTTP_HEADERS_SENT crash-loop in the boot log. Both done() and
    // fallback() now no-op once a response has gone out.
    let sent = false;
    const done = (names, live) => { if (sent) return; sent = true; cb({ ok: true, port: PORT, live, streams: names }); };
    const fallback = () => { if (sent) return; const c = load(); done(Object.keys(c.streams || {}), false); };
    let body = "";
    let req;
    try { req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/streams", timeout: 1500 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return fallback(); }
        res.on("data", d => body += d); res.on("end", () => { try { const j = JSON.parse(body); done(Object.keys(j || {}), true); } catch { fallback(); } });
    }); } catch { return fallback(); }
    req.on("error", fallback); req.on("timeout", () => { try { req.destroy(); } catch {} fallback(); });
}

function start() {
    if (_child && !_child.killed) return { ok: true, already: true, pid: _child.pid };
    const bin = binPath();
    if (!bin) return { ok: false, error: "go2rtc not installed \u2014 install it first" };
    // v1960 — always regenerate the yaml on start (was: only if missing), so the absolute ffmpeg `bin:`
    // pin lands in existing installs too. Uses the persisted streams, so this is non-destructive.
    try { writeConfig({ streams: (load().streams) || {} }); } catch { if (!fs.existsSync(YAML)) writeConfig({}); }
    try {
        // v1902 — augment PATH for the go2rtc child so its `ffmpeg:` transcode sources resolve. A bridge
        // launched from the macOS GUI / osascript / nohup inherits a minimal PATH that usually omits the
        // Homebrew bins, so go2rtc would fail with `exec "ffmpeg": not found` even with ffmpeg installed.
        const env = Object.assign({}, process.env);
        if (process.platform !== "win32") {
            const extra = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/opt/local/bin", require("path").join(require("os").homedir(), ".voxelbridge", "bin")];
            const cur = (env.PATH || "").split(":").filter(Boolean);
            for (const p of extra) if (!cur.includes(p)) cur.push(p);
            env.PATH = cur.join(":");
        }
        // v1989 — was stdio:"ignore" + an exit handler that only nulled _child: a go2rtc crash (bad
        // camera source URL, port already bound, ffmpeg exec failure) was INVISIBLE and PERMANENT —
        // the camera wall just went dark until someone manually restarted. Now: stderr tail is kept
        // for status/diagnosis, exits are logged with code + last stderr, and an unexpected exit
        // auto-restarts with backoff (max 5 tries; counter resets after 10 min of stable uptime).
        _lastStderr = "";
        _child = spawn(bin, ["-config", YAML], { cwd: DIR, windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env });
        try { _child.stderr.on("data", (d) => { _lastStderr = (_lastStderr + d.toString()).slice(-2000); }); } catch {}
        const startedAt = Date.now();
        _stopRequested = false;
        _child.on("exit", (code, sig) => {
            _child = null;
            const upMs = Date.now() - startedAt;
            if (_stopRequested) return;   // deliberate stop() — no restart, no scary log
            try { console.warn("[go2rtc] exited " + (sig ? ("sig " + sig) : ("code " + code)) + " after " + Math.round(upMs / 1000) + "s" + (_lastStderr ? (" — stderr tail: " + _lastStderr.split(/\r?\n/).filter(Boolean).slice(-3).join(" | ")) : "")); } catch {}
            if (upMs < 3000) { try { console.warn("[go2rtc] exited almost immediately — likely port " + PORT + "/" + RTSP_PORT + " already in use or a bad yaml; NOT auto-restarting"); } catch {} return; }
            if (upMs > 10 * 60 * 1000) _restarts = 0;   // stable run resets the backoff budget
            if (_restarts >= 5) { try { console.warn("[go2rtc] crash-restart budget exhausted (5) — leaving it down"); } catch {} return; }
            const delay = Math.min(60000, 2000 * Math.pow(2, _restarts++));
            try { console.log("[go2rtc] auto-restarting in " + Math.round(delay / 1000) + "s (attempt " + _restarts + "/5)"); } catch {}
            setTimeout(() => { try { if (!_child) start(); } catch {} }, delay);
        });
        return { ok: true, pid: _child.pid, binPath: bin };
    } catch (e) { _child = null; return { ok: false, error: String((e && e.message) || e) }; }
}
let _lastStderr = "", _restarts = 0, _stopRequested = false;
function stop() { _stopRequested = true; if (_child) { try { _child.kill(); } catch {} _child = null; return { ok: true }; } return { ok: true, note: "not started by the engine (kill it where it runs)" }; }

function setAutostart(on) { const c = load(); c.autostart = !!on; save(c); return { ok: true, autostart: c.autostart }; }
// v1496 — auto-expose this machine's webcam as a go2rtc stream on engine startup.
function setWebcamAutostart(on, device) { const c = load(); c.webcamAuto = !!on; if (device !== undefined) c.webcamDevice = device || ""; save(c); return { ok: true, webcamAuto: c.webcamAuto, webcamDevice: c.webcamDevice || "" }; }
function webcamAutostart() { const c = load(); return { ok: true, webcamAuto: c.webcamAuto === true, webcamDevice: c.webcamDevice || "" }; }
async function startWebcamIfAuto() { const c = load(); if (c.webcamAuto !== true) return { ok: true, skipped: true }; if (!(await detectRunning())) { try { await start(); } catch {} } try { return addLocalWebcam("webcam", c.webcamDevice || undefined); } catch (e) { return { ok: false, error: String(e && (e.message || e)) }; } }
async function startIfAuto() { const c = load(); if (c.autostart !== true) return { ok: true, skipped: true }; if (await detectRunning()) return { ok: true, alreadyRunning: true }; return start(); }

module.exports = { status, install, writeConfig, readConfig, addStream, streamsList, start, stop, setAutostart, startIfAuto, setWebcamAutostart, webcamAutostart, startWebcamIfAuto, detectRunning, binPath, addLocalWebcam, localWebcamSource, probeCamera, resolveFfmpegBin, apiPort: PORT, RTSP_PORT, WEBRTC_PORT };
