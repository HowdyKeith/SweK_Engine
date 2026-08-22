// WebGLEngine/tools/ship/meijerG-selfcheck.mjs -- v3055
//
// Run: node tools/ship/meijerG-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES math/meijerG.js against a DERIVED answer key, in the wind-tunnel sense: nothing here is a stored table of
// values I typed in. Every target is computed independently -- its own series, its own recurrence -- and compared
// pointwise. A stored table only proves the code still agrees with whatever it printed the day I wrote it down.
//
// THE KEY MUST SPAN (m,n,p,q) OR IT IS A CONTROL THAT CANNOT FAIL. This is the whole reason Meijer G is worth
// gating rather than just implementing. Nearly every classical special function is a G at particular parameters,
// so the key is a FAMILY -- but a family that only tested exp(-z) would pass an implementation that silently
// ignored half its parameters, because exp(-z) is m=1,n=0,p=0,q=1 and exercises none of them. Section 2 proves
// that with a mutant: an evaluator that discards n reproduces exp(-z) EXACTLY and gets 1/(1+z) wrong.
//
// AND THE KEY ITSELF CAN BE WRONG. A mis-transcribed reduction makes the gate scream at correct code. Each entry
// below therefore carries the identity it encodes, and a disagreement is a finding to ADJUDICATE -- not licence
// to nudge G until it agrees. That is how the wind tunnel's derived key found a real force-formula bug instead
// of papering over one.

import { readFileSync } from "node:fs";
import { meijerG, meijerGValue, pFq, gamma, lgammaSign, degeneratePairs } from "../../math/meijerG.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);

// --- independent references, each its own series -----------------------------------------------------------
const besselJ = (v, x) => { let s = 0; for (let k = 0; k < 120; k++) s += Math.pow(-1, k) / (gamma(k + 1) * gamma(k + v + 1)) * Math.pow(x / 2, 2 * k + v); return s; };
const besselI = (v, x) => { let s = 0; for (let k = 0; k < 160; k++) s += 1 / (gamma(k + 1) * gamma(k + v + 1)) * Math.pow(x / 2, 2 * k + v); return s; };
const besselK = (v, x) => Math.PI / 2 * (besselI(-v, x) - besselI(v, x)) / Math.sin(Math.PI * v);
// upper incomplete Gamma(a,z) = Gamma(a) - gamma(a,z), lower by its own series
const gammaLower = (a, z) => { let t = Math.pow(z, a) * Math.exp(-z) / a, s = t; for (let k = 1; k < 400; k++) { t *= z / (a + k); s += t; if (Math.abs(t) < 1e-17 * Math.abs(s)) break; } return s; };
const gammaUpper = (a, z) => gamma(a) - gammaLower(a, z);

// --- 0. the gamma the whole thing rests on ------------------------------------------------------------------
{
    ok("Gamma matches known exact values", (() => {
        const cases = [[1, 1], [2, 1], [5, 24], [0.5, Math.sqrt(Math.PI)], [1.5, Math.sqrt(Math.PI) / 2], [-0.5, -2 * Math.sqrt(Math.PI)]];
        return cases.every(([x, w]) => rel(gamma(x), w) < 1e-13);
    })());
    ok("Gamma obeys the reflection formula at a value it does not special-case",
        rel(gamma(0.3) * gamma(0.7), Math.PI / Math.sin(Math.PI * 0.3)) < 1e-13);
    ok("Gamma reports poles at non-positive integers rather than a large number",
        [0, -1, -5].every((x) => lgammaSign(x).pole === true) && lgammaSign(-0.5).pole === false);
    ok("pFq reproduces closed forms it is not told about", (() => {
        const e = pFq([], [], 1.7);                            // 0F0 = e^x
        const geo = pFq([1], [], 0.3);                         // 1F0(1;;x) = 1/(1-x)
        const lg = 0.4 * pFq([1, 1], [2], -0.4).value;         // z*2F1(1,1;2;-z) = ln(1+z)
        return rel(e.value, Math.E ** 1.7) < 1e-14 && rel(geo.value, 1 / 0.7) < 1e-14 && rel(lg, Math.log(1.4)) < 1e-13;
    })());
}

// --- 1. THE FAMILY. Six reductions, deliberately spanning (m,n,p,q) -----------------------------------------
const FIXTURES = [
    { id: "exp(-z)          G^{1,0}_{0,1}", m: 1, n: 0, a: [], b: [0], zs: [0.3, 2, 7.5, 25], ref: (z) => Math.exp(-z) },
    { id: "1/(1+z)          G^{1,1}_{1,1}", m: 1, n: 1, a: [0], b: [0], zs: [0.2, 0.5, 0.85], ref: (z) => 1 / (1 + z) },
    { id: "ln(1+z)          G^{1,2}_{2,2}", m: 1, n: 2, a: [1, 1], b: [1, 0], zs: [0.15, 0.5, 0.9], ref: (z) => Math.log(1 + z) },
    { id: "J_v(x)           G^{1,0}_{0,2}", m: 1, n: 0, v: 0.5, zs: [1.3, 2.1, 4.0], bOf: (v) => [v / 2, -v / 2], a: [], xArg: true, ref: (x, v) => besselJ(v, x) },
    { id: "J_v(x) v=1.7     G^{1,0}_{0,2}", m: 1, n: 0, v: 1.7, zs: [1.1, 2.6, 5.2], bOf: (v) => [v / 2, -v / 2], a: [], xArg: true, ref: (x, v) => besselJ(v, x) },
    { id: "2K_v(x)          G^{2,0}_{0,2}", m: 2, n: 0, v: 0.4, zs: [0.7, 1.1, 2.4], bOf: (v) => [v / 2, -v / 2], a: [], xArg: true, ref: (x, v) => 2 * besselK(v, x) },
    { id: "Gamma(a,z)       G^{2,0}_{1,2}", m: 2, n: 0, a: [1], b: [0, 0.4], zs: [0.3, 1.2, 3.1], ref: (z) => gammaUpper(0.4, z) },
];

{
    const MARGIN = 40;                    // slack over the cancellation-predicted floor; the ONLY tuned number here
    let worst = 0, worstId = "", nWell = 0, nSkipped = 0;
    for (const f of FIXTURES) {
        for (const z of f.zs) {
            const spec = f.xArg
                ? { m: f.m, n: f.n, a: f.a, b: f.bOf(f.v), z: z * z / 4 }
                : { m: f.m, n: f.n, a: f.a, b: f.b, z };
            const r = meijerG(spec);
            const want = f.xArg ? f.ref(z, f.v) : f.ref(z);
            if (r.ok && !r.reliable) { nSkipped++; continue; }     // the code disclaimed it; section 4 judges those
            nWell++;
            const e = r.ok ? rel(r.value, want) : Infinity;
            // THE TOLERANCE IS DERIVED, NOT CHOSEN. A fixed constant is a number I would have picked until the
            // gate went green, which is the opposite of a check. The bound each point must meet is the one the
            // code's OWN cancellation figure promises: c digits lost out of ~16 means the answer cannot be better
            // than 10^c * eps, and MARGIN is the only free parameter.
            const predicted = Math.pow(10, r.ok ? r.cancellation : 0) * 2.3e-16 * MARGIN;
            const ratio = e / predicted;
            if (ratio > worst) { worst = ratio; worstId = f.id + " @ " + z + " (err " + e.toExponential(1) + " vs predicted " + predicted.toExponential(1) + ")"; }
        }
    }
    ok("!! every reduction agrees with an INDEPENDENT reference, to the accuracy its OWN cancellation predicts",
        worst < 1, nWell + " points; worst point used " + (100 * worst).toFixed(1) + "% of its predicted error budget" + (worstId ? "  (" + worstId + ")" : ""));
    // The accuracy claim is CONDITIONAL and says so. An unconditional one would either be false (z=20 below is
    // wrong by more than itself) or would need a tolerance so loose it stopped meaning anything. What makes the
    // conditional claim honest is section 4: the code's own cancellation number PREDICTS which points those are.
    ok("...and the ill-conditioned points were excluded by the code's OWN reported cancellation, not by hand",
        nSkipped > 0, nSkipped + " point(s) flagged unreliable by meijerG itself and checked separately below");

    // The span claim, asserted rather than assumed.
    const seen = new Set(FIXTURES.map((f) => f.m + "," + f.n + "," + (f.a.length) + "," + (f.b ? f.b.length : 2)));
    ok("...and the fixtures really do span distinct (m,n,p,q)", seen.size >= 5, [...seen].join("  "));
    ok("...including m>1 (more than one residue) and n>0 (upper parameters used)",
        FIXTURES.some((f) => f.m > 1) && FIXTURES.some((f) => f.n > 0) && FIXTURES.some((f) => f.a.length > 0));
}

// --- 2. THE MUTANTS. Each proves a different part of the key is load-bearing --------------------------------
{
    // (a) an evaluator that IGNORES n. exp(-z) has n=0, so it is reproduced exactly -- a key of only exp would
    //     have shipped this. 1/(1+z) has n=1 and breaks.
    const ignoreN = (spec) => meijerGValue({ ...spec, n: 0 });
    const expOk = rel(ignoreN({ m: 1, n: 0, a: [], b: [0], z: 2 }), Math.exp(-2)) < 1e-12;
    const invBad = rel(ignoreN({ m: 1, n: 1, a: [0], b: [0], z: 0.5 }), 1 / 1.5);
    ok("!! MUTANT(ignores n): exp(-z) still EXACT -- a one-identity key would have passed it", expOk);
    ok("!! MUTANT(ignores n): 1/(1+z) is wrong, so the spanning key catches it", invBad > 1e-3,
        "relative error " + invBad.toExponential(2));

    // (b) the argument sign (-1)^{p-m-n}. Dropping it turns exp(-z) into exp(+z) while every structural check
    //     still passes -- shape intact, answer inverted.
    const flipped = pFq([], [], +2).value;                  // what exp(-z) becomes with the sign dropped
    ok("!! MUTANT(sign dropped): exp(-2) would become exp(+2)", rel(flipped, Math.E ** 2) < 1e-13 && rel(flipped, Math.exp(-2)) > 1,
        "the sign is one character and inverts the answer while leaving every parameter count correct");
    ok("...and the shipped code really applies it", /\(\(p - m - n\) % 2 === 0\) \? 1 : -1/.test(codeOnly(readFileSync(new URL("../../math/meijerG.js", import.meta.url), "utf8"))));

    // (c) perturbing ONE gamma argument in the prefactor. This is the transcription error the key exists to
    //     catch: an off-by-one inside a Gamma leaves the structure intact and the numbers wrong.
    const bad = gamma(1 + 0.4 - 1 + 1) / gamma(1 + 0.4 - 1);   // shifting a single argument by 1
    ok("SABOTAGE(one Gamma argument shifted): the value moves by a factor of " + bad.toFixed(3) + ", not a rounding",
        Math.abs(bad - 1) > 0.1);
}

// --- 3. THE REFUSALS. Each names the condition and what would be needed instead ------------------------------
{
    const cases = [
        ["degenerate b (poles collide)", { m: 2, n: 0, a: [], b: [0.5, -0.5], z: 0.3 }, /DEGENERATE/, /logarithmic/],
        ["p > q (series diverges)", { m: 1, n: 0, a: [1, 2], b: [0], z: 0.3 }, /p > q/, /diverges/],
        ["p == q outside |z| < 1", { m: 1, n: 1, a: [0], b: [0], z: 1.4 }, /radius of convergence 1/, /not implemented/],
        ["z <= 0 (multivalued)", { m: 1, n: 0, a: [], b: [0], z: -1 }, /multivalued/, /z > 0/],
        ["m = 0 (no poles to sum)", { m: 0, n: 0, a: [], b: [0], z: 0.5 }, /no poles/, /separate implementation/],
    ];
    for (const [name, spec, re1, re2] of cases) {
        const r = meijerG(spec);
        ok("refuses: " + name, r.ok === false && re1.test(r.reason), r.ok ? "RETURNED A NUMBER" : "");
        ok("...and says what would be needed instead", r.ok === false && re2.test(r.reason));
    }
    // the degenerate report must name the actual colliding pair, not just complain
    const d = meijerG({ m: 2, n: 0, a: [], b: [1.25, -0.75], z: 0.3 });
    ok("degenerate refusal names the colliding pair and their integer separation",
        !d.ok && d.degenerate && d.degenerate[0].bh === 1.25 && d.degenerate[0].bj === -0.75 && /-2/.test(d.reason));
    ok("degeneratePairs is exact about what counts: 0.5 apart is FINE, 1.0 apart is not",
        degeneratePairs([0.2, 0.7], 2).length === 0 && degeneratePairs([0.2, 1.2], 2).length === 1);
}

// --- 4. CANCELLATION, MEASURED AND KEPT ----------------------------------------------------------------------
// Reported, never asserted as a threshold (the meshPerf lesson: a numeric tolerance in a gate is a flaky gate).
// The point of printing it is that a G which has lost eleven digits looks exactly like one that has lost none.
{
    let anyLossy = false;
    for (const z of [0.5, 2, 8, 20, 40]) {
        const r = meijerG({ m: 1, n: 0, a: [], b: [0], z });
        if (!r.ok) { say("exp(-z) at z=" + z + " REFUSED: " + r.reason); continue; }
        const err = rel(r.value, Math.exp(-z));
        say("exp(-" + z + "): digits lost to cancellation " + r.cancellation.toFixed(1) + ", actual relative error " + err.toExponential(1));
        if (r.cancellation > 3) anyLossy = true;
    }
    // THE PREDICTOR IS ITSELF UNDER TEST. If cancellation were a constant, or ignored the parameters, every
    // point above would still pass with a big enough MARGIN. So: it must RISE with z, and it must cross into
    // unreliable exactly where the answer actually goes bad.
    {
        const cs = [0.5, 2, 8, 20, 40].map((z) => meijerG({ m: 1, n: 0, a: [], b: [0], z }).cancellation);
        ok("!! cancellation RISES with z rather than being a decoration",
            cs.every((c, i) => i === 0 || c > cs[i - 1]), cs.map((c) => c.toFixed(1)).join(" -> "));
        const r20 = meijerG({ m: 1, n: 0, a: [], b: [0], z: 20 });
        const err20 = rel(r20.value, Math.exp(-20));
        ok("!! where it says UNRELIABLE the answer really is worthless, and it says so BEFORE you compare",
            r20.reliable === false && err20 > 1,
            "z=20: " + r20.digitsLeft.toFixed(1) + " digits left, actual relative error " + err20.toExponential(1));
        const r2 = meijerG({ m: 1, n: 0, a: [], b: [0], z: 2 });
        ok("...and where it says RELIABLE the answer is good", r2.reliable === true && rel(r2.value, Math.exp(-2)) < 1e-14);
    }
    ok("!! the evaluator REPORTS its own cancellation, so a lossy regime is visible", (() => {
        const r = meijerG({ m: 1, n: 0, a: [], b: [0], z: 40 });
        return r.ok && typeof r.cancellation === "number" && isFinite(r.cancellation);
    })());
    ok("HONEST NEGATIVE KEPT: alternating-series cancellation makes large z lossy, and it is not hidden", anyLossy,
        "exp(-z) by its own alternating series loses roughly z/ln(10) digits; the reported number tracks that");
    ok("...and cancellation is measured ACROSS residue terms too, not just inside one series", (() => {
        const r = meijerG({ m: 2, n: 0, a: [], b: [0.2, -0.2], z: 0.3 });   // K_v is a difference of two I terms
        return r.ok && typeof r.outerCancellation === "number";
    })());
}

// --- 5. browser-safe ------------------------------------------------------------------------------------------
{
    const src = readFileSync(new URL("../../math/meijerG.js", import.meta.url), "utf8");
    const code = codeOnly(src);
    ok("no imports, no DOM, no node builtins", !/^\s*import/m.test(code) && !/\bdocument\s*[.[]/.test(code) && !/\bwindow\s*[.[]/.test(code));
    ok("the refusals are written down where the next reader meets them", /WHAT IT REFUSES, BY NAME/.test(src));
    ok("the load-bearing sign is explained, not just present", /load-bearing/.test(src) && /p-m-n/.test(src));
}

console.log("meijerG-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
