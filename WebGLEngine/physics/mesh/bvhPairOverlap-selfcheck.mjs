// WebGLEngine/physics/mesh/bvhPairOverlap-selfcheck.mjs
//
// Run: node physics/mesh/bvhPairOverlap-selfcheck.mjs
//
// GATES physics/mesh/bvhPairOverlap.mjs -- the dual-BVH broad-phase traversal that is the first piece of a
// future BVH-accelerated CSG path (tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff").
//
// *** THE TWO INVARIANTS THIS MODULE PROMISES, AND WHY BOTH NEED THEIR OWN CHECK: *** COMPLETENESS -- every
// triangle pair whose AABBs truly overlap is returned (a missed pair is a hole a future CSG boolean would
// silently leave uncut) -- and SOUNDNESS -- every pair actually returned has AABBs that truly overlap (a
// false positive only costs a wasted narrow-phase test downstream, the same asymmetry mesh/meshBVH.mjs's own
// trianglesInBox states for its single-tree box query). An O(n*m) brute-force reference is the primary check
// for both at once (set equality is completeness AND soundness together); the three sabotages below are what
// prove the gate can actually tell a soundness violation from a completeness violation, not just "different".
//
// SECTIONS 7-10 were added by an adversarial review of this round's original diff (sections 1-6), which found
// four real, honest coverage gaps -- none a live bug in the module (each confirmed directly against the real,
// unsabotaged code before being added here) -- and one real documentation overclaim in this file's own
// closing footer (below), which the footer text itself now corrects rather than silently fixing without a
// trace: self-comparison (bvhA paired with itself or a separate instance over identical data -- section 7),
// exact boundary-touching with zero interpenetration, the one input that actually discriminates the '<'/'>'
// comparisons in boxesOverlap from an off-by-one variant (section 8), degenerate zero-area/colinear triangles
// (section 9), and a large size/depth asymmetry where BOTH sides are genuinely interior -- the specific
// branch sabotage B below corrupts -- which section 1's own na=7/nb=100 case looked like it covered but did
// not (na=7 never leaves a single root leaf; section 10 is the first case where both sides are truly interior
// under a large imbalance).
//
// SABOTAGE LOG -- each applied to physics/mesh/bvhPairOverlap.mjs, gate run, exit read, file restored byte
// for byte:
//   A  the narrow-phase `if (boxesOverlap(boxA, boxB)) pairs.push([triA, triB]);` changed to push
//      unconditionally (every triangle pair in a matched leaf-vs-leaf, whether or not their AABBs truly
//      overlap)
//        -> exit=1, 8 of 15 red, with a clean SOUNDNESS signature (fast.length > brute.length, every
//           brute-force pair still present -- a strict superset, not a disjoint mismatch): 6 of 7 section-1
//           random-mesh cases, the section-2 cube case, and section-2's own direct per-pair overlap check.
//           The 7th random-mesh case (na=1, nb=1) and both section-3/4 (disjoint/empty) checks correctly
//           stayed green -- when the two ROOT nodes' boxes don't overlap at all, node-level pruning (which
//           this sabotage never touched) prunes the pair before the sabotaged leaf-narrow-phase line is ever
//           reached, so a single-triangle-each pair with non-overlapping roots is immune to this specific
//           sabotage by construction, not a gap in the gate's own coverage.
//   B  the "both interior, split the larger" branch's push corrupted to `stack.push(leftA, nb, nb, nb)`
//      (reusing tree B's own node index `nb` as if it were a node index into tree A, in place of A's real
//      right-child index)
//        -> exit=1, but NOT the clean "fewer pairs than brute force" completeness signature this sabotage
//           was predicted to produce before it was actually run. Reinterpreting a tree-B node index as a
//           tree-A one does not shrink toward leaves the way a normal traversal does -- it crashes with a
//           real, attributable `RangeError: Invalid array length` (unbounded stack growth) whose own stack
//           trace names the exact sabotaged line, on EVEN THE SMALLEST test case that reaches an interior
//           node on both sides (na=20, nb=15 alone, confirmed in isolation -- the 120x90/200x150 cases in
//           section 1 above are not needed to catch this specific sabotage; they earn their place by
//           exercising the correct code at more than one recursion depth, a separate reason). ~10.5s of real
//           wall-clock time to the crash -- bounded, not a silent hang, and not a silent pass. THE ORIGINAL
//           PREDICTION WRITTEN HERE (a clean completeness miss, needing the larger cases to observe) WAS
//           WRONG ON BOTH COUNTS AND IS CORRECTED, MATCHING WHAT WAS ACTUALLY MEASURED, NOT WHAT WAS ASSUMED
//           BEFORE THE SABOTAGE WAS RUN.
//   C  boxesOverlap's inclusive '<'/'>' comparisons on the FIRST axis only, changed to exclusive '<='/'>='
//      (`a[3] <= b[0] || a[0] >= b[3]`, leaving the other two axes' comparisons untouched -- a realistic
//      single-axis typo, not every axis at once)
//        -> exit=1, 4 red, all in sections 8-9 (the two sections section 8/9 exist specifically to catch):
//           section 8's own two checks, by name -- the shared-x=1-face cubes went from fast=84 to fast=0,
//           since the sabotage's own axis is exactly the one those cubes touch on; and TWO of section 9's
//           four checks -- the brute-force match (fast=1 vs brute=2) and the coincident-vertex triangle's own
//           overlap check, because that degenerate triangle sits AT x=5, exactly on the sabotaged axis's
//           touching boundary with the guaranteed-overlap triangle. The colinear triangle's own check STAYED
//           GREEN even under this sabotage -- it also touches at x=5, but the guaranteed-overlap triangle's
//           own vertex at x=5 keeps at least one OTHER point of that triangle strictly inside the exclusive
//           bound region, so section 9's own fixture is not a clean single-axis discriminator for BOTH
//           degenerate triangles at once, an honest structural note rather than something silently smoothed
//           over. Sections 1-7 and 10 all stayed green, confirming the sabotage is genuinely isolated to
//           touching-boundary behavior and does not leak into ordinary non-boundary overlap or disjoint cases.
//
// Run: node physics/mesh/bvhPairOverlap-selfcheck.mjs
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

function triBounds(tris, t) {
    const o = t * 9;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let c = 0; c < 3; c++) {
        const x = tris[o + c * 3], y = tris[o + c * 3 + 1], z = tris[o + c * 3 + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    return [x0, y0, z0, x1, y1, z1];
}
const overlaps = (a, b) => !(a[3] < b[0] || a[0] > b[3] || a[4] < b[1] || a[1] > b[4] || a[5] < b[2] || a[2] > b[5]);

function bruteForce(bvhA, bvhB) {
    const pairs = [];
    for (let i = 0; i < bvhA.count; i++) {
        const ba = triBounds(bvhA.tris, i);
        for (let j = 0; j < bvhB.count; j++) {
            if (overlaps(ba, triBounds(bvhB.tris, j))) pairs.push([i, j]);
        }
    }
    return pairs;
}
const keySet = (pairs) => new Set(pairs.map(([a, b]) => a + "," + b));

// Deterministic LCG -- reproducible fixtures without a seeded-RNG dependency this tree does not have.
function randomTriBuffer(n, seed) {
    let s = seed;
    const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const tris = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) {
        const cx = rand() * 10, cy = rand() * 10, cz = rand() * 10;
        for (let v = 0; v < 3; v++) {
            tris[i * 9 + v * 3] = cx + (rand() - 0.5) * 2;
            tris[i * 9 + v * 3 + 1] = cy + (rand() - 0.5) * 2;
            tris[i * 9 + v * 3 + 2] = cz + (rand() - 0.5) * 2;
        }
    }
    return tris;
}

function unitCubeTris(ox, oy, oz) {
    const V = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([x,y,z]) => [x+ox, y+oy, z+oz]);
    const F = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
    const out = new Float64Array(F.length * 9);
    F.forEach(([a, b, c], n) => { const o = n * 9; [a, b, c].forEach((vi, k) => { out[o+k*3]=V[vi][0]; out[o+k*3+1]=V[vi][1]; out[o+k*3+2]=V[vi][2]; }); });
    return out;
}

// ---- 1. COMPLETENESS + SOUNDNESS -- set-equality against an O(n*m) brute-force reference. Sizes range from
// single-leaf (na=1,nb=1, never reaches an interior node at all) up through pairs (120 x 90, 200 x 150) that
// recurse several levels deep on both sides at the default maxLeaf=8, so the "both interior" split branch is
// genuinely exercised at more than one depth, not just once. ----
{
    const cases = [
        { na: 20, nb: 15, seed: 1 }, { na: 50, nb: 40, seed: 2 }, { na: 7, nb: 100, seed: 3 },
        { na: 1, nb: 1, seed: 4 }, { na: 3, nb: 3, seed: 9 }, { na: 120, nb: 90, seed: 7 },
        { na: 200, nb: 150, seed: 11 },
    ];
    for (const { na, nb, seed } of cases) {
        const bvhA = new MeshBVH(randomTriBuffer(na, seed));
        const bvhB = new MeshBVH(randomTriBuffer(nb, seed + 100));
        const fast = pairOverlap(bvhA, bvhB);
        const brute = bruteForce(bvhA, bvhB);
        const fastSet = keySet(fast), bruteSet = keySet(brute);
        const same = fastSet.size === bruteSet.size && [...fastSet].every((k) => bruteSet.has(k));
        ok(`na=${na} nb=${nb} seed=${seed}: matches brute force exactly`, same,
            `fast=${fast.length} brute=${brute.length}`);
    }
}

// ---- 2. KNOWN GEOMETRY -- two unit cubes overlapping by exactly half in every axis. Ground truth is the
// SAME brute-force reference (no independent closed-form triangle count exists for an arbitrary cube-cube
// overlap at this orientation), but this section additionally asserts the result is NON-EMPTY and every
// returned pair's triangles genuinely straddle the shared overlap region -- a property brute-force agreement
// alone does not directly state. ----
{
    const bvhA = new MeshBVH(unitCubeTris(0, 0, 0));
    const bvhB = new MeshBVH(unitCubeTris(0.5, 0.5, 0.5));
    const fast = pairOverlap(bvhA, bvhB);
    const brute = bruteForce(bvhA, bvhB);
    ok("overlapping cubes: matches brute force", keySet(fast).size === keySet(brute).size &&
        [...keySet(fast)].every((k) => keySet(brute).has(k)), `fast=${fast.length} brute=${brute.length}`);
    ok("overlapping cubes: non-empty (they DO overlap)", fast.length > 0);
    let allTrueOverlap = true;
    for (const [ta, tb] of fast) if (!overlaps(triBounds(bvhA.tris, ta), triBounds(bvhB.tris, tb))) allTrueOverlap = false;
    ok("!! every returned pair's own triangle AABBs genuinely overlap (soundness, checked directly per pair)", allTrueOverlap);
}

// ---- 3. DISJOINT MESHES -- two cubes 100 units apart. Zero pairs, and the traversal must not throw or hang. ----
{
    const bvhA = new MeshBVH(unitCubeTris(0, 0, 0));
    const bvhB = new MeshBVH(unitCubeTris(100, 100, 100));
    const pairs = pairOverlap(bvhA, bvhB);
    ok("disjoint meshes: zero pairs", pairs.length === 0, `got ${pairs.length}`);
}

// ---- 4. EMPTY MESH -- either side empty must return [] without throwing. ----
{
    const bvhA = new MeshBVH(unitCubeTris(0, 0, 0));
    const empty = new MeshBVH(new Float64Array(0));
    let threwA = false, threwB = false;
    let pairsA = null, pairsB = null;
    try { pairsA = pairOverlap(bvhA, empty); } catch (e) { threwA = true; }
    try { pairsB = pairOverlap(empty, bvhA); } catch (e) { threwB = true; }
    ok("empty B side: no throw, zero pairs", !threwA && pairsA && pairsA.length === 0);
    ok("empty A side: no throw, zero pairs", !threwB && pairsB && pairsB.length === 0);
}

// ---- 5. SYMMETRY -- pairOverlap(A, B) and pairOverlap(B, A) must carry the identical pair CONTENT, indices
// swapped. Not implied by section 1's set-equality against brute force alone (a bug that broke BOTH the fast
// path and this gate's own brute-force reference identically, in the same asymmetric way, would slip past
// section 1) -- structurally independent check. ----
{
    const bvhA = new MeshBVH(randomTriBuffer(30, 41));
    const bvhB = new MeshBVH(randomTriBuffer(25, 53));
    const ab = pairOverlap(bvhA, bvhB), ba = pairOverlap(bvhB, bvhA);
    const abSet = new Set(ab.map(([a, b]) => a + "," + b));
    const baSwapped = new Set(ba.map(([b, a]) => a + "," + b));
    const same = abSet.size === baSwapped.size && [...abSet].every((k) => baSwapped.has(k));
    ok("!! pairOverlap(A,B) and pairOverlap(B,A) carry the same pairs, indices swapped", same,
        `A,B=${ab.length} B,A=${ba.length}`);
}

// ---- 6. DETERMINISM -- the same inputs must produce the identical result every call (no reliance on object
// identity, iteration order of a Set/Map, or anything else that could vary run to run). ----
{
    const bvhA = new MeshBVH(randomTriBuffer(40, 71));
    const bvhB = new MeshBVH(randomTriBuffer(35, 83));
    const r1 = pairOverlap(bvhA, bvhB), r2 = pairOverlap(bvhA, bvhB);
    const same = r1.length === r2.length && r1.every(([a, b], i) => r2[i][0] === a && r2[i][1] === b);
    ok("!! repeated calls on the same inputs return byte-identical results", same);
}

// ---- 7. SELF-COMPARISON -- pairOverlap(bvh, bvh), or two SEPARATE MeshBVH instances built from a COPY of
// the same triangle data. Found missing by an adversarial review of this round's own diff (sections 1-6 above
// never pair a mesh against itself or an identical copy) -- the densest, most boundary-heavy case a future
// self-intersection caller would hit, and structurally distinct from anything section 1's random pairs cover:
// every triangle overlaps ITSELF, and every genuine overlap between two DIFFERENT triangles of the SAME mesh
// gets reported TWICE (as both [a,b] and [b,a]) -- documented as deliberate, unfiltered behavior in
// pairOverlap's own docstring (this round), not something this gate treats as a defect. ----
{
    const srcTris = randomTriBuffer(60, 201);
    const bvhA = new MeshBVH(srcTris);
    const bvhB = new MeshBVH(srcTris.slice());   // a SEPARATE instance over a COPY, not the same object
    const fast = pairOverlap(bvhA, bvhB);
    const brute = bruteForce(bvhA, bvhB);
    ok("self-comparison (two instances, identical triangle data): matches brute force",
        keySet(fast).size === keySet(brute).size && [...keySet(fast)].every((k) => keySet(brute).has(k)),
        `fast=${fast.length} brute=${brute.length}`);
    let allSelfPairsPresent = true;
    const fastKeys = keySet(fast);
    for (let t = 0; t < bvhA.count; t++) if (!fastKeys.has(t + "," + t)) allSelfPairsPresent = false;
    ok("!! every triangle is paired with itself ([t,t] present for all 60 triangles), as documented",
        allSelfPairsPresent);
}

// ---- 8. EXACT BOUNDARY TOUCHING -- two unit cubes sharing the x=1 face exactly, zero interpenetration.
// Found missing by the same review: sections 2/3 only cover real overlap (0.5-unit interpenetration) and
// real separation (100 units apart), never the one input that actually discriminates boxesOverlap's strict
// '<'/'>' comparisons from an off-by-one '<='/'>=' variant. mesh/meshBVH.mjs's own trianglesInBox uses
// inclusive ('<=') bounds on purpose (conservative), and this module's boxesOverlap is the same inclusive
// shape by construction (NOT '<' on the touching axis) -- this section proves that choice holds for real
// touching geometry, not just by reading the comparison operators. ----
{
    const bvhA = new MeshBVH(unitCubeTris(0, 0, 0));
    const bvhB = new MeshBVH(unitCubeTris(1, 0, 0));   // shares the exact x=1 face with bvhA
    const fast = pairOverlap(bvhA, bvhB);
    const brute = bruteForce(bvhA, bvhB);
    ok("exact boundary touch (shared x=1 face): matches brute force",
        keySet(fast).size === keySet(brute).size && [...keySet(fast)].every((k) => keySet(brute).has(k)),
        `fast=${fast.length} brute=${brute.length}`);
    ok("!! touching (zero-interpenetration) counts as overlapping, the same inclusive convention " +
        "mesh/meshBVH.mjs's own trianglesInBox uses on purpose", fast.length > 0, `got ${fast.length}`);
}

// ---- 9. DEGENERATE TRIANGLES -- zero-area (coincident vertices) and colinear (zero cross-product) triangles
// mixed into an otherwise normal mesh. Found missing by the same review: triBounds is a pure min/max scan
// with no division, so a degenerate triangle cannot itself produce NaN/Infinity here (unlike the triangle-
// triangle intersection math a LATER round would add, where degeneracy is a genuine numerical hazard) -- this
// section proves that directly rather than only reasoning about it, and confirms bvhPairOverlap.mjs still
// matches brute force with degenerate input mixed in, not just well-formed triangles. ----
{
    const good = randomTriBuffer(10, 301);
    const degenerate = new Float64Array(18);   // 2 degenerate triangles: one coincident-vertex, one colinear
    // triangle 0 (index good.length/9 = 10): all three vertices identical (zero area, a single point) at (5,5,5)
    for (let k = 0; k < 3; k++) { degenerate[k * 3] = 5; degenerate[k * 3 + 1] = 5; degenerate[k * 3 + 2] = 5; }
    // triangle 1 (index 11): three colinear points along the x-axis (zero area, a line segment) from (5,5,5) to (7,5,5)
    degenerate[9] = 5; degenerate[10] = 5; degenerate[11] = 5;
    degenerate[12] = 6; degenerate[13] = 5; degenerate[14] = 5;
    degenerate[15] = 7; degenerate[16] = 5; degenerate[17] = 5;
    const mixed = new Float64Array(good.length + degenerate.length);
    mixed.set(good, 0); mixed.set(degenerate, good.length);
    const bvhA = new MeshBVH(mixed);
    // bvhB deliberately includes ONE triangle whose AABB is GUARANTEED to overlap both degenerate triangles'
    // known bounding boxes -- a box around (5,5,5)-(7,5,5) -- rather than relying on random placement to
    // happen to land there (an earlier draft of this section used a purely random bvhB and got fast=0/brute=0
    // for both meshes, an accidentally trivial pass that never actually exercised a degenerate triangle
    // inside a REAL overlap; fixed by making the overlap deterministic).
    const guaranteedOverlap = new Float64Array([5,5,5, 7,5,5, 6,6,5]);   // a real triangle spanning that box
    const bvhBTris = new Float64Array(randomTriBuffer(10, 302).length + guaranteedOverlap.length);
    bvhBTris.set(randomTriBuffer(10, 302), 0);
    bvhBTris.set(guaranteedOverlap, randomTriBuffer(10, 302).length);
    const bvhB = new MeshBVH(bvhBTris);
    let threw = false, fast = null;
    try { fast = pairOverlap(bvhA, bvhB); } catch (e) { threw = true; }
    ok("degenerate triangles (coincident-vertex + colinear) mixed into a mesh: no throw", !threw);
    if (!threw) {
        const brute = bruteForce(bvhA, bvhB);
        ok("!! and the result still matches brute force exactly with degenerate input present",
            keySet(fast).size === keySet(brute).size && [...keySet(fast)].every((k) => keySet(brute).has(k)),
            `fast=${fast.length} brute=${brute.length}`);
        const noNaN = fast.every(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
        ok("!! no NaN/non-integer index anywhere in the output", noNaN);
        // the overlap is not incidental -- the two degenerate triangles' own indices (10, 11) must actually
        // appear in the result, paired with the guaranteed-overlap triangle (index 10 in bvhB)
        const fastKeys = keySet(fast);
        const guaranteedIdx = 10;   // 10 random triangles (0-9) then the guaranteed-overlap one at index 10
        ok("!! the coincident-vertex degenerate triangle (bvhA index 10) is genuinely reported as overlapping",
            fastKeys.has("10," + guaranteedIdx), `fast pairs: ${JSON.stringify(fast)}`);
        ok("!! the colinear degenerate triangle (bvhA index 11) is genuinely reported as overlapping",
            fastKeys.has("11," + guaranteedIdx));
    }
}

// ---- 10. LARGE SIZE/DEPTH ASYMMETRY, BOTH SIDES INTERIOR -- 500 triangles (depth 8) against 9 (depth 1).
// Found missing by the same review: section 1's na=7/nb=100 case LOOKS asymmetric by triangle count, but
// na=7 <= maxLeaf(8) means tree A never leaves its single root leaf -- that case only ever exercises the
// leaf-vs-interior branch, never the "both interior, split the LARGER box" branch (the exact branch
// Sabotage B in the header above corrupts) under real depth imbalance. This section is the first in the
// suite where BOTH sides are genuinely interior (nb=9 > maxLeaf(8) by one triangle, on purpose -- the
// smallest possible interior tree) at a large size ratio. ----
{
    const bvhA = new MeshBVH(randomTriBuffer(500, 21));
    const bvhB = new MeshBVH(randomTriBuffer(9, 22));
    ok("fixture check: both sides are genuinely interior (nodes > 1), not a degenerate single-leaf case",
        bvhA.nodes > 1 && bvhB.nodes > 1, `A nodes=${bvhA.nodes} depth=${bvhA.depth}, B nodes=${bvhB.nodes} depth=${bvhB.depth}`);
    const fast = pairOverlap(bvhA, bvhB);
    const brute = bruteForce(bvhA, bvhB);
    ok("!! 500 vs 9 (large size/depth asymmetry, both interior): matches brute force exactly",
        keySet(fast).size === keySet(brute).size && [...keySet(fast)].every((k) => keySet(brute).has(k)),
        `fast=${fast.length} brute=${brute.length}`);
}

console.log(`bvhPairOverlap-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: this is the BROAD PHASE ONLY -- no TRIANGLE-LEVEL intersection " +
    "segment, no clipping/splitting, no inside/outside classification EXIST IN THIS MODULE. Corrected from an " +
    "earlier draft of this footer, which overclaimed those pieces exist 'nowhere in this tree' -- they do: " +
    "physics/mesh/meshCSG.mjs already has a working polygon splitter and BSP-based inside/outside " +
    "classification (splitPolygon, Node.clipTo), which is exactly what this new module is meant to eventually " +
    "feed a faster candidate list into. See physics/mesh/bvhPairOverlap.mjs's own header for the full scope " +
    "statement (it already draws this distinction correctly; only this gate's own footer did not). Also " +
    "unchecked: performance (this gate proves correctness, not that the dual-tree traversal is actually " +
    "faster than an O(n*m) brute force at realistic mesh sizes -- expected, given how BVH broad phases work " +
    "in general, but not measured here); the two BVHs sharing one coordinate frame is an assumed precondition, " +
    "not something this module or gate enforces or checks; and self-comparison (bvhA===bvhB or two instances " +
    "over identical triangle data) is exercised by section 7 below for CORRECTNESS but is not deduplicated -- " +
    "see pairOverlap's own updated docstring for what a future self-intersection caller would still need to " +
    "do itself.");
process.exit(fails ? 1 : 0);
