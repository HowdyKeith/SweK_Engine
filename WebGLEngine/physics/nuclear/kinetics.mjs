// physics/nuclear/kinetics.mjs
//
// v3983 -- POINT REACTOR KINETICS. The second nuclear device, and it earns its place the way decay.mjs's header
// demands: "a new field only earns a device if it can be graded against something other than itself."
//
// The model is seven coupled ODEs -- one neutron population and six delayed-precursor groups:
//
//     dn/dt  = ((rho - beta)/GEN) n + sum_i lambda_i C_i
//     dC/dt  = (beta_i/GEN) n - lambda_i C_i
//
// and the whole of reactor control lives in the fact that beta is 0.65% rather than 0. Without the delayed
// groups a reactor's period would be GEN ~ 2e-5 s and no mechanism, human or otherwise, could hold it critical.
//
// ================================================================================================================
// THE KEYS, AND THEY ARE INDEPENDENT OF EACH OTHER RATHER THAN FOUR FACES OF ONE FORMULA
// ================================================================================================================
//
//   INHOUR vs RK4        the inhour equation rho(w) = w*GEN + sum beta_i w/(w+lambda_i) is solved by bisection
//                        on each branch; the SAME reactivity is then integrated forward as seven ODEs and the
//                        asymptotic log-slope of n(t) is measured. Root-finding against quadrature, sharing no
//                        line. Measured agreement 1.5e-12 at $0.50.
//
//   THE SCRAM ASYMPTOTE  a reactor cannot be shut down faster than its longest-lived precursor. However negative
//                        the reactivity, w -> -lambda_1 = -0.0124 s^-1 (T_half ~ 56 s). Measured: -$10 gives
//                        -1.2358e-2 against -1.24e-2. A LIMIT, approached at a definite rate, which is a
//                        stronger check than a value -- decay.mjs's secular-equilibrium reasoning, reused.
//
//   PROMPT CRITICALITY   *** AND THIS ONE IS EMERGENT, NOT TYPED IN. *** Below rho = beta the period is
//                        controlled by the delayed groups and is INDEPENDENT of GEN (measured: 0.997 across a
//                        100x change in GEN). Above it the prompt term takes over and the period scales as
//                        1/GEN (measured ratio 1.00e-2 for the same 100x), approaching (rho-beta)/GEN to 3e-6.
//                        The threshold is never written down -- beta enters only as six separately-published
//                        beta_i that happen to sum to it, and the CHANGE IN CHARACTER is what locates it.
//
//   STEADY STATE         at rho = 0, dC_i/dt = 0 gives C_i = beta_i n /(GEN lambda_i) EXACTLY, and dn/dt is then
//                        identically zero rather than approximately. Residual is float rounding.
//
// ================================================================================================================
// *** A ROUTE THAT WAS TRIED AND REFUSED, BECAUSE A REFUSAL WITH A MEASUREMENT IS WORTH MORE THAN A SILENT GAP ***
// ================================================================================================================
//
// The obvious second route is linear algebra: build the 7x7 system matrix, take its characteristic polynomial
// with charPolyFaddeev, and root it with durandKerner -- both already sitting in physics/control/. IT DOES NOT
// WORK HERE, and it fails quietly rather than loudly. The roots span -0.0124 to -3.6e3, a conditioning ratio of
// ~3e5, and the polynomial's coefficients span comparable orders; durandKerner returns repeated and
// complex-conjugate values for a system whose seven roots are all real and distinct. MEASURED at rho = -$1 it
// reports w = +2.6e-1 -- POSITIVE GROWTH FOR NEGATIVE REACTIVITY, a reactor that runs away when it is scrammed.
// Nothing about the output announces this; it is seven plausible-looking numbers.
//
// So the second route is RK4, which is well conditioned here, and the matrix route is named here as unusable
// rather than left for the next person to rediscover. This is also why inhourRoots bisects each branch between
// consecutive poles instead of handing the problem to a general-purpose root finder: the bracketing IS the
// conditioning fix, because the interlacing of the roots with the poles is known analytically.
"use strict";

// ---- CONSTANTS ----------------------------------------------------------------------------------------------
// Keepin six-group delayed-neutron data for thermal fission of U-235. These are PUBLISHED MEASUREMENTS, not
// anything this tree derived, which is what makes them usable as an external key: beta is never written down,
// only these six fractions that sum to it.
export const KEEPIN_U235 = {
    beta: [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
    lambda: [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01],
};
/** Prompt neutron generation time, seconds. ~2e-5 for a light-water reactor. */
export const GEN_LWR = 2e-5;

/** Total delayed fraction -- SUMMED, never typed as a constant, so the sum rule stays checkable. */
export const totalBeta = (groups = KEEPIN_U235) => groups.beta.reduce((s, b) => s + b, 0);

/** Reactivity in DOLLARS: rho/beta. $1.00 is prompt critical, by definition of the unit. */
export const dollars = (rho, groups = KEEPIN_U235) => rho / totalBeta(groups);
export const fromDollars = (d, groups = KEEPIN_U235) => d * totalBeta(groups);

// ---- THE INHOUR EQUATION ------------------------------------------------------------------------------------
/**
 * rho as a function of the stable period root w. This is the inhour equation, and it is the reactivity REQUIRED
 * to sustain a given exponential rate -- the inverse of the question usually asked, which is why it is solved by
 * bracketing rather than evaluated directly.
 */
export function inhour(w, gen = GEN_LWR, groups = KEEPIN_U235) {
    let s = w * gen;
    for (let i = 0; i < groups.beta.length; i++) s += groups.beta[i] * w / (w + groups.lambda[i]);
    return s;
}

/**
 * All seven roots of the inhour equation for a given reactivity.
 *
 * The roots INTERLACE with the poles at -lambda_i: exactly one root lies in each interval between consecutive
 * poles, one below the lowest pole, and one above the highest. That interlacing is a property of the equation,
 * not a guess, and using it turns an ill-conditioned global root-find into seven well-conditioned bisections.
 * Returned sorted descending, so [0] is always the asymptotically dominant root.
 */
export function inhourRoots(rho, gen = GEN_LWR, groups = KEEPIN_U235, iters = 400) {
    const poles = groups.lambda.map((l) => -l).sort((a, b) => a - b);   // -3.01 ... -0.0124
    const f = (w) => inhour(w, gen, groups) - rho;
    const out = [];
    const brackets = [[-1 / gen * 1e3, poles[0] - 1e-12]];
    for (let i = 0; i < poles.length - 1; i++) brackets.push([poles[i] + 1e-12, poles[i + 1] - 1e-12]);
    // the last branch runs to +infinity; above prompt critical the root is O((rho-beta)/gen), so the upper
    // bound has to scale with 1/gen rather than being a fixed number
    brackets.push([poles[poles.length - 1] + 1e-12, Math.max(1e6, 1e3 / gen)]);
    for (const [lo, hi] of brackets) {
        let a = lo, b = hi, fa = f(a), fb = f(b);
        if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) continue;
        for (let k = 0; k < iters; k++) {
            const m = (a + b) / 2, fm = f(m);
            if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
        }
        out.push((a + b) / 2);
    }
    return out.sort((a, b) => b - a);
}

/** The asymptotically dominant root -- the one that survives, and so the one a period meter reads. */
export function dominantRoot(rho, gen = GEN_LWR, groups = KEEPIN_U235) {
    const r = inhourRoots(rho, gen, groups);
    return r.length ? r[0] : NaN;
}

/** Reactor period: the time to change by a factor of e. Infinite at exactly critical. */
export const period = (rho, gen = GEN_LWR, groups = KEEPIN_U235) => 1 / dominantRoot(rho, gen, groups);

// ---- THE STATE AND ITS EXACT STEADY SOLUTION ------------------------------------------------------------------
/**
 * The critical steady state: C_i = beta_i n /(GEN lambda_i). Exact, not relaxed-into, so a run that starts here
 * and is given rho = 0 must not drift at all -- which is what makes drift a measurement of the integrator rather
 * than of the physics.
 */
export function steadyState(n = 1, gen = GEN_LWR, groups = KEEPIN_U235) {
    return { n, C: groups.beta.map((b, i) => b * n / (gen * groups.lambda[i])) };
}

/** The right-hand side of the seven ODEs. Pure; no state of its own. */
export function derivative(state, rho, gen = GEN_LWR, groups = KEEPIN_U235) {
    const { n, C } = state;
    const b = totalBeta(groups);
    let dn = ((rho - b) / gen) * n;
    for (let i = 0; i < C.length; i++) dn += groups.lambda[i] * C[i];
    return { n: dn, C: C.map((c, i) => groups.beta[i] / gen * n - groups.lambda[i] * c) };
}

/**
 * RK4 on the seven ODEs. DELIBERATELY SHARES NOTHING WITH inhourRoots -- decay.mjs's batemanIntegrated exists
 * for the same reason and this mirrors it. `dt` must resolve the fastest root: the prompt mode is ~ -1/GEN, so
 * dt of a few hundred microseconds is the ceiling for GEN = 2e-5, and the gate measures rather than assumes it.
 */
export function integrate(rho, { t = 100, dt = 4e-4, gen = GEN_LWR, groups = KEEPIN_U235, n0 = 1, sample = 0 } = {}) {
    let st = steadyState(n0, gen, groups);
    const steps = Math.max(1, Math.round(t / dt));
    const trace = [];
    const add = (a, k, h) => ({ n: a.n + h * k.n, C: a.C.map((c, i) => c + h * k.C[i]) });
    for (let s = 0; s < steps; s++) {
        const k1 = derivative(st, rho, gen, groups);
        const k2 = derivative(add(st, k1, dt / 2), rho, gen, groups);
        const k3 = derivative(add(st, k2, dt / 2), rho, gen, groups);
        const k4 = derivative(add(st, k3, dt), rho, gen, groups);
        st = {
            n: st.n + dt / 6 * (k1.n + 2 * k2.n + 2 * k3.n + k4.n),
            C: st.C.map((c, i) => c + dt / 6 * (k1.C[i] + 2 * k2.C[i] + 2 * k3.C[i] + k4.C[i])),
        };
        if (sample && s % sample === 0) trace.push([(s + 1) * dt, st.n]);
    }
    return { ...st, trace };
}

/**
 * The asymptotic exponential rate MEASURED from an integration, by least squares on log n over the tail.
 * This is the quantity that must equal the dominant inhour root, and the two calculations share no line.
 */
export function measuredRate(rho, { t = 100, dt = 4e-4, gen = GEN_LWR, groups = KEEPIN_U235, tailFrac = 0.3 } = {}) {
    let st = steadyState(1, gen, groups);
    const steps = Math.max(2, Math.round(t / dt));
    const from = Math.floor(steps * (1 - tailFrac));
    let N = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    const add = (a, k, h) => ({ n: a.n + h * k.n, C: a.C.map((c, i) => c + h * k.C[i]) });
    for (let s = 0; s < steps; s++) {
        const k1 = derivative(st, rho, gen, groups);
        const k2 = derivative(add(st, k1, dt / 2), rho, gen, groups);
        const k3 = derivative(add(st, k2, dt / 2), rho, gen, groups);
        const k4 = derivative(add(st, k3, dt), rho, gen, groups);
        st = {
            n: st.n + dt / 6 * (k1.n + 2 * k2.n + 2 * k3.n + k4.n),
            C: st.C.map((c, i) => c + dt / 6 * (k1.C[i] + 2 * k2.C[i] + 2 * k3.C[i] + k4.C[i])),
        };
        if (s >= from && st.n > 0) {
            const x = (s + 1) * dt, y = Math.log(st.n);
            N++; sx += x; sy += y; sxx += x * x; sxy += x * y;
        }
    }
    return N > 1 ? (N * sxy - sx * sy) / (N * sxx - sx * sx) : NaN;
}

// ---- PROMPT CRITICALITY, LOCATED RATHER THAN DECLARED --------------------------------------------------------
/**
 * How strongly the period depends on the prompt generation time, as a ratio across a 100x change in GEN.
 *
 * *** THIS IS THE DEVICE'S BEST KEY AND IT NAMES NO THRESHOLD. *** Below prompt critical the delayed groups set
 * the pace and the answer barely moves (ratio -> 1). Above it the prompt term dominates and w scales as 1/GEN
 * (ratio -> 0.01 for a 100x reduction). Sweeping rho and watching where this ratio falls off a cliff RECOVERS
 * beta from the six beta_i, without beta having been used as a threshold anywhere.
 */
export function genSensitivity(rho, groups = KEEPIN_U235, gen = GEN_LWR, factor = 100) {
    const hi = dominantRoot(rho, gen, groups);
    const lo = dominantRoot(rho, gen / factor, groups);
    return hi / lo;
}

/**
 * Recover the prompt-critical reactivity from the DYNAMICS, as beta = rho - w*GEN in the prompt regime.
 *
 * *** THE FIRST VERSION OF THIS BISECTED ON THE genSensitivity CLIFF AND WAS WRONG BY 2.5%, WHICH IS WHY IT IS
 * NOT WHAT SHIPPED. *** The cliff is smooth, not sharp -- sensitivity is already 0.26 at $0.99 -- so "where the
 * ratio crosses one half" lands BELOW beta and lands there by an amount nobody could justify. It returned
 * 6.3390e-3 against a true 6.5020e-3 and looked perfectly reasonable doing it.
 *
 * Above prompt critical w -> (rho - beta)/GEN, so this inverts that asymptote instead. It is a LIMIT rather than
 * a threshold, and it converges at a rate the gate checks rather than at one value that could be luck:
 *
 *     GEN      $1.50      $2.00      $3.00
 *     2e-5    2.46e-3    1.24e-3    6.22e-4      <- error HALVES as rho doubles
 *     2e-6    2.49e-4    1.25e-4    6.23e-5      <- and drops 10x with GEN
 *     2e-7    2.49e-5    1.25e-5    6.23e-6
 *
 * The error is O(GEN/(rho-beta)) on both axes, which is the signature of the neglected delayed terms and not of
 * a fitting artefact. HONEST ABOUT WHAT KIND OF KEY THIS IS: it is a CONSISTENCY key, since inhour() sums the
 * beta_i internally. The keys that reach outside this file are the Keepin constants and the scram asymptote.
 */
export function promptCriticalByAsymptote(rho, gen = GEN_LWR, groups = KEEPIN_U235) {
    return rho - dominantRoot(rho, gen, groups) * gen;
}
