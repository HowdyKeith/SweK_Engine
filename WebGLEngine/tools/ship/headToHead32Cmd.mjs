// WebGLEngine/tools/ship/headToHead32Cmd.mjs -- the command for tools/ship/headToHead32.mjs (export-free on purpose). Round H32 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead32Cmd.mjs proof [--out brain/rig-results/head-to-head32-proof.json]     the real kill-and-resume proof: a short search straight through, and again in a child KILLED (SIGKILL) after iteration 6 and resumed by a second child from its state file
//   node tools/ship/headToHead32Cmd.mjs search [--workers 4] [--out brain/rig-results/head-to-head32-search.jsonl] [--smoke]     the 4 searches (1800 iterations on 72 train ids at 0.02, checkpoints 900/1200/1500/1800), one process each, each RESUMING from brain/rig-results/head-to-head32-state-<seed>.json when it exists; a seed already in the file is not run again
//   node tools/ship/headToHead32Cmd.mjs fly [--in brain/rig-results/head-to-head32-search.jsonl] [--parts 4] [--from 32200 --to 32399] [--seconds 160] [--out brain/rig-results]     the champions flown dark and lit, the report, head-to-head32.json (refuses without the proof file)
//   node tools/ship/headToHead32Cmd.mjs fly --from-json brain/rig-results/head-to-head32.json     report the runs of an earlier flight again (no audit flight)
//   node tools/ship/headToHead32Cmd.mjs --one SEED:GROUP [--smoke]     the child's mode: one resumable search, printed as one JSON line
//   node tools/ship/headToHead32Cmd.mjs --part 2/4 --sets-file <path> [--from ... --to ... --seconds ...] --to-file <path>     the child's mode of fly
// `--smoke` searches for 6 iterations (checkpoints at 2, 4 and 6, state every 2) on 2 + 2 train ids at 40 s into a temporary state directory (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead32.mjs";
import * as X30 from "./headToHead30.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke");
const RR = eng + "brain/rig-results/";
const tiny = { train: [{ from: X30.TRAIN_OLD.from, to: X30.TRAIN_OLD.from + 1 }, { from: X30.TRAIN_NEW.from, to: X30.TRAIN_NEW.from + 1 }], held: { from: X.HELD.from, to: X.HELD.from + 1 }, seconds: 40 };
const SMOKE = { iters: 6, checkpoints: [2, 4, 6], stateEvery: 2, ...tiny };
const PROOF = { iters: 12, checkpoints: [8, 12], stateEvery: 4, ...tiny }, PROOF_SEED = 26011, KILL_AT = 6;
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const readJ = (f) => JSON.parse(fs.readFileSync(RR + f, "utf8"));
const h27Rows = () => readRows(RR + "head-to-head27-search.jsonl"), h29Rows = () => readRows(RR + "head-to-head29-search.jsonl"), h30Rows = () => readRows(RR + "head-to-head30-search.jsonl");
const h27Sets = () => { const j = readJ("head-to-head27.json"); return { laws: [j.fresh.laws[2]], nets: [j.fresh.nets[1]] }; };
const h29Sets = () => ({ nets: [readJ("head-to-head29.json").fresh.nets[2]] });
const h30Sets = () => ({ nets: [readJ("head-to-head30.json").fresh.nets[2]] });
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const freshOf = (rows) => ({ nets: X.CHECKPOINTS.map((it) => X.champion(rows, it).weights) });
const originals = () => ({ original: { search: h27Rows() }, original29: { search: h29Rows() }, original30: { search: h30Rows() } });
const stateDir = () => (smoke ? (process.env.H32_SMOKE_STATE || path.join(os.tmpdir(), "h32-smoke-state")) : RR), stateFile = (seed) => path.join(stateDir(), `head-to-head32-state-${seed}.json`);
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head32.json"), JSON.stringify({ range: au.range, seconds: au.seconds, fresh: au.fresh, search: au.search, fixture: au.fixture, startVal: au.startVal, proof: au.proof, report: lines, dark: au.dark, lit: au.lit }));
};
const runChild = (extra) => new Promise((resolve) => { const c = spawn(process.execPath, [self, ...extra], { stdio: ["ignore", "pipe", "inherit"] }); let buf = ""; c.stdout.on("data", (d) => { buf += d; }); c.on("close", (code, signal) => resolve({ code, signal, out: buf })); });

if (has("--one")) {
    const [seed, group] = val("--one", ":").split(":"), file = stateFile(Number(seed)), opts = smoke ? SMOKE : {};
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const state = X.loadState(fs, file, { seed: Number(seed), group, ...(smoke ? { iters: SMOKE.iters, checkpoints: SMOKE.checkpoints } : {}) });
    console.log(JSON.stringify({ ...X.longSearch(Number(seed), group, loadWip(), { ...opts, state, save: (s) => X.saveStateAtomic(fs, file, s) }), smoke }));
} else if (has("--proof-child")) {
    const mode = val("--proof-child", ""), file = val("--state", ""), wip = loadWip(), ctx = { seed: PROOF_SEED, group: "S02", iters: PROOF.iters, checkpoints: PROOF.checkpoints };
    if (mode === "kill") X.longSearch(PROOF_SEED, "S02", wip, { ...PROOF, save: (s) => X.saveStateAtomic(fs, file, s), onIteration: (n) => { if (n === KILL_AT) process.kill(process.pid, "SIGKILL"); } });
    else if (mode === "resume") console.log(JSON.stringify(X.longSearch(PROOF_SEED, "S02", wip, { ...PROOF, state: X.loadState(fs, file, ctx), save: (s) => X.saveStateAtomic(fs, file, s) })));
    else { console.error("--proof-child kill|resume"); process.exit(2); }
} else if (args[0] === "proof") {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h32-proof-")), file = path.join(tmp, "state.json"), wip = loadWip();
    const straight = X.longSearch(PROOF_SEED, "S02", wip, { ...PROOF });
    const a = await runChild(["--proof-child", "kill", "--state", file]);
    if (a.signal !== "SIGKILL") { console.error(`the first child was not killed (code ${a.code}, signal ${a.signal})`); process.exit(1); }
    const st = JSON.parse(fs.readFileSync(file, "utf8")), b = await runChild(["--proof-child", "resume", "--state", file]);
    if (b.code !== 0) { console.error(`the resume child failed (code ${b.code})`); process.exit(1); }
    const resumed = JSON.parse(b.out.split("\n").filter(Boolean).pop()), out = path.resolve(val("--out", RR + "head-to-head32-proof.json"));
    const rec = { config: { iters: PROOF.iters, checkpoints: PROOF.checkpoints, stateEvery: PROOF.stateEvery, seed: PROOF_SEED }, killedAt: KILL_AT, signal: a.signal, resumedFrom: st.iter, straight, resumed };
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(rec)); fs.rmSync(tmp, { recursive: true, force: true });
    const same = JSON.stringify([straight.startTrain, straight.lostFlights, straight.draws, straight.finalWeights, straight.checkpoints]) === JSON.stringify([resumed.startTrain, resumed.lostFlights, resumed.draws, resumed.finalWeights, resumed.checkpoints]);
    console.log(`[h32 proof] killed after iteration ${KILL_AT} (${a.signal}), resumed from the state at ${st.iter}: ${same ? "IDENTICAL" : "DIFFERENT"} (draws ${straight.draws} straight, ${resumed.draws} resumed)`); process.exitCode = same ? 0 : 1;
} else if (args[0] === "search") {
    const outFile = path.resolve(val("--out", RR + "head-to-head32-search.jsonl")), done = new Set(readRows(outFile).map((r) => `${r.seed}:${r.group}`)), workers = Number(val("--workers", 4));
    const todo = X.GROUPS.flatMap((g) => X.SEEDS[g].map((s) => [s, g])).filter(([s, g]) => !done.has(`${s}:${g}`));
    console.log(`[h32 search] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [seed, group] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${seed}:${group}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h32 search] ${group} seed ${seed}: start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}; lost-flights ${r.lostFlights}${r.resumes.length ? `; resumed from ${r.resumes.join(", ")}` : ""} (${Math.round((Date.now() - t0) / 1000)} s)`); }
                    else { failed++; console.log(`[h32 search] ${group} seed ${seed} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h32 search] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`); process.exitCode = failed ? 1 : 0;
} else if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const sets = JSON.parse(fs.readFileSync(sf, "utf8")), au = X.audit(loadWip(), sets.h27, sets.h29, sets.h30, sets.fresh, { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), wip = loadWip();
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, wip, h27: h27Sets(), h29: h29Sets(), h30: h30Sets(), fresh: j.fresh, search: j.search, proof: j.proof, ...originals(), fixture: X.fixtureOf(), startVal: X.startVal(wip), c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", RR + "head-to-head32-search.jsonl")), rows = readRows(inFile), proofFile = RR + "head-to-head32-proof.json";
    if (!rows.length) { console.error(`no search file at ${inFile} (run search first)`); process.exit(2); }
    if (rows.some((r) => r.smoke)) { console.error("the search file holds SMOKE records: fly refuses them (search again without --smoke)"); process.exit(2); }
    if (!fs.existsSync(proofFile)) { console.error(`no proof file at ${proofFile} (run proof first)`); process.exit(2); }
    let fresh; try { fresh = freshOf(rows); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const wip = loadWip(), h27 = h27Sets(), h29 = h29Sets(), h30 = h30Sets(), sv = X.startVal(wip), fixture = X.fixtureOf(), proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h32-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ h27, h29, h30, fresh }));
    console.log(`[h32] 1800-iteration champion: seed ${X.champion(rows, 1800).seed}; flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const ordered = [...rows].sort((a, b) => (a.group === b.group ? a.seed - b.seed : a.group < b.group ? -1 : 1));
    finish({ dark, lit, range, seconds, wip, h27, h29, h30, fresh, search: ordered, proof, ...originals(), fixture, startVal: sv, c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else { console.error("usage: proof | search | fly | --one SEED:GROUP   (see the header)"); process.exit(2); }
