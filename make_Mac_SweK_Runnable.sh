#!/usr/bin/env bash
# =============================================================================
# make_Mac_SweK_Runnable.sh - one-shot bootstrap for macOS.
#
# Makes the Mac launcher ("Start Mac SweK Engine.command") executable, clears
# the Gatekeeper quarantine attribute off the whole folder (so the unsigned
# .command + inner scripts aren't blocked as "unidentified developer"), and
# then starts SweK.
#
# Run it once after extracting:   bash "make_Mac_SweK_Runnable.sh"
# (You can also Control-click -> Open it in Finder.)
# =============================================================================
set -e
cd "$(dirname "$0")"
LAUNCHER="Start Mac SweK Engine.command"

echo "==================================================="
echo " Making SweK runnable on macOS"
echo " Folder: $PWD"
echo "==================================================="

if [ ! -f "$LAUNCHER" ]; then
    echo "ERROR: '$LAUNCHER' not found here. Run this from the EngineProject root."
    exit 1
fi

echo "[1/3] Marking the launcher (and helper scripts) executable..."
chmod +x "$LAUNCHER" 2>/dev/null || true
chmod +x "make Gmail safe zip run again.sh" 2>/dev/null || true

echo "[2/3] Clearing the macOS quarantine attribute (Gatekeeper)..."
if command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine . 2>/dev/null || true
    echo "      done."
else
    echo "      xattr not available - skipping (probably not macOS)."
fi

echo "[3/3] Starting SweK..."
exec bash "$LAUNCHER"
