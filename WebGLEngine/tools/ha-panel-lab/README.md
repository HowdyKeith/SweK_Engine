# HA Panel Lab

A mock Home Assistant harness for developing custom Lovelace cards **without a
running HA instance**. Drop a card into `panels/`, drive a fake `hass` object
with sliders, and watch the card react live — the same dev loop the engine's
`demos_code/` folder gives for world demos, applied to HA panels.

## Why this exists

A Home Assistant card is just a custom element that receives a `hass` object
(a `.states` map of `entity_id → { state, attributes }`) and re-renders when
HA calls `set hass`. This harness fakes exactly that: it builds a mock `hass`,
instantiates your card, and re-pushes `hass` on every control change. So you
get a tight edit → reload → test loop right in your dev environment.

## Run it

ES module imports and the manifest fetch need http (not `file://`). Serve the
folder with Node:

```powershell
cd ha-panel-lab
npx serve            # or:  npx http-server -c-1
```

Open the printed URL (e.g. `http://localhost:3000`).

## Use it

- **Panel** — pick from the dropdown (populated from `panels/manifest.json`),
  or type a filename and "Load file" to try one ad-hoc.
- **Config (JSON)** — the card's YAML config, as JSON. Edit and "Apply config"
  to re-run `setConfig`.
- **Mock entities** — sliders for battery / sun elevation / sun azimuth / cloud
  cover, plus scenario presets and a **Run day cycle** button that animates the
  sun across the sky so you can watch day→dusk→night transitions live.
- **Raw hass.states** — edit arbitrary entities as JSON for cards that read
  states beyond the four sliders. "Apply raw" overrides the sliders; "Sync from
  sliders" goes back.

## Add your own panel

1. Copy your card's `.js` into `panels/`.
2. Add an entry to `panels/manifest.json`:
   ```json
   {
     "file": "my-card.js",
     "tag": "my-card",            // the custom element your file registers
     "name": "My Card",
     "config": { "entity": "sensor.something" }
   }
   ```
3. Hit **Reload** in the sidebar.

The harness imports the file (which self-registers its element via
`customElements.define`), creates `<tag>`, calls `setConfig(config)`, then sets
`.hass`. If the element tag doesn't match, the harness tells you.

## Fits the engine project

This mirrors the engine's drop-in `demos_code/` convention: a folder of
self-contained modules + a tiny harness that auto-loads them. You can keep it
in the repo as `tools/ha-panel-lab/`. When the VBA Winsock → MQTT → HA loop is
live, the *real* `hass` will carry the same entities this harness mocks, so a
card developed here drops straight onto the real dashboard.

## Limits (first pass)

- Cards that load Three.js (like the solar card) need internet — same CDN note
  as the card itself.
- No `customElements` un-registration: loading a *different* file that defines
  the *same* tag won't re-define it. Refresh the page to fully reset.
- Mock `hass` implements the common surface (`states`, `callService`,
  `formatEntityState`); a card using a more exotic `hass` API may need that
  method stubbed in `makeHass()`.
