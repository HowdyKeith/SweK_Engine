// WebGLEngine/tools/ship/headToHead10Cmd.mjs -- the command for tools/ship/headToHead10.mjs (export-free on purpose). Round H10 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead10Cmd.mjs train [--workers 4] [--out brain/rig-results/head-to-head10-training.jsonl] [--smoke]     10 replicates x 4 searches = 40, one process each; a stopped run resumes
//   node tools/ship/headToHead10Cmd.mjs fly [--in ...training.jsonl] [--h7 brain/rig-results/head-to-head7-training.jsonl] [--from 10000 --to 10199] [--seconds 160] [--out brain/rig-results]     the report and head-to-head10.json
//   node tools/ship/headToHead10Cmd.mjs --one 2:3 [--smoke]      the child's mode: replicate 2 search 3, printed as one JSON line
// `--smoke` trains a few iterations on an eighth of the dives (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead10.mjs";
import * as H7 from "./headToHead7.mjs";
import * as T from "../../brain/subTask.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), SMOKE = { iters: 3, trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0), heldSet: T.HELD_OUT_SET.filter((_, i) => i % 8 === 0) };
const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head10-training.jsonl"));
const readRows = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const readJobs = () => (fs.existsSync(outFile) ? readRows(outFile) : []);

if (has("--one")) {
    const [rep, k] = val("--one", "").split(":").map(Number);
    console.log(JSON.stringify({ ...X.searchFrozen(rep, k, smoke ? SMOKE : {}), smoke }));
} else if (args[0] === "train") {
    const workers = Number(val("--workers", 4)), done = new Set(readJobs().map((r) => `${r.rep}:${r.k}`));
    const todo = Array.from({ length: X.REPLICATES }, (_, r) => Array.from({ length: X.RECIPE.runs }, (_, k) => [r, k])).flat().filter(([r, k]) => !done.has(`${r}:${k}`));
    console.log(`[h10 train] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [r, k] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${r}:${k}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const o = JSON.parse(line); console.log(`[h10 train] replicate ${r} search ${k} seed ${o.seed}: held-out ${o.heldScore.toFixed(4)}, train ${o.trainScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h10 train] replicate ${r} search ${k} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h10 train] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`);
    process.exitCode = failed ? 1 : 0;
} else if (args[0] === "fly") {
    const need = (f) => { if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(2); } return f; };
    const rows = readRows(need(path.resolve(val("--in", outFile))));
    if (rows.some((r) => r.smoke)) { console.error("the training file holds SMOKE records: fly refuses them (train again without --smoke)"); process.exit(2); }
    const frozen = new Map();
    for (let r = 0; r < X.REPLICATES; r++) { try { frozen.set(r, X.championOf(r, rows.filter((o) => o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const h7rows = readRows(need(path.resolve(val("--h7", eng + "brain/rig-results/head-to-head7-training.jsonl")))), base = new Map();
    for (let r = 0; r < X.REPLICATES; r++) { try { base.set(r, H7.championOf("base", r, h7rows.filter((o) => o.recipe === "base" && o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
    const au = X.audit(frozen, base, { range, seconds }), lines = X.report(au);
    for (const l of lines) console.log(l);
    const dir = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(dir, { recursive: true });
    const slim = (m) => Object.fromEntries([...m].map(([r, c]) => [r, { heldScore: c.heldScore, seed: c.seed, k: c.k, searches: c.searches }]));
    fs.writeFileSync(path.join(dir, "head-to-head10.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit, frozen: slim(frozen), base: slim(base) }));
} else { console.error("usage: train | fly | --one REP:K   (see the header)"); process.exit(2); }
