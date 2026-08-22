# RGB lights — 3 backends with auto-fallback (bridge `/rgb/*`)

`rgbBridge.js` controls your RGB hardware from the engine. The browser can't
reach the hardware directly (OpenRGB SDK = raw TCP 6742; Razer Chroma = fiddly
localhost session; CLI = one-shot), so the Node bridge owns it and exposes
`/rgb/*`. It tries three backends and uses the first that's up; if the live one
errors mid-call it falls back to the next automatically.

## Backends (priority order)
1. **openrgb_sdk** — persistent TCP client (`npm install openrgb-sdk` in `ai-bridge`).
   Best: live, per-device, controls Razer + light bars from one place. Needs
   OpenRGB running with **Enable SDK Server** (Settings → SDK Server, port 6742).
2. **openrgb_cli** — shells out to `OpenRGB.exe` (one-shot). No npm dep; great
   for solar updates + on/off, laggier for a live picker. Set `OPENRGB_CLI` to
   the binary path if it's not on PATH.
3. **ha** — `light.turn_on {rgb_color}` via the HA bridge. Use when the bars are
   HA `light.*` entities (e.g. via the OpenRGB HA integration in HACS).

OpenRGB already drives most Razer gear, so you usually don't need a separate
Razer path — let OpenRGB own both the Razer device and the bars.

## Setup
1. `cd ai-bridge && npm install` (pulls `openrgb-sdk`; if it's missing the SDK
   backend just reports unavailable and the bridge falls back — nothing crashes).
2. Copy `ai-bridge/rgb.config.example.json` → `rgb.config.json` and fill in:
   - `RGB_BACKEND`: `auto` (or force one).
   - `OPENRGB_HOST`/`OPENRGB_PORT`: usually `127.0.0.1` / `6742`.
   - `OPENRGB_CLI`: command/path for the CLI fallback.
   - `HA_RGB_ENTITIES`: your `light.*` ids (HA backend + default solar targets).
   - `SOLAR_BATTERY_ENTITY` + `SOLAR_FOLLOW`: tint the lights by battery %.
3. Open the **RGB LIGHTS — CONTROL** demo from the menu.

## Routes
| Route | Method | Body | Does |
|---|---|---|---|
| `/rgb/status`  | GET  | — | active + which backends are up |
| `/rgb/devices` | GET  | — | devices/entities on the active backend |
| `/rgb/set`     | POST | `{id, color}` | set a device/entity to a hex color |
| `/rgb/off`     | POST | `{id}` | off (omit/`"all"` = everything) |
| `/rgb/backend` | POST | `{backend}` | force `auto`/`openrgb_sdk`/`openrgb_cli`/`ha` |
| `/rgb/solar`   | POST | `{follow}` | toggle solar-battery tinting |

## Solar → battery color
With `SOLAR_FOLLOW` on (or the panel toggle), the bridge polls
`SOLAR_BATTERY_ENTITY` every `SOLAR_POLL_MS` and tints `SOLAR_TARGETS` (or all
devices) on a continuous **green (full) → amber → red (empty)** hue ramp. The
battery % comes through the HA bridge, so that side needs HA configured.

## Honest caveats
- **Untested against real hardware/OpenRGB/HA in this build.** Verify on your box.
- Device **indices/zones** depend on your hardware — confirm via `/rgb/devices`.
- The SDK backend needs OpenRGB running + SDK Server enabled; the CLI backend
  needs `OpenRGB.exe` reachable; the HA backend needs the bars as `light.*`.
- `--list-devices` text parsing may vary by OpenRGB version; if the CLI list is
  off, tell me the raw output and I'll adjust the parser.
- `/rgb/*` (like `/ha/*`) lets anything on the LAN command your lights — keep the
  bridge LAN-local.
