// =============================================================================
// FILE: /simulation/CruiseDemo.js
// ROUND: 210
// =============================================================================
//
// Overhead-chase cruise demo. A vehicle (moon car, horse, or demon) moves
// forward through procedurally generated terrain at constant speed. The
// camera follows from a fixed elevation + offset behind the vehicle, so
// in the player's view the vehicle stays roughly stationary on screen
// and the terrain rolls past underneath.
//
// Entities (fauna, scenery, kaiju) are spawned in a "near-ahead" band so
// they come into view as the cruise advances, and despawned behind once
// they've passed the camera. The world's voxel terrain extends naturally
// via the existing chunk system — we just keep moving the vehicle into
// new chunks.
//
// Controls:
//   W / S  — throttle up / down (changes cruise speed)
//   A / D  — steer left / right (turns yaw)
//   ESC    — exit demo (handled by main)
//
// Console:
//   window.cruise.start({ vehicle: "moon_car", env: "moon" })
//   window.cruise.stop()
//   window.cruise.start({ vehicle: "horse",    env: "earth" })
//   window.cruise.start({ vehicle: "demon",    env: "hell"  })
//
// Vehicle types are procedurally installed via installCruiseVehicles().
// Real meshes can replace them later via assetLoader.swapMesh.
// =============================================================================

// Round 266 — shared camera-ground clamp.
import { clampCameraToGround as _clampCameraToGround } from "./cameraGroundClamp.js";

const VEHICLES = {
    moon_car: {
        // Low boxy body with rounded bubble cabin. 5 wide, 3 tall, 6 long.
        obj: `# moon_car
v -2.5 0 -3
v  2.5 0 -3
v  2.5 0  3
v -2.5 0  3
v -2.5 1.5 -3
v  2.5 1.5 -3
v  2.5 1.5  3
v -2.5 1.5  3
# bubble cabin (smaller, on top)
v -1.5 1.5 -1.5
v  1.5 1.5 -1.5
v  1.5 1.5  1.5
v -1.5 1.5  1.5
v -1.5 3 -1.0
v  1.5 3 -1.0
v  1.5 3  1.0
v -1.5 3  1.0
# wheels (4 cubes at corners, slightly inset)
v -2.3 -0.4 -2.3
v -1.5 -0.4 -2.3
v -1.5 -0.4 -1.5
v -2.3 -0.4 -1.5
v -2.3  0.4 -2.3
v -1.5  0.4 -2.3
v -1.5  0.4 -1.5
v -2.3  0.4 -1.5

v  1.5 -0.4 -2.3
v  2.3 -0.4 -2.3
v  2.3 -0.4 -1.5
v  1.5 -0.4 -1.5
v  1.5  0.4 -2.3
v  2.3  0.4 -2.3
v  2.3  0.4 -1.5
v  1.5  0.4 -1.5

v -2.3 -0.4 1.5
v -1.5 -0.4 1.5
v -1.5 -0.4 2.3
v -2.3 -0.4 2.3
v -2.3  0.4 1.5
v -1.5  0.4 1.5
v -1.5  0.4 2.3
v -2.3  0.4 2.3

v  1.5 -0.4 1.5
v  2.3 -0.4 1.5
v  2.3 -0.4 2.3
v  1.5 -0.4 2.3
v  1.5  0.4 1.5
v  2.3  0.4 1.5
v  2.3  0.4 2.3
v  1.5  0.4 2.3

# body faces
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
# cabin faces
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
# wheel 1
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
# wheel 2
f 25 28 27 26
f 29 30 31 32
f 25 26 30 29
f 26 27 31 30
f 27 28 32 31
f 28 25 29 32
# wheel 3
f 33 36 35 34
f 37 38 39 40
f 33 34 38 37
f 34 35 39 38
f 35 36 40 39
f 36 33 37 40
# wheel 4
f 41 44 43 42
f 45 46 47 48
f 41 42 46 45
f 42 43 47 46
f 43 44 48 47
f 44 41 45 48
`,
        defaultEnv: "moon",
        forwardSpeed: 8,      // u/s
        wheelSpinPhase: true, // visual: rotate vehicle slightly per tick
    },
    horse: {
        // Quadruped silhouette: body + 4 legs + head.
        obj: `# horse
# body (4 long × 2 tall × 2 wide)
v -2 1 -1
v  2 1 -1
v  2 1  1
v -2 1  1
v -2 3 -1
v  2 3 -1
v  2 3  1
v -2 3  1
# head (forward, smaller)
v  2 2 -0.7
v  3.2 2 -0.7
v  3.2 2  0.7
v  2 2  0.7
v  2 3.2 -0.7
v  3.2 3.2 -0.7
v  3.2 3.2  0.7
v  2 3.2  0.7
# leg FL
v  1.4 0 -0.9
v  1.8 0 -0.9
v  1.8 0 -0.5
v  1.4 0 -0.5
v  1.4 1 -0.9
v  1.8 1 -0.9
v  1.8 1 -0.5
v  1.4 1 -0.5
# leg FR
v  1.4 0 0.5
v  1.8 0 0.5
v  1.8 0 0.9
v  1.4 0 0.9
v  1.4 1 0.5
v  1.8 1 0.5
v  1.8 1 0.9
v  1.4 1 0.9
# leg BL
v -1.8 0 -0.9
v -1.4 0 -0.9
v -1.4 0 -0.5
v -1.8 0 -0.5
v -1.8 1 -0.9
v -1.4 1 -0.9
v -1.4 1 -0.5
v -1.8 1 -0.5
# leg BR
v -1.8 0 0.5
v -1.4 0 0.5
v -1.4 0 0.9
v -1.8 0 0.9
v -1.8 1 0.5
v -1.4 1 0.5
v -1.4 1 0.9
v -1.8 1 0.9

# body
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
# head
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
# leg FL
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
# leg FR
f 25 28 27 26
f 29 30 31 32
f 25 26 30 29
f 26 27 31 30
f 27 28 32 31
f 28 25 29 32
# leg BL
f 33 36 35 34
f 37 38 39 40
f 33 34 38 37
f 34 35 39 38
f 35 36 40 39
f 36 33 37 40
# leg BR
f 41 44 43 42
f 45 46 47 48
f 41 42 46 45
f 42 43 47 46
f 43 44 48 47
f 44 41 45 48
`,
        defaultEnv: "earth",
        forwardSpeed: 12,
        wheelSpinPhase: false,
    },
    demon: {
        // Hulking bipedal demon: torso, head, horns (small spikes), 2 legs.
        // Wing-stubs at back.
        obj: `# demon
# torso (3 wide × 4 tall × 2 deep)
v -1.5 1.5 -1
v  1.5 1.5 -1
v  1.5 1.5  1
v -1.5 1.5  1
v -1.5 5.5 -1
v  1.5 5.5 -1
v  1.5 5.5  1
v -1.5 5.5  1
# head (forward of torso top)
v  0 5.5 -0.8
v  1.2 5.5 -0.8
v  1.2 5.5  0.8
v  0 5.5  0.8
v  0 7 -0.8
v  1.2 7 -0.8
v  1.2 7  0.8
v  0 7  0.8
# left leg
v -1.3 0 -0.8
v -0.5 0 -0.8
v -0.5 0  0.8
v -1.3 0  0.8
v -1.3 1.5 -0.8
v -0.5 1.5 -0.8
v -0.5 1.5  0.8
v -1.3 1.5  0.8
# right leg
v  0.5 0 -0.8
v  1.3 0 -0.8
v  1.3 0  0.8
v  0.5 0  0.8
v  0.5 1.5 -0.8
v  1.3 1.5 -0.8
v  1.3 1.5  0.8
v  0.5 1.5  0.8
# left horn (small cube on head top, slightly forward)
v  0.3 7 -0.6
v  0.7 7 -0.6
v  0.7 7 -0.2
v  0.3 7 -0.2
v  0.3 8 -0.6
v  0.7 8 -0.6
v  0.7 8 -0.2
v  0.3 8 -0.2
# right horn
v  0.3 7 0.2
v  0.7 7 0.2
v  0.7 7 0.6
v  0.3 7 0.6
v  0.3 8 0.2
v  0.7 8 0.2
v  0.7 8 0.6
v  0.3 8 0.6

f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
f 25 28 27 26
f 29 30 31 32
f 25 26 30 29
f 26 27 31 30
f 27 28 32 31
f 28 25 29 32
f 33 36 35 34
f 37 38 39 40
f 33 34 38 37
f 34 35 39 38
f 35 36 40 39
f 36 33 37 40
f 41 44 43 42
f 45 46 47 48
f 41 42 46 45
f 42 43 47 46
f 43 44 48 47
f 44 41 45 48
`,
        defaultEnv: "hell",
        forwardSpeed: 10,
        wheelSpinPhase: false,
    },
};

// Environmental scenery + fauna asset IDs to scatter ahead of the vehicle.
// These reuse procedural cube assets so we don't need extra installs.
const SCENERY_KINDS = ["rock", "ruin", "tree_stump", "boulder"];
const FAUNA_KINDS   = ["fauna_small", "fauna_pack"];

export class CruiseDemo {
    constructor({ router, world, camera, assetLoader, particles }) {
        this.router      = router;
        this.world       = world;
        this.camera      = camera;
        this.assetLoader = assetLoader;
        this.particles   = particles ?? null;

        this.active     = false;
        this.vehicle    = null;
        this.scattered  = [];               // {entityId, x, z, spawnedDist}
        this.totalDist  = 0;
        this.nextScatterDist = 10;
        this._keys      = {};
        this._installedVehicles = false;
        this.hudEl      = null;
        this._lastTickMs = 0;

        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onKeyUp   = this._handleKeyUp.bind(this);
    }

    async start(opts = {}) {
        this.stop();

        const vehicleKey = opts.vehicle || "moon_car";
        const spec = VEHICLES[vehicleKey] || VEHICLES.moon_car;
        const envKey = opts.env || spec.defaultEnv;

        // Install vehicle meshes once. Idempotent.
        await this._ensureInstalled();

        // Regen terrain so the cruise starts on a fresh world. Env applies
        // via window.ogreScenario if available (cheap re-use), otherwise
        // we just rely on the world's natural biome generation.
        if (this.world?.regenerate) this.world.regenerate();
        if (typeof window !== "undefined" && window.ogreScenario?._applyEnvironment) {
            try { window.ogreScenario._applyEnvironment(envKey); } catch {}
        }

        const startX = 0;
        const startZ = 0;
        const startY = this._surfaceY(startX, startZ) + 1;

        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: `cruise_${vehicleKey}`,
            kind:    `cruise_${vehicleKey}`,
            x: startX, y: startY, z: startZ,
            scale: 1,
            yaw: 0,
        });
        if (!r?.ok || r.id == null) {
            console.warn("[CruiseDemo] vehicle spawn failed");
            return;
        }

        this.vehicle = {
            entityId: r.id,
            x: startX, y: startY, z: startZ,
            yaw: 0,
            speed: spec.forwardSpeed,
            throttle: 1.0,
            kind: vehicleKey,
            spec,
            envKey,
        };
        this.scattered = [];
        this.totalDist = 0;
        this.nextScatterDist = 10;
        this.active = true;

        document.addEventListener("keydown", this._onKeyDown);
        document.addEventListener("keyup",   this._onKeyUp);
        this._buildHud();
        this._lastTickMs = performance.now();
        console.log(`[CRUISE] start vehicle=${vehicleKey} env=${envKey} speed=${spec.forwardSpeed}u/s — W/S throttle, A/D steer`);
    }

    stop() {
        this.active = false;
        if (this.vehicle?.entityId != null && this.router) {
            try { this.router.exec({ type: "entity:despawn", id: this.vehicle.entityId }); } catch {}
        }
        for (const s of this.scattered) {
            if (s.entityId != null) {
                try { this.router.exec({ type: "entity:despawn", id: s.entityId }); } catch {}
            }
        }
        this.scattered = [];
        this.vehicle = null;
        document.removeEventListener("keydown", this._onKeyDown);
        document.removeEventListener("keyup",   this._onKeyUp);
        if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; }
        this._keys = {};
    }

    // Driven by main loop. dt in seconds.
    tick(dt) {
        if (!this.active || !this.vehicle) return;
        const v = this.vehicle;

        // Steering
        if (this._keys["a"]) v.yaw -= 1.2 * dt;
        if (this._keys["d"]) v.yaw += 1.2 * dt;
        // Throttle (W/S adjust speed multiplier, clamped 0.2..2.0)
        if (this._keys["w"]) v.throttle = Math.min(2.0, v.throttle + 0.6 * dt);
        if (this._keys["s"]) v.throttle = Math.max(0.2, v.throttle - 0.6 * dt);

        const fwdX = Math.sin(v.yaw);
        const fwdZ = Math.cos(v.yaw);
        const step = v.speed * v.throttle * dt;
        v.x += fwdX * step;
        v.z += fwdZ * step;
        v.y = this._surfaceY(v.x, v.z) + 1;
        this.totalDist += step;

        // Update entity transform
        const pos = this._getPos(v.entityId);
        if (pos) {
            pos.x = v.x; pos.y = v.y; pos.z = v.z;
            pos.yaw = v.yaw;
        }

        // Camera: overhead chase. ~22u above + 18u behind the vehicle,
        // pitched down looking forward at the vehicle. Yaw matches
        // vehicle yaw so terrain rolls toward the bottom of the screen
        // as the vehicle moves forward.
        if (this.camera) {
            this.camera.position.x = v.x - fwdX * 18;
            this.camera.position.y = v.y + 22;
            this.camera.position.z = v.z - fwdZ * 18;
            this.camera.yaw = v.yaw;
            this.camera.pitch = -0.7;       // steep downward angle
            // Round 266 — surface clamp. With steep pitched-down chase
            // the camera can dip into hills behind the vehicle when
            // crossing rising terrain. Lift to terrainTop + buffer so
            // we never render the underside of a chunk. Minimum lift
            // capped per-frame so a step-up doesn't whip the camera.
            if (typeof window !== "undefined" && window._clampCameraToGround) {
                window._clampCameraToGround(this.camera, { minBuffer: 4, maxLift: 12 });
            }
        }

        // Scatter entities ahead at intervals so they "come into view".
        // Cheap: every nextScatterDist units traveled, spawn one entity
        // 40-70u ahead of the vehicle along its forward direction with
        // ±20u lateral offset.
        if (this.totalDist >= this.nextScatterDist) {
            this.nextScatterDist += 8 + Math.random() * 6;        // 8-14u between spawns
            this._scatterAhead(fwdX, fwdZ);
        }

        // Despawn entities behind the camera. Use dot product to detect
        // "behind" — anything with (e.pos - v.pos) · forward < -25u is
        // past the camera and won't be visible.
        for (let i = this.scattered.length - 1; i >= 0; i--) {
            const s = this.scattered[i];
            const dx = s.x - v.x;
            const dz = s.z - v.z;
            const along = dx * fwdX + dz * fwdZ;
            if (along < -25) {
                try { this.router.exec({ type: "entity:despawn", id: s.entityId }); } catch {}
                this.scattered.splice(i, 1);
            }
        }

        if (this.hudEl) this._updateHud();
    }

    _scatterAhead(fwdX, fwdZ) {
        const v = this.vehicle;
        // Pick a random asset kind. Mix of scenery + fauna + occasional
        // kaiju-ish creature for variety.
        const pools = [SCENERY_KINDS, FAUNA_KINDS];
        const pool = pools[Math.floor(Math.random() * pools.length)];
        const kind = pool[Math.floor(Math.random() * pool.length)];
        // Position: 45-65u ahead along forward, ±18u lateral
        const aheadDist = 45 + Math.random() * 20;
        const lateral = (Math.random() - 0.5) * 36;
        // Lateral direction perpendicular to forward (rotate fwd 90° CCW)
        const latX = -fwdZ, latZ = fwdX;
        const x = v.x + fwdX * aheadDist + latX * lateral;
        const z = v.z + fwdZ * aheadDist + latZ * lateral;
        const y = this._surfaceY(x, z);
        const scale = 0.6 + Math.random() * 1.4;
        const yaw = Math.random() * Math.PI * 2;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: kind,
            kind,
            x, y, z, scale, yaw,
        });
        if (r?.ok && r.id != null) {
            this.scattered.push({ entityId: r.id, x, z, spawnedDist: this.totalDist });
        }
    }

    _surfaceY(x, z) {
        if (!this.world) return 5;
        if (this.world._heightAt) {
            try { return this.world._heightAt(x, z) + 1; } catch {}
        }
        // Naive scan from top down
        const ch = this.world.chunkHeight ?? 64;
        for (let y = ch - 1; y > 0; y--) {
            if (this.world.getVoxel?.(x | 0, y, z | 0)) return y + 1;
        }
        return 5;
    }

    _getPos(entityId) {
        if (!this.world?.ecs && !window?.ecsWorld) return null;
        // Try common ECS shapes
        try {
            const ecs = window.ecsWorld;
            if (ecs?.getComponent) {
                // Look up Position component — import is awkward in this
                // file, but the engine guarantees a Position class lives
                // in core/ecs/components.js. Cache the constructor.
                if (!CruiseDemo._PositionCtor) {
                    // Try to find via existing entity. Fallback to direct
                    // mutation through router (less ideal but works for
                    // demo purposes).
                    const allComps = ecs._componentStores || ecs.components;
                    for (const k of Object.keys(allComps || {})) {
                        if (k.toLowerCase().includes("position")) {
                            CruiseDemo._PositionCtor = ecs._componentKeys?.[k];
                            break;
                        }
                    }
                }
                // Generic: ask ecs by string key
                const c = ecs.getComponent(entityId, CruiseDemo._PositionCtor || "Position");
                if (c) return c;
            }
        } catch {}
        return null;
    }

    _handleKeyDown(e) {
        if (!this.active) return;
        const k = e.key.toLowerCase();
        this._keys[k] = true;
    }
    _handleKeyUp(e) {
        this._keys[e.key.toLowerCase()] = false;
    }

    _buildHud() {
        const el = document.createElement("div");
        el.id = "cruise-demo-hud";
        Object.assign(el.style, {
            position:    "fixed",
            bottom:      "20px",
            left:        "20px",
            background:  "rgba(0,0,0,0.75)",
            color:       "#aac8e8",
            padding:     "8px 12px",
            borderRadius: "6px",
            fontFamily:  "monospace",
            fontSize:    "12px",
            zIndex:      "9100",
            pointerEvents: "none",
        });
        document.body.appendChild(el);
        this.hudEl = el;
        this._updateHud();
    }
    _updateHud() {
        if (!this.hudEl || !this.vehicle) return;
        const v = this.vehicle;
        const spd = (v.speed * v.throttle).toFixed(1);
        this.hudEl.innerHTML =
            `<div style="color:#fc9; margin-bottom:3px;">🚙 Cruise — ${v.kind}</div>` +
            `<div>env: <span style="color:#fff;">${v.envKey}</span></div>` +
            `<div>speed: <span style="color:#fff;">${spd}</span> u/s (throttle ${v.throttle.toFixed(2)})</div>` +
            `<div>distance: <span style="color:#fff;">${this.totalDist.toFixed(0)}</span> u</div>` +
            `<div>scattered: <span style="color:#fff;">${this.scattered.length}</span></div>` +
            `<div style="color:#888; margin-top:4px;">W/S throttle · A/D steer</div>`;
    }

    async _ensureInstalled() {
        if (this._installedVehicles) return;
        if (!this.assetLoader?.installOBJText) {
            console.warn("[CruiseDemo] assetLoader.installOBJText not available");
            return;
        }
        for (const [name, spec] of Object.entries(VEHICLES)) {
            await this.assetLoader.installOBJText(`cruise_${name}`, spec.obj);
        }
        this._installedVehicles = true;
        console.log(`[CruiseDemo] installed ${Object.keys(VEHICLES).length} vehicle meshes`);
    }
}
