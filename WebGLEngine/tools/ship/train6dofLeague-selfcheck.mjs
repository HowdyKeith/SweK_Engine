// WebGLEngine/tools/ship/train6dofLeague-selfcheck.mjs -- v4847 (beside tools/ship/train6dofLeague.mjs)
//
// Run: node tools/ship/train6dofLeague-selfcheck.mjs
//
// GRADES THE TOOL THAT TRAINS THE SPACE-BATTLE PILOT AGAINST ITSELF, NOT THE PILOT (brain/pilot6dofPolicy-selfcheck.mjs section 7 holds the shipped league file to what it claims). The tool's whole value is that it cannot
// flatter itself, and a pilot judged against its own ancestor has more ways to than one judged against a fixed autopilot: the duel favours the side that acts first (a pilot against a copy of itself wins 8, loses 2 and
// draws 10 of 20 from side A), so every game here is played from BOTH sides; the audit seeds are ones nothing has read; and the pilot must not have bought its lead over the shipped pilot with a regression against the PD
// autopilot. So this gate holds: the argument parser refuses what it does not know; the qualification rule on a table of made-up results (each clause is the only thing that fails in its row, and the boundaries are held);
// run() on a recipe small enough to finish in seconds -- deterministic to the bit, the champion picked on the held-out league score and not the train score, the audit read once after the choice, every search pruned
// toward the shipped pilot; a search in its own process is the same search to the bit, and `--workers` gives the sequential answer; the blob it writes (right format, round-trips through the importer the page uses,
// quotes the numbers it was graded on); and the command line (it writes nothing without --write and nothing when the champion does not qualify).
//
// SABOTAGES, v4847, eighteen (each broken in place, the gate run in a scratch checkout, the file restored; reds are rows, `grep -c '^  FAIL'`). NONE WENT 0 RED ON ITS FIRST RUN -- BUT THREE OF THE ROWS THAT CATCH THEM WERE
// ADDED AFTER THE FIRST DRAFT OF THIS GATE, BEFORE ANY SABOTAGE, BECAUSE WRITING THE SABOTAGE PLAN SHOWED THE DRAFT COULD NOT SEE THEM (reasoned, not observed as 0-reds): J (a search started from the PD autopilot instead
// of the shipped pilot: nothing in a six-iteration run distinguishes the two, so a zero-iteration search must now return the shipped pilot to the bit), P (`--workers` ignored: the answer is the same, so the report must now show
// the parent's per-search timing lines, which only child processes produce) and M (the ancestor's hash left out of `by`). The prune row was also given a second recipe, because on the smallest one every search ends AT the
// shipped pilot (kept 0) and "the weights that differ are exactly `kept`" held vacuously.
//   A  parseArgs reads past an unknown option                                   2 red (the refusal row; the unknown-option command line)
//   B  qualifies: the lead floor loosened to any lead                           1 red (the floor-at-its-edge row: 7 games must fail, 8 qualify)
//   C  qualifies: the mirror-score clause dropped                               2 red (the equal-is-not-better row; the worse-in-every-way row)
//   D  qualifies: the held-out clause dropped                                   2 red (the held-out row; the worse-in-every-way row)
//   E  qualifies: the PD-autopilot-losses clause dropped                        2 red (the autopilot-losses row; the worse-in-every-way row)
//   F  qualifies: the PD-autopilot score slack widened 0.5 -> 5                 3 red (the slack-boundary row, the constant, the worse-in-every-way row)
//   G  finish(): the champion picked on TRAIN score, not the held-out league score  1 red (*** the train-best-is-not-the-champion row: the recipe where the two differ ***)
//   H  finish(): the audit read on the held-out seeds                           1 red (the audit row)
//   I  searchOne(): pruned toward the PD autopilot, not the shipped pilot       3 red (the pruned-toward-the-shipped-pilot row, the zero-iteration row, the `--one` row)
//   J  searchOne(): started from the PD autopilot, not the shipped pilot        2 red (the zero-iteration row; the `--one` row)
//   K  the league without the PD autopilot                                      2 red (the held-out-score-is-the-league-score row, the log row)
//   L  blobOf(): `score` is the audit score, not the held-out one               1 red (the blob row)
//   M  blobOf(): the ancestor's hash left out of `by`                           1 red (the blob row)
//   N  CLI: --write writes a champion that does not qualify                     1 red (the CLI row)
//   O  RECIPE: 800 iterations -> 700                                            1 red (the recorded-recipe row)
//   P  CLI: --workers ignored (always sequential)                               1 red (the `--workers` row)
//   Q  parseArgs: --train out of range accepted                                 1 red (the --train row)
//   R  finish(): the baseline is the shipped pilot against the PD autopilot, not against itself  2 red (the baseline-is-exactly-even row, the audit row)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as T from "./train6dofLeague.mjs";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as PP from "../../brain/pilotPolicy.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const J = (x) => JSON.stringify(x);

sec("1. the argument parser");
const d0 = T.parseArgs([]);
ok("no arguments is the recorded recipe: 4 runs x 800 iterations, seed 4000, sigma 0.3, 1-4 weights a child, 48 train seeds, one worker, no write", d0.runs === 4 && d0.iters === 800 && d0.seed === 4000 && d0.sigma === 0.3 && d0.maxK === 4 && d0.train === 48 && d0.workers === 1 && d0.one === null && d0.write === false && d0.out === T.DEFAULT_OUT, J({ ...d0, out: path.basename(d0.out) }));
ok("RECIPE is that recorded recipe, frozen; the default output is the file the page will fetch and the shipped pilot being improved on is the one the 6DOF page already ships", Object.isFrozen(T.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK", "train"].every((k) => d0[k] === T.RECIPE[k]) && path.basename(T.DEFAULT_OUT) === "pilot6dofWeightsLeague.json" && path.basename(T.PREVIOUS_FILE) === "pilot6dofWeightsDefault.json" && T.POLICY_ID === "pilot6dofPolicy", J(T.RECIPE));
const d1 = T.parseArgs(["--runs", "3", "--iters", "50", "--train", "12", "--workers", "2", "--write", "--out", "x.json", "--quiet"]);
ok("every option is read: --runs, --iters, --seed, --sigma, --train, --workers, --one, --out, --write, --quiet", d1.runs === 3 && d1.iters === 50 && d1.train === 12 && d1.workers === 2 && d1.write && d1.quiet && d1.out === "x.json" && T.parseArgs(["--seed", "9", "--sigma", "0.1"]).seed === 9 && T.parseArgs(["--one", "2"]).one === 2);
const e1 = throws(() => T.parseArgs(["--bogus"])), e2 = throws(() => T.parseArgs(["--runs"])), e3 = throws(() => T.parseArgs(["--runs", "many"])), e4 = throws(() => T.parseArgs(["stray"]));
ok("an unknown option, a missing value, a non-number and a stray argument are each REFUSED with the reason (a typo must not silently train the default recipe)", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /--runs needs a number/.test(e3) && /unexpected argument "stray"/.test(e4), [e1, e2, e3, e4].map((x) => String(x).slice(0, 40)).join(" | "));
ok("--train outside 1..48 is refused (there are 48 league train seeds; asking for more would silently train on fewer)", /--train must be 1\.\.48, got 0/.test(throws(() => T.parseArgs(["--train", "0"]))) && /--train must be 1\.\.48, got 49/.test(throws(() => T.parseArgs(["--train", "49"]))) && T.parseArgs(["--train", "48"]).train === 48);

sec("2. qualifies(): the only door to a written file");
const R = (score, wins, losses) => ({ score, wins, losses, draws: 80 - wins - losses });
const good = { audit: { vsPrev: R(8.6, 30, 10), mirror: R(7.35, 18, 18) }, heldOut: { vsPrev: R(8.1, 9, 3) }, auto: { champ: R(10.95, 39, 0), prev: R(11, 39, 0) } };
const only = (mut) => T.qualifies({ audit: { ...good.audit, ...(mut.audit || {}) }, heldOut: { ...good.heldOut, ...(mut.heldOut || {}) }, auto: { ...good.auto, ...(mut.auto || {}) } });
ok("a champion leading the shipped pilot by the floor or more on the audit, scoring above its mirror, leading on the held-out seeds, with no more losses and no worse a score against the PD autopilot, qualifies, with no reason against it", T.qualifies(good).ok && T.qualifies(good).reasons.length === 0 && T.LEAD_FLOOR === 8 && T.REGRESSION_SLACK === 0.5);
const q1 = only({ audit: { vsPrev: R(8.6, 25, 18), mirror: good.audit.mirror } }), q1b = only({ audit: { vsPrev: R(8.6, 26, 18), mirror: good.audit.mirror } });
ok("THE FLOOR IS HELD AT ITS EDGE: a lead of 7 games over the 80 audit games fails on the lead alone; exactly 8 qualifies", !q1.ok && q1.reasons.length === 1 && /leads the shipped pilot by 7 games/.test(q1.reasons[0]) && q1b.ok, q1.reasons.join("; "));
const q2 = only({ audit: { vsPrev: R(7.35, 30, 10), mirror: good.audit.mirror } });
ok("EQUAL IS NOT BETTER: an audit score equal to the shipped pilot's own mirror score fails on that alone, however many games it won", !q2.ok && q2.reasons.length === 1 && /does not beat the shipped pilot's own/.test(q2.reasons[0]), q2.reasons.join("; "));
const q3 = only({ heldOut: { vsPrev: R(8.1, 5, 5) } }), q3b = only({ heldOut: { vsPrev: R(8.1, 5, 6) } });
ok("an even or negative held-out record against the shipped pilot fails on that alone", !q3.ok && q3.reasons.length === 1 && /held-out/.test(q3.reasons[0]) && !q3b.ok && q3b.reasons.length === 1, q3.reasons.join("; "));
const q4 = only({ auto: { champ: R(10.9, 38, 1), prev: good.auto.prev } });
ok("one more loss against the PD autopilot than the shipped pilot has fails on that alone (a pilot that beats its ancestor by giving up ground to the baseline is not shipped)", !q4.ok && q4.reasons.length === 1 && /loses 1 games where the shipped pilot loses 0/.test(q4.reasons[0]), q4.reasons.join("; "));
const q5 = only({ auto: { champ: R(10.49, 39, 0), prev: good.auto.prev } }), q5b = only({ auto: { champ: R(10.5, 39, 0), prev: good.auto.prev } });
ok("a score against the PD autopilot more than 0.5 under the shipped pilot's fails on that alone (0.51 under); exactly 0.5 under is allowed", !q5.ok && q5.reasons.length === 1 && /more than 0\.5 under/.test(q5.reasons[0]) && q5b.ok, q5.reasons.join("; "));
const bad = T.qualifies({ audit: { vsPrev: R(5, 10, 30), mirror: R(7.35, 18, 18) }, heldOut: { vsPrev: R(5, 1, 6) }, auto: { champ: R(8, 30, 5), prev: good.auto.prev } });
ok("a champion worse in every way fails with all five reasons, so the output says everything that is wrong", !bad.ok && bad.reasons.length === 5, String(bad.reasons.length));

sec("3. run(): a small recipe, end to end");
const prev = T.previousWeights();
ok("the shipped pilot is read through the importer the page uses (930 finite weights), and the 6DOF page's other pilot files do not stand in for it", prev.length === 930 && Array.from(prev).every(Number.isFinite) && weightsHash(prev) === weightsHash(PB.importBrain(PB.describePolicy("pilot6dofPolicy", P), JSON.parse(fs.readFileSync(T.PREVIOUS_FILE, "utf8"))).weights), `hash ${weightsHash(prev)}`);
const recipe = { runs: 2, iters: 6, seed: 4000, sigma: 0.3, maxK: 4, train: 6 }, lines = [];
const a = T.run(recipe, (m) => lines.push(m)), b = T.run(recipe);
ok("the same recipe gives the same champion to the bit (same weights hash, same seed chosen, same scores)", weightsHash(a.champion.weights) === weightsHash(b.champion.weights) && a.champion.seed === b.champion.seed && a.champion.audit.vsPrev.score === b.champion.audit.vsPrev.score && a.champion.held.score === b.champion.held.score, `hash ${weightsHash(a.champion.weights)}, seed ${a.champion.seed}`);
ok("the champion is the run with the best HELD-OUT league score, and the runs are listed best-first", a.runs.every((r, i, arr) => !i || arr[i - 1].held.score >= r.held.score) && a.champion.seed === a.runs[0].seed && a.champion.held.score === a.runs[0].held.score, a.runs.map((r) => `${r.seed}: train ${r.trainScore.toFixed(2)} held-out ${r.held.score.toFixed(2)}`).join(" | "));
const heldLeague = P.evaluate(a.champion.weights, P.LEAGUE_HELD_OUT_SEEDS, { opponent: ["autopilot", prev] });
ok("the held-out score is the league score (the PD autopilot AND the shipped pilot, both sides, the 24 held-out seeds) -- the objective the search trained on, on seeds it did not", a.champion.held.score === heldLeague.score && heldLeague.runs.length === 2 * 2 * 24, `${heldLeague.runs.length} games`);
const auditCheck = P.evaluate(a.champion.weights, P.LEAGUE_AUDIT_SEEDS, { opponent: [prev] }), mirrorCheck = P.evaluate(prev, P.LEAGUE_AUDIT_SEEDS, { opponent: [prev] });
ok("!! the audit is the champion's record against the shipped pilot on the 40 AUDIT seeds from BOTH sides (80 games), read once after the choice; the baseline is the shipped pilot against itself on the same games", a.champion.audit.vsPrev.score === auditCheck.score && auditCheck.runs.length === 80 && a.champion.audit.mirror.score === mirrorCheck.score, cmpLine(auditCheck));
ok("!! the baseline is exactly even: the shipped pilot against itself over both sides wins as many games as it loses (by symmetry), so a champion's lead over it is a lead over a fair coin and not over the side advantage", mirrorCheck.wins === mirrorCheck.losses && mirrorCheck.wins > 0, `${mirrorCheck.wins} won, ${mirrorCheck.losses} lost`);
// the first recipe above is too small to leave anything standing after the prune (every search ends at the shipped pilot: kept 0, which would hold the row below vacuously); this one moves a few weights that stay
const REAL = { runs: 2, iters: 30, seed: 4001, sigma: 0.3, maxK: 4, train: 8 }, rl = [], rr = T.run(REAL, (m) => rl.push(m));
ok("every search is PRUNED TOWARD THE SHIPPED PILOT: on a recipe that leaves weights standing (" + rr.runs.map((r) => `${r.moved} moved -> ${r.kept} kept`).join(", ") + ") the weights that differ from the shipped pilot are exactly `kept`, each is more than none and fewer than moved, and the log says so; on the smallest recipe every search ends AT the shipped pilot", rr.runs.every((r) => r.kept > 0 && r.kept < r.moved && Array.from(r.weights).filter((v, i) => Math.abs(v - prev[i]) > 1e-6).length === r.kept) && rl.some((l) => /pruned \d+ moved weights to [1-9]/.test(l)) && a.runs.every((r) => r.kept <= r.moved && Array.from(r.weights).filter((v, i) => Math.abs(v - prev[i]) > 1e-6).length === r.kept), rr.runs.map((r) => `${r.moved} -> ${r.kept}`).join(", "));
ok("the log says what it did: the shipped pilot's own records, one line a run, the champion 'picked on the held-out league score', and a verdict line", lines.length === 1 + recipe.runs + 2 && /shipped pilot/.test(lines[0]) && lines.some((l) => /picked on the held-out league score/.test(l)) && /QUALIFIES|DOES NOT QUALIFY/.test(lines[lines.length - 1]), `${lines.length} lines`);

{
    const zero = T.searchOne({ runs: 1, iters: 0, seed: 4000, sigma: 0.3, maxK: 4, train: 2 }, 0, prev);
    ok("!! A SEARCH STARTS FROM THE SHIPPED PILOT, NOT FROM THE PD AUTOPILOT: with no iterations it returns the shipped pilot untouched -- the same weights to the bit, nothing moved, nothing kept -- and the one weight the hand pilot and the shipped pilot differ on is not a difference it reports", weightsHash(zero.weights) === weightsHash(prev) && zero.moved === 0 && zero.kept === 0 && zero.improved === 0 && weightsHash(prev) !== weightsHash(P.handWeights()), `hash ${weightsHash(zero.weights)}`);
}

// a recipe chosen BECAUSE the search with the best TRAIN score is not the one with the best HELD-OUT league score: the champion must be the second, or "picked on held-out" is a sentence and not a rule
const DISC = { runs: 3, iters: 8, seed: 4000, sigma: 0.6, maxK: 6, train: 4 };
{
    const prevW = T.previousWeights(), searches = Array.from({ length: DISC.runs }, (_, k) => T.searchOne(DISC, k, prevW)), sp = T.finish(DISC, searches, () => {}, prevW);
    const trainBest = [...sp.runs].sort((x, y) => y.trainScore - x.trainScore)[0];
    ok("*** WHEN THE TRAIN-BEST SEARCH AND THE HELD-OUT-BEST SEARCH ARE DIFFERENT SEARCHES, THE CHAMPION IS THE HELD-OUT-BEST ONE ***", trainBest.seed !== sp.champion.seed && sp.champion.held.score === Math.max(...sp.runs.map((r) => r.held.score)) && trainBest.held.score < sp.champion.held.score, `train-best seed ${trainBest.seed} (train ${trainBest.trainScore.toFixed(2)}, held-out ${trainBest.held.score.toFixed(2)}); champion seed ${sp.champion.seed} (held-out ${sp.champion.held.score.toFixed(2)})`);
}
function cmpLine(r) { return P.describeEval(r); }

sec("4. a search in its own process is the same search");
{
    const tool = path.join(ENG, "tools", "ship", "trainLeague6dof.mjs"), args = ["--runs", "2", "--iters", "6", "--train", "6", "--seed", "4000"];
    const child = (k) => spawnSync(process.execPath, [tool, ...args, "--one", String(k)], { encoding: "utf8", timeout: 120000 });
    const c0 = child(0), c1 = child(1), line = (c) => (c.stdout || "").split("\n").find((l) => l.startsWith("SEARCH "));
    const w0 = line(c0) && JSON.parse(line(c0).slice(7)), w1 = line(c1) && JSON.parse(line(c1).slice(7));
    ok("!! `--one K` runs search K and prints it as one line of JSON, and the weights it prints are the in-process search's to the bit (a float32 round-trips through JSON exactly)", c0.status === 0 && c1.status === 0 && !!w0 && !!w1 && w0.seed === 4000 && w1.seed === 4001 && weightsHash(Float32Array.from(w0.weights)) === weightsHash(a.runs.find((r) => r.seed === 4000).weights) && weightsHash(Float32Array.from(w1.weights)) === weightsHash(a.runs.find((r) => r.seed === 4001).weights), `${w0 ? w0.moved + " -> " + w0.kept : "no result"}`);
    const par = spawnSync(process.execPath, [tool, ...args, "--workers", "2"], { encoding: "utf8", timeout: 180000 }), seq = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8", timeout: 180000 });
    const keep = (s) => (s || "").split("\n").filter((l) => !/^  search \d+\/\d+ \(seed \d+\) done in/.test(l)).join("\n");
    ok("!! `--workers 2` gives the sequential answer: the report (every held-out score, the champion, the audit, the verdict) is identical line for line, apart from the parent's own timing lines (which are there for the parallel run and absent from the sequential one: the searches really ran in child processes)", par.status === 0 && seq.status === 0 && keep(par.stdout) === keep(seq.stdout) && /champion \(seed 400[01]/.test(par.stdout) && /search 1\/2 \(seed 4000\) done in/.test(par.stdout) && /search 2\/2 \(seed 4001\) done in/.test(par.stdout) && !/done in/.test(seq.stdout), ((par.stdout || par.stderr || "").split("\n").filter((l) => /champion/.test(l))[0] || "no champion line").slice(0, 90));
}

sec("5. the file it writes");
const fake = { previous: a.previous, previousHash: a.previousHash, champion: { ...a.champion, weights: prev, kept: 17, differsFromHand: 61, audit: { vsPrev: R(8.6, 30, 10), mirror: R(7.35, 18, 18), vsAuto: R(11, 40, 0) }, auto: { champ: R(10.9, 39, 0), prev: R(10.94, 39, 0) } }, verdict: { ok: true, reasons: [] } };
const blob = T.blobOf(fake, { ...recipe, runs: 4, iters: 800, seed: 4000, train: 48 });
const imp = PB.importBrain(PB.describePolicy(T.POLICY_ID, P), blob);
ok("the blob is a swek-brain-v1 file for pilot6dofPolicy with 930 weights that the importer the page uses accepts, and the plane pilot's importer refuses it by name (a blob of one policy cannot be taken for another)", blob.format === "swek-brain-v1" && blob.policy === "pilot6dofPolicy" && blob.weightCount === 930 && imp.ok && PB.importBrain(PB.describePolicy("pilotPolicy", PP), blob).ok === false, imp.ok ? "" : imp.reason);
ok("`by` records the shipped pilot it descends from BY HASH, the recipe, the champion's seed, the count of weights that differ from the shipped pilot AND from the PD autopilot, the seed ranges of all four sets, and quotes the audit against the shipped pilot, its mirror, and the PD-autopilot comparison it was graded on",
    /seed \d+ of 4 runs \(4000\.\.4003\)/.test(blob.by) && /17 of the 930 weights differ from it and 61 from the PD autopilot/.test(blob.by) && blob.by.includes("from the shipped pilot " + a.previousHash + " (") && a.previousHash === weightsHash(prev) && blob.by.includes("[201..248]") && blob.by.includes("[301..324]") && blob.by.includes("[401..440]") && blob.by.includes("[41..60]") &&
    blob.by.includes(P.describeEval(R(8.6, 30, 10))) && blob.by.includes(P.describeEval(R(10.9, 39, 0))) && /against itself scores 7\.35 there/.test(blob.by) && blob.score === Number(fake.champion.held.score.toFixed(3)) && blob.score !== 8.6, `score ${blob.score} (the held-out league score, not the audit's 8.6)`);

sec("6. the command line writes only what qualifies");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tl-")), out = path.join(tmp, "p.json"), tool = path.join(ENG, "tools", "ship", "trainLeague6dof.mjs");
const shipped = path.join(ENG, "brain", "pilot6dofWeightsLeague.json"), mtime0 = fs.existsSync(shipped) ? fs.statSync(shipped).mtimeMs : null;
const small = ["--runs", "1", "--iters", "3", "--train", "4", "--quiet", "--out", out];
const run1 = spawnSync(process.execPath, [tool, ...small], { encoding: "utf8", timeout: 120000 });
ok("without --write nothing is written (neither the --out file nor the shipped one)", run1.status === 0 && !fs.existsSync(out) && (mtime0 === null || fs.statSync(shipped).mtimeMs === mtime0), `exit ${run1.status}`);
const run2 = spawnSync(process.execPath, [tool, ...small, "--write"], { encoding: "utf8", timeout: 120000 });
ok("with --write but a champion that does not lead the shipped pilot (3 iterations cannot), it exits 1, says why, and writes NOTHING", run2.status === 1 && !fs.existsSync(out) && /not written/.test(run2.stdout), `exit ${run2.status}: ${run2.stdout.trim().slice(0, 100)}`);
const run3 = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
ok("an unknown option exits 2 before any training", run3.status === 2 && /unknown option/.test(run3.stderr), run3.stderr.trim().slice(0, 80));
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fails ? `\ntrain6dofLeague-selfcheck: ${fails} FAILED` : "\ntrain6dofLeague-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
