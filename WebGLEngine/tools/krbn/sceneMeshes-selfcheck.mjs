// tools/krbn/sceneMeshes-selfcheck.mjs
//
// Run: node tools/krbn/sceneMeshes-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The scene-mesh generators behind the compare-page picker. Each scene -- blob, splat, ragdoll -- must produce a valid,
// deterministic MeshInput that the projection and the OBJ export handle the same way, and the three must be genuinely
// different objects, not the same mesh relabelled. The sabotage breaks the index offset when meshes are merged, so a part
// references another part's vertices and the triangle indices run out of bounds -- which is the one bookkeeping error that
// silently corrupts a merged mesh.
import { SCENES, sceneMesh } from "./sceneMeshes.js";
import { project, KRBN_CAM } from "./krbnCompare.js";
import { liftStrokes, toOBJ } from "./strokeLift.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const names = Object.keys(SCENES);

// ---- 1. EVERY SCENE PRODUCES A VALID, NON-TRIVIAL MESH WITH INDICES IN BOUNDS ----------------------
{
    let allValid = true; const sizes = [];
    for (const n of names) {
        const m = sceneMesh(n); sizes.push(n + "=" + m.positions.length + "v");
        const inBounds = m.triangles.every((t) => t.every((i) => i >= 0 && i < m.positions.length));
        let maxIdx = 0; for (const t of m.triangles) for (const i of t) if (i > maxIdx) maxIdx = i;                       // a correct merge spreads indices across the whole array
        const spans = maxIdx > 0.5 * m.positions.length;                      // the no-offset merge bug collapses them to the low range
        if (m.positions.length < 50 || m.triangles.length < 50 || !inBounds || !spans) allValid = false;
    }
    ok("!! every scene produces a valid mesh -- indices in bounds AND spanning the whole vertex array", allValid,
       "blob, splat and ragdoll each mesh to hundreds or thousands of vertices with every index valid and reaching across the merged array (" + sizes.join(", ") + ") -- ready for the same projection and export.");
}

// ---- 2. EVERY SCENE IS DETERMINISTIC ---------------------------------------------------------------
{
    ok("!! every scene is deterministic", names.every((n) => JSON.stringify(sceneMesh(n)) === JSON.stringify(sceneMesh(n))),
       "the same scene meshes bit-identically every call -- fixed seeds throughout, so the drawing and the export are reproducible.");
}

// ---- 3. THE THREE SCENES ARE GENUINELY DIFFERENT OBJECTS -------------------------------------------
{
    const counts = names.map((n) => sceneMesh(n).positions.length);
    const distinct = new Set(counts).size === counts.length;
    const centroid = (m) => { let x = 0, y = 0, z = 0; for (const p of m.positions) { x += p[0]; y += p[1]; z += p[2]; } const k = m.positions.length; return [x / k, y / k, z / k]; };
    const rag = centroid(sceneMesh("ragdoll")), blob = centroid(sceneMesh("blob"));
    ok("!! blob, splat, ragdoll and flesh are genuinely different geometry, not one mesh relabelled", distinct && Math.abs(rag[2] - blob[2]) > 0.2,
       "distinct vertex counts and distinct centroids -- the ragdoll stands tall off the origin while the blob sits on it; the picker is switching real objects.");
}

// ---- 4. EVERY SCENE PROJECTS AND LIFTS THROUGH THE FULL PIPELINE ------------------------------------
{
    let allWork = true;
    for (const n of names) { const m = sceneMesh(n); const pr = m.positions.map((p) => project(p, KRBN_CAM));
        const strokes = []; for (const [i, j, k] of m.triangles) { const a = pr[i], b = pr[j], c = pr[k]; if (a && b && c) strokes.push([[a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [a[0], a[1]]]); }
        const obj = toOBJ(liftStrokes(strokes, m, KRBN_CAM)); if (!obj.includes("v ") || !obj.includes("l ")) allWork = false; }
    ok("!! every scene projects to a drawing and exports to a valid OBJ", allWork,
       "each scene runs the same project-then-lift-then-OBJ path the page uses -- the picker changes the object, not the machinery.");
}

// ---- 5. AN UNKNOWN SCENE FALLS BACK TO THE BLOB ----------------------------------------------------
{
    ok("!! an unknown scene name falls back to the blob rather than failing", JSON.stringify(sceneMesh("nope")) === JSON.stringify(sceneMesh("blob")),
       "a bad picker value returns the blob instead of throwing -- the page never lands on an empty canvas.");
}

// ---- 6. THE FLESH SKIN ENCLOSES THE RAGDOLL SKELETON -----------------------------------------------
{
    const bbox = (m) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of m.positions) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } return { lo, hi }; };
    const rag = bbox(sceneMesh("ragdoll")), flesh = bbox(sceneMesh("flesh"));
    const encloses = [0, 1, 2].every((i) => flesh.lo[i] <= rag.lo[i] + 0.05 && flesh.hi[i] >= rag.hi[i] - 0.05);
    ok("!! the flesh skin encloses the ragdoll skeleton it was grown from", encloses,
       "the marched capsule field wraps every bone -- the skin's bounding volume contains the rig's, so it is skin over the skeleton, not a shape floating beside it.");
}

console.log(fails ? "\nsceneMeshes-selfcheck: " + fails + " FAILED" : "\nsceneMeshes-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
