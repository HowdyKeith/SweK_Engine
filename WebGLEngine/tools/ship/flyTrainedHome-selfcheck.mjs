// WebGLEngine/tools/ship/flyTrainedHome-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyTrainedHome-selfcheck.mjs      (about three minutes; IT NEVER RUNS THE ROUND -- its one training is of one iteration, its audits are of 2 lives but for the verdict's
// three flights of committed flies after the reading, and it starts no process)
//
// THE GATE OF THE TRAINED-TO-FIND-HOME ROUND (registered in brain/FLY_TRAINED_HOME_WIP.md before brain/rl/homeTrainEnv.mjs, brain/rl/homingTrainFly.mjs, tools/ship/flyTrainedHome.mjs and
// tools/ship/takeFlyTrainedHome.mjs existed): does a compass fly trained on the homing score find home better than the same fly trained to hold a course?
//   1  THE TASK                 the homing life unchanged, its return the life's homing score paid at its end; the homing task and wrapper not edited
//   2  THE FLY                  the homing wrapper unchanged, handing the trainer the compass fly's weights; a life through the trainer's own rollout is the homing score
//   3  THE ROUND'S NUMBERS      the draws, arms, recipe, battery, audit; the four committed files named by their hashes; each arm's fly; the floors; the registration says the same
//   4  ONE TRAINING             a training of one iteration is the trainer called by hand with the registered options; the trainer's return is the homing score on the draw's 64 lives;
//                               a record's home and course scores are lives flown here by hand; a COURSE64 record is the committed fly flown home
//   5  THE RECORDS              36 flies; G, T1, H, V
//   6  THE COMMAND              it is this round's; no training of the round's, no process
//   7  THE VERDICT              the results file as committed unread at 76d8bc95, read from the file: the checks, G, T1, H and V, the arms, the description after the reading (home follows
//                               course; draw 12's 64 lives flown again, the scoping's draw 2, HOMEP's least re-audited), the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 30, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 5; every one red by name but TWO, both findings (the number is the rows red):
//   THE TASK (brain/rl/homeTrainEnv.mjs): E1 paid every tick 3 | E2 dist is the score 2 | E3 the reward is the compass life's 3 | E4 it docks at the end 2 | E5 the homing task edited (a
//   comment in brain/rl/homeEnv.mjs) 1
//   THE FLY (brain/rl/homingTrainFly.mjs): K1 one weight too many 1 | K2 setParams hands back the inner fly 1 | K3 rates not the inner fly's 1
//   THE ROUND: F1 HOMES on the real wiring 1 | F2 the battery the trainer round's 4 | F3 a battery of 16 1 | F4 not fresh lives 1 | F5 another seed 1 | F6 home audited on the course lives
//   0 -- A FINDING, see below -- then 1, and F6b the course scored on the home lives 1 | F7 COURSE64 is the LAST arm 1 | F8 G against HOMES 2 | F9 V against the start 1 | F10 the rank
//   sums' BETTER and WORSE swapped 2 | F11 the homing file's own checks skipped 1 | F12 the trainer file's own checks skipped 1 | F13 the floors not compared 1 | F14 COURSE64's rates not
//   checked 0 -- A FINDING -- then 1 | F15 the audit the compass round's 2 | F16 the iteration kept not said 1 | F17 the second training not compared 1 | F18 the round writes the homing
//   round's file 1
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 COURSE64 is trained 1 | C4 the file's flies not counted as done 1 | C5 reads the homing
//   round's library 1.   THE NOTE: N1 its battery on 40000000 1 | N2 its G against HOMES 1 | N3 it trains draw 2 twice 1 | N4 its hand rule 0.5552 1
//   THE TWO FINDINGS: section 4's one training was audited at home and on the course on THE SAME 2 lives, so swapping which lives the home score used changed nothing (F6); it now has a
//   course life of its own, and the row demands each score is not the other lives' -- F6 and F6b 1 red each. And no record made here had a COURSE64 fly with other rates than its committed
//   ones (F14); one does now -- 1 red. F2 was run again on the stricter rows: 4 red.
//   ONE ROW WAS WIDENED BEFORE THE COMMIT, A FINDING OF tools/ship/definitionGates-selfcheck.mjs: the library's BAT_EPS, BAT_BASE and BAT_STEP were named by no gate (the all-shapes count
//   went from 858 to 861, the import-owned from 664 to 667); the battery row now names them.
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's home score (HOMES draw 2) changed in a digit the double holds 1 (the file's
//   hash alone: a change of 1e-12 in a fly that is no arm's least or most is under the arms row's 5e-5, and the hash is what holds the file's bytes) | V2 G against HOMES 3 | V3 the rank
//   sums' BETTER and WORSE swapped 5 | V4 the sign tests' BETTER and WORSE swapped 5 | V5 H against the start 5 | V6 the floors' hand rule changed in a digit the double holds 3 (the
//   hash, the checks, and the verdict section throwing on the reading the failed check leaves unweighed -- red by name) | V7 draw 12's trainer sample at iteration 10 changed in a digit
//   the double holds 2 | V8 the note's G says BETTER 1 | V9 the note's expectation of G is WORSE 55 1 | V10 the note names another commit 1 | V11 the note drops that section 5 said
//   nothing for WORSE 1 | V12 the note drops that the batteries were measured outside the tree 1 | V13 the note's gap 0.0040 1 | V14 the note's HOMEP rate a 0.0096 1. None went 0 red.
//   TWO SLIPS WERE FOUND BEFORE THE SABOTAGES, BOTH MINE IN THE NOTE: the gap between HOMEP and COURSE64 written 0.0040 from the rounded means (it is 0.00405, 0.0041), which the
//   described row found red; and HOMEP's mean rate a written 0.0096 (it is 0.009546, 0.0095), found when the row was written. V13 and V14 put each back and go red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as TR from "./flyCompassTrainer.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as HE from "../../brain/rl/homeEnv.mjs";
import * as HF from "../../brain/rl/homingFly.mjs";
import { HomeTrainEnv } from "../../brain/rl/homeTrainEnv.mjs";
import { HomingTrainFly } from "../../brain/rl/homingTrainFly.mjs";
import { trainDockES, rollout } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880011, 880012], COURSE = [880013];
const F = Object.fromEntries(Object.entries(T.FILES).map(([k, f]) => [k, T.fileOf(fs.readFileSync(path.join(ENG, f)))]));
// a homing life by hand (as tools/ship/flyHome-selfcheck.mjs flies one): the compass env as it is, a position summed here, the fly's home vector summed here, the goal replaced here
const byHand = (fly, seed) => { const env = new CE.CompassEnv(); let o = env.reset(seed), x = 0, y = 0, hx = 0, hy = 0, out = null, closest = Infinity, done = false;
    while (!done) { const seen = Float64Array.from(o); if (o[CE.CLOCK] >= 1000) seen[CE.GOAL] = Math.atan2(-hy, -hx); const a = fly.act(seen); hx += Math.cos(fly.phi); hy += Math.sin(fly.phi); const r = env.step(a); x += Math.cos(env.th); y += Math.sin(env.th); const d = Math.hypot(x, y); if (env.t === 1000) out = d; else if (env.t > 1000) closest = Math.min(closest, d); o = r.obs; done = r.done; }
    return Math.max(0, 1 - closest / out); };
const committed = (arm, s) => F.trainer.lines.find((x) => x.kind === "draw" && x.arm === arm && x.s === s);

console.log("flyTrainedHome-selfcheck -- the trained-to-find-home round (the compass fly trained on the homing score, against the same fly trained to hold a course): the task, the fly, the numbers, one training, the records, the command, the verdict\n");

console.log("1. THE TASK (brain/rl/homeTrainEnv.mjs: brain/rl/homeEnv.mjs's life, its return the homing score)");
section(() => {
    const a = new HE.HomeEnv(), b = new HomeTrainEnv(); let oa = a.reset(77), ob = b.reset(77), same = J(Array.from(oa)) === J(Array.from(ob)), early = true, paid = null, sum = 0, ends = 0;
    for (let t = 0; t < 1500; t++) { const u = [0.15 * Math.sin(t / 41)], ra = a.step(u), rb = b.step(u); same = same && J(Array.from(ra.obs)) === J(Array.from(rb.obs)) && ra.done === rb.done && a.th === b.th && a.x === b.x && a.y === b.y; sum += rb.reward;
        if (!rb.done) early = early && rb.reward === 0 && J(rb.info) === J({ docked: false, crashed: false, dist: 1 }); else { ends++; paid = rb; } }
    ok("!! THE HOMING LIFE UNCHANGED: on the same seed and the same actions every observation, done, heading and position is the homing env's, tick by tick", same && ends === 1);
    ok("!! ITS RETURN IS THE LIFE'S HOMING SCORE, PAID AT ITS END: 0 a tick before (info: not docked, not crashed, dist 1); at the end the score, and dist 1 less it; the return summed is the score",
        early && paid.reward === a.score() && paid.reward > 0 && J(paid.info) === J({ docked: false, crashed: false, dist: 1 - a.score() }) && sum === a.score(), `score ${a.score().toFixed(4)}`);
    ok("!! THE HOMING TASK AND WRAPPER ARE NOT EDITED: brain/rl/homeEnv.mjs and brain/rl/homingFly.mjs are the bytes the homing round committed (e870ec5e)",
        sha("brain/rl/homeEnv.mjs") === "d75957c82576d1fa2f98f93a90a56e573282ae96192c7f03f3c4f1aba4bf5e25" && sha("brain/rl/homingFly.mjs") === "82b7177f85ec9d4d1d931e641e1e8b44b7712da37f131642bfd259525b1ddc99");
});

console.log("\n2. THE FLY (brain/rl/homingTrainFly.mjs, the homing wrapper with the compass fly's weights)");
section(() => {
    const w = PF.unpackWeights(committed("BAT64", 3).weights), plain = new HF.HomingFly(V.policyOf("PLASTIC", 3).setParams(w)), inner = V.policyOf("PLASTIC", 3).setParams(w), tf = new HomingTrainFly(inner);
    const e1 = new HE.HomeEnv(), e2 = new HE.HomeEnv(); let o1 = e1.reset(31), o2 = e2.reset(31), same = true;
    for (let t = 0; t < 1500; t++) { const a1 = plain.act(o1), a2 = tf.act(o2); same = same && a1[0] === a2[0] && plain.phi === tf.phi && plain.hx === tf.hx && plain.hy === tf.hy; o1 = e1.step(a1).obs; o2 = e2.step(a2).obs; }
    ok("!! THE TRAINED FLY IS THE HOMING WRAPPER, ACTION FOR ACTION, PHI FOR PHI AND HOME VECTOR FOR HOME VECTOR, over a life", same && tf instanceof HF.HomingFly);
    const g = new HomingTrainFly(V.policyOf("PSHUF", 6)), back = g.setParams(Float32Array.from([0.3, 0.1, 0.2]));
    ok("!! IT HANDS THE TRAINER THE COMPASS FLY'S 3 WEIGHTS: paramCount, getParams and rates are the inner fly's; setParams sets the inner fly's and hands back the wrapper",
        g.paramCount() === 3 && back === g && J(Array.from(g.getParams())) === J(Array.from(Float32Array.from([0.3, 0.1, 0.2]))) && J(Array.from(g.inner.getParams())) === J(Array.from(g.getParams())) && J(g.rates()) === J(g.inner.rates()) && g.rates().a > 0);
    const f = V.policyOf("PLASTIC", 3).setParams(w), r = rollout(new HomingTrainFly(f), new HomeTrainEnv(), TWO[0]);
    ok("!! A LIFE THROUGH THE TRAINER'S OWN ROLLOUT RETURNS THE HOMING SCORE FLOWN BY HAND, and its dist is 1 less it", r.total === byHand(V.policyOf("PLASTIC", 3).setParams(w), TWO[0]) && r.dist === 1 - r.total && r.docked === false, `${r.total.toFixed(4)}`);
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    ok("!! draws 1 to 12; the arms HOMEP, HOMES (trained) and COURSE64 (the trainer round's BAT64), the lead HOMEP; alpha 0.01; the compass round's recipe; the homing round's audit; this round's own results file",
        J(T.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(T.ARMS) === J(["HOMEP", "HOMES", "COURSE64"]) && J(T.TRAINED) === J({ HOMEP: "PLASTIC", HOMES: "PSHUF" }) && T.LEAD === "HOMEP" && T.ALPHA === 0.01 &&
        T.RECIPE === V.RECIPE && J(T.RECIPE) === J({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && T.AUDIT === H.AUDIT && T.RESULTS === "brain/flyTrainedHomeRound.jsonl");
    ok("!! THE FOUR COMMITTED FILES, NAMED BY THE SHA256S THEY WERE COMMITTED WITH -- AND THEY HAVE THEM TODAY: the homing round's e04f2c0b..., the trainer round's dd6b4646..., and the compass and balanced rounds' they are checked against",
        J(T.FILES) === J({ homing: "brain/flyHomeRound.jsonl", trainer: "brain/flyCompassTrainerRound.jsonl", compass: "brain/flyCompassRound.jsonl", balanced: "brain/flyCompassBalancedRound.jsonl" }) &&
        T.HOMING_SHA256 === "e04f2c0b519d9c76cba1d466b93cc1a909e0bc43dde01b5612c77ceec64de0a3" && T.TRAINER_SHA256 === "dd6b4646158c4d0e33a7398bfeba6e465b3f2f088abb24be8687a51606da7efe" &&
        F.homing.sha256 === T.HOMING_SHA256 && F.trainer.sha256 === T.TRAINER_SHA256 && F.compass.sha256 === H.COMPASS_SHA256 && F.balanced.sha256 === H.BALANCED_SHA256 && sha(T.TRAINER) === T.TRAINER_SHA256);
    const lives = new Set(); let clash = 0; const add = (x) => { if (lives.has(x)) clash++; lives.add(x); };
    T.AUDIT.forEach(add); V.AUDIT.forEach(add); for (const s of T.SEEDS) { const b = T.batteryOf(s), t = TR.batteryOf("BAT64", s); for (let k = 0; k < 64; k++) { add(b.base + 17 * k); add(t.base + 17 * k); } }
    for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k); for (let k = 0; k < 100; k++) add(30000001 + 7919 * k);
    ok("!! THE BATTERY: 64 lives of the draw's own, 80000000 + 10007 s + 17 k -- the trainer round's BAT64 way, on a base of its own; no battery life is an audit, training, fixed-battery or scoping life, nor one of the trainer round's BAT64 lives (2,276 different seeds)",
        T.BAT_EPS === 64 && T.BAT_BASE === 80000000 && T.BAT_STEP === 10007 && T.SEEDS.every((s) => J(T.batteryOf(s)) === J({ eps: 64, base: 80000000 + 10007 * s }) && T.batteryOf(s).eps === TR.batteryOf("BAT64", s).eps && T.batteryOf(s).base - TR.batteryOf("BAT64", s).base === 40000000) && clash === 0 && lives.size === 200 + 200 + 12 * 128 + 240 + 16 + 100 &&
        throws(() => T.batteryOf(0), /a draw is a whole number from 1/));
    const hash = (f) => PF.hashEdges(Array.from(f.w0));
    ok("!! EACH ARM'S FLY: HOMEP and COURSE64 the compass round's PLASTIC fly on the real wiring, HOMES its PSHUF fly on the draw's shuffle; with weights, those weights; an arm that is not one is refused by name; only HOMEP and HOMES are trained",
        hash(T.flyOf("HOMEP", 5)) === hash(V.policyOf("PLASTIC", 5)) && hash(T.flyOf("COURSE64", 5)) === hash(V.policyOf("PLASTIC", 5)) && hash(T.flyOf("HOMES", 5)) === hash(V.policyOf("PSHUF", 5)) && hash(T.flyOf("HOMES", 5)) !== hash(V.policyOf("PLASTIC", 5)) &&
        T.flyOf("HOMES", 2).plastic === true && J(Array.from(T.flyOf("HOMEP", 2, [0.1, 0.2, 0.3]).getParams())) === J(Array.from(Float32Array.from([0.1, 0.2, 0.3]))) && throws(() => T.flyOf("PSUM", 1), /no arm PSUM/) && throws(() => T.trainOne("COURSE64", 1), /no trained arm COURSE64/));
    const fl = T.floors(TWO), hfl = H.floors(TWO);
    ok("!! THE FLOORS ARE THE HOMING ROUND'S: vision off, the start, the hand rule and the start told the true heading, to the bit on the same lives, and vision off a homing life flown by hand",
        J(fl) === J(hfl) && fl.kind === "floors" && near(fl.off, (byHand(V.policyOf("FROZEN", 1).setParams([0]), TWO[0]) + byHand(V.policyOf("FROZEN", 1).setParams([0]), TWO[1])) / 2, 1e-12));
    const note = src("brain/FLY_TRAINED_HOME_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the return the homing score; the arms; the recipe and battery; draws 1 to 12; the audit; HOMEP draw 1 twice; G, T1, H, V; the committed files' hashes",
        /\*\*its return the life's homing score\*\* \(paid at the life's end; info\.dist is 1 less it\)/.test(note) && /\| \*\*HOMEP\*\* \| the compass round's PLASTIC fly \(the real wiring\) \| trained on the homing score \|/.test(note) &&
        /\| \*\*HOMES\*\* \| the compass round's PSHUF fly \(a shuffle\) \| trained on the homing score \|/.test(note) && /\| COURSE64 \| the trainer round's BAT64 flies/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /the compass round's \(60 iterations, 16 flies tried, sigma 0\.14, lr 0\.05, 4 fresh lives each\)/.test(note) && /\*\*on 64 lives of the draw's own \(seeds 80000000 \+ 10007 s \+ 17 k\)\*\*/.test(note) && /the homing round's 200 lives \(seeds 50000001 \+ 7919 k\)/.test(note) &&
        /\*\*HOMEP draw 1 is trained a second time\.\*\*/.test(note) && /\*\*G: HOMEP against COURSE64\*\* \(rank sum\)/.test(note) && /\*\*T1: HOMEP against HOMES\*\* \(rank sum\)/.test(note) && /\*\*H: HOMEP against the hand rule\*\* \(the homing round's committed 0\.5551; sign test\)/.test(note) &&
        /\*\*V: HOMEP against vision off\*\* \(the homing round's committed 0\.4559; sign test\)/.test(note) && /sha256 dd6b4646158c4d0e/.test(note));
});

console.log("\n4. ONE TRAINING (one iteration of 2 flies; 2 audit lives) AND ONE COURSE64 FLY");
section(() => {
    const tiny = { iters: 1, pop: 2, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 16 }, rec = T.trainOne("HOMEP", 5, tiny, TWO, COURSE), w = PF.unpackWeights(rec.weights);
    const res = trainDockES({ envFactory: () => new HomeTrainEnv(), obsDim: CE.NR + 2, actDim: 1, maxSteps: 1500, iters: 1, pop: 2, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 5, freshEpisodes: true, batteryEps: 64, batteryBase: 80000000 + 10007 * 5,
        policyFactory: () => new HomingTrainFly(V.policyOf("PLASTIC", 5)) });
    ok("!! A TRAINING IS THE TRAINER CALLED BY HAND WITH THE REGISTERED OPTIONS: the homing task, the wrapped PLASTIC fly, the draw's seed, fresh lives, the draw's 64 battery lives -- the same weights to the bit", rec.weightsHash === PF.hashWeights(res.params) && rec.weightCount === 3, rec.weightsHash);
    const battery = Array.from({ length: 64 }, (_, k) => 80000000 + 10007 * 5 + 17 * k), onBattery = H.homeScore(T.flyOf("HOMEP", 5, w), battery);
    ok("!! THE TRAINER'S RETURN IS THE HOMING SCORE ON THE DRAW'S 64 LIVES: its history at iteration 0 is the kept fly's mean homing score on them", rec.history.length === 1 && rec.history[0].it === 0 && near(rec.history[0].ret, onBattery, 1e-12) && rec.keptAt === 0, `${onBattery.toFixed(4)}`);
    const hand = (byHand(T.flyOf("HOMEP", 5, w), TWO[0]) + byHand(T.flyOf("HOMEP", 5, w), TWO[1])) / 2;
    ok("!! THE RECORD: its home score the audit lives flown here by hand; its course score the compass round's score on the course lives given (each on its own lives, and not the other's); the recipe, the battery, the rates and the iteration kept",
        near(rec.home, hand, 1e-12) && rec.course === V.auditScore(T.flyOf("HOMEP", 5, w), COURSE) && rec.course !== V.auditScore(T.flyOf("HOMEP", 5, w), TWO) && rec.home !== H.homeScore(T.flyOf("HOMEP", 5, w), COURSE) && J(rec.recipe) === J(tiny) && J(rec.battery) === J({ eps: 64, base: 80050035 }) && J(rec.rates) === J(T.flyOf("HOMEP", 5, w).rates()) && rec.kind === "draw" && rec.arm === "HOMEP" && rec.s === 5, `home ${rec.home.toFixed(4)}`);
    const c = T.courseOne(4, F.trainer, TWO), cw = PF.unpackWeights(committed("BAT64", 4).weights), ch = (byHand(V.policyOf("PLASTIC", 4).setParams(cw), TWO[0]) + byHand(V.policyOf("PLASTIC", 4).setParams(cw), TWO[1])) / 2;
    ok("!! A COURSE64 RECORD IS THE TRAINER ROUND'S BAT64 FLY AS COMMITTED, FLOWN HOME BY HAND: its weights' hash, course score and rates its committed record's; nothing trained",
        c.kind === "fly" && c.arm === "COURSE64" && c.s === 4 && near(c.home, ch, 1e-12) && c.weightsHash === committed("BAT64", 4).weightsHash && c.course === committed("BAT64", 4).score && J(c.rates) === J(committed("BAT64", 4).rates) && !("weights" in c), `home ${c.home.toFixed(4)}`);
});

console.log("\n5. THE RECORDS (made here)");
section(() => {
    const wOf = (s, k) => Float32Array.from([0.004 * s + k, 0.001, 0.002]);
    const trained = (arm, s, home, k = 0) => { const w = wOf(s, k); return { kind: "draw", arm, s, recipe: { ...T.RECIPE }, battery: T.batteryOf(s), weightCount: 3, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), rates: { a: 0.01, b: 0, c: 0.001 }, keptAt: 30, home, course: 0.66,
        history: [{ it: 0, ret: 0.5 }, { it: 59, ret: 0.55 }] }; };
    const course = (s, home) => { const c = committed("BAT64", s); return { kind: "fly", arm: "COURSE64", s, weightsHash: c.weightsHash, rates: c.rates, home, course: c.score }; };
    const hfl = F.homing.lines.find((r) => r.kind === "floors");
    const file = (f, re = (out) => ({ kind: "recheck", arm: "HOMEP", s: 1, weightsHash: out.find((r) => r.arm === "HOMEP" && r.s === 1).weightsHash })) => { const out = [];
        for (const s of T.SEEDS) out.push(trained("HOMEP", s, f("HOMEP", s))); for (const s of T.SEEDS) out.push(trained("HOMES", s, f("HOMES", s), 1)); for (const s of T.SEEDS) out.push(course(s, f("COURSE64", s))); out.push(re(out), { ...hfl }); return out; };
    // HOMEP 0.570 + s/1e4 (every fly above the hand rule's 0.5551); COURSE64 interleaved with it; HOMES below every HOMEP fly
    const sc = (arm, s) => ({ HOMEP: 0.57, COURSE64: 0.57 + 0.00005, HOMES: 0.54 })[arm] + s / 1e4, good = file(sc), R = T.reading(good, F), lines = T.readingLines(R).join("\n");
    const bad = (recs, re) => T.checkRecords(recs, F).some((x) => re.test(x));
    ok("!! a file of 36 flies with HOMEP draw 1 twice and the floors passes every check; a fly missing, another recipe, another battery, a weight count not 3, weights not their hash, no iteration kept, and a COURSE64 fly not its committed one (its weights, its course score, its rates) each fail by name",
        T.checkRecords(good, F).length === 0 && good.length === 38 && /^the checks hold: both committed files as committed and passing their own checks/.test(lines) && bad(good.filter((r) => !(r.arm === "HOMES" && r.s === 12)), /HOMES draw 12 is there 0 times/) &&
        bad(good.map((r) => (r.arm === "HOMEP" && r.s === 3 ? { ...r, recipe: { ...r.recipe, iters: 59 } } : r)), /HOMEP draw 3 was trained with another recipe/) && bad(good.map((r) => (r.arm === "HOMES" && r.s === 4 ? { ...r, battery: { eps: 64, base: 40000000 + 10007 * 4 } } : r)), /HOMES draw 4 kept its point on other lives than its draw's 64/) &&
        bad(good.map((r) => (r.arm === "HOMEP" && r.s === 2 ? { ...r, weightCount: 4 } : r)), /HOMEP draw 2 has 4 weights/) && bad(good.map((r) => (r.arm === "HOMEP" && r.s === 6 ? { ...r, weightsHash: "0".repeat(16) } : r)), /HOMEP draw 6's weights are not 3 finite numbers with its hash/) &&
        bad(good.map((r) => (r.arm === "HOMES" && r.s === 7 ? { ...r, keptAt: 60 } : r)), /HOMES draw 7 does not say which iteration it kept/) &&
        bad(good.map((r) => (r.arm === "COURSE64" && r.s === 5 ? { ...r, weightsHash: committed("BAT64", 6).weightsHash } : r)), /COURSE64 draw 5 is not the trainer round's BAT64 fly as committed/) &&
        bad(good.map((r) => (r.arm === "COURSE64" && r.s === 8 ? { ...r, course: r.course + 1e-9 } : r)), /COURSE64 draw 8 is not the trainer round's BAT64 fly as committed/) &&
        bad(good.map((r) => (r.arm === "COURSE64" && r.s === 9 ? { ...r, rates: { ...r.rates, a: r.rates.a + 1e-9 } } : r)), /COURSE64 draw 9 is not the trainer round's BAT64 fly as committed/));
    ok("!! a second training of HOMEP draw 1 that differs fails; floors not the homing round's to the bit fail; a committed file that is not the one committed, or that fails its own checks, fails by name and no record is weighed",
        J(T.checkRecords(file(sc, () => ({ kind: "recheck", arm: "HOMEP", s: 1, weightsHash: "f".repeat(16) })), F)) === J(["HOMEP draw 1 trained a second time is not there once with the same weights"]) &&
        J(T.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, hand: r.hand + 1e-12 } : r)), F)) === J(["the floors are not the homing round's to the bit: the fly, task or audit is not the same"]) &&
        J(T.checkRecords(good, { ...F, homing: { ...F.homing, sha256: "0".repeat(64) } })) === J(["the homing round's file is not the one committed (sha256 e04f2c0b519d9c76...)"]) &&
        J(T.checkRecords(good, { ...F, trainer: { ...F.trainer, sha256: "1".repeat(64) } })) === J(["the trainer round's file is not the one committed (sha256 dd6b4646158c4d0e...)"]) &&
        J(T.checkRecords(good, { ...F, homing: { ...F.homing, lines: F.homing.lines.filter((r) => !(r.arm === "PSUM" && r.s === 3)) } })) === J(["the homing round's file fails its own checks: PSUM draw 3 is there 0 times (once is registered)"]) &&
        J(T.checkRecords(good, { ...F, trainer: { ...F.trainer, lines: F.trainer.lines.filter((r) => !(r.arm === "LAST" && r.s === 9)) } })) === J(["the trainer round's file fails its own checks: LAST draw 9 is there 0 times (once is registered)"]));
    ok("!! G AND T1 ARE HOMEP AGAINST COURSE64 AND AGAINST HOMES (exact rank sums), H AND V HOMEP AGAINST THE HOMING ROUND'S HAND RULE AND VISION OFF (sign tests): G CANNOT (ranks 144), T1 BETTER (222), H BETTER and V BETTER (12 above)",
        R.G.a === "HOMEP" && R.G.b === "COURSE64" && R.G.word === T.WORDS.G[2] && R.G.sumA === 144 && R.T1.b === "HOMES" && R.T1.word === T.WORDS.T1[0] && R.T1.sumA === 222 && R.H.word === T.WORDS.H[0] && R.H.above === 12 && R.H.ref === hfl.hand && R.V.word === T.WORDS.V[0] && R.V.ref === hfl.off &&
        /T1 \(HOMEP against HOMES\): HOMEP's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE FLY TRAINED TO FIND HOME FINDS HOME BETTER THAN ONE ON A SHUFFLE TRAINED THE SAME WAY/.test(lines) && R.arms.HOMEP.n === 12 && near(R.arms.HOMEP.mean, 0.57065) &&
        near(R.arms.COURSE64.course, T.SEEDS.reduce((n, s) => n + committed("BAT64", s).score, 0) / 12, 1e-12));
    const worse = T.reading(file((arm, s) => (arm === "HOMEP" ? 0.5 + s / 1e4 : sc(arm, s))), F), tied = T.reading(file((arm, s) => (arm === "COURSE64" ? sc("HOMEP", s) : sc(arm, s))), F), noFl = T.reading(good.filter((r) => r.kind !== "floors"), F);
    ok("HOMEP under every other fly and under the hand rule is G and T1 WORSE (78) and H WORSE (0 above); HOMEP equal to COURSE64 fly for fly is 12 ties and CANNOT (ties count against the claim); with a failed check no reading is weighed and the first line says so",
        worse.G.word === T.WORDS.G[1] && worse.G.sumA === 78 && worse.T1.word === T.WORDS.T1[1] && worse.H.word === T.WORDS.H[1] && worse.H.above === 0 && tied.G.ties === 12 && tied.G.word === T.WORDS.G[2] && noFl.G === null && noFl.V === null && /^A CHECK FAILED/.test(T.readingLines(noFl)[0]));
});

console.log("\n6. THE COMMAND");
section(() => {
    const file = path.join(ENG, T.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "PSUM", "1"], ["job", "HOMEP", "x"], ["job", "HOMEP", "0"], ["job", "COURSE64", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for the three arms and draws 1 to 12 -- and nothing else", J(T.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(T.parseArgs(["read"])) === J({ cmd: "read" }) && J(T.parseArgs(["job", "COURSE64", "12"])) === J({ cmd: "job", arm: "COURSE64", s: 12 }) && no.every((a) => T.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyTrainedHome.mjs");
    ok("!! the command is this round's -- its library and results file, the four committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered defaults, runs only what the file does not hold, and trains HOMEP draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyTrainedHome\.mjs"/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /args\.arm === "COURSE64" \? PF\.courseOne\(args\.s, committedFiles\(\)\.trainer\) : PF\.trainOne\(args\.arm, args\.s\)/.test(csrc) &&
        /done = new Set\(have\.filter\(\(r\) => r\.kind === "draw" \|\| r\.kind === "fly"\)/.test(csrc) && /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\], weightsHash: r\.weightsHash/.test(csrc) &&
        /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyTrainedHome\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyTrainedHome-selfcheck.mjs"), calls = [...me.matchAll(/T\.(trainOne|courseOne)\(([^)]*)\)/g)].map((m) => m[1] + "(" + m[2] + ")");
    ok("!! THIS GATE RUNS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training is of one iteration with 2 home lives and 1 course life that are not the round's audits, its one COURSE64 fly flown on the 2 (and one call refused before it starts); it starts no process; the file's size and time are what they were",
        J(calls) === J(['trainOne("COURSE64", 1)', 'trainOne("HOMEP", 5, tiny, TWO, COURSE)', 'courseOne(4, F.trainer, TWO)']) && ![...TWO, ...COURSE].some((x) => T.AUDIT.includes(x) || V.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n7. THE VERDICT (the whole results file was committed at 76d8bc95 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, T.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = T.reading(lines, F), A = R.arms, Fl = R.floors;
    const of = (a) => lines.filter((r) => (r.kind === "draw" || r.kind === "fly") && r.arm === a).sort((x, y) => x.s - y.s), rec = (a, s) => of(a).find((r) => r.s === s), all = T.ARMS.flatMap(of);
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = []; o.forEach((p, k) => { r[p[1]] = k + 1; }); return r; };
    const spearman = (rs) => { const x = rs.map((r) => r.home), y = rs.map((r) => r.course), a = rank(x), b = rank(y), m = (x.length + 1) / 2; let s = 0, sa = 0, sb = 0;
        for (let i = 0; i < x.length; i++) { s += (a[i] - m) * (b[i] - m); sa += (a[i] - m) ** 2; sb += (b[i] - m) ** 2; } return new Set(x).size === x.length && new Set(y).size === y.length ? s / Math.sqrt(sa * sb) : NaN; };
    ok("!! the results file is the one the run wrote: 38 records, sha256 c931f32e5705cdba... (three starts: the first two killed at two hours after 12 and 36 records, the third 28.0 minutes)",
        lines.length === 38 && createHash("sha256").update(bytes).digest("hex") === "c931f32e5705cdbadeb3ca729958a67a0eb7375593cf2feb02b8c4ac5b5522c6");
    ok("!! THE CHECKS HOLD: both committed files as committed and passing their own checks, 36 flies each once, HOMEP draw 1 the same twice; the floors -- vision off 0.4559, the start 0.4568, the hand rule 0.5551, told 0.9948",
        R.checks.length === 0 && near(Fl.off, 0.4559) && near(Fl.start, 0.4568) && near(Fl.hand, 0.5551) && near(Fl.told, 0.9948) && lines.find((r) => r.kind === "recheck").weightsHash === rec("HOMEP", 1).weightsHash);
    ok("!! *** G: THE FLY TRAINED TO FIND HOME FINDS HOME WORSE THAN THE SAME FLY TRAINED TO HOLD A COURSE -- ranks 97 (p 0.0014) *** -- *** T1: AND WORSE THAN ONE ON A SHUFFLE TRAINED THE SAME WAY -- ranks 101 (p 0.0036) ***",
        R.G.word === T.WORDS.G[1] && R.G.b === "COURSE64" && R.G.sumA === 97 && R.G.ties === 0 && near(R.G.p, 1.433e-3, 5e-7) && R.T1.word === T.WORDS.T1[1] && R.T1.b === "HOMES" && R.T1.sumA === 101 && R.T1.ties === 0 && near(R.T1.p, 3.637e-3, 5e-7));
    ok("!! H: IT FINDS HOME WORSE THAN THE RULE SET BY HAND -- 0 of 12 above its 0.5551 (p 2/4096); V: BETTER THAN PATH INTEGRATION ALONE -- 12 of 12 above 0.4559 (p 2/4096)",
        R.H.word === T.WORDS.H[1] && R.H.above === 0 && R.H.below === 12 && R.H.p === 2 / 4096 && R.H.ref === Fl.hand && R.V.word === T.WORDS.V[0] && R.V.above === 12 && R.V.p === 2 / 4096 && R.V.ref === Fl.off);
    ok("!! the arms (home mean, sd, least, most; course; rates a and c, b 0 in every fly): HOMEP 0.5501 0.0039 0.5442 0.5542, 0.6501, 0.0095 0.000018 | HOMES 0.5623 0.0117 0.5348 0.5773, 0.6882, 0.0057 0.000023 | COURSE64 0.5541 0.0024 0.5478 0.5564, 0.6688, 0.0090 0.000012",
        near(A.HOMEP.mean, 0.5501) && near(A.HOMEP.sd, 0.0039) && near(A.HOMEP.min, 0.5442) && near(A.HOMEP.max, 0.5542) && near(A.HOMEP.course, 0.6501) && near(A.HOMEP.rates.a, 0.0095) && near(A.HOMEP.rates.c, 0.000018, 5e-7) &&
        near(A.HOMES.mean, 0.5623) && near(A.HOMES.sd, 0.0117) && near(A.HOMES.min, 0.5348) && near(A.HOMES.max, 0.5773) && near(A.HOMES.course, 0.6882) && near(A.HOMES.rates.a, 0.0057) && near(A.HOMES.rates.c, 0.000023, 5e-7) &&
        near(A.COURSE64.mean, 0.5541) && near(A.COURSE64.sd, 0.0024) && near(A.COURSE64.min, 0.5478) && near(A.COURSE64.max, 0.5564) && near(A.COURSE64.course, 0.6688) && near(A.COURSE64.rates.a, 0.0090) && near(A.COURSE64.rates.c, 0.000012, 5e-7) &&
        all.length === 36 && all.every((r) => r.rates.b === 0));
    const hp = of("HOMEP"), c64 = of("COURSE64"), upHome = hp.filter((r, i) => r.home > c64[i].home).map((r) => r.s), upCourse = hp.filter((r, i) => r.course > c64[i].course).map((r) => r.s);
    const plastic = F.homing.lines.filter((r) => r.kind === "fly" && r.arm === "PLASTIC"), plasticMean = plastic.reduce((n, r) => n + r.home, 0) / plastic.length;
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED, FROM THE RECORDS: home follows course (Spearman 0.86 over the 36 flies; 0.87, 0.82, 0.62 within the arms); HOMEP above its COURSE64 draw at home and on the course on draws 5 and 6 alone, below it at home by 0.0041; COURSE64 above the hand rule on 5 of 12; the start 0.4568 to HOMEP's 0.5501, the homing round's PLASTIC 0.5493",
        spearman(all).toFixed(2) === "0.86" && spearman(hp).toFixed(2) === "0.87" && spearman(of("HOMES")).toFixed(2) === "0.82" && spearman(c64).toFixed(2) === "0.62" && J(upHome) === J([5, 6]) && J(upCourse) === J([5, 6]) &&
        near(A.HOMEP.mean - A.COURSE64.mean, -0.0041) && c64.filter((r) => r.home > Fl.hand).length === 5 && plastic.length === 12 && near(plasticMean, 0.5493),
        `Spearman ${[all, hp, of("HOMES"), c64].map((v) => spearman(v).toFixed(3)).join(" ")}`);
    const bat = T.batteryOf(12), lives = Array.from({ length: bat.eps }, (_, k) => bat.base + 17 * k), d12 = rec("HOMEP", 12), kept = H.homeScore(T.flyOf("HOMEP", 12, PF.unpackWeights(d12.weights)), lives);
    const c12 = H.homeScore(T.flyOf("COURSE64", 12, PF.unpackWeights(committed("BAT64", 12).weights)), lives), h12 = H.homeScore(V.policyOf("PLASTIC", 1).setParams(V.HAND), lives), sample = d12.history.find((h) => h.it === 10);
    ok("!! FLOWN AFTER THE READING: draw 12 kept iteration 10, and its fly on the draw's 64 lives scores the trainer's sample there to the bit (0.6242); its COURSE64 fly scores 0.6015 and the hand rule 0.6139 on them -- both below it, as on all 12 draws' lives; on the audit it is below both",
        d12.keptAt === 10 && sample && kept === sample.ret && near(kept, 0.6242) && near(c12, 0.6015) && near(h12, 0.6139) && kept > c12 && kept > h12 && d12.home < rec("COURSE64", 12).home && d12.home < Fl.hand, `${kept} ${c12.toFixed(4)} ${h12.toFixed(4)}`);
    const scoping = Array.from({ length: 100 }, (_, k) => 30000001 + 7919 * k), d2 = H.homeScore(T.flyOf("HOMEP", 2, PF.unpackWeights(rec("HOMEP", 2).weights)), scoping), d11 = rec("HOMEP", 11);
    ok("!! FLOWN AFTER THE READING: HOMEP draw 2 on the scoping's 100 lives gives section 1's 0.5767 again (0.5540 on the audit, against its COURSE64 draw's 0.5541); HOMEP's least, draw 11, gives its home score again on the 200 audit lives to the bit",
        near(d2, 0.5767) && near(rec("HOMEP", 2).home, 0.5540) && near(rec("COURSE64", 2).home, 0.5541) && /\| 2 \| 0\.5767 \| 0\.7070 \| 0\.5649 \|/.test(src("brain/FLY_TRAINED_HOME_WIP.md")) &&
        d11.home === A.HOMEP.min && H.homeScore(T.flyOf("HOMEP", 11, PF.unpackWeights(d11.weights))) === d11.home, `draw 2 on the scoping lives ${d2.toFixed(4)}`);
    const note = src("brain/FLY_TRAINED_HOME_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 10. The result"));
    ok("the expectations, written before the code, against what came: G CANNOT 55 and BETTER 40 came WORSE; T1 CANNOT 60 came WORSE (given 25); H BETTER 55 and CANNOT 40 came WORSE; V BETTER (97) came; HOMEP's mean in 0.545 to 0.575 (70) came",
        /G: CANNOT about 55, BETTER 40\. T1: CANNOT about 60, WORSE 25, BETTER 15\. H: BETTER about 55, CANNOT 40\. V: \*\*BETTER about 97 percent\*\*\. HOMEP's mean between 0\.545 and 0\.575, about 70\./.test(flat) &&
        R.G.word === T.WORDS.G[1] && R.T1.word === T.WORDS.T1[1] && R.H.word === T.WORDS.H[1] && R.V.word === T.WORDS.V[0] && A.HOMEP.mean > 0.545 && A.HOMEP.mean < 0.575);
    ok("the registration's RESULT SECTION (section 10) carries the four readings' words, the commit the file was read at, which expectations did not come, that section 5 said nothing for WORSE, the description and the flights after the reading said as such with the gate's numbers, that the twelve sets of 64 lives were measured once outside the tree, and what it does not mean",
        /## 10\. The result/.test(note) && ["G", "T1", "H", "V"].every((t) => res.includes(`**${t}: ${R[t].word}**`)) && /76d8bc95/.test(res) && /\*\*G and H did not come as given, and T1 came the less likely way given\.\*\*/.test(res) &&
        /\*\*Section 5 said what G CANNOT and G BETTER would mean, and nothing for WORSE\.\*\*/.test(res) && /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) &&
        /Spearman 0\.86 over the 36 flies, and 0\.87, 0\.82 and 0\.62/.test(res) && /on the same two draws, 5 and 6, and on no other/.test(res) && /\*\*Measured after the reading, not registered, with lives flown:\*\*/.test(res) &&
        /\*\*12 of 12 draws\*\* \(by 0\.0303 on average, from 0\.0021 to 0\.0888\)/.test(res) && /measured once, by a script that is not in the tree/.test(res) && /\| HOMEP \| 0\.5501 \(0\.5442, 0\.5542\) \| 0\.0039 \| 0\.6501 \| 0\.0095, 0\.000018 \|/.test(res) &&
        /by 0\.0041, below it on 10 of 12 draws/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyTrainedHome-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
