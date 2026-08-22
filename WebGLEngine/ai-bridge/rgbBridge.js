// ai-bridge/rgbBridge.js — unified RGB light control with 3 interchangeable
// backends and automatic fallback. v1 (EngineProject v599).
//
// The browser GL window can't talk to RGB hardware directly (OpenRGB's SDK is
// raw TCP on 6742; Razer Chroma is a fiddly localhost REST session; the CLI is
// one-shot). So the bridge owns the connection and exposes /rgb/* routes.
//
// Backends, tried in this order (or force one via RGB_BACKEND):
//   1. openrgb_sdk  — persistent TCP client (npm `openrgb-sdk`). Best: live,
//                     per-device, controls Razer + light bars from one place.
//                     Needs OpenRGB running with "Enable SDK Server" on.
//   2. openrgb_cli  — shells out to OpenRGB.exe (one-shot). No npm dep. Fine
//                     for solar updates + on/off; laggier for a live picker.
//   3. ha           — HA `light.turn_on {rgb_color}` via haBridge. Use when the
//                     bars are exposed to HA (e.g. the OpenRGB HA integration).
//
// If a backend isn't installed/running it's skipped; if the active one errors
// mid-call, the next working backend is tried automatically. So with all three
// present the lights keep working as long as ANY path is up.
//
// Config: copy rgb.config.example.json -> rgb.config.json (same folder).
// UNTESTED against real hardware/OpenRGB/HA in this build — verify on your box.

const { execFile } = require("child_process");
const haBridge = require("./haBridge.js");
const haSolar  = require("./haSolar.js");   // v1054 — follow the same battery entity the Solar/Battery settings use
const falloutBridge = require("./falloutBridge.js");  // v1073 — Pip-Boy EffectColor source

const CFG = {
    RGB_BACKEND: "auto",            // auto | openrgb_sdk | openrgb_cli | ha
    OPENRGB_HOST: "127.0.0.1",
    OPENRGB_PORT: 6742,
    OPENRGB_CLI: "OpenRGB",         // command or full path to OpenRGB.exe
    HA_RGB_ENTITIES: [],            // light.* entities (HA backend + default solar targets)
    SOLAR_BATTERY_ENTITY: "",       // e.g. sensor.solar_battery_level
    SOLAR_TARGETS: [],              // ids to tint for solar (default: all devices on active backend)
    SOLAR_FOLLOW: true,           // v1054 — battery band -> PC RGB ("the ball") by default
    SOLAR_POLL_MS: 30000,
    GAME_FOLLOW: false,            // v1073 — Fallout 4 Pip-Boy EffectColor -> PC RGB
    GAME_POLL_MS: 1500,
    GAME_TARGETS: [],             // ids to tint for the game color (default: solar targets / all)
};

(function loadCfg() {
    try {
        const fs = require("fs"), path = require("path");
        const f = path.join(__dirname, "rgb.config.json");
        if (!fs.existsSync(f)) return;
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        for (const k of Object.keys(CFG)) if (j[k] !== undefined && k[0] !== "_") CFG[k] = j[k];
        console.log("[rgbBridge] loaded rgb.config.json");
    } catch (e) { console.warn("[rgbBridge] rgb.config.json unreadable:", e.message); }
})();

function log(...a) { console.log("[rgbBridge]", ...a); }

// ---- color helpers ----
function hexToRgb(hex) {
    let h = String(hex || "").replace(/^#/, "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex(rgb) { return [rgb.r, rgb.g, rgb.b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join(""); }
function hsvToHex(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}
function batteryColor(pct) {
    const p = Math.max(0, Math.min(100, pct)) / 100;   // 0% red -> 100% green
    return hsvToHex(p * 120, 1, 1);
}
function run(cmd, args) {
    return new Promise((res, rej) => execFile(cmd, args, { timeout: 7000, windowsHide: true }, (e, so) => e ? rej(e) : res(so || "")));
}

// ---- backend 1: OpenRGB SDK (persistent TCP) ----
const SDK = {
    name: "openrgb_sdk",
    _client: null,
    async _connect() {
        if (this._client) return this._client;
        let mod;
        try { mod = require("openrgb-sdk"); }
        catch (e) { throw new Error("openrgb-sdk not installed (run `npm install openrgb-sdk` in ai-bridge)"); }
        const c = new mod.Client("SweK Engine", CFG.OPENRGB_PORT, CFG.OPENRGB_HOST);
        await c.connect(1500);
        this._client = c;
        return c;
    },
    _drop() { try { this._client && this._client.disconnect(); } catch (e) {} this._client = null; },
    async probe() { try { await this._connect(); return true; } catch (e) { this._drop(); return false; } },
    async list() {
        const c = await this._connect();
        const n = await c.getControllerCount();
        const out = [];
        for (let i = 0; i < n; i++) {
            try { const d = await c.getControllerData(i); out.push({ id: i, name: d.name || ("device " + i), leds: (d.colors || []).length }); }
            catch (e) { out.push({ id: i, name: "device " + i }); }
        }
        return out;
    },
    async setColor(id, rgb) {
        try {
            const c = await this._connect();
            const did = parseInt(id, 10) || 0;
            try { await c.updateMode(did, "Direct"); } catch (e) { /* device may lack a Direct mode */ }
            let n = 1;
            try { const d = await c.getControllerData(did); n = (d.colors || []).length || 1; } catch (e) {}
            await c.updateLeds(did, Array(n).fill({ red: rgb.r, green: rgb.g, blue: rgb.b }));
        } catch (e) { this._drop(); throw e; }
    },
    async off(id) { return this.setColor(id, { r: 0, g: 0, b: 0 }); },
};

// ---- backend 2: OpenRGB CLI (one-shot) ----
const CLI = {
    name: "openrgb_cli",
    async probe() { try { await run(CFG.OPENRGB_CLI, ["--version"]); return true; } catch (e) { return false; } },
    async list() {
        try {
            const out = await run(CFG.OPENRGB_CLI, ["--list-devices"]);
            const devs = [];
            for (const line of out.split(/\r?\n/)) { const m = line.match(/^\s*(\d+):\s*(.+)$/); if (m) devs.push({ id: +m[1], name: m[2].trim() }); }
            return devs.length ? devs : [{ id: "all", name: "(all devices)" }];
        } catch (e) { return [{ id: "all", name: "(all devices)" }]; }
    },
    async setColor(id, rgb) {
        const args = ["--mode", "static", "--color", toHex(rgb)];
        if (id != null && id !== "" && id !== "all") args.unshift("--device", String(id));
        await run(CFG.OPENRGB_CLI, args);
    },
    async off(id) { return this.setColor(id, { r: 0, g: 0, b: 0 }); },
};

// ---- backend 3: Home Assistant lights ----
const HA = {
    name: "ha",
    async probe() {
        try { const s = await haBridge.status(); return !!(s && s.available) && CFG.HA_RGB_ENTITIES.length > 0; }
        catch (e) { return false; }
    },
    async list() {
        if (CFG.HA_RGB_ENTITIES.length) return CFG.HA_RGB_ENTITIES.map(e => ({ id: e, name: e }));
        try { return (await haBridge.states("light")).map(l => ({ id: l.entity_id, name: l.name || l.entity_id })); }
        catch (e) { return []; }
    },
    async setColor(id, rgb) { await haBridge.callService("light", "turn_on", { entity_id: id, rgb_color: [rgb.r, rgb.g, rgb.b] }); },
    async off(id) { await haBridge.callService("light", "turn_off", { entity_id: id }); },
};

const BACKENDS = { openrgb_sdk: SDK, openrgb_cli: CLI, ha: HA };
// v1148 — the openrgb_sdk backend keeps a persistent TCP socket (openrgb-sdk npm),
// a prime suspect for the Bun-on-Windows "No handlers set on Socket" panic. Under Bun,
// drop the SDK backend and use the one-shot CLI (shells out, no long-lived socket) or
// HA. Full SDK live-control still works on Node. (Experiment toward a Bun-clean boot.)
const _rgbIsBun = typeof Bun !== "undefined" || !!(process.versions && process.versions.bun);
const ORDER = _rgbIsBun ? ["openrgb_cli", "ha"] : ["openrgb_sdk", "openrgb_cli", "ha"];
let active = null;

async function probeAll() {
    const avail = {};
    for (const k of ORDER) { try { avail[k] = await BACKENDS[k].probe(); } catch (e) { avail[k] = false; } }
    return avail;
}
async function chooseBackend() {
    if (CFG.RGB_BACKEND && CFG.RGB_BACKEND !== "auto") {
        try { if (await BACKENDS[CFG.RGB_BACKEND].probe()) { active = CFG.RGB_BACKEND; return active; } } catch (e) {}
    }
    for (const k of ORDER) { try { if (await BACKENDS[k].probe()) { active = k; return active; } } catch (e) {} }
    active = null;
    return null;
}

async function status() {
    const avail = await probeAll();
    if (!active || !avail[active]) await chooseBackend();
    return { active, available: avail, order: ORDER, config: { backend: CFG.RGB_BACKEND, openrgb: CFG.OPENRGB_HOST + ":" + CFG.OPENRGB_PORT, haEntities: CFG.HA_RGB_ENTITIES, solarFollow: solarOn, solarEntity: CFG.SOLAR_BATTERY_ENTITY, gameFollow: gameOn, gameColor: lastGameHex } };
}
async function listDevices() {
    if (!active) await chooseBackend();
    if (!active) return [];
    try { return await BACKENDS[active].list(); } catch (e) { active = null; await chooseBackend(); return active ? BACKENDS[active].list() : []; }
}
async function setColor(id, hex) {
    const rgb = hexToRgb(hex);
    if (!active) await chooseBackend();
    if (!active) throw new Error("no RGB backend available (OpenRGB SDK/CLI down, no HA lights)");
    try { await BACKENDS[active].setColor(id, rgb); return { ok: true, backend: active }; }
    catch (e) {
        const prev = active; active = null;                 // active backend failed — fall back
        await chooseBackend();
        if (active && active !== prev) {
            try { await BACKENDS[active].setColor(id, rgb); return { ok: true, backend: active, fellBackFrom: prev }; } catch (e2) {}
        }
        throw e;
    }
}
async function off(id) {
    if (!active) await chooseBackend();
    if (!active) throw new Error("no RGB backend available");
    try { await BACKENDS[active].off(id); return { ok: true, backend: active }; }
    catch (e) { active = null; await chooseBackend(); if (active) { await BACKENDS[active].off(id); return { ok: true, backend: active }; } throw e; }
}
async function setBackend(name) {
    if (name === "auto") { CFG.RGB_BACKEND = "auto"; active = null; await chooseBackend(); return { active }; }
    if (!BACKENDS[name]) throw new Error("unknown backend: " + name);
    CFG.RGB_BACKEND = name;
    active = (await BACKENDS[name].probe()) ? name : null;
    return { active };
}

// ---- solar-battery follow ----
let solarOn = false, solarTimer = null;
let gameOn = false, gameTimer = null, lastGameAt = 0, lastGameHex = null;
async function pollSolar() {
    if (gameOn && Date.now() - lastGameAt < 8000) return;   // v1073 — game color preempts solar while a game is linked
    // v1054 — use the explicit RGB battery entity if set, else fall back to the
    // entity configured in Settings -> Solar / Battery (haSolar), so the PC RGB
    // "ball" tracks the same battery as everything else.
    let entId = CFG.SOLAR_BATTERY_ENTITY;
    if (!entId) { try { entId = (haSolar.getConfig && haSolar.getConfig().battery) || ""; } catch (e) {} }
    if (!entId) return;
    try {
        const states = await haBridge.states();
        const ent = (states || []).find(s => s.entity_id === entId);
        if (!ent) return;
        const pct = parseFloat(ent.state);
        if (isNaN(pct)) return;
        const hex = batteryColor(pct);
        let targets = CFG.SOLAR_TARGETS.length ? CFG.SOLAR_TARGETS
            : (CFG.HA_RGB_ENTITIES.length && active === "ha") ? CFG.HA_RGB_ENTITIES
            : (await listDevices()).map(d => d.id);
        for (const t of targets) { try { await setColor(t, hex); } catch (e) {} }
        log(`solar ${pct}% -> #${hex} on ${targets.length} target(s)`);
    } catch (e) { /* skip this tick */ }
}
async function pollGameColor() {
    let hex = null;
    try {
        const st = falloutBridge.getState && falloutBridge.getState();
        const ec = st && st.ready && st.status && st.status.EffectColor;
        if (Array.isArray(ec) && ec.length >= 3) {
            const r = Math.round(Math.max(0, Math.min(1, ec[0])) * 255), g = Math.round(Math.max(0, Math.min(1, ec[1])) * 255), b = Math.round(Math.max(0, Math.min(1, ec[2])) * 255);
            hex = toHex({ r, g, b });
        }
    } catch (e) { return; }
    if (!hex) return;                  // no game color right now -> let solar resume
    lastGameAt = Date.now();
    if (hex === lastGameHex) return;   // unchanged -> don't spam the lights
    lastGameHex = hex;
    let targets = CFG.GAME_TARGETS.length ? CFG.GAME_TARGETS
        : CFG.SOLAR_TARGETS.length ? CFG.SOLAR_TARGETS
        : (CFG.HA_RGB_ENTITIES.length && active === "ha") ? CFG.HA_RGB_ENTITIES
        : (await listDevices()).map(d => d.id);
    for (const t of targets) { try { await setColor(t, hex); } catch (e) {} }
    log(`game color -> #${hex} on ${targets.length} target(s)`);
}
function setGameFollow(on) {
    gameOn = !!on;
    if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
    if (gameOn) { lastGameHex = null; pollGameColor(); gameTimer = setInterval(pollGameColor, Math.max(1000, CFG.GAME_POLL_MS)); }
    return gameOn;
}
async function setAll(hex) {
    const devs = await listDevices();
    let n = 0; for (const d of devs) { try { await setColor(d.id, hex); n++; } catch (e) {} }
    return { ok: true, count: n, total: devs.length, backend: active };
}
async function offAll() {
    const devs = await listDevices();
    let n = 0; for (const d of devs) { try { await off(d.id); n++; } catch (e) {} }
    return { ok: true, count: n, total: devs.length };
}
function setSolarFollow(on) {
    solarOn = !!on;
    if (solarTimer) { clearInterval(solarTimer); solarTimer = null; }
    if (solarOn) { pollSolar(); solarTimer = setInterval(pollSolar, Math.max(5000, CFG.SOLAR_POLL_MS)); }
    return solarOn;
}

async function start() {
    await chooseBackend();
    log(active ? ("active backend: " + active) : "no backend available yet (OpenRGB not running / no HA lights) — will retry on demand");
    if (CFG.SOLAR_FOLLOW) setSolarFollow(true);
    if (CFG.GAME_FOLLOW) setGameFollow(true);
}

module.exports = { start, status, listDevices, setColor, off, setBackend, setSolarFollow, setGameFollow, setAll, offAll, batteryColor };
