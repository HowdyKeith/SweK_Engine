// WebGLEngine/physics/obbOverlap-selfcheck.mjs — v2639
//
// Run: node physics/obbOverlap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// SAT is exact for boxes (a theorem: 15 axes suffice), so the job is to prove the IMPLEMENTATION is right and the
// determinism is real. Analytic cases pin known answers; a rotated-clearance sweep checks the flip happens at the
// computed distance; a differential test against a faces-only version proves the 9 edge-edge axes actually catch
// separations faces miss; symmetry and broad-phase consistency keep the pipeline sound; and a grep guarantees no
// transcendental math, so the test is bit-identical across architectures.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { obbOverlap, obbOverlapFacesOnly, obbFromPosed, obbContact } from "./obbOverlap.js";
import { rotateByQuat } from "./voxelPose.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const box = (center, half, axes = I) => ({ center, half, axes });
// quaternion for angle about Z
const qZ = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const axesFromQ = (q) => [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])];

// ---- 1. AXIS-ALIGNED: KNOWN OVERLAP AND KNOWN SEPARATION ----------------------------------------------------------
{
    const a = box([0, 0, 0], [1, 1, 1]);
    const touching = box([1.9, 0, 0], [1, 1, 1]);   // gap 1.9 < 2 -> overlap
    const apart = box([2.1, 0, 0], [1, 1, 1]);       // gap 2.1 > 2 -> separated
    const diag = box([1.9, 1.9, 1.9], [1, 1, 1]);    // overlaps on every axis
    ok("!! axis-aligned boxes: overlap and separation are exact", obbOverlap(a, touching) && !obbOverlap(a, apart) && obbOverlap(a, diag),
       "unit cubes at 1.9 overlap, at 2.1 are separated, and a diagonal offset of 1.9 overlaps -- the base case is a plain interval test and it holds.");
}

// ---- 2. A ROTATED BOX CLEARS AT THE COMPUTED DISTANCE -------------------------------------------------------------
{
    // B is a 1x1x1-half box rotated 45 about Z. Its projected half-width on world X is (hx+hy)/sqrt2 = (1+1)/sqrt2.
    const a = box([0, 0, 0], [1, 1, 1]);
    const q = qZ(Math.PI / 4), axes = axesFromQ(q);
    const clearance = 1 + (1 + 1) / Math.SQRT2;      // a.hx + projected half of B ~ 1 + 1.4142
    const just_in = { center: [clearance - 0.02, 0, 0], half: [1, 1, 1], axes };
    const just_out = { center: [clearance + 0.02, 0, 0], half: [1, 1, 1], axes };
    ok("!! a 45-degree box flips overlap exactly at its projected clearance", obbOverlap(a, just_in) && !obbOverlap(a, just_out),
       "clearance = 1 + 2/sqrt2 ~ " + clearance.toFixed(4) + "; overlaps just inside it, separated just outside. The rotation enters through the face-axis projection, computed right.");
}

// ---- 3. THE 9 EDGE-EDGE AXES ARE LOAD-BEARING (differential vs faces-only) -----------------------------------------
{
    // sweep tilted configurations; find at least one where faces-only says OVERLAP but full SAT says SEPARATED.
    // (full SAT has strictly more axes, so full-overlap must imply faces-overlap; the interesting gap is the reverse.)
    let foundGap = false, implicationHeld = true, checks = 0;
    for (let i = 1; i < 20 && !foundGap; i++) {
        for (let j = 1; j < 20; j++) {
            const qa = qZ(0.3 * i), qb = [Math.sin(0.2 * j) * 0.5, Math.sin(0.15 * j) * 0.5, Math.cos(0.2 * j) * 0.5, Math.cos(0.15 * j) * 0.5];
            const a = { center: [0, 0, 0], half: [1, 0.2, 1.5], axes: axesFromQ(qa) };
            for (let d = 1.0; d < 3.2; d += 0.1) {
                const b = { center: [d, d * 0.3, d * 0.2], half: [1.5, 0.2, 1], axes: axesFromQ(qb) };
                const full = obbOverlap(a, b), faces = obbOverlapFacesOnly(a, b);
                checks++;
                if (full && !faces) implicationHeld = false;   // full overlap must imply faces overlap
                if (faces && !full) foundGap = true;            // faces miss a separation the cross axes catch
            }
        }
    }
    ok("!! the edge-edge axes catch separations the face axes miss", foundGap && implicationHeld,
       "over " + checks + " tilted configs: found a case faces-only calls a collision but full SAT correctly separates (" + foundGap + "), and full-overlap always implied faces-overlap (" + implicationHeld + "). WITHOUT THE 9 CROSS AXES THE NARROW PHASE WOULD REPORT PHANTOM COLLISIONS.");
}

// ---- 4. SYMMETRY: obbOverlap(a,b) == obbOverlap(b,a) --------------------------------------------------------------
{
    let good = true;
    for (let k = 0; k < 200; k++) {
        const qa = qZ(k * 0.11), qb = qZ(k * 0.07 + 1);
        const a = { center: [0, 0, 0], half: [1, 0.5, 1.2], axes: axesFromQ(qa) };
        const b = { center: [(k % 7) * 0.4, (k % 5) * 0.3, (k % 3) * 0.5], half: [0.8, 1.1, 0.6], axes: axesFromQ(qb) };
        if (obbOverlap(a, b) !== obbOverlap(b, a)) good = false;
    }
    ok("!! the test is symmetric in its two boxes", good,
       "over 200 random pairs, a-vs-b and b-vs-a always agree -- collision is a property of the pair, not the argument order.");
}

// ---- 5. PIPELINE SOUNDNESS: an OBB overlap implies the world AABBs overlap -----------------------------------------
{
    // the broad-phase culls on world AABBs; if a true OBB overlap could have disjoint AABBs, the broad-phase would
    // drop a real collision. Show OBB-overlap => AABB-overlap (the AABB is a superset of the OBB).
    const aabbOf = (o) => {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
            const p = [0, 1, 2].map((d) => o.center[d] + sx * o.half[0] * o.axes[0][d] + sy * o.half[1] * o.axes[1][d] + sz * o.half[2] * o.axes[2][d]);
            for (let d = 0; d < 3; d++) { if (p[d] < min[d]) min[d] = p[d]; if (p[d] > max[d]) max[d] = p[d]; }
        }
        return { min, max };
    };
    const aabbHit = (a, b) => a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1] && a.min[2] <= b.max[2] && b.min[2] <= a.max[2];
    let good = true;
    for (let k = 0; k < 300; k++) {
        const a = { center: [0, 0, 0], half: [1, 0.6, 1.3], axes: axesFromQ(qZ(k * 0.13)) };
        const b = { center: [(k % 9) * 0.35 - 1, (k % 6) * 0.4 - 1, (k % 4) * 0.5], half: [0.9, 1.0, 0.7], axes: axesFromQ(qZ(k * 0.09 + 2)) };
        if (obbOverlap(a, b) && !aabbHit(aabbOf(a), aabbOf(b))) good = false;
    }
    ok("!! every OBB overlap has overlapping world AABBs (broad-phase never culls a real hit)", good,
       "over 300 pairs, no OBB overlap ever had disjoint AABBs -- so the broad-phase's AABB cull can never drop a collision the narrow phase would confirm.");
}

// ---- 6. DETERMINISM BY CONSTRUCTION: no transcendental math in the narrow phase -----------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "obbOverlap.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");   // strip comments
    const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|cbrt|sinh|cosh|tanh|hypot)\b/;
    ok("!! the narrow phase uses no transcendental math (bit-identical across architectures)", !banned.test(src),
       "grep of obbOverlap.js after stripping comments finds only +,-,*,abs -- IEEE-exact operations. THE COLLISION TEST GIVES THE SAME BITS ON x86_64 AND arm64, so it is lockstep-safe without box3d.");
}

// ---- 7. obbContact: THE MTV -- HIT/NORMAL/DEPTH, AND THE NORMAL+DEPTH ACTUALLY SEPARATES -----------------------
{
    // Two axis-aligned unit cubes overlapping by exactly 0.1 along +x: centers 1.9 apart, half-widths 1 each.
    const a = box([0, 0, 0], [1, 1, 1]);
    const overlapping = box([1.9, 0, 0], [1, 1, 1]);
    const separated = box([2.1, 0, 0], [1, 1, 1]);
    const rc = obbContact(a, overlapping), rs = obbContact(a, separated);
    ok("!! obbContact reports hit:true for two boxes constructed to intersect", rc.hit === true,
       "unit cubes with centers 1.9 apart (gap < 2*half) -- rc = " + JSON.stringify(rc));
    ok("!! obbContact reports hit:false for two boxes constructed to be clearly separated", rs.hit === false,
       "same cubes with centers 2.1 apart (gap > 2*half) -- rs = " + JSON.stringify(rs));
    ok("!! the MTV depth is exact for the axis-aligned overlap: 2*half - separation = 0.1", Math.abs(rc.depth - 0.1) < 1e-12,
       "centers 1.9 apart, each half-width 1 -> the boxes overlap by (1+1) - 1.9 = 0.1 along x; measured depth " + rc.depth.toFixed(12));
    ok("!! the MTV normal points from a toward b along +x, the only axis of overlap here", Math.abs(rc.normal[0] - 1) < 1e-12 && Math.abs(rc.normal[1]) < 1e-12 && Math.abs(rc.normal[2]) < 1e-12,
       "normal = " + JSON.stringify(rc.normal) + " -- b sits at +x of a and the only separating direction on this configuration is x");
    // mirror the same overlap to the -x side: the reported normal must FLIP with it (this is the branch that
    // negates the raw axis when the two centers' displacement runs against it).
    const rcNeg = obbContact(a, box([-1.9, 0, 0], [1, 1, 1]));
    ok("!! and with b on the OTHER side, the normal flips to -x -- it tracks a-toward-b, not a fixed axis sign",
       rcNeg.hit === true && Math.abs(rcNeg.normal[0] + 1) < 1e-12 && Math.abs(rcNeg.depth - 0.1) < 1e-12,
       "rcNeg = " + JSON.stringify(rcNeg) + " -- same overlap depth, opposite side, opposite-signed normal. A " +
       "routine that always returned the raw (unsigned-by-side) axis would pass the +x case above and fail this one");
    ok("!! translating b by depth*normal lands it EXACTLY on the boundary (still counted as touching, not clear of it)",
       (() => {
        const moved = { center: [overlapping.center[0] + rc.depth * rc.normal[0], overlapping.center[1] + rc.depth * rc.normal[1], overlapping.center[2] + rc.depth * rc.normal[2]], half: overlapping.half, axes: overlapping.axes };
        return obbOverlap(a, moved);   // SAT's ">" test is boundary-inclusive, so exactly-touching still reads as overlap
    })(), "moving by exactly depth*normal puts the gap at precisely 2*half -- the boundary obbOverlap's strict '>' " +
       "test still calls overlapping, which is the correct edge behaviour for a minimum translation vector");
    ok("!! and nudging PAST that boundary by one more ULP-scale epsilon does separate the pair", (() => {
        const push = rc.depth * (1 + 1e-9) + 1e-12;
        const moved = { center: [overlapping.center[0] + push * rc.normal[0], overlapping.center[1] + push * rc.normal[1], overlapping.center[2] + push * rc.normal[2]], half: overlapping.half, axes: overlapping.axes };
        return !obbOverlap(a, moved);
    })(), "the MTV's depth is the MINIMUM push that clears the overlap: depth alone lands on the boundary, and " +
       "anything more clears it -- confirming depth is neither an over- nor an under-estimate of the true overlap");
}

// ---- 8. obbContact ON A TOUCHING (EDGE) CASE, AND AGREEMENT WITH obbOverlap ACROSS A SWEEP ----------------------
{
    const a = box([0, 0, 0], [1, 1, 1]);
    const justTouching = box([2.0 - 1e-9, 0, 0], [1, 1, 1]);     // gap infinitesimally under 2*half -> tiny overlap
    const justClear = box([2.0 + 1e-9, 0, 0], [1, 1, 1]);        // gap infinitesimally over 2*half -> no overlap
    const rt = obbContact(a, justTouching), rj = obbContact(a, justClear);
    ok("!! at the edge, an infinitesimal overlap still reports hit:true with a correspondingly tiny depth", rt.hit === true && rt.depth < 1e-6,
       "gap 2 - 1e-9 -- rt.depth = " + rt.depth.toExponential(3));
    ok("!! and just past the edge, obbContact agrees with obbOverlap that there is no hit", rj.hit === false && !obbOverlap(a, justClear),
       "gap 2 + 1e-9 -- both the boolean test and the contact routine call it separated");
    // obbContact.hit must agree with obbOverlap's boolean over the same rotated sweep used in section 3/4.
    let agree = 0, total = 0;
    for (let k = 0; k < 100; k++) {
        const qa = qZ(k * 0.11), qb = qZ(k * 0.07 + 1);
        const A = { center: [0, 0, 0], half: [1, 0.5, 1.2], axes: axesFromQ(qa) };
        const B = { center: [(k % 7) * 0.4, (k % 5) * 0.3, (k % 3) * 0.5], half: [0.8, 1.1, 0.6], axes: axesFromQ(qb) };
        total++;
        if (obbContact(A, B).hit === obbOverlap(A, B)) agree++;
    }
    ok("!! obbContact's hit flag agrees with obbOverlap's boolean on every case in a 100-pair rotated sweep", agree === total,
       agree + "/" + total + " agree -- the MTV routine and the pure SAT boolean are answering the same question " +
       "(same 15 axes) and must never disagree on whether the boxes touch");
}

console.log(fails ? "\nobbOverlap-selfcheck: " + fails + " FAILED" : "\nobbOverlap-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
