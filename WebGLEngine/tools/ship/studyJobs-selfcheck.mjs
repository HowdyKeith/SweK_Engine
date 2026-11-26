// WebGLEngine/tools/ship/studyJobs-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GATE OF tools/ship/studyJobs.mjs (the closed registry of studies a peer may run) AND tools/ship/studyRunner.mjs (the command a `study` job runs). A few seconds; no study is flown here.
// NOT CHECKED HERE, said plainly: a whole replay (minutes). One was run by hand on 2026-11-26 in the cloud session: rock-nav-a-dev-replay, 4 parts on 4 cores, 70 s, IDENTICAL on all 240 rows, with the seven
// probe fields Rounds B and C added listed as "recorded since, not compared".
// SABOTAGED 2026-11-26, each on a backup copy, restored after (red rows by name):
//   J1 the registry not frozen: 1 red (1). J2 a part not given --dir: 1 red (1). J3 a replay ignores a non-timing field: 1 red (2). J4 studyOf takes any name: 2 red (3, 9). J5 planOf numbers parts from 0:
//   1 red (3). J6 the file's timing never taken out: 1 red (4). J7 the probe's timing never taken out: 1 red (4). J8 the produced row not cut to the record: 1 red (7). J9 a field the replay lacks not a
//   difference: 1 red (6). J10 the head not compared: 1 red (6). J11 a row count difference ignored: 1 red (6). J12 the first difference not named: 1 red (5). J13 a missing file not INCOMPLETE: 1 red (8).
//   J14 an empty study IDENTICAL: 1 red (8). J15 the runner refuses no worker count: 1 red (9). J16 the runner takes an unknown study: 1 red (9). J17 the queue's study job runs another command: 1 red (10).
//   J18 the bridge takes any study name: 1 red (10). J19 the head's added fields not listed: 1 red (7). J20 reportLines names no study: 1 red (11). J21 stripTiming keeps the file's seconds: 2 red (4, 11).
"use strict";

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SJ from "./studyJobs.mjs";
import * as P from "./peerJobs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const rows = [];
const row = (name, fn) => { let ok = false, detail = ""; try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? r.detail : ""; } catch (e) { ok = false; detail = "threw: " + e.message; } rows.push({ name, ok, detail }); };
const J = JSON.stringify;

row("1 THE REGISTRY IS CLOSED AND WELL FORMED: frozen; ids unique and of the queue's pattern; mode replay or fly; 1 to 16 parts; each part's command is a tools/ship/*.mjs that exists, given --dir and the part as k/K", () => {
    const ids = SJ.STUDIES.map((s) => s.id), bad = [];
    if (!Object.isFrozen(SJ.STUDIES) || !SJ.STUDIES.every((s) => Object.isFrozen(s))) bad.push("not frozen");
    if (new Set(ids).size !== ids.length) bad.push("an id repeats");
    for (const s of SJ.STUDIES) {
        if (!SJ.STUDY.test(s.id)) bad.push(`${s.id}: id`);
        if (!["replay", "fly"].includes(s.mode)) bad.push(`${s.id}: mode`);
        if (!Number.isInteger(s.parts) || s.parts < 1 || s.parts > 16) bad.push(`${s.id}: parts`);
        for (let k = 1; k <= s.parts; k++) {
            const a = s.argv(k, s.parts, "some/dir");
            if (!Array.isArray(a) || !a.every((x) => typeof x === "string") || !/^tools\/ship\/\w+\.mjs$/.test(a[0]) || !fs.existsSync(path.join(ENG, a[0]))) bad.push(`${s.id}: part ${k} command`);
            const di = a.indexOf("--dir"), pi = a.indexOf("--part");
            if (di < 0 || a[di + 1] !== "some/dir" || pi < 0 || a[pi + 1] !== `${k}/${s.parts}`) bad.push(`${s.id}: part ${k} --dir/--part`);
        }
    }
    return { ok: SJ.STUDIES.length > 0 && bad.length === 0, detail: bad.join("; ") || `${ids.length} studies: ${ids.join(", ")}` };
});
row("2 A REPLAY NAMES A COMMITTED FILE FOR EVERY PART, AND EVERY ONE IS IN THE TREE; ITS IGNORE LISTS ARE TIMING ONLY", () => {
    const bad = [];
    for (const s of SJ.STUDIES.filter((x) => x.mode === "replay")) {
        if (!Array.isArray(s.files) || s.files.length !== s.parts) bad.push(`${s.id}: files`);
        for (const f of s.files || []) if (!fs.existsSync(path.join(ENG, s.committedDir, f))) bad.push(`${s.id}: ${f} missing`);
        const ig = [...s.ignore.file, ...s.ignore.row, ...s.ignore.probe];
        if (!ig.every((k) => /^(seconds|buildMs)$/.test(k))) bad.push(`${s.id}: ignores ${ig.join(",")}`);
    }
    return { ok: bad.length === 0, detail: bad.join("; ") };
});
row("3 studyOf FINDS A REGISTERED NAME AND NOTHING ELSE; planOf GIVES ONE COMMAND PER PART AND REFUSES AN UNKNOWN NAME", () => {
    const s = SJ.STUDIES[0], p = SJ.planOf(s.id, "d");
    let threw = false; try { SJ.planOf("no-such-study", "d"); } catch (e) { threw = /no study/.test(e.message); }
    return SJ.studyOf(s.id) === s && [undefined, "", "--help", "Rock-nav", "no-such-study", s.id + " "].every((x) => SJ.studyOf(x) === null)
        && p.length === s.parts && p.every((x, i) => x.k === i + 1 && J(x.argv) === J(s.argv(i + 1, s.parts, "d"))) && threw;
});

// the comparison, on hand-made files
const file = (rowsArr, head = {}) => JSON.stringify({ round: "r", set: "dev", part: [1, 4], seeds: [1, 2], seconds: 12.5, ...head, rows: rowsArr });
const R = (o = {}) => ({ seed: 3101, kind: "bow", arm: "N", struck: 1, R: 90, probe: { calls: 10, aimed: 5, buildMs: 7, field: { origin: [0, 0, 0], goalR: 220 } }, ...o });
const IG = { file: ["seconds"], row: [], probe: ["buildMs"] };
row("4 THE SAME RECORD IS IDENTICAL, WHATEVER THE TIMING FIELDS SAY", () => {
    const a = SJ.compareFile("f", file([R(), R({ seed: 3102 })], { seconds: 99 }), file([R(), R({ seed: 3102, probe: { calls: 10, aimed: 5, buildMs: 900, field: { origin: [0, 0, 0], goalR: 220 } } })]), IG);
    return { ok: a.verdict === "IDENTICAL" && a.same === 2 && a.rows === 2 && a.head && a.firstDiff === null, detail: J(a) };
});
row("5 A CHANGED VALUE, IN A ROW OR DEEP IN ITS PROBE, IS A DIFFERENCE, AND THE FIRST ONE IS NAMED BY ROW, SEED, KIND, ARM AND KEY", () => {
    const a = SJ.compareFile("f", file([R(), R({ seed: 3102, struck: 2 })]), file([R(), R({ seed: 3102 })]), IG);
    const b = SJ.compareFile("f", file([R({ probe: { calls: 10, aimed: 5, field: { origin: [0, 0, 1e-12], goalR: 220 } } })]), file([R()]), IG);
    return { ok: a.verdict === "DIFFERS" && a.same === 1 && a.firstDiff.index === 1 && a.firstDiff.seed === 3102 && a.firstDiff.kind === "bow" && a.firstDiff.arm === "N" && J(a.firstDiff.keys) === '["struck"]'
        && b.verdict === "DIFFERS" && J(b.firstDiff.keys) === '["probe"]', detail: `${J(a.firstDiff)} ${J(b.firstDiff)}` };
});
row("6 A ROW MORE OR LESS, A FIELD THE RECORD HAS AND THE REPLAY LACKS, AND A CHANGED FILE HEAD ARE ALL DIFFERENCES", () => {
    const more = SJ.compareFile("f", file([R(), R()]), file([R()]), IG), less = SJ.compareFile("f", file([R()]), file([R(), R()]), IG);
    const lacks = SJ.compareFile("f", file([(() => { const r = R(); delete r.R; return r; })()]), file([R()]), IG);
    const head = SJ.compareFile("f", file([R()], { seeds: [1, 3] }), file([R()]), IG);
    return { ok: [more, less, lacks, head].every((x) => x.verdict === "DIFFERS") && head.head === false && more.rows === 2 && less.rows === 2, detail: [more, less, lacks, head].map((x) => x.verdict).join(",") };
});
row("7 A FIELD THE CODE LEARNED TO RECORD AFTER THE RECORD WAS FLOWN IS LISTED, NOT COMPARED (in the row, deep in its probe, and in the file head)", () => {
    const later = R({ extra: 1, probe: { calls: 10, aimed: 5, buildMs: 7, builds: 3, field: { origin: [0, 0, 0], goalR: 220, lane: true } } });
    const a = SJ.compareFile("f", file([later], { arms: ["D", "N"] }), file([R()]), IG);
    return { ok: a.verdict === "IDENTICAL" && J(a.added) === J(["extra", "file.arms", "probe.builds", "probe.field.lane"]), detail: J(a.added) };
});
row("8 THE STUDY'S VERDICT: IDENTICAL ONLY WHEN EVERY FILE IS; ONE DIFFERENCE MAKES IT DIFFERS; A MISSING FILE OR NO FILES MAKE IT INCOMPLETE", () => {
    const I = { verdict: "IDENTICAL" }, D = { verdict: "DIFFERS" };
    return SJ.verdictOf([I, I]) === "IDENTICAL" && SJ.verdictOf([I, D]) === "DIFFERS" && SJ.verdictOf([I, null]) === "INCOMPLETE" && SJ.verdictOf([D, null]) === "INCOMPLETE" && SJ.verdictOf([]) === "INCOMPLETE";
});
row("9 THE RUNNER: export-free; refuses an unknown study, a bad worker count and an unknown option (exit 2); a dry run prints one command per part and flies nothing", () => {
    const cmd = path.join(HERE, "studyRunner.mjs"), src = fs.readFileSync(cmd, "utf8"), run = (...a) => spawnSync(process.execPath, [cmd, ...a], { encoding: "utf8", cwd: ENG });
    const s = SJ.STUDIES[0], dry = run("--study", s.id, "--dry-run"), lines = dry.stdout.split("\n").filter((l) => /^\s+part \d+\//.test(l));
    const codes = [run("--study", "no-such-study").status, run("--study", s.id, "--workers", "0").status, run("--study", s.id, "--bogus").status];
    return { ok: !/^export\s/m.test(src) && codes.every((c) => c === 2) && dry.status === 0 && lines.length === s.parts && !fs.existsSync(path.join(ENG, "rig-out", `${s.id}-report.json.dry`)), detail: `exits ${codes.join(",")}, dry ${dry.status} with ${lines.length} parts` };
});
row("10 THE THREE GUARDS AGREE: the queue's job check, the bridge's submit check and the registry take and refuse the same study names; the queue's study job runs THIS runner", () => {
    const B = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "peerJobsBridge.js"));
    const names = ["rock-nav-c-dev-replay", "abc", "a".repeat(63), "ab", "a".repeat(64), "Rock", "-ab", "a/b", "a.b", "a b", "--x"];
    const job = (study) => ({ version: 1, id: "s-job", kind: "study", study, target: { gpu: "any" }, created: "2026-11-26T00:00:00Z", commit: "a".repeat(40), by: "keith" });
    const q = names.map((n) => P.validateJob(job(n)).length === 0), r = names.map((n) => SJ.STUDY.test(n)), b = names.map((n) => !B.submitArgs({ id: "abc", kind: "study", study: n }).error);
    const argv = P.argvFor(job("rock-nav-c-dev-replay"), { cores: 4 });
    return { ok: J(q) === J(r) && J(b) === J(r) && argv[0] === "tools/ship/studyRunner.mjs" && fs.existsSync(path.join(ENG, argv[0])), detail: `queue ${q.map(Number).join("")}, registry ${r.map(Number).join("")}, bridge ${b.map(Number).join("")}` };
});

row("11 THE PIECES BY NAME: projectOnto cuts a value to a shape and lists what it has more; stripTiming takes the timing out of a file and its rows; reportLines names every study", () => {
    const p = SJ.projectOnto({ a: 1, b: { c: 2, d: 3 }, e: [1] }, { a: 0, b: { c: 0 } }), st = SJ.stripTiming(file([R()]), IG), lines = SJ.reportLines();
    return { ok: J(p.value) === '{"a":1,"b":{"c":2}}' && J(p.extra) === '["e","b.d"]' && !("seconds" in st.head) && !("buildMs" in st.rows[0].probe) && st.rows[0].probe.calls === 10
        && SJ.STUDIES.every((x) => lines.some((l) => l.includes(x.id))), detail: J(p.extra) };
});

for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " -- " + r.detail : ""}`);
const red = rows.filter((r) => !r.ok).length;
console.log(`[studyJobs-selfcheck] ${red ? red + " of " + rows.length + " checks FAIL" : "all " + rows.length + " checks pass"}`);
process.exit(red ? 1 : 0);
