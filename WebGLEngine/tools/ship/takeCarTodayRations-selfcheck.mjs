// WebGLEngine/tools/ship/takeCarTodayRations-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeCarTodayRations-selfcheck.mjs      (seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// CAR-TODAY'S ESCORTS PICK ACROSS THE RATIONS, HELD. tools/ship/takeCarTodayRations.mjs flies car-today against the 45-degree gunner one ship a side with two
// escorts at each of the page's five rations, under the best-ship button's split helm. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1571001- to 1611001-, 10000 apart), disjoint from every other study of the fly-wired line; the rations are the page's;
//                            the brains (each by its policy; the helm the split helm's cannon half); the jobs
//   2  THE STUDY             against a stand-in: ten arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the page as decided
//
// @@READ@@
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeCarTodayRations.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 14 RED the first time
//   (a seed moved; a ration not the page's; the fly's helm, the sine without its wiring; six escorts, the ration dropped, the plain side armed; the gain's sign,
//   a trail at exactly -2 let by, the switch from the smallest trailing ration; a file unchecked; an unknown option and a second read let through; one arm's
//   gunner for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as PT from "./pairsTaken.mjs";
import * as G from "./takeCarTodayRations.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeCarTodayRations.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeCarTodayRations-selfcheck -- car-today's escorts pick across the page's rations\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeCarTodayRations.mjs"])).flat();
    ok("!! five fights, 300 pairs each, 75 of each kind, on 1571001-, 1581001-, ... 1611001-1611075; none twice; none flown by another study of the line", G.FIGHTS.join() === "r1,r2,r4,r8,r16" && G.FIGHTS.every((f, i) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75) && Math.min(...G.SETS[f].map((p) => p.seed)) === 1571001 + 10000 * i && Math.max(...G.SETS[f].map((p) => p.seed)) === 1571075 + 10000 * i)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1500 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    ok("!! THE RATIONS ARE THE PAGE'S: 1, 1/2, 1/4, 1/8, 1/16, one fight each", G.RATIONS.join() === C.RATIONS.join() && G.FIGHTS.every((f, i) => G.RATION_OF[f] === C.RATIONS[i]));
    const b = G.brainsOf(), j = (f, a) => G.jobsOf(f, a, b, [G.SETS[f][0]])[0], split = C.HELMS.find((h) => h.id === "split");
    ok("!! THE HELM IS TODAY'S BEST-SHIP BUTTON'S WITH THE CANNON: the split helm's cannon file (the sine twin), read over sine~odd", split && C.presetOf("best").choice.helm === "split" && C.FILES[split.byCannon.on].path.endsWith(path.basename(G.FILES.helm)) && b.helm.wiring === "sine~odd" && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES[split.byCannon.on].mod === FS.thirdOver("sine~odd"));
    ok("!! THE JOBS: car-today against the 45-degree gunner, one ship a side, TWO ESCORTS, the cannon on both sides, the ration the fight names (whole magazines left as the default), side Y plain",
        G.FIGHTS.every((f) => j(f, "today").x.network === b.today && j(f, "alt").x.network === b.fly && [j(f, "today"), j(f, "alt")].every((q) => q.opts.ships === 1 && q.opts.escorts === 2 && q.x.cannon && q.y.cannon && q.x.helmNet === b.helm && !q.y.network && !q.y.helmNet))
        && j("r1", "today").opts.ammo === undefined && j("r2", "today").opts.ammo === 0.5 && j("r16", "alt").opts.ammo === 0.0625 && Math.abs(b.fly.weights[4] - Math.PI / 4) < 1e-6 && C.HANDS.find((h) => h.id === "bysize").bySize.escorts === "car-today");
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.today ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatTurretGunnerWeightsToday\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { r1: [1.1, 1], r2: [1, 1], r4: [1, 1], r8: [0.9, 1], r16: [0.9, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {});
    const mf = G.SETS.r1.reduce((s, _, i) => s + factor(i), 0) / 300, close = (f, v) => Math.abs(r[f].reading.gain.mean - v * mf) < 1e-9;
    ok("!! ten arms, each once; the gain is CAR-TODAY LESS THE 45-DEGREE GUNNER pair by pair; trailing at 1/8 and 1/16 gives the 45-degree gunner at 1/8 and less", calls.length === 10 && new Set(calls).size === 10 && close("r1", 0.1) && close("r8", -0.1) && close("r2", 0) && r.verdict.changes && r.verdict.scarceAtOrBelow === 0.125 && r.verdict.trailing.join() === "0.125,0.0625");
    const d = (z) => G.decide(Object.fromEntries(G.FIGHTS.map((f) => [f, { reading: { gain: { z: z[f] ?? 0 } } }])));
    ok("!! WHAT IS DECIDED: no trail, no change (leads change nothing); exactly -2 trails, -1.99 does not; the switch starts at the LARGEST trailing ration", !d({}).changes && !d({ r1: 9, r16: -1.99 }).changes && d({ r16: -2 }).scarceAtOrBelow === 0.0625 && d({ r2: -3, r16: -3 }).scarceAtOrBelow === 0.5 && d({ r1: -2 }).scarceAtOrBelow === 1);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ctrations-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    // @@FOUND@@
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
