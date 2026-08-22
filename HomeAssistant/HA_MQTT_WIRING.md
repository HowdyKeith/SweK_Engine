# Wiring HA MQTT discovery into the Node bridge

`haDiscovery.js` makes the VBA transmit engine show up in Home Assistant as a
device with entities — without emulating the ESPHome native API. It rides on the
MQTT broker HA already has (the official **MQTT** integration auto-creates the
device from the discovery topics).

## 1. Install the mqtt package (same one the bridge already uses optionally)
    npm install mqtt

## 2. Drop the file next to server.js
    ai-bridge/haDiscovery.js

## 3. Add two lines to server.js
Near the other `require`s:

    const haDiscovery = require("./haDiscovery.js");

After `wss` and `bridgeState` exist (e.g. just before `server.listen(...)`):

    haDiscovery.start({
      bridgeState,                                   // the live state object
      getMeta: () => ({ subscribers: wss.clients.size }),
    });

(Optionally call `haDiscovery.stop()` in your shutdown handler.)

## 4. Point it at your broker (env vars)
| Variable               | Default            | Notes |
|------------------------|--------------------|-------|
| `HA_MQTT`              | (falls back to `KPOP_MQTT`) | broker URL, e.g. `mqtt://192.168.11.50:1883` or `mqtts://...`. **Required** to enable. |
| `HA_MQTT_USER` / `_PASS` | (falls back to KPOP_*) | broker credentials |
| `HA_MQTT_CA`           | —                  | CA file path for `mqtts://` |
| `HA_MQTT_INSECURE`     | —                  | `1` to skip TLS verify (self-signed) |
| `HA_DISCOVERY_PREFIX`  | `homeassistant`    | must match HA's MQTT discovery prefix |
| `HA_NODE_ID`           | `vba_transmit_engine` | device/topic id |
| `HA_STATE_INTERVAL_MS` | `1000`             | state publish rate |
| `HA_STALE_MS`          | `5000`             | "Engine Online" flips OFF if no VBA tick within this |

Example (PowerShell):

    $env:HA_MQTT = "mqtt://192.168.11.50:1883"
    $env:HA_MQTT_USER = "mqtt_user"; $env:HA_MQTT_PASS = "secret"
    node server.js

## Entities created
`Engine Online` (connectivity), `Tick`, `Total Ticks`, `Enemies`, `Player Health`,
`Directives Queued`, `WS Subscribers`, `Last Event`, `Last Seen (s ago)`. Fields
absent from `bridgeState.latest` simply report unknown — add rows to the
`ENTITIES` table in `haDiscovery.js` to expose more (e.g. solar/energy values).

## How it maps to your data
`bridgeState.latest` is the most recent `{ tick, t_ms, player, enemies, events }`
posted by VBA to `/bridge/game_tick`; `lastTickMs` drives the online/stale flag;
`directives` is the queue depth; `subscribers` comes from `getMeta`.

## Verify in Home Assistant
Not exercised against a live broker/HA here. Confirm: the `mqtt` package installs,
the device appears under **Settings → Devices & Services → MQTT**, entities update
at your interval, and `Engine Online` flips with VBA tick liveness. Discovery
configs are published **retained**, so they survive HA restarts; clear them by
publishing empty payloads to the `.../config` topics if you rename things.
