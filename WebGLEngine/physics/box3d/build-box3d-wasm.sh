#!/usr/bin/env bash
# =============================================================================
# build-box3d-wasm.sh — v1989: compile erincatto/box3d (alpha, MIT) to WASM for SweK.
# Run on any box with git + a normal toolchain + network. Output lands in
# WebGLEngine/vendor/box3d/ where physics/box3d/box3dLoader.js picks it up.
#
# Prereqs: emsdk (https://emscripten.org/docs/getting_started/downloads.html)
#   git clone https://github.com/emscripten-core/emsdk && cd emsdk
#   ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
#
# Notes:
#   · Box3D is C17, no deps beyond libm — a clean Emscripten target.
#   · Upstream uses SSE2 via WASM SIMD: we pass -msimd128 (needs a browser with
#     WASM SIMD — everything current). Fall back: add -DBOX3D_DISABLE_SIMD=ON.
#   · Box3D is ALPHA — pin the tag below and re-test on bumps.
# =============================================================================
set -euo pipefail
TAG="${BOX3D_TAG:-v0.1.0}"
# resolve via the engine root (always exists) — cd'ing into vendor/ before mkdir failed on fresh trees
OUT="$(cd "$(dirname "$0")/../.." && pwd)/vendor/box3d"
WORK="${TMPDIR:-/tmp}/box3d-wasm-build"

# v2278 -- if emcc isn't on PATH but emsdk was installed (one-click or by hand), source its env so the build
# finds emcc without the operator re-opening a shell.
command -v emcc >/dev/null 2>&1 || { for env in "$HOME/emsdk/emsdk_env.sh" "${EMSDK:-}/emsdk_env.sh" "./emsdk/emsdk_env.sh"; do [ -f "$env" ] && { set +u; . "$env" >/dev/null 2>&1 || true; set -u; break; }; done; }
command -v emcc >/dev/null || { echo "emcc not found — install emsdk (Box3D page: Install emsdk) or source emsdk_env.sh first"; exit 1; }
command -v git  >/dev/null || { echo "git not found"; exit 1; }

mkdir -p "$WORK" "$OUT"
cd "$WORK"
if [ ! -d box3d ]; then
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$TAG" https://github.com/erincatto/box3d.git
  else
    echo "git not found; downloading box3d $TAG tarball via curl + tar"
    curl -sL "https://codeload.github.com/erincatto/box3d/tar.gz/refs/tags/$TAG" -o box3d.tgz
    tar -xzf box3d.tgz
    d="$(ls -d box3d-* 2>/dev/null | head -1)"
    [ -n "$d" ] && mv "$d" box3d || { echo "could not unpack box3d tarball"; exit 1; }
    rm -f box3d.tgz
  fi
fi
cd box3d

emcmake cmake -B build-wasm \
  -DCMAKE_BUILD_TYPE=Release \
  -DBOX3D_SAMPLES=OFF -DBOX3D_UNIT_TESTS=OFF \
  -DCMAKE_C_FLAGS="-msimd128 -O3"
cmake --build build-wasm -j

# The static lib's path varies across box3d / CMake versions (alpha), so find it rather than hardcode -- the
# most common first-build failure is the link step not finding libbox3d.a at the assumed path.
LIB="$(find build-wasm -name 'libbox3d.a' 2>/dev/null | head -1)"
[ -n "$LIB" ] || LIB="$(find build-wasm -name '*.a' 2>/dev/null | grep -i box3d | head -1)"
[ -n "$LIB" ] || { echo "ERROR: no box3d static lib (.a) under build-wasm/ -- the cmake build did not produce one. Static libs found:"; find build-wasm -name '*.a' 2>/dev/null || echo "  (none)"; echo "If box3d built shared/object files instead, point emcc at those."; exit 1; }
echo "Linking shim against: $LIB"

# Link the static lib + our thin C shim into a modularized ES module.
# The shim (box3d_shim.c, beside this script) exposes a minimal flat API the
# JS loader binds to: world create/step, body create (box hull), transform
# readback into a linear Float32Array, and a state hash for lockstep verify.
emcc -O3 -msimd128 \
  "$(dirname "$0")/box3d_shim.c" "$LIB" \
  -I include \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBox3D \
  -sALLOW_MEMORY_GROWTH=1 -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAPU8,HEAP32 \
  -sEXPORTED_FUNCTIONS=_swk_joint_spherical,_swk_joint_revolute,_swk_joint_weld,_swk_joint_count,_swk_joint_destroy,_swk_record_start,_swk_record_stop,_swk_record_size,_swk_record_copy,_swk_record_free,_swk_validate_replay,_swk_player_create,_swk_player_destroy,_swk_player_step,_swk_player_restart,_swk_player_seek,_swk_player_frame,_swk_player_frame_count,_swk_player_at_end,_swk_player_diverged,_swk_player_diverge_frame,_swk_player_set_workers,_swk_player_info,_swk_player_timestep,_swk_player_body_count,_swk_player_transforms,_swk_body_set_friction,_swk_body_set_restitution,_swk_contact_count,_swk_contacts,_swk_contact_stride,_swk_body_set_filter,_swk_body_get_filter,_swk_joint_set_collide_connected,_swk_joint_get_collide_connected,_swk_world_create,_swk_world_step,_swk_world_destroy,_swk_body_box,_swk_body_count,_swk_transforms,_swk_state_hash,_swk_body_impulse,_swk_body_ang_impulse,_swk_body_set_velocity,_swk_body_set_transform,_swk_body_set_type,_swk_body_ship,_swk_velocities,_malloc,_free \
  -o "$OUT/box3d.js"

echo
echo "Built: $OUT/box3d.js + box3d.wasm"
echo "The engine's box3dLoader.js will now report ready:true. Determinism check:"
echo "  two boxes run box3dLoader.selfTest() — the printed state hashes must match."
