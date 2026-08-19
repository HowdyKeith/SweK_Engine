// WebGLEngine/mesh/voxelMeshGreedy-selfcheck.mjs — v2578
//
// Run: node mesh/voxelMeshGreedy-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES mesh/voxelMeshGreedy.js -- the greedy drop-in for voxel-viewer.html's buildVoxelMesh.
//
// ---- WINDING IS THE POINT --------------------------------------------------------------------------------------
//
// A voxel mesh can have every vertex in the right place, every colour correct, the right triangle count, and
// still render INSIDE OUT -- every face lit from behind, or vanishing entirely under backface culling. That
// failure is invisible to "does it have the right number of triangles" and invisible to set-equality of covered
// faces. IT IS ONLY VISIBLE IN A SCREENSHOT... OR IN A CROSS PRODUCT.
//
//     FOR EVERY QUAD: cross(v1 - v0, v2 - v0) . declaredNormal MUST BE > 0
//
// computed from the vertices ACTUALLY EMITTED. That is exact, it is arithmetic, and it needs no GPU.
//
// THE FIRST VERSION OF voxelMeshGreedy.js FAILED THIS 48 QUADS OUT OF 58. It carried a hand-written
// per-direction corner table, transcribed off the page's FACES array by eye. Six directions, each with a right
// answer and a wrong one, and most were wrong. THE FIX WAS NOT A BETTER TABLE -- it was to DERIVE the order from
// cross(du, dv) . n. ONE LINE OF ALGEBRA REPLACED SIX GUESSES.
//
// That is the same disease as everything else this session: v2557's checker pushed x and z and never y; v2564's
// probe asked a ship whether the engine had an up axis; v2568's mold never sensed; v2575's assertion read
// quads[0].w assuming an array order. TRANSCRIPTION IS GUESSING WITH EXTRA STEPS.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVoxelMeshGreedy } from "./voxelMeshGreedy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const cube = (n = 4, colour = (x, y, z) => (x + z) % 2) => {
    const v = [];
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) v.push([x, y, z, colour(x, y, z)]);
    return v;
};

/** cross(v1-v0, v2-v0) . n for every quad, from the vertices actually emitted. */
const windingErrors = (m) => {
    const P = m.positions, N = m.normals;
    let bad = 0;
    for (let i = 0; i < P.length / 3; i += 4) {
        const g = (k) => [P[(i + k) * 3], P[(i + k) * 3 + 1], P[(i + k) * 3 + 2]];
        const [v0, v1, v2] = [g(0), g(1), g(2)];
        const a = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const b = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        if (c[0] * N[i * 3] + c[1] * N[i * 3 + 1] + c[2] * N[i * 3 + 2] <= 0) bad++;
    }
    return bad;
};

// ---- 1. WINDING --------------------------------------------------------------------------------------------------
{
    for (const [name, v] of [["multicolour cube", cube(4)], ["single colour", cube(4, () => 3)],
                             ["one voxel", [[0, 0, 0, 1]]], ["sparse pair", [[0, 0, 0, 1], [5, 5, 5, 2]]]]) {
        const m = buildVoxelMeshGreedy(v);
        ok("NOT INSIDE OUT -- " + name, windingErrors(m) === 0,
           (m.positions.length / 12) + " quads, " + windingErrors(m) + " facing the wrong way. THE FIRST VERSION OF THIS FILE FAILED 48 OF 58 -- it carried a corner table TRANSCRIBED OFF THE PAGE BY EYE. The fix was to DERIVE the order from cross(du,dv).n. ONE LINE OF ALGEBRA REPLACED SIX GUESSES. A mesh can have every vertex right, every colour right, the right triangle count, AND STILL RENDER INSIDE OUT -- invisible to every check except a screenshot OR A CROSS PRODUCT.");
    }
}

// ---- 2. IT IS A DROP-IN, OR IT IS A REWRITE PRETENDING TO BE A FLAG ---------------------------------------------
{
    const m = buildVoxelMeshGreedy(cube(4));
    for (const [k, T] of [["positions", Float32Array], ["normals", Float32Array], ["colors", Float32Array], ["indices", Uint32Array]]) {
        ok("returns " + k + " as " + T.name, m[k] instanceof T, "the page's consumer at :449 and :699 uploads these straight to the GPU");
    }
    ok("...and bounds", !!m.bounds && Array.isArray(m.bounds.min), JSON.stringify(m.bounds));
    ok("...and every position/normal/colour is the same length", m.positions.length === m.normals.length && m.positions.length === m.colors.length,
       m.positions.length + " / " + m.normals.length + " / " + m.colors.length + " -- a mismatch here is a GPU error at upload, or worse, silently wrong attributes");
    ok("...and 6 indices per 4 vertices", m.indices.length / 6 === m.positions.length / 12,
       m.indices.length + " indices for " + (m.positions.length / 3) + " vertices");
}

// ---- 3. IT MERGES, AND IT RESPECTS COLOUR ------------------------------------------------------------------------
{
    const solid = buildVoxelMeshGreedy(cube(8, () => 1));
    ok("A SINGLE-COLOUR 8x8x8 CUBE IS SIX QUADS", solid.quadCount === 6,
       solid.quadCount + " quads / " + (solid.indices.length / 3) + " triangles. The page's per-face path emits 384 faces (768 triangles) for the same cube.");
    const striped = buildVoxelMeshGreedy(cube(8, (x) => x % 2));
    ok("...and a STRIPED cube cannot merge across the stripes", striped.quadCount > solid.quadCount,
       striped.quadCount + " quads vs " + solid.quadCount + " for one colour. MERGING ACROSS A COLOUR SEAM WOULD PAINT TWO MATERIALS ONE COLOUR -- silent, and it looks like a texturing bug.");
}

// ---- 4. colour index 0 is a real colour --------------------------------------------------------------------------
{
    const m = buildVoxelMeshGreedy([[0, 0, 0, 0]]);
    ok("A VOXEL OF COLOUR 0 STILL EXISTS", m.quadCount === 6,
       m.quadCount + " quads. The mesher reads 0 as EMPTY, so tags are colourIndex+1. OFF BY ONE HERE AND EVERY VOXEL OF PALETTE INDEX 0 VANISHES -- a hole that looks like a content bug, not a code bug.");
    const empty = buildVoxelMeshGreedy([]);
    ok("...and an empty model is empty, not a crash", empty.positions.length === 0, "0 quads");
}

// ---- 5. the page it is a drop-in FOR still exists and still has its own path ------------------------------------
{
    const page = fs.readFileSync(path.join(here, "..", "voxel-viewer.html"), "utf8");
    ok("voxel-viewer.html's own buildVoxelMesh is UNTOUCHED", /function buildVoxelMesh\(voxels\)/.test(page),
       "the old path stays DEFAULT and reachable. THIS MODULE IS NOT WIRED IN YET: it is a drop-in that has never been dropped in, and calling it 'done' before Keith sees both meshes side by side would be exactly the claim this engine exists to refuse.");
    ok("...and it still reads voxels as [x, y, z, c]", /for \(const \[x, y, z, c\] of voxels\)/.test(page),
       "FOUR elements, c is a PALETTE INDEX -- the fact that killed the colour-blind mesher");
}

console.log(fails ? "\nvoxelMeshGreedy-selfcheck: " + fails + " FAILED" : "\nvoxelMeshGreedy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
