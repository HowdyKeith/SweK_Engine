# VBA Engine Panel

Serves `www/` over a tiny static server on the ingress port; HA shows it as a
sidebar panel and handles authentication and the secure connection.

## Options
| Option       | Type | Purpose |
|--------------|------|---------|
| `bridge_url` | str? | Your Node bridge base URL, if the engine should pull live state directly (e.g. `http://192.168.11.50:8787`). |
| `title`      | str? | Sidebar/panel title override. |

## Reading Home Assistant data from the panel
The panel runs as an ingress **iframe**, so it can't import the `hass` object the
way a `panel_custom` JS module can. Two options:
- Talk to HA's **WebSocket/REST API** from inside the iframe.
- Have the engine pull engine telemetry from your **Node bridge** (`bridge_url`)
  — the same data the MQTT-discovery module publishes to HA as entities.

## Ingress gotchas
- **Relative paths only** in HTML/JS asset references.
- The container must listen on `ingress_port` (8099). The bundled `server.js`
  reads `INGRESS_PORT`.
- Not available on HA **Core/Container** (no Supervisor). There, register the
  engine with `panel_custom` (drop the build in `/config/www/`) or ship it as a
  HACS frontend module via `frontend.extra_module_url`.

## Verify in Home Assistant
None of this was exercised against a live Supervisor here — confirm the add-on
builds, starts, and the ingress panel loads on your HA OS instance.
