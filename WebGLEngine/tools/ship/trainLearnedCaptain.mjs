// WebGLEngine/tools/ship/trainLearnedCaptain.mjs -- UNNUMBERED (export-free on purpose: the command; the library is brain/learnedCaptain.mjs, held by brain/learnedCaptain-selfcheck.mjs)
//   node tools/ship/trainLearnedCaptain.mjs [--write]
// ROUND 8 OF THE SUBMARINE STATIONS (brain/SUB_STATIONS_WIP.md section 21): the registered training, as registered -- the (mu, lambda) ES on the TRAIN seeds, then the choice among the last parents on the SELECTION seeds. It prints
// each generation and the choice; with --write it freezes the chosen captain to brain/learnedCaptain.json (the file HELD is flown with). It flies no HELD seed.
"use strict";
import fs from "node:fs";
import { parseOrExit } from "./cliArgs.mjs";
import * as L from "../../brain/learnedCaptain.mjs";

const cli = parseOrExit("trainLearnedCaptain", { flags: ["--write"] }), t0 = Date.now();
console.log(`[trainLearnedCaptain] ES mu ${L.ES.mu}, lambda ${L.ES.lambda}, sigma ${L.ES.sigma0} halving every ${L.ES.halveEvery}, ${L.ES.generations} generations, seed ${L.ES.seed}; ${L.TRAIN_SET.length} TRAIN dives`);
const { parents, history } = L.train({ onGen: (h) => console.log(`[trainLearnedCaptain] gen ${String(h.gen).padStart(2)}  best ${h.best.toFixed(3)}  sigma ${h.sigma}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`) });
const chosen = L.select(parents);
console.log(`[trainLearnedCaptain] chosen on ${L.SELECTION_SET.length} SELECTION dives: selection fitness ${chosen.selFit.toFixed(3)}, train fitness ${chosen.trainFit.toFixed(3)}`);
console.log(`[trainLearnedCaptain] theta ${JSON.stringify(chosen.theta.map((w) => +w.toFixed(4)))}`);
if (cli.flags.has("--write")) {
    const out = new URL("../../brain/learnedCaptain.json", import.meta.url);
    fs.writeFileSync(out, JSON.stringify({ schema: 1, round: 8, registered: "brain/SUB_STATIONS_WIP.md section 21", features: L.FEATURES, es: L.ES, train: L.TRAIN_SET.length, selection: L.SELECTION_SET.length, theta: chosen.theta, trainFit: chosen.trainFit, selFit: chosen.selFit, history }, null, 1) + "\n");
    console.log("[trainLearnedCaptain] wrote brain/learnedCaptain.json");
}
