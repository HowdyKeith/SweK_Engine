// physics/ocean/oceanSurface.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE SEA SURFACE THE PHYSICS READS, ON THE CPU, DETERMINISTIC. Slice 1 of the ocean-optin-surface item in tools/ship/todo.mjs.
//
// WHY IT EXISTS. The vendored web-ocean sea (vendor/web-ocean, see ocean-spike.html) is an FFT sea computed on the GPU, and it reads its
// own water height back a few frames late; GPU FFT results are not bit-identical across machines. A boat, a buoyancy test or a submarine
// broaching cannot stand on that: the same scene would float differently on two machines. This module is the surface they stand on
// instead -- a sum of Gerstner (trochoidal) waves, pure f64 arithmetic, a function of (x, z, t) and a seed and nothing else, so the
// same call returns the same bits wherever it runs. The cheap default water and the opt-in sea are slices 2 to 4; this is only the surface.
//
// THE MODEL. Each component i has a direction D_i, a wavenumber k_i = 2 pi / lambda_i, the deep-water dispersion omega_i = sqrt(g k_i),
// an amplitude A_i, a steepness fraction Q_i and a phase. A particle labelled X on the resting plane is carried to
//     P(X, t) = X + sum Q_i A_i D_i cos(theta_i),   y(X, t) = sum A_i sin(theta_i),   theta_i = k_i D_i . X - omega_i t + phi_i
// which is a trochoid: crests sharpen and troughs flatten, and the surface can be asked for at a WORLD point (x, z) only by inverting the
// horizontal map. sample() does that by fixed-point iteration X <- p - (P(X) - X), which converges geometrically whenever the sum of
// Q_i k_i A_i is below one -- the same condition under which the surface has no loops -- so the constructor REFUSES a spectrum above it.
//
// WHAT IT IS NOT. It is not a spectrum fitted to a sea state, not a statement about what the GPU sea looks like, and not yet wired to
// anything: slice 2 draws the default water from these same waves so that what is seen and what floats agree.
"use strict";

export const G = 9.81;            // m/s^2
export const MAX_STEEPNESS = 0.95; // sum of Q_i k_i A_i; at 1 the crests form cusps and the inversion stops contracting
export const TOLERANCE = 1e-12;    // metres, on the horizontal inversion
export const MAX_ITERATIONS = 80;

/** mulberry32: a 32-bit seeded generator, so a seed names a spectrum on every machine. */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** One component from its readable parameters. `slope` is k*A, the wave's own steepness; amplitude follows from it. */
export function component({ wavelength, heading, slope, phase = 0, q = 1 }) {
    const k = 2 * Math.PI / wavelength;
    return Object.freeze({
        wavelength, k, omega: Math.sqrt(G * k), A: slope / k, Q: q, phase,
        dx: Math.cos(heading), dz: Math.sin(heading), heading, slope,
    });
}

/** The default spectrum for a seed: `n` components, wavelengths spread geometrically, headings within `spread` of `wind`. */
export function defaultComponents(seed = 1, { n = 6, longest = 60, shortest = 6, wind = 0.35, spread = 1.0, totalSlope = 0.6 } = {}) {
    const r = rng(seed);
    const ratio = n > 1 ? Math.pow(shortest / longest, 1 / (n - 1)) : 1;
    const raw = [];
    for (let i = 0; i < n; i++) {
        const wavelength = longest * Math.pow(ratio, i);
        raw.push({ wavelength, heading: wind + (r() * 2 - 1) * spread, phase: r() * 2 * Math.PI, w: Math.pow(wavelength, -0.25) });
    }
    const sum = raw.reduce((a, c) => a + c.w, 0);
    return raw.map((c) => component({ wavelength: c.wavelength, heading: c.heading, phase: c.phase, slope: totalSlope * c.w / sum }));
}

/** Build a surface. Refuses a spectrum whose steepness sum reaches MAX_STEEPNESS. */
export function createSurface({ components = defaultComponents(1), level = 0 } = {}) {
    const comps = components.map((c) => Object.freeze({ ...c }));
    const steepness = comps.reduce((a, c) => a + c.Q * c.k * c.A, 0);
    if (!(steepness < MAX_STEEPNESS)) throw new RangeError(`oceanSurface: steepness sum ${steepness} is not below ${MAX_STEEPNESS}; the surface would fold over itself`);
    const maxHeight = comps.reduce((a, c) => a + c.A, 0);

    /** Where particle X goes at time t. Returns [px, py, pz]. */
    function particle(X1, X2, t) {
        let px = X1, py = level, pz = X2;
        for (const c of comps) {
            const th = c.k * (c.dx * X1 + c.dz * X2) - c.omega * t + c.phase;
            const cs = Math.cos(th);
            px += c.Q * c.A * c.dx * cs;
            pz += c.Q * c.A * c.dz * cs;
            py += c.A * Math.sin(th);
        }
        return [px, py, pz];
    }

    /** The label X whose particle sits at world (x, z) at time t. Returns { X1, X2, iterations, residual }. */
    function invert(x, z, t) {
        let X1 = x, X2 = z, residual = Infinity, it = 0;
        for (; it < MAX_ITERATIONS; it++) {
            const [px, , pz] = particle(X1, X2, t);
            const e1 = px - x, e2 = pz - z;
            residual = Math.hypot(e1, e2);
            if (residual <= TOLERANCE) break;
            X1 -= e1; X2 -= e2;
        }
        return { X1, X2, iterations: it, residual };
    }

    /**
     * The surface AT A LABEL, with no inversion: where particle (X1, X2) is at time t, its unit up-normal, and the Jacobian of the horizontal map
     * (1 on a flat sea, falling toward 0 where particles bunch at a crest -- the number a foam rule wants). This is what a mesh whose vertices are
     * labelled on a regular grid draws, and it is the same arithmetic sample() ends with, so a drawn vertex and a sampled point cannot disagree.
     */
    function atLabel(X1, X2, t = 0) {
        let px = X1, pz = X2, y = level, j11 = 1, j12 = 0, j21 = 0, j22 = 1, yx = 0, yz = 0;
        for (const c of comps) {
            const th = c.k * (c.dx * X1 + c.dz * X2) - c.omega * t + c.phase;
            const sn = Math.sin(th), cs = Math.cos(th);
            px += c.Q * c.A * c.dx * cs; pz += c.Q * c.A * c.dz * cs;
            y += c.A * sn;
            const qak = c.Q * c.A * c.k;
            j11 -= qak * c.dx * c.dx * sn; j12 -= qak * c.dx * c.dz * sn;
            j21 -= qak * c.dz * c.dx * sn; j22 -= qak * c.dz * c.dz * sn;
            yx += c.A * c.k * c.dx * cs; yz += c.A * c.k * c.dz * cs;
        }
        // tangents of the particle map in (x, y, z): Tx = dP/dX1, Tz = dP/dX2; the up normal is Tz x Tx
        const tx = [j11, yx, j21], tz = [j12, yz, j22];
        const nx = tz[1] * tx[2] - tz[2] * tx[1], ny = tz[2] * tx[0] - tz[0] * tx[2], nz = tz[0] * tx[1] - tz[1] * tx[0];
        const len = Math.hypot(nx, ny, nz);
        return { x: px, y, z: pz, nx: nx / len, ny: ny / len, nz: nz / len, jacobian: j11 * j22 - j12 * j21 };
    }

    /** The surface at world (x, z), time t: height, unit normal, and how the inversion did. */
    function sample(x, z, t = 0) {
        const { X1, X2, iterations, residual } = invert(x, z, t);
        const a = atLabel(X1, X2, t);
        return { h: a.y, nx: a.nx, ny: a.ny, nz: a.nz, iterations, residual };
    }

    const height = (x, z, t = 0) => sample(x, z, t).h;
    /** Metres of water above a point (positive means the point is under the surface), the number buoyancy wants. */
    const submergence = (x, y, z, t = 0) => height(x, z, t) - y;
    /** The speed a crest travels at, m/s: omega / k = sqrt(g / k) for deep water. */
    const phaseSpeed = (i) => comps[i].omega / comps[i].k;

    return Object.freeze({ components: comps, level, steepness, maxHeight, particle, invert, atLabel, sample, height, submergence, phaseSpeed });
}

/** The seeded default surface; the same seed is the same sea on every machine. */
export const defaultSurface = (seed = 1) => createSurface({ components: defaultComponents(seed) });

/** A hand-checkable fixture: one wave with k = 1 and no horizontal motion, so every number below is a closed form. */
export function reportLines() {
    const L = [];
    const one = createSurface({ components: [component({ wavelength: 2 * Math.PI, heading: 0, slope: 1 / 2, q: 0 })] });   // k = 1, A = 0.5, Q = 0
    const w = one.components[0].omega;
    L.push("[oceanSurface] a CPU sea the physics can stand on: Gerstner waves, f64, a function of (x, z, t, seed) alone");
    L.push(`  one wave, k = 1, A = 0.5, no steepness: omega = sqrt(g) = ${w.toFixed(6)} rad/s, crest speed ${one.phaseSpeed(0).toFixed(6)} m/s`);
    L.push(`  height at x = pi/2, t = 0 is A = ${one.height(Math.PI / 2, 0, 0).toFixed(6)}; at x = 3pi/2 it is -A = ${one.height(3 * Math.PI / 2, 0, 0).toFixed(6)}`);
    const t1 = Math.PI / w;   // half a period later the same point is a trough
    L.push(`  half a period (${t1.toFixed(6)} s) later x = pi/2 reads ${one.height(Math.PI / 2, 0, t1).toFixed(6)}`);
    const sea = defaultSurface(1);
    const s = sea.sample(0, 0, 0);
    L.push(`  default sea, seed 1: ${sea.components.length} components, steepness sum ${sea.steepness.toFixed(4)} (refused at ${MAX_STEEPNESS}), height at the origin ${s.h.toFixed(6)} m, up-normal y ${s.ny.toFixed(6)}`);
    L.push(`  inverted in ${s.iterations} iterations to ${s.residual.toExponential(2)} m`);
    return L;
}
