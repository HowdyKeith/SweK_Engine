// WebGLEngine/physics/pileKnob.mjs -- v3593
// ---------------------------------------------------------------------------------------------------------------
// THE SECOND LAB-SCENE PROPOSER, AND ITS ADJUDICATOR REFUSES AT BOTH ENDS FOR TWO DIFFERENT REASONS.
//
// KEY: a block on a slope slides iff tan(theta) > mu, so bisecting on the slide/no-slide BINARY recovers the
// friction coefficient. v3570 already built this adjudicator against the real box3d, and it is REUSED HERE RATHER
// THAN REBUILT -- including both of its findings, which is the difference between reuse and repetition:
//
//   THE DETECTOR MUST BE VELOCITY, NOT DISPLACEMENT. A settling box CREEPS below the critical angle (1.5e-5 at
//   half the critical angle, 5.3e-4 at 99% of it), so a displacement bound is crossed by a block that is not
//   sliding and the recovered angle MOVES WITH THE THRESHOLD. The speed is exactly 0.000e+0 below and O(0.1)
//   above, so the bisection is a real binary.
//
//   AND THE RESIDUAL IS ADDITIVE, NOT MULTIPLICATIVE. tan(theta_c) - mu holds near 0.0102 across the whole
//   usable range, so the solver is about 0.01 of tan HIGH EVERYWHERE rather than a few percent wrong.
//
// ================================================================================================================
// AND THAT ADDITIVE OFFSET IS WHAT KILLS THE LOW END -- WHICH IS THE POINT, NOT A NUISANCE
// ================================================================================================================
//
//     mu          0.02      0.05      0.10      0.20      0.50      0.80
//     tan-mu     0.01025   0.01025   0.01026   0.01037   0.01121   0.01270
//     rel error   51%       20%       10%       5.2%      2.2%      1.6%
//
// A CONSTANT OFFSET DIVIDED BY A SHRINKING KNOB IS AN EXPLODING ERROR. At mu = 0.02 the recovered friction is
// half again as large as the real one. So the adjudicator refuses low mu -- and it refuses for a reason it can
// state, rather than because somebody drew a line.
//
// ================================================================================================================
// *** AND THE HIGH END FAILS BY GOING DEAF TO THE KNOB, WHICH IS v3588's ORBIT INSIDE ONE INSTRUMENT ***
// ================================================================================================================
//
//     mu          1.00      1.30      2.00
//     tan_c      1.01359   1.01266   1.01266     <- IDENTICAL TO FIVE DIGITS
//
// The scene's block is a CUBE, and a cube on a ramp TOPPLES when tan(theta) exceeds its width-to-height ratio,
// which is 1. Above mu = 1 the block tips over before it ever slides, so the bisection stops measuring friction
// and starts measuring GEOMETRY -- and the answer no longer moves when the knob does.
//
// *** THAT IS EXACTLY WHY ORBIT WAS WITHDRAWN AT v3588: A KEY THAT DOES NOT RESPOND TO THE KNOB CANNOT GRADE
// IT. *** The difference is that orbit was deaf across its whole range and had to be refused entirely, while
// pile goes deaf only above a boundary the physics names -- so the adjudicator can refuse THERE and accept
// below. A saturating observable is detectable from the inside: three different knob values returning the same
// answer to five digits is not a coincidence, it is a report that the knob has stopped being the cause.
"use strict";
import { pathToFileURL } from "node:url";
import { criticalAngle, frictionRestitutionAvailable } from "./mechanics/contactKeys.mjs";
import { initNode } from "./box3d/box3dNode.mjs";

// *** THE WASM IS LOADED AT IMPORT, BECAUSE AN ADJUDICATOR THAT CANNOT ANSWER MUST NOT LOOK LIKE ONE THAT
// REFUSES. *** The first version returned pass:false when box3d was absent, and knobRegistry's gate reported
// "ALWAYS REFUSES: pile-friction" -- correctly, because from the outside a dependency failure and a physics
// verdict are the same boolean. That gate exists to catch a control that cannot pass, and it caught one I had
// just written. Top-level await makes the dependency a load-time fact rather than a per-call surprise.
await initNode();

/** Measured across the usable range: tan(theta_c) - mu sits near this, near-constant. */
export const ADDITIVE_OFFSET = 0.0102;
/** A cube topples at tan(theta) = width/height = 1, whatever the friction. */
export const TOPPLE_TAN = 1.0;
/** Relative bound. Chosen ABOVE the offset's own drift (0.01025 to 0.01270) rather than tighter than it. */
export const TOL_REL = 0.05;

/**
 * THE ADJUDICATOR. Refuses at both ends, for two DIFFERENT stated reasons, and accepts in between.
 * Returns { pass, evidence } in the shape grantLicence re-checks.
 */
export function adjudicate(mu, opts = {}) {
    if (!frictionRestitutionAvailable())
        return { pass: false, evidence: { mu, reason: "box3d has no friction setter; rebuild the wasm" } };
    if (!Number.isFinite(mu) || mu <= 0)
        return { pass: false, evidence: { mu, reason: "a friction coefficient must be finite and positive" } };

    // *** THE TOPPLE CHECK COMES FIRST, BECAUSE ABOVE IT THE MEASUREMENT IS OF THE WRONG THING. *** Running the
    // bisection anyway would return 1.0127 and look like a 49% error at mu = 2, inviting somebody to widen the
    // tolerance until it passed -- when the answer is not wrong, it is ABOUT SOMETHING ELSE.
    if (mu >= TOPPLE_TAN)
        return { pass: false, evidence: { mu, topple: TOPPLE_TAN,
            reason: "a cube topples at tan(theta) = 1 whatever the friction, so at mu >= 1 the block tips " +
                    "before it slides and the bisection measures GEOMETRY rather than friction -- the " +
                    "observable saturates at 1.0127 for mu = 1.0, 1.3 and 2.0 alike" } };

    const r = criticalAngle(mu, opts);
    const relErr = Math.abs(r.delta) / mu;
    return { pass: relErr <= TOL_REL,
             evidence: { mu, tan: r.tan, delta: r.delta, relErr, tol: TOL_REL,
                         law: "a block slides iff tan(theta) > mu; the bisection never consults atan(mu)",
                         note: relErr > TOL_REL
                             ? "the additive offset of ~" + ADDITIVE_OFFSET + " is a large fraction of a small mu"
                             : "offset within tolerance" } };
}

/**
 * v3594 -- *** THIS RETURNED THE ADJUDICATOR'S OWN relErr, LIKE gyroKnob's, AND IT WAS WRONG THE SAME TWO WAYS:
 * an error is smaller-is-better against a loop that maximises, and it is the verdict's own number, so the
 * search was optimising the thing that grades it. *** See proposers.SCORE_IS_A_REWARD. On this knob it picked
 * mu = 1.3 with a score of literal Infinity -- the topple regime, refused -- on every single run.
 *
 * *** AND THIS KNOB IS THE HARDER CASE, WHICH IS WHY IT IS WORTH WRITING DOWN. *** The six proposers registered
 * before v3591 all tune a BUDGET -- samples, sweeps, reps, grid size, timestep -- where "cheaper" is an
 * obvious, measurable preference and the adjudicator's job is to refuse a candidate for being too cheap to be
 * right. mu IS NOT A BUDGET. It is a material property, and there is no cheapness axis on it at all: the
 * bisection cost across the whole sweep runs 342, 183, 175, 154, 138, 176 ms at mu = 0.02 .. 1.3, which is
 * neither monotone nor meaningfully different. SO THERE WAS NOTHING TO MAXIMISE, AND REACHING FOR THE ERROR IS
 * EXACTLY WHAT SOMEBODY DOES WHEN THE SCORE HAS NO HONEST CONTENT -- which is the diagnosis rather than the
 * excuse, and it is why the gate checks INDEPENDENCE rather than checking for a particular formula.
 *
 * WHAT IS DECLARED INSTEAD IS A PREFERENCE, SAID OUT LOUD AS ONE: the scene is a pile that stands up, so a
 * rougher surface is what it is for -- prefer a larger mu. It is monotone in the knob, it is computed without
 * calling adjudicate(), and A READER MAY DISAGREE WITH IT, which is the correct status for a preference and
 * not something a measurement should be. What it must never be is a restatement of the verdict.
 *
 * *** AND IT PULLS STRAIGHT INTO THE REFUSAL, WHICH IS THE TENSION THE LOOP EXISTS FOR: *** the block is a
 * CUBE and topples at tan(theta) = 1 whatever the friction, so above mu = 1 the observable goes deaf and the
 * adjudicator says no. The search wants the roughest surface; the key refuses it; the first candidate that
 * survives is the answer. If the score had agreed with the adjudicator there would be nothing to adjudicate.
 */
export function score(mu, opts = {}) { return Number.isFinite(mu) && mu > 0 ? mu : -Infinity; }

/**
 * Candidates spanning BOTH failure modes as well as the good band.
 * *** A SEARCH THAT ONLY OFFERS VALUES ITS OWN ADJUDICATOR ACCEPTS HAS ALREADY DECIDED. ***
 */
export function propose({ current = 0.5 } = {}) {
    return [0.02, 0.1, 0.3, 0.5, 0.8, 1.3].filter((v) => v !== current);
}

/** Is the observable still moving with the knob? Three answers agreeing to five digits is a report, not luck. */
export function saturationProbe(mus = [1.0, 1.3, 2.0], opts = {}) {
    const tans = mus.map((mu) => criticalAngle(mu, opts).tan);
    const spread = Math.max(...tans) - Math.min(...tans);
    return { mus, tans, spread, saturated: spread < 1e-3 };
}

export const MEASURED_V3593 = {
    twoEndsTwoReasons:
        "*** THE ADJUDICATOR REFUSES AT BOTH ENDS AND THE REASONS ARE DIFFERENT, WHICH IS WHY IT IS A WINDOW " +
        "RATHER THAN A THRESHOLD. *** Low mu: the additive offset of ~0.0102 is CONSTANT, so dividing it by a " +
        "shrinking knob explodes -- 51% at mu = 0.02, 20% at 0.05, 10% at 0.1. High mu: the block TOPPLES.",
    theHighEndIsOrbitInsideOneInstrument:
        "tan(theta_c) reads 1.01359, 1.01266, 1.01266 at mu = 1.0, 1.3, 2.0 -- IDENTICAL TO FIVE DIGITS. A cube " +
        "topples at tan(theta) = 1 whatever the friction, so above that the bisection measures GEOMETRY and the " +
        "answer stops moving with the knob. *** THAT IS EXACTLY WHY ORBIT WAS WITHDRAWN AT v3588. The " +
        "difference: orbit was deaf across its WHOLE range and had to be refused entirely; pile goes deaf only " +
        "above a boundary the physics names, so the adjudicator refuses there and accepts below. ***",
    reuseNotRepetition:
        "v3570 built this adjudicator against the real box3d and BOTH of its findings are carried forward: the " +
        "detector must be VELOCITY (a settling box creeps, so a displacement bound moves the recovered angle " +
        "with the threshold) and the residual is ADDITIVE (about 0.01 of tan everywhere, not a few percent). " +
        "The tolerance is set ABOVE the offset's own drift rather than tighter than it, because a bound below a " +
        "known systematic rejects every correct answer.",
};

export function reportLines() {
    const L = [];
    L.push("[pileKnob] angle of repose as a knob adjudicator, refusing at both ends");
    L.push("");
    if (!frictionRestitutionAvailable()) { L.push("  box3d has no friction setter -- rebuild the wasm"); return L; }
    L.push("     mu    tan(theta_c)   rel error   verdict");
    for (const mu of [0.02, 0.1, 0.3, 0.5, 0.8, 1.0, 2.0]) {
        const a = adjudicate(mu);
        const e = a.evidence;
        L.push("   " + String(mu).padStart(5) + "    " + (e.tan ? e.tan.toFixed(5) : "  topple").padStart(9) +
               "   " + (e.relErr != null ? e.relErr.toExponential(2) : "     -").padStart(9) +
               "   " + (a.pass ? "PASS" : "refuse"));
    }
    const s = saturationProbe();
    L.push("");
    L.push("  saturation probe at mu = " + s.mus.join(", ") + ": tan = " + s.tans.map((t) => t.toFixed(5)).join(", "));
    L.push("  spread " + s.spread.toExponential(2) + "  -> saturated: " + s.saturated +
           "   *** THE ANSWER HAS STOPPED MOVING WITH THE KNOB ***");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    // the wasm has to be loaded before a capability can be reported; the probe is safe to ask either way now
    const { initNode } = await import("./box3d/box3dNode.mjs");
    await initNode();
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
