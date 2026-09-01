#!/usr/bin/env node
// tools/ship/homography-selfcheck.mjs -- v4226
//
// Run: node tools/ship/homography-selfcheck.mjs      (pure, no camera, no GL)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES vision/homography.mjs -- the first piece of hiukim/mind-ar-js (MIT) this tree can use.
//
// *** THE GROUND TRUTH IS EXACT, WHICH IS WHY THIS IS THE PIECE WORTH BUILDING FIRST. *** A feature detector
// can only be judged against a photograph and an opinion. A homography can be judged against arithmetic:
// invent one, project points through it, hand the pairs back, and demand the same matrix. Every number below
// is measured against a matrix this file made up.
import {
    mat3Mul, mat3Inv, applyHomography, normalisePoints, smallestEigenvector, eigenSmallest,
    homographyDLT, reprojectionErrors, ransacHomography, projectQuad,
} from "../../vision/homography.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("homography-selfcheck -- where a known flat thing is, given points that mostly match\n");

const rng = (a) => function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
// a plausible perspective view of a 640x480 target -- rotation, scale, translation and real projective terms
const TRUE = new Float64Array([1.2, 0.35, 40, -0.15, 1.05, 25, 0.0004, 0.0002, 1]);
function correspondences(n, seed, scale = 640, noise = 0, outlierFrac = 0) {
    const r = rng(seed), src = [], dst = [], truth = [], bad = [];
    for (let i = 0; i < n; i++) {
        const p = [r() * scale, r() * scale * 0.75];
        src.push(p);
        const q = applyHomography(TRUE, p);
        truth.push(q);
        if (r() < outlierFrac) { dst.push([r() * scale, r() * scale * 0.75]); bad.push(i); }
        else dst.push([q[0] + (r() - 0.5) * 2 * noise, q[1] + (r() - 0.5) * 2 * noise]);
    }
    return { src, dst, truth, bad };
}

// ---- 1. THE MATRIX HELPERS ---------------------------------------------------------------------------------
console.log("1. the 3x3 arithmetic everything rests on");
{
    const I = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const P = mat3Mul(TRUE, mat3Inv(TRUE));
    ok("!! a matrix times its own inverse is the identity", Math.max(...Array.from(P).map((v, i) => Math.abs(v - I[i]))) < 1e-12,
        Math.max(...Array.from(P).map((v, i) => Math.abs(v - I[i]))).toExponential(2));
    ok("a singular matrix inverts to null rather than to infinities",
        mat3Inv(new Float64Array([1, 2, 3, 2, 4, 6, 1, 1, 1])) === null);
    ok("the identity maps a point to itself", (() => { const p = applyHomography(I, [3, 7]); return p[0] === 3 && p[1] === 7; })());
    ok("!! a point mapping to the plane at infinity returns null, not Infinity",
        applyHomography(new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 0]), [1, 1]) === null);
    // *** THIS ONE IS HERE BECAUSE SABOTAGE FOUND A HOLE. *** Deleting the perspective divide from
    // applyHomography -- returning the numerator and calling it a point -- left 39 of the 40 checks then in
    // this file GREEN, because nearly all of them build their correspondences by calling applyHomography and
    // then demand the solver reproduce them. An affine solver fitted to affine data agrees with itself.
    // Only the coefficient check in section 2, which compares against the matrix written down at the top of
    // this file, caught it. So the divide is pinned here against arithmetic done by hand, on a matrix with a
    // deliberately large projective row: w = 0.01*100 + 0.02*50 + 1 = 3, so [100,50] -> [100/3, 50/3].
    ok("!! the perspective divide is a DIVIDE, checked against arithmetic done by hand rather than by this module",
        (() => {
            const q = applyHomography(new Float64Array([1, 0, 0, 0, 1, 0, 0.01, 0.02, 1]), [100, 50]);
            return Math.abs(q[0] - 100 / 3) < 1e-12 && Math.abs(q[1] - 50 / 3) < 1e-12;
        })(), "without it 39 of the other 40 checks stayed green");
}

// ---- 2. EXACT RECOVERY -------------------------------------------------------------------------------------
console.log("\n2. *** THE MATRIX COMES BACK, TO MACHINE PRECISION ***");
{
    const { src, dst } = correspondences(40, 7);
    const H = homographyDLT(src, dst);
    ok("40 clean correspondences give a matrix", !!H);
    const worst = Math.max(...reprojectionErrors(H, src, dst));
    ok("!! every point reprojects onto its partner", worst < 1e-9, `worst ${worst.toExponential(3)} px`);
    const coeff = Math.max(...Array.from(H).map((v, i) => Math.abs(v - TRUE[i])));
    ok("!! ...and the COEFFICIENTS match the matrix this file invented", coeff < 1e-9,
        `worst |dH| ${coeff.toExponential(3)} -- reprojection alone could be right for a wrong matrix`);
    const four = homographyDLT(src.slice(0, 4), dst.slice(0, 4));
    ok("!! four points are enough -- eight unknowns, two equations each",
        !!four && Math.max(...reprojectionErrors(four, src, dst)) < 1e-8,
        "and the four-point fit still predicts the other 36");
    // MEASURED, not assumed: the explicit `n < 4` guard in homographyDLT is DEFENSIVE, not load-bearing.
    // Relaxing it to `n < 1` and passing one, two and three points still returned null every time -- the rank
    // check catches an under-determined system on its own, because six equations in nine unknowns leave a
    // three-dimensional null space and the second eigenvalue is then zero too. The guard is kept because it
    // states the requirement where a reader looks for it, and because it answers before building a 9x9.
    ok("three points are NOT enough, and it says so rather than guessing",
        homographyDLT(src.slice(0, 3), dst.slice(0, 3)) === null);
}

// ---- 3. THE DEGENERATE CONFIGURATION -----------------------------------------------------------------------
console.log("\n3. *** FOUR POINTS ARE ENOUGH ONLY IF THEY ARE IN GENERAL POSITION ***");
{
    const col = [[0, 0], [10, 10], [20, 20], [30, 30]];
    ok("!! four COLLINEAR points return null -- there is a whole family of matrices mapping a line to a line",
        homographyDLT(col, col.map((p) => applyHomography(TRUE, p))) === null,
        "before the rank check this returned a finite, plausible, arbitrary matrix");
    ok("...and four identical points too", homographyDLT([[5, 5], [5, 5], [5, 5], [5, 5]], [[1, 1], [1, 1], [1, 1], [1, 1]]) === null);
    // *** THREE COLLINEAR IS ALREADY DEGENERATE, AND MY FIRST VERSION OF THIS CHECK EXPECTED OTHERWISE. ***
    // "General position" for a four-point homography means NO THREE COLLINEAR, not merely "not all four".
    // Three on a line plus one off it still leaves a family of matrices, so returning null is correct and it
    // was the gate's premise that was wrong.
    const almost = [[0, 0], [10, 10], [20, 20], [5, 30]];
    ok("!! three collinear plus a fourth off the line is ALSO degenerate -- no three may be collinear",
        homographyDLT(almost, almost.map((p) => applyHomography(TRUE, p))) === null);
    // ...and a genuinely general set is accepted, so the check is not simply refusing everything
    const general = [[0, 0], [100, 5], [90, 80], [10, 95]];
    ok("...while four points in general position are accepted",
        !!homographyDLT(general, general.map((p) => applyHomography(TRUE, p))));
    const { src, dst } = correspondences(12, 3);
    const eig = (() => {
        const ns = normalisePoints(src), nd = normalisePoints(dst);
        const A = [];
        for (let i = 0; i < src.length; i++) {
            const [x, y] = ns.points[i], [u, v] = nd.points[i];
            A.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
            A.push([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
        }
        const M = new Float64Array(81);
        for (const r of A) for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) M[i * 9 + j] += r[i] * r[j];
        return eigenSmallest(M, 9);
    })();
    ok("!! on good data the null space is ONE dimensional -- the second eigenvalue is far from zero",
        eig.second / eig.largest > 1e-6,
        `smallest/largest ${(eig.smallest / eig.largest).toExponential(2)}, second/largest ${(eig.second / eig.largest).toExponential(2)}`);
}

// ---- 4. HARTLEY NORMALISATION, MEASURED RATHER THAN QUOTED -------------------------------------------------
console.log("\n4. *** THE TEXTBOOK CALLS NORMALISATION ESSENTIAL. MEASURED HERE, IT IS NOT. ***");
{
    const n = normalisePoints([[0, 0], [100, 0], [100, 100], [0, 100]]);
    let cx = 0, cy = 0, d = 0;
    for (const p of n.points) { cx += p[0]; cy += p[1]; }
    cx /= 4; cy /= 4;
    for (const p of n.points) d += Math.hypot(p[0] - cx, p[1] - cy);
    d /= 4;
    ok("it centres the points on the origin", Math.abs(cx) < 1e-12 && Math.abs(cy) < 1e-12);
    ok("!! ...and scales the mean distance to sqrt(2), which is what Hartley specifies", Math.abs(d - Math.SQRT2) < 1e-12,
        d.toFixed(12));
    ok("coincident points do not divide by a zero spread", !!normalisePoints([[3, 3], [3, 3], [3, 3]]));

    // the comparison: the same solver, with and without
    const dltRaw = (s, dd) => {
        const A = [];
        for (let i = 0; i < s.length; i++) {
            const [x, y] = s[i], [u, v] = dd[i];
            A.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
            A.push([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
        }
        const M = new Float64Array(81);
        for (const r of A) for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) M[i * 9 + j] += r[i] * r[j];
        const h = smallestEigenvector(M, 9), o = new Float64Array(h);
        if (Math.abs(o[8]) < 1e-12) return null;
        for (let i = 0; i < 9; i++) o[i] /= o[8];
        return o;
    };
    // clean data first
    const clean = correspondences(30, 3, 640, 0);
    const ca = dltRaw(clean.src, clean.dst), cb = homographyDLT(clean.src, clean.dst);
    const cea = Math.max(...reprojectionErrors(ca, clean.src, clean.truth));
    const ceb = Math.max(...reprojectionErrors(cb, clean.src, clean.truth));
    ok("!! on CLEAN data normalisation wins by a wide margin -- and both are far below a millionth of a pixel",
        cea / ceb > 3 && cea < 1e-8, `${(cea / ceb).toFixed(0)}x, from ${cea.toExponential(2)} to ${ceb.toExponential(2)} px`);

    // *** ONE SEED IS NOT A MEASUREMENT. *** The first version of this section swept five configurations at a
    // single seed and asserted "sometimes the wrong way" -- which was true of the seed I happened to try in a
    // scratch file and false of the one the gate used, so the check failed against correct code. Twenty-four
    // configurations, six seeds, and the claim is about the DISTRIBUTION rather than about any one case.
    const ratios = [];
    for (const seed of [3, 7, 11, 19, 23, 31]) {
        for (const [noise, scale] of [[0.5, 640], [2, 640], [0.5, 4096], [2, 4096]]) {
            const { src, dst, truth } = correspondences(30, seed, scale, noise);
            const a = dltRaw(src, dst), b = homographyDLT(src, dst);
            ratios.push(Math.max(...reprojectionErrors(a, src, truth)) / Math.max(...reprojectionErrors(b, src, truth)));
        }
    }
    ratios.sort((x, y) => x - y);
    const median = ratios[Math.floor(ratios.length / 2)];
    const worse = ratios.filter((v) => v < 1).length;
    console.log(`  under noise, ${ratios.length} configurations: ratio min ${ratios[0].toFixed(2)}x, median ${median.toFixed(2)}x, max ${ratios[ratios.length - 1].toFixed(2)}x`);
    ok("!! *** UNDER REALISTIC NOISE IT IS WORTH A SMALL FACTOR, NOT AN ORDER OF MAGNITUDE ***",
        ratios[0] > 0.1 && ratios[ratios.length - 1] < 10,
        `every one of ${ratios.length} configurations inside a factor of 10 either way`);
    ok("!! ...and it goes the WRONG way a fifth of the time", worse > 0 && worse < ratios.length / 2,
        `normalisation was worse in ${worse} of ${ratios.length}, median ${median.toFixed(2)}x`);
    ok("...so it is kept because it is standard and free, NOT because it was measured to rescue anything",
        /NOT claimed to rescue anything here, because it was checked/.test(fs.readFileSync(path.join(ROOT, "vision", "homography.mjs"), "utf8")));
}

// ---- 5. ONE BAD MATCH ---------------------------------------------------------------------------------------
console.log("\n5. *** ONE WRONG CORRESPONDENCE RUINS A LEAST-SQUARES FIT, QUIETLY ***");
{
    const { src, dst, truth } = correspondences(20, 7);
    const poisoned = dst.map((p, i) => (i === 7 ? [p[0] + 180, p[1] - 140] : p));
    const H = homographyDLT(src, poisoned);
    const errs = reprojectionErrors(H, src, truth).filter((_, i) => i !== 7);
    ok("!! a single bad pair in twenty throws the fit off by tens of pixels ON THE GOOD POINTS",
        Math.max(...errs) > 10, `worst ${Math.max(...errs).toFixed(1)} px -- and no error is raised anywhere`);
}

// ---- 6. RANSAC ----------------------------------------------------------------------------------------------
console.log("\n6. *** WHICH IS WHY A TRACKER NEEDS RANSAC AND NOT JUST A FIT ***");
{
    for (const frac of [0.2, 0.4]) {
        const { src, dst, truth, bad } = correspondences(60, 11, 640, 0, frac);
        const res = ransacHomography(src, dst, { threshold: 3, iterations: 600, seed: 5 });
        ok(`${(frac * 100).toFixed(0)}% outliers (${bad.length}/60): RANSAC returns a result`, !!res);
        const found = new Set(res.inliers);
        const wrongKept = bad.filter((i) => found.has(i)).length;
        const goodLost = src.length - bad.length - res.inliers.filter((i) => !bad.includes(i)).length;
        const err = Math.max(...reprojectionErrors(res.H, src, truth).filter((_, i) => !bad.includes(i)));
        console.log(`  ${(frac * 100).toFixed(0)}% outliers: ${res.inlierCount} inliers, ${wrongKept} outliers wrongly kept, ${goodLost} inliers lost, worst error on true points ${err.toExponential(2)} px`);
        ok(`  !! ...and it recovers the true matrix through them`, err < 1e-8, `${err.toExponential(2)} px`);
        ok("  !! ...admitting no outlier into the inlier set", wrongKept === 0);
        ok("  ...and it refit on the inliers rather than keeping the four-point hypothesis", res.refit === true);
    }
    const { src, dst } = correspondences(60, 11, 640, 0, 0.4);
    const plain = homographyDLT(src, dst);
    const plainErr = Math.max(...reprojectionErrors(plain, src, correspondences(60, 11, 640, 0, 0.4).truth));
    ok("!! plain DLT on the same data is hundreds of pixels out", plainErr > 100, `${plainErr.toFixed(0)} px`);
    ok("RANSAC is deterministic given a seed", (() => {
        const a = ransacHomography(src, dst, { threshold: 3, iterations: 200, seed: 9 });
        const b = ransacHomography(src, dst, { threshold: 3, iterations: 200, seed: 9 });
        return JSON.stringify(Array.from(a.H)) === JSON.stringify(Array.from(b.H));
    })());
    ok("...and fewer than four correspondences returns null rather than throwing",
        ransacHomography(src.slice(0, 3), dst.slice(0, 3)) === null);
}

// ---- 7. WHERE THE THING IS ----------------------------------------------------------------------------------
console.log("\n7. the answer a tracker actually wants: the target's outline, in frame");
{
    const quad = projectQuad(TRUE, 640, 480);
    ok("!! four corners come back, and they are the target's corners through H", !!quad && quad.length === 4);
    const direct = [[0, 0], [640, 0], [640, 480], [0, 480]].map((c) => applyHomography(TRUE, c));
    ok("...matching a direct projection exactly",
        quad.every((p, i) => Math.abs(p[0] - direct[i][0]) < 1e-12 && Math.abs(p[1] - direct[i][1]) < 1e-12));
    ok("a degenerate H gives null rather than a quad with holes in it",
        projectQuad(new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 0]), 640, 480) === null);
}

// ---- 8. DISCIPLINE ------------------------------------------------------------------------------------------
console.log("\n8. what it is and is not");
{
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "vision", "homography.mjs"), "utf8"));
    ok("no DOM, no canvas, no camera -- it takes numbers", !/document|canvas|getUserMedia|ImageData/.test(src));
    ok("no dependency on an SVD or matrix library", !/require\(|from "gl-matrix"|numeric/.test(src));
    ok("!! it is the only homography in the tree", (() => {
        const files = [];
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (["node_modules", ".git", "vendor"].includes(e.name)) continue;
                const p = path.join(d, e.name);
                if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
            }
        })(ROOT);
        const owners = files.filter((f) => /homographyDLT|ransacHomography/.test(codeOnly(fs.readFileSync(f, "utf8"))))
            .map((f) => path.relative(ROOT, f)).filter((f) => !f.includes("selfcheck"));
        return owners.length === 1 && owners[0] === path.join("vision", "homography.mjs");
    })());
    ok("the camera frames it would consume already arrive", fs.existsSync(path.join(ROOT, "render", "cameraTexture.js")));
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE TREE CAN TRACK AN IMAGE. It cannot. mind-ar-js is a target compiler, a FREAK");
console.log("      descriptor extractor, a detector, a matcher and a frame-to-frame tracker, and this is the");
console.log("      one piece underneath all of them -- the part with an exact answer, which is why it is");
console.log("      first. What is missing is everything that PRODUCES correspondences: without a detector and");
console.log("      a matcher there is nothing to hand this, and hand-clicked points are the only source today.");

console.log("\nhomography-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
