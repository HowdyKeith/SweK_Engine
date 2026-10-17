// WebGLEngine/tools/ship/trainSeatGunner-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainSeatGunner-selfcheck.mjs      (~2 min: the shipped files are graded on their held-out and audit fights)
//
// THE TRAINER OF THE BATTLESHIP'S GUNNER NETWORKS, HELD TO WHAT IT SAYS (tools/ship/trainSeatGunner.mjs; the command is tools/ship/trainGunnerSeat.mjs). A search is only as good as what judges it, and a file is only as good as the claim it is shipped under.
//
//   1  THE SETS      the train, held-out and audit fights are the sizes and kinds they say, share no fight, and the audit is one nothing has seen; the recipe constants
//   2  THE SCORE     a fight's number on arenas whose hit points are set by hand: the share of the fighters' hit points taken off them, plus half the share shot down, minus half the share of the ship's lost -- floors included
//   3  EVALUATE      the mean over the fights in the order given, the fight a battleshipFight.fight() of the same options, the network and the sight and the seconds reaching the fight, the hand weights the fight with no network, the zero network a ship that
//                    never fires, and the line a result is described in
//   4  THE SEARCH    train() on a made-up landscape with the children scripted: a better child replaces its parent, a worse one does not, one that scores EXACTLY the same does and is counted apart, the generator is the network's own seeded one, the start
//                    is respected and untouched; prune() puts back a weight that carries nothing and needs a second pass to put back the one that only mattered because of it, and stops at its cap
//   5  THE VERDICT   qualifies() on made-up numbers: each of its four conditions alone refuses, ties on the score refuse, ties on kills do not
//   6  THE COMMAND   parseArgs() defaults, every option, and a typo, a missing value, a word for a number and an unknown network REFUSED
//   7  THE PROCEDURE run() flown on a handful of short fights: two searches, the champion the one with the better held-out score, the three other sights flown, the log lines, the same weights to the bit twice, and the verdict the one qualifies() gives
//   8  THE FILE      blobOf() writes a swek-brain-v1 blob the page's importBrain accepts, with the recipe and the three scores in `by`
//   9  THE SHIPPED   each shipped weights file there is (fruit fly, GPU brain) loads, quotes the score the held-out fights give it NOW, quotes the audit and the hand gunner's, and beats the hand gunner on both
//   10 THE FRONT DOOR the export list is pinned
//
// SABOTAGE LOG -- FORTY-ONE SABOTAGES, each applied to tools/ship/trainSeatGunner.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   T1 a fight is 30 s 1 | T2 the search is judged behind the regular sight 4 | T3 the train seeds are 1 and 3 1 | T4 the held-out seeds are 11 and 13 1 | T5 the audit seeds end at 24 1
//   T6 the train fights have no swarm 1 | T7 a kill is worth a quarter 1 | T8 the ship's loss counts double 1 | T9 fighter hit points below zero count 1 | T10 the sight option is ignored 2
//   T11 the seconds option is ignored 2 | T12 the pilot option is ignored 1 | T13 the network is never given to the fight 1 | T14 the score is a sum 1 | T15 the kills are a mean 1
//   T16 the score is described to two places 1 | T17 a worse child replaces its parent 2 | T18 an equal child replaces its parent by default 2 | T19 the search ignores its seed 1
//   T20 the search ignores the start it is given 1 | T21 the search moves one weight whatever maxK says 1 | T22 the live share is the other half 2 | T23 prune puts back only a weight whose reversal GAINS 2
//   T24 prune ignores its cap 1 | T25 prune makes one pass 2 | T26 a tie on the held-out score qualifies 1 | T27 the audit score does not matter 1 | T28 a tie on held-out kills does not qualify 1
//   T29 the audit kills do not matter 1 | T30 an unknown option is accepted 1 | T31 an unknown network is accepted 1 | T32 NaN is accepted for a number 1 | T33 the GPU brain's file is named differently 1
//   T34 the GPU brain's policy id is the fruit fly's 1 | T35 the champion is the worst on held-out 1 | T36 the audit is flown on the train fights 1 | T37 the regular sight is not flown 2
//   T38 the file's score is the audit's 2 | T39 the file does not quote the hand gunner 2 | T40 a live child moves up to maxK + 1 weights 1 | T41 a live child moves any weight 1
// THREE WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE: T35 (the champion the worst of the searches), T36 (the audit flown on the train fights) -- run() was only checked on searches that all ended at the hand gunner, so every choice among them was a tie; the row that can tell has a made-up gunner, a search that finds it and one that does not -- and T40 (a live child one weight too big: only the net's own mutate() was measured for size); a row was added for each and each re-run red.
"use strict";
import fs from "node:fs";
import * as T from "./trainSeatGunner.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as SG from "../../brain/seatGunnerPolicy.mjs";
import * as MG from "../../brain/seatGunnerMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const NETS = { fruitfly: SG, mlp: MG };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
console.log("trainSeatGunner-selfcheck -- the trainer of the battleship's gunner networks\n");

console.log("1. THE SETS");
section(() => {
    const key = (f) => `${f.kind}${f.seed}`, tr = T.TRAIN_FIGHTS.map(key), ho = T.HELD_OUT_FIGHTS.map(key), au = T.AUDIT_FIGHTS.map(key), all = [...tr, ...ho, ...au];
    ok("!! the train fights are six (bow, stern and swarm, seeds 1 and 2), the held-out eight (all four kinds, seeds 11 and 12), the audit twelve (all four kinds, seeds 21-23); no fight is in two of the sets and none is twice in one", T.TRAIN_FIGHTS.length === 6 && tr.join() === "bow1,bow2,stern1,stern2,swarm1,swarm2" && T.HELD_OUT_FIGHTS.length === 8 && T.AUDIT_FIGHTS.length === 12 && ho.join() === "bow11,bow12,beam11,beam12,stern11,stern12,swarm11,swarm12" && au.join() === "bow21,bow22,bow23,beam21,beam22,beam23,stern21,stern22,stern23,swarm21,swarm22,swarm23" && new Set(all).size === 26 && T.KINDS === BF.KINDS && Object.isFrozen(T.TRAIN_FIGHTS) && Object.isFrozen(T.AUDIT_FIGHTS), all.length + " fights");
    ok("!! the sight the search is judged behind is the GREEN one and a fight is 40 s; the recipe is two runs of 300 iterations from seed 3000 at sigma 0.3, 1-4 weights a child, half of them from the live weights, two pruning passes; the files are brain/seatGunnerWeightsDefault.json and brain/seatGunnerMlpWeightsDefault.json under the library's policy ids", T.SIGHT === "green" && T.SECONDS === 40 && JSON.stringify(T.RECIPE) === JSON.stringify({ runs: 2, iters: 300, seed: 3000, sigma: 0.3, maxK: 4, passes: 2, liveShare: 0.5 }) && Object.isFrozen(T.RECIPE) && /brain[\\/]seatGunnerWeightsDefault\.json$/.test(T.DEFAULT_OUT.fruitfly) && /brain[\\/]seatGunnerMlpWeightsDefault\.json$/.test(T.DEFAULT_OUT.mlp) && T.POLICY_ID.fruitfly === "seatGunnerPolicy" && T.POLICY_ID.mlp === "seatGunnerMlp");
});

console.log("\n2. THE SCORE");
section(() => {
    const mk = (hps, shipHp, statuses) => { const a = BF.build(1, "bow", { fighters: hps.length }).arena; a.crafts[0].hp = shipHp; hps.forEach((h, i) => { a.crafts[1 + i].hp = h; a.crafts[1 + i].status = statuses[i]; }); return a; };
    const a = mk([40, 0], 1200, ["flying", "destroyed"]), b = mk([100, 100], 1500, ["flying", "flying"]), c = mk([-10, -50], -50, ["destroyed", "destroyed"]);
    ok("!! A FIGHT'S NUMBER: fighters at 40 and 0 of 100 (one shot down) and the ship at 1,200 of 1,500 score (60 + 100) / 200 + 0.5 x 1/2 - 0.5 x 300/1500 = 0.8 + 0.25 - 0.1 = 0.95; nothing hurt either way is 0; every fighter dead (hit points below 0 count as 0, not more) and the ship dead (below 0 is 1,500 lost, not more) is 1 + 0.5 - 0.5 = 1", Math.abs(T.scoreOf(a) - 0.95) < 1e-12 && T.scoreOf(b) === 0 && Math.abs(T.scoreOf(c) - 1) < 1e-12, `${T.scoreOf(a)} ${T.scoreOf(b)} ${T.scoreOf(c)}`);
});

console.log("\n3. EVALUATE");
section(() => {
    const list = [{ kind: "bow", seed: 1 }, { kind: "swarm", seed: 2 }], direct = (o, seed, kind, seconds, extra = {}) => { const b = BF.build(seed, kind, { gunners: o, seconds, ...extra }); SA.runSpaceArena(b.arena); return { b, t: BF.tally(b.arena), score: T.scoreOf(b.arena) }; };
    const e = T.evaluate(SG, null, list, { sight: "regular", seconds: 20 }), d1 = direct("regular", 1, "bow", 20), d2 = direct("regular", 2, "swarm", 20);
    ok("!! evaluate() IS THE FIGHTS FLOWN AND AVERAGED: two fights in the order given, behind the sight and for the seconds asked, are battleshipFight.build() flown to the end -- each run's kind, seed, score, shot down, damage taken, win, rounds and hits are the direct fight's, and the score is the mean and the kills the sum",
        e.runs.length === 2 && e.runs[0].kind === "bow" && e.runs[0].seed === 1 && e.runs[1].kind === "swarm" && e.runs[1].seed === 2 && [d1, d2].every((d, i) => e.runs[i].score === d.score && e.runs[i].killed === d.t.killed && e.runs[i].damage === d.t.damageOnShip && e.runs[i].win === (d.t.winner === "ship") && e.runs[i].rounds === d.t.ship.seatRounds && e.runs[i].hits === d.t.ship.hitsDealt)
        && e.score === (d1.score + d2.score) / 2 && e.killed === d1.t.killed + d2.t.killed && e.damage === (d1.t.damageOnShip + d2.t.damageOnShip) / 2 && e.wins === [d1, d2].filter((d) => d.t.winner === "ship").length && e.rounds === d1.t.ship.seatRounds + d2.t.ship.seatRounds && e.hits === d1.t.ship.hitsDealt + d2.t.ship.hitsDealt && e.runs[0].score !== e.runs[1].score, e.runs.map((r) => r.score.toFixed(3)).join(" "));
    const g = T.evaluate(SG, null, list, { sight: "green", seconds: 20 }), q = T.evaluate(SG, null, list, { sight: "regular", seconds: 10 });
    ok("and the sight, the seconds and the pilot reach the fight: the same two fights behind the green sight, for 10 s and with fighters whose pilot does nothing each differ from the regular 20 s ones in what they score", g.score !== e.score && q.score !== e.score && T.evaluate(SG, null, list, { sight: "regular", seconds: 20, pilot: () => ({ torqueBody: [0, 0, 0], thrust: 0, firing: false }) }).score !== e.score);
    const rows = Object.entries(NETS).map(([n, m]) => [n, m, T.evaluate(m, m.handWeights(), list, { sight: "green", seconds: 20 }), T.evaluate(m, null, list, { sight: "green", seconds: 20 }), T.evaluate(m, m.zeroWeights(), list, { sight: "green", seconds: 20 })]);
    ok("!! THE HAND WEIGHTS ARE THE FIGHT WITH NO NETWORK AND THE ZERO NETWORK FIRES NO SEAT: for both networks the two fights on the hand weights score, kill, lose and fire exactly what the same fights with no network do (every run's every field), and on zero weights not one SEAT round is fired (what the ship still deals is its wave-motion cannon's, which no seat fires: every hit point comes in its 400-point waves)", rows.every(([, , h, n0, z]) => JSON.stringify(h.runs) === JSON.stringify(n0.runs) && h.score === n0.score && z.rounds === 0 && z.hits % 400 === 0) && rows[0][2].rounds > 100, rows.map(([n, , h, , z]) => `${n}: hand ${h.rounds} rounds, zero ${z.rounds}`).join("; "));
    const fake = { score: 0.7, killed: 29, damage: 220.4, wins: 2, rounds: 4100, hits: 3900, runs: Array(12).fill({}) };
    ok("the line a result is described in: score to three places, the fighters down of the fights' eight each, wins of the runs, the damage taken to the point, the rounds and the hit points dealt", T.describeEval(fake) === "0.700 (29 of 96 fighters down, W2/12, 220 hit points lost a fight, 4100 rounds, 3900 hit points dealt)", T.describeEval(fake));
});

console.log("\n4. THE SEARCH (on a made-up landscape: the score is w[0] - 0.1 |w[1]|, w[2] changes nothing, the children are scripted)");
section(() => {
    const stub = (queue, calls = []) => { let k = 0; return { handWeights: () => Float32Array.of(0, 0, 0), rngFor: (seed) => { calls.push(["rngFor", seed]); return () => 0.5; }, mutate: (w, sigma, rng, maxK) => { calls.push(["mutate", sigma, maxK, Array.from(w)]); return Float32Array.from(queue[k++]); }, WEIGHT_COUNT: 3 }; };
    const sc = (w) => w[0] - 0.1 * Math.abs(w[1]), queue = [[1, 0, 0], [1, 5, 0], [1, 0, 9], [2, 0, 0]], calls = [], seen = [], callsN = [], seenN = [];
    const r = T.train(stub(queue, calls), { seed: 11, iters: 4, scoreFn: sc, onIter: (i, st) => seen.push([i, st.score, st.improved, st.neutral]) });
    const rn = T.train(stub(queue, callsN), { seed: 11, iters: 4, scoreFn: sc, acceptNeutral: true, onIter: (i, st) => seenN.push([i, st.score, st.improved, st.neutral]) });
    ok("!! A BETTER CHILD REPLACES ITS PARENT AND A WORSE ONE DOES NOT; A CHILD THAT SCORES EXACTLY THE SAME DOES NOT EITHER (it is drift: weights the train fights cannot see) UNLESS acceptNeutral IS ON, and is then counted apart: children scoring 1 (better than the hand's 0), 0.5 (worse), 1 again with a different weight 2 (the same as the parent's) and 2 end at (2, 0, 0) and a score of 2 with two improvements -- no neutral move by default, one with the option (the fourth child is then bred from the weights (1, 0, 9) the neutral child left) -- the history opens with the hand's 0 and closes with the last iteration, onIter was told each step",
        same(Array.from(r.weights), [2, 0, 0]) && r.trainScore === 2 && r.improved === 2 && r.neutral === 0 && r.iters === 4 && JSON.stringify(r.history) === JSON.stringify([{ i: 0, score: 0 }, { i: 4, score: 2 }]) && JSON.stringify(seen) === JSON.stringify([[1, 1, 1, 0], [2, 1, 1, 0], [3, 1, 1, 0], [4, 2, 2, 0]]) && same(calls[4][3], [1, 0, 0])
        && same(Array.from(rn.weights), [2, 0, 0]) && rn.improved === 2 && rn.neutral === 1 && JSON.stringify(seenN) === JSON.stringify([[1, 1, 1, 0], [2, 1, 1, 0], [3, 1, 1, 1], [4, 2, 2, 1]]) && same(callsN[4][3], [1, 0, 9]), JSON.stringify(seen) + " | " + JSON.stringify(seenN));
    ok("!! THE GENERATOR AND THE MOVES ARE THE NETWORK'S: the search is seeded with the network's own rngFor(seed), asks for children of the CURRENT best (the parent is the child that replaced it) with the sigma and the number of weights the recipe says (0.3, 4) or the options (0.7, 2), and the start it is given is the hand weights unless it is told otherwise and is never edited", calls[0][0] === "rngFor" && calls[0][1] === 11 && calls.filter((c) => c[0] === "mutate").length === 4 && calls.filter((c) => c[0] === "mutate").every((c) => c[1] === 0.3 && c[2] === 4) && same(calls[3][3], [1, 0, 0]) && same(calls[2][3], [1, 0, 0]) && (() => { const c2 = [], st = Float32Array.of(1, 0, 0), r2 = T.train(stub([[1, 0, 9]], c2), { seed: 3, iters: 1, sigma: 0.7, maxK: 2, start: st, scoreFn: sc }); return c2[1][1] === 0.7 && c2[1][2] === 2 && same(c2[1][3], [1, 0, 0]) && r2.history[0].score === 1 && r2.neutral === 0 && same(Array.from(r2.weights), [1, 0, 0]) && same(Array.from(st), [1, 0, 0]); })());
    const again = T.train(stub(queue), { seed: 11, iters: 4, scoreFn: sc });
    ok("and it is a function of its inputs: the same scripted children give the same weights, score and history again", same(Array.from(again.weights), Array.from(r.weights)) && again.trainScore === r.trainScore && JSON.stringify(again.history) === JSON.stringify(r.history));
    const lstub = () => { let calls = 0; return { handWeights: () => new Float32Array(4), rngFor: (seed) => { let a = seed; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return (a + 1) / 4294967297; }; }, mutate: (w) => { calls++; const o = Float32Array.from(w); o[0] += 1; return o; }, liveIndices: () => [2, 3], get calls() { return calls; }, WEIGHT_COUNT: 4 }; };
    const runLive = (share) => { const st = lstub(); let n = 0; const r2 = T.train(st, { seed: 5, iters: 200, liveShare: share, scoreFn: () => ++n }); return { w: Array.from(r2.weights), calls: st.calls, improved: r2.improved }; };
    const half = runLive(0.5), none = runLive(0), all = runLive(1), plain = (() => { const st = { ...lstub(), liveIndices: undefined }; let n = 0, calls = 0; st.mutate = (w) => { calls++; const o = Float32Array.from(w); o[0] += 1; return o; }; T.train(st, { seed: 5, iters: 50, scoreFn: () => ++n }); return calls; })();
    ok("!! HALF THE CHILDREN ARE BRED FROM THE NET'S LIVE WEIGHTS: on a net that names two (indices 2 and 3) and whose own mutate() moves only weight 0, two hundred children that are all accepted leave weight 1 untouched, weight 0 as many times moved as mutate() was called (between 70 and 130 of the 200 at the default share), and weights 2 and 3 both moved; a share of 0 never uses the live weights (200 calls, 2 and 3 zero), a share of 1 always does (no call, weight 0 zero); a net that names none uses its own mutate() every time",
        half.improved === 200 && half.w[1] === 0 && half.w[0] === half.calls && half.calls >= 70 && half.calls <= 130 && half.w[2] !== 0 && half.w[3] !== 0 && none.calls === 200 && none.w[2] === 0 && none.w[3] === 0 && all.calls === 0 && all.w[0] === 0 && all.w[2] !== 0 && all.w[3] !== 0 && all.w[1] === 0 && plain === 50, `${half.calls} of 200; ${JSON.stringify(half.w.map((v) => +v.toFixed(2)))}`);
    const sizes = (maxK) => { const st = { ...lstub(), handWeights: () => new Float32Array(12), liveIndices: () => [2, 3, 4, 5, 6, 7, 8, 9], WEIGHT_COUNT: 12 }, snaps = []; let n = 0; T.train(st, { seed: 5, iters: 300, maxK, liveShare: 1, scoreFn: (w) => { snaps.push(Array.from(w)); return ++n; } }); const ch = snaps.slice(1).map((w, i) => w.reduce((a, v, j) => a + (v !== snaps[i][j] ? 1 : 0), 0)); return { max: Math.max(...ch), min: Math.min(...ch) }; };
    const z1 = sizes(1), z3 = sizes(3);
    ok("!! A LIVE CHILD MOVES ONE TO maxK WEIGHTS, no more and no fewer: with maxK 1 every one of 300 children moves exactly one of the live weights; with maxK 3 between one and three (both ends occur)", z1.max === 1 && z1.min === 1 && z3.max === 3 && z3.min === 1, `${JSON.stringify(z1)} ${JSON.stringify(z3)}`);
    const net = { handWeights: () => Float32Array.of(0, 0, 0, 0) }, sc2 = (w) => (w[0] !== 0 ? 1 : 0) + (w[3] !== 0 ? 1 : 0);
    const p = T.prune(net, Float32Array.of(1, 0.5, 0, 2), { scoreFn: sc2 });
    ok("!! prune() PUTS BACK A WEIGHT THAT CARRIES NOTHING AND KEEPS THE ONES THAT DO: of three weights moved from the hand weights (1, 0.5 and 2), the one that does not change the score goes back, the two that earn it stay, and a second pass finds nothing more to put back", same(Array.from(p.weights), [1, 0, 0, 2]) && p.moved === 3 && p.kept === 2 && p.passes === 2 && p.trainScore === 2, JSON.stringify(p));
    const sc3 = (w) => (w[1] !== 0 ? (w[0] !== 0 ? 1 : 0) : 1), net2 = { handWeights: () => Float32Array.of(0, 0) };
    const p2 = T.prune(net2, Float32Array.of(1, 1), { scoreFn: sc3 }), p1 = T.prune(net2, Float32Array.of(1, 1), { scoreFn: sc3, maxPasses: 1 });
    ok("!! A SECOND PASS PUTS BACK THE WEIGHT THAT ONLY MATTERED BECAUSE OF ANOTHER, AND THE CAP STOPS IT: weight 0 earns the score while weight 1 is set, and weight 1 earns nothing; the first pass can only put weight 1 back (weight 0 then costs nothing, which the second pass sees) -- two passes leave nothing kept, a cap of one pass leaves weight 0; the input vector is not edited", p2.kept === 0 && p2.passes === 2 && same(Array.from(p2.weights), [0, 0]) && p1.kept === 1 && p1.passes === 1 && same(Array.from(p1.weights), [1, 0]) && (() => { const w = Float32Array.of(1, 1); T.prune(net2, w, { scoreFn: sc3 }); return same(Array.from(w), [1, 1]); })());
});

console.log("\n5. THE VERDICT");
section(() => {
    const ev = (score, killed) => ({ score, killed }), hand = { heldOut: ev(0.5, 10), audit: ev(0.6, 20) }, champ = (hs, hk, as, ak) => ({ heldOut: ev(hs, hk), audit: ev(as, ak) });
    const good = T.qualifies(champ(0.6, 10, 0.7, 21), hand), cases = [["held-out score", champ(0.5, 10, 0.7, 21)], ["audit score", champ(0.6, 10, 0.6, 21)], ["held-out kills", champ(0.6, 9, 0.7, 21)], ["audit kills", champ(0.6, 10, 0.7, 19)]];
    const res = cases.map(([w, c]) => [w, T.qualifies(c, hand)]);
    ok("!! A CHAMPION QUALIFIES ONLY IF IT BEATS THE HAND GUNNER'S SCORE ON BOTH THE HELD-OUT AND THE AUDIT FIGHTS AND LOSES NO KILLS ON EITHER: better on both with a kill more qualifies (no reasons), and each of the four conditions failed alone refuses with exactly one reason that names it -- a tie on the score refuses (strictly better), a tie on the kills does not", good.ok === true && good.reasons.length === 0 && res.every(([w, r]) => r.ok === false && r.reasons.length === 1 && r.reasons[0].includes(w)) && T.qualifies(champ(0.6, 10, 0.7, 20), hand).ok === true && T.qualifies(champ(0.4, 5, 0.5, 5), hand).reasons.length === 4, res.map(([w, r]) => w + ": " + r.reasons.join("")).join(" | "));
});

console.log("\n6. THE COMMAND'S ARGUMENTS");
section(() => {
    const d = T.parseArgs([]), m = T.parseArgs(["--net", "mlp", "--runs", "3", "--iters", "50", "--seed", "9", "--sigma", "0.1", "--passes", "1", "--live", "0.2", "--write", "--quiet", "--out", "x.json"]), refuse = (a) => { try { T.parseArgs(a); return null; } catch (e) { return e.message; } };
    ok("!! DEFAULTS AND EVERY OPTION: with none it trains the fruit fly's with the recipe, writes nothing, is not quiet and would write brain/seatGunnerWeightsDefault.json; asked, the GPU brain's file is the default and each option is read as a number or a flag", d.net === "fruitfly" && d.runs === 2 && d.iters === 300 && d.seed === 3000 && d.sigma === 0.3 && d.maxK === 4 && d.passes === 2 && d.liveShare === 0.5 && d.write === false && d.quiet === false && d.out === T.DEFAULT_OUT.fruitfly && T.parseArgs(["--net", "mlp"]).out === T.DEFAULT_OUT.mlp
        && m.net === "mlp" && m.runs === 3 && m.iters === 50 && m.seed === 9 && m.sigma === 0.1 && m.passes === 1 && m.liveShare === 0.2 && m.write === true && m.quiet === true && m.out === "x.json");
    const bad = [["--bogus"], ["--runs"], ["--runs", "abc"], ["--net", "owl"], ["extra"], ["--sigma", "NaN"]].map(refuse);
    ok("!! A TYPO MUST NOT TRAIN THE DEFAULT RECIPE: an unknown option, an option with no value, a word for a number, an unknown network, a bare argument and NaN are each REFUSED with a message that names the problem (unknown option, needs a value, needs a number, --net must be, unexpected argument)", bad.every((x) => x !== null) && /unknown option/.test(bad[0]) && /needs a value/.test(bad[1]) && /needs a number/.test(bad[2]) && /--net must be/.test(bad[3]) && /unexpected argument/.test(bad[4]) && /needs a number/.test(bad[5]), bad.join(" | "));
});

console.log("\n7. THE PROCEDURE (run() on a handful of short fights)");
section(() => {
    const sets = { train: [{ kind: "bow", seed: 1 }], heldOut: [{ kind: "swarm", seed: 11 }, { kind: "bow", seed: 12 }], audit: [{ kind: "bow", seed: 21 }], seconds: 20 }, opts = { runs: 2, iters: 3, seed: 3000, sigma: 0.3, maxK: 4, passes: 1, net: "fruitfly" };
    const lines = [], r = T.run(SG, opts, (l) => lines.push(l), sets), again = T.run(SG, opts, () => {}, sets);
    const best = r.runs.slice().sort((a, b) => b.heldOut.score - a.heldOut.score)[0];
    ok("!! run() FLIES THE WHOLE PROCEDURE: the hand gunner on the three sets, two searches of three iterations from seeds 3000 and 3001, each pruned and graded on the held-out fights, the champion the one with the better held-out score and graded on the audit and the train fights, the three other sights flown for the hand and the champion, and a verdict that is qualifies()'s own on those numbers",
        r.runs.length === 2 && r.runs[0].seed === 3000 && r.runs[1].seed === 3001 && r.champion.seed === best.seed && r.champion.heldOut.score === best.heldOut.score && Object.keys(r.others).join() === "perfect,ace,regular" && Object.values(r.others).every((o) => o.hand.runs.length === 1 && o.champion.runs.length === 1) && JSON.stringify(r.verdict) === JSON.stringify(T.qualifies(r.champion, r.hand)) && r.hand.heldOut.runs.length === 2 && r.champion.audit.runs.length === 1 && r.champion.train.runs.length === 1, `champion seed ${r.champion.seed}`);
    const stubNet = () => { let cur = 0; return { WEIGHT_COUNT: 2, handWeights: () => Float32Array.of(0, 0), rngFor: (seed) => { cur = seed; return () => 0.5; }, mutate: () => Float32Array.from(cur === 3000 ? [0, 1] : [-1, 0]),
        gunnerFactory: (w, makeSight) => (seat, k) => { const sight = makeSight(seat, k); return (...a) => { const q = sight(...a); if (w[0] < 0) return { ...q, fire: false }; if (w[1] > 0 && q.target != null) return { ...q, fire: true }; return q; }; } }; };
    const sSets = { train: [{ kind: "bow", seed: 1 }], heldOut: [{ kind: "swarm", seed: 11 }, { kind: "bow", seed: 12 }], audit: [{ kind: "bow", seed: 21 }], seconds: 20 }, rs = T.run(stubNet(), { ...opts, passes: 1, liveShare: 0 }, () => {}, sSets);
    ok("!! THE CHAMPION IS THE SEARCH THAT DID BEST ON THE HELD-OUT FIGHTS, AND EVERY SET IS FLOWN ON ITS OWN FIGHTS: with a made-up gunner (weight 1 fires at any target, weight 0 below zero never fires) and children scripted by seed, search 3000 finds the firing gunner and search 3001 only a gunner that loses and is rejected; the champion is 3000's, at (0, 1), better than the hand gunner on the held-out fights (its two fights, seeds 11 and 12) and on the audit (seed 21), the train fights are seed 1, and it qualifies",
        rs.runs.map((q) => q.seed).join() === "3000,3001" && same(Array.from(rs.runs[0].weights), [0, 1]) && same(Array.from(rs.runs[1].weights), [0, 0]) && rs.champion.seed === 3000 && same(Array.from(rs.champion.weights), [0, 1]) && rs.champion.heldOut.score > rs.hand.heldOut.score && rs.champion.audit.score > rs.hand.audit.score && rs.champion.heldOut.runs.map((q) => q.seed).join() === "11,12" && rs.champion.audit.runs.map((q) => q.seed).join() === "21" && rs.champion.train.runs.map((q) => q.seed).join() === "1" && rs.hand.heldOut.runs.map((q) => q.seed).join() === "11,12" && rs.hand.audit.runs.map((q) => q.seed).join() === "21" && rs.hand.train.runs.map((q) => q.seed).join() === "1" && rs.verdict.ok === true && rs.others.regular.champion.runs[0].seed === 21, `${rs.champion.heldOut.score.toFixed(3)} against ${rs.hand.heldOut.score.toFixed(3)}`);
    ok("and it says what it did, in order -- the hand gunner, each search, the champion, the three other sights, the verdict (eight lines) -- and the same options give the same weights to the bit, search for search", lines.length === 8 && /^hand gunner/.test(lines[0]) && /^  run 1\/2 seed 3000/.test(lines[1]) && /^  run 2\/2 seed 3001/.test(lines[2]) && /^champion \(seed/.test(lines[3]) && /perfect sight/.test(lines[4]) && /ace sight/.test(lines[5]) && /regular sight/.test(lines[6]) && /^(QUALIFIES|DOES NOT QUALIFY)/.test(lines[7]) && r.runs.every((x, i) => same(Array.from(x.weights), Array.from(again.runs[i].weights))), lines[7].slice(0, 80));
});

console.log("\n8. THE FILE WRITTEN");
section(() => {
    const fake = (s, k) => ({ score: s, killed: k, damage: 200, wins: 0, rounds: 1000, hits: 900, runs: Array(12).fill({}) });
    for (const [n, m] of Object.entries(NETS)) {
        const opts = T.parseArgs(["--net", n, "--runs", "2", "--seed", "3010"]), res = { hand: { audit: fake(0.6, 20) }, champion: { seed: 3011, weights: m.handWeights(), kept: 3, moved: 7, heldOut: fake(0.75, 30), audit: fake(0.7, 25) } };
        const blob = T.blobOf(m, res, opts), back = PB.importBrain(PB.describePolicy(T.POLICY_ID[n], m), blob);
        ok(`!! THE ${n === "mlp" ? "GPU BRAIN" : "FRUIT FLY"}'S FILE is a swek-brain-v1 blob the page's importBrain accepts (${m.WEIGHT_COUNT} weights, the policy id ${T.POLICY_ID[n]}, the weights back to the bit), whose score is the champion's held-out 0.750 and whose \`by\` names the recipe (seed 3011 of 2 runs 3010..3011, sigma, the weights a child, the iterations, the sight, the pruning: 3 of ${m.WEIGHT_COUNT} differ from the hand gunner) and all three scores in the library's own words`,
            back.ok && same(Array.from(back.weights), Array.from(m.handWeights())) && blob.weightCount === m.WEIGHT_COUNT && blob.policy === T.POLICY_ID[n] && back.meta.score === 0.75 && blob.by.includes("seed 3011 of 2 runs (3010..3011)") && blob.by.includes("sigma 0.3") && blob.by.includes("1-4 weights per child") && blob.by.includes("green sight") && blob.by.includes(`3 of ${m.WEIGHT_COUNT} weights differ from the hand gunner`) && blob.by.includes(T.describeEval(fake(0.75, 30))) && blob.by.includes(T.describeEval(fake(0.7, 25))) && blob.by.includes(T.describeEval(fake(0.6, 20))) && blob.by.includes("champion picked on held-out") && !!blob.citation, blob.by.slice(0, 60));
    }
});

console.log("\n9. THE SHIPPED FILES");
section(() => {
    let handHeld = null, handAudit = null;
    const present = Object.entries(NETS).filter(([n]) => fs.existsSync(T.DEFAULT_OUT[n]));
    if (!present.length) { ok("no gunner network is shipped yet: there is nothing for the page to offer and nothing here to grade (a trainer that finds no network better than the hand gunner ships none)", true); return; }
    for (const [n, m] of present) {
        const blob = JSON.parse(fs.readFileSync(T.DEFAULT_OUT[n], "utf8")), back = PB.importBrain(PB.describePolicy(T.POLICY_ID[n], m), blob);
        handHeld ??= T.evaluate(m, null, T.HELD_OUT_FIGHTS); handAudit ??= T.evaluate(m, null, T.AUDIT_FIGHTS);
        const h = T.evaluate(m, back.weights, T.HELD_OUT_FIGHTS), a = T.evaluate(m, back.weights, T.AUDIT_FIGHTS);
        ok(`!! THE SHIPPED ${n === "mlp" ? "GPU BRAIN" : "FRUIT FLY"} GUNNER IS WHAT ITS FILE SAYS: it loads (${m.WEIGHT_COUNT} weights), its score is the held-out score the held-out fights give it now (${h.score.toFixed(3)}), its \`by\` quotes the held-out and the audit results and the hand gunner's audit in the library's own words -- recomputed here -- and it BEATS the hand gunner on both (held-out ${h.score.toFixed(3)} against ${handHeld.score.toFixed(3)}, audit ${a.score.toFixed(3)} against ${handAudit.score.toFixed(3)}) without losing a kill`,
            back.ok && back.weights.length === m.WEIGHT_COUNT && back.meta.score === Number(h.score.toFixed(3)) && blob.by.includes(T.describeEval(h)) && blob.by.includes(T.describeEval(a)) && blob.by.includes(T.describeEval(handAudit)) && T.qualifies({ heldOut: h, audit: a }, { heldOut: handHeld, audit: handAudit }).ok, T.describeEval(a).slice(0, 70));
    }
});

console.log("\n10. THE FRONT DOOR");
section(() => {
    const want = "AUDIT_FIGHTS,DEFAULT_OUT,HELD_OUT_FIGHTS,KINDS,POLICY_ID,RECIPE,SECONDS,SIGHT,TRAIN_FIGHTS,blobOf,describeEval,evaluate,parseArgs,prune,qualifies,run,scoreOf,train";
    ok("!! the export list is pinned: AUDIT_FIGHTS, DEFAULT_OUT, HELD_OUT_FIGHTS, KINDS, POLICY_ID, RECIPE, SECONDS, SIGHT, TRAIN_FIGHTS, blobOf, describeEval, evaluate, parseArgs, prune, qualifies, run, scoreOf, train", Object.keys(T).sort().join() === want, Object.keys(T).sort().join());
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
