// simulation/tomo/phantom.js -- a known object, and the exact X-ray shadow it casts.
//
// This is the reference, and it is written FIRST and checked BEFORE anything reconstructs anything. Judge a
// reconstruction against a sinogram that was itself simulated and you have measured the agreement of two
// approximations -- which is worth nothing, and is exactly the trap the physics suite fell into in v2455 when it
// imported its own expectations from the code it was testing.
//
// There is no simulation here at all. The Radon transform of an ellipse is ANALYTIC: a line crossing an ellipse has a
// chord whose length is closed-form. The Shepp-Logan phantom is a SUM OF ELLIPSES, so its entire sinogram can be
// written down exactly, and the exact answer is available at every angle and every offset, for free, forever.
//
// For an ellipse (x0, y0) with semi-axes (a, b), rotated by phi, density rho, a ray at angle theta and offset s:
//   s' = s - (x0 cos t + y0 sin t)      -- shift the ray into the ellipse's frame
//   t' = theta - phi                     -- rotate it
//   A  = a^2 cos^2 t' + b^2 sin^2 t'     -- the ellipse's squared half-width along the ray
//   p  = 2 rho a b sqrt(A - s'^2) / A    when s'^2 <= A, otherwise 0 (the ray misses)
"use strict";

// Shepp & Logan 1974. x0, y0, a, b, phi(degrees), rho.
const SHEPP_LOGAN = [
    [ 0.00,  0.0000, 0.6900, 0.9200,   0,  2.00],   // skull
    [ 0.00, -0.0184, 0.6624, 0.8740,   0, -0.98],   // brain, subtracted from the skull
    [ 0.22,  0.0000, 0.1100, 0.3100, -18, -0.02],
    [-0.22,  0.0000, 0.1600, 0.4100,  18, -0.02],
    [ 0.00,  0.3500, 0.2100, 0.2500,   0,  0.01],
    [ 0.00,  0.1000, 0.0460, 0.0460,   0,  0.01],
    [ 0.00, -0.1000, 0.0460, 0.0460,   0,  0.01],
    [-0.08, -0.6050, 0.0460, 0.0230,   0,  0.01],
    [ 0.00, -0.6050, 0.0230, 0.0230,   0,  0.01],
    [ 0.06, -0.6050, 0.0230, 0.0460,   0,  0.01],
];
const D2R = Math.PI / 180;

// the object itself: is (x, y) inside each ellipse? Sum the densities. Exact, no grid.
function phantomAt(x, y, ell = SHEPP_LOGAN) {
    let v = 0;
    for (const [x0, y0, a, b, phi, rho] of ell) {
        const c = Math.cos(phi * D2R), s = Math.sin(phi * D2R);
        const dx = x - x0, dy = y - y0;
        const u = dx * c + dy * s, w = -dx * s + dy * c;
        if ((u * u) / (a * a) + (w * w) / (b * b) <= 1) v += rho;
    }
    return v;
}

// THE EXACT SHADOW. No rays are traced. No integral is approximated.
function radonAt(s, theta, ell = SHEPP_LOGAN) {
    let p = 0;
    for (const [x0, y0, a, b, phi, rho] of ell) {
        const t = theta - phi * D2R;
        const ct = Math.cos(t), st = Math.sin(t);
        const sp = s - (x0 * Math.cos(theta) + y0 * Math.sin(theta));
        const A = a * a * ct * ct + b * b * st * st;
        if (sp * sp <= A) p += 2 * rho * a * b * Math.sqrt(A - sp * sp) / A;
    }
    return p;
}

// a full analytic sinogram: nAngles over [0, pi), nDet detector bins across [-1, 1]
function sinogram({ nAngles = 180, nDet = 256, ell = SHEPP_LOGAN } = {}) {
    const data = new Float64Array(nAngles * nDet);
    const angles = new Float64Array(nAngles);
    for (let j = 0; j < nAngles; j++) {
        const th = (j * Math.PI) / nAngles;
        angles[j] = th;
        for (let i = 0; i < nDet; i++) {
            const s = -1 + (2 * (i + 0.5)) / nDet;
            data[j * nDet + i] = radonAt(s, th, ell);
        }
    }
    return { data, angles, nAngles, nDet, ds: 2 / nDet };
}

// the phantom rasterised, for comparing a reconstruction against
function phantomImage(n, ell = SHEPP_LOGAN) {
    const img = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = -1 + (2 * (i + 0.5)) / n, y = -1 + (2 * (j + 0.5)) / n;
        img[j * n + i] = phantomAt(x, y, ell);
    }
    return img;
}
export { SHEPP_LOGAN, phantomAt, radonAt, sinogram, phantomImage };
