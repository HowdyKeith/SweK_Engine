// WebGLEngine/tools/ship/headToHead27Cmd.mjs -- the command for tools/ship/headToHead27.mjs (export-free on purpose). Round H27 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead27Cmd.mjs search [--workers 4] [--out brain/rig-results/head-to-head27-search.jsonl] [--smoke]     the 36 searches (12 network searches first, then 24 law searches), one process each; a search already in the file is not run again
//   node tools/ship/headToHead27Cmd.mjs fly [--in brain/rig-results/head-to-head27-search.jsonl] [--parts 4] [--from 27200 --to 27399] [--seconds 160] [--out brain/rig-results]     the stored and new champions flown dark and lit, the report, head-to-head27.json
//   node tools/ship/headToHead27Cmd.mjs fly --from-json brain/rig-results/head-to-head27.json     report the runs of an earlier flight again (no audit flight; the fixtures and the starts are recomputed)
//   node tools/ship/headToHead27Cmd.mjs --one SEED:GROUP     the child's mode: one search, printed as one JSON line
//   node tools/ship/headToHead27Cmd.mjs --part 2/4 --sets-file <path> [--from ... --to ... --seconds ...] --to-file <path>     the child's mode of fly
// `--smoke` searches for 3 iterations on 2 train ids at 40 s (the plumbing, not the recipe); its records are marked and `fly` refuses them.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead27.mjs";
import * as X25 from "./headToHead25.mjs";
import * as X26 from "./headToHead26.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke");
const SMOKE_LAW = { iters: 3, train: { from: X.LAW_TRAIN.from, to: X.LAW_TRAIN.from + 1 }, held: { from: X.LAW_HELD.from, to: X.LAW_HELD.from + 1 }, seconds: 40 }, SMOKE_NET = { iters: 3, train: { from: X.NET_TRAIN.from, to: X.NET_TRAIN.from + 1 }, held: { from: X.NET_HELD.from, to: X.NET_HELD.from + 1 }, seconds: 40 };
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const stored = () => ({ laws: readRows(eng + "brain/rig-results/head-to-head25-search.jsonl"), nets: readRows(eng + "brain/rig-results/head-to-head26-search.jsonl") });
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const setsOf = (rows) => {
    const o = stored(), sl = ["P005", "P01", "P02", "P04"].map((g) => X25.championOf(o.laws, g).law), sn = ["N005", "N02", "N04"].map((g) => X26.championOf(o.nets, g).weights);
    return { original: o, stored: { laws: sl, nets: sn }, fresh: { laws: X.LAW_GROUPS.map((g) => X.lawChampion(rows, g).law), nets: X.NET_GROUPS.map((g) => X.netChampion(rows, g).weights) } };
};
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head27.json"), JSON.stringify({ range: au.range, seconds: au.seconds, fresh: au.fresh, search: au.search, fixture: au.fixture, start: au.start, report: lines, dark: au.dark, lit: au.lit }));
};
const isNetGroup = (g) => X.NET_GROUPS.includes(g);

if (has("--one")) {
    const [seed, group] = val("--one", ":").split(":");
    const row = isNetGroup(group) ? X.netSearch(Number(seed), group, loadWip(), smoke ? SMOKE_NET : {}) : X.lawSearch(Number(seed), group, smoke ? SMOKE_LAW : {});
    console.log(JSON.stringify({ ...row, smoke }));
} else if (args[0] === "search") {
    const outFile = path.resolve(val("--out", eng + "brain/rig-results/head-to-head27-search.jsonl")), done = new Set(readRows(outFile).map((r) => `${r.seed}:${r.group}`)), workers = Number(val("--workers", 4));
    const todo = [...X.NET_GROUPS.flatMap((g) => X.NET_SEEDS[g].map((s) => [s, g])), ...X.LAW_GROUPS.flatMap((g) => X.LAW_SEEDS[g].map((s) => [s, g]))].filter(([s, g]) => !done.has(`${s}:${g}`));
    console.log(`[h27 search] ${todo.length} searches to run, ${done.size} already in ${outFile}, ${workers} workers${smoke ? " (SMOKE)" : ""}`);
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
                    if (code === 0 && line) { fs.appendFileSync(outFile, line + "\n"); const r = JSON.parse(line); console.log(`[h27 search] ${group} seed ${seed}: train ${r.trainScore.toFixed(4)} (start ${r.startTrain.toFixed(4)}) held ${r.heldScore.toFixed(4)} acc ${r.accepted} lost-flights ${r.lostFlights} (${Math.round((Date.now() - t0) / 1000)} s)`); }
                    else { failed++; console.log(`[h27 search] ${group} seed ${seed} FAILED (exit ${code})`); }
                    if (next >= todo.length && running === 0) resolve(); else launch();
                });
            }
            if (!todo.length) resolve();
        };
        launch();
    });
    console.log(`[h27 search] done${failed ? `, ${failed} FAILED (run again to resume)` : ""}`); process.exitCode = failed ? 1 : 0;
} else if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const sets = JSON.parse(fs.readFileSync(sf, "utf8")), au = X.audit(loadWip(), sets.stored, sets.fresh, { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), wip = loadWip(), sets = setsOf(j.search);
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, wip, stored: sets.stored, fresh: j.fresh, search: j.search, original: sets.original, fixture: X.fixtureOf(), start: X.startOf(wip), c02: X.LAW_C02.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else if (args[0] === "fly") {
    const inFile = path.resolve(val("--in", eng + "brain/rig-results/head-to-head27-search.jsonl")), rows = readRows(inFile);
    if (!rows.length) { console.error(`no search file at ${inFile} (run search first)`); process.exit(2); }
    if (rows.some((r) => r.smoke)) { console.error("the search file holds SMOKE records: fly refuses them (search again without --smoke)"); process.exit(2); }
    let sets; try { sets = setsOf(rows); } catch (e) { console.error(String(e.message)); process.exit(2); }
    const wip = loadWip(), start = X.startOf(wip), fixture = X.fixtureOf();
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h27-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ stored: sets.stored, fresh: sets.fresh }));
    console.log(`[h27] new champions: laws ${X.LAW_GROUPS.map((g) => `${g} seed ${X.lawChampion(rows, g).seed}`).join(", ")}; networks ${X.NET_GROUPS.map((g) => `${g} seed ${X.netChampion(rows, g).seed}`).join(", ")}; flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const ordered = [...rows].sort((a, b) => (a.group === b.group ? a.seed - b.seed : a.group < b.group ? -1 : 1));
    finish({ dark, lit, range, seconds, wip, stored: sets.stored, fresh: sets.fresh, search: ordered, original: sets.original, fixture, start, c02: X.LAW_C02.slice() }, path.resolve(val("--out", eng + "brain/rig-results")));
} else { console.error("usage: search | fly | --one SEED:GROUP   (see the header)"); process.exit(2); }
