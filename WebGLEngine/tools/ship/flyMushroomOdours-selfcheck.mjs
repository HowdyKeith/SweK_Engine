// WebGLEngine/tools/ship/flyMushroomOdours-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroomOdours-selfcheck.mjs      (about five seconds; IT NEVER RUNS THE ROUND -- its one training is of 2 iterations on draw 906, its audits are of 2 lives,
// and it starts no process)
//
// THE GATE OF THE MUSHROOM ODOUR ROUND (registered in brain/FLY_MUSHROOM_ODOURS_WIP.md before brain/rl/pnOdorEnv.mjs, tools/ship/flyMushroomOdours.mjs and
// tools/ship/takeFlyMushroomOdours.mjs existed): with odours made through the real projection neurons, does the real wiring code them better than a shuffle, and does the teachers'
// pairing matter now?
//   1  THE WIRING               the vendored projection neurons onto the Kenyon cells, read by hand; the Kenyon cells the mushroom body file's, in its order; the shuffle by hand
//   2  THE TASK                 a life by hand from its seed: the odours over the glomeruli, the noise, each Kenyon cell's input, the 5 percent that fire, the outcome
//   3  THE FLY                  the mushroom round's fly and teachers, not edited
//   4  THE ROUND'S NUMBERS      the draws, arms, recipe, audit; the committed files named by their hashes; each arm's wiring and teachers; the floors; the registration says the same
//   5  ONE TRAINING             a record's weights are the trainer's from the task and fly made here by hand; its scores and overlap lives flown here by hand
//   6  THE RECORDS              36 draws; T1, T2, H, USES
//   7  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 33, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 5; every one red by name but ONE, a finding (the number is the rows red):
//   THE TASK (brain/rl/pnOdorEnv.mjs): E1 multiglomerular neurons fire as glomerulus 0 5 | E2 the top 10 percent fire 6 | E3 odour B redrawn with p 0.3 6 | E4 no noise 6 | E5 the weakest
//   fire 5 | E6 synapses not counted 5 | E7 the outcome never told 6 | E8 REV swaps from trial 15 1 | E9 glomeruli active with p 0.35 7
//   THE ROUND: F1 SHUFPN on the real wiring 6 | F2 the shuffle's seed 5000 6 | F3 degrees not kept 6 | F4 PFAM taught by the real teachers 4 | F5 the audit the mushroom round's 1 | F6 T1
//   against PFAM 1 | F7 the rank sums' BETTER and WORSE swapped 2 | F8 H against the start 1 | F9 USES needs 0.3 1 | F10 the rate not set to 0 2 | F11 the overlap of odour A with itself 2 |
//   F12 the mushroom file's own checks skipped 1 | F13 the teachers not compared to the mushroom round's committed records 0 -- A FINDING, see below -- F13b the teachers not checked 1 |
//   F14 the wiring not checked 1 | F15 the vendored file not checked 1 | F16 the recipe 40 iterations 4 | F17 the round writes the mushroom round's file 1 | F18 the Kenyon cells read one
//   place on 6 | F19 multiglomerular neurons given glomerulus 0 4
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 the job trains with a recipe of its own 1 | C4 the file's draws not counted as
//   done 1 | C5 reads the mushroom round's library 1.   THE NOTE: N1 its p 0.35 1 | N2 its shuffle on seed 5000 1 | N3 its audit from 9000001 1 | N4 its T2 against SHUFPN 1
//   F13 WENT 0 RED, AND IT WAS RIGHT TO: checkRecords compared each record's teachers with the mushroom round's committed record AND with teachFor, and the first can never fire alone --
//   the mushroom round's file must pass its own checks first, and they hold every one of its records' teachers to teachFor. The comparison was redundant, so it is gone (a comment says
//   why), and F13b takes the check that remains away: 1 red. Row 3's teachers row still compares every draw with the committed records directly.
//   THREE THINGS WERE FOUND BEFORE THE SABOTAGES: tools/ship/definitionGates-selfcheck.mjs found the library's auditScore named by no gate (the tree-wide count went from 405 to 406; a
//   row now tests it against lives flown by hand); the one training's scores were 0 on its 2 lives, so the row comparing them with lives by hand compared two zeros (the training moved
//   from draw 901 to 906, whose score is 0.30 and 0.23 with p_a at 0, and the row now demands they differ from 0 and from each other); and the check that the vendored wiring is the
//   file committed could not be made to fail by a gate (checkRecords now takes the sha256 as read, defaulting to the file's, and a row gives it another).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as O from "./flyMushroomOdours.mjs";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as PE from "../../brain/rl/pnOdorEnv.mjs";
import * as MF from "../../brain/rl/mushroomFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TWO = [880021, 880022];
const mushroom = O.fileOf(fs.readFileSync(path.join(ENG, O.MUSHROOM)));
// the vendored file read by hand
const D = JSON.parse(src("vendor/male-cns/pn-kc-circuit.json")), MB = JSON.parse(src("vendor/male-cns/mushroom-body-circuit.json"));
const PN = D.cells.filter((c) => c.group === "PN"), KC0 = D.cells.findIndex((c) => c.group === "KC"), GL = [...new Set(PN.map((c) => c.glomerulus).filter(Boolean))].sort(), GLOM = PN.map((c) => (c.glomerulus ? GL.indexOf(c.glomerulus) : -1));
const REAL = D.edges.map(([i, j, n]) => [i, j - KC0, n]);
const shuffleByHand = (seed) => { const r = OE.stream(seed), w = REAL.map((e) => e.slice()); for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = w[i][0]; w[i][0] = w[j][0]; w[j][0] = t; } return w; };
// the Kenyon cells an odour (glomerular strengths) makes fire, by hand: each connection's strength x synapses, the 203 with the most input (ties to the lower index), ascending
const firing = (wiring, g) => { const inp = new Float64Array(4064); for (const [p, k, n] of wiring) { const gi = GLOM[p]; if (gi >= 0 && g[gi] > 0) inp[k] += g[gi] * n; }
    return [...inp.keys()].filter((k) => inp[k] > 0).sort((a, b) => inp[b] - inp[a] || a - b).slice(0, 203).sort((a, b) => a - b); };
// a life by hand from its seed: odour A over the 72 glomeruli (each active with p 0.3 at 0.5 to 1), B (each drawn again with p 0.5), the bad one, then each trial an odour with noise
const lifeByHand = (task, seed, wiring, act) => { const r = OE.stream(seed), glom = () => (r() < 0.3 ? 0.5 + 0.5 * r() : 0), A = GL.map(glom), B = A.map((g) => (r() < 0.5 ? glom() : g)), od = [A, B], bad = r() < 0.5 ? 0 : 1, out = []; let us = 0, ret = 0;
    for (let t = 0; t < 30; t++) { const o = r() < 0.5 ? 0 : 1, g = od[o].map((x) => { if (!(x > 0)) return 0; const z = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); return Math.max(0, x * (1 + 0.2 * z)); });
        const obs = { t, x: firing(wiring, g), us }, a = act(obs, t), isBad = task === "REV" && t >= 15 ? o !== bad : o === bad, go = a > 0, rw = go ? (isBad ? -1 : 1) / 15 : 0; us = go ? (isBad ? -1 : 1) : 0; ret += rw; out.push({ ...obs, reward: rw }); }
    return { out, ret, odours: od }; };
const flyLife = (fly, seed, wiring) => lifeByHand("ONE", seed, wiring, (obs) => fly.act(obs)[0]).ret;
const flyMean = (mk, wiring, lives) => lives.reduce((n, L) => n + flyLife(mk(), L, wiring), 0) / lives.length;
const overlapByHand = (wiring, lives) => lives.reduce((n, L) => { const { odours } = lifeByHand("ONE", L, wiring, () => -1), a = firing(wiring, odours[0]), b = new Set(firing(wiring, odours[1])); return n + a.filter((k) => b.has(k)).length / Math.max(1, a.length); }, 0) / lives.length;
const envOf = (task, wiring) => new PE.PnOdorEnv({ task, nk: 4064, ng: 72, pnGlom: GLOM, wiring });

console.log("flyMushroomOdours-selfcheck -- the mushroom odour round (odours as glomerular patterns through the real projection neurons; the real wiring against a shuffle, the real teachers against PFAM's): the wiring, the task, the fly, the numbers, one training, the records, the command\n");

console.log("1. THE WIRING (vendor/male-cns/pn-kc-circuit.json, read by hand)");
section(() => {
    const kcIds = D.cells.slice(KC0).map((c) => c.bodyId), mbIds = MB.cells.filter((c) => c.group === "KC").map((c) => c.bodyId);
    ok("!! THE CELLS: 686 projection neurons (338 of them multiglomerular, with no glomerulus) and then the 4,064 Kenyon cells -- THE MUSHROOM BODY FILE'S KENYON CELLS, BODY FOR BODY IN ITS ORDER, so a cell's place is the same in both; 72 glomeruli",
        PN.length === 686 && D.cells.slice(0, 686).every((c) => c.group === "PN") && D.cells.length === 686 + 4064 && J(kcIds) === J(mbIds) && kcIds.length === 4064 && PN.filter((c) => !c.glomerulus).length === 338 && GL.length === 72 &&
        O.WIRING.npn === 686 && O.WIRING.nk === 4064 && O.WIRING.ng === 72 && J(O.WIRING.glomeruli) === J(GL) && J(O.WIRING.pnGlom) === J(GLOM));
    ok("!! THE CONNECTIONS: 19,980 projection neuron -> Kenyon cell with 385,887 synapses (5 or more each, each pair once), as the file has them and its totals say; the vendored file is the one committed (sha256 b885db58...)",
        J(O.WIRING.real) === J(REAL) && REAL.length === 19980 && REAL.reduce((n, e) => n + e[2], 0) === 385887 && D.totals["PN>KC"].keptSynapses === 385887 && D.totals["PN>KC"].keptConnections === 19980 && Math.min(...REAL.map((e) => e[2])) === 5 &&
        new Set(REAL.map((e) => e[0] * 10000 + e[1])).size === 19980 && O.PNKC === "vendor/male-cns/pn-kc-circuit.json" && sha(O.PNKC) === O.PNKC_SHA256 && O.WIRING.sha256 === O.PNKC_SHA256 && O.PNKC_SHA256 === "b885db58c7284b2096a7fcecb6d72d39e0ab9ec65640315ce559023f570af1e7");
    const s7 = O.shuffledPN(4007), byHand = shuffleByHand(4007), deg = (w) => { const d = new Array(686).fill(0); for (const e of w) d[e[0]]++; return d; };
    ok("!! THE SHUFFLE BY HAND: the projection-neuron ends of the connections permuted among them (Fisher-Yates on odorEnv's stream): every Kenyon cell keeps its claws and their synapse counts, every projection neuron its number of connections; the wiring changes",
        J(s7) === J(byHand) && s7.every((e, i) => e[1] === REAL[i][1] && e[2] === REAL[i][2]) && J(deg(s7)) === J(deg(REAL)) && s7.filter((e, i) => e[0] !== REAL[i][0]).length > 19000 && J(O.shuffledPN(4008)) !== J(s7));
});

console.log("\n2. THE TASK (brain/rl/pnOdorEnv.mjs, a life by hand)");
section(() => {
    ok("the numbers: glomeruli active with p 0.3, odour B drawn again with p 0.5, noise 0.2, 5 percent of the Kenyon cells fire (203); the mushroom task's 30 trials, swap after 15", PE.P_GLOM === 0.3 && PE.CHANGE === 0.5 && PE.NOISE === 0.2 && PE.SPARSE === 0.05 && envOf("ONE", REAL).k === 203 && OE.TRIALS === 30 && OE.SWAP_AT === 15);
    const run = (task, seed, wiring, acts) => { const env = envOf(task, wiring), got = []; let o = env.reset(seed), done = false, t = 0; while (!done) { const r = env.step([acts(t)]); got.push({ ...o, reward: r.reward }); o = r.obs; done = r.done; t++; } return { got, ret: env.ret, last: o, env }; };
    const acts = (t) => (t % 3 === 0 ? -1 : 1), A = lifeByHand("ONE", 4242, REAL, (o, t) => acts(t)), B = run("ONE", 4242, REAL, acts), Ar = lifeByHand("REV", 4243, REAL, (o, t) => acts(t)), Br = run("REV", 4243, REAL, acts);
    ok("!! A LIFE BY HAND FROM ITS SEED (the two odours over the glomeruli, the bad one, each trial's odour with its noise, each Kenyon cell's input summed over its connections, the 203 with the most firing, the outcome told the next trial, +1/15 and -1/15) is the env's, trial by trial, on ONE and REV",
        J(A.out) === J(B.got) && J(Ar.out) === J(Br.got) && near(A.ret, B.ret, 1e-12) && near(Ar.ret, Br.ret, 1e-12) && B.got.length === 30 && B.got.every((o) => o.x.length === 203) && B.last.t === 30 && B.last.x.length === 0);
    const sh = O.shuffledPN(4003), C = lifeByHand("ONE", 4242, sh, (o, t) => acts(t)), Cs = run("ONE", 4242, sh, acts);
    ok("!! THE SAME LIFE ON A SHUFFLED WIRING: the same odours and outcomes, other Kenyon cells -- by hand as the env has it", J(C.out) === J(Cs.got) && J(C.out.map((o) => o.reward)) === J(A.out.map((o) => o.reward)) && C.out.some((o, t) => J(o.x) !== J(A.out[t].x)));
    const one = REAL.filter((e) => GLOM[e[0]] < 0), e1 = envOf("ONE", one); e1.reset(5); const multi = e1.kcsOf(new Array(72).fill(1)), e2 = envOf("ONE", REAL); e2.reset(5); const st = e2.step([1]);
    ok("a multiglomerular projection neuron never fires (a wiring of only theirs makes no Kenyon cell fire); info.dist is 1 less the return so far and the fly is never docked or crashed; a task, wiring or glomerulus that is not one is refused by name",
        one.length > 0 && multi.length === 0 && st.info.docked === false && st.info.crashed === false && near(st.info.dist, 1 - e2.ret, 1e-15) && throws(() => envOf("TWO", REAL), /ONE or REV/) && throws(() => new PE.PnOdorEnv({ task: "ONE", nk: 4064, ng: 72, pnGlom: GLOM, wiring: [[0, 5000, 3]] }), /wiring is \[pn, kc, n\]/) &&
        throws(() => new PE.PnOdorEnv({ task: "ONE", nk: 4064, ng: 72, pnGlom: [72], wiring: [] }), /pnGlom gives/));
});

console.log("\n3. THE FLY (the mushroom round's, with its teachers)");
section(() => {
    ok("!! THE FLY IS THE MUSHROOM ROUND'S, NOT EDITED: brain/rl/mushroomFly.mjs and brain/rl/odorEnv.mjs are the bytes committed at 531b7f42; PLASTIC's and SHUFPN's fly is the mushroom round's PLASTIC fly, PFAM's its PFAM fly, 93 weights",
        sha("brain/rl/mushroomFly.mjs") === "41f511af84f7ebbd9f35dc065cfd0419cfaf0c68ab2a5c8fcec8d04c4119220e" && sha("brain/rl/odorEnv.mjs") === "321506d5a9ec909fa3cbde56ab2a3acbd01db21baec0a5ba2ce5b7db7bcd8c4d" &&
        O.flyOf("SHUFPN", 3) instanceof MF.MushroomFly && J(O.flyOf("SHUFPN", 3).teach) === J(M.teachFor("PLASTIC", 3)) && J(O.flyOf("PLASTIC", 3).teach) === J(M.teachFor("PLASTIC", 3)) && J(O.flyOf("PFAM", 3).teach) === J(M.teachFor("PFAM", 3)) && J(M.teachFor("PFAM", 3)) !== J(M.teachFor("PLASTIC", 3)) && O.flyOf("PFAM", 3).paramCount() === 93 &&
        O.teachArm("SHUFPN") === "PLASTIC" && O.teachArm("PFAM") === "PFAM" && throws(() => O.flyOf("PSHUF", 1), /no arm PSHUF/));
    const theirs = (arm, s) => mushroom.lines.find((x) => x.kind === "draw" && x.task === "ONE" && x.arm === arm && x.s === s).teachHash;
    ok("!! THE TEACHERS ARE THE MUSHROOM ROUND'S: for every draw, PLASTIC's and SHUFPN's hash is its committed PLASTIC record's, PFAM's its committed PFAM record's; PFAM's are another draw's for another draw",
        O.SEEDS.every((s) => M.teachHash(O.flyOf("PLASTIC", s).teach) === theirs("PLASTIC", s) && M.teachHash(O.flyOf("SHUFPN", s).teach) === theirs("PLASTIC", s) && M.teachHash(O.flyOf("PFAM", s).teach) === theirs("PFAM", s)) && theirs("PFAM", 2) !== theirs("PFAM", 3) && theirs("PFAM", 2) !== theirs("PLASTIC", 2));
});

console.log("\n4. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE RECIPE (the mushroom round's), draws 1 to 12, the arms PLASTIC SHUFPN PFAM, the lead PLASTIC, task ONE; alpha 0.01; USES above 0.01; the shuffle's seed 4000 + draw; this round's results file; the mushroom round's file named by its sha256 -- and it has it today",
        O.RECIPE === M.RECIPE && J(O.RECIPE) === J({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && J(O.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(O.ARMS) === J(["PLASTIC", "SHUFPN", "PFAM"]) && O.LEAD === "PLASTIC" &&
        O.ALPHA === 0.01 && O.USES_BY === 0.01 && O.SHUF_SEED === 4000 && O.RESULTS === "brain/flyMushroomOdoursRound.jsonl" && O.MUSHROOM === "brain/flyMushroomRound.jsonl" && O.MUSHROOM_SHA256 === "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31" && mushroom.sha256 === O.MUSHROOM_SHA256);
    const lives = new Set(); let clash = 0; const add = (x) => { if (lives.has(x)) clash++; lives.add(x); };
    O.AUDIT.forEach(add); M.AUDIT.forEach(add); for (let k = 0; k < 200; k++) { add(3000001 + 7919 * k); add(6000001 + 7919 * k); } for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k);
    ok("!! THE AUDIT: 200 lives 11000001 + 7919 k, none the mushroom rounds' audit, a training life, the fixed battery's or a scoping life (1,056 different seeds)", O.AUDIT.length === 200 && O.AUDIT[0] === 11000001 && O.AUDIT[199] === 11000001 + 7919 * 199 && clash === 0 && lives.size === 200 * 4 + 240 + 16);
    ok("!! EACH ARM'S WIRING: PLASTIC's and PFAM's the real one, SHUFPN's the shuffle on seed 4000 + draw (made once a draw, another each draw); an arm or draw that is not one is refused by name",
        O.wiringOf("PLASTIC", 4) === O.WIRING.real && O.wiringOf("PFAM", 9) === O.WIRING.real && J(O.wiringOf("SHUFPN", 5)) === J(shuffleByHand(4005)) && O.wiringOf("SHUFPN", 5) === O.wiringOf("SHUFPN", 5) && O.wiringHash(O.wiringOf("SHUFPN", 5)) !== O.wiringHash(O.wiringOf("SHUFPN", 6)) &&
        O.wiringHash(REAL) === createHash("sha256").update(J(REAL)).digest("hex").slice(0, 16) && throws(() => O.wiringOf("FROZEN", 1), /no arm FROZEN/) && throws(() => O.wiringOf("SHUFPN", 0), /a draw is a whole number from 1/));
    const fl = O.floors(TWO), hand = () => M.policyOf("PLASTIC", 1).setParams(M.HAND);
    ok("!! THE FLOORS: the untrained fly and the mushroom round's hand rule on the real wiring, lives flown here by hand; the overlap of a life's two odours by hand",
        near(fl.start, flyMean(() => M.policyOf("PLASTIC", 1), REAL, TWO), 1e-12) && near(fl.hand, flyMean(hand, REAL, TWO), 1e-12) && fl.kind === "floors" && near(O.overlapOf(REAL, TWO), overlapByHand(REAL, TWO), 1e-12) && near(O.overlapOf(O.wiringOf("SHUFPN", 2), TWO), overlapByHand(shuffleByHand(4002), TWO), 1e-12),
        `start ${fl.start.toFixed(4)}, hand ${fl.hand.toFixed(4)}, overlap ${O.overlapOf(REAL, TWO).toFixed(3)}`);
    const w = PF.unpackWeights(mushroom.lines.find((x) => x.kind === "draw" && x.task === "ONE" && x.arm === "PFAM" && x.s === 3).weights), sh3 = O.wiringOf("SHUFPN", 3);
    ok("auditScore is the mean return of lives of task ONE flown here by hand, on the wiring given (the mushroom round's PFAM draw 3, on the real wiring and on a shuffle)",
        near(O.auditScore(O.flyOf("PFAM", 3).setParams(w), REAL, TWO), flyMean(() => M.policyOf("PFAM", 3).setParams(w), REAL, TWO), 1e-12) && near(O.auditScore(O.flyOf("PFAM", 3).setParams(w), sh3, TWO), flyMean(() => M.policyOf("PFAM", 3).setParams(w), shuffleByHand(4003), TWO), 1e-12),
        `${O.auditScore(O.flyOf("PFAM", 3).setParams(w), REAL, TWO).toFixed(4)} real, ${O.auditScore(O.flyOf("PFAM", 3).setParams(w), sh3, TWO).toFixed(4)} shuffled`);
    const note = src("brain/FLY_MUSHROOM_ODOURS_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the 72 glomeruli; p 0.3 at 0.5 to 1; B redrawn with p 0.5; noise 0.2; multiglomerular ones silent; the 5 percent; task ONE; the three arms and the shuffle's seed; draws 1 to 12; the audit; PLASTIC draw 1 twice; T1, T2, H, USES",
        /\*\*the 72 glomeruli\*\*/.test(note) && /\*\*with probability 0\.3\*\* at a strength from 0\.5 to 1/.test(note) && /\*\*odour B is A with each glomerulus drawn again with probability 0\.5\*\*/.test(note) && /times \(1 \+ 0\.2 x a normal draw\)/.test(note) &&
        /\(multiglomerular ones not at all\)/.test(note) && /\*\*the 5 percent with the most input fire\*\* \(203 cells/.test(note) && /\*\*Task ONE only\*\*/.test(note) && /\(seed \*\*4000 \+ draw\*\*\)/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /\*\*The audit: 200 lives, seeds 11000001 \+ 7919 k\*\*/.test(note) && /\*\*PLASTIC draw 1 is trained a second time\.\*\*/.test(note) && /\*\*T1: PLASTIC against SHUFPN\*\* \(rank sum\)/.test(note) && /\*\*T2: PLASTIC against PFAM\*\* \(rank sum\)/.test(note) &&
        /\*\*H: PLASTIC against the hand rule\*\* on this task \(sign test\)/.test(note) && /\*\*Counted: USES\*\* in each arm \(the score less the score with p_a at 0, above 0\.01\)/.test(note));
});

console.log("\n5. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 906)");
section(() => {
    const r = O.trainOne("SHUFPN", 906, TINY, TWO), w = PF.unpackWeights(r.weights), wiring = shuffleByHand(4906);
    const byHand = trainDockES({ envFactory: () => envOf("ONE", wiring), obsDim: 1, actDim: 1, maxSteps: 30, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 906, freshEpisodes: true, batteryEps: 2, policyFactory: () => new MF.MushroomFly({ nk: 4064, nm: 91, edges: M.CIRCUIT.edges, teach: M.teachFor("PLASTIC", 906) }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A TASK AND FLY MADE HERE BY HAND (task ONE on the draw's shuffled wiring; the fly on the real teachers; the draw's seed; fresh lives; the battery), to the hash; it carries its wiring's and teachers' hashes",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 93 && r.wiringHash === O.wiringHash(wiring) && r.teachHash === M.teachHash(M.teachFor("PLASTIC", 906)) && J(r.recipe) === J(TINY) && r.kind === "draw" && r.arm === "SHUFPN" && r.s === 906 && r.score !== 0 && r.score !== r.ratesOff);
    const off = Float32Array.from(w); off[92] = 0;
    ok("!! ITS SCORE, ITS SCORE WITH p_a AT 0, ITS RATE AND ITS ODOURS' OVERLAP ARE LIVES FLOWN HERE BY HAND on its wiring, with its weights",
        near(r.score, flyMean(() => M.policyOf("PLASTIC", 906).setParams(w), wiring, TWO), 1e-12) && near(r.ratesOff, flyMean(() => M.policyOf("PLASTIC", 906).setParams(off), wiring, TWO), 1e-12) && r.rate === 0.5 * Math.max(0, w[92]) && near(r.overlap, overlapByHand(wiring, TWO), 1e-12),
        `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}, overlap ${r.overlap.toFixed(3)}`);
});

console.log("\n6. THE RECORDS (made here)");
section(() => {
    const theirs = (arm, s) => mushroom.lines.find((x) => x.kind === "draw" && x.task === "ONE" && x.arm === O.teachArm(arm) && x.s === s).teachHash;
    const rec = (arm, s, score, off = score - 0.3) => { const wt = new Float32Array(93).fill(0.001 * s); wt[92] = arm === "PFAM" ? 1.5 : 1.2; return { kind: "draw", arm, s, recipe: { ...O.RECIPE }, wiringHash: O.wiringHash(O.wiringOf(arm, s)), teachHash: theirs(arm, s), weightCount: 93,
        weights: PF.packWeights(wt), weightsHash: PF.hashWeights(wt), rate: 0.6, ratesOff: off, score, overlap: arm === "SHUFPN" ? 0.4 : 0.39, history: [{ it: 0, ret: 0.1 }, { it: 59, ret: 0.7 }] }; };
    const file = (f, re = (out) => ({ kind: "recheck", arm: "PLASTIC", s: 1, weightsHash: out.find((r) => r.arm === "PLASTIC" && r.s === 1).weightsHash })) => { const out = []; for (const arm of O.ARMS) for (const s of O.SEEDS) out.push(rec(arm, s, ...f(arm, s))); out.push(re(out), { kind: "floors", start: -0.02, hand: 0.53 }); return out; };
    // PLASTIC 0.80 + s/1e4; SHUFPN under every one of them; PFAM interleaved; PFAM draw 4 does not use its rate (0.005 lost with p_a at 0)
    const sc = (arm, s) => { const v = ({ PLASTIC: 0.8, SHUFPN: 0.76, PFAM: 0.8 + 0.00005 })[arm] + s / 1e4; return arm === "PFAM" && s === 4 ? [v, v - 0.005] : [v]; }, good = file(sc), R = O.reading(good, mushroom), lines = O.readingLines(R).join("\n");
    const bad = (recs, re) => O.checkRecords(recs, mushroom).some((x) => re.test(x));
    ok("!! a file of 36 draws with PLASTIC draw 1 twice and the floors passes every check; a draw missing, another recipe, SHUFPN on the real wiring, PFAM with the real teachers, a weight count not 93, weights not their hash, no score with p_a at 0 and no overlap each fail by name",
        O.checkRecords(good, mushroom).length === 0 && good.length === 38 && /^the checks hold: the vendored wiring and the mushroom round's file as committed/.test(lines) && bad(good.filter((r) => !(r.arm === "PFAM" && r.s === 12)), /PFAM draw 12 is there 0 times/) &&
        bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 3 ? { ...r, recipe: { ...r.recipe, battery: 24 } } : r)), /PLASTIC draw 3 was trained with another recipe/) && bad(good.map((r) => (r.arm === "SHUFPN" && r.s === 4 ? { ...r, wiringHash: O.wiringHash(REAL) } : r)), /SHUFPN draw 4's projection-neuron wiring is not its arm's/) &&
        bad(good.map((r) => (r.arm === "PFAM" && r.s === 5 ? { ...r, teachHash: theirs("PLASTIC", 5) } : r)), /PFAM draw 5's teachers are not the mushroom round's PFAM draw 5's/) && bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 2 ? { ...r, weightCount: 92 } : r)), /PLASTIC draw 2 has 92 weights/) &&
        bad(good.map((r) => (r.arm === "SHUFPN" && r.s === 6 ? { ...r, weightsHash: "0".repeat(16) } : r)), /SHUFPN draw 6's weights are not 93 finite numbers with its hash/) && bad(good.map((r) => (r.arm === "PFAM" && r.s === 7 ? { ...r, ratesOff: null } : r)), /PFAM draw 7 has no score with its rate at 0/) &&
        bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 8 ? { ...r, overlap: 1.2 } : r)), /PLASTIC draw 8 has no overlap of its odours from 0 to 1/));
    ok("!! a second training of PLASTIC draw 1 that differs fails; no floors fail; the mushroom round's file not the one committed, or failing its own checks, and the vendored wiring not the file committed, each fail by name and no record is weighed",
        J(O.checkRecords(file(sc, () => ({ kind: "recheck", arm: "PLASTIC", s: 1, weightsHash: "f".repeat(16) })), mushroom)) === J(["PLASTIC draw 1 trained a second time is not there once with the same weights"]) &&
        J(O.checkRecords(good.filter((r) => r.kind !== "floors"), mushroom)) === J(["the floors are not there once"]) &&
        J(O.checkRecords(good, { ...mushroom, sha256: "0".repeat(64) })) === J(["the mushroom round's file is not the one committed (sha256 b4d8db8d81395987...)"]) &&
        J(O.checkRecords(good, mushroom, "2".repeat(64))) === J(["the vendored projection-neuron wiring is not the file committed (sha256 b885db58c7284b20...)"]) &&
        J(O.checkRecords(good, { ...mushroom, lines: mushroom.lines.filter((r) => !(r.task === "REV" && r.arm === "PSHUF" && r.s === 9)) })) === J(["the mushroom round's file fails its own checks: REV PSHUF draw 9 is there 0 times (once is registered)"]));
    ok("!! T1 AND T2 ARE PLASTIC AGAINST SHUFPN AND AGAINST PFAM (exact rank sums), H PLASTIC AGAINST THE HAND RULE (a sign test): T1 BETTER (222), T2 CANNOT (144), H BETTER (12 above 0.53); USES 12, 12 and 11",
        R.T1.b === "SHUFPN" && R.T1.word === O.WORDS.T1[0] && R.T1.sumA === 222 && R.T2.b === "PFAM" && R.T2.word === O.WORDS.T2[2] && R.T2.sumA === 144 && R.H.word === O.WORDS.H[0] && R.H.above === 12 && R.H.ref === 0.53 &&
        R.arms.PLASTIC.uses === 12 && R.arms.SHUFPN.uses === 12 && R.arms.PFAM.uses === 11 && near(R.arms.PLASTIC.mean, 0.80065) && near(R.arms.SHUFPN.overlap, 0.4, 1e-12) &&
        /T1 \(PLASTIC against SHUFPN\): PLASTIC's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE FLY ON THE REAL PROJECTION-NEURON WIRING, TAUGHT BY ITS REAL TEACHERS, LEARNS THE ODOURS BETTER THAN ONE ON A SHUFFLE OF THAT WIRING/.test(lines) && /USES 11 of 12/.test(lines));
    const worse = O.reading(file((arm, s) => (arm === "PLASTIC" ? [0.5 + s / 1e4] : sc(arm, s))), mushroom), tied = O.reading(file((arm, s) => (arm === "PFAM" ? sc("PLASTIC", s) : sc(arm, s))), mushroom), noFl = O.reading(good.filter((r) => r.kind !== "floors"), mushroom);
    ok("PLASTIC under every other fly and under the hand rule is T1 and T2 WORSE (78) and H WORSE (0 above); PLASTIC equal to PFAM fly for fly is 12 ties and CANNOT (ties count against the claim); with a failed check no reading is weighed and the first line says so",
        worse.T1.word === O.WORDS.T1[1] && worse.T1.sumA === 78 && worse.T2.word === O.WORDS.T2[1] && worse.H.word === O.WORDS.H[1] && worse.H.above === 0 && tied.T2.ties === 12 && tied.T2.word === O.WORDS.T2[2] && noFl.T1 === null && noFl.H === null && /^A CHECK FAILED/.test(O.readingLines(noFl)[0]));
});

console.log("\n7. THE COMMAND");
section(() => {
    const file = path.join(ENG, O.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "PSHUF", "1"], ["job", "PLASTIC", "x"], ["job", "PLASTIC", "0"], ["job", "PFAM", "13"], ["job", "ONE", "PLASTIC", "1"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for the three arms and draws 1 to 12 -- and nothing else", J(O.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(O.parseArgs(["read"])) === J({ cmd: "read" }) && J(O.parseArgs(["job", "SHUFPN", "12"])) === J({ cmd: "job", arm: "SHUFPN", s: 12 }) && no.every((a) => O.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroomOdours.mjs");
    ok("!! the command is this round's -- its library and results file, the mushroom round's file read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered defaults, trains only what the file does not hold, and trains PLASTIC draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroomOdours\.mjs"/.test(csrc) && /PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, PF\.MUSHROOM\)\)\)/.test(csrc) &&
        /JSON\.stringify\(PF\.trainOne\(args\.arm, args\.s\)\)/.test(csrc) && /done = new Set\(have\.filter\(\(r\) => r\.kind === "draw"\)/.test(csrc) && /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\], weightsHash: r\.weightsHash/.test(csrc) &&
        /PF\.reading\(linesOf\(\), mushroomFile\(\)\)/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroomOdours\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyMushroomOdours-selfcheck.mjs"), calls = [...me.matchAll(/O\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations with 4 flies tried on draw 906, audited on 2 lives not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"SHUFPN", 906, TINY, TWO']) && !TWO.some((x) => O.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before, `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyMushroomOdours-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
