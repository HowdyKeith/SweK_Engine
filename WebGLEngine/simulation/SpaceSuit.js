// =============================================================================
// FILE: /simulation/SpaceSuit.js
// ROUND: 236
// =============================================================================
//
// Space-suit life support + jetpack mobility, layered on top of v224's
// gravity zones. Two coupled mechanics:
//
//   OXYGEN
//     • Depletes when the player is in a vacuum/thin-atmosphere room
//     • Regenerates in normal atmosphere rooms
//     • At 0%, the player takes drain damage (1.5% HP/sec)
//     • Health pickups also restore O2 (a deliberate gameplay coupling:
//       in space, a "med pack" includes oxygen)
//
//   JETPACK
//     • Hold F to thrust upward (HOLD, not toggle, so player can hover
//       precisely by tapping)
//     • Fuel drains while firing, regenerates while on the ground
//     • Particle exhaust below the player while firing
//     • When fuel runs out, gravity wins; player falls
//
// Atmosphere detection:
//   1. Explicit room.atmosphere field ("normal" | "thin" | "vacuum")
//   2. Fall back to gravity-based heuristic: gravity ≤ 0.5 → vacuum
//      (moon/space rooms are low-G by definition in v224)
//   3. Outside any room → normal (the open-world surface has air)
//
// API:
//   const suit = new SpaceSuit({ camera, fpsShooter, particles });
//   suit.tick(dt);                    // called from main loop
//   suit.getStatus();                 // { o2, fuel, atmosphere, thrusting }
//   suit.refillO2(amount);            // called by health pickups
//
// HUD: gauges rendered alongside the FPS HUD (separate element).
// =============================================================================

// Tuning constants
const O2_DEPLETE_VACUUM = 0.012;    // 1.2% / sec → 83 sec to drain from 100%
const O2_DEPLETE_THIN   = 0.004;    // 0.4% / sec → 250 sec
const O2_REGEN_NORMAL   = 0.020;    // 2% / sec → 50 sec to refill
const O2_DAMAGE_RATE    = 0.015;    // 1.5% HP / sec when O2 = 0

const FUEL_BURN_RATE    = 0.35;     // 35% / sec while thrusting → ~3s sustained
const FUEL_REGEN_RATE   = 0.20;     // 20% / sec while grounded → 5s to refill
const JETPACK_THRUST    = 11;       // m/s upward velocity (stable hover)

const EXHAUST_HZ        = 30;       // particles per second while thrusting

export class SpaceSuit {
    constructor({ camera, fpsShooter, particles, ollamaLevelGen = null, kpop = null, audio = null, swimMode = null } = {}) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.particles = particles;
        this.ollamaLevelGen = ollamaLevelGen;
        this.kpop = kpop;
        this.audio = audio;
        this.swimMode = swimMode;            // round 241 — submerged → vacuum drain

        // Suit state
        this.o2 = 1.0;                  // 0..1
        this.fuel = 1.0;                // 0..1
        this._thrusting = false;
        this._exhaustTimer = 0;
        this._lastO2Warn = 0;
        this._lastEmptyWarn = 0;
        this._hudEl = null;
        // Round 244 — O₂ regulator buff: while active, drain is halved.
        // Set via activateRegulator(seconds); decremented in tick.
        this._regulatorMs = 0;
    }

    getStatus() {
        return {
            o2: this.o2,
            fuel: this.fuel,
            atmosphere: this._currentAtmosphere(),
            thrusting: this._thrusting,
        };
    }

    refillO2(amount) {
        const before = this.o2;
        this.o2 = Math.min(1.0, this.o2 + amount);
        return this.o2 - before;
    }

    refillFuel(amount) {
        const before = this.fuel;
        this.fuel = Math.min(1.0, this.fuel + amount);
        return this.fuel - before;
    }

    // Round 244 — activate the O₂ regulator buff for N seconds. Halves
    // the drain rate while active. Stacks additively if re-collected.
    activateRegulator(seconds = 60) {
        this._regulatorMs += seconds * 1000;
        if (this.kpop?.success) {
            this.kpop.success("🟦 O₂ regulator", `Drain halved for ${Math.round(this._regulatorMs/1000)}s`).catch(()=>{});
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_pickup_health", 0.6);
    }

    isRegulatorActive() { return this._regulatorMs > 0; }
    regulatorRemainingMs() { return Math.max(0, this._regulatorMs); }

    tick(dt) {
        if (!this.fpsShooter?.active) {
            // Quietly hide the HUD when FPS isn't active
            if (this._hudEl?.parentNode) {
                this._hudEl.parentNode.removeChild(this._hudEl);
                this._hudEl = null;
            }
            return;
        }
        this._buildHud();
        const atm = this._currentAtmosphere();

        // Round 244 — regulator buff halves drain while active.
        // Clamp to 0 to prevent FP drift from leaving a sub-ms residue
        // that keeps the indicator on after the timer "expires".
        if (this._regulatorMs > 0) {
            this._regulatorMs = Math.max(0, this._regulatorMs - dt * 1000);
        }
        const drainFactor = this._regulatorMs > 0 ? 0.5 : 1.0;

        // Oxygen integration
        if (atm === "vacuum") this.o2 = Math.max(0, this.o2 - O2_DEPLETE_VACUUM * drainFactor * dt);
        else if (atm === "thin") this.o2 = Math.max(0, this.o2 - O2_DEPLETE_THIN * drainFactor * dt);
        else this.o2 = Math.min(1.0, this.o2 + O2_REGEN_NORMAL * dt);

        // Low-O2 warning at 25%, throttled to once / 5s
        if (this.o2 < 0.25 && this.o2 > 0) {
            const now = performance.now();
            if (now - this._lastO2Warn > 5000) {
                this._lastO2Warn = now;
                if (this.kpop?.warn) this.kpop.warn("⚠ LOW O₂", `${(this.o2 * 100).toFixed(0)}% remaining`).catch(()=>{});
                if (this.audio?.playProcedural) this.audio.playProcedural("fps_hit_player", 0.4);
            }
        }

        // O2 = 0 → take damage (different from lava: continuous, no buffer)
        if (this.o2 <= 0 && this.fpsShooter?.takeDamage) {
            this.fpsShooter.takeDamage(O2_DAMAGE_RATE * dt, "asphyxiation");
            const now = performance.now();
            if (now - this._lastEmptyWarn > 2000) {
                this._lastEmptyWarn = now;
                if (this.kpop?.warn) this.kpop.warn("☠ NO OXYGEN", "Find an atmosphere").catch(()=>{});
            }
        }

        // Jetpack — F held, fuel available
        const fHeld = this.camera?.keys?.has?.("KeyF");
        if (fHeld && this.fuel > 0) {
            this._thrusting = true;
            this.fuel = Math.max(0, this.fuel - FUEL_BURN_RATE * dt);
            // Override _fpVelY upward; works whether grounded or airborne
            if (this.camera) {
                this.camera._fpVelY = Math.max(this.camera._fpVelY ?? 0, JETPACK_THRUST);
                this.camera._fpOnGround = false;
            }
            this._emitExhaust(dt);
        } else {
            this._thrusting = false;
            // Regenerate fuel while on the ground (treated as "refueling
            // at a station" or "regenerating from suit power")
            if (this.camera?._fpOnGround) {
                this.fuel = Math.min(1.0, this.fuel + FUEL_REGEN_RATE * dt);
            }
        }

        this._renderHud();
    }

    // ----- Internal -----------------------------------------------------

    _currentAtmosphere() {
        // Round 241 — submersion overrides atmosphere. If the player's
        // eye is below a water surface, they need to hold their breath:
        // O2 drains at vacuum rate regardless of the room's atmosphere
        // field. Wading (feet wet but head above) does NOT drain — only
        // full submersion.
        if (this.swimMode?.isSubmerged?.()) return "vacuum";
        const layout = this.ollamaLevelGen?._lastLevel;
        if (!layout?.rooms?.length || !this.camera?.position) return "normal";
        const cx = this.camera.position.x, cz = this.camera.position.z;
        for (const r of layout.rooms) {
            if (cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.d) {
                // Explicit field wins
                if (r.atmosphere === "vacuum" || r.atmosphere === "thin" || r.atmosphere === "normal") {
                    return r.atmosphere;
                }
                // Gravity-based heuristic
                const g = typeof r.gravity === "number" ? r.gravity : 1.0;
                if (g <= 0.5) return "vacuum";
                if (g <= 0.85) return "thin";
                return "normal";
            }
        }
        return "normal";
    }

    _emitExhaust(dt) {
        if (!this.particles?.spawn || !this.camera?.position) return;
        this._exhaustTimer += dt;
        const interval = 1 / EXHAUST_HZ;
        while (this._exhaustTimer >= interval) {
            this._exhaustTimer -= interval;
            const px = this.camera.position.x;
            const py = this.camera.position.y - 1.4;     // below feet
            const pz = this.camera.position.z;
            // Two cones of exhaust: bright hot core + cooler smoke
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.25,
                y: py,
                z: pz + (Math.random() - 0.5) * 0.25,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -4 - Math.random() * 2,                // downward kick
                vz: (Math.random() - 0.5) * 1.5,
                ttl: 0.30 + Math.random() * 0.15,
                size: 0.35 + Math.random() * 0.15,
                r: 1.0, g: 0.7 + Math.random() * 0.2, b: 0.2,
                a: 0.9,
                gravity: 1.5,                                // exhaust falls (vs flame which rises)
            });
            // Smoke trail
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.4,
                y: py - 0.3,
                z: pz + (Math.random() - 0.5) * 0.4,
                vy: -1.5,
                ttl: 0.6 + Math.random() * 0.3,
                size: 0.45 + Math.random() * 0.15,
                r: 0.6, g: 0.6, b: 0.65,
                a: 0.4,
                gravity: 0.5,
            });
        }
    }

    _buildHud() {
        if (typeof document === "undefined") return;
        if (this._hudEl) return;
        const el = document.createElement("div");
        el.id = "spacesuit-hud";
        Object.assign(el.style, {
            position: "fixed",
            left: "12px", bottom: "120px",
            width: "180px",
            padding: "8px 10px",
            background: "rgba(8,14,24,0.85)",
            border: "1px solid #246",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "10px",
            letterSpacing: "1px",
            color: "#cef",
            zIndex: "8650",
            pointerEvents: "none",
        });
        document.body.appendChild(el);
        this._hudEl = el;
    }

    _renderHud() {
        if (!this._hudEl) return;
        const o2Pct  = Math.max(0, Math.min(100, Math.round(this.o2 * 100)));
        const o2Color = this.o2 < 0.25 ? "#f44" : this.o2 < 0.5 ? "#fc6" : "#4cf";
        const fuelPct = Math.max(0, Math.min(100, Math.round(this.fuel * 100)));
        const fuelColor = this.fuel < 0.15 ? "#f44" : this.fuel < 0.4 ? "#fc6" : "#f93";
        const atm = this._currentAtmosphere();
        const atmLabel = atm === "vacuum" ? "🌌 VACUUM" : atm === "thin" ? "🌑 THIN" : "🟢 AIR";
        const atmColor = atm === "vacuum" ? "#f88" : atm === "thin" ? "#fc6" : "#9f9";
        const thrustTag = this._thrusting ? ' <span style="color:#f93;">🔥</span>' : "";
        // Round 244 — regulator indicator on the O₂ line
        const regSec = Math.ceil(this._regulatorMs / 1000);
        const regTag = regSec > 0 ? ` <span style="color:#6cf;">🟦 ${regSec}s</span>` : "";

        this._hudEl.innerHTML =
            `<div style="margin-bottom:4px;"><span style="color:${atmColor};">${atmLabel}</span></div>` +
            `<div style="color:#789; font-size:9px;">O₂ ${o2Pct}%${regTag}</div>` +
            `<div style="height:6px; background:#234; border-radius:3px; margin-bottom:5px; overflow:hidden;">` +
              `<div style="width:${o2Pct}%; height:100%; background:${o2Color}; transition:width 0.2s;"></div>` +
            `</div>` +
            `<div style="color:#789; font-size:9px;">FUEL ${fuelPct}% [hold F]${thrustTag}</div>` +
            `<div style="height:6px; background:#321; border-radius:3px; overflow:hidden;">` +
              `<div style="width:${fuelPct}%; height:100%; background:${fuelColor}; transition:width 0.2s;"></div>` +
            `</div>`;
    }
}
