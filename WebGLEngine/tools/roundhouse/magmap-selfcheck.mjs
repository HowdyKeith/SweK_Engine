// tools/roundhouse/magmap-selfcheck.mjs
//
// Run: node tools/roundhouse/magmap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2903 -- GRADING THE FIRST KERNEL, ON A MACHINE THAT MAY NOT HAVE A GPU.
//
// Everything here runs headless. That buys the contract, the tolerance and the detection floor; it does NOT buy
// the claim that the shader runs, which only a browser can settle. Section 5 says so out loud rather than letting
// a green gate imply otherwise.

import { magAt, muPoint, muPointF32, sampleTable, cellMag, cellOffset, referenceCell, lensEq } from "./magmapKernel.mjs";
import { magmapEmulated, adjudicate, gradedPeak, F32_FLOOR, MEASURED_F32_WORST, MAGMAP_TOL, WGSL } from "./magmapGpu.mjs";
import { isGpuSourced, unwrapGpu, armGpuTripwire, disarmGpuTripwire } from "./gpuProvenance.mjs";
import { buildLens } from "./lensBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const N = 9, SPAN = 1.0, RHO = 0.1, CFG = { n: N, span: SPAN, rho: RHO };

// ---- 1. THE CLOSED FORM AGAINST THE TREE'S BISECTION -------------------------------------------------------------
// Two separately written routes to the same quantity. This had real freedom to fail: if the quadratic root were
// the wrong branch, or the analytic derivative dropped a term, the map would differ everywhere.
{
    const bisect = (u) => {   // lensBind's algorithm, reproduced here so the comparison is not self-referential
        let lo = 1 + 1e-12, hi = Math.max(4, u + 4);
        for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (lensEq(m) < u) lo = m; else hi = m; }
        let a = -1 + 1e-12, b = -1e-12;
        for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b); if (lensEq(m) < u) a = m; else b = m; }
        return { plus: 0.5 * (lo + hi), minus: 0.5 * (a + b) };
    };
    let worst = 0;
    for (const u of [1e-6, 1e-3, 0.01, 0.1, 0.3, 0.7, 1, 2, 5, 20]) {
        const b = bisect(u), d = Math.sqrt(u * u + 4);
        worst = Math.max(worst,
            Math.abs(b.plus - 0.5 * (u + d)) / (0.5 * (u + d)),
            Math.abs(b.minus - 0.5 * (u - d)) / Math.abs(0.5 * (u - d)));
    }
    ok("!! 400 bisection iterations were recovering an exact quadratic root",
        worst > 0 && worst < 1e-13,
        "worst disagreement " + worst.toExponential(2) + " -- nonzero, as it must be for a converged bisection, " +
        "and small enough that the closed form is the same physics rather than different physics");

    // the analytic derivative against the reference's central difference
    const numeric = (t) => { const h = Math.abs(t) * 1e-6; return Math.abs((t / lensEq(t)) * (1 / ((lensEq(t + h) - lensEq(t - h)) / (2 * h)))); };
    let wd = 0;
    for (const t of [1.05, 1.2, 1.6, 2.5, 4, 9, -0.99, -0.8, -0.5, -0.2]) wd = Math.max(wd, Math.abs(magAt(t) - numeric(t)) / magAt(t));
    ok("...and the analytic derivative agrees with the central difference to the difference's own accuracy",
        wd > 0 && wd < 1e-9,
        "worst " + wd.toExponential(2) + " -- NOT zero: the central difference is the less accurate of the two, " +
        "by ~4e-11, which is five orders worse than the epsilon the rest of this path achieves");
}

// ---- 2. THE TRAP THE KERNEL WOULD HAVE FALLEN INTO ----------------------------------------------------------------
// This is the finding, and it is recorded as a live measurement so it cannot rot into a comment nobody rechecks.
{
    const f = Math.fround;
    const literalF32 = (u) => {          // magnifyAt transcribed to f32 exactly as written
        const d = f(Math.sqrt(f(f(u * u) + 4)));
        const m = (t) => {
            const h = f(Math.abs(t) * 1e-6), e = (x) => f(x - f(1 / x));
            return Math.abs(f(f(t / e(t)) * f(1 / f(f(e(f(t + h)) - e(f(t - h))) / f(2 * h)))));
        };
        return f(m(f(f(u + d) * 0.5)) + m(f(f(u - d) * 0.5)));
    };
    let wLit = 0, wClosed = 0;
    for (const u of [0.01, 0.05, 0.1, 0.25, 0.5, 0.9, 1, 1.5, 2, 4, 10]) {
        const ref = muPoint(u);
        wLit = Math.max(wLit, Math.abs(literalF32(u) - ref) / ref);
        wClosed = Math.max(wClosed, Math.abs(muPointF32(u) - ref) / ref);
    }
    ok("!! transcribing the CPU reference into f32 would have produced a ~7% kernel",
        wLit > 1e-2,
        "worst " + wLit.toExponential(2) + " -- and it would have been blamed on the GPU");
    ok("...while the closed form survives f32 four orders better",
        wClosed < 1e-5 && wClosed > 0,
        "worst " + wClosed.toExponential(2));
}

// ---- 3. THE TOLERANCE IS MEASURED, AND THE DEFAULT WOULD HAVE BEEN WRONG -----------------------------------------
{
    const table = sampleTable(48);
    let worst = 0, worstK = -1, spread = 0;
    for (let k = 0; k < N * N; k++) {
        const u0 = cellOffset(k, N, SPAN).u0;
        const ref = cellMag(u0, RHO, table, { precision: "f64" });
        const g = cellMag(u0, RHO, table, { precision: "f32" });
        const gf = cellMag(u0, RHO, table, { precision: "f32", contractFma: true });
        const r = Math.abs(g - ref) / ref;
        if (r > worst) { worst = r; worstK = k; }
        spread = Math.max(spread, Math.abs(gf - g) / ref);
    }
    const centre = (N * N - 1) / 2;
    ok("!! the GPU's worst cell IS the graded cell -- the caustic at the grid centre",
        worstK === centre,
        "worst f32 error " + worst.toExponential(3) + " at cell " + worstK + " (centre is " + centre + "); " +
        "this is why the peak is adjudicated on the CPU rather than read from the proposal");
    // *** v4385 -- THIS MEASURED THE FLOOR ONE ROUNDING SHORT OF THE KERNEL, and then allowed `worst <=
    // F32_FLOOR * 2` on top of it. *** cellMag() above returns a DOUBLE; the shipped kernel writes
    // `out : array<f32>`, so a real run rounds once more on the store. Measured through the store the worst is
    // 4.4196e-6, not the 4.3846e-6 this loop produced -- and a device agrees with the store, at 4.420e-6. The
    // check and the constant were both computed the same wrong way, so they agreed with each other, and the 2x
    // slack (which magmapGpu's header explicitly promised was not there) covered the rest.
    const storeWorst = (() => { let w = 0;
        const emu = magmapEmulated({ n: N, span: SPAN, rho: RHO }).value;    // Float32Array: the kernel's own buffer
        for (let k = 0; k < N * N; k++) { const ref = referenceCell(k, { n: N, span: SPAN, rho: RHO, table });
            w = Math.max(w, Math.abs(emu[k] - ref) / ref); }
        return w; })();
    ok("*** the f32 floor is measured THROUGH THE STORE, as the kernel writes it, and is strictly under the recorded floor ***",
        storeWorst > 0 && storeWorst < F32_FLOOR,
        "through the store " + storeWorst.toExponential(4) + " vs floor " + F32_FLOOR.toExponential(3) +
        "; the same grid measured WITHOUT the store rounds to " + worst.toExponential(4) + ", which is what the old constant was");
    ok("  ...and it reproduces the recorded measurement to the digit, which the old one no longer did",
        Math.abs(storeWorst - MEASURED_F32_WORST) / MEASURED_F32_WORST < 1e-3,
        "a constant nobody re-derives is a constant that drifts, and this one drifted by a rounding step nobody had modelled");
    ok("!! proposeAndVerify's DEFAULT tol would reject a correct kernel",
        worst > 1e-6,
        "which is why MAGMAP_TOL is set to " + MAGMAP_TOL.toExponential(0) + " here, before the first failure, " +
        "rather than widened afterwards to make a red gate go green");
    ok("MAGMAP_TOL covers the floor with margin and is not merely the floor rounded up",
        MAGMAP_TOL > worst && MAGMAP_TOL < 1e-3, "margin " + (MAGMAP_TOL / worst).toFixed(2) + "x");
    ok("fma contraction is NOT the dominant term -- plain f32 rounding is",
        spread > 0 && spread < worst / 10,
        "vendor spread " + spread.toExponential(2) + " vs f32 floor " + worst.toExponential(2) +
        " -- so a second card should not move this materially, which is a prediction the fleet can falsify");
}

// ---- 4. DETECTION POWER: THE SEAM MUST REJECT A WRONG PROPOSER ---------------------------------------------------
// v2893's discipline. A verifier that has only ever accepted has unknown detection power.
{
    const good = magmapEmulated(CFG);
    const vGood = adjudicate(good, CFG);
    ok("a correct f32 proposal is ACCEPTED at the measured tolerance",
        vGood.accepted && vGood.disagreementRate === 0,
        vGood.checked + " cells checked, worst rel " + vGood.worstRelDiff.toExponential(2));

    const detects = (frac) => {
        const bad = new Float32Array(unwrapGpu(good));
        for (let k = 0; k < bad.length; k++) bad[k] = Math.fround(bad[k] * (1 + frac));
        return !adjudicate(bad, CFG).accepted;
    };
    ok("!! a 1e-4 relative error in every cell is CAUGHT", detects(1e-4));
    ok("...and 1e-5 is caught, one order below the floor's neighbourhood", detects(1e-5));
    ok("...and 1e-7 is NOT caught -- the detection floor is stated, not pretended away", !detects(1e-7),
        "a kernel wrong by less than f32 noise is invisible to this gate BY CONSTRUCTION; " +
        "claiming otherwise would be the tautology the census exists to hunt");

    // a single bad cell, not a global scaling -- the sampler must have a real chance of landing on it
    const oneBad = new Float32Array(unwrapGpu(good));
    oneBad[0] = Math.fround(oneBad[0] * 1.01);
    ok("a single corrupted cell at an extreme index is caught (the sampler always checks both ends)",
        !adjudicate(oneBad, CFG).accepted);
}

// ---- 5. THE GRADED NUMBER NEVER COMES FROM THE PROPOSAL ----------------------------------------------------------
{
    const g = gradedPeak(CFG);
    ok("gradedPeak reports its provenance and it is the CPU", g.source === "cpu-f64" && !isGpuSourced(g.peak));
    ok("!! the CPU-graded peak reproduces the closed form sqrt(1+4/rho^2)",
        g.peakErrFrac > 0 && g.peakErrFrac < 1e-6,
        "peak " + g.peak.toFixed(6) + " vs exact " + g.exact.toFixed(6) + ", err " + g.peakErrFrac.toExponential(2) +
        " -- nonzero because a 48x48 quadrature of a divergent integrand is not exact, which is the honest outcome");

    const lens = buildLens({ mode: "map", config: { mapN: N, mapSpan: SPAN, sourceRho: RHO } });
    const rel = Math.abs(g.peak - lens.mapPeak) / lens.mapPeak;
    ok("!! the closed-form reference agrees with the tree's existing bisection map",
        rel > 0 && rel < 1e-9,
        "peaks differ by " + rel.toExponential(2) + " -- nonzero, and it is the central difference's error, not the " +
        "quadratic's: the new route is the more accurate of the two");

    const gpuPeak = Math.max(...unwrapGpu(magmapEmulated(CFG)));
    const degrade = Math.abs(gpuPeak - g.exact) / g.exact;
    ok("!! and this is what accepting a GPU-sourced peak would have cost",
        degrade > g.peakErrFrac * 5,
        "f32 peak error " + degrade.toExponential(2) + " vs CPU " + g.peakErrFrac.toExponential(2) +
        " -- a " + (degrade / g.peakErrFrac).toFixed(0) + "x degradation of the graded observable, disguised as a speedup");
}

// ---- 6. WHAT THIS GATE DOES NOT ESTABLISH -------------------------------------------------------------------------
{
    const em = magmapEmulated(CFG);
    // Read the tag ITSELF -- an earlier draft of this check used `?? "cpu-f32-emulator"` as a fallback, which made
    // it pass without ever touching the provenance record. Corrected in the open: a guard with a default is not a
    // guard, and it is the same shape as the un-awaited promise that fooled the portability flag in v2891.
    ok("the emulator is tagged as an emulator, never as a card",
        isGpuSourced(em) && em.adapter === "cpu-f32-emulator" && em.kernel === "magmap.wgsl",
        "adapter=" + em.adapter + " kernel=" + em.kernel + " -- the label must not name hardware that did not run");

    // and the tag is load-bearing: reading it while the tripwire is armed must be COUNTED, or a GPU-sourced map
    // could reach a portability measurement and be stamped portable for free -- the blind spot v2899 closed.
    armGpuTripwire();
    unwrapGpu(em);
    const t = disarmGpuTripwire();
    ok("!! reading the proposal while armed trips the v2899 guard",
        t.reads === 1 && t.kernels.some((s) => s.includes("magmap.wgsl")),
        "counted " + t.reads + " read: " + t.kernels.join(", ") + " -- the guard's first real client reaches it");
    ok("the shader source is present and free of unspecified transcendentals",
        WGSL.includes("k_magmap") && !/\b(sin|cos|tan|exp|log|pow|inverseSqrt)\s*\(/.test(WGSL),
        "only + - * / sqrt appear; the sampling table is uploaded from the CPU's strictTrig");
    console.log("  NOTE   this gate establishes the contract, the tolerance and the detection floor.");
    console.log("         It does NOT establish that the kernel runs: no GPU is present. Browser verification");
    console.log("         (magmapRun with a real device, on each of the three machines) is the open experiment.");
}

console.log();
if (fails) { console.log("magmap-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("magmap-selfcheck: all checks pass");
