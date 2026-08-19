// physics/xpbd/attachKey-selfcheck.mjs
//
// v3478 -- GRADING WORLD ATTACHMENTS. attach.js pins a particle to a world point with an XPBD point constraint
// C = |x - target|, rest 0, and its header states the physics in one sentence: "With compliance 0 the correction
// is exactly -(x - target), so the particle snaps onto the anchor in ONE step; with positive compliance it is a
// soft spring." Plus: "each attachment touches ONE particle, so attachments to distinct particles are
// independent and order-free." Three edges, none the tautology of grading the solve against the solve:
//
//   SNAP AT ZERO   compliance 0 -> the single-step correction is exactly -(x - target), particle lands ON the
//                  anchor to the bit (snapErr exactly 0).
//   SOFT SPRING    compliance c > 0 keeps aTilde/(w + aTilde) of the offset after one step, against the CLOSED
//                  FORM (1.7e-16) -- nonzero real arithmetic, not an exact zero.
//   ORDER FREEDOM  a distinct particle and lambda slot per attachment, so visit order changes nothing (orderErr 0).
//
// *** THE PLANT IS THE HEADER'S TWO-REGIME CLAIM TURNED INTO A FAULT: ignore compliance (aTilde forced to 0) and
// everything snaps. It PASSES the snap key -- at compliance 0 the correct and planted solves are the same
// arithmetic -- and breaks the soft spring outright. Honest exactly like the compliance and sampled keys: agree
// at the special point (compliance 0), part everywhere else.

import { attachKeys, snapAtZero, orderFreedom, softSpring, ignoreCompliancePlant } from "./attachKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const keys = attachKeys();

// ---- 1. THE SOFT SPRING HOLDS A REAL FRACTION, SO THE KEYS ARE NOT READ OFF AN INERT PULL --------------------------
{
    const sp = softSpring();
    ok("a positive-compliance attachment keeps a real fraction of its offset",
        sp.sampleResidual > 0.05 && sp.sampleResidual < 0.95,
        `after one step the particle still sits ${(sp.sampleResidual * 100).toFixed(0)}% of the way out. Asserted ` +
        "first because a spring that snapped, or one that never moved, would make the spring key below vacuous -- " +
        "this is the positive control that there are two distinct regimes to tell apart");
}

// ---- 2. COMPLIANCE 0 SNAPS ONTO THE ANCHOR EXACTLY ----------------------------------------------------------------
{
    const s = snapAtZero();
    ok("!! compliance 0 lands the particle exactly on the anchor in one solve",
        s.snapErr === 0,
        `worst offset from the anchor after one solve is ${s.snapErr.toExponential(2)}. With aTilde 0 the ` +
        "correction is w*s*(x-target) with w*s = -1, so pred += -(x-target) and the particle IS the target -- a " +
        "wrong mass factor or a dropped w would move this off zero, so the zero has power over a real bug");
}

// ---- 3. POSITIVE COMPLIANCE KEEPS THE CLOSED-FORM FRACTION ---------------------------------------------------------
{
    const sp = softSpring();
    ok("!! a soft attachment keeps exactly aTilde/(w+aTilde) of the offset",
        sp.springErr < 1e-12,
        `residual fraction matches the closed form to ${sp.springErr.toExponential(2)}, measured against ` +
        "aTilde/(w+aTilde) computed from the compliance and mass -- not the solver re-run. Nonzero because it is " +
        "real arithmetic, and it is the number that SEPARATES a spring from a snap");
}

// ---- 4. THE SOLVE IS ORDER-FREE -----------------------------------------------------------------------------------
{
    const o = orderFreedom();
    ok("!! forward and reversed visit order agree to the bit",
        o.orderErr === 0,
        `worst forward-vs-reversed difference ${o.orderErr.toExponential(2)}. Each attachment touches a distinct ` +
        "particle and its own lambda slot, so nothing one attachment writes is read by another -- a shared-state " +
        "bug would break this");
}

// ---- 5. THE PLANT BREAKS THE SPRING AND IS HONEST AT COMPLIANCE 0 --------------------------------------------------
{
    const p = ignoreCompliancePlant();
    ok("!! ignoring compliance snaps where a soft spring should hold",
        p.plantSpringErr > 0.5,
        `the plant misses the spring residual by ${(p.plantSpringErr * 100).toFixed(0)}% -- it reads a spring that ` +
        "keeps aTilde/(w+aTilde) of its offset as keeping none, because forcing aTilde to 0 always snaps");

    ok("...and it AGREES with the correct solve at compliance 0",
        p.agreesAtZero === 0,
        `at compliance 0 the planted solve lands on the anchor to the bit (${p.agreesAtZero.toExponential(2)}) -- ` +
        "the two regimes are the same arithmetic there, so a check that fired at compliance 0 would be accusing " +
        "something other than the compliance term the plant drops");
}

console.log();
if (fails) { console.log("attachKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("attachKey-selfcheck: all checks pass");
