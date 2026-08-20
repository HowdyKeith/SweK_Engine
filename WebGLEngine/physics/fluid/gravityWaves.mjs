// physics/fluid/gravityWaves.mjs
//
// SURFACE GRAVITY WAVES, AND THE DISPERSION RELATION THE TREE'S THREE HEIGHT-FIELD WATERS DO NOT HAVE.
//
// The external key, and it is one of the cleanest in all of fluid mechanics -- a wave speed predicted from
// DEPTH ALONE, with nothing from any grid in it:
//
//     omega^2 = g k tanh(k h)                                     (linear surface gravity waves, depth h)
//     c(k)    = omega/k = sqrt( (g/k) tanh(k h) )
//     k h -> 0   =>   c -> sqrt(g h)                              SHALLOW: NON-DISPERSIVE, every wave the same speed
//     k h -> inf =>   c -> sqrt(g/k)                              DEEP:    DISPERSIVE, long waves outrun short ones
//     DEEP WATER:     c_group = c_phase / 2, EXACTLY                       (why a wave group outruns its own crests)
//
// *** WHAT THE TREE ACTUALLY HAS, CHECKED BEFORE ANY OF THIS WAS WRITTEN. THREE separate height-field waters --
// water/waterMath.js (waveStep), render/WaterField.js, world/waveSystem.js -- AND NOT ONE OF THEM CONTAINS g,
// A DEPTH, A dx OR A dt. `grep` for a gravity-wave term across water/, render/ and world/ returns nothing.
// water/tools/water-selfcheck.mjs proves that a drop propagates and then decays, and NEVER ASKS HOW FAST. So
// the wave speed of the engine's water has never been a number anybody could predict, and this file makes it
// one -- without editing the solver, which is correct for what it is. ***
//
// THE SHIPPED SCHEME'S OWN DISPERSION RELATION, DERIVED RATHER THAN MEASURED-THEN-FITTED. waveStep is
//     v <- (v + s (avg - h)) * damping,   h <- h + v,     s = 2.0 hardcoded, avg = the 4-neighbour mean
// For a plane wave exp(i k.x) on the 5-point stencil, avg - h = -(sin^2(kx/2) + sin^2(ky/2)) h, so with
// alpha = s (sin^2(kx/2) + sin^2(ky/2)) and damping 1 the map gives h_{n+1} - 2h_n + h_{n-1} = -alpha h_n, i.e.
//
//     sin^2(omega/2) = (s/4) (sin^2(kx/2) + sin^2(ky/2))
//
// Two things fall straight out of that and BOTH ARE FACTS ABOUT SHIPPED CODE:
//
//   1. THE LONG-WAVE SPEED IS sqrt(s/4) CELLS PER STEP. At the shipped s = 2 that is 1/sqrt(2) = 0.7071 --
//      A LATTICE CONSTANT. It cannot depend on depth because there is no depth in the solver to depend on.
//
//   2. *** THE WORST MODE IS THE CHECKERBOARD kx = ky = pi, where sin^2(omega/2) = s/2, so THE 2D STABILITY
//      LIMIT IS s <= 2 AND THE SHIPPED VALUE IS EXACTLY 2.0 -- ON the boundary, not near it. At s = 2 the root
//      is DEFECTIVE (omega = pi twice over), which does not blow up exponentially: it grows LINEARLY, measured
//      at exactly 2 per step. The only thing holding it is `damping`, whose comment says "lose energy each
//      step" -- AN ARTISTIC KNOB THAT IS LOAD-BEARING FOR STABILITY, and one constant doing two jobs with only
//      one of them written down. The module's own header says "Stable for damping in (0,1)" and that sentence
//      is TRUE, MEASURED HERE FOR THE FIRST TIME, AND TRUE FOR A DIFFERENT REASON THAN IT IMPLIES. ***
//
// NOTHING IN water/waterMath.js IS EDITED BY THIS FILE. It is a competent classic height-field solver and the
// finding is about what it CAN say, not about a bug. The gate asserts its constants are unchanged, with the
// antidote written in.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

export const G_EARTH = 9.80665;                      // m/s^2, standard gravity

// --- the physics -------------------------------------------------------------------------------------------
/** omega(k, h): the linear surface-gravity-wave dispersion relation. k in rad/m, h in m. */
export function omega(k, h, g = G_EARTH) {
    if (!(k > 0) || !(h > 0)) return null;
    return Math.sqrt(g * k * Math.tanh(k * h));
}

/** Phase speed: how fast an individual CREST moves. */
export const phaseSpeed = (k, h, g = G_EARTH) => (k > 0 && h > 0 ? omega(k, h, g) / k : null);

/** Group speed ANALYTICALLY: c_g = domega/dk = (c/2)(1 + 2kh/sinh(2kh)). */
export function groupSpeed(k, h, g = G_EARTH) {
    if (!(k > 0) || !(h > 0)) return null;
    const x = 2 * k * h;
    // sinh overflows for large x; there the bracket is 1 and the answer is c/2, which is the deep-water limit.
    const bracket = x > 700 ? 1 : 1 + x / Math.sinh(x);
    return 0.5 * phaseSpeed(k, h, g) * bracket;
}

/** Group speed NUMERICALLY, from a central difference on omega(k). Shares no algebra with groupSpeed above. */
export function groupSpeedNumeric(k, h, g = G_EARTH, rel = 1e-5) {
    const dk = k * rel;
    const a = omega(k + dk, h, g), b = omega(k - dk, h, g);
    return a === null || b === null ? null : (a - b) / (2 * dk);
}

/** The two limits, each an elementary closed form with no tanh in it. */
export const shallowSpeed = (h, g = G_EARTH) => (h > 0 ? Math.sqrt(g * h) : null);
export const deepSpeed = (k, g = G_EARTH) => (k > 0 ? Math.sqrt(g / k) : null);

/**
 * HOW SHALLOW IS SHALLOW? c/sqrt(gh) = sqrt(tanh(kh)/(kh)), so the non-dispersive approximation carries a
 * relative error that depends on kh AND ON NOTHING ELSE -- not on g, not on the grid, not on the amplitude.
 * Returns the kh at which that error first exceeds `tol`, found by bisection rather than from a series, so the
 * answer is not a restatement of the expansion it is meant to justify.
 */
export function shallowValidity(tol = 0.01) {
    const err = (x) => Math.abs(Math.sqrt(Math.tanh(x) / x) - 1);
    let lo = 1e-6, hi = 10;
    for (let i = 0; i < 200; i++) { const mid = 0.5 * (lo + hi); if (err(mid) < tol) lo = mid; else hi = mid; }
    return { kh: lo, wavelengthsPerDepth: 2 * Math.PI / lo, error: err(lo) };
}

// --- the scheme, derived from waveStep's own update --------------------------------------------------------
/** The 2D stability limit of the waveStep family: the checkerboard mode needs sin^2(omega/2) = s/2 <= 1. */
export const schemeStabilityLimit = () => 2;

/**
 * The discrete dispersion relation, as { omega, q, marginal }, or null where the mode genuinely GROWS.
 *
 * *** THE FIRST VERSION OF THIS FUNCTION REFUSED THE SHIPPED CONFIGURATION, AND THAT WAS MY BUG, NOT THE
 * SOLVER'S. At s = 2 the checkerboard gives q = 1 exactly (up to one ulp), and a bare `if (q > 1) return null`
 * turned the ONE case this whole file is about into "unstable". q = 1 is MARGINAL: omega = pi, a DEFECTIVE
 * double root that grows LINEARLY rather than exponentially. Marginal and unstable are two different claims and
 * a single boolean could not carry both -- so both are returned, and the boundary is admitted rather than
 * excluded by a comparison that happens to be strict. ***
 */
export function schemeOmega(kx, ky, s = 2) {
    const q = Math.sqrt(s / 4) * Math.sqrt(Math.sin(kx / 2) ** 2 + Math.sin(ky / 2) ** 2);
    if (q > 1 + 1e-12) return null;               // genuinely outside: the mode grows exponentially
    return { omega: 2 * Math.asin(Math.min(q, 1)), q, marginal: Math.abs(q - 1) <= 1e-12 };
}

/** The checkerboard mode's q for a given stiffness -- the number the 2D stability limit is a statement about. */
export const schemeMargin = (s = 2) => Math.sqrt(s / 4) * Math.SQRT2;

/** Phase speed of the scheme, in CELLS PER STEP -- the units are the giveaway that no physics entered. */
export function schemePhaseSpeed(k, s = 2) {
    const w = schemeOmega(k, 0, s);
    return w === null ? null : w.omega / k;
}

/** The long-wave limit: sqrt(s/4) cells/step, exactly. */
export const schemeLongWaveSpeed = (s = 2) => Math.sqrt(s / 4);

/**
 * Drive a single Fourier mode through the waveStep UPDATE RULE on a periodic grid and return the peak
 * amplitude history. `step` is injected so the gate can drive THE SHIPPED FUNCTION rather than this copy --
 * the copy exists only because waveStep clamps at its boundaries and a clean dispersion measurement needs
 * periodic wrap. THE GATE PROVES THE TWO AGREE IN THE INTERIOR before trusting this one for anything.
 */
export function runMode({ kx = Math.PI, ky = Math.PI, s = 2, damping = 1, steps = 500, N = 32 } = {}) {
    let h = new Float64Array(N * N), v = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = Math.cos(kx * x + ky * y);
    const w = (i) => ((i % N) + N) % N;
    const peaks = [], probe = [];
    for (let t = 0; t < steps; t++) {
        const nh = new Float64Array(h), nv = new Float64Array(v);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const i = y * N + x;
            const avg = (h[y * N + w(x - 1)] + h[y * N + w(x + 1)] + h[w(y - 1) * N + x] + h[w(y + 1) * N + x]) * 0.25;
            const vel = (v[i] + (avg - h[i]) * s) * damping;
            nv[i] = vel; nh[i] = h[i] + vel;
        }
        h = nh; v = nv;
        let m = 0; for (let i = 0; i < h.length; i++) { const a = Math.abs(h[i]); if (a > m) m = a; }
        peaks.push(m); probe.push(h[0]);
    }
    return { peaks, probe, final: h };
}

/** Measure a mode's angular frequency from the probe series by counting sign changes -- no fitting. */
export function measuredOmega(probe) {
    let z = 0;
    for (let i = 1; i < probe.length; i++) if ((probe[i - 1] > 0) !== (probe[i] > 0)) z++;
    return Math.PI * z / probe.length;
}
