// WebGLEngine/tools/tankFlyCxBench-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/tankFlyCxBench-selfcheck.mjs      (~10 s)
//
// THE BENCH THAT MEASURES THE STATEFUL FLY PILOT IN THE SUB AQUARIUM'S TANK (tools/tankFlyCxBench.mjs). A measurement is only worth its numbers if the tool that made them does what it says, so this holds the pieces to their word:
//   1  THE ANGLE     wrap puts an angle in (-pi, pi]; the error a tick adds is the absolute wrapped angle between the sub's heading and its target's (so 3.0 against -3.0 is 0.283, not 6)
//   2  THE SUMS      a tick with the compass dark goes in the dark buckets and any other tick (lit, or no compass at all) in the lit ones; a tick counts as SETTLED only from SETTLE seconds after the target last changed, and every tick is in the all-ticks bucket
//   3  THE ARMS      each arm's tank entry (circuit, pilot, weights: the autopilot has none, the network is gfc with 963, the stateful and the stateless are flycx with 1,729); an unknown arm throws naming the arms
//   4  THE RUN       one arm on one id is deterministic (twice, identical); every arm spawns where the others do (the same id); the stateful arm is flown by the registered kind and the autopilot by none; the memory changes the flight (stateful differs from stateless);
//                    a run with no event has no dark ticks at all, one with the dropout has some; the numbers are finite
//   5  THE TABLE     the paired difference of the autopilot with itself is exactly zero; the summary's no-event mean is the mean of the rows'; arms and keys are the ones named; the printed table has both readings and NaN printed as n/a
//   6  THE COMMAND   a bad argument is refused (2) and named, unreadable inputs are 1, --json prints the summary, the default prints the tables; the run counts come from the arguments
//
// SABOTAGE LOG -- FIFTY-SIX mutants of tools/tankFlyCxBench.mjs, each run against a copy of this gate, 4 at a time, ALL RED BY NAME on the full re-run (rows in brackets): T01 wrap's upper edge moved [2] | T02 its lower edge made exclusive [1] | T03 the lower fold dropped [2] |
//   T04 the upper fold dropped [2] | T05 SETTLE 6 [1] | T06 TICK 1/20 [3] | T07 the error unwrapped [1] | T08 the error signed [1] | T09 the dark test inverted [4] | T10 no compass counted dark [3] | T11 settled strict [3] | T12 every tick settled [1] |
//   T13 the all-ticks bucket settled only [1] | T14 the all-ticks buckets swapped [5] | T15 the all-ticks sums not added [4] | T16 the settled sums not added [2] | T17 an empty mean 0 [1] | T18 sd by n [1] | T19 a single value's sd 0 [1] | T20 an empty list's mean 0 [1] |
//   T21 the network arm on the stateful weights [2] | T22 the autopilot given weights [2] | T23 the stateful arm on gfc [4] | T24 the id changed [4] | T25 an unknown arm silent [1] | T26 the arms not named [1] | T27 the stateless arm persisting [1] |
//   T28 the stateful arm not persisting [1] | T29 the kind never registered [3] | T30 the event ignored [3] | T31 the event always dropout [1] | T32 the target's age never reset [2] | T33 always reset [3] | T34 the age stepping by two ticks [2] |
//   T35 the lost count dropped [2] | T36 the kind not reported [1] | T37 one tick short [2] | T38 the ids numbered from 1 [1] | T39 the paired difference against the first id's autopilot [2] | T40 the paired difference computed without the autopilot arm [2] |
//   T41 dark-minus-lit's sign [1] | T42 the no-event mean read off the dropout run [1] | T43 the lost sum missing the event run [1] | T44 the all-ticks reading the settled one [1] | T45 the settled reading the all-ticks one [1] | T46 NaN printed [1] |
//   T47 a null cell printed (a crash) [1] | T48 the tables in the other order [1] | T49 --ids 0 accepted [1] | T50 --seconds 10 accepted [1] | T51 an unknown argument accepted [1] | T52 --json printing the table [1] | T53 the default printing JSON [1] |
//   T54 unreadable inputs exiting 2 [1] | T55 success exiting 1 [2] | T56 the options ignored [1].
//   ON THE FIRST RUN TEN WENT 0 RED, and the gate grew the rows that separate them: T06 and T32 and T34 and T37 had nothing to compare a run against (a GOLDEN row of the autopilot's and the stateful arm's numbers on a fixed run now has, with the tick count and the settled-tick counts);
//   T15's row checked the all-ticks buckets' counts and never their sums; T35 and T43 had no run that loses a boat (the sink event does, and the lost count is now checked against the tank's own snapshot of the same flight, and the bench takes the event it is asked for);
//   T40 and T47 were red only by a THROWN ERROR (a bench without the autopilot arm, a table with a null cell: the gate died inside the row) and are red by name now; T46 had no table with a NaN in it (one id has no spread: now it is printed and must read n/a).
"use strict";
import * as T from "./tankFlyCxBench.mjs";
import * as A from "../render/subAquariumSim.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
console.log("tankFlyCxBench-selfcheck -- the bench that measures the stateful pilot in the tank\n");
const inputs = T.loadInputs();

console.log("1. THE ANGLE");
{
    const w = T.wrap, P = Math.PI;
    ok("!! wrap: 0.1 + 2 pi is 0.1, -0.1 - 2 pi is -0.1, pi stays pi, -pi becomes pi (the range is (-pi, pi]), 4 becomes 4 - 2 pi, 7 becomes 7 - 2 pi", near(w(0.1 + 2 * P), 0.1) && near(w(-0.1 - 2 * P), -0.1) && near(w(P), P) && near(w(-P), P) && near(w(4), 4 - 2 * P) && near(w(7), 7 - 2 * P) && near(w(-4), 2 * P - 4));
    const acc = { lit: { n: 0, sum: 0 }, dark: { n: 0, sum: 0 }, litAll: { n: 0, sum: 0 }, darkAll: { n: 0, sum: 0 } };
    T.accumulate(acc, { heading: -3.0, target: { heading: 3.0 }, compass: { valid: true } }, T.SETTLE);
    ok("!! the error is the absolute WRAPPED angle: a target at 3.0 and a heading of -3.0 are 0.283 rad apart (not 6.0), and the sign does not matter (target -3.0, heading 3.0 is the same)", near(acc.lit.sum, 2 * Math.PI - 6) && (() => { const a2 = { lit: { n: 0, sum: 0 }, dark: { n: 0, sum: 0 }, litAll: { n: 0, sum: 0 }, darkAll: { n: 0, sum: 0 } }; T.accumulate(a2, { heading: 3.0, target: { heading: -3.0 }, compass: { valid: true } }, T.SETTLE); return near(a2.lit.sum, 2 * Math.PI - 6); })());
}

console.log("\n2. THE SUMS");
{
    const mk = () => ({ lit: { n: 0, sum: 0 }, dark: { n: 0, sum: 0 }, litAll: { n: 0, sum: 0 }, darkAll: { n: 0, sum: 0 } });
    const tick = (acc, dark, age, e = 0.5) => T.accumulate(acc, { heading: 0, target: { heading: e }, compass: dark === null ? null : { valid: !dark } }, age);
    const a = mk(); tick(a, true, T.SETTLE); tick(a, true, T.SETTLE + 3, 1.5); tick(a, false, T.SETTLE, 0.25);
    ok("!! a dark tick goes in the dark buckets and a lit tick in the lit ones, each with its error: two dark ticks (0.5 and 1.5) and one lit (0.25)", a.dark.n === 2 && near(a.dark.sum, 2) && a.lit.n === 1 && near(a.lit.sum, 0.25) && a.darkAll.n === 2 && near(a.darkAll.sum, 2) && a.litAll.n === 1 && near(a.litAll.sum, 0.25));
    const b = mk(); tick(b, false, T.SETTLE - 0.001); tick(b, true, T.SETTLE - 0.001); tick(b, false, T.SETTLE);
    ok("!! a tick counts as SETTLED only from SETTLE seconds after the target changed (SETTLE exactly counts, a hair before does not), and every tick is in the all-ticks bucket whatever its age", b.lit.n === 1 && near(b.lit.sum, 0.5) && b.dark.n === 0 && b.litAll.n === 2 && near(b.litAll.sum, 1) && b.darkAll.n === 1 && near(b.darkAll.sum, 0.5) && T.SETTLE === 12);
    const c = mk(); tick(c, null, 100); tick(c, false, 100);
    ok("!! a snapshot with NO compass (no event) is a lit tick", c.lit.n === 2 && c.dark.n === 0 && c.darkAll.n === 0);
    const m = T.meanSd([1, 2, 3]), e0 = T.meanSd([]), e1 = T.meanSd([5]);
    ok("!! meanSd: [1,2,3] is mean 2, sd 1 (n - 1), n 3; the empty list and a single value have no sd (NaN) and the empty list no mean", m.mean === 2 && near(m.sd, 1) && m.n === 3 && Number.isNaN(e0.mean) && Number.isNaN(e0.sd) && e1.mean === 5 && Number.isNaN(e1.sd) && e1.n === 1);
}

console.log("\n3. THE ARMS");
{
    const e = (arm) => T.entryFor(arm, "x1", inputs);
    ok("!! the autopilot arm: no weights, circuit gfc, pilot autopilot, and the id it was given", e("autopilot").weights === null && e("autopilot").circuit === "gfc" && e("autopilot").pilot === "autopilot" && e("autopilot").id === "x1");
    ok("!! the network arm: circuit gfc with 963 weights (the noisy-senses champion's), pilot network", e("network").circuit === "gfc" && e("network").weights.length === 963 && e("network").pilot === "network");
    ok("!! the stateful and the stateless arms: circuit flycx with the SAME 1,729 weights (the cx champion's), pilot stateful", ["stateful", "stateless"].every((a) => e(a).circuit === "flycx" && e(a).weights.length === 1729 && e(a).pilot === "stateful") && e("stateful").weights === e("stateless").weights);
    let msg = ""; try { e("fish"); } catch (x) { msg = String(x.message); }
    ok("!! an unknown arm throws and names the arms it has", /unknown arm "fish"/.test(msg) && T.ARMS.every((a) => msg.includes(a)));
    ok("the four arms are autopilot, network, stateful, stateless, in that order, and the list is frozen", T.ARMS.join() === "autopilot,network,stateful,stateless" && Object.isFrozen(T.ARMS));
}

console.log("\n4. THE RUN");
{
    const run = (arm, event, seconds = 70, id = "bench-0") => T.runArm(arm, id, { seconds, event }, inputs);
    const a1 = JSON.stringify(run("stateful", "dropout")), a2 = JSON.stringify(run("stateful", "dropout"));
    ok("!! one arm on one id is DETERMINISTIC: the same run twice gives the same numbers, digit for digit", a1 === a2);
    const st = run("stateful", "dropout"), sl = run("stateless", "dropout"), ap = run("autopilot", "dropout"), nw = run("network", "dropout");
    ok("!! the stateful arm is flown by the REGISTERED KIND (the snapshot says flycx) and so is the stateless one; the autopilot and the network are flown by none", st.kind === "flycx" && sl.kind === "flycx" && ap.kind === null && nw.kind === null);
    ok("!! the MEMORY CHANGES THE FLIGHT in the tank: the stateful arm's numbers differ from the stateless arm's on the same id (the weights are the same)", JSON.stringify(st) !== JSON.stringify(sl));
    ok("!! all four arms fly the same id differently from the autopilot where they should: the network differs from the autopilot, the stateful differs from the autopilot", JSON.stringify(nw) !== JSON.stringify(ap) && JSON.stringify(st) !== JSON.stringify(ap));
    const none = run("autopilot", null, 70), drop = run("autopilot", "dropout", 70);
    ok("!! with NO event there are no dark ticks (the dark mean is NaN and no dark tick was counted); with the dropout there are, and the means are finite", Number.isNaN(none.dark) && none.nDark === 0 && none.darkAll !== none.darkAll && Number.isFinite(none.lit) && Number.isFinite(drop.darkAll) && Number.isFinite(drop.litAll) && drop.nLit > 0);
    ok("the run reports its lost count as a whole number, never negative", [st, sl, ap, nw].every((r) => Number.isInteger(r.lost) && r.lost >= 0));
    // GOLDEN: the numbers of two fixed runs (70 s on bench-0 with the dropout), to four decimals. They are the TANK's flight as it is now: if the tank, the autopilot or the stateful pilot changes how a sub flies, these move and say so here.
    const g = (v, x) => Math.abs(v - x) < 1e-4;
    ok("!! GOLDEN, the autopilot on bench-0 for 70 s through the dropout: 2,100 ticks (the tick is 1/30 s), settled error lit 0.6288 / dark 1.0266, all-ticks lit 1.2573 / dark 1.0641, 651 settled lit ticks and 727 settled dark ticks, nothing lost, no kind", T.TICK === 1 / 30 && ap.ticks === 2100 && g(ap.lit, 0.62885) && g(ap.dark, 1.02656) && g(ap.litAll, 1.25734) && g(ap.darkAll, 1.06411) && ap.nLit === 651 && ap.nDark === 727 && ap.lost === 0 && ap.kind === null, JSON.stringify(ap));
    ok("!! GOLDEN, the stateful arm on bench-0 for 70 s through the dropout: settled error lit 0.4233 / dark 0.9366, all-ticks lit 1.1369 / dark 0.9878, the same 651 and 727 settled ticks as the autopilot (the same id takes the same first targets), kind flycx", g(st.lit, 0.42329) && g(st.dark, 0.93659) && g(st.litAll, 1.13688) && g(st.darkAll, 0.98782) && st.nLit === 651 && st.nDark === 727 && st.kind === "flycx", JSON.stringify(st));
    const sink = run("autopilot", "sink", 200), tk = A.createTank(); tk.sync([T.entryFor("autopilot", "bench-0", inputs)]); tk.setEvent("bench-0", "sink"); for (let i = 0; i < 6000; i++) tk.step(T.TICK);
    ok("!! the lost count is the TANK's: a boat sunk to the floor and put back is counted (1 on 200 s of the sink event), the same as the tank's own snapshot of the same flight, and the run flew all 6,000 ticks", sink.lost === 1 && sink.lost === tk.snapshot()[0].lost && sink.ticks === 6000 && sink.nDark === 0, JSON.stringify(sink));
}

console.log("\n5. THE TABLE");
{
    const res = T.bench({ ids: 2, seconds: 60, arms: ["autopilot", "stateful"] }, inputs);
    ok("!! the bench has one row per arm per id (2 x 2), the ids are bench-0 and bench-1, and the summary has the arms asked for with the settled and the all-ticks readings", res.rows.length === 4 && res.ids.join() === "bench-0,bench-1" && Object.keys(res.summary).join() === "autopilot,stateful" && ["settled", "all"].every((k) => Object.keys(res.summary.stateful[k]).join() === "none,dropLit,dropDark,darkMinusAutopilot,darkMinusLit") && res.seconds === 60);
    const ap = res.summary.autopilot;
    ok("!! the autopilot's paired difference with ITSELF is exactly zero in both readings (mean 0, sd 0)", ap.settled.darkMinusAutopilot.mean === 0 && ap.settled.darkMinusAutopilot.sd === 0 && ap.all.darkMinusAutopilot.mean === 0);
    const rowsAp = res.rows.filter((r) => r.arm === "autopilot"), rowsSt = res.rows.filter((r) => r.arm === "stateful");
    ok("!! the summary's numbers ARE the rows': the autopilot's no-event settled mean is the mean of its rows' no-event lit means, the all-ticks one of litAll, and the stateful dark-minus-autopilot is the paired mean of (stateful dark - autopilot dark) over the ids", near(ap.settled.none.mean, (rowsAp[0].none.lit + rowsAp[1].none.lit) / 2) && near(ap.all.none.mean, (rowsAp[0].none.litAll + rowsAp[1].none.litAll) / 2) && near(res.summary.stateful.settled.darkMinusAutopilot.mean, ((rowsSt[0].drop.dark - rowsAp[0].drop.dark) + (rowsSt[1].drop.dark - rowsAp[1].drop.dark)) / 2) && near(res.summary.stateful.all.darkMinusLit.mean, ((rowsSt[0].drop.darkAll - rowsSt[0].drop.litAll) + (rowsSt[1].drop.darkAll - rowsSt[1].drop.litAll)) / 2));
    ok("the lost count is the sum of the arm's two runs' on every id", res.summary.stateful.lost === rowsSt.reduce((s, r) => s + r.none.lost + r.drop.lost, 0) && res.summary.autopilot.lost === rowsAp.reduce((s, r) => s + r.none.lost + r.drop.lost, 0));
    let lone = null, loneErr = ""; try { lone = T.bench({ ids: 2, seconds: 60, arms: ["stateful"] }, inputs); } catch (e) { loneErr = String(e.message || e); }
    ok("!! a bench WITHOUT the autopilot arm runs, and has no paired difference to the autopilot (null), not a number against nothing", lone !== null && lone.summary.stateful.settled.darkMinusAutopilot === null && lone.summary.stateful.all.darkMinusAutopilot === null, loneErr);
    const sunk = T.bench({ ids: 1, seconds: 200, arms: ["autopilot"], event: "sink" }, inputs);
    ok("!! the bench's second run takes the event it is asked for (sink here): the autopilot lost one boat on it and none on the no-event run, and the summary's lost count is the sum of both runs' (1)", sunk.rows[0].none.lost === 0 && sunk.rows[0].drop.lost === 1 && sunk.summary.autopilot.lost === 1);
    const txt = T.table(res);
    ok("!! the printed table has both readings (settled, then all ticks), a row for each arm in each, the ids x seconds line, and prints a missing number as n/a, not NaN", /2 ids x 60 s/.test(txt) && txt.indexOf("SETTLED ticks") > 0 && txt.indexOf("ALL ticks") > txt.indexOf("SETTLED ticks") && (txt.match(/^autopilot /gm) || []).length === 2 && (txt.match(/^stateful /gm) || []).length === 2 && !/NaN/.test(txt));
    let loneTxt = "", loneTxtErr = ""; try { loneTxt = T.table(lone); } catch (e) { loneTxtErr = String(e.message || e); }
    const one = T.table(T.bench({ ids: 1, seconds: 60, arms: ["autopilot"] }, inputs));
    ok("!! a table with NOTHING to say prints n/a, never NaN and never a crash: the stateful arm alone has no autopilot to be paired with (a null), and one id has no spread (a NaN sd)", /n\/a/.test(loneTxt) && !/NaN|null|undefined/.test(loneTxt) && loneTxtErr === "" && /n\/a/.test(one) && !/NaN|null|undefined/.test(one), loneTxtErr);
}

console.log("\n6. THE COMMAND");
{
    const cap = () => { const o = { out: [], err: [] }; o.io = { out: (m) => o.out.push(m), err: (m) => o.err.push(m), load: () => inputs }; return o; };
    for (const [argv, why] of [[["--ids", "0"], "--ids 0"], [["--ids", "x"], "--ids x"], [["--seconds", "10"], "--seconds 10 (under 40)"], [["--ids"], "--ids with no value"], [["--frobnicate"], "an unknown argument"]]) {
        const c = cap(), code = T.command(argv, c.io);
        ok(`!! ${why}: refused (exit 2), named on stderr, nothing printed on stdout`, code === 2 && c.err.length === 1 && /tankFlyCxBench:/.test(c.err[0]) && c.out.length === 0, c.err[0]);
    }
    const bad = cap(); bad.io.load = () => { throw new Error("no such file"); };
    const codeBad = T.command(["--ids", "1", "--seconds", "40"], bad.io);
    ok("!! inputs that cannot be read: exit 1 and the reason on stderr, nothing run", codeBad === 1 && /cannot read the inputs: no such file/.test(bad.err[0]) && bad.out.length === 0);
    const j = cap(), cj = T.command(["--ids", "1", "--seconds", "40", "--json"], j.io), parsed = (() => { try { return JSON.parse(j.out[0]); } catch (e) { return null; } })();
    ok("!! --json prints the summary of all four arms as one JSON line (settled and all readings) and exits 0", cj === 0 && parsed && Object.keys(parsed).join() === T.ARMS.join() && parsed.stateful.settled && parsed.stateful.all);
    const d = cap(), cd = T.command(["--ids", "1", "--seconds", "40"], d.io);
    ok("!! the default prints the tables (1 ids x 40 s, the SETTLED and ALL readings) and exits 0", cd === 0 && /1 ids x 40 s/.test(d.out[0]) && /SETTLED ticks/.test(d.out[0]) && /ALL ticks/.test(d.out[0]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
