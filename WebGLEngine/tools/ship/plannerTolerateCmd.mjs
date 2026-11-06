// tools/ship/plannerTolerateCmd.mjs -- the command for tools/ship/plannerTolerate.mjs (export-free on purpose).
//   node tools/ship/plannerTolerateCmd.mjs select [--r8 file] [--out dir] [--jobs 4]    stage 1: flies the 35 selection jobs (shift x condition), writes <dir>/tolerate-arms/sel__SHIFT__COND.json, prints the winner
//   node tools/ship/plannerTolerateCmd.mjs confirm [--r8 file] [--out dir] [--jobs 4]   stage 2: FIXES the winner (<dir>/tolerate-arms/winner.json), flies the 30 confirmation jobs (arm x condition x kind), prints the report
//   node tools/ship/plannerTolerateCmd.mjs report [--out dir]                           reads what is written and prints the report
//   node tools/ship/plannerTolerateCmd.mjs selarm SHIFT COND | job ARM COND KIND         what a worker runs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerTolerate.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "tolerate-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const r8 = () => JSON.parse(fs.readFileSync(r8File, "utf8")).params;
const selFile = (n, c) => path.join(armDir, `sel__${n}__${c}.json`), jobFile = (a, c, k) => path.join(armDir, `${a}__${c}__${k}.json`), winFile = path.join(armDir, "winner.json");
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
const readSel = () => Object.fromEntries(X.GRID.map((n) => [n, Object.fromEntries(X.COND_NAMES.map((c) => [c, JSON.parse(fs.readFileSync(selFile(n, c), "utf8"))]))]));
if (mode === "selarm") {
    const [n, c] = args.slice(1, 3); if (!X.SEL_JOBS.some((j) => j[0] === n && j[1] === c)) { console.error(`unknown selection job ${n} ${c}`); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(selFile(n, c), JSON.stringify(X.flySelection(n, r8(), c)));
} else if (mode === "job") {
    const t = args.slice(1, 4); if (!X.CONF_JOBS.some((j) => j.join() === t.join())) { console.error("unknown job " + t.join(" ")); process.exit(2); }
    fs.writeFileSync(jobFile(...t), JSON.stringify(X.flyConfirm(t[0], JSON.parse(fs.readFileSync(winFile, "utf8")).winner, r8(), t[1], t[2])));
} else if (mode === "select") {
    fs.mkdirSync(armDir, { recursive: true });
    await pool(X.SEL_JOBS.filter(([n, c]) => !fs.existsSync(selFile(n, c))), ([n, c]) => ["selarm", n, c], ([n, c]) => `selection ${n} ${c}`);
    console.log("winner (fixed now, before any confirmation seed is flown): " + X.winnerOf(readSel()));
} else if (mode === "confirm") {
    fs.mkdirSync(armDir, { recursive: true });
    if (!fs.existsSync(winFile)) fs.writeFileSync(winFile, JSON.stringify({ winner: X.winnerOf(readSel()) }));
    await pool(X.CONF_JOBS.filter((t) => !fs.existsSync(jobFile(...t))), (t) => ["job", ...t], (t) => `job ${t.join(" ")}`);
}
if (mode === "confirm" || mode === "report") {
    const win = JSON.parse(fs.readFileSync(winFile, "utf8")).winner, byArm = Object.fromEntries(X.CONF_ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(X.HARD.map((k) => JSON.parse(fs.readFileSync(jobFile(a, c, k), "utf8"))))]))]));
    const lines = X.report(readSel(), X.assemble(byArm), win);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-tolerate-report.json"), JSON.stringify({ winner: win, report: lines }, null, 1));
} else if (!["selarm", "job", "select"].includes(mode)) { console.error("usage: plannerTolerateCmd.mjs select|confirm|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
