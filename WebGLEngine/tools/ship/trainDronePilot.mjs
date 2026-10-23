// WebGLEngine/tools/ship/trainDronePilot.mjs -- UNNUMBERED (the library; the command is tools/ship/trainPilotDrone.mjs)
//
// TRAIN THE FRUIT FLY AND THE GPU BRAIN TO FLY THE QUADROTOR, AND SAY WHAT THEY DID. brain/pilotDronePolicy.mjs holds the Giant Fiber Circuit wired as the hand pilot (brain/autopilotDrone.mjs): 1,167 weights, 22 of them non-zero, and a flight that is exactly the hand pilot's on brain/droneTask.mjs's job
// (hold a point, a height and a heading for 20 s: from a clean start in a gusty wind, from a start that is a mess, from far away -- or land when a motor stops). brain/pilotDroneMlp.mjs is the same laws through a plain 20 -> 32 -> 32 -> 4 perceptron. This is the recipe tools/ship/trainRotorPilot.mjs holds
// for the helicopter (it is that file, with the task's kind "motor" for the helicopter's "engine"), with the lessons it learned kept: FLIGHT ONLY.
//
//   1. SEARCH. Several independent searches (the policy's train(): a sparse-mutation (1+1)-ES from the hand weights) on the TRAIN_SET scenarios, each pruned back to the weights that carry the result.
//   2. ELIGIBILITY. A search is ELIGIBLE to be champion only if, on SAFETY_POOL_SET (60 starts nothing trains on, every kind), it ends no flight early that the hand pilot completes. (The hand pilot ends every motor-out flight early: nothing it completes can be lost there; the tail that can be lost is the
//      other three kinds, where the hand pilot flies to the end of every one.)
//   3. CHAMPION. The eligible search that scores best on the 28 HELD_OUT_SET scenarios. If no search is eligible there is no champion, nothing is written, and the audit is NOT read.
//   4. VERDICT. qualifies(): the champion is graded ONCE on its AUDIT set (42 scenarios nothing has flown) and its SAFETY_AUDIT set (60 more starts), and must beat the hand pilot on the held-out and audit scores, fly more audit scenarios better than worse, lose no KIND of scenario by more than KIND_SLACK,
//      end no more audit flights early than the hand pilot, not fly the reserve (BASELINE_SET) worse by more than RESERVE_SLACK, and end no flight early on the safety audit that the hand pilot completes.
//
//   * The clauses are fixed in this file BEFORE the sets that judge with them were read, and are not to be loosened after.
//   * The two brains have audits of their own (AUDIT_SET and AUDIT2_SET, SAFETY_AUDIT_SET and SAFETY_AUDIT2_SET): every audit is read once, by one champion.
//   * The searches are deterministic for a seed and independent of each other, so `--workers` runs them in separate processes and gets the same answer to the bit.
//   * A pilot that learns the motor-out corner and forgets the hover is not shipped: no kind may score more than KIND_SLACK worse than the hand pilot's on the audit.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PP from "../../brain/pilotDronePolicy.mjs";
import * as MR from "../../brain/pilotDroneMlp.mjs";
import * as DT from "../../brain/droneTask.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilotDroneWeightsDefault.json");
/** The second recipe's files (a guarded objective on fresh audits: `--guard G --sets v2`): beside the first recipe's, never over them. */
export const DEFAULT_OUT_V2 = path.resolve(HERE, "..", "..", "brain", "pilotDroneWeightsV2.json");
export const RECIPE = Object.freeze({ runs: 4, iters: 600, seed: 8000, sigma: 0.3, maxK: 4 });
/**
 * THE TWO BRAINS THIS TOOL TRAINS, by the same recipe, the same task and the same rules: "fly" is the fruit fly's Giant Fiber Circuit (brain/pilotDronePolicy.mjs, 1,167 weights) and "gpu" is the GPU Brain's MLP (brain/pilotDroneMlp.mjs, 20 -> 32 -> 32 -> 4, 1,860 weights):
 * each starts from the hand pilot's laws written through its own network, and each is graded on audits of its own.
 */
export const BRAINS = Object.freeze({
    fly: Object.freeze({ id: "fly", policy: PP, policyId: "pilotDronePolicy", out: DEFAULT_OUT, outV2: DEFAULT_OUT_V2, seed: 8000, seedV2: 8100, name: "the fruit fly's Giant Fiber Circuit", citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md), wired as the hand quadrotor pilot (brain/pilotDronePolicy.mjs)" }),
    gpu: Object.freeze({ id: "gpu", policy: MR, policyId: "pilotDroneMlp", out: path.resolve(HERE, "..", "..", "brain", "pilotDroneMlpWeightsDefault.json"), outV2: path.resolve(HERE, "..", "..", "brain", "pilotDroneMlpWeightsV2.json"), seed: 9000, seedV2: 9100, name: "the GPU Brain's MLP", citation: "SweK GPU Brain: brain/mlp.js's BatchedMLP, 20 -> 32 -> 32 -> 4, wired as the hand quadrotor pilot (brain/pilotDroneMlp.mjs)" }),
});
export const brainOf = (opts) => { const b = BRAINS[(opts && opts.brain) || "fly"]; if (!b) throw new Error(`unknown brain ${JSON.stringify(opts.brain)} (known: ${Object.keys(BRAINS).join(", ")})`); return b; };
/** How far below the hand pilot's score a KIND of audit scenario may be, and how far below its score on the reserve the champion may be: a chosen floor, not a test statistic. */
export const KIND_SLACK = 0.02, RESERVE_SLACK = 0.01;
/** The sets the verdict is made on: the searches train on `train`, the champion is picked on `heldOut` among the searches `pool` allows, and `audit`, `reserve` and `safetyAudit` are read once, for the champion. Injectable (finish() takes them). */
export const SETS = Object.freeze({ train: DT.TRAIN_SET, heldOut: DT.HELD_OUT_SET, pool: DT.SAFETY_POOL_SET, audit: DT.AUDIT_SET, reserve: DT.BASELINE_SET, safetyAudit: DT.SAFETY_AUDIT_SET });
/** The GPU brain's: the same training, held-out, pool and reserve; an audit and a safety audit of its own. */
export const SETS_GPU = Object.freeze({ ...SETS, audit: DT.AUDIT2_SET, safetyAudit: DT.SAFETY_AUDIT2_SET });
/** The second recipe's sets: the same training, held-out and pool; FRESH audits, reserve and safety audits (the first ones were read by the first champions). */
export const SETS_V2 = Object.freeze({ ...SETS, audit: DT.AUDIT_SET_V2, reserve: DT.BASELINE_SET_V2, safetyAudit: DT.SAFETY_AUDIT_SET_V2 });
export const SETS_GPU_V2 = Object.freeze({ ...SETS_V2, audit: DT.AUDIT2_SET_V2, safetyAudit: DT.SAFETY_AUDIT2_SET_V2 });
export const setsOf = (opts) => { const gpu = brainOf(opts).id === "gpu"; return opts && opts.sets === "v2" ? (gpu ? SETS_GPU_V2 : SETS_V2) : (gpu ? SETS_GPU : SETS); };
const cmp = DT.describeEval;

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). `--one K` is the child's mode (see trainPilotDrone.mjs). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, maxK: Number, workers: Number, one: Number, slice: Number, out: String, dump: String, brain: String, guard: Number, sets: String, write: Boolean, quiet: Boolean };
    const given = {};   // what the command line set, in ONE pass: the brain's own defaults (its seed, its file) go underneath it afterwards, so an explicit option beats them on whichever side of --brain it is written
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2);
        if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const want = "brain" in given ? given.brain : "fly";
    if (!BRAINS[want]) throw new Error(`--brain must be one of ${Object.keys(BRAINS).join(", ")}, got ${JSON.stringify(want)}`);
    const b = BRAINS[want], ver = "sets" in given ? given.sets : "v1";
    if (ver !== "v1" && ver !== "v2") throw new Error(`--sets must be v1 or v2, got ${JSON.stringify(ver)}`);
    if ("guard" in given && !(given.guard >= 0)) throw new Error(`--guard needs a slack of 0 or more, got ${given.guard}`);
    return { ...RECIPE, seed: ver === "v2" ? b.seedV2 : b.seed, workers: 1, one: null, slice: 1, out: ver === "v2" ? b.outV2 : b.out, dump: null, write: false, quiet: false, guard: null, ...given, sets: ver, brain: b.id };
}

// ---- the tails -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The ids (kind + seed) of the flights a set ended early: a motor flight that did not end standing, any other that did not stay airborne. */
export const endedEarly = (res) => res.runs.filter((r) => (r.kind === "motor" ? !r.settled : r.status !== "airborne")).map((r) => `${r.kind}:${r.seed}`);
/** What a set of flights says about the tail: how many flights, and which ended early. */
export const tails = (res) => ({ n: res.runs.length, crashed: endedEarly(res) });
/** Is the champion's tail no worse than the hand pilot's? Pure. Returns the reasons it is not: every flight it ends early that the hand pilot completes. (A flight both end early is not charged: the hand pilot's dead man's curve is not the champion's fault.) */
export function tailReasons(champ, hand, where = "the safety pool") {
    const reasons = [], fresh = champ.crashed.filter((id) => !hand.crashed.includes(id));
    if (fresh.length) reasons.push(`on ${where} it ends ${fresh.length} flight${fresh.length > 1 ? "s" : ""} early that the hand pilot completes (${fresh.slice(0, 4).join(", ")}${fresh.length > 4 ? ", ..." : ""})`);
    return reasons;
}

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ/hand: { heldOut, audit, reserve, safety } -- evaluate() results (score, crashed, byKind) for the first three and tails() for `safety` (the safety audit); champ.vs is versus(champ.audit, hand.audit).
 */
export function qualifies(champ, hand) {
    const reasons = [];
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(4)} does not beat the hand pilot's ${hand.heldOut.score.toFixed(4)}`);
    if (!(champ.audit.score > hand.audit.score)) reasons.push(`audit score ${champ.audit.score.toFixed(4)} does not beat the hand pilot's ${hand.audit.score.toFixed(4)}`);
    if (!(champ.vs.better > champ.vs.worse)) reasons.push(`on the audit scenarios it flies ${champ.vs.better} better and ${champ.vs.worse} worse than the hand pilot: not more better than worse`);
    if (champ.audit.crashed > hand.audit.crashed) reasons.push(`${champ.audit.crashed} audit flights ended early against the hand pilot's ${hand.audit.crashed}`);
    for (const k of DT.KINDS) if (k in hand.audit.byKind && !((champ.audit.byKind[k] ?? -Infinity) >= hand.audit.byKind[k] - KIND_SLACK))
        reasons.push(`the ${k} audit scenarios score ${(champ.audit.byKind[k] ?? NaN).toFixed(4)}, more than ${KIND_SLACK} below the hand pilot's ${hand.audit.byKind[k].toFixed(4)}`);
    if (!(champ.reserve.score >= hand.reserve.score - RESERVE_SLACK)) reasons.push(`the reserve scenarios score ${champ.reserve.score.toFixed(4)}, more than ${RESERVE_SLACK} below the hand pilot's ${hand.reserve.score.toFixed(4)}`);
    if (champ.reserve.crashed > hand.reserve.crashed) reasons.push(`${champ.reserve.crashed} reserve flights ended early against the hand pilot's ${hand.reserve.crashed}`);
    reasons.push(...tailReasons(champ.safety, hand.safety, "the safety audit"));
    return { ok: reasons.length === 0, reasons };
}

/** One independent search (run number k of the recipe), pruned back toward the hand pilot. Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k) {
    // `--slice N` trains on every Nth training scenario: a SMALL recipe for trying the machinery (the gate's children use it); `opts.trainSet` is the same for a caller with its own set; neither given is TRAIN_SET. A sliced recipe is never written (command()).
    const trainSet = opts.trainSet || (opts.slice > 1 ? DT.TRAIN_SET.filter((_, i) => i % opts.slice === 0) : undefined);
    // `--guard G`: the search's objective is the training score, worth -Infinity once the mean on hover, recovery or go-to falls more than G below the hand pilot's (brain/droneTask.mjs guarded): the first retrain bought its motor-out gain with those kinds, on the training scenarios too
    const P = brainOf(opts).policy, seed = opts.seed + k, objective = opts.guard != null ? DT.guarded(P.evaluate(P.handWeights(), trainSet || DT.TRAIN_SET), opts.guard) : null;
    const found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSet, objective }), out = P.prune(found.weights, { trainSet, objective });
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

const describeTails = (t) => `${t.crashed.length} ended early of ${t.n}`;

/** The champion of `runs` (each from searchOne; `opts.policy` is for the gate, which drives the logic with a stand-in whose flights it controls): eligibility on the safety pool, the best held-out among the eligible, then the audit, the reserve and the safety audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}, sets = setsOf(opts)) {
    const P = opts.policy || brainOf(opts).policy, handW = P.handWeights(), ev = (w, set) => P.evaluate(w, set);
    const hand = { train: ev(handW, sets.train), heldOut: ev(handW, sets.heldOut), pool: tails(ev(handW, sets.pool)) };
    log(`the hand pilot (the hand weights): train ${cmp(hand.train)} | held-out ${cmp(hand.heldOut)} | safety pool: ${describeTails(hand.pool)}`);
    const scored = runs.map((r) => {
        const heldOut = ev(r.weights, sets.heldOut), pool = tails(ev(r.weights, sets.pool)), why = tailReasons(pool, hand.pool, "the safety pool");
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(4)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out ${cmp(heldOut)}; safety pool: ${describeTails(pool)}${why.length ? " -- INELIGIBLE: " + why[0] : ""}`);
        return { ...r, heldOut, pool, eligible: why.length === 0, ineligible: why };
    });
    // the champion is the best HELD-OUT among the ELIGIBLE searches; the audit, the reserve and the safety audit are read once, after
    scored.sort((a, b) => b.heldOut.score - a.heldOut.score || a.k - b.k);
    const c = scored.find((r) => r.eligible);
    if (!c) {
        const verdict = { ok: false, reasons: ["no search is eligible: " + scored.map((r) => `seed ${r.seed}: ${r.ineligible[0]}`).join(" | ")] };
        log("NO CHAMPION. " + verdict.reasons[0] + " -- the audit was not read.");
        return { hand, runs: scored, champion: null, verdict };
    }
    Object.assign(hand, { audit: ev(handW, sets.audit), reserve: ev(handW, sets.reserve), safety: tails(ev(handW, sets.safetyAudit)) });
    const train = ev(c.weights, sets.train), audit = ev(c.weights, sets.audit), reserve = ev(c.weights, sets.reserve), safety = tails(ev(c.weights, sets.safetyAudit));
    const champion = { seed: c.seed, weights: c.weights, kept: c.kept, moved: c.moved, train, heldOut: c.heldOut, pool: c.pool, audit, reserve, safety, vs: DT.versus(audit, hand.audit) };
    const verdict = qualifies(champion, hand);
    log(`the hand pilot on what the champion is graded on: audit ${cmp(hand.audit)} | reserve ${cmp(hand.reserve)} | safety audit: ${describeTails(hand.safety)}`);
    log(`champion (seed ${c.seed}, the best held-out of the eligible): train ${cmp(train)} | held-out ${cmp(c.heldOut)} | audit ${cmp(audit)} (${champion.vs.better} better / ${champion.vs.worse} worse / ${champion.vs.same} level than the hand pilot) | reserve ${cmp(reserve)} | safety audit: ${describeTails(safety)}`);
    log(verdict.ok ? "QUALIFIES: beats the hand pilot on the held-out and audit scenarios, loses no kind of scenario, does not fly the reserve worse, and ends no flight early on 60 starts nothing had flown that the hand pilot completes." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { hand, runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}, sets = setsOf(opts)) {
    const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k));
    return finish(opts, runs, log, sets);
}

/** Every run's pruned weights and scores and the verdict, as one JSON-able object: what `--dump` writes so a result that did not qualify can still be looked at (it is NOT a shipped file, and nothing reads it back). */
export function dumpOf(result, opts) {
    const sc = (r) => ({ score: r.score, crashed: r.crashed, byKind: r.byKind });
    return { recipe: { brain: brainOf(opts).id, runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK, slice: opts.slice || 1, guard: opts.guard == null ? null : opts.guard, sets: opts.sets || "v1" }, champion: result.champion ? result.champion.seed : null, verdict: result.verdict,
        hand: { heldOut: sc(result.hand.heldOut), pool: result.hand.pool, audit: result.hand.audit ? sc(result.hand.audit) : null, reserve: result.hand.reserve ? sc(result.hand.reserve) : null, safety: result.hand.safety || null },
        runs: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: sc(r.heldOut), pool: r.pool, eligible: r.eligible, kept: r.kept, moved: r.moved, weights: Array.from(r.weights) })) };
}

/**
 * WHAT A READER OF A SHIPPED FILE MUST BE TOLD, written into every file's `by` (measured on the shipped file, which the gate re-measures): the motor-out flight's cost charges the sink at first contact, the speed over the ground there (LANDING_GS of brain/droneTask.mjs: 0.4 for each 5 m/s up to 2.0)
 * and whether the machine is standing four seconds later, and a crash by the speed at which it hit -- and the speed charge is a CHOSEN stand-in for a roll-over limit the quadrotor model does not have, so a pilot is not rewarded for carrying speed in but nothing makes a fast landing tip over, and what
 * a real machine would walk away from is not claimed. And the world is the task's: flat ground at 0, no obstacle, no terrain, the wind a sum of two sinusoids a side, a motor that stops dead and whole, a battery that is full: none of it is a measurement of a real quadrotor.
 */
export const LIMITS = "KNOWN LIMITS OF THE TASK THIS WAS MADE ON, SAID PLAINLY: the cost of a motor-out flight charges the sink at first contact, the speed over the ground there (0.4 for each 5 m/s, up to 2.0: a stand-in that was CHOSEN and not measured for a roll-over limit the model does not have), whether the machine is still standing four seconds later, and a crash by the speed it hit at (3 + 4 x speed / 25); so a pilot is not rewarded for carrying speed in, but nothing makes a fast landing tip over and what a real machine would walk away from is not claimed. The world is the task's own -- flat ground, no obstacle, a wind of two sinusoids a side, a motor that stops dead and whole, a full battery -- and none of it is a measurement of a real quadrotor (see the gate: tools/ship/trainDronePilot-selfcheck.mjs). AND THE MOTOR-OUT CORNER IS NOT SOLVED, WHICH IS WHAT THE TRAINING WAS FOR: the hand pilot lands none of the motor-out flights (every one ends crashed at 14 to 42 m/s) and a trained pilot may land none either, so a better motor-out score can be only a SLOWER CRASH (3 + 4 x speed / 25) -- the file's `by` quotes how many flights end not standing so that it can be seen.";

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const B = brainOf(opts), sets = setsOf(opts), c = result.champion, h = result.hand, desc = PB.describePolicy(B.policyId, B.policy);
    const by = `sparse-mutation (1+1)-ES from the hand weights (the hand pilot's laws), seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} children per run, on the ${sets.train.length} training scenarios of brain/droneTask.mjs (hover in a gusty wind, recovery from an upset, go-to, a motor failing)${opts.guard != null ? `, THE SEARCH GUARDED: a child whose hover, recovery or go-to training mean fell more than ${opts.guard} below the hand pilot's was refused` : ""}; ` +
        `then pruned: ${c.kept} of the ${B.policy.WEIGHT_COUNT} weights differ from the hand pilot; champion picked on the ${sets.heldOut.length} held-out scenarios among the searches that end no flight early on the ${sets.pool.length} starts of the safety pool that the hand pilot completes; ` +
        `${opts.sets === "v2" ? "on FRESH second-recipe audit, reserve and safety-audit seeds; " : ""}audit ${cmp(c.audit)} over the ${sets.audit.length} audit scenarios (the hand pilot ${h.audit.score.toFixed(4)}; ${c.vs.better} scenarios better, ${c.vs.worse} worse), reserve ${c.reserve.score.toFixed(4)} (the hand pilot ${h.reserve.score.toFixed(4)}), ` +
        `safety audit of ${c.safety.n} starts: ${c.safety.crashed.length} ended early (the hand pilot ${h.safety.crashed.length}), none that the hand pilot completes. ` + LIMITS;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: B.citation });
}
/**
 * THE COMMAND, as a function (tools/ship/trainPilotDrone.mjs is the three lines that call it): parse, search (in this process, or each search in its own with `--workers`), grade, and write only what qualifies. Returns the exit
 * code: 0 done, 1 `--write` asked and the champion does not qualify (nothing written), 2 a bad argument. `io` is for the gate: { out, err, finish, run, writeFile, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, doRun = io.run || run, doFinish = io.finish || finish;
    let opts; try { opts = parseArgs(argv); } catch (e) { err("trainPilotDrone: " + e.message); return 2; }
    if (opts.write && opts.slice > 1) { err("trainPilotDrone: --write with --slice: a recipe on a slice of the training scenarios is for trying the machinery, and its file would say it was the full one -- not written"); return 2; }
    const log = opts.quiet ? () => {} : out;
    if (opts.one != null) { const r = searchOne(opts, opts.one); out("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) })); return 0; }
    let result;
    if (opts.workers > 1 && opts.runs > 1) {
        // each search in its own process (a search touches nothing the others do: its own seed, the hand weights read-only); finish() runs here once, on the weights they send back
        const passthrough = ["--brain", opts.brain, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--maxK", opts.maxK, "--runs", opts.runs, "--slice", opts.slice, ...(opts.guard != null ? ["--guard", opts.guard] : [])].map(String);   // the guard goes to the children: a search that was told to be guarded and was not would be the first recipe, under the second recipe's name
        const runOne = (k) => new Promise((resolve, reject) => {
            const t0 = Date.now(), child = spawn(process.execPath, [io.selfPath, ...passthrough, "--one", String(k)], { stdio: ["ignore", "pipe", "inherit"] });
            let buf = ""; child.stdout.on("data", (d) => { buf += d; });
            child.on("error", reject);
            child.on("close", (code) => {
                const line = buf.split("\n").find((l) => l.startsWith("SEARCH "));
                if (code !== 0 || !line) return reject(new Error(`search ${k} exited ${code} without a result`));
                const r = JSON.parse(line.slice(7)); r.weights = Float32Array.from(r.weights);
                log(`  search ${k + 1}/${opts.runs} (seed ${r.seed}) done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pruned ${r.moved} moved weights to ${r.kept}`);
                resolve(r);
            });
        });
        const pending = Array.from({ length: opts.runs }, (_, k) => k), runs = new Array(opts.runs);
        await Promise.all(Array.from({ length: Math.min(opts.workers, opts.runs) }, async () => { while (pending.length) { const k = pending.shift(); runs[k] = await runOne(k); } }));
        result = doFinish(opts, runs, log);
    } else result = doRun(opts, log);
    if (opts.dump) { writeFile(opts.dump, JSON.stringify(dumpOf(result, opts)) + "\n"); out(`dumped every run's weights and scores to ${opts.dump} (not a shipped file)`); }
    if (opts.write) {
        if (!result.verdict.ok) { out("not written: " + result.verdict.reasons.join("; ")); return 1; }
        const blob = blobOf(result, opts); writeFile(opts.out, JSON.stringify(blob) + "\n");
        out(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
    }
    return 0;
}
export { weightsHash };
