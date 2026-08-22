// tools/roundhouse/assumptionCoherence-selfcheck.mjs
//
// Run: node tools/roundhouse/assumptionCoherence-selfcheck.mjs   (instant)
//
// v3131 -- AN ASSUMPTION'S PREDICATE AND ITS OWN STATED REASON CAN DISAGREE, AND NOTHING WAS COMPARING THEM.
//
// lens.deflect's "above-roundoff-crossover" held at dphi >= 2e-4 while its `why` said "below about 4e-4
// refining makes the answer WORSE". BOTH HALVES LOOK RIGHT IN ISOLATION. Read the predicate and it is a
// sensible threshold; read the reason and it is a correct piece of physics. Only reading them TOGETHER shows
// the assumption reporting SOUND across a band its own explanation calls unsound.
//
// *** AND THE MEASUREMENT AGREED WITH NEITHER: THE CROSSOVER IS AT 8e-4. *** Swept at M=1, b=60 over dphi from
// 1.6e-3 to 1e-5 -- a 160x range -- deflectionErrFrac falls from 0.05226212549 to 0.05226212465 between 1.6e-3
// and 8e-4 AND THEN STOPS, jittering within 8.4e-10 for the rest. Three numbers, three different answers, and
// the only one derived from the instrument was the one nobody had written down.
//
// THE GENERAL CHECK: for every declared assumption whose reason NAMES a numeric bound, the predicate must agree
// with that bound. This is cheap, it is derived from the text the author already wrote, and it would have
// caught the original discrepancy on the day it was introduced.
//
// WHAT IT CANNOT CHECK: whether the number in the reason is TRUE. Only a sweep does that, and a sweep needs the
// instrument. This gate proves the two halves of a declaration agree with each other -- it does not prove they
// agree with the world, and saying so matters because a coherent pair of wrong numbers would pass.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const A = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "assumptions.mjs")).href);
const S = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "soundness.mjs")).href);

// ---- 1. EVERY REASON THAT NAMES A BOUND MUST AGREE WITH ITS PREDICATE -----------------------------------------------
{
    // v3131 -- COMPARE THE DECLARED BOUND, NEVER A NUMBER SCRAPED OUT OF THE SENTENCE. My first version
    // parsed every numeric token in `why` and then failed the predicate for not holding at 8.4e-10 -- a
    // MEASUREMENT DETAIL, not a threshold. A reason names several numbers and only one of them is the bound;
    // the author knows which, so the author declares it.
    let checked = 0; const disagreed = [];
    for (const [key, list] of Object.entries(A.LAB_ASSUMPTIONS)) {
        for (const a of list) {
            // v3137 -- MIN *AND* MAX. This checked only `min`, so the two bounds declared at v3137 (optics'
            // far-field ceiling and chaos' first-bifurcation ceiling) were SILENTLY SKIPPED -- the counter
            // stayed at 1 while two new declarations went in unchecked. A coherence gate that cannot see half
            // the declaration types is the v3130 shape again: the check exists and does not fire, and the
            // ONLY tell was a count that failed to grow.
            if (!a.bound || !a.bound.field) continue;
            const isMin = Number.isFinite(a.bound.min), isMax = Number.isFinite(a.bound.max);
            if (!isMin && !isMax) continue;                                   // nothing to compare
            checked++;
            const edge = isMin ? a.bound.min : a.bound.max;
            // At the bound the predicate must HOLD; just past it, it must not. "Past" is below for a floor and
            // above for a ceiling -- the direction comes from which key was declared, never from guessing.
            // v3137 -- AND INCLUSIVITY, because chaos' bound is EXCLUSIVE: r = 3 is exactly where the
            // bifurcation happens, so the fixed point is not stable AT it. An exclusive bound must FAIL at the
            // edge and hold just inside; an inclusive one must HOLD at the edge and fail just outside. The
            // declaration says which -- guessing gave a false failure on a correct predicate.
            const inside = isMin ? edge * 1.01 : edge * 0.99;
            const outside = isMin ? edge * 0.99 : edge * 1.01;
            const at = a.bound.exclusive ? !a.holds({ [a.bound.field]: edge }) : a.holds({ [a.bound.field]: edge });
            const below = a.holds({ [a.bound.field]: outside }) === false && a.holds({ [a.bound.field]: inside }) === true;
            // AND THE REASON MUST MENTION IT. A declared bound the prose never states is a threshold only the
            // code knows, which is how the original 2e-4 / 4e-4 split survived in the first place.
            const stated = a.why.includes(String(edge)) || a.why.includes(edge.toExponential());
            if (at === true && below === true && stated) continue;
            disagreed.push({ key, id: a.id, bound: edge, kind: isMin ? "min" : "max", edgeBehaviourOk: at, insideOutsideOk: below, reasonStatesIt: stated });
        }
    }
    ok("!! every predicate agrees with the numeric bound its own reason names",
        disagreed.length === 0 && checked > 0,
        checked + " comparable assumption(s) checked" +
        (disagreed.length ? "; DISAGREE: " + JSON.stringify(disagreed) : "") +
        ". lens.deflect's predicate said 2e-4 while its reason said 4e-4 -- BOTH LOOK RIGHT IN ISOLATION and " +
        "only reading them together shows the assumption passing a band its own explanation calls unsound");
}

// ---- 2. THE MEASUREMENT, AND WHAT IT COST -----------------------------------------------------------------------------
{
    ok("!! the crossover is a NAMED constant, not a literal buried in a predicate",
        A.DPHI_CROSSOVER === 8e-4 && /holds: \(c\) => \(c\.dphi \|\| 0\) >= DPHI_CROSSOVER/.test(
            fs.readFileSync(path.join(ENG, "tools", "roundhouse", "assumptions.mjs"), "utf8")),
        "MEASURED at 8e-4 by sweeping dphi over a 160x range. Named so the predicate and the reason cannot " +
        "drift apart again without one of them mentioning a different number");

    ok("!! and the corrected threshold REFUSES what it used to pass",
        S.soundnessAt("lens", "deflect", { M: 1, b: 60, dphi: 2e-4 }).verdict === "unsound" &&
        S.soundnessAt("lens", "deflect", { M: 1, b: 60, dphi: 8e-4 }).verdict === "sound",
        "*** dphi=2e-4 IS THE OPERATING POINT AT WHICH lens.deflect WAS RECORDED AS CORROBORATED. *** It is " +
        "now UNSOUND -- four times past the measured crossover, where criterion 3 (convergence) is exactly the " +
        "'decided by sampling luck' the reason warns about. The corroboration needs re-running at dphi >= 8e-4 " +
        "rather than being quietly carried forward");
}

// ---- 3. WHAT THIS GATE DOES NOT PROVE ---------------------------------------------------------------------------------
{
    ok("a reason with NO number is not forced to invent one",
        A.LAB_ASSUMPTIONS["lens.scale"][0].why.length > 0 &&
        A.LAB_ASSUMPTIONS["kerr.limit"][0].holds({ a: 0 }) === true,
        "lens.scale's predicate is over an ARRAY and kerr.limit's bound is exactly zero -- neither has a " +
        "scalar threshold to compare, and manufacturing one would invent a failure");
    console.log("  NOTE   THIS PROVES THE TWO HALVES OF A DECLARATION AGREE WITH EACH OTHER. It does NOT prove");
    console.log("         they agree with the world -- A COHERENT PAIR OF WRONG NUMBERS WOULD PASS. Only a sweep");
    console.log("         settles the value, and a sweep needs the instrument. The 8e-4 above came from one;");
    console.log("         the other 24 modes have no declared assumptions to be coherent or incoherent about.");
}

console.log();
if (fails) { console.log("assumptionCoherence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("assumptionCoherence-selfcheck: all checks pass");
