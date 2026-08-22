// =============================================================================
// FILE: /simulation/MissileCommandDemo.js
// ROUND: 212
// =============================================================================
//
// 3D Missile Command. Defender at fixed launch position; a row of cities
// across the ground line. Incoming missiles arc down from sky targeting
// random cities. Player clicks to aim and launch counter-missiles that
// fly to the click position and explode in a radius, taking out any
// incoming caught in the blast.
//
// Game loop:
//   • cities have HP; destroyed when an incoming missile lands on them
//   • player has unlimited counter-missiles but limited fire rate
//   • waves escalate (more incoming per second)
//   • game over when all cities gone
//   • restart with R
//
// Reuse:
//   • ParticleSystem for explosions
//   • Entity spawn for missiles & cities
//   • Camera written directly (locked overhead-front view)
//
// Console:
//   window.missileCommand.start()
//   window.missileCommand.stop()
// =============================================================================

// Round 266 — shared camera-ground clamp.
import { clampCameraToGround as _clampCameraToGround } from "./cameraGroundClamp.js";

const NUM_CITIES = 6;
const CITY_SPACING = 12;
const CITY_ROW_Z = 0;
const SKY_Y = 80;
const GROUND_Y = 5;
const LAUNCH_POS = { x: 0, y: GROUND_Y + 2, z: -40 };   // behind cities (defender position)

const INCOMING_BASE_INTERVAL = 3.0;
const INCOMING_MIN_INTERVAL  = 0.6;
const COUNTER_FIRE_COOLDOWN  = 0.25;
const COUNTER_SPEED          = 50;
const INCOMING_SPEED         = 16;
const EXPLOSION_RADIUS       = 6;
const EXPLOSION_TTL          = 0.8;

export class MissileCommandDemo {
    constructor({ router, world, camera, assetLoader, particles }) {
        this.router = router;
        this.world = world;
        this.camera = camera;
        this.assetLoader = assetLoader;
        this.particles = particles ?? null;

        this.active = false;
        this.cities = [];        // [{entityId, x, z, alive}]
        this.incoming = [];      // [{entityId, x, y, z, vx, vy, vz, targetCityIdx}]
        this.counters = [];      // [{entityId, x, y, z, vx, vy, vz, ax, ay, az, fuse}]
        this.explosions = [];    // [{x, y, z, age, ttl}]
        this.score = 0;
        this.wave = 0;
        this._spawnTimer = 0;
        this._fireCooldown = 0;
        this._installed = false;
        this._aim = { x: 0, y: GROUND_Y + 1, z: 10 };  // crosshair world position
        this._hudEl = null;
        this._reticleEl = null;

        this._onKey = this._handleKey.bind(this);
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onClick = this._handleClick.bind(this);
    }

    async start() {
        this.stop();
        await this._ensureInstalled();

        if (this.world?.regenerate) this.world.regenerate();
        this.cities = [];
        this.incoming = [];
        this.counters = [];
        this.explosions = [];
        this.score = 0;
        this.wave = 1;
        this._spawnTimer = 0;
        this._fireCooldown = 0;
        this.active = true;

        // Spawn cities in a row
        for (let i = 0; i < NUM_CITIES; i++) {
            const x = (i - (NUM_CITIES - 1) / 2) * CITY_SPACING;
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "mc_city",
                kind:    "mc_city",
                x, y: GROUND_Y, z: CITY_ROW_Z,
                scale: 1,
            });
            if (r?.ok) this.cities.push({ entityId: r.id, x, z: CITY_ROW_Z, alive: true });
        }

        // Camera: behind/above the launch position, looking toward the city row + sky
        if (this.camera) {
            this.camera.position.x = 0;
            this.camera.position.y = GROUND_Y + 22;
            this.camera.position.z = LAUNCH_POS.z - 12;
            this.camera.yaw = 0;
            this.camera.pitch = -0.35;
        }

        document.addEventListener("keydown", this._onKey);
        document.addEventListener("mousemove", this._onMouseMove);
        document.addEventListener("click", this._onClick);
        this._buildHud();
        console.log(`[MISSILE-CMD] start — ${NUM_CITIES} cities, click to launch counter-missile`);
    }

    stop() {
        this.active = false;
        for (const c of this.cities)   try { this.router.exec({ type: "entity:despawn", id: c.entityId }); } catch {}
        for (const i of this.incoming) try { this.router.exec({ type: "entity:despawn", id: i.entityId }); } catch {}
        for (const m of this.counters) try { this.router.exec({ type: "entity:despawn", id: m.entityId }); } catch {}
        this.cities = []; this.incoming = []; this.counters = []; this.explosions = [];
        document.removeEventListener("keydown", this._onKey);
        document.removeEventListener("mousemove", this._onMouseMove);
        document.removeEventListener("click", this._onClick);
        if (this._hudEl) { this._hudEl.remove(); this._hudEl = null; }
        if (this._reticleEl) { this._reticleEl.remove(); this._reticleEl = null; }
    }

    tick(dt) {
        if (!this.active) return;
        this._fireCooldown -= dt;

        // Game over check
        const livingCities = this.cities.filter(c => c.alive).length;
        if (livingCities === 0) {
            this._renderHud(true);
            return;
        }

        // Spawn incoming missiles
        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0) {
            this._spawnIncoming();
            // Interval shrinks with wave
            const interval = Math.max(INCOMING_MIN_INTERVAL, INCOMING_BASE_INTERVAL - this.wave * 0.15);
            this._spawnTimer = interval * (0.7 + Math.random() * 0.6);
        }
        // Wave up roughly every 20 seconds
        if (!this._waveTimer) this._waveTimer = 0;
        this._waveTimer += dt;
        if (this._waveTimer >= 20) { this.wave++; this._waveTimer = 0; }

        // Advance incoming
        for (let i = this.incoming.length - 1; i >= 0; i--) {
            const m = this.incoming[i];
            m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
            this._updateEntityPos(m.entityId, m.x, m.y, m.z);
            // Hit ground or city?
            if (m.y <= GROUND_Y + 0.5) {
                this._explodeAt(m.x, GROUND_Y, m.z, 4.5, /*damageCities*/true, /*color*/[1.0, 0.4, 0.2]);
                try { this.router.exec({ type: "entity:despawn", id: m.entityId }); } catch {}
                this.incoming.splice(i, 1);
            }
        }

        // Advance counter-missiles
        for (let i = this.counters.length - 1; i >= 0; i--) {
            const m = this.counters[i];
            m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
            m.fuse -= dt;
            this._updateEntityPos(m.entityId, m.x, m.y, m.z);
            // Trail particles
            if (this.particles?.spawn && Math.random() < 0.8) {
                this.particles.spawn({
                    x: m.x, y: m.y, z: m.z,
                    vx: -m.vx * 0.04, vy: -m.vy * 0.04 + 0.5, vz: -m.vz * 0.04,
                    ttl: 0.4, size: 0.3,
                    r: 1.0, g: 0.85, b: 0.4, a: 0.85,
                });
            }
            // Reach fuse threshold (close to aim point) → detonate
            const dx = m.targetX - m.x, dy = m.targetY - m.y, dz = m.targetZ - m.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            if (distSq < 1.5 || m.fuse <= 0) {
                this._explodeAt(m.x, m.y, m.z, EXPLOSION_RADIUS, /*damageCities*/false, /*color*/[0.4, 0.85, 1.0]);
                try { this.router.exec({ type: "entity:despawn", id: m.entityId }); } catch {}
                this.counters.splice(i, 1);
            }
        }

        // Advance explosions; check radius vs incoming
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];
            e.age += dt;
            // For counter-missile explosions, intercept incoming inside radius
            if (e.damages === "incoming") {
                const r = e.radius;
                for (let j = this.incoming.length - 1; j >= 0; j--) {
                    const inc = this.incoming[j];
                    const dx = inc.x - e.x, dy = inc.y - e.y, dz = inc.z - e.z;
                    if (dx*dx + dy*dy + dz*dz < r * r) {
                        this._explodeAt(inc.x, inc.y, inc.z, 3, false, [1.0, 0.7, 0.3]);
                        try { this.router.exec({ type: "entity:despawn", id: inc.entityId }); } catch {}
                        this.incoming.splice(j, 1);
                        this.score += 100;
                    }
                }
            }
            if (e.age >= e.ttl) this.explosions.splice(i, 1);
        }

        // Update reticle position from aim
        if (this._reticleEl && this.camera) this._positionReticle();
        if (this._hudEl) this._renderHud(false);
    }

    _spawnIncoming() {
        // Random target city among living ones
        const living = this.cities.filter(c => c.alive);
        if (living.length === 0) return;
        const target = living[Math.floor(Math.random() * living.length)];
        // Spawn at top of sky, X offset from target so it ARCS in
        const xOffset = (Math.random() - 0.5) * 40;
        const startX = target.x + xOffset;
        const startY = SKY_Y;
        const startZ = target.z - 30 - Math.random() * 15;
        // Velocity toward target
        const dx = target.x - startX, dy = GROUND_Y - startY, dz = target.z - startZ;
        const dist = Math.hypot(dx, dy, dz);
        const vx = (dx / dist) * INCOMING_SPEED;
        const vy = (dy / dist) * INCOMING_SPEED;
        const vz = (dz / dist) * INCOMING_SPEED;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "mc_incoming",
            kind: "mc_incoming",
            x: startX, y: startY, z: startZ,
            scale: 0.8,
        });
        if (!r?.ok) return;
        this.incoming.push({ entityId: r.id, x: startX, y: startY, z: startZ, vx, vy, vz, targetCityIdx: this.cities.indexOf(target) });
    }

    _fireCounter() {
        if (this._fireCooldown > 0) return;
        this._fireCooldown = COUNTER_FIRE_COOLDOWN;
        const dx = this._aim.x - LAUNCH_POS.x;
        const dy = this._aim.y - LAUNCH_POS.y;
        const dz = this._aim.z - LAUNCH_POS.z;
        const dist = Math.hypot(dx, dy, dz);
        const vx = (dx / dist) * COUNTER_SPEED;
        const vy = (dy / dist) * COUNTER_SPEED;
        const vz = (dz / dist) * COUNTER_SPEED;
        const fuse = dist / COUNTER_SPEED + 0.05;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "mc_counter",
            kind: "mc_counter",
            x: LAUNCH_POS.x, y: LAUNCH_POS.y, z: LAUNCH_POS.z,
            scale: 0.6,
        });
        if (!r?.ok) return;
        this.counters.push({
            entityId: r.id,
            x: LAUNCH_POS.x, y: LAUNCH_POS.y, z: LAUNCH_POS.z,
            vx, vy, vz,
            targetX: this._aim.x, targetY: this._aim.y, targetZ: this._aim.z,
            fuse,
        });
        // Launch puff
        if (this.particles?.spawn) {
            for (let i = 0; i < 10; i++) {
                this.particles.spawn({
                    x: LAUNCH_POS.x + (Math.random()-0.5), y: LAUNCH_POS.y,
                    z: LAUNCH_POS.z + (Math.random()-0.5),
                    vx: (Math.random()-0.5)*2, vy: -0.5 + Math.random()*1.5, vz: (Math.random()-0.5)*2,
                    ttl: 0.5, size: 0.35,
                    r: 0.85, g: 0.85, b: 0.85, a: 0.7,
                    gravity: -1,
                });
            }
        }
    }

    _explodeAt(x, y, z, radius, damageCities, color) {
        this.explosions.push({
            x, y, z, age: 0, ttl: EXPLOSION_TTL, radius,
            damages: damageCities ? "cities" : "incoming",
        });
        if (this.particles?.spawn) {
            const N = Math.round(radius * 5);
            for (let i = 0; i < N; i++) {
                const a = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;
                const sp = 2 + Math.random() * 8;
                this.particles.spawn({
                    x, y, z,
                    vx: Math.sin(phi)*Math.cos(a) * sp,
                    vy: Math.cos(phi) * sp,
                    vz: Math.sin(phi)*Math.sin(a) * sp,
                    ttl: 0.6 + Math.random()*0.6, size: 0.4 + Math.random()*0.3,
                    r: color[0], g: color[1], b: color[2], a: 0.85,
                    gravity: -1.5,
                });
            }
        }
        if (damageCities) {
            for (const c of this.cities) {
                if (!c.alive) continue;
                const dx = c.x - x, dz = c.z - z;
                if (dx*dx + dz*dz < radius * radius) {
                    c.alive = false;
                    try { this.router.exec({ type: "entity:despawn", id: c.entityId }); } catch {}
                }
            }
        }
    }

    _handleKey(e) {
        if (!this.active) return;
        if (e.key.toLowerCase() === "r") this.start();
        if (e.key === " ") { e.preventDefault(); this._fireCounter(); }
    }

    _handleMouseMove(e) {
        if (!this.active) return;
        // Project mouse position into world. Assume player is shooting
        // at a horizontal plane at y=GROUND_Y+2.
        // Simple inverse mapping using camera viewport.
        const w = window.innerWidth, h = window.innerHeight;
        const ndcX = (e.clientX / w) * 2 - 1;
        const ndcY = -((e.clientY / h) * 2 - 1);
        // World offset: ndc → world plane around aim target plane.
        // Camera is at (0, +22, -52) looking forward at pitch -0.35.
        // Approximate the world hit position on a plane at y=GROUND_Y+2.
        const camY = this.camera?.position?.y ?? (GROUND_Y + 22);
        const camZ = this.camera?.position?.z ?? (LAUNCH_POS.z - 12);
        const groundY = GROUND_Y + 2;
        // Ray from camera through (ndcX, ndcY) hits plane y=groundY at:
        // World extents at the plane scale with distance + fov; use rough
        // approximation suitable for arcade aim.
        const halfRange = 50;
        const aimX = ndcX * halfRange;
        const aimZ = camZ + (ndcY + 1) * 0.5 * (camY * 2);   // crude depth
        this._aim.x = Math.max(-halfRange, Math.min(halfRange, aimX));
        this._aim.y = groundY;
        this._aim.z = Math.max(camZ + 5, Math.min(60, aimZ));
    }

    _handleClick(e) {
        if (!this.active) return;
        if (e.button === 0) this._fireCounter();
    }

    _positionReticle() {
        // Position reticle DOM element at mouse coords (we track via _aim
        // but the DOM event already provides screen coords). Hook reticle
        // to the latest mousemove.
        // Simpler: keep reticle fixed at center for now if no event data.
    }

    _updateEntityPos(entityId, x, y, z) {
        const ecs = (typeof window !== "undefined") ? window.ecsWorld : null;
        if (!ecs?.getComponent) return;
        try {
            const pos = ecs.getComponent(entityId, "Position");
            if (pos) { pos.x = x; pos.y = y; pos.z = z; }
        } catch {}
    }

    _buildHud() {
        const el = document.createElement("div");
        el.id = "missile-cmd-hud";
        Object.assign(el.style, {
            position: "fixed", top: "20px", left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.8)", color: "#fc9",
            padding: "8px 14px", borderRadius: "6px",
            fontFamily: "monospace", fontSize: "13px",
            zIndex: "9100", pointerEvents: "none",
        });
        document.body.appendChild(el);
        this._hudEl = el;
        // Reticle
        const ret = document.createElement("div");
        Object.assign(ret.style, {
            position: "fixed", left: "50%", top: "50%",
            width: "20px", height: "20px",
            marginLeft: "-10px", marginTop: "-10px",
            border: "2px solid #ffd884",
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: "9101",
        });
        document.body.appendChild(ret);
        this._reticleEl = ret;
    }
    _renderHud(gameOver) {
        if (!this._hudEl) return;
        const livingCities = this.cities.filter(c => c.alive).length;
        if (gameOver) {
            this._hudEl.innerHTML =
                `<div style="color:#ff5050; font-size:18px;">GAME OVER</div>` +
                `<div>final score: ${this.score} · wave ${this.wave}</div>` +
                `<div style="color:#888;">press R to restart</div>`;
        } else {
            this._hudEl.innerHTML =
                `<div style="color:#ffd884;">🚀 MISSILE COMMAND · wave ${this.wave}</div>` +
                `<div>score: ${this.score} · cities: ${livingCities} / ${NUM_CITIES}</div>` +
                `<div style="color:#888;">click to launch · space also fires · R restart</div>`;
        }
    }

    async _ensureInstalled() {
        if (this._installed) return;
        if (!this.assetLoader?.installOBJText) return;
        // City: stocky building
        const cityOBJ = `# mc_city
v -2.5 0 -2
v  2.5 0 -2
v  2.5 0  2
v -2.5 0  2
v -2.5 5 -2
v  2.5 5 -2
v  2.5 5  2
v -2.5 5  2
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
        // Incoming missile: elongated cone-ish (4-sided pyramid)
        const incomingOBJ = `# mc_incoming
v -0.5 -1.5 -0.5
v  0.5 -1.5 -0.5
v  0.5 -1.5  0.5
v -0.5 -1.5  0.5
v 0 1.5 0
f 1 4 3 2
f 1 5 4
f 4 5 3
f 3 5 2
f 2 5 1
`;
        // Counter-missile: smaller upright cone
        const counterOBJ = `# mc_counter
v -0.4 0 -0.4
v  0.4 0 -0.4
v  0.4 0  0.4
v -0.4 0  0.4
v 0 1.8 0
f 1 4 3 2
f 1 5 4
f 4 5 3
f 3 5 2
f 2 5 1
`;
        await this.assetLoader.installOBJText("mc_city", cityOBJ);
        await this.assetLoader.installOBJText("mc_incoming", incomingOBJ);
        await this.assetLoader.installOBJText("mc_counter", counterOBJ);
        this._installed = true;
        console.log("[MissileCommandDemo] installed mc_city + mc_incoming + mc_counter");
    }
}
