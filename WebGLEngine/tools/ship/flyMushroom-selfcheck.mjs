// WebGLEngine/tools/ship/flyMushroom-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroom-selfcheck.mjs      (about ten seconds; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE MUSHROOM BODY ROUND (registered in brain/FLY_MUSHROOM_BODY_WIP.md before brain/rl/odorEnv.mjs, brain/rl/mushroomFly.mjs, tools/ship/flyMushroom.mjs and
// tools/ship/takeFlyMushroom.mjs existed): does each output neuron's own dopamine teacher matter?
//   1  THE CIRCUIT              by hand from the vendored file: the cells, the connections, the families, the teachers, the hand rule
//   2  THE TASK                 a life by hand from its seed: the odours, the bad one, each presentation, the rewards, the swap on REV
//   3  THE FLY                  the drive and the teaching by hand on a circuit of five cells; a life starts afresh; a frozen fly is not taught
//   4  THE ROUND'S NUMBERS      the recipe, draws, arms, tasks, weights, audit; PFAM and PSHUF by hand; the floors; the registration says the same
//   5  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its scores again
//   6  THE RECORDS              96 draws; P, T1, T2, H on each task; USES
//   7  THE COMMAND              it is this round's; no training of the round's, no process
//   8  THE VERDICT              the results file as committed unread at 5f64c614, read from the file: the checks, the eight readings, the arms, USES, the rates, re-audits, the trainer,
//                               the measurement after the reading (how mixed the shuffles' teachers are, said as not registered), the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone for the first 32, this gate and
// tools/ship/voxelHome-selfcheck.mjs (which probes the command as a process) for the command's 4; every one red by name, NONE 0 red (the number is the rows red):
//   THE TASK (brain/rl/odorEnv.mjs): E1 the swap after 14 3 | E2 odours of 0.1 3 | E3 the bad odour scores +1 1 | E4 the outcome is never told 1 | E5 REV never swaps 2 | E6 the background 0.02 3
//   THE FLY (brain/rl/mushroomFly.mjs): K1 punishment teaches by the PAM share 3 | K2 the cells firing now are taught 1 | K3 a life does not start afresh 1 | K4 a frozen fly is taught 1 |
//   K5 the teaching unclipped 1 | K6 the response not over what is expected 2 | K7 A_SCALE 1 3 | K8 the expectation without the background 1
//   THE ROUND: F1 PFAM is the real teaching 2 | F2 PSHUF on PFAM's seed 1 | F3 every output neuron, fed or not 8 | F4 PAM punishes and PPL1 feeds 1 | F5 the hand rule's bias 0.05 1 | F6 the
//   audit on scoping lives 1 | F7 T1 against PFAM 2 | F8 BETTER and WORSE swapped 1 | F9 USES needs 0.3 3 | F10 rates at 0 zeroes the bias 1 | F11 the recipe is 40 iterations 3 | F12 the
//   start is the hand rule 1 | F13 H against the start 1 | F14 the round writes another round's file 1
//   THE COMMAND: C1 the second training is REV's 1 | C2 exits 0 on a word it does not know 1 | C3 the job's task and arm swapped 1 | C4 reads another round's library 1.  THE NOTE: N1 its swap
//   from trial 15 1 | N2 its PFAM seed 7000 1 | N3 its hand rule's bias 0.2 1 | N4 its T1 against PFAM 1
//   TWO ROWS OF MINE WERE WEAK, AND THE SABOTAGES FOUND ONE: the row that says REV swaps compared my hand-made life with itself, not with the env, so E5 (REV never swaps) reached only the
//   trial-by-trial row; it now reads the env's own trials, and E1 and E5 were run again (3 and 2 red, as above). Before the sabotages, the row on the fed teaching compared two expressions
//   that are the same number; it now checks the trial after, where the cells taught must be the last trial's.
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's score changed in a digit the double holds 2 | V2 T1 against PFAM 6 |
//   V3 USES needs 0.3 5 | V4 the rank sums' BETTER and WORSE swapped 5 | V5 the note's ONE T1 says WORSE 1 | V6 the note's expectation of REV's H is CANNOT 1 | V7 the note names another
//   commit 1 | V8 the note drops what pays 1 | V9 the note drops what it does not mean 1 | V10 rates at 0 zeroes the bias 2 | V11 the note's shuffles 29 to 45 1 | V12 the hand rule's
//   floor on ONE changed in a digit the double holds 2. None went 0 red. V12 WAS A FINDING: it first went red only on the file's hash (nothing recomputed the floors, and the arms row reads
//   them to 5e-5); the re-audit row now flies the floors again to the bit, and V12 was run again (2 red, as above).
//   ONE ROW OF MINE WAS WRONG WHEN FIRST RUN: PFAM's purity is the real map's shares in another order, so their mean differs in the last bit; it is now compared to 1e-12, and the note
//   says "the same shares, moved" where it said "exactly".
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as MF from "../../brain/rl/mushroomFly.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];

console.log("flyMushroom-selfcheck -- the mushroom body round (dopamine teaches the Kenyon-cell-to-output connections; the real teachers, pure ones given to other neurons, mixed ones): the circuit, the task, the fly, the numbers, one training, the records, the command\n");

console.log("1. THE CIRCUIT (vendor/male-cns/mushroom-body-circuit.json, read by hand)");
section(() => {
    const d = JSON.parse(src("vendor/male-cns/mushroom-body-circuit.json")), C = d.cells, of = (g) => C.map((c, i) => i).filter((i) => C[i].group === g), kc = of("KC"), dan = of("DAN"), mb = of("MBON");
    const isK = new Set(kc), fedBy = new Set(d.edges.filter(([i, j]) => isK.has(i) && C[j].group === "MBON").map((e) => e[1])), used = mb.filter((j) => fedBy.has(j)), um = new Map(used.map((j, p) => [j, p])), kp = new Map(kc.map((i, p) => [i, p])), dp = new Map(dan.map((i, p) => [i, p]));
    const km = d.edges.filter(([i, j]) => kp.has(i) && um.has(j)), dm = d.edges.filter(([i, j]) => dp.has(i) && um.has(j));
    ok("!! THE CELLS: 4,064 Kenyon cells, 97 output neurons of which the 91 with Kenyon-cell input are the fly's (in the file's order), 340 dopamine neurons",
        M.CIRCUIT.nk === 4064 && kc.length === 4064 && mb.length === 97 && used.length === 91 && M.CIRCUIT.nm === 91 && M.CIRCUIT.nd === 340 && dan.length === 340 && J(M.CIRCUIT.types) === J(used.map((j) => C[j].type)));
    const byHand = km.map(([i, j, n]) => [kp.get(i), um.get(j), n]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), dmHand = dm.map(([i, j, n]) => [dp.get(i), um.get(j), n]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    ok("!! THE CONNECTIONS: 33,496 Kenyon cell -> output neuron with 402,850 synapses, and 1,404 dopamine neuron -> output neuron onto the 91 (each pair once in the file), as the file has them",
        J(M.CIRCUIT.edges) === J(byHand) && M.CIRCUIT.edges.length === 33496 && byHand.reduce((a, e) => a + e[2], 0) === 402850 && J(M.CIRCUIT.dm) === J(dmHand) && dmHand.length === 1404);
    const famHand = dan.map((i) => (/^PPL1/.test(C[i].type) ? 1 : /^PAM/.test(C[i].type) ? 2 : 0)), T = M.teachFor("PLASTIC", 1);
    const tHand = Array.from({ length: 91 }, () => [0, 0, 0]); for (const [dd, m, n] of dmHand) tHand[m][famHand[dd]] += n;
    const dom = tHand.filter((t) => t[0] + t[1] + t[2] > 0).map((t) => Math.max(...t) / (t[0] + t[1] + t[2])), avg = dom.reduce((a, b) => a + b, 0) / dom.length;
    ok("!! THE TEACHERS: each neuron's shares of dopamine synapses from PPL1 and from PAM; 52 neurons mostly PPL1-taught, 36 mostly PAM-taught, 3 neither; over the 90 with dopamine input the dominant family's share averages 0.985",
        J(M.CIRCUIT.fam) === J(famHand) && famHand.filter((x) => x === 1).length + famHand.filter((x) => x === 2).length < 340 && T.every((t, m) => { const s = tHand[m][0] + tHand[m][1] + tHand[m][2]; return s ? t[0] === tHand[m][1] / s && t[1] === tHand[m][2] / s : t[0] === 0 && t[1] === 0; }) &&
        T.filter(([p, f]) => p > f).length === 52 && T.filter(([p, f]) => f > p).length === 36 && T.filter(([p, f]) => p === f).length === 3 && dom.length === 90 && near(avg, 0.985, 5e-4), `${avg.toFixed(4)}`);
    const H = M.HAND, sg = T.map(([p, f]) => (p > f ? 1 : f > p ? -1 : 0));
    ok("!! THE HAND RULE: v +1/88 for each PPL1-taught neuron, -1/88 for each PAM-taught one, 0 for the 3; bias 0.1; p_a 2 (as 32-bit weights)", H.length === 93 && sg.every((x, m) => H[m] === Math.fround(x / 88)) && H[91] === Math.fround(0.1) && H[92] === 2);
});

console.log("\n2. THE TASK (brain/rl/odorEnv.mjs, a life by hand)");
section(() => {
    ok("the numbers: 30 trials, the swap after 15, odours of 0.05, cells firing 0.8 in an odour and 0.01 outside, the tasks ONE and REV", OE.TRIALS === 30 && OE.SWAP_AT === 15 && OE.P_ODOR === 0.05 && OE.P_ON === 0.8 && OE.P_BG === 0.01 && J(OE.TASKS) === J(["ONE", "REV"]));
    const life = (task, seed, acts) => { const r = OE.stream(seed), nk = 4064, od = [0, 1].map(() => { const s = new Uint8Array(nk); for (let k = 0; k < nk; k++) if (r() < 0.05) s[k] = 1; return s; }), bad = r() < 0.5 ? 0 : 1, out = []; let us = 0, ret = 0;
        for (let t = 0; t < 30; t++) { const o = r() < 0.5 ? 0 : 1, x = []; for (let k = 0; k < nk; k++) if (od[o][k] ? r() < 0.8 : r() < 0.01) x.push(k); out.push({ t, x, us }); const isBad = task === "REV" && t >= 15 ? o !== bad : o === bad, go = acts(t) > 0, rw = go ? (isBad ? -1 : 1) / 15 : 0; us = go ? (isBad ? -1 : 1) : 0; ret += rw; out[t].reward = rw; }
        return { out, ret, sizes: od.map((s) => s.reduce((a, b) => a + b, 0)) }; };
    const run = (task, seed, acts) => { const env = new OE.OdorEnv({ task, nk: 4064 }), got = []; let o = env.reset(seed), done = false, t = 0; while (!done) { const r = env.step([acts(t)]); got.push({ ...o, reward: r.reward }); o = r.obs; done = r.done; t++; } return { got, ret: env.ret, last: o }; };
    const acts = (t) => (t % 3 === 0 ? -1 : 1), A = life("ONE", 4242, acts), B = run("ONE", 4242, acts), Ar = life("REV", 4242, acts), Br = run("REV", 4242, acts);
    ok("!! A LIFE BY HAND FROM ITS SEED (the odours, the bad one, each presentation, the outcome told the next trial, +1/15 and -1/15 for an approach, 0 for staying away) is the env's, trial by trial, on ONE and on REV; the return is the rewards' sum",
        J(A.out) === J(B.got) && J(Ar.out) === J(Br.got) && near(A.ret, B.ret, 1e-12) && near(Ar.ret, Br.ret, 1e-12) && B.got.length === 30 && B.last.t === 30 && B.last.x.length === 0);
    const firstHalf = (o) => o.slice(0, 15).map((x) => x.reward), sec = (o) => o.slice(15).map((x) => x.reward);
    ok("!! ON REV THE MEANINGS SWAP FROM THE 16TH TRIAL (the env's own trials): the same life's rewards on its first 15 trials are ONE's, and on the last 15 the negative of ONE's wherever the fly approached", J(firstHalf(B.got)) === J(firstHalf(Br.got)) && sec(B.got).every((r, i) => r === -sec(Br.got)[i] || (r === 0 && sec(Br.got)[i] === 0)) && sec(B.got).some((r) => r !== 0));
    const sizes = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((s) => life("ONE", s, () => 1).sizes), mean = sizes.reduce((a, b) => a + b, 0) / sizes.length, env = new OE.OdorEnv({ task: "ONE", nk: 4064 }), r0 = env.reset(4242), st = env.step([1]);
    ok("an odour is about 203 cells (16 drawn: mean between 190 and 216); info.dist is 1 less the return so far and the fly is never docked or crashed; a task or cell count that is not one is refused by name",
        mean > 190 && mean < 216 && st.info.docked === false && st.info.crashed === false && near(st.info.dist, 1 - env.ret, 1e-15) && r0.t === 0 && r0.us === 0 && throws(() => new OE.OdorEnv({ task: "TWO", nk: 5 }), /ONE or REV/) && throws(() => new OE.OdorEnv({ task: "ONE" }), /nk is the number/), `${mean.toFixed(1)}`);
});

console.log("\n3. THE FLY (brain/rl/mushroomFly.mjs, by hand on five cells and three output neurons)");
section(() => {
    const edges = [[0, 0, 2], [1, 0, 1], [1, 2, 3], [3, 1, 4], [4, 2, 1]], teach = [[1, 0], [0, 1], [0.5, 0.5]], E = MF.EXPECT, base = [3 * E, 4 * E, 4 * E];
    const fly = new MF.MushroomFly({ nk: 5, nm: 3, edges, teach }), v = [0.3, -0.2, 0.5], bias = 0.07, pa = 1.4, a = 0.5 * pa; fly.setParams(Float32Array.from([...v, bias, pa]));
    const V = Array.from(Float32Array.from(v)), Bi = Math.fround(bias), aa = 0.5 * Math.fround(pa), dr = (s) => { let x = Bi; for (let m = 0; m < 3; m++) x += V[m] * (s[m] / base[m] - 1); return x; };
    const d0 = fly.act({ t: 0, x: [0, 1], us: 0 })[0], d1 = fly.act({ t: 1, x: [1, 3], us: -1 })[0];
    const w = { "00": 2 * (1 - aa), "10": 1 * (1 - aa), "12": 3 * (1 - 0.5 * aa) };
    ok("!! THE DRIVE BY HAND: bias + sum v_m (response_m - 1), the response being the firing cells' w onto m over m's synapses x (0.05 x 0.8 + 0.95 x 0.01); and AFTER A PUNISHED APPROACH every cell that fired then has its connection onto m multiplied by 1 - min(1, a T_m) with T the PPL1 share",
        near(MF.EXPECT, 0.0495, 1e-15) && near(d0, dr([3, 0, 3]), 1e-12) && near(d1, dr([w["10"], 4, w["12"]]), 1e-12) && near(fly.rate(), aa, 1e-15) && MF.A_SCALE === 0.5);
    const d2 = fly.act({ t: 2, x: [0, 4], us: 1 })[0], d3 = fly.act({ t: 3, x: [1, 3], us: 0 })[0];
    ok("!! AFTER A FED APPROACH THE PAM SHARE TEACHES INSTEAD, AND THE CELLS TAUGHT ARE THE LAST TRIAL'S: cells 1 and 3 (fired at trial 1) lose 1 - min(1, a T_feed) onto neurons 1 and 2, cell 0 and 4 (firing now) are untouched; a trial staying away teaches nothing",
        near(d2, dr([w["00"], 0, 1]), 1e-12) && near(d3, dr([w["10"], 4 * (1 - aa), w["12"] * (1 - 0.5 * aa)]), 1e-12) && near(fly.act({ t: 4, x: [1, 3], us: 0 })[0], d3, 1e-12));
    const again = fly.act({ t: 0, x: [0, 1], us: -1 })[0], big = new MF.MushroomFly({ nk: 5, nm: 3, edges, teach }).setParams(Float32Array.from([...v, bias, 9])), b0 = big.act({ t: 0, x: [0, 1], us: 0 }), b1 = big.act({ t: 1, x: [0, 1], us: -1 })[0];
    ok("!! A LIFE STARTS AFRESH (t 0: every w back at its synapses, nothing taught by the last life's outcome), and a rate past 1 removes a fully taught connection rather than turning it negative", near(again, d0, 1e-12) && b0 && near(b1, Bi + V[0] * (0 / base[0] - 1) + V[1] * (0 / base[1] - 1) + V[2] * (3 * (1 - Math.min(1, 4.5 * 0.5)) / base[2] - 1), 1e-12));
    const fz = new MF.MushroomFly({ nk: 5, nm: 3, edges, teach, plastic: false }); fz.setParams(Float32Array.from([...v, bias])); const f0 = fz.act({ t: 0, x: [0, 1], us: 0 })[0], f1 = fz.act({ t: 1, x: [0, 1], us: -1 })[0];
    ok("!! A FROZEN FLY IS NOT TAUGHT: its weights are [v, bias] (4 here, 92 in the round), its rate 0, and a punished approach changes nothing", fz.paramCount() === 4 && fz.rate() === 0 && f0 === f1 && new MF.MushroomFly({ nk: 5, nm: 3, edges, teach }).paramCount() === 5);
    const st = new MF.MushroomFly({ nk: 5, nm: 3, edges, teach }).getParams();
    ok("the start is v 0, bias 0.05, p_a 1 (it approaches everything: its drive is its bias); a circuit that is not one is refused by name", J(Array.from(st)) === J([0, 0, 0, Math.fround(0.05), 1]) && MF.START_BIAS === 0.05 && throws(() => new MF.MushroomFly({ nk: 5, nm: 3, edges: [[5, 0, 1]], teach }), /edges are \[k, m, n\]/) && throws(() => new MF.MushroomFly({ nk: 5, nm: 3, edges, teach: [[1, 0]] }), /3 pairs of shares/) && throws(() => fly.setParams([1]), /5 weights/));
});

console.log("\n4. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE RECIPE (the compass round's), draws 1 to 12, the arms FROZEN PLASTIC PFAM PSHUF with 92, 93, 93, 93 weights, the tasks ONE and REV, the lead PLASTIC; alpha 0.01; USES above 0.01; this round's results file; the shuffles' seeds 6000 and 5000 + draw",
        J(M.RECIPE) === J({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && J(M.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(M.ARMS) === J(["FROZEN", "PLASTIC", "PFAM", "PSHUF"]) && J(M.WEIGHTS) === J({ FROZEN: 92, PLASTIC: 93, PFAM: 93, PSHUF: 93 }) &&
        J(M.TASKS) === J(OE.TASKS) && M.LEAD === "PLASTIC" && M.ALPHA === 0.01 && M.USES_BY === 0.01 && M.RESULTS === "brain/flyMushroomRound.jsonl" && M.PFAM_SEED === 6000 && M.PSHUF_SEED === 5000);
    const lives = new Set(); let clash = 0; const add = (x) => { if (lives.has(x)) clash++; lives.add(x); };
    for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k); M.AUDIT.forEach(add); for (let k = 0; k < 100; k++) add(3000001 + 7919 * k); for (let k = 0; k < 200; k++) add(6000001 + 7919 * k);
    ok("!! THE AUDIT: 200 lives 9000001 + 7919 k, none a training life, the fixed battery's or a scoping life (856 different seeds)", M.AUDIT.length === 200 && M.AUDIT[0] === 9000001 && M.AUDIT[199] === 9000001 + 7919 * 199 && clash === 0 && lives.size === 240 + 16 + 200 + 300);
    const r = OE.stream(6003), q = [...Array(91).keys()]; for (let i = 90; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    const pf = M.dmEdgesOf("PFAM", 3), real = M.teachFor("PLASTIC", 3), pt = M.teachFor("PFAM", 3), r2 = OE.stream(5007), ps = M.CIRCUIT.dm.map(([dd, , n]) => [dd, Math.floor(r2() * 91), n]), st = M.teachFor("PSHUF", 7);
    const purity = (T) => T.filter(([p, f]) => p + f > 0).map(([p, f]) => Math.max(p, f)).sort().join(",");
    ok("!! PFAM BY HAND: the dopamine connections with the 91 neurons permuted (Fisher-Yates, seed 6000 + draw) -- every neuron's teachers another's, as pure as the real ones (the same shares, moved); PSHUF BY HAND: each connection onto a neuron drawn at random (seed 5000 + draw), its teachers mixed",
        J(pf) === J(M.CIRCUIT.dm.map(([dd, m, n]) => [dd, q[m], n])) && pt.every((t, m) => J(t) === J(real[q.indexOf(m)])) && purity(pt) === purity(real) && q.some((x, i) => x !== i) && J(M.dmEdgesOf("PSHUF", 7)) === J(ps) && J(st) === J(M.teachOf(ps)) &&
        st.filter(([p, f]) => p + f > 0).every(([p, f]) => p + f <= 1 + 1e-12) && purity(st) !== purity(real));
    ok("an arm's teachers are made once a draw and the same each time; FROZEN's and PLASTIC's are the real ones; another draw is another permutation; an arm or draw that is not one is refused by name",
        M.teachFor("PFAM", 3) === M.teachFor("PFAM", 3) && M.teachHash(M.teachFor("FROZEN", 5)) === M.teachHash(real) && M.teachHash(M.teachFor("PFAM", 4)) !== M.teachHash(pt) && throws(() => M.teachFor("REAL", 1), /no arm REAL/) && throws(() => M.dmEdgesOf("PSHUF", 0), /whole number from 1/) && throws(() => M.trainOne("PLASTIC", "TWO", 1), /ONE or REV/));
    const fl = M.floors(TINY_AUDIT), w = [0.1, 0.2, 0.3], off = M.ratesOff("PSHUF", 2, [...Array(91).fill(0.01), 0.2, 1.7]);
    ok("!! THE FLOORS: the untrained fly (it approaches everything) and the hand rule, on each task, through the same audit; with p_a at 0 the rest of a fly's weights are kept",
        J(Object.keys(fl.start)) === J(["ONE", "REV"]) && fl.start.ONE === M.auditScore(M.policyOf("PLASTIC", 1), "ONE", TINY_AUDIT) && fl.hand.REV === M.auditScore(M.policyOf("PLASTIC", 1).setParams(M.HAND), "REV", TINY_AUDIT) && off.rate() === 0 && off.getParams()[91] === Math.fround(0.2) && w.length === 3);
    const note = src("brain/FLY_MUSHROOM_BODY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: 30 trials, 0.05, 0.8, 0.01, the swap from trial 16; the rule's 1 - min(1, a T_m) and a = 0.5 max(0, p_a); the start; the four arms and their seeds; draws 1 to 12; the audit; the hand rule; the readings; ONE's PLASTIC draw 1 again",
        /A life is \*\*30 trials\*\*/.test(note) && /probability \*\*0\.05\*\*/.test(note) && /probability \*\*0\.8\*\* and every other cell with probability \*\*0\.01\*\*/.test(note) && /\*\*REV, the meanings swapped from trial 16 on\*\*/.test(note) && /\*\*1 - min\(1, a T_m\)\*\*/.test(note) && /\*\*a = 0\.5 max\(0, p_a\)\*\*/.test(note) &&
        /\*\*The start is v 0, bias 0\.05, p_a 1\.\*\*/.test(note) && /\(seed \*\*6000 \+ draw\*\*\)/.test(note) && /\(seed \*\*5000 \+ draw\*\*\)/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) && /seeds 9000001 \+ 7919 k\*\*/.test(note) && /v_m \+1\/88 for each PPL1-taught neuron and -1\/88 for each PAM-taught one/.test(note) && /bias 0\.1, p_a 2/.test(note) &&
        /\*\*P: PLASTIC against FROZEN\*\* \(rank sum\)/.test(note) && /\*\*T1: PLASTIC against PSHUF\*\* \(rank sum\)/.test(note) && /\*\*T2: PLASTIC against PFAM\*\* \(rank sum\)/.test(note) && /\*\*H: PLASTIC against the hand rule\*\* \(sign test/.test(note) && /\*\*PLASTIC draw 1 of ONE is trained a second time\.\*\*/.test(note));
});

console.log("\n5. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = M.trainOne("PSHUF", "REV", 901, TINY, TINY_AUDIT), teach = M.teachOf(M.dmEdgesOf("PSHUF", 901));
    const byHand = trainDockES({ envFactory: () => new OE.OdorEnv({ task: "REV", nk: 4064 }), obsDim: 1, actDim: 1, maxSteps: 30, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new MF.MushroomFly({ nk: 4064, nm: 91, edges: M.CIRCUIT.edges, teach }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the fly on the draw's mixed teachers; the REV life; fresh lives; the battery), to the hash; it carries its rate, its score with p_a at 0, its teachers' hash",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 93 && r.teachHash === M.teachHash(teach) && J(r.recipe) === J(TINY) && r.kind === "draw" && r.task === "REV" && r.arm === "PSHUF" && r.s === 901 && Number.isFinite(r.ratesOff) && r.rate === 0.5 * Math.max(0, PF.unpackWeights(r.weights)[92]));
    const w = PF.unpackWeights(r.weights);
    ok("the tiny training's weights give its score again, and its score with p_a at 0 is the same weights' with the last at 0", M.auditScore(M.policyOf("PSHUF", 901).setParams(w), "REV", TINY_AUDIT) === r.score && M.auditScore(M.ratesOff("PSHUF", 901, w), "REV", TINY_AUDIT) === r.ratesOff, `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n6. THE RECORDS (made here)");
section(() => {
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 10, 20, 30, 40, 50, 59][k], ret: 0.2 + k / 100 })), made = new Map();
    const stub = (arm) => { if (!made.has(arm)) { const w = M.policyOf(arm, 1).getParams(); made.set(arm, { weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(arm); };
    const rec = (task, arm, s, score) => ({ kind: "draw", task, arm, s, recipe: { ...M.RECIPE }, teachHash: M.teachHash(M.teachFor(arm, s)), ...stub(arm), rate: arm === "FROZEN" ? 0 : 0.6, ratesOff: arm === "FROZEN" ? null : score - 0.3, score, history: hist });
    const flo = { kind: "floors", start: { ONE: 0.01, REV: 0.0 }, hand: { ONE: 0.86, REV: 0.2 } };
    const file = (f, recheck = { kind: "recheck", task: "ONE", arm: "PLASTIC", s: 1, weightsHash: stub("PLASTIC").weightsHash }) => { const out = []; for (const t of M.TASKS) for (const s of M.SEEDS) for (const arm of M.ARMS) out.push(rec(t, arm, s, f(t, arm, s))); out.push(recheck, flo); return out; };
    // ONE: PLASTIC 0.80 + s/1000 above PFAM 0.80 + s/1000 - 0.0005 (interleaved), above PSHUF 0.70 + s/1000, above FROZEN 0; under the hand rule's 0.86. REV: PLASTIC 0.25 + s/1000 above PSHUF, against the hand 0.2 above
    const sc = (t, arm, s) => (arm === "FROZEN" ? s / 1e4 : t === "ONE" ? { PLASTIC: 0.8, PFAM: 0.8 - 0.0005, PSHUF: 0.7 }[arm] + s / 1000 : { PLASTIC: 0.25, PFAM: 0.25 + 0.0005, PSHUF: 0.02 }[arm] + s / 1000);
    const good = file(sc), R = M.reading(good), lines = M.readingLines(R).join("\n"), O = R.tasks.ONE, V = R.tasks.REV;
    ok("!! a file of 96 draws with ONE's PLASTIC draw 1 a second time and the floors passes every check; a draw missing, PFAM with PSHUF's teachers, FROZEN with a rate, a plastic fly without a score with p_a at 0, the second training of draw 2, and no floors each fail by name",
        M.checkRecords(good).length === 0 && good.length === 98 && /^the checks hold: 96 draws/.test(lines) && M.checkRecords(good.filter((r) => !(r.task === "REV" && r.arm === "PFAM" && r.s === 12))).some((x) => /REV PFAM draw 12 is there 0 times/.test(x)) &&
        M.checkRecords(good.map((r) => (r.arm === "PFAM" && r.s === 5 && r.task === "ONE" ? { ...r, teachHash: M.teachHash(M.teachFor("PSHUF", 5)) } : r))).some((x) => /ONE PFAM draw 5's teachers are not its arm's/.test(x)) && M.checkRecords(good.map((r) => (r.arm === "FROZEN" && r.s === 3 && r.task === "REV" ? { ...r, rate: 0.1 } : r))).some((x) => /REV FROZEN draw 3's rate/.test(x)) &&
        M.checkRecords(good.map((r) => (r.arm === "PSHUF" && r.s === 4 && r.task === "ONE" ? { ...r, ratesOff: null } : r))).some((x) => /ONE PSHUF draw 4 has no score with its rate at 0/.test(x)) && J(M.checkRecords(file(sc, { kind: "recheck", task: "ONE", arm: "PLASTIC", s: 2, weightsHash: stub("PLASTIC").weightsHash }))) === J(["ONE PLASTIC draw 1 trained a second time is not there once with the same weights"]) &&
        J(M.checkRecords(good.filter((r) => r.kind !== "floors"))) === J(["the floors are not there once"]));
    ok("!! P, T1 AND T2 ARE PLASTIC AGAINST FROZEN, PSHUF AND PFAM (exact rank sums), H PLASTIC AGAINST THE TASK'S HAND RULE (a sign test), ON EACH TASK: ONE -> P BETTER (222), T1 BETTER (222), T2 CANNOT, H WORSE (12 below 0.86); REV -> T1 BETTER, T2 CANNOT, H BETTER (12 above 0.2); USES 12 of 12",
        O.P.word === M.WORDS.P[0] && O.P.sumA === 222 && O.T1.word === M.WORDS.T1[0] && O.T1.b === "PSHUF" && O.T2.word === M.WORDS.T2[2] && O.T2.b === "PFAM" && O.H.word === M.WORDS.H[1] && O.H.below === 12 && O.H.ref === 0.86 && V.T1.word === M.WORDS.T1[0] && V.T2.word === M.WORDS.T2[2] && V.H.word === M.WORDS.H[0] && V.H.above === 12 && V.H.ref === 0.2 &&
        O.arms.PLASTIC.uses === 12 && O.arms.FROZEN.uses === null && /REV \(the mean of 12 flies; 200 audit lives\)/.test(lines) && /T1 \(PLASTIC against PSHUF\): PLASTIC's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE FLY TAUGHT BY ITS REAL DOPAMINE CONNECTIONS DOES WORSE THAN THE RULE SET BY HAND/.test(lines));
    const tied = M.reading(file((t, arm, s) => (arm === "PSHUF" ? sc(t, "PLASTIC", s) : sc(t, arm, s)))), lean = M.reading(file((t, arm, s) => sc(t, arm, s))).tasks.ONE.arms;
    ok("PLASTIC equal to PSHUF fly for fly is 12 ties and CANNOT (ties count against the claim); a fly whose score falls by 0.005 with p_a at 0 does not USE it", tied.tasks.ONE.T1.ties === 12 && tied.tasks.ONE.T1.word === M.WORDS.T1[2] && lean.PFAM.uses === 12 && !M.uses({ score: 0.5, ratesOff: 0.495 }) && M.uses({ score: 0.5, ratesOff: 0.2 }) && !M.uses({ score: 0.5, ratesOff: null }));
    const noFl = M.reading(good.filter((r) => r.kind !== "floors"));
    ok("with a failed check no reading is weighed and the first line says so", noFl.tasks.ONE.P === null && noFl.tasks.REV.H === null && /^A CHECK FAILED/.test(M.readingLines(noFl)[0]));
});

console.log("\n7. THE COMMAND");
section(() => {
    const file = path.join(ENG, M.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "PLASTIC", "1"], ["job", "ONE", "REAL", "1"], ["job", "TWO", "PLASTIC", "1"], ["job", "ONE", "PLASTIC", "0"], ["job", "REV", "PSHUF", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job TASK ARM S for ONE or REV, the four arms and draws 1 to 12 -- and nothing else", J(M.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(M.parseArgs(["read"])) === J({ cmd: "read" }) && J(M.parseArgs(["job", "REV", "PFAM", "12"])) === J({ cmd: "job", task: "REV", arm: "PFAM", s: 12 }) && no.every((a) => M.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroom.mjs");
    ok("!! the command is this round's -- its library and results file -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains ONE's PLASTIC draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroom\.mjs"/.test(csrc) && /PF\.trainOne\(args\.arm, args\.task, args\.s\)/.test(csrc) &&
        /if \(!done\.has\(task \+ "\/" \+ arm \+ "\/" \+ s\)\) todo\.push\(\[task, arm, s\]\)/.test(csrc) && /await jobOnce\("ONE", PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", task: "ONE", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroom\.mjs run \[--jobs N\] \| read \| job TASK ARM S/.test(csrc));
    const me = src("tools/ship/flyMushroom-selfcheck.mjs"), calls = [...me.matchAll(/M\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations with 4 flies tried on draw 901 (and one refused); it starts no process; the file's size and time are what they were",
        calls.length === 2 && /^"PLASTIC", "TWO", 1$/.test(calls[0]) && /^"PSHUF", "REV", 901, TINY, TINY_AUDIT$/.test(calls[1]) && TINY.iters === 2 && !M.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `1 training, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n8. THE VERDICT (the whole results file was committed at 5f64c614 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, M.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = M.reading(lines), O = R.tasks.ONE, V = R.tasks.REV, F = R.floors;
    const of = (t, a) => lines.filter((r) => r.kind === "draw" && r.task === t && r.arm === a).sort((x, y) => x.s - y.s), sc = (t, a) => of(t, a).map((r) => r.score), rec = (t, a, s) => of(t, a).find((r) => r.s === s);
    const range = (t, a, f) => [Math.min(...of(t, a).map(f)), Math.max(...of(t, a).map(f))], within = ([lo, hi], L, H) => lo > L && hi < H;
    ok("!! the results file is the one the run wrote: 98 records, sha256 b4d8db8d81395987... (one start, 18.1 minutes on one process)", lines.length === 98 && createHash("sha256").update(bytes).digest("hex") === "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31");
    ok("!! THE CHECKS HOLD: 96 draws each once, the registered recipe, each arm's teachers and weights, ONE's PLASTIC draw 1 the same twice; the floors -- the start -0.0253 on ONE and 0.0080 on REV, the hand rule 0.8943 and 0.2220",
        R.checks.length === 0 && near(F.start.ONE, -0.0253) && near(F.start.REV, 0.0080) && near(F.hand.ONE, 0.8943) && near(F.hand.REV, 0.2220) && lines.find((r) => r.kind === "recheck").weightsHash === rec("ONE", "PLASTIC", 1).weightsHash);
    ok("!! *** ONE: P BETTER (ranks 222, p 7.4e-7) -- T1 BETTER: THE REAL TEACHERS DO BETTER THAN MIXED ONES (ranks 215, p 3.3e-5) -- T2 CANNOT (ranks 141, p 0.63) -- H WORSE: 0 of 12 above the hand rule's 0.8943 (p 0.00049) ***",
        O.P.word === M.WORDS.P[0] && O.P.sumA === 222 && O.T1.word === M.WORDS.T1[0] && O.T1.sumA === 215 && near(O.T1.p, 3.328e-5, 5e-9) && O.T2.word === M.WORDS.T2[2] && O.T2.sumA === 141 && near(O.T2.p, 0.6297, 5e-5) && O.H.word === M.WORDS.H[1] && O.H.above === 0 && O.H.below === 12 && O.H.p === 2 ** -11);
    ok("!! *** REV: P BETTER (222) -- T1 BETTER: EVERY PLASTIC FLY ABOVE EVERY PSHUF ONE (ranks 222, p 7.4e-7) -- T2 CANNOT (ranks 163.5, 1 tie, p 0.48) -- H CANNOT: 10 above the hand rule's 0.2220 and 2 below (p 0.039) ***",
        V.P.word === M.WORDS.P[0] && V.P.sumA === 222 && V.T1.word === M.WORDS.T1[0] && V.T1.sumA === 222 && Math.min(...sc("REV", "PLASTIC")) > Math.max(...sc("REV", "PSHUF")) && V.T2.word === M.WORDS.T2[2] && V.T2.sumA === 163.5 && V.T2.ties === 1 && near(V.T2.p, 0.4776, 5e-5) && V.H.word === M.WORDS.H[2] && V.H.above === 10 && V.H.below === 2 && near(V.H.p, 0.0386, 5e-5));
    const A1 = O.arms, A2 = V.arms;
    ok("!! the arms (mean, sd, least, most): ONE -- FROZEN -0.0157, PLASTIC 0.7757 0.0468 0.6480 0.8320, PFAM 0.7844 0.0483 0.6680 0.8720, PSHUF 0.6235 0.0919 0.4113 0.7567 | REV -- FROZEN 0.0034, PLASTIC 0.2524 0.0296 0.1937 0.3020, PFAM 0.2390 0.0413 0.1520 0.2953, PSHUF 0.0396 0.0232 0.0027 0.0733",
        near(A1.FROZEN.mean, -0.0157) && near(A1.PLASTIC.mean, 0.7757) && near(A1.PLASTIC.sd, 0.0468) && near(A1.PLASTIC.min, 0.6480) && near(A1.PLASTIC.max, 0.8320) && near(A1.PFAM.mean, 0.7844) && near(A1.PFAM.sd, 0.0483) && near(A1.PFAM.min, 0.6680) && near(A1.PFAM.max, 0.8720) && near(A1.PSHUF.mean, 0.6235) && near(A1.PSHUF.sd, 0.0919) && near(A1.PSHUF.min, 0.4113) && near(A1.PSHUF.max, 0.7567) &&
        near(A2.FROZEN.mean, 0.0034) && near(A2.PLASTIC.mean, 0.2524) && near(A2.PLASTIC.sd, 0.0296) && near(A2.PLASTIC.min, 0.1937) && near(A2.PLASTIC.max, 0.3020) && near(A2.PFAM.mean, 0.2390) && near(A2.PFAM.sd, 0.0413) && near(A2.PFAM.min, 0.1520) && near(A2.PFAM.max, 0.2953) && near(A2.PSHUF.mean, 0.0396) && near(A2.PSHUF.sd, 0.0232) && near(A2.PSHUF.min, 0.0027) && near(A2.PSHUF.max, 0.0733));
    ok("!! USES: PLASTIC and PFAM 12 of 12 on both tasks, PSHUF 12 of 12 on ONE and 8 of 12 on REV; WITH THE RATE AT 0 EVERY PLASTIC ARM'S MEAN IS WITHIN 0.02 OF 0 -- all of a fly's score is what it learns in its life, none its readout alone",
        A1.PLASTIC.uses === 12 && A1.PFAM.uses === 12 && A1.PSHUF.uses === 12 && A2.PLASTIC.uses === 12 && A2.PFAM.uses === 12 && A2.PSHUF.uses === 8 && ["PLASTIC", "PFAM", "PSHUF"].every((a) => Math.abs(A1[a].ratesOff) < 0.02 && Math.abs(A2[a].ratesOff) < 0.02));
    ok("described, not registered: the rates the trainer found -- ONE: PLASTIC 0.51 to 1.48, PFAM 0.85 to 1.36, PSHUF 0.73 to 1.47; REV: PLASTIC 0.85 to 1.54, PFAM 0.59 to 1.50, PSHUF 0.31 to 1.26 (at 1 or more a fully taught connection is removed outright)",
        within(range("ONE", "PLASTIC", (r) => r.rate), 0.51, 1.49) && within(range("ONE", "PFAM", (r) => r.rate), 0.84, 1.36) && within(range("ONE", "PSHUF", (r) => r.rate), 0.73, 1.48) && within(range("REV", "PLASTIC", (r) => r.rate), 0.85, 1.55) && within(range("REV", "PFAM", (r) => r.rate), 0.58, 1.51) && within(range("REV", "PSHUF", (r) => r.rate), 0.31, 1.26) && of("ONE", "FROZEN").every((r) => r.rate === 0));
    const again = (t, a, s, zero) => { const w = PF.unpackWeights(rec(t, a, s).weights); return M.auditScore(zero ? M.ratesOff(a, s, w) : M.policyOf(a, s).setParams(w), t); };
    ok("!! RE-AUDITED AFTER THE READING: ONE's PLASTIC draw 3 (the arm's least) gives its score and its score with the rate at 0 again on the 200 lives to the bit, REV's PSHUF draw 8 (the arm's most) its score, and the floors (the start and the hand rule on each task) theirs",
        rec("ONE", "PLASTIC", 3).score === A1.PLASTIC.min && rec("REV", "PSHUF", 8).score === A2.PSHUF.max && again("ONE", "PLASTIC", 3) === rec("ONE", "PLASTIC", 3).score && again("ONE", "PLASTIC", 3, true) === rec("ONE", "PLASTIC", 3).ratesOff && again("REV", "PSHUF", 8) === rec("REV", "PSHUF", 8).score &&
        J(M.floors()) === J(lines.find((r) => r.kind === "floors")));
    const Hs = (T, a) => T.arms[a].history.map((h) => h.ret);
    ok("WHAT THE TRAINER SAW (its own battery, the mean of 12): ONE -- PLASTIC 0.4361 at iteration 0 to 0.7753 at 59, PSHUF 0.1934 to 0.5750; REV -- PLASTIC 0.0274 to 0.2653, PSHUF 0.0549 to 0.0517 (it never found much)",
        near(Hs(O, "PLASTIC")[0], 0.4361) && near(Hs(O, "PLASTIC")[6], 0.7753) && near(Hs(O, "PSHUF")[0], 0.1934) && near(Hs(O, "PSHUF")[6], 0.5750) && near(Hs(V, "PLASTIC")[0], 0.0274) && near(Hs(V, "PLASTIC")[6], 0.2653) && near(Hs(V, "PSHUF")[0], 0.0549) && near(Hs(V, "PSHUF")[6], 0.0517));
    const both = (T) => T.filter(([p, f]) => p > 0.2 && f > 0.2).length, pur = (T) => { const v = T.filter(([p, f]) => p + f > 0).map(([p, f]) => Math.max(p, f) / (p + f)); return v.reduce((a, b) => a + b, 0) / v.length; };
    const mixed = M.SEEDS.map((s) => both(M.teachFor("PSHUF", s))), purs = M.SEEDS.map((s) => pur(M.teachFor("PSHUF", s)));
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED -- WHAT THE SHUFFLE BREAKS: 2 of the real map's 91 output neurons are taught more than a fifth by both families, against 39 to 45 in each of the 12 shuffles; between the two families the real map's dominant share averages 0.986, the shuffles' 0.785 to 0.815, and PFAM's is the real map's (the same shares, moved)",
        both(M.teachFor("PLASTIC", 1)) === 2 && Math.min(...mixed) === 39 && Math.max(...mixed) === 45 && near(pur(M.teachFor("PLASTIC", 1)), 0.9856, 5e-5) && Math.min(...purs) > 0.784 && Math.max(...purs) < 0.816 && M.SEEDS.every((s) => near(pur(M.teachFor("PFAM", s)), pur(M.teachFor("PLASTIC", 1)), 1e-12)), `${mixed.join(" ")}`);
    const note = src("brain/FLY_MUSHROOM_BODY_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 11. The result"));
    ok("the expectations, written before the code, against what came: every one but REV's H -- ONE P BETTER (95), T1 BETTER (60), T2 CANNOT (80), H WORSE (50); REV P BETTER (90), T1 BETTER (90), T2 CANNOT (75), H came CANNOT (40; BETTER was 55); USES 12 of 12 for PLASTIC and PFAM and on ONE for PSHUF, at least 8 on REV, with 8",
        /ONE: P \*\*BETTER about 95 percent\*\*; T1 BETTER about 60, CANNOT 40; T2 \*\*CANNOT about 80\*\*; H WORSE about 50, CANNOT 40\. REV: P \*\*BETTER about 90\*\*; T1 \*\*BETTER about 90\*\*; T2 \*\*CANNOT about 75\*\*; H BETTER about 55, CANNOT 40\./.test(flat) &&
        O.P.word === M.WORDS.P[0] && O.T1.word === M.WORDS.T1[0] && O.T2.word === M.WORDS.T2[2] && O.H.word === M.WORDS.H[1] && V.P.word === M.WORDS.P[0] && V.T1.word === M.WORDS.T1[0] && V.T2.word === M.WORDS.T2[2] && V.H.word === M.WORDS.H[2] && A2.PSHUF.uses >= 8);
    ok("the registration's RESULT SECTION (section 11) carries the eight readings' words, the commit the file was read at, the expectation that did not come, what section 6 said such a reading would say, the measurement after the reading said as such with the gate's numbers, and what it does not mean",
        /## 11\. The result/.test(note) && ["ONE", "REV"].every((t) => ["P", "T1", "T2", "H"].every((n) => res.includes(`**${t} ${n}: ${R.tasks[t][n].word}**`))) && /5f64c614/.test(res) && /REV's H did not/.test(res) && /the pure compartment map pays, and in this model what pays is the purity/.test(res) &&
        /Measured after the reading \(not registered; the gate recomputes it\)/.test(res) && /2 of the real map's 91 output neurons/.test(res) && /39 to 45/.test(res) && /What it does not mean/.test(res) && /not how the animal does it/.test(res));
});

console.log(`\nflyMushroom-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
