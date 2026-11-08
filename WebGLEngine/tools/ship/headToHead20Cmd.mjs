// WebGLEngine/tools/ship/headToHead20Cmd.mjs -- the command for tools/ship/headToHead20.mjs (export-free on purpose). Round H20 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead20Cmd.mjs [--parts 4] [--from 20000 --to 20199] [--seconds 160] [--out brain/rig-results]
//   node tools/ship/headToHead20Cmd.mjs --from-json brain/rig-results/head-to-head20.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead20Cmd.mjs --part 2/4 --to-file <path> [--from ... --to ... --seconds ...]     the child's mode: the arms of part 2 of 4 flown, the runs written to <path>
// Reads the eight shipped weight files, flies the 46 arms (dark and lit) in parallel parts, merges, prints and writes <out>/head-to-head20.json.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead20.mjs";
import * as H9 from "./headToHead9.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const readRows = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const loadNets = () => {
    const nets = new Map();
    for (const n of H9.SHIPPED) nets.set("network-" + n, JSON.parse(fs.readFileSync(eng + (n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`), "utf8")).weights);
    return nets;
};
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);

if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null);
    if (!file) { console.error("--part needs --to-file"); process.exit(2); }
    const au = X.audit(loadNets(), { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), au = { dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, nets: loadNets(), laws: [X.LAW_C02.slice(), X.LAW_C04.slice(), X.LAW_H16.slice()] }, lines = X.report(au);
    for (const l of lines) console.log(l);
    const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head20.json"), JSON.stringify({ range: j.range, seconds: j.seconds, report: lines, dark: j.dark, lit: j.lit }));
} else {
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h20-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`));
    console.log(`[h20] flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const au = { dark, lit, range, seconds, nets: loadNets(), laws: [X.LAW_C02.slice(), X.LAW_C04.slice(), X.LAW_H16.slice()] }, lines = X.report(au);
    for (const l of lines) console.log(l);
    const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head20.json"), JSON.stringify({ range, seconds, report: lines, dark, lit }));
}
