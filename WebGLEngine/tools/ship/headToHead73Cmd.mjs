// WebGLEngine/tools/ship/headToHead73Cmd.mjs -- the command for tools/ship/headToHead73.mjs (export-free on purpose). Round H73 of brain/HEAD_TO_HEAD.md. There is NO search: the networks are the stored 1800-iteration weights of H32's, H34's and H45's searches, perturbed here.
//   node tools/ship/headToHead73Cmd.mjs fly [--parts 4] [--from 93200 --to 93399] [--chunk 50] [--out brain/rig-results] [--smoke]     the 39 arms flown dark and lit on the ids, ONE CHUNK OF IDS AT A TIME (head-to-head73-c<k>.json, written as each finishes; a rerun resumes at the chunk it stopped on); the report; head-to-head73.json
//   node tools/ship/headToHead73Cmd.mjs fly --from-json brain/rig-results/head-to-head73.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead73Cmd.mjs --part 2/4 --sets-file <path> --to-file <path>     the child's mode of fly
// `--smoke` flies four ids in chunks of two at 40 s into a temporary directory and marks its file; `--from-json` refuses such a file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead73.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), RR = eng + "brain/rig-results/";
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const readJ = (f) => JSON.parse(fs.readFileSync(RR + f, "utf8"));
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const h27Sets = () => ({ laws: [readJ("head-to-head27.json").fresh.laws[2]] });
const storedRows = () => ({ S02: readRows(RR + "head-to-head32-search.jsonl").filter((r) => r.group === "S02"), T02: readRows(RR + "head-to-head34-search.jsonl").filter((r) => r.group === "T02"), N72: readRows(RR + "head-to-head45-search.jsonl").filter((r) => r.group === "N72") });
const range = smoke ? { from: X.IDS.from, to: X.IDS.from + 3 } : { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = smoke ? 40 : X.SECONDS, chunk = smoke ? 2 : Number(val("--chunk", 50));
const armsOfPart = (champs, p, P) => X.armIdsOf(champs).filter((a, i) => a === "autopilot" || i % P === p);
const outDir = () => (smoke ? path.join(os.tmpdir(), "h73-smoke-out") : path.resolve(val("--out", RR)));
const build = (flight, rows) => { const nets = X.netsOf(rows), champs = X.championsOf(rows); return { dark: flight.dark, lit: flight.lit, reads: 1, range, rows, nets, champs, perturbed: X.perturbedOf(champs, nets), h27: h27Sets(), original: { search: readRows(RR + "head-to-head27-search.jsonl") }, wip: loadWip(), c02: X.LAW_C02.slice(), fixture: X.fixtureOf() }; };
const finish = (au) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    const out = outDir(); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head73.json"), JSON.stringify({ smoke, range, dark: au.dark, lit: au.lit, report: lines }));
};
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const j = JSON.parse(fs.readFileSync(sf, "utf8"));
    const nets = X.netsOf(j.rows), champs = X.championsOf(j.rows);
    fs.writeFileSync(file, JSON.stringify(X.fly(j.h27, nets, champs, X.perturbedOf(champs, nets), { range: j.range, seconds: j.seconds, arms: armsOfPart(champs, p, P) })));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    if (j.smoke) { console.error("the stored flight is a SMOKE flight: not reported as a result"); process.exit(2); }
    range.from = j.range.from; range.to = j.range.to;
    finish(build({ dark: j.dark, lit: j.lit }, storedRows()));
} else if (args[0] === "fly") {
    const rows = storedRows(); try { X.netsOf(rows); X.championsOf(rows); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const parts = Number(val("--parts", 4)), out = outDir(); fs.mkdirSync(out, { recursive: true });
    const dark = {}, lit = {}, add = (into, d) => { for (const [a, runs] of Object.entries(d)) into[a] = (into[a] || []).concat(runs); };
    for (let from = range.from, k = 0; from <= range.to; from += chunk, k++) {
        const to = Math.min(from + chunk - 1, range.to), cr = { from, to }, cf = path.join(out, `head-to-head73-c${k}.json`);
        if (fs.existsSync(cf)) { const d = JSON.parse(fs.readFileSync(cf, "utf8")); if (d.range && d.range.from === from && d.range.to === to && d.seconds === seconds && d.dark && d.lit) { add(dark, d.dark); add(lit, d.lit); console.log(`[h73] chunk ${k} (ids ${from}-${to}): found ${cf}, not flying it again`); continue; } console.log(`[h73] chunk ${k}: ${cf} does not match this run, flying it again`); }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h73-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
        fs.writeFileSync(sfile, JSON.stringify({ h27: h27Sets(), rows, range: cr, seconds }));
        console.log(`[h73] chunk ${k}: flying 39 arms on ids ${from}-${to} at ${seconds} s, dark and lit, in ${parts} parts${smoke ? " (SMOKE)" : ""}`);
        const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => { const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f], { stdio: ["ignore", "inherit", "inherit"] }); child.on("close", resolve); })));
        if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
        const cd = {}, cl = {};
        for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in cd)) cd[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in cl)) cl[a] = runs; }
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.writeFileSync(cf, JSON.stringify({ range: cr, seconds, dark: cd, lit: cl }));
        add(dark, cd); add(lit, cl);
    }
    if (smoke) console.log("SMOKE flight: the plumbing only; the report below is not a result");
    finish(build({ dark, lit }, rows));
} else { console.error("usage: fly [--from-json file] [--parts 4] [--chunk 100] [--smoke]   (see the header)"); process.exit(2); }
