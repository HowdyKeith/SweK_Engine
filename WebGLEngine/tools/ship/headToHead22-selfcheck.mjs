// WebGLEngine/tools/ship/headToHead22-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead22-selfcheck.mjs      (a few seconds: hand fixtures, scripted searches and short real flights)
//
// THE GATE OF tools/ship/headToHead22.mjs (Round H22 of brain/HEAD_TO_HEAD.md, registered first: where does c02 stand among twenty searches).
//   1 SETS      the ids, the twenty seeds, the basin, the picks' ranks, the seven arms.   2 BASIN  inBasin at the boundaries.
//   3 SEARCH    searchOne is H21's group F4 on this round's ids (flights, ranges, seed stream pinned, determinism).
//   4 RANK      rankOf (held-out value, ties by lower seed, refusals) and picksOf (ranks 1, 10, 20).
//   5 ARMS      armsOf and audit (order, both conditions, subset, refusals); a real law against switchboard.dropout; law0 equals the autopilot.
//   6 STATS     reachedBy, c02Rank and the registered verdict in every branch (five parts).   7 LINES   the eleven bottom lines.
//   8 CHECKS    eleven rows; a failed check says NOT WEIGHED.   9 REPORT   tables and lines.   10 SOURCE  the ids appear once; no clock, random or file.
// SABOTAGE LOG: see the mutation pass recorded below once it has run.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead22.mjs";
import * as X21 from "./headToHead21.mjs";
import * as H15 from "./headToHead15.mjs";
import * as B from "../../brain/switchboard.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead22.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*(\/\/|\/\*\*)/.test(l)).join("\n");
console.log("headToHead22-selfcheck -- Round H22\n");

sec("1. SETS");
{
    ok("!! train 22000-22023 (24), held-out 22100-22139 (40), audit 22200-22399 (200); 160 s; 300 iterations; price 0.02 (H21's); frozen", J(X.TRAIN) === '{"from":22000,"to":22023}' && J(X.HELD) === '{"from":22100,"to":22139}' && J(X.IDS) === '{"from":22200,"to":22399}' && X.SECONDS === 160 && X.ITERS === 300 && X.LAMBDA === 0.02 && X.N_SEARCHES === 20 && Object.isFrozen(X.TRAIN) && Object.isFrozen(X.HELD) && Object.isFrozen(X.IDS));
    ok("!! twenty seeds 22001-22020 in order, frozen; the box and the two fixed laws are H21's", X.SEEDS.length === 20 && X.SEEDS.every((s, i) => s === 22001 + i) && Object.isFrozen(X.SEEDS) && X.BOX === X21.BOX && J(X.LAW_C02) === "[2.2035859388880334,0.8758638340144,-0.6433501233386668,-2]" && J(X.LAW_H16) === "[1.2322693581401742,-0.061415416013719054,-0.6,-0.15850584538981266]");
    ok("!! the basin is c in [1.2, 4.0] and d at least 0.3 (frozen); the picks are best, median, worst at ranks 1, 10, 20", J(X.BASIN_C) === "[1.2,4]" && X.BASIN_D === 0.3 && Object.isFrozen(X.BASIN_C) && J(X.PICK_IDS) === '["best","median","worst"]' && J(X.PICK_RANK) === '{"best":1,"median":10,"worst":20}' && Object.isFrozen(X.PICK_IDS) && Object.isFrozen(X.PICK_RANK));
    ok("!! seven arms in order: autopilot, law0, c02, h16, best, median, worst; frozen", J(X.ARM_IDS) === '["autopilot","law0","c02","h16","best","median","worst"]' && Object.isFrozen(X.ARM_IDS));
}
sec("2. BASIN");
{
    ok("!! inBasin: the corners (c 1.2 and 4.0, d 0.3) are in; a hair out on each side is out (c 1.1999, c 4.0001, d 0.2999); c02 (2.20, 0.876) is in; a short or non-list law is out", X.inBasin([1.2, 0.3, 0, 0]) && X.inBasin([4.0, 0.3, 0, 0]) && X.inBasin([2.5, 1, 0, 0]) && !X.inBasin([1.1999, 0.5, 0, 0]) && !X.inBasin([4.0001, 0.5, 0, 0]) && !X.inBasin([2.5, 0.2999, 0, 0]) && X.inBasin(X.LAW_C02) && !X.inBasin([2, 1, 0]) && !X.inBasin(null));
    ok("!! insideBox and sAtEdge are H21's (s of -3.9401 is at the edge, -3.9399 is not)", X.insideBox === X21.insideBox && X.sAtEdge(-3.9401) && !X.sAtEdge(-3.9399));
}
const PIN1 = [3.5422, -0.3381, 0.7116, -1.5404], PIN2 = [4.6402, 0.0463, 0.8827, -1.7383];
const mkFly = (fn) => { const log = []; const f = (arm, range, secs, ev) => { const w = arm.entry().weights; log.push({ w, range, secs, ev }); const o = fn(w, range, ev); return Array.from({ length: range.to - range.from + 1 }, (_, i) => ({ key: "sb-" + (range.from + i), score: o.score, bad: false, watts: o.watts, thrust: 0.4 })); }; return { f, log }; };
sec("3. SEARCH");
{
    const fl = mkFly(() => ({ score: 0.8, watts: 5000 })), r = X.searchOne(22001, { iters: 20, flyFn: fl.f });
    ok("!! a search makes 2 x (1 + 20) flights on the TRAIN ids 22000-22023 (dark then lit) and 2 on the HELD-OUT ids 22100-22139, at 160 s; group F4; the row carries seed, law, train and held values, accepted and iterations", fl.log.length === 44 && fl.log.slice(0, 42).every((x) => J(x.range) === J(X.TRAIN) && x.secs === 160) && fl.log.slice(42).every((x) => J(x.range) === J(X.HELD)) && fl.log.filter((x, i) => i % 2 === 0).slice(0, 21).every((x) => x.ev === "dropout") && fl.log.filter((x, i) => i % 2 === 1).every((x) => x.ev === null) && r.seed === 22001 && r.group === "F4" && r.iters === 20 && r.law.length === 4 && near(r.trainScore, 0.8 - 0.02 * 5) && near(r.heldScore, 0.8 - 0.02 * 5));
    const a = X.searchOne(22007, { iters: 20, flyFn: mkFly(() => ({ score: 0.8, watts: 5000 })).f }), b = X.searchOne(22007, { iters: 20, flyFn: mkFly(() => ({ score: 0.8, watts: 5000 })).f }), c = X.searchOne(22008, { iters: 20, flyFn: mkFly(() => ({ score: 0.8, watts: 5000 })).f });
    ok("!! a search is deterministic in its seed and different seeds give different laws; all four weights are free (k moves) and the final law is inside the box", J(a.law) === J(b.law) && J(a.law) !== J(c.law) && a.law[2] !== 0 && X.insideBox(a.law) && X.insideBox(c.law));
    const p1 = X.searchOne(22001, { iters: 20, flyFn: mkFly(() => ({ score: 0.8, watts: 5000 })).f }).law.map((v) => +v.toFixed(4)), p2 = X.searchOne(22020, { iters: 20, flyFn: mkFly(() => ({ score: 0.8, watts: 5000 })).f }).law.map((v) => +v.toFixed(4));
    ok("!! the random stream is pinned: seed 22001 with a flat objective and 20 iterations ends at PIN1 and seed 22020 at PIN2", J(p1) === J(PIN1) && J(p2) === J(PIN2), J([p1, p2]));
    const up = mkFly((w) => ({ score: 0.5 + 0.01 * w[0], watts: 5000 })), cl = X.searchOne(22003, { iters: 60, flyFn: up.f });
    ok("!! with a score that rises with c the search climbs (c above 0 after 60 iterations)", cl.law[0] > 0);
    const pass = mkFly(() => ({ score: 0.7, watts: 5000 })); X.searchOne(22003, { iters: 1, train: { from: 5, to: 6 }, held: { from: 8, to: 9 }, seconds: 7, flyFn: pass.f });
    ok("!! the ids and the seconds handed in are the ones flown: train 5-6 for the search, held-out 8-9 for the last two flights, 7 s", pass.log.length === 6 && pass.log.slice(0, 4).every((x) => J(x.range) === '{"from":5,"to":6}' && x.secs === 7) && pass.log.slice(4).every((x) => J(x.range) === '{"from":8,"to":9}' && x.secs === 7));
}
sec("4. RANK");
{
    const row = (seed, held, law = [seed % 7, 0.1, 0, -1]) => ({ seed, group: "F4", law, trainScore: 0.9, heldScore: held, accepted: 1, iters: 300 });
    const rows = X.SEEDS.map((s, i) => row(s, 0.80 - 0.001 * i)), r = X.rankOf(rows);
    ok("!! rankOf puts the best held-out value first (seed order here: 22001 first, 22020 last); picksOf takes ranks 1, 10 and 20 (22001, 22010, 22020)", r[0].seed === 22001 && r[19].seed === 22020 && (p => p.best.seed === 22001 && p.median.seed === 22010 && p.worst.seed === 22020)(X.picksOf(rows)));
    const sh = X.SEEDS.map((s, i) => row(s, 0.70 + 0.001 * i)), ps = X.picksOf(sh);
    ok("!! the ranking follows the HELD-OUT value, not the order, the seed or the train value: reversed values put 22020 first, 22011 at rank 10 and 22001 last; the train value does not enter", ps.best.seed === 22020 && ps.median.seed === 22011 && ps.worst.seed === 22001 && X.picksOf(sh.map((q, i) => ({ ...q, trainScore: 0.1 * (i % 3) }))).best.seed === 22020);
    const tie = X.SEEDS.map((s) => row(s, 0.8)), pt = X.picksOf(tie);
    ok("!! a tie goes to the lower seed: twenty equal values rank 22001 first, 22010 tenth, 22020 last", pt.best.seed === 22001 && pt.median.seed === 22010 && pt.worst.seed === 22020 && X.rankOf(tie).every((q, i) => q.seed === 22001 + i));
    ok("!! rankOf refuses nineteen rows, a seed twice, an unknown seed, a non-list and null", [rows.slice(1), [...rows.slice(1), rows[1]], [...rows.slice(1), row(22021, 0.8)], "x", null].every((a) => /needs one search for each of the seeds 22001-22020 \(20 rows\)/.test(thr(() => X.rankOf(a)))));
}
sec("5. ARMS");
{
    const laws = [[3, 0.1, -1, -3], [2, 0.2, 0, -1], [4, 0, 0.5, 1]], a = X.armsOf(laws);
    ok("!! armsOf gives the 7 arms by id in order: best, median, worst are the three laws (h16-law kind), c02 and h16 the registered laws, law0 the zero law; refuses laws not a list of three", J(Object.keys(a)) === J(X.ARM_IDS) && J(a.best.entry().weights) === J(laws[0]) && J(a.median.entry().weights) === J(laws[1]) && J(a.worst.entry().weights) === J(laws[2]) && J(a.c02.entry().weights) === J(X.LAW_C02) && J(a.h16.entry().weights) === J(X.LAW_H16) && J(a.law0.entry().weights) === "[0,0,0,0]" && /three picks' laws/.test(thr(() => X.armsOf([[1, 2, 3, 4]]))) && /three picks' laws/.test(thr(() => X.armsOf(null))));
    const calls = [], fake = (arm, range, secs, ev) => { calls.push([arm.id, range.from, range.to, secs, ev]); return Array.from({ length: range.to - range.from + 1 }, (_, i) => ({ key: "sb-" + (range.from + i), score: 0.6, bad: false, watts: 5000, thrust: 0.3 })); };
    const au = X.audit(laws, { range: { from: 1, to: 3 }, seconds: 33, flyFn: fake, search: [{ seed: 1 }], c02Held: 0.7, c02HeldAgain: 0.7 });
    ok("!! audit flies every arm in order, dark then lit (dropout, then null), at the range and seconds handed in, and keeps the laws, the searches, c02's held-out value (both) and the c02 and h16 laws it built", calls.length === 14 && calls.every((c, i) => c[0] === X.ARM_IDS[i >> 1] && c[1] === 1 && c[2] === 3 && c[3] === 33 && c[4] === (i % 2 ? null : "dropout")) && J(au.laws) === J(laws) && au.search[0].seed === 1 && au.c02Held === 0.7 && au.c02HeldAgain === 0.7 && J(au.fixed) === J([X.LAW_C02, X.LAW_H16]));
    calls.length = 0; const sub = X.audit(laws, { range: { from: 1, to: 2 }, seconds: 9, arms: ["worst"], flyFn: fake });
    ok("!! audit with a subset flies only those arms and always the autopilot; an unknown arm is refused naming it; the default range is the audit ids at 160 s", J(Object.keys(sub.dark).sort()) === '["autopilot","worst"]' && /no arm best2/.test(thr(() => X.audit(laws, { arms: ["best2"], flyFn: fake }))) && (calls.length = 0, X.audit(laws, { arms: ["c02"], flyFn: fake }), calls.every((c) => c[1] === 22200 && c[2] === 22399 && c[3] === 160)));
    const arms = X.armsOf(laws), board = B.createBoard().addTask(B.dropoutTask); board.addArm(arms.autopilot); board.addArm(arms.best);
    const mine = H15.fly(arms.best, { from: 5, to: 5 }, 35, "dropout")[0], theirs = board.run("dropout", ["best"], { from: 5, to: 5 }, { seconds: 35 }).runs.best[0], r0 = H15.fly(arms.law0, { from: 5, to: 6 }, 35, "dropout"), ra = H15.fly(arms.autopilot, { from: 5, to: 6 }, 35, "dropout");
    ok("!! A REAL LAW FLIES AND SCORES AS switchboard.dropout DOES (the board's score to the last digit), and law0 flies exactly as the autopilot (score and power within 1e-9)", mine.score === theirs.score && r0.every((r, i) => near(r.score, ra[i].score) && near(r.watts, ra[i].watts)));
}
const N0 = 40, base = (c) => Array.from({ length: N0 }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0))), wob = (i, a) => (i % 2 ? a : -a);
const SEARCH = (over = {}) => X.SEEDS.map((seed, i) => ({ seed, group: "F4", law: [0.5 + 0.1 * i, 0.1, -0.5, -1], trainScore: 0.9, heldScore: 0.80 - 0.001 * i, accepted: 3, iters: 300, ...(over[seed] || {}) }));
const mkAu = (spec = {}, { search = SEARCH(), c02Held = 0.795, n = N0 } = {}) => {
    const p = X.picksOf(search), au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60, laws: X.PICK_IDS.map((id) => p[id].law.slice()), search, c02Held, c02HeldAgain: c02Held, fixed: [X.LAW_C02.slice(), X.LAW_H16.slice()] };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const s = spec[a] || {}, g = (c === "lit" ? s.lit : s.gain) || 0, lost = (s.lost || []).includes(c), kw = c === "lit" && s.litKw !== undefined ? s.litKw : s.kw !== undefined ? s.kw : 5;
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N0] + g + wob(i, 0.02) + (a === "autopilot" || a === "law0" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost && i === 3, watts: kw * 1000 + (a === "autopilot" || a === "law0" ? 0 : (i % 2 ? 1 : -1) * 0.5), thrust: s.thrust === undefined ? 0.3 : s.thrust }));
    }
    return au;
};
sec("6. STATS");
{
    const v = (spec, o) => X.verdictOf(mkAu(spec, o)).split("; ");
    ok("!! part A: C02'S HELD-OUT VALUE IS REACHED BY n OF 20 SEARCHES counts the searches at or above c02's value, a tie included: c02 at 0.795 with held values 0.800 down by 0.001 is reached by 6 (0.800-0.795); at exactly 0.795 the sixth counts; a hair above (0.7951) 5; far below 20; far above 0", v()[0] === "C02'S HELD-OUT VALUE IS REACHED BY 6 OF 20 SEARCHES" && v({}, { c02Held: 0.7951 })[0].endsWith("BY 5 OF 20 SEARCHES") && v({}, { c02Held: 0.5 })[0].endsWith("BY 20 OF 20 SEARCHES") && v({}, { c02Held: 0.9 })[0].endsWith("BY 0 OF 20 SEARCHES"));
    ok("!! c02Rank is 1 plus the searches STRICTLY above c02 (0.795: five above, rank 6; 0.9: rank 1; 0.5: rank 21)", X.c02Rank(mkAu()) === 6 && X.c02Rank(mkAu({}, { c02Held: 0.9 })) === 1 && X.c02Rank(mkAu({}, { c02Held: 0.5 })) === 21 && X.reachedBy(mkAu()) === 6);
    ok("!! part B: the BEST search against c02 on the priced score: BEATS (best +0.2, c02 +0.1), IS BEHIND (best 0), TIES (copy); each from the best arm", (() => { const g = (b) => v({ c02: { gain: 0.1, lit: 0.1 }, best: b })[1]; return g({ gain: 0.2, lit: 0.2 }) === "THE BEST SEARCH BEATS C02" && g({ gain: 0, lit: 0 }) === "THE BEST SEARCH IS BEHIND C02" && g({ gain: 0.1, lit: 0.1 }) === "THE BEST SEARCH TIES C02"; })());
    ok("!! part C reads the MEDIAN arm on its own (best +0.2 and median 0 give BEATS then IS BEHIND), against c02", (() => { const x = v({ c02: { gain: 0.1, lit: 0.1 }, best: { gain: 0.2, lit: 0.2 }, median: { gain: 0, lit: 0 } }); return x[1].includes("BEST SEARCH BEATS") && x[2] === "THE MEDIAN SEARCH IS BEHIND C02" && v({ c02: { gain: 0.1, lit: 0.1 }, median: { gain: 0.2, lit: 0.2 } })[2] === "THE MEDIAN SEARCH BEATS C02" && v({ c02: { gain: 0.1, lit: 0.1 }, median: { gain: 0.1, lit: 0.1 } })[2] === "THE MEDIAN SEARCH TIES C02"; })());
    ok("!! part D: the WORST search against the AUTOPILOT: BEATS (+0.1), IS BEHIND (-0.1), TIES (0); c02 does not enter; the pairing is priced (a worst arm ahead by 0.1 dark and lit but drawing 6 kW more dark and lit (price 0.12) is BEHIND)", v({ worst: { gain: 0.1, lit: 0.1 } })[3] === "THE WORST SEARCH BEATS THE AUTOPILOT" && v({ worst: { gain: -0.1, lit: -0.1 } })[3] === "THE WORST SEARCH IS BEHIND THE AUTOPILOT" && v({ worst: { gain: 0, lit: 0 } })[3] === "THE WORST SEARCH TIES THE AUTOPILOT" && v({ c02: { gain: 0.5, lit: 0.5 }, worst: { gain: 0.1, lit: 0.1, kw: 11, litKw: 11 } })[3].includes("IS BEHIND"));
    const withLaws = (laws) => SEARCH(Object.fromEntries(laws.map((l, i) => [22001 + i, { law: l }])));
    const e = (laws) => X.verdictOf(mkAu({}, { search: withLaws(laws) })).split("; ")[4] + "; " + X.verdictOf(mkAu({}, { search: withLaws(laws) })).split("; ")[5];
    ok("!! part E counts the basin (c 1.2 to 4.0, d 0.3 or more; 1.2/0.3 and 4.0/0.3 in; 1.1999, 4.0001, d 0.2999 out) and the s edge (-3.9401 and 1.9401 at the edge; -3.9399 not): the default fixture has none in the basin (d 0.1) and none at the edge", e([]) === "SEARCHES IN C02'S BASIN: 0 OF 20; S AT THE BOX EDGE: 0 OF 20" && e([[1.2, 0.3, 0, -1], [4.0, 0.3, 0, -1], [2, 1, 0, -1]]).startsWith("SEARCHES IN C02'S BASIN: 3 OF 20") && e([[1.1999, 0.5, 0, -1], [4.0001, 0.5, 0, -1], [2, 0.2999, 0, -1]]).startsWith("SEARCHES IN C02'S BASIN: 0 OF 20") && e([[1, 0.1, 0, -3.9401], [1, 0.1, 0, 1.9401], [1, 0.1, 0, -3.9399]]).endsWith("S AT THE BOX EDGE: 2 OF 20") && e([[2, 0.5, 0, -4], [2, 0.5, 0, 2]]).endsWith("BASIN: 2 OF 20; S AT THE BOX EDGE: 2 OF 20"));
    ok("!! the verdict is six items when split on `; ` (part E holds one) and starts with part A", X.verdictOf(mkAu()).split("; ").length === 6 && /^C02'S HELD-OUT VALUE IS REACHED BY \d+ OF 20 SEARCHES; THE BEST SEARCH /.test(X.verdictOf(mkAu())));
    const au = mkAu({ c02: { gain: 0.1, lit: 0.3, kw: 6, litKw: 10 } });
    ok("!! pricedGain is (dark + lit gain)/2 - 0.02 x (extra dark + extra lit kW)/2: c02 at dark +0.1, lit +0.3, 6 and 10 kW against 5 and 5 has 0.2 - 0.02 x 3 = 0.14 (the arm's alternating term cancels)", near(X.pricedGain(au, "c02"), 0.14, 1e-4));
}
sec("7. LINES");
{
    const spec = { c02: { gain: 0.1, lit: 0.08, kw: 6, thrust: 0.31 }, best: { gain: 0.12, lit: 0.1, kw: 6.5, litKw: 8, thrust: 0.4 }, median: { gain: 0.09, lit: 0.07, kw: 5.5 }, worst: { gain: 0.02, lit: 0.01, kw: 5.05 } }, au = mkAu(spec), L = X.bottomLines(au);
    ok("!! eleven lines in order: SEARCHES, C02 ON THE HELD-OUT IDS, SPREAD, AUDIT, PRICED GAIN, PAIRED, BASIN, DISTRIBUTION, GAINS, VERDICT, LOST SUBS", L.length === 11 && ["SEARCHES", "C02 ON THE HELD-OUT IDS", "SPREAD", "AUDIT", "PRICED GAIN", "PAIRED", "BASIN", "DISTRIBUTION", "GAINS", "VERDICT", "LOST SUBS"].every((k, i) => L[i].startsWith(k)));
    ok("!! the searches line lists the twenty by rank with seed, law, train and held-out values and accepted counts (rank 1 is seed 22001, held 0.8000)", /^SEARCHES \(rank, seed, law c d k s, train \/ held-out priced value, accepted\): 1\. 22001 \[0\.500 0\.100 -0\.500 -1\.000\] 0\.9000 \/ 0\.8000 acc 3; 2\. 22002 /.test(L[0]) && (L[0].match(/acc 3/g) || []).length === 20 && /20\. 22020 /.test(L[0]));
    ok("!! the c02 line gives its held-out value 0.7950, rank 6 and the counts (5 above, 6 at or above)", L[1] === "C02 ON THE HELD-OUT IDS: priced value 0.7950, rank 6 among the 20 searches and itself (5 searches above it, 6 at or above)");
    ok("!! the spread line is best minus worst (0.8000 - 0.7810 = 0.0190) and the values at ranks 5, 10, 15 (0.7960, 0.7910, 0.7860)", L[2] === "SPREAD (held-out priced value): best minus worst 0.0190; rank 5 0.7960, rank 10 0.7910, rank 15 0.7860");
    ok("!! the audit line gives the autopilot, c02, h16 and the three picks' dark and lit mean score, dark power and dark thrust (best: 6.50 kW, thrust 0.40; c02 thrust 0.31)", /best \d\.\d{4} \/ \d\.\d{4}, 6\.50 kW, thrust 0\.40/.test(L[3]) && /c02 \d\.\d{4} \/ \d\.\d{4}, 6\.00 kW, thrust 0\.31/.test(L[3]) && /^AUDIT \(dark \/ lit mean score, dark mean power, dark mean thrust\): autopilot /.test(L[3]) && /worst .*5\.05 kW/.test(L[3]));
    ok("!! the priced-gain line gives c02, h16 and the picks (best: 0.11 mean gain, +1.5 kW dark and +3 kW lit: 0.11 - 0.02 x 2.25 = +0.0650)", /best \+0\.0650/.test(L[4]) && /^PRICED GAIN AT 0\.02: c02 /.test(L[4]));
    ok("!! the paired line carries the three pairings (best minus c02, median minus c02, worst minus autopilot) with mean, se, counts and reading", /^PAIRED \(priced score\): best minus c02 .* median minus c02 .* worst minus autopilot .*(BETTER|WORSE|TIES)$/.test(L[5]) && (L[5].match(/better \d+, worse \d+, same \d+/g) || []).length === 3);
    ok("!! the basin line names every search with c, d and IN/out in rank order; the distribution line gives min / median / max of c, d, k, s (c 0.500 / 1.450 / 2.400: the median is the mean of the 10th and 11th values)", L[6].startsWith("BASIN (c in [1.2, 4] and d at least 0.3): 22001 c 0.50 d 0.10 out") && /^DISTRIBUTION OVER THE 20 \(min \/ median \/ max\): c 0\.500 \/ 1\.450 \/ 2\.400; d 0\.100 \/ 0\.100 \/ 0\.100; k -0\.500 \/ -0\.500 \/ -0\.500; s -1\.000 \/ -1\.000 \/ -1\.000$/.test(L[7]));
    ok("!! the gains line gives each pick's dark and lit gain, extra kW and efficiency (best: +0.1200 / +0.1000, +1.50 / +3.00, 0.080; worst extra +0.05 so efficiency n/a; median efficiency 0.180 at +0.50 kW)", /best \+0\.1200 \/ \+0\.1000, \+1\.50 \/ \+3\.00, 0\.080/.test(L[8]) && /median \+0\.0900 \/ \+0\.0700, \+0\.50 \/ \+0\.50, 0\.180/.test(L[8]) && /worst \+0\.0200 \/ \+0\.0100, \+0\.05 \/ \+0\.05, n\/a/.test(L[8]));
    const lost = mkAu({ best: { lost: ["dark", "lit"] }, c02: { lost: ["dark"] } });
    ok("!! the verdict line equals verdictOf; the lost-subs line counts the lost runs per arm (best 2, c02 1, others 0)", L[9] === "VERDICT: " + X.verdictOf(au) && X.bottomLines(lost)[10] === "LOST SUBS: autopilot 0, c02 1, picks 2 / 0 / 0, h16 0");
}
sec("8. CHECKS");
{
    const good = () => mkAu({ c02: { gain: 0.1, lit: 0.1 } }), names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a good audit passes all eleven checks, in order", X.checksOf(good()).length === 11 && names(good()).length === 0 && J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "POWERS FINITE AND AT LEAST 200 W", "EVENT REACHES THE FLIGHT", "ZERO LAW IS THE AUTOPILOT", "TWENTY SEARCHES INSIDE THE BOX", "ID SETS DISJOINT", "PICKS ARE RANKS 1, 10 AND 20", "C02 AND H16 ARE THE REGISTERED LAWS", "C02 HELD-OUT VALUE RECOMPUTED"]));
    const g1 = good(); g1.range = { from: 1, to: 41 }; const g2 = good(); g2.dark.best.push({ ...g2.dark.best[0], key: "sb-41" }); const g3 = good(); delete g3.lit.worst;
    ok("!! a 41-id range with 40 runs, an arm one run too long and a missing arm break SIZES", [g1, g2, g3].every((a) => names(a).includes("SIZES")));
    const i1 = good(); i1.dark.median[2].key = "sb-99"; const i2 = good(); i2.lit.c02[5].key = "x";
    ok("!! a different id in any arm or condition breaks IDS ALIGNED", [i1, i2].every((a) => names(a).includes("IDS ALIGNED")));
    const s1 = good(); s1.dark.best[0].score = 0; const s2 = good(); s2.lit.h16[3].score = 1; const s3 = good(); s3.dark.worst[4].score = -0.1; const s4 = good(); s4.dark.c02[4].score = 0.0000001;
    ok("!! a score of 0, 1 or below 0 breaks SCORES INSIDE (0, 1); a hair above 0 holds", [s1, s2, s3].every((a) => names(a).includes("SCORES INSIDE (0, 1)")) && !names(s4).includes("SCORES INSIDE (0, 1)"));
    const w1 = good(); w1.dark.best[1].watts = NaN; const w2 = good(); w2.lit.worst[1].watts = 199.9; const w3 = good(); w3.dark.median[2].thrust = Infinity; const w4 = good(); w4.dark.c02[2].watts = 200; const w5 = good(); w5.lit.c02.forEach((r) => { r.watts = 200; });
    ok("!! a NaN or under-200 W power or a non-finite thrust breaks POWERS FINITE AND AT LEAST 200 W; 200 W exactly does not", [w1, w2, w3].every((a) => names(a).includes("POWERS FINITE AND AT LEAST 200 W")) && !names(w4).includes("POWERS FINITE AND AT LEAST 200 W") && !names(w5).includes("POWERS FINITE AND AT LEAST 200 W"));
    const ev = good(); ev.lit.autopilot = ev.dark.autopilot.map((r) => ({ ...r })); const ev2 = good(); ev2.lit.autopilot = ev2.dark.autopilot.map((r, i) => ({ ...r, score: i === 7 ? r.score + 1e-9 : r.score }));
    ok("!! identical dark and lit autopilot runs break EVENT REACHES THE FLIGHT; one id differing by 1e-9 is enough", names(ev).includes("EVENT REACHES THE FLIGHT") && !names(ev2).includes("EVENT REACHES THE FLIGHT"));
    const c1 = good(); c1.dark.law0[5].score += 1e-4; const c2 = good(); c2.lit.law0[7].watts += 1; const c3 = good(); c3.dark.law0[5].score += 5e-7; const c4 = good(); delete c4.dark.law0; const c5 = good(); c5.lit.law0[2].thrust += 1e-4;
    ok("!! law0 off the autopilot by 1e-4 in score or thrust or 1 W in power or missing breaks ZERO LAW IS THE AUTOPILOT; 5e-7 is inside the 1e-6 tolerance", [c1, c2, c4, c5].every((a) => names(a).includes("ZERO LAW IS THE AUTOPILOT")) && !names(c3).includes("ZERO LAW IS THE AUTOPILOT"));
    const t1 = good(); t1.search = t1.search.slice(1); const t2 = good(); t2.search = null; const t3 = good(); t3.search[3].law = [17, 0, 0, 0]; const t4 = good(); t4.search[4].seed = 22001; const t5 = good(); t5.laws[0] = [1, 0, 0, -4.1]; const t6 = good(); t6.laws = t6.laws.slice(1); const t7 = good(); t7.search[0].law = [16, 1, 2, 2];
    ok("!! nineteen searches, none, a law outside the box (c 17), a seed twice, a pick outside the box (s -4.1) or two picks only break TWENTY SEARCHES INSIDE THE BOX; the box corner holds", [t1, t2, t3, t4, t5, t6].every((a) => names(a).includes("TWENTY SEARCHES INSIDE THE BOX")) && !names(t7).includes("TWENTY SEARCHES INSIDE THE BOX"));
    const d1 = good(); d1.range = { from: 22100, to: 22139 }; const d2 = good(); d2.range = { from: 22010, to: 22049 }; const d3 = good(); d3.range = { from: 22130, to: 22169 }; const d4 = good(); d4.range = { from: 22200, to: 22239 }; const d5 = good(); d5.range = { from: 22024, to: 22063 }; const d6 = good(); d6.range = { from: 22140, to: 22179 };
    ok("!! an audit range overlapping the train (22010-22049) or held-out ids (22100-22139, 22130-22169) breaks ID SETS DISJOINT; 22200-22239, 22024-22063 and 22140-22179 hold", [d1, d2, d3].every((a) => names(a).includes("ID SETS DISJOINT")) && [d4, d5, d6].every((a) => !names(a).includes("ID SETS DISJOINT")));
    const r1 = good(); r1.laws[0] = r1.laws[1].slice(); const r2 = good(); r2.laws = [r2.laws[2], r2.laws[1], r2.laws[0]]; const r3 = good(); r3.search[0].heldScore = 0.7; const r4 = good(); r4.laws[1] = [1, 0, 0, -1];
    ok("!! a best pick that is the median's law, the three picks in the wrong order, a ranking changed under the picks (the best search now last) or a median that is no law of the ranking break PICKS ARE RANKS 1, 10 AND 20", [r1, r2, r3, r4].every((a) => names(a).includes("PICKS ARE RANKS 1, 10 AND 20")));
    const x1 = good(); x1.fixed = [[2.2035859388880334, 0.8758638340144, -0.6433501233386668, -1.9999], X.LAW_H16.slice()]; const x2 = good(); x2.fixed = [X.LAW_C02.slice(), [1.2322693581401742, -0.061415416013719054, -0.6, -0.1585]]; const x3 = good(); x3.fixed = null; const x4 = good(); delete x4.dark.c02; const x5 = good(); x5.fixed = [X.LAW_C02.slice()];
    ok("!! a c02 or h16 built from another law, no record of the laws, a missing arm or one law only breaks C02 AND H16 ARE THE REGISTERED LAWS", [x1, x2, x3, x4, x5].every((a) => names(a).includes("C02 AND H16 ARE THE REGISTERED LAWS")));
    const h1 = good(); h1.c02HeldAgain = h1.c02Held + 1e-12; const h2 = good(); h2.c02Held = NaN; h2.c02HeldAgain = NaN; const h3 = good(); h3.c02HeldAgain = null; const h4 = good(); h4.c02Held = null; h4.c02HeldAgain = null;
    ok("!! a recomputed c02 held-out value off by 1e-12, NaN or missing (either side) breaks C02 HELD-OUT VALUE RECOMPUTED; equal values hold", [h1, h2, h3, h4].every((a) => names(a).includes("C02 HELD-OUT VALUE RECOMPUTED")) && !names(good()).includes("C02 HELD-OUT VALUE RECOMPUTED"));
}
sec("9. REPORT");
{
    const au = mkAu({ c02: { gain: 0.1, lit: 0.08, kw: 6 }, best: { gain: 0.12, lit: 0.1, kw: 6.5, litKw: 8 } }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the audit ids, the seconds and 'read once'; the eleven checks pass first and the means table follows", /^ROUND H22: .* Audit ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 12).every((l) => /^  PASS /.test(l)) && L[12].startsWith("means (dark score / lit score"));
    const row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(10) + " ") && /\/ \d\.\d{4}   \d/.test(l));
    ok("!! the means table prints each of the 7 arms' dark and lit score, dark power and lit power (best 6.50 and 8.00)", X.ARM_IDS.every((a) => !!row(a)) && /^  best +\d\.\d{4} \/ \d\.\d{4} +6\.50 +8\.00$/.test(row("best")));
    const per = t.split("\n").filter((l) => /\/ [+-]\d\.\d{4}  [+-]\d\.\d{3} \/ [+-]\d\.\d{3}  [+-]\d\.\d{4}$/.test(l));
    ok("!! the per-arm table has a row for each of the 6 arms after the autopilot, and the eleven bottom lines come last", per.length === 6 && X.ARM_IDS.slice(1).every((a) => per.some((l) => l.startsWith("  " + a.padEnd(10)))) && L.slice(-11).every((l) => l.startsWith("BOTTOM LINE: ")) && L.filter((l) => l.startsWith("BOTTOM LINE: ")).length === 11);
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdict is NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdict below is NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !Lb.some((l) => l.startsWith("means (")));
}
sec("10. SOURCE");
{
    const count = (s) => code.split(s).length - 1;
    ok("!! each of the ids 22000, 22023, 22100, 22139, 22200, 22399 appears once and the first seed 22001 once; no clock, no random number, nothing read from the disk", ["22000", "22023", "22100", "22139", "22200", "22399", "22001"].every((s) => count(s) === 1) && !/Date\.now|new Date|Math\.random|performance\.now|readFileSync|writeFileSync|node:fs/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
