// WebGLEngine/tools/ship/takeFlyWiredNext-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredNext-selfcheck.mjs      (a few seconds; both studies are flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// TWO SMALL STUDIES, HELD. tools/ship/takeFlyWiredNext.mjs flies `together` (the fly-wired helm, the fly-wired gunner and both, with the cannon and without) and `seeds` (five more shuffled circuits against the fly-wired helm). Three things hold it:
//
//   1  WHAT WAS REGISTERED   `together`: 600 pairs (81001-), three arms, two fights, the brains the two SHIPPED files as they are; `seeds`: 300 train pairs (84001-) and 600 audit (86001-), five seeds, four gains, the fly's helm at its shipped gain; none a seed any other study or search flew
//   2  THE STUDIES           against stand-ins: `together` reads each arm, BOTH LESS THE BETTER ALONE and BOTH LESS THE SUM, in each fight apart; `seeds` gives each shuffle ITS best gain and reads the fly's less each and less the MEAN of the five; the command's refusals
//   3  WHAT WAS FOUND        once flown: each kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredNext.mjs, each a copy of the tool with this gate (and the command rows) pointed at it. 17 red the first time (two of them by a section that THREW: the arm `both` without its gunner, the arm `helm` without its helm). ONE 0-RED, A GAP, CLOSED: a shipped file taken without checking it is a brain for its policy (a row now puts the gunner's file where the helm's should be). After it: 18 of 18. Red by name: either study's pairs another's, the plain ship keeping its cannon, the no-cannon fight with one, a tie going to the gunner, both read against the helm whichever is better, the sum of one part, a gain on one axis, the shuffles' mean the first shuffle, a difference's sign, every shuffle at the fly's gain, the gain chosen on the audit pairs, a shuffle not read the odd way, a second read, --write taken.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as N from "./takeFlyWiredNext.mjs";
import * as G from "./takeFlyWiredGunner.mjs";
import * as PC from "./takePlacesControl.mjs";
import * as FH from "./takeFlyWiredHelm.mjs";
import * as HT from "./trainHelmSteer.mjs";
import * as TT from "./trainTrackSeat.mjs";
import * as FS from "../../brain/flySteering.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredNext.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredNext-selfcheck -- both fly-wired parts in one ship, and more shuffle seeds for the helm\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const others = [...G.TRAIN_PAIRS, ...G.HELD_OUT_PAIRS, ...G.AUDIT_PAIRS, ...Object.values(PC.STUDIES).flatMap((s) => Object.values(s.sets).flat()), ...Object.values(FH.STUDIES).flatMap((s) => Object.values(s.sets).flat()), ...Object.values(HT.CIRCUITS).flatMap((c) => [...c.train, ...c.heldOut, ...c.audit]), ...TT.TRAIN_PAIRS, ...TT.HELD_OUT_PAIRS, ...TT.AUDIT_PAIRS].map((p) => p.seed);
    const tg = N.TOGETHER.pairs.map((p) => p.seed), sd = [...N.SEEDS.train, ...N.SEEDS.audit].map((p) => p.seed);
    ok("!! `together`: 600 pairs (seeds 81001-81150 of each kind), three arms, two fights; `seeds`: 300 train pairs (84001-84075) and 600 audit (86001-86150), seeds 1-5, four gains of both signs; no seed shared between the two or with any other study or search", N.TOGETHER.pairs.length === 600 && tg[0] === 81001 && Math.max(...tg) === 81150 && N.TOGETHER.arms.join() === "helm,gunner,both" && N.TOGETHER.fights.join() === "cannon,nocannon" && N.SEEDS.train.length === 300 && N.SEEDS.audit.length === 600 && N.SEEDS.train[0].seed === 84001 && N.SEEDS.audit[0].seed === 86001 && N.SEEDS.seeds.join() === "1,2,3,4,5" && N.SEEDS.gains.join() === "-2,-0.5,0.5,2" && N.SEEDS.fly === "fly2~odd" && [...tg, ...sd].every((x) => !others.includes(x)) && tg.every((x) => !sd.includes(x)) && new Set(N.SEEDS.train.map((p) => p.seed)).size === 75);
    const w = N.shipped(), both = N.togetherJobs("both", "nocannon", w, [N.TOGETHER.pairs[0]])[0], helm = N.togetherJobs("helm", "cannon", w, [N.TOGETHER.pairs[200]])[0], gun = N.togetherJobs("gunner", "cannon", w, [N.TOGETHER.pairs[0]])[0];
    ok("!! THE BRAINS ARE THE TWO SHIPPED FILES AS THEY ARE (the helm's two gains of -2, the gunner's two of -3): `both` seats the helm AND the gunner on side X, `helm` only the helm, `gunner` only the gunner; side Y is the plain ship; the cannon is on BOTH sides or on NEITHER", w.helm.join() === "-2,-2" && w.gunner.join() === "-3,-3" && both.x.helmNet.policy === "helmFlyWired2" && both.x.network.policy === "seatFlyWired" && both.x.cannon === false && both.y.cannon === false && !both.y.helmNet && !both.y.network && helm.x.helmNet.weights.join() === "-2,-2" && !helm.x.network && helm.x.cannon === true && helm.y.cannon === true && helm.kind === N.TOGETHER.pairs[200].kind && gun.x.network.weights.join() === "-3,-3" && !gun.x.helmNet);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flynext-shipped-")), B = fileURLToPath(new URL("../../brain/", import.meta.url)); fs.copyFileSync(path.join(B, "seatFlyWiredWeightsDefault.json"), path.join(tmp, "seatFlyWiredWeightsDefault.json")); fs.copyFileSync(path.join(B, "seatFlyWiredWeightsDefault.json"), path.join(tmp, "helmFlyWired2WeightsDefault.json"));
    ok("a shipped file that is not a brain for its policy is REFUSED by name (the gunner's file put where the helm's should be)", (() => { try { N.shipped(tmp); return false; } catch (e) { return /helmFlyWired2WeightsDefault\.json is refused: /.test(e.message); } })()); fs.rmSync(tmp, { recursive: true, force: true });
    const j = N.seedJobs(N.shuffleName(3), -0.5, [N.SEEDS.train[0]])[0];
    ok("a `seeds` job is a helmFlyWired helm over the named shuffle, read the odd way as study 2's was, the same gain on both axes, against the rule", N.shuffleName(3) === "shuffled2:3~odd" && j.x.helmNet.policy === "helmFlyWired" && j.x.helmNet.wiring === "shuffled2:3~odd" && j.x.helmNet.weights.join() === "-0.5,-0.5" && j.y.id === "rule" && typeof FS.wiringOf(N.shuffleName(3)).helmFor === "function" && FS.wiringOf(N.shuffleName(3)) !== FS.wiringOf(N.shuffleName(4)));
});

console.log("2. THE STUDIES (flown by stand-ins)");
await section(async () => {
    const W = { cannon: { helm: 1.0, gunner: 0.1, both: 1.05 }, nocannon: { helm: 0.2, gunner: 0.7, both: 1.0 } }, calls = [], t = await N.together(async (arm, fight) => { calls.push(arm + "/" + fight); return N.TOGETHER.pairs.map((_, i) => W[fight][arm] * factor(i)); }, () => {}), mf = N.TOGETHER.pairs.reduce((a, _, i) => a + factor(i), 0) / 600, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! `together` flies its six arms once each and reads EACH FIGHT APART: with the cannon the better alone is the HELM (1.00) and both less it is 0.05, both less the SUM is 1.05 - 1.10; without it the better is the GUNNER (0.70), both less it 0.30, both less the sum 1.00 - 0.90", calls.length === 6 && new Set(calls).size === 6 && t.cannon.better === "helm" && close(t.cannon.reading.overBetter, 0.05) && close(t.cannon.reading.overSum, -0.05) && t.nocannon.better === "gunner" && close(t.nocannon.reading.overBetter, 0.3) && close(t.nocannon.reading.overSum, 0.1) && close(t.nocannon.reading.helm, 0.2) && close(t.cannon.reading.both, 1.05) && t.cannon.reading.both.n === 600);
    const r = N.togetherReadings({ helm: [1, 2, 3], gunner: [2, 2, 2], both: [4, 3, 6] });
    ok("togetherReadings() alone: on a tie in the means the better alone is the helm; both less it pair by pair ([3, 1, 3]); both less the sum ([1, -1, 1])", r.better === "helm" && Math.abs(r.reading.overBetter.mean - 7 / 3) < 1e-12 && Math.abs(r.reading.overSum.mean - 1 / 3) < 1e-12);
    const sc = [], worth = (wr, g) => (wr === "fly2~odd" ? 1.0 : wr === "shuffled2:2~odd" ? 0.3 - (g - 2) ** 2 / 40 : -0.02 * Math.abs(g)), s = await N.seeds(async (wr, g, set) => { sc.push({ wr, g, set }); return N.SEEDS[set].map((_, i) => worth(wr, g) * factor(i)); }, -2, () => {});
    const ms = N.SEEDS.audit.reduce((a, _, i) => a + factor(i), 0) / 600, cl = (x, v) => Math.abs(x.mean - v * ms) < 1e-9;
    ok("!! `seeds` gives EACH shuffle its best of the four gains on the train pairs (20 arms; here the weakest toward gain for four of them and +2 for seed 2), flies the fly's helm at the SHIPPED gain and each shuffle at ITS gain on the audit pairs (six arms), and never flies the fly's helm on the train pairs", sc.filter((c) => c.set === "train").length === 20 && sc.filter((c) => c.set === "audit").length === 6 && !sc.some((c) => c.set === "train" && c.wr === "fly2~odd") && sc.find((c) => c.set === "audit" && c.wr === "fly2~odd").g === -2 && [1, 3, 4, 5].every((k) => s.chosen[k].gain === -0.5) && s.chosen[2].gain === 2 && sc.filter((c) => c.set === "audit" && c.wr !== "fly2~odd").every((c) => c.g === s.chosen[Number(/shuffled2:(\d)/.exec(c.wr)[1])].gain) && s.flyGain === -2);
    ok("!! and reads THE FLY'S LESS EACH SHUFFLE and LESS THE MEAN OF THE FIVE, pair by pair: against seed 2 (worth 0.30) 0.70, against the others (-0.01) 1.01, against the mean (0.052) 0.948", cl(s.reading.over2, 0.7) && cl(s.reading.over1, 1.01) && cl(s.reading.overMean, 1 - (0.3 - 0.04) / 5) && cl(s.reading.shuffledMean, (0.3 - 0.04) / 5) && cl(s.reading.fly, 1.0) && s.words.overMean === "LEADS" && s.reading.overMean.n === 600);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flynext-")), out = path.join(tmp, "r.json"); fs.writeFileSync(out, "{}");
    const none = run(), bad = run("seeds", "--write"), again = run("together", "--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES a first word that is not a study, an option it does not know (it ships nothing: no --write), and A SECOND READ before it flies anything", none.status === 2 && /the first argument is together or seeds/.test(none.stderr) && bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(N.TOGETHER.reading)) console.log("  ----  `together` has not been flown here yet: no kept reading to pin");
    else {
        const rd = JSON.parse(fs.readFileSync(N.TOGETHER.reading, "utf8")), k = (arm, fight) => JSON.parse(fs.readFileSync(path.join(N.TOGETHER.kept, `${arm}_${fight}.json`), "utf8")).leads, re = Object.fromEntries(N.TOGETHER.fights.map((f) => [f, N.togetherReadings({ helm: k("helm", f), gunner: k("gunner", f), both: k("both", f) })])), near = (s, v) => Math.abs(s.mean - v) < 5e-4, C = rd.cannon, X = rd.nocannon;
        ok("!! `together`, AS KEPT AND RE-DERIVED -- WITH THE CANNON THE TWO PARTS ADD: the helm alone leads the plain ship by 0.945, the gunner alone by 0.141, both by 1.127; both less the helm is +0.182 (z 5.1: the gunner ADDS, against the forecast) and both less the sum of the two cannot be told from 0 (+0.041)", near(C.reading.helm, 0.945) && near(C.reading.gunner, 0.141) && near(C.reading.both, 1.127) && C.better === "helm" && near(C.reading.overBetter, 0.182) && C.words.overBetter === "LEADS" && near(C.reading.overSum, 0.041) && C.words.overSum === "CANNOT BE TOLD" && ["helm", "gunner", "both", "overBetter", "overSum"].every((q) => Math.abs(re.cannon.reading[q].mean - C.reading[q].mean) < 1e-12 && Math.abs(re.nocannon.reading[q].mean - X.reading[q].mean) < 1e-12) && fs.readdirSync(N.TOGETHER.kept).length === 6);
        ok("!! WITHOUT THE CANNON THE FLY-WIRED HELM HURTS: alone it TRAILS the plain ship by 0.692 (z -15) -- the helm that leads by 0.95 with the cannon -- the gunner alone leads by 0.790, and both together lead by only 0.224: both less the gunner alone is -0.567 (TRAILS). The helm was read in one fight and the file said so; this is the other fight", near(X.reading.helm, -0.692) && X.words.helm === "TRAILS" && near(X.reading.gunner, 0.790) && near(X.reading.both, 0.224) && X.better === "gunner" && near(X.reading.overBetter, -0.567) && X.words.overBetter === "TRAILS" && near(X.reading.overSum, 0.125));
    }
    if (!fs.existsSync(N.SEEDS.reading)) console.log("  ----  `seeds` has not been flown here yet: no kept reading to pin");
    else {
        const rd = JSON.parse(fs.readFileSync(N.SEEDS.reading, "utf8")), k = (w, g) => JSON.parse(fs.readFileSync(path.join(N.SEEDS.kept, `${w.replace(":", "").replace("~", "-")}_g${g}_audit.json`), "utf8")).leads, re = N.seedReadings({ fly: k(N.SEEDS.fly, rd.flyGain), shuffles: Object.fromEntries(N.SEEDS.seeds.map((s) => [s, k(N.shuffleName(s), rd.chosen[s].gain)])) }).reading, near = (s, v) => Math.abs(s.mean - v) < 5e-4;
        ok("!! `seeds`, AS KEPT AND RE-DERIVED -- THE FLY'S WIRING HOLDS OVER FIVE MORE SHUFFLES: the fly's helm leads the rule by 0.945 on these pairs; it leads EACH of the five shuffled circuits' helms (by 0.671 to 0.849, every z above 15) and their mean by 0.784 (z 20)", rd.flyGain === -2 && near(rd.reading.fly, 0.945) && near(rd.reading.overMean, 0.784) && rd.reading.overMean.z > 15 && N.SEEDS.seeds.every((s) => rd.words[`over${s}`] === "LEADS" && rd.reading[`over${s}`].mean > 0.67 && rd.reading[`over${s}`].mean < 0.85 && rd.reading[`over${s}`].z > 15) && Object.keys(rd.reading).every((q) => Math.abs(re[q].mean - rd.reading[q].mean) < 1e-12) && fs.readdirSync(N.SEEDS.kept).length === 26);
        ok("!! AND THE FORECAST WAS WRONG ABOUT THE SHUFFLES: each shuffled helm, at its own best gain, LEADS the rule a little (+0.096 to +0.274; their mean +0.161) -- a shuffled circuit read the odd way keeps a fifth or less of the signal, and a weak gain on a weak signal still steers. So the wiring is worth about 0.78 of the fly's 0.95, not all of it; study 2's one seed (worth 1.013, its shuffle at +0.006) was at the favourable end. Two shuffles do best with the gain's sign reversed", N.SEEDS.seeds.every((s) => rd.words[`shuffle${s}`] === "LEADS" && rd.reading[`shuffle${s}`].mean > 0.09 && rd.reading[`shuffle${s}`].mean < 0.28) && Math.abs(rd.reading.shuffledMean.mean - 0.161) < 2e-3 && N.SEEDS.seeds.filter((s) => rd.chosen[s].gain > 0).join() === "3,5" && N.SEEDS.seeds.every((s) => Math.abs(rd.chosen[s].gain) === 0.5));
    }
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
