# The GPU kernel contract (v4468)

What a physics computation must ship as, so it slots into the device, the two harnesses, the corpus and the
lab's gates without anybody remembering to wire it. Written after the physics-lab survey at v4464 found five
families reaching WebGPU five different ways and no file under physics/ importing gfx/device.js.

## The template

render/lyapunovWgsl.mjs. Read it before writing a kernel module; every rule below is a line in it.

## One module, five exports

1. **A WGSL producer** whose name carries `Wgsl` (a function returning the text, or a frozen `*_WGSL`
   constant). The census in tools/ship/wgslCorpus.mjs finds producers by that name, so a kernel outside
   the roots it walks is a kernel nobody can name -- and the roots are asserted by what they find.
2. **`packProbeUniforms(args)`** (or the module's own packer, named in the manifest): the uniform block as a
   Float32Array, at least 16 bytes. Integers travel as their bit patterns (tools/roundhouse/hmcGpu.mjs
   probeUniforms shows how) so the shader's own struct is the one that ships.
3. **`probeCpu(args)`** (or the module's own twin, named in the manifest): the CPU twin, in the SAME operation
   order as the kernel, with Math.fround after every op where the claim is bit identity and in f64 where the
   claim is a tolerance earned from a measured floor. The twin must be pinned to the shipped solver, not be a
   second definition of it: physics/xpbd/xpbdWgsl.mjs frameFlat and tools/roundhouse/hmcGpu.mjs leapfrogFlat
   are one implementation with one rounding knob, and their gates hash the f64 knob against the shipped code.
4. **`keyCpu()`**: the exact key the physics is held to -- ln 2 for the logistic map at r = 4, Wien's roots,
   the white furnace's 1, the discrete free-fall parabola -- computed by the graded module, never retyped.
5. **`PROBES`**: the manifest, a frozen array of entries:

   ```
   { id, code(args), entryPoint, args, pack(args), inputs?(args), outInit?(args),
     outCount, workgroups, cpu(args), tol | rel | graded, key(args), device? }
   ```

   `id` is the corpus id (module basename dot producer). `tol` is an absolute tolerance, `rel` a relative
   one, both stated BEFORE the device answered and earned from a measured floor; `graded` names the gate that
   grades the kernel when element-for-element is not a claim (a chaotic map, a hit at a silhouette).
   `device: true` marks a kernel outside the one-buffer signature (several entry points, shared buffers):
   it is run through gfx/device.js by the gate it names, not by the harnesses.

## The three paths, and what each proves

- **The harnesses** (tools/ship/headlessGpu.mjs on Dawn, tools/ship/webgpuHarness.mjs in the browser) take
  the one-buffer signature: out at binding 0, uniforms at 1, `inputs` by binding index, `outInit` for a
  kernel that works in place. tools/ship/crossBackend-selfcheck.mjs holds every corpus entry to byte
  identity across them.
- **The device** (gfx/device.js through render/computeRun.mjs) binds by the names the WGSL declares.
  tools/ship/deviceCompute-selfcheck.mjs runs every runnable corpus entry through it and holds each to the
  harness, byte for byte. A page or a gate never builds an adapter, pipeline or bind group of its own.
- **The manifest** (tools/ship/probeConvention-selfcheck.mjs) runs every PROBES entry on Dawn and holds it
  to its twin within its stated tolerance, and asserts that every physics corpus entry has one.

## What goes where

- A kernel's text, packer, twin, key and manifest live in ONE shipping module. A gate assembles shader
  markers rather than carrying shader text (render/backendParity.mjs counts a gate that does as a consumer).
- The corpus entry (tools/ship/wgslCorpus.mjs) says WHY the kernel is worth running across backends.
- The instrument row (physics/instruments.mjs) names the gate and the key.
- A device consumer (a page, a scene) calls the module's runner -- physics/mpm/mpmDevice.mjs,
  physics/xpbd/xpbdWgsl.mjs makeClothDevice -- and gets the CPU twin on a backend without compute, with
  `path` saying which ran.

## Not yet

An iterative kernel (a sampler, a solver) still hand-rolls its ping-pong buffers; the step-loop helper is
task 28. A TSL-generated kernel cannot take its loop bound from a buffer; that is task 30.
