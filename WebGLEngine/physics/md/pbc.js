// WebGLEngine/physics/md/pbc.js — v3285
// ---------------------------------------------------------------------------------------------------------------
// PERIODIC BOUNDARIES FOR THE MD DEVICE — the layer every transport measurement needs and the tree did not have.
// computeForces() sums over an open cluster of particles in vacuum, which is correct for a molecule and wrong
// for a fluid: the surface is most of a small box, so density, pressure and diffusion all measure the surface
// rather than the material.
//
// THE MINIMUM IMAGE CONVENTION: with a cutoff r_c < L/2, each pair interacts with exactly ONE image of its
// partner -- the nearest -- because no second image can be closer than L - r_c > r_c. That inequality is the
// whole justification, so it is CHECKED AT CONSTRUCTION rather than assumed: makeBox refuses a cutoff of L/2 or
// more, where the convention silently stops being equivalent to the lattice sum it stands in for.
//
// THE KEYS, and the first is the good one:
//
//   1. AGAINST AN EXPLICIT IMAGE SHELL. Minimum image is a SHORTCUT for summing over periodic images. So sum
//      over an explicit 3x3x3 shell of image boxes and demand the same forces to machine precision. Two
//      mechanisms -- one clever, one brutally literal -- and the literal one contains no shortcut to be wrong in
//      the same way. This is the consistency board's admission rule applied inside a single device.
//
//   2. MOMENTUM IS CONSERVED EXACTLY. Every pair force is applied equal and opposite, so the total momentum of a
//      periodic system cannot drift at all -- not "to tolerance", exactly, in floating point, because the same
//      quantity is added and subtracted. A wrapping bug breaks this instantly.
//
//   3. THE IDEAL-GAS LIMIT OF THE VIRIAL PRESSURE. P = (N kT + W/3) / V with W the virial. As density falls the
//      interaction term must vanish and P V / (N kT) -> 1. A closed form the code never contains, approached
//      from data.
//
//   4. ENERGY CONSERVATION ACROSS WRAPS. Velocity Verlet is symplectic, so total energy oscillates and does not
//      drift -- INCLUDING while particles cross the boundary, which is exactly where a sign error hides.
//
// wrapWRONG is EXPORTED FOR MEASUREMENT: it wraps positions but forgets the minimum image in the force loop, so
// a particle that crosses the boundary is suddenly a box-width away from its neighbours. Everything still runs.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { ljCoeff, ljPotential } from "./md.js";

export function makeBox({ L, cutoff }) {
    if (!(L > 0)) throw new Error("makeBox: box side must be positive");
    if (!(cutoff > 0)) throw new Error("makeBox: cutoff must be positive");
    // THE INEQUALITY THAT MAKES MINIMUM IMAGE VALID, enforced rather than trusted.
    if (cutoff >= L / 2)
        throw new Error("makeBox: cutoff " + cutoff + " >= L/2 (" + (L / 2) + "). Minimum image is only equivalent " +
                        "to the lattice sum when r_c < L/2; past that a pair has two images inside the cutoff and " +
                        "the convention quietly stops meaning what it says.");
    return { L, cutoff, cutoff2: cutoff * cutoff, volume: L * L * L };
}

/** Nearest-image displacement of a along one axis, box side L. */
export const minimumImage = (d, L) => d - L * Math.round(d / L);

/** Fold a coordinate back into [0, L). Wrapping is bookkeeping: it must never change a force. */
export const wrap = (x, L) => { const y = x % L; return y < 0 ? y + L : y; };

export function wrapAll(pos, N, L) { for (let k = 0; k < 3 * N; k++) pos[k] = wrap(pos[k], L); return pos; }

/**
 * Forces under minimum image, plus the potential energy and the VIRIAL W = sum r_ij . f_ij, which the pressure
 * needs and which is free to accumulate here.
 */
// v3285 -- *** THE SHIFT, AND WHY IT IS ON BY DEFAULT. *** Truncating Lennard-Jones at r_c without shifting
// leaves a step of u(r_c) in the potential: at r_c = 3 sigma that is -5.479e-3, and a small box has ~80 pairs
// sitting within 0.4 sigma of the cutoff at any moment. Every crossing pays that step, so total energy wanders
// by an amount that DOES NOT SHRINK WITH THE TIMESTEP -- which is exactly what the gate measured before this
// existed (0.354% at dt=0.008 and 0.355% at dt=0.004, a null result that looked like a broken convergence test
// and was actually a broken potential). Subtracting u(r_c) inside the cutoff makes the energy continuous there
// and hands the excursion back to the integrator, where halving dt can act on it.
//
// The FORCE is untouched: it is already continuous in value at r_c only to the extent LJ is, and shifting the
// energy does not change any derivative. So this changes what is CONSERVED, not what the particles do.
export function computeForcesPBC(pos, N, eps, sig2, box, { minImage = true, shift = true } = {}) {
    const { L, cutoff2 } = box;
    const uShift = shift ? ljPotential(cutoff2, eps, sig2) : 0;
    const forces = new Float64Array(3 * N);
    let pe = 0, virial = 0;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            let dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
            if (minImage) { dx = minimumImage(dx, L); dy = minimumImage(dy, L); dz = minimumImage(dz, L); }
            const r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > cutoff2) continue;
            const k = ljCoeff(r2, eps, sig2);
            forces[3 * i] += k * dx; forces[3 * i + 1] += k * dy; forces[3 * i + 2] += k * dz;
            forces[3 * j] -= k * dx; forces[3 * j + 1] -= k * dy; forces[3 * j + 2] -= k * dz;
            pe += ljPotential(r2, eps, sig2) - uShift;
            virial += k * r2;                       // r_ij . f_ij  with f = k * r_ij
        }
    }
    return { forces, pe, virial };
}

/** NAMED WRONG: positions wrap, forces do not use minimum image. Runs perfectly and is not the same physics. */
export const wrapWRONG = (pos, N, eps, sig2, box) => computeForcesPBC(pos, N, eps, sig2, box, { minImage: false });

/**
 * THE LITERAL ROUTE: sum over an explicit shell of image boxes rather than picking the nearest. Slower by the
 * cube of the shell width and containing no shortcut -- which is the point. shell=1 means the 3x3x3 block.
 */
// The shift MUST be an option here too, and defaulted the same way. It was added to computeForcesPBC alone at
// first, and the image-shell key immediately went red comparing a shifted energy to an unshifted one -- the two
// routes silently stopped describing the same potential. A cross-check between two mechanisms only means
// something while both mechanisms are given the same problem.
export function computeForcesImages(pos, N, eps, sig2, box, { shell = 1, shift = true } = {}) {
    const { L, cutoff2 } = box;
    const uShift = shift ? ljPotential(cutoff2, eps, sig2) : 0;
    const forces = new Float64Array(3 * N);
    let pe = 0, virial = 0;
    // Force on each HOME atom i from every atom j in every image box, including j's own images of i. Each pair
    // is therefore seen twice across the i-loop, so energy and virial take a half; forces do not, because the
    // two sightings are the equal-and-opposite halves of one interaction landing on different atoms.
    for (let i = 0; i < N; i++) {
        for (let ix = -shell; ix <= shell; ix++) for (let iy = -shell; iy <= shell; iy++) for (let iz = -shell; iz <= shell; iz++) {
            const home = ix === 0 && iy === 0 && iz === 0;
            for (let j = 0; j < N; j++) {
                if (home && j === i) continue;
                const dx = pos[3 * i] - (pos[3 * j] + ix * L);
                const dy = pos[3 * i + 1] - (pos[3 * j + 1] + iy * L);
                const dz = pos[3 * i + 2] - (pos[3 * j + 2] + iz * L);
                const r2 = dx * dx + dy * dy + dz * dz;
                if (r2 > cutoff2 || r2 === 0) continue;
                const k = ljCoeff(r2, eps, sig2);
                forces[3 * i] += k * dx; forces[3 * i + 1] += k * dy; forces[3 * i + 2] += k * dz;
                pe += 0.5 * (ljPotential(r2, eps, sig2) - uShift);
                virial += 0.5 * k * r2;
            }
        }
    }
    return { forces, pe, virial };
}

/** Virial pressure: P = (N kT + W/3) / V. */
export function pressure({ N, kT, virial, box }) { return (N * kT + virial / 3) / box.volume; }

/** A cubic lattice of N = n^3 atoms in the box, plus seeded Maxwell velocities at temperature kT. */
export function makeFluid({ n = 4, L = 8, kT = 1.2, seed = 7, mass = 1 } = {}) {
    const N = n * n * n;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), masses = new Float64Array(N).fill(mass);
    const a = L / n;
    let s = seed >>> 0;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    const gauss = () => { let x = 0; for (let i = 0; i < 12; i++) x += u(); return x - 6; };
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let m = 0; m < n; m++) {
        pos[3 * k] = (i + 0.5) * a; pos[3 * k + 1] = (j + 0.5) * a; pos[3 * k + 2] = (m + 0.5) * a; k++;
    }
    const sigmaV = Math.sqrt(kT / mass);
    for (let q = 0; q < 3 * N; q++) vel[q] = sigmaV * gauss();
    // remove drift so momentum starts at zero and its conservation is a meaningful statement
    for (let d = 0; d < 3; d++) {
        let p = 0; for (let i = 0; i < N; i++) p += vel[3 * i + d];
        p /= N; for (let i = 0; i < N; i++) vel[3 * i + d] -= p;
    }
    return { N, pos, vel, masses, L };
}

export function totalMomentum(vel, masses) {
    const p = [0, 0, 0];
    for (let i = 0; i < masses.length; i++) for (let d = 0; d < 3; d++) p[d] += masses[i] * vel[3 * i + d];
    return p;
}
