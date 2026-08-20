// FILE: render/ThrowCinematic.js
// VERSION: v1 — round 280
//
// Spectacle camera for kaiju tree hurls. When enabled, the camera
// briefly leaves its normal mode (observer / fp / etc) and follows the
// projectile through the air with a trailing chase angle — like the
// "money shot" angle a director would pick for a hero throw. Restores
// the original camera state after impact or after the cinematic times
// out.
//
// Design constraints:
//   - OPT-IN. Off by default. Tree throws happen frequently in big
//     kaiju battles and constant camera takeover would be terrible.
//   - COOLDOWN. Even when enabled, throttle to one cinematic per
//     COOLDOWN_MS so a king-kaiju spamming throws doesn't trap the
//     player in a slideshow.
//   - SAFE RESTORE. Track and restore mode + position + yaw + pitch
//     so the cinematic feels like an interlude, not a teleport.
//   - HARMLESS WHEN MISSING. If the camera doesn't support
//     missile_cam mode (older builds), no-op cleanly.
//
// Wired up by KaijuManager._handleThrow — after the projectile is
// launched, this module receives the projectile reference and (if
// enabled and off-cooldown) takes over the camera. Each engine frame
// the module's tick() is called; it positions the camera behind +
// above the projectile and yaws/pitches it toward the velocity vector.
// When the projectile despawns or our TTL hits, restore + reset.

const COOLDOWN_MS  = 10 * 1000;     // one cinematic per ten seconds
const TTL_S        = 3.2;            // hard cap — flight time + 0.4s tail

export class ThrowCinematic {
    constructor({ camera }) {
        this.camera     = camera;
        this.enabled    = false;
        this._active    = false;
        this._projectile = null;
        this._savedMode  = null;
        this._savedPos   = null;
        this._savedYaw   = 0;
        this._savedPitch = 0;
        this._ttlS       = 0;
        this._lastFiredAt = 0;
    }

    enable()  { this.enabled = true;  console.log("[ThrowCinematic] enabled — kaiju throws will take the camera on a ride"); }
    disable() { this.enabled = false; this._abort(); console.log("[ThrowCinematic] disabled"); }
    toggle()  { this.enabled ? this.disable() : this.enable(); return this.enabled; }

    // Called by KaijuManager._handleThrow after launching a projectile.
    // Returns true if the cinematic actually engaged; false if disabled
    // / on cooldown / camera unsupported.
    onThrow(projectile) {
        if (!this.enabled || !projectile || !this.camera) return false;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (now - this._lastFiredAt < COOLDOWN_MS) return false;
        if (this._active) return false;       // already running one
        // Camera support check — needs to allow being overridden. The
        // engine's camera has a `mode` field; if it has missile_cam in
        // its allowed set we know it gates input on mode.
        const camMode = this.camera.mode;
        if (camMode === "missile_cam") return false;   // FPS missile is in the air; don't fight it
        // Save state
        this._savedMode  = camMode;
        this._savedPos   = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
        this._savedYaw   = this.camera.yaw   ?? 0;
        this._savedPitch = this.camera.pitch ?? 0;
        // Re-use the missile_cam mode flag — it already gates player
        // input + main-loop overrides. KaijuManager / our tick own the
        // position writes.
        this.camera.mode = "missile_cam";
        this._projectile = projectile;
        this._ttlS       = TTL_S;
        this._active     = true;
        this._lastFiredAt = now;
        return true;
    }

    tick(dt) {
        if (!this._active) return;
        const p = this._projectile;
        // Projectile gone → land cleanly.
        if (!p || !p.position || p._destroyed) { this._abort(); return; }
        this._ttlS -= dt;
        if (this._ttlS <= 0) { this._abort(); return; }
        // Chase rig: camera sits 8u behind, 4u above the projectile
        // along its velocity vector. Pitch slightly downward so the
        // arc is readable.
        const speed = Math.hypot(p.velocity?.vx ?? p.vx ?? 0, p.velocity?.vy ?? p.vy ?? 0, p.velocity?.vz ?? p.vz ?? 0) || 1;
        const vx = (p.velocity?.vx ?? p.vx ?? 0) / speed;
        const vy = (p.velocity?.vy ?? p.vy ?? 0) / speed;
        const vz = (p.velocity?.vz ?? p.vz ?? 0) / speed;
        // Camera world pos: back along -v, up by 4
        this.camera.position.x = p.position.x - vx * 8;
        this.camera.position.y = p.position.y - vy * 8 + 4;
        this.camera.position.z = p.position.z - vz * 8;
        // Yaw = atan2(vx, vz); pitch = -atan2(vy, horiz)
        this.camera.yaw   = Math.atan2(vx, vz);
        const horiz = Math.hypot(vx, vz);
        this.camera.pitch = -Math.atan2(vy, horiz) - 0.15;     // slight tip-down
    }

    _abort() {
        if (!this._active) return;
        this._active = false;
        if (this.camera && this._savedPos) {
            this.camera.mode = this._savedMode ?? "observer";
            this.camera.position.x = this._savedPos.x;
            this.camera.position.y = this._savedPos.y;
            this.camera.position.z = this._savedPos.z;
            this.camera.yaw   = this._savedYaw;
            this.camera.pitch = this._savedPitch;
        }
        this._projectile = null;
        this._savedMode  = null;
        this._savedPos   = null;
        this._ttlS       = 0;
    }
}
