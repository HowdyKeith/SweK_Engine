// simulation/lbm/sheddingDesign.mjs
//
// v2834 -- WHY THE f_drag = 2 f_lift TEST NEVER CONVERGED, expressed as arithmetic you can check rather than a
// story about a run that went wrong.
//
// v2797 measured the vortex street twice, independently, and got agreement -- but it could NOT reproduce the
// textbook relation that drag oscillates at TWICE the lift frequency. It recorded that honestly and left it
// open: "longer runs at lower blockage are the way to test 2f properly". That turned out to be the wrong
// prescription, and this module is why.
//
// THE ROOT CAUSE IS A DESIGN ERROR, NOT A SHORT RUN. A periodic channel driven by a constant body force
// accelerates until viscous drag balances it. The terminal centreline speed of plane Poiseuille flow is
//
//     U_terminal = g h^2 / (2 nu)
//
// and v2797's configuration (ny = 61, g = 3e-6, tau = 0.53) puts that at 0.131 -- ABOVE the ~0.1 ceiling where
// lattice Boltzmann stops being valid. The flow was accelerating toward a speed it could never reach. It was
// never going to settle, and no amount of extra steps would have made it. That is why the Reynolds number
// drifted 101 -> 80 and the lift signal failed its sustained test.
//
// THREE CONSTRAINTS HAVE TO HOLD AT ONCE, and they fight:
//
//   SHEDDING     needs Re >~ 50, i.e. U >= 50 nu / D
//   VALIDITY     needs U <~ 0.1
//   EQUILIBRIUM  is reached in ~ h^2 / nu steps FROM REST -- 490,000 for a 101-tall channel, which is not a
//                long run, it is an impossible one
//
// The first two only overlap when nu is small enough, so LOWERING TAU is the lever, not lengthening the run.
// The third is why the field must be INITIALISED at equilibrium instead of accelerated into it.
//
// AND THEN A FOURTH THING, MEASURED HERE: a cylinder in the channel adds drag the clear-channel formula does not
// know about, so the true terminal speed is roughly 3.5x LOWER than the analytic value. Initialising with the
// clear-channel profile overshoots and the flow decelerates for the whole run.
//
// WHAT ACTUALLY BLOCKS THE MEASUREMENT, stated plainly: shedding MODULATES the drag, the drag sets the velocity,
// and the velocity sets the shedding. In a body-force-driven periodic channel those three are coupled, so the
// Reynolds number breathes and never holds still. The standard rig for this measurement uses a FIXED INFLOW
// VELOCITY, which breaks the loop by pinning the velocity from outside. This engine's LBM is periodic in x by
// design. So the 2f test needs a different BOUNDARY CONDITION, not a longer run -- and that is the honest
// finding, recorded rather than tuned around.
//
// Pure, no imports, browser-safe.

export const LBM_VALIDITY_U = 0.1;        // above this the compressibility error stops being ignorable
export const SHEDDING_RE = 50;            // unconfined onset; confinement raises it (measured in v2749)

export const viscosityOf = (tau) => (tau - 0.5) / 3;

// Terminal centreline speed of a body-force-driven plane channel. h is the half-height.
export const terminalU = (g, h, nu) => (g * h * h) / (2 * nu);

// The body force that would produce a wanted terminal speed -- the inverse, which is how a rig should be sized.
export const forceForU = (U, h, nu) => (U * 2 * nu) / (h * h);

// Order-of-magnitude steps for momentum to diffuse across the channel from rest.
export const equilibrationSteps = (h, nu) => (h * h) / nu;

// The speed window a shedding experiment must live inside. Empty when nu is too large.
export function velocityWindow(tau, D, { re = SHEDDING_RE, maxU = LBM_VALIDITY_U } = {}) {
    const nu = viscosityOf(tau);
    const uMin = (re * nu) / D;
    return { nu, uMin, uMax: maxU, viable: uMin < maxU, headroom: maxU - uMin };
}

// Judge a whole configuration before spending an hour on it. Returns every reason it cannot work, rather than
// the first -- a rig that fails two ways should say so once.
export function assessConfig({ nx, ny, D, tau, g, cylinder = true, cylinderDragFactor = 3.5 }) {
    const nu = viscosityOf(tau);
    const h = (ny - 2) / 2;
    const clearU = terminalU(g, h, nu);
    // a body in the channel lowers the terminal speed; measured at roughly 3.5x for D/ny ~ 0.07
    const realU = cylinder ? clearU / cylinderDragFactor : clearU;
    const win = velocityWindow(tau, D);
    const re = (realU * D) / nu;
    const problems = [];
    if (clearU > LBM_VALIDITY_U) problems.push(`terminal speed ${clearU.toFixed(3)} exceeds the LBM validity ceiling ${LBM_VALIDITY_U} -- the flow accelerates toward a speed it can never reach and never settles`);
    if (!win.viable) problems.push(`no viable speed window at tau=${tau}: shedding needs U>=${win.uMin.toFixed(4)} but validity caps U at ${win.uMax} -- lower tau`);
    if (re < SHEDDING_RE) problems.push(`terminal Re ${re.toFixed(0)} is below the shedding onset ~${SHEDDING_RE} -- a converged flow here would not shed at all`);
    return {
        nu, h, clearTerminalU: clearU, effectiveTerminalU: realU, terminalRe: re,
        equilibrationSteps: equilibrationSteps(h, nu),
        window: win,
        viable: problems.length === 0,
        problems,
    };
}

// ---- THE DRIVEN-RIG RESULT (v2842) -------------------------------------------------------------------
//
// v2835 built a fixed-inflow boundary condition specifically to break the coupling this file diagnosed. It was
// then run on the configuration prescribed here -- tau 0.55 inside the stable band, D=14 so the Reynolds number
// is met by a BIGGER BODY rather than a thinner fluid, U=0.0714 inside the velocity window, Re 60.
//
// WHAT THE BOUNDARY CONDITION DELIVERED, and it is the thing it was built for:
//
//     Reynolds drift during recording      v2797: 21%     v2834: 12-13%     DRIVEN RIG: 4.16%
//     lift signal sustained                v2797: NO      v2834: sometimes  DRIVEN RIG: YES
//     wake signal sustained                                                 DRIVEN RIG: YES
//
// Both observables sustained at once for the first time, and the drift cut by a factor of five. Pinning the
// velocity from outside works.
//
// WHAT IT DID NOT DELIVER: f_drag = 2 f_lift STILL does not reproduce. Measured ratio 0.615, and the drag's
// power AT 2 f_lift is 0.52x its power at f_lift -- present, but not dominant.
//
// AND A NEW SYMPTOM POINTS AT WHERE TO LOOK NEXT. The two independent frequency estimates, which agreed to
// 2.43% at 6.9% blockage in v2834, now disagree by 15.65%. The lift integrates force over the whole cylinder
// surface; the wake probe reads one point three diameters downstream. When they disagree THAT much while both
// are individually sustained, the probe is most likely sitting in the NEAR wake -- where the shear layers have
// not yet rolled up into a coherent street -- rather than in the developed vortex street the lift is feeling.
//
// SO THE NEXT THING TO VARY IS THE PROBE POSITION AND THE WARMUP, not the boundary condition again. Specifically:
// move the probe to 6-10 diameters downstream, and warm up long enough for the wake to traverse the full channel
// several times. That is a cheaper experiment than anything tried so far, and it is the one the evidence points
// at rather than the next thing on a list.
export const DRIVEN_RIG_RESULT = Object.freeze({
    config: { nx: 380, ny: 121, D: 14, tau: 0.55, U: 0.0714, Re: 60, blockage: 0.116 },
    reDriftFraction: 0.0416,          // against 0.21 in v2797 and ~0.125 in v2834
    liftSustained: true,
    wakeSustained: true,
    fDragOverFLift: 0.615,            // textbook 2.0
    dragPowerRatioAt2f: 0.52,         // power at 2*f_lift over power at f_lift -- present, not dominant
    observablesApartFraction: 0.1565, // 2.43% at lower blockage in v2834; the regression is the clue
    nextStep: "move the wake probe 6-10 diameters downstream and lengthen the warmup -- NOT another boundary condition",
});

// ---- THE PROBE-RAKE RESULT (v2843): MY OWN HYPOTHESIS, REFUTED --------------------------------------
//
// v2842 saw the two independent frequency estimates disagree by 15.65% and proposed a cause: the wake probe sat
// three diameters downstream, in the NEAR wake, before the shear layers roll into a coherent street. The named
// next experiment was to move it further out.
//
// IT WAS RUN, WITH A RAKE OF SIX PROBES AT 3, 5, 8, 11, 14 AND 18 DIAMETERS. The hypothesis is WRONG:
//
//     3D  48.4% from lift      11D  37.3%
//     5D  53.7%                14D  26.1%
//     8D  49.2%                18D  21.6%   <- best, and still worse than v2842 managed at 3D
//
// Disagreement does not fall smoothly with distance, and the best position in the whole rake is worse than the
// single near-wake probe achieved in the previous run. MORE TELLING: THE PROBES DISAGREE WITH EACH OTHER,
// reporting Strouhal numbers from 0.079 to 0.194 along one wake. That is not a badly placed sensor. There is no
// coherent street for any of them to find.
//
// AND THE ACTUAL VARIABLE SHOWED ITSELF IN THE DIFFERENCE BETWEEN THE TWO RUNS, which differed only in warmup:
//
//     warmup 14000 (v2842)   Re drift  4.16%   lift-vs-wake 15.65%
//     warmup 12000 (v2843)   Re drift 14.81%   lift-vs-wake 48.44%
//
// Less settling, more drift, worse agreement -- monotonically, across every observable at once. SETTLING TIME IS
// THE VARIABLE, not probe position. The wake cannot be coherent while the Reynolds number is still moving 15%
// underneath it, and no amount of moving the sensor fixes a flow that has not finished arriving.
//
// SO THE NEXT EXPERIMENT IS A LONGER WARMUP AND NOTHING ELSE CHANGED -- and it is worth saying that this is the
// THIRD prescription in this file, after "longer runs at lower blockage" (v2797, wrong) and "a different
// boundary condition" (v2834, right and it helped). The pattern is that each fix uncovered the next constraint
// rather than finishing the job, which is what an honest experimental record looks like.
export const PROBE_RAKE_RESULT = Object.freeze({
    hypothesis: "the wake probe sat in the near wake, before the street rolls up",
    refuted: true,
    rake: [{ d: 3, apart: 0.484 }, { d: 5, apart: 0.537 }, { d: 8, apart: 0.492 }, { d: 11, apart: 0.373 }, { d: 14, apart: 0.261 }, { d: 18, apart: 0.216 }],
    strouhalSpreadAlongWake: [0.079, 0.194],   // probes disagreeing with EACH OTHER, not just with the lift
    warmupComparison: [{ warmup: 14000, reDrift: 0.0416, apart: 0.1565 }, { warmup: 12000, reDrift: 0.1481, apart: 0.4844 }],
    conclusion: "settling time is the variable, not probe position -- the wake cannot be coherent while Re is still moving under it",
    nextStep: "a much longer warmup at the same configuration, changing nothing else",
});
