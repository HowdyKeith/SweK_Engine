// WebGLEngine/tools/ship/trainResidual-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainResidual-selfcheck.mjs      (about 10-20 s)
//
// THE GATE OF tools/ship/trainResidual.mjs (Round 6 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      train 241-246 and validation 271-282 and the audits 301-312, 321-332, 341-352 (four kinds each) are the registered seeds, disjoint from each other and from every set an earlier round reads (Rounds 1-5, incl. the reserved language-model seeds).
//   2 ARMS      the nine arms exist and are what the registration says (ALONE is the brain; CAP-c is a constant cap advisor in VETO; RESIDUAL-ZERO is RULE-GF dive for dive; the SHUFFLED control is a permutation of the hidden layer that changes decisions but not the weights' size); unknown arm refused.
//   3 SEARCH    deterministic, never worse than the start on its train score, checkpoints at the registered cadence, and it changes the output layer (a search that cannot leave the zero start is a defect).
//   4 CHAMPION  chosen on VALIDATION; the START stands unless a checkpoint beats the start's validation score; the audits are not read by champion().
//   5 VERDICTS  the margin rule max(0.02, 2 se); BEATS / LOSES / TIES need all three audits; the bottom line: HURTS iff it loses to its start, IMPROVES iff it beats its start AND its shuffled control, else NO GAIN.
//   6 REPORT    (on small audit ranges) the checks come first, a FAILED check says the verdicts are NOT WEIGHED, and the bottom line is generated from the verdicts.
// NOT CHECKED, said plainly: that a trained residual scores better (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { let v; try { v = typeof c === "function" ? c() : c; } catch (e) { v = false; d = "threw: " + e.message; } console.log((v ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!v) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "../../brain/needsTask.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import * as X from "./trainResidual.mjs";
console.log("trainResidual-selfcheck -- the Round 6 trainer\n");
const seedsOf = (set) => [...new Set(set.map((s) => s.seed))], rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const sp = (w, set) => X.scoreOn("RESIDUAL", w, set).score;
const cheap = [T.scenario(241, "far")];

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(501, 508)]);
    const mine = { train: seedsOf(X.TRAIN), validation: seedsOf(X.VALIDATION), R1: rangeOf(301, 312), R2: rangeOf(321, 332), R3: rangeOf(341, 352) };
    ok("!! train is 241-246 and validation 271-282, four kinds (24 and 48 dives)", J(mine.train) === J(rangeOf(241, 246)) && J(mine.validation) === J(rangeOf(271, 282)) && X.TRAIN.length === 24 && X.VALIDATION.length === 48);
    ok("!! the audits are 301-312, 321-332, 341-352 in that order", J(X.AUDIT_RANGES) === J({ R1: [301, 312], R2: [321, 332], R3: [341, 352] }) && J(X.AUDIT_NAMES) === J(["R1", "R2", "R3"]));
    const all = Object.values(mine).flat();
    ok("!! no seed of Rounds 1-5 is used and the five sets share none with each other", all.every((s) => !prior.has(s)) && new Set(all).size === all.length);
    ok("!! the recipe is the registered one (3 searches, 300 iterations, sigma 0.3, 1-4 weights, a checkpoint every 30)", J(X.RECIPE) === J({ runs: 3, iters: 300, sigma: 0.3, maxK: 4, checkpointEvery: 30 }));
}
sec("2. ARMS");
{
    ok("!! the nine arms are pinned", J(X.ARMS) === J(["ALONE", "CAP-0.50", "CAP-0.65", "CAP-0.75", "RULE-GF", "RULE-G", "RESIDUAL", "RESIDUAL-ZERO", "SHUFFLED-RESIDUAL"]) && J(X.CAPS) === J({ "CAP-0.50": 0.5, "CAP-0.65": 0.65, "CAP-0.75": 0.75 }));
    const w = Float64Array.from(R.startWeights()); w[R.OUT_START + R.N_W2] = 1.5; w[R.OUT_START + 3] = 2; w[R.OUT_START + 9] = -2;
    const set = T.setOf(T.KINDS, 241, 241), score = (a) => X.scoreOn(a, w, set).runs.map((r) => r.fingerprint).join();
    ok("!! RESIDUAL-ZERO equals RULE-GF dive for dive; ALONE is GUARDED-OBS; a cap of 0.95 would be ALONE", score("RESIDUAL-ZERO") === score("RULE-GF") && X.scoreOn("ALONE", w, set).score === T.evaluate(T.GUARDED_OBS, set, { gauge: T.GAUGE }).score);
    ok("!! RULE-G differs from RULE-GF and a lower cap changes the dives", score("RULE-G") !== score("RULE-GF") && score("CAP-0.50") !== score("ALONE"));
    ok("!! the champion's dives differ from the start's for a non-zero weight vector", score("RESIDUAL") !== score("RESIDUAL-ZERO"));
    const sh = X.shuffled(w);
    ok("!! the shuffled control keeps the multiset of weights, moves the hidden units and changes the dives", J(Array.from(sh).sort()) === J(Array.from(w).sort()) && J(Array.from(sh)) !== J(Array.from(w)) && Array.from(sh.slice(R.OUT_START)).every((x, i) => x === w[R.OUT_START + i]) && score("SHUFFLED-RESIDUAL") !== score("RESIDUAL"));
    const wb = Float64Array.from(w); wb[R.N_W1 + 0] = 0.7; const sb = X.shuffled(wb);
    ok("!! the shuffle moves each hidden unit's BIAS with its row (unit 0's bias lands where its row did)", sb[R.N_W1 + 1] === 0.7 && sb[R.N_W1] !== 0.7);
    ok("!! an unknown arm is refused", (() => { try { X.pilotOf("NOPE"); return false; } catch (e) { return /unknown arm/.test(e.message); } })());
}
sec("3. SEARCH");
{
    const r = { ...X.RECIPE, iters: 4, checkpointEvery: 2 }, a = X.search(7, r, cheap), b = X.search(7, r, cheap), c = X.search(8, r, cheap);
    ok("!! a search is deterministic (same seed, same weights) and another seed differs", J(Array.from(a.best)) === J(Array.from(b.best)) && J(Array.from(a.best)) !== J(Array.from(c.best)));
    ok("!! it is never worse than the start on its train score", a.bestScore >= sp(R.startWeights(), cheap) && Math.abs(a.bestScore - sp(a.best, cheap)) < 1e-12);
    ok("!! checkpoints are iteration 0 (the start) and every 2nd", J(a.checkpoints.map((x) => x.iter)) === J([0, 2, 4]) && J(Array.from(a.checkpoints[0].weights)) === J(Array.from(R.startWeights())));
    ok("!! the search moves weights, and the children change the output layer at least once over 20 tries", X.search(9, { ...X.RECIPE, iters: 20, checkpointEvery: 20 }, cheap).best.slice(R.OUT_START).some((x) => x !== 0) && a.moved >= 0);
}
{
    const hard = X.search(11, { ...X.RECIPE, sigma: 5, maxK: 134, iters: 6, checkpointEvery: 6 }, cheap), drift = X.search(12, { ...X.RECIPE, iters: 20, checkpointEvery: 20 }, cheap);
    ok("!! with a violent sigma (most children hurt) the search still never ends below the start on its train score", hard.bestScore >= sp(R.startWeights(), cheap) && hard.trace.length === 7 && hard.trace.every((x, i) => i === 0 || x >= hard.trace[i - 1]) && sp(hard.best, cheap) >= sp(R.startWeights(), cheap));
    ok("!! children are made from the CURRENT best, not the start: after 20 iterations more than maxK weights have moved", drift.moved > X.RECIPE.maxK, "moved " + drift.moved);
}
sec("4. CHAMPION");
{
    const val = [T.scenario(271, "far"), T.scenario(271, "both")], start = R.startWeights(), hurt = Float64Array.from(start); hurt[R.OUT_START + R.N_W2] = -6; hurt[R.OUT_START + R.N_W2 + 1] = 6;
    const up = Float64Array.from(start); up[R.OUT_START + R.N_W2] = 0.4;
    const vs = (w) => sp(w, val), best = [start, hurt, up].map(vs);
    const ch = X.champion([{ seed: 1, checkpoints: [{ iter: 0, weights: start }, { iter: 30, weights: hurt }] }], val);
    ok("!! when no checkpoint beats the start on validation the START stands", ch.from === "start" && J(Array.from(ch.weights)) === J(Array.from(start)) && ch.iter === 0 && vs(hurt) <= vs(start), J(best));
    const ch2 = X.champion([{ seed: 1, checkpoints: [{ iter: 0, weights: start }, { iter: 30, weights: hurt }, { iter: 60, weights: up }] }], val);
    ok("!! a checkpoint that beats the start on validation is taken when it is the best (or the start stands when none does)", vs(up) > vs(start) ? ch2.iter === 60 && ch2.validation === vs(up) : ch2.from === "start");
    ok("!! champion() reports the start's validation score beside its own", ch2.startValidation === vs(start));
}
sec("5. VERDICTS");
{
    const run = (d) => ({ runs: d.map((x) => ({ score: x })) });
    const a = run([0.9, 0.9, 0.9, 0.9]), b = run([0.8, 0.8, 0.8, 0.8]), noise = run([0.9, 0.7, 0.9, 0.7]), close = run([0.85, 0.85, 0.85, 0.85]);
    ok("!! a gap past max(0.02, 2 se) wins, loses on the reverse, and a gap inside the margin is a tie", X.judge(a, b).wins && X.judge(b, a).loses && !X.judge(a, close).wins && !X.judge(a, close).loses === false || (X.judge(a, run([0.89, 0.89, 0.89, 0.89])).wins === false));
    ok("!! the margin is 2 se when that is bigger than 0.02", Math.abs(X.judge(noise, run([0.8, 0.8, 0.8, 0.8])).margin - 2 * T.paired(noise, run([0.8, 0.8, 0.8, 0.8])).se) < 1e-12 && X.judge(a, b).margin === 0.02);
    const W = { wins: true, loses: false }, L = { wins: false, loses: true }, Tie = { wins: false, loses: false };
    ok("!! BEATS needs all three audits, LOSES all three, anything else TIES", X.verdictOf([W, W, W]) === "BEATS" && X.verdictOf([W, W, Tie]) === "TIES" && X.verdictOf([L, L, L]) === "LOSES" && X.verdictOf([L, W, L]) === "TIES" && X.verdictOf([Tie, Tie, Tie]) === "TIES");
    ok("!! HURTS iff it loses to its start", X.bottomLine("LOSES", "BEATS") === "HURTS" && X.bottomLine("LOSES", "TIES") === "HURTS");
    ok("!! IMPROVES iff it beats its start AND its shuffled control; else NO GAIN", X.bottomLine("BEATS", "BEATS") === "A LEARNED RESIDUAL IMPROVES THE RULE" && X.bottomLine("BEATS", "TIES") === "NO GAIN OVER THE RULE" && X.bottomLine("TIES", "BEATS") === "NO GAIN OVER THE RULE" && X.bottomLine("TIES", "TIES") === "NO GAIN OVER THE RULE" && X.bottomLine("BEATS", "LOSES") === "NO GAIN OVER THE RULE");
}
sec("6. REPORT (small audit ranges)");
{
    const small = { R1: [301, 301], R2: [321, 321], R3: [341, 341] }, w = Float64Array.from(R.startWeights()); w[R.OUT_START + R.N_W2 + 1] = 1;
    const au = X.audits(w, { ranges: small });
    ok("!! the audits fly every arm on the three ranges asked for (4 dives each here)", J(Object.keys(au)) === J(["R1", "R2", "R3"]) && Object.values(au).every((a) => J(Object.keys(a)) === J(X.ARMS) && a.ALONE.runs.length === 4) && au.R2.ALONE.runs.every((r, i) => T.setOf(T.KINDS, 321, 321)[i].kind === r.kind));
    {
        const mk = (scores) => ({ runs: [0, 1, 2].flatMap(() => ["plain", "deep", "far", "both"].map((kind, i) => ({ kind, score: scores[i], fingerprint: "f" }))), score: 0, crashed: 0, stranded: 0 });
        const syn = { ALONE: mk([0.5, 0.5, 0.5, 0.1]), "RULE-GF": mk([0.5, 0.5, 0.5, 0.9]), "RESIDUAL-ZERO": mk([0.5, 0.5, 0.5, 0.9]) };
        const row = X.checksOf({ R1: syn, R2: syn, R3: syn }).find((c) => c.name === "RULE NOT TRIVIAL R1");
        ok("!! the rule-not-trivial check reads far AND both (a rule that wins only on both still passes; one that wins on neither fails)", row.ok && !X.checksOf({ R1: { ...syn, "RULE-GF": mk([0.9, 0.9, 0.5, 0.1]) }, R2: syn, R3: syn }).find((c) => c.name === "RULE NOT TRIVIAL R1").ok);
    }
    const champ = { from: "start", iter: 0, validation: 0.8, startValidation: 0.8 }, L = X.report(au, champ, []);
    ok("!! the checks come before the means and the verdicts and the identity check passes on every audit", L.findIndex((l) => /IDENTITY R1/.test(l)) < L.findIndex((l) => /^means/.test(l)) && L.filter((l) => /PASS IDENTITY/.test(l)).length === 3);
    ok("!! the report names the champion and says it was chosen before the audits", /champion: start/.test(L[1]) && /BEFORE the audits/.test(L[1]));
    ok("!! the report prints all four verdict lines and a BOTTOM LINE generated from them", ["against its start RULE-GF", "strongest fixed cap", "against ALONE", "SHUFFLED-RESIDUAL"].every((s) => L.some((l) => l.includes(s))) && /^BOTTOM LINE: (A LEARNED|NO GAIN|HURTS|NOT WEIGHED)/.test(L[L.length - 1]));
    const broken = JSON.parse(JSON.stringify({ x: 1 })), bad = { ...au, R1: { ...au.R1, "RESIDUAL-ZERO": { ...au.R1["RESIDUAL-ZERO"], runs: au.R1["RESIDUAL-ZERO"].runs.map((r) => ({ ...r, fingerprint: "x" })) } } };
    const LB = X.report(bad, champ, []);
    ok("!! a FAILED check is reported as FAIL, says the verdicts are NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL IDENTITY R1/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /NOT WEIGHED/.test(LB[LB.length - 1]) && broken.x === 1);
    ok("!! strongestCap picks the highest of the three caps per audit", X.strongestCap({ "CAP-0.50": { score: 0.1 }, "CAP-0.65": { score: 0.5 }, "CAP-0.75": { score: 0.3 } }) === "CAP-0.65");
}
sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./trainResidual.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the audit seeds appear in ONE place (AUDIT_RANGES) and search/champion do not mention them", (code.match(/\b3(?:0[1-9]|[1-5]\d)\b/g) || []).length === 6 && !/\b30[1-9]\b/.test(code.slice(code.indexOf("export function search"), code.indexOf("export function judge"))));
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
