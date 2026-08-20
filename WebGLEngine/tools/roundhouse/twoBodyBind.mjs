// tools/roundhouse/twoBodyBind.mjs
//
// v2937 -- THE TWO-BODY BARYCENTRIC DEVICE. The first genuinely two-body scene in the lab: two masses orbiting
// their shared centre of mass, integrated DIRECTLY in each other's field (not via the relative-coordinate
// shortcut, which would make barycentre-fixity vacuous). Stage one of the recommended inspiral design -- a
// proven, closed-form-graded foundation on which the radiative Peters-merger scene can later be built.
//
// THE THREE ANSWER KEYS, each exact and none written into the integrator:
//   ratio     -- a1/a2 = m2/m1 EXACTLY. The heavier body moves less, in exact inverse proportion. A pure
//                dimensionless ratio, so it is a sharp test with no unit slack.
//   period    -- T = 2 pi sqrt(a^3 / (G(m1+m2))). Kepler III with TOTAL mass -- the observable that distinguishes
//                a real two-body system from a test particle, where only a fixed central mass would enter.
//   bcDrift   -- the barycentre stays at the origin. A NEW conserved quantity no other device checks, and a real
//                test only because both bodies are integrated independently: symplectic Verlet conserves the
//                momentum that holds R_cm fixed, but only to ~1e-14 from accumulated rounding, which is the
//                honest signature of a correct integration -- not the structural 0 the relative-coordinate
//                shortcut would have produced.
//
// MODES:
//   "orbit"   -- the headline: one asymmetric binary (m1=3, m2=1), all three keys graded at once.
//   "ratio"   -- sweep the mass ratio; a1/a2 must track m2/m1 across the range, machine-exact.
//   "conserve"-- the barycentre-fixity gate, graded against near-zero with the resolution dependence stated.

import { integrateTwoBody, setupTwoBody } from "../../physics/orbits/twoBody.js";

export const TWOBODY_OBSERVABLES = [
    "ratioMeasured", "ratioExact", "ratioErrFrac",
    "periodMeasured", "periodExact", "periodErrFrac",
    "barycentreDriftFrac", "netMomentum",
    "m1", "m2", "massRatio", "periods", "planted",
];

const DEF = { m1: 3, m2: 1, a: 10, e: 0.3, stepsPerOrbit: 400, orbits: 40 };

function buildTwoBody({ mode = "orbit", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // guardrails: masses positive, eccentricity strictly bound, so the orbit closes and the keys apply
    c.m1 = Math.max(1e-6, c.m1); c.m2 = Math.max(1e-6, c.m2);
    c.e = Math.min(0.95, Math.max(0, c.e));

    // v3401 -- the plant grades against Kepler III with the PRIMARY mass. See physics/orbits/twoBody.js.
    c.keyMass = c.planted ? "primary" : "total";
    const plantedFlag = !!c.planted;

    if (mode === "ratio") {
        // one build reports the ratio for the configured masses; the sweep across masses is the census/gate's job
        const r = integrateTwoBody(c);
        return {
            ratioMeasured: r.ratioMeasured, ratioExact: r.ratioExact, ratioErrFrac: r.ratioErrFrac,
            m1: c.m1, m2: c.m2, massRatio: c.m2 / c.m1, periods: r.periods, planted: plantedFlag, planted: plantedFlag,
        };
    }

    if (mode === "conserve") {
        const r = integrateTwoBody(c);
        return {
            barycentreDriftFrac: r.barycentreDriftFrac, netMomentum: r.netMomentum,
            periodErrFrac: r.periodErrFrac, m1: c.m1, m2: c.m2, periods: r.periods, planted: plantedFlag,
        };
    }

    // "orbit": the full headline, all three keys at once
    const r = integrateTwoBody(c);
    return {
        ratioMeasured: r.ratioMeasured, ratioExact: r.ratioExact, ratioErrFrac: r.ratioErrFrac,
        periodMeasured: r.periodMeasured, periodExact: r.periodExact, periodErrFrac: r.periodErrFrac,
        barycentreDriftFrac: r.barycentreDriftFrac, netMomentum: r.netMomentum,
        m1: c.m1, m2: c.m2, massRatio: c.m2 / c.m1, periods: r.periods, planted: plantedFlag,
    };
}

function twoBodyDefaults({ mode } = {}) {
    // v3190 -- THIS ECHOED BACK ANY STRING, so checkMode (v3144, built to REFUSE an undeclared mode) refused
    // NOTHING here. THE MODES ARE NOT INVENTED: they are this file's own default plus every mode its own
    // build() branches on, and each was verified to produce a DISTINCT answer before being declared -- a
    // branch that changed nothing would be a mode in name only.
    const MODES = ["orbit", "conserve", "ratio"];
    return { mode: MODES.includes(mode) ? mode : "orbit", config: { ...DEF } };
}

export const twoBodyDevice = {
    // v3401 -- KNOB PLANT: a wrong CLOSED FORM (Kepler III with the primary mass) upstream of the comparison.
    plantKind: "knob",
    name: "two-body-barycentric",
    // v3190 -- EXPORTED so the census does not have to GUESS. A probed list is a LOWER BOUND: you can only
    // ask about a mode you already thought of, and this device's own names were not in anyone's candidate
    // list, so it under-reported as one-moded until it said so itself.
    modes: ["orbit", "conserve", "ratio"], observables: TWOBODY_OBSERVABLES, build: buildTwoBody, defaults: twoBodyDefaults };
