// WebGLEngine/world/splatWalkWorld.mjs -- v4630
//
// Task board #83. Walk a live 3D Gaussian Splat scene with real capsule collision -- picked, from a review
// of task #13's whole arc, as the standout next step because it is the one idea that combines three things
// this tree already built for unrelated reasons into something none of them do alone: physics/splat/
// splatMesh.mjs (task 58) turns a splat CLOUD into a walkable mesh via density rasterisation + naive surface
// nets; mesh/meshBVH.mjs + physics/character/capsuleCollide.mjs (task #80) turn a mesh into something a
// capsule can stand on and be blocked by; gpu/SplatLoader.js and render/SplatRenderer.js already RENDER
// splat scenes, but nothing before this let a player physically walk one.
//
// THE SHAPE: a big hollow sphere shell of splats, built from splatMesh.mjs's own sphereCloud() helper --
// whose own comment already says "for gates AND the lab". A hollow shell's interior is, geometrically,
// exactly a domed room: the player spawns inside it, falls a short distance to the bottom (a real floor,
// up-facing normal, standable), and the curved wall around them behaves like any other wall (task #80's own
// wall test, just on a curved surface instead of a flat one) -- including sliding back down once the local
// slope passes GROUND_SUPPORT_NORMAL_Y's walkable limit, the SAME rule that refuses controller_lab's steep
// ramp (task #82), just continuously varying instead of one fixed angle. splatMesh-selfcheck.mjs's own
// section 5 already proved a shell this thick meshes WATERTIGHT on both faces (Euler characteristic 4 -- two
// spheres, inner and outer); this demo walks the inner one.
//
// MEASURED, NOT GUESSED, BEFORE PICKING THESE NUMBERS: radius 15 / cellSize 0.75 / 9,000 splats / 1.1
// footprint gives a watertight mesh (30,632 triangles, boundary 0, non-manifold 0, Euler 4), a 112 ms
// MeshBVH build, and a capsule that falls, lands grounded, and walks the interior without getting stuck or
// tunnelling (driven through the real Camera class for 10 simulated seconds, this file's own gate repeats
// that drive). The floor is NOT perfectly flat -- surfaceNets' voxel-grid discretisation leaves roughly
// cellSize-scale local bumps, which is the honest, thematically correct texture for "real capture data is
// noisier than hand-authored geometry", the open question this demo exists to answer in the first place.
//
// WHAT THIS IS NOT: a real splat CAPTURE. The cloud here is procedural (Fibonacci-lattice points on an
// analytic sphere, splatMesh.mjs's own deterministic test generator), not a scanned/trained scene loaded
// through gpu/SplatLoader.js. Whether the collision pipeline survives an actually messy real scan (holes,
// stray floaters, non-manifold regions a real capture can have) is a real, separate, later question -- named
// here rather than answered.
"use strict";
import { createVolume, rasterise, surfaceNets, meshTriples, sphereCloud, ISO } from "../physics/splat/splatMesh.mjs";
import { MeshBVH, trianglesFrom } from "../mesh/meshBVH.mjs";

export const SPHERE_RADIUS = 15;
export const CELL_SIZE = 0.75;
export const SPLAT_COUNT = 9000;
export const SPLAT_FOOTPRINT = 1.1;

// Spawn a short, safe distance above the bottom interior (which measures roughly -radius to -radius+2 once
// rasterised -- the exact height is a property of the mesh, not a constant, which is why this spawns ABOVE
// it and lets gravity settle the capsule onto whatever the real surface height turns out to be, the same
// way controller_lab's own spawn relies on falling onto real geometry rather than a hand-picked Y.
export const SPAWN = { x: 0, y: -SPHERE_RADIUS + 5, z: 0, yaw: 0 };

// A visual bridge from this cloud (physics/splat/splatMesh.mjs's own shape -- {positions, scales, opacities,
// count}, no colour or rotation field) to the shape render/SplatRenderer.js's load() actually needs (the same
// shape gpu/SplatLoader.js's file parsers produce). splatMesh.mjs's own header draws a hard line -- "gives a
// splat scene a collision surface" is what IT does, staying out of rendering on purpose -- so this bridge lives
// here instead, in the module whose whole job is combining things this tree built separately. positions and
// scales pass through UNCHANGED (same units, same per-axis float layout, render/SplatRenderer.js's own load()
// consumes both directly) -- only colour and rotation need fabricating. An identity rotation is not an
// approximation standing in for a discarded real one: sphereCloud()'s own scale is equal on all three axes
// (isotropic), so a sphere-shaped splat renders identically under any rotation, identity included.
export function cloudToParsedSplats(cloud, opts = {}) {
    const { colorLow = [120, 150, 210], colorHigh = [225, 235, 255] } = opts;
    const { count, positions, scales, opacities } = cloud;
    const colors = new Uint8Array(count * 4);
    const rotations = new Float32Array(count * 4);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
        const y = positions[i * 3 + 1];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const spanY = Math.max(1e-6, maxY - minY);
    for (let i = 0; i < count; i++) {
        const t = (positions[i * 3 + 1] - minY) / spanY;
        colors[i * 4 + 0] = Math.round(colorLow[0] + (colorHigh[0] - colorLow[0]) * t);
        colors[i * 4 + 1] = Math.round(colorLow[1] + (colorHigh[1] - colorLow[1]) * t);
        colors[i * 4 + 2] = Math.round(colorLow[2] + (colorHigh[2] - colorLow[2]) * t);
        colors[i * 4 + 3] = Math.max(0, Math.min(255, Math.round((opacities[i] ?? 1) * 255)));
        rotations[i * 4] = 1;   // identity quaternion component -- irrelevant for an isotropic splat, see above
    }
    return { count, positions, colors, scales, rotations, sh1: null, format: "sphereCloud" };
}

export function buildSplatWalkWorld(opts = {}) {
    const {
        radius = SPHERE_RADIUS, cellSize = CELL_SIZE,
        n = SPLAT_COUNT, footprint = SPLAT_FOOTPRINT,
    } = opts;

    const cloud = sphereCloud({ n, radius, scale: footprint });
    const vol = createVolume({ cellSize });
    const { stamped, skipped } = rasterise(vol, cloud, { mode: "coverage", minOpacity: 0.2, splatRadius: 1, maxRadius: footprint });
    const mesh = surfaceNets(vol, ISO);
    const { positions, indices } = meshTriples(mesh);
    const colliderBVH = new MeshBVH(trianglesFrom(positions, indices));

    return {
        colliderBVH,
        mesh,
        cloud,
        features: { radius, cellSize, n, stamped, skipped, triangleCount: colliderBVH.count },
    };
}
