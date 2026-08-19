// =============================================================================
// FILE: /simulation/AsteroidsDemo.js
// ROUND: 211
// =============================================================================
//
// 3D Asteroids. Player flies a ship through open space, shooting OBJ-blob
// asteroids that break into 3 size stages (large → medium → small → dust).
// Each asteroid has tumbling rotation and drift velocity; bullets are
// short-lived projectile entities with hit detection. Small asteroids
// break into pure particle dust (no further entities).
//
// Trellis upgrade hook: when ComfyUI is reachable, newly spawned
// asteroid assets can be queued for Trellis enrichment via
// queueTrellisUpgrade(). The base procedural blob renders immediately;
// the loader's onMeshSwap will hot-swap the mesh once Trellis returns.
// Disabled by default so the demo runs cleanly on machines without
// ComfyUI configured.
//
// Controls:
//   WASD  — translate ship in its local plane
//   Mouse — yaw + pitch the ship (also aims fire)
//   Space — fire bullet
//   Q / E — roll
//
// Console:
//   window.asteroids.start({ trellis: false })   // pure procedural
//   window.asteroids.start({ trellis: true  })   // enrich asteroids
//                                                // via Trellis (opt-in;
//                                                // requires ComfyUI)
//   window.asteroids.stop()
// =============================================================================

const STAGE_LARGE  = 0;
const STAGE_MEDIUM = 1;
const STAGE_SMALL  = 2;

const STAGE_INFO = [
    { name: "large",  baseScale: 4.0, splitInto: 2, splitStage: STAGE_MEDIUM, hitsToBreak: 1 },
    { name: "medium", baseScale: 2.5, splitInto: 3, splitStage: STAGE_SMALL,  hitsToBreak: 1 },
    { name: "small",  baseScale: 1.2, splitInto: 0, splitStage: -1,           hitsToBreak: 1 },
];

// Generate an "asteroid blob" OBJ — irregular icosahedron-ish shape with
// per-vertex displacement. Deterministic via seed so the same name maps
// to the same shape across reloads.
function generateAsteroidOBJ(seed) {
    let s = seed | 0 || 1;
    const rand = () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 1000) / 1000; };

    // Start from icosahedron-like vertex distribution.
    const baseVerts = [];
    const phi = (1 + Math.sqrt(5)) / 2;
    const norm = Math.sqrt(1 + phi * phi);
    const icoData = [
        [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
        [0, -1,  phi], [0,  1,  phi], [0, -1, -phi], [0,  1, -phi],
        [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1],
    ];
    for (const [x, y, z] of icoData) {
        // Normalize then displace by 0.6..1.4
        const r = 0.6 + rand() * 0.8;
        const nx = (x / norm) * r;
        const ny = (y / norm) * r;
        const nz = (z / norm) * r;
        baseVerts.push([nx, ny, nz]);
    }

    // Icosahedron faces (CCW outward normals)
    const icoFaces = [
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    let obj = `# asteroid_blob seed=${seed}\n`;
    for (const [x, y, z] of baseVerts) {
        obj += `v ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}\n`;
    }
    for (const [a, b, c] of icoFaces) {
        obj += `f ${a+1} ${b+1} ${c+1}\n`;
    }
    return obj;
}

// Round 266 — shared camera-ground clamp.
import { clampCameraToGround as _clampCameraToGround } from "./cameraGroundClamp.js";
// v737 — voxels-to-OBJ for Gemini asteroid variants
import { voxelsToObj } from "../utils/voxelsToObj.js";

// v737 — Gemini asteroid variant prompts. Pool prewarm runs after the
// procedural blobs are installed; once ready, _spawnAsteroid picks from
// either the procedural variants OR these Gemini-generated kinds.
const GEMINI_ASTEROID_PROMPTS = [
    "asteroid space rock irregular",
    "asteroid crystalline mineral chunk",
    "asteroid metallic chunk",
    "asteroid cratered moon fragment",
];

// =============================================================================

export class AsteroidsDemo {
    constructor({ router, world, camera, assetLoader, particles }) {
        this.router      = router;
        this.world       = world;
        this.camera      = camera;
        this.assetLoader = assetLoader;
        this.particles   = particles ?? null;

        this.active   = false;
        this.ship     = null;
        this.asteroids = [];      // {entityId, stage, x,y,z, vx,vy,vz, rotAxis,rotSpeed, yaw,pitch,roll, hp, assetId}
        this.bullets  = [];       // {entityId, x,y,z, vx,vy,vz, ttl}
        // v737 — UFO that attacks the player. Spawns on a timer once asteroids
        // thin out. Tracks the ship, fires energy bolts at it.
        this.ufos     = [];       // {entityId, x,y,z, vx,vy,vz, yaw, hp, fireCooldown, lifeTimer}
        this.enemyBullets = [];   // UFO bullets aimed at the player
        this._ufoSpawnTimer = 12; // first UFO appears after ~12s
        this._geminiAsteroidKinds = [];   // v737 — populated by _prewarmGeminiPool
        this.score    = 0;
        this.hudEl    = null;
        this._installed = false;
        this._trellisEnabled = false;
        this._mouseDX = 0; this._mouseDY = 0;
        this._keys = {};
        this._mouseLocked = false;

        this._onKeyDown   = this._handleKeyDown.bind(this);
        this._onKeyUp     = this._handleKeyUp.bind(this);
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
    }

    async start(opts = {}) {
        this.stop();
        this._trellisEnabled = opts.trellis === true;

        await this._ensureInstalled();

        // Open space — regenerate world but the demo doesn't really use
        // terrain. We rely on the camera being above ground level.
        if (this.world?.regenerate) this.world.regenerate();

        // Spawn ship at origin, pointed +Z
        const shipR = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "asteroids_ship",
            kind:    "asteroids_ship",
            x: 0, y: 80, z: 0,
            scale: 1,
            yaw: 0,
        });
        if (!shipR?.ok) { console.warn("[AsteroidsDemo] ship spawn failed"); return; }

        this.ship = {
            entityId: shipR.id,
            x: 0, y: 80, z: 0,
            vx: 0, vy: 0, vz: 0,
            yaw: 0, pitch: 0, roll: 0,
            fireCooldown: 0,
        };
        this.asteroids = [];
        this.bullets   = [];
        this.score     = 0;
        this.active    = true;

        // Spawn initial wave of 6 large asteroids around the ship
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const dist  = 50 + Math.random() * 25;
            this._spawnAsteroid(STAGE_LARGE, {
                x: this.ship.x + Math.cos(angle) * dist,
                y: this.ship.y + (Math.random() - 0.5) * 12,
                z: this.ship.z + Math.sin(angle) * dist,
            });
        }

        document.addEventListener("keydown", this._onKeyDown);
        document.addEventListener("keyup",   this._onKeyUp);
        document.addEventListener("mousemove", this._onMouseMove);
        document.addEventListener("mousedown", this._onMouseDown);

        this._buildHud();
        console.log(`[ASTEROIDS] start (trellis=${this._trellisEnabled}) — WASD thrust · mouse aim · space fire · Q/E roll`);
    }

    stop() {
        this.active = false;
        if (this.ship?.entityId != null) {
            try { this.router.exec({ type: "entity:despawn", id: this.ship.entityId }); } catch {}
        }
        for (const a of this.asteroids) {
            try { this.router.exec({ type: "entity:despawn", id: a.entityId }); } catch {}
        }
        for (const b of this.bullets) {
            try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
        }
        // v737 — cleanup UFOs + their bullets
        for (const u of this.ufos) {
            try { this.router.exec({ type: "entity:despawn", id: u.entityId }); } catch {}
        }
        for (const b of this.enemyBullets) {
            try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
        }
        this.ship = null;
        this.asteroids = [];
        this.bullets = [];
        this.ufos = [];
        this.enemyBullets = [];
        this._ufoSpawnTimer = 12;
        this._shipHits = 0;
        document.removeEventListener("keydown", this._onKeyDown);
        document.removeEventListener("keyup",   this._onKeyUp);
        document.removeEventListener("mousemove", this._onMouseMove);
        document.removeEventListener("mousedown", this._onMouseDown);
        if (this.hudEl) { this.hudEl.remove(); this.hudEl = null; }
        this._keys = {};
    }

    tick(dt) {
        if (!this.active || !this.ship) return;

        // Mouse-look applies accumulated deltas to yaw/pitch
        this.ship.yaw   += this._mouseDX * 0.003;
        this.ship.pitch += this._mouseDY * 0.003;
        this.ship.pitch = Math.max(-1.2, Math.min(1.2, this.ship.pitch));
        this._mouseDX = 0; this._mouseDY = 0;

        // Roll via Q/E
        if (this._keys["q"]) this.ship.roll -= 1.2 * dt;
        if (this._keys["e"]) this.ship.roll += 1.2 * dt;

        // Thrust via WASD (in ship-local axes)
        const fwd = this._shipForward();
        const right = this._shipRight();
        const thrustAccel = 28;
        let ax = 0, ay = 0, az = 0;
        if (this._keys["w"]) { ax += fwd.x;   ay += fwd.y;   az += fwd.z;   }
        if (this._keys["s"]) { ax -= fwd.x;   ay -= fwd.y;   az -= fwd.z;   }
        if (this._keys["d"]) { ax += right.x; ay += right.y; az += right.z; }
        if (this._keys["a"]) { ax -= right.x; ay -= right.y; az -= right.z; }
        const aLen = Math.hypot(ax, ay, az);
        if (aLen > 0) {
            ax /= aLen; ay /= aLen; az /= aLen;
            this.ship.vx += ax * thrustAccel * dt;
            this.ship.vy += ay * thrustAccel * dt;
            this.ship.vz += az * thrustAccel * dt;
        }
        // Damping (light)
        const damp = 0.985;
        this.ship.vx *= damp; this.ship.vy *= damp; this.ship.vz *= damp;

        // Advance ship
        this.ship.x += this.ship.vx * dt;
        this.ship.y += this.ship.vy * dt;
        this.ship.z += this.ship.vz * dt;

        this._updateEntityTransform(this.ship.entityId, this.ship.x, this.ship.y, this.ship.z, this.ship.yaw, this.ship.pitch, this.ship.roll);

        // Fire bullet
        this.ship.fireCooldown -= dt;
        if (this._keys[" "] && this.ship.fireCooldown <= 0) {
            this._fireBullet();
            this.ship.fireCooldown = 0.20;
        }

        // Advance asteroids
        for (const a of this.asteroids) {
            a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
            a.yaw   += a.rotSpeed[0] * dt;
            a.pitch += a.rotSpeed[1] * dt;
            a.roll  += a.rotSpeed[2] * dt;
            this._updateEntityTransform(a.entityId, a.x, a.y, a.z, a.yaw, a.pitch, a.roll);
        }

        // v737 — UFO spawn timer. Spawn one UFO every ~25s when fewer than 2
        // UFOs are active and at least 1 asteroid is still around (so the UFO
        // arrives in the middle of the action, not on an empty stage).
        this._ufoSpawnTimer -= dt;
        if (this._ufoSpawnTimer <= 0 && this.ufos.length < 2) {
            this._spawnUFO();
            this._ufoSpawnTimer = 25 + Math.random() * 10;
        }

        // v737 — UFO AI: track ship + fire at it periodically.
        for (let i = this.ufos.length - 1; i >= 0; i--) {
            const u = this.ufos[i];
            u.lifeTimer += dt;
            // Steer toward a position near the ship but offset (so it's not on top)
            const tdx = this.ship.x - u.x;
            const tdy = this.ship.y - u.y;
            const tdz = this.ship.z - u.z;
            const td  = Math.hypot(tdx, tdy, tdz) || 1;
            const desiredDist = 22;
            // If too close, back away; if too far, approach
            const approach = (td - desiredDist) * 0.05;
            u.vx += (tdx / td) * approach * dt * 60;
            u.vy += (tdy / td) * approach * dt * 60;
            u.vz += (tdz / td) * approach * dt * 60;
            // Damping + speed cap
            u.vx *= 0.96; u.vy *= 0.96; u.vz *= 0.96;
            const sp = Math.hypot(u.vx, u.vy, u.vz);
            const maxSpeed = 12;
            if (sp > maxSpeed) { u.vx *= maxSpeed/sp; u.vy *= maxSpeed/sp; u.vz *= maxSpeed/sp; }
            u.x += u.vx * dt; u.y += u.vy * dt; u.z += u.vz * dt;
            // Face the ship — yaw = atan2(dx, dz) (engine yaw convention)
            u.yaw = Math.atan2(tdx, tdz);
            this._updateEntityTransform(u.entityId, u.x, u.y, u.z, u.yaw, 0, 0);
            // Fire timer
            u.fireCooldown -= dt;
            if (u.fireCooldown <= 0 && td < 60) {
                this._fireUFOBullet(u);
                u.fireCooldown = 1.5 + Math.random() * 1.0;
            }
            // Despawn after long life (UFOs leave)
            if (u.lifeTimer > 45) {
                try { this.router.exec({ type: "entity:despawn", id: u.entityId }); } catch {}
                this.ufos.splice(i, 1);
            }
        }

        // v737 — Enemy bullets (UFO -> player) — visually distinct red bolts.
        // Hit test against ship; for now just despawn on hit (no ship damage
        // tracking yet — flash the HUD).
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            b.ttl -= dt;
            this._updateEntityTransform(b.entityId, b.x, b.y, b.z, 0, 0, 0);
            const dx = this.ship.x - b.x, dy = this.ship.y - b.y, dz = this.ship.z - b.z;
            if (dx*dx + dy*dy + dz*dz < 2.5 * 2.5) {
                try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
                this.enemyBullets.splice(i, 1);
                this._shipHits = (this._shipHits || 0) + 1;
                continue;
            }
            if (b.ttl <= 0) {
                try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
                this.enemyBullets.splice(i, 1);
            }
        }

        // Advance bullets + collision check
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            b.ttl -= dt;
            this._updateEntityTransform(b.entityId, b.x, b.y, b.z, 0, 0, 0);
            // Hit test
            let hit = null;
            for (const a of this.asteroids) {
                const r = STAGE_INFO[a.stage].baseScale * 0.8;
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                if (dx*dx + dy*dy + dz*dz < r * r) { hit = a; break; }
            }
            // v737 — also check UFO collision
            let ufoHit = null;
            if (!hit) {
                for (const u of this.ufos) {
                    const dx = u.x - b.x, dy = u.y - b.y, dz = u.z - b.z;
                    if (dx*dx + dy*dy + dz*dz < 2.0 * 2.0) { ufoHit = u; break; }
                }
            }
            if (ufoHit) {
                ufoHit.hp -= 1;
                try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
                this.bullets.splice(i, 1);
                if (ufoHit.hp <= 0) {
                    try { this.router.exec({ type: "entity:despawn", id: ufoHit.entityId }); } catch {}
                    const idx = this.ufos.indexOf(ufoHit);
                    if (idx >= 0) this.ufos.splice(idx, 1);
                    this.score += 500;
                    if (this.particles?.burst) {
                        try { this.particles.burst({ x: ufoHit.x, y: ufoHit.y, z: ufoHit.z, count: 30, color: [0.4, 1.0, 0.6, 1.0] }); } catch {}
                    }
                }
                continue;
            }
            if (hit) {
                this._breakAsteroid(hit, b);
                try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
                this.bullets.splice(i, 1);
                continue;
            }
            if (b.ttl <= 0) {
                try { this.router.exec({ type: "entity:despawn", id: b.entityId }); } catch {}
                this.bullets.splice(i, 1);
            }
        }

        // Camera: chase 8u behind + 3u above ship, looking forward along ship's yaw
        if (this.camera) {
            const camDist = 8, camHeight = 3;
            this.camera.position.x = this.ship.x - fwd.x * camDist + 0;
            this.camera.position.y = this.ship.y - fwd.y * camDist + camHeight;
            this.camera.position.z = this.ship.z - fwd.z * camDist + 0;
            this.camera.yaw = this.ship.yaw;
            this.camera.pitch = this.ship.pitch;
            // Round 266 — shared camera-ground clamp. Asteroids is
            // mostly above-terrain, but a dive toward the surface can
            // sink the chase camera into a hill. Idempotent.
            try { _clampCameraToGround(this.camera, this.world, { minClearance: 4 }); } catch {}
        }

        // If all asteroids destroyed, spawn next wave
        if (this.asteroids.length === 0) {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const dist  = 60 + Math.random() * 30;
                this._spawnAsteroid(STAGE_LARGE, {
                    x: this.ship.x + Math.cos(angle) * dist,
                    y: this.ship.y + (Math.random() - 0.5) * 12,
                    z: this.ship.z + Math.sin(angle) * dist,
                });
            }
        }

        if (this.hudEl) this._updateHud();
    }

    _shipForward() {
        const cy = Math.cos(this.ship.yaw), sy = Math.sin(this.ship.yaw);
        const cp = Math.cos(this.ship.pitch), sp = Math.sin(this.ship.pitch);
        return { x: sy * cp, y: -sp, z: cy * cp };
    }
    _shipRight() {
        const cy = Math.cos(this.ship.yaw), sy = Math.sin(this.ship.yaw);
        return { x: cy, y: 0, z: -sy };
    }

    _fireBullet() {
        const fwd = this._shipForward();
        const speed = 60;
        const b = {
            x: this.ship.x + fwd.x * 2,
            y: this.ship.y + fwd.y * 2,
            z: this.ship.z + fwd.z * 2,
            vx: this.ship.vx + fwd.x * speed,
            vy: this.ship.vy + fwd.y * speed,
            vz: this.ship.vz + fwd.z * speed,
            ttl: 2.5,
            entityId: null,
        };
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "asteroids_bullet",
            kind:    "asteroids_bullet",
            x: b.x, y: b.y, z: b.z,
            scale: 0.35,
        });
        if (r?.ok) {
            b.entityId = r.id;
            this.bullets.push(b);
        }
        // Muzzle particles
        if (this.particles?.spawn) {
            for (let i = 0; i < 4; i++) {
                this.particles.spawn({
                    x: b.x, y: b.y, z: b.z,
                    vx: fwd.x * 8 + (Math.random()-0.5)*2,
                    vy: fwd.y * 8 + (Math.random()-0.5)*2,
                    vz: fwd.z * 8 + (Math.random()-0.5)*2,
                    ttl: 0.2, size: 0.2,
                    r: 1.0, g: 0.85, b: 0.3, a: 0.85,
                });
            }
        }
    }

    _breakAsteroid(a, bullet) {
        // Despawn the parent asteroid
        try { this.router.exec({ type: "entity:despawn", id: a.entityId }); } catch {}
        const idx = this.asteroids.indexOf(a);
        if (idx >= 0) this.asteroids.splice(idx, 1);

        const stageInfo = STAGE_INFO[a.stage];
        this.score += (a.stage === STAGE_LARGE ? 20 : a.stage === STAGE_MEDIUM ? 50 : 100);

        // Dust particle burst at break point
        if (this.particles?.spawn) {
            const burstCount = (a.stage === STAGE_LARGE ? 30 : a.stage === STAGE_MEDIUM ? 22 : 16);
            for (let i = 0; i < burstCount; i++) {
                const dirX = (Math.random() - 0.5);
                const dirY = (Math.random() - 0.5);
                const dirZ = (Math.random() - 0.5);
                const sp = 3 + Math.random() * 8;
                this.particles.spawn({
                    x: a.x + (Math.random()-0.5)*1.5,
                    y: a.y + (Math.random()-0.5)*1.5,
                    z: a.z + (Math.random()-0.5)*1.5,
                    vx: dirX * sp, vy: dirY * sp, vz: dirZ * sp,
                    ttl: 1.0 + Math.random()*0.8, size: 0.35,
                    r: 0.55, g: 0.5, b: 0.45, a: 0.8,
                });
            }
        }

        // Spawn children
        if (stageInfo.splitInto > 0 && stageInfo.splitStage >= 0) {
            const hitDir = { x: bullet.vx, y: bullet.vy, z: bullet.vz };
            const hitLen = Math.hypot(hitDir.x, hitDir.y, hitDir.z) || 1;
            hitDir.x /= hitLen; hitDir.y /= hitLen; hitDir.z /= hitLen;
            for (let i = 0; i < stageInfo.splitInto; i++) {
                // Spread children perpendicular to bullet direction
                const angle = (i / stageInfo.splitInto) * Math.PI * 2 + Math.random() * 0.4;
                const perpX = Math.cos(angle), perpZ = Math.sin(angle);
                const spreadSpeed = 4 + Math.random() * 3;
                this._spawnAsteroid(stageInfo.splitStage, {
                    x: a.x + perpX * 1.5,
                    y: a.y + (Math.random() - 0.5) * 1.0,
                    z: a.z + perpZ * 1.5,
                    vx: a.vx + perpX * spreadSpeed + hitDir.x * 1.5,
                    vy: a.vy + (Math.random()-0.5) * 2,
                    vz: a.vz + perpZ * spreadSpeed + hitDir.z * 1.5,
                });
            }
        }
    }

    _spawnAsteroid(stage, opts = {}) {
        const info = STAGE_INFO[stage];
        // v737 — Gemini variant picker. 30% chance to use a Gemini-generated
        // asteroid mesh if the pool is ready. Mostly used for large stage
        // where the shape variety reads clearly. Small/medium stages stay
        // on the procedural blobs to avoid overwhelming visual change.
        let assetId, variantUsed = "procedural";
        const useGemini = this._geminiAsteroidKinds.length > 0
                        && stage === STAGE_LARGE
                        && Math.random() < 0.30;
        if (useGemini) {
            assetId = this._geminiAsteroidKinds[Math.floor(Math.random() * this._geminiAsteroidKinds.length)];
            variantUsed = "gemini";
        } else {
            const variant = Math.random() < 0.5 ? "a" : "b";
            assetId = `asteroid_${info.name}_${variant}`;
        }
        const x = opts.x ?? 0, y = opts.y ?? 0, z = opts.z ?? 0;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId,
            kind: assetId,
            x, y, z,
            scale: info.baseScale * (0.9 + Math.random() * 0.2),
            yaw:   Math.random() * Math.PI * 2,
        });
        if (!r?.ok) return null;
        const ast = {
            entityId: r.id,
            stage,
            assetId,
            x, y, z,
            vx: opts.vx ?? (Math.random() - 0.5) * 5,
            vy: opts.vy ?? (Math.random() - 0.5) * 1.5,
            vz: opts.vz ?? (Math.random() - 0.5) * 5,
            yaw: 0, pitch: 0, roll: 0,
            rotSpeed: [
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
            ],
            hp: info.hitsToBreak,
        };
        this.asteroids.push(ast);
        // Trellis upgrade — queue this asset (and the swap will hot-patch
        // the mesh once Trellis returns)
        if (this._trellisEnabled) this._queueTrellisUpgrade(assetId);
        return ast;
    }

    _queueTrellisUpgrade(assetId) {
        if (!this.assetLoader?.setPriority) return;
        // Mark high priority so the asset loader's Trellis path picks it
        // up before generic queue items. The asset already renders via
        // the procedural blob; when Trellis returns, swapMesh is fired
        // by the existing pipeline.
        try {
            this.assetLoader.setPriority(assetId, true);
        } catch {}
    }

    // v737 — UFO spawn: pops in at a random angle 65-85u from the ship,
    // at the ship's y ± 8u. UFO mesh is the asteroids_ufo asset (registered
    // by _ensureInstalled).
    _spawnUFO() {
        if (!this.ship) return null;
        const angle = Math.random() * Math.PI * 2;
        const dist  = 65 + Math.random() * 20;
        const x = this.ship.x + Math.cos(angle) * dist;
        const z = this.ship.z + Math.sin(angle) * dist;
        const y = this.ship.y + (Math.random() - 0.5) * 16;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "asteroids_ufo",
            kind: "asteroids_ufo",
            x, y, z,
            scale: 1.8,
            yaw: 0,
        });
        if (!r?.ok) return null;
        const u = {
            entityId: r.id,
            x, y, z,
            vx: 0, vy: 0, vz: 0,
            yaw: 0,
            hp: 3,
            fireCooldown: 1.5,
            lifeTimer: 0,
        };
        this.ufos.push(u);
        console.log(`[asteroids] UFO spawned at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        return u;
    }

    // v737 — UFO fires a tracking bolt at the ship. The bolt is a
    // colored cube (asteroids_ufobullet kind) flying in a straight line
    // along the direction from UFO -> ship's current position at fire time.
    _fireUFOBullet(u) {
        const tdx = this.ship.x - u.x;
        const tdy = this.ship.y - u.y;
        const tdz = this.ship.z - u.z;
        const td  = Math.hypot(tdx, tdy, tdz) || 1;
        const speed = 22;
        const bvx = (tdx / td) * speed;
        const bvy = (tdy / td) * speed;
        const bvz = (tdz / td) * speed;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "asteroids_ufobullet",
            kind: "asteroids_ufobullet",
            x: u.x, y: u.y, z: u.z,
            scale: 0.6,
        });
        if (!r?.ok) return;
        this.enemyBullets.push({
            entityId: r.id,
            x: u.x, y: u.y, z: u.z,
            vx: bvx, vy: bvy, vz: bvz,
            ttl: 4.5,
        });
    }

    _updateEntityTransform(entityId, x, y, z, yaw, pitch, roll) {
        if (!entityId) return;
        const ecs = (typeof window !== "undefined") ? window.ecsWorld : null;
        if (!ecs?.getComponent) return;
        try {
            // Find Position component by string lookup — ecs registers
            // components under either constructors or names.
            const pos = ecs.getComponent(entityId, "Position");
            if (pos) {
                pos.x = x; pos.y = y; pos.z = z;
                if (yaw   !== undefined) pos.yaw   = yaw;
                if (pitch !== undefined) pos.tiltX = pitch;
                if (roll  !== undefined) pos.tiltZ = roll;
            }
        } catch {}
    }

    _handleKeyDown(e) {
        if (!this.active) return;
        const k = e.key.toLowerCase();
        this._keys[k] = true;
        if (k === " ") e.preventDefault();
    }
    _handleKeyUp(e) {
        this._keys[e.key.toLowerCase()] = false;
    }
    _handleMouseMove(e) {
        if (!this.active) return;
        if (document.pointerLockElement) {
            this._mouseDX += e.movementX || 0;
            this._mouseDY += e.movementY || 0;
        }
    }
    _handleMouseDown(e) {
        if (!this.active) return;
        if (!document.pointerLockElement && e.target?.requestPointerLock) {
            e.target.requestPointerLock();
        }
        // Left click also fires
        if (e.button === 0) {
            if (this.ship && this.ship.fireCooldown <= 0) {
                this._fireBullet();
                this.ship.fireCooldown = 0.20;
            }
        }
    }

    _buildHud() {
        const el = document.createElement("div");
        el.id = "asteroids-demo-hud";
        Object.assign(el.style, {
            position: "fixed", top: "20px", right: "20px",
            background: "rgba(0,0,0,0.75)", color: "#fc9",
            padding: "10px 14px", borderRadius: "6px",
            fontFamily: "monospace", fontSize: "12px",
            zIndex: "9100", pointerEvents: "none",
        });
        document.body.appendChild(el);
        this.hudEl = el;
        this._updateHud();
    }
    _updateHud() {
        if (!this.hudEl) return;
        const counts = { large: 0, medium: 0, small: 0 };
        for (const a of this.asteroids) counts[STAGE_INFO[a.stage].name]++;
        this.hudEl.innerHTML =
            `<div style="color:#ffe066; margin-bottom:4px;">🪨 ASTEROIDS</div>` +
            `<div>score: <span style="color:#fff;">${this.score}</span></div>` +
            `<div>large: ${counts.large} · med: ${counts.medium} · small: ${counts.small}</div>` +
            `<div>bullets: ${this.bullets.length}</div>` +
            (this.ufos.length > 0 ? `<div style="color:#5eff8a;">🛸 UFO: ${this.ufos.length}</div>` : "") +
            ((this._shipHits || 0) > 0 ? `<div style="color:#ff5e5e;">⚠ hits: ${this._shipHits}</div>` : "") +
            `<div style="color:#888; margin-top:4px;">${this._trellisEnabled ? "🔥 Trellis upgrade ON" : ""}</div>` +
            `<div style="color:#888;">WASD thrust · mouse aim · space/click fire · Q/E roll</div>`;
    }

    async _ensureInstalled() {
        if (this._installed) return;
        if (!this.assetLoader?.installOBJText) return;
        // 2 blob variants × 3 stages = 6 asteroid meshes. Each seeded for
        // shape variety; same variant always looks identical.
        const tasks = [];
        for (const stage of STAGE_INFO) {
            for (const variant of ["a", "b"]) {
                const name = `asteroid_${stage.name}_${variant}`;
                const seed = (name.charCodeAt(0) + variant.charCodeAt(0)) * 7919;
                tasks.push(this.assetLoader.installOBJText(name, generateAsteroidOBJ(seed)));
            }
        }
        // Ship: simple triangular arrow pointing +Z
        const shipOBJ = `# asteroids_ship
v 0 0 1.5
v -0.8 0 -0.8
v 0.8 0 -0.8
v 0 0.5 -0.4
f 1 4 2
f 1 3 4
f 2 4 3
f 1 2 3
`;
        tasks.push(this.assetLoader.installOBJText("asteroids_ship", shipOBJ));
        // Bullet: small cube
        const bulletOBJ = `# asteroids_bullet
v -0.3 -0.3 -0.3
v  0.3 -0.3 -0.3
v  0.3 -0.3  0.3
v -0.3 -0.3  0.3
v -0.3  0.3 -0.3
v  0.3  0.3 -0.3
v  0.3  0.3  0.3
v -0.3  0.3  0.3
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
        tasks.push(this.assetLoader.installOBJText("asteroids_bullet", bulletOBJ));
        // v737 — UFO mesh: classic flying-saucer disc. Vertices form a
        // hexagonal disc with a small dome on top and bottom — two cones
        // back-to-back. Keeps the vert count tiny.
        const ufoOBJ = `# asteroids_ufo (disc + dome)
v 0 0.5 0
v 0 -0.3 0
v 1.5 0 0
v 0.75 0 1.30
v -0.75 0 1.30
v -1.5 0 0
v -0.75 0 -1.30
v 0.75 0 -1.30
f 1 3 4
f 1 4 5
f 1 5 6
f 1 6 7
f 1 7 8
f 1 8 3
f 2 4 3
f 2 5 4
f 2 6 5
f 2 7 6
f 2 8 7
f 2 3 8
`;
        tasks.push(this.assetLoader.installOBJText("asteroids_ufo", ufoOBJ));
        // v737 — UFO bullet: small cube (engine renders with kind color)
        const ufoBulletOBJ = `# asteroids_ufobullet
v -0.25 -0.25 -0.25
v  0.25 -0.25 -0.25
v  0.25 -0.25  0.25
v -0.25 -0.25  0.25
v -0.25  0.25 -0.25
v  0.25  0.25 -0.25
v  0.25  0.25  0.25
v -0.25  0.25  0.25
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
        tasks.push(this.assetLoader.installOBJText("asteroids_ufobullet", ufoBulletOBJ));
        await Promise.all(tasks);
        this._installed = true;
        console.log(`[AsteroidsDemo] installed 6 asteroid blobs + ship + bullet + UFO + UFO bullet`);
        // v737 — kick off Gemini variant pool prewarm. Non-blocking — just
        // populates this._geminiAsteroidKinds when ready.
        this._prewarmGeminiPool();
    }

    async _prewarmGeminiPool() {
        if (!this.assetLoader?.installOBJText) return;
        try {
            const r = await fetch("/ai/asset/pool", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompts: GEMINI_ASTEROID_PROMPTS }),
            });
            const j = await r.json();
            if (!j.ok || !Array.isArray(j.items)) return;
            for (const it of j.items) {
                if (!it.voxels || it.voxels.length === 0) continue;
                const safe = (it.prompt || "asteroid").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 24);
                const kind = "gem_ast_" + safe;
                try {
                    await this.assetLoader.installOBJText(kind, voxelsToObj(it.voxels));
                    this._geminiAsteroidKinds.push(kind);
                } catch (e) {
                    console.warn(`[AsteroidsDemo] install ${kind} failed:`, e.message);
                }
            }
            console.log(`[AsteroidsDemo] Gemini asteroid pool ready: ${this._geminiAsteroidKinds.length} variants`);
        } catch (e) {
            console.warn("[AsteroidsDemo] gemini pool fetch:", e.message);
        }
    }
}
