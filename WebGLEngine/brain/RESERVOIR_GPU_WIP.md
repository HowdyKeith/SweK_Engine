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

## 2026-11-17 (session `code-review-nr3a0i`): THE READOUT AND THE LAWS ON THE DEVICE, and the rig's number made committable

Keith: "lets do the GPU reservoir kernel". The kernel above was already built on main. This picks up the first item of its NOT DONE list.

**`brain/reservoirPilotGpu.mjs`, `GpuPilotBatch`.** The kernel's step, then a second dispatch on the same queue: one thread per (reservoir, output), `controls = clamp(law(x) + b2 + W2 . h[output cells], -1, 1)`. A tick now reads back **4 controls a reservoir (16 bytes) instead of 148 activities**.
* The law is taken from the CPU pilot, not retyped. `lawMatrixOf` probes `pilotSubCircuitState`'s own step with every weight zero and one small feature at a time. The gate shows it is linear and term for term the PD autopilot's laws.
* `resetSome(indices)` zeroes chosen reservoirs only, as the CPU pilot resets its activity when its target object changes.
* `create()` builds both kernels inside a validation scope and throws on a rejection.

**Its gate** `brain/reservoirPilotGpu-selfcheck.mjs` (about 3 s here, SwiftShader):

| check | worst control error against the CPU pilot (the limit is 1e-4) |
|---|---|
| random features, batch 8, 100 ticks, with memory / no state | 5.3e-7 / 4.8e-7 |
| the file's 1,729 weights on a real tank flight through the dropout, 4 reservoirs, 300 ticks | 2.4e-7 |
| a saturating readout bias (exactly +1 / -1 every tick), the rest | 9.6e-9 |
| one reservoir reset mid-run (a run that does not reset it misses by more than 1e-3) | 3.5e-7 |

Also checked: a reservoir's controls do not depend on its batch-mates (bit for bit); `controls()` reads batch x 4 numbers; a reported rejection makes `create()` throw.

**THE PRICE ON THIS SANDBOX (SwiftShader, a software adapter: nothing about a card).** A whole pilot tick with its controls read back: device 0.24 / 1.6 / 13 / 99 ms for batches of 1 / 16 / 128 / 1,024, against the CPU pilot's 0.03 / 0.55 / 3.3 / 22 ms. Slower everywhere, as the kernel alone was from batch 16 up.

**`tools/ship/takeReservoirGpu.mjs`** now prints two tables:
* the kernel's steps back to back with one read at the end (throughput, which no pilot gets);
* **the whole pilot with its controls read back every tick**, which is what a pilot pays.

`--write` puts both and the adapter in `brain/rig-results/reservoir-gpu-timing.json`, so the rig's number comes back as a file instead of a pasted log. **The number is still OWED.** It must come from the rig's card, not from here.

**Still NOT DONE, said plainly.**
* A pilot kind for the tank that flies its subs through this. The tank's step is synchronous and a device read-back is not, so it needs a one-tick-late design: the controls of tick t are applied at t + 1, which changes the flight. A design question for Keith, not a port.
* Training on the device.

**AN INDEPENDENT REVIEW, AND WHAT IT CHANGED (2026-11-17).** Three reviewers (the kernel, the gate's blind spots, the rig tool) read the new code without my reasoning, and a skeptic tried to refute each finding. 12 survived, 2 were refuted.

Three were real defects in `reservoirPilotGpu.mjs`, all now fixed with a row:
* A non-finite readout weight saturated a control on the device where the CPU's `fin()` zeroes it. Now a per-output keep mask.
* A finite feature beyond float32's range turned every device control to -1. `step` now refuses it.
* `resetSome` was not atomic.

Five were gaps in the gate, now rows:
* a wrong readout dispatch count survived, because no asserted batch was above 16;
* a retyped law survived;
* multi-index resets were untested;
* most pitch and yaw values were saturated;
* a proxy left an error scope open.

Adding the `destroy()` row exposed one more defect, in my own test code: the proxies bound Dawn's `GPUBufferUsage` class, so every buffer usage was 0.

The rig tool's CPU side was not warmed up, and its header still said it writes nothing. Both are fixed.

The gate now runs 24 rows (about 4 s here). 15 sabotages of the fixed module all go red (logged in the gate's header).

## 2026-11-18: A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE (Keith: "do the one-tick-late GPU pilot type next"; REGISTERED BEFORE ANY CODE FOR IT AND BEFORE ANY OF ITS DIVES IS FLOWN)

**The constraint.** The tank's tick is synchronous: `step()` flies every sub tick after tick, and a pilot must return its controls at once. A device read-back is not synchronous. So a pilot on the device can only hand back controls computed from an EARLIER tick's state. In a gate that awaits every read, that is exactly one tick. In the page, the reads land between frames: at 4x speed and 60 frames a second, about 2 ticks a frame, so 2 to 3 ticks late. **What lateness costs is the decision, and it can be measured exactly on the CPU**, by delaying the CPU pilot's own controls.

### PART A, THE COST OF LATENESS (a registered measurement)

**The pilot.** The fly heading-loop pilot (the 1,729 weights of `brain/pilotSubFlyCxWip.json`), as the tank flies it. `delayed(k)`: the CPU pilot run every tick on that tick's features, so its memory integrates as on time, but the controls it RETURNS at tick n are the ones it computed at tick n - k. For n < k it returns the PD autopilot's controls for that tick, which is what the device type flies before its first read lands.

**The dives.** `auditSets(90000).safety` (`tools/auditSubChampion.mjs`): 500 dives (100 nominal, 300 recovery, 100 current), 60 s each, base 90000. No note or code names that base, and nothing is chosen on these dives.

**The arms.** k = 0 (on time, the reference), **k = 1 (designated: the gate's lateness)**, k = 2 and **k = 4 (designated too: the page's lateness, with a margin)**.

**The registered readings, each against k = 0, paired by dive, on the mean score (the sub task's score: higher is better).**
* **ONE TICK COSTS NOTHING THAT MATTERS** iff the mean paired difference (k = 1 minus k = 0) has a 95 percent interval (2 se) inside -0.01 to +0.01. The tree's own margin for a sub pilot is `subTask.versus`'s 0.01.
* **IT COSTS** iff the whole interval is below -0.01.
* **UNDECIDED** otherwise.

The same rule gives a second reading for k = 4: **FOUR TICKS COST NOTHING THAT MATTERS / COST / UNDECIDED**. Reported beside them: k = 2; the dives that ended early in each arm; each kind's mean.

**Checks (a failure: NOT WEIGHED).** (1) ON TIME IS THE PILOT: `delayed(0)` flies bit for bit as the tank's own type. (2) THE DELAY IS EXACT: on a recorded run, the controls of `delayed(k)` at tick n equal `delayed(0)`'s at tick n - k. (3) SAME DIVES for every arm.

**Expectations, written before any dive is flown.** E1 ONE TICK COSTS NOTHING THAT MATTERS: about 80 percent (a tick is 1/30 s; the hull's time constants are seconds). E2 FOUR TICKS COST NOTHING THAT MATTERS: about 50 percent. E3 the cost grows with k: about 75 percent.

### PART A RESULT (2026-11-18, read once: `node tools/ship/latenessStudy.mjs --write`, 500 dives, file brain/rig-results/lateness-90000.json)

**ONE TICK COSTS NOTHING THAT MATTERS. FOUR TICKS COST NOTHING THAT MATTERS.** All three checks passed (on time is the pilot bit for bit on 10 dives; the delay exact for k = 1, 2, 4 on a recorded run; the same 500 dives in every arm). No dive ended early in any arm.

    k   mean score  nominal  recovery  current   k minus on time (2 se interval)
    0   -0.4228     -0.347   -0.453    -0.409    -
    1   -0.4226     -0.347   -0.453    -0.408    +0.0002 (0.0002 to 0.0002)
    2   -0.4224     -0.347   -0.452    -0.408    +0.0004 (0.0003 to 0.0004)
    4   -0.4221     -0.346   -0.452    -0.408    +0.0007 (0.0006 to 0.0008)

Expectations: E1 (one tick costs nothing, about 80 percent) RIGHT. E2 (four ticks cost nothing, about 50 percent) RIGHT; I gave it too little. E3 (the cost grows with k, about 75 percent) WRONG as written: there is no cost at all. The difference GROWS with k but it is a GAIN, and it is tiny: 0.0007 at four ticks is a fourteenth of the margin. Said plainly: a few ticks of lateness is a slight damping of a pilot whose output is mostly the PD laws, and it does not hurt; that gain is an observation on a set flown once, not a reading, and nothing is chosen on it. The intervals are narrow because the arms are paired dive by dive and differ only in a few ticks of controls.

**What it decides.** The device type's lateness is not a reason to keep it off: in the page it is 2 to 3 ticks late, inside the four ticks measured. Whether it is worth turning on is the rig's timing alone.

### PART B, THE TYPE (built after PART A is read, whatever it says)

`render/subAquariumFlyCxGpu.mjs`: a tank pilot type for the fly circuit that runs it on a WebGPU device through `brain/reservoirPilotGpu.mjs`. Every tick it submits the step and returns the newest controls that have come back, flying the PD autopilot until the first lands. It resets the device's memory when the sub's dive changes, as the CPU type does.

**Its gate.** In a harness that awaits every read, the type's controls equal `delayed(1)`'s to 1e-4 over a flight. A device that cannot be had leaves the CPU type in place, and the page says so. How late each sub is is exposed, so the page can show it.

The page gets a switch to fly the fly-circuit subs on the GPU, OFF by default, and the CPU type stays the default. **Whether it is worth turning on is PART A's answer, and the rig's timing.**

**SMOKE DISCLOSURE TO PART A (2026-11-18, while building, BEFORE THE REGISTERED READ).** Smoke-testing the study, I flew the FIRST 6 of the 500 registered dives (`auditSets(90000).safety`, seeds 90000 to 90005, nominal) in all four arms, and so SAW their means: -0.4033, -0.4030, -0.4028 and -0.4024 for k = 0, 1, 2 and 4. It should have been flown on a sanity set. Nothing was chosen on them: the arms, the bars and the readings were fixed above before, and are unchanged. The registered read flies all 500 once, those 6 included.

### PART B RESULT (2026-11-18)

**Built.** `render/subAquariumFlyCxGpu.mjs` (the type: one GpuPilotBatch of 1 per sub; each tick the features on the CPU, the step submitted, a read started if none is in flight, the newest controls returned, the PD autopilot until the first read of a dive lands; a read from an old dive is discarded; `pilot.lateness` in ticks). Gate `render/subAquariumFlyCxGpu-selfcheck.mjs`: **awaiting every read, the type is delayed(1) of the CPU type to 1e-4 at every tick of an 1,800-tick flight (worst 1.9e-7 on the software adapter)**, across a new dive (worst 2.6e-7), and with a dark compass; 9 sabotages, one of which first went 0 red. The page: a "fly circuit on the GPU" checkbox in sub-aquarium.html, off by default, disabled without WebGPU; on, it re-registers the flycx kind (which re-seats the subs) and the line says how many subs are on the GPU and how late; off, or any failure or a lost device, the CPU type again and the line says so. Gate `tools/ship/subAquariumGpuSwitch-selfcheck.mjs`, 5 sabotages.

**SAID PLAINLY: in headless Chromium on its software adapter the subs run 47 to 71 ticks late, not the 2 to 3 the registration guessed.** That is far beyond the 4 ticks PART A measured, so what it costs there is NOT KNOWN, and the page says so in those words whenever a sub is later than 4 ticks. A software adapter says nothing about a graphics card: how late a real GPU runs, and whether the switch is worth turning on, is the rig's to see (open the page, offer the subs, tick the box, read the line). If the rig is also well past 4 ticks, the next step is a registered PART A arm at that lateness, not turning it on.

