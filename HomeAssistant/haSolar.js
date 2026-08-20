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

const HA_URL   = (process.env.HA_URL || "").trim().replace(/\/$/, "");
const HA_TOKEN = (process.env.HA_TOKEN || "").trim();
const ENTITIES = (process.env.HA_SOLAR_ENTITIES || "").split(",").map(s => s.trim()).filter(Boolean);
const POLL_MS  = parseInt(process.env.HA_SOLAR_POLL_MS || "15000", 10);

let timer = null;
const cache = { available: false, lastOkMs: 0, values: {} };

function log(m) { console.log(`[ha-solar] ${m}`); }

function getJSON(pathPart) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(HA_URL + pathPart); } catch (e) { return reject(e); }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, {
      method: "GET",
      headers: { Authorization: "Bearer " + HA_TOKEN, Accept: "application/json" },
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
  if (!HA_URL || !HA_TOKEN) return;
  try {
    await getJSON("/api/");                       // availability probe
    for (const id of ENTITIES) {
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
  if (!HA_URL || !HA_TOKEN) { log("disabled (set HA_URL + HA_TOKEN to enable)"); return; }
  if (!ENTITIES.length)      { log("no HA_SOLAR_ENTITIES set — nothing to poll"); }
  log(`polling ${ENTITIES.length} entities from ${HA_URL} every ${POLL_MS}ms`);
  poll();
  if (timer) clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
  if (timer.unref) timer.unref();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

// { available, stale, lastOkMs, values: { <entity_id>: {state, unit, name, ts} } }
function latest() {
  return {
    available: cache.available,
    stale: cache.lastOkMs > 0 ? (Date.now() - cache.lastOkMs > POLL_MS * 3) : true,
    lastOkMs: cache.lastOkMs,
    values: cache.values,
  };
}

module.exports = { start, stop, latest, poll };
