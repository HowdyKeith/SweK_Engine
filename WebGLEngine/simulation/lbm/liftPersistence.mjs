// WebGLEngine/simulation/lbm/liftPersistence.mjs -- v3346
//
// *** THE WAKE KEEPS A FREQUENCY AND THE FORCE ON THE BODY DOES NOT. THAT IS THE ARC'S REAL SHAPE, AND IT IS
// NOT "THE RIG DOES NOT SHED". ***
//
// v3345 established the wake perturbation GROWS at a larger offset, withdrawing v3344's closure. This round ran
// the full experiment at that offset and then re-ran it with the settle extended past the transient v3345
// measured (alive to ~16,000 steps against a settle of 6,000):
//
//   settle  yOffset  liftAmplitude  dragAmplitude  stWake   liftWakeAgreement  verdict
//    6000     0.75      0.02271         --         0.1445        --            not sustained   (v3341)
//    6000     1.50      0.05188       0.36972      0.1290       10.333         not sustained
//   18000     1.50      0.00661       0.10523      0.1301        2.953         not sustained
//
// *** TRIPLING THE SETTLE COLLAPSED THE LIFT OSCILLATION EIGHT-FOLD (0.05188 -> 0.00661) WHILE THE WAKE
// STROUHAL DID NOT MOVE (0.1290 -> 0.1301). *** Two observables of one flow, and only one of them survives
// settling. A von Karman street exerts an oscillating lift; something that keeps a frequency at a downstream
// probe while exerting a vanishing force on the body is not obviously a street.
//
// AND THE isSustained TEST IS NOT THE CULPRIT, WHICH IS WORTH SAYING BECAUSE IT WAS MY FIRST GUESS. It compares
// the second half's amplitude against 0.85x the first half's -- so a startup transient sitting in the first half
// would read as decay. Settling past the transient was the fix for that, and the lift STILL fails: it did not
// stop decaying, IT DECAYED FROM A LOWER STARTING POINT. The test was reporting the truth.
//
// *** AND I MUST RETRACT SOMETHING I CLAIMED AT v3341. *** I gated that the repaired stWake "lands on v2797's
// INDEPENDENT measurement" -- 0.1445 against 0.1465, 1.4% apart -- and called that what makes it a fix rather
// than a value. THE COMPARISON IS WEAKER THAN I SAID. Strouhal is f D / U, and every configuration I compared
// shared the same D and very nearly the same U, so a constant St across them is close to a restatement that f
// did not change. v2797 was a genuinely different rig and that part stands; the three configs of my own that I
// stacked beside it add far less than the agreement implies.
//
// *** THE DISCRIMINATING TEST IS NOT RUN AND IS NAMED RATHER THAN GUESSED: VARY D. *** A shedding frequency
// scales as U/D, so St holds while f moves. A domain or acoustic mode keeps f FIXED while D changes, and St
// then moves instead. That single sweep separates "a street whose force is being lost somewhere" from "a
// frequency that was never shedding" -- and it is the measurement this arc has needed since v2797 without
// anybody naming it. It costs two long runs and is the next round.
"use strict";

/** The measured runs, recorded as data so the conclusion travels with its evidence. */
export const SETTLE_SWEEP_V3346 = [
    { settle: 6000, yOffset: 0.75, liftAmplitude: 0.022713677627373835, stWake: 0.1444882644753061, sustained: false },
    { settle: 6000, yOffset: 1.50, liftAmplitude: 0.051883281363576284, dragAmplitude: 0.3697192406115095, stWake: 0.12898523134970388, agreement: 10.333299726615296, sustained: false },
    { settle: 18000, yOffset: 1.50, liftAmplitude: 0.006605976885698344, dragAmplitude: 0.10522761830639447, stWake: 0.13006127232993395, agreement: 2.9530369455229937, sustained: false },
];

/** Did more settling shrink the force oscillation while leaving the wake frequency alone? */
export function liftVsWake(sweep = SETTLE_SWEEP_V3346) {
    const a = sweep.find((s) => s.settle === 6000 && s.yOffset === 1.5);
    const b = sweep.find((s) => s.settle === 18000 && s.yOffset === 1.5);
    return {
        liftShrinkFactor: a.liftAmplitude / b.liftAmplitude,
        stWakeDriftFrac: Math.abs(b.stWake - a.stWake) / a.stWake,
        everSustained: sweep.some((s) => s.sustained),
    };
}

/**
 * WHAT WOULD SETTLE IT. Kept as executable intent rather than a paragraph, so the next round starts from a
 * prediction that was written down BEFORE the run rather than after it.
 */
export const D_SWEEP_PREDICTION = {
    vary: "D (body diameter) at fixed tau and U",
    ifShedding: "f scales as U/D, so St stays near 0.13 and the raw frequency MOVES",
    ifDomainMode: "f stays fixed as D changes, so St moves in proportion to D",
    note: "Blockage moves with D, which is a confound this rig cannot avoid -- so the prediction is about the " +
        "DIRECTION of the two quantities, not about an exact St, and a partial answer is the honest ceiling.",
};
