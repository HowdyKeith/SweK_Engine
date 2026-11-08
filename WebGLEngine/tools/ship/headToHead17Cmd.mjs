// WebGLEngine/tools/ship/headToHead17Cmd.mjs -- the command for tools/ship/headToHead17.mjs (export-free on purpose). Round H17 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead17Cmd.mjs search [--workers 4] [--out brain/rig-results/head-to-head17-search.jsonl] [--iters 300] [--smoke]     the twelve searches, one process each; a search already in the file is not run again
//   node tools/ship/headToHead17Cmd.mjs fly [--in brain/rig-results/head-to-head17-search.jsonl] [--parts 4] [--from 17200 --to 17399] [--seconds 160] [--out brain/rig-results]     the two champions and the rest flown dark and lit, the report, head-to-head17.json
//   node tools/ship/headToHead17Cmd.mjs fly --from-json brain/rig-results/head-to-head17.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead17Cmd.mjs --one 17001:A [--iters 300]     the child's mode: one search, printed as one JSON line
//   node tools/ship/headToHead17Cmd.mjs --part 2/4 --lawA "c,d,k,s" --lawB "c,d,k,s" --to-file <path> [--from ... --to ... --seconds ...]     the child's mode of fly
// `--smoke` searches for 3 iterations on 2 train ids at 40 s (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead17.mjs";
import * as H7 from "./headToHead7.mjs";
import * as H9 from "./headToHead9.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), iters = Number(val("--iters", smoke ? 3 : X.ITERS));
const SMOKE = { train: { from: X.TRAIN.from, to: X.TRAIN.from + 1 }, held: { from: X.HELD.from, to: X.HELD.from + 1 }, seconds: 40 };
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadNets = () => {
    const nets = new Map();
    for (const n of H9.SHIPPED) nets.set("network-" + n, JSON.parse(fs.readFileSync(eng + (n === "Wip" ? "brain/pilotSubWeightsWip.json" : `brain/pilotSubWeights${n}Wip.json`), "utf8")).weights);
    const h7 = path.resolve(eng + "brain/rig-results/head-to-head7-training.jsonl");
    if (!fs.existsSync(h7)) { console.error(`no H7 training file at ${h7}`); process.exit(2); }
    const rows = readRows(h7); if (rows.some((r) => r.smoke)) { console.error("the H7 training file holds SMOKE records"); process.exit(2); }
    for (const rc of H7.RECIPES) for (let r = 0; r < H7.REPLICATES; r++) { try { nets.set(`${rc}-${r}`, H7.championOf(rc, r, rows.filter((o) => o.recipe === rc && o.rep === r)).weights); } catch (e) { console.error(String(e.message)); process.exit(2); } }
    return nets;
};
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const lawOf = (k) => val(k, "").split(",").map(Number);
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head17.json"), JSON.stringify({ range: au.range, seconds: au.seconds, lawA: au.lawA, lawB: au.lawB, search: au.search, report: lines, dark: au.dark, lit: au.lit }));
};

if (has("--one")) {
    const [seed, group] = val("--one", ":").split(":");
    console.log(JSON.stringify({ ...X.searchOne(Number(seed), group, { iters, ...(smoke ? SMOKE : {}) }), smoke }));
} else if (args[0] === "search") {
    const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head17-search.jsonl")), done = new Set(readRows(outFile).map((r) => `${r.seed}:${r.group}`)), workers = Number(val("--workers", 4));
    const todo = [...X.SEEDS_A.map((s) => [s, "A"]), ...X.SEEDS_B.map((s) => [s, "B"])].filter(([s, g]) => !done.has(`${s}:${g}`));
    console.log(`[h17 search] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [seed, group] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${seed}:${group}`, "--iters", String(iters), ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h17 search] ${group} seed ${seed}: law [${r.law.map((v) => v.toFixed(3)).join(" ")}] train ${r.trainScore.toFixed(4)} held ${r.heldScore.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
                    else { failed++; console.log(`[h17 search] ${group} seed ${seed} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h17 search] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`); process.exitCode = failed ? 1 : 0;
} else if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null);
    if (!file) { console.error("--part needs --to-file"); process.exit(2); }
    const au = X.audit(loadNets(), lawOf("--lawA"), lawOf("--lawB"), { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, nets: loadNets(), lawA: j.lawA, lawB: j.lawB, search: j.search, h16Law: X.H16_LAW.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", eng + "brain/rig-results/head-to-head17-search.jsonl")), rows = readRows(inFile);
    if (!rows.length) { console.error(`no search file at ${inFile} (run search first)`); process.exit(2); }
    if (rows.some((r) => r.smoke)) { console.error("the search file holds SMOKE records: fly refuses them (search again without --smoke)"); process.exit(2); }
    let cA, cB; try { cA = X.championOf(rows, "A"); cB = X.championOf(rows, "B"); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h17-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`));
    console.log(`[h17] champA seed ${cA.seed} [${cA.law.join(", ")}]; champB seed ${cB.seed} [${cB.law.join(", ")}]; flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--lawA", cA.law.join(","), "--lawB", cB.law.join(","), "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const ordered = [...rows].sort((a, b) => (a.group === b.group ? a.seed - b.seed : a.group < b.group ? -1 : 1));
    finish({ dark, lit, range, seconds, nets: loadNets(), lawA: cA.law, lawB: cB.law, search: ordered, h16Law: X.H16_LAW.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else { console.error("usage: search | fly | --one SEED:GROUP   (see the header)"); process.exit(2); }
