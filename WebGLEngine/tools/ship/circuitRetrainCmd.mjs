// tools/ship/circuitRetrainCmd.mjs -- the command for tools/ship/circuitRetrain.mjs (Round 40 of brain/NEEDS_AND_LIMITS.md; export-free on purpose).
//   node tools/ship/circuitRetrainCmd.mjs train [--out dir] [--workers 4]   the four searches not yet written to <dir>/circuit-retrain/search-K.json, then the training lines (no audit is flown)
//   node tools/ship/circuitRetrainCmd.mjs audit [--out dir] [--jobs 4]      needs all four searches; the 24 audit jobs not yet written, then the report
//   node tools/ship/circuitRetrainCmd.mjs report [--out dir]                reads what is written and prints the report (and writes <dir>/circuit-retrain-report.json)
//   node tools/ship/circuitRetrainCmd.mjs search K | job ARM COND CHUNK      what a worker runs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./circuitRetrain.mjs";
import { circuitSeat } from "../../render/subAquariumCircuit.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), sub = path.join(dir, "circuit-retrain"), here = fileURLToPath(import.meta.url);
const searchFile = (k) => path.join(sub, `search-${k}.json`), jobFile = (a, c, j) => path.join(sub, `${a}__${c}__${j}.json`);
const pool = (todo, n) => new Promise((resolve) => {
    let running = 0, i = 0, failed = 0;
    const next = () => {
        while (running < n && i < todo.length) {
            const t = todo[i++]; running++; const t0 = Date.now();
            spawn(process.execPath, [here, ...t, "--out", dir], { stdio: "inherit" }).on("exit", (c) => { running--; if (c) failed++; console.log(`${t.join(" ")} exit ${c} ${((Date.now() - t0) / 1000).toFixed(0)} s`); next(); });
        }
        if (!running && i >= todo.length) resolve(failed);
    };
    next();
});
const records = () => Array.from({ length: X.SEARCHES }, (_, k) => k).filter((k) => fs.existsSync(searchFile(k))).map((k) => JSON.parse(fs.readFileSync(searchFile(k), "utf8")));
if (mode === "search") {
    const k = Number(args[1]); fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(searchFile(k), JSON.stringify(X.searchJob(k)));
} else if (mode === "job") {
    const t = args.slice(1, 4); if (!X.AUDIT_JOBS.some((j) => j.join() === t.join())) { console.error("unknown job " + t.join(" ")); process.exit(2); }
    fs.writeFileSync(jobFile(...t), JSON.stringify(X.auditJob(...t, { weights: X.championWeights(records()) })));
} else if (mode === "train") {
    fs.mkdirSync(sub, { recursive: true });
    const failed = await pool(Array.from({ length: X.SEARCHES }, (_, k) => k).filter((k) => !fs.existsSync(searchFile(k))).map((k) => ["search", String(k)]), Number(val("--workers", "4")));
    if (failed) { console.error(`${failed} search(es) failed`); process.exit(1); }
    for (const l of X.trainingLines(records())) console.log(l);
} else if (mode === "audit") {
    const led = X.ledgerChecks(records()); if (led.length) { console.error("the training ledger is not complete: " + led.join("; ")); process.exit(2); }
    const failed = await pool(X.AUDIT_JOBS.filter((t) => !fs.existsSync(jobFile(...t))).map((t) => ["job", ...t]), Number(val("--jobs", "4")));
    if (failed) { console.error(`${failed} job(s) failed; the report is not printed`); process.exit(1); }
}
if (mode === "audit" || mode === "report") {
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(Array.from({ length: X.CHUNKS }, (_, j) => JSON.parse(fs.readFileSync(jobFile(a, c, String(j)), "utf8"))))]))]));
    const lines = X.report(res, records(), { start: X.startIsR04(), profile: X.profileSame(circuitSeat), shipped: X.shippedSame() });
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "circuit-retrain-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (!["search", "job", "train"].includes(mode)) { console.error("usage: circuitRetrainCmd.mjs train|audit|report [--out dir] [--workers 4] [--jobs 4]"); process.exit(2); }
