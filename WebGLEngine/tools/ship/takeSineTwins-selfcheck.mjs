// WebGLEngine/tools/ship/takeSineTwins-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSineTwins-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SINE TWINS, HELD. tools/ship/takeSineTwins.mjs flies the best-ship loadout against the same loadout read over a sine in its helm and its gunner. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (821001- one a side, 831001- fleets), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: two fights, each once; the gain; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 12 mutants of tools/ship/takeSineTwins.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 11 RED the first time, ONE 0-RED, A GAP, CLOSED -- a file
//   another policy's taken unchecked (the jobs row now refuses one) -> 1. No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeSineTwins.mjs";
import * as OH from "./takeButtonOneHard.mjs";
import * as HL from "./takeHelmLadder.mjs";
import * as UT from "./takeButtonUntried.mjs";
import * as LD from "./takeLadder.mjs";
import * as BY from "./takeBySightLoadout.mjs";
import * as HC from "./takeFlyWiredHelmControl.mjs";
import * as OW from "./takeFlyWiredOneWindow.mjs";
import * as BS from "./takeBySizeLoadout.mjs";
import * as HT from "./takeFlyWiredHelmTune.mjs";
import * as PH from "./takePresetsHard.mjs";
import * as BL3 from "./takeBestShipLoadout3.mjs";
import * as TR from "./takeFlyWiredGunnerTrigger.mjs";
import * as CT from "./takeFlyWiredGunnerControl.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
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
import * as FS from "../../brain/flySteering.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { sideOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSineTwins.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeSineTwins-selfcheck -- the best-ship loadout against its sine twin\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, the duel's kinds 75 apiece, on 821001- and 831001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet3" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.one[0].seed === 821001 && G.SETS.fleet3[299].seed === 831075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f) => G.jobsOf(f, b, [G.SETS[f][0]])[0], o = j("one"), t = j("fleet3"), sx = sideOf(o.x), sy = sideOf(o.y);
    ok("!! THE JOBS: side X the best-ship loadout (the cannon-aware helm, the button's gunner: no window one ship a side, 45 degrees in a fleet), side Y THE SAME FILES READ OVER A SINE -- the helm over sine~odd, the gunner over sine -- and nothing else different; the cannon on both sides; and the pool seats exactly that", o.x.network.weights[4] === 0 && Math.abs(t.x.network.weights[4] - Math.PI / 4) < 1e-6 && o.x.network.wiring === undefined && o.x.helmNet.wiring === undefined && o.y.network.wiring === "sine" && o.y.helmNet.wiring === "sine~odd" && o.y.network.weights.join() === o.x.network.weights.join() && o.y.helmNet.weights.join() === o.x.helmNet.weights.join() && o.x.cannon && o.y.cannon && o.opts.ships === 1 && t.opts.ships === 3
        && sx.network.module === FT.nearAlways && sx.helmNet.module === FS.third && sy.network.module === FT.nearAlwaysOver("sine") && sy.helmNet.module === FS.thirdOver("sine~odd") && (() => { try { G.brainsOf((f) => (f === G.FILES.flyOne ? JSON.parse(fs.readFileSync(G.FILES.helm, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsOne\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: 0.1, fleet3: -0.05 }, calls = [], r = await G.study(async (f) => { calls.push(f); return G.SETS[f].map((_, i) => W[f] * factor(i)); }, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! two fights, each once; the reading is the loadout less its twin pair by pair", calls.join() === "one,fleet3" && close(r.one.reading.flyOverSine, 0.1) && close(r.fleet3.reading.flyOverSine, -0.05));
    const q = (a, c) => G.decide({ one: { reading: { flyOverSine: { z: a } } }, fleet3: { reading: { flyOverSine: { z: c } } } });
    ok("!! WHAT IS DECIDED: the fly is credited if it LEADS its twin somewhere and TRAILS nowhere; the twin goes on the page if it TRAILS the loadout nowhere (the loadout leading by z 2 anywhere keeps it off)", q(2, 0).flyCredited && !q(2, 0).twinOnPage && !q(2, -2).flyCredited && !q(1.99, 1.99).flyCredited && q(1.99, 1.99).twinOnPage && q(-3, 0).twinOnPage && !q(-3, 0).flyCredited);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sinetwins-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    ok("!! AS KEPT AND RE-DERIVED -- THE FLY'S WIRING IS NOT CREDITED: the best-ship loadout less its sine twin is -0.072 one ship a side (CANNOT BE TOLD) and -0.082 in fleets (z -2.2, TRAILS); the twin goes on the page as a control; the forecast (cannot be told in both) was right one ship a side and a little off in fleets", near(R("one").flyOverSine, -0.072) && rd.one.words.flyOverSine === "CANNOT BE TOLD" && near(R("fleet3").flyOverSine, -0.082) && rd.fleet3.words.flyOverSine === "TRAILS" && !rd.verdict.flyCredited && rd.verdict.twinOnPage && G.FIGHTS.every((f) => Math.abs(G.fightReadings(k(f)).reading.flyOverSine.mean - R(f).flyOverSine.mean) < 1e-12));
    ok("!! AND THE PAGE HAS IT: the `sine twin` preset, the cannon-aware helm's sine twin and the by-the-fight hand's", JSON.stringify(C.presetOf("sine").choice) === '{"hand":"bysize-sine","helm":"sine","cannon":true}' && C.HELMS.some((h) => h.id === "sine") && C.HANDS.some((h) => h.id === "bysize-sine"));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
