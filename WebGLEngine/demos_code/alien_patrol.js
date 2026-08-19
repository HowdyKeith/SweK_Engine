// demos_code/alien_patrol.js — port of the VBA engine's DemoLevel
//
// The VBA engine's DemoLevel.bas runs a headless simulation with a
// wandering alien enemy that patrols, picks new directions
// periodically, and exports its state to JSON snapshots for WebGL
// consumption. This is the live equivalent — N aliens patrolling in
// the WebGL world directly.
//
// VBA reference: EngineCore_63_Enemies.xlsm → DemoLevel.bas → RunWorld()
//
// Each alien has:
//   - random spawn position on a ring around the camera
//   - random walking velocity
//   - small chance per frame to pick a new direction
//   - dies on alien_count cap

const NUM_ALIENS       = 8;
const SPAWN_RADIUS     = 35;     // how far from camera the aliens spawn
const ALIEN_SPEED      = 2.8;    // u/s
const DIR_CHANGE_PROB  = 0.012;  // per-frame chance of picking new heading
const PATROL_RADIUS    = 50;     // soft boundary — aliens turn back if past this
const SPAWN_Y_OFFSET   = 1.2;    // above terrain

let aliens = [];      // { id, x, y, z, vx, vz, yaw, alive }
let originX = 0;
let originZ = 0;

function pickHeading(ctx) {
    const angle = ctx.rand() * Math.PI * 2;
    return {
        vx: Math.cos(angle) * ALIEN_SPEED,
        vz: Math.sin(angle) * ALIEN_SPEED,
        yaw: angle,
    };
}

function spawnOne(ctx, idx) {
    // Distribute around the camera in a ring, slight jitter on radius
    const angle = (idx / NUM_ALIENS) * Math.PI * 2 + ctx.randRange(-0.3, 0.3);
    const r = SPAWN_RADIUS * ctx.randRange(0.7, 1.0);
    const x = originX + Math.cos(angle) * r;
    const z = originZ + Math.sin(angle) * r;
    const surface = ctx.getSurfaceY(x, z) ?? 0;
    const y = surface + SPAWN_Y_OFFSET;

    const id = ctx.spawnMesh("alien", x, y, z, 1.2);
    if (id == null) return null;

    const heading = pickHeading(ctx);
    return {
        id,
        x, y, z,
        vx: heading.vx,
        vz: heading.vz,
        yaw: heading.yaw,
        alive: true,
    };
}

export default {
    id:    "alien_patrol",
    label: "ALIEN PATROL",
    hint:  "wandering aliens — VBA DemoLevel.RunWorld ported to WebGL",
    controls: [
        "Auto — " + NUM_ALIENS + " aliens patrol around spawn",
        "They pick random headings, turn back at the patrol boundary",
        "Compare with EngineCore.xlsm → DemoLevel.RunWorld",
    ],

    start(ctx) {
        // Anchor patrol area at current camera XZ
        originX = ctx.camera?.position?.x ?? 0;
        originZ = ctx.camera?.position?.z ?? 0;

        aliens = [];
        for (let i = 0; i < NUM_ALIENS; i++) {
            const a = spawnOne(ctx, i);
            if (a) aliens.push(a);
        }
        ctx.kpop?.info?.("Alien patrol", aliens.length + " aliens spawned");
        console.log("[alien_patrol] started;", aliens.length, "aliens spawned around (",
                    originX.toFixed(1), ",", originZ.toFixed(1), ")");
    },

    tick(ctx, dt) {
        if (aliens.length === 0) return;

        for (const a of aliens) {
            if (!a.alive) continue;

            // Move
            a.x += a.vx * dt;
            a.z += a.vz * dt;
            // Snap Y to terrain (so they walk over the eroded landscape)
            const surface = ctx.getSurfaceY(a.x, a.z) ?? a.y;
            a.y = surface + SPAWN_Y_OFFSET;

            // Patrol boundary — if past PATROL_RADIUS from origin, turn back
            const dx = a.x - originX;
            const dz = a.z - originZ;
            const dist2 = dx * dx + dz * dz;
            if (dist2 > PATROL_RADIUS * PATROL_RADIUS) {
                // Vector toward origin, with small jitter so they don't all converge
                const back = Math.atan2(-dz, -dx) + ctx.randRange(-0.4, 0.4);
                a.vx = Math.cos(back) * ALIEN_SPEED;
                a.vz = Math.sin(back) * ALIEN_SPEED;
                a.yaw = back;
            } else if (ctx.rand() < DIR_CHANGE_PROB) {
                // Random direction change
                const h = pickHeading(ctx);
                a.vx = h.vx; a.vz = h.vz; a.yaw = h.yaw;
            }

            // Push the new transform to the renderer
            ctx.router?.exec?.({
                type: "entity:move",
                id:   a.id,
                x:    a.x,
                y:    a.y,
                z:    a.z,
                yaw:  a.yaw,
            });
        }
    },

    stop(ctx) {
        for (const a of aliens) {
            if (a.alive && a.id != null) {
                ctx.despawnEntity?.(a.id);
                a.alive = false;
            }
        }
        aliens = [];
        console.log("[alien_patrol] stopped");
    },
};
