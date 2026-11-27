// WebGLEngine/tools/ship/headToHead28Cmd.mjs -- the command for tools/ship/headToHead28.mjs (export-free on purpose). Round H28 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead28Cmd.mjs search [--workers 4] [--out brain/rig-results/head-to-head28-search.jsonl] [--smoke]     the 24 searches, one process each; a search already in the file is not run again
//   node tools/ship/headToHead28Cmd.mjs fly [--in brain/rig-results/head-to-head28-search.jsonl] [--parts 4] [--from 28200 --to 28399] [--seconds 160] [--out brain/rig-results]     the champions flown dark and lit, the report, head-to-head28.json
//   node tools/ship/headToHead28Cmd.mjs fly --from-json brain/rig-results/head-to-head28.json     report the runs of an earlier flight again (no audit flight; the fixtures and the start values are recomputed)
//   node tools/ship/headToHead28Cmd.mjs --one SEED:GROUP     the child's mode: one search, printed as one JSON line
//   node tools/ship/headToHead28Cmd.mjs --part 2/4 --sets-file <path> [--from ... --to ... --seconds ...] --to-file <path>     the child's mode of fly
// `--smoke` searches for 3 iterations on 2 train ids at 40 s (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead28.mjs";
import * as X27 from "./headToHead27.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke");
const SMOKE = { iters: 3, train: { from: X.TRAIN.from, to: X.TRAIN.from + 1 }, held: { from: X.HELD.from, to: X.HELD.from + 1 }, seconds: 40 };
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadW = (f) => JSON.parse(fs.readFileSync(eng + "brain/" + f, "utf8")).weights;
const loadWip = () => loadW("pilotSubWeightsWip.json");
const loadStarts = () => ({ ACT: loadW("pilotSubWeightsActuatorsWip.json"), HND: Array.from(PS.handWeights()) });
const h27Rows = () => readRows(eng + "brain/rig-results/head-to-head27-search.jsonl");
const h27Sets = () => { const j = JSON.parse(fs.readFileSync(eng + "brain/rig-results/head-to-head27.json", "utf8")); return { laws: [j.fresh.laws[0], j.fresh.laws[2], j.fresh.laws[3]], nets: j.fresh.nets }; };
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const freshOf = (rows) => ({ nets: X.GROUPS.map((g) => X.champion(rows, g).weights) });
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head28.json"), JSON.stringify({ range: au.range, seconds: au.seconds, fresh: au.fresh, search: au.search, fixture: au.fixture, startVals: au.startVals, report: lines, dark: au.dark, lit: au.lit }));
};

if (has("--one")) {
    const [seed, group] = val("--one", ":").split(":");
    const start = loadStarts()[group[0] === "A" ? "ACT" : "HND"];
    console.log(JSON.stringify({ ...X.netSearch(Number(seed), group, start, smoke ? SMOKE : {}), smoke }));
} else if (args[0] === "search") {
    const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head28-search.jsonl")), done = new Set(readRows(outFile).map((r) => `${r.seed}:${r.group}`)), workers = Number(val("--workers", 4));
    const todo = X.GROUPS.flatMap((g) => X.SEEDS[g].map((s) => [s, g])).filter(([s, g]) => !done.has(`${s}:${g}`));
    console.log(`[h28 search] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
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
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h28 search] ${group} seed ${seed}: train ${r.trainScore.toFixed(4)} (start ${r.startTrain.toFixed(4)}) held ${r.heldScore.toFixed(4)} acc ${r.accepted} lost-flights ${r.lostFlights} (${Math.round((Date.now() - t0) / 1000)} s)`); }
                    else { failed++; console.log(`[h28 search] ${group} seed ${seed} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h28 search] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`); process.exitCode = failed ? 1 : 0;
} else if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const sets = JSON.parse(fs.readFileSync(sf, "utf8")), au = X.audit(loadWip(), sets.h27, sets.fresh, { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), wip = loadWip(), starts = loadStarts();
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, wip, h27: h27Sets(), fresh: j.fresh, search: j.search, original: { search: h27Rows() }, fixture: X.fixtureOf(), startVals: X.startVals(starts), starts, c02: X.LAW_C02.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", eng + "brain/rig-results/head-to-head28-search.jsonl")), rows = readRows(inFile);
    if (!rows.length) { console.error(`no search file at ${inFile} (run search first)`); process.exit(2); }
    if (rows.some((r) => r.smoke)) { console.error("the search file holds SMOKE records: fly refuses them (search again without --smoke)"); process.exit(2); }
    let fresh; try { fresh = freshOf(rows); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const wip = loadWip(), starts = loadStarts(), h27 = h27Sets(), startVal = X.startVals(starts), fixture = X.fixtureOf();
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h28-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ h27, fresh }));
    console.log(`[h28] new champions: ${X.GROUPS.map((g) => `${g} seed ${X.champion(rows, g).seed}`).join(", ")}; flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const ordered = [...rows].sort((a, b) => (a.group === b.group ? a.seed - b.seed : a.group < b.group ? -1 : 1));
    finish({ dark, lit, range, seconds, wip, h27, fresh, search: ordered, original: { search: h27Rows() }, fixture, startVals: startVal, starts, c02: X.LAW_C02.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else { console.error("usage: search | fly | --one SEED:GROUP   (see the header)"); process.exit(2); }
