// FILE: demos_code/pinball.js
//
// Example code-demo — drop in this folder, click ↻ on the DEMO
// dropdown, and "PINBALL" appears in the list.
//
// What it does:
//   - Clears the world and builds a small inclined arena (the
//     "pinball table") out of voxels.
//   - Spawns a ball entity that bounces around with simple physics.
//   - Camera positioned overhead, looking down at the table.
//   - Press Space to relaunch the ball if it falls off.
//
// Not a real pinball game — flippers + scoring + tilt detection
// would be a whole project. This is the minimum viable shape of
// what a code-demo can do.

const BALL_RADIUS  = 0.6;
const GRAVITY      = -20;
const BOUNCE       = 0.6;
const TABLE_TILT   = -0.18;        // radians, table leans toward player
const TABLE_W      = 16;
const TABLE_D      = 28;
const TABLE_BASE_Y = 30;

let ballId        = null;
let ballPos       = { x: 0, y: 0, z: 0 };
let ballVel       = { x: 0, y: 0, z: 0 };
let keydownHandler = null;

export default {
    id:    "pinball",
    label: "PINBALL",
    hint:  "drop-in code-demo example",
    controls: [
        "Mouse / WASD — look around the table",
        "Space — relaunch ball if it falls off",
        "(this is a code-demo template — flippers + scoring not implemented)",
    ],

    // -----------------------------------------------------------
    start({ world, renderer, camera, router, persistence, toaster }) {
        // Wipe whatever was on screen
        try {
            world.regenerate();
            renderer.meshes.clear();
            persistence.clear();
        } catch (e) {
            console.warn("[pinball] reset failed (continuing):", e);
        }

        // Build a small playfield. Walls form a 3-sided box with a
        // gap at the bottom (so a missed ball can fall off — adds
        // the "tilt the table" feel without a real tilt system).
        const cx = 0, cz = 0;
        const baseY = TABLE_BASE_Y;
        // Floor
        for (let dx = -TABLE_W/2; dx <= TABLE_W/2; dx++) {
            for (let dz = -TABLE_D/2; dz <= TABLE_D/2; dz++) {
                router.exec({ type: "voxel:set",
                    x: cx + dx, y: baseY, z: cz + dz, v: 7 });
            }
        }
        // Side walls
        for (let dz = -TABLE_D/2; dz <= TABLE_D/2; dz++) {
            for (let h = 1; h <= 3; h++) {
                router.exec({ type: "voxel:set",
                    x: cx - TABLE_W/2, y: baseY + h, z: cz + dz, v: 12 });
                router.exec({ type: "voxel:set",
                    x: cx + TABLE_W/2, y: baseY + h, z: cz + dz, v: 12 });
            }
        }
        // Top wall (the launcher end)
        for (let dx = -TABLE_W/2; dx <= TABLE_W/2; dx++) {
            for (let h = 1; h <= 3; h++) {
                router.exec({ type: "voxel:set",
                    x: cx + dx, y: baseY + h, z: cz - TABLE_D/2, v: 12 });
            }
        }
        // (No bottom wall — ball falls off there)

        // Spawn the ball
        ballPos = { x: 0, y: baseY + 2, z: -TABLE_D/2 + 4 };
        ballVel = { x: 0, y: 0, z: 8 };  // initial launch
        ballId  = "pinball-ball-" + Date.now();
        router.exec({
            type: "entity:spawnMesh",
            id: ballId,
            assetId: "alien",   // placeholder — replace with a sphere asset
            x: ballPos.x, y: ballPos.y, z: ballPos.z,
            scale: 0.4,
            kind: "ball",
        });

        // Camera: overhead, slightly behind
        camera.x = 0;
        camera.y = baseY + 22;
        camera.z = -TABLE_D/2 - 16;
        camera.yaw = 0;
        camera.pitch = -0.65;

        // Relaunch key
        keydownHandler = (e) => {
            if (e.code === "Space") {
                ballPos = { x: 0, y: baseY + 2, z: -TABLE_D/2 + 4 };
                ballVel = { x: (Math.random() - 0.5) * 2, y: 0, z: 8 };
                toaster?.show?.("Relaunched", 1200);
                e.preventDefault();
            }
        };
        document.addEventListener("keydown", keydownHandler);

        toaster?.show?.("Pinball loaded. Space relaunches.", 2500);
    },

    // -----------------------------------------------------------
    stop({ router }) {
        if (ballId) {
            try { router.exec({ type: "entity:despawn", id: ballId }); } catch {}
            ballId = null;
        }
        if (keydownHandler) {
            document.removeEventListener("keydown", keydownHandler);
            keydownHandler = null;
        }
    },

    // -----------------------------------------------------------
    tick({ router }, dt) {
        if (!ballId) return;

        // Simple AABB physics
        ballVel.y += GRAVITY * dt;
        // Table tilt: small forward push (toward +z = toward player)
        ballVel.z += Math.sin(TABLE_TILT) * GRAVITY * dt * 0.6;

        ballPos.x += ballVel.x * dt;
        ballPos.y += ballVel.y * dt;
        ballPos.z += ballVel.z * dt;

        // Floor bounce
        const floorY = TABLE_BASE_Y + 1 + BALL_RADIUS;
        if (ballPos.y < floorY) {
            ballPos.y = floorY;
            ballVel.y = -ballVel.y * BOUNCE;
            if (Math.abs(ballVel.y) < 1) ballVel.y = 0;
        }

        // Side walls
        const wallX = TABLE_W/2 - BALL_RADIUS;
        if (ballPos.x > wallX)  { ballPos.x = wallX;  ballVel.x = -ballVel.x * BOUNCE; }
        if (ballPos.x < -wallX) { ballPos.x = -wallX; ballVel.x = -ballVel.x * BOUNCE; }

        // Top wall
        const topZ = -TABLE_D/2 + BALL_RADIUS + 1;
        if (ballPos.z < topZ) { ballPos.z = topZ; ballVel.z = -ballVel.z * BOUNCE; }

        // Fell off the bottom — wait for Space
        if (ballPos.z > TABLE_D/2 + 5) {
            ballVel.x = ballVel.y = ballVel.z = 0;
        }

        // Push position to renderer
        try {
            router.exec({
                type: "entity:move",
                id: ballId,
                x: ballPos.x,
                y: ballPos.y,
                z: ballPos.z,
            });
        } catch {
            // entity may have been despawned externally
            ballId = null;
        }
    },
};
