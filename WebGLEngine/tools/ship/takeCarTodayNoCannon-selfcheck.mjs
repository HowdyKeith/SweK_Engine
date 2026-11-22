// WebGLEngine/tools/ship/takeCarTodayNoCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeCarTodayNoCannon-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// CAR-TODAY WITHOUT A CANNON, HELD. tools/ship/takeCarTodayNoCannon.mjs flies car-today against what the button took before it, one ship a side and with escorts, no cannon. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1321001-, 1331001-, 1341001-), disjoint from every other study of the fly-wired line (tools/ship/pairsTaken.mjs); the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what is decided, each pick apart; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/carTodayNoCannon.reading.json; the kept arms in brain/rig-results/carTodayNoCannon/): BOTH PICKS STAY. Without a cannon, car-today less the other: one ship a side +0.031 (z 1.38, 600 pairs, CANNOT BE TOLD -- the +0.080 of
//   takeButtonNoCannon came back smaller, as forecast); with two escorts a side +0.256 (z 6.18, LEADS), with six +0.199 (z 4.74, LEADS -- the forecast said it could not be told). The page is unchanged; the by-the-fight hand's note carries the reading.
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeCarTodayNoCannon.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 18 RED the first time (a seed moved, one ship a side half its pairs, the escorts on takeCarTodayEscorts's
//   pairs; six escorts as two, the cannon on either side, the old helm file, no helm, the 45-degree gunner one ship a side, the no-window one with escorts; the gain's sign, a trail at exactly -2 let by, escorts needing both fights to trail,
//   one ship a side decided by the escorts; a file unchecked; an unknown option and a second read let through; one arm's leads for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as PT from "./pairsTaken.mjs";
import * as G from "./takeCarTodayNoCannon.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeCarTodayNoCannon.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeCarTodayNoCannon-selfcheck -- car-today without a cannon, one ship a side and with escorts\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeCarTodayNoCannon.mjs"])).flat();
    ok("!! three fights: one ship a side 600 pairs (1321001-1321150), two and six escorts a side 300 each (1331001-, 1341001-), the kinds in equal parts; none twice; none flown by another study of the line", G.FIGHTS.join() === "one,escorts2,escorts6" && G.SETS.one.length === 600 && G.SETS.escorts2.length === 300 && G.SETS.escorts6.length === 300
        && D.KINDS.every((k) => G.SETS.one.filter((p) => p.kind === k).length === 150 && G.SETS.escorts6.filter((p) => p.kind === k).length === 75) && Math.min(...G.SETS.one.map((p) => p.seed)) === 1321001 && Math.max(...G.SETS.one.map((p) => p.seed)) === 1321150
        && G.SETS.escorts2[0].seed === 1331001 && G.SETS.escorts6[299].seed === 1341075 && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1200 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], t1 = j("one", "today"), a1 = j("one", "alt"), t2 = j("escorts2", "today"), a2 = j("escorts2", "alt"), a6 = j("escorts6", "alt");
    ok("!! THE JOBS: NO CANNON on either side; car-today against the no-window fly-wired gunner one ship a side and the 45-degree one with escorts (what the button took there before); two and six escorts a side; the page's cannon-aware helm (-0.25 without a cannon) on side X; side Y plain",
        t1.x.network === b.today && a1.x.network === b.flyOne && b.flyOne.weights[4] === 0 && t2.x.network === b.today && a2.x.network === b.fly && a6.x.network === b.fly && Math.abs(b.fly.weights[4] - Math.PI / 4) < 1e-6
        && [t1, a1, t2, a2, a6].every((q) => !q.x.cannon && !q.y.cannon && q.x.helmNet === b.helm && q.opts.ships === 1 && !q.y.network && !q.y.helmNet) && t1.opts.escorts === undefined && t2.opts.escorts === 2 && a6.opts.escorts === 6
        && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)) && C.FILES["car-today"].path.endsWith(path.basename(G.FILES.today)) && C.FILES["seat-flywired-one"].path.endsWith(path.basename(G.FILES.flyOne)));
    ok("!! and it is the page's choice as it stood: one ship a side with no cannon the button takes car-today, with escorts car-today", C.HANDS.find((h) => h.id === "bysize").bySize.oneNoCannon === "car-today" && C.HANDS.find((h) => h.id === "bysize").bySize.escorts === "car-today");
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.flyOne ? JSON.parse(fs.readFileSync(G.FILES.today, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatFlyWired11WeightsOne\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: [1.1, 1], escorts2: [1, 1], escorts6: [0.9, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {});
    const mf = (f) => G.SETS[f].reduce((s, _, i) => s + factor(i), 0) / G.SETS[f].length, close = (f, s, v) => Math.abs(s.mean - v * mf(f)) < 1e-9;
    ok("!! six arms, each once; the gain is CAR-TODAY LESS THE OTHER pair by pair (+0.1 one ship a side, -0.1 with six escorts)", calls.length === 6 && new Set(calls).size === 6 && close("one", r.one.reading.gain, 0.1) && close("escorts6", r.escorts6.reading.gain, -0.1) && close("one", r.one.reading.today, 1.1) && r.one.reading.gain.n === 600 && r.verdict.one && !r.verdict.escorts);
    const d = (a, b2, c) => G.decide({ one: { reading: { gain: { z: a } } }, escorts2: { reading: { gain: { z: b2 } } }, escorts6: { reading: { gain: { z: c } } } });
    ok("!! WHAT IS DECIDED, each pick apart: one ship a side car-today stays unless it trails there (exactly -2 trails, -1.99 does not); with escorts unless it trails in EITHER escorts fight; a lead is not needed", d(0, 0, 0).ok && d(-1.99, -1.99, -1.99).ok && !d(-2, 5, 5).one && d(-2, 5, 5).escorts && d(5, -2, 5).one && !d(5, -2, 5).escorts && !d(5, 5, -2).escorts && !d(-2, 0, 0).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartodaync-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const out = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ today: k(f, "today"), alt: k(f, "alt") })])), R = (f) => out[f].reading;
    ok("!! RE-DERIVED FROM THE KEPT ARMS: car-today less the other +0.031 one ship a side (600 pairs, CANNOT BE TOLD), +0.256 with two escorts (LEADS), +0.199 with six (LEADS)", near(R("one").gain, 0.0307) && R("one").gain.n === 600 && TA.word(R("one").gain.z) === "CANNOT BE TOLD" && near(R("escorts2").gain, 0.2560) && TA.word(R("escorts2").gain.z) === "LEADS" && near(R("escorts6").gain, 0.1988) && TA.word(R("escorts6").gain.z) === "LEADS" && G.FIGHTS.every((f) => Math.abs(R(f).gain.mean - rd[f].reading.gain.mean) < 1e-12));
    const v = G.decide(out), h = C.HANDS.find((x) => x.id === "bysize");
    ok("!! WHAT IS DECIDED, as read: both picks stay; the page's button keeps car-today without a cannon one ship a side and with escorts, adds no escortsNoCannon pick, and its note carries the reading", v.ok && v.one && v.escorts && rd.verdict.ok && h.bySize.oneNoCannon === "car-today" && h.bySize.escorts === "car-today" && h.bySize.escortsNoCannon === undefined && /takeCarTodayNoCannon/.test(h.note) && /\+0\.031/.test(h.note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeCarTodayNoCannon.mjs held by its gate (it found these 3 unnamed at the ship):
{
    const EXPORTS = await import("./takeCarTodayNoCannon.mjs");
    const NAMED = ["ESCORT_FIGHTS", "SETUP", "gunnerOf"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
