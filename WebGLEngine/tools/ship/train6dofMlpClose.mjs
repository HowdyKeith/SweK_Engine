// WebGLEngine/tools/ship/train6dofMlpClose.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ROUND 3 OF THE GPU BRAIN'S 6-DOF ARC, as brain/SIXDOF_GPU_BRAIN_WIP.md's "Round 3" registers it: the GPU Brain's MLP (brain/pilot6dofMlp.mjs), STARTED FROM ITS CHAMPION (0ffd8554), trained by the recipe that
// made the fruit fly's close-quarters pilot -- tools/ship/train6dofLeague.mjs's PROFILES.close: collisions on with the page's ram damage, every game in BOTH the standoff and the joust start, from both sides --
// against a league of the fruit fly's Default and the PD autopilot, each search pruned toward the start. Round 2's design with the profile changed and nothing else. The champion is picked on the held-out
// league score; a fresh audit is read once; the verdict is train6dofLeague.qualifies(champion, PROFILES.close) word for word, with the Default as the pilot to beat (so the champion's audit against the Default
// keeps its per-game runs: the rule reads each start from them).
// The library: the registration as data, one search, the finish, the run, and the weight file. The command is tools/ship/trainMlp6dofClose.mjs (it prints no score); the gate is tools/ship/train6dofMlpClose-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { PROFILES, LEAD_FLOOR, REGRESSION_SLACK, qualifies, duelOf } from "./train6dofLeague.mjs";
import { startWeights, leagueOf, refuseExisting, START_HASH, POLICY_ID, FLY_DEFAULT_HASH, USED_DUEL_SEEDS as USED_BEFORE_ROUND_2, AUDIT_SEEDS as ROUND2_AUDIT_SEEDS } from "./train6dofMlpLeague.mjs";
import { flyDefault, AUDIT_SEEDS as ROUND1_AUDIT_SEEDS } from "./train6dofMlp.mjs";

export { qualifies, LEAD_FLOOR, REGRESSION_SLACK, refuseExisting, startWeights, leagueOf, START_HASH, POLICY_ID, FLY_DEFAULT_HASH };
const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const REGISTRATION = "brain/SIXDOF_GPU_BRAIN_WIP.md (Round 3)";
export const PROFILE = PROFILES.close;
export const DOPTS = Object.freeze(duelOf(PROFILE));   // collisions on, ram penalty 0, both starts
export const DEFAULT_RESULTS = path.join(BRAIN, "sixdofGpuCloseResults.json");
export const DEFAULT_OUT = path.join(BRAIN, "pilot6dofMlpWeightsClose.json");
export const CLOSE_FILE = path.join(BRAIN, "pilot6dofWeightsClose.json"), CLOSE_HASH = "360580a7";
/** The close profile's recipe (4 searches x 500 iterations, sigma 0.3, 1-4 weights a child, 32 train seeds) with ONLY the search seeds changed (7200 against 5000). */
export const RECIPE = Object.freeze({ ...PROFILE.recipe, seed: 7200 });
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The close profile's own train and held-out seeds; a fresh audit; the first round's (spent) audit as the check against the PD autopilot. */
export const TRAIN_SEEDS = PROFILE.seeds.train, HELD_SEEDS = PROFILE.seeds.held, AUDIT_SEEDS = range(6401, 40), AUTO_SEEDS = ROUND1_AUDIT_SEEDS;
/** Every duel-seed block flown before this round: Round 2's list, its audit (6301-6340), and this chat's scratch seeds up to 100002. */
export const USED_DUEL_SEEDS = Object.freeze([...USED_BEFORE_ROUND_2, ...ROUND2_AUDIT_SEEDS, ...range(99703, 300)]);
const compact = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken, rams: r.rams, ramHp: r.ramHp });
const lead = (r) => r.wins - r.losses;
/** A result with its per-start tallies beside it (compact), for the report. */
const withStarts = (r) => ({ ...compact(r), byStart: Object.fromEntries(PROFILE.scenarios.map((sc) => [sc, compact(P6.subset(r, (x) => x.scenario === sc))])) });
/** The per-game runs the close rule reads, kept with the fields subset() tallies. */
const keepRuns = (r) => ({ ...compact(r), runs: r.runs.map((x) => ({ side: x.side, seed: x.seed, scenario: x.scenario, score: x.score, win: x.win, aDead: x.aDead, bDead: x.bDead, hits: x.hits, hitsTaken: x.hitsTaken, rams: x.rams, ramHp: x.ramHp })) });

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

/** The fruit fly's close-quarters pilot, through the page's importer, held to its hash (for the report: how far the champion is from the page's best). */
export function closePilot(file = CLOSE_FILE) {
    const imp = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P6), JSON.parse(fs.readFileSync(file, "utf8")));
    if (!imp.ok) throw new Error("the close-quarters pilot does not import: " + imp.reason);
    if (weightsHash(imp.weights) !== CLOSE_HASH) throw new Error(`the close-quarters pilot is ${weightsHash(imp.weights)}, not the registered ${CLOSE_HASH}`);
    return imp.weights;
}

/** One search, as train6dofLeague.searchOne() makes it under the close profile, on this network: from the start, against the league, both starts, collisions on, then pruned TOWARD THE START. Serialisable. */
export function searchOne({ seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK, train = RECIPE.train, trainSeeds = null }, start = startWeights(), fly = flyDefault()) {
    const t0 = Date.now(), seeds = trainSeeds || TRAIN_SEEDS.slice(0, train), opponent = leagueOf(fly);
    const found = M.train({ seed, iters, sigma, maxK, start, trainSeeds: seeds, opponent, ...DOPTS });
    const out = M.prune(found.weights, { toward: start, trainSeeds: seeds, opponent, ...DOPTS });
    return { seed, weights: Array.from(out.weights), hash: weightsHash(out.weights), trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept, ms: Date.now() - t0 };
}

/** H2's reading: the champion's audit lead over the Default against the start's on the same games, at the close profile's floor (LEAD_FLOOR per start). */
export const H2_FLOOR = LEAD_FLOOR * PROFILE.scenarios.length;
export const h2Of = (champLead, startLead) => ({ champLead, startLead, gain: champLead - startLead, met: champLead - startLead >= H2_FLOOR });

/**
 * The finish, as train6dofLeague.finish() makes it under the close profile: each search's held-out league score, the champion picked on it alone (ties to the earlier search), the audit read once, the verdict by
 * qualifies(champion, PROFILES.close) word for word -- vsPrev is the champion against the Default (with its runs: the rule reads each start), mirror the Default against itself, auto.prev the START against the PD
 * autopilot -- then H2, C-determinism, and the report against the fruit fly's close-quarters pilot.
 */
export function finish(searches, again, { start = startWeights(), fly = flyDefault(), close = closePilot(), heldSeeds = HELD_SEEDS, auditSeeds = AUDIT_SEEDS, autoSeeds = AUTO_SEEDS } = {}) {
    const league = leagueOf(fly), ev = (w, seeds, opponent) => M.evaluate(w, seeds, { opponent, ...DOPTS });
    const scored = searches.map((s) => ({ ...s, held: compact(ev(Float32Array.from(s.weights), heldSeeds, league)) }));
    const order = [...scored].sort((a, b) => b.held.score - a.held.score || a.seed - b.seed), c = order[0], cw = Float32Array.from(c.weights);
    const champion = {
        seed: c.seed, hash: c.hash, kept: c.kept, moved: c.moved, held: c.held, differsFromStart: c.weights.filter((v, i) => Math.abs(v - start[i]) > 1e-6).length,
        audit: { vsPrev: keepRuns(ev(cw, auditSeeds, [fly])), mirror: withStarts(P6.evaluate(fly, auditSeeds, { opponent: [fly], ...DOPTS })), start: withStarts(ev(start, auditSeeds, [fly])) },
        heldOut: { vsPrev: compact(ev(cw, heldSeeds, [fly])) },
        auto: { champ: compact(ev(cw, autoSeeds, ["autopilot"])), prev: compact(ev(start, autoSeeds, ["autopilot"])) },
    };
    const verdict = qualifies(champion, PROFILE);
    const twin = again && searches.find((s) => s.seed === again.seed);
    return {
        searches: scored.map(({ weights, ...rest }) => rest), champion: { ...champion, weights: c.weights }, verdict,
        h2: h2Of(lead(champion.audit.vsPrev), lead(champion.audit.start)),
        cDeterminism: again ? { ok: !!twin && again.hash === twin.hash, seed: again.seed, first: twin ? twin.hash : null, again: again.hash } : null,
        report: { vsPrevByStart: withStarts(champion.audit.vsPrev).byStart, vsClose: withStarts(ev(cw, auditSeeds, [close])) },
    };
}

/**
 * THE ROUND. C-files first (the start, the Default and the close-quarters pilot are the registered files, or nothing is searched), then the searches AND the determinism twin of the first in one call to
 * `searchesFn` (the command runs them in parallel processes), then the finish. `opts.heldSeeds` / `auditSeeds` / `autoSeeds` / `trainSeeds` replace the registered sets for a gate's miniature.
 */
export async function run(opts, searchesFn) {
    const held = opts.heldSeeds || HELD_SEEDS, audit = opts.auditSeeds || AUDIT_SEEDS, auto = opts.autoSeeds || AUTO_SEEDS;
    const result = { registration: REGISTRATION, profile: PROFILE.id, duel: { ...DOPTS, scenarios: [...DOPTS.scenarios] }, recipe: { runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK, train: opts.train },
                     at: new Date().toISOString(), registeredSeeds: held === HELD_SEEDS && audit === AUDIT_SEEDS && auto === AUTO_SEEDS && !opts.trainSeeds, seeds: { held: [held[0], held.length], audit: [audit[0], audit.length], auto: [auto[0], auto.length] } };
    let start, fly, close;
    try { start = startWeights(opts.startFile); fly = flyDefault(opts.flyFile); close = closePilot(opts.closeFile); } catch (e) { result.stopped = "C-files failed, so nothing was searched: " + e.message; return result; }
    result.cFiles = { ok: true, start: weightsHash(start), fly: weightsHash(fly), close: weightsHash(close) };
    const seeds = Array.from({ length: opts.runs }, (_, k) => opts.seed + k), all = await searchesFn([...seeds, seeds[0]]);
    return { ...result, ...finish(all.slice(0, opts.runs), all[opts.runs], { start, fly, close, heldSeeds: held, auditSeeds: audit, autoSeeds: auto }) };
}

/** The weight file, written from a committed results file whose champion qualified: the swek-brain-v1 blob, with the recipe and the numbers in `by`. */
export function blobOf(result) {
    const c = result.champion, r = result.recipe, d = P6.describeEval, desc = PB.describePolicy(POLICY_ID, M);
    const by = `the fruit fly's CLOSE-QUARTERS recipe on the GPU Brain's MLP, from its champion ${START_HASH}: sparse-mutation (1+1)-ES, seed ${c.seed} of ${r.runs} runs (${r.seed}..${r.seed + r.runs - 1}), sigma ${r.sigma}, 1-${r.maxK} weights per child, ` +
        `${r.iters} iterations over ${r.train} close-profile train seeds in both starts with collisions on, against the PD autopilot and the fruit fly's Default (${FLY_DEFAULT_HASH}) from both sides, then pruned toward the start: ${c.kept} of the ${M.WEIGHT_COUNT} weights differ from it; ` +
        `champion picked on the held-out league score; audit [${AUDIT_SEEDS[0]}..${AUDIT_SEEDS[AUDIT_SEEDS.length - 1]}] against the Default ${d(c.audit.vsPrev)}, the Default against itself ${d(c.audit.mirror)}`;
    return PB.exportBrain(desc, Float32Array.from(c.weights), { score: Number(c.held.score.toFixed(3)), by, citation: "brain/SIXDOF_GPU_BRAIN_WIP.md, Round 3 (registered before it was built)" });
}
