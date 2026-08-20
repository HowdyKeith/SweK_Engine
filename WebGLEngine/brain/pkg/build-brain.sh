#!/usr/bin/env bash
# brain/pkg/build-brain.sh — v2253
#
# Compile the cell manager (brain/esPilot.mjs + its pure import tree) into standalone, per-box executables
# with `bun build --compile`. One host cross-compiles for the whole fleet: no Node/Bun install needed on the
# target machine, fast cold start, one file to drop next to a shortcut. Because the cell manager is
# owner-authoritative (it broadcasts, peers extrapolate + re-anchor), the exe's JSC floats never have to match
# the browsers' V8 floats -- which is the whole reason a different JS engine is safe here.
#
#   run from the WebGLEngine root:  bash brain/pkg/build-brain.sh
#
# Config over env:  ROOM, SYSTEM, URLBASE, BRIDGE, ID, BRAIN_BACKEND  are read by the exe at RUN time, e.g.
#   SYSTEM=128 ROOM=default swek-brain.exe          # own one solar system's hostiles
# Spawn one per system for the EVE-style "one owner per cell" layout.

set -euo pipefail
cd "$(dirname "$0")/../.."          # -> WebGLEngine
OUT="brain/pkg/dist"
ENTRY="brain/esPilot.mjs"

command -v bun >/dev/null 2>&1 || { echo "bun not found. install: https://bun.sh  (curl -fsSL https://bun.sh/install | bash)"; exit 1; }

echo "[build] gate: bun-surface audit (must be compile-clean before we bother)"
node tools/ship/bun-audit.mjs "$ENTRY"

mkdir -p "$OUT"
# fleet targets. add/remove to taste; these cover the current fleet + a linux peer.
declare -A TARGETS=(
  ["swek-brain.exe"]="bun-windows-x64"      # Galaxina (Windows)
  ["swek-brain-mac"]="bun-darwin-x64"       # Stellar Atlas (Intel Mac)
  ["swek-brain-mac-arm"]="bun-darwin-arm64" # any Apple-silicon peer
  ["swek-brain-linux"]="bun-linux-x64"      # a linux peer
)

for name in "${!TARGETS[@]}"; do
  tgt="${TARGETS[$name]}"
  echo "[build] $name  <- $ENTRY  ($tgt)"
  bun build "$ENTRY" --compile --target="$tgt" --outfile "$OUT/$name" || { echo "[build] FAILED for $tgt"; continue; }
done

echo "[build] done -> $OUT"
ls -la "$OUT" 2>/dev/null || true
echo "[build] measure it:  bun brain/pkg/tick-bench.mjs   (compare to: node brain/pkg/tick-bench.mjs)"
