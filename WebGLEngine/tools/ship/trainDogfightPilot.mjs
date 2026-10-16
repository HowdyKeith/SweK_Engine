// WebGLEngine/tools/ship/trainDogfightPilot.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainPilotDogfight.mjs)
//
// TRAIN THE REAL-FLIGHT PILOTS TO FIGHT AND SAY WHAT THEY DID. brain/dogfightTask.mjs is the job (two aircraft, a gun each, a pilot behind pursuit guidance, a score for hits landed and hits taken); the networks are the ones that already fly
// (the fruit fly's Giant Fiber Circuit, brain/pilotFlightPolicy.mjs, 1,099 weights; the GPU Brain's MLP, brain/pilotFlightMlp.mjs, 1,796) and they START from the autopilot's laws written through each, so a search that finds nothing returns
// the autopilot and every number below is measured against it. This is the recipe tools/ship/trainFlightPilot.mjs holds for the same networks on the flight task, with the job changed and the rule restated for it:
//
//   1. SEARCH. Several independent searches (brain/dogfightTrain.mjs, held to the policies' own train/prune): a sparse-mutation (1+1)-ES from the hand weights on the 40 TRAIN fights, each pruned back to the weights that carry the result.
//   2. ELIGIBILITY. A search may be champion only if, on POOL_FIGHT_SET (400 fights nothing trains on), it loses no fight to the GROUND or a COLLISION that the autopilot does not lose, and its fights that pass the full-stall angle are no more
//      than the autopilot's by two standard errors of a count (allowance()). Being SHOT is not a tail -- it is the score. Brushing the stall is REPORTED and not enforced: a fighter that pulls to the edge of the wing is doing its job.
//   3. CHAMPION. The eligible search with the best score on the 40 HELD_OUT fights. No eligible search, no champion, nothing written, and the audit is NOT read.
//   4. VERDICT. qualifies(), fixed in this file BEFORE the audits were read, graded ONCE on AUDIT_FIGHT_SET (120 fights: thirty of each kind) and SAFETY_AUDIT_FIGHT_SET (200 more, for the tails), against the autopilot's own numbers:
//        - the audit mean beats the autopilot's by at least MIN_GAIN (0.05) AND the gain is at least Z_MIN (2) standard errors of the PAIRED difference (the same 120 fights flown by both, so the fight's own difficulty cancels);
//        - the held-out mean beats the autopilot's; more audit fights better than worse; no KIND of fight (tail, offset, turning, duel) more than KIND_SLACK (0.05) below the autopilot's;
//        - the reserve (DOGFIGHT_BENCH_SET, 120 fights of the two kinds that tell pilots apart) no more than RESERVE_SLACK (0.02) below the autopilot's;
//        - the safety audit's tails, as in 2, and no more audit fights lost to the ground or a collision than the autopilot loses.
//   * A pilot that learns to win duels and forgets how to chase a straight target is not shipped: the kind clause is why.
//   * The searches are deterministic for a seed and independent of each other, so `--workers` runs them in separate processes and gets the same answer to the bit (the gate holds that).
//   * WHAT THIS DOES NOT TEACH, SAID PLAINLY: the networks still take {heading, altitude, airspeed} from the pursuit guidance and a hand rule still pulls the trigger. What a search can find is a pilot that FLIES THE GUIDANCE better for fighting
//     (turns harder, holds the lead tighter, takes the speed it needs) -- not one that has learned the geometry or the trigger. That is the next layout (a fifth output and the opponent in the senses; tools/ship/todo.mjs).
//   * THE OPPONENT IS ALWAYS THE PD AUTOPILOT (scripted or hunting), so a champion is a pilot that beats THAT; it is not shown to beat the other pilots, and the file's `by` says so.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as D from "../../brain/dogfightTask.mjs";
import * as DT from "../../brain/dogfightTrain.mjs";
import * as F from "../../physics/mechanics/flightModel6dof.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const POLICY_ID = "pilotFlightPolicy";
export const RECIPE = Object.freeze({ runs: 4, iters: 600, seed: 8000, sigma: 0.3, maxK: 4 });
/**
 * THE TWO BRAINS (the same two networks that fly), each with a file and a seed of its own. Their files are ordinary swek-brain-v1 blobs for the SAME policies the flight pilots are (pilotFlightPolicy, pilotFlightMlp), so the flight page's
 * importer takes them as pilots; what makes one a fighter is its `by`.
 */
export const BRAINS = Object.freeze({
    fly: Object.freeze({ id: "fly", policy: PF, policyId: "pilotFlightPolicy", out: path.resolve(HERE, "..", "..", "brain", "pilotDogfightWeightsDefault.json"), seed: 8000, name: "the fruit fly's Giant Fiber Circuit", citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md), trained on dogfights" }),
    gpu: Object.freeze({ id: "gpu", policy: MF, policyId: "pilotFlightMlp", out: path.resolve(HERE, "..", "..", "brain", "pilotDogfightMlpWeightsDefault.json"), seed: 9000, name: "the GPU Brain's MLP", citation: "SweK GPU Brain: brain/mlp.js BatchedMLP, an 18-32-32-4 relu network started from the autopilot's laws, trained on dogfights" }),
});
export const brainOf = (opts) => { const b = BRAINS[(opts && opts.brain) || "fly"]; if (!b) throw new Error(`unknown brain ${JSON.stringify(opts.brain)} (known: ${Object.keys(BRAINS).join(", ")})`); return b; };
/** The audit's gain the champion must show (an absolute floor), in standard errors of the paired difference, how far below the autopilot a KIND may be, and how far below it on the reserve: chosen floors, not test statistics. */
export const MIN_GAIN = 0.05, Z_MIN = 2, KIND_SLACK = 0.05, RESERVE_SLACK = 0.02, BETTER_EPS = 0.01;
/** The angle of attack (radians) past which the wing has begun to stall, and past which it is fully stalled: the flight model's own numbers. */
export const BRUSH_ANGLE = F.STALL.angle, DEEP_ANGLE = F.STALL.angle + F.STALL.width;
/** The sets: the searches train on `train`, the champion is picked on `heldOut` among the searches `pool` allows, and `audit`, `safetyAudit` are read once, for the champion; `reserve` is the regression guard. */
export const SETS = Object.freeze({ train: D.TRAIN_FIGHT_SET, heldOut: D.HELD_OUT_FIGHT_SET, pool: D.POOL_FIGHT_SET, audit: D.AUDIT4_FIGHT_SET, reserve: D.DOGFIGHT_BENCH_SET, safetyAudit: D.SAFETY_AUDIT4_FIGHT_SET });   // the fruit fly's audits are the FOURTH pair: the first was read by a smoke test and the third by the first real run (brain/dogfightTask.mjs)
/** The GPU network's: the same training, held-out, pool and reserve; an audit and a safety audit of its own (an audit is read by one champion). */
export const SETS_GPU = Object.freeze({ ...SETS, audit: D.AUDIT2_FIGHT_SET, safetyAudit: D.SAFETY_AUDIT2_FIGHT_SET });
/** `--smoke` points every slot at SMOKE_FIGHT_SET (eight fights nothing else uses), so running the command to see that it runs reads no audit. */
export const SETS_SMOKE = Object.freeze({ train: D.SMOKE_FIGHT_SET, heldOut: D.SMOKE_FIGHT_SET, pool: D.SMOKE_FIGHT_SET, audit: D.SMOKE_FIGHT_SET, reserve: D.SMOKE_FIGHT_SET, safetyAudit: D.SMOKE_FIGHT_SET });
export const setsOf = (opts) => (opts && opts.smoke ? SETS_SMOKE : brainOf(opts).id === "gpu" ? SETS_GPU : SETS);

/** Parse `--name value` / `--flag` argv in ONE pass, REFUSING an option it does not know (a typo must not silently train the default recipe); the brain's defaults (its seed, its file) go under what was given. `--one K` is the child's mode. */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, maxK: Number, workers: Number, one: Number, out: String, dump: String, brain: String, write: Boolean, quiet: Boolean, smoke: Boolean };
    const given = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2);
        if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const want = "brain" in given ? given.brain : "fly";
    if (!BRAINS[want]) throw new Error(`--brain must be one of ${Object.keys(BRAINS).join(", ")}, got ${JSON.stringify(want)}`);
    const b = BRAINS[want];
    if (given.smoke && given.write) throw new Error("--smoke and --write do not go together: a champion found on eight throwaway fights is never written");
    return { ...RECIPE, seed: b.seed, workers: 1, one: null, out: b.out, dump: null, write: false, quiet: false, smoke: false, ...given, brain: b.id };
}

// ---- the tails and the comparison -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const LOST = new Set(["crashed", "touchdown", "lost", "collided"]);
/** What a set of fights says about the tail: which fights A lost to the ground or a collision (kind:seed), how many went past the full-stall angle (`deep`) and past the stall angle (`brush`, reported), and how many it lost to gunfire (`shot`, the score's business). */
export function tails(res) {
    const rs = res.results;
    return { n: rs.length, lost: rs.filter((r) => LOST.has(r.statusA)).map((r) => `${r.kind}:${r.seed}`), shot: rs.filter((r) => r.statusA === "destroyed").length, brush: rs.filter((r) => r.maxAlpha > BRUSH_ANGLE).length, deep: rs.filter((r) => r.maxAlpha > DEEP_ANGLE).length };
}
/** The most a count may be when the autopilot's is `n`: n plus two standard errors of a count (sqrt n, rounded up). 0 allows 0. */
export const allowance = (n) => n + Math.ceil(2 * Math.sqrt(n));
/** Is the champion's tail no worse than the autopilot's? Pure. Returns the reasons it is not (an empty list when it is). Brushes are not a reason. */
export function tailReasons(champ, hand, where = "the pool") {
    const reasons = [], fresh = champ.lost.filter((id) => !hand.lost.includes(id));
    if (fresh.length) reasons.push(`on ${where} it loses ${fresh.length} fight${fresh.length > 1 ? "s" : ""} to the ground or a collision that the autopilot does not (${fresh.slice(0, 4).join(", ")}${fresh.length > 4 ? ", ..." : ""})`);
    if (champ.deep > allowance(hand.deep)) reasons.push(`on ${where} it goes past the full-stall angle in ${champ.deep} fights against the autopilot's ${hand.deep} (more than ${allowance(hand.deep)})`);
    return reasons;
}
/** The PAIRED comparison of two evaluations of the same fights: { n, diff (mean candidate - reference), se (of the paired differences), z, better, worse, same }. A fight is better or worse when the score moves by more than BETTER_EPS. */
export function paired(cand, ref) {
    const n = cand.results.length; if (ref.results.length !== n) throw new Error(`paired(): ${n} fights against ${ref.results.length}`);
    const d = cand.results.map((r, i) => r.score - ref.results[i].score), m = d.reduce((s, x) => s + x, 0) / n, sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0, se = sd / Math.sqrt(n);
    return { n, diff: m, se, z: se > 0 ? m / se : (m > 0 ? Infinity : m < 0 ? -Infinity : 0), better: d.filter((x) => x > BETTER_EPS).length, worse: d.filter((x) => x < -BETTER_EPS).length, same: d.filter((x) => Math.abs(x) <= BETTER_EPS).length };
}
export const describeEval = (r) => `${r.score.toFixed(4)} (${D.KINDS.filter((k) => k in r.byKind).map((k) => `${k} ${r.byKind[k].toFixed(3)}`).join(", ")}; ${r.kills} kills, ${r.deaths} lost)`;
const describeTails = (t) => `${t.lost.length} lost to the ground or a collision, ${t.shot} shot down, ${t.deep} past the full-stall angle, ${t.brush} brushing the stall, of ${t.n}`;

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ/hand: { heldOut, audit, reserve, safety } -- evaluate() results for the first three and tails() for `safety`; champ.vs is paired(champ.audit, hand.audit).
 */
export function qualifies(champ, hand) {
    const reasons = [], vs = champ.vs;
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(4)} does not beat the autopilot's ${hand.heldOut.score.toFixed(4)}`);
    if (!(vs.diff >= MIN_GAIN)) reasons.push(`the audit gain over the autopilot is ${vs.diff.toFixed(4)}, under the ${MIN_GAIN} floor`);
    if (!(vs.z >= Z_MIN)) reasons.push(`the audit gain is ${vs.z.toFixed(2)} standard errors of the paired difference (${vs.diff.toFixed(4)} +- ${vs.se.toFixed(4)}), under ${Z_MIN}`);
    if (!(vs.better > vs.worse)) reasons.push(`on the audit fights it does ${vs.better} better and ${vs.worse} worse than the autopilot: not more better than worse`);
    for (const k of D.KINDS) if (k in hand.audit.byKind && !((champ.audit.byKind[k] ?? -Infinity) >= hand.audit.byKind[k] - KIND_SLACK))
        reasons.push(`the ${k} audit fights score ${(champ.audit.byKind[k] ?? NaN).toFixed(4)}, more than ${KIND_SLACK} below the autopilot's ${hand.audit.byKind[k].toFixed(4)}`);
    if (!(champ.reserve.score >= hand.reserve.score - RESERVE_SLACK)) reasons.push(`the reserve fights score ${champ.reserve.score.toFixed(4)}, more than ${RESERVE_SLACK} below the autopilot's ${hand.reserve.score.toFixed(4)}`);
    const lostAudit = champ.audit.results.filter((r) => LOST.has(r.statusA)).length, lostHand = hand.audit.results.filter((r) => LOST.has(r.statusA)).length;
    if (lostAudit > lostHand) reasons.push(`${lostAudit} audit fights lost to the ground or a collision against the autopilot's ${lostHand}`);
    reasons.push(...tailReasons(champ.safety, hand.safety, "the safety audit"));
    return { ok: reasons.length === 0, reasons };
}

/** The score of a weight vector on a set of fights: a function of the weights alone. */
export const scorer = (policy, set) => (w) => D.evaluate(policy.pilotFor(w), set).score;

/** One independent search (run number k of the recipe), pruned back toward the autopilot. Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k, sets = setsOf(opts)) {
    const P = brainOf(opts).policy, seed = opts.seed + k, score = scorer(P, sets.train);
    const found = DT.trainWith(P, score, { seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK }), out = DT.pruneWith(P, score, found.weights);
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

/** The champion of `runs` (each from searchOne): eligibility on the pool, the best held-out among the eligible, then the audit, the reserve and the safety audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}, sets = setsOf(opts), evaluator = null) {
    // `evaluator(policy, weights, set)` is for the gate: it lets the eligibility, the champion and the read-once audit be driven on scripted numbers. The default is the fight itself.
    const P = brainOf(opts).policy, handW = P.handWeights(), ev = (w, set) => (evaluator ? evaluator(P, w, set) : D.evaluate(P.pilotFor(w), set));
    const hand = { train: ev(handW, sets.train), heldOut: ev(handW, sets.heldOut), pool: tails(ev(handW, sets.pool)) };
    log(`the autopilot (the hand weights): train ${describeEval(hand.train)} | held-out ${describeEval(hand.heldOut)} | pool: ${describeTails(hand.pool)}`);
    const scored = runs.map((r) => {
        const heldOut = ev(r.weights, sets.heldOut), pool = tails(ev(r.weights, sets.pool)), why = tailReasons(pool, hand.pool, "the pool");
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(4)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out ${describeEval(heldOut)}; pool: ${describeTails(pool)} -- ${why.length ? "NOT ELIGIBLE: " + why.join("; ") : "eligible"}`);
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
    const champion = { seed: c.seed, weights: c.weights, kept: c.kept, moved: c.moved, train, heldOut: c.heldOut, pool: c.pool, audit, reserve, safety, vs: paired(audit, hand.audit) };
    const verdict = qualifies(champion, hand);
    log(`the autopilot on what the champion is graded on: audit ${describeEval(hand.audit)} | reserve ${describeEval(hand.reserve)} | safety audit: ${describeTails(hand.safety)}`);
    log(`champion (seed ${c.seed}, the best held-out of the eligible): train ${describeEval(train)} | held-out ${describeEval(c.heldOut)} | audit ${describeEval(audit)} (${champion.vs.better} better / ${champion.vs.worse} worse / ${champion.vs.same} level than the autopilot; gain ${champion.vs.diff.toFixed(4)} +- ${champion.vs.se.toFixed(4)}) | reserve ${describeEval(reserve)} | safety audit: ${describeTails(safety)}`);
    log(verdict.ok ? "QUALIFIES: beats the autopilot on the held-out and audit fights by more than two paired standard errors, loses no kind of fight, does not fly the reserve worse, and is no more dangerous than the autopilot on the safety audit." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { hand, runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}, sets = setsOf(opts)) {
    const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k, sets));
    return finish(opts, runs, log, sets);
}

/** Every run's pruned weights and scores and the verdict, as one JSON-able object: what `--dump` writes so a result that did not qualify can still be looked at (it is NOT a shipped file, and nothing reads it back). */
export function dumpOf(result, opts) {
    const sc = (r) => ({ score: r.score, byKind: r.byKind, kills: r.kills, deaths: r.deaths });
    return { recipe: { brain: brainOf(opts).id, runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK }, champion: result.champion ? result.champion.seed : null, verdict: result.verdict,
        hand: { heldOut: sc(result.hand.heldOut), pool: result.hand.pool, audit: result.hand.audit ? sc(result.hand.audit) : null, reserve: result.hand.reserve ? sc(result.hand.reserve) : null, safety: result.hand.safety || null },
        runs: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: sc(r.heldOut), pool: r.pool, eligible: r.eligible, kept: r.kept, moved: r.moved, weights: Array.from(r.weights) })) };
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const B = brainOf(opts), sets = setsOf(opts), c = result.champion, h = result.hand, desc = PB.describePolicy(B.policyId, B.policy);
    const by = `TRAINED ON DOGFIGHTS (brain/dogfightTask.mjs: pursuit guidance, a hand trigger rule, the PD autopilot as the opponent): sparse-mutation (1+1)-ES from the hand weights (the autopilot's laws), seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations over the ${sets.train.length} train fights, ` +
        `then pruned: ${c.kept} of the ${B.policy.WEIGHT_COUNT} weights differ from the autopilot; champion picked on the ${sets.heldOut.length} held-out fights among the searches no more dangerous than the autopilot on the ${sets.pool.length}-fight pool; vs the autopilot: held-out ${describeEval(c.heldOut)} (the autopilot ${h.heldOut.score.toFixed(4)}), ` +
        `audit ${describeEval(c.audit)} over the ${sets.audit.length} audit fights (the autopilot ${h.audit.score.toFixed(4)}; ${c.vs.better} fights better, ${c.vs.worse} worse; gain ${c.vs.diff.toFixed(4)} +- ${c.vs.se.toFixed(4)}, ${c.vs.z.toFixed(2)} paired standard errors), reserve ${c.reserve.score.toFixed(4)} (the autopilot ${h.reserve.score.toFixed(4)}), ` +
        `safety audit of ${c.safety.n} fights: ${c.safety.lost.length} lost to the ground or a collision (the autopilot ${h.safety.lost.length}), ${c.safety.shot} shot down (the autopilot ${h.safety.shot}), ${c.safety.deep} past the full-stall angle (the autopilot ${h.safety.deep}), ${c.safety.brush} brushing the stall (the autopilot ${h.safety.brush}). ` +
        `GRADED ONLY AGAINST THE PD AUTOPILOT AS OPPONENT.`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: B.citation });
}

/**
 * THE COMMAND, as a function (tools/ship/trainPilotDogfight.mjs is the three lines that call it): parse, search (in this process, or each search in its own with `--workers`), grade, and write only what qualifies. Returns the exit
 * code: 0 done, 1 `--write` asked and the champion does not qualify (nothing written), 2 a bad argument. `io` is for the gate: { out, err, finish, run, writeFile, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, doRun = io.run || run, doFinish = io.finish || finish;
    let opts; try { opts = parseArgs(argv); } catch (e) { err("trainPilotDogfight: " + e.message); return 2; }
    const log = opts.quiet ? () => {} : out;
    if (opts.one != null) { const r = searchOne(opts, opts.one); out("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) })); return 0; }
    let result;
    if (opts.workers > 1 && opts.runs > 1) {
        // each search in its own process (a search touches nothing the others do: its own seed, the autopilot's weights read-only); finish() runs here once, on the weights they send back
        const passthrough = ["--brain", opts.brain, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--maxK", opts.maxK, "--runs", opts.runs, ...(opts.smoke ? ["--smoke"] : [])].map(String);
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
