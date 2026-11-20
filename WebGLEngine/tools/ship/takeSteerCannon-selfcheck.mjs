// WebGLEngine/tools/ship/takeSteerCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSteerCannon-selfcheck.mjs      (a minute or two; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE STEERING HELM GIVEN A CANNON SWITCH, SEARCHED, HELD. tools/ship/takeSteerCannon.mjs searches the cannon set of brain/helmSteerCannon.mjs. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the sixteen candidates and their weights; the pairs (871001- to 921001-), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs; (1, 1) flies as the steer helm
//   2  THE STUDY             against a stand-in: what wins, what holds, what is audited and decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeSteerCannon.mjs, each in a hard-linked copy of the tree, before the study was registered: ALL 18 RED the first time (a seed moved, a pair short, a candidate missing; the set without a cannon
//   moved, the turn put on the encoder weight; one gunner for both fights, the plain ship without its cannon; a tie moving the winner, a hold at zero, a lead or a trail at exactly 2 let by, the gap read against steer, a preset taken on one fight;
//   an unknown option let through, the fly-wired file unchecked, the held-out gain read against itself, the steer arm flown as a candidate, the file written with the shipped weights). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeSteerCannon.mjs";
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
const CMD = fileURLToPath(new URL("./takeSteerCannon.mjs", import.meta.url));
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const st = (mean, z) => ({ n: 300, mean, se: 0.05, z });

console.log("takeSteerCannon-selfcheck -- the steering helm given a cannon switch, searched\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const allSeeds = ["train", "held", "audit"].flatMap((s) => G.FIGHTS.flatMap((f) => G.SETS[s][f].map((p) => p.seed))), mine = new Set(allSeeds);
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[BLAST, HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! the pairs: 96 a fight to train (871001-, 881001-) and hold out (891001-, 901001-), 300 to audit (911001-, 921001-), 24 or 75 of each kind; none twice, none flown by another fly-wired study", ["train", "held"].every((s) => G.FIGHTS.every((f) => G.SETS[s][f].length === 96)) && G.FIGHTS.every((f) => G.SETS.audit[f].length === 300)
        && [G.SETS.train.one[0].seed, G.SETS.train.fleet[0].seed, G.SETS.held.one[0].seed, G.SETS.held.fleet[0].seed, G.SETS.audit.one[0].seed, G.SETS.audit.fleet[299].seed].join() === "871001,881001,891001,901001,911001,921075"
        && D.KINDS.every((k) => G.SETS.audit.one.filter((p) => p.kind === k).length === 75 && G.SETS.train.fleet.filter((p) => p.kind === k).length === 24) && new Set(["train", "held", "audit"].flatMap((st) => G.FIGHTS.flatMap((f) => G.SETS[st][f].map((p) => `${p.kind}:${p.seed}`)))).size === allSeeds.length && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), steer = JSON.parse(fs.readFileSync(G.FILES.steer, "utf8"));
    ok("!! SIXTEEN CANDIDATES (turn 0, 1, 2, 3 by throttle 0, 0.5, 1, 1.5), the shipped (1, 1) among them; a candidate's six weights are the steer file's encoder weight, its turning output weight times the turn and its throttle bias times the throttle WITH a cannon, the shipped three WITHOUT", G.CANDIDATES.length === 16 && new Set(G.CANDIDATES).size === 16 && G.CANDIDATES.includes(G.SHIPPED) && G.SHIPPED === "1,1" && G.CANDIDATES.includes("0,0") && G.CANDIDATES.includes("3,1.5")
        && b.three.join() === HSC.INDICES.map((k) => Float32Array.from(steer.weights)[k]).join() && (() => { const w = G.weightsOf("3,0.5", b.three); return w[0] === b.three[0] && w[1] === 3 * b.three[1] && w[2] === 0.5 * b.three[2] && w.slice(3).join() === b.three.join(); })() && G.weightsOf("1,1", b.three).join() === [...b.three, ...b.three].join());
    const j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS.audit[f][0]])[0], o = j("one", "2,0"), t = j("fleet", "2,0"), s = j("one", "steer"), w = j("fleet", "flywired");
    ok("!! THE JOBS: the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets of three); a candidate flies helmSteerCannon, `steer` the shipped steer file, `flywired` the cannon-aware fly-wired helm's; the cannon on both sides, the plain ship opposite", o.x.network === b.flyOne && b.flyOne.weights[4] === 0 && t.x.network === b.fly && b.fly.weights[4] > 0 && o.opts.ships === 1 && t.opts.ships === 3 && o.x.helmNet.policy === HSC.POLICY_ID && o.x.helmNet.weights.join() === G.weightsOf("2,0", b.three).join() && s.x.helmNet === b.steer && b.steer.policy === HS.POLICY_ID && w.x.helmNet === b.flywired && b.flywired.policy === FS.POLICY_ID3 && [o, t, s, w].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet)
        && (() => { try { G.brainsOf((f) => (f === G.FILES.flywired ? JSON.parse(fs.readFileSync(G.FILES.steer, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /helmFlyWired3WeightsDefault\.json/.test(e2.message); } })());
    const pool = createPool({ workers: 2 }), L = [G.SETS.held.one[3]], F = [G.SETS.held.fleet[50]];
    const lead = async (arm) => [...await pool.leads(G.jobsOf("one", arm, b, L)), ...await pool.leads(G.jobsOf("fleet", arm, b, F))];
    const a11 = await lead("1,1"), aS = await lead("steer"), a30 = await lead("3,0"); await pool.close();
    ok("!! FLOWN THROUGH THE POOL, (1, 1) IS THE STEER HELM TO THE LEAD and another candidate is another fight", a11.join() === aS.join() && a30.join() !== aS.join(), `${a11.map((x) => x.toFixed(3)).join(", ")} / ${a30.map((x) => x.toFixed(3)).join(", ")}`);
});

console.log("2. THE STUDY");
await section(async () => {
    const mk = (sc, held, aud) => async (stage, f, arm) => { const n = G.SETS[stage][f].length; if (stage === "train") return Array(n).fill(sc[arm] ?? 0); if (stage === "held") return Array(n).fill(arm === G.SHIPPED ? 0 : held); return Array.from({ length: n }, (_, i) => aud(f, arm) + (i % 7) * 0.01); };
    const calls = [], spy = (fly) => async (...a) => { calls.push(a.join("/")); return fly(...a); };
    let r = await G.study(spy(mk({ "1,1": 0.2 }, 0, () => 0)));
    ok("!! every candidate flies on the train pairs of both fights once; the shipped winning, nothing else is flown and nothing ships", calls.length === 32 && new Set(calls).size === 32 && r.winner === G.SHIPPED && !r.verdict.ok && r.held === null && r.audit === null);
    ok("!! A TIE KEEPS THE SHIPPED; the highest wins otherwise", G.pick(Object.fromEntries(G.CANDIDATES.map((c) => [c, 1]))) === G.SHIPPED && G.pick(Object.fromEntries(G.CANDIDATES.map((c) => [c, c === "2,0.5" ? 1.1 : 1]))) === "2,0.5" && G.pick(Object.fromEntries(G.CANDIDATES.map((c) => [c, c === "0,0" ? -1 : 0]))) === G.SHIPPED);
    calls.length = 0; r = await G.study(spy(mk({ "3,0": 0.5 }, -0.05, () => 0)));
    ok("!! A WINNER THAT DOES NOT HOLD (mean not above 0) is not audited", r.winner === "3,0" && r.held.mean < 0 && r.audit === null && !r.verdict.ok && calls.filter((c) => c.startsWith("held")).length === 4 && !calls.some((c) => c.startsWith("audit")) && !G.holds({ mean: 0, z: 0 }) && G.holds({ mean: 0.001, z: -1.99 }) && !G.holds({ mean: 0.1, z: -2 }));
    calls.length = 0; r = await G.study(spy(mk({ "3,0": 0.5 }, 0.05, (f, arm) => (arm === "3,0" ? 0.5 : arm === "steer" ? 0.2 : 0.9))));
    ok("!! AUDITED: three arms a fight (the winner, steer, fly-wired), each once; the gain is the winner less steer, the gap the winner less fly-wired, pair by pair; it ships and keeps off the fly-wired helm's presets", calls.filter((c) => c.startsWith("audit")).length === 6 && new Set(calls).size === calls.length && G.FIGHTS.every((f) => Math.abs(r.audit[f].gain.mean - 0.3) < 1e-9 && Math.abs(r.audit[f].gap.mean + 0.4) < 1e-9 && r.audit[f].winner.n === 300) && r.verdict.ok && r.replacesFlyWired === false);
    ok("!! WHAT IS DECIDED: it ships if the gain LEADS in one fight and TRAILS in neither (exactly -2 trails, exactly 2 leads); it takes a preset only if it LEADS the fly-wired helm in both", G.qualifies({ one: { gain: st(0.1, 2) }, fleet: { gain: st(0, -1.99) } }).ok && !G.qualifies({ one: { gain: st(0.1, 1.99) }, fleet: { gain: st(0, 1.99) } }).ok && !G.qualifies({ one: { gain: st(0.1, 5) }, fleet: { gain: st(0, -2) } }).ok
        && G.replacesFlyWired({ one: { gap: st(0.1, 2) }, fleet: { gap: st(0.1, 2) } }) && !G.replacesFlyWired({ one: { gap: st(0.1, 5) }, fleet: { gap: st(0.1, 1.99) } }));
    const b = G.brainsOf(), blob = G.blobOf(r, b);
    ok("!! THE FILE IT WRITES is helmSteerCannon's, the winner's three with a cannon and the shipped three without, and says how it was chosen", blob.policy === HSC.POLICY_ID && blob.weights.length === 6 && blob.weights.map((v) => Math.fround(v)).join() === Array.from(Float32Array.from(G.weightsOf("3,0", b.three))).join() && /takeSteerCannon/.test(blob.by ?? blob.meta?.by ?? JSON.stringify(blob)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "steercan-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
