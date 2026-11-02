// WebGLEngine/tools/ship/train6dofMlp-selfcheck.mjs
//
// Run: node tools/ship/train6dofMlp-selfcheck.mjs      (~30 s)
//
// THE GATE OF tools/ship/train6dofMlp.mjs (and its command, tools/ship/trainMlp6dof.mjs): the GPU Brain's space-duel pilot trained by the fruit fly's Default recipe, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
// *** NOTHING HERE FLIES A REGISTERED AUDIT OR H2 SEED. *** Every run below is handed seeds from 99000 up, outside every block, so the registered sets are read once, by the registered run.
//
//   1  THE REGISTRATION, AS CODE: the recipe is the fruit fly's with only the search seeds changed; the audit (6101-6120) and H2 (6201-6240) seeds are fresh, apart, and clear of every block a 6-DOF tool or gate had flown;
//      qualifies() IS train6dofPilot's, LEAD_FLOOR IS train6dofLeague's, and H2's reading is the registered rule at its edges
//   2  THE ROUND ON A MINIATURE (two searches of 30 iterations, scratch seeds): C-twin first, the champion picked on held-out, the verdict qualifies() of the champion against its hand twin, C-determinism by a second search,
//      H2 not read when H1 is not met, and the registered-seeds flag false; the head-to-head on scratch seeds: both sides, LEAD = wins - losses, the fruit fly's mirror beside it
//   3  the fruit fly's Default is the registered one (hash 215e26d9) through the page's importer; the brain file round-trips and the fruit fly's importer refuses it
//   4  THE COMMAND: it never overwrites a results file, prints no score, writes the weight file only from a results file whose champion qualified, and refuses an option it does not know
//
// SABOTAGE LOG (2026-11-02) -- each applied with the byte-safe runner, this gate, brain/pilot6dofMlp-selfcheck.mjs and brain/pilot6dofPolicy-selfcheck.mjs run, the file restored byte-identical (sha256); the
// number is the rows that went red, by name:
//   T1 the recipe at 1000 iterations 1 | T2 the audit on a gate's block (1101..) 1 | T4 C-determinism not re-run 1 | T5 the head-to-head from one side 1 | T6 H2's reading with > at the edge 1
//   T7 H2 read whatever the verdict 3 | T8 the Default's hash not checked 2 | T9 C-twin passing every seed 1 | C1b the overwrite guard refusing nothing 2 | C1 the command not calling it 1
//   C2 the weight file written whatever the verdict 1
//   T3 the champion picked on train score: *** 0 RED ON THE FIRST DRAFT, A FINDING ***: the miniature's two searches tied on held-out, so either order picked the same one. A planted pair whose train and held-out orders
//      disagree now holds the pick: re-run, 1 red.
//   *** AND THE FIRST C1 STARTED THE REGISTERED ROUND. *** The first draft of section 4 ran the command against an existing file to watch it refuse; with the guard sabotaged away it did not refuse, and the child began
//   the registered round: it flew the hand twin on the registered audit seeds (6101-6120) before the runner's 900 s timeout killed this gate. Its output went to a pipe nobody read, the command prints no score, and its
//   grandchild was found still running and killed before it wrote anything (its results file was still the planted 3 bytes, deleted unread). Nothing of it was printed, stored or seen; the hand twin's audit is
//   deterministic and is what the registered run computes again. The guard is now a library function held here directly, and this gate never starts a run; the runner kills a timed-out gate's process group.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as T from "./train6dofMlp.mjs";
import * as FLY from "./train6dofPilot.mjs";
import * as LEAGUE from "./train6dofLeague.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);

console.log("1. THE REGISTRATION, AS CODE");
{
    const same = ["runs", "iters", "sigma", "maxK"].every((k) => T.RECIPE[k] === FLY.RECIPE[k]);
    ok("!! the recipe is the fruit fly's Default recipe (5 runs x 1500 iterations, sigma 0.3, 1-4 weights a child) with ONLY the search seeds changed (7000 against 2000), frozen",
        same && T.RECIPE.seed === 7000 && FLY.RECIPE.seed === 2000 && Object.isFrozen(T.RECIPE) && T.RECIPE.runs === 5 && T.RECIPE.iters === 1500);
    const used = new Set(T.USED_DUEL_SEEDS), all = [...T.AUDIT_SEEDS, ...T.H2_SEEDS];
    ok("!! the audit is 20 fresh seeds (6101-6120) and H2 40 (6201-6240): apart from each other, and clear of every block a 6-DOF tool or gate had flown (train, held-out, audits, league, close, baseline, the gate's 900s, 1000s, 1100s)",
        T.AUDIT_SEEDS.length === 20 && T.AUDIT_SEEDS[0] === 6101 && T.AUDIT_SEEDS[19] === 6120 && T.H2_SEEDS.length === 40 && T.H2_SEEDS[0] === 6201 && T.H2_SEEDS[39] === 6240 &&
        new Set(all).size === all.length && all.every((s) => !used.has(s)) && used.has(1) && used.has(840) && used.has(923) && used.has(1039) && used.has(1111), `${used.size} used seeds`);
    ok("  ...and the train and held-out seeds ARE the fruit fly's own (the same fights to learn from and to choose on)", T.USED_DUEL_SEEDS.includes(P6.TRAIN_SEEDS[0]) && P6.TRAIN_SEEDS.length === 12 && P6.HELD_OUT_SEEDS.length === 8);
    ok("!! qualifies() IS tools/ship/train6dofPilot.mjs's (the rule the fruit fly's Default met) and LEAD_FLOOR IS tools/ship/train6dofLeague.mjs's", T.qualifies === FLY.qualifies && T.LEAD_FLOOR === LEAGUE.LEAD_FLOOR && T.LEAD_FLOOR === 8);
    ok("!! H2's reading is the registered rule at its edges: a lead of 8 is GPU better, 7 and -7 show no difference, -8 is fly better",
        T.h2Reading(8) === "GPU better" && T.h2Reading(7) === "no difference shown" && T.h2Reading(0) === "no difference shown" && T.h2Reading(-7) === "no difference shown" && T.h2Reading(-8) === "fly better");
}

console.log("\n2. THE ROUND ON A MINIATURE (scratch seeds only)");
{
    const opts = { runs: 2, iters: 30, seed: 99000, sigma: 0.3, maxK: 4, auditSeeds: range(99001, 6), h2Seeds: range(99101, 4) };
    let searched = [];
    const spy = async (seeds) => { searched.push([...seeds]); return seeds.map((seed) => T.searchOne({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK })); };
    const r = await T.run(opts, () => {}, spy);
    const best = [...r.searches].sort((a, b) => b.heldOut.score - a.heldOut.score || (b.heldOut.wins - b.heldOut.losses) - (a.heldOut.wins - a.heldOut.losses))[0];
    const noisy = T.twinCheck([1, 21], M.perturb(M.handWeights(), 0.05, (() => { let k = 7; return () => ((k = (k * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })()));
    ok("!! C-twin can fail: a hand MLP with noise in it is caught at the first seed, so the check is not vacuous", !noisy.ok && noisy.first === 1 && noisy.same < 2, JSON.stringify(noisy));
    ok("!! C-twin runs first and holds (20 of 20); then the hand twin's train, held-out and audit tallies; the searches are the recipe's seeds, in order", r.cTwin.ok && r.cTwin.same === 20 && r.hand && r.hand.audit && searched[0].join() === "99000,99001", searched.map((s) => s.join(",")).join(" | "));
    ok("!! the champion is the best HELD-OUT search, its verdict is qualifies() of the champion against the hand twin, read off the same tallies",
        r.champion.seed === best.seed && JSON.stringify(r.verdict) === JSON.stringify(T.qualifies(r.champion, r.hand)), `champion ${r.champion.seed}`);
    ok("!! C-determinism: the champion's search is run a second time and gives the same weights to the bit", searched.length === 2 && searched[1].join() === String(r.champion.seed) && r.cDeterminism.ok && r.cDeterminism.first === r.champion.hash);
    ok("  the run records that it did NOT use the registered seeds, the audit and H2 seeds it did use, and the champion's weights for the weight file", r.registeredSeeds === false && r.auditSeeds.join() === "99001,99006,6" && r.h2Seeds.join() === "99101,99104,4" && r.champion.weights.length === M.WEIGHT_COUNT);
    ok("  H2 is read only when the champion qualifies (here it did not, at 30 iterations)", r.verdict.ok ? !!r.h2.reading : /H1 not met/.test(r.h2.notRead), r.verdict.ok ? "qualified" : r.verdict.reasons[0]);
    // the pick, where train and held-out DISAGREE: two planted searches (the hand weights, made-up scores) -- a first draft's miniature had both searches tie on held-out, and picking on TRAIN went 0 red there (sabotage T3)
    const hw = Array.from(M.handWeights()), hh = weightsHash(M.handWeights());
    const planted = [{ seed: 1, weights: hw, hash: hh, train: 30, heldOut: { score: 18, wins: 0, losses: 0, draws: 8 } }, { seed: 2, weights: hw, hash: hh, train: 10, heldOut: { score: 19, wins: 1, losses: 0, draws: 7 } }];
    const rp = await T.run({ ...opts, runs: 2, seed: 1 }, () => {}, async (seeds) => seeds.map((sd) => planted.find((x) => x.seed === sd)));
    ok("!! where the train and held-out orders disagree, the champion is the HELD-OUT one (seed 2: held-out 19 against 18, train 10 against 30)", rp.champion.seed === 2, `champion ${rp.champion.seed}`);
    const h = T.headToHead(M.handWeights(), range(99201, 2));
    ok("!! the head-to-head plays the fruit fly's Default from both sides (2 seeds = 4 games), LEAD is wins minus losses and its reading is h2Reading(LEAD); the Default's own mirror is beside it",
        h.games === 4 && h.lead === h.vsFly.wins - h.vsFly.losses && h.reading === T.h2Reading(h.lead) && h.flyMirror.wins + h.flyMirror.losses + h.flyMirror.draws === 4, `lead ${h.lead}, ${h.reading}`);
    const src = T.run.toString();
    ok("  ...and run() reads it only behind the verdict", /result\.h2 = result\.verdict\.ok \? headToHead\(cw, h2Seeds\)/.test(src));
}

console.log("\n3. THE FRUIT FLY'S DEFAULT, AND THE BRAIN FILE");
{
    const fly = T.flyDefault();
    ok("  the fruit fly's Default comes through the page's importer and is the registered pilot (hash 215e26d9)", weightsHash(fly) === T.FLY_DEFAULT_HASH && T.FLY_DEFAULT_HASH === "215e26d9" && fly.length === P6.WEIGHT_COUNT);
    let wrong = null; try { T.flyDefault(path.join(HERE, "..", "..", "brain", "pilot6dofWeightsLeague.json")); } catch (e) { wrong = e.message; }
    ok("  ...and another fruit-fly pilot is REFUSED by its hash (the League file imports, and is not the registered Default)", /not the registered 215e26d9/.test(wrong || ""), wrong);
    const fake = { recipe: { runs: 5, iters: 1500, seed: 7000, sigma: 0.3, maxK: 4 }, hand: { audit: { score: 18 } },
                   champion: { seed: 7002, kept: 40, weights: Array.from(M.handWeights()), heldOut: { score: 20, wins: 5, losses: 0, draws: 3, hits: 1, hitsTaken: 1 }, audit: { score: 21, wins: 20, losses: 0, draws: 0, hits: 1, hitsTaken: 1 } } };
    const blob = T.blobOf(fake), back = PB.importBrain(PB.describePolicy(T.POLICY_ID, M), blob), other = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob);
    ok("  the weight file round-trips through peerBrain with its recipe in `by`, and the fruit fly's importer refuses it (another network)",
        back.ok && back.weights.every((v, i) => Object.is(v, M.handWeights()[i])) && !other.ok && /seed 7002 of 5 runs \(7000\.\.7004\)/.test(blob.by) && /40 of the 1637 weights/.test(blob.by), other.reason);
}

console.log("\n4. THE COMMAND");
{
    const cmd = path.join(HERE, "trainMlp6dof.mjs"), src = fs.readFileSync(cmd, "utf8"), code = src.replace(/\/\/.*$/gm, "");
    // *** THE OVERWRITE GUARD IS HELD WITHOUT EVER RUNNING THE COMMAND'S ROUND. *** A first draft executed the command against an existing file; with the guard sabotaged away, that started the REGISTERED round in
    // a child process (it flew the hand twin on the registered audit seeds before the runner's timeout killed the gate; the grandchild was found still running and killed, its file never written, nothing printed or read).
    // So the guard is a library function, held here directly, and the command is held to calling it before run(); the only executions below are refused before anything is flown.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlp6dof-"));
    const refused = T.refuseExisting("/any/r.json", () => true), passes = T.refuseExisting("/any/r.json", () => false);
    const order = code.indexOf("refuseExisting(opts.results)"), runAt = code.indexOf("await run(opts");
    let typo = ""; try { execFileSync(process.execPath, [cmd, "--iter", "3"], { encoding: "utf8", stdio: "pipe" }); } catch (e) { typo = String(e.stderr); }
    const notOk = path.join(tmp, "n.json"); fs.writeFileSync(notOk, JSON.stringify({ verdict: { ok: false, reasons: ["planted"] } }));
    let wrote = ""; try { execFileSync(process.execPath, [cmd, "--write-from", notOk, "--out", path.join(tmp, "w.json")], { encoding: "utf8", stdio: "pipe" }); } catch (e) { wrote = String(e.stdout); }
    ok("!! the command never overwrites a results file, refuses an option it does not know, and writes no weight file from a results file whose champion did not qualify",
        /never overwritten/.test(refused || "") && passes === null && order > 0 && runAt > order && /process\.exit\(2\)/.test(code.slice(order, order + 120)) && /unknown option "--iter"/.test(typo) && /not written: the champion did not qualify -- planted/.test(wrote) && !fs.existsSync(path.join(tmp, "w.json")));
    ok("  ...and it prints no score: the results go to the file, and the console says only where (the registration reads the committed file)",
        !/describeEval|\.score|heldOut\.|verdict\.ok \?/.test(code.replace(/result\.verdict && result\.verdict\.reasons|!result\.verdict \|\| !result\.verdict\.ok/g, "")) && /commit it before reading it/.test(code));
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the registered run itself -- node tools/ship/trainMlp6dof.mjs --workers 4 -- whose results file is committed before it is read.");
process.exit(fails ? 1 : 0);
