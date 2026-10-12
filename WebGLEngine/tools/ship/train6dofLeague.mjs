// WebGLEngine/tools/ship/train6dofLeague.mjs -- v4847 (the library; the command is tools/ship/trainLeague6dof.mjs)
//
// TRAIN THE SPACE-BATTLE PILOT AGAINST ITSELF AND SAY WHAT IT DID. tools/ship/train6dofPilot.mjs made the pilot the page ships (brain/pilot6dofWeightsDefault.json) by training against the PD autopilot, and that pilot
// beats the autopilot 39-0 over both sides of the audit seeds; against a copy of itself it wins 8, loses 2 and draws 10 of 20 from side A, which is a coin the first side holds. This is the second generation: the same
// sparse-mutation (1+1)-ES, but STARTED FROM THE SHIPPED PILOT and scored against a LEAGUE of two opponents -- the PD autopilot and the shipped pilot itself -- each on every seed from BOTH sides (brain/pilot6dofPolicy.mjs's
// evaluateLeague: the duel favours the side that acts first, so a pilot judged or trained from one side is judged and trained partly on the side).
//
//   * the search trains on 48 seeds (the first probe, on twelve, improved its train score and made its held-out result worse: it had learned the twelve);
//   * the champion of several searches is picked on 24 HELD-OUT seeds, on the league score;
//   * 40 AUDIT seeds that nothing has ever read grade the champion once, against the shipped pilot, from both sides;
//   * and each search is PRUNED TOWARD THE SHIPPED PILOT, not toward the PD autopilot: every weight that differs from it is put back unless the score needs it, so what is shipped is the shipped pilot's small, named delta.
//
// A file is written only if the champion (1) leads the shipped pilot by LEAD_FLOOR games over the 80 audit games and scores above the shipped pilot's own mirror score, (2) leads it on the held-out seeds, and
// (3) has not regressed against the PD autopilot (no more losses than the shipped pilot has on the first audit, and a score no more than REGRESSION_SLACK below its). If none does, nothing is written and the output says
// so: "no league pilot beat the shipped one" is a result.
//
//   node tools/ship/trainLeague6dof.mjs                          # 4 runs x 800 iterations, report only
//   node tools/ship/trainLeague6dof.mjs --workers 4              # the four searches in four processes: the same answer to the bit, about a quarter of the time
//   node tools/ship/trainLeague6dof.mjs --write [--out <file>]   # write brain/pilot6dofWeightsLeague.json when the champion qualifies
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilot6dofWeightsLeague.json");
export const PREVIOUS_FILE = path.resolve(HERE, "..", "..", "brain", "pilot6dofWeightsDefault.json");
export const POLICY_ID = "pilot6dofPolicy";
export const RECIPE = Object.freeze({ runs: 4, iters: 800, seed: 4000, sigma: 0.3, maxK: 4, train: 48 });
/** The champion must lead the shipped pilot by at least this many games (wins minus losses) of the 80 audit games (40 seeds, both sides): a chosen floor so a coin-flip lead cannot qualify, not a test statistic. */
export const LEAD_FLOOR = 8;
/** How far below the shipped pilot's score against the PD autopilot (first audit, both sides) the champion may be. */
export const REGRESSION_SLACK = 0.5;
const cmp = P.describeEval;

/** The shipped pilot's weights, through the importer the page uses. */
export function previousWeights(file = PREVIOUS_FILE) {
    const imp = PB.importBrain(PB.describePolicy(POLICY_ID, P), JSON.parse(fs.readFileSync(file, "utf8")));
    if (!imp.ok) throw new Error("the shipped pilot does not import: " + imp.reason);
    return imp.weights;
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, train: Number, workers: Number, one: Number, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, workers: 1, one: null, out: DEFAULT_OUT, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (o.train < 1 || o.train > P.LEAGUE_TRAIN_SEEDS.length) throw new Error(`--train must be 1..${P.LEAGUE_TRAIN_SEEDS.length}, got ${o.train}`);
    return o;
}

const lead = (r) => r.wins - r.losses;

/**
 * Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers.
 * champ: { audit: { vsPrev, mirror }, heldOut: { vsPrev }, auto: { champ, prev } } -- each an evaluate() result (score, wins, losses).
 */
export function qualifies(champ) {
    const reasons = [], a = champ.audit;
    if (!(lead(a.vsPrev) >= LEAD_FLOOR)) reasons.push(`audit: leads the shipped pilot by ${lead(a.vsPrev)} games (${a.vsPrev.wins} won, ${a.vsPrev.losses} lost), under the floor of ${LEAD_FLOOR}`);
    if (!(a.vsPrev.score > a.mirror.score)) reasons.push(`audit score ${a.vsPrev.score.toFixed(2)} against the shipped pilot does not beat the shipped pilot's own ${a.mirror.score.toFixed(2)} against itself`);
    if (!(lead(champ.heldOut.vsPrev) > 0)) reasons.push(`held-out: ${champ.heldOut.vsPrev.wins} won and ${champ.heldOut.vsPrev.losses} lost against the shipped pilot is not a lead`);
    if (!(champ.auto.champ.losses <= champ.auto.prev.losses)) reasons.push(`against the PD autopilot it loses ${champ.auto.champ.losses} games where the shipped pilot loses ${champ.auto.prev.losses}`);
    if (!(champ.auto.champ.score >= champ.auto.prev.score - REGRESSION_SLACK)) reasons.push(`against the PD autopilot it scores ${champ.auto.champ.score.toFixed(2)}, more than ${REGRESSION_SLACK} under the shipped pilot's ${champ.auto.prev.score.toFixed(2)}`);
    return { ok: reasons.length === 0, reasons };
}

const leagueOf = (prev) => ["autopilot", prev];
const trainSeedsOf = (opts) => P.LEAGUE_TRAIN_SEEDS.slice(0, opts.train);

/** One independent search (run number k of the recipe). Deterministic for (opts, k). Returns { k, seed, weights, trainScore, improved, neutral, moved, kept }. */
export function searchOne(opts, k, prev = previousWeights()) {
    const seed = opts.seed + k, trainSeeds = trainSeedsOf(opts), opponent = leagueOf(prev);
    const found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, start: prev, trainSeeds, opponent });
    // a child that scores EXACTLY what its parent did replaces it, so most moved weights are drift: put back every one that carries nothing -- TOWARD THE SHIPPED PILOT, so what is left is its delta
    const out = P.prune(found.weights, { toward: prev, trainSeeds, opponent });
    return { k, seed, weights: out.weights, trainScore: out.trainScore, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept };
}

/** The champion of `runs` (each from searchOne), the audit read once, and the verdict. */
export function finish(opts, runs, log = () => {}, prev = previousWeights()) {
    const opponent = leagueOf(prev), hand = P.handWeights();
    const base = { audit: P.evaluate(prev, P.LEAGUE_AUDIT_SEEDS, { opponent: [prev] }), auto: P.evaluate(prev, P.AUDIT_SEEDS, { opponent: ["autopilot"] }), held: P.evaluate(prev, P.LEAGUE_HELD_OUT_SEEDS, { opponent }) };
    log(`shipped pilot (the one being improved on): vs itself on the audit seeds ${cmp(base.audit)} | vs the PD autopilot (first audit) ${cmp(base.auto)} | league score on the held-out seeds ${base.held.score.toFixed(2)}`);
    const scored = runs.map((r) => {
        const held = P.evaluate(r.weights, P.LEAGUE_HELD_OUT_SEEDS, { opponent });
        log(`  run ${r.k + 1}/${opts.runs} seed ${r.seed}: train ${r.trainScore.toFixed(2)}, ${r.improved} improvements + ${r.neutral} neutral moves; pruned ${r.moved} moved weights to ${r.kept}; held-out league ${held.score.toFixed(2)}`);
        return { ...r, held };
    });
    // the champion is picked on the HELD-OUT league score only; the audit is read once, after
    scored.sort((a, b) => b.held.score - a.held.score || a.k - b.k);
    const c = scored[0], w = c.weights;
    const champion = {
        seed: c.seed, weights: w, kept: c.kept, moved: c.moved, held: c.held,
        differsFromHand: Array.from(w).filter((v, i) => Math.abs(v - hand[i]) > 1e-6).length,
        audit: { vsPrev: P.evaluate(w, P.LEAGUE_AUDIT_SEEDS, { opponent: [prev] }), mirror: base.audit, vsAuto: P.evaluate(w, P.LEAGUE_AUDIT_SEEDS, { opponent: ["autopilot"] }) },
        heldOut: { vsPrev: P.evaluate(w, P.LEAGUE_HELD_OUT_SEEDS, { opponent: [prev] }) },
        auto: { champ: P.evaluate(w, P.AUDIT_SEEDS, { opponent: ["autopilot"] }), prev: base.auto },
    };
    const verdict = qualifies(champion);
    log(`champion (seed ${c.seed}, picked on the held-out league score): ${c.kept} weights differ from the shipped pilot | audit vs the shipped pilot ${cmp(champion.audit.vsPrev)} (the shipped pilot against itself: ${cmp(base.audit)}) | held-out vs it ${cmp(champion.heldOut.vsPrev)} | vs the PD autopilot (first audit) ${cmp(champion.auto.champ)}`);
    log(verdict.ok ? "QUALIFIES: leads the shipped pilot from both sides on seeds nothing has read, and has not regressed against the PD autopilot." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { previous: base, previousHash: weightsHash(prev), runs: scored, champion, verdict };
}

/** Everything in this process, one search after another. */
export function run(opts, log = () => {}) {
    const prev = previousWeights(), runs = [];
    for (let k = 0; k < opts.runs; k++) runs.push(searchOne(opts, k, prev));
    return finish(opts, runs, log, prev);
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const c = result.champion, desc = PB.describePolicy(POLICY_ID, P), a = c.audit, prev = result.previous;
    const by = `league-trained from the shipped pilot ${result.previousHash} (brain/pilot6dofWeightsDefault.json): sparse-mutation (1+1)-ES, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations ` +
        `over ${opts.train} train seeds [${P.LEAGUE_TRAIN_SEEDS[0]}..${P.LEAGUE_TRAIN_SEEDS[opts.train - 1]}] against the league [the PD autopilot, the shipped pilot] from both sides, then pruned toward the shipped pilot: ${c.kept} of the ${P.WEIGHT_COUNT} weights differ from it and ${c.differsFromHand} from the PD autopilot; ` +
        `champion picked on the held-out league score [${P.LEAGUE_HELD_OUT_SEEDS[0]}..${P.LEAGUE_HELD_OUT_SEEDS[P.LEAGUE_HELD_OUT_SEEDS.length - 1]}]; ` +
        `vs the shipped pilot on the audit seeds [${P.LEAGUE_AUDIT_SEEDS[0]}..${P.LEAGUE_AUDIT_SEEDS[P.LEAGUE_AUDIT_SEEDS.length - 1]}], both sides: ${cmp(a.vsPrev)} (the shipped pilot against itself scores ${prev.audit.score.toFixed(2)} there); ` +
        `vs the PD autopilot on the first audit [${P.AUDIT_SEEDS[0]}..${P.AUDIT_SEEDS[P.AUDIT_SEEDS.length - 1]}]: ${cmp(c.auto.champ)} (the shipped pilot: ${cmp(prev.auto)})`;
    // `score` is the HELD-OUT league score the champion was picked on: the page prints it as "held-out score" for every pilot
    return PB.exportBrain(desc, c.weights, { score: Number(c.held.score.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
export { weightsHash };
