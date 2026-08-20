// FILE: simulation/RagdollDismember.js
// VERSION: v1 — round 307
//
// Per-bone hit damage accumulation + dismemberment for active ragdolls.
//
// How it works
// ------------
// Listens for hits via recordHit(entityId, hitPos, dmg). For each hit,
// finds the nearest bone in that entity's active Ragdoll and adds the
// damage to a per-bone bucket. When a bucket exceeds severThreshold
// AND the bone is in the "severable" set (limb names, NOT spine/torso),
// the bone and its descendants are detached:
//
//   1. Subtree is computed (boneIdx + every descendant)
//   2. These bones are added to ragdoll._severedSet
//   3. The Ragdoll solver respects _severedSet: severed bones are
//      EXCLUDED from the parent-distance constraint AND the parent-
//      side of the angle constraint (so the limb is no longer pulled
//      toward its former parent), but the bones WITHIN the limb still
//      constrain to each other (so the limb hangs together)
//   4. An impulse is applied to the severance root in the direction of
//      the killing hit (uses v305 hit info), so the limb flies away
//   5. Particle burst at the severance position for visual feedback
//
// Why in-place severance (not a new mini-Ragdoll)
// -----------------------------------------------
// Forking the Ragdoll into a parent + N limb ragdolls would require
// duplicating the SkeletalAnimator state for each piece, plus the
// EntityMeshRenderer pose-uniform plumbing assumes one animator per
// entity. An in-place severance keeps the existing animator + pose
// upload pipeline working unchanged. The severed bones are still
// integrated by the parent Ragdoll's PBD step (gravity + ground +
// internal distances), but they no longer pull on the trunk.
//
// Visual effect: the limb stays in the existing skin (so the kaiju
// mesh's vertices weighted to those bones follow them), and the
// vertices fly off with the bones. The remaining body keeps its pose.
//
// Bone severability heuristics (case-insensitive name match):
//   SEVERABLE — arm, leg, hand, foot, tail, finger, toe, head, ear,
//               horn, wing
//   PROTECTED — spine, pelvis, hip, chest, torso, root, armature,
//               neck, bone (generic), node (generic)
// If the bone name doesn't match either pattern, default is
// SEVERABLE if depth >= 2 (limb tip) else PROTECTED (trunk).

const SEVERABLE_RE = /\b(arm(?!ature)|leg|hand|foot|tail|finger|toe|head|ear|horn|wing|claw|tentacle)\b/i;
const PROTECTED_RE = /\b(spine|pelvis|hip|chest|torso|root|armature|neck|bone\d*|node\d*)\b/i;

const DEFAULT_SEVER_THRESHOLD = 0.4;   // accumulated damage (0..1 scale)
const SEVER_IMPULSE_PER_DAMAGE = 18;   // m/s per unit damage in the hit direction
const SEVER_IMPULSE_MIN = 6;           // minimum lateral m/s even on chip damage
const SEVER_IMPULSE_MAX = 22;
const SEVER_IMPULSE_LIFT = 4;          // m/s upward — limb fly-up arc

export class RagdollDismember {
    constructor({ ragdollManager, particles = null } = {}) {
        if (!ragdollManager) throw new Error("[RagdollDismember] ragdollManager required");
        this.ragdollManager = ragdollManager;
        this.particles = particles;
        this._enabled = true;
        // Map<entityId, Map<boneIdx, accumDmg>>
        this._hitBuckets = new Map();
        // Per-instance config
        this.severThreshold = DEFAULT_SEVER_THRESHOLD;
        this.stats = {
            hitsRecorded: 0,
            severances:   0,
            skippedNoRagdoll: 0,
            skippedNotSeverable: 0,
        };
    }

    setEnabled(on) { this._enabled = !!on; }
    isEnabled() { return this._enabled; }

    setSeverThreshold(t) {
        if (Number.isFinite(t) && t > 0) this.severThreshold = t;
    }

    // Main entry point. Called when a hit lands on a kaiju that has
    // an active ragdoll. For PRE-death hits (kaiju still alive), the
    // ragdoll doesn't exist yet — this is a no-op. For post-death
    // hits via the projectile/explosion wake-up path, the ragdoll
    // is active and dismemberment can fire.
    //
    // Args:
    //   entityId — same id used by RagdollManager.spawn
    //   hitPos   — { x, y, z } world-space hit location
    //   dmg      — damage value (0..1 scale, matches kaiju.energy)
    //   hitDir   — optional { x, y, z } incoming hit direction; used
    //              as the limb fly-off direction. Defaults to upward.
    recordHit(entityId, hitPos, dmg, hitDir = null) {
        if (!this._enabled) return null;
        if (!Number.isFinite(dmg) || dmg <= 0) return null;

        const ragdoll = this.ragdollManager._active?.get(entityId);
        if (!ragdoll || !ragdoll.active) {
            this.stats.skippedNoRagdoll++;
            return null;
        }
        this.stats.hitsRecorded++;

        // Find nearest non-severed bone to hitPos
        const severedSet = ragdoll._severedSet ?? null;
        let bestIdx = -1, bestD2 = Infinity;
        for (let i = 0; i < ragdoll.boneCount; i++) {
            if (severedSet && severedSet.has(i)) continue;
            const wp = ragdoll.worldPos[i];
            const dx = wp[0] - hitPos.x;
            const dy = wp[1] - hitPos.y;
            const dz = wp[2] - hitPos.z;
            const d2 = dx*dx + dy*dy + dz*dz;
            if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
        }
        if (bestIdx < 0) return null;

        // Accumulate damage on the closest bone
        let bucket = this._hitBuckets.get(entityId);
        if (!bucket) { bucket = new Map(); this._hitBuckets.set(entityId, bucket); }
        const prev = bucket.get(bestIdx) ?? 0;
        const next = prev + dmg;
        bucket.set(bestIdx, next);

        // Threshold check
        if (next < this.severThreshold) return null;

        // Severability check
        if (!this._isSeverable(ragdoll, bestIdx)) {
            this.stats.skippedNotSeverable++;
            return null;
        }

        // Fire severance
        return this._sever(entityId, ragdoll, bestIdx, hitPos, hitDir, next);
    }

    _isSeverable(ragdoll, boneIdx) {
        // Can't sever the root
        if (ragdoll.parents[boneIdx] < 0) return false;

        const node = ragdoll.animator?.nodes?.[boneIdx];
        const name = node?.name ?? "";

        // Name-based: explicit deny wins
        if (PROTECTED_RE.test(name)) return false;
        if (SEVERABLE_RE.test(name)) return true;

        // Fall back to depth heuristic: depth 0 = root, 1 = trunk pieces,
        // 2+ = limbs / extremities. Sever depth >= 2 only.
        let depth = 0, cur = ragdoll.parents[boneIdx];
        while (cur >= 0) { depth++; cur = ragdoll.parents[cur]; }
        return depth >= 2;
    }

    _sever(entityId, ragdoll, boneIdx, hitPos, hitDir, accumDmg) {
        // Compute subtree: boneIdx + every bone whose ancestor chain
        // passes through boneIdx
        const subtree = [boneIdx];
        for (let i = 0; i < ragdoll.boneCount; i++) {
            if (i === boneIdx) continue;
            let cur = ragdoll.parents[i];
            while (cur >= 0) {
                if (cur === boneIdx) { subtree.push(i); break; }
                cur = ragdoll.parents[cur];
            }
        }

        // Mark severed on the parent ragdoll. Solver will inspect this.
        if (!ragdoll._severedSet) ragdoll._severedSet = new Set();
        for (const idx of subtree) ragdoll._severedSet.add(idx);

        // Apply fly-off impulse to the severance root in the hit direction.
        // If no direction supplied, default to radial outward from the kaiju
        // center (parent of the severed bone, which is still attached).
        let dx, dy, dz;
        if (hitDir) {
            dx = hitDir.x ?? 0; dy = hitDir.y ?? 0; dz = hitDir.z ?? 0;
        } else {
            const parentIdx = ragdoll.parents[boneIdx];
            const px = ragdoll.worldPos[parentIdx][0];
            const py = ragdoll.worldPos[parentIdx][1];
            const pz = ragdoll.worldPos[parentIdx][2];
            const bx = ragdoll.worldPos[boneIdx][0];
            const by = ragdoll.worldPos[boneIdx][1];
            const bz = ragdoll.worldPos[boneIdx][2];
            dx = bx - px; dy = by - py; dz = bz - pz;
        }
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;

        const mag = Math.max(
            SEVER_IMPULSE_MIN,
            Math.min(SEVER_IMPULSE_MAX, accumDmg * SEVER_IMPULSE_PER_DAMAGE),
        );
        // Apply to every bone in the subtree, scaled by 1/mass so light
        // tips fly farther than the limb root
        const dtScale = 1 / 60;   // matches Ragdoll's per-tick velocity convention
        for (const idx of subtree) {
            const m = ragdoll.mass?.[idx] ?? 1;
            const scale = mag / m;
            const prev = ragdoll.prevPos[idx];
            prev[0] -= dx * scale * dtScale;
            prev[1] -= (dy * scale + SEVER_IMPULSE_LIFT) * dtScale;
            prev[2] -= dz * scale * dtScale;
        }

        // Particle burst at severance position
        if (this.particles?.spawn) {
            for (let i = 0; i < 24; i++) {
                const a = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const speed = 3 + Math.random() * 5;
                this.particles.spawn({
                    x: hitPos.x, y: hitPos.y, z: hitPos.z,
                    vx: Math.sin(phi) * Math.cos(a) * speed,
                    vy: Math.cos(phi) * speed + 2,
                    vz: Math.sin(phi) * Math.sin(a) * speed,
                    ttl: 0.7 + Math.random() * 0.4,
                    size: 0.35,
                    r: 0.85, g: 0.15, b: 0.10, a: 1.0,
                    gravity: -8,
                });
            }
        }

        const name = ragdoll.animator?.nodes?.[boneIdx]?.name ?? `bone[${boneIdx}]`;
        this.stats.severances++;
        console.log(`[RagdollDismember] severed "${name}" (subtree=${subtree.length}) from entity ${entityId}`);

        return {
            entityId,
            boneIdx,
            boneName: name,
            subtree,
            mag,
            hitDir: { x: dx, y: dy, z: dz },
        };
    }

    // When a ragdoll despawns, clean up its tracking data.
    onRagdollDispose(entityId) {
        this._hitBuckets.delete(entityId);
    }

    clear() {
        this._hitBuckets.clear();
        this.stats = {
            hitsRecorded: 0,
            severances: 0,
            skippedNoRagdoll: 0,
            skippedNotSeverable: 0,
        };
    }

    snapshot() {
        return {
            ...this.stats,
            tracked: this._hitBuckets.size,
        };
    }
}

export function makeRagdollDismember(deps) {
    return new RagdollDismember(deps);
}
