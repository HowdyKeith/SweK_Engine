// WebGLEngine/physics/em/hall.js — v3409
// ---------------------------------------------------------------------------------------------------------------
// THE HALL EFFECT — and the falsifier is a quantity that must NOT change.
//
// Put a current through a conductor, add a magnetic field across it, and a voltage appears at right angles to
// both. Hall measured it in 1879 and it is still how the carrier density of a semiconductor is determined,
// because the answer is exact and depends on almost nothing:
//
//     rho_xy = B / (n q)
//
// No mass, no scattering time, no temperature. Just how many carriers there are and what charge they carry --
// which is why the SIGN of rho_xy is the historically important part: a positive Hall coefficient means the
// carriers are positive, and that was inexplicable until band theory explained holes.
//
// *** AND THE OTHER KEY IS THAT NOTHING HAPPENS. *** In the single-carrier Drude model the transverse
// CONDUCTIVITY collapses with field,
//
//     sigma_xx = sigma_0 / (1 + (wc tau)^2)
//
// falling by a factor of five at wc tau = 2 -- and yet the RESISTIVITY rho_xx = 1/sigma_0 IS EXACTLY INDEPENDENT
// OF B. There is no magnetoresistance. The two statements are not in tension: rho is the INVERSE OF THE TENSOR,
// not the reciprocal of its diagonal, and inverting a 2x2 with off-diagonal terms puts the (1 + (wc tau)^2) back
// exactly. Anyone who writes rho_xx = 1/sigma_xx gets a magnetoresistance of 400% at wc tau = 2, which is a
// large, smooth, entirely plausible curve for an effect that is not there.
//
// So this device is graded on a number that must move linearly and a number that must not move at all, and the
// second is the one that catches the mistake people actually make.
//
// THE SIMULATION IS STOCHASTIC ON PURPOSE. Carriers are integrated under the Lorentz force with Poisson
// scattering at rate 1/tau, and the drift velocity is measured from the ensemble. Nothing in the integrator
// knows sigma_0, wc, or the closed form -- so agreement is a measurement rather than an identity, and the
// scatter is real scatter that has to be beaten down by sampling.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const ELEM_CHARGE = 1.602176634e-19;      // C, exact by definition of the ampere
export const ELECTRON_MASS = 9.1093837015e-31;   // kg, CODATA

/** Cyclotron angular frequency: how fast the field turns a carrier. */
export const cyclotron = (B, q = ELEM_CHARGE, m = ELECTRON_MASS) => Math.abs(q) * B / m;

/** Drude DC conductivity at zero field. */
export const sigma0 = (n, tau, q = ELEM_CHARGE, m = ELECTRON_MASS) => n * q * q * tau / m;

/** The exact conductivity tensor. sigma_xx COLLAPSES with field; sigma_xy peaks and falls. */
export function sigmaTensor({ n, tau, B, q = ELEM_CHARGE, m = ELECTRON_MASS, sign = -1 }) {
    const s0 = sigma0(n, tau, q, m);
    const wct = sign * cyclotron(B, q, m) * tau;      // sign carries the carrier charge
    const d = 1 + wct * wct;
    return { xx: s0 / d, xy: s0 * wct / d, wct, s0 };
}

/** The exact resistivity tensor: the INVERSE of the conductivity tensor, not the reciprocal of its diagonal. */
export function rhoTensor(args) {
    const s = sigmaTensor(args);
    const det = s.xx * s.xx + s.xy * s.xy;
    return { xx: s.xx / det, xy: -s.xy / det, sigma: s };
}

/** rho_xy = B/(nq), with the sign of the carrier. The whole point of the measurement. */
export const hallResistivity = ({ n, B, q = ELEM_CHARGE, sign = -1 }) => sign * B / (n * q);

/** A deterministic seeded generator, so a disagreement reproduces. */
function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * Monte Carlo Drude transport. Carriers accelerate under E and B and scatter at Poisson-distributed times,
 * losing all drift memory at each collision. The drift velocity is the ensemble average, and the current density
 * follows as J = n q v.
 *
 * The integrator is a Boris-style rotation split so the magnetic part is EXACTLY a rotation and cannot pump
 * energy -- a plain Euler step gains speed under a pure B field, which would show up as a spurious
 * magnetoresistance and be indistinguishable from physics.
 */
export function driftVelocity({ n, tau, B, E = [1, 0], q = ELEM_CHARGE, m = ELECTRON_MASS, sign = -1,
                                carriers = 4000, dt = null, steps = 4000, seed = 7 } = {}) {
    const rng = makeRng(seed);
    const wc = cyclotron(B, q, m);
    const h = dt || Math.min(tau / 40, wc > 0 ? 0.05 / wc : tau / 40);
    const qs = sign * Math.abs(q);                     // signed charge
    let vxSum = 0, vySum = 0, samples = 0;
    const pScatter = 1 - Math.exp(-h / tau);
    for (let c = 0; c < carriers; c++) {
        let vx = 0, vy = 0;
        for (let s = 0; s < steps; s++) {
            // half electric kick
            vx += (qs * E[0] / m) * (h / 2);
            vy += (qs * E[1] / m) * (h / 2);
            // exact magnetic rotation by the cyclotron angle over h
            const th = (qs * B / m) * h;
            const cth = Math.cos(th), sth = Math.sin(th);
            const nvx = vx * cth + vy * sth, nvy = -vx * sth + vy * cth;
            vx = nvx; vy = nvy;
            // second half electric kick
            vx += (qs * E[0] / m) * (h / 2);
            vy += (qs * E[1] / m) * (h / 2);
            // Poisson scattering: all drift memory lost
            if (rng() < pScatter) { vx = 0; vy = 0; }
            if (s > steps / 2) { vxSum += vx; vySum += vy; samples++; }   // discard the transient
        }
    }
    return { vx: vxSum / samples, vy: vySum / samples, h, wcTau: wc * tau };
}

/** Measured conductivity tensor from the drift response to a field along x. */
export function measureSigma(opts = {}) {
    const { n, q = ELEM_CHARGE, sign = -1 } = opts;
    const Ex = opts.E ? opts.E[0] : 1;
    const v = driftVelocity({ ...opts, E: [Ex, 0] });
    const qs = sign * Math.abs(q);
    return { xx: n * qs * v.vx / Ex, xy: n * qs * v.vy / Ex, wcTau: v.wcTau };
}

/** Measured resistivity: invert the measured conductivity tensor. The inversion is where the physics hides. */
export function measureRho(opts = {}) {
    const s = measureSigma(opts);
    const det = s.xx * s.xx + s.xy * s.xy;
    return { xx: s.xx / det, xy: -s.xy / det, sigma: s };
}

/** NAMED WRONG: the reciprocal of the diagonal, which is what people write and which invents magnetoresistance. */
export const rhoXX_WRONG = (opts = {}) => 1 / measureSigma(opts).xx;
