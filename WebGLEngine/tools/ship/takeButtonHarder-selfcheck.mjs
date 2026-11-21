// WebGLEngine/tools/ship/takeButtonHarder-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonHarder-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BUTTON'S PICKS IN THE FIGHTS NOT YET FLOWN, HELD. tools/ship/takeButtonHarder.mjs flies car-today against the 45-degree fly-wired gunner in eight fights: the pilot's escorts without the cannon, the pilot on one side only, other rations,
// and fleets rationed and against the pilot's escorts. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1421001- to 1491001-, 10000 apart), disjoint from every other study of the fly-wired line (tools/ship/pairsTaken.mjs); the brains (each checked by its policy); the jobs, fight by fight
//   2  THE STUDY             against a stand-in: sixteen arms, each once; the gain pair by pair; what is decided, each pick its own way; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/buttonHarder.reading.json; the kept arms in brain/rig-results/buttonHarder/): THE PICKS HOLD. Car-today less the 45-degree gunner, one ship a side with escorts: the pilot's escorts without the cannon +0.210 (z 4.91, LEADS --
//   the forecast said it could not be told); the pilot on side Y only +0.144 (z 2.53, LEADS), on side X only +0.063 (z 1.62, cannot be told); half rations +0.027 (z 0.61), an eighth -0.039 (z -0.69), neither can be told (the forecast had the
//   eighth leading most: the lead goes as the rounds get scarce). In fleets of three it TRAILS in all three, as forecast: a quarter ration -0.192 (z -5.83), a quarter without the cannon -0.638 (z -9.64), the pilot's escorts -0.262 (z -8.25).
//   The by-the-fight hand's note says so.
//
// SABOTAGE LOG: 22 mutants of tools/ship/takeButtonHarder.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 22 RED the first time (a seed moved, old pairs; the pilot off one side of pilotNone, the cannon on there, the pilot
//   on both sides where it is on one, on the wrong side, the sides swapped in the jobs; a quarter for the half, a sixteenth for the eighth; fleets of two, whole magazines, two pilot escorts; the plain side always armed, no helm; the gain's sign,
//   the fleet pick failed by a trail, a trail at exactly -2 let by, one pick failed by the other's fights; a file unchecked; an unknown option and a second read let through; one arm's gunner for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as PT from "./pairsTaken.mjs";
import * as OH from "./takeButtonOneHard.mjs";
import * as G from "./takeButtonHarder.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonHarder.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeButtonHarder-selfcheck -- the button's picks against the pilot's escorts, rationed, and in hard fleets\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeButtonHarder.mjs"])).flat();
    ok("!! eight fights, 300 pairs each, 75 of each kind, on 1421001-, 1431001-, ... 1491001-1491075; none twice; none flown by another study of the line", G.FIGHTS.join() === "pilotNone,pilotTheirs,pilotOurs,escortsHalf,escortsEighth,fleetRationed,fleetRationedNone,fleetPilot"
        && G.FIGHTS.every((f, i) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75) && Math.min(...G.SETS[f].map((p) => p.seed)) === 1421001 + 10000 * i && Math.max(...G.SETS[f].map((p) => p.seed)) === 1421075 + 10000 * i)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 2400 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], J = Object.fromEntries(G.FIGHTS.flatMap((f) => G.ARMS.map((a) => [`${f}/${a}`, j(f, a)]))), q = (f) => J[`${f}/today`], both = (f, fn) => fn(J[`${f}/today`]) && fn(J[`${f}/alt`]);
    ok("!! THE ARMS: car-today against the 45-degree fly-wired gunner in every fight; the page's cannon-aware helm on side X; side Y plain", G.FIGHTS.every((f) => J[`${f}/today`].x.network === b.today && J[`${f}/alt`].x.network === b.fly) && Math.abs(b.fly.weights[4] - Math.PI / 4) < 1e-6
        && Object.values(J).every((x) => x.x.helmNet === b.helm && !x.y.network && !x.y.helmNet && x.x.cannon === x.y.cannon) && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)) && C.FILES["car-today"].path.endsWith(path.basename(G.FILES.today)));
    const P = b.pilot, has = (s, on) => (on ? s.pilotNet === P : s.pilotNet === undefined);
    ok("!! THE PILOT'S ESCORTS: four a side, one ship a side; without the cannon on both sides; with it on side Y only and on side X only; the trained pilot (takeButtonOneHard's)", ["pilotNone", "pilotTheirs", "pilotOurs"].every((f) => both(f, (x) => x.opts.ships === 1 && x.opts.escorts === 4 && x.opts.ammo === undefined))
        && both("pilotNone", (x) => !x.x.cannon && has(x.x, true) && has(x.y, true)) && both("pilotTheirs", (x) => x.x.cannon && has(x.x, false) && has(x.y, true)) && both("pilotOurs", (x) => x.x.cannon && has(x.x, true) && has(x.y, false))
        && P.policy === "pilot6dofPolicy" && P.weights.join() === OH.brainsOf().pilot.weights.join());
    ok("!! THE RATIONS: two escorts a side, one ship a side, the cannon, a half and an eighth, two of the page's rations; no pilot", both("escortsHalf", (x) => x.opts.ships === 1 && x.opts.escorts === 2 && x.opts.ammo === 0.5 && x.x.cannon && has(x.x, false) && has(x.y, false)) && both("escortsEighth", (x) => x.opts.ships === 1 && x.opts.escorts === 2 && x.opts.ammo === 0.125 && x.x.cannon && has(x.x, false)));
    ok("!! THE FLEETS: of three; a quarter ration with and without the cannon, no escorts; four pilot-flown escorts a side with the cannon, whole magazines", both("fleetRationed", (x) => x.opts.ships === 3 && x.opts.escorts === undefined && x.opts.ammo === 0.25 && x.x.cannon && has(x.x, false)) && both("fleetRationedNone", (x) => x.opts.ships === 3 && x.opts.ammo === 0.25 && !x.x.cannon && !x.y.cannon)
        && both("fleetPilot", (x) => x.opts.ships === 3 && x.opts.escorts === 4 && x.opts.ammo === undefined && x.x.cannon && has(x.x, true) && has(x.y, true)) && q("fleetPilot").opts.ships === 3);
    const h = C.HANDS.find((x) => x.id === "bysize");
    ok("!! THE PICKS ARE THE PAGE'S: one ship a side with escorts car-today, in fleets the 45-degree gunner; each fight names the pick it tests", h.bySize.escorts === "car-today" && h.bySize.fleet === "flywired" && C.FILES[C.HANDS.find((x) => x.id === "flywired").file].path.endsWith(path.basename(G.FILES.fly))
        && G.FIGHTS.every((f) => G.PICK[f] === (f.startsWith("fleet") ? "fleet" : "escorts")));
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.today ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatTurretGunnerWeightsToday\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = Object.fromEntries(G.FIGHTS.map((f) => [f, [1, 1]])); W.pilotTheirs = [0.9, 1]; W.fleetPilot = [1.1, 1];
    const calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {});
    const mf = G.SETS.pilotNone.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! sixteen arms, each once; the gain is CAR-TODAY LESS THE 45-DEGREE GUNNER pair by pair (-0.1, +0.1); a trail with escorts fails the escorts pick, a lead in fleets the fleet pick", calls.length === 16 && new Set(calls).size === 16 && close(r.pilotTheirs.reading.gain, -0.1) && close(r.fleetPilot.reading.gain, 0.1) && close(r.pilotNone.reading.gain, 0)
        && !r.verdict.ok && !r.verdict.holds.escorts && !r.verdict.holds.fleet && /in pilotTheirs car-today TRAILS/.test(r.verdict.reasons.join()) && /in fleetPilot car-today LEADS/.test(r.verdict.reasons.join()));
    const d = (z) => G.decide(Object.fromEntries(G.FIGHTS.map((f) => [f, { reading: { gain: { z: z[f] ?? 0 } } }])));
    ok("!! WHAT IS DECIDED: the escorts pick holds unless car-today trails in one of its five fights (exactly -2 trails, -1.99 does not); a LEAD there is no matter", d({}).ok && d({ pilotOurs: -1.99 }).ok && !d({ escortsEighth: -2 }).holds.escorts && d({ escortsEighth: -2 }).holds.fleet && d({ pilotNone: 9, escortsHalf: 9 }).ok);
    ok("!! ... the fleet pick holds unless car-today LEADS in one of its three (exactly 2 leads, 1.99 does not); a TRAIL there is no matter", d({ fleetRationed: 1.99 }).ok && !d({ fleetRationedNone: 2 }).holds.fleet && d({ fleetRationedNone: 2 }).holds.escorts && d({ fleetRationed: -9, fleetPilot: -9 }).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btnharder-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const out = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ today: k(f, "today"), alt: k(f, "alt") })])), R = (f) => out[f].reading.gain;
    const want = { pilotNone: [0.2099, "LEADS"], pilotTheirs: [0.1442, "LEADS"], pilotOurs: [0.0629, "CANNOT BE TOLD"], escortsHalf: [0.0265, "CANNOT BE TOLD"], escortsEighth: [-0.0388, "CANNOT BE TOLD"], fleetRationed: [-0.1917, "TRAILS"], fleetRationedNone: [-0.6382, "TRAILS"], fleetPilot: [-0.2615, "TRAILS"] };
    ok("!! RE-DERIVED FROM THE KEPT ARMS: with escorts +0.210, +0.144 (LEAD), +0.063, +0.027, -0.039 (cannot be told); in fleets -0.192, -0.638, -0.262 (TRAIL)", G.FIGHTS.every((f) => near(R(f), want[f][0]) && TA.word(R(f).z) === want[f][1] && R(f).n === 300 && Math.abs(R(f).mean - rd[f].reading.gain.mean) < 1e-12));
    const v = G.decide(out), h = C.HANDS.find((x) => x.id === "bysize");
    ok("!! WHAT IS DECIDED, as read: both picks hold; the by-the-fight hand's note says where they were flown", v.ok && v.holds.escorts && v.holds.fleet && rd.verdict.ok && /takeButtonHarder/.test(h.note) && /by 0\.638/.test(h.note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
