"use strict";
// v1286 — Govee smart-light control via the Govee Developer (Cloud) API.
// Get a free API key in the Govee Home app: Profile -> Settings -> "Apply for API Key"
// (emailed to you). Set it here (POST /govee/config {apiKey}) or via env GOVEE_API_KEY.
// The key stays server-side (govee.config.json, 0600). Cloud API is rate-limited
// (~10k/day, per-device throttle), so we cache the device list locally.
//
// API: base https://developer-api.govee.com, header Govee-API-Key
//   GET /v1/devices                 -> list
//   PUT /v1/devices/control {device,model,cmd:{name,value}}
//        cmd.name: "turn"(on|off) | "brightness"(0-100) | "color"({r,g,b}) | "colorTem"(2000-9000)
//   GET /v1/devices/state?device&model
const fs = require("fs"), path = require("path");
const CONFIG = path.join(__dirname, "govee.config.json");
const BASE = "https://developer-api.govee.com";

function load() { try { if (fs.existsSync(CONFIG)) return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {} return {}; }
function save(c) { try { fs.writeFileSync(CONFIG, JSON.stringify(c), { mode: 0o600 }); return true; } catch (e) { console.warn("[govee] config save:", e.message); return false; } }
function _key() { return String(process.env.GOVEE_API_KEY || load().apiKey || "").trim(); }
function _timeout(ms) { try { return AbortSignal.timeout(ms); } catch { return undefined; } }

function getConfig() { const c = load(); const k = _key(); return { ok: true, keySet: !!k, envKey: !!process.env.GOVEE_API_KEY, devices: c.devices || [] }; }
function setConfig(d) { const c = load(); if (d && typeof d.apiKey === "string") c.apiKey = d.apiKey.trim(); save(c); return getConfig(); }

async function _api(method, p, body) {
    const key = _key(); if (!key) return { ok: false, error: "no Govee API key — set one in the Govee Home app, then save it here" };
    try {
        const r = await fetch(BASE + p, { method, headers: { "Govee-API-Key": key, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: _timeout(7000) });
        let j = {}; try { j = await r.json(); } catch {}
        if (!r.ok) return { ok: false, error: "govee http " + r.status + (j && j.message ? " — " + j.message : ""), body: j };
        return { ok: true, body: j };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function _normalize(devs) {
    return (devs || []).map(d => ({ device: d.device, model: d.model, name: d.deviceName || d.device, controllable: d.controllable !== false, retrievable: !!d.retrievable, cmds: d.supportCmds || [] }));
}

async function devices() {
    const r = await _api("GET", "/v1/devices");
    if (!r.ok) return r;
    const list = _normalize((r.body && r.body.data && r.body.data.devices) || []);
    const c = load(); c.devices = list; save(c);
    return { ok: true, count: list.length, devices: list };
}
async function status() {
    const key = _key();
    if (!key) return { ok: false, configured: false, keySet: false };
    const r = await devices();
    if (!r.ok) return { ok: false, configured: true, keySet: true, error: r.error };
    return { ok: true, configured: true, keySet: true, count: r.count, devices: r.devices };
}

function _resolve(deviceOrName) {
    const list = load().devices || [];
    return list.find(x => x.device === deviceOrName) ||
           list.find(x => String(x.name || "").toLowerCase() === String(deviceOrName || "").toLowerCase()) || null;
}
async function control(deviceOrName, cmd) {
    const d = _resolve(deviceOrName);
    if (!d) return { ok: false, error: "unknown device — scan first so the model is cached, or pass an exact device id" };
    if (!d.controllable) return { ok: false, error: "device not controllable" };
    return _api("PUT", "/v1/devices/control", { device: d.device, model: d.model, cmd });
}
function power(deviceOrName, on) { return control(deviceOrName, { name: "turn", value: on ? "on" : "off" }); }
function brightness(deviceOrName, pct) { return control(deviceOrName, { name: "brightness", value: Math.max(0, Math.min(100, Math.round(+pct || 0))) }); }
function color(deviceOrName, rgb) { rgb = rgb || {}; return control(deviceOrName, { name: "color", value: { r: (rgb.r | 0), g: (rgb.g | 0), b: (rgb.b | 0) } }); }
function colorTem(deviceOrName, k) { return control(deviceOrName, { name: "colorTem", value: Math.max(2000, Math.min(9000, k | 0)) }); }

// Set every controllable device to a color (used for engine alert flashes / mood).
async function allColor(rgb, bri) {
    const list = (load().devices || []).filter(x => x.controllable);
    const results = [];
    for (const d of list) {
        if (bri != null) { try { await control(d.device, { name: "brightness", value: Math.max(0, Math.min(100, Math.round(bri))) }); } catch (e) {} }
        results.push(await control(d.device, { name: "color", value: { r: (rgb.r | 0), g: (rgb.g | 0), b: (rgb.b | 0) } }));
    }
    return { ok: true, count: list.length, results };
}

module.exports = { getConfig, setConfig, status, devices, control, power, brightness, color, colorTem, allColor };
