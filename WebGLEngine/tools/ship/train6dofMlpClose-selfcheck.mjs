// WebGLEngine/tools/ship/train6dofMlpClose-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/train6dofMlpClose-selfcheck.mjs      (~35 s)
//
// THE GATE OF tools/ship/train6dofMlpClose.mjs (and its command, tools/ship/trainMlp6dofClose.mjs): Round 3 of the GPU Brain's 6-DOF arc, the close-quarters recipe, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
// *** NOTHING HERE FLIES A REGISTERED HELD-OUT, AUDIT OR CHECK SEED, AND NOTHING HERE STARTS THE COMMAND'S ROUND. *** The miniature is handed scratch seeds (99900 up), and the command's guards are held as the
// library functions they are plus the order the command calls them in; the only executions are --write-from on planted files, which cannot reach a round.
//
//   1  THE REGISTRATION, AS CODE: the profile IS train6dofLeague.mjs's PROFILES.close and the duel its duelOf() (collisions on, ram penalty 0, both starts); the recipe is that profile's with only the search
//      seeds changed; the train and held-out seeds ARE that profile's; the audit (6401-6440) is fresh and clear of every block flown before; the check seeds are the first round's audit; qualifies() and
//      LEAD_FLOOR ARE train6dofLeague.mjs's and H2's floor is LEAD_FLOOR per start; the start and the league are Round 2's; the close-quarters pilot is the registered file, and another file is refused
//   2  THE RULE ON MADE-UP NUMBERS: qualifies() with PROFILES.close at each of its six edges (the floor of 16 over 160 games, the mirror, the held-out lead, each start not behind, the autopilot's losses and
//      score), each crossed edge refused for exactly its own reason, the league profile passing what the close profile refuses, and H2 at its edge
//   3  THE ROUND ON A MINIATURE (two searches of 30 iterations on one scratch train seed, scratch held-out, audit and check seeds): C-files first, the searches and the determinism twin in one call, every
//      search trained AND pruned under the close duel (an independent search reproduces the first to the bit, and the same search without it does not), pruned toward the START, the champion the best
//      held-out under the close duel (a planted pair whose orders disagree), the audit keeping every game with its start, read against the right opponents (recomputed independently), the verdict
//      qualifies() with the close profile, H2 from the same games, C-files and C-determinism able to fail
//   4  THE COMMAND: it never overwrites, refuses an option it does not know, prints no score, and writes the weight file only from a results file whose champion qualified
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner, this gate run, the file restored byte-identical (sha256); the number is the rows that went red, by name:
//   G1 the duel without collisions 6 | G2 the duel in the standoff alone 9 | G3 the recipe at 600 iterations 1 | G4 the audit on a used block (6301) 1 | G5 the league's train seeds 1
//   G6 trained without the close duel 1 | G7 pruned without the close duel 3 | G8 pruned toward the hand weights 3 | G9 the pick on train score 2 | G10 the held-out league without the Default 1
//   G11 the held-out score without the close duel 1 | G12 the audit read against the autopilot 2 | G13 the audit's games kept without their start 2 | G14 the mirror without the close duel 2
//   G15 the autopilot check from side A alone 1 | G16 the verdict by the league profile 1 | G17 H2 at the league's floor 2 | G18 C-determinism always ok 1 | G19 the twin of the second search 2
//   G20 C-files ignoring the close file given 1 | G21 the close pilot's hash not checked 2 | G22 the report against the Default, not the close pilot 2 | G23 parseArgs accepting anything 1
//   G24 the weight file naming the league recipe 1 | G25 the command never refusing 1 | G26 --write-from writing whatever the verdict 2 | G27 the command printing the result 1
//   G28 the command running Round 2's library 1
//   FOUND BY THE SABOTAGES: G20 and G21 first went red only through section 3's guard ("searched": a run its C-files did not stop reached its searches and threw, ending the section before the C-files
//   row). The row now catches the throw itself, and both were run again against it: G20 1 and G21 2, by the rows' own names.
//   DESIGNED IN BEFORE THEM, so these rows could go red: (1) every independent recomputation uses train6dofLeague.duelOf(PROFILES.close), not the library's DOPTS, so a wrong duel cannot hide behind
//   itself; (2) the trained-and-pruned row carries its contrast (the same search without the close duel comes out different); (3) a row holds that every audit game keeps its start -- a game without
//   one falls out of both per-start subsets, each start then reads 0-0, and the rule's per-start check passes on nothing (G13); (4) each crossed edge on made-up numbers must carry exactly one reason:
//   a first draft's lead of 15 also put the score under the mirror's, so that row would have gone red for the wrong cause -- the mirror now sits 0.01 under each case's own audit score.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./train6dofMlpClose.mjs";
import * as L2 from "./train6dofMlpLeague.mjs";
import * as LG from "./train6dofLeague.mjs";
import * as T from "./train6dofMlp.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.join(HERE, "..", "..", "brain");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
/** The close duel, from train6dofLeague.mjs itself rather than from the library under test: every independent recomputation below uses this. */
const CLOSE = LG.duelOf(LG.PROFILES.close);
const cp = (x) => ({ score: x.score, wins: x.wins, losses: x.losses, draws: x.draws, hits: x.hits, hitsTaken: x.hitsTaken, rams: x.rams, ramHp: x.ramHp });
const games = (x) => x.wins + x.losses + x.draws;

console.log("1. THE REGISTRATION, AS CODE");
try {
    ok("!! the profile IS train6dofLeague.mjs's PROFILES.close and the duel is its duelOf(): collisions on, ram penalty 0, every game in both the standoff and the joust start, frozen",
        L.PROFILE === LG.PROFILES.close && J(L.DOPTS) === J(CLOSE) && L.DOPTS.collisions === true && L.DOPTS.ramPenalty === 0 && J(L.DOPTS.scenarios) === J(["standoff", "joust"]) && Object.isFrozen(L.DOPTS), J(L.DOPTS));
    const same = ["runs", "iters", "sigma", "maxK", "train"].every((k) => L.RECIPE[k] === LG.PROFILES.close.recipe[k]);
    ok("!! the recipe is the close profile's (4 searches x 500 iterations, sigma 0.3, 1-4 weights a child, 32 train seeds) with ONLY the search seeds changed (7200 against 5000), frozen",
        same && L.RECIPE.seed === 7200 && LG.PROFILES.close.recipe.seed === 5000 && L.RECIPE.runs === 4 && L.RECIPE.iters === 500 && L.RECIPE.sigma === 0.3 && L.RECIPE.maxK === 4 && L.RECIPE.train === 32 && Object.isFrozen(L.RECIPE), J(L.RECIPE));
    ok("!! the train and held-out seeds ARE the close profile's own (48: 601-648, of which the recipe trains on 601-632; 24: 701-724), and the check against the PD autopilot is the first round's audit (6101-6120)",
        L.TRAIN_SEEDS === LG.PROFILES.close.seeds.train && L.TRAIN_SEEDS === P6.CLOSE_TRAIN_SEEDS && L.HELD_SEEDS === LG.PROFILES.close.seeds.held && L.HELD_SEEDS === P6.CLOSE_HELD_OUT_SEEDS &&
        L.TRAIN_SEEDS.length === 48 && J(L.TRAIN_SEEDS.slice(0, L.RECIPE.train)) === J(range(601, 32)) && L.HELD_SEEDS.length === 24 && L.HELD_SEEDS[0] === 701 && L.AUTO_SEEDS === T.AUDIT_SEEDS && L.AUTO_SEEDS[0] === 6101);
    const used = new Set(L.USED_DUEL_SEEDS);
    ok("!! the audit is 40 fresh seeds (6401-6440), clear of every block flown before this round: Round 2's list, its audit (6301-6340), and this chat's scratch seeds through 100002 (the timing probe's 99801-99832 among them)",
        L.AUDIT_SEEDS.length === 40 && L.AUDIT_SEEDS[0] === 6401 && L.AUDIT_SEEDS[39] === 6440 && Object.isFrozen(L.AUDIT_SEEDS) && L.AUDIT_SEEDS.every((s) => !used.has(s)) &&
        L2.USED_DUEL_SEEDS.every((s) => used.has(s)) && [6301, 6340, 6101, 6240, 601, 701, 801, 99702, 99801, 99832, 100002].every((s) => used.has(s)), `${used.size} seeds held clear of`);
    ok("!! qualifies() IS train6dofLeague.mjs's, LEAD_FLOOR (8) and REGRESSION_SLACK (0.5) are its own, and H2's floor is LEAD_FLOOR per start (16)",
        L.qualifies === LG.qualifies && L.LEAD_FLOOR === LG.LEAD_FLOOR && L.LEAD_FLOOR === 8 && L.REGRESSION_SLACK === LG.REGRESSION_SLACK && L.REGRESSION_SLACK === 0.5 && L.H2_FLOOR === 16);
    const start = L.startWeights(), fly = T.flyDefault(), lg = L.leagueOf(fly), close = L.closePilot();
    ok("!! C-files: the start and the league are Round 2's own functions (its gate holds the start to its hash): the champion 0ffd8554, the PD autopilot and the registered Default 215e26d9; the close-quarters pilot is 360580a7 through the fruit fly's importer",
        L.startWeights === L2.startWeights && L.leagueOf === L2.leagueOf && weightsHash(start) === "0ffd8554" && start.length === M.WEIGHT_COUNT && lg.length === 2 && lg[0] === "autopilot" && lg[1] === fly &&
        weightsHash(fly) === "215e26d9" && L.CLOSE_HASH === "360580a7" && weightsHash(close) === "360580a7" && close.length === P6.WEIGHT_COUNT);
    let byHash = null, byNet = null;
    try { L.closePilot(path.join(BRAIN, "pilot6dofWeightsDefault.json")); } catch (e) { byHash = e.message; }
    try { L.closePilot(path.join(BRAIN, "pilot6dofMlpWeightsDefault.json")); } catch (e) { byNet = e.message; }
    ok("!! ...and another file is REFUSED as the close-quarters pilot: the fruit fly's Default (the right network, other weights) by its hash, and the GPU Brain's start (another network) by the importer",
        /not the registered 360580a7/.test(byHash || "") && /does not import/.test(byNet || ""), `${byHash} | ${byNet}`);
} catch (e) { guard(1, e); }

console.log("\n2. THE RULE ON MADE-UP NUMBERS (the close profile)");
try {
    // made-up games in the shape evaluateLeague() writes them (one per game, from the pilot's side, with its start): a win scores 10, a loss -10, a draw 0
    const mk = (sc, w, l, d) => [...Array(w).fill(0).map(() => ({ scenario: sc, score: 10, win: true, aDead: false, bDead: true, hits: 6, hitsTaken: 0, rams: 0, ramHp: 0 })),
                                 ...Array(l).fill(0).map(() => ({ scenario: sc, score: -10, win: false, aDead: true, bDead: false, hits: 0, hitsTaken: 6, rams: 0, ramHp: 0 })),
                                 ...Array(d).fill(0).map(() => ({ scenario: sc, score: 0, win: false, aDead: false, bDead: false, hits: 0, hitsTaken: 0, rams: 0, ramHp: 0 }))];
    const vs = (so, jo) => P6.subset({ runs: [...mk("standoff", ...so), ...mk("joust", ...jo)] }, () => true), r = (score, wins, losses, draws = 0) => ({ score, wins, losses, draws, hits: 0, hitsTaken: 0 });
    // the edge: 160 games, a lead of exactly 16 (16 in the standoff, exactly 0 in the joust), a score 0.01 above the mirror's (1.00 against 0.99), a held-out lead of 1, the autopilot's losses equal and the
    // score 0.5 under. The mirror sits 0.01 under whatever audit a case builds, so a case that moves the games crosses only the edge it names.
    const base = (so = [30, 14, 36], jo = [20, 20, 40]) => { const v = vs(so, jo); return { audit: { vsPrev: v, mirror: r(v.score - 0.01, 40, 40, 80) }, heldOut: { vsPrev: r(1, 12, 11, 73) }, auto: { champ: r(19.4, 40, 0, 40), prev: r(19.9, 40, 0, 40) } }; };
    const q = (c, profile = LG.PROFILES.close) => L.qualifies(c, profile), edge = base();
    ok("!! a champion at every edge QUALIFIES under the close profile: a lead of exactly 16 over 160 games, exactly even in the joust, a score above the mirror's, a held-out lead of 1, no more losses to the autopilot, a score 0.5 below the start's",
        q(edge).ok && games(edge.audit.vsPrev) === 160 && edge.audit.vsPrev.wins - edge.audit.vsPrev.losses === 16 && edge.audit.vsPrev.score === 1, J(q(edge)));
    const crossed = {
        "a lead of 15": [base([29, 14, 37]), /audit: leads the shipped pilot by 15 games .*under the floor of 16/],
        "the joust one game behind, the total still 16": [base([31, 14, 35], [19, 20, 41]), /audit, joust start: 19 won and 20 lost against the shipped pilot is behind it/],
        "the standoff one game behind, the total still 16": [base([14, 15, 51], [37, 20, 23]), /audit, standoff start: 14 won and 15 lost against the shipped pilot is behind it/],
        "a score equal to the mirror's": [(() => { const c = base(); c.audit.mirror.score = c.audit.vsPrev.score; return c; })(), /does not beat the shipped pilot's own 1\.00/],
        "a held-out lead of 0": [(() => { const c = base(); c.heldOut.vsPrev.losses = 12; return c; })(), /held-out: 12 won and 12 lost/],
        "one more loss to the autopilot than the start": [(() => { const c = base(); c.auto.champ.losses = 1; return c; })(), /loses 1 games where the shipped pilot loses 0/],
        "a score more than 0.5 under the start's": [(() => { const c = base(); c.auto.champ.score = 19.39; return c; })(), /scores 19\.39, more than 0\.5 under the shipped pilot's 19\.90/],
    };
    const wrongs = Object.entries(crossed).filter(([, [c, re]]) => { const v = q(c); return v.ok || v.reasons.length !== 1 || !re.test(v.reasons[0]); }).map(([k, [c]]) => `${k}: ${J(q(c).reasons)}`);
    ok("!! ...and each edge, crossed, does not -- each refused for exactly its own reason: a lead of 15; the joust or the standoff one game behind with the total still 16; a score equal to the mirror's; a held-out lead of 0; one more loss to the autopilot; a score more than 0.5 under",
        wrongs.length === 0, wrongs.length ? wrongs.join(" || ").slice(0, 300) : `${Object.keys(crossed).length} edges`);
    const behind = crossed["the joust one game behind, the total still 16"][0];
    ok("!! the profile is what refuses it: the league profile (a floor of 8, no start checked) passes the champion that is one game behind in the joust", q(behind, LG.PROFILES.league).ok && !q(behind).ok);
    ok("!! H2 at its edge: a gain of exactly 16 over the start's lead is met, 15 is not", L.h2Of(-84, -100).met && L.h2Of(-84, -100).gain === 16 && !L.h2Of(-85, -100).met);
} catch (e) { guard(2, e); }

console.log("\n3. THE ROUND ON A MINIATURE (scratch seeds only)");
try {
    const opts = { runs: 2, iters: 30, seed: 99900, sigma: 0.3, maxK: 4, train: 1, trainSeeds: [99901], heldSeeds: range(99911, 2), auditSeeds: range(99921, 2), autoSeeds: [99931] };
    const calls = [], raw = [];
    const seq = async (seeds) => { calls.push([...seeds]); const out = seeds.map((seed) => L.searchOne({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSeeds: opts.trainSeeds })); raw.push(...out); return out; };
    const r = await L.run(opts, seq), start = L.startWeights(), fly = T.flyDefault(), lg = L.leagueOf(fly), close = L.closePilot();
    ok("!! C-files first (the start, the Default and the close-quarters pilot), then ONE call with the searches AND the determinism twin of the first (99900, 99901, then 99900 again); the result names its profile and duel and says it did not use the registered seeds",
        r.cFiles && r.cFiles.ok && r.cFiles.close === "360580a7" && calls.length === 1 && J(calls[0]) === J([99900, 99901, 99900]) && r.registeredSeeds === false && !r.stopped && r.profile === "close" && J(r.duel) === J(CLOSE), J(calls));
    const fromStart = (w) => w.filter((v, i) => Math.abs(v - start[i]) > 1e-6).length;
    ok("!! every search is pruned toward the START: in each, the weights that differ from the start are exactly the ones it kept, and the miniature is not empty (the first search kept weights, so this is not 0 = 0)",
        raw.length === 3 && raw.every((s) => fromStart(s.weights) === s.kept) && raw[0].kept > 0, raw.map((s) => `${s.seed}: ${s.moved} moved, ${s.kept} kept`).join(", "));
    const f = M.train({ seed: 99900, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start, trainSeeds: opts.trainSeeds, opponent: lg, ...CLOSE });
    const p = M.prune(f.weights, { toward: start, trainSeeds: opts.trainSeeds, opponent: lg, ...CLOSE });
    const g = M.train({ seed: 99900, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start, trainSeeds: opts.trainSeeds, opponent: lg });
    ok("!! each search is trained AND pruned under the close duel: an independent M.train with collisions on in both starts, then M.prune toward the start under the same duel, reproduces the first search to the bit -- and the same search in the standoff alone without collisions does not (so this row can tell)",
        raw[0].improved === f.improved && raw[0].neutral === f.neutral && raw[0].moved === p.moved && raw[0].kept === p.kept && raw[0].hash === weightsHash(p.weights) && raw[0].trainScore === p.trainScore &&
        (g.improved !== f.improved || g.neutral !== f.neutral || weightsHash(g.weights) !== weightsHash(f.weights)), `${f.improved}+${f.neutral} under the close duel, ${g.improved}+${g.neutral} without it`);
    const heldIndep = raw.slice(0, 2).map((s) => cp(M.evaluate(Float32Array.from(s.weights), opts.heldSeeds, { opponent: lg, ...CLOSE })));
    const best = [...r.searches].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed)[0];
    ok("!! the champion is the best HELD-OUT league search under the close duel (each search's held-out score recomputed here independently), and its weights are that search's",
        r.searches.every((s, k) => J(cp(s.held)) === J(heldIndep[k])) && r.champion.seed === best.seed && r.champion.differsFromStart === r.champion.kept && r.champion.weights.length === M.WEIGHT_COUNT &&
        weightsHash(Float32Array.from(r.champion.weights)) === raw.find((s) => s.seed === best.seed).hash, `champion ${r.champion.seed}, ${r.champion.kept} kept`);
    const vp = r.champion.audit.vsPrev, by = (sc) => P6.subset(vp, (x) => x.scenario === sc), so = by("standoff"), jo = by("joust");
    ok("!! the champion's audit against the Default keeps EVERY game with its start, so the rule's per-start check reads real games: 2 seeds x 2 starts x 2 sides = 8, each start half of them, the two summing to the whole",
        Array.isArray(vp.runs) && vp.runs.length === 8 && games(vp) === 8 && games(so) === 4 && games(jo) === 4 && so.wins + jo.wins === vp.wins && so.losses + jo.losses === vp.losses &&
        vp.runs.filter((x) => x.side === "A").length === 4 && vp.runs.filter((x) => x.side === "B").length === 4, `standoff W${so.wins}/L${so.losses}, joust W${jo.wins}/L${jo.losses}`);
    ok("!! the verdict is qualifies(champion, PROFILES.close) -- not the league profile's -- and H2 is read from the same audit games at the floor of 16",
        J(r.verdict) === J(L.qualifies(r.champion, LG.PROFILES.close)) && J(r.verdict) !== J(L.qualifies(r.champion, LG.PROFILES.league)) && /under the floor of 16/.test(r.verdict.reasons.join(" ")) &&
        r.h2.champLead === vp.wins - vp.losses && r.h2.startLead === r.champion.audit.start.wins - r.champion.audit.start.losses && r.h2.met === (r.h2.gain >= 16), J(r.h2));
    const cw = Float32Array.from(r.champion.weights), sub = (res) => Object.fromEntries(["standoff", "joust"].map((sc) => [sc, cp(P6.subset(res, (x) => x.scenario === sc))]));
    const iv = { vsPrev: M.evaluate(cw, opts.auditSeeds, { opponent: [fly], ...CLOSE }), mirror: P6.evaluate(fly, opts.auditSeeds, { opponent: [fly], ...CLOSE }), start: M.evaluate(start, opts.auditSeeds, { opponent: [fly], ...CLOSE }),
                 held: M.evaluate(cw, opts.heldSeeds, { opponent: [fly], ...CLOSE }), autoC: M.evaluate(cw, opts.autoSeeds, { opponent: ["autopilot"], ...CLOSE }), autoS: M.evaluate(start, opts.autoSeeds, { opponent: ["autopilot"], ...CLOSE }),
                 vsClose: M.evaluate(cw, opts.auditSeeds, { opponent: [close], ...CLOSE }) };
    const pairs = [["the champion against the Default", vp, iv.vsPrev], ["the Default against itself", r.champion.audit.mirror, iv.mirror], ["the start against the Default", r.champion.audit.start, iv.start],
                   ["the held-out record", r.champion.heldOut.vsPrev, iv.held], ["the champion against the autopilot", r.champion.auto.champ, iv.autoC], ["the start against the autopilot", r.champion.auto.prev, iv.autoS],
                   ["the report's champion against the close-quarters pilot", r.report.vsClose, iv.vsClose]];
    const off = pairs.filter(([, mine, theirs]) => J(cp(mine)) !== J(cp(theirs))).map(([n]) => n);
    ok("!! the audit is read against the RIGHT opponents under the close duel, recomputed here independently: the champion, the Default's mirror and the start against the Default; the held-out record; both against the PD autopilot on the check seeds; and the report's champion against the close-quarters pilot",
        off.length === 0 && games(iv.autoC) === 4 && games(iv.vsClose) === 8, off.length ? "off: " + off.join(", ") : "7 tallies");
    ok("  ...and the per-start tallies the report carries are those games split by start: the champion's and the start's against the Default, the mirror's, and the champion's against the close-quarters pilot",
        J(r.report.vsPrevByStart) === J(sub(iv.vsPrev)) && J(r.champion.audit.start.byStart) === J(sub(iv.start)) && J(r.champion.audit.mirror.byStart) === J(sub(iv.mirror)) && J(r.report.vsClose.byStart) === J(sub(iv.vsClose)));
    ok("!! C-determinism: the twin of the first search gave the same weights to the bit, and that search kept weights (so the twin is a real repeat, not two copies of the start)",
        r.cDeterminism && r.cDeterminism.ok && r.cDeterminism.seed === 99900 && r.cDeterminism.first === r.cDeterminism.again && raw[0].kept > 0 && raw[2].hash === raw[0].hash, `${raw[0].kept} kept`);
    const w = Array.from(start), hh = weightsHash(start), mini = { start, fly, close, heldSeeds: range(99941, 2), auditSeeds: [99951], autoSeeds: [99961] };
    // the pick where train and held-out DISAGREE: seed 1 is a pilot of zeros (it never fires) with the higher train score, seed 2 the start with the lower one
    const planted = [{ seed: 1, weights: new Array(M.WEIGHT_COUNT).fill(0), hash: "zeros", trainScore: 30, kept: 0, moved: 0 }, { seed: 2, weights: w, hash: hh, trainScore: 10, kept: 0, moved: 0 }];
    const fin = L.finish(planted, null, mini);
    const heldBest = [...fin.searches].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed)[0].seed, trainBest = [...fin.searches].sort((a, b) => b.trainScore - a.trainScore)[0].seed;
    ok("!! the pick is on held-out alone: of two planted searches whose orders DISAGREE, the champion is the held-out one (seed 2), not the train one (seed 1)", fin.champion.seed === 2 && heldBest === 2 && trainBest === 1, `held-out picks ${heldBest}, train would pick ${trainBest}`);
    const bad = L.finish(planted, { seed: 1, hash: "deadbeef" }, mini);
    ok("!! C-determinism can fail: a twin with other weights is not ok", bad.cDeterminism && bad.cDeterminism.ok === false && bad.cDeterminism.again === "deadbeef");
    // a run its C-files do not stop reaches its searches, which throw here: caught, so THIS row goes red by its own name and the section carries on (the first sabotage run found G20 and G21 red only
    // through the section's guard, the throw having ended section 3 before this row was reached)
    const stopRun = async (o) => { try { return await L.run(o, async () => { throw new Error("searched"); }); } catch (e) { return { stopped: null, searched: e.message }; } };
    const stoppedStart = await stopRun({ ...opts, startFile: path.join(BRAIN, "pilot6dofWeightsDefault.json") }), stoppedClose = await stopRun({ ...opts, closeFile: path.join(BRAIN, "pilot6dofWeightsDefault.json") });
    ok("!! C-files can fail, and then nothing is searched: a wrong start file, or the Default handed in as the close-quarters pilot, stops the round before the first search",
        /C-files failed, so nothing was searched: the start does not import/.test(stoppedStart.stopped || "") && !stoppedStart.champion &&
        /C-files failed, so nothing was searched: the close-quarters pilot is [0-9a-f]{8}, not the registered 360580a7/.test(stoppedClose.stopped || "") && !stoppedClose.champion,
        `${stoppedStart.stopped || "SEARCHED"} | ${stoppedClose.stopped || "SEARCHED"}`);
    const blob = L.blobOf({ ...r, recipe: { runs: 4, iters: 500, seed: 7200, sigma: 0.3, maxK: 4, train: 32 } }), back = PB.importBrain(PB.describePolicy(L.POLICY_ID, M), blob), other = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), blob);
    ok("  the weight file round-trips as the GPU Brain's pilot with the close-quarters recipe in `by`, and the fruit fly's importer refuses it",
        back.ok && weightsHash(back.weights) === r.champion.hash && !other.ok && /CLOSE-QUARTERS recipe on the GPU Brain's MLP, from its champion 0ffd8554/.test(blob.by) && /\(7200\.\.7203\)/.test(blob.by) && /collisions on/.test(blob.by));
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (its round is never started)");
try {
    const cmd = path.join(HERE, "trainMlp6dofClose.mjs"), src = fs.readFileSync(cmd, "utf8"), code = src.replace(/\/\/.*$/gm, "");
    let typo = null; try { L.parseArgs(["--iter", "3"]); } catch (e) { typo = e.message; }
    const atParse = code.indexOf("parseArgs(argv)"), atRefuse = code.indexOf("refuseExisting(opts.results)"), atRun = code.indexOf("await run(opts");
    ok("!! the command never overwrites a results file and refuses an option it does not know: refuseExisting() and parseArgs() as the library has them, called in that order before run(), exiting 2 on either",
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /unknown option "--iter"/.test(typo || "") &&
        atParse > 0 && atRefuse > atParse && atRun > atRefuse && /process\.exit\(2\)/.test(code.slice(atRefuse, atRefuse + 120)) && /process\.exit\(2\)/.test(code.slice(atParse, atParse + 140)), typo);
    ok("!! ...and it is THIS round's command: it imports the close library (not Round 2's), and its default results file is brain/sixdofGpuCloseResults.json, which the round's weight file is not",
        /from "\.\/train6dofMlpClose\.mjs"/.test(code) && !/train6dofMlpLeague/.test(code) && path.basename(L.DEFAULT_RESULTS) === "sixdofGpuCloseResults.json" && path.basename(L.DEFAULT_OUT) === "pilot6dofMlpWeightsClose.json" &&
        L.parseArgs([]).results === L.DEFAULT_RESULTS);
    ok("  ...and it prints no score: the results go to the file, and the console says only where",
        !/describeEval|\.score|heldOut\.|audit\.|h2\.|report\./.test(code.replace(/result\.verdict && result\.verdict\.reasons|!result\.verdict \|\| !result\.verdict\.ok/g, "")) && /commit it before reading it/.test(code) &&
        (code.match(/console\.log\(/g) || []).length === 3, `${(code.match(/console\.log\(/g) || []).length} console.log calls (the two of --write-from, and where the results went)`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mlpclose-")), notOk = path.join(tmp, "n.json"); fs.writeFileSync(notOk, J({ verdict: { ok: false, reasons: ["planted"] } }));
    let wrote = ""; try { execFileSync(process.execPath, [cmd, "--write-from", notOk, "--out", path.join(tmp, "w.json")], { encoding: "utf8", stdio: "pipe" }); } catch (e) { wrote = String(e.stdout); }
    ok("!! --write-from writes no weight file from a results file whose champion did not qualify, and says why", /not written: the champion did not qualify -- planted/.test(wrote) && !fs.existsSync(path.join(tmp, "w.json")), wrote.trim());
    fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) { guard(4, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the round itself -- the registered run writes brain/sixdofGpuCloseResults.json, committed before it is read, and its verdict becomes section 5.");
process.exit(fails ? 1 : 0);
