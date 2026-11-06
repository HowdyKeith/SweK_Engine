// WebGLEngine/tools/ship/headToHead5Cmd.mjs -- the command for tools/ship/headToHead5.mjs (export-free on purpose). Round H5 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead5Cmd.mjs train [--workers 4] [--out brain/rig-results/head-to-head5-training.jsonl] [--smoke]     80 + 80 searches, one process each; a stopped run resumes (a search already in the file is not run again)
//   node tools/ship/headToHead5Cmd.mjs fly [--in brain/rig-results/head-to-head5-training.jsonl] [--from 5000 --to 5199] [--seconds 160] [--out brain/rig-results]     the champions + Wip flown dark and lit, the report, head-to-head5.json
//   node tools/ship/headToHead5Cmd.mjs --one er:3:2 [--smoke]      the child's mode: one search, printed as one JSON line
// `--smoke` trains on a fifth of a fifth of the dives for a few iterations (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead5.mjs";
import * as T from "../../brain/subTask.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), SMOKE = { iters: 5, trainSet: T.TRAIN_SET.filter((_, i) => i % 8 === 0), heldSet: T.HELD_OUT_SET.filter((_, i) => i % 8 === 0) };
const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head5-training.jsonl"));
const readJobs = () => (fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

if (has("--one")) {
    const [fam, c, k] = val("--one", "").split(":"), spec = `${fam}:${c}`;
    console.log(JSON.stringify({ ...X.searchOne(spec, Number(k), smoke ? SMOKE : {}), smoke }));
} else if (args[0] === "train") {
    const workers = Number(val("--workers", 4)), done = new Set(readJobs().map((r) => `${r.spec}:${r.k}`));
    const todo = X.SPECS.flatMap((s) => Array.from({ length: X.RECIPE.runs }, (_, k) => [s, k])).filter(([s, k]) => !done.has(`${s}:${k}`));
    console.log(`[h5 train] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [s, k] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${s}:${k}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h5 train] ${s} search ${k} seed ${r.seed}: held-out ${r.heldScore.toFixed(4)}, train ${r.trainScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h5 train] ${s} search ${k} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h5 train] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`);
    process.exitCode = failed ? 1 : 0;
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", eng + "brain/rig-results/head-to-head5-training.jsonl"));
    if (!fs.existsSync(inFile)) { console.error(`no training file at ${inFile} (run train first)`); process.exit(2); }
    const rows = fs.readFileSync(inFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (rows.some((r) => r.smoke)) { console.error("the training file holds SMOKE records: fly refuses them (train again without --smoke)"); process.exit(2); }
    const champions = new Map();
    for (const s of X.SPECS) { const runs = rows.filter((r) => r.spec === s); try { champions.set(s, X.championOf(s, runs)); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    const wip = JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
    const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
    const au = X.audit(wip, champions, { range, seconds }), lines = X.report(au);
    for (const l of lines) console.log(l);
    const dir = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "head-to-head5.json"), JSON.stringify({ range, seconds, report: lines, dark: au.dark, lit: au.lit, champions: Object.fromEntries([...champions].map(([s, c]) => [s, { heldScore: c.heldScore, seed: c.seed, k: c.k, searches: c.searches }])) }));
} else { console.error("usage: train | fly | --one SPEC:K   (see the header)"); process.exit(2); }
