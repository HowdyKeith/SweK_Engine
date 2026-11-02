// WebGLEngine/tools/ship/plannerHeadroom-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerHeadroom-selfcheck.mjs      (about 10 s: a few 100-second dives of the tuned rule, the twin and the oracle)
//
// THE GATE OF tools/ship/plannerHeadroom.mjs (Round 25 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      4201-4248 and 4301-4348 of far and both (192 dives an arm per count), disjoint from every seed of Rounds 1-24; counts 3, 4, 5; nine arms.
//   2 ARMS      every arm name is a pilot kind and a count; an unknown name or count is refused.
//   3 COUNTS    the gain, the gap, the headroom and the share closed at a count, on hand fixtures; the headroom's reading.
//   4 GROWTH    the headroom's growth from 3 to 5 stations against two independent means; the dives on which the twin beats the oracle.
//   5 LINES     the two bottom lines in all their cases.
//   6 CHECKS    the generator, the oracle floor at every count, the gain positive at every count; a failed check says NOT WEIGHED.
//   7 REPORT    the lines.
//   8 FLIGHT    real 100-second dives: every kind at every count, the oracle at least the tuned rule, the oracle is stationRound.oracleRuns.
//   9 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how much headroom there is (that is the experiment).
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
import * as U from "../../brain/tunedRule.mjs";
import * as X from "./plannerHeadroom.mjs";
import { setN } from "./plannerStations.mjs";
import { oracleRuns } from "./stationRound.mjs";
console.log("plannerHeadroom-selfcheck -- the Round 25 headroom above the twin\n");
const code = fs.readFileSync(new URL("./plannerHeadroom.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568), ...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2248), ...rangeOf(2261, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3650), ...rangeOf(3701, 3850), ...rangeOf(3901, 3996), ...rangeOf(4001, 4096)]);
    const seeds = [...rangeOf(4201, 4248), ...rangeOf(4301, 4348)];
    ok("!! the sets are H1 4201-4248 and H2 4301-4348, 96 dives each of far and both per count (192 an arm), and share no seed with Rounds 1-24", J(X.SET_RANGES) === J({ H1: [4201, 4248], H2: [4301, 4348] }) && J(X.SET_NAMES) === J(["H1", "H2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => setN(X.HARD, a, b, 5).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the counts are 3, 4, 5 (low 3, high 5); the arms are TUNED-R8, TWIN, ORACLE at each count in that order: nine", J(X.COUNTS) === J([3, 4, 5]) && X.LOW_N === 3 && X.HIGH_N === 5 && X.ARMS.length === 9 && J(X.ARMS.slice(0, 3)) === J(["TUNED-R8@3", "TWIN@3", "ORACLE@3"]) && X.ARMS[8] === "ORACLE@5");
}
sec("2. ARMS");
{
    const thr = (a) => { try { X.parseArm(a); return false; } catch { return true; } };
    ok("!! ORACLE@5 is the oracle at 5 stations; TWIN@3 the twin at 3; TUNED-R8@4 the tuned rule at 4", J(X.parseArm("ORACLE@5")) === J({ kind: "ORACLE", n: 5 }) && J(X.parseArm("TWIN@3")) === J({ kind: "TWIN", n: 3 }) && J(X.parseArm("TUNED-R8@4")) === J({ kind: "TUNED-R8", n: 4 }));
    ok("!! an unknown kind, an unregistered count (2, 6) and a bare name are refused", thr("TWIN-FULL@3") && thr("ORACLE@6") && thr("TUNED-R8@2") && thr("TWIN") && thr("ORACLE@"));
}
// synthetic: 8 dives a set; per count effects
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6], mk = (d, tag = "") => { const runs = BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: tag + "f" + i })); return { runs, score: runs.reduce((x, r) => x + r.score, 0) / runs.length, crashed: 0, stranded: 0 }; };
const G4 = [0.03, 0.05], H6 = [0.05, 0.07], Z = [0];
const synth = (spec = {}) => {
    const au = {};
    for (const s of X.SET_NAMES) { au[s] = {}; for (const n of X.COUNTS) { const e = spec[n] || {}; au[s][`TUNED-R8@${n}`] = mk(Z); au[s][`TWIN@${n}`] = mk(e.gain || G4); au[s][`ORACLE@${n}`] = mk(e.oracle || BASE.map((_, i) => (e.gain || G4)[i % (e.gain || G4).length] + H6[i % 2])); } }
    return au;
};
sec("3. COUNTS");
{
    const au = synth(), c = X.countOf(au, 3);
    ok("!! at a count the gain is twin minus tuned (+0.04), the gap oracle minus tuned (+0.10) and the headroom oracle minus twin (+0.06), over 16 dives", c.n === 3 && c.gain.n === 16 && near(c.gain.mean, 0.04, 1e-9) && near(c.gap.mean, 0.1, 1e-9) && near(c.head.mean, 0.06, 1e-9) && c.gain.better === 16 && c.head.better === 16);
    ok("!! the share closed is gain over gap (0.4); a count where the oracle is no better than the tuned rule has share null", near(c.share, 0.4) && X.countOf(synth({ 4: { oracle: Z } }), 4).share === null);
    ok("!! the headroom's reading: real when above 2 se (0.06 with a tiny se), not real for a wobble around zero", c.real === true && X.countOf(synth({ 3: { oracle: [0.03, 0.05].map((x, i) => x + (i % 2 ? 0.02 : -0.02) - 0.04) } }), 3).real === false);
    ok("!! each count reads its own arms (a high gain at 5 does not change count 3)", near(X.countOf(synth({ 5: { gain: [0.2] } }), 5).gain.mean, 0.2) && near(X.countOf(synth({ 5: { gain: [0.2] } }), 3).gain.mean, 0.04, 1e-9));
}
sec("4. GROWTH");
{
    const big = synth({ 5: { gain: G4, oracle: BASE.map((_, i) => G4[i % 2] + H6[i % 2] * 3) } }), g = X.growth(big);
    ok("!! headroom 0.18 at 5 stations against 0.06 at 3: growth +0.12 over the se of two independent means (sqrt(se5^2 + se3^2)): GROWS", near(g.mean, 0.12, 1e-9) && g.verdict === "GROWS" && near(g.se, Math.sqrt(X.countOf(big, 5).head.se ** 2 + X.countOf(big, 3).head.se ** 2)));
    ok("!! equal headroom is FLAT, a smaller headroom at 5 is SHRINKS", X.growth(synth()).verdict === "FLAT" && X.growth(synth({ 5: { oracle: BASE.map((_, i) => G4[i % 2] + H6[i % 2] / 3) } })).verdict === "SHRINKS");
    const a = synth(); a.H1["TWIN@4"].runs[2].score = 9; a.H2["TWIN@5"].runs[0].score = 9; a.H2["TWIN@5"].runs[1].score += 1e-12;
    ok("!! the twin beats the oracle on a dive only when it scores above it by more than 1e-9: two dives of 48 here (a 1e-12 excess does not count)", J(X.twinBeatsOracle(a)) === J({ count: 2, of: 48 }) && J(X.twinBeatsOracle(synth())) === J({ count: 0, of: 48 }));
}
sec("5. LINES");
{
    const L = (spec) => X.bottomLines(synth(spec)), noHead = (n) => ({ [n]: { oracle: G4 } });
    ok("!! headroom real at every count: THERE IS HEADROOM AT N = 3, 4, 5 and FLAT growth", L({})[0] === "THERE IS HEADROOM ABOVE THE TWIN AT N = 3, 4, 5" && L({})[1] === "THE HEADROOM IS FLAT IN THE NUMBER OF STATIONS");
    ok("!! a count with no headroom is left out of the list; with none at all the line says there is no measurable headroom", L({ ...noHead(3) })[0] === "THERE IS HEADROOM ABOVE THE TWIN AT N = 4, 5" && L({ ...noHead(3), ...noHead(4), ...noHead(5) })[0] === "THERE IS NO MEASURABLE HEADROOM ABOVE THE TWIN");
    ok("!! growth: GROWS and SHRINKS lines", L({ 5: { oracle: BASE.map((_, i) => G4[i % 2] + H6[i % 2] * 3) } })[1] === "THE HEADROOM GROWS WITH THE NUMBER OF STATIONS" && L({ 5: { oracle: BASE.map((_, i) => G4[i % 2] + H6[i % 2] / 3) } })[1] === "THE HEADROOM SHRINKS WITH THE NUMBER OF STATIONS");
}
sec("6. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! seven check rows on a clean audit in order: GENERATOR, ORACLE 3, 4, 5, GAIN 3, 4, 5; all pass", J(rows(synth()).map((c) => c.name)) === J(["GENERATOR", "ORACLE 3", "ORACLE 4", "ORACLE 5", "GAIN 3", "GAIN 4", "GAIN 5"]) && rows(synth()).every((c) => c.ok));
    const bo = synth(); bo.H2["ORACLE@4"].runs[3].score = 0.1;
    ok("!! an oracle below the tuned rule on one dive breaks ORACLE 4 only", J(rows(bo).filter((c) => !c.ok).map((c) => c.name)) === J(["ORACLE 4"]));
    ok("!! a twin with no gain at 5 stations (or a loss) breaks GAIN 5 only", J(rows(synth({ 5: { gain: Z, oracle: H6 } })).filter((c) => !c.ok).map((c) => c.name)) === J(["GAIN 5"]) && J(rows(synth({ 3: { gain: [-0.01], oracle: H6 } })).filter((c) => !c.ok).map((c) => c.name)) === J(["GAIN 3"]));
    const tie = synth(); for (const s of X.SET_NAMES) tie[s]["ORACLE@3"].runs.forEach((r, i) => (r.score = tie[s]["TUNED-R8@3"].runs[i].score));
    ok("!! an oracle equal to the tuned rule passes ORACLE (the floor is at least, with 1e-12 slack)", rows(tie).find((c) => c.name === "ORACLE 3").ok);
}
sec("7. REPORT");
{
    const L = X.report(synth()), txt = L.join("\n");
    ok("!! the head names both sets; the seven checks pass first", /^ROUND 25/.test(L[0]) && L[0].includes("H1 4201-4248") && L[0].includes("H2 4301-4348") && L.slice(1, 8).every((l) => /^  PASS /.test(l)));
    ok("!! a block per count with the three means in order (0.587, 0.627, 0.687: tuned, twin, oracle), the gain, the gap, the headroom with its reading and the share closed 0.40", (txt.match(/^n [345]: means \(tuned \| twin \| oracle\) 0\.58[78] \| 0\.62[78] \| 0\.68[78]$/gm) || []).length === 3 && (txt.match(/headroom \(oracle - twin\) \+0\.0600 .* REAL; the twin closes 0\.40 of the gap/g) || []).length === 3 && /gain \(twin - tuned\) \+0\.0400/.test(txt) && /gap \(oracle - tuned\) \+0\.1000/.test(txt));
    ok("!! the growth line and the twin-beats-oracle line, then the two bottom lines last", /headroom growth from 3 to 5 stations: [+-]0\.0000 \(se of two independent means 0\.00[0-9]+\) FLAT/.test(txt) && /the twin scores above the oracle on 0 of 48 dives/.test(txt) && L[L.length - 2].startsWith("BOTTOM LINE: THERE IS HEADROOM") && L[L.length - 1].startsWith("BOTTOM LINE: THE HEADROOM"));
    const bad = synth(); bad.H1["ORACLE@5"].runs[0].score = 0;
    const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL ORACLE 5/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
    ok("!! a count with no oracle gap prints the share as n/a", /the twin closes n\/a of the gap/.test(X.report(synth({ 4: { oracle: Z } })).join("\n")));
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { H1: [1344, 1345], H2: [1349, 1350] }, fly = (a) => X.flySets(a, R8, { ranges });
    const t3 = fly("TUNED-R8@3"), w3 = fly("TWIN@3"), o3 = fly("ORACLE@3"), t5 = fly("TUNED-R8@5"), o5 = fly("ORACLE@5"), w4 = fly("TWIN@4");
    ok("!! flySets returns H1 and H2, four dives each (two seeds of far and both), at the arm's station count (the scenarios carry 3 or 5 stations)", J(Object.keys(t3)) === J(["H1", "H2"]) && t3.H1.runs.length === 4 && t5.H2.runs.length === 4 && setN(["far"], 1344, 1344, 5)[0].stations.length === 5);
    ok("!! the oracle is at least the tuned rule on every dive at 3 and at 5 stations", ["H1", "H2"].every((s) => o3[s].runs.every((r, i) => r.score >= t3[s].runs[i].score - 1e-12) && o5[s].runs.every((r, i) => r.score >= t5[s].runs[i].score - 1e-12)));
    ok("!! the oracle arm IS stationRound.oracleRuns on the same scenarios, dive for dive", (() => { const set = setN(X.HARD, 1344, 1345, 3), d = oracleRuns(R8, set); return o3.H1.runs.every((r, i) => r.score === d.runs[i].score && r.fingerprint === d.runs[i].fingerprint); })());
    ok("!! the tuned rule is T.evaluate's tuned dive with the noisy gauge and the twin is another pilot on at least one dive", t3.H1.runs.every((r, i) => r.fingerprint === T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), setN(X.HARD, 1344, 1345, 3), { gauge: T.GAUGE, seconds: 100 }).runs[i].fingerprint) && ["H1", "H2"].some((s) => w3[s].runs.some((r, i) => r.fingerprint !== t3[s].runs[i].fingerprint)));
    ok("!! the twin flies four stations; a 4-station scenario differs from the 3-station one", w4.H1.runs.length === 4 && w4.H1.runs.some((r, i) => r.fingerprint !== w3.H1.runs[i].fingerprint));
    X.setFlight({});
    const thr = (a) => { try { X.flySets(a, R8, { ranges: { H1: [1, 1], H2: [2, 2] } }); return false; } catch { return true; } };
    ok("!! flySets refuses an unknown arm before flying; assemble keys sets then arms", thr("TWIN@6") && J(Object.keys(X.assemble({ A: t3, B: o3 }).H2)) === J(["A", "B"]) && X.assemble({ A: t3 }).H1.A === t3.H1 && X.assemble({ A: t3 }).H2.A === t3.H2);
}
sec("9. SOURCE");
{
    ok("!! the seeds 4201, 4248, 4301 and 4348 appear once each, in SET_RANGES", ["4201", "4248", "4301", "4348"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
