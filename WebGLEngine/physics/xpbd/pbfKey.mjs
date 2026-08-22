// physics/xpbd/pbfKey.mjs
//
// v3462 -- THE SPH KERNEL NORMALISATION IS AN EXACT ANALYTIC KEY.
//
// pbf.js is Macklin-Muller position-based fluids: each particle carries a density constraint C_i = rho_i/rho0 - 1
// and the projection spreads particles until density relaxes. Two keys, one exact and one behavioural.
//
// KEY 1 -- THE KERNEL INTEGRATES TO EXACTLY ONE, AND THAT IS ANALYTIC.
//
//     poly6 W(r,h) = 315/(64 pi h^9) (h^2 - r^2)^3    for r < h
//
// and the integral over the sphere of radius h is 1 by construction, for EVERY h. The interior integral works
// out to 16/315 of 4 pi h^9, and the leading constant is exactly its reciprocal. Measured by quadrature:
//
//     h = 0.5   1.0000000000   err 2.66e-14
//     h = 1.0   1.0000000000   err 2.66e-14
//     h = 2.5   1.0000000000   err 2.64e-14
//
// The h-independence is the point. A kernel normalised for one smoothing length and used at another gives
// densities off by a factor of (h/h')^3, and every pressure downstream inherits it.
//
// *** AND poly6 TAKES r SQUARED, NOT r. *** The first measurement passed r and got an integral of 0.328125 --
// a clean-looking 21/64 that could easily be read as a normalisation constant gone astray in the source. It is
// not: the module is correct and the call was wrong. The peak value AGREED, because poly6(0,h) and poly6(0^2,h)
// are the same call, so a single-point check passed while every other radius was evaluated at the wrong place.
// That is the tenth wrong argument this session and the first where a spot check actively concealed it.
//
// KEY 2 -- COMPRESSION IS RECOVERED. A lattice squeezed to 88% of its spacing has a density error the solver
// must reduce: rms 0.6544 -> 0.0710 over sixty steps, a 9.2x reduction. The rest density is MEASURED from the
// relaxed lattice rather than assumed to be 1 -- at spacing 0.16 and h 0.25 the interior density is 185.77, and
// passing rho0 = 1 makes every constraint report a 200-fold error that no amount of projection can fix.

import { poly6, spikyGradMag, buildNeighbors, pbfProject, densityStats } from "./pbf.js";

/** Quadrature of the kernel over its support. Must be 1 for every h. */
export function kernelIntegral(h, samples = 500000) {
    let I = 0;
    const dr = h / samples;
    for (let i = 0; i < samples; i++) {
        const r = (i + 0.5) * dr;
        I += poly6(r * r, h) * 4 * Math.PI * r * r * dr;   // r SQUARED -- see the note above
    }
    return I;
}

/** The kernel's peak, which has a closed form and is h-dependent. */
export const poly6Peak = (h) => 315 / (64 * Math.PI * Math.pow(h, 3));

/** A cubic lattice of particles at a given spacing. */
export function lattice(nSide = 6, spacing = 0.16) {
    const p = [];
    for (let x = 0; x < nSide; x++) for (let y = 0; y < nSide; y++) for (let z = 0; z < nSide; z++) {
        p.push(x * spacing, y * spacing, z * spacing);
    }
    return Float64Array.from(p);
}

/** Density of an interior particle -- the rest density of a packing, measured rather than assumed. */
export function latticeRestDensity(nSide = 6, spacing = 0.16, h = 0.25) {
    const pos = lattice(nSide, spacing), n = pos.length / 3;
    const nbr = buildNeighbors(pos, n, h);
    const i = Math.floor(n / 2);
    let rho = poly6(0, h);
    for (const j of nbr[i]) {
        const d = (pos[3 * i] - pos[3 * j]) ** 2 + (pos[3 * i + 1] - pos[3 * j + 1]) ** 2 + (pos[3 * i + 2] - pos[3 * j + 2]) ** 2;
        rho += poly6(d, h);
    }
    return rho;
}

/** Compress a lattice and let the solver restore it. */
export function compressionRecovery({ nSide = 6, spacing = 0.16, h = 0.25, squeeze = 0.88, steps = 60, iterations = 4 } = {}) {
    const rho0 = latticeRestDensity(nSide, spacing, h);
    const pred = lattice(nSide, spacing * squeeze);
    const n = pred.length / 3;
    const invMass = new Float64Array(n).fill(1);
    const before = densityStats(pred, n, buildNeighbors(pred, n, h), h, rho0);
    for (let s = 0; s < steps; s++) {
        pbfProject(pred, n, invMass, buildNeighbors(pred, n, h), { h, rho0, iterations });
    }
    const after = densityStats(pred, n, buildNeighbors(pred, n, h), h, rho0);
    return {
        rho0, n, before, after,
        reduction: after.rms > 0 ? before.rms / after.rms : Infinity,
        finite: Number.isFinite(after.rms) && Number.isFinite(before.rms),
    };
}
