// WebGLEngine/tools/ship/elliptic-selfcheck.mjs -- v3625
//
// Run: node tools/ship/elliptic-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES math/elliptic.js. The reason elliptic integrals are worth having in this tree is not the code -- it is
// that they carry EXACT EXTERNAL ANCHORS, so the answer key is not a table of numbers I printed once and wrote
// down. Three things do the load-bearing work here and none of them is a stored value:
//
//   * DEGENERATE PARAMETERS. F(phi|0) = E(phi|0) = phi, K(0) = E(0) = pi/2, E(phi|1) = sin(phi),
//     F(phi|1) = ln tan(phi/2 + pi/4). Closed forms, not tolerances.
//   * LEGENDRE'S RELATION. E(m)K(1-m) + E(1-m)K(m) - K(m)K(1-m) = pi/2 on the whole open interval. FOUR values
//     at TWO parameters tied to a constant that appears nowhere in the file, on a continuum rather than at a
//     point. A self-consistently wrong routine cannot satisfy this.
//   * THREE ROUTES SHARING NO CODE. Carlson duplication, the AGM, and Simpson straight down the definition.
//
// *** AND SECTION 3 IS THE POINT OF THE WHOLE GATE. Every anchor in the first bullet is BLIND to the m-versus-k
// convention, because m = k^2 has fixed points at exactly 0 and 1 -- which is where all the closed forms live.
// A routine that reads its argument as the MODULUS when the caller means the PARAMETER passes every degenerate
// check perfectly and is 10% wrong in the interior. Section 3 builds that mutant and shows it passing section 0
// and failing sections 1 and 2, so the anchors are not being trusted to do work they cannot do. THIS IS THE
// TWO-THINGS-WEARING-ONE-LABEL SHAPE, and for once it is in the literature rather than in our code. ***

import { readFileSync } from "node:fs";
import { rf, rd, ellipF, ellipE, ellipK, ellipEc, agmK, agmE, quadF, quadE, pendulumPeriodFactor } from "../../math/elliptic.js";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);
const PI2 = Math.PI / 2;

// --- 0. the degenerate parameters: closed forms, nothing to choose ------------------------------------------
{
    say("0. EXACT LIMITS. m = 0 and m = 1 both collapse the integrals to elementary functions.");
    let worst0 = 0, worst1 = 0;
    for (const phi of [0.1, 0.4, 0.9, 1.3, 1.5, PI2]) {
        worst0 = Math.max(worst0, rel(ellipF(phi, 0), phi), rel(ellipE(phi, 0), phi));
        if (phi < PI2) {                                   // phi = pi/2 with m = 1 is the corner -- see below
            worst1 = Math.max(worst1, rel(ellipE(phi, 1), Math.sin(phi)),
                rel(ellipF(phi, 1), Math.log(Math.tan(0.5 * phi + PI2 / 2))));
        }
    }
    ok("F(phi|0) = E(phi|0) = phi", worst0 < 1e-15, "worst rel " + worst0.toExponential(3));
    ok("E(phi|1) = sin(phi) and F(phi|1) = ln tan(phi/2 + pi/4)", worst1 < 1e-14, "worst rel " + worst1.toExponential(3));
    ok("K(0) = E(0) = pi/2 to the last bit", ellipK(0) === PI2 && ellipEc(0) === PI2);
    ok("E(1) = 1 exactly", ellipEc(1) === 1);
    ok("!! the (phi = pi/2, m = 1) CORNER is refused by the incomplete route, and the value still exists", (() => {
        // At that one point the turning point sits exactly at the endpoint: 1 - m sin^2 phi = 0. F diverges there
        // and E does not -- E(pi/2|1) = 1 -- so a single refusal covers a divergence AND a finite value, which is
        // this tree's own two-things-wearing-one-label shape sitting in the boundary condition. The COMPLETE
        // branch supplies the finite one by its own exact line, so nothing is lost; what would be lost is the
        // distinction, if this line were ever deleted.
        return ellipE(PI2, 1) === null && ellipF(PI2, 1) === null && ellipEc(1) === 1;
    })(), "F(pi/2|1) genuinely diverges; E(pi/2|1) = 1 comes from the complete branch");
    say("   NOTE FOR THE NEXT READER: not one line above can tell the PARAMETER m from the MODULUS k. Section 3.");
}

// --- 1. three routes, sharing no code ------------------------------------------------------------------------
{
    say("1. CARLSON vs AGM vs SIMPSON. Two agreeing could be two typos agreeing; three could not.");
    let wCA = 0, wCQ = 0;
    for (const m of [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
        wCA = Math.max(wCA, rel(ellipK(m), agmK(m)), rel(ellipEc(m), agmE(m)));
    }
    for (const [phi, m] of [[0.3, 0.5], [1.0, 0.8], [1.5, 0.3], [0.8, 0.05], [1.2, 0.95]]) {
        wCQ = Math.max(wCQ, rel(ellipF(phi, m), quadF(phi, m)), rel(ellipE(phi, m), quadE(phi, m)));
    }
    ok("complete: Carlson agrees with the AGM", wCA < 1e-14, "worst rel " + wCA.toExponential(3));
    ok("incomplete: Carlson agrees with Simpson on the defining integral", wCQ < 1e-12, "worst rel " + wCQ.toExponential(3));
    ok("...and the AGM is not a variant of Carlson: no duplication, no truncated series", (() => {
        const src = codeOnly(readFileSync(new URL("../../math/elliptic.js", import.meta.url), "utf8"));
        const agm = src.slice(src.indexOf("export function agmK"), src.indexOf("function simpson"));
        return !/rf\s*\(|rd\s*\(|errtol/.test(agm);
    })(), "agmK/agmE call neither rf nor rd and take no errtol");
}

// --- 2. Legendre's relation ----------------------------------------------------------------------------------
{
    say("2. LEGENDRE'S RELATION. Four values, two parameters, one constant that is not in the file.");
    let worst = 0, at = 0;
    for (let i = 1; i < 40; i++) {
        const m = i / 40;
        const L = ellipEc(m) * ellipK(1 - m) + ellipEc(1 - m) * ellipK(m) - ellipK(m) * ellipK(1 - m);
        const e = rel(L, PI2); if (e > worst) { worst = e; at = m; }
    }
    ok("holds across the whole open interval, not at one point", worst < 1e-14,
        "worst rel " + worst.toExponential(3) + " at m = " + at.toFixed(3) + " over 39 samples");
}

// --- 3. THE m/k TRAP, SHOWN FAILING --------------------------------------------------------------------------
{
    say("3. THE CONVENTION MUTANT. It reads its argument as the MODULUS k where the caller means the PARAMETER m.");
    const badK = (m) => ellipK(Math.sqrt(m) === 0 ? 0 : m * m === m ? m : m * m);   // k := m, so it evaluates K(m^2)
    const mutK = (m) => ellipK(m * m);
    const mutE = (m) => ellipEc(m * m);

    // it passes every degenerate anchor
    ok("!! the mutant passes EVERY section-0 anchor", mutK(0) === PI2 && mutE(0) === PI2 && rel(mutE(1), 1) < 1e-15,
        "m^2 has fixed points at exactly 0 and 1, which is where all the closed forms live");
    // and it fails the interior
    const gap = rel(mutK(0.5), ellipK(0.5));
    ok("...and misses in the interior by a margin that reads like a tolerance problem", gap > 0.05 && gap < 0.2,
        "K(m=0.5) " + ellipK(0.5).toFixed(6) + " vs the mutant's " + mutK(0.5).toFixed(6) + "  rel " + (100 * gap).toFixed(2) + "%");
    // the routes catch it
    ok("...but the AGM route catches it", rel(mutK(0.5), agmK(0.5)) > 1e-3);
    ok("...and Legendre's relation catches it", (() => {
        const L = mutE(0.5) * mutK(0.5) + mutE(0.5) * mutK(0.5) - mutK(0.5) * mutK(0.5);
        return rel(L, PI2) > 1e-3;
    })());
    ok("the shipped file states which convention it takes, in the signatures a caller reads", (() => {
        const src = readFileSync(new URL("../../math/elliptic.js", import.meta.url), "utf8");
        return /PARAMETER m, NOT MODULUS k/.test(src) && /m = k\^2/.test(src);
    })());
    say("   IF SOMEBODY EVER ADDS A k-TAKING WRAPPER, THIS SECTION GOES RED AND SHOULD BE REWRITTEN TO GRADE BOTH");
    say("   CONVENTIONS AGAINST EACH OTHER -- not weakened, and not deleted because 'we know which one we use'.");
    void badK;
}

// --- 4. the errtol staircase, and the order claim -------------------------------------------------------------
{
    say("4. ACCURACY IS A PROPERTY OF THE ITERATION COUNT, NOT OF errtol -- and errtol is a REQUEST, not a delivery.");
    const ref = agmK(0.5);
    const rows = [];
    for (const et of [0.32, 0.16, 0.08, 0.04, 0.02, 0.01, 0.005]) {
        rows.push({ et, its: rf(0, 0.5, 1, et).iterations, err: rel(ellipK(0.5, et), ref) });
        say("     errtol " + et.toFixed(3).padStart(6) + "   duplications " + rows[rows.length - 1].its +
            "   rel err " + rows[rows.length - 1].err.toExponential(3));
    }
    ok("!! halving errtol often changes NOTHING: the delivered error is quantised by the duplication count",
        rows.some((r, i) => i > 0 && r.its === rows[i - 1].its && r.err === rows[i - 1].err),
        "a plot of error against errtol is a staircase, not a line");
    // one duplication quarters the argument deviation; the truncated series is O(deviation^6); so the error
    // should fall by 4^6 = 4096 per step, i.e. 12 binary orders. DERIVED from the algorithm, measured here.
    const steps = [];
    for (let i = 1; i < rows.length; i++) {
        if (rows[i].its === rows[i - 1].its + 1 && rows[i].err > 1e-15) steps.push(Math.log2(rows[i - 1].err / rows[i].err));
    }
    ok("each duplication buys ~12 binary orders, which IS the O(errtol^6) claim", steps.length >= 2 && steps.every((s) => s > 10.5 && s < 13.5),
        "measured " + steps.map((s) => s.toFixed(2)).join(", ") + " against a predicted log2(4^6) = 12");
    say("   THE PREDICTION IS STRUCTURAL: duplication divides the deviation by 4, the series truncates at 6th order.");
    say("   IT STOPS BEING MEASURABLE BELOW ~1e-15 BECAUSE DOUBLE PRECISION RUNS OUT, WHICH IS NOT THE ALGORITHM.");
}

// --- 5. the refusals, each shown refusing ---------------------------------------------------------------------
{
    say("5. REFUSALS. A refusal is a third kind of answer key (instruments-selfcheck, v3382).");
    ok("K(m) refuses m >= 1 rather than returning a large finite number", ellipK(1) === null && ellipK(1.5) === null);
    ok("the incomplete pair refuses past the turning point, 1 - m sin^2 phi <= 0", ellipF(1.4, 1.5) === null && ellipE(1.4, 1.5) === null);
    ok("RF refuses two vanishing arguments and any negative one", rf(0, 0, 1) === null && rf(-1, 1, 1) === null);
    ok("RD refuses a vanishing third argument, which carries its pole", rd(1, 1, 0) === null);
    ok("a refusal is null, never NaN -- NaN propagates silently and null does not", (() => {
        const r = ellipK(2); return r === null && !Number.isNaN(r);
    })());
}

// --- 6. the consumer's key, and browser safety ----------------------------------------------------------------
{
    say("6. THE CONSUMER. periodFactor(theta0) = K(sin^2(theta0/2))/(pi/2) -- graded in pendulumExact-selfcheck.");
    ok("periodFactor(0) = 1 and it grows with amplitude", rel(pendulumPeriodFactor(1e-9), 1) < 1e-15 &&
        pendulumPeriodFactor(0.3) > pendulumPeriodFactor(0.1) && pendulumPeriodFactor(3.0) > pendulumPeriodFactor(2.0),
        "0.3 rad -> " + pendulumPeriodFactor(0.3).toFixed(9) + ",  2.0 rad -> " + pendulumPeriodFactor(2.0).toFixed(9));
    const src = readFileSync(new URL("../../math/elliptic.js", import.meta.url), "utf8");
    const code = codeOnly(src);
    ok("browser-safe: no imports, no DOM, no node builtins", !/^\s*import/m.test(code) && !/\bdocument\s*[.[]/.test(code) && !/\bwindow\s*[.[]/.test(code));
    ok("the refusals are written where the next reader meets them", /WHAT IT REFUSES, BY NAME/.test(src));
    ok("the m/k trap is documented in the file, not only in this gate", /TWO THINGS WEARING ONE LABEL/.test(src));
}

console.log("elliptic-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
