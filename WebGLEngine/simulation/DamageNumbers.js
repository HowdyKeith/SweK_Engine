// FILE: simulation/DamageNumbers.js
// VERSION: v1 — round 269
//
// Floating damage indicators that pop above a world-space point and
// drift upward while fading. Useful feedback for satellite strikes,
// civ defender hits, and any other moment where the player needs to
// see "damage was applied here". DOM-based (cheap, sharp text) using
// world→screen projection from the engine camera.
//
// API:
//   const dn = new DamageNumbers({ camera, canvas });
//   dn.show(x, y, z, amount, opts);  // opts: {color, prefix, durationMs, size}
//   dn.tick(dt);                      // called from main loop
//
// Per number we maintain a DOM <div>, a remaining life, and an
// upward drift velocity. Each tick:
//   - project (x, y, z) → screen via camera matrix
//   - update div.style.left/top
//   - fade opacity as life decreases
//   - remove when life <= 0
//
// Numbers off-screen (behind camera or beyond viewport bounds) are
// hidden via display:none rather than despawned, so they reappear if
// the camera pans back. Cheap; div count is bounded by MAX_ACTIVE.

const DEFAULT_LIFE_MS = 1000;
const DEFAULT_RISE_PER_S = 1.5;     // world-units of upward drift
const MAX_ACTIVE        = 64;

export class DamageNumbers {
    constructor({ camera, canvas } = {}) {
        this.camera = camera;
        this.canvas = canvas;
        this.active = [];                  // { div, x, y, z, vy, life, lifeMax }
        this.container = null;
        this._installContainer();
    }

    _installContainer() {
        if (typeof document === "undefined") return;
        const c = document.createElement("div");
        c.id = "damage-numbers-overlay";
        Object.assign(c.style, {
            position: "fixed",
            inset: "0",
            pointerEvents: "none",
            zIndex: "8500",
            overflow: "hidden",
        });
        document.body.appendChild(c);
        this.container = c;
    }

    // Public: spawn a damage number above the given world point.
    //
    // amount   numeric value to display (will be rounded)
    // opts.color    CSS color (default "#ff7a3a" orange-red)
    // opts.prefix   optional prefix (e.g. "-" for damage, "+" for heal)
    // opts.durationMs   life duration in ms (default 1000)
    // opts.size     CSS font-size in px (default 18; bigger = more important)
    show(x, y, z, amount, opts = {}) {
        if (!this.container) return;
        if (this.active.length >= MAX_ACTIVE) {
            // Despawn the oldest to make room
            const oldest = this.active.shift();
            if (oldest?.div?.parentNode) oldest.div.remove();
        }
        const color = opts.color ?? "#ff7a3a";
        const prefix = opts.prefix ?? "-";
        const durationMs = opts.durationMs ?? DEFAULT_LIFE_MS;
        const size = opts.size ?? 18;
        const div = document.createElement("div");
        Object.assign(div.style, {
            position: "absolute",
            left: "0", top: "0",
            transform: "translate(-50%, -50%)",
            color,
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: `${size}px`,
            fontWeight: "bold",
            textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)",
            pointerEvents: "none",
            userSelect: "none",
            willChange: "transform, opacity",
            opacity: "1",
        });
        const text = (typeof amount === "number")
            ? `${prefix}${Math.round(amount * 100) / 100}`.replace(".00", "")
            : String(amount);
        div.textContent = text;
        this.container.appendChild(div);
        this.active.push({
            div, x, y: y + 1.5, z,         // start slightly above the point
            vy: DEFAULT_RISE_PER_S,
            life: durationMs / 1000,
            lifeMax: durationMs / 1000,
        });
    }

    tick(dt) {
        if (!this.active.length) return;
        const cam = this.camera;
        const mvp = cam?.getViewProjMatrix?.();
        const cw = this.canvas?.width  ?? (typeof window !== "undefined" ? window.innerWidth : 0);
        const ch = this.canvas?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0);
        for (let i = this.active.length - 1; i >= 0; i--) {
            const n = this.active[i];
            n.life -= dt;
            if (n.life <= 0) {
                n.div.remove();
                this.active.splice(i, 1);
                continue;
            }
            n.y += n.vy * dt;
            const ratio = n.life / n.lifeMax;
            n.div.style.opacity = ratio.toFixed(3);
            // Project world → NDC → screen
            if (mvp) {
                const sx = n.x, sy = n.y, sz = n.z;
                const px = mvp[0] * sx + mvp[4] * sy + mvp[8]  * sz + mvp[12];
                const py = mvp[1] * sx + mvp[5] * sy + mvp[9]  * sz + mvp[13];
                const pw = mvp[3] * sx + mvp[7] * sy + mvp[11] * sz + mvp[15];
                if (pw <= 0.001) {
                    // Behind camera — hide
                    n.div.style.display = "none";
                    continue;
                }
                const ndcX = px / pw;
                const ndcY = py / pw;
                if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) {
                    n.div.style.display = "none";
                    continue;
                }
                const screenX = (ndcX + 1) * 0.5 * cw;
                const screenY = (1 - ndcY) * 0.5 * ch;
                // CSS coords need to be relative to the OVERLAY div,
                // not the canvas. Overlay is fixed at inset:0 so we
                // can scale (canvas → window) since both share viewport.
                const winW = (typeof window !== "undefined") ? window.innerWidth  : cw;
                const winH = (typeof window !== "undefined") ? window.innerHeight : ch;
                const cssX = screenX * (winW / cw);
                const cssY = screenY * (winH / ch);
                n.div.style.display = "";
                n.div.style.transform = `translate(${cssX}px, ${cssY}px) translate(-50%, -50%)`;
            }
        }
    }

    clear() {
        for (const n of this.active) { try { n.div.remove(); } catch {} }
        this.active = [];
    }
}

export function installDamageNumbersConsoleAPI(dn) {
    if (typeof window === "undefined") return;
    window.damageNumbers = {
        show: (x, y, z, n, opts) => dn.show(x, y, z, n, opts),
        clear: () => dn.clear(),
        // Quick test — pop a number above the world origin
        test: () => dn.show(0, 10, 0, 99, { color: "#fff", prefix: "TEST " }),
    };
    console.log("[damageNumbers] try `damageNumbers.test()` or `damageNumbers.show(x, y, z, amount)`");
}
