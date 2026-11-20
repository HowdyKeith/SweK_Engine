// WebGLEngine/tools/ship/takeHelmLadder-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeHelmLadder-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE HELM LADDER, HELD. tools/ship/takeHelmLadder.mjs flies the page's five helms each against each, the same gunner on every side. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (801001- one a side, 811001- fleets), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: every match once; the scores and the order; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeHelmLadder.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, a pair short; the 45-degree gunner one ship a side, the bow-on entrant helmed, the broadside rule under the helms, no cannon, the steer helm's file another's, the seats swapped; the score's sign, the order upside down;
//   a file unchecked; the second read and an unknown option let through; an entrant dropped). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeHelmLadder.mjs";
import * as LD from "./takeLadder.mjs";
import * as OH from "./takeButtonOneHard.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as HSt from "../../brain/helmSteerPolicy.mjs";
import * as HCo from "../../brain/helmCompassPolicy.mjs";
import * as UT from "./takeButtonUntried.mjs";
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
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { sideOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeHelmLadder.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeHelmLadder-selfcheck -- the duel page's helms, each against each\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 160 pairs each, the duel's kinds 40 apiece, on 801001- and 811001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet3" && G.FIGHTS.every((f) => G.SETS[f].length === 160 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 40)) && G.SETS.one[0].seed === 801001 && G.SETS.fleet3[159].seed === 811040 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), S = (e, f) => G.sideOf(e, f, b, "x");
    ok("!! THE ENTRANTS ARE THE PAGE'S FIVE HELMS, EACH FROM ITS SHIPPED FILE (the page's own: helm, helm-steer, helm-compass, helm-flywired) and each by its policy; EVERY SIDE CARRIES THE BEST-SHIP BUTTON'S GUNNER (the no-window one one ship a side, the 45-degree one in a fleet) and the bow-on rule under its helm; face has no helm network; a file another policy's refused", G.ENTRANTS.join() === "flywired,trained,steer,compass,face" && b.flywired.policy === "helmFlyWired3" && b.trained.policy === "helmPolicy" && b.steer.policy === "helmSteerPolicy" && b.compass.policy === "helmCompassPolicy" && b.trained.weights.length === HP.WEIGHT_COUNT && b.steer.weights.length === HSt.WEIGHT_COUNT && b.compass.weights.length === HCo.WEIGHT_COUNT
        && ["helm", "helm-steer", "helm-compass", "helm-flywired"].every((k, i) => C.FILES[k].path.endsWith(path.basename([G.FILES.trained, G.FILES.steer, G.FILES.compass, G.FILES.flywired][i]))) && G.ENTRANTS.every((e) => S(e, "one").network === b.flyOne && S(e, "fleet3").network === b.fly && S(e, "one").helmRule === "face" && S(e, "one").cannon) && S("face", "one").helmNet === null && S("steer", "one").helmNet === b.steer && S("flywired", "fleet3").helmNet === b.flywired && b.flyOne.weights[4] === 0
        && (() => { try { G.brainsOf((f) => (f === G.FILES.steer ? JSON.parse(fs.readFileSync(G.FILES.trained, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /helmSteerWeightsDefault\.json/.test(e.message); } })());
    const m1 = G.matchesOf("one", b).map((m) => m.join("~")), m3 = G.matchesOf("fleet3", b).map((m) => m.join("~")), j = G.jobsOf("fleet3", ["compass", "face"], b, [G.SETS.fleet3[2]])[0];
    ok("!! THE MATCHES: all ten in both fights (no two entrants are the same side); a match's job puts the first-named on side X, three ships a side in a fleet", m1.length === 10 && m3.length === 10 && m3.includes("flywired~face") && j.x.helmNet === b.compass && j.y.helmNet === null && j.opts.ships === 3 && j.seed === G.SETS.fleet3[2].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const b = G.brainsOf(), V = { flywired: 2, trained: 1, steer: 1.6, compass: 1.4, face: 0 }, calls = [], r = await G.study(async (f, [a, c]) => { calls.push(`${f}/${a}~${c}`); return G.SETS[f].map((_, i) => (V[a] - V[c]) * factor(i)); }, b, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 160, close = (x, v) => Math.abs(x - v * mf) < 1e-9;
    ok("!! every match once (20); a match's lead the first-named less the second; an entrant's score the mean of its leads over the other four; the order by score", calls.length === 20 && new Set(calls).size === 20 && close(r.one.matches["flywired~face"].mean, 2) && close(r.one.score.flywired, (1 + 0.4 + 0.6 + 2) / 4) && close(r.fleet3.score.face, -(2 + 1 + 1.6 + 1.4) / 4) && r.one.order.join() === "flywired,steer,compass,trained,face");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmladder-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), b = G.brainsOf(), k = (f, m) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${m}.json`), "utf8")).leads, near = (x, v) => Math.abs(x - v) < 5e-4;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings(Object.fromEntries(G.matchesOf(f, b).map((m) => [m.join("~"), k(f, m.join("~"))])))]));
    ok("!! AS KEPT AND RE-DERIVED -- THE CANNON-AWARE FLY-WIRED HELM IS FIRST, FAR AHEAD, IN BOTH: one ship a side flywired 0.835 > steer 0.152 > compass -0.139 > trained -0.217 > face -0.631; in fleets flywired 1.074 > steer 0.092 > trained -0.218 > compass -0.240 > face -0.708; it LEADS every other helm in every match (by 0.63 to 1.37), so no other helm is a candidate for the buttons", rd.one.order.join() === "flywired,steer,compass,trained,face" && rd.fleet3.order.join() === "flywired,steer,trained,compass,face" && near(rd.one.score.flywired, 0.835) && near(rd.fleet3.score.flywired, 1.074) && G.FIGHTS.every((f) => ["trained", "steer", "compass", "face"].every((o) => rd[f].words[`flywired~${o}`] === "LEADS" && rd[f].matches[`flywired~${o}`].mean > 0.6))
        && G.FIGHTS.every((f) => Object.keys(re[f].matches).every((m) => Math.abs(re[f].matches[m].mean - rd[f].matches[m].mean) < 1e-12)));
    ok("!! the rest as forecast but for trained and compass, which cannot be told apart (-0.127 and -0.090); steer is second in both (+0.38 and +0.21 over compass); the forecast was right; AND THE PAGE SAYS EACH HELM'S PLACE", rd.one.words["trained~compass"] === "CANNOT BE TOLD" && rd.fleet3.words["trained~compass"] === "CANNOT BE TOLD" && rd.one.order[1] === "steer" && rd.fleet3.order[1] === "steer" && ["flywired", "steer", "compass", "trained", "face"].every((id) => /helm ladder/i.test(C.HELMS.find((h) => h.id === id).note)));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
