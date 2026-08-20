#!/data/data/com.termux/files/usr/bin/sh
# tools/roundhouse/swek_outbox.sh
#
# v2950 -- STORE AND FORWARD. The suite takes 15-25 minutes. If the hub is unreachable when it finishes -- phone
# on mobile data, hub asleep, tunnel down, operator out -- the results previously just sat in Downloads and
# someone had to notice and move them by hand. That is the failure mode this removes.
#
# THE MODEL IS A QUEUE, NOT A SEND. termux_peer.sh drops its ballot into the OUTBOX and tries once. Whatever is
# left in the outbox stays there until some later run of this script succeeds in delivering it. Nothing is ever
# deleted on failure; a delivered file is MOVED to sent/ rather than removed, so the phone keeps its own record
# of what it has reported, and a delivery can be audited later.
#
# THE HUB ADDRESS is remembered in ~/.swek_hub the first time it is supplied, so later runs need no argument:
#     sh tools/roundhouse/swek_outbox.sh http://192.168.11.42:8080     # first time: learn and flush
#     sh tools/roundhouse/swek_outbox.sh                              # thereafter: flush to the remembered hub
# A Cloudflare tunnel URL works exactly the same way, which is what lets an off-site volunteer's phone deliver.
#
# It exits 0 when the outbox is EMPTY at the end, and non-zero when items remain -- so it can be chained, cron'd,
# or called from the boot script without anything having to parse its output.

set -u
cd "$(dirname "$0")/../.." 2>/dev/null || cd "$HOME" || exit 1

DL="$HOME/storage/downloads"
[ -d "$DL" ] || DL="$HOME"
OUTBOX="$DL/swek-outbox"
SENT="$DL/swek-outbox/sent"
HUBFILE="$HOME/.swek_hub"
mkdir -p "$OUTBOX" "$SENT" 2>/dev/null

# -- learn or recall the hub address ---------------------------------------------------------------------------------
HUB="${1:-}"
if [ -n "$HUB" ]; then
    printf '%s\n' "$HUB" > "$HUBFILE"
elif [ -f "$HUBFILE" ]; then
    HUB="$(head -n1 "$HUBFILE")"
fi
if [ -z "$HUB" ]; then
    echo "no hub address known. Supply it once: sh $0 http://<hub-host>:<port>"
    echo "queued items remain in $OUTBOX"
    exit 2
fi
HUB="${HUB%/}"

# -- flush ------------------------------------------------------------------------------------------------------------
sent=0; failed=0
for f in "$OUTBOX"/*.json; do
    [ -e "$f" ] || continue                      # empty outbox: the glob stays literal
    name="$(basename "$f")"
    # --fail makes curl exit non-zero on an HTTP error, so a 400 is not mistaken for delivery
    if curl -fsS -m 30 -X POST -H "Content-Type: application/json" --data-binary @"$f" "$HUB/android/submit" >/dev/null 2>&1; then
        mv "$f" "$SENT/$name" 2>/dev/null && echo "  delivered: $name"
        sent=$((sent+1))
    else
        echo "  still queued: $name (hub unreachable or refused)"
        failed=$((failed+1))
    fi
done

if [ "$sent" -eq 0 ] && [ "$failed" -eq 0 ]; then echo "outbox empty -- nothing to deliver"; exit 0; fi
echo "delivered $sent, still queued $failed  (hub $HUB)"
[ "$failed" -eq 0 ]
