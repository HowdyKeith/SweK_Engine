# HA control + Blink motion → engine (bridge `/ha/*`)

`haBridge.js` is the generalized Home Assistant proxy in the AI bridge. The
browser GL window never talks to HA directly (CORS + you don't want the token
in browser JS) — it goes through the bridge, which holds the token.

## Enable — where to put your HA URL + token
Two ways; pick one (no new npm deps — node http/https, like `haSolar.js`):

**Easy: a config file.** In the bridge folder (`ai-bridge/`, next to `server.js`),
copy `ha.config.example.json` to **`ha.config.json`** and fill it in:

    {
      "HA_URL": "http://homeassistant.local:8123",
      "HA_TOKEN": "your-long-lived-access-token",   // HA Profile > Security
      "HA_MOTION_ENTITIES": ["binary_sensor.front_door_motion_detected"],
      "HA_MOTION_POLL_MS": 1500
    }

The bridge reads it at startup. Keep `ha.config.json` local / out of git — it
holds your token. (Leave `HA_MOTION_ENTITIES` empty to auto-discover all motion
sensors.)

**Or: environment variables** (these OVERRIDE the file — handy for a one-off):

    $env:HA_URL   = "http://homeassistant.local:8123"   # PowerShell
    $env:HA_TOKEN = "your-long-lived-access-token"
    node server.js

`HA_MOTION_ENTITIES` is optional: if unset, the bridge auto-discovers every
`binary_sensor.*` whose `device_class` is `motion` (Blink cameras expose
exactly that) and watches all of them.

## Routes (served by `server.js`, same origin as the engine)

| Route | Method | Returns |
|---|---|---|
| `/ha/status` | GET | `{available, version}` — is HA reachable + token valid |
| `/ha/states?domain=light` | GET | trimmed entity list (id, state, name, device_class, unit) |
| `/ha/call` | POST | body `{domain, service, data}` → calls the HA service |
| `/ha/events?since=N` | GET | motion events after seq N (poll path, for VBA) |
| `/ha/stream` | GET | Server-Sent Events stream of motion events (push, for the GL window) |

## Motion → robot alarmed
A Blink camera that sees someone flips `binary_sensor.<cam>_motion_detected`
to `on`. The bridge polls those sensors (~1.5 s), and on a genuine off→on edge
pushes a `{type:"motion", entity_id, name, at}` event to `/ha/stream` (and the
`/ha/events` ring buffer).

The `home_assistant_control` demo subscribes to `/ha/stream` and, on a motion
event, (1) flashes the panel ALARM, (2) fires an in-engine toast, and (3)
dispatches a global hook so your own robot/entity can react:

    window.onHaMotion = (ev) => yourRobot.setState("alarmed");
    // or
    window.addEventListener("ha-motion", (e) => yourRobot.alarm(e.detail));

The demo's `🤖` indicator is just the built-in reference reaction — wire the
hook to whatever entity in your world should panic.

## Call services from the GL window (lights, scenes, TV, cameras…)
`POST /ha/call` proxies `POST /api/services/{domain}/{service}`. Examples:

    { "domain":"light", "service":"toggle", "data":{"entity_id":"light.lamp"} }
    { "domain":"scene", "service":"turn_on", "data":{"entity_id":"scene.movie"} }

Open the Blink app on an Android TV that HA has integrated (Android TV / Cast
integration, ADB enabled for app launch):

    { "domain":"media_player", "service":"play_media",
      "data":{ "entity_id":"media_player.living_room_tv",
               "media_content_type":"app",
               "media_content_id":"com.immediasemi.android.blink" } }

(Exact package id / whether app-launch vs. stream-cast is supported depends on
your TV + integration. Casting a camera stream instead uses `camera.play_stream`
or `media_player.play_media` with the camera's stream URL.)

## Caveats (honest)
- **Untested against a live HA in this build.** Verify on your box.
- Polling latency = `HA_MOTION_POLL_MS`; Blink sensors latch `on` long enough
  to catch. For instant push, HA's WebSocket API is the upgrade (the bridge
  already depends on `ws`).
- `/ha/call` lets anything on the LAN that can reach the bridge call any HA
  service. Keep the bridge LAN-local; don't expose it to the internet.
- The token lives only on the bridge (env), never in the browser.

## One-tap actions (v2)
The control panel now has a config row (your TV + Blink entity ids) and preset
buttons that fire through `/ha/call`, so the common actions aren't hand-typed:

- **📺 Blink on TV** — `media_player.play_media` app-launch of the Blink app on
  your `media_player` (set the TV entity once). App-launch needs the Android TV
  integration with ADB; to cast the live stream instead, use `camera.play_stream`.
- **📸 Trigger cam** — `blink.trigger_camera` (forces a fresh image/clip).
- **🔔 Arm / 🔕 Disarm** — `alarm_control_panel.alarm_arm_away` / `alarm_disarm`
  on your Blink entity. NOTE: some Blink integration versions expose arming as a
  `switch` instead — if so, change those two buttons to `switch.turn_on/off`.

Clicking an entity in the browser auto-fills the TV field (if it's a
`media_player`) or the Blink field (if it's `alarm_control_panel` / contains
"blink"), so setup is mostly clicking.

## Wiring a REAL in-world robot
The panel ships an animated 🤖 avatar that panics on motion — that's the
reference reaction. To make an actual entity in YOUR world react instead (you
know your scene/entity API, the demo doesn't), set the global hook anywhere in
your engine code or the console:

    window.onHaMotion = (ev) => {
        // ev = { type:"motion", entity_id, name, at }
        const robot = world.getEntity("patrol_bot");   // your API
        robot.setState("alarmed");
        robot.lookAt(/* the door, a spawn point, etc. */);
    };

    // or listen for the event (multiple handlers, decoupled):
    window.addEventListener("ha-motion", (e) => myRobot.alarm(e.detail));

Both fire on every Blink motion edge, whether or not the control panel is the
active demo's window — as long as something subscribed. (The panel subscribes
while open; for an always-on reaction, open one EventSource("/ha/stream") at
engine startup and call your reaction from its onmessage.)
