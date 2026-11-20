// WebGLEngine/tools/ship/takeFlyWiredHelmNoCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelmNoCannon-selfcheck.mjs      (a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE CANNON-AWARE HELM'S GAIN WITHOUT A CANNON, SEARCHED, HELD. Three things hold tools/ship/takeFlyWiredHelmNoCannon.mjs:
//
//   1  WHAT WAS REGISTERED   the gains and their weights; the pairs (961001- to 1011001-), disjoint from every other fly-wired study's, trainTurretSeatBig's rounds and the gunner trained in today's fight; the brains; the jobs; with a cannon every gain is one fight
//   2  THE STUDY             against a stand-in: what wins, what holds, what is audited and decided; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeFlyWiredHelmNoCannon.mjs, each in a hard-linked copy of the tree, before the study was registered: ALL 16 RED the first time (a seed moved, a pair short, a gain missing; the gains with a cannon
//   moved; the cannon on either side; one gunner for both fights, fleets of two; a tie moving the winner, a hold at zero, a lead or a trail at exactly 2 let by, the held-out gain read against itself; an unknown option let through, the helm's file
//   unchecked, the file written with the shipped gain). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredHelmNoCannon.mjs";
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
const CMD = fileURLToPath(new URL("./takeFlyWiredHelmNoCannon.mjs", import.meta.url));
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const st = (mean, z) => ({ n: 300, mean, se: 0.05, z });

console.log("takeFlyWiredHelmNoCannon-selfcheck -- the cannon-aware helm's gain without a cannon, searched\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const allP = ["train", "held", "audit"].flatMap((s) => G.FIGHTS.flatMap((f) => G.SETS[s][f])), mine = new Set(allP.map((p) => p.seed));
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[BLAST, SC, HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    const big = Object.values(B.ROUNDS).flatMap((r) => [...r.train, ...r.heldOut, ...r.audit]).map((p) => p.seed), sc = ["train", "held", "audit"].flatMap((s) => SC.FIGHTS.flatMap((f) => SC.SETS[s][f].map((p) => p.seed))), tt = [...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    ok("!! the pairs: 96 a fight to train (961001-, 971001-) and hold out (981001-, 991001-), 300 to audit (1001001-, 1011001-), 24 or 75 of each kind; none twice; none flown by another study here", ["train", "held"].every((s) => G.FIGHTS.every((f) => G.SETS[s][f].length === 96)) && G.FIGHTS.every((f) => G.SETS.audit[f].length === 300)
        && [G.SETS.train.one[0].seed, G.SETS.train.fleet[0].seed, G.SETS.held.one[0].seed, G.SETS.held.fleet[0].seed, G.SETS.audit.one[0].seed, G.SETS.audit.fleet[299].seed].join() === "961001,971001,981001,991001,1001001,1011075"
        && D.KINDS.every((k) => G.SETS.audit.one.filter((p) => p.kind === k).length === 75 && G.SETS.train.fleet.filter((p) => p.kind === k).length === 24) && new Set(allP.map((p) => `${p.kind}:${p.seed}`)).size === allP.length && others.length > 1000 && [...others, ...big, ...sc, ...tt].every((x) => !mine.has(x)), `${others.length + big.length + sc.length + tt.length} others`);
    const b = G.brainsOf();
    ok("!! EIGHT GAINS (-2, -1, -0.25, 0, 0.25, 0.5, 1, 2), the shipped 0.25 among them; a gain's weights are the shipped two with a cannon and the gain twice without; at 0.25 the shipped file", G.GAINS.join() === "-2,-1,-0.25,0,0.25,0.5,1,2" && G.SHIPPED === 0.25 && b.helm.weights.join() === "-2,-2,0.25,0.25" && G.weightsOf(1, b.helm.weights).join() === "-2,-2,1,1" && G.weightsOf(G.SHIPPED, b.helm.weights).join() === b.helm.weights.join());
    const j = (f, g) => G.jobsOf(f, g, b, [G.SETS.audit[f][0]])[0], o = j("one", 1), t = j("fleet", 1);
    ok("!! THE JOBS: NO CANNON on either side; the by-size hand's gunner aboard (no window one a side, 45 degrees in fleets of three); the cannon-aware helm at the gain; the plain ship opposite", o.x.network === b.flyOne && b.flyOne.weights[4] === 0 && t.x.network === b.fly && b.fly.weights[4] > 0 && o.opts.ships === 1 && t.opts.ships === 3 && [o, t].every((q) => q.x.cannon === false && q.y.cannon === false && !q.y.network && !q.y.helmNet && q.x.helmNet.policy === FS.POLICY_ID3 && q.x.helmNet.weights.join() === "-2,-2,1,1")
        && (() => { try { G.brainsOf((f) => (f === G.FILES.helm ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /helmFlyWired3WeightsDefault\.json/.test(e2.message); } })());
    const pool = createPool({ workers: 2 }), L = [G.SETS.held.one[3]], withC = (g) => G.jobsOf("one", g, b, L).map((q) => ({ ...q, x: { ...q.x, cannon: true }, y: { ...q.y, cannon: true } }));
    const c1 = await pool.leads(withC(2)), c0 = await pool.leads(withC(G.SHIPPED)), n1 = await pool.leads(G.jobsOf("one", 2, b, L)), n0 = await pool.leads(G.jobsOf("one", G.SHIPPED, b, L)); await pool.close();
    ok("!! FLOWN THROUGH THE POOL: WITH a cannon another gain is the same fight to the lead; without one it is another fight", c1.join() === c0.join() && n1.join() !== n0.join(), `${c0} ${c1} / ${n0} ${n1}`);
});

console.log("2. THE STUDY");
await section(async () => {
    const mk = (sc, held, aud) => async (stage, f, g) => { const n = G.SETS[stage][f].length; if (stage === "train") return Array(n).fill(sc[g] ?? 0); if (stage === "held") return Array(n).fill(g === G.SHIPPED ? 0 : held); return Array.from({ length: n }, (_, i) => aud(f, g) + (i % 7) * 0.01); };
    const calls = [], spy = (fly) => async (...a) => { calls.push(a.join("/")); return fly(...a); };
    let r = await G.study(spy(mk({ 0.25: 0.2 }, 0, () => 0)));
    ok("!! every gain flies on the train pairs of both fights once; the shipped winning, nothing else is flown and nothing ships", calls.length === 16 && new Set(calls).size === 16 && r.winner === G.SHIPPED && !r.verdict.ok && r.held === null && r.audit === null);
    ok("!! A TIE KEEPS THE SHIPPED; the highest wins otherwise", G.pick(Object.fromEntries(G.GAINS.map((g) => [g, 1]))) === G.SHIPPED && G.pick(Object.fromEntries(G.GAINS.map((g) => [g, g === -1 ? 1.1 : 1]))) === -1 && G.pick(Object.fromEntries(G.GAINS.map((g) => [g, g === 0 ? -1 : 0]))) === G.SHIPPED);
    calls.length = 0; r = await G.study(spy(mk({ 1: 0.5 }, -0.05, () => 0)));
    ok("!! A WINNER THAT DOES NOT HOLD (mean not above 0) is not audited", r.winner === 1 && r.held.mean < 0 && r.audit === null && !r.verdict.ok && calls.filter((c) => c.startsWith("held")).length === 4 && !calls.some((c) => c.startsWith("audit")) && !G.holds({ mean: 0, z: 0 }) && G.holds({ mean: 0.001, z: -1.99 }) && !G.holds({ mean: 0.1, z: -2 }));
    calls.length = 0; r = await G.study(spy(mk({ 1: 0.5 }, 0.05, (f, g) => (g === 1 ? 0.5 : 0.2))));
    ok("!! AUDITED: two arms a fight (the winner and 0.25), each once; the gain is the winner less 0.25 pair by pair; it ships", calls.filter((c) => c.startsWith("audit")).length === 4 && new Set(calls).size === calls.length && G.FIGHTS.every((f) => Math.abs(r.audit[f].gain.mean - 0.3) < 1e-9 && r.audit[f].winner.n === 300) && r.verdict.ok);
    ok("!! WHAT IS DECIDED: it ships if the gain LEADS in one fight and TRAILS in neither (exactly -2 trails, exactly 2 leads)", G.qualifies({ one: { gain: st(0.1, 2) }, fleet: { gain: st(0, -1.99) } }).ok && !G.qualifies({ one: { gain: st(0.1, 1.99) }, fleet: { gain: st(0, 1.99) } }).ok && !G.qualifies({ one: { gain: st(0.1, 5) }, fleet: { gain: st(0, -2) } }).ok);
    const b = G.brainsOf(), blob = G.blobOf(r, b);
    ok("!! THE FILE IT WRITES is the cannon-aware helm's, the shipped gains with a cannon and the winner's without, and says how it was chosen", blob.policy === FS.POLICY_ID3 && Array.from(blob.weights).join() === "-2,-2,1,1" && /takeFlyWiredHelmNoCannon/.test(JSON.stringify(blob)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmnoc-")); fs.writeFileSync(path.join(tmp, "r.reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--out", path.join(tmp, "r.json"), "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    const RF = G.DEFAULT_OUT.replace(/\.json$/, ".reading.json");
    if (!fs.existsSync(RF)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    // @@FOUND@@
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
