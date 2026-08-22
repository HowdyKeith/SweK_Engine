// brain/blobTrainer.mjs -- teach the blob to fly, instead of me guessing at it.
//
// The seeded weights in blobGravity.js were a hand-tuned PD controller: my opinion about how to beat gravity. This
// replaces the opinion with a measurement. It is a (1+1) evolution strategy -- perturb the weights, keep the change
// only if it scores better, widen the search when it is winning and narrow it when it is not -- scored by the reward
// the round already defined: time held in the goal band, per unit of energy burned getting there.
//
// The protocol is the part that matters. Training on some conditions and then reporting the score ON THOSE conditions
// tells you nothing; it just proves the search worked. So the weights are trained on one set of goals and starting
// tanks and then judged on a DIFFERENT set it never saw. If it only wins on the training set, it memorised; if it wins
// on the held-out set, it actually learned to fly.
//
// Runs on plain Node -- no GPU needed to train something this small. The GPU brain seam is untouched: it encodes the
// same 5 features and optimises the same reward, so it can pick this up and keep going on the rig.
"use strict";
import { runEpisode, makeBlobPolicy, defaultBlobWeights } from "../fx/avatar/blobGravity.js";
import { pathToFileURL } from "node:url";

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const TRAIN_SET = [ { goal: 2.5, energy: 1.0 }, { goal: 3.0, energy: 1.0 }, { goal: 3.5, energy: 1.0 }, { goal: 3.0, energy: 0.7 } ];
const TEST_SET  = [ { goal: 2.2, energy: 0.85 }, { goal: 2.8, energy: 0.55 }, { goal: 3.8, energy: 0.9 }, { goal: 3.2, energy: 0.65 } ];   // never trained on

function evaluate(weights, set, opts = {}) {
    const pol = makeBlobPolicy(weights); let sum = 0;
    for (const c of set) {
        const r = runEpisode(pol, { goal: c.goal, steps: opts.steps || 900, band: 0.45, start: c });
        sum += r.reward;
    }
    return sum / set.length;
}
function clone(w) { return { heat: w.heat.slice(), vent: w.vent.slice(), bias: w.bias.slice() }; }
function perturb(w, sigma, rng) {
    const o = clone(w);
    for (const k of ["heat", "vent", "bias"]) for (let i = 0; i < o[k].length; i++) o[k][i] += gauss(rng) * sigma;
    return o;
}
// (1+1)-ES: keep what wins, widen when winning, narrow when not. Deterministic for a given seed.
function train(opts = {}) {
    const rng = mulberry(opts.seed == null ? 1234 : opts.seed);
    const iters = opts.iters || 260;
    let best = opts.start ? clone(opts.start) : defaultBlobWeights();
    let bestScore = evaluate(best, TRAIN_SET, opts), sigma = opts.sigma || 0.35;
    const history = [{ i: 0, score: bestScore, sigma }];
    for (let i = 1; i <= iters; i++) {
        const cand = perturb(best, sigma, rng), score = evaluate(cand, TRAIN_SET, opts);
        if (score > bestScore) { best = cand; bestScore = score; sigma = Math.min(0.6, sigma * 1.15); }   // winning: look further
        else sigma = Math.max(0.02, sigma * 0.97);                                                        // not: look closer
        if (i % 20 === 0) history.push({ i, score: bestScore, sigma });
    }
    return { weights: best, trainScore: bestScore, history, iters };
}
// Train, then offer the result to the store -- but only ever judged on the HELD-OUT set, so what lands on disk is
// what actually flies, not what memorised the training conditions. Run: node brain/blobTrainer.mjs --save
async function trainAndOffer(opts = {}) {
    const r = train(opts);
    const heldOut = evaluate(r.weights, TEST_SET, opts);          // the only score worth storing
    const sub = { weights: r.weights, score: heldOut, iters: r.iters, by: opts.by || "trainer" };
    // blobPolicyStore is CJS, so Node's interop gives BOTH named exports and a .default. The previous line imported
    // the module twice and picked between shapes with a ternary -- code written by someone unsure what it exported,
    // which is a fair sign it had never been run. It hadn't: see the CLI note at the bottom of this file.
    if (opts.save) {
        const store = await import("./blobPolicyStore.js");
        const s = typeof store.offer === "function" ? store : store.default;
        return { ...r, heldOut, offer: s.offer(sub) };
    }
    return { ...r, heldOut, sub };
}
export { train, evaluate, trainAndOffer, TRAIN_SET, TEST_SET, mulberry };

// ---- v2488: THE CLI THAT THIS FILE HAS BEEN TELLING PEOPLE TO RUN SINCE IT WAS WRITTEN ----------------------
//
// The header says "Run: node brain/blobTrainer.mjs --save". That command did NOTHING. There was no entry point at
// all: node loaded the module, defined these functions, and exited with status 0. Silently. Successfully. The
// --save flag existed as a property of an options object that no code path ever constructed, because nothing ever
// called trainAndOffer(). A documented feature, reachable only by someone who opened the file and wrote their own
// caller -- and the zero exit code meant it never once looked broken.
//
// This is the same failure the v2477 prose pass was about, wearing work boots: prose that promises something the
// code does not do. There it was a comment claiming a property. Here it is a comment claiming a COMMAND.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const argv = process.argv.slice(2);
    const flag = (name) => argv.includes("--" + name);
    const val = (name, d) => { const i = argv.indexOf("--" + name); return i >= 0 && argv[i+1] ? Number(argv[i+1]) : d; };
    const opts = { save: flag("save"), iters: val("iters", 400), seed: val("seed", 12345), by: "cli" };
    console.log("[blobTrainer] training: " + opts.iters + " iterations, seed " + opts.seed + (opts.save ? ", WILL offer to the store" : ", dry run (pass --save to keep it)"));
    const r = await trainAndOffer(opts);
    console.log("[blobTrainer] training score:  " + r.trainScore.toFixed(5) + "   (what it scored on what it studied)");
    console.log("[blobTrainer] HELD-OUT score: " + r.heldOut.toFixed(5) + "   <- the only number that counts");
    console.log("[blobTrainer] iterations used: " + r.iters);
    if (!opts.save) { console.log("[blobTrainer] not saved. Re-run with --save to offer it to the store."); }
    else if (r.offer && r.offer.accepted) console.log("[blobTrainer] ACCEPTED and written to disk. Previous best: " + (r.offer.was === null ? "none" : r.offer.was.toFixed(5)));
    else if (r.offer) console.log("[blobTrainer] offered and REFUSED: " + r.offer.reason + (r.offer.score !== undefined ? " (on disk: " + r.offer.score.toFixed(5) + ", offered: " + r.offer.offered.toFixed(5) + ")" : ""));
    const store = await import("./blobPolicyStore.js");
    const st = (typeof store.serve === "function" ? store : store.default);
    console.log("[blobTrainer] the store now serves: " + st.serve().source + "  (" + st.FILE + ")");
}
