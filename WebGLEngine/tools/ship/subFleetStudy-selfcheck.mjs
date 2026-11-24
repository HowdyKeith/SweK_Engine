// WebGLEngine/tools/ship/subFleetStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subFleetStudy-selfcheck.mjs      (about 15 s: arithmetic on hand-built summaries and a short run end to end)
//
// THE STUDY OF A FLEET OF COURIERS (tools/ship/subFleetStudy.mjs), held to its word before HELD12 is flown ("FOLLOW-UP 12" in brain/SUB_FIELD_NAV_WIP.md):
//   1  THE CONSTANTS   the file, the sets, the thresholds
//   2  THE SUMMARY     counts by size and arm, the median per run, only the cells flown, in SIZES then FLEET_ARMS order
//   3  THE VERDICT     GAIN (sub contacts at most half), KEEPS MOVING (arrivals at least 0.9), the verdict over their combinations, F1 to F6 each at its boundary, a missing cell is a miss
//   4  THE TEXT AND THE COMMAND   the table, the verdict block, bad arguments (exit 2, named), a short run end to end, run as a process, --write goes with held12 only
//
// SABOTAGE LOG: (filled by the serial mutation pass below)
"use strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as St from "./subFleetStudy.mjs";
import * as F from "../../brain/subFleetNav.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, n, arm, o = {}) => ({ seed, n, arm, subs: n, subContacts: 2, seaHits: 3, arrivals: 5, travel: 1000, plans: 80, noRoutePlans: 0, lost: 0, ...o });
const D = F.DESIGNATED, R = F.REFERENCE, K = St.cellKey;
console.log("subFleetStudy-selfcheck -- the study of a fleet of couriers\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output is brain/subFleetHeld12.jsonl; the sets are the module's; the cell key is n|arm", St.OUT === "brain/subFleetHeld12.jsonl" && St.SETS === F.SETS && St.SETS.held12.length === 30 && St.SETS.dev.length === 10 && St.cellKey(8, "fleet") === "8|fleet");
    ok("!! the thresholds: contact fraction 0.5, arrival fraction 0.9, sea slack 1.1, no-route 0.05, median contacts 1", same(St.THRESH, { contactFraction: 0.5, arrivalFraction: 0.9, seaSlack: 1.1, noRoute: 0.05, medianContacts: 1 }));
    const xs = [5, 1, 3];
    ok("!! median: 5, 1, 3 -> 3; 1, 2, 3, 10 -> 2.5; NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([1, 2, 3, 10]) === 2.5 && Number.isNaN(St.median([])));
}
console.log("\n2. THE SUMMARY");
{
    const runs = [run(1, 8, D, { subContacts: 1, seaHits: 4, arrivals: 10, travel: 500, plans: 100, noRoutePlans: 7, lost: 1 }), run(2, 8, D, { subContacts: 5, seaHits: 6, arrivals: 12, travel: 700, plans: 90, noRoutePlans: 3 }), run(3, 8, D, { subContacts: 3 }), run(1, 4, R), run(1, 8, R, { subContacts: 9 })];
    const c = safe(() => St.summarize(runs)), x = c && c[K(8, D)];
    ok("!! a cell sums its runs: three N = 8 `fleet` runs: sub contacts 9, sea hits 4+6+3 = 13, arrivals 10+12+5 = 27, travel 2200, plans 270, no-route plans 10, lost 1, subs 24; the median per run is 3", !!x && x.runs === 3 && x.n === 8 && x.arm === D && x.subs === 24 && x.subContacts === 9 && x.seaHits === 13 && x.arrivals === 27 && x.travel === 2200 && x.plans === 270 && x.noRoutePlans === 10 && x.lost === 1 && x.medianContacts === 3, JSON.stringify(x));
    ok("!! only the cells flown exist, in SIZES then FLEET_ARMS order (4|any+predict, 8|any+predict, 8|fleet), each its own runs", !!c && Object.keys(c).join() === `${K(4, R)},${K(8, R)},${K(8, D)}` && c[K(4, R)].runs === 1 && c[K(8, R)].subContacts === 9);
}
console.log("\n3. THE VERDICT");
{
    const cell = (n, arm, o = {}) => ({ n, arm, runs: 30, subs: 30 * n, subContacts: 20, seaHits: 100, arrivals: 500, travel: 1e5, plans: 1000, noRoutePlans: 0, lost: 0, medianContacts: 1, ...o });
    const base = () => ({ [K(4, R)]: cell(4, R, { subContacts: 10 }), [K(4, D)]: cell(4, D, { subContacts: 2, noRoutePlans: 60 }), [K(8, R)]: cell(8, R, { subContacts: 40, medianContacts: 2 }), [K(8, D)]: cell(8, D, { subContacts: 18, arrivals: 480, noRoutePlans: 80 }) });
    const jb = safe(() => St.judge(base())), mod = (f) => { const b = base(); f(b); return safe(() => St.judge(b)); };
    ok("!! the base case: contacts 20 against 50 (at most half), arrivals 980 against 1000: SUPPORTED, F1 to F6 all held (ratios 0.2 and 0.45)", !!jb && jb.gain && jb.moves && jb.verdict === "SUPPORTED" && jb.f1 && jb.f2 && jb.f3 && jb.f4 && jb.f5 && jb.f6 && near(jb.ratios[0], 0.2) && near(jb.ratios[1], 0.45), JSON.stringify(jb));
    ok("!! GAIN is at most HALF the reference's contacts, pooled (25 of 50 holds, 26 fails)", mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 23, arrivals: 480 }); }).gain === true && mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 24, arrivals: 480 }); }).gain === false);
    ok("!! KEEPS MOVING is at least 0.9 of the reference's arrivals, pooled (900 of 1000 holds, 899 fails)", mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 400 }); }).moves === true && mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 399 }); }).moves === false);
    ok("!! the verdict over the combinations: both -> SUPPORTED, gain only, moves only -> PARTLY SUPPORTED, neither -> NOT SUPPORTED", mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 300 }); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 40, arrivals: 480 }); }).verdict === "PARTLY SUPPORTED" && mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 40, arrivals: 300 }); }).verdict === "NOT SUPPORTED");
    ok("!! the boundaries at 0 and 1: no arrivals in either arm is NOT `keeps moving` (0 of 0); 1 arrival each is (1 of 1)", (() => { const z = { [K(8, R)]: cell(8, R, { arrivals: 0 }), [K(8, D)]: cell(8, D, { arrivals: 0 }) }, o = { [K(8, R)]: cell(8, R, { arrivals: 1 }), [K(8, D)]: cell(8, D, { arrivals: 1 }) }; return safe(() => St.judge(z)).moves === false && safe(() => St.judge(o)).moves === true; })());
    ok("!! a study of ONE size still judges: only N = 8 cells (reference 40 contacts, fleet 18, arrivals kept) is a gain and keeps moving (SUPPORTED); only N = 4 cells likewise; the ratio needs both sizes (F6 false)", (() => { const e8 = { [K(8, R)]: cell(8, R, { subContacts: 40 }), [K(8, D)]: cell(8, D, { subContacts: 18 }) }, e4 = { [K(4, R)]: cell(4, R, { subContacts: 40 }), [K(4, D)]: cell(4, D, { subContacts: 18 }) }, a = safe(() => St.judge(e8)), b = safe(() => St.judge(e4)); return !!a && a.verdict === "SUPPORTED" && !a.f6 && !!b && b.verdict === "SUPPORTED" && !b.f6; })());
    ok("!! a reference with exactly ONE contact has a ratio (fleet 0 of 1 is 0): F6 holds with N = 4 at 0 against N = 8 at 0.45", (() => { const b = base(); b[K(4, R)] = cell(4, R, { subContacts: 1 }); b[K(4, D)] = cell(4, D, { subContacts: 0, noRoutePlans: 60 }); const j = safe(() => St.judge(b)); return !!j && j.f6 === true && j.ratios[0] === 0; })());
    ok("!! equal ratios are NOT lower: N = 4 at 0.45 and N = 8 at 0.45 is F6 false", mod((b) => { b[K(4, R)] = cell(4, R, { subContacts: 20 }); b[K(4, D)] = cell(4, D, { subContacts: 9, noRoutePlans: 60 }); }).f6 === false);
    ok("!! one plan with no route in one plan is 100 percent (F5 holds); one run with sea hits within slack holds F4", (() => { const b = { [K(4, R)]: cell(4, R, { runs: 1, seaHits: 10 }), [K(4, D)]: cell(4, D, { runs: 1, seaHits: 11, plans: 1, noRoutePlans: 1 }) }, j = safe(() => St.judge(b)); return !!j && j.f5 === true && j.f4 === true; })());
    ok("!! F1: the reference's median N = 8 run has at least 1 sub contact (1 holds, 0 fails)", mod((b) => { b[K(8, R)] = cell(8, R, { subContacts: 40, medianContacts: 1 }); }).f1 === true && mod((b) => { b[K(8, R)] = cell(8, R, { subContacts: 40, medianContacts: 0 }); }).f1 === false);
    ok("!! F4: the designated arm's sea hits at most 1.1 times the reference's, pooled (220 of 200 holds, 221 fails)", mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 480, seaHits: 120 }); b[K(4, D)] = cell(4, D, { subContacts: 2, noRoutePlans: 60, seaHits: 100 }); }).f4 === true && mod((b) => { b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 480, seaHits: 121 }); b[K(4, D)] = cell(4, D, { subContacts: 2, noRoutePlans: 60, seaHits: 100 }); }).f4 === false);
    ok("!! F5: at least 5 percent of the designated arm's plans find no route, pooled (100 of 2000 holds, 99 fails)", mod((b) => { b[K(4, D)] = cell(4, D, { subContacts: 2, noRoutePlans: 20 }); b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 480, noRoutePlans: 80 }); }).f5 === true && mod((b) => { b[K(4, D)] = cell(4, D, { subContacts: 2, noRoutePlans: 19 }); b[K(8, D)] = cell(8, D, { subContacts: 18, arrivals: 480, noRoutePlans: 80 }); }).f5 === false);
    ok("!! F6: the fleet/reference ratio is lower at N = 4 than at N = 8 (0.2 against 0.45 holds; 0.5 against 0.45 fails; a reference with no contacts has no ratio and fails)", mod((b) => { b[K(4, D)] = cell(4, D, { subContacts: 5, noRoutePlans: 60 }); }).f6 === false && mod((b) => { b[K(4, R)] = cell(4, R, { subContacts: 0 }); }).f6 === false);
    ok("!! the F1 and F6 lines read exactly (N = 8 and N = 4 against N = 8)", (() => { const v = St.verdictText(safe(() => St.judge(base()))).split("\n"); return v[1] === "F1 the reference's median N = 8 run has at least 1 sub contact: HELD" && /^F6 the fleet\/reference sub-contact ratio is lower at N = 4 than at N = 8 \(0\.20, 0\.45\): HELD$/.test(v[6]); })());
    ok("!! a missing cell is a miss, never a throw: no reference -> F1 F6 false and no gain; no designated -> F2 F4 F5 F6 false", (() => { const a = safe(() => St.judge({ [K(4, D)]: base()[K(4, D)], [K(8, D)]: base()[K(8, D)] })), b = safe(() => St.judge({ [K(4, R)]: base()[K(4, R)], [K(8, R)]: base()[K(8, R)] })); return !!a && !a.f1 && !a.f6 && !a.gain && !!b && !b.f2 && !b.f5 && !b.f6 && !b.f4; })());
    ok("!! no cells at all: every claim false, NOT SUPPORTED", (() => { const j = safe(() => St.judge({})); return !!j && j.verdict === "NOT SUPPORTED" && !j.f1 && !j.f2 && !j.f3 && !j.f4 && !j.f5 && !j.f6; })());
}
console.log("\n4. THE TEXT AND THE COMMAND");
{
    const cell = (n, arm) => ({ n, arm, runs: 30, subs: 120, subContacts: 25, seaHits: 12, arrivals: 140, travel: 61234.5, plans: 3000, noRoutePlans: 40, lost: 0, medianContacts: 0.5 });
    const t = St.table({ [K(4, R)]: cell(4, R) }, "TITLE").split("\n");
    ok("!! a cell's line is exactly: the size padded to 2 and the arm to 12, runs 4 wide and subs 4, the sub contacts 12 wide and the median 10, sea hits 8, arrivals 8, travel in km 11, plans 5 and no-route 8, lost 4",
        t.length === 3 && t[0] === "TITLE" && t[1].startsWith("fleet arm") && t[2] === " 4 any+predict  |   30  120 |           25       0.50 |       12 |      140 |       61.23 |  3000       40 |    0", t[2]);
    const v = St.verdictText(safe(() => St.judge({ [K(4, R)]: cell(4, R), [K(8, R)]: cell(8, R), [K(4, D)]: cell(4, D), [K(8, D)]: cell(8, D) }))).split("\n");
    ok("!! the verdict block is one line for the verdict and one for each of F1 to F6, HELD or MISSED; the F5 line reads exactly", v.length === 7 && v.slice(1).every((l, i) => l.startsWith(`F${i + 1} `) && /: (HELD|MISSED)$/.test(l)) && v[5] === "F5 at least 5 percent of fleet's plans find no route: MISSED", v[5]);
    const go = (argv) => { const out = [], err = [], wrote = []; const code = safe(() => St.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), writeFile: (f, c) => wrote.push([f, c]) }), -1); return { code, out: out.join("\n"), err: err.join("\n"), wrote }; };
    ok("!! a bad set names the sets (exit 2)", (() => { const g = go(["--set", "nope"]); return g.code === 2 && /dev, held12/.test(g.err); })());
    ok("!! --seeds needs a positive whole number (0, 1.5, x are exit 2); --seconds a positive number (0, x are exit 2) and goes with DEV only (held12 --seconds 10 is exit 2)", ["0", "1.5", "x"].every((x) => go(["--seeds", x]).code === 2) && ["0", "x", "-5"].every((x) => go(["--seconds", x]).code === 2) && go(["--set", "held12", "--seconds", "10"]).code === 2 && /dev only/.test(go(["--set", "held12", "--seconds", "10"]).err));
    ok("!! an unknown argument is exit 2 and quoted; --write goes with held12 only", (() => { const a = go(["--bogus"]), b = go(["--set", "dev", "--write"]); return a.code === 2 && a.err.includes('"--bogus"') && b.code === 2 && b.wrote.length === 0; })());
    ok("!! --seconds 1 is valid (exit 0) and the error for held12 --seconds reads `HELD12 is always 240 s`", go(["--set", "dev", "--seeds", "1", "--seconds", "1"]).code === 0 && /HELD12 is always 240 s/.test(go(["--set", "held12", "--seconds", "10"]).err));
    const g = go(["--set", "dev", "--seeds", "1", "--seconds", "10"]);
    ok("!! a 1-sea DEV run is exit 0, says 1 seas x fleets of 4 and 8 x 2 arms, 240 s a run, prints the table and the verdict, and writes nothing", g.code === 0 && /DEV set: 1 seas x fleets of 4 and 8 x 2 arms, 10 s a run/.test(g.out) && /any\+predict +\|/.test(g.out) && /F6 /.test(g.out) && g.wrote.length === 0);
    ok("!! the table's title line is exact", g.out.split("\n")[2] === "standard 500 x 300 m tank, a sub contact under 8 m apart and 5 m in depth, other subs 4 m full-depth discs, replan every 3 s, 10 s", g.out.split("\n")[2]);
    const w = go(["--set", "held12", "--seeds", "1", "--write"]);   // the one full-length run: 240 s x 4
    ok("!! --set held12 --seeds 1 --write puts brain/subFleetHeld12.jsonl down with 4 JSON lines (1 sea x 2 sizes x 2 arms), each with set held12 and seed 1201", w.code === 0 && w.wrote.length === 1 && /subFleetHeld12\.jsonl$/.test(w.wrote[0][0]) && (() => { const ls = w.wrote[0][1].trim().split("\n"); return ls.length === 4 && ls.every((l) => JSON.parse(l).set === "held12" && JSON.parse(l).seed === 1201); })());
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "subFleetStudy.mjs"), sp = spawnSync(process.execPath, [here, "--set", "dev", "--seeds", "1", "--seconds", "5"], { encoding: "utf8" }), sb = spawnSync(process.execPath, [here, "--seeds", "0"], { encoding: "utf8" });
    ok("!! run as a command: `--set dev --seeds 1` exits 0 and prints the table; `--seeds 0` exits 2 with the message on stderr", sp.status === 0 && /DEV set: 1 seas/.test(sp.stdout) && sb.status === 2 && /positive whole number/.test(sb.stderr), `${sp.status} ${sb.status}`);
}
console.log(fails === 0 ? "\nall checks pass" : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
