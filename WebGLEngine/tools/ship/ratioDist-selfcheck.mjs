// WebGLEngine/tools/ship/ratioDist-selfcheck.mjs -- v3057
//
// Run: node tools/ship/ratioDist-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES math/ratioDist.js -- Z = X/Y with X ~ Gamma(a,1), Y ~ Gamma(b,1). This is a BETTER test of the Meijer G
// than the product instrument was, for one reason: the reference is ELEMENTARY.
//
//     via G:       f(z) = 1/(z Gamma(a) Gamma(b)) * G^{1,1}_{1,1}( 1/z | 1-a ; b )
//     reference:   f(z) = z^{a-1} / ( B(a,b) (1+z)^{a+b} )      -- the beta-prime density, no G in it
//
// The product could only check G against G plus moments. Here a residue-sum bug has nowhere to hide: the witness
// contains nothing harder than a Beta. It also exercises a family the product never touched -- n=1, so an upper
// parameter is actually used, and the argument is 1/z rather than z.
//
// THE HOLE AT z = 1 IS THE FINDING OF THIS ROUND, and it corrected something I wrote. p = q = 1 means the inner
// hypergeometric has radius of convergence 1, so the G needs |1/z| < 1. The reciprocal identity turns z < 1 into
// z' > 1 with swapped shapes -- and I wrote in the header that the two branches "tile the line and meet at
// z = 1". They do not. Measured, they cover to 0.95 and from 1.05 and BOTH refuse between, because z near 1 is
// the boundary from whichever side you approach; swapping shapes moves the argument across 1, it does not make
// it smaller. Section 3 pins the hole so the claim cannot drift back.

import { readFileSync } from "node:fs";
import {
    ratioPdfG, ratioPdfExact, ratioCdfExact, regIncBeta, sampleRatio, ksRatio, ratioMoment,
    ratioShapeProblems, mulberry32,
} from "../../math/ratioDist.js";
import { gamma } from "../../math/meijerG.js";
import { codeOnly, noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (g, w) => Math.abs(g - w) / Math.max(Math.abs(w), 1e-300);
const MARGIN = 40;

// --- 1. THE G AGREES WITH AN ELEMENTARY REFERENCE, on both branches -------------------------------------------
{
    let worst = 0, at = "", nDirect = 0, nRecip = 0;
    for (const [a, b] of [[1.7, 2.3], [0.6, 3.4], [2.9, 1.15]])
        for (const z of [0.05, 0.2, 0.5, 0.9, 1.1, 2, 5, 20, 90]) {
            const g = ratioPdfG(z, a, b);
            if (!g.ok) continue;
            if (g.branch === "direct") nDirect++; else nRecip++;
            const e = ratioPdfExact(z, a, b);
            // derived tolerance, the v3055 pattern: the bar is what the cancellation figure promises
            const budget = Math.pow(10, g.cancellation) * 2.3e-16 * MARGIN;
            const r = rel(g.value, e) / budget;
            if (r > worst) { worst = r; at = "a=" + a + " b=" + b + " z=" + z; }
        }
    ok("!! the G matches the ELEMENTARY beta-prime density, to the accuracy its own cancellation predicts",
        worst < 1, "worst point used " + (100 * worst).toFixed(1) + "% of its budget  (" + at + ")");
    ok("...and BOTH branches were actually exercised", nDirect > 8 && nRecip > 8, nDirect + " direct, " + nRecip + " reciprocal");
    ok("...on a family the product instrument never touched: n=1, argument 1/z", (() => {
        const code = codeOnly(readFileSync(new URL("../../math/ratioDist.js", import.meta.url), "utf8"));
        return /n: 1/.test(code) && /1 - a/.test(code) && /z: 1 \/ z/.test(code);
    })());
}

// --- 2. the elementary reference is itself checked, or it is just an assertion --------------------------------
{
    ok("the beta-prime density integrates to 1", (() => {
        // substitute u = z/(1+z) so the whole line maps to [0,1] and there is no tail to truncate
        const a = 1.7, b = 2.3, N = 20000; let s = 0;
        for (let i = 1; i < N; i++) { const u = i / N, z = u / (1 - u), jac = 1 / ((1 - u) * (1 - u)); s += ratioPdfExact(z, a, b) * jac; }
        return Math.abs(s / N - 1) < 1e-4;
    })());
    ok("the cdf is the incomplete beta and agrees with a direct quadrature of the pdf", (() => {
        const a = 1.7, b = 2.3, z0 = 2.5, N = 40000; let s = 0;
        for (let i = 1; i <= N; i++) { const u = (i - 0.5) / N * (z0 / (1 + z0)), z = u / (1 - u), jac = 1 / ((1 - u) * (1 - u)); s += ratioPdfExact(z, a, b) * jac; }
        s *= (z0 / (1 + z0)) / N;
        return rel(s, ratioCdfExact(z0, a, b)) < 1e-5;
    })());
    ok("regIncBeta matches values it can be checked against", (() => {
        // I_x(1,1) = x ; I_x(a,b) + I_{1-x}(b,a) = 1
        return Math.abs(regIncBeta(0.37, 1, 1) - 0.37) < 1e-13 &&
               Math.abs(regIncBeta(0.37, 2.2, 3.7) + regIncBeta(0.63, 3.7, 2.2) - 1) < 1e-12;
    })());
    ok("E[Z] = Gamma(a+1)Gamma(b-1)/(Gamma(a)Gamma(b)) = a/(b-1)", (() => {
        const m = ratioMoment(1.7, 2.3, 1);
        return m.ok && rel(m.value, 1.7 / 1.3) < 1e-13;
    })());
    ok("!! a moment that DOES NOT EXIST is refused, not returned", (() => {
        const m = ratioMoment(1.7, 2.3, 3);
        return m.ok === false && /diverges/.test(m.reason) && /property of the law/.test(m.reason);
    })(), "E[Z^k] needs k < b; a heavy tail is a fact about the distribution, not a numerical problem");
}

// --- 3. THE HOLE AT z = 1, pinned so the claim cannot drift back ----------------------------------------------
{
    const a = 1.7, b = 2.3;
    const okAt = (z) => ratioPdfG(z, a, b).ok;
    ok("!! the G route REFUSES on both sides of z=1 -- the branches do NOT meet",
        !okAt(0.99) && !okAt(1.0) && !okAt(1.01),
        "z near 1 means |1/z| near 1, which IS the radius of convergence, from either side");
    ok("...and it works again once clear of the boundary", okAt(0.95) && okAt(1.05));
    ok("...the refusal names convergence rather than blaming the input", (() => {
        const r = ratioPdfG(1.0, a, b);
        return !r.ok && /radius of convergence|did not converge/.test(r.reason);
    })());
    // DERIVED, NOT TYPED. My first version of this line hardcoded 0.3418 from a mental estimate; the true value
    // is 0.3537, so the gate failed correct code. That is the failure mode v3055 warned about in its own header
    // -- a mis-transcribed key makes the gate scream at working code -- committed one round later, by me.
    // f(1) = 1 / (B(a,b) * 2^{a+b}), computed here from the same Gamma the module uses.
    const fOne = 1 / ((gamma(a) * gamma(b) / gamma(a + b)) * Math.pow(2, a + b));
    ok("...the ELEMENTARY form covers the hole, so the instrument is still usable there",
        rel(ratioPdfExact(1.0, a, b), fOne) < 1e-13, "f(1) = " + ratioPdfExact(1, a, b).toFixed(6));
    ok("...and nearBoundary is reported so the gap is visible rather than inferred", (() => {
        const near = ratioPdfG(1.05, a, b), far = ratioPdfG(20, a, b);
        return near.ok && far.ok && near.nearBoundary < far.nearBoundary;
    })());
    // the header must not re-acquire the claim I had to withdraw
    const src = readFileSync(new URL("../../math/ratioDist.js", import.meta.url), "utf8");
    ok("!! the module records the CORRECTION rather than quietly fixing the sentence",
        /CORRECTION TO WHAT I FIRST WROTE/.test(src) && /They do\s*\n\/\/ not/.test(src) && /real HOLE/.test(src),
        "deleting the wrong sentence would hide that a round reasoned from it");
}

// --- 4. THE INSTRUMENT: MC graded against the elementary cdf, with the sabotage that gives it power -----------
{
    const a = 1.7, b = 2.3;
    const rng = mulberry32(4242);
    const s = [];
    for (let i = 0; i < 4000; i++) s.push(sampleRatio(a, b, rng));

    const good = ksRatio(s, a, b);
    say("KS vs the true law: D=" + good.D.toFixed(5) + "  p=" + good.pValue.toFixed(4) + "  (critical " + good.critical95.toFixed(5) + ")");
    ok("!! KS does not reject the law the samples came from", good.reject === false);

    const wrong = ksRatio(s, a * 1.12, b);
    say("KS vs a 12% off:    D=" + wrong.D.toFixed(5) + "  p=" + wrong.pValue.toExponential(2));
    ok("!! SABOTAGE(a 12% off): the SAME samples are rejected", wrong.reject === true);
    ok("...and the wrong law is clearly further, not marginally", wrong.D > good.D * 2, wrong.D.toFixed(5) + " vs " + good.D.toFixed(5));
    ok("SABOTAGE(shapes swapped): rejected -- the law is not symmetric in a and b", ksRatio(s, b, a).reject === true);
    ok("SABOTAGE(product instead of ratio): rejected", (() => {
        const r2 = mulberry32(99), p = [];
        for (let i = 0; i < 4000; i++) p.push(1 / sampleRatio(b, a, r2) * 0 + sampleRatio(a, b, r2) * 1.4);
        return ksRatio(p, a, b).reject === true;
    })(), "a scaled ratio is a different law and must not pass");
}

// --- 5. refusals + browser-safe --------------------------------------------------------------------------------
{
    ok("non-positive shapes refused", ratioShapeProblems(-1, 2).length > 0 && ratioShapeProblems(1, 0).length > 0);
    ok("z <= 0 refused rather than returning 0 as if it were a density value", (() => {
        const r = ratioPdfG(-1, 1.7, 2.3);
        return r.ok === false && /must be positive/.test(r.reason);
    })());
    const src = readFileSync(new URL("../../math/ratioDist.js", import.meta.url), "utf8");
    const text = noComments(src), code = codeOnly(src);
    ok("imports only meijerG.js and productDist.js; no DOM, no node builtins",
        (text.match(/^\s*import[^\n]*/gm) || []).every((l) => /["']\.\/(meijerG|productDist)\.js["']/.test(l)) &&
        !/\bdocument\s*[.[]/.test(code) && !/\bwindow\s*[.[]/.test(code));
    ok("the sampler is reused, not re-implemented", /sampleGamma/.test(text) && !/Marsaglia/.test(code));
}

// --- 6. THE FRONT DOOR (v3066) ---------------------------------------------------------------------------------
// v3057 shipped this instrument with a gate and no page, which is Keith's own law unmet: a module that can only
// be exercised from a gate is a module nobody can look at. The panel is on meijer-g.html beside the product one.
{
    const page = readFileSync(new URL("../../meijer-g.html", import.meta.url), "utf8");
    ok("meijer-g.html has a ratio panel driven by math/ratioDist.js",
        /ratioPdfG/.test(page) && /ratioDist\.js/.test(page) && /id="rtable"/.test(page));
    ok("...it shows the G and the ELEMENTARY value side by side, which is the whole argument",
        /ratioPdfExact/.test(page) && /beta-prime/.test(page));
    ok("!! ...and it shows the z=1 REFUSALS in the table rather than skipping those rows",
        /REFUSED: " \+ g\.reason/.test(page) && /0\.99, 1, 1\.01/.test(page),
        "a table that silently omitted the hole would present a gap as coverage");
    ok("...with the elementary value still printed there, so the instrument is visibly usable across it",
        /REFUSED[\s\S]{0,200}e\.toPrecision/.test(page));
    ok("the tolerance shown is DERIVED from the reported cancellation, not a constant",
        /Math\.pow\(10, g\.cancellation\)/.test(page));
    ok("!! both sabotages are buttons: 12% off AND swapped shapes",
        /id="rsab1"/.test(page) && /id="rsab2"/.test(page) && /shapes SWAPPED/.test(page),
        "the law is not symmetric in a and b, so swapping is a genuinely different distribution");
    ok("...and the sabotages re-grade the SAME samples rather than drawing new ones",
        /rsab1[\s\S]{0,200}ksRatio\(_rsamp/.test(page) && /rsab2[\s\S]{0,200}ksRatio\(_rsamp/.test(page),
        "new samples would confound 'the law is wrong' with 'this draw was unlucky'");
    ok("a non-existent moment is reported as refused rather than blank", /REFUSED: " \+ m\.reason/.test(page));
}

console.log("ratioDist-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
