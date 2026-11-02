// tools/ship/stationRoundCmd.mjs -- the command for tools/ship/stationRound.mjs (export-free on purpose).
//   node tools/ship/stationRoundCmd.mjs search <index> [--r8 file] [--out dir]    one ES search (0..2) -> <dir>/station-search-<index>.json (three can run in parallel)
//   node tools/ship/stationRoundCmd.mjs finish [--r8 file] [--out dir]            picks the champion and the control on validation, THEN flies the audits once and the oracle; writes <dir>/station-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./stationRound.mjs";
import * as T from "../../brain/needsTask.mjs";
const args = process.argv.slice(2), cmd = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, dir = path.resolve(val("--out", "brain/rig-results"));
const r8 = JSON.parse(fs.readFileSync(path.resolve(val("--r8", "brain/rig-results/tune-report.json")), "utf8")).params;
fs.mkdirSync(dir, { recursive: true });
const file = (i) => path.join(dir, `station-search-${i}.json`);
if (cmd === "search") {
    const i = Number(args[1]); if (!(i >= 0 && i < X.RECIPE.runs)) { console.error("search index 0.." + (X.RECIPE.runs - 1)); process.exit(2); }
    const r = X.search(X.SEARCH_BASE + i, r8);
    fs.writeFileSync(file(i), JSON.stringify({ seed: r.seed, bestScore: r.bestScore, checkpoints: r.checkpoints.map((c) => ({ iter: c.iter, trainScore: c.trainScore, weights: Array.from(c.weights) })) }));
    console.log(`search ${i} (seed ${r.seed}): train ${r.bestScore.toFixed(4)} (start ${r.trace[0].toFixed(4)})`);
} else if (cmd === "finish") {
    const searches = Array.from({ length: X.RECIPE.runs }, (_, i) => JSON.parse(fs.readFileSync(file(i), "utf8")));
    const champ = X.champion(searches, r8), lin = X.tuneLinear(r8);
    console.log(`champion chosen on validation: ${champ.from} iter ${champ.iter}, validation ${champ.validation.toFixed(4)} (start ${champ.startValidation.toFixed(4)}); constant preference a ${lin.lin.a} b ${lin.lin.b} (${lin.validation.toFixed(4)}); flying the audits once`);
    const opts = { r8, weights: Array.from(champ.weights), lin: lin.lin }, au = X.audits(opts);
    const switches = X.switchesOf(opts, T.setOf(X.HARD, X.AUDIT_RANGES.X1[0], X.AUDIT_RANGES.X1[1])), lines = X.report(au, champ, lin, searches, { switches });
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "station-report.json"), JSON.stringify({ from: champ.from, iter: champ.iter, validation: champ.validation, startValidation: champ.startValidation, weights: opts.weights, lin: lin.lin, linCurve: lin.curve, report: lines }, null, 1));
} else { console.error("usage: stationRoundCmd.mjs search <i> | finish"); process.exit(2); }
