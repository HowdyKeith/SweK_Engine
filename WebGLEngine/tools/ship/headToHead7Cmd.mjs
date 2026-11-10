// WebGLEngine/tools/ship/headToHead7Cmd.mjs -- the command for tools/ship/headToHead7.mjs (export-free on purpose). Round H7 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead7Cmd.mjs train [--workers 4] [--out brain/rig-results/head-to-head7-training.jsonl] [--smoke]     2 recipes x 10 replicates x 4 searches = 80, one process each; a stopped run resumes
//   node tools/ship/headToHead7Cmd.mjs fly [--in ...training.jsonl] [--from 7000 --to 7199] [--seconds 160] [--out brain/rig-results]     the report and head-to-head7.json
//   node tools/ship/headToHead7Cmd.mjs --one base:2:3 [--smoke]      the child's mode: recipe base, replicate 2, search 3, printed as one JSON line
// `--smoke` trains a few iterations on an eighth of the dives (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead7.mjs";
import * as T from "../../brain/subTask.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), SMOKE = { iters: 3, trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0), heldSet: T.HELD_OUT_SET.filter((_, i) => i % 8 === 0) };
const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head7-training.jsonl"));
const readRows = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const readJobs = () => (fs.existsSync(outFile) ? readRows(outFile) : []);
const search = { base: X.searchBase, robust: X.searchRobust };

if (has("--one")) {
    const [recipe, rep, k] = val("--one", "").split(":"); if (!search[recipe]) { console.error(`recipe must be base or robust, got ${recipe}`); process.exit(2); }
    const opts = smoke ? { ...SMOKE, ...(recipe === "robust" ? { trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0) } : {}) } : {};
    console.log(JSON.stringify({ ...search[recipe](Number(rep), Number(k), opts), smoke }));
} else if (args[0] === "train") {
    const workers = Number(val("--workers", 4)), done = new Set(readJobs().map((r) => `${r.recipe}:${r.rep}:${r.k}`));
    const todo = []; for (let r = 0; r < X.REPLICATES; r++) for (let k = 0; k < 4; k++) for (const rc of X.RECIPES) todo.push([rc, r, k]);   // replicate-major, the two recipes interleaved: a stopped run leaves both recipes equally far
    const left = todo.filter(([rc, r, k]) => !done.has(`${rc}:${r}:${k}`));
    console.log(`[h7 train] ${left.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < left.length) {
                const [rc, r, k] = left[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${rc}:${r}:${k}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const o = JSON.parse(line); console.log(`[h7 train] ${rc} replicate ${r} search ${k} seed ${o.seed}: held-out ${o.heldScore.toFixed(4)}, train ${o.trainScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h7 train] ${rc} replicate ${r} search ${k} FAILED (exit ${code})`); }
                    if (next >= left.length && running === 0) resolve(); else launch();
                });
            }
            if (!left.length) resolve();
        };
        launch();
    });
    console.log(`[h7 train] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`);
    process.exitCode = failed ? 1 : 0;
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", outFile)); if (!fs.existsSync(inFile)) { console.error(`no training file at ${inFile} (run train first)`); process.exit(2); }
    const rows = readRows(inFile);
    if (rows.some((r) => r.smoke)) { console.error("the training file holds SMOKE records: fly refuses them (train again without --smoke)"); process.exit(2); }
    const maps = { base: new Map(), robust: new Map() };
    for (const rc of X.RECIPES) for (let r = 0; r < X.REPLICATES; r++) { try { maps[rc].set(r, X.championOf(rc, r, rows.filter((o) => o.recipe === rc && o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const refs = { Wip: JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights, Robust: JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsRobustWip.json", "utf8")).weights };
    const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
    const au = X.audit(maps.base, maps.robust, refs, { range, seconds }), lines = X.report(au);
    for (const l of lines) console.log(l);
    const dir = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(dir, { recursive: true });
    const slim = (m) => Object.fromEntries([...m].map(([r, c]) => [r, { heldScore: c.heldScore, seed: c.seed, k: c.k, searches: c.searches }]));
    fs.writeFileSync(path.join(dir, "head-to-head7.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit, base: slim(maps.base), robust: slim(maps.robust) }));
} else { console.error("usage: train | fly | --one RECIPE:REP:K   (see the header)"); process.exit(2); }
