// Round 41 — Lunar Lander demo. Classic Atari-era game; player descends
// onto terrain with throttle + lateral thrust. Touchdown softly to win.
// Hard impact = crash.
//
// Controls: W = main thrust, A/D = lateral, R = reset
//
// Physics:
//   gravity:   -1.6 u/s² (moon)
//   thrust:    main 4.0 u/s², lateral 1.6 u/s²
//   safe land: |vy| < 2.0, |vx|+|vz| < 1.5
//
// HUD: alt, vx/y/z, fuel, status — rendered as DOM overlay.

const G = 1.6;
const MAIN_THRUST = 4.0;
const LAT_THRUST = 1.6;
const FUEL_BURN_MAIN = 0.06;
const FUEL_BURN_LAT  = 0.03;
const SAFE_VY = 2.0;
const SAFE_VH = 1.5;

export class LunarLanderDemo {
    constructor({ router, world, camera }) {
        this.router = router;
        this.world = world;
        this.camera = camera;
        this.active = false;
        this.lander = null;
        this.hudEl = null;
        this._keys = {};
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp   = this._handleKeyUp.bind(this);
    }

    start() {
        this.stop();
        this.active = true;
        // Round 43e — fresh terrain. Lander needs a clean lunar surface
        // not whatever the previous demo painted/edited.
        if (this.world?.regenerate) this.world.regenerate();
        this.lander = {
            x: 0, y: 80, z: 0,
            vx: 4, vy: 0, vz: 2,
            fuel: 100,
            status: "flying",                  // flying | landed | crashed
            statusT: 0,
            entityId: null,
            flameEntityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "lunar_lander",
                kind: "lunar_lander",
                x: this.lander.x, y: this.lander.y, z: this.lander.z,
                scaleX: 1.0, scaleY: 1.2, scaleZ: 1.0,
            });
            this.lander.entityId = r?.id ?? null;
        }
        document.addEventListener("keydown", this._onKeyDown);
        document.addEventListener("keyup",   this._onKeyUp);
        this._buildHud();
        console.log(`[LANDER] start — W=thrust, A/D=lateral, R=reset`);
    }

    stop() {
        this.active = false;
        if (this.lander && this.router) {
            if (this.lander.entityId != null)
                this.router.exec({ type: "entity:despawn", id: this.lander.entityId });
            if (this.lander.flameEntityId != null)
                this.router.exec({ type: "entity:despawn", id: this.lander.flameEntityId });
        }
        this.lander = null;
        document.removeEventListener("keydown", this._onKeyDown);
        document.removeEventListener("keyup",   this._onKeyUp);
        if (this.hudEl) {
            this.hudEl.remove();
            this.hudEl = null;
        }
        this._keys = {};
    }

    _handleKeyDown(e) {
        const k = e.key.toLowerCase();
        this._keys[k] = true;
        if (k === "r") {
            // Reset
            this.start();
        }
    }
    _handleKeyUp(e) {
        this._keys[e.key.toLowerCase()] = false;
    }

    _buildHud() {
        const el = document.createElement("div");
        el.id = "lunar-lander-hud";
        Object.assign(el.style, {
            position: "fixed", bottom: "20px", left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            background: "rgba(15, 30, 60, 0.85)",
            border: "1px solid rgba(120, 180, 255, 0.55)",
            color: "rgba(200, 230, 255, 0.95)",
            font: "12px ui-monospace, 'Courier New', monospace",
            borderRadius: "6px",
            zIndex: 10,
            minWidth: "320px", textAlign: "center",
        });
        document.body.appendChild(el);
        this.hudEl = el;
    }

    _updateHud() {
        if (!this.hudEl || !this.lander) return;
        const l = this.lander;
        const groundY = (this.world?.getVoxel)
            ? this._surfaceY(l.x, l.z) : 0;
        const alt = l.y - groundY;
        const vh = Math.hypot(l.vx, l.vz);
        const statusColor = l.status === "landed" ? "#7fff7f"
                          : l.status === "crashed" ? "#ff6060"
                          : "#cce6ff";
        this.hudEl.innerHTML = `
            <div style="font-weight:600; letter-spacing:0.5px; margin-bottom:4px;">
                LUNAR LANDER — W=thrust  A/D=lateral  R=reset
            </div>
            <div>
                alt: <b>${alt.toFixed(1)}</b>u  
                vy: <b>${l.vy.toFixed(2)}</b>  
                vh: <b>${vh.toFixed(2)}</b>  
                fuel: <b>${l.fuel.toFixed(0)}</b>  
                <span style="color:${statusColor}">[${l.status.toUpperCase()}]</span>
            </div>
        `;
    }

    _surfaceY(x, z) {
        if (!this.world?.getVoxel) return 0;
        for (let y = 80; y > 0; y--) {
            const v = this.world.getVoxel(Math.floor(x), y, Math.floor(z));
            if (v != null && v !== 0 && v !== 10 && v !== 11) return y + 1;
        }
        return 1;
    }

    tick(dt) {
        if (!this.active || !this.lander) return;
        const l = this.lander;
        // Already landed/crashed — just hold position
        if (l.status !== "flying") {
            l.statusT += dt;
            this._updateHud();
            return;
        }
        // Inputs
        let mainOn = false;
        if (this._keys["w"] && l.fuel > 0) {
            l.vy += MAIN_THRUST * dt;
            l.fuel -= FUEL_BURN_MAIN;
            mainOn = true;
        }
        if (this._keys["a"] && l.fuel > 0) {
            l.vx -= LAT_THRUST * dt;
            l.fuel -= FUEL_BURN_LAT;
        }
        if (this._keys["d"] && l.fuel > 0) {
            l.vx += LAT_THRUST * dt;
            l.fuel -= FUEL_BURN_LAT;
        }
        l.fuel = Math.max(0, l.fuel);
        // Gravity
        l.vy -= G * dt;
        // Integrate
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.z += l.vz * dt;
        // Ground check
        const groundY = this._surfaceY(l.x, l.z);
        if (l.y <= groundY + 1.0) {
            l.y = groundY + 1.0;
            const vh = Math.hypot(l.vx, l.vz);
            const verticalOK = Math.abs(l.vy) < SAFE_VY;
            const horizOK    = vh < SAFE_VH;
            if (verticalOK && horizOK) {
                l.status = "landed";
                console.log("[LANDER] ✓ SAFE LANDING");
            } else {
                l.status = "crashed";
                console.log(`[LANDER] ✗ CRASH (vy=${l.vy.toFixed(2)} vh=${vh.toFixed(2)})`);
                // crash particles available via main particle system if needed
            }
            l.vx = 0; l.vy = 0; l.vz = 0;
            // Despawn flame
            if (l.flameEntityId != null && this.router) {
                this.router.exec({ type: "entity:despawn", id: l.flameEntityId });
                l.flameEntityId = null;
            }
        }
        // Update entity
        if (l.entityId != null && this.router) {
            this.router.exec({
                type: "entity:move",
                id: l.entityId,
                x: l.x, y: l.y, z: l.z,
                yaw: 0, tiltX: -l.vx * 0.04,           // tilt with lateral motion
            });
        }
        // Flame entity (visible when thrusting)
        if (mainOn) {
            if (l.flameEntityId == null && this.router) {
                const r = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: "lunar_flame",
                    kind: "lunar_flame",
                    x: l.x, y: l.y - 1.0, z: l.z,
                    scaleX: 0.55, scaleY: 1.2, scaleZ: 0.55,
                });
                l.flameEntityId = r?.id ?? null;
            } else if (l.flameEntityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: l.flameEntityId,
                    x: l.x, y: l.y - 1.2, z: l.z,
                });
            }
        } else if (l.flameEntityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: l.flameEntityId });
            l.flameEntityId = null;
        }
        this._updateHud();
    }
}
