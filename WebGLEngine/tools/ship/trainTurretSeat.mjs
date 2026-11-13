// WebGLEngine/tools/ship/trainTurretSeat.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/trainTurretSeatCmd.mjs)
//
// TRAIN THE GUN SEATS' NETWORK AGAINST A SHIP, WITH A SEARCH THAT CAN REACH THE CIRCUIT'S SYNAPSES, AND SAY WHAT THE SYNAPSES DID. Two things were true of every trained gunner in this tree before this file, and both were measured (tools/ship/todo.mjs, `yamato-battleship`): each was trained against FIGHTERS, and in each
// NOT ONE of the circuit's synapses carried a weight -- the fruit fly's shipped seat gunner 0 of 313, the fish's 0 of 153 -- because tools/ship/trainSeatGunner.mjs moves one to four weights at random and half its children on a hand path of ONE hidden unit, so a synapse was never both moved and of any use.
// Keith: "a search that can actually reach a circuit's synapses, trained against a ship." This is that, for brain/seatTurretGunner.mjs (the race car's turret gunner in a seat: the network lays the gun).
//
//   THE FIGHT     a PAIR of brain/battleshipDuel.mjs: the candidate's side (the network in all thirteen seats behind regular sights, the bow-on rule, the cannon) against the same side with the HAND GUNNER in its seats, one geometry flown from both seats. A pair's score is its `lead`; THE HAND GUNNER SCORES EXACTLY 0.
//   THE START     the CAR'S hand weights (gunnerPolicy.handWeights()): what carries over from the race untrained. They are not the hand gunner and trail it a little (brain/seatTurretGunner-selfcheck.mjs pins by how much), so a search has first to win that back.
//   THE CHILDREN  one of four, and the first is the point:
//                 SYNAPSE (2 in 5)  a synapse whose SOURCE neuron is awake (it has a weight from a feature that varies in a seat, or a bias, or another awake neuron's synapse into it) is moved; if its TARGET neuron is read by none of the three outputs a seat reads, the target's weight into one of them moves with it.
//                                   That is the smallest change through which a synapse changes what the gun does, so a synapse child is live at first order and not a move the fights cannot see.
//                 PATH (1 in 5)     a neuron's weight from a varying feature and its weight into a read output, together (tools/ship/trainHelm.mjs's)
//                 TUNE (1 in 5)     one to `maxK` of the weights that already differ from zero
//                 BIAS (1 in 5)     one of the three output biases a seat reads
//                 The car's `drop` and `ignite` outputs and the four features a seat holds constant are never moved.
//   THE PRUNE     every weight that differs from the START is put back to it whenever that does not lower the train score: a synapse that buys nothing does not survive, so THE SYNAPSES LEFT ARE THE ONES THE TRAIN FIGHTS PAID FOR.
//   WHAT SHIPS    several searches; the champion is the best on the HELD-OUT pairs; the AUDIT pairs are read once. It is written only if it leads the hand gunner on held-out AND audit and wins at least as many pairs as it loses on each.
//   WHAT THE SYNAPSES DID is then ASKED, not assumed: the champion with every synapse put back to zero is flown on the same audit pairs (the ABLATION), beside the start. The difference between the champion and its ablation is what the circuit's wiring carried; if it is nothing, that is said.
//   WHAT IS NOT ASKED HERE: whether the FLY'S wiring does better than any other wiring of its size (that needs a control circuit; brain/gunnerPolicy.mjs has one wiring and brain/seatGunnerFish.mjs's control is for the correcting gunner). An ablation says the synapses are used; it does not say a fly's are special.
//
// A SEARCH IS ONE CALL AND THE CHOICE ANOTHER, as tools/ship/trainHelm.mjs, so the command runs the searches one a core. Deterministic.
"use strict";
import * as D from "../../brain/battleshipDuel.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as Topo from "../../brain/gfcTopology.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "seatTurretGunnerWeightsDefault.json");
export const GUNNERS = "regular";
export const RECIPE = Object.freeze({ runs: 4, iters: 160, seed: 7000, sigma: 0.5, maxK: 3, passes: 2 });
export const SHARE = Object.freeze({ synapse: 0.4, path: 0.2, tune: 0.2, bias: 0.2 });
const pairs = (seeds) => Object.freeze(D.KINDS.flatMap((kind) => seeds.map((seed) => Object.freeze({ kind, seed }))));
export const TRAIN_PAIRS = pairs([61, 62]);            // 8 pairs, 16 fights
export const HELD_OUT_PAIRS = pairs([71, 72, 73]);     // 12 pairs
export const AUDIT_PAIRS = pairs([81, 82, 83, 84]);    // 16 pairs
const H = ST.HIDDEN, EDGES = Topo.EDGES;
export const startWeights = () => GP.handWeights();

const side = (id, w, { gunners = GUNNERS, cannon = true } = {}) => D.makeSide(id, { gunners, cannon, ...(w ? { network: { module: ST, weights: w } } : {}) });
/** The network with weights `w` in every seat against the hand gunner over `list`: { score (the mean lead), won, lost, runs }. `opts` are the side's (gunners, cannon), the same for both. */
export function evaluate(w, list = TRAIN_PAIRS, opts = {}) {
    const X = side("net", w, opts), Y = side("hand", null, opts), runs = list.map(({ kind, seed }) => ({ kind, seed, lead: D.pair(X, Y, seed, kind, { countBrains: false }).lead }));
    return { score: runs.reduce((a, r) => a + r.lead, 0) / runs.length, won: runs.filter((r) => r.lead > D.DECISIVE).length, lost: runs.filter((r) => r.lead < -D.DECISIVE).length, runs };
}
export const describeEval = (r) => `${r.score >= 0 ? "+" : ""}${r.score.toFixed(3)} (${r.won} pairs won, ${r.lost} lost of ${r.runs.length})`;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = (rng, n) => Math.floor(rng() * n);
/** The neurons that are AWAKE in `w`: those with a weight from a feature that varies in a seat or a bias, and then, to a fixed point, those a synapse with a weight reaches from an awake one. A Set of indices. */
export function awake(w) {
    const on = new Set();
    for (let h = 0; h < H; h++) if (w[ST.hiddenBiasAt(h)] !== 0 || ST.LIVE_FEATURES.some((f) => w[ST.encoderAt(h, f)] !== 0)) on.add(h);
    for (let grew = true; grew;) { grew = false; EDGES.forEach(([to, from], k) => { if (!on.has(to) && on.has(from) && w[ST.synapseAt(k)] !== 0) { on.add(to); grew = true; } }); }
    return on;
}
/** Is neuron h read by an output a seat reads? */
export const isRead = (w, h) => ST.READ_OUTPUTS.some((o) => w[ST.outputAt(o, h)] !== 0);
/** The synapses a synapse child may move in `w`: those whose source is awake (the index k of each). */
export const reachable = (w) => { const on = awake(w), ks = []; EDGES.forEach(([, from], k) => { if (on.has(from)) ks.push(k); }); return ks; };
/** A synapse child (see the header). With no awake neuron (the zero weights) it is a path child. */
export function synapseChild(w, sigma, rng) {
    const ks = reachable(w); if (!ks.length) return pathChild(w, sigma, rng);
    const o = Float32Array.from(w), k = ks[pick(rng, ks.length)], to = EDGES[k][0];
    o[ST.synapseAt(k)] += gauss(rng) * sigma;
    if (!isRead(w, to)) o[ST.outputAt(ST.READ_OUTPUTS[pick(rng, ST.READ_OUTPUTS.length)], to)] += gauss(rng) * sigma;
    return o;
}
export function pathChild(w, sigma, rng) { const o = Float32Array.from(w), h = pick(rng, H); o[ST.encoderAt(h, ST.LIVE_FEATURES[pick(rng, ST.LIVE_FEATURES.length)])] += gauss(rng) * sigma; o[ST.outputAt(ST.READ_OUTPUTS[pick(rng, ST.READ_OUTPUTS.length)], h)] += gauss(rng) * sigma; return o; }
export function biasChild(w, sigma, rng) { const o = Float32Array.from(w); o[ST.biasAt(ST.READ_OUTPUTS[pick(rng, ST.READ_OUTPUTS.length)])] += gauss(rng) * sigma; return o; }
/** The indices of the weights that are not zero, less the car's drop and ignite read-outs and biases (which a seat never reads and a search never moves). */
export const tunable = (w) => { const idx = [], lo = ST.outputAt(3, 0), hi = ST.outputAt(4, H - 1); for (let i = 0; i < w.length; i++) if (w[i] !== 0 && !(i >= lo && i <= hi) && i !== ST.biasAt(3) && i !== ST.biasAt(4)) idx.push(i); return idx; };
export function tuneChild(w, sigma, rng, maxK) { const idx = tunable(w); if (!idx.length) return pathChild(w, sigma, rng); const o = Float32Array.from(w), k = 1 + pick(rng, maxK); for (let j = 0; j < k; j++) o[idx[pick(rng, idx.length)]] += gauss(rng) * sigma; return o; }
/** A child, by SHARE. Returns { w, kind }. */
export function child(w, sigma, rng, maxK) {
    const r = rng();
    return r < SHARE.synapse ? { w: synapseChild(w, sigma, rng), kind: "synapse" } : r < SHARE.synapse + SHARE.path ? { w: pathChild(w, sigma, rng), kind: "path" } : r < SHARE.synapse + SHARE.path + SHARE.tune ? { w: tuneChild(w, sigma, rng, maxK), kind: "tune" } : { w: biasChild(w, sigma, rng), kind: "bias" };
}
/** The weights that differ between two vectors. */
export const differs = (w, base) => { const idx = []; for (let i = 0; i < w.length; i++) if (w[i] !== base[i]) idx.push(i); return idx; };

/** (1+1)-ES from `start` (default the car's hand weights), strict improvements only. Returns { weights, trainScore, history, iters, improved, by (improvements by the kind of child), tried (children by kind) }. */
export function train({ seed = RECIPE.seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK, start = null, onIter = null, scoreFn = (w) => evaluate(w, TRAIN_PAIRS).score } = {}) {
    const rng = mulberry(seed), by = { synapse: 0, path: 0, tune: 0, bias: 0 }, tried = { synapse: 0, path: 0, tune: 0, bias: 0 }; let best = start ? Float32Array.from(start) : startWeights(), bestScore = scoreFn(best), improved = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const c = child(best, sigma, rng, maxK), score = scoreFn(c.w); tried[c.kind]++;
        if (score > bestScore + 1e-9) { best = c.w; bestScore = score; improved++; by[c.kind]++; }
        if (i % 20 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, synapses: ST.synapsesUsed(best) });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, by, tried };
}
/** Put every weight that differs from `base` (default the start) back to it whenever that does not lower the score; again until a pass reverts nothing or `maxPasses`. Returns { weights, kept, moved, passes, trainScore }. */
export function prune(w, { base = startWeights(), maxPasses = RECIPE.passes, scoreFn = (v) => evaluate(v, TRAIN_PAIRS).score } = {}) {
    const out = Float32Array.from(w), moved = differs(out, base).length; let best = scoreFn(out), passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs(out, base)) { const keep = out[i]; out[i] = base[i]; const s = scoreFn(out); if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep; }
    } while (reverted > 0 && passes < maxPasses);
    return { weights: out, kept: differs(out, base).length, moved, passes, trainScore: best };
}
/** `w` with every synapse put back to zero: the ablation. */
export function ablate(w) { const o = Float32Array.from(w); for (let k = 0; k < ST.REC_EDGES; k++) o[ST.synapseAt(k)] = 0; return o; }

/** One search, start to held-out. A plain record a file can hold. `sets` lets the gate use short lists and a made-up train score. */
export function search(opts = {}, log = () => {}, sets = { train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS }) {
    const o = { ...RECIPE, ...opts }, scoreFn = sets.scoreFn || ((w) => evaluate(w, sets.train).score);
    const found = train({ seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, scoreFn, onIter: (i, st) => { if (i % 20 === 0) log(`    seed ${o.seed} iteration ${i}: train ${st.score.toFixed(3)}, ${st.improved} improvements, ${st.synapses} synapses carry a weight`); } });
    const out = prune(found.weights, { maxPasses: o.passes, scoreFn }), heldOut = evaluate(out.weights, sets.heldOut);
    log(`  seed ${o.seed}: train ${found.history[0].score.toFixed(3)} -> ${found.trainScore.toFixed(3)}, ${found.improved} improvements (${Object.entries(found.by).map(([k, v]) => `${k} ${v} of ${found.tried[k]}`).join(", ")}); ${ST.synapsesUsed(found.weights)} synapses before the prune, ${ST.synapsesUsed(out.weights)} after; pruned ${out.moved} moved weights to ${out.kept}; held-out ${describeEval(heldOut)}`);
    return { seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, passes: o.passes, weights: Array.from(out.weights), startTrain: found.history[0].score, train: out.trainScore, improved: found.improved, by: found.by, tried: found.tried, moved: out.moved, kept: out.kept, synapsesBefore: ST.synapsesUsed(found.weights), synapses: ST.synapsesUsed(out.weights), heldOut };
}
/** Does the champion qualify? It leads the hand gunner (a score above 0) on the held-out AND the audit pairs, and on each wins at least as many pairs as it loses. Pure. */
export function qualifies(champ) {
    const reasons = [];
    if (!(champ.heldOut.score > 0)) reasons.push(`held-out lead ${champ.heldOut.score.toFixed(3)} is not above the hand gunner's 0`);
    if (!(champ.audit.score > 0)) reasons.push(`audit lead ${champ.audit.score.toFixed(3)} is not above the hand gunner's 0`);
    if (!(champ.heldOut.won >= champ.heldOut.lost)) reasons.push(`held-out pairs: ${champ.heldOut.won} won is behind ${champ.heldOut.lost} lost`);
    if (!(champ.audit.won >= champ.audit.lost)) reasons.push(`audit pairs: ${champ.audit.won} won is behind ${champ.audit.lost} lost`);
    return { ok: reasons.length === 0, reasons };
}
/**
 * The choice: the record with the best held-out score (the lower seed on a tie) is the champion; the audit pairs are flown once for it; then, on the same audit pairs, the START (the car's hand weights), the ABLATION (the champion with its synapses at zero) and the champion where it was not trained (perfect and green sights, no cannon).
 * Returns { runs, champion: { ...record, weights, audit }, verdict, start, ablation, synapseWorth (the champion's audit score less its ablation's), others }.
 */
export function finish(records, log = () => {}, sets = { audit: AUDIT_PAIRS }) {
    if (!Array.isArray(records) || !records.length) throw new Error("trainTurretSeat.finish: no search records to choose from");
    for (const r of records) if (!r || !Array.isArray(r.weights) || r.weights.length !== ST.WEIGHT_COUNT || !r.heldOut) throw new Error(`trainTurretSeat.finish: a record needs ${ST.WEIGHT_COUNT} weights and its held-out result (seed ${r && r.seed})`);
    const runs = records.slice().sort((a, b) => b.heldOut.score - a.heldOut.score || a.seed - b.seed), c = runs[0], weights = Float32Array.from(c.weights), audit = evaluate(weights, sets.audit), champion = { ...c, weights, audit }, verdict = qualifies(champion);
    log(`champion (seed ${c.seed}, picked on held-out of ${runs.length} searches; ${ST.synapsesUsed(weights)} synapses carry a weight): train ${c.train.toFixed(3)} | held-out ${describeEval(c.heldOut)} | audit ${describeEval(audit)}`);
    const start = evaluate(startWeights(), sets.audit), ablation = ST.synapsesUsed(weights) ? evaluate(ablate(weights), sets.audit) : audit, synapseWorth = audit.score - ablation.score;
    log(`  the start (the car's hand weights), audit pairs: ${describeEval(start)}`);
    log(`  THE ABLATION (the champion with every synapse at zero), audit pairs: ${describeEval(ablation)} -- the synapses are worth ${synapseWorth >= 0 ? "+" : ""}${synapseWorth.toFixed(3)} of the champion's ${audit.score.toFixed(3)}`);
    const others = {};
    for (const [name, o] of [["perfect sights", { gunners: "perfect" }], ["green sights", { gunners: "green" }], ["no cannon on either side", { cannon: false }]]) { others[name] = evaluate(weights, sets.audit, o); log(`  ${name} (never trained for), audit pairs: ${describeEval(others[name])}`); }
    log(verdict.ok ? "QUALIFIES: leads the hand gunner on the held-out pairs and on the audit pairs." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { runs, champion, verdict, start, ablation, synapseWorth, others };
}
export const describeOthers = (others) => Object.entries(others).map(([k, r]) => `${k} ${describeEval(r)}`).join("; ");
const names = (list) => `${D.KINDS.join(", ")} x seeds ${[...new Set(list.map((p) => p.seed))].join(",")}`;
/** The file written when the champion qualifies: a swek-brain-v1 blob for the CAR'S policy id (it is the car's network), saying in `by` that it was trained in a ship's seat and what the synapses did. */
export function blobOf(result) {
    const c = result.champion, seeds = result.runs.map((r) => r.seed).sort((a, b) => a - b), used = ST.synapsesUsed(c.weights);
    const by = `TRAINED IN A CAPITAL SHIP'S GUN SEAT, NOT ON THE RACE (brain/seatTurretGunner.mjs seats this network; tools/ship/trainTurretSeat.mjs trained it): (1+1)-ES from the car's hand weights, seed ${c.seed} of ${result.runs.length} searches (${seeds.join(",")}), sigma ${c.sigma}, ${c.iters} iterations of synapse, path, tune and bias children (strict improvements only), judged by the mean lead over the hand gunner of battleshipDuel pairs (thirteen seats of the network behind ${GUNNERS} sights against thirteen of the hand gunner, the bow-on rule, the cannon; train: ${names(TRAIN_PAIRS)}), then pruned (at most ${c.passes} passes): ${c.kept} of ${ST.WEIGHT_COUNT} weights differ from the car's hand weights and ${used} of the circuit's ${ST.REC_EDGES} synapses carry a weight; ` +
        `champion picked on held-out (${names(HELD_OUT_PAIRS)}): ${describeEval(c.heldOut)}; audit (${names(AUDIT_PAIRS)}), read once: ${describeEval(c.audit)}; the hand gunner scores 0 by construction; on the same audit pairs the start (the car's hand weights) ${describeEval(result.start)} and THE ABLATION (this network with every synapse at zero) ${describeEval(result.ablation)}, so the synapses are worth ${result.synapseWorth >= 0 ? "+" : ""}${result.synapseWorth.toFixed(3)}; where it was NOT trained, on the audit pairs: ${describeOthers(result.others)}`;
    return PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), c.weights, { score: Number(c.heldOut.score.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const known = { seed: Number, iters: Number, sigma: Number, passes: Number, maxK: Number, record: String, records: String, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, record: null, records: null, out: DEFAULT_OUT, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number (got ${JSON.stringify(v)})`); }
    }
    return o;
}

export function reportLines() {
    return [
        `[trainTurretSeat] trains the gun seats' network (brain/seatTurretGunner.mjs, the race car's turret gunner) AGAINST A SHIP: a (1+1)-ES from the car's hand weights, ${RECIPE.runs} searches of ${RECIPE.iters} iterations from seed ${RECIPE.seed}, sigma ${RECIPE.sigma}; ${Math.round(SHARE.synapse * 100)}% of the children move a synapse whose source neuron is awake (with a read-out for its target when it has none), the rest are path, tune and bias children; then ${RECIPE.passes} prune passes`,
        `[trainTurretSeat] graded by the mean lead over the hand gunner of battleshipDuel pairs: ${TRAIN_PAIRS.length} train, ${HELD_OUT_PAIRS.length} held-out and ${AUDIT_PAIRS.length} audit pairs; a champion is written only if it leads on held-out AND audit; its synapses are then put to zero and the audit flown again, which says what they were worth`,
    ];
}
