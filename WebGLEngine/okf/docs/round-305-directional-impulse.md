---
type: doc
title: Round 305 — Directional impulse + ECG HUD fix + FPS unblock
tags: ["swek-engine", "round-doc"]
---

# Round 305 — Directional impulse + ECG HUD fix + FPS unblock

Three changes, all small surface area, all visible immediately.

---

## 1. Worker ECG HUD bleed fix (the "biomeDecor" screen tile bug)

**Symptom:** giant "biomeDecor" labels + ↑↓ activity indicators tiled
vertically across the entire viewport, FPS dropping to 10, terrain ghosted
behind the overlay.

**Cause:** `index.html` line 9:
```css
canvas { display: block; width: 100vw; height: 100vh; }
```
This rule applied to **every** `<canvas>` element, not just the main WebGL
canvas. When `WorkerEcgHud` created its 230×132 px canvas (round 283), the
CSS forced it to render at `100vw × 100vh`. The internal pixel resolution
stayed small but display size = window dimensions → 10 px labels stretched
to ~100 px tall. The HUD's `requestAnimationFrame` loop then re-composited
that giant alpha-blended layer every frame, which is why FPS collapsed.

**Fix:** Scope to `#glCanvas` only:
```css
#glCanvas { display: block; width: 100vw; height: 100vh; }
```
Same fix in `indexPlus.html` for `#gl`. All other canvases (ECG HUD, OBJ
preview, thumbnails) now render at their natural attribute dimensions.

This single CSS change should restore FPS and remove the visual bleed.

---

## 2. Directional impulse from killing blow (Option B)

**Problem:** v300/v301 gave every dying kaiju a small *random* kick as
its ragdoll's initial velocity. Visually identical regardless of how the
kaiju died — a back-of-the-head shot read the same as a frontal explosion.

**Solution:** Plumb hit direction + magnitude through every damage source
to `RagdollIntegration._trySpawnRagdoll`. The body now flies **away** from
the damage source, with lateral magnitude proportional to damage strength.

### Mechanism
On every damage event, the damage source stamps three fields on the kaiju:
- `_lastHitDir` — unit vector pointing from attacker toward kaiju
- `_lastHitMag` — raw damage value (0–1+ scale)
- `_lastHitAge` — kaiju.age at time of hit (for staleness check)

When `RagdollIntegration` spawns a ragdoll, it checks whether hit info is
fresh (within 1.0 sec of kaiju age). If so:
```
lateral = min(KICK_MAX, damage * KICK_PER_DAMAGE)
initialVelocity = {
  x: dir.x * lateral,
  y: dir.y * lateral + KICK_LIFT,    // always some lift
  z: dir.z * lateral,
}
```
Tunables:
- `KICK_PER_DAMAGE = 24` m/s at damage=1.0
- `KICK_LIFT = 6` m/s vertical (reads as "knocked off feet")
- `KICK_MAX = 30` m/s hard cap

If hit info is missing or stale (e.g. kaiju died of old age, no recent
damage), falls back to the v300/v301 random kick. Non-combat deaths still
flop natively.

### Wired sources
1. `WeaponSystem._fireMelee` — direction = camera→kaiju (swing forward)
2. `WeaponSystem._fireRanged` — direction = bullet forward
3. `WeaponSystem._executeShot` — direction = beam forward (big gun)
4. `WeaponSystem._explode` — radial outward from camera (overheat AoE)
5. `WeaponSystem._grenadeDetonate` — radial outward from detonation
6. `ProjectileManager.handleImpact` — radial outward from impact (kaiju projectiles)
7. `MissileSystem.detonate` — radial outward from missile blast

### What's not wired (yet)
- `SandboxGameplay` heroes that call `k.takeDamage` (some kaiju expose this
  method, others don't) — would need controller-level changes
- `KaijuRivalry` kaiju-vs-kaiju damage — currently no ragdoll on kaiju kills
  (only player kills feel impactful), can be added later
- `KaijuManager` natural-death paths (energy drain, lifetime expiry) —
  intentionally use random fallback

### Defensive normalization
`WeaponSystem._damageKaiju` normalizes incoming direction vectors so
callers can pass un-normalized `fwd` vectors safely. Tested with non-unit
inputs (length 5 produced unit vector with correct components).

---

## 3. Tests

### v303 regression — `/tmp/test_ragdoll_v303.mjs`
**21/21 pass.** Joint angle limits + voxel terrain + active extension
unchanged by v305 work.

### v305 Option B — `/tmp/test_option_b_v305.mjs`
**18/18 pass:**
- T1: Fresh hit info → directional velocity with correct magnitude
- T2: Direction maps attacker→kaiju (body falls away)
- T3: Magnitude scales linearly with damage, capped at KICK_MAX
  (0.1→2.4, 0.5→12, 1.0→24, 2.0→30 m/s)
- T4: Stale hit (>1 sec old) → random fallback
- T5: No hit info → random fallback
- T6: Pre-normalized direction preserves magnitude
- T7: `_damageKaiju` normalization produces unit length from arbitrary input

---

## Files changed
- `index.html` — scoped canvas rule to `#glCanvas`
- `indexPlus.html` — scoped canvas rule to `#gl`
- `simulation/WeaponSystem.js` — `_damageKaiju(k, dmg, hitInfo)` plus 5 call sites
- `simulation/ProjectileManager.js` — radial hit-info stamping
- `simulation/MissileSystem.js` — radial hit-info stamping
- `simulation/RagdollIntegration.js` — consume `_lastHitDir/Mag/Age`

## Expected visual delta
- **HUD bleed gone.** WorkerEcgHud is back in its corner; canvas overlays
  render at natural sizes.
- **FPS unblocked.** Should return to 55-60 unless other regressions exist.
- **Combat ragdolls have direction.** Shot from behind → falls forward.
  Grenade kill → flies radially outward. Sniper headshot → strong knockback.
  Old-age deaths still flop randomly (intentional).
