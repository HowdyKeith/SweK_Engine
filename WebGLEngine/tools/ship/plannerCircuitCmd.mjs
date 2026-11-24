// tools/ship/plannerCircuitCmd.mjs -- the command for tools/ship/plannerCircuit.mjs (Round 42 of brain/NEEDS_AND_LIMITS.md; export-free on purpose).
//   node tools/ship/plannerCircuitCmd.mjs train [--out dir] [--workers 4]   ON THE RIG: the four searches, each resumed from its ledger if one exists; then the training lines (no audit is flown)
//   node tools/ship/plannerCircuitCmd.mjs audit [--out dir] [--jobs 4]      needs all four search records; the 24 audit jobs not yet written, then the report
//   node tools/ship/plannerCircuitCmd.mjs report [--out dir]                reads what is written and prints the report (and writes <dir>/planner-circuit-report.json)
//   node tools/ship/plannerCircuitCmd.mjs search K | job ARM COND CHUNK      what a worker runs
// A KILLED TRAINING IS RESTARTED WITH THE SAME COMMAND. Each search appends a line to <dir>/planner-circuit/ledger-K.jsonl at every checkpoint (every 50
// children) and writes search-K.json when its seventh checkpoint is in; a restart resumes each unfinished search from its last whole line, exactly.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerCircuit.mjs";
import { circuitSeat } from "../../render/subAquariumCircuit.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const mode = args[0], dir = path.resolve(val("--out", "brain/rig-results")), sub = path.join(dir, "planner-circuit"), here = fileURLToPath(import.meta.url);
const searchFile = (k) => path.join(sub, `search-${k}.json`), ledgerFile = (k) => path.join(sub, `ledger-${k}.jsonl`), jobFile = (a, c, j) => path.join(sub, `${a}__${c}__${j}.json`);
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
    // a line cut short by a kill is dropped from the file too, so the next line starts clean
    const { ledger, resumes, clean } = X.resumeFromText(fs.existsSync(ledgerFile(k)) ? fs.readFileSync(ledgerFile(k), "utf8") : "");
    fs.writeFileSync(ledgerFile(k), clean);
    if (ledger.length) console.log(`search ${k}: resuming after child ${ledger.at(-1).at} (${ledger.at(-1).draws} draws)`);
    const onLine = (l) => { const line = { ...l, resumes }; const fd = fs.openSync(ledgerFile(k), "a"); fs.writeSync(fd, JSON.stringify(line) + "\n"); fs.fsyncSync(fd); fs.closeSync(fd); console.log(`search ${k}: checkpoint ${l.at}, train ${l.trainScore.toFixed(4)}, held-out ${l.heldOut.toFixed(4)}`); return line; };
    const rec = X.searchJob(k, { ledger, onLine, resumes });
    fs.writeFileSync(searchFile(k), JSON.stringify(rec));
} else if (mode === "job") {
    const t = args.slice(1, 4); if (!X.AUDIT_JOBS.some((j) => j.join() === t.join())) { console.error("unknown job " + t.join(" ")); process.exit(2); }
    if (fs.existsSync(jobFile(...t))) { console.error(`REFUSED: ${jobFile(...t)} exists -- the audit is flown once`); process.exit(2); }
    fs.writeFileSync(jobFile(...t), JSON.stringify(X.auditJob(...t, { weights: X.championWeights(records()) })));
} else if (mode === "train") {
    fs.mkdirSync(sub, { recursive: true });
    const failed = await pool(Array.from({ length: X.SEARCHES }, (_, k) => k).filter((k) => !fs.existsSync(searchFile(k))).map((k) => ["search", String(k)]), Number(val("--workers", "4")));
    if (failed) { console.error(`${failed} search(es) failed -- run the same command again: each resumes from its ledger`); process.exit(1); }
    for (const l of X.trainingLines(records())) console.log(l);
} else if (mode === "audit") {
    const led = X.ledgerChecks(records()); if (led.length) { console.error("the training ledger is not complete: " + led.join("; ")); process.exit(2); }
    const failed = await pool(X.AUDIT_JOBS.filter((t) => !fs.existsSync(jobFile(...t))).map((t) => ["job", ...t]), Number(val("--jobs", "4")));
    if (failed) { console.error(`${failed} job(s) failed; the report is not printed`); process.exit(1); }
}
if (mode === "audit" || mode === "report") {
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeAudit(Array.from({ length: X.CHUNKS }, (_, j) => JSON.parse(fs.readFileSync(jobFile(a, c, String(j)), "utf8"))))]))]));
    const lines = X.report(res, records(), { start: X.startIsSeat(), profile: X.profileSame(circuitSeat), shipped: X.shippedSame() });
    for (const l of lines) console.log(l);
    fs.writeFileSync(path.join(dir, "planner-circuit-report.json"), JSON.stringify({ report: lines }, null, 1));
} else if (!["search", "job", "train"].includes(mode)) { console.error("usage: plannerCircuitCmd.mjs train|audit|report [--out dir] [--workers 4] [--jobs 4]"); process.exit(2); }
