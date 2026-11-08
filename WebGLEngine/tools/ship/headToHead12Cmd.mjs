// WebGLEngine/tools/ship/headToHead12Cmd.mjs -- the command for tools/ship/headToHead12.mjs (export-free on purpose). Round H12 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead12Cmd.mjs train [--workers 4] [--out brain/rig-results/head-to-head12-training.jsonl] [--smoke]     2 groups x 5 replicates x 4 searches = 40, one process each; a stopped run resumes
//   node tools/ship/headToHead12Cmd.mjs fly [--in ...training.jsonl] [--h6 brain/rig-results/head-to-head6-training.jsonl] [--h7 brain/rig-results/head-to-head7-training.jsonl] [--from 12000 --to 12199] [--seconds 160] [--out brain/rig-results]
//   node tools/ship/headToHead12Cmd.mjs --one A:2:3 [--smoke]      the child's mode: group A, replicate 2, search 3, printed as one JSON line
// `--smoke` trains a few iterations on an eighth of the dives (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead12.mjs";
import * as H6 from "./headToHead6.mjs";
import * as H7 from "./headToHead7.mjs";
import * as H9 from "./headToHead9.mjs";
import * as T from "../../brain/subTask.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), SMOKE = { iters: 5, trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0), heldSet: T.HELD_OUT_SET.filter((_, i) => i % 8 === 0) };
const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head12-training.jsonl"));
const readRows = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const readJobs = () => (fs.existsSync(outFile) ? readRows(outFile) : []);

if (has("--one")) {
    const [g, r, k] = val("--one", "").split(":");
    console.log(JSON.stringify({ ...X.searchOne(g, Number(r), Number(k), smoke ? SMOKE : {}), smoke }));
} else if (args[0] === "train") {
    const workers = Number(val("--workers", 4)), done = new Set(readJobs().map((r) => `${r.group}:${r.rep}:${r.k}`));
    const all = []; for (let r = 0; r < X.REPLICATES; r++) for (let k = 0; k < X.RECIPE.runs; k++) for (const g of X.GROUPS) all.push([g, r, k]);   // replicate-major, A and B interleaved
    const todo = all.filter(([g, r, k]) => !done.has(`${g}:${r}:${k}`));
    console.log(`[h12 train] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [g, r, k] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${g}:${r}:${k}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const o = JSON.parse(line); console.log(`[h12 train] ${g} replicate ${r} search ${k} seed ${o.seed}: held-out ${o.heldScore.toFixed(4)}, train ${o.trainScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h12 train] ${g} replicate ${r} search ${k} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h12 train] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`);
    process.exitCode = failed ? 1 : 0;
} else if (args[0] === "fly") {
    const need = (f) => { if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(2); } return f; };
    const rows = readRows(need(path.resolve(val("--in", outFile))));
    if (rows.some((r) => r.smoke)) { console.error("the training file holds SMOKE records: fly refuses them (train again without --smoke)"); process.exit(2); }
    const maps = { A: new Map(), B: new Map() };
    for (const g of X.GROUPS) for (let r = 0; r < X.REPLICATES; r++) { try { maps[g].set(r, X.championOf(g, r, rows.filter((o) => o.group === g && o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const h6rows = readRows(need(path.resolve(val("--h6", eng + "brain/rig-results/head-to-head6-training.jsonl")))), narrow = new Map();
    for (let r = 0; r < X.REPLICATES; r++) { try { narrow.set(r, H6.championOf(r, h6rows.filter((o) => o.rep === r))); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const nets = new Map();
    for (const n of H9.SHIPPED) nets.set("network-" + n, JSON.parse(fs.readFileSync(eng + (n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`), "utf8")).weights);
    const h7rows = readRows(need(path.resolve(val("--h7", eng + "brain/rig-results/head-to-head7-training.jsonl"))));
    for (const rc of H7.RECIPES) for (let r = 0; r < H7.REPLICATES; r++) { try { nets.set(`${rc}-${r}`, H7.championOf(rc, r, h7rows.filter((o) => o.recipe === rc && o.rep === r)).weights); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
    const au = X.audit(maps.A, maps.B, narrow, nets, { range, seconds }), lines = X.report(au);
    for (const l of lines) console.log(l);
    const dir = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(dir, { recursive: true });
    const slim = (m) => Object.fromEntries([...m].map(([r, c]) => [r, { gains: c.gains, heldScore: c.heldScore, seed: c.seed, k: c.k, searches: c.searches }]));
    fs.writeFileSync(path.join(dir, "head-to-head12.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit, a: slim(maps.A), b: slim(maps.B), narrow: slim(narrow) }));
} else { console.error("usage: train | fly | --one G:REP:K   (see the header)"); process.exit(2); }
