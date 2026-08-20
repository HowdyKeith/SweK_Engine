// ai-bridge/ocisBinaryBridge.js — v1831
// Download and run ownCloud Infinite Scale (oCIS) as a SINGLE BINARY — no Docker, no
// Colima, no QEMU. This is the genuinely-easy path for older macOS (e.g. macOS 12) where
// the whole Docker chain falls apart.
//
// Flow:
//   1. Resolve the latest oCIS version (GitHub releases API; fallback to a known-good pin).
//   2. Download the right build from the GitHub release asset (canonical, always matches the tag)
//      https://github.com/owncloud/ocis/releases/download/v<ver>/ocis-<ver>-<os>-<arch>
//      with the download.owncloud.com mirror as a fallback.
//      (arch: Apple Silicon -> arm64, Intel -> amd64; linux supported too).
//   3. chmod +x, and on macOS strip the quarantine xattr (else Gatekeeper blocks it with
//      "Apple could not verify this software").
//   4. `ocis init --insecure yes` (writes config + prints an admin password).
//   5. `ocis server` (serves the web UI at https://localhost:9200).
//
// Web-verified Jun 2026 against github.com/owncloud/ocis releases (asset names
// ocis-8.0.5-darwin-amd64 / -darwin-arm64 confirmed live on the GitHub release; the
// download.owncloud.com mirror lags behind and 404s newer darwin builds, so GitHub is primary).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn, execFile } = require("child_process");

const MAC = process.platform === "darwin";
const WIN = process.platform === "win32";
const OCIS_DIR = path.join(os.homedir(), ".voxelbridge", "ocis");
const BIN_PATH = path.join(OCIS_DIR, WIN ? "ocis.exe" : "ocis");
const FALLBACK_VERSION = "8.0.5";   // known-good pin (Curie series) if the API lookup fails (no network / rate limit). Verified darwin-amd64/-arm64 assets exist on the GitHub release.

let _server = null;        // the running `ocis server` child
let _setup = { running: false, phase: "", log: [] };
function _log(s) { try { _setup.log.push(String(s).slice(0, 500)); if (_setup.log.length > 200) _setup.log.shift(); } catch {} }

function _arch() {
    const a = process.arch;
    if (a === "arm64") return "arm64";
    if (a === "x64") return "amd64";
    if (a === "ia32") return "386";
    return "amd64";
}
function _osTag() { return MAC ? "darwin" : (WIN ? "windows" : "linux"); }

// v1847 — securely stash the oCIS admin password so the panel can show it after the one-time init
// print, and the engine knows it for the 9200 login. On Windows we use the Windows Credential Manager
// (same vault as the GitHub token / Gmail password). On macOS/Linux (where oCIS actually runs on the
// Mac), there's no Windows vault, so we fall back to a 0600 file in the oCIS dir. Best-effort either way.
const _PW_FILE = path.join(OCIS_DIR, "admin-pw.txt");
let _winCred = null; try { _winCred = require("./winCredBridge.js"); } catch {}
async function _storeAdminPw(pw) {
    if (!pw) return { ok: false, error: "no password" };
    if (WIN && _winCred) { try { const r = await _winCred.setSecret("ocisAdminPw", pw); if (r && r.ok) return { ok: true, where: "Windows Credential Manager" }; } catch {} }
    try { fs.mkdirSync(OCIS_DIR, { recursive: true }); fs.writeFileSync(_PW_FILE, pw, { mode: 0o600 }); return { ok: true, where: MAC ? "protected file (macOS)" : "protected file" }; }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
async function getAdminPassword() {
    if (WIN && _winCred) { try { const r = await _winCred.getSecret("ocisAdminPw"); if (r && r.found && r.secret) return { ok: true, password: r.secret, where: "Windows Credential Manager" }; } catch {} }
    try { if (fs.existsSync(_PW_FILE)) return { ok: true, password: fs.readFileSync(_PW_FILE, "utf8").trim(), where: "protected file" }; } catch {}
    return { ok: false, error: "no stored admin password" };
}

// v1848 — live health probe: hit oCIS's own /status.php on 9200. Unlike "is our child process alive",
// this proves 9200 is ACTUALLY serving (even if oCIS was started outside the engine), and returns the
// running productversion. Self-signed cert on localhost, so TLS verification is disabled for this probe.
function _health(timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => { if (done) return; done = true; resolve({ up: false, error: "timeout" }); }, timeoutMs || 2500);
        try {
            const req = https.request({ host: "localhost", port: 9200, path: "/status.php", method: "GET", rejectUnauthorized: false, timeout: timeoutMs || 2500 }, (res) => {
                let body = ""; res.on("data", d => body += d); res.on("end", () => {
                    if (done) return; done = true; clearTimeout(t);
                    let version = ""; try { const j = JSON.parse(body); version = j.productversion || j.version || ""; } catch {}
                    resolve({ up: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode, version });
                });
            });
            req.on("error", () => { if (done) return; done = true; clearTimeout(t); resolve({ up: false, error: "unreachable" }); });
            req.on("timeout", () => { try { req.destroy(); } catch {} });
            req.end();
        } catch (e) { if (!done) { done = true; clearTimeout(t); resolve({ up: false, error: String(e && e.message || e) }); } }
    });
}
// v1850 — is the oCIS process itself in the task list? This catches oCIS running even when our child
// handle is gone (engine restarted) AND the /status.php probe is slow/unavailable (still booting, or
// TLS hiccup). Windows: tasklist for ocis.exe; mac/linux: pgrep for ocis. Your rule: if the task is
// running (or 9200 is up), it's up.
function _processAlive() {
    return new Promise((resolve) => {
        const name = WIN ? "ocis.exe" : "ocis";
        const cmd = WIN ? ('tasklist /FI "IMAGENAME eq ' + name + '" /NH') : ('pgrep -x "' + name + '"');
        try {
            require("child_process").exec(cmd, { timeout: 3000, windowsHide: true }, (err, stdout) => {
                if (WIN) resolve(!err && String(stdout || "").toLowerCase().includes("ocis.exe"));
                else resolve(!err && String(stdout || "").trim().length > 0);
            });
        } catch { resolve(false); }
    });
}
// async status with the live health check folded in.
async function statusLive() {
    const s = status();
    const [h, procAlive] = await Promise.all([_health(2500), _processAlive()]);
    s.serving = !!h.up;                 // 9200 is actually answering (a strong "is it running")
    s.serverVersion = h.version || "";  // oCIS productversion from /status.php
    s.healthStatus = h.status || null;
    s.processAlive = !!procAlive;       // the ocis task is in the process list
    // "running" is true if ANY signal fires: our child is alive, the task is in the process list,
    // or 9200 is serving. Your rule: task running OR 9200 up == up.
    s.running = s.running || s.serving || s.processAlive;
    return s;
}

// resolve the latest non-prerelease oCIS version via the GitHub API (tag like "v7.1.3").
function _latestVersion() {
    return new Promise((resolve) => {
        const req = https.request({
            host: "api.github.com", path: "/repos/owncloud/ocis/releases/latest", method: "GET",
            headers: { "User-Agent": "swek-engine", "Accept": "application/vnd.github+json" }, timeout: 8000,
        }, (res) => {
            let body = "";
            res.on("data", (d) => body += d);
            res.on("end", () => {
                try { const j = JSON.parse(body); let tag = (j && j.tag_name || "").replace(/^v/, "").trim();
                    // only accept a clean semver-ish tag; otherwise fall back to the pin.
                    if (!/^\d+\.\d+\.\d+/.test(tag)) tag = FALLBACK_VERSION;
                    resolve(tag);
                } catch { resolve(FALLBACK_VERSION); }
            });
        });
        req.on("error", () => resolve(FALLBACK_VERSION));
        req.on("timeout", () => { try { req.destroy(); } catch {} resolve(FALLBACK_VERSION); });
        req.end();
    });
}

// download a URL to a file, following redirects. Returns {ok, error}.
function _download(url, dest, redirects) {
    redirects = redirects || 0;
    return new Promise((resolve) => {
        if (redirects > 8) return resolve({ ok: false, error: "too many redirects" });
        // validate / normalize the URL up front so a bad one reports clearly instead of
        // throwing a bare "Invalid URL".
        let parsed;
        try { parsed = new URL(url); } catch (e) { return resolve({ ok: false, error: "bad download URL: " + url }); }
        const mod = parsed.protocol === "http:" ? require("http") : https;
        let file;
        let req;
        try {
            req = mod.get(parsed.href, { headers: { "User-Agent": "swek-engine" }, timeout: 120000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    // resolve relative redirect targets against the CURRENT url (some mirrors/CDNs
                    // return a path-only Location, which would otherwise throw "Invalid URL").
                    let next;
                    try { next = new URL(res.headers.location, parsed.href).href; }
                    catch (e) { return resolve({ ok: false, error: "bad redirect target: " + res.headers.location }); }
                    return resolve(_download(next, dest, redirects + 1));
                }
                if (res.statusCode !== 200) { res.resume(); return resolve({ ok: false, error: "HTTP " + res.statusCode + " for " + parsed.href }); }
                file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on("finish", () => file.close(() => resolve({ ok: true })));
                file.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
            });
        } catch (e) { return resolve({ ok: false, error: "request failed for " + parsed.href + ": " + String(e && e.message || e) }); }
        req.on("error", (e) => resolve({ ok: false, error: String(e && e.message || e) }));
        req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "download timed out" }); });
    });
}

function _run(cmd, args, opts) {
    return new Promise((resolve) => {
        let out = "";
        let child;
        try { child = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {})); }
        catch (e) { return resolve({ code: -1, out: String(e && e.message || e) }); }
        child.stdout && child.stdout.on("data", d => { out += d; _log(String(d).trim()); });
        child.stderr && child.stderr.on("data", d => { out += d; _log(String(d).trim()); });
        child.on("error", (e) => resolve({ code: -1, out: out + "\n" + String(e && e.message || e) }));
        child.on("close", (code) => resolve({ code, out }));
    });
}

function status() {
    let installed = false, version = "";
    try { installed = fs.existsSync(BIN_PATH); } catch {}
    let pwStored = false; try { pwStored = WIN ? true : fs.existsSync(_PW_FILE); } catch {}   // on win we can't cheaply check the vault sync; the panel can call /ocis/password
    return {
        ok: true, installed, binPath: installed ? BIN_PATH : null,
        running: !!(_server && !_server.killed), pid: _server ? _server.pid : null,
        setup: { running: _setup.running, phase: _setup.phase },
        url: "https://localhost:9200", dir: OCIS_DIR, passwordStored: pwStored,
        recentLog: _setup.log.slice(-25),
    };
}

// download + init (does NOT start the server; call start() after).
async function install() {
    if (_setup.running) return { ok: false, error: "an oCIS setup is already running" };
    if (WIN) return { ok: false, error: "The one-button oCIS binary setup here targets macOS/Linux. On Windows, use the Docker image instead." };
    _setup = { running: true, phase: "resolving version", log: [] };
    try {
        try { fs.mkdirSync(OCIS_DIR, { recursive: true }); } catch {}
        const ver = await _latestVersion();
        _setup.phase = "downloading oCIS " + ver;
        _log("oCIS version " + ver);
        // v1844 — candidate download URLs, tried in order. GitHub RELEASE ASSETS first: they're the
        // canonical source, always match the resolved tag, and (unlike the download.owncloud.com
        // mirror) don't lag behind or redirect archived versions to attic.owncloud.com (which 404s
        // for darwin binaries). The mirror is kept as a fallback. Both arch + an amd64 fallback
        // (Rosetta runs it) are tried, since some releases publish amd64 before arm64.
        const os = _osTag(), arch = _arch();
        const names = [ "ocis-" + ver + "-" + os + "-" + arch ];
        if (arch !== "amd64") names.push("ocis-" + ver + "-" + os + "-amd64");   // Rosetta fallback on Apple Silicon
        const candidates = [];
        for (const n of names) candidates.push("https://github.com/owncloud/ocis/releases/download/v" + ver + "/" + n);
        for (const n of names) candidates.push("https://download.owncloud.com/ocis/ocis/" + ver + "/" + n);
        let dl = { ok: false, error: "no candidates" }; const tried = [];
        for (const url of candidates) {
            _log("downloading " + url);
            dl = await _download(url, BIN_PATH);
            if (dl.ok) { _log("got it from " + url); break; }
            tried.push(url.replace(/^https:\/\//, "") + " -> " + dl.error);
            _log("  failed: " + dl.error);
        }
        if (!dl.ok) {
            _setup.running = false;
            return { ok: false, error: "download failed for oCIS " + ver + ". Tried:\n  " + tried.join("\n  ") };
        }
        _setup.phase = "making executable";
        try { fs.chmodSync(BIN_PATH, 0o755); } catch (e) { _log("chmod: " + e.message); }
        // macOS quarantine: Gatekeeper blocks downloaded binaries ("Apple could not verify
        // this software") until the quarantine xattr is removed. Best-effort.
        if (MAC) { await _run("xattr", ["-d", "com.apple.quarantine", BIN_PATH]); _log("cleared quarantine xattr (if present)"); }

        // sanity: can it execute?
        _setup.phase = "verifying binary";
        const ver2 = await _run(BIN_PATH, ["version"], { cwd: OCIS_DIR });
        if (ver2.code !== 0 && !/ocis|version/i.test(ver2.out)) {
            _setup.running = false;
            return { ok: false, error: "the oCIS binary downloaded but won't run: " + (ver2.out || "").slice(-300) + (MAC ? " (on macOS you may need to allow it in System Settings → Privacy & Security)" : "") };
        }

        // init: writes config + prints an admin password. --insecure yes for a local self-signed setup.
        _setup.phase = "initializing (ocis init)";
        const initEnv = Object.assign({}, process.env, { OCIS_CONFIG_DIR: OCIS_DIR, OCIS_BASE_DATA_PATH: path.join(OCIS_DIR, "data") });
        const init = await _run(BIN_PATH, ["init", "--insecure", "yes"], { cwd: OCIS_DIR, env: initEnv });
        // "already initialized" is fine — treat as success.
        const initOk = init.code === 0 || /already initiali/i.test(init.out);
        let adminPw = "";
        const m = init.out.match(/password\s*[:=]\s*(\S+)/i);
        if (m) adminPw = m[1];
        // v1847 — vault the admin password (Windows Credential Manager, or a 0600 file on mac/linux) so
        // the panel can show it later and the engine can auto-login when starting 9200.
        let pwStore = null;
        if (adminPw) { try { pwStore = await _storeAdminPw(adminPw); if (pwStore && pwStore.ok) _log("admin password stored in " + pwStore.where); } catch {} }
        _setup.running = false;
        if (!initOk) return { ok: false, error: "ocis init failed: " + (init.out || "").slice(-400), binPath: BIN_PATH };
        return { ok: true, version: ver, binPath: BIN_PATH, adminPassword: adminPw,
            passwordStored: !!(pwStore && pwStore.ok), passwordStoredIn: (pwStore && pwStore.where) || null,
            note: "oCIS installed + initialized. Click Start to run it, then open https://localhost:9200 (user: admin" + (adminPw ? (", password: " + adminPw) : "") + ")." + ((pwStore && pwStore.ok) ? (" Password saved to " + pwStore.where + ".") : ""),
            initOutput: (init.out || "").slice(-1200) };
    } catch (e) {
        _setup.running = false;
        return { ok: false, error: String(e && e.message || e) };
    }
}

// start `ocis server` in the background.
function start() {
    if (!fs.existsSync(BIN_PATH)) return { ok: false, error: "oCIS isn't installed yet — run Install first." };
    if (_server && !_server.killed) return { ok: true, already: true, pid: _server.pid };
    try {
        const env = Object.assign({}, process.env, {
            OCIS_INSECURE: "true",
            OCIS_CONFIG_DIR: OCIS_DIR,
            OCIS_BASE_DATA_PATH: path.join(OCIS_DIR, "data"),
            PROXY_HTTP_ADDR: "0.0.0.0:9200",
            OCIS_URL: "https://localhost:9200",
        });
        const child = spawn(BIN_PATH, ["server"], { cwd: OCIS_DIR, env, windowsHide: true, detached: false, stdio: ["ignore", "pipe", "pipe"] });
        _server = child;
        child.stdout && child.stdout.on("data", d => _log(String(d).trim()));
        child.stderr && child.stderr.on("data", d => _log(String(d).trim()));
        child.on("exit", (code) => { _log("ocis server exited code " + code); if (_server === child) _server = null; });
        return { ok: true, pid: child.pid, url: "https://localhost:9200" };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function stop() {
    if (_server && !_server.killed) { try { _server.kill(); } catch {} _server = null; return { ok: true }; }
    return { ok: true, note: "not running (under the engine)" };
}

module.exports = { status, statusLive, install, start, stop, getAdminPassword, BIN_PATH, OCIS_DIR };
