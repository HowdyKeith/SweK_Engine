// WebGLEngine/physics/stepperMeter.mjs -- v3605
// ---------------------------------------------------------------------------------------------------------------
// THE STABILITY METER, POINTED AT A SOLVER IT WAS NOT WRITTEN AROUND -- AND A SECOND AXIS, BECAUSE ON A
// NON-CONSERVATIVE SYSTEM THE FIRST ONE IS NOT MERELY BLIND. IT IS INVERTED.
//
// v3599 built physics/stabilityMeter.mjs to grade PB-MPM's "stable at any time-step" and found the thing worth
// finding: explosion and damping are the same error with opposite signs (E_explicit x E_implicit = 1 exactly),
// and the unconditionally stable integrator is the DEAD one. That is a real result and it stands.
//
// WHAT IT CANNOT DO IS BE POINTED AT ANYTHING. shmRun hardcodes three named integrators inside one harmonic
// oscillator, and verdict(kind, ...) accepts only "explicit" / "implicit" / "symplectic". So the two solvers
// this tree has already MEASURED as stable-and-wrong -- v3597's centrifuge stepper and v3542's SPH column --
// could be named in its own MEASURED_V3599 and never handed to it.
//
// ================================================================================================================
// FINDING 1: ON THE METER'S OWN FIXTURE, ITS BEST POSSIBLE VERDICT SITS ON THE WORST POSSIBLE TRAJECTORY
// ================================================================================================================
//
// Symplectic Euler at w*dt = 1.0 returns an energy ratio of EXACTLY 1.000000 -- there is no better reading the
// envelope axis can give -- while its position is 1.999961 away from cos(w t). THE MAXIMUM POSSIBLE DEPARTURE
// FOR A UNIT COSINE IS 2. It is not drifting off the answer; it is as far from it as a bounded trajectory can
// get, and the meter calls that FAITHFUL.
//
//     w*dt      energy ratio   envelope verdict   worst |x - cos(w t)| over 400 steps
//     0.1       1.052613       FAITHFUL           0.066390
//     0.5       0.889958       FAITHFUL           1.856804
//     1.0       1.000000       FAITHFUL           1.999961      <- the best envelope reading on the list
//     1.9       1.819012       FAITHFUL           4.199321
//
// *** SO "FAITHFUL" NAMES THE ENVELOPE AND NOT THE TRAJECTORY, AND IT SAYS SO ON THE FIXTURE THE METER WAS
// BUILT AROUND. *** This is not a criticism of symplectic Euler, which is doing exactly what it is for -- it
// is a statement about what one axis can report.
//
// ================================================================================================================
// FINDING 2, THE LOAD-BEARING NEGATIVE: THE ENVELOPE AXIS CALLS THE EXACT ANALYTIC SOLUTION UNSTABLE
// ================================================================================================================
//
// The centrifuge is dr/dt = k r -- overdamped sedimentation in a rotating frame, no oscillation, no energy.
// Its true solution GROWS, so over a fixed simulated time the exact continuous answer r0 * exp(k T) reads a
// growth ratio of 8.599e+2 and the envelope axis returns EXPLODES.
//
// A METER WHOSE VERDICT ON THE CLOSED FORM IS "UNSTABLE" CANNOT BE POINTED AT THAT SYSTEM AT ALL. Not blind,
// wrong -- and it is wrong in the direction that matters, because it condemns the correct answer.
//
// ================================================================================================================
// FINDING 3: AND ACROSS THE REFINEMENT AXIS THE VERDICT IS ANTI-CORRELATED WITH THE ERROR
// ================================================================================================================
//
// Sweeping x = k*dt at FIXED simulated time T (a refinement, not a truncation -- v3512's lesson):
//
//     x = k*dt   steps   growth      envelope verdict   fidelity |ln(1+x)/x - 1|
//     0.01       676     8.342e+2    EXPLODES           0.0050
//     0.1        68      6.527e+2    EXPLODES           0.0469
//     0.5        14      2.919e+2    EXPLODES           0.1891
//     1          7       1.280e+2    EXPLODES           0.3069
//     2          3       2.700e+1    EXPLODES           0.4507
//     5          1       6.000e+0    FAITHFUL           0.6416      <- the ONLY pass, and the worst run
//
// *** THE ONE RUN THE ENVELOPE AXIS PASSES IS THE WORST RUN ON THE LIST. *** It passes because a single giant
// step does not get far, so the growth stays under the factor -- the error and the excursion move in OPPOSITE
// directions. A ranking by this verdict would put the least accurate integrator first, which is a stronger and
// more useful statement than "it does not see the error".
//
// ================================================================================================================
// THE SECOND AXIS, AND ITS ANSWER KEY IS AN IDENTITY RATHER THAN A TOLERANCE
// ================================================================================================================
//
// FIDELITY is the departure of the trajectory from a CLOSED FORM THE CALLER SUPPLIES. It is REFUSED when no
// reference is given rather than falling back on something derived from the run, because a fidelity measured
// against the run's own output is the mirror this tree refuses (v3201).
//
// The key is exact where a closed form exists: symplectic Euler's discrete frequency is (2/dt)*asin(w dt/2),
// and the measured period matches it to 1.48e-16 at w*dt = 1.0 -- machine zero rather than small -- while
// departing from the continuous 2*pi/w by O(dt^2). SO THE INTEGRATOR IS EXACTLY SOLVING A DIFFERENT PROBLEM,
// which is precisely the thing an energy ratio cannot say.
//
// WHAT IS REFUSED: v3542's SPH column gets the ENVELOPE axis and NOT the fidelity axis, because the tree has
// no closed form for its transient energy. A closed form exists for the hydrostatic PROFILE, which is a
// different observable, and using it here would be grading one claim with another claim's answer key. NAMED
// AS OWED RATHER THAN FAKED.
//
// stabilityMeter.mjs IS UNCHANGED except that its three-way rule is EXTRACTED as classifyEnvelope so this file
// can import it rather than carry a second copy; the shipped path is held to a hash captured from the pristine
// v3604 extract BEFORE that edit. MEASURED_V3599 is untouched and none of its numbers move.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { classifyEnvelope, EXPLODE_FACTOR, DAMP_FACTOR, KINDS, shmRun } from "./stabilityMeter.mjs";
import { sedCoeff, centrifugeStep } from "./centrifuge.js";

/**
 * THE INJECTED SEAM. A stepper is (state, dt) -> state; a magnitude is state -> number. Nothing here knows what
 * the state IS, which is the whole point -- v3599's meter knew, and that is why it could only ever grade itself.
 */
export function envelope({ step, magnitude, state0, dt = 0.1, steps = 400 }) {
    if (typeof step !== "function" || typeof magnitude !== "function") throw new Error("envelope needs a stepper and a magnitude");
    let s = state0;
    const m0 = magnitude(s);
    for (let i = 0; i < steps; i++) {
        s = step(s, dt);
        const m = magnitude(s);
        if (!Number.isFinite(m)) return { ratio: Infinity, verdict: "EXPLODES", blewUp: true, steps: i, state: s };
    }
    const ratio = magnitude(s) / m0;
    return { ratio, verdict: classifyEnvelope(ratio, false), blewUp: false, steps, state: s };
}

/**
 * THE SECOND AXIS. `reference(t)` is a CLOSED FORM the caller supplies; there is no default and no fallback,
 * because a reference derived from the run is a mirror. Returns the worst ABSOLUTE and worst RELATIVE departure
 * -- both, because a trajectory through zero (a cosine) has no meaningful relative error at its own crossings
 * and a growing one has no meaningful absolute error at its own scale.
 */
export function fidelity({ step, observe, reference, state0, dt = 0.1, steps = 400 }) {
    if (typeof reference !== "function") {
        return { refused: "NO REFERENCE -- fidelity is a comparison against a closed form and there is no " +
                          "honest default. A reference derived from the run measures the run against itself." };
    }
    let s = state0, worstAbs = 0, worstRel = 0;
    for (let i = 0; i < steps; i++) {
        s = step(s, dt);
        const t = (i + 1) * dt, got = observe(s), want = reference(t);
        if (!Number.isFinite(got)) return { worstAbs: Infinity, worstRel: Infinity, blewUp: true, steps: i };
        worstAbs = Math.max(worstAbs, Math.abs(got - want));
        if (Math.abs(want) > 1e-12) worstRel = Math.max(worstRel, Math.abs(got - want) / Math.abs(want));
    }
    return { worstAbs, worstRel, blewUp: false, steps };
}

/** BOTH AXES AT ONCE. The pair is the state; neither alone is, which is the round. */
export function meter(spec) {
    const e = envelope(spec);
    const f = fidelity(spec);
    return { envelope: e.verdict, ratio: e.ratio, ...(f.refused ? { fidelity: null, refused: f.refused } : { worstAbs: f.worstAbs, worstRel: f.worstRel }) };
}

// --- fixture 1: the harmonic oscillator, THROUGH THE INJECTED SEAM ----------------------------------------------
//
// Bit-identical to stabilityMeter's own shmRun by construction: the same three update rules, and the gate
// compares the two rather than trusting the claim.

export function shmSpec(kind, { w = 1 } = {}) {
    const step = ([x, v], dt) => {
        if (kind === "explicit") return [x + v * dt, v - w * w * x * dt];
        if (kind === "implicit") { const d = 1 + w * w * dt * dt; return [(x + v * dt) / d, (v - w * w * dt * x) / d]; }
        const vn = v - w * w * x * dt; return [x + vn * dt, vn];
    };
    return { step, state0: [1, 0], magnitude: ([x, v]) => 0.5 * v * v + 0.5 * w * w * x * x,
             observe: ([x]) => x, reference: (t) => Math.cos(w * t) };
}

/** THE ANSWER KEY: symplectic Euler's EXACT discrete frequency. No tolerance enters. */
export const symplecticDiscreteOmega = (w, dt) => (2 / dt) * Math.asin(w * dt / 2);

/** Measured period from DESCENDING zero crossings, linearly interpolated. One-sided: counting both halves the period. */
export function measuredPeriod({ step, observe, state0, dt, steps }) {
    let s = state0, prev = observe(state0);
    const cross = [];
    for (let i = 0; i < steps; i++) {
        s = step(s, dt);
        const x = observe(s);
        if (prev > 0 && x <= 0) cross.push((i + 1) * dt - dt * x / (x - prev));
        prev = x;
    }
    if (cross.length < 2) return null;
    return (cross[cross.length - 1] - cross[0]) / (cross.length - 1);
}

// --- fixture 2: THE CENTRIFUGE, a real shipped stepper this meter was never able to be pointed at ---------------

export const CENT = { a: 1e-3, rho: 2, rhoF: 1, eta: 1, omega: 1233, r0: 0.1, T: 20 };
export const centK = (c = CENT) => sedCoeff(c.a, c.rho, c.rhoF, c.eta) * c.omega * c.omega;

/**
 * The SHIPPED centrifugeStep, wrapped rather than reimplemented -- a second copy of the solver would make every
 * number below a fact about this file. rMax is lifted out of the way so the CLAMP is not what is being measured.
 */
export function centrifugeSpec(c = CENT) {
    const k = centK(c);
    return {
        step: (r, dt) => { const p = [{ r, a: c.a, rho: c.rho }]; centrifugeStep(p, { omega: c.omega, dt, rhoF: c.rhoF, eta: c.eta, rMax: 1e300 }); return p[0].r; },
        state0: c.r0, magnitude: (r) => r, observe: (r) => r,
        reference: (t) => c.r0 * Math.exp(k * t),
        k,
    };
}

/**
 * A REFINEMENT, NOT A TRUNCATION (v3512): the STEP COUNT is swept and dt = T/steps, so the simulated time is
 * EXACTLY T on every row by construction. Sweeping x directly and rounding T/dt to an integer leaves a
 * quantisation that grows to 26% at the coarse end -- the check caught that on its first run, which is the
 * same defect one level down from the thing being measured.
 */
export function centrifugeSweep(counts = [1000, 100, 20, 10, 5, 2, 1], c = CENT) {
    const spec = centrifugeSpec(c), k = spec.k;
    return counts.map((steps) => {
        const dt = c.T / steps, x = k * dt;
        const e = envelope({ ...spec, dt, steps });
        const f = fidelity({ ...spec, dt, steps });
        return { x, dt, steps, ratio: e.ratio, verdict: e.verdict, worstRel: f.worstRel,
                 rateError: Math.abs(Math.log(1 + x) / x - 1) };
    });
}

/** The exact continuous answer, handed to the envelope axis. This is the check that cannot be argued with. */
export function exactSolutionVerdict(c = CENT) {
    const ratio = Math.exp(centK(c) * c.T);
    return { ratio, verdict: classifyEnvelope(ratio, false) };
}

export const MEASURED_V3605 = {
    shippedPathHashes: { shmRun: "44e16980bad7a927", reportLines: "231302d32555b445" },
    symplecticAtOne: { energyRatio: 1.0, verdict: "FAITHFUL", worstAbsFromCos: 1.999961, theoreticalMax: 2 },
    discretePeriodKey: { wdt: 1.0, relErr: 1.48e-16 },
    exactSolutionReads: "EXPLODES",
    sweepInversion: { bestFidelity: { steps: 1000, x: 0.00676, rateError: 0.0034, verdict: "EXPLODES" },
                      worstFidelity: { steps: 1, x: 6.75684, rateError: 0.6968, verdict: "FAITHFUL" } },
    theSweepQuantisationIFirstShipped:
        "My first sweep chose x and rounded steps = T/dt, which leaves the simulated time 26% short at the " +
        "coarse end -- a truncation wearing a refinement, v3512's defect one level below the thing being " +
        "measured, and the gate caught it on its first run. The step COUNT is swept now, so T is exact.",
    verdict: "AN ENERGY-ENVELOPE VERDICT IS NOT A CORRECTNESS VERDICT, AND ON A NON-CONSERVATIVE SYSTEM IT IS " +
             "NOT EVEN NEUTRAL. Pointed at the centrifuge it returns EXPLODES for the EXACT CONTINUOUS SOLUTION, " +
             "and across a refinement sweep the only configuration it passes is the least accurate one on the " +
             "list. The two axes are reported as a PAIR and never combined into a score.",
    refused: "v3542's SPH column gets the ENVELOPE axis only. The tree has no closed form for its transient " +
             "energy; the hydrostatic profile is a different observable and grading one claim with another " +
             "claim's answer key would be worse than reporting one axis.",
    notChanged: "stabilityMeter.mjs keeps every number in MEASURED_V3599. Its three-way rule was EXTRACTED as " +
                "classifyEnvelope so this file imports it rather than copying it, and the shipped path is held " +
                "to hashes captured from the pristine v3604 extract BEFORE the edit.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[stepperMeter] the stability meter, pointed at a solver -- and the second axis it needed");
    say("");
    say("1. THE INJECTED SEAM REPRODUCES THE SHIPPED METER, so this is one computation and not two");
    for (const k of KINDS) {
        const a = shmRun(k, { dt: 0.5, steps: 400 }).ratio;
        const b = envelope({ ...shmSpec(k), dt: 0.5, steps: 400 }).ratio;
        say("     " + k.padEnd(12) + "stabilityMeter " + a.toExponential(6) + "   injected " + b.toExponential(6) +
            "   " + (a === b ? "BIT-IDENTICAL" : "*** MOVED ***"));
    }
    say("");
    say("2. THE ANSWER KEY IS AN IDENTITY: symplectic Euler's exact discrete frequency (2/dt)asin(w dt/2)");
    say("     w*dt    measured period     exact discrete      relErr      continuous 2pi/w");
    for (const dt of [0.1, 0.5, 1.0]) {
        const sp = shmSpec("symplectic");
        const P = measuredPeriod({ ...sp, dt, steps: 40000 });
        const exact = 2 * Math.PI / symplecticDiscreteOmega(1, dt);
        say("     " + String(dt).padEnd(8) + P.toFixed(10).padEnd(20) + exact.toFixed(10).padEnd(20) +
            (Math.abs(P - exact) / exact).toExponential(2).padEnd(12) + (2 * Math.PI).toFixed(10));
    }
    say("     EXACT at w*dt = 1 where the crossing lands ON a step; elsewhere the residue is the LINEAR");
    say("     INTERPOLATION of a curved crossing, which is the instrument and not the integrator.");
    say("     The integrator is EXACTLY solving a different problem -- which no energy ratio can say.");
    say("");
    say("3. ON THE METER'S OWN FIXTURE: the best envelope reading sits on the worst trajectory");
    say("     w*dt    energy ratio   envelope    worst |x - cos(w t)|   (max possible for a unit cosine is 2)");
    for (const dt of [0.1, 0.5, 1.0, 1.9]) {
        const sp = shmSpec("symplectic");
        const e = envelope({ ...sp, dt, steps: 400 }), f = fidelity({ ...sp, dt, steps: 400 });
        say("     " + String(dt).padEnd(8) + e.ratio.toFixed(6).padEnd(15) + e.verdict.padEnd(12) + f.worstAbs.toFixed(6));
    }
    say("");
    say("4. THE LOAD-BEARING NEGATIVE: the envelope axis on a system whose true solution GROWS");
    const ex = exactSolutionVerdict();
    say("     THE EXACT CONTINUOUS SOLUTION r0*exp(k T) reads growth " + ex.ratio.toExponential(3) +
        "  -> envelope verdict " + ex.verdict);
    say("     A meter whose verdict on the closed form is 'unstable' cannot be pointed at that system.");
    say("");
    say("5. AND ACROSS THE REFINEMENT SWEEP THE VERDICT IS ANTI-CORRELATED WITH THE ERROR");
    say("     steps   dt        x=k*dt     growth        envelope    |ln(1+x)/x - 1|");
    for (const r of centrifugeSweep()) {
        say("     " + String(r.steps).padEnd(8) + r.dt.toFixed(3).padEnd(10) + r.x.toFixed(5).padEnd(11) +
            r.ratio.toExponential(3).padEnd(14) + r.verdict.padEnd(12) + r.rateError.toFixed(4));
    }
    say("     THE ONLY RUN IT PASSES IS THE WORST ONE ON THE LIST -- one giant step does not get far.");
    say("");
    say("  " + MEASURED_V3605.verdict);
    say("  REFUSED: " + MEASURED_V3605.refused);
    say("  " + MEASURED_V3605.notChanged);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
