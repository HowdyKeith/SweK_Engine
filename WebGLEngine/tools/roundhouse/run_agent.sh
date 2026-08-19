#!/usr/bin/env bash
# run_agent.sh - Mac/Linux counterpart of run_agent.bat.
#
#   ./tools/roundhouse/run_agent.sh          # interactive menu
#   ./tools/roundhouse/run_agent.sh dry      # straight to the dry run
#   ./tools/roundhouse/run_agent.sh bench 20
#
# Option "dry" needs nothing: no API key, no network, no npm install. It runs
# the real routing, escalation, tracing and replay against a mock client.
#
# The live options need an Anthropic API key. Claude API billing is SEPARATE
# from a claude.ai Pro/Max subscription -- a chat plan does not include API
# credits. Note: exporting ANTHROPIC_API_KEY globally makes Claude Code bill to
# the API instead of your subscription, so prefer a per-shell export.
set -u
cd "$(dirname "$0")/../.." || exit 1

command -v node >/dev/null 2>&1 || { echo "ERROR: node not found on PATH."; exit 1; }
[ -f tools/roundhouse/runLive.mjs ] || { echo "ERROR: tools/roundhouse/runLive.mjs not found."; exit 1; }

need_key() {
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
        echo
        echo "  ANTHROPIC_API_KEY is not set in this shell."
        echo "  Get a key at https://console.anthropic.com and fund it with prepaid"
        echo "  credits (API billing is separate from a claude.ai subscription)."
        echo "  Then:   export ANTHROPIC_API_KEY=sk-ant-..."
        echo
        echo "  The 'dry' option needs no key - try that first."
        echo
        return 1
    fi
    return 0
}

run() {
    case "$1" in
        dry)   node tools/roundhouse/runLive.mjs --dry ;;
        one)   need_key && node tools/roundhouse/runLive.mjs ;;
        bench) need_key && node tools/roundhouse/runLive.mjs --bench "${2:-12}" ;;
        trace) need_key && node tools/roundhouse/runLive.mjs --save-trace ;;
        *)     echo "unknown option: $1"; return 1 ;;
    esac
}

if [ $# -gt 0 ]; then run "$@"; exit $?; fi

while true; do
    cat <<'MENU'

  ROUNDHOUSE AGENT
  ----------------
  The verifier is a real SweK gate, not a bigger model: a routed answer is
  accepted only if it matches truth the engine computes itself.

  [1] Dry run        no key, no network - proves the wiring
  [2] One task       route + trace + replay a real model call
  [3] Benchmark      12 tasks - REAL cheap-vs-strong savings
  [4] Save trace     one task, writes route-trace.json
  [5] Quit

MENU
    printf 'Choose [1-5]: '
    read -r pick
    case "$pick" in
        1) run dry ;;
        2) run one ;;
        3) run bench 12 ;;
        4) run trace ;;
        5) exit 0 ;;
        *) echo "Pick 1-5." ;;
    esac
done
