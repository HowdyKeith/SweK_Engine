---
type: claim
title: "The wasm blocker was a habit, not a wall"
description: "CLAIMED FOR FIVE VERSIONS: box3d.wasm cannot be built in this sandbox, so it is rig-only and Keith must do it. The evidence was real -- emsdk's CDN returns 403 here (storage.google"
tags: [broken, "swek-engine", v2560]
timestamp: v2560
---

# The wasm blocker was a habit, not a wall

- **Status:** broken  
- **Since:** v2560

## Prediction

CLAIMED FOR FIVE VERSIONS: box3d.wasm cannot be built in this sandbox, so it is rig-only and Keith must do it. The evidence was real -- emsdk's CDN returns 403 here (storage.googleapis.com, proven in v2549) -- and the conclusion drawn from it was that the wasm was impossible.

## Why

The 403 was true. It was also the entire investigation. 'The emsdk CDN is blocked' became 'wasm is impossible' without anyone asking whether emsdk was the only road.

## Measured

IT WAS NOT. clang has targeted wasm32 natively for years, and clang + wasi-libc + lld are all in the Ubuntu archive, which IS in the allowlist. One apt-get. MEASURED: 49 of 49 box3d v0.1.0 source files compile with `clang --target=wasm32-wasi --sysroot=/usr`, ZERO failures. box3d.wasm is 948 KB with 40 swk_* exports. It creates a world, adds a body, steps 120 frames, and answers through the exact surface box3dLoader.js uses. THE BLOCKER WAS A HABIT, NOT A WALL -- and it took one question ('can anything else here emit wasm?') whose answer was sitting in apt the whole time. Five versions of putting it on Keith's plate.

## Kill condition

Already dead. The wasm exists, it is gated, and the build script reproduces it from a clean tree. The claim it replaces -- 'rig-only' -- was FALSE and had been recorded as fact in five changelogs.

# Citations

- Code: physics/box3d/build-box3d-wasm-clang.sh + vendor/box3d/{box3d.wasm,box3d.js} + wasmBuild-selfcheck.mjs (17 checks, gated). The glue is a drop-in for emscripten's, because box3dLoader.js was written against an emcc build and wants _swk_* (emcc prefixes exports with an underscore; wasm-ld does not) plus HEAP*/_malloc/_free -- NEVER BREAK WORKING THINGS, so the furniture was provided rather than 40 call sites changed. HEAP views are GETTERS because a wasm that grows its memory detaches every existing view, and a stale HEAPF32 reads zeros and looks exactly like physics that stopped working. WASI stubs are LOUD (a silent stub is a lie that compiles) and proc_exit THROWS. SIDE EFFECT: tools/ship/shimCompiles.mjs printed 'SKIPPED -- box3d headers not found. This is NOT a pass.' for five versions; it now actually compiles the shim (42 swk_ functions) against real headers. STILL UNVERIFIED: the BROWSER path -- the loader fetches /vendor/box3d/box3d.js and the bridge will not boot here (no node_modules). The wasm, the glue, and their round trip are proven in Node.
- Page: `/box3d-info.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
