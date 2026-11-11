// WebGLEngine/tools/ship/headToHead62Cmd.mjs -- the command for tools/ship/headToHead62.mjs (export-free on purpose). Round H62 of brain/HEAD_TO_HEAD.md. There is NO search: the networks are the stored 1800-iteration weights of H32's and H34's searches.
//   node tools/ship/headToHead62Cmd.mjs fly [--parts 4] [--from 900000 --to 900199] [--seconds 160] [--out brain/rig-results] [--smoke]     the twelve arms flown dark and lit on the far ids, the report, head-to-head62.json
//   node tools/ship/headToHead62Cmd.mjs fly --from-json brain/rig-results/head-to-head62.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead62Cmd.mjs --part 2/4 --sets-file <path> --to-file <path> [--from ... --to ... --seconds ...]     the child's mode of fly
// `--smoke` flies two ids at 40 s, writes only to a temporary directory and marks its file; `--from-json` refuses such a file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead62.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), RR = eng + "brain/rig-results/";
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const readJ = (f) => JSON.parse(fs.readFileSync(RR + f, "utf8"));
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const h27Sets = () => ({ laws: [readJ("head-to-head27.json").fresh.laws[2]] });
const storedRows = () => ({ S02: readRows(RR + "head-to-head32-search.jsonl").filter((r) => r.group === "S02"), T02: readRows(RR + "head-to-head34-search.jsonl").filter((r) => r.group === "T02") });
const seconds = smoke ? 40 : Number(val("--seconds", X.SECONDS));
const range = smoke ? { from: X.IDS.from, to: X.IDS.from + 1 } : { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) };
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const outDir = () => (smoke ? path.join(os.tmpdir(), "h62-smoke-out") : path.resolve(val("--out", RR)));
const build = (flights, rows) => ({ dark: flights.dark, lit: flights.lit, range, seconds, rows, old: X.netsOf(rows), h27: h27Sets(), original: { search: readRows(RR + "head-to-head27-search.jsonl") }, wip: loadWip(), c02: X.LAW_C02.slice(), fixture: X.fixtureOf() });
const finish = (au) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    const out = outDir(); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head62.json"), JSON.stringify({ smoke, range, seconds, dark: au.dark, lit: au.lit, report: lines }));
};
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const j = JSON.parse(fs.readFileSync(sf, "utf8"));
    fs.writeFileSync(file, JSON.stringify(X.fly(j.h27, X.netsOf(j.rows), { range: j.range, seconds: j.seconds, arms: armsOfPart(p, P) })));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    if (j.smoke) { console.error("the stored flight is a SMOKE flight: not reported as a result"); process.exit(2); }
    const rows = storedRows(); range.from = j.range.from; range.to = j.range.to;
    finish(build({ dark: j.dark, lit: j.lit }, rows));
} else if (args[0] === "fly") {
    const rows = storedRows(); try { X.netsOf(rows); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h62-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ h27: h27Sets(), rows, range, seconds }));
    console.log(`[h62] flying ${X.ARM_IDS.length} arms on the far ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts${smoke ? " (SMOKE)" : ""}`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => { const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f], { stdio: ["ignore", "inherit", "inherit"] }); child.on("close", resolve); })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    if (smoke) console.log("SMOKE flight: the plumbing only; the report below is not a result");
    finish(build({ dark, lit }, rows));
} else { console.error("usage: fly [--from-json file] [--parts 4] [--smoke]   (see the header)"); process.exit(2); }
