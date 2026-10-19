// WebGLEngine/tools/trainSubWide.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/trainSubWide.mjs --seed N --iters N --from <weights.json> --tail a.json,b.json --out <file.json> [--hard 1] [--tailWeight 1] [--hulls a,b,c] [--levels 0,2,3] [--tailLevel 2]
//
// NOISY SENSES (v4875): --levels names the disturbance levels of tools/subDisturb.mjs (0 clean, 1 good INS and a short link, 2 rough, 3 bad day) the objective is averaged over, for every hull of --hulls (default all
// twelve); --tailLevel is the level the Munk x3 tail term is flown at. With neither flag the objective is the wide round's, bit for bit. The noise seeds are fixed, so a candidate and its parent see the same noise and the
// (1+1)-ES compares them on the same dives; the pilot is NOT told the level.
//
// THE WIDE ROUND. The tail pilot (brain/pilotSubWeightsRobustTail2Wip.json) was trained on five hulls and audited on five; on seven hulls it never saw (tools/subHulls.mjs WIDE) it beats the PD autopilot on five of them
// but fails the Munk x5 hull (14 dives ended that the autopilot completes) and the "awkward" combination hull (26). This is the (1+1)-ES of trainSubTail.mjs with the objective widened to ALL TWELVE hulls on every other
// TRAIN_SET dive, the two failing hulls weighted by --hard (default 1), plus the Munk x3 tail term (the 120 mined dives, so the 3x tail already won is not given back). The SAFETY_POOL and every audit range stay out.
"use strict";
import fs from "node:fs";
import * as P from "../brain/pilotSubPolicy.mjs";
import * as T from "../brain/subTask.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";
import * as H from "./subHulls.mjs";
import * as D from "./subDisturb.mjs";

const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seed = +arg("--seed", 9500), iters = +arg("--iters", 300), out = arg("--out"), from = arg("--from"), hard = +arg("--hard", 1), tailW = +arg("--tailWeight", 1);
if (!out || !from || !arg("--tail")) { console.error("usage: node tools/trainSubWide.mjs --seed N --iters N --from w.json --tail a.json,b.json --out f.json [--hard 3]"); process.exit(2); }
const load = (f) => Float32Array.from(JSON.parse(fs.readFileSync(f, "utf8")).weights);
const HULLS = (arg("--hulls") ? arg("--hulls").split(",") : [...H.TRAINED, ...H.WIDE]), HARD = new Set(["munk5", "awkward"]), WT = HULLS.map((h) => (HARD.has(h) ? hard : 1)), WSUM = WT.reduce((a, b) => a + b, 0);
const MODELS = HULLS.map(H.model), MUNK3 = H.model("munk3"), opts = (m) => ({ model: m, actuators: ACTUATORS });
const trainSet = T.TRAIN_SET.filter((_, i) => i % 2 === 0), tail = arg("--tail").split(",").flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).tail).map((x) => T.scenario(x.seed, x.kind));
const LEVELS = (arg("--levels") ? arg("--levels").split(",").map(Number) : [0]), TAIL_LEVEL = +arg("--tailLevel", 0);
// one dive set at one level: level 0 is the pilot as it always was; a rougher level wraps it in sensor noise and a control delay and flies it in harder water (same seeds for every candidate)
const flown = (w, set, model, L) => (L === 0 ? T.evaluate(P.pilotFor(w), set, opts(model)) : T.evaluate(D.disturbed(P.pilotFor(w), D.LEVELS[L], 77), D.gustySet(set, D.LEVELS[L].gust), opts(model))).score;
const wide = (w) => MODELS.reduce((a, m, i) => a + WT[i] * LEVELS.reduce((q, L) => q + flown(w, trainSet, m, L), 0) / LEVELS.length, 0) / WSUM, tailScore = (w) => flown(w, tail, MUNK3, TAIL_LEVEL);
const score = (w) => wide(w) + tailW * tailScore(w);
const rng = mulberry(seed), t0 = Date.now();
let best = load(from), bestScore = score(best), improved = 0;
console.error(`start objective ${bestScore.toFixed(4)} (wide ${wide(best).toFixed(4)})`);
for (let i = 1; i <= iters; i++) {
    const cand = P.mutate(best, 0.3, rng, 4), s = score(cand);
    if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) best = cand;
    if (i % 25 === 0) console.error(`seed ${seed} iter ${i} objective ${bestScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (i % 25 === 0) fs.writeFileSync(out + ".ckpt", JSON.stringify({ seed, iter: i, from, objective: bestScore, improved, weights: Array.from(best) }));
}
fs.writeFileSync(out, JSON.stringify({ seed, iters, from, hard, tailWeight: tailW, objective: bestScore, wideTrain: wide(best), tailScore: tailScore(best), improved, weights: Array.from(best) }));
console.log(`seed ${seed} done: objective ${bestScore.toFixed(4)} wide-train ${wide(best).toFixed(4)} tail ${tailScore(best).toFixed(4)} (${improved} improved)`);
