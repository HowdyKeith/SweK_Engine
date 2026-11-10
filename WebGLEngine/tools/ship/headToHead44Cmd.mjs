// WebGLEngine/tools/ship/headToHead44Cmd.mjs -- the command for tools/ship/headToHead44.mjs (export-free on purpose). Round H44 of brain/HEAD_TO_HEAD.md. THERE IS NO SEARCH MODE: the networks are the stored 1800-iteration weights.
//   node tools/ship/headToHead44Cmd.mjs fly [--parts 4] [--from 44200 --to 44399] [--seconds 160] [--out brain/rig-results] [--smoke]     the twelve arms flown dark and lit, the report, head-to-head44.json
//   node tools/ship/headToHead44Cmd.mjs fly --from-json brain/rig-results/head-to-head44.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead44Cmd.mjs --part 2/4 --to-file <path> [--from ... --to ... --seconds ...]     the child's mode of fly
// Reads H32's and H34's stored searches (head-to-head32-search.jsonl, head-to-head34-search.jsonl), H42's stored flight (head-to-head42.json) and H27's stored results; nothing of theirs is written. `--smoke` flies 2 ids at 40 s (its H42 / ID checks still hold; the plumbing only).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead44.mjs";
import * as X27 from "./headToHead27.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url), RR = eng + "brain/rig-results/";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke");
const range = smoke ? { from: X.IDS.from, to: X.IDS.from + 1 } : { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", smoke ? 40 : X.SECONDS));
const readRows = (f) => fs.readFileSync(RR + f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const stored = () => ({ S02: readRows("head-to-head32-search.jsonl").filter((r) => r.group === "S02"), T02: readRows("head-to-head34-search.jsonl").filter((r) => r.group === "T02") });
const h27Sets = () => ({ laws: [JSON.parse(fs.readFileSync(RR + "head-to-head27.json", "utf8")).fresh.laws[2]] });
const h42Evals = () => { const f = RR + "head-to-head42.json"; if (!fs.existsSync(f)) { console.error(`no H42 flight at ${f}: this round needs its stored HB values`); process.exit(2); } return JSON.parse(fs.readFileSync(f, "utf8")).evals.map((e) => ({ id: e.id, group: e.group, seed: e.seed, iter: e.iter, stored: e.stored, values: e.values })); };
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
// the audit means recomputed directly from the raw runs (the gate's check compares them with the library's)
const meansOf = (dark, lit) => Object.fromEntries(Object.keys(dark).map((a) => { let t = 0; for (let i = 0; i < dark[a].length; i++) { const pd = dark[a][i].bad ? 0 : dark[a][i].score, pl = lit[a][i].bad ? 0 : lit[a][i].score; t += 0.5 * (pd + pl) - 0.02 * 0.5 * (dark[a][i].watts + lit[a][i].watts) / 1000; } return [a, t / dark[a].length]; }));
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head44.json"), JSON.stringify({ range: au.range, seconds: au.seconds, smoke, fixture: au.fixture, means: au.means, report: lines, dark: au.dark, lit: au.lit }));
};
const assemble = (dark, lit, fixture) => { const rows = stored(), nets = X.netsOf(rows); return { dark, lit, range, seconds, h27: h27Sets(), nets, wip: loadWip(), original: { search: fs.readFileSync(RR + "head-to-head27-search.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }, rows, h42: h42Evals(), fixture, means: meansOf(dark, lit), c02: X.LAW_C02.slice() }; };
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null);
    if (!file) { console.error("--part needs --to-file"); process.exit(2); }
    const au = X.audit(h27Sets(), X.netsOf(stored()), { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    Object.assign(range, j.range); finish(assemble(j.dark, j.lit, j.fixture), path.resolve(val("--out", RR)));
} else if (args[0] === "fly") {
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h44-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`));
    h42Evals();
    console.log(`[h44] flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts${smoke ? " (SMOKE)" : ""}; no search`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => { const c = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds), ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "inherit", "inherit"] }); c.on("close", resolve); })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const order = (o) => Object.fromEntries(X.ARM_IDS.map((a) => [a, o[a]]));
    finish(assemble(order(dark), order(lit), X27.fixtureOf()), path.resolve(val("--out", RR)));
} else { console.error("usage: fly | fly --from-json | --part P/N   (see the header; there is no search mode)"); process.exit(2); }
