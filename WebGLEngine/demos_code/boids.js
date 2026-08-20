// demos_code/boids.js — port of the VBA engine's ComputeBoidSystem
//
// The VBA engine's ComputeBoidSystem.cls runs Reynolds-style flocking
// (separation + alignment + cohesion) on a 2D grid. This is the WebGL
// equivalent — N entities flock in 3D around a target volume, each
// entity rendered as a real engine mesh so the boids feel like part
// of the world rather than an abstract 2D simulation.
//
// VBA reference: VBAOpenGL_Demos_v2_67.xlsm → ComputeBoidSystem.cls
//
// Algorithm per frame:
//   - For each boid, scan neighbors within VISION_RADIUS:
//     * SEPARATION: average vector AWAY from too-close neighbors
//     * ALIGNMENT:  average heading of neighbors
//     * COHESION:   vector toward neighbor center
//   - Apply each force with its weight, clamp speed
//   - Soft-wrap inside a sphere (boids that wander too far gently turn back)

const NUM_BOIDS         = 32;
const SPAWN_RADIUS      = 30;
const HOME_RADIUS       = 50;     // soft boundary
const HOME_Y            = 35;     // height of flock center
const MAX_SPEED         = 6.0;
const MAX_FORCE         = 0.25;
const VISION_RADIUS     = 12;
const VISION_RADIUS_SQ  = VISION_RADIUS * VISION_RADIUS;
const SEP_RADIUS        = 4.5;
const SEP_RADIUS_SQ     = SEP_RADIUS * SEP_RADIUS;
const W_SEPARATION      = 1.8;
const W_ALIGNMENT       = 1.0;
const W_COHESION        = 0.9;
const W_HOMING          = 0.4;    // pull back toward HOME when far away

// Mix of entity kinds gives the flock visual personality without
// needing a new mesh — uses the existing engine palette.
const BOID_KINDS = [
    "remote_player_marker",
    "caster_wizard",
    "caster_tank",
];

let boids = [];

function rand(ctx, min, max) {
    return min + ctx.rand() * (max - min);
}

export default {
    id:    "boids",
    label: "BOIDS (FLOCKING PORT)",
    hint:  "Reynolds flocking — VBA ComputeBoidSystem ported to 3D WebGL",
    controls: [
        "Auto — boids flock and meander around the home volume",
        `${NUM_BOIDS} boids, vision=${VISION_RADIUS}u, separation=${SEP_RADIUS}u`,
        "Compare with VBAOpenGL_Demos_v2_67.xlsm → ComputeBoidSystem.cls",
    ],

    start(ctx) {
        boids = [];
        for (let i = 0; i < NUM_BOIDS; i++) {
            const angle = ctx.rand() * Math.PI * 2;
            const radius = ctx.rand() * SPAWN_RADIUS;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = HOME_Y + rand(ctx, -8, 8);
            const kind = BOID_KINDS[i % BOID_KINDS.length];
            const id = ctx.spawnMesh(kind, x, y, z, 1.5);
            if (id == null) {
                console.warn(`[boids] spawnMesh ${i} returned null`);
                continue;
            }
            boids.push({
                id, x, y, z,
                vx: rand(ctx, -1, 1),
                vy: rand(ctx, -0.3, 0.3),
                vz: rand(ctx, -1, 1),
                ax: 0, ay: 0, az: 0,
                yaw: 0,
            });
        }
        try { ctx.lookAt?.(0, HOME_Y, 0); } catch {}
        ctx.kpop?.info?.("Boids", `${boids.length} entities flocking`);
        console.log("[boids] started;", boids.length, "boids");
    },

    tick(ctx, dt) {
        if (!boids.length) return;
        // Clamp dt — long pauses shouldn't teleport boids
        if (dt > 0.1) dt = 0.1;

        // Reset accumulators
        for (const b of boids) { b.ax = 0; b.ay = 0; b.az = 0; }

        // Pairwise neighbor scan. O(n²) is fine for n=32 — 1024 ops
        // per frame is negligible. For n=200+ a spatial grid would
        // be appropriate; matches the VBA SpatialGrid pattern.
        for (let i = 0; i < boids.length; i++) {
            const a = boids[i];
            let sepX = 0, sepY = 0, sepZ = 0, sepCount = 0;
            let aliX = 0, aliY = 0, aliZ = 0, aliCount = 0;
            let cohX = 0, cohY = 0, cohZ = 0, cohCount = 0;

            for (let j = 0; j < boids.length; j++) {
                if (i === j) continue;
                const b = boids[j];
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 > VISION_RADIUS_SQ || d2 < 1e-4) continue;
                // Cohesion (toward neighbor) — uses neighbor pos
                cohX += b.x; cohY += b.y; cohZ += b.z; cohCount++;
                // Alignment (match neighbor heading)
                aliX += b.vx; aliY += b.vy; aliZ += b.vz; aliCount++;
                // Separation (away from close neighbors)
                if (d2 < SEP_RADIUS_SQ) {
                    const inv = 1.0 / Math.sqrt(d2);
                    sepX += dx * inv;
                    sepY += dy * inv;
                    sepZ += dz * inv;
                    sepCount++;
                }
            }

            // SEPARATION — sum, normalize, steer at max force
            if (sepCount > 0) {
                let sx = sepX / sepCount, sy = sepY / sepCount, sz = sepZ / sepCount;
                const sl = Math.hypot(sx, sy, sz);
                if (sl > 0) {
                    sx = sx / sl * MAX_SPEED;
                    sy = sy / sl * MAX_SPEED;
                    sz = sz / sl * MAX_SPEED;
                    a.ax += (sx - a.vx) * W_SEPARATION;
                    a.ay += (sy - a.vy) * W_SEPARATION;
                    a.az += (sz - a.vz) * W_SEPARATION;
                }
            }
            // ALIGNMENT — match average neighbor velocity
            if (aliCount > 0) {
                let vx = aliX / aliCount, vy = aliY / aliCount, vz = aliZ / aliCount;
                const vl = Math.hypot(vx, vy, vz);
                if (vl > 0) {
                    vx = vx / vl * MAX_SPEED;
                    vy = vy / vl * MAX_SPEED;
                    vz = vz / vl * MAX_SPEED;
                    a.ax += (vx - a.vx) * W_ALIGNMENT;
                    a.ay += (vy - a.vy) * W_ALIGNMENT;
                    a.az += (vz - a.vz) * W_ALIGNMENT;
                }
            }
            // COHESION — steer toward neighbor center
            if (cohCount > 0) {
                const cx = cohX / cohCount, cy = cohY / cohCount, cz = cohZ / cohCount;
                let dx = cx - a.x, dy = cy - a.y, dz = cz - a.z;
                const dl = Math.hypot(dx, dy, dz);
                if (dl > 0) {
                    dx = dx / dl * MAX_SPEED;
                    dy = dy / dl * MAX_SPEED;
                    dz = dz / dl * MAX_SPEED;
                    a.ax += (dx - a.vx) * W_COHESION;
                    a.ay += (dy - a.vy) * W_COHESION;
                    a.az += (dz - a.vz) * W_COHESION;
                }
            }
            // HOMING — pull toward HOME if outside HOME_RADIUS
            const hd = Math.hypot(a.x, a.y - HOME_Y, a.z);
            if (hd > HOME_RADIUS) {
                const k = (hd - HOME_RADIUS) / HOME_RADIUS;
                a.ax += -a.x / hd * MAX_SPEED * W_HOMING * k;
                a.ay += -(a.y - HOME_Y) / hd * MAX_SPEED * W_HOMING * k;
                a.az += -a.z / hd * MAX_SPEED * W_HOMING * k;
            }

            // Clamp accel magnitude to MAX_FORCE × MAX_SPEED so a
            // single dominant force can't yank the boid
            const al = Math.hypot(a.ax, a.ay, a.az);
            const maxA = MAX_FORCE * MAX_SPEED;
            if (al > maxA) {
                const s = maxA / al;
                a.ax *= s; a.ay *= s; a.az *= s;
            }
        }

        // Integrate + clamp + route
        for (const b of boids) {
            b.vx += b.ax * dt;
            b.vy += b.ay * dt;
            b.vz += b.az * dt;
            // Damp Y velocity a little so flock stays near home height
            b.vy *= 0.985;
            const vl = Math.hypot(b.vx, b.vy, b.vz);
            if (vl > MAX_SPEED) {
                b.vx = b.vx / vl * MAX_SPEED;
                b.vy = b.vy / vl * MAX_SPEED;
                b.vz = b.vz / vl * MAX_SPEED;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;

            // Heading from velocity, so the boid mesh "faces" its motion
            if (Math.abs(b.vx) > 0.01 || Math.abs(b.vz) > 0.01) {
                b.yaw = Math.atan2(b.vx, b.vz);
            }

            ctx.router?.exec?.({
                type: "entity:move",
                id:   b.id,
                x:    b.x, y: b.y, z: b.z,
                yaw:  b.yaw,
            });
        }
    },

    stop(ctx) {
        for (const b of boids) {
            ctx.despawnEntity?.(b.id);
        }
        boids = [];
        console.log("[boids] stopped");
    },
};
