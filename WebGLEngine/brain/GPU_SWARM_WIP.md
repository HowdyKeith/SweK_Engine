# The GPU pilot swarm (UNNUMBERED; registered BEFORE the tool is written or a swarm is flown)

Keith, 2026-11-01: "fix traffic and also gpu pilot swarm demo, and the sensed map for the sub". This is the second of the three. The backlog entry (`gpu-pilot-swarm-demo`) said: *a swarm of pilots decided in one dispatch: unblocked by the rig's crossover, and it needs thousands (the GPU pays above about 2,000 pilot decisions in one call); a demo with a batchCap at least the batch size, against the CPU twin, timing the decision call.* The crossover (`brain/GPU_CROSSOVER_WIP.md`, `brain/rig-results/gpuCrossover.jsonl`) was measured on random rows, one call at a time. This round flies an actual swarm.

## The question

Take N aircraft (the scenarios of `brain/flightTask.mjs`), fly them together for a few seconds with `flyFleet` (`brain/pilotFlightGpu.mjs`: one batched decision per tick for every flight still in the air), and decide them two ways: the CPU twin (`brain/pilotFlightMlp.mjs forward`, once per aircraft) and the GPU brain with `batchCap` equal to N (one dispatch per layer, one read-back per tick). Three things are asked.

1. **Do they fly the same swarm?** (Not only the same numbers on random rows: the same aircraft ending the same way.)
2. **Does the crossover predict the swarm?** The decision call of a swarm of 4,096 or 8,192 should be faster on a card; of 64 should not.
3. **How much does that matter for the swarm's tick?** The pilot header says the flight model is "two orders of magnitude more arithmetic" than the network and stays on the CPU. If so, a free decision cannot make a swarm tick more than a little faster. This is the question the demo is for: how big a swarm runs in real time (a 30 Hz tick in 33.3 ms), with each decider.

## The honest part, said first

**Every device this sandbox has is SwiftShader, a CPU emulating a GPU.** A run here measures the harness and the software adapter, not a card; the printout says SOFTWARE ADAPTER when it is one and the record names the adapter. The answer to question 2 and question 3 is the rig's run of `node tools/ship/gpuSwarm.mjs --hardware --write`. Whatever number I read here is a software renderer's.

**A rough look before this was written** (not a result; a CPU-decided fleet of 256 and of 1,024 aircraft flown for 3 s in node, under load from other jobs): the decision was 5.5 to 7.3 microseconds an aircraft-tick and the whole tick 15 to 29, i.e. the decision was about a quarter to a third of the tick and the flight model and bookkeeping the rest. That is why prediction W5 is a bound and not a guess about a number: it says the decision is not the larger part of the tick, with room to spare.

## What is flown

* **Sizes N**: 64, 256, 1,024, 2,048, 4,096, 8,192 aircraft (the sizes the crossover tool shares, from 64 up). The scenario of aircraft i is `scenario(i + 1, KINDS[i mod 3])`: the three kinds in turn, 8,192 distinct seeds.
* **Weights**: the network's hand weights (`handWeights()`, the autopilot's laws in the network) — the swarm flies instead of crashing, so the number of aircraft still deciding stays near N for the whole run.
* **Time flown**: 3 s a swarm (90 ticks at 1/30 s), `--seconds` to change it. `flyFleet` is the library's own lockstep flyer; the decider handed to it is a wrapper that adds up the time spent INSIDE the decision call (for the GPU, the awaited dispatch, the read-back and the clamp; for the CPU, the loop over the rows) and counts the rows asked for.
* **Three numbers a swarm**: the decision time (the wrapper's sum), the whole time (around `flyFleet`) and the rest (physics, features, bookkeeping: whole minus decision). Per tick: divide by the ticks flown. Per aircraft: divide by the rows asked for.
* **Order and repeats**: for each size, CPU then GPU then CPU then GPU, `--rounds` (default 3) pairs; the MEDIAN of the rounds is what is reported. One warm-up swarm of 16 aircraft before anything is timed (pipeline compilation).
* **Parity, two ways**: (a) on the swarm's first tick, before any flight has diverged, the GPU's controls for the N rows against the CPU twin's (the worst difference over all rows and all four controls); (b) after the run, the two swarms compared aircraft by aircraft: the status each ended in, and the final altitude.
* **The record** (`--write` appends one JSON line, a software adapter's to `brain/gpuSwarmSoftware.jsonl` and a real adapter's to `brain/rig-results/gpuSwarm.jsonl`): the adapter, the settings, the table, the predictions' scores.

## Predictions, written before anything is run

* **W1** (decisions agree): on the first tick every control of every aircraft is within 1e-4 of the CPU twin's, at every size.
* **W2** (the swarm agrees): at every size at least 99% of the aircraft end in the same status under the two deciders, and at least 95% end within 1 m of the same altitude (the 18-scenario gate holds the pilot to "the same statuses, scores within 2e-3, final altitudes within 1 m"; a swarm of thousands is held to a share, not to every aircraft, because a tail of aircraft near a decision boundary may part by float32 against double).
* **W3** (the decision call scales): the CPU's decision time per row, from 1,024 rows up, is flat (largest over smallest within 1.5); the GPU's one-dispatch decision time per row at 8,192 is at most a third of what it is at 256 (the fixed cost of a dispatch and a read-back spread over more rows).
* **W4** (the crossover predicts the swarm). On a HARDWARE adapter: the GPU decides faster than the CPU twin at 4,096 and 8,192 and slower at 64. On a SOFTWARE adapter (a CPU emulating a GPU; the sandbox's crossover for this network was "never within 8,192"): the GPU is slower than the CPU at every size. The command scores the half that belongs to the adapter it got.
* **W5** (the decision is not the tick): the CPU-decided swarm spends at most 60% of its tick in the decision at 1,024 rows and above, so the whole-tick speedup from a free GPU decision is below 2.5 times, and the measured whole-tick speedup (CPU-decided tick over GPU-decided tick) is below 2.5 at every size.
* **W6** (reported, not predicted): the table, and the **largest swarm that fits a 30 Hz tick** (tick time at most 33.3 ms) under each decider among the sizes flown, and the speedup of the whole tick at each size.

W1 to W5 are scored held or missed by the command; W6 is the table.

## What it would not say

Nothing about a graphics card until the rig runs it. Not a trained pilot's flight quality (the hand weights are the autopilot's laws; the training results are other notes'). Not what the same swarm costs on the page's frame loop (this is the node-and-browser harness's page). Not the cost of building a brain (the warm-up absorbs it) or of `setWeights`. Not pipelined throughput (one tick's decision is awaited before the physics of that tick runs, as in `flyFleet`). Not a different network, and not a swarm of subs (the sub pilot's network is the same family but the sub flight model is a different cost).

## What the rig runs, said now

From `WebGLEngine/` on the rig, with the checkout on this branch:

```
node tools/ship/gpuSwarm.mjs --hardware --write
```

It prints the adapter on its first line (`hardware adapter:` or `*** SOFTWARE ADAPTER ***`), the table, the scores of W1 to W5, and appends the record to `brain/rig-results/gpuSwarm.jsonl` when the adapter is a card. A smaller look: `--sizes 1024,4096 --rounds 1 --seconds 1`.
