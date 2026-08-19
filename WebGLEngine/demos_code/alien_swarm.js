// demos_code/alien_swarm.js — boids-rule flocking aliens that PURSUE
// the player.
//
// This is the first AI translation from the bio/evo demo collection
// into actual enemy AI. Takes the Reynolds flocking algorithm from
// boids.js (which was a port of ComputeBoidSystem) and adds a
// PURSUIT force toward the camera. Result: 12 aliens move as a
// coordinated swarm — they separate when crowded, align headings,
// cohere into groups, AND converge on the player.
//
// Compare with alien_patrol.js (which spawns 8 independently-wandering
// aliens). Same engine, same entity kinds, same number, but the
// gameplay feel is completely different: instead of "8 wandering
// dots" you get "a hunting pack".
//
// VBA source: combines ComputeBoidSystem.cls (the flocking math) with
// the wandering-alien spawn from DemoLevel.bas.

const NUM_ALIENS         = 12;
const SPAWN_RADIUS       = 45;     // initial ring distance from camera
const HOME_Y             = 35;     // flight altitude

const MAX_SPEED          = 7.5;
const MAX_FORCE          = 0.40;
const VISION_RADIUS      = 14;
const VISION_RADIUS_SQ   = VISION_RADIUS * VISION_RADIUS;
const SEP_RADIUS         = 5.5;
const SEP_RADIUS_SQ      = SEP_RADIUS * SEP_RADIUS;
const W_SEPARATION       = 1.9;
const W_ALIGNMENT        = 0.9;
const W_COHESION         = 0.7;
const W_PURSUIT          = 1.2;    // strength of "chase player" force
const PURSUIT_RANGE      = 80;     // start chasing when this close to player
const ATTACK_RANGE       = 6;      // close enough to "circle" the player
const CIRCLE_RADIUS      = 8;      // distance held while circling

// One alien kind, varied just enough to read as a swarm rather than
// uniform paste. Hellspawn red for hostile read.
const ALIEN_KINDS = [
    "alien_hostile",
    "kaiju_hell",
    "kaiju_tech",
];

let aliens = [];

function rand(ctx, min, max) {
    return min + ctx.rand() * (max - min);
}

function getPlayerPos(ctx) {
    const cam = ctx.camera;
    return {
        x: cam?.position?.x ?? 0,
        y: cam?.position?.y ?? 35,
        z: cam?.position?.z ?? 0,
    };
}

export default {
    id:    "alien_swarm",
    label: "ALIEN SWARM (BOIDS → ENEMY AI)",
    hint:  "Flocking aliens that pursue the player — first demo-to-AI translation",
    controls: [
        `Auto — ${NUM_ALIENS} aliens flock and converge on camera`,
        "Watch them split/merge as they navigate; circle when close",
        "Compare with alien_patrol (no flocking, no pursuit)",
    ],

    start(ctx) {
        const player = getPlayerPos(ctx);
        aliens = [];
        for (let i = 0; i < NUM_ALIENS; i++) {
            const angle = (i / NUM_ALIENS) * Math.PI * 2 + ctx.rand() * 0.3;
            const radius = SPAWN_RADIUS + rand(ctx, -5, 5);
            const x = player.x + Math.cos(angle) * radius;
            const z = player.z + Math.sin(angle) * radius;
            const y = HOME_Y + rand(ctx, -3, 3);
            const kind = ALIEN_KINDS[i % ALIEN_KINDS.length];
            const id = ctx.spawnMesh(kind, x, y, z, 1.4);
            if (id == null) {
                console.warn(`[alien_swarm] spawnMesh ${i} returned null`);
                continue;
            }
            aliens.push({
                id, x, y, z,
                vx: -Math.cos(angle) * 2,    // initial drift toward player
                vy: 0,
                vz: -Math.sin(angle) * 2,
                ax: 0, ay: 0, az: 0,
                yaw: angle + Math.PI,
            });
        }
        ctx.kpop?.info?.("Alien Swarm", `${aliens.length} flocking enemies inbound`);
        console.log("[alien_swarm] started;", aliens.length, "aliens");
    },

    tick(ctx, dt) {
        if (!aliens.length) return;
        if (dt > 0.1) dt = 0.1;

        const player = getPlayerPos(ctx);

        // Reset accumulators
        for (const a of aliens) { a.ax = 0; a.ay = 0; a.az = 0; }

        // Pairwise flocking (separation + alignment + cohesion)
        for (let i = 0; i < aliens.length; i++) {
            const a = aliens[i];
            let sepX = 0, sepY = 0, sepZ = 0, sepCount = 0;
            let aliX = 0, aliY = 0, aliZ = 0, aliCount = 0;
            let cohX = 0, cohY = 0, cohZ = 0, cohCount = 0;

            for (let j = 0; j < aliens.length; j++) {
                if (i === j) continue;
                const b = aliens[j];
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 > VISION_RADIUS_SQ || d2 < 1e-4) continue;
                cohX += b.x; cohY += b.y; cohZ += b.z; cohCount++;
                aliX += b.vx; aliY += b.vy; aliZ += b.vz; aliCount++;
                if (d2 < SEP_RADIUS_SQ) {
                    const inv = 1 / Math.sqrt(d2);
                    sepX += dx * inv;
                    sepY += dy * inv;
                    sepZ += dz * inv;
                    sepCount++;
                }
            }
            // separation steer
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
            // alignment steer
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
            // cohesion steer
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
            // PURSUIT — converge on player when in range. When close
            // enough (ATTACK_RANGE), switch to circling instead of
            // ramming so the swarm forms a ring around the player.
            const px = player.x - a.x;
            const py = player.y - a.y;
            const pz = player.z - a.z;
            const pd = Math.hypot(px, py, pz);
            if (pd < PURSUIT_RANGE && pd > 0.01) {
                let tx, ty, tz;
                if (pd > ATTACK_RANGE) {
                    // Approach
                    tx = px / pd * MAX_SPEED;
                    ty = py / pd * MAX_SPEED * 0.4;
                    tz = pz / pd * MAX_SPEED;
                } else {
                    // Circle. Compute a tangent direction perpendicular
                    // to the radial from player. Each alien circles in
                    // a stable but per-alien-deterministic direction
                    // based on its id parity.
                    const sign = (a.id & 1) ? 1 : -1;
                    const tnx =  pz / pd * sign;
                    const tnz = -px / pd * sign;
                    // Slight pull toward CIRCLE_RADIUS so they don't drift away
                    const adjust = (pd - CIRCLE_RADIUS) * 0.5;
                    tx = (tnx + (px / pd) * adjust * 0.1) * MAX_SPEED;
                    ty = py / pd * MAX_SPEED * 0.2;
                    tz = (tnz + (pz / pd) * adjust * 0.1) * MAX_SPEED;
                }
                a.ax += (tx - a.vx) * W_PURSUIT;
                a.ay += (ty - a.vy) * W_PURSUIT;
                a.az += (tz - a.vz) * W_PURSUIT;
            }

            // Clamp accel
            const al = Math.hypot(a.ax, a.ay, a.az);
            const maxA = MAX_FORCE * MAX_SPEED;
            if (al > maxA) {
                const s = maxA / al;
                a.ax *= s; a.ay *= s; a.az *= s;
            }
        }

        // Integrate + commit
        for (const b of aliens) {
            b.vx += b.ax * dt;
            b.vy += b.ay * dt;
            b.vz += b.az * dt;
            // Damp vertical motion so swarm stays roughly at altitude
            b.vy *= 0.97;
            const vl = Math.hypot(b.vx, b.vy, b.vz);
            if (vl > MAX_SPEED) {
                b.vx = b.vx / vl * MAX_SPEED;
                b.vy = b.vy / vl * MAX_SPEED;
                b.vz = b.vz / vl * MAX_SPEED;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.z += b.vz * dt;
            // Soft ground avoidance
            const groundY = (ctx.getSurfaceY?.(b.x, b.z) ?? 0) + 2.5;
            if (b.y < groundY) { b.y = groundY; b.vy = Math.max(0, b.vy); }

            // Heading
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
        for (const a of aliens) ctx.despawnEntity?.(a.id);
        aliens = [];
        console.log("[alien_swarm] stopped");
    },
};
