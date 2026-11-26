// WebGLEngine/tools/ship/headToHead47Cmd.mjs -- the command for tools/ship/headToHead47.mjs (export-free on purpose). Round H47 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead47Cmd.mjs laws [--smoke]     fly H27's q01 and q02 laws on the train ids and the held-out ids and write the four constants (brain/rig-results/head-to-head47-constants.json); search and fly read them
//   node tools/ship/headToHead47Cmd.mjs search [--workers 4] [--out brain/rig-results/head-to-head47-search.jsonl] [--smoke]     the 4 searches (H32's (1+1)-ES with ONLY the objective changed: the smaller of the margins over q01 at 0.01 and q02 at 0.02, group R12, 1800 iterations on the 72 train ids, seeds 26011-26014, checkpoints 900/1200/1500/1800), one process each, each RESUMING from brain/rig-results/head-to-head47-state-<seed>.json when it exists (a state of other prices or constants is refused); a search already in the file is not run again
//   node tools/ship/headToHead47Cmd.mjs fly [--in brain/rig-results/head-to-head47-search.jsonl] [--parts 4] [--from 47200 --to 47399] [--seconds 160] [--out brain/rig-results]     the thirteen arms flown dark and lit, the report, head-to-head47.json
//   node tools/ship/headToHead47Cmd.mjs fly --from-json brain/rig-results/head-to-head47.json     report the runs of an earlier flight again (no audit flight)
//   node tools/ship/headToHead47Cmd.mjs --one SEED [--smoke]     the child's mode: one resumable search, printed as one JSON line
//   node tools/ship/headToHead47Cmd.mjs --part 2/4 --sets-file <path> [--from ... --to ... --seconds ...] --to-file <path>     the child's mode of fly
// `--smoke` searches for 6 iterations (checkpoints at 2, 4 and 6, state every 2) on 2 + 2 train ids at 40 s into a temporary state directory (the plumbing, not the recipe); its records are marked and `fly` refuses them.
// Reads H27's and H32's stored results (H32's four 1800-iteration networks, its search, start value and resume proof) and network-Wip; nothing of theirs is written.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead47.mjs";
import * as X32 from "./headToHead32.mjs";
import * as X27 from "./headToHead27.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke");
const RR = eng + "brain/rig-results/";
const SMOKE = { iters: 6, checkpoints: [2, 4, 6], stateEvery: 2, train: [{ from: 26000, to: 26001 }, { from: 30000, to: 30001 }], held: { from: X.HELD.from, to: X.HELD.from + 1 }, seconds: 40 };
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const readJ = (f) => JSON.parse(fs.readFileSync(RR + f, "utf8"));
const h27Sets = () => { const f = readJ("head-to-head27.json").fresh; return { laws: [f.laws[1], f.laws[2]] }; };
const lawsOf = () => { const h = h27Sets(); return { q01: h.laws[0], q02: h.laws[1] }; };
const constFile = () => path.join(smoke ? (process.env.H47_SMOKE_STATE || path.join(os.tmpdir(), "h47-smoke-state")) : RR, "head-to-head47-constants.json");
const loadConsts = () => { if (!fs.existsSync(constFile())) { console.error(`no constants at ${constFile()} (run laws first)`); process.exit(2); } return JSON.parse(fs.readFileSync(constFile(), "utf8")).consts; };
const h32Rows = () => readRows(RR + "head-to-head32-search.jsonl");
const s32Sets = () => ({ nets: X32.SEEDS.S02.map((s) => h32Rows().find((r) => r.seed === s).checkpoints.find((k) => k.iter === 1800).weights) });
const originals = () => ({ original: { search: readRows(RR + "head-to-head27-search.jsonl") }, h32: { search: h32Rows() }, earlier: h32Rows().map((x) => x.seed), proof32: readJ("head-to-head32-proof.json") });
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const freshOf = (rows) => ({ nets: X.SEEDS.R12.map((s) => rows.find((r) => r.seed === s && r.group === "R12").checkpoints.find((k) => k.iter === 1800).weights) });
const stateDir = () => (smoke ? (process.env.H47_SMOKE_STATE || path.join(os.tmpdir(), "h47-smoke-state")) : RR), stateFile = (seed) => path.join(stateDir(), `head-to-head47-state-${seed}.json`);
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head47.json"), JSON.stringify({ range: au.range, seconds: au.seconds, fresh: au.fresh, search: au.search, fixture: au.fixture, startVal: au.startVal, constants: au.constants, constantsAgain: au.constantsAgain, report: lines, dark: au.dark, lit: au.lit }));
};
if (args[0] === "laws") {
    const consts = X.lawConstants(lawsOf(), smoke ? { train: SMOKE.train, held: [SMOKE.held], seconds: SMOKE.seconds } : {}), file = constFile();
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ consts, smoke }));
    console.log(`[h47 laws] constants ${JSON.stringify(consts)} written to ${file}`);
} else if (has("--one")) {
    const seed = val("--one", ""), group = "R12", consts = loadConsts(); const file = stateFile(Number(seed)), opts = smoke ? SMOKE : {};
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const state = X.loadState(fs, file, { seed: Number(seed), group, ...(smoke ? { iters: SMOKE.iters, checkpoints: SMOKE.checkpoints } : {}) });
    console.log(JSON.stringify({ ...X.longSearch(Number(seed), group, loadWip(), { ...opts, consts, state, save: (s) => X.saveStateAtomic(fs, file, s) }), smoke }));
} else if (args[0] === "search") {
    const outFile = path.resolve(val("--out", smoke ? path.join(os.tmpdir(), "h47-smoke-search.jsonl") : RR + "head-to-head47-search.jsonl")), done = new Set(readRows(outFile).map((r) => `${r.seed}:${r.group}`)), workers = Number(val("--workers", 4));
    const todo = X.SEEDS.R12.map((s) => [s, "R12"]).filter(([s, g]) => !done.has(`${s}:${g}`));
    console.log(`[h47 search] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    let running = 0, next = 0, failed = 0;
    await new Promise((resolve) => {
        const launch = () => {
            while (running < workers && next < todo.length) {
                const [seed, group] = todo[next++], t0 = Date.now(); running++;
                const child = spawn(process.execPath, [self, "--one", `${seed}`, ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "pipe", "inherit"] });
                let buf = ""; child.stdout.on("data", (d) => { buf += d; });
                child.on("close", (code) => {
                    running--;
                    const line = buf.split("\n").filter(Boolean).pop();
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h47 search] ${group} seed ${seed}: start ${r.startTrain.toFixed(4)}; ${r.checkpoints.map((k) => `${k.iter}: train ${k.trainScore.toFixed(4)} held ${k.heldScore.toFixed(4)} acc ${k.accepted}`).join("; ")}; lost-flights ${r.lostFlights} (${Math.round((Date.now() - t0) / 1000)} s)`); }
                    else { failed++; console.log(`[h47 search] ${group} seed ${seed} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h47 search] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`); process.exitCode = failed ? 1 : 0;
} else if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const sets = JSON.parse(fs.readFileSync(sf, "utf8")), au = X.audit(loadWip(), sets.h27, sets.s32, sets.fresh, { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), wip = loadWip();
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, wip, h27: h27Sets(), s32: s32Sets(), fresh: j.fresh, search: j.search, ...originals(), startVal: j.startVal, constants: j.constants, constantsAgain: j.constantsAgain, fixture: j.fixture,  c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", RR + "head-to-head47-search.jsonl")), rows = readRows(inFile);
    if (!rows.length) { console.error(`no search file at ${inFile} (run search first)`); process.exit(2); }
    if (rows.some((r) => r.smoke)) { console.error("the search file holds SMOKE records: fly refuses them (search again without --smoke)"); process.exit(2); }
    let fresh; try { fresh = freshOf(rows); X.champion(rows, 1800); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const wip = loadWip(), h27 = h27Sets(), s32 = s32Sets(), fixture = X.fixtureOf(), constants = loadConsts(), startVal = X.startVal(wip, constants), constantsAgain = X.lawConstants(lawsOf());
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h47-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ h27, s32, fresh }));
    console.log(`[h47] 1800-iteration champion: seed ${X.champion(rows, 1800).seed}; flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const ordered = [...rows].sort((a, b) => a.seed - b.seed);
    finish({ dark, lit, range, seconds, wip, h27, s32, fresh, search: ordered, ...originals(), constants, constantsAgain, startVal, fixture, c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else { console.error("usage: search | fly | --one SEED   (see the header)"); process.exit(2); }
