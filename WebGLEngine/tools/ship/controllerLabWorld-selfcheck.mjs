// WebGLEngine/tools/ship/controllerLabWorld-selfcheck.mjs -- v4629
//
// Gates world/controllerLabWorld.mjs: the small live demo level for task board #13's arc. Drives the REAL
// Camera class (task #80/#81's own capsule path) through the level's REAL collider -- this is an end-to-end
// proof that the demo Keith opens in a browser actually plays the way its own hint text claims, not just that
// the geometry numbers are internally consistent.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);
const { MeshBVH } = await import(pathToFileURL(path.join(ENG, "mesh", "meshBVH.mjs")).href);
const { buildControllerLabWorld, controllerLabVoxelColumns, SPAWN } =
    await import(pathToFileURL(path.join(ENG, "world", "controllerLabWorld.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

function freshCamera(world) {
    const c = Object.create(Camera.prototype);
    c.position = { x: SPAWN.x, y: 10, z: SPAWN.z };
    c.yaw = SPAWN.yaw; c.pitch = 0;
    c.velocity = { x: 0, y: 0, z: 0 };
    c.keys = new Set();
    c._extMove = null;
    c.playerEnergy = null;
    c._sprinting = false;
    c.mode = "fp";
    c.viewMode = "first";
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
const settle = (c, n = 200) => { for (let i = 0; i < n; i++) c._moveFP(1 / 60); };
const walk = (c, yaw, seconds) => { c.yaw = yaw; c.keys.add("KeyW"); for (let i = 0; i < seconds * 60; i++) c._moveFP(1 / 60); c.keys.delete("KeyW"); };

console.log("1. THE COLLIDER -- SHAPE COUNT, AND THE TWO ANGLES ON THE CORRECT SIDES OF THE CUTOFF");
{
    const { colliderBVH, features } = buildControllerLabWorld();
    ok("!! *** exactly 22 triangles -- 11 quads, none silently dropped or duplicated ***", colliderBVH.count === 22, `count=${colliderBVH.count}`);
    const cutoffDeg = Math.acos(features.groundSupportNormalY) * 180 / Math.PI;
    ok("  the ramp's claimed angle is BELOW the GROUND_SUPPORT_NORMAL_Y cutoff", features.rampAngleDeg < cutoffDeg,
       `ramp=${features.rampAngleDeg.toFixed(2)} deg, cutoff=${cutoffDeg.toFixed(2)} deg`);
    ok("!! *** the steep ramp's claimed angle is ABOVE it, by a wide margin (not a close call) ***",
       features.steepRampAngleDeg > cutoffDeg + 5, `steep=${features.steepRampAngleDeg.toFixed(2)} deg`);
}

console.log("\n2. SPAWN IS ON FLAT, WALKABLE GROUND -- THE EXACT REGRESSION main.js's setMode(\"fp\") IS BLIND TO");
{
    // camera.js's setMode("fp") snaps via _terrainTopAt, which returns 0 unconditionally for any world with
    // no voxelAt -- correct here ONLY because the real ground truly is y=0 at spawn. If a future edit moved
    // SPAWN off the flat plate without updating this, the naive snap would be silently wrong and nothing in
    // camera.js itself would catch it -- this row is the catch.
    const { colliderBVH } = buildControllerLabWorld();
    const c = freshCamera({ colliderBVH });
    settle(c);
    ok("!! *** settles at y = eyeHeight above y=0 ground, not floating or sunk ***",
       c._fpOnGround === true && Math.abs(c.position.y - 1.7) < 1e-6, `y=${c.position.y.toFixed(4)}`);
}

console.log("\n3. THE WALKABLE RAMP IS ACTUALLY WALKABLE, END TO END THROUGH THE REAL CAPSULE PATH");
{
    const { colliderBVH, features } = buildControllerLabWorld();
    const c = freshCamera({ colliderBVH });
    settle(c);
    // 4s at walk speed 5 = 20 units -- covers spawn(x=0) to ramp-top(x=14) with room to spare onto the
    // platform (x 14..22), but deliberately short of ITS far edge (x=22) so the capsule does not sail off
    // the level entirely, which a longer walk (originally 6s = 30 units) did on the first run of this gate.
    walk(c, SPAWN.yaw, 4);   // SPAWN already faces +X, straight at the ramp
    ok("!! *** climbs the ramp and reaches the platform on top, roughly at rampTopY + eyeHeight ***",
       c.position.y > features.rampTopY + 1.7 - 0.3, `y=${c.position.y.toFixed(3)}, target=${(features.rampTopY + 1.7).toFixed(3)}`);
}

console.log("\n4. THE STEEP RAMP REFUSES, EVEN THOUGH IT SITS RIGHT BESIDE THE ONE THAT WORKS");
{
    const { colliderBVH } = buildControllerLabWorld();
    const c = freshCamera({ colliderBVH });
    c.position = { x: 4, y: 10, z: 12 };   // just outside the steep ramp's base (x 5..6.5, z 8..16)
    settle(c);
    const y0 = c.position.y;
    walk(c, 0, 5);   // yaw=0 -> forward = +X, straight at the steep ramp
    ok("!! *** does not climb -- ends up near ground height, not up at the steep ramp's 4-unit top ***",
       c.position.y < y0 + 1.0, `started y=${y0.toFixed(3)}, ended y=${c.position.y.toFixed(3)}`);
}

console.log("\n5. THE CORNER WALLS ACTUALLY BLOCK, AND A CORNER APPROACH DOES NOT TUNNEL THROUGH");
{
    const { colliderBVH } = buildControllerLabWorld();
    const c = freshCamera({ colliderBVH });
    c.position = { x: -14, y: 10, z: -5 };   // outside the corner pocket, wall A at z=-10 dead ahead
    settle(c);
    walk(c, Math.PI, 4);   // yaw=PI -> forward = -Z, straight at wall A
    ok("!! *** wall A stops the player well short of z=-10 (radius 0.4 clearance) ***",
       c.position.z > -10 + 0.35, `z=${c.position.z.toFixed(4)}, wall at z=-10`);
}

console.log("\n6. THE JUMP BLOCK NEEDS A JUMP -- WALKING IN ALONE DOES NOT GET YOU ON TOP");
{
    const { colliderBVH, features } = buildControllerLabWorld();
    const walkOnly = freshCamera({ colliderBVH });
    walkOnly.position = { x: -2.5, y: 10, z: 3 };   // south of the block (x -5..0, z 5..10)
    settle(walkOnly);
    walk(walkOnly, 0, 3);   // yaw=0 -> +X is not toward it; use explicit heading toward +Z instead
    walkOnly.yaw = Math.PI;   // forward = -Z... recompute: need +Z, which is yaw such that fz=-cos(yaw)=+1 -> yaw=PI
    for (let i = 0; i < 180; i++) { walkOnly.keys.add("KeyW"); walkOnly._moveFP(1 / 60); }
    ok("!! walking alone does not reach the block's top (JUMP_HEIGHT + eyeHeight)",
       walkOnly.position.y < features.jumpBlockHeight + 1.7 - 0.1, `y=${walkOnly.position.y.toFixed(3)}`);

    const withJump = freshCamera({ colliderBVH });
    withJump.position = { x: -2.5, y: 10, z: 3 };
    settle(withJump);
    withJump.yaw = Math.PI; withJump.keys.add("KeyW");
    for (let i = 0; i < 60; i++) withJump._moveFP(1 / 60);   // 1s approach -- comfortably pinned at the wall
    withJump.keys.add("Space"); withJump._moveFP(1 / 60); withJump.keys.delete("Space");
    // The wall's push-out is purely horizontal (a vertical face has no y-component to its normal), so the
    // jump's vertical arc is untouched by being blocked at the wall -- it rises, and for roughly t in
    // [0.167s, 0.667s] (solved from cy(t) = v0*t - 0.5*g*t^2 = JUMP_HEIGHT) the capsule's bottom clears the
    // wall's top entirely and forward holding finally makes real progress, landing on top well within 40
    // frames. *** THE FIRST DRAFT OF THIS ROW HELD KeyW FOR 240 MORE FRAMES AND FAILED, NOT BECAUSE THE JUMP
    // FAILED BUT BECAUSE IT SUCCEEDED TOO EARLY: *** the block's top is only 5 units deep (z 5..10), so 4
    // full seconds of continued forward walking at 5 u/s carries the player stright across it and off the
    // FAR edge, back down onto the ground beyond -- measured landing at y=1.7 (ground), not because the
    // capsule never reached the block but because the check ran long after it had already crossed and left
    // again. Releasing KeyW once landed, the way a player actually would, is the fix, not a longer window.
    for (let i = 0; i < 40; i++) withJump._moveFP(1 / 60);
    withJump.keys.delete("KeyW");
    for (let i = 0; i < 30; i++) withJump._moveFP(1 / 60);   // let it fully settle before reading the result
    ok("!! *** jumping DOES get the player onto the block's top ***",
       withJump._fpOnGround === true && Math.abs(withJump.position.y - (features.jumpBlockHeight + 1.7)) < 0.05,
       `y=${withJump.position.y.toFixed(4)}, target=${(features.jumpBlockHeight + 1.7).toFixed(4)}`);
}

console.log("\n7. THE VOXEL VISUAL STAND-IN -- SAME NUMBERS, NO SILENT GAP AT THE RAMP/PLATFORM SEAM");
{
    const { features } = buildControllerLabWorld();
    const cols = controllerLabVoxelColumns();
    ok("!! *** a non-trivial number of voxel columns were generated ***", cols.length > 50, `${cols.length} columns`);
    ok("  every column has a non-negative y and a finite x/z", cols.every(([x, y, z]) => y >= 0 && Number.isFinite(x) && Number.isFinite(z)));

    // The last ramp column (x closest to the platform) and the first platform column must reach the SAME
    // height -- a seam here would mean the voxel visual shows a step the invisible collider does not have,
    // which is exactly the kind of drift the header says the shared constants exist to prevent.
    const heightAt = (x, z) => 1 + Math.max(-1, ...cols.filter(([cx, , cz]) => cx === x && cz === z).map(([, y]) => y));
    const lastRampH = heightAt(13, 0);      // RAMP_X0 + RAMP_RUN - 1 = 13
    const firstPlatformH = heightAt(14, 0); // RAMP_X0 + RAMP_RUN = 14
    ok("!! *** the ramp's last step and the platform's first column reach the identical height ***",
       lastRampH === firstPlatformH, `ramp top=${lastRampH}, platform=${firstPlatformH}`);
}

console.log();
if (fails) { console.log("[controllerLabWorld-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[controllerLabWorld-selfcheck] all passed");
