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
// A PROCESS MISTAKE, DISCLOSED: the first runner had no `finally`; S1 timed out on this gate and the crash left
// triFragmentAccumulate.mjs sabotaged on disk. Caught by an md5 check before anything else ran; restored.
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
function boolChain(S, shots = SHOTS) {
    let buf = M.toTriangleBuffer(WALL(S)); const vols = []; let ms = 0, capped = false, amb = 0, unresolved = 0;
    for (let k = 1; k <= shots; k++) {
        const t = now();
        const r = boolSubtract(buf, BLOB(k, S));
        ms += now() - t;
        buf = r.tris; vols.push(volBuf(buf));
        capped = capped || r.stats.a.capped || r.stats.b.capped;
        amb += r.ambiguousTriIndices.length;
        unresolved += r.stats.a.unresolvedCount + r.stats.b.unresolvedCount;
    }
    return { buf, vols, ms, capped, amb, unresolved };
}

// =============================================================================================================
console.log("\n1. *** ONE BLAST: ROUND 6 WAS WRONG HERE, ROUND 7 IS EXACT, AND WHY ***");
{
    const A = WALL(), B = SINGLE_BLOB();
    let t = now(); const bsp = M.subtract(A, B); const bspMs = now() - t;
    const oracle = M.volume(M.settle(bsp).polys);
    const bufA = M.toTriangleBuffer(A), bufB = M.toTriangleBuffer(B);
    const bvhA = new MeshBVH(bufA), bvhB = new MeshBVH(bufB);

    t = now(); const g = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract"); const gMs = now() - t;
    const gVol = volBuf(g.tris);
    ok("!! *** DEFAULT (GATED) meshBoolean MATCHES THE BSP VOLUME ON meshCSG's OWN SINGLE-BLAST FIXTURE ***",
        Math.abs(gVol - oracle) < 1e-9 && !g.stats.a.capped && !g.stats.b.capped,
        "volume " + gVol + " vs BSP " + oracle + " (diff " + (gVol - oracle).toExponential(2) + "), capped=" +
        g.stats.a.capped + "/" + g.stats.b.capped);
    ok("   ...and the gate actually did the work: it declined far more (fragment, plane) offers than it cut",
        g.stats.a.gateSkipped > 10 * g.stats.a.gateTested,
        "wall side gateSkipped=" + g.stats.a.gateSkipped + " gateTested=" + g.stats.a.gateTested);

    // Round 6's path exactly: ungated AND triFragmentAccumulate.mjs's own default cap of 256 (meshBoolean's own
    // default cap is now MESH_BOOLEAN_MAX_FRAGMENTS -- the first draft of this check passed only
    // gateByIntersection:false, silently got the new cap, and went red for reproducing nothing).
    const r6 = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { accOpts: { gateByIntersection: false, maxFragments: 256 } });
    const r6Vol = volBuf(r6.tris);
    ok("!! *** ROUND 6's UNGATED PATH, REPRODUCED: HITS THE DEFAULT CAP AND COMES BACK MATERIALLY WRONG ***",
        r6.stats.a.capped === true && Math.abs(r6Vol - oracle) > 0.1,
        "capped=" + r6.stats.a.capped + ", volume " + r6Vol + " vs " + oracle + " -- off by " +
        (r6Vol - oracle).toFixed(4) + " (" + (100 * (r6Vol - oracle) / oracle).toFixed(2) + "%), measured 0.2012 at round 7");

    t = now();
    const r6u = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { accOpts: { gateByIntersection: false, maxFragments: 1e6 } });
    const r6uMs = now() - t;
    const r6uVol = volBuf(r6u.tris);
    ok("!! ...and UNCAPPED it is exact but manufactures the full plane arrangement -- over 20x the triangles",
        !r6u.stats.a.capped && Math.abs(r6uVol - oracle) < 1e-9 && r6u.triCount > 20 * g.triCount,
        "ungated uncapped " + r6u.triCount + " triangles vs gated " + g.triCount + " (measured 18,129 vs 473), volume diff " +
        (r6uVol - oracle).toExponential(2));
    const bspTris = M.toTriangles(bsp).length;
    ok("   gated meshBoolean emits fewer triangles than the BSP for the same blast",
        g.triCount < bspTris, "gated " + g.triCount + " vs BSP " + bsp.length + " polygons = " + bspTris + " triangles");
    info("timings (printed, not asserted): BSP subtract " + bspMs.toFixed(1) + " ms; gated meshBoolean " + gMs.toFixed(1) +
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
    // settle() DOES move meshBoolean's solid, by 2.9e-8 (1.4e-9 relative), and all of it is mergeCoplanar()'s --
    // traced step by step at round 7: snap 4.4e-11, merge 2.88e-8, weld +0. The first draft asserted 1e-9 and
    // went red. The bound here is meshCSG-selfcheck.mjs section 5's OWN settle-volume contract (1e-6), applied
    // to both inputs alike, and the merge is load-bearing for the watertight claim above: weld alone, with no
    // merge, leaves 4 unmatched edges -- printed below, measured live.
    const dv = M.volume(sg.polys) - G1.vols[SHOTS - 1];
    ok("   ...and settle moved its solid by less than meshCSG's own settle contract (1e-6)", Math.abs(dv) < 1e-6,
        "moved " + dv.toExponential(2) + " (" + M.volume(sg.polys) + " vs " + G1.vols[SHOTS - 1] + ")");
    const weldOnly = M.watertight(M.weldTJunctions(M.snapVertices(polysFromBuf(G1.buf), { tol: 1e-9 }).polys).polys);
    info("weld WITHOUT settle's coplanar merge leaves " + weldOnly.unmatched + " unmatched edges (measured 4 at round 7) -- " +
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

console.log(`\nmeshBooleanBlast-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: ONE workload family (a box wall, 224-triangle jagged blobs, subtract " +
    "only) -- the round-7 integration review ran union/intersect on wall-vs-blob and blob-vs-blob by hand (12 of 12 " +
    "within 7.7e-11 of their own 1000x runs) but no gate does; THIS WORKLOAD FLATTERS meshBoolean ON SPEED: the same " +
    "review measured it 7x slower than the BSP at a 16,128-triangle blob and 7.1 minutes, capped, at 65,024 (no " +
    "per-triangle fragment index -- see triFragmentAccumulate.mjs), so 'faster than the BSP' holds for inputs this " +
    "size, not in general; the watertight win in section 5 is over meshCSG's current EPS and at 1x only; meshBoolean's " +
    "raw output is NOT watertight without meshCSG's settle() and this round adds no weld of its own; each shot rebuilds " +
    "both BVHs from scratch; below ~1e-4 scale meshBoolean is wrong too (its own absolute tolerances); the touching-" +
    "contact, degenerate-operand, near-flush-tilt and near-identical-rotated-operand gaps meshBoolean.mjs's header " +
    "names are untouched by the gate; and timings are printed for one machine, never asserted.");
process.exit(fails ? 1 : 0);
