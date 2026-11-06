// tools/ship/plannerRobustCmd.mjs -- the command for tools/ship/plannerRobust.mjs (export-free on purpose).
//   node tools/ship/plannerRobustCmd.mjs run [--r8 file] [--out dir] [--jobs 4]   flies the 24 jobs (arm x condition x kind, one worker process each), merges the halves, prints the report, writes <dir>/planner-robust-report.json
//   node tools/ship/plannerRobustCmd.mjs job ARM COND KIND [--r8 file] [--out dir]   one arm on one kind of one condition (what a worker runs): writes <dir>/robust-arms/ARM__COND__KIND.json
//   node tools/ship/plannerRobustCmd.mjs report [--out dir]                          merges the job files already written and prints the report
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerRobust.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "robust-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const file = (a, c, k) => path.join(armDir, `${a}__${c}__${k}.json`);
const ORDER = [...X.JOBS].sort((p, q) => (q[1] === "STN5" && q[0] === "TWIN-L12" ? 1 : 0) - (p[1] === "STN5" && p[0] === "TWIN-L12" ? 1 : 0) || (p[0].startsWith("TUNED") ? 1 : 0) - (q[0].startsWith("TUNED") ? 1 : 0));   // the slow five-station twin jobs first, the rules last
if (mode === "job") {
    const t = args.slice(1, 4); if (!X.JOBS.some((j) => j.join() === t.join())) { console.error("unknown job " + t.join(" ")); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(file(...t), JSON.stringify(X.flyChunk(t[0], JSON.parse(fs.readFileSync(r8File, "utf8")).params, t[1], t[2])));
} else if (mode === "run") {
    fs.mkdirSync(armDir, { recursive: true });
    const jobs = Number(val("--jobs", "4")), todo = ORDER.filter((t) => !fs.existsSync(file(...t)));
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
    const byArm = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(X.HARD.map((k) => JSON.parse(fs.readFileSync(file(a, c, k), "utf8"))))]))])), lines = X.report(X.assemble(byArm));
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-robust-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (mode !== "job") { console.error("usage: plannerRobustCmd.mjs run|job ARM COND KIND|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
