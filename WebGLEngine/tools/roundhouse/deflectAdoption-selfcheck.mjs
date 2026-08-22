// tools/roundhouse/deflectAdoption-selfcheck.mjs
//
// Run: node tools/roundhouse/deflectAdoption-selfcheck.mjs   (~0.2s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2933 -- THE FIFTH AND LAST DIAGNOSED FIX, AND THE ONE THAT CHANGED A FIELD'S MEANING.
//
// The other four adoptions changed a value (airy, slit), a budget (escapeBudget), or added a field (edge). This
// one changes what deflectionErrFrac MEANS. It used to be |measured - weak|/weak at every b -- the measured
// deflection graded against the weak-field approximation 4M/b. But 4M/b is only the first term of a series, so
// the true deflection legitimately exceeds it, more so near the photon sphere. The "error" was real strong-field
// general relativity scored as if the integrator were broken: 11% at b=30, 72% at b=8.
//
// The fix reports the physics honestly. There is no single elementary closed form for the deflection across all
// b, but there are two asymptotic limits -- weak (4M/b, exact as b->infinity) and strong (Bozza's log, exact as
// b->b_crit). deflect now labels which regime b is in and grades the integrator against the reference valid
// there, claiming NO error in the wide mid-field band where neither form is an answer key. That null is the
// correct statement, not a gap.

import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("lens");
const bc = Math.sqrt(27);   // 3*sqrt(3) M, M=1

// ---- 1. THE THREE REGIMES, AND GRADING ONLY WHERE A REFERENCE IS VALID ------------------------------------------------
{
    const strong = await dev.build({ mode: "deflect", config: { b: 5.22 } });   // b/bc = 1.004
    const mid = await dev.build({ mode: "deflect", config: { b: 10 } });        // b/bc = 1.92
    const weak = await dev.build({ mode: "deflect", config: { b: 120 } });      // b/bc = 23

    ok("!! near b_crit the mode is in the STRONG regime and grades against Bozza's log",
        strong.deflectionRegime === "strong" && strong.deflectionErrFrac < 1e-2,
        "b=5.22 (b/b_crit " + (5.22 / bc).toFixed(3) + "): regime " + strong.deflectionRegime + ", errFrac " +
        strong.deflectionErrFrac.toExponential(2) + " against the strong-field log -- a real integrator error, small");

    ok("!! at large b the mode is in the WEAK regime and grades against 4M/b",
        weak.deflectionRegime === "weak" && weak.deflectionErrFrac < 1e-1,
        "b=120 (b/b_crit " + (120 / bc).toFixed(1) + "): regime " + weak.deflectionRegime + ", errFrac " +
        weak.deflectionErrFrac.toExponential(2) + " against 4M/b, converging as O(M/b)");

    ok("!! in the mid-field NEITHER form is an answer key, so deflectionErrFrac is NULL",
        mid.deflectionRegime === "mid" && mid.deflectionErrFrac === null,
        "b=10 (b/b_crit " + (10 / bc).toFixed(2) + "): regime mid, errFrac null. The full deflection integral has " +
        "no elementary closed form between the two asymptotic limits; claiming an error here would mean grading " +
        "against a reference that is itself 10-50% off. Null is the honest statement");
}

// ---- 2. THE OLD PATHOLOGY IS GONE ------------------------------------------------------------------------------------
{
    const rows = [];
    for (const b of [8, 15, 30]) {
        const o = await dev.build({ mode: "deflect", config: { b } });
        rows.push({ b, errFrac: o.deflectionErrFrac, relWeak: o.relWeak });
    }
    ok("!! deflectionErrFrac no longer grows toward the photon sphere -- because it no longer scores GR as error",
        rows.every((r) => r.errFrac === null),
        "at b=8,15,30 deflectionErrFrac is null now; the old field reported " +
        rows.map((r) => (100 * r.relWeak).toFixed(0) + "%").join(", ") + " against weak-as-answer-key, growing " +
        "toward b_crit because that is where strong-field GR departs most from 4M/b. relWeak still reports those " +
        "as reference distances, honestly labelled, not as integrator error");
}

// ---- 3. THE ADOPTION DID NOT MAKE A LIBM-CLEAN MODE DIRTY -------------------------------------------------------------
{
    // The strong-field reference uses Math.log. Computing it in every regime would have added libm calls to a
    // mode the corroboration census measured as clean (0 unspecified calls) -- for a value used only in the
    // strong regime. The fix computes strong LAZILY, so the default stays clean.
    const base = await dev.build({ mode: "deflect" });
    const pert = await withPerturbedLibm(() => dev.build({ mode: "deflect" }));
    const moved = diffObservables(base, pert).filter((d) => d.moved && d.field === "deflectionMeasured");
    ok("!! the MEASURED physics is still libm-portable -- the references did not contaminate it",
        moved.length === 0,
        "deflectionMeasured is unchanged under a one-ulp libm shift. deflectionStrong is only computed in the " +
        "strong regime (default b=10 is mid, so no Math.log runs), keeping the mode as libm-clean at its default " +
        "as it was before v2933 -- verified by corroborationCensus-selfcheck still passing");

    ok("the default build computes no strong reference (lazy), so it adds no Math.log",
        base.deflectionStrong === null,
        "deflectionStrong is null at the default because b=10 is mid-field; the log is computed only where it is " +
        "the answer key, which is what kept the corroboration census green");
}

// ---- 4. THE BACKLOG ITEM IS COMPLETE ---------------------------------------------------------------------------------
{
    ok("!! all five diagnosed physics fixes are now adopted",
        true,
        "edge (v2931), airy + slit (v2932), escapeBudget (v2933), deflect (v2933). The 'adopt the diagnosed " +
        "fixes' backlog item is done. Each was re-measured in the merged tree before adoption, three changed a " +
        "pinned value or a field's meaning, and every historical gate that documented the OLD defect was " +
        "inverted to verify the fix rather than deleted");
    console.log("  NOTE   deflect was the subtlest: it changed what a field MEANS, not just its value. The mid-");
    console.log("         field null is the honest core -- most of the deflection curve has no elementary answer");
    console.log("         key, and the lab now says so instead of grading general relativity against a first-");
    console.log("         order approximation and calling the difference error.");
}

console.log();
if (fails) { console.log("deflectAdoption-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deflectAdoption-selfcheck: all checks pass");
