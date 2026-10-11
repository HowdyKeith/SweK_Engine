// WebGLEngine/physics/mesh/meshBooleanBlast-selfcheck.mjs
//
// Run: node physics/mesh/meshBooleanBlast-selfcheck.mjs
//
// ROUND 7 OF THE BVH-CSG ARC: THE HEAD-TO-HEAD THE ARC WAS OPENED FOR. tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff" entry asked whether a BVH-accelerated CSG (three-bvh-csg's shape) could
// replace physics/mesh/meshCSG.mjs's BSP without giving up the property meshCSG's own header calls load-bearing
// -- "same volume, same watertight surface". Rounds 1-6 built physics/mesh/meshBoolean.mjs from scratch. This
// gate runs it on meshCSG's OWN workload, byte for byte: meshCSG-selfcheck.mjs's WALL (a 8 x 6 x 0.6 box) and
// its BLOB(k) jagged explosion blobs (224 triangles each), one blast and then twelve chained blasts, each shot's
// output fed back in as the next shot's input.
//
// *** WHAT RUNNING IT FOUND FIRST, BEFORE ANY OF THE BELOW COULD PASS: ROUND 6's meshBoolean WAS WRONG ON THIS
// WORKLOAD. *** triFragmentAccumulate.mjs split every live fragment by every candidate B-plane, INFINITE planes,
// so a 224-facet blob sliced the wall's two big face triangles along every facet's plane edge to edge. One blast
// produced 18,129 triangles uncapped; at the default maxFragments=256 it hit the cap, left cuts unapplied, and
// came back 0.2012 units of volume wrong (0.74%) with nothing but a `capped:true` buried in its stats. Section 1
// reproduces that on round 6's path (still reachable by option) so the before/after lives in the gate. The fix
// is triFragmentAccumulate.mjs's ROUND 7 intersection gate, which meshBoolean.mjs now turns on by default.
//
// ORACLES, NONE OF THEM meshBoolean.mjs's OWN CODE:
//   - meshCSG.mjs's BSP subtract()/blast() on the same inputs, and its exact divergence-theorem volume().
//   - THE SAME CHAIN AT 1000x SCALE, for BOTH methods. Every absolute tolerance in either pipeline (meshCSG's
//     EPS=1e-5, triClip's and triTriIntersect's EPS) becomes relatively a million times smaller there, so where
//     two structurally different algorithms agree at 1000x, that value (divided by 1e9) is the truth at 1x to
//     well beyond either method's own rounding. Section 3 uses it to decide WHICH method is right where they
//     disagree at 1x -- rather than assuming the older one is.
//   - A POINT-MEMBERSHIP ORACLE THAT NEVER LOOKS AT EITHER RESULT MESH: a point is in (WALL - union of blobs)
//     iff it is inside the wall's analytic box AND outside every blob, each blob tested on its OWN closed input
//     mesh. Compared against pointInMesh() on each method's final mesh.
//   - meshCSG.mjs's own watertight() directed-edge census, after meshCSG.mjs's own settle() (snap + merge + weld).
//
// Timings are PRINTED, never asserted -- they move with the machine. Every asserted number is a count, a
// volume, or a mismatch tally.
//
// SABOTAGE LOG -- each applied to the real file named, all three affected gates run (triFragmentAccumulate /
// meshBoolean / THIS gate), file restored byte for byte in a `finally` and the restore verified by md5sum.
// RE-MEASURED against the FINAL files after the adversarial-review fixes (an earlier run against the pre-fix
// files recorded different counts -- S1 then ran away past 180 s here, S2 read 1/5/9 -- replaced, not kept):
//   S1  gate INVERTED (skip fragments that DO meet a B-triangle)          -> 7 / 16 / 7  (here: 1-exact, 2 volume
//       and ambiguity, 3 agreement, 4 both membership checks -- 3,789 and 938 mismatches -- 5 watertight)
//   S2  gate consults only the FIRST member of a coplanar group           -> 1 / 1 / 5
//   S3  gate honours only "intersect" ("coplanar"/"degenerate" skip)      -> 2 / 8 / 7
//   S4  accumulateFragments' own default flipped ON                        -> 2 / 0 / 0 (its contract, its gate)
//   S5  meshBoolean's default gate OFF (round 6's path at the 65536 cap)   -> 0 / 3 / 5 by name, then this gate
//       runs past 180 s in section 5's settle() of the 133,771-triangle wall the chain produced
//   S6  MESH_BOOLEAN_MAX_FRAGMENTS back to 256                             -> 0 / 0 / 4 (only this workload needs
//       more than 256 fragments on one triangle)
//   S7  top-level `capped` reports side A only                             -> 0 / 1 / 0 -- went 0/0/0 on its FIRST
//       run; meshBoolean-selfcheck section 8's B-only fixture was added for it
//   R1  plane dedup reverted to round 5's normal+offset test               -> 1 / 1 / 0 (14h; the roof, 0.048)
//   R2  per-plane group pre-filter removed                                 -> 1 / 0 / 0 (14i's groupsSkipped --
//       correctness-neutral by design, pinned by the counter added for exactly this)
//   R3  pre-filter keeps only "intersect" members                           -> 2 / 6 / 0
//   R4  accOpts merge back to a plain spread                               -> 0 / 1 / 0 (section 14's merge check)
//   R5  fragment gate treats "coplanar" as not meeting                     -> 1 / 1 / 0 (14g; meshBoolean's red is
//       incidental -- its ambiguous-drop demo loses its ambiguous fragments)
// ROUND 8 (section 7, the spatial index end to end): all index sabotages and their reds in the three gates are
// logged in triFragmentAccumulate-selfcheck.mjs's header (final, post-review file). Here: I4c (query range one
// cell short) 8, I5 (order broken) 1 -- section 7's buffer comparison -- I8 (one cell) 1, section 7's work count;
// I2 and I3 crash this gate (exit 1) rather than name a red.
// A PROCESS MISTAKE, DISCLOSED: the first runner had no `finally`; S1 timed out on this gate and the crash left
// triFragmentAccumulate.mjs sabotaged on disk. Caught by an md5 check before anything else ran; restored.
//
// ROUND 9: meshBoolean's DEFAULT is now segment-bounded cutting (physics/mesh/triArrangement.mjs), with the plane-cut
// path as its fallback. So sections 2-6 -- which call meshBoolean() with no options -- now measure the ARRANGEMENT
// against the BSP, the 1000x reference and the membership oracle; sections 1 and 7, which are about the plane-cut
// path's own history (round 6's cap, round 7's gate, round 8's index), pin it with arrangement:false; section 8 puts
// the two paths side by side. An adversarial review of round 9 found section 1 still LABELLED "default" after the
// pin, and section 5's comments quoting round 7's settle numbers for a solid the arrangement now builds -- both fixed.
// Round 9's sabotages (A1-A11 and the review-fix reverts) are logged in triArrangement-selfcheck.mjs's header with
// their reds in this gate.
"use strict";

import * as M from "./meshCSG.mjs";
import { meshBoolean } from "./meshBoolean.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const info = (s) => console.log("  ..... " + s);
const now = () => performance.now();

// meshCSG-selfcheck.mjs's own fixtures, verbatim at S=1. At other scales every VERTEX of the S=1 geometry is
// multiplied by S -- NOT jaggedBlob() re-run with a scaled centre and radius, which is what the first draft did:
// jaggedBlob offsets its north pole by an ABSOLUTE 1e-9, so that "1000x" blob was not the 1x blob scaled, and
// the 3.34e-12 (section 3) and 2.07e-9 (section 6) this gate first blamed on meshBoolean were the fixture's.
// Measured by the round-7 adversarial review: with exact scaling they are 8.4e-13 and 6.4e-15.
const scalePolys = (polys, S) => polys.map((p) => {
    const vs = p.vs.map((v) => [v[0] * S, v[1] * S, v[2] * S]);
    return { vs, pl: M.planeOf(vs) };
});
const WALL = (S = 1) => scalePolys(M.boxPolys([0, 0, 0], [4, 3, 0.3]), S);
const BLOB = (k, S = 1) => scalePolys(M.jaggedBlob([(k % 5 - 2) * 1.4, ((k * 7) % 5 - 2) * 1.0, 0], 0.9, 8, 1000 + k * 37), S);
const SINGLE_BLOB = () => M.jaggedBlob([0, 0, 0], 1.0, 8, 12345);
const SHOTS = 12;

function polysFromBuf(buf) {
    const out = [];
    for (let i = 0; i < buf.length; i += 9) {
        const vs = [[buf[i], buf[i + 1], buf[i + 2]], [buf[i + 3], buf[i + 4], buf[i + 5]], [buf[i + 6], buf[i + 7], buf[i + 8]]];
        out.push({ vs, pl: M.planeOf(vs) });
    }
    return out;
}
const volBuf = (buf) => M.volume(polysFromBuf(buf));
function boolSubtract(buf, blobPolys, opts) {
    const b = M.toTriangleBuffer(blobPolys);
    return meshBoolean(buf, new MeshBVH(buf), b, new MeshBVH(b), "subtract", opts);
}
function bspChain(S) {
    let P = WALL(S); const vols = []; let ms = 0;
    for (let k = 1; k <= SHOTS; k++) {
        const t = now();
        P = M.blast(P, BLOB(k, S), { select: M.bvhSelect(P).select }).polys;
        ms += now() - t; vols.push(M.volume(P));
    }
    return { polys: P, vols, ms };
}
function boolChain(S, shots = SHOTS, opts) {
    let buf = M.toTriangleBuffer(WALL(S)); const vols = []; let ms = 0, capped = false, amb = 0, unresolved = 0;
    let classifications = 0, arranged = 0; const refusals = {};
    for (let k = 1; k <= shots; k++) {
        const t = now();
        const r = boolSubtract(buf, BLOB(k, S), opts);
        ms += now() - t;
        buf = r.tris; vols.push(volBuf(buf));
        capped = capped || r.stats.a.capped || r.stats.b.capped;
        amb += r.ambiguousTriIndices.length;
        unresolved += r.stats.a.unresolvedCount + r.stats.b.unresolvedCount;
        for (const st of [r.stats.a, r.stats.b]) {
            classifications += st.classifications; arranged += st.arrangedTriangles;
            for (const [why, n] of Object.entries(st.arrangementRefusals)) refusals[why] = (refusals[why] || 0) + n;
        }
    }
    return { buf, vols, ms, capped, amb, unresolved, classifications, arranged, refusals };
}

// =============================================================================================================
console.log("\n1. *** ONE BLAST, PLANE-CUT PATH: ROUND 6 WAS WRONG HERE, ROUND 7 IS EXACT, AND WHY ***");
{
    const A = WALL(), B = SINGLE_BLOB();
    let t = now(); const bsp = M.subtract(A, B); const bspMs = now() - t;
    const oracle = M.volume(M.settle(bsp).polys);
    const bufA = M.toTriangleBuffer(A), bufB = M.toTriangleBuffer(B);
    const bvhA = new MeshBVH(bufA), bvhB = new MeshBVH(bufB);

    // Round 9: this section is the PLANE-CUT path's history (round 6's cap, round 7's gate), so every call pins
    // it -- the default is now the arrangement, which section 8 checks against the same BSP volume directly.
    t = now(); const g = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { arrangement: false }); const gMs = now() - t;
    const gVol = volBuf(g.tris);
    ok("!! *** GATED PLANE-CUT meshBoolean (round 7's default) MATCHES THE BSP VOLUME ON meshCSG's OWN SINGLE-BLAST FIXTURE ***",
        Math.abs(gVol - oracle) < 1e-9 && !g.stats.a.capped && !g.stats.b.capped,
        "volume " + gVol + " vs BSP " + oracle + " (diff " + (gVol - oracle).toExponential(2) + "), capped=" +
        g.stats.a.capped + "/" + g.stats.b.capped);
    ok("   ...and the gate actually did the work: it declined far more (fragment, plane) offers than it cut",
        g.stats.a.gateSkipped > 10 * g.stats.a.gateTested,
        "wall side gateSkipped=" + g.stats.a.gateSkipped + " gateTested=" + g.stats.a.gateTested);

    // Round 6's path exactly: ungated AND triFragmentAccumulate.mjs's own default cap of 256 (meshBoolean's own
    // default cap is now MESH_BOOLEAN_MAX_FRAGMENTS -- the first draft of this check passed only
    // gateByIntersection:false, silently got the new cap, and went red for reproducing nothing).
    const r6 = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { arrangement: false, accOpts: { gateByIntersection: false, maxFragments: 256 } });
    const r6Vol = volBuf(r6.tris);
    ok("!! *** ROUND 6's UNGATED PATH, REPRODUCED: HITS THE DEFAULT CAP AND COMES BACK MATERIALLY WRONG ***",
        r6.stats.a.capped === true && Math.abs(r6Vol - oracle) > 0.1,
        "capped=" + r6.stats.a.capped + ", volume " + r6Vol + " vs " + oracle + " -- off by " +
        (r6Vol - oracle).toFixed(4) + " (" + (100 * (r6Vol - oracle) / oracle).toFixed(2) + "%), measured 0.2012 at round 7");

    t = now();
    const r6u = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { arrangement: false, accOpts: { gateByIntersection: false, maxFragments: 1e6 } });
    const r6uMs = now() - t;
    const r6uVol = volBuf(r6u.tris);
    ok("!! ...and UNCAPPED it is exact but manufactures the full plane arrangement -- over 20x the triangles",
        !r6u.stats.a.capped && Math.abs(r6uVol - oracle) < 1e-9 && r6u.triCount > 20 * g.triCount,
        "ungated uncapped " + r6u.triCount + " triangles vs gated " + g.triCount + " (measured 18,129 vs 473), volume diff " +
        (r6uVol - oracle).toExponential(2));
    const bspTris = M.toTriangles(bsp).length;
    ok("   gated meshBoolean emits fewer triangles than the BSP for the same blast",
        g.triCount < bspTris, "gated " + g.triCount + " vs BSP " + bsp.length + " polygons = " + bspTris + " triangles");
    info("timings (printed, not asserted): BSP subtract " + bspMs.toFixed(1) + " ms; gated plane-cut meshBoolean " + gMs.toFixed(1) +
         " ms; ungated uncapped " + r6uMs.toFixed(1) + " ms");
}

// =============================================================================================================
console.log("\n2. *** TWELVE CHAINED BLASTS, meshCSG's OWN STRESS CASE ***");
const B1 = bspChain(1), G1 = boolChain(1);
{
    let worst = 0, worstK = -1;
    for (let k = 0; k < SHOTS; k++) {
        const d = Math.abs(G1.vols[k] - B1.vols[k]);
        if (d > worst) { worst = d; worstK = k + 1; }
    }
    ok("!! every one of twelve chained shots agrees with the BSP's volume to 1e-6 (section 3 says which one is right)",
        worst < 1e-6, "worst |diff| " + worst.toExponential(2) + " at shot " + worstK + " of volumes ~" + B1.vols[SHOTS - 1].toFixed(3));
    ok("!! the chain never hit the fragment cap and never produced an ambiguous or unresolved fragment",
        !G1.capped && G1.amb === 0 && G1.unresolved === 0,
        "capped=" + G1.capped + " ambiguous=" + G1.amb + " unresolved=" + G1.unresolved);
    const bspTris = M.toTriangles(B1.polys).length, gTris = G1.buf.length / 9;
    ok("!! twelve blasts in, meshBoolean's wall is under half the BSP's triangle count",
        gTris * 2 < bspTris, "meshBoolean " + gTris + " triangles vs BSP " + B1.polys.length + " polygons = " + bspTris + " triangles");
    info("timings (printed, not asserted): BSP localised blast() x12 " + B1.ms.toFixed(0) + " ms; meshBoolean x12 " +
         G1.ms.toFixed(0) + " ms (each shot rebuilds both BVHs from scratch -- no incremental refit)");
}

// =============================================================================================================
console.log("\n3. *** WHERE THEY DISAGREE AT 1x, THE 1000x RUN SAYS WHO IS RIGHT ***");
{
    const S = 1000, S3 = S * S * S;
    const B1000 = bspChain(S), G1000 = boolChain(S);
    let agree1000 = 0, gVsTruth = 0, bVsTruth = 0, bWorstK = -1;
    for (let k = 0; k < SHOTS; k++) {
        const truth = G1000.vols[k] / S3;
        agree1000 = Math.max(agree1000, Math.abs(G1000.vols[k] - B1000.vols[k]) / G1000.vols[k]);
        gVsTruth = Math.max(gVsTruth, Math.abs(G1.vols[k] - truth) / truth);
        const b = Math.abs(B1.vols[k] - truth) / truth;
        if (b > bVsTruth) { bVsTruth = b; bWorstK = k + 1; }
    }
    // The reference is meshBoolean's OWN 1000x run; only the agreement check below ties it to the BSP, and that
    // agreement (two structurally different algorithms, at a scale where every absolute tolerance in either is a
    // million times smaller relatively) is what licenses calling it the reference.
    ok("!! at 1000x scale the two methods agree to 1e-11 relative on every shot -- that value is the reference",
        agree1000 < 1e-11, "worst relative disagreement at 1000x " + agree1000.toExponential(2));
    // Threshold from measurement: 8.4e-13 once the fixture scales exactly (see WALL/BLOB above -- the first
    // draft's 3.34e-12 was jaggedBlob's absolute pole offset, not meshBoolean).
    ok("!! *** meshBoolean at 1x matches the 1000x reference to 1e-11 relative on every shot ***",
        gVsTruth < 1e-11, "worst " + gVsTruth.toExponential(2));
    info("MEASURED, not asserted (it is meshCSG.mjs's number, not this file's): the BSP at 1x departs from the same " +
         "reference by up to " + bVsTruth.toExponential(2) + " relative (shot " + bWorstK + "). The round-7 review " +
         "confirmed the cause on a COPY of meshCSG.mjs: EPS=1e-5 -> 5.7e-9, EPS=1e-6 -> 3.3e-12 (the fixture floor " +
         "of that run). That is why section 2's agreement is 1e-6 rather than 1e-12");
}

// =============================================================================================================
console.log("\n4. *** A MEMBERSHIP ORACLE THAT NEVER READS EITHER RESULT MESH ***");
{
    const blobBVH = [];
    for (let k = 1; k <= SHOTS; k++) blobBVH.push(new MeshBVH(M.toTriangleBuffer(BLOB(k))));
    const inWall = (p) => Math.abs(p[0]) < 4 && Math.abs(p[1]) < 3 && Math.abs(p[2]) < 0.3;
    const truth = (p) => inWall(p) && !blobBVH.some((b) => pointInMesh(b, p[0], p[1], p[2]).inside);
    const gBVH = new MeshBVH(G1.buf), bBVH = new MeshBVH(M.toTriangleBuffer(B1.polys));
    let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let n = 0, inside = 0, gBad = 0, bBad = 0;
    for (let i = 0; i < 8000; i++) {
        const p = [(rnd() * 2 - 1) * 4.2, (rnd() * 2 - 1) * 3.2, (rnd() * 2 - 1) * 0.4];
        const t = truth(p); n++; if (t) inside++;
        if (pointInMesh(gBVH, ...p).inside !== t) gBad++;
        if (pointInMesh(bBVH, ...p).inside !== t) bBad++;
    }
    ok("!! 8000 uniform points: meshBoolean's twelve-blast wall agrees with the membership oracle on every one",
        gBad === 0 && inside > 1000 && inside < n - 1000,
        "mismatches " + gBad + " of " + n + " (" + inside + " truly inside); BSP " + bBad);
    // Near-surface: 1e-4 from each blob facet's centroid, where a hole in the wrong place would show.
    let m = 0, gNear = 0, bNear = 0, mIn = 0;
    for (let k = 1; k <= SHOTS; k++) {
        const b = M.toTriangleBuffer(BLOB(k));
        for (let i = 0; i < b.length; i += 9) for (let j = 0; j < 2; j++) {
            const c = [(b[i] + b[i + 3] + b[i + 6]) / 3, (b[i + 1] + b[i + 4] + b[i + 7]) / 3, (b[i + 2] + b[i + 5] + b[i + 8]) / 3];
            const p = [c[0] + (rnd() * 2 - 1) * 1e-4, c[1] + (rnd() * 2 - 1) * 1e-4, c[2] + (rnd() * 2 - 1) * 1e-4];
            const t = truth(p); m++; if (t) mIn++;
            if (pointInMesh(gBVH, ...p).inside !== t) gNear++;
            if (pointInMesh(bBVH, ...p).inside !== t) bNear++;
        }
    }
    // Non-vacuity floor added after the round-7 review: a near-surface check whose points are nearly all
    // outside the result could pass a mesh with the holes missing. Measured 510 truly inside of 5376.
    ok("!! " + m + " points within 1e-4 of a blob facet: meshBoolean agrees on every one",
        gNear === 0 && mIn > 200 && mIn < m - 200, "mismatches " + gNear + " of " + m + " (" + mIn + " truly inside); BSP " + bNear);
}

// =============================================================================================================
console.log("\n5. *** THE MANIFOLD HALF OF THE QUESTION: AFTER meshCSG's OWN settle(), WHO IS WATERTIGHT ***");
{
    const rawG = M.watertight(polysFromBuf(G1.buf));
    let t = now(); const sg = M.settle(polysFromBuf(G1.buf)); const sgMs = now() - t;
    t = now(); const sb = M.settle(B1.polys); const sbMs = now() - t;
    const wg = M.watertight(sg.polys), wb = M.watertight(sb.polys);
    ok("!! *** meshBoolean's twelve-blast wall, through meshCSG's own settle(), is WATERTIGHT: zero unmatched edges ***",
        wg.ok && wg.unmatched === 0, "unmatched " + wg.unmatched + " of " + wg.edges + " (raw, before settle: " +
        rawG.unmatched + " -- T-junctions, which settle's merge + weld together close; the weld alone does not)");
    // settle() moves meshBoolean's solid. At round 7 (the plane-cut path, still reproduced in section 8) by 2.9e-8,
    // all of it mergeCoplanar()'s -- traced step by step: snap 4.4e-11, merge 2.88e-8, weld +0; the first draft
    // asserted 1e-9 and went red. Since round 9 the default path builds this solid, and settle moves it by
    // -6.7e-11 (rebuild's measurement). The bound here is meshCSG-selfcheck.mjs section 5's OWN settle-volume
    // contract (1e-6), applied to both inputs alike, and the merge is still load-bearing for the watertight claim
    // above: weld alone, with no merge, leaves unmatched edges -- 4 at round 7, 3 on the default path since round
    // 9 -- printed below, measured live. (A round-9 review found these comments still quoting round 7's numbers.)
    const dv = M.volume(sg.polys) - G1.vols[SHOTS - 1];
    ok("   ...and settle moved its solid by less than meshCSG's own settle contract (1e-6)", Math.abs(dv) < 1e-6,
        "moved " + dv.toExponential(2) + " (" + M.volume(sg.polys) + " vs " + G1.vols[SHOTS - 1] + ")");
    const weldOnly = M.watertight(M.weldTJunctions(M.snapVertices(polysFromBuf(G1.buf), { tol: 1e-9 }).polys).polys);
    info("weld WITHOUT settle's coplanar merge leaves " + weldOnly.unmatched + " unmatched edges (4 at round 7, 3 since round 9) -- " +
         "the zero above needs settle() whole");
    info("MEASURED, not asserted here (meshCSG-selfcheck.mjs section 5 asserts it, as 'cause unknown'): the BSP's own " +
         "twelve-blast wall through the SAME settle() keeps " + wb.unmatched + " unmatched edges of " + wb.edges +
         ". *** THE CAUSE IS KNOWN NOW, AND IT NARROWS THIS SECTION'S CLAIM: *** the round-7 review ran the same chain on " +
         "a COPY of meshCSG.mjs with only EPS changed -- 1e-5: 15 unmatched; 1e-6, 1e-7, 1e-8: 0. So meshBoolean's zero " +
         "above beats meshCSG AT ITS CURRENT CONSTANT, not the BSP method. And both results depend on scale: settle()'s " +
         "snap/merge/weld tolerances are absolute, and at 0.001x the same review measured 1,455 unmatched (meshBoolean) " +
         "vs 4,001 (BSP) after settle -- watertight here means watertight at THIS scale. settle() timings: meshBoolean's " +
         "wall " + sgMs.toFixed(0) + " ms, BSP's " + sbMs.toFixed(0) + " ms");
}

// =============================================================================================================
console.log("\n6. *** MILLIMETRE SCALE: THE REGIME meshCSG's OWN HEADER CALLS REAL ***");
{
    // meshCSG.mjs and triTriIntersect.mjs both name millimetre-scale meshes as expected input. Four chained
    // shots at 0.001x, against the section-3 reference scaled down.
    const S = 0.001, S3 = S * S * S, N = 4;
    const Gmm = boolChain(S, N), Bmm = { vols: [] };
    let P = WALL(S);
    for (let k = 1; k <= N; k++) { P = M.blast(P, BLOB(k, S), { select: M.bvhSelect(P).select }).polys; Bmm.vols.push(M.volume(P)); }
    const ref = boolChain(1000, N).vols.map((v) => v / 1e9);
    let gWorst = 0, bWorst = 0;
    for (let k = 0; k < N; k++) {
        gWorst = Math.max(gWorst, Math.abs(Gmm.vols[k] / S3 - ref[k]) / ref[k]);
        bWorst = Math.max(bWorst, Math.abs(Bmm.vols[k] / S3 - ref[k]) / ref[k]);
    }
    // Was "within 1e-8" at a measured 2.07e-9 -- all of it jaggedBlob's unscaled pole offset (see WALL/BLOB).
    ok("!! at 0.001x meshBoolean stays within 1e-12 relative of the reference on four chained shots",
        gWorst < 1e-12 && !Gmm.capped, "worst " + gWorst.toExponential(2) + ", capped=" + Gmm.capped);
    info("MEASURED, not asserted (meshCSG.mjs's number): the BSP at 0.001x departs by up to " + bWorst.toExponential(2) +
         " relative -- EPS=1e-5 is 1% of a millimetre-scale blob's own facet size. meshBoolean has absolute " +
         "tolerances of its own (1e-9 plane dedup, triClip's EPS): the round-7 reviews measured it failing too below " +
         "~1e-4 scale -- up to 34% of volume at 1e-6..7e-5, on the gated and ungated paths alike");
}

// =============================================================================================================
console.log("\n7. *** ROUND 8: THE SPATIAL INDEX CHANGES WHO IS ASKED, NOT WHAT IS CUT -- END TO END ***");
{
    // triFragmentAccumulate-selfcheck.mjs section 15 holds the index to the plain loop per triangle. This holds it
    // through meshBoolean() on a blast four times the one above (subdiv 16, 960 blob triangles): the whole output
    // buffer, compared float by float, and the index's work against the plain loop's scan.
    const A = M.toTriangleBuffer(WALL()), B = M.toTriangleBuffer(M.jaggedBlob([0, 0, 0], 1.0, 16, 12345));
    const bA = new MeshBVH(A), bB = new MeshBVH(B);
    // Round 9: the index lives in the plane-cut path; both runs pin it (the default would arrange these triangles).
    let t = now(); const ix = meshBoolean(A, bA, B, bB, "subtract", { arrangement: false }); const ixMs = now() - t;
    t = now(); const pl = meshBoolean(A, bA, B, bB, "subtract", { arrangement: false, accOpts: { spatialIndex: false } }); const plMs = now() - t;
    let same = ix.tris.length === pl.tris.length;
    for (let i = 0; same && i < ix.tris.length; i++) if (ix.tris[i] !== pl.tris[i]) same = false;
    ok("!! indexed and plain-loop meshBoolean produce the SAME output buffer, float for float (subdiv-16 blast)",
        same && ix.triCount > 1000 && JSON.stringify(ix.ambiguousTriIndices) === JSON.stringify(pl.ambiguousTriIndices),
        ix.triCount + " triangles each; buffers " + (same ? "identical" : "DIFFER"));
    // CORRECTED AFTER AN ADVERSARIAL REVIEW: the first version compared index candidates with gateSkipped +
    // gateTested, which counts plane groups the prefilter drops wholesale as work the plain loop never does
    // (79,250 "offers" of which 37,608 were real). `examined` counts the same thing on both paths.
    // Threshold from measurement: 19,083 vs 37,608 (1.97x) at this size, with triangles of 16 planes or fewer left
    // to the plain loop by INDEX_MIN_PLANES. The first draft of this line asserted 2x and went red at 1.97x.
    ok("   ...and the index examined well under the plain loop's fragment count (>1.5x fewer)",
        ix.stats.a.examined * 1.5 < pl.stats.a.examined,
        "index examined " + ix.stats.a.examined + " vs plain loop " + pl.stats.a.examined);
    info("timings (printed, not asserted): indexed " + ixMs.toFixed(0) + " ms, plain loop " + plMs.toFixed(0) + " ms. " +
         "Round 8, same machine, paired, one blast, wall minus jaggedBlob subdiv n (round 7 / box precondition only / " +
         "+ index): n=48 3.29 / 2.53 / 2.35 s, n=64 10.7 / 7.85 / 7.08 s -- the precondition is most of it. See " +
         "triFragmentAccumulate.mjs's ROUND 8 paragraph for why neither is the whole scaling fix");
}

// =============================================================================================================
console.log("\n8. *** ROUND 9: SEGMENT-BOUNDED CUTTING (THE DEFAULT) AGAINST THE PLANE-CUT PATH IT REPLACES ***");
{
    // One blast at two densities, then the twelve-blast chain, each both ways. The volumes must agree. The
    // arrangement must refuse NOTHING here: a refused triangle silently goes back to the plane-cut path and still
    // gets the right volume, so agreement alone cannot see the arrangement stop working. And it must do what it
    // was built for -- far fewer classifications, and fewer output triangles.
    const sumRefusals = (into, r) => { for (const st of [r.stats.a, r.stats.b]) for (const [why, n] of Object.entries(st.arrangementRefusals)) into[why] = (into[why] || 0) + n; };
    const cls = (r) => r.stats.a.classifications + r.stats.b.classifications;
    let worstSingle = 0, fewer = true, arrangedSingle = 0, defaultVol8 = NaN;
    const singleRefusals = {}, rows = [];
    for (const sub of [8, 32]) {
        const A = M.toTriangleBuffer(WALL()), B = M.toTriangleBuffer(M.jaggedBlob([0, 0, 0], 1.0, sub, 12345));
        const bA = new MeshBVH(A), bB = new MeshBVH(B);
        let t = now(); const ar = meshBoolean(A, bA, B, bB, "subtract"); const arMs = now() - t;
        t = now(); const pl = meshBoolean(A, bA, B, bB, "subtract", { arrangement: false }); const plMs = now() - t;
        const va = volBuf(ar.tris);
        if (sub === 8) defaultVol8 = va;
        worstSingle = Math.max(worstSingle, Math.abs(va - volBuf(pl.tris)));
        sumRefusals(singleRefusals, ar);
        arrangedSingle += ar.stats.a.arrangedTriangles + ar.stats.b.arrangedTriangles;
        if (!(cls(ar) * 2 < cls(pl) && ar.triCount < pl.triCount)) fewer = false;
        rows.push("subdiv " + sub + ": classifications " + cls(ar) + " vs " + cls(pl) + ", triangles " + ar.triCount + " vs " +
                  pl.triCount + ", " + arMs.toFixed(0) + " vs " + plMs.toFixed(0) + " ms");
    }
    ok("!! one blast at subdiv 8 and 32: arrangement and plane-cut path agree to 1e-12, nothing refused, under half the classifications",
        worstSingle < 1e-12 && Object.keys(singleRefusals).length === 0 && arrangedSingle > 0 && fewer,
        "worst |dV| " + worstSingle.toExponential(2) + ", refusals " + JSON.stringify(singleRefusals) + "; " + rows.join("; ") +
        " (measured 330 vs 952 and 4,749 vs 12,824 classifications)");
    // Section 1 checks the PLANE-CUT path against the BSP; the review asked for the default to be checked against
    // it directly too, not only through the chain's agreement.
    const oracle = M.volume(M.settle(M.subtract(WALL(), SINGLE_BLOB())).polys);
    ok("!! *** DEFAULT (ARRANGEMENT) meshBoolean MATCHES THE BSP VOLUME ON meshCSG's OWN SINGLE-BLAST FIXTURE ***",
        Math.abs(defaultVol8 - oracle) < 1e-9, "volume " + defaultVol8 + " vs BSP " + oracle + " (diff " + (defaultVol8 - oracle).toExponential(2) + ")");

    // The chain: G1 (section 2) is the default path; the plane-cut path's own chain beside it.
    const P1 = boolChain(1, SHOTS, { arrangement: false });
    let worstChain = 0;
    for (let k = 0; k < SHOTS; k++) worstChain = Math.max(worstChain, Math.abs(G1.vols[k] - P1.vols[k]));
    ok("!! twelve chained blasts: the arrangement refused NOTHING, and every shot's volume matches the plane-cut chain to 1e-9",
        Object.keys(G1.refusals).length === 0 && G1.arranged > 0 && worstChain < 1e-9,
        "refusals " + JSON.stringify(G1.refusals) + ", " + G1.arranged + " triangles arranged, worst |dV| " + worstChain.toExponential(2) +
        " (the rebuild's first run refused 7 here as 'face area sum' -- sub-TOL boundary strips -- see triArrangement.mjs)");
    const rawA = M.watertight(polysFromBuf(G1.buf)), rawP = M.watertight(polysFromBuf(P1.buf));
    ok("!! ...with fewer output triangles, under two-thirds the classifications, and under a quarter the raw unmatched edges",
        G1.buf.length < P1.buf.length && G1.classifications * 1.5 < P1.classifications && rawA.unmatched * 4 < rawP.unmatched,
        "triangles " + G1.buf.length / 9 + " vs " + P1.buf.length / 9 + ", classifications " + G1.classifications + " vs " +
        P1.classifications + ", raw unmatched " + rawA.unmatched + "/" + rawA.edges + " vs " + rawP.unmatched + "/" + rawP.edges);
    const sA = M.settle(polysFromBuf(G1.buf)), sP = M.settle(polysFromBuf(P1.buf));
    const shiftA = M.volume(sA.polys) - G1.vols[SHOTS - 1], shiftP = M.volume(sP.polys) - P1.vols[SHOTS - 1];
    ok("!! ...and settle() closes both, moving the arrangement's solid far less than the plane-cut path's",
        M.watertight(sA.polys).unmatched === 0 && M.watertight(sP.polys).unmatched === 0 && Math.abs(shiftA) * 100 < Math.abs(shiftP),
        "settle shift " + shiftA.toExponential(2) + " vs " + shiftP.toExponential(2) + " (measured -6.7e-11 vs 2.88e-8)");
    info("timings (printed, not asserted): twelve-blast chain " + G1.ms.toFixed(0) + " ms default vs " + P1.ms.toFixed(0) +
         " ms plane-cut. The scaling sweep (wall minus jaggedBlob subdiv n, one blast) is in meshBoolean.mjs's ROUND 9 paragraph");
}

console.log(`\nmeshBooleanBlast-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: ONE workload family (a box wall, 224-triangle jagged blobs, subtract " +
    "only) -- the round-7 integration review ran union/intersect on wall-vs-blob and blob-vs-blob by hand (12 of 12 " +
    "within 7.7e-11 of their own 1000x runs) but no gate does; ON SPEED, round 7's review measured the plane-cut path 7x " +
    "slower than the BSP at a 16,128-triangle blob and capped at 65,024, and round 8 only trimmed that; ROUND 9's " +
    "arrangement default is about 4-9x FASTER than the BSP from subdiv 48 to 128 in warm runs (2x as a cold first run " +
    "at 48; n=128 1.3 s vs 10.9 s, exact where the plane-cut path takes 137 s, caps and is 6.6e-3 wrong) -- but those " +
    "are the sweep in meshBoolean.mjs's header, measured outside this gate on ONE workload family, and any triangle the " +
    "arrangement refuses still pays the plane-cut path's cost; the watertight win in section 5 is over meshCSG's current EPS and at 1x only; meshBoolean's " +
    "raw output is NOT watertight without meshCSG's settle() and this round adds no weld of its own; each shot rebuilds " +
    "both BVHs from scratch; below ~1e-4 scale meshBoolean is wrong too (its own absolute tolerances); the touching-" +
    "contact, degenerate-operand, near-flush-tilt and near-identical-rotated-operand gaps meshBoolean.mjs's header " +
    "names are untouched by the gate; and timings are printed for one machine, never asserted.");
process.exit(fails ? 1 : 0);
