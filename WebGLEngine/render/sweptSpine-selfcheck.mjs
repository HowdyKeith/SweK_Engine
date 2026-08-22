// WebGLEngine/render/sweptSpine-selfcheck.mjs — v3834
//
// The trail is placed in a vertex shader from a data texture, which no sandbox can run. But the shader is a mirror
// of placeVertex, and everything upstream of it is arithmetic: does the resample space evenly, is the frame free
// of twist when the tangent sweeps through vertical (the bug that makes a ribbon barrel-roll), does the ring
// topology wind outward, does a straight spine place onto a true cylinder, does the texture layout round-trip. All
// of that is pinned here; the LOOK -- colour, taper, fade -- is Keith's first hard-reload.
//
// Run: node render/sweptSpine-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { resampleByArcLength, rotationMinimizingFrames, profileRing, placeVertex, buildRingIndex, packStrand, unpackStrand } from "./sweptSpine.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));

// 1) RESAMPLE spaces evenly in arc length and keeps the endpoints.
{
    const s = resampleByArcLength([[0, 0, 0], [10, 0, 0]], 6);
    ok(s.length === 6 && near(s[0][0], 0) && near(s[5][0], 10), "resample keeps endpoints");
    let even = true; for (let i = 1; i < 6; i++) if (!near(s[i][0] - s[i - 1][0], 2)) even = false;
    ok(even, "resample spaces the samples evenly (gap 2 over a length-10 path)");
}

// 2) LENGTH IS FREE -- a 2-unit and a 19-unit straight path both give the same sample count (same buffer).
{
    const a = resampleByArcLength([[0, 0, 0], [2, 0, 0]], 8);
    const b = resampleByArcLength([[0, 0, 0], [19, 0, 0]], 8);
    ok(a.length === 8 && b.length === 8, "both path lengths resample to the same count -- the buffer size is length-independent");
}

// 3) RESAMPLE follows a bent path by arc length, not by vertex index.
{
    const s = resampleByArcLength([[0, 0, 0], [0, 0, 10], [10, 0, 10]], 5);   // total length 20
    ok(near(s[1][2], 5) && near(s[2][2], 10) && s[2][0] === 0 && near(s[3][0], 5), "samples land at equal arc length around the corner");
}

// 4) STRAIGHT RUN -> constant normal (zero twist).
{
    const f = rotationMinimizingFrames([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]);
    let constant = true; for (let i = 1; i < f.length; i++) if (ang(f[0].N, f[i].N) > 1e-6) constant = false;
    ok(constant, "a straight spine carries a constant normal -- no twist");
    ok(near(len(f[0].N), 1) && near(dot(f[0].N, f[0].T), 0), "the frame normal is unit and perpendicular to the tangent");
}

// 5) THE MONEY TEST -- a tangent that SWEEPS THROUGH VERTICAL keeps an orthonormal, continuous frame, where a
//    naive fixed-up frame goes degenerate. Path is a half-circle in the x-y plane: tangent runs +x -> +y -> -x.
{
    const R = 5, M = 13, pts = [];
    for (let k = 0; k < M; k++) { const phi = (k / (M - 1)) * Math.PI; pts.push([R * Math.sin(phi), R * (1 - Math.cos(phi)), 0]); }
    const f = rotationMinimizingFrames(pts);
    // orthonormal everywhere, including the vertical-tangent sample near the middle
    let orthonormal = true;
    for (const fr of f) {
        if (!near(len(fr.T), 1, 1e-6) || !near(len(fr.N), 1, 1e-6) || !near(len(fr.B), 1, 1e-6)) orthonormal = false;
        if (Math.abs(dot(fr.T, fr.N)) > 1e-6 || Math.abs(dot(fr.T, fr.B)) > 1e-6 || Math.abs(dot(fr.N, fr.B)) > 1e-6) orthonormal = false;
    }
    ok(orthonormal, "frame stays orthonormal through the vertical-tangent point");
    // B stays continuous (a planar curve keeps B ~ out of plane; a flip would be a big jump)
    let maxJump = 0; for (let i = 1; i < f.length; i++) maxJump = Math.max(maxJump, ang(f[i - 1].B, f[i].B));
    ok(maxJump < 0.2, "the binormal never flips across the vertical sweep (max step " + maxJump.toFixed(3) + " rad)");
    // CONTROL: the naive fixed-up normal collapses exactly where the tangent is vertical
    const naive = (T) => cross([0, 1, 0], T);
    let mid = f[(M - 1) / 2];
    ok(len(naive(mid.T)) < 0.05 && near(len(mid.N), 1, 1e-6), "control: a fixed-up frame WOULD go degenerate here; the RMF normal does not");
}

// 6) RING TOPOLOGY -- triangle count, index range, and OUTWARD winding on a straight tube.
{
    const segs = 4, ring = 6;
    const idx = buildRingIndex(segs, ring);
    ok(idx.length === 2 * (segs - 1) * ring * 3, "index count = 2*(segments-1)*ringVerts triangles");
    let inRange = true; for (const v of idx) if (v < 0 || v >= segs * ring) inRange = false;
    ok(inRange, "all indices are in range");
    // place a straight +x tube and check every face points outward from the x-axis
    const pts = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
    const fr = rotationMinimizingFrames(pts), prof = profileRing(ring, 1, 1);
    const V = [];
    for (let i = 0; i < segs; i++) for (let j = 0; j < ring; j++) V.push(placeVertex(pts[i], fr[i], prof[j], 1));
    let outward = true, degenerate = false;
    for (let t = 0; t < idx.length; t += 3) {
        const p0 = V[idx[t]], p1 = V[idx[t + 1]], p2 = V[idx[t + 2]];
        const nrm = cross(sub(p1, p0), sub(p2, p0));
        if (len(nrm) < 1e-9) { degenerate = true; continue; }
        const cx = (p0[0] + p1[0] + p2[0]) / 3, cyz = [0, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
        if (dot(nrm, cyz) <= 0) outward = false;   // radial = centroid minus its x-axis projection
    }
    ok(!degenerate, "no degenerate triangles");
    ok(outward, "every face winds outward from the tube axis");
}

// 7) STRAIGHT SPINE + CIRCULAR PROFILE -> a true cylinder; radius scales linearly.
{
    const pts = [[0, 0, 0], [5, 0, 0]], fr = rotationMinimizingFrames(pts), prof = profileRing(8, 1, 1);
    let onCyl = true;
    for (let i = 0; i < 2; i++) for (const off of prof) { const v = placeVertex(pts[i], fr[i], off, 3); if (!near(Math.hypot(v[1], v[2]), 3, 1e-9)) onCyl = false; }
    ok(onCyl, "every vertex sits at the radius distance from the spine axis (a cylinder)");
    const a = placeVertex(pts[0], fr[0], prof[1], 1), b = placeVertex(pts[0], fr[0], prof[1], 2);
    ok(near(Math.hypot(b[1], b[2]), 2 * Math.hypot(a[1], a[2])), "doubling the radius doubles the offset");
}

// 8) DETERMINISM + TEXTURE LAYOUT ROUND-TRIPS.
{
    const pts = resampleByArcLength([[0, 0, 0], [1, 2, 0], [3, 2, 1]], 5), fr = rotationMinimizingFrames(pts);
    const buf1 = packStrand(pts, fr, { radius: 2 }), buf2 = packStrand(pts, fr, { radius: 2 });
    let same = true; for (let k = 0; k < buf1.length; k++) if (buf1[k] !== buf2[k]) same = false;
    ok(same, "packing is deterministic");
    const u = unpackStrand(buf1, 5);
    let round = true;
    for (let i = 0; i < 5; i++) { if (ang(u.N[i], fr[i].N) > 1e-6 || ang(u.B[i], fr[i].B) > 1e-6 || u.radius[i] !== 2) round = false; if (len(sub(u.pos[i], pts[i])) > 1e-6) round = false; }
    ok(round, "the packed layout round-trips pos / N / B / radius");
}

console.log(`sweptSpine-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
