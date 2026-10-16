// WebGLEngine/tools/ship/trainFlightPilotGpu-selfcheck.mjs -- v4870 (beside tools/ship/trainFlightPilot.mjs) (~70 s)
//
// Run: node tools/ship/trainFlightPilotGpu-selfcheck.mjs
//
// THE SAME TOOL, THE OTHER BRAIN. tools/ship/trainFlightPilot-selfcheck.mjs holds the tool that trains the fruit fly's pilot; at v4870 the tool took `--brain gpu` and trains the GPU Brain's MLP (brain/pilotFlightMlp.mjs) by the SAME
// recipe, the SAME task and the SAME rules -- eligibility on the safety pool, a champion picked on held-out, a verdict on audits read once -- and this gate holds what is different about it:
//
//   1  the argument parser takes --brain (fly | gpu), refuses another by name, and the brain sets the seed (7000 against 6000) and the file (brain/pilotFlightMlpWeightsDefault.json) before any other option is read
//   2  BRAINS: two frozen entries, each the right policy module, a file and a seed of its own; brainOf() falls back to the fruit fly and refuses an unknown name
//   3  SETS_GPU: the same training, held-out, pool and reserve; an audit (AUDIT4_SET) and a safety audit (SAFETY_AUDIT2_SET) of its own -- EVERY AUDIT IS READ ONCE, BY ONE CHAMPION, and the fruit fly's were read by the fruit fly's
//   4  the searches run the MLP: a search under --brain gpu is 1,796 weights from brain/pilotFlightMlp.mjs's train() and prune(), deterministic, in a child process or here; finish() evaluates a network's weights with ITS policy
//      (a 1,796-weight vector read as the fruit fly's layout is a different pilot) and the verdict is the same verdict
//   5  the command (side effects injected) passes the brain to the children and writes the GPU file, a swek-brain-v1 blob for pilotFlightMlp that the fruit fly's importer refuses by name and the GPU Brain's accepts
//   6  THE SHIPPED GPU PILOT (brain/pilotFlightMlpWeightsDefault.json) IS WHAT ITS `by` SAYS, recomputed from its weights: the held-out, the audit and its kinds, the scenarios better and worse, the reserve, the safety audit
//      of 500 starts nobody had flown, the autopilot's own numbers on them, qualifies() under the rules as they stand, eligibility on the safety pool
//
// SABOTAGE LOG, v4870 -- fourteen sabotages of tools/ship/trainFlightPilot.mjs's brain selection, each in a scratch worktree (scratchpad/sab/sab.py), each read by the red rows it produced. EVERY ONE WENT RED BY NAME; two went red only on
// the second try, and both are the log's reason for existing:
//   B1  parseArgs does not apply the brain's seed default                         4 red (the --brain gpu parser row and the child's-mode row, `--brain gpu --one 1`, among them)
//   B2  parseArgs always names the fruit fly's output file                        3 red (the --brain gpu parser row and the --write row, among them)
//   B3  BRAINS.gpu is the fruit fly's policy module                               5 red (the two-frozen-brains row and the descriptors row, among them)
//   B4  searchOne always trains the fruit fly                                     4 red (the search row and the pruned-in-this-layout row, among them)
//   B5  finish() always evaluates with the fruit fly's policy                     1 red (the MLP's hand weights as the only search must hold out exactly as the autopilot does)
//   B6  SETS_GPU's audit is the fruit fly's AUDIT3_SET                            4 red (the SETS_GPU identity row and the "every audit is read once" row, among them)
//   B7  SETS_GPU's safety audit is the fruit fly's SAFETY_AUDIT_SET               4 red (the same two rows)
//   B8  setsOf() always returns SETS                                              1 red (the SETS_GPU identity row: it is reached through setsOf)
//   B9  blobOf() names the fruit fly's policy in the blob                         0 red THE FIRST TIME -- THE GATE CRASHED: exportBrain refused a 1,796-weight vector as a 1,099-weight policy, the throw escaped the command
//                                                                                 call, and "0 FAIL lines, exit 1" read like a pass in the sabotage log. The call now has a `.catch` that turns the throw into a red row (it IS a
//                                                                                 finding: the tool refusing is right, the gate dying is not); redone 2 red (the --write row, and the importer-accepts-and-refuses row)
//   B10 blobOf() cites the fruit fly                                              1 red (the --write row, which quotes the citation)
//   B11 the workers are not told the brain                                        1 red (`--brain gpu --workers 2` children must be the MLP's, bit for bit)
//   B12 brainOf() defaults to the GPU brain                                       2 red (the brainOf() row and the SETS_GPU row)
//   B13 the unknown brain is not refused                                          0 red THE FIRST TIME -- THE SABOTAGE JSON WAS MALFORMED, so the guarded throw was never taken out; redone with `if (false) throw`, 1 red (the brainOf() row, which includes the unknown-name refusal)
//   B14 a missing --brain value is taken as the fruit fly                         1 red (the "a typo must not silently train the fruit fly" row)
//   THE PARSER WAS REWRITTEN AFTER THE VERDICT (tools/ship/cliArgs-selfcheck.mjs found the --brain pre-scan's argv.indexOf idiom): parseArgs reads the command line in ONE pass and lays the brain's defaults under what was given. B1, B2, B14 and the rest of the
//   parser's branches were therefore applied again to the new code, six of them (the same tool, the same gate):
//   Q1 the brain's seed default not applied 4 | Q2 the output file always the fruit fly's 3 | Q3 an explicit option loses to the brain's defaults 1, THEN THE GATE HANGS (the options it passes down are ignored, so a later row trains the full recipe: the red row is
//   the first, the timeout the second -- the same species as the hung gate of v4869, read from the partial output) | Q4 an empty or missing --brain value taken as the fruit fly 0 RED THE FIRST TIME: in the one-pass loop a missing value throws before the brain is
//   read, so the branch the sabotage changed was reachable only by --brain "" -- which no row asked; the row now asks, and it goes red 1 | Q5 an unknown brain accepted 1 | Q6 the unknown-option refusal dropped 1.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./trainFlightPilot.mjs";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as T from "../../brain/flightTask.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const every = (set, n, off = 0) => set.filter((_, i) => i % n === off);
const ids = (set) => new Set(set.map((s) => s.kind + s.seed));
const overlap = (a, b) => [...ids(a)].filter((x) => ids(b).has(x)).length;
const E = (score, crashed = 0, byKind = { nominal: score, recovery: score, gusty: score }) => ({ score, crashed, byKind });
const GPU_FILE = path.join(ENG, "brain", "pilotFlightMlpWeightsDefault.json");

sec("1. the argument parser takes --brain");
{
    const d = TR.parseArgs([]), g = TR.parseArgs(["--brain", "gpu"]), g2 = TR.parseArgs(["--seed", "5", "--brain", "gpu", "--iters", "9"]), g3 = TR.parseArgs(["--brain", "gpu", "--seed", "5"]);
    ok("!! with no --brain the tool trains the fruit fly, as it did at v4869: brain 'fly', seed 6000, the fruit fly's file", d.brain === "fly" && d.seed === 6000 && d.out === TR.DEFAULT_OUT && path.basename(d.out) === "pilotFlightWeightsDefault.json");
    ok("!! --brain gpu sets the brain, the seed (7000) and the file (brain/pilotFlightMlpWeightsDefault.json) and leaves the rest of the recipe alone", g.brain === "gpu" && g.seed === 7000 && path.basename(g.out) === "pilotFlightMlpWeightsDefault.json" && path.resolve(path.dirname(g.out)) === path.resolve(ENG, "brain") && ["runs", "iters", "sigma", "maxK"].every((k) => g[k] === TR.RECIPE[k]) && g.workers === 1 && g.write === false);
    ok("!! an explicit option beats the brain's default whichever side of --brain it is on (--seed 5 before or after), and the options after it are read", g2.brain === "gpu" && g2.seed === 5 && g2.iters === 9 && g3.seed === 5 && g3.brain === "gpu");
    const e1 = throws(() => TR.parseArgs(["--brain", "tpu"])), e2 = throws(() => TR.parseArgs(["--brain"])), e3 = throws(() => TR.parseArgs(["--runs", "2", "--brain"])), e4 = throws(() => TR.parseArgs(["--brain", ""]));
    ok("an unknown brain and a missing value are each REFUSED with the reason (a typo must not silently train the fruit fly), and --brain is among the options the unknown-option message lists", /--brain must be one of fly, gpu, got "tpu"/.test(e1) && /--brain needs a value/.test(e2) && /--brain needs a value/.test(e3) && /--brain must be one of fly, gpu, got ""/.test(e4) && /--brain/.test(throws(() => TR.parseArgs(["--bogus"]))), [e1, e2].join(" | "));
}

sec("2. BRAINS");
{
    const b = TR.BRAINS;
    ok("!! two frozen brains, each the right policy module, with a file and a seed of its own: fly = pilotFlightPolicy (1,099 weights, seed 6000, pilotFlightWeightsDefault.json), gpu = pilotFlightMlp (1,796 weights, seed 7000, pilotFlightMlpWeightsDefault.json)", Object.isFrozen(b) && Object.isFrozen(b.fly) && Object.isFrozen(b.gpu) && b.fly.policy === PF && b.gpu.policy === MF && b.fly.policyId === "pilotFlightPolicy" && b.gpu.policyId === "pilotFlightMlp" && b.fly.policy.WEIGHT_COUNT === 1099 && b.gpu.policy.WEIGHT_COUNT === 1796 && b.fly.seed === 6000 && b.gpu.seed === 7000 && b.fly.out !== b.gpu.out && b.fly.out === TR.DEFAULT_OUT);
    ok("brainOf() is the fruit fly when the options name none, the GPU Brain when they say so, and refuses an unknown name by name", TR.brainOf({}) === b.fly && TR.brainOf(undefined) === b.fly && TR.brainOf({ brain: "gpu" }) === b.gpu && /unknown brain "tpu"/.test(throws(() => TR.brainOf({ brain: "tpu" }))));
    ok("each brain's descriptor is the one its importer takes, and each brain cites what it is: the fruit fly the male-cns circuit, the GPU brain brain/mlp.js's BatchedMLP", PB.describePolicy(b.gpu.policyId, b.gpu.policy).WEIGHT_COUNT === 1796 && PB.describePolicy(b.fly.policyId, b.fly.policy).WEIGHT_COUNT === 1099 && /male-cns/.test(b.fly.citation) && /BatchedMLP/.test(b.gpu.citation));
}

sec("3. SETS_GPU: the same training and picking, audits of its own");
{
    const S = TR.SETS, G = TR.SETS_GPU, rest = [G.audit, G.safetyAudit], others = [S.train, S.heldOut, S.pool, S.reserve, S.audit, S.safetyAudit, T.AUDIT_SET, T.AUDIT2_SET];
    ok("!! SETS_GPU is SETS with the audit and the safety audit swapped, by identity: the same train, held-out, pool and reserve; AUDIT4_SET (36) and SAFETY_AUDIT2_SET (500) for the audits; frozen; setsOf() gives each brain its own", Object.isFrozen(G) && G.train === S.train && G.heldOut === S.heldOut && G.pool === S.pool && G.reserve === S.reserve && G.audit === T.AUDIT4_SET && G.safetyAudit === T.SAFETY_AUDIT2_SET && G.audit.length === 36 && G.safetyAudit.length === 500 && TR.setsOf({}) === S && TR.setsOf({ brain: "fly" }) === S && TR.setsOf({ brain: "gpu" }) === G);
    ok("!! *** EVERY AUDIT IS READ ONCE, BY ONE CHAMPION ***: the GPU brain's audit and safety audit share no scenario with the fruit fly's (read at v4869), with anything the searches train on, the champion is picked on, the pool or the reserve, or with the spent AUDIT_SET and AUDIT2_SET", rest.every((a) => others.every((o) => overlap(a, o) === 0)) && overlap(G.audit, G.safetyAudit) === 0);
}

// ---- small sets and the MLP, for the logic ------------------------------------------------------------------------------------------------------------------------------------------------------
const small = T.TRAIN_SET.slice(0, 6), hw = MF.handWeights();
const SMALL = { train: small, heldOut: T.HELD_OUT_SET, pool: every(T.SAFETY_POOL_SET, 25), audit: every(T.AUDIT4_SET, 3), reserve: T.BASELINE_SET.slice(0, 6), safetyAudit: every(T.SAFETY_AUDIT2_SET, 25) };
const GPU = { brain: "gpu", runs: 2, iters: 4, seed: 7000, sigma: 0.3, maxK: 4 };

sec("4. the searches run the MLP");
{
    const s0 = TR.searchOne(GPU, 0), s0b = TR.searchOne(GPU, 0), s1 = TR.searchOne(GPU, 1), f0 = TR.searchOne({ ...GPU, brain: "fly", seed: 6000 }, 0);
    ok("!! a search under --brain gpu is the MLP's: 1,796 weights, seed = 7000 + k, deterministic for (recipe, k), two seeds different searches, and not the fruit fly's search of the same k (1,099 weights)", s0.weights.length === 1796 && s0.seed === 7000 && s1.seed === 7001 && weightsHash(s0.weights) === weightsHash(s0b.weights) && f0.weights.length === 1099 && f0.seed === 6000 && weightsHash(MF.train({ seed: 7000, iters: 4 }).weights) !== weightsHash(MF.train({ seed: 7001, iters: 4 }).weights));
    ok("every search is PRUNED toward the autopilot's hand weights IN THIS NETWORK'S LAYOUT: it ends with no more weights differing from MF.handWeights() than it moved, never below the hand train score, and at least one of the two ends with FEWER", [s0, s1].every((s) => s.kept <= s.moved && s.trainScore >= MF.evaluate(hw, T.TRAIN_WIDE_SET).score - 1e-9 && Array.from(s.weights).filter((v, i) => Math.abs(v - hw[i]) > 1e-6).length === s.kept) && [s0, s1].some((s) => s.kept < s.moved), `moved/kept ${s0.moved}/${s0.kept}, ${s1.moved}/${s1.kept}`);
    const mk = (k, w) => ({ k, seed: 7000 + k, weights: w, trainScore: MF.evaluate(w, small).score, improved: 0, neutral: 0, moved: 0, kept: 0 });
    const lines = [], res = TR.finish(GPU, [mk(0, Float32Array.from(hw))], (m) => lines.push(m), SMALL), flyHandAsMlp = PF.evaluate(PF.handWeights(), T.HELD_OUT_SET);
    ok("!! finish() evaluates a network's weights with ITS OWN policy: the MLP's hand weights as the only search give a champion that holds out exactly as the autopilot does (the same flights, the bits of the fruit fly's hand weights), so 'equal is not better' refuses it by name -- were the 1,796 weights read in the fruit fly's layout the pilot would differ", res.champion && res.champion.weights.length === 1796 && res.champion.heldOut.score === res.hand.heldOut.score && res.hand.heldOut.score === flyHandAsMlp.score && !res.verdict.ok && res.verdict.reasons.some((r) => /held-out score/.test(r)), res.champion ? `${res.champion.heldOut.score.toFixed(4)}` : "no champion");
    ok("...on the GPU brain's own audits: finish() graded the champion on AUDIT4's slice and SAFETY_AUDIT2's slice (the slices it was handed), the hand pilot on the same", res.champion.audit.runs.length === SMALL.audit.length && res.hand.audit.runs.length === SMALL.audit.length && res.champion.safety.n === SMALL.safetyAudit.length && res.hand.safety.n === SMALL.safetyAudit.length && lines.some((l) => /^champion .*the best held-out of the eligible/.test(l)));
    const kid = TR_spawn(["--brain", "gpu", "--one", "1", "--runs", "2", "--iters", "4"]);
    ok("!! `--brain gpu --one 1` (the child's mode) prints search 1 as the MLP's: 1,796 weights, the in-process search 1's every one, exactly", kid && kid.seed === 7001 && kid.weights.length === 1796 && kid.weights.every((v, i) => v === s1.weights[i]) && kid.kept === s1.kept && kid.moved === s1.moved);
    globalThis.__s = { s0, s1 };
}
function TR_spawn(args) {
    const r = spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "trainPilotFlight.mjs"), ...args], { encoding: "utf8", timeout: 180000 });
    const line = (r.stdout || "").split("\n").find((l) => l.startsWith("SEARCH "));
    return r.status === 0 && line ? JSON.parse(line.slice(7)) : null;
}
import { spawnSync } from "node:child_process";

sec("5. the command, with its side effects injected");
{
    const tool = path.join(ENG, "tools", "ship", "trainPilotFlight.mjs"), { s0, s1 } = globalThis.__s;
    const cap = () => { const o = { lines: [], files: {}, err: [] }; o.io = { out: (m) => o.lines.push(m), err: (m) => o.err.push(m), writeFile: (f, c) => { o.files[f] = c; }, selfPath: tool }; return o; };
    let seenOpts = null; const yes = { hand: { heldOut: E(-0.485), audit: E(-0.52), reserve: E(-0.358), safety: { n: 500, crashed: [], brush: 51, deep: 21 } },
        champion: { seed: 7002, weights: hw, kept: 120, moved: 200, heldOut: E(-0.30), audit: E(-0.40), reserve: E(-0.26), safety: { n: 500, crashed: [], brush: 50, deep: 20 }, vs: { better: 30, worse: 3, same: 3 } }, runs: [], verdict: { ok: true, reasons: [] } };
    const c1 = cap(), x1 = await TR.command(["--brain", "gpu", "--write"], { ...c1.io, run: (o) => { seenOpts = o; return yes; } }).catch((e) => "threw: " + e.message);   // a blob the wrong policy cannot write must be a red row, not a crashed gate
    const wrote = c1.files[TR.BRAINS.gpu.out] ? JSON.parse(c1.files[TR.BRAINS.gpu.out]) : null;
    ok("!! --brain gpu --write hands the brain to the run and writes ONE file, the GPU brain's, a swek-brain-v1 blob for pilotFlightMlp with 1,796 weights, citing the GPU Brain, and `by` quoting the GPU brain's audits (36 scenarios, 500 starts)", x1 === 0 && seenOpts && seenOpts.brain === "gpu" && seenOpts.seed === 7000 && Object.keys(c1.files).join() === TR.BRAINS.gpu.out && wrote && wrote.format === "swek-brain-v1" && wrote.policy === "pilotFlightMlp" && wrote.weightCount === 1796 && /BatchedMLP/.test(wrote.citation) && /over the 36 audit scenarios/.test(wrote.by) && /safety audit of 500 starts/.test(wrote.by) && /champion picked on the 30 held-out scenarios/.test(wrote.by) && /of the 1796 weights differ/.test(wrote.by), wrote ? wrote.by.slice(0, 80) : "nothing written");
    ok("the blob is accepted by the GPU Brain's importer and refused BY NAME by the fruit fly's (a blob of one policy cannot be taken for another), and the fruit fly's blob is refused by the GPU Brain's", PB.importBrain(PB.describePolicy("pilotFlightMlp", MF), wrote).ok && /pilotFlightMlp/.test(PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), wrote).reason || "") && !PB.importBrain(PB.describePolicy("pilotFlightPolicy", PF), wrote).ok && !PB.importBrain(PB.describePolicy("pilotFlightMlp", MF), PB.exportBrain(PB.describePolicy("pilotFlightPolicy", PF), PF.handWeights(), { score: 0 })).ok);
    const c2 = cap(); let seen2 = null;
    const x2 = await TR.command(["--brain", "gpu", "--runs", "2", "--iters", "4", "--workers", "2", "--quiet"], { ...c2.io, finish: (o, runs) => { seen2 = { o, runs }; return { ...yes, verdict: { ok: false, reasons: ["x"] } }; } });
    ok("!! `--brain gpu --workers 2` runs each search in its OWN PROCESS with the brain passed down, and finish() gets the MLP's weights those searches found: 1,796 each, the same bits as the in-process searches, in run order", x2 === 0 && seen2 && seen2.o.brain === "gpu" && seen2.runs.length === 2 && seen2.runs.every((r, k) => r.k === k && r.weights.length === 1796) && weightsHash(seen2.runs[0].weights) === weightsHash(s0.weights) && weightsHash(seen2.runs[1].weights) === weightsHash(s1.weights));
    const bad = await TR.command(["--brain", "tpu"], { ...cap().io, run: () => { throw new Error("trained"); } }).catch((e) => e.message);
    ok("an unknown brain returns 2 before any training", bad === 2);
}

sec("6. THE SHIPPED GPU PILOT IS WHAT ITS `by` SAYS (brain/pilotFlightMlpWeightsDefault.json)");
{
    const exists = fs.existsSync(GPU_FILE);
    ok("the shipped GPU pilot exists (the page fetches it)", exists, GPU_FILE);
    if (exists) {
        const blob = JSON.parse(fs.readFileSync(GPU_FILE, "utf8")), DESC = PB.describePolicy("pilotFlightMlp", MF), imp = PB.importBrain(DESC, blob), by = blob.by || "", G = TR.SETS_GPU;
        ok("!! it is a swek-brain-v1 file for pilotFlightMlp with 1,796 weights that the importer the page uses accepts, and it carries a `by`, a score and a citation", imp.ok && blob.weightCount === 1796 && by.length > 400 && typeof blob.score === "number" && /BatchedMLP/.test(blob.citation || "") && !/TEMPORARY/.test(by), imp.ok ? "" : imp.reason);
        if (imp.ok) {
            const w = imp.weights, ev = (x, set) => MF.evaluate(x, set), kept = Array.from(w).filter((v, i) => Math.abs(v - hw[i]) > 1e-6).length;
            const heldOut = ev(w, G.heldOut), audit = ev(w, G.audit), reserve = ev(w, G.reserve), safety = TR.tails(ev(w, G.safetyAudit)), pool = TR.tails(ev(w, G.pool));
            const hHeld = ev(hw, G.heldOut), hAudit = ev(hw, G.audit), hReserve = ev(hw, G.reserve), hSafety = TR.tails(ev(hw, G.safetyAudit)), hPool = TR.tails(ev(hw, G.pool)), vs = T.versus(audit, hAudit), R = TR.RECIPE;
            ok("!! `by` quotes the RECIPE the tool holds (seed k of the runs 7000..7003, sigma 0.3, 1-4 weights a child, 1000 iterations over the 40 train scenarios) and the sets the champion was picked and graded on", /seed 700[0-3] of 4 runs \(7000\.\.7003\)/.test(by) && by.includes(`sigma ${R.sigma}, 1-${R.maxK} weights per child, ${R.iters} iterations over the ${G.train.length} train scenarios`) && by.includes(`champion picked on the ${G.heldOut.length} held-out scenarios among the searches no more dangerous than the autopilot on the ${G.pool.length}-start safety pool`));
            ok("!! `by` is TRUE of the weights, recomputed here: the count of weights that differ from the autopilot, the held-out score (and the file's own `score`), the audit with every kind, the scenarios better and worse, the reserve", by.includes(`${kept} of the ${MF.WEIGHT_COUNT} weights differ from the autopilot`) && by.includes(`held-out ${T.describeEval(heldOut)} (the autopilot ${hHeld.score.toFixed(4)})`) && blob.score === Number(heldOut.score.toFixed(4)) &&
                by.includes(`audit ${T.describeEval(audit)} over the ${G.audit.length} audit scenarios (the autopilot ${hAudit.score.toFixed(4)}; ${vs.better} scenarios better, ${vs.worse} worse)`) && by.includes(`reserve ${reserve.score.toFixed(4)} (the autopilot ${hReserve.score.toFixed(4)})`), `${kept} weights differ; held-out ${heldOut.score.toFixed(4)}; audit ${audit.score.toFixed(4)}; ${vs.better}/${vs.worse}`);
            ok("!! ...and the safety audit it quotes: of 500 starts nobody had flown, the flights ended early, past the full-stall angle and brushing the stall, the champion's and the autopilot's", by.includes(`safety audit of ${safety.n} starts: ${safety.crashed.length} ended early (the autopilot ${hSafety.crashed.length}), ${safety.deep} past the full-stall angle (the autopilot ${hSafety.deep}), ${safety.brush} brushing the stall (the autopilot ${hSafety.brush})`), `${safety.crashed.length}/${hSafety.crashed.length} early, ${safety.deep}/${hSafety.deep} deep, ${safety.brush}/${hSafety.brush} brush`);
            ok("!! the autopilot's own numbers on the GPU brain's audits are pinned: AUDIT4 -0.5236, none ending early; SAFETY_AUDIT2 none ending early, 21 past the full-stall angle, 51 brushing the stall", Math.abs(hAudit.score - -0.5236) < 6e-5 && hAudit.crashed === 0 && hSafety.crashed.length === 0 && hSafety.deep === 21 && hSafety.brush === 51);
            const q = TR.qualifies({ heldOut, audit, reserve, safety, vs }, { heldOut: hHeld, audit: hAudit, reserve: hReserve, safety: hSafety });
            ok("!! *** THE SHIPPED GPU PILOT QUALIFIES UNDER THE RULES AS THEY STAND NOW ***: every clause of qualifies(), recomputed from its weights", q.ok, q.reasons.join("; "));
            const pr = TR.tailReasons(pool, hPool, "the safety pool");
            ok("!! and it was ELIGIBLE: on the 500-start safety pool it ends no flight early that the autopilot completes and its deep stalls and brushes are within the allowance", pr.length === 0, pr.join("; ") || `${pool.crashed.length} ended early, ${pool.deep} deep, ${pool.brush} brushes`);
            ok("it is a trained pilot and not the autopilot: it scores better than the autopilot on the held-out and audit scenarios by more than 0.05, and differs from the hand weights in more than 20 and fewer than 600 weights", heldOut.score > hHeld.score + 0.05 && audit.score > hAudit.score + 0.05 && kept > 20 && kept < 600, `held-out ${heldOut.score.toFixed(4)} vs ${hHeld.score.toFixed(4)}`);
        }
    }
}

console.log(fails ? `\ntrainFlightPilotGpu-selfcheck: ${fails} FAILED` : "\ntrainFlightPilotGpu-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
