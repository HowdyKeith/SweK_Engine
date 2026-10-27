# NEEDS AND LIMITS for the submarine -- pieces 1 and 2 of Keith's parked idea (energy that only the surface refills; a hull that feels pressure)

UNNUMBERED (the version is chosen at ship time). Written BEFORE the code, as the standing rules ask. Source of the idea: `brain/SUBMARINE_WIP.md` "Parked idea" and `brain/HANDOFF_NEXT_CHAT.md` Brief 2.
Pieces 3 (the task and its audits) and 4 (a stateful pilot) of that note are the research ladder and are NOT built here. No weapons, seekers or guidance anywhere in this.

## What is built and where

* `physics/mechanics/subNeeds.mjs` -- a LAYER around `subModel6dof.stepSub`, never a change to it. A vessel without a `needs` state is stepped exactly as before (the core is untouched, so every pilot gate keeps its numbers). `stepNeeds(model, state, needs, controls, dt, current, extraWeight)` returns what `stepSub` returns plus the advanced `needs` and its readings.
* `brain/needsPilot.mjs` -- a rule wrapper, not a learned pilot: head for the refill depth when the charge is low (a battery hull surfaces through brain/surfacePilot.mjs's wrapper, a snorkel hull flies to 3 m), return to the task when it is high.
* The aquarium (`render/subAquariumSim.mjs`): `setNeeds(id, class | null)`, `injure(id, amount)`, and a `needs` record in the snapshot; the page offers a class picker, an "injure" button and a readout.

## The model (numbers are for a TANK-SCALE demo, said plainly: a real boat's battery is two orders of magnitude bigger)

**Energy.** `E` in joules, capacity by class. Electrical power = hotel load + hydrodynamic power over an efficiency: `P = 200 W + |T x u| / 0.5`, `T` the thrust actually applied (thrustMax x command x submerged fraction), `u` the forward speed. Power rises with the CUBE of speed in steady flight (drag ~ u^2, power ~ T u). `E` never goes below 0 or above capacity; at 0 the screw is dead (the thrust command is forced to 0), the planes and the ballast tank still work (the pump and the planes are not charged for: said, not modelled).
Refill (charge power `chargeW` = 6 kW): only while the centre is within `refillDepth` of the surface -- battery 0.7 m (the surfacing pilot floats the Explorer's centre at 0.56 m), snorkel 4 m (EXPOSED there: the reading says so, since a snorkelling boat is the noisy one). Air-independent hulls have 4 x the capacity and NEVER refill; `unlimited` neither drains nor needs to.

**Pressure and damage.** Pressure = rho g depth (reading). `collapseDepth = crushDepth x (1 - 0.5 x damage)`; STRAIN = depth / collapseDepth. Below `yieldFrac` (0.8) a hull takes no damage from depth; above it damage creeps up at `0.002 x (strain - 0.8)/0.2` per second (a hull held near its limit wears out: it takes ~8 minutes at strain 1.0). `injure(amount)` adds damage at once (a grounding, a collision: the CALLER says how much; nothing here decides what hurts), clamped to [0, 1]; a NaN or a negative amount does nothing. Leak = `0.01 x damage x strain^2` of the weight per second, accumulating as flooding up to 15% (`weightError` of the core, which the flood task already uses: flooded water is weight). Collapse (`status: "crushed"`) when depth exceeds the collapse depth -- so a damaged hull is crushed at a depth an undamaged one survives; the core's own 100 m crush still applies on top.
WHAT IT IS NOT: no pumps to clear the flood, no repair (the aquarium's restore resets), no hull-form physics (the collapse depth is one number scaled by one scalar), no thermal or acoustic cost of the snorkel beyond the `exposed` flag.

## PASS / FAIL (each is a row of `physics/mechanics/subNeeds-selfcheck.mjs`; every one is SABOTAGED and must go red by name)

1. **Untouched.** A vessel stepped with `needs = null` is bit-identical to `stepSub` over 600 ticks, and the `unlimited` class changes nothing about the physics either (energy constant, no clipping of thrust).
2. **Power.** `P` at 2 m/s trim equals hotel + drag x speed / 0.5 to 1e-6 relative; the hydrodynamic part at 2 x the speed is 8 x (within 1%); `E` is monotone non-increasing while not refilling; never negative, never over capacity.
3. **Empty.** At `E = 0` the applied thrust is 0 whatever the command; the boat coasts as quadratic drag says (2 m/s falls to 0.62 m/s in 60 s: 1/v = 1/v0 + k t); ballast and planes still act.
4. **Refill.** Battery: charges at `chargeW` x dt at 0.5 m, not at 1.5 m. Snorkel: charges at 3.5 m, `exposed` true, not at 5 m. Air-independent: never. Capped at capacity.
5. **Strain and damage.** Strain = depth/collapse. No damage below 0.8; damage grows above it; the collapse depth falls monotonically with damage; a boat with damage 0.6 is crushed at a depth (75 m) an undamaged one (same depth) survives.
6. **Leak.** None at damage 0; rises with depth and with damage; the flooding is capped at 15%; a leaking boat sinks relative to a sound one (depth gain after 60 s at the same commands).
7. **injure** adds, clamps to 1, ignores NaN and negatives.
8. **needsPilot.** Below `low` it heads for the refill depth and the energy rises; above `high` it returns to its task; the hysteresis means it does not flip between them on a single tick; with energy `Infinity` it is the inner pilot unchanged.
9. **The aquarium.** A sub with no needs swims bit-identically to a tank where nothing was called; `setNeeds` and `injure` do what they say; a bad class or amount throws and changes nothing; the snapshot's `needs` is null without it; a sub that runs dry in a long swim stops thrusting and drifts (its speed falls).
10. **The page** (source rows and a live row): the picker, the injure button, the readout.

## What this does NOT claim

That a pilot behaves better or worse with needs (that is piece 3, a task with audits and controls, registered before it is run); that the numbers are a real boat's; that a pump or a repair exists. The fish/fly question is untouched.

---

# Round 2 (UNNUMBERED, written BEFORE the code): the four things the model left out, and piece 3 -- the task, its audits and its controls

Source: `tools/ship/nextRounds.mjs` entries `needs-not-modelled` and `needs-pieces-3-and-4-task-and-stateful-pilot`. Piece 4 (a stateful pilot) is NOT built here and no learned or circuit pilot is run: this round builds the job and proves the job can tell pilots apart, with rule pilots only.

## A. The four additions (all in `physics/mechanics/subNeeds.mjs`, all OPT-IN: a caller that passes nothing new gets the numbers of v4904, bit for bit)

`stepNeeds(..., extraWeight, aux)` gains an `aux = { pump, repair }` (each 0..1; missing = 0). The needs state gains `exposedS` (seconds spent exposed). Constants are tank-scale, said plainly, and each is a frozen exported record.

1. **FLOOD PUMP.** `aux.pump` removes flooding at `PUMP.rate` (0.01 of the weight per second at full) scaled by `1 - depth / PUMP.headDepth` (90 m: the pump works against the head, so it is useless at the bottom, which is the point), at `PUMP.watts` (1500 W) x the command, and only while energy is over 0. It cannot remove more flood than there is.
2. **REPAIR.** `aux.repair` removes damage at `REPAIR.rate` (0.004 per second at full) for `REPAIR.watts` (800 W) x the command, ONLY at the surface (centre within `REPAIR.maxDepth`, 1.0 m, and speed under `REPAIR.maxSpeed`, 0.5 m/s) and only while energy is over 0. Flood is not repaired by this (that is the pump).
3. **SNORKEL EXPOSURE.** `needs.exposedS` accumulates `dt` while `exposed` (a snorkel hull inside its mast depth). It is a READING and a SCORE TERM for a task; nothing in the physics changes with it. A task decides what exposure costs (piece 3 charges it).
4. **BALLAST PUMP DRAW.** On a model with a ballast tank that has dynamics, the electrical power adds `BALLAST_PUMP.wPerUnit` (600 W) x |change of tank level| / dt. And a boat with NO charge (a limited class at 0) cannot work the normal pump: the tank is frozen at its level (the emergency blow is stored air and still works). On a model without a tank with dynamics nothing changes (the instant ballast of the header is a command, not a pump).

PASS/FAIL, each a row of `subNeeds-selfcheck.mjs` and each SABOTAGED:
* A1 aux absent or all zero is bit-identical to the same call before this round (600 ticks, state and needs).
* A2 pump: flood falls by exactly rate x (1 - depth/head) x dt x command; no pump at 90 m; never below 0; costs `PUMP.watts` x command; does nothing at energy 0; a flooded boat with the pump on ends lighter (depth after 60 s) than the same boat without.
* A3 repair: damage falls at rate x dt at the surface, not at 2 m, not at 1 m/s; costs its watts; never below 0; does nothing at energy 0; the collapse depth rises with it.
* A4 exposure: grows by dt while exposed, only then; a battery boat's never grows; `readings` reports it.
* A5 ballast draw: the watts rise with the level change on a tank model and not on the header model; a dead boat's tank does not move and its blow does.
* A6 `unlimited` and `needs` null unchanged.

## B. Piece 3: the SURVEY RUN (brain/needsTask.mjs), registered here before any pilot is scored on it

**The job.** A tank-scale battery boat with a pre-damaged hull must visit three survey stations within 600 s, IN ANY ORDER (the order is the pilot's choice: it is part of weighing the needs). A station is visited when the centre is within 8 m of it horizontally and 4 m vertically. The boat starts underwater at the origin with a charge and damage the scenario states. The run ends at 600 s, or when crushed.
**Why this puts the two needs in conflict.** Stations are far (so the charge matters), some are deep enough that strain passes the 0.8 yield line of THIS hull (so depth costs hull life, and a damaged hull's collapse depth is lower, down to a station that cannot be reached at all), and the only refill is the surface, which is a trip away from the stations. A pilot that ignores the charge strands; a pilot that ignores the hull creeps its damage up (and a leak adds weight) or is crushed; a pilot that weighs them must choose a station order and skip a station it cannot afford.
**Scenario kinds** (seeded, deterministic, like `subTask`): `plain` (sound hull, shallow stations, full charge: the control that nothing is needed), `deep` (damage 0.2..0.5, stations down to 0.85 of the UNDAMAGED collapse depth: the hull kind), `far` (stations 150..260 m out, start charge 0.35..0.65: the energy kind), `both` (deep stations AND far AND low charge).
**The score** of a run, fixed now: `score = 0.45 x visited/reachable + 0.45 x returned + 0.1 x hull` (hull = 1 - (damage_end - damage_start)/0.5, clamped 0..1), in [0, 1], where `returned` = alive and at the surface (centre under 3 m) at the end; **a crushed boat scores 0** (the boat and its data are lost). A boat alive but flat (charge 0) at depth is not returned. Exposure is reported, and charged only to snorkel hulls (not used here: the task boat is a battery hull). *Revised in the open after the first baseline run:* the first draft weighted 0.7 / 0.2 / 0.1, and a boat that pressed on and STRANDED (alive, no charge, at depth) still scored 0.605 against the refill trip's 0.578 -- a reckless pilot could not be told from a careful one because stranding cost only a fifth of the score. A boat that does not come home is a lost boat, so `returned` now weighs as much as the work (0.45 / 0.45 / 0.1); the baselines were re-scored under it and the old and new numbers are in the gate headers.
**Baseline pilots (rule pilots, the things a stateful pilot must beat):**
* `SPIN` (control): goes to the surface and stays there, working the pump while there is flood and the repair while there is damage -- the SAFE HARBOUR, which never does the job. (First draft held the surface and did nothing; a damaged hull leaks from the first second and the pump-less control sank and was crushed in 2 of 40 runs, so the control was changed to one that cannot die of the leak.) Expected score about 0.55 on every kind (returned 0.45 + the unchanged hull 0.1).
* `DIRECT`: the PD autopilot to the stations in the order they are listed, at the task speed, depth as stated, ignoring the charge and the hull (no pump, no repair).
* `TRIP`: `DIRECT` inside `needsPilot.wrap` with the job's thresholds (surface under 30% of the charge, back to the task over 60% -- the first draft used needsPilot's 90%, which spends the 600 s refilling: 6 kW fills 3 MJ in 500 s -- so the baseline is a trip that fits a timed job). Hull-blind.
* `HULLONLY`: the hull rule alone, no trip -- the control that shows the hull is a need without the charge. The hull rule: a depth cap of 0.75 of the CURRENT collapse depth plus the 3.5 m capture allowance (it reads `readings().collapseDepth`), a station that rule forbids is skipped, the nearest feasible station first, the flood pump while there is flood, repair whenever it is at the surface with charge, and up for the last 60 s.
* `GUARDED`: `HULLONLY` inside the same trip. The best rule pilot written for the job, and the one a stateful pilot has to beat to say it weighs the needs better than a rule does.
**Task validity, checked on the BASELINE set (8 seeds x 4 kinds, seeds 501-508; six was too few -- the standard errors on `both` were as big as the differences) BEFORE any other pilot exists; each is a row of `brain/needsTask-selfcheck.mjs` (kinds plain and deep, and the mechanics) or `brain/needsTaskValidity-selfcheck.mjs` (kinds far and both).** Revised in the open after the first run of the baselines: the first draft's V5 asked `SPIN < DIRECT < TRIP < GUARDED` on `both`, and DIRECT and TRIP both score 0 there because a hull-blind boat is crushed (a damaged hull leaks from the start and a pilot that never pumps sinks), so the two cannot be told apart on that kind; HULLONLY was added so each need is separable on its own kind. The thresholds were written before the run; the structure was changed, not the thresholds.
* V1 a kind and a seed always make the same scenario, a run is deterministic (same bytes), the first station is always within reach, an unknown kind throws;
* V2 `plain`: DIRECT, TRIP, HULLONLY and GUARDED all visit 3 of 3 in every run and score over 0.95 (the job is doable when nothing is in conflict); SPIN scores 0.55 +- 0.05 and visits none;
* V3 `deep`: DIRECT ends crushed in at least 3 of every 10 runs; HULLONLY beats DIRECT by more than max(0.03, 2 se); GUARDED is crushed in none (the hull is a need);
* V4 `far`: DIRECT is stranded or crushed in at least 3 of 10; TRIP beats DIRECT by more than max(0.03, 2 se) (the charge is a need and the trip is a partial answer);
* V5 `both`: GUARDED beats HULLONLY, TRIP and DIRECT each by more than max(0.03, 2 se) and is crushed in none (weighing the two needs beats either alone);
* V6 headroom: no baseline's mean over `both` reaches 0.95 and GUARDED's does not reach 0.9 (there is something left for a better pilot to win);
* V7 a station deeper than the damaged hull's collapse depth can take is marked `unreachable`, and the score's `visited / reachable` ignores it (a pilot is not charged for the impossible); the score of a crushed boat is 0.
If any V fails the TASK is wrong and is changed (in the open, with the old number beside the new), never the threshold; the numbers read off are recorded in the gates' headers with their date.
**What the audit set is.** `TRAIN_SET`, `HELD_OUT_SET`, `AUDIT_SET`, `BASELINE_SET` with disjoint seeds, as in `subTask`. THE AUDIT SET IS NOT READ IN THIS ROUND (nothing here trains); the baselines are scored on `BASELINE_SET`, and the audit set is left unread for piece 4.
**What the verdict rule for piece 4 will be (registered now, used later):** a stateful pilot F beats the rule pilot `GUARDED` on `AUDIT_SET` iff `mean(F) - mean(GUARDED) > max(0.02, 2 sd)` and F is crushed in no more runs than `GUARDED`; the controls are the same circuit with no state, a size-matched random wiring and the same wiring with the energy and hull readings withheld (so that a gain cannot come from anything but weighing the needs).
**NOT CLAIMED:** that any of this is a real boat; that a circuit weighs the needs; that the rule `GUARDED` is the best possible (it is the best written).
