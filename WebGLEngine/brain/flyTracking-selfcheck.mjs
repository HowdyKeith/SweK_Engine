// WebGLEngine/brain/flyTracking-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/flyTracking-selfcheck.mjs      (about fifteen seconds: a few fights)
//
// THE FLY'S TRACKING CIRCUIT WIRED AS THE FLY WIRES IT, HELD. brain/flyTracking.mjs drives the LC10a cells of one eye, each at its own place, with a target's bearing, runs the connectome's own signed weights and reads the two DNa02 cells; a gunner lays its gun by it. Five things hold it:
//
//   1  THE PLACES AND THE WEIGHTS ARE THE DATASET'S   brain/lc10Places.mjs is the vendored positions re-derived (a rank across each side's sheet); the baked counts are the vendored circuit's; AOTU019 is the one inhibitory type
//   2  WHAT IS DRIVEN                                 one eye for a target to one side, both within the overlap; among an eye's cells those whose place is where the target is; straight ahead at the medial end for `fly:medial` and at the lateral for `fly:lateral`; `flat` drives an eye's cells alike
//   3  WHAT IT COMPUTES                               S is odd, exactly 0 on target, within [-1, 1]; with places a GRADED command (90% of its peak only past 50 degrees), with none a SWITCH (by 15); a target to the positive side gives a negative S; WITHOUT THE CONSTANT DRIVE ON DNa02 THE INHIBITORY PATHWAY DOES NOTHING;
//                                                     what the shuffles do, SAID AS IT IS: of eight, most keep the shape or mirror it -- this circuit is 275 cells onto two onto two, and a shuffle that keeps or swaps sides whole is the same circuit or its mirror
//   4  THE GUNNER                                     two gains; the rates are tanh(gain x S) of the seat's slew; THE TRIGGER IS THE SIGHT'S; zero gains are a gun that does not move; in a fight a negative gain lays the gun on the enemy and a positive one off it
//   5  THE FRONT DOOR                                 wirings by name; battleshipDuel seats a seatFlyWired file; the pool flies a named wiring; the report; the export list
//
// SABOTAGE LOG: 23 mutants of brain/flyTracking.mjs, each a copy of the module with this gate pointed at it (row 5's `seated in the seats` compares with the real module and is red for every copy: NOT counted). 22 red by name the first time. ONE 0-RED, A GAP, CLOSED: the sine not held at its peak behind a quarter turn (no row asked it for a bearing past 90 degrees; row 5 now does). After it: 23 of 23. Red by name: the eyes swapped, every cell excitatory, no overlap, the places reversed, no places, no constant drive, the read-out swapped, the read-out not odd, the amplitude left at one, a trigger that always fires, one gain for both axes, the elevation's scale, an unbounded rate, `fly:lateral` the medial circuit, `flat` with places, the shuffle the identity, any wiring name taken, a new library each call, two steps, no normalisation, another sigma, S not odd.
"use strict";
import fs from "node:fs";
import * as FT from "./flyTracking.mjs";
import * as LC from "./lc10Topology.mjs";
import * as SY from "./lc10Synapses.mjs";
import * as PL from "./lc10Places.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import { placesOf } from "../tools/bakeDendritePlaces.mjs";
import { leadOf } from "../tools/ship/pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const T = LC.NEURON_TYPES, RAD = Math.PI / 180, J = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), "utf8")), P = J("../vendor/male-cns/lc10-positions.json"), V = J("../vendor/male-cns/lc10-tracking-circuit.json");

console.log("flyTracking-selfcheck -- the fly's tracking circuit wired as the fly wires it\n");

console.log("1. THE PLACES AND THE WEIGHTS ARE THE DATASET'S");
section(() => {
    const pl = placesOf(P), r6 = (v) => Math.round(v * 1e6) / 1e6;
    ok("!! brain/lc10Places.mjs is the vendored positions re-derived: for each of the 275 LC10a cells its rank across its side's sheet and along it (to six places), -1 for the six neurons that are not LC10a; on each side the ranks run from 0 to 1 with no two cells alike", PL.ACROSS.length === 281 && LC.NEURON_ORDER.every((b, i) => (pl.has(b) ? PL.ACROSS[i] === r6(pl.get(b).across) && PL.ALONG[i] === r6(pl.get(b).along) : PL.ACROSS[i] === -1 && PL.ALONG[i] === -1)) && pl.size === 275 && ["L", "R"].every((sd) => { const a = FT.EYES[sd].map((i) => PL.ACROSS[i]).sort((x, y) => x - y); return a[0] === 0 && a[a.length - 1] === 1 && new Set(a).size === a.length; }));
    ok("the baked counts, transmitters and soma sides (brain/lc10Synapses.mjs) are the vendored circuit's; the left eye is the 135 LC10a cells with a left soma, the right the 140; the sign of a connection is its source's transmitter and AOTU019 is the one type that inhibits", SY.EDGE_COUNTS.join() === V.edges.map((e) => e[2]).join() && SY.NEURON_NT.join() === V.neurons.map((n) => n.nt).join() && SY.NEURON_SOMA.join() === V.neurons.map((n) => n.somaSide).join() && FT.EYES.L.length === 135 && FT.EYES.R.length === 140 && FT.EYES.L.every((i) => T[i] === "LC10a" && SY.NEURON_SOMA[i] === "L") && SY.NEURON_NT.every((nt, i) => (FT.signOf(nt) === -1) === (T[i] === "AOTU019")) && T[FT.EYES.DNa02[0]] === "DNa02" && SY.NEURON_SOMA[FT.EYES.DNa02[0]] === "L" && SY.NEURON_SOMA[FT.EYES.DNa02[1]] === "R");
});

console.log("2. WHAT IS DRIVEN");
section(() => {
    // (the cells are read after three steps; an LC10a cell's own drive is carried through them, so its activity says what it was given, plus what other LC10a cells of its side gave it)
    const act = (w, deg) => FT.wiringOf(w).cells(deg * RAD), sum = (h, idx) => idx.reduce((a, i) => a + h[i], 0), top = (h, idx) => idx.reduce((b, i) => (h[i] > h[b] ? i : b), idx[0]);
    const left = act("fly:medial", 40), right = act("fly:medial", -40), mid = act("fly:medial", 0), edge = act("fly:medial", 7.5);
    ok("!! a target to the positive side drives the LEFT eye's cells and the right's not at all (what little they hold, under a hundredth, is what left cells pass them), and the other way round; straight ahead BOTH eyes (half each); half way out of the 15-degree overlap the near eye more than at straight ahead and the far eye less but not nothing; past the overlap the far eye nothing", sum(left, FT.EYES.L) > 1 && sum(left, FT.EYES.R) < 0.01 * sum(left, FT.EYES.L) && sum(right, FT.EYES.R) > 1 && sum(right, FT.EYES.L) < 0.01 * sum(right, FT.EYES.R) && sum(mid, FT.EYES.L) > 0 && sum(mid, FT.EYES.R) > 0 && sum(edge, FT.EYES.L) > sum(mid, FT.EYES.L) && sum(edge, FT.EYES.R) < sum(mid, FT.EYES.R) && sum(edge, FT.EYES.R) > 0 && sum(act("fly:medial", 15.01), FT.EYES.R) < 0.01 * sum(edge, FT.EYES.R) && Math.abs(sum(mid, FT.EYES.L) / sum(mid, FT.EYES.R) - 1) < 0.1 && Math.abs(FT.OVERLAP - 15 * RAD) < 1e-12);
    const pTop = (w, deg) => PL.ACROSS[top(act(w, deg), FT.EYES.L)];
    ok("!! AMONG AN EYE'S CELLS THOSE WHOSE PLACE IS WHERE THE TARGET IS: for `fly:medial` a target 20 degrees off is answered most by a cell near the MEDIAL end of the sheet (place above 0.8) and one 160 degrees off by a cell near the lateral end (below 0.2); for `fly:lateral` the other way round; `flat` drives every cell of the eye alike", pTop("fly:medial", 20) > 0.8 && pTop("fly:medial", 160) < 0.2 && pTop("fly:lateral", 20) < 0.2 && pTop("fly:lateral", 160) > 0.8 && FT.SIGMA === 0.15 && (() => { const h = act("flat", 40), v = FT.EYES.L.map((i) => h[i]); return Math.min(...v) > 0.5 * Math.max(...v); })() && (() => { const h = act("fly:medial", 40), v = FT.EYES.L.map((i) => h[i]); return Math.min(...v) < 0.05 * Math.max(...v); })());
});

console.log("3. WHAT IT COMPUTES");
section(() => {
    const L = FT.wiringOf("fly:medial"), t = FT.tuning(), tl = FT.tuning(FT.wiringOf("fly:lateral").S), tf = FT.tuning(FT.wiringOf("flat").S), ts = FT.tuning(FT.wiringOf("sine").S); let odd = true, bounded = true; for (let d = -179; d <= 179; d += 7) { const v = FT.S(d * RAD); if (Math.abs(v + FT.S(-d * RAD)) > 1e-15) odd = false; if (Math.abs(v) > 1 + 1e-12) bounded = false; }
    ok("!! S IS ODD, EXACTLY ZERO ON TARGET AND WITHIN [-1, 1] (the circuit asked for e and for -e, half the difference, over its own peak) -- where the circuit's plain read-out is NOT zero on target (the two sides are not mirror images: 135 cells and 140); a target to the positive side gives a NEGATIVE S", odd && bounded && FT.S(0) === 0 && FT.raw(0) !== 0 && Math.abs(FT.raw(0)) < 0.1 && FT.S(40 * RAD) < -0.5 && FT.S(-40 * RAD) > 0.5 && Math.abs(L.amplitude - 1.996) < 0.01 && Math.abs(FT.S(40 * RAD) - (FT.raw(40 * RAD) - FT.raw(-40 * RAD)) / 2 / L.amplitude) < 1e-3);
    ok("!! WITH PLACES A GRADED COMMAND, WITH NONE A SWITCH: `fly:medial` reaches 90% of its peak only at 55 degrees and peaks at 80 (the other orientation: 71 and 99), rising all the way from zero; `flat` is at 90% by 13 degrees and stays at its peak to the rear; the sine by 64", t.reach > 50 && t.reach < 60 && t.peakAt > 75 && t.peakAt < 86 && tl.reach > 66 && tl.reach < 76 && tl.peakAt > 94 && tl.peakAt < 105 && tf.reach < 15 && Math.abs(tf.curve[11]) > 0.99 && Math.abs(t.curve[11]) < 0.4 && ts.reach > 60 && ts.reach < 68 && t.curve.slice(0, 9).every((v, k, a) => k === 0 || v < a[k - 1]), `reach ${t.reach}, ${tl.reach}, ${tf.reach}; peaks at ${t.peakAt}, ${tl.peakAt}`);
    const nb = FT.withBaseline(0), e = 40 * RAD, hb = FT.cells(e), h0 = nb.cells(e), [dl, dr] = FT.EYES.DNa02;
    ok("!! WITHOUT THE CONSTANT DRIVE ON DNa02 THE INHIBITORY PATHWAY DOES NOTHING: a target on the left raises the left DNa02 either way, but only with the drive (0.5) is the RIGHT one pushed BELOW where it rests -- with none it sits at 0 with nothing to take from", FT.BASELINE === 0.5 && hb[dl] > FT.cells(0)[dl] && hb[dr] < 1.4 && hb[dr] < FT.cells(0)[dr] - 0.3 && h0[dr] === 0 && h0[dl] > 0);
    const sh = [4242, 1, 2, 3, 4, 5, 6, 7].map((s) => FT.tuning(FT.wiringOf(`shuffled:${s}`).S)), same = sh.filter((x) => x.curve.every((v, k) => Math.sign(v) === Math.sign(t.curve[k]))).length, mirror = sh.filter((x) => x.curve.every((v, k) => Math.sign(v) === -Math.sign(t.curve[k]))).length;
    ok("!! WHAT THE SHUFFLES DO, SAID AS IT IS: of eight shuffles (each pathway's targets permuted within their type) the command keeps its sign at every bearing in some, is its mirror in others, and changes sign with the bearing in the rest -- NOT ONE IS SILENT. A circuit of 275 cells onto two onto two is the same circuit or its mirror under a shuffle that keeps or swaps its sides whole, so a shuffle is a weak control here and the study says so", same + mirror >= 4 && same >= 1 && mirror >= 1 && same + mirror < 8 && sh.every((x) => x.peak > 0.9), `${same} keep the sign, ${mirror} mirror it, ${8 - same - mirror} change with the bearing`);
});

console.log("3b. THE PLACES SCRAMBLED (the control for what the fly's own places are worth)");
section(() => {
    const sc = FT.wiringOf("scrambled:4242"), e = 40 * RAD, hf = FT.cells(e), hs = sc.cells(e), top = (h) => FT.EYES.L.slice().sort((a, b) => h[b] - h[a]).slice(0, 30);
    const df = top(hf), ds = top(hs), spread = (idx) => { const v = idx.map((i) => PL.ACROSS[i]); return Math.max(...v) - Math.min(...v); }, both = ds.filter((i) => df.includes(i)).length;
    ok("!! `scrambled:<seed>` IS THE FLY'S CIRCUIT WITH EACH EYE'S CELLS TRADING PLACES: for a target 40 degrees off, the thirty cells of the left eye that answer most are NEIGHBOURS on the sheet in the fly's (their true places span under a third of it) and SCATTERED over more than half of it in the scramble's, and few are the same cells; the right eye stays silent either way", spread(df) < 0.34 && spread(ds) > 0.6 && both < 15 && FT.EYES.R.reduce((a, i) => a + hs[i], 0) < 0.01 * FT.EYES.L.reduce((a, i) => a + hs[i], 0), `spans ${spread(df).toFixed(2)} and ${spread(ds).toFixed(2)}; ${both} of 30 the same cells`);
    const ts = [4242, 1, 2, 3, 4].map((sd) => FT.tuning(FT.wiringOf(`scrambled:${sd}`).S)), t = FT.tuning();
    ok("!! and its command is STILL GRADED AND STILL OF THE FLY'S SIGN -- negative for a target to the positive side at every bearing, in five scrambles, reaching 90% of its peak between 25 and 70 degrees (the fly's at 55, `flat` by 13) -- so what a scramble takes away is which cells answer, not that the answer grows with the bearing; one object a seed, another seed another command", ts.every((x) => x.curve.every((v) => v < 0) && x.reach > 25 && x.reach < 70 && x.peak > 0.99) && ts.some((x) => Math.abs(x.reach - t.reach) > 5) && FT.wiringOf("scrambled:4242") === sc && FT.wiringOf("scrambled:1").S(1) !== sc.S(1) && sc.S(1) !== FT.S(1) && sc.S(0) === 0, `reach ${ts.map((x) => x.reach).join(", ")}`);
});

console.log("4. THE GUNNER");
section(() => {
    const x = (ey, ep, fire) => [1, ey / Math.PI, ep / (Math.PI / 2), 0.5, 0, 0, 0, 1, fire ? 1 : 0, 0, 0], y = FT.forward(Float32Array.from([-4, -2]), x(0.5, -0.3, true)), z = FT.forward(FT.zeroWeights(), x(0.5, -0.3, false));
    ok("!! the two rates are tanh(gain x S) of the sight's two errors, each with ITS gain; THE TRIGGER IS THE SIGHT'S (fire when the sight says fire, whatever the gains); the other two outputs are 0; with zero gains the gun does not move", Math.abs(y[0] - Math.tanh(-4 * FT.S(0.5))) < 1e-12 && Math.abs(y[1] - Math.tanh(-2 * FT.S(-0.3))) < 1e-12 && y[0] > 0 && y[1] < 0 && y[2] === 1 && FT.forward(Float32Array.from([-4, -2]), x(0.5, -0.3, false))[2] === -1 && y[3] === 0 && y[4] === 0 && z[0] === 0 && z[1] === 0 && z[2] === -1 && FT.WEIGHT_COUNT === 2 && FT.zeroWeights().length === 2);
    const hand = D.makeSide("hand", { cannon: false }), mk = (g, w = "fly:medial") => D.makeSide("n", { cannon: false, network: { module: FT.wiringOf(w), weights: Float32Array.from([g, g]) } }), toward = D.duel(mk(-4), hand, 90003, "crossing"), away = D.duel(mk(4), hand, 90003, "crossing"), still = D.duel(mk(0), hand, 90003, "crossing");
    ok("!! IN A FIGHT (a scratch pair, no cannon): a NEGATIVE gain lays the guns on the enemy -- it deals damage and thirteen circuits are asked -- a positive gain lays them off it and a zero gain leaves them where they were: both deal far less", toward.brains.seated[0] === 13 && toward.brains.asked > 5000 && toward.scores[0] > away.scores[0] + 1 && toward.scores[0] > still.scores[0] + 1 && toward.fingerprint !== away.fingerprint, `scores ${toward.scores[0].toFixed(2)}, ${away.scores[0].toFixed(2)}, ${still.scores[0].toFixed(2)}`);
});

console.log("5. THE FRONT DOOR");
section(() => {
    ok("wirings by NAME, one object each: `fly:medial` is this file's own, `fly:lateral`, `flat`, `sine` (minus the sine of the bearing to a quarter turn and HELD at -1 behind it) and `shuffled:<seed>` are others with another S; a bad name is refused", FT.wiringOf() === FT.wiringOf("fly:medial") && FT.wiringOf("fly:medial").S === FT.S && FT.wiringOf("flat") === FT.wiringOf("flat") && ["fly:lateral", "flat", "sine", "shuffled:4242", "shuffled:7"].every((w) => FT.wiringOf(w).S(1.9) !== FT.S(1.9)) && Math.abs(FT.wiringOf("sine").S(0.4) + Math.sin(0.4)) < 1e-5 && Math.abs(FT.wiringOf("sine").S(120 * RAD) + 1) < 1e-9 && Math.abs(FT.wiringOf("sine").S(175 * RAD) + 1) < 1e-9 && throwsWith(() => FT.wiringOf("fly"), /a wiring is "fly:medial", "fly:lateral", "flat", "sine", "shuffled:<seed>" or "scrambled:<seed>" \(got fly\)/));
    const blob = PB.exportBrain(PB.describePolicy(FT.POLICY_ID, FT), Float32Array.from([-4, -4]), { by: "a fly-wired gunner" }), r = D.sideFromBrains("s", [blob]), bad = D.sideFromBrains("b", [{ ...blob, weights: [1] }]);
    ok("!! a seatFlyWired brain file (two numbers) is seated IN THE SEATS by battleshipDuel.sideFromBrains; one a weight short is refused with the count", r.refused.length === 0 && r.seated[0].role === "seat" && D.seatNetOf(r.side, "main-a").module === FT && Array.from(D.seatNetOf(r.side, "main-a").weights).join() === "-4,-4" && /weight count 1 does not match seatFlyWired's current 2/.test(bad.refused[0].reason) && FT.POLICY_ID === "seatFlyWired");
    const job = (wiring) => ({ x: { id: "n", cannon: false, network: wiring ? { policy: "seatFlyWired", weights: [-4, -4], wiring } : { policy: "seatFlyWired", weights: [-4, -4] } }, y: { id: "hand", cannon: false }, kind: "crossing", seed: 90003 }), a = leadOf(job(null)), b = leadOf(job("flat")), c = leadOf(job("fly:medial"));
    ok("!! the pool flies it over a named wiring: `flat` is another fight of the same gains, and `fly:medial` by name is the default", a !== b && a === c, `leads ${a.toFixed(3)}, ${b.toFixed(3)}`);
    ok("the report says real numbers", /281 neurons, 6589 connections, no learned weight inside; with places the command reaches 90% of its peak at 55\.5 degrees and peaks at 80\.5/.test(FT.reportLines()[1]));
    ok("the export list", Object.keys(FT).sort().join() === "BASELINE,CONTROL_SEED,EYES,FEATURES,HIDDEN,OUTPUTS,OVERLAP,POLICY_ID,S,SIGMA,STEPS,WEIGHT_COUNT,cells,forward,gunnerFactory,gunnerFor,handWeights,raw,reportLines,signOf,topology,tuning,wiringOf,withBaseline,zeroWeights");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
