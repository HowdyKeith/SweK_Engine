// WebGLEngine/tools/ship/flyHome-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyHome-selfcheck.mjs      (about three minutes; IT NEVER RUNS THE ROUND -- its audits are of 2 lives, and it starts no process)
//
// THE GATE OF THE HOMING ROUND (registered in brain/FLY_FINDS_HOME_WIP.md before brain/rl/homeEnv.mjs, brain/rl/homingFly.mjs, tools/ship/flyHome.mjs and tools/ship/takeFlyHome.mjs
// existed): does the compass the fly learned to hold a course carry it back to its door? Nothing is trained.
//   1  THE TASK                 the compass life unchanged, with a position by hand, home from tick 1,000, the score by hand
//   2  THE FLY                  the home vector by hand; the goal home in its own frame from tick 1,000; nothing else changed
//   3  THE ROUND'S NUMBERS      the draws, arms, audit; both committed files named by their hashes; each arm's fly; the floors; the registration says the same
//   4  ONE AUDIT                a record's score is a homing life flown here by hand, from the committed weights
//   5  THE RECORDS              60 flies; V, P2, T1, A, B, H
//   6  THE COMMAND              it is this round's; no audit of the round's, no process
//   7  THE VERDICT              the results file as committed unread at 6ac4494f, read from the file: the checks, the six readings, the arms, the course against home, re-audits,
//                               the measurement after the reading (each arm's heading error split into offset and wobble, said as not registered), the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 25, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 4; every one red by name, NONE 0 red (the number is the rows red):
//   THE TASK (brain/rl/homeEnv.mjs): E1 home from tick 900 5 | E2 the fly moves along its goal 4 | E3 the score not held at 0 4 | E4 the closest from the life's start 3
//   THE FLY (brain/rl/homingFly.mjs): K1 the home vector before the turn 4 | K2 home from tick 1001 3 | K3 the goal along the home vector 4 | K4 the home vector not reset 3 | K5 the goal
//   home from tick 0 4
//   THE ROUND: F1 PSUM looked for in the compass file 4 | F2 the balanced arms on the real wiring 2 | F3 the audit on the compass round's audit lives 1 | F4 T1 against FROZEN 2 | F5 A the
//   other way round 1 | F6 V against the start 1 | F7 BETTER and WORSE swapped 1 | F8 told is not told 2 | F9 the balanced file's own checks skipped 1 | F10 the course score not checked 1 |
//   F11 the hand rule's floor is the start 1 | F12 the round writes the balanced round's file 1
//   THE COMMAND: C1 the second audit is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads the balanced round's library 1 | C4 the file's flies not counted as done 1.
//   THE NOTE: N1 its home from tick 900 1 | N2 its audit from 60000001 1 | N3 its T1 against FROZEN 1 | N4 it says a fly is trained 1
//   ONE ROW WAS ADDED BEFORE THE SABOTAGES, A FINDING OF tools/ship/definitionGates-selfcheck.mjs: the library's flyOf and homeScore were named by no gate (the tree-wide count went from 405
//   to 407); the row now tests them against a homing life flown by hand.
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's score at home changed in a digit the double holds 2 | V2 T1 against FROZEN 5 |
//   V3 the rank sums' BETTER and WORSE swapped 4 | V4 V against the start 2 | V5 the note's T1 says WORSE 1 | V6 the note's expectation of T1 is CANNOT 70 1 | V7 the note names another
//   commit 1 | V8 the note drops that the handicap does not carry over 1 | V9 the note drops what it does not mean 1 | V10 the note's offset 21.4 1 | V11 the hand rule's floor changed in a
//   digit the double holds 2 | V12 told is not told 2. None went 0 red.
//   TWO ROWS OF MINE WERE WRONG WHEN FIRST RUN: two of the within-arm Spearman values were written from memory (0.937 and 0.573; they are 0.944 and 0.566), and the re-audit named PSHUF draw
//   6 as the arm's most (it is draw 7).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";
import * as B from "./flyCompassBalanced.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as HE from "../../brain/rl/homeEnv.mjs";
import * as HF from "../../brain/rl/homingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TWO = [880001, 880002];
const compass = H.fileOf(fs.readFileSync(path.join(ENG, H.COMPASS))), balanced = H.fileOf(fs.readFileSync(path.join(ENG, H.BALANCED)));
// a homing life by hand: the compass env as it is, a position summed here, the fly's home vector summed here, the goal replaced here
const byHand = (fly, seed) => { const env = new CE.CompassEnv(); let o = env.reset(seed), x = 0, y = 0, hx = 0, hy = 0, out = null, closest = Infinity, done = false;
    while (!done) { const seen = Float64Array.from(o); if (o[CE.CLOCK] >= 1000) seen[CE.GOAL] = Math.atan2(-hy, -hx); const a = fly.act(seen); hx += Math.cos(fly.phi); hy += Math.sin(fly.phi); const r = env.step(a); x += Math.cos(env.th); y += Math.sin(env.th); const d = Math.hypot(x, y); if (env.t === 1000) out = d; else if (env.t > 1000) closest = Math.min(closest, d); o = r.obs; done = r.done; }
    return Math.max(0, 1 - closest / out); };

console.log("flyHome-selfcheck -- the homing round (the compass and balanced rounds' committed flies keep a home vector in their own heading and steer home from tick 1,000): the task, the fly, the numbers, one audit, the records, the command\n");

console.log("1. THE TASK (brain/rl/homeEnv.mjs: brain/rl/compassEnv.mjs's life with a door)");
section(() => {
    const a = new CE.CompassEnv(), b = new HE.HomeEnv(); let oa = a.reset(77), ob = b.reset(77), same = J(Array.from(oa)) === J(Array.from(ob)), x = 0, y = 0, path = [];
    for (let t = 0; t < 1500; t++) { const u = [0.15 * Math.sin(t / 37)], ra = a.step(u), rb = b.step(u); same = same && J(Array.from(ra.obs)) === J(Array.from(rb.obs)) && ra.reward === rb.reward && ra.done === rb.done && J(ra.info) === J(rb.info) && a.th === b.th; x += Math.cos(a.th); y += Math.sin(a.th); path.push(Math.hypot(x, y)); if (t === 998) same = same && b.score() === null; }
    const out = path[999], closest = Math.min(...path.slice(1000));
    ok("!! THE COMPASS LIFE UNCHANGED: on the same seed and the same actions every observation, reward, done and info is the compass env's, tick by tick", same && HE.HOME_AT === 1000);
    ok("!! THE POSITION AND THE SCORE BY HAND: 1 a tick along the true heading (after the turn and the gust) from (0, 0); the score 1 less the closest it comes after tick 1,000 over how far it was at tick 1,000, held at 0; none before it has gone home",
        near(b.x, x, 1e-9) && near(b.y, y, 1e-9) && near(b.out, out, 1e-9) && near(b.closest, closest, 1e-9) && near(b.score(), Math.max(0, 1 - closest / out), 1e-12), `out ${out.toFixed(1)}, closest ${closest.toFixed(1)}`);
    const c = new HE.HomeEnv(); c.reset(5); c.out = 10; c.closest = 30;
    ok("a life that never closes on its door scores 0, not below; a life starts at the door", c.score() === 0 && (() => { const e = new HE.HomeEnv(); e.reset(9); return e.x === 0 && e.y === 0 && e.out === null; })());
});

console.log("\n2. THE FLY (brain/rl/homingFly.mjs, a wrapper)");
section(() => {
    const w = PF.unpackWeights(H.committed("PLASTIC", 3, compass, balanced).weights), inner = V.policyOf("PLASTIC", 3).setParams(w), plain = V.policyOf("PLASTIC", 3).setParams(w), hf = new HF.HomingFly(inner), env = new CE.CompassEnv(), env2 = new CE.CompassEnv();
    let o = env.reset(31), o2 = env2.reset(31), hx = 0, hy = 0, sameBefore = true, homeRight = true, vecRight = true;
    for (let t = 0; t < 1500; t++) {
        const want = Math.atan2(-hy, -hx), a = hf.act(o); let a2;
        if (t < 1000) { a2 = plain.act(o2); sameBefore = sameBefore && a[0] === a2[0] && plain.phi === inner.phi; } else { const seen = Float64Array.from(o2); seen[CE.GOAL] = want; a2 = plain.act(seen); homeRight = homeRight && a[0] === a2[0]; }
        hx += Math.cos(plain.phi); hy += Math.sin(plain.phi); vecRight = vecRight && hf.hx === hx && hf.hy === hy;
        o = env.step(a).obs; o2 = env2.step(a2).obs;
    }
    ok("!! BEFORE TICK 1,000 THE WRAPPED FLY IS THE COMPASS FLY, ACTION FOR ACTION AND PHI FOR PHI; FROM TICK 1,000 ITS GOAL IS THE ANGLE OF MINUS ITS HOME VECTOR; the home vector is the sum of (cos phi, sin phi) after each tick's turn", sameBefore && homeRight && vecRight);
    const again = new HF.HomingFly(V.policyOf("PLASTIC", 3).setParams(w)), e3 = new CE.CompassEnv(); let o3 = e3.reset(31); for (let t = 0; t < 1500; t++) o3 = e3.step(again.act(o3)).obs; const first = [again.hx, again.hy];
    o3 = e3.reset(31); for (let t = 0; t < 1500; t++) o3 = e3.step(again.act(o3)).obs;
    ok("a life starts afresh (the same life twice gives the same home vector); phi reads and writes the inner fly's; a wrapper round something that is not a fly is refused by name",
        J([again.hx, again.hy]) === J(first) && (() => { hf.phi = 0.25; return inner.phi === 0.25 && hf.phi === 0.25; })() && throws(() => new HF.HomingFly({}), /wraps a fly with act/));
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    ok("!! draws 1 to 12; the arms PLASTIC, FROZEN, PSHUF (the compass round's) and PSUM, PEVEN (the balanced round's), the lead PLASTIC; alpha 0.01; this round's own results file; the two committed files named by the sha256s they were committed with -- and they have them today",
        J(H.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(H.ARMS) === J(["PLASTIC", "FROZEN", "PSHUF", "PSUM", "PEVEN"]) && H.LEAD === "PLASTIC" && H.ALPHA === 0.01 && H.RESULTS === "brain/flyHomeRound.jsonl" && H.COMPASS === "brain/flyCompassRound.jsonl" && H.BALANCED === "brain/flyCompassBalancedRound.jsonl" &&
        H.COMPASS_SHA256 === "363cdbf5147d4137ad2b6d3de26e0e14ca7709a75e77aaad9317c15cad6c0527" && H.BALANCED_SHA256 === "24a6bb78dfd9a39dd5db6189cd9f87d7434a043611ac05bf3782beed8eab4dd4" && compass.sha256 === H.COMPASS_SHA256 && balanced.sha256 === H.BALANCED_SHA256 &&
        createHash("sha256").update(fs.readFileSync(path.join(ENG, H.BALANCED))).digest("hex") === H.BALANCED_SHA256);
    const lives = new Set(); let clash = 0; const add = (x) => { if (lives.has(x)) clash++; lives.add(x); };
    H.AUDIT.forEach(add); V.AUDIT.forEach(add); for (let k = 0; k < 100; k++) add(30000001 + 7919 * k); for (let k = 0; k < 400; k++) add(20000001 + 7919 * k); for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k);
    ok("!! THE AUDIT: 200 lives 50000001 + 7919 k, none the compass rounds' audit, training or fixed battery's, nor a scoping life (1,156 different seeds)", H.AUDIT.length === 200 && H.AUDIT[0] === 50000001 && H.AUDIT[199] === 50000001 + 7919 * 199 && clash === 0 && lives.size === 200 + 200 + 100 + 400 + 240 + 16);
    const r = (arm, s) => H.committed(arm, s, compass, balanced);
    ok("!! EACH ARM'S FLY IS ITS COMMITTED RECORD'S: PLASTIC, FROZEN and PSHUF from the compass round's file, PSUM and PEVEN from the balanced round's, each on its own wiring; an arm or draw that is not one is refused by name",
        r("PLASTIC", 4) === compass.lines.find((x) => x.kind === "draw" && x.arm === "PLASTIC" && x.s === 4) && r("PEVEN", 9) === balanced.lines.find((x) => x.kind === "draw" && x.arm === "PEVEN" && x.s === 9) && r("FROZEN", 2).weightCount === 1 &&
        PF.hashEdges(Array.from(H.policyOf("PSUM", 5).w0)) === PF.hashEdges(Array.from(B.policyOf("PSUM", 5).w0)) && PF.hashEdges(Array.from(H.policyOf("PSHUF", 5).w0)) === PF.hashEdges(Array.from(V.policyOf("PSHUF", 5).w0)) && H.policyOf("FROZEN", 1).plastic === false &&
        throws(() => H.committed("KEEP16", 1, compass, balanced), /no arm KEEP16/) && throws(() => H.policyOf("PLASTIC", 13), /a draw is 1 to 12/));
    const fl = H.floors(TWO);
    ok("!! THE FLOORS: vision off, the start, the hand rule and the start told the true heading, each a homing life flown by hand", near(fl.off, (byHand(V.policyOf("FROZEN", 1).setParams([0]), TWO[0]) + byHand(V.policyOf("FROZEN", 1).setParams([0]), TWO[1])) / 2, 1e-12) &&
        near(fl.hand, (byHand(V.policyOf("PLASTIC", 1).setParams(V.HAND), TWO[0]) + byHand(V.policyOf("PLASTIC", 1).setParams(V.HAND), TWO[1])) / 2, 1e-12) && near(fl.start, (byHand(V.policyOf("FROZEN", 1), TWO[0]) + byHand(V.policyOf("FROZEN", 1), TWO[1])) / 2, 1e-12) && fl.told > 0.9, `told ${fl.told.toFixed(3)}`);
    const note = src("brain/FLY_FINDS_HOME_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: nothing trained; the committed files and their hashes; home from tick 1,000; the score; the home vector; draws 1 to 12; the audit; V, P2, T1, A, B, H",
        /\*\*Said first: no fly is trained here\.\*\*/.test(note) && /sha256 363cdbf5147d4137/.test(note) && /sha256 24a6bb78dfd9a39d/.test(note) && /\*\*From tick 1,000 it goes home\.\*\*/.test(note) && /\*\*1 less the closest it comes to its door after tick 1,000, over how far it was at tick 1,000, held at 0 and above\*\*/.test(note) &&
        /\*\*Its home vector is the sum of \(cos phi, sin phi\) over every tick, after each tick's turn\.\*\*/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) && /seeds 50000001 \+ 7919 k\*\*/.test(note) && /\*\*V: PLASTIC against vision off\*\* \(sign test\)/.test(note) && /\*\*P2: PLASTIC against FROZEN\*\* \(rank sum\)/.test(note) &&
        /\*\*T1: PLASTIC against PSHUF\*\* \(rank sum\)/.test(note) && /\*\*A: PSUM against PLASTIC\*\* \(rank sum\)/.test(note) && /\*\*B: PEVEN against PLASTIC\*\* \(rank sum\)/.test(note) && /\*\*H: PLASTIC against the hand rule\*\* \(sign test\)/.test(note));
});

console.log("\n4. ONE AUDIT (2 lives)");
section(() => {
    const rec = H.auditOne("PSUM", 7, compass, balanced, TWO), w = PF.unpackWeights(H.committed("PSUM", 7, compass, balanced).weights), hand = (byHand(B.policyOf("PSUM", 7).setParams(w), TWO[0]) + byHand(B.policyOf("PSUM", 7).setParams(w), TWO[1])) / 2;
    ok("!! A RECORD'S SCORE IS A HOMING LIFE FLOWN HERE BY HAND (the committed PSUM draw 7, the compass env, a position and a home vector summed here); it carries the committed weights' hash and course score",
        near(rec.home, hand, 1e-12) && rec.weightsHash === H.committed("PSUM", 7, compass, balanced).weightsHash && rec.course === H.committed("PSUM", 7, compass, balanced).score && rec.kind === "fly" && rec.arm === "PSUM" && rec.s === 7, `${rec.home.toFixed(4)}`);
});

section(() => {
    const w = PF.unpackWeights(H.committed("PEVEN", 2, compass, balanced).weights), f = H.flyOf("PEVEN", 2, w), told = H.homeScore(H.flyOf("PEVEN", 2, w), [TWO[0]], true), plain = H.homeScore(f, [TWO[0]]);
    ok("flyOf is the arm's fly with the weights given; homeScore is the mean of homing lives flown by hand, and told (phi set to the true heading before each tick) comes nearer home than the same fly untold",
        J(Array.from(f.getParams())) === J(Array.from(Float32Array.from(w))) && near(plain, byHand(B.policyOf("PEVEN", 2).setParams(w), TWO[0]), 1e-12) && told > plain && told > 0.9, `${plain.toFixed(3)} untold, ${told.toFixed(3)} told`);
});

console.log("\n5. THE RECORDS (made here)");
section(() => {
    const rec = (arm, s, home) => { const c = H.committed(arm, s, compass, balanced); return { kind: "fly", arm, s, weightsHash: c.weightsHash, home, course: c.score }; };
    const flo = { kind: "floors", off: 0.46, start: 0.43, hand: 0.556, told: 0.99 };
    const file = (f, re = (out) => ({ kind: "recheck", arm: "PLASTIC", s: 1, home: out.find((r) => r.arm === "PLASTIC" && r.s === 1).home })) => { const out = []; for (const arm of H.ARMS) for (const s of H.SEEDS) out.push(rec(arm, s, f(arm, s))); out.push(re(out), flo); return out; };
    // PLASTIC 0.560 + s/1e4; PSHUF above it; PSUM interleaved with it; PEVEN above; FROZEN below; the hand rule under every PLASTIC fly
    const sc = (arm, s) => ({ PLASTIC: 0.56, PSHUF: 0.575, PSUM: 0.56 + 0.00005, PEVEN: 0.575, FROZEN: 0.45 })[arm] + s / 1e4, good = file(sc), R = H.reading(good, compass, balanced), lines = H.readingLines(R).join("\n");
    ok("!! a file of 60 flies with PLASTIC draw 1 audited twice and the floors passes every check; a fly missing, a fly with another fly's weights, a course score not its committed one, a second audit that differs, and a committed file that is not the one committed each fail by name",
        H.checkRecords(good, compass, balanced).length === 0 && good.length === 62 && /^the checks hold: both committed files/.test(lines) && H.checkRecords(good.filter((r) => !(r.arm === "PEVEN" && r.s === 12)), compass, balanced).some((x) => /PEVEN draw 12 is there 0 times/.test(x)) &&
        H.checkRecords(good.map((r) => (r.arm === "PSHUF" && r.s === 5 ? { ...r, weightsHash: H.committed("PSHUF", 6, compass, balanced).weightsHash } : r)), compass, balanced).some((x) => /PSHUF draw 5's weights are not its committed record's/.test(x)) &&
        H.checkRecords(good.map((r) => (r.arm === "PSUM" && r.s === 2 ? { ...r, course: r.course + 1e-9 } : r)), compass, balanced).some((x) => /PSUM draw 2's course score is not its committed record's/.test(x)) &&
        J(H.checkRecords(file(sc, () => ({ kind: "recheck", arm: "PLASTIC", s: 1, home: 0.1 })), compass, balanced)) === J(["PLASTIC draw 1 audited a second time is not there once with the same score"]) &&
        H.checkRecords(good, { ...compass, sha256: "0".repeat(64) }, balanced).some((x) => /the compass round's file is not the one committed/.test(x)) && H.checkRecords(good, compass, { ...balanced, sha256: "1".repeat(64) }).some((x) => /the balanced round's file is not the one committed/.test(x)) &&
        H.checkRecords(good, compass, { ...balanced, lines: balanced.lines.filter((r) => !(r.arm === "PSUM" && r.s === 3)) }).some((x) => /the balanced round's file fails its own checks: PSUM draw 3 is there 0 times/.test(x)));
    ok("!! V AND H ARE PLASTIC AGAINST VISION OFF AND THE HAND RULE (sign tests), P2 PLASTIC AGAINST FROZEN, T1 AGAINST PSHUF, A PSUM AGAINST PLASTIC, B PEVEN AGAINST PLASTIC (exact rank sums): V BETTER and H BETTER (12 above), P2 BETTER (222), T1 WORSE (78), A CANNOT, B BETTER (222)",
        R.V.word === H.WORDS.V[0] && R.V.above === 12 && R.V.ref === 0.46 && R.H.word === H.WORDS.H[0] && R.H.ref === 0.556 && R.P2.word === H.WORDS.P2[0] && R.P2.sumA === 222 && R.T1.word === H.WORDS.T1[1] && R.T1.sumA === 78 && R.T1.b === "PSHUF" && R.A.word === H.WORDS.A[2] && R.A.a === "PSUM" && R.A.b === "PLASTIC" && R.B.word === H.WORDS.B[0] && R.B.a === "PEVEN" &&
        /T1 \(PLASTIC against PSHUF\): PLASTIC's ranks sum to 78 \(the middle is 150\)/.test(lines) && /THE PLASTIC FLY ON THE REAL WIRING FINDS HOME WORSE THAN ONE ON A SHUFFLE OF IT/.test(lines) && R.arms.PLASTIC.n === 12 && near(R.arms.PLASTIC.course, 0.6464));
    const tied = H.reading(file((arm, s) => (arm === "PSHUF" ? sc("PLASTIC", s) : sc(arm, s))), compass, balanced), noFl = H.reading(good.filter((r) => r.kind !== "floors"), compass, balanced);
    ok("PLASTIC equal to PSHUF fly for fly is 12 ties and CANNOT (ties count against the claim); with a failed check no reading is weighed and the first line says so", tied.T1.ties === 12 && tied.T1.word === H.WORDS.T1[2] && noFl.V === null && noFl.B === null && /^A CHECK FAILED/.test(H.readingLines(noFl)[0]));
});

console.log("\n6. THE COMMAND");
section(() => {
    const file = path.join(ENG, H.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "KEEP16", "1"], ["job", "PLASTIC", "x"], ["job", "PLASTIC", "0"], ["job", "PEVEN", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for the five arms and draws 1 to 12 -- and nothing else", J(H.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(H.parseArgs(["read"])) === J({ cmd: "read" }) && J(H.parseArgs(["job", "PSUM", "12"])) === J({ cmd: "job", arm: "PSUM", s: 12 }) && no.every((a) => H.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyHome.mjs");
    ok("!! the command is this round's -- its library and results file, the two committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, audits only what the file does not hold, and audits PLASTIC draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyHome\.mjs"/.test(csrc) && /PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, PF\.COMPASS\)\)\), PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, PF\.BALANCED\)\)\)/.test(csrc) &&
        /PF\.auditOne\(args\.arm, args\.s, \.\.\.committedFiles\(\)\)/.test(csrc) && /done = new Set\(have\.filter\(\(r\) => r\.kind === "fly"\)/.test(csrc) && /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\], home: r\.home/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyHome\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyHome-selfcheck.mjs"), calls = [...me.matchAll(/H\.auditOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE AUDITS NOTHING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one audit through the round's code is of 2 lives that are not the round's; it starts no process; the file's size and time are what they were",
        calls.length === 1 && /^"PSUM", 7, compass, balanced, TWO$/.test(calls[0]) && !TWO.some((x) => H.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n7. THE VERDICT (the whole results file was committed at 6ac4494f before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, H.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = H.reading(lines, compass, balanced), A = R.arms, F = R.floors;
    const of = (a) => lines.filter((r) => r.kind === "fly" && r.arm === a).sort((x, y) => x.s - y.s), home = (a) => of(a).map((r) => r.home), rec = (a, s) => of(a).find((r) => r.s === s);
    ok("!! the results file is the one the run wrote: 62 records, sha256 e04f2c0b519d9c76... (one start, 36.2 minutes on one process)", lines.length === 62 && createHash("sha256").update(bytes).digest("hex") === "e04f2c0b519d9c76cba1d466b93cc1a909e0bc43dde01b5612c77ceec64de0a3");
    ok("!! THE CHECKS HOLD: both committed files as committed and passing their own checks, 60 flies each once with their committed weights and course scores, PLASTIC draw 1 audited twice the same; the floors -- vision off 0.4559, the start 0.4568, the hand rule 0.5551, the start told the true heading 0.9948",
        R.checks.length === 0 && near(F.off, 0.4559) && near(F.start, 0.4568) && near(F.hand, 0.5551) && near(F.told, 0.9948) && lines.find((r) => r.kind === "recheck").home === rec("PLASTIC", 1).home);
    ok("!! *** V: THE PLASTIC FLY ON THE REAL WIRING FINDS HOME BETTER THAN PATH INTEGRATION ALONE *** -- 12 of 12 above vision off's 0.4559 (p 0.00049); P2 BETTER THAN THE FLY WHOSE MAP DOES NOT LEARN -- ranks 222, every one above every one (p 7.4e-7)",
        R.V.word === H.WORDS.V[0] && R.V.above === 12 && R.V.p === 2 ** -11 && R.V.ref === F.off && R.P2.word === H.WORDS.P2[0] && R.P2.sumA === 222 && Math.min(...home("PLASTIC")) > Math.max(...home("FROZEN")));
    ok("!! *** T1: THE REAL WIRING'S HANDICAP AT HOLDING A COURSE DOES NOT CARRY OVER TO FINDING HOME *** -- PLASTIC against PSHUF ranks 145 (p 0.80); A, PSUM against PLASTIC, ranks 148 (p 0.93); B, PEVEN against PLASTIC, ranks 112 (p 0.028, PEVEN the lower) -- all three CANNOT",
        R.T1.word === H.WORDS.T1[2] && R.T1.sumA === 145 && near(R.T1.p, 0.7987, 5e-5) && R.A.word === H.WORDS.A[2] && R.A.sumA === 148 && near(R.A.p, 0.9323, 5e-5) && R.B.word === H.WORDS.B[2] && R.B.sumA === 112 && near(R.B.p, 0.0284, 5e-5));
    ok("!! H: THE PLASTIC FLY FINDS HOME WORSE THAN THE RULE SET BY HAND -- 0 of 12 above its 0.5551 (p 0.00049)", R.H.word === H.WORDS.H[1] && R.H.above === 0 && R.H.below === 12 && R.H.p === 2 ** -11 && R.H.ref === F.hand);
    ok("!! the arms at home (mean, sd, least, most; their course scores): PLASTIC 0.5493 0.0033 0.5438 0.5544 (0.6464) | FROZEN 0.4520 (0.4948) | PSHUF 0.5507 0.0073 0.5388 0.5658 (0.6765) | PSUM 0.5491 0.0027 (0.6434) | PEVEN 0.5457 0.0035 (0.6719): course differences of 0.03 shrink to 0.005 at home",
        near(A.PLASTIC.mean, 0.5493) && near(A.PLASTIC.sd, 0.0033) && near(A.PLASTIC.min, 0.5438) && near(A.PLASTIC.max, 0.5544) && near(A.FROZEN.mean, 0.4520) && near(A.PSHUF.mean, 0.5507) && near(A.PSHUF.sd, 0.0073) && near(A.PSHUF.min, 0.5388) && near(A.PSHUF.max, 0.5658) && near(A.PSUM.mean, 0.5491) && near(A.PSUM.sd, 0.0027) && near(A.PEVEN.mean, 0.5457) && near(A.PEVEN.sd, 0.0035) &&
        near(A.PLASTIC.course, 0.6464) && near(A.PSHUF.course, 0.6765) && near(A.PSUM.course, 0.6434) && near(A.PEVEN.course, 0.6719) && Math.max(...["PLASTIC", "PSHUF", "PSUM", "PEVEN"].map((a) => A[a].mean)) - Math.min(...["PLASTIC", "PSHUF", "PSUM", "PEVEN"].map((a) => A[a].mean)) < 0.0051);
    ok("described, not registered: WITHIN EACH ARM THE FLIES THAT HOLD A COURSE BEST HOME BEST -- Spearman of course against home PLASTIC 0.94, FROZEN 0.57, PSHUF 0.84, PSUM 0.69, PEVEN 0.98",
        near(A.PLASTIC.spearman, 0.944, 5e-3) && near(A.FROZEN.spearman, 0.566, 5e-3) && near(A.PSHUF.spearman, 0.839, 5e-3) && near(A.PSUM.spearman, 0.692, 5e-3) && near(A.PEVEN.spearman, 0.979, 5e-3), ["PLASTIC", "FROZEN", "PSHUF", "PSUM", "PEVEN"].map((a) => A[a].spearman.toFixed(3)).join(" "));
    const again = (a, s) => { const c = H.committed(a, s, compass, balanced); return H.homeScore(H.flyOf(a, s, PF.unpackWeights(c.weights))); };
    ok("!! RE-AUDITED AFTER THE READING: PSHUF draw 7 (the arm's most) gives its score again on the 200 lives to the bit, and so does the hand rule's floor", rec("PSHUF", 7).home === A.PSHUF.max && again("PSHUF", 7) === rec("PSHUF", 7).home && H.homeScore(V.policyOf("PLASTIC", 1).setParams(V.HAND)) === F.hand);
    const errs = (a, s) => { const fly = H.flyOf(a, s, PF.unpackWeights(H.committed(a, s, compass, balanced).weights)), env = new HE.HomeEnv(), h = new HF.HomingFly(fly); let off = 0, wob = 0;
        for (const L of H.AUDIT.slice(0, 40)) { let o = env.reset(L), done = false, sx = 0, sy = 0, n = 0; while (!done) { const r = env.step(h.act(o)); if (env.t > 500) { const e = CE.wrap(fly.phi - env.th); sx += Math.cos(e); sy += Math.sin(e); n++; } o = r.obs; done = r.done; }
            off += Math.abs(Math.atan2(sy, sx)); wob += Math.sqrt(-2 * Math.log(Math.hypot(sx, sy) / n)); }
        return [off / 40 * 180 / Math.PI, wob / 40 * 180 / Math.PI]; };
    const E = Object.fromEntries(["PLASTIC", "PSUM", "PSHUF", "PEVEN"].map((a) => [a, [1, 2].map((s) => errs(a, s))])), offs = (as) => as.flatMap((a) => E[a].map((e) => e[0])), wobs = (as) => as.flatMap((a) => E[a].map((e) => e[1]));
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED -- WHY: the fly's heading error after tick 500, split into each life's mean (its offset) and its spread about that mean (its wobble), on 40 audit lives, draws 1 and 2: the real sums' arms (PLASTIC, PSUM) carry 22.4 to 23.4 degrees of offset, the even and shuffled ones (PSHUF, PEVEN) 19.6 to 20.9; the wobble 24.1 to 24.2 against 23.4 to 23.7",
        Math.min(...offs(["PLASTIC", "PSUM"])) > Math.max(...offs(["PSHUF", "PEVEN"])) && near(Math.min(...offs(["PLASTIC", "PSUM"])), 22.4, 0.06) && near(Math.max(...offs(["PLASTIC", "PSUM"])), 23.4, 0.06) && near(Math.min(...offs(["PSHUF", "PEVEN"])), 19.6, 0.06) && near(Math.max(...offs(["PSHUF", "PEVEN"])), 20.9, 0.06) &&
        near(Math.min(...wobs(["PLASTIC", "PSUM"])), 24.1, 0.06) && near(Math.max(...wobs(["PLASTIC", "PSUM"])), 24.2, 0.06) && near(Math.min(...wobs(["PSHUF", "PEVEN"])), 23.4, 0.06) && near(Math.max(...wobs(["PSHUF", "PEVEN"])), 23.7, 0.06),
        Object.entries(E).map(([a, v]) => `${a} ${v.map((e) => e.map((x) => x.toFixed(2)).join("/")).join(" ")}`).join(" | "));
    const note = src("brain/FLY_FINDS_HOME_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 11. The result"));
    ok("the expectations, written before the code, against what came: V BETTER (95), P2 BETTER (95), A and B CANNOT (45 each) came; T1 came CANNOT (30; WORSE was 70), H came WORSE (the 5 left), and PLASTIC's mean 0.5493 fell just under the 0.55 to 0.58 given",
        /V: \*\*BETTER about 95 percent\*\*\. P2: \*\*BETTER about 95\*\*\. T1: \*\*WORSE about 70\*\*, CANNOT 30\. A: BETTER about 55, CANNOT 45\. B: BETTER about 55, CANNOT 45\. H: BETTER about 55, CANNOT 40\. PLASTIC's mean between 0\.55 and 0\.58, about 70\./.test(flat) &&
        R.V.word === H.WORDS.V[0] && R.P2.word === H.WORDS.P2[0] && R.A.word === H.WORDS.A[2] && R.B.word === H.WORDS.B[2] && R.T1.word === H.WORDS.T1[2] && R.H.word === H.WORDS.H[1] && A.PLASTIC.mean < 0.55);
    ok("the registration's RESULT SECTION (section 11) carries the six readings' words, the commit the file was read at, the expectations that did not come, what section 6 said such a reading would say, the measurement after the reading said as such with the gate's numbers, and what it does not mean",
        /## 11\. The result/.test(note) && ["V", "P2", "T1", "A", "B", "H"].every((t) => res.includes(`**${t}: ${R[t].word}**`)) && /6ac4494f/.test(res) && /T1, H and PLASTIC's mean did not/.test(res) && /the handicap at holding a course does not carry over to finding home/.test(res) &&
        /Measured after the reading \(not registered; the gate recomputes it\)/.test(res) && /22\.4 to 23\.4 degrees/.test(res) && /19\.6 to 20\.9/.test(res) && /What it does not mean/.test(res) && /not what training for homing would give/.test(res));
});

console.log(`\nflyHome-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
