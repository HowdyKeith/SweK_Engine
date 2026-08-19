// ===================================================================
// render/underwaterCaustics.js
// -------------------------------------------------------------------
// Animated underwater caustics overlay. The engine already gives a blue
// "submerged" tint + bubbles (SwimMode) and a full water surface
// (WaterRenderer: multi-octave waves, SSR, refraction, foam) — what it
// lacked was the shimmering caustic light you see underwater. This
// grafts the layered-sine caustic math from the reviewed water dump into
// a self-contained DOM overlay so it touches NONE of the GL render
// pipeline (no FBO, no change to the bloom-final-composite invariant).
//
// It draws caustics on a tiny canvas (cheap), stretches it over the view
// with a "screen" blend so it brightens the scene like real caustic
// light, fades in/out as the camera enters/leaves water, and adds a
// gentle depth tint + vertical god-ray modulation.
// ===================================================================

export class UnderwaterCaustics {
    constructor({ zIndex = 60 } = {}) {
        this.enabled = true;
        this.amount  = 0;     // smoothed 0..1 underwater blend
        this.t       = 0;
        this.intensity = 0.5;   // v460 — toned down (was 1.0, screen-filling blobs)
        this._buildDOM(zIndex);
    }

    _buildDOM(zIndex) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            position: "fixed", inset: "0", pointerEvents: "none",
            zIndex: String(zIndex), opacity: "0", transition: "opacity 260ms ease",
        });
        // Depth tint — darkens + cools the scene the way water absorbs light.
        // v462 — dialed back toward the v453 strength so the LAKEBED stays
        // visible from below (v461's tint was so dark it swallowed it). The
        // bright sun is handled separately by suppressing the sun flare, so
        // the tint only needs to cool/dim, not black everything out.
        const tint = document.createElement("div");
        Object.assign(tint.style, {
            position: "absolute", inset: "0", mixBlendMode: "multiply",
            background: "radial-gradient(ellipse at 50% 32%, rgba(34,104,134,0.36), rgba(7,32,58,0.74) 92%)",
        });
        // Caustic ripple layer (screen blend → adds bright light shafts).
        const c = document.createElement("canvas");
        c.width = 128; c.height = 76;
        Object.assign(c.style, {
            position: "absolute", inset: "0", width: "100%", height: "100%",
            mixBlendMode: "screen", filter: "blur(2px)", opacity: "0.9",
            imageRendering: "auto",
        });
        wrap.appendChild(tint);
        wrap.appendChild(c);
        document.body.appendChild(wrap);
        this.wrap = wrap;
        this.canvas = c;
        this.ctx = c.getContext("2d");
        this.img = this.ctx.createImageData(c.width, c.height);
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (!on) { this.amount = 0; this.wrap.style.opacity = "0"; }
    }

    // underwater: boolean (camera eye submerged). dt: seconds.
    update(dt, underwater) {
        const target = (this.enabled && underwater) ? 1 : 0;
        this.amount += (target - this.amount) * Math.min(1, (dt || 0.016) * 4);
        this.wrap.style.opacity = (this.amount * 0.95).toFixed(3);
        if (this.amount < 0.02) return;       // basically hidden — skip drawing
        this.t += (dt || 0.016);
        this._draw();
    }

    _draw() {
        const W = this.canvas.width, H = this.canvas.height;
        const d = this.img.data;
        const t = this.t * 1.6;
        const gain = this.intensity * this.amount;
        for (let y = 0; y < H; y++) {
            const v = (y / H) * 4;
            // Vertical god-ray modulation (brighter shafts) — from the dump.
            const god = Math.sin(v * 8.0 + t * 0.6) * 0.3 + 0.7;
            for (let x = 0; x < W; x++) {
                const u = (x / W) * 4;
                // Layered-sine caustics (the valuable bit of the reviewed code).
                let c = Math.sin(u * 12.0 + t * 1.8) * Math.cos(v * 10.0 + t * 2.1);
                c += Math.sin(u * 18.0 - t * 1.3) * Math.cos(v * 15.0 + t * 0.9);
                c += Math.sin(u * 25.0 + t * 2.7) * 0.5;
                c = c * 0.5 + 0.5;                       // 0..1
                // Threshold so only the bright ridges sparkle, not a flat wash.
                // v460 — higher threshold + lower gain so it reads as faint
                // light ripples, not the screen-filling blobs from v453.
                let inten = Math.max(0, c - 0.74) * 2.0 * god * gain;
                if (inten > 1) inten = 1;
                const i = (y * W + x) * 4;
                d[i]     = 150 * inten;   // r
                d[i + 1] = 220 * inten;   // g
                d[i + 2] = 255 * inten;   // b
                d[i + 3] = 255 * inten;   // a (screen blend uses brightness)
            }
        }
        this.ctx.putImageData(this.img, 0, 0);
    }

    destroy() { try { this.wrap.remove(); } catch {} }
}
