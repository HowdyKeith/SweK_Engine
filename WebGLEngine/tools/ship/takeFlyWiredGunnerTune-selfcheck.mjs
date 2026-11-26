// WebGLEngine/tools/ship/takeFlyWiredGunnerTune-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerTune-selfcheck.mjs      (under a minute; the study is flown here by stand-ins; section 3 reads the kept flights once they exist)
//
// THE WINDOW SEARCH, HELD. tools/ship/takeFlyWiredGunnerTune.mjs searches the hand's window of the near-hand fly-wired gunner in three stages (train, held out, audit). Three things hold it:
//
//   1  WHAT WAS REGISTERED   the windows; the pairs (401001- train, 411001- held out, 421001- and 431001- audit), disjoint from every other fly-wired study's and from each other; the policy at the shipped window is seatFlyWired9's weights; the jobs
//   2  THE STUDY             against stand-ins: the pick (a tie keeps 20), the stop when 20 wins, the stop when the winner does not hold, the audit and what ships; the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 17 mutants of tools/ship/takeFlyWiredGunnerTune.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 17 RED the first time
//   (a window dropped, the shipped window moved, degrees for radians; the held-out pairs the train's, the audit's escort fleets on separate lists; a tie to the newcomer; no held-out stop, a zero gain holding, a trail holding;
//   no stop when 20 wins; the audit gain's sign, a trail at exactly -2 let by; one train fight; no cannon in the escort fleets; the file's score; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerTune.mjs";
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
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerTune.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat(2).flatMap((p) => (p && typeof p.seed === "number" ? [p.seed] : p && typeof p === "object" && !Array.isArray(p) ? Object.values(p).flat().filter((q) => q && typeof q.seed === "number").map((q) => q.seed) : []));

console.log("takeFlyWiredGunnerTune-selfcheck -- the hand's window, searched\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const train = new Set(G.SETS.train.map((p) => p.seed)), held = new Set(G.SETS.held.map((p) => p.seed)), audit = new Set(Object.values(G.SETS.audit).flat().map((p) => p.seed)), mine = new Set([...train, ...held, ...audit]);
    const others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, SE, HSS, NE, VP, NX].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! six windows (10, 15, 20, 30, 45, 60 degrees; 20 shipped); 96 train pairs (401001-, 24 of each kind) and 96 held-out (411001-) for both train fights; the audit's escort fleets on 421001- and its plain fleets on 431001-, 300 each, each pair of fights on the same pairs; the three sets disjoint; none flown by another fly-wired study", G.WINDOWS.join() === "10,15,20,30,45,60" && G.SHIPPED === 20 && G.SETS.train.length === 96 && G.SETS.held.length === 96 && G.SETS.train[0].seed === 401001 && G.SETS.held[0].seed === 411001 && G.AUDIT_FIGHTS.every((g) => G.SETS.audit[g].length === 300) && G.SETS.audit.escorts === G.SETS.audit.escortsCannon && G.SETS.audit.fleetCannon === G.SETS.audit.fleetNoCannon && G.SETS.audit.escorts[0].seed === 421001 && G.SETS.audit.fleetCannon[299].seed === 431075
        && D.KINDS.every((k) => G.SETS.train.filter((p) => p.kind === k).length === 24) && [...train].every((s) => !held.has(s) && !audit.has(s)) && [...held].every((s) => !audit.has(s)) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const f = (deg, fight) => G.jobsOf(fight, deg, [G.SETS.train[0]])[0];
    ok("!! THE POLICY IS seatFlyWired10 AND AT 20 DEGREES ITS WEIGHTS ARE seatFlyWired9's SHIPPED ONES ([-3, -3, 0.1, 0.2, 20 degrees] = brain/flyTracking.mjs's SHIPPED9); the window goes in the fifth weight in radians; the jobs' fights: the cannon on both sides exactly in the two cannon fights, six escorts in the escort fleets, none in the plain fleets", f(20, "fleetCannon").x.network.policy === "seatFlyWired10" && f(20, "fleetCannon").x.network.weights.join() === FT.SHIPPED9.join() && Math.abs(f(45, "fleetCannon").x.network.weights[4] - Math.PI / 4) < 1e-12 && f(10, "fleetCannon").x.cannon && f(10, "fleetCannon").y.cannon && !f(10, "fleetNoCannon").x.cannon && !f(10, "fleetNoCannon").y.cannon && f(10, "escorts").opts.escorts === 6 && !f(10, "escorts").x.cannon && f(10, "escortsCannon").x.cannon && f(10, "fleetCannon").opts.escorts === undefined && f(10, "fleetCannon").opts.ships === 3 && !f(10, "fleetCannon").y.network);
});

console.log("2. THE STUDY (flown by stand-ins)");
await section(async () => {
    const stand = (tr, hd, au) => { const calls = []; return { calls, fly: async (stage, fight, deg) => { calls.push(`${stage}/${fight}/${deg}`); const n = stage === "audit" ? 300 : 96, v = stage === "train" ? tr[deg] : stage === "held" ? hd[deg] : au[fight][deg]; return Array.from({ length: n }, (_, i) => v * factor(i)); } }; };
    const TR = { 10: 0.1, 15: 0.2, 20: 0.3, 30: 0.35, 45: 0.2, 60: 0.1 }, AU = Object.fromEntries(G.AUDIT_FIGHTS.map((g) => [g, { 30: 0.4, 20: 0.3 }]));
    const a = stand(TR, { 30: 0.4, 20: 0.3 }, AU), r = await G.study(a.fly, () => {});
    ok("!! the full path: every window trained on both fights (twelve arms), the best (30) held out against 20 on both fights, audited against 20 in four fights, and it ships (the gain 0.1 everywhere)", a.calls.filter((c) => c.startsWith("train")).length === 12 && r.winner === 30 && a.calls.filter((c) => c.startsWith("held")).join() === "held/fleetCannon/30,held/fleetCannon/20,held/fleetNoCannon/30,held/fleetNoCannon/20" && a.calls.filter((c) => c.startsWith("audit")).length === 8 && G.AUDIT_FIGHTS.every((g) => Math.abs(r.audit[g].gain.mean - 0.1 * G.SETS.audit.fleetCannon.reduce((s, _, i) => s + factor(i), 0) / 300) < 1e-9) && r.verdict.ok && Math.abs(r.scores[30] - 0.35 * G.SETS.train.reduce((s, _, i) => s + factor(i), 0) / 96) < 1e-9);
    const b = stand({ ...TR, 30: 0.3 }, {}, AU), rb = await G.study(b.fly, () => {}), c = stand({ ...TR, 30: 0.25 }, {}, AU), rc = await G.study(c.fly, () => {});
    ok("!! A TIE KEEPS 20 and when 20 wins NOTHING IS HELD OUT OR AUDITED: the shipped window stands", rb.winner === 20 && rc.winner === 20 && !b.calls.some((x) => !x.startsWith("train")) && rb.audit === null && !rb.verdict.ok && G.pick({ 10: 1, 15: 1, 20: 1, 30: 1, 45: 1, 60: 1 }) === 20 && G.pick({ 10: 2, 15: 1, 20: 1, 30: 1, 45: 1, 60: 1 }) === 10);
    const d = stand(TR, { 30: 0.3, 20: 0.3 }, AU), rd = await G.study(d.fly, () => {});
    ok("!! A WINNER THAT DOES NOT HOLD stops it before the audit (a held-out gain of exactly 0 does not hold; one above 0 that does not trail does; one that trails does not)", rd.winner === 30 && rd.audit === null && !d.calls.some((x) => x.startsWith("audit")) && !rd.verdict.ok && !G.holds({ mean: 0, z: 0 }) && G.holds({ mean: 0.01, z: 0.5 }) && !G.holds({ mean: 0.01, z: -2 }));
    const q = (...z) => G.qualifies(Object.fromEntries(G.AUDIT_FIGHTS.map((g, i) => [g, { gain: { z: z[i] } }])));
    ok("!! WHAT SHIPS: a lead in any one audit fight is enough; (1.99 everywhere) no; a trail anywhere no; -1.99 is not a trail", [0, 1, 2, 3].every((k) => q(...[0, 0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99, 1.99).reasons[0]) && !q(5, 5, 5, -2).ok && /in fleetNoCannon the gain TRAILS/.test(q(5, 5, 5, -2).reasons[0]) && q(5, 5, 5, -1.99).ok);
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID10, FT.nearTunable), blob);
    ok("!! the blob is a seatFlyWired10 brain whose fifth weight is the winning window in radians, seated with the tunable library, and its `by` says the window, how it was chosen and the four audit gains", back.ok && Math.abs(back.weights[4] - Math.PI / 6) < 1e-6 && Array.from(back.weights.slice(0, 4)).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1,0.2" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.nearTunable && /WITHIN 30 DEGREES/.test(blob.by) && /chosen of 10, 15, 20, 30, 45, 60/.test(blob.by) && G.AUDIT_FIGHTS.every((g) => blob.by.includes(g + " ")) && blob.score === Number(r.audit.fleetCannon.winner.mean.toFixed(3)));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guntune-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (st, f, d) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${st}_${f}_${d}.json`), "utf8")).leads, near = (x, v) => Math.abs(x - v) < 5e-4, blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8"));
    const sc = Object.fromEntries(G.WINDOWS.map((d) => { const all = G.TRAIN_FIGHTS.flatMap((f) => k("train", f, d)); return [d, all.reduce((x, y) => x + y, 0) / all.length]; }));
    ok("!! AS KEPT AND RE-DERIVED -- THE TRAIN SCORES ARE NEARLY FLAT (0.237, 0.232, 0.224, 0.239, 0.259, 0.254 for 10 to 60 degrees: the window hardly matters there) AND 45 WINS", G.WINDOWS.every((d) => Math.abs(sc[d] - rd.scores[d]) < 1e-12) && near(sc[10], 0.237) && near(sc[20], 0.224) && near(sc[45], 0.259) && near(sc[60], 0.254) && rd.winner === 45 && G.pick(sc) === 45);
    const h45 = G.TRAIN_FIGHTS.flatMap((f) => k("held", f, 45)), h20 = G.TRAIN_FIGHTS.flatMap((f) => k("held", f, 20)), hg = h45.map((v, i) => v - h20[i]).reduce((x, y) => x + y, 0) / h45.length;
    ok("!! HELD OUT, 45 LESS 20 IS +0.009 (z 0.4, CANNOT BE TOLD) -- above 0 and no trail, so it goes on, BY A HAIR", Math.abs(hg - rd.held.mean) < 1e-12 && near(rd.held.mean, 0.009) && G.holds(rd.held));
    ok("!! THE AUDIT, READ ONCE -- IT SHIPS, BY ONE FIGHT: 45 less 20 is +0.020 and +0.026 with escorts (CANNOT BE TOLD), -0.001 with the cannon and no escorts (CANNOT BE TOLD), and +0.052 (z 2.5, LEADS) with neither; it trails nowhere. A SMALL GAIN: what the window search found is that the window barely matters", near(rd.audit.escorts.gain.mean, 0.020) && near(rd.audit.escortsCannon.gain.mean, 0.026) && near(rd.audit.fleetCannon.gain.mean, -0.001) && near(rd.audit.fleetNoCannon.gain.mean, 0.052) && rd.audit.fleetNoCannon.gain.z >= 2 && G.AUDIT_FIGHTS.every((g) => rd.audit[g].gain.z > -2) && rd.verdict.ok
        && G.AUDIT_FIGHTS.every((g) => { const a = k("audit", g, 45), b = k("audit", g, 20); return Math.abs(a.map((v, i) => v - b[i]).reduce((x, y) => x + y, 0) / 300 - rd.audit[g].gain.mean) < 1e-12; }));
    ok("!! and the file: a seatFlyWired10 brain at [-3, -3, 0.1, 0.2, 45 degrees], the page's `flywired` hand", PB.importBrain(PB.describePolicy(FT.POLICY_ID10, FT.nearTunable), blob).ok && Math.abs(blob.weights[4] - Math.PI / 4) < 1e-6 && blob.policy === "seatFlyWired10");
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredGunnerTune.mjs held by its gate (it found these 3 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredGunnerTune.mjs");
    const NAMED = ["ESCORTS", "FLEET_SHIPS", "weightsOf"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
