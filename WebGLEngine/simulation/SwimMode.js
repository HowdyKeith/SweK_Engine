// =============================================================================
// FILE: /simulation/SwimMode.js
// ROUND: 241
// =============================================================================
//
// Underwater swimming. Water has been part of the WAD schema since
// v223 but was purely cosmetic: walking through knee-deep water did
// nothing. This module makes water depth matter:
//
//   depth 0      → dry, no effect
//   depth 1-2    → wet (cosmetic; legacy v223 behavior preserved)
//   depth 3-4    → WADING — half walk speed, drag
//   depth 5+ AND player eye below surface → SWIMMING
//
// Swimming physics:
//   • Camera gravity goes NEGATIVE (slow buoyant rise) so you float
//   • Space = swim up (faster rise, set _fpVelY = max(_fpVelY, +6))
//   • ShiftLeft = swim down (-6)
//   • Walk speed × 0.5 (water drag)
//   • Fall damage suppressed (water cushions impact)
//
// Coupling with other systems:
//   • SpaceSuit treats submerged as if vacuum — O2 drains, asphyxiation
//     damage if O2 hits 0. The "hold your breath" loop the player feels
//     comes for free from the existing O2 mechanic.
//   • CanvasFilter "submerged" slot adds a blue tint that composes
//     under day/night lighting.
//
// On entry to swim, the camera's gravity / walk speed are saved and
// patched. On exit, they're restored. Same lifecycle pattern as
// KaijuMode (v237) and GravityWarp (v225).
//
// API:
//   const swim = new SwimMode({ camera, fpsShooter, ollamaLevelGen });
//   swim.tick(dt);
//   swim.getStatus();            // { dry|wet|wading|submerged, depth, surfaceY }
//   swim.isSubmerged();          // boolean — SpaceSuit reads this
// =============================================================================

import { CanvasFilter } from "./CanvasFilter.js";

const WADE_WALK_SPEED   = 2.5;    // half the normal 5
const SWIM_WALK_SPEED   = 3.0;    // slightly faster than wading
const SWIM_GRAVITY      = -2;     // negative = buoyant rise per tick
const SWIM_UP_VEL       =  6;     // velocity when Space held
const SWIM_DOWN_VEL     = -6;     // velocity when Shift held
const SUBMERGED_FILTER  = "hue-rotate(180deg) saturate(1.5) brightness(0.9)";

export class SwimMode {
    constructor({ camera, fpsShooter, ollamaLevelGen, kpop = null, audio = null, particles = null } = {}) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.ollamaLevelGen = ollamaLevelGen;
        this.kpop = kpop;
        this.audio = audio;
        this.particles = particles;   // round 243 — for bubbles while submerged

        this._mode = "dry";                // dry | wet | wading | submerged
        this._openWater = null;            // v1380 — { surfaceY, cx, cz, half } set by aquarium/open-sea demos
        this._saved = null;                // camera state to restore on exit
        this._lastEnterToast = 0;
        this._hudEl = null;
        this._bubbleTimer = 0;              // round 243
        this._stats = { entries: 0, swimSeconds: 0, bubbles: 0 };
    }

    isSubmerged() { return this._mode === "submerged"; }
    isWading()    { return this._mode === "wading"; }
    getMode()     { return this._mode; }
    setOpenWater(cfg) { this._openWater = (cfg && isFinite(cfg.surfaceY)) ? cfg : null; }   // v1380
    getStatus()   {
        const s = this._computeStatus();
        return { mode: this._mode, ...s };
    }
    getStats()    { return { ...this._stats, mode: this._mode }; }

    tick(dt) {
        if (!this.fpsShooter?.active) {
            // Exit cleanly if FPS deactivated while swimming
            if (this._mode === "submerged" || this._mode === "wading") this._exitWater();
            this._hideHud();
            return;
        }
        const status = this._computeStatus();
        const newMode = this._modeFor(status);

        if (newMode !== this._mode) {
            this._transition(this._mode, newMode);
            this._mode = newMode;
        }

        if (this._mode === "submerged") {
            this._applySwimPhysics(dt);
            this._emitBubbles(dt);     // round 243 — bubble trail while submerged
            this._stats.swimSeconds += dt;
        } else if (this._mode === "wading") {
            this._applyWadePhysics();
        }

        this._renderHud(status);
    }

    // ----- Internal -----------------------------------------------------

    _computeStatus() {
        // v1380 — open-water (demo) source: submerged when the eye is below the demo's
        // raised surface and inside its region. Lets swimming work in the aquarium /
        // open-sea, which raise waterField rather than being Ollama levels.
        if (this._openWater && this.camera?.position) {
            const ow = this._openWater, p = this.camera.position;
            if (Math.abs(p.x - ow.cx) <= ow.half && Math.abs(p.z - ow.cz) <= ow.half && p.y < ow.surfaceY) {
                const submergedBy = ow.surfaceY - p.y;
                return { wetDepth: Math.max(3, submergedBy), surfaceY: ow.surfaceY, submergedBy, room: null };
            }
        }
        const layout = this.ollamaLevelGen?._lastLevel;
        if (!layout?.rooms?.length || !this.camera?.position) {
            return { wetDepth: 0, surfaceY: -Infinity, room: null };
        }
        const cx = this.camera.position.x, cz = this.camera.position.z;
        const cy = this.camera.position.y;
        for (const r of layout.rooms) {
            if (cx < r.x || cx >= r.x + r.w) continue;
            if (cz < r.z || cz >= r.z + r.d) continue;
            const depth = (r.water | 0);
            if (depth === 0) return { wetDepth: 0, surfaceY: -Infinity, room: r };
            const floorY  = (r.y | 0);            // baseY usually 0, room.y is offset
            const surfaceY = floorY + depth;
            // How deep the camera EYE is below the water surface
            const submergedBy = surfaceY - cy;
            return { wetDepth: depth, surfaceY, submergedBy, room: r };
        }
        return { wetDepth: 0, surfaceY: -Infinity, room: null };
    }

    _modeFor({ wetDepth, submergedBy }) {
        if (wetDepth === 0) return "dry";
        // Eye fully submerged → swim (regardless of nominal depth, as
        // long as some water is present and the player has dipped under)
        if (submergedBy != null && submergedBy > 0 && wetDepth >= 3) return "submerged";
        if (wetDepth >= 3) return "wading";
        return "wet";   // ankle/knee — cosmetic
    }

    _transition(from, to) {
        // Entering wading or submerged from anything dryer
        const enteringWet = (to === "wading" || to === "submerged");
        const wasWet      = (from === "wading" || from === "submerged");
        if (enteringWet && !wasWet) {
            this._enterWater(to);
        }
        if (!enteringWet && wasWet) {
            this._exitWater();
        }
        // Swap mode within wet states (wading ↔ submerged) — restore
        // physics for wading, apply for submerged
        if (from === "submerged" && to === "wading") {
            this._exitSubmergedPhysics();
        }
        if (from === "wading" && to === "submerged") {
            this._enterSubmergedPhysics();
        }
    }

    _enterWater(targetMode) {
        if (!this._saved) {
            this._saved = {
                gravity:    this.camera._gravity,
                walkSpeed:  this.camera._fpWalkSpeed,
                sprintSpeed: this.camera._fpSprintSpeed,
            };
        }
        this._stats.entries++;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (now - this._lastEnterToast > 3000) {
            this._lastEnterToast = now;
            if (this.kpop?.info) {
                const msg = targetMode === "submerged"
                    ? "🌊 Submerged — hold breath"
                    : "💦 Wading — slowed by water";
                this.kpop.info(msg, "").catch(()=>{});
            }
            if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_health", 0.35);
        }
        // Wading always halves walk speed; submerged additional changes
        // applied in _enterSubmergedPhysics
        this.camera._fpWalkSpeed  = WADE_WALK_SPEED;
        this.camera._fpSprintSpeed = WADE_WALK_SPEED * 1.4;
        if (targetMode === "submerged") this._enterSubmergedPhysics();
    }

    _enterSubmergedPhysics() {
        if (!this.camera) return;
        this.camera._gravity = SWIM_GRAVITY;
        this.camera._fpWalkSpeed   = SWIM_WALK_SPEED;
        this.camera._fpSprintSpeed = SWIM_WALK_SPEED * 1.4;
        // Suppress fall-damage tracking — water cushions impact
        if (this.fpsShooter) {
            this.fpsShooter._fallStartY = null;
            this.fpsShooter._wasOnGround = true;
        }
        CanvasFilter.setSlot("submerged", SUBMERGED_FILTER);
    }

    _exitSubmergedPhysics() {
        if (!this.camera || !this._saved) return;
        this.camera._gravity = this._saved.gravity;
        // walk speed stays at wading values; restored fully in _exitWater
        CanvasFilter.setSlot("submerged", null);
    }

    _exitWater() {
        if (!this.camera || !this._saved) {
            CanvasFilter.setSlot("submerged", null);
            return;
        }
        this.camera._gravity      = this._saved.gravity;
        this.camera._fpWalkSpeed   = this._saved.walkSpeed;
        this.camera._fpSprintSpeed = this._saved.sprintSpeed;
        this._saved = null;
        CanvasFilter.setSlot("submerged", null);
    }

    _applySwimPhysics(_dt) {
        if (!this.camera) return;
        const keys = this.camera.keys;
        if (!keys?.has) return;
        // Space = swim up
        if (keys.has("Space")) {
            this.camera._fpVelY = Math.max(this.camera._fpVelY ?? 0, SWIM_UP_VEL);
            this.camera._fpOnGround = false;
        }
        // ShiftLeft = swim down (we intentionally take precedence — if
        // the player wants to descend, hold Shift even if Space jitters)
        if (keys.has("ShiftLeft")) {
            this.camera._fpVelY = Math.min(this.camera._fpVelY ?? 0, SWIM_DOWN_VEL);
            this.camera._fpOnGround = false;
        }
        // Suppress fall damage every tick — re-asserts in case
        // FPSShooter's _checkFallDamage flipped it back on
        if (this.fpsShooter) {
            this.fpsShooter._fallStartY = null;
            this.fpsShooter._wasOnGround = true;
        }
    }

    _applyWadePhysics() {
        // Wading just keeps the walk speed pinned at WADE level. No
        // gravity changes; player walks normally on the floor.
        if (!this.camera || !this._saved) return;
        // (Already set in _enterWater; nothing to do per tick.)
    }

    // Round 243 — bubble particles trailing the player while submerged.
    // ~6 bubbles/sec at random offsets near the player head, rising at
    // ~1.5 m/s with slight horizontal drift. Pale blue-white, modest TTL.
    _emitBubbles(dt) {
        if (!this.particles?.spawn || !this.camera?.position) return;
        const RATE = 6;     // bubbles per second
        this._bubbleTimer += dt;
        const interval = 1 / RATE;
        while (this._bubbleTimer >= interval) {
            this._bubbleTimer -= interval;
            const px = this.camera.position.x + (Math.random() - 0.5) * 0.4;
            const py = this.camera.position.y - 0.3 + (Math.random() - 0.5) * 0.3;
            const pz = this.camera.position.z + (Math.random() - 0.5) * 0.4;
            this.particles.spawn({
                x: px, y: py, z: pz,
                vx: (Math.random() - 0.5) * 0.5,
                vy: 1.2 + Math.random() * 0.8,    // rising
                vz: (Math.random() - 0.5) * 0.5,
                ttl: 1.4 + Math.random() * 0.8,
                size: 0.10 + Math.random() * 0.10,
                r: 0.85, g: 0.95, b: 1.0, a: 0.55,
                gravity: -0.4,                       // negative = continued rise
            });
            this._stats.bubbles++;
        }
    }

    _renderHud(status) {
        if (typeof document === "undefined") return;
        if (this._mode === "dry" || this._mode === "wet") {
            this._hideHud();
            return;
        }
        if (!this._hudEl) {
            const el = document.createElement("div");
            el.id = "swim-hud";
            Object.assign(el.style, {
                position: "fixed",
                left: "12px", bottom: "210px",
                padding: "6px 10px",
                background: "rgba(8,20,38,0.85)",
                border: "1px solid #357",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "10px",
                letterSpacing: "1px",
                color: "#cef",
                zIndex: "8640",
                pointerEvents: "none",
            });
            document.body.appendChild(el);
            this._hudEl = el;
        }
        const label = this._mode === "submerged" ? "🌊 SWIMMING" : "💦 WADING";
        const color = this._mode === "submerged" ? "#6cf" : "#9cd";
        const hint  = this._mode === "submerged" ? "[Space] up · [Shift] down" : "(slowed)";
        this._hudEl.innerHTML =
            `<div style="color:${color};"><b>${label}</b></div>` +
            `<div style="color:#789; font-size:9px;">Depth ${status.wetDepth}v · ${hint}</div>`;
    }

    _hideHud() {
        if (this._hudEl?.parentNode) {
            this._hudEl.parentNode.removeChild(this._hudEl);
        }
        this._hudEl = null;
    }
}
