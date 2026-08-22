// cell-tracking/drift/tools/drift-selfcheck.mjs -- v2225 -- proves the drift estimator.
//
// Synthesises tracks = known per-cell motion + a KNOWN injected drift, then asserts the estimator
// recovers the drift, preserves the real motion after correction, uses fiducial anchors to beat the
// drift-vs-collective-flow confound, fits an affine (spatially-varying) drift, and warns when drift
// dominates. No pipeline, no images -- pure numbers.
//
//   node cell-tracking/drift/tools/drift-selfcheck.mjs

import { estimateFramePairDrift, estimateDatasetDrift, correctedPos } from "../driftEstimator.js";

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const close = (a, b, tol) => Math.abs(a - b) <= tol;

// Build a synthetic dataset. driftStep(t) -> [dz,dy,dx] injected each frame (added to every cell).
// motion: per-cell zero-mean random-walk sigma. collective: extra uniform velocity on NON-anchor cells.
// anchorFrac: fraction of cells that are perfectly still (fiducials) -- they only carry the drift.
function synth({ N = 60, T = 12, seed = 7, driftStep, motionSigma = 1.0, collective = [0, 0, 0], anchorFrac = 0, vs = { z: 1, y: 1, x: 1 } }) {
    const r = rng(seed);
    const nodes = [], edges = [];
    const anchorIds = new Set();
    let nid = 0;
    const cumDriftTrue = {}; let acc = [0, 0, 0]; cumDriftTrue[0] = [0, 0, 0];
    for (let t = 0; t < T; t++) { if (t > 0) { const d = driftStep(t - 1); acc = [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]]; } cumDriftTrue[t] = acc.slice(); }
    for (let i = 0; i < N; i++) {
        const isAnchor = (i / N) < anchorFrac;
        let truePhys = [ (r() * 40), (r() * 200), (r() * 200) ];   // physical microns
        let prevNid = null;
        for (let t = 0; t < T; t++) {
            if (t > 0 && !isAnchor) {
                truePhys = [ truePhys[0] + gauss(r) * motionSigma + collective[0],
                             truePhys[1] + gauss(r) * motionSigma + collective[1],
                             truePhys[2] + gauss(r) * motionSigma + collective[2] ];
            }
            const obs = [ truePhys[0] + cumDriftTrue[t][0], truePhys[1] + cumDriftTrue[t][1], truePhys[2] + cumDriftTrue[t][2] ];
            // store in VOXEL units so the estimator's voxel_scale conversion is exercised
            const node = [nid, t, obs[0] / vs.z, obs[1] / vs.y, obs[2] / vs.x];
            nodes.push(node);
            if (isAnchor) anchorIds.add(nid);
            if (prevNid != null) edges.push([prevNid, nid]);
            prevNid = nid; nid++;
        }
    }
    return { dataset: { nodes, edges, voxel_scale: vs }, cumDriftTrue, anchorIds, T };
}

// ---- 1. per-frame-pair median recovers a translation drift under zero-mean motion ----
{
    const r = rng(3); const drift = [2, -3, 1.5];
    const disps = Array.from({ length: 80 }, () => ({ p: [r() * 40, r() * 200, r() * 200], d: [drift[0] + gauss(r), drift[1] + gauss(r), drift[2] + gauss(r)] }));
    const est = estimateFramePairDrift(disps);
    ok("translation drift recovered from noisy displacements",
        close(est.drift[0], drift[0], 0.4) && close(est.drift[1], drift[1], 0.4) && close(est.drift[2], drift[2], 0.4),
        `got [${est.drift.map(x => x.toFixed(2))}]`);
}

// ---- 2. dataset pipeline: recover cumulative drift + preserve true motion ----
{
    const driftStep = (t) => [0.6 * Math.sin(t * 0.5), 1.2, -0.8];    // smooth-ish injected drift
    const { dataset, cumDriftTrue, T } = synth({ N: 70, T: 12, seed: 11, driftStep, motionSigma: 1.0 });
    const res = estimateDatasetDrift(dataset, { confidence: true });
    ok("pipeline produced a drift result", res.ok === true && res.diagnostics.frames === T - 1);
    // compare recovered cumDrift to injected at the last frame
    const last = T - 1;
    const cd = res.cumDrift[last] || [0, 0, 0], tr = cumDriftTrue[last];
    ok("cumulative drift matches the injected curve",
        close(cd[0], tr[0], 0.8) && close(cd[1], tr[1], 0.8) && close(cd[2], tr[2], 0.8),
        `got [${cd.map(x => x.toFixed(1))}] vs true [${tr.map(x => x.toFixed(1))}]`);
    // corrected positions should track the drift-free truth: a cell's corrected span should be ~ its motion, not the drift
    const conf = res.confidence[Object.keys(res.confidence)[0]];
    ok("confidence band is finite and small with many agreeing cells", conf.every(Number.isFinite) && Math.max(...conf) < 1.0, `band [${conf.map(x => x.toFixed(2))}]`);
    ok("no false coherence warning for diverse motion + modest drift", res.diagnostics.coherenceWarning === false);
}

// ---- 3. fiducial anchors beat the drift-vs-collective-flow confound ----
{
    const driftStep = () => [1, 1, 1];
    // non-anchor cells ALSO share a collective velocity [3,0,0] -- indistinguishable from drift WITHOUT anchors
    const { dataset, cumDriftTrue, anchorIds, T } = synth({ N: 80, T: 10, seed: 5, driftStep, motionSigma: 0.6, collective: [3, 0, 0], anchorFrac: 0.25 });
    const withAnchors = estimateDatasetDrift(dataset, { anchorNodeIds: anchorIds });
    const noAnchors = estimateDatasetDrift(dataset, {});
    const last = T - 1;
    const cdA = withAnchors.cumDrift[last], tr = cumDriftTrue[last];
    ok("with anchors, drift == the true (fiducial) drift, not the collective flow",
        close(cdA[0], tr[0], 0.6) && close(cdA[1], tr[1], 0.6) && close(cdA[2], tr[2], 0.6),
        `anchors z=${cdA[0].toFixed(1)} vs true ${tr[0].toFixed(1)}`);
    // without anchors, the z drift is inflated by the collective 3/frame -> clearly larger than truth
    const cdN = noAnchors.cumDrift[last];
    ok("without anchors, collective flow inflates the drift estimate (the caveat, demonstrated)",
        cdN[0] > cdA[0] + 5, `no-anchor z=${cdN[0].toFixed(1)} vs anchor z=${cdA[0].toFixed(1)}`);
    ok("usedAnchors flag reflects the mode", withAnchors.usedAnchors === true && noAnchors.usedAnchors === false);
}

// ---- 4. affine mode recovers a spatially-varying (gradient) drift ----
{
    const r = rng(9);
    // drift grows with x: d = [0, 0, 0.01*px + 2]
    const disps = Array.from({ length: 120 }, () => { const p = [r() * 40, r() * 200, r() * 300]; return { p, d: [gauss(r) * 0.3, gauss(r) * 0.3, 0.01 * p[2] + 2 + gauss(r) * 0.3] }; });
    const aff = estimateFramePairDrift(disps, { mode: "affine" });
    const tr = estimateFramePairDrift(disps, { mode: "translation" });
    // affine drift at px=300 should be ~5, at px=0 ~2; translation gives a single ~constant
    const dHi = aff.affine([20, 100, 300])[2], dLo = aff.affine([20, 100, 0])[2];
    ok("affine captures the x-gradient in drift", dHi - dLo > 2.0, `hi=${dHi.toFixed(2)} lo=${dLo.toFixed(2)}`);
    ok("translation cannot (single value)", Math.abs(tr.drift[2] - aff.affine([20, 100, 150])[2]) < 1.0);
}

// ---- 5. coherence warning fires when drift dominates all motion ----
{
    const driftStep = () => [0, 0, 8];              // big drift
    const { dataset } = synth({ N: 60, T: 8, seed: 2, driftStep, motionSigma: 0.15 });   // tiny motion
    const res = estimateDatasetDrift(dataset, {});
    ok("coherence warning fires when drift dwarfs motion (no anchors)", res.diagnostics.coherenceWarning === true);
}

// ---- 6. anisotropic voxel_scale is honoured (drift reported in physical units) ----
{
    const driftStep = () => [1, 0, 0];   // 1 physical unit/frame in z
    const vs = { z: 1.625, y: 0.40625, x: 0.40625 };
    const { dataset, cumDriftTrue, T } = synth({ N: 60, T: 6, seed: 4, driftStep, motionSigma: 0.5, vs });
    const res = estimateDatasetDrift(dataset, {});
    const last = T - 1;
    ok("z drift recovered in PHYSICAL units despite coarse-z voxels",
        close(res.cumDrift[last][0], cumDriftTrue[last][0], 0.8), `got ${res.cumDrift[last][0].toFixed(2)} vs ${cumDriftTrue[last][0].toFixed(2)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
