// WebGLEngine/tools/ship/headToHeadCmd.mjs -- the command for tools/ship/headToHead.mjs (export-free on purpose). Round H1 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHeadCmd.mjs [--from 2000 --to 2199] [--seconds 160] [--out brain/rig-results]
// Reads the eight weight files and the hand weights, flies the ten arms dark and lit on the ids, prints the report and writes <out>/head-to-head.json.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const weights = { hand: Array.from(PS.handWeights()) };
for (const n of X.NETWORK_NAMES) {
    const f = n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`, w = JSON.parse(fs.readFileSync(eng + f, "utf8")).weights;
    if (!Array.isArray(w) || w.length !== 963) { console.error(`${f}: not 963 weights`); process.exit(2); }
    weights[n] = w;
}
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const au = X.audit(weights, { range, seconds }), lines = X.report(au);
for (const l of lines) console.log(l);
const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "head-to-head.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit }));
