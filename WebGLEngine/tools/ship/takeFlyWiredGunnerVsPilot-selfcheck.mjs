// WebGLEngine/tools/ship/takeFlyWiredGunnerVsPilot-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerVsPilot-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE PAGE'S GUNNER AGAINST THE TRAINED PILOT, HELD. tools/ship/takeFlyWiredGunnerVsPilot.mjs flies the ships-sticky fly-wired gunner and the page's (seatFlyWired8) against fighters and escorts flown by the trained 6DOF pilot. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (381001- fighters, 391001- both escort fleets), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs; and THE POOL'S SIDE `pilotNet` is the duel's own fight with that pilot
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeFlyWiredGunnerVsPilot.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, the escort fleets on separate lists, a pair short; no pilot for the raiders, for side Y's escorts, for side X's; the cannon everywhere, four escorts; the page's file unchecked twice over; the gain's sign, the leads one arm's;
//   the second read and a --write let through). AND TWO ON tools/ship/pairPool.mjs's side `pilotNet`, both red: Q1 not passed to the side 1 | Q2 a brain of any role taken as the pilot 1.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerVsPilot.mjs";
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
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { sideOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerVsPilot.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeFlyWiredGunnerVsPilot-selfcheck -- the page's gunner against the trained pilot\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, SE, HSS, NE, NX].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 attacks or pairs each, 75 of each kind: the pilot's fighters on 381001- (the fighter fight's kinds), both escort fleets on the SAME pairs (391001-, the duel's kinds); none flown by another fly-wired study", G.REGIMES.join() === "fighters,escorts,escortsCannon" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.fighters[0].seed === 381001 && G.SETS.escorts[299].seed === 391075 && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && D.KINDS.every((k) => G.SETS.escorts.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), page = JSON.parse(fs.readFileSync(G.PAGE_FILE, "utf8"));
    ok("!! THE BRAINS: ships is seatFlyWired3 at its shipped -3, -3; page is seatFlyWired8 at its shipped -3, -3, 0.1; the pilot is the frozen pilot6dofPolicy file the pilot study flew; a page file another policy's is refused by name", b.ships.policy === "seatFlyWired3" && b.ships.weights.join() === "-3,-3" && b.page.policy === "seatFlyWired8" && b.page.weights.join() === Float32Array.from(page.weights).join() && b.pilot.policy === "pilot6dofPolicy" && b.pilot.weights.length === P6.WEIGHT_COUNT && b.pilot.weights.join() === PI.shipped().pilot.weights.join()
        && throwsWith(() => G.brainsOf(() => JSON.parse(fs.readFileSync(path.join(path.dirname(G.PAGE_FILE), "seatFlyWired3WeightsDefault.json"), "utf8"))), /seatFlyWired8WeightsDefault\.json/));
    const f = G.jobsOf("fighters", "page", b, [G.SETS.fighters[1]])[0], e = G.jobsOf("escorts", "ships", b, [G.SETS.escorts[0]])[0], ec = G.jobsOf("escortsCannon", "page", b, [G.SETS.escortsCannon[2]])[0];
    ok("!! THE JOBS: a fighter job carries the gunner and NAMES THE PILOT for the raiders; an escort fleet is three ships and six escorts a side, BOTH sides' escorts flown by the pilot, the cannon on both sides in escortsCannon only; the gunner on side X only", f.vsFighters.network === b.page && f.vsFighters.helm === null && f.vsFighters.opts.pilotNet === b.pilot && f.vsFighters.seed === G.SETS.fighters[1].seed && e.opts.ships === 3 && e.opts.escorts === 6 && e.x.pilotNet === b.pilot && e.y.pilotNet === b.pilot && !e.x.cannon && !e.y.cannon && ec.x.cannon && ec.y.cannon && e.x.network === b.ships && ec.x.network === b.page && !e.y.network && ec.seed === G.SETS.escortsCannon[2].seed);
    const pilot = { module: P6, weights: Float32Array.from(b.pilot.weights) }, mk = (id, o) => D.makeSide(id, { gunners: "regular", helmRule: "face", cannon: false, network: null, helmNet: null, ...o });
    const viaPool = D.duel(sideOf({ id: "x", cannon: false, pilotNet: b.pilot }), sideOf({ id: "y", cannon: false }), 5, "crossing", { ships: 1, escorts: 2 }).fingerprint, byHand = D.duel(mk("x", { pilot }), mk("y", {}), 5, "crossing", { ships: 1, escorts: 2 }).fingerprint, pd = D.duel(mk("x", {}), mk("y", {}), 5, "crossing", { ships: 1, escorts: 2 }).fingerprint;
    ok("!! THE POOL'S SIDE `pilotNet` (2026-11-20) flies the side's escorts with that pilot -- the duel's own fight with the pilot on the side, to the bit, and not the PD autopilot's -- and a brain that is not a pilot is refused by name", viaPool === byHand && viaPool !== pd && throwsWith(() => sideOf({ id: "x", pilotNet: b.ships }), /"seatFlyWired3" is not a pilot policy/), `${viaPool} ${byHand} ${pd}`);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fighters: [-0.3, 0], escorts: [0.1, 0.25], escortsCannon: [-0.2, -0.1] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "page" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is the page's LESS the ships-sticky, pair by pair (0.3, 0.15, 0.1); each arm read against the plain side; nothing decided", calls.length === 6 && new Set(calls).size === 6 && close(r.fighters.reading.gain, 0.3) && close(r.escorts.reading.gain, 0.15) && close(r.escortsCannon.reading.gain, 0.1) && r.fighters.reading.page.mean === 0 && close(r.escorts.reading.ships, 0.1) && r.verdict === undefined);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vspilot-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--write", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know (there is no --write: nothing ships) and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (g) => rd[g].reading;
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ ships: k(g, "ships"), page: k(g, "page") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- AGAINST THE TRAINED PILOT THE PAGE'S GUNNER HOLDS UP: level with the plain ship against the pilot's fighters (-0.003, CANNOT BE TOLD), and it LEADS the plain side with pilot-flown escorts, +0.363 without the cannon and +0.258 with it; it leads the ships-sticky gunner by +0.316, +0.253 and +0.398", near(R("fighters").page, -0.003) && rd.fighters.words.page === "CANNOT BE TOLD" && near(R("escorts").page, 0.363) && near(R("escortsCannon").page, 0.258) && rd.escorts.words.page === "LEADS" && rd.escortsCannon.words.page === "LEADS" && near(R("fighters").gain, 0.316) && near(R("escorts").gain, 0.253) && near(R("escortsCannon").gain, 0.398) && G.REGIMES.every((g) => rd[g].words.gain === "LEADS")
        && G.REGIMES.every((g) => ["page", "ships", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)));
    ok("!! the ships-sticky gunner: -0.319 (TRAILS) against the pilot's fighters, as the pilot study had it (-0.31); +0.109 and -0.140 (TRAILS) with pilot-flown escorts. The forecast was right against the fighters and UNDER with escorts (it said a smaller lead than against PD escorts; it is about the same)", near(R("fighters").ships, -0.319) && rd.fighters.words.ships === "TRAILS" && near(R("escorts").ships, 0.109) && near(R("escortsCannon").ships, -0.140) && rd.escortsCannon.words.ships === "TRAILS");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
