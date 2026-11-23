// WebGLEngine/tools/ship/subTerrainStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subTerrainStudy-selfcheck.mjs      (about 8 s: arithmetic on hand-built summaries and a short run end to end)
//
// THE STUDY OF A DEPTH DIMENSION (tools/ship/subTerrainStudy.mjs), held to its word before HELD11 is flown ("FOLLOW-UP 11" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by status, the dived flights, medians over arrivals or over every flight, only the arms flown, the paired path ratio
//   3  THE VERDICT     SHORTER (paired median 0.97), SAFE, the verdict over their combinations, T1 to T7 each at its boundary, a missing cell is a miss
//   4  THE TEXT AND THE COMMAND   the table, the verdict block, bad arguments (exit 2, named), a short run end to end, run as a process, --write goes with held11 only
//
// SABOTAGE LOG: (filled by the serial mutation pass below)
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subTerrainStudy.mjs";
import * as T from "../../brain/subTerrain3dNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, arm, o = {}) => ({ seed, arm, status: "reached", reached: true, t: 100, path: 400, chord: 380, minFloor: 20, dives: 0, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
const D = T.DESIGNATED, R = T.REFERENCE;
console.log("subTerrainStudy-selfcheck -- the study of a depth dimension\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subTerrainHeld11.jsonl; the sets are the module's", St.OUT === "brain/subTerrainHeld11.jsonl" && St.SETS === T.SETS && St.SETS.held11.length === 60 && St.SETS.dev.length === 30);
    ok("!! the thresholds: shorter 0.97, reach slack 2, hazard slack 2, groundings 5, dived 30", same(St.THRESH, { shorter: 0.97, reachSlack: 2, hazardSlack: 2, groundings: 5, dived: 30 }));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}
console.log("\n2. THE SUMMARY");
{
    const runs = [run(1, D, { t: 100, path: 380 * 1.1, minFloor: 10, dives: 5 }), run(2, D, { t: 120, path: 380 * 1.3, minFloor: 30 }), run(3, D, { ...lose("grounded"), minFloor: -0.1, dives: 7 }), run(4, D, { ...lose("collided"), minFloor: 20 }), run(5, D, { ...lose("left"), minFloor: 25 }), run(6, D, { ...lose("timeout"), minFloor: 15 }),
        run(7, D, { ...lose("broached"), minFloor: null }), run(8, D, { dives: 1 }), run(1, R, { t: 90 })];
    const c = safe(() => St.summarize(runs)), x = c && c[D];
    ok("!! a cell counts flights: of eight designated 3 reached, 1 grounded, 1 collided, 1 left, 1 timed out, 1 other (broached); the rate is reached/n; three were held down by a keel (dives 5, 7 and exactly 1)", !!x && x.n === 8 && x.reached === 3 && near(x.rate, 3 / 8) && x.grounded === 1 && x.collided === 1 && x.left === 1 && x.timeout === 1 && x.other === 1 && x.dived === 3, JSON.stringify(x));
    ok("!! the median time and path/chord are over the ARRIVALS (100, 120 and the 100 s of seed 8: 100; path/chord 1.1, 1.3 and 400/380 = 1.0526: 1.1); the median floor over every flight with a reading (-0.1, 10, 15, 20, 20, 25, 30: 20; the null is skipped)", !!x && near(x.medianTime, 100) && near(x.medianChord, 1.1, 1e-9) && near(x.medianFloor, 20), `${x && x.medianTime} ${x && x.medianChord} ${x && x.medianFloor}`);
    ok("!! only the arms flown exist, in TERRAIN_ARMS order (any+floor before any+3d), each its own runs", !!c && Object.keys(c).join() === `${R},${D}` && c[R].n === 1 && c[R].medianTime === 90);
    const pr = [run(1, D, { path: 90 }), run(2, D, { path: 100 }), run(3, D, { path: 50 }), run(4, D, { ...lose("collided"), path: 10 }), run(1, R, { path: 100 }), run(2, R, { path: 100 }), run(3, R, { path: 100 }), run(4, R, { path: 100 }), run(5, R, { path: 100 })];
    ok("!! the paired path ratio is the median over seeds BOTH reached of path(a) / path(b): 0.9, 1.0, 0.5 -> 0.9 (the collided pair and the unpaired seeds are left out)", near(St.pairedPathRatio(pr, D, R), 0.9, 1e-12) && Number.isNaN(St.pairedPathRatio([], D, R)) && Number.isNaN(St.pairedPathRatio([run(1, D)], D, R)), `${St.pairedPathRatio(pr, D, R)}`);
}
console.log("\n3. THE VERDICT");
{
    const cell = (reached, o = {}) => ({ n: 60, reached, rate: reached / 60, grounded: 0, collided: 0, left: 0, timeout: 0, other: 0, dived: 0, medianChord: 1.1, medianTime: 150, medianFloor: 20, ...o });
    const base = () => ({ any: cell(50, { grounded: 8 }), [R]: cell(58, { grounded: 2, collided: 0 }), [D]: cell(58, { grounded: 1, collided: 1, dived: 35, medianTime: 140 }) });
    const jb = safe(() => St.judge(base(), 0.96)), mod = (f, ratio = 0.96) => { const b = base(); f(b); return safe(() => St.judge(b, ratio)); };
    ok("!! the base case: ratio 0.96, as safe: SUPPORTED, T1 to T7 all held", !!jb && jb.shorter && jb.safe && jb.verdict === "SUPPORTED" && jb.t1 && jb.t2 && jb.t3 && jb.t4 && jb.t5 && jb.t6 && jb.t7, JSON.stringify(jb));
    ok("!! SHORTER is a paired median ratio at most 0.97 (0.97 holds, 0.971 fails, NaN fails)", St.judge(base(), 0.97).shorter === true && St.judge(base(), 0.971).shorter === false && St.judge(base(), NaN).shorter === false);
    ok("!! SAFE: reaches no fewer than the reference minus 2 (56 holds, 55 fails) and groundings + collisions at most the reference's + 2 (4 holds, 5 fails)", mod((b) => { b[D] = cell(56, { grounded: 1, collided: 1, dived: 35 }); }).safe === true && mod((b) => { b[D] = cell(55, { grounded: 1, collided: 1, dived: 35 }); }).safe === false && mod((b) => { b[D] = cell(58, { grounded: 3, collided: 1, dived: 35 }); }).safe === true && mod((b) => { b[D] = cell(58, { grounded: 3, collided: 2, dived: 35 }); }).safe === false);
    ok("!! the verdict over the combinations: both -> SUPPORTED, shorter only, safe only -> PARTLY SUPPORTED, neither -> NOT SUPPORTED", mod((b) => { b[D] = cell(50, { grounded: 1, collided: 1, dived: 35 }); }).verdict === "PARTLY SUPPORTED" && St.judge(base(), 1.0).verdict === "PARTLY SUPPORTED" && mod((b) => { b[D] = cell(50, { grounded: 1, collided: 1 }); }, 1.0).verdict === "NOT SUPPORTED");
    ok("!! SAFE counts the REFERENCE's collisions too: reference 1 grounded + 2 collided = 3, designated 5 holds, 6 fails", mod((b) => { b[R] = cell(58, { grounded: 1, collided: 2 }); b[D] = cell(58, { grounded: 2, collided: 3, dived: 35 }); }).safe === true && mod((b) => { b[R] = cell(58, { grounded: 1, collided: 2 }); b[D] = cell(58, { grounded: 3, collided: 3, dived: 35 }); }).safe === false);
    ok("!! T1: `any` grounds in at least 5 (5 holds, 4 fails)", mod((b) => { b.any = cell(50, { grounded: 5 }); }).t1 === true && mod((b) => { b.any = cell(50, { grounded: 4 }); }).t1 === false);
    ok("!! T2: any+floor reaches at least as many as `any` (50 holds, 51 for `any` fails)", mod((b) => { b.any = cell(58); }).t2 === true && mod((b) => { b.any = cell(59); }).t2 === false);
    ok("!! T5: any+3d is held down in at least 30 flights (30 holds, 29 fails)", mod((b) => { b[D] = cell(58, { grounded: 1, collided: 1, dived: 30 }); }).t5 === true && mod((b) => { b[D] = cell(58, { grounded: 1, collided: 1, dived: 29 }); }).t5 === false);
    ok("!! T6: its groundings are at most half the reference's (1 of 2 holds, 2 of 2 fails)", mod((b) => { b[D] = cell(58, { grounded: 1, dived: 35 }); }).t6 === true && mod((b) => { b[D] = cell(58, { grounded: 2, dived: 35 }); }).t6 === false);
    ok("!! T7: its median arrival time is at most the reference's (150 holds, 151 fails)", mod((b) => { b[D] = cell(58, { grounded: 1, collided: 1, dived: 35, medianTime: 150 }); }).t7 === true && mod((b) => { b[D] = cell(58, { grounded: 1, collided: 1, dived: 35, medianTime: 151 }); }).t7 === false);
    ok("!! a missing cell is a miss, never a throw: no `any` -> T1 T2 false; no reference -> T2 T4 T6 T7 false; no designated -> T4 T5 T6 T7 false", (() => { const a = safe(() => St.judge({ [R]: base()[R], [D]: base()[D] }, 0.9)), b = safe(() => St.judge({ any: base().any, [D]: base()[D] }, 0.9)), c = safe(() => St.judge({ any: base().any, [R]: base()[R] }, 0.9)); return !!a && !a.t1 && !a.t2 && !!b && !b.t2 && !b.t4 && !b.t6 && !b.t7 && !!c && !c.t4 && !c.t5 && !c.t6 && !c.t7; })());
    ok("!! no cells at all: every claim false, NOT SUPPORTED when the ratio is not a number", (() => { const j = safe(() => St.judge({}, NaN)); return !!j && j.verdict === "NOT SUPPORTED" && !j.t1 && !j.t4 && !j.t7; })());
}
console.log("\n4. THE TEXT AND THE COMMAND");
{
    const cell = (reached, o = {}) => ({ n: 60, reached, rate: reached / 60, grounded: 7, collided: 12, left: 3, timeout: 2, other: 0, dived: 31, medianChord: 1.1, medianTime: 130.5, medianFloor: 22.25, ...o });
    const t = St.table({ [R]: cell(30) }, "TITLE").split("\n");
    ok("!! a cell's line is exactly: the arm padded to 10, reached/n and the whole percent (30/60 is 50%) padded to 12, grounded 8 wide, collided 8, left 4, timeout 7, other 5, dived 5, the median time 15, path/chord 17, the floor 20",
        t.length === 3 && t[0] === "TITLE" && t[1].startsWith("arm ") && t[2] === "any+floor  | 30/60 50%    |        7       12    3       2     0 |    31 |          130.50 |              1.10 |                22.25", t[2]);
    const v = St.verdictText(safe(() => St.judge({ any: cell(40), [R]: cell(50), [D]: cell(52) }, 0.95))).split("\n");
    ok("!! the verdict block is one line for the verdict and one for each of T1 to T7, HELD or MISSED; the T5 line reads exactly", v.length === 8 && v.slice(1).every((l, i) => l.startsWith(`T${i + 1} `) && /: (HELD|MISSED)$/.test(l)) && v[1] === "T1 any grounds in at least 5 of 60: HELD" && /^T5 any\+3d is held down by a keel in at least 30 of 60 flights: (HELD|MISSED)$/.test(v[5]), v[5]);
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set names the sets (exit 2)", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held11/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2)", ["0", "1.5", "x"].every((x) => go(["--seeds", x]).code === 2));
    ok("!! an unknown argument is exit 2 and quoted; --write goes with held11 only", (() => { const a = go(["--bogus"]), b = go(["--set", "dev", "--write"]); return a.code === 2 && a.err.includes('"--bogus"') && b.code === 2 && b.wrote.length === 0; })());
    const g = go(["--set", "dev", "--seeds", "2"]);
    ok("!! a 2-seed DEV run is exit 0, says 2 scenarios of hard-islands over a seabed, 3 arms, prints the table and the verdict, and writes nothing", g.code === 0 && /DEV set: 2 scenarios of hard-islands over a seabed, 3 arms/.test(g.out) && /any\+3d +\|/.test(g.out) && /T7 /.test(g.out) && g.wrote.length === 0);
    ok("!! the table's title line is exact", g.out.split("\n")[2] === "floor 65-85 m base, altitude 10 m, dive pad 20 m, look 90 m, ladder 12, 8, 6, 3 m, 260 s a flight", g.out.split("\n")[2]);
    const w = go(["--set", "held11", "--seeds", "1", "--write"]);
    ok("!! --set held11 --seeds 1 --write puts brain/subTerrainHeld11.jsonl down with 3 JSON lines (1 seed x 3 arms), each with set held11 and seed 1101", w.code === 0 && w.wrote.length === 1 && /subTerrainHeld11\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 3 && ls.every((l) => JSON.parse(l).set === "held11" && JSON.parse(l).seed === 1101); })());
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subTerrainStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the table; `--seeds 0` exits 2 with the message on stderr", sp.status === 0 && /DEV set: 1 scenarios/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
