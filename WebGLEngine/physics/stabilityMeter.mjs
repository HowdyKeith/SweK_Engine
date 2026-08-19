// WebGLEngine/physics/stabilityMeter.mjs -- v3599
// ---------------------------------------------------------------------------------------------------------------
// "STABLE AT ANY TIME-STEP" IS A TESTABLE SENTENCE, AND THIS TREE HAS THE METER. IT IS ALSO HALF A CLAIM.
//
// PB-MPM (Lewin, SEED/EA, SIGGRAPH 2024, BSD-3, WebGPU + WGSL) is sold on stability at any time-step, and its
// own description says how: the system "degrades gracefully into NUMERICAL DAMPING rather than exploding".
// *** THAT SENTENCE IS THE ADMISSION AND IT IS WHY A STABILITY METER ALONE IS NOT ENOUGH. *** Nothing here
// implements MPM, nothing is vendored, and no claim about EA's code is made -- what is built is the
// instrument that would let anybody, including this tree, be graded on that sentence.
//
// v3542 already measured energy-per-particle rising on SweK's own SPH column (3.679 -> 16.215 over 2000
// steps at the shipped viscosity), so half of the meter existed. v3597 supplied the missing half from the
// other direction: the centrifuge stepper NEVER blows up and is still 91% wrong past x = 1. STABILITY AND
// CORRECTNESS ARE DIFFERENT CLAIMS, and a meter that reported only the first would certify a dead simulation.
//
// ================================================================================================================
// THE FIXTURE, AND ITS ANSWER KEY IS A CLOSED FORM PER STEP RATHER THAN A TOLERANCE
// ================================================================================================================
//
// The simple harmonic oscillator x'' = -w^2 x, where the exact solution conserves energy forever. Three
// first-order integrators, differing ONLY in which value the force is evaluated at:
//
//   EXPLICIT (forward) Euler   -- amplitude multiplied by sqrt(1 + (w dt)^2) EVERY STEP. Measured 1.0049875621
//                                 at w dt = 0.1 against a predicted 1.0049875621. TEN DIGITS, no fit.
//   IMPLICIT (backward) Euler  -- amplitude multiplied by 1/sqrt(1 + (w dt)^2). Measured 0.9950371902 against
//                                 a predicted 0.9950371902.
//   SYMPLECTIC Euler           -- no secular drift at all; energy oscillates inside a bounded envelope.
//
// *** THE TWO ERRORS ARE EXACT RECIPROCALS, AND THAT IS THE WHOLE FINDING: EXPLOSION AND DAMPING ARE THE SAME
// ERROR WITH OPPOSITE SIGNS, AND ONLY ONE OF THEM LOOKS LIKE A BUG. *** E_explicit x E_implicit = 1 at every
// dt and every step count -- at w dt = 0.5 over 400 steps that is 5.81e+38 times 1.72e-39. One of those is
// called unstable and gets fixed; the other is called stable and ships. A METER THAT ONLY ASKS "DID IT BLOW
// UP" SELECTS THE SECOND ONE ON PURPOSE.
//
// AND THE THIRD ANSWER IS THAT THERE IS NO ORDERING. Symplectic Euler is FAITHFUL and CONDITIONALLY stable --
// bounded to w dt = 1.9 (energy ratio 1.82), marginal at exactly 2, gone at 2.1 (4.77e+219). Implicit Euler
// is stable at w dt = 50 and has destroyed the oscillator by then (ratio 0.00e+0). THREE INTEGRATORS, THREE
// DIFFERENT VERDICTS, AND NO SINGLE NUMBER RANKS THEM -- which is why verdict() returns a NAME and not a score.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";

export const KINDS = ["explicit", "implicit", "symplectic"];

/** The per-step amplitude factor, in CLOSED FORM. Nothing in shmRun is told these numbers. */
export function predictedAmplification(kind, wdt) {
    const g = Math.sqrt(1 + wdt * wdt);
    if (kind === "explicit") return g;
    if (kind === "implicit") return 1 / g;
    return null;                       // symplectic has no secular factor -- that IS its property
}

/** x'' = -w^2 x from x=1, v=0. Returns the energy ratio and the amplitude factor per step. */
export function shmRun(kind, { w = 1, dt = 0.1, steps = 2000 } = {}) {
    // *** v3628: UNKNOWN IS NOT THE DEFAULT. The branch below was `explicit / implicit / else`, so ANY name this
    // meter had never heard of silently became SYMPLECTIC and got a verdict -- verdict("fdtd") returned FAITHFUL
    // for a system that had never been run. A meter that answers for a system it does not have is worse than one
    // that refuses, because the answer looks like evidence. The three KINDS are unchanged and their numbers are
    // hash-pinned; this only closes the fourth door. (gate-hygiene, v3103's law, eighth instance.)
    if (!KINDS.includes(kind)) return null;
    let x = 1, v = 0;
    const E = () => 0.5 * v * v + 0.5 * w * w * x * x;
    const E0 = E();
    for (let i = 0; i < steps; i++) {
        if (kind === "explicit") { const xn = x + v * dt, vn = v - w * w * x * dt; x = xn; v = vn; }
        else if (kind === "implicit") {
            const d = 1 + w * w * dt * dt;
            const vn = (v - w * w * dt * x) / d, xn = (x + v * dt) / d;
            x = xn; v = vn;
        } else { v -= w * w * x * dt; x += v * dt; }
        if (!Number.isFinite(x) || !Number.isFinite(v)) return { ratio: Infinity, perStep: Infinity, blewUp: true, steps: i };
    }
    const ratio = E() / E0;
    return { ratio, perStep: Math.pow(ratio, 1 / (2 * steps)), blewUp: false, steps };
}

/**
 * *** THE THREE-WAY VERDICT, AND IT IS A NAME BECAUSE THERE IS NO ORDERING. *** A two-state answer would
 * merge DAMPED with FAITHFUL -- both "did not blow up" -- and that merge is the entire failure this file
 * exists to prevent. The thresholds are the ONLY place a judgement enters and they are stated as such: an
 * envelope that neither grows nor shrinks by more than a factor over the run is bounded-and-faithful, and
 * anything monotone outside it is named by its DIRECTION rather than by its size.
 */
export function verdict(kind, o = {}) {
    const r = shmRun(kind, o);
    if (r === null) return null;                 // v3628: shmRun refuses an unknown kind, and so does this
    return { verdict: classifyEnvelope(r.ratio, r.blewUp), ...r };
}

/**
 * v3605 -- THE CLASSIFICATION IS EXTRACTED SO A SECOND METER CANNOT CARRY A SECOND COPY OF IT. The three-way
 * rule is unchanged and the shipped path is held to a hash captured from the pristine v3604 extract BEFORE
 * this edit (physics/stepperMeter-selfcheck.mjs section 1): shmRun 44e16980bad7a927 over 24 rows, reportLines
 * 231302d32555b445. A refactor that "cannot change anything" is exactly the kind that does.
 */
export function classifyEnvelope(ratio, blewUp = false) {
    if (blewUp || !Number.isFinite(ratio)) return "EXPLODES";
    if (ratio > EXPLODE_FACTOR) return "EXPLODES";
    if (ratio < DAMP_FACTOR) return "DAMPED";
    return "FAITHFUL";
}
// A run that has gained or lost an ORDER OF MAGNITUDE of energy is not oscillating any more, whichever way it
// went. Symmetric on purpose: the asymmetry between "explodes" and "damps" is the bias being measured, so the
// meter must not build it into its own bounds.
/**
 * *** v3628: CLASSIFY AGAINST WHAT THE PHYSICS PREDICTS, NOT AGAINST 1. classifyEnvelope compares an energy
 * ratio to unity, which is right for a CONSERVATIVE system and wrong for every other kind -- a wave in a
 * conductor is SUPPOSED to lose its energy, and the bare meter calls that DAMPED, i.e. a fault. DAMPED cannot
 * tell "the integrator lost energy" from "the medium absorbed it", because it is a statement about the ratio
 * and not about where the energy went. This takes the predicted ratio as well, and grades the departure from
 * it. classifyEnvelope is UNTOUCHED and still hash-pinned; this is a second question, not a replacement. ***
 */
export function classifyAgainst(ratio, predicted, blewUp = false) {
    if (blewUp || !Number.isFinite(ratio)) return "EXPLODES";
    if (!(predicted > 0) || !Number.isFinite(predicted)) return null;   // no prediction, no verdict
    return classifyEnvelope(ratio / predicted, false);
}

export const EXPLODE_FACTOR = 10;
export const DAMP_FACTOR = 0.1;

/**
 * *** THE IDENTITY: THE TWO EULERS ARE EXACT RECIPROCALS. *** No tolerance, no fit -- their per-step factors
 * multiply to 1 because they differ only in which endpoint the force is evaluated at. This is the number that
 * makes "it did not explode" an incomplete report rather than a good one.
 */
export function reciprocity({ w = 1, dt = 0.5, steps = 400 } = {}) {
    const e = shmRun("explicit", { w, dt, steps }), i = shmRun("implicit", { w, dt, steps });
    return { explicit: e.ratio, implicit: i.ratio, product: e.ratio * i.ratio,
             perStepProduct: e.perStep * i.perStep };
}

/** Where each integrator stops being bounded, RECOVERED BY BISECTION on the verdict rather than typed. */
export function stabilityBoundary(kind, { w = 1, steps = 400, lo = 1e-3, hi = 1e3 } = {}) {
    if (verdict(kind, { w, dt: hi, steps }).verdict !== "EXPLODES") return { wdt: Infinity, unconditional: true };
    let a = lo, b = hi;
    for (let i = 0; i < 60; i++) {
        const m = 0.5 * (a + b);
        if (verdict(kind, { w, dt: m, steps }).verdict === "EXPLODES") b = m; else a = m;
    }
    return { wdt: w * 0.5 * (a + b), unconditional: false };
}

export const MEASURED_V3599 = {
    theClosedFormsHitTenDigits:
        "explicit per-step amplitude 1.0049875621 against a predicted sqrt(1+(w dt)^2) = 1.0049875621, and " +
        "implicit 0.9950371902 against 1/sqrt(1+(w dt)^2) = 0.9950371902, at w dt = 0.1 over 2000 steps. " +
        "The integrators are never told either number.",
    explosionAndDampingAreTheSameError:
        "*** E_explicit x E_implicit = 1 AT EVERY dt: at w dt = 0.5 over 400 steps, 5.81e+38 times 1.72e-39. " +
        "The two errors are equal in magnitude and opposite in sign, and ONLY ONE OF THEM LOOKS LIKE A BUG. *** " +
        "A meter that asks only 'did it blow up' selects the other one on purpose.",
    stableCanMeanDead:
        "implicit Euler at w dt = 0.1 leaves 2.28e-9 of the starting energy after 2000 steps -- the oscillator " +
        "is GONE -- and it never blows up at any dt tested, including 50 (ratio 0.00e+0). THAT IS WHAT " +
        "'STABLE AT ANY TIME-STEP' BUYS IF NOBODY ASKS THE SECOND QUESTION.",
    thereIsNoOrdering:
        "symplectic Euler is FAITHFUL and CONDITIONALLY stable: energy ratio 1.05 / 0.89 / 1.00 / 1.82 at " +
        "w dt = 0.1 / 0.5 / 1.0 / 1.9, marginal at exactly 2.0, and 4.77e+219 at 2.1. Three integrators, " +
        "three verdicts, no single number ranks them -- which is why verdict() returns a NAME.",
    whatThisIsNot:
        "NOT an MPM implementation, NOT a claim about EA's code, and NOT a refutation of PB-MPM. It is the " +
        "instrument the sentence 'stable at any time-step' would have to be graded by, built where it can be " +
        "run -- and pointed first at this tree's own integrators (v3542's SPH column rises, v3597's " +
        "centrifuge never blows up and is 91% wrong past x = 1).",
};

export function reportLines() {
    const L = [];
    L.push("[stabilityMeter] stable and correct are different claims, and one of them is easy");
    L.push("");
    L.push("  w*dt    explicit        implicit        symplectic      verdicts");
    for (const dt of [0.1, 0.5, 1.0, 1.9, 2.1, 50]) {
        const rs = KINDS.map((k) => verdict(k, { dt, steps: 400 }));
        L.push("  " + String(dt).padEnd(7) +
               rs.map((r) => (Number.isFinite(r.ratio) ? r.ratio.toExponential(2) : "INF").padEnd(16)).join("") +
               rs.map((r) => r.verdict[0]).join("/"));
    }
    const rc = reciprocity();
    L.push("");
    L.push("  *** E_explicit x E_implicit = " + rc.product.toFixed(12) + " -- the same error, opposite signs ***");
    for (const k of KINDS) {
        const b = stabilityBoundary(k);
        L.push("  " + k.padEnd(11) + "stability boundary w*dt = " +
               (b.unconditional ? "UNCONDITIONAL (never blows up -- and see the damping column)" : b.wdt.toFixed(6)));
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
