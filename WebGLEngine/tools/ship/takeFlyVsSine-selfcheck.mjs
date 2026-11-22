// WebGLEngine/tools/ship/takeFlyVsSine-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyVsSine-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE FLY'S HELM AGAINST ITS SINE TWIN ON MANY PAIRS, HELD. tools/ship/takeFlyVsSine.mjs flies the page's two cannon-aware helms, the same weights over two read-outs, in four fights of 1200 pairs. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1351001-, 1361001-, 1371001-, 1381001-), disjoint from every other study of the fly-wired line (tools/ship/pairsTaken.mjs); the brains (each checked by its policy); the jobs; the two arms differ only in the read-out
//   2  THE STUDY             against a stand-in: eight arms, each once; the gain pair by pair; what the note says; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/flyVsSine.reading.json; the kept arms in brain/rig-results/flyVsSine/): TOLD ONCE, THE SINE AHEAD. The fly less the sine: one ship a side with the cannon -0.056 (z -3.90, TRAILS -- the forecast had the sine ahead by
//   about 0.04 but not told); fleets of three with it -0.016 (z -1.81), one ship a side without it +0.016 (z 1.07), fleets without it +0.013 (z 1.30), none of the three can be told. The fly-wired helm's note says so (and the sine's).
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyVsSine.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 18 RED the first time (a seed moved, a quarter of the pairs, old pairs; the sine on its old file, the sine without its
//   wiring, the fly over the sine too; car-today with the cannon, the no-window gunner in fleets, the cannon on where it is off, the plain side always armed, fleets of two; the gain's sign, told only as a lead, a bound of one standard error;
//   a file unchecked; an unknown option and a second read let through; one arm's leads for both). No mutant flew into the real folders.
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
import { createPool } from "./pairPool.mjs";
import * as G from "./takeFlyVsSine.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyVsSine.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyVsSine-selfcheck -- the fly's helm against its sine twin, 1200 pairs a fight\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeFlyVsSine.mjs"])).flat();
    ok("!! four fights, 1200 pairs each, 300 of each kind, on 1351001-1351300, 1361001-, 1371001-, 1381001-1381300; none twice; none flown by another study of the line", G.FIGHTS.join() === "oneCannon,fleetCannon,oneNone,fleetNone" && G.FIGHTS.every((f) => G.SETS[f].length === 1200 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 300))
        && G.FIGHTS.map((f) => Math.min(...G.SETS[f].map((p) => p.seed))).join() === "1351001,1361001,1371001,1381001" && Math.max(...G.SETS.fleetNone.map((p) => p.seed)) === 1381300 && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 4800 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], J = Object.fromEntries(G.FIGHTS.flatMap((f) => G.ARMS.map((a) => [`${f}/${a}`, j(f, a)])));
    ok("!! THE TWO ARMS ARE THE PAGE'S TWO HELMS: the same weights (-2, -2 with a cannon, -0.25 without), the fly's arm over the fly's circuit, the sine's over sine~odd; the page's files", b.fly.weights.join() === "-2,-2,-0.25,-0.25" && b.sine.weights.join() === b.fly.weights.join() && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.fly)) && C.FILES["helm-sine"].path.endsWith(path.basename(G.FILES.sine))
        && G.FIGHTS.every((f) => J[`${f}/fly`].x.helmNet.wiring === undefined && J[`${f}/sine`].x.helmNet.wiring === "sine~odd" && J[`${f}/fly`].x.helmNet.weights.join() === J[`${f}/sine`].x.helmNet.weights.join() && J[`${f}/sine`].x.helmNet.policy === FS.POLICY_ID3) && C.FILES["helm-sine"].mod === FS.thirdOver("sine~odd"));
    ok("!! THE JOBS: the button's gunner in each fight (one ship a side the no-window fly-wired gunner with the cannon, car-today without; the 45-degree one in fleets of three), the same on both arms; the cannon on both sides or neither; side Y plain",
        J["oneCannon/fly"].x.network === b.gunOne && b.gunOne.weights[4] === 0 && J["oneNone/sine"].x.network === b.today && b.today.policy === ST.POLICY_ID && J["fleetCannon/fly"].x.network === b.gun && J["fleetNone/sine"].x.network === b.gun && Math.abs(b.gun.weights[4] - Math.PI / 4) < 1e-6
        && G.FIGHTS.every((f) => J[`${f}/fly`].x.network === J[`${f}/sine`].x.network) && Object.values(J).every((q) => q.x.cannon === q.y.cannon && !q.y.network && !q.y.helmNet) && J["oneCannon/fly"].x.cannon && J["fleetCannon/sine"].x.cannon && !J["oneNone/fly"].x.cannon && !J["fleetNone/fly"].x.cannon
        && J["oneCannon/fly"].opts.ships === 1 && J["oneNone/fly"].opts.ships === 1 && J["fleetCannon/fly"].opts.ships === 3 && J["fleetNone/sine"].opts.ships === 3 && Object.values(J).every((q) => q.opts.escorts === undefined)
        && C.HANDS.find((h) => h.id === "bysize").bySize.oneNoCannon === "car-today" && C.HANDS.find((h) => h.id === "bysize").bySize.one === "flywired-one");
    const pool = createPool({ workers: 2 }), L = [G.SETS.oneCannon[3], G.SETS.oneCannon[700]], lf = await pool.leads(G.jobsOf("oneCannon", "fly", b, L)), ls = await pool.leads(G.jobsOf("oneCannon", "sine", b, L)), lf2 = await pool.leads(G.jobsOf("oneCannon", "fly", b, L)); await pool.close();
    ok("!! FLOWN THROUGH THE POOL the two read-outs are two fights, and a fight flown twice is the same fight", lf.join() !== ls.join() && lf.join() === lf2.join(), `${lf.map((x) => x.toFixed(3))} / ${ls.map((x) => x.toFixed(3))}`);
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.sine ? JSON.parse(fs.readFileSync(G.FILES.gun, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /helmFlyWired3WeightsSineNoCannon\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: [1, 1], fleetCannon: [1.1, 1], oneNone: [1, 1], fleetNone: [0.9, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "fly" ? 0 : 1] * factor(i)); }, () => {});
    const mf = G.SETS.oneCannon.reduce((s, _, i) => s + factor(i), 0) / 1200, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! eight arms, each once; the gain is THE FLY LESS THE SINE pair by pair (+0.1, -0.1 where they differ)", calls.length === 8 && new Set(calls).size === 8 && close(r.fleetCannon.reading.gain, 0.1) && close(r.fleetNone.reading.gain, -0.1) && close(r.oneCannon.reading.gain, 0) && r.oneCannon.reading.gain.n === 1200 && !r.verdict.ok && r.verdict.told.map((t) => t.fight).join() === "fleetCannon,fleetNone");
    const g = (m, se) => ({ reading: { gain: { mean: m, se, z: se ? m / se : 0 } } }), d = (...x) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, x[i]])));
    const quiet = d(g(0.01, 0.02), g(-0.03, 0.02), g(0, 0.01), g(0.02, 0.015));
    ok("!! WHAT THE NOTE SAYS: told nowhere at |z| < 2, and then the bound is the largest |mean| + 2 se (here 0.07); told where |z| >= 2 EITHER WAY (exactly 2 is told)", quiet.ok && Math.abs(quiet.bound - 0.07) < 1e-12 && !d(g(0.04, 0.02), g(0, 1), g(0, 1), g(0, 1)).ok && d(g(-0.04, 0.02), g(0, 1), g(0, 1), g(0, 1)).told[0].word === "TRAILS" && d(g(0.0398, 0.02), g(0, 1), g(0, 1), g(0, 1)).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flyvssine-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const out = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ fly: k(f, "fly"), sine: k(f, "sine") })])), R = (f) => out[f].reading.gain;
    ok("!! RE-DERIVED FROM THE KEPT ARMS: the fly less the sine -0.056 one ship a side with the cannon (TRAILS), -0.016, +0.016 and +0.013 in the other three (CANNOT BE TOLD); 1200 pairs each", near(R("oneCannon"), -0.0562) && TA.word(R("oneCannon").z) === "TRAILS" && near(R("fleetCannon"), -0.0155) && near(R("oneNone"), 0.0156) && near(R("fleetNone"), 0.0127)
        && ["fleetCannon", "oneNone", "fleetNone"].every((f) => TA.word(R(f).z) === "CANNOT BE TOLD") && G.FIGHTS.every((f) => R(f).n === 1200 && Math.abs(R(f).mean - rd[f].reading.gain.mean) < 1e-12));
    const v = G.decide(out), fly = C.HELMS.find((h) => h.id === "flywired"), sine = C.HELMS.find((h) => h.id === "sine");
    ok("!! WHAT THE NOTE SAYS, as read: told one ship a side with the cannon only, the fly trailing; the fly-wired helm's note and the sine's carry it", !v.ok && v.told.length === 1 && v.told[0].fight === "oneCannon" && v.told[0].word === "TRAILS" && rd.verdict.told.length === 1
        && /takeFlyVsSine/.test(fly.note) && /-0\.056/.test(fly.note) && /takeFlyVsSine/.test(sine.note) && /0\.056/.test(sine.note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyVsSine.mjs held by its gate (it found these 3 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyVsSine.mjs");
    const NAMED = ["SETUP", "gunnerOf", "helmOf"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
