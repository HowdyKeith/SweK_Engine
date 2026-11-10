// WebGLEngine/tools/ship/headToHead42Cmd.mjs -- the command for tools/ship/headToHead42.mjs (export-free on purpose). Round H42 of brain/HEAD_TO_HEAD.md. THERE IS NO SEARCH MODE: the networks are the stored checkpoint weights.
//   node tools/ship/headToHead42Cmd.mjs fly [--parts 4] [--out brain/rig-results] [--seconds 160] [--smoke]     the 32 networks flown dark and lit on HO, HA and HB, the report, head-to-head42.json
//   node tools/ship/headToHead42Cmd.mjs fly --from-json brain/rig-results/head-to-head42.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead42Cmd.mjs --part 2/4 --to-file <path> [--seconds ...] [--smoke]     the child's mode of fly
// Reads H32's and H34's stored searches (brain/rig-results/head-to-head32-search.jsonl, head-to-head34-search.jsonl), H34's stored audit (head-to-head34.json) and H35's (head-to-head35.json) when it exists; nothing of theirs is written.
// `--smoke` flies the sets cut to 2 ids each at 40 s (the plumbing: its re-fly check reads NOT WEIGHED because the stored values are of 40 ids).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead42.mjs";
import * as X27 from "./headToHead27.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url), RR = eng + "brain/rig-results/";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const smoke = has("--smoke"), seconds = Number(val("--seconds", smoke ? 40 : X.SECONDS));
const readRows = (f) => fs.readFileSync(RR + f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const readJ = (f) => (fs.existsSync(RR + f) ? JSON.parse(fs.readFileSync(RR + f, "utf8")) : null);
const stored = () => ({ S02: readRows("head-to-head32-search.jsonl").filter((r) => r.group === "S02"), T02: readRows("head-to-head34-search.jsonl").filter((r) => r.group === "T02") });
const sets = smoke ? Object.fromEntries(X.SET_IDS.map((k) => [k, { from: X.SETS[k].from, to: X.SETS[k].from + 1 }])) : X.SETS;
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head42.json"), JSON.stringify({ seconds: au.seconds, smoke, evals: au.evals, fixture: au.fixture, audit34Range: au.audit34Range, haveAudit35: !!au.audit35, report: lines }));
};
const assemble = (evals, fixture) => {
    const rows = stored(), nets = X.netsOf(rows), a34 = readJ("head-to-head34.json"), a35 = readJ("head-to-head35.json");
    return { evals, rows, weights: nets.map((n) => n.weights), fixture, audit34: a34 ? { dark: a34.dark, lit: a34.lit } : null, audit34Range: a34 ? a34.range : null, audit35: a35 ? { dark: a35.dark, lit: a35.lit } : null, searched: false, seconds };
};
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null);
    if (!file) { console.error("--part needs --to-file"); process.exit(2); }
    const nets = X.netsOf(stored()).filter((_, i) => i % P === p);
    fs.writeFileSync(file, JSON.stringify(nets.map((n) => X.evalNet(n, { sets, seconds }))));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    finish(assemble(j.evals, j.fixture), path.resolve(val("--out", RR)));
} else if (args[0] === "fly") {
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h42-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`));
    console.log(`[h42] flying the 32 stored networks on HO, HA and HB (${seconds} s, dark and lit) in ${parts} parts${smoke ? " (SMOKE)" : ""}; no search`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => { const c = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--to-file", f, "--seconds", String(seconds), ...(smoke ? ["--smoke"] : [])], { stdio: ["ignore", "inherit", "inherit"] }); c.on("close", resolve); })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const byId = new Map(); for (const f of files) for (const e of JSON.parse(fs.readFileSync(f, "utf8"))) byId.set(e.id, e);
    fs.rmSync(tmp, { recursive: true, force: true });
    const order = X.netsOf(stored()).map((n) => byId.get(n.id)), fixture = X27.fixtureOf();
    finish(assemble(order, fixture), path.resolve(val("--out", RR)));
} else { console.error("usage: fly | fly --from-json | --part P/N   (see the header; there is no search mode)"); process.exit(2); }
