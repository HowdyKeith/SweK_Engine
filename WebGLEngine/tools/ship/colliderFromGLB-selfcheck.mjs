// WebGLEngine/tools/ship/colliderFromGLB-selfcheck.mjs -- v4629
//
// Gates mesh/colliderFromGLB.mjs (task board #79): the bridge from an already-parsed (or raw) GLB to a
// MeshBVH collider. Section 1 proves the multi-node WORLD-TRANSFORM bake this file depends on (gpu/
// GLBParser.js's own "static scene-graph walk") really does reach the returned collider, using the exact
// synthetic-GLB technique tools/ship/sceneGlb-selfcheck.mjs already established (writeSceneGlb + GLBParser.
// parse). Section 2 proves the OTHER end: a capsule (physics/character/capsuleCollide.mjs, task #80) can
// actually stand on and be blocked by a collider built this way, the same rigor tools/ship/
// controllerLabWorld-selfcheck.mjs already applied to a hand-authored level.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { colliderFromParsedGLB, colliderFromGLB } = await import(pathToFileURL(path.join(ENG, "mesh", "colliderFromGLB.mjs")).href);
const { writeSceneGlb } = await import(pathToFileURL(path.join(ENG, "tools", "export", "sceneGlb.mjs")).href);
const { GLBParser } = await import(pathToFileURL(path.join(ENG, "gpu", "GLBParser.js")).href);
const { depenetrateCapsule, probeGround } = await import(pathToFileURL(path.join(ENG, "physics", "character", "capsuleCollide.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

// A small unit-square marker quad lying FLAT in the XZ plane (y=0, up-facing normals) -- unlike sceneGlb-
// selfcheck.mjs's own quad() helper (a vertical XY-plane quad, fine for "does geometry exist" but wrong for
// this file's raycast-straight-down checks), this one gives a straight-down ray something to hit.
const markerQuad = (name) => ({
    name,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
});

console.log("1. THE MULTI-NODE WORLD-TRANSFORM BAKE REACHES THE COLLIDER, NOT JUST THE FIRST NODE");
{
    const scene = {
        meshes: [markerQuad("m")],
        nodes: [
            { name: "a", mesh: 0 },                                    // at the origin
            { name: "b", mesh: 0, translation: [20, 0, 0] },           // 20 units away in +X
            { name: "c", mesh: 0, translation: [0, 0, 20], scale: [2, 2, 2] },   // 20 in +Z, doubled in size
        ],
    };
    const glb = writeSceneGlb(scene);
    const parsed = await GLBParser.parse(ab(glb), { postProcess: false });   // raw bake, exact assertions
    ok("  GLBParser itself already merged all 3 nodes -- 3 quads * 2 tris = 6 triangles before this file runs",
       parsed.indices.length === 18, `${parsed.indices.length / 3} triangles in the parsed result`);

    const { colliderBVH, triangleCount } = colliderFromParsedGLB(parsed);
    ok("!! *** colliderFromParsedGLB carries all 3 nodes through -- 6 triangles, none dropped or duplicated ***",
       triangleCount === 6, `triangleCount=${triangleCount}`);

    // Raycast straight down through each node's own world position, and through a point with nothing there.
    const hitAt = (x, z) => colliderBVH.raycastFirst(x, 5, z, 0, -1, 0, 10);
    ok("!! node a's geometry is at the origin", !!hitAt(0.5, 0.5), "ray through (0.5,0.5) should hit the unit quad at the origin");
    ok("!! *** node b's geometry reflects its OWN translation (+20 in X), not a copy of node a's ***",
       !!hitAt(20.5, 0.5), "ray through (20.5,0.5) should hit node b's quad");
    // Node c: local footprint x,z in [0,1], scale 2x -> [0,2], then translated +20 in z -> world x in [0,2], z in [20,22].
    ok("!! *** node c's geometry reflects its scale (2x): (1.5,20.5) is OUTSIDE the unscaled 1x1 footprint but inside the doubled one ***",
       !!hitAt(1.5, 20.5), "if scale were dropped, x=1.5 would fall outside a 1x1 quad and this would miss");
    ok("  ...and does not scale further than it should: (2.5,20.5) is outside even the doubled footprint",
       hitAt(2.5, 20.5) === null);
    ok("  nowhere near any of the three nodes has no geometry at all", hitAt(50, 50) === null);
}

console.log("\n2. THE DEFAULT (postProcess: true) PATH ALSO WORKS, AND THE ONE-CALL colliderFromGLB() MATCHES IT");
{
    const scene = { meshes: [markerQuad("m")], nodes: [{ name: "a", mesh: 0 }] };
    const glb = writeSceneGlb(scene);
    const viaManual = colliderFromParsedGLB(await GLBParser.parse(ab(glb), {}));   // default opts: postProcess on
    const viaOneCall = await colliderFromGLB(ab(glb), {});
    ok("  the default (welded/postProcessed) path produces a valid, non-empty collider",
       viaManual.colliderBVH.count > 0, `triangleCount=${viaManual.triangleCount}`);
    ok("!! the one-call colliderFromGLB() and the manual parse+colliderFromParsedGLB agree on triangle count",
       viaOneCall.triangleCount === viaManual.triangleCount,
       `oneCall=${viaOneCall.triangleCount}, manual=${viaManual.triangleCount}`);
}

console.log("\n3. A BAD INPUT FAILS LOUDLY, NOT WITH A SILENT EMPTY COLLIDER");
{
    let threw = false;
    try { colliderFromParsedGLB(null); } catch { threw = true; }
    ok("  colliderFromParsedGLB(null) throws rather than returning something that looks like a valid collider", threw);
    let threw2 = false;
    try { colliderFromParsedGLB({ positions: null, indices: null }); } catch { threw2 = true; }
    ok("  a parsed-looking object missing positions/indices also throws", threw2);
}

console.log("\n4. THE RESULTING COLLIDER IS A REAL, WALKABLE physics/character/capsuleCollide.mjs SURFACE");
{
    // A big flat floor -- large enough for a capsule (radius 0.4) to rest on comfortably away from the edges.
    const floor = {
        name: "floor",
        positions: new Float32Array([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, -10, 10, 0, 10, -10, 0, 10]),
        normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    };
    const glb = writeSceneGlb({ meshes: [floor], nodes: [{ name: "floor", mesh: 0 }] });
    const { colliderBVH } = await colliderFromGLB(ab(glb), { postProcess: false });

    const embedded = depenetrateCapsule([0, -0.1, 0], 0.4, 1.8, colliderBVH);
    ok("!! *** a capsule embedded slightly into a GLB-sourced floor is pushed back out and grounded ***",
       embedded.grounded === true && Math.abs(embedded.pos[1] - 0) < 1e-6, `settled y=${embedded.pos[1].toFixed(4)}`);

    const probe = probeGround([0, 1, 0], 0.4, colliderBVH);
    ok("  probeGround finds the same floor from above", !!probe && probe.standable !== false, probe ? `dist=${probe.dist.toFixed(3)}` : "null");
}

console.log();
if (fails) { console.log("[colliderFromGLB-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[colliderFromGLB-selfcheck] all passed");
