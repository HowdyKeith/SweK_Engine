// WebGLEngine/tools/ship/takeSwitchboard.mjs -- UNNUMBERED (export-free on purpose; the library is brain/switchboard.mjs, the gate brain/switchboard-selfcheck.mjs)
//   node tools/ship/takeSwitchboard.mjs survey  [--arms rule-r8,rule-low06,twin-standard] [--from 1344 --to 1346] [--kinds far,both] [--seconds 200] [--sd 0.1]
//   node tools/ship/takeSwitchboard.mjs dropout [--arms autopilot,network-noisy] [--from 0 --to 3] [--seconds 160]
//   node tools/ship/takeSwitchboard.mjs dropout --lesion network-noisy:GFC2[,fish-803:DMV] [--by type|instance (gfc, fish) | type|side|glomerulus (flycx-stateful, flycx-stateless)] [--draws 4] [--seed 1] [--unmatched] [--from 0 --to 11]
//     (brain/lesion.mjs: each named class of each named circuit arm silenced, beside `draws` random sets of its size, every lesion held to its intact arm; flies the intact arm and the lesion arms unless --arms is given,
//      and prints the lesion reading after the board's lines)
// Flies the named arms on the same scenarios and prints each arm's mean, and for every arm with a control its paired difference against it and the line "BEATS / TIES / IS BELOW its control".
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as B from "../../brain/switchboard.mjs";
import * as L from "../../brain/lesion.mjs";
import * as SF from "../../render/subAquariumFish.mjs";
import * as LF from "../../brain/lesionFlyCx.mjs";
const args = process.argv.slice(2), task = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const w = (f) => JSON.parse(fs.readFileSync(eng + f, "utf8")).weights;
const board = B.standardBoard({ noisy: w("brain/pilotSubWeightsRobustNoisyWip.json"), plain: w("brain/pilotSubWeightsWip.json") });
board.addArm(SF.fishArm({ file: JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsFishWip.json", "utf8")) }));
for (const a of LF.flyCxArms({ circuit: JSON.parse(fs.readFileSync(eng + "vendor/hemibrain/hemibrain-cx-heading-loop.json", "utf8")), file: JSON.parse(fs.readFileSync(eng + "brain/pilotSubFlyCxWip.json", "utf8")) })) board.addArm(a);
const lesionIds = [];
for (const spec of (val("--lesion", "") || "").split(",").filter(Boolean)) {
    const [armId, cls] = spec.split(":"), base = board.arms.get(armId), topo = L.topologyOf(base);
    if (!topo || !cls) { console.error(`--lesion ${spec}: name a circuit arm and a class as arm:class (circuit arms: ${[...board.arms.values()].filter((a) => L.topologyOf(a)).map((a) => a.id).join(", ")})`); process.exit(2); }
    const arms = L.lesionArms({ base, topo, className: cls, by: val("--by", "type"), draws: Number(val("--draws", 4)), seed: Number(val("--seed", 1)), matched: !args.includes("--unmatched") });
    for (const a of arms) { board.addArm(a); lesionIds.push(a.id); }
    if (!lesionIds.includes(armId)) lesionIds.unshift(armId);
}
if (!board.tasks.has(task)) { console.error(`usage: takeSwitchboard.mjs ${[...board.tasks.keys()].join("|")} [--arms a,b] [--from n --to n] [--kinds far,both] [--seconds s] [--sd x]`); process.exit(2); }
const layer = board.tasks.get(task).layer, all = [...board.arms.values()].filter((a) => a.layer === layer).map((a) => a.id);
const armIds = val("--arms", task === "survey" ? "rule-r8,rule-low06,twin-standard" : lesionIds.length ? [...new Set(lesionIds)].join(",") : all.filter((id) => !id.includes("~")).join(",")).split(",");
const range = { from: Number(val("--from", task === "survey" ? 1344 : 0)), to: Number(val("--to", task === "survey" ? 1346 : 3)) };
const opts = {}; if (val("--kinds")) opts.kinds = val("--kinds").split(","); if (val("--seconds")) opts.seconds = Number(val("--seconds")); if (val("--sd")) opts.sd = Number(val("--sd"));
const res = board.run(task, armIds, range, opts);
for (const l of board.read(res).lines) console.log(l);
const les = L.lesionReading(board, res).lines;
if (les.length) { console.log("\nLESIONS:"); for (const l of les) console.log(l); }
