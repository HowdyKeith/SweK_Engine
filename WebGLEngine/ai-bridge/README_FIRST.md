# ai-bridge — read this first

A tiny Node.js process that does **three things on one port** (8787):

1. **Serves the engine's static files** — open `http://localhost:8787/` in
   a browser and the page loads. No second server needed.
2. **Receives VBA's HTTP POSTs** — `World_PlaceGLBAsMesh`, `World_PlaceGLB`,
   etc. all hit `POST /voxel-update`.
3. **Broadcasts to the browser via WebSocket** — `ws://localhost:8787`.
   Same origin as the page, so zero CORS friction.

You used to need a separate page server (e.g. `python -m http.server`).
v3 (May 2026) folded the static-file role into the relay so you only
launch one thing.

## First-time setup (REQUIRED)

```powershell
cd C:\VoxelEngine\ai-bridge
npm install
```

Installs the `ws` dependency. One-time per machine.

## Running

```powershell
cd C:\VoxelEngine\ai-bridge
node server.js
```

Successful start prints:

```
[relay] HTTP+WS+static on :8787
[relay] page:        http://localhost:8787/
[relay] health:      http://localhost:8787/health
[relay] VBA POST:    http://localhost:8787/voxel-update
[relay] WS:          ws://localhost:8787
[relay] engine root: C:\VoxelEngine
```

Then open `http://localhost:8787/` in a browser. That's the whole setup.

## Endpoints

| URL | Method | Purpose |
|---|---|---|
| `/` | GET | Serves `index.html` (the page) |
| `/anything-else` | GET | Serves files from the engine root (e.g. `/main.js`, `/GPU_Assets/alien/mesh.json`) |
| `/health` | GET | JSON heartbeat — confirms relay is alive and shows connected client count |
| `/voxel-update` | POST | VBA target. Body is a JSON command; relay broadcasts it to every connected WS client. |
| `ws://...:8787` | WS | Browser connects here on load (`bridge/wsBridge.js`); receives the broadcast commands. |

Path traversal (`../../etc/passwd` and friends) is blocked — the
static handler refuses anything that resolves outside the engine
root.

## Launcher shortcuts (Windows)

| File | Purpose |
|---|---|
| `First_Start_AI_Bridge.bat` | Runs `npm install` then `node server.js` in a visible cmd window. Use once. |
| `First_Start_AI_Bridge.lnk` | Double-clickable shortcut to the .bat. |
| `start_ai_bridge.vbs` | Starts `node server.js` **hidden** (no terminal window) and opens `http://localhost:8787/` in the default browser. **Edit the URL inside if you'd previously been pointing it at port 3000 — the page now lives on 8787 alongside the relay.** |
| `restart_ai_bridge.vbs` | Kills any running `node.exe`, then starts the relay hidden. Useful when wedged. |
| `Bridge_Dashboard.lnk` | Pinned shortcut to whichever URL you want quick access to (e.g. `http://localhost:8787/`). |
| `cmd_exe.lnk` | Plain `cmd.exe` opened in this folder. |

All `.vbs` launchers hard-code `C:\VoxelEngine\` as the engine root.
Edit the `cd /d` paths if you've extracted elsewhere.

## Verifying it works

Three quick checks from a browser:

1. `http://localhost:8787/health` → returns `{"ok":true,"subscribers":N,...}`. If `subscribers` is 0, no browsers are connected yet.
2. `http://localhost:8787/` → loads the page. Open dev tools (F12) — console should show `[WSBridge] connected ws://localhost:8787`.
3. After step 2, hit `/health` again → `subscribers` should now be ≥ 1.

If a VBA macro POSTs to `/voxel-update` and the relay logs `-> 0 client(s):`, the browser isn't actually connected — start over at step 2.
