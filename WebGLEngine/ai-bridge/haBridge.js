// ai-bridge/haBridge.js — generalized Home Assistant proxy for the engine.
// Companion to haSolar.js (which only handles solar entities). Holds the HA
// token SERVER-SIDE and exposes safe operations the browser GL window calls
// through server.js routes: /ha/status, /ha/states, /ha/call, /ha/events,
// /ha/stream. Also watches Blink (and any) motion binary_sensors and pushes a
// "motion" event to subscribers so the engine can react (robot alarmed).
//
// Env (same token as haSolar.js):
//   HA_URL              e.g. "http://homeassistant.local:8123"
//   HA_TOKEN            long-lived access token (HA Profile > Security)
//   HA_MOTION_ENTITIES  optional comma list of binary_sensor motion ids; if
//                       empty, auto-discovers binary_sensor.* whose
//                       device_class is "motion" from /api/states
//   HA_MOTION_POLL_MS   motion poll interval ms (default 1500)
//
// Poll-based (node http/https only, no new deps — same as haSolar.js). Blink
// motion sensors latch "on" for a cooldown, so a ~1.5s poll reliably catches
// the on-edge. For instant push, HA's WebSocket API is the upgrade path (the
// bridge already depends on `ws`). UNTESTED against a live HA in this build.

// Load ha.config.json (if present) into process.env BEFORE reading config
// below. Real environment variables take precedence; the file only fills gaps
// (same env-first precedence aiCreds.js uses). This is the easy "config
// section": copy ha.config.example.json to ha.config.json and drop in your
// HA_URL + token. Keep the real ha.config.json local — it holds your token.
(function loadHaConfigFile() {
    try {
        const fs = require("fs");
        const path = require("path");
        const f = path.join(__dirname, "ha.config.json");
        if (!fs.existsSync(f)) return;
        const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
        const set = (k, v) => { if (v != null && v !== "" && !process.env[k]) process.env[k] = String(v); };
        set("HA_URL", cfg.HA_URL);
        set("HA_TOKEN", cfg.HA_TOKEN);
        set("HA_MOTION_ENTITIES", Array.isArray(cfg.HA_MOTION_ENTITIES) ? cfg.HA_MOTION_ENTITIES.join(",") : cfg.HA_MOTION_ENTITIES);
        set("HA_MOTION_POLL_MS", cfg.HA_MOTION_POLL_MS);
        console.log("[haBridge] loaded ha.config.json");
    } catch (e) { console.warn("[haBridge] ha.config.json present but unreadable:", e.message); }
})();

const http  = require("http");
const https = require("https");

let HA_URL   = (process.env.HA_URL || "").trim().replace(/\/$/, "");
let HA_TOKEN = (process.env.HA_TOKEN || "").trim();
let MOTION_ENV = (process.env.HA_MOTION_ENTITIES || "").split(",").map(s => s.trim()).filter(Boolean);
const MOTION_POLL_MS = parseInt(process.env.HA_MOTION_POLL_MS || "1500", 10);

function log(...a) { console.log("[haBridge]", ...a); }

// --- low-level HA request (Bearer, JSON) ---
function haRequest(method, pathPart, bodyObj) {
    return new Promise((resolve, reject) => {
        if (!HA_URL || !HA_TOKEN) return reject(new Error("HA_URL/HA_TOKEN not set"));
        let u;
        try { u = new URL(HA_URL + pathPart); } catch (e) { return reject(e); }
        const lib = u.protocol === "https:" ? https : http;
        const payload = bodyObj !== undefined ? JSON.stringify(bodyObj) : null;
        const headers = { Authorization: "Bearer " + HA_TOKEN, Accept: "application/json" };
        if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(payload); }
        const r = lib.request(u, { method, headers, timeout: 8000 }, (resp) => {
            let data = "";
            resp.on("data", (c) => { data += c; });
            resp.on("end", () => {
                const ok = resp.statusCode >= 200 && resp.statusCode < 300;
                let parsed = null;
                try { parsed = data ? JSON.parse(data) : null; } catch (e) { parsed = data; }
                if (ok) resolve({ status: resp.statusCode, body: parsed });
                else reject(new Error("HA " + resp.statusCode));
            });
        });
        r.on("timeout", () => r.destroy(new Error("HA request timeout")));
        r.on("error", reject);
        if (payload) r.write(payload);
        r.end();
    });
}

// --- public ops ---
async function status() {
    if (!HA_URL || !HA_TOKEN) return { available: false, configured: false };
    try {
        await haRequest("GET", "/api/");
        let version = null;
        try { const c = await haRequest("GET", "/api/config"); version = c.body && c.body.version; } catch (e) {}
        return { available: true, configured: true, url: HA_URL, version };
    } catch (e) {
        return { available: false, configured: true, error: String(e.message || e) };
    }
}

async function states(domainFilter) {
    const r = await haRequest("GET", "/api/states");
    let list = Array.isArray(r.body) ? r.body : [];
    if (domainFilter) list = list.filter(s => String(s.entity_id || "").startsWith(domainFilter + "."));
    // Trim to the fields the UI needs (full attributes can be large).
    return list.map(s => {
        const a = s.attributes || {};
        return {
            entity_id: s.entity_id,
            state: s.state,
            name: a.friendly_name || s.entity_id,
            device_class: a.device_class,
            unit: a.unit_of_measurement,
            domain: String(s.entity_id || "").split(".")[0],
            last_changed: s.last_changed,
            // a few control-relevant attributes (only meaningful for some domains)
            brightness: a.brightness,                       // light 0-255
            supported_color_modes: a.supported_color_modes, // light
            color_temp_kelvin: a.color_temp_kelvin,          // light (current CT)
            min_color_temp_kelvin: a.min_color_temp_kelvin,  // light (range)
            max_color_temp_kelvin: a.max_color_temp_kelvin,
            rgb_color: a.rgb_color,                          // light
            current_temperature: a.current_temperature,     // climate
            temperature: a.temperature,                      // climate target
            current_humidity: a.current_humidity,            // climate
            hvac_action: a.hvac_action,                      // climate
            hvac_modes: a.hvac_modes,                        // climate
            min_temp: a.min_temp, max_temp: a.max_temp, target_temp_step: a.target_temp_step,
            fan_mode: a.fan_mode, fan_modes: a.fan_modes,    // climate (AC fan speed)
            preset_mode: a.preset_mode, preset_modes: a.preset_modes,   // climate (eco/boost/sleep…)
            swing_mode: a.swing_mode, swing_modes: a.swing_modes,       // climate (louver swing)
        };
    });
}

// v1299 — Nest Protect (smoke/CO) reader. IMPORTANT: the OFFICIAL HA "Nest" integration
// (Google Device Access / SDM API) does NOT expose Nest Protect — only thermostats,
// cameras, doorbells, displays. So this can only surface Protect data if SOME integration
// is already feeding smoke/CO entities into HA (e.g. a community Nest add-on). We just read
// whatever smoke/carbon_monoxide/battery entities exist and group them per detector.
async function nestProtect() {
    let list; try { list = await states(null); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    const rel = [];
    for (const s of (list || [])) {
        const id = String(s.entity_id || ""), dc = String(s.device_class || "");
        const looksProtect = /protect|nest/i.test(id) || /protect|nest/i.test(s.name || "");
        const isSmoke = dc === "smoke";
        const isCo = dc === "carbon_monoxide" || dc === "co" || dc === "gas";
        const isBatt = dc === "battery" && (looksProtect || /smoke|protect/i.test(id));
        if (isSmoke || isCo || isBatt || (looksProtect && (dc === "" || dc === "safety")))
            rel.push({ entity_id: s.entity_id, name: s.name, state: s.state, unit: s.unit, _smoke: isSmoke, _co: isCo, _batt: isBatt });
    }
    const baseOf = (s) => String(s.name || s.entity_id || "").toLowerCase()
        .replace(/^[a-z_]+\./, "")
        .replace(/[_ .]?(smoke|co|carbon[_ ]?monoxide|battery([_ ]?health)?|online|status|state)$/i, "").trim();
    const map = {};
    for (const s of rel) {
        const k = baseOf(s) || s.entity_id;
        const d = map[k] || (map[k] = { name: (s.name || k).replace(/\s*(smoke|co|battery).*$/i, "").trim() || k, smoke: null, co: null, battery: null, entities: [] });
        d.entities.push(s.entity_id);
        if (s._smoke) d.smoke = (String(s.state).toLowerCase() === "on" ? "DETECTED" : "clear");
        else if (s._co) d.co = (String(s.state).toLowerCase() === "on" ? "DETECTED" : "clear");
        else if (s._batt) d.battery = s.state + (s.unit ? (" " + s.unit) : "");
    }
    const detectors = Object.values(map);
    return { ok: true, detectors, count: detectors.length,
        protectLikely: rel.some(s => /protect|nest/i.test(s.entity_id) || /protect|nest/i.test(s.name || "")),
        anySmokeCo: rel.some(s => s._smoke || s._co) };
}

// v1300 — whole-home presence snapshot. HA layers presence in several places and this
// pulls them all from states(): person.* (home/away/which zone — best for "is my wife
// home", backed by the HA Companion app's GPS or router/ping device_trackers),
// device_tracker.* (the raw phones/devices), binary_sensor occupancy/presence/motion
// (ROOM-level occupancy from mmWave / motion / ESPresence), and zone.* (how many people
// are in each zone). What actually shows depends on which trackers/sensors you've set up.
async function presence() {
    let list; try { list = await states(null); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    const people = [], devices = [], rooms = [], zones = [];
    for (const s of (list || [])) {
        const id = String(s.entity_id || ""), dom = s.domain || id.split(".")[0], dc = String(s.device_class || ""), st = String(s.state || "");
        if (dom === "person") {
            people.push({ name: s.name, state: st, home: st === "home", away: st === "not_home", zone: (st !== "home" && st !== "not_home" && st !== "unknown" && st !== "unavailable") ? st : null, last_changed: s.last_changed });
        } else if (dom === "device_tracker") {
            devices.push({ name: s.name, state: st, home: st === "home", zone: (st !== "home" && st !== "not_home") ? st : null });
        } else if (dom === "binary_sensor" && (dc === "occupancy" || dc === "presence" || dc === "motion")) {
            rooms.push({ name: s.name, kind: dc, occupied: st.toLowerCase() === "on", last_changed: s.last_changed });
        } else if (dom === "zone") {
            zones.push({ name: s.name, count: parseInt(st, 10) || 0 });
        }
    }
    const homeCount = people.filter(p => p.home).length;
    rooms.sort((a, b) => (b.occupied ? 1 : 0) - (a.occupied ? 1 : 0) || a.name.localeCompare(b.name));
    return { ok: true, people, devices, rooms, zones, homeCount, awayCount: people.length - homeCount, anyRooms: rooms.length > 0 };
}

// v1281 — what integrations does the connected HA actually have loaded? /api/config
// returns `components` (every loaded integration domain) + version. The capability
// panel diffs this against the catalog of engine-relevant integrations.
async function capabilities() {
    if (!HA_URL || !HA_TOKEN) return { available: false, configured: false, components: [] };
    try {
        const c = await haRequest("GET", "/api/config");
        const body = c.body || {};
        const components = Array.isArray(body.components) ? body.components : [];
        // also report which entity DOMAINS exist (a component can be loaded without
        // any entities, and vice-versa for helper domains) — union is the safest signal.
        let domains = [];
        try { const s = await haRequest("GET", "/api/states"); if (Array.isArray(s.body)) domains = Array.from(new Set(s.body.map(e => String(e.entity_id || "").split(".")[0]).filter(Boolean))); } catch (e) {}
        return { available: true, configured: true, url: HA_URL, version: body.version || null, components, domains };
    } catch (e) {
        return { available: false, configured: true, error: String(e.message || e), components: [] };
    }
}

async function callService(domain, service, data) {
    if (!domain || !service) throw new Error("domain and service required");
    const r = await haRequest("POST",
        "/api/services/" + encodeURIComponent(domain) + "/" + encodeURIComponent(service),
        data || {});
    return { ok: true, domain, service, result: r.body };
}

// v1058 — calendar events over a window + to-do items (for the agenda panel).
async function calendars(entity, start, end) {
    if (!entity) throw new Error("entity required");
    const qs = "?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end);
    const r = await haRequest("GET", "/api/calendars/" + encodeURIComponent(entity) + qs);
    return Array.isArray(r.body) ? r.body : [];
}
async function todoItems(entity) {
    if (!entity) throw new Error("entity required");
    // Service call WITH response data (HA >= 2024.x supports ?return_response).
    const r = await haRequest("POST", "/api/services/todo/get_items?return_response", { entity_id: entity });
    const body = r.body || {};
    const resp = body.service_response || body;
    const ent = resp && (resp[entity] || {});
    return (ent && ent.items) || [];
}

// v1061 — raw camera snapshot (JPEG) for a camera entity, for the screen wall.
function cameraSnapshot(entity) {
    return new Promise((resolve, reject) => {
        if (!HA_URL || !HA_TOKEN) return reject(new Error("HA_URL/HA_TOKEN not set"));
        let u; try { u = new URL(HA_URL + "/api/camera_proxy/" + encodeURIComponent(entity)); } catch (e) { return reject(e); }
        const lib = u.protocol === "https:" ? https : http;
        const r = lib.request(u, { method: "GET", headers: { Authorization: "Bearer " + HA_TOKEN }, timeout: 8000 }, (resp) => {
            if (resp.statusCode < 200 || resp.statusCode >= 300) { resp.resume(); return reject(new Error("HA " + resp.statusCode)); }
            const chunks = []; resp.on("data", c => chunks.push(c)); resp.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: resp.headers["content-type"] || "image/jpeg" }));
        });
        r.on("timeout", () => r.destroy(new Error("timeout"))); r.on("error", reject); r.end();
    });
}

// --- motion watcher: poll -> ring buffer + SSE push ---
let motionEntities = MOTION_ENV.slice();
const lastState = {};
const ring = [];
let seq = 0;
const MAX_RING = 50;
const sseClients = new Set();

function pushEvent(ev) {
    ev.seq = ++seq;
    ring.push(ev);
    while (ring.length > MAX_RING) ring.shift();
    const line = "data: " + JSON.stringify(ev) + "\n\n";
    for (const res of sseClients) { try { res.write(line); } catch (e) {} }
}

function eventsSince(since) {
    const s = parseInt(since, 10) || 0;
    return { seq, events: ring.filter(e => e.seq > s) };
}

function addSseClient(res) {
    sseClients.add(res);
    try { res.write("retry: 3000\n\n"); res.write("data: " + JSON.stringify({ type: "hello", seq }) + "\n\n"); } catch (e) {}
}
function removeSseClient(res) { sseClients.delete(res); }

async function resolveMotionEntities() {
    if (MOTION_ENV.length) { motionEntities = MOTION_ENV.slice(); return; }
    try {
        const r = await haRequest("GET", "/api/states");
        const list = Array.isArray(r.body) ? r.body : [];
        // v1080 — also watch occupancy/presence binary_sensors so presence
        // sources (e.g. an Echo's presence surfaced in HA) can trigger the engine.
        motionEntities = list
            .filter(s => String(s.entity_id || "").startsWith("binary_sensor.") &&
                         s.attributes && ["motion", "occupancy", "presence"].includes(s.attributes.device_class))
            .map(s => s.entity_id);
    } catch (e) { /* keep previous list */ }
}

async function pollMotion() {
    if (!HA_URL || !HA_TOKEN) return;
    if (!motionEntities.length) await resolveMotionEntities();
    for (const id of motionEntities) {
        try {
            const r = await haRequest("GET", "/api/states/" + encodeURIComponent(id));
            const st = r.body && r.body.state;
            const prev = lastState[id];
            lastState[id] = st;
            const name = (r.body.attributes && r.body.attributes.friendly_name) || id;
            const dc = (r.body.attributes && r.body.attributes.device_class) || "motion";
            // fire on a genuine off->on edge (skip the first observation)
            if (st === "on" && prev !== undefined && prev !== "on") {
                const type = dc === "motion" ? "motion" : "presence";
                pushEvent({ type, device_class: dc, entity_id: id, name, state: "on", at: new Date().toISOString() });
                log(type.toUpperCase() + ":", id);
            }
            // v1082 — presence/occupancy CLEAR (room emptied) on on->off. Skipped
            // for motion sensors, which latch/clear too noisily to be useful.
            else if (st === "off" && prev === "on" && dc !== "motion") {
                pushEvent({ type: "presence_clear", device_class: dc, entity_id: id, name, state: "off", at: new Date().toISOString() });
                log("PRESENCE_CLEAR:", id);
            }
        } catch (e) { /* skip this entity this tick */ }
    }
}

let motionTimer = null, rediscoverTimer = null;
function start() {
    if (!HA_URL || !HA_TOKEN) { log("disabled (set HA_URL + HA_TOKEN to enable)"); return; }
    log("HA proxy enabled @ " + HA_URL + (MOTION_ENV.length ? (" motion: " + MOTION_ENV.join(",")) : " motion: auto-discover"));
    resolveMotionEntities().then(pollMotion);
    motionTimer = setInterval(pollMotion, MOTION_POLL_MS);
    if (!MOTION_ENV.length) rediscoverTimer = setInterval(resolveMotionEntities, 60000);
}

// v603 — write HA creds from the panel's "Save HA config" button. Updates the
// in-memory values so /ha/status + /ha/call work immediately (no bridge
// restart), AND persists to ha.config.json. The motion watcher picks up new
// entities on the next restart; status/calls are live right away.
function setConfig(opts) {
    opts = opts || {};
    if (opts.url           !== undefined) HA_URL   = String(opts.url || "").trim().replace(/\/$/, "");
    if (opts.token         !== undefined) HA_TOKEN = String(opts.token || "").trim();
    if (opts.motionEntities !== undefined) MOTION_ENV = String(opts.motionEntities || "").split(",").map(s => s.trim()).filter(Boolean);
    try {
        const fs = require("fs"), path = require("path");
        const f = path.join(__dirname, "ha.config.json");
        let cur = {}; try { cur = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
        if (opts.url           !== undefined) cur.HA_URL = HA_URL;
        if (opts.token         !== undefined) cur.HA_TOKEN = HA_TOKEN;
        if (opts.motionEntities !== undefined) cur.HA_MOTION_ENTITIES = MOTION_ENV;
        fs.writeFileSync(f, JSON.stringify(cur, null, 2));
        console.log("[haBridge] config updated via setConfig (ha.config.json written)");
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true };
}

// v1744 - synchronous "is HA set up?" check (no network) for capability advertisement / proxy gating.
function configured() { return !!(HA_URL && HA_TOKEN); }
function rawToken() { return HA_TOKEN || ""; }   // v1745 - server-internal only (password-gated key move); NEVER broadcast
/**
 * v3006 -- A CALL THAT PROVES ITSELF, which is the difference between a control and a decoration.
 *
 * callService() returns ok:true when Home Assistant ACCEPTS the request. That is not the same as the thing
 * happening. A wrong entity_id, a service that silently no-ops, an automation that immediately reverts it, an
 * offline device that HA still has a stale state for -- all of those return 200 and a cheerful body, and a panel
 * built on that reports success while nothing in the house moved.
 *
 * So: read the entity BEFORE, call, then poll until it CHANGES or the window closes. The verdict is about the
 * observed state, not about the HTTP status.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. "unchanged" is not "failed" -- switching an already-on light on is a
 * legitimate no-op, and reporting that as an error would train a reader to ignore the panel. The three outcomes
 * are CHANGED, ALREADY (the entity was in the target state before the call) and UNCONFIRMED, and only the last
 * is a problem. Collapsing them into a boolean is what makes a dashboard lie.
 */
async function verifiedCall(domain, service, data, { entityId = null, expect = null, timeoutMs = 4000, pollMs = 300 } = {}) {
    const id = entityId || (data && data.entity_id) || null;
    const stateOf = async () => {
        if (!id) return null;
        const list = await states();
        const hit = (Array.isArray(list) ? list : (list && list.states) || []).find((e) => e.entity_id === id);
        return hit ? hit.state : null;
    };

    const before = await stateOf();
    const already = expect !== null && before === expect;

    const call = await callService(domain, service, data);
    if (!id) {
        return { ok: true, verdict: "unverifiable", why: "no entity_id was supplied, so nothing can be polled -- the call was accepted and that is ALL that is known", call };
    }
    if (already) {
        return { ok: true, verdict: "already", entityId: id, before, after: before,
                 why: "the entity was already in the target state, so an unchanged reading is correct and not a failure" };
    }

    const deadline = Date.now() + timeoutMs;
    let after = before;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));
        after = await stateOf();
        if (after !== before && (expect === null || after === expect)) {
            return { ok: true, verdict: "changed", entityId: id, before, after, ms: timeoutMs - (deadline - Date.now()) };
        }
    }
    return {
        ok: true, verdict: "unconfirmed", entityId: id, before, after, timeoutMs,
        why: "Home Assistant accepted the call and the entity did not move within " + timeoutMs +
             "ms. The request succeeded; the WORLD did not visibly change. That is the case a 200 would have hidden.",
    };
}

module.exports = { start, status, capabilities, states, callService, verifiedCall, notifyServices, notifyTv, calendars, todoItems, cameraSnapshot, eventsSince, addSseClient, removeSseClient, setConfig, nestProtect, presence, configured, rawToken };

// v1867 — list available notify.* services (Android TV / Fire TV overlay, mobile app, persistent, etc.)
// so the UI can offer the Shield TV as a toast target. Uses HA's /api/services catalog.
async function notifyServices() {
    try {
        const r = await haRequest("GET", "/api/services");
        const arr = (r && r.body) || [];
        const notify = arr.find(d => d && d.domain === "notify");
        if (!notify || !notify.services) return { ok: true, services: [] };
        const names = Object.keys(notify.services);
        // put likely-TV targets first (name hints: tv, shield, androidtv, firetv, living, bedroom).
        const tvHint = /tv|shield|androidtv|firetv|living|bedroom|overlay/i;
        names.sort((a, b) => (tvHint.test(b) ? 1 : 0) - (tvHint.test(a) ? 1 : 0));
        return { ok: true, services: names.map(n => ({ service: n, full: "notify." + n, looksLikeTv: tvHint.test(n) })) };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// v1867 — send a toast/overlay to an Android TV (Shield) via notify.<service>. data supports the
// nfandroidtv overlay options: duration (s), position, fontsize, color, transparency, interrupt.
async function notifyTv(service, message, title, data) {
    const svc = String(service || "").replace(/^notify\./, "").trim();
    if (!svc) return { ok: false, error: "no notify service (which TV?)" };
    if (!message) return { ok: false, error: "no message" };
    const payload = { message: String(message) };
    if (title) payload.title = String(title);
    if (data && typeof data === "object") payload.data = data;
    return callService("notify", svc, payload);
}
