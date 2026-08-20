// WebGLEngine/physics/langevin/langevin.js — v3282
// ---------------------------------------------------------------------------------------------------------------
// Stochastic thermodynamics: a Brownian particle in a trap, and the JARZYNSKI EQUALITY as the answer key.
//
// The deepest key in this device is an identity over NONEQUILIBRIUM trajectories: drive the system arbitrarily
// fast — slam the trap stiff, waste work, never let it relax — and still, EXACTLY,
//     < exp(-W/kT) >  =  exp(-dF/kT)
// over repeated trajectories, where dF is the EQUILIBRIUM free-energy difference. For a harmonic trap stiffened
// k0 -> k1 that reference is closed form: dF = (kT/2) ln(k1/k0). The second law falls out as the average:
// <W> >= dF always, approaching equality only when driven slowly. An exact equality that holds AT ANY SPEED,
// checked against a reference the trajectories never contain — the same shape as the LBM's emergent viscosity.
//
// NO TIMESTEP ERROR TO HIDE IN, by construction: the relax step uses the EXACT Ornstein-Uhlenbeck conditional
//     x' = a x + sqrt((kT/k)(1 - a^2)) xi,   a = exp(-k dt / gamma)
// (closed form for a harmonic trap), and work is accumulated the discrete-protocol way — change k with x held
// fixed (that is work), then relax at the new k (that is heat). With both pieces exact, Jarzynski must hold to
// SAMPLING error only, so a deviation is a bug and never "the integrator".
//
// The other two keys are classics: EQUIPARTITION (<x^2> = kT/k in a static trap — the stationary OU variance)
// and the EINSTEIN RELATION (free-particle MSD = 2 D t with D = kT/gamma).
//
// THE TRAP THIS DEVICE EXISTS TO DEMONSTRATE: workWRONG drops the 1/2 in the work increment. Every TRAJECTORY it
// produces is statistically PERFECT — equipartition passes, the paths are indistinguishable — and the free
// energy it reports is wrong. Trajectory-level checks cannot see it; only the Jarzynski key can. Its mirror,
// noiseWRONG (variance halved), is caught by equipartition immediately. Both EXPORTED FOR MEASUREMENT.
// Deterministic seeded RNG throughout.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

function makeRng(seed = 1) {
    let s = seed >>> 0, spare = null;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    const gauss = () => {
        if (spare != null) { const g = spare; spare = null; return g; }
        const a = Math.sqrt(-2 * Math.log(u())), b = 2 * Math.PI * u();
        spare = a * Math.sin(b); return a * Math.cos(b);
    };
    return { u, gauss };
}

// exact OU relax step in a harmonic trap U = k x^2 / 2 (overdamped, friction gamma): samples the true conditional.
function ouStep(x, k, dt, kT, gamma, rng) {
    const a = Math.exp(-k * dt / gamma);
    return a * x + Math.sqrt((kT / k) * (1 - a * a)) * rng.gauss();
}
// NAMED-WRONG: stationary variance halved (the sqrt(D)-for-sqrt(2D) class of error). DO NOT SIMULATE WITH THIS.
function ouStepNoiseWRONG(x, k, dt, kT, gamma, rng) {
    const a = Math.exp(-k * dt / gamma);
    return a * x + Math.sqrt(0.5 * (kT / k) * (1 - a * a)) * rng.gauss();
}

// equipartition: long OU run in a static trap; <x^2> must equal kT/k exactly (stationary variance).
function equipartitionRun({ k = 2, kT = 1, gamma = 1, dt = 0.05, n = 200000, seed = 11, step = ouStep } = {}) {
    const rng = makeRng(seed);
    let x = Math.sqrt(kT / k) * rng.gauss();   // start in equilibrium
    let sx2 = 0;
    for (let i = 0; i < n; i++) { x = step(x, k, dt, kT, gamma, rng); sx2 += x * x; }
    return { x2: sx2 / n, exact: kT / k };
}

// Einstein relation: free diffusion (no trap), MSD(t) = 2 D t with D = kT/gamma. Euler-Maruyama is EXACT for
// free diffusion (the increment is exactly Gaussian), so this too has no timestep error to hide in.
function msdRun({ kT = 1, gamma = 1, dt = 0.05, steps = 400, nTraj = 4000, seed = 13 } = {}) {
    const rng = makeRng(seed), D = kT / gamma, sig = Math.sqrt(2 * D * dt);
    let sumSq = 0;
    for (let t = 0; t < nTraj; t++) { let x = 0; for (let i = 0; i < steps; i++) x += sig * rng.gauss(); sumSq += x * x; }
    return { msd: sumSq / nTraj, exact: 2 * D * dt * steps, D };
}

// work increment for the discrete protocol: change k -> k2 with x FIXED. This IS the work, exactly.
const workIncrement = (x, k1, k2) => 0.5 * (k2 - k1) * x * x;
// NAMED-WRONG: the missing 1/2. Trajectories identical; free energy wrong. DO NOT REPORT WORK WITH THIS.
const workIncrementWRONG = (x, k1, k2) => (k2 - k1) * x * x;

// Jarzynski run: equilibrate at k0 (exact draw), stiffen to k1 over `steps` protocol jumps with an OU relax of
// dtRelax after each, accumulate W per trajectory, and estimate dF two ways: the exact closed form and
// -kT ln <exp(-W/kT)>. Returns both plus <W> so the second law is visible.
function jarzynskiRun({ k0 = 1, k1 = 4, steps = 4, nTraj = 30000, kT = 1, gamma = 1, dtRelax = 0.08, seed = 17,
                        step = ouStep, workInc = workIncrement } = {}) {
    const rng = makeRng(seed);
    const ks = [];
    for (let i = 0; i <= steps; i++) ks.push(k0 * Math.pow(k1 / k0, i / steps));   // geometric schedule
    let sumExp = 0, sumW = 0;
    for (let t = 0; t < nTraj; t++) {
        let x = Math.sqrt(kT / k0) * rng.gauss();   // exact equilibrium draw at k0
        let W = 0;
        for (let i = 1; i < ks.length; i++) {
            W += workInc(x, ks[i - 1], ks[i]);       // switch the trap with x held fixed: work
            x = step(x, ks[i], dtRelax, kT, gamma, rng);   // relax at the new stiffness: heat
        }
        sumExp += Math.exp(-W / kT); sumW += W;
    }
    const dFexact = 0.5 * kT * Math.log(k1 / k0);
    const dFjarzynski = -kT * Math.log(sumExp / nTraj);
    return { dFexact, dFjarzynski, meanW: sumW / nTraj, nTraj, steps };
}

export { makeRng, ouStep, ouStepNoiseWRONG, equipartitionRun, msdRun, workIncrement, workIncrementWRONG, jarzynskiRun };

// v3283 -- CROOKS: the theorem Jarzynski is the average of. Run the protocol BACKWARD too — equilibrate at k1,
// relax the trap k1 -> k0 down the same geometric schedule — and the fluctuation theorem says the two work
// distributions are locked together POINTWISE:
//     P_F(W) / P_R(-W) = exp((W - dF) / kT)
// Two consequences, both exact and both gates: the histograms of forward work and NEGATED reverse work CROSS AT
// dF exactly, and the log of their ratio is a straight line in W with slope 1/kT. Jarzynski gave one number per
// ensemble; Crooks grades the WHOLE DISTRIBUTION, so a work-ledger bug now fails two independent identities.
export function crooksRun({ k0 = 1, k1 = 4, steps = 8, nTraj = 40000, kT = 1, gamma = 1, dtRelax = 0.08, seed = 23,
                            step = ouStep, workInc = workIncrement } = {}) {
    const dFexact = 0.5 * kT * Math.log(k1 / k0);
    const runDir = (kA, kB, seedD) => {
        const rng = makeRng(seedD);
        const ks = [];
        for (let i = 0; i <= steps; i++) ks.push(kA * Math.pow(kB / kA, i / steps));
        const Ws = new Float64Array(nTraj);
        for (let t = 0; t < nTraj; t++) {
            let x = Math.sqrt(kT / kA) * rng.gauss(), W = 0;
            for (let i = 1; i < ks.length; i++) { W += workInc(x, ks[i - 1], ks[i]); x = step(x, ks[i], dtRelax, kT, gamma, rng); }
            Ws[t] = W;
        }
        return Ws;
    };
    const Wf = runDir(k0, k1, seed);          // forward: stiffen
    const Wr = runDir(k1, k0, seed + 1);      // reverse: relax
    return { Wf, Wr, dFexact, kT };
}

// histogram both distributions on a shared grid (reverse negated), find where they cross, and fit the log-ratio
// slope over the bins where both have support. Returns the two measured Crooks observables.
export function crooksAnalyze(Wf, WrNegSource, kT, { lo = -1.5, hi = 3.0, bins = 60 } = {}) {
    const hF = new Float64Array(bins), hR = new Float64Array(bins);
    const at = (w) => Math.floor((w - lo) / (hi - lo) * bins);
    for (const w of Wf) { const b = at(w); if (b >= 0 && b < bins) hF[b]++; }
    for (const w of WrNegSource) { const b = at(-w); if (b >= 0 && b < bins) hR[b]++; }
    // crossing: where hF - hR changes sign with both populated
    let crossing = null;
    for (let b = 1; b < bins; b++) {
        if (hF[b - 1] > 0 && hR[b - 1] > 0 && hF[b] > 0 && hR[b] > 0) {
            const d0 = hF[b - 1] - hR[b - 1], d1 = hF[b] - hR[b];
            if (d0 < 0 && d1 >= 0) { const t = -d0 / (d1 - d0);
                crossing = lo + ((b - 1) + 0.5 + t) * (hi - lo) / bins; }
        }
    }
    // log-ratio slope via least squares over well-populated bins
    const xs = [], ys = [];
    for (let b = 0; b < bins; b++) if (hF[b] >= 25 && hR[b] >= 25) {
        xs.push(lo + (b + 0.5) * (hi - lo) / bins);
        ys.push(Math.log(hF[b] / hR[b]));
    }
    let slope = null, intercept = null;
    if (xs.length >= 4) {
        const n = xs.length;
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
        slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        intercept = (sy - slope * sx) / n;
    }
    // per Crooks, ln ratio = (W - dF)/kT: slope 1/kT, and the ratio hits 1 at W = dF = -intercept/slope
    return { crossing, slope, dFfromFit: slope ? -intercept / slope : null, binsUsed: xs.length };
}

if (typeof module !== "undefined" && module.exports) module.exports = { makeRng, ouStep, ouStepNoiseWRONG, equipartitionRun, msdRun, workIncrement, workIncrementWRONG, jarzynskiRun, crooksRun, crooksAnalyze };
