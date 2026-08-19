#!/bin/sh
# tools/smoke-console.sh -- v60, -q in v64: the LIVE console route's
# smoke, for the RIG (Galaxina), not the sandbox.
#
# WHY NOT A FULL-BOOT SANDBOX SMOKE (the forensic record, so nobody
# re-digs this tar pit):
#   - server.js entangles bundle-absent runtime modules at require time:
#     ws -> twitchClient -> twitchEventSub -> discordVoice ->
#     wadGeometry/wadTextures -> aiCreds; each throw aborts the startup
#     path BEFORE listen(), even under the continuing exception handler
#   - stubbing them is a foot-gun twice over: (a) a plain Proxy stub
#     breaks `new TwitchClient()` (arrow fns are not constructors);
#     (b) a truthy-everywhere universal stub feeds any poll loop
#     forever -- one pegged the sandbox flat
#   - `timeout node server.js` kills node but NOT its spawn tree; a
#     drain loop of those orphaned enough children to starve the box
# The console's LOGIC is covered: the report embeds its TWIN table and
# tools/smoke-report.mjs asserts it. This script tests the LIVE route.
#
# Usage: sh tools/smoke-console.sh [-q] [host:port]
#   -q  verdict line only; diagnostics dump ONLY on failure (v64 --
#       the verify steps' rule, brought down to the sh layer)
set -e
QUIET=0
[ "$1" = "-q" ] && { QUIET=1; shift; }
HOST="${1:-127.0.0.1:8787}"
DIAG=""
say() { DIAG="$DIAG$1
"; [ "$QUIET" = "0" ] && echo "$1"; }
fail() { [ "$QUIET" = "1" ] && printf "%s" "$DIAG" >&2; echo "CONSOLE SMOKE RED: $1"; exit 1; }

BODY=$(curl -s -m 5 "http://$HOST/ai/brain/console") || fail "curl could not reach $HOST"
say "[diag] body: $(printf %s "$BODY" | wc -c) bytes from $HOST"
echo "$BODY" | grep -q "The experiment console"              || fail "no console marker"
say "[diag] console marker present"
echo "$BODY" | grep -q "engine (kaiju / dungeon / raycaster)" || fail "no engine band"
echo "$BODY" | grep -q "escape velocity"                      || fail "no ev band"
say "[diag] both group bands present"
# v66 -- band ORDER: engine before ev (the v46 grouped-render order is
# asserted nowhere else). Byte offsets from grep -bo settle it.
E_AT=$(printf %s "$BODY" | grep -bo "engine (kaiju" | head -1 | cut -d: -f1)
V_AT=$(printf %s "$BODY" | grep -bo "escape velocity" | head -1 | cut -d: -f1)
[ "$E_AT" -lt "$V_AT" ] || fail "band order wrong: engine must render before escape velocity (v46)"
say "[diag] band order held (engine @$E_AT < ev @$V_AT)"
echo "$BODY" | grep -q "Evidence as of"                       || fail "no as-of column"
say "[diag] as-of column present (the v46 repair)"
# v65 -- ROW content, not just bands: two UNCONDITIONAL rows asserted
# (they render "not started" states even on a fresh brain). "Bias dose
# ladder" is deliberately NOT asserted -- it renders only when its
# state file exists, and a smoke must not fail a fresh rig.
echo "$BODY" | grep -q "Trader boldness (T ladder)"           || fail "trade ladder row missing (render regression past the bands)"
echo "$BODY" | grep -q "Escort threshold (randomized)"        || fail "escort A/B row missing (render regression past the bands)"
say "[diag] unconditional rows present (trade ladder, escort A/B)"
HDR=$(curl -sI -m 5 "http://$HOST/ai/brain/console")
echo "$HDR" | grep -qi "content-security-policy"              || fail "no CSP header (v59)"
# v67 -- the VALUE, not just the presence: the two directives whose
# loosening would matter. default-src 'none' is the lock; connect-src
# 'self' is the one door. A header that exists but says default-src *
# would pass a presence check while guarding nothing.
echo "$HDR" | grep -i "content-security-policy" | grep -q "default-src 'none'" || fail "CSP loosened: default-src is not 'none' (v59 contract)"
echo "$HDR" | grep -i "content-security-policy" | grep -q "connect-src 'self'" || fail "CSP loosened: connect-src is not 'self' (v59 contract)"
say "[diag] CSP directives hold (default-src 'none', connect-src 'self')"
echo "CONSOLE SMOKE GREEN: live route renders, bands present, CSP rides"
