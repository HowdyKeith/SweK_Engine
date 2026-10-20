// WebGLEngine/physics/mesh/manifoldAudit-selfcheck.mjs -- BVH-CSG round 20
//
// The gate for physics/mesh/manifoldAudit.mjs: each property seen on a mesh built to break exactly it, and not seen on
// meshes that keep it; a crossing's depth exact to the bit on hand-built pokes.
//
// SABOTAGE LOG (round 20) -- manifoldAudit.mjs and, once, the engine; each on the real file, restored and md5 verified.
// 8 of 8 red. Rows red in THIS gate / blastEngine-selfcheck:
//   X1 pinched vertices never counted                                      2 / 1   (the corner touch, the bow tie; the
//        BSP control)
//   X2 a crossing through a shared corner excused                          1 / 0   (the sliver pair; the walls' rows bound
//        crossings from above, and fewer passes them)
//   X3 depth the larger reach (the round's own first draft)                2 / 0   (the pokes: 0.004 for 1e-12)
//   X4 depth from a float determinant                                      1 / -   (0 red on the first battery: every
//        hand fixture's determinant is exact in floats. The seed-4 pair was added -- 7.09e-17 exactly, 0 in floats)
//   X5 open read as "has a reverse", not "as many"                         1 / -   (the doubled face)
//   X6 a coplanar hinge wound oppositely passed                            1 / -   (two boxes sharing an edge)
//   X7 degenerate only by repeated corners                                 1 / -   (three corners on one line)
//   X8 the engine: EXACT_FINISH_WELD 0                                     - / 6   (section 16: seed 1 degenerate and
//        crossing, the twelve-blast case 72 crossings, seed 12 9 crossings; sections 9, 12, 14)
// The first battery was cut off by a container restart during X8, which left EXACT_FINISH_WELD = 0 in blastEngine.mjs;
// found by the md5 check, restored by hand, md5 verified, and X8 re-run alone.
"use strict";
import * as M from "./meshCSG.mjs";
import { manifoldAudit, crossingDepth } from "./manifoldAudit.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("manifoldAudit-selfcheck -- is a triangle mesh two-manifold, at exact bits\n");

const B = (c, h) => M.toTriangleBuffer(M.boxPolys(c, h));
const cat = (...bs) => { const o = new Float64Array(bs.reduce((n, b) => n + b.length, 0)); let w = 0; for (const b of bs) { o.set(b, w); w += b.length; } return o; };
const box = B([0, 0, 0], [1, 1, 1]);
const KEYS = ["degenerate", "open", "nonManifoldEdges", "pinchedVertices", "crossings", "touches", "coplanarOverlaps"];
const only = (r, want) => KEYS.every((k) => (want[k] === undefined ? r[k] === 0 : want[k] === true ? r[k] > 0 : r[k] === want[k]));
const show = (r) => KEYS.filter((k) => r[k]).map((k) => k + " " + r[k]).join(", ") || "clean";

console.log("1. *** EACH PROPERTY, ON A MESH BUILT TO BREAK EXACTLY IT ***");
{
    const rows = [
        ["a box", box, {}],
        ["two boxes touching at a corner: one pinched vertex", cat(box, B([2, 2, 2], [1, 1, 1])), { pinchedVertices: 1 }],
        ["two boxes sharing an edge: one non-manifold edge (and its coplanar faces turned opposite ways)", cat(box, B([2, 2, 0], [1, 1, 1])), { nonManifoldEdges: 1, coplanarOverlaps: true }],
        ["two boxes overlapping: crossings and touches, every edge still closed", cat(box, B([1, 1, 1], [1, 1, 1])), { crossings: true, touches: true }],
        ["a box inside a box, apart: clean (two shells are not a defect of the surface)", cat(box, B([0, 0, 0], [0.5, 0.5, 0.5])), {}],
        ["a face doubled: 6 open directed edges, 3 non-manifold", cat(box, box.slice(0, 9)), { open: 6, nonManifoldEdges: 3 }],
        ["a zero-area triangle (three corners on one line) added: degenerate 1", cat(box, new Float64Array([0, 0, 1, 0.5, 0.5, 1, 1, 1, 1])), { degenerate: 1, open: 3, nonManifoldEdges: 3 }],
    ];
    for (const [name, buf, want] of rows) { const r = manifoldAudit(buf); ok("!! " + name, only(r, want), show(r)); }
    // two tetrahedra of ONE mesh sharing a vertex: the link of that vertex is two triangles, not one cycle
    const tet = (o, s) => { const p = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => v.map((x, i) => o[i] + s * x)); const f = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]; return new Float64Array(f.flatMap((t) => t.flatMap((i) => p[i]))); };
    const r = manifoldAudit(cat(tet([0, 0, 0], 1), tet([0, 0, 0], -1)));
    ok("!! two tetrahedra meeting at their apex (a bow tie): one pinched vertex, nothing else", only(r, { pinchedVertices: 1 }), show(r));
    // two coplanar triangles on one side of the edge they share: a fold, not a hinge
    const fold = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, /**/ 1, 0, 0, 0, 0, 0, 0.5, 0.5, 0]);
    ok("!! two coplanar triangles folded onto the same side of their shared edge: a coplanar overlap", manifoldAudit(fold).coplanarOverlaps === 1, show(manifoldAudit(fold)));
}

console.log("\n2. *** A CROSSING'S DEPTH, EXACT -- LONG AND SHALLOW IS NOT DEEP ***");
{
    const T = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    const d12 = crossingDepth(T, [[0.2, 0.2, -1e-12], [0.3, 0.2, 1e-3], [0.2, 0.3, 1e-3]]), d17 = crossingDepth(T, [[0.2, 0.2, -3e-17], [0.3, 0.2, 1e-3], [0.2, 0.3, 1e-3]]);
    ok("!! a triangle poking 1e-12 and 3e-17 through a unit one: depths 1e-12 and 3e-17 (the poke, not the other's span across it)", d12 === 1e-12 && d17 === 3e-17, d12 + ", " + d17);
    // two slivers at a tiny angle, sharing a corner, one nudged 1e-16 across: a crossing far longer than it is deep
    // S1 in z = 0, 4e-10 wide at x = 1; S2 from the same corner, its far side running from z = -1e-16 to z = +1e-16 across it
    const S1 = [[0, 0, 0], [1, 0, 0], [1, 4e-10, 0]], S2 = [[0, 0, 0], [1, 1e-10, -1e-16], [1, 3e-10, 1e-16]];
    const buf = new Float64Array([...S1.flat(), ...S2.flat()]), det = [];
    const r = manifoldAudit(buf, { detail: det });
    ok("!! two slivers sharing a corner, one nudged 1e-16 across the other's plane: one crossing, its depth a rounding (<= 1e-16), its length many orders more",
        r.crossings === 1 && det.length === 1 && det[0].depth > 0 && det[0].depth <= 1.0000001e-16 && det[0].length > 0.5, show(r) + ", depth " + (det[0] ? det[0].depth.toExponential(2) + ", length " + det[0].length.toExponential(2) : "-"));
    // a pair taken from the page soak (seed 4's wall at shot 50): exactly 7.09e-17 deep; a float determinant over the
    // float normal reads 0 -- its sign lost on a sliver 1.1e-10 high (round 20 measured it on 3 of that wall's 4 crossings)
    const P1 = [[1.6281833861927455, 0.7795742682756506, 2.9936643153639694e-10], [1.585655507994871, 0.7500542103905834, 1.207792660639614e-10], [1.5856555080119923, 0.7500542104294163, 1.0958090446080317e-10]];
    const P2 = [[1.5880983622076061, 0.7487570455391478, 0.010565538165848598], [1.5856555081795318, 0.7500542108094141, 2.3553576259737362e-17], [1.585655507994871, 0.7500542103905834, 1.207792660639614e-10]];
    const dp = [], rp = manifoldAudit(new Float64Array([...P1.flat(), ...P2.flat()]), { detail: dp });
    ok("!! a crossing from the page soak (seed 4, shot 50; slivers 1.1e-10 high): depth 7.09e-17 exactly -- a float determinant reads it 0",
        rp.crossings === 1 && dp.length === 1 && Math.abs(dp[0].depth - 7.089109707406309e-17) < 1e-25, "crossings " + rp.crossings + ", depth " + (dp[0] ? dp[0].depth : "-"));
}

console.log("\n3. *** MESHES THAT KEEP EVERY PROPERTY ***");
{
    const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const r = rng(7); let bad = 0, n = 0;
    for (let k = 0; k < 60; k++) { const blob = M.jaggedBlob([0, 0, 0], 0.2 + r() * 1.2, 4 + Math.floor(r() * 11), k + 1, { rough: r() * 0.9, floor: 1 - r() * 0.9 }); n++; if (KEYS.some((x) => manifoldAudit(M.toTriangleBuffer(blob))[x])) bad++; }
    ok("!! 60 of the page's jagged blobs (its radius, roughness and facet ranges): every one clean", bad === 0, bad + " of " + n + " with a defect");
    const rot = M.toTriangleBuffer(M.boxPolys([0.3, -0.2, 0.1], [0.7, 0.4, 1.1]).map((p) => { const vs = p.vs.map((v) => [v[0] * Math.cos(0.7) - v[1] * Math.sin(0.7), v[0] * Math.sin(0.7) + v[1] * Math.cos(0.7), v[2]]); return { vs, pl: M.planeOf(vs) }; }));
    ok("!! a box rotated 0.7 about z (no coordinate exact): clean", KEYS.every((x) => manifoldAudit(rot)[x] === 0), show(manifoldAudit(rot)));
}

console.log(`\nmanifoldAudit-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: two shells (a box inside a box) are reported clean -- each is a manifold surface; " +
    "whether a mesh is ONE solid is a separate question. The pairwise part is O(pairs the BVH reports touching), ~1.5 s on a " +
    "6,000-triangle wall. The depth divides an exact determinant by a float normal's length: exact in sign, rounded in size.");
process.exit(fails ? 1 : 0);
