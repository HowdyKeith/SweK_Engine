// WebGLEngine/tools/ship/subNoiseStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subNoiseStudy-selfcheck.mjs      (about 70 s: arithmetic on hand-built summaries, a command with injected flights, and two real runs of the command)
//
// THE STUDY OF THE ESTIMATE WITH NOISE (tools/ship/subNoiseStudy.mjs), held to its word before HELD14 is flown ("FOLLOW-UP 14" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE ARITHMETIC  the median, the exact sign test
//   3  THE SUMMARY     counts by behaviour and arm, ship hits only when the struck obstacle was a ship, the velocity error's median over the flights that hold one, only the cells flown, in order
//   4  THE PAIRS       gained and lost by seed and the sign test
//   5  THE VERDICT     C1 (9 more in react-stop), C2 (the nominal arm's count minus 3 in react-none), C3 (diff@3 five below kf@3), each at its boundary, the verdict over every combination, E1 to E9, a missing cell is a miss
//   6  THE CONTROLS    the control check on injected flights: a pass, and each way it can fail named
//   7  THE TEXT AND THE COMMAND   the verdict block and a table row word for word, bad arguments (exit 2, named), --write goes with held14 only and refuses a second write, a command run with a fake
//                      that answers by behaviour and arm (so a mixed-up cell shows), the rows written, the controls line, run as a process (the controls and the flights real), imported it prints nothing
//
// SABOTAGE LOG (serial mutation pass of tools/ship/subNoiseStudy.mjs, one mutant per code line and operator, at most four of each operator on a line): 116 mutants; 114 red on the first pass and 2 survivors:
//   `(n - i)` -> `(n + i)` in the sign test's binomial recurrence (every case had a smaller count of 0 or 1, where the first step of the loop hides the sign: rows added for 8 and 2, 7 and 3, 6 and 4, run again: red) and
//   `process.argv[1]` -> `process.argv[2]` in the entry guard, which differs only for a run with NO arguments at all: that is the full DEV set (900 flights, about five minutes), which this gate does not fly. NOT REACHED, not equivalent.
//   A DISCLOSURE: one mutant on the `writeFile = io.writeFile || fs.writeFileSync` line made an injected-flight `--write` run write for real, once, into a throwaway copy of the tree (the runner deletes any file written to the
//   held-set path after every mutant and found this one); nothing was written to the real tree.
//   NOT CHECKED, said plainly: the full HELD14 flights themselves (the module's gate holds the beliefs and the controls; the study is flown once).
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subNoiseStudy.mjs";
import * as NZ from "../../brain/subNoiseNav.mjs";
import * as R from "../../brain/subReactNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NM = NZ.NOMINAL, D = NZ.DESIGNATED;
const cellOf = (reached, o = {}) => ({ n: 60, reached, rate: reached / 60, collided: 0, shipHits: 0, left: 0, timeout: 0, other: 0, medianTime: 150, medianClearance: 10, velErrMedian: 0.5, velErrP90: 1, ...o });
const SUM = (spec) => ({ cells: Object.fromEntries(Object.entries(spec).map(([b, arms]) => [b, Object.fromEntries(Object.entries(arms).map(([a, r]) => [a, cellOf(r)]))])) });
const BASE = () => ({ "react-none": { [NM]: 44, [D]: 44 }, "react-turn": { [NM]: 44, [D]: 46 }, "react-stop": { [NM]: 38, [D]: 50, "diff@3": 40, "diff@6": 30, "kf@6": 45, "replan@3": 55 } });
const withStop = (o) => { const b = BASE(); b["react-stop"] = { ...b["react-stop"], ...o }; return b; };
const withNone = (o) => { const b = BASE(); b["react-none"] = { ...b["react-none"], ...o }; return b; };
const withTurn = (o) => { const b = BASE(); b["react-turn"] = { ...b["react-turn"], ...o }; return b; };
const J = (spec = BASE(), controls = true) => St.judge(SUM(spec), controls);
console.log("subNoiseStudy-selfcheck -- the study of the estimate with noise\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subNoiseHeld14.jsonl, the sets are the module's, the control seeds are 1 to 5", St.OUT === "brain/subNoiseHeld14.jsonl" && St.SETS === NZ.SETS && same(St.CONTROL_SEEDS, [1, 2, 3, 4, 5]) && Object.isFrozen(St.CONTROL_SEEDS));
    ok("!! the thresholds: gain 9, cost 3, noise gap 5, plus 5, within 5, replan minimum 50", same(St.THRESH, { gain: 9, cost: 3, noiseGap: 5, plus: 5, within: 5, replanMin: 50 }) && Object.isFrozen(St.THRESH));
}

console.log("\n2. THE ARITHMETIC");
{
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
    ok("!! the sign test: 0 and 0 -> 1; 1 and 0 -> 1; 5 and 0 -> 0.0625; 10 and 0 -> 2/1024; 9 and 1 -> 2 x 11 / 1024; 8 and 2 -> 112/1024; 7 and 3 -> 352/1024; 6 and 4 -> 2 x 386/1024; 3 and 3 -> 1; symmetric", St.signP(0, 0) === 1 && St.signP(1, 0) === 1 && near(St.signP(5, 0), 0.0625) && near(St.signP(10, 0), 2 / 1024) && near(St.signP(9, 1), 22 / 1024) && St.signP(3, 3) === 1 && near(St.signP(2, 8), St.signP(8, 2)) && near(St.signP(8, 2), 112 / 1024) && near(St.signP(3, 7), 352 / 1024) && near(St.signP(4, 6), 2 * 386 / 1024));
}

console.log("\n3. THE SUMMARY");
{
    const f = (behaviour, arm, status, o = {}) => ({ behaviour, arm, status, reached: status === "reached", hit: status === "collided" ? "ship" : null, t: 100, minClearance: 10, velErrMedian: null, velErrP90: null, ...o });
    const runs = [f("react-stop", D, "reached", { t: 120, velErrMedian: 0.4, velErrP90: 0.9 }), f("react-stop", D, "reached", { t: 140, velErrMedian: 0.6, velErrP90: 1.1 }), f("react-stop", D, "collided"), f("react-stop", D, "collided", { hit: "iceberg" }), f("react-stop", D, "left"), f("react-stop", D, "timeout"), f("react-stop", D, "sunk"),
        f("react-none", NM, "reached", { t: 90 }), f("react-turn", D, "collided", { velErrMedian: 0.8, velErrP90: 1.5 })];
    const s = St.summarize(runs), x = s.cells["react-stop"][D];
    ok("!! counts by behaviour and arm: n, reached, collided, left, timeout, and a status of the vessel's own counted apart as `other`", x.n === 7 && x.reached === 2 && x.collided === 2 && x.left === 1 && x.timeout === 1 && x.other === 1 && near(x.rate, 2 / 7));
    ok("!! ship hits count only collisions whose obstacle was a ship (the iceberg hit is a collision and not a ship hit)", x.shipHits === 1 && s.cells["react-turn"][D].shipHits === 1);
    ok("!! the median time is over the arrivals only (120 and 140 -> 130), the median clearance over every flight", x.medianTime === 130 && x.medianClearance === 10 && s.cells["react-none"][NM].medianTime === 90);
    ok("!! the velocity error is the median over the flights that hold one (0.4 and 0.6 -> 0.5; p90 0.9 and 1.1 -> 1.0), NaN when none does", near(x.velErrMedian, 0.5) && near(x.velErrP90, 1.0) && Number.isNaN(s.cells["react-none"][NM].velErrMedian) && near(s.cells["react-turn"][D].velErrMedian, 0.8));
    ok("!! only the cells flown appear, and a cell is under its behaviour and arm", same(Object.keys(s.cells).sort(), ["react-none", "react-stop", "react-turn"]) && same(Object.keys(s.cells["react-none"]), [NM]) && St.summarize([]).cells && Object.keys(St.summarize([]).cells).length === 0);
}

console.log("\n4. THE PAIRS");
{
    const g = (arm, spec, behaviour = "react-stop") => Object.entries(spec).map(([seed, reached]) => ({ behaviour, arm, seed: Number(seed), reached }));
    const runs = [...g("A", { 1: true, 2: true, 3: false, 4: false, 5: true }), ...g("B", { 1: true, 2: false, 3: true, 4: false, 6: true }), ...g("A", { 1: false }, "react-none"), ...g("B", { 1: true }, "react-none")];
    const p = St.paired(runs, "react-stop", "A", "B");
    ok("!! gained is the seeds the first arm reaches and the second does not, lost the reverse, over the seeds both flew in that behaviour, ties dropped", p.gained === 1 && p.lost === 1 && p.p === 1);
    ok("!! the sign test is on those counts, and the behaviour is respected (react-none: 0 gained, 1 lost, p 1)", near(St.paired(runs, "react-none", "A", "B").p, 1) && St.paired(runs, "react-none", "A", "B").lost === 1 && St.paired(runs, "react-none", "A", "B").gained === 0 && near(St.paired([...g("A", { 1: true, 2: true, 3: true, 4: true, 5: true }), ...g("B", { 1: false, 2: false, 3: false, 4: false, 5: false })], "react-stop", "A", "B").p, 0.0625));
}

console.log("\n5. THE VERDICT");
{
    ok("!! the registered shape of the answer: C1, C2 and C3 held gives SUPPORTED, with every E held", J().verdict === "SUPPORTED" && J().c1 && J().c2 && J().c3 && ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"].every((k) => J()[k]));
    ok("!! C1 holds from +9: kf@3 at nominal + 9 holds, +8 misses (react-stop 38 against 47 and 46)", J(withStop({ [D]: 47 })).c1 && !J(withStop({ [D]: 46 })).c1 && J(withStop({ [D]: 47 })).e2 && !J(withStop({ [D]: 46 })).e2);
    ok("!! C2 holds down to the nominal arm's count minus 3 in react-none: 41 of 44 holds, 40 misses", J(withNone({ [D]: 41 })).c2 && !J(withNone({ [D]: 40 })).c2 && J(withNone({ [D]: 44 })).c2 && J(withNone({ [D]: 41 })).e3 && !J(withNone({ [D]: 40 })).e3);
    ok("!! C3 holds when diff@3 is at least 5 below kf@3: 45 of 50 holds, 46 misses", J(withStop({ "diff@3": 45 })).c3 && !J(withStop({ "diff@3": 46 })).c3 && J(withStop({ "diff@3": 45 })).e4 && !J(withStop({ "diff@3": 46 })).e4);
    const v = (c1, c2, c3) => J({ ...BASE(), "react-none": { [NM]: 44, [D]: c2 ? 44 : 30 }, "react-stop": { ...BASE()["react-stop"], [D]: c1 ? 50 : 40, "diff@3": c3 ? 40 : 49 } }).verdict;
    ok("!! the verdict over every combination: all three SUPPORTED; C1 with C2 or C3 alone PARTLY SUPPORTED; C1 alone NOT SUPPORTED; without C1 NOT SUPPORTED whatever the others",
        v(true, true, true) === "SUPPORTED" && v(true, true, false) === "PARTLY SUPPORTED" && v(true, false, true) === "PARTLY SUPPORTED" && v(true, false, false) === "NOT SUPPORTED" && v(false, true, true) === "NOT SUPPORTED" && v(false, true, false) === "NOT SUPPORTED" && v(false, false, true) === "NOT SUPPORTED" && v(false, false, false) === "NOT SUPPORTED");
    ok("!! E5: diff@6 below the nominal arm in react-stop (37 of 38 holds, 38 misses)", J(withStop({ "diff@6": 37 })).e5 && !J(withStop({ "diff@6": 38 })).e5);
    ok("!! E6: kf@6 at least 5 above the nominal arm (43 of 38 holds, 42 misses)", J(withStop({ "kf@6": 43 })).e6 && !J(withStop({ "kf@6": 42 })).e6);
    ok("!! E7: replan@3 at least 50 in react-stop (50 holds, 49 misses)", J(withStop({ "replan@3": 50 })).e7 && !J(withStop({ "replan@3": 49 })).e7);
    ok("!! E8: in react-turn kf@3 within 5 of the nominal arm either way (49 and 39 hold, 50 and 38 miss)", J(withTurn({ [D]: 49 })).e8 && J(withTurn({ [D]: 39 })).e8 && !J(withTurn({ [D]: 50 })).e8 && !J(withTurn({ [D]: 38 })).e8);
    ok("!! E1 is the controls flag, E9 is the verdict (a PARTLY run misses it)", !J(BASE(), false).e1 && J(BASE(), true).e1 && !J(withStop({ "diff@3": 46 })).e9 && J().e9);
    const miss = (() => { try { return St.judge({ cells: {} }, false); } catch { return null; } })();
    ok("!! a missing cell is a miss, never a throw: nothing flown is NOT SUPPORTED with every E missed", miss && miss.verdict === "NOT SUPPORTED" && !miss.c1 && !miss.c2 && !miss.c3 && ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"].every((k) => !miss[k]));
}

console.log("\n6. THE CONTROLS");
{
    const rec = { status: "reached", ticks: 100, path: 10 };
    const good = St.controlCheck(() => rec, () => rec, () => rec);
    ok("!! with flights that are the flights they must be the control check passes over 30 flights (five seeds: nominal against flyHard, diff@0 and kf@0 against nominal, exact in three behaviours)", good.ok === true && good.checked === 30 && good.bad.length === 0);
    const flyBad = (pick) => (pilot, sc, arm, b) => (pick(sc.seed, arm, b) ? { ...rec, ticks: 101 } : rec);
    const b1 = St.controlCheck(flyBad((s, a) => a === "kf@0" && s === 3), () => rec, () => rec), b2 = St.controlCheck(flyBad((s, a, b) => a === NZ.EXACT && b === "react-turn" && s === 2), () => rec, () => rec), b3 = St.controlCheck(() => rec, () => rec, (p, sc) => (sc.seed === 4 ? { ...rec, path: 11 } : rec));
    ok("!! a noiseless arm that drifts from the nominal flight is named with its seed (kf@0 on 3)", b1.ok === false && same(b1.bad, ["kf@0 3"]));
    ok("!! an exact arm that drifts from subReactNav's is named with its behaviour and seed (exact react-turn on 2)", b2.ok === false && same(b2.bad, ["exact react-turn 2"]));
    ok("!! a nominal arm that drifts from flyHard is named (nominal vs flyHard on 4), and a path a micrometre off is not a different flight", b3.ok === false && same(b3.bad, ["nominal vs flyHard 4"]) && St.controlCheck(() => ({ ...rec, path: 10.0000001 }), () => rec, () => rec).ok === true);
    ok("!! a flight that differs in outcome, in ticks or in path is a different flight; each is caught", [{ ...rec, status: "collided" }, { ...rec, ticks: 99 }, { ...rec, path: 10.01 }].every((x) => !St.controlCheck(() => x, () => rec, () => rec).ok));
}

console.log("\n7. THE TEXT AND THE COMMAND");
{
    const exact = "C1 kf@3 reaches at least 9 more than any+predict+edge+yield in react-stop HELD; C2 it reaches at least any+predict+edge+yield's count minus 3 in react-none HELD; C3 diff@3 reaches at least 5 fewer than kf@3 in react-stop HELD => SUPPORTED\n" +
        "E1 the controls hold (the noiseless arms are the nominal arm's flights in react-none, and exact is subReactNav's estimating arm): HELD\nE2 C1: HELD\nE3 C2: HELD\nE4 C3: HELD\nE5 diff@6 reaches fewer than any+predict+edge+yield in react-stop: HELD\n" +
        "E6 kf@6 reaches at least 5 more than any+predict+edge+yield in react-stop: HELD\nE7 replan@3 reaches at least 50 of 60 in react-stop: HELD\nE8 in react-turn kf@3 is within 5 of any+predict+edge+yield either way: HELD\nE9 the verdict is SUPPORTED: HELD";
    ok("!! the verdict block is exactly the registered wording: C1 to C3 with their bars, the verdict, E1 to E9, every number", St.verdictText(J()) === exact);
    ok("!! a MISSED block says MISSED on the lines that missed, and the verdict follows", /C1 .* react-stop MISSED; /.test(St.verdictText(J(withStop({ [D]: 40 })))) && /=> NOT SUPPORTED/.test(St.verdictText(J(withStop({ [D]: 40 })))) && /E9 the verdict is SUPPORTED: MISSED$/.test(St.verdictText(J(withStop({ [D]: 40 })))));
    const one = SUM({ "react-none": { "any+replan": 3 } }); one.cells["react-none"]["any+replan"] = cellOf(3, { n: 3, rate: 1, collided: 3, shipHits: 3, medianTime: NaN, velErrMedian: NaN, velErrP90: NaN });
    const two = SUM({ "react-stop": { [D]: 50 } }); two.cells["react-stop"][D] = cellOf(50, { collided: 12, shipHits: 9, left: 2, timeout: 1, other: 0, medianTime: 150.5, velErrMedian: 0.5612, velErrP90: 1.0449 });
    const tl = (sum) => St.table(sum, "T").split("\n");
    ok("!! a table row is exact: behaviour padded to 11, the arm to 22, reached and its percent to 12, the counts to their columns, the median time to two places, the velocity error as median / p90 or n/a",
        tl(one)[2] === "react-none  any+replan             | 3/3 100%     |        3 ( 3)    0       0     0 |             n/a | n/a / n/a" && tl(two)[2] === "react-stop  kf@3                   | 50/60 83%    |       12 ( 9)    2       1     0 |          150.50 | 0.56 / 1.04");
    ok("!! the table is the title, the header and the cells in behaviour then arm order, only those flown", tl(SUM(BASE())).length === 2 + 2 + 2 + 6 && tl(SUM(BASE()))[0] === "T" && /^behaviour   arm /.test(tl(SUM(BASE()))[1]) && /^react-none  any\+predict\+edge\+yield/.test(tl(SUM(BASE()))[2]) && /^react-none  kf@3 /.test(tl(SUM(BASE()))[3]) && /^react-turn /.test(tl(SUM(BASE()))[4]) && /^react-stop  replan@3 /.test(tl(SUM(BASE()))[6]) && /^react-stop  any\+predict\+edge\+yield/.test(tl(SUM(BASE()))[7]) && /^react-stop  kf@6 /.test(tl(SUM(BASE()))[11]));
    const run = (argv, io = {}) => { const o = [], e = [], w = []; const code = St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (f, d) => w.push([f, d]), exists: () => false, controls: () => ({ ok: true, checked: 30, bad: [] }), ...io }); return { code, o: o.join("\n"), e: e.join("\n"), w }; };
    ok("!! bad arguments exit 2 naming the argument: an unknown --set, --seeds 0 or 1.5, an unknown flag", run(["--set", "nope"]).code === 2 && /--set needs one of dev, held14/.test(run(["--set", "nope"]).e) && run(["--seeds", "0"]).code === 2 && run(["--seeds", "1.5"]).code === 2 && /--seeds needs a positive whole number/.test(run(["--seeds", "0"]).e) && run(["--zzz"]).code === 2 && /unknown argument "--zzz"/.test(run(["--zzz"]).e));
    ok("!! --write goes with held14 only, and refuses a second write: HELD14 is read once", run(["--write"]).code === 2 && /--write goes with --set held14 only/.test(run(["--write"]).e) && run(["--set", "dev", "--write"]).code === 2 && run(["--set", "held14", "--seeds", "1", "--write"], { exists: () => true }).code === 2 && /exists: HELD14 is read once/.test(run(["--set", "held14", "--seeds", "1", "--write"], { exists: () => true }).e));
    // a fake that answers by behaviour and arm, so that a mixed-up cell shows
    const bi = (b) => R.BEHAVIOURS.indexOf(b), ai = (a) => NZ.NOISE_ARMS.indexOf(a);
    const reachedBy = (sc, arm, b) => (ai(arm) + bi(b)) % 3 === 0 ? true : (ai(arm) + bi(b)) % 3 === 1 ? sc.seed % 2 === 1 : false;
    const fake = (pilot, sc, arm, b) => { const r = reachedBy(sc, arm, b); return { arm, behaviour: b, seed: sc.seed, status: r ? "reached" : (ai(arm) % 2 ? "collided" : "left"), hit: r ? null : "ship", reached: r, t: 100 + ai(arm), minClearance: 5, velErrMedian: ai(arm) >= 3 ? 0.1 * ai(arm) : null, velErrP90: ai(arm) >= 3 ? 0.2 * ai(arm) : null }; };
    const rd = run(["--set", "held14", "--seeds", "2", "--write"], { fly: fake }), lines = rd.o.split("\n"), cellOfRow = (b, a) => (lines.find((l) => l.startsWith(`${b.padEnd(11)} ${a.padEnd(22)} |`)) || "").split("|").map((x) => x.trim());
    ok("!! the header names the set and the counts: 2 scenarios, 3 behaviours, 10 arms, observed every 1 s; the title line carries the ladder, the cap, the edge, the yield and the filter's numbers", lines[0] === "HELD14 set: 2 scenarios of hard-traffic x 3 ship behaviours, 10 arms, ships observed every 1 s" && lines.includes("margin ladder 12, 8, 6, 3 m, 260 s a flight, edge +20 m, yield 2 m/s, filter: acceleration noise 0.5 m/s2, start velocity sd 1 m/s, sigma 1.5, 3, 6 m"));
    const seeds2 = NZ.SETS.held14.slice(0, 2), expect = (b, a) => seeds2.filter((s) => reachedBy({ seed: s }, a, b)).length;
    ok("!! each cell counts its own flights: the reached of all 30 cells is what the fake gave that behaviour and arm (so no cell is another's)", R.BEHAVIOURS.every((b) => NZ.NOISE_ARMS.every((a) => cellOfRow(b, a)[1].startsWith(`${expect(b, a)}/2 `))), cellOfRow("react-stop", "kf@3")[1]);
    ok("!! every cell's median time is its arm's (100 + the arm's index, to two places, n/a when nothing arrived) and its velocity error the arm's (0.1 and 0.2 times the index, n/a for the first three arms)", R.BEHAVIOURS.every((b) => NZ.NOISE_ARMS.every((a) => { const c = cellOfRow(b, a); return c[3] === (expect(b, a) > 0 ? (100 + ai(a)).toFixed(2) : "n/a") && c[4] === (ai(a) >= 3 ? `${(0.1 * ai(a)).toFixed(2)} / ${(0.2 * ai(a)).toFixed(2)}` : "n/a / n/a"); })), cellOfRow("react-stop", "kf@6").join(" | "));
    const rows = rd.w[0][1].trim().split("\n").map((l) => JSON.parse(l));
    ok("!! a held14 run with --write puts one row per flight in the OUT file: 2 scenarios x 3 behaviours x 10 arms = 60, each labelled held14, two to each behaviour and arm", rd.code === 0 && rd.w.length === 1 && rd.w[0][0].endsWith("brain/subNoiseHeld14.jsonl") && rows.length === 60 && rows.every((r) => r.set === "held14") && R.BEHAVIOURS.every((b) => NZ.NOISE_ARMS.every((a) => rows.filter((r) => r.behaviour === b && r.arm === a).length === 2)) && /wrote 60 flights/.test(rd.o));
    const pl = (b, a) => lines.find((l) => l.startsWith(`  ${b.padEnd(11)} ${a.padEnd(22)} vs nominal`)) || "";
    const exPaired = (b, a, other) => { const A = seeds2.map((s) => reachedBy({ seed: s }, a, b)), B = seeds2.map((s) => reachedBy({ seed: s }, other, b)); return [A.filter((x, i) => x && !B[i]).length, A.filter((x, i) => !x && B[i]).length]; };
    const [pg, pl2] = exPaired("react-stop", "diff@3", NM), [rg, rl] = exPaired("react-stop", "diff@3", NZ.REFERENCE);
    ok("!! the pairs: each line gives the arm's gained and lost against the nominal arm and against any+replan, with the sign test's p", pl("react-stop", "diff@3").includes(`vs nominal ${String(pg).padStart(2)}/${String(pl2).padStart(2)} (p ${St.signP(pg, pl2).toFixed(3)})`) && pl("react-stop", "diff@3").includes(`vs any+replan ${String(rg).padStart(2)}/${String(rl).padStart(2)} (p ${St.signP(rg, rl).toFixed(3)})`) && lines.filter((l) => /vs nominal/.test(l)).length === 30);
    ok("!! the controls line says the controls held over 30 flights, or names what did not and misses E1", /^controls: every control flight is the flight it must be \(30 flights\)$/m.test(rd.o) && /^E1 .*: HELD$/m.test(rd.o) && /^controls: NOT HELD kf@0 3, exact react-stop 2 \(30 flights\)$/m.test(run(["--set", "held14", "--seeds", "1"], { fly: fake, controls: () => ({ ok: false, checked: 30, bad: ["kf@0 3", "exact react-stop 2"] }) }).o) && /^E1 .*: MISSED$/m.test(run(["--set", "held14", "--seeds", "1"], { fly: fake, controls: () => ({ ok: false, checked: 30, bad: ["x"] }) }).o));
    ok("!! a dev run writes nothing and ends with the verdict block", run(["--set", "dev", "--seeds", "1"], { fly: fake }).w.length === 0 && /E9 the verdict is SUPPORTED: (HELD|MISSED)$/.test(run(["--set", "dev", "--seeds", "1"], { fly: fake }).o));
    const im = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(path.join(HERE, "subNoiseStudy.mjs"))}).then(() => console.log("IMPORTED"))`], { encoding: "utf8", timeout: 60000 });
    ok("!! imported (not run as the command), the file prints nothing and flies nothing: the only output is the importer's own", im.status === 0 && im.stdout === "IMPORTED\n" && im.stderr === "", JSON.stringify(im.stdout.slice(0, 60)));
    const px = spawnSync(process.execPath, [path.join(HERE, "subNoiseStudy.mjs"), "--set", "dev", "--seeds", "1"], { encoding: "utf8", timeout: 240000 }), p2 = spawnSync(process.execPath, [path.join(HERE, "subNoiseStudy.mjs"), "--zzz"], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a process: --set dev --seeds 1 flies the real controls (30 flights, every one the flight it must be) and the real flights and ends with the verdict block, exit 0; an unknown flag exits 2 with the reason on stderr", px.status === 0 && /controls: every control flight is the flight it must be \(30 flights\)/.test(px.stdout) && /E9 the verdict is SUPPORTED/.test(px.stdout) && p2.status === 2 && /unknown argument/.test(p2.stderr), `exit ${px.status} / ${p2.status}`);
}

console.log(`\nsubNoiseStudy-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
