// WebGLEngine/tools/ship/headToHead33Cmd.mjs -- the command for tools/ship/headToHead33.mjs (export-free on purpose). Round H33 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead33Cmd.mjs fly [--parts 4] [--from 33200 --to 33399] [--seconds 160] [--out brain/rig-results]     the ten arms flown dark and lit on the fresh ids, the 10-id re-fly of H32's audit, the report, head-to-head33.json
//   node tools/ship/headToHead33Cmd.mjs fly --from-json brain/rig-results/head-to-head33.json     report the runs of an earlier flight again (no audit flight)
//   node tools/ship/headToHead33Cmd.mjs --part 2/4 --sets-file <path> [--from ... --to ... --seconds ...] --to-file <path>     the child's mode of fly
// Reads H32's brain/rig-results/head-to-head32.json (the four champions and the stored audit) and head-to-head32-search.jsonl, H27's, H29's and H30's results; nothing is searched.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead33.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const RR = eng + "brain/rig-results/";
const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const loadWip = () => JSON.parse(fs.readFileSync(eng + "brain/pilotSubWeightsWip.json", "utf8")).weights;
const readJ = (f) => JSON.parse(fs.readFileSync(RR + f, "utf8"));
const h27Sets = () => { const j = readJ("head-to-head27.json"); return { laws: [j.fresh.laws[2]], nets: [j.fresh.nets[1]] }; };
const h29Sets = () => ({ nets: [readJ("head-to-head29.json").fresh.nets[2]] });
const h30Sets = () => ({ nets: [readJ("head-to-head30.json").fresh.nets[2]] });
const originals = () => ({ original: { search: readRows(RR + "head-to-head27-search.jsonl") }, original29: { search: readRows(RR + "head-to-head29-search.jsonl") }, original30: { search: readRows(RR + "head-to-head30-search.jsonl") } });
const h32 = () => { const j = readJ("head-to-head32.json"); return { fresh: j.fresh, h32: { search: readRows(RR + "head-to-head32-search.jsonl"), fresh: j.fresh }, prior: { range: j.range, dark: j.dark, lit: j.lit } }; };
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head33.json"), JSON.stringify({ range: au.range, seconds: au.seconds, fixture: au.fixture, refly: au.refly, report: lines, dark: au.dark, lit: au.lit }));
};
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null), sf = val("--sets-file", null);
    if (!file || !sf) { console.error("--part needs --to-file and --sets-file"); process.exit(2); }
    const sets = JSON.parse(fs.readFileSync(sf, "utf8")), au = X.audit(loadWip(), sets.h27, sets.h29, sets.h30, sets.fresh, { range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8")), wip = loadWip(), s = h32();
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, wip, h27: h27Sets(), h29: h29Sets(), h30: h30Sets(), fresh: s.fresh, h32: s.h32, prior: s.prior, refly: j.refly, ...originals(), fixture: j.fixture, c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else if (args[0] === "fly") {
    const wip = loadWip(), h27 = h27Sets(), h29 = h29Sets(), h30 = h30Sets(), s = h32(), fixture = X.fixtureOf();
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h33-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`)), sfile = path.join(tmp, "sets.json");
    fs.writeFileSync(sfile, JSON.stringify({ h27, h29, h30, fresh: s.fresh }));
    console.log(`[h33] flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--sets-file", sfile, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("[h33] re-flying c02 and s02_1800 on H32's ids 32200-32209 (dark and lit)");
    const refly = X.reflyOf(wip, h27, h29, h30, s.fresh, { seconds });
    finish({ dark, lit, range, seconds, wip, h27, h29, h30, fresh: s.fresh, h32: s.h32, prior: s.prior, refly, ...originals(), fixture, c02: X.LAW_C02.slice() }, path.resolve(val("--out", RR)));
} else { console.error("usage: fly | --part   (see the header)"); process.exit(2); }
