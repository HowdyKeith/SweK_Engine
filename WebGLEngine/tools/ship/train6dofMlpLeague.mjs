// WebGLEngine/tools/ship/train6dofMlpLeague.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ROUND 2 OF THE GPU BRAIN'S 6-DOF ARC, as brain/SIXDOF_GPU_BRAIN_WIP.md's "Round 2" registers it: the GPU Brain's MLP (brain/pilot6dofMlp.mjs), STARTED FROM ITS CHAMPION (0ffd8554), trained by the fruit fly's
// LEAGUE recipe (tools/ship/train6dofLeague.mjs's RECIPE, with only the search seeds changed) against a league of the fruit fly's Default and the PD autopilot, every seed from both sides, each search pruned
// toward the start. The champion is picked on the held-out league score; a fresh audit is read once; the verdict is train6dofLeague.qualifies() word for word, with the Default as the pilot to beat.
// This is the library: the registration as data, one search, the finish, the run, and the weight file. The command is tools/ship/trainMlp6dofLeague.mjs (it prints no score); the gate is
// tools/ship/train6dofMlpLeague-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { RECIPE as LEAGUE_RECIPE, LEAD_FLOOR, REGRESSION_SLACK, PROFILES, qualifies } from "./train6dofLeague.mjs";
import { flyDefault, FLY_DEFAULT_HASH, USED_DUEL_SEEDS as USED_BEFORE_ROUND_1, AUDIT_SEEDS as ROUND1_AUDIT_SEEDS, H2_SEEDS as ROUND1_H2_SEEDS, POLICY_ID } from "./train6dofMlp.mjs";

export { qualifies, LEAD_FLOOR, REGRESSION_SLACK, FLY_DEFAULT_HASH, POLICY_ID };
const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const REGISTRATION = "brain/SIXDOF_GPU_BRAIN_WIP.md (Round 2)";
export const START_FILE = path.join(BRAIN, "pilot6dofMlpWeightsDefault.json");
export const START_HASH = "0ffd8554";
export const DEFAULT_RESULTS = path.join(BRAIN, "sixdofGpuLeagueResults.json");
export const DEFAULT_OUT = path.join(BRAIN, "pilot6dofMlpWeightsLeague.json");
/** The fruit fly's league recipe (4 searches x 800 iterations, sigma 0.3, 1-4 weights a child, 48 train seeds) with ONLY the search seeds changed (7100 against 4000). */
export const RECIPE = Object.freeze({ ...LEAGUE_RECIPE, seed: 7100 });
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The fly league's own train and held-out seeds; a fresh audit; the first round's (spent) audit as the check against the PD autopilot. */
export const TRAIN_SEEDS = P6.LEAGUE_TRAIN_SEEDS, HELD_SEEDS = P6.LEAGUE_HELD_OUT_SEEDS, AUDIT_SEEDS = range(6301, 40), AUTO_SEEDS = ROUND1_AUDIT_SEEDS;
/** Every duel-seed block a 6-DOF tool or gate had flown before this round: the first round's list, its audit and H2 sets, and the scratch seeds this chat's gates fly (99001-99702). */
export const USED_DUEL_SEEDS = Object.freeze([...USED_BEFORE_ROUND_1, ...ROUND1_AUDIT_SEEDS, ...ROUND1_H2_SEEDS, ...range(99001, 702)]);
const compact = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken });
const lead = (r) => r.wins - r.losses;

/** The command's first act: refuse a results file that exists. The reason, or null. A function so the gate holds it without ever starting a run. */
export const refuseExisting = (file, exists = fs.existsSync) => (exists(file) ? `${file} exists -- a round's results are never overwritten` : null);

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, train: Number, workers: Number, search: Number, results: String, quiet: Boolean };
    const o = { ...RECIPE, workers: 1, search: null, results: DEFAULT_RESULTS, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true;
        else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (o.train < 1 || o.train > TRAIN_SEEDS.length) throw new Error(`--train must be 1..${TRAIN_SEEDS.length}, got ${o.train}`);
    return o;
}

/** The start: the GPU Brain's champion through the page's importer, held to its hash. */
export function startWeights(file = START_FILE) {
    const imp = PB.importBrain(PB.describePolicy(POLICY_ID, M), JSON.parse(fs.readFileSync(file, "utf8")));
    if (!imp.ok) throw new Error("the start does not import: " + imp.reason);
    if (weightsHash(imp.weights) !== START_HASH) throw new Error(`the start is ${weightsHash(imp.weights)}, not the registered ${START_HASH}`);
    return imp.weights;
}
/** The league the MLP trains and is picked against: the PD autopilot and the fruit fly's Default. */
export const leagueOf = (fly) => ["autopilot", fly];

/** One search, as train6dofLeague.searchOne() makes it, on this network: from the start, against the league, then pruned TOWARD THE START. Serialisable. */
export function searchOne({ seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK, train = RECIPE.train, trainSeeds = null }, start = startWeights(), fly = flyDefault()) {
    const t0 = Date.now(), seeds = trainSeeds || TRAIN_SEEDS.slice(0, train), opponent = leagueOf(fly);
    const found = M.train({ seed, iters, sigma, maxK, start, trainSeeds: seeds, opponent });
    const out = M.prune(found.weights, { toward: start, trainSeeds: seeds, opponent });
    return { seed, weights: Array.from(out.weights), hash: weightsHash(out.weights), trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept, ms: Date.now() - t0 };
}

/** H2's reading: the champion's audit lead over the Default against the start's on the same games. */
export const h2Of = (champLead, startLead) => ({ champLead, startLead, gain: champLead - startLead, met: champLead - startLead >= LEAD_FLOOR });

/**
 * The finish, as train6dofLeague.finish() makes it: each search's held-out league score, the champion picked on it alone (ties to the earlier search), the audit read once, the verdict by qualifies() word for
 * word -- vsPrev is the champion against the Default, mirror the Default against itself, auto.prev the START against the PD autopilot -- then H2 and C-determinism.
 */
export function finish(searches, again, { start = startWeights(), fly = flyDefault(), heldSeeds = HELD_SEEDS, auditSeeds = AUDIT_SEEDS, autoSeeds = AUTO_SEEDS } = {}) {
    const league = leagueOf(fly), vsFly = (w, seeds) => compact(M.evaluate(w, seeds, { opponent: [fly] })), vsAuto = (w) => compact(M.evaluate(w, autoSeeds, { opponent: ["autopilot"] }));
    const scored = searches.map((s) => ({ ...s, held: compact(M.evaluate(Float32Array.from(s.weights), heldSeeds, { opponent: league })) }));
    const order = [...scored].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed), c = order[0], cw = Float32Array.from(c.weights);
    const champion = {
        seed: c.seed, hash: c.hash, kept: c.kept, moved: c.moved, held: c.held, differsFromStart: c.weights.filter((v, i) => Math.abs(v - start[i]) > 1e-6).length,
        audit: { vsPrev: vsFly(cw, auditSeeds), mirror: compact(P6.evaluate(fly, auditSeeds, { opponent: [fly] })), start: vsFly(start, auditSeeds) },
        heldOut: { vsPrev: vsFly(cw, heldSeeds) },
        auto: { champ: vsAuto(cw), prev: vsAuto(start) },
    };
    const verdict = qualifies(champion, PROFILES.league);
    const twin = again && searches.find((s) => s.seed === again.seed);
    return {
        searches: scored.map(({ weights, ...rest }) => rest), champion: { ...champion, weights: c.weights }, verdict,
        h2: h2Of(lead(champion.audit.vsPrev), lead(champion.audit.start)),
        cDeterminism: again ? { ok: !!twin && again.hash === twin.hash, seed: again.seed, first: twin ? twin.hash : null, again: again.hash } : null,
    };
}

/**
 * THE ROUND. C-files first (the start and the Default are the registered files, or nothing is searched), then the searches AND the determinism twin of the first in one call to `searchesFn` (the command runs
 * them in parallel processes), then the finish. `opts.heldSeeds` / `auditSeeds` / `autoSeeds` / `trainSeeds` replace the registered sets for a gate's miniature, which then says it did not use them.
 */
export async function run(opts, searchesFn) {
    const held = opts.heldSeeds || HELD_SEEDS, audit = opts.auditSeeds || AUDIT_SEEDS, auto = opts.autoSeeds || AUTO_SEEDS;
    const result = { registration: REGISTRATION, recipe: { runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK, train: opts.train }, at: new Date().toISOString(),
                     registeredSeeds: held === HELD_SEEDS && audit === AUDIT_SEEDS && auto === AUTO_SEEDS && !opts.trainSeeds, seeds: { held: [held[0], held.length], audit: [audit[0], audit.length], auto: [auto[0], auto.length] } };
    let start, fly;
    try { start = startWeights(opts.startFile); fly = flyDefault(opts.flyFile); } catch (e) { result.stopped = "C-files failed, so nothing was searched: " + e.message; return result; }
    result.cFiles = { ok: true, start: weightsHash(start), fly: weightsHash(fly) };
    const seeds = Array.from({ length: opts.runs }, (_, k) => opts.seed + k), all = await searchesFn([...seeds, seeds[0]]);
    return { ...result, ...finish(all.slice(0, opts.runs), all[opts.runs], { start, fly, heldSeeds: held, auditSeeds: audit, autoSeeds: auto }) };
}

/** The weight file, written from a committed results file whose champion qualified: the swek-brain-v1 blob, with the recipe and the numbers in `by`. */
export function blobOf(result) {
    const c = result.champion, r = result.recipe, d = P6.describeEval, desc = PB.describePolicy(POLICY_ID, M);
    const by = `the fruit fly's LEAGUE recipe on the GPU Brain's MLP, from its champion ${START_HASH}: sparse-mutation (1+1)-ES, seed ${c.seed} of ${r.runs} runs (${r.seed}..${r.seed + r.runs - 1}), sigma ${r.sigma}, 1-${r.maxK} weights per child, ` +
        `${r.iters} iterations over ${r.train} league train seeds against the PD autopilot and the fruit fly's Default (${FLY_DEFAULT_HASH}) from both sides, then pruned toward the start: ${c.kept} of the ${M.WEIGHT_COUNT} weights differ from it; ` +
        `champion picked on the held-out league score; audit [${AUDIT_SEEDS[0]}..${AUDIT_SEEDS[AUDIT_SEEDS.length - 1]}] against the Default ${d(c.audit.vsPrev)}, the Default against itself ${d(c.audit.mirror)}`;
    return PB.exportBrain(desc, Float32Array.from(c.weights), { score: Number(c.held.score.toFixed(3)), by, citation: "brain/SIXDOF_GPU_BRAIN_WIP.md, Round 2 (registered before it was built)" });
}
