// ai-bridge/wledBridge.js — v1115
// Speculative-ready WLED control. WLED exposes an HTTP JSON API:
//   POST http://<ip>/json/state   — set on/bri/segment colour/effect
//   GET  http://<ip>/json/info    — device name, version, LED count
// The device IP lives at ~/.voxelbridge/wled.json. With no IP configured every
// call no-ops cleanly ({ok:false,...}) — so this ships ready and you just point
// it at a strip later.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG = process.env.WLED_CONFIG || path.join(os.homedir(), ".voxelbridge", "wled.json");

function load() { try { if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {} return {}; }
function save(c) { try { fs.mkdirSync(path.dirname(CONFIG), { recursive: true }); fs.writeFileSync(CONFIG, JSON.stringify(c), { mode: 0o600 }); return true; } catch (e) { console.warn("[wled] config save:", e.message); return false; } }

function getConfig() { const c = load(); return { ok: true, ip: c.ip || "", hasDevice: !!c.ip }; }
function setConfig(d) {
    const c = load();
    if (typeof d.ip === "string") c.ip = d.ip.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    save(c);
    return getConfig();
}

function _timeout(ms) { try { return AbortSignal.timeout(ms); } catch { return undefined; } }

async function _post(stateObj) {
    const c = load();
    if (!c.ip) return { ok: false, error: "no WLED device configured" };
    try {
        const r = await fetch(`http://${c.ip}/json/state`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stateObj), signal: _timeout(4000),
        });
        if (!r.ok) return { ok: false, error: "wled http " + r.status };
        return { ok: true };
    } catch (e) { return { ok: false, error: (e && e.message) || "wled unreachable" }; }
}

async function info() {
    const c = load();
    if (!c.ip) return { ok: false, error: "no WLED device configured" };
    try {
        const r = await fetch(`http://${c.ip}/json/info`, { signal: _timeout(4000) });
        if (!r.ok) return { ok: false, error: "http " + r.status };
        const j = await r.json();
        return { ok: true, name: j.name, ver: j.ver, leds: j.leds && j.leds.count, ip: c.ip };
    } catch (e) { return { ok: false, error: (e && e.message) || "unreachable" }; }
}

const clamp = (n, hi = 255) => Math.max(0, Math.min(hi, n | 0));

function setColor(rgb, bri) {
    const col = Array.isArray(rgb) ? rgb.slice(0, 3).map(n => clamp(n)) : [255, 255, 255];
    const st = { on: true, seg: [{ col: [col] }] };
    if (typeof bri === "number") st.bri = clamp(bri);
    return _post(st);
}

function setEffect(d = {}) {
    const seg = {};
    if (d.fx != null) seg.fx = d.fx | 0;
    if (d.sx != null) seg.sx = clamp(d.sx);
    if (d.ix != null) seg.ix = clamp(d.ix);
    if (d.pal != null) seg.pal = d.pal | 0;
    if (Array.isArray(d.col)) seg.col = [d.col.slice(0, 3).map(n => clamp(n))];
    const st = { on: true, seg: [seg] };
    if (typeof d.bri === "number") st.bri = clamp(d.bri);
    return _post(st);
}

function power(on) { return _post({ on: !!on }); }
function raw(stateObj) { return _post(stateObj && typeof stateObj === "object" ? stateObj : {}); }

module.exports = { getConfig, setConfig, info, setColor, setEffect, power, raw };
