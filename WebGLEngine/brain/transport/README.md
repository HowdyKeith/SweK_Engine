# prime-transport-deterministic

A constrained beam-search layer ("Prime Transport") for a GPU brain: at each thinking step, **prime candidates**
(next states) are filtered by a **wheel** (routing-constraint matrix) against the **surviving tuplets** (validated
history), and the survivors seed the next step. The hard part is **compaction** -- turning "which candidates
survived" into a dense list -- and doing it so the answer is **the same bits on every machine**.

## The two bugs this fixes

The original reference shader had two defects:

1. **Tuplet-index bounds hazard.** It guarded the thread index only against the *candidate* array, then used that
   same index to read the *tuplet* array -- a different length. Out-of-range reads are silently clamped/zeroed by
   WGSL, so bad history passed the filter with no crash to notice. Fixed by giving each candidate an explicit
   `parent_tuple_index` and bounds-checking it against the tuplet array.

2. **`atomicAdd` non-determinism.** Compaction via `slot = atomicAdd(&count, 1)` gives each survivor a unique slot,
   but the slot depends on *which thread's add fired first*, and GPU scheduling is not deterministic. Same input,
   same survivors, different order -- run to run and card to card. For an engine built on bit-identical
   cross-architecture output, that is disqualifying.

(Plus two latent ones: no bounds check on the output write, and recovering the matrix dimension via
`sqrt(arrayLength(...))`, which loses precision. Both fixed -- output is guarded, `num_states` is a uniform.)

## The fix: three-pass stream compaction

`flag -> exclusive prefix sum -> scatter`. Each candidate writes a 0/1 flag at **its own** index; an exclusive scan
turns the flags into offsets (`offsets[i]` = survivors strictly before `i`); each survivor scatters to
`surviving[offsets[i]]`. Because `offsets[i]` is a pure function of the flags -- **not** of processing order --
survivor *k* lands in the same slot no matter which thread runs first. That is the property `atomicAdd` cannot give.

## Why there is a CPU twin

WGSL compute cannot be executed without a GPU, so a shader alone can only be *asserted* deterministic, never
*shown*. `primeTransport.js` is the identical algorithm in plain integer JS -- it is the **Node / WebGL2 fallback**
path, and it is the **reference the GPU port must match**. The gate runs on the twin and *proves* the determinism:

- **`primeTransport-selfcheck.mjs`** runs the compaction under 200 shuffled visit orders (standing in for warp
  scheduling) and asserts **byte-identical output every time** -- and runs an `atomicAdd`-style compaction under the
  same permutations to show it does *not* hold, so the test is not vacuous. Also checks correctness vs a brute-force
  filter, bounds safety, and stable ordering. Sabotage: swap the scatter to a running counter -> the permutation
  test fails.

Run it: `node primeTransport-selfcheck.mjs`

## The GPU port (rig-only)

`shaders/{filter,scan,scatter}.wgsl` mirror the twin; `pipeline.js` drives the three passes and ships a
`parityCheck(device, pipes, problem)` that runs the GPU and the CPU twin and asserts they are byte-identical. Run
that once on real hardware after wiring -- if it ever diverges, the port is wrong, not the reference.

**Known limit:** the scan is a single-workgroup Blelloch scan (N <= 1024 candidates). For larger candidate sets,
use a multi-block scan with per-block carries; the CPU twin has no such limit and stays the reference.

## Files

- `primeTransport.js` -- deterministic CPU reference / Node / WebGL2 fallback (filterFlag, exclusiveScan, scatter, compact)
- `primeTransport-selfcheck.mjs` -- the gate (permutation-invariance is the spine)
- `shaders/filter.wgsl`, `shaders/scan.wgsl`, `shaders/scatter.wgsl` -- the GPU port
- `pipeline.js` -- WebGPU orchestration + `parityCheck`

## Optimizations (adopted only with proof)

The rule here: an optimization ships only if the gate shows it leaves the bytes unchanged. Implemented and proven:

- **Bit-packed wheel matrix** (`packWheel`, `filterFlagPacked`, `shaders/filter-packed.wgsl`): a boolean routing
  matrix packed to 1 bit/route, ~96.9% smaller VRAM, so far larger state spaces fit in cache. The gate proves the
  packed path yields byte-identical flags to the u32 path and stays permutation-invariant.

Recommended, determinism-safe, rig-measured (not yet wired here):

- **Fuse the three passes into one** (N <= 1024): do filter -> exclusive scan -> scatter in a single shader using
  `workgroup` shared memory, eliminating the global `survived_flags`/`offsets` round-trips. The scan stays a
  deterministic Blelloch tree, so output is unchanged -- verify with the twin parity check. Biggest bandwidth win.
- **Buffer / bind-group reuse**: pre-allocate all buffers and bind groups to max capacity once; per cycle, only
  update the uniform's length and re-encode. (WebGPU command buffers are single-use, so you re-encode each submit --
  it is the buffer/bindgroup/pipeline *allocation* you avoid, not the encoding.) Pure perf, zero determinism risk.

Situational (measure first):

- **Workgroup caching of wheel rows**: only helps if candidates are grouped by parent state AND the matrix is large;
  for a small matrix it already lives in cache. **Top-K early-exit**: only helps if candidates are pre-sorted by
  score and sub-threshold ones are contiguous (SIMT warps skip together); does nothing on unsorted input.

None of these change the output. The point of the twin+gate is that you never have to take that on faith.

## Fused single-pass (and the multi-workgroup trap)

`shaders/fused-single-workgroup.wgsl` folds filter + scan + scatter into ONE workgroup pass over SRAM with a
bit-packed wheel -- no global `survived_flags`/`offsets`. For N <= 1024 it is fully deterministic: one workgroup, so
the global base offset is always 0 and no atomic is used.

**Do NOT scale this to N > 1024 with a per-workgroup `atomicAdd`.** Claiming each block's global base with an atomic
hands out bases in workgroup-SCHEDULING order, so the global output order drifts run-to-run and card-to-card -- the
original atomicAdd non-determinism, moved from per-thread to per-block. The gate proves it (check 8): under permuted
workgroup order the atomic version's output moves while the scan version's does not.

The deterministic multi-block path is a **two-level scan**: (1) each block does its local filter+scan and writes its
survivor COUNT to `block_counts[workgroup_id]`; (2) an exclusive scan over `block_counts` gives each block a base
that is a pure function of the counts, not the schedule; (3) each block scatters to `base[workgroup_id] +
local_offset`. `compactBlocked(..., "scan")` in the twin is the reference for this; `"atomic"` is the broken version
kept only so the gate can tell them apart.

### Multi-block shader now implemented

The two-level scan is no longer just described -- `shaders/mb-scan-block.wgsl` (per-block filter + local scan +
block counts), `shaders/mb-scan-blocks.wgsl` (exclusive scan over block counts), and `shaders/mb-scatter.wgsl`
(scatter to `block_bases[block] + local_offset`) implement it, and `runMultiBlockGPU()` in pipeline.js drives all
three. Handles up to 1024 blocks (N <= 262144 at block size 256); recurse pass B for more. Gate check 9 proves the
algorithm equals the reference single scan byte-for-byte at 3000 candidates across 12 blocks. No atomics anywhere.
