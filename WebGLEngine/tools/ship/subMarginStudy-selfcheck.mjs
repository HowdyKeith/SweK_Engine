// WebGLEngine/tools/ship/subMarginStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subMarginStudy-selfcheck.mjs      (about 10 s: arithmetic on hand-built summaries and a short run end to end)
//
// THE SWEEP OF THE ANY-ANGLE ARM'S MARGINS (tools/ship/subMarginStudy.mjs), held to its word before HELD9 is flown ("FOLLOW-UP 9" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by cell, by kind, medians over arrivals, only the cells flown, in CELLS order
//   3  THE SELECTION   the best NON-INCUMBENT cell: reached, then collisions, then distance, then the smaller top, then the smaller vertical (each tie-break alone)
//   4  THE VERDICT     DEV predictions M1 M3 M4 M5; HELD9 pooled gain 5 and no kind losing more than 2, the three verdicts at their boundaries, M2, M6; a missing cell is a miss
//   5  THE TEXT AND THE COMMAND   the table, bad arguments (exit 2, named), a short DEV and HELD9 run end to end, run as a process, --write goes with held9 only
//
// SABOTAGE LOG (serial mutation pass of tools/ship/subMarginStudy.mjs, one mutant per code line and operator, at most four of each operator on a line): 107 mutants; 96 red on the first pass and 11 survivors read one by one: the missing-cell `kindsOk`, the whole percent, the title line, the recompute line's text, the recompute branch and the cell lookup with --cell.
//   Rows were added (the missing-cell fields exact, 30 of 60 is 50%, the exact title line, `--cell` flies the named cell, the recompute without `--cell` prints its exact first line and flies the chosen cell) and the nine survivors that rows could reach were run again: 9 mutants, 9 red. The 2 left are EQUIVALENT: `process.argv[1] && ...` -> `||` (argv[1] is always set when a script runs) and `process.argv[1]` -> `argv[2]` in the same test (the process row passes arguments, so argv[2] is set; a run with NO arguments would differ and is the one thing not run here).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line; the DEV and HELD9 flights themselves are the module's gate's.
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subMarginStudy.mjs";
import * as M from "../../brain/subMarginSweep.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, kind, cell, o = {}) => ({ kind, seed, cell, status: "reached", reached: true, t: 100, noRoute: false, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
const INC = "T12V5";
console.log("subMarginStudy-selfcheck -- the sweep of the any-angle arm's margins\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subMarginHeld9.jsonl; the sets are the module's", St.OUT === "brain/subMarginHeld9.jsonl" && St.SETS === M.SETS && St.SETS.held9.length === 60 && St.SETS.dev.length === 30);
    ok("!! the thresholds: gain 5, kind loss 2, partly low 3, DEV gain 3", same(St.THRESH, { gain: 5, kindLoss: 2, partlyLow: 3, devGain: 3 }));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
    ok("!! distance from the incumbent is |top - 12| + |vert - 5| ((12,5) 0, (8,2) 7, (24,12) 19, (16,5) 4)", St.distance({ top: 12, vert: 5 }) === 0 && St.distance({ top: 8, vert: 2 }) === 7 && St.distance({ top: 24, vert: 12 }) === 19 && St.distance({ top: 16, vert: 5 }) === 4);
}
console.log("\n2. THE SUMMARY");
{
    const c = "T16V8", runs = [run(1, "hard-islands", c, { t: 100 }), run(2, "hard-islands", c, { t: 120 }), run(3, "hard-islands", c, { ...lose("collided") }), run(4, "hard-gaps", c, { t: 200 }), run(5, "hard-gaps", c, { ...lose("timeout"), noRoute: true }), run(6, "hard-gaps", c, { ...lose("left") }), run(7, "hard-gaps", c, { ...lose("broached") }), run(1, "hard-islands", INC, { t: 90 })];
    const s = safe(() => St.summarize(runs)), x = s && s[c];
    ok("!! a cell counts flights: of seven, 3 reached, 1 collided, 1 timed out, 1 left, 1 other; 1 no-route; the kinds: islands 2 of 3, gaps 1 of 4", !!x && x.n === 7 && x.reached === 3 && x.collided === 1 && x.timeout === 1 && x.left === 1 && x.other === 1 && x.noRoute === 1 && same(x.byKind, { "hard-islands": { n: 3, reached: 2 }, "hard-gaps": { n: 4, reached: 1 } }), JSON.stringify(x));
    ok("!! the median time is over the ARRIVALS only (100, 120, 200: 120)", !!x && near(x.medianTime, 120));
    ok("!! only the cells flown exist, in CELLS order (T12V5 before T16V8), each its own runs; the cell object is the grid's", !!s && Object.keys(s).join() === `${INC},${c}` && s[INC].n === 1 && s[INC].medianTime === 90 && same(x.cell, { top: 16, vert: 8 }));
}
console.log("\n3. THE SELECTION");
{
    const cell = (nm, reached, o = {}) => { const m = /^T(\d+)V(\d+)$/.exec(nm); return { cell: { top: +m[1], vert: +m[2] }, n: 60, reached, collided: 0, left: 0, timeout: 0, other: 0, noRoute: 0, medianTime: 150, byKind: {}, ...o }; };
    const sel = (spec) => safe(() => St.chooseCell(Object.fromEntries(spec.map(([n, r, o]) => [n, cell(n, r, o)]))));
    ok("!! the incumbent is never chosen, however good: (12,5) 60 against (8,5) 50 chooses T8V5", sel([[INC, 60], ["T8V5", 50]]) === "T8V5");
    ok("!! the most reached wins first (T16V5 55 over T12V8 54 although it is further)", sel([[INC, 50], ["T12V8", 54], ["T16V5", 55]]) === "T16V5");
    ok("!! on equal reached the FEWER collisions win (T20V5 with 1 over T12V8 with 2)", sel([[INC, 50], ["T12V8", 55, { collided: 2 }], ["T20V5", 55, { collided: 1 }]]) === "T20V5");
    ok("!! then the smaller distance from the incumbent (T12V8, distance 3, over T16V5, distance 4)", sel([[INC, 50], ["T16V5", 55], ["T12V8", 55]]) === "T12V8");
    ok("!! then the smaller top rung (T8V5 distance 4 and T16V5 distance 4: T8V5)", sel([[INC, 50], ["T16V5", 55], ["T8V5", 55]]) === "T8V5");
    ok("!! then the smaller vertical margin (T12V2 and T12V8, both distance 3: T12V2)", sel([[INC, 50], ["T12V8", 55], ["T12V2", 55]]) === "T12V2");
    ok("!! no non-incumbent cell flown is null", sel([[INC, 50]]) === null && St.chooseCell({}) === null);
}
console.log("\n4. THE VERDICT");
{
    const cell = (nm, reached, byKind, o = {}) => { const m = /^T(\d+)V(\d+)$/.exec(nm); return { cell: { top: +m[1], vert: +m[2] }, n: 120, reached, collided: 0, left: 0, timeout: 0, other: 0, noRoute: 0, medianTime: 150, byKind: byKind || { "hard-islands": { n: 60, reached: reached >> 1 }, "hard-gaps": { n: 60, reached: reached - (reached >> 1) } }, ...o }; };
    const held = (cr, kinds) => ({ [INC]: cell(INC, 100, { "hard-islands": { n: 60, reached: 50 }, "hard-gaps": { n: 60, reached: 50 } }), T16V8: cell("T16V8", cr, kinds) });
    const j = (cr, kinds) => safe(() => St.judgeHeld(held(cr, kinds), "T16V8"));
    ok("!! a gain of 5 pooled with no kind losing more than 2 is SUPPORTED, M6 held, M2 missed", (() => { const x = j(105, { "hard-islands": { n: 60, reached: 55 }, "hard-gaps": { n: 60, reached: 50 } }); return !!x && x.gain === 5 && x.kindsOk && x.verdict === "SUPPORTED" && x.m6 && !x.m2; })());
    ok("!! a gain of 4 is PARTLY SUPPORTED; 3 is PARTLY SUPPORTED; 2 is NOT SUPPORTED (M2 held)", j(104).verdict === "PARTLY SUPPORTED" && j(103).verdict === "PARTLY SUPPORTED" && j(102).verdict === "NOT SUPPORTED" && j(102).m2 === true);
    ok("!! a gain of 5 or more with a kind losing MORE than 2 is PARTLY SUPPORTED (gaps 47 against 50 is a loss of 3), with a loss of exactly 2 it is SUPPORTED", j(106, { "hard-islands": { n: 60, reached: 59 }, "hard-gaps": { n: 60, reached: 47 } }).verdict === "PARTLY SUPPORTED" && j(106, { "hard-islands": { n: 60, reached: 58 }, "hard-gaps": { n: 60, reached: 48 } }).verdict === "SUPPORTED");
    ok("!! a loss or no gain: 100 and 90 pooled are NOT SUPPORTED, M6 held at 100 (gain 0) and missed at 99 (gain -1)", j(100).verdict === "NOT SUPPORTED" && j(100).m6 === true && j(99).m6 === false && j(90).verdict === "NOT SUPPORTED");
    ok("!! a missing cell: NOT SUPPORTED, every claim false (the gain NaN, the kinds not ok), no throw", (() => { const a = safe(() => St.judgeHeld({}, "T16V8")), b = safe(() => St.judgeHeld({ [INC]: held(105)[INC] }, "T16V8")), c = safe(() => St.judgeHeld(held(105), null)); return [a, b, c].every((x) => !!x && x.verdict === "NOT SUPPORTED" && x.m2 === false && x.m6 === false && x.kindsOk === false && Number.isNaN(x.gain)); })());
    const dc = (nm, reached) => cell(nm, reached), dev = (o) => ({ [INC]: dc(INC, 50), T8V2: dc("T8V2", 48), T16V8: dc("T16V8", 53), ...o });
    const jd = safe(() => St.judgeDev(dev(), "T16V8"));
    ok("!! DEV: a cell with 3 more than the incumbent holds M1 (53 against 50), the chosen top 16 > 12 holds M3, vertical 8 > 5 holds M4, T8V2 below the incumbent holds M5", !!jd && jd.m1 && jd.m3 && jd.m4 && jd.m5, JSON.stringify(jd));
    ok("!! M1 needs 3 (52 fails), M3 needs a top above 12 (T12V8 fails), M4 a vertical above 5 (T16V5 fails), M5 needs fewer (T8V2 at 50 fails)", !safe(() => St.judgeDev(dev({ T16V8: dc("T16V8", 52) }), "T16V8")).m1 && !safe(() => St.judgeDev(dev({ T12V8: dc("T12V8", 53) }), "T12V8")).m3 && !safe(() => St.judgeDev(dev({ T16V5: dc("T16V5", 53) }), "T16V5")).m4 && !safe(() => St.judgeDev(dev({ T8V2: dc("T8V2", 50) }), "T16V8")).m5);
    ok("!! DEV with the incumbent missing or no chosen cell: every claim false, no throw", (() => { const a = safe(() => St.judgeDev({ T16V8: dc("T16V8", 53) }, "T16V8")), b = safe(() => St.judgeDev(dev(), null)); return !!a && !a.m1 && !a.m5 && !!b && !b.m3 && !b.m4; })());
}
console.log("\n5. THE TEXT AND THE COMMAND");
{
    const cell = (nm, reached, o = {}) => { const m = /^T(\d+)V(\d+)$/.exec(nm); return { cell: { top: +m[1], vert: +m[2] }, n: 60, reached, collided: 4, left: 1, timeout: 2, other: 0, noRoute: 0, medianTime: 150.5, byKind: { "hard-islands": { n: 30, reached: 25 }, "hard-gaps": { n: 30, reached: 24 } }, ...o }; };
    const t = St.table({ T8V5: cell("T8V5", 49) }, "TITLE").split("\n");
    ok("!! a cell's line is exactly: name padded to 7, the ladder padded to 14, reached/n and the whole percent (49/60 is 82%) padded to 12, collided 8 wide, left 4, timeout 7, other 5, no route 8, median time 15, islands 7 and gaps 4",
        t.length === 3 && t[0] === "TITLE" && t[1].startsWith("cell ") && t[2] === "T8V5    8,6,3          | 49/60 82%    |        4    1       2     0 |        0 |          150.50 |      25   24", t[2]);
    ok("!! the whole percent is exact: 30 of 60 is 50% (not 51)", St.table({ T8V5: cell("T8V5", 30) }, "T").includes("| 30/60 50%    |"));
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set names the sets (exit 2)", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held9/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2)", ["0", "1.5", "x"].every((v) => go(["--seeds", v]).code === 2));
    ok("!! --cell must be a non-incumbent cell (T12V5 and T13V5 are exit 2) and goes with held9 only", go(["--set", "held9", "--cell", INC]).code === 2 && go(["--set", "held9", "--cell", "T13V5"]).code === 2 && go(["--set", "dev", "--cell", "T8V2"]).code === 2);
    ok("!! an unknown argument is exit 2 and quoted; --write goes with held9 only", (() => { const a = go(["--bogus"]), b = go(["--set", "dev", "--write"]); return a.code === 2 && a.err.includes('"--bogus"') && b.code === 2 && b.wrote.length === 0; })());
    const g = go(["--set", "dev", "--seeds", "1"]);
    ok("!! a 1-seed DEV run is exit 0, says 1 scenarios x 20 cells, prints twenty cell lines, the chosen cell and M1 to M5, and writes nothing", g.code === 0 && /DEV set: 1 scenarios of each of hard-islands, hard-gaps x 20 cells/.test(g.out) && (g.out.match(/^T\d+V\d+ +\S+ +\|/gm) || []).length === 20 && /^chosen .*: T/m.test(g.out) && /M5 /.test(g.out) && g.wrote.length === 0);
    ok("!! the DEV table's title line is exact", g.out.split("\n")[2] === "ladder: top rung then 12, 8, 6, 3 below it; vertical margin moved through minDepth; 260 s a flight; arm any", g.out.split("\n")[2]);
    const w = go(["--set", "held9", "--seeds", "1", "--cell", "T16V8", "--write"]);
    ok("!! with --cell the incumbent and T16V8 themselves are flown (both names are on table lines, no DEV recompute is printed)", /^T12V5 +\S+ +\|/m.test(w.out) && /^T16V8 +\S+ +\|/m.test(w.out) && !/DEV selection/.test(w.out));
    const rc = go(["--set", "held9", "--seeds", "1"]);
    ok("!! without --cell the DEV selection is recomputed from seeds 1 to 30, printed exactly, and that cell is the one flown (T12V2 on this tree)", rc.code === 0 && rc.out.split("\n")[0] === "DEV selection (recomputed from seeds 1 to 30): T12V2" && /the incumbent T12V5 and T12V2/.test(rc.out) && /^T12V2 +\S+ +\|/m.test(rc.out), rc.out.split("\n")[0]);
    ok("!! held9 with --cell T16V8 --seeds 1 --write is exit 0, flies the incumbent and T16V8 only, says so, and writes 4 JSON lines (2 cells x 2 kinds x 1 seed) each with set held9 and seed 901", w.code === 0 && /HELD9 set: 1 scenarios of each of hard-islands, hard-gaps, the incumbent T12V5 and T16V8/.test(w.out) && (w.out.match(/^T\d+V\d+ +\S+ +\|/gm) || []).length === 2 && /M6 /.test(w.out) && w.wrote.length === 1 && /subMarginHeld9\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 4 && ls.every((l) => JSON.parse(l).set === "held9" && JSON.parse(l).seed === 901); })());
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subMarginStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the sweep; `--seeds 0` exits 2 with the message on stderr", sp.status === 0 && /DEV set: 1 scenarios/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
