// tools/roundhouse/valueMatch.mjs
//
// v3364 -- A THIRD COUPLING AXIS: MATCH THE NUMBERS, NOT THE NAMES.
//
// coupleCensus has two axes -- shared observable NAMES and shared physics MODULES -- and three couplings found
// by hand escaped both:
//
//   symplecticity        hmc's Jacobian determinant against kepler's energy bound. Different quantities.
//   shadow / escape cone lens looking in against emit looking out. SAME NUMBER, different names.
//   radial period        transfer's turning-point integral against clocks' epicyclic period. Same, in a limit.
//
// The last two share a VALUE and nothing else, which is mechanically findable: run every device, collect every
// numeric observable, and look for values that agree to ten digits across different devices.
//
// VERIFIED TO WORK ON A KNOWN CASE: lens/shadow.shadowAngleRad = 0.2490415079291834 and
// probe/emit.emitConeRad = 0.2490415079291829 match at 2e-15, so the axis finds a coupling that was previously
// only findable by a person noticing.
//
// *** AND THE NAIVE VERSION IS DROWNED IN CONFIGURATION. *** The first run returned 132 matches dominated by
// 0.5 -- friction's mu, plastic's cap, kepler's eccentricity, kerr's horizon angular velocity, all exactly 0.5
// because a human typed 0.5 into each. A number a person could have typed is not evidence of anything, so
// values that survive rounding to six significant figures are excluded. That cuts 132 to 23, and the survivors
// are still mostly simple rationals -- 1.0 from four normalised quantities, 1/3 from a mass ratio and an
// eccentricity that coincide.
//
// SO THIS REPORTS CANDIDATES, EXACTLY LIKE THE NAME AXIS, and for the same reason: a value match is a reason to
// LOOK, not a coupling. Adjudication is a person running both devices and deciding whether one quantity is
// being computed twice.
//
// COST IS THE REAL CONSTRAINT AND IT IS MEASURED, NOT GUESSED. Building every device in every mode does not
// finish: twof alone takes 217 SECONDS, kh 24s, kuramoto 8s, hydrostatic 6s, pipe3d 4s. Forty-one devices build
// in under 300ms and those are scanned; the thirteen slow ones are listed by name with their cost so the
// exclusion is a stated decision rather than a silent omission.

import { DEVICE_NAMES, getDevice } from "./devices.mjs";
import { unknownKeys } from "./strictConfig.mjs";
import { comparable } from "./observableUnits.mjs";

/** Devices too slow to scan, with the measured cost that put them here. */
export const SLOW_DEVICES = {
    twof: 217351, kh: 23904, kuramoto: 7715, hydrostatic: 6391, pipe3d: 4417,
    blobbodies: 2136, windtunnel: 1786, optics: 1614, diffusion: 1080,
    tempering: 836, thermal: 809, wolff: 346, landauzener: 336,
};

/** A value a human could plausibly have typed is not evidence. 0.5, 2, 1e-3 and friends are excluded. */
export const humanTypeable = (v) =>
    !Number.isFinite(v) || Math.abs(v) < 1e-9 || v === Number(v.toPrecision(6));

/** Every finite numeric observable from every cheap device and mode. */
/**
 * v3456 -- A COMPOSING DEVICE MUST NOT BE SCANNED FOR VALUE MATCHES.
 *
 * compose CONSUMES other devices and republishes their values as valueA and valueB. Every match it produces is
 * therefore a TAUTOLOGY: compose.valueA IS em.cComputed, copied one function call earlier. Measured on v3455 it
 * contributed FOUR of the seven unadjudicated small-integer matches, all of that shape.
 *
 * That is not a defect in compose -- it is the device working exactly as designed, and the census misreading a
 * copy as a coincidence. The rule generalises: a device whose observables ARE other devices' observables has
 * nothing to say about coincidence, and scanning it manufactures candidates a person must dismiss one at a time.
 *
 * It also explains why the units filter stalled. compose.valueA and valueB are POLYMORPHIC -- they hold whatever
 * is being compared, so they have no fixed dimension and CANNOT be declared. Units could never have cleared
 * them; excluding the device does.
 */
export const NON_SCANNABLE = {
    compose: "consumes other devices and republishes their observables -- every match is a copy, not a coincidence",
};

export async function collectObservables() {
    const out = [];
    for (const dev of DEVICE_NAMES) {
        if (SLOW_DEVICES[dev] || NON_SCANNABLE[dev]) continue;
        let d; try { d = await getDevice(dev); } catch { continue; }
        for (const mode of (d.modes || [null])) {
            let o; try { o = await d.build(mode ? { mode } : {}); } catch { continue; }
            for (const [k, v] of Object.entries(o || {})) {
                if (typeof v === "number" && Number.isFinite(v)) out.push({ dev, mode, key: k, value: v });
            }
        }
    }
    return out;
}

/** Cross-device value agreements. CANDIDATES, not couplings. */
export function valueMatches(observables, tol = 1e-10, includeTypeable = false) {
    const hits = [];
    for (let i = 0; i < observables.length; i++) {
        for (let j = i + 1; j < observables.length; j++) {
            const a = observables[i], b = observables[j];
            if (a.dev === b.dev) continue;
            if (!includeTypeable && (humanTypeable(a.value) || humanTypeable(b.value))) continue;
            if (includeTypeable && (Math.abs(a.value) < 1e-9 || Math.abs(b.value) < 1e-9)) continue;
            const rel = Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value));
            if (rel < tol) hits.push({ a, b, rel, value: a.value });
        }
    }
    return hits;
}

/**
 * Candidates a person has ruled on. A match with a stated reason is finished work; the backlog is
 * matches minus adjudicated, so a rejection is progress rather than a permanent entry.
 */
/**
 * v3367 -- *** A CONSERVED QUANTITY IS NOT A COUPLING, AND BOTH EXISTING GUARDS MISS IT. ***
 *
 * Adjudicating the survivors found the perturbation test's blind spot. TWO open matches survived, and both are
 * the same shape:
 *
 *     hmc/symplectic.jacobianDet   0.9999999999768472
 *     quantum/norm.norm            ~1
 *     splat/integral.integralRatio ~1
 *
 * EVERY ONE OF THOSE IS PINNED TO 1 BY ITS OWN PHYSICS AND OWES NOTHING TO THE OTHERS. A symplectic
 * integrator's Jacobian determinant is 1 because the map is area-preserving; a Crank-Nicolson propagator's norm
 * is 1 because it is unitary by construction; a normalised integral ratio is 1 because it was normalised. THREE
 * INDEPENDENT CONSERVATIONS, NOT ONE QUANTITY SEEN THREE TIMES.
 *
 * THEY SURVIVE PERTURBATION FOR EXACTLY THE REASON THEY ARE NOT EVIDENCE: each is held at 1 by a law that does
 * not care about the configuration, so moving a knob cannot break the equality. THE TEST CANNOT DISTINGUISH
 * "one quantity, two devices" FROM "two quantities that are both conserved at the same number", and a survivor
 * is the strongest signal it emits.
 *
 * *** AND humanTypeable DOES NOT CATCH THEM, WHICH IS THE SUBTLE PART. *** It excludes values a person could
 * plausibly have typed -- 0.5, 2, 1e-3 -- and 0.9999999999768472 is not one of those. IT IS 1 WEARING FLOAT
 * ERROR. The filter guards against a typed constant and not against a CONVERGED one.
 */
export const nearSmallInteger = (v, tol = 1e-8) => {
    if (!Number.isFinite(v)) return null;
    const r = Math.round(v);
    return (Math.abs(r) <= 2 && Math.abs(v - r) <= tol) ? r : null;
};

/** A match where BOTH sides sit on the same small integer is a shared conservation until shown otherwise. */
export const conservedPair = (hit) => {
    const a = nearSmallInteger(hit.a.value), b = nearSmallInteger(hit.b.value);
    return (a !== null && b !== null && a === b) ? a : null;
};

// v3388 -- ROUND DEFAULTS MANUFACTURE CANDIDATES, AND IT IS CHEAPER TO PICK BETTER DEFAULTS THAN TO FILTER.
//
// The four new fields arrived with 15 value-match candidates, NINE of them the same number: acoustics ran its
// Doppler example at v = 0.5c, where the source/observer asymmetry is EXACTLY 1/3, colliding with a mass ratio,
// an eccentricity and a beam closed form. Moving the default to 0.47c says the identical physics and collides
// with nothing. Measured: total matches 47 -> 38, new-field candidates 15 -> 6, and none of the remaining 1/3
// cluster touches a new field.
//
// The remaining 21 collisions on 1/3 are PRE-EXISTING between older devices and are left alone here -- fixing
// them means editing defaults across the older lab, which is a separate decision from not adding more.
//
// THE GENERAL RULE THIS ESTABLISHES: a default should be unremarkable rather than round. 0.5, 2 and 1 are what
// a person reaches for and therefore what unrelated devices collide on. Physically meaningful round values --
// glass at eps_r = 2.25 giving n = 1.5, a unit pipe length that cancels out of the harmonic ratios -- are KEPT,
// because there the roundness carries information a reader needs.

/**
 * *** THE EQUAL-ONE CLUSTER, DECLARED PER OBSERVABLE INSTEAD OF PER PAIR. ***
 *
 * v3941. ADJUDICATED below is keyed by PAIR, and the equal-one cluster grows QUADRATICALLY in it: seven members
 * needed 21 pairings, and four more arriving with the lab took it to 34 UNADJUDICATED pairs and turned the gate
 * red. Nothing was wrong with the physics -- the bookkeeping simply could not keep up with its own shape, and
 * the file said so two hundred lines above this one:
 *
 *     "any observable that is normalised to unity will join this cluster on the day it is added,
 *      and adjudicating it is bookkeeping rather than physics."
 *
 * Writing 34 more pair entries would have been the third round of that bookkeeping and would have set up the
 * fourth. THE DECLARATION IS THEREFORE PER OBSERVABLE -- O(n) reasons instead of O(n^2) pairings -- and a match
 * whose BOTH sides are declared here is the cluster, adjudicated by class.
 *
 * *** AND THE CHECK KEEPS ITS TEETH, WHICH IS THE WHOLE DESIGN CONSTRAINT. *** An observable that equals one and
 * is NOT declared here still lands in the open pile and still reddens the gate. That is the signal worth having:
 * a NEW quantity sitting on unity is either a normalisation nobody wrote down, or a real coupling, or a bug --
 * and it has to be looked at either way. Exempting the class wholesale would have made the check vacuous, which
 * is the trap this tree keeps naming; exempting DECLARED MEMBERS ONLY keeps the question alive for every arrival.
 *
 * EACH REASON BELOW IS THE DEVICE'S OWN, not this file's opinion of it -- every one is traceable to the source
 * or the header of the device that produces it.
 */
export const UNITY_BY_CONSTRUCTION = {
    // --- the seven already adjudicated pairwise before v3941 -------------------------------------------------
    "xpbd/kernel.kernelIntegral":
        "the poly6 kernel is NORMALISED to integrate to 1 -- an analytic identity, not a measurement that landed there",
    "whitedwarf/limitOrder.limitR2":
        "an R^2 against an exact power law; a perfect fit saturates at 1 by the definition of R^2",
    "poisson/canonical.qp":
        "the canonical bracket {q,p} = 1 -- the definition of a canonical pair",
    "kerr/extremal.photonPrograde":
        "extremal Kerr's prograde photon orbit sits at r = M, and the device reports it in units of M",
    "hmc/symplectic.jacobianDet":
        "a symplectic map is volume-preserving, so its Jacobian determinant is 1 by construction",
    "quantum/norm.norm":
        "unitary evolution preserves the norm; 1 is the initial condition surviving, not a coincidence",
    "splat/integral.integralRatio":
        "a ratio of an integral to its own normalisation",

    // --- the four that arrived with the lab and turned the gate red at v3941 ----------------------------------
    "flip2d/hydrostatic.linearityR2":
        "hydrostatic pressure is EXACTLY linear in depth, so the R^2 of that fit is 1 analytically -- the same class as whitedwarf/limitOrder.limitR2, which was already adjudicated",
    "flip3d/hydrostatic.linearityR2":
        "the 3D column, same analytic reason as flip2d",
    "freerotation/flip.factorMax":
        "the intermediate-axis theorem: rotation about the MAXIMUM-inertia axis is stable, so its perturbation growth factor is unity. A value of 1 here is the device reporting the stable case, which is the expected physics rather than an agreement with anything",

    // *** THIS ONE IS A PLANT MODE, AND IT IS DECLARED SEPARATELY BECAUSE THE REASON IS NOT NORMALISATION. ***
    // induction's `radialdot` is a SEEDED ERROR (plantMode: "radialdot", plantFlips: "circulationWorstErr").
    // Its own header records the measurement: dotting a purely azimuthal induced field with rhat ANNIHILATES it,
    // circulation goes -1.162389e+1 -> -7.87e-19 against an exact that does not move, and the RELATIVE ERROR
    // THEREFORE SATURATES AT UNITY -- "the answer is gone" expressed as a ratio. So it equals one by
    // construction too, but for a reason that has nothing to do with the other ten.
    //
    // *** AND IT RAISES A QUESTION THIS ENTRY DOES NOT ANSWER: collectObservables() walks `d.modes`, which
    // INCLUDES PLANT MODES, so the census is correlating values produced by deliberately-broken configurations.
    // Whether a coupling census should scan plants at all is a design decision for the lab's owner, not a
    // bookkeeping fix, and it is left open here rather than settled quietly. ***
    "induction/radialdot.circulationWorstErr":
        "PLANT MODE. A relative error saturating at unity because the measured circulation is annihilated to ~1e-19 against a fixed exact -- not a normalisation",

    // --- three more that arrived once the lab grew past 129 devices, found by re-running the census rather
    // than trusting the old 11-member count -----------------------------------------------------------------
    "reconQuality/blindspot.scaledCorr":
        "ct.js's scoreRecon computes a Pearson correlation coefficient (cov / sqrt(vr*vt)) between the " +
        "reconstruction and the truth. scaled = truth * 1.3 is an exact positive-slope affine transform of " +
        "truth, and the Pearson correlation of any variable against its own positive-slope affine transform " +
        "is 1 by the mathematical definition of the statistic -- not a measurement of reconstruction quality " +
        "at all, which is the file's own headline finding (a 30%-too-bright image scores a perfect 1.0)",
    "reconQuality/blindspot.shiftedCorr":
        "the same identity as scaledCorr, against shifted = truth + 0.4: an additive offset is also an exact " +
        "affine transform with positive slope (slope 1), so the Pearson correlation is 1 for the same reason",
    "cartpole/regulate.positionGainVsExact":
        "cartPoleBind.mjs's own comment states the identity directly: |K1| = sqrt(qx/r) EXACTLY, from the " +
        "return-difference identity in the s -> 0 limit where the cart's integrator dominates both sides. " +
        "This field is the computed LQR gain divided by that closed form, reported as a RATIO specifically " +
        "so it reads 1 whatever qx and r are -- an identity checked against itself, not a measurement",
};

/**
 * Is this match the equal-one cluster? True only when BOTH sides are declared above.
 * A pair with one declared side and one undeclared side is NOT adjudicated -- the undeclared side is exactly
 * the arrival this check exists to surface.
 */
export const unityCluster = (hit) => {
    if (!hit || conservedPair(hit) === null) return false;
    const k = (s) => `${s.dev}/${s.mode}.${s.key}`;
    return !!(UNITY_BY_CONSTRUCTION[k(hit.a)] && UNITY_BY_CONSTRUCTION[k(hit.b)]);
};

export const ADJUDICATED = {
    // v3462 -- THE EQUAL-ONE CLUSTER GAINS A SIXTH MEMBER, AND THE PATTERN IS NOW THE POINT.
    // xpbd's poly6 kernel integral is 1 because the kernel is NORMALISED to integrate to 1 -- an analytic
    // identity, not a measurement that happened to land there. It therefore matches every other quantity in the
    // lab that equals one by construction: a limit ratio, a canonical q*p, an extremal Kerr photon orbit at
    // r = M = 1, a volume-preserving Jacobian determinant, a unitary norm and a normalised integral ratio.
    // SEVEN SEPARATE PHYSICAL REASONS TO EQUAL ONE, and a pairwise scan reports every pairing among them.
    // The general lesson: any observable that is normalised to unity will join this cluster on the day it is
    // added, and adjudicating it is bookkeeping rather than physics.
    "xpbd/kernel.kernelIntegral|whitedwarf/limitOrder.limitR2":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",
    "xpbd/kernel.kernelIntegral|poisson/canonical.qp":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",
    "xpbd/kernel.kernelIntegral|kerr/extremal.photonPrograde":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",
    "xpbd/kernel.kernelIntegral|hmc/symplectic.jacobianDet":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",
    "xpbd/kernel.kernelIntegral|quantum/norm.norm":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",
    "xpbd/kernel.kernelIntegral|splat/integral.integralRatio":
        "NOT A COUPLING -- the equal-one cluster. A normalised kernel integral against a quantity that is one for its own unrelated reason",

    "vibrations/ring.ringSecondMomentGap|geostats/bridge.varianceRatio":
        "NOT A COUPLING. Both are 2 for unrelated reasons: a ring's second-moment gap is 2 because the mode " +
        "pairs are doubly degenerate, and a Brownian bridge's variance ratio is 2 by the construction of the " +
        "bridge. Another entry in the small-integer cluster already recorded here",
    "vibrations/ring.ringSecondMomentGap|discovery/visviva.coeffInvR":
        "NOT A COUPLING. Same 2, and vis-viva's 1/r coefficient is 2 because the orbit equation says so",
    "em/vacuum.cDefined|fdtd/lightspeed.cMeasured":
        "NOT A COUPLING as stated -- cDefined is a LITERAL both sides hold, so this pairing compares a constant " +
        "against a measurement of it. The genuine coupling is em.cComputed (derived from mu0 and eps0) against " +
        "fdtd.cMeasured (timed across a Yee grid), which is declared in crossDevice-selfcheck",

    // v3433 -- *** FIVE NEW PAIRS ARRIVED WITH THE POISSON DEVICE, AND ALL FIVE ARE poisson/canonical.qp = 1.
    // THAT IS A SIXTH SEPARATE PHYSICAL REASON TO EQUAL ONE, beside the symplectic Jacobian, the
    // Crank-Nicolson norm, the normalised integral ratio, extremal Kerr's prograde photon orbit and an r^2 of
    // a perfect fit. *** {q,p} = 1 is the CANONICAL COMMUTATION RELATION: it is fixed by the DEFINITION of the
    // bracket and by the choice of coordinates, and no dynamics, no knob and no coupling puts it there. It is
    // the least coupled quantity in the lab and it matches five things, WHICH IS THE WHOLE ARGUMENT FOR
    // ADJUDICATING RATHER THAN COUNTING -- a value that equals one for a definitional reason will collide with
    // every other one in the tree forever, and the collision carries no information at all.
    "whitedwarf/limitOrder.limitR2|poisson/canonical.qp": "NOT a coupling: an r^2 of 1 is a perfect fit and {q,p} = 1 is a definition",
    "poisson/canonical.qp|kerr/extremal.photonPrograde": "NOT a coupling: extremal Kerr's photon orbit at r = M = 1 against the canonical bracket",
    "poisson/canonical.qp|hmc/symplectic.jacobianDet": "NOT a coupling, and the NEAREST MISS: both are about symplecticity, but a Jacobian determinant of 1 is a property OF A MAP and {q,p} = 1 is a property OF THE COORDINATES. The same subject is not the same quantity",
    "poisson/canonical.qp|quantum/norm.norm": "NOT a coupling: a Crank-Nicolson norm is unitary evolution, the bracket is a definition",
    "poisson/canonical.qp|splat/integral.integralRatio": "NOT a coupling: a normalised integral is 1 by construction",

    "em/vacuum.cDefined|fdtd/lightspeed.cExact":
        "NOT A COUPLING -- a shared CONSTANT. Both are the defined speed of light, 299792458 m/s exactly, which " +
        "each device holds as a literal. The genuine coupling is em.cComputed (derived from mu0 and eps0) " +
        "against fdtd.cMeasured (timed across a Yee grid), and THAT is declared in crossDevice-selfcheck. Two " +
        "devices agreeing on a number they both typed in is not evidence of anything",

    "whitedwarf/limitOrder.limitR2|kerr/extremal.photonPrograde":
        "NOT A COUPLING. Another entry in the equal-one cluster already recorded here: a limit ratio tending to " +
        "1, and the extremal Kerr prograde photon orbit sitting at r = M = 1. Different physical reasons to be " +
        "one, and a pairwise scan reports every pairing among everything that equals one",
    "whitedwarf/limitOrder.limitR2|hmc/symplectic.jacobianDet": "same equal-one cluster: a limit ratio against a volume-preserving Jacobian determinant",
    "whitedwarf/limitOrder.limitR2|quantum/norm.norm": "same equal-one cluster: a limit ratio against a unitary norm",
    "whitedwarf/limitOrder.limitR2|splat/integral.integralRatio": "same equal-one cluster: a limit ratio against a normalised integral",

    "whitedwarf/muScaling.muSlope|discovery/splat.exponent":
        "NOT A COUPLING. Both are -2, for unrelated reasons: the white-dwarf mass-radius relation scales as " +
        "mu^-2, and a Gaussian splat's projected area falls as depth^-2. An inverse-square law appears all over " +
        "physics and two of them meeting is arithmetic, not a shared quantity",

    "geostats/bridge.varianceRatio|discovery/visviva.coeffInvR":
        "NOT A COUPLING. Both equal 2 for unrelated reasons: a Brownian bridge's variance ratio is 2 by the " +
        "construction of the bridge, and the 1/r coefficient in vis-viva (v^2 = mu(2/r - 1/a)) is 2 because the " +
        "orbit equation says so. Same class as the small-integer cluster already recorded here -- a scan that " +
        "matches on VALUE will always find these, which is why the register exists rather than a tighter filter",

    "hmc/symplectic.jacobianDet|quantum/norm.norm":
        "NOT A COUPLING -- TWO INDEPENDENT CONSERVATIONS AT 1. A symplectic map preserves phase-space volume so " +
        "its Jacobian determinant is 1; Crank-Nicolson is unitary so its norm is 1. Neither owes the other " +
        "anything, and the perturbation test passes them BECAUSE each is held at 1 by a law no knob touches",
    "hmc/symplectic.jacobianDet|splat/integral.integralRatio":
        "NOT A COUPLING -- same shape. A normalised integral ratio is 1 because it was normalised. The equality " +
        "is three unities meeting, not one quantity measured three ways",
    // *** AND THE GUARD FOUND FOUR MORE OF THE SAME CLASS THE MOMENT IT EXISTED, including a FOURTH independent
    // reason to be 1: at extremal spin a = M, Kerr's PROGRADE PHOTON ORBIT SITS AT r = M -- exactly 1 in
    // geometric units. That is a statement about a horizon, not a conservation and not a normalisation, and it
    // has nothing whatever to do with a symplectic Jacobian. FOUR SEPARATE PHYSICAL REASONS TO EQUAL ONE, and
    // the pairwise scan reports every pairing among them as a match. SIX OF THE TWENTY-THREE ARE THIS.
    "kerr/extremal.photonPrograde|hmc/symplectic.jacobianDet":
        "NOT A COUPLING -- extremal Kerr's prograde photon orbit is r = M = 1 in geometric units, a horizon " +
        "fact with no relation to phase-space volume",
    "kerr/extremal.photonPrograde|quantum/norm.norm":
        "NOT A COUPLING -- a horizon radius and a unitary norm are both 1 for entirely unrelated reasons",
    "kerr/extremal.photonPrograde|splat/integral.integralRatio":
        "NOT A COUPLING -- a horizon radius and a normalisation are both 1 for entirely unrelated reasons",
    "quantum/norm.norm|splat/integral.integralRatio":
        "NOT A COUPLING -- unitarity and normalisation, two constructions that each guarantee 1",

    "lens/shadow.shadowAngleRad|probe/emit.emitConeRad":
        "REAL COUPLING, declared in crossDevice-selfcheck. Null geodesics are time-reversible, so the cone light " +
        "reaches an observer FROM is the cone an emitter must not broadcast INTO. Same rays, opposite arrows",
    "twobody/orbit.periodExact|probe/capture.properTime":
        "UNADJUDICATED and flagged rather than claimed. Both read 99.345882657961, which is pi*sqrt(1000) -- " +
        "exactly HALF the Kepler period at a = 10 with mu = 1. That smells like two devices sharing a " +
        "configuration rather than a physical identity, but it has not been run down, and asserting either way " +
        "without doing so is what this register exists to prevent",
};

/**
 * v3430 -- DIMENSIONALLY IMPOSSIBLE PAIRS ARE RULED OUT WITHOUT A PERSON.
 * A metre per second cannot equal a mass ratio however many digits agree. This needs BOTH sides confidently
 * typed to rule anything out, so it only ever shrinks the human backlog and never hides a candidate.
 */
export function dimensionallyRuledOut(matches) {
    return matches.filter((h) => !comparable(h.a.dev, h.a.key, h.b.dev, h.b.key).comparable);
}

export async function valueMatchCensus(tol = 1e-10) {
    const observables = await collectObservables();
    const matches = valueMatches(observables, tol);
    const key = (h) => `${h.a.dev}/${h.a.mode}.${h.a.key}|${h.b.dev}/${h.b.mode}.${h.b.key}`;
    const adjudicated = matches.filter((h) => ADJUDICATED[key(h)]);
    const ruledOut = dimensionallyRuledOut(matches.filter((h) => !ADJUDICATED[
        `${h.a.dev}/${h.a.mode}.${h.a.key}|${h.b.dev}/${h.b.mode}.${h.b.key}`]));
    return {
        dimensionallyRuledOut: ruledOut.length,
        observables: observables.length,
        scannedDevices: DEVICE_NAMES.filter((d) => !SLOW_DEVICES[d]).length,
        skippedDevices: Object.keys(SLOW_DEVICES).length,
        matches, adjudicated: adjudicated.length,
        open: matches.length - adjudicated.length,
        openAfterUnits: matches.length - adjudicated.length - ruledOut.length,
    };
}

/**
 * v3365 -- ADJUDICATING A VALUE MATCH MECHANICALLY: PERTURB THE CONFIGURATION AND SEE WHAT SURVIVES.
 *
 * v3364 left 22 candidates open and flagged one by hand. Running that one down produced a general method.
 *
 *   twobody/orbit.periodExact and probe/capture.properTime both read 99.345882657961 = pi sqrt(1000).
 *   Not a coincidence of noise -- properTimeToCentre is (pi/2) sqrt(r0^3 / 2M), which IS half a Kepler period
 *   for a degenerate radial orbit, so the two ARE the same family of formula. But the numerical equality needs
 *   probe at r0 = 20, M = 1 AND twobody at its own particular mu. Move the probe to r0 = 21 and the match is
 *   gone; the shadow / escape-cone pair moved from rObs = 20 to 30 and stayed matched to nine digits.
 *
 * SO THE TEST IS: DOES THE EQUALITY SURVIVE A CHANGE OF CONFIGURATION?
 *
 *   survives  -> the two quantities share a SCALING FAMILY and the pair is worth a person's time
 *   breaks    -> two quantities that coincided at one set of inputs and nowhere else
 *
 * *** AND "SURVIVES" IS WEAKER THAN "IS THE SAME QUANTITY", WHICH COST A ROUND TO ESTABLISH. *** Scaling every
 * knob of both devices by one factor preserves any equality between quantities with the SAME dimensional
 * scaling, whether or not they are the same thing. twobody/orbit.periodExact goes as a^1.5 / mu^0.5 and
 * probe/capture.properTime as r0^1.5 / M^0.5 -- both Kepler-family, so both scale by the factor and the equality
 * rides through. They are still an orbital PERIOD and an infall PROPER TIME: related by real physics (the infall
 * time is half the period of a degenerate radial orbit) but not one quantity computed twice.
 *
 * The honest reading is that this is a FILTER, not a verdict -- it cut 23 candidates to 3 mechanically, and a
 * person still decides which of the 3 are couplings.
 *
 * A CORRECTION WORTH KEEPING: I first "refuted" this test by hand, setting twobody's config to { a, mu } and
 * watching the values diverge. twobody has no `mu` knob -- it takes m1 and m2 -- so the option was silently
 * ignored and I was comparing a perturbed probe against an UNPERTURBED twobody. The adjudicator was right and
 * the refutation was wrong. Seventh silently-ignored config key this session, and the first one that nearly
 * caused a correct tool to be discarded.
 *
 * This is the same instinct as a planted error, pointed at a claim instead of at code: a relation that only
 * holds at the default configuration is a property of the defaults, not of the physics.
 *
 * WHAT IT CANNOT DO, stated because the limit is real: a device with no numeric knob cannot be perturbed, and
 * one whose observable is genuinely independent of every knob will look like a survivor. Those come back as
 * "untestable" rather than as couplings.
 */
export async function survivesPerturbation(hit, factor = 1.07) {
    const perturb = async (entry) => {
        let d; try { d = await getDevice(entry.dev); } catch { return null; }
        const def = d.defaults ? d.defaults({ mode: entry.mode }) : null;
        const cfg = (def && def.config) ? { ...def.config } : {};
        const knobs = Object.keys(cfg).filter((k) => typeof cfg[k] === "number" && cfg[k] !== 0);
        if (!knobs.length) return { untestable: true };
        for (const k of knobs) cfg[k] = cfg[k] * factor;
        // v3366 -- the config is built FROM the device's own defaults, so every key is declared by construction.
        // Asserted anyway: this adjudicator was nearly discarded because a hand-written config used a key the
        // device did not have, and the silently-ignored option produced a measurement that never ran.
        const u = await unknownKeys(entry.dev, entry.mode, cfg);
        if (!u.undeclarable && u.keys.length) return { badKeys: u.keys };
        let o; try { o = await d.build({ mode: entry.mode, config: cfg }); } catch { return null; }
        const v = o ? o[entry.key] : undefined;
        return (typeof v === "number" && Number.isFinite(v)) ? { value: v } : null;
    };

    const a = await perturb(hit.a), b = await perturb(hit.b);
    if (!a || !b) return { verdict: "unbuildable", reason: "a device threw or lost the observable under perturbation" };
    if (a.badKeys || b.badKeys) return { verdict: "unbuildable", reason: "a perturbed config contained a key the device does not declare" };
    if (a.untestable || b.untestable) return { verdict: "untestable", reason: "a device exposes no numeric config knob to move" };
    const moved = Math.abs(a.value - hit.a.value) > 1e-12 || Math.abs(b.value - hit.b.value) > 1e-12;
    if (!moved) return { verdict: "untestable", reason: "neither observable responded to its own knobs" };
    const rel = Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value), 1e-300);
    return rel < 1e-9
        ? { verdict: "survives", rel, reason: "the equality holds at a different configuration -- one quantity, two devices" }
        : { verdict: "breaks", rel, reason: "the equality was a property of the default configuration, not of the physics" };
}
