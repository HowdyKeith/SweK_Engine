# Real solar values from Home Assistant (HA -> bridge -> panel)

`haSolar.js` pulls actual solar entity states from HA **when HA is reachable**,
caches them, and the panel/engine read them. HA owns the data (its inverter
integration); the engine never invents solar numbers. If HA is down, `available`
goes false and the last-known values stay (flagged `stale`).

## Enable (no new npm deps — uses node http/https)
Set env on the bridge:
    HA_URL=http://homeassistant.local:8123
    HA_TOKEN=<long-lived access token>          # HA Profile > Security
    HA_SOLAR_ENTITIES=sensor.solar_power,sensor.solar_energy_today,sensor.grid_power,sensor.battery_level
    HA_SOLAR_POLL_MS=15000

## Wire into server.js
    const haSolar = require("./haSolar.js");
    haSolar.start();
    // in the request router:
    if (req.method === "GET" && req.url === "/ha/solar") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(haSolar.latest())); return;
    }

## Panel reads it
    const r = await fetch(bridgeUrl + "/ha/solar");
    const { available, stale, values } = await r.json();
    // values["sensor.solar_power"] = { state, unit, name, ts }

## Find your entity ids
HA > Developer Tools > States — filter for your inverter/solar sensors.

## Verify in HA
Untested against a live HA here: confirm the token works (GET /api/ → 200), the
entity ids exist, and /ha/solar returns real numbers.
