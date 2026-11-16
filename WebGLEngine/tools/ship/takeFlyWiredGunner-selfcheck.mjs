// WebGLEngine/tools/ship/takeFlyWiredGunner-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunner-selfcheck.mjs      (a few seconds; the study here is flown by a stand-in; section 4 reads the kept flights once they exist)
//
// THE FLY-WIRED GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunner.mjs flies five wirings at four gains, chooses each wiring's gain on the train pairs and the fly's orientation on the held-out pairs, and reads six registered things on the audit pairs, once. Four things hold it:
//
//   1  WHAT WAS REGISTERED   the three pair sets (51001-, 52001-, 53001-), disjoint from each other and from every other search's and study's; the five wirings; the four gains; a job is the same gain on both axes, NO CANNON on either side, against the hand gunner; the race car's rule is a job of its own policy
//   2  THE STUDY             against a stand-in with a known best gain for each wiring: 20 train arms, each wiring's own gain on the held-out and audit pairs, the car once on the audit pairs; THE ORIENTATION is the better of the two on the HELD-OUT pairs (medial on a tie); K1-K6 are the differences they are said to be
//   3  THE FILE AND THE COMMAND  the blob is a seatFlyWired brain of fly:medial's gain twice whose `by` says nothing was learned, the trigger is the sight's, what the places are worth, and that a shuffle is a weak control; the command's refusals
//   4  WHAT WAS FOUND        once the study has been flown: its kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: @@LOG@@
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunner.mjs";
import * as FH from "./takeFlyWiredHelm.mjs";
import * as HT from "./trainHelmSteer.mjs";
import * as TT from "./trainTrackSeat.mjs";
import * as BIG from "./trainTurretSeatBig.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunner.mjs", import.meta.url)), SH = "shuffled:4242";
// THE STAND-IN: medial is worth 1.0 at its best gain (-3), lateral 0.95 (-3), flat 1.1 (-3), the shuffled 0.4 (-1), the sine 1.0 (-8), the car 0.9; a gain off its best costs (gain - best)^2 / 50. `swap` makes lateral the better (1.05). A pair shows a worth times a factor of its own.
const BEST = { "fly:medial": [1.0, -3], "fly:lateral": [0.95, -3], flat: [1.1, -3], [SH]: [0.4, -1], sine: [1.0, -8] }, factor = (i) => 0.5 + (i % 11) / 10;
const standIn = (calls, swap = false) => async (w, g, set) => { calls.push({ w, g, set }); const v = w === "car" ? 0.9 : (w === "fly:lateral" && swap ? 1.05 : BEST[w][0]) - (g - BEST[w][1]) ** 2 / 50; return G.SETS[set].map((_, i) => v * factor(i)); };

console.log("takeFlyWiredGunner-selfcheck -- the fly-wired gunner's study\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = [...G.TRAIN_PAIRS, ...G.HELD_OUT_PAIRS, ...G.AUDIT_PAIRS].map((p) => p.seed), others = [...Object.values(BIG.ROUNDS).flatMap((r) => [...r.train, ...r.heldOut, ...r.audit]), ...TA.PAIRS, ...TA.REPLICATION_PAIRS, ...Object.values(HT.CIRCUITS).flatMap((c) => [...c.train, ...c.heldOut, ...c.audit]), ...TT.TRAIN_PAIRS, ...TT.HELD_OUT_PAIRS, ...TT.AUDIT_PAIRS, ...Object.values(FH.STUDIES).flatMap((s) => Object.values(s.sets).flat())].map((p) => p.seed);
    ok("!! 300 train pairs (seeds 51001-51075 of each kind), 300 held-out (52001-52075), 600 audit (53001-53150): no seed in two sets, none a seed any search or study in the tree flew, none the scratch seeds (90001-)", G.TRAIN_PAIRS.length === 300 && G.HELD_OUT_PAIRS.length === 300 && G.AUDIT_PAIRS.length === 600 && G.TRAIN_PAIRS[0].seed === 51001 && G.HELD_OUT_PAIRS[0].seed === 52001 && G.AUDIT_PAIRS[0].seed === 53001 && new Set(mine).size === 300 && Math.max(...mine) === 53150 && others.every((s) => !mine.includes(s)));
    ok("five wirings (the two orientations, flat, the shuffled control of seed 4242, the sine), four gains (three that lay toward the target and one that lays away), and the choosing is the helm study's own function", G.WIRINGS.join() === "fly:medial,fly:lateral,flat,shuffled:4242,sine" && G.GAINS.join() === "-8,-3,-1,2" && G.WIRINGS.every((w) => typeof FT.wiringOf(w).gunnerFactory === "function") && G.choose === FH.choose);
    const j = G.jobsOf("flat", -3, [G.TRAIN_PAIRS[0], G.TRAIN_PAIRS[80]]), car = G.jobsOf(G.CAR, null, [G.AUDIT_PAIRS[0]])[0];
    ok("!! a job: side X the seatFlyWired gunner over the NAMED wiring with THE SAME GAIN ON BOTH AXES, side Y the hand gunner with no network, NO CANNON ON EITHER SIDE, the pair's kind and seed; the race car's rule is a job of ITS policy with its own hand weights", j[0].x.network.policy === "seatFlyWired" && j[0].x.network.wiring === "flat" && j[0].x.network.weights.join() === "-3,-3" && j[0].x.cannon === false && j[0].y.cannon === false && j[0].y.id === "hand" && !j[0].y.network && j[1].kind === G.TRAIN_PAIRS[80].kind && j[1].seed === G.TRAIN_PAIRS[80].seed && car.x.network.policy === "gunnerPolicy" && car.x.network.weights.join() === Array.from(ST.handWeights()).join() && !("wiring" in car.x.network) && car.x.cannon === false && car.y.cannon === false);
});

console.log("2. THE STUDY (flown by a stand-in whose best gains are known)");
let res = null;
await section(async () => {
    const calls = []; res = await G.study(standIn(calls), () => {});
    const tr = calls.filter((c) => c.set === "train"), ho = calls.filter((c) => c.set === "heldOut"), au = calls.filter((c) => c.set === "audit"), mf = G.AUDIT_PAIRS.reduce((a, _, i) => a + factor(i), 0) / 600, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! EACH WIRING GETS ITS OWN BEST GAIN from all four on the train pairs (20 arms, each once: -3, -3, -3, -1 and -8), flies ONLY that gain on the held-out and the audit pairs, the car flies once, on the audit pairs only, and train comes before held-out before audit", ["fly:medial", "fly:lateral", "flat"].every((w) => res.chosen[w].gain === -3) && res.chosen[SH].gain === -1 && res.chosen.sine.gain === -8 && tr.length === 20 && G.WIRINGS.every((w) => G.GAINS.every((g) => tr.filter((c) => c.w === w && c.g === g).length === 1)) && ho.length === 5 && au.length === 6 && au.filter((c) => c.w === "car" && c.g === null).length === 1 && !tr.some((c) => c.w === "car") && !ho.some((c) => c.w === "car") && [ho, au.filter((c) => c.w !== "car")].every((l) => l.every((c) => c.g === res.chosen[c.w].gain)) && calls.findIndex((c) => c.set === "heldOut") === 20 && calls.findIndex((c) => c.set === "audit") === 25);
    ok("!! THE READINGS ARE WHAT THEY ARE SAID TO BE, on the 600 audit pairs: K1 medial against the hand gunner (1.00), K2 lateral (0.95); the fly's orientation is MEDIAL (the better on the held-out pairs) and K3 is it less flat (1.00 - 1.10: the places TRAIL), K4 less the shuffled (1.00 - 0.40), K5 less the sine (0), K6 less the car (1.00 - 0.90)", res.orientation === "fly:medial" && close(res.reading.K1, 1.0) && close(res.reading.K2, 0.95) && close(res.reading.K3, -0.1) && close(res.reading.K4, 0.6) && close(res.reading.K5, 0) && close(res.reading.K6, 0.1) && close(res.reading.flat, 1.1) && close(res.reading.car, 0.9) && res.words.K3 === "TRAILS" && res.words.K4 === "LEADS" && res.words.K5 === "CANNOT BE TOLD" && res.reading.K1.n === 600);
    const sw = await G.study(standIn([], true), () => {});
    ok("!! THE ORIENTATION IS CHOSEN ON THE HELD-OUT PAIRS: where lateral is the better there (1.05) the fly's is LATERAL and K3-K6 are read from it (K3 1.05 - 1.10), while K1 and K2 stay each orientation's own; on a tie it is medial", sw.orientation === "fly:lateral" && Math.abs(sw.reading.K3.mean - (-0.05) * mf) < 1e-9 && Math.abs(sw.reading.K1.mean - 1.0 * mf) < 1e-9 && Math.abs(sw.reading.K2.mean - 1.05 * mf) < 1e-9 && G.orientationOf({ mean: 1 }, { mean: 1 }) === "fly:medial" && G.orientationOf({ mean: 1 }, { mean: 1.01 }) === "fly:lateral" && G.orientationOf({ mean: 1.01 }, { mean: 1 }) === "fly:medial");
    const q = (z) => G.qualifies({ K1: { z }, K2: { z: 99 }, K3: { z: 99 } });
    ok("!! WHAT SHIPS: fly:medial if K1 LEADS the hand gunner, z >= 2 -- at 2 yes, at 1.99 no; K2 and K3 are not the rule for shipping", q(2).ok && !q(1.99).ok && /fly:medial` against the hand gunner reads CANNOT BE TOLD \(z 1\.99\)/.test(q(1.99).reasons[0]) && res.verdict.ok);
});

console.log("3. THE FILE AND THE COMMAND");
await section(() => {
    const blob = G.blobOf(res), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID, FT), blob), seat = D.sideFromBrains("s", [blob]);
    ok("!! the blob is a seatFlyWired brain of TWO weights, fly:medial's gain twice, that battleshipDuel seats in the seats", back.ok && Array.from(back.weights).join() === "-3,-3" && seat.refused.length === 0 && D.seatNetOf(seat.side, "main-a").module === FT && Math.abs(blob.score - res.reading.K1.mean) < 5e-4);
    ok("!! its `by` says all of it: NOTHING INSIDE THE CIRCUIT IS LEARNED, THE TRIGGER IS THE SIGHT'S OWN RULE, the gain and the four it was the best of, no cannon, K1 and K2, WHAT THE CELLS' PLACES ARE WORTH against flat, the shuffled circuit and that it is a weak control, the sine, the car's rule, one fight only, and that sigma, the overlap and the constant drive were chosen by hand", /NOTHING INSIDE THE CIRCUIT IS LEARNED/.test(blob.by) && /THE TRIGGER IS THE SIGHT'S OWN RULE/.test(blob.by) && /-3, the best of 4 \(-8, -3, -1, 2\) on 300 train pairs/.test(blob.by) && /fights with NO CANNON on either side/.test(blob.by) && /600 audit pairs \(seeds 53001-53150 of each kind\), read once: against the hand gunner \+/.test(blob.by) && /the other orientation \(fly:lateral, gain -3\)/.test(blob.by) && /WHAT THE CELLS' PLACES ARE WORTH -- the fly's \(fly:medial, the better on the held-out pairs\) less the same circuit with no places \(flat, gain -3;/.test(blob.by) && /a weak control: this circuit is 275 cells onto two onto two/.test(blob.by) && /less the sine's \(gain -8;/.test(blob.by) && /less the race car's untrained hand rule/.test(blob.by) && /one fight only; the circuit's sigma, overlap and constant drive were chosen by hand/.test(blob.by));
    ok("an arm's kept file is named for its wiring, its gain and its set; the car's has no gain", G.keptName("fly:medial", -3, "train") === "fly-medial_g-3_train.json" && G.keptName(SH, -1, "audit") === "shuffled-4242_g-1_audit.json" && G.keptName(G.CAR, null, "audit") === "car_gnone_audit.json");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flygun-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "3"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know, and A SECOND READ OF THE AUDIT before it flies anything: no kept flight is written", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /THE AUDIT HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("4. WHAT WAS FOUND");
await section(() => {
    const rf = G.DEFAULT_OUT.replace(/\.json$/, ".reading.json");
    if (!fs.existsSync(rf)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    /*@@FOUND@@*/
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
