// simulation/tomo/phantom3d.js -- the 3D phantom, and the reason 3D tomography needs almost no new code.
//
// A parallel-beam scanner whose rays all run perpendicular to the z axis measures each z-slice INDEPENDENTLY. Nothing
// couples one slice to the next. So a 3D reconstruction is a stack of 2D reconstructions -- and the 2D reconstruction
// is already built, already verified, and already earning its numbers on every ship.
//
// The lovely part is why the 2D machinery fits without being bent. The 3D phantom is a sum of ELLIPSOIDS. Slice an
// ellipsoid at height z and you get... an ELLIPSE. Exactly an ellipse, with semi-axes shrunk by a known factor:
//
//     (x/a)^2 + (y/b)^2 + (z/c)^2 <= 1   at height z0   ->   an ellipse with semi-axes a*s, b*s,  s = sqrt(1 - (z0/c)^2)
//
// So each slice of the 3D problem IS a 2D ellipse phantom, which means radonAt() -- the closed-form Radon transform
// verified against a brute-force line integral to 1.57e-5 -- works per slice with no modification at all. The 3D
// sinogram is exact for the same reason the 2D one was, and nothing had to be re-derived.
//
// That is the thesis this engine keeps testing: reconstruction is not a rendering problem, it is a scalar-field
// problem. Stack the slices and the output is a 3D scalar field, which marchScalarField already eats -- the same
// function drawing the D3Q19 wake, the convection plumes, and the cosmic web.
"use strict";

// Kak & Slaney's 3D Shepp-Logan. x0,y0,z0, a,b,c (semi-axes), phi (rotation about z, degrees), rho.
const SHEPP_LOGAN_3D = [
    [   0,      0,      0,    0.69,   0.92,   0.81,    0,   2.00],
    [   0, -0.0184,      0,  0.6624, 0.874,  0.780,    0,  -0.98],
    [0.22,      0,      0,    0.11,   0.31,   0.22,  -18,  -0.02],
    [-0.22,     0,      0,    0.16,   0.41,   0.28,   18,  -0.02],
    [   0,   0.35,  -0.15,    0.21,   0.25,   0.41,    0,   0.01],
    [   0,    0.1,   0.25,   0.046,  0.046,  0.050,    0,   0.01],
    [   0,   -0.1,   0.25,   0.046,  0.046,  0.050,    0,   0.01],
    [-0.08, -0.605,     0,   0.046,  0.023,  0.050,    0,   0.01],
    [   0, -0.606,      0,   0.023,  0.023,  0.020,    0,   0.01],
    [0.06, -0.605,      0,   0.023,  0.046,  0.020,    0,   0.01],
];
const D2R = Math.PI / 180;

// exact, at a point -- no grid
function phantom3dAt(x, y, z, ell = SHEPP_LOGAN_3D) {
    let v = 0;
    for (const [x0, y0, z0, a, b, c, phi, rho] of ell) {
        const cp = Math.cos(phi * D2R), sp = Math.sin(phi * D2R);
        const dx = x - x0, dy = y - y0, dz = z - z0;
        const u = dx * cp + dy * sp, w = -dx * sp + dy * cp;
        if ((u*u)/(a*a) + (w*w)/(b*b) + (dz*dz)/(c*c) <= 1) v += rho;
    }
    return v;
}

// THE BRIDGE: the ellipses this 3D object makes at height z, in exactly the [x0,y0,a,b,phi,rho] shape that
// phantom.js's radonAt() and sinogram() already take. An ellipsoid sliced is an ellipse; no new mathematics.
function sliceEllipses(z, ell = SHEPP_LOGAN_3D) {
    const out = [];
    for (const [x0, y0, z0, a, b, c, phi, rho] of ell) {
        const t = (z - z0) / c;
        if (Math.abs(t) >= 1) continue;               // the slice misses this ellipsoid entirely
        const s = Math.sqrt(1 - t * t);
        out.push([x0, y0, a * s, b * s, phi, rho]);
    }
    return out;
}
export { SHEPP_LOGAN_3D, phantom3dAt, sliceEllipses };
