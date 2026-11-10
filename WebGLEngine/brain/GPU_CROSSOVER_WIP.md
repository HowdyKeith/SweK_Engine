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
(SUPERSEDED on 2026-11-01: the rig command is `node tools/ship/gpuCrossover.mjs --hardware --write`, see the end of this note.) From `WebGLEngine/` on the rig, with the browser told to use the card if it falls back to software (`SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan"`, `docs/real-hardware-fsr.md`). The record it appends names the adapter; a record that says `software: true` is not the answer.

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

**The rig runs, from `WebGLEngine/` (corrected 2026-11-01):**
```
node tools/ship/gpuCrossover.mjs --hardware --write
```
`--hardware` asks the browser for the card (`webgpuHarness.mjs` HARDWARE_ARGS, on Windows `--enable-unsafe-webgpu --use-angle=d3d11`). **An ordinary run on Windows asks for the SwiftShader adapter on purpose** (the harness's rig-run-4 decision: the device rows were measured on it), so without `--hardware` the rig would write a software record. An earlier version of this note said to set `SWEK_LAUNCH_ARGS` to a Vulkan flag set copied from the Linux example in `docs/real-hardware-fsr.md`: that was wrong for the rig. It takes about half a minute. The first line it prints names the adapter; "SOFTWARE ADAPTER" means the browser did not reach the card and the record went to `brain/gpuCrossoverSoftware.jsonl`, not `brain/rig-results/gpuCrossover.jsonl`.

## RESULT ON THE RIG (2026-11-01; `node tools/ship/gpuCrossover.mjs --hardware --write` on Keith's rig, adapter nvidia / pascal (the GTX 1080), `software: false`, launch args `--enable-unsafe-webgpu --use-angle=d3d11`; the record is `brain/rig-results/gpuCrossover.jsonl`, one line, as it stood on the rig). **THIS IS A GRAPHICS CARD'S NUMBER, and it answers the question.**

ms per call, median of five rounds, CPU twin against the GPU brain with the cap at the largest N (one dispatch):

| N | pilot CPU | pilot GPU | seat CPU | seat GPU |
|---|---|---|---|---|
| 1 | 0.0049 | 2.54 | 0.0091 | 2.73 |
| 64 | 0.194 | 2.82 | 0.747 | 3.02 |
| 256 | 1.10 | 3.06 | 2.85 | 3.06 |
| 512 | 1.52 | 3.13 | 6.50 | **3.18** |
| 1,024 | 3.31 | 3.61 | 14.9 | 3.83 |
| 2,048 | 10.2 | **4.32** | 26.7 | 4.57 |
| 8,192 | 26.3 | 9.33 | 90.9 | 10.5 |

* **Crossovers (one dispatch): the pilot network at N = 2,048 rows, the seat network at N = 512.** Below those the CPU twin is faster: at 256 rows the pilot's twin takes 1.1 ms against the GPU's 3.1 ms. **With the default cap of 64: NEVER within 8,192 rows**; at 8,192 rows the default costs 356 ms (pilot) and 355 ms (seat) against 9.3 and 10.5 ms for one dispatch (38 and 34 times). Parity: the pilot's outputs within 4.1e-6 of the twin at every size and both configurations, the seat network's exactly (0.0).
* **The shape of the card's cost.** About 2.5 to 3.1 ms a call whatever the size up to 256 rows (the fixed price of a submission and a read-back; the software adapter's was 2.8 ms: it is the browser's round trip, not the arithmetic), then 0.82 microseconds a row (pilot) and 0.97 (seat) on the card. The CPU twins cost 3.0 to 5.0 microseconds a row (pilot) and 11 to 14.6 (seat). At 8,192 rows the card is 2.8 times faster than the pilot's twin and 8.7 times faster than the seat's.
* **What differs from the software adapter's run** (the pilot never crossed there, the seat crossed at 1,024): on the card the pilot crosses (2,048) and the seat crosses sooner (512). The crossover is a statement about a (twin, adapter) pair, as the software note said; the seat twin's allocating float32 mirror is why its crossover is four times lower than the pilot's.

Predictions scored: **G1 held** (parity). **G2 held** (N = 1 within 3x of N = 64: 2.54 against 2.82 and 2.73 against 3.02). **G3 MISSED**, again from the pilot's twin: its per-row cost is 2.98 to 4.96 microseconds a row from N = 16 up (largest over smallest 1.67, bound 1.5; the seat's is 1.31); the twin's garbage collection shows at 2,048 rows. **G4 held** (the default cap is slower at 8,192 rows, both). **G5 MISSED**: the one-dispatch crossovers are 2,048 and 512, a factor of 4, not within 2 (the software run could not score it). **G6**, my guess for the software adapter (never), is a statement about that adapter and was missed there for the seat network; on the card the answer is the table above.

**What it says.** A batch has to be big before the GPU brain pays: about **2,000 pilot decisions or 500 seat decisions in ONE call**; a fleet of three aircraft, a fight of two ships or a swarm of a few hundred is faster on the CPU twin. The batcher must be built with a cap at least as large as the batch (the default of 64 loses by a factor of 30 or more at thousands of rows). **What it does not say.** Anything about the cost of the simulation the decisions feed (it stays on the CPU, two orders of magnitude more arithmetic); pipelined throughput (many calls in flight); the cost of building a brain or of `setWeights`; another card (a Pascal card through D3D11 and ANGLE in one browser); other network sizes. The pilot-swarm demo, which waited for this number, can now be sized: it needs a swarm of thousands, in one dispatch.
