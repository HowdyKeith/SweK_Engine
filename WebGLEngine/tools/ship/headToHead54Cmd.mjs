// WebGLEngine/tools/ship/headToHead54Cmd.mjs -- the command for tools/ship/headToHead54.mjs (export-free on purpose). Round H54 of brain/HEAD_TO_HEAD.md. THERE IS NO FLIGHT MODE AND NO SEARCH MODE: the round reads H48's stored runs.
//   node tools/ship/headToHead54Cmd.mjs read [--in brain/rig-results/head-to-head48.json] [--out brain/rig-results]     the report of H48's stored runs cut by difficulty; writes head-to-head54.json (the report lines)
// Reads H48's stored result (head-to-head48.json: the autopilot's and the eight networks' dark and lit runs on ids 53000-53799), re-assembles it as H48's library reads it (the stored networks from H32's and H34's stored searches, the means recomputed from the raw runs) and refuses a smoke result. Nothing of H48's is written.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead54.mjs";
import * as X48 from "./headToHead48.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RR = eng + "brain/rig-results/";
const readRows = (f) => fs.readFileSync(RR + f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const stored = () => ({ S02: readRows("head-to-head32-search.jsonl").filter((r) => r.group === "S02"), T02: readRows("head-to-head34-search.jsonl").filter((r) => r.group === "T02") });
const meansOf = (dark, lit) => Object.fromEntries(Object.keys(dark).map((a) => { let t = 0; for (let i = 0; i < dark[a].length; i++) { const pd = dark[a][i].bad ? 0 : dark[a][i].score, pl = lit[a][i].bad ? 0 : lit[a][i].score; t += 0.5 * (pd + pl) - 0.02 * 0.5 * (dark[a][i].watts + lit[a][i].watts) / 1000; } return [a, t / dark[a].length]; }));
if (args[0] === "read") {
    const inFile = path.resolve(val("--in", RR + "head-to-head48.json"));
    if (!fs.existsSync(inFile)) { console.error(`no H48 result at ${inFile} (H48 must be flown first)`); process.exit(2); }
    const j = JSON.parse(fs.readFileSync(inFile, "utf8"));
    if (j.smoke) { console.error("H48's stored result is a SMOKE result: this round refuses it"); process.exit(2); }
    const rows = stored(), nets = X48.netsOf(rows), au = { dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, nets, rows, fixture: j.fixture, means: meansOf(j.dark, j.lit) };
    const lines = X.report(au); for (const l of lines) console.log(l);
    const out = path.resolve(val("--out", RR)); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head54.json"), JSON.stringify({ range: au.range, seconds: au.seconds, report: lines }));
} else { console.error("usage: read [--in <H48 json>] [--out <dir>]   (see the header; there is no flight and no search mode)"); process.exit(2); }
