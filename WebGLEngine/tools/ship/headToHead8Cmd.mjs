// WebGLEngine/tools/ship/headToHead8Cmd.mjs -- the command for tools/ship/headToHead8.mjs (export-free on purpose). Round H8 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead8Cmd.mjs [--from 8000 --to 8199] [--seconds 160] [--out brain/rig-results]
// Reads the vendored heading-loop circuit, builds the study's two estimators (render/subDropoutScene.mjs pilotDefs), flies the seventeen cells on the ids, prints the report and writes <out>/head-to-head8.json.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead8.mjs";
import * as SC from "../../render/subDropoutScene.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const j = JSON.parse(fs.readFileSync(eng + "vendor/hemibrain/hemibrain-cx-heading-loop.json", "utf8"));
const defs = SC.pilotDefs({ neurons: j.neurons, edges: j.edges, io: j.io }), pick = (id) => { const d = defs.find((x) => x.id === id); if (!d) { console.error(`pilotDefs has no ${id}`); process.exit(2); } return d.build; };
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const au = X.audit({ fly: pick("cx"), er: pick("er") }, { range, seconds }), lines = X.report(au);
for (const l of lines) console.log(l);
const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "head-to-head8.json"), JSON.stringify({ range, seconds, report: lines, runs: au.runs, h4: au.h4 }));
