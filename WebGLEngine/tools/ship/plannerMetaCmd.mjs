// tools/ship/plannerMetaCmd.mjs -- the command for tools/ship/plannerMeta.mjs (export-free on purpose).
//   node tools/ship/plannerMetaCmd.mjs run [--out dir] [--rig dir]   reads the arm files of Rounds 13-17 under brain/rig-results (the twin's and the tuned rule's per-dive scores), adds Round 12's reported block, prints the report, writes <out>/planner-meta-report.json
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as X from "./plannerMeta.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (args[0] !== "run") { console.error("usage: plannerMetaCmd.mjs run [--out dir] [--rig dir]"); process.exit(2); }
const rig = path.resolve(val("--rig", "brain/rig-results")), out = path.resolve(val("--out", "brain/rig-results"));
const read = (dir, arm) => JSON.parse(fs.readFileSync(path.join(rig, dir, arm + ".json"), "utf8"));
const blocks = [{ name: X.ROUND12.name, n: X.ROUND12.n, mean: X.ROUND12.mean, se: X.ROUND12.se }], far = [{ name: X.ROUND12.name, mean: X.ROUND12.far.mean, se: X.ROUND12.far.se }], both = [{ name: X.ROUND12.name, mean: X.ROUND12.both.mean, se: X.ROUND12.both.se }];
for (const s of X.SOURCES) {
    const twin = read(s.dir, s.twin), tuned = read(s.dir, s.tuned);
    for (const set of s.sets) {
        const name = `${s.round}:${set}`;
        blocks.push({ name, ...X.blockOf(twin[set].runs, tuned[set].runs) });
        far.push({ name, ...X.blockOf(twin[set].runs, tuned[set].runs, "far") });
        both.push({ name, ...X.blockOf(twin[set].runs, tuned[set].runs, "both") });
    }
}
const lines = X.report(blocks, { far, both });
for (const l of lines) console.log(l);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "planner-meta-report.json"), JSON.stringify({ blocks, report: lines }, null, 1));
