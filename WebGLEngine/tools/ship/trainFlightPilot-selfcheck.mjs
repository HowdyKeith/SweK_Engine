// WebGLEngine/tools/ship/trainFlightPilot-selfcheck.mjs -- v4869 (beside tools/ship/trainFlightPilot.mjs) (~60 s)
//
// Run: node tools/ship/trainFlightPilot-selfcheck.mjs      (~90 s: section 9 flies the shipped pilot's 1,170 graded scenarios and the safety pool, twice -- the champion's and the autopilot's)
//
// GRADES THE TOOL THAT MAKES THE FLIGHT PILOT, NOT THE PILOT. The tool's whole value is that it cannot flatter itself: several independent searches; a search is ELIGIBLE only if it is no more dangerous than the autopilot on
// a pool of 500 starts; the champion is the best held-out of the eligible; the audit, the reserve and a second 500-start safety audit are read ONCE and only for the champion (and not at all when no search is eligible); and a file
// is written only when that champion beats the autopilot on the held-out and the audit scores, flies more audit scenarios better than worse, loses no kind of scenario, ends no flight early that the autopilot completes,
// stalls no more than the autopilot within two standard errors of a count, and does not fly the reserve worse. So this gate holds: the argument parser refuses what it does not know (a typo must not silently train the default
// recipe), the tail arithmetic and the qualification rule on tables of made-up results (each clause is the only thing that fails in its row), finish() on small injected sets -- eligibility beats held-out, no eligible search
// means no champion and an audit nobody read, the audit is the champion's and read after the choice -- the searches in child processes giving the bits the in-process ones give, the command with its side effects injected (it
// writes nothing without --write and nothing when the champion does not qualify), and the blob it writes. brain/pilotFlightTrain-selfcheck.mjs holds mutate/train/prune; section 9 here holds the SHIPPED file to its `by`.
//
// WHY THE SETS ARE INJECTABLE: finish() on the real sets flies about 2,000 flights (70 s). The logic is driven on small slices of the real sets; SETS (the real ones) is held to be the real ones by identity.
//
// SABOTAGE LOG, v4869 -- TWENTY-FOUR, each applied to tools/ship/trainFlightPilot.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   A parseArgs: an unknown option read past 3 | B qualifies: the audit-score clause dropped 2 | C qualifies: held-out > loosened to >= 2 | D finish: the champion is the best held-out of ALL searches, eligibility ignored 3 | E finish: the audit
//   flown on the held-out scenarios 1 | F finish: the champion picked on TRAIN score 1 | G blobOf: the count of weights that differ left out of `by` 1 | H command: --write writes though the champion does not qualify 1 | I RECIPE: 1000 iterations
//   -> 800 2 | J qualifies: the reserve-score clause dropped 2 | K qualifies: the kind clause dropped 3 | L qualifies: better > worse loosened to >= 1 | M tailReasons: the new-crash clause dropped 6 | N allowance: one standard error, not two 2 |
//   O tails: the deep stall counted from the brush angle 3 | P command --one: runs search K+1 2 | Q finish: the audit read before eligibility is known 1 | R searchOne: the prune skipped 2 | S dumpOf: the weights left out 1 |
//   T SETS: the pool is the safety audit 2 | U tailReasons: deep stall > loosened by one more 2 | V KIND_SLACK 0.02 -> 0.05 2 | W finish: eligibility judged on the held-out set, not the pool 3 | X qualifies: the safety-audit clauses dropped 2.
//   TWO FINDINGS. S WENT 0 RED THE FIRST TIME: the only dump row ran on a stub result whose runs were empty, so a dump without its weights passed; the row now takes a real finish() result and compares all 1,099 weights of every run. AND A
//   PARSER THAT LETS A TYPO THROUGH HUNG THE GATE, which is what such a parser would do to the person: the command went on to train the default recipe, four runs of a thousand iterations. The bad-argument rows now inject a `run` that
//   throws, so the sabotage is a red row and not a five-minute timeout (the harness has a timeout row for that now, too).
//   v4870, FIVE MORE (the brain table, section 1b: the four symbols this gate names so the GPU Brain's choice cannot change the fruit fly's tool), every one red by name (the ids are BT1-BT5 here; the sabotage files called them V1-V5):
//   BT1 brainOf() defaults to the GPU Brain 5 | BT2 setsOf() always returns the fruit fly's sets 1 | BT3 SETS_GPU's audit is the fruit fly's AUDIT3 1 | BT4 SETS_GPU's training set is not the fruit fly's 1 | BT5 BRAINS is not frozen 1.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as TR from "./trainFlightPilot.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as T from "../../brain/flightTask.mjs";
import * as F from "../../physics/mechanics/flightModel6dof.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as PA from "../../brain/pilotAircraftPolicy.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const every = (set, n, off = 0) => set.filter((_, i) => i % n === off);
const ids = (set) => new Set(set.map((s) => s.kind + s.seed));
const overlap = (a, b) => [...ids(a)].filter((x) => ids(b).has(x)).length;

sec("1. the argument parser");
const d0 = TR.parseArgs([]);
ok("no arguments is the recorded recipe: 4 runs x 1000 iterations, seed 6000, sigma 0.3, 1-4 weights a child, one process, no write", d0.runs === 4 && d0.iters === 1000 && d0.seed === 6000 && d0.sigma === 0.3 && d0.maxK === 4 && d0.workers === 1 && d0.one === null && d0.dump === null && d0.write === false && d0.out === TR.DEFAULT_OUT);
ok("RECIPE is that recorded recipe, frozen, and parseArgs() starts from it; the default output is the file the page fetches", Object.isFrozen(TR.RECIPE) && ["runs", "iters", "seed", "sigma", "maxK"].every((k) => d0[k] === TR.RECIPE[k]) && path.basename(TR.DEFAULT_OUT) === "pilotFlightWeightsDefault.json" && path.resolve(path.dirname(TR.DEFAULT_OUT)) === path.resolve(ENG, "brain"));
const d1 = TR.parseArgs(["--runs", "3", "--iters", "50", "--workers", "4", "--one", "2", "--maxK", "6", "--write", "--out", "x.json", "--dump", "d.json", "--quiet"]);
ok("every option is read: --runs, --iters, --seed, --sigma, --maxK, --workers, --one, --out, --dump, --write, --quiet", d1.runs === 3 && d1.iters === 50 && d1.workers === 4 && d1.one === 2 && d1.maxK === 6 && d1.write && d1.quiet && d1.out === "x.json" && d1.dump === "d.json" && TR.parseArgs(["--seed", "9", "--sigma", "0.1"]).seed === 9 && TR.parseArgs(["--sigma", "0.1"]).sigma === 0.1);
const e1 = throws(() => TR.parseArgs(["--bogus"])), e2 = throws(() => TR.parseArgs(["--runs"])), e3 = throws(() => TR.parseArgs(["--runs", "many"])), e4 = throws(() => TR.parseArgs(["stray"]));
ok("an unknown option, a missing value, a non-number and a stray argument are each REFUSED with the reason (a typo must not silently train the default recipe)", /unknown option "--bogus"/.test(e1) && /--runs needs a value/.test(e2) && /--runs needs a number/.test(e3) && /unexpected argument "stray"/.test(e4), [e1, e2, e3, e4].join(" | "));

// v4870 -- THE BRAIN TABLE. The tool trains two networks since v4870 (--brain fly | gpu); tools/ship/trainFlightPilotGpu-selfcheck.mjs holds the GPU brain's whole path (the parser, the children, the blob, the shipped file), and these rows hold the
// four symbols that choose between them from THIS gate -- the fruit fly's -- so that choosing the GPU brain cannot change what the fruit fly's tool does, and so a symbol a gate exists to guard is named by the gate beside its module.
sec("1b. the brain table: BRAINS, brainOf(), SETS_GPU and setsOf() leave the fruit fly's tool alone");
ok("!! brainOf() is the FRUIT FLY for no brain named and for 'fly', the GPU Brain's entry for 'gpu', and BRAINS holds exactly those two, frozen; an unknown name is refused by name", TR.brainOf({}) === TR.BRAINS.fly && TR.brainOf({ brain: "fly" }) === TR.BRAINS.fly && TR.brainOf({ brain: "gpu" }) === TR.BRAINS.gpu && TR.BRAINS.fly !== TR.BRAINS.gpu && Object.keys(TR.BRAINS).join() === "fly,gpu" && Object.isFrozen(TR.BRAINS) && /tpu/.test(throws(() => TR.brainOf({ brain: "tpu" })) || ""));
ok("!! setsOf() is SETS (the fruit fly's audits, read at v4869) for the fruit fly and SETS_GPU for the GPU Brain, and the two differ ONLY in the audit and the safety audit: the same train, held-out, pool and reserve by identity", TR.setsOf({}) === TR.SETS && TR.setsOf({ brain: "fly" }) === TR.SETS && TR.setsOf({ brain: "gpu" }) === TR.SETS_GPU && TR.SETS !== TR.SETS_GPU && Object.isFrozen(TR.SETS_GPU) && TR.SETS_GPU.train === TR.SETS.train && TR.SETS_GPU.heldOut === TR.SETS.heldOut && TR.SETS_GPU.pool === TR.SETS.pool && TR.SETS_GPU.reserve === TR.SETS.reserve && TR.SETS_GPU.audit !== TR.SETS.audit && TR.SETS_GPU.safetyAudit !== TR.SETS.safetyAudit);

sec("2. the tails: tails(), allowance(), tailReasons()");
const flight = (kind, seed, status, deg) => ({ kind, seed, status, maxAlpha: deg * Math.PI / 180 });
const A_ = F.STALL.angle * 180 / Math.PI, W_ = F.STALL.width * 180 / Math.PI;
const t0 = TR.tails({ runs: [flight("recovery", 1, "crashed", 30), flight("recovery", 2, "airborne", A_ + 0.01), flight("nominal", 3, "airborne", A_ - 0.01), flight("gusty", 4, "airborne", A_ + W_ + 0.01), flight("gusty", 5, "airborne", A_ + W_ - 0.01), flight("nominal", 6, "touchdown", 2)] });
ok("!! tails() counts what the sample says: n = 6; the flights that ended early by kind:seed (a crash AND a touchdown), the brushes (past the stall angle: 4 -- the 30 degrees, the 15.01, the 23.01 and the 22.99; the 14.99 and the 2 are not) and the deep stalls (past the FULL-stall angle, stall angle + width: 2 -- the 30 and the 23.01; the 22.99 is not), each boundary strict", t0.n === 6 && JSON.stringify(t0.crashed) === JSON.stringify(["recovery:1", "nominal:6"]) && t0.brush === 4 && t0.deep === 2, JSON.stringify(t0));
ok("BRUSH_ANGLE and DEEP_ANGLE are the flight model's own: the wing begins to stall at 15 degrees and is fully stalled 8 degrees later", TR.BRUSH_ANGLE === F.STALL.angle && TR.DEEP_ANGLE === F.STALL.angle + F.STALL.width && Math.abs(TR.BRUSH_ANGLE * 180 / Math.PI - 15) < 1e-9 && Math.abs(TR.DEEP_ANGLE * 180 / Math.PI - 23) < 1e-9);
ok("!! allowance(n) is n plus two standard errors of a count (sqrt n, rounded up): 0 allows 0, 1 allows 3, 4 allows 8, 16 allows 24, 55 allows 70", [0, 1, 4, 16, 55].map(TR.allowance).join() === "0,3,8,24,70", [0, 1, 4, 16, 55].map(TR.allowance).join());
const H = { n: 500, crashed: ["recovery:1098", "recovery:1147"], brush: 55, deep: 16 };
const tr0 = TR.tailReasons({ n: 500, crashed: ["recovery:1147"], brush: 70, deep: 24 }, H), tr1 = TR.tailReasons({ ...H, crashed: [...H.crashed, "gusty:1021"] }, H), tr2 = TR.tailReasons({ ...H, deep: 25 }, H), tr3 = TR.tailReasons({ ...H, brush: 71 }, H);
ok("!! a tail no worse than the autopilot's passes: a subset of the flights the autopilot ends early (the starts nobody completes are not the champion's fault), deep stalls AT the allowance (24) and brushes AT the allowance (70)", tr0.length === 0, tr0.join("; "));
ok("!! ONE flight ended early that the autopilot completes fails, by name and alone (and says where)", tr1.length === 1 && /ends 1 flight early that the autopilot completes \(gusty:1021\)/.test(tr1[0]) && /the safety pool/.test(tr1[0]), tr1.join("; "));
ok("!! one deep stall over the allowance fails alone; one brush over the allowance fails alone; `where` names the set", tr2.length === 1 && /full-stall angle in 25 flights against the autopilot's 16/.test(tr2[0]) && tr3.length === 1 && /brushes the stall in 71 flights against the autopilot's 55/.test(tr3[0]) && /the safety audit/.test(TR.tailReasons({ ...H, brush: 71 }, H, "the safety audit")[0]));
const tr4 = TR.tailReasons({ n: 500, crashed: ["a:1", "a:2", "a:3", "a:4", "a:5", "a:6"], brush: 0, deep: 0 }, { n: 500, crashed: [], brush: 0, deep: 0 });
ok("many new crashes are listed four at a time and then '...' (a long list must not bury the verdict)", tr4.length === 1 && /ends 6 flights early/.test(tr4[0]) && /a:1, a:2, a:3, a:4, \.\.\./.test(tr4[0]), tr4[0]);

sec("3. qualifies(): the only door to a written file");
const E = (score, crashed = 0, byKind = { nominal: score, recovery: score, gusty: score }) => ({ score, crashed, byKind });
const quiet = { n: 500, crashed: [], brush: 55, deep: 16 };
const hand = { heldOut: E(-0.485), audit: E(-0.362), reserve: E(-0.358), safety: { n: 500, crashed: ["recovery:7"], brush: 55, deep: 16 } };
const good = { heldOut: E(-0.30), audit: E(-0.28), reserve: E(-0.26), safety: { ...quiet, crashed: ["recovery:7"], brush: 54, deep: 15 }, vs: { better: 30, worse: 3 } };
const goodQ = TR.qualifies(good, hand);
ok("a champion ahead on the held-out and the audit score, with more audit scenarios better than worse, no more flights ended early, no kind of scenario lost, a reserve no worse and a safety audit no more dangerous qualifies, with no reason against it", goodQ.ok && goodQ.reasons.length === 0, goodQ.reasons.join("; "));
const only = (mut) => TR.qualifies({ ...good, ...mut }, hand);
const q1 = only({ heldOut: E(-0.485) }), q2 = only({ audit: E(-0.362) }), q3 = only({ vs: { better: 5, worse: 5 } }), q4 = only({ audit: E(-0.28, 1) });
ok("EQUAL IS NOT BETTER: a held-out score equal to the autopilot's fails, naming the held-out score and nothing else", !q1.ok && q1.reasons.length === 1 && /held-out score/.test(q1.reasons[0]), q1.reasons.join("; "));
ok("an audit score no better than the autopilot's fails on the audit score alone", !q2.ok && q2.reasons.length === 1 && /audit score/.test(q2.reasons[0]), q2.reasons.join("; "));
ok("as many scenarios flown worse as better fails on that alone, however well it scores on average (a few big wins can carry a mean)", !q3.ok && q3.reasons.length === 1 && /not more better than worse/.test(q3.reasons[0]), q3.reasons.join("; "));
ok("one more audit flight ended early than the autopilot has fails on that alone", !q4.ok && q4.reasons.length === 1 && /audit flights ended early/.test(q4.reasons[0]), q4.reasons.join("; "));
const kindsAt = (n, r, g) => ({ nominal: n, recovery: r, gusty: g });
const q5 = only({ audit: E(-0.28, 0, kindsAt(-0.40, -0.20, -0.20)) }), q5b = only({ audit: E(-0.28, 0, kindsAt(-0.20, -0.20, -0.42)) });
ok("A PILOT THAT LEARNS THE GUSTS AND FORGETS THE CALM IS NOT SHIPPED: a kind of audit scenario scoring more than 0.02 below the autopilot's fails on that kind alone, for the first kind and for the last", !q5.ok && q5.reasons.length === 1 && /nominal audit scenarios/.test(q5.reasons[0]) && !q5b.ok && q5b.reasons.length === 1 && /gusty audit scenarios/.test(q5b.reasons[0]), q5.reasons.concat(q5b.reasons).join("; "));
const hk = { ...hand, audit: E(-0.362, 0, kindsAt(-0.375, -0.330, -0.382)) };
const edgeIn = TR.qualifies({ ...good, audit: E(-0.28, 0, kindsAt(-0.394, -0.33, -0.382)) }, hk), edgeOut = TR.qualifies({ ...good, audit: E(-0.28, 0, kindsAt(-0.396, -0.33, -0.382)) }, hk);
ok("the kind slack is 0.02: a kind 0.019 below the autopilot's is allowed and 0.021 below is not", TR.KIND_SLACK === 0.02 && edgeIn.ok && !edgeOut.ok && edgeOut.reasons.length === 1, edgeOut.reasons.join("; "));
const q6 = only({ reserve: E(-0.372) }), q6b = only({ reserve: E(-0.364) }), q7 = only({ reserve: E(-0.26, 1) });
ok("a reserve worse than the autopilot's by more than 0.01 fails on that alone (a pilot that wins the tests and loses the eighteen scenarios that exposed the first champion is not shipped); 0.006 worse is allowed", TR.RESERVE_SLACK === 0.01 && !q6.ok && q6.reasons.length === 1 && /reserve scenarios score/.test(q6.reasons[0]) && q6b.ok, q6.reasons.join("; "));
ok("one more reserve flight ended early than the autopilot has fails on that alone", !q7.ok && q7.reasons.length === 1 && /reserve flights ended early/.test(q7.reasons[0]), q7.reasons.join("; "));
const q8 = only({ safety: { ...quiet, crashed: ["recovery:7", "recovery:9"] } }), q9 = only({ safety: { ...quiet, crashed: ["recovery:7"], deep: 25 } }), q10 = only({ safety: { ...quiet, crashed: ["recovery:7"], brush: 71 } });
ok("!! THE SAFETY AUDIT IS IN THE VERDICT: a flight ended early that the autopilot completes, a deep stall over the allowance, a brush over the allowance -- each fails on that alone, naming the safety audit", [q8, q9, q10].every((q) => !q.ok && q.reasons.length === 1 && /the safety audit/.test(q.reasons[0])), [q8, q9, q10].map((q) => q.reasons[0]).join(" | ").slice(0, 200));
const bad = TR.qualifies({ heldOut: E(-0.9), audit: E(-0.9, 3), reserve: E(-0.9, 2), safety: { n: 500, crashed: ["a:1"], brush: 300, deep: 300 }, vs: { better: 0, worse: 9 } }, hand);
ok("a champion worse in every way fails with all twelve reasons (held-out, audit, better-than-worse, audit ended early, three kinds, reserve score, reserve ended early, and the safety audit's three), so the output says everything that is wrong", !bad.ok && bad.reasons.length === 12, String(bad.reasons.length));

sec("4. the scenario sets");
ok("SETS is the real sets, by identity: train TRAIN_WIDE_SET (40), held-out HELD_OUT_WIDE_SET (30), pool SAFETY_POOL_SET (500), audit AUDIT3_SET (36), reserve BASELINE_SET (18), safety audit SAFETY_AUDIT_SET (500); frozen", Object.isFrozen(TR.SETS) && TR.SETS.train === T.TRAIN_WIDE_SET && TR.SETS.heldOut === T.HELD_OUT_WIDE_SET && TR.SETS.pool === T.SAFETY_POOL_SET && TR.SETS.audit === T.AUDIT3_SET && TR.SETS.reserve === T.BASELINE_SET && TR.SETS.safetyAudit === T.SAFETY_AUDIT_SET &&
    [40, 30, 500, 36, 18, 500].join() === Object.values(TR.SETS).map((s) => s.length).join());
const sv = Object.values(TR.SETS);
ok("!! the six sets share no scenario with each other, and AUDIT_SET and AUDIT2_SET -- SPENT, read for the first two champions -- are in none of them", sv.every((a, i) => sv.every((b, k) => i >= k || overlap(a, b) === 0)) && sv.every((a) => overlap(a, T.AUDIT_SET) === 0 && overlap(a, T.AUDIT2_SET) === 0));
ok("the safety sets are what the header says: 300 recovery, 100 nominal and 100 gusty starts each, the same mix", [T.SAFETY_POOL_SET, T.SAFETY_AUDIT_SET].every((s) => T.KINDS.map((k) => s.filter((c) => c.kind === k).length).join() === "100,300,100"));

// ---- small sets and crafted searches, for the logic ------------------------------------------------------------------------------------------------------------------------------------------------
const small = T.TRAIN_SET.slice(0, 6), hw = PF.handWeights();
const DANGER = [1118, 1040, 1058].map((s) => T.scenario(s, "recovery")), CALM = every(T.SAFETY_POOL_SET.filter((c) => c.kind === "nominal"), 25);
const SMALL = { train: small, heldOut: T.HELD_OUT_SET, pool: [...DANGER, ...CALM], audit: every(T.AUDIT3_SET, 3), reserve: T.BASELINE_SET.slice(0, 6), safetyAudit: every(T.SAFETY_AUDIT_SET, 25) };
const mkRun = (k, weights) => ({ k, seed: 6000 + k, weights, trainScore: PF.evaluate(weights, small).score, improved: 0, neutral: 0, moved: 0, kept: 0 });
const bolder = PF.train({ seed: 2, iters: 60, trainSet: small }).weights;   // better than the autopilot on the held-out scenarios, and worse on a recovery start
const R1 = mkRun(0, bolder), R2 = mkRun(1, Float32Array.from(hw));

sec("5. finish(): eligibility, the champion, the audit");
{
    const heldB = PF.evaluate(bolder, T.HELD_OUT_SET).score, heldH = PF.evaluate(hw, T.HELD_OUT_SET).score;
    const dangerB = T.fly(PF.pilotFor(bolder), T.scenario(1118, "recovery")), dangerH = T.fly(PF.pilotFor(hw), T.scenario(1118, "recovery"));
    ok("(the crafted pair) the bolder search scores better than the autopilot on the held-out scenarios and ENDS recovery:1118 EARLY where the autopilot completes it", heldB > heldH + 0.01 && dangerB.status !== "airborne" && dangerH.status === "airborne", `held-out ${heldB.toFixed(4)} vs ${heldH.toFixed(4)}; 1118: ${dangerB.status} vs ${dangerH.status}`);
    const lines = [], a = TR.finish({ runs: 2 }, [R1, R2], (m) => lines.push(m), SMALL), b = TR.finish({ runs: 2 }, [R2, R1], () => {}, SMALL);
    ok("!! *** AN INELIGIBLE SEARCH IS NOT THE CHAMPION, HOWEVER WELL IT HOLDS OUT *** the bolder search has the better held-out score and ends a flight the autopilot completes: the champion is the other, and the log says NOT ELIGIBLE and why", a.champion && a.champion.seed === R2.seed && a.runs[0].seed === R1.seed && !a.runs[0].eligible && a.runs[1].eligible && lines.some((l) => /NOT ELIGIBLE: on the safety pool it ends 1 flight early that the autopilot completes \(recovery:1118\)/.test(l)), a.champion ? `champion seed ${a.champion.seed}` : "none");
    ok("the order the searches arrive in does not matter: the same champion", b.champion && b.champion.seed === a.champion.seed);
    const calmOnly = TR.finish({ runs: 2 }, [R1, R2], () => {}, { ...SMALL, pool: CALM });
    ok("!! ...and with that start taken out of the pool the bolder search IS eligible and IS the champion (the best held-out of the eligible)", calmOnly.runs.every((r) => r.eligible) && calmOnly.champion.seed === R1.seed);
    const swapped = TR.finish({ runs: 2 }, [{ ...R1, trainScore: -0.9 }, { ...R2, trainScore: -0.1 }], () => {}, { ...SMALL, pool: CALM });
    ok("!! *** THE CHAMPION IS PICKED ON HELD-OUT, NOT ON THE TRAIN SCORE *** two eligible searches, the one with the better train score holds out worse: the champion is the one that holds out better", swapped.champion.seed === R1.seed && swapped.runs[0].seed === R1.seed && swapped.runs[1].trainScore > swapped.runs[0].trainScore);
    const trap = new Proxy([], { get() { throw new Error("THE AUDIT WAS READ"); }, has() { throw new Error("THE AUDIT WAS READ"); } });
    let none = null, thrown = null; const nlines = []; try { none = TR.finish({ runs: 1 }, [R1], (m) => nlines.push(m), { ...SMALL, pool: DANGER, audit: trap, reserve: trap, safetyAudit: trap }); } catch (e) { thrown = e.message; }
    ok("!! *** WHEN NO SEARCH IS ELIGIBLE THERE IS NO CHAMPION AND THE AUDIT IS NOT READ *** (the audit, the reserve and the safety audit are traps that throw if touched): champion null, the verdict not ok with the reason, the log says NO CHAMPION", thrown === null && none && none.champion === null && none.verdict.ok === false && /no search is eligible: seed 6000: on the safety pool it ends 1 flight early/.test(none.verdict.reasons[0]) && nlines.some((l) => /^NO CHAMPION/.test(l)) && none.hand.audit === undefined, thrown || (none && none.verdict.reasons[0].slice(0, 80)));
    const ch = a.champion, auditR = PF.evaluate(ch.weights, SMALL.audit), handAudit = PF.evaluate(hw, SMALL.audit), handR = PF.evaluate(hw, SMALL.reserve);
    ok("the audit is the champion's score on the AUDIT set and the reserve its score on the reserve set, both read after the choice; the autopilot's are on the same scenarios; the safety audit is tails() of the champion on its own set", ch.audit.score === auditR.score && a.hand.audit.score === handAudit.score && a.hand.reserve.score === handR.score && JSON.stringify(ch.safety) === JSON.stringify(TR.tails(PF.evaluate(ch.weights, SMALL.safetyAudit))) && JSON.stringify(a.hand.safety) === JSON.stringify(TR.tails(PF.evaluate(hw, SMALL.safetyAudit))));
    ok("the log says what it did: the autopilot's scores, one line a run, the autopilot on what the champion is graded on, the champion 'the best held-out of the eligible', and a verdict line", lines.length === 1 + 2 + 3 && /^the autopilot/.test(lines[0]) && lines.filter((l) => /^  run /.test(l)).length === 2 && lines.some((l) => /^champion .*the best held-out of the eligible/.test(l)) && /QUALIF/.test(lines[lines.length - 1]), String(lines.length));
    const dump = JSON.parse(JSON.stringify(TR.dumpOf(a, { runs: 2, iters: 60, seed: 6000, sigma: 0.3, maxK: 4 })));
    ok("!! dumpOf() carries every run's pruned weights exactly (all 1,099, in the order finish() ranked them), the eligibility and safety-pool tails of each, the recipe, the champion's seed, the verdict and the autopilot's numbers -- and survives a trip through JSON (it is for looking at a result that did not qualify, and nothing reads it back)",
        dump.runs.length === 2 && dump.champion === a.champion.seed && dump.recipe.iters === 60 && dump.runs.every((r, i) => r.seed === a.runs[i].seed && r.weights.length === PF.WEIGHT_COUNT && r.weights.every((v, k) => v === a.runs[i].weights[k]) && r.eligible === a.runs[i].eligible && JSON.stringify(r.pool) === JSON.stringify(a.runs[i].pool) && r.kept === a.runs[i].kept) &&
        dump.verdict.ok === a.verdict.ok && dump.hand.audit.score === a.hand.audit.score && JSON.stringify(dump.hand.safety) === JSON.stringify(a.hand.safety) && dump.hand.pool.n === a.hand.pool.n);
    ok("a champion equal to the autopilot is NOT qualified (equal is not better) and the verdict names the held-out score", !a.verdict.ok && a.verdict.reasons.some((r) => /held-out score/.test(r)));
}

sec("6. a search, and the searches in child processes");
const recipe = { runs: 2, iters: 4, seed: 6000, sigma: 0.3, maxK: 4 };
const s0 = TR.searchOne(recipe, 0), s0b = TR.searchOne(recipe, 0), s1 = TR.searchOne(recipe, 1);
ok("searchOne() is deterministic for (recipe, k): the same weights to the bit, the seed is the recipe's seed plus k, and run 1 is a different search (it moved a different number of weights)", weightsHash(s0.weights) === weightsHash(s0b.weights) && s0.seed === 6000 && s1.seed === 6001 && (s0.moved !== s1.moved || s0.improved !== s1.improved) && s0.k === 0 && s1.k === 1);
ok("every search is PRUNED: it ends with no more weights differing from the autopilot than its search moved, never below its own train score, and at least one of the two ends with FEWER (the search drifts weights that carry nothing and the prune puts them back)", [s0, s1].every((s) => Number.isInteger(s.kept) && s.kept <= s.moved && s.trainScore >= PF.evaluate(hw, T.TRAIN_WIDE_SET).score - 1e-9) && [s0, s1].some((s) => s.kept < s.moved), `moved/kept ${s0.moved}/${s0.kept}, ${s1.moved}/${s1.kept}`);
const tool = path.join(ENG, "tools", "ship", "trainPilotFlight.mjs");
const kid = spawnSync(process.execPath, [tool, "--one", "1", "--runs", "2", "--iters", "4", "--seed", "6000"], { encoding: "utf8", timeout: 180000 });
const kidLine = (kid.stdout || "").split("\n").find((l) => l.startsWith("SEARCH ")), kidRun = kidLine ? JSON.parse(kidLine.slice(7)) : null;
ok("`--one 1` (the child's mode) prints search 1 as one JSON line whose weights are the in-process search 1's, every one of the 1,099, exactly", kid.status === 0 && kidRun && kidRun.seed === 6001 && kidRun.weights.length === PF.WEIGHT_COUNT && kidRun.weights.every((v, i) => v === s1.weights[i]) && kidRun.kept === s1.kept && kidRun.moved === s1.moved, `exit ${kid.status}`);

sec("7. the command, with its side effects injected");
const cap = () => { const o = { lines: [], files: {}, err: [] }; o.io = { out: (m) => o.lines.push(m), err: (m) => o.err.push(m), writeFile: (f, c) => { o.files[f] = c; }, selfPath: tool }; return o; };
const yes = { hand: { ...TR.finish({ runs: 2 }, [R1, R2], () => {}, SMALL).hand, heldOut: E(-0.485), audit: E(-0.362), reserve: E(-0.358), safety: { n: 500, crashed: [], brush: 55, deep: 16 } }, champion: { seed: 6001, weights: hw, kept: 97, moved: 120, heldOut: E(-0.30), audit: E(-0.28), reserve: E(-0.26), safety: { n: 500, crashed: [], brush: 54, deep: 15 }, vs: { better: 30, worse: 3, same: 3 } }, runs: [], verdict: { ok: true, reasons: [] } };
const no = { ...yes, verdict: { ok: false, reasons: ["held-out score does not beat the autopilot's"] } };
const c1 = cap(), x1 = await TR.command(["--runs", "1", "--out", "out.json"], { ...c1.io, run: () => yes });
ok("without --write nothing is written, whatever the verdict, and the exit is 0", x1 === 0 && Object.keys(c1.files).length === 0);
const c2 = cap(), x2 = await TR.command(["--runs", "1", "--write", "--out", "out.json"], { ...c2.io, run: () => no });
ok("!! with --write and a champion that does not qualify, the exit is 1, it says 'not written' and why, and it writes NOTHING", x2 === 1 && Object.keys(c2.files).length === 0 && c2.lines.some((l) => /^not written: held-out score/.test(l)));
const c3 = cap(), x3 = await TR.command(["--runs", "1", "--write", "--out", "out.json"], { ...c3.io, run: () => yes });
const wrote = c3.files["out.json"] ? JSON.parse(c3.files["out.json"]) : null;
ok("!! with --write and a champion that qualifies it writes ONE file, the --out one, a swek-brain-v1 blob the page's importer accepts, and says what it wrote", x3 === 0 && Object.keys(c3.files).join() === "out.json" && wrote && wrote.format === "swek-brain-v1" && PB.importBrain(PB.describePolicy(TR.POLICY_ID, PF), wrote).ok && c3.lines.some((l) => /^wrote out\.json: 1099 weights, hash /.test(l)));
const c4 = cap(), x4 = await TR.command(["--runs", "1", "--dump", "dump.json"], { ...c4.io, run: () => no });
const dumped = c4.files["dump.json"] ? JSON.parse(c4.files["dump.json"]) : null;
ok("--dump writes the dump file (and only that) even though the champion does not qualify", x4 === 0 && Object.keys(c4.files).join() === "dump.json" && dumped && dumped.verdict.ok === false && dumped.champion === 6001);
const trained = { run: () => { throw new Error("a bad argument reached the training"); } };   // a parser that lets a typo through would otherwise train the default recipe, for hours
const c5 = cap(), x5 = await TR.command(["--bogus"], { ...c5.io, ...trained }).catch((e) => e.message), x6 = await TR.command(["--runs"], { ...cap().io, ...trained }).catch((e) => e.message);
ok("a bad argument returns 2 before any training and names the option", x5 === 2 && x6 === 2 && c5.err.length === 1 && /unknown option "--bogus"/.test(c5.err[0]));
const c7 = cap(), x7 = await TR.command(["--one", "1", "--runs", "2", "--iters", "4"], c7.io), line7 = c7.lines.find((l) => l.startsWith("SEARCH "));
ok("--one K in the command prints the search as the SEARCH line the parent reads, the same weights as searchOne()", x7 === 0 && line7 && JSON.parse(line7.slice(7)).weights.every((v, i) => v === s1.weights[i]));
const c8 = cap(); let seen = null;
const x8 = await TR.command(["--runs", "2", "--iters", "4", "--workers", "2", "--quiet"], { ...c8.io, finish: (opts, runs) => { seen = runs; return no; } });
ok("!! `--workers 2` runs each search in its OWN PROCESS and finish() gets the weights those searches found: search 0 and search 1, the same bits as the in-process ones, in run order", x8 === 0 && seen && seen.length === 2 && seen.every((r, k) => r.k === k && r.weights instanceof Float32Array) && weightsHash(seen[0].weights) === weightsHash(s0.weights) && weightsHash(seen[1].weights) === weightsHash(s1.weights));
const cli = spawnSync(process.execPath, [tool, "--bogus"], { encoding: "utf8", timeout: 20000 });
ok("the command file exits with the code the command returns: an unknown option exits 2 before any training", cli.status === 2 && /unknown option/.test(cli.stderr), cli.stderr.trim().slice(0, 80));

sec("8. the file it writes");
const fakeResult = { hand: { ...yes.hand, heldOut: E(-0.485), audit: E(-0.362), reserve: E(-0.358), safety: { n: 500, crashed: ["recovery:7"], brush: 55, deep: 16 } }, champion: { ...yes.champion, heldOut: E(-0.32, 0, kindsAt(-0.25, -0.30, -0.40)), audit: E(-0.30, 0, kindsAt(-0.30, -0.28, -0.32)), reserve: E(-0.29), safety: { n: 500, crashed: [], brush: 54, deep: 15 }, vs: { better: 30, worse: 3, same: 3 }, kept: 97 }, verdict: { ok: true, reasons: [] } };
const blob = TR.blobOf(fakeResult, { runs: 4, iters: 1000, seed: 6000, sigma: 0.3, maxK: 4 });
const imp = PB.importBrain(PB.describePolicy(TR.POLICY_ID, PF), blob);
ok("the blob is a swek-brain-v1 file for pilotFlightPolicy with 1,099 weights that the importer the page uses accepts", blob.format === "swek-brain-v1" && blob.policy === "pilotFlightPolicy" && blob.weightCount === 1099 && imp.ok, imp.ok ? "" : imp.reason);
ok("the aircraft pilot's importer refuses it by name (a blob of one policy cannot be taken for another)", PB.importBrain(PB.describePolicy("pilotAircraftPolicy", PA), blob).ok === false);
ok("`by` records the recipe, the champion's seed, the count of weights that differ from the autopilot and the sets it was picked and graded on, and quotes the held-out, the audit, the scenarios better and worse, the reserve and the safety audit (the champion's and the autopilot's)",
    /seed 6001 of 4 runs \(6000\.\.6003\)/.test(blob.by) && /97 of the 1099 weights differ/.test(blob.by) && /1000 iterations over the 40 train scenarios/.test(blob.by) && /picked on the 30 held-out scenarios among the searches no more dangerous than the autopilot on the 500-start safety pool/.test(blob.by) &&
    blob.by.includes(T.describeEval(fakeResult.champion.heldOut)) && blob.by.includes(T.describeEval(fakeResult.champion.audit)) && /over the 36 audit scenarios/.test(blob.by) && /30 scenarios better, 3 worse/.test(blob.by) && /reserve -0\.2900 \(the autopilot -0\.3580\)/.test(blob.by) &&
    /safety audit of 500 starts: 0 ended early \(the autopilot 1\), 15 past the full-stall angle \(the autopilot 16\), 54 brushing the stall \(the autopilot 55\)/.test(blob.by), blob.by.slice(0, 90));
ok("`score` is the HELD-OUT score the champion was picked on, to four places (the page prints it as the pilot's held-out score)", blob.score === -0.32);

sec("9. THE SHIPPED FILE IS WHAT ITS `by` SAYS (brain/pilotFlightWeightsDefault.json)");
{
    const file = path.join(ENG, "brain", "pilotFlightWeightsDefault.json"), exists = fs.existsSync(file);
    ok("the shipped pilot exists (the page fetches it)", exists, file);
    if (exists) {
        const blob = JSON.parse(fs.readFileSync(file, "utf8")), DESC = PB.describePolicy(TR.POLICY_ID, PF), imp = PB.importBrain(DESC, blob), by = blob.by || "";
        ok("!! it is a swek-brain-v1 file for pilotFlightPolicy with 1,099 weights that the importer the page uses accepts, and it carries a `by` and a score and a citation", imp.ok && blob.weightCount === 1099 && by.length > 400 && typeof blob.score === "number" && /Giant Fiber Circuit/.test(blob.citation || ""), imp.ok ? "" : imp.reason);
        if (imp.ok) {
            const w = imp.weights, hw = PF.handWeights(), ev = (x, set) => PF.evaluate(x, set), kept = Array.from(w).filter((v, i) => Math.abs(v - hw[i]) > 1e-6).length;
            const heldOut = ev(w, T.HELD_OUT_WIDE_SET), audit = ev(w, T.AUDIT3_SET), reserve = ev(w, T.BASELINE_SET), safety = TR.tails(ev(w, T.SAFETY_AUDIT_SET)), pool = TR.tails(ev(w, T.SAFETY_POOL_SET));
            const hHeld = ev(hw, T.HELD_OUT_WIDE_SET), hAudit = ev(hw, T.AUDIT3_SET), hReserve = ev(hw, T.BASELINE_SET), hSafety = TR.tails(ev(hw, T.SAFETY_AUDIT_SET)), hPool = TR.tails(ev(hw, T.SAFETY_POOL_SET)), vs = T.versus(audit, hAudit);
            const R = TR.RECIPE;
            ok("!! `by` quotes the RECIPE the tool holds: seed k of the runs (6000..6003), sigma 0.3, 1-4 weights a child, 1000 iterations over the 40 train scenarios, and the sets the champion was picked and graded on", new RegExp(`seed ${R.seed + 0}|seed ${R.seed + 1}|seed ${R.seed + 2}|seed ${R.seed + 3}`).test(by) && by.includes(`of ${R.runs} runs (${R.seed}..${R.seed + R.runs - 1}), sigma ${R.sigma}, 1-${R.maxK} weights per child, ${R.iters} iterations over the ${T.TRAIN_WIDE_SET.length} train scenarios`) &&
                by.includes(`champion picked on the ${T.HELD_OUT_WIDE_SET.length} held-out scenarios among the searches no more dangerous than the autopilot on the ${T.SAFETY_POOL_SET.length}-start safety pool`));
            ok("!! `by` is TRUE of the weights, recomputed here: the count of weights that differ from the autopilot, the held-out score (and the file's own `score`), the audit with every kind, the scenarios better and worse, the reserve", by.includes(`${kept} of the ${PF.WEIGHT_COUNT} weights differ from the autopilot`) && by.includes(`held-out ${T.describeEval(heldOut)} (the autopilot ${hHeld.score.toFixed(4)})`) && blob.score === Number(heldOut.score.toFixed(4)) &&
                by.includes(`audit ${T.describeEval(audit)} over the ${T.AUDIT3_SET.length} audit scenarios (the autopilot ${hAudit.score.toFixed(4)}; ${vs.better} scenarios better, ${vs.worse} worse)`) && by.includes(`reserve ${reserve.score.toFixed(4)} (the autopilot ${hReserve.score.toFixed(4)})`), `${kept} weights differ; held-out ${heldOut.score.toFixed(4)}; audit ${audit.score.toFixed(4)}; ${vs.better}/${vs.worse}`);
            ok("!! ...and the safety audit it quotes: of 500 starts nothing had flown, the flights ended early, past the full-stall angle and brushing the stall, the champion's and the autopilot's", by.includes(`safety audit of ${safety.n} starts: ${safety.crashed.length} ended early (the autopilot ${hSafety.crashed.length}), ${safety.deep} past the full-stall angle (the autopilot ${hSafety.deep}), ${safety.brush} brushing the stall (the autopilot ${hSafety.brush})`), `${safety.crashed.length}/${hSafety.crashed.length} early, ${safety.deep}/${hSafety.deep} deep, ${safety.brush}/${hSafety.brush} brush`);
            ok("!! the autopilot's own safety numbers are pinned: on the safety audit it ends 2 early (recovery 2184 and 2193), goes past the full-stall angle in 30 and brushes the stall in 72; on the safety pool 2 early (recovery 1098 and 1147), 16 and 55", JSON.stringify(hSafety.crashed) === JSON.stringify(["recovery:2184", "recovery:2193"]) && hSafety.deep === 30 && hSafety.brush === 72 && JSON.stringify(hPool.crashed) === JSON.stringify(["recovery:1098", "recovery:1147"]) && hPool.deep === 16 && hPool.brush === 55);
            const q = TR.qualifies({ heldOut, audit, reserve, safety, vs }, { heldOut: hHeld, audit: hAudit, reserve: hReserve, safety: hSafety });
            ok("!! *** THE SHIPPED PILOT QUALIFIES UNDER THE RULES AS THEY STAND NOW ***: every clause of qualifies(), on the held-out, audit, reserve and safety-audit scenarios, recomputed from its weights", q.ok, q.reasons.join("; "));
            const pr = TR.tailReasons(pool, hPool, "the safety pool");
            ok("!! and it was ELIGIBLE: on the 500-start safety pool it ends no flight early that the autopilot completes and its deep stalls and brushes are within the allowance", pr.length === 0, pr.join("; ") || `${pool.crashed.length} ended early, ${pool.deep} deep, ${pool.brush} brushes`);
            ok("it is a trained pilot and not the autopilot: it scores better than the autopilot on the held-out and audit scenarios by more than 0.05, and differs from the hand weights in more than 20 and fewer than 400 weights", heldOut.score > hHeld.score + 0.05 && audit.score > hAudit.score + 0.05 && kept > 20 && kept < 400, `held-out ${heldOut.score.toFixed(4)} vs ${hHeld.score.toFixed(4)}`);
        }
    }
}

console.log(fails ? `\ntrainFlightPilot-selfcheck: ${fails} FAILED` : "\ntrainFlightPilot-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
