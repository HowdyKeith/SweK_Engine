// WebGLEngine/tools/ship/gpuCrossover-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gpuCrossover-selfcheck.mjs      (~1.4 s without a browser, about 10 s with one; the live section is SKIPPED, and said, without one)
//
// THE GPU BATCH-SIZE CROSSOVER TOOL (tools/ship/gpuCrossover.mjs), held to the registration (brain/GPU_CROSSOVER_WIP.md) before its numbers are read. A timing tool that mis-reads its own timings reports a crossover that is not there, so the Node side is tested on
// synthetic timings with the answer known, and the page side is run once for real:
//   1  THE MEDIAN AND THE CROSSOVER   odd, even, empty; never / always / at; the GPU must STAY below the CPU at every larger size (a dip at N = 4 that is lost again at N = 8 is not a crossover), equal is not below, a series ending above is "never"
//   2  THE ROWS       medians of the rounds, the per-row cost, the number of dispatches at the default cap (ceil(N / 64)), the parity passed through
//   3  THE PREDICTIONS G1 to G5, each threshold inclusive and tested on both sides, each reading null (cannot be read) when the sizes it needs are not there
//   4  THE TEXT       the table says NEVER / from the first size / N = k, flags a parity over the tolerance, prints a missing number as n/a; the prediction block says HELD / MISSED / cannot be read
//   5  THE RECORD     a software adapter's record goes to brain/gpuCrossoverSoftware.jsonl and never to the rig's file (an adapter of unknown kind goes to the software file too), and carries the adapter, the settings, the nets and the score
//   6  THE MEASURE AND THE COMMAND   with a stand-in harness: skipped / failed / no GPU are each a refusal that says why; a good run is processed; bad arguments are refused (exit 2) and named; the header says SOFTWARE ADAPTER for a software one, 'hardware adapter' for a real one
//                     and 'unknown kind' for neither; --write appends ONE line to the right file and nothing is written without it; sizes are sorted
//      --hardware asks the browser for the card (the harness's HARDWARE_ARGS), which on win32 an ordinary run does NOT (it asks for SwiftShader on purpose); the record names the flags that were really used
//   7  THE LIVE RUN   (needs a browser) the page runs on the harness's device: both networks, both GPU configurations, every size, finite positive times, the GPU within 1e-4 of the CPU twin, an adapter described and its software flag read
//
// SABOTAGE LOG -- 121 mutants of tools/ship/gpuCrossover.mjs (the Node side AND the page script it sends to the browser), each run against a copy of this gate, 3 at a time: 118 RED BY NAME on the final runs (rows in brackets), 3 UNOBSERVABLE BY CONSTRUCTION (below):
//   X01 sizes drop [4]; X02 rounds default [1]; X03 minms default [1]; X04 warmup default [1]; X05 tol [4]; X06 cap default [4]; X07 out software [2]; X08 out rig same [2]; X09 median even [1]; X10 median unsorted [3];
//   X11 median mutates [3]; X12 median lexicographic [1]; X13 median empty [1]; X14 cross empty [1]; X15 cross last equal [1]; X16 cross stays [3]; X17 cross first below [2]; X18 cross at index [4]; X19 cross equal
//   lower [1]; X20 cross first dip [1]; X21 rows cpu median [1]; X22 rows capmax median [1]; X23 rows cap64 median [1]; X24 rows parity swap [1]; X25 per row [3]; X26 per row capmax [1]; X27 dispatches floor [3];
//   X28 crossovers swap [3]; X29 g1 one config [1]; X30 g1 strict [1]; X31 g1 some [1]; X32 g1 empty [1]; X33 g2 factor [1]; X34 g2 strict [1]; X35 g2 one way [2]; X36 g2 config [1]; X37 g2 some [1]; X38 g2 null
//   [1]; X39 g3 from 16 [1]; X40 g3 factor [1]; X41 g3 strict [1]; X42 g3 some [1]; X43 g3 null [1]; X44 g4 size [1]; X45 g4 direction [2]; X46 g4 equal [1]; X47 g4 some [1]; X48 g5 factor [1]; X49 g5 strict [1];
//   X50 g5 config [2]; X51 g5 null [1]; X52 f3 nan [1]; X53 f3 small [1]; X54 sci nan [1]; X55 cross text never [1]; X56 cross text always [1]; X57 over flag [2]; X58 over flag cond [1]; X59 table cap label [2];
//   X60 score text null [1]; X61 score text line [1]; X62 record keys [1]; X63 record adapter [1]; X64 outfile software [1]; X65 outfile always rig [2]; X66 measure skipped [2]; X67 measure args [3]; X68 measure
//   timeout [1]; X69 measure nogpu [1]; X70 measure nores [1]; X71 measure software [2]; X72 measure software unknown [2]; X73 sizes duplicate [1]; X74 sizes max [1]; X75 sizes min [3]; X76 sizes integer [1]; X77
//   sizes sort [1]; X78 sizes sort lexicographic [1]; X79 rounds int [1]; X80 rounds zero [1]; X81 option swap [1]; X82 unknown arg [1]; X83 skip exit [1]; X84 skip text [1]; X85 header software [1]; X86 header
//   hardware [1]; X87 warning [1]; X88 adapter name [2]; X89 net order [1]; X90 write always [1]; X91 write file [1]; X92 write newline [1]; X93 write say [1]; X94 exit success [1]; X95 page cap max [1]; X96 page
//   cap64 [1]; X97 page parity compare [1]; X99 page cpu timed [1]; X100 page gpu rows [1]; X101 page gpu rows max [1]; X102 page rounds [1]; X103 page minms [1]; X104 page divide [1]; X105 page warmup [1]; X107
//   page rows count [1]; X108 page nets pilot weights [1]; X109 page seat weights [1]; X111 measured swap [2]; X113 calls counted [1]; X114 warm not returned [1]; X117 warm result [1]; X119 dispatch sum [1]; X120
//   gpu round ms [1]; X121 gpu calls returned [1]; X122 rounds fewest [1]; X123 cpu round ms [1]; X124 round ms max [1]; X128 decided sum [1]
//   UNOBSERVABLE, left standing and said: X125, X126 and X127 replace a MEASURED count (the rows each timed call decided, which brain got which) with the value it is expected to have, so the live run sees the same number; the point of the count is that the page measured it.
//   Dropped as the same kind or as no change of behaviour before the final run: X98 (the cap64 parity taken from the one-dispatch outputs: the same number whenever the cap does not change the arithmetic), X106 and X110 (the seed of the seat rows; the order the two networks run in), X112 (the shortest count of calls in a round
//   read as the longest: superseded by the round-length measure), X116 and X118 (the measured dispatch count replaced by the formula).
//   ON THE FIRST RUN TWENTY-FOUR WENT 0 RED and the gate grew what separated them: the live run compared nothing that was timed (the page now counts, on the brains themselves, the dispatches and the rows decided by the TIMED calls, the warm-up dispatches, and the length of every round --
//   time per call x calls -- and the rows assert them: one dispatch for the one-dispatch brain, ceil(N / 64) for the default cap, N rows a call, two warm-ups, every round at least the 20 ms asked for); a parity of exactly 0 would be a comparison that compared nothing (the pilot's twin is double and the device float32, so
//   the worst difference is above 0); the CPU twin at 257 rows must take at least ten times one row; the median must sort numbers (10, 9, 100); and FIVE were red only by a THROWN ERROR (a record with no score or no adapter, a harness that answered nothing or no GPU, a score read on too few sizes) and every one of
//   those calls is now wrapped so the row fails by name.
//   HARDWARE FLAG (added after the first sandbox run, when the rig's Windows command turned out to need it -- an ordinary win32 run asks for SwiftShader on purpose): TWELVE MORE MUTANTS H01-H12 on --hardware, launchArgsOf, the flags handed to the harness, the recorded flags and the software note;
//   ELEVEN RED BY NAME. H05 (the hardware flags written as the ordinary ones) is EQUIVALENT ON THIS BOX and only here: the harness's HARDWARE_ARGS and LAUNCH_ARGS are the same one flag on Linux and differ on win32, where the row compares against the harness's own constants. Four of the twelve were first red only by a thrown error (a flags list that was not a list).
"use strict";
import * as T from "./gpuCrossover.mjs";
import { webgpuSkipReason, HARDWARE_ARGS, LAUNCH_ARGS } from "./webgpuHarness.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const safely = async (f) => { try { return await f(); } catch (e) { return { threw: String(e && e.message || e).slice(0, 80) }; } };
const js = (x) => (Array.isArray(x) ? x.join() : "(not a list)");
const near = (a, b, e = 1e-12) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
console.log("gpuCrossover-selfcheck -- the batch-size crossover tool\n");

console.log("1. THE MEDIAN AND THE CROSSOVER");
{
    const xs = [9, 1, 5];
    const lex = T.median([10, 9, 100]);
    ok("!! median: odd is the middle (9,1,5 -> 5), NUMERICALLY (10, 9, 100 -> 10, not the text order's 100), even the mean of the middle two (4,1,3,2 -> 2.5), one value is itself, empty is NaN, and the input is NOT reordered", T.median(xs) === 5 && xs.join() === "9,1,5" && T.median([4, 1, 3, 2]) === 2.5 && T.median([7]) === 7 && Number.isNaN(T.median([])) && lex === 10);
    const pts = (gpu, cpu) => gpu.map((g, i) => ({ n: 1 << i, gpu: g, cpu: cpu[i] }));
    ok("!! a GPU above the CPU at every size is NEVER (n null); a GPU below at every size is 'always' from the FIRST size tested; a GPU that crosses between 8 and 16 and stays below is 'at' 16", T.crossover(pts([5, 5, 5, 5], [1, 2, 3, 4])).kind === "never" && T.crossover(pts([5, 5, 5, 5], [1, 2, 3, 4])).n === null && (() => { const a = T.crossover(pts([1, 1, 1, 1], [5, 5, 5, 5])); return a.kind === "always" && a.n === 1; })() && (() => { const a = T.crossover(pts([9, 9, 9, 9, 1, 1], [2, 2, 2, 2, 2, 2])); return a.kind === "at" && a.n === 16; })());
    ok("!! the GPU must STAY below: a dip below at N = 4 that is lost again at N = 8, then below from N = 16 on, crosses at 16 (not 4); a series that dips below and ends ABOVE is never", T.crossover(pts([9, 9, 1, 9, 1, 1], [2, 2, 2, 2, 2, 2])).n === 16 && T.crossover(pts([9, 9, 1, 1, 1, 9], [2, 2, 2, 2, 2, 2])).kind === "never");
    ok("!! EQUAL is not below: gpu = cpu at the last size is never; gpu = cpu at the size before the crossing does not start it early; a single point below is 'always', a single point not below is never, and no points is 'none'", T.crossover(pts([2, 2], [2, 2])).kind === "never" && T.crossover(pts([9, 2, 1], [2, 2, 2])).n === 4 && T.crossover([{ n: 8, gpu: 1, cpu: 2 }]).kind === "always" && T.crossover([{ n: 8, gpu: 2, cpu: 2 }]).kind === "never" && T.crossover([]).kind === "none");
}

console.log("\n2. THE ROWS");
const raw = (n, o = {}) => ({ n, cpu: [0.4, 0.2, 0.3], capMax: [3, 1, 2], cap64: [8, 6, 7], parityCapMax: 1e-6, parityCap64: 2e-6, ...o });
{
    const rows = T.rowsOf([raw(1), raw(64), raw(65), raw(8192, { cpu: [8, 8, 8] })]);
    ok("!! each row's times are the MEDIANS of its rounds (cpu 0.4, 0.2, 0.3 -> 0.3; capMax 3, 1, 2 -> 2; cap64 8, 6, 7 -> 7), the sizes and the parity are passed through", rows.map((r) => r.n).join() === "1,64,65,8192" && near(rows[0].cpu, 0.3) && near(rows[0].capMax, 2) && near(rows[0].cap64, 7) && rows[0].parityCapMax === 1e-6 && rows[0].parityCap64 === 2e-6);
    ok("!! the per-row costs are the time over N (cpu 0.3 / 64 rows; capMax 2 / 64), and the dispatches at the default cap are ceil(N / 64): 1 row 1, 64 rows 1, 65 rows 2, 8192 rows 128", near(rows[1].cpuPerRow, 0.3 / 64) && near(rows[1].capMaxPerRow, 2 / 64) && [1, 1, 2, 128].every((d, i) => rows[i].cap64Dispatches === d) && T.CAP_DEFAULT === 64);
    const withM = T.rowsOf([raw(5, { dispatchesCapMax: 1, dispatchesCap64: 3, decidedCapMax: 5, decidedCap64: 5, cpuCalls: [40, 50, 60], gpuCalls: [7, 8, 9] })])[0], noM = T.rowsOf([raw(5)])[0];
    ok("!! what the page counted is passed through when it is there: dispatches of the timed calls (1 and 3), rows decided per call (5 and 5), the LENGTH OF THE SHORTEST ROUND (time per call x calls: cpu 0.4 x 40, 0.2 x 50, 0.3 x 60 = 16, 10, 18 -> 10; GPU 3 x 7, 1 x 8, 2 x 9 = 21, 8, 18 -> 8), the round count (the fewest of the three series), and null when the page counted nothing", withM.measured.capMax === 1 && withM.measured.cap64 === 3 && withM.measured.decidedCapMax === 5 && withM.measured.decidedCap64 === 5 && near(withM.measured.cpuRoundMsMin, 10) && near(withM.measured.gpuRoundMsMin, 8) && noM.measured === null && noM.rounds === 3 && T.rowsOf([raw(5, { cap64: [1, 2] })])[0].rounds === 2 && T.rowsOf([raw(5, { capMax: [1] })])[0].rounds === 1 && T.rowsOf([raw(5, { cpu: [1, 2, 3, 4] })])[0].rounds === 3);
    const xo = T.crossoversOf(T.rowsOf([raw(1, { cpu: [1, 1, 1], capMax: [9, 9, 9], cap64: [0.1, 0.1, 0.1] }), raw(2, { cpu: [1, 1, 1], capMax: [0.1, 0.1, 0.1], cap64: [9, 9, 9] })]));
    ok("!! the two configurations are read against the CPU SEPARATELY: capMax is above at N = 1 and below at N = 2 (crosses at 2); cap64 is below at N = 1 and above at N = 2 (never)", xo.capMax.kind === "at" && xo.capMax.n === 2 && xo.cap64.kind === "never");
}

console.log("\n3. THE PREDICTIONS");
{
    const mkRows = (spec) => T.rowsOf(T.SIZES.map((n) => { const s = spec(n); return { n, cpu: [s.cpu], capMax: [s.capMax], cap64: [s.cap64], parityCapMax: s.pm ?? 1e-6, parityCap64: s.p64 ?? 1e-6 }; }));
    const net = (spec) => { const rows = mkRows(spec); return { rows, crossovers: T.crossoversOf(rows) }; };
    // a healthy net: cpu 0.001 ms a row, the GPU 2 ms flat to 64 rows then 0.0002 a row (so it crosses near N = 2048); cap64 adds 1 ms per extra dispatch
    const healthy = (n) => ({ cpu: 0.001 * n, capMax: n <= 64 ? 2 : 2 + 0.0002 * (n - 64), cap64: 2 + Math.max(0, Math.ceil(n / 64) - 1) * 1 });
    const base = { pilot: net(healthy), seat: net(healthy) }, g = T.score(base);
    ok("!! a healthy pair of networks holds G1 to G4 and G5 (equal crossovers), each as true", g.g1 === true && g.g2 === true && g.g3 === true && g.g4 === true && g.g5 === true, JSON.stringify(g));
    const withNet = (k, spec) => ({ ...base, [k]: net(spec) });
    ok("!! G1 is INCLUSIVE at 1e-4 and covers both configurations of both networks: exactly 1e-4 holds; 1.1e-4 in the one-dispatch parity misses; 1.1e-4 in the cap64 parity of the OTHER network misses", T.score(withNet("pilot", (n) => ({ ...healthy(n), pm: 1e-4, p64: 1e-4 }))).g1 === true && T.score(withNet("pilot", (n) => ({ ...healthy(n), pm: n === 512 ? 1.1e-4 : 1e-6 }))).g1 === false && T.score(withNet("seat", (n) => ({ ...healthy(n), p64: n === 8192 ? 1.1e-4 : 1e-6 }))).g1 === false && T.TOL === 1e-4);
    ok("!! G2 is a factor of 3 EITHER WAY and inclusive: N = 1 at 3 x the N = 64 time holds, 3.01 x misses, and a GPU that is 4 x FASTER at N = 1 than at 64 misses (it is not a fixed cost); both networks must hold", T.score(withNet("pilot", (n) => ({ ...healthy(n), capMax: n === 1 ? 6 : n === 64 ? 2 : healthy(n).capMax }))).g2 === true && T.score(withNet("pilot", (n) => ({ ...healthy(n), capMax: n === 1 ? 6.02 : n === 64 ? 2 : healthy(n).capMax }))).g2 === false && T.score(withNet("pilot", (n) => ({ ...healthy(n), capMax: n === 1 ? 0.5 : n === 64 ? 2 : healthy(n).capMax }))).g2 === false && T.score(withNet("seat", (n) => ({ ...healthy(n), capMax: n === 1 ? 6.02 : n === 64 ? 2 : healthy(n).capMax }))).g2 === false);
    ok("!! G3 is the CPU twin's per-row cost from N = 16 up, within 1.5 inclusive: 1.5 x holds, 1.51 x misses, and N below 16 does NOT count (a cheap first row does not break it)", T.score(withNet("pilot", (n) => ({ ...healthy(n), cpu: 0.001 * n * (n === 16 ? 1.5 : 1) }))).g3 === true && T.score(withNet("pilot", (n) => ({ ...healthy(n), cpu: 0.001 * n * (n === 16 ? 1.51 : 1) }))).g3 === false && T.score(withNet("pilot", (n) => ({ ...healthy(n), cpu: 0.001 * n * (n < 16 ? 5 : 1) }))).g3 === true && T.score(withNet("seat", (n) => ({ ...healthy(n), cpu: 0.001 * n * (n === 4096 ? 1.51 : 1) }))).g3 === false);
    ok("!! G4: at N = 8192 the default cap must be SLOWER than one dispatch for BOTH networks: equal misses, faster misses, one network faster misses", T.score(withNet("pilot", (n) => ({ ...healthy(n), cap64: n === 8192 ? healthy(n).capMax : healthy(n).cap64 }))).g4 === false && T.score(withNet("seat", (n) => ({ ...healthy(n), cap64: n === 8192 ? 0.1 : healthy(n).cap64 }))).g4 === false && T.score(withNet("pilot", (n) => ({ ...healthy(n), cap64: n === 8192 ? healthy(n).capMax + 0.001 : healthy(n).cap64 }))).g4 === true);
    // G5: crossovers. a GPU that crosses at a chosen size: capMax = cpu * 2 below, cpu / 2 from the size on
    const crossAt = (k) => (n) => ({ cpu: 1, capMax: n >= k ? 0.5 : 2, cap64: 5 });
    const c5 = (a, b) => T.score({ pilot: net(crossAt(a)), seat: net(crossAt(b)) }).g5;
    ok("!! G5: crossovers within a factor of 2 hold INCLUSIVE (pilot at 64, seat at 128), a factor of 4 misses (64 and 256), either way round; a network that never crosses makes it unreadable (null), not a miss", c5(64, 128) === true && c5(128, 64) === true && c5(64, 256) === false && c5(256, 64) === false && T.score({ pilot: net(crossAt(64)), seat: net(() => ({ cpu: 1, capMax: 2, cap64: 5 })) }).g5 === null && T.score({ pilot: net(crossAt(64)) }).g5 === null);
    const few = { pilot: { rows: T.rowsOf([raw(1)]), crossovers: { capMax: { kind: "never", n: null }, cap64: { kind: "never", n: null } } } };
    const sf = (() => { try { return T.score(few); } catch (e) { return { threw: String(e.message) }; } })();
    ok("!! with too few sizes each prediction says 'cannot be read' (null) rather than guessing: one size, no N = 64, no N = 8192, fewer than two sizes of 16 or more; and no network at all is null for G1", !sf.threw && sf.g1 === true && sf.g2 === null && sf.g3 === null && sf.g4 === null && sf.g5 === null && T.score({}).g1 === null, sf.threw || "");
}

console.log("\n4. THE TEXT");
{
    const rows = T.rowsOf([raw(1, { cpu: [0.01], capMax: [3], cap64: [3], parityCapMax: 2e-4 }), raw(512, { cpu: [4], capMax: [3], cap64: [20] })]);
    const never = { rows, crossovers: { capMax: { kind: "never", n: null }, cap64: { kind: "at", n: 512 } } }, txt = T.netTable("pilot", never), lines = txt.split("\n");
    ok("!! the net table has its title, a header, a line for every size, the parity worst case with an 'OVER 0.0001' flag on the row whose parity is over (2e-4), and the two crossovers in words (NEVER ...; N = 512)", /^pilot network -- ms per call/.test(lines[0]) && /N \|/.test(lines[1]) && lines.length === 6 && /OVER 0.0001/.test(lines[2]) && !/OVER/.test(lines[3]) && /crossover, cap = largest N: NEVER/.test(txt) && /crossover, cap = 64: +N = 512/.test(txt));
    const over64 = T.netTable("pilot", { rows: T.rowsOf([raw(1, { parityCapMax: 1e-6, parityCap64: 3e-4 })]), crossovers: never.crossovers }).split("\n")[2], nanPar = T.netTable("pilot", { rows: T.rowsOf([raw(1, { parityCapMax: NaN, parityCap64: NaN })]), crossovers: never.crossovers });
    ok("!! the parity column flags a parity over the tolerance in EITHER configuration (cap64 alone at 3e-4 is flagged), and a parity that is not a number prints n/a, never NaN", /OVER 0.0001/.test(over64) && !/NaN/.test(nanPar) && /n\/a/.test(nanPar.split("\n")[2]));
    ok("!! 'always' reads 'from the first size tested (N = 1)'; a time that is not a number reads n/a, never NaN; a time under 0.01 ms is printed in exponent form so it is not 0.000", /from the first size tested \(N = 1\)/.test(T.netTable("seat", { rows, crossovers: { capMax: { kind: "always", n: 1 }, cap64: { kind: "none", n: null } } })) && /n\/a/.test(T.netTable("seat", { rows: T.rowsOf([raw(1, { cpu: [NaN] })]), crossovers: never.crossovers })) && !/NaN/.test(T.netTable("seat", { rows: T.rowsOf([raw(1, { cpu: [NaN] })]), crossovers: never.crossovers })) && /1\.00e-2|1\.0e-2|1e-2/.test(txt.split("\n")[2] + "") === false && /e-3/.test(T.netTable("pilot", { rows: T.rowsOf([raw(1, { cpu: [0.003] })]), crossovers: never.crossovers })));
    const st = T.scoreText({ g1: true, g2: false, g3: null, g4: true, g5: false });
    ok("!! the prediction block has a line for each of G1 to G5 and says HELD, MISSED or 'cannot be read' for true, false and null", st.split("\n").length === 5 && /^G1 .*: HELD$/m.test(st) && /^G2 .*: MISSED$/m.test(st) && /^G3 .*: cannot be read$/m.test(st) && /^G4 .*: HELD$/m.test(st) && /^G5 .*: MISSED$/m.test(st) && /^G1 .* 0\.0001 /m.test(st) && /^G2 .*N = 1 .*N = 64/m.test(st) && /^G3 .*N = 16 /m.test(st) && /^G4 .*N = 8192 /m.test(st) && /^G5 .*factor of 2/m.test(st));
}

console.log("\n5. THE RECORD");
{
    ok("!! a SOFTWARE adapter's record goes to brain/gpuCrossoverSoftware.jsonl, an adapter of UNKNOWN kind (null) goes there too, and only a REAL adapter's goes to brain/rig-results/gpuCrossover.jsonl", T.outFileFor(true) === "brain/gpuCrossoverSoftware.jsonl" && T.outFileFor(null) === "brain/gpuCrossoverSoftware.jsonl" && T.outFileFor(false) === "brain/rig-results/gpuCrossover.jsonl" && T.OUT_SOFTWARE !== T.OUT_RIG);
    const res = { adapter: { vendor: "google", architecture: "swiftshader" }, software: true, launchArgs: ["--a"], nets: { pilot: { rows: T.rowsOf([raw(1)]), crossovers: { capMax: { kind: "never", n: null }, cap64: { kind: "never", n: null } } } } }, rec = T.recordOf(res, { sizes: [1], rounds: 2 });
    ok("!! the record carries the adapter, the software flag, the launch flags, the settings, the nets (rows and crossovers) and the score, and nothing about the date or the machine's name", !!rec.adapter && rec.adapter.architecture === "swiftshader" && rec.software === true && rec.launchArgs[0] === "--a" && rec.settings.rounds === 2 && rec.nets.pilot.rows.length === 1 && rec.nets.pilot.crossovers.capMax.kind === "never" && !!rec.score && typeof rec.score.g1 === "boolean" && Object.keys(rec).sort().join() === "adapter,launchArgs,nets,score,settings,software");
}

console.log("\n6. THE MEASURE AND THE COMMAND");
{
    const good = (sizes) => ({ pilot: sizes.map((n) => raw(n)), seat: sizes.map((n) => raw(n)) });
    let seen = null;
    const stub = (over = {}) => async (opts) => { seen = opts; return { ok: true, result: good(opts.args.sizes), adapter: { vendor: "google", architecture: "swiftshader" }, software: true, launchArgs: ["--x"], pageErrors: [], ...over }; };
    const m = await T.measure({ sizes: [1, 64], rounds: 2, minMs: 3, warmup: 3 }, stub());
    ok("!! measure hands the harness the engine root, the page script, the settings as its args and a long timeout, and returns the nets processed (rows and crossovers), the adapter, the software flag and the launch flags", m.ok === true && seen.script === T.PAGE_SCRIPT && seen.args.sizes.join() === "1,64" && seen.args.rounds === 2 && seen.args.minMs === 3 && seen.timeoutMs >= 600000 && typeof seen.engineRoot === "string" && m.nets.pilot.rows.length === 2 && m.nets.seat.crossovers.capMax.kind && m.adapter.architecture === "swiftshader" && m.software === true && js(m.launchArgs) === T.launchArgsOf(false).join() && seen.launchArgs === undefined && (await T.measure({ sizes: [1] }, stub({ software: undefined }))).software === null && (await T.measure({ sizes: [1] }, stub({ software: false }))).software === false);
    const sk = await safely(() => T.measure({ sizes: [1] }, async () => ({ skipped: true, reason: "no browser" }))), bad = await safely(() => T.measure({ sizes: [1] }, async () => ({ ok: false, reason: "the page died" }))), nogpu = await safely(() => T.measure({ sizes: [1] }, async () => ({ ok: true, result: { noGpu: "webgl" } }))), nores = await safely(() => T.measure({ sizes: [1] }, async () => ({ ok: true, result: null })));
    ok("!! a skipped harness, a failed page, a page with no GPU and a page that answered nothing are each a refusal (ok false) with the reason; only the skip says skipped", sk.ok === false && sk.skipped === true && sk.reason === "no browser" && bad.ok === false && bad.skipped === false && bad.reason === "the page died" && nogpu.ok === false && /no GPU in the page \(backend webgl\)/.test(nogpu.reason) && nores.ok === false && /did not answer/.test(nores.reason));
    const cap = () => { const o = { out: [], err: [], files: [] }; o.io = { out: (x) => o.out.push(x), err: (x) => o.err.push(x), appendFile: (f, c) => o.files.push({ f, c }), run: stub() }; return o; };
    for (const [argv, why] of [[["--sizes", "0"], "--sizes 0"], [["--sizes", "8193"], "--sizes 8193"], [["--sizes", "1,1"], "--sizes 1,1 (a repeat)"], [["--sizes", "1.5"], "--sizes 1.5"], [["--sizes", ""], "--sizes empty"], [["--sizes"], "--sizes with no value"], [["--rounds", "0"], "--rounds 0"], [["--rounds", "1.5"], "--rounds 1.5"], [["--min-ms", "-1"], "--min-ms -1"], [["--min-ms", "x"], "--min-ms x"], [["--frobnicate"], "an unknown argument"]]) {
        const c = cap(); seen = null; let code; try { code = await T.command(argv, c.io); } catch (e) { code = "threw: " + e.message; }
        ok(`!! ${why}: refused (exit 2), named on stderr, nothing run, nothing printed, nothing written`, code === 2 && c.err.length === 1 && /^gpuCrossover:/.test(c.err[0]) && seen === null && c.out.length === 0 && c.files.length === 0, c.err[0]);
    }
    const sk2 = cap(); sk2.io.run = async () => ({ skipped: true, reason: "no browser" }); const e1 = await T.command([], sk2.io);
    const bd2 = cap(); bd2.io.run = async () => ({ ok: false, reason: "the page died" }); const e2 = await T.command(["--write"], bd2.io);
    ok("!! no measurement: exit 1, 'skipped: ...' or 'no measurement: ...' on stderr, nothing printed and nothing written even with --write", e1 === 1 && /skipped: no browser/.test(sk2.err[0]) && e2 === 1 && /no measurement: the page died/.test(bd2.err[0]) && bd2.files.length === 0 && sk2.out.length === 0);
    const c1 = cap(), code1 = await T.command(["--sizes", "64,1,8"], c1.io), txt1 = c1.out.join("\n");
    ok("!! a good run: exit 0, the SOFTWARE ADAPTER header in capitals with the adapter's name and the warning that it is a CPU emulating a GPU, both networks' tables (pilot first), the prediction block, and the sizes SORTED ascending for the page (1,8,64); no file without --write", code1 === 0 && /^\*\*\* SOFTWARE ADAPTER \*\*\* google swiftshader/.test(c1.out[0]) && /a CPU emulating a GPU/.test(c1.out[1]) && txt1.indexOf("pilot network") < txt1.indexOf("seat network") && /^G1 /m.test(txt1) && seen.args.sizes.join() === "1,8,64" && c1.files.length === 0);
    const c2 = cap(); c2.io.run = stub({ software: false, adapter: { vendor: "nvidia", architecture: "ada" } }); await T.command([], c2.io);
    const c3 = cap(); c3.io.run = stub({ software: undefined, adapter: null }); await T.command([], c3.io);
    ok("!! the header tells the kinds apart: a REAL adapter is 'hardware adapter: nvidia ada' with NO software warning; an adapter that cannot be described is 'adapter of unknown kind: not described'", /^hardware adapter: nvidia ada/.test(c2.out[0]) && !/SOFTWARE|CPU emulating/.test(c2.out.join("\n")) && /^adapter of unknown kind: not described/.test(c3.out[0]) && !/CPU emulating|SOFTWARE/.test(c3.out.join("\n")));
    const w1 = cap(), cw = await T.command(["--sizes", "1,64", "--write"], w1.io), w2 = cap(); w2.io.run = stub({ software: false }); await T.command(["--write"], w2.io);
    const rec1 = w1.files.length === 1 ? JSON.parse(w1.files[0].c) : null;
    ok("!! --write appends ONE line of JSON ending in a newline: a software run to brain/gpuCrossoverSoftware.jsonl, a real run to brain/rig-results/gpuCrossover.jsonl, as an absolute path under the engine; the record parses back and carries the settings that were run; and the output says where", cw === 0 && w1.files.length === 1 && /brain[\\/]gpuCrossoverSoftware\.jsonl$/.test(w1.files[0].f) && w1.files[0].c.endsWith("\n") && w1.files[0].c.trim().split("\n").length === 1 && rec1 && rec1.software === true && rec1.settings.sizes.join() === "1,64" && w2.files.length === 1 && /brain[\\/]rig-results[\\/]gpuCrossover\.jsonl$/.test(w2.files[0].f) && /appended the record to brain\/gpuCrossoverSoftware\.jsonl/.test(w1.out.join("\n")));
    const env0 = {}, env1 = { SWEK_LAUNCH_ARGS: "--a  --b" }, hw = T.launchArgsOf(true, env1);
    ok("!! launchArgsOf: --hardware is the harness's HARDWARE_ARGS (a COPY, even when SWEK_LAUNCH_ARGS is set); without it SWEK_LAUNCH_ARGS split on spaces (--a  --b -> --a, --b), else the harness's ordinary LAUNCH_ARGS (a copy)", hw.join() === HARDWARE_ARGS.join() && hw !== HARDWARE_ARGS && T.launchArgsOf(false, env1).join() === "--a,--b" && T.launchArgsOf(false, env0).join() === LAUNCH_ARGS.join() && T.launchArgsOf(false, env0) !== LAUNCH_ARGS && HARDWARE_ARGS.includes("--enable-unsafe-webgpu"));
    const h1 = cap(); seen = null; await T.command(["--hardware", "--sizes", "1"], h1.io); const seenH = seen, h0 = cap(); seen = null; await T.command(["--sizes", "1"], h0.io); const seenN = seen;
    ok("!! --hardware hands the harness the HARDWARE_ARGS as its launch flags; without it NO launch flags are handed (the harness's own choice stands); and the record --write appends names the flags that were used", js(seenH.launchArgs) === HARDWARE_ARGS.join() && seenN.launchArgs === undefined);
    const hwRec = cap(); await T.command(["--hardware", "--write", "--sizes", "1"], hwRec.io); const plainRec = cap(); await T.command(["--write", "--sizes", "1"], plainRec.io);
    ok("!! the record names the flags that were really used: with --hardware the HARDWARE_ARGS; without it the ordinary ones (SWEK_LAUNCH_ARGS or LAUNCH_ARGS)", js(JSON.parse(hwRec.files[0].c).launchArgs) === HARDWARE_ARGS.join() && js(JSON.parse(plainRec.files[0].c).launchArgs) === T.launchArgsOf(false).join());
    ok("!! the software-adapter note tells a machine with a card how to ask for it (--hardware) -- and does not say so to a run that already did", /run again with --hardware/.test(h0.out[1]) && !/run again with --hardware/.test(h1.out[1]) && /a CPU emulating a GPU/.test(h1.out[1]));
    const d = cap(); seen = null; await T.command(["--rounds", "7", "--min-ms", "12"], d.io);
    ok("the defaults are the registered ones (every size 1 to 8192, 5 rounds, 25 ms) and --rounds and --min-ms reach the page", T.SIZES.join() === "1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192" && T.DEFAULTS.rounds === 5 && T.DEFAULTS.minMs === 25 && T.DEFAULTS.warmup === 3 && seen.args.rounds === 7 && seen.args.minMs === 12 && seen.args.sizes.length === 14);
}

console.log("\n7. THE LIVE RUN");
{
    const skip = webgpuSkipReason();
    if (skip) { report("live run SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1 to 6 hold the arithmetic on synthetic timings, and cannot show that the page runs on a device"); }
    else {
        const r = await T.measure({ sizes: [1, 64, 257], rounds: 2, minMs: 20, warmup: 2 });
        ok("!! the page runs on the harness's device: ok, an adapter described (vendor or architecture) and its software flag read (true or false), no page error", r.ok === true && r.adapter && (r.adapter.vendor || r.adapter.architecture) && (r.software === true || r.software === false) && (r.pageErrors || []).length === 0, r.ok ? JSON.stringify(r.adapter) : r.reason);
        if (r.ok) {
            report("the device: " + JSON.stringify(r.adapter) + (r.software ? " (SOFTWARE)" : ""));
            ok("!! both networks, every size asked for (1, 64, 257) in order, and for each: a finite positive time for the CPU twin and for the GPU in BOTH configurations", T.NETS.every((k) => r.nets[k] && r.nets[k].rows.map((x) => x.n).join() === "1,64,257" && r.nets[k].rows.every((x) => [x.cpu, x.capMax, x.cap64].every((v) => Number.isFinite(v) && v > 0))));
            ok("!! *** the GPU brain agrees with the CPU twin it is timed against *** at every size, both networks, both configurations, within 1e-4 (the precondition of every timing in the table) -- and the comparison is REAL: the pilot's twin is double and the device is float32, so the worst difference is above zero (a parity of exactly 0 would be a comparison that compared nothing)", T.NETS.every((k) => r.nets[k].rows.every((x) => x.parityCapMax <= T.TOL && x.parityCap64 <= T.TOL)) && r.nets.pilot.rows.some((x) => x.parityCapMax > 0) && r.nets.pilot.rows.some((x) => x.parityCap64 > 0), T.NETS.map((k) => k + " " + Math.max(...r.nets[k].rows.map((x) => Math.max(x.parityCapMax, x.parityCap64))).toExponential(1)).join(", "));
            ok("!! what was TIMED is what was asked: the one-dispatch brain makes ONE dispatch for any of the sizes and the default-cap brain ceil(N / 64) (1, 1, 5) -- counted on the brains themselves --, each round count is the 2 asked for, the warm-up made exactly the 2 asked for on each brain, every call decided ALL the N rows (counted on the brains), and every round of both sides was as long as the 20 ms asked for (calls times time per call)", T.NETS.every((k) => r.nets[k].rows.every((x) => x.measured && x.measured.capMax === 1 && x.measured.cap64 === x.cap64Dispatches && x.rounds === 2) && r.nets[k].rows.every((x) => x.measured.cpuRoundMsMin >= 19.5 && x.measured.gpuRoundMsMin >= 19.5 && x.measured.decidedCapMax === x.n && x.measured.decidedCap64 === x.n) && r.warm && r.warm[k] && r.warm[k].join() === "2,2"), JSON.stringify(r.nets.pilot.rows.map((x) => x.measured)));
            ok("!! the CPU twin is timed on ALL the rows asked: 257 rows take at least 10 x one row (a linear loop), and a call takes less than the 20 ms round it was found in -- the CPU twin at one row under 2 ms, the GPU brain at one row under 20 ms in both configurations (the time of a CALL, not of a round)", T.NETS.every((k) => r.nets[k].rows[2].cpu > 10 * r.nets[k].rows[0].cpu && r.nets[k].rows[0].cpu < 2 && r.nets[k].rows[0].capMax < 20 && r.nets[k].rows[0].cap64 < 20));
            ok("the dispatch count at the default cap follows the size (1 row 1, 64 rows 1, 257 rows 5), the crossover is one of the four kinds, and the prediction block is printable", T.NETS.every((k) => r.nets[k].rows.map((x) => x.cap64Dispatches).join() === "1,1,5" && ["never", "always", "at"].includes(r.nets[k].crossovers.capMax.kind) && ["never", "always", "at"].includes(r.nets[k].crossovers.cap64.kind)) && T.scoreText(T.score(r.nets)).split("\n").length === 5);
        }
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
