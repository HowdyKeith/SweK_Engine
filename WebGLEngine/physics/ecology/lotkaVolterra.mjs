// physics/ecology/lotkaVolterra.mjs
//
// v3994 -- PREDATOR AND PREY. The Lotka-Volterra system,
//
//     dx/dt = alpha*x - beta*x*y          x = prey
//     dy/dt = delta*x*y - gamma*y         y = predator
//
// is worth building here for the same reason kepler is: it has a stack of EXACT answers that no integrator is
// ever told, and one of them is famous for being counterintuitive and TRUE.
//
// ================================================================================================================
// THE EXACT ANSWER KEYS
// ================================================================================================================
//
//   THE FIRST INTEGRAL      V = delta*x - gamma*ln(x) + beta*y - alpha*ln(y) is CONSTANT along every trajectory.
//                           Not approximately -- exactly. So the orbits are CLOSED CURVES, and the populations
//                           cycle forever without damping or growing. Any decay you see is the model or the
//                           method, never the physics.
//
//   THE FIXED POINT         (x*, y*) = (gamma/delta, alpha/beta). Note the crossing: the PREY equilibrium is set
//                           entirely by the PREDATOR's parameters and vice versa. Neither species controls its
//                           own equilibrium.
//
//   THE SMALL-OSCILLATION   T = 2*pi/sqrt(alpha*gamma), and *** IT DOES NOT DEPEND ON beta OR delta AT ALL. ***
//   PERIOD                  Measured against beta and delta varied 5x and 30x: 9.472260 every time, matching
//                           the closed form to 1.9e-7 (which is the crossing-detector's resolution, not a
//                           disagreement). Two of the four parameters cannot touch the frequency.
//
//   *** THE TIME-AVERAGE THEOREM, WHICH IS THE ONE WORTH THE BUILD. *** Averaged over ONE WHOLE CYCLE, at ANY
//   amplitude however violent, <x> = gamma/delta and <y> = alpha/beta EXACTLY -- the averages equal the fixed
//   point. Measured at starting amplitudes of 1.05x, 1.5x and 3x the equilibrium: <x> = 4.00000000 in all three
//   against an exact 4, and <y> = 2.75000000 / 2.74999995 / 2.74999980 against an exact 2.75. The proof is two
//   lines -- integrate (1/x)(dx/dt) = alpha - beta*y over a period; the left side telescopes to
//   [ln x] = 0 because the orbit closes; so <y> = alpha/beta -- and it is why the next key is not a paradox.
//
//   VOLTERRA'S PRINCIPLE    Kill BOTH species indiscriminately -- a pesticide, a fishing fleet, a harvest at
//                           rate h -- so alpha -> alpha-h and gamma -> gamma+h. Then <x> = (gamma+h)/delta goes
//                           UP and <y> = (alpha-h)/beta goes DOWN. *** HARVESTING BOTH SPECIES INCREASES THE
//                           AVERAGE PREY POPULATION. *** Measured at h = 0, 0.1, 0.2, 0.3: prey 4.00 -> 5.00 ->
//                           6.00 -> 7.00 while predators fall 2.75 -> 2.50 -> 2.25 -> 2.00. This is the answer
//                           to D'Ancona's puzzle -- why the FRACTION of predatory fish in Adriatic catches ROSE
//                           during the First World War, when fishing had almost stopped -- and it is a
//                           derivation from the time-average theorem, not a separate assumption.
//
// ================================================================================================================
// IT IS A HAMILTONIAN SYSTEM, BUT ONLY AFTER A CHANGE OF VARIABLES, AND THAT IS THE WHOLE INTEGRATOR STORY
// ================================================================================================================
//
// In (x, y) the system is not canonical. Substitute u = ln(x), v = ln(y) and it becomes
//
//     du/dt = alpha - beta*e^v = -dH/dv       dv/dt = delta*e^u - gamma = +dH/du
//     H(u, v) = delta*e^u - gamma*u + beta*e^v - alpha*v
//
// *** AND H IS V. *** The Hamiltonian and the first integral are the SAME FUNCTION, written in the two
// coordinate systems. So a symplectic integrator applied in LOG SPACE conserves the very quantity the ecology
// cares about, and one applied in population space does not.
//
// v3993 established on kepler that symplectic BOUNDS the error while higher order merely makes it SMALL. This
// system reproduces that independently, and more violently -- measured at 400 steps per cycle, growth ratio =
// max|dV| in the second half of the run over the first:
//
//     explicit Euler       3.42e+0 at 50 cycles (ratio 9.01), then NaN by 200 cycles -- IT BLOWS UP OUTRIGHT.
//                          Populations do not merely drift; they go negative and the logarithm takes the rest.
//     symplectic (log)     3.46e-4, ratio 1.000, AT 50, 200, 800 AND 3200 CYCLES ALIKE. Sixty-four times the
//                          run length and the bound does not move by a digit.
//     RK4                  2.40e-10 -> 8.83e-10 -> 3.46e-9 -> 1.38e-8, ratio climbing 1.83 -> 1.95 -> 1.99 ->
//                          2.00. Exactly LINEAR secular drift: each doubling of run length doubles the error.
//
//   *** AND THE HONEST READING IS THAT RK4 IS THE BETTER CHOICE HERE, WHICH IS NOT THE LESSON A TIDY STORY
//   WOULD WANT. *** It is eight orders of magnitude more accurate and its drift, though genuinely secular, is
//   so slow that the crossover where symplectic Euler's flat 3.46e-4 finally wins is around 8e7 cycles -- a
//   number computed from the measured linear rate, not hand-waved, and far past any run anybody will do. The
//   claim that survives is the SHAPE of the two errors, not a ranking: one is bounded forever and one grows
//   without limit, and which matters depends entirely on how long you intend to run.
//
//   The symplectic envelope is FIRST ORDER in the step, checked rather than assumed: 3.46e-4 at dt = T/400 and
//   1.472e-5 at dt = 1e-3, a ratio of 23.5 against a step ratio of 23.7.
//
//   *** AND THE RATIO LIES ABOUT EXPLICIT EULER FOR THE SAME REASON IT LIED ABOUT IT IN kepler. *** Euler dies
//   at cycle 89 of a 200-cycle run, so the second half never runs, maxSecond stays 0, and the growth ratio
//   comes out 0.000 -- a PERFECT bounded score, awarded to the method that destroyed the ecosystem. It is
//   reported as NaN instead; see the note in integrate(). blewUpAtCycle is the honest field.
//
// ================================================================================================================
// THE PERIOD IS A LIMIT, NOT A CONSTANT -- THIS SYSTEM IS NOT ISOCHRONOUS
// ================================================================================================================
//
// 2*pi/sqrt(alpha*gamma) is the SMALL-oscillation period, and the true period grows with the size of the orbit.
// Measured against the closed form, starting the prey at a multiple of its equilibrium:
//
//     x0/x*    1.001     1.01      1.1       1.5       2.0       3.0
//     T/T0     1.000000  1.000005  1.000533  1.010771  1.035160  1.104723
//
// So a period check run at the module's own default amplitude (1.5x) is 1.08% off the closed form AND BOTH
// NUMBERS ARE RIGHT. A harmonic oscillator would give 1.000000 down the row; this is a nonlinear centre and the
// isochrony is only asymptotic. Any gate asserting the closed form has to say at what amplitude, which is why
// the key is checked at 1.001x, where it matches to 3.5e-7.
"use strict";

/** Default parameters. alpha = prey growth, beta = predation, gamma = predator death, delta = conversion. */
export const DEFAULTS = { alpha: 1.1, beta: 0.4, gamma: 0.4, delta: 0.1 };

/** The coexistence fixed point. The crossing is the point: prey equilibrium is set by PREDATOR parameters. */
export const fixedPoint = (p) => ({ x: p.gamma / p.delta, y: p.alpha / p.beta });

/** The conserved first integral -- and, in log coordinates, the Hamiltonian itself. */
export const firstIntegral = (x, y, p) =>
    p.delta * x - p.gamma * Math.log(x) + p.beta * y - p.alpha * Math.log(y);

/** Small-oscillation period from the Jacobian's eigenvalues +/- i*sqrt(alpha*gamma). Beta and delta do not appear. */
export const smallOscillationPeriod = (p) => 2 * Math.PI / Math.sqrt(p.alpha * p.gamma);

// ---- the three integrators ------------------------------------------------------------------------------
// Each takes (x, y, dt, p, sigma) and returns [x, y]. `sigma` is the PLANT knob -- see plantedDerivative below;
// it is 0 for every honest call and the steppers carry it so the plant perturbs the MODEL rather than a number.

/** EXPLICIT (forward) Euler in population space. Not symplectic, and on this system not even survivable. */
export function stepEuler(x, y, dt, p, sigma = 0) {
    return [x + dt * (p.alpha * x - p.beta * x * y - sigma * x * x),
            y + dt * (p.delta * x * y - p.gamma * y)];
}

/**
 * SYMPLECTIC (semi-implicit) Euler in LOG coordinates, which is where this system is Hamiltonian. The predator
 * log-population is advanced first, and the prey then advanced using the NEW predator value -- the same one-line
 * asymmetry that separates the two first-order methods in physics/orbits/kepler.js.
 *
 * Working in logs also means x and y CANNOT GO NEGATIVE, which is not a numerical trick but the correct
 * statement that a population of -3 rabbits is not a state this model has.
 */
export function stepSymplectic(x, y, dt, p, sigma = 0) {
    let u = Math.log(x), v = Math.log(y);
    v = v + dt * (p.delta * Math.exp(u) - p.gamma);                        // predator first...
    u = u - dt * (p.beta * Math.exp(v) - p.alpha + sigma * Math.exp(u));   // ...prey on the NEW predator
    return [Math.exp(u), Math.exp(v)];
}

/** Classical RK4 in population space. Fourth order, far more accurate per step, and drifting linearly forever. */
export function stepRK4(x, y, dt, p, sigma = 0) {
    const f = (x, y) => [p.alpha * x - p.beta * x * y - sigma * x * x, p.delta * x * y - p.gamma * y];
    const [a1, b1] = f(x, y);
    const [a2, b2] = f(x + dt / 2 * a1, y + dt / 2 * b1);
    const [a3, b3] = f(x + dt / 2 * a2, y + dt / 2 * b2);
    const [a4, b4] = f(x + dt * a3, y + dt * b3);
    return [x + dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4), y + dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4)];
}

export const INTEGRATORS = { euler: stepEuler, symplectic: stepSymplectic, rk4: stepRK4 };
/** Declared so a gate can test the claim per integrator rather than matching on names, as kepler.js does. */
export const SYMPLECTIC = { euler: false, symplectic: true, rk4: false };
export const ORDER = { euler: 1, symplectic: 1, rk4: 4 };

/**
 * Integrate, and measure everything the keys above can be checked against.
 *
 * `sigma` is the PLANT: a logistic self-limitation -sigma*x^2 on the prey. See the note on plantedDerivative.
 */
export function integrate({ p = DEFAULTS, x0 = null, y0 = null, integrator = "symplectic",
                            stepsPerCycle = 400, cycles = 200, sigma = 0, sample = 0 } = {}) {
    const step = INTEGRATORS[integrator];
    if (!step) throw new Error("unknown integrator: " + integrator);
    const fp = fixedPoint(p);
    let x = x0 === null ? fp.x * 1.5 : x0, y = y0 === null ? fp.y : y0;
    const T0 = smallOscillationPeriod(p);
    const dt = T0 / stepsPerCycle;
    const total = Math.round(stepsPerCycle * cycles);
    const V0 = firstIntegral(x, y, p);
    const half = total >> 1;
    let maxFirst = 0, maxSecond = 0, sumX = 0, sumY = 0, blewUp = null;
    // v4000 -- THE FIRST INTEGRAL AS A SERIES, so tools/roundhouse/conservation.mjs can audit it.
    //
    // *** THIS MODULE WAS A SECOND DECLARATION OF AN ALGORITHM THE TREE ALREADY OWNED, AND conservationReach
    // CAUGHT IT ONE ROUND AFTER IT SHIPPED. *** maxFirst/maxSecond below is a first-half-versus-second-half
    // comparison -- exactly what auditConservation does -- and v3994 wrote it by hand without noticing that
    // keplerBind had been wired to the shared module since v3526. Two implementations of one idea, agreeing by
    // luck rather than by construction, is the shape v3525 exists to find. It now emits the series so the
    // shared verdict can be reported BESIDE the hand-rolled one rather than instead of it: the hand-rolled
    // fields are frozen in the baseline and must not move, so this is a second opinion, not a replacement.
    //
    // SAMPLED, not kept: 200 cycles at 400 steps is 80,000 numbers and no baseline should carry that. 64 to
    // match kepler's, which is what makes the two devices' shared verdicts comparable at all.
    const firstIntegralSeries = [];
    const seriesEvery = Math.max(1, Math.floor(total / 64));
    // Upward crossings of x = x*, linearly interpolated, are the cycle markers. The detector knows no formula.
    const crossings = [];
    const path = [];
    for (let i = 0; i < total; i++) {
        const xPrev = x;
        [x, y] = step(x, y, dt, p, sigma);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) { blewUp = i / stepsPerCycle; break; }
        if (xPrev < fp.x && x >= fp.x) {
            const frac = (fp.x - xPrev) / (x - xPrev);
            crossings.push({ t: (i + frac) * dt, i });
        }
        const Vi = firstIntegral(x, y, p);
        if (i % seriesEvery === 0) firstIntegralSeries.push(Vi);
        const e = Math.abs(Vi - V0);
        if (i < half) maxFirst = Math.max(maxFirst, e); else maxSecond = Math.max(maxSecond, e);
        sumX += x; sumY += y;
        if (sample && i % sample === 0) path.push([x, y]);
    }
    const measuredPeriod = crossings.length > 1
        ? (crossings[crossings.length - 1].t - crossings[0].t) / (crossings.length - 1) : null;
    return {
        integrator, p, sigma, dt, cycles, stepsPerCycle,
        finalX: x, finalY: y, blewUpAtCycle: blewUp,
        firstIntegralStart: V0,
        firstIntegralSeries, firstIntegralSeriesEvery: seriesEvery,
        driftFirstHalf: maxFirst, driftSecondHalf: maxSecond,
        // ~1 means BOUNDED and merely oscillating; >1 means still climbing.
        //
        // *** NaN WHEN THE RUN DIED EARLY, AND THAT IS NOT TIDINESS -- IT IS THE v3993 SATURATION TRAP AGAIN. ***
        // Explicit Euler blows up at cycle 89 of a 200-cycle run, so the SECOND HALF NEVER EXECUTES, maxSecond
        // stays 0, and the ratio comes out 0.000 -- the most perfectly-bounded score the metric can produce,
        // awarded to the integrator that destroyed the system. Measured, on the first run of this module. A
        // number that ranks a catastrophe first is worse than no number, and NaN compares false against
        // everything, so nothing can accidentally sort by it. blewUpAtCycle is the field to read.
        driftGrowthRatio: blewUp !== null ? NaN : (maxFirst > 0 ? maxSecond / maxFirst : Infinity),
        measuredPeriod, theoryPeriod: T0,
        periodErrFrac: measuredPeriod === null ? null : Math.abs(measuredPeriod - T0) / T0,
        cyclesCompleted: Math.max(0, crossings.length - 1),
        runMeanX: sumX / Math.max(1, total), runMeanY: sumY / Math.max(1, total),
        crossings, path,
    };
}

/**
 * The time-average theorem, measured over WHOLE CYCLES ONLY.
 *
 * *** AVERAGING OVER A PARTIAL CYCLE IS THE WHOLE WAY TO GET THIS WRONG. *** The theorem is exact over a closed
 * orbit and merely approximate over any other interval, so this trims to the first and last detected crossing
 * rather than averaging the run. A run-length average (runMeanX above) is deliberately reported separately so
 * the two can be compared instead of confused.
 */
export function timeAverages({ p = DEFAULTS, x0 = null, y0 = null, integrator = "symplectic",
                               stepsPerCycle = 400, cycles = 40, sigma = 0 } = {}) {
    const r = integrate({ p, x0, y0, integrator, stepsPerCycle, cycles, sigma, sample: 0 });
    if (r.crossings.length < 2) return { meanX: null, meanY: null, cycles: 0, ...r };
    // re-run and accumulate only between the first and last crossing
    const step = INTEGRATORS[integrator], fp = fixedPoint(p);
    const dt = r.dt, i0 = r.crossings[0].i, i1 = r.crossings[r.crossings.length - 1].i;
    let x = x0 === null ? fp.x * 1.5 : x0, y = y0 === null ? fp.y : y0;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i <= i1; i++) {
        [x, y] = step(x, y, dt, p, sigma);
        if (i > i0 && i <= i1) { sx += x; sy += y; n++; }
    }
    return {
        meanX: sx / n, meanY: sy / n, exactX: fp.x, exactY: fp.y,
        errX: Math.abs(sx / n - fp.x) / fp.x, errY: Math.abs(sy / n - fp.y) / fp.y,
        cycles: r.crossings.length - 1, samples: n,
    };
}

/**
 * VOLTERRA'S PRINCIPLE. Harvest both species at rate h and report what the averages become.
 *
 * The predicted values come from the time-average theorem applied to the HARVESTED parameters -- so this
 * function contains no separate claim, only the same theorem evaluated twice. `measured` runs the simulation
 * and averages it, which is what makes the prediction falsifiable rather than algebra restated.
 */
export function volterraPrinciple({ p = DEFAULTS, harvest = 0.2, stepsPerCycle = 400, cycles = 40, sigma = 0 } = {}) {
    const harvested = { ...p, alpha: p.alpha - harvest, gamma: p.gamma + harvest };
    if (harvested.alpha <= 0) throw new Error("harvest exceeds the prey growth rate: the system collapses, and no average exists");
    const before = fixedPoint(p), after = fixedPoint(harvested);
    // *** sigma IS THREADED SO A PLANTED CALLER GETS A PLANTED ANSWER RATHER THAN A MIXED ONE. *** The prey
    // equilibrium gamma/delta contains no sigma, so the PREDICTED direction is untouched by the plant -- which
    // means Volterra's principle SURVIVES the logistic refinement, and this mode is plant-blind in its own
    // observables by construction. That is the device's thesis rather than a gap in it: the shared
    // firstIntegralDrift and amplitudeRatio are what make the mode gradeable at all.
    const m = timeAverages({ p: harvested, stepsPerCycle, cycles, sigma });
    return {
        harvest, before, after, measured: { x: m.meanX, y: m.meanY },
        preyRose: after.x > before.x, predatorFell: after.y < before.y,
        preyFactor: after.x / before.x, predatorFactor: after.y / before.y,
        measuredErrX: m.errX, measuredErrY: m.errY,
    };
}

// ================================================================================================================
// THE PLANT, DOCUMENTED WHERE IT LIVES
// ================================================================================================================
//
// `sigma` adds a logistic self-limitation -sigma*x^2 to the prey equation. *** THAT IS NOT A CORRUPTION, IT IS
// THE STANDARD AND MORE REALISTIC MODEL *** -- prey compete for finite grass, and every ecology textbook writes
// it down. Which is exactly what makes it the right plant: it is CORRECT ECOLOGY FOR A DIFFERENT MODEL, the
// shape v3991's cylindrical Lane-Emden used.
//
// AND IT IS INVISIBLE TO ALMOST EVERY CHECK ANYBODY WOULD RUN, because:
//   the prey fixed point x* = gamma/delta is COMPLETELY UNCHANGED by sigma (measured: 4 at every sigma tested);
//   the predator fixed point moves only to (alpha - sigma*x*)/beta -- 2.75 to 2.70 at PLANT_SIGMA -- and the
//     planted run's own average MATCHES that shifted value, so the system is SELF-CONSISTENT, not visibly broken;
//   the TIME-AVERAGED prey population converges BACK to 4.000 the longer you run: relative error 3.0e-3 at 20
//     cycles, 6.9e-4 at 100, 1.7e-4 at 400. The spiral settles onto the very point the average is supposed to
//     equal, so the theorem is not merely insensitive here -- IT GETS MORE RIGHT THE LONGER YOU LOOK.
//
// *** SO THE TIME-AVERAGE THEOREM IS NOT A USABLE DETECTOR, WHICH IS WORTH SAYING OUT LOUD BECAUSE IT IS THE
// MOST INTERESTING KEY THIS MODULE HAS. *** What the plant destroys is the CLOSED ORBIT: the neutral centre
// becomes a stable spiral, so the first integral stops being integral (max|dV| 3.46e-4 -> 3.76e-2, a factor of
// 109) and the prey oscillation amplitude collapses -- last cycle over first, 1.0000030 nominal against
// 4.24e-3 planted, a factor of 236. Those two are the detectors.
//
//   THE PERIOD IS A WEAK THIRD ONE, AND MY FIRST ESTIMATE OF IT WAS WRONG BY 55x. The planted Jacobian at its
//   own fixed point is [[-sigma*x*, -beta*x*], [delta*y*, 0]], so the damped frequency is
//   sqrt(beta*delta*x* y* - sigma^2 x*^2 / 4) -- and the dominant term is NOT the sigma^2 damping correction,
//   it is that y* ITSELF HAS MOVED inside the determinant. Holding y* fixed predicts a 0.0114% shift; letting
//   it move predicts 0.933%, and the measurement is 9.560543 against a predicted 9.560669 -- 1.3e-5 apart. So
//   the period does shift, by just under one percent, which is exactly the size a real observer would write off
//   as parameter uncertainty. Detectable only if you already knew to look.
//
// AND YOU CANNOT SEE THAT WITHOUT AN INTEGRATOR YOU TRUST. A decaying oscillation is exactly what a dissipative
// method produces on the honest model -- so "the populations settled down" is uninterpretable unless the method
// is known not to damp. The symplectic stepper's drift ratio is 1.000 at 3200 cycles, which is what licenses
// reading a decay as the MODEL. That is the practical payoff of v3993's result in a device that needs it.
export const PLANT_SIGMA = 0.005;

/** Peak-to-peak prey amplitude in the first and last complete cycle -- the detector the plant cannot dodge. */
export function amplitudeDecay(opts = {}) {
    const r = integrate({ ...opts, sample: 0 });
    if (r.cyclesCompleted < 2) return { first: null, last: null, ratio: null, cycles: r.cyclesCompleted };
    const step = INTEGRATORS[r.integrator], p = r.p, fp = fixedPoint(p);
    const c = r.crossings, dt = r.dt;
    const spanA = [c[0].i, c[1].i], spanB = [c[c.length - 2].i, c[c.length - 1].i];
    let x = opts.x0 === undefined || opts.x0 === null ? fp.x * 1.5 : opts.x0;
    let y = opts.y0 === undefined || opts.y0 === null ? fp.y : opts.y0;
    let aLo = Infinity, aHi = -Infinity, bLo = Infinity, bHi = -Infinity;
    for (let i = 0; i <= spanB[1]; i++) {
        [x, y] = step(x, y, dt, p, r.sigma);
        if (i >= spanA[0] && i <= spanA[1]) { aLo = Math.min(aLo, x); aHi = Math.max(aHi, x); }
        if (i >= spanB[0] && i <= spanB[1]) { bLo = Math.min(bLo, x); bHi = Math.max(bHi, x); }
    }
    return { first: aHi - aLo, last: bHi - bLo, ratio: (bHi - bLo) / (aHi - aLo), cycles: r.cyclesCompleted };
}
