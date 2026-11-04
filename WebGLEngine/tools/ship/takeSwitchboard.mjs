// WebGLEngine/tools/ship/takeSwitchboard.mjs -- UNNUMBERED (export-free on purpose; the library is brain/switchboard.mjs, the gate brain/switchboard-selfcheck.mjs)
//   node tools/ship/takeSwitchboard.mjs survey  [--arms rule-r8,rule-low06,twin-standard] [--from 1344 --to 1346] [--kinds far,both] [--seconds 200] [--sd 0.1]
//   node tools/ship/takeSwitchboard.mjs dropout [--arms autopilot,network-noisy] [--from 0 --to 3] [--seconds 160]
// Flies the named arms on the same scenarios and prints each arm's mean, and for every arm with a control its paired difference against it and the line "BEATS / TIES / IS BELOW its control".
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as B from "../../brain/switchboard.mjs";
const args = process.argv.slice(2), task = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const w = (f) => JSON.parse(fs.readFileSync(eng + f, "utf8")).weights;
const board = B.standardBoard({ noisy: w("brain/pilotSubWeightsRobustNoisyWip.json"), plain: w("brain/pilotSubWeightsWip.json") });
if (!board.tasks.has(task)) { console.error(`usage: takeSwitchboard.mjs ${[...board.tasks.keys()].join("|")} [--arms a,b] [--from n --to n] [--kinds far,both] [--seconds s] [--sd x]`); process.exit(2); }
const layer = board.tasks.get(task).layer, all = [...board.arms.values()].filter((a) => a.layer === layer).map((a) => a.id);
const armIds = val("--arms", task === "survey" ? "rule-r8,rule-low06,twin-standard" : all.join(",")).split(",");
const range = { from: Number(val("--from", task === "survey" ? 1344 : 0)), to: Number(val("--to", task === "survey" ? 1346 : 3)) };
const opts = {}; if (val("--kinds")) opts.kinds = val("--kinds").split(","); if (val("--seconds")) opts.seconds = Number(val("--seconds")); if (val("--sd")) opts.sd = Number(val("--sd"));
for (const l of board.read(board.run(task, armIds, range, opts)).lines) console.log(l);
