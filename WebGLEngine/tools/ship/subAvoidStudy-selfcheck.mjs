// WebGLEngine/tools/ship/subAvoidStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAvoidStudy-selfcheck.mjs      (about 15 s: arithmetic on hand-built summaries and a short DEV run end to end)
//
// THE STUDY OF A VESSEL THAT TURNS AWAY (tools/ship/subAvoidStudy.mjs), held to its word before HELD8 is flown ("FOLLOW-UP 8" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by arm, ship hits, medians over arrivals or over every flight, the counters, only the arms flown, in AVOID_ARMS order
//   3  THE VERDICT     A1 (5 more reached), A2 (ship collisions at most half), the verdict over their combinations, A3 to A7 each at its boundary, a missing cell is a miss
//   4  THE TEXT        the table and the verdict block
//   5  THE COMMAND     bad arguments (exit 2, named), a short DEV run end to end, run as a process, --write goes with held8 only and puts one JSON line a flight in brain/subAvoidHeld8.jsonl
//
// SABOTAGE LOG (serial mutation pass of tools/ship/subAvoidStudy.mjs, one mutant per code line and operator, at most four of each operator on a line): 70 mutants; 68 red on the first pass, 2 survivors, both EQUIVALENT: `process.argv[1] && ...` -> `||` (argv[1] is always set when a script runs) and `process.argv[1]` -> `argv[2]` in the same test (the process row passes arguments, so argv[2] is set; a run with NO arguments would differ and is the one thing not run here).
//   The table's widths and the title line, the A7 line and the missing-cell paths were written exact from the start, from the earlier study gate's survivors.
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the DEV and HELD8 flights themselves are the module's gate's.
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subAvoidStudy.mjs";
import * as A from "../../brain/subAvoidNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, arm, o = {}) => ({ kind: "hard-traffic", seed, arm, status: "reached", hit: null, reached: true, t: 100, path: 400, chord: 380, minClearance: 10, fires: 0, turns: 0, stuck: 0, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
const D = A.DESIGNATED, R = A.REFERENCE, Y = "any+predict+edge+yield+avoid";
console.log("subAvoidStudy-selfcheck -- the study of a vessel that turns away\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subAvoidHeld8.jsonl; the sets are the module's", St.OUT === "brain/subAvoidHeld8.jsonl" && St.SETS === A.SETS && St.SETS.held8.length === 60 && St.SETS.dev.length === 30);
    ok("!! the thresholds: gain 5, ship fraction 0.5, time factor 1.25, timeouts 3, the bar 48", same(St.THRESH, { gain: 5, shipFraction: 0.5, timeFactor: 1.25, timeouts: 3, bar: 48 }));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}
console.log("\n2. THE SUMMARY");
{
    const runs = [run(1, D, { t: 100, path: 380 * 1.1, minClearance: 10, fires: 3, turns: 2, stuck: 1 }), run(2, D, { t: 120, path: 380 * 1.3, minClearance: 20, fires: 4, turns: 3 }), run(3, D, { ...lose("collided"), hit: "ship", minClearance: -0.1 }), run(4, D, { ...lose("collided"), hit: "berg", minClearance: -0.2 }),
        run(5, D, { ...lose("collided"), hit: "ship", minClearance: -0.3 }), run(6, D, { ...lose("timeout"), minClearance: 2 }), run(7, D, { ...lose("left"), minClearance: 3 }), run(8, D, { ...lose("broached"), minClearance: 4 }), run(9, D, { ...lose("timeout"), minClearance: 6 }), run(1, R, { t: 90 })];
    const c = safe(() => St.summarize(runs)), x = c && c[D];
    ok("!! a cell counts flights: of nine designated flights 2 reached, 3 collided (2 with a ship), 2 timed out, 1 left, 1 other (broached); the rate is reached/n", !!x && x.n === 9 && x.reached === 2 && near(x.rate, 2 / 9) && x.collided === 3 && x.shipHits === 2 && x.timeout === 2 && x.left === 1 && x.other === 1, JSON.stringify(x));
    ok("!! the median clearance is over ALL flights (-0.3, -0.2, -0.1, 2, 3, 4, 6, 10, 20: 3); the median time and path/chord over ARRIVALS only (110 s; 1.2)", !!x && near(x.medianClearance, 3) && near(x.medianTime, 110) && near(x.medianChord, 1.2, 1e-9));
    ok("!! the counters sum over the cell's flights (fires 7, turns 5, stuck 1)", !!x && x.fires === 7 && x.turns === 5 && x.stuck === 1);
    ok("!! only the arms flown exist, in AVOID_ARMS order, each its own runs (the reference: 1 flight, 90 s)", !!c && Object.keys(c).join() === `${R},${D}` && c[R].n === 1 && c[R].medianTime === 90);
}
console.log("\n3. THE VERDICT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 0, shipHits: 0, left: 0, timeout: 0, other: 0, medianTime: 150, medianChord: 1.1, medianClearance: 5, fires: 0, turns: 0, stuck: 0, ...o });
    const base = () => ({ [R]: cell(60, 40, { shipHits: 14, left: 4 }), [D]: cell(60, 49, { shipHits: 6, left: 2, timeout: 1, medianTime: 160 }), [Y]: cell(60, 50) });
    const jb = safe(() => St.judge(base())), mod = (f) => { const b = base(); f(b); return safe(() => St.judge(b)); };
    ok("!! the base case: 49 against 40 and 6 ship hits against 14: SUPPORTED, A1 to A7 all held", !!jb && jb.a1 && jb.a2 && jb.verdict === "SUPPORTED" && jb.a3 && jb.a4 && jb.a5 && jb.a6 && jb.a7, JSON.stringify(jb));
    ok("!! A1 is 5 more reached (45 against 40 holds, 44 fails)", mod((b) => { b[D] = cell(60, 45, { shipHits: 6 }); }).a1 === true && mod((b) => { b[D] = cell(60, 44, { shipHits: 6 }); }).a1 === false);
    ok("!! A2 is ship hits at most HALF the reference's (7 of 14 holds, 8 fails)", mod((b) => { b[D] = cell(60, 49, { shipHits: 7 }); }).a2 === true && mod((b) => { b[D] = cell(60, 49, { shipHits: 8 }); }).a2 === false);
    ok("!! the verdict over the combinations: both -> SUPPORTED, A1 only, A2 only -> PARTLY SUPPORTED, neither -> NOT SUPPORTED", mod((b) => { b[D] = cell(60, 49, { shipHits: 9 }); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[D] = cell(60, 41, { shipHits: 5 }); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[D] = cell(60, 41, { shipHits: 9 }); }).verdict === "NOT SUPPORTED");
    ok("!! A3: exits at most the reference's (4 holds, 5 fails)", mod((b) => { b[D] = cell(60, 49, { shipHits: 6, left: 4 }); }).a3 === true && mod((b) => { b[D] = cell(60, 49, { shipHits: 6, left: 5 }); }).a3 === false);
    ok("!! A4: yield+avoid reaches at least as many as the designated (49 holds, 48 fails)", mod((b) => { b[Y] = cell(60, 49); }).a4 === true && mod((b) => { b[Y] = cell(60, 48); }).a4 === false);
    ok("!! A5: the median time at most 1.25 times the reference's (187.5 of 150 holds, 188 fails)", mod((b) => { b[D] = cell(60, 49, { shipHits: 6, medianTime: 187.5 }); }).a5 === true && mod((b) => { b[D] = cell(60, 49, { shipHits: 6, medianTime: 188 }); }).a5 === false);
    ok("!! A6: at most 3 timeouts (3 holds, 4 fails)", mod((b) => { b[D] = cell(60, 49, { shipHits: 6, timeout: 3 }); }).a6 === true && mod((b) => { b[D] = cell(60, 49, { shipHits: 6, timeout: 4 }); }).a6 === false);
    ok("!! A7: reaches 48 (48 holds, 47 fails)", mod((b) => { b[D] = cell(60, 48, { shipHits: 6 }); }).a7 === true && mod((b) => { b[D] = cell(60, 47, { shipHits: 6 }); }).a7 === false);
    ok("!! a missing cell is a miss, never a throw: no reference -> A1 A2 A3 A5 false, no yield+avoid -> A4 false, no designated -> A6 A7 false", (() => { const a = safe(() => St.judge({ [D]: base()[D], [Y]: base()[Y] })), b = safe(() => St.judge({ [R]: base()[R], [D]: base()[D] })), c = safe(() => St.judge({ [R]: base()[R] })); return !!a && !a.a1 && !a.a2 && !a.a3 && !a.a5 && !!b && !b.a4 && !!c && !c.a6 && !c.a7 && c.verdict === "NOT SUPPORTED"; })());
    ok("!! no cells at all: every claim false, NOT SUPPORTED", (() => { const j = safe(() => St.judge({})); return !!j && j.verdict === "NOT SUPPORTED" && !j.a1 && !j.a4 && !j.a6; })());
}
console.log("\n4. THE TEXT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 12, shipHits: 9, left: 3, timeout: 15, other: 0, medianTime: 150.5, medianChord: 1.1, medianClearance: 5, fires: 7, turns: 5, stuck: 1, ...o });
    const cells = { [R]: cell(60, 30) }, t = St.table(cells, "TITLE").split("\n");
    ok("!! a cell's line is exactly: the arm padded to 28, reached/n and the whole percent (30/60 is 50%) padded to 12, collided 8 wide with the ship hits in brackets, left 4, timeout 7, other 5, the median time 15 wide at two places, path/chord 17, clearance 24, the counters",
        t.length === 3 && t[0] === "TITLE" && t[1].startsWith("arm ") && t[2] === "any+predict+edge+yield       | 30/60 50%    |       12 ( 9)    3      15     0 |          150.50 |              1.10 |                     5.00 | 7 5 1", t[2]);
    const v = St.verdictText(safe(() => St.judge({ [R]: cell(60, 40), [D]: cell(60, 46) }))).split("\n");
    ok("!! the verdict block is one line for the verdict and one for each of A1 to A7, HELD or MISSED", v.length === 8 && v.slice(1).every((l, i) => l.startsWith(`A${i + 1} `) && /: (HELD|MISSED)$/.test(l)), v[0]);
    ok("!! the A7 line reads exactly: the designated arm reaches 48 of 60", /^A7 any\+predict\+edge\+avoid reaches 48 of 60: (HELD|MISSED)$/.test(v[7]), v[7]);
}
console.log("\n5. THE COMMAND");
{
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set name is exit 2 and names the sets", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held8/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2)", ["0", "1.5", "x"].every((v) => go(["--seeds", v]).code === 2));
    ok("!! an unknown argument is exit 2 and quoted", (() => { const g = go(["--bogus"]); return g.code === 2 && g.err.includes('"--bogus"'); })());
    ok("!! --write goes with held8 only (dev --write is exit 2 and writes nothing)", (() => { const g = go(["--set", "dev", "--write"]); return g.code === 2 && g.wrote.length === 0; })());
    const g = go(["--set", "dev", "--seeds", "1"]);
    ok("!! a 1-seed DEV run is exit 0, says 1 scenarios, 3 arms, prints the table and the verdict, and writes nothing", g.code === 0 && /DEV set: 1 scenarios of hard-traffic, 3 arms/.test(g.out) && /any\+predict\+edge\+yield +\|/.test(g.out) && /A7 /.test(g.out) && g.wrote.length === 0);
    ok("!! the table's title line is exact", g.out.split("\n")[2] === "ladder 12, 8, 6, 3 m, 260 s a flight, edge +20 m, yield 2 m/s, avoid: clear 30 m, look 25 s, step 15 degrees to 90, static clear 12 m", g.out.split("\n")[2]);
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subAvoidStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the table; `--seeds 0` exits 2 with the message on stderr", sp.status === 0 && /DEV set: 1 scenarios/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
    const w = go(["--set", "held8", "--seeds", "1", "--write"]);
    ok("!! --set held8 --seeds 1 --write puts brain/subAvoidHeld8.jsonl down with 3 JSON lines (1 seed x 3 arms), each with set held8 and seed 801", w.code === 0 && w.wrote.length === 1 && /subAvoidHeld8\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 3 && ls.every((l) => JSON.parse(l).set === "held8" && JSON.parse(l).seed === 801); })());
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
