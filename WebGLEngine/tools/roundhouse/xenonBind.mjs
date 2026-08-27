// tools/roundhouse/xenonBind.mjs
//
// XENON-135 JOINS THE ROUNDHOUSE -- the poison that builds up AFTER you shut down, and the physics behind
// Chernobyl's operators finding their reactor would not come back up.
//
// Xe-135 is the most absorbing nuclide known, about two million barns. It is made mostly by the decay of I-135
// (6.57 h) and destroyed mostly by eating a neutron. While the reactor runs, the flux burns xenon away as fast
// as iodine makes it. *** SHUT DOWN AND ONLY THE PRODUCTION CONTINUES: the iodine already in the core keeps
// decaying, the neutrons that were removing it are gone, and xenon RISES for most of a day before it falls. ***
// That is the iodine pit, and it is why a scrammed core can be impossible to restart.
//
// *** THREE KEYS, AND EACH IS TWO ROUTES THAT SHARE NO LINE. ***
//
//   BATEMAN vs RK4      after shutdown the flux is zero and the system is EXACTLY the two-step chain
//                       I -> Xe -> stable that decay.mjs solves in closed form. Graded against RK4 on the same
//                       ODEs: measured worst 7.76e-15 over four times. The closed form is decay.mjs's, reused by
//                       SUPERPOSITION rather than reimplemented -- a second copy of the chain algebra would have
//                       been a second thing to get wrong.
//
//   THE PEAK TIME       a LIMIT, not a constant. As the pre-shutdown flux rises the peak approaches
//                       ln(lambdaI/lambdaXe)/(lambdaI - lambdaXe) = 11.1291 h, monotonically: measured 10.1383
//                       -> 11.1183 -> 11.1289 at 1e14 -> 1e16 -> 1e18. The familiar "xenon peaks about half a
//                       day after shutdown" IS that asymptote, and the analytic limit shares no line with the
//                       search that finds the peak.
//
//   THE PIT THRESHOLD   *** EMERGENT. *** A pit exists at all only above a threshold flux; below it xenon simply
//                       decays away and there is nothing to wait out. The threshold is recovered here by
//                       BISECTING THE SIMULATION for where dXe/dt changes sign at t = 0, and graded against a
//                       closed form derived independently: phi* = lambdaXe*yieldXe/(yieldI*sigmaXe). The fission
//                       cross-section cancels, so the threshold is a property of the NUCLIDES, not the reactor.
//
// *** THE PLANT IS THE MODULE'S OWN SENTENCE MADE EXECUTABLE: "if fission made its xenon directly there would be
// no pit at any flux." *** Planted, the iodine yield is moved into the direct xenon yield WITH THE TOTAL YIELD
// PRESERVED. plantKind METHOD: the nuclide data is the same fission, rearranged.
//
// AND IT IS INVISIBLE WHILE THE REACTOR RUNS, WHICH IS THE WHOLE POINT. Equilibrium xenon depends only on the
// SUM of the two yields -- (yieldI + yieldXe)*sigmaF*phi/(lambdaXe + sigmaXe*phi) -- so a running core is
// BIT-IDENTICAL under the plant: measured 8.66163547e+14 both ways. Only the shutdown transient can tell, where
// the peak collapses from 8.38 h at 1.90x to no pit at all and the threshold goes to Infinity. A device that
// graded the operating point would certify a reactor with no iodine pit.

import {
    XENON_U235, SIGMA_F_LWR, FLUX_LWR,
    equilibrium, afterScram, afterScramIntegrated, peakAfterScram,
    peakTimeLimit, pitThreshold, pitRising,
} from "../../physics/nuclear/xenon.mjs";

export const XENON_OBSERVABLES = [
    "eqIodine", "eqXenon",
    "batemanXe", "rk4Xe", "batemanVsRk4Rel",
    "peakHours", "peakRatio",
    "peakTimeLimitH", "peakAtHighFlux", "limitApproachRel", "approachSpanH", "approachMonotone",
    "pitRisingSign", "pitThresholdClosed", "pitThresholdBisected", "thresholdRel",
];

const DEF = { phi: FLUX_LWR, tHours: 12, highFlux: 1e18 };
const HOUR = 3600;

const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

/**
 * Recover the pit threshold from the SIMULATION rather than the formula: bisect on the flux at which dXe/dt
 * changes sign immediately after a scram. Shares no line with pitThreshold(), so the two agreeing is evidence.
 * Returns null when no sign change exists in the bracket -- which is itself the finding under the plant.
 */
function bisectThreshold(X, sigmaF, lo = 1e8, hi = 1e15, iters = 80) {
    if (pitRising(lo, X, sigmaF) > 0 === pitRising(hi, X, sigmaF) > 0) return null;
    for (let i = 0; i < iters; i++) {
        const mid = Math.sqrt(lo * hi);                 // geometric: the bracket spans seven decades
        if (pitRising(lo, X, sigmaF) > 0 === pitRising(mid, X, sigmaF) > 0) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
}

function buildXenon({ mode = "pit", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT: fission makes its xenon directly. TOTAL YIELD PRESERVED, so the running reactor cannot tell.
    const X = config.planted
        ? { ...XENON_U235, yieldI: 0, yieldXe: XENON_U235.yieldI + XENON_U235.yieldXe }
        : XENON_U235;
    const sf = SIGMA_F_LWR;

    const eq = equilibrium(c.phi, X, sf);
    const t = c.tHours * HOUR;
    const closed = afterScram(c.phi, t, X, sf).Xe;
    const numeric = afterScramIntegrated(c.phi, t, X, sf).Xe;
    const pk = peakAfterScram(c.phi, X, sf);
    const limit = peakTimeLimit(X);
    // *** THE APPROACH, NOT THE ASYMPTOTE. *** peakAtHighFlux alone made `highFlux` THE ONLY KNOB IN THE LAB
    // THAT MOVED NO OBSERVABLE AT ANY VALUE -- knobLiveness measured it flat over multipliers from 0.5x to 8x.
    // It was never dead: peakAfterScram reads it. It was SATURATED AND THEN QUANTISED. The peak time reaches
    // its limit by phi ~ 5e17, and peakAfterScram's own search grid is dt = 2 s = 5.556e-4 h, so 5e17 and 1e25
    // both land on the identical float 11.12888888888889. A knob whose observable sits ON the asymptote reports
    // the asymptote, and the agent turning it gets a number and a causal story about nothing.
    //
    // This file's own header already claimed the right thing and nothing graded it: "the peak approaches
    // 11.1291 h MONOTONICALLY". So the observable becomes the CLIMB rather than the top of it -- a ladder at
    // phi/1e4, phi/1e2 and phi, which the knob slides bodily. MEASURED at the default: 10.1383 -> 11.1183 ->
    // 11.1289, a span of 0.9906 h that shrinks to 0.1339 h when highFlux is raised 8x, because the bottom of
    // the ladder climbs while the top cannot. THE KNOB NOW HAS SOMEWHERE TO MOVE, and what it moves is the
    // statement the header was making.
    const ladder = [c.highFlux / 1e4, c.highFlux / 1e2, c.highFlux].map((p) => peakAfterScram(p, X, sf).hours);
    const high = ladder[2];
    const closedThr = pitThreshold(X);
    const bisected = bisectThreshold(X, sf);

    return {
        eqIodine: eq.I, eqXenon: eq.Xe,
        batemanXe: closed, rk4Xe: numeric, batemanVsRk4Rel: rel(closed, numeric),
        peakHours: pk.hours, peakRatio: pk.ratio,
        peakTimeLimitH: limit, peakAtHighFlux: high, limitApproachRel: rel(high, limit),
        // The size of the climb the knob controls, and that it is a climb at all. Monotone approach from below
        // is a stronger statement than proximity: a route that overshot the limit and came back would satisfy
        // limitApproachRel and is not what an asymptote means.
        approachSpanH: ladder[2] - ladder[0],
        approachMonotone: (ladder[0] < ladder[1] && ladder[1] <= ladder[2] && ladder[2] <= limit) ? 1 : 0,
        pitRisingSign: Math.sign(pitRising(c.phi, X, sf)),
        pitThresholdClosed: closedThr,
        // null when the simulation has no sign change anywhere -- i.e. no pit at any flux, which is the plant.
        pitThresholdBisected: bisected,
        thresholdRel: bisected === null ? null : rel(bisected, closedThr),
    };
}

const XENON_MODES = ["pit"];   // v4074 -- the single source `modes` and `defaults()` both read

export const xenonDevice = {
    plantKind: "method",
    modes: XENON_MODES,
    name: "xenon-135-iodine-pit",
    observables: XENON_OBSERVABLES,
    build: buildXenon,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "pit"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: XENON_MODES.includes(mode) ? mode : XENON_MODES[0], config: { ...DEF } }),
};
