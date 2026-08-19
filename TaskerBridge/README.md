# TaskerBridge

A **single-purpose** web control panel + Node server. It serves one panel and
fires its buttons at one set of backends. This instance triggers **Tasker**
(Android) tasks; clone the folder and swap `config.json` to make a slim panel for
anything else — e.g. an Excel/VBA interface that POSTs to your smart transmitter.

It's the "web page on my phone that triggers things" idea, kept deliberately small
and separate from the full engine bridge.

## Run

```bash
cd TaskerBridge
cp config.example.json config.json     # then edit it
node server.js                          # http://localhost:8790
```

Open it on your phone via this machine's LAN IP (`http://<pc-ip>:8790`). Core
backends need **no npm install**; the MQTT backend is optional (`npm i mqtt`).

## Backends (pick per task in `config.json`)

- **`autoremote`** — GET to joaomgcd's AutoRemote cloud endpoint, which triggers
  the matching AutoRemote profile in Tasker. Needs your AutoRemote `key`. Works
  from anywhere; can also be fired by an email→IFTTT→AutoRemote chain.
- **`tasker_http`** — POST/GET straight to the phone's own **Tasker HTTP Request**
  server (Tasker 6.2+: a profile with the *HTTP Request* event opens a port and
  fires on matching requests). LAN only, no cloud, no companion app.
- **`mqtt`** — publish a topic/payload. The phone runs an **MQTT-Client Tasker
  plugin** subscribed to the topic. This is the natural path **through your VBA
  smart transmitter**, which already speaks MQTT (with HA autodiscovery).
- **`ha`** — call a Home Assistant service (pairs with the **TaskerHA** HACS
  integration that exposes `tasker.perform_task` etc.). Routes Tasker through your
  HA add-on — that's the "hatasker" panel path. Needs HA URL + long-lived token.

## config.json

```jsonc
{
  "name": "VBA Engine · Tasker Deck",
  "port": 8790,
  "backends": {
    "autoremote": { "key": "..." },
    "tasker_http": { "baseUrl": "http://192.168.11.50:1821" },
    "mqtt": { "url": "mqtt://192.168.11.10:1883", "username": "", "password": "" },
    "ha": { "baseUrl": "http://homeassistant.local:8123", "token": "..." }
  },
  "tasks": [
    { "id":"flash", "label":"Flash Lights", "icon":"💡", "backend":"autoremote", "message":"flash_lights" }
    // tasker_http: { ..., "method":"POST", "path":"/toast", "body":"hi" }
    // mqtt:        { ..., "topic":"tasker/cmd", "payload":"wifi:off" }
    // ha:          { ..., "domain":"tasker", "service":"perform_task", "data":{"name":"Goodnight"} }
  ]
}
```

The panel reads `/api/tasks` (secrets stripped) and renders a button per task.
`POST /api/trigger {id}` fires it. `GET /api/reload` re-reads config without a
restart.

## Clone it for an Excel/VBA interface

Copy the folder, point the tasks at your transmitter's HTTP/MQTT endpoints (or add
a tiny backend in `server.js`), and you have a focused web console for that one
job — same pattern, different config.

## Honest notes

- Untested end-to-end here (no Android/broker in the build env). Verify each
  backend on-device.
- The MQTT Tasker plugins are hobbyist-maintained ("rough around the edges").
- Put this behind your LAN / a reverse proxy with auth if you expose it; the
  trigger endpoint has no auth of its own.
