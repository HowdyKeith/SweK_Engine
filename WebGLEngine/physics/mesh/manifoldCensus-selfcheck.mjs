// WebGLEngine/physics/mesh/manifoldCensus-selfcheck.mjs -- v3453
//
// Run: node physics/mesh/manifoldCensus-selfcheck.mjs
//
// *** THE INSTRUMENT IS PROVEN ON FIXTURES WITH KNOWN ANSWERS BEFORE IT IS POINTED AT EITHER EXTRACTOR. ***
// v3450's lesson, applied rather than re-learned: on a real mesh there is nothing to check the answer against,
// so a census that has never been shown to FIRE is a census that might not.
//
// AND THE ANSWER KEY FOR THE REAL RUN ALREADY EXISTED IN THE TREE: marching tetrahedra is manifold BY
// CONSTRUCTION, so it must read ZERO on every fixture. Dual contouring is the module that can genuinely fail --
// ONE VERTEX PER CELL means a cell carrying two surface sheets pins both to the same vertex.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { manifoldCensus } from "./manifoldCensus.mjs";
import { dualContour } from "./dualContour.mjs";
import { sphere, box, union, subtract } from "./csg.mjs";
import { marchingTets, sphereField, boxField } from "./marchingCubes.js";

// SIGN CONVENTIONS DIFFER BETWEEN THE TWO AND THAT IS READ FROM THE SOURCE, NOT ASSUMED: csg nodes are SIGNED
// DISTANCE (negative inside) while marchingCubes' fields are POSITIVE INSIDE (sphereField is R^2 - r^2). So a
// csg node handed to marchingTets is NEGATED. Getting this backwards would extract the complement and still
// produce a plausible-looking closed mesh -- a wrong answer that renders.
const asField = (node) => ({ f: (x, y, z) => -node.f([x, y, z]), g: (x, y, z) => node.g([x, y, z]).map((c) => -c) });

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ============================================================================================================
 * 1. FIXTURES WITH KNOWN ANSWERS -- INCLUDING THE ONES THAT MUST READ ZERO
 * ========================================================================================================= */
{
    // A single quad: four boundary edges, no interior, and NOT a defect.
    const openQuad = manifoldCensus([[0, 1, 2, 3]]);
    ok("!! an open quad reads FOUR BOUNDARY EDGES and ZERO non-manifold anything",
       openQuad.boundaryEdges === 4 && openQuad.nonManifoldEdges === 0 && openQuad.nonManifoldVertices === 0,
       "AN OPEN SURFACE IS NOT A BROKEN ONE. Folding boundary and non-manifold into one 'not exactly two' count would call this mesh defective, and it is simply open -- opposite news under one label.");

    // Three triangles sharing one edge: the textbook non-manifold EDGE.
    const fin = manifoldCensus([[0, 1, 2], [0, 1, 3], [0, 1, 4]]);
    ok("!! *** three faces on one edge reads NON-MANIFOLD EDGE = 1 ***",
       fin.nonManifoldEdges === 1, `edge 0-1 carries 3 faces. ${JSON.stringify({ b: fin.boundaryEdges, nme: fin.nonManifoldEdges })}`);

    // *** THE BOWTIE: two quads meeting at ONE SHARED VERTEX and nothing else. EVERY EDGE IS FINE. ***
    const bowtie = manifoldCensus([[0, 1, 2, 3], [0, 4, 5, 6]]);
    ok("!! *** THE BOWTIE: two sheets sharing ONE VERTEX -- ZERO non-manifold EDGES, and the vertex test catches it ***",
       bowtie.nonManifoldEdges === 0 && bowtie.nonManifoldVertices === 1,
       "*** THIS IS THE WHOLE REASON THE VERTEX TEST EXISTS. Edge incidence is PERFECT here and the mesh is still not a surface: no neighbourhood of vertex 0 looks like a disc. AN EDGE-ONLY CENSUS -- WHICH IS WHAT marchingCubes.js CALLS 'watertight' -- WOULD REPORT THIS CLEAN. And it is exactly the shape dual contouring makes when one cell carries two sheets. ***");

    // A closed tetrahedron: the positive control. A test that only ever fires is as useless as one that never does.
    const tet = manifoldCensus([[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]);
    ok("!! and a closed tetrahedron reads CLOSED MANIFOLD -- the census can also say yes",
       tet.closedManifold && tet.boundaryEdges === 0 && tet.nonManifoldVertices === 0,
       `${tet.edges} edges, every one shared by two faces. A CHECK THAT ONLY EVER FIRES IS AS USELESS AS ONE THAT NEVER DOES, so both directions are fixture-proven before either extractor is touched.`);
}

/* ============================================================================================================
 * 2. THE ANSWER KEY: MARCHING TETS MUST READ ZERO, BECAUSE IT IS MANIFOLD BY CONSTRUCTION
 * ========================================================================================================= */
{
    const rows = [];
    for (const [name, fld] of [["sphere", sphereField(0.62)], ["box", boxField(0.45)]]) {
        const m = marchingTets(fld.f, fld.g, { N: 24, lo: -1, hi: 1 });
        const c = manifoldCensus(m.tris);
        rows.push([name, c]);
        say(`marching tets ${name}: ${c.faces} faces, boundary ${c.boundaryEdges}, nm-edges ${c.nonManifoldEdges}, nm-verts ${c.nonManifoldVertices}`);
    }
    ok("!! *** MARCHING TETS READS ZERO ON BOTH -- THE ANSWER KEY, AND IT WAS ALREADY IN THE TREE ***",
       rows.every(([, c]) => c.closedManifold),
       "Manifold by construction (six tets on a shared diagonal, consistent across neighbours), so a nonzero here would mean THE CENSUS is wrong rather than the extractor. THIS IS WHAT MAKES THE DUAL-CONTOURING NUMBERS BELOW READABLE: the instrument agrees with a method whose answer is known in advance.");
}

/* ============================================================================================================
 * 3. DUAL CONTOURING, SWEPT -- AND THE ANSWER SPLITS BY SHAPE, WHICH IS THE FINDING
 * ========================================================================================================= */
const OFFSETS = [0, 0.013, 0.027, 0.041, 0.053, 0.067];
const RES = [12, 16, 20];
function sweep(node) {
    const rows = [];
    for (const n of RES) for (const o of OFFSETS) {
        const c = manifoldCensus(dualContour(node, { lo: -1 + o, hi: 1 + o, n }).quads);
        rows.push({ n, o, e: c.nonManifoldEdges, v: c.nonManifoldVertices, b: c.boundaryEdges });
    }
    return rows;
}
const FIELDS = {
    sphere: sphere([0, 0, 0], 0.62),
    box: box([0, 0, 0], [0.45, 0.45, 0.45]),
    csg: subtract(sphere([0, 0, 0], 0.55), box([0, 0, 0], [0.4, 0.4, 0.9])),
};
const SWEPT = Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, sweep(v)]));
const tot = (k, f) => SWEPT[k].reduce((a, r) => a + r[f], 0);
for (const k of Object.keys(FIELDS)) {
    say(`dual contouring ${k}: nm-edges ${tot(k, "e")}, nm-verts ${tot(k, "v")}, boundary ${tot(k, "b")} over ${SWEPT[k].length} runs`);
}
{
    ok("!! *** THE SIMPLE CLOSED SHAPES ARE CLEAN -- so a nonzero elsewhere is about the SHAPE, not about the census ***",
       tot("sphere", "e") === 0 && tot("sphere", "v") === 0 && tot("box", "e") === 0 && tot("box", "v") === 0,
       "A smooth sphere and a sharp box both read ZERO across 18 runs each. WITHOUT THIS THE CSG NUMBER BELOW WOULD BE UNREADABLE: an instrument that flags everything has found nothing.");

    ok("!! *** AND THE CSG SOLID IS NOT CLEAN. DUAL CONTOURING PRODUCES NON-MANIFOLD EDGES HERE, MEASURED. ***",
       tot("csg", "e") > 0,
       `${tot("csg", "e")} non-manifold edges over ${SWEPT.csg.length} runs of sphere-minus-box, against ZERO for the sphere and ZERO for the box. THE DEFECT NEEDS A SHAPE WITH A SUBTRACTION -- thin walls and concave sharp edges -- WHICH IS PRECISELY THE CASE csg.html EXISTS TO DRAW. It was reachable all along and nothing was looking.`);

    // *** THE DISCRIMINATOR: does refining fix it? ***
    const byRes = RES.map((n) => [n, SWEPT.csg.filter((r) => r.n === n).reduce((a, r) => a + r.e, 0)]);
    const byOffSpread = RES.map((n) => { const v = SWEPT.csg.filter((r) => r.n === n).map((r) => r.e); return Math.max(...v) - Math.min(...v); });
    say(`csg non-manifold edges by resolution: ${JSON.stringify(byRes)}; within-resolution spread across offsets: ${JSON.stringify(byOffSpread)}`);

    ok("!! *** IT SWINGS WITH THE ALIGNMENT RATHER THAN FALLING WITH THE RESOLUTION, SO REFINING DOES NOT FIX IT ***",
       !(byRes[0][1] > byRes[1][1] && byRes[1][1] > byRes[2][1]) && Math.max(...byOffSpread) > 1,
       `by resolution ${JSON.stringify(byRes)} -- NOT MONOTONE -- while a single resolution spans ${JSON.stringify(byOffSpread)} across sub-cell offsets alone. *** THAT IS THE SAME SIGNATURE AS THE massPoint FALLBACK AT v3438 AND IT MEANS THE SAME THING: A DEFECT THAT MOVES WITH THE GRID'S PHASE IS STRUCTURAL, NOT A SAMPLING ACCIDENT THAT MORE CELLS WILL AVERAGE AWAY. And it is why ONE alignment would have reported this clean -- offset 0 at n=12 reads zero. ***`);

    ok("...and NO non-manifold VERTEX appears anywhere, which is a separate claim and is reported as one",
       Object.keys(FIELDS).every((k) => tot(k, "v") === 0),
       "The bowtie case -- one cell carrying two sheets pinned to its single vertex -- is the failure dual contouring is best known for, and THESE FIXTURES DO NOT PRODUCE IT. That is a statement about the fixtures, NOT a clean bill for the method: section 1 proves the vertex test fires on a mesh that has one, so the zero here is real rather than a dead check.");
}

/* ============================================================================================================
 * 4. THE CONTROL: SAME FIELD, OTHER EXTRACTOR
 * ========================================================================================================= */
{
    const f = asField(FIELDS.csg);
    const mt = manifoldCensus(marchingTets(f.f, f.g, { N: 20, lo: -1, hi: 1 }).tris);
    say(`marching tets on the SAME csg field: ${mt.faces} faces, nm-edges ${mt.nonManifoldEdges}, nm-verts ${mt.nonManifoldVertices}, boundary ${mt.boundaryEdges}`);
    ok("!! *** MARCHING TETS ON THE SAME FIELD READS CLEAN, SO THE FINDING IS ABOUT THE METHOD AND NOT THE SHAPE ***",
       mt.closedManifold,
       "Same solid, comparable resolution, different extractor. WITHOUT THIS LINE THE NON-MANIFOLD EDGES COULD BE A PROPERTY OF THE FIXTURE and the comparison would prove nothing. It also states the trade honestly: marching tets is manifold and ROUNDS THE CORNERS (cut/h 0.377, v3417); dual contouring CAPTURES the corners (1.1e-4, v3438) and can tear the topology. NEITHER IS STRICTLY BETTER AND THE TREE NOW HAS BOTH NUMBERS.");

    ok("REPORTED, NOT RATCHETED, AND DELIBERATELY", true,
       "No baseline is frozen here. The count depends on the fixture set, and pinning a number derived from three shapes I chose would ratchet MY CHOICE OF SHAPES rather than the method's behaviour. WHAT IS ASSERTED IS THE STRUCTURE: simple shapes clean, csg not clean, non-monotone in resolution, and marching tets clean on the same field. A post-process like ManifoldDMC's is NOT adopted on this evidence -- the defect is now MEASURED, and whether it matters depends on what csg.html actually needs to draw.");
}

console.log(fails ? "\nmanifoldCensus-selfcheck: " + fails + " FAILED" : "\nmanifoldCensus-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
