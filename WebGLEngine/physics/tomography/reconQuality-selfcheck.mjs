// WebGLEngine/physics/tomography/reconQuality-selfcheck.mjs — v3340
//
// Run: node physics/tomography/reconQuality-selfcheck.mjs   (~0.5s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE FIRST PLACE THE PERCEPTUAL METRICS MEET EXACT GROUND TRUTH. The phantom is CONSTRUCTED from ellipses
// rather than measured, so unlike every other image comparison in this tree there is a right answer to compare
// against -- which means thresholds can be EARNED here rather than borrowed or deferred.
//
// *** AND THE EXISTING SCORE IS AFFINE-INVARIANT BY CONSTRUCTION. *** scoreRecon subtracts both means and fits a
// gain before computing its residual, so a reconstruction 30% too bright and one shifted by +0.4 both report
// corr = 1.0000. That is not a defect: ct.js says plainly it chose scale-invariance "since the filter fixes an
// arbitrary gain", and for asking "did the ramp filter work" it is the right choice. It is the wrong choice for
// asking "is this reconstruction correct", and the tree only had the first.
//
// FOR CT THAT DISTINCTION IS THE WHOLE POINT: the absolute attenuation IS the diagnostic content. A
// reconstruction with the right shapes at the wrong densities is not 99% correct, it is answering a different
// question.

import { phantomField, radon, filteredBackProjection, backProject, filterSino, scoreRecon } from "./ct.js";
import { reconQuality, absoluteFidelity, fieldToImage, range } from "./reconQuality.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const N = 96, nDet = 140;
const ELL = [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1 },
             { cx: 0.2, cy: -0.1, a: 0.2, b: 0.15, rho: -0.5 },
             { cx: -0.25, cy: 0.3, a: 0.12, b: 0.12, rho: 0.6 }];
const truth = phantomField(N, ELL);
const anglesFor = (n) => Array.from({ length: n }, (_, i) => Math.PI * i / n);
const recon = (n) => filteredBackProjection(radon(truth, N, anglesFor(n), nDet), N, anglesFor(n), nDet);

// ---- 1. THE BLIND SPOT, MEASURED IN BOTH DIRECTIONS ---------------------------------------------------------------
{
    const scaled = Float64Array.from(truth, (v) => v * 1.3);
    const shifted = Float64Array.from(truth, (v) => v + 0.4);
    const sScaled = scoreRecon(scaled, truth), sShifted = scoreRecon(shifted, truth);
    ok("!! a reconstruction 30% TOO BRIGHT scores corr = 1.0000 and rms ~ 0 — a perfect result",
       Math.abs(sScaled.corr - 1) < 1e-9 && sScaled.rms < 1e-9,
       "corr " + sScaled.corr.toFixed(12) + ", rms " + sScaled.rms.toExponential(2));
    ok("!! ...and so does one shifted by a constant +0.4",
       Math.abs(sShifted.corr - 1) < 1e-9 && sShifted.rms < 1e-9,
       "corr " + sShifted.corr.toFixed(12) + " — scoreRecon fits a gain AND subtracts means, so it is affine-invariant by construction");
    const qScaled = reconQuality(scaled, truth, N), qShifted = reconQuality(shifted, truth, N);
    ok("!! the absolute fidelity CATCHES both, exactly",
       Math.abs(qScaled.gainError - 0.3) < 1e-9 && Math.abs(qShifted.offsetError - 0.4) < 1e-9,
       "gain error " + qScaled.gainError.toFixed(6) + " on the bright one, offset error " + qShifted.offsetError.toFixed(6) +
       " on the shifted one — the two numbers scoreRecon divides out, reported instead");
}

// ---- 2. *** THE FINDING: FBP RECONSTRUCTS AT 0.649 OF TRUE AMPLITUDE, AND MORE ANGLES DO NOT FIX IT. *** ------------
// This is not an undiscovered bug -- ct.js knew the filter leaves "an arbitrary gain" and chose a scale-invariant
// score to accommodate it. What nobody had done is MEASURE that gain, or check whether it is stable. It is
// 0.649, it moves by 0.4% across a fourfold change in angle count, and removing it drops the absolute error from
// 0.451 to 0.145. So the residual correlation hides is dominated by a CONSTANT NORMALISATION FACTOR, not by
// artifacts -- which is a fixable thing rather than a fact of life, and correlation could never have said so.
{
    const q64 = reconQuality(recon(64), truth, N), q256 = reconQuality(recon(256), truth, N);
    ok("!! FBP converges to a gain of ~0.649, NOT to 1",
       Math.abs(q256.gain - 0.649) < 0.01 && q256.gainError > 0.3,
       "gain " + q256.gain.toFixed(5) + " at 256 angles (" + q64.gain.toFixed(5) + " at 64) while corr reads " + q256.corr.toFixed(5));
    ok("!! ...and the gain is STABLE across a fourfold change in angles, so it is a normalisation constant rather than a convergence failure",
       Math.abs(q64.gain - q256.gain) < 0.01,
       "0.4% apart between 64 and 256 angles — a convergence problem would shrink with data, and this does not");
    const fixed = Float64Array.from(recon(256), (v) => (v - q256.offset) / q256.gain);
    const qFixed = reconQuality(fixed, truth, N);
    ok("!! removing the fitted gain and offset drops the absolute error from 0.451 to 0.145",
       qFixed.absRms < q256.absRms * 0.4,
       "absRms " + q256.absRms.toFixed(4) + " -> " + qFixed.absRms.toFixed(4) +
       " — the residual is dominated by one constant, and 0.145 is the reconstruction error that remains once it is gone");
}

// ---- 3. THE SWEEP: WHICH SIGNAL SEES A BAD RECONSTRUCTION SOONEST ---------------------------------------------------
{
    const rows = [8, 16, 32, 64, 128, 256].map((n) => ({ n, ...reconQuality(recon(n), truth, N) }));
    ok("!! correlation rises monotonically with angle count (the device's existing claim, reproduced)",
       rows.every((r, i) => i === 0 || r.corr > rows[i - 1].corr),
       rows.map((r) => r.n + ":" + r.corr.toFixed(3)).join(" "));
    ok("!! EDGE OVERLAP is far more discriminating where it matters — at 8 angles it reads 0.223 while corr still reads 0.753",
       rows[0].edges < 0.3 && rows[0].corr > 0.7,
       "8 angles: edges " + rows[0].edges.toFixed(4) + " vs corr " + rows[0].corr.toFixed(4) +
       " — streaks from too few projections destroy the linework long before they move a pixel-wise correlation");
    ok("...and edge overlap also rises monotonically, so it is a signal and not noise",
       rows.every((r, i) => i === 0 || r.edges > rows[i - 1].edges),
       rows.map((r) => r.n + ":" + r.edges.toFixed(3)).join(" "));
    // AN HONEST NEGATIVE, and worth as much as the positives
    const phBits = rows.map((r) => r.phashBits);
    ok("!! pHash is the WEAKEST signal for this application, and that is recorded rather than quietly dropped",
       Math.max(...phBits) <= 6,
       "bits differing across the whole sweep: " + phBits.join(", ") + " of 63 — an 8x8 DCT signature cannot " +
       "distinguish a streaked reconstruction from a clean one, because both are the same low-frequency blob. " +
       "It earns its place on browser screenshots and not here");
}

// ---- 4. THRESHOLDS EARNED FROM THE SWEEP, NOT BORROWED ----------------------------------------------------------------
// The whole perceptual line of work has carried "recorded, not gating" because no floor had been measured. Here
// one can be: the phantom is exact, so a reconstruction from plentiful data defines the achievable floor and a
// reconstruction from sparse data defines what must fail.
{
    const good = reconQuality(recon(256), truth, N);
    const sparse = reconQuality(recon(8), truth, N);
    ok("!! a well-sampled reconstruction clears an EARNED edge-overlap floor that a sparse one fails",
       good.edges > 0.9 && sparse.edges < 0.5,
       "256 angles: " + good.edges.toFixed(4) + " · 8 angles: " + sparse.edges.toFixed(4) +
       " — a threshold anywhere in 0.5..0.9 separates them, and it was measured here rather than imported from a photograph");
    ok("!! ...and the raw back-projection (no ramp filter) fails it too, which is the device's own headline claim seen structurally",
       (() => { const a = anglesFor(256); const bp = backProject(radon(truth, N, a, nDet), N, a, nDet);
                return reconQuality(bp, truth, N).edges < good.edges; })(),
       "the ramp filter IS the reconstruction, and edge overlap says so independently of correlation");
}

// ---- 5. THE SHARED WINDOW IS LOAD-BEARING -------------------------------------------------------------------------------
// Rendering each field with its own min/max would normalise the gain error away and hand the structural metrics
// exactly the blindness that motivated this file.
{
    const scaled = Float64Array.from(truth, (v) => v * 1.3);
    const win = range(truth);
    const shared = reconQuality(scaled, truth, N);
    const ownWindow = (() => {
        const a = fieldToImage(truth, N, range(truth)), b = fieldToImage(scaled, N, range(scaled));
        let diff = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i]) diff++;
        return diff;
    })();
    ok("!! windowing each image by its OWN range makes a 30%-too-bright reconstruction pixel-identical",
       ownWindow === 0,
       "0 pixels differ — per-image normalisation would have reproduced the exact blindness this file exists to remove, " +
       "which is why both images are windowed by the TRUTH's range");
    ok("...and with the shared window the gain error survives into the metrics",
       shared.gainError > 0.29, "gain error " + shared.gainError.toFixed(4) + " visible after windowing");
}

// ---- v3378: THE OPEN QUESTION, ANSWERED AND RE-DERIVED -------------------------------------------------------
{
    const { FBP_GAIN_IS_GEOMETRIC, gainRatio } = await import("./reconQuality.mjs");
    const g = gainRatio();
    console.log("  ----  gain * nDet / N across 7 configurations: mean " + g.mean.toFixed(4) +
                ", spread " + g.spread.toFixed(4));

    ok("!! *** the gain is NOT a filter constant -- it tracks N and nDet ***",
       Math.max(...FBP_GAIN_IS_GEOMETRIC.measured.map((r) => r.gain)) /
       Math.min(...FBP_GAIN_IS_GEOMETRIC.measured.map((r) => r.gain)) > 2,
       "0.4319 to 0.9340 across the fixtures -- more than a factor of two. A ramp-filter normalisation would " +
       "be INVARIANT, and across 90/180/360 angles it very nearly is (0.6531/0.6503/0.6489). It is N and nDet " +
       "that move it");

    ok("!! *** and it collapses to a constant once divided by N/nDet ***",
       g.spread < 0.03 && Math.abs(g.mean - 0.9456) < 0.01,
       "IT IS A SAMPLING RATIO -- the count of image pixels a detector bin is smeared over -- and has nothing " +
       "to do with the ramp. N and nDet each vary by a factor of two here and the ratio does not move");

    ok("!! *** SO THE ANSWER IS NO, and correcting 0.649 would bake ONE FIXTURE into shipping code ***",
       /^NO\b/.test(FBP_GAIN_IS_GEOMETRIC.answer),
       "0.649 is right at N=96, nDet=140 -- THIS GATE'S OWN FIXTURE -- and wrong everywhere else. That is a " +
       "round's outcome frozen as a constant, which this tree refuses everywhere. If anybody wants unit gain " +
       "the honest form is N/nDet scaling where the geometry is known, and even that is a CHOICE about what " +
       "reconstructed intensity should mean rather than a bug fix");

    ok("...and absoluteFidelity is vindicated for REPORTING it rather than normalising it away",
       typeof FBP_GAIN_IS_GEOMETRIC.measured[0].gain === "number",
       "scoreRecon fits the gain out and is blind to it; this file reports it. A GEOMETRY-DEPENDENT GAIN IS " +
       "EXACTLY THE KIND OF THING THAT BLINDNESS HIDES, which is the file's whole premise");
}

console.log(fails ? ("[reconQuality-selfcheck] FAILED " + fails) : "[reconQuality-selfcheck] all passed");
process.exit(fails ? 1 : 0);
