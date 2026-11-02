// WebGLEngine/tools/ship/gaugeClip-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gaugeClip-selfcheck.mjs      (about 8 s: a few 100-second dives)
//
// THE GATE OF tools/ship/gaugeClip.mjs (Round 18 of brain/NEEDS_AND_LIMITS.md, registered first, one amendment before any seed was flown).
//   1 SETS      1801-1900, 1901-2000 and 2001-2100 of far and both (200 dives each, 600 per arm), disjoint from every seed of Rounds 1-17; 9 arms in the registered order.
//   2 ARMS      every arm name is a gauge (sd, clip, own-built) or a shift of one constant by 0.04; an unknown name or sd is refused.
//   3 GAUGE     the reading built here IS needsTask.gaugeOf's when clipped (every tick of a scenario), the unclipped one leaves [0, 1] and is otherwise the same noise, sd 0 is the true charge, and the refresh holds a reading for a second.
//   4 READINGS  a pooled difference reads UP / DOWN / SAME against 2 se.
//   5 LINES     the first bottom line in its four cases and the second in its three.
//   6 CHECKS    the own-built reading equals the shipped one, the unclipped one differs, every shift differs; a failed check says NOT WEIGHED.
//   7 REPORT    the lines.
//   8 FLIGHT    real 100-second dives: the own-built clipped arm equals the shipped arm dive for dive at both sds, the bias is small and the unclipped one is not clipped, the shift arms are other dives.
//   9 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: why the tuned rule improves with noise (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "../../brain/needsTask.mjs";
import * as X from "./gaugeClip.mjs";
console.log("gaugeClip-selfcheck -- the Round 18 gauge-clipping test\n");
const code = fs.readFileSync(new URL("./gaugeClip.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568), ...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768)]);
    const seeds = [...rangeOf(1801, 1900), ...rangeOf(1901, 2000), ...rangeOf(2001, 2100)];
    ok("!! the sets are V1 1801-1900, V2 1901-2000 and V3 2001-2100 (the ranges touch at 1900/1901 and 2000/2001 and share nothing), 200 dives each of far and both, and share no seed with Rounds 1-17", J(X.SET_RANGES) === J({ V1: [1801, 1900], V2: [1901, 2000], V3: [2001, 2100] }) && J(X.SET_NAMES) === J(["V1", "V2", "V3"]) && seeds.every((s) => !prior.has(s)) && new Set(seeds).size === 300 && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 200) && J(X.HARD) === J(["far", "both"]));
    ok("!! 9 arms in the registered order; the shift is 0.04 and the three shift arms are LOW, HIGH and CAP", J(X.ARMS) === J(["CLIP-0.1", "CLIP-0.3", "OWN-CLIP-0.1", "OWN-CLIP-0.3", "FREE-0.1", "FREE-0.3", "LOW-0.04", "HIGH-0.04", "CAP-0.04"]) && J(X.SHIFT_ARMS) === J(["LOW-0.04", "HIGH-0.04", "CAP-0.04"]) && X.SHIFT === 0.04);
}
sec("2. ARMS");
{
    const p = (a) => X.parseArm(a, R8);
    ok("!! CLIP-0.3 is the shipped gauge at sd 0.3 (not own-built, clipped); OWN-CLIP-0.1 the own-built one with the clip; FREE-0.3 the own-built one without it", J(p("CLIP-0.3")) === J({ sd: 0.3, clip: true, own: false, params: R8 }) && J(p("OWN-CLIP-0.1")) === J({ sd: 0.1, clip: true, own: true, params: R8 }) && J(p("FREE-0.3")) === J({ sd: 0.3, clip: false, own: true, params: R8 }));
    ok("!! LOW-0.04 moves low down by 0.04 and nothing else; HIGH-0.04 high; CAP-0.04 cap; all on the shipped gauge at sd 0.1", Math.abs(p("LOW-0.04").params.low - 0.34036) < 1e-9 && p("LOW-0.04").params.high === R8.high && p("LOW-0.04").params.cap === R8.cap && Math.abs(p("HIGH-0.04").params.high - 0.64938) < 1e-9 && p("HIGH-0.04").params.low === R8.low && Math.abs(p("CAP-0.04").params.cap - 0.84615) < 1e-9 && p("CAP-0.04").params.high === R8.high && p("CAP-0.04").sd === 0.1 && p("CAP-0.04").own === false && p("LOW-0.04").clip === true);
    const thr = (a) => { try { p(a); return false; } catch { return true; } };
    ok("!! an unknown arm, an unregistered sd (0.2), a shift of 0.05 and a bare name are refused", thr("CLIP-0.2") && thr("FREE-0.5") && thr("LOW-0.05") && thr("TUNED-R8") && thr("CLIP") && thr("TOP-0.04"));
}
sec("3. GAUGE");
{
    const sc = T.scenario(1801, "far"), ship = T.gaugeOf(sc, { sd: 0.1, hz: 1 }), own = X.readingOfScenario(sc, 0.1, true);
    const truth = (i) => 0.5 + 0.4 * Math.sin(i / 700);
    const same = Array.from({ length: 2000 }, (_, i) => ship(i, truth(i)) === own(i, truth(i))).every(Boolean);
    ok("!! the own-built clipped reading equals needsTask.gaugeOf's on 2000 ticks of a moving charge (sd 0.1)", same);
    const big = X.readingOfScenario(sc, 0.3, true), free = X.readingOfScenario(sc, 0.3, false), ship3 = T.gaugeOf(sc, { sd: 0.3, hz: 1 });
    const a = Array.from({ length: 4000 }, (_, i) => [big(i, 0.95), free(i, 0.95), ship3(i, 0.95)]);
    ok("!! at sd 0.3 near the top the clipped reading never leaves [0, 1] and equals the shipped one, the unclipped one does leave it (above 1), and where it is inside [0, 1] it equals the clipped one", a.every(([c, , s]) => c >= 0 && c <= 1 && c === s) && a.some(([, f]) => f > 1) && a.every(([c, f]) => (f >= 0 && f <= 1 ? f === c : true)) && a.some(([c, f]) => f !== c));
    const flat = X.readingOfScenario(sc, 0, false);
    ok("!! at sd 0 the reading is the true charge (held for the second); a true charge past 1 is clipped by the clipped reading and kept by the unclipped one", Array.from({ length: 300 }, (_, i) => flat(i, 0.42) === 0.42).every(Boolean) && X.readingOfScenario(sc, 0, true)(0, 1.3) === 1 && X.readingOfScenario(sc, 0, false)(0, 1.3) === 1.3);
    const hold = X.readingOfScenario(sc, 0.2, false), h = Array.from({ length: 60 }, (_, i) => hold(i, 0.5));
    ok("!! the reading is held for a second: ticks of the same second read alike, and a new second reads another value", new Set(h.slice(0, 5)).size === 1 && h[0] !== h[Math.round(1 / T.DT)] && (() => { const every = Math.round(1 / T.DT); return h.slice(0, every).every((v) => v === h[0]); })());
    const other = X.readingOfScenario(T.scenario(1802, "far"), 0.2, false), o = Array.from({ length: 60 }, (_, i) => other(i, 0.5));
    ok("!! the stream belongs to the scenario (seed and kind): another seed and another kind read differently", o[0] !== h[0] && X.readingOfScenario(T.scenario(1801, "both"), 0.2, false)(0, 0.5) !== h[0]);
}
// synthetic audits: 12 dives per set; each arm's scores = BASE + effect
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7];
const UP = [0.05, 0.06, 0.04, 0.05, 0.05, 0.06, 0.04, 0.05, 0.05, 0.06, 0.04, 0.05], DOWN = UP.map((x) => -x), ZERO = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
const mk = (d, tag = "", bias) => ({ runs: BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: tag + "f" + i })), score: BASE.reduce((a, b) => a + b, 0) / 12 + d.reduce((a, b) => a + b, 0) / d.length, crashed: 0, stranded: 0, ...(bias === undefined ? {} : { bias }) });
const synth = (eff = {}) => {
    const au = {};
    for (const n of X.SET_NAMES) {
        au[n] = {};
        for (const a of X.ARMS) au[n][a] = mk(eff[a] || ZERO.map(() => 0).map((_, i) => (a === "CLIP-0.1" || a === "OWN-CLIP-0.1" ? 0 : 0)), a.startsWith("OWN") ? "C" + a.slice(-3) : a, a.startsWith("OWN") || a.startsWith("FREE") ? 0.001 : undefined);
        au[n]["OWN-CLIP-0.1"] = mk(eff["OWN-CLIP-0.1"] || [0], "CLIP-0.1"); au[n]["CLIP-0.1"] = mk(eff["CLIP-0.1"] || [0], "CLIP-0.1");
        au[n]["OWN-CLIP-0.3"] = mk(eff["OWN-CLIP-0.3"] || eff["CLIP-0.3"] || [0], "CLIP-0.3", 0.004); au[n]["CLIP-0.3"] = mk(eff["CLIP-0.3"] || [0], "CLIP-0.3");
        au[n]["FREE-0.1"] = mk(eff["FREE-0.1"] || [0], "FREE-0.1", 0.0); au[n]["FREE-0.3"] = mk(eff["FREE-0.3"] || [0], "FREE-0.3", 0.0001);
        for (const a of X.SHIFT_ARMS) au[n][a] = mk(eff[a] || [0], a);
    }
    return au;
};

sec("4. READINGS");
{
    const au = synth({ "CLIP-0.3": UP, "FREE-0.3": DOWN, "LOW-0.04": ZERO }), d = (a, b) => X.diffOf(au, a, b);
    ok("!! a steady rise is UP, a steady fall DOWN, a wobble SAME; the pooled n is 36 dives (three sets of twelve)", d("CLIP-0.3", "CLIP-0.1").dir === "UP" && d("FREE-0.3", "FREE-0.1").dir === "DOWN" && d("LOW-0.04", "CLIP-0.1").dir === "SAME" && d("CLIP-0.3", "CLIP-0.1").n === 36 && Math.abs(d("CLIP-0.3", "CLIP-0.1").mean - 0.05) < 0.01);
    ok("!! the difference is a minus b (swap the arguments, the sign flips and UP becomes DOWN)", d("CLIP-0.1", "CLIP-0.3").dir === "DOWN" && d("CLIP-0.1", "CLIP-0.3").mean < 0);
    const tiny = synth({ "LOW-0.04": [0.002, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    ok("!! a rise under 2 se is SAME (one dive in twelve up by 0.002)", X.diffOf(tiny, "LOW-0.04", "CLIP-0.1").dir === "SAME");
    ok("!! the mean reading bias averages the sets, and is null for an arm that builds no reading of its own", Math.abs(X.biasOf(au, "OWN-CLIP-0.3") - 0.004) < 1e-12 && Math.abs(X.biasOf(au, "FREE-0.3") - 0.0001) < 1e-12 && X.biasOf(au, "CLIP-0.1") === null && X.biasOf(au, "LOW-0.04") === null);
}
sec("5. LINES");
{
    const L = (eff) => X.bottomLines(synth(eff));
    ok("!! no replication: CLIP-0.3 not above CLIP-0.1", L({})[0] === "THE IMPROVEMENT WITH NOISE DOES NOT REPLICATE" && L({ "CLIP-0.3": DOWN })[0] === "THE IMPROVEMENT WITH NOISE DOES NOT REPLICATE" && L({ "CLIP-0.3": ZERO })[0] === "THE IMPROVEMENT WITH NOISE DOES NOT REPLICATE");
    ok("!! clipping artefact: it replicates, the unclipped arms do not rise, and the clip lifts CLIP-0.3 over FREE-0.3", L({ "CLIP-0.3": UP })[0] === "THE IMPROVEMENT WITH NOISE IS A CLIPPING ARTEFACT");
    ok("!! not a clipping artefact: it replicates and the unclipped arms rise too (even when the clip adds nothing or something)", L({ "CLIP-0.3": UP, "FREE-0.3": UP })[0] === "THE IMPROVEMENT WITH NOISE IS NOT A CLIPPING ARTEFACT" && L({ "CLIP-0.3": UP, "FREE-0.3": UP.map((x) => x + 0.04) })[0] === "THE IMPROVEMENT WITH NOISE IS NOT A CLIPPING ARTEFACT");
    ok("!! unexplained: it replicates, FREE-0.3 does not rise over FREE-0.1 (both as high as CLIP-0.3) and the clip adds nothing over FREE-0.3", (() => { const a = synth({ "CLIP-0.3": UP, "FREE-0.3": UP.map((x) => x + 0.0), "FREE-0.1": UP }); return X.bottomLines(a)[0]; })() === "THE IMPROVEMENT WITH NOISE IS UNEXPLAINED BY CLIPPING EITHER WAY");
    ok("!! second line: a BETTER charge constant (LOW or HIGH) names the arms in order; a BETTER CAP alone says the depth cap is too shallow; none says the constants stand; a WORSE or SAME shift counts for nothing", L({ "LOW-0.04": UP, "HIGH-0.04": UP })[1] === "THE ROUND 8 TRIP POINTS ARE TOO CAUTIOUS: LOW-0.04, HIGH-0.04" && L({ "HIGH-0.04": UP, "CAP-0.04": UP })[1] === "THE ROUND 8 TRIP POINTS ARE TOO CAUTIOUS: HIGH-0.04" && L({ "CAP-0.04": UP })[1] === "THE ROUND 8 DEPTH CAP IS TOO SHALLOW: CAP-0.04" && L({})[1] === "NO SHIFT HELPS: THE ROUND 8 CONSTANTS STAND" && L({ "LOW-0.04": DOWN, "HIGH-0.04": ZERO })[1] === "NO SHIFT HELPS: THE ROUND 8 CONSTANTS STAND");
}
sec("6. CHECKS");
{
    const eff = { "FREE-0.1": UP, "LOW-0.04": UP, "HIGH-0.04": DOWN, "CAP-0.04": ZERO }, rows = (au) => X.checksOf(au);
    ok("!! six check rows on a clean audit, in order: the two own-gauge rows, FREE DIFFERS, the three shifts; all pass", J(rows(synth(eff)).map((c) => c.name)) === J(["OWN GAUGE OWN-CLIP-0.1", "OWN GAUGE OWN-CLIP-0.3", "FREE DIFFERS", "SHIFT LOW-0.04", "SHIFT HIGH-0.04", "SHIFT CAP-0.04"]) && rows(synth(eff)).every((c) => c.ok));
    const bad = synth(eff); bad.V2["OWN-CLIP-0.3"].runs[4].fingerprint = "x";
    ok("!! one own-built dive that differs from the shipped one breaks OWN GAUGE OWN-CLIP-0.3 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["OWN GAUGE OWN-CLIP-0.3"]));
    const bad1 = synth(eff); bad1.V3["OWN-CLIP-0.1"].runs[0].fingerprint = "x";
    ok("!! the same for the 0.1 pair", J(rows(bad1).filter((c) => !c.ok).map((c) => c.name)) === J(["OWN GAUGE OWN-CLIP-0.1"]));
    const nofree = synth(eff); for (const n of X.SET_NAMES) nofree[n]["FREE-0.1"].runs.forEach((r, i) => (r.fingerprint = nofree[n]["CLIP-0.1"].runs[i].fingerprint));
    ok("!! a FREE arm that never differs from the clipped one breaks FREE DIFFERS only", J(rows(nofree).filter((c) => !c.ok).map((c) => c.name)) === J(["FREE DIFFERS"]));
    const noshift = synth(eff); for (const n of X.SET_NAMES) noshift[n]["HIGH-0.04"].runs.forEach((r, i) => (r.fingerprint = noshift[n]["CLIP-0.1"].runs[i].fingerprint));
    ok("!! a shift arm that never differs from the reference breaks its own row only", J(rows(noshift).filter((c) => !c.ok).map((c) => c.name)) === J(["SHIFT HIGH-0.04"]));
}
sec("7. REPORT");
{
    const L = X.report(synth({ "CLIP-0.3": UP, "FREE-0.1": UP, "LOW-0.04": UP })), txt = L.join("\n");
    ok("!! the head names the three sets; the six checks pass first", /^ROUND 18/.test(L[0]) && L[0].includes("V1 1801-1900") && L[0].includes("V3 2001-2100") && L.slice(1, 7).every((l) => /^  PASS /.test(l)));
    ok("!! one row per arm (nine) with its mean score and, for the own-built readings, the bias (CLIP and shift arms say n/a)", (txt.match(/^  (CLIP|OWN-CLIP|FREE|LOW|HIGH|CAP)-[0-9.]+ +0\.[0-9]{4} +crushed/gm) || []).length === 9 && /OWN-CLIP-0\.3 +0\.[0-9]+ +crushed 0 +stranded 0 +bias \+0\.0040/.test(txt) && /CLIP-0\.3 +0\.[0-9]+ +crushed 0 +stranded 0 +bias n\/a/.test(txt) && /LOW-0\.04 +0\.[0-9]+ +crushed 0 +stranded 0 +bias n\/a/.test(txt));
    ok("!! the replication, no-clip and clip-effect lines, then one line per shift arm with BETTER / WORSE / SAME, each reading its own pair", /CLIP-0\.3 minus CLIP-0\.1 \(replication\): \+0\.05.* UP/.test(txt) && /FREE-0\.3 minus FREE-0\.1 \(no clip\): -0\.05.* DOWN/.test(txt) && /CLIP-0\.3 minus FREE-0\.3 \(the clip at sd 0\.3\): \+0\.05.* UP/.test(txt) && /LOW-0\.04 minus CLIP-0\.1: \+0\.05.* BETTER/.test(txt) && /HIGH-0\.04 minus CLIP-0\.1: [+-]0\.0000.* SAME/.test(txt) && /CAP-0\.04 minus CLIP-0\.1: [+-]0\.0000.* SAME/.test(txt));
    ok("!! the two bottom lines come last, each prefixed BOTTOM LINE:", L[L.length - 2].startsWith("BOTTOM LINE: THE IMPROVEMENT WITH NOISE") && L[L.length - 1] === "BOTTOM LINE: THE ROUND 8 TRIP POINTS ARE TOO CAUTIOUS: LOW-0.04");
    const bad = synth(); bad.V1["OWN-CLIP-0.1"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL OWN GAUGE OWN-CLIP-0\.1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const set = T.setOf(X.HARD, 1801, 1803), fly = (a) => X.flyArm(a, R8, set);
    const c1 = fly("CLIP-0.1"), o1 = fly("OWN-CLIP-0.1"), c3 = fly("CLIP-0.3"), o3 = fly("OWN-CLIP-0.3"), f3 = fly("FREE-0.3");
    ok("!! the own-built clipped arm equals the shipped arm dive for dive at sd 0.1 and at sd 0.3 on six real 100-second dives", c1.runs.every((r, i) => r.fingerprint === o1.runs[i].fingerprint && r.score === o1.runs[i].score) && c3.runs.every((r, i) => r.fingerprint === o3.runs[i].fingerprint));
    ok("!! the unclipped reading at sd 0.3 is another set of dives, and its mean bias is near 0 (|bias| < 0.02) where the clipped one is positive", f3.runs.some((r, i) => r.fingerprint !== o3.runs[i].fingerprint) && Math.abs(f3.bias) < 0.02 && o3.bias > f3.bias, `clipped ${o3.bias.toFixed(4)} free ${f3.bias.toFixed(4)}`);
    ok("!! a shipped-gauge arm carries no bias; an own-built arm does; the scores are in [0, 1]", c1.bias === undefined && typeof o1.bias === "number" && [c1, o1, c3, o3, f3].every((r) => r.runs.every((x) => x.score >= 0 && x.score <= 1)));
    const lo = fly("LOW-0.04"), hi = fly("HIGH-0.04"), cp = fly("CAP-0.04");
    ok("!! the shift arms fly on the shipped gauge at sd 0.1 (no bias of their own), six dives each, scores in [0, 1]", [lo, hi, cp].every((r) => r.runs.length === 6 && r.bias === undefined && r.runs.every((x) => x.score >= 0 && x.score <= 1)));
    ok("!! a shift moves the dive: on the full 600-second dives LOW-0.04 and HIGH-0.04 each differ from the reference on at least one of 20", (() => { X.setFlight({}); const set20 = T.setOf(X.HARD, 1801, 1810), r = X.flyArm("CLIP-0.1", R8, set20), l = X.flyArm("LOW-0.04", R8, set20), h = X.flyArm("HIGH-0.04", R8, set20); X.setFlight({ seconds: 100 }); return l.runs.some((x, i) => x.fingerprint !== r.runs[i].fingerprint) && h.runs.some((x, i) => x.fingerprint !== r.runs[i].fingerprint); })());
    X.setFlight({});
    ok("!! assemble keys sets then arms", J(Object.keys(X.assemble({ A: { V1: 1, V2: 2, V3: 3 }, B: { V1: 4, V2: 5, V3: 6 } }).V2)) === J(["A", "B"]) && X.assemble({ A: { V1: 1, V2: 2, V3: 3 } }).V3.A === 3 && X.assemble({ A: { V1: 1, V2: 2, V3: 3 } }).V1.A === 1);
    const thr = () => { try { X.flySets("CLIP-0.2", R8, { ranges: { V1: [1, 1], V2: [2, 2], V3: [3, 3] } }); return false; } catch { return true; } };
    ok("!! flySets refuses an unknown arm before flying", thr());
}
sec("9. SOURCE");
{
    ok("!! the seeds 1801, 1900, 1901, 2000, 2001 and 2100 appear once each, in SET_RANGES", ["1801", "1900", "1901", "2000", "2001", "2100"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
