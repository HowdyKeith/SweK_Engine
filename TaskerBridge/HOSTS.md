# Dual host — Node or the VBA transmitter (keep both)

The Tasker panel can be served by **either** host, because both expose the same
contract:

| Endpoint        | Node `server.js`            | Transmitter `modTaskerHost.bas`        |
|-----------------|-----------------------------|----------------------------------------|
| panel page      | `/` (index.html, 3 files)   | `/tasker` (serves `panel.html`)        |
| `GET /api/tasks`   | ✓                        | ✓                                      |
| `POST /api/trigger`| ✓ (4 backends)           | ✓ (MQTT publish — the transmitter's strength) |
| `GET /api/health`  | ✓                        | ✓                                      |

The panel's JS calls **relative** `./api/*`, so it doesn't care which host serves
it — open the Node URL or the transmitter URL and it just works. `panel.html` is a
self-contained build of the 3 files (regenerate it if you edit them).

## Why keep both

- **Node** — better for the high-frequency, multi-client engine bridge (10 Hz AI
  ticks, several browsers). Keep it for those modes.
- **Transmitter** — no extra process, native MQTT, and it's already running when
  you're using the gateway. Great for the control panels and low-frequency work.
- A single-threaded Excel 3D engine + a concurrent Excel socket server in the same
  process is the pairing to be careful with — that's the main reason to let Node
  carry the fast bridge while the transmitter carries the panels.

## Auto-switch

`public/hostResolve.js` probes a preference-ordered list of origins
(`/api/health`) and returns the first that answers — so a launcher or the engine
can prefer Node and fall back to the transmitter (or vice-versa) automatically:

```js
import { resolveHost } from "./public/hostResolve.js";
const base = await resolveHost([
  "http://localhost:8790",     // prefer Node
  "http://192.168.11.20:8099"   // else the transmitter
]);
```

The same idea ports to the VBA engine bridge (`Shared/modEngineBridge.bas`): probe
the preferred port, fall back to the other. That's a small, separate change to wire
when you want the engine to auto-select — noted, not built yet.
