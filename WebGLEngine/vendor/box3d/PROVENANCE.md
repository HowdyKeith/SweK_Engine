# box3d — provenance

Recorded at v4256. Before this file, `vendor/box3d/` held `box3d.js` and `box3d.wasm` and **nothing that
said where they came from** — the gap logged as backlog #61.

| field | value |
|---|---|
| upstream | https://github.com/erincatto/box3d |
| tag | `v0.1.0` |
| commit | `8441b4a06d6d09dcfb0b0f704df4d847d1437b92` |
| licence | MIT — `LICENSE` beside this file, "Copyright (c) 2026 Erin Catto" |
| SPDX | every source file carries `SPDX-License-Identifier: MIT` in its own header |
| status | ALPHA upstream. The build script pins the tag for exactly this reason. |

## What is vendored, and what is not

Vendored here:

- `LICENSE` — the grant itself, which must travel with the artifact.
- `include/box3d/*.h` — the whole public include closure (base, box3d, collision, config, constants, id,
  math_functions, types). Two headers is not the closure: `box3d.h` includes `base.h`, and vendoring only the
  two obvious ones left the shim uncompilable offline. 268 KB.

**Why the headers and not the sources.** `physics/box3d/box3d_shim.c` is written against this API and
nothing in the tree could check that offline: the build script clones box3d at build time and compiles with
`-I include` from the clone, so the header existed only on whichever machine last ran the build. A shim
calling a function that does not exist, or passing a struct whose field was renamed upstream, was
discoverable only by a build. With the headers here, `tools/ship/box3dFilter-selfcheck.mjs` reads the real
declarations and the mismatch is caught by a gate instead.

The `.c` sources are NOT vendored: they are 48 translation units the build already fetches, and copying them
would make this tree the place someone edits box3d, which it must not be.

## Rebuilt 2026-11-03, from this tag, in this sandbox

`box3d.wasm` was rebuilt by `physics/box3d/build-box3d-wasm-clang.sh` for the spinning-body round
(`physics/mechanics/SPINNING_BODY_WIP.md`), which added four shim exports: `swk_ang_velocities`,
`swk_body_set_ang_velocity`, `swk_body_set_damping` and `swk_body_inertia`.

| field | value |
|---|---|
| source | the tag and commit above, cloned fresh |
| toolchain | Ubuntu clang 18.1.3, wasi-libc 0.0~git20230113.4362b18-3, libclang-rt-18-dev-wasm32, binaryen 108 (`wasm-opt -Oz`) |
| compiled | 49 of 49 sources and the shim, zero failures |
| artifact | 830,021 bytes, sha256 `6b47b5f5a488689723d600ace0173da5e6d44ccc1a3f26b8d9aae85cef9dc97c`, 81 `swk_*` exports |
| replaced | 829,117 bytes, sha256 `1d1ac2d9cfce2dabf74c448b05232776be3fa5e6fb62175b7c66c2b9af782d7c`, 77 `swk_*` exports |

The export surface grew by exactly the four new names; nothing was lost. A fixed battery of five scenes (a stack
falling onto ground, a tumbling box, a jointed pair, two ships, a bouncing box) gives **identical state hashes** on
both artifacts -- `tools/roundhouse/spinningBody.mjs`'s `BATTERY_BEFORE`, held by its gate.

The section below is history. The artifact it describes already exported the four collision-filter functions by
the time of this rebuild.

## The artifact predates the shim

`box3d.wasm` here was built before v4256's collision-filtering functions existed, so those four names are
declared in the shim and absent from the artifact. That is written down rather than left to be discovered —
see `PENDING_REBUILD` in `physics/box3d/box3dNode.mjs`, which `exportReport()` grades.
