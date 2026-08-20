---
type: doc
title: "Round 303 — Ragdoll round 2: joint limits + voxel terrain + smart despawn"
tags: ["swek-engine", "round-doc"]
---

# Round 303 — Ragdoll round 2: joint limits + voxel terrain + smart despawn

Three independent upgrades to the v300 PBD ragdoll, all gated behind defaults
that match v301 behavior so existing scenes don't change.

---

## 1. Joint angular limits (`_solveAngleLimits`)

**Problem:** v300 had distance constraints only — bones kept their lengths but
joints could fold to any angle, including impossible inversions (knee bending
forward, neck pretzeled back). Bodies read as "bags of sticks."

**Solution:** After each distance pass, run an angle pass over every
parent → joint → child triple. Compute the cosine of the angle at the middle
joint; if the chain is folded tighter than the configured `maxBendAngle`,
project the child along the perpendicular direction that opens the joint.

**Geometry:** Decompose `v2 = v1*cos + perp*sin`. When the chain is folded,
`cos` exceeds `cos(π − maxBendAngle) = _angleMinCos`. Construct the
target `v2_new` at the threshold cosine using the same `perp` axis. Blend the
particle position 70% toward the target each pass — full projection in a
single iteration overshoots and fights the distance constraint.

**Degenerate case (colinear):** When `sin²` is near zero, the particles are
exactly colinear and there is no defined perpendicular plane. We pick a stable
fallback perpendicular by cross-producting `v1` with the world axis most
unaligned with it. This kicks the folded particle off the colinear axis
so subsequent iterations have a valid `perp` to work with.

**Configurable:** `maxBendAngle` (default 150°, allowing folding to 30° at the
joint — humans can fold elbows tighter, but 30° reads fine for kaiju). Smaller
values mean stiffer joints.

---

## 2. Per-bone voxel terrain (`_terrainSurfaceAt`)

**Problem:** v300 used a single `groundY` floor for every particle. Bones
landing on the side of a hill all sank to the same Y, looking like a body
pressed into a sheet of glass below the actual terrain.

**Solution:** When `world` is passed to the constructor, each ground-collision
check raycasts a column at the particle's (x,z) and finds the topmost solid
voxel. The bone rests on that exact Y, so a ragdoll landing across a slope or
a crevasse drapes correctly.

**Implementation:** Scan voxels downward from a configurable max-height,
treating `AIR_IDS = {0, 10, 11, 12}` (air, water, flowing water, lava) as
non-solid. Cap the scan at 64 steps to keep cost bounded — bones that fall
into a 64-deep pit just hit the fallback `groundY`.

**Cost:** O(scanDepth) per bone per substep. With 4 substeps, 3 iterations,
~30 bones, ~10 step average → ~3600 voxel reads per ragdoll per tick. Cheap;
voxel reads are O(1) hash lookups.

**Fallback:** If `world` is null, or the scan hits the depth cap, fall back
to the flat `groundY`. So this is purely additive — no regressions for
contexts that don't pass a world.

---

## 3. Active-extension despawn (`ageSec` + `_kineticEnergy`)

**Problem:** v300 disposed after a fixed 4s wall-clock timer. A ragdoll
still flopping mid-arc at 4s would pop off mid-motion. A ragdoll already
settled at 1s wasted 3 seconds of physics ticks.

**Solution:** Past the soft cap (`maxLifetimeSec`, default 4s), measure
kinetic energy. If KE is below `activeExtensionEnergy` (default 0.001),
dispose — body has settled. If KE is above threshold, let it keep flopping.
Hard cap at 2× soft to prevent perpetual-jiggle leaks.

**KE proxy:** `sum |curr - prev|²` across all bones under the unit-mass
assumption. Equivalent to total per-bone velocity² summed. O(N) walk.

**Why dt-accumulator instead of wall-clock:** `this.ageSec += dt` instead of
`(performance.now() - startTime) / 1000`. Reasons:
- Unit tests fire ticks faster than real time; wall-clock breaks them.
- Pause/slow-mo: when the sim is paused, wall-clock keeps advancing, but
  the ragdoll shouldn't age. dt-accumulator matches sim time exactly.
- Debugger: stepping through tick() in DevTools is realtime-paused
  externally but advances the sim normally.

---

## Defaults preserve v301 behavior

- `world = null` → no per-bone voxel scan; flat `groundY` only
- `maxBendAngle = 150°` → joints are loose; severe pretzeling rare anyway
- `maxLifetimeSec = 4`, `activeExtensionEnergy = 0.001` → same soft cap as
  v300 + a settling-detection bonus

`RagdollIntegration` passes `world` through unconditionally as of r303, so
in-game ragdolls do get the voxel terrain upgrade. Direct callers that don't
pass `world` still get the v300 flat-floor behavior.

---

## Tests

`/tmp/test_v303_fixed.mjs` — 17 cases covering:
- `_angleMinCos` precomputation matches `cos(π − maxBendAngle)`
- Pretzeled joints unfold toward threshold across iterations
- Colinear degenerate case kicks particle off axis
- Straight chain unchanged (no spurious motion)
- Distance + angle constraints converge together (lengths AND angle satisfied)
- Voxel terrain: bone over a stone column rests at column top, not below
- Smart despawn: settled body past soft cap → dispose
- Active extension: moving body past soft cap → stays alive
- Hard cap: moving body past 2× cap → forced dispose
- Manager spawn/tick/dispose/clear lifecycle

All 17 pass.

---

## What's next (round 304+ candidates)

- **Directional impulse from killing blow.** Currently random kick; plumb
  damage direction through `_trySpawnRagdoll` so bodies fall *away* from
  the hit, magnitude scaled by damage.
- **Civilian ragdolls.** Extend integration beyond `kaijuManager` to
  civilians-with-rigs.
- **Hit reactions / additive ragdoll.** Per-bone weight blend between
  clip pose and ragdoll pose, allowing a limb to flop briefly mid-anim.
  Significant scope — needs animator.onPose to accept a blend-weight map.
