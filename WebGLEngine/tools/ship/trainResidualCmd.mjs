// tools/ship/trainResidualCmd.mjs -- the command for tools/ship/trainResidual.mjs (export-free on purpose).
//   node tools/ship/trainResidualCmd.mjs search <index> [--out dir]   one ES search (index 0..2), writes <dir>/residual-search-<index>.json (safe to run three in parallel)
//   node tools/ship/trainResidualCmd.mjs finish [--out dir]           picks the champion on validation from the search files, THEN flies the audits once, prints the report, writes residual-champion.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./trainResidual.mjs";
const args = process.argv.slice(2), cmd = args[0], oi = args.indexOf("--out"), dir = path.resolve(oi >= 0 ? args[oi + 1] : "brain/rig-results");
fs.mkdirSync(dir, { recursive: true });
const file = (i) => path.join(dir, `residual-search-${i}.json`);
if (cmd === "search") {
    const i = Number(args[1]); if (!(i >= 0 && i < X.RECIPE.runs)) { console.error("search index 0.." + (X.RECIPE.runs - 1)); process.exit(2); }
    const r = X.search(X.SEARCH_BASE + i);
    fs.writeFileSync(file(i), JSON.stringify({ seed: r.seed, bestScore: r.bestScore, moved: r.moved, checkpoints: r.checkpoints.map((c) => ({ iter: c.iter, trainScore: c.trainScore, weights: Array.from(c.weights) })) }));
    console.log(`search ${i} (seed ${r.seed}): train ${r.bestScore.toFixed(4)}, ${r.moved} weights moved, ${r.checkpoints.length} checkpoints`);
} else if (cmd === "finish") {
    const searches = Array.from({ length: X.RECIPE.runs }, (_, i) => JSON.parse(fs.readFileSync(file(i), "utf8"))).map((s) => ({ ...s, checkpoints: s.checkpoints.map((c) => ({ ...c, weights: Float64Array.from(c.weights) })) }));
    const champ = X.champion(searches);
    console.log(`champion chosen on validation: ${champ.from} iter ${champ.iter}, validation ${champ.validation.toFixed(4)} (start ${champ.startValidation.toFixed(4)}); flying the audits once`);
    const au = X.audits(champ.weights), lines = X.report(au, champ, searches);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "residual-champion.json"), JSON.stringify({ from: champ.from, iter: champ.iter, validation: champ.validation, startValidation: champ.startValidation, weights: Array.from(champ.weights), report: lines }, null, 1));
} else { console.error("usage: trainResidualCmd.mjs search <i> | finish [--out dir]"); process.exit(2); }
