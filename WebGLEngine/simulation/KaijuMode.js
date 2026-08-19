// =============================================================================
// FILE: /simulation/KaijuMode.js
// ROUND: 237  (refactored v238 — uses CanvasFilter slot "buff")
// =============================================================================

import { CanvasFilter } from "./CanvasFilter.js";   // round 238
//
// "Become the kaiju" power-up. Collecting a kaiju pickup scales the
// PLAYER up to building-sized for ~12 seconds. The world doesn't
// change — enemies stay their normal size but appear toenail-tiny
// from way up high. Their guns still work and the bullets still
// reach you, because bullet ranges are scale-independent. So a
// careless giant CAN still get downed by a swarm of tiny soldiers.
//
// Mechanics:
//   • Camera eye height: 1.7 → 14 (8× tower)
//   • FP walk speed: 5 → 12, sprint 9 → 22 (faster strides)
//   • STOMP damage: any enemy within 4u of player center takes
//     5 HP/sec while in kaiju mode. Multi-kill on contact.
//   • Damage taken: HALVED (the giant body absorbs more)
//
// Visual layer:
//   • HUD badge with countdown
//   • Subtle screen rumble per stomp footstep
//   • Audio: low rumble loop while active (reused from existing cues)
//   • CSS canvas filter: slight saturation boost so the giant POV pops
//
// Reuses GravityWarp's lifecycle pattern (activate / deactivate / tick).
//
// API:
//   const km = new KaijuMode({ camera, fpsShooter, audio, kpop });
//   km.activate(durationSec);
//   km.deactivate();
//   km.tick(dt);
//   km.isActive();
// =============================================================================

const DEFAULT_DURATION_SEC = 12.0;
// Round 252 — cap on stacked trophy extensions. 30s = ~3 trophies
// before the meter stops growing. Generous enough for combo runs but
// not infinite.
const KAIJU_TIME_CAP_MS = 30_000;

// Scale parameters
const NORMAL_EYE_HEIGHT   = 1.7;
const KAIJU_EYE_HEIGHT    = 14.0;
const NORMAL_WALK_SPEED   = 5;
const KAIJU_WALK_SPEED    = 12;
const NORMAL_SPRINT_SPEED = 9;
const KAIJU_SPRINT_SPEED  = 22;

// Combat parameters
const STOMP_RADIUS = 4.0;          // enemies within this XZ distance take damage
const STOMP_DPS    = 5.0;          // HP per second per enemy in range
const DAMAGE_INTAKE_MULTIPLIER = 0.5;   // player takes half damage

export class KaijuMode {
    constructor({ camera, fpsShooter, audio = null, kpop = null, world = null, particles = null, canvasId = "glCanvas" } = {}) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.audio = audio;
        this.kpop = kpop;
        this.world = world;           // round 249 — for wall stomping
        this.particles = particles;   // round 249 — debris on broken walls
        this.canvasId = canvasId;

        this._active = false;
        this._remainingMs = 0;
        this._totalMs = 0;
        this._badgeEl = null;
        // Saved camera state so we can restore on deactivate
        this._saved = null;
        // FPSShooter damage multiplier slot we patch
        this._origTakeDamage = null;
        this._counters = { activations: 0, stomps: 0, voxels_broken: 0 };
        // Round 251 — camera shake state. Set by _stompWalls when voxels
        // break; decayed each tick. Jitter applied additively to camera
        // position so the underlying physics state isn't permanently
        // displaced.
        this._shakeMs = 0;
        this._shakeMag = 0;
        this._shakeAppliedDx = 0;
        this._shakeAppliedDz = 0;
    }

    isActive() { return this._active; }
    getRemainingSec() { return this._remainingMs / 1000; }
    getStats() { return { active: this._active, ...this._counters }; }

    activate(durationSec = DEFAULT_DURATION_SEC) {
        if (this._active) {
            // Round 252 — additive extension when already active. Each
            // trophy adds its full duration to the timer, capped at
            // KAIJU_TIME_CAP_MS to prevent infinite stacking. Previous
            // behavior was Math.max (non-additive) which felt punishing
            // since picking up a trophy mid-rampage was effectively a
            // no-op.
            const added = durationSec * 1000;
            this._remainingMs = Math.min(KAIJU_TIME_CAP_MS, this._remainingMs + added);
            // Update _totalMs so badge shows the new total
            this._totalMs = Math.max(this._totalMs, this._remainingMs);
            // Feedback toast
            if (this.kpop?.info) {
                this.kpop.info("⚡ KAIJU EXTENDED", `+${durationSec.toFixed(0)}s · ${(this._remainingMs/1000).toFixed(0)}s total`).catch(()=>{});
            }
            return;
        }
        if (!this.camera) return;

        // Save current camera state
        this._saved = {
            eyeHeight:  this.camera._eyeHeight,
            walkSpeed:  this.camera._fpWalkSpeed,
            sprintSpeed: this.camera._fpSprintSpeed,
        };

        // Apply kaiju scale
        this.camera._eyeHeight    = KAIJU_EYE_HEIGHT;
        this.camera._fpWalkSpeed  = KAIJU_WALK_SPEED;
        this.camera._fpSprintSpeed = KAIJU_SPRINT_SPEED;
        // Lift the player so they don't clip through the ceiling/floor
        // during the transition
        if (this.camera.position) this.camera.position.y += (KAIJU_EYE_HEIGHT - NORMAL_EYE_HEIGHT);

        // Patch FPSShooter.takeDamage to halve damage while active
        if (this.fpsShooter?.takeDamage && !this._origTakeDamage) {
            this._origTakeDamage = this.fpsShooter.takeDamage.bind(this.fpsShooter);
            this.fpsShooter.takeDamage = (amount, source) => {
                this._origTakeDamage(amount * DAMAGE_INTAKE_MULTIPLIER, source);
            };
        }

        this._active = true;
        this._totalMs = durationSec * 1000;
        this._remainingMs = this._totalMs;
        this._counters.activations++;

        // Round 238 — write the buff filter through the CanvasFilter
        // registry so it stacks with day-night lighting and vision mode
        // instead of overwriting them.
        CanvasFilter.setSlot("buff", "saturate(1.3) contrast(1.1)");
        this._buildBadge(durationSec);

        // Feedback
        if (this.audio?.playProcedural) {
            this.audio.playProcedural("fps_level_clear", 1.0);
            setTimeout(() => this.audio?.playProcedural?.("fps_exit_open", 0.5), 200);
        }
        if (this.kpop?.success) {
            this.kpop.success("⚡ KAIJU MODE", `You tower above the dungeon · ${durationSec.toFixed(0)}s`).catch(()=>{});
        }
        if (this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: "Kaiju mode engaged." }).catch(()=>{});
        }
        console.log(`[kaiju-mode] engaged · ${durationSec.toFixed(1)}s`);
    }

    deactivate() {
        if (!this._active) return;

        if (this.camera && this._saved) {
            this.camera._eyeHeight     = this._saved.eyeHeight;
            this.camera._fpWalkSpeed   = this._saved.walkSpeed;
            this.camera._fpSprintSpeed = this._saved.sprintSpeed;
            // Drop the player down to normal height. _moveFP will snap
            // to terrain next tick.
            if (this.camera.position) {
                this.camera.position.y -= (KAIJU_EYE_HEIGHT - NORMAL_EYE_HEIGHT);
            }
        }
        this._saved = null;

        // Restore FPSShooter damage path
        if (this.fpsShooter && this._origTakeDamage) {
            this.fpsShooter.takeDamage = this._origTakeDamage;
            this._origTakeDamage = null;
        }

        // Round 238 — release the buff slot. CanvasFilter recomposes
        // automatically, so lighting + vision filters stay applied.
        CanvasFilter.setSlot("buff", null);
        this._removeBadge();

        if (this.kpop?.info) this.kpop.info("Back to normal scale", "").catch(()=>{});
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_level_start", 0.4);

        console.log(`[kaiju-mode] disengaged after ${this._counters.stomps} stomp-kills`);
        this._active = false;
        this._remainingMs = 0;
    }

    tick(dt) {
        // Round 251 — revert any shake offset applied last frame BEFORE
        // doing anything else. This keeps the camera's "true" position
        // (driven by movement / physics) authoritative. Then we re-apply
        // a fresh shake offset at the end of tick.
        if (this.camera?.position && (this._shakeAppliedDx || this._shakeAppliedDz)) {
            this.camera.position.x -= this._shakeAppliedDx;
            this.camera.position.z -= this._shakeAppliedDz;
            this._shakeAppliedDx = 0;
            this._shakeAppliedDz = 0;
        }

        if (!this._active) return;
        this._remainingMs -= dt * 1000;
        if (this._remainingMs <= 0) {
            this.deactivate();
            return;
        }
        // Stomp damage: scan enemies in range each tick
        this._stompDamage(dt);
        // Round 249 — wall stomp: vaporize voxels near the giant
        // player's body each tick so walls crumble as you advance
        this._stompWalls();
        this._updateBadge();

        // Round 251 — decay + re-apply shake offset
        if (this._shakeMs > 0) {
            this._shakeMs = Math.max(0, this._shakeMs - dt * 1000);
            const frac = this._shakeMs / 250;     // 250ms full decay
            const mag = this._shakeMag * frac;
            this._shakeAppliedDx = (Math.random() - 0.5) * mag;
            this._shakeAppliedDz = (Math.random() - 0.5) * mag;
            if (this.camera?.position) {
                this.camera.position.x += this._shakeAppliedDx;
                this.camera.position.z += this._shakeAppliedDz;
            }
        }
    }

    // ----- Internal -----------------------------------------------------

    // Round 249 — clear voxels in a horizontal disc around the player
    // at chest height (eye height - 1). At kaiju scale (~7), the
    // player's body is wide; 1-voxel walls evaporate on contact, thick
    // walls take a moment of stomping to clear. Metal stays solid —
    // it's the only thing that contains the kaiju.
    //
    // The Y range scanned goes from the kaiju's FOOT level (camera.y -
    // eyeHeight) up by SCAN_HEIGHT voxels, so the kaiju body breaks
    // walls at all heights it intersects — not just at eye level. This
    // matches the intuition that a 14u-tall kaiju walking around
    // breaks walls of any height it bumps into.
    _stompWalls() {
        if (!this.world?.voxelAt || !this.world?.setVoxel || !this.camera?.position) return;
        const px = this.camera.position.x;
        const pz = this.camera.position.z;
        const eyeH = this.camera._eyeHeight ?? 14;
        const footY = this.camera.position.y - eyeH;
        const yMin  = Math.floor(footY);
        const yMax  = Math.floor(footY + 8);
        const RADIUS = 2;
        let brokenThisTick = 0;
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            for (let dz = -RADIUS; dz <= RADIUS; dz++) {
                if (Math.abs(dx) + Math.abs(dz) > RADIUS + 1) continue;
                if (dx === 0 && dz === 0) continue;
                for (let vy = yMin; vy <= yMax; vy++) {
                    const vx = Math.floor(px) + dx;
                    const vz = Math.floor(pz) + dz;
                    let v;
                    try { v = this.world.voxelAt(vx, vy, vz); } catch { continue; }
                    if (v === 0 || v === 4 /*metal*/ || v === 10 || v === 11 || v === 12) continue;
                    try { this.world.setVoxel(vx, vy, vz, 0); } catch {}
                    this._counters.voxels_broken++;
                    brokenThisTick++;
                    // Round 250/251 — rubble pile: drop RUBBLE (id 7) below if air
                    try {
                        const below = this.world.voxelAt(vx, vy - 1, vz);
                        if (below === 0) this.world.setVoxel(vx, vy - 1, vz, 7);
                    } catch {}
                    if (this.particles?.spawn && Math.random() < 0.2) {
                        this.particles.spawn({
                            x: vx + 0.5 + (Math.random() - 0.5) * 0.6,
                            y: vy + 0.5 + (Math.random() - 0.5) * 0.6,
                            z: vz + 0.5 + (Math.random() - 0.5) * 0.6,
                            vx: (Math.random() - 0.5) * 5,
                            vy: 1 + Math.random() * 3,
                            vz: (Math.random() - 0.5) * 5,
                            ttl: 0.45, size: 0.22,
                            r: 0.55, g: 0.45, b: 0.35, a: 0.85,
                            gravity: 12,
                        });
                    }
                }
            }
        }
        // Round 250 — audio rumble cue. Throttled to avoid spam.
        if (brokenThisTick > 0 && this.audio?.playProcedural) {
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (!this._lastRumbleMs || now - this._lastRumbleMs > 500) {
                this._lastRumbleMs = now;
                // Lava roar reads as deep rumble; played at lower volume.
                // Available procedural sounds vary by build; fallback to
                // generic hit if rumble isn't registered.
                try { this.audio.playProcedural("fps_kill", 0.35); } catch {}
            }
        }
        // Round 251 — camera shake on wall break. Magnitude scales with
        // how many voxels broke this tick (capped). Re-triggering keeps
        // the shake going during sustained stomping.
        if (brokenThisTick > 0) {
            this._shakeMs = 250;   // 250ms decay window
            const newMag = Math.min(0.20, 0.06 + brokenThisTick * 0.02);
            this._shakeMag = Math.max(this._shakeMag, newMag);
        }
    }

    _stompDamage(dt) {
        if (!this.fpsShooter?._enemies || !this.camera?.position) return;
        const cx = this.camera.position.x;
        const cz = this.camera.position.z;
        const damage = STOMP_DPS * dt;
        for (const [entityId, info] of this.fpsShooter._enemies) {
            if (info.invulnerable) continue;
            const pos = this.fpsShooter._getEntityPos?.(entityId);
            if (!pos) continue;
            const dx = pos.x - cx, dz = pos.z - cz;
            if (dx*dx + dz*dz <= STOMP_RADIUS * STOMP_RADIUS) {
                this.fpsShooter._damageEnemy?.(entityId, damage);
                // Track stomp-kills for stats
                if (info.hp <= 0) this._counters.stomps++;
            }
        }
    }

    _buildBadge(durationSec) {
        if (typeof document === "undefined") return;
        this._removeBadge();
        const el = document.createElement("div");
        el.id = "kaiju-mode-badge";
        Object.assign(el.style, {
            position: "fixed",
            left: "50%", top: "100px",
            transform: "translateX(-50%)",
            background: "rgba(20,12,30,0.92)",
            color: "#fe6",
            padding: "10px 22px",
            borderRadius: "22px",
            fontFamily: "monospace",
            fontSize: "13px",
            letterSpacing: "2px",
            border: "2px solid #f6c",
            boxShadow: "0 0 24px rgba(255,100,200,0.55)",
            zIndex: "8900",
            pointerEvents: "none",
        });
        el.innerHTML = `<b>⚡ KAIJU MODE</b> <span id="kaiju-mode-time" style="color:#aaa; margin-left:10px;">${durationSec.toFixed(1)}s</span>`;
        document.body.appendChild(el);
        this._badgeEl = el;
    }

    _updateBadge() {
        if (!this._badgeEl) return;
        const t = (typeof document !== "undefined") ? document.getElementById("kaiju-mode-time") : null;
        if (t) t.textContent = this.getRemainingSec().toFixed(1) + "s";
    }

    _removeBadge() {
        if (this._badgeEl?.parentNode) this._badgeEl.parentNode.removeChild(this._badgeEl);
        this._badgeEl = null;
    }
}
