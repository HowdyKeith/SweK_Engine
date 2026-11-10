// tools/ship/plannerEnsConfirmCmd.mjs -- the command for tools/ship/plannerEnsConfirm.mjs (export-free on purpose).
//   node tools/ship/plannerEnsConfirmCmd.mjs run [--r8 file] [--out dir] [--jobs 4]   flies every job of the round (arm x block, 13 jobs, one worker process each), prints the report, writes <dir>/planner-ensconfirm-report.json
//   node tools/ship/plannerEnsConfirmCmd.mjs job ARM BLOCK [--r8 file] [--out dir]    one arm on one block (what a worker runs): writes <dir>/ensconfirm-arms/ARM__BLOCK.json
//   node tools/ship/plannerEnsConfirmCmd.mjs report [--out dir]                       reads the job files already written and prints the report
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerEnsConfirm.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), armDir = path.join(dir, "ensconfirm-arms");
const r8File = path.resolve(val("--r8", "brain/rig-results/tune-report.json")), here = fileURLToPath(import.meta.url);
const file = (a, b) => path.join(armDir, `${a}__${b}.json`);
const ensDir = path.join(dir, "ensemble-arms");
/** Round 23's pooled ENS-0.05 minus TWIN-FULL, read from its arm files (E1 and E2), or null when they are not there. */
function priorOf() {
    try {
        const get = (a) => JSON.parse(fs.readFileSync(path.join(ensDir, a + ".json"), "utf8")), e = get("ENS-0.05"), t = get("TWIN-FULL"), sets = Object.keys(e);
        const p = X.pooled(Object.fromEntries(sets.map((n) => [n, { "ENS-0.05": e[n], "TWIN-FULL": t[n] }])), "ENS-0.05", "TWIN-FULL", { sets });
        return { mean: p.mean, se: p.se };
    } catch { return null; }
}
if (mode === "job") {
    const [a, b] = [args[1], args[2]]; if (!X.JOBS.some(([ja, jb]) => ja === a && jb === b)) { console.error("unknown job " + a + " " + b); process.exit(2); }
    fs.mkdirSync(armDir, { recursive: true });
    fs.writeFileSync(file(a, b), JSON.stringify(X.flyBlock(a, JSON.parse(fs.readFileSync(r8File, "utf8")).params, b)));
} else if (mode === "run") {
    fs.mkdirSync(armDir, { recursive: true });
    const jobs = Number(val("--jobs", "4")), todo = X.JOBS.filter(([a, b]) => !fs.existsSync(file(a, b)));
    todo.sort((p, q) => (q[0] === "TUNED-R8" ? 0 : 1) - (p[0] === "TUNED-R8" ? 0 : 1));   // the slow twin jobs first
    await new Promise((resolve) => {
        let running = 0, i = 0;
        const next = () => {
            while (running < jobs && i < todo.length) {
                const [a, b] = todo[i++]; running++; const t0 = Date.now();
                spawn(process.execPath, [here, "job", a, b, "--r8", r8File, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; console.log(`job ${a} ${b} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
            }
            if (!running && i >= todo.length) resolve();
        };
        next();
    });
}
if (mode === "run" || mode === "report") {
    const byArm = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.JOBS.filter(([ja]) => ja === a).map(([, b]) => [b, JSON.parse(fs.readFileSync(file(a, b), "utf8"))]))])), au = X.assemble(byArm), lines = X.report(au, priorOf());
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-ensconfirm-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (mode !== "job") { console.error("usage: plannerEnsConfirmCmd.mjs run|job ARM BLOCK|report [--r8 file] [--out dir] [--jobs 4]"); process.exit(2); }
