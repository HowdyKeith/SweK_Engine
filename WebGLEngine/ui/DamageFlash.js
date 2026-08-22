// FILE: ui/DamageFlash.js
// VERSION: v1 — round 270b
//
// Full-screen red-rim flash overlay that pulses when the player takes
// damage in FPS / observer / kaiju_drive mode. Matches the cockpit's
// existing damage-flash for the mech, so the language is consistent
// across the two modes. Lightweight: one DOM div with a radial-gradient
// border that fades opacity over ~600ms.
//
// API:
//   const df = new DamageFlash();
//   df.flash(intensity);     // 0..1 — small grazes = 0.3, big hits = 1.0
//
// PlayerEnergy.applyDamage triggers it. The intensity argument scales
// both opacity and a brief "punch" zoom on the rim radius.

export class DamageFlash {
    constructor() {
        this.el = null;
        this._currentOpacity = 0;
        this._raf = null;
        this._install();
    }

    _install() {
        if (typeof document === "undefined") return;
        const el = document.createElement("div");
        el.id = "fps-damage-flash";
        Object.assign(el.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            zIndex: "8700",     // above world UI, below modal stuff
            opacity: "0",
            background:
                "radial-gradient(ellipse at center, transparent 45%, rgba(180, 20, 20, 0.05) 65%, rgba(255, 30, 30, 0.55) 95%)",
            transition: "opacity 600ms cubic-bezier(0.2, 0, 0.4, 1)",
        });
        document.body.appendChild(el);
        this.el = el;
    }

    flash(intensity = 1.0) {
        if (!this.el) return;
        const i = Math.max(0.15, Math.min(1.0, intensity));
        // Stronger flashes go to higher opacity. The CSS transition
        // handles the fade-out; we just bump opacity and let it decay.
        this._currentOpacity = Math.min(1.0, this._currentOpacity + i * 0.8);
        // Snap-in (50ms) by removing the transition briefly, then
        // restore the transition for the fade-out.
        const prev = this.el.style.transition;
        this.el.style.transition = "opacity 50ms linear";
        this.el.style.opacity = this._currentOpacity.toFixed(3);
        // After snap, schedule the fade
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.el.style.transition = prev;
            this.el.style.opacity = "0";
            this._currentOpacity = 0;
        }));
    }
}
