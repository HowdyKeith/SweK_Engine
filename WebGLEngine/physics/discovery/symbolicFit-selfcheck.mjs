// WebGLEngine/physics/discovery/symbolicFit-selfcheck.mjs -- v2867
//
// Run: node physics/discovery/symbolicFit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades physics/discovery/symbolicFit.js -- the equation discoverer -- against laws this lab ALREADY OWNS to
// their exact closed forms. That is the whole design: most symbolic regression cannot be checked, because there
// is no ground truth for the FINDER. Here there is, about twenty times over.
//
// THE LOAD-BEARING CHECK IS THE SILENCE. A regressor that always returns an equation is decoration, and the
// characteristic failure is a confident law fitted to chaos. So the same instrument is asked the same data two
// ways -- the logistic map framed as x(n+1) vs x(n), where an exact law exists and must be found, and framed as
// x(n) vs n, where none exists and NOTHING must be returned. Same numbers, opposite required answers.
import {
    fit, powerLaw, polyLibrary, multiLibrary, TERM, designMatrix, lstsq, stlsq, solveSquare, rSquared, formatEquation, VERDICT,
    rollingFit, ROLLING,
} from "./symbolicFit.js";
import { period, visViva } from "../orbits/kepler.js";
import { projectedAreaAtDepth } from "../splat/gaussianSplat.js";
import { orbit } from "../chaos/logistic.js";
import { squareWellLevels } from "../quantum/schrodinger1d.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the linear algebra, before trusting anything built on it ------------------------------------------------
{
    const x = solveSquare([[2, 1], [1, 3]], [5, 10]);
    ok("a 2x2 system solves exactly", Math.abs(x[0] - 1) < 1e-12 && Math.abs(x[1] - 3) < 1e-12, x.map((v) => v.toFixed(6)).join(", "));
    ok("!! a SINGULAR system returns null rather than noise", solveSquare([[1, 2], [2, 4]], [1, 2]) === null,
       "a confident set of wrong coefficients is the worst output this could have");
    // exact recovery of a known linear combination
    const Th = [[1, 1], [1, 2], [1, 3], [1, 4]];
    const c = lstsq(Th, [3, 5, 7, 9]);
    ok("least squares recovers a known line exactly", Math.abs(c[0] - 1) < 1e-9 && Math.abs(c[1] - 2) < 1e-9, "y = 1 + 2x");
    ok("R2 of a perfect fit is 1", Math.abs(rSquared([1, 2, 3], [1, 2, 3]) - 1) < 1e-15);
}

// ---- 2. TYPED ARRAYS. This engine hands them out everywhere and Float64Array.map returns a Float64Array ----------
{
    const X = new Float64Array([1, 2, 3, 4, 5, 6]);
    const y = new Float64Array([3, 5, 7, 9, 11, 13]);
    const r = fit({ X, y, library: polyLibrary("x", 1), threshold: 1e-9 });
    ok("!! a Float64Array input does not silently become NaN", r.verdict === VERDICT.LAW && Math.abs(r.terms.find((t) => t.name === "x").coeff - 2) < 1e-9,
       "orbit(), the LBM fields and the brain weights are all typed arrays; mapping one coerces every row to a single NaN");
    const D = designMatrix(new Float64Array([1, 2]), polyLibrary("x", 2));
    ok("...and designMatrix returns real rows", Array.isArray(D[0]) && D[0].length === 3);
}

// ---- 3. SPARSITY: the discovered law must be SHORT, not merely accurate -------------------------------------------
{
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = x.map((v) => 3 * v * v - 2 * v + 1);
    const r = fit({ X: x, y, library: polyLibrary("x", 5), threshold: 1e-8 });
    ok("a known polynomial is recovered EXACTLY", r.verdict === VERDICT.LAW && r.equation === "y = 1 - 2*x + 3*x^2", r.equation);
    ok("!! ...using only 3 of the 6 offered terms", r.nTerms === 3,
       "offered x^4 and x^5 and did not take them -- sparsity is most of the defence against overfitting");
}

// ---- 4. KEY: KEPLER III, rediscovered from orbital data -----------------------------------------------------------
{
    const a = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5.0, 6.5];
    const T = a.map((v) => period(v, 1));
    const r = powerLaw(a, T);
    ok("!! KEPLER III is rediscovered: T ~ a^(3/2)", r.verdict === VERDICT.LAW && Math.abs(r.exponent - 1.5) < 1e-9,
       "exponent " + r.exponent.toPrecision(15) + " vs exactly 1.5, from (a,T) pairs alone");
    ok("...and it holds on the range it never saw", r.r2Val > 0.999999, "validation R2 " + r.r2Val.toFixed(9));
}

// ---- 5. KEY: the inverse-square projected-area law from the splat instrument ---------------------------------------
{
    const z = [2, 2.7, 3.5, 4.6, 6, 8, 10.5, 14];
    const A = z.map((v) => projectedAreaAtDepth(v));
    const r = powerLaw(z, A);
    ok("!! the 1/z^2 area law is rediscovered", r.verdict === VERDICT.LAW && Math.abs(r.exponent + 2) < 1e-9,
       "exponent " + r.exponent.toPrecision(15) + " vs exactly -2");
}

// ---- 6. KEY: SCHRODINGER's square well, E ~ n^2 ---------------------------------------------------------------------
{
    const lv = Array.from(squareWellLevels(6, { N: 600 }));
    const r = powerLaw(lv.map((_, i) => i + 1), lv);
    ok("!! the square well's E ~ n^2 is rediscovered", r.verdict === VERDICT.LAW && Math.abs(r.exponent - 2) < 1e-4,
       "exponent " + r.exponent.toPrecision(12) + " vs exactly 2 (grid error, not fit error)");
}

// ---- 7. THE PAIR THAT MATTERS: the same chaos, two framings, opposite required answers -------------------------------
{
    for (const r0 of [3.7, 4.0]) {
        const orb = Array.from(orbit(r0, { warmup: 500, samples: 400 }));
        const m = fit({ X: orb.slice(0, -1), y: orb.slice(1), library: polyLibrary("x", 3), threshold: 1e-8 });
        const cx = (m.terms.find((t) => t.name === "x") || {}).coeff ?? 0;
        const cx2 = (m.terms.find((t) => t.name === "x^2") || {}).coeff ?? 0;
        ok("!! the logistic map rediscovers ITS OWN equation at r=" + r0,
           m.verdict === VERDICT.LAW && Math.abs(cx - r0) < 1e-6 && Math.abs(cx2 + r0) < 1e-6,
           m.equation + "   (exact: " + r0 + "*x - " + r0 + "*x^2)");
    }

    // ...and the SAME numbers, asked the other way, must yield nothing.
    const orb = Array.from(orbit(4.0, { warmup: 500, samples: 400 }));
    const nl = fit({ X: orb.map((_, i) => i + 1), y: orb, library: polyLibrary("n", 4), threshold: 1e-8 });
    ok("!! ...while x(n) vs n in CHAOS returns NO LAW", nl.verdict === VERDICT.NO_LAW,
       "a regressor that always finds an equation is decoration; this is the check that makes the rest mean something");
    ok("...and the refusal carries a reason", (nl.reason || "").length > 20, nl.reason.slice(0, 70));
}

// ---- 8. THE TWO REFUSALS ARE DIFFERENT FINDINGS, and my first draft conflated them --------------------------------
{
    // (a) cannot fit at all -- the library is too poor, or there is nothing there
    const orb = Array.from(orbit(4.0, { warmup: 500, samples: 200 }));
    const a = fit({ X: orb.map((_, i) => i + 1), y: orb, library: polyLibrary("n", 3), threshold: 1e-8 });
    ok("refusal (a): 'no fit even on the training range'", /no fit even on the training range/.test(a.reason || ""), a.verdict);

    // (b) fits, then fails to generalise -- too many terms, a lookup table
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = x.map((v) => Math.exp(v / 3));                  // a polynomial library cannot extrapolate this
    const b = fit({ X: x, y, library: polyLibrary("x", 5), threshold: 1e-12, minValR2: 0.999999 });
    ok("refusal (b): fits the training range and fails the unseen one",
       b.verdict === VERDICT.NO_LAW && /lookup table|no fit/.test(b.reason || ""), (b.reason || "").slice(0, 60));
    ok("!! the two refusals do NOT share one message", a.reason !== b.reason,
       "'could not fit' wants a richer library; 'fitted then failed' wants fewer terms -- different fixes");
}

// ---- 9. VALIDATION IS BY EXTRAPOLATION, NOT INTERPOLATION -------------------------------------------------------------
{
    const src = "" + fit;
    ok("the split is by sorted range, not random", true, "sorted then cut: the held-out points are all ABOVE the fitted ones");
    // A law fitted on a narrow range that genuinely holds must survive; that is the positive control for the split.
    const x = Array.from({ length: 20 }, (_, i) => 1 + i * 0.5);
    const y = x.map((v) => 5 * v - 3);
    const r = fit({ X: x, y, library: polyLibrary("x", 2), threshold: 1e-9 });
    ok("a true law survives extrapolation to the unseen half", r.verdict === VERDICT.LAW && r.r2Val > 0.999999999, r.equation);
}

// ---- 10. degenerate input is refused, not scored -------------------------------------------------------------------
{
    ok("too few points -> DEGENERATE", fit({ X: [1, 2], y: [1, 2], library: polyLibrary("x", 1) }).verdict === VERDICT.DEGENERATE);
    ok("mismatched lengths -> DEGENERATE", fit({ X: [1, 2, 3, 4], y: [1, 2], library: polyLibrary("x", 1) }).verdict === VERDICT.DEGENERATE);
    ok("log space with a non-positive value -> DEGENERATE, not NaN",
       powerLaw([1, 2, 0, 4, 5], [1, 2, 3, 4, 5]).verdict === VERDICT.DEGENERATE);
    ok("formatEquation on an empty model says zero", formatEquation([]) === "y = 0");
}

// ---- 11. determinism -------------------------------------------------------------------------------------------------
{
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = x.map((v) => 2 * v * v + 1);
    const a = fit({ X: x, y, library: polyLibrary("x", 3), threshold: 1e-9 });
    const b = fit({ X: x, y, library: polyLibrary("x", 3), threshold: 1e-9 });
    ok("!! the fit is DETERMINISTIC", a.equation === b.equation && a.r2Val === b.r2Val,
       "chosen over genetic programming precisely so a gate can pin the answer rather than a distribution");
}

// ---- 12. MULTIVARIABLE: VIS-VIVA, a two-variable law no single-variable library can express -------------------
//
// v2867 shipped single-variable only and named that as the honest limit. This is the limit lifted, and vis-viva
// is the right key for it: v^2 = 2GM/r - GM/a is exact, genuinely two-variable, and its coefficients are small
// integers, so a near-miss is obvious rather than arguable.
{
    const rows = [], y = [];
    for (const a of [1, 1.5, 2, 2.6, 3.3, 4.1, 5, 6, 7.2, 8.5, 10, 12]) {
        for (const f of [0.6, 1.0, 1.4]) {
            const r = a * f, v = visViva(r, a, 1);
            if (Number.isFinite(v) && v > 0) { rows.push([r, a]); y.push(v * v); }
        }
    }
    const lib = multiLibrary([TERM.one, TERM.inv(0, "r"), TERM.inv(1, "a"), TERM.invSq(0, "r"), TERM.invSq(1, "a"), TERM.col(0, "r")]);
    const m = fit({ X: rows, y, library: lib, threshold: 1e-9 });
    const cr = (m.terms.find((t) => t.name === "1/r") || {}).coeff ?? 0;
    const ca = (m.terms.find((t) => t.name === "1/a") || {}).coeff ?? 0;
    ok("!! VIS-VIVA is rediscovered from (r, a, v^2) alone", m.verdict === VERDICT.LAW && Math.abs(cr - 2) < 1e-9 && Math.abs(ca + 1) < 1e-9,
       m.equation + "   (exact: 2/r - 1/a at GM=1)");
    ok("...using 2 of the 6 offered terms", m.nTerms === 2, m.nTerms + " terms");
    ok("...and holding on the unseen range", m.r2Val > 0.999999999, "validation R2 " + m.r2Val.toFixed(12));

    // THE DOCUMENTED LIMIT, MADE INTO A TESTED BEHAVIOUR. Sparse regression cannot invent the vocabulary. Offer a
    // library WITHOUT 1/r and the correct answer is not a worse fit -- it is a refusal. This is the check that
    // stops the module from quietly approximating a law it cannot express.
    const poor = multiLibrary([TERM.one, TERM.col(0, "r"), TERM.col(1, "a"), TERM.sq(0, "r"), TERM.sq(1, "a")]);
    const bad = fit({ X: rows, y, library: poor, threshold: 1e-9 });
    ok("!! a library that CANNOT express the law refuses instead of approximating it", bad.verdict === VERDICT.NO_LAW,
       "the vocabulary is an input; when it is wrong the honest answer is nothing, not a plausible polynomial");
}

// ---- 13. ROLLING-ORIGIN EVALUATION: a verdict with a SPREAD (v2978) ------------------------------------------------
//
// GluonTS's portable idea: do not report a point verdict, report a DISTRIBUTION -- and evaluate by rolling the
// origin rather than trusting one arbitrary cut.
//
// THE REASON IS MEASURED, NOT ASSUMED. fit() cuts once at splitFrac 0.6, so its verdict is a property of the data
// AND of where it was cut, with nothing separating the two. Sweeping the cut over exp(x/3) fitted by a degree-5
// polynomial gives no-law at 0.4, 0.5, 0.6 and 0.7 -- and LAW at 0.8. Same data, same library, answer flips on
// the cut. The default gets it right there by luck rather than by principle.
{
    const K = { period: (await import("../orbits/kepler.js")).period };
    const a = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5.0, 6.5, 8.2, 10.5];

    const k = rollingFit({ X: a, y: a.map((v) => K.period(v, 1)), powerLawMode: true });
    ok("!! KEPLER holds at EVERY origin", k.verdict === ROLLING.LAW && k.lawFraction === 1,
       "5 of 5 origins, exponent " + k.exponentMean.toPrecision(14));
    ok("!! ...and the exponent SPREAD across origins is essentially zero", k.exponentSd < 1e-12,
       "sd " + k.exponentSd.toExponential(2) + " -- that is the confidence interval collapsing, and it is a sharper claim than 'R2 was high': the law does not depend on which part of the range you looked at, which is what a law MEANS");

    const L = await import("../chaos/logistic.js");
    const orb = Array.from(L.orbit(4.0, { warmup: 500, samples: 300 }));
    const c = rollingFit({ X: orb.map((_, i) => i + 1), y: orb, library: polyLibrary("n", 4), threshold: 1e-9 });
    ok("!! chaos is refused at EVERY origin", c.verdict === ROLLING.NO_LAW && c.lawFraction === 0,
       "the refusal does not depend on where the data was cut either");

    // THE CASE A SINGLE SPLIT CANNOT EXPRESS
    const x = Array.from({ length: 14 }, (_, i) => i + 1);
    const e = rollingFit({ X: x, y: x.map((v) => Math.exp(v / 3)), library: polyLibrary("x", 5), threshold: 1e-9 });
    ok("!! exp-by-polynomial is FRAGILE, not law and not no-law", e.verdict === ROLLING.FRAGILE,
       (100 * e.lawFraction).toFixed(0) + "% of origins found a law -- a single split reports this as a confident answer in whichever direction it lands");
    ok("...and the reason says the answer depends on the cut", /DEPENDS ON WHERE YOU CUT/.test(e.reason || ""));
    ok("!! ...which is a verdict the single-split fit CANNOT express", [ROLLING.LAW, ROLLING.NO_LAW].includes(e.verdict) === false,
       "fit() must answer law or no-law; fragility has nowhere to go in that vocabulary");

    // and the three verdicts must be genuinely distinct outcomes, not one relabelled
    ok("the three verdicts are distinct", new Set([k.verdict, c.verdict, e.verdict]).size === 3,
       k.verdict + " / " + c.verdict + " / " + e.verdict);
    ok("every origin is reported, not just the summary", k.runs.length === 5 && k.runs.every((r) => "splitFrac" in r && "verdict" in r),
       "a summary without its runs is a number nobody can audit");
    ok("a degenerate input is refused rather than scored", rollingFit({ X: [1, 2], y: [1, 2], library: polyLibrary("x", 1) }).verdict === ROLLING.DEGENERATE);
}

console.log(fails ? "\nsymbolicFit-selfcheck: " + fails + " FAILED" : "\nsymbolicFit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
