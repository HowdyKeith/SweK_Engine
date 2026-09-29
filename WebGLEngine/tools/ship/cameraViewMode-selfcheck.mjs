// WebGLEngine/tools/ship/cameraViewMode-selfcheck.mjs -- v4628
//
// Gates camera/camera.js's task board #81 work: toggleViewMode()/_thirdPersonEye() (the camera toggle) and
// movementAnimState() (the animation-state half of "drive walk/run/jump animation clips from the
// controller's movement state" -- no visible player avatar exists in this engine yet for the CLIP half to
// attach to; this is the state derivation the day one does exist would consume).
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
    c.position = { x: 0, y: 5, z: 0 };
    c.yaw = 0; c.pitch = 0;
    c.velocity = { x: 0, y: 0, z: 0 };
    c.keys = new Set();
    c._extMove = null;
    c.playerEnergy = null;
    c._sprinting = false;
    c.mode = "fp";
    c.viewMode = "first";
    c.world = world || null;
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
    c._thirdPersonDistance = 4.5;
    c._thirdPersonHeight = 1.2;
    c._thirdPersonSkin = 0.3;
    c._fpFallStartTime = 0;
    c._shakeUntilT = 0; c._fovKickUntilT = 0; c._fovKickAmp = 0; c._fovSprint = 0; c._fovLastT = 0;
    c.fov = 70 * Math.PI / 180; c.near = 0.1; c.far = 1000;
    c.canvas = null;
    c.viewProj = new Float32Array(16);
    return c;
}

console.log("1. toggleViewMode() -- DEFAULT, TOGGLE, RETURN VALUE");
{
    const c = freshCamera();
    ok("  defaults to first person", c.viewMode === "first");
    const r1 = c.toggleViewMode();
    ok("!! toggling flips to third and returns the new mode", r1 === "third" && c.viewMode === "third");
    const r2 = c.toggleViewMode();
    ok("  toggling again flips back to first", r2 === "first" && c.viewMode === "first");
}

console.log("\n2. update() USES this.position FOR THE MATRIX BUT NEVER MUTATES IT, EVEN IN THIRD PERSON");
{
    const c = freshCamera();
    c.position = { x: 3, y: 4, z: 5 };
    c.viewMode = "third";
    c._move = () => {};   // isolate update()'s eye-selection from any _move* side effect
    c.update();
    ok("!! *** this.position is untouched after a third-person update() -- it stays the physics anchor ***",
       c.position.x === 3 && c.position.y === 4 && c.position.z === 5,
       `position=[${c.position.x},${c.position.y},${c.position.z}]`);
}

console.log("\n3. _thirdPersonEye() -- THE UNOCCLUDED CASE, YAW/PITCH BOTH AT ZERO");
{
    const c = freshCamera();
    c.position = { x: 0, y: 10, z: 0 };
    c.yaw = 0; c.pitch = 0;   // forward = (0,0,-1) -> back = (0,0,1)
    const eye = c._thirdPersonEye();
    ok("!! *** the eye sits BEHIND the player along -forward, at full _thirdPersonDistance with no obstruction ***",
       Math.abs(eye.x - 0) < 1e-9 && Math.abs(eye.z - c._thirdPersonDistance) < 1e-9,
       `eye=[${eye.x.toFixed(3)},${eye.y.toFixed(3)},${eye.z.toFixed(3)}]`);
    ok("  ...and above by _thirdPersonHeight", Math.abs(eye.y - (10 + c._thirdPersonHeight)) < 1e-9, `eye.y=${eye.y.toFixed(3)}`);
}

console.log("\n4. _thirdPersonEye() -- A WALL BEHIND THE PLAYER PULLS THE EYE IN, NOT THROUGH IT");
{
    const wall = trianglesFrom([[-10, -5, 2], [10, -5, 2], [10, 5, 2], [-10, 5, 2]], [[0, 1, 2], [0, 2, 3]]);
    const bvh = new MeshBVH(wall);
    const c = freshCamera({ colliderBVH: bvh });
    c.position = { x: 0, y: 0, z: 0 };
    c.yaw = 0; c.pitch = 0;   // back = (0,0,1) -- straight toward the wall at z=2
    const eye = c._thirdPersonEye();
    ok("!! *** the eye stops short of the wall (z=2) instead of the full 4.5-unit distance past it ***",
       eye.z < 2 && eye.z > 2 - c._thirdPersonSkin - 0.05, `eye.z=${eye.z.toFixed(4)}, wall at z=2`);

    const clear = freshCamera({ colliderBVH: bvh });
    clear.position = { x: 0, y: 0, z: 0 };
    clear.yaw = Math.PI; clear.pitch = 0;   // back = (0,0,-1) -- AWAY from the wall, nothing in range
    const eyeClear = clear._thirdPersonEye();
    ok("  ...but the SAME wall does not clip a camera backing AWAY from it",
       Math.abs(eyeClear.z - (-c._thirdPersonDistance)) < 1e-9, `eye.z=${eyeClear.z.toFixed(4)}`);
}

console.log("\n5. movementAnimState() -- PURE DERIVATION FROM FIELDS EVERY MOVE PATH ALREADY WRITES");
{
    const c = freshCamera();
    c.mode = "observer";
    ok("  not in fp mode at all -> idle", c.movementAnimState() === "idle");

    c.mode = "fp"; c._fpOnGround = true; c.velocity = { x: 0, y: 0, z: 0 };
    ok("!! grounded, no horizontal speed -> idle", c.movementAnimState() === "idle");

    c._sprinting = false; c.velocity = { x: 3, y: 0, z: 0 };
    ok("!! grounded, moving, not sprinting -> walk", c.movementAnimState() === "walk");

    c._sprinting = true; c.velocity = { x: 8, y: 0, z: 0 };
    ok("!! *** grounded, moving, sprinting -> run *** (the SAME _sprinting the voxel path already sets before any of Stage A/B's branches run)",
       c.movementAnimState() === "run");

    c._fpOnGround = false; c._fpVelY = 5;
    ok("!! airborne, rising -> jump", c.movementAnimState() === "jump");

    c._fpVelY = -3;
    ok("!! airborne, falling -> fall", c.movementAnimState() === "fall");
}

console.log("\n6. movementAnimState() DRIVEN END-TO-END THROUGH THE REAL CAPSULE PATH, NOT JUST HAND-SET FIELDS");
{
    const floor = trianglesFrom([[-20, 0, -20], [20, 0, -20], [20, 0, 20], [-20, 0, 20]], [[0, 1, 2], [0, 2, 3]]);
    const bvh = new MeshBVH(floor);
    const c = freshCamera({ colliderBVH: bvh });
    c.position = { x: 0, y: 10, z: 0 };
    for (let i = 0; i < 200; i++) c._moveFP(1 / 60);   // fall and settle
    ok("!! settled, no keys held -> idle", c.movementAnimState() === "idle", `state=${c.movementAnimState()}`);

    c.keys.add("KeyW");
    for (let i = 0; i < 30; i++) c._moveFP(1 / 60);
    ok("!! KeyW held, grounded -> walk", c.movementAnimState() === "walk", `state=${c.movementAnimState()}`);

    c.keys.add("ShiftLeft");
    for (let i = 0; i < 30; i++) c._moveFP(1 / 60);
    ok("!! + ShiftLeft held -> run", c.movementAnimState() === "run", `state=${c.movementAnimState()}`);

    c.keys.delete("KeyW"); c.keys.delete("ShiftLeft");
    c.keys.add("Space");
    c._moveFP(1 / 60);
    ok("!! *** Space -> jump, on the very next frame ***", c.movementAnimState() === "jump", `state=${c.movementAnimState()}`);
}

console.log();
if (fails) { console.log("[cameraViewMode-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[cameraViewMode-selfcheck] all passed");
