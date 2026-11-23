// WebGLEngine/tools/ship/subMissionStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subMissionStudy-selfcheck.mjs      (about 10 s: arithmetic on hand-built summaries and a short run end to end)
//
// THE STUDY OF MISSIONS AND WHAT A METRE COSTS (tools/ship/subMissionStudy.mjs), held to its word before HELD10 is flown ("FOLLOW-UP 10" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by status, legs, medians over completes or over every mission, only the arms flown, in MISSION_ARMS order
//   3  THE VERDICT     GAIN (5 more complete), COST MATTERS (5 energy-outs), the verdict over their combinations, E3 to E6 each at its boundary, a missing cell is a miss
//   4  THE TEXT AND THE COMMAND   the table, the verdict block, bad arguments (exit 2, named), a short run end to end, run as a process, --write goes with held10 only
//
// SABOTAGE LOG: (filled by the serial mutation pass below)
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subMissionStudy.mjs";
import * as M from "../../brain/subMissionNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, arm, o = {}) => ({ seed, arm, status: "complete", complete: true, legs: 3, t: 300, path: 800, chord: 700, energyUsed: 2.0e6, jPerM: 2500, ...o });
const lose = (status, o = {}) => ({ status, complete: false, t: null, ...o });
const D = M.DESIGNATED, R = M.REFERENCE;
console.log("subMissionStudy-selfcheck -- the study of missions and what a metre costs\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subMissionHeld10.jsonl; the sets are the module's", St.OUT === "brain/subMissionHeld10.jsonl" && St.SETS === M.SETS && St.SETS.held10.length === 60 && St.SETS.dev.length === 30);
    ok("!! the thresholds: gain 5, energy-outs 5, half 0.5, the bar 36", same(St.THRESH, { gain: 5, energyOuts: 5, halfFraction: 0.5, bar: 36 }));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}
console.log("\n2. THE SUMMARY");
{
    const runs = [run(1, D, { t: 300, path: 700 * 1.1, energyUsed: 1.0e6, jPerM: 1800 }), run(2, D, { t: 360, path: 700 * 1.3, energyUsed: 2.0e6, jPerM: 2000 }), run(3, D, { ...lose("energy-out"), legs: 2, energyUsed: 3.0e6, jPerM: 3000 }), run(4, D, { ...lose("collided"), legs: 1, energyUsed: 0.5e6, jPerM: 2200 }),
        run(5, D, { ...lose("collided"), legs: 0, energyUsed: 0.1e6, jPerM: 2400 }), run(6, D, { ...lose("left"), legs: 0, energyUsed: 0.2e6, jPerM: 2600 }), run(7, D, { ...lose("timeout"), legs: 2, energyUsed: 1.5e6, jPerM: 2100 }), run(8, D, { ...lose("broached"), legs: 0, energyUsed: 0.3e6, jPerM: 2300 }), run(1, R, { t: 280 })];
    const c = safe(() => St.summarize(runs)), x = c && c[D];
    ok("!! a cell counts missions: of eight designated 2 complete, 1 energy-out, 2 collided, 1 left, 1 timeout, 1 other (broached); the rate is complete/n; the legs sum (3+3+2+1+0+0+2+0 = 11)", !!x && x.n === 8 && x.complete === 2 && near(x.rate, 0.25) && x.energyOut === 1 && x.collided === 2 && x.left === 1 && x.timeout === 1 && x.other === 1 && x.legs === 11, JSON.stringify(x));
    ok("!! the median time and path/chord are over the COMPLETES (300 and 360 s: 330; 1.1 and 1.3: 1.2), the median MJ and J/m over EVERY mission (energy 0.1 0.2 0.3 0.5 1.0 1.5 2.0 3.0 MJ: 0.75; J/m 1800 2000 2100 2200 2300 2400 2600 3000: 2250)", !!x && near(x.medianTime, 330) && near(x.medianChord, 1.2, 1e-9) && near(x.medianEnergyMJ, 0.75, 1e-9) && near(x.medianJPerM, 2250, 1e-9), `${x && x.medianTime} ${x && x.medianChord} ${x && x.medianEnergyMJ} ${x && x.medianJPerM}`);
    ok("!! only the arms flown exist, in MISSION_ARMS order, each its own runs (the reference: 1 mission, 280 s)", !!c && Object.keys(c).join() === `${R},${D}` && c[R].n === 1 && c[R].medianTime === 280);
}
console.log("\n3. THE VERDICT");
{
    const cell = (reached, o = {}) => ({ n: 60, complete: reached, rate: reached / 60, energyOut: 0, collided: 0, left: 0, timeout: 0, other: 0, legs: 0, medianTime: 300, medianEnergyMJ: 1, medianJPerM: 2000, medianChord: 1.2, ...o });
    const base = () => ({ "any+replan": cell(40), [R]: cell(36, { energyOut: 8, timeout: 1 }), [D]: cell(44, { energyOut: 3, timeout: 4 }) });
    const jb = safe(() => St.judge(base())), mod = (f) => { const b = base(); f(b); return safe(() => St.judge(b)); };
    ok("!! the base case: 44 against 36 and 8 energy-outs: SUPPORTED, E1 to E6 all held", !!jb && jb.gain && jb.cost && jb.verdict === "SUPPORTED" && jb.e1 && jb.e2 && jb.e3 && jb.e4 && jb.e5 && jb.e6, JSON.stringify(jb));
    ok("!! GAIN is 5 more complete than the reference (41 against 36 holds, 40 fails)", mod((b) => { b[D] = cell(41, { energyOut: 3, timeout: 4 }); }).gain === true && mod((b) => { b[D] = cell(40, { energyOut: 3, timeout: 4 }); }).gain === false);
    ok("!! COST MATTERS is 5 energy-outs in the reference (5 holds, 4 fails)", mod((b) => { b[R] = cell(36, { energyOut: 5, timeout: 1 }); }).cost === true && mod((b) => { b[R] = cell(36, { energyOut: 4, timeout: 1 }); }).cost === false);
    ok("!! the verdict over the combinations: both -> SUPPORTED, gain only, cost only -> PARTLY SUPPORTED, neither -> NOT SUPPORTED", mod((b) => { b[R] = cell(36, { energyOut: 4 }); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[D] = cell(40); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[R] = cell(36, { energyOut: 4 }); b[D] = cell(40); }).verdict === "NOT SUPPORTED");
    ok("!! E3: any+replan completes at least as many as the reference (36 holds, 35 fails)", mod((b) => { b["any+replan"] = cell(36); }).e3 === true && mod((b) => { b["any+replan"] = cell(35); }).e3 === false);
    ok("!! E4: the designated arm times out in MORE missions than the reference (2 against 1 holds, 1 against 1 fails)", mod((b) => { b[D] = cell(44, { energyOut: 3, timeout: 2 }); }).e4 === true && mod((b) => { b[D] = cell(44, { energyOut: 3, timeout: 1 }); }).e4 === false);
    ok("!! E5: the designated energy-outs are at most half the reference's (4 of 8 holds, 5 of 8 fails)", mod((b) => { b[D] = cell(44, { energyOut: 4, timeout: 4 }); }).e5 === true && mod((b) => { b[D] = cell(44, { energyOut: 5, timeout: 4 }); }).e5 === false);
    ok("!! E6: the designated arm completes 36 (36 holds, 35 fails)", mod((b) => { b[D] = cell(36, { energyOut: 3 }); }).e6 === true && mod((b) => { b[D] = cell(35, { energyOut: 3 }); }).e6 === false);
    ok("!! a missing cell is a miss, never a throw: no reference -> E1 E2 E3 E4 E5 false; no designated -> E2 E4 E5 E6 false; no any+replan -> E3 false", (() => { const a = safe(() => St.judge({ [D]: base()[D], "any+replan": base()["any+replan"] })), b = safe(() => St.judge({ [R]: base()[R], "any+replan": base()["any+replan"] })), c = safe(() => St.judge({ [R]: base()[R], [D]: base()[D] })); return !!a && !a.e1 && !a.e2 && !a.e3 && !a.e4 && !a.e5 && !!b && !b.e2 && !b.e4 && !b.e5 && !b.e6 && !!c && !c.e3; })());
    ok("!! no cells at all: every claim false, NOT SUPPORTED", (() => { const j = safe(() => St.judge({})); return !!j && j.verdict === "NOT SUPPORTED" && !j.e1 && !j.e3 && !j.e6; })());
}
console.log("\n4. THE TEXT AND THE COMMAND");
{
    const cell = (reached, o = {}) => ({ n: 60, complete: reached, rate: reached / 60, energyOut: 7, collided: 12, left: 3, timeout: 2, other: 0, legs: 120, medianTime: 330.5, medianEnergyMJ: 1.75, medianJPerM: 2250, medianChord: 1.2, ...o });
    const t = St.table({ [R]: cell(30) }, "TITLE").split("\n");
    ok("!! a cell's line is exactly: the arm padded to 29, complete/n and the whole percent (30/60 is 50%) padded to 12, energy-out 10 wide, collided 8, left 4, timeout 7, other 5, legs 4, the median time 15, MJ 9, J/m 10, path/chord 17",
        t.length === 3 && t[0] === "TITLE" && t[1].startsWith("arm ") && t[2] === "any+predict+edge+yield        | 30/60 50%    |          7       12    3       2     0 |  120 |          330.50 |      1.75 |    2250.00 |              1.20", t[2]);
    const v = St.verdictText(safe(() => St.judge({ [R]: cell(30), [D]: cell(40), "any+replan": cell(31) }))).split("\n");
    ok("!! the verdict block is one line for the verdict and one for each of E1 to E6, HELD or MISSED", v.length === 7 && v.slice(1).every((l, i) => l.startsWith(`E${i + 1} `) && /: (HELD|MISSED)$/.test(l)), v[0]);
    ok("!! the E6 line reads exactly: the designated arm completes 36 of 60", /^E6 any\+predict\+edge\+yield@2\.5 completes 36 of 60: (HELD|MISSED)$/.test(v[6]), v[6]);
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set names the sets (exit 2)", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held10/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2)", ["0", "1.5", "x"].every((x) => go(["--seeds", x]).code === 2));
    ok("!! an unknown argument is exit 2 and quoted; --write goes with held10 only", (() => { const a = go(["--bogus"]), b = go(["--set", "dev", "--write"]); return a.code === 2 && a.err.includes('"--bogus"') && b.code === 2 && b.wrote.length === 0; })());
    const g = go(["--set", "dev", "--seeds", "1"]);
    ok("!! a 1-seed DEV run is exit 0, says 1 missions (0 dropped) and 4 arms, prints the table and the verdict, and writes nothing", g.code === 0 && /DEV set: 1 missions of hard-traffic \(0 dropped for want of waypoints\), 4 arms/.test(g.out) && /any\+replan +\|/.test(g.out) && /E6 /.test(g.out) && g.wrote.length === 0);
    ok("!! the table's title line is exact", g.out.split("\n")[2] === "battery 3.0 MJ, 450 s a mission, start -> W1 -> W2 -> goal (chord sum 600 to 850 m), cruise 2675 J/m, 2.5 m/s 1891 J/m", g.out.split("\n")[2]);
    const w = go(["--set", "held10", "--seeds", "1", "--write"]);
    ok("!! --set held10 --seeds 1 --write puts brain/subMissionHeld10.jsonl down with 4 JSON lines (1 mission x 4 arms), each with set held10 and seed 1001", w.code === 0 && w.wrote.length === 1 && /subMissionHeld10\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 4 && ls.every((l) => JSON.parse(l).set === "held10" && JSON.parse(l).seed === 1001); })());
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subMissionStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the table; `--seeds 0` exits 2 with the message on stderr", sp.status === 0 && /DEV set: 1 missions/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
