// tools/ship/plannerFineCmd.mjs -- the command for tools/ship/plannerFine.mjs (export-free on purpose).
//   node tools/ship/plannerFineCmd.mjs select [--r8 file] [--out dir] [--jobs 4]    stage 1: flies the four grid arms on the selection set (one worker process each), writes <dir>/fine-arms/sel__NAME.json
//   node tools/ship/plannerFineCmd.mjs confirm [--r8 file] [--out dir] [--jobs 4]   stage 2: reads the selection, FIXES the winner (written to <dir>/fine-arms/winner.json), flies the twelve confirmation jobs, prints the report
//   node tools/ship/plannerFineCmd.mjs report [--out dir]                           reads what is written and prints the report
//   node tools/ship/plannerFineCmd.mjs selarm NAME | job ARM BLOCK                    what a worker runs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerFine.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "fine-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const r8 = () => JSON.parse(fs.readFileSync(r8File, "utf8")).params;
const selFile = (n) => path.join(armDir, `sel__${n}.json`), jobFile = (a, b) => path.join(armDir, `${a}__${b}.json`), winFile = path.join(armDir, "winner.json");
const pool = (todo, argvOf, label) => new Promise((resolve) => {
    const jobs = Number(val("--jobs", "4")); let running = 0, i = 0;
    const next = () => {
        while (running < jobs && i < todo.length) {
            const t = todo[i++]; running++; const t0 = Date.now();
            spawn(process.execPath, [here, ...argvOf(t), "--r8", r8File, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; console.log(`${label(t)} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
        }
        if (!running && i >= todo.length) resolve();
    };
    next();
});
const readSel = () => Object.fromEntries(X.GRID.map((n) => [n, JSON.parse(fs.readFileSync(selFile(n), "utf8"))]));
if (mode === "selarm") {
    if (!X.GRID.includes(args[1])) { console.error("unknown arm " + args[1]); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(selFile(args[1]), JSON.stringify(X.flySelection(args[1], r8())));
} else if (mode === "job") {
    const [a, b] = [args[1], args[2]]; if (!X.JOBS.some(([ja, jb]) => ja === a && jb === b)) { console.error("unknown job " + a + " " + b); process.exit(2); }
    fs.writeFileSync(jobFile(a, b), JSON.stringify(X.flyConfirm(a, JSON.parse(fs.readFileSync(winFile, "utf8")).winner, r8(), b)));
} else if (mode === "select") {
    fs.mkdirSync(armDir, { recursive: true });
    await pool(X.GRID.filter((n) => !fs.existsSync(selFile(n))), (n) => ["selarm", n], (n) => `selection ${n}`);
    console.log("winner (fixed now, before any confirmation seed is flown): " + X.winnerOf(readSel()));
} else if (mode === "confirm") {
    fs.mkdirSync(armDir, { recursive: true });
    if (!fs.existsSync(winFile)) fs.writeFileSync(winFile, JSON.stringify({ winner: X.winnerOf(readSel()) }));
    await pool(X.JOBS.filter(([a, b]) => !fs.existsSync(jobFile(a, b))), ([a, b]) => ["job", a, b], ([a, b]) => `job ${a} ${b}`);
}
if (mode === "confirm" || mode === "report") {
    const win = JSON.parse(fs.readFileSync(winFile, "utf8")).winner, byArm = Object.fromEntries(X.CONF_ARMS.map((a) => [a, Object.fromEntries(X.CONF_NAMES.map((b) => [b, JSON.parse(fs.readFileSync(jobFile(a, b), "utf8"))]))]));
    const lines = X.report(readSel(), X.assemble(byArm), win);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-fine-report.json"), JSON.stringify({ winner: win, report: lines }, null, 1));
} else if (!["selarm", "job", "select"].includes(mode)) { console.error("usage: plannerFineCmd.mjs select|confirm|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
