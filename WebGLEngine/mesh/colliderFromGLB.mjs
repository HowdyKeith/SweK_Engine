// WebGLEngine/mesh/colliderFromGLB.mjs -- v4629
//
// TASK BOARD #79. hh-hang/collider-forge (MIT)'s glTF/3D-Tiles half, read (not copied) in an earlier round:
// "every Mesh in the loaded scene graph is traversed to world space... merged into one unindexed triangle
// soup... vertex-deduplicated... NO decimation, convex-hull generation, or voxelization."
//
// *** THE PORT TURNED OUT TO BE MOSTLY ALREADY DONE, FOR A DIFFERENT REASON. *** gpu/GLBParser.js's own
// "static scene-graph walk" (its own v768/round-30 name) is UNCONDITIONAL for any non-skinned GLB: every
// mesh node's every triangle primitive gets its own node-to-world transform baked into its positions (and,
// via inverse-transpose, its normals) before every primitive in the scene is concatenated into one flat
// positions/indices pair -- exactly collider-forge's "merge into one triangle soup" step, already built, to
// hand the RENDERER one draw-friendly buffer rather than to make anything collidable. And GLBParser's own
// postProcess step (default ON) welds duplicate vertices within opts.weldEpsilon (default 1e-4) -- collider-
// forge's "vertex-deduplicated" step, also already there for an unrelated reason (smoothing AI-generated
// meshes). What was missing was the bridge from "a parsed GLB" to "a MeshBVH", which is this file, built on
// physics/splat/splatMesh.mjs's own meshTriples() (the same flat-to-nested bridge that module already uses
// to hand its own surface-nets output to mesh/meshBVH.mjs's trianglesFrom).
//
// SCOPE, MATCHING THE REFERENCE'S OWN: a position-only collider, no decimation, convex-hull generation or
// voxelization, because none of that runs here either -- this hands trianglesFrom exactly the positions and
// indices GLBParser already produced, unmodified.
//
// WHAT THIS DOES NOT COVER, NAMED RATHER THAN DISCOVERED LATER:
//  * SKINNED GLBs. The scene-graph walk this depends on is the ELSE branch of GLBParser's own
//    `skinnedPrims.length > 0` check -- a file with ANY skinned primitive takes a different code path,
//    where unskinned "attachment" primitives get only a LOCAL bake (their owning joint's own offset), never
//    a full scene-root-to-world one. A moving, animated character is a different collision problem anyway
//    (per-frame, not a static BVH); this is for STATIC level/prop geometry, matching collider-forge's own
//    stated target ("Suitable for terrain, buildings, walls" -- three-player-controller's words for the
//    same kind of geometry, task board #80).
//  * A source GLB whose scenes[sceneIdx].nodes is missing. GLBParser then treats EVERY node as a root (its
//    own fallback), double-baking any node that is also a child of another. Not this file's bug to fix;
//    named so a caller feeding it a hand-built or unusual GLB understands why a collider might read twice
//    the triangles expected. tools/export/sceneGlb.mjs's own writeSceneGlb always emits a spec-valid
//    scenes[0].nodes, so anything built through this tree's own export path is unaffected.
//  * 3D Tiles and 3D Gaussian Splats, the reference's other two input formats. This tree has no 3D Tiles
//    loader to hand a merged scene to, and physics/splat/splatMesh.mjs already owns the splat case with its
//    own technique (density rasterisation + surface nets, task 58) -- not collider-forge's Windows-only,
//    prebuilt-executable Poisson-reconstruction path, which nextRounds.mjs's own entry names as a real,
//    stated, not-quietly-dropped constraint.
"use strict";
import { MeshBVH, trianglesFrom } from "./meshBVH.mjs";
import { meshTriples } from "../physics/splat/splatMesh.mjs";
import { GLBParser } from "../gpu/GLBParser.js";

/**
 * A MeshBVH collider from an ALREADY-PARSED GLB (GLBParser.parse()'s own return shape). Takes the parsed
 * result rather than the raw bytes so a caller that already parsed the file for rendering does not pay for
 * a second parse just to also collide with it.
 */
export function colliderFromParsedGLB(parsed) {
    if (!parsed || !parsed.positions || !parsed.indices) {
        throw new Error("colliderFromParsedGLB: expected a GLBParser.parse() result with positions/indices");
    }
    const { positions, indices } = meshTriples({ positions: parsed.positions, indices: parsed.indices });
    const colliderBVH = new MeshBVH(trianglesFrom(positions, indices));
    return { colliderBVH, triangleCount: colliderBVH.count, vertexCount: positions.length };
}

/** The one-call version: raw GLB bytes in, a collider out. `opts` passes straight through to GLBParser.parse. */
export async function colliderFromGLB(arrayBuffer, opts = {}) {
    const parsed = await GLBParser.parse(arrayBuffer, opts);
    return colliderFromParsedGLB(parsed);
}
