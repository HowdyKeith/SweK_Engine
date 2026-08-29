// FILE: /world/DynamicGridRadius.js
// VERSION: v1 — round 291
//
// Adaptive view-distance — watches the FPS counter and grows/shrinks
// the world's gridRadius to maximize visible area while keeping the
// frame rate above a configurable target. Uses the incremental
// growGrid/shrinkGrid methods on world (round 291) so changes don't
// stall the renderer for full re-generation.
//
// Decision loop (every CHECK_INTERVAL_MS):
//
//   1. Compute average FPS over the rolling window (~5s).
//   2. If avg ≥ growThreshold AND gridRadius < maxRadius AND
//      cooldown elapsed → growGrid(+1).
//   3. If avg ≤ shrinkThreshold AND gridRadius > minRadius →
//      shrinkGrid(-1) immediately. Bypasses cooldown — frame budget
//      pressure is more urgent than view-distance ambition.
//
// Hysteresis: after a grow, a 8-second cooldown blocks the next
// grow attempt (lets the renderer settle into the new chunk count).
// Shrinks have no cooldown — we always relieve pressure ASAP. Grows
// also pause for 3 seconds after a shrink to avoid oscillation.
//
// API:
//   const dgr = new DynamicGridRadius({ world, fpsSource, ... });
//   dgr.tick(dt);                   — called once per frame
//   dgr.setEnabled(true|false);
//   dgr.setTargetFps(60);           — adjusts thresholds
//   dgr.forceGrow() / forceShrink() — manual override (no cooldown)
//   dgr.status()                    — { enabled, radius, avgFps, ... }
//
// Console:
//   gridGrow.setEnabled(false)
//   gridGrow.status()

const CHECK_INTERVAL_MS = 1000;   // re-evaluate at most once per second
const SAMPLE_WINDOW_MS  = 5000;
const GROW_COOLDOWN_MS  = 8000;
const SHRINK_TO_GROW_MS = 3000;

import { growthWouldBeInvisible } from "../render/screenSpaceError.js";

export class DynamicGridRadius {
    constructor({
        world,
        fpsSource,                // any object with .fps property (ui/fps.js)
        targetFps = 55,
        growThreshold = 58,       // grow when avg >= this
        shrinkThreshold = 32,     // shrink when avg <= this
        minRadius = 5,
        maxRadius = 12,
        // v4150 -- OPTIONAL screen metrics. Supply { screenHeightPx(), fovYRad(), targetPx } and a grow is also
        // asked whether the ring it would add is RESOLVABLE. Omit it and this class behaves exactly as it has
        // since round 291: an engine with no screen metrics must not change behaviour because a field was added.
        sse = null,
    }) {
        this.world = world;
        this._sse = sse;
        this.fpsSource = fpsSource;
        this.targetFps = targetFps;
        this.growThreshold = growThreshold;
        this.shrinkThreshold = shrinkThreshold;
        this.minRadius = Math.max(3, minRadius);
        this.maxRadius = Math.min(16, maxRadius);
        this.enabled = true;
        // Rolling FPS samples — { t, fps } pairs, dropped after SAMPLE_WINDOW_MS
        this._samples = [];
        this._lastCheckMs = 0;
        // Round 291 — initialise cooldown anchors to -Infinity so the
        // FIRST grow/shrink isn't blocked by a fake "we just did one"
        // signal. Without this, the first decision is artificially
        // delayed by GROW_COOLDOWN_MS after construction.
        this._lastGrowMs   = -Infinity;
        this._lastShrinkMs = -Infinity;
        this._growCount = 0;
        this._shrinkCount = 0;
        this._sseVetoes = 0;
    }

    /**
     * v4150 -- would the ring this grow would ADD be below the visible threshold?
     *
     * The new ring sits one chunk further out than the current edge, so its distance is measured to the OUTER
     * face of the ring being added: (radius + 1) chunks of chunkSize. Asking about the current edge instead
     * would veto on the ring that is already drawn, which is the off-by-one that turns this from a leading
     * signal into a wrong one.
     */
    _growWouldBeInvisible(radius) {
        const cs = this.world?.chunkSize || 16;
        try {
            const h = typeof this._sse.screenHeightPx === "function" ? this._sse.screenHeightPx() : this._sse.screenHeightPx;
            const f = typeof this._sse.fovYRad === "function" ? this._sse.fovYRad() : this._sse.fovYRad;
            return growthWouldBeInvisible({
                ringDistance: (radius + 1) * cs,
                chunkSize: cs, screenHeightPx: h, fovYRad: f,
                targetPx: this._sse.targetPx ?? 1,
                voxelSize: this._sse.voxelSize ?? 1,
            });
        } catch { return false; }   // a metrics source that throws must not pin the view distance
    }

    setEnabled(on) {
        this.enabled = !!on;
    }

    setTargetFps(fps) {
        this.targetFps = Math.max(15, Math.min(120, fps));
        // Auto-adjust thresholds relative to target
        this.growThreshold   = this.targetFps + 3;
        this.shrinkThreshold = Math.max(20, this.targetFps - 23);
    }

    status() {
        const now = performance.now();
        const sinceGrow   = Number.isFinite(this._lastGrowMs)   ? (now - this._lastGrowMs)   : Infinity;
        const sinceShrink = Number.isFinite(this._lastShrinkMs) ? (now - this._lastShrinkMs) : Infinity;
        return {
            enabled: this.enabled,
            radius: this.world?.gridRadius ?? null,
            minRadius: this.minRadius,
            maxRadius: this.maxRadius,
            targetFps: this.targetFps,
            avgFps: this._averageFps(),
            samples: this._samples.length,
            growCount: this._growCount,
            shrinkCount: this._shrinkCount,
            growCooldownLeft: Math.max(0, Math.min(GROW_COOLDOWN_MS,  GROW_COOLDOWN_MS  - sinceGrow)),
            shrinkRecency:    Math.max(0, Math.min(SHRINK_TO_GROW_MS, SHRINK_TO_GROW_MS - sinceShrink)),
        };
    }

    forceGrow() {
        if (!this.world?.growGrid) return null;
        const r = this.world.growGrid(1);
        this._lastGrowMs = performance.now();
        this._growCount++;
        return r;
    }

    forceShrink() {
        if (!this.world?.shrinkGrid) return null;
        const r = this.world.shrinkGrid(1);
        this._lastShrinkMs = performance.now();
        this._shrinkCount++;
        return r;
    }

    tick(dt) {
        if (!this.enabled) return;
        if (!this.world || !this.fpsSource) return;
        const now = performance.now();

        // Always sample FPS regardless of check cadence — the window
        // averaging benefits from a high-frequency input.
        const fps = +this.fpsSource.fps;
        if (Number.isFinite(fps) && fps > 0 && fps < 240) {
            this._samples.push({ t: now, fps });
        }
        // Drop stale samples
        const cutoff = now - SAMPLE_WINDOW_MS;
        while (this._samples.length && this._samples[0].t < cutoff) {
            this._samples.shift();
        }

        if (now - this._lastCheckMs < CHECK_INTERVAL_MS) return;
        this._lastCheckMs = now;

        // Need at least 1 second of samples (~60 at 60fps) to make a decision
        if (this._samples.length < 30) return;

        const avg = this._averageFps();
        const radius = this.world.gridRadius ?? 0;

        // SHRINK first — relieves pressure immediately, no cooldown
        if (avg <= this.shrinkThreshold && radius > this.minRadius) {
            console.log(`[DynamicGridRadius] shrinking — avg ${avg.toFixed(1)} fps <= ${this.shrinkThreshold}`);
            this.world.shrinkGrid(1);
            this._lastShrinkMs = now;
            this._shrinkCount++;
            // Clear samples so the next check starts fresh after the
            // chunk count change — otherwise the old "slow" samples
            // bias the next decision.
            this._samples.length = 0;
            return;
        }
        // GROW — gated by cooldowns + recent shrink
        if (avg >= this.growThreshold && radius < this.maxRadius) {
            if (now - this._lastGrowMs < GROW_COOLDOWN_MS) return;
            if (now - this._lastShrinkMs < SHRINK_TO_GROW_MS) return;
            // v4150 -- *** AND IS THERE ANYTHING OUT THERE TO SEE? *** Frame rate is a LAGGING signal: this loop
            // can only shrink after frames have already been dropped, and it grows whenever there is headroom
            // whether or not the new ring shows anybody anything. render/screenSpaceError.mjs asks the leading
            // question -- at the distance that ring would sit, does a whole chunk still subtend even one pixel?
            // If not, growing spends real frame budget on geometry nobody can resolve.
            //
            // GROWTH ONLY, NEVER SHRINKING, and that asymmetry is deliberate: a veto that could also force a
            // shrink would be a second controller fighting the frame-rate one, and two controllers on one
            // actuator oscillate. Refusing to grow can at worst leave the view exactly where it already was.
            // An unanswerable measurement does not veto either -- see growthWouldBeInvisible's own refusal.
            if (this._sse && this._growWouldBeInvisible(radius)) {
                this._sseVetoes++;
                return;
            }
            console.log(`[DynamicGridRadius] growing — avg ${avg.toFixed(1)} fps >= ${this.growThreshold}`);
            this.world.growGrid(1);
            this._lastGrowMs = now;
            this._growCount++;
            this._samples.length = 0;
        }
    }

    _averageFps() {
        if (this._samples.length === 0) return 0;
        let sum = 0;
        for (const s of this._samples) sum += s.fps;
        return sum / this._samples.length;
    }
}
