// FILE: ai-bridge/haSolar.js
// Pull ACTUAL solar values FROM Home Assistant when HA is reachable.
//
// Direction: HA -> bridge -> engine/panel. HA owns the solar truth (its inverter
// integration); this reads HA's entity states and caches them. The panel reads
// GET /ha/solar; the engine can consume the same cache. Degrades gracefully —
// if HA is down, `available` goes false and the last good values stay (flagged
// stale) rather than crashing anything.
//
// Env:
//   HA_URL              base URL, e.g. "http://homeassistant.local:8123"
//   HA_TOKEN            long-lived access token (Profile > Security)
//   HA_SOLAR_ENTITIES   comma list, e.g.
//                       "sensor.solar_power,sensor.solar_energy_today,sensor.grid_power,sensor.battery_level"
//   HA_SOLAR_POLL_MS    poll interval (default 15000)
//
// Wire-up (server.js):
//   const haSolar = require("./haSolar.js");
//   haSolar.start();
//   // in your request router:
//   if (req.method === "GET" && req.url === "/ha/solar") {
//     res.writeHead(200, { "Content-Type": "application/json" });
//     res.end(JSON.stringify(haSolar.latest())); return;
//   }
"use strict";
const http  = require("http");
const https = require("https");
const { URL } = require("url");

const fs   = require("fs");
const path = require("path");
const HA_CFG_FILE = path.join(__dirname, "ha.config.json");
const CFG_FILE    = path.join(__dirname, "ha-solar.json");   // persisted role->entity map + ball lights
function _readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } }
// HA creds resolved dynamically (env OR ha.config.json) so a token written
// later via /ha/config is picked up without a restart.
function _creds() { const c = _readJson(HA_CFG_FILE); return { url: (process.env.HA_URL || c.HA_URL || "").trim().replace(/\/$/, ""), token: (process.env.HA_TOKEN || c.HA_TOKEN || "").trim() }; }
// Which HA entity is which solar role, which lights the battery level colors
// ("the ball"), and whether that auto-coloring is on. Persisted to ha-solar.json.
let solarCfg = Object.assign(
  { power: "sensor.envoy_202237138898_current_power_production",
    energyToday: "sensor.envoy_202237138898_energy_production_today",
    grid: "sensor.envoy_202237138898_current_net_power_consumption",
    battery: "sensor.envoy_202237138898_battery",
    ballTargets: ["light.ball", "light.desktop_atmosphere_light"], ballEnabled: true },
  _readJson(CFG_FILE)
);
function _entityList() {
  const roleIds = [solarCfg.power, solarCfg.energyToday, solarCfg.grid, solarCfg.battery].filter(Boolean);
  const envIds  = (process.env.HA_SOLAR_ENTITIES || "").split(",").map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...roleIds, ...envIds]));
}
const POLL_MS = parseInt(process.env.HA_SOLAR_POLL_MS || "15000", 10);

let timer = null;
const cache = { available: false, lastOkMs: 0, values: {} };

function log(m) { console.log(`[ha-solar] ${m}`); }

function getJSON(pathPart) {
  return new Promise((resolve, reject) => {
    const { url, token } = _creds();
    let u;
    try { u = new URL(url + pathPart); } catch (e) { return reject(e); }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      timeout: 5000,
    }, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error("HTTP " + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.end();
  });
}

async function poll() {
  const { url, token } = _creds();
  if (!url || !token) return;
  try {
    await getJSON("/api/");                       // availability probe
    for (const id of _entityList()) {
      try {
        const s = await getJSON("/api/states/" + encodeURIComponent(id));
        cache.values[id] = {
          state: s.state,
          unit: (s.attributes && s.attributes.unit_of_measurement) || null,
          name: (s.attributes && s.attributes.friendly_name) || id,
          ts: Date.now(),
        };
      } catch (e) { /* leave previous value for this entity */ }
    }
    cache.available = true;
    cache.lastOkMs = Date.now();
  } catch (e) {
    cache.available = false;                       // HA not reachable right now
  }
}

function start() {
  const { url, token } = _creds();
  if (!url || !token) { log("disabled (set HA_URL + HA_TOKEN, e.g. in ha.config.json, to enable)"); return; }
  const list = _entityList();
  if (!list.length) { log("no solar entities configured yet — set them in Settings -> Solar / Battery"); }
  log(`polling ${list.length} entities from ${url} every ${POLL_MS}ms`);
  poll();
  if (timer) clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
  if (timer.unref) timer.unref();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

// { available, stale, lastOkMs, values: { <entity_id>: {state, unit, name, ts} } }
function latest() {
  const v = cache.values;
  return {
    available: cache.available,
    stale: cache.lastOkMs > 0 ? (Date.now() - cache.lastOkMs > POLL_MS * 3) : true,
    lastOkMs: cache.lastOkMs,
    values: v,
    config: solarCfg,
    roles: {
      power:       solarCfg.power       ? (v[solarCfg.power]       || null) : null,
      energyToday: solarCfg.energyToday ? (v[solarCfg.energyToday] || null) : null,
      grid:        solarCfg.grid        ? (v[solarCfg.grid]        || null) : null,
      battery:     solarCfg.battery     ? (v[solarCfg.battery]     || null) : null,
    },
  };
}

function getConfig() { return solarCfg; }
function setConfig(c) {
  if (c && typeof c === "object") {
    for (const k of ["power", "energyToday", "grid", "battery"]) if (c[k] !== undefined) solarCfg[k] = String(c[k] || "").trim();
    if (typeof c.mood === "boolean") solarCfg.mood = c.mood;   // v1332 — tie avatar mood to battery/solar
    if (Array.isArray(c.ballTargets)) solarCfg.ballTargets = c.ballTargets.map(x => String(x).trim()).filter(Boolean);
    if (typeof c.ballEnabled === "boolean") solarCfg.ballEnabled = c.ballEnabled;
    try { fs.writeFileSync(CFG_FILE, JSON.stringify(solarCfg, null, 2)); } catch {}
    try { start(); } catch {}   // (re)start polling with the new entities
    poll();
  }
  return solarCfg;
}

module.exports = { start, stop, latest, poll, getConfig, setConfig };
