# VoxelEngine on macOS

Brief setup + run instructions for the Mac side of this engine. The
Windows path is `Start_Everything.bat`. On macOS the equivalent is two
scripts: `install-mac.sh` (run once) and `start-mac.sh` (run every
time).

The engine itself is the same on both platforms — same `ai-bridge/
server.js`, same WebGL frontend. The Mac-specific pieces are just the
launcher and a handful of caveats listed below.

---

## Prerequisites

- **macOS 11 (Big Sur) or newer.** Tested on Apple Silicon and Intel.
- **Node.js 18+**. The installer script checks for it. Quickest path:

  ```bash
  # if you don't have Homebrew yet:
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # then:
  brew install node
  ```

  Or get the official installer from <https://nodejs.org/>.
- **A modern browser**, ideally Chrome. The engine uses WebGL 2 + ES
  modules + WebAssembly — Safari works but is the least-tested path;
  Chrome/Edge/Firefox all work fine.

The engine has **no native dependencies**. No Xcode toolchain required,
no Metal SDK. The bridge's npm packages are all pure JavaScript, so
`npm install` never invokes a compiler. (Python is only needed if you
want the optional Python desktop-toast listener — see below — not for
the WebGL engine itself.)

---

## First-time setup

From the project root in a terminal:

```bash
chmod +x install-mac.sh start-mac.sh    # if your zip extraction didn't preserve exec bits
./install-mac.sh
```

The installer:
1. Verifies macOS and reports your CPU arch (Apple Silicon vs Intel).
2. Verifies `node` is on PATH and is version 18+.
3. Runs `npm install` inside `ai-bridge/` to fetch the bridge's
   dependencies (`ws`, `mqtt`, `selfsigned`, plus `bonjour-service` and
   `openrgb-sdk`). All are pure JavaScript — no compiler / Xcode needed.
4. Marks `start-mac.sh` as executable.
5. Reports whether Chrome is present (it'll be preferred over Safari
   when launching).

Idempotent — re-running is safe and skips work that's already done.

---

## Running

```bash
./start-mac.sh
```

What happens:
1. Checks port 8787. If something's already there, opens the browser
   to it and exits (avoids fighting with a stale instance).
2. Starts `ai-bridge/server.js` in the background.
3. Waits up to 5 seconds for the server to bind.
4. Opens Chrome (or Chromium, or your default) to <http://localhost:8787/>.
5. Stays in the foreground showing server logs. **Press Ctrl-C** in
   this terminal to stop the server cleanly.

If you want to leave the engine running and use a different terminal
for other work, just open another Terminal tab. The server lives in
the original tab until you Ctrl-C.

---

## Differences from the Windows launcher

`Start_Everything.bat` runs the server hidden and also starts the
**KPopupListener** — a PowerShell service that pops Windows toast
notifications when the engine emits certain events. That service is
Windows-specific (uses `Windows.UI.Notifications`, named pipes, etc.)
and has no Mac counterpart. The engine's own narrative/toast UI inside
the browser still works fine — only the *desktop OS toast bridge* is
absent.

If your friend *does* want desktop toasts on macOS, there's now a
cross-platform **Python listener** at `../KPop Listener/KPopListener.py`
(`python3 KPopListener.py`, or the engine's Settings → Engine: Python →
Listener: Start). Optional — not needed for WebGL testing.

Everything else (server, ports, browser open) is 1:1.

---

## Apple Silicon notes

- `node --version` should report a recent LTS (18+, 20+ ideal). On
  Apple Silicon, prefer the arm64 build of Node — Homebrew defaults to
  it. Running x86_64 Node under Rosetta works but launches slower and
  the WS dependency does no native compilation so there's no benefit.
- Chrome and Safari both expose WebGL 2 + Metal-backed GPU. Frame rate
  should be excellent (60fps locked on M-series in our tests). If
  you're seeing 30fps, check Chrome's `chrome://gpu` page — make sure
  hardware acceleration isn't disabled.

---

## Troubleshooting

**"Port 8787 already in use" when no engine is running.**
Some other process grabbed the port. Find and kill it:
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
# Note the PID, then:
kill <PID>
```

**Browser opens but page is blank or shows a CORS error.**
The server didn't fully bind before the browser opened. Reload the
page after a few seconds, or stop (Ctrl-C) and re-run `./start-mac.sh`.

**Chrome blocks WebSocket on localhost.**
Rare but happens after certain enterprise security policies. The
engine still loads the static page; only the AI Brain bridge fails to
connect. Try in an Incognito window or a different browser.

**`npm install` fails with permission errors.**
You've installed Node via the official .pkg with strict permissions.
Fix by re-installing via Homebrew (which puts Node in a user-owned
prefix), or run with `sudo npm install` (less recommended).

**Editing engine files but changes don't show up.**
Hard-refresh the browser: ⌘+Shift+R. Service workers and module
caches can be sticky.

**`./start-mac.sh: Permission denied`.**
The exec bit got stripped on extraction. Run:
```bash
chmod +x install-mac.sh start-mac.sh
```

---

## Stopping the engine

Press **Ctrl-C** in the terminal running `start-mac.sh`. The script
traps the signal, kills the Node server cleanly, prints "Stopped",
and exits.

If you accidentally closed the terminal without Ctrl-C and the server
is still running:
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN     # find PID
kill <PID>
```

---

## What's in this repo for Mac users

```
voxelengine/
├── install-mac.sh             ← run once
├── start-mac.sh               ← run every time
├── README-mac.md              ← this file
├── Start_Everything.bat       ← Windows equivalent (ignore on Mac)
├── ai-bridge/                 ← Node server + WS relay
│   ├── server.js
│   ├── package.json
│   └── node_modules/          (created by install-mac.sh)
├── KPopupListener/            ← Windows-only PowerShell service (ignore)
├── main.js                    ← engine entry
├── render/  world/  gpu/ ...  ← engine modules
└── GPU_Assets/                ← drop .glb files here for the asset loader
```

`KPopupListener/` is harmless on Mac — the engine doesn't try to talk
to it unless it's running. Leave the folder alone or delete it; either
is fine.
