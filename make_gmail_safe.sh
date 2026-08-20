#!/usr/bin/env bash
# =============================================================================
# make_gmail_safe.sh — produce a Gmail-friendly .zip of this project.
#
# Run from the project root (the folder that contains WebGLEngine/, KPop
# Listener/, etc.). Output goes to the PARENT directory.
#
# What it does:
#   1. Reads ENGINE_VERSION from WebGLEngine/main.js for the output name.
#   2. rsync-copies the project to ../EngineProject_GmailSafe_<ver>/
#      (excludes node_modules, .git, prior build outputs, this script itself).
#   3. Recursively renames every file with a Gmail-blocked extension
#      (.bat .ps1 .vbs .lnk .js .mjs etc.) to <name>.<ext>.txt.
#   4. Zips the result to ../EngineProject_GmailSafe_<ver>.zip
#   5. Verifies the zip contains zero blocked extensions.
#
# After this finishes, the recipient runs _SETUP.bat (Windows) or "make Gmail safe zip run again.sh" (macOS)
# (Mac/Linux) to rename everything back.
#
# Works on macOS and Linux. Needs: bash, rsync, find, zip, unzip.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD"

# ----- determine version from main.js (fallback to today's date) -----
VERSION=""
if [[ -f "WebGLEngine/main.js" ]]; then
    VERSION=$(grep -E 'ENGINE_VERSION\s*=\s*"v[0-9]+' WebGLEngine/main.js \
              | grep -oE 'v[0-9]+' | head -1 || true)
fi
if [[ -z "$VERSION" ]]; then
    VERSION="$(date +%Y%m%d)"
fi

FOLDERNAME="EngineProject_GmailSafe_${VERSION}"
OUTZIP="${FOLDERNAME}.zip"

# Compute parent dir once, use absolute paths throughout
PARENT_DIR="$(cd .. && pwd)"
DEST_DIR="${PARENT_DIR}/${FOLDERNAME}"
OUT_PATH="${PARENT_DIR}/${OUTZIP}"

echo
echo "===================================================="
echo " make_gmail_safe — build Gmail-friendly archive"
echo "===================================================="
echo " Source   : ${PROJECT_DIR}"
echo " Version  : ${VERSION}"
echo " Output   : ${OUT_PATH}"
echo

# ----- clean previous runs -----
rm -rf "${DEST_DIR}" 2>/dev/null || true
rm -f  "${OUT_PATH}" 2>/dev/null || true

# ----- [1/4] copy with cp, then prune excluded dirs/files -----
echo "[1/4] Copying project to ${DEST_DIR}/ ..."
mkdir -p "${DEST_DIR}"
# Portable copy: iterate top-level entries and cp -R each into the dest.
# Works on macOS (BSD) and Linux (GNU). Handles paths with spaces.
find "${PROJECT_DIR}" -mindepth 1 -maxdepth 1 -print0 | \
    while IFS= read -r -d '' entry; do
        cp -R "$entry" "${DEST_DIR}/"
    done

# Prune unwanted content using absolute paths
find "${DEST_DIR}" -type d \( -name 'node_modules' -o -name '.git' -o -name '__pycache__' \) -prune -exec rm -rf {} + 2>/dev/null || true
find "${DEST_DIR}" -type f \( -name '*.zip' -o -name 'MAKE_GMAIL_SAFE.bat' -o -name 'make_gmail_safe.sh' -o -name '_SETUP.sh' -o -name '.DS_Store' -o -name 'Thumbs.db' \) -delete 2>/dev/null || true
echo "      copied $(find "${DEST_DIR}" -type f | wc -l | tr -d ' ') files."

# ----- [2/4] rename blocked extensions to .X.txt -----
echo "[2/4] Renaming Gmail-blocked extensions to .X.txt ..."
# Gmail's documented blocked-attachment-extension list (current as of 2024-2026):
EXTS="bat cmd ps1 vbs vbe wsf wsh hta lnk exe dll scr com msi js mjs jse sct shb wsc"
RENAMED=0
for ext in $EXTS; do
    while IFS= read -r -d '' f; do
        mv "$f" "${f}.txt"
        RENAMED=$((RENAMED + 1))
    done < <(find "${DEST_DIR}" -type f -name "*.${ext}" -print0 2>/dev/null)
done
echo "      renamed ${RENAMED} files."

# ----- [3/4] zip -----
echo "[3/4] Creating ${OUT_PATH} ..."
( cd "${PARENT_DIR}" && zip -rq "${OUTZIP}" "${FOLDERNAME}" \
    -x '*/.DS_Store' -x '*/Thumbs.db' -x '*/__pycache__/*' )
SIZE=$(du -h "${OUT_PATH}" | cut -f1)
echo "      created ${OUTZIP} (${SIZE})."

# ----- [4/4] verify -----
echo "[4/4] Verifying zip contains zero blocked extensions ..."
BAD=$(unzip -l "${OUT_PATH}" | awk '{print $NF}' \
      | grep -iE '\.(bat|cmd|ps1|vbs|vbe|wsf|wsh|hta|lnk|exe|dll|scr|com|msi|jse|sct|shb|wsc|m?js)$' \
      || true)
if [[ -z "$BAD" ]]; then
    echo "      OK — clean, zero blocked extensions."
else
    echo "      WARNING — these still in zip:"
    echo "$BAD" | sed 's/^/        /'
fi

# ----- cleanup prompt -----
echo
read -r -p "Delete temp folder ${DEST_DIR} ? [Y/n] " ANS
case "${ANS:-Y}" in
    [Nn]*)  echo "      kept ${DEST_DIR} for inspection." ;;
    *)      rm -rf "${DEST_DIR}"; echo "      deleted." ;;
esac

echo
echo "===================================================="
echo " DONE. Email this:"
echo "    ${OUT_PATH}"
echo "===================================================="
