# Tech Debt Audit — round 294 (optimize pass)

Static-analysis findings from a profile pass after 94 rounds of feature work
(v199 → v293). Things in **[FIXED]** were addressed this round; **[OPEN]**
items are documented but deferred so future rounds can pick them up without
re-discovering.

---

## Hot path allocations

### [FIXED] SkeletalAnimator IK helpers — 0 allocations per apply (was ~10-15)
The v292/v293 `_applyLookAt`, `_applyTwoBoneIK`, `_applyFabrik` functions
allocated 10-15 `Float32Array(4)` and `Float32Array(16)` per call. Three
constraints × multiple kaiju × 60fps = hundreds-to-thousands of small allocs/sec
churning the GC.

Fix: module-scope scratch pool. The IK math uses a strict read-once-write-once
pattern inside a single apply, so reusing the same buffers across calls is safe.
The bone-world pool has 5 slots (covers the longest call chain — two-bone IK
reads root/mid/end then re-reads mid/end after the root rotation). Round-robin
cursor cycles between them so back-to-back calls don't trample each other.

Verified via Proxy-on-Float32Array: 0 allocations per FABRIK 5-bone apply,
0 allocations per two-bone IK apply.

### [FIXED] KaijuManager `Array.from(this.kaiju.values())` ×4-5 per tick
Each call rebuilt a fresh array from the Map. With king death dispersal
firing per dying king, and rival targeting per kaiju attack, this was hot.

Fix: cache the array once per `tick()`, invalidate on size change. All five
call sites (pack dispersal, `tickDemoralized`, `_findRangedTarget` rival
branch, etc.) now route through `_getKaijuArray()`.

### [OPEN] Particles spawn — 22 sites in KaijuManager allocate particle objects
Each `this.particles.spawn(...)` call passes a fresh object literal with
~10 fields. With kaiju attacks at scale + impact bursts, this is a real
allocation rate. Worth investigating whether the particles system pools.

### [OPEN] Other rendering paths
`ui/objPreview.js`, `ui/PalChatAvatar.js`, `ui/HeartbeatAvatar.js`, and
`ui/assetGallery.js` each construct a `new Float32Array(16)` for the model
matrix every render. They run at varying frequencies (~15Hz for previews,
60fps for in-world avatars). Pool these next.

---

## Dead code

### [FIXED] Legacy matrix-lerp crossfade block in SkeletalAnimator
The round-52 `_blendFrom` + `_blendDur` + matrix-lerp blend block was
kept "for backward compat" when v292 introduced TRS-level blending.
Verified by grep that no caller sets `_blendFrom` — the old API was fully
replaced. Removed the constructor field + the dead `if` block in `update()`.

### [FIXED] `_worldQuatToLocal` helper — defined, never called
Helper from the initial v292 draft. The actual IK code inlines the
inverse-multiply pattern. Allocated a fresh Float32Array(4) internally
if ever called. Deleted.

### [OPEN] `KaijuManager._civRetaliationAnchor()` empty stub
Line 1528 — placeholder from when retaliation was being designed. Returns
nothing, never called. Safe to delete but no functional impact.

### [OPEN] Commented-out experimental code in `world/world.js` near line 296
Comment-block notes "every frame allocates ~225 entries × ~60fps = 13.5k
unnecessary" with explanation of a cache. The cache is there now. The
comment is correct but reads as defensive scaffolding. Could be tightened.

---

## Memory leak candidates (need observation, not static fix)

### [OPEN] `_poseConstraints` array grows on `setLookAt`/`setTwoBoneIK`/`setFabrikIK`
If callers forget to call `removeConstraint(c)` when the source entity dies,
constraints leak. Currently no auto-cleanup tied to entity disposal. Add a
`clearConstraints()` call to entity despawn paths if/when IK is wired into
gameplay (currently it's API-only; no production callers yet).

### [OPEN] `KingPack._packs` and `_demoralized` Maps
`_packs.delete(kingId)` happens on `onKingDeath`. `_demoralized` entries
expire via `tickDemoralized`. Both look correct on read — but if a king
respawns after death-rattle (some scenarios may), the cleanup ordering
matters. Add stress test for the corner case.

### [OPEN] KPopDashboard runspace dispatched in MTA mode
The v290 fix spawns a new STA runspace when host is MTA. The runspace is
returned to the caller but if the caller drops the reference, nothing
disposes the runspace when the dashboard window closes. Need a `Dispose()`
in the form's `FormClosed` handler that also tears down the parent runspace.

---

## Console noise

### [OPEN] KaijuManager logs heavily on event paths
10+ `console.log` lines on king ascension, queen drops, hellspawn portals,
metal trees, imp births, terminations. These fire per-event (not per-frame)
so the cost is bounded — but a late-game scene with several queens spawning
imps + tier-10 terminations could log 50+ lines per second. Worth gating
behind a `DEBUG_KAIJU` flag.

### [OPEN] main.js has 137 console.log calls
Most are boot-time diagnostics (one-shot, fine). A handful run per state
change. Audit for any in the render loop — none found in this pass.

---

## File sizes (refactor candidates — not blocking, but limit cognitive load)

| File | Lines | Status |
|---|---|---|
| `simulation/OgreScenario.js` | 10,985 | Monolith. Some sections could split: arena layout, projectile launch, narrative events. |
| `main.js` | 6,659 | Wiring file. Likely fine, but could extract sub-systems into `bootstrap/*.js`. |
| `ai-bridge/server.js` | 5,420 | Lots of endpoints. Could split by route group (`/kpop/*`, `/asset-pipeline/*`, multiplayer). |
| `simulation/KaijuManager.js` | 2,372 | Reasonable. Could extract `_findRangedTarget` family into separate file if more rival logic is added. |

None of these are blocking. The size reflects accumulated feature scope, not
disorganization. Splitting would help reviewability, not perf.

---

## Worker pool utilization

### [OPEN] BiomeDecorPool spawns N workers
Each terrain tile is dispatched to one worker. Load balancing is FCFS; if one
tile is much larger than another, workers idle while one churns. Could be
batched smaller (e.g., 32×32 sub-tiles) for better steal-work balance.

### [OPEN] chunkMesher.worker.js is single-instance (per memory)
Async chunk meshing happens on one worker. For high-load scenes (round 29
biome changes regenerating multiple chunks) it bottlenecks. Could spawn a
pool of 2-4 worker instances. Trade-off: each worker carries its own ~500KB
voxel format module copy.

---

## Suggested follow-up rounds

1. **v295 — Pool model matrices in UI render paths** (5 files, mechanical pattern, low risk)
2. **v296 — Wire IK into kaiju** (the actual gameplay payoff for v292/v293/v294 work)
3. **v297 — Memory-leak stress test** (run kaiju spawn/kill at 10Hz for 10 minutes, snapshot heap)

Outside of these, MediaPipe face and save/restore state remain the big-scope
items in the backlog.
