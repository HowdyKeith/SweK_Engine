// WebGLEngine/tools/ship/takeKitGrid-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeKitGrid-selfcheck.mjs      (about 20 s)
//
// THE GATE OF tools/ship/takeKitGrid.mjs (+ takeKitGridCmd.mjs): the kit grid, registered in brain/KIT_GRID_WIP.md before any code. The grids here are SYNTHETIC (hand-built from chosen scores, outcomes, losses and first divergences) except the real engine rows of section 6, which fly Scenario 105 and Scenarios 1 and 2 (DEV) through `subsetsOf`. The registered scenarios 101 to 112 are not flown by this gate, 105 excepted (it is in the registration as already read).
//   1  THE CONSTANTS   the registered set (101 to 112), the tie tolerance, the eight subsets in order, scenario 105's known table (against brain/COUNTERFACTUAL_WIP.md), the kinds of first divergence.
//   2  THE CHECKS      all five pass on a good grid, word for word; each fails by its words.
//   3  THE READINGS    Q1 pooled (by hand), Q2 carriers, Q3 patterns, kindOf for every kind and the precedence between them, Q4 counts.
//   4  THE REPORT      word for word on a small synthetic grid: the label of a set that is not the registered one, the failed-check shape, every question's lines, the bottom line.
//   5  THE COMMAND     the arguments and their refusals, the seam `grid`, `--out`, a throwing grid, the real default seams.
//   6  THE REAL ENGINE Scenario 105 under the eight subsets is the table of brain/COUNTERFACTUAL_WIP.md section 7 (the DETERMINISM check on the real fights); DEV scenarios 1 and 2 through the command line as a child process.
// NOT CHECKED, said plainly: the twelve registered scenarios (not flown until the read); that a synthetic grid's numbers mean anything.
//
// SABOTAGE LOG: filled in below when the sweep is run.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./takeKitGrid.mjs";
import * as CF from "../../brain/counterfactual.mjs";
import * as A from "../../brain/afterAction.mjs";
import { subsetsOf } from "./takeCounterfactual.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
const HERE = path.dirname(fileURLToPath(import.meta.url));
console.log("takeKitGrid-selfcheck -- the kit grid\n");

const ORDER = ["none", "decoy", "screen", "interceptor", "decoy+screen", "decoy+interceptor", "screen+interceptor", "decoy+screen+interceptor"];
const ev = (type, extra = {}) => ({ tick: 100, type, boat: 0, ...extra });
/** A synthetic scenario: `spec` is an array of eight [outcome, score, lost, divergence-or-null] in ORDER; the empty kit repeats run B and the full kit run K. */
const scen = (seed, spec) => ({ seed, pair: {}, rows: ORDER.map((name, i) => ({ kit: name === "none" ? [] : name.split("+"), name, run: { outcome: spec[i][0], score: spec[i][1], lost: spec[i][2] }, repeats: i === 0 ? "B" : i === 7 ? "K" : null, divergence: spec[i][3] === undefined ? null : spec[i][3], decoyed: 0, intercepted: 0 })) });
const flat = (seed, score = 1, outcome = "defended", lost = 0) => scen(seed, ORDER.map(() => [outcome, score, lost, null]));
const SEEDS12 = X.seedsOf();
const KNOWN = { none: ["defended", 1.702, 3], decoy: ["breached", -0.167, 0], screen: ["breached", -0.467, 2], interceptor: ["breached", -0.467, 2], "decoy+screen": ["breached", -0.317, 1], "decoy+interceptor": ["breached", -0.317, 1], "screen+interceptor": ["breached", -0.317, 1], "decoy+screen+interceptor": ["breached", -0.317, 1] };
const s105 = () => scen(105, ORDER.map((n) => [KNOWN[n][0], KNOWN[n][1], KNOWN[n][2], null]));
const grid12 = (f = {}) => SEEDS12.map((s) => (f[s] ? f[s]() : s === 105 ? s105() : flat(s)));

sec("1. THE CONSTANTS");
{
    const reg = fs.readFileSync(path.join(HERE, "..", "..", "brain", "KIT_GRID_WIP.md"), "utf8"), cfw = fs.readFileSync(path.join(HERE, "..", "..", "brain", "COUNTERFACTUAL_WIP.md"), "utf8");
    ok("!! the registered set is scenarios 101 to 112 (twelve), the afterAction set; seedsOf gives them in order; the tie tolerance is 1e-9", J(X.REGISTERED) === J({ first: 101, count: 12 }) && J(X.REGISTERED) === J(A.SETS.registered) && J(SEEDS12) === J([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]) && J(X.seedsOf(1, 4)) === J([1, 2, 3, 4]) && X.TIE === 1e-9 && /scenarios 101 to 112/i.test(reg));
    ok("!! the eight subsets, in the registered order (the counterfactual module's SUBSETS), the empty kit first and the full kit last", J(X.ORDER) === J(ORDER) && J(X.ORDER) === J(CF.SUBSETS.map((k) => CF.kitName(k))) && Object.isFrozen(X.ORDER));
    ok("!! Scenario 105's known table: the outcomes and scores of brain/COUNTERFACTUAL_WIP.md section 7 (1.702, -0.167, -0.467 x2, -0.317 x4), in ORDER", ORDER.every((n) => X.KNOWN_105[n][0] === KNOWN[n][0] && X.KNOWN_105[n][1] === KNOWN[n][1].toFixed(3)) && Object.isFrozen(X.KNOWN_105) && ["1.702", "-0.167", "-0.467", "-0.317"].every((t) => cfw.includes(t)));
    ok("!! the kinds of first divergence, in the order they are reported", J(X.KINDS) === J(["intercepted", "decoyed", "a different hit", "a loss", "a different fire", "something else", "none"]) && Object.isFrozen(X.KINDS));
}

sec("2. THE CHECKS");
{
    const by = (rows, n) => rows.find((r) => r.name === n), good = X.checksOf(grid12(), SEEDS12);
    ok("!! on a good grid the five checks come in this order and all pass, word for word", good.map((c) => c.name).join() === "SCENARIOS,SUBSETS,ENDS,DETERMINISM,SCORES" && good.every((c) => c.ok) && good[0].text === "12 scenarios, seeds 101 to 112, once each" && good[1].text === "eight subsets in every scenario, in the order none, decoy, screen, interceptor, decoy+screen, decoy+interceptor, screen+interceptor, decoy+screen+interceptor" && good[2].text === "the empty kit repeats run B and the full kit run K in every scenario (by fingerprint)" && good[3].text === "scenario 105's eight rows are the table of brain/COUNTERFACTUAL_WIP.md section 7 (outcomes and scores)" && good[4].text === "every score is a number", good.map((c) => c.text).join(" | "));
    const miss = grid12().slice(1), swapped = grid12().map((g, i) => (i === 0 ? { ...g, seed: 102 } : i === 1 ? { ...g, seed: 101 } : g));
    ok("!! SCENARIOS: a missing scenario, a scenario twice or the seeds in another order fail, naming what the grid holds and what was asked", by(X.checksOf(miss, SEEDS12), "SCENARIOS").text === "the grid holds seeds 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112 and 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112 were asked" && by(X.checksOf(swapped, SEEDS12), "SCENARIOS").ok === false && by(X.checksOf(grid12().concat([flat(101)]), SEEDS12), "SCENARIOS").ok === false);
    const g2 = grid12(); g2[3] = { ...g2[3], rows: [g2[3].rows[1], g2[3].rows[0], ...g2[3].rows.slice(2)] }; const g3 = grid12(); g3[6] = { ...g3[6], rows: g3[6].rows.slice(0, 7) };
    ok("!! SUBSETS: a scenario whose subsets are in another order, or fewer than eight, is named (by its seed)", by(X.checksOf(g2, SEEDS12), "SUBSETS").text === "scenario 104 did not fly the eight subsets in the registered order (none, decoy, screen, interceptor, decoy+screen, decoy+interceptor, screen+interceptor, decoy+screen+interceptor)" && by(X.checksOf(g3, SEEDS12), "SUBSETS").text.startsWith("scenario 107 did not fly") && by(X.checksOf(g2.map((g, i) => (i === 7 ? g3[6] : g)), SEEDS12), "SUBSETS").text.startsWith("scenario 104, 107 did not fly"));
    const e1 = grid12(); e1[2].rows[0].repeats = null; const e2 = grid12(); e2[9].rows[7].repeats = "B"; const e3 = grid12(); e3[0].rows[0].repeats = "K";
    ok("!! ENDS: the empty kit that does not repeat run B, the full kit that does not repeat run K (even if it repeats B), and the empty kit repeating K are named by seed; several are joined by ', '", by(X.checksOf(e1, SEEDS12), "ENDS").text === "scenario 103: the empty kit does not repeat run B or the full kit run K" && by(X.checksOf(e2, SEEDS12), "ENDS").ok === false && by(X.checksOf(e3, SEEDS12), "ENDS").ok === false && by(X.checksOf(e1.map((g, i) => (i === 9 ? e2[9] : g)), SEEDS12), "ENDS").text === "scenario 103, 110: the empty kit does not repeat run B or the full kit run K");
    const d1 = grid12(); d1[4].rows[3].run.score = -0.4; const d2 = grid12(); d2[4].rows[0].run.outcome = "breached"; const d3 = grid12(); d3[4].rows[7].run.score = -0.317 + 0.0004;
    ok("!! DETERMINISM: a score of scenario 105 that differs in the third decimal, an outcome that differs, and the rows named; a difference that rounds to the same three decimals passes; without 105 the check says there is nothing to compare", by(X.checksOf(d1, SEEDS12), "DETERMINISM").text === "scenario 105's interceptor differ from the table of brain/COUNTERFACTUAL_WIP.md section 7" && by(X.checksOf(d2, SEEDS12), "DETERMINISM").text === "scenario 105's none differ from the table of brain/COUNTERFACTUAL_WIP.md section 7" && by(X.checksOf(d3, SEEDS12), "DETERMINISM").ok === true && by(X.checksOf(grid12().filter((g) => g.seed !== 105), SEEDS12.filter((s) => s !== 105)), "DETERMINISM").text === "scenario 105 is not among these scenarios (nothing to compare)" && by(X.checksOf(grid12().filter((g) => g.seed !== 105), SEEDS12.filter((s) => s !== 105)), "DETERMINISM").ok === true);
    const d4 = grid12(); d4[4].rows[1].run.score = -0.167 - 0.0006; const d5 = grid12(); d5[4].rows = d5[4].rows.slice(0, 5);
    ok("!! DETERMINISM: a difference of 0.0006 shows in the third decimal; a scenario 105 with fewer rows names the missing ones", by(X.checksOf(d4, SEEDS12), "DETERMINISM").ok === false && by(X.checksOf(d5, SEEDS12), "DETERMINISM").text === "scenario 105's decoy+interceptor, screen+interceptor, decoy+screen+interceptor differ from the table of brain/COUNTERFACTUAL_WIP.md section 7");
    const n1 = grid12(); n1[0].rows[2].run.score = NaN; const n2 = grid12(); n2[5].rows[7].run.score = Infinity;
    ok("!! SCORES: a score that is NaN or infinite, in any row, names the scenario; a score of zero or a negative one is a number", by(X.checksOf(n1, SEEDS12), "SCORES").text === "scenario 101 has a score that is not a number" && by(X.checksOf(n2, SEEDS12), "SCORES").text === "scenario 106 has a score that is not a number" && by(X.checksOf([flat(101, 0), flat(102, -3)], [101, 102]), "SCORES").ok === true);
}

sec("3. THE READINGS");
{
    // a hand grid: scenarios with the score of each non-empty subset set as base + delta (deltas in the order decoy, screen, interceptor, decoy+screen, decoy+interceptor, screen+interceptor, full)
    const mk = (seed, base, deltas, o = {}) => scen(seed, [["defended", base, 0, null], ...deltas.map((d, k) => [o.outcomes ? o.outcomes[k] : "defended", base + d, o.lost ? o.lost[k] : 0, o.divs ? o.divs[k] : null])]);
    const g = [mk(1, 1, [0.5, -0.5, 0.01, 0.5, 0.01, 0.01, 0.5]), mk(2, 1, [0.5, 0, 0.01, 0.5, 0.01, 0.01, 0.5]), mk(3, 1, [0.5, 0.5, 0.01, 0.5, 0.01, 0.01, 0.5]), mk(4, 1, [0.5, 0, 0.01, 0.5, 0.01, 0.01, 0.5])];
    const q1 = X.pooled(g);
    ok("!! Q1 pooled by hand: decoy +0.5 on all four scenarios (se 0): BEATS, better 4; the screen -0.5, 0, +0.5, 0 -> mean 0 and se sqrt(0.5/3)/2 = 0.2041 (sample sd), better 1, worse 1, same 2: TIES", q1.length === 7 && q1[0].name === "decoy" && Math.abs(q1[0].mean - 0.5) < 1e-12 && q1[0].se === 0 && q1[0].reading === "BEATS" && q1[0].better === 4 && q1[0].worse === 0 && q1[0].same === 0 && q1[0].n === 4 && q1[1].name === "screen" && Math.abs(q1[1].mean) < 1e-12 && Math.abs(q1[1].se - Math.sqrt(0.5 / 3) / 2) < 1e-12 && q1[1].better === 1 && q1[1].worse === 1 && q1[1].same === 2 && q1[1].reading === "TIES");
    ok("!! Q1: +0.01 on every scenario (the interceptor, decoy+interceptor, screen+interceptor) is a TIES because it is under the floor of 0.02; decoy+screen and the full kit BEAT; a mirror grid (-0.5 on two scenarios) reads IS BELOW", q1[2].name === "interceptor" && Math.abs(q1[2].mean - 0.01) < 1e-12 && q1[2].reading === "TIES" && q1[3].name === "decoy+screen" && q1[3].reading === "BEATS" && q1[4].name === "decoy+interceptor" && q1[4].reading === "TIES" && q1[5].name === "screen+interceptor" && q1[5].reading === "TIES" && q1[6].name === "decoy+screen+interceptor" && q1[6].reading === "BEATS" && X.pooled([mk(1, 1, [-0.5, 0, 0, 0, 0, 0, 0]), mk(2, 1, [-0.5, 0, 0, 0, 0, 0, 0])])[0].reading === "IS BELOW");
    const ties = X.pooled([mk(1, 1, [0.5, 0, 0, 0, 0, 0, 0]), mk(2, 1, [0.5, 0, 0, 0, 0, 0, 0]), mk(3, 1, [-0.5, 0, 0, 0, 0, 0, 0])]);
    ok("!! Q1 needs more than 2 se: +0.5, +0.5, -0.5 (mean 0.1667, se 0.3333) is TIES; a subset equal to the empty kit everywhere is 3 'same' and TIES", ties[0].reading === "TIES" && Math.abs(ties[0].mean - 1 / 6) < 1e-12 && Math.abs(ties[0].se - 1 / 3) < 1e-12 && ties[1].same === 3 && ties[1].reading === "TIES" && ties[1].better === 0 && ties[1].worse === 0);
    ok("!! Q1's better / worse / same use the tolerance 1e-9 (scores from 0 so that the difference is exact): +1e-9 and -1e-9 are the same, +-1.1e-9 are better and worse", (() => { const a = X.pooled([mk(1, 0, [1e-9, -1e-9, 1.1e-9, -1.1e-9, 0, 0, 0])]); return a[0].same === 1 && a[1].same === 1 && a[2].better === 1 && a[3].worse === 1; })());
    const c = X.carriers(g);
    ok("!! Q2 by hand: decoy is the full kit's in 4 scenarios and the empty kit's in 0; the screen alone equals the full kit in scenario 3 only (+0.5) and the empty kit in scenarios 2 and 4; the interceptor and the other +0.01 subsets are neither; decoy+screen equals the full kit in 4; the full kit's own row 4 and 0", c.per.length === 7 && J(c.per.map((x) => [x.name, x.matchesFull, x.matchesEmpty])) === J([["decoy", 4, 0], ["screen", 1, 2], ["interceptor", 0, 0], ["decoy+screen", 4, 0], ["decoy+interceptor", 0, 0], ["screen+interceptor", 0, 0], ["decoy+screen+interceptor", 4, 0]]));
    ok("!! Q2: the subset that matches the full kit most often, the full kit EXCLUDED: decoy and decoy+screen tied at 4, listed in order (the full kit, with 4 as well, is not a candidate, and a top of 4 is reported)", J(c.named) === J(["decoy", "decoy+screen"]) && c.top === 4 && X.carriers([mk(1, 1, [0, 0, 0, 0, 0, 0, 0.5])]).named.length === 6 && X.carriers([mk(1, 1, [0, 0, 0, 0, 0, 0, 0.5])]).top === 0);
    const o = [mk(1, 1, [0.5, 0, 0.5, 0, 0, 0, 0.5], { outcomes: ["breached", "defended", "defended", "defended", "defended", "defended", "defended"] }), mk(2, 1, [0.5, 0, 0.5, 0, 0, 0, 0.5], { lost: [1, 0, 0, 0, 0, 0, 0] })], oc = X.carriers(o);
    ok("!! a subset with the same score as the full kit but another outcome (scenario 1) or other defenders lost (scenario 2) is NOT the full kit's (decoy: 0 of 2), while the interceptor with the same outcome, losses and score is (2 of 2); the screen is the empty kit's in both", oc.per[0].matchesFull === 0 && oc.per[0].matchesEmpty === 0 && oc.per[2].matchesFull === 2 && oc.per[1].matchesEmpty === 2 && oc.per[1].matchesFull === 0 && !oc.named.includes("decoy") && J(oc.named) === J(["interceptor"]) && oc.top === 2);
    ok("!! Q2 at the tolerance (scores from 0): a score that differs from the empty kit's by exactly 1e-9 is the same fight, by 1.1e-9 it is not; the same against the full kit's", X.carriers([mk(1, 0, [0, 0, 1e-9, 0, 0, 0, 0])]).per[2].matchesEmpty === 1 && X.carriers([mk(1, 0, [0, 0, 1.1e-9, 0, 0, 0, 0])]).per[2].matchesEmpty === 0 && X.carriers([mk(1, 0, [0, 0, 0, 0, 0, 0, 1e-9])]).per[0].matchesFull === 1 && X.carriers([mk(1, 0, [0, 0, 0, 0, 0, 0, 1.1e-9])]).per[0].matchesFull === 0);
    const p = X.patterns([mk(1, 1, [-0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1]), mk(2, 1, [-0.1, 0, 0.1, 0, 0, 0, 0]), mk(3, 1, [0, 0, 0, 0, 0, 0, 0]), mk(4, 1, [-0.1, -0.1, -0.1, -0.1, -0.1, -0.1, 0])]);
    ok("!! Q3: all seven below in scenario 1 only (scenario 4 has one that is equal), at least one below in 1, 2 and 4, at least one above in 2", J(p.allBelow) === J([1]) && J(p.anyBelow) === J([1, 2, 4]) && J(p.anyAbove) === J([2]));
    const tp = X.patterns([mk(1, 0, [-1e-9, -1e-9, -1e-9, -1e-9, -1e-9, -1e-9, -1e-9]), mk(2, 0, [1e-9, 0, 0, 0, 0, 0, 0]), mk(3, 0, [-1.1e-9, -1.1e-9, -1.1e-9, -1.1e-9, -1.1e-9, -1.1e-9, -1.1e-9]), mk(4, 0, [1.1e-9, 0, 0, 0, 0, 0, 0])]);
    ok("!! Q3 at the tolerance (scores from 0): -1e-9 and +1e-9 are neither below nor above; -1.1e-9 on all seven is 'all below', +1.1e-9 is above", J(tp.allBelow) === J([3]) && J(tp.anyBelow) === J([3]) && J(tp.anyAbove) === J([4]));
    const K = (k, b) => X.kindOf({ tick: 5, kit: k === null ? null : { type: k }, base: b === null ? null : { type: b } });
    ok("!! kindOf: null is none; a torpedo intercepted or decoyed in the subset's fight; a loss on either side; a hit against a hit; a fire event on either side; anything else", X.kindOf(null) === "none" && K("intercepted", "hit") === "intercepted" && K("decoyed", "hit") === "decoyed" && K("loss", "hit") === "a loss" && K("hit", "loss") === "a loss" && K("hit", "hit") === "a different hit" && K("ogre-fire", "hit") === "a different fire" && K("hit", "ogre-fire") === "a different fire" && K("fire", null) === "a different fire" && K("ping", "probe") === "something else" && K(null, "ping") === "something else" && K("hit", null) === "something else" && K(null, null) === "something else");
    ok("!! kindOf precedence: intercepted and decoyed come before a loss (the subset's event first); a loss before a different hit and a fire (hit/loss is a loss; loss/fire is a loss; fire against hit is a fire, not a hit)", K("intercepted", "loss") === "intercepted" && K("decoyed", "loss") === "decoyed" && K("loss", "ogre-fire") === "a loss" && K("ogre-fire", "loss") === "a loss" && K("hit", "hit") === "a different hit" && K("ogre-fire", "hit") === "a different fire");
    const dv = (kit, base) => ({ tick: 7, kit: kit ? { type: kit } : null, base: base ? { type: base } : null });
    const g4 = [mk(1, 1, [0, 0, 0, 0, 0, 0, 0], { divs: [dv("intercepted", "hit"), null, dv("decoyed", "hit"), null, dv("hit", "hit"), dv("loss", "hit"), dv("intercepted", "hit")] }), mk(2, 1, [0, 0, 0, 0, 0, 0, 0])];
    const q4 = X.divergences(g4);
    ok("!! Q4 counts the kinds over the 14 (scenario, subset) fights: intercepted 2, decoyed 1, a different hit 1, a loss 1, none 9; divergent 5; per subset the fights that never diverge (decoy 1, screen 2, interceptor 1, decoy+screen 2, decoy+interceptor 1, screen+interceptor 1, full 1)", q4.pairs === 14 && q4.divergent === 5 && J(q4.total) === J({ intercepted: 2, decoyed: 1, "a different hit": 1, "a loss": 1, "a different fire": 0, "something else": 0, none: 9 }) && J(q4.perSubset.map((x) => x.none)) === J([1, 2, 1, 2, 1, 1, 1]) && q4.perSubset[0].name === "decoy");
}

sec("4. THE REPORT");
{
    const mk = (seed, base, deltas, divs) => scen(seed, [["defended", base, 0, null], ...deltas.map((d, k) => [d < 0 ? "breached" : "defended", base + d, d < 0 ? 1 : 0, divs ? divs[k] : null])]);
    const small = [mk(101, 1, [0.5, 0, 0, 0.5, 0, 0, 0.5]), mk(102, 1, [-0.4, -0.4, 0, -0.4, 0, 0, -0.4]), mk(103, 1, [0, 0, 0, 0, 0, 0, 0])];
    const L = X.report(small, [101, 102, 103]);
    ok("!! a three-scenario grid that is not the registered set: the label first, the header (POST HOC), five PASS lines (scenario 105 is not here), the table of scores, then Q1 to Q4 and the bottom line", L[0] === "NOT THE REGISTERED SET: seeds 101 to 103; the registered set is 101 to 112. A smoke, not the read." && L[1] === "THE KIT GRID (brain/KIT_GRID_WIP.md; POST HOC: the pair of every scenario was read before): the eight subsets of the kit on 3 Sea OGRE scenarios (3 defenders)" && L.slice(2, 7).every((l) => l.startsWith("  PASS ")) && L[6] === "  PASS SCORES: every score is a number" && L[5] === "  PASS DETERMINISM: scenario 105 is not among these scenarios (nothing to compare)", L.slice(0, 8).join(" || "));
    ok("!! ... the scores table: one row a scenario, outcome initial, score to three decimals and defenders lost for each subset in order", L[7] === "the scores, one row a scenario (outcome, score, defenders lost for each subset in the order none, decoy, screen, interceptor, decoy+screen, decoy+interceptor, screen+interceptor, decoy+screen+interceptor):" && L[8] === "  101: d1.000/0 d1.500/0 d1.000/0 d1.000/0 d1.500/0 d1.000/0 d1.000/0 d1.500/0" && L[9] === "  102: d1.000/0 b0.600/1 b0.600/1 d1.000/0 b0.600/1 d1.000/0 d1.000/0 b0.600/1" && L[10] === "  103: d1.000/0 d1.000/0 d1.000/0 d1.000/0 d1.000/0 d1.000/0 d1.000/0 d1.000/0", L.slice(7, 11).join(" || "));
    const q1 = L.slice(L.indexOf("Q1 pooled, each non-empty subset against the empty kit (score difference over the scenarios):") + 1, L.indexOf("Q1 pooled, each non-empty subset against the empty kit (score difference over the scenarios):") + 8);
    ok("!! ... Q1: one line a subset, the name padded to 26, the mean with its sign and se, better / worse / same, the reading (decoy +0.0333, se 0.2848: by hand mean (0.5 - 0.4 + 0)/3 = 0.0333, sample sd 0.4509, se 0.2603)", q1.length === 7 && q1[0] === "  decoy                      +0.0333 (se 0.2603); better 1, worse 1, same 1: TIES" && q1[1].startsWith("  screen                     -0.1333") && q1[6].startsWith("  decoy+screen+interceptor   +0.0333") && /: TIES$/.test(q1[2]), q1.join(" || "));
        const i2 = L.findIndex((l) => l.startsWith("Q2 ")), i3 = L.findIndex((l) => l.startsWith("Q3 ")), i4 = L.findIndex((l) => l.startsWith("Q4 "));
    ok("!! ... Q2's header and its seven lines and the named line; Q3's line; Q4's two lines; the bottom line", L[i2] === "Q2 in how many scenarios each subset's fight (outcome, defenders lost, score) is the full kit's, and the empty kit's:" && L[i2 + 1] === "  decoy                      the full kit's in 3 of 3; the empty kit's in 1 of 3" && L[i3] === "Q3 all seven non-empty subsets below the empty kit in 0 scenario(s): none; at least one below in 1: 102; at least one above in 1: 101" && L[i4] === "Q4 the first divergence from the empty kit, over 21 (scenario, subset) fights: intercepted 0, decoyed 0, a different hit 0, a loss 0, a different fire 0, something else 0, none 21; divergent 0" && L[i4 + 1] === "  fights that never diverge, per subset: decoy 3, screen 3, interceptor 3, decoy+screen 3, decoy+interceptor 3, screen+interceptor 3, decoy+screen+interceptor 3" && L[L.length - 1] === "BOTTOM LINE: NO SUBSET BEATS THE EMPTY KIT; NO SUBSET IS BELOW IT (the series' reading over 3 scenarios; the pattern of 105 is in 0 scenario(s))", [L[i2 + 1], L[i3], L[L.length - 1]].join(" || "));
    const big = X.report(grid12({ 101: () => flat(101, 1) }), SEEDS12);
    ok("!! the registered set (twelve scenarios, 105 as known): no label, the five checks pass, 105's row in the table, Q3 names 105 (all seven below) and the bottom line counts it", big[0].startsWith("THE KIT GRID") && big.slice(1, 6).every((l) => l.startsWith("  PASS ")) && big.includes("  105: d1.702/3 b-0.167/0 b-0.467/2 b-0.467/2 b-0.317/1 b-0.317/1 b-0.317/1 b-0.317/1") && big.some((l) => l.startsWith("Q3 all seven non-empty subsets below the empty kit in 1 scenario(s): 105; at least one below in 1: 105; at least one above in 0: none")) && big[big.length - 1].endsWith("the pattern of 105 is in 1 scenario(s))"), big.find((l) => /^  105: /.test(l)));
    const bad = X.report(grid12().slice(1), SEEDS12);
    ok("!! a failed check: the first line names the check, the table and the questions are not printed, and the bottom line says NOT WEIGHED", bad[0] === "CHECK FAILED -- SCENARIOS: THE CHECKS FAILED, THE READINGS ARE NOT WEIGHED" && bad[bad.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !bad.some((l) => /^Q[1-4]|^the scores/.test(l)) && bad.some((l) => l.startsWith("  FAIL SCENARIOS")) && X.report(grid12().slice(1), SEEDS12).length === 8);
    const beats = X.report([mk(101, 1, [0.5, 0, 0, 0, 0, 0, 0.5]), mk(102, 1, [0.5, 0, 0, 0, 0, 0, 0.5])], [101, 102]);
    ok("!! a subset that BEATS is listed in the bottom line (decoy and the full kit: +0.5 on two scenarios with no spread), and one that IS BELOW is listed after", /^BOTTOM LINE: SUBSETS THAT BEAT THE EMPTY KIT: decoy, decoy\+screen\+interceptor; NO SUBSET IS BELOW IT/.test(beats[beats.length - 1]) && /^BOTTOM LINE: NO SUBSET BEATS THE EMPTY KIT; SUBSETS THAT ARE BELOW IT: screen \(/.test(X.report([mk(101, 1, [0, -0.5, 0, 0, 0, 0, 0]), mk(102, 1, [0, -0.5, 0, 0, 0, 0, 0])], [101, 102]).slice(-1)[0]), beats[beats.length - 1]);
}

sec("5. THE COMMAND");
{
    const mem = (grid) => { const o = { out: [], err: [], written: {} }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), writeFile: (f, t) => { o.written[f] = t; }, grid } }); };
    const fake = (seed) => (seed === 105 ? s105() : flat(seed));
    let m = mem(fake), c = await X.command(["go"], m.io);
    ok("!! a bad first word is exit 2 on the error stream with the name of the tool", c === 2 && m.err[0] === 'takeKitGrid: the first word must be run, got "go"' && m.out.length === 0);
    m = mem(fake); c = await X.command([], m.io);
    ok("!! no words: 'got undefined'", c === 2 && m.err[0] === "takeKitGrid: the first word must be run, got undefined");
    const refuse = async (argv) => { const mm = mem(fake); const cc = await X.command(argv, mm.io); return [cc, mm.err[0]]; };
    const r1 = await refuse(["run", "x"]), r2 = await refuse(["run", "--nope", "1"]), r3 = await refuse(["run", "--first"]), r4 = await refuse(["run", "--first", "--count"]), r5 = await refuse(["run", "--first", "0"]), r6 = await refuse(["run", "--count", "1.5"]), r7 = await refuse(["run", "--count", "x"]);
    ok("!! the refusals, word for word: a stray word, an unknown option with the known ones, a missing value (end of line or another option), a first or count that is not a whole number of 1 or more", r1[0] === 2 && r1[1] === 'takeKitGrid: unexpected argument "x"' && r2[0] === 2 && r2[1] === 'takeKitGrid: unknown option "--nope" (known for run: --first, --count, --out)' && r3[1] === "takeKitGrid: --first needs a value" && r4[1] === "takeKitGrid: --first needs a value" && r5[0] === 2 && r5[1] === 'takeKitGrid: --first needs a whole number of 1 or more, got "0"' && r6[1] === 'takeKitGrid: --count needs a whole number of 1 or more, got "1.5"' && r7[1] === 'takeKitGrid: --count needs a whole number of 1 or more, got "x"');
    m = mem(fake); c = await X.command(["run"], m.io);
    ok("!! `run` with no options flies the registered twelve through the seam, prints the report, exit 0, nothing on the error stream and nothing written", c === 0 && m.err.length === 0 && m.out[0].startsWith("THE KIT GRID") && Object.keys(m.written).length === 0 && m.out.some((l) => /^  112: /.test(l)) && m.out.filter((l) => /^  1\d\d: /.test(l)).length === 12);
    const asked = []; m = mem((s) => { asked.push(s); return flat(s); }); await X.command(["run", "--first", "7", "--count", "3"], m.io);
    ok("!! --first and --count choose the scenarios asked of the seam (7, 8, 9), in order, once each; the label says it is not the registered set", J(asked) === J([7, 8, 9]) && m.out[0] === "NOT THE REGISTERED SET: seeds 7 to 9; the registered set is 101 to 112. A smoke, not the read.");
    m = mem(fake); c = await X.command(["run", "--out", "kg.json"], m.io);
    const rec = JSON.parse(m.written["kg.json"]);
    ok("!! --out writes the rows as one JSON line (seed, and per subset name, outcome, score, lost, repeats, decoyed, intercepted, divergence), a newline at the end", c === 0 && m.written["kg.json"].endsWith("\n") && rec.length === 12 && rec[0].seed === 101 && rec[4].seed === 105 && rec[4].rows.length === 8 && J(Object.keys(rec[4].rows[0])) === J(["name", "outcome", "score", "lost", "repeats", "decoyed", "intercepted", "divergence"]) && rec[4].rows[0].score === 1.702 && rec[4].rows[0].repeats === "B" && rec[4].rows[7].repeats === "K");
    m = mem(() => { throw new Error("engine down"); }); c = await X.command(["run"], m.io);
    ok("!! a grid that throws is exit 1 with the tool's name and the reason, nothing printed, nothing written", c === 1 && m.err[0] === "takeKitGrid: engine down" && m.out.length === 0);
    m = mem(fake); m.io.writeFile = () => { throw new Error("disk full"); }; c = await X.command(["run", "--out", "x.json"], m.io);
    ok("!! a write that fails is exit 1 with the reason and nothing is printed", c === 1 && m.err[0] === "takeKitGrid: disk full" && m.out.length === 0);
    const cmdOut = [], cmdErr = [], ol = console.log, oe = console.error; console.log = (x) => cmdOut.push(x); console.error = (x) => cmdErr.push(x);
    let cd; try { cd = await X.command(["go"]); } finally { console.log = ol; console.error = oe; }
    ok("!! with no io the command writes to the console streams (a refusal goes to console.error)", cd === 2 && cmdErr.length === 1 && cmdOut.length === 0);
}

sec("6. THE REAL ENGINE");
{
    const real = subsetsOf(105);
    ok("!! Scenario 105 flown for real under the eight subsets: eight rows in order, the empty kit repeating run B and the full kit run K, and the outcomes and scores of brain/COUNTERFACTUAL_WIP.md section 7 (the DETERMINISM check holds on the real fights)", real.rows.length === 8 && J(real.rows.map((r) => r.name)) === J(ORDER) && real.rows[0].repeats === "B" && real.rows[7].repeats === "K" && X.checksOf([real], [105]).every((x) => x.ok) && real.rows.every((r, i) => r.run.outcome === KNOWN[ORDER[i]][0] && r.run.score.toFixed(3) === KNOWN[ORDER[i]][1].toFixed(3) && r.run.lost === KNOWN[ORDER[i]][2]), X.checksOf([real], [105]).filter((x) => !x.ok).map((x) => x.text).join(" | "));
    const R = X.report([real], [105]);
    ok("!! the real 105 through the report: the pattern of 105 (all seven non-empty subsets below the empty kit) is found by Q3, the pooled readings read each subset's -1.9 to -2.1 difference as IS BELOW or TIES by the series' rule with se 0 (one scenario)", R.some((l) => l.startsWith("Q3 all seven non-empty subsets below the empty kit in 1 scenario(s): 105")) && R.some((l) => /^  decoy                      -1\.8690 \(se 0\.0000\); better 0, worse 1, same 0: IS BELOW$/.test(l)), R.find((l) => /^  decoy /.test(l)));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kg-")); try {
        const child = spawnSync(process.execPath, [path.join(HERE, "takeKitGridCmd.mjs"), "run", "--first", "1", "--count", "2", "--out", path.join(tmp, "k.json")], { cwd: tmp, encoding: "utf8" });
        const rec = fs.existsSync(path.join(tmp, "k.json")) ? JSON.parse(fs.readFileSync(path.join(tmp, "k.json"), "utf8")) : null;
        ok("!! the command line as a child process (DEV scenarios 1 and 2, another folder): exit 0, the report on stdout with the not-registered label, nothing on stderr, the JSON written where asked", child.status === 0 && child.stderr === "" && child.stdout.startsWith("NOT THE REGISTERED SET: seeds 1 to 2;") && /BOTTOM LINE: NO SUBSET BEATS THE EMPTY KIT; NO SUBSET IS BELOW IT/.test(child.stdout) && !!rec && rec.length === 2 && rec[0].rows[0].repeats === "B", (child.stderr || "").slice(0, 200));
        const bye = spawnSync(process.execPath, [path.join(HERE, "takeKitGridCmd.mjs"), "go"], { cwd: tmp, encoding: "utf8" });
        ok("!! the command line with a bad word: exit code 2, the refusal on stderr, nothing on stdout", bye.status === 2 && bye.stdout === "" && /the first word must be run/.test(bye.stderr));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
