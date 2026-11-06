// WebGLEngine/tools/ship/headToHead4-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead4-selfcheck.mjs      (~5-15 s: hand fixtures and one short real audit)
//
// THE GATE OF tools/ship/headToHead4.mjs (Round H4 of brain/HEAD_TO_HEAD.md, registered first).
//   1 SETS      the six arms and their events, the four read arms, the ids 4000-4199 (disjoint from H1's, H2's, the looks' and every gate's ids), 160 s; armsOf's refusals and builders; audit() calls the flight per arm and id and keeps what it returns.
//   2 READINGS  pairOf on belief and on flight: the direction (a minus b), the 2 se bounds at 1.5 and 2.5 se, the two fields independent.
//   3 LINES     the seven bottom lines in all their cases; lost subs counted per arm.
//   4 CHECKS    sizes, ids aligned, scores inside (0, 1), dark ticks exist, the lesion is the held heading (within 1e-9), the event reaches the flight, the arms distinct; a failed check says NOT WEIGHED.
//   5 REPORT    the means table (radians and both scores), the blocks against the held heading, the memory-against-memory blocks, the lines last.
//   6 FLIGHT    one real short audit (ids 0-1, 40 s, the study's estimators from pilotDefs): the lesion IS the held heading, the navigator's belief is near exact, the leaky unit's is far better than the held heading's, deterministic.
//   7 SOURCE    the ids appear once; no clock, random or file.
// NOT CHECKED, said plainly: which memory is best (that is the experiment); that the leaky unit and navigator are realistic (they integrate the exact heading rate).
// SABOTAGE LOG: see the end of this header once the mutation pass has been run.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead4.mjs";
import * as SC from "../../render/subDropoutScene.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead4.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead4-selfcheck -- Round H4\n");
const idb = (i) => i, B0 = { fly: idb, er: idb };

sec("1. SETS");
{
    ok("!! six arms in order: held, leaky-unit-off, leaky-unit, navigator, fly, er; the four read arms are the lesion left out; frozen", J(X.ARM_IDS) === J(["held", "leaky-unit-off", "leaky-unit", "navigator", "fly", "er"]) && J(X.READ_IDS) === J(["leaky-unit", "navigator", "fly", "er"]) && Object.isFrozen(X.ARM_IDS) && Object.isFrozen(X.READ_IDS) && Object.isFrozen(X.EVENT_OF));
    ok("!! each arm's event: held dropout, navigator navigator, the lesion and the leaky unit and the fly loop fly-estimator, the random wiring er-estimator", J(X.EVENT_OF) === J({ held: "dropout", "leaky-unit-off": "fly-estimator", "leaky-unit": "fly-estimator", navigator: "navigator", fly: "fly-estimator", er: "er-estimator" }));
    ok("!! ids 4000-4199 (200), 160 s, a 30 Hz tick and a 12 s settle: not H1's 2000-2199, not H2's 3000-3199, not the looks' ids, not the gates' 0-14", X.IDS.from === 4000 && X.IDS.to === 4199 && X.SECONDS === 160 && near(X.TICK, 1 / 30) && X.SETTLE === 12);
    const arms = X.armsOf(B0);
    ok("!! armsOf gives the six arms in order, each with the event the table says; held and navigator build nothing, the other four carry a builder", J(arms.map((a) => a.id)) === J(X.ARM_IDS) && arms.every((a) => a.event === X.EVENT_OF[a.id]) && arms[0].build === null && arms[3].build === null && [1, 2, 4, 5].every((i) => typeof arms[i].build === "function"));
    ok("!! the fly and er arms carry the builders handed in, by identity", arms[4].build === B0.fly && arms[5].build === B0.er);
    ok("!! armsOf refuses a missing or non-function builder, naming it", /builders\.fly must be a function/.test(thr(() => X.armsOf({ er: idb }))) && /builders\.er must be a function/.test(thr(() => X.armsOf({ fly: idb, er: 3 }))) && /builders\.fly must be a function/.test(thr(() => X.armsOf(null))));
    const state = { pos: [0, 0, -5] }, inner = (st) => ({ saw: st }), p1 = arms[2].build(inner), p0 = arms[1].build(inner);
    ok("!! the leaky arms' builders wrap the inner pilot in the leaky unit (each exposes `last`); the lesion and the unit are different pilots", typeof p1 === "function" && typeof p0 === "function" && p1 !== p0 && p1.last && p0.last && "estimate" in p1.last);
    const calls = [], fake = (arm, n, secs) => { calls.push([arm.id, n, secs]); return { belief: 0.9, flight: 0.8, lost: n === 4002 && arm.id === "er", dark: 100 + n }; };
    const au = X.audit(B0, { range: { from: 4001, to: 4003 }, seconds: 33, flightFn: fake });
    ok("!! audit flies every arm on every id in order (arm-major), hands the arm and id and seconds to the flight, and keeps belief, flight, lost-as-bad, dark ticks and the key sb-<n>", calls.length === 18 && J(calls.slice(0, 4)) === J([["held", 4001, 33], ["held", 4002, 33], ["held", 4003, 33], ["leaky-unit-off", 4001, 33]]) && au.runs.er[1].bad === true && au.runs.er[0].bad === false && au.runs.held[2].key === "sb-4003" && au.runs.held[0].dark === 4101 && au.runs.held[0].belief === 0.9 && au.runs.held[0].flight === 0.8 && au.range.from === 4001 && au.seconds === 33);
}
// a synthetic audit: n ids, per arm a belief and flight list
const N = 40, base = (f) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (f === "flight" ? 1 : 0)));
const wob = (i, a) => (i % 2 ? a : -a);
const mkAu = (spec = {}, n = N) => {
    const au = { runs: {}, range: { from: 1, to: n }, seconds: 60 };
    for (const a of X.ARM_IDS) au.runs[a] = Array.from({ length: n }, (_, i) => {
        const s = spec[a] || {}, off = a === "held" || a === "leaky-unit-off" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a), lost = (s.lost || 0) > i;
        return { key: "sb-" + (i + 1), belief: base("belief")[i % N] + ((s.belief && s.belief(i)) || 0) + off, flight: base("flight")[i % N] + ((s.flight && s.flight(i)) || 0) + off, bad: lost, dark: s.dark === undefined ? 100 : s.dark };
    });
    return au;
};
sec("2. READINGS");
{
    const au = mkAu({ "leaky-unit": { belief: (i) => 0.1 + wob(i, 0.02), flight: () => 0 }, navigator: { belief: (i) => -0.1 + wob(i, 0.02), flight: (i) => 0.1 + wob(i, 0.02) } });
    const lb = X.pairOf(au, "leaky-unit", "held", "belief"), lf = X.pairOf(au, "leaky-unit", "held", "flight"), nb = X.pairOf(au, "navigator", "held", "belief"), nf = X.pairOf(au, "navigator", "held", "flight");
    ok("!! belief and flight are read independently: the leaky unit +0.1 on belief BETTER and level on flight TIES; the navigator -0.1 on belief WORSE and +0.1 on flight BETTER", lb.reading === "BETTER" && near(lb.mean, 0.1, 1e-3) && lf.reading === "TIES" && nb.reading === "WORSE" && near(nb.mean, -0.1, 1e-3) && nf.reading === "BETTER");
    const back = X.pairOf(au, "held", "leaky-unit", "belief");
    ok("!! pairOf is a minus b: held against the leaky unit reads about -0.1 WORSE", back.reading === "WORSE" && near(back.mean, -0.1, 1e-3));
    const amp = 0.03, se = amp * Math.sqrt(N / (N - 1)) / Math.sqrt(N), g = (f, k) => X.pairOf(mkAu({ er: { [f]: (i) => wob(i, amp) + k * se } }), "er", "held", f).reading;
    ok("!! 2 se on both sides, on belief and on flight: +2.5 se BETTER, +1.5 se TIES, -1.5 se TIES, -2.5 se WORSE", ["belief", "flight"].every((f) => g(f, 2.5) === "BETTER" && g(f, 1.5) === "TIES" && g(f, -1.5) === "TIES" && g(f, -2.5) === "WORSE"));
    const d = X.pairOf(mkAu({ fly: { belief: (i) => 0.2 + wob(i, 0.02) }, er: { belief: (i) => 0.05 + wob(i, 0.02) } }), "fly", "er", "belief");
    ok("!! a pair of two arms other than the held heading reads a minus b too: fly 0.2 against er 0.05 is about +0.15 BETTER", d.reading === "BETTER" && near(d.mean, 0.15, 2e-3));
}
sec("3. LINES");
{
    const L = (spec) => X.bottomLines(mkAu(spec)), up = (ids, f, d = 0.1) => Object.fromEntries(ids.map((a) => [a, { [f]: (i) => d + wob(i, 0.02) }]));
    const n0 = L({});
    ok("!! nothing differs: line 1 puts all four read arms in TIE, line 2-4 TIES, line 5 all four TIE, line 6 none, line 7 zero lost", n0[0] === "BELIEF AGAINST THE HELD HEADING: leaky-unit, navigator, fly, er TIE" && n0[1] === "THE NAVIGATOR TIES THE LEAKY UNIT IN BELIEF" && n0[2] === "THE FLY HEADING LOOP TIES THE LEAKY UNIT IN BELIEF; THE RANDOM WIRING TIES IT" && n0[3] === "THE FLY HEADING LOOP TIES THE RANDOM WIRING IN BELIEF" && n0[4] === "FLIGHT AGAINST THE HELD HEADING: leaky-unit, navigator, fly, er TIE" && n0[5] === "BELIEF BEATS THE HELD HEADING BUT FLIGHT DOES NOT: none" && n0[6] === "LOST SUBS: held 0, the other arms 0 (0 in the worst)", J(n0));
    const a = L({ ...up(["leaky-unit", "navigator"], "belief", 0.2), ...up(["fly"], "belief", -0.1) });
    ok("!! belief clauses in order BEAT, TIE, BELOW: leaky unit and navigator beat the held heading, the random wiring ties, the fly loop is below", a[0] === "BELIEF AGAINST THE HELD HEADING: leaky-unit, navigator BEAT IT; er TIE; fly ARE BELOW IT", a[0]);
    const b = L({ navigator: { belief: (i) => 0.3 + wob(i, 0.02) }, "leaky-unit": { belief: (i) => 0.1 + wob(i, 0.02) } })[1], b2 = L({ navigator: { belief: (i) => 0.1 + wob(i, 0.02) }, "leaky-unit": { belief: (i) => 0.3 + wob(i, 0.02) } })[1];
    ok("!! line 2 reads the navigator against the LEAKY UNIT: +0.2 BEATS, -0.2 IS BELOW", b === "THE NAVIGATOR BEATS THE LEAKY UNIT IN BELIEF" && b2 === "THE NAVIGATOR IS BELOW THE LEAKY UNIT IN BELIEF", b + " | " + b2);
    const c = L({ ...up(["fly"], "belief", 0.2), ...up(["leaky-unit"], "belief", 0.05), ...up(["er"], "belief", -0.2) })[2];
    ok("!! line 3: the fly loop beats the leaky unit (+0.15) and the random wiring is below it (-0.25)", c === "THE FLY HEADING LOOP BEATS THE LEAKY UNIT IN BELIEF; THE RANDOM WIRING IS BELOW IT", c);
    const d = L({ ...up(["fly"], "belief", 0.2), ...up(["er"], "belief", 0.05) })[3], d2 = L({ ...up(["fly"], "belief", 0.05), ...up(["er"], "belief", 0.2) })[3];
    ok("!! line 4: the fly loop against the random wiring, and not against the leaky unit: BEATS at +0.15, IS BELOW at -0.15", d === "THE FLY HEADING LOOP BEATS THE RANDOM WIRING IN BELIEF" && d2 === "THE FLY HEADING LOOP IS BELOW THE RANDOM WIRING IN BELIEF", d + " | " + d2);
    const e = L({ ...up(["leaky-unit"], "flight", 0.1), ...up(["er"], "flight", -0.1) })[4];
    ok("!! line 5 reads the FLIGHT field, not belief: the leaky unit beats the held heading, the navigator and the fly loop tie, the random wiring is below", e === "FLIGHT AGAINST THE HELD HEADING: leaky-unit BEAT IT; navigator, fly TIE; er ARE BELOW IT", e);
    const f = L({ ...up(["leaky-unit", "navigator", "fly"], "belief", 0.2), ...up(["navigator"], "flight", 0.2) })[5];
    ok("!! line 6 names the arms whose belief beats the held heading and whose flight does not: three beat on belief, the navigator beats on flight too, so the leaky unit and the fly loop are named", f === "BELIEF BEATS THE HELD HEADING BUT FLIGHT DOES NOT: leaky-unit, fly", f);
    const g = L({ ...up(["leaky-unit", "navigator"], "belief", 0.2), ...up(["leaky-unit", "navigator"], "flight", 0.2) })[5];
    ok("!! line 6 says none when every arm that beats on belief beats on flight", g === "BELIEF BEATS THE HELD HEADING BUT FLIGHT DOES NOT: none", g);
    const h = L({ held: { lost: 3 }, "leaky-unit": { lost: 2 }, er: { lost: 5 }, "leaky-unit-off": { lost: 1 } })[6];
    ok("!! lost subs: held 3, the other arms 8 in total (the leaky unit 2, the random wiring 5, the lesion 1) with 5 in the worst", h === "LOST SUBS: held 3, the other arms 8 (5 in the worst)", h);
}
sec("4. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ navigator: { belief: () => 0.05, flight: () => 0.01 } });
    ok("!! seven check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "DARK TICKS EXIST", "LESION IS THE HELD HEADING", "EVENT REACHES THE FLIGHT", "ARMS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.runs.er.pop(); const a2 = good(); a2.runs.fly[3].key = "x"; const a3 = good(); a3.runs.held[0].belief = 1.0; const a4 = good(); a4.runs.navigator[2].dark = 0;
    const a5 = good(); a5.runs["leaky-unit-off"][7].belief += 0.01; const a6 = good(); a6.runs["leaky-unit-off"][2].flight += 0.01; const a7 = good(); a7.runs.navigator = a7.runs.held.map((r) => ({ ...r })); const a8 = good(); a8.runs.fly = a8.runs.er.map((r) => ({ ...r }));
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a belief of 1 SCORES INSIDE, a run with no dark ticks DARK TICKS EXIST, a lesion off the held heading by 0.01 (belief, then flight) LESION IS THE HELD HEADING, a navigator equal to held EVENT REACHES THE FLIGHT, two identical arms ARMS DISTINCT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("DARK TICKS EXIST") && names(a5).includes("LESION IS THE HELD HEADING") && names(a6).includes("LESION IS THE HELD HEADING") && names(a7).includes("EVENT REACHES THE FLIGHT") && names(a8).includes("ARMS DISTINCT"));
    const a9 = good(); a9.runs.held[5].flight = 0;
    ok("!! a flight score of exactly 0 breaks SCORES INSIDE (0, 1) as a belief of 1 does", names(a9).includes("SCORES INSIDE (0, 1)"));
    const a10 = good(); a10.range = { from: 1, to: 41 };
    ok("!! the expected size is the range's: a 41-id range with 40 runs breaks SIZES", names(a10).includes("SIZES"));
    const a11 = good(); a11.runs["leaky-unit-off"][4].belief += 1e-12;
    ok("!! the lesion may differ from the held heading in the twelfth place (float noise from a rotation by zero) and is still the held heading; the lesion off by 1e-6 is not", !names(a11).includes("LESION IS THE HELD HEADING") && (() => { const a12 = good(); a12.runs["leaky-unit-off"][4].belief += 1e-6; return names(a12).includes("LESION IS THE HELD HEADING"); })());
}
sec("5. REPORT");
{
    const au = mkAu({ "leaky-unit": { belief: (i) => 0.1 + wob(i, 0.02), flight: () => 0 } }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds, the one-sub tanks and 'read once'; the seven checks pass first", /^ROUND H4: .* Ids 1-40 \(40\), 60 s, one sub per tank; read once$/.test(L[0]) && L.slice(1, 8).every((l) => /^  PASS /.test(l)));
    const m = (a, f) => au.runs[a].reduce((s, r) => s + r[f], 0) / au.runs[a].length, row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(16)));
    ok("!! the means table prints each arm's belief rms in radians ((1 - belief) x pi), its belief score and its flight score to four places (held, the leaky unit, the random wiring)", /means \(belief rms in rad \/ belief score \/ flight score\):/.test(t) && ["held", "leaky-unit", "er"].every((a) => row(a) === `  ${a.padEnd(16)} ${((1 - m(a, "belief")) * Math.PI).toFixed(4)} / ${m(a, "belief").toFixed(4)} / ${m(a, "flight").toFixed(4)}`) && X.ARM_IDS.every((a) => row(a)));
    ok("!! a block of belief and flight readings against the held heading for each of the four read arms, and four memory-against-memory blocks (navigator, fly, er against the leaky unit, fly against er)", X.READ_IDS.every((a) => new RegExp("^" + a + ":\\n   belief .*\\n   flight ", "m").test(t)) && ["navigator minus leaky-unit", "fly minus leaky-unit", "er minus leaky-unit", "fly minus er"].every((x) => new RegExp("^" + x + ":\\n   belief .*\\n   flight ", "m").test(t)));
    ok("!! the seven bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-7).every((l) => l.startsWith("BOTTOM LINE: ")) && /BELIEF AGAINST THE HELD HEADING/.test(L[L.length - 7]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.runs.held.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/means \(belief/.test(Lb.join("\n")));
}
sec("6. FLIGHT");
{
    const fs2 = JSON.parse(fs.readFileSync(new URL("../../vendor/hemibrain/hemibrain-cx-heading-loop.json", import.meta.url), "utf8")), defs = SC.pilotDefs({ neurons: fs2.neurons, edges: fs2.edges, io: fs2.io }), pick = (id) => defs.find((d) => d.id === id).build;
    const B = { fly: pick("cx"), er: pick("er") }, opt = { range: { from: 0, to: 1 }, seconds: 40 };
    const a = X.audit(B, opt), a2 = X.audit(B, opt);
    ok("!! an audit flies the six arms on the ids and is deterministic (twice the same scores)", Object.keys(a.runs).length === 6 && J(a.runs) === J(a2.runs) && a.runs.held.length === 2);
    ok("!! on the real flights the lesion IS the held heading (belief within 1e-9, flight within 1e-9), and the leaky unit, the navigator, the fly loop and the random wiring are NOT", a.runs.held.every((r, i) => Math.abs(r.belief - a.runs["leaky-unit-off"][i].belief) < 1e-9 && Math.abs(r.flight - a.runs["leaky-unit-off"][i].flight) < 1e-9) && X.READ_IDS.every((id) => a.runs[id].some((r, i) => Math.abs(r.belief - a.runs.held[i].belief) > 1e-6)));
    const mean = (id) => a.runs[id].reduce((s, r) => s + (1 - r.belief) * Math.PI, 0) / a.runs[id].length;
    ok("!! the navigator's belief is near exact (rms under 0.01 rad), the leaky unit's is far better than the held heading's (under a third of it), and the held heading's drifts (over 0.05 rad)", mean("navigator") < 0.01 && mean("leaky-unit") < mean("held") / 3 && mean("held") > 0.05, `${mean("navigator").toFixed(4)} ${mean("leaky-unit").toFixed(4)} ${mean("held").toFixed(4)}`);
    ok("!! the seven checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
}
sec("7. SOURCE");
{
    ok("!! the ids 4000 and 4199 appear once each; no clock, no random number, nothing read from the disk", code.split("4000").length === 2 && code.split("4199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
