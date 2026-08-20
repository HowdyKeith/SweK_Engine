// x4Bridge.js — v1244
// Live X4: Foundations telemetry, in the same mold as falloutBridge / starfieldBridge.
//
// X4 has NO built-in telemetry endpoint (unlike Fallout's companion-app protocol or
// Starfield's SFSE console). You read it through a community mod. This connector
// supports BOTH current paths (cfg.mode):
//
//   "push" (default, self-contained): a small X4 extension we ship (using djfhe's
//      x4_http mod) POSTs a JSON snapshot to the bridge at  POST /x4/state  on a
//      timer. We just store the latest snapshot — no third-party server to run.
//
//   "poll": we GET a JSON feed from mycumycu's "X4 External App" server
//      (default http://127.0.0.1:8080/). Point cfg.pollUrl at its data endpoint.
//
// Either way, in X4: Settings -> Extensions -> turn OFF "Protected UI Mode".
// Read-only, local, single-player; disabled by default.

const fs   = require("fs");
const path = require("path");

const CFG_PATH = path.join(__dirname, "x4.json");
let cfg = {
    enabled: false,
    mode:    "push",                       // "push" | "poll"
    pollUrl: "http://127.0.0.1:8080/",     // mycumycu X4 External App (set to its JSON/data path)
    pollMs:  3000,
    staleMs: 15000,                        // data older than this counts as "no link"
};
try { if (fs.existsSync(CFG_PATH)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CFG_PATH, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2)); } catch {} }

let feed = null;                  // last normalized snapshot (always carries .raw)
let lastUpdate = 0, source = null, lastError = null;
let timer = null, polling = false;
let log = () => {};
function setLogger(fn) { if (typeof fn === "function") log = fn; }

const num = v => (typeof v === "number" && isFinite(v)) ? v
    : (typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

// Best-effort map of whatever the mod sends into a stable shape. Field names vary by
// source (mycumycu vs our own push extension), so we probe a few and ALWAYS keep .raw
// so the view can dig into anything we didn't map.
function normalize(j) {
    if (!j || typeof j !== "object") return { raw: j };
    const p = j.player || j.playerInfo || j.pilot || {};
    const ship = j.ship || j.playerShip || p.ship || {};
    const list = a => Array.isArray(a) ? a : null;
    return {
        player:     p.name || j.playerName || j.name || null,
        money:      num(j.money ?? j.credits ?? p.money ?? p.credits),
        ship:       ship.name || j.shipName || null,
        shipHull:   num(ship.hull   ?? j.hull),
        shipShield: num(ship.shield ?? j.shield),
        sector:     j.sector || j.location || j.system || p.sector || null,
        playtime:   j.playtime || j.playTime || null,
        missions:   list(j.missions),
        logbook:    list(j.logbook) ? list(j.logbook).slice(0, 8) : null,
        factions:   list(j.factions),
        raw: j,
    };
}

// push path — called by POST /x4/state with the snapshot body.
function ingest(obj) {
    try { feed = normalize(obj); source = "push"; lastUpdate = Date.now(); lastError = null; return true; }
    catch (e) { lastError = String(e && e.message || e); return false; }
}

async function fetchJson(url, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 4000);
    try {
        const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
        const txt = await r.text();
        try { return JSON.parse(txt); } catch { return { raw: txt }; }
    } finally { clearTimeout(t); }
}

async function pollOnce() {
    if (polling || cfg.mode !== "poll") return; polling = true;
    try { const j = await fetchJson(cfg.pollUrl, 4000); feed = normalize(j); source = "poll"; lastUpdate = Date.now(); lastError = null; }
    catch (e) { lastError = String(e && e.message || e); }
    finally { polling = false; }
}

async function detect() {
    if (cfg.mode === "poll") {
        try { await fetchJson(cfg.pollUrl, 3000); return { ok: true, running: true, mode: "poll", url: cfg.pollUrl }; }
        catch (e) { return { ok: true, running: false, mode: "poll", url: cfg.pollUrl, error: String(e && e.message || e) }; }
    }
    return { ok: true, running: fresh(), mode: "push", ageMs: lastUpdate ? Date.now() - lastUpdate : null };
}

function start(opts) {
    if (opts && typeof opts.log === "function") setLogger(opts.log);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (cfg.enabled && cfg.mode === "poll") pollOnce(); }, Math.max(1000, cfg.pollMs || 3000));
    if (cfg.enabled && cfg.mode === "poll") pollOnce();
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

function fresh() { return lastUpdate > 0 && (Date.now() - lastUpdate) < (cfg.staleMs || 15000); }
function getState() {
    const ready = !!feed && fresh();
    return { connected: ready, ready, mode: cfg.mode, source, at: Date.now(),
             ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError, data: ready ? feed : null };
}
function status() {
    return { enabled: cfg.enabled, mode: cfg.mode, pollUrl: cfg.pollUrl, source,
             connected: fresh(), lastUpdate, ageMs: lastUpdate ? Date.now() - lastUpdate : null, error: lastError };
}
function getConfig() { return JSON.parse(JSON.stringify(cfg)); }
function setConfig(next) {
    if (next && typeof next === "object") {
        if (typeof next.enabled === "boolean") cfg.enabled = next.enabled;
        if (next.mode === "push" || next.mode === "poll") cfg.mode = next.mode;
        if (typeof next.pollUrl === "string" && next.pollUrl.trim()) cfg.pollUrl = next.pollUrl.trim();
        if (Number.isFinite(next.pollMs))  cfg.pollMs  = Math.max(1000, next.pollMs | 0);
        if (Number.isFinite(next.staleMs)) cfg.staleMs = Math.max(2000, next.staleMs | 0);
    }
    saveCfg();
    if (cfg.enabled && cfg.mode === "poll") pollOnce();
    if (!cfg.enabled) { feed = null; lastUpdate = 0; source = null; }
    return getConfig();
}

module.exports = { start, stop, getState, status, getConfig, setConfig, ingest, detect, setLogger };
