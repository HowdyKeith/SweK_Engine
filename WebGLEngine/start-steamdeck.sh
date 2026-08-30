#!/usr/bin/env bash
# start-steamdeck.sh - VoxelEngine launcher for Steam Deck (SteamOS) / Linux desktop.
#
# Runs the ai-bridge server in the foreground (this terminal becomes the
# server's log window) and starts the GPU Brain alongside it, same shape as
# start-mac.sh. Press Ctrl-C in this terminal to stop the server.
#
# What this does NOT include compared to start-mac.sh, and why:
#   - KPopupListener: Windows-only, per start-mac.sh's own note.
#   - Automatic browser opening: server.js ALREADY calls `xdg-open` on Linux
#     (see ai-bridge/server.js's non-darwin/non-win32 branch) -- the "one
#     opener, the smarter one" rule start-mac.sh states for darwin applies
#     here too, just via a different platform branch of the SAME code.
#   - Closing a PREVIOUS launch's terminal window: start-mac.sh does this with
#     osascript, which is Terminal.app-specific AppleScript. Steam Deck's
#     Desktop Mode terminal is Konsole (or whatever the user picked), and
#     there is no portable equivalent across Linux terminal emulators -- so
#     the old window is left for the user to close, same as it would be on
#     any other Linux desktop launcher.
# Everything else (server, port takeover, GPU Brain) translates.

set -u

cd "$(dirname "$0")"

BOLD=$(tput bold 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

PORT=8787
URL="http://localhost:${PORT}/server.html"

printf '\033]0;SweK Engine\007' 2>/dev/null || true

# ---- port-listener probe: ss first (iproute2, present on SteamOS and every
# modern distro's base install), /proc/net/tcp as a fallback for a stripped-
# down box that lacks it.
#
# *** v1 OF THE /proc FALLBACK GAVE UP AT THE INODE AND NEVER FOUND A PID, AND
# THAT WAS TESTED HERE AND FOUND TO BREAK THE TAKEOVER IT EXISTS FOR. *** This
# sandbox genuinely lacks `ss` -- not a hypothetical -- so the fallback path
# ran for real: it correctly reported "port busy" but returned no PID, the
# takeover branch below printed a warning and skipped the kill, and the
# SECOND launch then tried to bind :8787 anyway. It failed to bind (the first
# instance still owned the port) while looking, from the log, like it had
# started -- the exact "confident wrong answer" this tree's other gates
# refuse elsewhere. A relaunch that silently does not relaunch is worse than
# one that clearly refuses.
#
# THE FIX WALKS /proc THE REST OF THE WAY: /proc/net/tcp's tenth field is the
# socket's INODE, and every process's open file descriptors under
# /proc/$pid/fd/* are symlinks that read "socket:[INODE]" for a socket fd --
# no root needed for OUR OWN processes, which is exactly what a takeover is
# ever asked to find. MEASURED to work exactly right: matches the real PID
# of a listener, and returns empty for a port nothing is using.
port_owner_pid() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p"$" { print $0 }' | \
            grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2
        return 0
    fi
    local hexport inode pid fdlink t
    hexport="$(printf '%04X' "$PORT")"
    inode="$(awk -v p="$hexport" 'NR>1 { split($2,a,":"); if (a[2]==p) { print $10; exit } }' /proc/net/tcp /proc/net/tcp6 2>/dev/null)"
    [ -z "$inode" ] && return 0
    for pid in /proc/[0-9]*; do
        pid="${pid#/proc/}"
        compgen -G "/proc/$pid/fd/*" >/dev/null 2>&1 || continue
        for fdlink in /proc/"$pid"/fd/*; do
            t="$(readlink "$fdlink" 2>/dev/null)"
            if [ "$t" = "socket:[$inode]" ]; then echo "$pid"; return 0; fi
        done
    done
    return 0
}
port_is_listening() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -q ":$PORT[[:space:]]" && return 0 || return 1
    fi
    awk -v p="$(printf '%04X' "$PORT")" 'NR>1 { split($2,a,":"); if (a[2]==p) f=1 } END{exit !f}' /proc/net/tcp 2>/dev/null
}

# ---- 1. Sanity checks ----
if ! command -v node >/dev/null 2>&1; then
    printf "${RED}Node.js not found.${RESET} Run ./install-steamdeck.sh first.\n"
    exit 1
fi

if [ ! -d "ai-bridge/node_modules" ]; then
    printf "${RED}ai-bridge/node_modules missing.${RESET} Run ./install-steamdeck.sh first.\n"
    exit 1
fi

# ---- 2. Port check / takeover ----
if port_is_listening; then
    OLD_PID="$(port_owner_pid)"
    if [ -n "${OLD_PID:-}" ]; then
        printf "${YELLOW}Port %d busy (PID %s) -- taking over for a fresh boot.${RESET}\n" "$PORT" "$OLD_PID"
        kill "$OLD_PID" 2>/dev/null || true
        for i in $(seq 1 20); do
            port_is_listening || break
            sleep 0.25
        done
        port_is_listening && kill -9 "$OLD_PID" 2>/dev/null || true
        sleep 0.5
    else
        printf "${YELLOW}Port %d is busy but the PID could not be determined (ss unavailable) -- the server below may fail to bind. Close whatever is using :%d and re-run if so.${RESET}\n" "$PORT" "$PORT"
    fi
fi

# ---- 3. Start server + GPU Brain ----
printf "${BOLD}VoxelEngine — Steam Deck / Linux launcher${RESET}\n"

[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"; RUNTIME_LABEL="Bun $(bun --version)"
else
    RUNTIME="node"; RUNTIME_LABEL="Node $(node --version)"
fi
printf "Starting ai-bridge server on :%d with %s...\n" "$PORT" "$RUNTIME_LABEL"

"$RUNTIME" ai-bridge/server.js &
SERVER_PID=$!

cleanup() {
    printf "\n${YELLOW}Shutting down...${RESET}\n"
    pkill -f 'deno .*brain\.js' 2>/dev/null || true   # stop the brain we started alongside the bridge
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    printf "${GREEN}Stopped.${RESET}\n"
    exit 0
}
trap cleanup INT TERM

for i in $(seq 1 25); do
    port_is_listening && break
    sleep 0.2
done

# GPU Brain: start-brain-steamdeck.sh tries Vulkan (the Deck's own AMD RDNA2
# APU is Mesa RADV's best-supported Vulkan target on Linux -- see that
# script's own header) and transparently falls back to the CPU exact-Dijkstra
# brain if no hardware adapter answers. Same fresh-bridge-fresh-brain kill
# start-mac.sh does, so a relaunch never runs two brains against one bridge.
BRAIN_DIR_ABS="$(pwd)/brain"
if [ -f "$BRAIN_DIR_ABS/start-brain-steamdeck.sh" ]; then
    pkill -f 'deno .*brain\.js' 2>/dev/null || true
    printf "Starting GPU Brain (Deno; Vulkan via Mesa RADV, CPU fallback)...\n"
    bash "$BRAIN_DIR_ABS/start-brain-steamdeck.sh" "$BRAIN_DIR_ABS" || true
else
    printf "${YELLOW}(brain/start-brain-steamdeck.sh missing -- running bridge-only; no brain on the fleet)${RESET}\n"
fi

printf "\n${GREEN}Engine running.${RESET}  Press ${BOLD}Ctrl-C${RESET} in this terminal to stop.\n"
printf "Browser: ${URL}  (opens automatically via xdg-open once the bridge is listening)\n\n"

wait "$SERVER_PID"
