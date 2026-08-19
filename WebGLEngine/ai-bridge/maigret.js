// ai-bridge/maigret.js — v1025
// Thin wrapper around Maigret (github.com/soxoj/maigret) — searches a username
// across hundreds of sites and returns the claimed accounts. Maigret is a Python
// CLI; this spawns `python -m maigret <user> --json simple` into a temp folder and
// reads the report. Install on the rig: pip install maigret  (then detect()).

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PY = process.env.MAIGRET_PY || (process.platform === "win32" ? "python" : "python3");

function run(args, timeoutMs) {
    return new Promise((resolve) => {
        let out = "", err = "", child, done = false;
        const t = setTimeout(() => { if (done) return; done = true; try { child && child.kill("SIGKILL"); } catch {} resolve({ code: -2, out, err: err + " [timeout]" }); }, timeoutMs || 20000);
        try { child = spawn(PY, args, { windowsHide: true }); }
        catch (e) { clearTimeout(t); return resolve({ code: -1, out: "", err: "spawn failed: " + e.message }); }
        child.stdout.on("data", d => out += d);
        child.stderr.on("data", d => err += d);
        child.on("error", e => { if (done) return; done = true; clearTimeout(t); resolve({ code: -1, out, err: String(e && e.message) }); });
        child.on("close", code => { if (done) return; done = true; clearTimeout(t); resolve({ code, out, err }); });
    });
}

async function detect() {
    const r = await run(["-m", "maigret", "--version"], 15000);
    const txt = ((r.out || "") + (r.err || "")).trim();
    const ok = r.code === 0 || /maigret/i.test(txt);
    return { ok, installed: ok, version: txt.slice(0, 80), py: PY, hint: ok ? "" : "pip install maigret" };
}

function _validUser(u) { return /^[A-Za-z0-9._-]{1,64}$/.test(u || ""); }

// search({username, timeout, top}) -> {ok, username, count, found:[{site,url}]}
async function search({ username = "", timeout = 15, top = 0 } = {}) {
    username = String(username || "").trim();
    if (!_validUser(username)) return { ok: false, error: "invalid username (letters, digits, . _ - only)" };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maigret_"));
    const args = ["-m", "maigret", username, "--no-progressbar", "--timeout", String(timeout), "-J", "simple", "--folderoutput", dir];
    if (top > 0) args.push("--top-sites", String(top));
    const r = await run(args, Math.max(30000, timeout * 1000 * 30));
    let found = [];
    try {
        const file = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => /simple.*\.json$/i.test(f));
        if (file) {
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            const sites = Array.isArray(data) ? data : Object.entries(data).map(([site, info]) => Object.assign({ site }, info));
            for (const s of sites) {
                const status = String(s.status || (s.status_code === 200 ? "claimed" : "") || "").toLowerCase();
                const url = s.url_user || s.url || (s.status && s.status.url) || "";
                if (url && /claim|found|exist/.test(status)) found.push({ site: s.site || s.sitename || "", url });
            }
        }
    } catch (e) { /* fall through with whatever we parsed */ }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    if (!found.length && r.code !== 0) return { ok: false, error: (r.err || "maigret failed; is it installed? pip install maigret").slice(0, 300) };
    return { ok: true, username, count: found.length, found, note: "Maigret report parsing may need a tweak to your installed version's JSON shape." };
}

async function install() {
    const r = await run(["-m", "pip", "install", "-U", "maigret"], 900000);
    const ok = r.code === 0;
    return { ok, step: "pkg", stdout: (r.out || "").slice(-1200), stderr: (r.err || "").slice(-1200), hint: ok ? "" : "pip install maigret failed — check the bridge python/pip" };
}

module.exports = { detect, search, install };
