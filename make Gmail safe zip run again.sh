#!/usr/bin/env bash
# =============================================================================
# _SETUP.sh - VoxelEngine post-extract one-time setup (macOS / Linux).
#
# Counterpart to _SETUP.bat. Restores the email-safe .X.txt files back to
# their executable extensions and clears the macOS quarantine attribute
# (the equivalent of Windows' Mark-of-the-Web).
#
# After this runs ONCE, the engine launchers and source files are ready.
# On Mac/Linux you would typically launch the engine via:
#   - cd WebGLEngine/ai-bridge && node server.js
#   - then open http://localhost:8787/ in a browser
# (The .bat / .lnk / .vbs launchers are Windows-only — but on Mac you still
# need .js files restored from .js.txt so the engine code actually loads.)
# =============================================================================

set -e
cd "$(dirname "$0")"

echo
echo "===================================================="
echo " VoxelEngine - post-extract setup (macOS / Linux)"
echo "===================================================="
echo
echo "Working dir: $PWD"
echo

# ---------- 1. Restore email-safe ".X.txt" files to ".X" ----------
echo "[1/2] Renaming email-safe files back to executable extensions..."

EXTS="bat cmd ps1 vbs vbe wsf wsh hta lnk exe dll scr com msi js mjs jse sct shb wsc"
RENAMED=0
for ext in $EXTS; do
    while IFS= read -r -d '' f; do
        # Strip the trailing .txt
        target="${f%.txt}"
        mv "$f" "$target"
        RENAMED=$((RENAMED + 1))
    done < <(find . -type f -name "*.${ext}.txt" -print0 2>/dev/null)
done
echo "      renamed ${RENAMED} files."

# ---------- 2. Strip macOS quarantine attribute (if on macOS) ----------
# When macOS downloads a file from the internet or extracts a downloaded zip,
# Gatekeeper sets com.apple.quarantine on each file. This is the Mac equivalent
# of Windows' Mark-of-the-Web. Strip it recursively so anything that needs to
# run (node, shell scripts) doesn't get blocked.
if command -v xattr >/dev/null 2>&1; then
    echo "[2/2] Stripping macOS quarantine attribute..."
    xattr -dr com.apple.quarantine . 2>/dev/null || true
    echo "      done."
else
    echo "[2/2] xattr not available (probably Linux) - skipping quarantine strip."
fi

echo
echo "===================================================="
echo " Setup complete."
echo "===================================================="
echo
echo "To run the engine on macOS/Linux:"
echo "  cd WebGLEngine/ai-bridge"
echo "  npm install      # first run only"
echo "  node server.js"
echo "  # then open http://localhost:8787/ in your browser"
echo
echo "(The .bat / .lnk / .vbs launchers are Windows-only and won't"
echo " run here, but the WebGL engine itself is browser-based so it"
echo " works fine cross-platform.)"
echo
echo "You can delete _SETUP.sh and _SETUP.bat.txt now if you want."
