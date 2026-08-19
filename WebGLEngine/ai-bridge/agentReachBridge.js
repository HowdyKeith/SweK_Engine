// ai-bridge/agentReachBridge.js — v1548
// Front-end Agent-Reach (github.com/Panniantong/Agent-Reach, MIT) FROM the engine.
//
// Agent-Reach is an INSTALLER + DOCTOR + ROUTER, NOT a wrapper: after `agent-reach install`,
// reads happen by calling upstream tools directly (gh, yt-dlp, Jina Reader, Reddit JSON, ...).
// So this bridge does three honest things:
//   1) status()  -> runs `agent-reach doctor` (which channels are wired up)
//   2) install() -> pip install the agent-reach CLI (full channel setup is `agent-reach install`
//                   in a terminal, since it installs system tools and can prompt)
//   3) reach(channel, query) -> the NO-LOGIN channels work immediately by calling the upstream
//                   source directly (exactly Agent-Reach's philosophy): web (Jina Reader),
//                   reddit (public JSON), github (public REST), youtube (yt-dlp if present).
//                   Cookie/login channels (twitter, xiaohongshu, ...) are deferred to Doctor.
// Config in ~/.voxelbridge/agentreach.json {py}.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const IS_WIN = process.platform === "win32";
const CFG_DIR = path.join(os.homedir(), ".voxelbridge");
const CFG = path.join(CFG_DIR, "agentreach.json");
const BUILTIN = ["web", "reddit", "github", "youtube"];   // no-login, work immediately
const UA = "voxelbridge-agent-reach/1.0";

function load() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")) || {}; } catch { return {}; } }
function save(o) { try { fs.mkdirSync(CFG_DIR, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(o, null, 2)); } catch {} }
function getConfig() { return { ok: true, config: load(), builtins: BUILTIN }; }
function setConfig(p) { const c = load(); if (p && p.py != null) c.py = String(p.py).trim(); save(c); return { ok: true, config: c }; }

function _pyCandidates() {
    const out = []; const c = load();
    if (c.py && fs.existsSync(c.py)) out.push(c.py);
    const venv = process.env.VOXEL_VENV_PY; if (venv && fs.existsSync(venv)) out.push(venv);
    for (const base of ["C:\\VoxelBAK\\ComfyUI_windows_portable", "C:\\ComfyUI_windows_portable"]) {
        const p = path.join(base, "python_embeded", "python.exe");
        try { if (fs.existsSync(p)) out.push(p); } catch {}
    }
    out.push(IS_WIN ? "python" : "python3");
    if (IS_WIN) out.push("py");
    return [...new Set(out)];
}

function spawnP(cmd, args, opts) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, out, err: "timeout" }); }, (opts && opts.timeout) || 60000);
        try { child = spawn(cmd, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, out: "", err: cmd + " spawn: " + e.message }); }
        child.stdout.on("data", d => { out += d; });
        child.stderr.on("data", d => { err += d; });
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, out, err: cmd + ": " + e.message }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, out, err: (err || "").trim() }); });
    });
}

async function _doctorRaw() {
    // console script first, then python -m fallback
    let r = await spawnP("agent-reach", ["doctor"], { timeout: 30000 });
    if (r.code === -1 || r.code === -2) {
        for (const py of _pyCandidates()) { const rr = await spawnP(py, ["-m", "agent_reach", "doctor"], { timeout: 30000 }); if (rr.code === 0) { const c = load(); c.py = py; save(c); return rr; } }
    }
    return r;
}

async function status() {
    const r = await _doctorRaw();
    const installed = r.code === 0;
    const raw = ((r.out || "") + (r.code !== 0 ? ("\n" + (r.err || "")) : "")).trim();
    // parse channel lines like "✅ github ..." / "⚠️ twitter ..." loosely
    const channels = [];
    raw.split(/\r?\n/).forEach(line => {
        const m = line.match(/([\u2705\u26a0\u2b1c\ufe0f\s]*?)\s*([a-zA-Z][a-zA-Z0-9/_\- ]{1,24})\b/);
        const ready = /\u2705/.test(line);
        const warn = /\u26a0/.test(line);
        if ((ready || warn) && m) channels.push({ ready, name: (m[2] || "").trim().toLowerCase().split(/\s|\(/)[0] });
    });
    return { ok: true, installed, builtins: BUILTIN, channels, raw: raw.slice(0, 1500) };
}

async function install() {
    const cands = _pyCandidates(); let py = "";
    for (const cd of cands) { const r = await spawnP(cd, ["--version"], { timeout: 8000 }); if (r.code === 0) { py = cd; break; } }
    if (!py) return { ok: false, error: "no Python found (tried: " + cands.join(", ") + ")" };
    const r = await spawnP(py, ["-m", "pip", "install", "--upgrade", "agent-reach"], { timeout: 1800000 });
    if (r.code !== 0) return { ok: false, py, error: ((r.err || r.out || "pip install failed") + "").slice(-500) };
    const c = load(); c.py = py; save(c);
    return { ok: true, py, note: "CLI installed. For login channels run 'agent-reach install --env=auto' then per-channel login in a terminal (see Doctor)." };
}

async function _get(url, headers, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 30000);
    try {
        const r = await fetch(url, { headers: Object.assign({ "User-Agent": UA }, headers || {}), signal: ac.signal });
        const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
        return { ok: r.ok, status: r.status, text, json };
    } finally { clearTimeout(t); }
}

// reach(channel, query) — the no-login channels run immediately.
async function reach(channel, query) {
    channel = String(channel || "").toLowerCase().trim();
    query = String(query || "").trim();
    if (!query) return { ok: false, error: "no query/url" };

    if (channel === "web") {
        // Jina Reader: clean markdown of any page. https://r.jina.ai/<url>
        let u = query; if (!/^https?:\/\//i.test(u)) u = "https://" + u;
        const r = await _get("https://r.jina.ai/" + u, { "Accept": "text/markdown" }, 45000).catch(e => ({ ok: false, status: 0, text: String((e && e.message) || e) }));
        if (!r.ok) return { ok: false, error: "Jina Reader HTTP " + r.status };
        return { ok: true, channel, markdown: r.text || "", chars: (r.text || "").length, url: u };
    }
    if (channel === "reddit") {
        const r = await _get("https://www.reddit.com/search.json?limit=12&q=" + encodeURIComponent(query)).catch(e => ({ ok: false, status: 0 }));
        if (!r.ok || !r.json) return { ok: false, error: "Reddit HTTP " + r.status + " (may be IP-blocked on a server \u2014 set a proxy via agent-reach, or use locally)" };
        const kids = (r.json.data && r.json.data.children) || [];
        const results = kids.map(k => k.data).filter(Boolean).map(d => ({ title: d.title, url: "https://reddit.com" + (d.permalink || ""), subreddit: d.subreddit_name_prefixed || ("r/" + d.subreddit), ups: d.ups }));
        return { ok: true, channel, results };
    }
    if (channel === "github") {
        const r = await _get("https://api.github.com/search/repositories?per_page=10&sort=stars&q=" + encodeURIComponent(query), { "Accept": "application/vnd.github+json" }).catch(e => ({ ok: false, status: 0 }));
        if (!r.ok || !r.json) return { ok: false, error: "GitHub API HTTP " + r.status };
        const results = (r.json.items || []).map(it => ({ title: it.full_name, url: it.html_url, stars: it.stargazers_count, desc: it.description || "" }));
        return { ok: true, channel, results };
    }
    if (channel === "youtube") {
        // needs yt-dlp (installed by `agent-reach install`); treat query as a URL
        const r = await spawnP("yt-dlp", ["--dump-json", "--no-warnings", "--skip-download", query], { timeout: 60000 });
        if (r.code !== 0) return { ok: false, error: "yt-dlp not available or failed \u2014 run agent-reach install to set up YouTube (Doctor shows status)" };
        let j = null; try { j = JSON.parse((r.out || "").split(/\r?\n/)[0] || "{}"); } catch {}
        if (!j) return { ok: false, error: "couldn't parse yt-dlp output" };
        return { ok: true, channel, title: j.title || "", uploader: j.uploader || "", duration: j.duration || 0, url: j.webpage_url || query, description: (j.description || "").slice(0, 2000) };
    }
    return { ok: false, error: "channel '" + channel + "' needs agent-reach setup + login \u2014 press Install, run 'agent-reach install', then check Doctor. No-login channels: " + BUILTIN.join(", ") };
}

module.exports = { getConfig, setConfig, status, install, reach, BUILTIN };
