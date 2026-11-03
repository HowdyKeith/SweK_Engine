// tools/ship/constShiftCmd.mjs -- the command for tools/ship/constShift.mjs (export-free on purpose).
//   node tools/ship/constShiftCmd.mjs run [--champion file] [--out dir]   tunes the constant on validation, THEN flies the audits once, prints the report, writes <dir>/constShift-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./constShift.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args[0] !== "run") { console.error("usage: constShiftCmd.mjs run [--champion file] [--out dir]"); process.exit(2); }
const champFile = path.resolve(val("--champion", "brain/rig-results/residual-champion.json")), dir = path.resolve(val("--out", "brain/rig-results"));
const champ = JSON.parse(fs.readFileSync(champFile, "utf8"));
const tuning = X.tune();
console.log(`tuned on validation: shift ${tuning.shift.toFixed(2)}; flying the audits once`);
const au = X.audits({ champion: champ.weights, tuned: tuning.shift });
const lines = X.report(au, tuning, `champion = ${champ.from} iteration ${champ.iter}`);
for (const l of lines) console.log(l);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "constShift-report.json"), JSON.stringify({ tuned: tuning.shift, curve: tuning.curve, report: lines }, null, 1));
