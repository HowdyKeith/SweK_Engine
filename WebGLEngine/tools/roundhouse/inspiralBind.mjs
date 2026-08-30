// tools/roundhouse/inspiralBind.mjs
//
// v2938 -- THE GRAVITATIONAL-WAVE INSPIRAL DEVICE. The lab's first radiative-physics scene: a circular binary
// radiating gravitational waves and spiralling in, graded against Peters (1964). Stage two of the two-body
// design, built on v2937's barycentric orbit. The physics behind the Hulse-Taylor pulsar and every LIGO event.
//
// THE ANSWER KEYS, both exact closed forms:
//   merger   -- t_merge = (5/256) c^5 a0^4 / (G^3 m1 m2 (m1+m2)), the time from a0 to coalescence.
//   traj     -- a(t)^4 = a0^4 - (256/5)G^3 m1 m2 (m1+m2)/c^5 t, the whole shrinking trajectory. Graded in the
//               BULK (t < 0.99 t_merge), because the last 1% is a coordinate region where a is tiny and relative
//               error amplifies against a vanishing denominator -- a floor artefact, not a secular-rate failure.
//               The endpoint is covered by the merger key instead.
//
// The device exists because the two traps this scene sets -- the a->0 singularity (a fixed step overshoots to
// negative a; solved by an adaptive step ~a^4) and the secular "converged but wrong" trap (guarded by grading
// the trajectory throughout, not just the endpoint) -- are exactly the kind the roundhouse is built to catch,
// and both were characterised before the device was written.
//
// MODES:
//   "merger"  -- the headline: measured merger time vs the Peters closed form.
//   "track"   -- the trajectory: worst bulk deviation of a(t) from Peters a(t) along the whole inspiral.

import { integrateInspiral, mergerTimeExact, semiMajorExact } from "../../physics/orbits/inspiral.js";

export const INSPIRAL_OBSERVABLES = [
    "mergerMeasured", "mergerExact", "mergerErrFrac",
    "worstBulkErrFrac", "worstBulkAt", "worstTrajErrFrac",
    "m1", "m2", "a0", "steps", "finalA",
    "planted", "ratePower", "a0Exponent",
];

const DEF = { m1: 3, m2: 1, a0: 10, stopFrac: 0.01, safety: 0.01, plantedPower: 4 };

function buildInspiral({ mode = "merger", config = {} } = {}) {
    const c = { ...DEF, ...config };
    c.m1 = Math.max(1e-6, c.m1); c.m2 = Math.max(1e-6, c.m2);
    c.a0 = Math.max(1e-3, c.a0);
    c.safety = Math.min(0.05, Math.max(1e-4, c.safety));

    // v3392 -- THE PLANT IS A WRONG POWER LAW WITH ITS OWN MATCHING CLOSED FORM, so the tautology survives it.
    const ratePower = c.planted ? c.plantedPower : 3;
    const r = integrateInspiral({ ...c, ratePower });
    // The scaling key, measured from the integrator alone: t ~ a0^(p+1), read off two runs and a ratio. NOTHING
    // ANALYTIC IS COMPARED AGAINST, which is exactly why it survives a plant that cancels in the residual.
    const tAt = (a0) => integrateInspiral({ ...c, a0, ratePower }).mergerMeasured;
    const a0Exponent = Math.log(tAt(2 * c.a0) / tAt(c.a0)) / Math.LN2;

    if (mode === "track") {
        return {
            worstBulkErrFrac: r.worstBulkErrFrac, worstBulkAt: r.worstBulkAt,
            worstTrajErrFrac: r.worstTrajErrFrac,
            m1: c.m1, m2: c.m2, a0: c.a0, steps: r.steps,
            planted: !!c.planted, ratePower, a0Exponent,
        };
    }

    // "merger": the headline
    return {
        mergerMeasured: r.mergerMeasured, mergerExact: r.mergerExact, mergerErrFrac: r.mergerErrFrac,
        worstBulkErrFrac: r.worstBulkErrFrac,
        m1: c.m1, m2: c.m2, a0: c.a0, steps: r.steps, finalA: r.finalA,
        planted: !!c.planted, ratePower, a0Exponent,
    };
}

function inspiralDefaults({ mode } = {}) {
    // v3190 -- THIS ECHOED BACK ANY STRING, so checkMode (v3144, built to REFUSE an undeclared mode) refused
    // NOTHING here. THE MODES ARE NOT INVENTED: they are this file's own default plus every mode its own
    // build() branches on, and each was verified to produce a DISTINCT answer before being declared -- a
    // branch that changed nothing would be a mode in name only.
    const MODES = ["merger", "track"];
    return { mode: MODES.includes(mode) ? mode : "merger", config: { ...DEF } };
}

export const inspiralDevice = { name: "gw-inspiral-peters",
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4126 -- NAMED, THE SAME COMPLETION v3851/v4088-v4125 gave the rest of this family. MEASURED, merger mode
    // (default) both arms: mergerErrFrac 6.41e-9 -> 1.70e-8 and worstBulkErrFrac 1.53e-7 -> 3.22e-7 -- SAME ORDER
    // both arms, confirming the header's own claim that these are tautologically blind (the wrong power law is
    // graded against its own matching closed form). a0Exponent is the one observable that compares nothing
    // analytic at all -- it is measured purely from two independent integrator runs at a0 and 2a0 -- and it
    // moves cleanly and exactly: 4 -> 5 (ratePower+1, an integer both arms, not an approximation).
    planted: { knob: "planted", observable: "a0Exponent",
               note: "a wrong power law (plantedPower, default 4, in place of Peters' 3) drives the shrink rate da/dt ~ -K/a^p -- and it comes with its OWN matching closed form, so mergerErrFrac and worstBulkErrFrac stay tautologically small under the plant (same order as honest: the integrator is graded against the very law it used). a0Exponent alone compares two measured runs to each other with no closed form in the loop, and reads the true power directly: 4 under Peters, 5 under the plant" },
    // v3190 -- EXPORTED so the census does not have to GUESS. A probed list is a LOWER BOUND: you can only
    // ask about a mode you already thought of, and this device's own names were not in anyone's candidate
    // list, so it under-reported as one-moded until it said so itself.
    modes: ["merger", "track"], observables: INSPIRAL_OBSERVABLES, build: buildInspiral, defaults: inspiralDefaults };
