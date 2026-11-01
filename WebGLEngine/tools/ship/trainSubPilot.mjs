// WebGLEngine/tools/ship/trainSubPilot.mjs -- UNNUMBERED (the library; the command is tools/ship/trainPilotSub.mjs)
//
// TRAIN THE SUBMARINE'S PILOT ON A CIRCUIT, AND SAY WHAT IT DID: brain/pilotSubPolicy.mjs wires a recurrent core to any circuit (the fruit fly's Giant Fiber Circuit, `fly`), brain/pilotSubFish.mjs makes the Fish1 zebrafish core (`fish`)
// and a random circuit of its size (`control`), and every one of them starts as the PD autopilot's laws (brain/autopilotSub.mjs) written through the network. This is the recipe the drone and the helicopter trainers hold, on the
// submarine's job (brain/subTask.mjs: hold a depth, a heading and a speed for 60 s, from a clean start, from an upset, in a current) and with the verdict the submarine's own round 1 used (brain/SUBMARINE_WIP.md), WRITTEN BEFORE
// THE FRESH AUDITS WERE READ:
//   SEARCH     several independent (1+1)-ES searches (sparse mutation of 1..4 weights, sigma 0.3, 400 children) from the hand weights, each pruned back toward them; one process or one a search.
//   ELIGIBLE   a search is only eligible to be champion if, on the 500 dives of SAFETY_POOL_SET, it ends no dive early that the autopilot completes and no more dives early than the autopilot does.
//   CHAMPION   the best HELD-OUT score among the eligible searches. Then, ONCE and only for the champion, the audit (36 dives of seeds nothing has touched), the 500-dive safety audit and the reserve are flown.
//   QUALIFIES  on the audit AND the safety audit: no dive ended that the autopilot completes, no more early ends, a better mean, a worst-5% tail no worse; on each kind of dive no more than 0.02 below the autopilot;
//              the reserve no more than 0.01 below. A file is written only for a champion that qualifies.
// THE AUDITS ARE FRESH FOR THIS TOOL (seeds 7000..7099 / 7000..7299 / 7000..7099 and 7500..7511 per kind, tools/auditSubChampion.mjs auditSets(7000): the earlier champions spent 3000.. and 6000..), and the three circuits
// read the SAME ones, once each, so that they are graded on the same dives; nothing is chosen between circuits on them. Flown on the nominal hull without actuator limits: the condition the pilots are trained in.
//
// Pure apart from the files it reads and, with `--write`, the one it writes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PS from "../../brain/pilotSubPolicy.mjs";
import * as PF from "../../brain/pilotSubFish.mjs";
import * as T from "../../brain/subTask.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { auditSets } from "../auditSubChampion.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RECIPE = Object.freeze({ runs: 4, iters: 400, sigma: 0.3, maxK: 4 });
export const AUDIT_BASE = 7000;
/** How far below the autopilot's score a KIND of dive may be on the audits, and how far below its score on the reserve the champion may be: a chosen floor, not a test statistic. */
export const KIND_SLACK = 0.02, RESERVE_SLACK = 0.01;
/** The circuits this tool trains, by the same recipe on the same dives: `fly` the Giant Fiber Circuit (the stand-in the submarine pilot was first made with), `fish` the Fish1 core, `control` a random circuit of the fish's size. */
export const CIRCUITS = Object.freeze({
    fly: Object.freeze({ id: "fly", policy: PS.FLY, seed: 6000, out: null, name: "the fruit fly's Giant Fiber Circuit", circuit: "male-cns:v1.0 Giant Fiber Circuit (stand-in)" }),
    fish: Object.freeze({ id: "fish", policy: PF.FISH, seed: 6100, out: path.resolve(HERE, "..", "..", "brain", "pilotSubWeightsFishWip.json"), name: "the Fish1 zebrafish core", circuit: "fish" }),
    control: Object.freeze({ id: "control", policy: PF.CONTROL, seed: 6200, out: null, name: "a random circuit of the fish's size", circuit: "random control" }),
});
export const circuitOf = (opts) => { const c = CIRCUITS[(opts && opts.circuit) || "fly"]; if (!c) throw new Error(`unknown circuit ${JSON.stringify(opts.circuit)} (known: ${Object.keys(CIRCUITS).join(", ")})`); return c; };
const FRESH = auditSets(AUDIT_BASE);
/** The sets the verdict is made on: the searches train on `train`, the champion is picked on `heldOut` among the searches `pool` allows, and `audit`, `safetyAudit` and `reserve` are read once, for the champion. Injectable (finish() takes them). */
export const SETS = Object.freeze({ train: T.TRAIN_SET, heldOut: T.HELD_OUT_SET, pool: T.SAFETY_POOL_SET, audit: FRESH.audit, safetyAudit: FRESH.safety, reserve: T.BASELINE_SET });
const cmp = T.describeEval;

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). `--one K` is the child's mode (see trainPilotSub.mjs). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, maxK: Number, workers: Number, one: Number, slice: Number, out: String, dump: String, circuit: String, write: Boolean, quiet: Boolean };
    const given = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2);
        if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    const want = "circuit" in given ? given.circuit : "fly";
    if (!CIRCUITS[want]) throw new Error(`--circuit must be one of ${Object.keys(CIRCUITS).join(", ")}, got ${JSON.stringify(want)}`);
    const c = CIRCUITS[want];
    return { ...RECIPE, seed: c.seed, workers: 1, one: null, slice: 1, out: c.out, dump: null, write: false, quiet: false, ...given, circuit: c.id };
}

// ---- the dives ended early ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The ids (kind + seed) of the dives a set ended early (anything but 'submerged'). */
export const endedEarly = (res) => res.runs.filter((r) => r.status !== "submerged").map((r) => `${r.kind}:${r.seed}`);
export const tails = (res) => ({ n: res.runs.length, crashed: endedEarly(res) });
/** Is the champion's tail no worse than the autopilot's? Returns the reasons it is not: every dive it ends early that the autopilot completes, and more early ends than the autopilot has. */
export function tailReasons(champ, auto, where = "the safety pool") {
    const reasons = [], fresh = champ.crashed.filter((id) => !auto.crashed.includes(id));
    if (fresh.length) reasons.push(`on ${where} it ends ${fresh.length} dive${fresh.length > 1 ? "s" : ""} early that the autopilot completes (${fresh.slice(0, 4).join(", ")}${fresh.length > 4 ? ", ..." : ""})`);
    if (champ.crashed.length > auto.crashed.length) reasons.push(`on ${where} it ends ${champ.crashed.length} dives early against the autopilot's ${auto.crashed.length}`);
    return reasons;
}

/**
 * Does a champion qualify for a file? `champ` = { heldOut, audit, safetyAudit, reserve } (evaluate() results; `auditVs` and `safetyVs` are compareRuns() of the champion against the autopilot on the audit and the safety audit), `auto` = the autopilot's
 * on the same dives. Pure. Returns { ok, reasons }.
 */
export function qualifies(champ, auto) {
    const reasons = [];
    if (!(champ.heldOut.score > auto.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(4)} does not beat the autopilot's ${auto.heldOut.score.toFixed(4)}`);
    for (const [name, c, a] of [["audit", champ.auditVs, auto.audit], ["safety audit", champ.safetyVs, auto.safetyAudit]]) {
        if (c.newlyEnded > 0) reasons.push(`on the ${name} it ends ${c.newlyEnded} dive${c.newlyEnded > 1 ? "s" : ""} early that the autopilot completes`);
        if (c.early[0] > c.early[1]) reasons.push(`${c.early[0]} ${name} dives ended early against the autopilot's ${c.early[1]}`);
        if (!(c.mean[0] > c.mean[1])) reasons.push(`${name} score ${c.mean[0].toFixed(4)} does not beat the autopilot's ${c.mean[1].toFixed(4)}`);
        if (!(c.tail5[0] >= c.tail5[1])) reasons.push(`the worst 5% of the ${name} dives average ${c.tail5[0].toFixed(4)}, below the autopilot's ${c.tail5[1].toFixed(4)}`);
        const res = name === "audit" ? champ.audit : champ.safetyAudit;
        for (const k of T.KINDS) if (k in a.byKind && !((res.byKind[k] ?? -Infinity) >= a.byKind[k] - KIND_SLACK))
            reasons.push(`the ${k} ${name} dives score ${(res.byKind[k] ?? NaN).toFixed(4)}, more than ${KIND_SLACK} below the autopilot's ${a.byKind[k].toFixed(4)}`);
    }
    if (!(champ.reserve.score >= auto.reserve.score - RESERVE_SLACK)) reasons.push(`the reserve dives score ${champ.reserve.score.toFixed(4)}, more than ${RESERVE_SLACK} below the autopilot's ${auto.reserve.score.toFixed(4)}`);
    if (champ.reserve.crashed > auto.reserve.crashed) reasons.push(`${champ.reserve.crashed} reserve dives ended early against the autopilot's ${auto.reserve.crashed}`);
    return { ok: reasons.length === 0, reasons };
}

/** One independent search (run number k of the recipe), pruned back toward the hand weights. Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k) {
    const trainSet = opts.trainSet || (opts.slice > 1 ? T.TRAIN_SET.filter((_, i) => i % opts.slice === 0) : undefined);
    const P = circuitOf(opts).policy, seed = opts.seed + k, found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSet }), out = P.prune(found.weights, { trainSet });
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

const describeTails = (t) => `${t.crashed.length} ended early of ${t.n}`;

/** The champion of `runs` (each from searchOne; `opts.policy` is for the gate, which drives the logic with a stand-in): eligibility on the safety pool, the best held-out among the eligible, then the audit, the safety audit and the reserve read once, and the verdict. */
export function finish(opts, runs, log = () => {}, sets = SETS) {
    const P = opts.policy || circuitOf(opts).policy, handW = P.handWeights(), ev = (w, set) => P.evaluate(w, set);
    const auto = { train: ev(handW, sets.train), heldOut: ev(handW, sets.heldOut), pool: ev(handW, sets.pool) };
    auto.poolTails = tails(auto.pool);
    log(`the autopilot (the hand weights): train ${cmp(auto.train)} | held-out ${cmp(auto.heldOut)} | safety pool: ${describeTails(auto.poolTails)}`);
    const scored = runs.map((r) => {
        const heldOut = ev(r.weights, sets.heldOut), pool = ev(r.weights, sets.pool), why = tailReasons(tails(pool), auto.poolTails, "the safety pool");
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(4)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out ${cmp(heldOut)}; safety pool: ${describeTails(tails(pool))}${why.length ? " -- INELIGIBLE: " + why[0] : ""}`);
        return { ...r, heldOut, pool: tails(pool), eligible: why.length === 0, ineligible: why };
    });
    scored.sort((a, b) => b.heldOut.score - a.heldOut.score || a.k - b.k);
    const c = scored.find((r) => r.eligible);
    if (!c) {
        const verdict = { ok: false, reasons: ["no search is eligible: " + scored.map((r) => `seed ${r.seed}: ${r.ineligible[0]}`).join(" | ")] };
        log("NO CHAMPION. " + verdict.reasons[0] + " -- the audit was not read.");
        return { auto, runs: scored, champion: null, verdict };
    }
    Object.assign(auto, { audit: ev(handW, sets.audit), safetyAudit: ev(handW, sets.safetyAudit), reserve: ev(handW, sets.reserve) });
    const audit = ev(c.weights, sets.audit), safetyAudit = ev(c.weights, sets.safetyAudit), reserve = ev(c.weights, sets.reserve), train = ev(c.weights, sets.train);
    const champion = { seed: c.seed, weights: c.weights, kept: c.kept, moved: c.moved, train, heldOut: c.heldOut, pool: c.pool, audit, safetyAudit, reserve, auditVs: T.compareRuns(audit, auto.audit), safetyVs: T.compareRuns(safetyAudit, auto.safetyAudit) };
    const verdict = qualifies(champion, auto);
    log(`the autopilot on what the champion is graded on: audit ${cmp(auto.audit)} | safety audit ${cmp(auto.safetyAudit)} | reserve ${cmp(auto.reserve)}`);
    log(`champion (seed ${c.seed}, the best held-out of the eligible): train ${cmp(train)} | held-out ${cmp(c.heldOut)} | audit ${cmp(audit)} (${champion.auditVs.better} better / ${champion.auditVs.worse} worse; tail ${champion.auditVs.tail5[0].toFixed(3)} against ${champion.auditVs.tail5[1].toFixed(3)}) | safety audit ${cmp(safetyAudit)} (${champion.safetyVs.better} better / ${champion.safetyVs.worse} worse; tail ${champion.safetyVs.tail5[0].toFixed(3)} against ${champion.safetyVs.tail5[1].toFixed(3)}; ${champion.safetyVs.newlyEnded} ended that the autopilot completes) | reserve ${cmp(reserve)}`);
    log(verdict.ok ? "QUALIFIES: beats the autopilot on the held-out, audit and safety audit, ends no dive early that the autopilot completes, keeps its tail and every kind of dive, and does not dive the reserve worse." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { auto, runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}, sets = SETS) {
    const runs = []; for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k));
    return finish(opts, runs, log, sets);
}

/** Every run's pruned weights and scores and the verdict, as one JSON-able object: what `--dump` writes (it is NOT a shipped file, and nothing reads it back). */
export function dumpOf(result, opts) {
    const sc = (r) => ({ score: r.score, crashed: r.crashed, byKind: r.byKind });
    return { recipe: { circuit: circuitOf(opts).id, runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK, slice: opts.slice || 1 }, champion: result.champion ? result.champion.seed : null, verdict: result.verdict,
        auto: { heldOut: sc(result.auto.heldOut), pool: result.auto.poolTails, audit: result.auto.audit ? sc(result.auto.audit) : null, safetyAudit: result.auto.safetyAudit ? sc(result.auto.safetyAudit) : null, reserve: result.auto.reserve ? sc(result.auto.reserve) : null },
        champ: result.champion ? { seed: result.champion.seed, audit: sc(result.champion.audit), safetyAudit: sc(result.champion.safetyAudit), reserve: sc(result.champion.reserve), auditVs: result.champion.auditVs, safetyVs: result.champion.safetyVs } : null,
        runs: result.runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: sc(r.heldOut), pool: r.pool, eligible: r.eligible, kept: r.kept, moved: r.moved, weights: Array.from(r.weights) })) };
}

/** WHAT A READER OF A WRITTEN FILE MUST BE TOLD, in its `by`: the job, the world, and what the circuit is and is not. */
export const LIMITS = "KNOWN LIMITS, SAID PLAINLY: the circuit sets only WHICH recurrent weights may exist -- the hand weights are the PD autopilot's laws and the recurrent core starts at zero -- so a result says what a real connectome's wiring costs or buys over the PD laws in this role, not that an animal can pilot a submarine. The Fish1 core is the densest core of a package of neurons the paper analysed (mostly inputs to the dorsal motor nucleus of the vagus), real wiring and not a circuit anyone has shown steers a body; the Mauthner escape circuit is not in it. The submarine is the model's own (brain/subModel6dof.mjs, a 6000 kg crewless boat in sea water), the dives are depth-and-heading holds for 60 s on the nominal hull without actuator limits, and none of it is a measurement of a real vessel.";

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, marked with the circuit it is wired to (the aquarium's fish chip reads `circuit: "fish"`), with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const C = circuitOf(opts), c = result.champion, a = result.auto, P = C.policy;
    const desc = PB.describePolicy("pilotSub" + C.id[0].toUpperCase() + C.id.slice(1), { ...P, id: "pilotSub" + C.id[0].toUpperCase() + C.id.slice(1), WEIGHT_COUNT: P.WEIGHT_COUNT });
    const by = `sparse-mutation (1+1)-ES from the hand weights (the PD autopilot's laws), seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} children per run, on the ${SETS.train.length} training dives of brain/subTask.mjs, wired to ${C.name} (${P.HIDDEN} neurons, ${P.REC_EDGES} synapses); ` +
        `then pruned: ${c.kept} of the ${P.WEIGHT_COUNT} weights differ from the autopilot; champion picked on the ${SETS.heldOut.length} held-out dives among the searches that end no dive early on the ${SETS.pool.length} dives of the safety pool that the autopilot completes; ` +
        `audit ${cmp(c.audit)} over the ${SETS.audit.length} audit dives (the autopilot ${a.audit.score.toFixed(4)}; ${c.auditVs.better} dives better, ${c.auditVs.worse} worse; worst-5% tail ${c.auditVs.tail5[0].toFixed(3)} against ${c.auditVs.tail5[1].toFixed(3)}), safety audit ${c.safetyAudit.score.toFixed(4)} over ${SETS.safetyAudit.length} dives (the autopilot ${a.safetyAudit.score.toFixed(4)}; ${c.safetyVs.better} better, ${c.safetyVs.worse} worse; ${c.safetyVs.newlyEnded} ended that the autopilot completes), ` +
        `reserve ${c.reserve.score.toFixed(4)} (the autopilot ${a.reserve.score.toFixed(4)}). ` + LIMITS;
    return { ...PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: `${C.name} (${C.circuit}), wired as the PD submarine autopilot (brain/pilotSubPolicy.mjs)` }), circuit: C.circuit };
}

/**
 * THE COMMAND, as a function (tools/ship/trainPilotSub.mjs is the three lines that call it): parse, search (in this process, or each search in its own with `--workers`), grade, and write only what qualifies. Returns the exit
 * code: 0 done, 1 `--write` asked and the champion does not qualify (nothing written), 2 a bad argument. `io` is for the gate: { out, err, finish, run, writeFile, selfPath }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, doRun = io.run || run, doFinish = io.finish || finish;
    let opts; try { opts = parseArgs(argv); } catch (e) { err("trainPilotSub: " + e.message); return 2; }
    if (opts.write && opts.slice > 1) { err("trainPilotSub: --write with --slice: a recipe on a slice of the training dives is for trying the machinery, and its file would say it was the full one -- not written"); return 2; }
    if (opts.write && !opts.out) { err(`trainPilotSub: --write needs an --out file for the ${opts.circuit} circuit (only the fish has a default file)`); return 2; }
    const log = opts.quiet ? () => {} : out;
    if (opts.one != null) { const r = searchOne(opts, opts.one); out("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) })); return 0; }
    let result;
    if (opts.workers > 1 && opts.runs > 1) {
        const passthrough = ["--circuit", opts.circuit, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--maxK", opts.maxK, "--runs", opts.runs, "--slice", opts.slice].map(String);
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
