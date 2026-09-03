// physics/render/albedoEstimator-selfcheck.mjs -- v4438 -- the gate for physics/render/albedoEstimator.mjs.
//
// *** THIS ROUND EXISTS BECAUSE v4437 WROTE A SENTENCE AND DID NOT ACT ON IT. *** That round's honest scope
// said every furnace number at low roughness and grazing angles should be re-checked against the grid failure
// it had just found. Leaving that written down and unacted is leaving the tree standing on an instrument
// already known to be broken, so this is the check rather than another note about it.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Flip gridIsUnsafe to OR instead of AND                       -> 4 RED
//  B. Drop the escaped-draw counter and divide by the survivors    -> 4 RED
//  C. Make buildTable ignore `estimator` and always use the grid   -> 1 RED
//  D. Let the `plant` path go through the sampler   -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** THE THIRD ZERO IN FOUR ROUNDS, AND THE SHARPEST. *** The row asserted that a planted table DIFFERS
//     from the grid-only table. With plants routed through the sampler it STILL differed -- because the
//     ESTIMATOR had changed, not because the plant was applied. A check satisfiable by the wrong cause is
//     v4420's ratchet, and it would have left every planting gate in the tree passing for free. Repaired by
//     asserting the MECHANISM: a planted table must BE the grid with the plant applied, row for row.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That the grid is bad. It is DETERMINISTIC and the sampler is not, and section 4 shows that mattering: the
// convergence-order study in energyCompensation-selfcheck.mjs needs a smooth integrand underneath it and now
// pins `estimator: "grid"` out loud. THE DEFAULT AND THE STUDY WANT DIFFERENT THINGS AND BOTH ARE RIGHT.
// That the threshold is optimal: NARROW_ALPHA and OBLIQUE_COS are generous rather than tuned, because being
// wrong toward the sampler costs Monte Carlo noise and being wrong toward the grid costs 73%. And that any
// OTHER integrator in the tree has been audited -- this round reaches directionalAlbedo's consumers and
// nothing else.

import {
    rng, sampledAlbedo, gridError, gridIsUnsafe, trustworthy, NARROW_ALPHA, OBLIQUE_COS, RISK_AT_V4438,
} from "./albedoEstimator.mjs";
import { directionalAlbedo } from "./microfacet.mjs";
import { buildTable } from "./energyCompensation.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("albedoEstimator-selfcheck -- the grid was the wrong instrument, not a careless one\n");

// ---- 1. THE FAILURE IS REAL, AND IT IS AT A CELL THE TREE ACTUALLY BUILDS -------------------------------
console.log("1. the shipped defect");

const mu0 = RISK_AT_V4438.tableFirstMu;
ok("buildTable's first row IS the most oblique angle there is", Math.abs(mu0 - 0.5 / 24) < 1e-15,
   `mu = ${mu0.toFixed(6)} -- the table starts in the regime the grid cannot integrate`);
const shipped = gridError(0.05, mu0, { N: 220, M: 220, n: 120000, seed: 3 });
say(`alpha 0.05 at mu ${mu0.toFixed(4)}: grid(220) ${shipped.grid.toFixed(6)}  sampled ${shipped.sampled.toFixed(6)}  ` +
    `error ${(shipped.rel * 100).toFixed(1)}%`);
ok("!! the grid is wrong by more than a fifth at an alpha the tree's gates BUILD AT", shipped.rel > 0.2,
   "0.05 is ALPHAS[0] in energyCompensation-selfcheck.mjs -- this is shipped, not synthetic");
ok("...and msDirect's coarser N=120 is worse still",
   gridError(0.05, mu0, { N: 120, M: 120, n: 120000, seed: 3 }).rel > shipped.rel);
// *** THE RULE FLAGS MORE THAN IS MATERIALLY WRONG, AND THAT IS THE RULE WORKING RATHER THAN A MISMATCH. ***
// The first version of this row asserted the two lists were the same and went red saying so.
ok("the rule flags exactly the alphas it says it does",
   JSON.stringify(RISK_AT_V4438.gateAlphas.filter((a) => gridIsUnsafe(a, mu0))) ===
   JSON.stringify([...RISK_AT_V4438.ruleFlags]),
   `of ${RISK_AT_V4438.gateAlphas.join(", ")} the rule flags ${RISK_AT_V4438.ruleFlags.join(", ")}`);
ok("!! ...and only a SUBSET of those is materially wrong, which is measured rather than assumed",
   RISK_AT_V4438.gateAlphas
       .filter((a) => gridError(a, mu0, { n: 60000, seed: 6 }).rel > RISK_AT_V4438.materialThreshold)
       .join() === RISK_AT_V4438.materiallyWrong.join(),
   `0.2 is flagged and is only 0.84% off; 0.05 is flagged and is 24% off. A conservative rule costs Monte ` +
   "Carlo noise on 0.2 and saves a quarter on 0.05");

// ---- 2. WHICH ESTIMATOR IS RIGHT, SETTLED BY REFINING BOTH ----------------------------------------------
console.log("\n2. refine both and see which one moves -- v4432's rule, third round running");

const ladder = [1200, 2400].map((N) => directionalAlbedo(0.02, mu0, { N, M: N }));
const mcLadder = [60000, 400000].map((n, i) => sampledAlbedo(0.02, mu0, { n, seed: i + 1 }).value);
say(`grid    N=1200 ${ladder[0].toFixed(6)}  N=2400 ${ladder[1].toFixed(6)}   (still climbing)`);
say(`sampled n=60k  ${mcLadder[0].toFixed(6)}  n=400k ${mcLadder[1].toFixed(6)}   (flat)`);
ok("!! the grid is still moving between its two finest rungs", Math.abs(ladder[1] - ladder[0]) > 0.1,
   `moved ${(ladder[1] - ladder[0]).toFixed(6)} -- it has not converged even at N=2400`);
ok("!! ...and the sampler is not, across a sevenfold sample increase",
   Math.abs(mcLadder[1] - mcLadder[0]) / mcLadder[1] < 0.01,
   "the estimator that needed no refinement was the one that looked like the approximation");
ok("the grid is climbing TOWARD the sampler rather than away from it",
   ladder[1] > ladder[0] && ladder[1] < mcLadder[1]);

// ---- 3. THE RULE IS A PRODUCT, AND BOTH HALVES ARE ASSERTED ---------------------------------------------
console.log("\n3. narrow AND oblique -- neither alone");

ok("a narrow lobe head-on is safe", !gridIsUnsafe(0.05, 0.95) &&
   gridError(0.05, 0.95, { n: 120000, seed: 4 }).rel < 0.02);
ok("a broad lobe at grazing is safe", !gridIsUnsafe(0.8, mu0) &&
   gridError(0.8, mu0, { n: 120000, seed: 4 }).rel < 0.02);
ok("!! and the two together are not", gridIsUnsafe(0.05, mu0) && shipped.rel > 0.2);
ok("trustworthy() routes by the rule rather than by the call site",
   trustworthy(0.05, mu0).estimator === "sampled" && trustworthy(0.8, 0.5).estimator === "grid");
ok("the thresholds are the ones the rule names", NARROW_ALPHA === 0.3 && OBLIQUE_COS === 0.35);

// ---- 4. THE TABLE, REPAIRED -- AND THE ONE STUDY THAT STILL WANTS THE GRID ------------------------------
console.log("\n4. buildTable now picks the right estimator per cell");

const fixed = buildTable(0.05, { K: 24 });
const old = buildTable(0.05, { K: 24, estimator: "grid" });
say(`first row: repaired ${fixed.E[0].toFixed(6)}  grid-only ${old.E[0].toFixed(6)}`);
ok("!! the repaired table's grazing row no longer reads a quarter low",
   Math.abs(fixed.E[0] - shipped.sampled) / shipped.sampled < 0.02);
ok("...and the grid-only path still reproduces the OLD wrong value, so the change is visible not silent",
   Math.abs(old.E[0] - shipped.grid) / shipped.grid < 0.01);
let sameCount = 0;
for (let i = 0; i < 24; i++) if (Math.abs(fixed.E[i] - old.E[i]) / old.E[i] < 0.005) sameCount++;
ok("the repair touches only the grazing rows -- the rest of the table is unmoved", sameCount >= 20,
   `${sameCount} of 24 rows within half a per cent of the old value`);
ok("a broad-lobe table is unchanged entirely", (() => {
    const a = buildTable(0.8, { K: 24 }), b = buildTable(0.8, { K: 24, estimator: "grid" });
    return a.E.every((v, i) => Math.abs(v - b.E[i]) < 1e-12);
})(), "alpha 0.8 is nowhere near the unsafe regime, so nothing about it may move");

// *** THE PLANT PATH MUST STAY ON THE GRID OR EVERY GATE THAT PLANTS ONE IS QUIETLY DISARMED -- AND THE
// FIRST VERSION OF THIS ROW COULD NOT SEE THAT. *** It asserted that a planted table DIFFERS from the
// grid-only table, and sabotage D (routing plants through the sampler) read ZERO RED: the planted table still
// differed, because the ESTIMATOR had changed rather than the plant being applied. A check satisfiable by the
// wrong cause is v4420's ratchet, and the fix is to assert the mechanism instead of the symptom -- a planted
// table must be EXACTLY the grid with the plant applied, row for row.
const planted = buildTable(0.05, { K: 24, plant: { separable: true } });
const cleanGrid = buildTable(0.05, { K: 24, estimator: "grid" });
ok("a plant still changes the table at all", planted.E.some((v, i) => Math.abs(v - cleanGrid.E[i]) > 1e-9));
ok("!! ...and the planted table IS the grid with the plant applied, row for row",
   planted.E.every((v, i) => Math.abs(v - directionalAlbedo(0.05, (i + 0.5) / 24,
       { N: 220, M: 220, plant: { separable: true } })) < 1e-12),
   "asserting the MECHANISM rather than the symptom: routing plants through the sampler would leave the " +
   "symptom intact and make every planting gate in the tree pass for free");

// ---- 5. THE ESTIMATOR REPORTS WHAT IT DISCARDED ---------------------------------------------------------
console.log("\n5. what it threw away, said out loud");

const s = sampledAlbedo(0.05, mu0, { n: 20000, seed: 8 });
say(`at alpha 0.05, mu ${mu0.toFixed(4)}: ${s.escaped} of ${s.n} draws went below the horizon`);
ok("sampledAlbedo reports escaped draws rather than hiding them", typeof s.escaped === "number" && s.escaped > 0);
ok("...and divides by the draws MADE, not the draws that survived",
   Math.abs(s.value - trustworthy(0.05, mu0, { n: 20000, seed: 8 }).value) < 1e-12,
   "dividing by survivors turns a sampler that rejects most draws into one that looks unbiased -- v4437's own first probe");
ok("rng is deterministic", (() => { const a = rng(2), b = rng(2); for (let i = 0; i < 40; i++) if (a() !== b()) return false; return true; })());

// ---- 6. THE RECORD --------------------------------------------------------------------------------------
console.log("\n6. the record is re-derived, not remembered");

ok("RISK_AT_V4438's shipped grid value still reads what it says",
   Math.abs(directionalAlbedo(0.05, mu0, { N: 220, M: 220 }) - RISK_AT_V4438.shipped.grid220) < 1e-4);
ok("...and its coarser one", Math.abs(directionalAlbedo(0.05, mu0, { N: 120, M: 120 }) - RISK_AT_V4438.shipped.grid120) < 1e-4);
ok("...and the worst case's grid value",
   Math.abs(directionalAlbedo(0.02, mu0, { N: 220, M: 220 }) - RISK_AT_V4438.worst.grid220) < 1e-4);
ok("the sampled reference in the record agrees with a fresh estimate",
   Math.abs(sampledAlbedo(0.02, mu0, { n: 400000, seed: 3 }).value - RISK_AT_V4438.worst.sampled) / RISK_AT_V4438.worst.sampled < 0.01);

console.log(`\nalbedoEstimator-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
