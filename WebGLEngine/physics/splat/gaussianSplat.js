// WebGLEngine/physics/splat/gaussianSplat.js -- v2860
//
// DEVICE 20: 3D GAUSSIAN SPLATTING, GRADED AGAINST CLOSED FORMS.
//
// WHY THIS IS AN INSTRUMENT AND NOT A VIEWER. Keith asked whether the splat viewer could come into the physics
// lab. It cannot, twice over: every lab page is 2D canvas with no THREE scene to add a SplatMesh to, and -- the
// stronger reason -- a splat CAPTURE is photogrammetry of the real world, with no truth we own to grade it
// against. By this lab's governing rule that makes it decoration, which is exactly the category the lab exists to
// exclude.
//
// SO DO NOT GRADE THE RENDER. GRADE THE MATH. A splat cloud is SUPPOSED to differ from the surface it
// approximates, so comparing a render to an analytic surface measures the approximation, not correctness. But the
// splatting pipeline itself -- project a 3D Gaussian to 2D, then composite the results in depth order -- is
// linear algebra with exact closed forms. Those are gradeable headless, in Node, with no GPU and no third-party
// renderer. This module owns its truth; Spark stays a viewer and this does not import it.
//
// THE MATH, and every key below falls out of it rather than being asserted:
//
//   A splat is a 3D Gaussian with covariance  S = R diag(sx^2,sy^2,sz^2) R^T  (scale + rotation, how real splat
//   files store it). Viewed through a camera with view-rotation W, at camera-space position t, the perspective
//   projection is linearised by its Jacobian J and the projected 2D covariance is the EWA result
//
//       S2D = J W S W^T J^T
//
//   with   J = [ f/t.z    0      -f*t.x/t.z^2 ]
//              [   0    f/t.z    -f*t.y/t.z^2 ]
//
//   The third column is the PERSPECTIVE SHEAR. It vanishes on the view axis, which is precisely why an
//   implementation that omits it looks perfect until something moves off-centre. That is this module's sabotage.
//
// SCOPE, stated rather than blurred: pinhole camera, no spherical harmonics (colour is constant per splat, not
// view-dependent), no screen-space dilation/anti-aliasing term, no tile binning. Those are renderer engineering;
// what is graded here is the projection and the compositing arithmetic.
"use strict";

// ---- small matrix helpers (row-major, no dependencies) -------------------------------------------------------
export function quatToMat3(q) {
    const { x, y, z, w } = q;
    return [
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
}
export function mat3mul(a, b) {
    const o = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += a[r * 3 + k] * b[k * 3 + c];
        o[r * 3 + c] = s;
    }
    return o;
}
export function mat3T(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
export function mat3vec(m, v) {
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** Covariance of a splat from its scale and rotation: S = R diag(s^2) R^T. Symmetric positive definite. */
export function covarianceFromScaleRot(scale, quat) {
    const R = quatToMat3(quat);
    const S = [scale[0] * scale[0], 0, 0, 0, scale[1] * scale[1], 0, 0, 0, scale[2] * scale[2]];
    return mat3mul(mat3mul(R, S), mat3T(R));
}

/**
 * Jacobian of the perspective projection at camera-space point t, focal length f. Returns a 2x3 row-major.
 * The third column is the perspective shear and is ZERO on the view axis -- see the header.
 */
export function perspectiveJacobian(t, f) {
    const z = t[2], z2 = z * z;
    return [f / z, 0, -f * t[0] / z2,
            0, f / z, -f * t[1] / z2];
}

/**
 * EWA projection: S2D = J W S W^T J^T. Returns the symmetric 2x2 as {xx, xy, yy}.
 * @param {number[]} S3 world covariance (3x3 row-major)
 * @param {number[]} W  view rotation (3x3 row-major)
 * @param {number[]} t  camera-space position of the splat centre
 * @param {number} f    focal length in pixels
 * @param {{shear?: boolean}} [opts] shear:false DROPS the perspective term -- the sabotage hook, off-axis only
 */
export function projectCovariance(S3, W, t, f, opts = {}) {
    const shear = opts.shear !== false;
    const J = perspectiveJacobian(t, f);
    if (!shear) { J[2] = 0; J[5] = 0; }
    const M = mat3mul(mat3mul(W, S3), mat3T(W));      // camera-space covariance
    // S2D = J M J^T, done by hand because J is 2x3 and a general matmul would need padding.
    const JM = [
        J[0] * M[0] + J[1] * M[3] + J[2] * M[6], J[0] * M[1] + J[1] * M[4] + J[2] * M[7], J[0] * M[2] + J[1] * M[5] + J[2] * M[8],
        J[3] * M[0] + J[4] * M[3] + J[5] * M[6], J[3] * M[1] + J[4] * M[4] + J[5] * M[7], J[3] * M[2] + J[4] * M[5] + J[5] * M[8],
    ];
    return {
        xx: JM[0] * J[0] + JM[1] * J[1] + JM[2] * J[2],
        xy: JM[0] * J[3] + JM[1] * J[4] + JM[2] * J[5],
        yy: JM[3] * J[3] + JM[4] * J[4] + JM[5] * J[5],
    };
}

export function det2(S) { return S.xx * S.yy - S.xy * S.xy; }

/** Eigenvalues of a symmetric 2x2, largest first. Exact closed form, no iteration. */
export function eigen2(S) {
    const tr = S.xx + S.yy, d = det2(S);
    const disc = Math.max(0, tr * tr / 4 - d);
    const r = Math.sqrt(disc);
    return [tr / 2 + r, tr / 2 - r];
}

/**
 * KEY 1 -- THE ANALYTIC INTEGRAL. A 2D Gaussian exp(-1/2 x^T S^-1 x) integrates over the plane to exactly
 * 2*pi*sqrt(det S). Nothing about the rasteriser knows this number, which is what makes it a grade.
 */
export function gaussian2DIntegral(S) { return 2 * Math.PI * Math.sqrt(det2(S)); }

/**
 * Rasterise the (unit-peak) 2D Gaussian onto a square grid and return the discrete integral -- sum * cellArea.
 * Must converge to gaussian2DIntegral as the grid refines and the extent grows.
 * @param {{xx,xy,yy}} S
 * @param {{n?: number, radius?: number}} [opts] n cells per side; radius in units of the largest sigma
 */
export function rasteriseIntegral(S, opts = {}) {
    const n = opts.n ?? 256;
    const radius = opts.radius ?? 6;
    const d = det2(S);
    if (!(d > 0)) return 0;
    // inverse of the symmetric 2x2
    const ixx = S.yy / d, ixy = -S.xy / d, iyy = S.xx / d;
    const sigMax = Math.sqrt(eigen2(S)[0]);
    const half = radius * sigMax;
    const h = (2 * half) / n;              // cell size
    const cell = h * h;
    let sum = 0;
    for (let j = 0; j < n; j++) {
        const y = -half + (j + 0.5) * h;
        for (let i = 0; i < n; i++) {
            const x = -half + (i + 0.5) * h;
            sum += Math.exp(-0.5 * (ixx * x * x + 2 * ixy * x * y + iyy * y * y));
        }
    }
    return sum * cell;
}

// ---- compositing --------------------------------------------------------------------------------------------
//
// KEY 2 -- OPACITY ACCUMULATION. Front-to-back over-compositing accumulates transmittance multiplicatively:
//     A = 1 - prod(1 - a_i)
// so N splats of equal alpha a give EXACTLY 1 - (1-a)^N. Closed form, no tolerance.
//
// KEY 3 -- ORDER DEPENDENCE, AND IT CUTS BOTH WAYS. Because
//     sum_i a_i * prod_{j<i} (1-a_j)  ==  1 - prod_i (1-a_i)
// the accumulated ALPHA is order-independent, and so is the colour when every splat shares one colour. With
// DIFFERENT colours the weights attach to different colours and the result genuinely changes. So the same code
// gives a positive control (same colour -> order must NOT matter) and a load-bearing negative (different colours
// -> order MUST matter). A renderer whose sort does nothing passes the first and fails the second.

/** Front-to-back "over" compositing. splats: [{alpha, color:[r,g,b]}] already in draw order. */
export function compositeFrontToBack(splats) {
    let T = 1;                    // remaining transmittance
    const c = [0, 0, 0];
    for (const s of splats) {
        const a = s.alpha, w = a * T;
        const col = s.color || [1, 1, 1];
        c[0] += col[0] * w; c[1] += col[1] * w; c[2] += col[2] * w;
        T *= (1 - a);
    }
    return { color: c, alpha: 1 - T, transmittance: T };
}

/** The closed form for N splats of equal alpha. */
export function accumulatedAlpha(a, n) { return 1 - Math.pow(1 - a, n); }

/**
 * KEY 5 -- DEPTH ORDER. Returns the permutation that sorts splats front-to-back by camera-space depth. An INTEGER
 * answer, so it is exactly right or exactly wrong -- the same reason the Schrodinger instrument bisects on a
 * Sturm sign count rather than on a float.
 */
export function depthOrder(positions, camera) {
    const W = camera.W || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const eye = camera.eye || [0, 0, 0];
    const d = positions.map((p, i) => {
        const rel = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
        return { i, z: mat3vec(W, rel)[2] };
    });
    d.sort((a, b) => a.z - b.z);
    return d.map((e) => e.i);
}

/** Camera-space position of a world point. */
export function toCamera(p, camera) {
    const W = camera.W || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const eye = camera.eye || [0, 0, 0];
    return mat3vec(W, [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]);
}

/** Rotation about the z axis, as a view matrix W. */
export function rotZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** Rotation about the y axis. */
export function rotY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/**
 * KEY 4 -- PROJECTED AREA FALLS AS 1/z^2. sqrt(det S2D) is the projected area scale, and for a splat on the view
 * axis it is sigma^2 (f/z)^2. Measuring the SLOPE of log(area) against log(z) must give exactly -2, the same
 * shape of key as Kepler III's 3/2.
 */
export function areaScale(S2D) { return Math.sqrt(det2(S2D)); }

export function projectedAreaAtDepth(z, { sigma = 0.1, f = 800 } = {}) {
    const S3 = covarianceFromScaleRot([sigma, sigma, sigma], { x: 0, y: 0, z: 0, w: 1 });
    const W = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return areaScale(projectCovariance(S3, W, [0, 0, z], f));
}

/**
 * Ordinary least squares of log(area) against log(depth), returning BOTH terms of the line.
 *
 * v3516 -- THE INTERCEPT WAS COMPUTED AND THROWN AWAY, AND IT IS THE HALF THAT PROVES THE OTHER ONE.
 * The slope is -2 because perspective divides by z^2; sigma and f are PURE MULTIPLICATIVE SCALE FACTORS and
 * so shift the INTERCEPT and never the SLOPE. That makes them a nuisance knob for the slope -- but only if
 * something reports a quantity they DO move, because runNuisance proves liveness from what the device
 * REPORTS, and a mode reporting the slope alone would call a live knob dead. Same shape as v3500, where the
 * convergence exponent was blind to the entire effect of that round.
 */
export function areaDepthFit(zs, opts = {}) {
    const xs = zs.map(Math.log), ys = zs.map((z) => Math.log(projectedAreaAtDepth(z, opts)));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    const slope = num / den;
    return { slope, intercept: my - slope * mx };
}

/** log-log slope of projected area vs depth over a range. Should be -2 exactly. */
export function areaDepthSlope(zs, opts = {}) { return areaDepthFit(zs, opts).slope; }
