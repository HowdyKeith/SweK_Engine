// WebGLEngine/tools/ship/needsHeadCmd.mjs -- the command for tools/ship/needsHead.mjs (export-free on purpose). Round H3 of brain/HEAD_TO_HEAD.md.
//   node tools/ship/needsHeadCmd.mjs [--from 15001 --to 15060] [--kinds plain,deep,far,both] [--seconds 600] [--out brain/rig-results]
// Reads the heading-loop circuit and the Piece 4 champions, flies sixteen arms, checks the reproduction of Round 33's rule and seat scores, prints the report and writes <out>/head-to-head-needs.json.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "./needsHead.mjs";
import * as C from "./trainNeedsCircuit.mjs";
import * as B from "../../brain/switchboard.mjs";
import { setOrientationDefault } from "../../physics/mechanics/rigidBody6dof.mjs";
setOrientationDefault("euler");   // 2026-11-04 -- every needs-and-limits number was measured under the first-order orientation step; RK4 is the engine default now, so this command says euler out loud (said by name, not by importing rigidBody6dofEuler: a command is not one of the gates that module is for)
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const eng = fileURLToPath(new URL("../../", import.meta.url));
const records = fs.readFileSync(eng + "brain/rig-results/needsCircuitStageA.rerun-amendment3.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const circuit = C.loadCircuit();
const range = { from: Number(val("--from", X.RANGE.from)), to: Number(val("--to", X.RANGE.to)) }, kinds = val("--kinds", X.KINDS.join(",")).split(","), seconds = val("--seconds", null);
// the reproduction of Round 33: the same three far dives (seeds 12001-12003, gauge sd 0.1, 600 s) of the rules and the seat, against the scores that round recorded
const r33 = (f) => JSON.parse(fs.readFileSync(eng + "brain/rig-results/tolerate-arms/" + f, "utf8")), want = { "rule-r8": r33("sel__L0__REF.json").runs.slice(0, 3).map((r) => r.score), "rule-low06": r33("sel__L-0.06__REF.json").runs.slice(0, 3).map((r) => r.score), "twin-low06": r33("TWIN-WIN__REF__far.json").runs.slice(0, 3).map((r) => r.score) };
const b = B.createBoard().addTask(B.surveyTask); for (const a of B.surveyArms()) b.addArm(a);
const got = b.run("survey", ["rule-r8", "rule-low06"], { from: 12001, to: 12003 }, { kinds: ["far"] }).runs;
const gotTwin = (() => { const q = B.createBoard().addTask(B.surveyTask); for (const a of B.surveyArms()) q.addArm(a); return q.run("survey", ["twin-standard"], { from: 14001, to: 14003 }, { kinds: ["far"] }).runs["twin-standard"]; })();
const same = (a, w) => a.length === w.length && a.every((r, i) => Math.abs(r.score - w[i]) < 1e-12);
const repro = { ...want, ok: same(got["rule-r8"], want["rule-r8"]) && same(got["rule-low06"], want["rule-low06"]) && same(gotTwin, want["twin-low06"]) };
const au = X.audit(circuit, records, { range, kinds, seconds: seconds ? Number(seconds) : null }), lines = X.report(au, repro);
for (const l of lines) console.log(l);
const out = path.resolve(val("--out", eng + "brain/rig-results")); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "head-to-head-needs.json"), JSON.stringify({ range, kinds, repro, report: lines, runs: au.runs }));
