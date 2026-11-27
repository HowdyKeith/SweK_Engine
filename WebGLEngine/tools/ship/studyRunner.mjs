#!/usr/bin/env node
// WebGLEngine/tools/ship/studyRunner.mjs -- runs ONE registered study for the Brain Job Repo Report Runner (a `study` job; tools/ship/peerJobs.mjs builds this command line). Export-free on purpose: the registry and
// the comparison are tools/ship/studyJobs.mjs, held by its gate.
//
//   node tools/ship/studyRunner.mjs --study <id> [--workers N] [--dry-run] [--list]
//
// Runs the study's parts (at most --workers at once, default the cores), each logged to rig-out/<id>-part<k>.log. A "replay" study flies into rig-out/<id>-work/ and compares every produced file with its
// committed copy; the produced files are copied flat to rig-out/<id>--<file> and the comparison to rig-out/<id>-report.json, because the peer returns only the flat files of rig-out/. Exit 0 when every part ran
// (the report says IDENTICAL or DIFFERS -- a difference is a finding, not a failed job), 1 when a part failed or a file is missing, 2 for an unknown study or option.
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as SJ from "./studyJobs.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), OUT = path.join(ENG, "rig-out");
const cli = parseOrExit("study-runner", { values: { "--study": "string", "--workers": "string" }, flags: ["--dry-run", "--list"], positional: false });
const say = (l) => console.log(l);

if (cli.flags.has("--list")) { for (const l of SJ.reportLines()) say(l); process.exit(0); }
const id = cli.values["--study"] ?? "", s = SJ.studyOf(id);
if (!s) { console.error(`[study] no study ${JSON.stringify(id)}; known: ${SJ.STUDIES.map((x) => x.id).join(", ")}`); process.exit(2); }
const workers = cli.values["--workers"] === undefined ? os.cpus().length : Number(cli.values["--workers"]);
if (!Number.isInteger(workers) || workers < 1 || workers > 64) { console.error("[study] --workers must be a whole number from 1 to 64"); process.exit(2); }
const work = path.join(OUT, `${id}-work`), plan = SJ.planOf(id, path.relative(ENG, work).replace(/\\/g, "/"));
if (cli.flags.has("--dry-run")) { say(`[study] ${id} (${s.mode}): ${s.what}`); for (const p of plan) say(`  part ${p.k}/${s.parts}: node ${p.argv.join(" ")}`); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
if (fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });   // a replay always starts from an empty scratch folder: it is the whole run or nothing
fs.mkdirSync(work, { recursive: true });
const t0 = Date.now();
say(`[study] ${id} (${s.mode}, ${s.parts} parts, ${Math.min(workers, s.parts)} at once): ${s.what}`);
function runPart(p) {
    return new Promise((resolve) => {
        const log = fs.openSync(path.join(OUT, `${id}-part${p.k}.log`), "w"), t = Date.now();
        say(`[study] ${id} part ${p.k}/${s.parts}: node ${p.argv.join(" ")}`);
        const ch = spawn(process.execPath, p.argv, { cwd: ENG, stdio: ["ignore", log, log] });
        const done = (code) => { fs.closeSync(log); say(`[study] ${id} part ${p.k}/${s.parts} exit ${code} in ${((Date.now() - t) / 1000).toFixed(1)} s`); resolve(code); };
        ch.on("close", (x) => done(x === null ? 1 : x)); ch.on("error", () => done(1));
    });
}
const queue = [...plan], codes = [];
await Promise.all(Array.from({ length: Math.min(workers, s.parts) }, async () => { while (queue.length) { const p = queue.shift(); codes.push(await runPart(p)); } }));
const partsOk = codes.length === s.parts && codes.every((c) => c === 0);

const results = [];
if (s.mode === "replay") {
    for (const f of s.files) {
        const produced = path.join(work, f), committed = path.join(ENG, s.committedDir, f);
        if (!fs.existsSync(produced) || !fs.existsSync(committed)) { results.push(null); say(`[study] ${f}: MISSING (${fs.existsSync(produced) ? "no committed copy" : "not produced"})`); continue; }
        fs.copyFileSync(produced, path.join(OUT, `${id}--${f}`));
        const r = SJ.compareFile(f, fs.readFileSync(produced, "utf8"), fs.readFileSync(committed, "utf8"), s.ignore);
        results.push(r);
        say(`[study] ${f}: ${r.verdict} (${r.same} of ${r.rows} rows the same${r.head ? "" : ", the file head differs"})${r.added.length ? `; fields recorded since, not compared: ${r.added.join(", ")}` : ""}${r.firstDiff ? ` -- first difference at row ${r.firstDiff.index} (seed ${r.firstDiff.seed}, ${r.firstDiff.kind}, arm ${r.firstDiff.arm}): ${r.firstDiff.keys.join(", ")}` : ""}`);
    }
}
const verdict = s.mode === "replay" ? SJ.verdictOf(results) : partsOk ? "FLOWN" : "INCOMPLETE";
const report = { study: id, mode: s.mode, verdict, partsOk, exits: codes, seconds: (Date.now() - t0) / 1000, host: os.hostname(), cpu: (os.cpus()[0] || {}).model || "", cores: os.cpus().length, platform: process.platform, node: process.version, results };
fs.writeFileSync(path.join(OUT, `${id}-report.json`), JSON.stringify(report, null, 1) + "\n");
say(`[study] ${id}: ${verdict}${partsOk ? "" : " -- A PART FAILED"} (${report.seconds.toFixed(0)} s on ${report.cores} cores, node ${report.node}, ${report.platform}); wrote rig-out/${id}-report.json`);
process.exit(partsOk && verdict !== "INCOMPLETE" ? 0 : 1);
