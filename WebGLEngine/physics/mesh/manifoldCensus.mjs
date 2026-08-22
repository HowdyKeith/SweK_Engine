// WebGLEngine/physics/mesh/manifoldCensus.mjs -- v3453
//
// *** WHAT "MANIFOLD" ACTUALLY ASKS, AND WHY THE TREE COULD NOT ANSWER IT. ***
//
// physics/mesh/marchingCubes.js checks "every edge shared by exactly two triangles" and calls that watertight.
// It is the right test AND IT CANNOT FAIL THERE: marching tetrahedra is manifold BY CONSTRUCTION (six tets on a
// shared diagonal, consistent across neighbours). physics/mesh/dualContour.mjs is the module that CAN violate
// it -- ONE VERTEX PER CELL, so a cell whose sign pattern carries two separate surface sheets pins both to the
// same vertex -- and it had no such check, and nothing under physics/mesh built an edge-to-face incidence map
// at all. THE OLD EXTRACTOR CHECKED THE PROPERTY IT COULD NOT VIOLATE AND THE NEW ONE DID NOT CHECK THE ONE IT
// COULD.
//
// ================================================================================================
// THREE OUTCOMES PER EDGE, AND COLLAPSING THEM WOULD LOSE THE ANSWER
// ================================================================================================
//
//   1 face   BOUNDARY      -- an open surface. A legitimate state for a clipped or open mesh, NOT a defect.
//   2 faces  INTERIOR      -- manifold.
//   3+ faces NON-MANIFOLD  -- a defect: more than two sheets meet along one edge.
//
// A boundary edge and a non-manifold edge are OPPOSITE NEWS and a single "not exactly two" count cannot tell
// them apart. They are counted separately and never added up.
//
// ================================================================================================
// AND THE VERTEX TEST IS THE ONE THAT MATTERS HERE, BECAUSE IT IS THE ONE DUAL CONTOURING FAILS
// ================================================================================================
//
// *** A MESH CAN HAVE EVERY EDGE SHARED BY EXACTLY TWO FACES AND STILL NOT BE A MANIFOLD. *** Two cones meeting
// at a single apex -- a "bowtie" -- has perfect edge incidence and is not a surface: no neighbourhood of that
// point looks like a disc. THAT IS EXACTLY THE SHAPE DUAL CONTOURING PRODUCES when one cell carries two sheets,
// so an edge-only census would have reported this mesh clean and been wrong.
//
// The test is the LINK: walk the faces around a vertex, take each face's two neighbours of that vertex as a
// segment, and ask whether those segments form ONE connected chain. More than one component means the surface
// pinches there.
"use strict";

const ekey = (a, b) => (a < b ? a + "," + b : b + "," + a);

/** Faces as arrays of vertex indices (triangles or quads, mixed is fine). */
export function manifoldCensus(faces) {
    const edgeFaces = new Map();
    for (let f = 0; f < faces.length; f++) {
        const p = faces[f];
        for (let i = 0; i < p.length; i++) {
            const k = ekey(p[i], p[(i + 1) % p.length]);
            if (!edgeFaces.has(k)) edgeFaces.set(k, []);
            edgeFaces.get(k).push(f);
        }
    }
    const boundaryEdges = [], nonManifoldEdges = [];
    for (const [k, fs] of edgeFaces) {
        if (fs.length === 1) boundaryEdges.push(k);
        else if (fs.length > 2) nonManifoldEdges.push({ edge: k, faces: fs.length });
    }

    // THE LINK TEST. For each vertex, each incident face contributes the segment joining that vertex's two
    // neighbours IN THAT FACE. Union those segments; one component means the faces form a single fan.
    const around = new Map();               // vertex -> [[prev, next], ...]
    for (const p of faces) {
        for (let i = 0; i < p.length; i++) {
            const v = p[i], a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length];
            if (!around.has(v)) around.set(v, []);
            around.get(v).push([a, b]);
        }
    }
    const nonManifoldVertices = [];
    for (const [v, segs] of around) {
        const parent = new Map();
        const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
        for (const [a, b] of segs) for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
        for (const [a, b] of segs) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }
        const roots = new Set([...parent.keys()].map(find));
        if (roots.size > 1) nonManifoldVertices.push({ vertex: v, components: roots.size, faces: segs.length });
    }

    return {
        faces: faces.length,
        edges: edgeFaces.size,
        boundaryEdges: boundaryEdges.length,
        nonManifoldEdges: nonManifoldEdges.length,
        nonManifoldVertices: nonManifoldVertices.length,
        // CLOSED means no boundary AND no non-manifold edge AND no pinch. Each is reported separately above so
        // a caller can tell an OPEN surface (fine) from a BROKEN one (not).
        closedManifold: boundaryEdges.length === 0 && nonManifoldEdges.length === 0 && nonManifoldVertices.length === 0,
        detail: { boundaryEdges, nonManifoldEdges, nonManifoldVertices },
    };
}
