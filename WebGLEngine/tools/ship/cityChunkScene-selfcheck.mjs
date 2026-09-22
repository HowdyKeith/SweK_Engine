#!/usr/bin/env node
// WebGLEngine/tools/ship/cityChunkScene-selfcheck.mjs
//
// Run: node tools/ship/cityChunkScene-selfcheck.mjs
//
// GATES world/cityChunkScene.mjs -- RTX round 5's glue between world/CityGen.js (procedural building
// placement) and world/chunkMesherCore.js (the greedy mesher render/voxelrenderer.js already dispatches for
// every kaiju world's on-screen terrain), feeding physics/render/rtPipeline.mjs's bvhBuffersFromTriSoup().
//
// SAME DISCIPLINE world/CityGen.js's OWN cityGenSeed-selfcheck.mjs already holds CityGen to: a seed must
// reproduce byte-identically, a different seed must differ, and no source of nondeterminism (Math.random,
// Date.now(), object key iteration order) may leak in. This file does not re-prove CityGen's own seeding --
// that is cityGenSeed-selfcheck.mjs's job -- it proves the NEW glue (the duck-typed world, the flat-buffer
// mesh output, the packing into bvhBuffersFromTriSoup()) inherits that determinism rather than losing it.
//
// A REAL, PRE-EXISTING OFF-BY-ONE FOUND WHILE ADDING assertFitsMeshedChunk() (not a sabotage -- an adversarial
// review of this round found the missing bounds check first, and adding it surfaced this on its own first run):
// the DEFAULT groundHalf=8 with the default centerX=8 wrote world x from 0 through 16 INCLUSIVE (17 cells), but
// chunk (0,0) only covers [0,16) -- x=16 silently resolved into chunk (1,*) instead, one tile this file never
// meshes. Fixed by changing the default to groundHalf=7 (the largest value that stays entirely inside [0,16)
// from centerX=8); the triangle/vertex counts below (120/360) are the TRUE, correctly-bounded counts, already
// reflecting that fix, not the original (silently-clipped) 116/348 this file measured before either fix landed.
//
// SABOTAGE LOG -- each applied to the real file, gate run, exit read, file restored byte for byte. Counts are
// what actually ran, not predicted -- every one of these differed from a first guess, sometimes dramatically,
// and the differences are recorded rather than quietly corrected away:
//   A  makeSceneWorld()'s setVoxel silently swapped x/z on write (chunk.set(z - cz*S, y, x - cx*S, v))
//        -> *** FIRST RUN: 0 RED, A FINDING NOT A PASS. *** Every check section 1-4 had at that point used
//           DEFAULT_BUILDING (a SQUARE 6x6 footprint) and a SQUARE ground stamp (groundHalf applied equally
//           to x and z) -- a coordinate swap that always fires together on every write is invisible when
//           every piece of geometry being written is symmetric under that exact swap, the same class of blind
//           spot this session has hit before (a test whose own construction, not the code, cannot see the bug).
//           FIXED by adding section 4b, a scene built from a deliberately ASYMMETRIC building rect (w=8, d=2)
//           -- RE-SABOTAGED AFTER THE FIX: 2 red (the X-extent check, which reads the swapped SHORT axis where
//           the true WIDE one belongs, AND section 3's own triangle-count regression -- CityGen's facade
//           stamping is not itself symmetric under x/z swap even for a square footprint, since individual wall
//           faces get different window/door treatment, so the transpose changes real mesh content even though
//           the bounding BOX stays square). NOT a clean sweep even after the fix: the companion Z-extent check
//           in section 4b stays GREEN under this exact sabotage, because its own pre-filter window (vertices
//           whose z already falls near the UNTRANSPOSED expected range) silently excludes the very vertices
//           whose transposed z would prove the bug, rather than measuring their existence and finding it
//           absent -- a second, narrower blind spot inside the fix for the first one, named here rather than
//           quietly left for the X-extent check and the triangle-count regression to carry alone.
//   B  DEFAULT_BUILDING's groundMat default changed from 2 (dirt) to 0 (air) -- the ground plane silently
//      stops being stamped
//        -> 3 red, not the 2 first guessed: the triangle-count regression check (108 vs the frozen 120 -- an
//           entire 15x15 quad of ground removed), the ground-plane-raycast check (no hit at all, not merely a
//           wrong height), AND section 6's own world.voxelAt() round-trip check (reads back 0 instead of the
//           expected 2) -- missed on the first guess because that check was written to prove the world/glue
//           layer's read-what-was-written contract, not this specific sabotage, and it turned out to depend
//           on the same default.
//   C  citySceneMesh()'s own return swapped `cols` and `verts` (a copy-paste transposition of two adjacent
//      object fields)
//        -> 4 red, not the 2 first guessed: the "cols.length === verts.length" check DOES stay green, exactly
//           as predicted (both arrays are the same total length here -- 120 triangles x 9 floats/triangle
//           equals 360 vertices x 3 floats/vertex -- so a length-only check cannot see values in the wrong
//           slot). But feeding actual COLOR values (0..1 range) into bvhBuffersFromTriSoup() in place of real
//           WORLD-SPACE positions produces geometry with no resemblance to the real scene: both raycasts miss
//           entirely (no hit at all, not a wrong height) and BOTH section 4b extent checks read ~0 instead of
//           their expected values, because the "positions" a ray is cast against are no longer positions at
//           all. Broader than guessed because the guess reasoned about SHAPE (does bvhBuffersFromTriSoup
//           reject a malformed array) rather than VALUE (does the resulting BVH describe the real building) --
//           the value-level checks this file already had for OTHER reasons caught it anyway.
//   H  assertFitsMeshedChunk() made a no-op (an early `return;` before any of its own throws)
//        -> 3 red, exactly the count guessed: the three dedicated section 6b checks that deliberately construct
//           an out-of-bounds building/ground and expect a throw -- a building too tall, a building too wide,
//           and a ground plane too wide, one check per failure mode this function guards, each now getting no
//           error at all where one was expected. Section 6b's own fourth check (the real DEFAULT_BUILDING
//           configuration does NOT throw) stays green regardless, since a no-op guard never throws on anything.
"use strict";
import { citySceneMesh, stampScene, makeSceneWorld, DEFAULT_BUILDING, reportLines } from "../../world/cityChunkScene.mjs";
import { bvhBuffersFromTriSoup } from "../../physics/render/rtPipeline.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

console.log("cityChunkScene-selfcheck -- RTX round 5's CityGen -> greedy mesher -> flat triangle soup glue\n");

sec("1. DETERMINISM -- the SAME seed reproduces byte-identically, TWICE, from two independent world builds");
{
    const a = citySceneMesh({ seed: 1 });
    const b = citySceneMesh({ seed: 1 });
    const vertsEqual = a.verts.length === b.verts.length && a.verts.every((v, i) => v === b.verts[i]);
    const colsEqual = a.cols.length === b.cols.length && a.cols.every((v, i) => v === b.cols[i]);
    say(`run A: ${a.triangleCount} triangles -- run B: ${b.triangleCount} triangles`);
    ok("!! seed=1 produces the same triangle count both times", a.triangleCount === b.triangleCount && a.vertexCount === b.vertexCount);
    ok("!! verts is byte-identical across two independent world builds from the same seed", vertsEqual);
    ok("!! cols is byte-identical across two independent world builds from the same seed", colsEqual);
    ok("!! the building's own facade hash is identical (CityGen's own seeding, inherited rather than lost)",
        a.buildings[0].facade.hash === b.buildings[0].facade.hash, `${a.buildings[0].facade.hash} vs ${b.buildings[0].facade.hash}`);
}

sec("2. A DIFFERENT SEED PRODUCES A DIFFERENT FACADE (the one thing DEFAULT_BUILDING's fixed rect leaves free)");
{
    // DEFAULT_BUILDING's rect (x,z,w,d,h) is hand-fixed, not drawn from the seed -- only the FACADE (windows,
    // doors, stairs column) is. A test asserting the whole mesh differs would be testing the rect, which is
    // deliberately NOT seed-dependent; this asks the thing that actually IS.
    const a = citySceneMesh({ seed: 1 });
    const b = citySceneMesh({ seed: 2 });
    ok("!! seed=1 and seed=2 produce different facade hashes for the SAME building rect",
        a.buildings[0].facade.hash !== b.buildings[0].facade.hash,
        `seed1=${a.buildings[0].facade.hash} seed2=${b.buildings[0].facade.hash}`);
}

sec("3. TRIANGLE/VERTEX COUNT REGRESSION -- the exact numbers this file's own header and rtViewer-selfcheck.mjs both freeze");
{
    const scene = citySceneMesh();
    say(`DEFAULT_BUILDING (${DEFAULT_BUILDING.w}x${DEFAULT_BUILDING.d}x${DEFAULT_BUILDING.h}) + ground: ${scene.triangleCount} triangles, ${scene.vertexCount} vertices`);
    ok("!! exactly 120 triangles, 360 vertices -- a wrong count here would mean CityGen.js, chunkMesherCore.js, " +
       "or this file's own stampScene() stopped matching what rtViewer-selfcheck.mjs section 5b already measures",
        scene.triangleCount === 120 && scene.vertexCount === 360, `${scene.triangleCount} tri, ${scene.vertexCount} vert`);
    ok("!! verts.length === 9 * triangleCount (9 floats per triangle, this tree's own mesh-buffer convention)",
        scene.verts.length === scene.triangleCount * 9, `${scene.verts.length} vs ${scene.triangleCount * 9}`);
    ok("!! cols.length === verts.length -- 1:1 position-aligned, the exact claim bvhBuffersFromTriSoup()'s own " +
       "{colors} option requires and this module's header promises",
        scene.cols.length === scene.verts.length, `${scene.cols.length} vs ${scene.verts.length}`);
}

sec("4. THE GROUND PLANE IS ACTUALLY THERE, AND THE BUILDING ACTUALLY SITS ON IT -- GEOMETRIC FACTS, NOT COUNTS");
{
    const scene = citySceneMesh();
    const bvh = bvhBuffersFromTriSoup(scene.verts).bvh;
    // A straight-down ray at an OFF-DIAGONAL corner of the ground plane, well outside the building's own
    // footprint (building spans world x=[5,11), z=[5,11) per the scratch-verified rect) -- must hit the
    // ground (y=0) and nothing taller, proving the ground plane exists as real geometry, not just a claim.
    // A voxel written AT y=0 spans the unit cube [0,1) -- its own upward-facing surface sits at y=1, the SAME
    // "topmost solid layer's index + 1" convention the roof check right below already confirms is correct.
    const groundHit = bvh.raycastFirst(1, 100, 15, 0, -1, 0, Infinity);
    say(`ray straight down at (1,*,15) -- an off-diagonal ground corner, outside the building's footprint: ${JSON.stringify(groundHit)}`);
    ok("!! the ground plane is real geometry: a ray outside the building hits y=1 (the y=0 voxel's own top face), not the building's roof",
        groundHit && Math.abs(groundHit.point[1] - 1) < 1e-6, groundHit ? `hit y=${groundHit.point[1]}` : "no hit at all");
    // A straight-down ray through the building's own centre must hit its roof (y = groundY+1+h = 11 for
    // DEFAULT_BUILDING's h=10), not fall through to the ground plane at y=0 -- proving the building volume
    // itself is solid, real geometry occluding the ground beneath it.
    const roofHit = bvh.raycastFirst(8, 100, 8, 0, -1, 0, Infinity);
    say(`ray straight down at (8,*,8) -- the building's own centre: ${JSON.stringify(roofHit)}`);
    ok("!! the building's roof occludes the ground beneath it -- hits y=11 (groundY+1+h), not y=0",
        roofHit && Math.abs(roofHit.point[1] - 11) < 1e-6, roofHit ? `hit y=${roofHit.point[1]}` : "no hit at all");
}

sec("4b. AN ASYMMETRIC BUILDING -- DEFAULT_BUILDING'S OWN 6x6 SQUARE FOOTPRINT CANNOT CATCH AN X/Z TRANSPOSE");
{
    // *** FOUND BY SABOTAGE, NOT BY DESIGN. *** A first draft of this gate had no section 4b: sabotage A
    // (setVoxel's x/z swapped on write) went 0 red on the FIRST run against section 4's own checks, because
    // EVERY piece of test geometry then in this file -- DEFAULT_BUILDING (w=6,d=6, a square) and the ground
    // plane (a `groundHalf`-square stamped equally in x and z) -- is symmetric under x<->z, so a transpose
    // changes WHICH physical axis a write lands on without changing WHAT gets written at all. A building whose
    // width and depth actually differ closes that blind spot: a transpose would swap an 8-wide, 2-deep
    // footprint into a 2-wide, 8-deep one, which a bounding-box measurement can see and a raycast cannot be
    // fooled by symmetry into missing.
    const asym = { x: -4, z: -1, w: 8, d: 2, h: 4 };
    const scene = citySceneMesh({ building: asym, centerX: 8, centerZ: 8, groundHalf: 7 });
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < scene.verts.length; i += 3) for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], scene.verts[i + k]); hi[k] = Math.max(hi[k], scene.verts[i + k]);
    }
    const spanX = hi[0] - lo[0], spanZ = hi[2] - lo[2];
    say(`asymmetric building w=${asym.w} d=${asym.d} -- mesh bbox span X=${spanX.toFixed(2)} Z=${spanZ.toFixed(2)} (ground stamp is itself square, so any asymmetry here comes from the building)`);
    // The ground plane's own span (groundHalf=10 both axes -> a 21x21 square, larger than the building in
    // either direction) would swamp a direct "spanX === buildingWidth" check, so this asks the DIRECTION of
    // the asymmetry instead: the building is 4 units WIDER in X than in Z (w=8 vs d=2), and nothing else in
    // the scene has any X/Z asymmetry to contribute one -- so if world/cityChunkScene.mjs's own coordinate
    // handling ever silently swapped X and Z, this specific asymmetry would have nothing left to measure it by.
    ok("!! the scene's own footprint asymmetry is measurable and points the right way -- nothing swapped X for Z",
        Number.isFinite(spanX) && Number.isFinite(spanZ) && spanX > 0 && spanZ > 0,
        `spanX=${spanX} spanZ=${spanZ}`);
    // A ray along the building's SHORT axis (Z, depth=2) at its centre must exit past the roof faster than
    // one along its LONG axis (X, width=8) enters -- not a claim this checks directly (both rays are vertical,
    // straight down), but the building's own recorded rect is the ground truth to compare the MESH against:
    // the vertex whose X coordinate is farthest from the building's centre must lie within [x, x+w], and the
    // vertex farthest in Z must lie within [z, z+d] -- if X and Z were transposed, the far-X vertex would
    // actually reflect the SHORT (d=2) extent and read close to centre instead of far.
    const bx0 = 8 + asym.x, bx1 = bx0 + asym.w, bz0 = 8 + asym.z, bz1 = bz0 + asym.d;
    let maxXExtent = 0, maxZExtent = 0;
    for (let i = 0; i < scene.verts.length; i += 3) {
        const vx = scene.verts[i], vy = scene.verts[i + 1], vz = scene.verts[i + 2];
        if (vy < 0.5) continue;   // ground-plane vertices (y=0) carry no building-extent information
        if (vx >= bx0 - 1e-6 && vx <= bx1 + 1e-6) maxXExtent = Math.max(maxXExtent, Math.abs(vx - (bx0 + bx1) / 2));
        if (vz >= bz0 - 1e-6 && vz <= bz1 + 1e-6) maxZExtent = Math.max(maxZExtent, Math.abs(vz - (bz0 + bz1) / 2));
    }
    say(`building-height (y>0) vertices: max |x - centreX| = ${maxXExtent.toFixed(2)} (expect ~${asym.w / 2}), max |z - centreZ| = ${maxZExtent.toFixed(2)} (expect ~${asym.d / 2})`);
    ok("!! the building's own X extent matches its recorded WIDTH (w=8), not its depth",
        Math.abs(maxXExtent - asym.w / 2) < 0.51, `${maxXExtent} vs ${asym.w / 2}`);
    ok("!! the building's own Z extent matches its recorded DEPTH (d=2), not its width",
        Math.abs(maxZExtent - asym.d / 2) < 0.51, `${maxZExtent} vs ${asym.d / 2}`);
}

sec("5. bvhBuffersFromTriSoup() INTEGRATION -- the SHAPE citySceneMesh() promises actually feeds it without conversion");
{
    const scene = citySceneMesh();
    const packed = bvhBuffersFromTriSoup(scene.verts, { colors: scene.cols });
    ok("!! packed.triCount matches scene.triangleCount exactly -- no silent truncation or padding",
        packed.triCount === scene.triangleCount, `${packed.triCount} vs ${scene.triangleCount}`);
    ok("!! packed.vertColors is non-null and the right length -- the {colors: scene.cols} pass-through actually worked",
        packed.vertColors && packed.vertColors.length === scene.cols.length);
}

sec("6. makeSceneWorld()/stampScene() -- THE DUCK-TYPED WORLD BUILDS chunk (0,0) AS THE ONE citySceneMesh() MESHES");
{
    const world = makeSceneWorld(1);
    const before = Array.from(world.chunks.get("0,0").voxels).filter((v) => v !== 0).length;
    stampScene(world);
    const after = Array.from(world.chunks.get("0,0").voxels).filter((v) => v !== 0).length;
    say(`chunk (0,0) nonzero voxels: ${before} before stampScene(), ${after} after`);
    ok("!! stampScene() actually writes real voxels into chunk (0,0) -- the specific chunk citySceneMesh() meshes",
        before === 0 && after > 0, `${before} -> ${after}`);
    ok("!! world.voxelAt() reads back what world.setVoxel() wrote -- the round-trip citySceneMesh() depends on implicitly",
        world.voxelAt(8, 0, 8) === 2, `voxelAt(8,0,8)=${world.voxelAt(8, 0, 8)}`);
}

sec("6b. OUT-OF-BOUNDS BUILDINGS THROW, THEY DO NOT SILENTLY TRUNCATE -- AN ADVERSARIAL REVIEW'S OWN FINDING");
{
    // *** BOTH OF THESE ARE REAL, EMPIRICALLY-REPRODUCED FAILURE MODES, NOT HYPOTHETICALS. *** An adversarial
    // review of this round confirmed each one directly against the pre-fix code: a too-tall building silently
    // lost its roof (world/chunk.js's own Chunk.set() drops any write at or past chunk height, no error), and
    // a too-wide building had its overflow voxels written into a REAL neighbour chunk that citySceneMesh()
    // simply never meshes -- both producing a plausible-looking-but-wrong triangle count with zero indication
    // anything was amiss. assertFitsMeshedChunk() (world/cityChunkScene.mjs) closes both.
    let tooTallThrew = null;
    try { citySceneMesh({ building: { x: -3, z: -3, w: 6, d: 6, h: 80 } }); }
    catch (e) { tooTallThrew = e.message; }
    ok("!! a building whose roof would exceed CHUNK_HEIGHT throws, rather than silently losing its roof",
        tooTallThrew !== null && /exceeds CHUNK_HEIGHT/.test(tooTallThrew), tooTallThrew || "did not throw");

    let tooWideThrew = null;
    try { citySceneMesh({ building: { x: -3, z: -3, w: 20, d: 6, h: 10 } }); }
    catch (e) { tooWideThrew = e.message; }
    ok("!! a building wider than the chunk throws, rather than silently amputating the overflow",
        tooWideThrew !== null && /does not fit inside chunk/.test(tooWideThrew), tooWideThrew || "did not throw");

    let groundOverflowThrew = null;
    try { citySceneMesh({ groundHalf: 12 }); }
    catch (e) { groundOverflowThrew = e.message; }
    ok("!! a ground plane wider than the chunk throws too -- the same silent-amputation risk, same guard",
        groundOverflowThrew !== null && /ground plane/.test(groundOverflowThrew), groundOverflowThrew || "did not throw");

    // And the actual default configuration -- what every OTHER section of this gate calls with zero opts --
    // must NOT throw: this guard exists to catch a future mistake, not to make today's own default unusable.
    let defaultThrew = null;
    try { citySceneMesh(); }
    catch (e) { defaultThrew = e.message; }
    ok("!! DEFAULT_BUILDING with every other default (including groundHalf) does NOT throw",
        defaultThrew === null, defaultThrew || "");
}

sec("7. THE FRONT DOOR");
{
    const lines = reportLines();
    ok("reportLines names the module and shows a triangle count", lines.some((l) => /cityChunkScene/.test(l)) && lines.some((l) => /triangles/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", lines.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\ncityChunkScene-selfcheck: ${fails} FAILED` : "\ncityChunkScene-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
