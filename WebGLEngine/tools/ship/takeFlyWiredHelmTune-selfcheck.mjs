// WebGLEngine/tools/ship/takeFlyWiredHelmTune-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelmTune-selfcheck.mjs      (under a minute; the study is flown here by stand-ins; section 3 reads the kept flights once they exist)
//
// THE HELM GAIN SEARCH, HELD. tools/ship/takeFlyWiredHelmTune.mjs searches the cannon-aware fly-wired helm's gain with a cannon, with the two trigger-holding gunners aboard, in three stages. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the gains; the pairs (561001- and 571001- train, 581001- and 591001- held out, 601001- and 611001- audit), disjoint from every other fly-wired study's and from each other; the shipped gain is the shipped file's; the jobs
//   2  THE STUDY             against stand-ins: the pick (a tie keeps -2), the stop when -2 wins, the stop when the winner does not hold, the audit and what ships; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredHelmTune.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 18 RED the first time
//   (a gain dropped, the shipped gain moved, one weight moved, the no-cannon weights moved; the held-out pairs the train's, one ship a side flown as a fleet, one gunner only; a tie to the newcomer, no held-out stop, no stop when -2 wins,
//   a zero gain holding; the audit's sign, a trail at exactly -2 let by; a file unchecked, the cannon on one side; the second read and an unknown option let through; the file's score). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredHelmTune.mjs";
import * as TU from "./takeFlyWiredGunnerTune.mjs";
import * as CT from "./takeFlyWiredGunnerControl.mjs";
import * as TR from "./takeFlyWiredGunnerTrigger.mjs";
import * as BL3 from "./takeBestShipLoadout3.mjs";
import * as BS from "./takeBySizeLoadout.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as BL from "./takeBestShipLoadout.mjs";
import * as BL2 from "./takeBestShipLoadout2.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as GH from "./takeFlyWiredGunnerHold.mjs";
import * as SE from "./takeFlyWiredGunnerSees.mjs";
import * as HSS from "./takeFlyWiredGunnerHoldSees.mjs";
import * as NE from "./takeFlyWiredGunnerNear.mjs";
import * as VP from "./takeFlyWiredGunnerVsPilot.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredHelmTune.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat(2).flatMap((p) => (p && typeof p.seed === "number" ? [p.seed] : p && typeof p === "object" && !Array.isArray(p) ? Object.values(p).flat().filter((q) => q && typeof q.seed === "number").map((q) => q.seed) : []));

console.log("takeFlyWiredHelmTune-selfcheck -- the cannon-aware helm's gain, searched\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const all = (st) => Object.values(G.SETS[st]).flat().map((p) => p.seed), train = new Set(all("train")), held = new Set(all("held")), audit = new Set(all("audit")), mine = new Set([...train, ...held, ...audit]);
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! six gains (-0.5, -1, -2, -3, -4, -6; -2 shipped); train 96 pairs a fight (561001- one a side, 571001- fleets), held out 96 (581001-, 591001-), audit 300 (601001-, 611001-); the three sets disjoint; none flown by another fly-wired study", G.GAINS.join() === "-0.5,-1,-2,-3,-4,-6" && G.SHIPPED === -2 && G.SETS.train.one.length === 96 && G.SETS.train.fleet[0].seed === 571001 && G.SETS.held.one[0].seed === 581001 && G.SETS.audit.one.length === 300 && G.SETS.audit.fleet[299].seed === 611075 && D.KINDS.every((k) => G.SETS.train.one.filter((p) => p.kind === k).length === 24)
        && [...train].every((s) => !held.has(s) && !audit.has(s)) && [...held].every((s) => !audit.has(s)) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.gunnersOf(), shipped = JSON.parse(fs.readFileSync(path.join(path.dirname(G.DEFAULT_OUT), "helmFlyWired3WeightsDefault.json"), "utf8")).weights, j = (f, g, gain) => G.jobsOf(f, g, gain, b, [G.SETS.train[f][0]])[0];
    ok("!! AT -2 THE HELM IS THE SHIPPED FILE [-2, -2, 0.25, 0.25]; a gain goes into both weights with a cannon, the two without kept; the gunners are the car's (gunnerPolicy) and the page's fly-wired one (seatFlyWired11), each from its shipped file; one ship a side and three, the cannon on both sides, side Y plain", G.weightsOf(-2).join() === Array.from(shipped).join() && G.weightsOf(-4).join() === "-4,-4,0.25,0.25" && j("one", "car", -2).x.helmNet.policy === "helmFlyWired3" && j("one", "car", -2).x.helmNet.weights.join() === "-2,-2,0.25,0.25" && j("one", "car", -3).x.network === b.car && j("fleet", "fly", -3).x.network === b.fly && b.fly.policy === "seatFlyWired11" && b.car.policy === "gunnerPolicy" && j("one", "car", -3).opts.ships === 1 && j("fleet", "fly", -3).opts.ships === 3 && [j("one", "car", -3), j("fleet", "fly", -1)].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet)
        && (() => { try { G.gunnersOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by stand-ins)");
await section(async () => {
    const stand = (tr, hd, au) => { const calls = []; return { calls, fly: async (stage, fight, gunner, gain) => { calls.push(`${stage}/${fight}/${gunner}/${gain}`); const n = stage === "audit" ? 300 : 96, v = stage === "train" ? tr[gain] : stage === "held" ? hd[gain] : au[gain]; return Array.from({ length: n }, (_, i) => v * factor(i)); } }; };
    const TR0 = { "-0.5": 0.1, "-1": 0.2, "-2": 0.3, "-3": 0.35, "-4": 0.2, "-6": 0.1 };
    const a = stand(TR0, { "-3": 0.4, "-2": 0.3 }, { "-3": 0.4, "-2": 0.3 }), r = await G.study(a.fly, () => {});
    ok("!! the full path: every gain trained in both fights with both gunners (24 arms), the best (-3) held out against -2 in all four, audited against -2 in all four, and it ships", a.calls.filter((c) => c.startsWith("train")).length === 24 && r.winner === -3 && a.calls.filter((c) => c.startsWith("held")).length === 8 && a.calls.filter((c) => c.startsWith("audit")).length === 8 && Object.keys(r.audit).join() === "one_car,one_fly,fleet_car,fleet_fly" && r.verdict.ok && Math.abs(r.scores[-3] - 0.35 * G.SETS.train.one.reduce((s, _, i) => s + factor(i), 0) / 96) < 1e-9);
    const b = stand({ ...TR0, "-3": 0.3 }, {}, {}), rb = await G.study(b.fly, () => {});
    ok("!! A TIE KEEPS -2 and when -2 wins NOTHING IS HELD OUT OR AUDITED", rb.winner === -2 && !b.calls.some((x) => !x.startsWith("train")) && rb.audit === null && !rb.verdict.ok && G.pick({ "-0.5": 1, "-1": 1, "-2": 1, "-3": 1, "-4": 1, "-6": 1 }) === -2);
    const d = stand(TR0, { "-3": 0.3, "-2": 0.3 }, {}), rd = await G.study(d.fly, () => {});
    ok("!! A WINNER THAT DOES NOT HOLD stops it before the audit", rd.winner === -3 && rd.audit === null && !d.calls.some((x) => x.startsWith("audit")) && !G.holds({ mean: 0, z: 0 }) && G.holds({ mean: 0.01, z: 0.5 }) && !G.holds({ mean: 0.01, z: -2 }));
    const q = (...z) => G.qualifies(Object.fromEntries(["one_car", "one_fly", "fleet_car", "fleet_fly"].map((k, i) => [k, { gain: { z: z[i] } }])));
    ok("!! WHAT SHIPS: a lead in any one of the four is enough; (1.99 everywhere) no; a trail anywhere no", q(2, 0, 0, 0).ok && q(0, 0, 0, 2).ok && !q(1.99, 1.99, 1.99, 1.99).ok && !q(5, 5, 5, -2).ok && /in fleet_fly the gain TRAILS/.test(q(5, 5, 5, -2).reasons[0]) && q(5, 5, 5, -1.99).ok);
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), blob);
    ok("!! the blob is a helmFlyWired3 brain at [-3, -3, 0.25, 0.25] and its `by` says the gain, how it was chosen and the four audit gains", back.ok && Array.from(back.weights).join() === "-3,-3,0.25,0.25" && /at the gain -3 WITH A CANNON/.test(blob.by) && ["one_car", "one_fly", "fleet_car", "fleet_fly"].every((k) => blob.by.includes(k + " ")) && blob.score === Number(r.audit.one_car.winner.mean.toFixed(3)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmtune-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--out", out, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (st, f, g, gain) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${st}_${f}_${g}_${gain}.json`), "utf8")).leads, near = (x, v) => Math.abs(x - v) < 5e-4;
    const sc = Object.fromEntries(G.GAINS.map((gain) => { const all = G.FIGHTS.flatMap((f) => G.GUNNERS.flatMap((g) => k("train", f, g, gain))); return [gain, all.reduce((x, y) => x + y, 0) / all.length]; }));
    const w = G.FIGHTS.flatMap((f) => G.GUNNERS.flatMap((g) => k("held", f, g, -6))), s2 = G.FIGHTS.flatMap((f) => G.GUNNERS.flatMap((g) => k("held", f, g, -2))), hg = w.map((v, i) => v - s2[i]).reduce((x, y) => x + y, 0) / w.length;
    ok("!! AS KEPT AND RE-DERIVED -- THE SHIPPED GAIN STANDS: the train scores are FLAT from -1 to -6 (1.612, 1.683, 1.642, 1.618, 1.695; only -0.5 is clearly lower, 1.496); -6 won by 0.012 and DID NOT HOLD (-0.029 less -2 on 384 held-out pairs, z -1.2); nothing was audited and no file was written", G.GAINS.every((g) => Math.abs(sc[g] - rd.scores[g]) < 1e-12) && near(sc[-0.5], 1.496) && near(sc[-2], 1.683) && near(sc[-6], 1.695) && rd.winner === -6 && Math.abs(hg - rd.held.mean) < 1e-12 && near(rd.held.mean, -0.029) && !G.holds(rd.held) && rd.audit === null && !rd.verdict.ok && !fs.existsSync(G.DEFAULT_OUT));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
