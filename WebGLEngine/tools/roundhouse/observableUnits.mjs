// tools/roundhouse/observableUnits.mjs
//
// v3430 -- THE LAB HAS 1129 DECLARED OBSERVABLES AND NOT ONE OF THEM SAYS WHAT IT IS MEASURED IN.
//
// Every observable is a bare number. That is why the value-match census has to ask a person whether two
// agreeing numbers are the same QUANTITY -- it has no way to ask whether they are even commensurable. Half the
// open backlog pairs something dimensionless against something with dimensions, and a metre per second cannot
// equal a mass ratio no matter how many digits agree.
//
// *** THIS IS INFERENCE, NOT DECLARATION, AND THE DIFFERENCE MATTERS. *** The right fix is for each device to
// declare units alongside its observables. That is 66 files of work and a contract change. What is cheap now is
// to INFER a dimension from the observable's NAME, and inference can be wrong -- so it is built to fail safe:
//
//   CONSERVATIVE BY DEFAULT     anything not confidently recognised is "unknown", never "dimensionless".
//   REJECT ONLY ON CONFIDENCE   a pair is ruled incomparable only when BOTH sides are confidently typed AND
//                               their dimensions differ. One unknown side and the pair stays open.
//   EXPLICIT BEATS INFERRED     DECLARED entries override the name patterns, so a device can be made exact
//                               without waiting for all 66.
//
// A wrong inference that rejected a real coupling would be worse than the noise it removes, which is why the
// asymmetry runs that way: this tool can only ever move a candidate from OPEN to REJECTED, and it needs two
// confident readings to do it.

/** Dimensional signatures, as strings. "1" is dimensionless. Comparison is string equality. */
export const DIM = {
    NONE: "1", LENGTH: "m", TIME: "s", MASS: "kg", SPEED: "m/s", ACCEL: "m/s^2",
    FREQ: "1/s", ANGLE: "rad", ENERGY: "J", TEMP: "K", PRESSURE: "Pa", COUNT: "#",
    UNKNOWN: "?",
};

/**
 * Explicit declarations. These are read FIRST and are how a device becomes exact.
 * Keyed "device.observable" or bare "observable" for a name used consistently across devices.
 */
export const DECLARED = {
    "em.cComputed": DIM.SPEED, "em.cDefined": DIM.SPEED, "em.z0": "ohm",
    "em.index": DIM.NONE, "em.phaseSpeed": DIM.SPEED, "em.criticalAngleDeg": "deg",
    "acoustics.cAir": DIM.SPEED, "acoustics.cWater": DIM.SPEED, "acoustics.cGranite": DIM.SPEED,
    "acoustics.cNewton": DIM.SPEED, "acoustics.laplaceRatio": DIM.NONE,
    "seismic.vpvs": DIM.NONE, "seismic.vsFluid": DIM.SPEED, "seismic.vpFluid": DIM.SPEED,
    "seismic.turningDepth": DIM.LENGTH, "seismic.arcRadius": DIM.LENGTH,
    "clocks.staticRate": DIM.NONE, "clocks.orbitingRate": DIM.NONE,
    "clocks.periodPro": DIM.TIME, "clocks.periodRetro": DIM.TIME, "clocks.clockEffect": DIM.TIME,
    "nuclear.peakPerNucleon": "MeV", "nuclear.fissionQ": "MeV",

    // v3430b -- DECLARED BECAUSE INFERENCE COULD NOT REACH THEM. The first run ruled ZERO pairs incomparable:
    // 67 of 100 matched observables came back UNKNOWN, so almost no pair had both sides confidently typed. Name
    // patterns only ever covered a third of the surface, which is the honest limit of inference and the reason
    // declaration is the real fix. These are the untyped names that actually appear in the open backlog, read
    // off the census rather than guessed at.
    "beam.closedFormAtUnitL": DIM.LENGTH,          // a tip deflection evaluated at unit length -- a length
    "splat.radialVsZAgreement": DIM.NONE,          // an agreement between two profiles -- a pure ratio
    "probe.transferEcc": DIM.NONE,                 // orbital eccentricity is dimensionless by definition
    "pulsar.P0": DIM.TIME,                         // spin period
    "fdtd.cMeasured": DIM.SPEED, "fdtd.cExact": DIM.SPEED,
    "em.indexSpeedProduct": DIM.SPEED,             // n * v_phase, which must come out as c
    "kepler.slopeMeasured": DIM.NONE,              // a log-log slope
    "discovery.exponent": DIM.NONE,                // a fitted power
    "lens.shadowAngleExact": DIM.ANGLE,
    "em.betaThreshold": DIM.NONE, "em.betaThresholdRecovered": DIM.NONE,
};

/**
 * Name patterns, in priority order. Only patterns that are UNAMBIGUOUS appear here -- a name that could go
 * either way is deliberately left to fall through to UNKNOWN.
 */
const PATTERNS = [
    [/(Frac|Fraction|Ratio|Rate)$/i, DIM.NONE],
    [/^(ratio|frac)/i, DIM.NONE],
    [/(ErrFrac|RelDiff|Residual|Disagree)/i, DIM.NONE],
    [/(Prob|Probability|Coverage|Efficiency)$/i, DIM.NONE],
    [/(Count|Steps|Samples|Iterations|Trials|Points|Legs|Stations|Cells|Reps|Orbits)$/i, DIM.COUNT],
    [/(Deg|Degrees)$/i, "deg"],
    [/(AngleRad|ConeRad|Rad)$/i, DIM.ANGLE],
    [/(Speed|Velocity)$/i, DIM.SPEED],
    [/(Period|Time)$/i, DIM.TIME],
    [/(Radius|Depth|Distance|Length)$/i, DIM.LENGTH],
    [/^(is|has|all|any|does|can|matches|holds|closes|arrived|captured|plunges)/i, "bool"],
];

/** Dimension of one observable. Explicit first, then patterns, then UNKNOWN. */
export function dimensionOf(device, observable) {
    const exact = DECLARED[`${device}.${observable}`] ?? DECLARED[observable];
    if (exact) return { dim: exact, source: "declared" };
    for (const [re, d] of PATTERNS) if (re.test(observable)) return { dim: d, source: "inferred" };
    return { dim: DIM.UNKNOWN, source: "unknown" };
}

/**
 * Can two observables possibly be the same quantity?
 * Returns false ONLY when both are confidently typed and disagree. Any uncertainty leaves the pair comparable,
 * so this can move a candidate from open to rejected and never the reverse.
 */
export function comparable(devA, obsA, devB, obsB) {
    const a = dimensionOf(devA, obsA), b = dimensionOf(devB, obsB);
    if (a.dim === DIM.UNKNOWN || b.dim === DIM.UNKNOWN) {
        return { comparable: true, confident: false, reason: "at least one side is untyped -- left open" };
    }
    if (a.dim === b.dim) return { comparable: true, confident: true, a: a.dim, b: b.dim, reason: "same dimension" };
    return { comparable: false, confident: true, a: a.dim, b: b.dim,
             reason: `${a.dim} cannot equal ${b.dim}` };
}

/** Coverage: how much of the observable surface carries a dimension at all. */
export function unitCoverage(entries) {
    const out = { declared: 0, inferred: 0, unknown: 0, total: 0 };
    for (const { dev, key } of entries) {
        const d = dimensionOf(dev, key);
        out.total++;
        out[d.source === "declared" ? "declared" : d.source === "inferred" ? "inferred" : "unknown"]++;
    }
    return out;
}
