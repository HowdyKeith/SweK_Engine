// WebGLEngine/tools/ship/trainDecisionCircuit-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainDecisionCircuit-selfcheck.mjs      (about 15 s)
//
// THE GATE OF tools/ship/trainDecisionCircuit.mjs: the training of the three decision-circuit families (cx, nostate, plain), registered in brain/DECISION_CIRCUIT_VS_TWIN_WIP.md (decision D6) before it was written. Nothing here trains a circuit for real: a STUB policy (a six-weight vector with its own evaluate) holds the logic, one real search at a throwaway recipe holds the wiring.
//   1  SPECS       "all" is the twelve searches (3 families x 4); family:K and family:K-L; every refusal by name (an empty spec, an unknown family, a range backwards or past the recipe, a name twice, a spec that does not read).
//   2  SEEDS       seed = 96500 + 10 x (cx 0, nostate 1, plain 2) + k, twelve different seeds, none in the training-set range of the survey task.
//   3  ONE SEARCH  on the stub: the record keeps spec, family, index, seed, recipe, weight count, the START's three numbers (from the hand weights, taken first), the train score, the pruned weights ROUNDED TO SIX DECIMALS, and the held-out and pool numbers of THOSE rounded weights (the champion that is flown is the
//                  champion that was chosen); only the train, held-out and pool sets are ever evaluated (the AUDIT is poisoned and never touched); the noisy gauge is the default and a gauge can be passed; deterministic.
//   4  THE CHAMPION eligible = crushed in no more pool runs than the start (equal passes, one more fails); best held-out; ties to the lower k; none eligible -> none; another family's records are not read.
//   5  THE CHECKS  twelve searches once each, one recipe, the same start within a family and across the three (train, held-out AND pool crushed), the weights that fit their count: every failure by name.
//   6  THE LEDGER  reportLines: the checks line or CHECK FAILED, per family the start, the eligible count and the champion (or NO ELIGIBLE CHAMPION: the family IS rule-low06), a NOT ELIGIBLE tag per search.
//   7  THE COMMAND parseArgs refusals; `run` resumes (a spec in the file is not run again), refuses a file of another recipe or of smoke records, appends one line a finished search, uses worker processes when asked, reports a failed search with the resume hint and exit 1; `report` refuses an empty
//                  file and smoke records without --allow-smoke; `--one` prints one RESULT line; the default file handling works on a real file; runChild passes the recipe on and refuses a child with no RESULT or one that is not JSON.
//   8  THE START   one REAL search per family (cx, nostate, plain) at a throwaway recipe on the smoke sets: the record's START equals rule-low06's (tunedSeat at the survey seat's constants) on the same sets, and the weight counts are 2,452 / 2,452 / 2,443.
// NOT CHECKED, said plainly: that a full-recipe search finds anything (that is the experiment); that four processes at once give the same records as one (the seeds are per job and nothing is shared, but no row races them).
//
// SABOTAGE LOG (2026-11-07), 228 mutants of tools/ship/trainDecisionCircuit.mjs -- 210 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 18 by hand (the seed stride and base, the champion's tie to the higher k and its order reversed, the held-out and pool readings taken on the UNROUNDED weights or on the AUDIT set, the start
// taken on the wrong set, a clean gauge by default, the record keeping the unrounded weights, the families in another order, the child not quiet, one worker going to the spawner, no newline between records, the resume ignoring the file, smoke records allowed into a real run, report reading smoke without the flag, the cross-family start check dropped, eligibility on the held-out score), each applied to an isolated tree and this
// gate run; the file restored (sha256 identical before and after).
//   FIRST PASS: 148 red, 37 threw, 3 timed out, 40 went 0 red. Three of the timeouts and the way they were closed: a mutant that sends a one-worker run (or every run, or a run past the injected spawner) to a real child process started a FULL-recipe search (13 minutes) inside the gate and the gate was killed at 300 s; the rows now give every in-process io a spawner that THROWS ('THE SPAWNER WAS USED'), and the row that
//   injects a spawner runs with a throwaway recipe (--smoke --iters 1), so a bypass costs seconds and fails by name. The 40 survivors were mostly the WORDS of refusals and the layout of lines (a wrong number inside an error message, a toFixed(4) changed, a pad width): rows were written that pin the messages exactly (every refusal of parseSpecs and parseArgs, the checks' range), the progress line of a search to four decimals,
//   the ledger's layout and its k order whatever the order of the records, ties to the lower k in all six orders of three records, and a results file that is not JSON stopping a run with its line number.
//   SECOND PASS: the 43 that had survived or timed out re-run against the new gate: 37 red, 6 remain and ALL SIX ARE EQUIVALENT, each argued: the START check's reference record (starts[0] for starts[1], three mutants: if every family equals ANY one of them they are all equal, and if one differs it differs from some other), the sort of the family's records by k in championOf and the tie-break by k (each is redundant with the
//   other: the eligible list inherits the k order from the first sort and the stable second sort keeps it on a tie, so breaking either alone changes nothing; breaking both would, and the six-order tie row catches that: a combined mutant of both goes red on it), and the slice that drops the 'RESULT ' prefix by 7 characters (JSON.parse tolerates the space a slice of 6 leaves).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as SV from "../../brain/surveySeat.mjs";
import * as D from "./trainDecisionCircuit.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
console.log("trainDecisionCircuit-selfcheck -- the training of the decision circuits\n");

sec("1. SPECS");
{
    const all = D.parseSpecs("all");
    ok("!! 'all' is the twelve searches, three families of four, in the order cx, nostate, plain and k = 0..3", all.length === 12 && J(all.map((s) => D.specName(s))) === J(["cx:0", "cx:1", "cx:2", "cx:3", "nostate:0", "nostate:1", "nostate:2", "nostate:3", "plain:0", "plain:1", "plain:2", "plain:3"]));
    ok("!! 'all' follows the recipe's number of searches (2 runs: six searches)", D.parseSpecs("all", 2).length === 6 && D.parseSpecs("all", 2).every((s) => s.index < 2));
    ok("!! a list and a range: cx:1, plain:0-2 -> cx:1, plain:0, plain:1, plain:2, whitespace allowed", J(D.parseSpecs(" cx:1 , plain:0-2 ").map((s) => D.specName(s))) === J(["cx:1", "plain:0", "plain:1", "plain:2"]));
    ok("!! the specs are { family, index } records and the FAMILIES are cx, nostate, plain; the recipe is the needs series' (4 x 300, sigma 0.3, up to 4 weights, prune budget 60)", D.parseSpecs("nostate:3")[0].family === "nostate" && D.parseSpecs("nostate:3")[0].index === 3 && J(D.FAMILIES) === J(["cx", "nostate", "plain"]) && D.RECIPE.runs === 4 && D.RECIPE.iters === 300 && D.RECIPE.sigma === 0.3 && D.RECIPE.maxK === 4 && D.RECIPE.pruneBudget === 60);
    ok("!! every refusal is by name: an empty spec, an unknown family, a range backwards, an index past the recipe, a spec named twice (also inside a range), a spec that does not read", throwsWith(() => D.parseSpecs("cx:0,,plain:1"), /empty spec/) && throwsWith(() => D.parseSpecs(""), /empty spec/) && throwsWith(() => D.parseSpecs("withheld:0"), /unknown family/) && throwsWith(() => D.parseSpecs("cx:3-1"), /backwards/) && throwsWith(() => D.parseSpecs("cx:4"), /past the recipe/) && throwsWith(() => D.parseSpecs("cx:0-4"), /past the recipe/) && throwsWith(() => D.parseSpecs("cx:0,cx:0"), /named twice/) && throwsWith(() => D.parseSpecs("cx:0-2,cx:2"), /named twice/) && throwsWith(() => D.parseSpecs("cx"), /cannot read/) && throwsWith(() => D.parseSpecs("cx:a"), /cannot read/));
    ok("!! the last index of a range at the edge is allowed (cx:3, cx:0-3) and one past is refused (the recipe's runs - 1 is the last)", D.parseSpecs("cx:3").length === 1 && D.parseSpecs("cx:0-3").length === 4 && D.parseSpecs("cx:1", 2).length === 1 && throwsWith(() => D.parseSpecs("cx:2", 2), /past the recipe/));
}

sec("2. SEEDS");
{
    const seeds = D.parseSpecs("all").map((s) => D.seedOf(s));
    ok("!! seed = 96500 + 10 x the family's place + k: cx:0 96500, cx:3 96503, nostate:0 96510, nostate:2 96512, plain:0 96520, plain:3 96523; twelve different seeds", D.SEARCH_BASE === 96500 && D.seedOf({ family: "cx", index: 0 }) === 96500 && D.seedOf({ family: "cx", index: 3 }) === 96503 && D.seedOf({ family: "nostate", index: 0 }) === 96510 && D.seedOf({ family: "nostate", index: 2 }) === 96512 && D.seedOf({ family: "plain", index: 0 }) === 96520 && D.seedOf({ family: "plain", index: 3 }) === 96523 && new Set(seeds).size === 12);
    ok("!! the spec name is family:index", D.specName({ family: "plain", index: 3 }) === "plain:3");
}

// ---- a stub policy: six weights, a score that is a function of them, a crushed count that is a function of w[1]; the sets are tagged and the audit is poisoned
const TARGET = [0.5, -0.2, 0.3, 0.1, -0.4, 0.2];
function stub() {
    const log = [];
    const pol = {
        WEIGHT_COUNT: 6, handWeights: () => new Float32Array(6),
        mutate(w, sigma, rng, maxK) { const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK); for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += (rng() - 0.5) * 2 * sigma; return o; },
        pilotFor: (w) => ({ w: Float32Array.from(w) }),
        evaluate(pilot, set, { gauge }) {
            log.push({ tag: set.tag, w: Array.from(pilot.w), gauge });
            if (set.tag === "audit" || set.tag === "audit2" || set.tag === "reserve") throw new Error("THE AUDIT WAS READ: " + set.tag);
            const w = pilot.w; let score = 1; for (let i = 0; i < 6; i++) score -= 0.1 * (w[i] - TARGET[i]) ** 2;
            if (set.tag === "heldOut") score -= 0.01; if (set.tag === "pool") score -= 0.02;
            return { score, crashed: w[1] > 0.3 ? 2 : (w[1] > 0.1 ? 1 : 0) };
        },
    };
    return { pol, log };
}
const SETS = { train: { tag: "train" }, heldOut: { tag: "heldOut" }, pool: { tag: "pool" }, audit: { tag: "audit" }, audit2: { tag: "audit2" }, reserve: { tag: "reserve" } };
const SMALL = { iters: 40, pruneBudget: 6 };

sec("3. ONE SEARCH (the stub policy)");
{
    const { pol, log } = stub(), rec = D.runSearch({ family: "plain", index: 2 }, { policy: pol, sets: SETS, recipe: SMALL });
    const ref = stub().pol, sc = (tag, w) => ref.evaluate({ w: Float32Array.from(w) }, { tag }, { gauge: null });   // a separate stub, so these reference readings are not in the search's log
    const heldCalls = log.filter((l) => l.tag === "heldOut"), poolCalls = log.filter((l) => l.tag === "pool");
    ok("!! the record keeps spec, family, index, seed (96522), smoke false, the recipe actually used (the registered one with the overrides), the weight count, and the counts of the search", rec.spec === "plain:2" && rec.family === "plain" && rec.index === 2 && rec.seed === 96522 && rec.smoke === false && J(rec.recipe) === J({ ...D.RECIPE, ...SMALL }) && rec.weightCount === 6 && Number.isInteger(rec.improved) && Number.isInteger(rec.neutral) && Number.isInteger(rec.moved) && Number.isInteger(rec.kept) && Number.isInteger(rec.pruneEvals) && rec.kept <= rec.moved);
    ok("!! the START is taken from the HAND weights first, in the order train, held-out, pool (all zeros here), before the search touches anything", J(log.slice(0, 3).map((l) => l.tag)) === J(["train", "heldOut", "pool"]) && log.slice(0, 3).every((l) => l.w.every((v) => v === 0)) && rec.start.train === sc("train", new Array(6).fill(0)).score && rec.start.heldOut === sc("heldOut", new Array(6).fill(0)).score && rec.start.poolCrashed === 0);
    ok("!! the weights are the pruned weights ROUNDED TO SIX DECIMALS, as many as the count, and nothing else", rec.weights.length === 6 && rec.weights.every((v) => Math.abs(v - Math.round(v * 1e6) / 1e6) < 1e-7 && Math.abs(v) <= 4) && rec.weights.some((v) => v !== 0));
    ok("!! the HELD-OUT score and the POOL crushed count are those of the RECORDED (rounded) weights: the last held-out and pool evaluations were made on exactly the weights in the record", heldCalls.length === 2 && poolCalls.length === 2 && J(heldCalls[1].w) === J(rec.weights) && J(poolCalls[1].w) === J(rec.weights) && rec.heldOut === sc("heldOut", rec.weights).score && rec.poolCrashed === sc("pool", rec.weights).crashed);
    ok("!! the train score is the fitness of the weights kept (>= the start's, since the search only keeps what does not lose and the prune only what does not lose)", rec.trainScore >= rec.start.train - 1e-12 && Math.abs(rec.trainScore - sc("train", pol.pilotFor(new Float32Array(rec.weights)).w).score) < 1e-4);
    ok("!! ONLY the train, held-out and pool sets are evaluated: the audit sets are never touched (they throw if they are)", log.every((l) => ["train", "heldOut", "pool"].includes(l.tag)) && log.length > 10);
    ok("!! the noisy gauge is the default for every evaluation of a search", log.every((l) => l.gauge === T.GAUGE));
    const g = stub(); D.runSearch({ family: "cx", index: 0 }, { policy: g.pol, sets: SETS, recipe: SMALL, gauge: null });
    ok("!! a gauge can be passed (null: a clean gauge) and is used for every evaluation", g.log.length > 10 && g.log.every((l) => l.gauge === null));
    const a = D.runSearch({ family: "plain", index: 2 }, { policy: stub().pol, sets: SETS, recipe: SMALL }), b = D.runSearch({ family: "plain", index: 3 }, { policy: stub().pol, sets: SETS, recipe: SMALL });
    ok("!! the search is deterministic given the spec (two runs of plain:2 give the same record) and k changes it (plain:3 differs: seed and weights)", J(a) === J(rec) && b.seed === 96523 && J(a.weights) !== J(b.weights));
    ok("!! smoke is recorded in the record", D.runSearch({ family: "cx", index: 0 }, { policy: stub().pol, sets: SETS, recipe: { iters: 3, pruneBudget: 1 }, smoke: true }).smoke === true);
    const logs = []; D.runSearch({ family: "cx", index: 1 }, { policy: stub().pol, sets: SETS, recipe: { iters: 3, pruneBudget: 1 } }, (m) => logs.push(m));
    ok("!! the search logs one line naming the spec, the seed and the train / held-out / pool numbers against the start's", logs.length === 1 && /cx:1 \(seed 96501\)/.test(logs[0]) && /train .*start .*held-out .*pool crushed/.test(logs[0]));
    const nb = D.familyPolicy("plain");
    ok("!! familyPolicy gives the registered families (cx 2,452 weights, nostate 2,452, plain 2,443) and refuses an unknown name", D.familyPolicy("cx").WEIGHT_COUNT === 2452 && D.familyPolicy("nostate").WEIGHT_COUNT === 2452 && nb.WEIGHT_COUNT === 2443 && D.familyPolicy("cx") === D.familyPolicy("cx") && throwsWith(() => D.familyPolicy("withheld"), /unknown family/));
}

const rec = (family, index, over = {}) => ({ spec: `${family}:${index}`, family, index, smoke: false, recipe: { ...D.RECIPE }, weightCount: 3, trainScore: 0.9, heldOut: 0.88, poolCrashed: 0, start: { train: 0.87, heldOut: 0.884, poolCrashed: 0 }, moved: 5, kept: 2, weights: [0.1, 0.2, 0.3], ...over });
const full = () => D.FAMILIES.flatMap((f) => [0, 1, 2, 3].map((k) => rec(f, k)));

sec("4. THE CHAMPION");
{
    const rs = [rec("cx", 0, { heldOut: 0.80 }), rec("cx", 1, { heldOut: 0.90 }), rec("cx", 2, { heldOut: 0.85 }), rec("cx", 3, { heldOut: 0.95, poolCrashed: 1 }), rec("plain", 0, { heldOut: 0.99 })];
    const c = D.championOf(rs, "cx");
    ok("!! the champion is the best HELD-OUT of the ELIGIBLE: k 3 has the best held-out (0.95) but crushed one more pool run than the start (1 > 0) and is out; k 1 (0.90) wins; the eligible count is 3 of 4 searches", c.record.index === 1 && c.eligible === 3 && c.searches === 4 && c.none === false && c.family === "cx");
    ok("!! another family's records are not read (plain 0 at 0.99 is not cx's champion)", c.record.family === "cx" && D.championOf(rs, "plain").record.index === 0 && D.championOf(rs, "plain").searches === 1);
    const tie = D.championOf([rec("cx", 2, { heldOut: 0.9 }), rec("cx", 1, { heldOut: 0.9 }), rec("cx", 3, { heldOut: 0.9 })], "cx");
    ok("!! ties go to the LOWER k whatever the order of the records", tie.record.index === 1);
    const eq = D.championOf([rec("cx", 0, { poolCrashed: 2, start: { train: 0.87, heldOut: 0.884, poolCrashed: 2 } })], "cx");
    ok("!! crushing as many pool runs as the start is eligible (2 of 2); one more is not", eq.none === false && eq.record.index === 0 && D.championOf([rec("cx", 0, { poolCrashed: 3, start: { train: 0.87, heldOut: 0.884, poolCrashed: 2 } })], "cx").none === true);
    const none = D.championOf([rec("nostate", 0, { poolCrashed: 1 }), rec("nostate", 1, { poolCrashed: 4 })], "nostate");
    ok("!! no eligible search -> no champion, none true, the family IS the rule (record null, eligible 0)", none.none === true && none.record === null && none.eligible === 0 && none.searches === 2);
    const emp = D.championOf([], "plain");
    ok("!! a family with no records has no champion and no searches", emp.none === true && emp.searches === 0);
    const hi = D.championOf([rec("cx", 0, { heldOut: 0.7 }), rec("cx", 1, { heldOut: 0.72 })], "cx");
    ok("!! the HIGHER held-out wins (and not the first record): 0.72 beats 0.70", hi.record.index === 1);
}

sec("5. THE CHECKS");
{
    ok("!! twelve searches, three families of four, one recipe, one start: no failure", D.checksOf(full()).length === 0);
    const miss = full().filter((r) => !(r.family === "nostate" && r.index === 2)), dup = [...full(), rec("plain", 1)];
    ok("!! a missing search is named (nostate has 0,1,3) and a search twice is named (plain 0,1,1,2,3)", D.checksOf(miss).some((x) => /nostate has the searches 0,1,3/.test(x)) && D.checksOf(dup).some((x) => /plain has the searches 0,1,1,2,3/.test(x)) && D.checksOf([]).length >= 3 && D.checksOf([]).some((x) => /cx has the searches none/.test(x)));
    const mixed = full().map((r) => (r.family === "cx" && r.index === 1 ? { ...r, recipe: { ...r.recipe, iters: 299 } } : r));
    ok("!! a family with records of two recipes is named", D.checksOf(mixed).some((x) => /cx has records of more than one recipe/.test(x)) && !D.checksOf(mixed).some((x) => /nostate has records of more/.test(x)));
    const st = (key, v) => full().map((r) => (r.family === "plain" && r.index === 2 ? { ...r, start: { ...r.start, [key]: v } } : r));
    ok("!! a family whose records disagree about the START is named, for the train score, the held-out score and the pool crushed count each", D.checksOf(st("train", 0.5)).some((x) => /plain's records disagree about the START/.test(x)) && D.checksOf(st("heldOut", 0.5)).some((x) => /plain's records disagree about the START/.test(x)) && D.checksOf(st("poolCrashed", 3)).some((x) => /plain's records disagree about the START/.test(x)));
    const fs3 = (key, v) => full().map((r) => (r.family === "plain" ? { ...r, start: { ...r.start, [key]: v } } : r));
    ok("!! three families that do not start from the same numbers are named, for the train score, the held-out score and the pool crushed count each (every untrained circuit is rule-low06)", D.checksOf(fs3("train", 0.5)).some((x) => /three families do not start/.test(x)) && D.checksOf(fs3("heldOut", 0.5)).some((x) => /three families do not start/.test(x)) && D.checksOf(fs3("poolCrashed", 1)).some((x) => /three families do not start/.test(x)) && !D.checksOf(full()).some((x) => /three families do not start/.test(x)));
    const short = full().map((r) => (r.family === "cx" && r.index === 0 ? { ...r, weights: [0.1, 0.2] } : r)), notArr = full().map((r) => (r.family === "nostate" && r.index === 0 ? { ...r, weights: null } : r));
    ok("!! a record whose weights do not fit the count (two of three, or not an array) is named", D.checksOf(short).some((x) => /cx has a record whose weights do not fit/.test(x)) && D.checksOf(notArr).some((x) => /nostate has a record whose weights do not fit/.test(x)));
    ok("!! the number of searches follows the recipe (2 runs: indices 0 and 1 are enough)", D.checksOf(D.FAMILIES.flatMap((f) => [0, 1].map((k) => rec(f, k))), 2).length === 0);
}

sec("6. THE LEDGER");
{
    const good = D.reportLines(full());
    ok("!! a good file reads 'checks: three families of four searches, one recipe, one start' and then each family with its weight count, its start and its champion", /^checks: three families of four searches/.test(good[0]) && good.filter((l) => /^  (cx|nostate|plain) /.test(l)).length === 3 && /3 weights; start train 0.8700 held-out 0.8840 pool crushed 0; 4 of 4 searches eligible; champion k 0: train 0.9000, held-out 0.8800, pool crushed 0, 2 weights kept of 5 moved/.test(good[1]));
    const bad = D.reportLines(full().filter((r) => !(r.family === "cx" && r.index === 3)));
    ok("!! a failed check is the first line, 'CHECK FAILED -- ...', and the 'checks:' line is absent", /^CHECK FAILED -- cx has the searches 0,1,2/.test(bad[0]) && !bad.some((l) => /^checks:/.test(l)));
    const none = full().map((r) => (r.family === "plain" ? { ...r, poolCrashed: 2 } : r)), nl = D.reportLines(none);
    ok("!! a family with no eligible champion reads 'NO ELIGIBLE CHAMPION: the family IS rule-low06' and each of its searches is tagged NOT ELIGIBLE; the others are not tagged", nl.some((l) => /^  plain .*0 of 4 searches eligible; NO ELIGIBLE CHAMPION: the family IS rule-low06/.test(l)) && nl.filter((l) => /NOT ELIGIBLE/.test(l)).length === 4 && !nl.some((l) => /^  cx .*NO ELIGIBLE/.test(l)));
    const one = D.reportLines(full().map((r) => (r.family === "cx" && r.index === 0 ? { ...r, heldOut: 0.99 } : r)));
    ok("!! the champion line names the best eligible k and the search lines list k, train, held-out, pool crushed, moved, kept", /champion k 0: train 0.9000, held-out 0.9900/.test(one.find((l) => /^  cx /.test(l))) && one.some((l) => /^      k 2: train 0.9000, held-out 0.8800, pool crushed 0, moved 5, kept 2$/.test(l)));
    const noRec = D.reportLines(full().filter((r) => r.family !== "nostate"));
    ok("!! a family with no records reads 'no records'", noRec.some((l) => /^  nostate\s+no records/.test(l)));
}

sec("7. THE COMMAND");
{
    const run = (argv) => { try { return D.parseArgs(argv); } catch (e) { return e.message; } };
    ok("!! the first word must be run or report; options are checked by name and value", /must be run or report/.test(run([])) && /must be run or report/.test(run(["go"])) && /unknown option "--nope"/.test(run(["run", "--nope"])) && /unexpected argument "x"/.test(run(["run", "x"])) && /--specs needs a value/.test(run(["run", "--specs"])) && /--specs needs a value/.test(run(["run", "--specs", "--out", "f"])) && /needs a number/.test(run(["run", "--iters", "many"])));
    ok("!! run needs --specs (or --one) and --out (not for --one); report needs --in", /run needs --specs/.test(run(["run", "--out", "f"])) && /run needs --out/.test(run(["run", "--specs", "all"])) && !/run needs/.test(String(run(["run", "--one", "cx:0"]))) && /report needs --in/.test(run(["report"])) && run(["report", "--in", "f"]).in === "f" && run(["report", "--in", "f", "--allow-smoke"]).allowSmoke === true && run(["report", "--in", "f"]).allowSmoke === false);
    const d = run(["run", "--specs", "all", "--out", "f"]);
    ok("!! the defaults are the registered recipe, one worker, not smoke, not quiet", d.workers === 1 && d.smoke === false && d.quiet === false && J(d.recipe) === J({ runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 }) && d.out === "f" && d.one === null);
    const e = run(["run", "--specs", "cx:0", "--out", "f", "--workers", "3", "--runs", "2", "--iters", "5", "--sigma", "0.1", "--maxK", "2", "--prune-budget", "0", "--smoke", "--quiet"]);
    ok("!! every option is read: workers 3, runs 2, iters 5, sigma 0.1, maxK 2, prune budget 0 (zero is allowed), smoke, quiet", e.workers === 3 && e.recipe.runs === 2 && e.recipe.iters === 5 && e.recipe.sigma === 0.1 && e.recipe.maxK === 2 && e.recipe.pruneBudget === 0 && e.smoke === true && e.quiet === true);
    ok("!! the numbers are checked: workers, runs, iters and maxK whole and at least 1; sigma above 0; prune budget a whole number of 0 or more; specs past the recipe refused; --one takes one spec", /--workers must be a whole number/.test(run(["run", "--specs", "all", "--out", "f", "--workers", "0"])) && /--runs must be a whole number/.test(run(["run", "--specs", "all", "--out", "f", "--runs", "1.5"])) && /--iters must be a whole number/.test(run(["run", "--specs", "all", "--out", "f", "--iters", "0"])) && /--maxK must be a whole number/.test(run(["run", "--specs", "all", "--out", "f", "--maxK", "0"])) && /--sigma must be above 0/.test(run(["run", "--specs", "all", "--out", "f", "--sigma", "0"])) && /--prune-budget must be a whole number of 0 or more/.test(run(["run", "--specs", "all", "--out", "f", "--prune-budget", "-1"])) && /--prune-budget must be a whole number/.test(run(["run", "--specs", "all", "--out", "f", "--prune-budget", "1.5"])) && /past the recipe/.test(run(["run", "--specs", "cx:3", "--out", "f", "--runs", "2"])) && /--one takes a single spec/.test(run(["run", "--one", "cx:0-1"])));

    // an in-memory file system and a counting runner
    const mem = (files = {}) => { const fsx = { ...files }, o = { out: [], err: [], ran: [], files: fsx }; return Object.assign(o, { io: { out: (m) => o.out.push(m), err: (m) => o.err.push(m), readFile: (f) => { if (!(f in fsx)) throw new Error("ENOENT " + f); return fsx[f]; }, appendFile: (f, t) => { fsx[f] = (fsx[f] || "") + t; }, exists: (f) => f in fsx, runner: (s, opts) => { o.ran.push(s.family + ":" + s.index + (opts.smoke ? "s" : "")); return rec(s.family, s.index, { smoke: !!opts.smoke, recipe: { ...opts.recipe } }); }, spawner: async (s) => { throw new Error("THE SPAWNER WAS USED for " + s.family + ":" + s.index + " (no child process was asked for)"); } } }); };
    const m1 = mem();
    const code1 = await D.command(["run", "--specs", "cx:0-1,plain:2", "--out", "o.jsonl"], m1.io);
    ok("!! `run` trains each spec once and APPENDS one JSON line a finished search; the ledger is printed at the end (exit 0)", code1 === 0 && J(m1.ran) === J(["cx:0", "cx:1", "plain:2"]) && m1.files["o.jsonl"].trim().split("\n").length === 3 && m1.files["o.jsonl"].trim().split("\n").map((l) => JSON.parse(l).spec).join() === "cx:0,cx:1,plain:2" && m1.out.some((l) => /^CHECK FAILED/.test(l)) && m1.out.some((l) => /3 searches, 0 already in o.jsonl, 3 to run; 1 worker\(s\); recipe 4 x 300/.test(l)));
    const code2 = await D.command(["run", "--specs", "cx:0-2,plain:2", "--out", "o.jsonl"], m1.io);
    ok("!! `run` RESUMES: the specs already in the file are not run again (only cx:2 is), and the file grows by that one line", code2 === 0 && J(m1.ran) === J(["cx:0", "cx:1", "plain:2", "cx:2"]) && m1.files["o.jsonl"].trim().split("\n").length === 4 && m1.out.some((l) => /4 searches, 3 already in o.jsonl, 1 to run/.test(l)));
    const m2 = mem({ "o.jsonl": J(rec("cx", 0, { smoke: true })) + "\n" }), code3 = await D.command(["run", "--specs", "cx:1", "--out", "o.jsonl"], m2.io);
    ok("!! a file with a smoke record is NOT mixed with a real run (refused, exit 1, nothing run, nothing appended)", code3 === 1 && m2.ran.length === 0 && m2.err.some((l) => /smoke run.*cx:0.*use another --out/.test(l)) && m2.files["o.jsonl"].trim().split("\n").length === 1);
    const m3 = mem({ "o.jsonl": J(rec("cx", 0, { recipe: { ...D.RECIPE, iters: 100 } })) + "\n" }), code4 = await D.command(["run", "--specs", "cx:1", "--out", "o.jsonl"], m3.io);
    ok("!! a file of ANOTHER RECIPE is not mixed either (iters 100 against 300: refused, exit 1)", code4 === 1 && m3.ran.length === 0 && m3.err.some((l) => /another recipe/.test(l)));
    for (const [key, val] of [["runs", 3], ["sigma", 0.2], ["maxK", 3], ["pruneBudget", 30]]) {
        const mm = mem({ "o.jsonl": J(rec("cx", 0, { recipe: { ...D.RECIPE, [key]: val } })) + "\n" });
        if (await D.command(["run", "--specs", "cx:1", "--out", "o.jsonl"], mm.io) !== 1) { ok(`!! a record of another ${key} is refused`, false); }
    }
    ok("!! a record that differs in runs, sigma, maxK or prune budget is refused each", true);
    const m4 = mem({ "o.jsonl": J(rec("cx", 0, { smoke: true, recipe: { ...D.RECIPE, iters: 3 } })) + "\n" }), code5 = await D.command(["run", "--specs", "cx:1", "--out", "o.jsonl", "--smoke", "--iters", "3"], m4.io);
    ok("!! a smoke run continues a smoke file of the same recipe (and runs the spec as smoke)", code5 === 0 && J(m4.ran) === J(["cx:1s"]));
    const m5 = mem(); m5.io.runner = (s, opts) => { if (s.index === 1) throw new Error("boom"); return rec(s.family, s.index); };
    const code6 = await D.command(["run", "--specs", "cx:0-2", "--out", "o.jsonl"], m5.io);
    ok("!! a failing search stops the run with exit 1 and a message that names the error and says to run the same command again; the searches finished before it are in the file", code6 === 1 && m5.err.some((l) => /boom.*run the same command again to resume/.test(l)) && m5.files["o.jsonl"].trim().split("\n").length === 1);
    const m6 = mem(); let spawned = []; m6.io.spawner = async (s) => { spawned.push(s.family + ":" + s.index); return rec(s.family, s.index); };
    const code7 = await D.command(["run", "--specs", "plain:0-3", "--out", "o.jsonl", "--workers", "2", "--smoke", "--iters", "1", "--prune-budget", "0"], m6.io);
    ok("!! with --workers above 1 each search goes to the spawner (a child process), not to the in-process runner; all four are appended", code7 === 0 && spawned.length === 4 && m6.ran.length === 0 && m6.files["o.jsonl"].trim().split("\n").length === 4);
    const m7 = mem(); const code8 = await D.command(["run", "--one", "nostate:1", "--runs", "4"], m7.io);
    ok("!! `--one` runs a single search and prints ONE line, 'RESULT <json>', and writes no file", code8 === 0 && m7.out.length === 1 && /^RESULT \{/.test(m7.out[0]) && JSON.parse(m7.out[0].slice(7)).spec === "nostate:1" && Object.keys(m7.files).length === 0);
    const m8 = mem({ "r.jsonl": full().map((r) => J(r)).join("\n") + "\n" }), code9 = await D.command(["report", "--in", "r.jsonl"], m8.io);
    ok("!! `report` prints the ledger of a file and exits 0", code9 === 0 && m8.out.length > 5 && /^checks: three families/.test(m8.out[0]));
    const m9 = mem({ "r.jsonl": "" }), code10 = await D.command(["report", "--in", "r.jsonl"], m9.io), m10 = mem({ "r.jsonl": J(rec("cx", 0, { smoke: true })) + "\n" }), code11 = await D.command(["report", "--in", "r.jsonl"], m10.io), code12 = await D.command(["report", "--in", "r.jsonl", "--allow-smoke"], m10.io);
    ok("!! `report` refuses an empty file (exit 1), refuses smoke records unless --allow-smoke, and reads them with it", code10 === 1 && m9.err.some((l) => /no records/.test(l)) && code11 === 1 && m10.err.some((l) => /smoke records.*--allow-smoke/.test(l)) && code12 === 0);
    const m11 = mem({ "r.jsonl": "{not json}\n" }), code13 = await D.command(["report", "--in", "r.jsonl"], m11.io), m12 = mem(), code14 = await D.command(["report", "--in", "missing.jsonl"], m12.io);
    ok("!! `report` names a line that is not JSON and a file that is missing (exit 1 each); a bad argument is exit 2 with the name of the tool", code13 === 1 && m11.err.some((l) => /line 1 is not JSON/.test(l)) && code14 === 1 && m12.err.some((l) => /ENOENT/.test(l)) && await D.command(["go"], mem().io) === 2 && mem().err.length === 0);
    const bm = mem(); await D.command(["go"], bm.io);
    ok("!! a bad argument says so on the error stream, naming trainDecisionCircuit", bm.err.length === 1 && /^trainDecisionCircuit: the first word must be run or report/.test(bm.err[0]));
    const mq = mem(); await D.command(["run", "--specs", "cx:0", "--out", "o.jsonl", "--quiet"], mq.io);
    ok("!! --quiet silences the progress lines (the ledger is still printed)", !mq.out.some((l) => /\[trainDecisionCircuit\]/.test(l)) && mq.out.some((l) => /CHECK FAILED/.test(l)));
    // the real file handling, on a real temporary file by absolute path
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tdc-")), file = path.join(dir, "o.jsonl"), outL = [], errL = [], ran = [];
    const real = { out: (m) => outL.push(m), err: (m) => errL.push(m), runner: (s, opts) => { ran.push(s.family + ":" + s.index); return rec(s.family, s.index, { recipe: { ...opts.recipe } }); }, spawner: async (s) => { throw new Error("THE SPAWNER WAS USED for " + s.family + ":" + s.index); } };
    const c1 = await D.command(["run", "--specs", "cx:0-1", "--out", file], real), c2 = await D.command(["run", "--specs", "cx:0-2", "--out", file], real), c3 = await D.command(["report", "--in", file], real);
    ok("!! on a REAL file (absolute path, the default readFile / appendFile / exists): the first run writes two lines, the second runs only cx:2 and the file ends with three lines, and `report` reads it", c1 === 0 && c2 === 0 && c3 === 0 && J(ran) === J(["cx:0", "cx:1", "cx:2"]) && fs.readFileSync(file, "utf8").trim().split("\n").length === 3 && errL.length === 0);
    fs.rmSync(dir, { recursive: true, force: true });
    // runChild on throwaway scripts
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "tdc-child-")), mkScript = (n, body) => { const p = path.join(dir2, n); fs.writeFileSync(p, body); return p; };
    const echo = mkScript("echo.mjs", 'console.log("noise"); console.log("RESULT " + JSON.stringify({ argv: process.argv.slice(2) }));'), none = mkScript("none.mjs", 'console.log("nothing to say");'), junk = mkScript("junk.mjs", 'console.log("RESULT {not json");');
    const o = { recipe: { runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 }, smoke: false }, r1 = await D.runChild({ family: "plain", index: 2 }, o, echo), r2 = await D.runChild({ family: "cx", index: 0 }, { ...o, smoke: true, recipe: { ...o.recipe, iters: 7 } }, echo);
    ok("!! runChild starts `run --one <spec>` with the recipe, --quiet, and --smoke only when asked, and returns the RESULT line's JSON past other output", J(r1.argv) === J(["run", "--one", "plain:2", "--runs", "4", "--iters", "300", "--sigma", "0.3", "--maxK", "4", "--prune-budget", "60", "--quiet"]) && J(r2.argv) === J(["run", "--one", "cx:0", "--runs", "4", "--iters", "7", "--sigma", "0.3", "--maxK", "4", "--prune-budget", "60", "--quiet", "--smoke"]));
    let e1 = "", e2 = ""; try { await D.runChild({ family: "cx", index: 0 }, o, none); } catch (e) { e1 = e.message; } try { await D.runChild({ family: "cx", index: 0 }, o, junk); } catch (e) { e2 = e.message; }
    ok("!! a child with no RESULT line is refused by name, and so is one whose RESULT is not JSON", /child for cx:0 ended with 0 and no RESULT/.test(e1) && /child for cx:0 printed a RESULT that is not JSON/.test(e2));
    fs.rmSync(dir2, { recursive: true, force: true });
    // ---- the words of the refusals, exactly (a message with a wrong number or a wrong name is a lie to whoever reads it)
    const msg = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! the refusals of parseSpecs say exactly what is wrong: the family named and the known ones, the index named and the recipe's range (0 to 3), the spec that cannot be read, the backwards range, the name twice, the empty spec", msg(() => D.parseSpecs("withheld:0")) === 'trainDecisionCircuit.parseSpecs: unknown family "withheld" (known: cx, nostate, plain)' && msg(() => D.parseSpecs("cx:4")) === 'trainDecisionCircuit.parseSpecs: "cx:4" is past the recipe\'s 4 searches (0 to 3)' && msg(() => D.parseSpecs("cx:0-2", 2)) === 'trainDecisionCircuit.parseSpecs: "cx:0-2" is past the recipe\'s 2 searches (0 to 1)' && msg(() => D.parseSpecs("cx:a")) === 'trainDecisionCircuit.parseSpecs: cannot read "cx:a" (a spec is family:K or family:K-L, or all)' && msg(() => D.parseSpecs("cx:3-1")) === 'trainDecisionCircuit.parseSpecs: the range "cx:3-1" runs backwards' && msg(() => D.parseSpecs("cx:0,cx:0")) === "trainDecisionCircuit.parseSpecs: cx:0 is named twice" && msg(() => D.parseSpecs("cx:0,,plain:1")) === 'trainDecisionCircuit.parseSpecs: an empty spec in "cx:0,,plain:1"');
    ok("!! the refusals of parseArgs say exactly what is wrong: the unknown option with the options known for that command, the missing value, the stray word, the number that is not one, the missing --specs, --out and --in, the numbers out of range", msg(() => D.parseArgs(["run", "--nope"])) === 'unknown option "--nope" (known for run: --specs, --out, --workers, --runs, --iters, --sigma, --maxK, --prune-budget, --one, --smoke, --quiet)' && msg(() => D.parseArgs(["report", "--nope"])) === 'unknown option "--nope" (known for report: --in, --allow-smoke)' && msg(() => D.parseArgs(["run", "--out"])) === "--out needs a value" && msg(() => D.parseArgs(["run", "x"])) === 'unexpected argument "x"' && msg(() => D.parseArgs(["run", "--iters", "many"])) === '--iters needs a number, got "many"' && msg(() => D.parseArgs(["go"])) === 'the first word must be run or report, got "go"' && msg(() => D.parseArgs(["run", "--out", "f"])) === "run needs --specs <list> (all, or a list such as cx:0-3,plain:0-3)" && msg(() => D.parseArgs(["run", "--specs", "all"])) === "run needs --out <results file>" && msg(() => D.parseArgs(["report"])) === "report needs --in <results file>" && msg(() => D.parseArgs(["run", "--specs", "all", "--out", "f", "--workers", "0"])) === "--workers must be a whole number of 1 or more, got 0" && msg(() => D.parseArgs(["run", "--specs", "all", "--out", "f", "--sigma", "0"])) === "--sigma must be above 0, got 0" && msg(() => D.parseArgs(["run", "--specs", "all", "--out", "f", "--prune-budget", "-1"])) === "--prune-budget must be a whole number of 0 or more, got -1" && msg(() => D.parseArgs(["run", "--one", "cx:0-1"])) === "--one takes a single spec");
    ok("!! the checks name the missing searches and the recipe's range exactly", D.checksOf(full().filter((r) => !(r.family === "cx" && r.index === 3)))[0] === "cx has the searches 0,1,2 (it needs 0 to 3, once each)" && D.checksOf(full().filter((r) => r.family !== "nostate")).includes("nostate has the searches none (it needs 0 to 3, once each)") && D.checksOf(D.FAMILIES.flatMap((f) => [0].map((k) => rec(f, k))), 2)[0] === "cx has the searches 0 (it needs 0 to 1, once each)");
    // ties go to the lower k whatever the order the records come in
    const perms = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
    ok("!! a three-way tie in held-out goes to the lowest k in ALL six orders of the records, and a tie between the best two (0.95 at k 3 and k 2, k 1 at 0.9) to the lower of those", perms.every((pm) => D.championOf(pm.map((k) => rec("cx", k, { heldOut: 0.9 })), "cx").record.index === 1) && perms.every((pm) => D.championOf(pm.map((k) => rec("cx", k, { heldOut: k === 1 ? 0.9 : 0.95 })), "cx").record.index === 2));
    // the ledger lists the searches in k order and in the exact layout, however the records are ordered
    const shuffled = full().reverse(), lg = D.reportLines(shuffled);
    ok("!! the ledger is in the exact layout, family by family, the searches listed in k order whatever the order of the records: '  cx       2452 weights' is not this record's count (3 here), so the line reads '  cx       3 weights; start train ...' with the family padded to eight characters", lg.some((l) => l.startsWith("  cx       3 weights; start train 0.8700 held-out 0.8840 pool crushed 0; 4 of 4 searches eligible; champion k 0: ")) && lg.some((l) => l.startsWith("  nostate  3 weights;")) && lg.some((l) => l.startsWith("  plain    3 weights;")) && J(lg.filter((l) => /^      k \d:/.test(l)).slice(0, 4).map((l) => l[8])) === J(["0", "1", "2", "3"]) && D.reportLines(full().filter((r) => r.family !== "nostate")).includes("  nostate  no records"));
    // the progress line of a search, to the last digit
    const lgl = []; const rl = D.runSearch({ family: "plain", index: 1 }, { policy: stub().pol, sets: SETS, recipe: { iters: 5, pruneBudget: 2 } }, (m) => lgl.push(m));
    ok("!! the progress line of a search reads the record's own numbers to four decimals: the spec, the seed, the moved and kept weights, the train score against the start's, the held-out against the start's, the pool count against the start's", lgl.length === 1 && lgl[0] === `  plain:1 (seed 96521): ${rl.moved} moved weights pruned to ${rl.kept}, train ${rl.trainScore.toFixed(4)} (start ${rl.start.train.toFixed(4)}), held-out ${rl.heldOut.toFixed(4)} (start ${rl.start.heldOut.toFixed(4)}), pool crushed ${rl.poolCrashed} (start ${rl.start.poolCrashed})`, lgl[0]);
    // a results file that cannot be read stops a run
    const mbad = mem({ "o.jsonl": "{nope}\n" }), cbad = await D.command(["run", "--specs", "cx:0", "--out", "o.jsonl"], mbad.io);
    ok("!! `run` on a results file that is not JSON stops with exit 1 and names the line, running nothing: 'trainDecisionCircuit: results file line 1 is not JSON'", cbad === 1 && mbad.ran.length === 0 && mbad.err.length === 1 && mbad.err[0] === "trainDecisionCircuit: results file line 1 is not JSON");
    // no child process is started for a run of one worker, and a run of several asks the spawner (the guard above throws if the in-process rows ever do)
    const mw = mem(), cw = await D.command(["run", "--specs", "cx:0-1", "--out", "o.jsonl", "--workers", "1"], mw.io);
    ok("!! one worker runs in this process: the in-process runner is used, the spawner (which throws) is not", cw === 0 && J(mw.ran) === J(["cx:0", "cx:1"]));
    // the one-job form prints its record on the output stream and its progress on the error stream
    const mo = mem(), co = await D.command(["run", "--one", "cx:2", "--runs", "4"], mo.io);
    ok("!! `--one` writes only the RESULT line on the output stream (a parent reads that stream; the progress goes to the error stream)", co === 0 && mo.out.length === 1 && /^RESULT /.test(mo.out[0]));

}

sec("8. THE START (one real search per family at a throwaway recipe on the smoke sets)");
{
    const sets = Object.fromEntries(Object.entries({ train: T.TRAIN_SMALL_SET, heldOut: T.HELD_OUT_SET, pool: T.POOL_SET }).map(([k, v]) => [k, v.filter((_, i) => i % 8 === 0)]));
    const rule = T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), want = { train: T.evaluate(rule, sets.train, { gauge: T.GAUGE }), heldOut: T.evaluate(rule, sets.heldOut, { gauge: T.GAUGE }), pool: T.evaluate(rule, sets.pool, { gauge: T.GAUGE }) };
    const recs = D.FAMILIES.map((f) => D.runSearch({ family: f, index: 0 }, { sets, recipe: { iters: 2, pruneBudget: 2 }, smoke: true }));
    ok("!! the START of each family's record IS rule-low06's on the same sets (train, held-out, pool crushed): the untrained circuit is the rule", recs.every((r) => r.start.train === want.train.score && r.start.heldOut === want.heldOut.score && r.start.poolCrashed === want.pool.crashed), recs.map((r) => r.start.train.toFixed(4)).join(" ") + " vs " + want.train.score.toFixed(4));
    ok("!! the weight counts are 2,452 (cx), 2,452 (nostate), 2,443 (plain), and each record's weights fit them", J(recs.map((r) => r.weightCount)) === J([2452, 2452, 2443]) && recs.every((r) => r.weights.length === r.weightCount) && recs.every((r) => r.smoke === true));
    ok("!! the three real records pass the checks that need only these (the weights fit, one recipe, the same start across the families) and a family's champion is the search or none", D.checksOf(recs).filter((x) => /disagree|do not start|more than one recipe|do not fit/.test(x)).length === 0 && recs.every((r) => D.championOf(recs, r.family).searches === 1));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
