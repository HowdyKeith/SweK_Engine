#!/usr/bin/env bash
# WebGLEngine/physics/box3d/build-box3d-wasm-clang.sh — v2560
#
# BUILD box3d.wasm WITHOUT EMSCRIPTEN.
#
# For five versions this was listed as "rig-only: Keith must build it", because emsdk's CDN is blocked from the
# sandbox (storage.googleapis.com -> 403, proven in v2549). That was TRUE and it was NOT the whole answer.
# EMSDK IS NOT THE ONLY WAY TO MAKE WASM. clang has targeted wasm32 natively for years, and clang + wasi-libc +
# wasm-ld are all in the Ubuntu archive.
#
# I let "the CDN is blocked" stand as "the wasm is impossible" for five versions and put it on Keith's plate every
# time. THE BLOCKER WAS A HABIT, NOT A WALL.
#
# What this produces (measured, not hoped):
#   49 of 49 box3d v0.1.0 source files compile, zero failures
#   box3d.wasm, ~948 KB, 43 exports (40 swk_* + malloc + free + memory)
#   it instantiates, creates a world, adds a body, and steps
#
# The companion is vendor/box3d/box3d.js -- a drop-in for emscripten's glue, because box3dLoader.js was written
# against an emcc build and wants _swk_* plus HEAP*/_malloc/_free. See that file for why the loader was not
# changed instead.
set -euo pipefail

BOX3D_TAG="${BOX3D_TAG:-v0.1.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$(cd "$HERE/../.." && pwd)"
OUT="$ENGINE/vendor/box3d"
WORK="${WORK:-/tmp/box3d-clang-build}"

echo "== box3d.wasm via clang (no emscripten) =="

# ---- 1. the toolchain ----------------------------------------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1"; return 1; }; }
if ! need clang || ! need wasm-ld || [ ! -d /usr/include/wasm32-wasi ]; then
    echo "Toolchain not present. On Debian/Ubuntu:"
    echo "    sudo apt-get install -y clang lld wasi-libc libclang-rt-18-dev-wasm32"
    echo "On macOS: brew install llvm  (then use \$(brew --prefix llvm)/bin/clang), plus a wasi-sysroot."
    exit 1
fi
BUILTINS="$(find /usr/lib/llvm-*/lib/clang/*/lib/wasi -name 'libclang_rt.builtins-wasm32.a' 2>/dev/null | head -1)"
[ -n "$BUILTINS" ] || { echo "MISSING libclang_rt.builtins-wasm32.a -- apt-get install libclang-rt-18-dev-wasm32"; exit 1; }
echo "   clang:    $(clang --version | head -1)"
echo "   builtins: $BUILTINS"

# ---- 2. the source -------------------------------------------------------------------------------------------
mkdir -p "$WORK" && cd "$WORK"
if [ ! -d box3d ]; then
    echo "== fetching box3d $BOX3D_TAG =="
    git clone --depth 1 --branch "$BOX3D_TAG" https://github.com/erincatto/box3d.git
fi
SRC_N=$(ls box3d/src/*.c | wc -l)
echo "   $SRC_N source files"

# ---- 3. compile ----------------------------------------------------------------------------------------------
# --target=wasm32-wasi --sysroot=/usr picks up /usr/include/wasm32-wasi and /usr/lib/wasm32-wasi from the
# distro's wasi-libc package. NO EMSCRIPTEN ANYWHERE IN THIS.
rm -rf obj && mkdir -p obj
FAIL=0
for f in box3d/src/*.c; do
    clang --target=wasm32-wasi --sysroot=/usr -O2 -DNDEBUG \
          -Ibox3d/include -Ibox3d/src \
          -c "$f" -o "obj/$(basename "$f" .c).o" || { echo "   FAILED: $f"; FAIL=$((FAIL+1)); }
done
cp "$HERE/box3d_shim.c" .
clang --target=wasm32-wasi --sysroot=/usr -O2 -DNDEBUG -Ibox3d/include -Ibox3d/src -c box3d_shim.c -o obj/shim.o
[ "$FAIL" -eq 0 ] || { echo "== $FAIL source files failed -- stopping. A partial link would produce a wasm that loads and lies. =="; exit 1; }
echo "   compiled $SRC_N/$SRC_N + shim, zero failures"

# ---- 4. link -------------------------------------------------------------------------------------------------
# Export ONLY the swk_* surface plus malloc/free. --export-all works but ships 1603 symbols and 1.2 MB; naming
# the surface gets ~948 KB. The names are DISCOVERED from a probe link, not hand-listed -- a hand list would go
# stale the moment the shim gains a function, and the staleness would look like a missing feature at runtime.
wasm-ld obj/*.o -o probe.wasm --no-entry --export-all --allow-undefined \
    -L/usr/lib/wasm32-wasi -lc "$BUILTINS" 2>/dev/null
NAMES=$(node -e "
const fs=require('fs');
WebAssembly.compile(fs.readFileSync('$WORK/probe.wasm')).then(m=>
  console.log(WebAssembly.Module.exports(m).map(e=>e.name).filter(n=>/^swk_/.test(n)).join(' ')));
")
EXPORTS=""
for n in $NAMES; do EXPORTS="$EXPORTS --export=$n"; done
wasm-ld obj/*.o -o box3d.wasm --no-entry --allow-undefined $EXPORTS --export=malloc --export=free \
    -L/usr/lib/wasm32-wasi -lc "$BUILTINS"
echo "   linked $(echo "$NAMES" | wc -w) swk_* exports"

# ---- 5. PROVE IT RUNS BEFORE SHIPPING IT ----------------------------------------------------------------------
# A wasm that links is not a wasm that works. This is the whole difference between a build script and a hope.
node -e "
const fs=require('fs');
WebAssembly.instantiate(fs.readFileSync('$WORK/box3d.wasm'), { wasi_snapshot_preview1: new Proxy({},{get:()=>()=>0}) })
 .then(r=>{
   const e=r.instance.exports;
   const w=e.swk_world_create(0,-10,0);
   if (!w) throw new Error('swk_world_create returned ' + w);
   e.swk_body_box(w,0,5,0,.5,.5,.5,1);
   for(let i=0;i<120;i++) e.swk_world_step(w,1/60,4);
   if (e.swk_body_count(w) !== 1) throw new Error('body count is ' + e.swk_body_count(w) + ', expected 1');
   console.log('   RAN: created a world, added a body, stepped 120 frames.');
 }).catch(e=>{ console.error('   THE BUILT WASM DOES NOT RUN: ' + e.message); process.exit(1); });
"

# ---- 6. ship it ----------------------------------------------------------------------------------------------
mkdir -p "$OUT"
cp box3d.wasm "$OUT/box3d.wasm"
echo "== $OUT/box3d.wasm  ($(stat -c%s "$OUT/box3d.wasm" 2>/dev/null || stat -f%z "$OUT/box3d.wasm") bytes) =="
echo "   The glue beside it (box3d.js) is checked in, not generated. It bridges the underscore naming and"
echo "   HEAP* views that box3dLoader.js expects onto a raw clang build. See that file's header."
