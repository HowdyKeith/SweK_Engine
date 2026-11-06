// tools/ship/plannerToleranceCmd.mjs -- the command for tools/ship/plannerTolerance.mjs (export-free on purpose).
//   node tools/ship/plannerToleranceCmd.mjs run [--r8 file] [--out dir] [--jobs 4]   flies every arm once on the 192 fresh dives (about an hour on four cores), one worker process per arm; prints the report, writes <dir>/planner-tolerance-report.json
//   node tools/ship/plannerToleranceCmd.mjs arm NAME [--r8 file] [--out dir]          one arm (what a worker runs): writes <dir>/tolerance-arms/NAME.json
//   node tools/ship/plannerToleranceCmd.mjs report [--out dir]                        reads the arm files already written and prints the report
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerTolerance.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "tolerance-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const file = (a) => path.join(armDir, a + ".json");
if (mode === "arm") {
    const a = args[1]; if (!X.ARMS.includes(a)) { console.error("unknown arm " + a); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(file(a), JSON.stringify(X.flySets(a, JSON.parse(fs.readFileSync(r8File, "utf8")).params)));
} else if (mode === "run") {
    fs.mkdirSync(armDir, { recursive: true });
    const jobs = Number(val("--jobs", "4")), todo = X.ARMS.filter((a) => !fs.existsSync(file(a)));
    await new Promise((resolve) => {
        let running = 0, i = 0;
        const next = () => {
            while (running < jobs && i < todo.length) {
                const a = todo[i++]; running++; const t0 = Date.now();
                spawn(process.execPath, [here, "arm", a, "--r8", r8File, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; console.log(`arm ${a} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
            }
            if (!running && i >= todo.length) resolve();
        };
        next();
    });
}
if (mode === "run" || mode === "report") {
    const byArm = Object.fromEntries(X.ARMS.map((a) => [a, JSON.parse(fs.readFileSync(file(a), "utf8"))])), au = X.assemble(byArm), lines = X.report(au);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-tolerance-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (mode !== "arm") { console.error("usage: plannerToleranceCmd.mjs run|arm NAME|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
