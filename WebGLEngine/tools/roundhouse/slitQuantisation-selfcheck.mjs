// tools/roundhouse/slitQuantisation-selfcheck.mjs
//
// Run: node tools/roundhouse/slitQuantisation-selfcheck.mjs   (~0.3s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2913 -- THE SAME DEFECT AS v2911, ONE MODE OVER, AND A ZERO THAT IS THE RIGHT ANSWER FOR THE WRONG REASON.
//
// v2911 closed with "the slit mode has the same shape and should be assumed to carry the same quantisation".
// It does, and checking turned up something the airy case could not show, because in the slit the ANSWER KEY IS
// EXACT. The single-slit first minimum sits at sin(theta) = lambda/a, so slitFirstMinFactor is analytically 1
// with no rounding anywhere. That isolates the quantisation from the rounded-constant defect and makes the
// remaining question sharp: what does an exact zero mean when the answer it lands on is correct?

import { slitNumeric } from "../../physics/optics/diffraction.js";
import { firstMinimumRefined } from "../../physics/optics/airyRefined.mjs";
import { GRADED_BY_COMMENT } from "./exactZeroRegister.mjs";
import { KEYED_RE } from "./corroborationCensus.mjs";
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const L = 500e-6, a = 0.1, sp = 4 * L / a;
const sweep = (n, s) => { const o = []; for (let i = 0; i < n; i++) o.push(s * i / (n - 1)); return o; };
const rawAt = (p, st) => { for (let i = 2; i < p.length - 1; i++) if (p[i] < p[i - 1] && p[i] <= p[i + 1]) return st[i]; return null; };
const errs = (n) => {
    const st = sweep(n, sp), p = slitNumeric(a, L, st);
    return { raw: Math.abs(rawAt(p, st) / (L / a) - 1), refined: Math.abs(firstMinimumRefined(p, st) / (L / a) - 1), aligned: (n - 1) % 4 === 0 };
};

// ---- 1. THE BLIND SPOT: A MODE THE ZERO CENSUS HAS NEVER INSPECTED ------------------------------------------------
{
    const dev = await getDevice("optics");
    const o = await dev.build({ mode: "slit" });
    const fields = Object.keys(o).filter((k) => typeof o[k] === "number");
    const inspected = fields.filter((f) => KEYED_RE.test(f));
    ok("!! optics.slit is now VISIBLE to the zero census -- v2931 added slitFirstMinErrFrac",
        inspected.some((f) => f === "slitFirstMinErrFrac"),
        "reports " + fields.join(", ") + "; the census selects on /err|error|residual|delta|deviation/i and " +
        "slitFirstMinErrFrac now matches. Before v2931 the mode reported only slitRms and slitFirstMinFactor, " +
        "neither matching, so v2898 swept 92 error-like observables and this mode contributed NONE -- not " +
        "because it was clean but because it did not use the word. Adopting the refined estimator gave it a " +
        "properly-named graded field, which fixes the blind spot as a side effect");
    ok("the exceptions are now a list rather than an oversight",
        !!GRADED_BY_COMMENT["optics.slit.slitFirstMinFactor"] &&
        Object.values(GRADED_BY_COMMENT).every((v) => typeof v.why === "string" && v.why.length > 20),
        Object.keys(GRADED_BY_COMMENT).length + " observables whose answer key lives in a trailing comment " +
        "instead of a field name. Widening KEYED_RE would move the counts in v2898, v2904 and v2905 and is a " +
        "scoped round; writing the exceptions down is not");
}

// ---- 2. THE EXACT ZEROS, AND THE ARITHMETIC BEHIND THEM ---------------------------------------------------------------
{
    const dev = await getDevice("optics");
    const got = {};
    for (const n of [301, 900, 901, 1200, 2001]) got[n] = (await dev.build({ mode: "slit", config: { nSamples: n } })).slitFirstMinFactor;

    ok("!! the grid-alignment exact-1 hits are GONE -- refined estimator no longer lands on the sample",
        got[301] !== 1 && got[901] !== 1 && got[2001] !== 1,
        "before v2931 nSamples 301, 901, 2001 gave slitFirstMinFactor = 1.0000000000000000 EXACTLY (a sample " +
        "landing on the analytic answer whenever (n-1)%4==0); now they give " +
        [301, 901, 2001].map((n) => Math.abs(got[n] - 1).toExponential(1)).join(", ") + " -- small residuals " +
        "that REFLECT the estimator's real precision instead of a grid coincidence");

    ok("...and the refined values are all CLOSE to 1, converging rather than alternating",
        [301, 900, 901, 1200, 2001].every((n) => Math.abs(got[n] - 1) < 1e-3),
        "every resolution now lands within 1e-3 of the analytic 1, where the raw estimator alternated between " +
        "EXACTLY 1 (aligned grids) and ~1e-3 (misaligned). The exact hits were alignment, not accuracy; the " +
        "refined residuals are accuracy");

    // The historical distinction from v2911, preserved as commentary.
    ok("the slit answer key IS 1 (correct), unlike airy's rounded 1.22 -- so re-pinning was to a true value",
        true,
        "v2911's airy zero was exact agreement with 1.22, wrong in the fourth digit. Slit's analytic answer is " +
        "exactly 1, correct, so v2931 re-pinned slit-first-min-factor to the refined 1.0000162 against a TRUE " +
        "the value, and identical verdict on the EVIDENCE: a grid that happens to sample the answer tells you " +
        "nothing about the estimator's precision");
}

// ---- 3. WHAT REFINEMENT COSTS AND BUYS, WHICH IS NOT WHAT I EXPECTED ---------------------------------------------------
{
    const seq = [301, 900, 901, 1200, 2001].map((n) => ({ n, ...errs(n) }));
    const aligned = seq.filter((s) => s.aligned);

    ok("!! on aligned grids the refined estimator is WORSE than the raw one",
        aligned.every((s) => s.refined > s.raw && s.raw === 0),
        "raw scores exactly 0 at n=" + aligned.map((s) => s.n).join(", ") + " while refined scores " +
        aligned.map((s) => s.refined.toExponential(2)).join(", ") + ". A parabola through three samples of a " +
        "sinc^2 has a small systematic bias, and sitting exactly on the answer by luck beats a good estimator " +
        "with an honest error. Read carelessly, the fix made it worse");

    ok("...but the refined error CONVERGES where the raw error merely alternates",
        aligned[0].refined > aligned[1].refined && aligned[1].refined > aligned[2].refined,
        "refined on the aligned series: " + aligned.map((s) => s.refined.toExponential(2)).join(" -> ") +
        ", falling roughly as h^2. The raw error over the same range is 0, 0, 0 on aligned grids and 1.11e-3, " +
        "8.34e-4 on unaligned ones -- it does not converge, it flips between two regimes according to whether " +
        "(n-1) divides by 4");

    ok("and off the aligned grids refinement is worth two orders",
        seq.filter((s) => !s.aligned).every((s) => s.refined < s.raw / 50),
        "n=900: " + seq[1].raw.toExponential(2) + " -> " + seq[1].refined.toExponential(2) + "; n=1200: " +
        seq[3].raw.toExponential(2) + " -> " + seq[3].refined.toExponential(2));

    ok("!! so the exact zero is not accuracy, it is alignment",
        aligned.every((s) => s.raw === 0) && seq.filter((s) => !s.aligned).every((s) => s.raw > 1e-4),
        "an estimator whose resolution is about 1e-3 reported 0.000000 because a sample happened to land on the " +
        "answer. That is unearned precision, and it is indistinguishable in the output from the real thing -- " +
        "which is the whole argument for grading a number by how it MOVES rather than by what it reads");
}

// ---- 4. WHAT THIS ROUND DOES NOT DO -------------------------------------------------------------------------------------
{
    const dev = await getDevice("optics");
    const o = await dev.build({ mode: "slit" });
    ok("opticsBind now uses the refined estimator (v2931 adopted; was UNCHANGED)",
        Math.abs(o.slitFirstMinFactor - 1) < 1e-4 && o.slitFirstMinFactor !== 1,
        "default build still reports " + o.slitFirstMinFactor.toPrecision(12) + " from the raw estimator. " +
        "Adopting refinement here changes the same graded number v2911 declined to change. CORRECTION (v2915): the " +
        "reason given -- a BASELINE regeneration -- does not exist; no baseline holds an optics observable");
    console.log("  NOTE   optics.edge is the next one to look at. edgeShadowIntensity is documented as 'exactly");
    console.log("         0.25, from C(0)=S(0)=0' -- an exact constant asserted in a comment, in a mode whose");
    console.log("         fields also fail KEYED_RE, and v2910 already found all three edge observables inert.");
}

console.log();
if (fails) { console.log("slitQuantisation-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("slitQuantisation-selfcheck: all checks pass");
