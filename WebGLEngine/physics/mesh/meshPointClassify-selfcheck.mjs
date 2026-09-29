// WebGLEngine/physics/mesh/meshPointClassify-selfcheck.mjs
//
// Run: node physics/mesh/meshPointClassify-selfcheck.mjs
//
// GATES physics/mesh/meshPointClassify.mjs -- round 4 of the BVH-CSG arc (tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff"), ray-crossing-parity inside/outside classification.
//
// *** INDEPENDENT ORACLES, USED THROUGHOUT, SHARING NO CODE WITH meshPointClassify.mjs's OWN LOGIC: ***
//   boxOracle(p)      -- a plain axis-aligned bounding-box containment check (0<p.x<1 etc) for the hand-built
//                         unit-cube test mesh. Textually unrelated to ray casting entirely.
//   rotOracle(p)      -- the same box check, but transforms the query point into the ROTATED test cube's own
//                         local frame first (via an independently-derived inverse rotation), so correctness
//                         doesn't secretly depend on the test mesh being axis-aligned -- a real risk this
//                         round's own research flagged (axis-aligned geometry is exactly where a badly-chosen
//                         ray direction is most likely to coincidentally graze an edge or vertex).
//
// A REAL BUG THIS ROUND'S OWN SCRATCH-TESTING FOUND BEFORE THE MODULE WAS WRITTEN -- see meshPointClassify.mjs's
// own header for the full account. Short version: casting straight up from the unit cube's own CENTER (an
// unambiguously inside point) exits through the top face's shared diagonal, where BOTH of that face's two
// triangles independently register a hit at the identical t -- a naive (unwelded) hit count of 2 would
// misclassify the center as OUTSIDE. Section 2 below reproduces this exact case and asserts the naive count
// really would have been wrong, not just that the fixed code happens to work.
//
// A SECOND REAL BUG, FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND'S ORIGINAL DIFF (HIGH severity, verified by
// direct execution), AND ONLY PARTIALLY FIXED: welding by t-proximity cannot tell "the same physical crossing
// registered twice" from "two genuinely distinct crossings that happen to be close together" -- e.g. entering
// and exiting a locally THIN mesh feature. FIXED to the extent measured: a relative-plus-absolute weld
// tolerance (see meshPointClassify.mjs's own header for the 200-case sweep behind the new default) moves the
// residual failure point from ~1e-7 down to ~1e-10, correctly resolving the reviewer's own exact repro, but a
// feature thinner than ~1e-9 world units can still be silently merged away -- section 4b below proves both
// halves, the fixed cases AND the still-broken extreme one, rather than only the success.
//
// SABOTAGE LOG -- each applied to physics/mesh/meshPointClassify.mjs, gate run, exit read, file restored byte
// for byte (restore verified via md5sum before/after every sabotage):
//   A  the weld/merge loop collapsed to a no-op (crossings = hits.length, i.e. every raw hit counted as its
//      own crossing, reverting to the exact naive bug this round found)
//        -> exit=1, 1 RED: ONLY section 2's third assertion (the actual pointInMesh() call using the exact
//           graze direction). FIRST GUESS WAS WRONG, CORRECTED AFTER MEASURING rather than left standing: the
//           randomized-stress sections (5, 6) stayed GREEN -- a random query point essentially never lands
//           EXACTLY on one of the cube's own triangulation diagonals (a specific x=y line), so they never
//           exercise this sabotage at all. Sections 2b/3 also stayed green for a DIFFERENT, structural reason:
//           they call rayAllHits() directly and weld the result with their OWN gate-local loop, independent of
//           the module's internal pointInMesh() weld logic that was sabotaged -- so this sabotage is narrower
//           and more surgically isolated than first assumed, not broader.
//   B  the majority-vote comparison inverted (`insideVotes > outsideVotes` to `insideVotes < outsideVotes`)
//        -> exit=1, 14 red: every hand-derived case, the parity-flip demo's own final assertion, the majority-
//           vote-defense-in-depth case, both thin-feature-regression checks (section 4b), both randomized-
//           stress sections (400/400 and 424/424 mismatches -- every single margin-filtered case, not a
//           subset), the empty-mesh convention, and the integration scenario -- confirms the vote arithmetic
//           is genuinely load-bearing for the whole module, not decorative window-dressing around welding.
//   C  the ray/box slab test's forward-direction cutoff (`return t1 >= eps;`) changed to always return true
//      (every node visited regardless of whether the box is actually ahead of or behind the ray origin)
//        -> exit=1, 0 RED -- a real finding, not a clean pass: pure over-visiting costs performance (every
//           leaf gets tested regardless of whether its box is provably behind the ray), but every triangle
//           test is still gated by rayTriangle's own `t > eps` check, so no WRONG hit is ever produced --
//           this sabotage is a correctness no-op given the current triangle-level filtering, left as an
//           honestly-reported 0-red result rather than manufacturing a section to force it red, matching this
//           arc's own standing rule that a 0-red sabotage is reported, not silently hidden.
//   D  the relative-plus-absolute weld tolerance (the fix for the SECOND bug above) reverted to a hardcoded
//      flat 1e-7, the exact original value the adversarial review found broken
//        -> exit=1, 1 RED, and NOT the one first expected -- section 4's own deliberately-disabled-welding
//           case (`weldEps:0, weldEpsRel:0`) is the one that broke, because its OWN opts overrides stopped
//           having any effect once the tolerance was hardcoded, silently making that direction weld again
//           (5-0 instead of the intended 4-1). Section 4b (the thin-feature regression THIS fix specifically
//           targets) stayed GREEN under this exact sabotage -- checked, not assumed: at the tested slab
//           thicknesses, 3 of the 5 well-spread DEFAULT_DIRS simply never reach the slab's own diagonal at
//           all (rawHits=0, unaffected by tolerance either way), so majority voting alone still outvotes the
//           1-2 directions the reverted tolerance corrupts, MASKING the regression in that specific test
//           geometry -- a real, honestly-reported limit of section 4b's own coverage, not a claim that it
//           regression-tests the tolerance fix in isolation the way section 4 tests voting in isolation.
//
// Run: node physics/mesh/meshPointClassify-selfcheck.mjs
"use strict";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { rayAllHits, pointInMesh, DEFAULT_DIRS } from "./meshPointClassify.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { clipTriangleByTriPlane } from "./triClip.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

// ---- Hand-built watertight unit cube, (0,0,0)-(1,1,1), 12 triangles, 2 per face, diagonal split. ----
function unitCube() {
    const V = {
        a: [0, 0, 0], b: [1, 0, 0], c: [1, 1, 0], d: [0, 1, 0],
        e: [0, 0, 1], f: [1, 0, 1], g: [1, 1, 1], h: [0, 1, 1],
    };
    const tris = [
        [V.a, V.b, V.c], [V.a, V.c, V.d],   // -z
        [V.e, V.g, V.f], [V.e, V.h, V.g],   // +z
        [V.a, V.f, V.b], [V.a, V.e, V.f],   // -y
        [V.d, V.c, V.g], [V.d, V.g, V.h],   // +y
        [V.a, V.h, V.d], [V.a, V.e, V.h],   // -x
        [V.b, V.c, V.g], [V.b, V.g, V.f],   // +x
    ];
    const buf = new Float64Array(tris.length * 9);
    tris.forEach((t, n) => { const o = n * 9; t.forEach((p, k) => { buf[o + k * 3] = p[0]; buf[o + k * 3 + 1] = p[1]; buf[o + k * 3 + 2] = p[2]; }); });
    return buf;
}
const cubeTris = unitCube();
const cubeBvh = new MeshBVH(cubeTris);
function boxOracle(px, py, pz) { return px > 0 && px < 1 && py > 0 && py < 1 && pz > 0 && pz < 1; }

// ---- 1. HAND-DERIVED CASES, well away from any face/edge/vertex, checked against the independent boxOracle,
// asserting FULL agreement (1.0) -- a well-separated point should never see any of the 5 default directions
// disagree. ----
{
    const cases = [
        { p: [0.5, 0.5, 0.5], expect: true, label: "center" },
        { p: [5, 5, 5], expect: false, label: "far outside" },
        { p: [1.5, 0.5, 0.5], expect: false, label: "just outside +x face" },
        { p: [0.9, 0.5, 0.5], expect: true, label: "just inside near +x face" },
        { p: [-0.5, -0.5, -0.5], expect: false, label: "outside near origin corner" },
        { p: [0.1, 0.1, 0.1], expect: true, label: "inside near origin corner" },
    ];
    for (const c of cases) {
        const r = pointInMesh(cubeBvh, ...c.p);
        ok(`hand-derived (${c.label}): inside=${c.expect}`, r.inside === c.expect, JSON.stringify(r));
        ok(`hand-derived (${c.label}): full agreement (well-separated from any boundary)`, r.agreement === 1);
    }
}

// ---- 2. THE PARITY-FLIP DEMONSTRATION -- THE REAL BUG THIS ROUND FOUND. See this file's own header and
// meshPointClassify.mjs's own header for the full account. Casting straight up (0,0,1) from the cube's own
// CENTER exits through the +z face's shared diagonal e-g; BOTH of that face's triangles register a hit at the
// identical t. Asserts the RAW (naive, unwelded) hit count would have given the WRONG answer, and the WELDED
// count (what pointInMesh() actually computes) gives the right one -- not merely that the final answer is
// correct, which alone wouldn't prove the weld mechanism is what's doing the work. ----
{
    const rawHits = rayAllHits(cubeBvh, 0.5, 0.5, 0.5, 0, 0, 1, 1e-9);
    ok("!! parity-flip demo: raw (unwelded) hit count is 2 (both +z-face triangles register the same crossing)",
        rawHits.length === 2, JSON.stringify(rawHits));
    const naiveWouldSayInside = (rawHits.length % 2) === 1;
    ok("!! parity-flip demo: the NAIVE (unwelded) parity would have been WRONG (says outside for a point that is genuinely inside)",
        naiveWouldSayInside === false);
    const r = pointInMesh(cubeBvh, 0.5, 0.5, 0.5, { dirs: [[0, 0, 1]] });
    ok("!! parity-flip demo: the ACTUAL (welded) pointInMesh() result is CORRECT for this exact direction",
        r.inside === true, JSON.stringify(r));
}

// ---- 2b. Same mechanism, both ends of one ray: origin below (0.3,0.3,-1), direction (0,0,1) -- x=y=0.3 lies
// exactly on BOTH the -z face's diagonal a-c AND the +z face's diagonal e-g, so this ray grazes on ENTRY and
// on EXIT: raw=4 (2 per face), welded=2 (1 per face, the true enter-once/exit-once crossing count). ----
{
    const rawHits = rayAllHits(cubeBvh, 0.3, 0.3, -1, 0, 0, 1, 1e-9);
    ok("!! double-ended graze: raw hit count is 4 (both faces' diagonals each double-registered)",
        rawHits.length === 4, JSON.stringify(rawHits));
    let crossings = 0, i = 0;
    while (i < rawHits.length) { let j = i + 1; while (j < rawHits.length && rawHits[j].t - rawHits[i].t < 1e-7) j++; crossings++; i = j; }
    ok("!! double-ended graze: welded crossing count is 2 (one true crossing per face)", crossings === 2);
}

// ---- 3. VERTEX GRAZE -- a ray through an exact cube CORNER (0,0,0), where multiple triangles meet, not just
// two sharing an edge. Confirms welding generalizes beyond the two-triangle-shared-edge case. ----
{
    const rawHits = rayAllHits(cubeBvh, 0, 0, -1, 0, 0, 1, 1e-9);
    ok("!! vertex graze: raw hit count is 4 (both faces' triangle-pairs meeting at the corner each double-register)",
        rawHits.length === 4, JSON.stringify(rawHits));
    let crossings = 0, i = 0;
    while (i < rawHits.length) { let j = i + 1; while (j < rawHits.length && rawHits[j].t - rawHits[i].t < 1e-7) j++; crossings++; i = j; }
    ok("!! vertex graze: welded crossing count is 2", crossings === 2);
}

// ---- 4. MAJORITY-VOTE DEFENSE IN DEPTH, EMPIRICALLY DEMONSTRATED, NOT ASSUMED. With welding deliberately
// DISABLED (weldEps:0) and the known-bad grazing direction (0,0,1) mixed in alongside 4 generic non-grazing
// directions, the vote must still be 4-to-1 in favor of the correct answer -- proving multi-direction voting
// is a real, independently useful safeguard, not merely a decorative wrapper around welding. ----
{
    const badDir = [0, 0, 1];
    const goodDirs = [
        [0.5257311121191336, 0.85065080835204, 0.1],
        [-0.3568220897730899, 0.5, 0.7891637897999022],
        [0.7071067811865476, -0.4082482904638631, 0.5773502691896258],
        [-0.6, -0.7, 0.3872983346207417],
    ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
    const r = pointInMesh(cubeBvh, 0.5, 0.5, 0.5, { dirs: [badDir, ...goodDirs], weldEps: 0, weldEpsRel: 0 });
    ok("!! majority vote (welding disabled, 1 bad direction mixed with 4 good): still correctly inside",
        r.inside === true, JSON.stringify(r));
    ok("!! majority vote: exactly 4-to-1, with the bad direction visibly outvoted (agreement reflects the split, not hidden)",
        r.votes.inside === 4 && r.votes.outside === 1 && Math.abs(r.agreement - 0.8) < 1e-9, JSON.stringify(r));
}

// ---- 4b. THIN-FEATURE REGRESSION -- A REAL, HIGH-SEVERITY BUG AN ADVERSARIAL REVIEW OF THIS ROUND FOUND, ONLY
// PARTIALLY FIXED. The weld mechanism (sections 2/2b/3/4 above) cannot distinguish "the same physical crossing
// registered twice" from "two genuinely distinct crossings that are merely close together along the ray" --
// e.g. entering and exiting a locally THIN mesh feature. The reviewer built a "slab" mesh (same 12-triangle
// cube topology, squished to thickness w) and showed the ORIGINAL weldEps=1e-7 default confidently
// misclassified a point just below it as inside for w as large as 1e-8. FIXED (see meshPointClassify.mjs's own
// header for the measurement behind the new relative-plus-absolute tolerance): the previously-failing
// thicknesses now correctly classify. NOT fully fixed, and this section proves both halves honestly rather
// than only the success: an even thinner slab (w=1e-10) still misclassifies, reproduced here explicitly rather
// than hidden -- a complete fix needs topological (shared-edge/vertex) adjacency this flat buffer format does
// not carry. ----
function slabMesh(w) {
    const V = { a: [0, 0, 0], b: [1, 0, 0], c: [1, 1, 0], d: [0, 1, 0], e: [0, 0, w], f: [1, 0, w], g: [1, 1, w], h: [0, 1, w] };
    const tris = [
        [V.a, V.b, V.c], [V.a, V.c, V.d], [V.e, V.g, V.f], [V.e, V.h, V.g], [V.a, V.f, V.b], [V.a, V.e, V.f],
        [V.d, V.c, V.g], [V.d, V.g, V.h], [V.a, V.h, V.d], [V.a, V.e, V.h], [V.b, V.c, V.g], [V.b, V.g, V.f],
    ];
    const buf = new Float64Array(tris.length * 9);
    tris.forEach((t, n) => { const o = n * 9; t.forEach((p, k) => { buf[o + k * 3] = p[0]; buf[o + k * 3 + 1] = p[1]; buf[o + k * 3 + 2] = p[2]; }); });
    return buf;
}
{
    for (const w of [1e-8, 1e-9]) {
        const slabBvh = new MeshBVH(slabMesh(w));
        const r = pointInMesh(slabBvh, 0.5, 0.5, -0.001);
        ok(`!! thin-feature regression (now fixed): slab thickness ${w}, point 0.001 below it is correctly OUTSIDE`,
            r.inside === false, JSON.stringify(r));
    }
    // the honestly-reported residual failure -- NOT asserted as a pass, recorded as a known, reproduced gap
    const extremeBvh = new MeshBVH(slabMesh(1e-10));
    const rExtreme = pointInMesh(extremeBvh, 0.5, 0.5, -0.001);
    console.log(`  (known-unresolved: slab thickness 1e-10 still misclassifies -- inside=${rExtreme.inside} (true answer is false), agreement=${rExtreme.agreement}; see meshPointClassify.mjs's own header for why this is not fixed this round)`);
}

// ---- 4c. DEFAULT_DIRS SPREAD -- a cheap structural check an adversarial review of this round found missing:
// nothing previously verified the 5 default directions are actually well-spread (mutually far from parallel),
// which is the whole point of majority voting existing at all. Every pair's dot product must be comfortably
// below 1 (parallel) -- a loose bound (0.9), not a tight design spec, just a guard against a future edit
// accidentally making two defaults near-duplicates. ----
{
    let maxDot = -1;
    for (let i = 0; i < DEFAULT_DIRS.length; i++) {
        for (let j = i + 1; j < DEFAULT_DIRS.length; j++) {
            const [ax, ay, az] = DEFAULT_DIRS[i], [bx, by, bz] = DEFAULT_DIRS[j];
            const d = Math.abs(ax * bx + ay * by + az * bz);
            if (d > maxDot) maxDot = d;
        }
    }
    ok("!! DEFAULT_DIRS: every pair of default directions is well-spread (|dot| < 0.9, none near-parallel)",
        maxDot < 0.9, `max |dot| = ${maxDot}`);
}

// ---- 5. RANDOMIZED STRESS, axis-aligned unit cube vs the independent boxOracle. Points within MARGIN of any
// face plane are rejected (sections 2-4 above already probe boundary/graze cases deliberately) so this section
// isolates ordinary-case correctness at volume. ----
{
    const rand = lcg(4242);
    let n = 0, mismatches = 0, lowAgreement = 0;
    const MARGIN = 0.03;
    for (let i = 0; i < 500; i++) {
        const p = [rand() * 1.6 - 0.3, rand() * 1.6 - 0.3, rand() * 1.6 - 0.3];
        if ([0, 1].some(v => p.some(c => Math.abs(c - v) < MARGIN))) continue;
        n++;
        const expect = boxOracle(...p);
        const r = pointInMesh(cubeBvh, ...p);
        if (r.inside !== expect) mismatches++;
        if (r.agreement < 1) lowAgreement++;
    }
    ok(`!! randomized stress (axis-aligned cube, ${n} margin-filtered cases): zero mismatches`, mismatches === 0, `mismatches=${mismatches}`);
    ok(`!! randomized stress (axis-aligned cube): zero low-agreement cases away from boundaries`, lowAgreement === 0, `lowAgreement=${lowAgreement}`);
}

// ---- 6. RANDOMIZED STRESS, ROTATED (non-axis-aligned) cube vs an independent oracle that inverse-transforms
// the query point into the cube's own local frame first. Proves correctness doesn't secretly depend on the
// test mesh itself being axis-aligned -- exactly the risk this round's research flagged (axis-aligned geometry
// is where a naive ray direction is most likely to coincidentally graze). ----
{
    function rotateY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
    function rotateX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; }
    const ANG_Y = 0.6, ANG_X = 0.35;
    function fwd(p) { return rotateX(rotateY(p, ANG_Y), ANG_X); }
    function inv(p) {
        const cX = Math.cos(ANG_X), sX = Math.sin(ANG_X);
        const p1 = [p[0], cX * p[1] + sX * p[2], -sX * p[1] + cX * p[2]];
        const cY = Math.cos(ANG_Y), sY = Math.sin(ANG_Y);
        return [cY * p1[0] - sY * p1[2], p1[1], sY * p1[0] + cY * p1[2]];
    }
    const V = { a: [0, 0, 0], b: [1, 0, 0], c: [1, 1, 0], d: [0, 1, 0], e: [0, 0, 1], f: [1, 0, 1], g: [1, 1, 1], h: [0, 1, 1] };
    const centered = {}; for (const k in V) centered[k] = [V[k][0] - 0.5, V[k][1] - 0.5, V[k][2] - 0.5];
    const R = {}; for (const k in centered) R[k] = fwd(centered[k]);
    const trisSpec = [["a","b","c"],["a","c","d"],["e","g","f"],["e","h","g"],["a","f","b"],["a","e","f"],
        ["d","c","g"],["d","g","h"],["a","h","d"],["a","e","h"],["b","c","g"],["b","g","f"]];
    const buf = new Float64Array(trisSpec.length * 9);
    trisSpec.forEach((t, n) => { const o = n * 9; t.forEach((k, i) => { buf[o + i * 3] = R[k][0]; buf[o + i * 3 + 1] = R[k][1]; buf[o + i * 3 + 2] = R[k][2]; }); });
    const rotBvh = new MeshBVH(buf);
    function rotOracle(px, py, pz) {
        const local = inv([px, py, pz]);
        return local[0] > -0.5 && local[0] < 0.5 && local[1] > -0.5 && local[1] < 0.5 && local[2] > -0.5 && local[2] < 0.5;
    }
    const rand = lcg(9911);
    let n = 0, mismatches = 0, lowAgreement = 0;
    for (let i = 0; i < 500; i++) {
        const p = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
        const local = inv(p);
        if ([-0.5, 0.5].some(v => local.some(c => Math.abs(c - v) < 0.03))) continue;
        n++;
        const expect = rotOracle(...p);
        const r = pointInMesh(rotBvh, ...p);
        if (r.inside !== expect) mismatches++;
        if (r.agreement < 1) lowAgreement++;
    }
    ok(`!! randomized stress (ROTATED cube, ${n} margin-filtered cases): zero mismatches`, mismatches === 0, `mismatches=${mismatches}`);
    ok(`!! randomized stress (ROTATED cube): zero low-agreement cases away from boundaries`, lowAgreement === 0, `lowAgreement=${lowAgreement}`);
}

// ---- 7. EMPTY MESH -- no geometry to be inside of; must not crash, and the sensible convention (inside:false,
// zero votes either way) must hold. ----
{
    const emptyBvh = new MeshBVH(new Float64Array(0));
    const r = pointInMesh(emptyBvh, 0, 0, 0);
    ok("!! empty mesh: pointInMesh does not throw and reports inside:false", r.inside === false, JSON.stringify(r));
    const hits = rayAllHits(emptyBvh, 0, 0, 0, 1, 0, 0);
    ok("!! empty mesh: rayAllHits returns an empty array, not a throw", Array.isArray(hits) && hits.length === 0);
}

// ---- 8. END-TO-END INTEGRATION: pairOverlap -> triClip -> pointInMesh, chaining ALL FOUR pieces of this arc
// for the one class of scenario that needs only a SINGLE clip (per this round's own research: a general
// box-minus-box needs multi-plane accumulation, explicitly out of scope -- see this module's own header).
// Triangle A has one vertex inside the cube and two vertices outside past the +x face; pairOverlap finds the
// +x face as a real candidate, clipping A against that ONE candidate's plane fully separates an
// entirely-inside fragment from entirely-outside fragments, and pointInMesh classifies each fragment's own
// centroid, cross-checked against the SAME independent boxOracle every other section here uses. ----
{
    const Atri = new Float64Array([
        0.5, 0.5, 0.5,
        2.0, 0.5, 0.5,
        2.0, 0.9, 0.5,
    ]);
    const bvhA = new MeshBVH(Atri);
    const pairs = pairOverlap(bvhA, cubeBvh);
    const xFaceCandidate = pairs.find(([, tb]) => tb === 10 || tb === 11);
    ok("!! integration: pairOverlap finds a real +x-face candidate", !!xFaceCandidate, JSON.stringify(pairs));
    if (xFaceCandidate) {
        const [ta, tb] = xFaceCandidate;
        const clip = clipTriangleByTriPlane(Atri, ta, cubeTris, tb);
        ok("!! integration: clipTriangleByTriPlane against that candidate succeeds", clip.status === "clipped", JSON.stringify(clip));
        if (clip.status === "clipped") {
            const centroid = (tri) => [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3, (tri[0][2] + tri[1][2] + tri[2][2]) / 3];
            let allMatch = true;
            for (const side of ["front", "back"]) {
                for (const frag of clip[side]) {
                    const c = centroid(frag);
                    const classification = pointInMesh(cubeBvh, ...c);
                    const expected = boxOracle(...c);
                    if (classification.inside !== expected) allMatch = false;
                }
            }
            ok("!! integration: every resulting fragment's own centroid classifies against the boxOracle exactly as expected",
                allMatch);
        }
    }
}

console.log(`meshPointClassify-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: multi-plane fragment accumulation (clipping one triangle against " +
    "EVERY overlapping candidate rather than just one, needed for a general two-mesh overlap like box-minus-box " +
    "-- confirmed by this round's own investigation that even the simplest realistic case needs it, so no easy " +
    "substitute demo exists; explicitly deferred to a future round, not attempted here); non-watertight input " +
    "(a gap in the mesh can make ray-crossing parity under- or over-count near the gap -- this module assumes " +
    "watertight input and does not detect or guard against violations, matching physics/mesh/meshCSG.mjs's own " +
    "documented residual T-junction gaps as the real-world source of such gaps in this tree's own pipeline); a " +
    "query point exactly ON the mesh surface (the `agreement` field is a diagnostic signal for this, not a " +
    "resolution); per-operation (union/subtract/intersect) fragment-keep rules and output-mesh assembly (this " +
    "round classifies points, it does not assemble a result mesh); and performance at realistic mesh sizes " +
    "(this gate proves correctness of one point-vs-mesh query at a time, not throughput). ALSO NAMED HONESTLY, " +
    "FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND: a local mesh feature thinner than ~1e-9 world units along " +
    "the cast ray can still be silently misclassified even after this round's own weldEps tightening -- see " +
    "section 4b above (thin-feature regression) and meshPointClassify.mjs's own header for the full account " +
    "and the measurement behind the fix; a complete fix needs topological (shared-edge/vertex) adjacency this " +
    "flat, non-indexed triangle buffer format does not carry, not attempted this round. ONE MORE GAP, LOWER " +
    "SEVERITY, ALSO FOUND BY THAT REVIEW AND NOT CLOSED: section 8's own end-to-end integration scenario uses " +
    "generous margins on every axis (isolated-vertex distance to the cutting plane, and every resulting " +
    "fragment's distance from the classifying mesh's own boundary), so it never exercises the specific place " +
    "round 3's own documented triClip.mjs sliver-triangle risk and this round's own weld/agreement handling " +
    "could interact -- a coverage gap, not a known bug, left for a future round rather than manufactured here.");
process.exit(fails ? 1 : 0);
