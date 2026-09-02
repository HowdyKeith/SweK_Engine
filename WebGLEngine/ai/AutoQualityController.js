// ai/AutoQualityController.js — v643
//
// "Try the slider FPS. If we're dipping, ease down to balanced or fast.
//  When the scene is easy again, climb back up." — user's mental model.
//
// Polls window._perfStats.fps every 1s and walks a 3-tier ladder
// (fast / balanced / quality) toward a target FPS set by the user via a
// slider. Only adjusts RUNTIME knobs (currently bloom on/off via the same
// hook the manual presets use). Reload-only knobs (shadowMapSize, grid
// radius) are documented as future tiers.
//
// Hysteresis to avoid thrashing:
//   - Step DOWN only after FPS < target*0.80 for 3 consecutive samples.
//   - Step UP   only after FPS > target*0.95 for 6 consecutive samples
//     (longer because the cost of upgrading is felt instantly).
//
// The controller doesn't own the preset name — when the user picks "auto"
// in the panel, that controller starts polling. When they pick anything
// else, it stops + the manual preset takes effect immediately.
//
// API: start(opts) / stop() / state() / setTargetFps(n).

const TIER_KNOBS = {
    fast:     { bloom: false },
    balanced: { bloom: true  },
    quality:  { bloom: true  },
};
// Level 12 -- TIER_ORDER IS DERIVED, NOT TYPED. It was `["fast", "balanced", "quality"] // ascending difficulty`
// from v643: an ordering by cost that nothing measured. ai/qualityTiers.mjs sorts the tiers by the summed
// complexity of the shaders their knobs switch on (render/shaderComplexity.mjs), breaking ties by name and
// reporting them. A page has no filesystem, so the controller takes `readShader` from its caller and falls back
// to the knob-count order (a tier with more knobs on costs more) until one is supplied; a gate supplies the
// real reader and proves the two agree today.
import { tierOrder } from "./qualityTiers.mjs";
let TIER_ORDER = tierOrder(TIER_KNOBS, () => null).order;
export function deriveTierOrder(readShader) { TIER_ORDER = tierOrder(TIER_KNOBS, readShader).order; return TIER_ORDER.slice(); }
export function currentTierOrder() { return TIER_ORDER.slice(); }
export { TIER_KNOBS };

const DOWN_THRESHOLD = 0.80;   // fps < target * 0.80 → consider down
const UP_THRESHOLD   = 0.95;   // fps > target * 0.95 → consider up
const DOWN_SAMPLES   = 3;      // ~3s of dipping before stepping down
const UP_SAMPLES     = 6;      // ~6s of healthy before stepping up
const POLL_MS        = 1000;

export class AutoQualityController {
    constructor(opts = {}) {
        this.hooks = opts.hooks || {};      // { setBloom }
        this.targetFps = opts.targetFps || 60;
        this.tier = "balanced";             // start in the middle
        this._belowCount = 0;
        this._aboveCount = 0;
        this._timer = null;
        this._lastDecisionAt = 0;
        this._log = opts.log !== false;     // log on tier change by default
    }

    setTargetFps(n) {
        this.targetFps = Math.max(20, Math.min(240, Math.round(n)));
        this._belowCount = this._aboveCount = 0;   // reset hysteresis
        if (this._log) console.log(`[autoQuality] target → ${this.targetFps} fps`);
    }

    start() {
        if (this._timer) return;
        this._applyTier(this.tier);   // ensure the runtime knobs match our tier
        this._timer = setInterval(() => this._tick(), POLL_MS);
        if (this._log) console.log(`[autoQuality] started, target=${this.targetFps} tier=${this.tier}`);
    }

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._log) console.log("[autoQuality] stopped");
    }

    state() {
        return {
            running:   !!this._timer,
            targetFps: this.targetFps,
            tier:      this.tier,
            below:     this._belowCount,
            above:     this._aboveCount,
        };
    }

    _tick() {
        let fps = 0;
        try { fps = window?._perfStats?.fps || 0; } catch {}
        if (!Number.isFinite(fps) || fps <= 0) return;
        const t = this.targetFps;
        const tierIdx = TIER_ORDER.indexOf(this.tier);

        if (fps < t * DOWN_THRESHOLD) {
            this._belowCount += 1; this._aboveCount = 0;
        } else if (fps > t * UP_THRESHOLD) {
            this._aboveCount += 1; this._belowCount = 0;
        } else {
            // In the no-action band — drift counters down toward 0 so a
            // single bad/good frame doesn't accumulate forever.
            this._belowCount = Math.max(0, this._belowCount - 1);
            this._aboveCount = Math.max(0, this._aboveCount - 1);
        }

        if (this._belowCount >= DOWN_SAMPLES && tierIdx > 0) {
            this._setTier(TIER_ORDER[tierIdx - 1], `fps ${Math.round(fps)} < ${Math.round(t * DOWN_THRESHOLD)} for ${this._belowCount}s`);
            this._belowCount = 0;
        } else if (this._aboveCount >= UP_SAMPLES && tierIdx < TIER_ORDER.length - 1) {
            this._setTier(TIER_ORDER[tierIdx + 1], `fps ${Math.round(fps)} > ${Math.round(t * UP_THRESHOLD)} for ${this._aboveCount}s`);
            this._aboveCount = 0;
        }
    }

    _setTier(next, why) {
        if (next === this.tier) return;
        const prev = this.tier;
        this.tier = next;
        this._lastDecisionAt = Date.now();
        this._applyTier(next);
        if (this._log) console.log(`[autoQuality] ${prev} → ${next} (${why})`);
    }

    _applyTier(name) {
        const k = TIER_KNOBS[name];
        if (!k) return;
        try { if (typeof this.hooks.setBloom === "function") this.hooks.setBloom(k.bloom); } catch {}
    }
}
