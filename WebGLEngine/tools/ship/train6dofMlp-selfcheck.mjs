// WebGLEngine/tools/ship/train6dofMlp-selfcheck.mjs
//
// Run: node tools/ship/train6dofMlp-selfcheck.mjs      (~9.8 s)
//
// THE GATE OF tools/ship/train6dofMlp.mjs (and its command, tools/ship/trainMlp6dof.mjs): the GPU Brain's space-duel pilot trained by the fruit fly's Default recipe, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
// *** SECTIONS 1-4 FLY NO REGISTERED AUDIT OR H2 SEED. *** Every run there is handed seeds from 99000 up, outside every block, so the registered sets were read once, by the registered run. Section 5 was written after
// that run's file was committed and read: it flies those seeds again, from the committed weights, to hold the file to the code. They are spent, and flying them again chooses nothing (the fruit fly's gate holds its
// Default the same way).
//
//   1  THE REGISTRATION, AS CODE: the recipe is the fruit fly's with only the search seeds changed; the audit (6101-6120) and H2 (6201-6240) seeds are fresh, apart, and clear of every block a 6-DOF tool or gate had flown;
//      qualifies() IS train6dofPilot's, LEAD_FLOOR IS train6dofLeague's, and H2's reading is the registered rule at its edges
//   2  THE ROUND ON A MINIATURE (two searches of 30 iterations, scratch seeds): C-twin first, the champion picked on held-out, the verdict qualifies() of the champion against its hand twin, C-determinism by a second search,
//      H2 not read when H1 is not met, and the registered-seeds flag false; the head-to-head on scratch seeds: both sides, LEAD = wins - losses, the fruit fly's mirror beside it
//   3  the fruit fly's Default is the registered one (hash 215e26d9) through the page's importer; the brain file round-trips and the fruit fly's importer refuses it
//   4  THE COMMAND: it never overwrites a results file, prints no score, writes the weight file only from a results file whose champion qualified, and refuses an option it does not know
//   5  THE VERDICT, AS CODE, FROM THE COMMITTED FILE (brain/sixdofGpuBrainResults.json, committed unread at 42e8a0c1): the file is the registered run; C-twin and C-determinism held; the champion is the rule's pick
//      and its weights are the champion; the champion's and the hand twin's tallies, H2 and the reported head-to-heads re-flown from the weights to the last digit, and H2 again game by game; H1 met and H2 fly
//      better by the registered rules; the four predictions as the file decides them; the note's verdict tied to the file; the weight file is blobOf(the file)
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
//
// SABOTAGE LOG, SECTION 5 (2026-11-02, after the verdict) -- the same runner, with the committed results file, the note, the weight file or the library edited and this gate run; every file restored byte-identical:
//   V1 the file not flagged as the registered seeds 1 | V2 the recipe at 1499 iterations 2 | V3 C-twin 19 of 20 1 | V4 the champion named as seed 7001 3 | V5 a kept champion weight put back to its hand value 7
//   V6 the verdict not ok 3 | V7 C-determinism a different hash 1 | V8 H2 read as no difference 4 | V10 the champion's audit at 15 wins 4 | V11 the hand twin's audit score 18.6 2 | V12 the Default's mirror at 61 draws 2
//   V13 the champion against the autopilot at 19 wins 2 | V14 the champion's search at 24 improvements 2 | V15 the champion kept 30 5 | V20 the weight file's score changed 1 | V21 h2Reading's fly-better floor ten times wider 3
//   V9 H2's LEAD at -7: *** 2 RED ON THE FIRST RUN, NOT THE 3 PREDICTED -- A FINDING ***: the note-tie row found "LEAD is -7" inside the note's "LEAD is -70". A fragment must now stand alone, with no digit touching
//      either end: re-run, 3 red. V16 the note saying P2 right, V17 the note's H2 tally drifted, V18 a cell of the note's table drifted and V19 the note's game-by-game hits drifted went 1 red each before the fix and
//      after it; V22 (a digit after the note's LEAD: -700) and V23 (a digit before its kept count: 129) hold the two ends, 1 red each.
//   And the capability map's new cell (brain/capabilityMap-selfcheck.mjs): M1 its quote not in the note 3 | M2 the cell back to not built 3.
//   FOUND 2026-11-03, writing Round 3's verdict (tools/ship/train6dofMlpClose-selfcheck.mjs): the note-tie row read from "## The verdict" to the END of the note, so the verdicts of the rounds
//   after it answered for its fragments -- S1, the note saying this round's P1 wrong, went 0 red, Rounds 2 and 3 each saying "**P1: right.**" below it. The row now reads its own section alone
//   (up to the next "## " heading): S1 again, 1 red, by the row's name.
"use strict";
import "../../physics/mechanics/rigidBody6dofEuler.mjs";   // 2026-11-04 -- the 6-DOF numbers this gate holds were measured under the first-order orientation step, so it flies that step (see that file)
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
        /never overwritten/.test(refused || "") && passes === null && order > 0 && runAt > order && /process\.exit\(2\)/.test(code.slice(order, order + 120)) && /unknown option "?--iter"?/.test(typo) && /not written: the champion did not qualify -- planted/.test(wrote) && !fs.existsSync(path.join(tmp, "w.json")));
    ok("  ...and it prints no score: the results go to the file, and the console says only where (the registration reads the committed file)",
        !/describeEval|\.score|heldOut\.|verdict\.ok \?/.test(code.replace(/result\.verdict && result\.verdict\.reasons|!result\.verdict \|\| !result\.verdict\.ok/g, "")) && /commit it before reading it/.test(code));
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\n5. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (brain/sixdofGpuBrainResults.json, committed unread at 42e8a0c1)");
{
    // Written AFTER the file was read. Every number the note's verdict states is re-derived here from the file -- and the tallies are re-flown from the weights in it, so the file is held to the code at this head.
    // The registered audit and H2 seeds are flown again below: they were read once, by the registered run, and are spent; flying them again chooses nothing (the fruit fly's gate holds its Default the same way).
    const R = JSON.parse(fs.readFileSync(T.DEFAULT_RESULTS, "utf8")), c = R.champion, cw = Float32Array.from(c.weights), hand = M.handWeights(), h = R.h2;
    const tally = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken }), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const wl = (r) => `W${r.wins}/L${r.losses}/D${r.draws}`;
    ok("!! the file is the registered run: the registered recipe, the registered audit (6101-6120) and H2 (6201-6240) seeds and flagged so, five searches on seeds 7000-7004 in order, not stopped",
        R.registration === "brain/SIXDOF_GPU_BRAIN_WIP.md" && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => R.recipe[k] === T.RECIPE[k]) && R.registeredSeeds === true &&
        R.auditSeeds.join() === "6101,6120,20" && R.h2Seeds.join() === "6201,6240,40" && R.searches.map((s) => s.seed).join() === "7000,7001,7002,7003,7004" && !R.stopped, JSON.stringify(R.recipe));
    ok("!! C-twin held: the hand MLP flew the fruit fly's hand pilot to the bit on all 20 train and held-out seeds", R.cTwin.ok === true && R.cTwin.same === 20 && R.cTwin.of === 20 && R.cTwin.first === null);
    const pick = [...R.searches].sort((a, b) => b.heldOut.score - a.heldOut.score || (b.heldOut.wins - b.heldOut.losses) - (a.heldOut.wins - a.heldOut.losses))[0];
    ok("!! the champion is the search the rule picks from the file's own five (best held-out score, then held-out wins minus losses): seed 7002, and it IS that search -- its hash, held-out tally, weights moved and kept",
        c.seed === pick.seed && c.seed === 7002 && c.hash === pick.hash && same(c.heldOut, pick.heldOut) && c.kept === pick.kept && c.moved === pick.moved, `picked ${pick.seed} (${pick.hash})`);
    const differ = c.weights.filter((v, i) => Math.abs(v - hand[i]) > 1e-6).length;
    ok("!! the champion's weights are the champion: 1637 of them, hash 0ffd8554, differing from the hand weights at exactly the 29 the file says were kept",
        c.weights.length === M.WEIGHT_COUNT && weightsHash(cw) === c.hash && c.hash === "0ffd8554" && differ === c.kept && c.kept === 29, `${differ} differ`);
    const fresh = { train: tally(M.evaluate(cw, P6.TRAIN_SEEDS)), heldOut: tally(M.evaluate(cw, P6.HELD_OUT_SEEDS)), audit: tally(M.evaluate(cw, T.AUDIT_SEEDS)) };
    const handFresh = { train: tally(M.evaluate(hand, P6.TRAIN_SEEDS)), heldOut: tally(M.evaluate(hand, P6.HELD_OUT_SEEDS)), audit: tally(M.evaluate(hand, T.AUDIT_SEEDS)) };
    ok("!! the code at this head flies the file's numbers: the champion's and the hand twin's train, held-out and audit tallies, re-flown from their weights, equal the file's to the last digit",
        same(fresh, { train: c.train, heldOut: c.heldOut, audit: c.audit }) && same(handFresh, R.hand), `champion audit ${wl(fresh.audit)}, hand ${wl(handFresh.audit)}`);
    const v = T.qualifies(c, R.hand);
    ok(`!! H1 IS MET, by the registered rule applied to the file's numbers: held-out ${c.heldOut.score.toFixed(2)} against ${R.hand.heldOut.score.toFixed(2)}, audit ${c.audit.score.toFixed(2)} against ${R.hand.audit.score.toFixed(2)}, ` +
        `audit wins minus losses ${c.audit.wins - c.audit.losses} against ${R.hand.audit.wins - R.hand.audit.losses}, held-out ${c.heldOut.wins - c.heldOut.losses} against ${R.hand.heldOut.wins - R.hand.heldOut.losses} -- and the file's verdict says the same`,
        v.ok === true && v.reasons.length === 0 && same(v, R.verdict), v.reasons.join("; "));
    ok("!! C-determinism held: the champion's search, run a second time, gave the same weights to the bit (0ffd8554 twice)", R.cDeterminism.ok === true && R.cDeterminism.first === c.hash && R.cDeterminism.again === c.hash);
    ok(`!! H2 READS FLY BETTER, by the registered rule applied to the file: 80 games (40 seeds, both sides), ${wl(h.vsFly)}, LEAD = wins - losses = ${h.lead}, at or past -${T.LEAD_FLOOR}`,
        h.games === 80 && h.games === 2 * T.H2_SEEDS.length && h.vsFly.wins + h.vsFly.losses + h.vsFly.draws === 80 && h.lead === h.vsFly.wins - h.vsFly.losses && h.lead === -70 && T.h2Reading(h.lead) === h.reading && h.reading === "fly better");
    const h2Again = T.headToHead(cw, T.H2_SEEDS);
    ok("!! ...and the head-to-head re-flown from the champion's weights and the fruit fly's shipped Default gives the file's H2 to the last digit (both tallies, LEAD, the reading, and the Default's own mirror beside it)",
        same(h2Again, h), `re-flown ${wl(h2Again.vsFly)}, mirror ${wl(h2Again.flyMirror)}`);
    const vsAuto = tally(M.evaluate(cw, T.AUDIT_SEEDS, { opponent: ["autopilot"] }));
    ok("  reported, testing nothing, and re-flown too: the champion against the PD autopilot from both sides on the audit seeds", same(vsAuto, R.championVsAutopilotBothSides), wl(vsAuto));
    const vsAP = [c.train, c.heldOut, R.championVsAutopilotBothSides], apGames = vsAP.reduce((n, r) => n + r.wins + r.losses + r.draws, 0), apLost = vsAP.reduce((n, r) => n + r.losses, 0), apWon = vsAP.reduce((n, r) => n + r.wins, 0);
    // the head-to-head GAME BY GAME: the file keeps only totals, and "killed in all 80" cannot be read off 1,360 hits taken alone (two hits can land in one tick, so a game can in principle pass 17)
    const kill = Math.ceil(P6.HP_MAX / P6.SHOT_DAMAGE), games = M.evaluate(cw, T.H2_SEEDS, { opponent: [T.flyDefault()] }).runs, lost = games.filter((r) => r.aDead && !r.bDead), lh = lost.map((r) => r.hits);
    const lostHits = lh.reduce((a, b) => a + b, 0), lo = Math.min(...lh), hi = Math.max(...lh);
    ok(`  reported, testing nothing, re-flown GAME BY GAME: the champion was killed in all 80, no game went past ${kill} hits on either ship, the draws are mutual kills, and its losses carry ${lostHits} of its hits, ${lo} to ${hi} a game`,
        kill === 17 && games.length === 80 && games.every((r) => r.aDead && r.hitsTaken <= kill && r.hits <= kill) && games.filter((r) => r.aDead && r.bDead).length === h.vsFly.draws && lost.length === h.vsFly.losses &&
        lostHits === h.vsFly.hits - kill * h.vsFly.draws, `${games.filter((r) => r.aDead).length} dead, ${lost.length} losses`);
    const cs = R.searches.find((s) => s.seed === c.seed), p4kept = c.kept >= 30 && c.kept <= 150, p4impr = cs.improved >= 20 && cs.improved <= 45;
    const pred = { P1: R.verdict.ok === true, P2: c.audit.wins >= 15, P3: h.reading === "no difference shown", P4: p4kept && p4impr };
    ok(`!! the four predictions, read off the file: P1 right (H1 met); P2 wrong (${c.audit.wins} audit wins, not 15); P3 wrong (${h.reading}, not no difference); P4 wrong on BOTH halves, as the note says (${c.kept} kept, not 30-150; ${cs.improved} improvements, not 20-45)`,
        pred.P1 === true && pred.P2 === false && pred.P3 === false && pred.P4 === false && !p4kept && !p4impr, JSON.stringify({ ...pred, p4kept, p4impr }));
    const note = fs.readFileSync(path.join(HERE, "..", "..", "brain", "SIXDOF_GPU_BRAIN_WIP.md"), "utf8"), at = note.indexOf("\n## The verdict"), end = at >= 0 ? note.indexOf("\n## ", at + 1) : -1, vt = at >= 0 ? note.slice(at, end > 0 ? end : undefined) : "";   // that section alone: the later rounds' verdicts say "**P1: right.**" too
    const n0 = (x) => x.toLocaleString("en-US"), secs = R.searches.map((s) => Math.round(s.ms / 1000));
    const rowOf = (s) => { const b = s.seed === c.seed ? "**" : ""; return `| ${b}${s.seed}${b} | ${s.train.toFixed(2)} | ${b}${P6.describeEval(s.heldOut)}${b} | ${s.improved} | ${s.neutral} | ${n0(s.moved)} | ${s.kept} |`; };
    const frags = [`hash ${c.hash}`, `${c.kept} of the 1,637`, wl(c.heldOut), wl(c.audit), wl(R.hand.audit), wl(h.vsFly), `LEAD is ${h.lead}`, wl(h.flyMirror), wl(vsAuto), "H1 is met", `H2 reads ${h.reading}`,
                   `took ${Math.min(...secs)} to ${Math.max(...secs)} s`, ...R.searches.map(rowOf), `found ${cs.improved} improvements`, `${cs.neutral} of its 1,500 children neutral`,
                   `lost ${apLost === 0 ? "none" : apLost} of ${apGames} games against the autopilot and won ${apWon}`, `killed in all ${games.filter((r) => r.aDead).length}`, `landed ${n0(lostHits)} hits, ${lo} to ${hi} a game`,
                   ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`)];
    // A FRAGMENT MUST STAND ALONE: no digit may touch either end. A plain includes() found "LEAD is -7" inside the note's "LEAD is -70", so a file whose LEAD had drifted to -7 passed this row (sabotage V9's first run).
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt);
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's verdict carries the file's numbers and each prediction's outcome as the file decides it (a note that drifted from the file goes red here)", at > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" | ") : `${frags.length} fragments`);
    const wf = JSON.parse(fs.readFileSync(T.DEFAULT_OUT, "utf8")), expect = T.blobOf(R), strip = ({ exportedAt, ...rest }) => JSON.stringify(rest);
    const imp = PB.importBrain(PB.describePolicy(T.POLICY_ID, M), wf), flyImp = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), wf);
    ok("!! H1 was met, so the weight file is written -- from the committed file, by --write-from: brain/pilot6dofMlpWeightsDefault.json is blobOf(that file) bar its export time, imports as the GPU Brain's pilot with hash 0ffd8554, and the fruit fly's importer refuses it",
        strip(wf) === strip(expect) && imp.ok && weightsHash(imp.weights) === c.hash && !flyImp.ok && /^\d{4}-\d\d-\d\dT/.test(wf.exportedAt || ""), flyImp.reason);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the page round (Keith asked, 2026-11-02) -- graded by brain/pilot6dofMlpPage-selfcheck.mjs -- and how this pilot does in the page's own fight, measured since by brain/SIXDOF_PAGE_FIGHT_WIP.md.");
process.exit(fails ? 1 : 0);
