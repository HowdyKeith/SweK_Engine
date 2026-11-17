# The GPU Brain's reservoir kernel (2026-11-17; UNNUMBERED; branch `ccr-ca830954-770ho4`; backlog `gpu-reservoir-kernel`)

Keith, 2026-11-17: "May be done in another chat, but if not let's also do gpu-reservoir-kernel and circuit-seat-in-aquarium-survey". Checked first: no branch with a commit since 2026-11-05 names either item, and no GPU file in `brain/` mentions a reservoir.

## circuit-seat-in-aquarium-survey: ALREADY DONE (nothing built here)

It landed on main on 2026-11-07, with the commit carried in by `85b36f88`:
* `render/subAquariumCircuit.mjs` adds two survey profiles: `rule`, the tuned rule at the seat's constants, and `circuit`, the decision-circuit round's plain-net champion (digest c916e7f5).
* `render/subAquariumSim.mjs` seats them (`CP.isCircuitProfile`).
* `sub-aquarium.html`'s survey picker offers "rule (nearest-first)" and "circuit (trained net)".
* Its gate `render/subAquariumCircuit-selfcheck.mjs` passes here.

**Only the backlog entry is stale:** `circuit-seat-in-aquarium-survey` in `brain/BACKLOG_2026-11-04_BRAINS.md` (and any `nextRounds.mjs` echo of it). It belongs with the list of stale entries in `brain/LESION_TOGGLE_WIP.md` section 1.

## gpu-reservoir-kernel: BUILT

**What.** `brain/reservoirGpu.mjs`, `GpuReservoirBatch`: the recurrent step of `brain/pilotSubCircuitState.mjs`'s reservoir (the fly's heading loop: 148 cells, 7,080 synapses, the 1,729-weight pilot) for a BATCH of reservoirs, in ONE dispatch a tick. The state is kept on the device between ticks (ping-pong buffers), and `read()` is the only read-back.
* One thread per (reservoir, cell).
* The edges into each cell are a CSR list sorted by source, so each cell sums in the order the CPU twin's scatter reaches it.
* The gains are the twin's own (sign x count / the largest singular value), and sigma is clamped as the twin clamps it.
* NO STATE (`persist: false`) drops the recurrent sum. Non-finite features read as 0.
* `GpuReservoirBatch.create()` builds the kernel inside a validation error scope and THROWS if the device rejects it. Without this, a rejected pipeline runs nothing and reads back stale buffers, which is the hazard `tools/ship/headlessGpu.mjs` v4572 records.

**Found while building:** a first draft bound one storage buffer per table (9) and the device refused it, because WebGPU's portable default is 8 a stage. The tables are now packed into two buffers (`fv` for floats, `iv` for indices): 5 storage buffers, inside the default on any device.

**The gate** `brain/reservoirGpu-selfcheck.mjs` (about 15 s here) runs Dawn in Node through `tools/ship/headlessGpu.mjs`'s driver lookup and ends through `exitCleanly`. On this sandbox the adapter is **SwiftShader (google / swiftshader), a software adapter.**

| check | result (worst error, relative to max(1, \|twin\|); the limit is 1e-4) | float32 cells bit-identical to the twin (reported, not asserted) |
|---|---|---|
| one step, batch 8, with memory | 2.38e-7 | 777 of 1,184 |
| one step, batch 8, no state | 2.53e-7 | 953 of 1,184 |
| 120 ticks, batch 4, with memory (read every 20) | 3.07e-7 | 1,902 of 3,552 |
| 120 ticks, batch 4, no state | 2.86e-7 | 2,862 of 3,552 |
| **the file's 1,729 weights on features recorded from a real tank flight through the compass dropout, 4 reservoirs, 300 ticks** | **1.95e-7** | 1,777 of 3,552 |

Also checked:
* The tables are the circuit's.
* The lesion bias clamp (-1e30, `brain/lesion.mjs`) keeps L4 and PEG at exactly 0 on the device.
* A reservoir's result does not depend on its batch-mates (bit for bit).
* `reset()` zeroes every reservoir.
* NaN and Infinity read as 0.
* The refusals hold.
* `create()` throws on a device rejection.

**THE PRICE, printed and not asserted (SOFTWARE ADAPTER: these say nothing about a graphics card):** the device took 0.116 / 2.35 / 32.6 / 183 ms a tick for batches of 1 / 16 / 128 / 1,024. The CPU twin took 0.136 / 0.391 / 2.76 / 20.5 ms. **On SwiftShader the CPU twin is faster from batch 16 up.** The device beats the twin only at batch 1, where nothing is being computed in parallel. Whether a card overtakes the twin, and at what batch, is the rig's question: the number is OWED. The backlog's "timed by `tools/ship/gpuCrossover.mjs`" was not done. That tool's page script times the pilot and seat MLPs through the browser harness, and adding the reservoir to it is a change to a shared tool that a rig run would exercise. The gate's own timing section is the stand-in until then.

**SABOTAGE:** 23 mutants of `brain/reservoirGpu.mjs`, each alone in a scratch copy. On the first pass 22 went red:
* no relu, sigma ignored, NO STATE ignored, no bias, the input not added, inputs on every cell;
* the edge source read as the target, the last edge skipped, the batch offset and the feature-row offset dropped;
* the gain neither normalised nor signed;
* the CSR order reversed (red on the bit-identity of the batch row, not the tolerance), sigma unclamped, the bias offset wrong;
* no ping-pong, `fin` dropped, `reset` and `read` on the other buffer, too few workgroups, no row-count check, the input-slot sentinel colliding with slot 0.

One stayed green: "`create()` swallows the rejection". It got a row (a device whose validation scope reports a rejection must make `create()` throw), and then **23 of 23 were red**.

**NOT DONE:** the readout and the autopilot's laws on the device (they stay on the CPU twin); a pilot kind for the tank that steps its subs through this kernel; the rig's timing.
