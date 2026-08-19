---
type: claim
title: "homelable borrow -- SweK reads the Zigbee/IoT inventory without owning an MQTT stack"
description: "homelable owns the part SweK deliberately does not: the Zigbee / Z-Wave / MQTT / Proxmox topology of the house. Rather than SweK growing that stack, it reads homelable\\'s device in"
tags: [settled, "swek-engine", v2709]
timestamp: v2709
---

# homelable borrow -- SweK reads the Zigbee/IoT inventory without owning an MQTT stack

- **Status:** settled  
- **Since:** v2709

## Prediction

homelable owns the part SweK deliberately does not: the Zigbee / Z-Wave / MQTT / Proxmox topology of the house. Rather than SweK growing that stack, it reads homelable\'s device inventory and normalises it into SweK device records, so those IoT devices show up on the radar and in panels. Read-only, and homelable\'s key stays in homelable.

## Why

ai-bridge/homelableBridge.js. Verified against Pouzor/homelable: an MCP server on port 8001 (X-API-Key: mcp_sk_...) whose get_canvas tool returns the full node list, Zigbee coordinator/routers/end-devices included, imported from Zigbee2MQTT through HA\'s broker. parseCanvas normalises each node to { id, label, kind, mac, online }, kindFor maps homelable\'s 20 node types + 3 Zigbee types to SweK kinds (unknown -> generic, never a crash), and toRadarBlips feeds the v2708 radar manager, using each node\'s canvas position or a stable ring placement. fetchCanvas pulls it over MCP; the live connection is rig-side.

## Measured

ai-bridge/homelable-selfcheck.mjs, 5 checks. Types map to kinds with an unknown falling back to generic; parseCanvas reads id/label/kind/mac/online correctly; every device becomes a positioned blip namespaced hl:*; a bare array and null/empty input parse without throwing; and the parse is stable.

## Kill condition

ai-bridge/homelable-selfcheck.mjs. SABOTAGE: collapse the type map so every node reads as one kind, and the mapping check fails -- a borrowed inventory that cannot tell a Zigbee coordinator from a camera is not worth reading.

# Citations

- Code: ai-bridge/homelableBridge.js (parseCanvas, kindFor, toRadarBlips, fetchCanvas) + ai-bridge/homelable-selfcheck.mjs (5 checks, sabotage-tested). The MQTT/Zigbee borrow: homelable owns the IoT stack, SweK reads it read-only and puts the devices on the radar. Wiring a /homelab/devices route + the radar source is the rig-side finish.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
