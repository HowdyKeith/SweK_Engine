// tools/ship/tuneRuleCmd.mjs -- the command for tools/ship/tuneRule.mjs (export-free on purpose).
//   node tools/ship/tuneRuleCmd.mjs search <index> [--out dir]                 one ES search (0..2) -> <dir>/tune-search-<index>.json (three can run in parallel)
//   node tools/ship/tuneRuleCmd.mjs finish [--champion file] [--out dir]       picks the champion on validation, THEN flies the audits once and the robustness runs, prints the report, writes <dir>/tune-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./tuneRule.mjs";
const args = process.argv.slice(2), cmd = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, dir = path.resolve(val("--out", "brain/rig-results"));
fs.mkdirSync(dir, { recursive: true });
const file = (i) => path.join(dir, `tune-search-${i}.json`);
if (cmd === "search") {
    const i = Number(args[1]); if (!(i >= 0 && i < X.RECIPE.runs)) { console.error("search index 0.." + (X.RECIPE.runs - 1)); process.exit(2); }
    const r = X.search(X.SEARCH_BASE + i);
    fs.writeFileSync(file(i), JSON.stringify({ seed: r.seed, bestScore: r.bestScore, best: r.best, checkpoints: r.checkpoints }));
    console.log(`search ${i} (seed ${r.seed}): train ${r.bestScore.toFixed(4)}, best ${JSON.stringify(r.best)}`);
} else if (cmd === "finish") {
    const searches = Array.from({ length: X.RECIPE.runs }, (_, i) => JSON.parse(fs.readFileSync(file(i), "utf8")));
    const champ = X.champion(searches), residual = JSON.parse(fs.readFileSync(path.resolve(val("--champion", "brain/rig-results/residual-champion.json")), "utf8"));
    console.log(`champion chosen on validation: ${champ.from} iter ${champ.iter}, validation ${champ.validation.toFixed(4)} (defaults ${champ.startValidation.toFixed(4)}); flying the audits once`);
    const opts = { params: champ.params, champion: residual.weights }, au = X.audits(opts), rob = X.robustness(opts), lines = X.report(au, rob, champ, searches);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "tune-report.json"), JSON.stringify({ params: champ.params, from: champ.from, iter: champ.iter, validation: champ.validation, startValidation: champ.startValidation, report: lines }, null, 1));
} else { console.error("usage: tuneRuleCmd.mjs search <i> | finish"); process.exit(2); }
