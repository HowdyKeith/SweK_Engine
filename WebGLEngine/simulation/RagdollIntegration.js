// FILE: simulation/RagdollIntegration.js
// VERSION: v1 — round 301
//
// Detects kaiju entering "dying" state and spawns a Ragdoll for them.
// Pattern: poll kaijuManager.kaiju each tick, track per-id state, fire
// when transition alive → dying is observed. Same shape as KaijuIK.
//
// Ragdoll then:
//   - Hooks into the kaiju's SkeletalAnimator via the v292 onPose API
//   - Each frame applies PBD physics that overrides the clip pose
//   - Auto-disposes after 4 seconds (MAX_LIFETIME_SEC in Ragdoll.js)
//
// If the kaiju has no rigged animator (cube-rendered entity), we skip
// — there's nothing to ragdoll. Death rattle + particles + despawn
// continue working as before.
//
// Cleanup: when a kaiju leaves kaijuManager.kaiju Map (post-despawn),
// drop its tracking entry so the map doesn't grow unbounded.

export class RagdollIntegration {
    constructor({
        kaijuManager,
        ragdollManager,
        meshRenderer,
        world = null,
        // Round 306 — limb severance on big hits. Defaults to ON since it's
        // a visual highlight; flip via .setGoreEnabled(false) for quiet runs.
        goreEnabled = true,
        severDamageThreshold = 0.4,
    }) {
        if (!kaijuManager) throw new Error("[RagdollIntegration] kaijuManager required");
        if (!ragdollManager) throw new Error("[RagdollIntegration] ragdollManager required");
        if (!meshRenderer) throw new Error("[RagdollIntegration] meshRenderer required");
        this.kaijuManager = kaijuManager;
        this.ragdollManager = ragdollManager;
        this.meshRenderer = meshRenderer;
        this.world = world;
        this.goreEnabled = goreEnabled;
        this.severDamageThreshold = severDamageThreshold;
        this._enabled = true;

        // Map<kaijuId, lastState> — tracks what state each kaiju was
        // last frame so we can detect the alive → dying transition.
        this._lastState = new Map();

        this.stats = { spawned: 0, skippedNoRig: 0, droppedAfterDespawn: 0, limbsSevered: 0 };
    }

    setEnabled(on) { this._enabled = !!on; }
    isEnabled() { return this._enabled; }
    setGoreEnabled(on) { this.goreEnabled = !!on; }
    isGoreEnabled() { return this.goreEnabled; }

    tick(dt) {
        if (!this._enabled) {
            this.ragdollManager.tick(dt);
            return;
        }
        // Step physics first so existing ragdolls advance
        this.ragdollManager.tick(dt);

        // Detect new dying kaiju
        for (const [id, k] of this.kaijuManager.kaiju) {
            const wasState = this._lastState.get(id);
            const isDyingNow = k.state === "dying";
            if (isDyingNow && wasState !== "dying") {
                this._trySpawnRagdoll(k);
            }
            this._lastState.set(id, k.state);
        }

        // Garbage-collect entries for kaiju no longer in the Map
        for (const id of this._lastState.keys()) {
            if (!this.kaijuManager.kaiju.has(id)) {
                this._lastState.delete(id);
                this.stats.droppedAfterDespawn++;
            }
        }
    }

    _trySpawnRagdoll(k) {
        // Need an animator. If the kaiju is rendered as a cube (no
        // rigged mesh), skip — ragdolls only apply to skeletal anims.
        const animator = this.meshRenderer.ensureAnimator?.(k.id, k.assetId);
        if (!animator || !animator.nodes || animator.nodes.length === 0) {
            this.stats.skippedNoRig++;
            return;
        }
        // Ground Y: prefer the world's surface at the kaiju's footprint.
        // Round 303 — Ragdoll now does per-bone voxel surface queries if
        // we pass `world` through, so individual bones drape over actual
        // terrain instead of all landing at the same flat groundY. The
        // single groundY here is still used as a floor for kaiju that
        // somehow fall below the world.
        let groundY = k.position.y - 1;
        if (this.world && typeof this.world._heightAt === "function") {
            try {
                // _heightAt returns the procedural surface (no buildings),
                // which is a safer floor than nothing. Per-bone voxel
                // scan in Ragdoll handles structures.
                const h = this.world._heightAt(k.position.x, k.position.z);
                if (Number.isFinite(h)) groundY = h;
            } catch {}
        }
        // Round 305 — Option B: directional impulse from killing blow.
        // If the kaiju has _lastHitDir set by WeaponSystem / Projectile /
        // Missile, use it as the initial velocity direction. The body
        // falls AWAY from the source of damage instead of in a random
        // direction. Magnitude scales with damage, capped so absurd
        // values don't fling kaiju to space.
        //
        // Staleness: only use the hit info if it's recent (within the
        // last 1.0 sec of kaiju age). Older hits don't represent the
        // killing blow — e.g. kaiju died of old age (maxLifetime).
        //
        // Fallback path (no hit info / stale): random small kick, same
        // visual as v300/v301 so non-combat deaths still flop natively.
        const HIT_STALENESS_SEC = 1.0;
        const KICK_PER_DAMAGE   = 24;     // m/s at damage=1.0 (lateral)
        const KICK_LIFT         = 6;      // m/s up-component to read as "knocked"
        const KICK_MAX          = 30;     // hard cap on lateral magnitude

        let initialVelocity;
        const hitDir = k._lastHitDir;
        const hitMag = k._lastHitMag ?? 0;
        const hitAge = k._lastHitAge;
        const fresh = hitDir
            && hitMag > 0
            && Number.isFinite(hitAge)
            && (k.age - hitAge) <= HIT_STALENESS_SEC;
        if (fresh) {
            const lateral = Math.min(KICK_MAX, hitMag * KICK_PER_DAMAGE);
            initialVelocity = {
                x: hitDir.x * lateral,
                y: hitDir.y * lateral + KICK_LIFT,    // always some lift
                z: hitDir.z * lateral,
            };
        } else {
            // Non-combat death: small random push for variety
            initialVelocity = {
                x: (Math.random() - 0.5) * 1.5,
                y: 1.5 + Math.random() * 1.5,
                z: (Math.random() - 0.5) * 1.5,
            };
        }
        try {
            const ragdoll = this.ragdollManager.spawn(k.id, {
                animator,
                rootPos: { x: k.position.x, y: k.position.y, z: k.position.z },
                groundY,
                initialVelocity,
                world: this.world,             // round 303 — per-bone voxel surface
            });
            this.stats.spawned++;

            // Round 306 — limb severance on heavy hits. If gore is enabled
            // AND the killing blow was strong (above SEVER_DAMAGE_THRESHOLD),
            // randomly pick a limb (any subtree with ≥1 descendant, not the
            // root bone) and detach it. The limb flies off along the hit
            // direction with some extra outward speed and a tumble spin.
            //
            // Gated by `this.goreEnabled` flag (default true) so the
            // VBA/Excel sibling and quieter modes can opt out.
            if (this.goreEnabled && fresh && hitMag >= this.severDamageThreshold) {
                // Use the hit direction with a strong outward bias as the
                // separation vector. A small random perpendicular jitter
                // keeps multiple limb-loss events from looking identical.
                const jx = (Math.random() - 0.5) * 0.6;
                const jy = (Math.random() - 0.3) * 0.4;
                const jz = (Math.random() - 0.5) * 0.6;
                const severOpts = {
                    separationDir: {
                        x: hitDir.x + jx,
                        y: hitDir.y + jy + 0.5,    // bias upward
                        z: hitDir.z + jz,
                    },
                    separationSpeed: 6 + hitMag * 6,    // 6-12 m/s based on damage
                    spinSpeed: 4 + Math.random() * 6,
                };
                let result = null;
                // v840 — if hit position is known, sever the CLOSEST bone
                // to where the damage landed (specific-bone severance).
                // Otherwise fall back to random-limb pick.
                if (k._lastHitPos) {
                    const closestIdx = ragdoll.findClosestBone(k._lastHitPos, { minDescendants: 1 });
                    if (closestIdx > 0) {
                        const subtree = ragdoll.sever(closestIdx, severOpts);
                        if (subtree) result = { boneIdx: closestIdx, subtree };
                    }
                }
                if (!result) {
                    // Random fallback
                    result = ragdoll.severRandomLimb({ minDescendants: 1, ...severOpts });
                }
                if (result) {
                    this.stats.limbsSevered++;
                    // Particle burst at the severance point — a tiny "spray"
                    // at the world position of the severed root bone. If a
                    // particle system is wired, fire 16 cherry-red particles
                    // in a cone outward from the joint.
                    const wsRoot = ragdoll.worldPos[result.boneIdx];
                    this._spawnSeveranceBurst(wsRoot, hitDir);
                }
            }
        } catch (e) {
            console.warn("[RagdollIntegration] spawn failed:", e?.message ?? e);
        }
    }

    // Round 306 — particle spray at the severance point. Fires only when
    // a particle system is available on window.particles or similar; falls
    // back silently when there's no FX bus to feed.
    _spawnSeveranceBurst(worldPos, dirHint) {
        const fx = (typeof window !== "undefined") ? window.particles : null;
        if (!fx || typeof fx.spawn !== "function") return;
        const [px, py, pz] = worldPos;
        const baseDx = dirHint?.x ?? 0;
        const baseDy = dirHint?.y ?? 1;
        const baseDz = dirHint?.z ?? 0;
        for (let i = 0; i < 16; i++) {
            const jx = (Math.random() - 0.5) * 1.5;
            const jy = (Math.random() - 0.1) * 1.2;
            const jz = (Math.random() - 0.5) * 1.5;
            const speed = 3 + Math.random() * 5;
            fx.spawn({
                x: px, y: py, z: pz,
                vx: (baseDx + jx) * speed,
                vy: (baseDy + jy) * speed * 0.7,
                vz: (baseDz + jz) * speed,
                ttl: 0.9 + Math.random() * 0.6,
                size: 0.18 + Math.random() * 0.18,
                r: 0.75 + Math.random() * 0.25,
                g: 0.06 + Math.random() * 0.10,
                b: 0.10 + Math.random() * 0.08,
                a: 1.0,
                gravity: -12,
                sprite: 4,
            });
        }
    }

    snapshot() {
        return {
            ...this.stats,
            active: this.ragdollManager.activeCount(),
            tracked: this._lastState.size,
        };
    }

    clear() {
        this._lastState.clear();
        this.ragdollManager.clear();
    }
}

export function makeRagdollIntegration(deps) {
    return new RagdollIntegration(deps);
}
