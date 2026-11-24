// WebGLEngine/tools/ship/takeFlyWiredGunnerControl-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerControl-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE WIRING CONTROL, HELD. tools/ship/takeFlyWiredGunnerControl.mjs flies the page's gunner (seatFlyWired10) over the fly's wiring and over four controls. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (441001- for both fleet fights, 451001- one ship a side), disjoint from every other fly-wired study's; the arms; the jobs; THE POOL'S `wiring` for seatFlyWired10 is the gunner over that wiring
//   2  THE STUDY             against a stand-in: fifteen arms, each once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeFlyWiredGunnerControl.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 15 RED the first time, ONE 0-RED, A GAP, CLOSED --
//   every arm read with the fly's leads (the row now reads two controls' own leads) -> 1. AND ONE ON tools/ship/pairPool.mjs: W1 seatFlyWired10 given no wirings 1 (the section threw).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerControl.mjs";
import * as VP from "./takeFlyWiredGunnerVsPilot.mjs";
import * as TU from "./takeFlyWiredGunnerTune.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as BL from "./takeBestShipLoadout.mjs";
import * as BL2 from "./takeBestShipLoadout2.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as GH from "./takeFlyWiredGunnerHold.mjs";
import * as SE from "./takeFlyWiredGunnerSees.mjs";
import * as HSS from "./takeFlyWiredGunnerHoldSees.mjs";
import * as NE from "./takeFlyWiredGunnerNear.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { sideOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerControl.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeFlyWiredGunnerControl-selfcheck -- does the fly's wiring still do anything\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, SE, HSS, NE, VP, NX].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece: both fleet fights on the SAME pairs (441001-), one ship a side on 451001-; none flown by another fly-wired study", G.FIGHTS.join() === "fleetCannon,fleetNoCannon,oneCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.fleetCannon === G.SETS.fleetNoCannon && G.SETS.fleetCannon[0].seed === 441001 && G.SETS.oneCannon[299].seed === 451075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const j = (f, arm, i) => G.jobsOf(f, arm, [G.SETS[f][i]])[0], a = j("fleetCannon", "fly", 0), b = j("fleetNoCannon", "sine", 1), c = j("oneCannon", "shuffled:4242", 2);
    ok("!! THE ARMS: the gunner itself and FOUR CONTROLS (sine, scrambled:4242, flat, shuffled:4242), three of them shape controls; every arm seatFlyWired10 at the page's shipped weights [-3, -3, 0.1, 0.2, 45 degrees], a control naming its wiring and the gunner none; the fleets three ships a side with and without the cannon on both sides, one ship a side with it; side Y plain", G.ARMS.join() === "fly,sine,scrambled:4242,flat,shuffled:4242" && G.SHAPE_CONTROLS.join() === "sine,scrambled:4242,flat" && G.WEIGHTS.join() === [-3, -3, 0.1, 0.2, Math.PI / 4].join() && JSON.parse(fs.readFileSync(path.join(path.dirname(G.READING), "seatFlyWired10WeightsDefault.json"), "utf8")).weights.every((v, i) => Math.abs(v - G.WEIGHTS[i]) < 1e-6)
        && a.x.network.policy === "seatFlyWired10" && a.x.network.wiring === undefined && b.x.network.wiring === "sine" && c.x.network.wiring === "shuffled:4242" && a.opts.ships === 3 && a.x.cannon && a.y.cannon && !b.x.cannon && !b.y.cannon && c.opts.ships === 1 && c.x.cannon && c.y.cannon && [a, b, c].every((q) => !q.y.network && q.opts.escorts === undefined) && c.seed === G.SETS.oneCannon[2].seed);
    const sd = (wiring) => sideOf({ id: "x", cannon: true, network: { policy: "seatFlyWired10", weights: G.WEIGHTS.slice(), ...(wiring ? { wiring } : {}) } });
    ok("!! THE POOL'S `wiring` FOR seatFlyWired10 (2026-11-20) seats the page's gunner over that wiring (brain/flyTracking.mjs's nearTunableOver), and the gunner itself with none", sd("sine").network.module === FT.nearTunableOver("sine") && sd("scrambled:4242").network.module === FT.nearTunableOver("scrambled:4242") && sd(null).network.module === FT.nearTunable && sd("fly").network.module === FT.nearTunable);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleetCannon: { fly: 0.3, sine: 0.3, "scrambled:4242": 0.1, flat: 0.2, "shuffled:4242": -0.5 }, fleetNoCannon: { fly: 0.2, sine: 0.2, "scrambled:4242": 0.2, flat: 0.3, "shuffled:4242": -0.2 }, oneCannon: { fly: 0.1, sine: 0.1, "scrambled:4242": 0.1, flat: 0.1, "shuffled:4242": 0 } };
    const calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.fleetCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! fifteen arms, each once; each gain is THE FLY LESS THE CONTROL pair by pair (against the scramble 0.2, 0, 0; against flat 0.1, -0.1, 0; against the shuffle 0.8, 0.4, 0.1; against sine exactly 0); the fly is credited here against the scramble and the shuffle (flat trails somewhere, sine is never told), so the shape matters", calls.length === 15 && new Set(calls).size === 15 && close(r.fleetCannon.reading["flyOver:scrambled:4242"], 0.2) && close(r.fleetNoCannon.reading["flyOver:flat"], -0.1) && close(r.fleetCannon.reading["flyOver:shuffled:4242"], 0.8) && G.FIGHTS.every((f) => r[f].reading["flyOver:sine"].mean === 0) && close(r.fleetCannon.reading.fly, 0.3) && close(r.fleetCannon.reading["shuffled:4242"], -0.5) && close(r.fleetNoCannon.reading.flat, 0.3) && r.verdict.credited.join() === "scrambled:4242,shuffled:4242" && r.verdict.shapeMatters);
    const q = (z) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: Object.fromEntries(G.CONTROLS.map((c) => [`flyOver:${c}`, { z: (z[c] || [0, 0, 0])[i] }])) }])));
    ok("!! WHAT IS DECIDED: credited against a control that it LEADS somewhere (z 2) and TRAILS nowhere (z -2 trails); credited only against the shuffle, the shape is NOT shown to matter; credited against any one of sine, the scramble and flat, it is", q({ "shuffled:4242": [2, 0, 0] }).credited.join() === "shuffled:4242" && !q({ "shuffled:4242": [2, 0, 0] }).shapeMatters && q({ sine: [0, 0, 2] }).shapeMatters && q({ flat: [5, 0, 0] }).shapeMatters && !q({ flat: [5, -2, 0] }).shapeMatters && q({ flat: [5, -1.99, 0] }).shapeMatters && !q({ sine: [1.99, 1.99, 1.99] }).shapeMatters && q({}).credited.length === 0);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wirectl-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--write", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know (there is no --write: nothing ships) and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm.replace(":", "-")}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings(Object.fromEntries(G.ARMS.map((arm) => [arm, k(f, arm)]))).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE CIRCUIT'S SHAPE IS NOT SHOWN TO MATTER IN THE PAGE'S GUNNER: the fly less sine, the scramble and flat is CANNOT BE TOLD in every fight but one -- one ship a side it TRAILS flat (-0.025, z -2.3) -- and it is credited against the SHUFFLE only (+1.300, +2.105, +0.551), which swings the gun the wrong way at large angles", G.FIGHTS.every((f) => ["sine", "scrambled:4242"].every((c) => rd[f].words[`flyOver:${c}`] === "CANNOT BE TOLD")) && rd.fleetCannon.words["flyOver:flat"] === "CANNOT BE TOLD" && rd.fleetNoCannon.words["flyOver:flat"] === "CANNOT BE TOLD" && rd.oneCannon.words["flyOver:flat"] === "TRAILS" && near(R("oneCannon")["flyOver:flat"], -0.025)
        && near(R("fleetCannon")["flyOver:shuffled:4242"], 1.300) && near(R("fleetNoCannon")["flyOver:shuffled:4242"], 2.105) && near(R("oneCannon")["flyOver:shuffled:4242"], 0.551) && rd.verdict.credited.join() === "shuffled:4242" && !rd.verdict.shapeMatters
        && G.FIGHTS.every((f) => Object.keys(re[f]).every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! the page's gunner against the plain side: +0.099 in fleets with the cannon, +0.349 without, and +0.171 ONE SHIP A SIDE with the cannon (the page's default fight, flown here for the first time with this gunner); the forecast was right", near(R("fleetCannon").fly, 0.099) && near(R("fleetNoCannon").fly, 0.349) && near(R("oneCannon").fly, 0.171) && G.FIGHTS.every((f) => rd[f].words.fly === "LEADS"));
    ok("!! AND THE PAGE SAYS IT: the flywired hand's note says the circuit's shape is not shown to matter in this gunner", /shape is not shown to matter/i.test(C.HANDS.find((h) => h.id === "flywired").note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredGunnerControl.mjs held by its gate (it found these 1 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredGunnerControl.mjs");
    const NAMED = ["SETUP"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
