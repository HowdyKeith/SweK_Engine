// WebGLEngine/tools/ship/headToHead9Cmd.mjs -- the command for tools/ship/headToHead9.mjs (export-free on purpose). Round H9 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead9Cmd.mjs [--h7 brain/rig-results/head-to-head7-training.jsonl] [--from 9000 --to 9199] [--seconds 160] [--out brain/rig-results]
// Reads the eight shipped weight files and H7's twenty champions, flies the 59 arms (each network intact and with its recurrent core off) dark and lit, prints the report and writes <out>/head-to-head9.json.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead9.mjs";
import * as H7 from "./headToHead7.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const nets = new Map();
for (const n of X.SHIPPED) nets.set("network-" + n, JSON.parse(fs.readFileSync(eng + (n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`), "utf8")).weights);
const h7 = path.resolve(val("--h7", eng + "brain/rig-results/head-to-head7-training.jsonl"));
if (!fs.existsSync(h7)) { console.error(`no H7 training file at ${h7}`); process.exit(2); }
const rows = fs.readFileSync(h7, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (rows.some((r) => r.smoke)) { console.error("the H7 training file holds SMOKE records"); process.exit(2); }
for (const rc of H7.RECIPES) for (let r = 0; r < H7.REPLICATES; r++) { try { nets.set(`${rc}-${r}`, H7.championOf(rc, r, rows.filter((o) => o.recipe === rc && o.rep === r)).weights); } catch (e) { console.error(String(e.message)); process.exit(2); } }
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const au = X.audit(nets, { range, seconds }), lines = X.report(au);
for (const l of lines) console.log(l);
const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "head-to-head9.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit }));
