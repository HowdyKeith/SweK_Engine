#!/data/data/com.termux/files/usr/bin/bash
# WebGLEngine/tools/roundhouse/termux_serve.sh -- v3028
#
# RUN THE ENGINE'S OWN SERVER ON THE PHONE, so an Android peer can look at its own brain instead of a file.
#
# v3027 gave the phone a static page written beside its transcript, which was the honest fix for a device with
# no HTTP server. This is the other half: the phone HAS Node, freshMachine already proves server.js boots with
# NO npm install, and Termux:Boot has survived reboots since v2935. Nothing was missing except somebody starting it.
#
# THE ONE THING THAT MUST NOT BE SILENT: a timing measured while an HTTP server is running alongside is NOT
# comparable to one measured without. The suite is fifteen to twenty-five minutes of lattice work on a phone --
# a polling browser, a peer probe or a sync sweep lands in the middle of it, and the number that comes out is a
# different number. This project already refuses to compare across engine versions (v2984) and across
# architectures with unmatched environments (v2998); a co-running server is the same class of confound.
#
# So this script SETS A MARKER the runner reads and stamps into the transcript. Serving is allowed. Serving
# invisibly is not.
set -e
cd "$(dirname "$0")/../.."

PORT="${PORT:-8787}"
export PORT

echo "== SweK peer server on this phone"
node --version >/dev/null 2>&1 || { echo "node missing: pkg install nodejs"; exit 1; }

# The address a browser ON THIS PHONE uses. Loopback always works and needs no permission; the LAN address is
# printed as INFORMATION, not as a recommendation -- a phone serving to the whole network is a decision its
# owner makes deliberately, not a side effect of wanting to see a gauge.
echo "-- open on this device:  http://127.0.0.1:${PORT}/server.html"
if command -v ifconfig >/dev/null 2>&1; then
    LAN="$(ifconfig 2>/dev/null | grep -oE 'inet [0-9.]+' | grep -v '127.0.0.1' | head -1 | cut -d' ' -f2 || true)"
    [ -n "$LAN" ] && echo "-- reachable on this LAN at http://${LAN}:${PORT}/  (only if you want that; it is not required to view your own data)"
fi

# THE MARKER. Written before the server starts and removed when it stops, so the runner can stamp a transcript
# honestly even if this script is killed rather than exited.
MARK="tools/roundhouse/.serving-on-phone"
printf '%s' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$MARK"
trap 'rm -f "$MARK"' EXIT INT TERM

echo "-- serving. A suite run started while this is up will be STAMPED as served, because a timing taken"
echo "   alongside an HTTP server is not comparable to one taken without."
node ai-bridge/server.js
