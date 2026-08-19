// =============================================================================
// FILE: /world/treeThrowFx.js
// ROUND: 407
// =============================================================================
//
// Tree-throw cinematic FX. Three beats, all driven by the v401 GPU
// particle system:
//
//   1. TAKEOFF  — a burst of dust/debris kicked up where the kaiju
//                  uproots and hurls the tree. Cone aimed roughly at
//                  the throw direction, biased upward.
//   2. TRAIL    — a thin stream of embers shed along the flight arc.
//                  Emitted per-tick from the projectile's current
//                  position (ProjectileManager already calls _emitTrail
//                  every frame for trailed projectiles).
//   3. IMPACT   — a big radial burst at the landing point. Bigger and
//                  faster than takeoff; this is the payoff beat.
//
// Wiring: ProjectileManager calls these at its launch / tick / impact
// lifecycle points, guarded so only ember-trailed projectiles (trees)
// get the cinematic. Missiles and other projectiles keep their plain
// CPU trail. All functions no-op when the GPU particle system is
// unavailable, so WebGL1 falls back cleanly to the existing CPU debris.
//
// Functions read window.gpuParticles directly rather than taking it as
// a constructor arg — keeps ProjectileManager from needing a new
// dependency, and the GPU system is a process-global singleton anyway.

function _gpu() {
    return (typeof window !== "undefined" && window.gpuParticles?.isSupported?.())
        ? window.gpuParticles
        : null;
}

/**
 * Takeoff burst. Called from ProjectileManager.launch() for trees.
 * `from` is the launch point; `to` is the target — used only to aim
 * the dust cone roughly along the throw.
 */
export function treeThrowTakeoff(from, to) {
    const gp = _gpu();
    if (!gp) return;
    const dx = (to?.x ?? from.x) - from.x;
    const dy = (to?.y ?? from.y) - from.y;
    const dz = (to?.z ?? from.z) - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    // A chunky dust kick, aimed up-and-along the throw direction. The
    // upward bias (dy + 0.6) makes it read as "ripped out of the
    // ground" rather than a flat spray.
    gp.spawnBurst({
        x: from.x, y: from.y + 1, z: from.z,
        count:       40,
        speed:       9,
        direction:   [dx / len, dy / len + 0.6, dz / len],
        spreadAngle: 0.9,
        life:        1.1,
        size:        0.45,
        color:       [0.55, 0.42, 0.27],   // dirt/dust brown
    });
    // A few heavier clods that arc out slower
    gp.spawnBurst({
        x: from.x, y: from.y + 0.5, z: from.z,
        count:       12,
        speed:       4,
        direction:   [0, 1, 0],
        spreadAngle: 1.2,
        life:        1.6,
        size:        0.6,
        color:       [0.40, 0.30, 0.20],   // darker clods
    });
}

/**
 * Trail emission. Called per-tick from ProjectileManager._emitTrail()
 * for trees. `pos` is the projectile's current position. Emits a small
 * number of embers with slight outward jitter so the trail has width.
 *
 * Kept deliberately light (1-2 particles/call) — _emitTrail fires every
 * frame, so even 2/frame at 60fps is 120 embers/sec per tree.
 */
export function treeThrowTrail(pos) {
    const gp = _gpu();
    if (!gp) return;
    // One ember dead-center, occasionally a second offset one.
    gp.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.4 + 0.2,
        vz: (Math.random() - 0.5) * 0.6,
        life: 0.55 + Math.random() * 0.35,
        size: 0.18,
        r: 1.0, g: 0.6, b: 0.2, shape: 1,  // warm ember (spark)
    });
    if (Math.random() < 0.5) {
        gp.spawn({
            x: pos.x + (Math.random() - 0.5) * 0.5,
            y: pos.y + (Math.random() - 0.5) * 0.5,
            z: pos.z + (Math.random() - 0.5) * 0.5,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.5,
            vz: (Math.random() - 0.5) * 0.8,
            life: 0.4 + Math.random() * 0.3,
            size: 0.12,
            r: 1.0, g: 0.45, b: 0.1, shape: 1, // hotter spark
        });
    }
}

/**
 * Impact burst. Called from ProjectileManager._applyImpact() for trees.
 * `at` is the landing point. The burst is dome-shaped (mostly upward
 * and outward) so it reads as ground impact, not an explosion in air.
 * `intensity` scales count + speed (default 1) — a tree that hit a
 * civilization (civsHit > 0) can dial this up for a bigger splash.
 */
export function treeThrowImpact(at, intensity = 1) {
    const gp = _gpu();
    if (!gp) return;
    const count = Math.round(70 * intensity);
    // Main dome — wide cone aimed straight up, big spread so it splays
    // outward near the ground.
    gp.spawnBurst({
        x: at.x, y: at.y + 0.5, z: at.z,
        count,
        speed:       12 * intensity,
        direction:   [0, 1, 0],
        spreadAngle: 1.3,            // ~75° half-angle — wide dome
        life:        1.4,
        size:        0.5,
        color:       [0.50, 0.38, 0.25],   // kicked-up dirt
    });
    // Low ground ring — particles fired nearly horizontal that hug the
    // surface and skid outward. Gives the impact a shockwave skirt.
    const ringN = Math.round(30 * intensity);
    for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * Math.PI * 2 + Math.random() * 0.15;
        const speed = 10 * intensity;
        gp.spawn({
            x: at.x, y: at.y + 0.3, z: at.z,
            vx: Math.cos(a) * speed,
            vy: 0.5 + Math.random() * 1.0,
            vz: Math.sin(a) * speed,
            life: 1.0 + Math.random() * 0.5,
            size: 0.4,
            r: 0.55, g: 0.45, b: 0.32,      // ground dust skirt
        });
    }
}

/**
 * True for projectiles that should get the tree cinematic. Trees are
 * launched with an ember trail (see KaijuManager tree-throw); missiles
 * use smoke / fire. Filtering on the trail keeps non-tree projectiles
 * on their plain CPU trail.
 */
export function isTreeProjectile(p) {
    return p?._trail === "ember";
}
