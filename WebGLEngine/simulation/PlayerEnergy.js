// FILE: simulation/PlayerEnergy.js
// VERSION: v1
//
// Round 31 — first-person player agent has a single energy bar that
// gates carve (left/right click in FP), fire bolt (E key), and sprint
// (Shift). Bar recharges over time when not actively spending. When
// fully spent there's a brief lockout (0.5s) before recharge resumes —
// prevents tap-spam at zero.

export class PlayerEnergy {
    constructor(opts = {}) {
        this.max = opts.max ?? 100;
        this.current = this.max;
        this.rechargeRate = opts.rechargeRate ?? 10;       // per second
        this.spendCarve = opts.spendCarve ?? 5;
        this.spendBolt  = opts.spendBolt  ?? 25;
        this.spendSprintPerSec = opts.spendSprintPerSec ?? 8;

        this._sprintActive = false;
        this._cooldownLockout = 0;        // seconds remaining before recharge resumes
        this._lastDeniedAt = 0;            // timestamp of most recent denied action (for HUD flash)
        this._flashUntil = 0;
    }

    tick(delta) {
        if (this._sprintActive) {
            this.current -= this.spendSprintPerSec * delta;
            if (this.current <= 0) {
                this.current = 0;
                this._sprintActive = false;
                this._cooldownLockout = 0.5;
            }
            return;     // sprint and recharge are mutually exclusive
        }
        if (this._cooldownLockout > 0) {
            this._cooldownLockout -= delta;
            if (this._cooldownLockout < 0) this._cooldownLockout = 0;
        } else if (this.current < this.max) {
            this.current = Math.min(this.max, this.current + this.rechargeRate * delta);
        }
    }

    canCarve()  { return this.current >= this.spendCarve  && this._cooldownLockout <= 0; }
    canBolt()   { return this.current >= this.spendBolt   && this._cooldownLockout <= 0; }
    canSprint() { return this.current >= 1                && this._cooldownLockout <= 0; }

    // Try to spend; returns true on success, false if insufficient.
    // On failure flashes the HUD bar red briefly.
    tryCarve() {
        if (!this.canCarve()) { this._deny(); return false; }
        this.current -= this.spendCarve;
        return true;
    }
    tryBolt() {
        if (!this.canBolt()) { this._deny(); return false; }
        this.current -= this.spendBolt;
        return true;
    }

    setSprinting(active) {
        if (active && !this.canSprint()) {
            this._sprintActive = false;
            return false;
        }
        this._sprintActive = active;
        return active;
    }

    // Round 39 — incoming damage drains the energy bar. If it crashes
    // to zero, brief lockout same as overspend (prevents bolt-spam at
    // zero). Flashes red.
    // Round 42 — shield absorption + screen-shake hook. If a global
    // window._energyShield is active, damage is reduced 80%. Hook a
    // shake handler via setShakeHandler so cockpit can flinch.
    applyDamage(amount) {
        let actual = amount;
        const shield = (typeof window !== "undefined") ? window._energyShield : null;
        if (shield?.absorb) actual = shield.absorb(actual);
        this.current = Math.max(0, this.current - actual);
        this._deny();    // flash red bar
        if (this.current <= 0) this._cooldownLockout = 0.5;
        if (this._onShake) this._onShake(actual);
        // Round 270b — full-screen red-rim flash on actual damage
        // (not denial). Intensity scales with how much got through
        // (0..1 of max). Matches the mech cockpit's existing damage-
        // flash language.
        if (typeof window !== "undefined" && window._damageFlash?.flash && actual > 0) {
            window._damageFlash.flash(Math.min(1.0, actual / Math.max(1, this.max)));
        }
    }

    setShakeHandler(fn) { this._onShake = fn; }

    // Round 42 — bounty spending raises max energy. Cap at HARD_MAX so
    // upgrade can't unbound. Current energy keeps below new max.
    raiseMax(amount, hardMax = 200) {
        this.max = Math.min(hardMax, this.max + amount);
        this.current = Math.min(this.current, this.max);
    }

    refill() {
        this.current = this.max;
        this._cooldownLockout = 0;
    }

    _deny() {
        this._lastDeniedAt = performance.now();
        this._flashUntil   = this._lastDeniedAt + 350;
    }

    // For HUD — true when the bar should pulse red briefly
    isFlashing() {
        return performance.now() < this._flashUntil;
    }

    fraction() {
        return this.current / this.max;
    }
}
