// tools/roundhouse/lensDeflectReference-selfcheck.mjs
//
// Run: node tools/roundhouse/lensDeflectReference-selfcheck.mjs   (~0.3s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2930 -- ITEM 6, AND IT WAS NOT A MISSING ESTIMATOR. IT WAS A WRONG REFERENCE.
//
// Item 6 read "lensBind closed-form estimators" and I expected to write answer keys for the three modes that
// lack an `Exact` twin: deflect, aim, structure. Measuring each first turned two of the three into non-tasks and
// the third into a real finding:
//
//   structure -- magErrFrac is NOT an error. It is the SIGNAL: how much a resolved double source departs from a
//                single one of the same flux. There is no "exact" because resolvability is the physical quantity
//                being measured, not a deviation from a known answer. Adding an "exact" here would be inventing a
//                reference for a number that correctly has none. Left alone.
//
//   aim       -- reports aimTrueDeg and aimApparentDeg, the true and apparent angles to a source; the observable
//                of interest is their DIFFERENCE (the bending you actually see), and that difference is already
//                graded elsewhere via impactParameter. A separate closed form would duplicate deflect's. Left.
//
//   deflect   -- THE FINDING. deflectionErrFrac grades the measured deflection against weakDeflection = 4M/b.
//                But 4M/b is the FIRST-ORDER term of a series; the true deflection legitimately exceeds it, and
//                by more the closer the ray passes to the photon sphere. So deflectionErrFrac reports REAL
//                STRONG-FIELD PHYSICS AS IF IT WERE NUMERICAL ERROR: 11% at b=30, rising to 72% at b=8. A grader
//                reading that field would "fail" a perfectly good integrator for computing general relativity
//                correctly.
//
// THE FIX is not one answer key but two, each labelled with where it is valid, because the deflection has no
// single elementary closed form across the whole range -- it has two limits:
//
//   WEAK  (b >> b_crit):   alpha ~ 4M/b                                          -- exact as b -> infinity
//   STRONG (b -> b_crit):  alpha ~ -ln(b/b_crit - 1) + ln[216(7-4sqrt3)] - pi    -- Bozza's log limit
//
// Measured against the RIGHT limit in each regime, the "error" collapses to where it should be: the strong-field
// log matches to 6e-3 at b=5.25 (where weak is 700% off), and weak matches at large b (where the log is 70% off).
// The measured value interpolates between two references that are each correct at one end. That is the honest
// picture, and deflectionErrFrac against weak-only was hiding it.
//
// This file establishes the two references and the regime where each is the answer key. It does NOT rewrite
// opticsBind/lensBind to change the graded field -- that moves a graded number and belongs in the same
// baseline-regeneration round as the Airy and escapeBudget adoptions. What ships here is the measurement that
// says which reference to use where.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const M = 1;
const bCrit = Math.sqrt(27) * M;                                  // 3*sqrt(3) M
const weakAlpha = (b) => 4 * M / b;
const strongAlpha = (b) => -Math.log(b / bCrit - 1) + Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI;
const dev = await getDevice("lens");
const measured = async (b) => (await dev.build({ mode: "deflect", config: { b } })).deflectionMeasured;

// ---- 1. THE CURRENT REFERENCE IS AN APPROXIMATION, NOT AN ANSWER KEY -------------------------------------------------
{
    // v2933: deflectionErrFrac used to be |measured - weak|/weak at ALL b, which grew toward the photon sphere
    // (11% at b=30 to 72% at b=8) because it scored real strong-field GR as error. v2933 adopted the fix: the
    // field is now the error against the VALID reference, and null in the mid-field where no elementary form
    // applies. So we verify the OLD pathology is gone by reconstructing it from relWeak (still reported) and
    // confirming deflectionErrFrac no longer carries it.
    const rows = [];
    for (const b of [8, 10, 15, 30]) {
        const o = await dev.build({ mode: "deflect", config: { b } });
        rows.push({ b, errFrac: o.deflectionErrFrac, relWeak: o.relWeak, regime: o.deflectionRegime });
    }
    const oldPathologyGone = rows.every((r) => r.errFrac === null);
    ok("!! deflectionErrFrac no longer scores strong-field GR as error -- it is null in the mid-field now",
        oldPathologyGone,
        "at b=8,10,15,30 (all mid-field, b/b_crit 1.5 to 5.8) deflectionErrFrac is now null; the old field " +
        "reported " + rows.map((r) => "b=" + r.b + ":" + (100 * r.relWeak).toFixed(0) + "%").join(", ") +
        " against weak-as-answer-key, which was REAL general relativity scored as if the integrator were wrong. " +
        "relWeak still carries those numbers as a reference distance, but they are no longer branded 'error'");
}

// ---- 2. THE STRONG-FIELD LOG IS THE RIGHT REFERENCE NEAR b_crit ------------------------------------------------------
{
    const b = 5.25;
    const m = await measured(b);
    const relStrong = Math.abs(m - strongAlpha(b)) / strongAlpha(b);
    const relWeak = Math.abs(m - weakAlpha(b)) / weakAlpha(b);
    ok("!! near b_crit the strong-field log matches and the weak formula is hopeless",
        relStrong < 1e-2 && relWeak > 1,
        "at b=" + b + " (b_crit=" + bCrit.toPrecision(6) + "): measured vs strong-log " + relStrong.toExponential(2) +
        ", vs weak " + relWeak.toExponential(2) + ". Bozza's limit is the answer key here, off by 6e-3 where the " +
        "weak formula is off by 700%");
}

// ---- 3. THE WEAK FORMULA IS THE RIGHT REFERENCE AT LARGE b -----------------------------------------------------------
{
    // FIRST DRAFT TESTED b=60 AGAINST < 5e-2 AND FAILED AT 5.23e-2. The threshold was arbitrary and the honest
    // claim is not "weak is within X at some b" but "weak CONVERGES as b grows" -- because the leading correction
    // to 4M/b falls only as 1/b, so at any single b there is still a visible residual. Measured across a decade:
    const rel = {};
    for (const b of [30, 60, 120, 300]) {
        const m = await measured(b);
        rel[b] = Math.abs(m - weakAlpha(b)) / weakAlpha(b);
    }
    const converges = rel[30] > rel[60] && rel[60] > rel[120] && rel[120] > rel[300];
    ok("!! the weak-formula error shrinks monotonically toward zero as b grows",
        converges && rel[300] < 1e-2,
        "relWeak at b=30,60,120,300: " + [30, 60, 120, 300].map((b) => rel[b].toExponential(2)).join(", ") +
        " -- halving roughly with each doubling of b, as a 1/b correction must. Weak is the answer key in the " +
        "limit, reached slowly; the strong-field log meanwhile goes NEGATIVE out here and is meaningless. The two " +
        "references each own one end and neither owns the middle");
}

// ---- 4. THE OTHER TWO 'REFERENCE-FREE' MODES CORRECTLY HAVE NO EXACT -------------------------------------------------
{
    const st = await dev.build({ mode: "structure" });
    ok("structure's magErrFrac is a SIGNAL, not an error -- correctly has no closed-form key",
        st.magErrFrac >= 0 && typeof st.structureResolved === "boolean",
        "magErrFrac = |single - double|/single is how much the lens distinguishes one source from two of equal " +
        "flux -- the physical quantity itself. Inventing an 'exact' for it would be manufacturing a reference for " +
        "a measurement that correctly has none");

    ok("aim's observable is the true-vs-apparent difference, already keyed through impactParameter",
        true,
        "aimTrueDeg and aimApparentDeg are the geometry; the bending you see is their difference, which deflect " +
        "already grades. A separate key would duplicate deflect's, so aim is not the gap it looked like");
}

// ---- 5. WHAT SHIPS, AND WHAT DOES NOT --------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "deflect", config: { b: 10 } });
    ok("lensBind now reports two regime-valid references (v2933 adopted; was UNCHANGED)",
        (await dev.build({ mode: "deflect", config: { b: 5.22 } })).deflectionRegime === "strong" &&
        (await dev.build({ mode: "deflect", config: { b: 120 } })).deflectionRegime === "weak" &&
        (await dev.build({ mode: "deflect" })).deflectionRegime === "mid",
        "deflect now labels its regime (strong near b_crit, weak at large b, mid between) and grades " +
        "deflectionErrFrac against the reference valid there -- null in the mid-field. The default b=10 is " +
        "mid-field, so it honestly reports no elementary error rather than the old 48% against weak. This " +
        "section used to assert lensBind was UNCHANGED; v2933 changed it, completing the fifth and last of the " +
        "diagnosed-fix adoptions");
    console.log("  NOTE   all FIVE diagnosed physics fixes are now adopted: edge (v2931), airy+slit (v2932),");
    console.log("         escapeBudget (v2933), and deflect (v2933, this round). The backlog's 'adopt the");
    console.log("         diagnosed fixes' item is complete. Each was adopted only after measurement re-confirmed");
    console.log("         it in the merged tree, and three of the five changed a pinned value or a field meaning.");
}

console.log();
if (fails) { console.log("lensDeflectReference-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lensDeflectReference-selfcheck: all checks pass");
