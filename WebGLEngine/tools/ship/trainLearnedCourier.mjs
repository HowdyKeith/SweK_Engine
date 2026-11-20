// WebGLEngine/tools/ship/trainLearnedCourier.mjs -- UNNUMBERED (export-free on purpose: the command; the library is brain/learnedCourier.mjs, held by brain/learnedCourier-selfcheck.mjs)
//   node tools/ship/trainLearnedCourier.mjs [--workers 4] [--write]
// ROUND 11 OF THE SUBMARINE STATIONS (brain/SUB_STATIONS_WIP.md section 27): the registered training -- the (mu, lambda) ES on the TRAIN seeds, then the choice on the SELECTION seeds -- with each fitness split across worker
// threads by seed (each worker returns the sum over its seeds; the total is the same number whatever order they answer in). With --write it freezes the chosen captain to brain/learnedCourier.json. It flies no HELD seed.
"use strict";
import fs from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import * as L from "../../brain/learnedCourier.mjs";

if (!isMainThread) {
    parentPort.on("message", ({ id, theta, seeds }) => parentPort.postMessage({ id, f: L.fitness(theta, seeds) }));
} else {
    const { parseOrExit } = await import("./cliArgs.mjs");
    const cli = parseOrExit("trainLearnedCourier", { values: { "--workers": "number" }, flags: ["--write"] }), n = cli.values["--workers"] || 4, t0 = Date.now();
    const pool = Array.from({ length: n }, () => new Worker(new URL(import.meta.url))), waiting = new Map(); let next = 0;
    for (const w of pool) w.on("message", ({ id, f }) => { waiting.get(id)(f); waiting.delete(id); });
    const ask = (w, theta, seeds) => new Promise((res) => { const id = next++; waiting.set(id, res); w.postMessage({ id, theta, seeds }); });
    let rr = 0;
    const fit = async (theta, seeds) => { const parts = Array.from({ length: n }, (_, k) => seeds.filter((_, i) => i % n === k)).filter((p) => p.length); const fs2 = await Promise.all(parts.map((p) => ask(pool[rr++ % n], theta, p))); return fs2.reduce((a, b) => a + b, 0); };
    console.log(`[trainLearnedCourier] ES mu ${L.ES.mu}, lambda ${L.ES.lambda}, sigma ${L.ES.sigma0} halving every ${L.ES.halveEvery}, ${L.ES.generations} generations, seed ${L.ES.seed}; ${L.TRAIN_SET.length} TRAIN runs; ${n} workers`);
    const { parents, history } = await L.train({ fit, onGen: (h) => console.log(`[trainLearnedCourier] gen ${String(h.gen).padStart(2)}  best ${h.best.toFixed(3)}  sigma ${h.sigma}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`) });
    const chosen = await L.select(parents, { fit });
    console.log(`[trainLearnedCourier] chosen on ${L.SELECTION_SET.length} SELECTION runs: selection fitness ${chosen.selFit.toFixed(3)}, train fitness ${chosen.trainFit.toFixed(3)}`);
    console.log(`[trainLearnedCourier] theta ${JSON.stringify(chosen.theta.map((w) => +w.toFixed(4)))}`);
    if (cli.flags.has("--write")) {
        fs.writeFileSync(new URL("../../brain/learnedCourier.json", import.meta.url), JSON.stringify({ schema: 1, round: 11, registered: "brain/SUB_STATIONS_WIP.md section 27", features: L.FEATURES, es: L.ES, train: L.TRAIN_SET.length, selection: L.SELECTION_SET.length, theta: chosen.theta, trainFit: chosen.trainFit, selFit: chosen.selFit, history }, null, 1) + "\n");
        console.log("[trainLearnedCourier] wrote brain/learnedCourier.json");
    }
    for (const w of pool) await w.terminate();
}
