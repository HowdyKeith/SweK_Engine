// ps3Bridge.js — v1263
// Outbound control of a JAILBROKEN PS3 (CFW/HEN) running webMAN MOD, over its HTTP web
// command interface. webMAN MOD runs a web server (default port 80) that accepts remote
// commands as plain HTTP GETs (sendable from any device on the LAN). This bridge fires
// those commands on the user's behalf.
//
// Requires: a PS3 with CFW/HEN + webMAN MOD on the same LAN. A STOCK PS3 has no such API
// (only DLNA media playback) — nothing here will work on one. Disabled by default; the
// user sets host/port + enables it via POST /ps3/config.
//
// Well-documented web commands used: /reboot.ps3 /rebuild.ps3 /recovery.ps3 /play.ps3
// and /ps3mapi.ps3?<cmd> (returns JSON). Anything else goes through the raw passthrough.
// Bun on Windows binds IPv4 — but here we talk OUT to the PS3's LAN IP, so that's moot.

const fs   = require("fs");
const path = require("path");

const CFG_PATH = path.join(__dirname, "ps3.json");
let cfg = { enabled: false, host: "", port: 80, timeoutMs: 4000 };
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let lastError = null, lastReachable = null, lastSeen = 0;
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

function base() { return "http://" + cfg.host + ":" + (cfg.port || 80); }
function ready() { return !!(cfg.enabled && cfg.host); }

// Fire a single web command (path beginning with "/"). Returns {ok, status, text}.
async function cmd(p) {
    if (!ready()) return { ok: false, error: "ps3 bridge disabled or host unset" };
    const url = base() + (p.startsWith("/") ? p : "/" + p);
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs || 4000) });
        const text = await r.text().catch(() => "");
        lastReachable = true; lastSeen = Date.now(); lastError = null;
        return { ok: r.ok, status: r.status, text: text.slice(0, 2000), url };
    } catch (e) {
        lastReachable = false; lastError = String(e && e.message || e);
        return { ok: false, error: lastError, url };
    }
}

// Named convenience commands (webMAN web-commands).
const reboot   = () => cmd("/reboot.ps3");
const rebuild  = () => cmd("/rebuild.ps3");
const recovery = () => cmd("/recovery.ps3");
const play     = () => cmd("/play.ps3");
// On-screen popup — exact syntax is webMAN-version dependent; best-effort, raw covers the rest.
const notify   = (msg) => cmd("/popup.ps3*" + encodeURIComponent(String(msg || "SweK Engine")));
// PS3MAPI passthrough — returns JSON per webMAN docs.
async function mapi(command) {
    const r = await cmd("/ps3mapi.ps3?" + String(command || ""));
    if (r.ok && r.text) { try { r.json = JSON.parse(r.text); } catch {} }
    return r;
}
const raw = (p) => cmd(p);

// Dispatch a control action by name (used by POST /ps3/cmd).
async function action(name, arg) {
    switch (String(name || "")) {
        case "reboot":   return reboot();
        case "rebuild":  return rebuild();
        case "recovery": return recovery();
        case "play":     return play();
        case "notify":   return notify(arg);
        case "mapi":     return mapi(arg);
        case "raw":      return raw(String(arg || "/"));
        default:         return { ok: false, error: "unknown action: " + name };
    }
}

// Reachability probe (root page).
async function detect() {
    if (!cfg.host) return { ok: false, error: "host unset" };
    const r = await cmd("/");
    return { ok: r.ok, reachable: lastReachable, host: cfg.host, port: cfg.port, error: r.error || null };
}

function status() { return { ok: true, enabled: cfg.enabled, host: cfg.host, port: cfg.port, reachable: lastReachable, lastSeen, lastError }; }
function getConfig() { return { enabled: cfg.enabled, host: cfg.host, port: cfg.port, timeoutMs: cfg.timeoutMs }; }
function setConfig(patch) {
    if (!patch || typeof patch !== "object") return getConfig();
    if (typeof patch.enabled === "boolean") cfg.enabled = patch.enabled;
    if (typeof patch.host === "string") cfg.host = patch.host.trim().replace(/[^0-9a-zA-Z.\-]/g, "");
    if (Number.isFinite(patch.port)) cfg.port = patch.port | 0;
    if (Number.isFinite(patch.timeoutMs)) cfg.timeoutMs = Math.max(500, Math.min(20000, patch.timeoutMs | 0));
    saveCfg(); log("[ps3] config: " + (cfg.enabled ? "enabled " : "disabled ") + cfg.host + ":" + cfg.port);
    return getConfig();
}
function start() { if (cfg.enabled && cfg.host) log("[ps3] webMAN control armed -> " + base()); }
function stop() {}

module.exports = { start, stop, status, detect, action, cmd, mapi, getConfig, setConfig, setLogger };
