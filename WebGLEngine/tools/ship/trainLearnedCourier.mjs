// WebGLEngine/tools/ship/trainLearnedCourier.mjs -- UNNUMBERED (export-free on purpose: the command; the library is brain/learnedCourier.mjs, held by brain/learnedCourier-selfcheck.mjs)
//   node tools/ship/trainLearnedCourier.mjs [--workers 4] [--round 15] [--write]
// 2026-11-20 -- `--round 15` trains ROUND 15 (section 31): the mission value as the fitness, ES seed 9015, round 15's TRAIN and SELECTION sets, frozen to brain/learnedCourierPriced.json. Without it, round 11 as it was.
// ROUND 11 OF THE SUBMARINE STATIONS (brain/SUB_STATIONS_WIP.md section 27): the registered training -- the (mu, lambda) ES on the TRAIN seeds, then the choice on the SELECTION seeds -- with each fitness split across worker
// threads by seed (each worker returns the sum over its seeds; the total is the same number whatever order they answer in). With --write it freezes the chosen captain to brain/learnedCourier.json. It flies no HELD seed.
"use strict";
import fs from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import * as L from "../../brain/learnedCourier.mjs";

if (!isMainThread) {
    parentPort.on("message", ({ id, theta, seeds, priced }) => parentPort.postMessage({ id, f: priced ? L.fitnessPriced(theta, seeds) : L.fitness(theta, seeds) }));
} else {
    const { parseOrExit } = await import("./cliArgs.mjs");
    const cli = parseOrExit("trainLearnedCourier", { values: { "--workers": "number", "--round": "number" }, flags: ["--write"] }), n = cli.values["--workers"] || 4, t0 = Date.now();
    const round = cli.values["--round"] || 11; if (round !== 11 && round !== 15) { console.error(`[trainLearnedCourier] --round is 11 or 15, got ${round}`); process.exit(2); }
    const priced = round === 15, ES = priced ? L.ES15 : L.ES, TRAIN = priced ? L.R15_TRAIN_SET : L.TRAIN_SET, SELECTION = priced ? L.R15_SELECTION_SET : L.SELECTION_SET;
    const pool = Array.from({ length: n }, () => new Worker(new URL(import.meta.url))), waiting = new Map(); let next = 0;
    for (const w of pool) w.on("message", ({ id, f }) => { waiting.get(id)(f); waiting.delete(id); });
    const ask = (w, theta, seeds) => new Promise((res) => { const id = next++; waiting.set(id, res); w.postMessage({ id, theta, seeds, priced }); });
    let rr = 0;
    const fit = async (theta, seeds) => { const parts = Array.from({ length: n }, (_, k) => seeds.filter((_, i) => i % n === k)).filter((p) => p.length); const fs2 = await Promise.all(parts.map((p) => ask(pool[rr++ % n], theta, p))); return fs2.reduce((a, b) => a + b, 0); };
    console.log(`[trainLearnedCourier] round ${round}${priced ? " (the mission value)" : ""}: ES mu ${ES.mu}, lambda ${ES.lambda}, sigma ${ES.sigma0} halving every ${ES.halveEvery}, ${ES.generations} generations, seed ${ES.seed}; ${TRAIN.length} TRAIN runs; ${n} workers`);
    const { parents, history } = await L.train({ seeds: TRAIN, es: ES, fit, onGen: (h) => console.log(`[trainLearnedCourier] gen ${String(h.gen).padStart(2)}  best ${h.best.toFixed(3)}  sigma ${h.sigma}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`) });
    const chosen = await L.select(parents, { seeds: SELECTION, fit });
    console.log(`[trainLearnedCourier] chosen on ${SELECTION.length} SELECTION runs: selection fitness ${chosen.selFit.toFixed(3)}, train fitness ${chosen.trainFit.toFixed(3)}`);
    console.log(`[trainLearnedCourier] theta ${JSON.stringify(chosen.theta.map((w) => +w.toFixed(4)))}`);
    if (cli.flags.has("--write")) {
        const file = priced ? "learnedCourierPriced.json" : "learnedCourier.json";
        fs.writeFileSync(new URL("../../brain/" + file, import.meta.url), JSON.stringify({ schema: 1, round, registered: priced ? "brain/SUB_STATIONS_WIP.md section 31" : "brain/SUB_STATIONS_WIP.md section 27", features: L.FEATURES, es: ES, ...(priced ? { price: L.PRICE } : {}), train: TRAIN.length, selection: SELECTION.length, theta: chosen.theta, trainFit: chosen.trainFit, selFit: chosen.selFit, history }, null, 1) + "\n");
        console.log(`[trainLearnedCourier] wrote brain/${file}`);
    }
    for (const w of pool) await w.terminate();
}
