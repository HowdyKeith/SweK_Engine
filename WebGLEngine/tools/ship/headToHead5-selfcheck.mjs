// WebGLEngine/tools/ship/headToHead5-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/headToHead5-selfcheck.mjs      (~9 s: hand fixtures, three tiny searches and one short real audit; 8.9-9.3 s on this box)
//
// THE GATE OF tools/ship/headToHead5.mjs (Round H5 of brain/HEAD_TO_HEAD.md, registered first).
//   1 SETS      the twenty control specs, the twenty-two arms, the ids 5000-5199 (disjoint from H1's, H2's, H4's, the looks' and every gate's ids), 160 s; the recipe IS trainSubPilot's; the circuits (the random wirings have the GFC's 34 neurons and 313
//               synapses, no self-loop, no repeat, and differ from one another; the dense net has 23 neurons, 506 synapses, 947 weights); the search seeds; the tank kinds and the board arms; boardOf's refusals.
//   2 SEARCH    one tiny search of a random wiring and of a dense net: the weights count, determinism, the seed; the champion of four searches (best held-out, ties to the smaller k) and its refusals.
//   3 VERDICT   the registered verdict in every branch (NOT ASSESSED, SUPPORTED, NOT SUPPORTED) at the boundaries of 8 and 9 of 10; the counts, the rank, the statistics.
//   4 LINES     the six bottom lines in their cases; lost subs counted over both conditions.
//   5 CHECKS    sizes, ids aligned, scores inside (0, 1), the event reaches the flight, the champions, the arms distinct, the topologies distinct; a failed check says NOT WEIGHED.
//   6 REPORT    the means table with the held-out scores, the gain blocks, the connectome-minus-control blocks, the lit-tank line, the lines last.
//   7 FLIGHT    one real short audit (ids 0-1, 30 s): the real Wip weights, controls seated through their tank kinds, deterministic, the checks pass.
//   8 SOURCE    the ids appear once; no clock, random or file.
// NOT CHECKED, said plainly: whether the wiring matters (that is the experiment), and that the recipe the controls were trained by is a good one.
// SABOTAGE LOG (58 mutants of tools/ship/headToHead5.mjs, each alone in its own worktree copy): 53 went red by name on the first pass. 5 went 0 red and each got a row, then went red: parseSpec without its end anchor (trailing junk accepted); the random wirings' topology seed 6301 + c instead of 6300 + c (the gate only checked determinism: now it compares with the fish trainer's controlTopology edge for edge); the record's weights unpruned (a 3-iteration search prunes nothing: a 40-iteration one moves 58 and keeps 11); the TOPOLOGIES row made trivial (the check takes a `topologyOf` on the audit for the gate to hand in a duplicate); the lit-tank line's random-wiring count read in the dark (the row now compares the whole line for a lit-only and a dark-only leader).
//   Two more mutants after that (the condition ignored in pairOf, and in meanOf) went red on the two rows added to name those exports for tools/ship/definitionGates, which had counted them as ungated; 60 mutants in all.
//   The fixture lessons: a gain of exactly 0.02 cannot be built (float noise decides the boundary), so the learning margin is tested at 0.0199 and 0.0201 and the `>=` form of the margin is an equivalent mutant not tried; and a control made from the hand weights moved by ONE weight can fly exactly as the autopilot does (the recurrent core starts at zero), so the real-flight fixture scales every weight by its own factor.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./headToHead5.mjs";
import * as TS from "./trainSubPilot.mjs";
import * as T from "../../brain/subTask.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import * as PF from "../../brain/pilotSubFish.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const src = fs.readFileSync(new URL("./headToHead5.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
console.log("headToHead5-selfcheck -- Round H5\n");
const aid = X.armIdOf;

sec("1. SETS");
{
    ok("!! twenty control specs in order, er:0..er:9 then dense:0..dense:9; twenty-two arms: autopilot, network-Wip, er-0..er-9, dense-0..dense-9; frozen", X.SPECS.length === 20 && J(X.SPECS.slice(0, 3)) === J(["er:0", "er:1", "er:2"]) && X.SPECS[9] === "er:9" && X.SPECS[10] === "dense:0" && X.SPECS[19] === "dense:9" && X.ARM_IDS.length === 22 && J(X.ARM_IDS.slice(0, 3)) === J(["autopilot", "network-Wip", "er-0"]) && X.ARM_IDS[21] === "dense-9" && Object.isFrozen(X.SPECS) && Object.isFrozen(X.ARM_IDS));
    ok("!! ids 5000-5199 (200), 160 s: not H1's 2000-2199, not H2's 3000-3199, not H4's 4000-4199, not the looks' ids, not the gates' 0-14", X.IDS.from === 5000 && X.IDS.to === 5199 && X.SECONDS === 160);
    ok("!! the recipe IS the submarine trainer's: 4 searches, 400 iterations, sigma 0.3, at most 4 weights moved a step; the verdict constants are the registered ones (10 + 10 controls, 23 dense neurons, margin 0.02, learn 8, support 9)", J(X.RECIPE) === J(TS.RECIPE) && X.RECIPE.runs === 4 && X.RECIPE.iters === 400 && X.RECIPE.sigma === 0.3 && X.RECIPE.maxK === 4 && X.COUNTS.er === 10 && X.COUNTS.dense === 10 && X.DENSE_NEURONS === 23 && X.LEARN_MARGIN === 0.02 && X.LEARN_MIN === 8 && X.SUPPORT_MIN === 9);
    const t0 = X.topologyOf("er:0"), t1 = X.topologyOf("er:1"), td = X.topologyOf("dense:3"), pair = new Set(t0.EDGES.map((e) => e.join(",")));
    ok("!! a random wiring has the GFC's 34 neurons and 313 synapses, no self-loop and no repeat; two of them differ; the circuit of er:c is the fish trainer's controlTopology at seed 6300 + c", t0.NEURON_ORDER.length === GFC.NEURON_ORDER.length && t0.EDGES.length === GFC.EDGES.length && pair.size === 313 && t0.EDGES.every(([a, b]) => a !== b) && J(t0.EDGES) !== J(t1.EDGES) && J(t1.EDGES) === J(X.topologyOf("er:1").EDGES));
    ok("!! the circuit of er:c IS the fish trainer's controlTopology of the GFC at seed 6300 + c, for every c (edge for edge), not merely some random circuit of the right size", Array.from({ length: 10 }, (_, c) => c).every((c) => J(X.topologyOf("er:" + c).EDGES) === J(PF.controlTopology(GFC, 6300 + c).EDGES)));
    ok("!! the dense circuit is 23 neurons and every ordered pair but self-loops (506); it is the same circuit for every dense:c; its policy has 947 weights, a random wiring's has 963 (the GFC's own count)", td.NEURON_ORDER.length === 23 && td.EDGES.length === 506 && td.EDGES.every(([a, b]) => a !== b) && J(td.EDGES) === J(X.topologyOf("dense:9").EDGES) && X.policyOf("dense:0").WEIGHT_COUNT === 947 && X.policyOf("er:0").WEIGHT_COUNT === 963 && J(X.WEIGHTS_OF) === J({ er: 963, dense: 947 }));
    ok("!! parseSpec reads er:K and dense:K and refuses a family it does not know, a missing index, an index past 9 and junk, naming it", J(X.parseSpec("dense:7")) === J({ family: "dense", index: 7 }) && /is not er:K or dense:K/.test(thr(() => X.parseSpec("fly:1"))) && /is not er:K or dense:K/.test(thr(() => X.parseSpec("er"))) && /is not er:K or dense:K/.test(thr(() => X.parseSpec("er:1x"))) && /is not er:K or dense:K/.test(thr(() => X.parseSpec("er:1 "))) && /is not er:K or dense:K/.test(thr(() => X.parseSpec("xer:1"))) && /past er:9/.test(thr(() => X.parseSpec("er:10"))) && /past dense:9/.test(thr(() => X.parseSpec("dense:10"))) && /is not er:K/.test(thr(() => X.parseSpec(null))));
    ok("!! the search seeds: er-c search k is 6310 + 10 c + k, dense-c search k is 6510 + 10 c + k (er:0 k0 6310, er:9 k3 6403, dense:0 k0 6510, dense:9 k3 6603)", X.searchSeed("er:0", 0) === 6310 && X.searchSeed("er:9", 3) === 6403 && X.searchSeed("dense:0", 0) === 6510 && X.searchSeed("dense:9", 3) === 6603 && X.searchSeed("er:2", 1) === 6331);
    const kind = X.kindOf("er:4");
    ok("!! the tank kind of a control is named h5-<spec>, takes its policy's weight count, builds the policy's own pilot (a function) and does not persist", kind.circuit === "h5-er:4" && kind.weightCount === 963 && X.kindOf("dense:1").weightCount === 947 && typeof kind.build(Array.from({ length: 963 }, () => 0)) === "function" && kind.persist === false);
    const w = Array.from({ length: 947 }, (_, i) => 0.001 * i), arm = X.armOf("dense:2", w);
    ok("!! a control's board arm: id dense-2, flying layer, controls the autopilot and network-Wip, an entry that names its own circuit and the weights (a copy), a register that puts the kind on a tank", arm.id === "dense-2" && arm.layer === "flying" && J(arm.controls) === '["autopilot","network-Wip"]' && arm.entry().circuit === "h5-dense:2" && arm.entry().weights.length === 947 && arm.entry().weights !== w && (() => { const seen = []; arm.register({ registerPilotKind: (c, k) => seen.push([c, k.weightCount]) }); return J(seen) === J([["h5-dense:2", 947]]); })());
    ok("!! armOf refuses weights of the wrong count (946 for a dense net, 947 for a random wiring) and null, naming the spec", /dense:2 takes 947 weights, got 946/.test(thr(() => X.armOf("dense:2", w.slice(1)))) && /er:0 takes 963 weights, got 947/.test(thr(() => X.armOf("er:0", w))) && /takes 947 weights, got null/.test(thr(() => X.armOf("dense:2", null))));
    const champs = new Map(X.SPECS.map((s) => [s, { weights: Array.from({ length: X.WEIGHTS_OF[X.familyOf(s)] }, () => 0), searches: [1, 2, 3, 4].map((k) => ({ k })), heldScore: 0 }])), wip = Array.from({ length: 963 }, () => 0);
    const b = X.boardOf(wip, champs);
    ok("!! the board holds the dropout task and the twenty-two arms; the controls of network-Wip is the autopilot; every control is held to the autopilot and network-Wip", b.tasks.size === 1 && b.tasks.has("dropout") && b.arms.size === 22 && X.ARM_IDS.every((a) => b.arms.has(a)) && J(b.arms.get("network-Wip").controls) === '["autopilot"]' && X.SPECS.every((s) => J(b.arms.get(aid(s)).controls) === '["autopilot","network-Wip"]'));
    const c2 = new Map(champs); c2.delete("dense:5");
    ok("!! boardOf refuses a wrong-length Wip and a missing champion, naming it", /wip must be an array of 963/.test(thr(() => X.boardOf(wip.slice(1), champs))) && /no champion for dense:5/.test(thr(() => X.boardOf(wip, c2))) && /no champion for er:0/.test(thr(() => X.boardOf(wip, null))));
}
sec("2. SEARCH");
{
    const tiny = { iters: 3, trainSet: T.TRAIN_SET.slice(0, 2), heldSet: T.HELD_OUT_SET.slice(0, 2) };
    const a = X.searchOne("er:0", 1, tiny), a2 = X.searchOne("er:0", 1, tiny), d = X.searchOne("dense:0", 2, tiny);
    ok("!! a tiny search of a random wiring is deterministic (twice the same record), carries its spec, k and seed (6311), 963 finite weights and a held-out score", J(a) === J(a2) && a.spec === "er:0" && a.k === 1 && a.seed === 6311 && a.weights.length === 963 && a.weights.every(Number.isFinite) && Number.isFinite(a.heldScore) && Number.isFinite(a.trainScore));
    ok("!! a tiny search of a dense net has 947 weights and its own seed (6512); a different k gives a different search (the seed moves)", d.weights.length === 947 && d.seed === 6512 && d.spec === "dense:0" && X.searchOne("er:0", 2, tiny).seed === 6312);
    { const long = X.searchOne("er:0", 0, { iters: 40, trainSet: T.TRAIN_SET.slice(0, 2), heldSet: T.HELD_OUT_SET.slice(0, 2) }), hand0 = X.policyOf("er:0").handWeights(), differ = long.weights.filter((w, i) => Math.abs(w - hand0[i]) > 1e-12).length;
      ok("!! the record's weights are the PRUNED ones: a 40-iteration search of a random wiring moved 58 weights and kept 11, and the record differs from the hand weights on exactly the 11 kept (not on the 58 the search moved)", long.moved > long.kept && long.kept > 0 && differ === long.kept, `moved ${long.moved} kept ${long.kept} differ ${differ}`); }
    const hand = X.policyOf("er:0").handWeights(), held = T.HELD_OUT_SET.slice(0, 2), ev = X.policyOf("er:0").evaluate(a.weights, held).score;
    ok("!! the held-out score is the policy's evaluation of the pruned weights on the held-out set handed in (not the training score)", near(a.heldScore, ev, 1e-12) && hand.length === 963);
    ok("!! searchOne refuses a k outside 0..3 and a non-integer, and a spec it cannot parse", /search k must be 0\.\.3/.test(thr(() => X.searchOne("er:0", 4, tiny))) && /search k must be 0\.\.3/.test(thr(() => X.searchOne("er:0", -1, tiny))) && /search k must be 0\.\.3/.test(thr(() => X.searchOne("er:0", 1.5, tiny))) && /is not er:K/.test(thr(() => X.searchOne("zz:0", 0, tiny))));
    const run = (k, held, seed = 100 + k) => ({ spec: "er:3", k, seed, weights: [k], heldScore: held, trainScore: -k });
    const c = X.championOf("er:3", [run(0, -0.5), run(1, -0.3), run(2, -0.4), run(3, -0.6)]);
    ok("!! the champion is the search with the best held-out score (k 1 at -0.3), carrying its weights, seed and k, and all four searches' scores in k order", c.k === 1 && c.heldScore === -0.3 && J(c.weights) === "[1]" && c.seed === 101 && J(c.searches.map((s) => s.k)) === "[0,1,2,3]" && c.searches[2].heldScore === -0.4 && c.spec === "er:3");
    const tie = X.championOf("er:3", [run(3, -0.3), run(1, -0.3), run(2, -0.4), run(0, -0.6)]);
    ok("!! a tie in the held-out score goes to the smaller k (k 1, not k 3), whatever the order the searches arrive in", tie.k === 1);
    ok("!! championOf refuses three searches, five, a search of another spec and a repeated k, naming the fault", /needs exactly 4 searches, got 3/.test(thr(() => X.championOf("er:3", [run(0, 0), run(1, 0), run(2, 0)]))) && /needs exactly 4 searches, got 5/.test(thr(() => X.championOf("er:3", [0, 1, 2, 3, 3].map((k) => run(k, 0))))) && /must be of that spec and have distinct k/.test(thr(() => X.championOf("er:3", [run(0, 0), run(1, 0), run(2, 0), { ...run(3, 0), spec: "er:4" }]))) && /must be of that spec and have distinct k/.test(thr(() => X.championOf("er:3", [run(0, 0), run(1, 0), run(2, 0), run(2, 0)]))) && /needs exactly 4 searches, got null/.test(thr(() => X.championOf("er:3", null))));
}
// a synthetic audit: n ids, per arm and condition a score list; `spec` gives an arm's dark and lit gain functions
const N = 40, base = (c) => Array.from({ length: N }, (_, i) => 0.6 + 0.02 * Math.sin(i + (c === "lit" ? 1 : 0)));
const wob = (i, a) => (i % 2 ? a : -a);
const champsOf = () => new Map(X.SPECS.map((s, i) => [s, { weights: Array.from({ length: X.WEIGHTS_OF[X.familyOf(s)] }, (_, j) => 0.001 * ((i + 1) * (j + 1) % 7)), heldScore: -0.3 - 0.01 * i, searches: [0, 1, 2, 3].map((k) => ({ k, seed: 6000 + k, trainScore: -0.4, heldScore: -0.3 - 0.01 * i - 0.001 * k })) }]));
const mkAu = (spec = {}, n = N) => {
    const au = { dark: {}, lit: {}, range: { from: 1, to: n }, seconds: 60, champions: champsOf() };
    for (const c of ["dark", "lit"]) for (const a of X.ARM_IDS) {
        const f = (spec[a] && spec[a][c]) || (() => 0), lost = (spec[a] && spec[a].lost) || [];
        au[c][a] = Array.from({ length: n }, (_, i) => ({ key: "sb-" + (i + 1), score: base(c)[i % N] + f(i) + (a === "autopilot" ? 0 : (i % 2 ? 1 : -1) * 0.0001 * X.ARM_IDS.indexOf(a)), bad: lost.includes(c) && i < 2 }));
    }
    return au;
};
const gain = (d, l = 0) => ({ dark: (i) => d + wob(i, 0.02), lit: (i) => l + wob(i, 0.02) });
const all = (ids, d, l) => Object.fromEntries(ids.map((a) => [a, gain(d, l)]));
const ers = X.SPECS.filter((s) => s.startsWith("er")).map(aid), denses = X.SPECS.filter((s) => s.startsWith("dense")).map(aid);
sec("3. VERDICT");
{
    const learn = { ...all(ers, 0.05), ...all(denses, 0.05) };
    ok("!! controls that gain 0.05 over the autopilot in the dark all LEARNED (10 and 10); the count is of gains OVER 0.02, so a gain just under 0.02 (0.0199) does not and one just over (0.0201) does", X.learnedCount(mkAu(learn), "er") === 10 && X.learnedCount(mkAu(learn), "dense") === 10 && X.learnedCount(mkAu(all(ers, 0.0199)), "er") === 0 && X.learnedCount(mkAu(all(ers, 0.0201)), "er") === 10);
    ok("!! learnedCount is per family and in the dark: three random wirings that gain 0.05 only in the lit tank do not count", X.learnedCount(mkAu(Object.fromEntries(ers.slice(0, 3).map((a) => [a, { dark: () => 0, lit: (i) => 0.05 + wob(i, 0.02) }]))), "er") === 0 && X.learnedCount(mkAu(all(ers.slice(0, 3), 0.05)), "dense") === 0);
    const v = (spec) => X.verdictOf(mkAu(spec));
    const wipLead = { "network-Wip": gain(0.3) };
    ok("!! the connectome network far above 20 controls that learned: THE WIRING IS SUPPORTED", v({ ...learn, ...wipLead }) === "THE WIRING IS SUPPORTED");
    ok("!! the connectome network level with the controls: THE WIRING IS NOT SUPPORTED", v({ ...learn, "network-Wip": gain(0.05) }) === "THE WIRING IS NOT SUPPORTED");
    const nine = { ...learn, ...wipLead, [ers[0]]: gain(0.3) }, eight = { ...learn, ...wipLead, [ers[0]]: gain(0.3), [ers[1]]: gain(0.3) };
    ok("!! the support boundary is 9 of 10 in EACH family: one random wiring level with Wip (9 of 10 beaten) is still SUPPORTED, two (8 of 10) is NOT SUPPORTED, and the same for the dense nets", v(nine) === "THE WIRING IS SUPPORTED" && v(eight) === "THE WIRING IS NOT SUPPORTED" && v({ ...learn, ...wipLead, [denses[0]]: gain(0.3) }) === "THE WIRING IS SUPPORTED" && v({ ...learn, ...wipLead, [denses[0]]: gain(0.3), [denses[1]]: gain(0.3) }) === "THE WIRING IS NOT SUPPORTED");
    const dud = (n) => Object.fromEntries(ers.slice(0, n).map((a) => [a, gain(0)]));
    ok("!! the learning boundary is 8 of 10 in EACH family: two random wirings that gain nothing still read LEARNED (8 of 10), three read NOT ASSESSED: THE CONTROLS DID NOT LEARN whatever Wip does; so for the dense nets", v({ ...learn, ...wipLead, ...dud(2) }) === "THE WIRING IS SUPPORTED" && v({ ...learn, ...wipLead, ...dud(3) }) === "NOT ASSESSED: THE CONTROLS DID NOT LEARN" && v({ ...learn, ...wipLead, ...Object.fromEntries(denses.slice(0, 3).map((a) => [a, gain(0)])) }) === "NOT ASSESSED: THE CONTROLS DID NOT LEARN");
    ok("!! winsOver counts the controls Wip reads BETTER, TIES or WORSE against, per family: Wip at +0.3 over four random wirings at +0.3 and six at +0.05 beats six, ties four", (() => { const au = mkAu({ ...learn, ...wipLead, ...Object.fromEntries(ers.slice(0, 4).map((a) => [a, gain(0.3)])) }); return X.winsOver(au, "er", "BETTER") === 6 && X.winsOver(au, "er", "TIES") === 4 && X.winsOver(au, "er", "WORSE") === 0 && X.winsOver(au, "dense", "BETTER") === 10; })());
    ok("!! winsOver is read in the condition asked for: Wip gaining only in the lit tank beats the controls lit and ties them in the dark", (() => { const au = mkAu({ ...learn, "network-Wip": { dark: () => 0.05, lit: (i) => 0.3 + wob(i, 0.02) } }); return X.winsOver(au, "er", "BETTER", "lit") === 10 && X.winsOver(au, "er", "BETTER", "dark") === 0 && X.winsOver(au, "er", "TIES", "dark") === 10; })());
    { const au = mkAu({ "network-Wip": { dark: (i) => 0.3 + wob(i, 0.02), lit: () => 0.1 }, [ers[0]]: gain(0, 0) });
      const d = X.pairOf(au, "network-Wip", "er-0", "dark"), l = X.pairOf(au, "network-Wip", "er-0", "lit"), back = X.pairOf(au, "er-0", "network-Wip", "dark");
      ok("!! pairOf is a minus b in the condition asked for: the connectome network at +0.3 dark and +0.1 lit over er-0 reads about +0.3 BETTER dark and about +0.1 BETTER lit, and er-0 against it reads about -0.3 WORSE dark", d.reading === "BETTER" && near(d.mean, 0.3, 2e-3) && l.reading === "BETTER" && near(l.mean, 0.1, 2e-3) && back.reading === "WORSE" && near(back.mean, -0.3, 2e-3), `${d.mean.toFixed(4)} ${l.mean.toFixed(4)} ${back.mean.toFixed(4)}`);
      const m = (a, c) => au[c][a].reduce((x, r) => x + r.score, 0) / au[c][a].length;
      ok("!! meanOf is an arm's mean score in the condition asked for (the connectome network's dark and lit means differ, and each equals the hand-computed mean)", near(X.meanOf(au, "network-Wip", "dark"), m("network-Wip", "dark"), 1e-12) && near(X.meanOf(au, "network-Wip", "lit"), m("network-Wip", "lit"), 1e-12) && Math.abs(X.meanOf(au, "network-Wip", "dark") - X.meanOf(au, "network-Wip", "lit")) > 0.1); }
    const r = (spec) => X.rankOfWip(mkAu(spec));
    ok("!! the rank of the connectome network by dark mean among the 21 trained arms: first when it leads, 21st when it trails, 4th with three controls above it", r({ ...learn, ...wipLead }) === 1 && r({ ...learn, "network-Wip": gain(-0.3) }) === 21 && r({ ...learn, "network-Wip": gain(0.05), [ers[0]]: gain(0.2), [ers[1]]: gain(0.2), [denses[0]]: gain(0.2) }) === 4);
}
sec("4. LINES");
{
    const L = (spec) => X.bottomLines(mkAu(spec)), learn = { ...all(ers, 0.05), ...all(denses, 0.05) };
    const a = L({ ...learn, "network-Wip": gain(0.3) });
    ok("!! a clean win: line 1 LEARNED with 10 and 10, line 2 beats 10 and 10, ties 0 and 0, below 0 and 0, line 3 rank 1, line 4 gives the connectome's gain and each family's mean, sd and range, line 5 SUPPORTED, line 6 zero lost", a[0] === "THE CONTROLS LEARNED: 10 OF 10 RANDOM WIRINGS AND 10 OF 10 DENSE NETS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0.02" && a[1] === "THE CONNECTOME NETWORK BEATS 10 OF 10 RANDOM WIRINGS AND 10 OF 10 DENSE NETS IN THE DARK; TIES 0 AND 0; IS BELOW 0 AND 0" && a[2] === "THE CONNECTOME NETWORK RANKS 1 OF 21 BY DARK MEAN" && /^DARK GAIN OVER THE AUTOPILOT: CONNECTOME \+0\.3000; RANDOM WIRINGS \+0\.0500 \(sd 0\.0000, range \+0\.0500 to \+0\.0500\); DENSE NETS \+0\.0500 \(sd 0\.0000, range \+0\.0500 to \+0\.0500\)$/.test(a[3]) && a[4] === "VERDICT: THE WIRING IS SUPPORTED" && a[5] === "LOST SUBS: autopilot 0, connectome 0, random wirings 0 (0 in the worst), dense nets 0 (0 in the worst)", J(a));
    const b = L({ ...learn, "network-Wip": gain(0.05), [ers[0]]: gain(0.3), [ers[1]]: gain(0.3), [denses[0]]: gain(0.3) });
    ok("!! a level connectome network with two random wirings and one dense net above it: it TIES 8 and 9, IS BELOW 2 and 1, beats none, ranks 4, and NOT SUPPORTED", b[1] === "THE CONNECTOME NETWORK BEATS 0 OF 10 RANDOM WIRINGS AND 0 OF 10 DENSE NETS IN THE DARK; TIES 8 AND 9; IS BELOW 2 AND 1" && b[2] === "THE CONNECTOME NETWORK RANKS 4 OF 21 BY DARK MEAN" && b[4] === "VERDICT: THE WIRING IS NOT SUPPORTED", b[1]);
    const c = L({ "network-Wip": gain(0.3), ...all(ers.slice(0, 3), 0), ...all(ers.slice(3), 0.05), ...all(denses, 0.05) });
    ok("!! three random wirings that did not learn: line 1 says DID NOT LEARN with 7 and 10, and the verdict is NOT ASSESSED", c[0] === "THE CONTROLS DID NOT LEARN: 7 OF 10 RANDOM WIRINGS AND 10 OF 10 DENSE NETS BEAT THE AUTOPILOT IN THE DARK BY MORE THAN 0.02" && c[4] === "VERDICT: NOT ASSESSED: THE CONTROLS DID NOT LEARN", c[0]);
    const d = L({ ...learn, "network-Wip": gain(0.3), [ers[0]]: gain(0.1), [ers[1]]: gain(0.2), [ers[2]]: gain(0.05), [denses[0]]: gain(0.08) })[3];
    ok("!! line 4's statistics are over the TEN gains of each family, the mean first then the sample sd and the range: random wirings at 0.1, 0.2 and eight at 0.05 have mean 0.07", /RANDOM WIRINGS \+0\.0700 \(sd 0\.0483, range \+0\.0500 to \+0\.2000\); DENSE NETS \+0\.0530 \(sd 0\.0\d+, range \+0\.0500 to \+0\.0800\)/.test(d), d);
    const l = L({ autopilot: { lost: ["dark", "lit"] }, "network-Wip": { lost: ["dark"] }, [ers[0]]: { lost: ["dark", "lit"] }, [ers[3]]: { lost: ["lit"] }, [denses[2]]: { lost: ["dark"] } })[5];
    ok("!! lost subs over both conditions: autopilot 4 (two ids dark and lit), connectome 2, random wirings 6 (4 and 2) with 4 in the worst, dense nets 2 with 2 in the worst", l === "LOST SUBS: autopilot 4, connectome 2, random wirings 6 (4 in the worst), dense nets 2 (2 in the worst)", l);
    ok("!! the lit tank does not enter lines 2 to 4: a connectome network that leads only in the lit tank is not credited in the dark lines", (() => { const e = L({ ...learn, "network-Wip": { dark: () => 0.05, lit: (i) => 0.3 + wob(i, 0.02) } }); return e[1].includes("BEATS 0 OF 10 RANDOM WIRINGS") && e[4] === "VERDICT: THE WIRING IS NOT SUPPORTED"; })());
}
sec("5. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => mkAu({ "network-Wip": gain(0.1, 0.02) });
    ok("!! seven check rows on a clean audit, all passing", J(X.checksOf(good()).map((c) => c.name)) === J(["SIZES", "IDS ALIGNED", "SCORES INSIDE (0, 1)", "EVENT REACHES THE FLIGHT", "CHAMPIONS OF FOUR SEARCHES", "ARMS DISTINCT", "TOPOLOGIES DISTINCT"]) && names(good()).length === 0);
    const a1 = good(); a1.lit["dense-4"].pop(); const a2 = good(); a2.dark["er-3"][3].key = "x"; const a3 = good(); a3.dark.autopilot[0].score = 1.0; const a4 = good(); a4.lit.autopilot = a4.dark.autopilot.map((r) => ({ ...r }));
    const a5 = good(); a5.champions.get("er:2").searches.pop(); const a6 = good(); a6.champions.get("dense:1").weights.pop(); const a7 = good(); a7.dark["er-5"] = a7.dark["er-4"].map((r) => ({ ...r })); const a8 = good(); a8.champions.delete("er:7");
    ok("!! a short arm breaks SIZES, a different id IDS ALIGNED, a score of 1 SCORES INSIDE, an autopilot with equal dark and lit scores EVENT REACHES THE FLIGHT, a control with three searches or 946 weights or no record CHAMPIONS OF FOUR SEARCHES, two identical arms ARMS DISTINCT", names(a1).includes("SIZES") && names(a2).includes("IDS ALIGNED") && names(a3).includes("SCORES INSIDE (0, 1)") && names(a4).includes("EVENT REACHES THE FLIGHT") && names(a5).includes("CHAMPIONS OF FOUR SEARCHES") && names(a6).includes("CHAMPIONS OF FOUR SEARCHES") && names(a8).includes("CHAMPIONS OF FOUR SEARCHES") && names(a7).includes("ARMS DISTINCT"));
    const a9 = good(); a9.dark["er-9"][5].score = 0; const a10 = good(); a10.range = { from: 1, to: 41 }; const a11 = good(); a11.champions.get("er:0").weights.push(0);
    ok("!! a score of exactly 0 breaks SCORES INSIDE; a 41-id range with 40 runs breaks SIZES; a random wiring with 964 weights breaks the champions row as 946 does", names(a9).includes("SCORES INSIDE (0, 1)") && names(a10).includes("SIZES") && names(a11).includes("CHAMPIONS OF FOUR SEARCHES"));
    ok("!! the TOPOLOGIES row fails when two random wirings are the same circuit (a topology function that gives er:3 the circuit of er:2)", (() => { const au = good(); au.topologyOf = (s) => X.topologyOf(s === "er:3" ? "er:2" : s); return names(au).includes("TOPOLOGIES DISTINCT") && !names(good()).includes("TOPOLOGIES DISTINCT"); })());
    ok("!! the random wirings are pairwise different circuits (the TOPOLOGIES row reads the real circuits: ten distinct edge sets)", X.checksOf(good()).find((c) => c.name === "TOPOLOGIES DISTINCT").ok && new Set(X.SPECS.filter((s) => s.startsWith("er")).map((s) => J(X.topologyOf(s).EDGES))).size === 10);
}
sec("6. REPORT");
{
    const au = mkAu({ "network-Wip": gain(0.1, 0.02), ...all(ers, 0.05, 0.05), ...all(denses, 0.04, 0.04) }), L = X.report(au), t = L.join("\n");
    ok("!! the head names the ids, the seconds and 'read once'; the seven checks pass first", /^ROUND H5: .* Ids 1-40 \(40\), 60 s, dark and lit; read once$/.test(L[0]) && L.slice(1, 8).every((l) => /^  PASS /.test(l)));
    const m = (a, c) => au[c][a].reduce((s, r) => s + r.score, 0) / au[c][a].length, row = (a) => t.split("\n").find((l) => l.startsWith("  " + a.padEnd(12)));
    ok("!! the means table prints each arm's dark and lit mean to four places, and each control's held-out score and its four search scores (the autopilot, Wip, er-0, dense-9)", ["autopilot", "network-Wip", "er-0", "dense-9"].every((a) => row(a).startsWith(`  ${a.padEnd(12)} ${m(a, "dark").toFixed(4)} / ${m(a, "lit").toFixed(4)}`)) && row("er-0").includes("held-out -0.3000 (searches -0.300 -0.301 -0.302 -0.303)") && row("dense-9").includes("held-out -0.4900") && !row("autopilot").includes("held-out") && !row("network-Wip").includes("held-out"), row("er-0"));
    ok("!! a gain block (dark, lit) for each of the twenty-one trained arms and a connectome-minus-control block (dark, lit) for each of the twenty controls", X.ARM_IDS.filter((a) => a !== "autopilot").every((a) => new RegExp("^" + a + ":\\n   dark .*\\n   lit  ", "m").test(t)) && /the connectome network minus each control, dark \/ lit:/.test(t) && X.SPECS.every((s) => t.includes(aid(s) + ":\n   dark ")));
    ok("!! the lit-tank line counts how many random wirings and dense nets the connectome network beats, ties and is below in the lit tank", /lit tank: the connectome network beats \d+ OF 10 random wirings and \d+ OF 10 dense nets; ties \d+ and \d+; is below \d+ and \d+/.test(t));
    { const litLead = X.report(mkAu({ ...all(ers, 0.05, 0.05), ...all(denses, 0.05, 0.05), "network-Wip": { dark: () => 0.05, lit: (i) => 0.3 + wob(i, 0.02) } })).join("\n"), darkLead = X.report(mkAu({ ...all(ers, 0.05, 0.05), ...all(denses, 0.05, 0.05), "network-Wip": { dark: (i) => 0.3 + wob(i, 0.02), lit: () => 0.05 } })).join("\n");
      ok("!! the lit-tank line is exact: a connectome network that leads only lit beats 10 and 10, ties 0 and 0, is below 0 and 0 in the lit tank; one that leads only in the dark beats 0 and 0 and ties 10 and 10 there", litLead.includes("lit tank: the connectome network beats 10 OF 10 random wirings and 10 OF 10 dense nets; ties 0 and 0; is below 0 and 0") && darkLead.includes("lit tank: the connectome network beats 0 OF 10 random wirings and 0 OF 10 dense nets; ties 10 and 10; is below 0 and 0")); }
    ok("!! the six bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-6).every((l) => l.startsWith("BOTTOM LINE: ")) && /THE CONTROLS (LEARNED|DID NOT LEARN)/.test(L[L.length - 6]) && /LOST SUBS/.test(L[L.length - 1]));
    const bad = mkAu({}); bad.dark.autopilot.pop(); const Lb = X.report(bad);
    ok("!! a failed check says the verdicts are NOT WEIGHED, with one bottom line and no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !/means \(dark/.test(Lb.join("\n")));
}
sec("7. FLIGHT");
{
    const wip = JSON.parse(fs.readFileSync(new URL("../../brain/pilotSubWeightsWip.json", import.meta.url), "utf8")).weights;
    const champs = new Map(X.SPECS.map((s, i) => { const P = X.policyOf(s), h = Array.from(P.handWeights()).map((v) => v * (1 + 0.03 * (i + 1))); return [s, { weights: h, heldScore: -0.3, searches: [0, 1, 2, 3].map((k) => ({ k, seed: k, trainScore: 0, heldScore: 0 })) }]; }));
    const opt = { range: { from: 0, to: 1 }, seconds: 30 }, a = X.audit(wip, champs, opt), a2 = X.audit(wip, champs, opt);
    ok("!! an audit flies the twenty-two arms dark and lit on the ids and is deterministic (twice the same scores)", Object.keys(a.dark).length === 22 && Object.keys(a.lit).length === 22 && J(a.dark) === J(a2.dark) && J(a.lit) === J(a2.lit) && a.dark.autopilot.length === 2);
    ok("!! the controls are SEATED through their tank kinds on the real flights: a control built from the hand weights scaled by its own factor flies differently from the autopilot (the kind is flown, not the autopilot's fallback), and the connectome network flies differently from the autopilot", X.SPECS.every((s) => a.dark[aid(s)].some((r, i) => r.score !== a.dark.autopilot[i].score)) && a.dark["network-Wip"].some((r, i) => r.score !== a.dark.autopilot[i].score));
    ok("!! audit REFUSES a control champion with the wrong weight count (946 for a random wiring) instead of letting the tank fall back to the autopilot's own flight in silence", (() => { const bad = new Map(champs); bad.set("er:0", { ...champs.get("er:0"), weights: champs.get("er:0").weights.slice(1) }); try { X.audit(wip, bad, opt); return false; } catch (e) { return /er:0 takes 963 weights/.test(String(e.message)); } })());
    ok("!! the seven checks pass on the real audit", X.checksOf(a).every((c) => c.ok), J(X.checksOf(a).filter((c) => !c.ok).map((c) => c.name)));
}
sec("8. SOURCE");
{
    ok("!! the ids 5000 and 5199 appear once each; no clock, no random number, nothing read from the disk", code.split("5000").length === 2 && code.split("5199").length === 2 && !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
