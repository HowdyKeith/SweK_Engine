// Round 39 — Boids flocking demo. Classic Craig Reynolds rules:
// alignment (match neighbor velocity), cohesion (move toward neighbor
// centroid), separation (avoid crowding). Renders boids as small
// fast-moving entities cruising above the terrain.

export class BoidsDemo {
    constructor({ router, world }) {
        this.router = router;
        this.world = world;
        this.boids = [];
        this.active = false;
        this.spawnCount = 50;
        // World bounds for boids — soft volume above terrain
        this.bounds = { xMin: -60, xMax: 60, yMin: 20, yMax: 60, zMin: -60, zMax: 60 };
    }

    start() {
        this.stop();
        this.active = true;
        for (let i = 0; i < this.spawnCount; i++) {
            this._spawnBoid();
        }
        console.log(`[BOIDS] spawned ${this.boids.length} boids`);
    }

    _spawnBoid() {
        const x = (Math.random() - 0.5) * 80;
        const y = 25 + Math.random() * 30;
        const z = (Math.random() - 0.5) * 80;
        const ang = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 3;
        const b = {
            x, y, z,
            vx: Math.cos(ang) * sp,
            vy: (Math.random() - 0.5) * 0.5,
            vz: Math.sin(ang) * sp,
            entityId: null,
        };
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "boid",
                kind: "boid",
                x, y, z,
                scale: 0.45,
            });
            b.entityId = r?.id ?? null;
        }
        this.boids.push(b);
    }

    // v1414 — remote/pad actions.
    _center() { const b = this.bounds; return { x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2, z: (b.zMin + b.zMax) / 2 }; }
    _aim(b, dx, dy, dz, s) { const d = Math.hypot(dx, dy, dz) || 1; b.vx = dx / d * s; b.vy = dy / d * s; b.vz = dz / d * s; }
    scatter() { const c = this._center(); for (const b of this.boids) this._aim(b, b.x - c.x, b.y - c.y, b.z - c.z, 4); }
    gather()  { const c = this._center(); for (const b of this.boids) this._aim(b, c.x - b.x, c.y - b.y, c.z - b.z, 4); }
    addBoids(n = 20) { if (this.active) for (let i = 0; i < n; i++) this._spawnBoid(); }
    reset() { this.stop(); this.start(); }

    stop() {
        this.active = false;
        if (this.router) {
            for (const b of this.boids) {
                if (b.entityId != null) {
                    this.router.exec({ type: "entity:despawn", id: b.entityId });
                }
            }
        }
        this.boids.length = 0;
    }

    tick(dt) {
        if (!this.active) return;
        const VISION = 8;             // neighbor radius
        const VISION_SQ = VISION * VISION;
        const SEP_RADIUS = 2.5;
        const SEP_RADIUS_SQ = SEP_RADIUS * SEP_RADIUS;
        const MAX_SPEED = 9;
        const ALIGN_W  = 0.45;
        const COHES_W  = 0.30;
        const SEP_W    = 1.20;
        const BOUND_W  = 0.80;

        for (const b of this.boids) {
            let avgVx = 0, avgVy = 0, avgVz = 0;     // alignment
            let cx = 0, cy = 0, cz = 0;              // cohesion centroid
            let sx = 0, sy = 0, sz = 0;              // separation push
            let nCount = 0;

            for (const o of this.boids) {
                if (o === b) continue;
                const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 > VISION_SQ) continue;
                avgVx += o.vx; avgVy += o.vy; avgVz += o.vz;
                cx += o.x; cy += o.y; cz += o.z;
                if (d2 < SEP_RADIUS_SQ && d2 > 0.001) {
                    // Repulsion vector — push away inverse with distance
                    const inv = 1.0 / Math.sqrt(d2);
                    sx -= dx * inv;
                    sy -= dy * inv;
                    sz -= dz * inv;
                }
                nCount++;
            }

            let ax = 0, ay = 0, az = 0;
            if (nCount > 0) {
                // alignment
                avgVx /= nCount; avgVy /= nCount; avgVz /= nCount;
                ax += (avgVx - b.vx) * ALIGN_W;
                ay += (avgVy - b.vy) * ALIGN_W;
                az += (avgVz - b.vz) * ALIGN_W;
                // cohesion
                cx /= nCount; cy /= nCount; cz /= nCount;
                ax += (cx - b.x) * COHES_W * 0.05;
                ay += (cy - b.y) * COHES_W * 0.05;
                az += (cz - b.z) * COHES_W * 0.05;
                // separation
                ax += sx * SEP_W;
                ay += sy * SEP_W;
                az += sz * SEP_W;
            }
            // soft bounds — pull back into volume
            const bd = this.bounds;
            if (b.x < bd.xMin) ax += (bd.xMin - b.x) * BOUND_W;
            else if (b.x > bd.xMax) ax += (bd.xMax - b.x) * BOUND_W;
            if (b.y < bd.yMin) ay += (bd.yMin - b.y) * BOUND_W;
            else if (b.y > bd.yMax) ay += (bd.yMax - b.y) * BOUND_W;
            if (b.z < bd.zMin) az += (bd.zMin - b.z) * BOUND_W;
            else if (b.z > bd.zMax) az += (bd.zMax - b.z) * BOUND_W;

            b.vx += ax * dt;
            b.vy += ay * dt;
            b.vz += az * dt;
            // Clamp speed
            const sp = Math.hypot(b.vx, b.vy, b.vz);
            if (sp > MAX_SPEED) {
                const k = MAX_SPEED / sp;
                b.vx *= k; b.vy *= k; b.vz *= k;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;
            // Update visual entity
            if (b.entityId != null && this.router) {
                const yaw = Math.atan2(b.vx, b.vz);
                const horiz = Math.hypot(b.vx, b.vz) || 1;
                const tilt = -(b.vy / horiz) * 0.5;
                this.router.exec({
                    type: "entity:move",
                    id: b.entityId,
                    x: b.x, y: b.y, z: b.z,
                    yaw, tiltX: tilt,
                });
            }
        }
    }
}
