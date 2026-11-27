// WebGLEngine/tools/ship/takeFlyWiredGunnerTrigger-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerTrigger-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE HELD TRIGGER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerTrigger.mjs flies the page's gunner (seatFlyWired10) and the same with the trigger held (seatFlyWired11) in five fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (461001- both fleet fights, 471001- rationed, 481001- escorts, 491001- fighters), disjoint from every other fly-wired study's; the arms; the jobs
//   2  THE STUDY             against a stand-in: ten arms, each once; the gain pair by pair; what ships; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredGunnerTrigger.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 18 RED the first time
//   (the seeds moved, the fleets on separate lists, an attack short; the ration whole, the ration and the escorts in every fight, no cannon rationed, the cannon on one side; the arms one policy, the window 20 degrees;
//   the gain's sign, the leads one arm's; one fight allowed to lead, a trail at exactly -2 let by; the file's policy and score; the second read and an unknown option let through). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerTrigger.mjs";
import * as CT from "./takeFlyWiredGunnerControl.mjs";
import * as PB from "../../brain/peerBrain.mjs";
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
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerTrigger.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeFlyWiredGunnerTrigger-selfcheck -- the page's gunner holding the trigger\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, SE, HSS, NE, VP, NX, CT].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! five fights, 300 pairs or attacks each, 75 of each kind: both fleet fights on the SAME pairs (461001-), rationed on 471001-, escorts on 481001-, fighters on 491001- (the fighter fight's kinds); none flown by another fly-wired study", G.REGIMES.join() === "fleetCannon,fleetNoCannon,rationed,escortsCannon,fighters" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.fleetCannon === G.SETS.fleetNoCannon && G.SETS.fleetCannon[0].seed === 461001 && G.SETS.rationed[0].seed === 471001 && G.SETS.escortsCannon[0].seed === 481001 && G.SETS.fighters[299].seed === 491075 && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && D.KINDS.every((k) => G.SETS.rationed.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const j = (g, arm, i) => G.jobsOf(g, arm, [G.SETS[g][i]])[0], a = j("fleetCannon", "held", 0), b = j("fleetNoCannon", "page", 1), c = j("rationed", "held", 2), e = j("escortsCannon", "page", 3), f = j("fighters", "held", 4);
    ok("!! THE ARMS ARE seatFlyWired10 AND seatFlyWired11 AT THE SAME WEIGHTS (the page's file's); the cannon on both sides in every fleet fight but fleetNoCannon; a quarter of every magazine in the rationed fight only; six escorts in the escort fleet only; a fighter job the gunner alone", G.POLICY.page === "seatFlyWired10" && G.POLICY.held === "seatFlyWired11" && JSON.parse(fs.readFileSync(path.join(path.dirname(G.DEFAULT_OUT), "seatFlyWired10WeightsDefault.json"), "utf8")).weights.every((v, i) => Math.abs(v - G.WEIGHTS[i]) < 1e-6)
        && a.x.network.policy === "seatFlyWired11" && b.x.network.policy === "seatFlyWired10" && a.x.network.weights.join() === b.x.network.weights.join() && a.x.cannon && a.y.cannon && !b.x.cannon && !b.y.cannon && c.x.cannon && c.opts.ammo === 0.25 && a.opts.ammo === undefined && e.opts.ammo === undefined && e.opts.escorts === 6 && a.opts.escorts === undefined && c.opts.escorts === undefined && [a, b, c, e].every((q) => q.opts.ships === 3 && !q.y.network) && f.vsFighters.network.policy === "seatFlyWired11" && f.vsFighters.helm === null && JSON.stringify(f.vsFighters.opts) === "{}" && f.vsFighters.seed === G.SETS.fighters[4].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleetCannon: [0.1, 0.25], fleetNoCannon: [-0.3, -0.2], rationed: [0.05, 0.05], escortsCannon: [0.2, 0.1], fighters: [0, 0.03] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "held" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.fleetCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! ten arms, each once; the gain is the held trigger LESS the page's, pair by pair (0.15, 0.1, exactly 0, -0.1, 0.03); it does not ship here (a fight trails)", calls.length === 10 && new Set(calls).size === 10 && close(r.fleetCannon.reading.gain, 0.15) && close(r.fleetNoCannon.reading.gain, 0.1) && r.rationed.reading.gain.mean === 0 && close(r.escortsCannon.reading.gain, -0.1) && close(r.fighters.reading.gain, 0.03) && close(r.fleetCannon.reading.held, 0.25) && close(r.fleetCannon.reading.page, 0.1) && !r.verdict.ok && /in escortsCannon the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.REGIMES.map((g, i) => [g, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT SHIPS: a lead in any one fight is enough; (1.99 everywhere) no; a trail anywhere no; -1.99 is not a trail", [0, 1, 2, 3, 4].every((k) => q(...[0, 0, 0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99, 1.99, 1.99).reasons[0]) && !q(5, 5, 5, 5, -2).ok && /in fighters the gain TRAILS/.test(q(5, 5, 5, 5, -2).reasons[0]) && !q(5, 5, -2, 5, 5).ok && q(5, 5, 5, 5, -1.99).ok);
    const W2 = { ...W, escortsCannon: [0.1, 0.2] }, r2 = await G.study(async (g, arm) => G.SETS[g].map((_, i) => W2[g][arm === "held" ? 1 : 0] * factor(i)), () => {}), blob = G.blobOf(r2), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID11, FT.nearAlways), blob);
    ok("!! the blob is a seatFlyWired11 brain at the page's weights, seated with the held-trigger library, and its `by` says the trigger is held and all five fights' gains", r2.verdict.ok && back.ok && Array.from(back.weights).every((v, i) => Math.abs(v - G.WEIGHTS[i]) < 1e-6) && blob.policy === "seatFlyWired11" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.nearAlways && /THE TRIGGER HELD WHENEVER IT HAS A TARGET/.test(blob.by) && G.REGIMES.every((g) => blob.by.includes(g + " ")) && blob.score === Number(r2.fleetCannon.reading.held.mean.toFixed(3)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guntrig-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--out", out, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (g) => rd[g].reading, blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8"));
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ page: k(g, "page"), held: k(g, "held") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS, BY A LOT: the held trigger less the page's is +0.467 with the cannon, +0.886 without, +0.415 rationed to a quarter, +1.147 with escorts, +0.022 against fighters; every fight LEADS (z 8 to 20)", near(R("fleetCannon").gain, 0.467) && near(R("fleetNoCannon").gain, 0.886) && near(R("rationed").gain, 0.415) && near(R("escortsCannon").gain, 1.147) && near(R("fighters").gain, 0.022) && G.REGIMES.every((g) => rd[g].words.gain === "LEADS") && rd.verdict.ok
        && G.REGIMES.every((g) => ["held", "page", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)), G.REGIMES.map((g) => R(g).gain.mean.toFixed(3)).join(" "));
    ok("!! against the plain side the held trigger +0.545, +1.324, +0.576, +1.663, +0.021 -- it LEADS in every fight, fighters included. The forecast was right in direction and about right in size, and WRONG rationed (it said less; +0.415 is about the same as with whole magazines, +0.467)", G.REGIMES.every((g) => rd[g].words.held === "LEADS") && near(R("fleetCannon").held, 0.545) && near(R("fleetNoCannon").held, 1.324) && near(R("rationed").held, 0.576) && near(R("escortsCannon").held, 1.663) && near(R("fighters").held, 0.021));
    ok("!! and the file: a seatFlyWired11 brain at the page's weights, the page's `flywired` hand", PB.importBrain(PB.describePolicy(FT.POLICY_ID11, FT.nearAlways), blob).ok && blob.policy === "seatFlyWired11" && Array.from(blob.weights).every((v, i) => Math.abs(v - G.WEIGHTS[i]) < 1e-6));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredGunnerTrigger.mjs held by its gate (it found these 2 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredGunnerTrigger.mjs");
    const NAMED = ["ESCORTS", "RATION"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
