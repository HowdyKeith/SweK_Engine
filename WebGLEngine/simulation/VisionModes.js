// =============================================================================
// FILE: /simulation/VisionModes.js
// ROUND: 235  (refactored v238 — uses CanvasFilter slot "vision")
// =============================================================================

import { CanvasFilter } from "./CanvasFilter.js";   // round 238
//
// Five vision modes that change how the player perceives the dungeon:
//
//   normal       — no overlay; default
//   night_vision — greenish-bright CSS filter (classic NVG palette)
//   flashlight   — dark vignette overlay with transparent cone center;
//                  must aim at things to see them
//   heat         — warm-hue filter + screen-space heat markers for ENEMIES
//                  (visible even through walls, fade with distance)
//   xray         — cool inverted filter + markers for ENEMIES + PICKUPS +
//                  PLATES (see all interactive entities)
//   soul_track   — no canvas filter; ghostly pulsing auras on living
//                  enemies. Less "visible" than xray — more atmospheric.
//
// Architecture:
//   • Canvas CSS filter (single string) handles the look-of-the-world
//     for night/heat/xray
//   • Flashlight uses a separate radial-gradient overlay div
//   • Heat/xray/soul_track use a "compass strip" overlay drawn at the
//     top of the screen showing entity directions relative to player
//     yaw. Each entity becomes a dot/aura/marker with horizontal
//     position = angle from forward direction. Distance attenuates
//     opacity + size.
//
// Keyboard: V cycles through modes. The mode badge in the corner shows
// the current mode + a one-line description.
//
// Console:
//   vision.set("heat")
//   vision.cycle()
//   vision.current()
// =============================================================================

const MODES = ["normal", "night_vision", "flashlight", "heat", "xray", "soul_track"];

const MODE_LABELS = {
    normal:       "NORMAL",
    night_vision: "🟢 NIGHT VISION",
    flashlight:   "🔦 FLASHLIGHT",
    heat:         "🔴 HEAT VISION",
    xray:         "🔵 X-RAY",
    soul_track:   "👻 SOUL TRACKER",
};

const MODE_FILTERS = {
    normal:       "none",
    night_vision: "hue-rotate(110deg) saturate(2.5) brightness(1.6) contrast(1.3)",
    flashlight:   "brightness(0.35) contrast(1.1)",      // darken so the cone reads
    heat:         "hue-rotate(-30deg) saturate(2.2) contrast(1.15) brightness(0.85)",
    xray:         "invert(0.4) hue-rotate(180deg) contrast(0.95) brightness(0.85) saturate(1.5)",
    soul_track:   "none",                                  // overlay-only
};

// Per-mode marker visuals on the compass strip
const MARKER_STYLE = {
    heat: {
        kinds: ["enemy"],
        color: (info, dist) => {
            // Brighter red for closer, with HP fraction tinting intensity
            const intensity = 1.0 - Math.min(0.8, dist / 30);
            const hpFrac = info.hp / info.maxHp;
            return `rgba(255, ${Math.floor(60 * hpFrac)}, ${Math.floor(40 * hpFrac)}, ${intensity})`;
        },
        size: (dist) => Math.max(6, 22 - dist * 0.5),
        symbol: "●",
    },
    xray: {
        kinds: ["enemy", "pickup", "plate"],
        color: (info, dist, kind) => {
            const a = Math.max(0.3, 1.0 - dist / 35);
            if (kind === "enemy") return `rgba(255, 110, 120, ${a})`;
            if (kind === "pickup") return `rgba(120, 255, 160, ${a})`;
            if (kind === "plate") return `rgba(255, 220, 120, ${a})`;
            return `rgba(220, 220, 220, ${a})`;
        },
        size: (dist) => Math.max(5, 18 - dist * 0.4),
        symbol: "◆",
    },
    soul_track: {
        kinds: ["enemy"],
        color: (info, dist, kind, t) => {
            // Slow pulsing alpha — ghostly aura feel
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 + dist);
            const a = Math.max(0.2, 0.85 - dist / 40) * (0.4 + 0.6 * pulse);
            return `rgba(200, 220, 255, ${a})`;
        },
        size: (dist, t) => {
            const pulse = 0.5 + 0.5 * Math.sin(t * 3 + dist * 0.3);
            return (12 - dist * 0.25) * (0.85 + 0.3 * pulse);
        },
        symbol: "✦",
    },
};

const COMPASS_HALF_FOV = Math.PI / 2;   // ±90° → full compass width
const MAX_TRACK_RANGE  = 60;             // farther entities don't render

// Round 244 — per-mode battery drain rates (fraction/sec). Normal = 0
// (no drain). Flashlight is cheapest (passive cone), heat/xray/soul are
// more expensive because they continuously project entity markers.
const BATTERY_DRAIN = {
    normal:       0,
    night_vision: 0.020,    // ~50s from full
    flashlight:   0.013,    // ~77s from full
    heat:         0.018,    // ~55s
    xray:         0.022,    // ~45s
    soul_track:   0.015,    // ~67s
};
const BATTERY_REGEN = 0.012;   // ~83s to refill from empty while in normal

export class VisionModes {
    constructor({ camera, fpsShooter, ollamaLevelGen = null } = {}) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.ollamaLevelGen = ollamaLevelGen;

        this._currentIdx = 0;
        this._badgeEl = null;
        this._compassEl = null;
        this._flashlightEl = null;
        this._keyHandler = null;
        this._startMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // Round 244 — battery for non-normal vision modes. Drains while
        // a mode is active (each mode has its own rate); regenerates
        // when in normal mode. Hits 0 → forced back to normal. Health
        // packs refill it.
        this._battery = 1.0;
        this._batteryLowToastMs = 0;

        // Install V-key handler
        if (typeof document !== "undefined") {
            this._keyHandler = (e) => {
                // Only respond if FPS is active so we don't hijack the V key elsewhere
                if (!this.fpsShooter?.active) return;
                if (e.key === "v" || e.key === "V") {
                    e.preventDefault();
                    this.cycle();
                }
            };
            document.addEventListener("keydown", this._keyHandler);
        }

        this._apply();
    }

    current()   { return MODES[this._currentIdx]; }
    cycle()     { this._currentIdx = (this._currentIdx + 1) % MODES.length; this._apply(); }
    set(name)   {
        const idx = MODES.indexOf(name);
        if (idx >= 0) { this._currentIdx = idx; this._apply(); return true; }
        return false;
    }
    listModes() { return [...MODES]; }
    getStats()  { return { current: this.current(), modes: MODES.length, battery: this._battery }; }

    // Round 244 — battery API. Health packs call refillBattery; the
    // module reads this and auto-disables modes when it hits 0.
    getBattery() { return this._battery; }
    refillBattery(amount = 0.5) {
        const before = this._battery;
        this._battery = Math.min(1.0, this._battery + amount);
        return this._battery - before;
    }

    tick(dt) {
        // Round 244 — battery drain by mode
        const mode = this.current();
        const drainRate = BATTERY_DRAIN[mode] ?? 0;
        if (drainRate > 0) {
            this._battery = Math.max(0, this._battery - drainRate * dt);
            // FP-drift clamp — long drains can leave a sub-ε residue
            // that fails the <= 0 check, leaving modes auto-off-active
            if (this._battery < 0.0005) this._battery = 0;
            // Low-battery warn at 20%, throttled every 4s
            if (this._battery < 0.20 && this._battery > 0) {
                const now = performance.now();
                if (now - this._batteryLowToastMs > 4000) {
                    this._batteryLowToastMs = now;
                    if (this.fpsShooter?.kpop?.warn) {
                        this.fpsShooter.kpop.warn("🔋 LOW", `${Math.round(this._battery*100)}% battery`).catch(()=>{});
                    }
                }
            }
            // Force back to normal when battery hits 0
            if (this._battery <= 0 && mode !== "normal") {
                this._currentIdx = 0;   // normal
                this._apply();
                if (this.fpsShooter?.kpop?.info) {
                    this.fpsShooter.kpop.info("Battery depleted", "Vision mode disabled — find a health pack").catch(()=>{});
                }
            }
        } else if (mode === "normal") {
            // Slow trickle regen while in normal mode (and not 100%)
            this._battery = Math.min(1.0, this._battery + BATTERY_REGEN * dt);
        }
        // Only animate overlays for modes that need them
        if (mode === "heat" || mode === "xray" || mode === "soul_track") {
            this._updateCompass();
        }
        // Round 244 — refresh badge so battery % updates each frame
        if (mode !== "normal") this._buildBadge();
    }

    dispose() {
        if (typeof document !== "undefined" && this._keyHandler) {
            document.removeEventListener("keydown", this._keyHandler);
        }
        this._removeAllOverlays();
    }

    // ----- Internal -----------------------------------------------------

    _apply() {
        const mode = this.current();
        // Round 238 — write through the CanvasFilter registry so the
        // day/night cycle and kaiju buff don't clobber each other.
        const filter = MODE_FILTERS[mode];
        CanvasFilter.setSlot("vision", (filter === "none" || !filter) ? null : filter);
        // Flashlight overlay
        if (mode === "flashlight") this._buildFlashlight();
        else this._removeFlashlight();
        // Compass for heat/xray/soul
        if (mode === "heat" || mode === "xray" || mode === "soul_track") {
            this._buildCompass();
        } else {
            this._removeCompass();
        }
        // Badge
        this._buildBadge();
        // Audio cue when switching (only after first tick to avoid boot blip)
        if (this.fpsShooter?.audio?.playProcedural && mode !== "normal") {
            this.fpsShooter.audio.playProcedural("fps_exit_open", 0.18);
        }
    }

    _buildBadge() {
        if (typeof document === "undefined") return;
        if (!this._badgeEl) {
            const el = document.createElement("div");
            el.id = "vision-badge";
            Object.assign(el.style, {
                position: "fixed",
                left: "50%", top: "26px",
                transform: "translateX(-50%)",
                padding: "4px 12px",
                fontFamily: "monospace",
                fontSize: "11px",
                letterSpacing: "1.5px",
                background: "rgba(8,12,20,0.78)",
                border: "1px solid #345",
                borderRadius: "3px",
                color: "#cfd",
                zIndex: "8800",
                pointerEvents: "none",
                transition: "opacity 0.3s",
            });
            document.body.appendChild(el);
            this._badgeEl = el;
        }
        const mode = this.current();
        if (mode === "normal") {
            this._badgeEl.style.opacity = "0";
            this._badgeEl.innerHTML = "";
        } else {
            this._badgeEl.style.opacity = "1";
            // Round 244 — battery indicator on the badge
            const batPct = Math.round(this._battery * 100);
            const batColor = this._battery < 0.20 ? "#f55" : this._battery < 0.5 ? "#fc6" : "#9cf";
            this._badgeEl.innerHTML =
                `<b>${MODE_LABELS[mode]}</b> ` +
                `&nbsp;<span style="color:${batColor}; font-size:10px;">🔋 ${batPct}%</span>` +
                `&nbsp;<span style="color:#789; font-size:9px;">[V cycles]</span>`;
        }
    }

    _buildFlashlight() {
        if (typeof document === "undefined") return;
        if (this._flashlightEl) return;
        const el = document.createElement("div");
        el.id = "vision-flashlight";
        Object.assign(el.style, {
            position: "fixed",
            left: "0", top: "0",
            width: "100%", height: "100%",
            background: "radial-gradient(circle at 50% 50%, transparent 12%, rgba(0,0,0,0.45) 28%, rgba(0,0,0,0.92) 70%)",
            pointerEvents: "none",
            zIndex: "8500",
        });
        document.body.appendChild(el);
        this._flashlightEl = el;
    }

    _removeFlashlight() {
        if (this._flashlightEl?.parentNode) {
            this._flashlightEl.parentNode.removeChild(this._flashlightEl);
        }
        this._flashlightEl = null;
    }

    _buildCompass() {
        if (typeof document === "undefined") return;
        if (this._compassEl) return;
        const el = document.createElement("div");
        el.id = "vision-compass";
        Object.assign(el.style, {
            position: "fixed",
            left: "50%", top: "60px",
            transform: "translateX(-50%)",
            width: "min(640px, 80vw)",
            height: "30px",
            pointerEvents: "none",
            zIndex: "8700",
            overflow: "visible",
        });
        document.body.appendChild(el);
        this._compassEl = el;
    }

    _removeCompass() {
        if (this._compassEl?.parentNode) {
            this._compassEl.parentNode.removeChild(this._compassEl);
        }
        this._compassEl = null;
    }

    _removeAllOverlays() {
        this._removeCompass();
        this._removeFlashlight();
        if (this._badgeEl?.parentNode) this._badgeEl.parentNode.removeChild(this._badgeEl);
        this._badgeEl = null;
        // Round 238 — release the vision slot so lighting/buff filters
        // still apply if those systems are running.
        CanvasFilter.setSlot("vision", null);
    }

    _updateCompass() {
        if (!this._compassEl || !this.camera?.position) return;
        const mode = this.current();
        const style = MARKER_STYLE[mode];
        if (!style) return;
        const t = ((typeof performance !== "undefined" ? performance.now() : Date.now()) - this._startMs) / 1000;
        const yaw = this.camera.yaw || 0;
        const cx = this.camera.position.x;
        const cz = this.camera.position.z;
        const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

        // Gather entities by kind
        const items = [];
        if (style.kinds.includes("enemy") && this.fpsShooter?._enemies) {
            for (const [id, info] of this.fpsShooter._enemies) {
                const pos = this.fpsShooter._getEntityPos(id);
                if (!pos) continue;
                items.push({ kind: "enemy", x: pos.x, z: pos.z, info });
            }
        }
        if (style.kinds.includes("pickup") && this.fpsShooter?._pickups) {
            for (const [id, pu] of this.fpsShooter._pickups) {
                const pos = this.fpsShooter._getEntityPos(id);
                const x = pos?.x ?? pu.x;
                const z = pos?.z ?? pu.z;
                items.push({ kind: "pickup", x, z, info: pu });
            }
        }
        if (style.kinds.includes("plate") && this.fpsShooter?._plates) {
            for (const plate of this.fpsShooter._plates) {
                if (plate.triggered) continue;
                items.push({ kind: "plate", x: plate.x, z: plate.z, info: plate });
            }
        }

        // Project each to a compass position. The compass spans ±90° from
        // the player's forward direction; entities outside that arc get
        // clipped to the edges with reduced opacity ("at your back").
        const compassWidth = this._compassEl.clientWidth || 600;
        let html = "";
        for (const it of items) {
            const dx = it.x - cx;
            const dz = it.z - cz;
            const dist = Math.hypot(dx, dz);
            if (dist > MAX_TRACK_RANGE) continue;
            // forward dist + right offset using yaw basis
            const fwdDist = dx * sinY + dz * cosY;
            const rightOff = dx * cosY - dz * sinY;
            const angle = Math.atan2(rightOff, fwdDist);   // [-π, π]
            // Map [-π/2, π/2] → [0, width]. Out-of-range = edge.
            let normAngle = angle / COMPASS_HALF_FOV;       // [-1, 1] roughly
            let edgeAlpha = 1.0;
            if (Math.abs(angle) > COMPASS_HALF_FOV) {
                // Entity is behind the player — clamp to edge with halved alpha
                normAngle = angle > 0 ? 1.0 : -1.0;
                edgeAlpha = 0.45;
            }
            const screenX = (normAngle + 1) * 0.5 * compassWidth;
            const sizePx = style.size(dist, t);
            const color = style.color(it.info, dist, it.kind, t);
            // Use text-shadow for glow effect
            html += `<span style="position:absolute; left:${screenX}px; top:${15 - sizePx/2}px; ` +
                    `font-size:${sizePx}px; line-height:1; color:${color}; ` +
                    `text-shadow:0 0 6px ${color}; opacity:${edgeAlpha}; transform:translateX(-50%);">${style.symbol}</span>`;
        }
        // Add a small center tick mark so the player knows their forward direction
        const cw = compassWidth / 2;
        html += `<span style="position:absolute; left:${cw}px; top:5px; font-size:9px; color:#789; transform:translateX(-50%);">▼</span>`;
        this._compassEl.innerHTML = html;
    }
}
