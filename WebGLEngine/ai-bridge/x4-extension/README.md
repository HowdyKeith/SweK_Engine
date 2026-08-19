# SweK X4 Telemetry — connector setup

The bridge connector (`x4Bridge.js`) is done and validated. X4 itself has no telemetry
API, so the data has to come from a community mod. You have **two** working paths — pick
one. Both require, in X4: **Settings → Extensions → turn OFF "Protected UI Mode"**.

---

## Path A — POLL mycumycu's "X4 External App" (fastest, richest data)

1. Install **djfhe's X4 HTTP client mod** (`x4_http`): download the repo ZIP, extract to
   `<X4>\extensions\`, rename the folder to **`djfhe_http`**.
   https://github.com/djfhe/x4_http
2. Install **mycumycu's X4 External App** (v3.3.1+ works on X4 8.0) and run its server.
   It serves data on a local port (default **8080**, LAN-accessible).
   https://github.com/mycumycu/X4-External-App  (also Nexus mod 818)
3. In the engine: enable the X4 connector in **poll** mode and point it at the app's data
   URL. From the phone/console:
   ```js
   await window.x4.setEnabled(true, { mode: "poll", pollUrl: "http://127.0.0.1:8080/" });
   ```
   (If the app exposes a dedicated JSON path rather than `/`, set `pollUrl` to that — the
   connector keeps the raw payload under `data.raw` so you can see the real field names in
   `x4.html` and tune the mapping if needed.)
4. Open **`/x4.html`** for the themed view.

**Trade-off:** you have to keep mycumycu's server running. Zero X4-mod code from us.

---

## Path B — PUSH from our own tiny extension (self-contained, no 3rd-party server)

Uses only djfhe's `x4_http` mod plus the small extension scaffolded next to this README
(`swek_x4_telemetry/`). The extension POSTs a JSON snapshot straight to the bridge at
`POST http://<bridge-ip>:8787/x4/state` on a timer — same "push to our port" pattern as
the Fallout and Starfield connectors.

1. Install **djfhe's `x4_http`** as in Path A step 1.
2. Copy `swek_x4_telemetry/` into `<X4>\extensions\`.
3. Edit `md/swek_x4_telemetry.xml` → set `$bridgeUrl` to your rig's bridge address
   (e.g. `http://127.0.0.1:8787/x4/state`, or the LAN IP for a remote viewer).
4. Enable the connector in **push** mode:
   ```js
   await window.x4.setEnabled(true, { mode: "push" });
   ```
5. Open **`/x4.html`**.

**HONEST STATUS:** the bridge ingest endpoint, the view, and the poller are tested and
clean. The in-game MD script (`swek_x4_telemetry.xml`) is a **scaffold** — I can't run X4
here, and djfhe_http's exact MD signal names must be confirmed against its current docs.
The data-gathering (`event.player.primaryship`, money, sector) is standard MD; the one
line to verify is the HTTP-request signal call (clearly marked `<!-- WIRE djfhe_http -->`).
Test it on the rig and send me the debug log if it doesn't fire and I'll correct it.

---

## Endpoints (both paths)

- `GET  /x4/state`   → `{ connected, ready, mode, source, ageMs, data: { player, money, ship, shipHull, shipShield, sector, logbook, missions, raw } }`
- `GET  /x4/status`  → connector config + freshness
- `GET  /x4/detect`  → poll: probes the URL · push: reports last-snapshot freshness
- `POST /x4/state`   → push ingest (connector must be enabled)
- `POST /x4/config`  → `{ enabled, mode, pollUrl, pollMs }`

Engine handle: `window.x4` — `.setEnabled(on,{mode,pollUrl})`, `.state()`, `.status()`,
`.detect()`, `.setAutoWatch(on)` (flip the connector on when X4 appears).
