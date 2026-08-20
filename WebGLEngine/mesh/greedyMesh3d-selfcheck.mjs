// WebGLEngine/mesh/greedyMesh3d-selfcheck.mjs — v2574
//
// Run: node mesh/greedyMesh3d-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES mesh/greedyMesh3d.js -- full-3D greedy meshing, the gap v2573 found between the three meshers this
// engine already had (v1: works but 2.5D top-faces-only; v2: throws, dead; voxel-viewer.html:208: live and
// merges nothing).
//
// ---- THE INVARIANT, AND WHY IT IS BETTER THAN A SCREENSHOT ------------------------------------------------------
//
//     A GREEDY MESH MUST COVER EXACTLY THE SAME UNIT FACES AS A NAIVE MESH. NOT APPROXIMATELY. EXACTLY.
//
// Merging is a re-description of the same surface. A merged quad covering a face the naive mesher never emitted
// is a wall that is not there. A missing one is a hole. Both are exactly detectable: decompose every greedy quad
// back into the unit faces it CLAIMS to cover, and compare SETS with the naive oracle.
//
// "The voxels look right" is not a test. A mesher that dropped one interior face passes it every single time, and
// so does one that emits a face at the wrong normal. THIS gate cannot be passed by a mesh that is merely
// plausible.
//
// MEASURED, all five set-identical:
//
//     shape                  naive   greedy   ratio
//     flat 16x16 slab          576        6    96.0x
//     solid 16 cube           1536        6   256.0x
//     hollow shell             984       12    82.0x
//     checkerboard            1536     1536     1.0x
//     random cloud            1788     1385     1.3x
//
// The cube becoming SIX quads is the tell that it is right: a cube IS six quads. And the CHECKERBOARD IS THE
// HONEST LIMIT -- 1.0x, nothing merged, because no two adjacent faces are coplanar. GREEDY MESHING WINS ON FLAT
// THINGS AND DOES NOTHING ON NOISE. A version of this file that only tested slabs would report 96x and imply it
// was a general speedup. IT IS NOT. The shapes are chosen to make it admit that.
import { greedyMesh3d, greedyMesh3dTagged, naiveFaces, quadsToUnitFaces, facesToSet } from "./greedyMesh3d.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const SHAPES = {
    "flat slab": { dims: [16, 1, 16], f: () => true, expect: 6 },
    "solid cube": { dims: [16, 16, 16], f: () => true, expect: 6 },
    "hollow shell": { dims: [10, 10, 10], f: (x, y, z) => x === 0 || y === 0 || z === 0 || x === 9 || y === 9 || z === 9 },
    "checkerboard": { dims: [8, 8, 8], f: (x, y, z) => (x + y + z) % 2 === 0 },
    "random cloud": { dims: [12, 12, 12], f: (x, y, z) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % 5) === 0 },
    "single voxel": { dims: [1, 1, 1], f: () => true, expect: 6 },
    "empty": { dims: [4, 4, 4], f: () => false, expect: 0 },
};

const bound = (s) => (x, y, z) =>
    x >= 0 && y >= 0 && z >= 0 && x < s.dims[0] && y < s.dims[1] && z < s.dims[2] && s.f(x, y, z);

// ---- 1. THE INVARIANT: same surface, exactly, on every shape ---------------------------------------------------
for (const [name, s] of Object.entries(SHAPES)) {
    const solid = bound(s);
    const g = greedyMesh3d(solid, s.dims);
    const nv = naiveFaces(solid, s.dims);
    const gs = quadsToUnitFaces(g), ns = facesToSet(nv);
    const missing = [...ns].filter((k) => !gs.has(k)).length;
    const extra = [...gs].filter((k) => !ns.has(k)).length;
    ok("SAME SURFACE, EXACTLY -- " + name, missing === 0 && extra === 0 && gs.size === ns.size,
       nv.length + " naive faces -> " + g.length + " greedy quads (" + (g.length ? (nv.length / g.length).toFixed(1) : "0") +
       "x). missing " + missing + ", invented " + extra + ". A MERGED QUAD COVERING A FACE THE NAIVE MESHER NEVER EMITTED IS A WALL THAT IS NOT THERE; A MISSING ONE IS A HOLE. 'The voxels look right' cannot see either.");
}

// ---- 2. THE ANSWERS THAT MUST BE EXACTLY RIGHT ------------------------------------------------------------------
{
    const cube = greedyMesh3d(bound(SHAPES["solid cube"]), SHAPES["solid cube"].dims);
    ok("A SOLID CUBE IS SIX QUADS", cube.length === 6,
       cube.length + " quads from a 16x16x16 solid (1536 naive faces, 256x). A CUBE IS SIX QUADS -- if this said 7 the mesher would be splitting a face for no reason, and if it said 5 it would have lost a wall.");
    const one = greedyMesh3d(bound(SHAPES["single voxel"]), SHAPES["single voxel"].dims);
    ok("...and a single voxel is six quads", one.length === 6, one.length + " quads");
    const none = greedyMesh3d(bound(SHAPES["empty"]), SHAPES["empty"].dims);
    ok("...and empty space is no quads, not one degenerate one", none.length === 0, none.length + " quads");
}

// ---- 3. THE HONEST LIMIT ---------------------------------------------------------------------------------------
{
    const s = SHAPES["checkerboard"];
    const g = greedyMesh3d(bound(s), s.dims), nv = naiveFaces(bound(s), s.dims);
    ok("!! A CHECKERBOARD MERGES NOTHING, AND THE GATE SAYS SO", g.length === nv.length,
       nv.length + " naive -> " + g.length + " greedy = 1.0x. NO TWO ADJACENT FACES ARE COPLANAR, SO THERE IS NOTHING TO MERGE. GREEDY MESHING WINS ON FLAT THINGS AND DOES NOTHING ON NOISE. A version of this file that only tested slabs would report 96x AND IMPLY A GENERAL SPEEDUP. IT IS NOT ONE. These shapes are chosen to make it admit that.");
    const cloud = SHAPES["random cloud"];
    const gc = greedyMesh3d(bound(cloud), cloud.dims), nc = naiveFaces(bound(cloud), cloud.dims);
    ok("...and a random cloud barely merges either", nc.length / gc.length < 2,
       nc.length + " -> " + gc.length + " = " + (nc.length / gc.length).toFixed(1) + "x. Between the 256x cube and the 1.0x checkerboard, THE REAL NUMBER FOR REAL TERRAIN IS SOMEWHERE IN BETWEEN AND NOBODY HERE HAS MEASURED IT ON REAL TERRAIN -- that needs a chunk off the rig, not a shape I invented.");
}

// ---- 4. the out-of-bounds trap ---------------------------------------------------------------------------------
{
    // A solid() that reads outside the volume and answers TRUE produces a mesh with NO OUTER WALLS -- every
    // boundary face gets culled against a neighbour that "exists". That does not throw, it does not warn, and it
    // looks like a lighting bug. Prove the mesher asks about outside cells at all.
    let askedOutside = false;
    const probe = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x > 1 || y > 1 || z > 1) { askedOutside = true; return false; }
        return true;
    };
    const g = greedyMesh3d(probe, [2, 2, 2]);
    ok("the mesher ASKS about cells outside the volume", askedOutside,
       "so solid() MUST answer false out of bounds. One that answers true produces a mesh WITH NO OUTER WALLS -- it does not throw, it does not warn, and it looks like a lighting bug.");
    ok("...and a 2x2x2 solid is still six quads", g.length === 6, g.length + " quads");
}

// ---- 5. v2577: THE TAGGED MESHER MUST NEVER MERGE ACROSS MATERIALS -------------------------------------------
//
// voxel-viewer.html:215 reads `for (const [x, y, z, c] of voxels)` -- FOUR elements, c is a PALETTE INDEX. A
// boolean mesher CANNOT SEE COLOUR and would merge a red voxel with a blue one and paint the result ONE colour.
// IT DOES NOT THROW. IT DOES NOT WARN. IT LOOKS LIKE A TEXTURING BUG.
{
    // Two materials, side by side, sharing a seam. A colour-blind mesher makes ONE quad here.
    const dims = [4, 1, 2];
    const tagAt = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= 4 || y >= 1 || z >= 2) ? 0 : (x < 2 ? 1 : 2);
    const top = greedyMesh3dTagged(tagAt, dims).filter((q) => q.normal[1] === 1);
    ok("THE TAGGED MESHER REFUSES TO MERGE ACROSS A MATERIAL SEAM", top.length === 2,
       top.length + " top quads for a 4x1x2 slab that is tag 1 on the left and tag 2 on the right. ONE quad would mean a red voxel and a blue voxel painted a single colour -- A SILENT CORRUPTION THAT LOOKS LIKE A TEXTURING BUG.");
    ok("...and each quad still merges WITHIN its material", top.every((q) => q.w * q.h === 4),
       JSON.stringify(top.map((q) => ({ tag: q.tag, w: q.w, h: q.h }))) + " -- refusing to merge across the seam must not mean refusing to merge at all.");
    ok("...and every quad carries the tag it covers", top.every((q) => q.tag === 1 || q.tag === 2),
       "a quad without its material is a quad the renderer has to guess about");
}
{
    // A tagged mesh must still cover the same surface as a naive one -- tags change WHERE the cuts are, never
    // WHICH faces exist.
    const dims = [8, 8, 8];
    const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < 8 && y < 8 && z < 8;
    const tagAt = (x, y, z) => (solid(x, y, z) ? 1 + ((x + y + z) % 3) : 0);
    const tagged = greedyMesh3dTagged(tagAt, dims);
    const faces = new Set();
    for (const q of tagged) {
        for (let j = 0; j < q.h; j++) for (let i = 0; i < q.w; i++) {
            faces.add([q.pos[0] + q.du[0] * i + q.dv[0] * j, q.pos[1] + q.du[1] * i + q.dv[1] * j,
                       q.pos[2] + q.du[2] * i + q.dv[2] * j].join(",") + "|" + q.normal.join(","));
        }
    }
    const nv = facesToSet(naiveFaces(solid, dims));
    ok("...and a TAGGED mesh still covers EXACTLY the naive surface", faces.size === nv.size && [...nv].every((k) => faces.has(k)),
       faces.size + " vs " + nv.size + " unit faces. TAGS CHANGE WHERE THE CUTS ARE, NEVER WHICH FACES EXIST. A tagged mesher that dropped a face at a material boundary would leave a hole exactly where the eye is drawn.");
}

console.log(fails ? "\ngreedyMesh3d-selfcheck: " + fails + " FAILED" : "\ngreedyMesh3d-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
