// WebGLEngine/tools/ship/lesionLeftSideCmd.mjs -- UNNUMBERED (export-free on purpose; the library is tools/ship/lesionLeftSide.mjs, the registration brain/LESION_LEFT_SIDE_WIP.md)
//   node tools/ship/lesionLeftSideCmd.mjs run --out <file.jsonl> [--part i/n]      flies the registered arms (part i of n: every arm whose index in the plan is i mod n), resumable (an arm already in --out is not flown again)
//   node tools/ship/lesionLeftSideCmd.mjs report --in <file.jsonl>[,<file.jsonl>...]  the checks, the primary verdict and the secondary readings
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as R from "./lesionLeftSide.mjs";
import * as LF from "../../brain/lesionFlyCx.mjs";
const eng = fileURLToPath(new URL("../../", import.meta.url)), WEIGHTS = "brain/pilotSubFlyCxWip.json", CIRCUIT = "vendor/hemibrain/hemibrain-cx-heading-loop.json";
const args = process.argv.slice(2), cmd = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const raw = fs.readFileSync(eng + WEIGHTS), sha256 = crypto.createHash("sha256").update(raw).digest("hex");
const [base] = LF.flyCxArms({ circuit: JSON.parse(fs.readFileSync(eng + CIRCUIT, "utf8")), file: JSON.parse(raw.toString("utf8")) }), plan = R.planArms(base);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
if (cmd === "run") {
    const out = val("--out"), [i, n] = (val("--part", "0/1")).split("/").map(Number);
    if (!out || !(n >= 1 && i >= 0 && i < n)) { console.error("usage: run --out <file.jsonl> [--part i/n]"); process.exit(2); }
    const have = read(out), done = new Set(have.filter((r) => r.kind === "arm").map((r) => r.id));
    if (!have.some((r) => r.kind === "header")) fs.appendFileSync(out, JSON.stringify({ kind: "header", sha256, seed: R.SEED, from: R.IDS.from, to: R.IDS.to, seconds: R.SECONDS, weights: WEIGHTS }) + "\n");
    const mine = plan.filter((_, k) => k % n === i && !done.has(plan[k].id));
    console.log(`[lesionLeftSide] part ${i}/${n}: ${mine.length} arms to fly (${plan.length} in the plan, ${done.size} already in ${out})`);
    let k = 0; for (const p of mine) { fs.appendFileSync(out, JSON.stringify(R.flyArm(p)) + "\n"); if (++k % 20 === 0) console.log(`[lesionLeftSide] part ${i}/${n}: ${k} of ${mine.length}`); }
    console.log(`[lesionLeftSide] part ${i}/${n}: done`);
} else if (cmd === "report") {
    const files = (val("--in") || "").split(",").filter(Boolean); if (!files.length) { console.error("usage: report --in <file.jsonl>[,...]"); process.exit(2); }
    const recs = files.flatMap(read), heads = recs.filter((r) => r.kind === "header"), merged = [...(heads.length ? [heads[0]] : []), ...recs.filter((r) => r.kind === "arm")];
    if (heads.some((h) => JSON.stringify(h) !== JSON.stringify(heads[0]))) console.log("CHECKS: the parts' headers differ -- " + heads.map((h) => JSON.stringify(h)).join(" / "));
    for (const l of R.reportLines(merged, { plan, sha256 })) console.log(l);
} else { console.error("usage: lesionLeftSideCmd.mjs run|report ..."); process.exit(2); }
