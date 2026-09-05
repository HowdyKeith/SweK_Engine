// physics/render/microsurfaceWalk-selfcheck.mjs -- v4446 -- the gate for physics/render/microsurfaceWalk.mjs.
//
// *** A GROUND TRUTH NOBODY CHECKED IS WORSE THAN NO GROUND TRUTH, so sections 1 and 2 validate the walk
// against two things it cannot have been fitted to, and NOTHING IS CLAIMED FROM IT UNTIL THEY PASS. *** The
// first is a LAW -- a lossless conductor must return exactly the energy it received -- and the second is a
// number this tree graded rounds ago with an unrelated quadrature.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Use the UNSIGNED Lambda, as microfacet.mjs does           -> 4 RED
//  B. Make g1AtHeight non-zero for downward rays                -> 10 RED
//  C. Sample the NDF instead of the VISIBLE normal distribution -> 5 RED
//     Conservation goes with it: sampling the wrong distribution at each bounce breaks the LAW, which is
//     why section 1 is worth more than any number the walk produces.
//  D. Count truncated one-bounce paths as single scatter        -> 1 RED
//     One row, and it is the row this round spent an hour earning.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the walk is the last word. It is the UNIFORM-HEIGHT Smith microsurface, which is one model of what a
// rough conductor is -- a Beckmann height distribution or a real measured surface would give different
// numbers, and this measures the model the tree's own D and G2 already assume rather than reality. It is
// CONDUCTOR-ONLY: no transmission, so v4436's rough dielectric still has no ground truth and its
// multi-scatter loss is still unmeasured. And it is achromatic per run -- three channels means three walks.

import { albedo, walk, rng, sampleVNDF, lambdaSigned, g1AtHeight, C1, invC1, KC_ERROR_AT_V4446 as REC }
    from "./microsurfaceWalk.mjs";
import { directionalAlbedo as tableAlbedo, Lambda } from "./microfacet.mjs";
import { directionalAlbedo as pAlbedo, alphaOf } from "./principled.mjs";
import { buildTable } from "./energyCompensation.mjs";
import { schlick } from "./fresnel.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const ONE = () => 1;

console.log("microsurfaceWalk-selfcheck -- the ground truth, validated before it is believed\n");

// ---- 1. CONSERVATION IS A LAW, NOT A FIT ---------------------------------------------------------------
console.log("1. a lossless conductor must return everything it was given");

const cons = [0.16, 0.49, 1.0].map((a) => ({ a, r: albedo(0.7, a, ONE, { n: 60000, seed: 11 }) }));
for (const c of cons) say(`alpha ${String(c.a).padEnd(5)} albedo ${c.r.value.toFixed(6)}  mean bounces ${c.r.meanBounces.toFixed(3)}`);
ok("!! *** with Fresnel identically one the walk conserves EXACTLY, at every roughness ***",
   cons.every((c) => Math.abs(c.r.value - 1) < 1e-9),
   "energy that goes in has nowhere else to go -- a LAW, and no parameter was tuned to make it hold");
ok("...and the mean path length grows with roughness, which is the mechanism doing the conserving",
   cons.every((c, i) => i === 0 || c.r.meanBounces > cons[i - 1].r.meanBounces),
   `${cons.map((c) => c.r.meanBounces.toFixed(2)).join(" -> ")} -- a rougher surface traps light for longer`);
ok("every path escapes eventually, so nothing is lost to the bounce cap",
   cons.every((c) => c.r.escapedFraction > 0.999));

// ---- 2. AND ITS SINGLE-SCATTER COMPONENT IS A NUMBER THIS TREE ALREADY GRADED ---------------------------
console.log("\n2. the walk's one-bounce paths against a quadrature from another round");

const ss = [0.16, 0.36, 0.64, 1.0].map((a) => ({
    a,
    walkE: albedo(0.7, a, ONE, { n: 200000, seed: 5, onlyBounces: 1 }).value,
    tableE: tableAlbedo(a, 0.7),
}));
for (const x of ss) say(`alpha ${String(x.a).padEnd(5)} walk ${x.walkE.toFixed(6)}  table ${x.tableE.toFixed(6)}  diff ${(x.walkE - x.tableE).toExponential(2)}`);
ok("!! the walk reproduces microfacet.directionalAlbedo, which it shares no code with",
   ss.every((x) => Math.abs(x.walkE - x.tableE) < 1.5e-3),
   "a bounce simulation and a hemisphere quadrature agreeing to a thousandth is what makes the walk a " +
   "ground truth rather than an opinion");
// *** THE TRAP, KEPT BECAUSE IT COST THE ROUND AN HOUR. *** Single scatter is "one bounce AND THEN ESCAPES".
const truncated = (() => {
    const rand = rng(5);
    let s = 0; const n = 200000;
    for (let k = 0; k < n; k++) { const r = walk(0.7, 1.0, ONE, rand, { maxBounces: 1 }); if (r.bounces === 1) s += r.energy; }
    return s / n;
})();
say(`truncating the walk at one bounce instead: ${truncated.toFixed(6)} against the table's ${tableAlbedo(1.0, 0.7).toFixed(6)}`);
ok("!! capping the walk at one bounce reads FIFTY PER CENT HIGH, and the gap is exactly the shadowing",
   truncated > tableAlbedo(1.0, 0.7) * 1.4,
   "a cap removes the ESCAPE TEST, so a ray that would have been shadowed on its way out is counted as " +
   "having left. Single scatter is not 'one bounce'; it is 'one bounce and then escapes'");

// ---- 3. NOW IT CAN BE USED: v4445's BOUND BECOMES A NUMBER ---------------------------------------------
console.log("\n3. what v4445's Kulla-Conty scaling is actually worth");

const T1 = buildTable(alphaOf(1.0), { K: 24 });
const graded = REC.rows.map((row) => {
    const truth = albedo(0.7, 1.0, (c) => schlick(c, row.f0), { n: 120000, seed: 3 }).value;
    const kc = pAlbedo({ baseColour: [row.f0, row.f0, row.f0], metallic: 1, specular: 1, roughness: 1.0,
                         lobes: "specular", msTable: T1 }, 0.7, { N: 384, M: 192 });
    return { f0: row.f0, truth, kc, err: kc / truth - 1 };
});
for (const g of graded) say(`F0 ${String(g.f0).padEnd(5)} truth ${g.truth.toFixed(6)}  Kulla-Conty ${g.kc.toFixed(6)}  ${(g.err * 100).toFixed(1)}%`);
ok("the walk agrees with the frozen record it was measured into",
   graded.every((g, i) => Math.abs(g.truth - REC.rows[i].truth) / REC.rows[i].truth < 0.02));
ok("!! Kulla-Conty is EXACT at a white mirror, which is the one case it is derived to get right",
   Math.abs(graded[0].err) < 1e-3);
// *** THE FINDING: THE ERROR CHANGES SIGN, SO NO SINGLE SCALE FACTOR REPAIRS IT. ***
ok("!! *** the error UNDER-compensates in the middle and OVER-compensates at the dark end ***",
   graded.some((g) => g.err < -0.04) && graded.some((g) => g.err > 0.02),
   `worst under ${(Math.min(...graded.map((g) => g.err)) * 100).toFixed(1)}%, worst over ` +
   `${(Math.max(...graded.map((g) => g.err)) * 100).toFixed(1)}% -- a sign change, so it cannot be repaired ` +
   "by one scale factor, and 'within a few per cent' owes the reader a WHERE");
ok("...and compensation is still a large improvement everywhere, which is the fair reading", (() => {
    return graded.every((g) => {
        const un = pAlbedo({ baseColour: [g.f0, g.f0, g.f0], metallic: 1, specular: 1, roughness: 1.0,
                             lobes: "specular" }, 0.7, { N: 384, M: 192 });
        return Math.abs(g.kc - g.truth) <= Math.abs(un - g.truth) + 1e-9;
    });
})(), "being 7% off is not the same as being 62% off, and the uncompensated model was the second one");

// ---- 4. THE TWO SIGN CONVENTIONS THAT MADE THE WALK RETURN ZERO -----------------------------------------
console.log("\n4. the parts that are easy to get silently wrong");

ok("!! Lambda is SIGNED here, where microfacet.mjs's is not", lambdaSigned(-0.5, 1) === -1 - Lambda(0.5, 1),
   "microfacet.mjs only ever asks about directions above the horizon, so it squares the cosine. A walk goes " +
   "below the horizon on its FIRST STEP, and the unsigned value made every ray fail to escape -- the walk " +
   "returned 0.000000 at every roughness before this was found");
ok("...and it agrees with the unsigned one above the horizon, so the two are one function",
   lambdaSigned(0.5, 1) === Lambda(0.5, 1));
ok("!! G1 at a height is ZERO for a downward ray", g1AtHeight(-0.5, 0, 1) === 0,
   "a descending ray cannot escape upward, so it must never terminate the walk");
ok("C1 and its inverse round-trip", (() => {
    for (let k = 0; k <= 20; k++) { const h = -1 + k / 10; if (Math.abs(invC1(C1(h)) - h) > 1e-15) return false; }
    return true;
})());
ok("the sampled visible normal always points up and is normalised", (() => {
    const r = rng(9);
    for (let k = 0; k < 500; k++) {
        const m = sampleVNDF([0.6, 0, 0.8], 0.6, r(), r());
        if (m[2] <= 0 || Math.abs(Math.hypot(m[0], m[1], m[2]) - 1) > 1e-12) return false;
    }
    return true;
})());

console.log(`\nmicrosurfaceWalk-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
