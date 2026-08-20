// WebGLEngine/tools/ship/productDist-selfcheck.mjs -- v3056
//
// Run: node tools/ship/productDist-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES math/productDist.js -- the product-of-gammas INSTRUMENT. v3055 built a Meijer G evaluator; an evaluator
// computes a function but does not measure anything. This measures a distribution by Monte Carlo and grades the
// samples against a law nobody tabulated.
//
// FOUR INDEPENDENT ROUTES TO THE SAME DISTRIBUTION, and they must agree:
//   1. MC samples   -- a gamma sampler and a product. No special functions anywhere.
//   2. the pdf      -- G^{n,0}_{0,n},   m=n residue sum, no upper parameters
//   3. the cdf      -- G^{n,1}_{1,n+1}, a DIFFERENT (m,n,p,q), with an upper parameter
//   4. the moments  -- PROD Gamma(a_i+k)/Gamma(a_i). No G at all.
// A bug in the residue sum would have to corrupt two different G parameter families AND the sampler AND the
// moments in exactly the same direction to survive. That is what makes this a test rather than a demonstration.
//
// THE CENTRAL CHECK IS SECTION 2: F'(y) == f(y) by central difference, at many points. It ties the two G families
// together LOCALLY, so it cannot be satisfied by a normalisation that happens to work out -- and unlike
// "integrates to 1" it has no tail-truncation error to hide behind.
//
// AND SECTION 4 IS WHY THE KS TEST IS A TEST: a KS statistic on the CORRECT law passing proves very little on its
// own -- D always shrinks with n and always looks small. The instrument only earns the name if the same test
// REJECTS a law that is subtly wrong. So the shapes are perturbed by 8% and the test must fire.

import { readFileSync } from "node:fs";
import {
    productPdf, productCdf, exactMoment, sampleProduct, sampleGamma, mulberry32, ksTest, shapeProblems,
} from "../../math/productDist.js";
import { gamma } from "../../math/meijerG.js";
import { codeOnly, noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (g, w) => Math.abs(g - w) / Math.max(Math.abs(w), 1e-300);

// Shapes chosen so no pair differs by an integer and none is an integer -- see shapeProblems(). [1.5, 2.5] would
// be degenerate and is used as a refusal fixture below rather than quietly avoided.
const SH2 = [1.3, 2.7];
const SH3 = [0.7, 1.3, 2.45];

// --- 1. n = 1 must BE the gamma distribution ------------------------------------------------------------------
{
    const MARGIN = 40;                 // the only tuned constant; everything else is predicted
    const a = 1.7;
    let worstP = 0, worstC = 0;
    for (const y of [0.15, 0.4, 1.3, 3.2, 6.5]) {
        const p = productPdf(y, [a]), c = productCdf(y, [a]);
        const wantP = Math.pow(y, a - 1) * Math.exp(-y) / gamma(a);
        // regularized lower incomplete gamma by its own series -- an independent reference
        let t = Math.pow(y, a) * Math.exp(-y) / a, s = t;
        for (let k = 1; k < 400; k++) { t *= y / (a + k); s += t; if (Math.abs(t) < 1e-17 * Math.abs(s)) break; }
        const wantC = s / gamma(a);
        // DERIVED TOLERANCE, the v3055 pattern: each point must land inside the error its own reported
        // cancellation predicts. A fixed 1e-12 failed here at y=6.5 -- correctly, since the alternating series
        // has spent ~5 digits by then -- and loosening the constant would have been tuning until green.
        worstP = Math.max(worstP, rel(p.value, wantP) / (Math.pow(10, p.cancellation) * 2.3e-16 * MARGIN));
        worstC = Math.max(worstC, rel(c.value, wantC) / (Math.pow(10, c.cancellation) * 2.3e-16 * MARGIN));
    }
    ok("!! a single factor reproduces the Gamma pdf, to the accuracy its own cancellation predicts",
        worstP < 1, "worst point used " + (100 * worstP).toFixed(1) + "% of its predicted error budget");
    ok("!! ...and the Gamma cdf, via a DIFFERENT G family", worstC < 1,
        "worst point used " + (100 * worstC).toFixed(1) + "% of its budget");
}

// --- 2. THE CROSS-FAMILY CHECK: F'(y) == f(y) ------------------------------------------------------------------
// Local, so no normalisation can fake it; no tail truncation to hide in.
{
    for (const [label, sh] of [["2 factors", SH2], ["3 factors", SH3]]) {
        let worst = 0, at = 0, checked = 0;
        for (const y of [0.3, 0.8, 1.5, 2.5, 4, 6, 9, 13]) {
            const h = y * 1e-4;
            const up = productCdf(y + h, sh), dn = productCdf(y - h, sh), f = productPdf(y, sh);
            if (!up.ok || !dn.ok || !f.ok || !f.reliable) continue;
            checked++;
            const num = (up.value - dn.value) / (2 * h);
            const e = rel(num, f.value);
            if (e > worst) { worst = e; at = y; }
        }
        // The bar is set by the central difference itself: O(h^2) truncation plus O(eps/h) rounding, which for
        // h ~ 1e-4 y bottoms out near 1e-8. A tighter bound would be testing the finite difference, not the code.
        ok("!! " + label + ": d/dy of the cdf equals the pdf at every point", worst < 1e-6 && checked >= 6,
            checked + " points, worst rel " + worst.toExponential(1) + " at y=" + at);
    }
}

// --- 3. MOMENTS: a witness with no G in it ---------------------------------------------------------------------
{
    ok("E[Y] and E[Y^2] match PROD Gamma(a+k)/Gamma(a)", (() => {
        const m1 = exactMoment(SH2, 1), m2 = exactMoment(SH2, 2);
        return rel(m1, 1.3 * 2.7) < 1e-13 && rel(m2, (1.3 * 2.3) * (2.7 * 3.7)) < 1e-13;
    })(), "E[Y] = PROD a_i for scale 1; E[Y^2] = PROD a_i(a_i+1)");

    // the MC sampler must land on those moments -- this checks the SAMPLER, independently of every G
    const rng = mulberry32(20260727);
    const N = 40000, xs = [];
    for (let i = 0; i < N; i++) xs.push(sampleProduct(SH2, rng));
    const mean = xs.reduce((p, q) => p + q, 0) / N;
    const m2 = xs.reduce((p, q) => p + q * q, 0) / N;
    const eM = exactMoment(SH2, 1), eV = exactMoment(SH2, 2) - eM * eM;
    const se = Math.sqrt(eV / N);
    ok("!! the sampler's mean lands within 4 standard errors of the exact mean",
        Math.abs(mean - eM) < 4 * se, "MC " + mean.toFixed(4) + " vs exact " + eM.toFixed(4) + " (4 s.e. = " + (4 * se).toFixed(4) + ")");
    ok("...and the second moment too", rel(m2, exactMoment(SH2, 2)) < 0.05);
    ok("a single gamma sample has the right mean (the sampler itself, no product)", (() => {
        const r2 = mulberry32(7); let s = 0;
        for (let i = 0; i < 40000; i++) s += sampleGamma(0.6, r2);
        return Math.abs(s / 40000 - 0.6) < 0.02;
    })(), "shape 0.6 exercises the a<1 boost path");
}

// --- 4. THE INSTRUMENT: KS against the exact law, and the SABOTAGE that gives it power ---------------------------
{
    const rng = mulberry32(987654321);
    const smp = [];
    for (let i = 0; i < 4000; i++) smp.push(sampleProduct(SH2, rng));

    const good = ksTest(smp, SH2);
    say("KS vs the true law: D=" + good.D.toFixed(5) + "  p=" + good.pValue.toFixed(4) +
        "  (critical D at 95% = " + good.critical95.toFixed(5) + ", " + good.evaluated + " points used, " + good.refused + " unreliable)");
    ok("!! KS does NOT reject the law the samples actually came from", good.reject === false && good.pValue > 0.05);
    ok("...and it used essentially every sample rather than quietly discarding the hard ones",
        good.refused < good.n * 0.02, good.refused + " of " + good.n + " excluded as unreliable");

    // SABOTAGE: the same samples, graded against shapes 8% off. If this also passes, the test measures nothing.
    const wrong = ksTest(smp, [SH2[0] * 1.08, SH2[1] * 1.08]);
    say("KS vs shapes 8% off:  D=" + wrong.D.toFixed(5) + "  p=" + wrong.pValue.toExponential(2));
    ok("!! SABOTAGE(shapes 8% off): the SAME samples are REJECTED", wrong.reject === true,
        "a KS test that passed both would be a control that cannot fail -- D always shrinks with n and always looks small");
    ok("...and the wrong law is clearly further away, not marginally", wrong.D > good.D * 3,
        "D " + wrong.D.toFixed(5) + " vs " + good.D.toFixed(5));

    // and a THIRD law: right marginals, wrong dependence -- a sum instead of a product
    const sums = [];
    const rng2 = mulberry32(555);
    for (let i = 0; i < 4000; i++) sums.push(sampleGamma(SH2[0], rng2) + sampleGamma(SH2[1], rng2));
    ok("SABOTAGE(sum instead of product): rejected, so the law tests the COMBINATION not just the pieces",
        ksTest(sums, SH2).reject === true);
}

// --- 5. REFUSALS, inherited from the G and named here -----------------------------------------------------------
{
    ok("refuses shapes that differ by an integer, naming the pair", (() => {
        const p = shapeProblems([1.5, 2.5]);
        return p.length > 0 && /differ by the integer 1/.test(p[0]) && /poles collide/.test(p[0]);
    })());
    ok("refuses an INTEGER shape, because it collides with the trailing 0 in the cdf's b-list", (() => {
        const p = shapeProblems([2, 1.3]);
        return p.some((x) => /is an integer/.test(x) && /trailing 0/.test(x));
    })());
    ok("accepts shapes that are merely close but not integer-separated", shapeProblems([1.3, 2.7, 0.45]).length === 0);
    ok("productPdf/productCdf refuse rather than returning a number", (() => {
        const a = productPdf(1, [1.5, 2.5]), b = productCdf(1, [1.5, 2.5]);
        return a.ok === false && b.ok === false && /poles collide/.test(a.reason);
    })());
    ok("a non-positive shape is refused", shapeProblems([-1, 1.3]).length > 0);
}

// --- 6. THE HONEST LIMIT, measured and kept ---------------------------------------------------------------------
// More factors means a wider dynamic range and a longer alternating sum, so the G loses digits. Reported per
// case, never asserted as a threshold -- and the point is that the code knows before the caller does.
{
    let anyUnreliable = false;
    for (const [label, sh, ys] of [["2 factors", SH2, [1, 10, 40]], ["3 factors", SH3, [1, 10, 40]], ["4 factors", [0.7, 1.3, 2.45, 3.15], [1, 10, 40]]]) {
        for (const y of ys) {
            const r = productCdf(y, sh);
            if (!r.ok) { say(label + " cdf(" + y + "): REFUSED -- " + r.reason.slice(0, 60)); continue; }
            say(label + " cdf(" + y + ") = " + r.value.toPrecision(8) + "   digits lost " + r.cancellation.toFixed(1) + (r.reliable ? "" : "   <-- NOT RELIABLE"));
            if (!r.reliable) anyUnreliable = true;
        }
    }
    ok("the instrument reports reliability per evaluation, not once for the whole run", (() => {
        const r = productCdf(5, SH2);
        return r.ok && typeof r.reliable === "boolean" && typeof r.cancellation === "number";
    })());
    ok("HONEST NOTE KEPT: ksTest counts what it had to exclude instead of silently dropping it", (() => {
        const src = readFileSync(new URL("../../math/productDist.js", import.meta.url), "utf8");
        return /refused\+\+/.test(codeOnly(src)) && /refused/.test(src) && /flatter the test/.test(src);
    })());
    if (anyUnreliable) say("at least one evaluation above was flagged unreliable -- that is the limit being visible, not a failure");
}

// --- 7. browser-safe --------------------------------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../math/productDist.js", import.meta.url), "utf8");
    const code = codeOnly(src);
    // The import PATH is a string, so codeOnly() blanks it -- sixth time this session that a check hunted text
    // through the stripper that removes text. noComments() keeps strings; codeOnly is for idioms.
    const text = noComments(src);
    ok("imports only math/meijerG.js; no DOM, no node builtins",
        (text.match(/^\s*import[^\n]*/gm) || []).every((l) => /["']\.\/meijerG\.js["']/.test(l)) &&
        !/\bdocument\s*[.[]/.test(code) && !/\bwindow\s*[.[]/.test(code));
    ok("the RNG is seeded, so a failing run is reproducible rather than 'sometimes'", /mulberry32/.test(code));
}

console.log("productDist-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
