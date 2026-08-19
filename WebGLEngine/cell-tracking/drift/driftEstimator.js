// cell-tracking/drift/driftEstimator.js -- v2225 -- separate stage/sample DRIFT from real cell motion.
//
// The idea (from the "throw it in space" round): the tracker gives 3D+time centroids -- (z,y,x) per
// frame, linked across frames by edges. Every cell in a frame carries the SAME global drift (stage /
// sample motion) on top of its own biology. So the drift is the CONSENSUS of all the cells'
// frame-to-frame displacements, and each cell's real motion is what's LEFT after you subtract it.
// This is the "triangulate the views to cancel the bias" instinct, done as consensus over cells
// rather than triangulation over cameras (there are no cameras here).
//
// A linked pair (an edge whose source has out-degree 1 -- not a division) is a MATCHED displacement:
// d_i = pos(target) - pos(source). Drift(t) = robust consensus of { d_i } for that frame. Corrected
// position subtracts the CUMULATIVE drift.
//
// THE HONEST CAVEAT, built in: consensus removes the COMMON displacement, which is drift PLUS any
// genuine collective tissue flow -- the two are indistinguishable from motion alone. So:
//   - if fiducial/anchor tracks are given (non-moving structures), drift is taken from THOSE only -- the
//     clean separation;
//   - otherwise we report a `coherenceWarning` when the drift explains most of ALL the motion (the
//     regime where it might be real collective flow masquerading as drift), so you don't silently
//     "correct away" biology.
//
// Everything here is pure math on numbers, so it is proven headlessly by the selfcheck.

// ---------- small numeric helpers ----------
function median(a) {
    if (!a.length) return 0;
    const s = [...a].sort((p, q) => p - q); const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function mag3(v) { return Math.hypot(v[0], v[1], v[2]); }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

// Solve a small linear system (Gaussian elimination with partial pivoting). n up to ~4.
function solveLinear(A, b) {
    const n = b.length; const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        [M[c], M[piv]] = [M[piv], M[c]];
        if (Math.abs(M[c][c]) < 1e-12) return null;
        for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((row, i) => row[n] / row[i]);
}

// ---------- per-frame-pair drift ----------
// disps: [{ p:[z,y,x], d:[dz,dy,dx] }]  (physical units recommended)
// mode: "translation" (component-wise median -- robust) | "affine" (drift varies smoothly across the field)
// Returns { mode, drift([dz,dy,dx] for translation) | affine(p)->[dz,dy,dx], meanDispMag, driftMag, driftFraction }
export function estimateFramePairDrift(disps, opts = {}) {
    const mode = opts.mode === "affine" ? "affine" : "translation";
    if (!disps.length) return { mode, drift: [0, 0, 0], affine: null, meanDispMag: 0, driftMag: 0, driftFraction: 0, n: 0 };

    const meanDispMag = mean(disps.map(e => mag3(e.d)));

    if (mode === "translation") {
        const drift = [0, 1, 2].map(c => median(disps.map(e => e.d[c])));
        const driftMag = mag3(drift);
        return { mode, drift, affine: null, meanDispMag, driftMag, driftFraction: driftMag / (meanDispMag + 1e-9), n: disps.length };
    }

    // affine: for each output component c, fit d_c = a0*pz + a1*py + a2*px + a3 by least squares.
    const coeffs = [];
    for (let c = 0; c < 3; c++) {
        // normal equations X^T X (4x4), X^T y (4), X row = [pz,py,px,1]
        const XtX = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
        const Xty = [0, 0, 0, 0];
        for (const e of disps) {
            const X = [e.p[0], e.p[1], e.p[2], 1], y = e.d[c];
            for (let i = 0; i < 4; i++) { Xty[i] += X[i] * y; for (let j = 0; j < 4; j++) XtX[i][j] += X[i] * X[j]; }
        }
        coeffs.push(solveLinear(XtX, Xty) || [0, 0, 0, median(disps.map(e => e.d[c]))]);
    }
    const affine = (p) => coeffs.map(c => c[0] * p[0] + c[1] * p[1] + c[2] * p[2] + c[3]);
    // representative drift = affine at the centroid of the points
    const centroid = [0, 1, 2].map(c => mean(disps.map(e => e.p[c])));
    const drift = affine(centroid); const driftMag = mag3(drift);
    return { mode, drift, affine, coeffs, meanDispMag, driftMag, driftFraction: driftMag / (meanDispMag + 1e-9), n: disps.length };
}

// bootstrap confidence: component-wise std of the translation drift over K random subsets.
export function driftConfidence(disps, K = 12, frac = 0.6) {
    if (disps.length < 4) return [0, 0, 0];
    const ests = [];
    for (let k = 0; k < K; k++) {
        const sub = disps.filter(() => Math.random() < frac);
        if (sub.length < 3) { k--; continue; }
        ests.push([0, 1, 2].map(c => median(sub.map(e => e.d[c]))));
    }
    return [0, 1, 2].map(c => { const xs = ests.map(e => e[c]); const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); });
}

// ---------- dataset pipeline ----------
// dataset: { nodes:[[id,t,z,y,x],...], edges:[[src,tgt],...], voxel_scale:{z,y,x} }
// opts: { mode, anchorNodeIds:Set|Array, confidence:bool, coherenceThreshold=0.85 }
// Returns { tRange:[t0,t1], driftPerFrame:{t:[dz,dy,dx]}, cumDrift:{t:[dz,dy,dx]}, diagnostics, usedAnchors }
export function estimateDatasetDrift(dataset, opts = {}) {
    const vs = dataset.voxel_scale || { z: 1, y: 1, x: 1 };
    const phys = (n) => [n[2] * vs.z, n[3] * vs.y, n[4] * vs.x];   // node = [id,t,z,y,x] -> [pz,py,px]
    const byId = new Map(); for (const n of dataset.nodes) byId.set(n[0], n);
    // out-degree, to keep only NON-dividing (1:1) links -- a division is not a matched displacement
    const outdeg = new Map(); for (const [s] of dataset.edges) outdeg.set(s, (outdeg.get(s) || 0) + 1);

    const anchors = opts.anchorNodeIds ? new Set(opts.anchorNodeIds) : null;

    // per-frame displacements: t -> [{p,d,srcId}]
    const perFrame = new Map();
    let tMin = Infinity, tMax = -Infinity;
    for (const [s, tg] of dataset.edges) {
        if ((outdeg.get(s) || 0) !== 1) continue;              // skip divisions
        const ns = byId.get(s), nt = byId.get(tg); if (!ns || !nt) continue;
        const t = ns[1]; if (nt[1] !== t + 1) continue;        // consecutive frames only
        const ps = phys(ns), pt = phys(nt);
        const rec = { p: ps, d: sub3(pt, ps), srcId: s, tgtId: tg, anchor: anchors ? (anchors.has(s) || anchors.has(tg)) : false };
        if (!perFrame.has(t)) perFrame.set(t, []);
        perFrame.get(t).push(rec);
        if (t < tMin) tMin = t; if (t + 1 > tMax) tMax = t + 1;
    }
    if (!perFrame.size) return { ok: false, error: "no matched 1:1 links to estimate drift from" };

    const driftPerFrame = {}; const conf = {}; let warned = false;
    const thr = opts.coherenceThreshold == null ? 0.85 : opts.coherenceThreshold;
    for (const [t, all] of [...perFrame.entries()].sort((a, b) => a[0] - b[0])) {
        const use = anchors ? all.filter(e => e.anchor) : all;
        const src = use.length ? use : all;                    // fall back to all if no anchors this frame
        const est = estimateFramePairDrift(src, { mode: opts.mode });
        driftPerFrame[t] = est.drift;
        if (opts.confidence) conf[t] = driftConfidence(src);
        if (!anchors && est.driftFraction > thr) warned = true; // drift dominates -> might be collective motion
    }

    // cumulative drift: cumDrift[t] = sum of driftPerFrame[t0..t-1]
    const ts = Object.keys(driftPerFrame).map(Number).sort((a, b) => a - b);
    const cumDrift = {}; let acc = [0, 0, 0];
    cumDrift[tMin] = [0, 0, 0];
    for (const t of ts) { acc = [acc[0] + driftPerFrame[t][0], acc[1] + driftPerFrame[t][1], acc[2] + driftPerFrame[t][2]]; cumDrift[t + 1] = acc.slice(); }

    return {
        ok: true, tRange: [tMin, tMax], driftPerFrame, cumDrift,
        confidence: opts.confidence ? conf : null,
        usedAnchors: !!anchors,
        diagnostics: {
            frames: ts.length,
            coherenceWarning: warned,
            note: anchors ? "drift taken from fiducial/anchor tracks (clean separation)"
                : (warned ? "drift explains most of the motion in >=1 frame -- could be genuine collective flow; add fiducial anchors to be sure"
                    : "consensus drift, well-separated from per-cell motion"),
        },
    };
}

// corrected PHYSICAL position of a node given a cumDrift map (subtract the drift accumulated to its frame).
export function correctedPos(node, cumDrift, voxel_scale) {
    const vs = voxel_scale || { z: 1, y: 1, x: 1 };
    const p = [node[2] * vs.z, node[3] * vs.y, node[4] * vs.x];
    const cd = cumDrift[node[1]] || [0, 0, 0];
    return [p[0] - cd[0], p[1] - cd[1], p[2] - cd[2]];
}
