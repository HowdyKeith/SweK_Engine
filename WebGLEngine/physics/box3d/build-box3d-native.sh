#!/usr/bin/env bash
# =============================================================================
# build-box3d-native.sh — v4256: build box3d + the shim NATIVELY, for gates.
#
# The WASM build (build-box3d-wasm.sh) needs emsdk. This one needs only cc and
# cmake, which is what a plain container has — and that difference is the whole
# reason this script exists. #125 was filed as RIG WORK on the assumption that
# touching box3d_shim.c required a toolchain the sandbox lacks. It does not: the
# shim is ordinary C17 and box3d has no dependency beyond libm, so the physics
# can be BUILT AND RUN AND MEASURED anywhere, and only the WASM packaging is
# rig work.
#
# Output: $OUT/libbox3d.a and $OUT/shim.o, which
# tools/ship/box3dFilter-selfcheck.mjs links into a native probe. Without them
# that gate skips its physics section loudly rather than failing.
# =============================================================================
set -euo pipefail
TAG="${BOX3D_TAG:-v0.1.0}"
ENG="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${BOX3D_NATIVE_OUT:-$ENG/vendor/box3d/native}"
WORK="${TMPDIR:-/tmp}/box3d-native-build"

command -v cc    >/dev/null || { echo "cc not found"; exit 1; }
command -v cmake >/dev/null || { echo "cmake not found"; exit 1; }

mkdir -p "$WORK" "$OUT"
cd "$WORK"
if [ ! -d box3d ]; then
  git clone --depth 1 --branch "$TAG" https://github.com/erincatto/box3d.git
fi
cd box3d

# Pin check: the commit the vendored headers were taken from. A silent upstream
# move is exactly what a pinned tag is for, and alpha tags DO get re-cut.
EXPECT="8441b4a06d6d09dcfb0b0f704df4d847d1437b92"
HAVE="$(git rev-parse HEAD)"
[ "$HAVE" = "$EXPECT" ] || echo "WARNING: $TAG is $HAVE, vendored headers came from $EXPECT"

cmake -B build-native -DCMAKE_BUILD_TYPE=Release \
  -DBOX3D_SAMPLES=OFF -DBOX3D_UNIT_TESTS=OFF -DBOX3D_BENCHMARKS=OFF >/dev/null
cmake --build build-native -j"$(nproc 2>/dev/null || echo 4)" >/dev/null

LIB="$(find build-native -name 'libbox3d.a' | head -1)"
[ -n "$LIB" ] || { echo "ERROR: no libbox3d.a under build-native/"; exit 1; }
cp "$LIB" "$OUT/libbox3d.a"

# The shim is compiled against the VENDORED headers, not the clone's, so a drift
# between what the tree ships and what upstream has is a compile error here.
cc -c -O2 -I "$ENG/vendor/box3d/include" "$ENG/physics/box3d/box3d_shim.c" -o "$OUT/shim.o"

echo "Built: $OUT/libbox3d.a + $OUT/shim.o"
