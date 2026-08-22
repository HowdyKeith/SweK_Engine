// =============================================================================
// FILE: /simulation/GravityWarp.js
// ROUND: 225
// =============================================================================
//
// "Which way is down?" — a power-up that briefly redirects gravity so
// the player runs on the ceiling, a wall, or at a random tilted angle.
//
// Implementation philosophy:
//   The voxel engine's collision is built around Y-down gravity. Rather
//   than rewriting it, we run a CINEMATIC warp: the world stays in
//   normal physics, but visually we roll the canvas via a CSS transform
//   so it LOOKS like gravity rotated. During the warp:
//     • Camera._gravity is set to 0 (player floats; no falling)
//     • Player's Y is locked at the warp's chosen height
//     • WASD movement still works in XZ
//     • The canvas <element> gets a CSS rotate3d transform
//     • A timer counts down; transitions ease in/out via CSS
//
//   When the timer expires, we roll the canvas back, restore gravity,
//   and the player gently descends to the floor.
//
// Warp kinds:
//   "ceiling"     — 180° roll, player at ceiling height
//   "wall_left"   —  +90° roll
//   "wall_right"  —  -90° roll
//   "tilt"        — random 25-55° roll, gravity still down
//   "random"      — pick one of the above
//
// API:
//   const warp = new GravityWarp({ camera, fpsShooter, audio });
//   warp.activate("ceiling", 6.0);       // 6-second ceiling walk
//   warp.tick(dt);                        // called from main loop
//   warp.isActive();                      // true while warp running
// =============================================================================

const DEFAULT_DURATION_SEC = 6.0;
const FADE_MS = 600;                       // canvas roll-in / roll-out time

export class GravityWarp {
    constructor({ camera, fpsShooter, audio = null, canvasId = "glCanvas" } = {}) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.audio = audio;
        this.canvasId = canvasId;

        this._active = false;
        this._kind = null;
        this._remainingMs = 0;
        this._totalMs = 0;
        this._lockedY = 0;            // y the player is held at during warp
        this._savedGravity = null;    // restored on expire
        this._badgeEl = null;
        this._cssInjected = false;
        this._counts = { activations: 0 };
    }

    isActive() { return this._active; }
    getKind()  { return this._kind; }
    getRemainingSec() { return this._remainingMs / 1000; }
    getStats() { return { active: this._active, kind: this._kind, ...this._counts }; }

    activate(kind = "random", durationSec = DEFAULT_DURATION_SEC) {
        if (this._active) {
            // Already warping — extend instead of overlapping
            this._remainingMs = Math.max(this._remainingMs, durationSec * 1000);
            return;
        }
        if (!this.camera) return;

        if (kind === "random") {
            const choices = ["ceiling", "wall_left", "wall_right", "tilt"];
            kind = choices[Math.floor(Math.random() * choices.length)];
        }
        this._kind = kind;
        this._active = true;
        this._totalMs = durationSec * 1000;
        this._remainingMs = this._totalMs;
        this._counts.activations++;

        // Save & override gravity (except for "tilt" which keeps Y-down)
        this._savedGravity = this.camera._gravity;
        if (kind === "tilt") {
            // Tilt is purely visual; physics stays normal
            this._lockedY = null;
        } else {
            this.camera._gravity = 0;
            this.camera._fpVelY = 0;
            // Lock Y at a height appropriate for the warp surface
            this._lockedY = this._pickLockedY(kind);
            this.camera.position.y = this._lockedY;
            this.camera._fpOnGround = true;     // walk-state, not airborne
        }

        // Apply visual roll via CSS transform on the canvas
        const rollDeg = this._rollForKind(kind);
        this._applyCanvasRoll(rollDeg, true);
        this._buildBadge(kind, durationSec);

        if (this.audio?.playProcedural) {
            this.audio.playProcedural("fps_exit_open", 0.5);   // reuse sweep
        }
        console.log(`[gravity-warp] ${kind} engaged · ${durationSec.toFixed(1)}s · roll ${rollDeg}°`);
    }

    deactivate() {
        if (!this._active) return;
        this._applyCanvasRoll(0, false);
        if (this.camera && this._savedGravity != null) {
            this.camera._gravity = this._savedGravity;
        }
        // Let the player fall naturally (don't snap y) — the camera will
        // pull them down to ground via _moveFP next tick.
        if (this.camera && this._kind !== "tilt") {
            this.camera._fpOnGround = false;
            // Reset fall tracking on FPSShooter so the descent doesn't
            // dump damage on the player.
            if (this.fpsShooter) {
                this.fpsShooter._wasOnGround = false;
                this.fpsShooter._fallStartY = this.camera.position.y;
            }
        }
        this._removeBadge();
        if (this.audio?.playProcedural) {
            this.audio.playProcedural("fps_level_start", 0.35);
        }
        console.log(`[gravity-warp] ${this._kind} disengaged`);
        this._active = false;
        this._kind = null;
        this._lockedY = null;
        this._savedGravity = null;
    }

    tick(dt) {
        if (!this._active) return;
        this._remainingMs -= dt * 1000;
        if (this._remainingMs <= 0) {
            this.deactivate();
            return;
        }
        // Hold the player at the locked Y for non-tilt warps. WASD still
        // moves them in XZ — the camera's _moveFP handles horizontal
        // input each frame.
        if (this._lockedY != null && this.camera?.position) {
            this.camera.position.y = this._lockedY;
            this.camera._fpVelY = 0;
        }
        this._updateBadge();
    }

    // ----- Internal helpers ----------------------------------------------

    _rollForKind(kind) {
        switch (kind) {
            case "ceiling":    return 180;
            case "wall_left":  return 90;
            case "wall_right": return -90;
            case "tilt":       return Math.round(25 + Math.random() * 30) * (Math.random() < 0.5 ? 1 : -1);
            default:           return 0;
        }
    }

    _pickLockedY(kind) {
        const pos = this.camera.position;
        if (!pos) return 8;
        // Find the room the player is in; cap to that room's ceiling y
        const layout = this.fpsShooter?.ollamaLevelGen?._lastLevel;
        if (layout?.rooms?.length) {
            for (const r of layout.rooms) {
                if (pos.x >= r.x && pos.x < r.x + r.w &&
                    pos.z >= r.z && pos.z < r.z + r.d) {
                    // Find the baseY (origin) so we can compute ceiling
                    // height. We approximate baseY from current eye y
                    // minus eye-height (1.6) and minus the room's y offset.
                    const baseY = pos.y - 1.6 - (r.y | 0);
                    const ceilingY = baseY + (r.y | 0) + r.h;
                    if (kind === "ceiling") {
                        // Hang the player's eye 0.6u below the ceiling
                        return ceilingY - 0.6;
                    } else {
                        // Wall walks happen halfway up the room
                        return baseY + (r.y | 0) + (r.h * 0.5);
                    }
                }
            }
        }
        // Fallback: bump up 4 units from current
        return pos.y + 4;
    }

    _applyCanvasRoll(deg, easeIn) {
        if (typeof document === "undefined") return;
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) return;
        if (!this._cssInjected) {
            canvas.style.transformOrigin = "50% 50%";
            this._cssInjected = true;
        }
        canvas.style.transition = `transform ${FADE_MS}ms ease-in-out`;
        canvas.style.transform = `rotate(${deg}deg)`;
    }

    _buildBadge(kind, durationSec) {
        if (typeof document === "undefined") return;
        this._removeBadge();
        const labelMap = {
            ceiling:    "⬆ CEILING WALK",
            wall_left:  "⬅ WALL RUN (LEFT)",
            wall_right: "➡ WALL RUN (RIGHT)",
            tilt:       "↻ WORLD TILT",
        };
        const el = document.createElement("div");
        el.id = "gravity-warp-badge";
        Object.assign(el.style, {
            position: "fixed",
            left: "50%", top: "62px",
            transform: "translateX(-50%)",
            background: "rgba(20,8,32,0.92)",
            color: "#fc8",
            padding: "8px 18px",
            borderRadius: "18px",
            fontFamily: "monospace",
            fontSize: "12px",
            letterSpacing: "1px",
            border: "1px solid #c4f",
            boxShadow: "0 0 20px rgba(220,140,255,0.45)",
            zIndex: "8850",
            pointerEvents: "none",
        });
        el.innerHTML = `<span><b>${labelMap[kind] || "GRAVITY WARP"}</b></span> <span id="gravity-warp-time" style="color:#aaa; margin-left:8px;">${durationSec.toFixed(1)}s</span>`;
        document.body.appendChild(el);
        this._badgeEl = el;
    }

    _updateBadge() {
        if (!this._badgeEl) return;
        const t = document.getElementById("gravity-warp-time");
        if (t) t.textContent = this.getRemainingSec().toFixed(1) + "s";
    }

    _removeBadge() {
        if (this._badgeEl?.parentNode) this._badgeEl.parentNode.removeChild(this._badgeEl);
        this._badgeEl = null;
    }
}
