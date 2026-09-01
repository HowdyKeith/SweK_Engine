// vision/homography.mjs -- v4226 -- where a known flat thing is, given points that mostly match.
//
// The first piece of hiukim/mind-ar-js (MIT) worth having here. mind-ar is 193 files -- an offline compiler
// that turns a target image into FREAK descriptors at several scales, a detector, a matcher, a tracker and
// three framework bindings -- and porting it whole would be several rounds. This is the part every one of
// those layers eventually calls and the part this tree has NONE of: given corresponding points between a
// known planar target and what the camera sees, WHERE IS IT.
//
// *** MEASURED BEFORE BUILDING. *** render/cameraTexture.js (v4183) puts the webcam into a GL texture and
// render/cameraEffectsPass.js processes it, so frames arrive and are already pixels this engine can read.
// Nothing then looks for anything in them: homography, RANSAC and descriptor matching are each in ZERO files.
// (An earlier count of mine said RANSAC appeared in three -- ui/poller.js, world/WorldPersistence.js and
// ai-bridge/traderBridge.js. It does not. A case-insensitive search for "ransac" matches "tRANSACtion", which
// is what all three contain. With a word boundary the count is zero.)
"use strict";

/** 3x3 matrices are row-major Float64Array(9) throughout. */
export function mat3Mul(a, b) {
    const o = new Float64Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
    return o;
}

/** Inverse of a 3x3, or null when singular. */
export function mat3Inv(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
    const o = new Float64Array([A, -(b * i - c * h), b * f - c * e,
                                B, a * i - c * g, -(a * f - c * d),
                                C, -(a * h - b * g), a * e - b * d]);
    for (let k = 0; k < 9; k++) o[k] /= det;
    return o;
}

/** Apply a homography to a 2D point. Returns null if the point maps to the plane at infinity. */
export function applyHomography(H, p) {
    const x = p[0], y = p[1];
    const w = H[6] * x + H[7] * y + H[8];
    if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * Hartley normalisation: move the centroid to the origin and scale so the mean distance from it is sqrt(2).
 *
 * *** THE TEXTBOOK CALLS THIS ESSENTIAL. I MEASURED IT HERE AND IT IS NOT, AND SAYING SO IS THE POINT. ***
 * The argument is real: the DLT matrix built from raw pixel coordinates mixes entries of order 1 with
 * entries of order x*y -- around 400,000 on a 640x480 frame -- and Hartley and Zisserman call normalisation
 * essential for exactly that reason. MEASURED against the same solver with and without it, and the numbers
 * below are the ones tools/ship/homography-selfcheck.mjs reproduces on every run rather than a note from a
 * scratch file:
 *
 *     CLEAN correspondences        1.59e-10 px  ->  3.75e-13 px      422x better, and both worthless:
 *                                                                    a ten-billionth of a pixel either way
 *     UNDER NOISE (0.5 and 2 px, at 640 and 4096 wide, six seeds -- 24 configurations):
 *                                  ratio raw/normalised   min 0.61x   median 1.11x   max 6.22x
 *                                  normalisation was WORSE in 5 of the 24
 *
 * So the honest summary is a median 1.11x, going the wrong way one time in five -- not the orders-of-
 * magnitude rescue the textbook implies. The conditioning disaster Hartley and Zisserman warn about is the
 * float32 and normal-equations story; at double precision with a Jacobi eigensolver it does not appear.
 * It is KEPT because it costs nothing, is standard, and would start to matter in single precision, and it is
 * NOT claimed to rescue anything here, because it was checked.
 */
export function normalisePoints(pts) {
    const n = pts.length;
    if (!n) return null;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    let d = 0;
    for (const p of pts) d += Math.hypot(p[0] - cx, p[1] - cy);
    d /= n;
    // All points coincident: there is no scale to choose, and dividing by the mean distance would be 0/0.
    const s = d > 1e-12 ? Math.SQRT2 / d : 1;
    const T = new Float64Array([s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]);
    return { points: pts.map((p) => [(p[0] - cx) * s, (p[1] - cy) * s]), T };
}

/**
 * The eigenvector of the smallest eigenvalue of a symmetric matrix, by cyclic Jacobi rotation.
 *
 * A general SVD is not needed: the DLT's answer is the null vector of A, which is the eigenvector of A'A for
 * its smallest eigenvalue, and A'A is symmetric 9x9. Jacobi is short, has no pivoting decisions, and
 * converges unconditionally on a symmetric matrix -- worth more here than speed.
 */
export function smallestEigenvector(M, n, sweeps = 60) {
    const r = eigenSmallest(M, n, sweeps);
    return r.vector;
}

/**
 * The smallest eigenpair of a symmetric matrix, and the SECOND smallest eigenvalue with it.
 *
 * *** THE SECOND EIGENVALUE IS WHAT TELLS YOU THE ANSWER IS MEANINGLESS. *** A homography needs four points
 * in GENERAL POSITION. Give the DLT four COLLINEAR ones and A'A has a null space of dimension greater than
 * one -- there is a whole family of matrices mapping a line onto a line -- and the solver still returns a
 * vector from it, finite and plausible and arbitrary. The tell is not in that vector, it is that the second
 * smallest eigenvalue is also ~0. MEASURED: four collinear points returned a perfectly finite matrix before
 * this check existed.
 */
export function eigenSmallest(M, n, sweeps = 60) {
    const a = Float64Array.from(M);
    const v = new Float64Array(n * n);
    for (let i = 0; i < n; i++) v[i * n + i] = 1;
    for (let s = 0; s < sweeps; s++) {
        let off = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
        if (off < 1e-30) break;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
            const apq = a[p * n + q];
            if (Math.abs(apq) < 1e-300) continue;
            const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
            for (let k = 0; k < n; k++) {
                const akp = a[k * n + p], akq = a[k * n + q];
                a[k * n + p] = c * akp - sn * akq;
                a[k * n + q] = sn * akp + c * akq;
            }
            for (let k = 0; k < n; k++) {
                const apk = a[p * n + k], aqk = a[q * n + k];
                a[p * n + k] = c * apk - sn * aqk;
                a[q * n + k] = sn * apk + c * aqk;
            }
            for (let k = 0; k < n; k++) {
                const vkp = v[k * n + p], vkq = v[k * n + q];
                v[k * n + p] = c * vkp - sn * vkq;
                v[k * n + q] = sn * vkp + c * vkq;
            }
        }
    }
    const eig = [];
    for (let i = 0; i < n; i++) eig.push([Math.abs(a[i * n + i]), i]);
    eig.sort((x, y) => x[0] - y[0]);
    const best = eig[0][1];
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = v[k * n + best];
    return { vector: out, smallest: eig[0][0], second: eig[1] ? eig[1][0] : 0, largest: eig[eig.length - 1][0] };
}

/**
 * The homography taking `src` to `dst`, by normalised DLT. Needs at least four correspondences.
 * Returns a row-major Float64Array(9) scaled so H[8] is 1, or null when the configuration is degenerate.
 */
export function homographyDLT(src, dst, opts = {}) {
    const n = Math.min(src.length, dst.length);
    if (n < 4) return null;                                   // eight unknowns, two equations per point
    const ns = normalisePoints(src.slice(0, n)), nd = normalisePoints(dst.slice(0, n));
    if (!ns || !nd) return null;
    const A = [];
    for (let i = 0; i < n; i++) {
        const [x, y] = ns.points[i], [u, v] = nd.points[i];
        A.push([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
        A.push([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
    }
    const M = new Float64Array(81);
    for (const row of A) for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) M[i * 9 + j] += row[i] * row[j];
    const eig = eigenSmallest(M, 9);
    // A null space wider than one dimension means the points do not determine a homography. The ratio is
    // against the LARGEST eigenvalue, so it is scale-free -- an absolute threshold would depend on how many
    // points were passed and how big the coordinates were.
    if (!(eig.largest > 0) || eig.second / eig.largest < (opts.degenerateRatio ?? 1e-10)) return null;
    const Hn = new Float64Array(eig.vector);
    // undo the normalisation: H = Tdst^-1 * Hn * Tsrc
    const Tdi = mat3Inv(nd.T);
    if (!Tdi) return null;
    let H = mat3Mul(Tdi, mat3Mul(Hn, ns.T));
    if (!Number.isFinite(H[8]) || Math.abs(H[8]) < 1e-12) return null;
    for (let i = 0; i < 9; i++) H[i] /= H[8];
    return H.every(Number.isFinite) ? H : null;
}

/** Per-correspondence reprojection distance, in the units of `dst`. */
export function reprojectionErrors(H, src, dst) {
    const out = [];
    for (let i = 0; i < src.length; i++) {
        const p = applyHomography(H, src[i]);
        out.push(p ? Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1]) : Infinity);
    }
    return out;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * A homography from correspondences that are mostly, but not entirely, right.
 *
 * *** THIS IS THE WHOLE REASON A TRACKER NEEDS RANSAC AND NOT JUST LEAST SQUARES. *** Descriptor matching
 * produces wrong pairs -- repeated texture, motion blur, a second copy of the logo in frame -- and DLT is a
 * least-squares fit, so ONE bad correspondence pulls the entire answer. It does not fail loudly; it returns a
 * plausible matrix that is wrong. Fit on four random correspondences, count how many of the rest agree, keep
 * the best set, then refit on all of its inliers.
 *
 * @returns { H, inliers, inlierCount, iterations, refit } or null
 */
export function ransacHomography(src, dst, opts = {}) {
    const n = Math.min(src.length, dst.length);
    if (n < 4) return null;
    const threshold = opts.threshold ?? 3;                    // pixels
    const iterations = opts.iterations ?? 500;
    const rng = opts.rng || mulberry32(opts.seed ?? 1);
    let best = null;
    for (let it = 0; it < iterations; it++) {
        // four distinct indices
        const idx = [];
        let guard = 0;
        while (idx.length < 4 && guard++ < 100) {
            const k = Math.floor(rng() * n);
            if (!idx.includes(k)) idx.push(k);
        }
        if (idx.length < 4) break;
        const H = homographyDLT(idx.map((i) => src[i]), idx.map((i) => dst[i]));
        if (!H) continue;
        const errs = reprojectionErrors(H, src, dst);
        const inliers = [];
        for (let i = 0; i < n; i++) if (errs[i] <= threshold) inliers.push(i);
        if (!best || inliers.length > best.inliers.length) best = { H, inliers };
    }
    if (!best) return null;
    // *** THE REFIT IS NOT OPTIONAL. *** The winning H came from FOUR points and is only as good as they are;
    // refitting on every inlier is what turns a hypothesis into an estimate. If the refit is somehow worse it
    // is discarded, so this can never make the answer worse than the hypothesis it started from.
    let refit = false, H = best.H;
    if (best.inliers.length >= 4) {
        const H2 = homographyDLT(best.inliers.map((i) => src[i]), best.inliers.map((i) => dst[i]));
        if (H2) {
            const e1 = reprojectionErrors(H, src, dst).filter((_, i) => best.inliers.includes(i));
            const e2 = reprojectionErrors(H2, src, dst).filter((_, i) => best.inliers.includes(i));
            const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
            if (mean(e2) <= mean(e1)) { H = H2; refit = true; }
        }
    }
    return { H, inliers: best.inliers, inlierCount: best.inliers.length, iterations, refit };
}

/** The four corners of a target, mapped through H -- where the thing is, in frame. */
export function projectQuad(H, width, height) {
    const corners = [[0, 0], [width, 0], [width, height], [0, height]];
    const out = corners.map((c) => applyHomography(H, c));
    return out.some((p) => !p) ? null : out;
}

export default homographyDLT;
