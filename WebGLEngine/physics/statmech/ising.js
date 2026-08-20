// physics/statmech/ising.js
//
// THE 2D ISING MODEL -- v2819. A new branch for the lab: statistical mechanics and critical phenomena. Spins on
// a square lattice, each +1 or -1, each preferring to agree with its four neighbours. Heat it and the agreement
// breaks down -- but not gradually. It collapses at one temperature, and Onsager solved that temperature
// EXACTLY in 1944:
//
//     T_c = 2 / ln(1 + sqrt(2))  =  2.269185314213022...   (units of J/k_B)
//
// THE ANSWER KEYS, all exact and none of them fed to the simulation:
//
//   T_c            Onsager's critical temperature, above. The lattice is never told it.
//   M(T)           Yang's 1952 spontaneous magnetisation below T_c:
//                      M = [1 - sinh^-4(2/T)]^(1/8)
//                  -- an exact curve, not a limit, so it can be checked at several temperatures.
//   E/N -> -2      at T -> 0 every bond is satisfied; with 4 neighbours and each bond counted once, that is
//                  exactly -2J per spin.
//   E/N -> 0       at T -> infinity spins are uncorrelated and the average bond energy vanishes.
//
// WHY THIS IS WORTH HAVING: nothing else in the lab exhibits a PHASE TRANSITION. An instrument that can find a
// critical point is a different capability from one that measures a coefficient -- and the transition is
// emergent, arising from nothing but the local rule and the temperature.
//
// HONEST ABOUT FINITE SIZE: a real transition is sharp only on an infinite lattice. On an L x L grid the
// susceptibility peak sits ABOVE T_c and sharpens as L grows. So the instrument reports the measured peak AND
// Onsager's value, and any claim about them agreeing is the caller's to make with a finite-size allowance. That
// drift is itself checkable -- it must SHRINK with L -- which is a stronger statement than hitting a number once.
//
// Deterministic: the RNG is seeded, so the same inputs give the same measurement every time.
// Pure, no imports, browser-safe.

export const ONSAGER_TC = 2 / Math.log(1 + Math.SQRT2);   // 2.269185314213022

// Yang's exact spontaneous magnetisation. Zero at and above T_c -- the order parameter simply stops existing.
export function yangMagnetisation(T) {
    if (T <= 0) return 1;
    if (T >= ONSAGER_TC) return 0;
    const s = Math.sinh(2 / T);
    const x = 1 - 1 / (s * s * s * s);
    return x <= 0 ? 0 : Math.pow(x, 1 / 8);
}

// Small deterministic PRNG (mulberry32) so a measurement is reproducible.
function rng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * *** v3764 -- `bondFactor` EXISTS SO A PLANT CAN SIT ON THE UPDATE RULE, AND IT DEFAULTS TO CORRECT (2).
 * Flipping spin s changes the energy by dE = 2*J*s*(sum of its neighbours) -- THE 2 IS BECAUSE EACH BOND IS
 * COUNTED ONCE FROM EACH END AND THE FLIP CHANGES BOTH SIGNS. DROPPING IT IS THE CLASSIC METROPOLIS ISING BUG,
 * common enough to be a teaching example, and it is invisible to inspection: exp(-dE/T) still looks like a
 * Boltzmann factor, the simulation still equilibrates, and the lattice still orders. IT SIMPLY ORDERS AT THE
 * WRONG TEMPERATURE, because halving every energy is exactly doubling T. ***
 */
export function makeIsing({ L = 32, T = 2.0, seed = 12345, cold = false, bondFactor = 2 } = {}) {
    const N = L * L;
    const s = new Int8Array(N);
    const rand = rng(seed);
    for (let i = 0; i < N; i++) s[i] = cold ? 1 : (rand() < 0.5 ? -1 : 1);
    const idx = (x, y) => ((y + L) % L) * L + ((x + L) % L);

    // Sum of the four neighbours of site i.
    function neighbourSum(x, y) {
        return s[idx(x + 1, y)] + s[idx(x - 1, y)] + s[idx(x, y + 1)] + s[idx(x, y - 1)];
    }

    // One sweep = N attempted single-spin flips. Metropolis: flip if it lowers the energy, else flip with
    // probability exp(-dE/T). That rule is the whole physics -- the transition is not written anywhere.
    function sweep() {
        for (let n = 0; n < N; n++) {
            const x = (rand() * L) | 0, y = (rand() * L) | 0;
            const i = idx(x, y);
            const dE = bondFactor * s[i] * neighbourSum(x, y);
            if (dE <= 0 || rand() < Math.exp(-dE / T)) s[i] = -s[i];
        }
    }

    function magnetisation() { let m = 0; for (let i = 0; i < N; i++) m += s[i]; return m / N; }

    // Energy per spin, each bond counted once: sum over right and down neighbours only.
    function energy() {
        let e = 0;
        for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) e -= s[idx(x, y)] * (s[idx(x + 1, y)] + s[idx(x, y + 1)]);
        return e / N;
    }

    return { L, N, T, spins: s, idx, sweep, magnetisation, energy, setT(t) { this.T = t; }, get temperature() { return this.T; } };
}

// Equilibrate, then average |M|, E, and the fluctuation-derived susceptibility and specific heat.
// chi = N (<M^2> - <|M|>^2) / T   and   C = N (<E^2> - <E>^2) / T^2, both per spin.
export function measure({ L = 32, T = 2.0, seed = 12345, warmup = 400, samples = 600, cold = false, bondFactor = 2 } = {}) {
    const sim = makeIsing({ L, T, seed, cold, bondFactor });   // v3764 -- only measure() threads the plant option
    for (let i = 0; i < warmup; i++) sim.sweep();
    let sm = 0, sm2 = 0, se = 0, se2 = 0;
    for (let i = 0; i < samples; i++) {
        sim.sweep();
        const m = Math.abs(sim.magnetisation()), e = sim.energy();
        sm += m; sm2 += m * m; se += e; se2 += e * e;
    }
    const mAvg = sm / samples, m2Avg = sm2 / samples, eAvg = se / samples, e2Avg = se2 / samples;
    return {
        T, L,
        magnetisation: mAvg,
        energy: eAvg,
        susceptibility: (L * L) * (m2Avg - mAvg * mAvg) / T,
        specificHeat: (L * L) * (e2Avg - eAvg * eAvg) / (T * T),
    };
}

// Sweep temperature and return the curve, plus where susceptibility and specific heat peak. On a finite lattice
// those peaks sit ABOVE T_c and approach it as L grows -- so the drift is the honest observable, not a hit.
export function sweepTemperature({ L = 24, from = 1.6, to = 3.2, steps = 17, seed = 12345, warmup = 300, samples = 400 } = {}) {
    const rows = [];
    for (let i = 0; i < steps; i++) {
        const T = from + (to - from) * i / (steps - 1);
        rows.push(measure({ L, T, seed: seed + i, warmup, samples }));
    }
    let chiPeak = rows[0], cPeak = rows[0];
    for (const r of rows) {
        if (r.susceptibility > chiPeak.susceptibility) chiPeak = r;
        if (r.specificHeat > cPeak.specificHeat) cPeak = r;
    }
    return { rows, chiPeakT: chiPeak.T, chiPeak: chiPeak.susceptibility, cPeakT: cPeak.T, cPeak: cPeak.specificHeat, onsager: ONSAGER_TC };
}

// THE SHARPEST FINITE-SIZE CHECK, and a better one than chasing the peak's location. At a critical point the
// susceptibility DIVERGES; on a finite lattice it can only grow with the box, and scaling theory fixes exactly
// how fast:
//
//     chi_max ~ L^(gamma/nu),   with gamma = 7/4 and nu = 1 exactly for the 2D Ising universality class
//
// so the exponent is 1.75. Fitting log(chi_max) against log(L) recovers it from the simulation alone. This is a
// stronger statement than hitting T_c once: a lattice that merely had a bump in the right place would still get
// the exponent wrong, because the exponent is about how criticality SCALES, not where it sits.
export const GAMMA_OVER_NU = 7 / 4;
export const BETA_EXPONENT = 1 / 8;      // Yang's exponent: M ~ (T_c - T)^(1/8)

// v3282 -- THE BINDER CUMULANT, and why the device needed it even with the peak-drift check above. The
// susceptibility peak LOCATES T_c only in the L -> infinity limit; on any finite lattice it sits above and the
// existing honest observable is that the drift SHRINKS. The Binder cumulant U4 = 1 - <m^4>/(3 <m^2>^2) is
// sharper: to leading order its curves for two different lattice sizes CROSS AT T_c itself, turning "the peak is
// somewhere above" into a single number a gate can hold against Onsager's 2.2692 -- which still appears nowhere
// in the sampling. Below T_c the LARGER lattice is more ordered (higher U4); above, less; the swap of sides is
// itself checkable, so a pair of flat curves grazing each other cannot fake a crossing.
export function binderMeasure({ L = 16, T = 2.27, seed = 12345, warmup = 1500, samples = 8000 } = {}) {
    const sim = makeIsing({ L, T, seed });
    for (let i = 0; i < warmup; i++) sim.sweep();
    let m2 = 0, m4 = 0;
    for (let i = 0; i < samples; i++) {
        sim.sweep();
        const m = sim.magnetisation(), q = m * m;
        m2 += q; m4 += q * q;
    }
    m2 /= samples; m4 /= samples;
    return { T, L, U4: 1 - m4 / (3 * m2 * m2), m2, m4 };
}
export function binderCurve({ L = 16, temps = [2.10, 2.16, 2.22, 2.27, 2.33, 2.39, 2.45], seed = 12345, warmup = 1500, samples = 8000 } = {}) {
    return temps.map((T) => binderMeasure({ L, T, seed: seed + L * 1000 + Math.round(T * 100), warmup, samples }));
}
// where two Binder curves cross (linear interpolation on the difference). null when they do not cross in range,
// which a caller must treat as a FAILURE to locate the transition, not as a shrug.
export function binderCrossing(curveA, curveB) {
    for (let i = 1; i < curveA.length; i++) {
        const d0 = curveA[i - 1].U4 - curveB[i - 1].U4, d1 = curveA[i].U4 - curveB[i].U4;
        if (d0 === 0) return curveA[i - 1].T;
        if (d0 * d1 < 0) { const t = d0 / (d0 - d1); return curveA[i - 1].T + t * (curveA[i].T - curveA[i - 1].T); }
    }
    return null;
}

export function criticalExponent({ sizes = [8, 16, 32], from = 2.15, to = 2.65, steps = 21, warmup = 400, samples = 700, seed = 12345 } = {}) {
    const pts = [];
    for (const L of sizes) {
        const s = sweepTemperature({ L, from, to, steps, warmup, samples, seed });
        pts.push({ L, chiMax: s.chiPeak, peakT: s.chiPeakT });
    }
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { const x = Math.log(p.L), y = Math.log(p.chiMax); n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return {
        points: pts,
        exponentMeasured: slope,
        exponentTheory: GAMMA_OVER_NU,
        exponentErrFrac: Math.abs(slope - GAMMA_OVER_NU) / GAMMA_OVER_NU,
        onsager: ONSAGER_TC,
    };
}
