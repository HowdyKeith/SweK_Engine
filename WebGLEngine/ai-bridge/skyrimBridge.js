// skyrimBridge.js — v1248
// Live Skyrim SE/AE player telemetry via the "option 3" no-compile path: a small
// in-game Papyrus script (using PapyrusUtil's JsonUtil) writes player stats to a JSON
// file on a timer, and this bridge reads that file. No SKSE C++ plugin to compile, no
// external server — just a file the game writes and we poll.
//
// On the rig: install PapyrusUtil SE, drop the SweK_Telemetry.psc/.pex script + a tiny
// quest that runs it on a timer (scaffold in ai-bridge/skyrim-extension/), and point
// cfg.filePath at the JSON it writes (default below, under My Games). Read-only.
// Disabled by default.

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const CFG_PATH = path.join(__dirname, "skyrim.json");
let cfg = {
    enabled: false,
    // Default guess: PapyrusUtil JsonUtil writes under the game's Data or the user's
    // My Games dir. Set this to wherever the script writes (see the extension README).
    filePath: path.join(os.homedir(), "Documents", "My Games", "Skyrim Special Edition", "SKSE", "swek_telemetry.json"),
    pollMs: 2000,
    staleMs: 15000,
};
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let state = null, lastUpdate = 0, lastError = null, lastMtime = 0, timer = null;
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

const num = v => (typeof v === "number" && isFinite(v)) ? v
    : (typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

function normalize(j) {
    if (!j || typeof j !== "object") return { raw: j };
    const p = j.player || j;
    return {
        name:     p.name || j.name || null,
        level:    num(p.level ?? j.level),
        health:   num(p.health ?? j.health),
        healthMax:num(p.healthMax ?? j.healthMax),
        magicka:  num(p.magicka ?? j.magicka),
        magickaMax:num(p.magickaMax ?? j.magickaMax),
        stamina:  num(p.stamina ?? j.stamina),
        staminaMax:num(p.staminaMax ?? j.staminaMax),
        gold:     num(p.gold ?? j.gold),
        location: p.location || j.location || j.cell || null,
        raw: j,
    };
}

function readOnce() {
    try {
        if (!fs.existsSync(cfg.filePath)) { lastError = "file not found: " + cfg.filePath; return; }
        const st = fs.statSync(cfg.filePath);
        if (st.mtimeMs === lastMtime && state) return;        // unchanged
        lastMtime = st.mtimeMs;
        const txt = fs.readFileSync(cfg.filePath, "utf8");
        let j; try { j = JSON.parse(txt); } catch (e) { lastError = "bad json in telemetry file"; return; }
        state = normalize(j); lastUpdate = Date.now(); lastError = null;
    } catch (e) { lastError = String(e && e.message || e); }
}

function start(opts) {
    if (opts && typeof opts.log === "function") setLogger(opts.log);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (cfg.enabled) readOnce(); }, Math.max(1000, cfg.pollMs || 2000));
    if (cfg.enabled) readOnce();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

function fresh() { return lastUpdate > 0 && (Date.now() - lastUpdate) < (cfg.staleMs || 15000); }
function getState() {
    const ready = !!state && fresh();
    return { connected: ready, ready, filePath: cfg.filePath, at: Date.now(),
             ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError, data: ready ? state : null };
}
function status() {
    return { enabled: cfg.enabled, filePath: cfg.filePath, connected: fresh(),
             lastUpdate, ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError };
}
async function detect() {
    let exists = false; try { exists = fs.existsSync(cfg.filePath); } catch {}
    return { ok: true, running: fresh(), fileExists: exists, filePath: cfg.filePath, ageMs: lastUpdate ? Date.now() - lastUpdate : null };
}
function getConfig() { return JSON.parse(JSON.stringify(cfg)); }
function setConfig(next) {
    if (next && typeof next === "object") {
        if (typeof next.enabled === "boolean") cfg.enabled = next.enabled;
        if (typeof next.filePath === "string" && next.filePath.trim()) { cfg.filePath = next.filePath.trim(); lastMtime = 0; }
        if (Number.isFinite(next.pollMs)) cfg.pollMs = Math.max(1000, next.pollMs | 0);
        if (Number.isFinite(next.staleMs)) cfg.staleMs = Math.max(2000, next.staleMs | 0);
    }
    saveCfg();
    if (cfg.enabled) readOnce();
    if (!cfg.enabled) { state = null; lastUpdate = 0; }
    return getConfig();
}

module.exports = { start, stop, getState, status, getConfig, setConfig, detect, setLogger };
