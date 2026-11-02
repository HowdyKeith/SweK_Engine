// WebGLEngine/tools/ship/plannerEasy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerEasy-selfcheck.mjs      (about 4 s: a few 100-second dives)
//
// THE GATE OF tools/ship/plannerEasy.mjs (Round 20 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      2201-2248 and 2261-2308 of all four kinds (192 dives a set, 96 a kind), disjoint from every seed of Rounds 1-19; three arms; the margin 0.01.
//   2 READING   HURTS (negative beyond 2 se), NON-INFERIOR (the lower bound above -0.01), UNDECIDED, on hand fixtures, including both sides of each boundary.
//   3 KINDS     the pooled difference over chosen kinds: one kind, two kinds, the counts better / worse / same.
//   4 LINES     the two bottom lines in all their cases (no harm, hurts, not shown harmless; easy and hard).
//   5 CHECKS    identity with the Round 11 twin, the hard kinds not hurt; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    real 100-second dives of all four kinds: the full twin equals the Round 11 twin, the kinds come back in order, an unknown arm is refused.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether the twin does harm (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as T from "../../brain/needsTask.mjs";
import * as X from "./plannerEasy.mjs";
console.log("plannerEasy-selfcheck -- the Round 20 harm test on the easy kinds\n");
const code = fs.readFileSync(new URL("./plannerEasy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568), ...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768), ...rangeOf(1801, 2100)]);
    const seeds = [...rangeOf(2201, 2248), ...rangeOf(2261, 2308)];
    ok("!! the sets are R1 2201-2248 and R2 2261-2308 of all four kinds (192 dives a set, 96 per kind per two sets) and share no seed with Rounds 1-19", J(X.SET_RANGES) === J({ R1: [2201, 2248], R2: [2261, 2308] }) && J(X.SET_NAMES) === J(["R1", "R2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.KINDS, a, b).length === 192) && J(X.KINDS) === J(["plain", "deep", "far", "both"]));
    ok("!! the easy kinds are plain and deep, the hard kinds far and both, the margin is 0.01, the arms TUNED-R8, TWIN-ROUND11, TWIN-FULL", J(X.EASY) === J(["plain", "deep"]) && J(X.HARD_KINDS) === J(["far", "both"]) && X.MARGIN === 0.01 && J(X.ARMS) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]));
}
// synthetic: 12 dives a set, three of each kind; effect per kind
const KINDS = ["plain", "deep", "far", "both"], BASE = [0.5, 0.6, 0.7];
const mk = (effect) => ({ runs: Array.from({ length: 12 }, (_, i) => { const kind = KINDS[i % 4], j = Math.floor(i / 4); return { kind, score: BASE[j] + (effect[kind] ? effect[kind][j % effect[kind].length] : 0), fingerprint: "f" + i }; }), score: 0.6, crashed: 0, stranded: 0 });
const synth = (eff = {}) => Object.fromEntries(X.SET_NAMES.map((n) => [n, { "TUNED-R8": mk({}), "TWIN-ROUND11": mk(eff.all || {}), "TWIN-FULL": mk(eff) }]));
const ZERO = [0], UP = [0.02, 0.025, 0.03], DOWN = [-0.02, -0.025, -0.03], TINY_DOWN = [-0.005, -0.004, -0.006], WOB = [0.04, -0.04, 0.0];
sec("2. READING");
{
    const v = (mean, se) => X.verdictOf({ mean, se });
    ok("!! HURTS needs a negative mean past 2 se: -0.03 at se 0.01 hurts; -0.02 at se 0.01 (exactly 2 se) does not; a positive mean never does", v(-0.03, 0.01) === "HURTS" && v(-0.02, 0.01) !== "HURTS" && v(0.05, 0.001) !== "HURTS");
    ok("!! NON-INFERIOR needs the lower bound (mean - 2 se) above -0.01: mean 0 at se 0.004 (bound -0.008) is; at se 0.006 (bound -0.012) is UNDECIDED; the boundary itself (bound exactly -0.01) is UNDECIDED", v(0, 0.004) === "NON-INFERIOR" && v(0, 0.006) === "UNDECIDED" && v(-0.001, 0.004) === "NON-INFERIOR" && v(-0.002, 0.004) === "UNDECIDED" && v(0.01, 0.01) === "UNDECIDED");
    ok("!! a mean of exactly 0 with se 0 (identical dives) is NON-INFERIOR; a small negative mean with se 0 is HURTS (negative beyond 0 se) once it is past the margin or not: -0.001 with se 0 hurts", v(0, 0) === "NON-INFERIOR" && v(-0.001, 0) === "HURTS");
    ok("!! HURTS wins over the margin rule: -0.05 at se 0.01 is HURTS, not UNDECIDED", v(-0.05, 0.01) === "HURTS" && v(-0.015, 0.001) === "HURTS");
}
sec("3. KINDS");
{
    const au = synth({ plain: ZERO, deep: UP, far: DOWN, both: WOB }), d = (k) => X.diffOver(au, k);
    ok("!! one kind: plain is 6 dives (three a set, two sets), all the same, mean 0; deep is +0.025 over 6 dives, all better", d(["plain"]).n === 6 && d(["plain"]).same === 6 && d(["plain"]).mean === 0 && d(["deep"]).n === 6 && d(["deep"]).better === 6 && near(d(["deep"]).mean, 0.025) && d(["far"]).worse === 6);
    ok("!! two kinds pool their dives: easy is 12, the mean the average of plain and deep (+0.0125), hard 12 with far -0.025 and both 0 (+0.04, -0.04, 0 averaged) giving -0.0125", d(X.EASY).n === 12 && near(d(X.EASY).mean, 0.0125) && d(X.HARD_KINDS).n === 12 && near(d(X.HARD_KINDS).mean, -0.0125));
    ok("!! the difference is the first arm minus the second (swap them and the sign flips); an unmatched kind list gives n 0 and mean 0", near(X.diffOver(au, ["deep"], "TUNED-R8", "TWIN-FULL").mean, -0.025) && X.diffOver(au, [], "TWIN-FULL").n === 0 && X.diffOver(au, [], "TWIN-FULL").mean === 0);
    ok("!! the standard error is the paired one with n - 1 (6 dives of +0.02, +0.025, +0.03 twice: se 0.0020 )", near(d(["deep"]).se, Math.sqrt([0.02, 0.025, 0.03, 0.02, 0.025, 0.03].reduce((a, x) => a + (x - 0.025) ** 2, 0) / 5 / 6)));
}
sec("4. LINES");
{
    const L = (eff) => X.bottomLines(synth(eff));
    ok("!! all four kinds the same: NO HARM on the easy and the hard kinds", J(L({})) === J(["THE TWIN DOES NO HARM ON THE EASY KINDS", "THE TWIN DOES NO HARM ON THE HARD KINDS"]));
    ok("!! a kind that HURTS is named, upper-cased, and wins over an undecided one: plain hurting says HURTS ON PLAIN", L({ plain: DOWN })[0] === "THE TWIN HURTS ON PLAIN" && L({ plain: DOWN, deep: DOWN })[0] === "THE TWIN HURTS ON PLAIN, DEEP" && L({ far: DOWN })[1] === "THE TWIN HURTS ON FAR");
    ok("!! a kind neither hurting nor shown harmless is named by NOT SHOWN HARMLESS: a wobbling deep (se about 0.023) is undecided", L({ deep: WOB })[0] === "THE TWIN IS NOT SHOWN HARMLESS ON DEEP" && L({ both: WOB })[1] === "THE TWIN IS NOT SHOWN HARMLESS ON BOTH");
    ok("!! the lines are independent: the easy line ignores far and both, the hard line ignores plain and deep", L({ far: DOWN })[0] === "THE TWIN DOES NO HARM ON THE EASY KINDS" && L({ plain: DOWN })[1] === "THE TWIN DOES NO HARM ON THE HARD KINDS");
    ok("!! a small, steady loss that is past 2 se hurts even when it is smaller than the margin: -0.005 steady is HURTS", L({ plain: TINY_DOWN })[0] === "THE TWIN HURTS ON PLAIN");
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! three check rows on a clean audit: IDENTITY R1, IDENTITY R2, HARD KINDS NOT HURT; all pass", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY R1", "IDENTITY R2", "HARD KINDS NOT HURT"]) && rows(synth()).every((c) => c.ok));
    const bad = synth(); bad.R2["TWIN-ROUND11"].runs[5].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the full twin breaks IDENTITY R2 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY R2"]));
    ok("!! a twin that hurts on far and both together breaks HARD KINDS NOT HURT only (a hurt on plain does not)", J(rows(synth({ far: DOWN, both: DOWN })).filter((c) => !c.ok).map((c) => c.name)) === J(["HARD KINDS NOT HURT"]) && rows(synth({ plain: DOWN })).every((c) => c.ok) && rows(synth({ far: DOWN, both: UP })).every((c) => c.ok));
}
sec("6. REPORT");
{
    const L = X.report(synth({ plain: ZERO, deep: UP, far: DOWN, both: [0.05, 0.06, 0.07] })), txt = L.join("\n");
    ok("!! the head names both sets and says all four kinds; the three checks pass first (far hurting while both gains does not break the hard-kinds check: far and both together)", /^ROUND 20/.test(L[0]) && L[0].includes("R1 2201-2248") && L[0].includes("R2 2261-2308") && L[0].includes("all four kinds") && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! one row per kind in the order plain, deep, far, both with its mean, lower bound and verdict; plain NON-INFERIOR with lower bound 0.0000, deep +0.0250, far HURTS", /plain +\+0\.0000 .*lower bound 0\.0000 +NON-INFERIOR/.test(txt) && /deep +\+0\.0250 .*NON-INFERIOR/.test(txt) && /far +-0\.0250 .*HURTS/.test(txt) && /both +\+0\.0600 .*NON-INFERIOR/.test(txt) && (() => { const at = (k) => L.findIndex((l) => new RegExp("^  " + k + " ").test(l)); return at("plain") > 0 && at("plain") + 1 === at("deep") && at("deep") + 1 === at("far") && at("far") + 1 === at("both"); })());
    ok("!! the easy and hard pooled rows, the means and the crushed/stranded counts, then the two bottom lines last", /easy \(plain and deep\) +\+0\.0125/.test(txt) && /hard \(far and both\) +\+0\.0175/.test(txt) && /means \(tuned \| twin\): 0\.600 \| 0\.600; crushed 0\/0, stranded 0\/0/.test(txt) && L[L.length - 2] === "BOTTOM LINE: THE TWIN DOES NO HARM ON THE EASY KINDS" && L[L.length - 1] === "BOTTOM LINE: THE TWIN HURTS ON FAR");
    const bad = synth(); bad.R1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY R1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
    const cr = synth(); cr.R1["TUNED-R8"].crashed = 2; cr.R2["TWIN-FULL"].stranded = 3;
    ok("!! the crushed and stranded counts are summed over both sets, tuned first and twin second", /crushed 2\/0, stranded 0\/3/.test(X.report(cr).join("\n")));
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { R1: [2201, 2202], R2: [2261, 2262] }, fly = (a) => X.flySets(a, R8, { ranges });
    const tw = fly("TWIN-FULL"), r11 = fly("TWIN-ROUND11"), tu = fly("TUNED-R8");
    ok("!! flySets returns R1 and R2, eight dives each (two seeds of the four kinds, kind-major: plain, plain, deep, deep, far, far, both, both)", J(Object.keys(tw)) === J(["R1", "R2"]) && J(tw.R1.runs.map((r) => r.kind)) === J(["plain", "plain", "deep", "deep", "far", "far", "both", "both"]) && tw.R2.runs.length === 8);
    ok("!! the full twin equals the Round 11 twin dive for dive on all sixteen real dives", ["R1", "R2"].every((n) => tw[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)));
    const direct = T.evaluate(T.flyDecision(require_("tuned")), T.setOf(X.KINDS, 2201, 2202), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the tuned rule is T.evaluate's tuned dive with the noisy gauge, dive for dive", tu.R1.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint));
    ok("!! the twin and the tuned rule are different pilots on at least one of the sixteen dives", ["R1", "R2"].some((n) => tw[n].runs.some((r, i) => r.fingerprint !== tu[n].runs[i].fingerprint)));
    X.setFlight({});
    const thr = (f) => { try { f(); return false; } catch { return true; } };
    ok("!! an unknown arm is refused before flying; assemble keys sets then arms", thr(() => X.flyArm("TWIN-FAST", R8, T.setOf(["plain"], 1, 1))) && J(Object.keys(X.assemble({ A: tw, B: tu }).R2)) === J(["A", "B"]) && X.assemble({ A: tw }).R1.A === tw.R1);
}
function require_(w) { return U_.tunedSeat(R8, U_.WIDE_BOUNDS); }
import * as U_ from "../../brain/tunedRule.mjs";
sec("8. SOURCE");
{
    ok("!! the seeds 2201, 2248, 2261 and 2308 appear once each, in SET_RANGES", ["2201", "2248", "2261", "2308"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
