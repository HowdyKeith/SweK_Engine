// tools/roundhouse/manifoldCensusBind.mjs
//
// A MESH CAN HAVE EVERY EDGE SHARED BY EXACTLY TWO FACES, NO BOUNDARY AT ALL, AND STILL NOT BE A SURFACE.
//
// physics/mesh/marchingCubes.js checks "every edge shared by exactly two triangles" and calls that watertight.
// It is the right test AND IT CANNOT FAIL THERE -- marching tetrahedra is manifold BY CONSTRUCTION. The module
// that CAN violate it is dualContour.mjs: one vertex per cell, so a cell whose sign pattern carries two
// separate sheets pins both to the same vertex. *** THE OLD EXTRACTOR CHECKED THE PROPERTY IT COULD NOT VIOLATE
// AND THE NEW ONE DID NOT CHECK THE ONE IT COULD. ***
//
// ================================================================================================================
// THE FIXTURE THIS DEVICE IS BUILT ON, AND WHY THE OBVIOUS ONE IS NOT ENOUGH
// ================================================================================================================
//
// The textbook bowtie is two quads sharing one vertex -- and it is a WEAK fixture, because it also has eight
// boundary edges, so a plain closed-surface check rejects it without ever consulting the vertex link. *** THE
// CASE THAT MATTERS IS A BOWTIE WITH NO BOUNDARY: two tetrahedra glued at a single vertex. *** MEASURED:
//
//     one tetrahedron          F 4   E 6    boundary 0   nmEdges 0   nmVertices 0   chi 2    <- a real manifold
//     two, sharing one vertex  F 8   E 12   boundary 0   nmEdges 0   nmVertices 1   chi 3    <- NOT a surface
//
// Nothing is open and every edge carries exactly two faces. AN EDGE-ONLY CENSUS -- LITERALLY WHAT
// marchingCubes.js CALLS WATERTIGHT -- REPORTS THIS MESH PERFECT. Only the link test can tell: walk the faces
// around the shared vertex, take each face's two neighbours of it as a segment, and ask whether those segments
// form ONE chain. Two components means the surface pinches there, and no neighbourhood of that point is a disc.
//
// ================================================================================================================
// AND A SECOND ROUTE THE MODULE DOES NOT CARRY: THE EULER CHARACTERISTIC
// ================================================================================================================
//
// manifoldCensus returns faces and edges and never forms V, so chi = V - E + F is not something it can ask. It
// is a DIFFERENT QUESTION about the same counts: incidence asks "is every edge shared by two faces", chi asks
// "what is the genus". And it is stated as a LAW rather than as a fixture constant:
//
//     *** chi = 2 * C EXACTLY, for C closed genus-0 components. ***
//
// C is counted independently, by union-find over shared vertices, so the law is a comparison of two counts
// rather than a number typed next to one mesh. MEASURED: the marching-tets sphere 1 component chi 2; the dual
// contoured sphere 1 and 2; and the CSG shape 4 components and chi 8 -- because a box of half-extent 0.9 in z
// punches clean through a sphere of radius 0.55 and leaves four corner pieces. THE FOUR IS COUNTED, NOT
// INFERRED FROM THE EIGHT, which is what stops the law being fitted to its own answer.
//
// Gluing two tetrahedra at a point gives 1 component and chi 3 against a required 2 -- so chi catches the
// interior bowtie WITHOUT LOOKING AT A SINGLE LINK.
//
// *** AND THERE IS A VACUOUS TRUTH THAT NEITHER ROUTE CATCHES, WHICH IS THE MORE USEFUL HALF OF THE FINDING. ***
// closedManifold is a conjunction of three zeros -- no boundary, no non-manifold edge, no pinch -- and THE
// EMPTY MESH SATISFIES ALL THREE: manifoldCensus([]) returns closedManifold: true. The first draft of this file
// claimed chi = 0 was the number that said so. IT IS NOT: with no faces there are no components either, so
// chi = 2*C reads 0 = 0 and the Euler law is satisfied vacuously too. ADDING A SECOND LAW OF THE SAME SHAPE
// DOES NOT FIX A VACUOUS TRUTH -- only asserting the input is non-empty does, which is why `components` is
// carried as an observable and every closed-manifold claim below is paired with a face count. Reported rather
// than fixed here, because the fix belongs to the module.
//
// ================================================================================================================
// *** THE PLANT IS THE DEFECT THE MODULE WAS WRITTEN TO REMOVE, PUT BACK: EDGE INCIDENCE ONLY ***
// ================================================================================================================
//
// Planted, nonManifoldVertices is not computed -- the census becomes the marchingCubes definition of watertight.
// The vertex-glued pair then reads closedManifold TRUE: a mesh that is not a surface, certified as one.
//
// AND CHI IS BLIND TO THE PLANT, WHICH IS THE POINT OF CARRYING IT. The plant removes a TEST; it does not
// change V, E or F. So under the plant the link test goes silent and chi still reads 3 against a required 2 --
// two routes disagreeing, which is what localises the fault. A device carrying only the module's own census
// would go entirely quiet. plantKind METHOD: a test is dropped, and no config value records it.

import { manifoldCensus } from "../../physics/mesh/manifoldCensus.mjs";
import { dualContour } from "../../physics/mesh/dualContour.mjs";
import { sphere, box, subtract } from "../../physics/mesh/csg.mjs";
import { marchingTets, sphereField } from "../../physics/mesh/marchingCubes.js";

export const MANIFOLD_OBSERVABLES = [
    "tetraNmVertices", "tetraClosed", "tetraEuler", "tetraEulerDefect",
    "bowtieBoundary", "bowtieNmEdges", "bowtieNmVertices", "bowtieClosed",
    "bowtieComponents", "bowtieEuler", "bowtieEulerDefect",
    "openQuadBoundary", "openQuadNmVertices",
    "finNmEdges",
    "mtFaces", "mtNmEdges", "mtNmVertices", "mtClosed", "mtComponents", "mtEuler", "mtEulerDefect",
    "dcFaces", "dcNmEdges", "dcNmVertices", "dcClosed", "dcComponents", "dcEuler", "dcEulerDefect",
    "csgFaces", "csgNmVertices", "csgComponents", "csgEuler", "csgEulerDefect",
    "emptyClosed", "emptyComponents", "emptyEuler",
];

const DEF = { n: 16, radius: 0.62, mtN: 16, lo: -1, hi: 1 };

// A closed tetrahedron, and two of them glued at vertex 0. Written out rather than generated: the whole point
// is that the second is the FIRST with one vertex identified, and a generator would hide that.
const TET_A = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
const TET_B = [[0, 4, 5], [0, 4, 6], [0, 5, 6], [4, 5, 6]];

/**
 * chi = V - E + F, counted from the faces alone. manifoldCensus never forms V, so this is a question it cannot
 * ask -- and it needs no tolerance, because chi is an integer.
 */
export function eulerCharacteristic(faces) {
    const V = new Set(), E = new Set();
    for (const p of faces) {
        for (let i = 0; i < p.length; i++) {
            V.add(p[i]);
            const a = p[i], b = p[(i + 1) % p.length];
            E.add(a < b ? a + "," + b : b + "," + a);
        }
    }
    return V.size - E.size + faces.length;
}

/**
 * Connected components, by union-find over SHARED VERTICES. Counted independently of chi so that chi = 2*C is a
 * comparison of two counts rather than a constant fitted to one mesh -- and so that C = 0 names an empty mesh,
 * which is the only thing that catches the vacuous truth in closedManifold.
 */
export function componentCount(faces) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const f of faces) for (const v of f) if (!parent.has(v)) parent.set(v, v);
    for (const f of faces) for (let i = 1; i < f.length; i++) {
        const a = find(f[0]), b = find(f[i]); if (a !== b) parent.set(a, b);
    }
    return new Set([...parent.keys()].map(find)).size;
}

/** The law: chi - 2C. Zero for any collection of closed genus-0 surfaces, and an INTEGER either way. */
export const eulerDefect = (faces) => eulerCharacteristic(faces) - 2 * componentCount(faces);

/**
 * THE PLANT: the census with the link test dropped -- marchingCubes' definition of watertight, which is the
 * shape this module exists to replace. Everything else is the module's own answer, unmodified.
 */
// *** v4032 -- THE LOCAL IS `cen`, NOT `c`, AND THAT IS NOT A STYLE CHOICE. *** `c` means the merged config
// everywhere else in this file, so a census result bound to `c` made `c.boundaryEdges` and
// `c.nonManifoldEdges` read as CONFIG KEYS THIS BIND USES AND NEVER DECLARES -- the one offender in the
// lab-wide mirror audit, and a false one. strictConfig's own v3930 note records the identical defect in xpbd
// ("a local named `c` shadowing the config object -- a genuine naming defect, since `c.` means config
// everywhere else in that file") and this file reintroduced it at v4026, three rounds after the lesson was
// written down. A scan that cannot tell a config from a result is worth exactly as much as the naming
// discipline underneath it.
function census(faces, planted) {
    const cen = manifoldCensus(faces);
    if (!planted) return cen;
    return { ...cen, nonManifoldVertices: 0,
             closedManifold: cen.boundaryEdges === 0 && cen.nonManifoldEdges === 0 };
}

function buildManifold({ mode = "census", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const cen = (f) => census(f, planted);

    const tet = cen(TET_A);
    const bowtie = cen(TET_A.concat(TET_B));
    const openQuad = cen([[0, 1, 2, 3]]);
    const fin = cen([[0, 1, 2], [0, 1, 3], [0, 1, 4]]);
    const empty = cen([]);

    // THE EXTRACTOR THAT CANNOT VIOLATE IT, as a control beside the one that can.
    const sf = sphereField(1);
    const mt = marchingTets(sf.f, sf.g, { N: Math.max(6, c.mtN | 0), lo: -1.5, hi: 1.5 });
    const mtC = cen(mt.tris);

    // THE EXTRACTOR THAT CAN. One vertex per cell is where a pinch would come from.
    const dcQ = dualContour(sphere([0, 0, 0], c.radius), { lo: c.lo, hi: c.hi, n: Math.max(4, c.n | 0) }).quads;
    const dcC = cen(dcQ);

    // A SHAPE WITH A SHARP RE-ENTRANT FEATURE, which is where dual contouring is most likely to pinch.
    const csgQ = dualContour(subtract(sphere([0, 0, 0], 0.55), box([0, 0, 0], [0.4, 0.4, 0.9])),
                             { lo: c.lo, hi: c.hi, n: Math.max(4, c.n | 0) }).quads;
    const csgC = cen(csgQ);

    const BOW = TET_A.concat(TET_B);
    return {
        tetraNmVertices: tet.nonManifoldVertices, tetraClosed: tet.closedManifold ? 1 : 0,
        tetraEuler: eulerCharacteristic(TET_A), tetraEulerDefect: eulerDefect(TET_A),
        bowtieBoundary: bowtie.boundaryEdges, bowtieNmEdges: bowtie.nonManifoldEdges,
        bowtieNmVertices: bowtie.nonManifoldVertices, bowtieClosed: bowtie.closedManifold ? 1 : 0,
        bowtieComponents: componentCount(BOW), bowtieEuler: eulerCharacteristic(BOW),
        bowtieEulerDefect: eulerDefect(BOW),
        // AN OPEN SURFACE IS NOT A BROKEN ONE. Folding boundary and non-manifold into one "not exactly two"
        // count would call this defective, and it is simply open -- opposite news under one label.
        openQuadBoundary: openQuad.boundaryEdges, openQuadNmVertices: openQuad.nonManifoldVertices,
        finNmEdges: fin.nonManifoldEdges,
        mtFaces: mtC.faces, mtNmEdges: mtC.nonManifoldEdges, mtNmVertices: mtC.nonManifoldVertices,
        mtClosed: mtC.closedManifold ? 1 : 0, mtComponents: componentCount(mt.tris),
        mtEuler: eulerCharacteristic(mt.tris), mtEulerDefect: eulerDefect(mt.tris),
        dcFaces: dcC.faces, dcNmEdges: dcC.nonManifoldEdges, dcNmVertices: dcC.nonManifoldVertices,
        dcClosed: dcC.closedManifold ? 1 : 0, dcComponents: componentCount(dcQ),
        dcEuler: eulerCharacteristic(dcQ), dcEulerDefect: eulerDefect(dcQ),
        csgFaces: csgC.faces, csgNmVertices: csgC.nonManifoldVertices,
        csgComponents: componentCount(csgQ), csgEuler: eulerCharacteristic(csgQ),
        csgEulerDefect: eulerDefect(csgQ),
        // REPORTED, NOT FIXED, AND NEITHER ROUTE CATCHES IT: closedManifold is a conjunction of three zeros and
        // the empty mesh satisfies all three, while chi = 2*C reads 0 = 0. Only the component count names it.
        emptyClosed: empty.closedManifold ? 1 : 0, emptyComponents: componentCount([]),
        emptyEuler: eulerCharacteristic([]),
    };
}

export const manifoldCensusDevice = {
    plantKind: "method",
    modes: ["census"],
    name: "watertight-is-not-manifold",
    observables: MANIFOLD_OBSERVABLES,
    build: buildManifold,
    defaults: ({ mode } = {}) => ({ mode: mode || "census", config: { ...DEF } }),
};

/** v3327's split: this half PRINTS and manifoldCensusBind-selfcheck beside it is what exits nonzero. */
export function reportLines() {
    const h = buildManifold({ mode: "census", config: {} });
    const p = buildManifold({ mode: "census", config: { planted: true } });
    const L = [];
    L.push("[mesh/manifoldCensus] watertight is not manifold");
    L.push("");
    L.push("  *** THE FIXTURE: TWO TETRAHEDRA GLUED AT ONE VERTEX ***");
    L.push("    boundary edges        " + h.bowtieBoundary);
    L.push("    non-manifold EDGES    " + h.bowtieNmEdges + "   <- an edge-only census reports this mesh PERFECT,");
    L.push("                              and that is literally what marchingCubes.js calls watertight");
    L.push("    non-manifold VERTICES " + h.bowtieNmVertices + "   <- only the link test tells");
    L.push("    closedManifold        " + h.bowtieClosed);
    L.push("    one tetrahedron alone reads closed " + h.tetraClosed + ", chi " + h.tetraEuler + " -- the same shape, unglued.");
    L.push("");
    L.push("  OPPOSITE NEWS, KEPT SEPARATE");
    L.push("    open quad             " + h.openQuadBoundary + " boundary edges, " + h.openQuadNmVertices + " pinches -- OPEN IS NOT BROKEN");
    L.push("    three faces on an edge  " + h.finNmEdges + " non-manifold edge");
    L.push("");
    L.push("  chi = 2C, AS A LAW RATHER THAN A FIXTURE CONSTANT (C counted by union-find, not inferred)");
    L.push("    marching tets sphere  " + String(h.mtFaces).padStart(5) + " faces  " + h.mtComponents + " comp  chi " + h.mtEuler + "  defect " + h.mtEulerDefect);
    L.push("    dual contour sphere   " + String(h.dcFaces).padStart(5) + " faces  " + h.dcComponents + " comp  chi " + h.dcEuler + "  defect " + h.dcEulerDefect);
    L.push("    csg, box through ball " + String(h.csgFaces).padStart(5) + " faces  " + h.csgComponents + " comp  chi " + h.csgEuler + "  defect " + h.csgEulerDefect);
    L.push("    vertex-glued pair     " + "    -  " + "      " + h.bowtieComponents + " comp  chi " + h.bowtieEuler + "  DEFECT " + h.bowtieEulerDefect);
    L.push("    Gluing two spheres at a point gives 4 - 1 = 3, so chi catches the interior bowtie WITHOUT");
    L.push("    LOOKING AT A SINGLE LINK. The four components of the csg shape are COUNTED, not inferred");
    L.push("    from the eight -- which is what stops the law being fitted to its own answer.");
    L.push("");
    L.push("  A VACUOUS TRUTH NEITHER ROUTE CATCHES");
    L.push("    manifoldCensus([]) -> closedManifold " + h.emptyClosed + ", components " + h.emptyComponents + ", chi " + h.emptyEuler);
    L.push("    closedManifold is a conjunction of three zeros and NOTHING is all three. chi = 2C reads");
    L.push("    0 = 0 and is satisfied vacuously too: ADDING A SECOND LAW OF THE SAME SHAPE DOES NOT FIX A");
    L.push("    VACUOUS TRUTH. Only asserting the input is non-empty does.");
    L.push("");
    L.push("  UNDER THE PLANT -- edge incidence only, the older definition of watertight");
    L.push("    bowtie closedManifold  " + h.bowtieClosed + " -> " + p.bowtieClosed + "   a mesh that is not a surface, certified");
    L.push("    bowtie pinches         " + h.bowtieNmVertices + " -> " + p.bowtieNmVertices);
    L.push("    bowtie chi defect      " + h.bowtieEulerDefect + " -> " + p.bowtieEulerDefect + "   BLIND -- the plant removes a TEST, not V, E or F,");
    L.push("                               so chi still reads " + p.bowtieEuler + " against a required 2. Two routes disagreeing");
    L.push("                               is what localises the fault.");
    return L;
}
