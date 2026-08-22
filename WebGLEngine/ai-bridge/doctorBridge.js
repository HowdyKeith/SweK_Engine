// ai-bridge/doctorBridge.js — v1984
// The machine-environment "doctor": one place that runs per-machine sanity checks so the failure class that
// has cost the most session time (a detached/GUI-launched bridge whose runtime environment differs from CLI
// assumptions, and whose detection then LIES) becomes a 30-second read instead of a debugging session.
//
// It checks: the EFFECTIVE PATH the bridge process actually sees (the Mac-GUI minimal-PATH trap), whether key
// binaries resolve at ABSOLUTE paths (not just "on PATH" — the "ffmpeg reported not installed but it's right
// there" bug), daemon liveness (docker daemon down until Desktop launched; ollama/go2rtc/mqtt), port
// reachability (incl. the bridge's own), free disk (the pull guard), and configured-camera reachability.
// Every check carries a status (ok|warn|fail) and, when not ok, a concrete HINT for the fix.
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { execFile } = require("child_process");

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";

function _which(bin) {
    return new Promise((resolve) => {
        execFile(WIN ? "where" : "which", [bin], { timeout: 2500, windowsHide: true }, (err, stdout) => {
            const p = String(stdout || "").split(/\r?\n/)[0].trim();
            resolve(!err && p ? p : null);
        });
    });
}
function _tcp(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const sock = net.connect({ host, port }, () => { sock.end(); resolve(true); });
        sock.setTimeout(timeoutMs, () => { try { sock.destroy(); } catch {} resolve(false); });
        sock.on("error", () => resolve(false));
    });
}
async function _http(url, timeoutMs = 2500) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    try { const r = await fetch(url, { signal: ac.signal }); return r.ok || r.status < 500; }
    catch { return false; } finally { clearTimeout(t); }
}

// Known absolute install locations per binary — the "resolve at an absolute path even if PATH is minimal" list.
function _absCandidates(bin) {
    const home = os.homedir();
    const vb = path.join(home, ".voxelbridge", "bin");
    if (WIN) return {
        ffmpeg: [path.join(vb, "ffmpeg.exe"), "C:\\ffmpeg\\bin\\ffmpeg.exe"],
        git: ["C:\\Program Files\\Git\\cmd\\git.exe"],
        docker: ["C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"],
        ollama: [path.join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")],
        node: [process.execPath], npm: [], python3: [], go2rtc: [path.join(vb, "go2rtc.exe")],
    }[bin] || [];
    return {
        ffmpeg: [path.join(vb, "ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"],
        git: ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"],
        docker: ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker", "/Applications/Docker.app/Contents/Resources/bin/docker"],
        ollama: ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama", "/usr/bin/ollama"],
        node: [process.execPath, "/opt/homebrew/bin/node", "/usr/local/bin/node"],
        npm: ["/opt/homebrew/bin/npm", "/usr/local/bin/npm"],
        python3: ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"],
        go2rtc: [path.join(vb, "go2rtc"), "/usr/local/bin/go2rtc"],
    }[bin] || [];
}

async function _binary(bin) {
    const onPath = await _which(bin);
    let abs = null;
    for (const c of _absCandidates(bin)) { try { if (c && fs.existsSync(c)) { abs = c; break; } } catch {} }
    const found = !!(onPath || abs);
    // The important distinction: present at an absolute path but NOT on the process PATH = the exact trap
    // where CLI checks pass but the running bridge can't exec it.
    const onlyAbs = !onPath && !!abs;
    let status = found ? "ok" : "warn", hint = "";
    if (!found) hint = bin + " not found on PATH or known locations — install it, or it won't be available to the bridge.";
    else if (onlyAbs) { status = "warn"; hint = bin + " exists at " + abs + " but is NOT on this process's PATH. A GUI/nohup-launched bridge can fail to exec it by name — the engine should call it by absolute path (already done for ffmpeg via resolveFfmpegBin)."; }
    return { name: bin, found, onPath: onPath || null, absolute: abs || null, onlyAbsolute: onlyAbs, status, hint };
}

// ---- individual check groups ----
function systemInfo() {
    let osName = process.platform, osVer = "";
    try { const b = require("./bgServicesBridge.js"); const oi = b.osInfo && b.osInfo(); if (oi) { osName = oi.name || osName; osVer = oi.version || ""; } } catch {}
    return {
        platform: process.platform, os: osName, osVersion: osVer, node: process.version,
        engineRoot: path.resolve(__dirname, ".."), cwd: process.cwd(), pid: process.pid,
        user: (os.userInfo && os.userInfo().username) || "", uptimeSec: Math.round(process.uptime()),
        totalMemGB: +(os.totalmem() / 1e9).toFixed(1), freeMemGB: +(os.freemem() / 1e9).toFixed(1),
    };
}
function pathCheck() {
    const raw = process.env.PATH || "";
    const entries = raw.split(WIN ? ";" : ":").filter(Boolean);
    const warnings = [];
    if (!WIN) {
        // The Mac-GUI minimal-PATH signature: brew dirs missing means brew-installed tools won't exec.
        const hasBrew = entries.some(e => e.includes("/opt/homebrew/bin") || e.includes("/usr/local/bin"));
        if (!hasBrew) warnings.push("PATH is missing /usr/local/bin and /opt/homebrew/bin — a GUI/nohup-launched bridge often inherits a minimal PATH, so brew-installed tools (ffmpeg, git, ollama) look 'not installed'. Launch from a login shell, or the engine must resolve tools by absolute path.");
        if (entries.length <= 4) warnings.push("PATH has only " + entries.length + " entries (" + raw + ") — this is the minimal-PATH trap. Relaunch the bridge from Terminal, not a double-click/nohup.");
    }
    return { status: warnings.length ? "warn" : "ok", entryCount: entries.length, entries, raw, warnings };
}
async function daemons() {
    const out = [];
    // ollama
    // v3017 -- "is Ollama up" was one boolean covering THREE states, and the third is the expensive one.
    // A port probe cannot tell "running correctly" from "running with the wrong models pulled", and the second
    // fails at the FIRST CALL, MID-RUN, after a device has already been built and a pull is gigabytes away.
    // Also corrected here: nothing in this tree installs or starts Ollama. It is NOT on the auto-install list.
    {
        let r = null;
        try {
            const m = await import("../tools/roundhouse/ollamaReadiness.mjs");
            r = await m.readiness({ pinned: process.env.OLLAMA_MODEL || null });
        } catch (e) { r = null; }
        out.push({
            name: "Ollama", target: "127.0.0.1:11434",
            up: !!(r && r.up),
            verdict: r ? r.verdict : "unknown",
            detail: r ? r.why : null,
            hint: r ? (r.fix || "running") : "start it: `ollama serve` (or it may run as a tray app). Needed for lore/polish/commentary. NOTHING HERE STARTS IT FOR YOU.",
        });
    }
    // docker daemon (installed vs running is the v1827 distinction)
    let dockerUp = false, dockerHint = "";
    try {
        dockerUp = await new Promise((resolve) => execFile(WIN ? "docker" : "docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 4000, windowsHide: true }, (err, so) => resolve(!err && !!String(so).trim())));
    } catch {}
    if (!dockerUp) dockerHint = "docker CLI may be installed but the DAEMON is down. Launch Docker Desktop once (it must be running, not just installed) — this is the #1 'docker not working' cause.";
    out.push({ name: "Docker daemon", target: "docker info", up: dockerUp, hint: dockerHint });
    // go2rtc (camera relay) — default api port 1984
    out.push({ name: "go2rtc", target: "127.0.0.1:1984", up: await _tcp("127.0.0.1", 1984), hint: "camera relay; the engine autostarts it. If down, cameras won't stream. Check /go2rtc/restart." });
    // mosquitto
    out.push({ name: "Mosquitto (MQTT)", target: "127.0.0.1:1883", up: await _tcp("127.0.0.1", 1883), hint: "optional; only needed if Home Assistant / Frigate publish here." });
    return out.map(d => ({ ...d, status: d.up ? "ok" : (d.name === "Mosquitto (MQTT)" ? "warn" : "warn") }));
}
async function ports() {
    const self = await _tcp("127.0.0.1", 8787);
    return [{ name: "bridge (this engine)", port: 8787, listening: self, status: self ? "ok" : "fail", hint: self ? "" : "the bridge isn't listening on 8787 — nothing will load. If you see this page you're likely proxied; check the port." }];
}
function disk() {
    const root = path.resolve(__dirname, "..");
    try {
        const st = fs.statfsSync ? fs.statfsSync(root) : null;
        if (st) {
            const freeGB = +((st.bavail * st.bsize) / 1e9).toFixed(1);
            const totalGB = +((st.blocks * st.bsize) / 1e9).toFixed(1);
            const low = freeGB < 2;
            return { status: low ? "fail" : (freeGB < 8 ? "warn" : "ok"), path: root, freeGB, totalGB, hint: low ? "under 2 GB free — the update pull-guard will refuse new builds. Clear space." : "" };
        }
    } catch {}
    return { status: "warn", path: root, freeGB: null, totalGB: null, hint: "couldn't read free space on this platform." };
}
async function cameras() {
    // Best-effort: read go2rtc's configured streams and TCP-probe each host:port.
    let streams = {};
    try { const g = require("./go2rtcBridge.js"); const cfg = g.readConfig && g.readConfig(); if (cfg && cfg.ok && cfg.yaml) {
        // pull rtsp://host:port and http hosts out of the yaml loosely
        const urls = String(cfg.yaml).match(/\b(?:rtsp|http|https):\/\/[^\s"']+/g) || [];
        urls.forEach((u, i) => { try { const url = new URL(u); streams["cam" + i] = { host: url.hostname, port: url.port ? +url.port : (url.protocol === "rtsp:" ? 554 : (url.protocol === "https:" ? 443 : 80)) }; } catch {} });
    }} catch {}
    const names = Object.keys(streams);
    if (!names.length) return { status: "ok", configured: 0, cams: [], note: "no cameras configured (or go2rtc config unreadable)." };
    const cams = [];
    for (const n of names) { const s = streams[n]; const up = await _tcp(s.host, s.port, 2500); cams.push({ name: n, host: s.host, port: s.port, reachable: up, status: up ? "ok" : "fail", hint: up ? "" : "can't reach " + s.host + ":" + s.port + " — camera may be off, IP drifted (DHCP), or a firewall blocks it. Re-check the camera's current IP." }); }
    return { status: cams.every(c => c.reachable) ? "ok" : "fail", configured: names.length, cams };
}

// which physics backend the hybrid facade (physics/backend.js) would pick on THIS machine: box3d is the light
// default when its WASM is built, Jolt (an npm dep, always present) handles constraints/ragdolls/destructibles and
// is the fallback. Mirrors planBackend() so /doctor tells you the routing before any demo loads.
function physicsBackends() {
    const path = require("path");
    let box3dBuilt = false; try { box3dBuilt = fs.existsSync(path.join(__dirname, "..", "vendor", "box3d", "box3d.js")); } catch {}
    let joltAvailable = false; try { require.resolve("jolt-physics"); joltAvailable = true; } catch {}
    const light = box3dBuilt ? "box3d" : (joltAvailable ? "Jolt (box3d WASM not built)" : "none");
    const heavy = joltAvailable ? "Jolt" : "none";
    const status = joltAvailable ? (box3dBuilt ? "ok" : "warn") : "fail";
    // per-demo routing: each demo's declared needs -> the engine selectBackend would hand it on THIS machine
    const NEEDS = { "es-box3d": [], "es-hull-combat": [], "box3d-blobs": [], "blobulator-gpu": [], "jolt-arena": ["constraints", "destructible", "ragdolls"], "jolt-ragdoll": ["ragdolls"] };
    const JOLT_ONLY = ["constraints", "ragdolls", "vehicles", "destructible"];
    const demos = Object.keys(NEEDS).map((id) => { const need = NEEDS[id]; const heavyNeed = need.some((n) => JOLT_ONLY.includes(n)); const pick = heavyNeed ? (joltAvailable ? "jolt" : "none") : (box3dBuilt ? "box3d" : (joltAvailable ? "jolt" : "none")); return { id, needs: need, pick }; });
    return { name: "physics backends", box3dBuilt, joltAvailable, plan: { lightDemos: light, heavyDemos: heavy }, demos, status,
        hint: box3dBuilt ? "box3d built -> light demos use it; Jolt handles constraints/ragdolls/destructibles." : "box3d WASM not built here (build via box3d-info.html) -> light demos fall back to Jolt, which handles everything either way." };
}

async function run() {
    const bins = ["node", "ffmpeg", "git", "docker", "ollama", "go2rtc", "python3", "npm"];
    const [binResults, dae, prt, cam] = await Promise.all([
        Promise.all(bins.map(_binary)), daemons(), ports(), cameras(),
    ]);
    const report = {
        ok: true, when: new Date().toISOString(),
        system: systemInfo(), path: pathCheck(), binaries: binResults,
        daemons: dae, ports: prt, disk: disk(), cameras: cam, physics: physicsBackends(),
    };
    // roll up a summary
    let pass = 0, warn = 0, fail = 0;
    const tally = (s) => { if (s === "ok") pass++; else if (s === "fail") fail++; else warn++; };
    report.path.status && tally(report.path.status);
    binResults.forEach(b => tally(b.status));
    dae.forEach(d => tally(d.status));
    prt.forEach(p => tally(p.status));
    tally(report.disk.status);
    tally(report.cameras.status);
    tally(report.physics.status);
    report.summary = { pass, warn, fail };
    return report;
}

module.exports = { run };
