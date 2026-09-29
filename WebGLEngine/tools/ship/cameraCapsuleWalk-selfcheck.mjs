// WebGLEngine/tools/ship/cameraCapsuleWalk-selfcheck.mjs -- v4628
//
// Gates camera/camera.js's _capsuleWorldBVH/_moveFPCapsule (task board #80): the live-input wiring for
// physics/character/capsuleCollide.mjs, the same relationship cameraTerrainWalk-selfcheck.mjs's subject has
// to terrainWalk.mjs. capsuleCollide.mjs's own gate proves the geometry; this proves the FP controller
// actually reaches it and behaves like a player controller should -- settles on a floor, is blocked by a
// wall, and still jumps -- when the world offers a real triangle-mesh collider.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);
const { MeshBVH, trianglesFrom } = await import(pathToFileURL(path.join(ENG, "mesh", "meshBVH.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

function freshCamera(world) {
    const c = Object.create(Camera.prototype);
    c.position = { x: 0, y: 30, z: 0 };
    c.yaw = 0; c.pitch = 0;
    c.velocity = { x: 0, y: 0, z: 0 };
    c.keys = new Set();
    c._extMove = null;
    c.playerEnergy = null;
    c._sprinting = false;
    c.mode = "fp";
    c.world = world;
    c._fpVelY = 0;
    c._fpOnGround = false;
    c._eyeHeight = 1.7;
    c._fpWalkSpeed = 5;
    c._fpSprintSpeed = 9;
    c._fpJumpVel = 7.5;
    c._gravity = 18;
    c._fpMaxSlopeDeg = 50;
    c._capsuleRadius = 0.4;
    c._capsuleHeight = 1.8;
    c._fpFallStartTime = 0;
    return c;
}

function settle(c, frames = 300, dt = 1 / 60) { for (let i = 0; i < frames; i++) c._moveFP(dt); }

// A floor spanning +/-20 in x and z, plus a wall at z=-5 running across x, both in one collider so a
// walk-forward run can hit both in sequence -- floor first, then the wall stopping further progress.
function floorAndWallWorld() {
    const floor = trianglesFrom(
        [[-20, 0, -20], [20, 0, -20], [20, 0, 20], [-20, 0, 20]],
        [[0, 1, 2], [0, 2, 3]],
    );
    const wall = trianglesFrom(
        [[-20, 0, -5], [20, 0, -5], [20, 8, -5], [-20, 8, -5]],
        [[0, 1, 2], [0, 2, 3]],
    );
    const buf = new Float64Array(floor.length + wall.length);
    buf.set(floor, 0); buf.set(wall, floor.length);
    return { colliderBVH: new MeshBVH(buf) };
}

console.log("1. _capsuleWorldBVH() ONLY FIRES WHEN THE WORLD OFFERS colliderBVH, AND WINS OVER THE OTHER PATHS");
{
    ok("  no colliderBVH -> null", freshCamera({})._capsuleWorldBVH() === null);
    const withBVH = floorAndWallWorld();
    ok("!! *** a colliderBVH world DOES get a live BVH back ***", freshCamera(withBVH)._capsuleWorldBVH() === withBVH.colliderBVH);
    // A world with BOTH voxelAt and colliderBVH -- the capsule path is documented to take priority over the
    // voxel path (camera.js's own comment: "most general of the three and subsumes"). Confirmed by observing
    // that a voxelAt world with no colliderBVH stands at y=0-per-voxel while the SAME camera with colliderBVH
    // ALSO set settles on the mesh floor's own y=0 plane exactly the way the capsule path would, not via
    // _canStandAt's voxel scan (which would need a real voxelAt implementation to test against; here voxelAt
    // is a stub that would otherwise leave the camera un-collided).
    const both = { voxelAt: () => 0, colliderBVH: withBVH.colliderBVH };
    const c = freshCamera(both);
    settle(c);
    ok("!! *** with both voxelAt and colliderBVH present, the capsule path is the one that actually ran ***",
       c._fpOnGround === true && Math.abs(c.position.y - (0 + c._eyeHeight)) < 1e-6,
       `a voxelAt stub returning 0 (air) everywhere would never ground the camera on its own -- settling at ` +
       `eyeHeight above the mesh floor (y=${c.position.y.toFixed(4)}) proves depenetrateCapsule ran, not _canStandAt`);
}

console.log("\n2. THE LIVE CONTROLLER SETTLES ON THE MESH FLOOR AND IS BLOCKED BY THE MESH WALL");
{
    const world = floorAndWallWorld();
    const c = freshCamera(world);
    settle(c, 300);
    ok("!! *** falls from y=30 and settles standing on the mesh floor ***",
       c._fpOnGround === true && Math.abs(c.position.y - (0 + c._eyeHeight)) < 1e-6,
       `settled y=${c.position.y.toFixed(4)}`);

    c.yaw = Math.PI;   // forward (fx=sin(yaw), fz=-cos(yaw)) = (0, +1) at yaw=PI -- toward +z, AWAY from the wall at z=-5
    // Walk toward +z first to confirm free movement away from the wall works at all.
    c.keys.add("KeyW");
    for (let i = 0; i < 120; i++) c._moveFP(1 / 60);
    ok("  walking away from the wall covers real ground", c.position.z > 3, `z=${c.position.z.toFixed(3)}`);

    // Now walk toward the wall (yaw=0 -> forward is -z) from a fresh drop, far enough back that it will
    // reach z=-5+radius and stop there rather than tunnel through in one substep.
    const c2 = freshCamera(world);
    c2.position.x = 0; c2.position.z = 3;
    settle(c2, 120);
    c2.yaw = 0;
    c2.keys.add("KeyW");
    for (let i = 0; i < 300; i++) c2._moveFP(1 / 60);   // 5s, would cover 25 units at walk speed with no wall
    ok("!! *** the mesh wall actually stops the player, same as three-player-controller's own capsule push-out ***",
       c2.position.z > -5 + 0.4 - 0.05, `stopped at z=${c2.position.z.toFixed(4)}, wall at z=-5, radius=0.4`);
    ok("  ...and it did not just freeze at its start -- it travelled most of the 8 units of clear room first",
       c2.position.z < 3 - 5, `traveled from z=3 to z=${c2.position.z.toFixed(4)}`);
}

console.log("\n3. JUMP STILL WORKS THROUGH THE CAPSULE PATH");
{
    const world = floorAndWallWorld();
    const c = freshCamera(world);
    settle(c, 200);
    const groundY = c.position.y;
    c.keys.add("Space");
    c._moveFP(1 / 60);
    ok("!! Space launches upward and clears _fpOnGround", c._fpVelY > 0 && c._fpOnGround === false, `_fpVelY=${c._fpVelY}`);
    c.keys.delete("Space");
    let peak = groundY;
    for (let i = 0; i < 120; i++) { c._moveFP(1 / 60); if (c.position.y > peak) peak = c.position.y; }
    ok("  rises above the floor before gravity returns it", peak > groundY + 0.1, `peak=${peak.toFixed(3)}`);
    ok("  ...and lands back exactly on the floor", c._fpOnGround === true && Math.abs(c.position.y - groundY) < 1e-6,
       `final y=${c.position.y.toFixed(4)}`);
}

console.log();
if (fails) { console.log("[cameraCapsuleWalk-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[cameraCapsuleWalk-selfcheck] all passed");
