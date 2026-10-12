// WebGLEngine/tools/ship/trainAircraftPilot.mjs -- v4839 (the library; the command is tools/ship/trainPilotAircraft.mjs)
//
// TRAIN THE AIRCRAFT PILOT AND SAY WHAT IT DID, by the recipe tools/ship/train6dofPilot.mjs holds for the space-battle pilot: several independent searches (brain/pilotAircraftPolicy.mjs's train(): a sparse-mutation (1+1)-ES
// from the hand weights, which are the PD heading-hold controller written through the network), each on the TRAIN scenarios and pruned back to the weights that carry the result; the one that scores best on the HELD-OUT scenarios
// is the champion; the AUDIT scenarios -- which no search and no choice ever saw -- grade the champion against the PD controller once. A pilot is written only if it beats the controller on the held-out AND the audit
// scenarios, loses on no more audit scenarios than it wins, adds no unstable flight, AND does not fly the page's own patrol worse. If none does, nothing is written and the output says so.
//
// What differs from the space-battle recipe is the task. There is no opponent: a scenario is "the nose starts N degrees off the held heading; bring it round and keep it there", scored by the mean and the final cosine over
// 30 s of the real aerodynamic flight (brain/pilotAircraftPolicy.mjs's fly()).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../../brain/pilotAircraftPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "pilotAircraftWeightsDefault.json");
export const POLICY_ID = "pilotAircraftPolicy";
export const RECIPE = Object.freeze({ runs: 4, iters: 600, seed: 3000, sigma: 0.3, maxK: 4 });
const cmp = A.describeEval;

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

/** Does the champion qualify to ship? Pure, so the gate can drive it on made-up numbers. champ/hand: { heldOut, audit, patrol, vs } -- vs is versus(audit, handAudit). */
export function qualifies(champ, hand, { patrolSlack = 0.01 } = {}) {
    const reasons = [];
    if (!(champ.heldOut.score > hand.heldOut.score)) reasons.push(`held-out score ${champ.heldOut.score.toFixed(3)} does not beat the PD controller's ${hand.heldOut.score.toFixed(3)}`);
    if (!(champ.audit.score > hand.audit.score)) reasons.push(`audit score ${champ.audit.score.toFixed(3)} does not beat the PD controller's ${hand.audit.score.toFixed(3)}`);
    if (!(champ.vs.better > champ.vs.worse)) reasons.push(`on the audit scenarios it flies ${champ.vs.better} better and ${champ.vs.worse} worse than the PD controller: not more better than worse`);
    if (champ.audit.unstable > hand.audit.unstable) reasons.push(`${champ.audit.unstable} unstable audit flights against the PD controller's ${hand.audit.unstable}`);
    if (!(champ.patrol.mean >= hand.patrol.mean - patrolSlack)) reasons.push(`the page's patrol: mean ${champ.patrol.mean.toFixed(3)} is worse than the PD controller's ${hand.patrol.mean.toFixed(3)} by more than ${patrolSlack}`);
    return { ok: reasons.length === 0, reasons };
}

export function run(opts, log = () => {}) {
    const handW = A.handWeights(), ev = (w, set) => A.evaluate(w, set);
    const hand = { train: ev(handW, A.TRAIN_SET), heldOut: ev(handW, A.HELD_OUT_SET), audit: ev(handW, A.AUDIT_SET), patrol: A.patrol(handW) };
    log(`PD controller (the hand pilot): train ${cmp(hand.train)} | held-out ${cmp(hand.heldOut)} | audit ${cmp(hand.audit)} | patrol mean ${hand.patrol.mean.toFixed(3)}, worst leg ${hand.patrol.worstLeg.toFixed(3)}`);
    const runs = [];
    for (let r = 0; r < opts.runs; r++) {
        const seed = opts.seed + r, t0 = Date.now(), found = A.train({ seed, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK });
        const out = A.prune(found.weights), heldOut = ev(out.weights, A.HELD_OUT_SET);
        runs.push({ seed, weights: out.weights, train: out.trainScore, heldOut, improved: found.improved, neutral: found.neutral, moved: out.moved, kept: out.kept });
        log(`  run ${r + 1}/${opts.runs} seed ${seed}: train ${found.trainScore.toFixed(3)}, ${found.improved} improvements + ${found.neutral} neutral moves; pruned ${out.moved} moved weights to ${out.kept}; held-out ${cmp(heldOut)}  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
    }
    // the champion is picked on HELD-OUT only; the audit and the patrol are read once, after
    runs.sort((a, b) => b.heldOut.score - a.heldOut.score);
    const champ = runs[0], audit = ev(champ.weights, A.AUDIT_SET), trainRes = ev(champ.weights, A.TRAIN_SET), patrol = A.patrol(champ.weights);
    const champion = { seed: champ.seed, weights: champ.weights, kept: champ.kept, moved: champ.moved, train: trainRes, heldOut: champ.heldOut, audit, patrol, vs: A.versus(audit, hand.audit) };
    const verdict = qualifies(champion, hand);
    log(`champion (seed ${champ.seed}, picked on held-out): train ${cmp(trainRes)} | held-out ${cmp(champ.heldOut)} | audit ${cmp(audit)} (${champion.vs.better} better / ${champion.vs.worse} worse / ${champion.vs.same} level than the PD controller) | patrol mean ${patrol.mean.toFixed(3)}, worst leg ${patrol.worstLeg.toFixed(3)}`);
    log(verdict.ok ? "QUALIFIES: beats the PD controller on the held-out and audit scenarios and does not fly the page's patrol worse." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { hand, runs, champion, verdict };
}

/** The file written when the champion qualifies: the portable swek-brain-v1 blob, with the recipe and the numbers it was graded on in `by`. */
export function blobOf(result, opts) {
    const c = result.champion, desc = PB.describePolicy(POLICY_ID, A);
    const by = `sparse-mutation (1+1)-ES from the hand weights, seed ${c.seed} of ${opts.runs} runs (${opts.seed}..${opts.seed + opts.runs - 1}), sigma ${opts.sigma}, 1-${opts.maxK} weights per child, ${opts.iters} iterations over the ${A.TRAIN_SET.length} train scenarios, then pruned: ${c.kept} of the ${A.WEIGHT_COUNT} weights differ from the PD controller; ` +
        `champion picked on held-out; vs the PD controller: held-out ${cmp(c.heldOut)}, audit ${cmp(c.audit)} (the controller scores ${result.hand.audit.score.toFixed(3)} there; ${c.vs.better} scenarios better, ${c.vs.worse} worse), patrol mean ${c.patrol.mean.toFixed(3)} (the controller: ${result.hand.patrol.mean.toFixed(3)})`;
    return PB.exportBrain(desc, c.weights, { score: Number(c.heldOut.score.toFixed(4)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
export { weightsHash };
