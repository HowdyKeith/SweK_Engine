// WebGLEngine/tools/ship/trainHelm.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/trainHelmCmd.mjs)
//
// TRAIN A NETWORK FOR A CAPITAL SHIP'S HELM AND SAY WHAT IT DID. brain/helmPolicy.mjs is the helm's network: a CORRECTION to the rule that turns the hull and sets the engines (up to half the hull's torque limit about each axis, up to 0.3 of the pods' thrust), whose zero weights ARE the rule. Its header has said
// 'NO HELM WAS TRAINED' since it was written, and tools/ship/todo.mjs's `helm-network-training` says how one would be: tools/ship/trainSeatGunner.mjs's recipe, and FIRST the rule against the rule plus noise. This is that, on the fight that did not exist then -- brain/battleshipDuel.mjs, a ship against a ship.
//
//   THE FIGHT     a PAIR of battleshipDuel: the candidate's side (the helm network correcting the bow-on rule, regular gunners behind the hand rule, the cannon) against the same side WITHOUT the network, in one geometry flown from both seats. THE SCORE of a pair is its `lead` -- the candidate's score less the rule's,
//                 the mean of the two seats -- so THE RULE SCORES EXACTLY 0 against itself on every set, and a candidate's score is how far it beats the rule. A set's score is the mean lead of its pairs.
//   THE NOISE     (noiseStudy) the todo's first measurement: `n` random helms -- each a few PATHS drawn as the search draws them (below) -- flown on a set; how many lead the rule. If none does, the rule is near a local optimum and a search is unlikely to pay.
//   THE SEARCH    a (1+1)-ES from the zero weights, strict improvements only. THE ZERO WEIGHTS ARE A SADDLE: the hidden layer is off, so a move of an encoder weight alone or of an output weight alone changes NOTHING (the seat gunner's hand weights have a live unit; the helm's have none). So a child is one of three:
//                 a BIAS child (one of the four output biases that are read moves: a constant correction), a PATH child (a hidden unit's weight from one feature AND its weight into one output move together: the smallest change that makes the helm answer what it is shown), or, once any weight differs from zero,
//                 a TUNE child (one to `maxK` of the weights that already differ move). The fifth output (the pilot's trigger) is not read by a helm and is never moved.
//   THE PRUNE     every weight that differs from zero is put back whenever that does not lower the train score (trainSeatGunner's prune).
//   WHAT SHIPS    several searches; the champion is the one with the best HELD-OUT score; the AUDIT pairs, which no search and no choice saw, are read once; a file is written only if the champion leads the rule on the held-out AND the audit pairs and wins at least as many pairs as it loses on each. If none does,
//                 nothing is written: 'no trained helm beat the rule' is a result.
//
// A SEARCH IS ONE CALL (search()) AND THE CHOICE IS ANOTHER (finish()), so that the command can run the searches in separate processes -- one a core -- and read the audit once, in one place. Deterministic: the same options give the same weights to the bit.
"use strict";
import * as D from "../../brain/battleshipDuel.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "helmWeightsDefault.json");
export const POLICY_ID = "helmPolicy", GUNNERS = "regular", HELM_RULE = "face";
export const RECIPE = Object.freeze({ runs: 4, iters: 160, seed: 5000, sigma: 0.6, maxK: 3, passes: 2 });
const pairs = (seeds) => Object.freeze(D.KINDS.flatMap((kind) => seeds.map((seed) => Object.freeze({ kind, seed }))));
export const TRAIN_PAIRS = pairs([31, 32]);            // 8 pairs, 16 fights
export const HELD_OUT_PAIRS = pairs([41, 42, 43]);     // 12 pairs
export const AUDIT_PAIRS = pairs([51, 52, 53, 54]);    // 16 pairs
const F = HP.FEATURES, H = HP.HIDDEN, OUT_BASE = F * H + H + HP.REC_EDGES, READ_OUTPUTS = 4;   // the fifth output is the pilot's trigger: a helm does not read it
/** Where the weights of a path are: the encoder's weight from feature f into hidden unit h, unit h's weight into output o, and output o's bias. */
export const encoderAt = (h, f) => h * F + f, outputAt = (o, h) => OUT_BASE + o * H + h, biasAt = (o) => OUT_BASE + H * HP.OUTPUTS + o;

const side = (id, w, { rule = HELM_RULE, gunners = GUNNERS, cannon = true } = {}) => D.makeSide(id, { helmRule: rule, gunners, cannon, ...(w ? { helmNet: { module: HP, weights: w } } : {}) });
/** The helm with weights `w` against the rule alone over `list`: { score (the mean lead), won, lost (pairs by more than DECISIVE), runs: [{ kind, seed, lead }] }. `opts` are the side's (rule, gunners, cannon), the same for both. */
export function evaluate(w, list = TRAIN_PAIRS, opts = {}) {
    const X = side("helm", w, opts), Y = side("rule", null, opts), runs = list.map(({ kind, seed }) => ({ kind, seed, lead: D.pair(X, Y, seed, kind, { countBrains: false }).lead }));
    return { score: runs.reduce((a, r) => a + r.lead, 0) / runs.length, won: runs.filter((r) => r.lead > D.DECISIVE).length, lost: runs.filter((r) => r.lead < -D.DECISIVE).length, runs };
}
export const describeEval = (r) => `${r.score >= 0 ? "+" : ""}${r.score.toFixed(3)} (${r.won} pairs won, ${r.lost} lost of ${r.runs.length})`;

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = (rng, n) => Math.floor(rng() * n);
/** A path child of `w`: a hidden unit's weight from one feature and its weight into one of the four outputs a helm reads, both moved by a gaussian of `sigma`. */
export function pathChild(w, sigma, rng) { const o = Float32Array.from(w), h = pick(rng, H); o[encoderAt(h, pick(rng, F))] += gauss(rng) * sigma; o[outputAt(pick(rng, READ_OUTPUTS), h)] += gauss(rng) * sigma; return o; }
/** A bias child: one of the four output biases a helm reads moved. */
export function biasChild(w, sigma, rng) { const o = Float32Array.from(w); o[biasAt(pick(rng, READ_OUTPUTS))] += gauss(rng) * sigma; return o; }
/** The indices of the weights that differ from zero (the rule). */
export const movedOf = (w) => { const idx = []; for (let i = 0; i < w.length; i++) if (w[i] !== 0) idx.push(i); return idx; };
/** A tune child: one to `maxK` of the weights that already differ from zero moved (with none, a path child). */
export function tuneChild(w, sigma, rng, maxK) { const idx = movedOf(w); if (!idx.length) return pathChild(w, sigma, rng); const o = Float32Array.from(w), k = 1 + pick(rng, maxK); for (let j = 0; j < k; j++) o[idx[pick(rng, idx.length)]] += gauss(rng) * sigma; return o; }
/** A child: a third each (see the header). */
export function child(w, sigma, rng, maxK) { const r = rng(); return r < 1 / 3 ? biasChild(w, sigma, rng) : r < 2 / 3 ? pathChild(w, sigma, rng) : tuneChild(w, sigma, rng, maxK); }

/** The todo's first measurement: `n` random helms of `paths` path moves each from the zero weights, flown on `list`. Returns { n, leads (each one's score), ahead (how many lead the rule), best, mean }. */
export function noiseStudy({ n = 12, paths = 3, sigma = RECIPE.sigma, seed = 900, list = HELD_OUT_PAIRS, scoreFn = (w) => evaluate(w, list).score } = {}) {
    const rng = mulberry(seed), leads = [];
    for (let k = 0; k < n; k++) { let w = HP.zeroWeights(); for (let j = 0; j < paths; j++) w = pathChild(w, sigma, rng); leads.push(scoreFn(w)); }
    return { n, leads, ahead: leads.filter((x) => x > 0).length, best: Math.max(...leads), mean: leads.reduce((a, b) => a + b, 0) / n };
}
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** (1+1)-ES from the zero weights on `scoreFn` (default the train pairs). Returns { weights, trainScore, history, iters, improved }. */
export function train({ seed = RECIPE.seed, iters = RECIPE.iters, sigma = RECIPE.sigma, maxK = RECIPE.maxK, start = null, onIter = null, scoreFn = (w) => evaluate(w, TRAIN_PAIRS).score } = {}) {
    const rng = mulberry(seed); let best = start ? Float32Array.from(start) : HP.zeroWeights(), bestScore = scoreFn(best), improved = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = child(best, sigma, rng, maxK), score = scoreFn(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; }
        if (i % 20 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved };
}
/** Put every weight that differs from zero back to zero whenever that does not lower the score, and go round again until a pass reverts nothing or `maxPasses`. Returns { weights, kept, moved, passes, trainScore }. */
export function prune(w, { maxPasses = RECIPE.passes, scoreFn = (v) => evaluate(v, TRAIN_PAIRS).score } = {}) {
    const out = Float32Array.from(w), moved = movedOf(out).length; let best = scoreFn(out), passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of movedOf(out)) { const keep = out[i]; out[i] = 0; const s = scoreFn(out); if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep; }
    } while (reverted > 0 && passes < maxPasses);
    return { weights: out, kept: movedOf(out).length, moved, passes, trainScore: best };
}

/** One search, start to held-out: train, prune, fly the held-out pairs. Returns a plain record a file can hold: { seed, iters, sigma, maxK, passes, weights (an array), train, improved, moved, kept, heldOut }. `sets` lets the gate use short lists (and a made-up train score). */
export function search(opts = {}, log = () => {}, sets = { train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS }) {
    const o = { ...RECIPE, ...opts }, scoreFn = sets.scoreFn || ((w) => evaluate(w, sets.train).score);   // `sets.scoreFn` is the gate's: a made-up train score, so that the prune has something to put back
    const found = train({ seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, scoreFn, onIter: (i, st) => { if (i % 20 === 0) log(`    seed ${o.seed} iteration ${i}: train ${st.score.toFixed(3)}, ${st.improved} improvements`); } });
    const out = prune(found.weights, { maxPasses: o.passes, scoreFn }), heldOut = evaluate(out.weights, sets.heldOut);
    log(`  seed ${o.seed}: train ${found.trainScore.toFixed(3)}, ${found.improved} improvements; pruned ${out.moved} moved weights to ${out.kept}; held-out ${describeEval(heldOut)}`);
    return { seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, passes: o.passes, weights: Array.from(out.weights), train: out.trainScore, improved: found.improved, moved: out.moved, kept: out.kept, heldOut };
}
/** Does the champion qualify? Pure. It leads the rule (a score above 0) on the held-out AND the audit pairs, and on each it wins at least as many pairs as it loses. */
export function qualifies(champ) {
    const reasons = [];
    if (!(champ.heldOut.score > 0)) reasons.push(`held-out lead ${champ.heldOut.score.toFixed(3)} is not above the rule's 0`);
    if (!(champ.audit.score > 0)) reasons.push(`audit lead ${champ.audit.score.toFixed(3)} is not above the rule's 0`);
    if (!(champ.heldOut.won >= champ.heldOut.lost)) reasons.push(`held-out pairs: ${champ.heldOut.won} won is behind ${champ.heldOut.lost} lost`);
    if (!(champ.audit.won >= champ.audit.lost)) reasons.push(`audit pairs: ${champ.audit.won} won is behind ${champ.audit.lost} lost`);
    return { ok: reasons.length === 0, reasons };
}
/**
 * The choice: of the searches' records the one with the best held-out score is the champion (the lowest seed on a tie); the audit pairs are flown ONCE, for it alone; then what it does where it was NOT trained (correcting the broadside rule; with no cannon on either side; behind green sights), on the audit pairs.
 * Returns { runs (sorted), champion: { ...record, weights (Float32Array), audit }, verdict, others }.
 */
export function finish(records, log = () => {}, sets = { audit: AUDIT_PAIRS }) {
    if (!Array.isArray(records) || !records.length) throw new Error("trainHelm.finish: no search records to choose from");
    for (const r of records) if (!r || !Array.isArray(r.weights) || r.weights.length !== HP.WEIGHT_COUNT || !r.heldOut) throw new Error(`trainHelm.finish: a record needs ${HP.WEIGHT_COUNT} weights and its held-out result (seed ${r && r.seed})`);
    const runs = records.slice().sort((a, b) => b.heldOut.score - a.heldOut.score || a.seed - b.seed), c = runs[0], weights = Float32Array.from(c.weights), audit = evaluate(weights, sets.audit), champion = { ...c, weights, audit }, verdict = qualifies(champion);
    log(`champion (seed ${c.seed}, picked on held-out of ${runs.length} searches): train ${c.train.toFixed(3)} | held-out ${describeEval(c.heldOut)} | audit ${describeEval(audit)}`);
    const others = {};
    for (const [name, o] of [["correcting the broadside rule", { rule: "broadside" }], ["no cannon on either side", { cannon: false }], ["green gunners", { gunners: "green" }]]) { others[name] = evaluate(weights, sets.audit, o); log(`  ${name} (never trained for), audit pairs: ${describeEval(others[name])}`); }
    log(verdict.ok ? "QUALIFIES: leads the rule on the held-out pairs and on the audit pairs." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { runs, champion, verdict, others };
}
export const describeOthers = (others) => Object.entries(others).map(([k, r]) => `${k} ${describeEval(r)}`).join("; ");
const names = (list) => `${D.KINDS.join(", ")} x seeds ${[...new Set(list.map((p) => p.seed))].join(",")}`;
/** The file written when the champion qualifies: the portable swek-brain-v1 blob with the recipe and the scores in `by`. */
export function blobOf(result) {
    const c = result.champion, seeds = result.runs.map((r) => r.seed).sort((a, b) => a - b);
    const by = `(1+1)-ES from the zero weights (the rule), seed ${c.seed} of ${result.runs.length} searches (${seeds.join(",")}), sigma ${c.sigma}, ${c.iters} iterations of bias, path and tune children (strict improvements only), judged by the mean lead over the rule of battleshipDuel pairs (the bow-on rule corrected by the network against the bow-on rule alone, regular gunners, the cannon; train: ${names(TRAIN_PAIRS)}), then pruned (at most ${c.passes} passes): ${c.kept} of ${HP.WEIGHT_COUNT} weights differ from zero; ` +
        `champion picked on held-out (${names(HELD_OUT_PAIRS)}): ${describeEval(c.heldOut)}; audit (${names(AUDIT_PAIRS)}), read once: ${describeEval(c.audit)}; the rule scores 0 against itself by construction; where it was NOT trained, on the audit pairs: ${describeOthers(result.others)}`;
    return PB.exportBrain(PB.describePolicy(POLICY_ID, HP), c.weights, { score: Number(c.heldOut.score.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

/** Parse `--name value` / `--flag` argv, REFUSING an option it does not know. */
export function parseArgs(argv) {
    const known = { seed: Number, iters: Number, sigma: Number, passes: Number, maxK: Number, n: Number, record: String, records: String, out: String, write: Boolean, quiet: Boolean }, o = { ...RECIPE, n: 12, record: null, records: null, out: DEFAULT_OUT, write: false, quiet: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) o[k] = true; else { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); o[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(o[k])) throw new Error(`${a} needs a number (got ${JSON.stringify(v)})`); }
    }
    return o;
}

export function reportLines() {
    return [
        `[trainHelm] trains a capital ship's helm network (brain/helmPolicy.mjs): a (1+1)-ES from the zero weights, ${RECIPE.runs} searches of ${RECIPE.iters} iterations from seed ${RECIPE.seed}, sigma ${RECIPE.sigma}, bias, path and tune children, then ${RECIPE.passes} prune passes`,
        `[trainHelm] graded by the mean lead over the rule of battleshipDuel pairs (each geometry from both seats): ${TRAIN_PAIRS.length} train, ${HELD_OUT_PAIRS.length} held-out and ${AUDIT_PAIRS.length} audit pairs; a champion is written only if it leads the rule on held-out AND audit and wins at least as many pairs as it loses on each`,
    ];
}
