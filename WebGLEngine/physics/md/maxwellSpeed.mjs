// physics/md/maxwellSpeed.mjs -- v3810
//
// THE MAXWELL-BOLTZMANN SPEED DISTRIBUTION, AND EVERY KEY IS A DIMENSIONLESS FACT ABOUT SPACE RATHER THAN A
// NUMBER TYPED INTO THIS FILE.
//
// physics/md/thermostat.js sets a temperature from kinetic energy (equipartition, kB = 1) and physics/md/md.js
// integrates the velocities -- but NOTHING HAS EVER GRADED THE SHAPE those velocities are supposed to have. An
// MD system at temperature T does not merely have the right MEAN kinetic energy; the SPEEDS are distributed in
// a way whose moments are fixed, and the ratios between them are pure numbers that carry no kT and no m at all.
//
// *** THE KEYS, AND NOT ONE IS A REFERENCE VALUE I TYPED:
//   1. THE RATIOS. In d dimensions v_p : <v> : v_rms is a function of d ALONE -- kT and m cancel. For d = 3
//      it is sqrt(2) : sqrt(8/pi) : sqrt(3). That is a fact about the geometry of a Gaussian in d dimensions,
//      not about this code, and it is INVARIANT under any kT and any m, which is the control.
//   2. EQUIPARTITION. <(1/2) m v^2> = (d/2) kT EXACTLY -- each Cartesian degree of freedom carries (1/2)kT.
//      This is the identity physics/md/thermostat.js already inverts to read a temperature, so a sample drawn
//      here and handed to that function must return the T it was drawn at.
//   3. TWO ROUTES SHARING NO CODE. The closed-form moment (2kT/m)^(n/2) * Gamma((d+n)/2)/Gamma(d/2) uses the
//      Gamma function; a Gamma-FREE quadrature takes the ratio of two integrals of the bare kernel so the
//      normalisation (and thus Gamma) cancels. A third route SAMPLES d independent Gaussian velocity
//      components and measures the speed moments, which is the distribution's actual construction rather than
//      its formula. Three answers to one number, and none is a restatement of another.
//
// *** THE LOAD-BEARING NEGATIVE: THE DIMENSION IS NOT DECORATION. The 2D (Rayleigh) ratios differ from the 3D
// ones, and grading a 3D sample against 2D moments is a real error a check can be built to catch. And d = 1 is
// an edge the peak formula cannot answer -- the most-probable SPEED of a 1D gas is 0 (the half-Gaussian peaks
// at the origin), so v_p = sqrt((d-1)kT/m) is 0 there and is refused rather than reported as a speed. ***
//
// BROWSER-SAFE: no node builtins, no DOM. Deterministic: the sampler takes a seed, so every number a gate
// reads here reproduces bit-for-bit across the fleet.

// ---- Gamma, by Lanczos (g=7). Pinned in the gate against Gamma(1), Gamma(1/2)=sqrt(pi), Gamma(3/2), ------
// ---- Gamma(5/2), Gamma(4)=6, so it is an external anchor and not a routine trusted on faith. ------------
const _LZ = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
export function gammaFn(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
    z -= 1;
    let x = _LZ[0];
    for (let i = 1; i < 9; i++) x += _LZ[i] / (z + i);
    const t = z + 7 + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ---- The distribution itself. f(v) = C * v^(d-1) * exp(-m v^2 / (2 kT)), C the normaliser. ---------------
// The d-dimensional speed pdf is the chi distribution scaled by sqrt(kT/m); at d = 3 this is exactly the
// textbook 4*pi*(m/(2*pi*kT))^(3/2) * v^2 * exp(...), which the gate confirms rather than assumes.
export function mbPdf(v, kT, m, d = 3) {
    if (v < 0) return 0;
    const a = m / (2 * kT);                                   // exponent scale
    const norm = 2 * Math.pow(a, d / 2) / gammaFn(d / 2);      // = 1 / (2^(d/2-1) Gamma(d/2)) * (m/kT)^(d/2)... see gate S1
    return norm * Math.pow(v, d - 1) * Math.exp(-a * v * v);
}

// ---- Closed-form raw speed moments: <v^n> = (2kT/m)^(n/2) * Gamma((d+n)/2) / Gamma(d/2). ------------------
export function moment(n, kT, m, d = 3) {
    return Math.pow(2 * kT / m, n / 2) * gammaFn((d + n) / 2) / gammaFn(d / 2);
}

// The three canonical speeds, each from the moments / the peak condition -- closed form, no fit.
export const rmsSpeed = (kT, m, d = 3) => Math.sqrt(d * kT / m);          // sqrt(<v^2>), <v^2> = d kT/m
export const meanSpeed = (kT, m, d = 3) => moment(1, kT, m, d);           // <v>
// Most-probable speed maximises f(v): v_p = sqrt((d-1) kT / m). d=1 has its peak at the origin -> not a speed.
export function mostProbableSpeed(kT, m, d = 3) {
    if (d < 2) return null;                                                // the 1D peak is at v = 0; there is no most-probable SPEED
    return Math.sqrt((d - 1) * kT / m);
}

// Mean kinetic energy per particle -- equipartition. <(1/2) m v^2> = (d/2) kT, and it is EXACT.
export const meanKE = (kT, m, d = 3) => 0.5 * m * moment(2, kT, m, d);   // = (d/2) kT

// The dimensionless ratios that carry neither kT nor m. This is the external key.
export function speedRatios(d = 3) {
    // Use kT = m = 1; the ratios are invariant to both (the gate proves the invariance).
    const vp = mostProbableSpeed(1, 1, d), vm = meanSpeed(1, 1, d), vr = rmsSpeed(1, 1, d);
    return { vp, vm, vr, mean_over_rms: vm / vr, peak_over_rms: vp == null ? null : vp / vr };
}

// ---- Gamma-FREE quadrature of a moment, as a ratio of integrals so the normaliser cancels. ---------------
// <v^n> = INT v^n g(v) dv / INT g(v) dv,  g(v) = v^(d-1) exp(-m v^2 / 2kT).  Composite Simpson on [0, vMax].
// Shares NO code with moment(): no Gamma, no mbPdf. vMax is set from the physical scale (many rms speeds), so
// the tail truncation is far below the tolerance the gate checks against rather than tuned to it.
export function momentQuad(n, kT, m, d = 3, { steps = 200000, vMaxRms = 12 } = {}) {
    const vMax = vMaxRms * rmsSpeed(kT, m, d);
    const a = m / (2 * kT);
    const g = (v) => Math.pow(v, d - 1) * Math.exp(-a * v * v);
    const h = vMax / steps;
    let num = 0, den = 0;                                     // Simpson accumulators for INT v^n g and INT g
    for (let i = 0; i <= steps; i++) {
        const v = i * h;
        const w = (i === 0 || i === steps) ? 1 : (i % 2 ? 4 : 2);
        const gv = g(v);
        num += w * Math.pow(v, n) * gv;
        den += w * gv;
    }
    return num / den;                                         // the (h/3) factor and the normaliser both cancel
}

// ---- The sampler: d independent Gaussian velocity components, each with variance kT/m. -------------------
// This is the distribution's CONSTRUCTION rather than its formula. Deterministic via a seeded PRNG so a gate
// reads the same numbers on every machine. Returns speeds AND the flat velocity array (d per particle) so the
// same draw can be handed to physics/md/thermostat.js as a real consumer join.
function _mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function _gauss(rng) {                                        // Box-Muller, one standard normal per call
    let u = 0, v = 0;
    while (u === 0) u = rng();                                // avoid log(0)
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function sampleSpeeds(N, kT, m, d = 3, seed = 1) {
    const rng = _mulberry32(seed);
    const sd = Math.sqrt(kT / m);                            // per-component standard deviation
    const speeds = new Float64Array(N);
    const vel = new Float64Array(N * d);
    for (let i = 0; i < N; i++) {
        let s2 = 0;
        for (let k = 0; k < d; k++) {
            const c = sd * _gauss(rng);
            vel[i * d + k] = c;
            s2 += c * c;
        }
        speeds[i] = Math.sqrt(s2);
    }
    return { speeds, vel };
}

// Sample raw moment <v^n> from a speeds array.
export function sampleMoment(speeds, n) {
    let s = 0;
    for (let i = 0; i < speeds.length; i++) s += Math.pow(speeds[i], n);
    return s / speeds.length;
}

// Recover kT from a speeds sample by inverting equipartition: <v^2> = d kT/m  =>  kT = m <v^2> / d.
// This is the same physics physics/md/thermostat.temperature() inverts, stated on speeds instead of velocities.
export function recoverKT(speeds, m, d = 3) {
    return m * sampleMoment(speeds, 2) / d;
}

// v3810 -- MEASURED, printed by the gate rather than trusted from this comment.
export const MEASURED_V3810 = {
    ratios3D: { mean_over_rms: "sqrt(8/(3*pi)) = 0.9213177", peak_over_rms: "sqrt(2/3) = 0.8164966" },
    note: "kB = 1 to match physics/md/thermostat.js. d=1 has no most-probable speed (peak at origin).",
};
