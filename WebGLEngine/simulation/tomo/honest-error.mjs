// WebGLEngine/simulation/tomo/honest-error.mjs — v2544
//
// "I would rather get 2 + 2 + 2 = 8, than 2 x 2 x 2 = 9."
//
// Both are wrong. The first is wrong by 33%, the second by 12.5%. The second is MORE ACCURATE AND WORSE, and the
// reason is that 2+2+2 is auditable -- three terms, one operation, the error sits somewhere you can point at --
// while 2x2x2 smears its error through a compounding method. Better by every metric except the one that matters.
//
// THIS FILE TESTS THAT IN THE PLACE IT ACTUALLY BITES: tomographic reconstruction with a missing wedge.
//
//   SIRT with no prior      is 2+2+2. Crude. Streaky. AND THE STREAKS ARE THE MISSING WEDGE, drawn on the image,
//                           telling you where it does not know.
//   SIRT with a TV prior    is 2x2x2=9. Lower error. Smooth. Confident-looking EVERYWHERE. It has not removed the
//                           uncertainty -- IT HAS HIDDEN WHERE IT GUESSED.
//
// v2543 built the uncertainty map: per-pixel, how far the answer can move without changing a single measurement.
// So the question stops being rhetorical:
//
//     DOES THE ERROR LAND WHERE THE DATA CANNOT SEE?
//
// An HONEST reconstruction is wrong exactly where it is blind. Its error correlates with the null space, and a
// reader who has the map knows which parts to distrust. A DISHONEST one -- however accurate -- has moved error
// INTO the region the data constrains, where you have no reason to doubt it, and no map can warn you because the
// map says that region is fine.
//
// THE METRIC -- and the first version of this was wrong, which the numbers said outright (all three methods
// correlated ~0.01 with the uncertainty map, which cannot be true if it measured what I claimed).
//
// The uncertainty map is where null-space images GENERICALLY have energy. The error is THIS phantom's SPECIFIC
// null component. Correlating their per-pixel magnitudes compares two different objects that happen to share a
// shape. v2543 already built the right instrument and I did not recognise it: residualOf asks DOES THIS IMAGE
// CAST A SHADOW. So ask it of the ERROR.
//
//   error casts NO shadow  -> every bit of the error is in the null space. The method got EVERYTHING THE DATA
//                             ACTUALLY SAID and is wrong only where nothing could have told it. That is the best
//                             any method can do, and the remaining error is not a failure -- it is the wedge.
//   error casts A shadow   -> THE METHOD GOT THE MEASURED PART WRONG. The data told it, and it did not listen,
//                             because a prior wanted the picture to look a different way.
//
// That second case is 2x2x2=9 exactly: the RMS can go DOWN while the method distorts data it was handed. The
// shadow of the error is the auditable quantity. RMS is not: it cannot tell you WHICH HALF of the error was
// avoidable.

// Run: node simulation/tomo/honest-error.mjs
"use strict";

import { project, reconstructIterative } from "./iterative.js";
import { residualOf } from "./nullspace.js";

const N = 32;

// ---- a phantom with structure at several scales, so a prior has something to smooth AWAY -------------------
export function phantom(n = N) {
    const img = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = (x - n / 2) / n, dy = (y - n / 2) / n;
        let v = 0;
        if (dx * dx + dy * dy < 0.10) v = 0.4;                                  // a big soft disc
        if ((dx + 0.14) ** 2 + (dy - 0.10) ** 2 < 0.006) v = 1.0;               // a bright small one
        if (Math.abs(dx - 0.13) < 0.02 && Math.abs(dy + 0.05) < 0.09) v = 0.85; // a bar: TV LOVES bars
        img[y * n + x] = v;
    }
    return img;
}

/** Build a sinogram with the SAME forward operator everything else uses. A different projector here would make
 *  the comparison meaningless -- the reconstruction would be fighting a model mismatch, not a missing wedge. */
export function scan(img, n, angles, nDet = n) {
    const data = new Float64Array(angles.length * nDet);
    for (let j = 0; j < angles.length; j++) {
        const p = project(img, n, angles[j], nDet);
        data.set(p, j * nDet);
    }
    return { data, angles, nAngles: angles.length, nDet };
}

/** Pearson correlation. The question is whether two maps AGREE about where things are, and they are on wildly
 *  different scales -- an error in absorption units against a normalised null-space magnitude. */
export function corr(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export function absError(recon, truth) {
    const e = new Float64Array(truth.length);
    for (let i = 0; i < truth.length; i++) e[i] = Math.abs(recon[i] - truth[i]);
    return e;
}

export function rms(e) {
    let s = 0;
    for (const v of e) s += v * v;
    return Math.sqrt(s / e.length);
}

// ---- CLI ---------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("honest-error.mjs")) {
    const truth = phantom(N);
    const wedge = [];
    for (let i = 0; i < 16; i++) wedge.push(-Math.PI / 8 + (i / 15) * (Math.PI / 4));   // 45 degrees. A wedge.
    const sino = scan(truth, N, wedge);

    console.log("A 45-degree wedge. The data cannot see a large family of images (v2543).");
    console.log("The uncertainty map says WHERE. So: does each method's error LAND there?\n");

    const runs = [
        ["SIRT, no prior      (2+2+2)", { iters: 90, tvWeight: 0, smoothWeight: 0 }],
        ["SIRT + TV prior, gentle", { iters: 90, tvWeight: 0.02, smoothWeight: 0 }],
        ["SIRT + TV prior, firm", { iters: 90, tvWeight: 0.10, smoothWeight: 0 }],
        ["SIRT + smooth prior, gentle", { iters: 90, tvWeight: 0, smoothWeight: 0.02 }],
    ];
    console.log("  method                          RMS error   error's OWN SHADOW   verdict");
    for (const [label, opts] of runs) {
        const img = reconstructIterative(sino, N, opts);   // returns the image directly (`return img;`)
        if (!img.every(Number.isFinite)) { console.log("  " + label.padEnd(31) + "   DIVERGED -- the prior weight is too high for this step size"); continue; }
        const e = new Float64Array(truth.length);
        for (let i = 0; i < truth.length; i++) e[i] = img[i] - truth[i];   // SIGNED: a shadow needs the sign
        const shadow = residualOf(e, N, wedge);
        const verdict = shadow < 0.004 ? "wrong only where it is BLIND -- honest"
                      : shadow < 0.02 ? "some avoidable error"
                      : "GOT THE MEASURED PART WRONG";
        console.log("  " + label.padEnd(31) + rms(absError(img, truth)).toFixed(4).padStart(8) + "   " + shadow.toExponential(2).padStart(16) + "   " + verdict);
    }
    console.log("\n  RMS is the metric that picks the prior. THE ERROR'S OWN SHADOW is the metric that picks the truth.");
    console.log("  A method whose error casts no shadow is wrong ONLY where nothing could have told it otherwise.");
    console.log("  A method whose error casts a shadow was TOLD, and did not listen, because a prior preferred a");
    console.log("  different picture. RMS cannot tell those apart. That is 2x2x2 = 9.");
}
