// =============================================================================
// FILE: /simulation/FPSAutopilot.js
// ROUND: 221
// =============================================================================
//
// Autoplay controller for the FPS shooter. Sits between the camera and
// the player input system: each tick it decides where to go, what to
// shoot, and whether to step into the exit. Disengages the moment the
// real user presses any FPS-relevant control.
//
// Camera control strategy:
//   The FP camera (camera.js _moveFP) reads from this.keys, a Set of
//   KeyboardEvent.code strings ("KeyW", "KeyA", etc.). The autopilot
//   adds/removes those codes each tick. The camera's own collision,
//   gravity, sprint, and jump logic all run unmodified — autopilot
//   just simulates the keyboard.
//
//   Yaw is steered directly (camera.yaw = atan2(dx, dz)) because no
//   "look toward" abstraction exists in the camera. Pitch is held
//   roughly level (-0.05) so the aim stays on enemy chests.
//
// Target selection priority (re-evaluated each tick):
//   1. Closest enemy in sight range — fire if centered in cone
//   2. Health pickup if HP < 50%
//   3. Ammo pickup if ammo < 10
//   4. Open exit portal (after level clear)
//   5. Patrol — random point in the active room
//
// Disengagement:
//   • Any KeyboardEvent on FPS keys (W/A/S/D/Space/R/Shift)
//   • Any mousedown
//   • Calling .disengage() / window.fps.stopAutoplay()
//
// API:
//   const auto = new FPSAutopilot({ camera, fpsShooter, botManager, world, audio });
//   auto.engage();
//   auto.tick(dt);    // called from main render loop
//   auto.disengage();
// =============================================================================

const FIRE_CONE_RAD = 0.18;       // ~10° — fairly forgiving aim
const STOP_DISTANCE = 4.0;        // stop when within this many u of target
const SIGHT_RANGE   = 24;         // bots seen within this distance
const ENEMY_FIRE_RANGE = 18;      // start shooting at this range
const PATROL_TARGET_LIFETIME_MS = 4000;
const KEYS_FPS = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "Space", "KeyR", "ShiftLeft", "ShiftRight",
]);

export class FPSAutopilot {
    constructor({
        camera, fpsShooter,
        botManager = null,
        ollamaLevelGen = null,
        ecsWorld = null,
        audio = null,
    }) {
        this.camera = camera;
        this.fpsShooter = fpsShooter;
        this.botManager = botManager;
        this.ollamaLevelGen = ollamaLevelGen;
        this.ecsWorld = ecsWorld;
        this.audio = audio;

        this.active = false;
        this._injectedKeys = new Set();  // keys we added to camera.keys
        this._patrolTarget = null;
        this._patrolUntil = 0;
        this._lastFireMs = 0;
        this._fireInterval = 220;        // matches FPSShooter cooldown
        this._badgeEl = null;
        this._hintEl = null;

        this._onKeyDown = this._handleUserInput.bind(this);
        this._onMouseDown = this._handleUserInput.bind(this);

        this._counts = { engaged: 0, shotsFired: 0, pickupsTaken: 0, kills: 0 };
    }

    engage() {
        if (this.active) return;
        if (!this.camera || !this.fpsShooter) return;
        this.active = true;
        this._counts.engaged++;
        document.addEventListener("keydown", this._onKeyDown, { capture: true });
        document.addEventListener("mousedown", this._onMouseDown, { capture: true });
        this._buildBadge();
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_level_start", 0.4);
        console.log("[autopilot] engaged");
    }

    disengage() {
        if (!this.active) return;
        this.active = false;
        document.removeEventListener("keydown", this._onKeyDown, { capture: true });
        document.removeEventListener("mousedown", this._onMouseDown, { capture: true });
        // Clear injected keys so the camera doesn't keep walking
        for (const k of this._injectedKeys) this.camera.keys?.delete(k);
        this._injectedKeys.clear();
        this._removeBadge();
        console.log("[autopilot] disengaged");
    }

    toggle() { return this.active ? this.disengage() : this.engage(); }

    tick(dt) {
        if (!this.active) return;
        if (!this.fpsShooter.active) {
            // FPS got stopped externally — also disengage
            this.disengage();
            return;
        }
        // Hold pitch roughly level so aim stays on enemy chests
        if (typeof this.camera.pitch === "number") {
            // Smoothly nudge pitch toward -0.05 rather than snap
            const targetPitch = -0.05;
            this.camera.pitch += (targetPitch - this.camera.pitch) * Math.min(1, dt * 4);
        }
        const target = this._pickTarget();
        if (target) {
            this._steerToward(target.x, target.z);
            if (target.type === "enemy") this._maybeFire(target);
        } else {
            // No target — patrol
            this._patrol(dt);
        }
    }

    _handleUserInput(e) {
        // Disengage on any FPS-relevant input. For keyboard, check the
        // code (KeyW etc.). For mouse, any button counts.
        if (e.type === "mousedown") {
            // Don't disengage if the click is on our own badge (the
            // badge is non-interactive, but be defensive)
            this.disengage();
            return;
        }
        if (e.type === "keydown" && KEYS_FPS.has(e.code)) {
            this.disengage();
        }
    }

    // ----- Target selection ----------------------------------------------

    _pickTarget() {
        // 1. Closest enemy in sight range
        const enemy = this._closestEnemyInRange(SIGHT_RANGE);
        if (enemy) {
            return { type: "enemy", x: enemy.x, z: enemy.z, dist: enemy.dist, entityId: enemy.entityId };
        }
        // 2. Health pickup if HP low
        if (this.fpsShooter.health < 0.5) {
            const pu = this._closestPickupOfKind("wad_pickup_health");
            if (pu) return { type: "pickup", x: pu.x, z: pu.z };
        }
        // 3. Ammo pickup if ammo low
        if (this.fpsShooter.ammo < 10) {
            const pu = this._closestPickupOfKind("wad_pickup_ammo");
            if (pu) return { type: "pickup", x: pu.x, z: pu.z };
        }
        // 3b. Round 229 — if the exit is sealed by keys we don't yet
        // have, prioritize the matching key pickup. Without this the
        // autopilot would loop at the exit forever, baffled.
        const required = this.fpsShooter._exitRequiresKeys || [];
        const inv = this.fpsShooter.keyInventory || new Set();
        const missing = required.filter(k => !inv.has(k));
        if (missing.length > 0) {
            for (const color of missing) {
                const pu = this._closestPickupOfKind(`wad_pickup_key_${color}`);
                if (pu) return { type: "key", x: pu.x, z: pu.z };
            }
            // No matching key visible — fall through (maybe a door blocks
            // the way; the autopilot will rediscover the key after door open)
        }
        // 3c. Round 229 — opportunistic key collection any time
        for (const color of ["red", "blue", "yellow"]) {
            if (inv.has(color)) continue;
            const pu = this._closestPickupOfKind(`wad_pickup_key_${color}`);
            if (pu) return { type: "key", x: pu.x, z: pu.z };
        }
        // 4. Any pickup nearby (opportunistic; only if very close)
        const anyPu = this._closestPickup(8);
        if (anyPu) return { type: "pickup", x: anyPu.x, z: anyPu.z };
        // 5. Open exit portal
        if (this.fpsShooter._exitOpen && this.fpsShooter._exitInfo) {
            return { type: "exit", x: this.fpsShooter._exitInfo.x, z: this.fpsShooter._exitInfo.z };
        }
        return null;
    }

    _closestEnemyInRange(range) {
        if (!this.fpsShooter._enemies || !this.camera?.position) return null;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        let best = null;
        let bestDist = range;
        for (const [entityId] of this.fpsShooter._enemies) {
            const pos = this.fpsShooter._getEntityPos(entityId);
            if (!pos) continue;
            const dx = pos.x - cx, dz = pos.z - cz;
            const d = Math.hypot(dx, dz);
            if (d < bestDist) {
                bestDist = d;
                best = { entityId, x: pos.x, z: pos.z, dist: d };
            }
        }
        return best;
    }

    _closestPickupOfKind(kind) {
        if (!this.fpsShooter._pickups || !this.camera?.position) return null;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        let best = null;
        let bestDist = Infinity;
        for (const [id, pu] of this.fpsShooter._pickups) {
            if (pu.kind !== kind) continue;
            const dx = pu.x - cx, dz = pu.z - cz;
            const d = Math.hypot(dx, dz);
            if (d < bestDist) { bestDist = d; best = pu; }
        }
        return best;
    }

    _closestPickup(maxRange) {
        if (!this.fpsShooter._pickups || !this.camera?.position) return null;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        let best = null;
        let bestDist = maxRange;
        for (const [id, pu] of this.fpsShooter._pickups) {
            const dx = pu.x - cx, dz = pu.z - cz;
            const d = Math.hypot(dx, dz);
            if (d < bestDist) { bestDist = d; best = pu; }
        }
        return best;
    }

    // ----- Movement / firing ---------------------------------------------

    _steerToward(tx, tz) {
        if (!this.camera?.position || !this.camera?.keys) return;
        const cx = this.camera.position.x, cz = this.camera.position.z;
        const dx = tx - cx, dz = tz - cz;
        const dist = Math.hypot(dx, dz);
        // Face the target. yaw=0 looks toward -Z (per _moveFP: fz = -cy).
        // So desired yaw = atan2(dx, -dz)
        if (dist > 0.01) {
            this.camera.yaw = Math.atan2(dx, -dz);
        }
        // If close enough, stop walking
        if (dist < STOP_DISTANCE) {
            this._clearWalkKeys();
            return;
        }
        // Hold KeyW so the camera walks forward (toward the yaw it's facing)
        this._setWalkKey("KeyW");
    }

    _setWalkKey(code) {
        if (!this.camera?.keys) return;
        for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
            if (k === code) {
                if (!this.camera.keys.has(k)) {
                    this.camera.keys.add(k);
                    this._injectedKeys.add(k);
                }
            } else if (this._injectedKeys.has(k)) {
                this.camera.keys.delete(k);
                this._injectedKeys.delete(k);
            }
        }
    }

    _clearWalkKeys() {
        if (!this.camera?.keys) return;
        for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
            if (this._injectedKeys.has(k)) {
                this.camera.keys.delete(k);
                this._injectedKeys.delete(k);
            }
        }
    }

    _maybeFire(target) {
        if (target.dist > ENEMY_FIRE_RANGE) return;
        // Check the enemy is within firing cone (aim is roughly on-target)
        const cx = this.camera.position.x, cz = this.camera.position.z;
        const dx = target.x - cx, dz = target.z - cz;
        const desiredYaw = Math.atan2(dx, -dz);
        // Normalize angular delta to (-π, π]
        let delta = desiredYaw - this.camera.yaw;
        while (delta >  Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) > FIRE_CONE_RAD) return;
        // Throttle to FPSShooter's cooldown
        const now = performance.now();
        if (now - this._lastFireMs < this._fireInterval) return;
        this._lastFireMs = now;
        const hit = this.fpsShooter.fire?.();
        this._counts.shotsFired++;
        if (hit) this._counts.kills++;
    }

    // ----- Patrol fallback -----------------------------------------------

    _patrol(dt) {
        const now = performance.now();
        if (!this._patrolTarget || now > this._patrolUntil) {
            this._patrolTarget = this._pickPatrolTarget();
            this._patrolUntil = now + PATROL_TARGET_LIFETIME_MS;
        }
        if (this._patrolTarget) {
            this._steerToward(this._patrolTarget.x, this._patrolTarget.z);
        }
    }

    _pickPatrolTarget() {
        // Pick a random room center from the active WAD layout
        const layout = this.ollamaLevelGen?._lastLevel;
        if (layout?.rooms?.length) {
            const r = layout.rooms[Math.floor(Math.random() * layout.rooms.length)];
            return { x: r.x + r.w / 2, z: r.z + r.d / 2 };
        }
        // No level — wander around origin
        const ang = Math.random() * Math.PI * 2;
        const d = 6 + Math.random() * 10;
        const cx = this.camera?.position?.x ?? 0;
        const cz = this.camera?.position?.z ?? 0;
        return { x: cx + Math.cos(ang) * d, z: cz + Math.sin(ang) * d };
    }

    // ----- UI ------------------------------------------------------------

    _buildBadge() {
        if (typeof document === "undefined") return;
        const b = document.createElement("div");
        b.id = "fps-autopilot-badge";
        Object.assign(b.style, {
            position: "fixed",
            top: "16px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(40,0,40,0.88)",
            color: "#fc8",
            padding: "6px 14px",
            borderRadius: "16px",
            fontFamily: "monospace",
            fontSize: "11px",
            border: "1px solid #c4a",
            boxShadow: "0 0 12px rgba(255,140,80,0.30)",
            zIndex: "8800",
            pointerEvents: "none",
            animation: "fps-auto-pulse 2.4s ease-in-out infinite",
        });
        b.innerHTML = `🤖 <b>AUTOPLAY</b> &nbsp;·&nbsp; <span style="color:#888; font-size:10px;">press any key or click to take over</span>`;
        // Style pulse via keyframes injected once
        if (!document.getElementById("fps-autopilot-css")) {
            const css = document.createElement("style");
            css.id = "fps-autopilot-css";
            css.textContent = `
@keyframes fps-auto-pulse {
  0%, 100% { opacity: 0.85; transform: translateX(-50%) scale(1.0); }
  50%      { opacity: 1.0;  transform: translateX(-50%) scale(1.04); }
}`;
            document.head.appendChild(css);
        }
        document.body.appendChild(b);
        this._badgeEl = b;
    }

    _removeBadge() {
        if (this._badgeEl?.parentNode) this._badgeEl.parentNode.removeChild(this._badgeEl);
        this._badgeEl = null;
    }

    getStats() { return { active: this.active, ...this._counts }; }
}
