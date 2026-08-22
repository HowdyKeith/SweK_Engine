#!/usr/bin/env bash
# build_wasm.sh - Mac/Linux counterpart of build_wasm.bat. Builds the
# terrain-wasm crate and installs the output into WebGLEngine/world/wasm/
# where world/terrainWasm.js expects it.
#
#   ./build_wasm.sh            # with wasm SIMD (simd128)
#   ./build_wasm.sh nosimd     # without
#
# Requirements (one-time):
#   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   cargo install wasm-pack
#
# The engine runs fine WITHOUT this build -- world/terrainWasm.js detects the
# missing pkg and uses the JS terrain path. This build is the opt-in fast path.
#
# Exists because the Mac in the fleet is the natural build box (it already
# carries the toolchain a fresh Windows machine lacks) and the crate shipped
# Windows-only.
set -eu
cd "$(dirname "$0")"

WASM_RUSTFLAGS="-C target-feature=+simd128"
if [ "${1:-}" = "nosimd" ]; then WASM_RUSTFLAGS=""; echo "[simd off]"; fi

command -v cargo >/dev/null 2>&1 || {
    echo "ERROR: cargo not found. Install Rust first:"
    echo "       curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
}
command -v wasm-pack >/dev/null 2>&1 || {
    echo "wasm-pack not found -- installing via cargo (one-time, ~1-2 min)..."
    cargo install wasm-pack
}

# Native sanity tests first (fast; catches port regressions before the slower
# wasm build). simd128 is a wasm-only feature, so native tests run without it.
echo "Running native tests..."
RUSTFLAGS="" cargo test --quiet || { echo "ERROR: cargo test failed -- not building wasm from a broken tree."; exit 1; }

echo "Building wasm (release)..."
RUSTFLAGS="$WASM_RUSTFLAGS" wasm-pack build --target web --release --no-typescript --out-name terrain_wasm

DEST="../world/wasm"
mkdir -p "$DEST"
cp -f pkg/terrain_wasm.js      "$DEST/"
cp -f pkg/terrain_wasm_bg.wasm "$DEST/"

echo
echo "Done. Installed:"
echo "  $DEST/terrain_wasm.js"
echo "  $DEST/terrain_wasm_bg.wasm"
echo
echo "Verify in-engine: open the world, then in the console run"
echo "  world.wasmGenStats()"
echo "Expect { ready: true, ... } and tilesOwned growing as you fly around."
echo "Disable anytime with ?wasmgen=0 or localStorage voxelengine.terrain.wasm=0."
echo
echo "Optional: run the JS-vs-WASM parity check from WebGLEngine/:"
echo "  node tools/terrain-parity.mjs"
