// physics/em/maxwell.mjs
//
// v3387 -- ELECTROMAGNETISM, THE LARGEST MISSING DOMAIN, AND IT ARRIVES AS A CONNECTOR RATHER THAN AN ISLAND.
//
// The tree had optics (rays, diffraction) and discharge, and no Maxwell anywhere. What makes this worth building
// now rather than earlier is that three fields already in the lab supply its keys:
//
//   ACOUSTICS  the Yee FDTD scheme has the SAME Courant structure as the acoustic one, including the magic time
//              step -- at C = 1 in 1D the scheme is exact, and the CFL limit is a cliff.
//   SEISMIC    Fresnel reflection at normal incidence IS the impedance reflection (Z2 - Z1)/(Z2 + Z1) with
//              Z = Z0/n. Measured: both give exactly -0.2 at n = 1 into n = 1.5. Same relation, different field.
//   SEISMIC    Snell's law is the same conserved ray parameter sin(i)/v that bends seismic rays.
//
// AND TWO KEYS COME FROM NATURE, not from the tree:
//
//   c = 1/sqrt(mu0 eps0)   = 299792458.000 m/s against the DEFINED 299792458. The metre is defined from c, so
//                            this is a consistency check on the CODATA permittivity and permeability, and it
//                            holds to 2.2e-14 -- which is the precision of those constants, not of the formula.
//   Z0 = sqrt(mu0/eps0)    = 376.730313667 ohms against an accepted 376.730313668.
//
// A field that only agreed with itself would be worth much less than one that ties three others together.

export const EPS0 = 8.8541878128e-12;      // F/m, CODATA
export const MU0 = 1.25663706212e-6;       // H/m, CODATA
export const C_DEFINED = 299792458;        // m/s, exact by definition of the metre

/** The speed of light from the vacuum constants -- a route that does not use C_DEFINED. */
export const lightSpeed = () => 1 / Math.sqrt(MU0 * EPS0);
/** Impedance of free space. */
export const impedanceFreeSpace = () => Math.sqrt(MU0 / EPS0);

/** Refractive index from relative permittivity and permeability. */
export const refractiveIndex = (epsR, muR = 1) => Math.sqrt(epsR * muR);
/** Wave impedance in a medium: Z0/n for a non-magnetic material. */
export const waveImpedance = (epsR, muR = 1) => Math.sqrt(MU0 * muR / (EPS0 * epsR));
/** Phase velocity in a medium. */
export const phaseSpeed = (epsR, muR = 1) => lightSpeed() / refractiveIndex(epsR, muR);

/** Fresnel amplitude reflection at normal incidence. Same algebra as the seismic impedance reflection. */
export const fresnelNormal = (n1, n2) => (n1 - n2) / (n1 + n2);
/** Snell: n sin(theta) is conserved -- the same invariant as the seismic ray parameter sin(i)/v. */
export const snellRefract = (n1, n2, theta1) => {
    const s = n1 * Math.sin(theta1) / n2;
    return Math.abs(s) <= 1 ? Math.asin(s) : NaN;      // NaN past the critical angle: total internal reflection
};
export const criticalAngle = (n1, n2) => (n2 < n1 ? Math.asin(n2 / n1) : NaN);

// ---- 1D YEE FDTD -------------------------------------------------------------------------------------------------
//
// E and H live on staggered half-cells, which is what makes the scheme second-order with only nearest neighbours.
// The Courant number C = c dt / dx behaves exactly as in acoustics: exact at 1, dispersive below, divergent above.

/** The CFL limit falls as 1/sqrt(dimension) -- 1 in 1D, 0.7071 in 2D, 0.5774 in 3D. */
export const cflLimit = (dim) => 1 / Math.sqrt(dim);

export function yee1D(shape, N, C, steps) {
    const E = new Float64Array(N), H = new Float64Array(N);
    for (let i = 0; i < N; i++) E[i] = shape(i);
    for (let n = 0; n < steps; n++) {
        for (let i = 0; i < N - 1; i++) H[i] += C * (E[i + 1] - E[i]);
        for (let i = 1; i < N - 1; i++) E[i] += C * (H[i] - H[i - 1]);
    }
    return { E, H };
}

/** Peak |E| after a run -- the divergence detector for the CFL check. */
export function peakField(shape, N, C, steps) {
    const { E } = yee1D(shape, N, C, steps);
    let mx = 0;
    for (const v of E) mx = Math.max(mx, Math.abs(v));
    return mx;
}

export const gaussianPulse = (x0, width) => (x) => Math.exp(-Math.pow((x - x0) / width, 2));
