// simulation/tomo/volume.js -- a stack of reconstructed slices is a volume, and a volume is a scalar field.
//
// This is the payoff of the whole tomography arc, and it is deliberately boring: there is almost no new code here,
// because there was almost nothing new to invent. A parallel-beam scan measures each z-slice independently, an
// ellipsoid sliced is an ellipse, and the 2D reconstruction was built and verified two rounds ago. So 3D is a loop.
//
// What comes out the far end is a Float32Array of density on a regular grid -- which is exactly what
// marchScalarField eats, and exactly what the D3Q19 wake, the convection plumes and the cosmic web all hand it.
// Reconstruction was never a rendering problem for this engine. It was a scalar-field problem, and the scalar-field
// half has been built and verified since long before anyone asked for a CT scanner.
"use strict";
import { sinogram } from "./phantom.js";
import { reconstruct } from "./fbp.js";
import { sliceEllipses } from "./phantom3d.js";

// Reconstruct a volume from analytic projections, slice by slice.
// onSlice(z, k, total) is called after each one, so a page can show it filling in rather than freeze for ten seconds.
function reconstructVolume({ n = 48, nz = 48, nAngles = 90, nDet = 128, zMin = -0.9, zMax = 0.9, ell = null, onSlice = null } = {}) {
    const vol = new Float32Array(n * n * nz);
    for (let k = 0; k < nz; k++) {
        const z = zMin + (zMax - zMin) * (k + 0.5) / nz;
        const slice2d = sliceEllipses(z, ...(ell ? [ell] : []));
        if (!slice2d.length) { if (onSlice) onSlice(z, k, nz); continue; }   // this height misses the object entirely
        // the SAME analytic sinogram and the SAME filtered back-projection the 2D round verified -- no modification
        const img = reconstruct(sinogram({ nAngles, nDet, ell: slice2d }), n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vol[(k * n + j) * n + i] = img[j * n + i];
        if (onSlice) onSlice(z, k, nz);
    }
    return { vol, n, nz, zMin, zMax };
}
export { reconstructVolume };
