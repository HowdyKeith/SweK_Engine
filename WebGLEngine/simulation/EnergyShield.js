// FILE: simulation/EnergyShield.js
// Round 42 — held defensive ability. Press+hold C in FP mode → shield
// drains energy at DRAIN_RATE/sec. While active, kaiju ranged damage
// is reduced by ABSORPTION (80%). Auto-disables when energy below
// MIN_ENERGY. Visible via cockpit indicator.
//
// PlayerEnergy.applyDamage reads window._energyShield to apply absorb.

const DRAIN_RATE  = 4.0;      // energy/sec while held
const MIN_ENERGY  = 5.0;      // below this, can't sustain
const ABSORPTION  = 0.80;     // 80% damage reduction while up

export class EnergyShield {

    constructor(opts = {}) {
        this.playerEnergy = opts.playerEnergy ?? null;
        this.active = false;
        this._wantActive = false;     // user is holding the button
    }

    setHeld(held) {
        this._wantActive = !!held;
        // Immediate toggle attempt — actual state updates in tick
        if (!held) this.active = false;
    }

    tick(dt) {
        const pe = this.playerEnergy;
        if (!pe) { this.active = false; return; }

        if (this._wantActive && pe.current >= MIN_ENERGY) {
            // Drain — sustain shield
            pe.current = Math.max(0, pe.current - DRAIN_RATE * dt);
            this.active = true;
            if (pe.current < MIN_ENERGY) {
                this.active = false;     // wink out at threshold
            }
        } else {
            this.active = false;
        }
    }

    // Called from PlayerEnergy.applyDamage. Returns the reduced amount.
    absorb(damage) {
        if (!this.active) return damage;
        return damage * (1 - ABSORPTION);
    }

    snapshot() {
        return { active: this.active, want: this._wantActive };
    }
}
