// WebGLEngine/tools/ship/headToHead9-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead9-selfcheck.mjs      (a few seconds: hand fixtures and one short real audit)
//
// THE GATE OF tools/ship/headToHead9.mjs (Round H9 of brain/HEAD_TO_HEAD.md, registered first: the lesion).
//   1 SETS      the 59 arms, the ids 9000-9199 (disjoint from every earlier round's), 160 s, the registered constants, the recurrent block [510, 823), the group ids; boardOf's refusals.
//   2 LESION    the lesion zeroes exactly the 313 recurrent weights and nothing else, copies, refuses a wrong length; the hand weights are their own lesion.
//   3 VERDICT   the registered verdict in every branch (NOT ASSESSED at 19 and 20 of 28, SURVIVES, PARTLY, LIVES IN THE CORE) at the boundaries f = 0.8 and 0.2; the statistics, counts and gains.
//   4 LINES     the seven bottom lines in their cases; lost subs counted over both conditions.
//   5 CHECKS    sizes, ids aligned, scores inside (0, 1), the event reaches the flight, the weights and lesions, the hand lesion, the lesion changes the flight, the networks distinct; a failed check says NOT WEIGHED.
//   6 REPORT    the means table, the per-network blocks, the lines last.
//   7 FLIGHT    one real short audit (ids 0-1, 30 s): the lesion seated through the tank, hand-off flies exactly as hand, a network with a non-zero core flies differently from its lesion, deterministic, the checks pass.
//   8 SOURCE    the ids appear once; no clock, random or file.
// SABOTAGE LOG (96 mutants of tools/ship/headToHead9.mjs, each alone in its own worktree copy; one pattern missed on the first pass and was re-aimed): 83 went red by name on the first pass. 13 went 0 red; 5 got a row and went red: the core-off lost-sub total read from the intact arms (the fixture's two totals were equal by luck), an infinite weight passing the weights check (a NaN fails the comparison anyway), and the report's per-network block reading the wrong pairs or the wrong condition (a block is now read for its numbers).
//   Eight are EQUIVALENT and declared: the hand weights lesioned in the board and the hand-off arm left unlesioned (the lesion of a zero core is the identity, so both fly as the hand weights); `>=` against `>` at f exactly 0.8 and `<=` against `<` at f exactly 0.2 (a float ratio cannot sit on them: the rows test 0.0801 and 0.0799, 0.0199 and 0.0201); the two verdict branches in the other order (both can hold only if the thresholds crossed); and two clauses of the WEIGHTS AND LESIONS row (the lesion is zero on its block and equal to the network elsewhere) that guard a broken lesion function, which the lesion rows already pin index by index.
// NOT CHECKED, said plainly: that zeroing the recurrent weights is the right lesion (a zeroed core is not the same as a core trained out, and the network was trained WITH it), and what the lesion does in a task other than the dropout.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead9.mjs";
import * as PS from "../../brain/pilotSubPolicy.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead9.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead9-selfcheck -- Round H9\n");
const W = (f = () => 0) => Array.from({ length: 963 }, (_, i) => f(i));
const netsOf = (f = (id, i) => 0.001 * ((i * 7) % 5)) => new Map(X.NET_IDS.map((id, k) => [id, W((i) => f(id, i) + 0.0001 * k)]));

sec("1. SETS");
{
    ok("!! 59 arms in order: autopilot, hand, hand-off, then each of the 28 networks followed by its -off; frozen", X.ARM_IDS.length === 59 && J(X.ARM_IDS.slice(0, 3)) === J(["autopilot", "hand", "hand-off"]) && X.ARM_IDS[3] === "network-Wip" && X.ARM_IDS[4] === "network-Wip-off" && X.ARM_IDS[58] === "robust-9-off" && X.ARM_IDS[57] === "robust-9" && Object.isFrozen(X.ARM_IDS) && X.offId("base-3") === "base-3-off");
    ok("!! 28 networks: the eight shipped (network-Wip .. network-RobustNoisy), base-0..9, robust-0..9, in that order; the groups are frozen", X.NET_IDS.length === 28 && J(X.SHIPPED) === J(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"]) && J(X.SHIPPED_IDS) === J(X.SHIPPED.map((n) => "network-" + n)) && X.BASE_IDS.length === 10 && X.ROBUST_IDS.length === 10 && J(X.NET_IDS) === J([...X.SHIPPED_IDS, ...X.BASE_IDS, ...X.ROBUST_IDS]) && X.BASE_IDS[9] === "base-9" && X.ROBUST_IDS[0] === "robust-0" && Object.isFrozen(X.NET_IDS) && Object.isFrozen(X.SHIPPED) && Object.isFrozen(X.SHIPPED_IDS) && Object.isFrozen(X.BASE_IDS) && Object.isFrozen(X.ROBUST_IDS));
    ok("!! ids 9000-9199 (200), 160 s: not H1's 2000, H2's 3000, H4's 4000, H5's 5000, H6's 6000, H7's 7000, H8's 8000, not the gates' 0-14", X.IDS.from === 9000 && X.IDS.to === 9199 && X.SECONDS === 160 && Object.isFrozen(X.IDS));
    ok("!! the registered constants: learn margin 0.02, learn minimum 20 of 28, survive at f >= 0.8, live in the core at f <= 0.2", X.LEARN_MARGIN === 0.02 && X.LEARN_MIN === 20 && X.F_HIGH === 0.8 && X.F_LOW === 0.2);
    ok("!! the recurrent block is [510, 823): 14 x 34 input weights + 34 biases = 510, then 313 synapses, and the output weights and biases (140) fill the rest of the 963", X.REC_FROM === 510 && X.REC_TO === 823 && X.REC_TO - X.REC_FROM === 313 && 963 - X.REC_TO === 140 && X.REC_FROM === PS.FEATURES * PS.HIDDEN + PS.HIDDEN && PS.WEIGHT_COUNT === 963);
    const b = X.boardOf(netsOf());
    ok("!! the board holds the dropout task and the 59 arms; the autopilot controls nothing and every other arm controls the autopilot alone; an arm's entry is the gfc network with its weights (a copy)", b.tasks.size === 1 && b.tasks.has("dropout") && b.arms.size === 59 && X.ARM_IDS.every((a) => b.arms.has(a)) && X.ARM_IDS.filter((a) => a !== "autopilot").every((a) => J(b.arms.get(a).controls) === '["autopilot"]') && (() => { const e = b.arms.get("robust-3").entry(); return e.pilot === "network" && e.circuit === "gfc" && e.weights.length === 963; })());
    const nets = netsOf(), src2 = nets.get("base-2"), b2 = X.boardOf(nets), e = b2.arms.get("base-2").entry(), eo = b2.arms.get("base-2-off").entry();
    ok("!! an intact arm carries the network's own weights as a copy; its -off arm carries the lesion (zero on [510, 823), equal elsewhere); `hand` carries the hand weights and `hand-off` the same (the core was zero)", J(e.weights) === J(Array.from(src2)) && e.weights !== src2 && eo.weights.every((v, i) => (i >= 510 && i < 823 ? v === 0 : v === src2[i])) && eo.weights.slice(510, 823).length === 313 && src2.slice(510, 823).some((v) => v !== 0) && J(b2.arms.get("hand").entry().weights) === J(Array.from(PS.handWeights())) && J(b2.arms.get("hand-off").entry().weights) === J(Array.from(PS.handWeights())));
    const miss = netsOf(); miss.delete("robust-6"); const short = netsOf(); short.set("base-1", W().slice(1)); const long = netsOf(); long.set("network-Wip", [...W(), 0]); const obj = Object.fromEntries(netsOf());
    ok("!! boardOf refuses a missing network, a 962-weight and a 964-weight network, null; it takes a plain object as well as a Map", /no network robust-6/.test(thr(() => X.boardOf(miss))) && /network base-1 must be an array of 963/.test(thr(() => X.boardOf(short))) && /network network-Wip must be an array of 963/.test(thr(() => X.boardOf(long))) && /no network network-Wip/.test(thr(() => X.boardOf(null))) && X.boardOf(obj).arms.size === 59);
}
sec("2. LESION");
{
    const w = W((i) => i + 1), o = X.lesion(w);
    ok("!! the lesion zeroes exactly the 313 weights at 510 to 822 and leaves the other 650 as they were (index 509 and 823 are untouched)", o.length === 963 && o.slice(510, 823).every((v) => v === 0) && o.slice(0, 510).every((v, i) => v === w[i]) && o.slice(823).every((v, i) => v === w[823 + i]) && o[509] === 510 && o[510] === 0 && o[822] === 0 && o[823] === 824);
    ok("!! the lesion is a copy (the vector handed in is not changed), works on a typed array and returns a plain array of numbers", w[600] === 601 && Array.isArray(X.lesion(Float32Array.from(w))) && X.lesion(Float32Array.from(w))[600] === 0 && X.lesion(Float32Array.from(w))[100] === 101);
    ok("!! the hand weights are their own lesion (their core is zero already): the lesion of PS.handWeights() equals it on every index", J(X.lesion(PS.handWeights())) === J(Array.from(PS.handWeights())) && Array.from(PS.handWeights()).slice(510, 823).every((v) => v === 0));
    ok("!! the lesion refuses 962 and 964 weights, null and a string, naming the count", /the weights must be an array of 963 numbers, got length 962/.test(thr(() => X.lesion(W().slice(1)))) && /got length 964/.test(thr(() => X.lesion([...W(), 0]))) && /must be an array of 963/.test(thr(() => X.lesion(null))) && /must be an array of 963/.test(thr(() => X.lesion("x"))));
}
// a synthetic audit: n ids, per arm and condition a score list; spec[arm] = { dark, lit (functions of the id index), lost: [conditions] }
const N = 40, base = (c) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const wob = (i, a) => (i % 2 ? a : -a);
const mkAu = (spec = {}, n = N, nets = netsOf()) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60, nets };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const f = (spec[a] && spec[a][c]) || (() => 0), lost = (spec[a] && spec[a].lost) || [];
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N] + f(i) + (a === "autopilot" || a === "hand" || a === "hand-off" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost.includes(c) && i < 2 }));
    }
    return au;
};
const gain = (d, l = 0) => ({ dark: (i) => d + wob(i, 0.02), lit: (i) => l + wob(i, 0.02) });
const pair = (ids, di, dof, li = 0, lo = 0) => Object.assign({}, ...ids.flatMap((a) => [{ [a]: gain(di, li) }, { [X.offId(a)]: gain(dof, lo) }]));
sec("3. VERDICT");
{
    const v = (spec) => X.verdictOf(mkAu(spec)), mix = (di, dof) => pair(X.NET_IDS, di, dof);
    ok("!! the surviving fraction is the pooled mean of the 28 core-off gains over the 28 intact: 0.1 intact and 0.05 off give f = 0.5, the means 0.1 and 0.05, and the gains are listed in network order", (() => { const s = X.statsOf(mkAu(mix(0.1, 0.05))); return near(s.Gi, 0.1, 1e-9) && near(s.Go, 0.05, 1e-9) && near(s.f, 0.5, 1e-9) && s.gi.length === 28 && s.go.length === 28; })());
    ok("!! the lesion that changes nothing (f = 1): THE GAIN SURVIVES THE LESION; one that removes the gain (f = 0): THE GAIN LIVES IN THE RECURRENT CORE; one that halves it: THE CORE CARRIES PART OF THE GAIN", v(mix(0.1, 0.1)) === "THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS" && v(mix(0.1, 0)) === "THE GAIN LIVES IN THE RECURRENT CORE" && v(mix(0.1, 0.05)) === "THE CORE CARRIES PART OF THE GAIN");
    ok("!! the SURVIVES boundary is f = 0.8: a core-off gain of 0.0801 against 0.1 survives, 0.0799 carries part; a lesion that IMPROVES the gain (f above 1) survives", v(mix(0.1, 0.0801)) === "THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS" && v(mix(0.1, 0.0799)) === "THE CORE CARRIES PART OF THE GAIN" && v(mix(0.1, 0.2)) === "THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS");
    ok("!! the LIVES-IN-THE-CORE boundary is f = 0.2: a core-off gain of 0.0199 against 0.1 lives in the core, 0.0201 carries part; a lesion that makes the gain NEGATIVE lives in the core", v(mix(0.1, 0.0199)) === "THE GAIN LIVES IN THE RECURRENT CORE" && v(mix(0.1, 0.0201)) === "THE CORE CARRIES PART OF THE GAIN" && v(mix(0.1, -0.1)) === "THE GAIN LIVES IN THE RECURRENT CORE");
    const learn = (k) => ({ ...mix(0.1, 0.1), ...pair(X.NET_IDS.slice(0, 28 - k), 0.1, 0.1), ...pair(X.NET_IDS.slice(28 - k), 0.0, 0.0) });
    ok("!! the learning boundary is 20 of 28: eight networks with no gain (20 learned) still give a verdict, nine (19 learned) give NOT ASSESSED: THE NETWORKS DID NOT GAIN whatever the lesion does", v(learn(8)) === "THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS" && v(learn(9)) === "NOT ASSESSED: THE NETWORKS DID NOT GAIN" && v(learn(28)) === "NOT ASSESSED: THE NETWORKS DID NOT GAIN");
    ok("!! learnedCount counts INTACT dark gains over 0.02: 0.0199 does not count and 0.0201 does; a gain only in the lit tank does not; a gain only in the core-off arms does not", X.learnedCount(mkAu(pair(X.NET_IDS, 0.0199, 0))) === 0 && X.learnedCount(mkAu(pair(X.NET_IDS, 0.0201, 0))) === 28 && X.learnedCount(mkAu(pair(X.NET_IDS, 0, 0, 0.3, 0.3))) === 0 && X.learnedCount(mkAu(pair(X.NET_IDS, 0, 0.3))) === 0);
    { const au = mkAu({ ...pair(X.NET_IDS.slice(0, 3), 0.3, 0.1), "network-Wip": gain(0.3, 0.1) });
      const d = X.pairOf(au, "network-Wip", "autopilot", "dark"), l = X.pairOf(au, "network-Wip", "autopilot", "lit"), back = X.pairOf(au, "autopilot", "network-Wip", "dark");
      ok("!! pairOf is a minus b in the condition asked for: +0.3 dark and +0.1 lit over the autopilot read about +0.3 BETTER dark and +0.1 BETTER lit, the autopilot against it -0.3 WORSE; gainOf is the mean of that pair", d.reading === "BETTER" && near(d.mean, 0.3, 2e-3) && l.reading === "BETTER" && near(l.mean, 0.1, 2e-3) && back.reading === "WORSE" && near(back.mean, -0.3, 2e-3) && X.gainOf(au, "network-Wip", "dark") === d.mean && X.gainOf(au, "network-Wip", "lit") === l.mean, `${d.mean.toFixed(4)} ${l.mean.toFixed(4)}`);
      const m = (a, c) => au[c][a].reduce((x, r) => x + r.score, 0) / au[c][a].length;
      ok("!! meanOf is an arm's mean score in the condition asked for (dark and lit differ for network-Wip and each equals the hand-computed mean)", near(X.meanOf(au, "network-Wip", "dark"), m("network-Wip", "dark"), 1e-12) && near(X.meanOf(au, "network-Wip", "lit"), m("network-Wip", "lit"), 1e-12) && Math.abs(X.meanOf(au, "network-Wip", "dark") - X.meanOf(au, "network-Wip", "lit")) > 0.1);
      const g = X.gainsOf(au, ["network-Wip", "network-Actuators"]), gl = X.gainsOf(au, ["network-Wip"], "lit");
      ok("!! gainsOf lists the intact and the core-off gains of the ids asked for, in order, in the condition asked for (dark by default): network-Wip 0.3 / 0.1, network-Actuators 0.3 / 0.1, and the lit ones for the lit condition", g.intact.length === 2 && near(g.intact[0], 0.3, 2e-3) && near(g.off[0], 0.1, 2e-3) && near(g.intact[1], 0.3, 2e-3) && near(g.off[1], 0.1, 2e-3) && near(gl.intact[0], 0.1, 2e-3) && near(gl.off[0], 0, 2e-3)); }
    ok("!! lesionCounts reads core off minus intact per network in the condition: 5 networks whose lesion is +0.2 (BETTER), 3 at -0.2 (WORSE) and 20 unchanged (TIES) give 5, 20, 3; in the lit condition the lit lesion is read", (() => { const spec = { ...pair(X.NET_IDS.slice(0, 5), 0.1, 0.3), ...pair(X.NET_IDS.slice(5, 8), 0.1, -0.1), ...pair(X.NET_IDS.slice(8), 0.1, 0.1) }, au = mkAu(spec), c = X.lesionCounts(au); const spec2 = pair(X.NET_IDS, 0.1, 0.1, 0, 0.3), cl = X.lesionCounts(mkAu(spec2), "lit"), cd = X.lesionCounts(mkAu(spec2)); return c.better === 5 && c.ties === 20 && c.worse === 3 && cl.better === 28 && cd.ties === 28; })());
}
sec("4. LINES");
{
    const L = (spec) => X.bottomLines(mkAu(spec)), a = L(pair(X.NET_IDS, 0.1, 0.1));
    ok("!! no effect of the lesion: line 1 LEARNED 28, line 2 gives intact and core-off mean, sd and range and f 1.00, line 3 28 tied, line 4 the three groups, line 5 the lit tank, line 6 SURVIVES, line 7 zero lost", a.length === 7 && a[0] === "LEARNED: 28 OF 28 INTACT NETWORKS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0.02" && /^DARK GAIN OVER THE AUTOPILOT: INTACT \+0\.1000 \(sd 0\.0000, range \+0\.1000 to \+0\.1000\); CORE OFF \+0\.1000 \(sd 0\.0000, range \+0\.1000 to \+0\.1000\); SURVIVING FRACTION 1\.00$/.test(a[1]) && a[2] === "THE LESION CHANGES 0 NETWORKS FOR THE BETTER, 28 TIED, 0 FOR THE WORSE (dark, core off minus intact, of 28)" && a[3] === "BY GROUP (intact / core off, dark gain): SHIPPED +0.1000 / +0.1000; BASE +0.1000 / +0.1000; ROBUST +0.1000 / +0.1000" && /^LIT TANK: INTACT \+0\.0000, CORE OFF \+0\.0000, SURVIVING FRACTION /.test(a[4]) && a[5] === "VERDICT: THE GAIN SURVIVES THE LESION: THE RECURRENT CORE IS NOT WHERE IT IS" && a[6] === "LOST SUBS: autopilot 0, intact 0 (0 in the worst), core off 0 (0 in the worst)", J(a));
    const b = L({ ...pair(X.SHIPPED_IDS, 0.2, 0.18), ...pair(X.BASE_IDS, 0.1, 0.05), ...pair(X.ROBUST_IDS, 0.05, 0.0) });
    ok("!! the groups are read separately: shipped 0.2 / 0.18, base 0.1 / 0.05, robust 0.05 / 0.00; the pooled mean of intact is (8 x 0.2 + 10 x 0.1 + 10 x 0.05)/28 = 0.1; the lesion changes the 18 base and robust networks for the worse and ties the eight shipped ones' (2 se is 0.0)", /SHIPPED \+0\.2000 \/ \+0\.1800; BASE \+0\.1000 \/ \+0\.0500; ROBUST \+0\.0500 \/ \+0\.0000$/.test(b[3]) && /INTACT \+0\.1\d\d\d \(sd/.test(b[1]) && /^THE LESION CHANGES 0 NETWORKS FOR THE BETTER, \d+ TIED, \d+ FOR THE WORSE/.test(b[2]), b[1] + " | " + b[2]);
    const c = L({ ...pair(X.NET_IDS.slice(0, 20), 0.1, 0.0), ...pair(X.NET_IDS.slice(20), 0.1, 0.3) })[2];
    ok("!! line 3 counts per network in the dark: 20 networks whose lesion is -0.1 read WORSE, 8 whose lesion is +0.2 read BETTER", c === "THE LESION CHANGES 8 NETWORKS FOR THE BETTER, 0 TIED, 20 FOR THE WORSE (dark, core off minus intact, of 28)", c);
    const d = L({ ...pair(X.NET_IDS.slice(0, 1), 0.1, 0.1), ...pair(X.NET_IDS.slice(1), 0.3, 0.1) })[1];
    ok("!! line 2's statistics are over the TWENTY-EIGHT gains of each kind, the mean first then the sample sd and the range: one network at 0.1 and 27 at 0.3 have mean 0.2929, range +0.1000 to +0.3000; the core-off gains are all 0.1", /INTACT \+0\.2929 \(sd 0\.0378, range \+0\.1000 to \+0\.3000\); CORE OFF \+0\.1000 \(sd 0\.0000, range \+0\.1000 to \+0\.1000\); SURVIVING FRACTION 0\.34$/.test(d), d);
    const e = L(pair(X.NET_IDS, 0.1, 0.1, 0.2, 0.05))[4];
    ok("!! the lit line reads the LIT tank: intact lit +0.2000, core off +0.0500, fraction 0.25 (not the dark ones)", e === "LIT TANK: INTACT +0.2000, CORE OFF +0.0500, SURVIVING FRACTION 0.25", e);
    const l = L({ autopilot: { lost: ["dark", "lit"] }, "network-Wip": { lost: ["dark"] }, "base-3": { lost: ["dark", "lit"] }, "base-3-off": { lost: ["lit"] }, "robust-2-off": { lost: ["dark", "lit"] }, "network-Actuators-off": { lost: ["dark"] }, hand: { lost: ["dark"] } })[6];
    ok("!! lost subs over both conditions: autopilot 4, the intact networks 6 (2 and 4) with 4 in the worst, core off 8 (2, 4 and 2) with 4 in the worst; the hand arms are not in either total", l === "LOST SUBS: autopilot 4, intact 6 (4 in the worst), core off 8 (4 in the worst)", l);
    ok("!! the lit tank does not enter lines 1, 2 or the verdict: networks that gain only lit learned nothing and the verdict is NOT ASSESSED", (() => { const x = L(pair(X.NET_IDS, 0, 0, 0.3, 0.3)); return x[0].startsWith("LEARNED: 0 OF 28") && x[5] === "VERDICT: NOT ASSESSED: THE NETWORKS DID NOT GAIN"; })());
}
sec("5. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), changed = pair(X.NET_IDS, 0.1, 0.05), good = () => mkAu(changed);
    ok("!! eight check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "EVENT REACHES THE FLIGHT", "WEIGHTS AND LESIONS", "HAND LESION IS THE HAND WEIGHTS", "LESION CHANGES THE FLIGHT", "NETWORKS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit["base-4-off"].pop(); const a2 = good(); a2.dark["robust-3"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.lit.autopilot = a4.dark.autopilot.map((r) => ({ ...r }));
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 SCORES INSIDE, an autopilot with equal dark and lit scores EVENT REACHES THE FLIGHT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("EVENT REACHES THE FLIGHT"));
    const b1 = good(); b1.nets.set("base-1", W().slice(1)); const b2 = good(); b2.nets.get("base-2")[10] = NaN; const b3 = good(); b3.nets.delete("robust-4"); const b4 = good(); b4.nets = null; const b5 = good(); b5.nets.get("base-5").push(0); const b6 = good(); b6.nets.get("base-6")[20] = Infinity;
    ok("!! a 962-weight network, a NaN weight, a missing network, no weights at all a 964-weight network and an infinite weight break WEIGHTS AND LESIONS", [b1, b2, b3, b4, b5, b6].every((a) => names(a).includes("WEIGHTS AND LESIONS")));
    const c1 = good(); c1.dark["hand-off"][5].score += 1e-6; const c2 = good(); c2.lit["hand-off"][7].score += 1e-6; const c3 = good(); c3.dark["hand-off"][5].score += 1e-10; const c4 = good(); delete c4.dark["hand-off"];
    ok("!! a hand-off differing from hand by 1e-6 in the dark or in the lit tank, or missing, breaks HAND LESION IS THE HAND WEIGHTS; 1e-10 is inside the tolerance", names(c1).includes("HAND LESION IS THE HAND WEIGHTS") && names(c2).includes("HAND LESION IS THE HAND WEIGHTS") && names(c4).includes("HAND LESION IS THE HAND WEIGHTS") && !names(c3).includes("HAND LESION IS THE HAND WEIGHTS"));
    const d1 = mkAu(pair(X.NET_IDS, 0.1, 0.1)); for (const id of X.NET_IDS) d1.dark[X.offId(id)] = d1.dark[id].map((r) => ({ ...r }));
    const d2 = good(); for (const id of X.NET_IDS.slice(0, 8)) d2.dark[X.offId(id)] = d2.dark[id].map((r) => ({ ...r })); const d3 = good(); for (const id of X.NET_IDS.slice(0, 9)) d3.dark[X.offId(id)] = d3.dark[id].map((r) => ({ ...r }));
    ok("!! a lesion that changes the flight of no network breaks LESION CHANGES THE FLIGHT; of 20 networks (8 identical) it holds, of 19 (9 identical) it breaks; the row counts the dark flights", names(d1).includes("LESION CHANGES THE FLIGHT") && !names(d2).includes("LESION CHANGES THE FLIGHT") && names(d3).includes("LESION CHANGES THE FLIGHT"));
    const e1 = good(); e1.dark["base-5"] = e1.dark["base-4"].map((r) => ({ ...r })); const e2 = good(); e2.dark["network-Wip-off"] = e2.dark["network-Wip"].map((r) => ({ ...r }));
    ok("!! two identical intact networks break NETWORKS DISTINCT; an intact network identical to its own lesion does not (the row is the 28 intact ones)", names(e1).includes("NETWORKS DISTINCT") && !names(e2).includes("NETWORKS DISTINCT"));
    const f1 = good(); f1.dark["robust-9-off"][5].score = 0; const f2 = good(); f2.range = { from: 1, to: 41 }; const f3 = good(); f3.dark.hand.push({ key: "sb-41", score: 0.5, bad: false });
    ok("!! a score of exactly 0 breaks SCORES INSIDE; a 41-id range with 40 runs and an arm one run too long both break SIZES", names(f1).includes("SCORES INSIDE (0, 1)") && names(f2).includes("SIZES") && names(f3).includes("SIZES"));
}
sec("6. REPORT");
{
    const au = mkAu(pair(X.NET_IDS, 0.1, 0.05, 0.12, 0.06)), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the eight checks pass first", /^ROUND H9: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 9).every((l) => /^  PASS /.test(l)));
    const m = (a, c) => au[c][a].reduce((s, r) => s + r.score, 0) / au[c][a].length, row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(24) + " "));
    ok("!! the means table prints each of the 59 arms' dark and lit mean to four places", X.ARM_IDS.every((a) => !!row(a) && row(a).startsWith(`  ${a.padEnd(24)} ${m(a, "dark").toFixed(4)} / ${m(a, "lit").toFixed(4)}`)), row("network-Wip-off"));
    ok("!! a block for each of the 28 networks: its dark gain, its core-off gain, and the lesion's reading in the dark and in the lit tank", X.NET_IDS.every((id) => new RegExp("^" + id + ":\\n   dark gain .*\\| core off .*\\n   lesion  dark .*\\n   lesion  lit  ", "m").test(t)));
    { const au2 = mkAu(pair(X.NET_IDS, 0.1, 0.05, 0.12, 0.2)), blk = X.report(au2), i0 = blk.findIndex((l) => l === "network-Wip:");
      ok("!! a network's block reads the right pairs: the dark gain +0.1000 intact and +0.0500 core off on one line, the lesion's dark effect -0.0500 WORSE and its lit effect +0.0800 BETTER (the dark and lit lesions differ, and the lesion is core off minus intact)", /dark gain \+0\.1000 .*BETTER +\| core off \+0\.0500 .*BETTER$/.test(blk[i0 + 1]) && /lesion  dark -0\.0500 .*WORSE$/.test(blk[i0 + 2]) && /lesion  lit  \+0\.0800 .*BETTER$/.test(blk[i0 + 3]), blk.slice(i0, i0 + 4).join(" | ")); }
    ok("!! the seven bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-7).every((l) => l.startsWith("BOTTOM LINE: ")) && /^BOTTOM LINE: LEARNED/.test(L[L.length - 7]) && /VERDICT: /.test(L[L.length - 2]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/means \(dark/.test(Lb.join("\n")));
}
sec("7. FLIGHT");
{
    const wip = JSON.parse(fs.readFileSync(new URL("../../brain/pilotSubWeightsWip.json", import.meta.url), "utf8")).weights;
    const nets = new Map(X.NET_IDS.map((id, k) => [id, wip.map((v, i) => v * (1 + 0.004 * (k + 1)) + (i >= 510 && i < 823 ? 0.002 * ((i * 13 + k) % 7 - 3) : 0))]));
    const opt = { range: { from: 0, to: 1 }, seconds: 30 }, a = X.audit(nets, opt), a2 = X.audit(nets, opt);
    ok("!! an audit flies the 59 arms dark and lit on the ids and is deterministic (twice the same scores), and carries the weights handed in", Object.keys(a.dark).length === 59 && Object.keys(a.lit).length === 59 && J(a.dark) === J(a2.dark) && J(a.lit) === J(a2.lit) && a.dark.autopilot.length === 2 && a.nets === nets && a.range === opt.range);
    ok("!! on a REAL tank hand-off flies exactly as hand does in both conditions (the lesion of a zero core is the identity)", ["dark", "lit"].every((c) => a[c].hand.every((r, i) => near(r.score, a[c]["hand-off"][i].score, 1e-12))));
    ok("!! the lesion is SEATED through the tank: a network with a non-zero core flies differently from its lesion (for at least 20 of the 28), and every intact network flies differently from the autopilot", X.NET_IDS.filter((id) => a.dark[id].some((r, i) => r.score !== a.dark[X.offId(id)][i].score)).length >= 20 && X.NET_IDS.every((id) => a.dark[id].some((r, i) => r.score !== a.dark.autopilot[i].score)));
    ok("!! the eight checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
    ok("!! audit REFUSES a missing network rather than flying the autopilot in its place", /no network base-7/.test(thr(() => { const t = new Map(nets); t.delete("base-7"); X.audit(t, opt); })));
    { const one = { range: { from: 0, to: 0 } }, s20 = X.audit(nets, { ...one, seconds: 20 }), s30 = X.audit(nets, { ...one, seconds: 30 });
      ok("!! the seconds reach BOTH conditions' flights: 20 s and 30 s give different dark scores and different lit scores for the autopilot", s20.dark.autopilot[0].score !== s30.dark.autopilot[0].score && s20.lit.autopilot[0].score !== s30.lit.autopilot[0].score && s20.seconds === 20); }
}
sec("8. SOURCE");
{
    ok("!! the ids 9000 and 9199 appear once each; no clock, no random number, nothing read from the disk", code.split("9000").length === 2 && code.split("9199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
