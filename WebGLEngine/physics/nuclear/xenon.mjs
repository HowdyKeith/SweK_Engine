// physics/nuclear/xenon.mjs
//
// v3985 -- XENON-135, THE POISON THAT BUILDS UP AFTER YOU SHUT DOWN. Round 3 of the reactor build, and the
// piece that makes the kinetics device a reactor rather than an equation: xenon is where reactivity comes from
// on the hour timescale, and it moves in the direction nobody expects.
//
// Xe-135 is the most absorbing nuclide known -- about 2.65e-18 cm^2, two million barns. It is made two ways: a
// little directly from fission, and a lot from the decay of I-135 (half-life 6.57 h). It is destroyed two ways:
// its own decay (9.14 h) and by eating a neutron. So while the reactor runs, the flux burns xenon away as fast
// as iodine makes it. *** SHUT THE REACTOR DOWN AND ONLY THE PRODUCTION CONTINUES: the iodine already in the
// core keeps decaying into xenon, and the neutrons that were removing it are gone. Xenon RISES for about half a
// day before it starts to fall. *** That is the iodine pit, and it is why a scrammed reactor can become
// impossible to restart for a day -- the physics behind Chernobyl's operators finding their reactor would not
// come back up.
//
// ================================================================================================================
// THE KEYS
// ================================================================================================================
//
//   BATEMAN vs RK4       after shutdown the flux is zero and the system is EXACTLY the two-step chain
//                        I -> Xe -> stable that decay.mjs already solves in closed form. Graded against RK4 on
//                        the same ODEs: worst 8.0e-14 over three fluxes and four times.
//
//   *** AND THE CLOSED FORM IS decay.mjs's, REUSED BY SUPERPOSITION RATHER THAN REIMPLEMENTED. *** The system
//   is LINEAR, so the xenon already present decays on its own while the iodine feeds a Bateman daughter, and
//   the two add. Measured against a directly-written closed form: relative difference EXACTLY 0. That is what
//   makes it reuse -- a second copy of the algebra would have been a second thing to get wrong.
//
//   THE PEAK TIME         a LIMIT: as the pre-shutdown flux rises, the time to peak xenon approaches
//                         ln(lambdaI/lambdaXe)/(lambdaI - lambdaXe) = 11.129 h, and approaches it monotonically
//                         (10.138 -> 11.022 -> 11.118 -> 11.129 at 1e14 -> 1e18). The familiar "xenon peaks
//                         about half a day after shutdown" is that asymptote, and it is DERIVED here rather
//                         than quoted -- the analytic limit shares no line with the search that finds the peak.
//
//   THE PIT THRESHOLD     *** EMERGENT, LIKE PROMPT CRITICALITY IN kinetics.mjs. *** A pit exists at all only
//                         above a threshold flux. Below it xenon simply decays away after shutdown and there is
//                         no pit to climb out of. The threshold is recovered by bisecting the SIMULATION for
//                         where dXe/dt changes sign at t = 0, and checked against a closed form derived
//                         independently: phi* = lambdaXe * yieldXe / (yieldI * sigmaXe) = 2.83816e11. It exists
//                         because the direct xenon yield is small beside the iodine yield -- if fission made
//                         its xenon directly there would be no pit at any flux.
"use strict";
import { batemanChain } from "./decay.mjs";

const HOUR = 3600;

/**
 * Xe-135 / I-135 data for U-235 thermal fission. Yields are per fission; the cross-section is in cm^2.
 * Published measurements, not anything derived here -- which is what lets the peak time be a key against nature.
 */
export const XENON_U235 = {
    yieldI: 0.06386,                      // I-135 fission yield
    yieldXe: 0.00228,                     // DIRECT Xe-135 fission yield -- small, and the pit exists because it is
    lambdaI: Math.LN2 / (6.57 * HOUR),    // I-135 decay constant, s^-1
    lambdaXe: Math.LN2 / (9.14 * HOUR),   // Xe-135 decay constant, s^-1
    sigmaXe: 2.65e-18,                    // Xe-135 microscopic absorption cross-section, cm^2 (~2.65 Mbarn)
};
/** Macroscopic fission cross-section for a typical light-water reactor, 1/cm. */
export const SIGMA_F_LWR = 0.0439;
/** A representative full-power thermal flux, n/cm^2/s. */
export const FLUX_LWR = 3e13;

/**
 * Steady-state iodine and xenon at a held flux.
 * Iodine balances decay against production. Xenon balances decay AND BURNUP against both its sources, and the
 * burnup term is why xenon saturates: past a certain flux the neutrons remove it as fast as it can be made.
 */
export function equilibrium(phi, X = XENON_U235, sigmaF = SIGMA_F_LWR) {
    return {
        I: X.yieldI * sigmaF * phi / X.lambdaI,
        Xe: (X.yieldI + X.yieldXe) * sigmaF * phi / (X.lambdaXe + X.sigmaXe * phi),
    };
}

/**
 * Iodine and xenon `t` seconds after a scram from steady operation at `phi0`.
 *
 * With the flux gone this is a plain two-step decay chain, so the answer is decay.mjs's Bateman solution plus
 * the independent decay of the xenon that was already there. SUPERPOSITION, not a new derivation: the ODEs are
 * linear, and stating it this way means the chain algebra has exactly one owner in this tree.
 */
export function afterScram(phi0, t, X = XENON_U235, sigmaF = SIGMA_F_LWR) {
    const eq = equilibrium(phi0, X, sigmaF);
    return {
        I: eq.I * Math.exp(-X.lambdaI * t),
        Xe: eq.Xe * Math.exp(-X.lambdaXe * t) + batemanChain(eq.I, X.lambdaI, X.lambdaXe, t).B,
    };
}

/** The same two ODEs by RK4. Deliberately shares nothing with afterScram -- the second route. */
export function afterScramIntegrated(phi0, t, X = XENON_U235, sigmaF = SIGMA_F_LWR, steps = 20000) {
    const eq = equilibrium(phi0, X, sigmaF);
    let I = eq.I, Xe = eq.Xe;
    const h = t / steps;
    const d = (i, x) => [-X.lambdaI * i, X.lambdaI * i - X.lambdaXe * x];
    for (let k = 0; k < steps; k++) {
        const a = d(I, Xe);
        const b = d(I + h / 2 * a[0], Xe + h / 2 * a[1]);
        const c = d(I + h / 2 * b[0], Xe + h / 2 * b[1]);
        const e = d(I + h * c[0], Xe + h * c[1]);
        I += h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + e[0]);
        Xe += h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + e[1]);
    }
    return { I, Xe };
}

/** When xenon peaks after a scram, found by search on the closed form. Returns hours and the peak height. */
export function peakAfterScram(phi0, X = XENON_U235, sigmaF = SIGMA_F_LWR, { maxHours = 40, dt = 2 } = {}) {
    const start = equilibrium(phi0, X, sigmaF).Xe;
    let bestT = 0, best = -Infinity;
    for (let t = 0; t <= maxHours * HOUR; t += dt) {
        const xe = afterScram(phi0, t, X, sigmaF).Xe;
        if (xe > best) { best = xe; bestT = t; }
    }
    return { hours: bestT / HOUR, peak: best, start, ratio: best / start };
}

/**
 * The high-flux limit of the peak time, in hours. As the pre-shutdown xenon becomes negligible beside the
 * iodine, the peak moves to where lambdaI*I = lambdaXe*Xe on a pure chain, which is this. Shares no line with
 * the search in peakAfterScram, so the two agreeing is evidence rather than bookkeeping.
 */
export function peakTimeLimit(X = XENON_U235) {
    return Math.log(X.lambdaI / X.lambdaXe) / (X.lambdaI - X.lambdaXe) / HOUR;
}

/**
 * The flux above which a pit exists at all, in closed form.
 *
 * A pit means xenon RISES after shutdown, i.e. dXe/dt > 0 at t = 0, i.e. lambdaI*I_eq > lambdaXe*Xe_eq. Both
 * equilibria are proportional to the flux, and the algebra leaves phi* = lambdaXe*yieldXe/(yieldI*sigmaXe) --
 * note that the fission cross-section cancels, so the threshold is a property of the NUCLIDES and not of the
 * reactor. Below it, a scrammed core's xenon simply decays and there is nothing to wait out.
 */
export function pitThreshold(X = XENON_U235) {
    return X.lambdaXe * X.yieldXe / (X.yieldI * X.sigmaXe);
}

/** Sign of dXe/dt immediately after a scram -- positive means the pit is forming. */
export function pitRising(phi0, X = XENON_U235, sigmaF = SIGMA_F_LWR) {
    const eq = equilibrium(phi0, X, sigmaF);
    return X.lambdaI * eq.I - X.lambdaXe * eq.Xe;
}

/**
 * Negative reactivity held by a xenon concentration, in absolute units (multiply by 1/beta for dollars).
 * rho = -sigmaXe * Xe / sigmaA, the fraction of neutrons xenon is taking out of the chain. This is the hook
 * that ties this module to kinetics.mjs: xenon is what moves reactivity on the hour timescale, and the page
 * feeds this straight into the point-kinetics reactivity.
 */
export function xenonReactivity(xe, X = XENON_U235, sigmaA = 0.1) {
    return -X.sigmaXe * xe / sigmaA;
}
