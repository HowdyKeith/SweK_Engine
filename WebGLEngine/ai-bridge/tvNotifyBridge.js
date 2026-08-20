// ai-bridge/tvNotifyBridge.js — v1868
// Auto-toast engine events onto an Android TV (Shield) via HA notify.<service>.
// Config in ~/.voxelbridge/tvnotify.json (0600). Server.js wires a `notify(service, message, title, data)`
// sender (haBridge.notifyTv, or a peer proxy) and calls onEvent(event, detail) next to the SAME points
// that fire ballAlerts — newEmail, genDone, arrival, haAlert, consoleError, plus SweK-specific
// driveUpdate / updatePushed. Each event has its own on/off + message template. Additive: off by default.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CFG = process.env.TVNOTIFY_CONFIG || path.join(os.homedir(), ".voxelbridge", "tvnotify.json");

// events the engine can toast, with default templates. {n} etc. are filled from the fire() detail.
const EVENTS = ["newEmail", "genDone", "arrival", "haAlert", "consoleError", "driveUpdate", "updatePushed"];
const DEFAULTS = {
    enabled: false,
    service: "",          // notify.<service> target (the TV). Empty = pick first TV-looking one at fire time.
    duration: 6,
    position: "bottom-right",
    color: "",
    events: {
        newEmail:     { on: true,  title: "SweK", tmpl: "New mail{n? (+{n})}" },
        genDone:      { on: true,  title: "SweK", tmpl: "Generation complete" },
        arrival:      { on: true,  title: "SweK", tmpl: "{name?{name} is home:Someone is home}" },
        haAlert:      { on: false, title: "SweK", tmpl: "Home Assistant alert" },
        consoleError: { on: false, title: "SweK", tmpl: "Engine error logged" },
        driveUpdate:  { on: true,  title: "SweK", tmpl: "Update pulled from Drive {v}" },
        updatePushed: { on: true,  title: "SweK", tmpl: "Update pushed to {n?{n} peer(s):peers} — restarting" },
    },
};

let _notify = null;     // (service, message, title, data) -> Promise; injected by server.js
let _pickTv = null;     // () -> Promise<service>  (first TV-looking notify service); injected by server.js
function init(deps) { deps = deps || {}; if (typeof deps.notify === "function") _notify = deps.notify; if (typeof deps.pickTv === "function") _pickTv = deps.pickTv; }

function load() { try { if (fs.existsSync(CFG)) return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch {} return {}; }
function save(c) { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); return true; } catch (e) { return false; } }
function getConfig() {
    const over = load(); const out = JSON.parse(JSON.stringify(DEFAULTS));
    if (typeof over.enabled === "boolean") out.enabled = over.enabled;
    for (const k of ["service", "position", "color"]) if (typeof over[k] === "string") out[k] = over[k];
    if (over.duration != null) out.duration = Math.max(1, parseInt(over.duration, 10) || 6);
    if (over.events) for (const e of EVENTS) if (over.events[e]) out.events[e] = Object.assign({}, out.events[e], over.events[e]);
    return out;
}
function setConfig(d) {
    d = d || {}; const c = getConfig();
    if (typeof d.enabled === "boolean") c.enabled = d.enabled;
    for (const k of ["service", "position", "color"]) if (typeof d[k] === "string") c[k] = d[k];
    if (d.duration != null) c.duration = Math.max(1, parseInt(d.duration, 10) || 6);
    if (d.events) for (const e of EVENTS) if (d.events[e]) c.events[e] = Object.assign({}, c.events[e], d.events[e]);
    save(c); return getConfig();
}

// tiny template: {key} inserts detail[key]; {key?A:B} = A if truthy else B; {key?...{key}...} allowed.
// {n? (+{n})} -> " (+3)" when n=3, "" when falsy.
function _fill(tmpl, detail) {
    detail = detail || {};
    return String(tmpl || "").replace(/\{(\w+)\?([^:{}]*(?:\{\1\}[^:{}]*)*)(?::([^{}]*))?\}/g, (m, key, ifPart, elsePart) => {
        const v = detail[key];
        if (v != null && v !== "" && v !== 0 && v !== false) return ifPart.replace(new RegExp("\\{" + key + "\\}", "g"), String(v));
        return elsePart != null ? elsePart : "";
    }).replace(/\{(\w+)\}/g, (m, key) => (detail[key] != null ? String(detail[key]) : ""));
}

let _lastFire = {};     // per-event debounce so a burst doesn't spam the TV
async function onEvent(event, detail) {
    try {
        if (!_notify) return { ok: false, error: "no notify sender wired" };
        const c = getConfig();
        if (!c.enabled) return { ok: false, skipped: "disabled" };
        const ev = c.events[event];
        if (!ev || !ev.on) return { ok: false, skipped: "event off" };
        // debounce: at most one toast per event per 8s
        const now = Date.now(); if (_lastFire[event] && (now - _lastFire[event]) < 8000) return { ok: false, skipped: "debounced" };
        _lastFire[event] = now;
        let service = c.service;
        if (!service && _pickTv) { try { service = await _pickTv(); } catch {} }
        if (!service) return { ok: false, error: "no TV target" };
        const message = _fill(ev.tmpl, detail) || event;
        const data = { duration: c.duration, position: c.position };
        if (c.color) data.color = c.color;
        return await _notify(service, message, ev.title || "SweK", data);
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { init, getConfig, setConfig, onEvent, EVENTS };
