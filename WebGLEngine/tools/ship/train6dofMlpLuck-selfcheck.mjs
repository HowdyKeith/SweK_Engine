// WebGLEngine/tools/ship/train6dofMlpLuck-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/train6dofMlpLuck-selfcheck.mjs      (~20 s)
//
// THE GATE OF tools/ship/train6dofMlpLuck.mjs (and its command, tools/ship/trainMlp6dofLuck.mjs): Round 4 of the GPU Brain's 6-DOF arc, "network or luck", as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
// *** NOTHING HERE FLIES A ROUND-ROBIN SEED (6501-6520), AND NOTHING HERE STARTS THE COMMAND'S ROUND. *** The miniature is handed scratch duel seeds (99974-99978, inside the block held as used). The command is
// executed only in its --search worker mode, which flies the recipe's own train and held-out seeds (training and choice data, flown by every round since the first) and cannot reach a round; its guards are held
// as the library functions they are plus the order the command calls them in.
//
//   1  THE REGISTRATION, AS CODE: the recipe IS train6dofPilot.mjs's (1,500 iterations, sigma 0.3, 1-4 weights a child) with twenty searches a brain on fresh search seeds (7300.. the fruit fly, 7400.. the MLP); the
//      train and held-out seeds ARE the fruit fly's own; the round robin's seeds (6501-6520) are fresh and clear of every block flown before; the duel is the recipe's (train6dofLeague's league duel); H1's level
//      is 0.01 and the 70-0 threshold is derived from the first round's committed file; C-twin, C-files and the two shipped pilots are the earlier rounds' own functions and files; a weight delta round-trips
//   2  THE TEST ON MADE-UP NUMBERS: mid-ranks; the exact rank-sum test against brute force over every relabelling (with and without ties); twenty against twenty completely apart at exactly 2 in C(40, 20);
//      the test symmetric; the reading at its edges and in both directions; the cross-play read from the fruit fly's side whichever side a pairing lists it on; a shipped pilot placed on common
//      opponents
//   3  THE ROUND ON A MINIATURE (two searches of 80 iterations a brain on one scratch train seed, scratch held-out and round-robin seeds): C-twin and C-files first, then ONE call with the searches and each brain's
//      determinism twin, in order; every search the recipe's on its own network (an independent train-then-prune reproduces it to the bit); the round robin every pair once from both sides, each pairing
//      recomputed independently; the records; H1's test on the fruit fly's scores first (a planted field holds the order); the cross-play; the shipped pilots against the field on common opponents;
//      C-determinism, C-twin and C-files able to fail; the searches refused out of order; the results file's format
//   4  THE COMMAND: it never overwrites, refuses an option it does not know, holds a worker to one search of one brain, prints no score, and a worker's search is the library's to the bit
//   5  THE VERDICT, AS CODE, FROM THE COMMITTED FILE: the registered run, the controls, every pilot's weights, the round robin whole and its records re-derived, twelve pairings flown again, H1 not shown
//      by the test on the re-derived scores, the cross-play, the shipped pilots placed again (four of their pairings and their head-to-head flown again), the predictions, the note tied to the file,
//      and nothing else written. Section 5 flies the round-robin seeds again: they are spent.
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner, this gate run, the file restored byte-identical (sha256); the number is the rows that went red, by name:
//   G1 the recipe at 1,000 iterations 1 | G2 fifteen searches a brain 1 | G3 the MLP on the fruit fly's search seeds 1 | G4 the round robin on a used block 1 | G5 ten round-robin seeds 2
//   G6 the duel with collisions 1 | G7 the test at 0.05 2 | G8 the 70-0 threshold at 30 2 | G9 C-twin never stopping the round 1 | G10 the GPU Brain's champion file given not used 1
//   G11 every search on the MLP 2 | G12 pruned toward zero weights 1 | G13 the held-out read against the Default 1 | G14 the round robin from side A alone 3 | G15 the other side's record from its own side 3
//   G16 the test on the MLP's scores first 2 | G17 the cross-play read from the listed side 1 | G18 places above on all the opponents 1 (0 on the first run: below) | G19 C-determinism always ok 1
//   G20 the twin of the second search 2 | G21 searches taken in any order 1 | G22 mid-ranks without averaging ties 2 | G23 the test one-sided 3 | G24 the reading at p of 0.01 1
//   G25 the recipe not handed to the searcher 1 | G26 the results file not compacted 1 | G27 a delta that does not expand 3 | G28 parseArgs accepting any brain 1 | G29 the command never refusing 1
//   G30 the command printing the result 1 | G31 a worker flying the fruit fly whatever --brain says 1 | G32 the command running Round 3's library 2 | G33 the --search branch inverted 1 -- the worker
//   fell through to refuseExisting() on the planted results file and stopped (a probe in its place showed it: exit 2, "exists -- a round's results are never overwritten", the file unchanged)
//   FOUND BY THE SABOTAGES: G18 went 0 red. The miniature's shipped pilots sat so far above every search (the Default 16 against scores of -10 to 10) that counting their whole total placed them
//   exactly where counting only the common opponents did. The rule is now placesAbove(), held in section 2 on made-up numbers where the two disagree (a pilot that beat search 0 by 10); run again, 1 red.
//   FOUND BEFORE THEM, each a row that could not have gone red or a run that could have reached the round: (1) the miniature's searches ran at 1,500 iterations, not 80 -- run() handed the searcher
//   each job's brain and seed but not the recipe (the independent re-run row went red; G25 puts the bug back); (2) the brute-force check took its mid-ranks from the library under test -- now its own;
//   (3) no made-up lead sat at the 70-0 threshold's edge -- a lead of 34 now does (G8); (4) a row ran the command against an existing results file to watch it refuse, which a sabotaged refusal
//   would have turned into the registered round -- removed, the refusal held as a library function -- and every worker run now names a planted results file that exists (G33).
// SABOTAGE LOG, SECTION 5 (2026-11-03, after the verdict) -- the same runner, with the committed results file or the note edited; every file restored byte-identical:
//   V1 the file not flagged as the registered seeds 1 | V2 the file reading the fruit fly's network 3 (H1, the predictions, the note) | V3 a sampled pairing's games moved 2 (the records, the re-fly)
//   V4 an unsampled cross pairing's games moved 3 (the records, the cross-play, the note's game counts) | V5 the twin's hash different 1 | V6 a stored weight moved 3 (the weights, the re-fly, the
//   shipped pilots' re-flown games) | V7 the Default placed above 19 2 | V8 the shipped head-to-head at 31 wins 1 | V9 the file's p under 0.01 1 | V10 the note's median drifted 1
//   V11 the note saying P2 right 1 | V12 the note's search table drifted 1 | V13 the note's verdict heading renamed 1 | V14 the file's recipe at 1,000 iterations 1 | V15 the Default's hash in C-files 1
//   V16 a search's kept count drifted 2 | V17 the file's cross-play at 300 fruit fly leads 3 (the cross-play, P2 then right, the note)
"use strict";
import "../../physics/mechanics/rigidBody6dofEuler.mjs";   // 2026-11-04 -- the 6-DOF numbers this gate holds were measured under the first-order orientation step, so it flies that step (see that file)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./train6dofMlpLuck.mjs";
import * as T from "./train6dofMlp.mjs";
import * as L2 from "./train6dofMlpLeague.mjs";
import * as L3 from "./train6dofMlpClose.mjs";
import * as LG from "./train6dofLeague.mjs";
import * as TP from "./train6dofPilot.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.join(HERE, "..", "..", "brain");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
/** The recipe's duel from train6dofLeague.mjs (its league profile: the standoff, no collisions, no ram penalty) rather than from the library under test: every independent recomputation below uses this. */
const DUEL = LG.duelOf(LG.PROFILES.league);
const NET = { fly: P6, mlp: M };
const cp = (x) => ({ score: x.score, wins: x.wins, losses: x.losses, draws: x.draws, hits: x.hits, hitsTaken: x.hitsTaken });
/** C(n, k), exactly for the sizes here. */
const choose = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return Math.round(c); };

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the recipe is train6dofPilot.mjs's (1,500 iterations, sigma 0.3, 1-4 weights a child) with twenty searches a brain, on fresh search seeds 7300-7319 (the fruit fly) and 7400-7419 (the MLP), frozen",
        L.RECIPE.iters === TP.RECIPE.iters && L.RECIPE.sigma === TP.RECIPE.sigma && L.RECIPE.maxK === TP.RECIPE.maxK && TP.RECIPE.iters === 1500 && TP.RECIPE.sigma === 0.3 && TP.RECIPE.maxK === 4 &&
        L.RECIPE.runs === 20 && L.RECIPE.flySeed === 7300 && L.RECIPE.mlpSeed === 7400 && Object.isFrozen(L.RECIPE), J(L.RECIPE));
    ok("!! the train and held-out seeds ARE the fruit fly's own (1-12 and 21-28), as the first round used them",
        L.TRAIN_SEEDS === P6.TRAIN_SEEDS && L.HELD_SEEDS === P6.HELD_OUT_SEEDS && J(L.TRAIN_SEEDS) === J(range(1, 12)) && J(L.HELD_SEEDS) === J(range(21, 8)));
    const used = new Set(L.USED_DUEL_SEEDS);
    ok("!! the round robin's 20 seeds (6501-6520) are fresh: clear of Round 3's list, its audit (6401-6440) and the scratch seeds through 100002 (this gate's 99974-99978 among them)",
        L.RR_SEEDS.length === 20 && L.RR_SEEDS[0] === 6501 && L.RR_SEEDS[19] === 6520 && Object.isFrozen(L.RR_SEEDS) && L.RR_SEEDS.every((s) => !used.has(s)) &&
        L3.USED_DUEL_SEEDS.every((s) => used.has(s)) && L3.AUDIT_SEEDS.every((s) => used.has(s)) && [6101, 6201, 6301, 6440, 99974, 99978, 100002].every((s) => used.has(s)), `${used.size} seeds held clear of`);
    ok("!! the duel is the recipe's: the standoff start, no collisions, no ram penalty -- train6dofLeague.mjs's league duel, frozen",
        J(L.DOPTS) === J(DUEL) && L.DOPTS.collisions === false && L.DOPTS.ramPenalty === 0 && J(L.DOPTS.scenarios) === J(["standoff"]) && Object.isFrozen(L.DOPTS) && Object.isFrozen(L.DOPTS.scenarios), J(L.DOPTS));
    const first = JSON.parse(fs.readFileSync(path.join(BRAIN, "sixdofGpuBrainResults.json"), "utf8")).h2;
    ok("!! H1's level is 0.01, and the 70-0 threshold is the first round's lead scaled to a pairing's 40 games, derived here from its committed file (a lead of -70 over 80 games: 35)",
        L.ALPHA === 0.01 && first.lead === -70 && first.games === 80 && L.LOPSIDED === (-first.lead * 2 * L.RR_SEEDS.length) / first.games && L.LOPSIDED === 35, J(first.lead) + " over " + first.games);
    const fly = L.flyDefault(), gpu = L.gpuChampion();
    ok("!! C-twin, C-files and the shipped pilots are the earlier rounds' own: twinCheck and flyDefault the first round's (the Default 215e26d9), gpuChampion Round 2's start loader (the GPU Brain's champion 0ffd8554)",
        L.twinCheck === T.twinCheck && L.flyDefault === T.flyDefault && L.gpuChampion === L2.startWeights && L.refuseExisting === T.refuseExisting && weightsHash(fly) === "215e26d9" && weightsHash(gpu) === "0ffd8554" &&
        L.FLY_DEFAULT_HASH === "215e26d9" && L.GPU_CHAMPION_HASH === "0ffd8554");
    const tw = L.twinCheck();
    ok("!! the two networks are the fruit fly's circuit (930 weights) and the GPU Brain's MLP (1,637), and their hand weights fly the same duels (C-twin on the train and held-out seeds: 20 of 20)",
        L.NETS.fly === P6 && L.NETS.mlp === M && P6.WEIGHT_COUNT === 930 && M.WEIGHT_COUNT === 1637 && tw.ok && tw.same === 20 && tw.of === 20, J(tw));
    const df = L.deltaOf("fly", fly), dg = L.deltaOf("mlp", gpu), dh = L.deltaOf("mlp", M.handWeights());
    ok("  a weight delta holds exactly what differs from the brain's hand weights and expands back: the Default (84 weights) and the GPU Brain's champion (29) to their own hashes, a hand pilot to nothing",
        df.i.length === 84 && weightsHash(L.expand("fly", df)) === "215e26d9" && dg.i.length === 29 && weightsHash(L.expand("mlp", dg)) === "0ffd8554" && dh.i.length === 0 &&
        df.i.every((k, j) => fly[k] === df.v[j] && fly[k] !== P6.handWeights()[k]), `${df.i.length} and ${dg.i.length}`);
} catch (e) { guard(1, e); }

console.log("\n2. THE TEST ON MADE-UP NUMBERS");
try {
    ok("!! mid-ranks: ties take the average of their places (10, 20, 20, 5, 20 rank 2, 4, 4, 1, 4)", J(L.midRanks([10, 20, 20, 5, 20])) === J([2, 4, 4, 1, 4]) && J(L.midRanks([3, 1, 2])) === J([3, 1, 2]));
    // brute force: every way of choosing |x| of the pooled values as x's, each equally likely under the null; p the share whose rank sum is at least as far from its mean as the observed one. Its mid-ranks are
    // its own (a value's rank is the count below it plus half of one more than the count equal to it), so a broken midRanks() cannot agree with itself here.
    const brute = (x, y) => {
        const pooled = [...x, ...y], r = pooled.map((v) => pooled.filter((u) => u < v).length + (pooled.filter((u) => u === v).length + 1) / 2), n = pooled.length, m = x.length, mean = (m * (n + 1)) / 2, obs = r.slice(0, m).reduce((a, b) => a + b, 0);
        let tail = 0, count = 0;
        for (let mask = 0; mask < 1 << n; mask++) {
            let k = 0, s = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) { k++; s += r[i]; }
            if (k !== m) continue; count++; if (Math.abs(s - mean) >= Math.abs(obs - mean) - 1e-9) tail++;
        }
        return { tail, count };
    };
    const cases = [[[3, 5, 5, 9], [1, 5, 7, 2]], [[1, 2, 3], [4, 5, 6]], [[2, 2, 2, 2], [2, 2, 2, 2]], [[8, 1, 6, 3, 9], [7, 2, 5, 4, 10, 0, 11]], [[-3, 0, 0, 4, 4, 4], [0, 4, -1, 7, 2, 2]]];
    const bad = cases.filter(([x, y]) => { const t = L.rankSumTest(x, y), b = brute(x, y); return t.count !== b.count || Math.round(t.p * t.count) !== b.tail || Math.abs(t.p - b.tail / b.count) > 1e-15; });
    ok("!! the exact test equals brute force over every relabelling, with and without ties (5 cases, up to 12 values): the same count of relabellings and the same tail",
        bad.length === 0, bad.length ? "off: " + J(bad) : cases.map(([x, y]) => L.rankSumTest(x, y).p.toFixed(4)).join(", "));
    const hi = range(21, 20), lo = range(1, 20), apart = L.rankSumTest(hi, lo), back = L.rankSumTest(lo, hi);
    ok("!! twenty against twenty, completely apart: p is exactly 2 in C(40, 20) = 137,846,528,820 relabellings, and the test is symmetric (the other order, the same p)",
        apart.count === 137846528820 && choose(40, 20) === 137846528820 && apart.p === 2 / 137846528820 && back.p === apart.p && apart.rankSum === 610 && apart.expected === 410 && back.rankSum === 210, `p ${apart.p}`);
    const mixed = L.rankSumTest([1, 4, 5, 8, 9, 12], [2, 3, 6, 7, 10, 11]);
    ok("!! the reading: p under 0.01 reads the network whose ranks are higher (the fruit fly's when x's are, the GPU Brain's when y's are), p of 0.01 or more reads not shown -- on real samples and at the edge",
        L.readingOf(apart) === "the fruit fly's network" && L.readingOf(back) === "the GPU Brain's network" && L.readingOf(mixed) === "not shown" && mixed.p > 0.5 &&
        L.readingOf({ p: 0.0099999, rankSum: 411, expected: 410 }) === "the fruit fly's network" && L.readingOf({ p: 0.0099999, rankSum: 409, expected: 410 }) === "the GPU Brain's network" &&
        L.readingOf({ p: 0.01, rankSum: 610, expected: 410 }) === "not shown", `mixed p ${mixed.p.toFixed(3)}`);
    // made-up pairings [a, b, wins, losses, draws] from a's side: 0 and 2 are the fruit fly's, 1 and 3 the MLP's
    // (a lead of 34 sits one under the threshold, so a threshold moved down to it or below changes the count)
    const brains = ["fly", "mlp", "fly", "mlp"], made = [[0, 1, 34, 0, 6], [1, 2, 36, 0, 4], [0, 2, 9, 9, 22], [0, 3, 35, 0, 5], [2, 3, 10, 10, 20], [1, 3, 5, 5, 30]];
    const want = { pairings: 4, flyLeads: 2, mlpLeads: 1, level: 1, flyLopsided: 1, mlpLopsided: 1, flyWins: 79, mlpWins: 46, draws: 35 };
    ok("!! the cross-play reads each fruit fly-MLP pairing from the fruit fly's side, whichever side of the pairing it is listed on, skips the pairings within a brain, and counts a lead of 35 as lopsided and 34 not",
        J(L.crossPlay(made, brains)) === J(want), J(L.crossPlay(made, brains)));
    // a shipped pilot that beat search 0 by 10 and drew the rest: its total (10) is above search 0's score (5), but its lead over the OTHER entrants (0) is not -- and level with search 3 (10) is not above
    const lead = [10, 0, 0, 0], recs = [5, 12, 9, 10].map((score) => ({ score })), four = ["fly", "fly", "mlp", "mlp"];
    ok("!! a shipped pilot is placed on COMMON opponents: set against a search, its lead over the other entrants against that search's score -- not its whole total, which counts the games against the search itself -- and strictly above",
        L.placesAbove(lead, recs, four, "fly") === 0 && L.placesAbove(lead, recs, four, "mlp") === 1, `fly ${L.placesAbove(lead, recs, four, "fly")}, mlp ${L.placesAbove(lead, recs, four, "mlp")}`);
} catch (e) { guard(2, e); }

console.log("\n3. THE ROUND ON A MINIATURE (scratch duel seeds only)");
try {
    const opts = { runs: 2, iters: 80, sigma: 0.3, maxK: 4, flySeed: 99984, mlpSeed: 99986, trainSeeds: [99974], heldSeeds: [99975, 99976], rrSeeds: [99977, 99978] };
    const calls = [], raw = [];
    const seq = async (jobs) => { calls.push(jobs.map((j) => j.brain + j.seed)); const out = jobs.map((j) => L.searchOne(j)); raw.push(...out); return out; };
    const r = await L.run(opts, seq), fly = L.flyDefault(), gpu = L.gpuChampion();
    ok("!! C-twin and C-files first, then ONE call with each brain's searches AND each brain's determinism twin, in that order; the result names the files and says it did not use the registered seeds",
        r.cTwin && r.cTwin.ok && r.cFiles && r.cFiles.fly === "215e26d9" && r.cFiles.gpu === "0ffd8554" && calls.length === 1 && J(calls[0]) === J(["fly99984", "fly99985", "mlp99986", "mlp99987", "fly99984", "mlp99986"]) &&
        r.registeredSeeds === false && !r.stopped && J(r.seeds) === J({ rr: [99977, 2] }), J(calls));
    const indep = r.searches.map((s) => {
        const net = NET[s.brain], f = net.train({ seed: s.seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSeeds: opts.trainSeeds }), p = net.prune(f.weights, { trainSeeds: opts.trainSeeds });
        return { s, ok: s.hash === weightsHash(p.weights) && s.improved === f.improved && s.neutral === f.neutral && s.moved === p.moved && s.kept === p.kept && s.trainScore === p.trainScore &&
                 J(s.held) === J(cp(net.evaluate(p.weights, opts.heldSeeds))) && weightsHash(L.expand(s.brain, s.weights)) === s.hash && L.expand(s.brain, s.weights).length === net.WEIGHT_COUNT };
    });
    ok("!! every search is the recipe's on its OWN network: an independent train from the hand weights against the PD autopilot, pruned toward the hand weights, reproduces each to the bit (and its held-out result), its delta expands to its hash, and the miniature is not empty (searches kept weights, and pruning put moved ones back)",
        indep.every((x) => x.ok) && r.searches.filter((s) => s.kept > 0).length >= 3 && r.searches.some((s) => s.moved > s.kept) && r.searches.map((s) => s.brain).join() === "fly,fly,mlp,mlp",
        r.searches.map((s) => `${s.brain}${s.seed}: ${s.moved} moved, ${s.kept} kept${indep.find((x) => x.s === s).ok ? "" : " OFF"}`).join(", "));
    const field = r.searches.map((s) => ({ brain: s.brain, weights: L.expand(s.brain, s.weights) })), pil = field.map((e) => NET[e.brain].pilotFor(e.weights));
    const again = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const x = P6.evaluate(pil[a], opts.rrSeeds, { opponent: [pil[b]], ...DUEL }); again.push([a, b, x.wins, x.losses, x.draws]); }
    ok("!! the round robin plays every pair once, from both sides, on every seed: 6 pairings of 4 games for 4 pilots, and each equals an independent evaluate() of the two pilots under the recipe's duel",
        J(r.pairings) === J(again) && r.pairings.every(([a, b, w, l, d]) => a < b && w + l + d === 2 * opts.rrSeeds.length), J(r.pairings));
    const rec = [0, 1, 2, 3].map((k) => { let w = 0, l = 0, d = 0; for (const [a, b, pw, pl, pd] of again) { if (a === k) { w += pw; l += pl; d += pd; } if (b === k) { w += pl; l += pw; d += pd; } } return { wins: w, losses: l, draws: d, score: w - l }; });
    ok("!! each pilot's record sums its pairings (the other side's wins are its losses), a score is wins minus losses, and the scores sum to zero",
        J(r.searches.map((s) => s.rr)) === J(rec) && rec.reduce((a, x) => a + x.score, 0) === 0, rec.map((x) => x.score).join(", "));
    const fs_ = rec.filter((_, k) => k < 2).map((x) => x.score), ms_ = rec.filter((_, k) => k >= 2).map((x) => x.score);
    ok("!! H1's test is the rank-sum test of the fruit fly's scores against the MLP's, recomputed here, and the reading is the rule's",
        J(r.test) === J(L.rankSumTest(fs_, ms_)) && r.reading === L.readingOf(r.test) && r.test.n1 === 2 && r.test.n2 === 2, J(r.test));
    // a planted field whose order cannot hide: the fruit fly's two are its Default and its hand pilot, the MLP's two are pilots of zeros that never fire
    const zeroD = L.deltaOf("mlp", M.zeroWeights()), planted = [{ brain: "fly", seed: 1, hash: "d", weights: L.deltaOf("fly", fly) }, { brain: "fly", seed: 2, hash: "h", weights: L.deltaOf("fly", P6.handWeights()) },
                                                                 { brain: "mlp", seed: 3, hash: "z", weights: zeroD }, { brain: "mlp", seed: 4, hash: "z", weights: zeroD }];
    const pf = L.finish(planted, [{ brain: "fly", seed: 1, hash: "d" }, { brain: "mlp", seed: 3, hash: "z" }], { fly, gpu, rrSeeds: opts.rrSeeds });
    ok("!! ...and it reads the fruit fly's as x: in a planted field of the Default and the hand pilot against two pilots that never fire, the fruit fly's ranks are the top two (rank sum 7 of 10) and the test says so",
        pf.test.rankSum === 7 && pf.test.expected === 5 && pf.searches[0].rr.score > pf.searches[1].rr.score && pf.searches[1].rr.score > pf.searches[2].rr.score && pf.searches[2].rr.score === pf.searches[3].rr.score &&
        pf.cDeterminism.ok === true, pf.searches.map((s) => s.rr.score).join(", "));
    const brains = r.searches.map((s) => s.brain), cross = { pairings: 0, flyLeads: 0, mlpLeads: 0, level: 0, flyLopsided: 0, mlpLopsided: 0, flyWins: 0, mlpWins: 0, draws: 0 };
    for (const [a, b, w, l, d] of again) {
        if (brains[a] === brains[b]) continue; const flyW = brains[a] === "fly" ? w : l, mlpW = brains[a] === "fly" ? l : w, lead = flyW - mlpW;
        cross.pairings++; cross.flyWins += flyW; cross.mlpWins += mlpW; cross.draws += d; cross[lead > 0 ? "flyLeads" : lead < 0 ? "mlpLeads" : "level"]++; if (lead >= 35) cross.flyLopsided++; if (lead <= -35) cross.mlpLopsided++;
    }
    ok("!! the cross-play is the round robin's fruit fly-against-MLP pairings (2 x 2 = 4), read from the fruit fly's side, recomputed here", J(r.cross) === J(cross) && cross.pairings === 4, J(r.cross));
    const ref = (me) => { const lead = pil.map((p) => { const x = P6.evaluate(me, opts.rrSeeds, { opponent: [p], ...DUEL }); return { w: x.wins, l: x.losses, d: x.draws }; }), tot = lead.reduce((a, x) => a + x.w - x.l, 0);
        return { wins: lead.reduce((a, x) => a + x.w, 0), losses: lead.reduce((a, x) => a + x.l, 0), draws: lead.reduce((a, x) => a + x.d, 0), score: tot, lead: lead.map((x) => x.w - x.l),
                 above: { fly: [0, 1].filter((k) => tot - (lead[k].w - lead[k].l) > rec[k].score).length, mlp: [2, 3].filter((k) => tot - (lead[k].w - lead[k].l) > rec[k].score).length } }; };
    const hh = P6.evaluate(P6.pilotFor(fly), opts.rrSeeds, { opponent: [M.pilotFor(gpu)], ...DUEL });
    ok("!! the shipped pilots play every entrant from both sides on the same seeds, and each other; each places above a search when its lead over the OTHER entrants beats that search's score (common opponents), recomputed here",
        J(r.shipped.fly) === J(ref(P6.pilotFor(fly))) && J(r.shipped.gpu) === J(ref(M.pilotFor(gpu))) && J(r.shipped.flyVsGpu) === J(cp(hh)) && r.shipped.fly.lead.length === 4,
        `the Default ${r.shipped.fly.score} (above ${r.shipped.fly.above.fly} + ${r.shipped.fly.above.mlp}), the GPU champion ${r.shipped.gpu.score}`);
    ok("!! C-determinism: each brain's first search, run again, gave the same weights, and it kept weights (so the twin is a real repeat)",
        r.cDeterminism.ok && J(r.cDeterminism.twins.map((t) => [t.brain, t.seed, t.first === t.again])) === J([["fly", 99984, true], ["mlp", 99986, true]]) && raw[0].kept > 0 && raw[2].kept > 0 &&
        raw[4].hash === raw[0].hash && raw[5].hash === raw[2].hash, `${raw[0].kept} and ${raw[2].kept} kept`);
    const badTwin = L.finish(planted, [{ brain: "fly", seed: 1, hash: "d" }, { brain: "mlp", seed: 3, hash: "deadbeef" }], { fly, gpu, rrSeeds: [99977] });
    ok("!! C-determinism can fail: one twin with other weights and it is not ok", badTwin.cDeterminism.ok === false && badTwin.cDeterminism.twins[1].ok === false && badTwin.cDeterminism.twins[0].ok === true);
    // a run that its controls do not stop reaches its searches, which throw here: caught, so the row goes red by its own name
    const stopRun = async (o) => { try { return await L.run(o, async () => { throw new Error("searched"); }); } catch (e) { return { stopped: null, searched: e.message }; } };
    const moved = M.handWeights(); moved[0] += 0.5;
    const noTwin = await stopRun({ ...opts, twinWeights: moved });
    ok("!! C-twin can fail, and then nothing is searched: a hand MLP with one weight moved does not fly the fruit fly's hand pilot", /^C-twin failed at seed \d+, so nothing was searched$/.test(noTwin.stopped || "") && !noTwin.pairings, noTwin.stopped || "SEARCHED");
    const wrongFly = await stopRun({ ...opts, flyFile: path.join(BRAIN, "pilot6dofWeightsLeague.json") }), wrongGpu = await stopRun({ ...opts, gpuFile: path.join(BRAIN, "pilot6dofWeightsDefault.json") });
    ok("!! C-files can fail, and then nothing is searched: the fruit fly's League pilot handed in as its Default (by hash), or the fruit fly's Default as the GPU Brain's champion (by the importer)",
        /C-files failed, so nothing was searched: the fruit fly's Default is [0-9a-f]{8}, not the registered 215e26d9/.test(wrongFly.stopped || "") && /C-files failed, so nothing was searched: the start does not import/.test(wrongGpu.stopped || ""),
        `${wrongFly.stopped || "SEARCHED"} | ${wrongGpu.stopped || "SEARCHED"}`);
    let swapped = null; try { await L.run(opts, async (jobs) => { const out = jobs.map((j) => ({ brain: j.brain, seed: j.seed })); [out[0], out[1]] = [out[1], out[0]]; return out; }); } catch (e) { swapped = e.message; }
    ok("!! the searches must come back in the order asked: a searcher that hands back two swapped is refused before the round robin", /came back out of order: job 0 asked for \{"brain":"fly","seed":99984/.test(swapped || ""), swapped);
    const text = L.serialize(r), withString = L.serialize({ s: "keep [1, 2] as is", a: [[1, 2], [3]] });
    ok("  the results file's text: JSON.parse gives back the result exactly, every array of numbers sits on one line (each pairing one line), and a string holding '[1, 2]' is untouched",
        J(JSON.parse(text)) === J(r) && text.split("\n").filter((l) => /^\s*\[\d+,\d+,\d+,\d+,\d+\],?$/.test(l)).length === 6 && JSON.parse(withString).s === "keep [1, 2] as is" && /"a": \[\n  \[1,2\],\n  \[3\]\n \]/.test(withString),
        `${text.split("\n").length} lines`);
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (its round is never started)");
try {
    const cmd = path.join(HERE, "trainMlp6dofLuck.mjs"), src = fs.readFileSync(cmd, "utf8"), code = src.replace(/\/\/.*$/gm, "");
    let typo = null; try { L.parseArgs(["--runs", "3"]); } catch (e) { typo = e.message; }
    const atParse = code.indexOf("parseArgs(process.argv.slice(2))"), atRefuse = code.indexOf("refuseExisting(opts.results)"), atRun = code.indexOf("await run(opts");
    ok("!! the command never overwrites a results file and refuses an option it does not know (there is no --runs: twenty a brain is the registration): refuseExisting() and parseArgs() as the library has them, in that order before run(), exiting 2 on either",
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /unknown option "--runs"/.test(typo || "") &&
        atParse > 0 && atRefuse > atParse && atRun > atRefuse && /process\.exit\(2\)/.test(code.slice(atRefuse, atRefuse + 120)) && /process\.exit\(2\)/.test(code.slice(atParse, atParse + 140)), typo);
    const refusals = [["--search", "1", "--brain", "gpu"], ["--search", "1"], ["--brain", "fly"]].map((a) => { try { L.parseArgs(a); return null; } catch (e) { return e.message; } });
    const fine = L.parseArgs(["--search", "7", "--brain", "mlp", "--iters", "9"]);
    ok("!! a worker is held to one search of one brain: --brain must be fly or mlp, and --search and --brain go together",
        /--brain must be fly or mlp/.test(refusals[0] || "") && /go together/.test(refusals[1] || "") && /go together/.test(refusals[2] || "") && fine.search === 7 && fine.brain === "mlp" && fine.iters === 9, refusals.join(" | "));
    ok("!! ...and it is THIS round's command: it imports the luck library and no other trainer, and its default results file is brain/sixdofGpuLuckResults.json",
        /from "\.\/train6dofMlpLuck\.mjs"/.test(code) && !/train6dofMlp(League|Close)?\.mjs"/.test(code) && path.basename(L.DEFAULT_RESULTS) === "sixdofGpuLuckResults.json" && L.parseArgs([]).results === L.DEFAULT_RESULTS);
    ok("  ...and it prints no score: the results go to the file through serialize(), and the console says only where",
        !/describeEval|\.score|\.test\b|\.reading\b|\.cross|shipped|pairings/.test(code) && /fs\.writeFileSync\(opts\.results, serialize\(result\)\)/.test(code) && /commit it before reading it/.test(code) &&
        (code.match(/console\.log\(/g) || []).length === 1, `${(code.match(/console\.log\(/g) || []).length} console.log call (where the results went)`);
    // EVERY execution of the command names a results file that EXISTS: were a sabotage to break the --search branch, the child would fall through to refuseExisting() and stop there instead of starting a round
    // (the first round's gate once watched a child begin the registered round). Reaching the round would take two faults at once; a sabotage is one.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlpluck-")), planted = path.join(tmp, "r.json"); fs.writeFileSync(planted, "planted\n");
    const worker = (brain, seed) => {
        try { const out = JSON.parse(execFileSync(process.execPath, [cmd, "--search", String(seed), "--brain", brain, "--iters", "3", "--results", planted], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); delete out.ms; return out; }
        catch (e) { return { failed: `exit ${e.status}: ${String(e.stderr || e.message).trim().split("\n").pop().slice(0, 160)}` }; }   // a worker that fails is this row's red, by its name
    };
    const here = (brain, seed) => { const out = L.searchOne({ brain, seed, iters: 3 }); delete out.ms; return out; };
    const wf = worker("fly", 99984), wm = worker("mlp", 99986);
    ok("!! a worker's search is the library's to the bit: --search with --brain fly and with --brain mlp, each its own process, prints what searchOne() returns here (the time aside), on its own network",
        J(wf) === J(here("fly", 99984)) && J(wm) === J(here("mlp", 99986)) && wf.brain === "fly" && wm.brain === "mlp" && L.expand("fly", wf.weights).length === 930 && L.expand("mlp", wm.weights).length === 1637,
        wf.failed || wm.failed || `${wf.hash} and ${wm.hash}`);
    ok("  ...and the planted results file the workers were pointed at is as it was", fs.readFileSync(planted, "utf8") === "planted\n");
    fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { guard(4, e); }

console.log("\n5. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (brain/sixdofGpuLuckResults.json, committed unread at f17701ed)");
try {
    // Written AFTER the file was read. Every number the note's Round 4 verdict states is re-derived here from the file -- the records, the test, the cross-play and the shipped pilots' places from its 780
    // pairings and their leads, with this gate's own arithmetic -- and twelve pairings spread through the list, four of the shipped pilots' games and their head-to-head are flown again from the stored
    // weights, under the recipe's duel from train6dofLeague.mjs. The round-robin seeds were read once, by the registered run, and are spent: flying them again chooses nothing.
    const file = path.join(BRAIN, "sixdofGpuLuckResults.json"), R = JSON.parse(fs.readFileSync(file, "utf8")), S = R.searches, fly = L.flyDefault(), gpu = L.gpuChampion();
    const rr = range(R.seeds.rr[0], R.seeds.rr[1]), brains = S.map((s) => s.brain), n = S.length, wl = (x) => `W${x.wins}/L${x.losses}/D${x.draws}`, th = (x) => x.toLocaleString("en-US");
    const med = (xs) => { const t = [...xs].sort((a, b) => a - b), k = t.length; return k % 2 ? t[(k - 1) / 2] : (t[k / 2 - 1] + t[k / 2]) / 2; }, of = (b, f) => S.filter((s) => s.brain === b).map(f);
    ok("!! the file is the registered run: the recipe (twenty a brain, 1,500 iterations, sigma 0.3, 1-4 weights a child, search seeds 7300.. and 7400..), the recipe's duel, the round robin on 6501-6520 and flagged so, the 40 searches in order, not stopped",
        R.registration === "brain/SIXDOF_GPU_BRAIN_WIP.md (Round 4)" && J(R.recipe) === J({ runs: 20, iters: 1500, sigma: 0.3, maxK: 4, flySeed: 7300, mlpSeed: 7400 }) && J(R.duel) === J(DUEL) &&
        J(R.seeds) === J({ rr: [6501, 20] }) && R.registeredSeeds === true && !R.stopped && J(S.map((s) => s.brain + s.seed)) === J([...range(7300, 20).map((x) => "fly" + x), ...range(7400, 20).map((x) => "mlp" + x)]), J(R.recipe));
    ok("!! the controls held: C-twin 20 of 20, C-files the Default 215e26d9 and the GPU Brain's champion 0ffd8554, and C-determinism -- search 7300 gave 932674a9 both times and search 7400 ea5b9403",
        J(R.cTwin) === J({ ok: true, same: 20, of: 20, first: null }) && J(R.cFiles) === J({ ok: true, fly: "215e26d9", gpu: "0ffd8554" }) && R.cDeterminism.ok === true &&
        J(R.cDeterminism.twins.map((t) => [t.brain, t.seed, t.first, t.again])) === J([["fly", 7300, "932674a9", "932674a9"], ["mlp", 7400, "ea5b9403", "ea5b9403"]]) && S[0].hash === "932674a9" && S[20].hash === "ea5b9403");
    const field = S.map((s) => ({ brain: s.brain, w: L.expand(s.brain, s.weights) })), hand = { fly: P6.handWeights(), mlp: M.handWeights() };
    const badW = S.filter((s, k) => weightsHash(field[k].w) !== s.hash || field[k].w.length !== NET[s.brain].WEIGHT_COUNT || s.weights.i.length !== s.kept || field[k].w.filter((v, i) => Math.abs(v - hand[s.brain][i]) > 1e-6).length !== s.kept);
    ok("!! every search's weights are in the file: each delta expands on its own network to the search's hash, and holds exactly the weights the search kept", badW.length === 0, badW.length ? "off: " + badW.map((s) => s.brain + s.seed).join(", ") : "40 of 40");
    const pairs = []; for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
    const rec = S.map(() => ({ wins: 0, losses: 0, draws: 0 }));
    for (const [a, b, w, l, d] of R.pairings) { rec[a].wins += w; rec[a].losses += l; rec[a].draws += d; rec[b].wins += l; rec[b].losses += w; rec[b].draws += d; }
    const recs = rec.map((x) => ({ ...x, score: x.wins - x.losses }));
    ok("!! the round robin is whole: 780 pairings, every pair once in order, 40 games each (20 seeds from both sides); each search's record re-derived here from them is the file's, and the scores sum to zero",
        R.pairings.length === 780 && J(R.pairings.map(([a, b]) => [a, b])) === J(pairs) && R.pairings.every(([, , w, l, d]) => w + l + d === 2 * rr.length) && J(S.map((s) => s.rr)) === J(recs) && recs.reduce((a, x) => a + x.score, 0) === 0);
    const sample = range(0, 12).map((k) => R.pairings[k * 65]), pil = field.map((e) => NET[e.brain].pilotFor(e.w)), kinds = sample.map(([a, b]) => brains[a] + "-" + brains[b]);
    const reflown = sample.map(([a, b]) => { const x = P6.evaluate(pil[a], rr, { opponent: [pil[b]], ...DUEL }); return [a, b, x.wins, x.losses, x.draws]; });
    ok("!! twelve pairings spread through the list (every 65th), flown again from the stored weights under the recipe's duel, give the file's games to the last one -- fruit fly against fruit fly, against the MLP, and MLP against MLP among them",
        J(reflown) === J(sample) && ["fly-fly", "fly-mlp", "mlp-mlp"].every((k) => kinds.includes(k)), kinds.join(" "));
    const fs20 = of("fly", (s) => s.rr.score), ms20 = of("mlp", (s) => s.rr.score), test = L.rankSumTest(recs.filter((_, k) => brains[k] === "fly").map((x) => x.score), recs.filter((_, k) => brains[k] === "mlp").map((x) => x.score));
    ok("!! H1 IS NOT SHOWN: the rank-sum test of the fruit fly's 20 scores against the MLP's, from the records re-derived here, gives p 0.265 (rank sum 452 against the 410 expected, over C(40, 20) relabellings) -- not under 0.01 -- as the file says",
        J(test) === J(R.test) && test.count === choose(40, 20) && test.rankSum === 452 && test.expected === 410 && test.p.toFixed(3) === "0.265" && !(test.p < 0.01) && L.readingOf(test) === "not shown" && R.reading === "not shown", `p ${test.p}`);
    const cross = { pairings: 0, flyLeads: 0, mlpLeads: 0, level: 0, flyLopsided: 0, mlpLopsided: 0, flyWins: 0, mlpWins: 0, draws: 0 };
    for (const [a, b, w, l, d] of R.pairings) {
        if (brains[a] === brains[b]) continue; const fw = brains[a] === "fly" ? w : l, mw = brains[a] === "fly" ? l : w, lead = fw - mw;
        cross.pairings++; cross.flyWins += fw; cross.mlpWins += mw; cross.draws += d; cross[lead > 0 ? "flyLeads" : lead < 0 ? "mlpLeads" : "level"]++; if (lead >= 35) cross.flyLopsided++; if (lead <= -35) cross.mlpLopsided++;
    }
    ok("!! the cross-play, re-derived from the pairings: 400, the fruit fly's search leading in 236, the MLP's in 154, 10 level; 6 as lopsided as 70-0, all for the fruit fly; 6,189 games won to 4,722, with 5,089 drawn",
        J(cross) === J(R.cross) && J(cross) === J({ pairings: 400, flyLeads: 236, mlpLeads: 154, level: 10, flyLopsided: 6, mlpLopsided: 0, flyWins: 6189, mlpWins: 4722, draws: 5089 }), J(cross));
    const sf = R.shipped.fly, sg = R.shipped.gpu, place = (lead, b) => { const tot = lead.reduce((x, y) => x + y, 0); return S.filter((s, k) => s.brain === b && tot - lead[k] > recs[k].score).length; };
    const again = [[fly, P6, 0], [fly, P6, 39], [gpu, M, 0], [gpu, M, 39]].map(([w, net, k]) => { const x = P6.evaluate(net.pilotFor(w), rr, { opponent: [pil[k]], ...DUEL }); return x.wins - x.losses; });
    const hh = P6.evaluate(P6.pilotFor(fly), rr, { opponent: [M.pilotFor(gpu)], ...DUEL });
    ok("!! the shipped pilots, re-derived from their leads: the Default W1205/L24/D371, ahead of every entrant (by 9 to 40), above all 20 searches of each network on common opponents; the GPU Brain's champion W442/L527/D631, above 8 and 9 -- and four of their pairings and their own head-to-head (W32/L0/D8) flown again",
        sf.lead.length === 40 && sg.lead.length === 40 && sf.score === sf.lead.reduce((x, y) => x + y, 0) && sg.score === sg.lead.reduce((x, y) => x + y, 0) && wl(sf) === "W1205/L24/D371" && wl(sg) === "W442/L527/D631" &&
        sf.wins + sf.losses + sf.draws === 1600 && Math.min(...sf.lead) === 9 && Math.max(...sf.lead) === 40 && place(sf.lead, "fly") === 20 && place(sf.lead, "mlp") === 20 && J(sf.above) === J({ fly: 20, mlp: 20 }) &&
        place(sg.lead, "fly") === 8 && place(sg.lead, "mlp") === 9 && J(sg.above) === J({ fly: 8, mlp: 9 }) && J(again) === J([sf.lead[0], sf.lead[39], sg.lead[0], sg.lead[39]]) &&
        J(cp(hh)) === J(R.shipped.flyVsGpu) && wl(hh) === "W32/L0/D8", `re-flown leads ${again.join(", ")}`);
    const fk = of("fly", (s) => s.kept), mk = of("mlp", (s) => s.kept), A = test.u / (test.n1 * test.n2), bestHeld = Math.max(...S.map((s) => s.held.score));
    ok("  reported, testing nothing: the medians 165.5 and -43.5, the ranges -906 to 871 and -743 to 612, a fruit fly search outranking an MLP search with probability 0.605, the fruit fly leading 59% of the cross pairings, and the best fresh held-out score 20.43",
        med(fs20) === 165.5 && med(ms20) === -43.5 && Math.min(...fs20) === -906 && Math.max(...fs20) === 871 && Math.min(...ms20) === -743 && Math.max(...ms20) === 612 && A.toFixed(3) === "0.605" &&
        Math.round((100 * cross.flyLeads) / cross.pairings) === 59 && bestHeld.toFixed(2) === "20.43");
    const pred = { P1: R.reading === "the fruit fly's network", P2: R.cross.flyLeads >= 300, P3: R.shipped.fly.above.fly >= 15, P4: med(mk) < med(fk) };
    ok("!! the four predictions, read off the file: P1 and P2 wrong (not shown; the fruit fly led in 236 of 400, not 300), P3 and P4 right (the Default above all 20 of its brain's searches; a median of 38.5 weights kept against 55.5)",
        !pred.P1 && !pred.P2 && pred.P3 && pred.P4 && med(mk) === 38.5 && med(fk) === 55.5, J(pred));
    const note = fs.readFileSync(path.join(BRAIN, "SIXDOF_GPU_BRAIN_WIP.md"), "utf8"), at = note.indexOf("\n### Round 4: the verdict"), end = at >= 0 ? note.indexOf("\n## ", at + 1) : -1;
    const vt = at >= 0 ? note.slice(at, end > 0 ? end : undefined).replace(/\s+/g, " ") : "";   // that section alone, its line breaks read as spaces
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt);
    const rowOf = (s) => `| ${s.seed} | ${s.trainScore.toFixed(2)} | ${s.improved} | ${s.neutral} | ${s.moved} | ${s.kept} | ${s.held.score.toFixed(2)} (${wl(s.held)}) | ${wl(s.rr)} | ${s.rr.score} |`;
    const mins = (b) => of(b, (s) => s.ms / 60000), f1 = (x) => x.toFixed(1), crossGames = cross.flyWins + cross.mlpWins + cross.draws;
    const frags = [...S.map(rowOf), `${f1(Math.min(...mins("fly")))} to ${f1(Math.max(...mins("fly")))} minutes each and the MLP's ${f1(Math.min(...mins("mlp")))} to ${f1(Math.max(...mins("mlp")))}`,
                   `on all ${R.cTwin.same} train and held-out seeds`, `search 7300 gave ${S[0].hash} both times, and search 7400 gave ${S[20].hash} both times`,
                   `p = ${test.p.toFixed(3)} (a rank sum of ${test.rankSum} against the ${test.expected} expected)`, `a median score of ${med(fs20)} against ${med(ms20)}, over ${th((n - 1) * 2 * rr.length)} games each`,
                   `with probability ${A.toFixed(3)}`, `run from ${Math.min(...fs20)} to ${Math.max(...fs20)}, the MLP's from ${Math.min(...ms20)} to ${Math.max(...ms20)}`,
                   `leads in ${cross.flyLeads} of the ${cross.pairings} pairings, the MLP's in ${cross.mlpLeads}, and ${cross.level} are level`,
                   `Over their ${th(crossGames)} games the fruit fly won ${th(cross.flyWins)} and the MLP ${th(cross.mlpWins)}, with ${th(cross.draws)} draws`,
                   `${cross.flyLopsided} of the ${cross.pairings} fresh cross pairings were as lopsided`, ...(cross.mlpLopsided === 0 ? ["and none for the MLP"] : []),
                   `${wl(sf)} over ${th(sf.wins + sf.losses + sf.draws)} games, a lead of between ${Math.min(...sf.lead)} and ${Math.max(...sf.lead)}`,
                   `above all ${sf.above.fly} fruit fly searches and all ${sf.above.mlp} MLP searches`, `${wl(sg)}, above ${sg.above.fly} of the 20 fruit fly searches and ${sg.above.mlp} of the 20 MLP searches`,
                   `the Default beat the GPU Brain's champion ${wl(hh)}`, `the best of the 40 scored ${bestHeld.toFixed(2)}`, `led in ${cross.flyLeads} of the ${cross.pairings} cross pairings, not 300 or more`,
                   `placed above all ${sf.above.fly} of the fruit fly's searches`, `a median of ${med(mk)} against the fruit fly's ${med(fk)}`, `it led in ${Math.round((100 * cross.flyLeads) / cross.pairings)}% of the cross pairings`,
                   "**H1 is not shown.**", ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`)];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's Round 4 verdict carries the file's numbers, its forty searches row by row, and each prediction's outcome as the file decides it (no digit may touch a fragment's ends; read from that section alone)",
        at > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
    const other = fs.readdirSync(BRAIN).filter((f) => /luck/i.test(f) && f !== "sixdofGpuLuckResults.json");
    ok("  and nothing else is written: no other file under brain/ names the round, the results file its one output", other.length === 0, other.join(", "));
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether a modest edge for either network hides under the spread (more searches a side would say), how these pilots fly on the page, and the recipe's other draws -- none of it registered.");
process.exit(fails ? 1 : 0);
