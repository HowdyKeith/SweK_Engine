// WebGLEngine/tools/tuneSubTactics.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/tuneSubTactics.mjs --seed 5000 --iters 150 --out <file.json> [--from <theta.json>] [--actuators]
//
// A (1+1)-ES over the hand tactician's eleven numbers (brain/subTactics.mjs THETA_DEFAULT) against the four scripted drones (patrol, quiet, evader, hunter), scored by brain/subDuel.mjs on TRAIN_SET (24 duels). Each
// mutation moves 1..3 randomly chosen numbers by a gaussian of 10% of their bound range, clipped into the bounds (pingAfter rounded); a child that scores at least its parent replaces it. Deterministic for a seed.
// Writes { seed, iters, from, trainScore, heldScore, theta, history } -- the champion is picked on HELD_OUT_SET by the caller; AUDIT_SET is NOT read here. A checkpoint is written every 10 iterations.
"use strict";
import fs from "node:fs";
import * as D from "../brain/subDuel.mjs";
import * as TA from "../brain/subTactics.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";

const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const seed = +arg("--seed", 5000), iters = +arg("--iters", 150), out = arg("--out"), from = arg("--from"), useAct = process.argv.includes("--actuators");
if (!out) { console.error("usage: node tools/tuneSubTactics.mjs --seed N --iters N --out file.json [--from theta.json] [--actuators]"); process.exit(2); }
const opts = useAct ? { actuators: ACTUATORS } : {};
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const rng = mulberry(seed), score = (th, set = D.TRAIN_SET) => D.evaluate(D.sideHand(th), set, opts).score;
export function mutateTheta(theta, r) {
    const o = { ...theta }, k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) { const name = TA.THETA_NAMES[Math.floor(r() * TA.THETA_NAMES.length)], [lo, hi] = TA.THETA_BOUNDS[name]; o[name] = theta[name] + 0.1 * (hi - lo) * gauss(r); }
    return TA.clampTheta(o);
}
if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1].endsWith("tuneSubTactics.mjs")) {
    const t0 = Date.now();
    let best = from ? TA.clampTheta(JSON.parse(fs.readFileSync(from, "utf8")).theta) : TA.clampTheta(TA.THETA_DEFAULT), bestScore = score(best), improved = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutateTheta(best, rng), s = score(cand);
        if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) best = cand;
        if (i % 10 === 0) { history.push({ i, score: bestScore }); fs.writeFileSync(out + ".ckpt", JSON.stringify({ seed, iter: i, trainScore: bestScore, improved, theta: best })); }
        if (i % 25 === 0) console.error(`seed ${seed} iter ${i} train ${bestScore.toFixed(4)} (${improved} improved, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    const held = score(best, D.HELD_OUT_SET);
    fs.writeFileSync(out, JSON.stringify({ seed, iters, from: from || "default", actuators: useAct, trainScore: bestScore, heldScore: held, improved, theta: best, history }));
    console.log(`seed ${seed} done: train ${bestScore.toFixed(4)} held ${held.toFixed(4)} (${improved} improved)`);
}
