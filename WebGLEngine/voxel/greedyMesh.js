// FILE: voxel/greedyMesh.js
// VERSION: v3 -- DELEGATES TO mesh/greedyMesh3d.js (v2575)
//
// ---- WHAT THIS FILE USED TO BE, AND WHY IT NEVER RAN -----------------------------------------------------------
//
// v2 called itself "SAFE BOUNDS + DEBUG HARDENING" and could not run. Three separate reasons, all measured in
// v2572/v2573:
//
//   1. IT CALLED A METHOD NOBODY DEFINES. Its get() called chunk.getIndex(x,y,z). The ONLY getIndex() in this
//      entire tree is THREE.js's BufferGeometry.getIndex(), in vendor/. NO CHUNK ANYWHERE DEFINED IT.
//   2. IT DID NOT MERGE. It emitted `quads.push([x, y, z])` -- no w, no h, no normal. One entry per visible
//      voxel IS NAIVE MESHING. Its own comment admitted it: "very simplified face emission (debug-safe)".
//      IT WAS A NAIVE MESHER WEARING A GREEDY NAME. A NAME IS A CLAIM.
//   3. ITS CALLERS SPOKE A DIFFERENT LANGUAGE. world/VoxelWorld.js:18 hands it `{ blocks }` -- an array of
//      [x,y,z] triples. v2 read chunk.size, chunk.height and chunk.getIndex. NONE OF THE THREE ARE THERE.
//
// Reason 3 is the real one. THIS TREE SPEAKS THREE CHUNK LANGUAGES and nobody wrote that down:
//
//     { voxels: Uint8Array, size, height }   dense grid     mesh/greedyMesher.js (v1)
//     [[x,y,z], ...]                          sparse list    world/VoxelWorld.js, voxel-viewer.html:208
//     { size, height, getIndex() }            ONLY v2. Nothing produced it. Nothing ever did.
//
// v2 did not merely throw. IT SPOKE A LANGUAGE NOTHING SPEAKS.
//
// ---- WHY THIS IS A REWRITE AND NOT A DELETION ------------------------------------------------------------------
//
// Two modules import this path (world/VoxelWorld.js, voxel/VoxelMesh.js). They are orphans -- v2573 measured
// zero live importers upstream -- but DELETING A FILE TWO MODULES IMPORT, TO TIDY A BROKEN THING, IS HOW YOU
// BREAK A WORKING THING, and the voxel front door cannot boot in the sandbox to prove otherwise. MAKING THE
// BROKEN THING CORRECT IS STRICTLY SAFER THAN REMOVING IT: same export, same path, callers untouched.
//
// It now delegates to mesh/greedyMesh3d.js, which is gated on SET EQUALITY with a naive oracle across seven
// shapes -- so this file's correctness is no longer a claim in a header, it is somebody else's passing test.
import { greedyMesh3d, solidFromBlocks } from "../mesh/greedyMesh3d.js";

/**
 * Accepts every chunk language this tree actually speaks, and says so when handed one it does not.
 *
 * @param {{blocks?: Array<[number,number,number]>, voxels?: Uint8Array, size?: number, height?: number}} chunk
 * @returns {{quads: Array, offset: [number,number,number], dims: [number,number,number]}}
 */
export function greedyMesh(chunk) {
    if (!chunk || typeof chunk !== "object") {
        throw new TypeError("greedyMesh: expected a chunk object, got " + typeof chunk);
    }

    // SPARSE LIST -- what world/VoxelWorld.js actually hands us, and what v2 could never read.
    if (Array.isArray(chunk.blocks)) {
        const { solid, dims, offset } = solidFromBlocks(chunk.blocks);
        return { quads: greedyMesh3d(solid, dims), offset, dims };
    }

    // DENSE GRID -- v1's language, so a caller holding one is not stranded.
    if (chunk.voxels && typeof chunk.size === "number") {
        const size = chunk.size, height = chunk.height ?? chunk.size, v = chunk.voxels;
        const dims = [size, height, size];
        // The index order is v1's: x + z*size + y*size*size. IF THAT IS WRONG, THE MESH IS INSIDE OUT, so it is
        // stated here rather than assumed by whoever reads this next.
        const solid = (x, y, z) =>
            x >= 0 && y >= 0 && z >= 0 && x < size && y < height && z < size &&
            !!v[x + z * size + y * size * size];
        return { quads: greedyMesh3d(solid, dims), offset: [0, 0, 0], dims };
    }

    // A THIRD LANGUAGE WE DO NOT SPEAK. Say which one arrived instead of returning an empty mesh -- an empty
    // mesh is indistinguishable from an empty world, and that is a bug that looks like content.
    throw new TypeError(
        "greedyMesh: unrecognised chunk shape. Give it { blocks: [[x,y,z],...] } or { voxels, size, height }. " +
        "Received keys: [" + Object.keys(chunk).join(", ") + "]. " +
        "(v2 of this file read chunk.getIndex(), which NOTHING in this tree has ever defined.)"
    );
}
