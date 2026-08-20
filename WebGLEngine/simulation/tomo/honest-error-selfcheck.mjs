// WebGLEngine/simulation/tomo/honest-error-selfcheck.mjs -- v3436
//
// Run: node simulation/tomo/honest-error-selfcheck.mjs
//
// THE LAST GATEABLE ENTRY ON THE COVERAGE TRIAGE, AND IT WAS MISFILED AS A HELPER. The triage called it "an
// error-reporting helper; small, and worth a look before deciding" -- and looking is what changed the verdict.
// It BUILDS a phantom, SCANS it, and reports correlation and RMS AGAINST THE TRUTH IMAGE IT GENERATED. *** A
// MODULE THAT MANUFACTURES ITS OWN GROUND TRUTH HAS AN ANSWER KEY BY CONSTRUCTION, which is the opposite of a
// helper: it is the only kind of tomography code that can be graded without a scanner. ***
//
// THE KEYS ARE THE ONES ITS OWN ARITHMETIC MAKES INESCAPABLE: a correlation of exactly 1 against itself, of
// exactly -1 against its own negation, an absolute error of exactly 0 against itself, and an RMS that is a
// TRUE ROOT MEAN SQUARE rather than a mean. Every one is checked against a value derived here, never typed.
"use strict";
import { phantom, scan, corr, absError, rms } from "./honest-error.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const N = 32;
const img = phantom(N);

// ---- 1. THE PHANTOM IS A REAL IMAGE, NOT AN EMPTY BUFFER --------------------------------------------------
{
    const nz = img.filter((v) => v !== 0).length;
    const max = Math.max(...img), min = Math.min(...img);
    ok("!! the phantom has structure: some pixels set, some not, and a finite range",
       img.length === N * N && nz > 0 && nz < img.length && max > min && img.every(Number.isFinite),
       `${nz} of ${img.length} pixels non-zero, range ${min} to ${max}. *** A CHECK RUN ON AN ALL-ZERO IMAGE WOULD PASS EVERY IDENTITY BELOW AND MEAN NOTHING -- corr(0,0) and absError(0,0) are as satisfied by emptiness as by a picture (v3177's "checks pass because it does nothing"). ***`);
}

// ---- 2. THE IDENTITIES, WHICH ARE EXACT AND NOT TOLERANCES ------------------------------------------------
{
    const c1 = corr(img, img);
    ok("!! correlation with itself is EXACTLY 1", Math.abs(c1 - 1) < 1e-12,
       `${c1.toPrecision(17)} -- an identity, and the first thing a wrong normalisation breaks.`);
    const neg = img.map((v) => -v);
    const cN = corr(img, neg);
    ok("!! ...and with its own NEGATION is EXACTLY -1", Math.abs(cN + 1) < 1e-12,
       `${cN.toPrecision(17)}. THE NEGATION IS THE HALF THAT MATTERS: a correlation that returned 1 for both would be measuring MAGNITUDE and calling it agreement, and the self-check alone cannot see that.`);
    const e0 = absError(img, img);
    ok("!! absolute error against itself is EXACTLY zero, every pixel",
       e0.length === img.length && e0.every((v) => v === 0),
       "exact zeros in a float, not small numbers.");
}

// ---- 3. rms IS A ROOT MEAN SQUARE AND NOT A MEAN -----------------------------------------------------------
{
    // Derived, not typed: for [3, 4] the RMS is sqrt((9 + 16)/2) = sqrt(12.5), and the MEAN is 3.5. A mean
    // dressed as an RMS agrees on a constant vector and disagrees the moment the errors differ in size, which
    // is exactly when an error report matters.
    // *** MY FIRST FIXTURE WAS [3, 4], WHERE THE RMS IS 3.5355 AND THE MEAN IS 3.5 -- THIRTY-FIVE THOUSANDTHS
    // APART. A DISCRIMINATOR THAT CANNOT SEPARATE THE TWO CASES IS NOT A DISCRIMINATOR, and I only saw it
    // because the check I wrote to reject the mean rejected the truth instead. [0, 10] parts them by two.
    const want = Math.sqrt(100 / 2), got = rms([0, 10]);
    ok("!! rms squares, averages and roots -- it is not the mean", Math.abs(got - want) < 1e-12 && Math.abs(got - 5) > 1.5,
       `${got.toPrecision(12)} against sqrt(50) = ${want.toPrecision(12)}; the mean would be 5. THE TWO AGREE ON A CONSTANT VECTOR AND PART WHEN THE ERRORS DIFFER, which is the only case worth reporting.`);
    ok("...and it is exactly zero on an all-zero error", rms([0, 0, 0, 0]) === 0);
    ok("...and it grows with the outlier rather than being averaged away by the zeros",
       rms([0, 0, 0, 10]) > rms([2, 2, 2, 2]) * 1.2,
       `${rms([0, 0, 0, 10]).toFixed(4)} against ${rms([2, 2, 2, 2]).toFixed(4)} -- same total absolute error, and the RMS SAYS THEY ARE DIFFERENT. A mean absolute error would call them identical, and one of them is a reconstruction with a hole in it.`);
}

// ---- 4. THE SCAN IS A SINOGRAM, AND ITS SHAPE IS DERIVED FROM THE REQUEST ----------------------------------
{
    // *** angles IS AN ARRAY OF ANGLES, NOT A COUNT -- read from the signature after I passed 24 and got a
    // sinogram of length ZERO. FOURTH TIME THIS SESSION I HAVE WRITTEN AGAINST AN ASSUMED SIGNATURE, and the
    // tree names the species. The zero is what gave it away: a projector that produced no data at all is not a
    // subtle failure, and a check that had asserted `> 0` instead of an exact shape would have found it too. ***
    const mkAngles = (k) => Array.from({ length: k }, (_, i) => (i * Math.PI) / k);
    const angles = mkAngles(24), nDet = N;
    // scan returns {data, angles, nAngles, nDet} -- READ, NOT ASSUMED. My first version treated it as a bare
    // array and every shape check read `undefined`, which compared false and looked like a real failure.
    const sino = scan(img, N, angles, nDet);
    ok("!! the sinogram has one row per angle and one column per detector",
       sino.data.length === angles.length * nDet && sino.nAngles === angles.length && sino.nDet === nDet &&
       [...sino.data].every(Number.isFinite),
       `${sino.data.length} = ${sino.nAngles} angles x ${sino.nDet} detectors, all finite. A SHAPE READ FROM THE ARGUMENTS, so asking for more angles must produce more data -- AND THE OBJECT REPORTS ITS OWN DIMENSIONS, so the two can be compared rather than one being inferred.`);
    const more = scan(img, N, mkAngles(48), nDet);
    ok("...and doubling the angles doubles it", more.data.length === sino.data.length * 2,
       "a sinogram whose size did not follow its request would be silently discarding projections.");
    const blank = scan(new Float64Array(N * N), N, angles, nDet);
    ok("!! an empty image scans to all zeros, so the projector is not manufacturing signal",
       [...blank.data].every((v) => v === 0) && [...sino.data].some((v) => v !== 0),
       "EXACT zeros from nothing, and non-zeros from something. A projector with an additive bug would fail here and nowhere else in this file.");
}

console.log(fails ? "\nhonest-error-selfcheck: " + fails + " FAILED" : "\nhonest-error-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
