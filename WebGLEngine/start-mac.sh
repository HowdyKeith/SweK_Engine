#!/usr/bin/env bash
# start-mac.sh - VoxelEngine launcher for macOS.
#
# Runs the ai-bridge server in the foreground (this terminal becomes
# the server's log window) and opens the browser to the engine page.
# Press Ctrl-C in this terminal to stop the server.
#
# What this does NOT include compared to the Windows launcher
# (Start_Everything.bat):
#   - KPopupListener (Windows-only PowerShell toast service)
# Everything else (server, port check, browser open) translates 1:1.

set -u

cd "$(dirname "$0")"

BOLD=$(tput bold 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

PORT=8787
URL="http://localhost:${PORT}/server.html"

# v2064 -- name this Terminal window so a NEWER launch can find and close
# it. macOS has NOT locked this down: the "are you sure" dialog only
# appears when Terminal believes a process is still attached. Once this
# script's server is killed by the newer launch, our `wait` returns, the
# shell exits cleanly, and an osascript close is promptless.
printf '\033]0;SweK Engine\007'
close_other_swek_windows() {
    command -v osascript >/dev/null 2>&1 || return 0
    osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
tell application "Terminal"
    set myId to id of front window
    repeat with w in (every window whose name contains "SweK Engine")
        try
            if id of w is not myId then close w
        end try
    end repeat
end tell
APPLESCRIPT
}

# ---- 1. Sanity checks ----
if ! command -v node >/dev/null 2>&1; then
    printf "${RED}Node.js not found.${RESET} Run ./install-mac.sh first.\n"
    exit 1
fi

if [ ! -d "ai-bridge/node_modules" ]; then
    printf "${RED}ai-bridge/node_modules missing.${RESET} Run ./install-mac.sh first.\n"
    exit 1
fi

# ---- 2. Port check ----
# lsof is shipped with macOS by default. Returns 0 if anything is
# listening on the port.
# v2064 -- TAKEOVER, matching the Windows launcher's behavior: a new
# launch means a fresh boot. Kill only the PID listening on :8787, wait
# for the old script's shell to exit (its `wait` returns once its server
# dies), then close the old SweK Terminal window(s) -- promptless,
# because nothing is attached to them anymore.
OLD_PID=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true)
if [ -n "${OLD_PID:-}" ]; then
    printf "${YELLOW}Port %d busy (PID %s) -- taking over for a fresh boot.${RESET}\n" "$PORT" "$OLD_PID"
    kill "$OLD_PID" 2>/dev/null || true
    for i in $(seq 1 20); do
        lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
        sleep 0.25
    done
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && kill -9 "$OLD_PID" 2>/dev/null || true
    sleep 0.5
    close_other_swek_windows
fi

# ---- 3. Start server + open browser ----
printf "${BOLD}VoxelEngine — macOS launcher${RESET}\n"

# Prefer Bun (faster) if it's installed; fall back to Node. Bun's Windows-only
# socket panic does not affect macOS, so Bun is a safe default here.
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"; RUNTIME_LABEL="Bun $(bun --version)"
else
    RUNTIME="node"; RUNTIME_LABEL="Node $(node --version)"
fi
printf "Starting ai-bridge server on :%d with %s...\n" "$PORT" "$RUNTIME_LABEL"

# Launch server in background so we can do the post-launch browser open,
# then wait on it to keep the terminal in the foreground for logs +
# Ctrl-C handling.
"$RUNTIME" ai-bridge/server.js &
SERVER_PID=$!

# Graceful cleanup on Ctrl-C / SIGTERM. Pass the signal through to
# Node so it can run its own shutdown.
cleanup() {
    printf "\n${YELLOW}Shutting down...${RESET}\n"
    pkill -f 'deno .*brain\.js' 2>/dev/null || true   # v2230 -- stop the brain we started alongside the bridge
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    printf "${GREEN}Stopped.${RESET}\n"
    exit 0
}
trap cleanup INT TERM

# Wait for the server to bind. Poll the port; bail out after ~5s.
for i in $(seq 1 25); do
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        break
    fi
    sleep 0.2
done

# v2230 -- start the GPU Brain too, so this Mac is a full peer of the Windows
# launcher (which brings the brain up in its own window) instead of joining the
# fleet brainless. start-brain-mac.sh tries GPU/Metal and transparently falls
# back to the exact-Dijkstra CPU brain on Intel Macs, then disowns and returns.
# Kill any stale brain first (fresh bridge -> fresh brain, no version skew) --
# same spirit as the port takeover above. KPop stays Windows-only, so it is
# intentionally NOT started here.
BRAIN_DIR_ABS="$(pwd)/brain"
if [ -f "$BRAIN_DIR_ABS/start-brain-mac.sh" ]; then
    pkill -f 'deno .*brain\.js' 2>/dev/null || true
    printf "Starting GPU Brain (Deno; Metal, CPU-fallback on Intel)...\n"
    bash "$BRAIN_DIR_ABS/start-brain-mac.sh" "$BRAIN_DIR_ABS" || true
else
    printf "${YELLOW}(brain/start-brain-mac.sh missing -- running bridge-only; no brain on the fleet)${RESET}\n"
fi

# v2064 -- the DUPLICATE-WINDOWS fix: this script no longer opens the
# browser on a fresh start. server.js opens server.html ITSELF on darwin
# (via `open`, guarded by "is any tab's SSE connected?") -- and the old
# double-open raced it: on a slow first paint the tab had not connected
# its /sys/logs/stream before the server's no-tab timer fired, so the
# server opened a SECOND window; relaunches could make a third. One
# opener, the smarter one (best LAN URL + boot-mode page), owns the job.

printf "\n${GREEN}Engine running.${RESET}  Press ${BOLD}Ctrl-C${RESET} in this terminal to stop.\n"
printf "Browser: ${URL}\n\n"

# Block on the server. When it exits (e.g., user Ctrl-Cs us, or the
# server dies), this script exits too.
wait "$SERVER_PID"
