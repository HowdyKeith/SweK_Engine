// tintFX.js — reusable per-entity colour effects built on the v549
// `entity:tint` hook (a lerp toward a target colour, mix 0..1).
//
// The tint hook is just "set this entity's colour blend". TintFX adds the
// *time* dimension and *layering* on top:
//
//   • base  — a persistent tint that stays until cleared (status / team /
//             cloak). Either a steady "hold" or an oscillating "pulse".
//   • flash — a transient hit-flash that decays and, crucially, reverts to the
//             base underneath instead of clearing. So a blue "frozen" enemy
//             flashes red when hit, then settles back to blue.
//
// One update(dt) advances everything; commands are addressed by entity id, so
// any system or the console can drive it:
//   window.tintFX.flash(id) / .burn(id) / .freeze(id) / .poison(id)
//   window.tintFX.team(id,[r,g,b]) / .hold(id,[r,g,b],mix) / .pulse(id) / .clear(id)
//
// Throttled: a command is only emitted when the effective colour/mix actually
// changes by a meaningful step (EPS), so a decaying flash is a few dozen calls,
// a steady hold is ~one.

const DAMAGE_RED = [1.0, 0.25, 0.18];
const EPS = 0.02;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class TintFX {
    constructor(router) {
        this.router = router;
        this._base  = new Map();   // id -> { kind:"hold"|"pulse", color, mix, baseMix, amp, period, t }
        this._flash = new Map();   // id -> { color, mix, decay }
        this._last = new Map();   // id -> { m, ck }  (throttle: last emitted mix + colour key)
    }

    // --- transient ---------------------------------------------------------
    flash(id, opts = {}) {
        if (id == null || !this.router) return;
        const peak = opts.peak != null ? opts.peak : 0.85;
        const prev = this._flash.get(id);
        this._flash.set(id, {
            color: opts.color || DAMAGE_RED,
            mix: Math.max(peak, prev ? prev.mix : 0),    // re-hit keeps the brighter
            decay: opts.decay != null ? opts.decay : 3.0,
        });
    }

    // --- persistent base ---------------------------------------------------
    hold(id, color, mix = 0.6) {
        if (id == null || !this.router) return;
        this._base.set(id, { kind: "hold", color, mix });
    }
    pulse(id, opts = {}) {
        if (id == null || !this.router) return;
        this._base.set(id, {
            kind: "pulse", color: opts.color || [1.0, 0.9, 0.3],
            baseMix: opts.base != null ? opts.base : 0.35,
            amp: opts.amp != null ? opts.amp : 0.25,
            period: opts.period != null ? opts.period : 0.8,
            t: 0, mix: 0,
        });
    }
    // Semantic helpers — self-documenting presets over hold().
    burn(id)            { this.hold(id, [1.0, 0.45, 0.12], 0.6); }   // lava / fire
    freeze(id)          { this.hold(id, [0.55, 0.8, 1.0], 0.6); }    // ice
    poison(id)          { this.hold(id, [0.35, 0.95, 0.3], 0.5); }   // toxic
    team(id, color, mix = 0.5) { this.hold(id, color, mix); }        // faction recolor

    // --- clearing ----------------------------------------------------------
    clearHold(id) {                       // drop the base only; keep any flash
        if (this._base.delete(id) && !this._flash.has(id)) this._reset(id);
    }
    clear(id) {                           // drop everything on this entity
        const had = this._base.delete(id) || this._flash.delete(id);
        this._flash.delete(id); this._base.delete(id);
        if (had) this._reset(id);
    }
    clearAll() {
        for (const id of new Set([...this._base.keys(), ...this._flash.keys()])) this.clear(id);
    }
    has(id) { return this._base.has(id) || this._flash.has(id); }

    // --- per-frame ---------------------------------------------------------
    update(dt) {
        if (!this._base.size && !this._flash.size) return;
        const ids = new Set([...this._flash.keys(), ...this._base.keys()]);
        for (const id of ids) {
            const f = this._flash.get(id);
            const b = this._base.get(id);
            let color, mix;
            if (f) {
                f.mix -= f.decay * dt;
                if (f.mix <= 0) {
                    this._flash.delete(id);
                    if (!b) { this._reset(id); continue; }     // nothing underneath
                    ({ color, mix } = this._baseVal(b, dt));   // revert to base
                } else {
                    color = f.color; mix = f.mix;
                }
            } else if (b) {
                ({ color, mix } = this._baseVal(b, dt));
            } else {
                continue;
            }
            this._emit(id, color, mix);
        }
    }

    _baseVal(b, dt) {
        if (b.kind === "pulse") {
            b.t += dt;
            b.mix = b.baseMix + b.amp * Math.sin((b.t / b.period) * Math.PI * 2);
        }
        return { color: b.color, mix: b.mix };
    }

    _reset(id) {
        this._last.delete(id);
        try { this.router.exec({ type: "entity:tint", id, mix: 0 }); } catch {}
    }

    _emit(id, color, mix) {
        const m = clamp01(mix);
        const ck = color[0] + "," + color[1] + "," + color[2];
        const last = this._last.get(id);
        // skip near-identical repeats, but always push a real clear or a colour change
        if (m !== 0 && last && last.ck === ck && Math.abs(m - last.m) < EPS) return;
        this._last.set(id, { m, ck });
        try {
            if (m <= 0) this.router.exec({ type: "entity:tint", id, mix: 0 });
            else        this.router.exec({ type: "entity:tint", id, color, mix: m });
        } catch {}
    }
}
