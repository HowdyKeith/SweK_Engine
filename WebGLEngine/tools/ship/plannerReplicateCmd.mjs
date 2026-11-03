// tools/ship/plannerReplicateCmd.mjs -- the command for tools/ship/plannerReplicate.mjs (export-free on purpose).
//   node tools/ship/plannerReplicateCmd.mjs run [--r8 file] [--out dir]    flies the arms once on the 288 fresh dives (about 15 minutes), prints the report, writes <dir>/planner-replicate-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./plannerReplicate.mjs";
import * as T from "../../brain/needsTask.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args[0] !== "run") { console.error("usage: plannerReplicateCmd.mjs run [--r8 file] [--out dir]"); process.exit(2); }
const r8 = JSON.parse(fs.readFileSync(path.resolve(val("--r8", "brain/rig-results/tune-report.json")), "utf8")).params, dir = path.resolve(val("--out", "brain/rig-results"));
fs.mkdirSync(dir, { recursive: true });
const opts = { r8 }, au = X.audits(opts), plans = X.plansOf(opts, T.setOf(X.HARD, X.SET_RANGES.Z1[0], X.SET_RANGES.Z1[0] + 5)), lines = X.report(au, { plans });
for (const l of lines) console.log(l);
fs.writeFileSync(path.join(dir, "planner-replicate-report.json"), JSON.stringify({ r8, report: lines }, null, 1));
