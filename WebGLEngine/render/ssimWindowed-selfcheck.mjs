// WebGLEngine/render/ssimWindowed-selfcheck.mjs — v3691
//
// Run: node render/ssimWindowed-selfcheck.mjs   (~2s)
//
// *** THE HEADLINE OF THIS GATE IS A RESULT I DID NOT EXPECT AND IT CHANGES WHAT THE METRIC SHOULD REPORT. ***
// The round was built on a measurement: SweK's global ssim() reads 0.99872 when 0.10% of a 256x256 render is
// inverted, so a local defect barely moves it. The obvious fix is the paper's windowed SSIM -- and THE WINDOWED
// MEAN READS 0.99810 ON THE SAME FIXTURE, which is not a fix, it is the same blindness with more arithmetic.
// WHAT ACTUALLY SEES THE DEFECT IS THE MINIMUM OF THE LOCAL MAP: -0.7006. So the observable worth reporting from
// a windowed SSIM is the WORST WINDOW, and mssim alone would have been a new number with the old failure inside
// it. The checks below are ordered to make that the load-bearing one.
"use strict";
import { ssimWindowed, offsetKey, gainKey, gaussian1d } from "./ssimWindowed.mjs";
import { ssim } from "./perceptual.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);

const W = 256, H = 256;
const mk = (f) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = f(x, y), i = (y * W + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    return { data: d, width: W, height: H };
};
const base = (x, y) => 128 + 100 * Math.sin(x / 9) * Math.cos(y / 11);
const A = mk(base);

console.log("ssimWindowed-selfcheck -- the local map, and what the mean of it cannot say\n");

// ---- 1. THE ANSWER KEYS ARE CLOSED FORMS THIS CODE IS NEVER TOLD ------------------------------------------------
{
    ok("!! an image against itself is EXACTLY 1", ssimWindowed(A, A).mssim === 1,
        "arithmetic, not a tolerance: numerator and denominator become the same expression term for term");

    // b = a + d: contrast and structure are exactly 1, so SSIM collapses to the luminance term. The expected
    // value comes from the PUBLISHED DEFINITION, computed independently in offsetKey -- not from this estimator.
    const F = mk(() => 100), G = mk(() => 120);
    const got = ssimWindowed(F, G).mssim, want = offsetKey(100, 20);
    ok("!! a constant OFFSET reproduces the published closed form",
        Math.abs(got - want) < 1e-9,
        got.toFixed(12) + " against " + want.toFixed(12) + " (|d| = " + Math.abs(got - want).toExponential(2) +
        "). THE CONTRAST AND STRUCTURE TERMS ARE EXACTLY 1 HERE, so this grades the luminance term alone -- and " +
        "an estimator that got the window weights wrong would still pass it, which is why the gain case follows");

    const H2 = mk(() => 150), gotG = ssimWindowed(F, H2).mssim, wantG = gainKey(100, 1.5);
    ok("!! ...and a GAIN reproduces its closed form too", Math.abs(gotG - wantG) < 1e-9,
        gotG.toFixed(12) + " against " + wantG.toFixed(12));

    const k = gaussian1d(11, 1.5);
    let sum = 0; for (const v of k) sum += v;
    // *** THE SHAPE OF THE WINDOW IS PINNED AGAINST A DERIVED RATIO, BECAUSE A PLANT SHOWED THE OTHER CHECKS
    // CANNOT SEE IT. *** Replacing the Gaussian with a BOX window passed everything above: the offset and gain
    // keys use FLAT patches, where every normalised symmetric window gives the same answer, so THOSE KEYS GRADE
    // THE SSIM FORMULA AND NOT THE WINDOW. The ratio of the edge weight to the centre weight is exp(-c^2/2s^2)
    // from sigma alone -- 0.003866... for c = 5, sigma = 1.5 -- and nothing here types it.
    const wantRatio = Math.exp(-(5 * 5) / (2 * 1.5 * 1.5));
    ok("!! the window is the paper's GAUSSIAN, not merely normalised and symmetric",
        Math.abs(k[0] / k[5] - wantRatio) < 1e-15,
        "edge/centre " + (k[0] / k[5]).toExponential(6) + " against exp(-c^2/2s^2) = " + wantRatio.toExponential(6) +
        ". A BOX WINDOW PASSES EVERY OTHER CHECK IN THIS FILE -- found by a plant that did not fire, which is the " +
        "only reason this line exists");
    ok("!! ...and it is normalised and symmetric", Math.abs(sum - 1) < 1e-15 && Math.abs(k[0] - k[10]) < 1e-18,
        "sum " + sum.toFixed(15) + ". A 2-D circularly symmetric Gaussian IS separable, so the 1-D pass is the " +
        "paper's window rather than an approximation of it -- a 'fast Gaussian' that was not would change the " +
        "number while reading like an optimisation");
}

// ---- 2. *** THE FINDING: THE MEAN IS NEARLY AS BLIND AS THE GLOBAL FORM. THE MINIMUM IS NOT. *** ----------------
{
    say("local defect on a 256x256 render -- global vs windowed MEAN vs windowed WORST WINDOW:");
    const rows = [];
    for (const s of [8, 16, 32]) {
        const B = mk((x, y) => (x < s && y < s) ? 255 - base(x, y) : base(x, y));
        const r = ssimWindowed(A, B);
        rows.push({ s, global: ssim(A, B), mean: r.mssim, min: r.min, at: r.minAt });
        say("  " + String(s).padStart(2) + "x" + s + " (" + ((s * s / (W * H)) * 100).toFixed(2) + "% of pixels)" +
            "   global " + rows[rows.length - 1].global.toFixed(5) +
            "   mean " + r.mssim.toFixed(5) + "   WORST " + r.min.toFixed(4) + " at (" + r.minAt.x + "," + r.minAt.y + ")");
    }
    const small = rows[0];
    ok("!! *** THE WINDOWED MEAN DOES NOT RESCUE A LOCAL DEFECT, AND THAT IS THE POINT ***",
        small.mean > 0.99 && small.global > 0.99,
        "mean " + small.mean.toFixed(5) + " against global " + small.global.toFixed(5) + " on 0.10% of pixels. " +
        "I BUILT THIS EXPECTING THE MEAN TO BE THE FIX AND IT IS NOT -- averaging a local map over an image is " +
        "still an average over the image. Reporting mssim alone would have been a NEW NUMBER WITH THE OLD " +
        "FAILURE INSIDE IT, and this check exists so nobody later 'simplifies' the return down to it.");
    ok("!! *** THE WORST WINDOW SEES IT: strongly negative where both means say ~0.99 ***",
        small.min < 0 && small.min < small.mean - 1.5,
        "worst window " + small.min.toFixed(4) + ". THIS is the observable render QA wants: a defect confined to " +
        "one region is exactly what a per-window minimum is for, and exactly what any whole-image statistic " +
        "cannot express");
    ok("...and it LOCATES it, which a scalar never can",
        small.at.x < 16 && small.at.y < 16,
        "worst at (" + small.at.x + "," + small.at.y + "), inside the 8x8 corner that was inverted. A metric that " +
        "says WHERE turns a red gate into a fixable bug report");
}

// ---- 3. IT REFUSES THE CASES WHERE IT WOULD SILENTLY BECOME SOMETHING ELSE --------------------------------------
{
    const small = { data: new Uint8ClampedArray(8 * 8 * 4), width: 8, height: 8 };
    let threw = false;
    try { ssimWindowed(small, small, { win: 11 }); } catch { threw = true; }
    ok("!! a window wider than the image is REFUSED, not silently degraded",
        threw,
        "a window covering the whole image IS the global form, and quietly returning that would make this file " +
        "indistinguishable from the one it exists to be distinguished from -- the worst possible failure here");

    let threw2 = false;
    try { ssimWindowed(A, { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }); } catch { threw2 = true; }
    ok("...and a size mismatch is refused rather than compared over the overlap",
        threw2, "comparing the top-left corner of one render against a whole other one is a number nobody asked for");
}

if (fails) { console.log("\nssimWindowed-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\nssimWindowed-selfcheck: all checks pass");
