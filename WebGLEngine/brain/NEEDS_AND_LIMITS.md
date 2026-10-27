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
