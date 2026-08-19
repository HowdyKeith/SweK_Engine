// physics/em/skinDepth.mjs
//
// HOW FAR A WAVE GETS INTO A CONDUCTOR, AND THE TWO FORMULAS THAT ANSWER IT -- one exact, one a limit that is
// quoted so often it is usually mistaken for the definition.
//
// In a medium with permittivity eps, permeability mu and conductivity sigma, driven at angular frequency omega,
// the LOSS TANGENT p = sigma / (omega eps) decides everything:
//
//     alpha = omega sqrt( (mu eps / 2) ( sqrt(1 + p^2) - 1 ) )        attenuation, nepers per metre
//     beta  = omega sqrt( (mu eps / 2) ( sqrt(1 + p^2) + 1 ) )        phase constant
//     delta = 1 / alpha                                               THE SKIN DEPTH, exactly
//
// and in the good-conductor limit p -> infinity that collapses to the form everybody knows:
//
//     delta -> sqrt( 2 / (omega mu sigma) )
//
// *** THE TWO ARE NOT THE SAME NUMBER AND THE DIFFERENCE IS A FUNCTION OF p ALONE -- not of the material, not
// of the frequency, not of anything else that appears in either formula. delta_good / delta_exact =
// sqrt( (sqrt(1+p^2) - 1) / p ), which approaches 1 as 1/p (FIRST ORDER, derivable) and is 55.6% WRONG at
// p = 1. Copper at any sane frequency has p ~ 10^18 and the limit is exact to eighteen digits; seawater at
// 1 GHz has p ~ 1 and the limit is wrong by more than half. THE SAME SENTENCE -- "the skin depth is
// sqrt(2/(omega mu sigma))" -- IS EITHER EXACT OR USELESS DEPENDING ON A NUMBER THAT IS NOT IN IT. ***
//
// THE ANSWER KEY IS EXTERNAL AND IT IS THE POINT. alpha above comes from Maxwell's equations, not from a grid.
// So a lossy FDTD run can be GRADED by it: launch a wave into a conducting half-space, measure the envelope, and
// the decay constant is predicted before the simulation runs. That is the erf / Stefan / pendulum / current-loop
// shape once more, and it is what makes this the fixture physics/stabilityMeter.mjs has never had -- a system
// whose correct energy loss is a NUMBER rather than a shrug.
//
// WHAT IT REFUSES, BY NAME: a non-positive omega, eps, mu or a negative sigma. sigma = 0 IS ALLOWED and returns
// an INFINITE skin depth with alpha = 0 -- a lossless medium does not attenuate, and returning a huge finite
// number there would be decoration.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

export const EPS0 = 8.8541878128e-12;
export const MU0 = 1.25663706212e-6;

/** The loss tangent. Everything about the regime is this one dimensionless number. */
export const lossTangent = (omega, eps, sigma) => (omega > 0 && eps > 0 ? sigma / (omega * eps) : null);

/** The exact propagation constants of a plane wave in a lossy medium. */
export function propagation({ omega, eps = EPS0, mu = MU0, sigma = 0 } = {}) {
    if (!(omega > 0) || !(eps > 0) || !(mu > 0) || !(sigma >= 0)) return null;
    const p = sigma / (omega * eps), root = Math.sqrt(1 + p * p);
    const alpha = omega * Math.sqrt(mu * eps / 2 * (root - 1));
    const beta = omega * Math.sqrt(mu * eps / 2 * (root + 1));
    return { alpha, beta, p, delta: alpha > 0 ? 1 / alpha : Infinity, phaseSpeed: omega / beta };
}

/** delta = 1/alpha, exactly. Infinite when sigma = 0, which is the honest answer and not a large number. */
export function skinDepthExact(args) { const r = propagation(args); return r ? r.delta : null; }

/** The good-conductor limit. The formula everybody quotes -- correct only where p is large, and it never says so. */
export function skinDepthGood({ omega, mu = MU0, sigma = 0 } = {}) {
    if (!(omega > 0) || !(mu > 0) || !(sigma > 0)) return null;
    return Math.sqrt(2 / (omega * mu * sigma));
}

/** How wrong the limit is, as a pure function of the loss tangent and of nothing else. */
export const goodConductorRatio = (p) => (p > 0 ? Math.sqrt((Math.sqrt(1 + p * p) - 1) / p) : null);

// ------------------------------------------------------------------------------------------------------------
// A LOSSY 1D FDTD, so the closed form has something to grade.
//
// Yee in one dimension with an electric conductivity in the right-hand half of the domain. The E update carries
// the loss exactly as the semi-implicit (Crank-Nicolson-in-sigma) form, which is what keeps the scheme stable
// for any sigma rather than only for small ones:
//
//     E <- ca E - cb (H[i] - H[i-1]),   ca = (1 - s)/(1 + s),  cb = (dt/(eps dx))/(1 + s),  s = sigma dt/(2 eps)
//     H <- H - (dt/(mu dx)) (E[i+1] - E[i])
//
// Units are the caller's. The gate drives it in SI and in normalised units and gets the same dimensionless
// answers, which is the check that no unit was smuggled in.
// ------------------------------------------------------------------------------------------------------------
export function lossyFdtd1d({
    N = 800, dx = 1e-3, S = 0.99, eps = EPS0, mu = MU0, sigma = 0,
    slabStart = 0.4, freqCells = 20, steps = 4000, source = "sine", driveSteps = Infinity,
    sourceMode = "hard", sourceCell = 0,
} = {}) {
    const c = 1 / Math.sqrt(mu * eps), dt = S * dx / c;
    const i0 = Math.floor(N * slabStart);
    const omega = 2 * Math.PI * c / (freqCells * dx);              // freqCells cells per wavelength in the lossless half
    const E = new Float64Array(N), H = new Float64Array(N);
    const sig = new Float64Array(N);
    for (let i = i0; i < N; i++) sig[i] = sigma;
    const ca = new Float64Array(N), cb = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const s = sig[i] * dt / (2 * eps);
        ca[i] = (1 - s) / (1 + s);
        cb[i] = (dt / (eps * dx)) / (1 + s);
    }
    const chy = dt / (mu * dx);
    const envelope = new Float64Array(N);
    const settle = Math.floor(steps * 0.6);                        // let the standing pattern settle before recording
    let blewUp = false, energy0 = 0, energyN = 0;
    for (let n = 0; n < steps; n++) {
        for (let i = 0; i < N - 1; i++) H[i] -= chy * (E[i + 1] - E[i]);
        for (let i = 1; i < N; i++) E[i] = ca[i] * E[i] - cb[i] * (H[i] - H[i - 1]);
        // RINGDOWN: after driveSteps the source is switched off and the domain is left to itself. That is the
        // only regime in which an ENERGY RATIO means anything -- while a source is running, the ratio measures
        // the source, not the medium, and reads ~1 whatever sigma is.
        //
        // *** v3631: sourceMode. The DEFAULT IS STILL "hard", so every number v3628 reported is reproduced
        // unchanged -- a fixture that quietly changed under its own findings would make them unreadable. What is
        // new is that "soft" exists, because v3628's unexplained floor had an obvious suspect: an ASSIGNMENT
        // overwrites the driven cell every step, so its reflection coefficient is exactly 1 (measured in
        // physics/em/absorbing.mjs), and everything that comes back is bounced rather than absorbed. ***
        const drive = n >= driveSteps ? 0
            : source === "sine" ? Math.sin(omega * n * dt)
                : Math.exp(-Math.pow((n - 60) / 20, 2));           // a pulse, for the stability probe
        if (sourceMode === "soft") { E[sourceCell] += drive; E[0] = 0; }   // PEC wall at 0, transparent drive inside
        else E[sourceCell] = drive;                                        // v3628 behaviour, bit for bit
        if (n === (Number.isFinite(driveSteps) ? driveSteps : settle)) energy0 = fieldEnergy(E, H, eps, mu);
        if (n >= settle) for (let i = 0; i < N; i++) { const a = Math.abs(E[i]); if (a > envelope[i]) envelope[i] = a; }
        if (!Number.isFinite(E[N >> 1])) { blewUp = true; break; }
    }
    if (!blewUp) energyN = fieldEnergy(E, H, eps, mu);
    return { E, H, envelope, i0, dx, dt, omega, c, N, blewUp, energy0, energyN,
             energyRatio: blewUp ? Infinity : energyN / Math.max(energy0, 1e-300) };
}

function fieldEnergy(E, H, eps, mu) {
    let s = 0;
    for (let i = 0; i < E.length; i++) s += 0.5 * eps * E[i] * E[i] + 0.5 * mu * H[i] * H[i];
    return s;
}

/**
 * Read the attenuation constant out of a run's envelope by a least-squares fit of log|E| against depth, over a
 * window that starts a little inside the slab (so the interface transient is excluded) and stops before the
 * envelope reaches the floor. THE WINDOW IS DERIVED FROM THE PREDICTED delta, NOT CHOSEN BY EYE -- one delta in
 * from the face, and out to wherever the signal has fallen by a stated factor or the grid ends.
 */
export function measuredAlpha(run, predictedDelta, { skipDeltas = 1, decades = 1.5 } = {}) {
    const { envelope, i0, dx, N } = run;
    const start = i0 + Math.ceil(skipDeltas * predictedDelta / dx);
    const span = Math.ceil(decades * Math.LN10 * predictedDelta / dx);
    const end = Math.min(N - 2, start + span);
    if (!(end > start + 4)) return null;
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = start; i <= end; i++) {
        const y = envelope[i];
        if (!(y > 0)) continue;
        const x = (i - start) * dx, ly = Math.log(y);
        n++; sx += x; sy += ly; sxx += x * x; sxy += x * ly;
    }
    if (n < 5) return null;
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { alpha: -slope, samples: n, startCell: start, endCell: end };
}
