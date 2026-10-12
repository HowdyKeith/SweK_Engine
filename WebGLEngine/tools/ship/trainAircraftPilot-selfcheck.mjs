// WebGLEngine/tools/ship/trainAircraftPilot-selfcheck.mjs -- v4839 (beside tools/ship/trainAircraftPilot.mjs)
//
// Run: node tools/ship/trainAircraftPilot-selfcheck.mjs
//
// GRADES THE TOOL THAT MAKES THE AIRCRAFT PILOT, NOT THE PILOT (brain/pilotAircraftPolicy-selfcheck.mjs holds the shipped file to what it claims). The tool's whole value is that it cannot flatter itself: several
// independent searches, the champion chosen on scenarios the searches did not train on, the audit read ONCE and only for the champion, and a file written only when that champion beats the PD controller on both the
// held-out and the audit scenarios, loses on no more audit scenarios than it wins, adds no unstable flight, AND does not fly the page's own patrol worse. So this gate holds: the argument parser refuses what it does not
// know (a typo must not silently train the default recipe), the qualification rule on a table of made-up results (each clause is the only thing that fails in its row), run() on a recipe small enough to finish in
// seconds -- deterministic to the bit, champion picked on held-out, audit untouched by the selection -- the blob it writes (right format, round-trips through the importer the page uses, quotes the numbers it was
// graded on), and the command line (it writes nothing without --write and nothing when the champion does not qualify).
//
// SABOTAGES, v4843, twelve (each broken in place, the gate run, the file restored; run in scratch checkouts three at a time). Reds are rows (`grep -c '^  FAIL'`).
//   A  parseArgs: an unknown option read past                                   2 red (the refusal row; the unknown-option command line, which now fails on the NEXT thing it reads instead of naming the option)
//   B  qualifies: the audit-score clause dropped                                2 red (the audit-score row; the worse-in-every-way row, 4 reasons not 5)
//   C  qualifies: strict > loosened to >= on the held-out score                 1 red (the equal-is-not-better row)
//   D  run(): the champion picked on TRAIN score, not held-out                  2 red (the champion-is-the-best-held-out row and the train-best-is-not-the-champion row; the seed-3010 recipe exists for this one)
//   E  run(): the audit evaluated on the train scenarios                        1 red (the audit row)
//   F  blobOf(): the count of weights that differ left out of `by`              1 red (the blob row)
//   G  CLI: --write writes even when the champion does not qualify              1 red (the CLI row)
//   H  run(): the pruning step skipped                                          1 red (the pruned row). THE ROW WAS TIGHTENED BEFORE THIS RUN, NOT AFTER: as first written it asked only that no run end with MORE weights differing than it
//      moved, which a skipped prune satisfies trivially (kept = moved); it now also asks that at least one run end with FEWER. Reasoned from the 6dof trainer's own log, not observed as a 0-red.
//   I  RECIPE: 600 iterations -> 500                                            1 red (the recorded-recipe row)
//   J  qualifies: the patrol clause dropped                                     2 red (the patrol row; the worse-in-every-way row)
//   K  qualifies: the unstable clause dropped                                   2 red (the unstable row; the worse-in-every-way row)
//   L  qualifies: better > worse loosened to >=                                 1 red (the as-many-worse-as-better row)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as T from "./trainAircraftPilot.mjs";
import * as A from "../../brain/pilotAircraftPolicy.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

sec("1. the argument parser");
const d0 = T.parseArgs([]);
ok("no arguments is the recorded recipe: 4 runs x 600 iterations, seed 3000, sigma 0.3, 1-4 weights a child, no write", d0.runs === 4 && d0.iters === 600 && d0.seed === 3000 && d0.sigma === 0.3 && d0.maxK === 4 && d0.write === false && d0.out === T.DEFAULT_OUT, JSON.stringify({ ...d0, out: path.basename(d0.out) }));
ok("RECIPE is that recorded recipe, frozen, and parseArgs() starts from it; the default output is the file the page fetches", Object.isFrozen(T.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => d0[k] === T.RECIPE[k]) && path.basename(T.DEFAULT_OUT) === "pilotAircraftWeightsDefault.json" && T.POLICY_ID === "pilotAircraftPolicy", JSON.stringify(T.RECIPE));
const d1 = T.parseArgs(["--runs", "3", "--iters", "50", "--write", "--out", "x.json", "--quiet"]);
ok("every option is read: --runs, --iters, --seed, --sigma, --out, --write, --quiet", d1.runs === 3 && d1.iters === 50 && d1.write && d1.quiet && d1.out === "x.json" && T.parseArgs(["--seed", "9", "--sigma", "0.1"]).seed === 9 && T.parseArgs(["--sigma", "0.1"]).sigma === 0.1);
const e1 = throws(() => T.parseArgs(["--bogus"])), e2 = throws(() => T.parseArgs(["--runs"])), e3 = throws(() => T.parseArgs(["--runs", "many"])), e4 = throws(() => T.parseArgs(["stray"]));
ok("an unknown option, a missing value, a non-number and a stray argument are each REFUSED with the reason (a typo must not silently train the default recipe)", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /--runs needs a number/.test(e3) && /unexpected argument "stray"/.test(e4), [e1, e2, e3, e4].map((x) => String(x).slice(0, 40)).join(" | "));

sec("2. qualifies(): the only door to a written file");
const E = (score, unstable = 0) => ({ score, mean: score - 0.05, final: score + 0.05, unstable });
const hand = { heldOut: E(0.722), audit: E(0.713), patrol: { mean: 0.831 } };
const good = { heldOut: E(0.85), audit: E(0.80), patrol: { mean: 0.84 }, vs: { better: 12, worse: 3 } };
ok("a champion ahead on the held-out score and the audit score, with more audit scenarios better than worse, no more unstable flights and a patrol no worse qualifies, with no reason against it", T.qualifies(good, hand).ok && T.qualifies(good, hand).reasons.length === 0);
const only = (mut) => T.qualifies({ ...good, ...mut }, hand);
const q1 = only({ heldOut: E(0.722) }), q2 = only({ audit: E(0.713) }), q3 = only({ vs: { better: 5, worse: 5 } }), q4 = only({ audit: E(0.80, 1) }), q5 = only({ patrol: { mean: 0.80 } });
ok("EQUAL IS NOT BETTER: a held-out score equal to the PD controller's fails, naming the held-out score and nothing else", !q1.ok && q1.reasons.length === 1 && /held-out score/.test(q1.reasons[0]), q1.reasons.join("; "));
ok("an audit score no better than the controller's fails on the audit score alone", !q2.ok && q2.reasons.length === 1 && /audit score/.test(q2.reasons[0]), q2.reasons.join("; "));
ok("as many scenarios flown worse as better fails on that alone, however well it scores on average (a few big wins can carry a mean)", !q3.ok && q3.reasons.length === 1 && /not more better than worse/.test(q3.reasons[0]), q3.reasons.join("; "));
ok("one more unstable audit flight than the controller has fails on that alone", !q4.ok && q4.reasons.length === 1 && /unstable/.test(q4.reasons[0]), q4.reasons.join("; "));
ok("a patrol worse than the controller's by more than 0.01 fails on that alone (a pilot that wins the tests and loses the page's own task is not shipped); 0.01 worse is allowed, 0.02 is not", !q5.ok && q5.reasons.length === 1 && /patrol/.test(q5.reasons[0]) && only({ patrol: { mean: 0.8215 } }).ok && !only({ patrol: { mean: 0.8105 } }).ok, q5.reasons.join("; "));
const bad = T.qualifies({ heldOut: E(0.5), audit: E(0.5, 3), patrol: { mean: 0.5 }, vs: { better: 0, worse: 9 } }, hand);
ok("a champion worse in every way fails with all five reasons, so the output says everything that is wrong", !bad.ok && bad.reasons.length === 5, String(bad.reasons.length));

sec("3. run(): a small recipe, end to end");
const recipe = { runs: 2, iters: 6, seed: 3000, sigma: 0.3, maxK: 4 }, lines = [];
const a = T.run(recipe, (m) => lines.push(m)), b = T.run(recipe);
ok("the same recipe gives the same champion to the bit (same weights hash, same seed chosen, same scores)", weightsHash(a.champion.weights) === weightsHash(b.champion.weights) && a.champion.seed === b.champion.seed && a.champion.heldOut.score === b.champion.heldOut.score && a.champion.audit.score === b.champion.audit.score, `hash ${weightsHash(a.champion.weights)}, seed ${a.champion.seed}`);
ok("the champion is the run with the best HELD-OUT score, and the runs are listed best-first", a.runs.every((r, i, arr) => !i || arr[i - 1].heldOut.score >= r.heldOut.score) && a.champion.seed === a.runs[0].seed && a.champion.heldOut.score === a.runs[0].heldOut.score, a.runs.map((r) => `${r.seed}: train ${r.train.toFixed(3)} held-out ${r.heldOut.score.toFixed(3)}`).join(" | "));
const audit = A.evaluate(a.champion.weights, A.AUDIT_SET);
ok("the audit is the champion's score on the AUDIT scenarios, read once after the choice, the hand pilot's is on the same scenarios, and the patrol is the champion's own patrol", a.champion.audit.score === audit.score && a.hand.audit.score === A.evaluate(A.handWeights(), A.AUDIT_SET).score && a.champion.patrol.mean === A.patrol(a.champion.weights).mean && a.hand.patrol.mean === A.patrol(A.handWeights()).mean, A.describeEval(a.champion.audit));
ok("every run is PRUNED: no run ends with more weights differing from the hand pilot than its search moved, at least one ends with FEWER (the search drifts weights that carry nothing, and the prune puts them back), and the log says so", a.runs.every((r) => Number.isInteger(r.kept) && Number.isInteger(r.moved) && r.kept <= r.moved) && a.runs.some((r) => r.moved > 0 && r.kept < r.moved) && lines.some((l) => /pruned \d+ moved weights to \d+/.test(l)), a.runs.map((r) => `${r.moved} -> ${r.kept}`).join(", "));
ok("the log says what it did: the PD controller's scores, one line a run, the champion 'picked on held-out', and a verdict line", lines.length === 1 + recipe.runs + 2 && /PD controller/.test(lines[0]) && lines.some((l) => /picked on held-out/.test(l)) && /QUALIFIES|DOES NOT QUALIFY/.test(lines[lines.length - 1]), `${lines.length} lines`);

// a recipe chosen BECAUSE the run that scores best on the train scenarios is not the run that scores best on the held-out ones (3012 trains to 0.764 and holds out at 0.715; 3010 trains to 0.757 and holds out at 0.723):
// the champion must be the second, or "picked on held-out" is a sentence and not a rule
const sp = T.run({ runs: 3, iters: 8, seed: 3010, sigma: 0.6, maxK: 6 }), trainBest = [...sp.runs].sort((x, y) => y.train - x.train)[0];
ok("*** WHEN THE TRAIN-BEST RUN AND THE HELD-OUT-BEST RUN ARE DIFFERENT RUNS, THE CHAMPION IS THE HELD-OUT-BEST ONE ***", trainBest.seed !== sp.champion.seed && sp.champion.heldOut.score === Math.max(...sp.runs.map((r) => r.heldOut.score)) && trainBest.heldOut.score < sp.champion.heldOut.score, `train-best seed ${trainBest.seed} (train ${trainBest.train.toFixed(3)}, held-out ${trainBest.heldOut.score.toFixed(3)}); champion seed ${sp.champion.seed} (held-out ${sp.champion.heldOut.score.toFixed(3)})`);

sec("4. the file it writes");
const fake = { hand: a.hand, champion: { ...a.champion, weights: A.handWeights(), heldOut: E(0.85), audit: E(0.80), patrol: { mean: 0.84, worstLeg: 0.6 }, vs: { better: 12, worse: 3, same: 26 }, kept: 97 }, verdict: { ok: true, reasons: [] } };
const blob = T.blobOf(fake, { ...recipe, runs: 4, iters: 600, seed: 3000 });
const imp = PB.importBrain(PB.describePolicy(T.POLICY_ID, A), blob);
ok("the blob is a swek-brain-v1 file for pilotAircraftPolicy with 860 weights that the importer the page uses accepts", blob.format === "swek-brain-v1" && blob.policy === "pilotAircraftPolicy" && blob.weightCount === 860 && imp.ok, imp.ok ? "" : imp.reason);
ok("the space-battle pilot's importer refuses it by name (a blob of one policy cannot be taken for another)", PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob).ok === false);
ok("`by` records the recipe, the champion's seed and the count of weights that differ from the PD controller, and quotes the held-out, the audit, the scenarios better and worse, and the patrol it was graded on",
    /seed \d+ of 4 runs/.test(blob.by) && /97 of the 860 weights differ/.test(blob.by) && blob.by.includes(A.describeEval(E(0.85))) && blob.by.includes(A.describeEval(E(0.80))) && /12 scenarios better, 3 worse/.test(blob.by) && /patrol mean 0\.840/.test(blob.by) && blob.score === 0.85, blob.by.slice(0, 200));

sec("5. the command line writes only what qualifies");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ta-")), out = path.join(tmp, "p.json"), tool = path.join(ENG, "tools", "ship", "trainPilotAircraft.mjs");
const shipped = path.join(ENG, "brain", "pilotAircraftWeightsDefault.json"), mtime0 = fs.existsSync(shipped) ? fs.statSync(shipped).mtimeMs : null;
const run1 = spawnSync(process.execPath, [tool, "--runs", "1", "--iters", "3", "--quiet", "--out", out], { encoding: "utf8", timeout: 180000 });
ok("without --write nothing is written (neither the --out file nor the shipped one)", run1.status === 0 && !fs.existsSync(out) && (mtime0 === null || fs.statSync(shipped).mtimeMs === mtime0), `exit ${run1.status}`);
const run2 = spawnSync(process.execPath, [tool, "--runs", "1", "--iters", "3", "--quiet", "--write", "--out", out], { encoding: "utf8", timeout: 180000 });
ok("with --write but a champion that does not beat the PD controller (3 iterations cannot), it exits 1, says why, and writes NOTHING", run2.status === 1 && !fs.existsSync(out) && /not written/.test(run2.stdout), `exit ${run2.status}: ${run2.stdout.trim().slice(0, 100)}`);
const run3 = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
ok("an unknown option exits 2 before any training", run3.status === 2 && /unknown option/.test(run3.stderr), run3.stderr.trim().slice(0, 80));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fails ? `\ntrainAircraftPilot-selfcheck: ${fails} FAILED` : "\ntrainAircraftPilot-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
