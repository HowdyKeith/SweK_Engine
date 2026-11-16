// WebGLEngine/tools/ship/takeFlyWiredHelm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelm-selfcheck.mjs      (a few seconds; the study here is flown by a stand-in, two real pairs at the end; section 5 reads the kept flights once they exist)
//
// THE FLY-WIRED HELM'S STUDY, HELD. tools/ship/takeFlyWiredHelm.mjs flies three wirings at eight gains, chooses each wiring's gain on the train pairs and reads three registered things on the audit pairs, once. Five things hold it:
//
//   1  WHAT WAS REGISTERED   the three pair sets (41001-, 42001-, 43001-), disjoint from each other and from every search's; the three wirings; the eight gains, both signs; a job is the same gain on both axes against the rule alone
//   2  THE CHOICE            a wiring's gain is its best mean train lead; a tie goes to the smaller magnitude and then to the negative
//   3  THE STUDY             against a stand-in with a known best gain for each wiring: each wiring's eight gains on the train pairs, ITS chosen gain only on the held-out and the audit pairs, the audit once a wiring; F1, F2, F3 are the differences they are said to be; what qualifies
//   4  THE FILE              the blob is a helmFlyWired brain of the chosen gain twice, and its `by` says nothing inside was learned, every reading, the thrust the rule's, where the threshold came from
//   5  REAL PAIRS, THE COMMAND, AND WHAT WAS FOUND   a real job flies; the command's refusals; and, once the study has been flown, its kept reading
//
// SABOTAGE LOG: 22 mutants of tools/ship/takeFlyWiredHelm.mjs, each a copy of the study with this gate (and the command rows) pointed at it: 22 red by name the first time -- the train pairs another search's, the audit pairs the held-out ones, gains of one sign, a gain on one axis, the wiring dropped from a job, the worst gain chosen, a tie to the larger or to the positive, F2 read against the sine, F3's sign, a weaker verdict or one read from F2, every wiring flown at the fly's gain, the held-out pairs the train ones, the gain chosen on the audit pairs, a blob of one gain or of the sine's, the `by` without `nothing is learned` or without the threshold's origin, a second read allowed, an unknown option taken, a kept file's name without its gain.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as F from "./takeFlyWiredHelm.mjs";
import * as HT from "./trainHelmSteer.mjs";
import * as TT from "./trainTrackSeat.mjs";
import * as BIG from "./trainTurretSeatBig.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import { leadOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredHelm.mjs", import.meta.url)), SH = "shuffled:4242";
// THE STAND-IN: the fly's helm is worth 0.3 - (gain + 0.5)^2 (best at -0.5: 0.3), the sine's 0.4 - (gain + 1)^2 (best at -1: 0.4), the shuffled one's 0.01 x gain (best at 2: 0.02). A pair shows a worth times a factor of its own (0.5 to 1.5).
const worth = (w, g) => (w === "fly" ? 0.3 - (g + 0.5) ** 2 : w === "sine" ? 0.4 - (g + 1) ** 2 : 0.01 * g), factor = (i) => 0.5 + (i % 11) / 10;
const standIn = (calls) => async (w, g, set) => { calls.push({ w, g, set }); return F.SETS[set].map((_, i) => worth(w, g) * factor(i)); };

console.log("takeFlyWiredHelm-selfcheck -- the fly-wired helm's study\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = [...F.TRAIN_PAIRS, ...F.HELD_OUT_PAIRS, ...F.AUDIT_PAIRS].map((p) => p.seed), others = [...Object.values(BIG.ROUNDS).flatMap((r) => [...r.train, ...r.heldOut, ...r.audit]), ...TA.PAIRS, ...TA.REPLICATION_PAIRS, ...Object.values(HT.CIRCUITS).flatMap((c) => [...c.train, ...c.heldOut, ...c.audit]), ...TT.TRAIN_PAIRS, ...TT.HELD_OUT_PAIRS, ...TT.AUDIT_PAIRS].map((p) => p.seed);
    ok("!! 300 train pairs (seeds 41001-41075 of each kind), 300 held-out (42001-42075), 600 audit (43001-43150): no seed in two sets, and none a seed any search or audit in the tree flew", F.TRAIN_PAIRS.length === 300 && F.HELD_OUT_PAIRS.length === 300 && F.AUDIT_PAIRS.length === 600 && F.TRAIN_PAIRS[0].seed === 41001 && F.HELD_OUT_PAIRS[0].seed === 42001 && F.AUDIT_PAIRS[0].seed === 43001 && new Set(mine).size === 300 && Math.max(...mine) === 43150 && others.every((s) => !mine.includes(s)) && F.SETS.train === F.TRAIN_PAIRS && F.SETS.audit === F.AUDIT_PAIRS);
    ok("three wirings (the fly's, the shuffled control of seed 4242, the sine) and eight gains, four of each sign, from a quarter to two", F.WIRINGS.join() === "fly,shuffled:4242,sine" && F.GAINS.join() === "-2,-1,-0.5,-0.25,0.25,0.5,1,2" && F.WIRINGS.every((w) => typeof FS.wiringOf(w).helmFor === "function"));
    const j = F.jobsOf("fly", -0.5, [F.TRAIN_PAIRS[0], F.TRAIN_PAIRS[80]]), js = F.jobsOf(SH, 2, [F.TRAIN_PAIRS[0]])[0];
    ok("!! a job is plain data: side X the helmFlyWired helm with THE SAME GAIN ON BOTH AXES (and its wiring when it is not the fly's), side Y the rule alone, the pair's kind and seed", j[0].x.helmNet.policy === "helmFlyWired" && j[0].x.helmNet.weights.join() === "-0.5,-0.5" && !("wiring" in j[0].x.helmNet) && j[0].y.id === "rule" && !j[0].y.helmNet && j[1].kind === F.TRAIN_PAIRS[80].kind && j[1].seed === F.TRAIN_PAIRS[80].seed && js.x.helmNet.wiring === SH && js.x.helmNet.weights.join() === "2,2");
});

console.log("2. THE CHOICE");
await section(() => {
    const c = F.choose({ "-1": [0.1, 0.3], "0.5": [0.5, 0.7], "2": [-1, 0] });
    ok("a wiring's gain is the one with the highest MEAN train lead, and the rows keep every gain's statistic, best first", c.gain === 0.5 && Math.abs(c.train.mean - 0.6) < 1e-12 && c.rows.map((r) => r.gain).join() === "0.5,-1,2" && c.rows[2].stat.mean === -0.5);
    ok("!! a tie goes to the SMALLER magnitude (the weaker correction), and between a gain and its negative to the negative; no gains at all is refused", F.choose({ "2": [1, 1], "-0.25": [1, 1], "1": [1, 1] }).gain === -0.25 && F.choose({ "0.5": [1, 1], "-0.5": [1, 1] }).gain === -0.5 && F.choose({ "-0.5": [1, 1], "0.5": [1, 1] }).gain === -0.5 && (() => { try { F.choose({}); return false; } catch (e) { return /no gains to choose from/.test(e.message); } })());
});

console.log("3. THE STUDY (flown by a stand-in whose best gains are known)");
let res = null;
await section(async () => {
    const calls = [], lines = []; res = await F.study(standIn(calls), (m) => lines.push(m));
    const tr = calls.filter((c) => c.set === "train"), ho = calls.filter((c) => c.set === "heldOut"), au = calls.filter((c) => c.set === "audit"), mf = F.AUDIT_PAIRS.reduce((a, _, i) => a + factor(i), 0) / 600, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! EACH WIRING GETS ITS OWN BEST GAIN: the fly's -0.5, the sine's -1, the shuffled one's 2 -- from all eight gains of each on the train pairs (24 arms, every one flown once)", res.chosen.fly.gain === -0.5 && res.chosen.sine.gain === -1 && res.chosen[SH].gain === 2 && tr.length === 24 && F.WIRINGS.every((w) => F.GAINS.every((g) => tr.filter((c) => c.w === w && c.g === g).length === 1)));
    ok("!! ONLY THE CHOSEN GAIN OF EACH WIRING IS FLOWN ON THE HELD-OUT AND THE AUDIT PAIRS, ONCE EACH, and every train arm comes before any held-out pair and every held-out before any audit pair", ho.length === 3 && au.length === 3 && [ho, au].every((l) => l.map((c) => `${c.w}@${c.g}`).sort().join() === ["fly@-0.5", "shuffled:4242@2", "sine@-1"].sort().join()) && calls.findIndex((c) => c.set === "heldOut") === 24 && calls.findIndex((c) => c.set === "audit") === 27 && res.chosen.fly.heldOut.n === 300);
    ok("!! THE READINGS ARE THE PAIRED DIFFERENCES THEY ARE SAID TO BE, on the 600 audit pairs: F1 the fly's helm (0.30); F2 less the shuffled one's (0.30 - 0.02); F3 less the sine's (0.30 - 0.40, so it TRAILS); beside them the shuffled (0.02) and the sine (0.40)", close(res.reading.F1, 0.3) && close(res.reading.F2, 0.28) && close(res.reading.F3, -0.1) && close(res.reading.shuffled, 0.02) && close(res.reading.sine, 0.4) && res.reading.F1.n === 600 && res.words.F1 === "LEADS" && res.words.F2 === "LEADS" && res.words.F3 === "TRAILS" && lines.some((m) => /F2 THE FLY'S HELM LESS THE SHUFFLED ONE'S/.test(m)));
    const r2 = F.readings({ fly: [1, 2, 3], shuffled: [1, 1, 1], sine: [3, 2, 1] });
    ok("readings() alone: fly less shuffled and fly less sine pair by pair (means 1 and 0), each wiring's own mean beside them", r2.reading.F2.mean === 1 && r2.reading.F3.mean === 0 && r2.reading.F1.mean === 2 && r2.reading.shuffled.mean === 1 && r2.reading.sine.mean === 2 && r2.words.F3 === "CANNOT BE TOLD");
    const q = (z) => F.qualifies({ F1: { z }, F2: { z: 99 }, F3: { z: 99 } });
    ok("!! WHAT SHIPS: the fly's helm if F1 LEADS the rule, z >= 2 -- at 2 yes, at 1.99 no (CANNOT BE TOLD), at -3 no (TRAILS); whether the wiring did it is F2 and is not the rule for shipping", q(2).ok && !q(1.99).ok && /CANNOT BE TOLD \(z 1\.99\)/.test(q(1.99).reasons[0]) && /TRAILS/.test(q(-3).reasons[0]) && res.verdict.ok && !F.qualifies({ F1: { z: 0 }, F2: { z: 99 }, F3: { z: 99 } }).ok);
});

console.log("4. THE FILE");
await section(() => {
    const blob = F.blobOf(res), back = PB.importBrain(PB.describePolicy(FS.POLICY_ID, FS), blob), seat = D.sideFromBrains("s", [blob]);
    ok("!! the blob is a helmFlyWired brain of TWO weights, the fly's chosen gain twice, that battleshipDuel seats at the helm", back.ok && Array.from(back.weights).join() === "-0.5,-0.5" && seat.refused.length === 0 && seat.side.helmNet.module === FS && Math.abs(blob.score - res.reading.F1.mean) < 5e-4);
    ok("!! its `by` says all of it: NOTHING INSIDE THE CIRCUIT IS LEARNED, the gain and the eight it was the best of, train and held-out, the audit readings each with its word -- THE WIRING reading against the shuffled circuit at its own best gain, and the sine -- the thrust the rule's, one fight only, and that the threshold was chosen on the tuning curve", /NOTHING INSIDE THE CIRCUIT IS LEARNED/.test(blob.by) && /the helm's gain about its two axes, -0\.5, the best of 8 \(-2, -1, -0\.5, -0\.25, 0\.25, 0\.5, 1, 2\) on 300 train pairs/.test(blob.by) && /held-out \+/.test(blob.by) && /600 audit pairs \(seeds 43001-43150 of each kind\), read once: against the rule \+0\.\d{3} .*LEADS/.test(blob.by) && /THE WIRING -- this less the same helm over the circuit with each pathway's targets shuffled \(shuffled:4242, at its own best gain 2;/.test(blob.by) && /an ideal comparator of the same amplitude \(the sine, at its own best gain -1;/.test(blob.by) && /TRAILS; the thrust is the rule's; one fight only/.test(blob.by) && /the circuit's threshold \(0\.2\) was chosen on its tuning curve, not in a fight/.test(blob.by));
    ok("an arm's kept file is named for its wiring, its gain and its set", F.keptName("fly", -0.5, "train") === "fly_g-0.5_train.json" && F.keptName(SH, 2, "audit") === "shuffled4242_g2_audit.json");
});

console.log("5. REAL PAIRS, THE COMMAND, AND WHAT WAS FOUND");
await section(async () => {
    const [a, b] = [F.jobsOf("fly", -1, [F.TRAIN_PAIRS[0]])[0], F.jobsOf(SH, -1, [F.TRAIN_PAIRS[0]])[0]].map(leadOf);
    ok("!! a real job flies: the fly's helm and the shuffled one's at the same gain are two different fights of the same pair, and neither is a draw with the rule", a !== b && a !== 0 && b !== 0, `leads ${a.toFixed(3)}, ${b.toFixed(3)}`);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flywired-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "3"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know, and A SECOND READ OF THE AUDIT (the reading file is there) before it flies anything: no kept flight is written", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /THE AUDIT HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
    const rf = F.DEFAULT_OUT.replace(/\.json$/, ".reading.json");
    if (!fs.existsSync(rf)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    /*@@FOUND@@*/
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
