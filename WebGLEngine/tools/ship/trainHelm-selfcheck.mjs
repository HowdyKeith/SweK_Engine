// WebGLEngine/tools/ship/trainHelm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainHelm-selfcheck.mjs      (about a minute: some sixty short lists of fights)
//
// THE HELM'S TRAINER, HELD TO WHAT IT SAYS IT DOES. tools/ship/trainHelm.mjs searches for a brain/helmPolicy.mjs network that leads the rule in brain/battleshipDuel.mjs pairs, picks a champion on held-out pairs, reads the audit once and writes a file only for a champion that qualifies. Nine things hold it:
//
//   1  THE SETS            8 train, 12 held-out and 16 audit pairs, every kind in each, and no seed in two of them
//   2  WHERE THE WEIGHTS ARE  encoderAt, outputAt and biasAt against the network's own forward(): a path of two weights answers the feature it reads, a bias answers always
//   3  THE CHILDREN        a bias child moves one of the four biases a helm reads and never the fifth; a path child moves one hidden unit's weight from a feature and THAT unit's weight into one of the four outputs; a tune child moves only weights that already differ (a path when none does); the three occur a third each
//   4  THE SCORE           the zero weights score EXACTLY 0 against the rule, winning and losing no pair; a helm that is not the rule does not; the side's options reach both sides
//   5  THE SEARCH          on a made-up score: it climbs, takes strict improvements only, is the same search for the same seed, and starts from the zero weights
//   6  THE PRUNE           on a made-up score: weights that buy nothing go back to zero, weights that are needed stay
//   7  THE CHOICE          qualifies() on made-up numbers, reason by reason; finish() takes the best held-out record (NOT the best train score: seed 9 has that; the lower seed on a tie), flies the audit for it, refuses no records and a short record by name
//   8  A WHOLE SEARCH      search() on one train pair and one held-out pair, four iterations: a record a file can hold, the same twice; the noise study counts what leads
//   9  THE FRONT DOOR      the options a command may pass, the file that would be written (peerBrain takes it back as a helm), the report lines, the export list
//      (and the LARGER AUDIT of 2026-11-14, tools/ship/takeHelmAudit.mjs: the four readings from the kept flights, which the file quotes)
//   10 THE FILE THAT SHIPS    brain/helmWeightsDefault.json is the champion of the four searches in brain/helmSearchRecords.jsonl (the best held-out record's weights, to the bit), and the held-out and audit lines its `by` quotes are what evaluate() gives for it now
//
// SABOTAGE LOG: (28 mutants, each applied to a COPY of tools/ship/trainHelm.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   H1 the held-out pairs share a seed with the train pairs 2 | H2 the fifth output is moved 2 | H3 the encoder is indexed by feature first 2 | H4 the output weights are indexed by unit first 2 | H5 the biases are off by one 1 | H6 the rule's side has the network too 3 | H7 the options do not reach the sides 1
//   H8 the score is the sum of the leads 1 | H9 a pair is won on any lead 1 | H10 a path's two weights are on different units 1 | H11 a tune child moves any weight 2 | H12 no bias children 4 | H13 an equal child replaces its parent 1 | H14 the search ignores `start` 1 | H15 the prune keeps what buys nothing 1
//   H16 the prune runs on 1 | H17 a held-out lead of 0 qualifies 1 | H18 the audit lead is not asked 1 | H19 audit pairs lost are not asked 1 | H20 the champion is the best on TRAIN 2 | H21 a tie goes to the higher seed 2 | H22 the audit is flown with the zero weights 1 | H23 the search's held-out is its train pairs 1
//   H24 the record holds the unpruned weights 1 | H25 the file's score is the audit's 1 | H26 the noise study draws one path 1 | H27 the others are flown on the rule's own settings 1 | H28 an unknown option is let through 1
// THREE WENT 0 RED THE FIRST TIME AND WERE GAPS IN THE GATE, closed and re-run (the counts above are the re-run's): H20 -- every made-up record had the same train score, so choosing on it chose the same one (seed 9 now has the best train score and the worst held-out); H24 -- four iterations of real fights
// left the prune nothing to put back, so pruned and unpruned were the same weights (search() takes a made-up train score from the gate, `sets.scoreFn`, on which a path's read-out weight buys nothing); H26 -- one path moves two weights and the row asked only for two to six (most helms must now have five or six).
// The first sweep ran before section 10 was written and the three were re-run after it; the other twenty-five were not re-run against section 10. NOT CHECKED: that the searches in brain/helmSearchRecords.jsonl are what the command gives again (four searches of about two hours of one core each; search() is
// deterministic and section 8 flies one twice), and the command file itself (tools/ship/trainHelmCmd.mjs: argument plumbing, run by hand).
"use strict";
import fs from "node:fs";
import * as T from "./trainHelm.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const F = 12, H = 34, OUT = F * H + H + HP.REC_EDGES, Z = () => HP.zeroWeights(), diff = (a, b) => { const idx = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) idx.push(i); return idx; };
const ONE = [{ kind: "head-on", seed: 2 }], TWO = [{ kind: "broadside", seed: 3 }];

console.log("trainHelm-selfcheck -- the helm's trainer\n");

console.log("1. THE SETS");
section(() => {
    const seeds = (l) => [...new Set(l.map((p) => p.seed))], all = [T.TRAIN_PAIRS, T.HELD_OUT_PAIRS, T.AUDIT_PAIRS];
    ok("8 train, 12 held-out and 16 audit pairs; each set has every kind once for each of its seeds", all.map((l) => l.length).join() === "8,12,16" && all.every((l) => D.KINDS.every((k) => l.filter((p) => p.kind === k).length === seeds(l).length)));
    ok("!! no seed is in two sets (31-32, 41-43, 51-54)", seeds(T.TRAIN_PAIRS).join() === "31,32" && seeds(T.HELD_OUT_PAIRS).join() === "41,42,43" && seeds(T.AUDIT_PAIRS).join() === "51,52,53,54");
    ok("the fight is the bow-on rule behind regular gunners and the file is brain/helmWeightsDefault.json for the policy helmPolicy", T.HELM_RULE === "face" && T.GUNNERS === "regular" && T.POLICY_ID === "helmPolicy" && /brain[\\/]helmWeightsDefault\.json$/.test(T.DEFAULT_OUT));
});

console.log("2. WHERE THE WEIGHTS ARE");
section(() => {
    const x = new Float32Array(F); x[0] = 1; x[5] = 0.5;
    const w = Z(); w[T.encoderAt(7, 5)] = 2; w[T.outputAt(2, 7)] = 1;
    ok("a path -- feature 5 into hidden unit 7 with weight 2, unit 7 into output 2 with weight 1 -- answers tanh(2 x 0.5) on output 2 and nothing on the others; with the feature at 0 it answers nothing", Math.abs(HP.forward(w, x)[2] - Math.tanh(1)) < 1e-6 && HP.forward(w, x).filter((v) => v !== 0).length === 1 && (() => { const y = Float32Array.from(x); y[5] = 0; return HP.forward(w, y).every((v) => v === 0); })());
    const b = Z(); b[T.biasAt(3)] = 0.5;
    ok("a bias of 0.5 on output 3 (the throttle) answers tanh(0.5) there whatever is shown", Math.abs(HP.forward(b, x)[3] - Math.tanh(0.5)) < 1e-6 && Math.abs(HP.forward(b, new Float32Array(F))[3] - Math.tanh(0.5)) < 1e-6 && T.biasAt(4) === HP.WEIGHT_COUNT - 1 && T.encoderAt(0, 0) === 0 && T.outputAt(0, 0) === OUT);
});

console.log("3. THE CHILDREN");
section(() => {
    const biases = new Set(), n = 300; let okB = true, okP = true; const outs = new Set(), feats = new Set(), units = new Set();
    for (let s = 1; s <= n; s++) {
        const b = diff(T.biasChild(Z(), 0.6, mulberry(s)), Z()); okB = okB && b.length === 1 && b[0] >= T.biasAt(0) && b[0] <= T.biasAt(3); biases.add(b[0]);
        const p = diff(T.pathChild(Z(), 0.6, mulberry(s)), Z()); if (p.length !== 2 || p[0] >= F * H || p[1] < OUT || p[1] >= OUT + 4 * H) { okP = false; continue; }
        const h = Math.floor(p[0] / F); okP = okP && (p[1] - OUT) % H === h; units.add(h); feats.add(p[0] % F); outs.add(Math.floor((p[1] - OUT) / H));
    }
    ok("!! a bias child moves exactly one weight, one of the four biases a helm reads, each of the four occurs in 300 and the fifth (the pilot's trigger) never", okB && biases.size === 4 && !biases.has(T.biasAt(4)));
    ok("!! a path child moves exactly two weights -- a hidden unit's weight from a feature and THE SAME unit's weight into an output -- over all 34 units, all 12 features and the four outputs a helm reads, never the fifth", okP && units.size === H && feats.size === F && [...outs].sort().join() === "0,1,2,3");
    const base = Z(); base[5] = 1; base[T.biasAt(1)] = -1; base[T.outputAt(0, 3)] = 0.5; const allowed = new Set([5, T.biasAt(1), T.outputAt(0, 3)]); let okT = true; const counts = new Set();
    for (let s = 1; s <= n; s++) { const d = diff(T.tuneChild(base, 0.6, mulberry(s), 3), base); okT = okT && d.length >= 1 && d.length <= 3 && d.every((i) => allowed.has(i)); counts.add(d.length); }
    ok("a tune child moves one to three of the weights that already differ from zero and no other; from the zero weights it is a path child (two weights)", okT && counts.has(1) && counts.has(2) && T.movedOf(base).join() === [5, T.outputAt(0, 3), T.biasAt(1)].join() && diff(T.tuneChild(Z(), 0.6, mulberry(4), 3), Z()).length === 2);
    const kinds = { bias: 0, path: 0, tune: 0 }; for (let s = 1; s <= 600; s++) { const d = diff(T.child(base, 0.6, mulberry(s), 3), base); if (d.every((i) => allowed.has(i)) && !(d.length === 1 && d[0] >= T.biasAt(0) && d[0] !== T.biasAt(1))) kinds.tune++; else if (d.length === 1) kinds.bias++; else kinds.path++; }
    ok("child() is each of the three about a third of the time (600 children: every kind between 120 and 280), the same child for the same generator, and never touches its parent", Object.values(kinds).every((k) => k > 120 && k < 280) && T.child(base, 0.6, mulberry(9), 3).join() === T.child(base, 0.6, mulberry(9), 3).join() && T.movedOf(base).length === 3, JSON.stringify(kinds));
});

console.log("4. THE SCORE");
section(() => {
    const zero = T.evaluate(Z(), [...ONE, ...TWO]);
    ok("!! THE RULE SCORES EXACTLY 0: the zero weights against the rule alone lead by exactly nothing in each pair and win and lose none", zero.score === 0 && zero.won === 0 && zero.lost === 0 && zero.runs.length === 2 && zero.runs.every((r) => r.lead === 0) && zero.runs[0].kind === "head-on" && zero.runs[1].seed === 3);
    const spin = Z(); spin[T.biasAt(2)] = 3; const s = T.evaluate(spin, ONE), s2 = T.evaluate(spin, ONE, { cannon: false }), s3 = T.evaluate(spin, ONE, { gunners: "green" });
    ok("a helm that always turns hard about the deck's axis is not the rule: its lead is not 0, the pair is counted won or lost, and the score is the mean of the leads", s.score !== 0 && s.won + s.lost === 1 && s.score === s.runs[0].lead && Math.abs(T.evaluate(spin, [...ONE, ...TWO]).score - (s.score + T.evaluate(spin, TWO).score) / 2) < 1e-12, T.describeEval(s));
    ok("the side's options reach the fight: with no cannon on either side, and behind green gunners, the same helm's lead is another number", s2.score !== s.score && s3.score !== s.score && s2.score !== s3.score, `${s.score.toFixed(3)}, ${s2.score.toFixed(3)}, ${s3.score.toFixed(3)}`);
    ok("describeEval: the lead with its sign and the pairs", T.describeEval({ score: 0.1234, won: 3, lost: 1, runs: [1, 2, 3, 4, 5] }) === "+0.123 (3 pairs won, 1 lost of 5)" && T.describeEval({ score: -0.5, won: 0, lost: 2, runs: [1, 2] }) === "-0.500 (0 pairs won, 2 lost of 2)");
});

console.log("5. THE SEARCH (a made-up score: how near the throttle's bias is to 0.5, less the size of every other weight)");
section(() => {
    const target = (w) => { let s = -Math.abs(w[T.biasAt(3)] - 0.5); for (let i = 0; i < w.length; i++) if (i !== T.biasAt(3)) s -= 0.01 * Math.abs(w[i]); return s; };
    let calls = 0; const seen = []; const r = T.train({ seed: 11, iters: 120, scoreFn: (w) => { calls++; return target(w); }, onIter: (i, st) => seen.push(st.score) });
    ok("it starts from the zero weights (-0.5), climbs (the throttle's bias ends within 0.15 of 0.5), and scores the parent once and each child once", r.history[0].score === -0.5 && r.trainScore > -0.15 && Math.abs(r.weights[T.biasAt(3)] - 0.5) < 0.15 && calls === 121 && r.iters === 120);
    ok("!! strict improvements only: the best score never falls, it rises exactly `improved` times, and the weights returned score what it says", seen.every((v, i) => !i || v >= seen[i - 1]) && seen.filter((v, i) => v > (i ? seen[i - 1] : -0.5)).length === r.improved && r.improved >= 2 && target(r.weights) === r.trainScore);
    ok("a flat score is never climbed: no child replaces the zero weights", (() => { const f = T.train({ seed: 3, iters: 40, scoreFn: () => 1 }); return f.improved === 0 && T.movedOf(f.weights).length === 0; })());
    const again = T.train({ seed: 11, iters: 120, scoreFn: target }), other = T.train({ seed: 12, iters: 120, scoreFn: target });
    ok("the same seed is the same search to the bit, another seed another; the history is every twentieth iteration and the last", again.weights.join() === r.weights.join() && other.weights.join() !== r.weights.join() && r.history.map((h) => h.i).join() === "0,20,40,60,80,100,120" && r.history[6].score === r.trainScore);
    const st = Z(); st[T.biasAt(3)] = 0.5;
    ok("`start` is where it starts from", T.train({ seed: 1, iters: 5, start: st, scoreFn: target }).history[0].score === 0);
});

console.log("6. THE PRUNE (the same made-up score, without the penalty: only the throttle's bias matters)");
section(() => {
    const score = (w) => -Math.abs(w[T.biasAt(3)] - 0.5), w = Z(); w[T.biasAt(3)] = 0.5; w[3] = 1; w[T.outputAt(1, 4)] = -2; w[T.biasAt(0)] = 0.3;
    const p = T.prune(w, { scoreFn: score });
    ok("!! three weights that buy nothing go back to zero and the one that is needed stays; the parent is not touched", p.moved === 4 && p.kept === 1 && T.movedOf(p.weights).join() === String(T.biasAt(3)) && p.weights[T.biasAt(3)] === 0.5 && p.trainScore === 0 && T.movedOf(w).length === 4 && p.passes === 2);
    const need = (v) => (v[3] !== 0 && v[T.outputAt(1, 4)] !== 0 ? 1 : 0) - 0.001 * T.movedOf(v).length, q = T.prune(w, { scoreFn: need });
    ok("two weights that are only worth anything together both stay, and the rest go", T.movedOf(q.weights).join() === [3, T.outputAt(1, 4)].join() && q.kept === 2);
    ok("at most `maxPasses` passes", T.prune(w, { scoreFn: score, maxPasses: 1 }).passes === 1);
});

console.log("7. THE CHOICE");
section(() => {
    const r = (h, a, hw = 2, hl = 1, aw = 2, al = 1) => ({ heldOut: { score: h, won: hw, lost: hl }, audit: { score: a, won: aw, lost: al } });
    ok("qualifies: a lead on both sets with no more pairs lost than won is in; a held-out lead of 0, an audit lead below 0, more held-out pairs lost than won and more audit pairs lost than won are each out with their own reason, and all four at once are four reasons", T.qualifies(r(0.1, 0.05)).ok && T.qualifies(r(0.1, 0.05, 1, 1, 0, 0)).ok
        && /held-out lead 0\.000 is not above/.test(T.qualifies(r(0, 0.1)).reasons.join()) && T.qualifies(r(0, 0.1)).reasons.length === 1 && /audit lead -0\.010 is not above/.test(T.qualifies(r(0.1, -0.01)).reasons.join()) && /held-out pairs: 1 won is behind 2 lost/.test(T.qualifies(r(0.1, 0.1, 1, 2)).reasons.join())
        && /audit pairs: 0 won is behind 1 lost/.test(T.qualifies(r(0.1, 0.1, 2, 1, 0, 1)).reasons.join()) && T.qualifies(r(-1, -1, 0, 1, 0, 1)).reasons.length === 4 && !T.qualifies(r(-1, -1, 0, 1, 0, 1)).ok);
    const spin = Z(); spin[T.biasAt(2)] = 3; const rec = (seed, score, w = Z()) => ({ seed, iters: 4, sigma: 0.6, maxK: 3, passes: 2, weights: Array.from(w), train: seed === 9 ? 5 : 0.2, improved: 1, moved: 1, kept: 1, heldOut: { score, won: 1, lost: 0, runs: [{}] } });
    const lines = [], f = T.finish([rec(7, 0.1), rec(5, 0.4, spin), rec(6, 0.4), rec(9, -0.2)], (m) => lines.push(m), { audit: ONE });
    ok("!! finish takes the record with the best held-out score -- not seed 9, whose TRAIN score is far the best and whose held-out is the worst -- the LOWER seed on a tie (seed 5 of 5, 6, 7, 9), and flies the audit for it: the audit is evaluate() of ITS weights on the audit pairs", f.champion.seed === 5 && f.runs.map((x) => x.seed).join() === "5,6,7,9" && f.champion.weights instanceof Float32Array && f.champion.audit.score === T.evaluate(spin, ONE).score && f.champion.audit.score !== 0);
    ok("... the verdict is qualifies() of the champion, and what it does where it was not trained is read on the same audit pairs: the broadside rule, no cannon, green gunners", f.verdict.ok === T.qualifies(f.champion).ok && Object.keys(f.others).join() === "correcting the broadside rule,no cannon on either side,green gunners" && f.others["no cannon on either side"].score === T.evaluate(spin, ONE, { cannon: false }).score && f.others["correcting the broadside rule"].score === T.evaluate(spin, ONE, { rule: "broadside" }).score && lines.length === 5 && /^champion \(seed 5, picked on held-out of 4 searches\)/.test(lines[0]) && lines[4].startsWith(f.verdict.ok ? "QUALIFIES" : "DOES NOT QUALIFY: ") && !f.verdict.ok);
    ok("no records, and a record with a weight missing or no held-out result, are refused by name", throwsWith(() => T.finish([]), /no search records to choose from/) && throwsWith(() => T.finish([{ ...rec(1, 0), weights: [1, 2] }]), /a record needs 930 weights and its held-out result \(seed 1\)/) && throwsWith(() => T.finish([{ ...rec(2, 0), heldOut: null }]), /seed 2/));
});

console.log("8. A WHOLE SEARCH (one train pair, one held-out pair, four iterations)");
section(() => {
    const lines = [], a = T.search({ seed: 77, iters: 4 }, (m) => lines.push(m), { train: ONE, heldOut: TWO }), b = T.search({ seed: 77, iters: 4 }, () => {}, { train: ONE, heldOut: TWO });
    ok("!! a record a file can hold (plain JSON: 930 weights as an array, the recipe, the scores) and the same record twice; its train score is evaluate() of its weights on the train pair and its held-out result on the held-out pair", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(JSON.parse(JSON.stringify(a))) === JSON.stringify(a) && Array.isArray(a.weights) && a.weights.length === 930 && a.seed === 77 && a.iters === 4 && a.sigma === 0.6 && a.passes === 2
        && a.train === T.evaluate(Float32Array.from(a.weights), ONE).score && a.heldOut.score === T.evaluate(Float32Array.from(a.weights), TWO).score && a.train >= 0 && a.kept <= a.moved && a.kept === T.movedOf(a.weights).length && /^ {2}seed 77: train /.test(lines[lines.length - 1]), `train ${a.train.toFixed(3)}, ${a.improved} improvements, ${a.kept} weights kept, held-out ${T.describeEval(a.heldOut)}`);
    const made = (w) => -Math.abs(w[T.biasAt(3)] - 0.5) + (T.movedOf(w).some((i) => i < F * H) ? 0.2 : 0), c = T.search({ seed: 78, iters: 60 }, () => {}, { train: ONE, heldOut: TWO, scoreFn: made });
    ok("!! THE RECORD HOLDS THE PRUNED WEIGHTS: on a made-up train score that pays for any encoder weight and for the throttle's bias and for nothing else, the search moves weights the prune puts back (a path's read-out weight buys nothing), and what the record holds is what is left -- encoder weights and that bias only", c.moved > c.kept && c.kept === T.movedOf(c.weights).length && T.movedOf(c.weights).every((i) => i < F * H || i === T.biasAt(3)) && c.train === made(Float32Array.from(c.weights)) && c.heldOut.score === T.evaluate(Float32Array.from(c.weights), TWO).score, `${c.moved} moved, ${c.kept} kept`);
    const seen = [], n = T.noiseStudy({ n: 6, seed: 5, scoreFn: (w) => { seen.push(T.movedOf(w).length); return w[T.movedOf(w)[0]]; } }), m = T.noiseStudy({ n: 6, seed: 5, scoreFn: (w) => w[T.movedOf(w)[0]] });
    ok("the noise study: six random helms of three paths each (never more than six weights moved, and five or six in most), how many score above the rule's 0, the best and the mean -- and the same six for the same seed", n.n === 6 && n.leads.length === 6 && seen.every((k) => k >= 2 && k <= 6) && seen.filter((k) => k >= 5).length >= 4 && n.ahead === n.leads.filter((x) => x > 0).length && n.ahead >= 1 && n.ahead <= 5 && n.best === Math.max(...n.leads) && Math.abs(n.mean - n.leads.reduce((x, y) => x + y, 0) / 6) < 1e-12 && n.leads.join() === m.leads.join(), `${n.ahead} of 6 ahead`);
});

console.log("9. THE FRONT DOOR");
section(() => {
    const o = T.parseArgs(["--seed", "5002", "--iters", "9", "--record", "r.json", "--write"]);
    ok("parseArgs: the recipe unless said otherwise; an option it does not know, a value that is missing and a number that is not one are refused", o.seed === 5002 && o.iters === 9 && o.sigma === 0.6 && o.record === "r.json" && o.write === true && o.out === T.DEFAULT_OUT && T.parseArgs([]).runs === 4 && throwsWith(() => T.parseArgs(["--iter", "3"]), /unknown option "--iter"/) && throwsWith(() => T.parseArgs(["--seed"]), /--seed needs a value/) && throwsWith(() => T.parseArgs(["--seed", "x"]), /--seed needs a number/) && throwsWith(() => T.parseArgs(["go"]), /unexpected argument "go"/));
    const spin = Z(); spin[T.biasAt(2)] = 3; const ev = { score: 0.25, won: 2, lost: 1, runs: [1, 2, 3] }, result = { champion: { seed: 5001, iters: 160, sigma: 0.6, maxK: 3, passes: 2, kept: 1, weights: spin, heldOut: ev, audit: { ...ev, score: 0.125 } }, runs: [{ seed: 5001 }, { seed: 5000 }], others: { "no cannon on either side": ev } };
    const blob = T.blobOf(result), back = PB.importBrain(PB.describePolicy("helmPolicy", HP), blob);
    ok("!! the file that would be written is a swek-brain-v1 brain for helmPolicy that peerBrain takes back with the same 930 weights, scored by the held-out lead, and its `by` quotes the recipe, the held-out and audit lines and what it did where it was not trained", blob.format === "swek-brain-v1" && blob.policy === "helmPolicy" && back.ok && back.weights.join() === spin.join() && blob.score === 0.25
        && blob.by.includes("seed 5001 of 2 searches (5000,5001)") && blob.by.includes("1 of 930 weights differ from zero") && blob.by.includes(`champion picked on held-out (${D.KINDS.join(", ")} x seeds 41,42,43): +0.250 (2 pairs won, 1 lost of 3)`) && blob.by.includes("read once: +0.125 (2 pairs won, 1 lost of 3)") && blob.by.includes("no cannon on either side +0.250") && D.sideFromBrains("s", [blob]).seated[0].role === "helm");
    ok("the report lines say the recipe and the sets as the constants have them", T.reportLines().length === 2 && T.reportLines()[0].includes("4 searches of 160 iterations from seed 5000, sigma 0.6") && T.reportLines()[1].includes("8 train, 12 held-out and 16 audit pairs"));
    ok("the export list", Object.keys(T).sort().join() === "AUDIT_PAIRS,DEFAULT_OUT,GUNNERS,HELD_OUT_PAIRS,HELM_RULE,POLICY_ID,RECIPE,TRAIN_PAIRS,biasAt,biasChild,blobOf,child,describeEval,describeOthers,encoderAt,evaluate,finish,movedOf,noiseStudy,outputAt,parseArgs,pathChild,prune,qualifies,reportLines,search,train,tuneChild");
});

console.log("10. THE FILE THAT SHIPS (twenty-eight pairs flown again)");
section(() => {
    const J = (f) => fs.readFileSync(new URL("../../brain/" + f, import.meta.url), "utf8"), blob = JSON.parse(J("helmWeightsDefault.json")), back = PB.importBrain(PB.describePolicy("helmPolicy", HP), blob), recs = J("helmSearchRecords.jsonl").trim().split("\n").map((l) => JSON.parse(l));
    const best = recs.slice().sort((a, b) => b.heldOut.score - a.heldOut.score || a.seed - b.seed)[0];
    ok("the file is a helmPolicy brain peerBrain takes; four search records (seeds 5000-5003, the recipe's) are kept beside it and the file's weights are the best held-out record's to the bit; they differ from the rule in the number of weights its `by` says", back.ok && recs.map((r) => r.seed).join() === "5000,5001,5002,5003" && recs.every((r) => r.iters === T.RECIPE.iters && r.sigma === T.RECIPE.sigma) && blob.weights.join() === best.weights.join() && blob.by.includes(`seed ${best.seed} of 4 searches (5000,5001,5002,5003)`) && blob.by.includes(`${T.movedOf(back.weights).length} of 930 weights differ from zero`) && T.movedOf(back.weights).length === best.kept);
    const held = T.evaluate(back.weights, T.HELD_OUT_PAIRS), audit = T.evaluate(back.weights, T.AUDIT_PAIRS);
    ok("!! flown again, the champion's held-out and audit results are the ones the file quotes and the record holds, and it QUALIFIES: it leads the rule on both sets and wins more pairs than it loses on each", blob.by.includes(`: ${T.describeEval(held)}; audit`) && blob.by.includes(`read once: ${T.describeEval(audit)}`) && held.score === best.heldOut.score && blob.score === Number(held.score.toFixed(3)) && T.qualifies({ heldOut: held, audit }).ok && held.score > 0.5 && audit.score > 0.5, `held-out ${T.describeEval(held)} | audit ${T.describeEval(audit)}`);
    const rd = (a) => J(`rig-results/helmAudit/${a}.jsonl`).trim().split("\n").map((l) => JSON.parse(l)), st = (rows) => { const xs = rows.map((x) => x.lead), n = xs.length, m = xs.reduce((p, q) => p + q, 0) / n, se = Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (n - 1) / n); return { n, m, se, z: m / se }; };
    const H = { trained: st(rd("trained")), nc: st(rd("no-cannon")), bs: st(rd("broadside")), gr: st(rd("green")) }, quote = (x) => `${x.m >= 0 ? "+" : ""}${x.m.toFixed(3)} (se ${x.se.toFixed(3)}`;
    ok("!! *** THE LARGER AUDIT, from its kept flights (300 pairs an arm, seeds 10001-10075): as it was trained the helm LEADS the rule (z above 2) by a little over half what its 16 audit pairs read; with no cannon it CANNOT BE TOLD from the rule; correcting the broadside rule it TRAILS; behind green sights it LEADS -- and the file says each number *** ", H.trained.n === 300 && rd("trained").every((x) => x.seed >= 10001 && x.seed <= 10075) && H.trained.z >= 2 && H.trained.m < audit.score && H.trained.m > audit.score / 2 && Math.abs(H.nc.z) < 2 && H.bs.z <= -2 && H.gr.z >= 2 && [H.trained, H.nc, H.bs, H.gr].every((x) => blob.by.includes(quote(x))) && /THE LARGER AUDIT/.test(blob.by),
        `trained ${quote(H.trained)}, z ${H.trained.z.toFixed(2)}) | no cannon ${quote(H.nc)}) | broadside ${quote(H.bs)}) | green ${quote(H.gr)})`);
    const first = rd("trained")[0];
    ok("a kept flight is the flight: the first pair of the audit's file, flown again here, is the lead the file holds", T.evaluate(back.weights, [{ kind: first.kind, seed: first.seed }]).runs[0].lead === first.lead);
    ok("the file says what the helm did where it was NOT trained, and it is not flattering: it trails the rule when it corrects the broadside rule and when neither side has the cannon", /correcting the broadside rule -0\.\d{3}/.test(blob.by) && /no cannon on either side -0\.\d{3}/.test(blob.by) && /green gunners \+0\.\d{3}/.test(blob.by));
});


console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
