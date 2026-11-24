// WebGLEngine/tools/trainSubRobust.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/trainSubRobust.mjs --seed 8000 --iters 200 --out <file.json> [--from <weights.json>] [--actuators] [--circuit fly|plain14]
//
// --circuit (2026-11-08, for brain/PLAIN14_ROBUST_STAGE_WIP.md): which policy is searched. `fly` (the default, and every committed network) is brain/pilotSubPolicy.mjs, the Giant Fiber Circuit; `plain14` is the 14-50-4 relu net of
// brain/pilotSubPlain.mjs, made by the same createSubPolicy so it has the same evaluate/mutate/handWeights/pilotFor. With no flag, or --circuit fly, nothing changes: the same numbers and the same output file, byte for byte;
// a plain14 run adds `circuit` to its output.
//
// A (1+1)-ES for the submarine pilot (brain/pilotSubPolicy.mjs) that scores each candidate on SEVERAL VESSELS, not one: the nominal EXPLORER and four variants of it (a hull three times as unstable in yaw and
// pitch -- the Munk moment -- and one with none; fins 40% smaller; a righting moment 2.5 times larger), averaged. The pilot trained on the nominal vessel alone fails on the Munk x3 hull (round 2 of the
// submarine work measured it: -0.58 against the autopilot's -0.45, then -0.84 after the actuator retrain); this is the "domain randomisation" answer, and whether it works is measured, not assumed.
// The set it trains on is every other scenario of TRAIN_SET (20 dives) so one iteration is 100 dives (~3 s). Deterministic for a seed. Writes { seed, iters, trainScore, heldScore, weights } for the champion pick.
"use strict";
import fs from "node:fs";
import * as FLY from "../brain/pilotSubPolicy.mjs";
import * as T from "../brain/subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";

const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const seed = +arg("--seed", 8000), iters = +arg("--iters", 200), out = arg("--out"), from = arg("--from"), useAct = process.argv.includes("--actuators"), circuit = arg("--circuit", "fly");
if (!out || (circuit !== "fly" && circuit !== "plain14")) { console.error("usage: node tools/trainSubRobust.mjs --seed N --iters N --out file.json [--from weights.json] [--actuators] [--circuit fly|plain14]"); process.exit(2); }
const P = circuit === "plain14" ? (await import("../brain/pilotSubPlain.mjs")).PLAIN14 : FLY;
const E = S.EXPLORER, VARIANTS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }];
export const MODELS = VARIANTS.map((d) => S.createSubModel(Object.freeze({ ...E, ...d })));
const trainSet = T.TRAIN_SET.filter((_, i) => i % 2 === 0), opts = (m) => ({ model: m, ...(useAct ? { actuators: ACTUATORS } : {}) });
const score = (w) => MODELS.reduce((a, m) => a + P.evaluate(w, trainSet, opts(m)).score, 0) / MODELS.length;
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rng = mulberry(seed), t0 = Date.now();
let best = from ? Float32Array.from(JSON.parse(fs.readFileSync(from, "utf8")).weights) : P.handWeights(), bestScore = score(best), improved = 0;
for (let i = 1; i <= iters; i++) {
    const cand = P.mutate(best, 0.3, rng, 4), s = score(cand);
    if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) best = cand;
    if (i % 50 === 0) console.error(`seed ${seed} iter ${i} robust-train ${bestScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (i % 100 === 0) fs.writeFileSync(out + ".ckpt", JSON.stringify({ seed, iter: i, from: from || "hand", actuators: useAct, ...(circuit === "fly" ? {} : { circuit }), trainScore: bestScore, improved, weights: Array.from(best) }));   // a lost container loses at most 100 iterations
}
const held = MODELS.reduce((a, m) => a + P.evaluate(best, T.HELD_OUT_SET, opts(m)).score, 0) / MODELS.length;
fs.writeFileSync(out, JSON.stringify({ seed, iters, from: from || "hand", actuators: useAct, ...(circuit === "fly" ? {} : { circuit }), trainScore: bestScore, heldScore: held, improved, weights: Array.from(best) }));
console.log(`seed ${seed} done: robust-train ${bestScore.toFixed(4)} robust-held ${held.toFixed(4)} (${improved} improved)`);
