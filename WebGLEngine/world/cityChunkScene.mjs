// WebGLEngine/world/cityChunkScene.mjs
//
// RTX ROUND 5 -- "an actual procedurally generated scene" (physics/render/rtPipeline.mjs's own gpu-pathtracer-
// render-mode backlog entry, its own words) for the ray tracer, replacing the single hardcoded pavement.glb
// tile rtx-viewer.html has rendered since RTX round 3. Not a new scene format: this is glue between two
// already-gated, already-proven pieces -- world/CityGen.js (the procedural building stamper) and world/
// chunkMesherCore.js (the greedy mesher render/voxelrenderer.js already dispatches for every kaiju world's
// visible terrain) -- following world/worldColliderBVH.mjs's own already-established precedent for feeding
// exactly this mesher's output into a mesh/meshBVH.mjs MeshBVH with no reindexing step.
//
// DUCK-TYPED, ON PURPOSE, THE SAME WAY world/worldGlbExport.js ALREADY IS. CityGen.generate()/generateFrom()
// only ever call `world.setVoxel(x,y,z,v)`; chunkMesherCore.meshChunk() only ever reads `chunk.voxels` and its
// neighbours'. Constructing a real world/world.js pulls in erosion, fluids, rain and WebGL -- this scene is a
// pure function of a handful of world/chunk.js Chunk objects, so a browser demo page and a headless gate can
// both build one without any of that, the exact same reasoning worldGlbExport.js's own header already states.
//
// ONE BUILDING, HAND-PLACED, NOT THE RANDOM CITY SWEEP. CityGen.generate()'s own weighted-tier random search
// can place anything from a 3-voxel shed to a 140-voxel megastructure -- fine for a sandbox, wrong for a
// gated, reproducible demo scene. generateFrom() (CityGen's own "the gate's way to place a building on
// purpose" entry point) takes an explicit rect instead: DEFAULT_BUILDING below is a modest "house" tier
// footprint (6x6x10), chosen by direct measurement (this file's own gate) to land at 120 triangles with
// facades on -- small enough for a compute-shader BVH to trace at interactive rates, the same size class as
// physics/render/rtPipeline-selfcheck.mjs's own hand-authored 10-12 triangle fixtures, just a genuine
// procedurally generated building instead of a hand-typed cube.
"use strict";
import { Chunk } from "./chunk.js";
import { CityGen } from "./CityGen.js";
import { meshChunk } from "./chunkMesherCore.js";
import { neighboursOf } from "./worldGlbExport.js";

const CHUNK_SIZE = 16, CHUNK_HEIGHT = 64;

export const DEFAULT_BUILDING = Object.freeze({ x: -3, z: -3, w: 6, d: 6, h: 10 });

/**
 * A minimal, duck-typed voxel world -- `{chunks: Map<"cx,cz", Chunk>, chunkSize, setVoxel, voxelAt}` -- built
 * from real world/chunk.js Chunk objects (so chunkMesherCore.meshChunk() reads real `.voxels` buffers, not a
 * mock), sized to a `gridRadius`-chunk square so meshChunk()'s own neighbour lookups always find a real
 * (possibly all-air) chunk rather than an undefined one at the scene's own edge.
 */
export function makeSceneWorld(gridRadius = 1) {
    const chunks = new Map();
    for (let cx = -gridRadius; cx <= gridRadius; cx++) {
        for (let cz = -gridRadius; cz <= gridRadius; cz++) chunks.set(cx + "," + cz, new Chunk(cx, cz, CHUNK_SIZE, CHUNK_HEIGHT));
    }
    return {
        chunks, chunkSize: CHUNK_SIZE,
        setVoxel(x, y, z, v) {
            const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
            const chunk = chunks.get(cx + "," + cz);
            if (chunk) chunk.set(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE, v);
        },
        voxelAt(x, y, z) {
            const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
            const chunk = chunks.get(cx + "," + cz);
            return chunk ? chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE) : 0;
        },
    };
}

/**
 * *** REFUSED, NOT SILENTLY TRUNCATED. *** An adversarial review found this the hard way, empirically: a
 * building taller than CHUNK_HEIGHT has every write past y=63 silently DROPPED by world/chunk.js's own `set()`
 * (its own documented, unguarded behavior -- an out-of-range write is a no-op, not an error), coming out with
 * no roof cap and a plausible-looking-but-wrong triangle count; a building wider than CHUNK_SIZE writes its
 * overflow voxels into a REAL neighbour chunk (gridRadius=1 makes that chunk exist), but citySceneMesh() below
 * only ever meshes chunk "0,0" -- so the overflow is written correctly and then never converted to a triangle
 * at all, silently amputating the far side. `gridRadius` does NOT guard against either case: it only ensures
 * meshChunk()'s own neighbour-lookup gets real (non-undefined) voxel buffers for face-culling at chunk (0,0)'s
 * own border, it does not extend which chunk gets meshed. DEFAULT_BUILDING (6x6x10, centered with 5+ voxels of
 * margin) is safely inside these limits today; this check exists so a LATER change to it, or a caller-supplied
 * `opts.building`, fails loudly and immediately instead of shipping a silently-wrong render nobody can explain
 * from the triangle count alone.
 */
function assertFitsMeshedChunk(building, centerX, centerZ, groundY, groundHalf) {
    const bx0 = centerX + building.x, bx1 = bx0 + building.w;
    const bz0 = centerZ + building.z, bz1 = bz0 + building.d;
    const by1 = groundY + 1 + building.h;
    if (bx0 < 0 || bx1 > CHUNK_SIZE || bz0 < 0 || bz1 > CHUNK_SIZE) throw new Error(
        "cityChunkScene: building footprint [" + bx0 + "," + bx1 + ") x [" + bz0 + "," + bz1 + ") does not fit " +
        "inside chunk (0,0)'s own [0," + CHUNK_SIZE + ") x [0," + CHUNK_SIZE + ") -- citySceneMesh() only meshes " +
        "that one chunk, so the overflow would be written but never triangulated, silently amputating the building.");
    if (by1 > CHUNK_HEIGHT) throw new Error(
        "cityChunkScene: building roof at y=" + by1 + " exceeds CHUNK_HEIGHT=" + CHUNK_HEIGHT + " -- world/chunk.js's " +
        "own Chunk.set() silently DROPS any write at or past chunk height, which would ship a roofless, open-topped " +
        "building with no error and a plausible-looking triangle count.");
    const gx0 = centerX - groundHalf, gx1 = centerX + groundHalf + 1, gz0 = centerZ - groundHalf, gz1 = centerZ + groundHalf + 1;
    if (gx0 < 0 || gx1 > CHUNK_SIZE || gz0 < 0 || gz1 > CHUNK_SIZE) throw new Error(
        "cityChunkScene: ground plane [" + gx0 + "," + gx1 + ") x [" + gz0 + "," + gz1 + ") does not fit inside " +
        "chunk (0,0)'s own [0," + CHUNK_SIZE + ") x [0," + CHUNK_SIZE + ") -- same silent-amputation risk as the building.");
}

/**
 * Stamp DEFAULT_BUILDING (or `opts.building`, same {x,z,w,d,h} rect shape CityGen.generateFrom() itself
 * takes) via CityGen.generateFrom() -- deterministic placement, no weighted-tier random search -- plus a hand-
 * stamped flat dirt ground plane (generateFrom() only stamps buildings; ground is generate()'s own separate,
 * radius-swept step, not reused here since a single square plane needs no radius sweep). Centered so the
 * whole scene lands inside chunk (0,0), matching the single-chunk mesh this file's own scene() below meshes.
 */
export function stampScene(world, opts = {}) {
    const building = opts.building || DEFAULT_BUILDING;
    const centerX = opts.centerX ?? 8, centerZ = opts.centerZ ?? 8, groundY = opts.groundY ?? 0;
    const seed = opts.seed ?? 1, facades = opts.facades !== false, groundMat = opts.groundMat ?? 2;
    // *** A REAL, PRE-EXISTING OFF-BY-ONE THE NEW assertFitsMeshedChunk() CHECK FOUND ON ITS OWN FIRST RUN. ***
    // groundHalf=8 with centerX=8 (both defaults) writes world x from 0 through 16 INCLUSIVE (17 cells,
    // `-half..half`) -- but chunk (0,0) only covers world x in [0,16); x=16 silently resolves to chunk (1,*)
    // instead, one tile this file never meshes. 7 is the largest half that stays entirely inside [0,16) from
    // centerX=8: 8-7=1 through 8+7=15. The ground plane is one tile narrower on each edge than the value `8`
    // alone would suggest; DEFAULT_BUILDING's own footprint (world x/z 5..11) stays comfortably inside either way.
    const half = opts.groundHalf ?? 7;
    assertFitsMeshedChunk(building, centerX, centerZ, groundY, half);
    const cg = new CityGen(world);
    const buildings = cg.generateFrom([building], { centerX, centerZ, groundY, seed, facades });
    for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) world.setVoxel(centerX + x, groundY, centerZ + z, groundMat);
    return buildings;
}

/**
 * The whole pipeline, one call: build a scene world, stamp DEFAULT_BUILDING (or `opts.building`) into it, mesh
 * the single chunk it lands in via chunkMesherCore's own greedy mesher (bit-for-bit the same mesher render/
 * voxelrenderer.js dispatches for on-screen terrain), and return `{verts, cols, buildings, triangleCount,
 * vertexCount}` -- `verts`/`cols` ready to hand straight to physics/render/rtPipeline.mjs's own
 * bvhBuffersFromTriSoup(verts, {colors: cols}), no further conversion (tools/ship/cityChunkScene-selfcheck.mjs
 * section 5 proves that exact hand-off). RTX round 15 wired exactly this: render/rtViewer.mjs's loadCityBvh()
 * now passes `cols` straight through as `opts.bvh.colors`, and makeRtSession() accepts a `vertexColors: true`
 * option that requests `pipelineWgsl()`'s own vertexColors WGSL path and binds the resulting buffer. This
 * scene is round 15's real, live-gated target (tools/ship/rtViewer-selfcheck.mjs section 5c renders it through
 * the full path on a real device) -- the pavement-tile scene did NOT turn out to have "the identical
 * limitation" as this comment used to claim: round 15 found, by parsing the real vendor/kenney-city/models/
 * pavement.glb directly, that it has no COLOR_0 accessor at all, so its own vertex-colors wiring in
 * loadMeshBvh() is defensive/future-proofing only, currently unexercised by any live asset.
 *
 * RTX round 17 -- `matCodes` is chunkMesherCore.js's own new `matIds` output, passed straight through: one
 * ABSOLUTE VOXEL ID per triangle (not per vertex, unlike `cols`), the exact real per-quad id emitQuad() already
 * looks PALETTE up by for `cols` itself -- not a second, independently-derived material signal. render/
 * rtViewer.mjs's own materialTableFromCodes() turns this into a compact per-triangle materialIndex plus a real,
 * PALETTE-derived SBT record table for physics/render/rtPipeline.mjs's own `meshMaterials` option.
 */
export function citySceneMesh(opts = {}) {
    const world = makeSceneWorld(opts.gridRadius ?? 1);
    const buildings = stampScene(world, opts);
    const chunk = world.chunks.get("0,0");
    const r = meshChunk({
        voxels: chunk.voxels, neighbors: neighboursOf(world.chunks, 0, 0),
        size: CHUNK_SIZE, height: CHUNK_HEIGHT, cx: 0, cz: 0, skipWater: opts.skipWater !== false,
    });
    return Object.freeze({
        verts: r.verts, cols: r.cols, matCodes: r.matIds, buildings,
        triangleCount: r.verts.length / 9, vertexCount: r.verts.length / 3,
    });
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const scene = citySceneMesh();
    const b = scene.buildings[0];
    return [
        "[cityChunkScene] a procedurally generated building (world/CityGen.js) meshed by the same greedy",
        "                 mesher (world/chunkMesherCore.js) every kaiju world's on-screen terrain already uses.",
        `  building: ${b.w}x${b.d}x${b.h} voxels, hp=${b.hp}, facade hash=${b.facade ? b.facade.hash : "none"}`,
        `  mesh: ${scene.triangleCount} triangles, ${scene.vertexCount} vertices`,
    ];
}
// GUARDED (this tree's established idiom): loaded by a page as well as run as a CLI.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
