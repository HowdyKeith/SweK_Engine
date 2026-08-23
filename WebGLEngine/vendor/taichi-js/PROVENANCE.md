# taichi.js — vendored

- **Upstream:** https://github.com/AmesingFlank/taichi.js
- **Version:** 0.0.36 (npm `taichi.js@0.0.36`, published dist)
- **License:** MIT — `LICENSE` beside this file, copied from upstream `master`.
  Copyright (c) 2024 Dunfan Lu.
- **What is here:** `taichi.js` only — the self-contained ESM browser bundle from
  the package's `dist/`. Nothing else from the package is copied.

## Why only the bundle

The npm package installs **107 MB** of `node_modules`, almost all of it
`@loaders.gl/gltf` and its dependency chain, which exists for taichi's *renderer*
and is never touched by compute kernels. That chain also carries **5 high-severity
advisories** (`image-size` → `texture-compressor` → `@loaders.gl/textures`) whose
only offered fix is a downgrade to `taichi.js@0.0.9`, a breaking change.

The shipped `dist/taichi.js` is self-contained — one file, no external imports —
so vendoring the bundle alone takes the compute path and leaves the vulnerable
loader chain, and the 107 MB, out of this tree entirely. That is a deliberate
narrowing, not an oversight: if a future round wants taichi's renderer, it has to
come back and take the dependency knowingly.

## What the bundle actually contains

3.5 MB, and most of it is **the TypeScript compiler**. taichi.js compiles a kernel
by calling `.toString()` on the JavaScript function you hand it and re-parsing that
source text with `typescript` at runtime, in the browser
(`src/language/frontend/KernelFactory.ts` → `ParsedFunction.makeFromCode`, and
`Compiler.ts` / `ParsedFunction.ts` both `import * as ts from 'typescript'`).

Two consequences worth writing down before anybody builds on this:

1. **It is a runtime JIT.** The kernel's source text must survive to runtime intact
   and be parseable. This is not a build-time codegen step and produces no
   checked-in WGSL.
2. **The WGSL cannot be inspected without a GPU.** `WgslCodegen.ts` imports
   `Runtime`, and `Runtime.ts` requires `navigator.gpu` before anything compiles —
   so there is no headless path that emits the generated shader for a gate to read.
   Any claim about what taichi generates for this engine has to be made on a
   machine with WebGPU, which is why the magmap comparison is rig-only.

## The operation-discipline question, checked

`tools/roundhouse/magmapGpu.mjs` states the rule its kernel is built on:
"SPECIFIED OPERATIONS ONLY: + - * / sqrt. No sin, no cos, no pow, no inverseSqrt".

Read against `src/language/codegen/WgslCodegen.ts`, taichi is compatible with that
rule but does not enforce it:

- `ti.sqrt(x)`  → `sqrt(f32(x))`      — matches
- `ti.rsqrt(x)` → `inverseSqrt(f32(x))` — violates, **if the author calls it**
- `UnaryOpType.inv` / `rcp` → `1.f / f32(x)` — matches

It does **not** silently lower `1.0/sqrt(x)` into `inverseSqrt`. So a kernel written
with only `+ - * /` and `ti.sqrt` generates compliant WGSL; the discipline stays the
author's responsibility, exactly as it is in the hand-written kernel.
