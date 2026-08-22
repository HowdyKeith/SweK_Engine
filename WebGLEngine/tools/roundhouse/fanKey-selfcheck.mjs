// tools/roundhouse/fanKey-selfcheck.mjs
//
// Run: node tools/roundhouse/fanKey-selfcheck.mjs   (~0.3s)
//
// v3136 -- ct.fan's SECOND ANSWER KEY, AND THE OBVIOUS ONE IS WRONG.
//
// The handoff carried "fanbeam is not a registered device at all; registering it is the last second-key
// candidate". IT IS NOT A DEVICE -- IT IS A MODE OF ct, and tomographyBind has had `mode: "fan"` beside
// "parallel" and "angles" all along. The note was wrong about the shape of the problem, one round after
// "checking beats remembering" was written into the same file.
//
// WHAT WAS ACTUALLY MISSING: ct.fan reported only CORRELATIONS AGAINST THE PHANTOM -- fanCorr, fanNoRebinCorr
// and their difference. "Does the picture look like the thing" is a real check and it grades the whole
// pipeline; nothing graded THE REBINNING, which is the step fan mode exists to exercise. And sinoDivergence has
// been exported from fanbeam.js since the module was written, exercised in its own selfcheck, and NOT IMPORTED
// BY THE BIND -- five of six functions taken and the sixth left. Third time this session a measurement already
// existed and nothing reached for it.
//
// *** AND THE OBVIOUS SECOND KEY IS THE WRONG ONE, WHICH IS THE PART WORTH KEEPING. *** A fan beam becomes a
// parallel beam at infinite source distance, so the natural claim is that the divergence falls as D grows.
// MEASURED, IT DOES NOT. Asserting the natural claim would have condemned a device that is behaving correctly,
// and the failure would have looked like a real physics bug.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const F = await import(pathToFileURL(path.join(ENG, "physics", "tomography", "fanbeam.js")).href);
const C = await import(pathToFileURL(path.join(ENG, "physics", "tomography", "ct.js")).href);
const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);

const phantom = (N) => {
    const img = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x - N * 0.45, dy = y - N * 0.55;
        img[y * N + x] = (dx * dx + dy * dy < (N * 0.2) ** 2) ? 1 : (Math.abs(dx) < N / 12 && Math.abs(dy) < N / 3.4 ? 0.6 : 0);
    }
    return img;
};
const divergenceAt = (N, nDet, nAng, Dmult) => {
    const img = phantom(N), angles = [];
    for (let i = 0; i < nAng; i++) angles.push(Math.PI * i / nAng);
    const par = C.radon(img, N, angles, nDet);
    const d = N / 2 * Dmult * 2, gmax = F.fanHalfAngle(d, N / 2 * 1.05);
    const gammas = F.fanAngles(nDet, gmax), betas = F.betaSet(Math.max(60, nAng * 2));
    const reb = F.rebinToParallel(F.fanProjection(img, N, betas, gammas, d), betas, gammas, d, angles, nDet, N);
    return F.sinoDivergence(reb, par);
};

// ---- 1. THE KEY THAT WORKS: CONVERGENCE UNDER THE GRID ------------------------------------------------------------
{
    const grid = [[32, 32, 40], [48, 64, 60], [64, 96, 80]].map(([n, d, a]) => divergenceAt(n, d, a, 4));
    const falling = grid.every((v, i) => i === 0 || v < grid[i - 1]);
    ok("!! rebinDivergence FALLS monotonically as the grid refines",
        falling && grid[2] < grid[0] * 0.7,
        grid.map((v) => v.toExponential(2)).join(" -> ") + " over N/nDet/nAng 32/32/40 to 64/96/80. A " +
        "CONVERGENCE claim needing no closed form -- the rebinned sinogram approaches the parallel one it is " +
        "supposed to reproduce, and the approach is limited by SAMPLING");
}

// ---- 2. THE KEY THAT DOES NOT WORK, ASSERTED SO NOBODY TRIES IT AGAIN ------------------------------------------------
{
    const near = divergenceAt(48, 64, 60, 1.05), mid = divergenceAt(48, 64, 60, 4), far = divergenceAt(48, 64, 60, 32);
    ok("!! and it is INSENSITIVE to source distance, which is the evidence the geometry is right",
        Math.abs(far - mid) / mid < 0.1 && far >= near * 0.9,
        "D = 1.05 / 4 / 32 radii gives " + [near, mid, far].map((v) => v.toExponential(2)).join(" / ") + ". A " +
        "fan beam becomes parallel at infinite D, so the NATURAL claim is that this falls as D grows -- IT DOES " +
        "NOT, it is flat and if anything rising. THE RESIDUAL IS RESAMPLING, NOT GEOMETRY. Asserting the " +
        "natural claim would have condemned a device that is behaving correctly, and the failure would have " +
        "looked like a real physics bug");
}

// ---- 3. THE MEASURE ITSELF, AND THE DEVICE THAT NOW REPORTS IT ---------------------------------------------------------
{
    const a = [[1, 2, 3], [4, 5, 6]];
    ok("sinoDivergence of a sinogram with itself is exactly 0",
        F.sinoDivergence(a, a) === 0,
        "the floor the convergence above is approaching");
    ok("...and it is SCALE-INVARIANT, so it grades shape not path length",
        Math.abs(F.sinoDivergence(a.map((r) => r.map((v) => v * 7.3)), a)) < 1e-12,
        "fan and parallel geometries carry different path-length scalings; a measure that confused those would " +
        "report divergence for a units change");

    const ct = await D.getDevice("ct");
    const out = await ct.build({ mode: "fan" });
    ok("!! ct.fan now REPORTS it, and declares it",
        Number.isFinite(out.rebinDivergence) && (ct.observables || []).includes("rebinDivergence"),
        "rebinDivergence = " + out.rebinDivergence.toExponential(3) + ". It has been computable since the " +
        "module was written -- the bind imported five of fanbeam's six functions and left this one, so the " +
        "agent could run fan mode and never learn whether the rebinning worked");

    ok("...and the correlations are still there, because they grade something else",
        Number.isFinite(out.fanCorr) && Number.isFinite(out.rebinGain),
        "fanCorr grades the WHOLE PIPELINE against the phantom; rebinDivergence grades the REBINNING STEP " +
        "against the parallel sinogram. Two questions, and replacing one with the other would have lost a check");
    console.log("  NOTE   ct.fan is NOT a missing device -- fanbeam is a MODE of ct and always was. The handoff");
    console.log("         said otherwise, one round after 'checking beats remembering' went into the same file.");
}

console.log();
if (fails) { console.log("fanKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fanKey-selfcheck: all checks pass");
