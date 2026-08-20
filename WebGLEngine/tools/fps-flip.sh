#!/bin/sh
# tools/fps-flip.sh -- v59: runbook steps 2-3, automated. Steps 4-6
# stay HUMAN EYES (boot-log birth line, console fps rows waking, dgn
# rows still moving) -- a script cannot verify what a verdict means.
# Run from the repo root, with the brain and engine STOPPED (step 1).
set -e
# v65 -- --dry-run: print every action, touch NOTHING. The v60
# pass-path near-miss (this script flipped a real tree during a test)
# argues for a mode where curiosity is free.
DRY=0
[ "$1" = "--dry-run" ] && { DRY=1; shift; echo "[dry-run] nothing below will be executed"; }
run() { if [ "$DRY" = "1" ]; then echo "[dry] would: $*"; else "$@"; fi; }
# v60 -- pre-flight: refuse to run against a LIVE brain/bridge (honors
# runbook step 1 mechanically -- flipping under a running system leaves
# the loaded boolean stale and the deleted A/B file resurrectable from
# memory on the next save)
if curl -s -m 2 -o /dev/null "http://127.0.0.1:8787/ai/brain/console" 2>/dev/null; then
  echo "REFUSED: something answers on :8787 -- stop the bridge and brain first (runbook step 1)"
  exit 1
fi
run sed -i 's/const FPS_DOMAIN_SPLIT = false;/const FPS_DOMAIN_SPLIT = true;/' simulation/DungeonDemo.js
# v61 -- one cp un-oopses a mis-flip: the A/B history is months of
# arms; deleting it is the point, losing it forever is not
# v62 -- rotation: every flip keeps ITS OWN backup (timestamped), so a
# second flip cannot eat the first flip's history
BAK="brain/difficulty_ab_dgn.json.bak.$(date +%Y%m%d-%H%M%S)"
[ -f brain/difficulty_ab_dgn.json ] && run cp brain/difficulty_ab_dgn.json "$BAK"
# v63 -- prune: rotation without a cap grows forever. CAP = 5 backups
# (newest kept); a sixth flip retires the oldest.
# v64 -- name each retirement: silent pruning is correct, but one echo
# per retired file costs nothing and answers "where did my backup go"
for OLD in $(ls -t brain/difficulty_ab_dgn.json.bak.* 2>/dev/null | tail -n +6); do
  echo "retired old backup: $OLD"
  run rm -f "$OLD"
done
run rm -f brain/difficulty_ab_dgn.json
# v65 -- the closing words match the mode: a dry run must not claim a flip
if [ "$DRY" = "1" ]; then
  echo "[dry-run] complete -- nothing was changed"
else
  echo "flipped + dgn A/B reset (backup at $BAK if the file existed)."
  echo "NOW: start the brain and follow runbook steps 4-6 (NOTES.md, top)."
  echo "mis-flip? restore the LATEST: cp \$(ls -t brain/difficulty_ab_dgn.json.bak.* | head -1) brain/difficulty_ab_dgn.json + re-flip the boolean"
fi
