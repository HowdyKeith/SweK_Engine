// tools/ship/tuneWideCmd.mjs -- the command for tools/ship/tuneWide.mjs (export-free on purpose).
//   node tools/ship/tuneWideCmd.mjs search <index> [--r8 file] [--out dir]    one ES search (0..2) from the Round 8 champion -> <dir>/wide-search-<index>.json
//   node tools/ship/tuneWideCmd.mjs finish [--r8 file] [--out dir]            picks the champion on validation, THEN flies the audits once and the robustness runs; writes <dir>/wide-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./tuneWide.mjs";
const args = process.argv.slice(2), cmd = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, dir = path.resolve(val("--out", "brain/rig-results"));
const r8 = JSON.parse(fs.readFileSync(path.resolve(val("--r8", "brain/rig-results/tune-report.json")), "utf8")).params;
fs.mkdirSync(dir, { recursive: true });
const file = (i) => path.join(dir, `wide-search-${i}.json`);
if (cmd === "search") {
    const i = Number(args[1]); if (!(i >= 0 && i < X.RECIPE.runs)) { console.error("search index 0.." + (X.RECIPE.runs - 1)); process.exit(2); }
    const r = X.search(X.SEARCH_BASE + i, r8);
    fs.writeFileSync(file(i), JSON.stringify({ seed: r.seed, bestScore: r.bestScore, best: r.best, checkpoints: r.checkpoints }));
    console.log(`search ${i} (seed ${r.seed}): train ${r.bestScore.toFixed(4)}, best ${JSON.stringify(r.best)}`);
} else if (cmd === "finish") {
    const searches = Array.from({ length: X.RECIPE.runs }, (_, i) => JSON.parse(fs.readFileSync(file(i), "utf8")));
    const champ = X.champion(searches, r8);
    console.log(`champion chosen on validation: ${champ.from} iter ${champ.iter}, validation ${champ.validation.toFixed(4)} (Round 8 champion ${champ.startValidation.toFixed(4)}); flying the audits once`);
    const opts = { r8, wide: champ.params }, au = X.audits(opts), rob = X.robustness(opts), lines = X.report(au, rob, champ, searches, { r8 });
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "wide-report.json"), JSON.stringify({ params: champ.params, from: champ.from, iter: champ.iter, validation: champ.validation, startValidation: champ.startValidation, report: lines }, null, 1));
} else { console.error("usage: tuneWideCmd.mjs search <i> | finish"); process.exit(2); }
