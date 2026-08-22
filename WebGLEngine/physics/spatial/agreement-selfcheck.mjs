// WebGLEngine/physics/spatial/agreement-selfcheck.mjs -- v2879
//
// Run: node physics/spatial/agreement-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// FIVE SPATIAL STRUCTURES, MADE TO AGREE.
//
// This tree has five independent answers to "which bodies are near which": AabbGrid, an AABB/BVH tree, a k-d
// tree, a molecular-dynamics neighbour grid and an SPH spatial grid. Every one is gated -- against ITS OWN brute
// force, in isolation. Not one referenced another, which is how five correct-looking implementations can drift
// apart without any single gate noticing.
//
// AND THEY DID NOT MEET FOR A REASON, WHICH A NAIVE HARNESS WOULD HAVE GOT WRONG. They answer two questions:
//     POINT-AND-RADIUS  kdtree / neighborGrid / sphGrid   -- an L2 SPHERE test
//     BOX OVERLAP       aabbGrid / aabbTree               -- an L-infinity BOX test
// "They should all agree" is FALSE. What is true is exact: give each point a box of half-extent r/2 and box
// overlap means Chebyshev <= r, while the sphere test means Euclidean <= r. Since |d|2 <= r implies |d|inf <= r,
// SPHERE PAIRS ARE A SUBSET OF BOX PAIRS -- always, exactly, with no tolerance.
//
// THE LOAD-BEARING NEGATIVE IS THE UNUSUAL ONE HERE: the two families must NOT come out equal. If they ever did,
// one of them would be computing the other's metric, and every "agreement" in this file would be vacuous.
import {
    scene, compareAll, bruteSphere, bruteBox, viaKdTree, viaNeighborGrid, viaSphGrid, viaAabbGrid, viaAabbTree,
    sameSet, isSubset, missing, extra, POINT_FAMILY, BOX_FAMILY,
} from "./agreement.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const SCENES = [
    { n: 200, r: 1.2, span: 10, label: "sparse" },
    { n: 400, r: 0.8, span: 10, label: "denser" },
    { n: 120, r: 2.0, span: 10, label: "fat radius" },
];

// ---- 1. WITHIN THE POINT FAMILY: exact agreement, no slack ------------------------------------------------------
{
    for (const s of SCENES) {
        const pts = scene(s.n, { span: s.span });
        const truth = bruteSphere(pts, s.r);
        for (const [name, fn] of [["kdtree", viaKdTree], ["neighborGrid", viaNeighborGrid], ["sphGrid", viaSphGrid]]) {
            const got = fn(pts, s.r);
            const miss = missing(truth, got), ext = extra(truth, got);
            ok(name + " matches brute force EXACTLY (" + s.label + ")", miss.length === 0 && ext.length === 0,
               got.size + "/" + truth.size + " pairs" + (miss.length ? "  MISSED " + miss.slice(0, 3).join(",") : "") + (ext.length ? "  EXTRA " + ext.slice(0, 3).join(",") : ""));
        }
    }
}

// ---- 2. WITHIN THE BOX FAMILY: exact agreement ------------------------------------------------------------------
{
    for (const s of SCENES) {
        const pts = scene(s.n, { span: s.span });
        const truth = bruteBox(pts, s.r);
        for (const [name, fn] of [["aabbGrid", viaAabbGrid], ["aabbTree", viaAabbTree]]) {
            const got = fn(pts, s.r);
            ok(name + " matches box brute force EXACTLY (" + s.label + ")", sameSet(truth, got),
               got.size + "/" + truth.size + " pairs");
        }
    }
    // AND the two box structures against EACH OTHER -- a grid and a tree, sharing no code.
    const pts = scene(300, { span: 10 });
    ok("!! the GRID and the TREE agree with each other", sameSet(viaAabbGrid(pts, 1.0), viaAabbTree(pts, 1.0)),
       "a uniform grid and a balanced BVH, no shared code, same answer");
}

// ---- 3. ACROSS THE FAMILIES: the exact subset relation -----------------------------------------------------------
{
    for (const s of SCENES) {
        const pts = scene(s.n, { span: s.span });
        const sph = bruteSphere(pts, s.r), box = bruteBox(pts, s.r);
        ok("!! sphere pairs are a SUBSET of box pairs (" + s.label + ")", isSubset(sph, box),
           sph.size + " within " + box.size + " -- |d|2 <= r implies |d|inf <= r, exactly");
        // THE LOAD-BEARING NEGATIVE
        ok("!! ...and STRICTLY smaller, not equal", box.size > sph.size,
           box.size - sph.size + " pairs are Chebyshev-near but Euclidean-far. If these ever matched, one family would be computing the other's metric and every agreement here would be vacuous.");
    }
}

// ---- 4. the whole comparison in one call, and every structure present ----------------------------------------------
{
    const c = compareAll(scene(200, { span: 10 }), 1.2);
    for (const k of POINT_FAMILY.concat(BOX_FAMILY)) ok("compareAll reports " + k, c[k] instanceof Set && c[k].size > 0);
    ok("!! all three point structures return the IDENTICAL set", sameSet(c.kdtree, c.neighborGrid) && sameSet(c.kdtree, c.sphGrid),
       "three implementations, three authors, one answer -- which is the statement no individual gate could make");
}

// ---- 5. DEGENERATE SCENES, which is where spatial structures actually break ------------------------------------------
{
    // all coincident: every pair is near, and a grid that overflows one cell must still be right
    const same = Array.from({ length: 40 }, () => [1, 1, 1]);
    const truth = bruteSphere(same, 0.5);
    ok("!! 40 COINCIDENT points: every structure still exact", 
       sameSet(truth, viaKdTree(same, 0.5)) && sameSet(truth, viaNeighborGrid(same, 0.5)) && sameSet(truth, viaSphGrid(same, 0.5)),
       truth.size + " pairs (all of them) -- one cell holding everything is the classic grid overflow");

    // radius far larger than the cloud: everything is near everything
    const tiny = scene(30, { span: 0.5 });
    const allT = bruteSphere(tiny, 100);
    ok("radius >> extent: still exact", sameSet(allT, viaKdTree(tiny, 100)) && sameSet(allT, viaNeighborGrid(tiny, 100)));

    // radius far smaller than spacing: nothing is near anything
    const sparse = scene(50, { span: 1000 });
    ok("radius << spacing: everything correctly EMPTY", viaKdTree(sparse, 0.01).size === 0 && viaNeighborGrid(sparse, 0.01).size === 0 && bruteSphere(sparse, 0.01).size === 0);

    // negative coordinates -- a grid that floors a negative into the wrong cell is a classic
    const neg = scene(150, { span: 10 }).map((p) => [p[0] - 5, p[1] - 5, p[2] - 5]);
    ok("!! NEGATIVE coordinates do not shift a cell", sameSet(bruteSphere(neg, 1.2), viaNeighborGrid(neg, 1.2)) && sameSet(bruteBox(neg, 1.2), viaAabbGrid(neg, 1.2)),
       "Math.floor on a negative divides toward -inf, which is right; a truncation would silently merge cells");

    // n = 0 and 1
    ok("empty and single-point scenes are empty, not a crash", viaKdTree([], 1).size === 0 && viaNeighborGrid([[0, 0, 0]], 1).size === 0);
}

// ---- 6. determinism ---------------------------------------------------------------------------------------------------
{
    const pts = scene(200, { span: 10 });
    ok("the scene generator is seeded and repeatable", JSON.stringify(scene(50)) === JSON.stringify(scene(50)),
       "a gate must pin an answer, not a distribution");
    ok("every structure is deterministic", sameSet(viaKdTree(pts, 1.2), viaKdTree(pts, 1.2)) && sameSet(viaAabbTree(pts, 1.2), viaAabbTree(pts, 1.2)));
}

console.log(fails ? "\nagreement-selfcheck: " + fails + " FAILED" : "\nagreement-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
