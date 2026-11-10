// WebGLEngine/tools/ship/train6dofMlpLuck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ROUND 4 OF THE GPU BRAIN'S 6-DOF ARC, "network or luck", as brain/SIXDOF_GPU_BRAIN_WIP.md's "Round 4" registers it. The first round's verdict compared ONE champion with ONE champion (the fruit fly's Default
// beat the GPU Brain's 70-0). This trains each brain TWENTY times by that same recipe -- tools/ship/train6dofPilot.mjs's RECIPE: 1,500 iterations of the sparse (1+1)-ES from the hand weights against the PD
// autopilot on train seeds 1-12, each search pruned toward the hand weights -- the fruit fly's circuit on search seeds 7300-7319, the GPU Brain's MLP on 7400-7419, picks NOTHING, and plays every pruned pilot
// against every other on fresh duel seeds 6501-6520 from both sides. A pilot's score is its wins minus losses; H1 is an exact two-sided rank-sum test of the fruit fly's twenty scores against the MLP's at p < 0.01.
// Reported beside it, testing nothing: each search, the cross-play (the 400 pairings of a fruit fly search with an MLP search), and the two shipped pilots (the fruit fly's Default 215e26d9 and the GPU Brain's
// champion 0ffd8554) against the field.
// The library: the registration as data, one search, the round robin, the test, the finish, the run, and the results file's format. The command is tools/ship/trainMlp6dofLuck.mjs (it prints no score); the gate is
// tools/ship/train6dofMlpLuck-selfcheck.mjs. Nothing is written but the results file, whatever H1 reads.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { RECIPE as FLY_RECIPE } from "./train6dofPilot.mjs";
import { twinCheck, flyDefault, refuseExisting, FLY_DEFAULT_HASH } from "./train6dofMlp.mjs";
import { startWeights as gpuChampion, START_HASH as GPU_CHAMPION_HASH } from "./train6dofMlpLeague.mjs";
import { USED_DUEL_SEEDS as USED_BEFORE_ROUND_3, AUDIT_SEEDS as ROUND3_AUDIT_SEEDS } from "./train6dofMlpClose.mjs";

export { twinCheck, flyDefault, gpuChampion, refuseExisting, FLY_DEFAULT_HASH, GPU_CHAMPION_HASH };
const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const REGISTRATION = "brain/SIXDOF_GPU_BRAIN_WIP.md (Round 4)";
export const DEFAULT_RESULTS = path.join(BRAIN, "sixdofGpuLuckResults.json");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
/** The first round's recipe (train6dofPilot.mjs's RECIPE: 1,500 iterations, sigma 0.3, 1-4 weights a child), twenty searches for each brain, on two fresh blocks of search seeds. */
export const RECIPE = Object.freeze({ runs: 20, iters: FLY_RECIPE.iters, sigma: FLY_RECIPE.sigma, maxK: FLY_RECIPE.maxK, flySeed: 7300, mlpSeed: 7400 });
/** The recipe's own train seeds (1-12) and the held-out seeds it reports each search on (21-28): the fruit fly's, as the first round used them. */
export const TRAIN_SEEDS = P6.TRAIN_SEEDS, HELD_SEEDS = P6.HELD_OUT_SEEDS;
/** The round robin's duel seeds: fresh, read once, by the registered run. */
export const RR_SEEDS = range(6501, 20);
/** Every duel-seed block flown before this round: Round 3's list (which holds this chat's scratch seeds through 100002) and its audit (6401-6440). */
export const USED_DUEL_SEEDS = Object.freeze([...USED_BEFORE_ROUND_3, ...ROUND3_AUDIT_SEEDS]);
/** The recipe's duel, spelled out: the standoff start, no collisions, no ram penalty (pilot6dofPolicy.evaluate()'s and train()'s defaults). */
export const DOPTS = Object.freeze({ collisions: false, ramPenalty: 0, scenarios: Object.freeze(["standoff"]) });
/** H1's level, and the first round's 70-0 (a lead of 70 over 80 games) scaled to a round-robin pairing's 40 games. */
export const ALPHA = 0.01, LOPSIDED = 35;
/** The two networks, by the name a search carries. */
export const NETS = Object.freeze({ fly: P6, mlp: M });
const netOf = (brain) => { const n = NETS[brain]; if (!n) throw new Error(`unknown brain ${JSON.stringify(brain)} (fly or mlp)`); return n; };
const compact = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken });

/** A brain's pruned weights as what differs from its hand weights, exactly ({ i: indices, v: values }), and back. The results file carries every pilot this way. */
export function deltaOf(brain, w) {
    const hand = netOf(brain).handWeights(), i = [], v = [];
    for (let k = 0; k < w.length; k++) if (w[k] !== hand[k]) { i.push(k); v.push(w[k]); }
    return { i, v };
}
export function expand(brain, d) { const w = netOf(brain).handWeights(); d.i.forEach((k, j) => { w[k] = d.v[j]; }); return w; }
/** A pilot function for either brain's weights (pilot6dofPolicy.duel() takes one). */
export const pilotOf = (brain, w) => netOf(brain).pilotFor(w);

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const known = { iters: Number, sigma: Number, workers: Number, search: Number, brain: String, results: String, quiet: Boolean };
    const o = { ...RECIPE, workers: 1, search: null, brain: null, results: DEFAULT_RESULTS, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true;
        else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (o.brain !== null && !(o.brain in NETS)) throw new Error(`--brain must be fly or mlp, got ${JSON.stringify(o.brain)}`);
    if ((o.search === null) !== (o.brain === null)) throw new Error("--search and --brain go together (one search of one brain)");
    return o;
}

/** One search, as train6dofPilot.run() makes one, on either network: from the hand weights against the PD autopilot, pruned toward the hand weights, then its held-out result. Serialisable (the weights as a delta). */
export function searchOne({ brain, seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK, trainSeeds = TRAIN_SEEDS, heldSeeds = HELD_SEEDS }) {
    const net = netOf(brain), t0 = Date.now();
    const found = net.train({ seed, iters, sigma, maxK, trainSeeds }), out = net.prune(found.weights, { trainSeeds }), held = net.evaluate(out.weights, heldSeeds);
    return { brain, seed, hash: weightsHash(out.weights), trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept, held: compact(held), weights: deltaOf(brain, out.weights), ms: Date.now() - t0 };
}

/**
 * THE ROUND ROBIN: every pair of `entrants` ({ brain, weights }) on `seeds`, from both sides (pilot6dofPolicy.evaluate() with the other as the league's one opponent), each pair once. `pairings` are
 * [a, b, wins, losses, draws] from a's side, a < b; a pilot's record sums its pairings (b's wins are a's losses), and its score is wins minus losses.
 */
export function roundRobin(entrants, seeds = RR_SEEDS) {
    const pilots = entrants.map((e) => pilotOf(e.brain, e.weights)), n = pilots.length, pairings = [], rec = Array.from({ length: n }, () => ({ wins: 0, losses: 0, draws: 0 }));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const r = P6.evaluate(pilots[a], seeds, { opponent: [pilots[b]], ...DOPTS });
        pairings.push([a, b, r.wins, r.losses, r.draws]);
        rec[a].wins += r.wins; rec[a].losses += r.losses; rec[a].draws += r.draws;
        rec[b].wins += r.losses; rec[b].losses += r.wins; rec[b].draws += r.draws;
    }
    return { pairings, records: rec.map((x) => ({ ...x, score: x.wins - x.losses })) };
}

/**
 * How many of `brain`'s entrants a shipped pilot scores above, on COMMON opponents: set against entrant k, it plays the OTHER entrants, as k did, so its lead over them (its total less its lead over k) is set
 * against k's score. Its whole total would also count its games against k itself, which k never played. Strictly above.
 */
export const placesAbove = (lead, records, brains, brain) => { const total = lead.reduce((a, b) => a + b, 0); return brains.filter((b, k) => b === brain && total - lead[k] > records[k].score).length; };

/** A shipped pilot against the field: its lead over each entrant (wins minus losses over their games, from both sides), its record, and how many of each brain's searches it places above (placesAbove()). */
export function againstField(ref, entrants, records, seeds = RR_SEEDS) {
    const me = pilotOf(ref.brain, ref.weights), each = entrants.map((e) => compact(P6.evaluate(me, seeds, { opponent: [pilotOf(e.brain, e.weights)], ...DOPTS })));
    const lead = each.map((r) => r.wins - r.losses), brains = entrants.map((e) => e.brain);
    return { wins: each.reduce((a, r) => a + r.wins, 0), losses: each.reduce((a, r) => a + r.losses, 0), draws: each.reduce((a, r) => a + r.draws, 0), score: lead.reduce((a, b) => a + b, 0), lead,
             above: { fly: placesAbove(lead, records, brains, "fly"), mlp: placesAbove(lead, records, brains, "mlp") } };
}

/** Mid-ranks of `xs` (1-based, ties averaged), in the order given. */
export function midRanks(xs) {
    const order = xs.map((x, k) => [x, k]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length);
    for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++; for (let t = i; t <= j; t++) r[order[t][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
}

/**
 * H1'S TEST: the exact two-sided rank-sum (Wilcoxon-Mann-Whitney) test of `x` against `y`. The pooled values are mid-ranked; under the null every choice of |x| of them as x's is equally likely, and the number of
 * choices giving each rank sum is counted exactly by dynamic programming over the doubled (integer) mid-ranks. p is the share whose rank sum is at least as far from its expectation as x's. Counts reach
 * C(40, 20) = 137,846,528,820, exact in a double.
 */
export function rankSumTest(x, y) {
    const r2 = midRanks([...x, ...y]).map((r) => Math.round(2 * r)), m = x.length, n = r2.length, total = r2.reduce((a, b) => a + b, 0);
    const ways = Array.from({ length: m + 1 }, () => new Float64Array(total + 1)); ways[0][0] = 1;
    for (const v of r2) for (let k = m; k >= 1; k--) { const to = ways[k], from = ways[k - 1]; for (let s = total; s >= v; s--) to[s] += from[s - v]; }
    const obs = r2.slice(0, m).reduce((a, b) => a + b, 0), mean = (m * total) / n, far = Math.abs(obs - mean);
    let tail = 0, count = 0;
    for (let s = 0; s <= total; s++) { const w = ways[m][s]; if (!w) continue; count += w; if (Math.abs(s - mean) >= far - 1e-9) tail += w; }
    return { n1: m, n2: n - m, rankSum: obs / 2, expected: mean / 2, u: obs / 2 - (m * (m + 1)) / 2, count, p: tail / count };
}
/** H1's reading of the test (x the fruit fly's scores, y the GPU Brain's): the registered rule, as code. */
export const readingOf = (t) => (t.p < ALPHA ? (t.rankSum > t.expected ? "the fruit fly's network" : "the GPU Brain's network") : "not shown");

/** The cross-play: the pairings of a fruit fly search with an MLP search, each read from the fruit fly's side. */
export function crossPlay(pairings, brains) {
    const out = { pairings: 0, flyLeads: 0, mlpLeads: 0, level: 0, flyLopsided: 0, mlpLopsided: 0, flyWins: 0, mlpWins: 0, draws: 0 };
    for (const [a, b, w, l, d] of pairings) {
        if (brains[a] === brains[b]) continue;
        const flyW = brains[a] === "fly" ? w : l, mlpW = brains[a] === "fly" ? l : w, lead = flyW - mlpW;
        out.pairings++; out.flyWins += flyW; out.mlpWins += mlpW; out.draws += d;
        if (lead > 0) out.flyLeads++; else if (lead < 0) out.mlpLeads++; else out.level++;
        if (lead >= LOPSIDED) out.flyLopsided++; if (-lead >= LOPSIDED) out.mlpLopsided++;
    }
    return out;
}

/**
 * The finish: the 40 pruned pilots in a round robin, H1's test on their scores (the fruit fly's twenty first), the cross-play, the two shipped pilots against the field and each other, and C-determinism from
 * the two twins. Nothing is picked and nothing is written.
 */
export function finish(searches, twins, { fly = flyDefault(), gpu = gpuChampion(), rrSeeds = RR_SEEDS } = {}) {
    const field = searches.map((s) => ({ brain: s.brain, weights: expand(s.brain, s.weights) })), brains = searches.map((s) => s.brain);
    const rr = roundRobin(field, rrSeeds), scores = (b) => rr.records.filter((_, k) => brains[k] === b).map((r) => r.score);
    const test = rankSumTest(scores("fly"), scores("mlp"));
    const det = twins.map((t) => { const first = searches.find((s) => s.brain === t.brain && s.seed === t.seed); return { brain: t.brain, seed: t.seed, ok: !!first && first.hash === t.hash, first: first ? first.hash : null, again: t.hash }; });
    return {
        searches: searches.map((s, k) => ({ ...s, rr: rr.records[k] })), pairings: rr.pairings, test, reading: readingOf(test), cross: crossPlay(rr.pairings, brains),
        shipped: { fly: againstField({ brain: "fly", weights: fly }, field, rr.records, rrSeeds), gpu: againstField({ brain: "mlp", weights: gpu }, field, rr.records, rrSeeds),
                   flyVsGpu: compact(P6.evaluate(pilotOf("fly", fly), rrSeeds, { opponent: [pilotOf("mlp", gpu)], ...DOPTS })) },
        cDeterminism: { ok: det.length === 2 && det.every((x) => x.ok), twins: det },
    };
}

/**
 * THE ROUND. C-twin first (the hand MLP must fly the fruit fly's hand pilot to the bit), then C-files (the two shipped pilots are the registered files), or nothing is searched; then the twenty searches of each
 * brain AND the determinism twin of each brain's first in ONE call to `searchesFn(jobs)` (the command runs them in parallel processes), which must hand them back in the order asked; then the finish.
 * Each job carries the recipe (iterations, sigma, weights a child) with its brain and seed: a first draft handed over only the brain and seed, and the gate's in-process searcher ran the defaults.
 * `opts.trainSeeds`, `opts.heldSeeds`, `opts.rrSeeds` and `opts.twinWeights` replace the registered ones for a gate's miniature.
 */
export async function run(opts, searchesFn) {
    const rr = opts.rrSeeds || RR_SEEDS;
    const result = { registration: REGISTRATION, recipe: { runs: opts.runs, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, flySeed: opts.flySeed, mlpSeed: opts.mlpSeed }, duel: { ...DOPTS, scenarios: [...DOPTS.scenarios] },
                     at: new Date().toISOString(), registeredSeeds: rr === RR_SEEDS && !opts.trainSeeds && !opts.heldSeeds, seeds: { rr: [rr[0], rr.length] } };
    result.cTwin = twinCheck(undefined, opts.twinWeights || M.handWeights());
    if (!result.cTwin.ok) { result.stopped = `C-twin failed at seed ${result.cTwin.first}, so nothing was searched`; return result; }
    let fly, gpu;
    try { fly = flyDefault(opts.flyFile); gpu = gpuChampion(opts.gpuFile); } catch (e) { result.stopped = "C-files failed, so nothing was searched: " + e.message; return result; }
    result.cFiles = { ok: true, fly: weightsHash(fly), gpu: weightsHash(gpu) };
    const of = (brain, first) => Array.from({ length: opts.runs }, (_, k) => ({ brain, seed: first + k }));
    const jobs = [...of("fly", opts.flySeed), ...of("mlp", opts.mlpSeed), { brain: "fly", seed: opts.flySeed }, { brain: "mlp", seed: opts.mlpSeed }];
    // each job carries the recipe as well as its brain and seed, so whatever runs it -- a worker process or a gate's in-process searcher -- runs the round's recipe and not a default
    const all = await searchesFn(jobs.map((j) => ({ ...j, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, trainSeeds: opts.trainSeeds, heldSeeds: opts.heldSeeds })));
    const wrong = jobs.findIndex((j, k) => !all[k] || all[k].brain !== j.brain || all[k].seed !== j.seed);
    if (wrong >= 0 || all.length !== jobs.length) throw new Error(`the searches came back out of order: job ${wrong} asked for ${JSON.stringify(jobs[wrong])}`);
    return { ...result, ...finish(all.slice(0, 2 * opts.runs), all.slice(2 * opts.runs), { fly, gpu, rrSeeds: rr }) };
}

/**
 * The results file's text: JSON with every array of numbers on one line (the pairings and the weight deltas would otherwise run to tens of thousands of lines). Each such array is swapped for a numbered
 * placeholder string while the rest is indented, then put back compact -- by structure, not by a pattern over the text, so no string's contents can be touched. JSON.parse reads it as it reads any JSON.
 */
export function serialize(result) {
    const inline = [], text = JSON.stringify(result, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === "number") ? `\u0000${inline.push(JSON.stringify(v)) - 1}\u0000` : v), 1);
    return text.replace(/"\\u0000(\d+)\\u0000"/g, (_, i) => inline[Number(i)]) + "\n";
}
