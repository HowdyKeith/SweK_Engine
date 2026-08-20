// WebGLEngine/physics/tomography/fanbeam-selfcheck.mjs -- v2811
//
// Run: node physics/tomography/fanbeam-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/tomography/fanbeam.js -- fan-beam CT, parked extension #11, the last one.
//
// THE PRIMARY ANSWER KEY IS AN EXACT IDENTITY, not a similarity score: a fan ray leaving a point source at
// (beta, gamma) IS the parallel ray at theta = beta + gamma + pi/2, offset t = -D sin(gamma). Same straight line
// through the same phantom. So the mapping can be checked ray by ray against a line integral computed in the
// parallel frame, and any error is quantization, not physics.
//
// THAT IDENTITY IS ALSO WHAT THE FIRST IMPLEMENTATION GOT WRONG. It used the textbook theta = beta + gamma,
// t = +D sin(gamma), which assumes a different reference axis than ct.js's radon(). The symptom was diagnostic:
// the fan-vs-parallel divergence sat FLAT at 0.31 no matter how far away the source moved. A real convergence
// failure shrinks with distance; a mismatched frame does not. Deriving the mapping against this codebase's own
// convention dropped it to 0.03.
//
// AND THE LOAD-BEARING NEGATIVE: reconstruct the fan data WITHOUT rebinning -- feed it to the parallel FBP as if
// the rays were parallel -- and the image must visibly degrade. If it did not, the rebinning would be decoration.

import { phantomField, radon, filteredBackProjection, scoreRecon, angleSet } from "./ct.js";
import { fanHalfAngle, fanAngles, betaSet, fanProjection, rebinToParallel, sinoDivergence } from "./fanbeam.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const N = 96, nDet = 96, D = 200;
const PH = [{ cx: 0, cy: 0, a: 0.7, b: 0.5, rho: 1 }, { cx: 0.25, cy: 0.15, a: 0.2, b: 0.15, rho: 0.6 }, { cx: -0.3, cy: -0.2, a: 0.12, b: 0.12, rho: -0.4 }];
const img = phantomField(N, PH);
const gmax = fanHalfAngle(D, N / 2 * 1.05);

// 1. GEOMETRY HELPERS
{
    ok("fanHalfAngle = asin(R/D)", Math.abs(fanHalfAngle(100, 50) - Math.asin(0.5)) < 1e-12);
    ok("a closer source needs a WIDER fan", fanHalfAngle(60, 50) > fanHalfAngle(600, 50));
    const g = fanAngles(64, 0.3);
    ok("fanAngles: right count, symmetric, inside the half angle", g.length === 64 && Math.abs(g[0] + g[63]) < 1e-12 && Math.abs(g[0]) < 0.3);
    const b = betaSet(180);
    ok("betaSet covers a full rotation", b.length === 180 && Math.abs(b[0]) < 1e-12 && b[179] < 2 * Math.PI);
}

// 2. THE EXACT IDENTITY -- a fan ray IS a parallel ray at the mapped coordinates
{
    const half = N / 2, steps = 1200;
    const lineIntegral = (theta, t) => {
        let s = 0; const dt = (2 * half * 1.5) / steps;
        for (let k = 0; k < steps; k++) {
            const u = -half * 1.5 + (k + 0.5) * dt;
            const x = t * Math.cos(theta) - u * Math.sin(theta), y = t * Math.sin(theta) + u * Math.cos(theta);
            const px = (x + half) | 0, py = (y + half) | 0;
            if (px >= 0 && px < N && py >= 0 && py < N) s += img[py * N + px];
        }
        return s * dt;
    };
    let worst = 0, n = 0;
    for (const beta of [0, 0.7, 1.9, 3.3, 5.1]) {
        for (const gamma of [-0.15, -0.05, 0, 0.08, 0.19]) {
            const fan = fanProjection(img, N, [beta], [gamma], D, { steps })[0][0];
            const par = lineIntegral(beta + gamma + Math.PI / 2, -D * Math.sin(gamma));
            // Rays that miss the phantom integrate to ~0, and a RELATIVE error against zero is meaningless --
            // so they are excluded from the comparison rather than allowed to produce a fake pass or fail.
            if (Math.abs(par) > 1e-6) { worst = Math.max(worst, Math.abs(fan - par) / Math.abs(par)); n++; }
        }
    }
    ok("RAY IDENTITY: fan(beta,gamma) == parallel(beta+gamma+pi/2, -D sin gamma)", worst < 0.02 && n >= 15, `worst rel diff ${worst.toExponential(2)} over ${n} rays that actually cross the phantom`);
}

// 3. REBINNING lands the fan data on the parallel grid
{
    const angles = angleSet(120), par = radon(img, N, angles, nDet);
    const gammas = fanAngles(nDet, gmax), betas = betaSet(240);
    const reb = rebinToParallel(fanProjection(img, N, betas, gammas, D), betas, gammas, D, angles, nDet, N);
    const div = sinoDivergence(reb, par);
    ok("rebinned fan sinogram matches the parallel one", div < 0.06, "divergence=" + div.toFixed(4));
    ok("rebinning fills every angle bin (no empty projections)", reb.every((row) => row.some((v) => v !== 0)));
}

// 4. RECONSTRUCTION against the phantom we own
{
    const angles = angleSet(120), gammas = fanAngles(nDet, gmax), betas = betaSet(240);
    const reb = rebinToParallel(fanProjection(img, N, betas, gammas, D), betas, gammas, D, angles, nDet, N);
    const recFan = filteredBackProjection(reb, N, angles, nDet, true);
    const recPar = filteredBackProjection(radon(img, N, angles, nDet), N, angles, nDet, true);
    const cf = scoreRecon(recFan, img).corr, cp = scoreRecon(recPar, img).corr;
    ok("fan + rebinning reconstructs the phantom well", cf > 0.95, "corr=" + cf.toFixed(4));
    ok("...within reach of the parallel reconstruction", cf > cp - 0.05, `fan ${cf.toFixed(4)} vs parallel ${cp.toFixed(4)}`);

    // THE LOAD-BEARING NEGATIVE
    const naive = filteredBackProjection(fanProjection(img, N, betas.slice(0, angles.length), gammas, D), N, angles, nDet, true);
    const cn = scoreRecon(naive, img).corr;
    ok("LOAD-BEARING: skipping the rebinning visibly degrades the image", cn < cf - 0.1, `no-rebin ${cn.toFixed(4)} vs rebinned ${cf.toFixed(4)}`);
    ok("...and the unfiltered back-projection is worse still (the ramp filter still matters)", scoreRecon(filteredBackProjection(reb, N, angles, nDet, false), img).corr < cf);
}

// 5. divergence measure behaves
{
    const a = [new Float64Array([1, 2, 3]), new Float64Array([4, 5, 6])];
    ok("sinoDivergence of a sinogram with itself is 0", sinoDivergence(a, a) < 1e-12);
    ok("sinoDivergence is scale-invariant", Math.abs(sinoDivergence(a.map((r) => r.map((v) => v * 7)), a)) < 1e-12);
}

// 6. geometry converges: a distant source means a narrow fan
{
    const wide = fanHalfAngle(50, 48), narrow = fanHalfAngle(5000, 48);
    ok("half fan angle shrinks toward zero as the source recedes", narrow < 0.02 && wide > 0.5, `${(wide * 180 / Math.PI).toFixed(1)} deg vs ${(narrow * 180 / Math.PI).toFixed(3)} deg`);
}

// 7. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./fanbeam.js", import.meta.url), "utf8");
    ok("fanbeam.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("fanbeam-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
