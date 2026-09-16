// WebGLEngine/tools/ship/splatWalkWorld-selfcheck.mjs -- v4630
//
// Gates world/splatWalkWorld.mjs (task board #83): the splat-cloud-to-walkable-mesh pipeline and the exact
// parameters (radius/cellSize/splat count/footprint) this round measured and picked. splatMesh-selfcheck.mjs
// already proves surfaceNets() itself is correct on a generic volume; this file's own job is proving THIS
// module's specific choices produce a watertight, walkable result and that a real Camera, driven the same
// way tools/ship/controllerLabWorld-selfcheck.mjs already drives one, can actually stand on and walk it.
//
// SABOTAGED AND RESTORED: SPLAT_COUNT dropped 9000 -> 40 (leaving the cloud too sparse to close the shell)
// went red BY NAME on 10 of 13 checks -- euler (80 not 4), triangle count (4320, under the 5000 floor), 5 of
// 6 center raycasts (MISS), the camera-fall settle (feet y=-237, fell through into empty space), the 10s
// walk's distance-from-center check (2037, off in the void), and section 5's resolve-outward check (embedded
// start and resolved position both deep in the void, nothing real to push against) -- confirming this gate
// actually depends on the real parameters producing a real closed shell, not passing regardless. Restored to
// 9000 and re-verified all green immediately after.
//
// SECOND SABOTAGE, SECTION 6: cloudToParsedSplats()'s alpha-from-opacity mapping hardcoded to 255 (fully
// opaque, ignoring the source cloud's own opacity entirely) went red BY NAME on exactly the one check that
// exists to catch it -- "alpha channel reflects the source cloud's own opacity" -- with every other check
// (count, pass-through positions/scales, buffer shapes, sh1, the height gradient) correctly unaffected and
// still green, showing the sabotage was isolated to the one property it broke. Restored and re-verified.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildSplatWalkWorld, cloudToParsedSplats, SPHERE_RADIUS, SPAWN } = await import(pathToFileURL(path.join(ENG, "world", "splatWalkWorld.mjs")).href);
const { meshStats } = await import(pathToFileURL(path.join(ENG, "physics", "splat", "splatMesh.mjs")).href);
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);
const { depenetrateCapsule } = await import(pathToFileURL(path.join(ENG, "physics", "character", "capsuleCollide.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("1. THE SURFACE-NETS MESH FROM THIS MODULE'S OWN PARAMETERS IS WATERTIGHT");
{
    const { mesh, features } = buildSplatWalkWorld();
    const st = meshStats(mesh);
    console.log(`  ----  radius=${features.radius} cellSize=${features.cellSize} splats=${features.n} triangles=${features.triangleCount}, ${st.vertices} vertices`);
    ok("!! *** no boundary edge, no non-manifold edge -- a real shell, not a mesh with holes in it ***",
       st.boundary === 0 && st.nonManifold === 0, `boundary=${st.boundary}, nonManifold=${st.nonManifold}`);
    ok("  Euler characteristic 4 -- splatMesh-selfcheck.mjs's own section 5 established this IS the right number for a shell (two closed spheres, inner and outer), not a coincidence to re-derive here",
       st.euler === 4, `euler=${st.euler}`);
    ok("  a substantial mesh, not a degenerate sliver", features.triangleCount > 5000, `${features.triangleCount} triangles`);
}

console.log("\n2. RAYCASTS FROM THE CENTER HIT THE SHELL AT ROUGHLY THE SPHERE'S OWN RADIUS, IN EVERY DIRECTION");
{
    const { colliderBVH } = buildSplatWalkWorld();
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of dirs) {
        const hit = colliderBVH.raycastFirst(0, 0, 0, dx, dy, dz, SPHERE_RADIUS * 2);
        ok(`  direction (${dx},${dy},${dz}) hits within 2 units of radius ${SPHERE_RADIUS}`,
           !!hit && Math.abs(hit.t - SPHERE_RADIUS) < 2, hit ? `t=${hit.t.toFixed(3)}` : "MISS");
    }
}

function freshCamera(world) {
    const c = Object.create(Camera.prototype);
    c.position = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
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

console.log("\n3. A REAL CAMERA FALLS FROM SPAWN AND SETTLES GROUNDED, NEAR THE SPHERE'S OWN BOTTOM POLE");
{
    const { colliderBVH } = buildSplatWalkWorld();
    const c = freshCamera({ colliderBVH });
    for (let i = 0; i < 300; i++) c._moveFP(1 / 60);
    ok("!! *** settles grounded, feet within 3 units of the analytic bottom pole (-radius) despite the mesh's own local bumpiness ***",
       c._fpOnGround === true && Math.abs((c.position.y - c._eyeHeight) - (-SPHERE_RADIUS)) < 3,
       `feet y=${(c.position.y - c._eyeHeight).toFixed(3)}, analytic pole=${-SPHERE_RADIUS}`);
}

console.log("\n4. WALKING THE INTERIOR FOR 10 SIMULATED SECONDS NEVER GETS STUCK OR TUNNELS THROUGH THE SHELL");
{
    const { colliderBVH } = buildSplatWalkWorld();
    const c = freshCamera({ colliderBVH });
    for (let i = 0; i < 300; i++) c._moveFP(1 / 60);   // settle first
    c.keys.add("KeyW");
    let stuckFrames = 0, everMoved = false;
    for (let i = 0; i < 600; i++) {
        const before = { x: c.position.x, z: c.position.z };
        c._moveFP(1 / 60);
        const moved = Math.hypot(c.position.x - before.x, c.position.z - before.z);
        if (moved > 1e-4) everMoved = true;
        if (moved < 1e-4 && c._fpOnGround) stuckFrames++;
    }
    ok("!! *** real horizontal progress happened at some point during the walk ***", everMoved);
    ok("  never permanently stuck (a frame with zero movement while grounded is fine transiently; every frame would not be)",
       stuckFrames < 600, `${stuckFrames}/600 frames showed zero movement while grounded`);
    const distFromCenter = Math.hypot(c.position.x, c.position.y, c.position.z);
    ok("!! *** stayed on (or very near) the shell -- distance from center close to the sphere's own radius, not off in empty space or through the wall ***",
       Math.abs(distFromCenter - SPHERE_RADIUS) < 3, `distance from center=${distFromCenter.toFixed(3)}, radius=${SPHERE_RADIUS}`);
}

console.log("\n5. THE RESOLVE PRIMITIVE ITSELF AGREES: EMBEDDING PAST THE REAL SURFACE RESOLVES OUTWARD (UP), NOT THROUGH");
{
    const { colliderBVH } = buildSplatWalkWorld();
    // *** THE REAL MESH SURFACE IS NOT AT THE ANALYTIC POLE (-radius). *** Section 2/3 already measured it
    // roughly 1.1 units inside that (surfaceNets' own voxel-grid discretisation of a splat shell, not a
    // perfect analytic sphere) -- a first draft of this row embedded relative to -radius directly and found
    // NOTHING in range to resolve (0.4 radius against a >1 unit gap to the real surface), which was this
    // row's own bug, not the collider's. depenetrateCapsule only resolves an EXISTING overlap -- it does not
    // simulate falling -- so finding the real resting height needs an actual fall, the same one section 3
    // already drives through the real Camera; this reuses that exact result rather than a fresh guess.
    const c = freshCamera({ colliderBVH });
    for (let i = 0; i < 300; i++) c._moveFP(1 / 60);
    const restY = c.position.y - c._eyeHeight;
    const embedded = depenetrateCapsule([0, restY - 0.3, 0], 0.4, 1.8, colliderBVH);
    ok("!! resolves toward the interior (y increases from the embedded start), not further through the shell",
       embedded.pos[1] > restY - 0.3, `real surface rest y=${restY.toFixed(3)}, embedded start=${(restY - 0.3).toFixed(3)}, resolved=${embedded.pos[1].toFixed(3)}`);
}

console.log("\n6. cloudToParsedSplats() BRIDGES THE SAME CLOUD TO render/SplatRenderer.js's OWN INPUT SHAPE");
{
    const { cloud } = buildSplatWalkWorld();
    const parsed = cloudToParsedSplats(cloud);
    ok("  count matches the source cloud", parsed.count === cloud.count, `parsed=${parsed.count}, cloud=${cloud.count}`);
    ok("!! *** positions pass through UNCHANGED -- same typed array, not a re-derived copy ***",
       parsed.positions === cloud.positions);
    ok("!! *** scales pass through UNCHANGED for the same reason ***", parsed.scales === cloud.scales);
    ok("  colors is one RGBA byte quadruple per splat", parsed.colors instanceof Uint8Array && parsed.colors.length === cloud.count * 4);
    ok("  rotations is one quaternion per splat", parsed.rotations instanceof Float32Array && parsed.rotations.length === cloud.count * 4);
    ok("  sh1 is explicitly null (no spherical-harmonic data to fake), not just omitted", parsed.sh1 === null);

    // sphereCloud()'s own opacity is a single flat value across the whole cloud (see splatMesh.mjs) -- every
    // splat's alpha byte should agree with it to within Uint8 rounding.
    const expectedAlpha = Math.round(cloud.opacities[0] * 255);
    let alphaOk = true;
    for (let i = 0; i < cloud.count; i += 137) if (Math.abs(parsed.colors[i * 4 + 3] - expectedAlpha) > 1) { alphaOk = false; break; }
    ok("!! *** alpha channel reflects the source cloud's own opacity, sampled across the splat set ***", alphaOk, `expected~${expectedAlpha}`);

    // The lowest-Y splat should read closer to colorLow than the highest-Y splat, and vice-versa -- proves the
    // height gradient actually varies with real geometry rather than being a constant colour.
    let loIdx = 0, hiIdx = 0, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < cloud.count; i++) {
        const y = cloud.positions[i * 3 + 1];
        if (y < minY) { minY = y; loIdx = i; }
        if (y > maxY) { maxY = y; hiIdx = i; }
    }
    const loRed = parsed.colors[loIdx * 4], hiRed = parsed.colors[hiIdx * 4];
    ok("!! *** the height gradient actually varies -- the lowest and highest splats read different colours ***",
       loRed !== hiRed, `lowest-Y red=${loRed}, highest-Y red=${hiRed}`);
}

console.log();
if (fails) { console.log("[splatWalkWorld-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[splatWalkWorld-selfcheck] all passed");
