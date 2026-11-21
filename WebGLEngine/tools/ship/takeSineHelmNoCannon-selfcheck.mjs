// WebGLEngine/tools/ship/takeSineHelmNoCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSineHelmNoCannon-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SINE TWIN'S GAIN WITHOUT A CANNON, HELD. tools/ship/takeSineHelmNoCannon.mjs searches the sine twin's gain without a cannon and reads the fly against it. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1191001- to 1241075), disjoint from every other study's here; the gains; the brains (each checked by its policy); the jobs (no cannon, the sine on the sine's arms only)
//   2  THE STUDY             against a stand-in: the train pairs once a gain, the held-out choice, the audit arms; what ships; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/helmFlyWired3WeightsSineNoCannon.reading.json; the kept flights in brain/rig-results/sineHelmNoCannon/): IT SHIPS. On train -0.25 won (1.695; -1 1.678, -2 1.612, 0 1.549, 0.25 1.470, 0.5 0.582, 1 -0.559,
//   2 -1.229); held out it led 0.25 by +0.253 (z 3.96, 192 pairs). On the audit the sine at -0.25 less 0.25: +0.446 one ship a side (z 7.41), +0.212 in fleets of three (z 5.53), both LEAD. THE FLY LESS THE SINE: +0.021 (z 0.75) and +0.010 (z 0.41),
//   neither can be told. The forecast held. The page's `sine` helm loads brain/helmFlyWired3WeightsSineNoCannon.json; the fly-wired helm's note says a sine does as well without a cannon.
//
// SABOTAGE LOG: 19 mutants of tools/ship/takeSineHelmNoCannon.mjs, before any pair was flown: 18 RED the first time (a seed moved, the audit a pair short, a gain dropped; the sine twin's file the fly's, no sine wiring, the sine on the fly's arm;
//   the cannon on, a fleet of one, the no-window gunner in fleets; a tie moving the gain, the winner kept although it does not hold, the fly less the sine's sign, a trail at exactly -2 let by, a lead at 1.9; a file unchecked; the second read
//   and an unknown option let through; the file at another gain). ONE GREEN, and it cannot be red: dropping `z above -2` from the held-out rule -- a held-out gain whose mean is above 0 has z above 0.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeSineHelmNoCannon.mjs";
import * as NC from "./takeFlyWiredHelmNoCannon.mjs";
import * as AX from "./takeFlyWiredHelmAxes.mjs";
import * as CTD from "./takeCarToday.mjs";
import * as CTE from "./takeCarTodayEscorts.mjs";
import * as TF from "./trainTurretSeatFleet.mjs";
import * as TT from "./trainTurretSeatToday.mjs";
import * as B from "./trainTurretSeatBig.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as SC from "./takeSteerCannon.mjs";
import * as BLAST from "./takeButtonLast.mjs";
import * as HSC from "../../brain/helmSteerCannon.mjs";
import * as HS from "../../brain/helmSteerPolicy.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as OH from "./takeButtonOneHard.mjs";
import * as HL from "./takeHelmLadder.mjs";
import * as SW from "./takeSineTwins.mjs";
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
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { createPool } from "./pairPool.mjs";


let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSineHelmNoCannon.mjs", import.meta.url));
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const st = (mean, z) => ({ n: 300, mean, se: 0.05, z });

console.log("takeSineHelmNoCannon-selfcheck -- the sine twin's gain without a cannon, and the control made fair\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const allP = ["train", "held", "audit"].flatMap((s) => G.FIGHTS.flatMap((f) => G.SETS[s][f])), mine = new Set(allP.map((p) => p.seed));
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[BLAST, SC, CTD, CTE, HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    const big = Object.values(B.ROUNDS).flatMap((r) => [...r.train, ...r.heldOut, ...r.audit]).map((p) => p.seed), sc = ["train", "held", "audit"].flatMap((s) => SC.FIGHTS.flatMap((f) => SC.SETS[s][f].map((p) => p.seed))), tt = [...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit, ...TF.SETS.train, ...TF.SETS.held, ...TF.SETS.audit, ...[NC, AX].flatMap((M) => ["train", "held", "audit"].flatMap((s2) => Object.values(M.SETS[s2]).flat()))].map((p) => p.seed);
    ok("!! the pairs: 96 a fight to train (1191001-, 1201001-) and hold out (1211001-, 1221001-), 300 to audit (1231001-, 1241001-), 24 or 75 of each kind; none twice; none flown by another study here", ["train", "held"].every((s) => G.FIGHTS.every((f) => G.SETS[s][f].length === 96)) && G.FIGHTS.every((f) => G.SETS.audit[f].length === 300)
        && [G.SETS.train.one[0].seed, G.SETS.train.fleet[0].seed, G.SETS.held.one[0].seed, G.SETS.held.fleet[0].seed, G.SETS.audit.one[0].seed, G.SETS.audit.fleet[299].seed].join() === "1191001,1201001,1211001,1221001,1231001,1241075"
        && D.KINDS.every((k) => G.SETS.audit.one.filter((p) => p.kind === k).length === 75 && G.SETS.train.fleet.filter((p) => p.kind === k).length === 24) && new Set(allP.map((p) => `${p.kind}:${p.seed}`)).size === allP.length && others.length > 1000 && [...others, ...big, ...sc, ...tt].every((x) => !mine.has(x)), `${others.length + big.length + sc.length + tt.length} others`);
    const b = G.brainsOf();
    ok("!! EIGHT GAINS, 0.25 (the sine twin's now) among them; the sine's weights are its file's two with a cannon and the gain twice; at 0.25 the page's sine helm file; the fly's arm is the page's fly-wired helm file (-0.25 without a cannon)", G.GAINS.join() === "-2,-1,-0.25,0,0.25,0.5,1,2" && G.SHIPPED === 0.25 && b.sine.weights.join() === "-2,-2,0.25,0.25" && G.weightsOf(1, b.sine.weights).join() === "-2,-2,1,1" && b.fly.weights.join() === "-2,-2,-0.25,-0.25"
        && (C.FILES["helm-sine"].path.endsWith(path.basename(G.FILES.sine)) || C.FILES["helm-sine"].path.endsWith(path.basename(G.DEFAULT_OUT))) && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.fly)) && G.SINE === "sine~odd");
    const j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS.audit[f][0]])[0], o = j("one", 1), t = j("fleet", 1), fo = j("one", "fly"), ft = j("fleet", "fly");
    ok("!! THE JOBS: NO CANNON on either side; the by-size hand's gunner aboard (the fly's own: no window one a side, 45 degrees in fleets of three) on every arm; the sine twin's arms carry the sine wiring at the gain, the fly's arm none; the plain ship opposite", o.x.network === b.gunOne && b.gunOne.weights[4] === 0 && t.x.network === b.gun && b.gun.weights[4] > 0 && fo.x.network === b.gunOne && ft.x.network === b.gun && o.opts.ships === 1 && t.opts.ships === 3 && ft.opts.ships === 3
        && [o, t, fo, ft].every((q) => q.x.cannon === false && q.y.cannon === false && !q.y.network && !q.y.helmNet && q.x.helmNet.policy === FS.POLICY_ID3 && !q.x.network.wiring) && [o, t].every((q) => q.x.helmNet.wiring === "sine~odd" && q.x.helmNet.weights.join() === "-2,-2,1,1") && [fo, ft].every((q) => q.x.helmNet.wiring === undefined && q.x.helmNet.weights.join() === "-2,-2,-0.25,-0.25")
        && (() => { try { G.brainsOf((f) => (f === G.FILES.sine ? JSON.parse(fs.readFileSync(G.FILES.gun, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /helmFlyWired3WeightsDefault\.json/.test(e2.message); } })());
    const pool = createPool({ workers: 2 }), Lp = [G.SETS.held.one[3], G.SETS.held.fleet[5]];
    const s25 = await pool.leads(G.jobsOf("one", 0.25, b, Lp)), fly25 = await pool.leads(Lp.map(({ kind, seed }) => ({ x: { id: "x", cannon: false, network: b.gunOne, helmNet: { ...b.sine } }, y: { id: "plain", cannon: false }, kind, seed, opts: { ships: 1 } }))), sm2 = await pool.leads(G.jobsOf("one", -2, b, Lp)); await pool.close();
    ok("!! FLOWN THROUGH THE POOL: the sine wiring is another fight from the fly's at the same weights, and another gain is another fight", s25.join() !== fly25.join() && sm2.join() !== s25.join(), `${s25} / ${fly25} / ${sm2}`);
});

console.log("2. THE STUDY");
await section(async () => {
    const mk = (sc, held, aud) => async (stage, f, g) => { const n = G.SETS[stage][f].length; if (stage === "train") return Array(n).fill(sc[g] ?? 0); if (stage === "held") return Array(n).fill(g === G.SHIPPED ? 0 : held); return Array.from({ length: n }, (_, i) => aud(f, g) + (i % 7) * 0.01); };
    const calls = [], spy = (fly) => async (...a) => { calls.push(a.join("/")); return fly(...a); };
    let r = await G.study(spy(mk({ 0.25: 0.2 }, 0, (f, g) => (g === "fly" ? 0.3 : 0.2))));
    ok("!! 0.25 WINNING: every gain on the train pairs of both fights once, nothing held out, the audit the fly and the sine at 0.25 only; the fly less the sine read; nothing ships", calls.filter((c) => c.startsWith("train")).length === 16 && !calls.some((c) => c.startsWith("held")) && calls.filter((c) => c.startsWith("audit")).length === 4 && new Set(calls).size === calls.length && r.gain === 0.25 && G.FIGHTS.every((f) => r.audit[f].sineGain === null && Math.abs(r.audit[f].flyLessSine.mean - 0.1) < 1e-9) && !r.verdict.ok);
    ok("!! A TIE KEEPS 0.25; the highest wins otherwise", G.pick(Object.fromEntries(G.GAINS.map((g) => [g, 1]))) === G.SHIPPED && G.pick(Object.fromEntries(G.GAINS.map((g) => [g, g === -1 ? 1.1 : 1]))) === -1);
    calls.length = 0; r = await G.study(spy(mk({ 1: 0.5 }, -0.05, (f, g) => (g === "fly" ? 0.3 : 0.2))));
    ok("!! A WINNER THAT DOES NOT HOLD: the sine keeps 0.25 and the audit is still read (the fly against the sine at 0.25)", r.winner === 1 && r.gain === 0.25 && calls.filter((c) => c.startsWith("held")).length === 4 && calls.filter((c) => c.startsWith("audit")).length === 4 && !calls.some((c) => c === "audit/one/1") && !r.verdict.ok);
    calls.length = 0; r = await G.study(spy(mk({ "-1": 0.5 }, 0.05, (f, g) => (g === "fly" ? 0.6 : g === -1 ? 0.5 : 0.2))));
    ok("!! A WINNER THAT HOLDS: three arms a fight (the fly, the sine at its gain, at 0.25), each once; the sine's gain less 0.25 and the fly less the sine at its gain, pair by pair; it ships", r.gain === -1 && calls.filter((c) => c.startsWith("audit")).length === 6 && new Set(calls).size === calls.length && G.FIGHTS.every((f) => Math.abs(r.audit[f].sineGain.mean - 0.3) < 1e-9 && Math.abs(r.audit[f].flyLessSine.mean - 0.1) < 1e-9) && r.verdict.ok);
    const Q = (a, b2) => G.qualifies({ one: { sineGain: st(0.1, a), flyLessSine: st(0, 0) }, fleet: { sineGain: st(0.1, b2), flyLessSine: st(0, 0) } }).ok;
    ok("!! WHAT SHIPS: the sine's gain LEADS 0.25 in one fight and TRAILS in neither (exactly 2 leads, exactly -2 trails); the fly less the sine decides nothing", Q(2, 0) && Q(0, 2) && !Q(1.99, 1.99) && !Q(5, -2) && G.qualifies({ one: { sineGain: st(0.1, 3), flyLessSine: st(-9, -9) }, fleet: { sineGain: st(0.1, 3), flyLessSine: st(-9, -9) } }).ok);
    const b = G.brainsOf(), blob = G.blobOf(r, b);
    ok("!! THE FILE IT WRITES is the cannon-aware helm's, -2, -2 with a cannon and the sine's gain without, and says it is the sine twin, a control", blob.policy === FS.POLICY_ID3 && Array.from(blob.weights).join() === "-2,-2,-1,-1" && /takeSineHelmNoCannon/.test(JSON.stringify(blob)) && /SINE TWIN/.test(JSON.stringify(blob)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sinenoc-")); fs.writeFileSync(path.join(tmp, "r.reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--out", path.join(tmp, "r.json"), "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    const RF = G.DEFAULT_OUT.replace(/\.json$/, ".reading.json");
    if (!fs.existsSync(RF)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(RF, "utf8")), blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8")), k = (st, f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${st}_${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const sumTrain = (g) => [...k("train", "one", g), ...k("train", "fleet", g)].reduce((a, b) => a + b, 0) / (G.SETS.train.one.length + G.SETS.train.fleet.length);
    const sc = Object.fromEntries(G.GAINS.map((g) => [g, sumTrain(g)])), best = [...G.GAINS].sort((x, y) => sc[y] - sc[x])[0];
    ok("!! THE TRAIN SCORES, re-derived from the kept flights: -0.25 won (1.695) of the eight, 0.25 had 1.470, 2 had -1.229", best === -0.25 && rd.winner === -0.25 && G.GAINS.every((g) => Math.abs(sc[g] - rd.scores[g]) < 1e-9) && Math.abs(sc[-0.25] - 1.6946) < 5e-4 && Math.abs(sc[0.25] - 1.4703) < 5e-4, G.GAINS.map((g) => `${g}:${sc[g].toFixed(3)}`).join(" "));
    const held = TA.stat([...k("held", "one", -0.25), ...k("held", "fleet", -0.25)].map((v, i) => v - [...k("held", "one", 0.25), ...k("held", "fleet", 0.25)][i]));
    ok("!! HELD OUT, -0.25 less 0.25 +0.253 (z 3.96, 192 pairs): it holds, the gain is -0.25", near(held, 0.2528) && held.n === 192 && G.holds(held) && rd.gain === -0.25);
    const au = (f) => { const fl = k("audit", f, "fly"), s = k("audit", f, -0.25), s0 = k("audit", f, 0.25); return { sineGain: TA.stat(s.map((v, i) => v - s0[i])), flyLessSine: TA.stat(fl.map((v, i) => v - s[i])) }; }, o = au("one"), t = au("fleet");
    ok("!! THE AUDIT, read once: the sine at -0.25 less 0.25 LEADS one ship a side (+0.446, z 7.41) and in fleets (+0.212, z 5.53); THE FLY LESS THE SINE cannot be told in either (+0.021, +0.010); it ships", near(o.sineGain, 0.4461) && TA.word(o.sineGain.z) === "LEADS" && near(t.sineGain, 0.2125) && TA.word(t.sineGain.z) === "LEADS" && near(o.flyLessSine, 0.0207) && near(t.flyLessSine, 0.0102) && TA.word(o.flyLessSine.z) === "CANNOT BE TOLD" && TA.word(t.flyLessSine.z) === "CANNOT BE TOLD" && o.sineGain.n === 300 && rd.verdict.ok);
    ok("!! THE FILE is [-2, -2, -0.25, -0.25] and THE PAGE'S sine helm loads it; the fly-wired helm's note says a sine does as well without a cannon", blob.policy === FS.POLICY_ID3 && blob.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-sine"].path === "brain/helmFlyWired3WeightsSineNoCannon.json" && /takeSineHelmNoCannon/.test(C.HELMS.find((h) => h.id === "sine").note) && /takeSineHelmNoCannon/.test(C.HELMS.find((h) => h.id === "flywired").note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
