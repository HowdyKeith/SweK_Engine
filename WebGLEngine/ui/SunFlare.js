// FILE: ui/SunFlare.js
// Round 48 — sun lens flare overlay.
//
// Projects the sun direction into screen-space using the camera's view
// matrix; if the sun is in front of the camera AND above the horizon,
// renders a layered glow at the sun's screen position plus 2-3 chromatic
// "ghost" discs spaced along the line from sun to screen center. Fades
// smoothly with both screen-edge proximity and horizon angle.
//
// All pure HTML/CSS — no shader work. Cheap to render.

export class SunFlare {

    constructor(opts = {}) {
        this.skyRenderer = opts.skyRenderer ?? null;
        this.camera = opts.camera ?? null;
        this.intensity = opts.intensity ?? 1.0;
        this._buildDOM();
    }

    _buildDOM() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "0", left: "0",
            width: "100%", height: "100%",
            pointerEvents: "none",
            overflow: "hidden",
            zIndex: "5",          // above world, below HUD
            mixBlendMode: "screen", // additive-ish so it doesn't kill underneath
        });

        // Main sun disc (warm, big, soft)
        const disc = document.createElement("div");
        Object.assign(disc.style, {
            position: "absolute",
            width: "180px", height: "180px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,240,180,0.85) 0%, rgba(255,200,100,0.6) 25%, rgba(255,140,40,0.25) 50%, transparent 75%)",
            transform: "translate(-50%, -50%)",
            filter: "blur(2px)",
            opacity: "0",
            transition: "opacity 0.15s",
        });
        root.appendChild(disc);

        // Horizontal streak (anamorphic flare)
        const streak = document.createElement("div");
        Object.assign(streak.style, {
            position: "absolute",
            width: "600px", height: "4px",
            background: "linear-gradient(90deg, transparent 0%, rgba(255,210,140,0.6) 35%, rgba(255,230,180,0.95) 50%, rgba(255,210,140,0.6) 65%, transparent 100%)",
            transform: "translate(-50%, -50%)",
            filter: "blur(1px)",
            opacity: "0",
            transition: "opacity 0.15s",
        });
        root.appendChild(streak);

        // Three ghost discs along the line from sun to center
        const ghosts = [];
        for (let i = 0; i < 3; i++) {
            const g = document.createElement("div");
            const sz = [40, 60, 80][i];
            const col = [
                "rgba(120,180,255,0.45)",   // cool blue
                "rgba(180,220,255,0.55)",   // light teal
                "rgba(255,200,140,0.40)",   // warm
            ][i];
            Object.assign(g.style, {
                position: "absolute",
                width: sz + "px", height: sz + "px",
                borderRadius: "50%",
                background: `radial-gradient(circle, ${col} 0%, transparent 70%)`,
                transform: "translate(-50%, -50%)",
                opacity: "0",
                transition: "opacity 0.15s",
            });
            ghosts.push(g);
            root.appendChild(g);
        }

        document.body.appendChild(root);
        this._root = root;
        this._disc = disc;
        this._streak = streak;
        this._ghosts = ghosts;
    }

    // Called once per frame from main loop.
    update() {
        if (!this.skyRenderer || !this.camera) {
            this._setOpacity(0);
            return;
        }
        // v461 — no sun disc/streak while submerged. The flare is a screen-space
        // overlay drawn on top of everything, so without this the bright sun
        // shows straight through the water.
        if (typeof window !== "undefined" && window._underwaterNow) {
            this._setOpacity(0);
            return;
        }
        const sun = this.skyRenderer.getSunDir?.();
        if (!sun || sun[1] <= 0) {
            // Below horizon — no flare
            this._setOpacity(0);
            return;
        }

        // Build view-space direction from camera yaw/pitch + sun dir
        // Camera forward in world space (matches voxelrenderer convention)
        const cy = Math.cos(this.camera.yaw),  sy = Math.sin(this.camera.yaw);
        const cp = Math.cos(this.camera.pitch), sp = Math.sin(this.camera.pitch);
        const fwd = [sy * cp, sp, -cy * cp];
        const right = [cy, 0, sy];
        const up = [-sy * sp, cp, cy * sp];

        // Project sun direction onto camera basis
        const dotFwd  = sun[0] * fwd[0]  + sun[1] * fwd[1]  + sun[2] * fwd[2];
        if (dotFwd <= 0.05) {
            // Sun behind camera or too oblique
            this._setOpacity(0);
            return;
        }
        const dotRight = sun[0] * right[0] + sun[1] * right[1] + sun[2] * right[2];
        const dotUp    = sun[0] * up[0]    + sun[1] * up[1]    + sun[2] * up[2];

        // Perspective-divide — assume FOV ~70°, aspect from window
        const fovY = 70 * Math.PI / 180;
        const tanHalf = Math.tan(fovY / 2);
        const aspect = window.innerWidth / window.innerHeight;
        // Normalized device coords (-1..+1)
        const ndcX = (dotRight / dotFwd) / (tanHalf * aspect);
        const ndcY = (dotUp    / dotFwd) /  tanHalf;

        // Screen pixels
        const W = window.innerWidth, H = window.innerHeight;
        const sunSX = (ndcX * 0.5 + 0.5) * W;
        const sunSY = (1.0 - (ndcY * 0.5 + 0.5)) * H;

        // Off-screen check w/ small margin so flare can fade in/out
        const margin = 200;
        const onScreen = sunSX > -margin && sunSX < W + margin &&
                         sunSY > -margin && sunSY < H + margin;
        if (!onScreen) {
            this._setOpacity(0);
            return;
        }

        // Intensity falls off as sun goes near horizon (warmer + dimmer)
        const horizonFade = Math.min(1, sun[1] * 1.5);   // fully visible above ~33° elev
        // Edge fade — when sun is far from screen center, flare dims
        const ndx = (sunSX - W / 2) / (W / 2);
        const ndy = (sunSY - H / 2) / (H / 2);
        const edgeDist = Math.min(1, Math.hypot(ndx, ndy) * 0.8);
        const edgeFade = 1 - edgeDist * 0.4;

        const alpha = horizonFade * edgeFade * this.intensity;

        // Position the disc + streak at sun position
        this._disc.style.left = sunSX + "px";
        this._disc.style.top  = sunSY + "px";
        this._disc.style.opacity = (alpha * 0.95).toFixed(3);

        this._streak.style.left = sunSX + "px";
        this._streak.style.top  = sunSY + "px";
        this._streak.style.opacity = (alpha * 0.65).toFixed(3);

        // Ghosts: along line from sun to center, at 33%, 66%, 100%
        const cx = W / 2, cy_ = H / 2;
        const dx = cx - sunSX, dy = cy_ - sunSY;
        for (let i = 0; i < this._ghosts.length; i++) {
            const t = (i + 1) / 4;     // 0.25, 0.5, 0.75
            const gx = sunSX + dx * 2 * t;     // mirror to other side
            const gy = sunSY + dy * 2 * t;
            const g = this._ghosts[i];
            g.style.left = gx + "px";
            g.style.top  = gy + "px";
            g.style.opacity = (alpha * (0.45 - i * 0.10)).toFixed(3);
        }
    }

    _setOpacity(a) {
        this._disc.style.opacity = a.toFixed(3);
        this._streak.style.opacity = a.toFixed(3);
        for (const g of this._ghosts) g.style.opacity = a.toFixed(3);
    }
}
