// WebGLEngine/tools/ship/flyCompassTrainer-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCompassTrainer-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE COMPASS TRAINER ROUND (registered in brain/FLY_COMPASS_TRAINER_WIP.md before brain/rl/dockPolicy.js's two new options, tools/ship/flyCompassTrainer.mjs and
// tools/ship/takeFlyCompassTrainer.mjs existed): is the compass round's shortfall below the hand rule the trainer's choice of point?
//   1  THE TRAINER'S OPTIONS    without them nothing changes; the battery never steers the walk; keep "last" hands back the walk's last point; the best is a point of the walk
//   2  THE ROUND'S NUMBERS      the compass round's recipe, draws, audit, hand rule and fly; the arms; each arm's lives, none another's; the compass file named by its hash; the
//                               floors; the registration says the same
//   3  ONE TRAINING EACH        a LAST record's weights are the trainer's from a call made here by hand; a BAT64 record's are the walk's point at the iteration it says it kept
//   4  THE RECORDS              24 draws; the compass round's file; K, L, H64, HL, draw for draw and against the hand rule
//   5  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 25, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 4; every one red by name, NONE 0 red (the number is the rows red):
//   THE TRAINER (brain/rl/dockPolicy.js): O1 the battery's first seed is ignored 1 | O2 keep last hands back the best 3 | O3 the battery steers the walk 2 | O4 any keep is last 2
//   THE ROUND: F1 BAT64 on 16 lives 2 | F2 BAT64's battery at the fixed 5000 2 | F3 the draws' batteries 1000 apart 2 | F4 LAST keeps the best 2 | F5 the fly is the shuffle 2 | F6 keptAt is the
//   first iteration 1 | F7 K against the hand rule 1 | F8 BETTER and WORSE swapped 2 | F9 ties dropped from the paired test 1 | F10 the hand rule not checked against the compass round's 1 |
//   F11 KEEP16 is the compass round's PSHUF 2 | F12 the recheck is of BAT64 3 | F13 alpha is 0.05 2 | F14 the round writes the compass round's file 1 | F15 the recipe is 40 iterations 3 |
//   F2b BAT64's battery on the audit lives 3 | F3b the draws' batteries share lives 3
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads the compass round's library 1 | C4 the draws before the arms 1.  THE NOTE: N1 its
//   draws are 13 to 24 1 | N2 its battery from 50000000 1 | N3 its K is against the hand rule 1 | N4 its tests are rank sums 1
//   A FINDING ABOUT TWO SABOTAGES, NOT THE GATE: F2 and F3 went red by name but never reached the row that says no life is two things. A base of 5000 does not put a draw's battery on
//   the fixed one, and draws 1000 apart interleave without sharing a seed (1000 is not a multiple of 17). F2b (the battery starting on the first audit life) and F3b (draws 170 apart, so
//   each draw's battery starts on the last one's eleventh life) were added and reach it.
//   TWO ROWS OF MINE WERE WRONG WHEN FIRST RUN: the source row counted `opts.batteryBase` and `opts.keep` twice each (the comment names them without `opts.`), and BAT64's tiny battery on
//   draw 901 starts at 49016307, not 49009007 (10007 x 901 is 9,016,307).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as T from "./flyCompassTrainer.mjs";
import * as V from "./flyCompass.mjs";
import * as PF from "./paintingFly.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as CF from "../../brain/rl/compassFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), H = (p) => PF.hashWeights(p);
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];

console.log("flyCompassTrainer-selfcheck -- the compass trainer round (the same walk, a different point kept: the best on 64 lives of the draw's own, the walk's last point): the options, the numbers, the trainings, the records, the command\n");

console.log("1. THE TRAINER'S OPTIONS (brain/rl/dockPolicy.js; tried on its own docking task, which is fast)");
section(() => {
    const base = { iters: 3, pop: 6, trainEps: 2, batteryEps: 3, freshEpisodes: true, seed: 11 }, tr = (o) => trainDockES({ ...base, ...o });
    const plain = tr({}), plain2 = tr({ batteryBase: undefined, keep: undefined }), at5000 = tr({ batteryBase: 5000 }), other = tr({ keep: "best" });
    ok("!! WITHOUT THE OPTIONS NOTHING CHANGES: no batteryBase, batteryBase undefined and batteryBase 5000 (evaluate()'s own default) give the same weights and the same history to the bit; any keep but \"last\" is the best, as before",
        H(plain.params) === H(plain2.params) && H(plain.params) === H(at5000.params) && H(plain.params) === H(other.params) && J(plain.history) === J(plain2.history) && J(plain.history) === J(at5000.history) && J(plain.best) === J(at5000.best));
    const L = [1, 2, 3].map((k) => tr({ iters: k, keep: "last" })), Lb = tr({ keep: "last", batteryEps: 7, batteryBase: 777 }), moved = tr({ batteryBase: 777 }), moved64 = tr({ batteryEps: 9, batteryBase: 91000 });
    ok("!! THE BATTERY NEVER STEERS THE WALK: the walk's last point after 3 iterations is the same on another battery of another size; and the point kept on any battery is one of the walk's three points (the walk with 1, 2 and 3 iterations kept last)",
        H(Lb.params) === H(L[2].params) && [plain, moved, moved64].every((r) => L.some((l) => H(l.params) === H(r.params))) && new Set(L.map((l) => H(l.params))).size === 3);
    ok("keep \"last\" hands back the walk's last point, a copy (changing it changes nothing in the trainer), with the history and the best evaluation as before", L[2].params instanceof Float32Array && J(Lb.history.map((h) => h.it)) === J([0, 1, 2]) && Lb.best && Number.isFinite(Lb.best.avgReturn));
    const lib = src("brain/rl/dockPolicy.js");
    ok("the source says so: the battery's evaluation passes `seedBase: opts.batteryBase` and nothing else new; `keep: \"last\"` returns before the best is returned, and the best's return line is as it was",
        /const ev = evaluate\(theta, \{ \.\.\.evOpts, episodes: opts\.batteryEps \|\| 24, seedBase: opts\.batteryBase \}\);/.test(lib) && /if \(opts\.keep === "last"\) return \{ params: theta\.slice\(\), history, best: best\.ev \};\n    return \{ params: best\.params, history, best: best\.ev \};/.test(lib) &&
        (lib.match(/opts\.batteryBase/g) || []).length === 1 && (lib.match(/opts\.keep\b/g) || []).length === 1);
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const cbytes = fs.readFileSync(path.join(ENG, T.COMPASS));
    ok("!! THE COMPASS ROUND'S RECIPE, DRAWS, AUDIT, ALPHA AND HAND RULE; the arms BAT64 and LAST with 3 weights each, the lead LAST; this round's own results file; the compass round's file named by the sha256 it was committed with (363cdbf5...) -- and it has that hash today",
        T.RECIPE === V.RECIPE && T.SEEDS === V.SEEDS && T.AUDIT === V.AUDIT && T.ALPHA === 0.01 && T.HAND === V.HAND && J(T.HAND) === J([1, 0, 1]) && J(T.ARMS) === J(["BAT64", "LAST"]) && T.LEAD === "LAST" && J(T.WEIGHTS) === J({ BAT64: 3, LAST: 3 }) && T.RESULTS === "brain/flyCompassTrainerRound.jsonl" &&
        T.COMPASS === V.RESULTS && T.COMPASS_SHA256 === "363cdbf5147d4137ad2b6d3de26e0e14ca7709a75e77aaad9317c15cad6c0527" && createHash("sha256").update(cbytes).digest("hex") === T.COMPASS_SHA256 && T.compassOf(cbytes).sha256 === T.COMPASS_SHA256 && T.compassOf(cbytes).lines.length === 38);
    ok("!! EACH ARM'S LIVES AND OPTIONS: BAT64 keeps its point on 64 lives from 40000000 + 10007 x draw (batteryEps 64, batteryBase), LAST on the recipe's 16 at the trainer's fixed 5000 and keeps the walk's last point (keep \"last\"); an arm or draw that is not one is refused by name",
        T.BAT_EPS === 64 && T.BAT_BASE === 40000000 && T.BAT_STEP === 10007 && J(T.batteryOf("BAT64", 3)) === J({ eps: 64, base: 40030021 }) && J(T.batteryOf("LAST", 3)) === J({ eps: 16, base: null }) &&
        J(T.optionsOf("BAT64", 12)) === J({ batteryEps: 64, batteryBase: 40120084 }) && J(T.optionsOf("LAST", 1)) === J({ keep: "last" }) && throws(() => T.batteryOf("KEEP16", 1), /no arm KEEP16/) && throws(() => T.optionsOf("LAST", 0), /whole number from 1/) && throws(() => T.trainOne("PLASTIC", 1), /no arm PLASTIC/));
    const lives = (base, n, step = 17) => Array.from({ length: n }, (_, k) => base + step * k), train = []; for (let it = 0; it < 60; it++) train.push(...lives(5000 + 104729 * (it + 1), 4));
    const bats = T.SEEDS.map((s) => lives(T.batteryOf("BAT64", s).base, 64)), sets = { train, fixed: lives(5000, 16), audit: [...T.AUDIT], scoping: lives(20000001, 400, 7919) }, all = new Set();
    let clash = 0; for (const v of [...Object.values(sets), ...bats]) for (const x of v) { if (all.has(x)) clash++; all.add(x); }
    ok("!! NO LIFE IS TWO THINGS: the 12 draws' 64-life batteries (768 lives), the 240 training lives of a walk, the fixed 16, the 200 audit lives and the 400 scoping lives the registration measured on are 1,624 different seeds",
        clash === 0 && all.size === 768 + 240 + 16 + 200 + 400 && J(sets.audit.slice(0, 2)) === J([900001, 907920]));
    const few = T.AUDIT.slice(0, 2), fl = T.floors(few);
    ok("!! THE FLOORS: vision off, the start and the hand rule are the compass library's flies (this round's file must carry the compass round's numbers to the bit)",
        fl.kind === "floors" && fl.off === V.auditScore(V.policyOf("FROZEN", 1).setParams([0]), few) && fl.start === V.auditScore(V.policyOf("FROZEN", 1), few) && fl.hand === V.auditScore(V.policyOf("PLASTIC", 1).setParams(V.HAND), few) && J(Object.keys(fl)) === J(["kind", "off", "start", "hand"]));
    const note = src("brain/FLY_COMPASS_TRAINER_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: draws 1 to 12; BAT64's 64 lives from 40000000 + 10007 s; LAST the walk's last point; the two options; K, L, H64 and HL as sign tests draw for draw and against the hand rule; LAST draw 1 trained a second time; the compass file's hash",
        /\*\*draws 1 to 12\*\*/.test(note) && /\*\*the best on 64 lives of the draw's own\*\* \(seeds 40000000 \+ 10007 s \+ 17 k\)/.test(note) && /\*\*the walk's last point\*\* \(iteration 59\)/.test(note) && /`batteryBase` \(the battery's first seed; 5000 unless given\) and `keep: "last"`/.test(note) &&
        /\*\*K: BAT64 against KEEP16\*\*, draw for draw/.test(note) && /\*\*L: LAST against KEEP16\*\*, draw for draw/.test(note) && /\*\*H64: BAT64 against the hand rule\*\* \(the compass round's committed 0\.6674/.test(note) && /\*\*HL: LAST against the hand rule\.\*\*/.test(note) &&
        /\*\*LAST draw 1 is trained a second time\.\*\*/.test(note) && /sha256 363cdbf5147d4137/.test(note) && /alpha 0\.01, exact two-sided sign tests, ties against the claim/.test(note));
});

console.log("\n3. ONE TRAINING EACH (2 iterations, 4 flies tried, 1 life each, on draw 901)");
section(() => {
    const byHand = (o) => trainDockES({ envFactory: () => new CE.CompassEnv(), obsDim: 284, actDim: 1, maxSteps: 1500, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new CF.CompassFly({ edges: CF.REAL }), ...o });
    const last = T.trainOne("LAST", 901, TINY, TINY_AUDIT), walk = [1, 2].map((k) => byHand({ iters: k, keep: "last" }));
    ok("!! A LAST RECORD'S WEIGHTS ARE THE TRAINER'S FROM A CALL MADE HERE BY HAND (the compass round's PLASTIC fly on the real wiring; the compass life; fresh lives; keep \"last\"), to the hash; it kept the last iteration; its lives are the recipe's",
        H(walk[1].params) === last.weightsHash && last.keptAt === 1 && last.weightCount === 3 && J(last.battery) === J({ eps: 16, base: null }) && J(last.recipe) === J(TINY) && last.kind === "draw" && last.arm === "LAST" && last.s === 901 && Number.isFinite(last.rates.c));
    const bat = T.trainOne("BAT64", 901, TINY, TINY_AUDIT), w = PF.unpackWeights(bat.weights);
    ok("!! A BAT64 RECORD'S WEIGHTS ARE THE WALK'S POINT AT THE ITERATION IT SAYS IT KEPT (the same walk, kept on its own 64 lives), and the trainer by hand with those lives gives them again",
        [0, 1].includes(bat.keptAt) && H(walk[bat.keptAt].params) === bat.weightsHash && H(byHand({ batteryEps: 64, batteryBase: T.BAT_BASE + T.BAT_STEP * 901 }).params) === bat.weightsHash && J(bat.battery) === J({ eps: 64, base: 49016307 }), `kept iteration ${bat.keptAt}`);
    ok("each tiny training's weights give its score again", V.auditScore(V.policyOf("PLASTIC", 901).setParams(w), TINY_AUDIT) === bat.score && V.auditScore(V.policyOf("PLASTIC", 901).setParams(PF.unpackWeights(last.weights)), TINY_AUDIT) === last.score, `${bat.score.toFixed(4)}, ${last.score.toFixed(4)}`);
});

console.log("\n4. THE RECORDS (made here; KEEP16 is the compass round's PLASTIC as committed)");
section(() => {
    const compass = T.compassOf(fs.readFileSync(path.join(ENG, T.COMPASS))), keep = (s) => compass.lines.find((r) => r.kind === "draw" && r.arm === "PLASTIC" && r.s === s), cfl = compass.lines.find((r) => r.kind === "floors");
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 10, 20, 30, 40, 50, 59][k], ret: 0.5 + k / 100 })), wts = (s) => Float32Array.from([1 + s / 100, 0, 1]);
    const rec = (arm, s, score) => ({ kind: "draw", arm, s, recipe: { ...T.RECIPE }, battery: T.batteryOf(arm, s), weightCount: 3, weights: PF.packWeights(wts(s)), weightsHash: H(wts(s)), rates: { a: 0.01, b: 0, c: 1e-5 }, keptAt: arm === "LAST" ? 59 : 4, score, history: hist });
    const flo = () => ({ kind: "floors", off: cfl.off, start: cfl.start, hand: cfl.hand });
    const file = (b, l, first = 1) => { const out = []; for (const arm of T.ARMS) for (const s of T.SEEDS) out.push(rec(arm, s, (arm === "BAT64" ? b : l)(s))); out.push({ kind: "recheck", arm: "LAST", s: first, weightsHash: out.find((r) => r.arm === "LAST" && r.s === first).weightsHash }, flo()); return out; };
    // BAT64 a hair either side of the hand rule (every committed KEEP16 fly is below it); LAST a hair below KEEP16 on draws 1 to 9 and above on 10 to 12
    const hair = (s) => (s % 2 ? 1e-4 : -1e-4), bF = (s) => cfl.hand + hair(s), lF = (s) => keep(s).score + (s <= 9 ? -1e-6 : 1e-6), good = file(bF, lF), R = T.reading(good, compass), lines = T.readingLines(R).join("\n");
    ok("!! a file of 24 draws with LAST draw 1 a second time and the compass round's floors passes every check; a draw missing, BAT64 kept on the fixed 16, LAST keeping iteration 58, a second training of draw 2, a hand rule one part in 10^15 off, and a compass file that is not the committed one each fail by name",
        T.checkRecords(good, compass).length === 0 && good.length === 26 && /^the checks hold: the compass round's file as committed/.test(lines) && T.checkRecords(good.filter((r) => !(r.arm === "BAT64" && r.s === 12)), compass).some((x) => /BAT64 draw 12 is there 0 times/.test(x)) &&
        T.checkRecords(good.map((r) => (r.arm === "BAT64" && r.s === 5 ? { ...r, battery: { eps: 16, base: null } } : r)), compass).some((x) => /BAT64 draw 5 kept its point on other lives than its arm's/.test(x)) && T.checkRecords(good.map((r) => (r.arm === "LAST" && r.s === 4 ? { ...r, keptAt: 58 } : r)), compass).some((x) => /LAST draw 4 does not say which iteration it kept/.test(x)) &&
        J(T.checkRecords(file(bF, lF, 2), compass)) === J(["LAST draw 1 trained a second time is not there once with the same weights"]) && J(T.checkRecords(good.map((r) => (r.kind === "floors" ? { ...r, hand: r.hand * (1 + 1e-15) } : r)), compass)) === J(["vision off, the start and the hand rule are not the compass round's to the bit: the fly, task or audit is not the same"]) &&
        T.checkRecords(good, { ...compass, sha256: "0".repeat(64) }).some((x) => /the compass round's file is not the one committed/.test(x)) && T.checkRecords(good, { ...compass, lines: compass.lines.filter((r) => !(r.arm === "PLASTIC" && r.s === 3)) }).some((x) => /fails its own checks: PLASTIC draw 3 is there 0 times/.test(x)));
    ok("!! K IS BAT64 AGAINST KEEP16 AND L LAST AGAINST KEEP16, DRAW FOR DRAW; H64 AND HL AGAINST THE HAND RULE'S 0.6674: BAT64 a hair either side of the hand rule -> K BETTER (12 above, p 2^-11), H64 CANNOT (6 and 6); LAST a hair under KEEP16 on 9 draws -> L CANNOT (3 above, p 0.146), HL WORSE (12 below)",
        R.K.word === T.WORDS.K[0] && R.K.above === 12 && R.K.p === 2 ** -11 && R.K.a === "BAT64" && R.K.b === "KEEP16" && R.H64.word === T.WORDS.H64[2] && R.H64.above === 6 && R.H64.below === 6 && R.H64.ref === cfl.hand && R.L.word === T.WORDS.L[2] && R.L.above === 3 && R.L.below === 9 && Math.abs(R.L.p - 598 / 4096) < 1e-12 &&
        R.HL.word === T.WORDS.HL[1] && R.HL.below === 12 && R.HL.p === 2 ** -11 && Math.abs(R.arms.KEEP16.mean - 0.6464) < 5e-5 && R.arms.KEEP16.n === 12 && J(R.arms.BAT64.keptAt) === J(Array(12).fill(4)) && /K \(BAT64 against KEEP16, draw for draw\): above 12, below 0, ties 0 of 12/.test(lines) && /KEEPING THE WALK'S LAST POINT DOES WORSE THAN THE RULE SET BY HAND/.test(lines));
    const tied = T.reading(file(bF, (s) => keep(s).score + (s <= 2 ? 0 : 1e-6)), compass), tied1 = T.reading(file(bF, (s) => keep(s).score + (s <= 1 ? 0 : 1e-6)), compass), down = T.reading(file((s) => keep(s).score - 1e-6, lF), compass);
    ok("ties count against the claim: LAST above KEEP16 on 10 draws and equal on 2 is CANNOT (p 0.039), on 11 and equal on 1 BETTER (p 0.0063); BAT64 below KEEP16 on every draw is K WORSE",
        tied.L.ties === 2 && tied.L.above === 10 && tied.L.word === T.WORDS.L[2] && tied1.L.ties === 1 && tied1.L.word === T.WORDS.L[0] && Math.abs(tied1.L.p - 26 / 4096) < 1e-12 && down.K.word === T.WORDS.K[1] && down.K.below === 12);
    const noFl = T.reading(good.filter((r) => r.kind !== "floors"), compass);
    ok("with no floors, or a failed check, no reading is weighed and the first line says so", noFl.K === null && noFl.HL === null && /^A CHECK FAILED/.test(T.readingLines(noFl)[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, T.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "KEEP16", "1"], ["job", "LAST", "x"], ["job", "LAST", "0"], ["job", "BAT64", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for BAT64 or LAST and draws 1 to 12 -- and nothing else", J(T.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(T.parseArgs(["read"])) === J({ cmd: "read" }) && J(T.parseArgs(["job", "BAT64", "12"])) === J({ cmd: "job", arm: "BAT64", s: 12 }) && no.every((a) => T.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyCompassTrainer.mjs");
    ok("!! the command is this round's -- its library and results file, and the compass round's file read through compassOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, BAT64's (the longer) first, and trains THE LEAD ARM'S FIRST DRAW a second time (LAST, draw 1)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyCompassTrainer\.mjs"/.test(csrc) && !/from "\.\/flyCompass(Balanced)?\.mjs"/.test(csrc) && /PF\.reading\(linesOf\(\), PF\.compassOf\(fs\.readFileSync\(path\.join\(ENG, PF\.COMPASS\)\)\)\)/.test(csrc) &&
        /for \(const arm of PF\.ARMS\) for \(const s of PF\.SEEDS\) if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) && T.ARMS[0] === "BAT64" && /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyCompassTrainer\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyCompassTrainer-selfcheck.mjs"), calls = [...me.matchAll(/T\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its two trainings through the round's code are of 2 iterations with 4 flies tried on draw 901 (and one refused); it starts no process; the file's size and time are what they were",
        calls.length === 3 && /^"LAST", 901, TINY, TINY_AUDIT$/.test(calls[1]) && /^"BAT64", 901, TINY, TINY_AUDIT$/.test(calls[2]) && /^"PLASTIC", 1$/.test(calls[0]) && TINY.iters === 2 && TINY.pop === 4 && !T.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before,
        `${calls.length - 1} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyCompassTrainer-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
