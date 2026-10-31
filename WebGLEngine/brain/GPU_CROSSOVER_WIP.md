# The GPU batch-size crossover (round 4 of the 2026-10-31 list; UNNUMBERED; registered BEFORE the tool is written or any number is taken)

Keith, 2026-10-31: "do the stateful fly pilot in the tank next, and then flow-field waypoints, and the GPU batch-size crossover". Rounds 2 and 3 are closed (`brain/TANK_PILOTS_WIP.md`, `brain/SUB_FIELD_NAV_WIP.md`). This is round 4.

## The question

The file headers of `brain/pilotFlightGpu.mjs` and `brain/seatGunnerGpu.mjs` say the GPU is SLOWER than the CPU twin at a fleet of three aircraft or a fight of two ships (a submission with a read-back costs more than a few thousand multiply-adds), and both say it is worth having because a batch of hundreds or thousands is one dispatch per layer. Neither says where the batch is big enough. **At what number of rows decided in one call does the GPU Brain's `decide()` overtake the CPU twin's forward passes, for the pilot network (18-32-32-4, 1,796 weights) and for the seat network (12-32-32-3, 1,571 weights), and how much does the `batchCap` (rows per dispatch; the default is 64) move it?**

## The honest part, said first

**Every device this sandbox has is SwiftShader**, Google's CPU rasteriser, which the harness (`tools/ship/webgpuHarness.mjs`) reports as a software adapter (`software: true`) and the tree's own gates call "a gate's device, not the brain's" (`brain/pilotFlightGpu-selfcheck.mjs`, `tools/ship/realGpuRun.mjs`: "the TIMES any gate prints are a software renderer's"). The native `webgpu` module finds no adapter at all (no Vulkan driver). So **a crossover measured here is a SOFTWARE ADAPTER's crossover and says nothing about a graphics card**; it is useful as the harness's own proof that the measurement runs and the parity holds, and as the shape of the cost (a fixed submission cost plus a per-row cost). The number that answers Keith's question is the RIG's, from the same command. The tool writes the adapter into every record and prints "SOFTWARE ADAPTER" in capitals when it is one.

## The measurement

`tools/ship/gpuCrossover.mjs` runs one script inside the harness's browser page (`runInEngineOrigin`, the engine origin over 127.0.0.1) so that BOTH sides are timed in the same page, by the same clock, on the same machine: the CPU twin is the module's own JavaScript forward (`brain/pilotFlightMlp.mjs forward`, `brain/seatGunnerMlp.mjs forward`) called once per row; the GPU side is `GpuPilotBrain.decide(rows)` and `GpuSeatBrain.decide(rows)` (weights uploaded once, the brain built once per configuration, three warm-up calls before any timing).
* **Batch sizes N**: 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 rows. Rows are drawn from a seeded generator (`mulberry`); the weights are the module's hand weights perturbed by a seeded generator (so the network is not degenerate).
* **Two GPU configurations**: `cap=N` (the brain's `batchCap` is the largest N, so every N is ONE dispatch and one read-back) and `cap=64` (the default: a call of N rows is ceil(N / 64) dispatches and read-backs).
* **Timing**: the time of ONE call, found by repeating the call back to back for at least 25 ms (the browser's clock is coarse) and dividing, five times over (rounds), reporting the MEDIAN of the rounds. A GPU call is awaited before the next begins, so this is the latency of a call and not a pipelined throughput. The CPU twin is timed the same way.
* **Parity first**: before any timing at a size, the GPU outputs for the same rows are compared with the CPU twin's (every output within 1e-4, float32 on the device against double in the twin, the tolerance the tree's own gates use); a size that fails has its timing reported but marked, and the verdict says so.
* **The crossover** N*: the smallest N at which the GPU's time per call is below the CPU twin's AND stays below at every larger N tested; "never" if the GPU never gets below, "from the first size" if it is below everywhere. Two configurations, two networks: four crossovers.
* The result is one JSON record (`--write` appends it to `brain/rig-results/gpuCrossover.jsonl`): the adapter (vendor, architecture, software or not), the launch flags, the table, the crossovers, the parity worst case, the date is not stored.

## Predictions, written before anything is run (software adapter on this box; the same words are asked of the rig)

* **G1** (parity): the GPU matches the CPU twin within 1e-4 at every size, both networks, both configurations.
* **G2** (a fixed cost): the GPU's time per call at N = 1 is within a factor of 3 of its time at N = 64 with `cap=N` (dominated by the submission and the read-back, not by the rows).
* **G3** (the CPU is linear): the CPU twin's time per ROW is flat from N = 16 up (largest over smallest within 1.5).
* **G4** (the cap costs): at N = 8192, `cap=64` is slower than `cap=N` for both networks (128 dispatches against one).
* **G5** (the networks agree): the pilot's and the seat network's `cap=N` crossovers are within a factor of 2 of each other (the networks are within 15% in weight count), when both exist.
* **G6** (reported, not predicted): the crossovers themselves, per network and configuration, with the adapter. On a software adapter I expect the GPU to be slower than the CPU twin at every size (a CPU emulating a GPU is not going to beat a CPU running the loop), i.e. "never"; this is a guess to be scored, not a claim.

G1 to G5 are scored held or missed by the command; G6 is a table.

## What it would not say

Nothing about a graphics card until the rig runs it. Not what the whole simulation costs (the flight model that each decision feeds is two orders of magnitude more arithmetic and stays on the CPU; the pilot header says so). Not the cost of building a brain (pipeline compilation, which the warm-up calls absorb) or of `setWeights`. Not pipelined throughput (many calls in flight). Not a different network size. One browser, one clock resolution.

## What the rig runs, said now

```
node tools/ship/gpuCrossover.mjs --write
```
from `WebGLEngine/` on the rig, with the browser told to use the card if it falls back to software (`SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan"`, `docs/real-hardware-fsr.md`). The record it appends names the adapter; a record that says `software: true` is not the answer.

## RESULT ON THE SANDBOX'S SOFTWARE ADAPTER (2026-10-31; `node tools/ship/gpuCrossover.mjs --write`, 21 s; the record is `brain/gpuCrossoverSoftware.jsonl`). **THIS IS SWIFTSHADER, A CPU EMULATING A GPU: NO ONE-DISPATCH NUMBER BELOW IS A GRAPHICS CARD'S. The answer to Keith's question is the rig's run of the same command; the file it appends to is `brain/rig-results/gpuCrossover.jsonl`.**

ms per call, median of five rounds (full table: the command; the pilot and seat networks; CPU twin against the GPU brain with the cap at the largest N, which makes every size one dispatch):

| N | pilot CPU | pilot GPU | seat CPU | seat GPU |
|---|---|---|---|---|
| 1 | 0.0026 | 2.76 | 0.0089 | 2.83 |
| 64 | 0.164 | 2.87 | 0.452 | 2.76 |
| 256 | 0.620 | 3.07 | 2.38 | 3.26 |
| 1,024 | 2.57 | 8.58 | 11.1 | **8.67** |
| 8,192 | 22.3 | 51.5 | 76.2 | 46.2 |

* **Crossovers.** Pilot network: **never** within 8,192 rows (the GPU is at 2.3 times the CPU at 8,192 and the ratio is closing slowly, 0.29 at 4,096 to 0.43). Seat network: **N = 1,024** with the cap at the largest N (the GPU is below from there up), **never** with the default cap of 64 (the 128 dispatches at 8,192 take 357 ms against 46 for one). Parity: every size, both networks and both configurations within 4.1e-6 of the CPU twin (the seat network's twin is the f32 mirror and agrees to the bit, 0.0).
* **The shape of the GPU's cost.** About 2.8 ms a call whatever the size up to 256 rows (the fixed cost of a submission and a read-back, here a CPU emulating both), then about 5.8 microseconds a row. The CPU twins cost 2.2 to 3.2 microseconds a row (pilot) and 7 to 12.5 microseconds a row (seat).
* **Why the two networks differ, and it is not the networks.** The pilot's CPU twin (`brain/pilotFlightMlp.mjs forward`) is a plain double-precision loop; the seat network's (`brain/seatGunnerMlp.mjs forward`) goes through `render/brainTsl.mjs mlpLayerCpu`, the float32 mirror of the kernel, which allocates and rounds. So the seat twin is three to four times slower a row and the GPU catches it at 1,024 rows; the pilot twin is the faster reference and the GPU does not catch it on this adapter. A crossover is a statement about a (twin, adapter) pair.
* **The default cap costs.** At 8,192 rows the default cap of 64 is 6.9 times slower than one dispatch (pilot 355 ms against 51) and 7.7 times (seat). A batcher that is meant to be fast at hundreds of rows should be built with a cap at least that large.

Predictions scored: **G1 held** (parity). **G2 held** (N = 1 within 3x of N = 64 with one dispatch: 2.76 against 2.87 and 2.83 against 2.76). **G3 MISSED**: the CPU twin's per-row cost is not flat from N = 16 up, by 1.76 (seat; the pilot's own spread is 1.48, just inside the bound): the seat twin's allocations and the garbage collector show as a 51 ms call at 4,096 rows against 18 at 2,048 and 76 at 8,192; this is noise in the reference, not in the GPU, and G3 was a prediction about the reference being linear. **G4 held** (the default cap is slower at 8,192, both). **G5 cannot be read** (the pilot never crosses). **G6, my guess that the GPU would be slower than the CPU everywhere on a software adapter, MISSED for the seat network** (N = 1,024), for the reason above.

**What it says.** The harness runs and the GPU brain's outputs agree with the twins it is timed against at every batch size; the cost of a call is a fixed price plus a per-row price; and the batch size at which the GPU wins depends on how slow the twin is as well as on the adapter. **What it does not say.** Anything about a graphics card (see the top). Pipelined throughput, the cost of building a brain, `setWeights`, or the simulation the decisions feed.

**The rig runs, from `WebGLEngine/`:**
```
node tools/ship/gpuCrossover.mjs --write
```
(with `SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan"` if the browser falls back to software, as `docs/real-hardware-fsr.md` says). It takes about half a minute. The first line it prints names the adapter; a first line that says SOFTWARE ADAPTER means the browser did not reach the card and the record is written to the software file, not the rig's.
