// Auto-Install — a light registry of demo/panel capability dependencies with a
// global "auto-install as needed" toggle plus per-item opt-in. Distinct from the
// heavy ComfyUI/3D-asset install_catalog.json: these are the small deps that make
// a panel or demo work (PDF reader, scrapers, coding agents…).
//
// Each entry is data-only so new installables (Agent-Reach, Cline, …) just append
// here. `est` figures are deliberately BROAD guesstimates — download size, installed
// footprint, and rough install time — so the panel can warn before a big pull.
//
// Endpoints (wired in server.js): GET /autoinstall/list, POST /autoinstall/pref,
// POST /autoinstall/run, POST /autoinstall/ensure.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const PREFS = path.join(os.homedir(), ".voxelbridge", "autoinstall.json");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const DEFAULT_CAP_MB = 100;   // v1497 — was a hard 30; now the default of a user-set cap, bumped so ffmpeg-class tools can auto-install
// v1497 — cap is now configurable (Settings → Auto-Install slider). 0 = unlimited.
function capMB() { const p = _readPrefs(); const v = (p && typeof p.autoCapMB === "number") ? p.autoCapMB : DEFAULT_CAP_MB; return v < 0 ? 0 : v; }
function setCapMB(mb) { const p = _readPrefs(); let n; if (mb === 0 || mb === "0" || String(mb).toLowerCase() === "unlimited") n = 0; else n = Math.max(10, Math.round(Number(mb) || DEFAULT_CAP_MB)); p.autoCapMB = n; _writePrefs(p); return { ok: true, autoCapMB: n, unlimited: n === 0 }; }
// v1497 — free disk space (MB) on the volume holding a path; used for a pre-install warning.
function freeDiskMB(p) { try { const s = fs.statfsSync(p || os.homedir()); return Math.round((Number(s.bsize) * Number(s.bavail)) / (1024 * 1024)); } catch { return null; } }
function preflight(id) {
    const e = byId(id); if (!e) return { ok: false, error: "unknown id" };
    const approxMB = (e.est && e.est.downloadMB) || 0;
    const freeMB = freeDiskMB(); const cap = capMB();
    return { ok: true, id, label: e.label || id, approxMB, freeMB, capMB: cap,
             overCap: !!(cap && approxMB && approxMB > cap),
             lowSpace: !!(freeMB != null && approxMB && freeMB < approxMB * 3) };   // want ~3x headroom for download + extract
}
function _pyCmd() { const v = process.env.VOXEL_VENV_PY; return (v && fs.existsSync(v)) ? v : (IS_WIN ? "python" : "python3"); }

// ---- registry ----
// tier:    "dep"     small pip/npm dep — eligible for silent auto-install
//          "app"     small no-login app/binary — eligible for auto-install (+ autoRun)
//          "devtool" a developer program (Bun, OpenRGB…) — NEVER auto; manual only
// detect:  { kind:"pip", module:"fitz" }            → python -c "import fitz"
//          { kind:"cmd", bin:"bun" }                → on PATH?
//          { kind:"npm", bin:"cline" }              → on PATH (global npm bin)?
//          { kind:"file", path:"…" }                → that path exists?
//          { kind:"files", paths:[…] }              → any of these exist?
//          { kind:"go2rtc" }                        → go2rtcBridge has a binary?
// install: { kind:"pip", pkg:"PyMuPDF" }            → python -m pip install --upgrade PyMuPDF
//          { kind:"npm", pkg:"@org/cli" }           → npm install -g @org/cli
//          { kind:"cmd", win:[…], unix:[…] }        → raw argv (per-platform)
//          { kind:"go2rtc" }                        → go2rtcBridge.install() (+ autoRun start)
//          { kind:"link", url:"…" }                 → no silent install; panel shows a "Get it" link
const REGISTRY = [
    {
        id: "pymupdf", tier: "dep",
        label: "PyMuPDF",
        powers: "Comic / PDF reader — render PDF pages and export their images",
        detect:  { kind: "pip", module: "fitz" },
        install: { kind: "pip", pkg: "PyMuPDF" },
        est: { downloadMB: 25, installMB: 95, timeSec: 30 },
    },
    {
        id: "pillow", tier: "dep",
        label: "Pillow",
        powers: "Image tools — shrink/recompress comic pages for phone & tablet viewing (WebP/JPEG, no quality loss)",
        detect:  { kind: "pip", module: "PIL" },
        install: { kind: "pip", pkg: "Pillow" },
        est: { downloadMB: 4, installMB: 12, timeSec: 15 },
    },
    {
        // v3166 -- copyparty (9001/copyparty, MIT, ~45k stars). Registered here rather than given a bespoke
        // launcher, because THIS REGISTRY IS THE PRIMITIVE and v3154 spent a round collapsing six copies of one
        // predicate into one. A second install path for the same kind of thing is how the sixth copy happens.
        //
        // *** WHAT IT IS FOR, PRECISELY: THE PHONE PEERS. *** android-peer.html and ios-peer.html mention file
        // transfer ZERO times -- the phone peers run the physics subset and cannot move a file. copyparty runs
        // in Termux and in a-Shell, which are exactly those two environments, and needs only Python.
        //
        // *** WHAT IT IS NOT FOR: THE ENGINE-TO-ENGINE GRAB. *** That path pulls a WALKED DIRECTORY from a
        // trusted peer under _isTrustedReq and the PIN gate. copyparty has its own accounts and volumes, and
        // putting it under the trusted path would mean TWO AUTH SYSTEMS FOR ONE MESH -- the two-things-one-label
        // shape, in the place where it is worst.
        //
        // autoRun IS DELIBERATELY OFF. go2rtc above sets it because a camera server with nothing to serve is
        // harmless; a FILE SERVER that starts itself is a decision about what is exposed and to whom, and
        // copyparty's own README warns that running it bare "will give everyone read/write access to the
        // current folder". That is a choice Keith makes, not one a registry makes for him.
        id: "copyparty", tier: "app",
        label: "copyparty",
        powers: "Phone-peer file transfer \u2014 resumable chunked uploads/downloads over http, WebDAV, FTP or SFTP. Runs in Termux (Android) and a-Shell (iOS), where the engine's own peer transfer does not.",
        detect:  { kind: "pip", module: "copyparty" },
        install: { kind: "pip", pkg: "copyparty" },
        est: { downloadMB: 8, installMB: 20, timeSec: 25 },
    },
    {
        id: "go2rtc", tier: "app", autoRun: true,
        label: "go2rtc",
        powers: "Camera streaming server — puts RTSP / ONVIF cameras onto the camera wall. Single Go binary, no account.",
        detect:  { kind: "go2rtc" },
        install: { kind: "go2rtc" },
        est: { downloadMB: 12, installMB: 14, timeSec: 20 },
    },
    {
        // v1497 — ffmpeg is now an auto-install candidate (needs the cap >= ~80MB). On Windows this
        // uses winget (Gyan.FFmpeg); if winget is missing the run reports that and the Diagnostics
        // tab still has the manual link. Needed for RTSP->mjpeg camera transcode + webcam expose.
        id: "ffmpeg", tier: "app",
        label: "ffmpeg",
        powers: "RTSP camera transcode (rtsp\u2192mjpeg for the camera wall) + local webcam expose + audio/video.",
        detect:  { kind: "cmd", bin: "ffmpeg" },
        install: { kind: "cmd",
                   win:  ["winget", "install", "--id", "Gyan.FFmpeg", "-e", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"],
                   mac:  ["sh", "-c", "BREW=\"$(command -v brew)\"; [ -x \"$BREW\" ] || BREW=/opt/homebrew/bin/brew; [ -x \"$BREW\" ] || BREW=/usr/local/bin/brew; [ -x \"$BREW\" ] || { echo 'Homebrew not found - install it from https://brew.sh then retry'; exit 1; }; export HOMEBREW_NO_AUTO_UPDATE=1 NONINTERACTIVE=1; yes | \"$BREW\" install ffmpeg"],
                   unix: ["sh", "-c", "command -v apt-get >/dev/null 2>&1 && sudo -n apt-get install -y ffmpeg 2>&1 || { echo 'Could not install automatically (need passwordless sudo, or install ffmpeg with your package manager)'; exit 1; }"] },
        est: { downloadMB: 80, installMB: 180, timeSec: 60 },
    },
    {
        id: "openrgb", tier: "devtool",
        label: "OpenRGB",
        powers: "RGB lighting — drive motherboard / RAM / GPU / peripheral LEDs from the engine (turn on its SDK Server in OpenRGB).",
        detect:  { kind: "files", paths: [
            "C:\\Program Files\\OpenRGB\\OpenRGB.exe",
            "C:\\Program Files (x86)\\OpenRGB\\OpenRGB.exe",
            path.join(os.homedir(), "AppData", "Local", "OpenRGB", "OpenRGB.exe"),
            "/usr/bin/openrgb", "/usr/local/bin/openrgb", "/Applications/OpenRGB.app",
        ] },
        install: { kind: "link", url: "https://openrgb.org/#download" },
        est: { downloadMB: 30, installMB: 60, timeSec: 0 },
    },
    {
        id: "bun", tier: "devtool",
        label: "Bun",
        powers: "Faster JS runtime for the ai-bridge backend. A dev tool — install it yourself, then flip it on under Settings → Runtime.",
        detect:  { kind: "cmd", bin: "bun" },
        install: { kind: "link", url: "https://bun.sh" },
        est: { downloadMB: 30, installMB: 90, timeSec: 0 },
    },
    {
        id: "biglybt", tier: "app",
        label: "BiglyBT",
        powers: "Torrent client driven from Settings \u2192 Torrents (live list, add magnet, start/stop/remove) plus the 3D voxel view. Install BiglyBT, add its \"Web Remote\" plugin (Tools \u2192 Plugins \u2192 Get Plugins), turn on \"Allow Remote Control on LAN,\" then set the host:port it shows under Settings \u2192 Torrents.",
        detect:  { kind: "biglybt" },
        install: { kind: "link", url: "https://www.biglybt.com/download/" },
        est: { downloadMB: 25, installMB: 120, timeSec: 0 },
    },
    {
        // v2082 -- AutoRemesher: automatic quad remeshing (huxingyi/autoremesher,
        // MIT). Turns dense generated meshes (Trellis / ComfyUI-3D / cuda_voxelizer
        // output) into clean quad topology + LODs. Prefer the prebuilt release exe
        // (deps bundled: CGAL, OpenVDB, Geogram, libigl, TBB, Qt); build-from-source
        // is the fallback (needs VS2022 + CMake + TBB). NOTE: the exact CLI flags are
        // discovered at runtime via `--help` (see remeshBridge.js) rather than baked
        // here, because they are not documented upstream and must not be guessed.
        id: "autoremesher", tier: "app",
        label: "AutoRemesher",
        powers: "Quad remeshing / retopology \u2014 convert dense generated meshes (Trellis, ComfyUI-3D, cuda_voxelizer) into clean quad topology, and make LODs via a target-quads count. OBJ/STL/PLY in.",
        detect:  { kind: "files", paths: [
            path.join(__dirname, "..", "vendor", "autoremesher", IS_WIN ? "autoremesher.exe" : "autoremesher"),   // v2084 -- built-from-source output
            path.join(os.homedir(), "autoremesher", IS_WIN ? "autoremesher.exe" : "autoremesher"),
            "C:\\Program Files\\AutoRemesher\\autoremesher.exe",
            "C:\\Program Files (x86)\\AutoRemesher\\autoremesher.exe",
            path.join(os.homedir(), "AppData", "Local", "AutoRemesher", "autoremesher.exe"),
            "/usr/local/bin/autoremesher", "/usr/bin/autoremesher",
            "/Applications/AutoRemesher.app/Contents/MacOS/autoremesher",
            path.join(os.homedir(), "Applications", "AutoRemesher.app", "Contents", "MacOS", "autoremesher"),
        ] },
        install: { kind: "link", url: "https://github.com/huxingyi/autoremesher/releases" },
        est: { downloadMB: 40, installMB: 120, timeSec: 0 },
    },
    {
        // v2085 -- Mojo (Modular): a Python-superset language for high-perf CPU/GPU
        // kernels. EXPERIMENTAL in this engine -- there is a benchmark in
        // experiments/mojo-subvoxel/ but nothing in the pipeline depends on Mojo.
        // Beta (1.0.0 beta, May 2026); compiler closed-source until fall 2026;
        // Linux/macOS only. Installed via Modular's pixi tool, so this is a MANUAL
        // entry (never auto-installs). The panel offers a scripted install + a
        // detect button + a "run the benchmark" button.
        id: "mojo", tier: "app",
        label: "Mojo (experimental)",
        powers: "High-performance Python-superset for CPU/GPU kernels. Experimental: used only by the cell-tracking sub-voxel benchmark in experiments/mojo-subvoxel/. Beta, Linux/macOS only, compiler closed-source until fall 2026.",
        detect:  { kind: "cmd", bin: "mojo" },
        install: { kind: "link", url: "https://docs.modular.com/mojo/manual/get-started/" },
        est: { downloadMB: 300, installMB: 800, timeSec: 0 },
    },
    // Agent-Reach and Cline append here in their own rounds (real install commands verified there).
];
const byId = (id) => REGISTRY.find(e => e.id === id) || null;

// ---- prefs ----
function _readPrefs() { try { return JSON.parse(fs.readFileSync(PREFS, "utf8")); } catch { return { enabled: false, items: {} }; } }
function _writePrefs(p) { try { fs.mkdirSync(path.dirname(PREFS), { recursive: true }); fs.writeFileSync(PREFS, JSON.stringify(p, null, 2)); return true; } catch { return false; } }
function prefs() { const p = _readPrefs(); return { enabled: !!p.enabled, items: p.items || {} }; }
function setGlobal(on) { const p = _readPrefs(); p.enabled = !!on; _writePrefs(p); return prefs(); }
function setPref(id, on) { const p = _readPrefs(); p.items = p.items || {}; p.items[id] = !!on; _writePrefs(p); return prefs(); }
// Auto-install applies only to eligible items: never dev tools, never link-only
// (can't be silently installed), never anything bigger than the cap — and then
// only when the global switch is on OR the item is individually opted in.
function autoEligible(e) {
    if (!e) return false;
    if (e.tier === "devtool") return false;
    if (e.install && e.install.kind === "link") return false;
    if (e.est && e.est.downloadMB && capMB() && e.est.downloadMB > capMB()) return false;
    return true;
}
function autoFor(id) { const e = byId(id); if (!autoEligible(e)) return false; const p = prefs(); return !!(p.enabled || (p.items && p.items[id])); }

// ---- detect ----
function detect(id) {
    const e = byId(id); if (!e) return "unknown";
    const d = e.detect || {};
    try {
        if (d.kind === "pip") { const r = spawnSync(_pyCmd(), ["-c", "import " + d.module], { windowsHide: true, timeout: 15000 }); return r.status === 0 ? "installed" : "missing"; }
        if (d.kind === "cmd" || d.kind === "npm") {
            const which = IS_WIN ? "where" : "which";
            const r = spawnSync(which, [d.bin], { windowsHide: true, timeout: 8000 });
            if (r.status === 0) return "installed";
            // v1902 — a process launched from the macOS GUI / osascript / nohup often has a minimal PATH
            // that excludes /opt/homebrew/bin (Apple Silicon brew) or /usr/local/bin (Intel brew), so
            // `which` misses a perfectly-installed binary. Fall back to checking the well-known locations.
            if (!IS_WIN) {
                const common = [
                    "/opt/homebrew/bin/", "/usr/local/bin/", "/usr/bin/", "/bin/", "/opt/local/bin/",
                    require("path").join(require("os").homedir(), ".voxelbridge", "bin") + "/",   // v1917 static download
                ];
                for (const dir of common) { try { if (fs.existsSync(dir + d.bin)) return "installed"; } catch {} }
            }
            return "missing";
        }
        if (d.kind === "file") { return fs.existsSync(d.path) ? "installed" : "missing"; }
        if (d.kind === "files") { return (d.paths || []).some(p => { try { return fs.existsSync(p); } catch { return false; } }) ? "installed" : "missing"; }
        if (d.kind === "go2rtc") { try { return require("./go2rtcBridge.js").binPath() ? "installed" : "missing"; } catch { return "missing"; } }
        if (d.kind === "biglybt") { try { return require("./biglybtBridge.js").getConfig().configured ? "installed" : "missing"; } catch { return "missing"; } }   // v1637 — "installed" once the Web Remote host:port is set (real liveness = Test in Settings -> Torrents)
    } catch { return "unknown"; }
    return "unknown";
}

// ---- run (async; tracked) ----
const _state = {};   // id -> { installing, lastOk, lastErr, log, ts }
function _installArgv(e) {
    const i = e.install || {};
    if (i.kind === "pip") return { cmd: _pyCmd(), args: ["-m", "pip", "install", "--upgrade", i.pkg] };
    if (i.kind === "npm") return { cmd: IS_WIN ? "npm.cmd" : "npm", args: ["install", "-g", i.pkg] };
    if (i.kind === "cmd") { const a = (IS_WIN ? i.win : (IS_MAC && i.mac) ? i.mac : i.unix) || i.unix || i.win || []; return { cmd: a[0], args: a.slice(1) }; }
    return null;
}
// Kicks the install off and returns immediately; callers poll list()/status() for
// the installing→installed transition (installs can take tens of seconds).
function run(id, opts = {}) {
    const e = byId(id); if (!e) return { ok: false, error: "unknown id" };
    if (_state[id] && _state[id].installing) return { ok: true, installing: true, already: true };
    // v1497 — disk-space guard: refuse a sizeable install when free space is tight, unless the
    // caller forces it (the manual Install button confirms first, then retries with force).
    if (!opts.force) { const pf = preflight(id); if (pf && pf.ok && pf.lowSpace) return { ok: false, lowSpace: true, error: "Low disk space — needs ~" + pf.approxMB + " MB but only " + (pf.freeMB != null ? pf.freeMB + " MB" : "unknown") + " free.", preflight: pf }; }
    const ik = (e.install || {}).kind;
    // link-only items can't be installed silently — hand back the URL for a button.
    if (ik === "link") return { ok: false, manual: true, link: (e.install.url || null), error: "manual install — open the link" };
    // go2rtc: delegate to its bridge (GitHub-release binary), then auto-run if flagged.
    if (ik === "go2rtc") {
        _state[id] = { installing: true, log: "", ts: Date.now() };
        (async () => {
            try {
                const g = require("./go2rtcBridge.js");
                const r = await g.install();
                if (r && r.ok) { if (e.autoRun) { try { g.start(); } catch (_) {} } _state[id] = { installing: false, lastOk: true, lastErr: null, ts: Date.now() }; }
                else { _state[id] = { installing: false, lastOk: false, lastErr: (r && r.error) || "install failed", ts: Date.now() }; }
            } catch (err) { _state[id] = { installing: false, lastOk: false, lastErr: String((err && err.message) || err), ts: Date.now() }; }
        })();
        return { ok: true, installing: true, started: true };
    }
    // v1907 — don't start a competing install if one is ALREADY running (e.g. the user kicked off
    // `brew install ffmpeg` manually in Terminal, or a slow source-compile from a prior click is still
    // going). Starting a second one collides on the package-manager lock and fails with "please wait for
    // it to finish". Detect the in-flight install by process name and just report installing + wait.
    if (ik === "cmd" && !IS_WIN) {
        try {
            const bin = (e.detect && e.detect.bin) || id;
            const pg = spawnSync("pgrep", ["-f", "install " + bin], { timeout: 3000 });
            if (pg && pg.status === 0 && String(pg.stdout || "").trim()) {
                _state[id] = { installing: true, external: true, log: "(an install of " + bin + " is already running \u2014 waiting for it to finish)", ts: Date.now() };
                return { ok: true, installing: true, external: true };
            }
        } catch {}
    }
    const argv = _installArgv(e); if (!argv || !argv.cmd) return { ok: false, error: "no install command for " + id };
    _state[id] = { installing: true, log: "", ts: Date.now() };
    let child;
    try { child = spawn(argv.cmd, argv.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (err) { _state[id] = { installing: false, lastOk: false, lastErr: String(err && err.message), ts: Date.now() }; return { ok: false, error: String(err && err.message) }; }
    const cap = (d) => { _state[id].log = (_state[id].log + d).slice(-4000); };
    if (child.stdout) child.stdout.on("data", cap);
    if (child.stderr) child.stderr.on("data", cap);
    // v1903 — hard timeout so a stuck installer (e.g. sudo blocking on a password with no TTY) can't
    // leave the UI saying "installing" forever. stdin is /dev/null above so any password read hits EOF
    // and fails fast; this is the backstop for anything else that wedges.
    // v1905 — timeout as a hang-backstop, NOT a compile-killer. cmd installs (brew/apt) can build from
    // source when there's no prebuilt package (e.g. macOS 12 is Homebrew "Tier 3" = no bottles, so ffmpeg
    // + its 21 deps compile from source and can take 30-45 min). Give those a generous 60-min ceiling;
    // package installs (pip/npm/go2rtc-binary) get 10 min. The real hang cause (interactive prompts) is
    // already removed via NONINTERACTIVE + stdin=/dev/null, so this only catches genuine wedges.
    const _ik2 = (e.install || {}).kind;
    const TIMEOUT_MS = _ik2 === "cmd" ? 3600000 : Math.max(600000, ((e.est && e.est.timeSec) || 60) * 3000);
    let _done = false;
    const _timer = setTimeout(() => { if (_done) return; try { child.kill("SIGKILL"); } catch {} _state[id] = { installing: false, lastOk: false, lastErr: "install timed out after " + Math.round(TIMEOUT_MS / 1000) + "s (try installing manually)", log: (_state[id] && _state[id].log) || "", ts: Date.now() }; }, TIMEOUT_MS);
    child.on("error", (err) => { _done = true; clearTimeout(_timer); _state[id] = { installing: false, lastOk: false, lastErr: String(err && err.message), log: (_state[id] && _state[id].log) || "", ts: Date.now() }; });
    child.on("exit", (code) => { _done = true; clearTimeout(_timer); const ok = code === 0; _state[id] = { installing: false, lastOk: ok, lastErr: ok ? null : (("exit " + code) + ((_state[id] && _state[id].log) ? (" \u2014 " + String(_state[id].log).trim().split("\n").pop()).slice(0, 160) : "")), log: (_state[id] && _state[id].log) || "", ts: Date.now() }; });
    return { ok: true, installing: true, started: true };
}
function status(id) { const s = _state[id] || {}; return { installing: !!s.installing, lastOk: s.lastOk ?? null, lastErr: s.lastErr ?? null, ts: s.ts ?? null }; }
// v1907 — is a package-manager install of this item's binary running right now (started by us OR
// manually in a terminal)? Lets the UI show "installing / please wait" instead of a lock-collision error.
function installRunning(id) {
    if (IS_WIN) return false;
    // v1917 — a loose `pgrep -f "install ffmpeg"` false-positives on stale/unrelated command lines, which
    // made /ffmpeg/status wedge on "installing" forever after a reboot (no real install running). Require
    // BOTH: (a) our own _state says an install is in-flight (installing:true, set when WE spawn brew), and
    // (b) pgrep still sees a matching process. If we never started one, we don't report "installing".
    const s = _state[id];
    if (!s || !s.installing) return false;
    try { const e = byId(id); const bin = (e && e.detect && e.detect.bin) || id; const pg = spawnSync("pgrep", ["-f", "install " + bin], { timeout: 3000 }); return !!(pg && pg.status === 0 && String(pg.stdout || "").trim()); } catch { return false; }
}

// ensure: if installed → {installed:true}. Else if auto-install applies → start it
// and report {installing:true}. Else report {need:id} so the caller can show a button.
function ensure(id) {
    const e = byId(id); if (!e) return { ok: false, error: "unknown id" };
    if (detect(id) === "installed") return { ok: true, installed: true };
    if (_state[id] && _state[id].installing) return { ok: true, installing: true };
    if (autoFor(id)) { const r = run(id); return { ok: !!r.ok, installing: true, auto: true, error: r.error }; }
    return { ok: false, need: id, label: e.label };
}

// list: registry meta + live state for the panel.
function list() {
    const p = prefs();
    const items = REGISTRY.map(e => ({
        id: e.id, label: e.label, powers: e.powers, est: e.est || null,
        tier: e.tier || "dep",
        manual: (e.tier === "devtool") || ((e.install || {}).kind === "link"),
        link: ((e.install || {}).kind === "link") ? (e.install.url || null) : null,
        autoEligible: autoEligible(e),
        autoCapped: !!(e.est && e.est.downloadMB && capMB() && e.est.downloadMB > capMB()),
        autoRun: !!e.autoRun,
        installed: detect(e.id) === "installed",
        installing: !!(_state[e.id] && _state[e.id].installing),
        lastErr: (_state[e.id] && _state[e.id].lastErr) || null,
        auto: !!(p.items && p.items[e.id]),
    }));
    return { ok: true, enabled: !!p.enabled, autoCapMB: capMB(), items };
}

module.exports = { list, prefs, setGlobal, setPref, detect, run, status, ensure, installRunning, capMB, setCapMB, preflight, freeDiskMB, DEFAULT_CAP_MB, REGISTRY };
