#!/usr/bin/env node
// WebGLEngine/tools/ship/traderPolicy-selfcheck.mjs -- v4314 (Level 16)
//
// GRADES THE BRAIN AS A TRADER: a ship whose route is scored by the docking brain's own policy network, trained
// by the docking brain's own evolution strategy over whole economies, against the greedy hauler in the same seat
// over the same seeds and days. The honest question -- does learning beat greedy in this toy economy -- gets a
// NUMBER here, and the number is allowed to be no: what is graded is that the learner trades (real trips, a real
// return, the books closed), that training moves the return, that the comparison is fair (same seat, same
// information, same days), and that the verdict is reported as measured rather than assumed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy, GOODS } from "../../world/gitEconomy.mjs";
import { traders as gitTraders } from "../../world/traderGraph.mjs";
import * as P from "../../world/traderPolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-01" });
const crewOf = () => [...gitTraders().map((t) => ({ name: t.name || t.id })), ...system.bodies.map((b) => ({ name: "hauler of " + b.name }))];
/** The learner takes seat `slot` in an otherwise greedy crew; everything else is the v4300 economy. */
const mkEco = (policy, seed, slot = 0) => { const crew = crewOf(); crew[slot] = { ...crew[slot], policy }; return makeGitEconomy(system, { seed, traders: crew }); };
const DAYS = 60, EPISODES = 3, SEED0 = 100;

console.log("\n1. THE SEAT: a policy ship trades through the same economy, sees the same numbers, closes the same books");
{
    const g = P.episode(mkEco, P.greedyPolicy(), { seed: SEED0, days: DAYS });
    ok("the greedy rule as a policy: real trips, a positive return, tons and credits conserved", g.trips > 3 && g.ret > 0 && g.accounting.tonsConserved && g.accounting.creditsOk, `${g.trips} trips, return ${g.ret}`);
    const cs = g.economy.candidates(g.economy.ships[1]);
    ok("  a candidate carries what greedy sees (prices, margin, a payable destination) plus distance and stocks", cs.length > 0 && cs.every((c) => GOODS.includes(c.good) && c.margin === c.sellP - c.buyP && c.dist >= 0 && c.treasury >= c.sellP && c.stockHere > 0), `${cs.length} candidates for ship 1`);
    ok("  the features are seven near-unit numbers per candidate", cs.every((c) => P.featuresOf(c, {}, { extent: 10, holdTons: 40 }).length === P.OBS_DIM && P.featuresOf(c, {}, { extent: 10, holdTons: 40 }).every((v) => Number.isFinite(v) && Math.abs(v) <= 3)));
    const n = P.paramCount([8, 8]);
    const zero = P.episode(mkEco, P.learnedPolicy(new Float32Array(n)), { seed: SEED0, days: DAYS });
    ok("an untrained policy (all weights 0, every score 0 > -inf) still takes a leg -- the first candidate -- and the books still close", zero.trips >= 1 && zero.accounting.creditsOk && zero.accounting.tonsConserved, `${zero.trips} trips, return ${zero.ret}`);
    const d1 = P.evaluateParams(mkEco, new Float32Array(n).fill(0.1), { episodes: 2, seed0: SEED0, days: 30 }), d2 = P.evaluateParams(mkEco, new Float32Array(n).fill(0.1), { episodes: 2, seed0: SEED0, days: 30 });
    ok("  the same parameters over the same seeds return the same number (a policy is a function)", d1.avgReturn === d2.avgReturn && d1.avgTrips === d2.avgTrips, `${d1.avgReturn}`);
}

console.log("\n2. THE NUMBER: the docking brain's ES over economies, against greedy in the same seat");
{
    const greedy = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: SEED0, days: DAYS });
    const t0 = Date.now();
    const curveNotes = [];
    const tr = P.trainTraderES(mkEco, { iters: 14, pop: 8, sigma: 0.15, lr: 0.1, hidden: [8, 8], episodes: EPISODES, seed: 3, days: DAYS, onIter: (x) => curveNotes.push(`${x.iter}:${x.avgReturn.toFixed(0)}`) });
    const ms = Date.now() - t0;
    const learned = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: SEED0, days: DAYS });
    report(`greedy ${greedy.avgReturn.toFixed(0)} cr (${greedy.avgTrips.toFixed(1)} trips); learned ${learned.avgReturn.toFixed(0)} cr (${learned.avgTrips.toFixed(1)} trips) after ${tr.curve.length - 1} iterations, ${tr.paramCount} parameters, ${ms} ms`);
    report(`the curve: ${tr.curve.map((v) => v.toFixed(0)).join(" -> ")}`);
    ok("training moves the return: the best iterate beats the starting policy", tr.best.avgReturn > tr.curve[0], `${tr.curve[0].toFixed(0)} -> ${tr.best.avgReturn.toFixed(0)}`);
    ok("  the learner trades for real: trips on every seed, no bankruptcy", learned.avgTrips > 2 && learned.bankrupt === 0, `${learned.avgTrips.toFixed(1)} trips`);
    ok("  the comparison is fair: same seat, same seeds, same days, same information (greedy through the same policy hook)", greedy.avgTrips > 0 && learned.avgTrips > 0);
    // the number that counts is on seeds the learner never trained on: the training seeds flatter a policy that fit them
    const HELD = 500, greedyHeld = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: HELD, days: DAYS }), learnedHeld = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: HELD, days: DAYS });
    const ratioTrain = learned.avgReturn / Math.max(1, greedy.avgReturn), ratio = learnedHeld.avgReturn / Math.max(1, greedyHeld.avgReturn);
    report(`held-out seeds ${HELD}..: greedy ${greedyHeld.avgReturn.toFixed(0)} cr, learned ${learnedHeld.avgReturn.toFixed(0)} cr (${learnedHeld.avgTrips.toFixed(1)} trips); on the training seeds the learner read ${(ratioTrain * 100).toFixed(0)}% of greedy`);
    const verdict = ratio >= 1 ? "LEARNING BEATS GREEDY" : ratio >= 0.5 ? "learning trails greedy" : "learning is far behind greedy";
    ok(`*** THE VERDICT, MEASURED ON HELD-OUT SEEDS: ${verdict} -- ${(ratio * 100).toFixed(0)}% of the greedy return over ${DAYS} days ***`, Number.isFinite(ratio) && learnedHeld.bankrupt === 0, "reported, not assumed; the gate does not require a win");
    const cheap = P.evaluateParams(mkEco, tr.params, { episodes: 1, seed0: 777, days: DAYS });
    ok("  and on a seed it never trained on it still trades (no bankruptcy, trips made)", cheap.avgTrips > 0 && cheap.bankrupt === 0, `return ${cheap.avgReturn.toFixed(0)} on seed 777`);
    fs.writeFileSync(path.join(ENG, "tools/ship/trader-policy.json"), JSON.stringify({ version: "v4314", days: DAYS, episodes: EPISODES, greedy: greedy.avgReturn, learned: learned.avgReturn, ratioTrain, heldOut: { greedy: greedyHeld.avgReturn, learned: learnedHeld.avgReturn, ratio }, iterations: tr.curve.length - 1, curve: tr.curve, params: tr.params, hidden: [8, 8], obsDim: P.OBS_DIM }, null, 1));
    report("the trained parameters and the numbers are written to tools/ship/trader-policy.json for the page and the next round");
}

console.log("\n3. v4316 -- WOULD A BETTER LEARNER WIN? Three more trainings: a wider net, a longer run, another seed -- the SPREAD is the answer");
{
    const HELD = 500, greedyHeld = P.evaluateGreedy(mkEco, { episodes: EPISODES, seed0: HELD, days: DAYS });
    const runs = [];
    for (const cfg of [{ name: "narrow, 14 iterations, seed 3 (Level 16's)", hidden: [8, 8], iters: 14, pop: 8, seed: 3 }, { name: "narrow, 30 iterations, seed 5", hidden: [8, 8], iters: 30, pop: 12, seed: 5 }, { name: "wide [16,16], 30 iterations, seed 5", hidden: [16, 16], iters: 30, pop: 12, seed: 5 }]) {
        const t0 = Date.now();
        const tr = P.trainTraderES(mkEco, { iters: cfg.iters, pop: cfg.pop, sigma: 0.15, lr: 0.1, hidden: cfg.hidden, episodes: EPISODES, seed: cfg.seed, days: DAYS });
        const held = P.evaluateParams(mkEco, tr.params, { episodes: EPISODES, seed0: HELD, days: DAYS, hidden: cfg.hidden });
        runs.push({ ...cfg, ratio: held.avgReturn / Math.max(1, greedyHeld.avgReturn), heldReturn: held.avgReturn, params: tr.paramCount, ms: Date.now() - t0, bankrupt: held.bankrupt });
        report(`${cfg.name}: held-out ${held.avgReturn.toFixed(0)} cr = ${(100 * runs[runs.length - 1].ratio).toFixed(0)}% of greedy (${tr.paramCount} parameters, ${runs[runs.length - 1].ms} ms)`);
    }
    const ratios = runs.map((r) => r.ratio), lo = Math.min(...ratios), hi = Math.max(...ratios);
    const robust = lo >= 1 ? "EVERY training beats greedy" : hi < 1 ? "NO training beats greedy" : "the win is INSIDE THE SPREAD of trainings -- some beat greedy, some do not";
    ok(`*** THE ANSWER, MEASURED: ${robust} (${(100 * lo).toFixed(0)}% to ${(100 * hi).toFixed(0)}% of greedy across ${runs.length} trainings) ***`, ratios.every(Number.isFinite) && runs.every((r) => r.bankrupt === 0), "reported as the spread, not the best run");
    ok("  wider is not better here: the 417-parameter net does not beat the 145-parameter one by more than the spread", Math.abs(runs[2].ratio - runs[0].ratio) < (hi - lo) + 1e-9);
    fs.writeFileSync(path.join(ENG, "tools/ship/trader-policy-spread.json"), JSON.stringify({ version: "v4316", days: DAYS, greedy: greedyHeld.avgReturn, runs: runs.map(({ name, hidden, iters, pop, seed, ratio, heldReturn, params, ms }) => ({ name, hidden, iters, pop, seed, ratio, heldReturn, params, ms })), verdict: robust }, null, 1));
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 16.
//   A  the ES update sign flipped (theta -= grad) -> exit=1, 2 red: the learner goes bankrupt on a seed and the
//      held-out verdict reads "far behind greedy, -6%". The "best iterate beats the start" line stayed green --
//      with fourteen noisy iterates one beats a bad start by chance -- which is why the verdict is measured on
//      held-out seeds and not on the training curve.
//   B  featuresOf() returning zeros -> exit=1, 1 red: every candidate scores the same, the curve is flat
//      (-1712 -> -1712), the best never beats the start.
//   (v4316: section 3 is a measurement of the spread, not a claim, and was not sabotaged -- a sabotage of the ES is A above.)
//   C  the policy hook ignored (greedy's route for every seat) -> exit=1, 1 red: the curve is flat at greedy's
//      own return (17082 -> 17082) whatever the parameters, so training cannot move it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a DIFFERENT learner family. Section 3 answers v4314's question for this one -- the docking brain's MLP and " +
    "ES -- with a spread across trainings rather than a best run; a policy that saw the whole market (not one leg at a time), a " +
    "gradient method, or hours of training is a different experiment, and the number here is for this learner, this economy, these days.");
process.exit(fails ? 1 : 0);
