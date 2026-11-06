// WebGLEngine/tools/ship/headToHead6-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead6-selfcheck.mjs      (a few seconds: hand fixtures, tiny searches and one short real audit)
//
// THE GATE OF tools/ship/headToHead6.mjs (Round H6 of brain/HEAD_TO_HEAD.md, registered first: is the learned gain a tuning gap?).
//   1 SETS      the 34 arms, the ids 6000-6199 (disjoint from every earlier round's), 160 s, the recipe IS H5's and the submarine trainer's, the registered constants; the tank kind and the board arm of a tuned champion; boardOf's refusals.
//   2 SEARCH    gainsOf and its refusals, the gains bounds, mutate (1..4 gains moved, inside the bounds), a tiny search (deterministic, its seed 6700 + 10 r + k, the record), the champion of four searches (best held-out, ties to the smaller k) and its refusals.
//   3 VERDICT   the registered verdict in every branch (NOT ASSESSED, A TUNING GAP, PARTLY, NOT A TUNING GAP) at the boundaries (4 of 5 found; the median of the 28 networks' gains is the mean of the 14th and 15th smallest; the first quartile is the 7th smallest).
//   4 LINES     the seven bottom lines in their cases; lost subs counted over both conditions.
//   5 CHECKS    sizes, ids aligned, scores inside (0, 1), the event reaches the flight, the champions, the arms distinct; a failed check says NOT WEIGHED.
//   6 REPORT    the means table, the champions' gains and held-out scores, the gain blocks, the tuned-against-network counts, the lines last.
//   7 FLIGHT    one real short audit (ids 0-1, 30 s): the tuned autopilots seated through their tank kind, the real network weights, the H5 controls seated; deterministic, the checks pass.
//   8 SOURCE    the ids appear once; no clock, random or file.
// NOT CHECKED, said plainly: whether four searches of 400 iterations find the best gains the autopilot has (that is the experiment's own limit), and whether the hand-made gain bounds hide a better tuning outside them.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead6.mjs";
import * as H5 from "./headToHead5.mjs";
import * as TS from "./trainSubPilot.mjs";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead6.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead6-selfcheck -- Round H6\n");
const NAMES = ["kDepth", "vzMax", "maxPitch", "kTheta", "kQ", "kBalD", "kBalV", "kHdg", "kR", "kBeta", "kSpd"];

sec("1. SETS");
{
    ok("!! 34 arms in order: autopilot, tuned-0..4, the eight networks, the twenty H5 controls; frozen; 28 network arms (the eight and the twenty)", X.ARM_IDS.length === 34 && X.ARM_IDS[0] === "autopilot" && J(X.TUNED_IDS) === J(["tuned-0", "tuned-1", "tuned-2", "tuned-3", "tuned-4"]) && J(X.ARM_IDS.slice(1, 6)) === J(X.TUNED_IDS) && X.NET_IDS.length === 8 && X.NET_IDS[0] === "network-Wip" && X.NET_IDS[7] === "network-RobustNoisy" && X.CONTROL_IDS.length === 20 && X.CONTROL_IDS[0] === "er-0" && X.CONTROL_IDS[19] === "dense-9" && X.NETWORK_ARMS.length === 28 && J(X.NETWORK_ARMS) === J([...X.NET_IDS, ...X.CONTROL_IDS]) && J(X.ARM_IDS.slice(6)) === J(X.NETWORK_ARMS) && Object.isFrozen(X.ARM_IDS) && Object.isFrozen(X.TUNED_IDS) && Object.isFrozen(X.NET_IDS) && Object.isFrozen(X.CONTROL_IDS) && Object.isFrozen(X.NETWORK_ARMS));
    ok("!! ids 6000-6199 (200), 160 s: not H1's 2000, H2's 3000, H4's 4000, H5's 5000, not the gates' 0-14", X.IDS.from === 6000 && X.IDS.to === 6199 && X.SECONDS === 160 && Object.isFrozen(X.IDS));
    ok("!! the recipe IS the submarine trainer's: 4 searches, 400 iterations, sigma 0.3, at most 4 gains moved a step; 5 replicates; gain bound 8; tuned factor 1.5; learn margin 0.02; learn minimum 4 of 5", J(X.RECIPE) === J(TS.RECIPE) && J(X.RECIPE) === J(H5.RECIPE) && X.RECIPE.runs === 4 && X.RECIPE.iters === 400 && X.RECIPE.sigma === 0.3 && X.RECIPE.maxK === 4 && X.REPLICATES === 5 && X.GAIN_BOUND === 8 && X.TUNED_FACTOR === 1.5 && X.LEARN_MARGIN === 0.02 && X.LEARN_MIN === 4);
    ok("!! the eleven gains are named in the autopilot's order and the defaults are the autopilot's own (kDepth .2, vzMax 1, maxPitch .3, kTheta 15, kQ 12, kBalD .03, kBalV .3, kHdg 3, kR 10, kBeta 2, kSpd .5)", J(X.GAIN_NAMES) === J(NAMES) && J(X.DEFAULT_GAINS) === J([0.2, 1, 0.3, 15, 12, 0.03, 0.3, 3, 10, 2, 0.5]) && J(X.DEFAULT_GAINS) === J(NAMES.map((n) => AS.AUTOPILOT_SUB[n])) && Object.isFrozen(X.GAIN_NAMES) && Object.isFrozen(X.DEFAULT_GAINS));
    const w = [0.2, 1, 0.3, 15, 12, 0.03, 0.3, 3, 10, 2, 0.5], arm = X.armOf(3, w), seen = [];
    arm.register({ registerPilotKind: (c, k) => seen.push([c, k.weightCount]) });
    ok("!! a tuned champion's board arm: id tuned-3, flying layer, controls the autopilot only, an entry that names the h6-tuned circuit and the gains (a copy), a register that puts the kind (eleven weights) on a tank", arm.id === "tuned-3" && arm.layer === "flying" && J(arm.controls) === '["autopilot"]' && arm.entry().circuit === "h6-tuned" && J(arm.entry().weights) === J(w) && arm.entry().weights !== w && J(seen) === J([["h6-tuned", 11]]));
    ok("!! the tank kind: circuit h6-tuned, eleven weights, not persisted, builds the autopilot with those gains (the default gains fly a dive exactly as the autopilot does; kHdg 3x changes it)", X.KIND.circuit === "h6-tuned" && X.KIND.weightCount === 11 && X.KIND.persist === false && typeof X.KIND.build(w) === "function" && (() => { const d = T.TRAIN_SET.slice(0, 2), base = T.evaluate(AS.pilot(), d).score, same = T.evaluate(X.KIND.build(w), d).score, w2 = [...w]; w2[7] = 9; return near(base, same, 1e-12) && T.evaluate(X.KIND.build(w2), d).score !== base; })());
    ok("!! armOf refuses gains that are not eleven positive finite numbers (ten, zero, NaN, a string) naming the fault", /11 gains are needed, got 10/.test(thr(() => X.armOf(0, w.slice(1)))) && /gain kBalD must be a finite number above 0/.test(thr(() => X.armOf(0, w.map((v, i) => (i === 5 ? 0 : v))))) && /gain kSpd must be a finite number above 0/.test(thr(() => X.armOf(0, w.map((v, i) => (i === 10 ? NaN : v))))) && /gain kQ must be a finite number above 0.*"x"/.test(thr(() => X.armOf(0, w.map((v, i) => (i === 4 ? "x" : v))))) && /an array of 11 numbers/.test(thr(() => X.armOf(0, null))));
    const net = Object.fromEntries(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"].map((n) => [n, Array.from({ length: 963 }, () => 0)]));
    const tuned = new Map(Array.from({ length: 5 }, (_, r) => [r, { gains: w }])), controls = new Map(H5.SPECS.map((s) => [s, { weights: Array.from({ length: H5.WEIGHTS_OF[H5.familyOf(s)] }, () => 0) }]));
    const b = X.boardOf(tuned, net, controls);
    ok("!! the board holds the dropout task and the 34 arms; every arm but the autopilot controls the autopilot alone (the networks and the H5 controls too)", b.tasks.size === 1 && b.tasks.has("dropout") && b.arms.size === 34 && X.ARM_IDS.every((a) => b.arms.has(a)) && X.ARM_IDS.filter((a) => a !== "autopilot").every((a) => J(b.arms.get(a).controls) === '["autopilot"]'));
    const t2 = new Map(tuned); t2.delete(2); const n2 = { ...net, Robust: net.Robust.slice(1) }; const c2 = new Map(controls); c2.delete("dense:5");
    ok("!! boardOf refuses a missing tuned champion, a wrong-length network and a missing control, naming each", /no tuned champion for replicate 2/.test(thr(() => X.boardOf(t2, net, controls))) && /no tuned champion for replicate 0/.test(thr(() => X.boardOf(null, net, controls))) && /networks\.Robust must be an array of 963/.test(thr(() => X.boardOf(tuned, n2, controls))) && /networks\.Wip must be an array of 963/.test(thr(() => X.boardOf(tuned, null, controls))) && /no H5 control dense:5/.test(thr(() => X.boardOf(tuned, net, c2))) && /no H5 control er:0/.test(thr(() => X.boardOf(tuned, net, null))));
}
sec("2. SEARCH");
{
    ok("!! gainsOf names the eleven gains from a vector (an array or a typed array) and refuses wrong lengths and non-positive numbers", J(X.gainsOf(X.DEFAULT_GAINS)) === J(Object.fromEntries(NAMES.map((n, i) => [n, X.DEFAULT_GAINS[i]]))) && X.gainsOf(new Float64Array(X.DEFAULT_GAINS)).kTheta === 15 && /11 gains are needed, got 12/.test(thr(() => X.gainsOf([...X.DEFAULT_GAINS, 1]))) && /gain kDepth must be a finite number above 0, got -1/.test(thr(() => X.gainsOf(X.DEFAULT_GAINS.map((v, i) => (i === 0 ? -1 : v))))));
    ok("!! pilotOf is the autopilot with those gains (a function; the default gains evaluate as the plain autopilot) and evaluateGains is its evaluation over the dives handed in", typeof X.pilotOf(X.DEFAULT_GAINS) === "function" && (() => { const d = T.TRAIN_SET.slice(0, 2); return near(X.evaluateGains(X.DEFAULT_GAINS, d).score, T.evaluate(AS.pilot(), d).score, 1e-12) && near(X.evaluateGains(X.DEFAULT_GAINS.map((v, i) => (i === 3 ? v * 2 : v)), d).score, T.evaluate(AS.pilot({ kTheta: 30 }), d).score, 1e-12); })());
    let s = 12345; const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
    let moved = [], inside = true; const seen = new Set();
    for (let i = 0; i < 400; i++) { const o = X.mutate(X.DEFAULT_GAINS, 0.3, rng, 4); moved.push(o.filter((v, j) => v !== X.DEFAULT_GAINS[j]).length); o.forEach((v, j) => { if (v < X.DEFAULT_GAINS[j] / 8 - 1e-12 || v > X.DEFAULT_GAINS[j] * 8 + 1e-12) inside = false; }); }
    for (const m of moved) seen.add(m);
    ok("!! mutate moves between 1 and 4 gains and never 5 (all four counts occur in 400 draws), and does not touch the parent", Math.min(...moved) >= 1 && Math.max(...moved) <= 4 && seen.has(1) && seen.has(4) && J(X.DEFAULT_GAINS) === J([0.2, 1, 0.3, 15, 12, 0.03, 0.3, 3, 10, 2, 0.5]));
    ok("!! mutate keeps every gain inside [default/8, default x 8]: a huge sigma pushes gains to exactly the bounds, never past", (() => { let hi = false, lo = false; for (let i = 0; i < 300; i++) { const o = X.mutate(X.DEFAULT_GAINS, 20, rng, 4); o.forEach((v, j) => { if (v > X.DEFAULT_GAINS[j] * 8 + 1e-12 || v < X.DEFAULT_GAINS[j] / 8 - 1e-12) inside = false; if (v === X.DEFAULT_GAINS[j] * 8) hi = true; if (v === X.DEFAULT_GAINS[j] / 8) lo = true; }); } return inside && hi && lo; })());
    ok("!! mutate honours maxK: with maxK 1 exactly one gain is multiplied (the others identical)", (() => { for (let i = 0; i < 60; i++) { const o = X.mutate(X.DEFAULT_GAINS, 0.3, rng, 1); if (o.filter((v, j) => v !== X.DEFAULT_GAINS[j]).length > 1) return false; } return true; })());
    ok("!! the search seed is 6700 + 10 r + k (r0 k0 6700, r4 k3 6743, r2 k1 6721)", X.searchSeed(0, 0) === 6700 && X.searchSeed(4, 3) === 6743 && X.searchSeed(2, 1) === 6721);
    const tiny = { iters: 3, trainSet: T.TRAIN_SET.slice(0, 2), heldSet: T.HELD_OUT_SET.slice(0, 2) };
    const a = X.searchOne(1, 2, tiny), a2 = X.searchOne(1, 2, tiny), b = X.searchOne(1, 3, tiny);
    ok("!! a tiny search is deterministic (twice the same record), carries replicate, k and seed (6712), eleven finite gains inside the bounds, a train and a held-out score; another k has its own seed and gains", J(a) === J(a2) && a.rep === 1 && a.k === 2 && a.seed === 6712 && a.gains.length === 11 && a.gains.every((g, i) => Number.isFinite(g) && g >= X.DEFAULT_GAINS[i] / 8 && g <= X.DEFAULT_GAINS[i] * 8) && Number.isFinite(a.trainScore) && Number.isFinite(a.heldScore) && b.seed === 6713 && J(b.gains) !== J(a.gains));
    ok("!! the search starts from the default gains, never loses ground (its train score is at least the autopilot's on the dives handed in) and the held-out score is the held-out evaluation of the gains it kept", a.trainScore >= T.evaluate(AS.pilot(), tiny.trainSet).score - 1e-9 && near(a.heldScore, X.evaluateGains(a.gains, tiny.heldSet).score, 1e-12) && a.improved + a.neutral <= 3 && Number.isInteger(a.improved) && Number.isInteger(a.neutral));
    ok("!! a search with no iterations returns the defaults exactly (the start), and a longer one improves on them on the training dives (30 iterations on two dives)", J(X.searchOne(0, 0, { ...tiny, iters: 0 }).gains) === J(X.DEFAULT_GAINS) && X.searchOne(0, 0, { ...tiny, iters: 30 }).trainScore > T.evaluate(AS.pilot(), tiny.trainSet).score + 1e-6);
    ok("!! searchOne refuses a replicate outside 0..4, a k outside 0..3 and non-integers, naming the range", /replicate must be 0\.\.4/.test(thr(() => X.searchOne(5, 0, tiny))) && /replicate must be 0\.\.4/.test(thr(() => X.searchOne(-1, 0, tiny))) && /replicate must be 0\.\.4/.test(thr(() => X.searchOne(0.5, 0, tiny))) && /search k must be 0\.\.3/.test(thr(() => X.searchOne(0, 4, tiny))) && /search k must be 0\.\.3/.test(thr(() => X.searchOne(0, -1, tiny))) && /search k must be 0\.\.3/.test(thr(() => X.searchOne(0, 1.5, tiny))));
    const run = (k, held, rep = 3) => ({ rep, k, seed: 6700 + 10 * rep + k, gains: [k], heldScore: held, trainScore: -k });
    const c = X.championOf(3, [run(0, -0.5), run(1, -0.3), run(2, -0.4), run(3, -0.6)]);
    ok("!! the champion is the search with the best held-out score (k 1 at -0.3), carrying its gains, seed and k, and all four searches' scores in k order", c.k === 1 && c.heldScore === -0.3 && J(c.gains) === "[1]" && c.seed === 6731 && J(c.searches.map((x) => x.k)) === "[0,1,2,3]" && c.searches[2].heldScore === -0.4 && c.rep === 3);
    ok("!! a tie in the held-out score goes to the smaller k (k 1, not k 3), whatever order the searches arrive in", X.championOf(3, [run(3, -0.3), run(1, -0.3), run(2, -0.4), run(0, -0.6)]).k === 1);
    ok("!! championOf refuses three searches, five, a search of another replicate and a repeated k, naming the fault", /needs exactly 4 searches, got 3/.test(thr(() => X.championOf(3, [run(0, 0), run(1, 0), run(2, 0)]))) && /needs exactly 4 searches, got 5/.test(thr(() => X.championOf(3, [0, 1, 2, 3, 3].map((k) => run(k, 0))))) && /must be of that replicate and have distinct k/.test(thr(() => X.championOf(3, [run(0, 0), run(1, 0), run(2, 0), run(3, 0, 2)]))) && /must be of that replicate and have distinct k/.test(thr(() => X.championOf(3, [run(0, 0), run(1, 0), run(2, 0), run(2, 0)]))) && /needs exactly 4 searches, got null/.test(thr(() => X.championOf(3, null))));
}
// a synthetic audit: n ids, per arm and condition a score list; spec[arm] = { dark, lit (functions of the id index), lost: [conditions] }
const N = 40, base = (c) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const wob = (i, a) => (i % 2 ? a : -a);
const champsOf = (factor = (r, i) => 1.1 + 0.05 * r) => new Map(Array.from({ length: 5 }, (_, r) => [r, { gains: X.DEFAULT_GAINS.map((g, i) => g * factor(r, i)), heldScore: -0.3 - 0.01 * r, searches: [0, 1, 2, 3].map((k) => ({ k, seed: 6700 + 10 * r + k, trainScore: -0.4, heldScore: -0.3 - 0.01 * r - 0.001 * k })) }]));
const mkAu = (spec = {}, n = N, factor) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60, tuned: champsOf(factor) };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const f = (spec[a] && spec[a][c]) || (() => 0), lost = (spec[a] && spec[a].lost) || [];
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N] + f(i) + (a === "autopilot" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost.includes(c) && i < 2 }));
    }
    return au;
};
const gain = (d, l = 0) => ({ dark: (i) => d + wob(i, 0.02), lit: (i) => l + wob(i, 0.02) });
const all = (ids, d, l) => Object.fromEntries(ids.map((a) => [a, gain(d, l)]));
// the 28 networks at distinct gains 0.05, 0.06, ... 0.32 in a scrambled order: median (0.185), first quartile (0.11), third (0.26)
const netGains = () => Object.fromEntries(X.NETWORK_ARMS.map((a, j) => [a, gain(0.05 + 0.01 * ((j * 5) % 28))]));
const tun = (d, l = 0) => all(X.TUNED_IDS, d, l);
sec("3. VERDICT");
{
    const v = (spec) => X.verdictOf(mkAu({ ...netGains(), ...spec }));
    ok("!! the networks' statistics are the registered ones: median 0.185 (the mean of the 14th and 15th smallest of 0.05..0.32), quartiles 0.11 (7th smallest) and 0.26 (7th largest), range 0.05 to 0.32, n 28", (() => { const s = X.networkStats(mkAu({ ...netGains(), ...tun(0.3) })); return near(s.median, 0.185, 1e-9) && near(s.q1, 0.11, 1e-9) && near(s.q3, 0.26, 1e-9) && near(s.lo, 0.05, 1e-9) && near(s.hi, 0.32, 1e-9) && s.n === 28; })());
    ok("!! networkStats reads the condition asked for: networks gaining only in the lit tank have a dark median of 0 and a lit median that is not", (() => { const au = mkAu(Object.fromEntries(X.NETWORK_ARMS.map((a, j) => [a, { dark: () => 0, lit: (i) => 0.05 + 0.01 * ((j * 5) % 28) + wob(i, 0.02) }]))); return near(X.networkStats(au, "dark").median, 0, 1e-9) && near(X.networkStats(au, "lit").median, 0.185, 1e-9); })());
    ok("!! tuned autopilots far above every network (+0.5): THE LEARNED GAIN IS A TUNING GAP", v(tun(0.5)) === "THE LEARNED GAIN IS A TUNING GAP");
    ok("!! tuned autopilots at +0.2 (between the median 0.185 and the third quartile): A TUNING GAP", v(tun(0.2)) === "THE LEARNED GAIN IS A TUNING GAP");
    ok("!! the GAP boundary is the median: a tuned mean of 0.1851 is A TUNING GAP and 0.1849 is PARTLY (float noise rules out testing 0.185 itself)", v(tun(0.1851)) === "THE LEARNED GAIN IS A TUNING GAP" && v(tun(0.1849)) === "THE LEARNED GAIN IS PARTLY A TUNING GAP");
    ok("!! the NOT boundary is the first quartile (the 7th smallest, 0.11): a tuned mean of 0.1099 is NOT A TUNING GAP and 0.1101 is PARTLY", v(tun(0.1099)) === "THE LEARNED GAIN IS NOT A TUNING GAP" && v(tun(0.1101)) === "THE LEARNED GAIN IS PARTLY A TUNING GAP");
    ok("!! the verdict reads the MEAN of the five tuned gains, not each: two at +0.5 and three at +0.02 average 0.212 (A TUNING GAP); one at +0.5 and four at +0.03 average 0.122 (PARTLY)", v({ ...all(X.TUNED_IDS.slice(0, 2), 0.5), ...all(X.TUNED_IDS.slice(2), 0.02) }) === "THE LEARNED GAIN IS A TUNING GAP" && v({ ...all(X.TUNED_IDS.slice(0, 1), 0.5), ...all(X.TUNED_IDS.slice(1), 0.03) }) === "THE LEARNED GAIN IS PARTLY A TUNING GAP");
    ok("!! the median is the mean of the 14th AND 15th smallest, not the 14th or the 15th alone: with the networks at 0.05..0.32 the 14th is 0.18 and the 15th 0.19: a tuned mean of 0.18 (the 14th alone would call it a gap) is PARTLY, 0.19 (the 15th alone would too) is A TUNING GAP, so the line is the mean 0.185 and not either", v(tun(0.18)) === "THE LEARNED GAIN IS PARTLY A TUNING GAP" && v(tun(0.19)) === "THE LEARNED GAIN IS A TUNING GAP");
    ok("!! the learning count is of dark gains OVER 0.02: 0.0199 does not count and 0.0201 does; foundCount counts them", X.foundCount(mkAu(tun(0.0199))) === 0 && X.foundCount(mkAu(tun(0.0201))) === 5 && X.foundCount(mkAu({ ...all(X.TUNED_IDS.slice(0, 3), 0.05), ...all(X.TUNED_IDS.slice(3), 0.01) })) === 3);
    ok("!! foundCount reads the DARK tank: five tuned autopilots that gain only in the lit tank found nothing", X.foundCount(mkAu(Object.fromEntries(X.TUNED_IDS.map((a) => [a, { dark: () => 0, lit: (i) => 0.1 + wob(i, 0.02) }])))) === 0);
    const few = (k) => ({ ...all(X.TUNED_IDS.slice(0, k), 0.5), ...all(X.TUNED_IDS.slice(k), 0.0) });
    ok("!! the learning boundary is 4 of 5: four tuned autopilots that found it (and one that did not) still give a verdict, three give NOT ASSESSED: TUNING FOUND NOTHING whatever the networks do", v(few(4)) === "THE LEARNED GAIN IS A TUNING GAP" && v(few(3)) === "NOT ASSESSED: TUNING FOUND NOTHING" && v(few(0)) === "NOT ASSESSED: TUNING FOUND NOTHING" && v(few(5)) === "THE LEARNED GAIN IS A TUNING GAP");
    ok("!! tunedMean is the mean dark gain of the five (and the lit one when asked): 0.05 dark and 0.01 lit give 0.05 and 0.01", (() => { const au = mkAu(tun(0.05, 0.01)); return near(X.tunedMean(au), 0.05, 1e-9) && near(X.tunedMean(au, "lit"), 0.01, 1e-9) && near(X.tunedMean(au, "dark"), 0.05, 1e-9); })());
    { const au = mkAu({ "tuned-0": gain(0.3, 0.1), ...netGains() });
      const d = X.pairOf(au, "tuned-0", "autopilot", "dark"), l = X.pairOf(au, "tuned-0", "autopilot", "lit"), back = X.pairOf(au, "autopilot", "tuned-0", "dark");
      ok("!! pairOf is a minus b in the condition asked for: +0.3 dark and +0.1 lit over the autopilot read about +0.3 BETTER dark and +0.1 BETTER lit, the autopilot against it about -0.3 WORSE; gainOf is the mean of that pair", d.reading === "BETTER" && near(d.mean, 0.3, 2e-3) && l.reading === "BETTER" && near(l.mean, 0.1, 2e-3) && back.reading === "WORSE" && near(back.mean, -0.3, 2e-3) && X.gainOf(au, "tuned-0", "dark") === d.mean && X.gainOf(au, "tuned-0", "lit") === l.mean, `${d.mean.toFixed(4)} ${l.mean.toFixed(4)} ${back.mean.toFixed(4)}`);
      const m = (a, c) => au[c][a].reduce((x, r) => x + r.score, 0) / au[c][a].length;
      ok("!! meanOf is an arm's mean score in the condition asked for (dark and lit differ for tuned-0 and each equals the hand-computed mean)", near(X.meanOf(au, "tuned-0", "dark"), m("tuned-0", "dark"), 1e-12) && near(X.meanOf(au, "tuned-0", "lit"), m("tuned-0", "lit"), 1e-12) && Math.abs(X.meanOf(au, "tuned-0", "dark") - X.meanOf(au, "tuned-0", "lit")) > 0.1); }
    ok("!! medianFactors is, per gain, the median over the five champions of gain / default: factors 0.5, 1, 2, 4 and 8 on kHdg give 2, factors 1.1..1.3 elsewhere give 1.2", (() => { const f = X.medianFactors(champsOf((r, i) => (i === 7 ? [0.5, 1, 2, 4, 8][r] : 1.1 + 0.05 * r))); return near(f[7], 2, 1e-9) && near(f[0], 1.2, 1e-9) && f.length === 11; })());
}
sec("4. LINES");
{
    const L = (spec, factor) => X.bottomLines(mkAu({ ...netGains(), ...spec }, N, factor));
    const a = L(tun(0.5)), pairsAll = 5 * 28;
    ok("!! a clear gap: line 1 FOUND with 5 of 5, line 2 gives the tuned and the networks' statistics, line 3 beats 140 of 140 pairs, line 4 the lit gain, line 5 what moved, line 6 A TUNING GAP, line 7 zero lost", a.length === 7 && a[0] === "TUNING FOUND: 5 OF 5 TUNED AUTOPILOTS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0.02" && /^DARK GAIN OVER THE AUTOPILOT: TUNED \+0\.5000 \(sd 0\.0000, range \+0\.5000 to \+0\.5000\); THE 28 NETWORKS median \+0\.1850 \(quartiles \+0\.1100 to \+0\.2600, range \+0\.0500 to \+0\.3200\)$/.test(a[1]) && a[2] === `THE TUNED AUTOPILOTS BEAT ${pairsAll} OF ${pairsAll} PAIRS WITH THE 28 NETWORKS IN THE DARK, TIE 0, ARE BELOW 0` && /^LIT TANK: TUNED GAIN \+0\.0000; THE 28 NETWORKS median \+0\.0000$/.test(a[3]) && a[5] === "VERDICT: THE LEARNED GAIN IS A TUNING GAP" && a[6] === "LOST SUBS: autopilot 0, tuned 0 (0 in the worst), networks 0 (0 in the worst)", J(a));
    const b = L(tun(0.05));
    ok("!! tuned autopilots at +0.05 (below the first quartile 0.11): line 3 beats none of the 140 pairs, ties the five at 0.05 (one network each) and is below the other 135; the verdict NOT A TUNING GAP", b[2] === "THE TUNED AUTOPILOTS BEAT 0 OF 140 PAIRS WITH THE 28 NETWORKS IN THE DARK, TIE 5, ARE BELOW 135" && b[5] === "VERDICT: THE LEARNED GAIN IS NOT A TUNING GAP", b[2]);
    const c = L({ ...all(X.TUNED_IDS.slice(0, 3), 0.5), ...all(X.TUNED_IDS.slice(3), 0.01) });
    ok("!! three that found it: line 1 says FOUND NOTHING with 3 of 5 and the verdict is NOT ASSESSED", c[0] === "TUNING FOUND NOTHING: 3 OF 5 TUNED AUTOPILOTS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0.02" && c[5] === "VERDICT: NOT ASSESSED: TUNING FOUND NOTHING", c[0]);
    const d = L({ "tuned-0": gain(0.1), "tuned-1": gain(0.2), "tuned-2": gain(0.3), "tuned-3": gain(0.4), "tuned-4": gain(0.5) })[1];
    ok("!! line 2's tuned statistics are over the FIVE gains, the mean first then the sample sd and the range: 0.1, 0.2, 0.3, 0.4, 0.5 have mean 0.3000, sd 0.1581, range +0.1000 to +0.5000", /TUNED \+0\.3000 \(sd 0\.1581, range \+0\.1000 to \+0\.5000\)/.test(d), d);
    const t = L({ ...tun(0.1), "tuned-0": gain(0.1) }).concat(), tied = X.bottomLines(mkAu({ ...netGains(), ...tun(0.1) }))[2];
    ok("!! line 3 counts BETTER, TIES and WORSE per pair in the dark: tuned at 0.1 against networks at 0.05..0.32 beats the 5 below it, ties the one at 0.10, is below the 22 above, times five tuned (25 / 5 / 110)", tied === "THE TUNED AUTOPILOTS BEAT 25 OF 140 PAIRS WITH THE 28 NETWORKS IN THE DARK, TIE 5, ARE BELOW 110" && t.length === 7, tied);
    const lit = L({ ...tun(0.5, 0.2), ...Object.fromEntries(X.NETWORK_ARMS.map((a, j) => [a, gain(0.05 + 0.01 * ((j * 5) % 28), 0.01 * (j % 4))])) })[3];
    ok("!! the lit line gives the tuned lit gain and the networks' lit median, not their dark ones: tuned lit +0.2000 and the median of the 28 lit gains over the 0.00, 0.01, 0.02, 0.03 pattern +0.0150 (the mean of the 14th and 15th smallest, 0.01 and 0.02)", /^LIT TANK: TUNED GAIN \+0\.2000; THE 28 NETWORKS median \+0\.0150$/.test(lit), lit);
    const m1 = L(tun(0.5), (r, i) => (i === 7 ? 3 : i === 8 ? 0.4 : 1.1))[4], m2 = L(tun(0.5), (r, i) => (i === 7 ? 1.5 : i === 8 ? 1 / 1.5 : 1.1))[4];
    ok("!! what tuning moved: kHdg x3.00 and kR x0.40 are listed (outside 1.5x either way), and 1.1x on the rest is not; a factor of exactly 1.5 and 1/1.5 is not listed; with nothing moved the line says none", /: kHdg x3\.00, kR x0\.40$/.test(m1) && !/kHdg|kR/.test(m2) && /: none$/.test(L(tun(0.5), () => 1.1)[4]), `${m1} | ${m2}`);
    const l = L({ autopilot: { lost: ["dark", "lit"] }, "tuned-0": { lost: ["dark"] }, "tuned-3": { lost: ["dark", "lit"] }, "network-Wip": { lost: ["lit"] }, "er-3": { lost: ["dark", "lit"] }, "dense-2": { lost: ["dark"] } })[6];
    ok("!! lost subs over both conditions: autopilot 4, tuned 6 (2 and 4) with 4 in the worst, networks 8 (2, 4 and 2 over three arms) with 4 in the worst", l === "LOST SUBS: autopilot 4, tuned 6 (4 in the worst), networks 8 (4 in the worst)", l);
    ok("!! the lit tank does not enter lines 1 to 3 or the verdict: tuned autopilots that gain only lit found nothing and the verdict is NOT ASSESSED", (() => { const e = L(Object.fromEntries(X.TUNED_IDS.map((a) => [a, { dark: () => 0, lit: (i) => 0.3 + wob(i, 0.02) }]))); return e[0].startsWith("TUNING FOUND NOTHING: 0 OF 5") && e[5] === "VERDICT: NOT ASSESSED: TUNING FOUND NOTHING"; })());
}
sec("5. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ ...netGains(), ...tun(0.1, 0.02) });
    ok("!! seven check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "EVENT REACHES THE FLIGHT", "TUNED CHAMPIONS OF FOUR SEARCHES", "TUNED ARMS DISTINCT", "ARMS DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit["dense-4"].pop(); const a2 = good(); a2.dark["er-3"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.lit.autopilot = a4.dark.autopilot.map((r) => ({ ...r }));
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 SCORES INSIDE, an autopilot with equal dark and lit scores EVENT REACHES THE FLIGHT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("EVENT REACHES THE FLIGHT"));
    const a5 = good(); a5.tuned.get(2).searches.pop(); const a6 = good(); a6.tuned.get(1).gains.pop(); const a7 = good(); a7.tuned.delete(4); const a8 = good(); a8.tuned.get(0).gains[3] = X.DEFAULT_GAINS[3] * 8.1; const a9 = good(); a9.tuned.get(0).gains[3] = X.DEFAULT_GAINS[3] / 8.1; const a10 = good(); a10.tuned.get(3).gains[0] = NaN;
    ok("!! a champion with three searches, ten gains, no record, a gain past 8x above the default, below default/8 or NaN breaks TUNED CHAMPIONS OF FOUR SEARCHES", ["TUNED CHAMPIONS OF FOUR SEARCHES"].every((n) => [a5, a6, a7, a8, a9, a10].every((a) => names(a).includes(n))));
    const a11 = good(); a11.tuned.get(0).gains[3] = X.DEFAULT_GAINS[3] * 8; const a12 = good(); a12.tuned.get(0).gains[3] = X.DEFAULT_GAINS[3] / 8; const a13 = good(); a13.tuned.get(0).searches.push({ k: 4 });
    ok("!! gains exactly at the bounds (8x and 1/8) are inside; a fifth search breaks the champions row", !names(a11).includes("TUNED CHAMPIONS OF FOUR SEARCHES") && !names(a12).includes("TUNED CHAMPIONS OF FOUR SEARCHES") && names(a13).includes("TUNED CHAMPIONS OF FOUR SEARCHES"));
    const a14 = good(); a14.dark["tuned-2"] = a14.dark["tuned-1"].map((r) => ({ ...r })); const a15 = good(); a15.dark["tuned-0"] = a15.dark.autopilot.map((r) => ({ ...r })); const a16 = good(); a16.dark["er-5"] = a16.dark["er-4"].map((r) => ({ ...r })); const a17 = good(); a17.dark["network-Wip"] = a17.dark["network-Actuators"].map((r) => ({ ...r }));
    ok("!! two identical tuned arms, a tuned arm identical to the autopilot, two identical controls, two identical networks break the distinctness rows (TUNED ARMS DISTINCT for the first two, ARMS DISTINCT for the last two)", names(a14).includes("TUNED ARMS DISTINCT") && names(a15).includes("TUNED ARMS DISTINCT") && names(a16).includes("ARMS DISTINCT") && names(a17).includes("ARMS DISTINCT") && !names(a16).includes("TUNED ARMS DISTINCT"));
    const a18 = good(); a18.dark["er-9"][5].score = 0; const a19 = good(); a19.range = { from: 1, to: 41 };
    ok("!! a score of exactly 0 breaks SCORES INSIDE; a 41-id range with 40 runs breaks SIZES", names(a18).includes("SCORES INSIDE (0, 1)") && names(a19).includes("SIZES"));
}
sec("6. REPORT");
{
    const au = mkAu({ ...netGains(), ...tun(0.3, 0.02) }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the seven checks pass first", /^ROUND H6: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 8).every((l) => /^  PASS /.test(l)));
    const m = (a, c) => au[c][a].reduce((s, r) => s + r.score, 0) / au[c][a].length, row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(18)));
    ok("!! the means table prints each of the 34 arms' dark and lit mean to four places (the autopilot, tuned-0, network-Wip, er-0, dense-9)", ["autopilot", "tuned-0", "network-Wip", "er-0", "dense-9"].every((a) => row(a).startsWith(`  ${a.padEnd(18)} ${m(a, "dark").toFixed(4)} / ${m(a, "lit").toFixed(4)}`)) && X.ARM_IDS.every((a) => !!row(a)), row("tuned-0"));
    ok("!! each champion's block gives its eleven gains to three places, its held-out score and the four searches' held-out scores; the defaults follow", /tuned-0: kDepth 0\.220, vzMax 1\.100, maxPitch 0\.330, kTheta 16\.500.*kSpd 0\.550\n +held-out -0\.3000 \(searches -0\.300 -0\.301 -0\.302 -0\.303\)/.test(t) && /tuned-4: kDepth 0\.260/.test(t) && /defaults: kDepth 0\.2, vzMax 1, maxPitch 0\.3, kTheta 15, kQ 12, kBalD 0\.03, kBalV 0\.3, kHdg 3, kR 10, kBeta 2, kSpd 0\.5/.test(t));
    ok("!! a gain block (dark, lit) for each tuned autopilot and a tuned-against-network row (better / ties / below of the 28) for each", X.TUNED_IDS.every((a) => new RegExp("^" + a + ":\\n   dark .*\\n   lit  ", "m").test(t) && new RegExp("^   " + a + ": \\d+ / \\d+ / \\d+$", "m").test(t)));
    ok("!! the tuned-against-network counts are exact: tuned at +0.3 beats the 25 networks from 0.05 to 0.29, ties the one at 0.30, is below the two at 0.31 and 0.32 -- the row reads 25 / 1 / 2", /^   tuned-0: 25 \/ 1 \/ 2$/m.test(t), (t.match(/^   tuned-0: .*$/m) || [""])[0]);
    ok("!! the seven bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-7).every((l) => l.startsWith("BOTTOM LINE: ")) && /^BOTTOM LINE: TUNING FOUND/.test(L[L.length - 7]) && /LOST SUBS/.test(L[L.length - 1]) && /VERDICT: /.test(L[L.length - 2]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/means \(dark/.test(Lb.join("\n")));
}
sec("7. FLIGHT");
{
    const wipw = JSON.parse(fs.readFileSync(new URL("../../brain/pilotSubWeightsWip.json", import.meta.url), "utf8")).weights;
    const nets = Object.fromEntries(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"].map((n, i) => [n, wipw.map((v) => v * (1 + 0.02 * (i + 1)))]));
    const tuned = new Map(Array.from({ length: 5 }, (_, r) => [r, { gains: X.DEFAULT_GAINS.map((g, i) => (i === 7 ? g * (1.5 + 0.3 * r) : g * (1 + 0.1 * r))), heldScore: -0.3, searches: [0, 1, 2, 3].map((k) => ({ k, seed: k, trainScore: 0, heldScore: 0 })) }]));
    const controls = new Map(H5.SPECS.map((s, i) => { const P = H5.policyOf(s), h = Array.from(P.handWeights()).map((v) => v * (1 + 0.03 * (i + 1))); return [s, { weights: h }]; }));
    const opt = { range: { from: 0, to: 1 }, seconds: 30 }, a = X.audit(tuned, nets, controls, opt), a2 = X.audit(tuned, nets, controls, opt);
    ok("!! an audit flies the 34 arms dark and lit on the ids and is deterministic (twice the same scores)", Object.keys(a.dark).length === 34 && Object.keys(a.lit).length === 34 && J(a.dark) === J(a2.dark) && J(a.lit) === J(a2.lit) && a.dark.autopilot.length === 2 && a.tuned === tuned && a.range === opt.range);
    ok("!! the tuned autopilots are SEATED through their tank kind on the real flights: each flies differently from the autopilot and from each other (the kind is flown, not the autopilot's fallback)", X.TUNED_IDS.every((t) => a.dark[t].some((r, i) => r.score !== a.dark.autopilot[i].score)) && new Set(X.TUNED_IDS.map((t) => J(a.dark[t]))).size === 5);
    ok("!! the networks and the H5 controls fly differently from the autopilot too (every one of the 28)", X.NETWORK_ARMS.every((n) => a.dark[n].some((r, i) => r.score !== a.dark.autopilot[i].score)));
    ok("!! the seven checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
    ok("!! audit REFUSES a missing tuned champion rather than flying the autopilot in its place", /no tuned champion for replicate 1/.test(thr(() => { const t = new Map(tuned); t.delete(1); X.audit(t, nets, controls, opt); })));
}
sec("8. SOURCE");
{
    ok("!! the ids 6000 and 6199 appear once each; no clock, no random number, nothing read from the disk", code.split("6000").length === 2 && code.split("6199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
