// WebGLEngine/tools/ship/trainTurretSeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/trainTurretSeat-selfcheck.mjs      (under a minute)
//
// THE TRAINER THAT CAN REACH A CIRCUIT'S SYNAPSES, HELD TO WHAT IT SAYS IT DOES. tools/ship/trainTurretSeat.mjs searches for a brain/seatTurretGunner.mjs network that leads the hand gunner ship against ship, with children that move a synapse where moving it can matter, and then asks what the synapses were worth. Nine things hold it:
//
//   1  THE SETS            8 train, 12 held-out and 16 audit pairs, every kind in each, no seed in two of them, and none a seed of the helm's sets (so the two trained brains were never tuned on each other's fights)
//   2  AWAKE AND REACHABLE the car's hand weights wake neurons 0-5 (6 and 7 read the oil features, which a seat holds at 0); the reachable synapses are exactly those whose source is awake; a synapse with a weight wakes its target, to a fixed point
//   3  A SYNAPSE CHILD     moves exactly one reachable synapse, and a read-out of its TARGET with it exactly when no read output reads the target; never the car's drop or ignite; MOST change what the network answers (they are live, which a random weight of 896 is not); from the zero weights it is a path child
//   4  THE OTHER CHILDREN  path (a varying feature into a neuron and that neuron into a read output), tune (weights that already differ from zero, never drop or ignite), bias (one of three); child() by the stated shares
//   5  THE SCORE           the hand gunner's side against itself is not what is flown: the network's side with the START weights scores what the seat's gate pins against it; the options reach the fight
//   6  THE SEARCH AND THE PRUNE  on made-up scores: strict improvements, counted by the kind of child that made them; the start is the car's hand weights; a synapse that buys nothing is pruned back and one that is paid for stays
//   7  THE ABLATION        every synapse at zero and nothing else touched
//   8  THE CHOICE          qualifies() reason by reason; finish() takes the best held-out record, flies the audit for it, the start and the ablation, and says what the synapses were worth; a champion with no synapse is its own ablation
//   9  THE FRONT DOOR      a whole search on one pair, twice the same; the file that would be written is the CAR'S policy and says where it was trained; the options, the report, the export list
//   10 THE FILE THAT SHIPS    brain/seatTurretGunnerWeightsDefault.json is the best held-out record of brain/seatTurretSearchRecords.jsonl; its audit and ablation lines are what is flown now; AND THE STANDARD ERRORS SAY THE LEAD AND THE SYNAPSE'S WORTH CANNOT BE TOLD FROM NOTHING, which the file says
//
// SABOTAGE LOG: (30 mutants, each applied to a COPY of tools/ship/trainTurretSeat.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red):
//   Y1 the audit shares a seed with the helm's 2 | Y2 the start is the zero weights 12 | Y3 the hand gunner's side has the network 4 | Y4 the options do not reach the sides 1 | Y5 a constant feature wakes a neuron 4 | Y6 a bias does not wake a neuron 1 | Y7 waking stops after one step 1
//   Y8 a synapse wakes its source 1 | Y9 every synapse is reachable 4 | Y10 the read-out is the SOURCE's 3 | Y11 the read-out always moves 1 | Y12 the read-out never moves 4 | Y13 a synapse child's read-out may be drop or ignite 1 | Y14 a path child reads any feature 1 | Y15 a bias child moves any of five 1
//   Y16 the tune child may move drop and ignite 1 | Y17 no synapse children 4 | Y18 an equal child replaces its parent 2 | Y19 improvements are counted under tune 1 | Y20 the prune goes back to zero 3 | Y21 the prune keeps what buys nothing 3 | Y22 the ablation leaves the last synapse 1
//   Y23 the ablation is the start 1 | Y24 the worth is the ablation's own score 2 | Y25 the champion is the best on train 2 | Y26 the audit is flown with the start 1 | Y27 an audit lead of 0 qualifies 1 | Y28 the record holds the unpruned weights 1 | Y29 the file does not say where it was trained 1
//   Y30 the search's held-out is its train pairs 1
// ONE WENT 0 RED THE FIRST TIME AND WAS A GAP IN THE GATE, closed and re-run: Y27 -- the row asked about a held-out lead of exactly 0 and never about an AUDIT lead of exactly 0. The sweep ran before section 10 (the file that ships) existed. NOT CHECKED: that the searches give their records again
// (four searches of hours of a core each; search() is deterministic and section 9 flies one twice), and the command file (tools/ship/trainTurretSeatCmd.mjs: argument plumbing, run by hand).
"use strict";
import fs from "node:fs";
import * as T from "./trainTurretSeat.mjs";
import * as TH from "./trainHelm.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as Topo from "../../brain/gfcTopology.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const START = T.startWeights(), E = Topo.EDGES, H = 34, isSyn = (i) => i >= ST.synapseAt(0) && i < ST.synapseAt(313), isDropIgnite = (i) => (i >= ST.outputAt(3, 0) && i <= ST.outputAt(4, H - 1)) || i === ST.biasAt(3) || i === ST.biasAt(4);
const ONE = [{ kind: "head-on", seed: 2 }], TWO = [{ kind: "broadside", seed: 3 }];
const PROBES = [1, 2, 3, 4, 5, 6].map((s) => { const r = mulberry(s); return Float32Array.from([1, r() - 0.5, r() - 0.5, r() * 2, r() - 0.5, r(), 0, 1, s % 2, 0, 0]); });
const answers = (w) => PROBES.map((x) => ST.forward(w, x).slice(0, 3).join()).join("|");

console.log("trainTurretSeat-selfcheck -- the trainer that can reach a circuit's synapses\n");

console.log("1. THE SETS");
section(() => {
    const seeds = (l) => [...new Set(l.map((p) => p.seed))], all = [T.TRAIN_PAIRS, T.HELD_OUT_PAIRS, T.AUDIT_PAIRS], helm = [TH.TRAIN_PAIRS, TH.HELD_OUT_PAIRS, TH.AUDIT_PAIRS].flatMap(seeds);
    ok("8 train, 12 held-out and 16 audit pairs, every kind once for each seed; no seed in two sets (61-62, 71-73, 81-84)", all.map((l) => l.length).join() === "8,12,16" && all.every((l) => D.KINDS.every((k) => l.filter((p) => p.kind === k).length === seeds(l).length)) && seeds(T.TRAIN_PAIRS).join() === "61,62" && seeds(T.HELD_OUT_PAIRS).join() === "71,72,73" && seeds(T.AUDIT_PAIRS).join() === "81,82,83,84");
    ok("!! none of them is a seed the helm was trained, chosen or audited on, nor one the gates pin findings on (1-3)", all.flatMap(seeds).every((s) => !helm.includes(s) && s > 3));
    ok("the start is the car's hand weights (a fresh copy each time), the shares add to 1 and the synapse child's is the largest, the file is brain/seatTurretGunnerWeightsDefault.json", START.join() === GP.handWeights().join() && T.startWeights() !== T.startWeights() && Math.abs(T.SHARE.synapse + T.SHARE.path + T.SHARE.tune + T.SHARE.bias - 1) < 1e-12 && T.SHARE.synapse > Math.max(T.SHARE.path, T.SHARE.tune, T.SHARE.bias) && /brain[\\/]seatTurretGunnerWeightsDefault\.json$/.test(T.DEFAULT_OUT));
});

console.log("2. AWAKE AND REACHABLE");
section(() => {
    const on = T.awake(START), ks = T.reachable(START);
    ok("!! the car's hand weights wake neurons 0-5 and NOT 6 and 7, which read only the oil features a seat holds at 0; the zero weights wake none", [...on].sort((a, b) => a - b).join() === "0,1,2,3,4,5" && T.awake(ST.zeroWeights()).size === 0 && START[ST.encoderAt(6, 9)] !== 0 && START[ST.encoderAt(7, 10)] !== 0);
    ok("the reachable synapses are exactly those whose source neuron is awake (some but not all of the 313), and none for the zero weights", ks.length > 20 && ks.length < 313 && ks.every((k) => on.has(E[k][1])) && E.every(([, from], k) => on.has(from) === ks.includes(k)) && T.reachable(ST.zeroWeights()).length === 0, `${ks.length} of 313`);
    const k1 = ks.find((k) => !on.has(E[k][0])), mid = E[k1][0], k2 = E.findIndex(([to, from]) => from === mid && !on.has(to) && to !== mid), w = Float32Array.from(START); w[ST.synapseAt(k1)] = 0.5;
    const grown = T.awake(w), w2 = Float32Array.from(w); if (k2 >= 0) w2[ST.synapseAt(k2)] = 0.5;
    ok("a weight on a synapse from an awake neuron wakes its target, and that makes the target's own synapses reachable; a second synapse onward from it wakes the next (a fixed point, not one step)", grown.has(mid) && grown.size === 7 && T.reachable(w).length > ks.length && (k2 < 0 || (T.awake(w2).has(E[k2][0]) && T.awake(w2).size === 8)), `neuron ${mid} woken by synapse ${k1}`);
    const lone = ST.zeroWeights(); lone[ST.hiddenBiasAt(20)] = 1; const dead = ST.zeroWeights(); dead[ST.encoderAt(20, 6)] = 1; dead[ST.encoderAt(20, 9)] = 1;
    ok("a bias alone wakes a neuron; a weight from a feature a seat holds constant (reloading, the oil) does not", T.awake(lone).has(20) && T.awake(dead).size === 0 && T.isRead(START, 0) && !T.isRead(START, 20));
});

console.log("3. A SYNAPSE CHILD");
section(() => {
    const ks = new Set(T.reachable(START)); let shape = true, withRead = 0, alone = 0, live = 0; const n = 400, used = new Set();
    for (let s = 1; s <= n; s++) {
        const c = T.synapseChild(START, 0.5, mulberry(s)), d = T.differs(c, START), syn = d.filter(isSyn), rest = d.filter((i) => !isSyn(i));
        if (syn.length !== 1 || !ks.has(syn[0] - ST.synapseAt(0)) || d.some(isDropIgnite)) { shape = false; continue; }
        const to = E[syn[0] - ST.synapseAt(0)][0], read = T.isRead(START, to); used.add(syn[0]);
        if (read) { shape = shape && rest.length === 0; alone++; } else { shape = shape && rest.length === 1 && [0, 1, 2].some((o) => rest[0] === ST.outputAt(o, to)); withRead++; }
        if (answers(c) !== answers(START)) live++;
    }
    ok("!! 400 synapse children of the start: each moves exactly ONE synapse and it is a reachable one; a read-out of the synapse's TARGET into yaw, pitch or the trigger moves with it exactly when no read output reads that target, and nothing else moves -- never drop or ignite", shape && withRead > 50 && alone > 10 && used.size > 60, `${withRead} with a read-out, ${alone} alone, ${used.size} different synapses`);
    let rnd = 0; for (let s = 1; s <= n; s++) { const c = Float32Array.from(START), r = mulberry(s); c[Math.floor(r() * 896)] += 0.5; if (answers(c) !== answers(START)) rnd++; }
    ok("!! THEY ARE LIVE: more than a third change what the network answers on six probes, and a single random weight of the 896 moved by as much does so less than a third as often -- which is why the older search never used a synapse", live > n / 3 && rnd < live / 3, `${live} of 400 synapse children against ${rnd} of 400 random single weights`);
    const z = T.differs(T.synapseChild(ST.zeroWeights(), 0.5, mulberry(3)), ST.zeroWeights());
    ok("from the zero weights (no neuron awake) it is a path child: an encoder weight and a read-out, no synapse; the same generator is the same child", z.length === 2 && !z.some(isSyn) && T.synapseChild(START, 0.5, mulberry(8)).join() === T.synapseChild(START, 0.5, mulberry(8)).join());
});

console.log("4. THE OTHER CHILDREN");
section(() => {
    let okP = true, okB = true, okT = true; const feats = new Set(), outs = new Set(), bs = new Set(), base = Float32Array.from(START); base[ST.synapseAt(4)] = 0.3;
    for (let s = 1; s <= 300; s++) {
        const p = T.differs(T.pathChild(ST.zeroWeights(), 0.5, mulberry(s)), ST.zeroWeights()); if (p.length !== 2 || p[0] >= 11 * H) { okP = false; continue; }
        const h = Math.floor(p[0] / 11), o = Math.floor((p[1] - ST.outputAt(0, 0)) / H); okP = okP && p[1] === ST.outputAt(o, h) && o <= 2; feats.add(p[0] % 11); outs.add(o);
        const b = T.differs(T.biasChild(START, 0.5, mulberry(s)), START); okB = okB && b.length === 1 && b[0] >= ST.biasAt(0) && b[0] <= ST.biasAt(2); bs.add(b[0]);
        const t = T.differs(T.tuneChild(base, 0.5, mulberry(s), 3), base); okT = okT && t.length >= 1 && t.length <= 3 && t.every((i) => base[i] !== 0 && !isDropIgnite(i));
    }
    ok("a path child: one of the SEVEN features that vary in a seat into a neuron, and that neuron into yaw, pitch or the trigger (300: all seven features, all three outputs, never reloading, reachable or the oil)", okP && [...feats].sort((a, b) => a - b).join() === "0,1,2,3,4,5,8" && outs.size === 3);
    ok("a bias child moves one of the three biases a seat reads (all three occur); a tune child moves one to three weights that already differ from zero, a synapse among them when one has a weight, and never a drop or ignite weight although the car's hand weights have four (the two weights from the oil features into neurons 6 and 7 ARE tunable and are dead in a seat: a move of one changes no answer, scores what its parent did and is never kept)", okB && bs.size === 3 && okT && T.tunable(base).includes(ST.synapseAt(4)) && T.tunable(START).length === START.filter((v) => v !== 0).length - 4 && !T.tunable(START).some(isDropIgnite) && T.tunable(START).includes(ST.encoderAt(6, 9)));
    const kinds = { synapse: 0, path: 0, tune: 0, bias: 0 }; for (let s = 1; s <= 1000; s++) kinds[T.child(START, 0.5, mulberry(s), 3).kind]++;
    ok("child() draws the four by the stated shares (1,000 children: synapse 340-460, the others 150-250 each) and says which it drew", kinds.synapse > 340 && kinds.synapse < 460 && [kinds.path, kinds.tune, kinds.bias].every((k) => k > 150 && k < 250) && T.child(START, 0.5, mulberry(2), 3).w.length === 896, JSON.stringify(kinds));
});

console.log("5. THE SCORE");
section(() => {
    const a = T.evaluate(START, [...ONE, ...TWO]), X = D.makeSide("n", { network: { module: ST, weights: START } }), Y = D.makeSide("h");
    ok("!! the score is the mean lead of the network's side (thirteen seats, regular sights) over the hand gunner's in battleshipDuel pairs: evaluate() is pair() of those two sides, pair by pair", a.runs.length === 2 && a.runs[0].lead === D.pair(X, Y, 2, "head-on").lead && a.runs[1].lead === D.pair(X, Y, 3, "broadside").lead && Math.abs(a.score - (a.runs[0].lead + a.runs[1].lead) / 2) < 1e-12 && a.won === a.runs.filter((r) => r.lead > 0.05).length && a.lost === a.runs.filter((r) => r.lead < -0.05).length, T.describeEval(a));
    const g = T.evaluate(START, ONE, { gunners: "perfect" }), c = T.evaluate(START, ONE, { cannon: false });
    ok("the side's options reach both sides: behind perfect sights, and with no cannon, the same weights' lead is another number", g.score !== a.runs[0].lead && c.score !== a.runs[0].lead && g.score !== c.score);
    ok("the zero weights (a gunner that never turns or fires) lose to the hand gunner", T.evaluate(ST.zeroWeights(), ONE).score < -0.05);
});

console.log("6. THE SEARCH AND THE PRUNE (made-up scores)");
section(() => {
    const synSum = (w) => { let s = 0; for (let k = 0; k < 313; k++) s += Math.abs(w[ST.synapseAt(k)]); return s; }, pay = (w) => Math.min(1, synSum(w));   // pays for weight on synapses, up to 1
    const seen = []; let calls = 0; const r = T.train({ seed: 21, iters: 150, scoreFn: (w) => { calls++; return pay(w); }, onIter: (i, st) => seen.push(st) });
    ok("!! on a score that pays only for weight on synapses the search climbs from the car's hand weights (0) by SYNAPSE children alone, and says so: every improvement is counted under `synapse`, the children tried add up to the iterations, and the parent and each child were scored once", r.history[0].score === 0 && r.trainScore > 0.5 && r.improved >= 2 && r.by.synapse === r.improved && r.by.path + r.by.tune + r.by.bias <= r.improved - r.by.synapse + r.by.tune && Object.values(r.tried).reduce((a, b) => a + b, 0) === 150 && calls === 151 && ST.synapsesUsed(r.weights) >= 1 && seen[149].synapses === ST.synapsesUsed(r.weights), `score ${r.trainScore.toFixed(3)}, ${r.improved} improvements, ${ST.synapsesUsed(r.weights)} synapses`);
    ok("strict improvements only (the best never falls; a flat score moves nothing off the start), the same seed the same search, `start` where it starts", seen.every((s, i) => !i || s.score >= seen[i - 1].score) && T.differs(T.train({ seed: 3, iters: 40, scoreFn: () => 1 }).weights, START).length === 0 && T.train({ seed: 21, iters: 150, scoreFn: pay }).weights.join() === r.weights.join() && T.train({ seed: 22, iters: 150, scoreFn: pay }).weights.join() !== r.weights.join() && T.train({ seed: 1, iters: 3, start: ST.zeroWeights(), scoreFn: (w) => -T.differs(w, ST.zeroWeights()).length }).history[0].score === 0);
    const w = Float32Array.from(START); w[ST.synapseAt(3)] = 0.4; w[ST.synapseAt(9)] = 0.7; w[ST.outputAt(1, 20)] = 0.2; w[ST.encoderAt(0, 1)] = 5;
    const p = T.prune(w, { scoreFn: (v) => (v[ST.synapseAt(9)] !== 0 ? 1 : 0) });
    ok("!! THE PRUNE PUTS BACK WHAT BUYS NOTHING, A SYNAPSE INCLUDED: of two synapses, a read-out and a changed hand weight, on a score that pays for one synapse, that synapse stays and the other three go back to the START's values (the hand weight to the car's own 1, not to 0)", p.moved === 4 && p.kept === 1 && ST.synapsesUsed(p.weights) === 1 && p.weights[ST.synapseAt(9)] === Math.fround(0.7) && p.weights[ST.encoderAt(0, 1)] === 1 && T.differs(p.weights, START).join() === String(ST.synapseAt(9)) && T.differs(w, START).length === 4);
    ok("at most `maxPasses` passes, and `base` is what it goes back to", T.prune(w, { scoreFn: () => 0, maxPasses: 1 }).passes === 1 && T.differs(T.prune(w, { scoreFn: () => 0, base: ST.zeroWeights() }).weights, ST.zeroWeights()).length === 0);
});

console.log("7. THE ABLATION");
section(() => {
    const w = ST.perturb(START, 0.2, mulberry(5)), a = T.ablate(w);
    ok("!! every synapse is put to zero and no other weight is touched; the parent is not changed; a network with no synapse is its own ablation", ST.synapsesUsed(w) === 313 && ST.synapsesUsed(a) === 0 && T.differs(a, w).every(isSyn) && T.differs(a, w).length === 313 && T.ablate(START).join() === START.join());
});

console.log("8. THE CHOICE");
section(() => {
    const r = (h, a, hw = 2, hl = 1, aw = 2, al = 1) => ({ heldOut: { score: h, won: hw, lost: hl }, audit: { score: a, won: aw, lost: al } });
    ok("qualifies: a lead over the hand gunner on both sets with no more pairs lost than won is in; each of the four ways to fall short is out with its own reason", T.qualifies(r(0.1, 0.05)).ok && /held-out lead 0\.000 is not above the hand gunner's 0/.test(T.qualifies(r(0, 0.1)).reasons.join()) && T.qualifies(r(0, 0.1)).reasons.length === 1 && /audit lead -0\.010/.test(T.qualifies(r(0.1, -0.01)).reasons.join()) && /audit lead 0\.000 is not above/.test(T.qualifies(r(0.1, 0)).reasons.join()) && /held-out pairs: 1 won is behind 2 lost/.test(T.qualifies(r(0.1, 0.1, 1, 2)).reasons.join()) && /audit pairs: 0 won is behind 1 lost/.test(T.qualifies(r(0.1, 0.1, 2, 1, 0, 1)).reasons.join()) && T.qualifies(r(-1, -1, 0, 1, 0, 1)).reasons.length === 4);
    const syn = Float32Array.from(START); syn[ST.synapseAt(T.reachable(START)[0])] = 2; syn[ST.outputAt(0, E[T.reachable(START)[0]][0])] = 3;
    const rec = (seed, score, w = START) => ({ seed, iters: 4, sigma: 0.5, maxK: 3, passes: 2, weights: Array.from(w), train: seed === 9 ? 5 : 0.2, improved: 1, moved: 1, kept: 1, heldOut: { score, won: 1, lost: 0, runs: [{}] } });
    const lines = [], f = T.finish([rec(7, 0.1), rec(5, 0.4, syn), rec(6, 0.4), rec(9, -0.2)], (m) => lines.push(m), { audit: ONE });
    ok("!! finish takes the best HELD-OUT record (not seed 9, the best on train and the worst held-out; the lower seed on a tie: 5), and its audit is evaluate() of ITS weights", f.champion.seed === 5 && f.runs.map((x) => x.seed).join() === "5,6,7,9" && f.champion.audit.score === T.evaluate(syn, ONE).score && f.verdict.ok === T.qualifies(f.champion).ok);
    ok("!! ... and it says what the synapses were worth: the start and the ablation are flown on the same audit pairs, the ablation is the champion with its synapses at zero, and the worth is the champion's audit score less the ablation's", f.start.score === T.evaluate(START, ONE).score && f.ablation.score === T.evaluate(T.ablate(syn), ONE).score && f.synapseWorth === f.champion.audit.score - f.ablation.score && f.ablation.score !== f.champion.audit.score && lines.some((l) => /THE ABLATION .* the synapses are worth [+-]\d\.\d{3}/.test(l)) && Object.keys(f.others).join() === "perfect sights,green sights,no cannon on either side" && f.others["no cannon on either side"].score === T.evaluate(syn, ONE, { cannon: false }).score, `worth ${f.synapseWorth.toFixed(3)}`);
    const g = T.finish([rec(1, 0.3)], () => {}, { audit: ONE });
    ok("a champion with no synapse is its own ablation and its synapses are worth exactly 0; no records and a short record are refused by name", g.ablation === g.champion.audit && g.synapseWorth === 0 && throwsWith(() => T.finish([]), /no search records/) && throwsWith(() => T.finish([{ ...rec(1, 0), weights: [1] }]), /a record needs 896 weights and its held-out result \(seed 1\)/));
});

console.log("9. THE FRONT DOOR");
section(() => {
    const a = T.search({ seed: 77, iters: 3 }, () => {}, { train: ONE, heldOut: TWO }), b = T.search({ seed: 77, iters: 3 }, () => {}, { train: ONE, heldOut: TWO });
    ok("a whole search on one train pair and one held-out pair, three iterations: a plain record, the same twice, whose scores are evaluate() of its weights and whose counts are its weights'", JSON.stringify(a) === JSON.stringify(b) && a.weights.length === 896 && a.train === T.evaluate(Float32Array.from(a.weights), ONE).score && a.heldOut.score === T.evaluate(Float32Array.from(a.weights), TWO).score && a.startTrain === T.evaluate(START, ONE).score && a.train >= a.startTrain && a.synapses === ST.synapsesUsed(a.weights) && a.kept === T.differs(a.weights, START).length && a.tried.synapse + a.tried.path + a.tried.tune + a.tried.bias === 3);
    const made = (w) => Math.min(1, [...Array(313).keys()].reduce((s, k) => s + Math.abs(w[ST.synapseAt(k)]), 0)), c = T.search({ seed: 78, iters: 80 }, () => {}, { train: ONE, heldOut: TWO, scoreFn: made });
    ok("!! on a made-up train score that pays for synapses and nothing else, the record holds the PRUNED weights: the read-outs that came with the synapses are gone, only synapses differ from the start, and the count before the prune and after are both kept", c.moved > c.kept && T.differs(c.weights, START).every(isSyn) && c.synapses === c.kept && c.synapsesBefore >= c.synapses && c.synapses >= 1, `${c.moved} moved, ${c.kept} kept, ${c.synapses} synapses`);
    const ev = { score: 0.25, won: 2, lost: 1, runs: [1, 2, 3] }, syn = Float32Array.from(START); syn[ST.synapseAt(5)] = 1;
    const blob = T.blobOf({ champion: { seed: 7001, iters: 160, sigma: 0.5, maxK: 3, passes: 2, kept: 1, weights: syn, heldOut: ev, audit: { ...ev, score: 0.125 } }, runs: [{ seed: 7001 }, { seed: 7000 }], start: { ...ev, score: -0.2 }, ablation: { ...ev, score: 0.025 }, synapseWorth: 0.1, others: { "green sights": ev } }), back = PB.importBrain(PB.describePolicy("gunnerPolicy", GP), blob);
    ok("!! the file that would be written is a brain for the CAR'S policy that peerBrain takes back against brain/gunnerPolicy.mjs itself, and its `by` says first that it was trained in a ship's seat and not on the race, then the synapses it uses, the audit, the start, the ablation and their worth", blob.policy === "gunnerPolicy" && back.ok && back.weights.join() === syn.join() && blob.score === 0.25 && blob.by.startsWith("TRAINED IN A CAPITAL SHIP'S GUN SEAT, NOT ON THE RACE") && blob.by.includes("1 of the circuit's 313 synapses carry a weight") && blob.by.includes("read once: +0.125 (2 pairs won, 1 lost of 3)") && blob.by.includes("the start (the car's hand weights) -0.200") && blob.by.includes("THE ABLATION (this network with every synapse at zero) +0.025") && blob.by.includes("so the synapses are worth +0.100") && blob.by.includes("seed 7001 of 2 searches (7000,7001)"));
    ok("parseArgs refuses what it does not know; the report lines say the recipe; the export list", T.parseArgs(["--seed", "7002", "--write"]).seed === 7002 && T.parseArgs([]).iters === 160 && throwsWith(() => T.parseArgs(["--itres", "3"]), /unknown option "--itres"/) && throwsWith(() => T.parseArgs(["--seed"]), /needs a value/) && T.reportLines()[0].includes("4 searches of 160 iterations from seed 7000, sigma 0.5; 40% of the children move a synapse") && T.reportLines()[1].includes("8 train, 12 held-out and 16 audit pairs")
        && Object.keys(T).sort().join() === "AUDIT_PAIRS,DEFAULT_OUT,GUNNERS,HELD_OUT_PAIRS,RECIPE,SHARE,TRAIN_PAIRS,ablate,awake,biasChild,blobOf,child,describeEval,describeOthers,differs,evaluate,finish,isRead,parseArgs,pathChild,prune,qualifies,reachable,reportLines,search,startWeights,synapseChild,train,tunable,tuneChild");
});

console.log("10. THE FILE THAT SHIPS (sixty pairs flown again)");
section(() => {
    const J = (f) => fs.readFileSync(new URL("../../brain/" + f, import.meta.url), "utf8"), blob = JSON.parse(J("seatTurretGunnerWeightsDefault.json")), back = PB.importBrain(PB.describePolicy("gunnerPolicy", GP), blob), recs = J("seatTurretSearchRecords.jsonl").trim().split("\n").map((l) => JSON.parse(l)), best = recs.slice().sort((a, b) => b.heldOut.score - a.heldOut.score || a.seed - b.seed)[0], w = back.weights;
    ok("the file is a brain for the CAR'S policy that peerBrain takes; four search records (seeds 7000-7003, the recipe's) are kept beside it; its weights are the best held-out record's to the bit; EVERY one of the four searches kept at least one synapse through the prune (1, 3, 3 and 5)", back.ok && recs.map((r) => r.seed).join() === "7000,7001,7002,7003" && recs.every((r) => r.iters === T.RECIPE.iters && r.sigma === T.RECIPE.sigma) && blob.weights.join() === best.weights.join() && recs.map((r) => r.synapses).join() === "1,3,3,5" && recs.every((r) => ST.synapsesUsed(r.weights) === r.synapses && r.train > r.startTrain) && blob.by.includes(`${ST.synapsesUsed(w)} of the circuit's 313 synapses carry a weight`) && blob.by.includes(`${T.differs(w, START).length} of 896 weights differ from the car's hand weights`));
    const held = T.evaluate(w, T.HELD_OUT_PAIRS), audit = T.evaluate(w, T.AUDIT_PAIRS), abl = T.evaluate(T.ablate(w), T.AUDIT_PAIRS), start = T.evaluate(START, T.AUDIT_PAIRS);
    ok("!! flown again: the held-out, audit, start and ablation lines the file quotes are what evaluate() gives now, and by the rule it qualifies (it leads the hand gunner on both sets and loses no more pairs than it wins)", blob.by.includes(`: ${T.describeEval(held)}; audit`) && blob.by.includes(`read once: ${T.describeEval(audit)}`) && blob.by.includes(`the start (the car's hand weights) ${T.describeEval(start)}`) && blob.by.includes(`THE ABLATION (this network with every synapse at zero) ${T.describeEval(abl)}`) && held.score === best.heldOut.score && T.qualifies({ heldOut: held, audit }).ok && audit.score > start.score, `held-out ${T.describeEval(held)} | audit ${T.describeEval(audit)} | start ${T.describeEval(start)} | ablation ${T.describeEval(abl)}`);
    const se = (xs) => { const n = xs.length, m = xs.reduce((p, q) => p + q, 0) / n; return [m, Math.sqrt(xs.reduce((p, q) => p + (q - m) ** 2, 0) / (n - 1) / n)]; }, [lead, leadSe] = se(audit.runs.map((r) => r.lead)), [worth, worthSe] = se(audit.runs.map((r, i) => r.lead - abl.runs[i].lead));
    ok("!! *** AND IT IS NOT SHOWN TO BE BETTER: the audit lead is under one standard error of nothing (0.166, se 0.276) and so is what its synapse is worth (0.063, se 0.213) -- and the file says both numbers *** ", Math.abs(lead) < leadSe && Math.abs(worth) < worthSe && blob.by.includes(`the lead over the hand gunner is ${lead.toFixed(3)} with a standard error of ${leadSe.toFixed(3)}`) && blob.by.includes(`the champion less its ablation is ${worth.toFixed(3)} with a standard error of ${worthSe.toFixed(3)}`) && /NEITHER CAN BE TOLD FROM NOTHING/.test(blob.by), `lead ${lead.toFixed(3)} se ${leadSe.toFixed(3)}; synapse worth ${worth.toFixed(3)} se ${worthSe.toFixed(3)}`);
    ok("where it was NOT trained the file says too: it trails the hand gunner behind perfect sights", /perfect sights -0\.\d{3}/.test(blob.by) && /no cannon on either side \+0\.\d{3}/.test(blob.by));
});


console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
