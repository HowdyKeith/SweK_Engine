// FILE: /simulation/FPSStamina.js
// VERSION: v1 — round 288
//
// First-person stamina + weapon-energy recharge mechanic. Lives next
// to FPSShooter — wired in via the shooter's tick() + _fire() hooks.
// Inspired by the original v200-plan "Round 31" entry that called for
// stamina-gated sprint and recharge-gated firing.
//
// STAMINA (0..100)
//   * Sprint key (Shift) drains while held + while moving.
//   * Drain rate: 25/sec sprinting, 0 idle, 0 walking
//   * Regen rate: 20/sec when not sprinting + above 30% (faster slow-
//     recovery curve over the last 30% — encourages tactical rest)
//   * At 0 stamina: sprint disabled until back above 25% (exhausted
//     state with brief audio breath cue)
//   * Sprint multiplies camera.moveSpeed by 1.65 while active.
//
// WEAPON ENERGY (0..100)
//   * Each shot costs 8 energy.
//   * Regen rate: 22/sec when not firing for >0.5s.
//   * At <8 energy: shot is GIMPED — fire cooldown 2× longer, damage
//     halved, distinct lower-pitched sfx. Lets the player "panic fire"
//     ineffectively rather than blocking input entirely.
//   * Reload is independent of this — energy and ammo are separate
//     resources. Energy = sustained-fire throttle; ammo = magazine.
//
// API:
//   const s = new FPSStamina({ camera, fpsShooter, kpop });
//   s.start();                        // mount HUD, install key listeners
//   s.stop();                         // teardown
//   s.tick(dt);                       // called from FPSShooter.tick
//   s.consumeFire() → { gimped: bool, damageMul, cooldownMul }
//                                    // called inline in FPSShooter._fire
//   s.isSprinting() / s.isExhausted()
//   s.status() → snapshot for console
//
// HUD:
//   Two thin bars below the existing health/ammo HUD, top-right.
//   Stamina = green→yellow→red gradient
//   Energy  = cyan→magenta when low

const STAMINA_MAX        = 100;
const STAMINA_DRAIN      = 25;     // /sec while sprinting + moving
const STAMINA_REGEN_HIGH = 20;     // /sec when fresh
const STAMINA_REGEN_LOW  = 12;     // /sec under 30% (slow tail)
const STAMINA_REGEN_THRESH = 30;
const EXHAUSTED_RECOVER  = 25;     // % needed to re-enable sprint after empty
const SPRINT_MULT        = 1.65;

const ENERGY_MAX         = 100;
const ENERGY_COST_SHOT   = 8;
const ENERGY_REGEN       = 22;
const ENERGY_REGEN_DELAY = 0.5;     // seconds after last fire
const GIMP_FIRE_COOLDOWN = 2.0;
const GIMP_DAMAGE_MUL    = 0.5;

export class FPSStamina {
    constructor({ camera, fpsShooter, kpop = null, audio = null }) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.kpop = kpop;
        this.audio = audio;
        this.active = false;

        this._stamina = STAMINA_MAX;
        this._energy  = ENERGY_MAX;
        this._sprintHeld = false;
        this._sprintActive = false;
        this._exhausted = false;
        this._lastFireTime = -Infinity;
        this._baseMoveSpeed = null;          // captured on start

        this._hudEl = null;
        this._stamBar = null;
        this._enerBar = null;
        this._stamLabel = null;
        this._enerLabel = null;

        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp   = this._handleKeyUp.bind(this);

        // Audio cue debouncing
        this._lastBreathMs = 0;
    }

    start() {
        if (this.active) return;
        this.active = true;
        this._stamina = STAMINA_MAX;
        this._energy  = ENERGY_MAX;
        this._baseMoveSpeed = this.camera?.moveSpeed ?? 8;
        window.addEventListener("keydown", this._onKeyDown);
        window.addEventListener("keyup",   this._onKeyUp);
        this._ensureHud();
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup",   this._onKeyUp);
        if (this._baseMoveSpeed != null && this.camera) {
            this.camera.moveSpeed = this._baseMoveSpeed;
        }
        if (this._hudEl) { this._hudEl.remove(); this._hudEl = null; }
        this._stamBar = this._enerBar = this._stamLabel = this._enerLabel = null;
    }

    // -----------------------------------------------------------------
    // Per-frame tick
    // -----------------------------------------------------------------
    tick(dt) {
        if (!this.active) return;
        this._updateStamina(dt);
        this._updateEnergy(dt);
        this._applySpeed();
        this._refreshHud();
    }

    _updateStamina(dt) {
        // Determine if we're actually moving — only drain when sprinting
        // AND there's WASD input or the camera is in motion. We can't
        // see raw input from here, so use velocity heuristic.
        const isMoving = this._isPlayerMoving();
        const wantSprint = this._sprintHeld && isMoving && !this._exhausted;
        if (wantSprint) {
            this._sprintActive = true;
            this._stamina -= STAMINA_DRAIN * dt;
            if (this._stamina <= 0) {
                this._stamina = 0;
                this._exhausted = true;
                this._sprintActive = false;
                this._breath();
                try { this.kpop?.warn?.("EXHAUSTED", "Catch your breath"); } catch {}
            }
        } else {
            this._sprintActive = false;
            // Regen
            const regenRate = this._stamina < STAMINA_REGEN_THRESH ? STAMINA_REGEN_LOW : STAMINA_REGEN_HIGH;
            this._stamina = Math.min(STAMINA_MAX, this._stamina + regenRate * dt);
            // Recovery threshold to re-enable sprint
            if (this._exhausted && this._stamina >= EXHAUSTED_RECOVER) {
                this._exhausted = false;
            }
        }
    }

    _updateEnergy(dt) {
        const since = (performance.now() / 1000) - this._lastFireTime;
        if (since > ENERGY_REGEN_DELAY) {
            this._energy = Math.min(ENERGY_MAX, this._energy + ENERGY_REGEN * dt);
        }
    }

    _applySpeed() {
        if (!this.camera) return;
        const base = this._baseMoveSpeed ?? this.camera.moveSpeed;
        this.camera.moveSpeed = this._sprintActive ? base * SPRINT_MULT : base;
    }

    _isPlayerMoving() {
        // Use camera velocity if exposed; else fall back to "always
        // moving" — that's fine, stamina just drains while shift held
        // which is the most common interpretation anyway.
        const v = this.camera?.velocity;
        if (!v) return true;
        return Math.abs(v.x ?? 0) > 0.01 || Math.abs(v.z ?? 0) > 0.01;
    }

    _breath() {
        const now = performance.now();
        if (now - this._lastBreathMs < 5000) return;
        this._lastBreathMs = now;
        // Brief exhausted breath via audio if available; otherwise
        // silent — the HUD bar + toast already signal it.
        try {
            this.audio?.playSimpleTone?.({ freq: 180, duration: 0.5, kind: "sine", volume: 0.18 });
        } catch {}
    }

    // -----------------------------------------------------------------
    // Hook: called from FPSShooter._fire to gate the shot. Returns the
    // damage and cooldown multipliers to apply.
    // -----------------------------------------------------------------
    consumeFire() {
        if (!this.active) {
            return { gimped: false, damageMul: 1, cooldownMul: 1 };
        }
        this._lastFireTime = performance.now() / 1000;
        if (this._energy < ENERGY_COST_SHOT) {
            // GIMPED — fire happens but at reduced effect
            return { gimped: true, damageMul: GIMP_DAMAGE_MUL, cooldownMul: GIMP_FIRE_COOLDOWN };
        }
        this._energy -= ENERGY_COST_SHOT;
        return { gimped: false, damageMul: 1, cooldownMul: 1 };
    }

    isSprinting() { return this._sprintActive; }
    isExhausted() { return this._exhausted; }
    status() {
        return {
            active: this.active,
            stamina: Math.round(this._stamina),
            energy:  Math.round(this._energy),
            sprinting: this._sprintActive,
            exhausted: this._exhausted,
        };
    }

    // -----------------------------------------------------------------
    // Input
    // -----------------------------------------------------------------
    _handleKeyDown(e) {
        // Two-key bindings: Shift left OR right
        if (e.key === "Shift") {
            this._sprintHeld = true;
        }
    }
    _handleKeyUp(e) {
        if (e.key === "Shift") {
            this._sprintHeld = false;
        }
    }

    // -----------------------------------------------------------------
    // HUD
    // -----------------------------------------------------------------
    _ensureHud() {
        if (this._hudEl) return;
        const el = document.createElement("div");
        el.className = "fps-stamina-hud";
        el.style.cssText = [
            "position:fixed",
            "top:130px",
            "right:16px",
            "z-index:7400",
            "background:rgba(8, 12, 20, 0.85)",
            "border:1px solid #345",
            "border-radius:5px",
            "padding:6px 10px",
            "font:10px monospace",
            "color:#9ef",
            "min-width:180px",
            "box-shadow:0 2px 8px rgba(0,0,0,0.4)",
        ].join(";");
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <div class="fss-stam-label" style="width:32px; color:#9eb;">STM</div>
                <div style="flex:1; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                    <div class="fss-stam-bar" style="width:100%; height:100%; background:#5e5; transition:width 0.1s, background-color 0.3s;"></div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; margin-top:3px;">
                <div class="fss-ener-label" style="width:32px; color:#9bf;">NRG</div>
                <div style="flex:1; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                    <div class="fss-ener-bar" style="width:100%; height:100%; background:#5be; transition:width 0.1s, background-color 0.3s;"></div>
                </div>
            </div>
            <div style="margin-top:3px; font-size:9px; color:#789; text-align:right;">
                <span class="fss-hint">SHIFT to sprint</span>
            </div>
        `;
        document.body.appendChild(el);
        this._hudEl = el;
        this._stamBar  = el.querySelector(".fss-stam-bar");
        this._enerBar  = el.querySelector(".fss-ener-bar");
        this._stamLabel = el.querySelector(".fss-stam-label");
        this._enerLabel = el.querySelector(".fss-ener-label");
        this._hintEl   = el.querySelector(".fss-hint");
    }

    _refreshHud() {
        if (!this._hudEl) return;
        // Stamina bar: green → yellow → red
        if (this._stamBar) {
            const p = this._stamina / STAMINA_MAX;
            this._stamBar.style.width = (p * 100).toFixed(1) + "%";
            const color = this._exhausted ? "#f55" :
                          p > 0.5 ? "#5e5" :
                          p > 0.25 ? "#fc5" : "#f55";
            this._stamBar.style.background = color;
        }
        // Energy bar: cyan → magenta on low
        if (this._enerBar) {
            const p = this._energy / ENERGY_MAX;
            this._enerBar.style.width = (p * 100).toFixed(1) + "%";
            this._enerBar.style.background = p < (ENERGY_COST_SHOT / ENERGY_MAX) ? "#e5a" : "#5be";
        }
        if (this._hintEl) {
            if (this._exhausted)        this._hintEl.textContent = "💨 EXHAUSTED";
            else if (this._sprintActive) this._hintEl.textContent = "→ sprinting";
            else                         this._hintEl.textContent = "SHIFT to sprint";
        }
    }
}
