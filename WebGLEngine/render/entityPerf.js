// FILE: render/entityPerf.js
// VERSION: v1 — round 312
//
// Frame-budget controls for EntityMeshRenderer. The renderer's per-
// entity rigged-mesh loop was burning 70ms/frame at ~50 entities
// because it ran:
//   - skeletal animator.update() (55-joint clip eval + skin matrices)
//   - bufferSubData (13 floats per entity, separate upload)
//   - drawElementsInstanced(..., 1) (single-instance draw, no batching)
// for EVERY entity, including ones behind the camera or 200m away.
//
// This module is read by the renderer each frame to decide:
//   1. Should this entity render at all? (frustum + far cull)
//   2. Should its animator update this frame? (distance-tier throttle)
//
// All thresholds are tunable from the console:
//   window.entityPerf.farCullDistance = 150
//   window.entityPerf.setEnabled(false)    // disable all opts
//
// Per-animator state used: `_throttleAccDt` (dt accumulator while
// throttled). The cached jointMatrices on the animator persist across
// skipped frames, so a "frozen" pose is correct — no flicker.

const ENTITY_PERF = {
    // Master switch. When false, the renderer behaves exactly as v311
    // (every entity renders, every animator updates every frame).
    enabled: true,

    // Hard-cull entities beyond this Euclidean distance from camera.
    // Skipped entirely — no animator update, no draw call. At 100m a
    // rigged kaiju is a few pixels tall; not worth the cost. (Round
    // 315 — tightened from 150 to 100m based on v314 profile data.)
    farCullDistance: 100,

    // Frustum cull: skip entities behind the camera or significantly
    // off-screen. Implemented via a simple dot-product test against
    // camera forward + a side-cone tolerance (avoids harsh pop-out at
    // FOV edges). Disable if you want a debug fly-around.
    frustumCull: true,
    // Allowance beyond pure FOV — values <1.0 are tighter, >1.0 looser.
    // Round 315 — tightened from 1.3 to 1.15 to cull more side
    // entities; bump back to 1.3+ if entities pop out at FOV edges.
    frustumMargin: 1.15,

    // Distance tiers — each tier multiplies the min interval between
    // animator updates. Tier boundaries are in world units squared
    // (we compare distSq for speed). Smaller numbers = closer.
    // At 60Hz target, baseInterval is the per-tier interval *in seconds*.
    tiers: [
        { maxDistSq:   25*25, intervalSec: 1/60 },    // close: 60Hz
        { maxDistSq:   50*50, intervalSec: 1/30 },    // medium: 30Hz
        { maxDistSq:  100*100, intervalSec: 1/15 },   // far: 15Hz
        { maxDistSq: 9999*9999, intervalSec: 1/7  },  // very far: 7Hz
    ],

    // Per-frame counters bag the renderer fills with what it
    // skipped/drew this frame. Reset at start of every render() call
    // via _resetFrameStats. Use snapshot() to read.
    stats: {
        framesCounted: 0,
        totalEntities: 0,
        culledFrustum: 0,
        culledFar: 0,
        drewRigged: 0,
        drewNonRigged: 0,
        animatorUpdates: 0,
        animatorSkips: 0,
    },

    // Round 316 — cumulative counters that DO NOT reset per-frame.
    // _resetFrameStats() rolls the last frame's per-frame stats into
    // these before zeroing. Used by the frame profiler so it can
    // compute meaningful per-frame averages over its sample window
    // (frameProfiler calls resetCumulative() before sampling).
    cumulative: {
        framesCounted: 0,
        totalEntities: 0,
        culledFrustum: 0,
        culledFar: 0,
        drewRigged: 0,
        drewNonRigged: 0,
        animatorUpdates: 0,
        animatorSkips: 0,
    },

    // Per-frame stats reset (called by renderer at start of render()).
    // Rolls last frame's counts into cumulative BEFORE zeroing so the
    // cumulative bucket sees every frame's data.
    _resetFrameStats() {
        // Roll prior frame's stats into cumulative
        this.cumulative.framesCounted++;
        this.cumulative.totalEntities    += this.stats.totalEntities;
        this.cumulative.culledFrustum    += this.stats.culledFrustum;
        this.cumulative.culledFar        += this.stats.culledFar;
        this.cumulative.drewRigged       += this.stats.drewRigged;
        this.cumulative.drewNonRigged    += this.stats.drewNonRigged;
        this.cumulative.animatorUpdates  += this.stats.animatorUpdates;
        this.cumulative.animatorSkips    += this.stats.animatorSkips;
        // Increment per-frame frame counter too, for legacy callers
        this.stats.framesCounted++;
        // Reset per-frame counts for the upcoming frame
        this.stats.totalEntities = 0;
        this.stats.culledFrustum = 0;
        this.stats.culledFar    = 0;
        this.stats.drewRigged   = 0;
        this.stats.drewNonRigged = 0;
        this.stats.animatorUpdates = 0;
        this.stats.animatorSkips   = 0;
    },

    // Round 316 — reset just the cumulative bucket. Frame profiler
    // calls this before its sample window starts so the averages it
    // reports are constrained to the window.
    resetCumulative() {
        this.cumulative = {
            framesCounted: 0,
            totalEntities: 0,
            culledFrustum: 0,
            culledFar: 0,
            drewRigged: 0,
            drewNonRigged: 0,
            animatorUpdates: 0,
            animatorSkips: 0,
        };
    },

    // Public API
    setEnabled(on) { this.enabled = !!on; },
    isEnabled()    { return this.enabled; },
    snapshot() {
        return {
            ...this.stats,
            cumulative: { ...this.cumulative },
            enabled: this.enabled,
            farCullDistance: this.farCullDistance,
            frustumCull: this.frustumCull,
            tiers: this.tiers.slice(),
        };
    },
    reset() { this._resetFrameStats(); },
};

if (typeof window !== "undefined") {
    window.entityPerf = ENTITY_PERF;
}

// =============================================================================
// Decision helpers (pure functions — testable, fast)
// =============================================================================

/**
 * Should this entity be skipped entirely this frame?
 * Returns "far" | "frustum" | null.
 *
 * camForward, camPos, camRight, camUp are pre-computed unit vectors.
 * Pass-through arrays/objects with x,y,z.
 */
export function shouldCullEntity(entity, camera, camFwd, _opts = null) {
    if (!ENTITY_PERF.enabled) return null;
    // 1. Far cull — euclidean distance squared vs threshold squared
    const dx = entity.x - camera.position.x;
    const dy = (entity.y || 0) - camera.position.y;
    const dz = entity.z - camera.position.z;
    const distSq = dx*dx + dy*dy + dz*dz;
    const farSq = ENTITY_PERF.farCullDistance * ENTITY_PERF.farCullDistance;
    if (distSq > farSq) return "far";

    // 2. Frustum cull — entity must be in front of camera. The dot
    //    product against camera forward gives us how "ahead" the entity
    //    is in world units. Allow some buffer (a few meters) so entities
    //    crossing the frustum edge don't pop out abruptly.
    if (ENTITY_PERF.frustumCull) {
        const fwdDot = dx*camFwd.x + dy*camFwd.y + dz*camFwd.z;
        if (fwdDot < -5) return "frustum";    // entity is >5m behind camera
        // Side cone check: distance perpendicular to camera forward,
        // normalized by forward distance. ~tan(fov/2) * margin.
        // For 70° FOV: tan(35°) ≈ 0.7. With margin=1.3: cap at ~0.91.
        if (fwdDot > 5) {
            // Compute perpendicular component magnitude (cheaper than
            // a full plane test — assumes mostly-horizontal field of view)
            const perpX = dx - fwdDot * camFwd.x;
            const perpY = dy - fwdDot * camFwd.y;
            const perpZ = dz - fwdDot * camFwd.z;
            const perpLen = Math.sqrt(perpX*perpX + perpY*perpY + perpZ*perpZ);
            // Allow generous angle for tall entities and wide kaiju
            const limit = fwdDot * 0.95 * ENTITY_PERF.frustumMargin;
            if (perpLen > limit) return "frustum";
        }
    }
    return null;
}

/**
 * Decide if this animator should update this frame, given the entity's
 * current distSq to camera. Accumulates skipped dt onto the animator;
 * when threshold reached, returns the accumulated dt for the caller to
 * pass into animator.update().
 *
 * Returns:
 *   - number ≥ 0: caller should run animator.update(retVal)
 *   - null: caller should skip animator.update() this frame
 *
 * Stores `_throttleAccDt` on the animator.
 */
export function decideAnimatorUpdate(animator, distSq, frameDt) {
    if (!ENTITY_PERF.enabled) return frameDt;          // off → original behavior
    // Find the tier whose maxDistSq covers this entity
    let intervalSec = 1/60;
    for (const tier of ENTITY_PERF.tiers) {
        if (distSq <= tier.maxDistSq) {
            intervalSec = tier.intervalSec;
            break;
        }
    }
    if (intervalSec <= 1/60) return frameDt;            // close enough → always update
    const acc = (animator._throttleAccDt || 0) + frameDt;
    if (acc >= intervalSec) {
        animator._throttleAccDt = 0;
        return acc;
    }
    animator._throttleAccDt = acc;
    return null;
}

/**
 * Should we always update this animator regardless of distance?
 * True when Ragdoll is driving the pose (onPose hook present) since
 * physics needs every-frame dt. Hit-reaction constraints are no-ops
 * at reactionT=0 so they don't force frequent updates.
 */
export function animatorNeedsEveryFrame(animator) {
    return !!animator.onPose;
}

export { ENTITY_PERF };
