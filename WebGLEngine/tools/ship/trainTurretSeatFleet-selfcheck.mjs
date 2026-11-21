// WebGLEngine/tools/ship/trainTurretSeatFleet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainTurretSeatFleet-selfcheck.mjs      (a minute or two; the study is flown here by a stand-in; section 3 reads the kept records once they exist)
//
// THE CAR'S GUNNER NETWORK TRAINED IN FLEETS OF THREE, HELD. tools/ship/trainTurretSeatFleet.mjs runs trainTurretSeatBig's search and choice in a fleet, from car-today. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1161001-, 1171001-, 1181001-), disjoint from every other fly-wired study's and from trainTurretSeatBig's rounds; the search; the brains (each checked by its policy); the jobs; the start flies as car-today
//   2  THE STUDY             against a stand-in: the search on the train pairs from the start, the choice on the held-out pairs, the audit once; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept records
//
// @@SABOTAGE@@
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./trainTurretSeatFleet.mjs";
import * as TT from "./trainTurretSeatToday.mjs";
import * as CTD from "./takeCarToday.mjs";
import * as CTE from "./takeCarTodayEscorts.mjs";
import * as NC from "./takeFlyWiredHelmNoCannon.mjs";
import * as AX from "./takeFlyWiredHelmAxes.mjs";
import * as B from "./trainTurretSeatBig.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as SC from "./takeSteerCannon.mjs";
import * as BLAST from "./takeButtonLast.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
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
const CMD = fileURLToPath(new URL("./trainTurretSeatFleet.mjs", import.meta.url));
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const hashOf = (w) => { let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + Math.round(w[i] * 1e4)) | 0; return h; };
/** The stand-in: a lead that depends on the weights and the pair, deterministic. */
const standIn = (w, list) => Promise.resolve(list.map(({ kind, seed }) => (((hashOf(w) ^ (seed * 2654435761)) >>> 0) % 1000) / 1000 - 0.5 + (kind === "chase" ? 0.01 : 0)));

console.log("trainTurretSeatFleet-selfcheck -- the car's gunner network trained in fleets of three\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const mine = new Set([...G.SETS.train, ...G.SETS.held, ...G.SETS.audit].map((p) => p.seed));
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[BLAST, SC, CTD, CTE, HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed })), ...[NC, AX].flatMap((M) => ["train", "held", "audit"].flatMap((s2) => Object.values(M.SETS[s2]).flat())), ...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    const big = Object.values(B.ROUNDS).flatMap((r) => [...r.train, ...r.heldOut, ...r.audit]).map((p) => p.seed), sc = ["train", "held", "audit"].flatMap((s) => SC.FIGHTS.flatMap((f) => SC.SETS[s][f].map((p) => p.seed)));
    const all = [...G.SETS.train, ...G.SETS.held, ...G.SETS.audit];
    ok("!! the pairs: 300 train (1161001-1161075), 300 held out (1171001-), 600 audit (1181001-1181150), seed by seed with the four kinds in turn; none twice; none flown by another fly-wired study, by trainTurretSeatBig's rounds, by the steer helm's search or by trainTurretSeatToday", G.SETS.train.length === 300 && G.SETS.held.length === 300 && G.SETS.audit.length === 600
        && G.SETS.train[0].seed === 1161001 && G.SETS.train[299].seed === 1161075 && G.SETS.held[0].seed === 1171001 && G.SETS.audit[599].seed === 1181150 && G.SETS.train.slice(0, 4).map((p) => p.kind).join() === D.KINDS.join() && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1200
        && others.length > 1000 && [...others, ...big, ...sc].every((x) => !mine.has(x)), `${others.length + big.length + sc.length} others`);
    ok("!! ONE SEARCH, seed 9500, 150 children", G.SEEDS.join() === "9500" && G.ITERS === 150);
    const b = G.brainsOf(), car = JSON.parse(fs.readFileSync(G.FILES.start, "utf8")), j = G.jobsOf(b.start.weights, [G.SETS.audit[5]], b)[0];
    ok("!! THE JOBS ARE FLEETS OF THREE: the cannon on both, BOTH under the page's cannon-aware fly-wired helm; the network (seatTurretGunner) in the seats against the 45-degree fly-wired gunner; the start is car-today's file", j.opts.ships === 3 && j.x.cannon && j.y.cannon && j.x.helmNet === b.helm && j.y.helmNet === b.helm && b.helm.policy === FS.POLICY_ID3 && j.x.network.policy === ST.POLICY_ID && j.y.network === b.foe && b.foe.policy === FT.POLICY_ID11 && Math.abs(b.foe.weights[4] - Math.PI / 4) < 1e-6 && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && G.FILES.start === TT.DEFAULT_OUT
        && b.start.weights.join() === Array.from(Float32Array.from(car.weights)).join() && j.kind === G.SETS.audit[5].kind && j.seed === G.SETS.audit[5].seed
        && (() => { try { G.brainsOf((f) => (f === G.FILES.foe ? car : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatFlyWired11WeightsDefault\.json/.test(e2.message); } })());
    const pool = createPool({ workers: 2 }), L = [G.SETS.held[7], G.SETS.held[10]];
    const a = await pool.leads(G.jobsOf(b.start.weights, L, b)), c = await pool.leads(L.map(({ kind, seed }) => ({ x: { id: "net", cannon: true, network: { policy: car.policy, weights: car.weights }, helmNet: b.helm }, y: { id: "fly", cannon: true, network: b.foe, helmNet: b.helm }, kind, seed, opts: { ships: 3 } })));
    const z = await pool.leads(G.jobsOf(new Float32Array(ST.WEIGHT_COUNT), L, b)); await pool.close();
    ok("!! FLOWN THROUGH THE POOL, the start is car-today's file to the lead, and other weights are another fight", a.join() === c.join() && z.join() !== a.join(), `${a.map((x) => x.toFixed(3)).join(", ")} / ${z.map((x) => x.toFixed(3)).join(", ")}`);
});

console.log("2. THE STUDY");
await section(async () => {
    const b = G.brainsOf(), start = Float32Array.from(b.start.weights), order = [], flown = [];
    const fly = (w, list) => { flown.push(list[0].seed); return standIn(w, list); };
    const search = (seed) => { order.push(seed); return B.search({ seed, iters: 3 }, () => {}, { fly, train: G.SETS.train, start }); };
    const r = await G.study({ fly, search, start });
    ok("!! the one search, 9500, on the train pairs from the start; the choice reads the held-out pairs; the audit is read on its 600", order.join() === "9500" && r.runs.length === 1 && r.runs.every((x) => x.trainFirst === 1161001 && x.heldOut.n === 300) && r.reading.lead.n === 600 && r.reading.start.n === 600 && flown.includes(1171001) && flown.includes(1181001) && !flown.some((s) => s < 1161001 || s > 1181150));
    const s0 = await standIn(start, G.SETS.audit), c0 = await standIn(r.champion.weights, G.SETS.audit);
    ok("!! THE READING IS trainTurretSeatBig.finish's: the champion the best held-out; against the fly-wired gunner, the start, what the training bought (the champion less the start, pair by pair)", r.champion.seed === [...r.runs].sort((x, y) => y.heldOut.mean - x.heldOut.mean || x.seed - y.seed)[0].seed && Math.abs(r.reading.start.mean - TA.stat(s0).mean) < 1e-12 && Math.abs(r.reading.training.mean - TA.stat(c0.map((v, i) => v - s0[i])).mean) < 1e-12);
    let threw = false; try { await B.finish([{ ...r.runs[0], startHash: "00000000" }], () => {}, { fly, heldOut: G.SETS.held, audit: G.SETS.audit, start, trainFirst: G.SETS.train[0].seed }); } catch (e) { threw = /started from other weights/.test(e.message); }
    ok("!! a record that started from other weights is refused", threw);
    const blob = G.blobOf({ ...r, champion: { ...r.champion, heldOut: r.runs[0].heldOut } });
    ok("!! THE FILE IT WRITES is seatTurretGunner's with the champion's weights, and says where it was trained", blob.policy === ST.POLICY_ID && blob.weights.length === ST.WEIGHT_COUNT && blob.weights.map((v) => Math.fround(v)).join() === Array.from(r.champion.weights).join() && /FLEETS OF THREE/.test(JSON.stringify(blob)) && /45-degree fly-wired gunner/.test(JSON.stringify(blob)) && /from car-today/.test(JSON.stringify(blob)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "turfleet-")); fs.writeFileSync(path.join(tmp, "r.reading.json"), "{}");
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
