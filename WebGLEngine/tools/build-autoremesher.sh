#!/usr/bin/env bash
# =============================================================================
# build-autoremesher.sh -- v2084: compile huxingyi/autoremesher (MIT) from
# source, the "build as fallback" path when the prebuilt release is not used
# (e.g. an Intel Mac where the release .dmg hits Gatekeeper, or a Linux box).
#
# Output: the autoremesher binary, copied to WebGLEngine/vendor/autoremesher/
# where the engine's detection (autoInstall "files" paths + remeshBridge
# CANDIDATE_PATHS include this via SWEK_AUTOREMESHER, and we also print the
# path to set) picks it up.
#
# Prereqs (from the upstream README, verified 2026-07):
#   - a C++14 compiler (g++/clang++, or MSVC on Windows)
#   - CMake 3.12 or later
#   - Intel TBB   (Ubuntu/Debian: sudo apt install libtbb-dev ; mac: brew install tbb)
#   The heavier deps (CGAL, OpenVDB, Geogram, libigl, Qt) are vendored by the
#   project's own build per upstream; if CMake reports one missing, install it
#   with your package manager and re-run -- this script stops honestly on the
#   first failure rather than guessing.
#
# NOTE: upstream does not document exact CMake options; we use the plain
#   `cmake .. && cmake --build .` the README specifies and DO NOT invent flags.
# =============================================================================
set -euo pipefail

TAG="${AUTOREMESHER_TAG:-1.0.0}"      # pin to the MIT 1.0.0 release
REPO="https://github.com/huxingyi/autoremesher.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"        # WebGLEngine/
OUT="$ROOT/vendor/autoremesher"
WORK="${AUTOREMESHER_WORK:-$ROOT/vendor/_autoremesher_src}"

echo "[autoremesher-build] tag=$TAG"
echo "[autoremesher-build] output -> $OUT"

# ---- prereq checks (fail early + clearly) ----
need() { command -v "$1" >/dev/null 2>&1 || { echo "[autoremesher-build] MISSING: $1 -- $2"; exit 3; }; }
need git   "install git"
need cmake  "install CMake 3.12+ (cmake.org or your package manager)"
if ! command -v g++ >/dev/null 2>&1 && ! command -v clang++ >/dev/null 2>&1; then
    echo "[autoremesher-build] MISSING: a C++ compiler (g++ or clang++)"; exit 3
fi

# CMake version gate (>= 3.12)
CMV="$(cmake --version | head -1 | sed -E 's/[^0-9]*([0-9]+\.[0-9]+).*/\1/')"
echo "[autoremesher-build] cmake $CMV"

# TBB hint (not fatal here -- let CMake be the authority, but warn early)
if [ "$(uname)" = "Linux" ]; then
    dpkg -s libtbb-dev >/dev/null 2>&1 || echo "[autoremesher-build] note: libtbb-dev not detected (apt install libtbb-dev if CMake complains about TBB)"
fi

# ---- clone (or update) at the pinned tag ----
mkdir -p "$(dirname "$WORK")"
if [ -d "$WORK/.git" ]; then
    echo "[autoremesher-build] updating existing checkout"
    git -C "$WORK" fetch --tags --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG" 2>/dev/null || git -C "$WORK" fetch --tags
    git -C "$WORK" checkout -q "tags/$TAG" 2>/dev/null || git -C "$WORK" checkout -q "$TAG"
else
    echo "[autoremesher-build] cloning $REPO @ $TAG"
    git clone --depth 1 --branch "$TAG" "$REPO" "$WORK" 2>/dev/null \
        || { echo "[autoremesher-build] tagged shallow clone failed; full clone + checkout"; git clone "$REPO" "$WORK"; git -C "$WORK" checkout -q "$TAG"; }
fi

# ---- configure + build (exactly the README's steps; no invented flags) ----
BUILD="$WORK/build"
mkdir -p "$BUILD"
cd "$BUILD"
echo "[autoremesher-build] cmake configure"
cmake .. -DCMAKE_BUILD_TYPE=Release
echo "[autoremesher-build] cmake build (this can take many minutes)"
cmake --build . --config Release -j "$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"

# ---- locate the produced binary + stage it ----
mkdir -p "$OUT"
BIN=""
for cand in \
    "$BUILD/autoremesher" \
    "$BUILD/Release/autoremesher" \
    "$BUILD/Release/autoremesher.exe" \
    "$BUILD/autoremesher.exe" \
    "$WORK/autoremesher"; do
    if [ -f "$cand" ]; then BIN="$cand"; break; fi
done
# fallback: search the build tree for anything named autoremesher(.exe)
if [ -z "$BIN" ]; then
    BIN="$(find "$BUILD" -maxdepth 4 -type f \( -name autoremesher -o -name autoremesher.exe \) 2>/dev/null | head -1 || true)"
fi

if [ -z "$BIN" ] || [ ! -f "$BIN" ]; then
    echo "[autoremesher-build] BUILD DID NOT PRODUCE A BINARY named autoremesher."
    echo "[autoremesher-build] Check the CMake output above for the target name; the exe may be under $BUILD."
    exit 4
fi

cp "$BIN" "$OUT/"
STAGED="$OUT/$(basename "$BIN")"
chmod +x "$STAGED" 2>/dev/null || true
echo "[autoremesher-build] OK -> $STAGED"
echo "[autoremesher-build] point the engine at it with:  export SWEK_AUTOREMESHER=\"$STAGED\""
echo "[autoremesher-build] (or it is auto-detected here on next status check)"
