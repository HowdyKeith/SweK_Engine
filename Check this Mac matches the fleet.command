#!/usr/bin/env bash
# Cross-Arch Session (Mac).command -- v2864
#
# DOUBLE-CLICK THIS ON THE MAC. It runs every cross-architecture measurement the machine can settle and compares
# them against the x86_64 baseline shipped in the tree, so you get the ANSWER here rather than a page of hashes
# to carry home.
#
# THE PATH FIX IS THE SAME ONE v2857 PUT IN THE MAIN LAUNCHER, and it is here for the same reason: a .command
# double-clicked in Finder is started by launchd, not by your shell. It never sources ~/.zprofile, so Homebrew's
# /opt/homebrew/bin is not on PATH and `node` appears to be missing on a machine where it works perfectly in
# Terminal. That is what made this Mac look broken for two rounds.
cd "$(dirname "$0")" || exit 1

for _d in /opt/homebrew/bin /usr/local/bin /opt/local/bin; do
    case ":$PATH:" in *":$_d:"*) ;; *) [ -d "$_d" ] && PATH="$_d:$PATH" ;; esac
done
if ! command -v node >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
    eval "$(brew shellenv 2>/dev/null)" || true
fi
export PATH

if ! command -v node >/dev/null 2>&1; then
    echo
    echo "ERROR: node is not on this launcher's PATH."
    echo "  If 'node -v' WORKS in a Terminal this is a PATH problem, not a missing install. Run:"
    echo "      echo 'eval \"\$(/opt/homebrew/bin/brew shellenv)\"' >> ~/.zprofile"
    echo "  If it does NOT work in a Terminal:  brew install node"
    echo
    read -p "Press Enter to close..."
    exit 1
fi

cd WebGLEngine || { echo "ERROR: WebGLEngine/ not found beside this launcher."; read -p "Enter to close..."; exit 1; }

OUT="$HOME/swek-crossarch-$(uname -m)-$(date +%Y%m%d-%H%M%S).json"
node tools/macSession.mjs --json "$OUT"
CODE=$?

echo
echo "Result file: $OUT"
echo "  Keep it. Two of these from different machines are a cross-arch diff you can argue from."
echo
if [ $CODE -ne 0 ]; then
    echo "One or more stages FAILED (not merely skipped). Scroll up -- each says why."
fi
read -p "Press Enter to close..."
