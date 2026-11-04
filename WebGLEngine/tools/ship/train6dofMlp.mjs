// WebGLEngine/tools/ship/train6dofMlp.mjs -- UNNUMBERED (the library; the command is tools/ship/trainMlp6dof.mjs)
//
// TRAIN THE GPU BRAIN'S SPACE-DUEL PILOT BY THE FRUIT FLY'S OWN RECIPE AND SAY WHAT IT DID. Registered before this file existed: brain/SIXDOF_GPU_BRAIN_WIP.md. tools/ship/train6dofPilot.mjs made the fruit fly's Default
// pilot (brain/pilot6dofWeightsDefault.json): five sparse-mutation (1+1)-ES searches from the hand weights against the PD autopilot, each pruned, the champion picked on the held-out seeds, an audit read once, and a file
// written only if the champion beats its hand twin by train6dofPilot.qualifies(). This is that recipe with ONE thing changed -- the network is the GPU Brain's MLP (brain/pilot6dofMlp.mjs) -- and the audit seeds are fresh:
//
//   * the search seeds are 7000.. (the fruit fly's were 2000..), and the train and held-out seeds ARE the fruit fly's own (pilot6dofPolicy TRAIN_SEEDS, HELD_OUT_SEEDS), so the two brains learn from the same fights;
//   * the audit is AUDIT_SEEDS here (6101-6120), which no 6-DOF tool or gate had flown; qualifies() is train6dofPilot's own function, imported, so "qualifies" means for this brain what it meant for the fruit fly;
//   * C-TWIN first: the hand MLP must fly the fruit fly's hand pilot to the bit (the same fingerprint) on every train and held-out seed, or nothing is trained;
//   * C-DETERMINISM: the champion's search is run a second time and must give the same weights to the bit;
//   * H2, only when the champion qualifies: the champion against the fruit fly's shipped Default pilot on H2_SEEDS (6201-6240), from both sides, 80 games; LEAD is wins minus losses, read against LEAD_FLOOR.
//
// The results are written to a file that is never overwritten; registered numbers are not printed before it exists (the command writes it, then prints only where it is).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as M from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import { qualifies, RECIPE as FLY_RECIPE } from "./train6dofPilot.mjs";
import { LEAD_FLOOR } from "./train6dofLeague.mjs";

export { qualifies, LEAD_FLOOR };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "pilot6dofMlpWeightsDefault.json");
export const DEFAULT_RESULTS = path.join(BRAIN, "sixdofGpuBrainResults.json");
export const FLY_DEFAULT_FILE = path.join(BRAIN, "pilot6dofWeightsDefault.json");
export const FLY_DEFAULT_HASH = "215e26d9";
export const POLICY_ID = "pilot6dofMlp";
/** The fruit fly's recipe, with fresh search seeds and nothing else changed. */
export const RECIPE = Object.freeze({ ...FLY_RECIPE, seed: 7000 });
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
export const AUDIT_SEEDS = range(6101, 20);
export const H2_SEEDS = range(6201, 40);
/** Every duel-seed block a 6-DOF tool or gate had flown before this round (brain/SIXDOF_GPU_BRAIN_WIP.md): the gate holds the fresh sets clear of all of them. */
export const USED_DUEL_SEEDS = Object.freeze([
    ...P.TRAIN_SEEDS, ...P.HELD_OUT_SEEDS, ...P.AUDIT_SEEDS, ...range(101, 20), ...P.LEAGUE_TRAIN_SEEDS, ...P.LEAGUE_HELD_OUT_SEEDS, ...P.LEAGUE_AUDIT_SEEDS, ...P.BASELINE_SEEDS,
    ...P.CLOSE_TRAIN_SEEDS, ...P.CLOSE_HELD_OUT_SEEDS, ...P.CLOSE_AUDIT_SEEDS, ...range(900, 24), ...range(1000, 40), ...range(1100, 12),
]);
const cmp = P.describeEval;
const compact = (r) => ({ score: r.score, wins: r.wins, losses: r.losses, draws: r.draws, hits: r.hits, hitsTaken: r.hitsTaken });

/** The command's first act: refuse a results file that exists (a round's results are never overwritten). The reason, or null. A function so the gate can hold it without ever starting a run. */
export const refuseExisting = (file, exists = fs.existsSync) => (exists(file) ? `${file} exists -- a round's results are never overwritten` : null);

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, workers: Number, search: Number, out: String, results: String, write: Boolean, quiet: Boolean };
    const o = { ...RECIPE, workers: 1, search: null, out: DEFAULT_OUT, results: DEFAULT_RESULTS, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true;
        else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    return o;
}

/** C-TWIN: the hand MLP against the fruit fly's hand pilot, each flown against the PD autopilot, on the train and held-out seeds: { ok, same, of, first } (first: the first seed that differs, or null). */
export function twinCheck(seeds = [...P.TRAIN_SEEDS, ...P.HELD_OUT_SEEDS], weights = M.handWeights()) {
    const mlp = M.pilotFor(weights); let same = 0, first = null;
    for (const seed of seeds) {
        const a = P.duel(mlp, "autopilot", { seed }), b = P.duel("hand", "autopilot", { seed });
        if (a.fingerprint === b.fingerprint && a.score === b.score) same++; else if (first === null) first = seed;
    }
    return { ok: same === seeds.length, same, of: seeds.length, first };
}

/** One search, as train6dofPilot.run() makes it: train from the hand weights, prune toward them, the held-out result. Serialisable (weights as a plain array). */
export function searchOne({ seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK }) {
    const t0 = Date.now(), found = M.train({ seed, iters, sigma, maxK }), out = M.prune(found.weights), heldOut = M.evaluate(out.weights, P.HELD_OUT_SEEDS);
    return { seed, weights: Array.from(out.weights), hash: weightsHash(out.weights), train: out.trainScore, heldOut: compact(heldOut), improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept, ms: Date.now() - t0 };
}

/** H2's reading of LEAD (wins minus losses over the 80 games): the registered rule, as code. */
export const h2Reading = (lead) => (lead >= LEAD_FLOOR ? "GPU better" : lead <= -LEAD_FLOOR ? "fly better" : "no difference shown");

/** H2: the MLP weights `cw` against the fruit fly's shipped Default on `seeds`, from both sides; LEAD and its reading; the Default against its own mirror on the same games, beside it. */
export function headToHead(cw, seeds = H2_SEEDS, fly = flyDefault()) {
    const h2 = M.evaluate(cw, seeds, { opponent: [fly] }), mirror = P.evaluate(fly, seeds, { opponent: [fly] }), lead = h2.wins - h2.losses;
    return { games: h2.runs.length, vsFly: compact(h2), lead, reading: h2Reading(lead), flyMirror: compact(mirror) };
}

/** The fruit fly's shipped Default pilot, through the importer the page uses, held to its hash. */
export function flyDefault(file = FLY_DEFAULT_FILE) {
    const imp = PB.importBrain(PB.describePolicy("pilot6dofPolicy", P), JSON.parse(fs.readFileSync(file, "utf8")));
    if (!imp.ok) throw new Error("the fruit fly's Default does not import: " + imp.reason);
    if (weightsHash(imp.weights) !== FLY_DEFAULT_HASH) throw new Error(`the fruit fly's Default is ${weightsHash(imp.weights)}, not the registered ${FLY_DEFAULT_HASH}`);
    return imp.weights;
}

/**
 * The round, given the searches (`searchesFn(seeds)` returns them, in seed order -- sequentially here, in worker processes from the command). Everything the registration names, in its order. Async so the
 * command can hand in parallel searches; the result is a plain object the command writes to the results file.
 */
export async function run(opts, log = () => {}, searchesFn = async (seeds) => seeds.map((seed) => searchOne({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK }))) {
    // a smoke test or a gate hands in other audit and H2 seeds (`opts.auditSeeds`, `opts.h2Seeds`) so it never flies the registered ones, which are read once, by the registered run
    const audit = opts.auditSeeds || AUDIT_SEEDS, h2Seeds = opts.h2Seeds || H2_SEEDS;
    const result = { registration: "brain/SIXDOF_GPU_BRAIN_WIP.md", recipe: { runs: opts.runs, iters: opts.iters, seed: opts.seed, sigma: opts.sigma, maxK: opts.maxK }, at: new Date().toISOString(),
                     auditSeeds: [audit[0], audit[audit.length - 1], audit.length], h2Seeds: [h2Seeds[0], h2Seeds[h2Seeds.length - 1], h2Seeds.length], registeredSeeds: audit === AUDIT_SEEDS && h2Seeds === H2_SEEDS };
    result.cTwin = twinCheck();
    log(`C-twin: the hand MLP flies the fruit fly's hand pilot to the bit on ${result.cTwin.same} of ${result.cTwin.of} train and held-out seeds`);
    if (!result.cTwin.ok) { result.stopped = `C-twin failed at seed ${result.cTwin.first}: nothing trained`; return result; }
    const hand = M.handWeights();
    result.hand = { train: compact(M.evaluate(hand, P.TRAIN_SEEDS)), heldOut: compact(M.evaluate(hand, P.HELD_OUT_SEEDS)), audit: compact(M.evaluate(hand, audit)) };
    const seeds = Array.from({ length: opts.runs }, (_, i) => opts.seed + i), searches = await searchesFn(seeds);
    result.searches = searches.map(({ weights, ...rest }) => rest);
    // the champion is picked on HELD-OUT only, as train6dofPilot.run() picks it; the audit is read once, after
    const order = [...searches].sort((a, b) => b.heldOut.score - a.heldOut.score || (b.heldOut.wins - b.heldOut.losses) - (a.heldOut.wins - a.heldOut.losses));
    const champ = order[0], cw = Float32Array.from(champ.weights);
    result.champion = { seed: champ.seed, hash: champ.hash, kept: champ.kept, moved: champ.moved, train: compact(M.evaluate(cw, P.TRAIN_SEEDS)), heldOut: champ.heldOut, audit: compact(M.evaluate(cw, audit)) };
    result.verdict = qualifies(result.champion, result.hand);
    const again = (await searchesFn([champ.seed]))[0];
    result.cDeterminism = { ok: again.hash === champ.hash, first: champ.hash, again: again.hash };
    result.championVsAutopilotBothSides = compact(M.evaluate(cw, audit, { opponent: ["autopilot"] }));
    result.h2 = result.verdict.ok ? headToHead(cw, h2Seeds) : { notRead: "H1 not met: H2 is read only when the champion qualifies" };
    result.champion.weights = champ.weights;
    return result;
}

/** The file written when the champion qualifies: the swek-brain-v1 blob the fruit fly's pilots are, with the recipe and the scores in `by`. */
export function blobOf(result) {
    const c = result.champion, r = result.recipe, desc = PB.describePolicy(POLICY_ID, M);
    const by = `the fruit fly's Default recipe on the GPU Brain's MLP: sparse-mutation (1+1)-ES from the hand weights, seed ${c.seed} of ${r.runs} runs (${r.seed}..${r.seed + r.runs - 1}), sigma ${r.sigma}, 1-${r.maxK} weights per child, ` +
        `${r.iters} iterations over the train seeds [${P.TRAIN_SEEDS.join(",")}], then pruned: ${c.kept} of the ${M.WEIGHT_COUNT} weights differ from the hand pilot (the PD autopilot through the network); champion picked on held-out ` +
        `[${P.HELD_OUT_SEEDS.join(",")}]; vs the PD autopilot: held-out ${cmp(c.heldOut)}, audit [${AUDIT_SEEDS[0]}..${AUDIT_SEEDS[AUDIT_SEEDS.length - 1]}] ${cmp(c.audit)}; the hand pilot scores ${result.hand.audit.score.toFixed(2)} on the same audit`;
    return PB.exportBrain(desc, Float32Array.from(c.weights), { score: Number(c.heldOut.score.toFixed(3)), by, citation: "brain/SIXDOF_GPU_BRAIN_WIP.md (registered before it was built)" });
}
