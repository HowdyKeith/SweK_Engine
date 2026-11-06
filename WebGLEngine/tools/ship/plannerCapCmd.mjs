// tools/ship/plannerCapCmd.mjs -- the command for tools/ship/plannerCap.mjs (export-free on purpose).
//   node tools/ship/plannerCapCmd.mjs run [--r8 file] [--out dir] [--jobs 4]   flies every job once on the 384 fresh dives (about 7.6 core-hours: CAP-5 alone is 3.7; about two hours on four cores), one worker process per arm, set and kind; prints the report, writes <dir>/planner-cap-report.json
//   node tools/ship/plannerCapCmd.mjs job ARM SET KIND [--r8 file] [--out dir]    one arm on one kind of one set (what a worker runs): writes <dir>/cap-arms/ARM__SET__KIND.json (24 jobs; the halves are merged when the report is made)
//   node tools/ship/plannerCapCmd.mjs report [--out dir]                          merges the job files already written and prints the report
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerCap.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "cap-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const KINDS = X.HARD, file = (a, s, k) => path.join(armDir, `${a}__${s}__${k}.json`);
const JOBS = [...X.ARMS].sort((p, q) => (q === "CAP-5" ? 1 : 0) - (p === "CAP-5" ? 1 : 0) || (p === "TUNED-R8" ? 1 : 0) - (q === "TUNED-R8" ? 1 : 0)).flatMap((a) => X.SET_NAMES.flatMap((s) => KINDS.map((k) => [a, s, k])));   // the slow CAP-5 jobs first, the tuned rule last
if (mode === "job") {
    const [a, s, k] = args.slice(1, 4); if (!JOBS.some(([ja, js, jk]) => ja === a && js === s && jk === k)) { console.error(`unknown job ${a} ${s} ${k}`); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(file(a, s, k), JSON.stringify(X.flyChunk(a, JSON.parse(fs.readFileSync(r8File, "utf8")).params, s, k)));
} else if (mode === "run") {
    fs.mkdirSync(armDir, { recursive: true });
    const jobs = Number(val("--jobs", "4")), todo = JOBS.filter(([a, s, k]) => !fs.existsSync(file(a, s, k)));
    await new Promise((resolve) => {
        let running = 0, i = 0;
        const next = () => {
            while (running < jobs && i < todo.length) {
                const t = todo[i++]; running++; const t0 = Date.now();
                spawn(process.execPath, [here, "job", ...t, "--r8", r8File, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; console.log(`job ${t.join(" ")} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
            }
            if (!running && i >= todo.length) resolve();
        };
        next();
    });
}
if (mode === "run" || mode === "report") {
    const byArm = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.SET_NAMES.map((s) => [s, X.mergeKinds(KINDS.map((k) => JSON.parse(fs.readFileSync(file(a, s, k), "utf8"))))]))])), au = X.assemble(byArm), lines = X.report(au);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-cap-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (mode !== "job") { console.error("usage: plannerCapCmd.mjs run|job ARM SET KIND|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
