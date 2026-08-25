#!/bin/sh
# =============================================================================
#  swek-run.sh (v2418) -- ONE window on the Mac, forever.
#
#  "Could the mac keep just one top .sh running on a live update, so the new
#   process starts and the old is old news?"  -- yes. That is exec.
#
#  exec REPLACES this shell with the new process. Not "start the new one and
#  kill the old one" -- there is no old one left to kill or to leave a window
#  behind. The script literally BECOMES the new build. Same window, same PID
#  slot, no orphan, no second Terminal. The old is not killed; it is old news.
#
#  Drag this file into Terminal and press Enter -- the way that always works,
#  on any Mac, because the drag pastes the exact escaped absolute path.
#
#  Handoff: the server drops $TMPDIR/swek_superseded.flag containing the new
#  build's folder (v1507 flag, v2418 contents) right before it steps aside.
#  SWEK_SUPERVISOR=1 tells the server not to open a second Terminal -- we have
#  this one.
# =============================================================================
FLAG="${TMPDIR:-/tmp}/swek_superseded.flag"
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
export SWEK_SUPERVISOR=1

rm -f "$FLAG"
cd "$SELF_DIR" || exit 1
echo "[SweK] supervisor: one window, $SELF_DIR"
node ai-bridge/server.js
CODE=$?

if [ -f "$FLAG" ]; then
    NEXT="$(cat "$FLAG" 2>/dev/null)"
    rm -f "$FLAG"
    NEXT_SH="$NEXT/WebGLEngine/swek-run.sh"
    if [ -n "$NEXT" ] && [ -f "$NEXT_SH" ]; then
        chmod +x "$NEXT_SH" 2>/dev/null
        xattr -dr com.apple.quarantine "$NEXT" 2>/dev/null   # our own LAN build; keep Gatekeeper quiet
        echo "[SweK] handoff -> $NEXT (same window; this shell becomes the new build)"
        exec "$NEXT_SH"      # <-- the whole point: we ARE the new version now.
    fi
    echo "[SweK] handoff flagged but no runnable script at $NEXT_SH -- staying put."
fi

# v3992 -- a REQUESTED stop (POST /sys/exit -> sysadminBridge.exitNow) exits 20. Not a handoff, so the flag
# branch above cannot speak for it; not a crash, so it must not reach the "press return to close" below.
if [ "$CODE" = "20" ]; then
    echo "[SweK] the ai-bridge was asked to stop (code 20) and did. Closing this window."
    exit 0
fi
[ "$CODE" = "0" ] && exit 0
echo ""
echo "[SweK] the ai-bridge exited with code $CODE. The reason is above this line."
echo "[SweK] (not a handoff -- no supersede flag -- so this was a real exit)"
printf "press return to close: "; read -r _
exit "$CODE"
