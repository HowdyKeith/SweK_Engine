// FILE: ai-bridge/haDiscovery.js
// Home Assistant MQTT Discovery for the VBA transmit engine.
//
// Publishes HA discovery config topics so HA auto-creates a device
// ("VBA Transmit Engine") with entities derived from the bridge's live
// `bridgeState`, then streams state at a fixed interval. This is the easy
// alternative to emulating the ESPHome native API: no protobuf, just MQTT.
//
// Mirrors server.js's existing mqtt conventions (lazy require, reconnect,
// optional TLS/auth) but on its own env flag so it never collides with the
// KPop event relay. Entirely no-op unless HA_MQTT (or KPOP_MQTT) is set, and
// it never throws into the bridge.
//
// Wire-up (see HA_MQTT_WIRING.md):
//   const haDiscovery = require("./haDiscovery.js");
//   haDiscovery.start({ bridgeState, getMeta: () => ({ subscribers: wss.clients.size }) });
"use strict";
const fs = require("fs");

const URL    = (process.env.HA_MQTT || process.env.KPOP_MQTT || "").trim();
const PREFIX = (process.env.HA_DISCOVERY_PREFIX || "homeassistant").trim();
const NODE   = (process.env.HA_NODE_ID || "vba_transmit_engine").trim();
const STATE_INTERVAL = parseInt(process.env.HA_STATE_INTERVAL_MS || "1000", 10);
const STALE_MS       = parseInt(process.env.HA_STALE_MS || "5000", 10);

const AVAIL_TOPIC = `${NODE}/availability`;
const STATE_TOPIC = `${NODE}/state`;

const DEVICE = {
  identifiers: [NODE],
  name: "VBA Transmit Engine",
  manufacturer: "Geek",
  model: "VBA OpenGL/D3D11 Engine",
  sw_version: (process.env.HA_SW_VERSION || "bridge").trim(),
};

// Entity table. `value` pulls a field out of the snapshot built below; return
// null to leave it unknown in HA. Each maps to one value_template key.
const ENTITIES = [
  { comp: "binary_sensor", id: "engine_online", name: "Engine Online",
    cfg: { device_class: "connectivity", payload_on: "ON", payload_off: "OFF" } },
  { comp: "sensor", id: "tick",              name: "Tick",              cfg: { state_class: "measurement" } },
  { comp: "sensor", id: "total_ticks",       name: "Total Ticks",       cfg: { state_class: "total_increasing" } },
  { comp: "sensor", id: "entities_total",    name: "Entities",          cfg: { unit_of_measurement: "ents", icon: "mdi:cube-outline" } },
  { comp: "sensor", id: "entities_alive",    name: "Entities Alive",    cfg: { unit_of_measurement: "ents", icon: "mdi:robot-angry" } },
  { comp: "sensor", id: "player_health",     name: "Player Health",     cfg: { icon: "mdi:heart-pulse" } },
  { comp: "sensor", id: "directives_queued", name: "Directives Queued", cfg: { icon: "mdi:format-list-numbered" } },
  { comp: "sensor", id: "subscribers",       name: "WS Subscribers",    cfg: { icon: "mdi:account-multiple" } },
  { comp: "sensor", id: "last_event",        name: "Last Event",        cfg: { icon: "mdi:flash" } },
  { comp: "sensor", id: "last_seen_secs",    name: "Last Seen (s ago)", cfg: { device_class: "duration", unit_of_measurement: "s", entity_category: "diagnostic" } },

  // --- engine viz ---
  { comp: "sensor", id: "fps",   name: "FPS",   cfg: { state_class: "measurement", unit_of_measurement: "fps", icon: "mdi:speedometer" } },
  { comp: "sensor", id: "scene", name: "Scene", cfg: { icon: "mdi:cube-scan" } },
];

let client = null;
let timer  = null;

function log(m) { console.log(`[ha-mqtt] ${m}`); }

function buildSnapshot(bridgeState, getMeta) {
  const s   = (bridgeState && bridgeState.latest) || {};
  const meta = (typeof getMeta === "function" && getMeta()) || {};
  const ageMs = bridgeState && bridgeState.lastTickMs
    ? Date.now() - bridgeState.lastTickMs : Infinity;
  const player = s.player || {};
  const events = Array.isArray(s.events) ? s.events : [];
  const lastEv = events.length ? events[events.length - 1] : null;
  // Real EngineCore payload is { tick, entities:[{x,y,z,hp,alive}] }; the voxel
  // bridge VBA may instead send { tick, t_ms, player, enemies, events }. Accept
  // either: prefer `entities`, fall back to `enemies`.
  const ents = Array.isArray(s.entities) ? s.entities
             : Array.isArray(s.enemies)  ? s.enemies : [];
  const alive = ents.filter(e => e && (e.alive === undefined || e.alive === true || e.alive === "true")).length;

  return {
    engine_online: ageMs <= STALE_MS ? "ON" : "OFF",
    tick: (s.tick != null) ? s.tick : null,
    total_ticks: (bridgeState && bridgeState.totalTicks != null) ? bridgeState.totalTicks : null,
    entities_total: ents.length ? ents.length : null,
    entities_alive: ents.length ? alive : null,
    player_health: (player.health != null) ? player.health
                 : (player.hp != null) ? player.hp : null,
    directives_queued: (bridgeState && Array.isArray(bridgeState.directives)) ? bridgeState.directives.length : null,
    subscribers: (meta.subscribers != null) ? meta.subscribers : null,
    last_event: lastEv == null ? null : (typeof lastEv === "object" ? JSON.stringify(lastEv).slice(0, 240) : String(lastEv).slice(0, 240)),
    last_seen_secs: isFinite(ageMs) ? Math.round(ageMs / 1000) : null,

    // fps/scene only populate if your transmitter sends them; else null.
    // Solar is NOT here — it's read FROM Home Assistant by haSolar.js (HA owns it).
    fps: (s.fps != null) ? s.fps : (player.fps != null ? player.fps : null),
    scene: (s.scene != null) ? s.scene : (s.demo != null ? s.demo : null),
  };
}

// Safe dotted-path lookup: returns the first path that resolves to a non-null
// value, else null. Lets the solar fields tolerate whatever shape VBA sends.
function pick(obj, paths) {
  for (const p of paths) {
    let v = obj, ok = true;
    for (const key of p.split(".")) {
      if (v == null || typeof v !== "object" || !(key in v)) { ok = false; break; }
      v = v[key];
    }
    if (ok && v != null) return v;
  }
  return null;
}

function publishDiscovery() {
  for (const e of ENTITIES) {
    const topic = `${PREFIX}/${e.comp}/${NODE}/${e.id}/config`;
    const payload = Object.assign({
      name: e.name,
      unique_id: `${NODE}_${e.id}`,
      state_topic: STATE_TOPIC,
      value_template: `{{ value_json.${e.id} }}`,
      availability_topic: AVAIL_TOPIC,
      payload_available: "online",
      payload_not_available: "offline",
      device: DEVICE,
    }, e.cfg);
    try { client.publish(topic, JSON.stringify(payload), { retain: true }); } catch {}
  }
  log(`published ${ENTITIES.length} discovery configs under ${PREFIX}/+/${NODE}/`);
}

function publishState(bridgeState, getMeta) {
  if (!client || !client.connected) return;
  try { client.publish(STATE_TOPIC, JSON.stringify(buildSnapshot(bridgeState, getMeta)), { retain: true }); } catch {}
}

function start(opts) {
  opts = opts || {};
  const bridgeState = opts.bridgeState;
  const getMeta = opts.getMeta;
  if (!URL) { log("disabled (set HA_MQTT to a broker URL to enable)"); return; }
  let mqtt;
  try { mqtt = require("mqtt"); }
  catch { log("HA_MQTT is set but the 'mqtt' package isn't installed — run: npm install mqtt"); return; }

  const o = {
    reconnectPeriod: 5000, connectTimeout: 8000,
    will: { topic: AVAIL_TOPIC, payload: "offline", retain: true, qos: 0 },
  };
  if (process.env.HA_MQTT_USER || process.env.KPOP_MQTT_USER) o.username = process.env.HA_MQTT_USER || process.env.KPOP_MQTT_USER;
  if (process.env.HA_MQTT_PASS || process.env.KPOP_MQTT_PASS) o.password = process.env.HA_MQTT_PASS || process.env.KPOP_MQTT_PASS;
  if (URL.startsWith("mqtts://")) {
    const ca = process.env.HA_MQTT_CA || process.env.KPOP_MQTT_CA;
    if (ca) { try { o.ca = fs.readFileSync(ca); } catch (e) { log(`CA read failed (${e.message}) — continuing`); } }
    if ((process.env.HA_MQTT_INSECURE || "").trim() === "1") o.rejectUnauthorized = false;
  }

  try { client = mqtt.connect(URL, o); }
  catch (e) { log(`connect failed: ${e.message}`); client = null; return; }

  client.on("connect", () => {
    log(`connected ${URL} -> device '${NODE}'`);
    try { client.publish(AVAIL_TOPIC, "online", { retain: true }); } catch {}
    publishDiscovery();
    publishState(bridgeState, getMeta);
    if (timer) clearInterval(timer);
    timer = setInterval(() => publishState(bridgeState, getMeta), STATE_INTERVAL);
    if (timer.unref) timer.unref();
  });
  client.on("error", (e) => log(`error: ${e.message}`));
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (client) {
    try { client.publish(AVAIL_TOPIC, "offline", { retain: true }); } catch {}
    try { client.end(true); } catch {}
    client = null;
  }
}

module.exports = { start, stop };
