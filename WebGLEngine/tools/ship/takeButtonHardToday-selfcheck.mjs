// WebGLEngine/tools/ship/takeButtonHardToday-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonHardToday-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BUTTON'S CAR-TODAY PICKS IN THE HARD FIGHTS, HELD. tools/ship/takeButtonHardToday.mjs flies car-today against the picks before it against the trained pilot's escorts and rationed. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1391001-, 1401001-, 1411001-), disjoint from every other study of the fly-wired line (tools/ship/pairsTaken.mjs); the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what is decided, each pick apart; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/buttonHardToday.reading.json; the kept arms in brain/rig-results/buttonHardToday/): THE PICKS HOLD. Car-today less the pick before it: against four pilot-flown escorts a side -0.074 (z -1.53, CANNOT BE TOLD -- the forecast);
//   with two escorts on a quarter ration +0.144 (z 3.21, LEADS -- the forecast said it could not be told); without a cannon on a quarter ration +0.051 (z 1.48, CANNOT BE TOLD -- the forecast said a small lead). The by-the-fight hand's note says so.
//
// SABOTAGE LOG: 19 mutants of tools/ship/takeButtonHardToday.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 19 RED the first time (a seed moved, takeButtonOneHard's pairs; no pilot, the pilot on side X only, two
//   pilot escorts, whole magazines with escorts, half rations, the cannon on where it is off, the plain side always armed, the no-window gunner with escorts, the 45-degree one alone, no helm; the gain's sign, a trail at exactly -2 let by, a pick
//   failing for another pick's fight; a file unchecked; an unknown option and a second read let through; one arm's leads for both). No mutant flew into the real folders.
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
import * as OH from "./takeButtonOneHard.mjs";
import * as G from "./takeButtonHardToday.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonHardToday.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeButtonHardToday-selfcheck -- the button's car-today picks against the trained pilot's escorts and rationed\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeButtonHardToday.mjs"])).flat();
    ok("!! three fights, 300 pairs each, 75 of each kind, on 1391001-, 1401001-, 1411001-1411075; none twice; none flown by another study of the line", G.FIGHTS.join() === "escortsPilot,escortsRationed,oneRationedNone" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75))
        && G.SETS.escortsPilot[0].seed === 1391001 && G.SETS.escortsRationed[0].seed === 1401001 && G.SETS.oneRationedNone[299].seed === 1411075 && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 900 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], pt = j("escortsPilot", "today"), pa = j("escortsPilot", "alt"), rt = j("escortsRationed", "today"), ra = j("escortsRationed", "alt"), nt = j("oneRationedNone", "today"), na = j("oneRationedNone", "alt");
    ok("!! THE JOBS: car-today against the 45-degree fly-wired gunner with escorts and the no-window one with nothing else; one ship a side; FOUR PILOT-FLOWN ESCORTS a side with the cannon, whole magazines; two escorts with the cannon and a QUARTER RATION; no cannon, nothing else, a quarter ration; the page's cannon-aware helm on side X; side Y plain",
        [pt, rt, nt].every((q) => q.x.network === b.today) && pa.x.network === b.fly && ra.x.network === b.fly && Math.abs(b.fly.weights[4] - Math.PI / 4) < 1e-6 && na.x.network === b.flyOne && b.flyOne.weights[4] === 0
        && [pt, pa].every((q) => q.x.cannon && q.y.cannon && q.opts.escorts === 4 && q.opts.ammo === undefined && q.x.pilotNet === b.pilot && q.y.pilotNet === b.pilot) && [rt, ra].every((q) => q.x.cannon && q.y.cannon && q.opts.escorts === 2 && q.opts.ammo === 0.25 && q.x.pilotNet === undefined && q.y.pilotNet === undefined)
        && [nt, na].every((q) => !q.x.cannon && !q.y.cannon && q.opts.escorts === undefined && q.opts.ammo === 0.25 && q.x.pilotNet === undefined) && [pt, pa, rt, ra, nt, na].every((q) => q.opts.ships === 1 && q.x.helmNet === b.helm && !q.y.network && !q.y.helmNet)
        && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)) && b.pilot.policy === "pilot6dofPolicy" && b.pilot.weights.join() === OH.brainsOf().pilot.weights.join() && G.RATION === OH.RATION);
    const h = C.HANDS.find((x) => x.id === "bysize");
    ok("!! THE PICKS ARE THE PAGE'S: with escorts car-today, with nothing else and no cannon car-today; each fight names the pick it tests", h.bySize.escorts === "car-today" && h.bySize.oneNoCannon === "car-today" && G.PICK.escortsPilot === "escorts" && G.PICK.escortsRationed === "escorts" && G.PICK.oneRationedNone === "oneNoCannon");
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.today ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatTurretGunnerWeightsToday\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escortsPilot: [1.1, 1], escortsRationed: [0.9, 1], oneRationedNone: [1, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {});
    const mf = G.SETS.escortsPilot.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is CAR-TODAY LESS THE OTHER pair by pair (+0.1, -0.1); a trail in one escorts fight is a trail of the escorts pick, not the other", calls.length === 6 && new Set(calls).size === 6 && close(r.escortsPilot.reading.gain, 0.1) && close(r.escortsRationed.reading.gain, -0.1) && close(r.escortsPilot.reading.today, 1.1) && !r.verdict.ok && !r.verdict.holds.escorts && r.verdict.holds.oneNoCannon && /in escortsRationed car-today TRAILS/.test(r.verdict.reasons.join()));
    const d = (...z) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT IS DECIDED: a pick HOLDS if car-today trails in no fight of it (no lead needed); exactly -2 trails, -1.99 does not", d(0, 0, 0).ok && d(-1.99, -1.99, -1.99).ok && !d(-2, 5, 5).holds.escorts && d(-2, 5, 5).holds.oneNoCannon && !d(5, 5, -2).holds.oneNoCannon && d(5, 5, -2).holds.escorts && !d(5, 5, -2).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btnhard-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const out = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ today: k(f, "today"), alt: k(f, "alt") })])), R = (f) => out[f].reading;
    ok("!! RE-DERIVED FROM THE KEPT ARMS: car-today less the other -0.074 against the pilot's escorts (CANNOT BE TOLD), +0.144 rationed with escorts (LEADS), +0.051 rationed without a cannon (CANNOT BE TOLD)", near(R("escortsPilot").gain, -0.0741) && TA.word(R("escortsPilot").gain.z) === "CANNOT BE TOLD" && near(R("escortsRationed").gain, 0.1438) && TA.word(R("escortsRationed").gain.z) === "LEADS" && near(R("oneRationedNone").gain, 0.0505) && TA.word(R("oneRationedNone").gain.z) === "CANNOT BE TOLD" && G.FIGHTS.every((f) => R(f).gain.n === 300 && Math.abs(R(f).gain.mean - rd[f].reading.gain.mean) < 1e-12));
    const v = G.decide(out), h = C.HANDS.find((x) => x.id === "bysize");
    ok("!! WHAT IS DECIDED, as read: both picks hold; the by-the-fight hand's note says where they were flown", v.ok && v.holds.escorts && v.holds.oneNoCannon && rd.verdict.ok && /takeButtonHardToday/.test(h.note) && /-0\.074/.test(h.note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
