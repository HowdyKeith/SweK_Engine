#!/usr/bin/env bash
# Start Mac SweK Engine.command — v751 — macOS launcher for EngineProject.
#
# Double-click this file in Finder to:
#   1. Start the Node.js ai-bridge (port 8787)
#   2. Start the Python KPopListener (cross-platform notifications)
#   3. Open Safari (or your default browser) to http://localhost:8787/
#
# v2551 -- WAS THIS A RESTART AFTER AN UPDATE?
#
# An update restarts the engine, which re-runs this launcher, which used to `open` a browser unconditionally. So
# an auto-update at 3am pops Safari open in front of whoever owns the machine -- which is exactly what happens on
# a box that sits running for weeks with nobody watching it.
#
# AN UPDATE MUST NEVER OPEN A BROWSER. If one is already open it reconnects on its own; if one is not, nobody is
# there to want it. There is no third case, so there is no need to detect a running browser -- the question was
# never "is a browser open", it was "did a human ask for this".
#
# server.js writes ~/.voxelbridge/just-updated.json before restarting and reads-and-CLEARS it after boot, on a
# timer. This launcher starts the server BEFORE it opens the browser, so the reading has to be taken HERE, at the
# top, before the server can clear it. Checking later would be a race against the very thing being asked.
SWEK_WAS_UPDATE=0
if [ -f "$HOME/.voxelbridge/just-updated.json" ]; then SWEK_WAS_UPDATE=1; fi

# Requirements:
#   * Node.js installed (https://nodejs.org or `brew install node`)
#   * Python 3 (macOS has it built-in at /usr/bin/python3)
#   * First-run only: `cd WebGLEngine/ai-bridge && npm install`
#
# To stop: close the Terminal window that opened, or use:
#   pkill -f "node.*server.js"
#   pkill -f "KPopListener.py"

set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
# v1544 — strip the macOS quarantine attribute off this folder so Gatekeeper doesn't block the
# launcher / inner scripts ("unidentified developer"). Harmless if already clear. (The very FIRST
# manual run still needs a one-time Control-click -> Open on this file; auto-updates clear it for you.)
xattr -dr com.apple.quarantine "$ROOT" 2>/dev/null || true

echo "============================================================"
echo " EngineProject — macOS launcher (v751)"
echo " Project root: $ROOT"
echo "============================================================"

# Sanity check: ai-bridge exists
if [ ! -f "WebGLEngine/ai-bridge/server.js" ]; then
    echo
    echo "ERROR: WebGLEngine/ai-bridge/server.js not found."
    echo "Are you running this from the EngineProject root folder?"
    echo "Expected layout:"
    echo "  EngineProject/"
    echo "    Start Mac SweK Engine.command   <- this file"
    echo "    KPop Listener/KPopListener.py"
    echo "    WebGLEngine/ai-bridge/server.js"
    echo
    read -p "Press Enter to close..."
    exit 1
fi

# v2857 -- WHY "npm: command not found" HAPPENS ON A MAC THAT HAS NODE INSTALLED.
#
# A .command file double-clicked in Finder is launched by launchd, NOT by your shell. It gets a minimal PATH --
# roughly /usr/bin:/bin:/usr/sbin:/sbin -- and never sources ~/.zprofile or ~/.zshrc, which is where the Homebrew
# shellenv line that adds /opt/homebrew/bin lives. `brew install node` puts node and npm in /opt/homebrew/bin on
# Apple Silicon or /usr/local/bin on Intel. NEITHER IS ON THAT PATH.
#
# So node is installed, `npm -v` works perfectly in Terminal, and this script cannot see it. The old message then
# said "Install Node.js first: brew install node" -- which sends you to reinstall something you already have.
# THAT IS THE WORST KIND OF ERROR MESSAGE: confident, specific, and pointing at the wrong thing.
#
# This is the SAME root cause as the Cloudflare tunnel failing to start on the Mac (v2856, ai-bridge/hostingBridge.js
# resolveBin) -- one layer earlier, in the launcher instead of the server. Both are "a GUI-launched process does
# not inherit your login PATH".
for _d in /opt/homebrew/bin /usr/local/bin /opt/local/bin; do
    case ":$PATH:" in *":$_d:"*) ;; *) [ -d "$_d" ] && PATH="$_d:$PATH" ;; esac
done
# If Homebrew is installed somewhere non-standard, let it speak for itself.
if ! command -v node >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
    eval "$(brew shellenv 2>/dev/null)" || true
fi
export PATH

if ! command -v node >/dev/null 2>&1; then
    echo
    echo "ERROR: node is not on this launcher's PATH."
    echo "  Searched: /opt/homebrew/bin /usr/local/bin /opt/local/bin (plus your inherited PATH)."
    echo
    echo "  If 'node -v' WORKS in a Terminal, node is installed and this is only a PATH problem:"
    echo "    it is installed somewhere unusual, or Homebrew's shellenv is not in ~/.zprofile."
    echo "    Run this, then double-click again:"
    echo "      echo 'eval \"\$(/opt/homebrew/bin/brew shellenv)\"' >> ~/.zprofile"
    echo
    echo "  If 'node -v' does NOT work in a Terminal, then install it:  brew install node"
    echo
    read -p "Press Enter to close..."
    exit 1
fi

# First-run npm install (or REPAIR an incomplete one). v1539: also check that the
# `ws` dep actually landed -- a hung/partial earlier install leaves node_modules present
# but missing ws, so the bridge serves HTTP but has NO WebSocket server (every ws:// fails).
if [ ! -d "WebGLEngine/ai-bridge/node_modules" ] || [ ! -d "WebGLEngine/ai-bridge/node_modules/ws" ]; then
    echo
    if [ -d "WebGLEngine/ai-bridge/node_modules" ]; then
        echo "ai-bridge deps look INCOMPLETE (ws missing) -- repairing the install..."
    else
        echo "First-run setup: installing ai-bridge npm deps..."
    fi
    echo "(v1537+: skipping the optional ffmpeg-static download -- ~80MB from GitHub, only needed"
    echo " for Discord voice. 'brew install ffmpeg' later if you want it.)"
    (cd WebGLEngine/ai-bridge && npm install --no-audit --no-fund --omit=optional) || {
        echo "ERROR: npm install failed."
        echo "  node was found at: $(command -v node)"
        echo "  npm was found at:  $(command -v npm 2>/dev/null || echo '<not found>')"
        echo "  So this is NOT 'Node.js is missing' -- the launcher already checked that above."
        echo "  Most likely: no network, or a partial node_modules. Try deleting"
        echo "  WebGLEngine/ai-bridge/node_modules and double-clicking again."
        read -p "Press Enter to close..."
        exit 1
    }
    echo "Deps installed."
fi

# v1586 — on an auto-update / relaunch the PREVIOUS launcher's processes can linger: the old
# KPopListener and its DETACHED bridge child aren't tied to the old Terminal window, so freeing the
# port alone left a second listener running. Stop them first so exactly one engine ends up running.
# (Safe here because the NEW listener + bridge are started below, after this.)
pkill -f "KPopListener.py" 2>/dev/null || true
pkill -f "ai-bridge/server.js" 2>/dev/null || true

# Kill any stale bridge listening on 8787
if lsof -nP -iTCP:8787 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Port 8787 in use — killing existing listener..."
    lsof -nP -iTCP:8787 -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Launch Python listener with bridge auto-spawn
echo
echo "Starting Python listener + bridge..."
PYTHON="${PYTHON:-/usr/bin/python3}"
LISTENER="$ROOT/KPop Listener/KPopListener.py"

if [ ! -f "$LISTENER" ]; then
    echo "ERROR: $LISTENER not found"
    read -p "Press Enter to close..."
    exit 1
fi

# v751.1 - run the listener DETACHED (nohup + disown) so it keeps running after this
# window closes; it spawns the bridge as a detached child. Output goes to a log file.
LAUNCH_LOG="$ROOT/KPop Listener/kpop-launch.log"
nohup "$PYTHON" "$LISTENER" --launch-bridge --bridge-path "$ROOT/WebGLEngine/ai-bridge" >"$LAUNCH_LOG" 2>&1 &
LISTENER_PID=$!
disown "$LISTENER_PID" 2>/dev/null || disown 2>/dev/null || true

# Wait for bridge to bind port 8787
echo "Waiting for bridge to bind :8787..."
for i in $(seq 1 20); do
    if lsof -nP -iTCP:8787 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "Bridge ready."
        break
    fi
    sleep 1
done

# v2232 -- fresh bridge, fresh brain: the bridge kill above frees :8787, but a stale
# GPU Brain (deno running brain.js) from a previous launch would linger and stack a
# second brain fighting over the field. Drop it first, same spirit as the port kill.
pkill -f 'deno .*brain\.js' 2>/dev/null || true

# v2090 — GPU Brain (optional). Try the Metal-backed GPU brain; if this Mac has
# no usable hardware adapter (e.g. an Intel integrated GPU the brain refuses),
# start-brain-mac.sh transparently falls back to the CPU brain. Wrapped so a
# brain problem never aborts the launcher (set -e is active). Runs AFTER the
# bridge is up so the brain's poller connects immediately.
if [ -f "$ROOT/WebGLEngine/brain/start-brain-mac.sh" ]; then
    echo "Starting GPU Brain (Metal, with CPU fallback)..."
    bash "$ROOT/WebGLEngine/brain/start-brain-mac.sh" "$ROOT/WebGLEngine/brain" || true
fi

# Open browser -- unless a machine asked for this restart rather than a person.
if [ "$SWEK_WAS_UPDATE" = "1" ]; then
  echo "Restarted after an update -- NOT opening a browser."
  echo "  (an open browser reconnects by itself; if none is open, nobody is here to want one)"
else
  echo "Opening browser to http://localhost:8787/server.html"
  open "http://localhost:8787/server.html"
fi

echo
echo "============================================================"
echo " Engine running (listener + bridge are detached and keep running)."
echo " Log: $LAUNCH_LOG"
echo " To stop:  pkill -f 'KPopListener.py' ; pkill -f 'node.*server.js'"
echo " This window will close automatically..."
echo "============================================================"

# v1784 — close this Terminal window cleanly. We must set the shell's exit status to 0
# BEFORE osascript fires, otherwise Terminal sees a non-zero exit and shows "Do you want
# to close this window?" even when "Ask before closing" is set to "only if processes will
# lose unsaved changes". Two steps: (1) open a new terminal with a done message so the
# user always has a window, (2) close ours via AppleScript matched by TTY.
sleep 1
MYTTY="$(tty 2>/dev/null)"
# Step 1: show a brief "done" message in a new Terminal window (optional but friendly)
osascript >/dev/null 2>&1 <<OSA || true
tell application "Terminal"
    do script "echo '✓ SweK Engine running — this window can be closed.'; sleep 60 && exit"
end tell
OSA
# Step 2: close our launcher window — shell will exit 0 so no "close?" dialog appears
(
  sleep 0.5
  osascript >/dev/null 2>&1 <<OSA2 || true
tell application "Terminal"
    repeat with w in windows
        try
            repeat with t in tabs of w
                if (tty of t) is "$MYTTY" then
                    close w saving no
                end if
            end repeat
        end try
    end repeat
end tell
OSA2
) &
exit 0
