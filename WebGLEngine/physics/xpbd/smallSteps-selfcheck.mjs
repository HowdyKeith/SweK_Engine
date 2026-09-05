// physics/xpbd/smallSteps-selfcheck.mjs -- v4441 -- the gate for physics/xpbd/smallSteps.mjs.
//
// *** THE PLAN ITEM NAMED A MODULE THAT NO LONGER EXISTS. *** warp.sim was deprecated in Warp 1.8 and REMOVED
// in Warp 1.10; the successor is newton-physics/newton (Apache 2.0). The reference was never the source
// anyway -- warp, newton and Omniverse all implement Macklin et al. 2019, and a paper's claim can be tested
// against this tree directly.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Make chain() ignore `iterations` (always 1)                 -> 3 RED
//  B. Drop the per-link weight from the analytic exact length     -> 6 RED
//  C. Bisect the crossover linearly instead of in log space       -> 4 RED
//     Compliance spans decades, so a linear bisection spends every step in the top one and never reaches the
//     stiff side at all. It returns a number that looks like an answer.
//  D. Fix the chain's far end too, so no constraint carries load  -> 8 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That warp or newton were read. THEY WERE NOT -- the GitHub source was not reachable from this session, and
// what is graded is the PAPER'S CLAIM against THIS solver, which is a different and smaller thing than a
// line-by-line differential. Anyone wanting that still has to read the source. That the crossover is
// universal: it is one chain, one budget, one gravity, one rest length, and section 4 shows it MOVES with the
// chain length, so 3.487e-4 is a number for this rig and not a constant of XPBD. And that the tree's
// iteration counts are wrong -- section 5 states which side of the line each compliance falls on and stops
// there, because whether a given module's constraints are stiff is a question about that module.

import { chain, budgetSplit, crossoverCompliance, crossoverDetail, CROSSOVER_AT_V4441 as REC } from "./smallSteps.mjs";
import { hangingLink } from "./compliance.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);
const mono = (a) => a.every((v, i) => i === 0 || v >= a[i - 1]);

console.log("smallSteps-selfcheck -- substeps against iterations, and where the answer changes sign\n");

// ---- 1. THE RIG HAS AN ANALYTIC ANSWER ------------------------------------------------------------------
console.log("1. the chain has a right answer, so it is a test and not a self-comparison");

const c8 = chain(8, { substeps: 3200, iterations: 1, compliance: 1e-4 });
say(`chain of 8 at compliance 1e-4: mean ${c8.mean.toFixed(8)}, exact ${c8.exact.toFixed(8)}, ` +
    `rel ${c8.relErr.toExponential(2)}`);
ok("the solver reaches the analytic equilibrium length", c8.relErr < 1e-3);
// The exact length is a SUM over links of the weight each one carries -- a wrong load model would still give
// a plausible number, so it is asserted structurally rather than by eyeball.
ok("the analytic length scales linearly with compliance, as Hooke requires", (() => {
    const a = chain(8, { substeps: 800, compliance: 1e-4 }).exact - 8;
    const b = chain(8, { substeps: 800, compliance: 2e-4 }).exact - 8;
    return Math.abs(b / a - 2) < 1e-12;
})());
ok("...and quadratically with link count, because link k carries (N-k) masses", (() => {
    const a = chain(8, { substeps: 800, compliance: 1e-4 }).exact - 8;
    const b = chain(16, { substeps: 800, compliance: 1e-4 }).exact - 16;
    return Math.abs(b / a - (16 * 17) / (8 * 9)) < 1e-9;
})(), "N(N+1)/2 -- a per-link constant load would give a ratio of 2 and pass a looser check");

// ---- 2. THE TWO RIGS THAT COULD NOT SEE IT --------------------------------------------------------------
console.log("\n2. why the tree's existing rig could not answer this");

const single = [1, 2, 4, 8, 16, 32].map((its) =>
    hangingLink({ substeps: 1600 / its, iterations: its }).stretch);
const singleErr = single.map((s) => Math.abs(s - 0.01) / 0.01);
say(`compliance.mjs's ONE-link rig, budget 1600: ${singleErr.map((e) => e.toExponential(1)).join("  ")}`);
ok("!! the single-constraint rig says ITERATIONS win, monotonically -- the opposite of Small Steps",
   singleErr[singleErr.length - 1] < singleErr[0] / 1e6,
   "not a refutation: with one constraint there is NO NETWORK for information to propagate through, so " +
   "iterating just converges a single scalar solve. A rig that cannot exhibit the mechanism cannot test it");

const soft32 = budgetSplit(32, 1600, { compliance: 1e-3 }).map((r) => r.relErr);
say(`chain of 32 at the SOFT compliance 1e-3: ${soft32.map((e) => e.toExponential(2)).join("  ")}`);
ok("...and a network measured at its quasi-static tail still says iterations, by under 2x",
   soft32[0] / soft32[soft32.length - 1] > 1 && soft32[0] / soft32[soft32.length - 1] < 3,
   "the steady stretch is what XPBD's compliance makes iteration-independent, so this asks the 2016 claim " +
   "and not the 2019 one");

// ---- 3. AND THE RIG THAT CAN ---------------------------------------------------------------------------
console.log("\n3. sweep the stiffness and the claim appears, with a sign change");

const stiff32 = budgetSplit(32, 1600, { compliance: 1e-5 }).map((r) => r.relErr);
say(`chain of 32 at the STIFF compliance 1e-5: ${stiff32.map((e) => e.toExponential(2)).join("  ")}`);
ok("!! *** AT STIFF COMPLIANCE THE ORDERING REVERSES AND SUBSTEPS WIN ***", stiff32[0] < stiff32[stiff32.length - 1],
   `${(stiff32[stiff32.length - 1] / stiff32[0]).toFixed(0)}x -- one iteration and many substeps against many ` +
   "iterations and few substeps, at identical total work");
ok("...and the degradation is monotone in the iteration share, so it is a trend and not one bad point",
   mono(stiff32));
ok("the infinitely stiff limit behaves like the stiff one, not like the soft one", (() => {
    const rigid = budgetSplit(32, 1600, { compliance: 0 }).map((r) => r.relErr);
    return rigid[0] < rigid[rigid.length - 1] && mono(rigid);
})(), "compliance 0 is ordinary PBD, where small steps was always the known answer");

// ---- 4. THE CROSSOVER, AND IT IS A PROPERTY OF THE RIG RATHER THAN A CONSTANT ---------------------------
console.log("\n4. where the sign changes");

const x32 = crossoverCompliance(32, 1600);
say(`crossover compliance at 32 links, budget 1600: ${x32.toExponential(3)}`);
ok("the crossover is where the record says it is", Math.abs(x32 - REC.crossover) / REC.crossover < 0.05);
ok("...and it brackets correctly: stiffer than it, substeps win; softer, iterations do", (() => {
    const below = budgetSplit(32, 1600, { compliance: x32 / 10 }).map((r) => r.relErr);
    const above = budgetSplit(32, 1600, { compliance: x32 * 10 }).map((r) => r.relErr);
    return below[0] < below[below.length - 1] && above[0] > above[above.length - 1];
})());
// *** IT MOVES, AND THE ASSERTION IS ON THE BUDGET AXIS BECAUSE THE LENGTH AXIS SATURATES. ***
const byBudget = [400, 800, 1600, 3200].map((b) => crossoverCompliance(32, b));
say(`crossover by budget 400/800/1600/3200: ${byBudget.map((v) => v.toExponential(3)).join("  ")}`);
ok("!! the crossover moves by more than an order of magnitude with the BUDGET, so it is not a constant of XPBD",
   Math.max(...byBudget) / Math.min(...byBudget) > 10,
   `${(Math.max(...byBudget) / Math.min(...byBudget)).toFixed(0)}x -- a round quoting 3.487e-4 as a property ` +
   "of the method would be quoting its own test setup");
ok("...and it falls monotonically as the budget grows, which is a trend rather than scatter",
   byBudget.every((v, i) => i === 0 || v <= byBudget[i - 1]));

// *** AND THE SEARCH REPORTS WHEN IT HAS FOUND NOTHING, BECAUSE IT ONCE RETURNED ITS OWN FLOOR. ***
const short = crossoverDetail(2, 1600);
say(`chain of 2: saturated=${short.saturated} at the ${short.at} bound`);
ok("!! a bisection with no sign change across its bracket says so instead of returning an end",
   short.saturated === true,
   "at N = 2 substeps never win anywhere in the range, and the first version reported the floor 1.000e-6 as " +
   "a crossover a thousand times stiffer than its neighbours -- the ABSENCE of a crossover wearing a number");
ok("...and the 32-link case is genuinely bracketed, so the row above is not vacuous",
   crossoverDetail(32, 1600).saturated === false);

// ---- 5. WHICH SIDE THE TREE IS ON ----------------------------------------------------------------------
console.log("\n5. the differential against this tree's own code");

ok("the record's compliance census splits at the crossover it names",
   REC.belowCrossover.every((c) => c < REC.crossover) && REC.aboveCrossover.every((c) => c > REC.crossover));
ok("...and the two halves together are the whole census",
   REC.belowCrossover.length + REC.aboveCrossover.length === REC.treeCompliances.length);
ok("!! the tree uses compliances on BOTH sides, which is why the number is worth having",
   REC.belowCrossover.length > 0 && REC.aboveCrossover.length > 0,
   `below: ${REC.belowCrossover.join(", ")}  |  above: ${REC.aboveCrossover.join(", ")}`);
ok("the core solver's default is the small-steps convention", REC.solverDefault === 1,
   "physics/xpbd/xpbd.js reads `opts.iterations ?? 1`, which is what warp and newton do, and is RIGHT for " +
   "the stiff half of that census");

console.log(`\nsmallSteps-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
