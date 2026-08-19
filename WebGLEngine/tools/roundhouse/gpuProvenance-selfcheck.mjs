// tools/roundhouse/gpuProvenance-selfcheck.mjs
//
// Run: node tools/roundhouse/gpuProvenance-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2899 -- A GUARD ARMED BEFORE THERE IS ANYTHING TO CATCH.
//
// The fleet was confirmed bit-identical across three machines this week. That guarantee is enforced by
// measurePortability(), which refuses any observable whose path touches an unspecified transcendental. A GPU
// result walks straight past it: a value returned from a compute shader makes no Math.* call, so the tripwire
// sees a clean run and stamps it portable -- while WGSL pins neither transcendental rounding, nor fma
// contraction, nor reduction order. Two cards may legitimately differ, and the fingerprint would either report an
// unexplained divergence or, worse, none at all because the baseline was captured on whichever card ran first.
//
// The blind spot only bites once a GPU path exists, which is precisely when it is hardest to notice. So the guard
// lands now, with nothing yet to catch, and the first real client -- the magnification map -- is built on the
// deterministic path so a future kernel has something to be VERIFIED AGAINST rather than trusted instead of.

import { markGpu, isGpuSourced, unwrapGpu, measurePortabilityGpu, proposeAndVerify, armGpuTripwire, disarmGpuTripwire } from "./gpuProvenance.mjs";
import { measurePortabilityAsync } from "./corroborate.mjs";
import { buildLens, magnificationMap } from "./lensBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE BLIND SPOT IS REAL, AND THEN CLOSED -------------------------------------------------------------------
{
    const fakeKernel = () => markGpu(42.5, { kernel: "magmap.wgsl", adapter: "test" });

    // the OLD guard: a GPU value reads clean, because it makes no Math call
    const libmOnly = await measurePortabilityAsync(() => unwrapGpu(fakeKernel()));
    ok("!! the libm tripwire alone stamps a GPU value PORTABLE -- the blind spot, demonstrated",
        libmOnly.rawCalls === 0,
        "zero raw libm calls, because a shader result makes none; this is exactly how a non-deterministic value would have entered the fingerprint unchallenged");

    // the NEW guard: both tripwires
    const both = await measurePortabilityGpu(() => unwrapGpu(fakeKernel()), measurePortabilityAsync);
    ok("!! with the GPU tripwire armed the same value is REFUSED",
        both.portable === false && both.gpuReads === 1 && /WGSL/.test(both.reason),
        both.reason.slice(0, 120) + "...");
    ok("...and it names the kernel", both.gpuKernels.some((k) => k.includes("magmap.wgsl")), both.gpuKernels.join("; "));

    // a genuine CPU path still passes both
    const clean = await measurePortabilityGpu(() => 1 + 2 * 3, measurePortabilityAsync);
    ok("a pure-arithmetic CPU value passes both tripwires", clean.portable === true && clean.gpuReads === 0 && clean.rawCalls === 0);

    // and a libm-using path still fails for the ORIGINAL reason, unchanged
    const libmy = await measurePortabilityGpu(() => Math.log(7), measurePortabilityAsync);
    ok("...and a libm path still fails for the original reason", libmy.portable === false && /raw libm/.test(libmy.reason));
}

// ---- 2. PROVENANCE IS STRUCTURAL, NOT A NAMING CONVENTION ---------------------------------------------------------
{
    const tagged = markGpu([1, 2, 3], { kernel: "k" });
    ok("a tagged value is recognisable and unwraps to its payload",
        isGpuSourced(tagged) && !isGpuSourced([1, 2, 3]) && unwrapGpu(tagged).length === 3);
    armGpuTripwire();
    unwrapGpu(tagged); unwrapGpu(tagged); unwrapGpu(7);
    const t = disarmGpuTripwire();
    ok("!! reads are counted only while armed, and only for tagged values", t.reads === 2,
        "two tagged reads, one bare value ignored -- the same shape as the libm tripwire, for the same reason");
}

// ---- 3. THE CONTRACT: GPU PROPOSES, CPU ADJUDICATES ---------------------------------------------------------------
{
    const truth = Array.from({ length: 400 }, (_, i) => Math.sqrt(i + 1));
    const recompute = (i) => Math.sqrt(i + 1);

    const good = proposeAndVerify({ proposal: markGpu(truth.slice(), { kernel: "ok.wgsl" }), recompute, sample: 32, tol: 1e-9 });
    ok("!! a faithful proposal is ACCEPTED after CPU spot-checks", good.accepted === true && good.disagreementRate === 0,
        good.checked + " cells verified on the deterministic path, worst relative difference " + good.worstRelDiff.toExponential(1));

    const drifted = truth.slice();
    drifted[399] *= 1 + 1e-4;                       // the extremes are where GPU maths breaks first, so they are always checked
    const bad = proposeAndVerify({ proposal: markGpu(drifted, { kernel: "drift.wgsl" }), recompute, sample: 32, tol: 1e-9 });
    ok("!! a drifted proposal is REJECTED, and the caller is told to fall back rather than crash",
        bad.accepted === false && bad.disagreed > 0 && /fall back/.test(bad.verdict),
        "worst " + bad.worstRelDiff.toExponential(1) + " at index " + bad.worstIndex + " -- the endpoints are verified unconditionally");
    ok("...and the disagreement RATE is itself an observable, not a discarded boolean",
        typeof bad.disagreementRate === "number" && bad.disagreementRate > 0,
        "rate " + bad.disagreementRate.toFixed(4) + " -- a kernel that drifts is telling you something measurable about itself");
}

// ---- 4. THE FIRST CLIENT: THE FULL MAGNIFICATION MAP, ON THE DETERMINISTIC PATH -----------------------------------
{
    const m = buildLens({ mode: "map" });
    ok("!! the map's brightest cell matches sqrt(1 + 4/rho^2) -- the whole grid has an answer key",
        m.mapPeakErrFrac > 0 && m.mapPeakErrFrac < 1e-5,
        m.mapN + "x" + m.mapN + " = " + m.mapCells + " cells; peak " + m.mapPeak.toFixed(4) + " vs exact " + m.mapPeakExact.toFixed(4) +
        " (err " + m.mapPeakErrFrac.toExponential(2) + ") -- nonzero, so the quadrature is not reading back its own formula");
    ok("!! the caustic sits exactly at the centre, as a point lens demands",
        m.mapCaustic.i === m.mapCaustic.centre && m.mapCaustic.j === m.mapCaustic.centre,
        "peak cell (" + m.mapCaustic.i + "," + m.mapCaustic.j + ") of a " + m.mapN + " grid centred at " + m.mapCaustic.centre);

    // the map is CPU-computed, so it must pass both tripwires -- this is the reference a kernel gets graded against
    const port = await measurePortabilityGpu(() => magnificationMap({ n: 5, span: 0.6, rho: 0.1 }).cells[12], measurePortabilityAsync);
    // THE GUARD'S FIRST LIVE CATCH, AND THE FIX (v2899 found it, v2900 closed it).
    // The guard caught finiteSourceMag making 172,825 unspecified libm calls per reference map -- 57,600 Math.cos
    // alone -- which meant the magnification map was a same-machine reference pretending to be a fleet-wide one.
    // The polar sampling now uses strictSin/strictCos and the radius uses the specified sqrt instead of hypot, so
    // the map is portable by construction and CAN serve as a cross-machine answer key for a future kernel.
    ok("!! the reference map now passes BOTH tripwires -- no unspecified libm, no GPU provenance",
        port.portable === true && port.rawCalls === 0 && port.gpuReads === 0,
        "the guard found this on its first live use and the fix is the same two substitutions v2889 applied to " +
        "flowfieldCpu and solarSystem; a future magmap.wgsl now has a fleet-wide answer key to be verified against");
}

// ---- 5. THE FIX CHANGED THE CONTRACT, NOT THE PHYSICS -------------------------------------------------------------
{
    // strictTrig is correctly rounded, so on a conforming host it reproduces the same bits this machine's libm gave.
    // The point was never to change the numbers -- it was to stop the numbers depending on WHICH libm ran.
    const m = buildLens({ mode: "map" });
    ok("!! the measured physics is unchanged by the conversion", Math.abs(m.mapPeakErrFrac - 1.35e-7) < 1e-8,
        "peak error still " + m.mapPeakErrFrac.toExponential(2) + " against sqrt(1+4/rho^2) -- strictTrig is correctly " +
        "rounded, so it agrees with a conforming libm bit for bit; what changed is that it now agrees with EVERY conforming libm");
    const f = [0.05, 0.1, 0.3].map((rho) => buildLens({ mode: "finite", config: { sourceRho: rho } }).sizeErrFrac);
    ok("...and the lens still works as a ruler, to the same precision", f.every((e) => e > 0 && e < 1e-6),
        "size inference errors " + f.map((e) => e.toExponential(1)).join(", ") + " -- unchanged");
}

console.log();
if (fails) { console.log("gpuProvenance-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gpuProvenance-selfcheck: all checks pass");
