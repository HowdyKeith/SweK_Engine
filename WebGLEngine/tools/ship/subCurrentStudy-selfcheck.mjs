// WebGLEngine/tools/ship/subCurrentStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subCurrentStudy-selfcheck.mjs      (about 10 s: arithmetic on hand-built summaries and a short DEV run end to end)
//
// THE STUDY OF THE CURRENT IN THE FIELD (tools/ship/subCurrentStudy.mjs), held to its word before HELD7 is flown ("FOLLOW-UP 7" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by strength and arm, medians over arrivals or over every flight, only the cells flown, in STRENGTHS then CURRENT_ARMS order
//   3  THE VERDICT     the x1.5 gain (5 more reached), the x1.0 gain (collisions at most half the reference's AND no fewer reached), the verdict over their combinations, C1 to C8 each at its boundary, a missing cell is a miss
//   4  THE TEXT        the table and the verdict block
//   5  THE COMMAND     bad arguments (exit 2, named), a short DEV run end to end, --write goes with held7 only and puts one JSON line a flight in brain/subCurrentHeld7.jsonl
//
// SABOTAGE LOG (serial mutation pass of tools/ship/subCurrentStudy.mjs, one mutant per code line and operator, at most four of each operator on a line, one worktree): 86 mutants; 68 red on the first pass and 18 survivors read one by one: the table's column widths and decimals, its title line, the C1 line's text, the missing-cell ratio and the entry point.
//   Rows were added (the exact cell line, the exact title, the exact C1 line, a missing designated cell with the reference present, the command run as a process with and without a good argument) and the pass was run again: 84 mutants, 82 red, 2 survivors, both EQUIVALENT: `process.argv[1] && ...` -> `||` (argv[1] is always set when a script runs) and `process.argv[1]` -> `argv[2]` in the same test (the process row passes arguments, so argv[2] is set; a run with NO arguments would differ and is the one thing not run here).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the DEV and HELD7 flights themselves are the module's gate's.
"use strict";
import * as St from "./subCurrentStudy.mjs";
import * as C from "../../brain/subCurrentNav.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, strength, arm, o = {}) => ({ kind: "hard-current", seed, strength, arm, status: "reached", reached: true, t: 100, path: 400, chord: 380, minClearance: 10, noRoute: false, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
const D = C.DESIGNATED, R = C.REFERENCE;
console.log("subCurrentStudy-selfcheck -- the study of the current in the field\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subCurrentHeld7.jsonl; the sets are the module's", St.OUT === "brain/subCurrentHeld7.jsonl" && St.SETS === C.SETS && St.SETS.held7.length === 60 && St.SETS.dev.length === 30);
    ok("!! the thresholds: gain 5, collision fraction 0.5, weak 47 (C1), crab over margin 3 (C4), time factor 1.15 (C6), timeouts 3 (C7), no route 1 (C8)", same(St.THRESH, { gain: 5, collisionFraction: 0.5, weak: 47, crabOverMargin: 3, timeFactor: 1.15, timeouts: 3, noRoute: 1 }));
    const xs = [5, 1, 3];
    ok("!! median: the middle of an odd count (5, 1, 3 -> 3), the mean of the middle two of an even one (1, 2, 3, 10 -> 2.5), NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}
console.log("\n2. THE SUMMARY");
{
    const k = "x1.5", runs = [run(1, k, D, { t: 100, path: 380 * 1.1, minClearance: 10 }), run(2, k, D, { t: 120, path: 380 * 1.3, minClearance: 20 }), run(3, k, D, { ...lose("collided"), minClearance: -0.1 }), run(4, k, D, { ...lose("collided"), minClearance: -0.2 }),
        run(5, k, D, { ...lose("timeout"), minClearance: 2 }), run(6, k, D, { ...lose("timeout"), minClearance: 3, noRoute: true }), run(7, k, D, { ...lose("left"), minClearance: 4 }), run(8, k, D, { ...lose("broached"), minClearance: 6 }), run(9, k, D, { ...lose("collided"), minClearance: -0.3 }), run(1, "x1.0", R, { t: 200 }), run(1, k, R, { t: 90 })];
    const sum = safe(() => St.summarize(runs)), x = sum && sum.cells[k] && sum.cells[k][D];
    ok("!! a cell counts flights by status: of nine x1.5 designated flights 2 reached, 3 collided, 2 timed out, 1 left, 1 other (broached), 1 no-route; the rate is reached/n", !!x && x.n === 9 && x.reached === 2 && near(x.rate, 2 / 9) && x.collided === 3 && x.timeout === 2 && x.left === 1 && x.other === 1 && x.noRoute === 1, JSON.stringify(x));
    ok("!! the median clearance is over ALL the flights (-0.3, -0.2, -0.1, 2, 3, 4, 6, 10, 20: 3), the median time and path/chord over the ARRIVALS only (110 s; 1.2)", !!x && near(x.medianClearance, 3) && near(x.medianTime, 110) && near(x.medianChord, 1.2, 1e-9), `${x && x.medianClearance} ${x && x.medianTime} ${x && x.medianChord}`);
    ok("!! only the cells flown exist, keyed by strength then arm in STRENGTHS and CURRENT_ARMS order, and a cell's runs are its own (x1.0 reference 1 flight, 200 s; x1.5 reference 1 flight, 90 s)", !!sum && Object.keys(sum.cells).join() === "x1.0,x1.5" && Object.keys(sum.cells[k]).join() === `${R},${D}` && sum.cells["x1.0"][R].n === 1 && sum.cells["x1.0"][R].medianTime === 200 && sum.cells[k][R].medianTime === 90);
}
console.log("\n3. THE VERDICT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 0, left: 0, timeout: 0, other: 0, noRoute: 0, medianTime: 150, medianChord: 1.1, medianClearance: 5, ...o });
    const base = () => ({ cells: {
        "x1.0": { [R]: cell(60, 56, { collided: 4 }), "any+crab": cell(60, 58), "any+margin": cell(60, 55), [D]: cell(60, 58, { collided: 2 }) },
        "x1.5": { [R]: cell(60, 40, { collided: 15 }), "any+crab": cell(60, 48), "any+margin": cell(60, 41), [D]: cell(60, 46, { timeout: 1, medianTime: 160 }) } } });
    const jb = safe(() => St.judge(base())), mod = (f) => { const b = base(); f(b.cells); return safe(() => St.judge(b)); };
    ok("!! the base case has both gains (x1.5: 46 against 40; x1.0: 2 collisions against 4 and 58 against 56): SUPPORTED, and C1 to C8 all held", !!jb && jb.gain15 && jb.gain10 && jb.verdict === "SUPPORTED" && jb.c1 && jb.c2 && jb.c3 && jb.c4 && jb.c5 && jb.c6 && jb.c7 && jb.c8, JSON.stringify(jb));
    ok("!! the x1.5 GAIN is 5 more than the reference (45 against 40 holds, 44 fails)", mod((c) => { c["x1.5"][D] = cell(60, 45); }).gain15 === true && mod((c) => { c["x1.5"][D] = cell(60, 44); }).gain15 === false);
    ok("!! the x1.0 GAIN: collisions at most HALF the reference's (2 of 4 holds, 3 of 4 fails) AND no fewer reached (56 holds, 55 fails)", mod((c) => { c["x1.0"][D] = cell(60, 56, { collided: 2 }); }).gain10 === true && mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 3 }); }).gain10 === false && mod((c) => { c["x1.0"][D] = cell(60, 55, { collided: 2 }); }).gain10 === false);
    ok("!! the verdict over the combinations: both -> SUPPORTED, x1.5 only -> PARTLY SUPPORTED, x1.0 only -> PARTLY SUPPORTED, neither -> NOT SUPPORTED",
        mod((c) => { c["x1.0"][D] = cell(60, 50, { collided: 9 }); }).verdict === "PARTLY SUPPORTED" && mod((c) => { c["x1.5"][D] = cell(60, 41); }).verdict === "PARTLY SUPPORTED" && mod((c) => { c["x1.0"][D] = cell(60, 50, { collided: 9 }); c["x1.5"][D] = cell(60, 41); }).verdict === "NOT SUPPORTED");
    ok("!! C1: the reference reaches at most 47 at x1.5 (47 holds, 48 fails)", mod((c) => { c["x1.5"][R] = cell(60, 47); }).c1 === true && mod((c) => { c["x1.5"][R] = cell(60, 48); }).c1 === false);
    ok("!! C4: at x1.5 any+crab reaches at least 3 more than any+margin (44 against 41 holds, 43 fails)", mod((c) => { c["x1.5"]["any+crab"] = cell(60, 44); }).c4 === true && mod((c) => { c["x1.5"]["any+crab"] = cell(60, 43); }).c4 === false);
    ok("!! C5: at x1.0 any+margin reaches no more than the reference (56 holds, 57 fails)", mod((c) => { c["x1.0"]["any+margin"] = cell(60, 56); }).c5 === true && mod((c) => { c["x1.0"]["any+margin"] = cell(60, 57); }).c5 === false);
    ok("!! C6: the median arrival time at most 1.15 times the reference's at BOTH strengths (172.5 of 150 holds, 173 fails; each strength on its own)",
        mod((c) => { c["x1.5"][D] = cell(60, 46, { medianTime: 172.5 }); }).c6 === true && mod((c) => { c["x1.5"][D] = cell(60, 46, { medianTime: 173 }); }).c6 === false && mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 2, medianTime: 173 }); }).c6 === false);
    ok("!! C7: the designated arm times out in at most 3 flights in all (2 + 1 holds, 2 + 2 fails)", mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 2, timeout: 2 }); }).c7 === true && mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 2, timeout: 2 }); c["x1.5"][D] = cell(60, 46, { timeout: 2 }); }).c7 === false);
    ok("!! C8: at most 1 no-route scenario in all (1 holds, 2 fails)", mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 2, noRoute: 1 }); }).c8 === true && mod((c) => { c["x1.0"][D] = cell(60, 58, { collided: 2, noRoute: 1 }); c["x1.5"][D] = cell(60, 46, { noRoute: 1 }); }).c8 === false);
    ok("!! a missing cell is a miss, never a throw (no x1.5 cells: NOT SUPPORTED-or-PARTLY, C1 C4 C6 C7 C8 false)", (() => { const j = safe(() => St.judge({ cells: { "x1.0": base().cells["x1.0"] } })); return !!j && j.gain15 === false && j.c1 === false && j.c4 === false && j.c6 === false && j.c7 === false && j.c8 === false; })());
    ok("!! a missing designated cell at x1.5 with the reference present is a miss too, never a throw", (() => { const b = base(); delete b.cells["x1.5"][D]; const j = safe(() => St.judge(b)); return !!j && j.gain15 === false && j.c6 === false && j.c7 === false; })());
    ok("!! no cells at all: every claim false, NOT SUPPORTED", (() => { const j = safe(() => St.judge({ cells: {} })); return !!j && j.verdict === "NOT SUPPORTED" && !j.c1 && !j.c5 && !j.c7 && !j.c8; })());
}
console.log("\n4. THE TEXT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 3, left: 1, timeout: 2, other: 0, noRoute: 0, medianTime: 150.5, medianChord: 1.1, medianClearance: 5, ...o });
    const sum = { cells: { "x1.5": { [R]: cell(60, 40), [D]: cell(60, 46) } } }, t = St.table(sum, "TITLE").split("\n");
    const sum2 = { cells: { "x1.5": { [R]: cell(60, 30, { collided: 12, left: 3, timeout: 15, other: 0, medianTime: 150.5, medianChord: 1.1, medianClearance: 5 }) } } }, t2 = St.table(sum2, "TITLE").split("\n");
    ok("!! the table: the title, a header, then one line a cell flown (here two, then one)", t[0] === "TITLE" && t.length === 4 && t2.length === 3 && t[1].startsWith("strength arm") && /any\+crab\+margin +\| 46\/60 77%/.test(t[3]), t[3]);
    ok("!! a cell's line is exactly: strength padded to 8, arm to 16, reached/n and the whole percent (30/60 is 50%) padded to 12, collided 8 wide, left 4, timeout 7, other 5, no route 8, median time 15 wide at two places, path/chord 17, clearance 24",
        t2[2] === "x1.5     any              | 30/60 50%    |       12    3      15     0 |        0 |          150.50 |              1.10 |                     5.00", t2[2]);
    const v0 = (v) => v[1];
    const v = St.verdictText(safe(() => St.judge({ cells: { "x1.5": { [R]: cell(60, 40), [D]: cell(60, 46) } } }))).split("\n");
    ok("!! the C1 line reads exactly: the reference reaches at most 47 of 60 at x1.5", v0(v) === "C1 any reaches at most 47 of 60 at x1.5: HELD", v0(v));
    ok("!! the verdict block is one line for the verdict and one for each of C1 to C8, HELD or MISSED", v.length === 9 && /=> PARTLY SUPPORTED|=> NOT SUPPORTED/.test(v[0]) && v.slice(1).every((l, i) => l.startsWith(`C${i + 1} `) && /: (HELD|MISSED)$/.test(l)), v[0]);
}
console.log("\n5. THE COMMAND");
{
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set name is exit 2 and names the sets", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held7/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2)", ["0", "1.5", "x"].every((v) => go(["--seeds", v]).code === 2));
    ok("!! an unknown argument is exit 2 and quoted", (() => { const g = go(["--bogus"]); return g.code === 2 && g.err.includes('"--bogus"'); })());
    ok("!! --write goes with held7 only (dev --write is exit 2 and writes nothing)", (() => { const g = go(["--set", "dev", "--write"]); return g.code === 2 && g.wrote.length === 0; })());
    const g = go(["--set", "dev", "--seeds", "2"]);
    ok("!! a 2-seed DEV run is exit 0, says 2 scenarios, 2 strengths, 4 arms, prints the table and the verdict, and writes nothing", g.code === 0 && /DEV set: 2 scenarios of hard-current x 2 strengths, 4 arms/.test(g.out) && /x1\.0 +any +\|/.test(g.out) && /C8 /.test(g.out) && g.wrote.length === 0);
    ok("!! the table's cells hold 2 flights each", /\| (\d)\/2 /.test(g.out) && !/\/3 /.test(g.out));
    ok("!! the table's title line is exact", g.out.split("\n")[2] === "ladder 12, 8, 6, 3 m (raised by |c| x 18.3 s for the margin arms), 260 s a flight, crab clamp 0.9", g.out.split("\n")[2]);
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subCurrentStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the table; `--seeds 0` exits 2 and prints to stderr (the entry point is live and takes argv from the third place)", sp.status === 0 && /DEV set: 1 scenarios/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
    const w = go(["--set", "held7", "--seeds", "1", "--write"]);
    ok("!! --set held7 --seeds 1 --write puts brain/subCurrentHeld7.jsonl down with 8 JSON lines (1 seed x 2 strengths x 4 arms), each with set held7", w.code === 0 && w.wrote.length === 1 && /subCurrentHeld7\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 8 && ls.every((l) => JSON.parse(l).set === "held7" && JSON.parse(l).seed === 701); })());
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
