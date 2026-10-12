// WebGLEngine/tools/ship/train6dofPilot.mjs -- v4833 (the library; the command is tools/ship/trainPilot6dof.mjs)
//
// TRAIN THE SPACE-BATTLE PILOT AND SAY WHAT IT DID. Several independent searches (brain/pilot6dofPolicy.mjs's train(): a sparse-mutation (1+1)-ES from the hand weights, which are the PD autopilot written
// through the network), each on the TRAIN seeds; the one that scores best on the HELD-OUT seeds is the champion; and the AUDIT seeds -- which no search and no choice ever saw -- grade the champion against
// the hand pilot once. A pilot is written only if it beats the hand pilot on the held-out seeds AND on the audit seeds (score, and wins minus losses). If none does, nothing is written and the output says so:
// "no learned pilot beat the PD autopilot" is a result, and the page then has no shipped choice rather than one that is not better.
//
//   node tools/ship/trainPilot6dof.mjs                          # 5 runs x 1500 iterations, report only
//   node tools/ship/trainPilot6dof.mjs --runs 3 --iters 800     # smaller
//   node tools/ship/trainPilot6dof.mjs --write [--out <file>]   # write brain/pilot6dofWeightsDefault.json when the champion qualifies
//
// Deterministic: the same options give the same weights to the bit (the duel, the seeds and the search's generator are all seeded).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/pilot6dofPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilot6dofWeightsDefault.json");
export const POLICY_ID = "pilot6dofPolicy";
export const RECIPE = Object.freeze({ runs: 5, iters: 1500, seed: 2000, sigma: 0.3, maxK: 4 });

const cmp = P.describeEval;

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know (a typo must not silently train the default recipe). */
export function parseArgs(argv) {
    const known = { runs: Number, iters: Number, seed: Number, sigma: Number, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, out: DEFAULT_OUT, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    return o;
}

/** Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers. */
export function qualifies(champ, hand) {
    const lead = (r) => r.wins - r.losses;
    const reasons = [];
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(2)} does not beat the hand pilot's ${hand.heldOut.score.toFixed(2)}`);
    if (!(champ.audit.score > hand.audit.score)) reasons.push(`audit score ${champ.audit.score.toFixed(2)} does not beat the hand pilot's ${hand.audit.score.toFixed(2)}`);
    if (!(lead(champ.audit) > lead(hand.audit))) reasons.push(`audit wins-minus-losses ${lead(champ.audit)} does not beat the hand pilot's ${lead(hand.audit)}`);
    if (!(lead(champ.heldOut) >= lead(hand.heldOut))) reasons.push(`held-out wins-minus-losses ${lead(champ.heldOut)} is behind the hand pilot's ${lead(hand.heldOut)}`);
    return { ok: reasons.length === 0, reasons };
}

export function run(opts, log = () => {}) {
    const hand = P.handWeights(), handRes = { train: P.evaluate(hand, P.TRAIN_SEEDS), heldOut: P.evaluate(hand, P.HELD_OUT_SEEDS), audit: P.evaluate(hand, P.AUDIT_SEEDS) };
    log(`hand pilot (the PD autopilot through the network): train ${cmp(handRes.train)} | held-out ${cmp(handRes.heldOut)} | audit ${cmp(handRes.audit)}`);
    const runs = [];
    for (let r = 0; r < opts.runs; r++) {
        const seed = opts.seed + r, t0 = Date.now(), found = P.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK });
        // a child that scores EXACTLY what its parent did replaces it, so most moved weights are drift: put back every one that carries nothing (prune()'s header has the measurement)
        const out = P.prune(found.weights), heldOut = P.evaluate(out.weights, P.HELD_OUT_SEEDS);
        runs.push({ seed, weights: out.weights, train: out.trainScore, heldOut, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept });
        log(`  run ${r + 1}/${opts.runs} seed ${seed}: train ${found.trainScore.toFixed(2)}, ${found.improved} improvements + ${found.neutral} neutral moves; pruned ${out.moved} moved weights to ${out.kept}; held-out ${cmp(heldOut)}  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
    }
    // the champion is picked on HELD-OUT only; the audit is read once, after
    runs.sort((a, b) => b.heldOut.score - a.heldOut.score || (b.heldOut.wins - b.heldOut.losses) - (a.heldOut.wins - a.heldOut.losses));
    const champ = runs[0], audit = P.evaluate(champ.weights, P.AUDIT_SEEDS), trainRes = P.evaluate(champ.weights, P.TRAIN_SEEDS);
    const champion = { seed: champ.seed, weights: champ.weights, kept: champ.kept, moved: champ.moved, train: trainRes, heldOut: champ.heldOut, audit };
    const verdict = qualifies(champion, handRes);
    log(`champion (seed ${champ.seed}, picked on held-out): train ${cmp(trainRes)} | held-out ${cmp(champ.heldOut)} | audit ${cmp(audit)}`);
    log(verdict.ok ? "QUALIFIES: beats the hand pilot on the held-out seeds and on the audit seeds." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { hand: handRes, runs, champion, verdict };
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob the fly3d page's shipped pilot already is, with the recipe and the three scores in `by`. */
export function blobOf(result, opts) {
    const c = result.champion, desc = PB.describePolicy(POLICY_ID, P);
    const by = `sparse-mutation (1+1)-ES from the hand weights, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations over the train seeds [${P.TRAIN_SEEDS.join(",")}], then pruned: ${c.kept} of the 930 weights differ from the hand pilot (the PD autopilot through the network); ` +
        `champion picked on held-out [${P.HELD_OUT_SEEDS.join(",")}]; vs the PD autopilot: held-out ${cmp(c.heldOut)}, audit [${P.AUDIT_SEEDS[0]}..${P.AUDIT_SEEDS[P.AUDIT_SEEDS.length - 1]}] ${cmp(c.audit)}; the hand pilot scores ${result.hand.audit.score.toFixed(2)} on the same audit`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
