// WebGLEngine/tools/ship/headToHead6Cmd.mjs -- the command for tools/ship/headToHead6.mjs (export-free on purpose). Round H6 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead6Cmd.mjs train [--workers 4] [--out brain/rig-results/head-to-head6-training.jsonl] [--smoke]     5 replicates x 4 searches, one process each; a stopped run resumes
//   node tools/ship/headToHead6Cmd.mjs fly [--in ...training.jsonl] [--h5 brain/rig-results/head-to-head5-training.jsonl] [--from 6000 --to 6199] [--seconds 160] [--out brain/rig-results]     the report and head-to-head6.json
//   node tools/ship/headToHead6Cmd.mjs --one 2:3 [--smoke]      the child's mode: replicate 2 search 3, printed as one JSON line
// `--smoke` trains on an eighth of the dives for a few iterations (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead6.mjs";
import * as H5 from "./headToHead5.mjs";
import * as T from "../../brain/subTask.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), SMOKE = { iters: 5, trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0), heldSet: T.HELD_OUT_SET.filter((_, i) => i % 8 === 0) };
const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head6-training.jsonl"));
const readRows = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const readJobs = () => (fs.existsSync(outFile) ? readRows(outFile) : []);

if (has("--one")) {
    const [rep, k] = val("--one", "").split(":").map(Number);
    console.log(JSON.stringify({ ...X.searchOne(rep, k, smoke ? SMOKE : {}), smoke }));
} else if (args[0] === "train") {
    const workers = Number(val("--workers", 4)), done = new Set(readJobs().map((r) => `${r.rep}:${r.k}`));
    const todo = Array.from({ length: X.REPLICATES }, (_, r) => Array.from({ length: X.RECIPE.runs }, (_, k) => [r, k])).flat().filter(([r, k]) => !done.has(`${r}:${k}`));
    console.log(`[h6 train] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
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
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const o = JSON.parse(line); console.log(`[h6 train] replicate ${r} search ${k} seed ${o.seed}: held-out ${o.heldScore.toFixed(4)}, train ${o.trainScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h6 train] replicate ${r} search ${k} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h6 train] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`);
    process.exitCode = failed ? 1 : 0;
} else if (args[0] === "fly") {
    const need = (f) => { if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(2); } return f; };
    const rows = readRows(need(path.resolve(val("--in", eng + "brain/rig-results/head-to-head6-training.jsonl"))));
    if (rows.some((r) => r.smoke)) { console.error("the training file holds SMOKE records: fly refuses them (train again without --smoke)"); process.exit(2); }
    const tuned = new Map();
    for (let r = 0; r < X.REPLICATES; r++) { try { tuned.set(r, X.championOf(r, rows.filter((o) => o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const h5rows = readRows(need(path.resolve(val("--h5", eng + "brain/rig-results/head-to-head5-training.jsonl"))));
    if (h5rows.some((r) => r.smoke)) { console.error("the H5 training file holds SMOKE records"); process.exit(2); }
    const controls = new Map();
    for (const s of H5.SPECS) { try { controls.set(s, H5.championOf(s, h5rows.filter((o) => o.spec === s))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const networks = {};
    for (const n of Object.keys(Object.fromEntries(X.NET_IDS.map((a) => [a.slice(8), 1])))) networks[n] = JSON.parse(fs.readFileSync(eng + (n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`), "utf8")).weights;
    const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
    const au = X.audit(tuned, networks, controls, { range, seconds }), lines = X.report(au);
    for (const l of lines) console.log(l);
    const dir = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "head-to-head6.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit, tuned: Object.fromEntries([...tuned]) }));
} else { console.error("usage: train | fly | --one REP:K   (see the header)"); process.exit(2); }
