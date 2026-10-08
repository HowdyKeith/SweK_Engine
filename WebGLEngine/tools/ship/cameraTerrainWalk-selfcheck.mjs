// WebGLEngine/tools/ship/cameraTerrainWalk-selfcheck.mjs -- v4628
//
// Gates camera/camera.js's _terrainGroundOracle/_moveFPTerrain (task board #13, Stage A).
//
// *** THE BUG THIS EXISTS TO CATCH: A WORLD WITH NO voxelAt SILENTLY HAD NO GROUND AT ALL. ***
// Before this round, _terrainTopAtBilinear returned 0 (its `if (!this.world?.voxelAt) return 0;` guard)
// and _canStandAt returned true unconditionally (the same guard) for any world that does not expose
// voxelAt -- a heightfield-only or mesh-only world. The FP camera would neither stand on such a world's
// real surface nor ever be blocked; it would just walk through open air toward y = eyeHeight. That is
// indistinguishable from "it works" unless something asserts the position actually tracks the surface,
// which is what section 2 below does with a height function whose value at spawn is far from zero.
//
// physics/character/terrainWalk.mjs already carries the slope-correct math (frame-rate-independent
// slope limit tested on the surface normal, not the per-step height delta) and simulation/BotManager.js
// already proves it out for AI movement; this gate is the human-input counterpart, built the same way
// cameraKeys-selfcheck.mjs builds a Camera without running its DOM-touching constructor.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// A Camera with none of the constructor's DOM-touching side effects (_attachInput), same technique
// cameraKeys-selfcheck.mjs uses -- only the fields _moveFP/_moveFPTerrain/_terrainGroundOracle read.
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
    c._fpFallStartTime = 0;
    return c;
}

function settle(c, frames = 240, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) c._moveFP(dt);
}

console.log("1. THE ORACLE ONLY FIRES FOR A WORLD WITH NO voxelAt, AND ONLY WHEN ONE IS OFFERED");
{
    const voxelWorld = { voxelAt: () => 0 };
    const bareWorld = {};
    const heightWorld = { _heightAt: (x, z) => 10 + 0.3 * x };
    ok("!! *** a voxel world (voxelAt present) never takes the terrain branch ***",
       freshCamera(voxelWorld)._terrainGroundOracle() === null,
       "the two live voxel FP demos (fps, fp_control) must be byte-for-byte unaffected by this round");
    ok("  a world with neither voxelAt nor _heightAt nor groundBVH also gets no oracle",
       freshCamera(bareWorld)._terrainGroundOracle() === null);
    ok("!! *** a world with _heightAt and no voxelAt DOES get an oracle ***",
       freshCamera(heightWorld)._terrainGroundOracle() !== null,
       "this is the case that had NO ground at all before this round");
    const c = freshCamera(heightWorld);
    const o1 = c._terrainGroundOracle(), o2 = c._terrainGroundOracle();
    ok("  ...and it is cached against world identity, not rebuilt every call",
       o1 === o2, "BotManager._groundOracle() does the same for the same reason -- cost, not correctness");
}

console.log("\n2. THE POSITION TRACKS THE REAL SURFACE, NOT A SILENT FALL-THROUGH TO OPEN AIR");
{
    // Base height 10 at x=0 -- far from the 0 that _terrainTopAtBilinear's old no-voxelAt guard would
    // have produced, so "it settled at eyeHeight above 0" and "it settled on the real surface" cannot
    // be confused with each other.
    const hAt = (x, z) => 10 + 0.05 * x;
    const c = freshCamera({ _heightAt: hAt });
    settle(c, 300);   // no keys held -- should simply fall and land
    const wantY = hAt(c.position.x, c.position.z) + c._eyeHeight;
    ok("!! *** with no input, the camera falls and lands ON THE HEIGHT FUNCTION'S SURFACE ***",
       c._fpOnGround === true && Math.abs(c.position.y - wantY) < 1e-6,
       `landed at y=${c.position.y.toFixed(4)}, surface+eye=${wantY.toFixed(4)}`);

    const c2 = freshCamera({ _heightAt: hAt });
    settle(c2, 120);                 // land first
    c2.keys.add("KeyW");
    for (let i = 0; i < 180; i++) c2._moveFP(1 / 60);   // walk forward 3s
    const moved = Math.hypot(c2.position.x - 0, c2.position.z - 0);
    const wantY2 = hAt(c2.position.x, c2.position.z) + c2._eyeHeight;
    ok("!! *** walking forward on a gentle slope actually covers ground ***", moved > 1,
       `moved ${moved.toFixed(3)} units in 3s of KeyW`);
    ok("  ...and stays glued to the surface the whole way, not the flat plane a fall-through would give",
       Math.abs(c2.position.y - wantY2) < 1e-6,
       `y=${c2.position.y.toFixed(4)} vs surface+eye=${wantY2.toFixed(4)}`);
}

console.log("\n3. THE SLOPE LIMIT IS THE ONE terrainWalk.mjs ENFORCES, NOT A VOXEL AUTO-STEP");
{
    // yaw 0's forward is -z (see _moveFP: fx=sin(yaw), fz=-cos(yaw)), so the slope has to run along z
    // for "walk forward" to mean "climb" at all -- atan(0.4) =~ 21.8 deg, well inside the 50 deg limit;
    // atan(3) =~ 71.6 deg, well outside it. Height falls as z falls so forward motion (z decreasing) gains height.
    const climbable = (x, z) => 10 - 0.4 * z;
    const tooSteep  = (x, z) => 10 - 3 * z;

    const climb = freshCamera({ _heightAt: climbable });
    settle(climb, 120);
    const y0 = climb.position.y;
    climb.keys.add("KeyW");
    for (let i = 0; i < 300; i++) climb._moveFP(1 / 60);
    ok("!! a slope within the limit is climbed", climb.position.y - y0 > 1,
       `gained ${(climb.position.y - y0).toFixed(3)} units of height over 5s`);

    const wall = freshCamera({ _heightAt: tooSteep });
    settle(wall, 120);
    const startX = wall.position.x, startZ = wall.position.z;
    wall.keys.add("KeyW");
    for (let i = 0; i < 180; i++) wall._moveFP(1 / 60);
    const strayed = Math.hypot(wall.position.x - startX, wall.position.z - startZ);
    ok("!! *** a slope past the limit refuses the climb, same rule stepTerrain enforces for AI bots ***",
       strayed < 0.05, `moved only ${strayed.toFixed(5)} units against a 71.6 deg wall over 3s`);
}

console.log("\n4. JUMP AND GRAVITY STILL WORK ON THE NON-VOXEL PATH");
{
    const flat = () => 10;
    const c = freshCamera({ _heightAt: flat });
    settle(c, 120);
    const groundY = c.position.y;
    ok("  settled on the flat surface first", c._fpOnGround === true);
    c.keys.add("Space");
    c._moveFP(1 / 60);
    ok("!! Space launches the camera upward and clears _fpOnGround",
       c._fpVelY > 0 && c._fpOnGround === false, `_fpVelY=${c._fpVelY}`);
    c.keys.delete("Space");
    let peaked = false, peak = c.position.y;
    for (let i = 0; i < 120; i++) { c._moveFP(1 / 60); if (c.position.y > peak) { peak = c.position.y; peaked = true; } }
    ok("  it rises above the ground before gravity brings it back down", peaked && peak > groundY + 0.1,
       `peak=${peak.toFixed(3)} vs ground=${groundY.toFixed(3)}`);
    ok("  ...and lands back exactly on the surface, not above or below it",
       c._fpOnGround === true && Math.abs(c.position.y - (flat() + c._eyeHeight)) < 1e-6,
       `final y=${c.position.y.toFixed(4)}`);
}

console.log();
if (fails) { console.log("[cameraTerrainWalk-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[cameraTerrainWalk-selfcheck] all passed");
