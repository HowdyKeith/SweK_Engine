// FILE: simulation/EjectSequence.js
// Round 40 — emergency eject + nuclear self-destruct of mech.
//
// Stage machine:
//   idle → warning (0.8s) → t3 → t2 → t1 (1.0s each) → BLAST → flight (4s) → done
//
// During warning + t3/t2/t1 the player CAN'T abort and CAN'T move — locked.
// At BLAST: massive AoE damage to all kaiju within BLAST_RADIUS. King kaiju
// take only HALF damage and survive ("ate the nuclear fire"). Particles +
// screen shake + audio sting.
// During flight: camera forcibly moves up at high velocity, locked input.
// At done: camera switches to observer mode at apex.

// Round 321 — shared easing module.
import { easeOutCubic } from "./easing.js";

const STAGES = ["idle", "warning", "t3", "t2", "t1", "blast", "flight", "done"];

const STAGE_DURATIONS = {
    warning: 0.8,
    t3:      1.0,
    t2:      1.0,
    t1:      1.0,
    blast:   0.8,         // brief — particles handle the visual
    flight:  4.0,
};

const BLAST_RADIUS = 35;

export class EjectSequence {

    constructor(opts) {
        this.camera        = opts.camera;
        this.cockpit       = opts.cockpit;
        this.kaijuManager  = opts.kaijuManager;
        this.particles     = opts.particles;
        this.audio         = opts.audioManager ?? null;
        this.eventBus      = opts.eventBus ?? null;
        this.onComplete    = opts.onComplete ?? (() => {});

        this.stage = "idle";
        this._stageT = 0;
        this._launchOrigin = null;
        this._launchTargetY = 0;
    }

    isActive() { return this.stage !== "idle" && this.stage !== "done"; }

    // Round 42 — auto-eject monitor. Call from main loop with current
    // energy + mode. When energy = 0 in FP mode, start a 5s countdown.
    // If energy recovers > 30 during countdown, abort. At 0 → trigger.
    monitorAutoEject(dt, opts) {
        const { energy, mode } = opts;
        if (this.isActive()) {
            this._autoEjectTimer = 0;       // active sequence preempts the auto monitor
            return;
        }
        if (mode !== "fp") {
            this._autoEjectTimer = 0;
            this._autoEjectActive = false;
            return;
        }
        if (energy <= 0 && !this._autoEjectActive) {
            this._autoEjectActive = true;
            this._autoEjectTimer = 5.0;
            console.warn("[Eject] REACTOR CRITICAL — auto-eject in 5s (recover energy to abort)");
        }
        if (this._autoEjectActive) {
            if (energy > 30) {
                this._autoEjectActive = false;
                this._autoEjectTimer = 0;
                console.log("[Eject] reactor recovered — auto-eject aborted");
                return;
            }
            this._autoEjectTimer -= dt;
            if (this._autoEjectTimer <= 0) {
                this._autoEjectActive = false;
                this.trigger();
            }
        }
    }

    autoEjectStatus() {
        if (!this._autoEjectActive) return null;
        return { remaining: Math.max(0, this._autoEjectTimer) };
    }

    // Trigger from main.js. No-op if already active.
    trigger() {
        if (this.isActive()) return false;
        if (this.camera.mode !== "fp") {
            console.warn("[EjectSequence] only triggerable from FP mode");
            return false;
        }
        this.stage = "warning";
        this._stageT = 0;
        this._launchOrigin = { ...this.camera.position };
        this._launchTargetY = this._launchOrigin.y + 80;     // 80u upward over flight
        this.cockpit?.showOverlay("");
        if (this.audio?.triggerDanger) this.audio.triggerDanger(2);
        if (this.eventBus?.publish) {
            this.eventBus.publish({ type: "mech_eject_armed",
                x: this._launchOrigin.x, y: this._launchOrigin.y, z: this._launchOrigin.z });
        }
        console.log("[Eject] sequence ARMED");
        return true;
    }

    // Called from main loop once per frame. Returns true if camera input
    // should be locked this frame.
    tick(dt) {
        if (this.stage === "idle" || this.stage === "done") return false;

        this._stageT += dt;
        const dur = STAGE_DURATIONS[this.stage] ?? 1.0;

        // Stage-specific overlay text
        if (this.stage === "warning") {
            this.cockpit?.showOverlay("");      // warningTxt + subTxt are in overlay; clear countdown
        } else if (this.stage === "t3") {
            this.cockpit?.showOverlay("3");
        } else if (this.stage === "t2") {
            this.cockpit?.showOverlay("2");
        } else if (this.stage === "t1") {
            this.cockpit?.showOverlay("1");
        } else if (this.stage === "blast") {
            this.cockpit?.showOverlay("0");
            this.cockpit?.hide();              // mech disintegrates — cockpit gone
            this.cockpit?.showCoffin();         // wrap player in coffin window vignette
        } else if (this.stage === "flight") {
            // Camera forcibly rises toward _launchTargetY over the flight duration
            const f = Math.min(1, this._stageT / dur);
            const ease = easeOutCubic(f);
            const newY = this._launchOrigin.y + (this._launchTargetY - this._launchOrigin.y) * ease;
            this.camera.position.y = newY;
            // Slight rotation pitch downward so player can see the blast site
            if (this.camera.pitch !== undefined) {
                this.camera.pitch = -0.5 - 0.3 * f;       // tilt to look down
            }
        }

        // Stage transitions
        if (this._stageT >= dur) {
            this._stageT = 0;
            const i = STAGES.indexOf(this.stage);
            if (this.stage === "t1") {
                this._detonate();
                this.stage = "blast";
            } else if (this.stage === "blast") {
                this.stage = "flight";
            } else if (this.stage === "flight") {
                this.stage = "done";
                this.cockpit?.hideOverlay();
                this.cockpit?.hideCoffin();
                this.camera.setMode?.("observer");
                this.onComplete();
                console.log("[Eject] sequence complete — observer mode");
            } else {
                this.stage = STAGES[i + 1];
            }
        }
        return true;     // input locked while active
    }

    _detonate() {
        const ox = this._launchOrigin.x;
        const oy = this._launchOrigin.y - 1.7;     // mech body center, below eye height
        const oz = this._launchOrigin.z;

        // Damage all kaiju in radius. Kings survive at half damage; others die.
        let killed = 0, survived = 0;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - ox;
                const dy = k.position.y - oy;
                const dz = k.position.z - oz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > BLAST_RADIUS) continue;
                // Falloff: linear from 1.0 at zero distance to 0.4 at edge
                const falloff = 1.0 - 0.6 * (dist / BLAST_RADIUS);
                if (k.becameKing) {
                    // Tough — eat half the fire
                    k.energy = Math.max(0, (k.energy ?? 1) - 0.5 * falloff);
                    survived++;
                } else {
                    k.energy = 0;     // instant kill
                    killed++;
                }
            }
        }

        // Particle burst — 220 particles, mixed sprites
        if (this.particles?.spawn) {
            // Inner fireball — bright orange/red expanding sphere
            for (let i = 0; i < 120; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const speed = 22 + Math.random() * 14;
                const vx = Math.sin(phi) * Math.cos(theta) * speed;
                const vy = Math.cos(phi) * speed;
                const vz = Math.sin(phi) * Math.sin(theta) * speed;
                this.particles.spawn({
                    x: ox, y: oy, z: oz,
                    vx, vy, vz,
                    ttl: 1.6 + Math.random() * 0.6,
                    size: 1.2 + Math.random() * 0.8,
                    r: 1.0, g: 0.5 + Math.random() * 0.4, b: 0.1,
                    a: 1.0, gravity: -2,
                    sprite: 4,    // EMBER
                });
            }
            // Outer smoke ring — white/gray expanding outward
            for (let i = 0; i < 60; i++) {
                const angle = (i / 60) * Math.PI * 2;
                const speed = 18 + Math.random() * 6;
                this.particles.spawn({
                    x: ox, y: oy + 1, z: oz,
                    vx: Math.cos(angle) * speed,
                    vy: 1 + Math.random() * 4,
                    vz: Math.sin(angle) * speed,
                    ttl: 2.5,
                    size: 2.0,
                    r: 0.95, g: 0.95, b: 0.95, a: 0.85,
                    gravity: -1.5,
                    sprite: 1,    // SMOKE
                });
            }
            // Mushroom column — thick rising smoke straight up
            for (let i = 0; i < 40; i++) {
                this.particles.spawn({
                    x: ox + (Math.random() - 0.5) * 4,
                    y: oy + Math.random() * 8,
                    z: oz + (Math.random() - 0.5) * 4,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: 8 + Math.random() * 6,
                    vz: (Math.random() - 0.5) * 1.5,
                    ttl: 4.0,
                    size: 2.4,
                    r: 0.7, g: 0.7, b: 0.7, a: 0.85,
                    gravity: -0.3,
                    sprite: 1,
                });
            }
        }

        if (this.audio?.audio?.triggerDanger) {
            this.audio.audio.triggerDanger(2);     // boom-style sting
        }
        if (this.eventBus?.publish) {
            this.eventBus.publish({
                type: "mech_detonate",
                x: ox, y: oy, z: oz,
                killed, survived,
            });
        }
        console.log(`[Eject] DETONATION at (${ox.toFixed(1)},${oy.toFixed(1)},${oz.toFixed(1)}) — killed ${killed} kaiju, ${survived} kings survived`);
    }
}
