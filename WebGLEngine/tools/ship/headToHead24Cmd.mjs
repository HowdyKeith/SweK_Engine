// WebGLEngine/tools/ship/headToHead24Cmd.mjs -- the command for tools/ship/headToHead24.mjs (export-free on purpose). Round H24 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/headToHead24Cmd.mjs fly [--parts 4] [--from 24200 --to 24399] [--seconds 160] [--out brain/rig-results]     the thirteen arms flown dark and lit, the report, head-to-head24.json
//   node tools/ship/headToHead24Cmd.mjs fly --from-json brain/rig-results/head-to-head24.json     report the runs of an earlier flight again (no flight)
//   node tools/ship/headToHead24Cmd.mjs --part 2/4 --to-file <path> [--from ... --to ... --seconds ...]     the child's mode of fly
// There is no search: every arm is a fixed law.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./headToHead24.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, has = (k) => args.includes(k);
const armsOfPart = (p, P) => X.ARM_IDS.filter((a, i) => a === "autopilot" || i % P === p);
const range = { from: Number(val("--from", X.IDS.from)), to: Number(val("--to", X.IDS.to)) }, seconds = Number(val("--seconds", X.SECONDS));
const finish = (au, out) => {
    const lines = X.report(au); for (const l of lines) console.log(l);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "head-to-head24.json"), JSON.stringify({ range: au.range, seconds: au.seconds, scanLaws: au.scanLaws, fixed: au.fixed, band: au.band, report: lines, dark: au.dark, lit: au.lit }));
};
if (has("--part")) {
    const [p, P] = val("--part", "0/1").split("/").map(Number), file = val("--to-file", null);
    if (!file) { console.error("--part needs --to-file"); process.exit(2); }
    const au = X.audit({ range, seconds, arms: armsOfPart(p, P) });
    fs.writeFileSync(file, JSON.stringify({ dark: au.dark, lit: au.lit }));
} else if (args[0] === "fly" && has("--from-json")) {
    const j = JSON.parse(fs.readFileSync(path.resolve(val("--from-json", "")), "utf8"));
    finish({ dark: j.dark, lit: j.lit, range: j.range, seconds: j.seconds, scanLaws: j.scanLaws, fixed: j.fixed, band: j.band }, path.resolve(val("--out", eng + "brain/rig-results")));
} else if (args[0] === "fly") {
    const parts = Number(val("--parts", 4)), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "h24-")), files = Array.from({ length: parts }, (_, p) => path.join(tmp, `part${p}.json`));
    console.log(`[h24] flying ${X.ARM_IDS.length} arms on ids ${range.from}-${range.to}, ${seconds} s, dark and lit, in ${parts} parts`);
    const codes = await Promise.all(files.map((f, p) => new Promise((resolve) => {
        const child = spawn(process.execPath, [self, "--part", `${p}/${parts}`, "--to-file", f, "--from", String(range.from), "--to", String(range.to), "--seconds", String(seconds)], { stdio: ["ignore", "inherit", "inherit"] });
        child.on("close", resolve);
    })));
    if (codes.some((c) => c !== 0)) { console.error(`a part FAILED (exit codes ${codes.join(", ")})`); process.exit(1); }
    const dark = {}, lit = {};
    for (const f of files) { const d = JSON.parse(fs.readFileSync(f, "utf8")); for (const [a, runs] of Object.entries(d.dark)) if (!(a in dark)) dark[a] = runs; for (const [a, runs] of Object.entries(d.lit)) if (!(a in lit)) lit[a] = runs; }
    fs.rmSync(tmp, { recursive: true, force: true });
    const built = X.audit({ range: { from: range.from, to: range.from }, seconds: 1, arms: ["autopilot"], flyFn: () => [] });
    finish({ dark, lit, range, seconds, scanLaws: built.scanLaws, fixed: built.fixed, band: built.band }, path.resolve(val("--out", eng + "brain/rig-results")));
} else { console.error("usage: fly | --part P/N   (see the header)"); process.exit(2); }
