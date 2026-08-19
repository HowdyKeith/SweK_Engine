"use strict";
// ai-bridge/rustdeskBridge.js — self-hosted RustDesk integration for SweK. RustDesk is an open-source remote-desktop
// app (TeamViewer alternative): its self-hosted server is hbbs (ID/rendezvous/signaling) + hbbr (relay), the SAME
// shape as SweK's own rendezvous. This bridge doesn't run the server; it stores YOUR connection details (your hbbs/
// relay host + the server's public key) and your saved machine IDs, and hands the UI two ways to connect:
//   1. a rustdesk://<id>?server=<hbbs>&key=<pubkey> URI  -> launches the VIEWER's installed client (best for buttons)
//   2. POST /rustdesk/connect -> spawns `rustdesk --connect <id>` ON THIS HOST (control from the engine box)
// RustDesk has no CLI/URI password passing, so the connect password is entered in the client GUI (by design).
// Config lives in ~/.voxelbridge/rustdesk.json (0600), outside the engine tree, so it never ships in a copy.
//
// v1659.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CFG = process.env.RUSTDESK_CFG || path.join(os.homedir(), ".voxelbridge", "rustdesk.json");
const DEFAULTS = { idServer: "", relayServer: "", apiServer: "", key: "", machines: [] };   // machines: [{ name, id, note }]

function loadCfg() { try { if (fs.existsSync(CFG)) return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CFG, "utf8"))); } catch {} return { ...DEFAULTS }; }
function saveCfg(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); } catch {} }

// PURE: build a rustdesk:// connect URI for a machine id, wiring in the configured self-hosted server + public key.
function buildUri(id, cfg) {
    id = String(id || "").trim(); if (!id) return "";
    const q = [];
    if (cfg && cfg.idServer) q.push("server=" + encodeURIComponent(cfg.idServer));
    if (cfg && cfg.key) q.push("key=" + encodeURIComponent(cfg.key));
    return "rustdesk://" + encodeURIComponent(id) + (q.length ? "?" + q.join("&") : "");
}

function cleanMachine(m) { return { name: String(m.name || m.id).slice(0, 64), id: String(m.id).slice(0, 64), note: String(m.note || "").slice(0, 200) }; }

function getConfig() { const c = loadCfg(); return { ok: true, ...c, configured: !!(c.idServer || (c.machines && c.machines.length)) }; }
function setConfig(d) {
    const c = loadCfg();
    for (const k of ["idServer", "relayServer", "apiServer", "key"]) if (typeof d[k] === "string") c[k] = d[k].trim();
    if (Array.isArray(d.machines)) c.machines = d.machines.filter((m) => m && m.id).map(cleanMachine).slice(0, 64);
    saveCfg(c); return getConfig();
}
function addMachine(m) { const c = loadCfg(); if (m && m.id) { c.machines = (c.machines || []).filter((x) => x.id !== String(m.id)); c.machines.push(cleanMachine(m)); saveCfg(c); } return getConfig(); }
function removeMachine(id) { const c = loadCfg(); c.machines = (c.machines || []).filter((x) => x.id !== String(id)); saveCfg(c); return getConfig(); }
function uriFor(id) { return { ok: true, id: String(id), uri: buildUri(id, loadCfg()) }; }

// Best-effort locate of the RustDesk client binary on this host. Returns null when truly absent (so "installed"
// detection + auto-install are correct on every OS, not just Windows).
function rustdeskBin() {
    const exists = (c) => { try { return fs.existsSync(c) ? c : null; } catch { return null; } };
    if (process.platform === "win32") return exists("C:/Program Files/RustDesk/RustDesk.exe") || exists("C:/Program Files (x86)/RustDesk/RustDesk.exe");
    if (process.platform === "darwin") { const m = exists("/Applications/RustDesk.app/Contents/MacOS/RustDesk"); if (m) return m; }
    for (const c of ["/usr/bin/rustdesk", "/usr/local/bin/rustdesk", "/snap/bin/rustdesk"]) { const f = exists(c); if (f) return f; }
    try { for (const d of (process.env.PATH || "").split(":")) { const p = path.join(d, "rustdesk"); if (exists(p)) return p; } } catch {}
    return null;
}
function status() { const bin = rustdeskBin(); return { ok: true, installed: !!bin, bin: bin || null, platform: process.platform, configured: getConfig().configured }; }

// This box's own RustDesk ID (so peers can offer a one-click "Remote In" without anyone typing the ID). Reads it
// from the client via `--get-id`, cached 5 min. Resolves null if RustDesk isn't installed here.
let _idCache = null, _idAt = 0;
function selfId() {
    return new Promise((resolve) => {
        if (_idCache && Date.now() - _idAt < 300000) return resolve(_idCache);
        const bin = rustdeskBin(); if (!bin) return resolve(null);
        try {
            spawn && require("child_process").execFile(bin, ["--get-id"], { timeout: 5000, windowsHide: true }, (err, stdout) => {
                if (err) return resolve(null);
                const m = String(stdout || "").match(/\d{6,}/);   // the ID is a run of digits
                const id = m ? m[0] : "";
                if (id) { _idCache = id; _idAt = Date.now(); }
                resolve(id || null);
            });
        } catch { resolve(null); }
    });
}

// Spawn the client ON THIS HOST to connect to id. (The viewer's own machine should use the rustdesk:// URI instead.)
function connectHost(id) {
    return new Promise((resolve) => {
        id = String(id || "").trim(); if (!id) return resolve({ ok: false, error: "id required" });
        const bin = rustdeskBin(); if (!bin) return resolve({ ok: false, error: "RustDesk client not found on host" });
        try { const p = spawn(bin, ["--connect", id], { detached: true, stdio: "ignore" }); p.unref(); resolve({ ok: true, launched: true, bin, id }); }
        catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
    });
}

// Set a permanent (unattended) password on this box's client via `--password`. Combined with "enable unattended
// access" in the RustDesk client's security settings (a one-time per-box toggle), this lets peers connect without a
// prompt. Min 6 chars (RustDesk rejects shorter).
function setPassword(pw) {
    return new Promise((resolve) => {
        pw = String(pw || ""); if (pw.length < 6) return resolve({ ok: false, error: "password too short (min 6)" });
        const bin = rustdeskBin(); if (!bin) return resolve({ ok: false, error: "RustDesk not installed on host" });
        try { require("child_process").execFile(bin, ["--password", pw], { timeout: 8000, windowsHide: true }, (err) => { if (err) return resolve({ ok: false, error: String((err && err.message) || err) }); resolve({ ok: true, set: true }); }); }
        catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
    });
}

// Auto-install the RustDesk client: Windows via winget, macOS via the official .dmg (queried live from GitHub so it
// tracks the latest release + the right CPU arch). Linux stays manual. Non-blocking; poll installStatus().
let _install = { running: false, log: "", code: null, startedAt: 0 };
function _capInstall(d) { _install.log = (_install.log + d).slice(-8000); }

// Query GitHub for the latest RustDesk release and pick the macOS .dmg matching THIS Mac's arch.
function _ghLatest(cb, url) {
    const u = url || "https://api.github.com/repos/rustdesk/rustdesk/releases/latest";
    try {
        require("https").get(u, { headers: { "User-Agent": "swek-engine", "Accept": "application/vnd.github+json" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return _ghLatest(cb, res.headers.location); }
            let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { cb(null, JSON.parse(b)); } catch (e) { cb(e); } });
        }).on("error", cb);
    } catch (e) { cb(e); }
}
function _latestMacDmg(cb) {
    _ghLatest((err, rel) => {
        if (err) return cb(err);
        if (!rel || !Array.isArray(rel.assets)) return cb(new Error("no release assets"));
        const arch = process.arch === "arm64" ? "aarch64" : "x86_64";   // Apple Silicon vs Intel
        const a = rel.assets.find((x) => x.name && x.name.endsWith("-" + arch + ".dmg"));
        if (!a) return cb(new Error("no .dmg asset for " + arch + " in " + rel.tag_name));
        cb(null, { url: a.browser_download_url, name: a.name, tag: rel.tag_name, arch });
    });
}
function _installMac() {
    _install = { running: true, log: "querying latest RustDesk release\u2026\n", code: null, startedAt: Date.now() };
    _latestMacDmg((err, dmg) => {
        if (err || !dmg) { _install.running = false; _install.code = -1; _capInstall("error: " + ((err && err.message) || "no dmg") + "\n"); return; }
        _capInstall("downloading " + dmg.name + " (" + dmg.tag + ", " + dmg.arch + ")\n");
        // download -> mount -> copy into /Applications -> unmount -> clear the Gatekeeper quarantine flag.
        const script = [
            "set -e",
            'DMG="/tmp/rustdesk_swek.dmg"; MNT="/tmp/rustdesk_swek_mnt"',
            'curl -fL --retry 2 "' + dmg.url + '" -o "$DMG"',
            'hdiutil detach "$MNT" 2>/dev/null || true',
            'hdiutil attach "$DMG" -nobrowse -noverify -mountpoint "$MNT"',
            "rm -rf /Applications/RustDesk.app",
            'cp -R "$MNT/RustDesk.app" /Applications/',
            'hdiutil detach "$MNT" || true',
            'rm -f "$DMG"',
            "xattr -rd com.apple.quarantine /Applications/RustDesk.app 2>/dev/null || true",
            'echo "RustDesk ' + dmg.tag + ' installed to /Applications/RustDesk.app"',
            'echo "ONE-TIME on this Mac: open RustDesk, grant Accessibility + Screen Recording in System Settings > Privacy, toggle Service ON, then set a permanent password for unattended access (no per-session accept after that)."',
        ].join("\n");
        try {
            const p = spawn("/bin/bash", ["-c", script]);
            if (p.stdout) p.stdout.on("data", _capInstall); if (p.stderr) p.stderr.on("data", _capInstall);
            p.on("error", (e) => { _install.running = false; _install.code = -1; _capInstall("\nerror: " + ((e && e.message) || e)); });
            p.on("close", (c) => { _install.running = false; _install.code = c; _idCache = null; });   // bust the id cache once installed
        } catch (e) { _install.running = false; _install.code = -1; _capInstall("\nspawn error: " + ((e && e.message) || e)); }
    });
    return { ok: true, started: true, platform: "darwin" };
}
// Follow redirects + stream a download to a local file (GitHub release downloads redirect to a CDN).
function _download(url, dest, cb, depth) {
    if ((depth || 0) > 6) return cb(new Error("too many redirects"));
    try {
        require("https").get(url, { headers: { "User-Agent": "swek-engine" } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return _download(res.headers.location, dest, cb, (depth || 0) + 1); }
            if (res.statusCode !== 200) { res.resume(); return cb(new Error("HTTP " + res.statusCode)); }
            const f = fs.createWriteStream(dest);
            res.pipe(f);
            f.on("finish", () => f.close(() => cb(null, dest)));
            f.on("error", (e) => cb(e));
        }).on("error", cb);
    } catch (e) { cb(e); }
}
// Windows install via GitHub-direct .exe + RustDesk's own --silent-install (more reliable than winget, which throws
// source/CDN errors like 0x8A150014). Elevated through a UAC prompt so the installer can write to Program Files.
function _installWin() {
    _install = { running: true, log: "querying latest RustDesk release\u2026\n", code: null, startedAt: Date.now() };
    _ghLatest((err, rel) => {
        if (err || !rel || !Array.isArray(rel.assets)) { _install.running = false; _install.code = -1; _capInstall("error: " + ((err && err.message) || "no release") + "\n"); return; }
        const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
        const want = "rustdesk-" + rel.tag_name + "-" + arch + ".exe";
        const a = rel.assets.find((x) => x.name === want) || rel.assets.find((x) => x.name && x.name.endsWith("-" + arch + ".exe") && !/sciter/i.test(x.name));
        if (!a) { _install.running = false; _install.code = -1; _capInstall("error: no .exe asset for " + arch + " in " + rel.tag_name + "\n"); return; }
        const dest = path.join(os.tmpdir(), "rustdesk_swek_setup.exe");
        _capInstall("downloading " + a.name + " (" + rel.tag_name + ")\n");
        _download(a.browser_download_url, dest, (e) => {
            if (e) { _install.running = false; _install.code = -1; _capInstall("download error: " + ((e && e.message) || e) + "\n"); return; }
            _capInstall("running silent install \u2014 approve the UAC prompt if it appears\u2026\n");
            const ps = "$p=Start-Process -FilePath '" + dest.replace(/'/g, "''") + "' -ArgumentList '--silent-install' -Verb RunAs -Wait -PassThru; exit $p.ExitCode";
            try {
                const p = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true });
                if (p.stdout) p.stdout.on("data", _capInstall); if (p.stderr) p.stderr.on("data", _capInstall);
                p.on("error", (er) => { _install.running = false; _install.code = -1; _capInstall("\nerror: " + ((er && er.message) || er)); });
                p.on("close", (c) => { _install.running = false; _install.code = c; _idCache = null; _capInstall("\ninstall finished (exit " + c + "); if it didn't take, run the downloaded setup manually as admin.\n"); });
            } catch (er) { _install.running = false; _install.code = -1; _capInstall("\nspawn error: " + ((er && er.message) || er)); }
        });
    });
    return { ok: true, started: true, platform: "win32" };
}
function install() {
    if (_install.running) return { ok: false, error: "install already running" };
    if (rustdeskBin()) return { ok: true, alreadyInstalled: true };
    if (process.platform === "win32") return _installWin();
    if (process.platform === "darwin") return _installMac();
    return { ok: false, error: "auto-install supported on Windows + macOS; install RustDesk manually on " + process.platform };
}
function installStatus() { return { ok: true, installed: !!rustdeskBin(), running: _install.running, code: _install.code, log: _install.log.slice(-2000) }; }

// v1933 — is a RustDesk remote-control session ACTIVE on this machine right now?
// Signal: an ESTABLISHED TCP connection on a RustDesk port. RustDesk uses 21115-21119 for the
// ID/relay server side and, for a direct P2P session, port 21118 (and the relay 21117 when
// hole-punching fails). We also match the rustdesk process holding an ESTABLISHED foreign
// connection. Best-effort + cross-platform via netstat; returns { ok, active, detail }.
// Cached ~5s so an update poll doesn't spawn netstat constantly.
let _sessCache = { at: 0, active: false, detail: "" };
function sessionActive() {
    const now = Date.now();
    if (now - _sessCache.at < 5000) return { ok: true, active: _sessCache.active, detail: _sessCache.detail, cached: true };
    const { execSync } = require("child_process");
    const isWin = process.platform === "win32";
    let active = false, detail = "";
    try {
        // RustDesk direct-session port is 21118; relay 21117; ID 21116. An ESTABLISHED line on these
        // (as a local OR remote port) means a live session/relay leg. On the controlled machine the
        // rustdesk client holds an ESTABLISHED connection out to the relay/peer.
        const out = execSync(isWin ? "netstat -n" : "netstat -tn", { timeout: 4000, windowsHide: true }).toString();
        const rd = /:(2111[5-9])\b/;
        for (const line of out.split(/\r?\n/)) {
            if (!/ESTABLISHED/i.test(line)) continue;
            if (rd.test(line)) { active = true; detail = line.trim().slice(0, 200); break; }
        }
        // Fallback signal: on Windows, is the rustdesk process even running with a live TCP conn?
        if (!active && isWin) {
            try { const t = execSync('tasklist /fi "imagename eq rustdesk.exe" /fo csv /nh', { timeout: 3000, windowsHide: true }).toString(); if (/rustdesk\.exe/i.test(t) && /:2111[5-9]\b/.test(out)) { active = true; detail = "rustdesk.exe running with a RustDesk-port connection"; } } catch {}
        }
    } catch (e) { detail = "detect failed: " + (e && e.message || e); }
    _sessCache = { at: now, active, detail };
    return { ok: true, active, detail };
}

module.exports = { getConfig, setConfig, addMachine, removeMachine, uriFor, buildUri, status, connectHost, selfId, setPassword, install, installStatus, sessionActive };
