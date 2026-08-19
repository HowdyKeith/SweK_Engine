# Solar 3D Card — Home Assistant custom Lovelace card (first pass)

Renders your solar telemetry as a live 3D scene: a sun that sits at its real
sky position, a glowing battery charge column, cloud puffs that thicken with
cover, and solar panels that catch light as generation rises.

This is a **first pass** — read-only visualization, configured via YAML.

![scene](preview-not-included)

## What it shows

| Element | Driven by |
|---|---|
| Sun position + sky color (day → dusk → night) | `sun.sun` `elevation` + `azimuth` attributes |
| Battery charge column (red → amber → green, with %) | your battery entity's state (0–100) |
| Cloud cover | weather entity's `cloud_coverage` attribute (or inferred from state) |
| Panel glow ("generation") | sun elevation × clear-sky fraction |
| Stars | fade in when the sun is below the horizon |

Drag to orbit, scroll to zoom; the camera also slowly auto-orbits.

## Try it before installing

Open **`solar-3d-preview.html`** in any modern browser (Chrome recommended).
It runs the exact same renderer the card uses, with sliders + scene presets
(Dawn / Noon / Dusk / Night / Storm) so you can see the look immediately —
no Home Assistant needed. (Requires internet: Three.js loads from a CDN.)

## Install in Home Assistant

### Manual
1. Copy **both `solar-3d-card.js` and `three.module.js`** into `config/www/`
   (served at `/local/solar-3d-card.js`). Keeping `three.module.js` beside the
   card is what makes it work on an **offline / internet-isolated** HA frontend.
2. Settings → Dashboards → ⋮ → **Resources** → Add Resource:
   - URL: `/local/solar-3d-card.js`
   - Type: **JavaScript Module**
3. Add the card to a dashboard (YAML below). It also appears in the
   "Add Card" picker as **Solar 3D Card**.

### Card configuration (YAML)
```yaml
type: custom:solar-3d-card
battery_entity: sensor.solar_battery_level   # any entity whose state is 0–100
sun_entity: sun.sun                          # default; provides elevation/azimuth
weather_entity: weather.home                 # optional; provides cloud cover
title: Solar                                 # optional overlay label
height: 340                                  # optional, px (default 320)
```

Only `battery_entity` really needs changing — `sun.sun` exists on every HA
install, and `weather_entity` is optional (cloud cover defaults to light).

## Notes & limitations (first pass)

- **Three.js is vendored locally** (`three.module.js`, ~640 KB) and loaded
  local-first: the card imports `./three.module.js` if it's present beside the
  card, and only falls back to the `esm.sh` CDN if it isn't. So an offline HA
  install works as long as you copied both files; an online one still works
  even if you forget `three.module.js`.
- No visual config editor yet — configure via YAML.
- Read-only. No interaction back to HA (no tap actions, no controls).
- Generation is an *estimate* from sun + cloud, not a real power reading. A
  future version can read an actual `sensor.solar_power` entity.

## How it fits the bigger picture

This is the front-end half of an "Excel runs my smart home" loop: a VBA
Winsock/MQTT client publishes telemetry to Home Assistant with mDNS
autodiscovery, and this card renders that same data in 3D on the dashboard.
The scene builder (`buildSolarScene`) is deliberately separated from the HA
card wrapper so it can be reused — including, eventually, swapping in the
WebGL voxel engine as the renderer.

## Roadmap ideas

- Real `solar_power` / `grid` / `load` entities → animated energy flow
- Day arc trail showing the sun's path; clock/time-of-day readout
- Visual config editor + entity pickers
- HACS distribution metadata
