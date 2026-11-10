// tools/ship/plannerGateCmd.mjs -- the command for tools/ship/plannerGate.mjs (export-free on purpose).
//   node tools/ship/plannerGateCmd.mjs run [--out dir] [--rig dir]   reads the arm files of Rounds 13-17 (training) and Round 20 (test), rebuilds each dive's scenario from its seed and kind, prints the report, writes <out>/planner-gate-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as T from "../../brain/needsTask.mjs";
import * as X from "./plannerGate.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args[0] !== "run") { console.error("usage: plannerGateCmd.mjs run [--out dir] [--rig dir]"); process.exit(2); }
const rig = path.resolve(val("--rig", "brain/rig-results")), out = path.resolve(val("--out", "brain/rig-results"));
const read = (dir, arm) => JSON.parse(fs.readFileSync(path.join(rig, dir, arm + ".json"), "utf8"));
const rowsOf = (src, kinds, use) => {
    const twin = read(src.dir, src.twin), tuned = read(src.dir, src.tuned), rows = [];
    for (const [set, [a, b]] of Object.entries(src.sets)) {
        const scs = T.setOf(kinds, a, b);
        if (scs.length !== twin[set].runs.length || scs.length !== tuned[set].runs.length) throw new Error(`${src.round} ${set}: ${scs.length} scenarios, ${twin[set].runs.length} twin runs, ${tuned[set].runs.length} tuned runs`);
        scs.forEach((sc, i) => { if (!use || use.includes(sc.kind)) rows.push(X.rowOf(sc, twin[set].runs[i], tuned[set].runs[i])); });
    }
    return rows;
};
const train = X.TRAIN.flatMap((s) => rowsOf(s, ["far", "both"], null)), test = rowsOf(X.TEST, X.TEST.kinds, X.TEST.use);
const lines = X.report(train, test);
for (const l of lines) console.log(l);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "planner-gate-report.json"), JSON.stringify({ report: lines }, null, 1));
