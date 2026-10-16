// WebGLEngine/tools/ship/trainFlightPilot.mjs -- v4869 (the library; the command is tools/ship/trainPilotFlight.mjs)
//
// TRAIN THE FRUIT FLY TO FLY AND SAY WHAT IT DID. brain/pilotFlightPolicy.mjs holds the Giant Fiber Circuit wired as the autopilot (brain/autopilotFlight.mjs): 1,099 weights, 30 of them non-zero, and a flight that scores exactly
// what the autopilot's does on brain/flightTask.mjs's job (hold 300 m and a heading and 45 m/s for 40 s: from a clean start, from a start that is a mess, and in gusts). This is the recipe tools/ship/trainAircraftPilot.mjs holds
// for the aircraft pilot, on that job, with the two things v4869 learned the hard way added:
//
//   1. SEARCH. Several independent searches (the policy's train(): a sparse-mutation (1+1)-ES from the hand weights), each on the 40 TRAIN_WIDE scenarios and pruned back to the weights that carry the result.
//   2. ELIGIBILITY (new). A search is ELIGIBLE to be champion only if, on SAFETY_POOL_SET (500 starts nothing trains on), it ends no flight early that the autopilot completes and its deep stalls and its stall brushes are not more
//      than the autopilot's by more than two standard errors of a count (tails()). The average score cannot see a tail: the first champion of this tool won 35 of 36 audit scenarios and ended a flight early on another set.
//   3. CHAMPION. The eligible search that scores best on the 30 HELD_OUT_WIDE scenarios. If no search is eligible there is no champion, nothing is written, and the audit is NOT read (an audit is spent on a pilot that was going to be refused anyway).
//   4. VERDICT. qualifies(): the champion is graded ONCE on AUDIT3_SET (36 scenarios nothing has flown) and SAFETY_AUDIT_SET (500 more starts), and must beat the autopilot on the held-out and audit scores, fly more audit scenarios
//      better than worse, lose no KIND of scenario, end no flight early that the autopilot completes (anywhere), stall no more than the autopilot within the same two standard errors, and not fly BASELINE_SET (the reserve,
//      which exposed the first champion) worse.
//
//   * The clauses are fixed in this file BEFORE the sets that judge with them were read, and have not been loosened since. WHEN A RULE WAS WRONG (v4869's was: it counted stall brushes in the 54 flights of an audit and a
//     reserve, where the autopilot brushes in 18% of recovery starts and happened to do none of 54), IT WAS REPLACED, THE SETS THAT HAD SEEN THE OLD RULE WERE DECLARED SPENT (brain/flightTask.mjs, 5), AND THE NEW RULE WAS
//     GRADED ON SETS NOTHING HAD FLOWN.
//   * A pilot that learns the gusts and forgets the calm is not shipped: no kind (nominal, recovery, gusty) may score more than KIND_SLACK worse than the autopilot's on the audit.
//   * The searches are deterministic for a seed and independent of each other, so `--workers` runs them in separate processes and gets the same answer to the bit (the gate holds that).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "../../brain/pilotFlightPolicy.mjs";
import * as MF from "../../brain/pilotFlightMlp.mjs";
import * as T from "../../brain/flightTask.mjs";
import * as F from "../../physics/mechanics/flightModel6dof.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilotFlightWeightsDefault.json");
export const POLICY_ID = "pilotFlightPolicy";
export const RECIPE = Object.freeze({ runs: 4, iters: 1000, seed: 6000, sigma: 0.3, maxK: 4 });
/**
 * THE TWO BRAINS THIS TOOL TRAINS (v4870), by the same recipe, the same task and the same rules: "fly" is the fruit fly's Giant Fiber Circuit (brain/pilotFlightPolicy.mjs, 1,099 weights, v4869) and "gpu" is the GPU Brain's MLP
 * (brain/pilotFlightMlp.mjs, 18 -> 32 -> 32 -> 4, 1,796 weights): each starts from the autopilot's laws written through its own network, and each is graded on audits of its own (every audit is read once, by one champion).
 */
export const BRAINS = Object.freeze({
    fly: Object.freeze({ id: "fly", policy: PF, policyId: "pilotFlightPolicy", out: DEFAULT_OUT, seed: 6000, name: "the fruit fly's Giant Fiber Circuit", citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" }),
    gpu: Object.freeze({ id: "gpu", policy: MF, policyId: "pilotFlightMlp", out: path.resolve(HERE, "..", "..", "brain", "pilotFlightMlpWeightsDefault.json"), seed: 7000, name: "the GPU Brain's MLP", citation: "SweK GPU Brain: brain/mlp.js BatchedMLP, an 18-32-32-4 relu network started from the autopilot's laws" }),
});
export const brainOf = (opts) => { const b = BRAINS[(opts && opts.brain) || "fly"]; if (!b) throw new Error(`unknown brain ${JSON.stringify(opts.brain)} (known: ${Object.keys(BRAINS).join(", ")})`); return b; };
/** How far below the autopilot's score a KIND of audit scenario (nominal, recovery, gusty) may be, and how far below its score on the reserve the champion may be: a chosen floor, not a test statistic. */
export const KIND_SLACK = 0.02, RESERVE_SLACK = 0.01;
/** The angle of attack (radians) past which the wing has begun to stall, and past which it is fully stalled: the flight model's own numbers. */
export const BRUSH_ANGLE = F.STALL.angle, DEEP_ANGLE = F.STALL.angle + F.STALL.width;
/** The sets the verdict is made on: the searches train on `train`, the champion is picked on `heldOut` among the searches `pool` allows, and `audit`, `reserve` and `safetyAudit` are read once, for the champion. Injectable (finish takes them) so the gate can drive the logic on small slices. */
export const SETS = Object.freeze({ train: T.TRAIN_WIDE_SET, heldOut: T.HELD_OUT_WIDE_SET, pool: T.SAFETY_POOL_SET, audit: T.AUDIT3_SET, reserve: T.BASELINE_SET, safetyAudit: T.SAFETY_AUDIT_SET });
/** The GPU brain's: the same training, held-out, pool and reserve; an audit and a safety audit of its own. */
export const SETS_GPU = Object.freeze({ ...SETS, audit: T.AUDIT4_SET, safetyAudit: T.SAFETY_AUDIT2_SET });
export const setsOf = (opts) => (brainOf(opts).id === "gpu" ? SETS_GPU : SETS);
const cmp = T.describeEval;

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). `--one K` is the child's mode (see trainPilotFlight.mjs). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, maxK: Number, workers: Number, one: Number, out: String, dump: String, brain: String, write: Boolean, quiet: Boolean };
    const given = {};   // what the command line set, in ONE pass: the brain's own defaults (its seed, its file) go underneath it afterwards, so an explicit option beats them on whichever side of --brain it is written
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2);
        if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const want = "brain" in given ? given.brain : "fly";
    if (!BRAINS[want]) throw new Error(`--brain must be one of ${Object.keys(BRAINS).join(", ")}, got ${JSON.stringify(want)}`);
    const b = BRAINS[want];
    return { ...RECIPE, seed: b.seed, workers: 1, one: null, out: b.out, dump: null, write: false, quiet: false, ...given, brain: b.id };
}

// ---- the tails -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** What a set of flights says about the tail: which flights ended early (by kind:seed), and how many went past the stall angle (`brush`) and past the full-stall angle (`deep`). */
export function tails(res) {
    return { n: res.runs.length, crashed: res.runs.filter((r) => r.status !== "airborne").map((r) => `${r.kind}:${r.seed}`), brush: res.runs.filter((r) => r.maxAlpha > BRUSH_ANGLE).length, deep: res.runs.filter((r) => r.maxAlpha > DEEP_ANGLE).length };
}
/** The most a count may be when the autopilot's is `n`: n plus two standard errors of a count (sqrt n, rounded up), so a rate that is not demonstrably worse passes and one that is does not. 0 allows 0. */
export const allowance = (n) => n + Math.ceil(2 * Math.sqrt(n));
/** Is the champion's tail no worse than the autopilot's? Pure. Returns the reasons it is not (an empty list when it is). */
export function tailReasons(champ, hand, where = "the safety pool") {
    const reasons = [], fresh = champ.crashed.filter((id) => !hand.crashed.includes(id));
    if (fresh.length) reasons.push(`on ${where} it ends ${fresh.length} flight${fresh.length > 1 ? "s" : ""} early that the autopilot completes (${fresh.slice(0, 4).join(", ")}${fresh.length > 4 ? ", ..." : ""})`);
    if (champ.deep > allowance(hand.deep)) reasons.push(`on ${where} it goes past the full-stall angle in ${champ.deep} flights against the autopilot's ${hand.deep} (more than ${allowance(hand.deep)})`);
    if (champ.brush > allowance(hand.brush)) reasons.push(`on ${where} it brushes the stall in ${champ.brush} flights against the autopilot's ${hand.brush} (more than ${allowance(hand.brush)})`);
    return reasons;
}

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ/hand: { heldOut, audit, reserve, safety } -- evaluate() results (score, crashed, byKind) for the first three and tails() for `safety` (the SAFETY_AUDIT_SET); champ.vs is versus(champ.audit, hand.audit).
 */
export function qualifies(champ, hand) {
    const reasons = [];
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(4)} does not beat the autopilot's ${hand.heldOut.score.toFixed(4)}`);
    if (!(champ.audit.score > hand.audit.score)) reasons.push(`audit score ${champ.audit.score.toFixed(4)} does not beat the autopilot's ${hand.audit.score.toFixed(4)}`);
    if (!(champ.vs.better > champ.vs.worse)) reasons.push(`on the audit scenarios it flies ${champ.vs.better} better and ${champ.vs.worse} worse than the autopilot: not more better than worse`);
    if (champ.audit.crashed > hand.audit.crashed) reasons.push(`${champ.audit.crashed} audit flights ended early against the autopilot's ${hand.audit.crashed}`);
    for (const k of T.KINDS) if (k in hand.audit.byKind && !((champ.audit.byKind[k] ?? -Infinity) >= hand.audit.byKind[k] - KIND_SLACK))
        reasons.push(`the ${k} audit scenarios score ${(champ.audit.byKind[k] ?? NaN).toFixed(4)}, more than ${KIND_SLACK} below the autopilot's ${hand.audit.byKind[k].toFixed(4)}`);
    if (!(champ.reserve.score >= hand.reserve.score - RESERVE_SLACK)) reasons.push(`the reserve scenarios score ${champ.reserve.score.toFixed(4)}, more than ${RESERVE_SLACK} below the autopilot's ${hand.reserve.score.toFixed(4)}`);
    if (champ.reserve.crashed > hand.reserve.crashed) reasons.push(`${champ.reserve.crashed} reserve flights ended early against the autopilot's ${hand.reserve.crashed}`);
    reasons.push(...tailReasons(champ.safety, hand.safety, "the safety audit"));
    return { ok: reasons.length === 0, reasons };
}

/** One independent search (run number k of the recipe), pruned back toward the autopilot. Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k) {
    const P = brainOf(opts).policy, seed = opts.seed + k, found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK }), out = P.prune(found.weights);
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

const describeTails = (t) => `${t.crashed.length} ended early, ${t.deep} past the full-stall angle, ${t.brush} brushing the stall, of ${t.n}`;

/** The champion of `runs` (each from searchOne): eligibility on the safety pool, the best held-out among the eligible, then the audit, the reserve and the safety audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}, sets = setsOf(opts)) {
    const P = brainOf(opts).policy, handW = P.handWeights(), ev = (w, set) => P.evaluate(w, set);
    const hand = { train: ev(handW, sets.train), heldOut: ev(handW, sets.heldOut), pool: tails(ev(handW, sets.pool)) };
    log(`the autopilot (the hand weights): train ${cmp(hand.train)} | held-out ${cmp(hand.heldOut)} | safety pool: ${describeTails(hand.pool)}`);
    const scored = runs.map((r) => {
        const heldOut = ev(r.weights, sets.heldOut), pool = tails(ev(r.weights, sets.pool)), why = tailReasons(pool, hand.pool, "the safety pool");
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(4)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out ${cmp(heldOut)}; safety pool: ${describeTails(pool)} -- ${why.length ? "NOT ELIGIBLE: " + why.join("; ") : "eligible"}`);
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
    const champion = { seed: c.seed, weights: c.weights, kept: c.kept, moved: c.moved, train, heldOut: c.heldOut, pool: c.pool, audit, reserve, safety, vs: T.versus(audit, hand.audit) };
    const verdict = qualifies(champion, hand);
    log(`the autopilot on what the champion is graded on: audit ${cmp(hand.audit)} | reserve ${cmp(hand.reserve)} | safety audit: ${describeTails(hand.safety)}`);
    log(`champion (seed ${c.seed}, the best held-out of the eligible): train ${cmp(train)} | held-out ${cmp(c.heldOut)} | audit ${cmp(audit)} (${champion.vs.better} better / ${champion.vs.worse} worse / ${champion.vs.same} level than the autopilot) | reserve ${cmp(reserve)} | safety audit: ${describeTails(safety)}`);
    log(verdict.ok ? "QUALIFIES: beats the autopilot on the held-out and audit scenarios, loses no kind of scenario, does not fly the reserve worse, and is no more dangerous than the autopilot on 500 starts nothing had flown." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
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
    return { recipe: { brain: brainOf(opts).id, runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK }, champion: result.champion ? result.champion.seed : null, verdict: result.verdict, hand: { heldOut: sc(result.hand.heldOut), pool: result.hand.pool, audit: result.hand.audit ? sc(result.hand.audit) : null, reserve: result.hand.reserve ? sc(result.hand.reserve) : null, safety: result.hand.safety || null },
        runs: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: sc(r.heldOut), pool: r.pool, eligible: r.eligible, kept: r.kept, moved: r.moved, weights: Array.from(r.weights) })) };
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const B = brainOf(opts), sets = setsOf(opts), c = result.champion, h = result.hand, desc = PB.describePolicy(B.policyId, B.policy);
    const by = `sparse-mutation (1+1)-ES from the hand weights (the autopilot's laws), seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations over the ${sets.train.length} train scenarios, ` +
        `then pruned: ${c.kept} of the ${B.policy.WEIGHT_COUNT} weights differ from the autopilot; champion picked on the ${sets.heldOut.length} held-out scenarios among the searches no more dangerous than the autopilot on the ${sets.pool.length}-start safety pool; vs the autopilot: held-out ${cmp(c.heldOut)} (the autopilot ${h.heldOut.score.toFixed(4)}), ` +
        `audit ${cmp(c.audit)} over the ${sets.audit.length} audit scenarios (the autopilot ${h.audit.score.toFixed(4)}; ${c.vs.better} scenarios better, ${c.vs.worse} worse), reserve ${c.reserve.score.toFixed(4)} (the autopilot ${h.reserve.score.toFixed(4)}), ` +
        `safety audit of ${c.safety.n} starts: ${c.safety.crashed.length} ended early (the autopilot ${h.safety.crashed.length}), ${c.safety.deep} past the full-stall angle (the autopilot ${h.safety.deep}), ${c.safety.brush} brushing the stall (the autopilot ${h.safety.brush})`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: B.citation });
}
/**
 * THE COMMAND, as a function (tools/ship/trainPilotFlight.mjs is the three lines that call it): parse, search (in this process, or each search in its own with `--workers`), grade, and write only what qualifies. Returns the exit
 * code: 0 done, 1 `--write` asked and the champion does not qualify (nothing written), 2 a bad argument. `io` is for the gate: { out, err, finish, run, writeFile, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, doRun = io.run || run, doFinish = io.finish || finish;
    let opts; try { opts = parseArgs(argv); } catch (e) { err("trainPilotFlight: " + e.message); return 2; }
    const log = opts.quiet ? () => {} : out;
    if (opts.one != null) { const r = searchOne(opts, opts.one); out("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) })); return 0; }
    let result;
    if (opts.workers > 1 && opts.runs > 1) {
        // each search in its own process (a search touches nothing the others do: its own seed, the autopilot's weights read-only); finish() runs here once, on the weights they send back
        const passthrough = ["--brain", opts.brain, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--maxK", opts.maxK, "--runs", opts.runs].map(String);
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
