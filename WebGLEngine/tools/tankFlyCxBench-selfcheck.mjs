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
//   7  THE PAIRED TEST OF THE MEMORY (brain/TANK_PILOTS_WIP.md, "FOLLOW-UP: DOES THE MEMORY MATTER?") the exact sign-flip test against an independent brute force and cases worked by hand, pairedStats and what HOLDS means, the registered verdict, the paired bench (new ids, stateful minus stateless, P1 to P3), its text, the command
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
// ADDENDUM, THE PAIRED TEST OF THE MEMORY (brain/TANK_PILOTS_WIP.md, "FOLLOW-UP: DOES THE MEMORY MATTER?"): 49 MORE MUTANTS of tools/tankFlyCxBench.mjs (exactSignFlipP, pairedStats, pairedVerdict, pairedBench, pairedText, --paired), each run against a copy of this gate, 4 at a time. 46 RED BY NAME (rows in brackets), THREE EQUIVALENT:
//   M01 prefix [1]; M02 ids [1]; M03 seconds [1]; M04 alpha [1]; M05 limit [2]; M06 guard low [1]; M07 guard high [1]; M08 nan [2]; M09 obs abs [3]; M10 eps [1]; M11 count observed [5]; M13 count dir [5]; M14 flip bit
//   [3]; M15 flip update [5]; M16 flip sign kept [5]; M17 total [5]; M18 divide [5]; M19 loop start [2]; M20 stats mean [2]; M21 stats se [1]; M22 better [1]; M23 holds mean [1]; M24 holds p [2]; M26 verdict p3
//   [1]; M27 verdict and [1]; M28 verdict none [1]; M29 diff order [1]; M30 p1 measure [1]; M31 p2 measure [1]; M32 p3 measure [1]; M33 p3 sign [1]; M34 a1 measure [1]; M35 a2 measure [1]; M36 events none [1]; M37
//   arm swap [2]; M38 ids list [2]; M40 text sign [2]; M41 text title [1]; M42 fp small [1]; M43 fp nan [1]; M44 cmd default ids [1]; M45 cmd default seconds [1]; M46 cmd limit [1]; M47 cmd json [1]; M48 cmd flag
//   [1]; M49 gave ids [1]
//   EQUIVALENT, left standing and said: M12 (the count taken with `>` where `>=` stood: the 1e-8 tolerance already makes an exact tie count either way), M25 (`p <= alpha` for `p < alpha`: an exact p is a whole number over 2^n and 0.05 is not one, so no p equals alpha), M39 (the first two tests handed to the verdict in the other order: the verdict
//   treats P1 and P2 alike). ON THE FIRST RUN SEVEN WENT 0 RED: M10 (no tolerance) needed a sample whose two uniform assignments differ in the last bit of their float sums ([0.1, 0.2, 0.3]); M44, M45 and M46 (the registered defaults of 24 ids and 240 s, and the limit of 26) needed the bench replaced by a stand-in that records what it was asked (the real one takes 12 s).
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

console.log("\n7. THE PAIRED TEST OF THE MEMORY");
{
    const brute = (d) => { const n = d.length, obs = Math.abs(d.reduce((a, x) => a + x, 0)); let c = 0; for (let m = 0; m < (1 << n); m++) { let s = 0; for (let j = 0; j < n; j++) s += (m >> j) & 1 ? -d[j] : d[j]; if (Math.abs(s) >= obs - 1e-9) c++; } return c / (1 << n); };
    ok("!! exactSignFlipP on cases worked by hand: [1,1,1] is 2/8 = 0.25 (only +++ and --- reach |3|); [1,2,3] is 0.25; [1,1] is 0.5 (++ and -- reach 2, +- and -+ do not); [1,-1] is 1 (every assignment has |sum| >= 0); [0.5,0.5,1] is 0.25; a single difference is 1 (its flip has the same |sum|)", T.exactSignFlipP([1, 1, 1]) === 0.25 && T.exactSignFlipP([1, 2, 3]) === 0.25 && T.exactSignFlipP([1, 1]) === 0.5 && T.exactSignFlipP([1, -1]) === 1 && T.exactSignFlipP([0.5, 0.5, 1]) === 0.25 && T.exactSignFlipP([7]) === 1);
    const rnd = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const r = rnd(5), d9 = Array.from({ length: 9 }, () => r() - 0.3), d12 = Array.from({ length: 12 }, () => (r() - 0.45) * 2);
    ok("!! exactSignFlipP equals an INDEPENDENT brute force (a bitmask loop over every sign assignment) to the digit, on 9 and 12 random differences with an uneven mean; it does not care about the order of the differences, is the same for d and -d, and a ZERO difference changes nothing ([1,1,1,0] is 0.25 too)", T.exactSignFlipP(d9) === brute(d9) && T.exactSignFlipP(d12) === brute(d12) && T.exactSignFlipP(d12.slice().reverse()) === T.exactSignFlipP(d12) && T.exactSignFlipP(d12.map((x) => -x)) === T.exactSignFlipP(d12) && T.exactSignFlipP([1, 1, 1, 0]) === 0.25);
    ok("!! a strong all-one-sign sample is small and exact: ten differences of 1 give 2/1024 (only the two uniform assignments reach |10|), and ten of 1 with one of -0.5 equals the brute force; and the p is never 0 (the observed assignment always counts)", T.exactSignFlipP(Array(10).fill(1)) === 2 / 1024 && T.exactSignFlipP(Array(10).fill(1)) === brute(Array(10).fill(1)) && T.exactSignFlipP(Array(10).fill(1).concat([-0.5])) === brute(Array(10).fill(1).concat([-0.5])) && T.exactSignFlipP(d12) > 0);
    let e0 = "", e27 = "", eN = null; try { T.exactSignFlipP([]); } catch (e) { e0 = String(e.message); } try { T.exactSignFlipP(Array(27).fill(1)); } catch (e) { e27 = String(e.message); } eN = T.exactSignFlipP([1, NaN, 2]);
    ok("!! the test refuses nothing to test (0 differences) and more than 26 (2^27 assignments), by name and with the limit; a difference that is not a number makes the p NaN, never a number", /needs 1 to 26 differences, got 0/.test(e0) && /needs 1 to 26 differences, got 27/.test(e27) && Number.isNaN(eN) && T.EXACT_LIMIT === 26 && T.ALPHA === 0.05);
    const ps = T.pairedStats([-1, -2, -3]), pn = T.pairedStats([-1, 2, 3]), pnan = T.pairedStats([-1, NaN, -2]);
    ok("!! pairedStats: [-1,-2,-3] is n 3, mean -2, sd 1, se 0.577, 3 of 3 better, p 0.25 -- and does NOT hold (p is not under 0.05: with three differences no p can be); a list with a positive mean never holds even at p < alpha; a missing number gives p NaN and does not hold", ps.n === 3 && ps.mean === -2 && near(ps.sd, 1) && near(ps.se, 1 / Math.sqrt(3)) && ps.better === 3 && ps.p === 0.25 && ps.holds === false && pn.better === 1 && pn.holds === false && Number.isNaN(pnan.p) && pnan.holds === false);
    const strong = T.pairedStats(Array.from({ length: 10 }, () => -1)), pos = T.pairedStats(Array(10).fill(1)), edge = T.pairedStats([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0.6]);
    ok("!! HOLDS needs a NEGATIVE mean AND p < 0.05: ten differences of -1 (p 2/1024) hold; ten of +1 have the same p and do NOT hold (the memory would be hurting); a sample whose p is over 0.05 does not hold even if its mean is negative", strong.holds === true && strong.p === 2 / 1024 && pos.holds === false && pos.p === strong.p && T.pairedStats([-1, -1, -1, 2, -1]).holds === false);
    ok("!! the registered verdict: P3 holding is MEMORY HELPS MORE IN THE DARK whatever P1 and P2 say; P1 and P2 without P3 is MEMORY HELPS, NOT DARK-SPECIFIC; neither P1 nor P2 (and no P3) is NO MEASURABLE EFFECT OF MEMORY; one of P1 and P2 without P3 is MIXED", T.pairedVerdict(false, false, true) === "MEMORY HELPS MORE IN THE DARK" && T.pairedVerdict(true, true, true) === "MEMORY HELPS MORE IN THE DARK" && T.pairedVerdict(true, true, false) === "MEMORY HELPS, NOT DARK-SPECIFIC" && T.pairedVerdict(false, false, false) === "NO MEASURABLE EFFECT OF MEMORY" && T.pairedVerdict(true, false, false) === "MIXED" && T.pairedVerdict(false, true, false) === "MIXED");
    const pb = T.pairedBench({ ids: 3, seconds: 70 }, inputs), one = (arm, id, ev) => T.runArm(arm, id, { seconds: 70, event: ev }, inputs);
    ok("!! the paired bench flies the NEW ids mem-0, mem-1, mem-2 (the registered prefix, not the first table's bench-) for both arms with no event and with the dropout, and its rows ARE those four runs of runArm", pb.ids.join() === "mem-0,mem-1,mem-2" && T.PAIR_ID_PREFIX === "mem-" && pb.seconds === 70 && pb.rows.length === 3 && JSON.stringify(pb.rows[1].stateful.none) === JSON.stringify(one("stateful", "mem-1", null)) && JSON.stringify(pb.rows[1].stateful.drop) === JSON.stringify(one("stateful", "mem-1", "dropout")) && JSON.stringify(pb.rows[2].stateless.none) === JSON.stringify(one("stateless", "mem-2", null)) && JSON.stringify(pb.rows[0].stateless.drop) === JSON.stringify(one("stateless", "mem-0", "dropout")));
    const dd = (f) => pb.rows.map((x) => f(x.stateful) - f(x.stateless));
    ok("!! the differences are STATEFUL MINUS STATELESS, id by id, as registered: P1 the settled lit error with no event, P2 the settled dark error of the dropout run, P3 the dark difference minus the lit difference of the same run, and the reported all-ticks pair; each test is pairedStats of its list", JSON.stringify(pb.diffs.p1) === JSON.stringify(dd((a) => a.none.lit)) && JSON.stringify(pb.diffs.p2) === JSON.stringify(dd((a) => a.drop.dark)) && JSON.stringify(pb.diffs.p3) === JSON.stringify(dd((a) => a.drop.dark - a.drop.lit)) && JSON.stringify(pb.diffs.a1) === JSON.stringify(dd((a) => a.none.litAll)) && JSON.stringify(pb.diffs.a2) === JSON.stringify(dd((a) => a.drop.darkAll)) && JSON.stringify(pb.tests.p2) === JSON.stringify(T.pairedStats(pb.diffs.p2)) && pb.verdict === T.pairedVerdict(pb.tests.p1.holds, pb.tests.p2.holds, pb.tests.p3.holds) && pb.diffs.p1.every(Number.isFinite) && pb.diffs.p1.some((x) => x !== 0));
    const px = T.pairedBench({ ids: 2, seconds: 70, prefix: "zz-" }, inputs);
    ok("!! a different prefix flies different ids (zz-0, zz-1) and so different numbers: the sub's whole flight is a function of its id", px.ids.join() === "zz-0,zz-1" && JSON.stringify(px.rows[0].stateful.none) !== JSON.stringify(one("stateful", "mem-0", null)));
    const txt = T.pairedText(pb), lines = txt.split("\n");
    ok("!! the printed test has its title naming the ids, seconds and the 2^n assignments, a header, one line for P1, P2 and P3 and the two reported all-ticks lines, '(reported)' on those two, HOLDS only where a test holds, and the VERDICT line; a p under 0.0001 is printed in exponent form", /3 new ids x 70 s/.test(lines[0]) && /2\^3 sign assignments/.test(lines[0]) && lines.length === 8 && /^P1 /.test(lines[2]) && /^P2 /.test(lines[3]) && /^P3 /.test(lines[4]) && /\(reported\)/.test(lines[5]) && /\(reported\)/.test(lines[6]) && /^VERDICT: /.test(lines[7]) && lines.slice(2, 7).every((l, i) => /HOLDS$/.test(l) === [pb.tests.p1, pb.tests.p2, pb.tests.p3, pb.tests.a1, pb.tests.a2][i].holds) && /VERDICT: (MEMORY|NO MEASURABLE|MIXED)/.test(lines[7]));
    const fake = { ids: ["a"], seconds: 9, tests: { p1: { mean: -1, sd: 1, se: 1, better: 1, n: 1, p: 0.00002, holds: true }, p2: { mean: NaN, sd: NaN, se: NaN, better: 0, n: 1, p: NaN, holds: false }, p3: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, a1: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, a2: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false } }, verdict: "X" }, ft = T.pairedText(fake).split("\n");
    ok("!! a very small p prints as 2.0e-5, a missing number as n/a (never NaN), p = 1 as 1.0000", /2\.0e-5   HOLDS$/.test(ft[2]) && /n\/a/.test(ft[3]) && !/NaN/.test(ft.join("\n")) && /1\.0000$/.test(ft[4]));
    const cap = () => { const o = { out: [], err: [] }; o.io = { out: (m) => o.out.push(m), err: (m) => o.err.push(m), load: () => inputs }; return o; };
    ok("!! the exact test has the tolerance a walk of 16 million float additions needs: [0.1, 0.2, 0.3] (whose two uniform assignments sum to 0.6000000000000001 and -0.6 by different roads) is 0.25, not 0.125", T.exactSignFlipP([0.1, 0.2, 0.3]) === 0.25 && T.exactSignFlipP([0.1, 0.7, 0.2, 0.4]) === brute([0.1, 0.7, 0.2, 0.4]));
    const seenOpts = []; const stub = { ids: ["a"], seconds: 1, tests: { p1: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, p2: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, p3: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, a1: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false }, a2: { mean: 0, sd: 0, se: 0, better: 0, n: 1, p: 1, holds: false } }, verdict: "NO MEASURABLE EFFECT OF MEMORY" };
    const withStub = (argv) => { const o = cap(); o.io.paired = (opts) => { seenOpts.push({ ...opts }); return stub; }; const code = T.command(argv, o.io); return { code, o }; };
    const dflt = withStub(["--paired"]), onlyIds = withStub(["--paired", "--ids", "5"]), onlySecs = withStub(["--paired", "--seconds", "100"]), edge26 = withStub(["--paired", "--ids", "26"]), edge27 = withStub(["--paired", "--ids", "27"]);
    ok("!! the paired defaults are the REGISTERED ones, field by field: no flags -> 24 ids and 240 s; --ids 5 alone -> 5 ids and still 240 s; --seconds 100 alone -> 24 ids and 100 s; 26 ids (the most the exact test takes) is accepted and 27 is refused (exit 2) without calling the bench", dflt.code === 0 && seenOpts[0].ids === 24 && seenOpts[0].seconds === 240 && seenOpts[1].ids === 5 && seenOpts[1].seconds === 240 && seenOpts[2].ids === 24 && seenOpts[2].seconds === 100 && edge26.code === 0 && seenOpts[3].ids === 26 && edge27.code === 2 && seenOpts.length === 4);
    const c1 = cap(), code1 = T.command(["--paired", "--ids", "2", "--seconds", "70"], c1.io), c2 = cap(), code2 = T.command(["--paired", "--ids", "2", "--seconds", "70", "--json"], c2.io), c3 = cap(), code3 = T.command(["--paired", "--ids", "27"], c3.io);
    ok("!! --paired prints the paired text (exit 0), --json one JSON line of the tests and the verdict, and more than 26 ids is refused (exit 2) before anything is flown; the defaults of the paired test are 24 ids and 240 s (the registered ones) where the bench's are 12 and 160, and an --ids or --seconds given is obeyed", code1 === 0 && /^paired test: stateful minus stateless, 2 new ids x 70 s/.test(c1.out[0]) && code2 === 0 && (() => { try { const j = JSON.parse(c2.out[0]); return j.verdict && j.tests.p1 && j.tests.p3 && Object.keys(j).sort().join() === "tests,verdict"; } catch (e) { return false; } })() && code3 === 2 && /at most 26 ids/.test(c3.err[0]) && c3.out.length === 0 && T.PAIR_IDS === 24 && T.PAIR_SECONDS === 240);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
