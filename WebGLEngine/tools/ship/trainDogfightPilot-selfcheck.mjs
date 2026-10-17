// WebGLEngine/tools/ship/trainDogfightPilot-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time) (beside tools/ship/trainDogfightPilot.mjs) (~60 s)
//
// Run: node tools/ship/trainDogfightPilot-selfcheck.mjs
//
// THE TOOL THAT TRAINS THE FLIGHT PILOTS TO FIGHT, AND THE RULES IT JUDGES THEM BY. The searches themselves are held to the policies' own train() and prune() in brain/dogfightTrain-selfcheck.mjs; this gate holds what is the TOOL's:
//
//   1  THE ARGUMENT PARSER   no arguments is the recorded recipe (4 runs x 600 iterations, seed 8000, the fruit fly); --brain gpu sets the seed (9000) and the file; an explicit option beats the brain's default on whichever side of --brain it is;
//                            every typo, missing value, stray word, unknown brain and EMPTY brain name is refused with the reason; --smoke is a flag and --smoke --write is refused
//   2  BRAINS AND SETS       two frozen brains, each the right policy, a file and a seed of its own (the files are swek-brain-v1 blobs of the SAME policies the flight pilots are); the sets are the sizes they claim, four kinds in
//                            equal numbers, and EVERY SET IS DISJOINT FROM EVERY OTHER -- the training, held-out, pool, both pairs of audits, the reserve, the smoke fights, the page's set and the two audits that a smoke test spent --
//                            neither brain's sets contain a spent audit, and the two brains' audits are their own
//   3  THE RULES             tails(), allowance(), tailReasons(), paired() and qualifies() on made-up numbers, each clause driven alone: the right reason, and nothing else, when exactly that clause fails; brushing the stall is
//                            counted and is not a reason
//   4  A SEARCH              scorer() is the fight's score; searchOne() is trainWith() then pruneWith() on the tool's sets, deterministic for (opts, k), the seed is opts.seed + k, and `--workers` children give the in-process
//                            searches' weights to the bit
//   5  THE VERDICT           finish() on SCRIPTED numbers: an ineligible search is not the champion however well it holds out; the best held-out among the eligible is, a tie going to the lower run; with no eligible search
//                            there is no champion and the audit, the reserve and the safety audit are NEVER evaluated; with one they are evaluated for the autopilot and for the champion, once each
//   6  THE COMMAND           side effects injected: a bad argument exits 2, --write writes only what qualifies (exit 1 and nothing written otherwise), --dump writes qualified or not, --one prints one search as a JSON line
//   7  THE FILE              blobOf() is a swek-brain-v1 blob the right importer takes and the other brain's refuses by name, with the recipe and every number it was graded on in `by`, including the sentence that it was graded only
//                            against the PD autopilot
//
// SABOTAGE LOG -- FIFTY-ONE, each applied to tools/ship/trainDogfightPilot.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red), the one exception said below:
//   Q1 the brain's seed default not applied 3 | Q2 the output file always the fruit fly's 1 | Q3 an explicit option loses to the defaults TIMEOUT (a hang, stopped at 240 s against a 43 s gate)
//   Q4 an empty brain name taken as the fruit fly 1 | Q5 an unknown brain accepted 1 | Q6 an unknown option not refused 2 | Q7 --smoke with --write allowed 1 | Q8 a non-number accepted 1
//   Q9 the fruit fly judged on the first spent audit 2 | Q10 the fruit fly judged on the first spent safety audit 2 | Q11 the GPU Brain judged on the fruit fly's audit 2
//   Q12 the reserve is the pinned set, not the bench 2 | Q13 setsOf ignores --smoke 1 | Q14 the pool is the held-out set 1 | Q15 a collision is not a lost fight 1 | Q16 being shot down counted as lost 1
//   Q17 allowance with one standard error 2 | Q18 brushing the stall a reason 1 | Q19 a loss the autopilot also has counted as new 1 | Q20 deep stalls without the allowance 1
//   Q21 the paired se with n, not n - 1 1 | Q22 the paired z with the wrong sign 13 | Q23 BETTER_EPS 0.05 2 | Q24 the held-out clause dropped 2 | Q25 no gain floor 1 | Q26 no z requirement 1
//   Q27 more better than worse not asked 1 | Q28 kind slack 0.5 1 | Q29 reserve slack 0.5 2 | Q30 the lost-audit-fight clause dropped 1 | Q31 the safety audit's tails out of the verdict 1
//   Q32 every run searches with the base seed 2 | Q33 the search is not pruned 2 | Q34 eligibility ignored 5 | Q35 the champion is the lowest run, not the best held-out 3 | Q36 a tie goes to the higher run 2
//   Q37 the audit read when there is no champion 1 | Q38 the champion's audit read twice 1 | Q39 the paired comparison against the wrong set 2 | Q40 --write writes a champion that does not qualify 1
//   Q41 --dump writes nothing 1 | Q42 the children are not told --smoke 1 | Q43 the children are not told the brain 1 | Q44 a bad argument exits 0 1 | Q45 the blob names the wrong policy 1
//   Q46 `by` loses the opponent sentence 1 | Q47 the blob's score is the audit's 1 | Q48 the scripted evaluator ignored 1 | Q49 the dump forgets the champion 2
//   Q50 the fruit fly judged on the third (spent) audit 2 | Q51 the fruit fly's safety audit is the third (spent) one 2
// HOW SIX OF THEM WERE FOUND TO BE RED ONLY BY CRASHING OR NOT RED AT ALL, AND WHAT CHANGED: Q34 (eligibility ignored) and Q35 (the champion the lowest run) crashed the gate on a scripted evaluator with no entry for the run that should never have been graded (a throw, not a red row) -- the evaluator now answers an unscripted
//   (run, set) with a score of -9 so the wrong champion fails ITS row by name; Q48 (the scripted evaluator ignored) crashed inside a real fight -- the first scripted run is now a row of its own and the rest of section 5 waits on it; Q45 (the blob naming the wrong policy) threw inside blobOf() -- the blob rows catch it and fail by name;
//   Q39 (the paired gain against the wrong set) and Q42 (the --workers children not told --smoke) passed: the autopilot scored the same on the audit as on the held-out, and a child on the real train fights made the same 2-iteration search as one on the smoke fights -- the autopilot's audit is now 0.45 against its held-out 0.5, and the children's
//   train score, improvements and neutral moves are compared too. Q3 (an explicit option losing to the defaults) HANGS the gate (the smoke command then runs the full 600 iterations) and was stopped at 240 s: a hang is a red that does not name its row, and is said so rather than counted as a pass.
"use strict";
// UNNUMBERED, section 8 -- describeEval and POLICY_ID were the two exported names of the trainer that no gate named (definitionGates
// found the tree-wide counts 350 / 684 / 512 grown to 351 / 686 / 514 and nothing else). Sabotage log, the tool restored after each:
//   POLICY_ID changed                                -> 3 red (the brain table, the blob's importer, the POLICY_ID row)
//   describeEval's score to 3 places                 -> 3 red (the row, the partial-kinds row, the blob's `by` row)
//   describeEval's kinds in reverse order            -> 2 red
//   describeEval printing every kind                 -> FIRST TRY EXIT 1 WITH 0 FAIL LINES: the row threw out of the gate. Wrapped,
//                                                       now 1 red by name
//   describeEval's kills and losses swapped          -> 2 red
//   the brain table going back to a second copy of the literal -> 0 red, AND IT CANNOT BE OTHERWISE: the value is the same string.
//                                                       The row says so rather than claim a source property it does not hold.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./trainDogfightPilot.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as DT from "../../brain/dogfightTrain.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as F from "../../physics/mechanics/flightModel6dof.mjs";
import * as PB from "../../brain/peerBrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const ids = (set) => new Set(set.map((s) => s.kind + s.seed));

console.log("trainDogfightPilot-selfcheck -- the tool that trains the flight pilots to fight\n");

sec("1. THE ARGUMENT PARSER");
{
    const d = TR.parseArgs([]), g = TR.parseArgs(["--brain", "gpu"]), g2 = TR.parseArgs(["--seed", "5", "--brain", "gpu", "--iters", "9"]), g3 = TR.parseArgs(["--brain", "gpu", "--seed", "5"]);
    ok("!! no arguments is the recorded recipe: 4 runs x 600 iterations, seed 8000, sigma 0.3, 1-4 weights a child, one process, the fruit fly, brain/pilotDogfightWeightsDefault.json, nothing written, no smoke", d.runs === 4 && d.iters === 600 && d.seed === 8000 && d.sigma === 0.3 && d.maxK === 4 && d.workers === 1 && d.one === null && d.dump === null && d.write === false && d.quiet === false && d.smoke === false && d.brain === "fly" && path.basename(d.out) === "pilotDogfightWeightsDefault.json" && path.resolve(path.dirname(d.out)) === path.resolve(ENG, "brain") && Object.isFrozen(TR.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => TR.RECIPE[k] === d[k]));
    ok("!! --brain gpu sets the brain, the seed (9000) and the file (brain/pilotDogfightMlpWeightsDefault.json) and leaves the rest of the recipe alone", g.brain === "gpu" && g.seed === 9000 && path.basename(g.out) === "pilotDogfightMlpWeightsDefault.json" && ["runs", "iters", "sigma", "maxK"].every((k) => g[k] === TR.RECIPE[k]) && g.workers === 1 && g.write === false);
    ok("!! an explicit option beats the brain's default whichever side of --brain it is on, and the options after it are read", g2.brain === "gpu" && g2.seed === 5 && g2.iters === 9 && g3.seed === 5 && g3.brain === "gpu");
    const all = TR.parseArgs(["--runs", "3", "--iters", "50", "--workers", "4", "--one", "2", "--maxK", "6", "--sigma", "0.1", "--write", "--out", "x.json", "--dump", "d.json", "--quiet", "--smoke"].filter((a) => a !== "--write"));
    ok("every option is read: --runs, --iters, --seed, --sigma, --maxK, --workers, --one, --out, --dump, --write, --quiet, --smoke", all.runs === 3 && all.iters === 50 && all.workers === 4 && all.one === 2 && all.maxK === 6 && all.sigma === 0.1 && all.out === "x.json" && all.dump === "d.json" && all.quiet && all.smoke && TR.parseArgs(["--seed", "12"]).seed === 12 && TR.parseArgs(["--write"]).write === true);
    const e = [["--bogus"], ["--runs"], ["--runs", "many"], ["stray"], ["--brain", "tpu"], ["--brain"], ["--runs", "2", "--brain"], ["--brain", ""]].map((a) => throws(() => TR.parseArgs(a)));
    ok("!! a typo, a missing value, a non-number, a stray word, an unknown brain, a missing brain and an EMPTY brain name are each REFUSED with the reason (a typo must not silently train the default recipe), and --brain and --smoke are among the options the unknown-option message lists", /unknown option "--bogus"/.test(e[0]) && /--brain/.test(e[0]) && /--smoke/.test(e[0]) && /--runs needs a value/.test(e[1]) && /--runs needs a number/.test(e[2]) && /unexpected argument "stray"/.test(e[3]) && /--brain must be one of fly, gpu, got "tpu"/.test(e[4]) && /--brain needs a value/.test(e[5]) && /--brain needs a value/.test(e[6]) && /--brain must be one of fly, gpu, got ""/.test(e[7]), e.slice(3, 5).join(" | "));
    ok("!! --smoke AND --write DO NOT GO TOGETHER (a champion found on eight throwaway fights is never written), in either order; --smoke alone is fine", /do not go together/.test(throws(() => TR.parseArgs(["--smoke", "--write"])) || "") && /do not go together/.test(throws(() => TR.parseArgs(["--write", "--smoke"])) || "") && TR.parseArgs(["--smoke"]).smoke === true);
}

sec("2. BRAINS AND SETS");
{
    const B = TR.BRAINS;
    ok("!! two frozen brains, each the right policy with a file and a seed of its own: fly = pilotFlightPolicy (1,099 weights, seed 8000, pilotDogfightWeightsDefault.json), gpu = pilotFlightMlp (1,796 weights, seed 9000, pilotDogfightMlpWeightsDefault.json)", Object.isFrozen(B) && Object.keys(B).join() === "fly,gpu" && B.fly.policy === PF && B.gpu.policy === MF && B.fly.policyId === "pilotFlightPolicy" && B.gpu.policyId === "pilotFlightMlp" && B.fly.seed === 8000 && B.gpu.seed === 9000 && PF.WEIGHT_COUNT === 1099 && MF.WEIGHT_COUNT === 1796 && path.basename(B.fly.out) === "pilotDogfightWeightsDefault.json" && path.basename(B.gpu.out) === "pilotDogfightMlpWeightsDefault.json" && Object.values(B).every(Object.isFrozen));
    ok("brainOf() is the fruit fly when the options name none, the GPU Brain when they say so, and refuses an unknown name by name", TR.brainOf({}) === B.fly && TR.brainOf({ brain: "fly" }) === B.fly && TR.brainOf({ brain: "gpu" }) === B.gpu && /tpu/.test(throws(() => TR.brainOf({ brain: "tpu" })) || ""));
    const S = TR.SETS, G = TR.SETS_GPU, sizes = (s) => [s.train.length, s.heldOut.length, s.pool.length, s.audit.length, s.reserve.length, s.safetyAudit.length];
    ok("!! THE SETS ARE THE SIZES THEY CLAIM: train 40, held-out 40, pool 400, audit 120, reserve 120 (the bench), safety audit 200 -- for both brains, frozen, with four kinds in equal numbers in each", JSON.stringify(sizes(S)) === "[40,40,400,120,120,200]" && JSON.stringify(sizes(G)) === "[40,40,400,120,120,200]" && Object.isFrozen(S) && Object.isFrozen(G) && [D.TRAIN_FIGHT_SET, D.HELD_OUT_FIGHT_SET, D.POOL_FIGHT_SET, D.AUDIT4_FIGHT_SET, D.SAFETY_AUDIT4_FIGHT_SET, D.AUDIT2_FIGHT_SET, D.SAFETY_AUDIT2_FIGHT_SET, D.SMOKE_FIGHT_SET].every((set) => Object.isFrozen(set) && D.KINDS.every((k) => set.filter((x) => x.kind === k).length === set.length / 4)));
    ok("!! SETS_GPU IS SETS WITH THE AUDIT AND THE SAFETY AUDIT SWAPPED, by identity: the same train, held-out, pool and reserve, the fruit fly's audits the FOURTH pair (AUDIT4, SAFETY_AUDIT4) and the GPU Brain's the second (AUDIT2, SAFETY_AUDIT2); setsOf() picks them, and --smoke picks eight throwaway fights for every slot",
        G.train === S.train && G.heldOut === S.heldOut && G.pool === S.pool && G.reserve === S.reserve && S.audit === D.AUDIT4_FIGHT_SET && S.safetyAudit === D.SAFETY_AUDIT4_FIGHT_SET && G.audit === D.AUDIT2_FIGHT_SET && G.safetyAudit === D.SAFETY_AUDIT2_FIGHT_SET && S.reserve === D.DOGFIGHT_BENCH_SET && TR.setsOf({}) === S && TR.setsOf({ brain: "fly" }) === S && TR.setsOf({ brain: "gpu" }) === G && TR.setsOf({ smoke: true }) === TR.SETS_SMOKE && TR.setsOf({ brain: "gpu", smoke: true }) === TR.SETS_SMOKE && Object.values(TR.SETS_SMOKE).every((x) => x === D.SMOKE_FIGHT_SET && x.length === 8));
    const named = { train: D.TRAIN_FIGHT_SET, heldOut: D.HELD_OUT_FIGHT_SET, pool: D.POOL_FIGHT_SET, audit4: D.AUDIT4_FIGHT_SET, safety4: D.SAFETY_AUDIT4_FIGHT_SET, audit2: D.AUDIT2_FIGHT_SET, safety2: D.SAFETY_AUDIT2_FIGHT_SET, bench: D.DOGFIGHT_BENCH_SET, smoke: D.SMOKE_FIGHT_SET, page: D.DOGFIGHT_SET, spentAudit: D.AUDIT_FIGHT_SET, spentSafety: D.SAFETY_AUDIT_FIGHT_SET, spentAudit3: D.AUDIT3_FIGHT_SET, spentSafety3: D.SAFETY_AUDIT3_FIGHT_SET };
    const keys = Object.keys(named), overlaps = []; for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = ids(named[keys[i]]), n = [...ids(named[keys[j]])].filter((x) => a.has(x)).length; if (n) overlaps.push(`${keys[i]}/${keys[j]}:${n}`); }
    ok("!! *** EVERY SET IS DISJOINT FROM EVERY OTHER *** -- fourteen sets, ninety-one pairs, not one fight in two of them (training, held-out, pool, both brains' audits, the reserve, the smoke fights, the pinned set, and the four audits that were spent: two by a smoke test and two by the first real run)", overlaps.length === 0 && keys.length === 14, overlaps.join(", ") || `${keys.length} sets, ${keys.length * (keys.length - 1) / 2} pairs`);
    ok("!! A SPENT AUDIT IS NOT USED: neither brain's audit or safety audit is a pair that was read already (AUDIT_FIGHT_SET and SAFETY_AUDIT_FIGHT_SET by a smoke test, AUDIT3_FIGHT_SET and SAFETY_AUDIT3_FIGHT_SET by the first real run), and nothing the tool trains on, picks a champion on or guards the reserve with is either; the two brains' audits are their own (disjoint)", [S, G].every((s) => Object.values(s).every((x) => x !== D.AUDIT_FIGHT_SET && x !== D.SAFETY_AUDIT_FIGHT_SET && x !== D.AUDIT3_FIGHT_SET && x !== D.SAFETY_AUDIT3_FIGHT_SET)) && S.audit !== G.audit && S.safetyAudit !== G.safetyAudit && D.AUDIT_FIGHT_SET.length === 120 && D.SAFETY_AUDIT_FIGHT_SET.length === 200 && D.AUDIT3_FIGHT_SET.length === 120 && D.SAFETY_AUDIT3_FIGHT_SET.length === 200);
}

// ---- made-up numbers --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const KINDS = D.KINDS;
/** An evaluate()-shaped result for `n` fights (kinds cycling), every score `base` unless `over(i, row)` changes the row. */
function mkEval(n, base, over = () => ({})) {
    const results = Array.from({ length: n }, (_, i) => ({ kind: KINDS[i % 4], seed: 1 + Math.floor(i / 4), score: base, statusA: "airborne", statusB: "airborne", maxAlpha: 0.1, ...over(i) }));
    const byKind = {}; for (const k of KINDS) { const rs = results.filter((r) => r.kind === k); if (rs.length) byKind[k] = rs.reduce((s, r) => s + r.score, 0) / rs.length; }
    return { score: results.reduce((s, r) => s + r.score, 0) / n, byKind, kills: results.filter((r) => r.statusB === "destroyed").length, deaths: results.filter((r) => r.statusA !== "airborne").length, results };
}

sec("3. THE RULES: tails, allowance, paired, qualifies");
{
    const DEEP = TR.DEEP_ANGLE, BRUSH = TR.BRUSH_ANGLE;
    ok("the stall angles are the flight model's own: 15 degrees begins the stall and 23 degrees ends it", Math.abs(BRUSH - F.STALL.angle) < 1e-12 && Math.abs(DEEP - (F.STALL.angle + F.STALL.width)) < 1e-12 && Math.abs(BRUSH * 180 / Math.PI - 15) < 0.01 && Math.abs(DEEP * 180 / Math.PI - 23) < 0.01);
    const t = TR.tails(mkEval(20, 0.5, (i) => (i === 0 ? { statusA: "crashed" } : i === 1 ? { statusA: "touchdown" } : i === 2 ? { statusA: "lost" } : i === 3 ? { statusA: "collided" } : i === 4 ? { statusA: "destroyed" } : i === 5 ? { maxAlpha: DEEP + 0.01 } : i === 6 ? { maxAlpha: DEEP - 0.01 } : i === 7 ? { maxAlpha: BRUSH + 0.01 } : i === 8 ? { maxAlpha: BRUSH - 0.01 } : {})));
    ok("!! tails() COUNTS WHAT IT SAYS: fights lost to the ground or a collision are the crashed, touchdown, lost and collided ones (by kind:seed) and NOT the one shot down (that is `shot`, the score's business); `deep` is past 23 degrees (one just over, one just under), `brush` past 15 (the deep one, the one just under 23, the one just over 15 -- three -- and not the one just under 15)", t.n === 20 && t.lost.length === 4 && t.lost[0] === "tail:1" && t.shot === 1 && t.deep === 1 && t.brush === 3, JSON.stringify({ lost: t.lost, shot: t.shot, deep: t.deep, brush: t.brush }));
    ok("allowance(n) is n plus two standard errors of a count, rounded up, and 0 allows 0: 0, 4 -> 8, 9 -> 15, 100 -> 120", TR.allowance(0) === 0 && TR.allowance(1) === 3 && TR.allowance(4) === 8 && TR.allowance(9) === 15 && TR.allowance(100) === 120);
    const clean = { n: 200, lost: [], shot: 3, brush: 7, deep: 0 }, hand = { n: 200, lost: ["duel:5"], shot: 2, brush: 6, deep: 4 };
    ok("!! tailReasons(): a fight lost to the ground or a collision that the autopilot does not lose is a reason (named); one the autopilot ALSO loses is not; deep stalls up to allowance(4) = 8 are fine and 9 are not; and BRUSHING THE STALL IS NOT A REASON however often (50 brushes against 6)",
        TR.tailReasons(clean, hand).length === 0 && /loses 1 fight/.test(TR.tailReasons({ ...clean, lost: ["duel:5", "tail:9"] }, hand)[0] || "") && /tail:9/.test(TR.tailReasons({ ...clean, lost: ["tail:9"] }, hand)[0] || "") && TR.tailReasons({ ...clean, lost: ["duel:5"] }, hand).length === 0 && TR.tailReasons({ ...clean, deep: 8 }, hand).length === 0 && /past the full-stall angle in 9 fights against the autopilot's 4/.test(TR.tailReasons({ ...clean, deep: 9 }, hand)[0] || "") && TR.tailReasons({ ...clean, brush: 50 }, hand).length === 0 && /on the safety audit it loses/.test(TR.tailReasons({ ...clean, lost: ["tail:9"] }, hand, "the safety audit")[0] || ""));
    // paired
    const ref = mkEval(40, 0.5), at = (f) => mkEval(40, 0.5, (i) => ({ score: 0.5 + f(i) }));
    const p1 = TR.paired(at((i) => 0.1 + 0.02 * ((i % 3) - 1)), ref);
    ok("!! paired() IS THE PAIRED STATISTIC: for a gain of 0.1 + 0.02 (-1, 0, +1 cycling) over 40 fights the mean difference is 0.1 (to 1e-3), the standard error is the sample sd of the differences over sqrt 40, z is their ratio, and all 40 are better; against itself the difference is 0 and z is 0 with all 40 level",
        p1.n === 40 && Math.abs(p1.diff - 0.1) < 1e-3 && (() => { const d = Array.from({ length: 40 }, (_, i) => 0.1 + 0.02 * ((i % 3) - 1)), m = d.reduce((s, x) => s + x, 0) / 40, sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / 39); return Math.abs(p1.se - sd / Math.sqrt(40)) < 1e-12 && Math.abs(p1.z - m / (sd / Math.sqrt(40))) < 1e-9; })() && p1.better === 40 && p1.worse === 0 && p1.same === 0 && (() => { const z = TR.paired(ref, ref); return z.diff === 0 && z.z === 0 && z.same === 40; })());
    const p2 = TR.paired(at((i) => (i < 10 ? 0.009 : i < 20 ? -0.009 : i < 30 ? 0.011 : -0.011)), ref);
    ok("a fight is better or worse only when the score moves by MORE than BETTER_EPS (0.01): moves of +-0.009 are level, +0.011 is better and -0.011 is worse (ten fights each)", p2.better === 10 && p2.worse === 10 && p2.same === 20 && TR.BETTER_EPS === 0.01);
    ok("a constant gain has no variance and z is Infinity (not NaN); a constant loss is -Infinity; fights that do not line up (40 against 39) are refused by name", TR.paired(at(() => 0.25), ref).z === Infinity && TR.paired(at(() => -0.25), ref).z === -Infinity && /40 fights against 39/.test(throws(() => TR.paired(ref, mkEval(39, 0.5))) || ""));
    // qualifies: a champion that satisfies every clause, then each clause broken alone
    const handN = { heldOut: mkEval(40, 0.5), audit: mkEval(40, 0.5), reserve: mkEval(40, 0.5), safety: clean };
    const mk = (o = {}) => { const audit = o.audit || at2(0.1, o.auditShape), c = { heldOut: o.heldOut || mkEval(40, 0.6), audit, reserve: o.reserve || mkEval(40, 0.5), safety: o.safety || clean }; c.vs = TR.paired(c.audit, handN.audit); return c; };
    const at2 = (gain, shape) => mkEval(40, 0.5, (i) => ({ score: 0.5 + (shape ? shape(i) : gain + 0.02 * ((i % 3) - 1)) }));
    const base = TR.qualifies(mk(), { ...handN, safety: hand }), only = (c, re) => { const q = TR.qualifies(c, { ...handN, safety: hand }); return !q.ok && q.reasons.length === 1 && re.test(q.reasons[0]); };
    ok("!! A CHAMPION THAT SATISFIES EVERY CLAUSE QUALIFIES, with no reasons (held-out 0.6 against 0.5, an audit gain of 0.1 with z far over 2, no kind worse, the reserve level, no new losses)", base.ok && base.reasons.length === 0, base.reasons.join("; "));
    ok("!! THE HELD-OUT CLAUSE ALONE: a held-out score that does not beat the autopilot's (0.5 against 0.5) is the one reason", only(mk({ heldOut: mkEval(40, 0.5) }), /held-out score 0\.5000 does not beat/));
    ok("!! THE GAIN FLOOR ALONE: a gain of 0.04 (under MIN_GAIN, with a z far over 2) is the one reason", TR.MIN_GAIN === 0.05 && only(mk({ audit: at2(0.04) }), /audit gain over the autopilot is 0\.03\d\d, under the 0\.05 floor/));
    ok("!! THE Z CLAUSE ALONE: a gain of 0.13 that is mostly noise (+0.7 on 21 fights and -0.5 on 19: about 1.4 standard errors, with more better than worse and the floor cleared) is the one reason -- a floor on the gain alone would pass it", TR.Z_MIN === 2 && only(mk({ audit: at2(0, (i) => (i < 21 ? 0.7 : -0.5)) }), /1\.\d\d standard errors of the paired difference/));
    const worseMore = mk({ audit: at2(0, (i) => (i < 12 ? 0.6 : -0.02)) });
    ok("!! MORE BETTER THAN WORSE ALONE: twelve fights 0.6 better and twenty-eight 0.02 worse have a mean gain of 0.0 or more yet are more worse than better -- here the mean gain is +0.0 and the reasons name the count", (() => { const q = TR.qualifies(worseMore, { ...handN, safety: hand }); return !q.ok && q.reasons.some((r) => /12 better and 28 worse/.test(r)); })());
    const kindDown = (d) => mk({ audit: mkEval(40, 0.5, (i) => ({ score: 0.5 + 0.1 + 0.02 * ((i % 3) - 1) + (KINDS[i % 4] === "duel" ? -0.1 - d : 0) })) });
    ok("!! A KIND CLAUSE ALONE: with the other three kinds 0.1 up, the duels 0.06 below the autopilot's (0.5) is the one reason and 0.04 below is fine (KIND_SLACK 0.05)", TR.KIND_SLACK === 0.05 && (() => { const bad = kindDown(0.06), good = kindDown(0.04); const qb = TR.qualifies(bad, { ...handN, safety: hand }), qg = TR.qualifies(good, { ...handN, safety: hand }); return !qb.ok && qb.reasons.length === 1 && /the duel audit fights score/.test(qb.reasons[0]) && qg.ok; })());
    ok("!! THE RESERVE CLAUSE ALONE: a reserve 0.03 below the autopilot's is the one reason and 0.01 below is fine (RESERVE_SLACK 0.02)", TR.RESERVE_SLACK === 0.02 && only(mk({ reserve: mkEval(40, 0.47) }), /the reserve fights score 0\.4700, more than 0\.02 below/) && TR.qualifies(mk({ reserve: mkEval(40, 0.49) }), { ...handN, safety: hand }).ok);
    ok("!! THE LOST-FIGHT CLAUSE ALONE: one more audit fight lost to the ground than the autopilot loses is the one reason (and the same loss in the autopilot's own audit makes it not one)", only(mk({ audit: mkEval(40, 0.5, (i) => ({ score: 0.6 + 0.02 * ((i % 3) - 1), statusA: i === 3 ? "crashed" : "airborne" })) }), /1 audit fights lost to the ground or a collision against the autopilot's 0/) && (() => { const h2 = { ...handN, audit: mkEval(40, 0.5, (i) => ({ statusA: i === 3 ? "crashed" : "airborne" })), safety: hand }; const c2 = { heldOut: mkEval(40, 0.6), audit: mkEval(40, 0.5, (i) => ({ score: 0.6 + 0.02 * ((i % 3) - 1), statusA: i === 3 ? "crashed" : "airborne" })), reserve: mkEval(40, 0.5), safety: clean }; c2.vs = TR.paired(c2.audit, h2.audit); return TR.qualifies(c2, h2).ok; })());
    ok("!! THE SAFETY-AUDIT TAILS ARE IN THE VERDICT: a new fight lost to the ground on the safety audit is a reason that names 'the safety audit', and so are deep stalls over the allowance", only(mk({ safety: { ...clean, lost: ["tail:9"] } }), /on the safety audit it loses 1 fight/) && only(mk({ safety: { ...clean, deep: 9 } }), /on the safety audit it goes past the full-stall angle/));
    const multi = TR.qualifies(mk({ heldOut: mkEval(40, 0.4), reserve: mkEval(40, 0.3) }), { ...handN, safety: hand });
    ok("every clause that fails is named: a champion that fails the held-out clause AND the reserve clause gets BOTH reasons and not one", !multi.ok && multi.reasons.length === 2 && /held-out/.test(multi.reasons[0]) && /reserve/.test(multi.reasons[1]));
}

sec("4. A SEARCH");
{
    const smoke = TR.SETS_SMOKE, optsOf = (argv) => TR.parseArgs(["--smoke", ...argv]);
    const P = MF, w = P.handWeights();
    ok("!! scorer(policy, set)(w) IS THE FIGHT'S SCORE: D.evaluate(policy.pilotFor(w), set).score, to the bit, on the smoke fights (and the hand weights score what the autopilot does)", TR.scorer(P, smoke.train)(w) === D.evaluate(P.pilotFor(w), smoke.train).score && TR.scorer(PF, smoke.train)(PF.handWeights()) === D.evaluate(PF.pilotFor(PF.handWeights()), smoke.train).score);
    const o = optsOf(["--brain", "gpu", "--iters", "4", "--runs", "2"]), a = TR.searchOne(o, 1, smoke), b = TR.searchOne(o, 1, smoke), c = TR.searchOne(o, 0, smoke);
    const manual = DT.pruneWith(MF, TR.scorer(MF, smoke.train), DT.trainWith(MF, TR.scorer(MF, smoke.train), { seed: 9001, iters: 4, sigma: 0.3, maxK: 4 }).weights);
    ok("!! searchOne(opts, k) IS trainWith THEN pruneWith, with seed opts.seed + k: run 1 of the GPU Brain is seed 9001, 1,796 weights, the same weights bit for bit as the two library calls made by hand, deterministic, and run 0 is a different search", a.seed === 9001 && c.seed === 9000 && a.weights.length === 1796 && same(a.weights, b.weights) && same(a.weights, manual.weights) && a.kept === manual.kept && a.moved === manual.moved && a.trainScore === manual.trainScore && a.k === 1, `kept ${a.kept} of ${a.moved}`);
    const fly = TR.searchOne(optsOf(["--iters", "3"]), 0, smoke);
    ok("under --brain fly (the default) a search is the fruit fly's: 1,099 weights, seed 8000, and pruned back toward the autopilot (it ends with no more weights differing from PF.handWeights() than it moved)", fly.weights.length === 1099 && fly.seed === 8000 && (() => { const H = PF.handWeights(); let n = 0; for (let i = 0; i < H.length; i++) if (Math.abs(fly.weights[i] - H[i]) > 1e-6) n++; return n === fly.kept && fly.kept <= fly.moved; })());
    // workers: the children are the in-process searches, to the bit
    let captured = null; const lines = [];
    const code = await TR.command(["--workers", "2", "--runs", "2", "--iters", "2", "--smoke", "--brain", "gpu"], { selfPath: path.join(ENG, "tools", "ship", "trainPilotDogfight.mjs"), out: (m) => lines.push(m), finish: (opts, runs) => { captured = runs; return { verdict: { ok: false, reasons: ["gate"] } }; } });
    const inproc = [0, 1].map((k) => TR.searchOne(optsOf(["--brain", "gpu", "--iters", "2", "--runs", "2"]), k, smoke));
    ok("!! `--workers 2` RUNS EACH SEARCH IN ITS OWN PROCESS AND GETS THE IN-PROCESS ANSWER TO THE BIT: two children (given --smoke, --brain, --iters, --seed, --runs) send back weights, seeds, kept and moved, and the score on the train fights and the improvements and neutral moves (which only the SAME fights give), identical to searchOne() here, in run order", code === 0 && captured && captured.length === 2 && [0, 1].every((k) => same(captured[k].weights, inproc[k].weights) && captured[k].seed === inproc[k].seed && captured[k].kept === inproc[k].kept && captured[k].moved === inproc[k].moved && captured[k].trainScore === inproc[k].trainScore && captured[k].improved === inproc[k].improved && captured[k].neutral === inproc[k].neutral && captured[k].k === k) && lines.filter((l) => /search \d\/2/.test(l)).length === 2, `${lines.length} lines`);
}

sec("5. THE VERDICT: finish() on scripted numbers");
const SCRIPT = (() => {
    const P = MF, H = P.handWeights();
    const setOf = (name, n) => Object.assign(Array.from({ length: n }, (_, i) => ({ kind: KINDS[i % 4], seed: 1 + Math.floor(i / 4) })), { name });
    const mkRun = (k, tag) => { const w = Float32Array.from(H); w[0] = 100 + tag; return { k, seed: 9000 + k, weights: w, trainScore: 0.6, improved: 3, neutral: 5, moved: 9, kept: 4 }; };
    /** A scripted evaluator: `table[tag][setName]` is { score, over } and the calls are recorded. */
    const run = (table, runs, { sets = null } = {}) => {
        const calls = []; const S = sets || { train: setOf("train", 40), heldOut: setOf("heldOut", 40), pool: setOf("pool", 40), audit: setOf("audit", 40), reserve: setOf("reserve", 40), safetyAudit: setOf("safetyAudit", 40) };
        const ev = (policy, w, set) => { const tag = w[0] >= 100 ? w[0] - 100 : "hand"; calls.push([tag, set.name]); const t = (table[tag] || table.hand)[set.name] || { score: -9 }; return mkEval(set.length, t.score, t.over); };
        const log = []; const r = TR.finish({ brain: "gpu", runs: runs.length, iters: 9, seed: 9000, sigma: 0.3, maxK: 4 }, runs, (m) => log.push(m), S, ev);
        return { r, calls, log, S };
    };
    return { run, mkRun, setOf };
})();
{
    const { run, mkRun } = SCRIPT, lostOne = (i) => (i === 7 ? { statusA: "crashed" } : {});
    // hand: held-out 0.5, pool clean. run 0: held-out 0.60 eligible; run 1: held-out 0.70 but loses a pool fight (INELIGIBLE); run 2 and 3: held-out 0.65 and 0.65 eligible (a tie)
    const table = {
        hand: { train: { score: 0.5 }, heldOut: { score: 0.5 }, pool: { score: 0.5 }, audit: { score: 0.45 }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } },
        0: { heldOut: { score: 0.6 }, pool: { score: 0.5 }, train: { score: 0.6 } },
        1: { heldOut: { score: 0.7 }, pool: { score: 0.5, over: lostOne }, train: { score: 0.7 } },
        2: { heldOut: { score: 0.65 }, pool: { score: 0.5 }, train: { score: 0.65 }, audit: { score: 0.65, over: (i) => ({ score: 0.65 + 0.02 * ((i % 3) - 1) }) }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } },
        3: { heldOut: { score: 0.65 }, pool: { score: 0.5 }, train: { score: 0.65 }, audit: { score: 0.65 }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } },
    };
    let first = null, threwMsg = null;
    try { first = run(table, [mkRun(0, 0), mkRun(1, 1), mkRun(2, 2), mkRun(3, 3)]); } catch (e) { threwMsg = String(e && e.message); }
    ok("!! finish() TAKES THE EVALUATOR IT IS GIVEN AND USES NO OTHER: four scripted searches are graded to the end on the scripted numbers without a single fight being flown", first !== null && threwMsg === null, threwMsg);
    if (first) {
    const { r, calls, log } = first;
    ok("!! AN INELIGIBLE SEARCH IS NOT THE CHAMPION, HOWEVER WELL IT HOLDS OUT: run 1 has the best held-out of the four (0.70) and loses a pool fight the autopilot does not; it is marked not eligible with the reason, and the champion is the best held-out among the OTHERS", r.runs.find((x) => x.k === 1).eligible === false && /loses 1 fight/.test(r.runs.find((x) => x.k === 1).ineligible[0]) && r.champion && r.champion.seed !== 9001 && log.some((l) => /run 2\/4 seed 9001.*NOT ELIGIBLE/.test(l)) && log.filter((l) => /-- eligible/.test(l)).length === 3, `champion seed ${r.champion && r.champion.seed}`);
    ok("!! THE CHAMPION IS THE BEST HELD-OUT AMONG THE ELIGIBLE, A TIE GOING TO THE LOWER RUN: runs 2 and 3 tie at 0.65 over run 0's 0.60, and the champion is run 2 (seed 9002)", r.champion.seed === 9002 && r.runs[0].k === 1 && r.runs[1].k === 2 && r.runs[2].k === 3 && r.runs[3].k === 0 && Math.abs(r.champion.heldOut.score - 0.65) < 1e-12);
    const auditCalls = calls.filter((c) => c[1] === "audit"), reserveCalls = calls.filter((c) => c[1] === "reserve"), safetyCalls = calls.filter((c) => c[1] === "safetyAudit");
    ok("!! THE AUDIT IS READ ONCE, BY ONE CHAMPION: with an eligible champion the audit, the reserve and the safety audit are each evaluated exactly twice -- for the autopilot and for that champion (run 2) -- and for no other run", [auditCalls, reserveCalls, safetyCalls].every((cs) => cs.length === 2 && cs.some((c) => c[0] === "hand") && cs.some((c) => c[0] === 2) && !cs.some((c) => c[0] === 0 || c[0] === 1 || c[0] === 3)), `${auditCalls.length}/${reserveCalls.length}/${safetyCalls.length}`);
    ok("the verdict is qualifies() on those numbers: the champion (held-out 0.65 against 0.5, an audit gain of 0.2 against the autopilot's AUDIT 0.45 -- not its held-out 0.5 -- with z far over 2, reserve level, nothing new lost) QUALIFIES and the log says so", r.verdict.ok === true && r.champion.vs.n === 40 && Math.abs(r.champion.vs.diff - 0.2) < 1e-2 && r.champion.vs.z > 2 && log.some((l) => /^QUALIFIES/.test(l)));
    // no eligible search
    const bad = { hand: table.hand, 0: { heldOut: { score: 0.9 }, pool: { score: 0.5, over: lostOne }, train: { score: 0.9 } }, 1: { heldOut: { score: 0.8 }, pool: { score: 0.5, over: lostOne }, train: { score: 0.8 } } };
    const none = run(bad, [mkRun(0, 0), mkRun(1, 1)]);
    ok("!! WITH NO ELIGIBLE SEARCH THERE IS NO CHAMPION AND THE AUDIT IS NEVER READ: two searches that both lose a pool fight give champion null, a verdict that is not ok and says no search is eligible (naming each seed), and NOT ONE evaluation of the audit, the reserve or the safety audit -- for the autopilot or anyone", none.r.champion === null && none.r.verdict.ok === false && /no search is eligible/.test(none.r.verdict.reasons[0]) && /seed 9000/.test(none.r.verdict.reasons[0]) && /seed 9001/.test(none.r.verdict.reasons[0]) && none.calls.every((c) => !["audit", "reserve", "safetyAudit"].includes(c[1])) && none.log.some((l) => /NO CHAMPION/.test(l) && /audit was not read/.test(l)), `${none.calls.length} evaluations, none of the audit sets`);
    // an eligible champion that does not qualify
    const weak = { hand: table.hand, 0: { heldOut: { score: 0.51 }, pool: { score: 0.5 }, train: { score: 0.51 }, audit: { score: 0.45 }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } } };
    const w2 = run(weak, [mkRun(0, 0)]);
    ok("an eligible champion that does not beat the autopilot on the audit does NOT qualify: the champion is still reported (with its numbers) and the verdict names the audit gain, and the log says DOES NOT QUALIFY", w2.r.champion && w2.r.verdict.ok === false && w2.r.verdict.reasons.some((x) => /audit gain/.test(x)) && w2.log.some((l) => /^DOES NOT QUALIFY/.test(l)));
    }
    ok("!! THE DEFAULT EVALUATOR IS THE FIGHT: finish() with no evaluator on eight smoke fights gives the autopilot's own numbers for the hand weights (a search that found nothing is the autopilot: held-out equal, audit gain exactly 0, so it does not qualify)", (() => { const H = MF.handWeights(), res = TR.finish({ brain: "gpu", runs: 1, iters: 0, seed: 9000, sigma: 0.3, maxK: 4, smoke: true }, [{ k: 0, seed: 9000, weights: H, trainScore: 0, improved: 0, neutral: 0, moved: 0, kept: 0 }], () => {}, TR.SETS_SMOKE); return res.champion && res.champion.vs.diff === 0 && res.champion.heldOut.score === res.hand.heldOut.score && res.verdict.ok === false && res.hand.heldOut.score === D.evaluate(MF.pilotFor(H), D.SMOKE_FIGHT_SET).score; })());
}

sec("6. THE COMMAND, side effects injected");
{
    const { run, mkRun } = SCRIPT;
    const table = {
        hand: { train: { score: 0.5 }, heldOut: { score: 0.5 }, pool: { score: 0.5 }, audit: { score: 0.5 }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } },
        0: { heldOut: { score: 0.65 }, pool: { score: 0.5 }, train: { score: 0.65 }, audit: { score: 0.65, over: (i) => ({ score: 0.65 + 0.02 * ((i % 3) - 1) }) }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } },
    };
    const good = run(table, [mkRun(0, 0)]).r, bad = { ...good, verdict: { ok: false, reasons: ["a reason"] } };
    const harness = (argv, result) => { const o = { out: [], err: [], files: {} }; const io = { out: (m) => o.out.push(m), err: (m) => o.err.push(m), writeFile: (f, t) => { o.files[f] = t; }, run: () => result }; return TR.command(argv, io).then((code) => ({ code, ...o })); };
    const bad1 = await harness(["--bogus"], good), smokeW = await harness(["--smoke", "--write"], good);
    ok("!! A BAD ARGUMENT EXITS 2 AND SAYS WHY on the error stream, and runs nothing and writes nothing; --smoke --write is one of them", bad1.code === 2 && /unknown option "--bogus"/.test(bad1.err[0]) && bad1.out.length === 0 && Object.keys(bad1.files).length === 0 && smokeW.code === 2 && /do not go together/.test(smokeW.err[0]) && Object.keys(smokeW.files).length === 0);
    const okW = await harness(["--brain", "gpu", "--write", "--out", "/x/champ.json"], good), noW = await harness(["--brain", "gpu", "--write", "--out", "/x/champ.json"], bad), noFlag = await harness(["--brain", "gpu"], good);
    ok("!! --write WRITES ONLY WHAT QUALIFIES: a qualifying champion is written to --out (one file, exit 0, the message names the weights and the hash); a champion that does not qualify writes NOTHING, says why, and exits 1; without --write nothing is written either way", okW.code === 0 && Object.keys(okW.files).join() === "/x/champ.json" && /wrote \/x\/champ\.json: 1796 weights, hash [0-9a-f]{8}/.test(okW.out.join("\n")) && noW.code === 1 && Object.keys(noW.files).length === 0 && /not written: a reason/.test(noW.out.join("\n")) && noFlag.code === 0 && Object.keys(noFlag.files).length === 0);
    const dumpBad = await harness(["--brain", "gpu", "--dump", "/x/d.json"], bad), dumped = dumpBad.files["/x/d.json"] ? JSON.parse(dumpBad.files["/x/d.json"]) : null;
    ok("--dump WRITES THE RUNS WHETHER OR NOT THE CHAMPION QUALIFIES (it is for looking at a result that did not): the dump names the recipe and the verdict, and carries every run's weights (1,796 numbers), eligibility and scores; the exit code is 0", dumpBad.code === 0 && dumped && dumped.recipe.brain === "gpu" && dumped.verdict.ok === false && dumped.runs.length === 1 && dumped.runs[0].weights.length === 1796 && dumped.runs[0].eligible === true && "heldOut" in dumped.runs[0] && dumped.champion === 9000 && /not a shipped file/.test(dumpBad.out.join("\n")));
    const one = await harness(["--smoke", "--brain", "gpu", "--iters", "2", "--one", "1"], null), line = one.out.find((l) => l.startsWith("SEARCH ")), got = line ? JSON.parse(line.slice(7)) : null, mine = TR.searchOne(TR.parseArgs(["--smoke", "--brain", "gpu", "--iters", "2", "--one", "1"]), 1, TR.SETS_SMOKE);
    ok("!! --one K IS THE CHILD'S MODE: it runs search K only, prints exactly one `SEARCH {json}` line with the weights as numbers, exits 0 and does not grade, write or dump -- and the weights it prints are searchOne()'s to the bit", one.code === 0 && got && got.k === 1 && got.seed === 9001 && same(Float32Array.from(got.weights), mine.weights) && one.out.length === 1 && Object.keys(one.files).length === 0);
    const quiet = await harness(["--quiet", "--brain", "gpu"], good);
    ok("--quiet silences the progress lines (the log handed to the run), and the result is still returned", quiet.code === 0);
}

sec("7. THE FILE: blobOf()");
{
    const { run, mkRun } = SCRIPT;
    const table = { hand: { train: { score: 0.5 }, heldOut: { score: 0.5 }, pool: { score: 0.5 }, audit: { score: 0.45 }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } }, 0: { heldOut: { score: 0.65 }, pool: { score: 0.5 }, train: { score: 0.65 }, audit: { score: 0.65, over: (i) => ({ score: 0.65 + 0.02 * ((i % 3) - 1) }) }, reserve: { score: 0.5 }, safetyAudit: { score: 0.5 } } };
    const g = run(table, [mkRun(0, 0)]).r, gOpts = { brain: "gpu", runs: 1, iters: 9, seed: 9000, sigma: 0.3, maxK: 4 }, blob = (() => { try { return TR.blobOf(g, gOpts); } catch (e) { return { threw: String(e && e.message) }; } })();
    ok("!! blobOf() IS A swek-brain-v1 BLOB FOR THE GPU BRAIN'S POLICY: format, policy 'pilotFlightMlp', 1,796 weights, the held-out score (4 places) as `score`, the exporter's citation naming dogfights, and the weights bit for bit", blob.format === "swek-brain-v1" && blob.policy === "pilotFlightMlp" && blob.weightCount === 1796 && blob.weights.length === 1796 && blob.score === 0.65 && /trained on dogfights/.test(blob.citation) && /GPU Brain/.test(blob.citation) && same(Float32Array.from(blob.weights || []), g.champion.weights), blob.threw);
    const imp = PB.importBrain(PB.describePolicy("pilotFlightMlp", MF), blob), wrong = PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), blob);
    ok("!! THE GPU BRAIN'S IMPORTER ACCEPTS IT, THE FRUIT FLY'S REFUSES IT BY NAME (a blob of one policy cannot be taken for another), and a fruit fly blob made the same way is refused by the GPU Brain's", imp.ok && same(imp.weights, g.champion.weights) && !wrong.ok && /pilotFlightMlp/.test(wrong.reason) && /pilotFlightPolicy/.test(wrong.reason) && (() => { const fo = { ...gOpts, brain: "fly" }, fw = Float32Array.from(PF.handWeights()), fres = { ...g, champion: { ...g.champion, weights: fw } }; let fb; try { fb = TR.blobOf(fres, fo); } catch (e) { return false; } return fb.policy === "pilotFlightPolicy" && fb.weightCount === 1099 && /Giant Fiber/.test(fb.citation) && !PB.importBrain(PB.describePolicy("pilotFlightMlp", MF), fb).ok; })());
    const by = blob.by;
    ok("!! `by` CARRIES THE RECIPE AND EVERY NUMBER IT WAS GRADED ON: that it was trained on dogfights, the seed and run range, sigma, the iterations over the 40 train fights, how many weights differ from the autopilot, the held-out and audit scores with the autopilot's beside them, better/worse counts, the paired gain with its standard error and z, the reserve, the safety audit's lost/shot/deep/brush counts with the autopilot's -- and that it was graded only against the PD autopilot",
        /TRAINED ON DOGFIGHTS/.test(by) && /seed 9000 of 1 runs \(9000\.\.9000\)/.test(by) && /sigma 0\.3/.test(by) && /1-4 weights per child/.test(by) && /9 iterations over the 40 train fights/.test(by) && /4 of the 1796 weights differ from the autopilot/.test(by) && /held-out 0\.6500/.test(by) && /\(the autopilot 0\.5000\)/.test(by) && /audit 0\.6[45]\d*/.test(by) && /\d+ fights better, \d+ worse/.test(by) && /gain 0\.(19|20)\d* \+- 0\.0\d*, \d+\.\d+ paired standard errors/.test(by) && /reserve 0\.6500|reserve 0\.5000/.test(by) && /safety audit of 40 fights: 0 lost to the ground or a collision \(the autopilot 0\)/.test(by) && /GRADED ONLY AGAINST THE PD AUTOPILOT AS OPPONENT/.test(by), by.slice(0, 90));
    const dump = TR.dumpOf(g, gOpts);
    ok("dumpOf() is plain JSON (it survives a round trip), names the recipe, the champion's seed and the verdict, and keeps every run's weights", JSON.stringify(JSON.parse(JSON.stringify(dump))) === JSON.stringify(dump) && dump.champion === 9000 && dump.recipe.runs === 1 && dump.verdict.ok === true && dump.runs[0].weights.length === 1796);
}

sec("8. THE TWO NAMES THE TREE'S CENSUS FOUND UNNAMED: describeEval AND POLICY_ID (UNNUMBERED)");
{
    // describeEval is the line every progress report, the champion's verdict and the blob's `by` quote an evaluation in; a
    // changed format moves what a reader compares across runs, so it is held to the character. POLICY_ID is the fruit fly's
    // policy name: the brain table, the blob the tool writes and the importer that must accept it all have to agree on it.
    const kinds = D.KINDS.slice(), by = Object.fromEntries(kinds.map((k, i) => [k, 0.1 * (i + 1)]));
    const full = TR.describeEval({ score: 0.123456, byKind: by, kills: 3, deaths: 1 });
    const want = "0.1235 (" + kinds.map((k, i) => k + " " + (0.1 * (i + 1)).toFixed(3)).join(", ") + "; 3 kills, 1 lost)";
    ok("!! describeEval() IS THE ONE-LINE EVALUATION: the score to 4 places, each kind in the dogfight task's own order to 3, then the kills and the losses",
        full === want, JSON.stringify(full));
    const part = (() => { try { return TR.describeEval({ score: -0.5, byKind: { duel: 0.25, tail: -1 }, kills: 0, deaths: 7 }); } catch (e) { return "threw: " + e.message; } })();
    ok("...a kind the evaluation did not fly is left out (not printed as NaN or 0), the order is still the task's, and a negative score keeps its sign",
        part === "-0.5000 (tail -1.000, duel 0.250; 0 kills, 7 lost)", JSON.stringify(part));
    ok("!! POLICY_ID IS THE FRUIT FLY'S POLICY NAME and the brain table's id for the fruit fly is the same string (the tool builds the table from it; a second copy of the literal with the same value is not distinguishable by value, and no row pretends to)",
        TR.POLICY_ID === "pilotFlightPolicy" && TR.BRAINS.fly.policyId === TR.POLICY_ID && TR.BRAINS.fly.policy === PF);
    const desc = PB.describePolicy(TR.POLICY_ID, PF);
    ok("...and it is the id the importer's description of the fruit fly's policy carries, with that policy's own weight count",
        desc && desc.id === TR.POLICY_ID && desc.WEIGHT_COUNT === PF.WEIGHT_COUNT, "describePolicy(POLICY_ID) -> id " + JSON.stringify(desc && desc.id) + ", " + (desc && desc.WEIGHT_COUNT) + " weights");
}

console.log(fails ? `\ntrainDogfightPilot-selfcheck: ${fails} FAILED` : "\ntrainDogfightPilot-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
