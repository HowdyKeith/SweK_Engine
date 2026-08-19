// tools/roundhouse/seedSpreadModule-selfcheck.mjs
//
// v3534 -- GRADES THE EXTRACTED INSTRUMENT, AND THE FINDING IT PRODUCED ABOUT ITS OWN NOISE FLOOR.
//
// v3513's relSpread lived INSIDE seedSpread-selfcheck.mjs, welded to ising/order/magnetisation and one seed
// list. Six other devices in this lab are stochastic and none had ever been asked, because the only thing that
// could ask was not callable. THE EXTRACTION IS WHAT LET v3534 MEASURE THE THING THAT CLOSED ising -- and then
// what let it CORRECT ITS OWN MEASUREMENT one turn later.
//
// *** THE ROUND'S REAL LESSON IS ABOUT THE INSTRUMENT AND NOT THE DEVICE: at six seeds the Tc-to-control span
// ratio reads 2.38 and at twelve it reads 1.31. DOUBLING THE SEED COUNT HALVED THE APPARENT EFFECT, which is
// the signature of a seed-count artefact rather than of physics -- v3512's own finding about ising.L arriving
// one level up, where the trend was smaller than the seed noise and here it is smaller than the SEED-COUNT
// DEPENDENCE. A SPREAD ESTIMATE WHOSE NOISE FLOOR NOBODY MEASURED CANNOT REFUTE ANYTHING. ***
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { relSpread, sqrtNScaling, respondsToSeed, DEFAULT_SEEDS } from "./seedSpread.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const ISING = { mode: "order", field: "magnetisation" };

console.log("seedSpreadModule-selfcheck -- the instrument, and the noise floor it found in itself\n");

// ---------------------------------------------------------------------------
console.log("1. IT IS CALLABLE FROM OUTSIDE, WHICH IS THE WHOLE POINT");
{
    const r = await relSpread("ising", { ...ISING, config: { T: 2.0 }, seeds: DEFAULT_SEEDS.slice(0, 6) });
    ok("!! a spread comes back for a device named by the CALLER", Number.isFinite(r.rel) && r.rel > 0,
        "rel " + r.rel.toExponential(3) + " over " + r.seeds + " seeds, mean " + r.mean.toFixed(6));
    ok("...and the seed set is a parameter, not a magic list", r.seeds === 6 && DEFAULT_SEEDS.length === 12,
        "DEFAULT_SEEDS carries " + DEFAULT_SEEDS.length + ", widened from v3513's six because SIX PUT THE " +
        "NOISE FLOOR AT ROUGHLY 1.8x AND A FINDING HAS TO CLEAR ITS OWN NOISE");
    const src = fs.readFileSync(path.join(HERE, "seedSpread.mjs"), "utf8");
    ok("!! and the module knows nothing about ising", !/\bising\b/.test(src.replace(/\/\/[^\n]*/g, "")),
        "*** device, mode, field, seeds and the sweep key are ALL arguments. A module that named its subject " +
        "could not have been pointed at the six stochastic devices that have never been asked. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. IT REFUSES WHAT IT CANNOT MEASURE");
{
    let threw = false;
    try { await relSpread("ising", { mode: "order", field: "notAField", config: { T: 2.0 }, seeds: [1, 2] }); }
    catch { threw = true; }
    ok("!! a field the device does not report THROWS", threw,
        "*** a spread over an absent field would compute over undefined and hand back a confident number about " +
        "nothing -- and zero spread READS AS A PERFECT RESULT, which is v3177's shape: a check that passes " +
        "because the system does nothing. ***");

    const seedy = await respondsToSeed("ising", { ...ISING, config: { T: 2.27 } });
    ok("...and a device that IGNORES the seed is detectable", seedy.responds === true,
        "ising responds (" + seedy.a.toFixed(6) + " vs " + seedy.b.toFixed(6) + "). A device that did not " +
        "would return spread EXACTLY ZERO, and this is the guard that tells 'no variation' from 'no question asked'");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE 1/sqrt(N) PRESCRIPTION, RUN FOR THE FIRST TIME");
{
    const N = [250, 500, 1000, 2000];
    const hot = await sqrtNScaling("ising", { ...ISING, sweepKey: "samples", values: N, config: { T: 2.27 } });
    ok("the statistic is rel * sqrt(N), which is FLAT if the claim holds", hot.rows.length === N.length,
        "stats: " + hot.stats.map((s) => s.toFixed(3)).join(", "));
    ok("!! *** IT IS NOT FLAT: THE PRESCRIBED TEST IS NOT SUPPORTED BY THE DEVICE IT WAS PRESCRIBED FOR ***",
        hot.span > 1.5,
        "span " + hot.span.toFixed(2) + " over a " + (N[N.length - 1] / N[0]) + "-fold sweep. BOTH ising.samples " +
        "AND ising.L were rejected pointing at THIS as the way out, and it had never been run.");
    report("WHY A SPAN AND NOT CONSECUTIVE RATIOS",
        "comparing each step against sqrt(2) invites reading noise as a trend. A QUANTITY THAT SHOULD BE " +
        "CONSTANT is read at a glance and its drift is ONE NUMBER -- the claim is a SHAPE, not a pair of points.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE LOAD-BEARING NEGATIVE, AND IT IS ABOUT THIS INSTRUMENT");
{
    const N = [250, 500, 1000, 2000];
    const six = DEFAULT_SEEDS.slice(0, 6);
    const c6 = await sqrtNScaling("ising", { ...ISING, sweepKey: "samples", values: N, config: { T: 2.0 }, seeds: six });
    const h6 = await sqrtNScaling("ising", { ...ISING, sweepKey: "samples", values: N, config: { T: 2.27 }, seeds: six });
    const c12 = await sqrtNScaling("ising", { ...ISING, sweepKey: "samples", values: N, config: { T: 2.0 } });
    const h12 = await sqrtNScaling("ising", { ...ISING, sweepKey: "samples", values: N, config: { T: 2.27 } });
    const r6 = h6.span / c6.span, r12 = h12.span / c12.span;
    ok("!! *** DOUBLING THE SEEDS SHRINKS THE APPARENT Tc EFFECT ***", r12 < r6,
        "Tc-to-control span ratio " + r6.toFixed(2) + " at six seeds against " + r12.toFixed(2) + " at twelve. " +
        "*** I REPORTED 'IT HOLDS AWAY FROM Tc AND FAILS AT Tc' FROM THE SIX-SEED RUN AND THAT WAS LARGELY AN " +
        "ARTEFACT. An effect that halves when the sample doubles is a fact about the estimator. ***");
    // *** AND THIS CHECK CAUGHT ME TOO: I FIRST ASSERTED c12.span > 1.5 -- A THRESHOLD I TYPED -- AND IT READ
    // 1.35 ON THIS SWEEP AFTER READING 1.88 ON A LONGER ONE. THE CONTROL'S SPAN DEPENDS ON THE SWEEP RANGE, so
    // "the control does not hold either" is a claim about which N values I happened to pick. NEVER TYPE A
    // REFERENCE VALUE A GATE COMPARES AGAINST. What is asserted now is the COMPARISON, which needs no chosen
    // number: Tc spreads wider than the control, and BOTH numbers are reported so a reader sees the size. ***
    ok("Tc spans wider than the control, and both are REPORTED rather than thresholded",
        h12.span > c12.span,
        "T=2.27 spans " + h12.span.toFixed(2) + " against T=2.00 at " + c12.span.toFixed(2) + " over a " +
        (N[N.length - 1] / N[0]) + "-fold sweep. THE ABSOLUTE SPANS MOVE WITH THE SWEEP RANGE (the control read " +
        "1.88 over 250..4000 and 1.35 over 250..2000), WHICH IS ITSELF A REASON NO SINGLE NUMBER HERE IS A VERDICT.");
    report("THE DISPOSITION THIS EARNS",
        "*** NOT 'ising has no refinement knob' -- that would be a verdict from an instrument whose own noise " +
        "floor is unmeasured. The register entry says NOT-YET-MEASURABLE and names the missing number: HOW MANY " +
        "SEEDS THIS DEVICE NEEDS BEFORE ITS NOISE FLOOR SITS BELOW THE EFFECT. And ising STAYS on the " +
        "one-knob-short list, because removing it moves an eligibility DENOMINATOR -- v3511's defect -- and that " +
        "should move on a decision, not on a measurement I have already corrected once in one round. ***");
}

console.log(`\nseedSpreadModule-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
