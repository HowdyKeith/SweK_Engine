// tools/ship/gaugeFaultsCmd.mjs -- the command for tools/ship/gaugeFaults.mjs (Round 34 of brain/NEEDS_AND_LIMITS.md; export-free on purpose).
//   node tools/ship/gaugeFaultsCmd.mjs run [--out dir] [--jobs 4]    flies the 32 jobs (arm x condition x kind) not yet written to <dir>/gauge-faults/, then prints the report
//   node tools/ship/gaugeFaultsCmd.mjs report [--out dir]            reads what is written and prints the report (and writes <dir>/gauge-faults-report.json)
//   node tools/ship/gaugeFaultsCmd.mjs job ARM COND KIND [--out dir]  what a worker runs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./gaugeFaults.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "gauge-faults"), here = fileURLToPath(import.meta.url);
const jobFile = (a, c, k) => path.join(armDir, `${a}__${c}__${k}.json`);
const pool = (todo) => new Promise((resolve) => {
    const jobs = Number(val("--jobs", "4")); let running = 0, i = 0, failed = 0;
    const next = () => {
        while (running < jobs && i < todo.length) {
            const t = todo[i++]; running++; const t0 = Date.now();
            spawn(process.execPath, [here, "job", ...t, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; if (c) failed++; console.log(`job ${t.join(" ")} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
        }
        if (!running && i >= todo.length) resolve(failed);
    };
    next();
});
if (mode === "job") {
    const t = args.slice(1, 4); if (!X.JOBS.some((j) => j.join() === t.join())) { console.error("unknown job " + t.join(" ")); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(jobFile(...t), JSON.stringify(X.flyJob(...t)));
} else if (mode === "run") {
    fs.mkdirSync(armDir, { recursive: true });
    // the seat's jobs are the long ones: start them first so the pool ends together
    const todo = X.JOBS.filter((t) => !fs.existsSync(jobFile(...t))).sort((a, b) => (b[0] === "SEAT") - (a[0] === "SEAT"));
    const failed = await pool(todo);
    if (failed) { console.error(`${failed} job(s) failed; the report is not printed`); process.exit(1); }
}
if (mode === "run" || mode === "report") {
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(X.KINDS.map((k) => JSON.parse(fs.readFileSync(jobFile(a, c, k), "utf8"))))]))]));
    const lines = X.report(res);
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "gauge-faults-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (mode !== "job") { console.error("usage: gaugeFaultsCmd.mjs run|report [--out dir] [--jobs 4]"); process.exit(2); }
