// WebGLEngine/tools/ship/train6dofPilot-selfcheck.mjs -- v4832 (beside tools/ship/train6dofPilot.mjs)
//
// Run: node tools/ship/train6dofPilot-selfcheck.mjs
//
// GRADES THE TOOL THAT MAKES THE SPACE-BATTLE PILOT, NOT THE PILOT (brain/pilot6dofPolicy-selfcheck.mjs holds the shipped file to what it claims). The tool's whole value is that it cannot flatter itself:
// several independent searches, the champion chosen on seeds the searches did not train on, the audit read ONCE and only for the champion, and a file written only when that champion beats the hand pilot on both
// the held-out and the audit seeds. So this gate holds: the argument parser refuses what it does not know (a typo must not silently train the default recipe), the qualification rule on a table of made-up results
// (each clause is the only thing that fails in its row), the run() on a recipe small enough to finish in seconds -- deterministic to the bit, champion picked on held-out, audit untouched by the selection -- the
// blob it writes (right format, round-trips through the importer the page uses, quotes the numbers it was graded on), and the command line (it writes nothing without --write and nothing when the champion does
// not qualify).
//
// SABOTAGES (each broken in place, the gate run, the file restored and diffed, 2026-10-11):
//   A  parseArgs: an unknown option read past                                   -> 2 RED (the refusal row; the unknown-option command line)
//   B  qualifies: the audit-score clause dropped                                -> 2 RED (the audit-score row; the worse-in-every-way row)
//   C  qualifies: strict > loosened to >= on the held-out score                 -> 1 RED (the equal-is-not-better row)
//   D  run(): the champion picked on TRAIN score, not held-out                  -> RED (the train-best-is-not-the-champion row). FIRST TRY WENT 0 RED: on the seed-2000 recipe the train-best run is also the held-out-best, so the choice was never exercised; a recipe where they differ (seed 3002) was found and added
//   E  run(): the audit evaluated on the train seeds                            -> 1 RED (the audit row)
//   F  blobOf(): the count of weights that differ left out of `by`              -> 1 RED (the blob row)
//   G  CLI: --write writes even when the champion does not qualify              -> 1 RED (the CLI row)
//   H  run(): the pruning step skipped                                          -> 1 RED (the pruned row)
//   I  RECIPE: 1500 iterations -> 1400                                          -> 2 RED (the recorded-recipe row, the RECIPE row)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as T from "./train6dofPilot.mjs";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as PP from "../../brain/pilotPolicy.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

sec("1. the argument parser");
const d0 = T.parseArgs([]);
ok("no arguments is the recorded recipe: 5 runs x 1500 iterations, seed 2000, sigma 0.3, 1-4 weights a child, no write", d0.runs === 5 && d0.iters === 1500 && d0.seed === 2000 && d0.sigma === 0.3 && d0.maxK === 4 && d0.write === false && d0.out === T.DEFAULT_OUT, JSON.stringify({ ...d0, out: path.basename(d0.out) }));
ok("RECIPE is that recorded recipe, frozen, and parseArgs() starts from it", Object.isFrozen(T.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => d0[k] === T.RECIPE[k]) && T.RECIPE.runs === 5 && T.RECIPE.iters === 1500, JSON.stringify(T.RECIPE));
const d1 = T.parseArgs(["--runs", "3", "--iters", "50", "--write", "--out", "x.json", "--quiet"]);
ok("every option is read: --runs, --iters, --seed, --sigma, --out, --write, --quiet", d1.runs === 3 && d1.iters === 50 && d1.write && d1.quiet && d1.out === "x.json" && T.parseArgs(["--seed", "9", "--sigma", "0.1"]).seed === 9 && T.parseArgs(["--sigma", "0.1"]).sigma === 0.1);
const e1 = throws(() => T.parseArgs(["--bogus"])), e2 = throws(() => T.parseArgs(["--runs"])), e3 = throws(() => T.parseArgs(["--runs", "many"])), e4 = throws(() => T.parseArgs(["stray"]));
ok("an unknown option, a missing value, a non-number and a stray argument are each REFUSED with the reason (a typo must not silently train the default recipe)", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /--runs needs a number/.test(e3) && /unexpected argument "stray"/.test(e4), [e1, e2, e3, e4].map((x) => String(x).slice(0, 40)).join(" | "));

sec("2. qualifies(): the only door to a written file");
const R = (score, wins, losses) => ({ score, wins, losses, draws: 20 - wins - losses });
const hand = { heldOut: R(7.75, 0, 0), audit: R(7.52, 0, 1) };
const good = { heldOut: R(9.9, 5, 0), audit: R(11.0, 20, 0) };
ok("a champion ahead on the held-out score, the audit score and the audit wins-minus-losses qualifies, with no reason against it", T.qualifies(good, hand).ok && T.qualifies(good, hand).reasons.length === 0);
const only = (mut) => T.qualifies({ heldOut: { ...good.heldOut, ...(mut.heldOut || {}) }, audit: { ...good.audit, ...(mut.audit || {}) } }, hand);
const q1 = only({ heldOut: { score: 7.75 } }), q2 = only({ audit: { score: 7.52 } }), q3 = only({ audit: { wins: 0, losses: 1, draws: 19 } }), q4 = only({ heldOut: { wins: 0, losses: 2, draws: 6 } });
ok("EQUAL IS NOT BETTER: a held-out score equal to the hand pilot's fails, naming the held-out score and nothing else", !q1.ok && q1.reasons.length === 1 && /held-out score/.test(q1.reasons[0]), q1.reasons.join("; "));
ok("an audit score no better than the hand pilot's fails on the audit score alone", !q2.ok && q2.reasons.length === 1 && /audit score/.test(q2.reasons[0]), q2.reasons.join("; "));
ok("an audit lead (wins minus losses) no better than the hand pilot's fails on the lead alone", !q3.ok && q3.reasons.length === 1 && /audit wins-minus-losses/.test(q3.reasons[0]), q3.reasons.join("; "));
ok("a champion that is behind the hand pilot on held-out wins-minus-losses fails on that alone, however well it scores", !q4.ok && q4.reasons.length === 1 && /held-out wins-minus-losses/.test(q4.reasons[0]), q4.reasons.join("; "));
ok("a champion worse in every way fails with all four reasons, so the output says everything that is wrong", T.qualifies({ heldOut: R(5, 0, 3), audit: R(5, 0, 5) }, hand).reasons.length === 4);

sec("3. run(): a small recipe, end to end");
const recipe = { runs: 2, iters: 12, seed: 2000, sigma: 0.3, maxK: 4 }, lines = [];
const a = T.run(recipe, (m) => lines.push(m)), b = T.run(recipe);
ok("the same recipe gives the same champion to the bit (same weights hash, same seed chosen, same scores)", weightsHash(a.champion.weights) === weightsHash(b.champion.weights) && a.champion.seed === b.champion.seed && a.champion.heldOut.score === b.champion.heldOut.score && a.champion.audit.score === b.champion.audit.score, `hash ${weightsHash(a.champion.weights)}, seed ${a.champion.seed}`);
ok("the champion is the run with the best HELD-OUT score (not the best train score), and the runs are listed best-first", a.runs.every((r, i, arr) => !i || arr[i - 1].heldOut.score >= r.heldOut.score) && a.champion.seed === a.runs[0].seed && a.champion.heldOut.score === a.runs[0].heldOut.score, a.runs.map((r) => `${r.seed}: train ${r.train.toFixed(2)} held-out ${r.heldOut.score.toFixed(2)}`).join(" | "));
const audit = P.evaluate(a.champion.weights, P.AUDIT_SEEDS);
ok("the audit is the champion's score on the AUDIT seeds, read once after the choice, and the hand pilot's is on the same seeds", a.champion.audit.score === audit.score && a.hand.audit.score === P.evaluate(P.handWeights(), P.AUDIT_SEEDS).score, P.describeEval(a.champion.audit));
ok("every run is PRUNED: at least one run ends with fewer weights differing from the hand pilot than its search moved, none with more, and the log says so", a.runs.every((r) => Number.isInteger(r.kept) && Number.isInteger(r.moved) && r.kept <= r.moved) && a.runs.some((r) => r.moved > 0 && r.kept < r.moved) && lines.some((l) => /pruned \d+ moved weights to \d+/.test(l)), a.runs.map((r) => `${r.moved}->${r.kept}`).join(", "));
ok("the log says what it did: the hand pilot's three scores, one line a run, the champion 'picked on held-out', and a verdict line", lines.length === 2 + recipe.runs + 1 && /hand pilot/.test(lines[0]) && lines.some((l) => /picked on held-out/.test(l)) && /QUALIFIES|DOES NOT QUALIFY/.test(lines[lines.length - 1]), `${lines.length} lines`);

// a recipe chosen BECAUSE the run that scores best on the train seeds is not the run that scores best on the held-out ones (restated at damage 6, v4896: seed 3017's
// runs 3018, 3019 and 3017 train to 18.58, 18.58 and 18.76 and hold out at 18.60, 18.60 and 17.79 -- the old seed 3002 now trains three identical runs, so it no longer splits them):
// the champion must be a held-out-best run, or "picked on held-out" is a sentence and not a rule
const sp = T.run({ runs: 3, iters: 12, seed: 3017, sigma: 0.3, maxK: 4 }), trainBest = [...sp.runs].sort((x, y) => y.train - x.train)[0];
ok("*** WHEN THE TRAIN-BEST RUN AND THE HELD-OUT-BEST RUN ARE DIFFERENT RUNS, THE CHAMPION IS THE HELD-OUT-BEST ONE ***", trainBest.seed !== sp.champion.seed && sp.champion.heldOut.score === Math.max(...sp.runs.map((r) => r.heldOut.score)) && trainBest.heldOut.score < sp.champion.heldOut.score, `train-best seed ${trainBest.seed} (train ${trainBest.train.toFixed(2)}, held-out ${trainBest.heldOut.score.toFixed(2)}); champion seed ${sp.champion.seed} (held-out ${sp.champion.heldOut.score.toFixed(2)})`);

sec("4. the file it writes");
const fake = { hand: a.hand, champion: { ...a.champion, weights: P.handWeights(), kept: 0, moved: 0 }, verdict: { ok: true, reasons: [] } };
const blob = T.blobOf({ ...fake, champion: { ...fake.champion, heldOut: R(9.9, 5, 0), audit: R(11.0, 20, 0), kept: 97 } }, { ...recipe, runs: 5, iters: 1500 });
const imp = PB.importBrain(PB.describePolicy(T.POLICY_ID, P), blob);
ok("the blob is a swek-brain-v1 file for pilot6dofPolicy with 930 weights that the importer the page uses accepts", blob.format === "swek-brain-v1" && blob.policy === "pilot6dofPolicy" && blob.weightCount === 930 && imp.ok, imp.ok ? "" : imp.reason);
ok("the plane pilot's importer refuses it by name (a blob of one policy cannot be taken for another)", PB.importBrain(PB.describePolicy("pilotPolicy", PP), blob).ok === false);
ok("`by` records the recipe, the champion's seed and the count of weights that differ from the hand pilot, and quotes the held-out and audit it was graded on", /seed \d+ of 5 runs/.test(blob.by) && /97 of the 930 weights differ/.test(blob.by) && blob.by.includes(P.describeEval(R(9.9, 5, 0))) && blob.by.includes(P.describeEval(R(11.0, 20, 0))) && blob.score === 9.9, blob.by.slice(0, 160));

sec("5. the command line writes only what qualifies");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t6-")), out = path.join(tmp, "p.json"), tool = path.join(ENG, "tools", "ship", "trainPilot6dof.mjs");
const shipped = path.join(ENG, "brain", "pilot6dofWeightsDefault.json"), mtime0 = fs.existsSync(shipped) ? fs.statSync(shipped).mtimeMs : null;
const run1 = spawnSync(process.execPath, [tool, "--runs", "1", "--iters", "5", "--quiet", "--out", out], { encoding: "utf8", timeout: 120000 });
ok("without --write nothing is written (neither the --out file nor the shipped one)", run1.status === 0 && !fs.existsSync(out) && (mtime0 === null || fs.statSync(shipped).mtimeMs === mtime0), `exit ${run1.status}`);
const run2 = spawnSync(process.execPath, [tool, "--runs", "1", "--iters", "5", "--quiet", "--write", "--out", out], { encoding: "utf8", timeout: 120000 });
ok("with --write but a champion that does not beat the hand pilot (5 iterations cannot), it exits 1, says why, and writes NOTHING", run2.status === 1 && !fs.existsSync(out) && /not written/.test(run2.stdout), `exit ${run2.status}: ${run2.stdout.trim().slice(0, 100)}`);
const run3 = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
ok("an unknown option exits 2 before any training", run3.status === 2 && /unknown option/.test(run3.stderr), run3.stderr.trim().slice(0, 80));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fails ? `\ntrain6dofPilot-selfcheck: ${fails} FAILED` : "\ntrain6dofPilot-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
