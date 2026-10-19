// WebGLEngine/tools/trainSubTail.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/trainSubTail.mjs mine  --from <weights.json> --out tail.json [--count 60]
//      node tools/trainSubTail.mjs train --seed N --iters N --from <weights.json> --tail tail.json --out <file.json> [--tailWeight 1]
//
// THE TAIL: the long robust champion (brain/pilotSubWeightsRobustLongWip.json) is better than the PD autopilot on average on the Munk x3 hull but loses its worst 5% (-1.96 against -1.43) and ends a dive the
// autopilot completes. `mine` flies the champion and the autopilot on a MINING range that nothing else uses (nominal 4000-4099, recovery 4000-4299, current 4000-4099 = 500 dives, Munk x3 hull, actuator limits) and
// keeps the `count` dives where the champion does worst against the autopilot (lowest champion score among the dives where it loses). `train` is the multi-vessel (1+1)-ES of trainSubRobust.mjs with one added term:
// the mean score on those tail dives on the Munk x3 hull, times tailWeight. The SAFETY_POOL and every audit set stay out of both steps, so the verdict on them is still a held-out one.
"use strict";
import fs from "node:fs";
import * as P from "../brain/pilotSubPolicy.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as T from "../brain/subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";

const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// base 4000 is the first mining range (the long champion); a second round passes --base 8000 (taken so far: 3000-3599 and 6000-6511 audits, 4000-4299 mining, 5000-5179 evaluation sample)
const BASE = process.argv.includes("--base") ? +process.argv[process.argv.indexOf("--base") + 1] : 4000;
const MINING = [["nominal", range(BASE, BASE + 99)], ["recovery", range(BASE, BASE + 299)], ["current", range(BASE, BASE + 99)]].flatMap(([k, ss]) => ss.map((s) => ({ kind: k, seed: s })));
const E = S.EXPLORER, VARIANTS = [{}, { munk: 3000 }, { munk: 0 }, { finArea: E.finArea * 0.6 }, { bg: E.bg * 2.5 }];
const MODELS = VARIANTS.map((d) => S.createSubModel(Object.freeze({ ...E, ...d }))), MUNK3 = MODELS[1];
const opts = (m) => ({ model: m, actuators: ACTUATORS });
const load = (f) => Float32Array.from(JSON.parse(fs.readFileSync(f, "utf8")).weights);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

if (process.argv[1] && process.argv[1].endsWith("trainSubTail.mjs")) {
    const mode = process.argv[2], from = arg("--from");
    if (mode === "mine") {
        const out = arg("--out"), count = +arg("--count", 60), set = MINING.map((m) => T.scenario(m.seed, m.kind)), w = load(from);
        const r = T.evaluate(P.pilotFor(w), set, opts(MUNK3)), ref = T.evaluate(AS.pilot(), set, opts(MUNK3));
        const rows = r.runs.map((x, i) => ({ kind: set[i].kind, seed: set[i].seed, champion: x.score, autopilot: ref.runs[i].score, status: x.status })).filter((x) => x.champion < x.autopilot).sort((a, b) => a.champion - b.champion).slice(0, count);
        fs.writeFileSync(out, JSON.stringify({ from, mined: set.length, championMean: r.score, autopilotMean: ref.score, ended: r.crashed, tail: rows }));
        console.log(`mined ${set.length} dives on Munk x3: champion ${r.score.toFixed(4)} autopilot ${ref.score.toFixed(4)} (${r.crashed} ended early); kept the ${rows.length} worst: champion ${(rows.reduce((a, x) => a + x.champion, 0) / rows.length).toFixed(3)} vs autopilot ${(rows.reduce((a, x) => a + x.autopilot, 0) / rows.length).toFixed(3)}; kinds ${JSON.stringify(rows.reduce((a, x) => (a[x.kind] = (a[x.kind] || 0) + 1, a), {}))}`);
    } else if (mode === "train") {
        const seed = +arg("--seed", 9300), tailFiles = (arg("--tail") || "").split(","), iters = +arg("--iters", 300), out = arg("--out"), tailW = +arg("--tailWeight", 1), tail = tailFiles.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).tail).map((x) => T.scenario(x.seed, x.kind));   // --tail a.json,b.json trains on the union (a later round keeps the earlier cases so they are not forgotten)
        if (!out || !from) { console.error("usage: node tools/trainSubTail.mjs train --seed N --iters N --from w.json --tail tail.json --out f.json"); process.exit(2); }
        const trainSet = T.TRAIN_SET.filter((_, i) => i % 2 === 0);
        const robust = (w) => MODELS.reduce((a, m) => a + P.evaluate(w, trainSet, opts(m)).score, 0) / MODELS.length, tailScore = (w) => P.evaluate(w, tail, opts(MUNK3)).score;
        const score = (w) => robust(w) + tailW * tailScore(w);
        const rng = mulberry(seed), t0 = Date.now();
        let best = load(from), bestScore = score(best), improved = 0;
        for (let i = 1; i <= iters; i++) {
            const cand = P.mutate(best, 0.3, rng, 4), s = score(cand);
            if (s > bestScore + 1e-9) { best = cand; bestScore = s; improved++; } else if (s >= bestScore - 1e-9) best = cand;
            if (i % 25 === 0) console.error(`seed ${seed} iter ${i} objective ${bestScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
            if (i % 50 === 0) fs.writeFileSync(out + ".ckpt", JSON.stringify({ seed, iter: i, from, objective: bestScore, improved, weights: Array.from(best) }));
        }
        const held = MODELS.reduce((a, m) => a + P.evaluate(best, T.HELD_OUT_SET, opts(m)).score, 0) / MODELS.length;
        fs.writeFileSync(out, JSON.stringify({ seed, iters, from, tailWeight: tailW, objective: bestScore, robustTrain: robust(best), tailScore: tailScore(best), heldScore: held, improved, weights: Array.from(best) }));
        console.log(`seed ${seed} done: objective ${bestScore.toFixed(4)} robust-train ${robust(best).toFixed(4)} tail ${tailScore(best).toFixed(4)} robust-held ${held.toFixed(4)} (${improved} improved)`);
    } else { console.error("usage: node tools/trainSubTail.mjs mine|train ..."); process.exit(2); }
}
