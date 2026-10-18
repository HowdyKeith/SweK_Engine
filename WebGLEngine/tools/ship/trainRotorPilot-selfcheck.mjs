// WebGLEngine/tools/ship/trainRotorPilot-selfcheck.mjs -- UNNUMBERED (beside tools/ship/trainRotorPilot.mjs)
//
// Run: node tools/ship/trainRotorPilot-selfcheck.mjs      (~40 s)
//
// GRADES THE TOOL THAT MAKES THE HELICOPTER PILOTS, NOT THE PILOTS (tools/ship/trainFlightPilot-selfcheck.mjs is the aeroplane's). The tool's whole value is that it cannot flatter itself: several independent searches; a search is ELIGIBLE only if it ends no flight early
// on a pool of 60 starts that the hand pilot completes; the champion is the best held-out of the eligible; the audit, the reserve and a second 60-start safety audit are read ONCE and only for the champion (and not at all when no search is eligible); and a file is written
// only when that champion beats the hand pilot on the held-out and the audit scores, flies more audit scenarios better than worse, loses no kind of scenario, ends no more audit flights early, does not fly the reserve worse, and ends no flight early on the safety audit
// that the hand pilot completes. So this gate holds: the argument parser refuses what it does not know (a typo must not silently train the default recipe), the tail arithmetic and the qualification rule on tables of made-up results (each clause is the only thing that
// fails in its row), finish() driven with a STAND-IN POLICY whose flights the gate controls (so that "the better search is the dangerous one" is a fact of the setup and not a hope about a real search), the searches in child processes giving the bits the in-process ones
// give, the command with its side effects injected (it writes nothing without --write and nothing when the champion does not qualify), and the blob it writes. brain/pilotRotorPolicy-selfcheck.mjs and brain/pilotRotorMlp-selfcheck.mjs hold mutate/train/prune.
//
// NOT IN THIS GATE: the shipped files (brain/pilotRotorWeightsDefault.json, brain/pilotRotorMlpWeightsDefault.json): the aeroplane's gate has a section 9 that recomputes every number in a shipped file's `by`; this one gets it when a file is shipped, and not before -- a file is
// written only when a champion qualifies, and whether one does is the experiment.
//
// SABOTAGE LOG (each applied to the module in a scratch copy, the gate run, the copy discarded; the number is how many rows went red):
//   Each applied to tools/ship/trainRotorPilot.mjs in a scratch copy (R01-R40) or to the SHIPPED FILE brain/pilotRotorWeightsDefault.json in a scratch tree (FM01-FM12), the gate run on the copy (its children, which are
//   separate processes, run the copy too), the copy discarded; the number is how many rows went red. 52 mutants, none left at 0. FOUR OF THE FIRST 39 WERE FOUND BY THE FIRST RUN, TWO OF THEM AS CRASHES: Y (--slice
//   ignored by searchOne) and AA (the child not handed --slice) went 0 red because every comparison ran both sides with the same slice -- the search's reported train score is now held to its weights' score on the slice;
//   AJ (the champion's audit compared against the wrong set, which throws) and AN (a GPU blob written under the fruit fly's policy, which throws) crashed the gate with a stack trace and no failed row, so the gate now
//   turns anything that throws into a failed row by name and exits 1. (R01-R39 are lettered A-AN in the scratch files.) R40 (blobOf leaving the known limits out of `by`) and FM01-FM12 belong to section 9, the shipped
//   file: a weight moved, a number in `by` edited, the limits paragraph renamed, the policy renamed, the hand weights shipped as the trained pilot -- each a red row by name.
//   R01 parseArgs reads an unknown option 2; R02 qualifies: the audit-score clause dropped 2; R03 qualifies: held-out > loosened to >= 2; R04 finish: eligibility ignored 4; R05 finish: the champion picked on the train
//   score 2; R06 blobOf: the count of weights that differ left out 1; R07 command: --write writes though the champion does not qualify 1; R08 RECIPE iterations 800 1; R09 qualifies: the reserve-score clause dropped 2;
//   R10 qualifies: the kind clause dropped 3; R11 qualifies: better > worse loosened to >= 1; R12 tailReasons: the fresh-crash clause dropped 9; R13 command --one: runs search K+1 1; R14 searchOne: the prune skipped 3;
//   R15 dumpOf: the weights left out 1; R16 SETS: the pool is the safety audit 2; R17 KIND_SLACK 0.05 2; R18 finish: eligibility judged on the held-out set 3; R19 qualifies: the safety-audit clause dropped 2; R20 BRAINS
//   not frozen 1; R21 brainOf defaults to the GPU Brain 8; R22 setsOf always the fruit fly's 1; R23 SETS_GPU's audit is the fruit fly's 1; R24 endedEarly: an engine flight judged on its status 1; R25 searchOne ignores
//   --slice 3; R26 the write refusal with --slice dropped 1; R27 the child does not get --slice 1; R28 a brain's own seed ignored 1; R29 blob score is the audit's 1; R30 hand safety read from the pool 3; R31 an unknown
//   brain accepted 1; R32 tails counts nothing 6; R33 reserve crash clause dropped 2; R34 audit crash clause dropped 2; R35 the champion's vs read against the wrong set 1; R36 the --workers children not in run order 1;
//   R37 --dump not written 1; R38 the blob's citation is the other brain's 1; R39 the blob's policy is the fruit fly's 1; R40 blobOf leaves the known limits out of `by` 1; FM01 an output weight moved by 0.5 6; FM02 an
//   input weight moved by 0.5 6; FM03 the audit number in `by` edited 3; FM04 the limits paragraph renamed 3; FM05 the count of differing weights edited 3; FM06 the file's score edited 3; FM07 the policy named for the
//   other network 3; FM08 the weight count wrong 3; FM09 the recipe in `by` edited 3; FM10 the hand weights shipped as the trained pilot 8; FM11 the safety audit count in `by` edited 3; FM12 the citation edited 3.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as TR from "./trainRotorPilot.mjs";
import * as PP from "../../brain/pilotRotorPolicy.mjs";
import * as MR from "../../brain/pilotRotorMlp.mjs";
import * as RT from "../../brain/rotorTask.mjs";
import * as AR from "../../brain/autopilotRotor.mjs";
import * as RC from "../../physics/mechanics/rotorcraftModel6dof.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0, sliceErr = "";
// A THROW IS A RED ROW BY NAME, NOT A STACK TRACE (two of this gate's sabotages crashed it the first time: the champion's `versus` read against a set of another length, a GPU blob written under the fruit fly's policy): whatever throws, the gate says so as a failed row and exits 1
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const ids = (set) => new Set(set.map((s) => s.kind + s.seed));
const overlap = (a, b) => [...ids(a)].filter((x) => ids(b).has(x)).length;

sec("1. the argument parser");
const d0 = TR.parseArgs([]);
ok("no arguments is the recorded recipe: 4 runs x 600 iterations, seed 8000, sigma 0.3, 1-4 weights a child, one process, no write, the fruit fly", d0.runs === 4 && d0.iters === 600 && d0.seed === 8000 && d0.sigma === 0.3 && d0.maxK === 4 && d0.workers === 1 && d0.one === null && d0.write === false && d0.quiet === false && d0.dump === null && d0.brain === "fly");
ok("RECIPE is that recorded recipe, frozen, and parseArgs() starts from it; the default output is brain/pilotRotorWeightsDefault.json", Object.isFrozen(TR.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => TR.RECIPE[k] === d0[k]) && TR.DEFAULT_OUT === path.join(ENG, "brain", "pilotRotorWeightsDefault.json") && d0.out === TR.DEFAULT_OUT);
const d1 = TR.parseArgs(["--runs", "3", "--iters", "50", "--workers", "4", "--one", "2", "--maxK", "6", "--write", "--out", "x.json", "--dump", "d.json", "--quiet", "--seed", "5", "--sigma", "0.1"]);
ok("every option is read: --runs, --iters, --seed, --sigma, --maxK, --workers, --one, --out, --dump, --write, --quiet", d1.runs === 3 && d1.iters === 50 && d1.workers === 4 && d1.one === 2 && d1.maxK === 6 && d1.write === true && d1.out === "x.json" && d1.dump === "d.json" && d1.quiet === true && d1.seed === 5 && d1.sigma === 0.1);
const e1 = throws(() => TR.parseArgs(["--bogus"])), e2 = throws(() => TR.parseArgs(["--runs"])), e3 = throws(() => TR.parseArgs(["--runs", "many"])), e4 = throws(() => TR.parseArgs(["stray"])), e5 = throws(() => TR.parseArgs(["--brain", "frog"]));
ok("an unknown option, a missing value, a non-number, a stray argument and an unknown brain are each REFUSED with the reason (a typo must not silently train the default recipe)", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /needs a number/.test(e3) && /unexpected argument "stray"/.test(e4) && /--brain must be one of fly, gpu/.test(e5), [e1, e2, e3, e4, e5].join(" | "));

const sl = TR.parseArgs(["--slice", "7"]);
ok("--slice N is an option (default 1: the whole training set), and a sliced recipe is NEVER written: --write with --slice returns 2 before any training and says why", d0.slice === 1 && sl.slice === 7 && await TR.command(["--slice", "7", "--write"], { out: () => {}, err: (m) => { sliceErr = m; }, run: () => { throw new Error("trained"); } }).catch(() => -1) === 2 && /--write with --slice/.test(sliceErr));
sec("1b. the brain table: BRAINS, brainOf(), SETS_GPU and setsOf()");
const g0 = TR.parseArgs(["--brain", "gpu"]), g1 = TR.parseArgs(["--seed", "5", "--brain", "gpu"]), g2 = TR.parseArgs(["--brain", "gpu", "--out", "o.json"]);
ok("!! brainOf() is the FRUIT FLY for no brain named and for 'fly', the GPU Brain's entry for 'gpu', and BRAINS holds exactly those two, frozen; an unknown name is refused by name", TR.brainOf({}) === TR.BRAINS.fly && TR.brainOf({ brain: "fly" }) === TR.BRAINS.fly && TR.brainOf({ brain: "gpu" }) === TR.BRAINS.gpu && Object.keys(TR.BRAINS).join() === "fly,gpu" && Object.isFrozen(TR.BRAINS) && TR.BRAINS.fly.policy === PP && TR.BRAINS.gpu.policy === MR && /unknown brain "frog"/.test(throws(() => TR.brainOf({ brain: "frog" }))));
ok("--brain gpu takes the GPU Brain's seed (9000) and file (brain/pilotRotorMlpWeightsDefault.json), and an explicit --seed or --out beats them on either side of --brain", g0.seed === 9000 && g0.out === path.join(ENG, "brain", "pilotRotorMlpWeightsDefault.json") && g1.seed === 5 && g2.out === "o.json" && g0.brain === "gpu" && TR.BRAINS.fly.seed === 8000);
ok("!! setsOf() is SETS for the fruit fly and SETS_GPU for the GPU Brain, and the two differ ONLY in the audit and the safety audit (the same train, held-out, pool and reserve): SETS_GPU's audit is AUDIT2_SET and its safety audit SAFETY_AUDIT2_SET, the fruit fly's are AUDIT_SET and SAFETY_AUDIT_SET", TR.setsOf({}) === TR.SETS && TR.setsOf({ brain: "fly" }) === TR.SETS && TR.setsOf({ brain: "gpu" }) === TR.SETS_GPU && TR.SETS_GPU.train === TR.SETS.train && TR.SETS_GPU.heldOut === TR.SETS.heldOut && TR.SETS_GPU.pool === TR.SETS.pool && TR.SETS_GPU.reserve === TR.SETS.reserve && TR.SETS_GPU.audit === RT.AUDIT2_SET && TR.SETS_GPU.safetyAudit === RT.SAFETY_AUDIT2_SET && TR.SETS.audit === RT.AUDIT_SET && TR.SETS.safetyAudit === RT.SAFETY_AUDIT_SET && Object.isFrozen(TR.SETS) && Object.isFrozen(TR.SETS_GPU));

sec("2. the tails: endedEarly(), tails(), tailReasons()");
const flight = (kind, seed, o = {}) => ({ kind, seed, status: "airborne", settled: kind === "engine" ? true : undefined, score: -1, ...o });
const t0 = TR.tails({ runs: [flight("hover", 1, { status: "crashed" }), flight("hover", 2), flight("engine", 3, { settled: false, status: "crashed" }), flight("engine", 4), flight("recovery", 5, { status: "landed" }), flight("terrain", 6, { status: "lost" }), flight("engine", 7, { settled: false, status: "landed" })] });
ok("!! tails() counts what the flights say: n = 7; an engine flight ends early when it did not END STANDING (settled false: a crash, or a landing it did not stay on), any other kind when it did not stay airborne (crashed, landed, lost): hover:1, engine:3, recovery:5, terrain:6 and engine:7 -- and not an engine flight that landed and stood, nor a hover that flew on", t0.n === 7 && JSON.stringify(t0.crashed) === '["hover:1","engine:3","recovery:5","terrain:6","engine:7"]', t0.crashed.join(" "));
const H = { n: 60, crashed: ["engine:1001", "engine:1003"] };
const tr0 = TR.tailReasons({ n: 60, crashed: ["engine:1003"] }, H), tr1 = TR.tailReasons({ ...H, crashed: [...H.crashed, "hover:1004"] }, H), tr2 = TR.tailReasons({ n: 60, crashed: [] }, H);
ok("!! a tail no worse than the hand pilot's passes: a SUBSET of the flights the hand pilot ends early (a flight both end early is the dead man's curve, not the champion's fault), none at all, or the same two", tr0.length === 0 && tr2.length === 0 && TR.tailReasons(H, H).length === 0);
ok("!! ONE flight ended early that the hand pilot completes fails, by name and alone (and says where)", tr1.length === 1 && /on the safety pool it ends 1 flight early that the hand pilot completes \(hover:1004\)/.test(tr1[0]) && /on X /.test(TR.tailReasons({ n: 1, crashed: ["a:1"] }, { n: 1, crashed: [] }, "X")[0]), tr1[0]);
const tr4 = TR.tailReasons({ n: 60, crashed: ["a:1", "a:2", "a:3", "a:4", "a:5", "a:6"] }, { n: 60, crashed: [] });
ok("many new crashes are listed four at a time and then '...' (a long list must not bury the verdict)", tr4.length === 1 && /ends 6 flights early/.test(tr4[0]) && /a:1, a:2, a:3, a:4, \.\.\./.test(tr4[0]) && !/a:5/.test(tr4[0]), tr4[0]);
ok("endedEarly() is the id list tails() holds, in flight order, and is empty for flights that all stand", JSON.stringify(TR.endedEarly({ runs: [flight("hover", 1), flight("engine", 2)] })) === "[]" && TR.endedEarly({ runs: [flight("engine", 9, { settled: false }), flight("hover", 8, { status: "crashed" })] }).join() === "engine:9,hover:8");

sec("3. qualifies(): the only door to a written file");
const E = (score, crashed = 0, byKind = { hover: score, recovery: score, engine: score, terrain: score }) => ({ score, crashed, byKind });
const hand = { heldOut: E(-1.60), audit: E(-1.78, 11), reserve: E(-2.24, 7), safety: { n: 60, crashed: ["engine:2001"] } };
const good = { heldOut: E(-1.50), audit: E(-1.60, 10), reserve: E(-2.10, 6), safety: { n: 60, crashed: ["engine:2001"] }, vs: { better: 30, worse: 5 } };
const goodQ = TR.qualifies(good, hand);
ok("a champion ahead on the held-out and the audit score, with more audit scenarios better than worse, no more flights ended early, no kind of scenario lost, a reserve no worse and a safety audit no more dangerous qualifies, with no reasons", goodQ.ok && goodQ.reasons.length === 0, goodQ.reasons.join("; "));
const only = (mut) => TR.qualifies({ ...good, ...mut }, hand);
const q1 = only({ heldOut: E(-1.60) }), q2 = only({ audit: E(-1.78, 10) }), q3 = only({ vs: { better: 5, worse: 5 } }), q4 = only({ audit: E(-1.60, 12) });
ok("EQUAL IS NOT BETTER: a held-out score equal to the hand pilot's fails, naming the held-out score and nothing else", !q1.ok && q1.reasons.length === 1 && /held-out score/.test(q1.reasons[0]), q1.reasons.join("; "));
ok("an audit score no better than the hand pilot's fails on the audit score alone", !q2.ok && q2.reasons.length === 1 && /audit score/.test(q2.reasons[0]), q2.reasons.join("; "));
ok("as many scenarios flown worse as better fails on that alone, however well it scores on average (a few big wins can carry a mean)", !q3.ok && q3.reasons.length === 1 && /not more better than worse/.test(q3.reasons[0]), q3.reasons.join("; "));
ok("one more audit flight ended early than the hand pilot has fails on that alone", !q4.ok && q4.reasons.length === 1 && /audit flights ended early/.test(q4.reasons[0]), q4.reasons.join("; "));
const kinds = (h, r, e, t) => ({ hover: h, recovery: r, engine: e, terrain: t });
const hk = { ...hand, audit: E(-1.78, 11, kinds(-0.89, -0.77, -2.49, -1.93)) };
const q5 = TR.qualifies({ ...good, audit: E(-1.60, 10, kinds(-0.92, -0.70, -2.0, -1.5)) }, hk), q5b = TR.qualifies({ ...good, audit: E(-1.60, 10, kinds(-0.80, -0.70, -2.0, -1.97)) }, hk), edgeIn = TR.qualifies({ ...good, audit: E(-1.60, 10, kinds(-0.909, -0.77, -2.0, -1.93)) }, hk), edgeOut = TR.qualifies({ ...good, audit: E(-1.60, 10, kinds(-0.911, -0.77, -2.0, -1.93)) }, hk);
ok("A PILOT THAT LEARNS THE ENGINE-OUT CORNER AND FORGETS THE HOVER IS NOT SHIPPED: a kind of audit scenario scoring more than 0.02 below the hand pilot's fails on that kind alone, for the first kind and for the last", !q5.ok && q5.reasons.length === 1 && /hover audit scenarios/.test(q5.reasons[0]) && !q5b.ok && q5b.reasons.length === 1 && /terrain audit scenarios/.test(q5b.reasons[0]), q5.reasons.concat(q5b.reasons).join("; "));
ok("the kind slack is 0.02: a kind 0.019 below the hand pilot's is allowed and 0.021 below is not", TR.KIND_SLACK === 0.02 && edgeIn.ok && !edgeOut.ok && edgeOut.reasons.length === 1, edgeOut.reasons.join("; "));
const q6 = only({ reserve: E(-2.26, 6) }), q6b = only({ reserve: E(-2.246, 6) }), q7 = only({ reserve: E(-2.10, 8) });
ok("a reserve worse than the hand pilot's by more than 0.01 fails on that alone; 0.006 worse is allowed (RESERVE_SLACK 0.01)", TR.RESERVE_SLACK === 0.01 && !q6.ok && q6.reasons.length === 1 && /reserve scenarios score/.test(q6.reasons[0]) && q6b.ok, q6.reasons.join("; "));
ok("one more reserve flight ended early than the hand pilot has fails on that alone", !q7.ok && q7.reasons.length === 1 && /reserve flights ended early/.test(q7.reasons[0]), q7.reasons.join("; "));
const q8 = only({ safety: { n: 60, crashed: ["engine:2001", "hover:2003"] } }), q9 = only({ safety: { n: 60, crashed: [] } });
ok("!! THE SAFETY AUDIT IS IN THE VERDICT: a flight ended early that the hand pilot completes fails on that alone, naming the safety audit and the flight; a safety audit with fewer early ends than the hand pilot's passes", !q8.ok && q8.reasons.length === 1 && /safety audit/.test(q8.reasons[0]) && /hover:2003/.test(q8.reasons[0]) && q9.ok, q8.reasons.join("; "));
const bad = TR.qualifies({ heldOut: E(-3), audit: E(-3, 20), reserve: E(-3, 9), safety: { n: 60, crashed: ["a:1"] }, vs: { better: 0, worse: 9 } }, hand);
ok("a champion worse in every way fails with all ten reasons (held-out, audit, better-than-worse, audit ended early, four kinds, reserve score, reserve ended early, and the safety audit's one) -- one reason each, none lost", !bad.ok && bad.reasons.length === 11, bad.reasons.length + " reasons");

sec("4. the scenario sets");
ok("SETS is the real sets, by identity: train TRAIN_SET (28), held-out HELD_OUT_SET (28), pool SAFETY_POOL_SET (60), audit AUDIT_SET (42), reserve BASELINE_SET (20), safety audit SAFETY_AUDIT_SET (60)", TR.SETS.train === RT.TRAIN_SET && TR.SETS.heldOut === RT.HELD_OUT_SET && TR.SETS.pool === RT.SAFETY_POOL_SET && TR.SETS.audit === RT.AUDIT_SET && TR.SETS.reserve === RT.BASELINE_SET && TR.SETS.safetyAudit === RT.SAFETY_AUDIT_SET && [28, 28, 60, 42, 20, 60].join() === Object.values(TR.SETS).map((s) => s.length).join());
const sv = Object.values(TR.SETS), sg = Object.values(TR.SETS_GPU);
ok("!! each brain's six sets share no scenario with each other, the fruit fly's audits share none with the GPU Brain's, and neither shares one with the OTHER's audit (every audit is read once, by one champion)", sv.every((a, i) => sv.every((b, k) => i >= k || overlap(a, b) === 0)) && sg.every((a, i) => sg.every((b, k) => i >= k || overlap(a, b) === 0)) && overlap(RT.AUDIT_SET, RT.AUDIT2_SET) === 0 && overlap(RT.SAFETY_AUDIT_SET, RT.SAFETY_AUDIT2_SET) === 0 && overlap(RT.AUDIT_SET, RT.SAFETY_AUDIT2_SET) === 0 && overlap(RT.AUDIT2_SET, RT.SAFETY_AUDIT_SET) === 0);

// ---- finish(), with a stand-in policy whose flights the gate controls ------------------------------------------------------------------------------------------------------------------------------
// weights are [skill, danger]: the score of every flight rises with skill; the hand pilot (zeros) ends the 'engine' flights whose seed is divisible by 3 early (its dead man's curve); a search with danger > 0 ALSO ends the 'hover' flights whose seed is divisible by 5
const stand = {
    handWeights: () => Float32Array.from([0, 0]),
    evaluate(w, set) {
        const runs = set.map((sc) => {
            const early = (sc.kind === "engine" && sc.seed % 3 === 0) || (w[1] > 0 && sc.kind === "hover" && sc.seed % 5 === 0);
            const score = -2 + w[0] * (sc.kind === "engine" ? 1 : 0.5) - (early ? 3 : 0);
            return { kind: sc.kind, seed: sc.seed, score, status: early && sc.kind !== "engine" ? "crashed" : "airborne", settled: sc.kind === "engine" ? !early : undefined };
        });
        const byKind = {}; for (const k of RT.KINDS) { const rs = runs.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((a, r) => a + r.score, 0) / rs.length; }
        return { score: runs.reduce((a, r) => a + r.score, 0) / runs.length, runs, crashed: TR.endedEarly({ runs }).length, byKind };
    },
};
const every = (set, n, off = 0) => set.filter((_, i) => i % n === off);
const SMALL = { train: every(RT.TRAIN_SET, 3), heldOut: RT.HELD_OUT_SET, pool: RT.SAFETY_POOL_SET, audit: RT.AUDIT_SET, reserve: RT.BASELINE_SET, safetyAudit: RT.SAFETY_AUDIT_SET };
const mkRun = (k, weights, trainScore = -1) => ({ k, seed: 8000 + k, weights: Float32Array.from(weights), trainScore, improved: 0, neutral: 0, moved: 0, kept: 0 });
const SAFE = mkRun(0, [0.3, 0]), BOLD = mkRun(1, [0.6, 1]), O = { runs: 2, policy: stand };

sec("5. finish(): eligibility, the champion, the audit");
{
    const lines = [], a = TR.finish(O, [SAFE, BOLD], (m) => lines.push(m), SMALL), b = TR.finish(O, [BOLD, SAFE], () => {}, SMALL);
    const heldS = stand.evaluate(SAFE.weights, SMALL.heldOut).score, heldB = stand.evaluate(BOLD.weights, SMALL.heldOut).score;
    ok("(the stand-in pair) the bold search holds out BETTER than the safe one and ends hover flights the hand pilot completes; the safe one ends nothing new", heldB > heldS + 0.1 && TR.tailReasons(TR.tails(stand.evaluate(BOLD.weights, SMALL.pool)), TR.tails(stand.evaluate(stand.handWeights(), SMALL.pool))).length === 1 && TR.tailReasons(TR.tails(stand.evaluate(SAFE.weights, SMALL.pool)), TR.tails(stand.evaluate(stand.handWeights(), SMALL.pool))).length === 0, `held-out ${heldB.toFixed(3)} vs ${heldS.toFixed(3)}`);
    ok("!! *** AN INELIGIBLE SEARCH IS NOT THE CHAMPION, HOWEVER WELL IT HOLDS OUT *** the bold search has the better held-out score and ends flights the hand pilot completes: the champion is the safe one, the bold one is marked ineligible with the reason, and the verdict is read on the safe one", a.champion && a.champion.seed === 8000 && a.runs.find((r) => r.seed === 8001).eligible === false && /ends \d+ flights? early that the hand pilot completes/.test(a.runs.find((r) => r.seed === 8001).ineligible[0]) && a.runs.find((r) => r.seed === 8000).eligible === true);
    ok("the order the searches arrive in does not matter: the same champion", b.champion && b.champion.seed === a.champion.seed && b.runs.map((r) => r.seed).join() === a.runs.map((r) => r.seed).join());
    const noHover = { ...SMALL, pool: RT.SAFETY_POOL_SET.filter((c) => c.kind !== "hover") }, c = TR.finish(O, [SAFE, BOLD], () => {}, noHover);
    ok("!! ...and with the hover starts taken out of the pool the bold search IS eligible and IS the champion (the best held-out of the eligible)", c.runs.every((r) => r.eligible) && c.champion.seed === 8001);
    const swapped = TR.finish(O, [{ ...SAFE, trainScore: -0.1 }, { ...BOLD, trainScore: -0.9 }], () => {}, noHover);
    ok("!! *** THE CHAMPION IS PICKED ON HELD-OUT, NOT ON THE TRAIN SCORE *** two eligible searches, the one with the worse train score holds out better: the champion is the one that holds out better", swapped.champion.seed === 8001);
    const trap = new Proxy([], { get() { throw new Error("THE AUDIT WAS READ"); }, has() { throw new Error("THE AUDIT WAS READ"); } });
    let none = null, thrown = null; const nlines = []; try { none = TR.finish({ runs: 1, policy: stand }, [BOLD], (m) => nlines.push(m), { ...SMALL, audit: trap, reserve: trap, safetyAudit: trap }); } catch (e) { thrown = e.message; }
    ok("!! *** WHEN NO SEARCH IS ELIGIBLE THERE IS NO CHAMPION AND THE AUDIT IS NOT READ *** (the audit, the reserve and the safety audit are traps that throw if touched): champion null, the verdict not ok and saying no search is eligible, nothing thrown, and the log says the audit was not read", thrown === null && none && none.champion === null && none.verdict.ok === false && /no search is eligible/.test(none.verdict.reasons[0]) && nlines.some((l) => /NO CHAMPION/.test(l) && /audit was not read/.test(l)), thrown || nlines.join(" / ").slice(0, 120));
    const ch = a.champion, auditS = stand.evaluate(ch.weights, SMALL.audit), handAudit = stand.evaluate(stand.handWeights(), SMALL.audit), handR = stand.evaluate(stand.handWeights(), SMALL.reserve);
    ok("the audit is the champion's score on the AUDIT set and the reserve its score on the reserve set, both read after the choice; the hand pilot's are on the same scenarios; the safety audit is tails() of the champion on the safety-audit set; and champ.vs is versus(audit, hand audit)", ch.audit.score === auditS.score && a.hand.audit.score === handAudit.score && a.hand.reserve.score === handR.score && JSON.stringify(ch.safety) === JSON.stringify(TR.tails(stand.evaluate(ch.weights, SMALL.safetyAudit))) && JSON.stringify(a.hand.safety) === JSON.stringify(TR.tails(stand.evaluate(stand.handWeights(), SMALL.safetyAudit))) && JSON.stringify(ch.vs) === JSON.stringify(RT.versus(auditS, handAudit)) && ch.vs.better > 0);
    ok("a champion that is better in every way the stand-in can show and ends nothing new QUALIFIES, and the verdict is qualifies() of the numbers the result holds", a.verdict.ok === true && JSON.stringify(a.verdict) === JSON.stringify(TR.qualifies(a.champion, a.hand)), a.verdict.reasons.join("; "));
    ok("the log says what it did: the hand pilot's scores, one line a run (with 'INELIGIBLE' on the bold one), the hand pilot on what the champion is graded on, the champion 'the best held-out of the eligible', and a verdict line", lines.length === 6 && /^the hand pilot \(the hand weights\)/.test(lines[0]) && lines.filter((l) => /^  run /.test(l)).length === 2 && lines.some((l) => /INELIGIBLE/.test(l)) && lines.some((l) => /^the hand pilot on what the champion is graded on/.test(l)) && lines.some((l) => /the best held-out of the eligible/.test(l)) && /^QUALIFIES/.test(lines[lines.length - 1]), lines.length + " lines");
    const dump = JSON.parse(JSON.stringify(TR.dumpOf(a, { runs: 2, iters: 60, seed: 8000, sigma: 0.3, maxK: 4 })));
    ok("!! dumpOf() carries every run's weights exactly, the eligibility and safety-pool tails of each, the recipe, the champion's seed, the verdict and the hand pilot's tails (a result that did not qualify can still be looked at)", dump.runs.length === 2 && dump.champion === a.champion.seed && dump.recipe.iters === 60 && dump.recipe.brain === "fly" && dump.runs.every((r, i) => r.seed === a.runs[i].seed && r.weights.length === 2 && r.weights.every((v, j) => v === a.runs[i].weights[j]) && typeof r.eligible === "boolean" && r.pool.n === 60) && dump.verdict.ok === a.verdict.ok && dump.hand.audit.score === a.hand.audit.score && JSON.stringify(dump.hand.safety) === JSON.stringify(a.hand.safety) && dump.hand.pool.n === a.hand.pool.n);
    const flat = TR.finish(O, [mkRun(0, [0, 0])], () => {}, SMALL);
    ok("a champion equal to the hand pilot is NOT qualified (equal is not better) and the verdict names the held-out score", !flat.verdict.ok && flat.verdict.reasons.some((r) => /held-out score/.test(r)));
    const noDump = TR.dumpOf(none, { runs: 1, iters: 1, seed: 8000, sigma: 0.3, maxK: 4 });
    ok("a result with no champion still dumps (champion null, the hand pilot's audit null: it was never read)", noDump.champion === null && noDump.hand.audit === null && noDump.runs.length === 1 && noDump.runs[0].eligible === false);
}

sec("6. a search, and the searches in child processes");
const tiny = [RT.scenario(2, "hover"), RT.scenario(2, "terrain")];
const recipe = { runs: 2, iters: 4, seed: 8000, sigma: 0.3, maxK: 4, trainSet: tiny };
const s0 = TR.searchOne(recipe, 0), s0b = TR.searchOne(recipe, 0), s1 = TR.searchOne(recipe, 1), m0 = TR.searchOne({ ...recipe, brain: "gpu", seed: 9000 }, 0);
ok("searchOne() is deterministic for (recipe, k): the same weights to the bit, the seed is the recipe's seed plus k, run 1 is a different search (it moved a different number of weights), and the GPU Brain's search is over ITS network (1,860 weights, a different vector)", weightsHash(s0.weights) === weightsHash(s0b.weights) && s0.moved === s0b.moved && s0.seed === 8000 && s1.seed === 8001 && s0.moved !== s1.moved && s0.weights.length === 1167 && m0.weights.length === 1860 && m0.seed === 9000, `${s0.moved}->${s0.kept} / ${s1.moved}->${s1.kept} / ${m0.moved}->${m0.kept}`);
ok("every search is PRUNED: it ends with no more weights differing from the hand pilot than its search moved, never below its own train score, and its train score is the weights' score on the set", [s0, s1, m0].every((r, i) => r.kept <= r.moved && r.trainScore >= (i === 2 ? MR : PP).evaluate((i === 2 ? MR : PP).handWeights(), tiny).score - 1e-9 && near(r.trainScore, (i === 2 ? MR : PP).evaluate(r.weights, tiny).score, 1e-9)));
function near(a, b, e) { return Math.abs(a - b) <= e; }
const tool = path.join(ENG, "tools", "ship", "trainPilotRotor.mjs");
const kid = spawnSync(process.execPath, [tool, "--one", "1", "--runs", "2", "--iters", "2", "--seed", "8000", "--slice", "7"], { encoding: "utf8", timeout: 300000 });
const kidLine = (kid.stdout || "").split("\n").find((l) => l.startsWith("SEARCH ")), kidRun = kidLine ? JSON.parse(kidLine.slice(7)) : null;
const inproc = TR.searchOne({ runs: 2, iters: 2, seed: 8000, sigma: 0.3, maxK: 4, slice: 7 }, 1);
const sliceSet = RT.TRAIN_SET.filter((_, i) => i % 7 === 0), sliceScore = (w) => PP.evaluate(w, sliceSet).score;
ok("!! `--slice 7` TRAINS ON EVERY SEVENTH TRAINING SCENARIO (four of the 28): the search's reported train score is its weights' score on those four, and is NOT their score on all 28", sliceSet.length === 4 && near(inproc.trainScore, sliceScore(inproc.weights), 1e-9) && Math.abs(inproc.trainScore - PP.evaluate(inproc.weights).score) > 1e-3, `${inproc.trainScore.toFixed(4)} on four, ${PP.evaluate(inproc.weights).score.toFixed(4)} on all`);
ok("!! `--one 1` (the child's mode) prints search 1 as one JSON line whose weights are the in-process search 1's, every one of the 1,167, exactly, AND whose train score is the weights' score on the SLICE the child was told to use (on a slice of the training set, two iterations)", kid.status === 0 && kidRun && kidRun.seed === 8001 && kidRun.weights.length === 1167 && kidRun.weights.every((v, i) => v === inproc.weights[i]) && kidRun.kept === inproc.kept && kidRun.moved === inproc.moved && near(kidRun.trainScore, sliceScore(inproc.weights), 1e-9) && near(kidRun.trainScore, inproc.trainScore, 1e-12), `status ${kid.status}, kept ${kidRun && kidRun.kept}, train ${kidRun && kidRun.trainScore}`);

sec("7. the command, with its side effects injected");
const cap = () => { const o = { lines: [], files: {}, err: [] }; o.io = { out: (m) => o.lines.push(m), err: (m) => o.err.push(m), writeFile: (f, c) => { o.files[f] = c; }, selfPath: tool }; return o; };
const champBlob = { seed: 8001, weights: PP.handWeights(), kept: 17, moved: 40, heldOut: E(-1.50), audit: E(-1.60, 10), reserve: E(-2.10, 6), safety: { n: 60, crashed: ["engine:2001"] }, vs: { better: 30, worse: 5 } };
const yes = { hand: { ...hand }, champion: champBlob, runs: [], verdict: { ok: true, reasons: [] } };
const no = { ...yes, verdict: { ok: false, reasons: ["held-out score does not beat the hand pilot's"] } };
const c1 = cap(), x1 = await TR.command(["--runs", "1", "--out", "out.json"], { ...c1.io, run: () => yes });
ok("without --write nothing is written, whatever the verdict, and the exit is 0", x1 === 0 && Object.keys(c1.files).length === 0);
const c2 = cap(), x2 = await TR.command(["--runs", "1", "--write", "--out", "out.json"], { ...c2.io, run: () => no });
ok("!! with --write and a champion that does not qualify, the exit is 1, it says 'not written' and why, and it writes NOTHING", x2 === 1 && Object.keys(c2.files).length === 0 && c2.lines.some((l) => /^not written: held-out score does not beat/.test(l)));
const c3 = cap(), x3 = await TR.command(["--runs", "1", "--write", "--out", "out.json"], { ...c3.io, run: () => yes });
const wrote = c3.files["out.json"] ? JSON.parse(c3.files["out.json"]) : null;
ok("!! with --write and a champion that qualifies it writes ONE file, the --out one, a swek-brain-v1 blob, and says what it wrote (the count and the weights' hash)", x3 === 0 && Object.keys(c3.files).join() === "out.json" && wrote && wrote.format === "swek-brain-v1" && c3.lines.some((l) => /^wrote out\.json: 1167 weights, hash /.test(l)) && c3.lines.some((l) => l.includes(weightsHash(PP.handWeights()))));
const c4 = cap(), x4 = await TR.command(["--runs", "1", "--dump", "dump.json"], { ...c4.io, run: () => no });
const dumped = c4.files["dump.json"] ? JSON.parse(c4.files["dump.json"]) : null;
ok("--dump writes the dump file (and only that) even though the champion does not qualify", x4 === 0 && Object.keys(c4.files).join() === "dump.json" && dumped && dumped.verdict.ok === false && dumped.champion === 8001);
const trained = { run: () => { throw new Error("a bad argument reached the training"); } };   // a parser that lets a typo through would otherwise train the default recipe, for hours
const c5 = cap(), x5 = await TR.command(["--bogus"], { ...c5.io, ...trained }).catch((e) => e.message), x6 = await TR.command(["--runs"], { ...cap().io, ...trained }).catch((e) => e.message);
ok("a bad argument returns 2 before any training and names the option", x5 === 2 && x6 === 2 && c5.err.length === 1 && /unknown option "--bogus"/.test(c5.err[0]) && /^trainPilotRotor: /.test(c5.err[0]));
const c7 = cap(), x7 = await TR.command(["--one", "1", "--runs", "2", "--iters", "2", "--slice", "7"], c7.io), line7 = c7.lines.find((l) => l.startsWith("SEARCH "));
ok("--one K in the command prints the search as the SEARCH line the parent reads, the same weights as searchOne()", x7 === 0 && line7 && JSON.parse(line7.slice(7)).weights.every((v, i) => v === inproc.weights[i]));
const c8 = cap(); let seen = null;
const x8 = await TR.command(["--runs", "2", "--iters", "2", "--slice", "7", "--workers", "2", "--quiet"], { ...c8.io, finish: (opts, runs) => { seen = runs; return no; } });
const inproc0 = TR.searchOne({ runs: 2, iters: 2, seed: 8000, sigma: 0.3, maxK: 4, slice: 7 }, 0);
ok("!! `--workers 2` runs each search in its OWN PROCESS (and hands each the --slice it was given) and finish() gets what those searches found: search 0 and search 1, the same bits and the same train scores as the in-process ones, in run order", x8 === 0 && seen && seen.length === 2 && seen[0].seed === 8000 && seen[1].seed === 8001 && seen[0].weights.every((v, i) => v === inproc0.weights[i]) && seen[1].weights.every((v, i) => v === inproc.weights[i]) && near(seen[0].trainScore, inproc0.trainScore, 1e-12) && near(seen[1].trainScore, inproc.trainScore, 1e-12) && c8.lines.length === 0);
const cli = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
ok("the command file exits with the code the command returns: an unknown option exits 2 before any training", cli.status === 2 && /unknown option/.test(cli.stderr), cli.stderr.trim().slice(0, 80));

sec("8. the file it writes");
const fakeResult = { hand: { ...hand }, champion: champBlob, runs: [], verdict: { ok: true, reasons: [] } };
const blob = TR.blobOf(fakeResult, { runs: 4, iters: 600, seed: 8000, sigma: 0.3, maxK: 4 });
const imp = PB.importBrain(PB.describePolicy("pilotRotorPolicy", PP), blob);
ok("!! EVERY FILE THE TOOL WRITES CARRIES THE KNOWN LIMITS in its `by`, in full (the library's LIMITS: the task does not charge ground speed at touchdown; the dead man's curve is not solved) -- and the GPU Brain's does too", blob.by.includes(TR.LIMITS) && TR.blobOf({ ...fakeResult, champion: { ...champBlob, weights: MR.handWeights() } }, { runs: 4, iters: 600, seed: 9000, sigma: 0.3, maxK: 4, brain: "gpu" }).by.includes(TR.LIMITS));
ok("the blob is a swek-brain-v1 file for pilotRotorPolicy with 1,167 weights that the importer accepts, carrying a `by`, a score and a citation", blob.format === "swek-brain-v1" && blob.policy === "pilotRotorPolicy" && blob.weightCount === 1167 && imp.ok && imp.weights.length === 1167 && typeof blob.by === "string" && blob.by.length > 300 && typeof blob.citation === "string" && /Giant Fiber/.test(blob.citation));
ok("the fruit fly's aeroplane pilot's importer refuses it by name (a blob of one policy cannot be taken for another), and so does the GPU Brain's helicopter policy", PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), blob).ok === false && PB.importBrain(PB.describePolicy("pilotRotorMlp", MR), blob).ok === false);
ok("`by` records the recipe, the champion's seed, the count of weights that differ from the hand pilot and the sets it was picked and graded on, and quotes the held-out, the audit, the scenarios better and worse, the reserve and the safety audit", /seed 8001 of 4 runs \(8000\.\.8003\)/.test(blob.by) && /sigma 0\.3, 1-4 weights per child, 600 children per run/.test(blob.by) && /on the 28 training scenarios/.test(blob.by) && /17 of the 1167 weights differ from the hand pilot/.test(blob.by) && /champion picked on the 28 held-out scenarios/.test(blob.by) && /the 60 starts of the safety pool/.test(blob.by) && blob.by.includes(RT.describeEval(champBlob.heldOut).split(" (")[0]) === false && blob.by.includes(RT.describeEval(champBlob.audit)) && /over the 42 audit scenarios \(the hand pilot -1\.7800; 30 scenarios better, 5 worse\)/.test(blob.by) && /reserve -2\.1000 \(the hand pilot -2\.2400\)/.test(blob.by) && /safety audit of 60 starts: 1 ended early \(the hand pilot 1\), none that the hand pilot completes/.test(blob.by), blob.by.slice(0, 90));
ok("`score` is the HELD-OUT score the champion was picked on, to four places, and the GPU Brain's blob is for pilotRotorMlp with 1,860 weights", blob.score === -1.5 && (() => { const gb = TR.blobOf({ ...fakeResult, champion: { ...champBlob, weights: MR.handWeights() } }, { runs: 4, iters: 600, seed: 9000, sigma: 0.3, maxK: 4, brain: "gpu" }); return gb.policy === "pilotRotorMlp" && gb.weightCount === 1860 && /GPU Brain/.test(gb.citation) && /on the 42 audit scenarios|over the 42 audit scenarios/.test(gb.by) && PB.importBrain(PB.describePolicy("pilotRotorMlp", MR), gb).ok; })());


sec("9. THE SHIPPED FRUIT-FLY PILOT IS WHAT ITS `by` SAYS (brain/pilotRotorWeightsDefault.json)");
{
    const file = path.join(ENG, "brain", "pilotRotorWeightsDefault.json"), exists = fs.existsSync(file);
    ok("the shipped pilot exists", exists, file);
    if (exists) {
        const blob = JSON.parse(fs.readFileSync(file, "utf8")), DESC = PB.describePolicy("pilotRotorPolicy", PP), imp = PB.importBrain(DESC, blob), by = blob.by || "";
        ok("!! it is a swek-brain-v1 file for pilotRotorPolicy with 1,167 weights that the importer accepts, with a `by`, a score and a citation; the GPU Brain's helicopter policy and the aeroplane's pilot refuse it by name", imp.ok && blob.format === "swek-brain-v1" && blob.policy === "pilotRotorPolicy" && blob.weightCount === 1167 && typeof blob.score === "number" && by.length > 800 && /Giant Fiber/.test(blob.citation || "") && PB.importBrain(PB.describePolicy("pilotRotorMlp", MR), blob).ok === false && PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), blob).ok === false);
        if (imp.ok) {
            const w = imp.weights, hw = PP.handWeights(), ev = (x, set) => PP.evaluate(x, set), kept = Array.from(w).filter((v, i) => Math.abs(v - hw[i]) > 1e-6).length;
            const heldOut = ev(w, RT.HELD_OUT_SET), audit = ev(w, RT.AUDIT_SET), reserve = ev(w, RT.BASELINE_SET), safety = TR.tails(ev(w, RT.SAFETY_AUDIT_SET)), pool = TR.tails(ev(w, RT.SAFETY_POOL_SET));
            const hHeld = ev(hw, RT.HELD_OUT_SET), hAudit = ev(hw, RT.AUDIT_SET), hReserve = ev(hw, RT.BASELINE_SET), hSafety = TR.tails(ev(hw, RT.SAFETY_AUDIT_SET)), hPool = TR.tails(ev(hw, RT.SAFETY_POOL_SET));
            const vs = RT.versus(audit, hAudit), R = TR.RECIPE;
            ok("!! `by` quotes the RECIPE the tool holds (seed k of the runs 8000..8003, sigma 0.3, 1-4 weights a child, 600 children a run, the 28 training scenarios) and the sets the champion was picked and graded on", by.includes(`of ${R.runs} runs (${R.seed}..${R.seed + R.runs - 1}), sigma ${R.sigma}, 1-${R.maxK} weights per child, ${R.iters} children per run, on the ${RT.TRAIN_SET.length} training scenarios`) && by.includes(`champion picked on the ${RT.HELD_OUT_SET.length} held-out scenarios`) && by.includes(`the ${RT.SAFETY_POOL_SET.length} starts of the safety pool`) && by.includes(`over the ${RT.AUDIT_SET.length} audit scenarios`) && /seed (8000|8001|8002|8003) of 4 runs/.test(by));
            ok("!! `by` is TRUE of the weights, recomputed here: the count of weights that differ from the hand pilot, the audit with every kind and the scenarios better and worse, the reserve, and the file's own `score` is the held-out score to four places", by.includes(`${kept} of the 1167 weights differ from the hand pilot`) && by.includes(`audit ${RT.describeEval(audit)} over the ${RT.AUDIT_SET.length} audit scenarios (the hand pilot ${hAudit.score.toFixed(4)}; ${vs.better} scenarios better, ${vs.worse} worse)`) && by.includes(`reserve ${reserve.score.toFixed(4)} (the hand pilot ${hReserve.score.toFixed(4)})`) && blob.score === Number(heldOut.score.toFixed(4)), `${kept} differ; audit ${audit.score.toFixed(4)} vs ${hAudit.score.toFixed(4)}; ${vs.better} better / ${vs.worse} worse`);
            ok("!! ...and the safety audit it quotes: of 60 starts nothing had flown, the flights ended early, the champion's and the hand pilot's", by.includes(`safety audit of ${safety.n} starts: ${safety.crashed.length} ended early (the hand pilot ${hSafety.crashed.length}), none that the hand pilot completes.`), `${safety.crashed.length} vs ${hSafety.crashed.length}`);
            ok("!! `by` CARRIES THE KNOWN LIMITS, in full (the library's LIMITS): the task does not charge ground speed at touchdown, and the dead man's curve is not solved", by.includes(TR.LIMITS) && /NOT the speed over the ground at touchdown/.test(TR.LIMITS) && /dead man's curve is NOT solved/.test(TR.LIMITS));
            const q = TR.qualifies({ heldOut, audit, reserve, safety, vs }, { heldOut: hHeld, audit: hAudit, reserve: hReserve, safety: hSafety });
            ok("!! *** THE SHIPPED PILOT QUALIFIES UNDER THE RULES AS THEY STAND NOW ***: every clause of qualifies(), recomputed from its weights on the held-out, audit, reserve and safety-audit scenarios", q.ok, q.reasons.join("; "));
            ok("!! ...and it was ELIGIBLE: on the 60-start safety pool it ends no flight early that the hand pilot completes", TR.tailReasons(pool, hPool, "the safety pool").length === 0, `${pool.crashed.length} early on the pool against the hand pilot's ${hPool.crashed.length}`);
            ok("it is a trained pilot and not the hand pilot: it beats the hand pilot on the held-out and the audit scores by more than 0.2, and differs from the hand weights in more than 50 places", heldOut.score > hHeld.score + 0.2 && audit.score > hAudit.score + 0.2 && kept > 50, `${(heldOut.score - hHeld.score).toFixed(3)} / ${(audit.score - hAudit.score).toFixed(3)}`);
            // ---- the limits, MEASURED: first contact, the speed over the ground there, and whether it stands eight seconds on ----
            const model = AR.defaultModel(), champ = PP.pilotFor(w), handP = (s, tg, wi, c) => AR.pilot(s, tg, wi, c);
            const touch = (pilot, start, target) => { let s = RC.createState(model, { ...start }), first = null; for (let i = 0; i < 2400; i++) { const o = RC.stepRotor(model, s, pilot(s, target, [0, 0, 0], {}), RC.DT); s = o.state; if (!first && o.status !== "airborne") first = { st: o.status, sink: o.sink || 0, gs: Math.hypot(s.vel[0], s.vel[1]), i, end: null }; if (first && (o.status === "crashed" || i >= first.i + 480)) { first.end = o.status; break; } } return first; };
            const T0 = AR.trimOf(model), rows = RT.AUDIT_SET.filter((c) => c.kind === "engine").map((c) => ({ h: touch(handP, c.start, c.target), c: touch(champ, c.start, c.target) }));
            const standsH = rows.filter((r) => r.h && r.h.end !== "crashed").length, standsC = rows.filter((r) => r.c && r.c.end !== "crashed").length, both = rows.filter((r) => r.h && r.c && r.h.st === "landed" && r.c.st === "landed");
            const mean = (a, k) => a.reduce((x, r) => x + r[k], 0) / a.length;
            ok("!! THE GAIN, DECOMPOSED (the 20 engine-out audit flights): the champion is STANDING eight seconds after first contact in more of them than the hand pilot (14 against 9 -- the hand pilot lands softly and then crashes in the rollout in five), and in the 14 both land it comes down with the lower sink", standsH === 9 && standsC === 14 && both.length >= 13 && mean(both.map((r) => r.c), "sink") < mean(both.map((r) => r.h), "sink") - 0.5, `stands ${standsC} against ${standsH} of ${rows.length}; sink ${mean(both.map((r) => r.c), "sink").toFixed(2)} against ${mean(both.map((r) => r.h), "sink").toFixed(2)}`);
            ok("!! THE LIMIT, MEASURED: it lands FASTER OVER THE GROUND than the hand pilot -- on the flights both land, a mean of over 20 m/s at first contact against the hand pilot's 15 (the task does not charge it, and the file says so)", mean(both.map((r) => r.c), "gs") > 20 && mean(both.map((r) => r.h), "gs") < 16, `${mean(both.map((r) => r.c), "gs").toFixed(1)} against ${mean(both.map((r) => r.h), "gs").toFixed(1)} m/s`);
            const dmc = [[30, 0], [30, 10], [60, 0], [20, 10], [45, 10]].map(([alt, v]) => touch(champ, { pos: [0, 0, alt], velocity: [v, 0, 0], pitch: T0.pitchAttitude, bank: T0.bank, engine: "out" }, { altitude: alt }));
            ok("!! THE DEAD MAN'S CURVE IS NOT SOLVED: the five starts the hand pilot's gate pins as crashes (30 m in a hover, 30 m at 10 m/s, 60 m in a hover, 20 m at 10 m/s, 45 m at 10 m/s) still end 'crashed' for the champion, at over 6 m/s of sink", dmc.every((x) => x && x.st === "crashed" && x.sink > 6), dmc.map((x) => x ? `${x.st} ${x.sink.toFixed(1)}` : "-").join(", "));
        }
    }
}

console.log(fails ? `\ntrainRotorPilot-selfcheck: ${fails} FAILED` : "\ntrainRotorPilot-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
