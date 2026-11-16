// WebGLEngine/brain/flySteering-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/flySteering-selfcheck.mjs      (about ten seconds)
//
// THE FLY'S STEERING CIRCUIT WIRED AS THE FLY WIRES IT, HELD. brain/flySteering.mjs drives the compass cells with a heading and the goal cells with a goal, runs the connectome's own signed weights, and reads one number off the two DNa02 cells. Six things hold it:
//
//   1  THE ANGLES ARE THE CELLS' OWN     an EPG cell's angle is its glomerulus's place along the bridge; THE DELTA7 NAMES CONFIRM THE PERIOD (every pair of glomeruli a Delta7 joins is eight apart); the column line puts the PFL3 cells 67.5 degrees either side of their heading and PFL2 at 157.5 -- the literature's shifts
//   2  THE WEIGHTS ARE THE CONNECTOME'S  the baked counts are the vendored file's; a weight is a count over its target's total, negative from a Delta7 cell and positive from every other; nothing is learned
//   3  WHAT IT COMPUTES                  D follows -sin(goal - heading): the correlation, the amplitude (the constant AMPLITUDE), the wander from heading to heading; WITH NO THRESHOLD IT IS NOT THERE; WITH THE TARGETS SHUFFLED IT IS NOT THERE (eight seeds); only the compass and goal cells are driven
//   4  THE HELM                          two gains; the zero gains are the rule to the bit in a fight; a torque about the two axes that are not the nose, within half the hull's limit, the thrust and the roll the rule's; no enemy, the rule; the same error gives the same sign of correction about either axis
//   5  THE OTHER WIRINGS                 `shuffled:<seed>` (one object a seed) and `sine` (an ideal comparator of the same amplitude and sign); a bad name refused
//   6  THE FRONT DOOR                    battleshipDuel seats a helmFlyWired file at the helm; the pool flies it over a named wiring; the report; the export list
//
// SABOTAGE LOG: @@LOG@@
"use strict";
import fs from "node:fs";
import * as FS from "./flySteering.mjs";
import * as CX from "./cxInputsTopology.mjs";
import * as SY from "./cxInputsSynapses.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import { leadOf } from "../tools/ship/pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const T = CX.NEURON_TYPES, I = CX.NEURON_INSTANCES, deg = (a) => { let x = (a * 180 / Math.PI) % 360; if (x > 180) x -= 360; if (x <= -180) x += 360; return Math.round(x * 10) / 10; };
const V = JSON.parse(fs.readFileSync(new URL("../vendor/male-cns/cx-steering-inputs-circuit.json", import.meta.url), "utf8"));

console.log("flySteering-selfcheck -- the fly's steering circuit wired as the fly wires it\n");

console.log("1. THE ANGLES ARE THE CELLS' OWN");
section(() => {
    ok("an EPG cell's angle is its glomerulus's place along the bridge, L8 L7 ... L1 R1 ... R8, 45 degrees each: L8 at 0, L1 at 315, R1 at 360 (= 0 again), R8 at 675 (= 315); a name with no glomerulus is refused", deg(FS.epgAngle("EPG(PB08)_L8")) === 0 && deg(FS.epgAngle("EPG(PB08)_L1")) === -45 && deg(FS.epgAngle("EPG(PB08)_R1")) === 0 && deg(FS.epgAngle("EPG(PB08)_R8")) === -45 && deg(FS.epgAngle("EPG(PB08)_L5")) === 135 && throwsWith(() => FS.epgAngle("EPG"), /no bridge glomerulus in "EPG"/) && FS.INPUT_CELLS.EPG.length === 46 && FS.INPUT_CELLS.EPG.every((i) => T[i] === "EPG"));
    const pos = (g) => (g[0] === "L" ? 8 - Number(g[1]) : 7 + Number(g[1])), d7 = [...new Set(I.filter((_, i) => T[i] === "Delta7"))], pairs = d7.map((inst) => { const g = /\)_((?:[LR]\d)+)_[LR]$/.exec(inst)[1].match(/[LR]\d/g).filter((x) => x[1] !== "9"); return g.map(pos); });
    ok("!! THE DELTA7 CELLS CONFIRM THE PERIOD: each of their twelve names lists the glomeruli the cell joins (L8-R1, L7-R2, L7-R3, ... L1-R8), and in eight the two are EXACTLY eight places apart along the bridge -- one turn of 360 degrees at 45 a glomerulus -- and in the other four (L3-R7, L4-R6, L6-R4, L7-R3) nine: one off, never more", pairs.length === 12 && pairs.every((p) => p.length === 2 && Math.abs(Math.abs(p[1] - p[0]) - 8) <= 1) && pairs.filter((p) => Math.abs(p[1] - p[0]) === 8).length === 8 && pairs.filter((p) => Math.abs(p[1] - p[0]) !== 8).length === 4, `differences ${pairs.map((p) => Math.abs(p[1] - p[0])).join(" ")}`);
    const off = (type, side, irreg) => I.map((inst, i) => (T[i] === type && new RegExp(`_${side}\\d_C`).test(inst) && /irreg/.test(inst) === irreg ? deg(FS.columnAngle(inst) - FS.bridgeAngle(inst)) : null)).filter((x) => x !== null);
    ok("!! THE COLUMN LINE PUTS THE PFL3 CELLS WHERE THE LITERATURE DOES: the ten regular PFL3 of the right bridge sit +67.5 degrees from their heading, nine of the ten of the left bridge -67.5 (one, L4_C5, -22.5), and the four the dataset marks irregular the other way; the FC2 cells take their angles from the same line", off("PFL3", "R", false).join() === Array(10).fill(67.5).join() && off("PFL3", "L", false).sort((a, b) => a - b).join() === [...Array(9).fill(-67.5), -22.5].join() && off("PFL3", "R", true).join() === "-67.5,-67.5" && off("PFL3", "L", true).join() === "67.5,67.5" && deg(FS.columnAngle("FC2A_C1_L")) === -22.5 && deg(FS.columnAngle("FC2C_C9_R")) === -22.5 && deg(FS.columnAngle("FC2B_C5_L")) === 157.5 && FS.INPUT_CELLS.FC2.length === 92 && throwsWith(() => FS.columnAngle("FC2A"), /no column in "FC2A"/));
    ok("!! AND PFL2 AT 157.5: all six of the left bridge at -157.5 and all six of the right at +157.5 -- the literature's half turn, a half column off; one line, fitted to neither type's count, fits both sides of both", off("PFL2", "L", false).join() === Array(6).fill(-157.5).join() && off("PFL2", "R", false).join() === Array(6).fill(157.5).join() && FS.INPUT_CELLS.PFL.length === 36);
});

console.log("2. THE WEIGHTS ARE THE CONNECTOME'S");
section(() => {
    ok("!! the baked counts, transmitters and soma sides (brain/cxInputsSynapses.mjs) are the vendored file's, aligned with the baked topology: 7,981 counts, 92,448 synapses", SY.EDGE_COUNTS.join() === V.edges.map((e) => e[2]).join() && SY.EDGE_COUNTS.length === CX.EDGES.length && SY.EDGE_COUNTS.reduce((a, b) => a + b, 0) === 92448 && SY.NEURON_NT.join() === V.neurons.map((n) => n.nt).join() && SY.NEURON_SOMA.join() === V.neurons.map((n) => n.somaSide).join());
    ok("the sign of a connection is its SOURCE's predicted transmitter: acetylcholine excites, glutamate and GABA inhibit -- here the 42 Delta7 cells and no other", FS.signOf("acetylcholine") === 1 && FS.signOf("glutamate") === -1 && FS.signOf("gaba") === -1 && SY.NEURON_NT.every((nt, i) => (FS.signOf(nt) === -1) === (T[i] === "Delta7")) && T.filter((t) => t === "Delta7").length === 42);
    const [L2, R2] = FS.INPUT_CELLS.DNa02, e = FS.INPUT_CELLS.EPG[0], H = FS.epgAngle(I[e]), one = FS.cells(H, H);
    ok("the two DNa02 cells read are the left one and the right one by soma side; only the compass and the goal cells are DRIVEN (a cell of another type with no input from them within three steps would hold 0), and a compass cell at its own heading holds more than one on the far side of the ring", T[L2] === "DNa02" && T[R2] === "DNa02" && SY.NEURON_SOMA[L2] === "L" && SY.NEURON_SOMA[R2] === "R" && one.length === 220 && one.every((v) => v >= 0 && Number.isFinite(v)) && one[e] > one[FS.INPUT_CELLS.EPG.find((i) => Math.abs(deg(FS.epgAngle(I[i]) - H)) === 180)]);
});

console.log("3. WHAT IT COMPUTES");
section(() => {
    const t = FS.tuning(), none = FS.tuning(FS.withThreshold(0).steer), sh = [4242, 1, 2, 3, 4, 5, 6, 7].map((s) => FS.tuning(FS.wiringOf(`shuffled:${s}`).steer));
    ok("!! D FOLLOWS -sin(goal - heading): over 48 headings and 24 errors the mean of D correlates with the sine of the error at -0.999 or beyond, its amplitude is the constant AMPLITUDE (0.056) to a thousandth, its mean is near zero, and from heading to heading at one error it wanders by about half its amplitude (0.02 to 0.04)", t.corr < -0.999 && Math.abs(t.amplitude - FS.AMPLITUDE) < 0.001 && FS.AMPLITUDE === 0.056 && Math.abs(t.offset) < 0.01 && t.noise > 0.02 && t.noise < 0.04, `corr ${t.corr.toFixed(4)}, amplitude ${t.amplitude.toFixed(4)}, wander ${t.noise.toFixed(4)}, offset ${t.offset.toFixed(4)}`);
    ok("!! WITH NO THRESHOLD IT IS NOT THERE: the same circuit with the PFL threshold at 0 has an amplitude under 0.002 -- a fortieth -- so the threshold (0.2, CHOSEN ON THIS CURVE and said so) is what turns two added bumps into a comparison", none.amplitude < 0.002 && none.amplitude < t.amplitude / 30 && FS.THRESHOLD === 0.2, `amplitude ${none.amplitude.toFixed(4)}`);
    ok("!! WITH THE TARGETS SHUFFLED IT IS NOT THERE: eight shuffles (each pathway's targets permuted within their type; the same cells, counts and signs) have amplitudes all under a fifth of the fly's, while D still wanders as much -- the steering signal is in WHERE the fly's connections land", sh.every((x) => x.amplitude < t.amplitude / 5) && sh.every((x) => x.noise > 0.01) && Math.max(...sh.map((x) => x.amplitude)) > 0.001, `amplitudes ${sh.map((x) => x.amplitude.toFixed(4)).join(" ")}`);
    const odd = t.curve.every((v, k) => k === 0 || Math.abs(v + t.curve[24 - k]) < 0.02);
    ok("the mean curve is odd about zero error (to 0.02: its mean is 0.005, not 0) and near zero there and at a half turn; the sign: a goal to the positive side of the heading gives a NEGATIVE D", odd && Math.abs(t.curve[12]) < 0.02 && Math.abs(t.curve[0]) < 0.02 && t.curve[18] < -0.04 && t.curve[6] > 0.04);
});

console.log("4. THE HELM");
section(() => {
    const rule = D.makeSide("rule"), mk = (g, lib = FS) => D.makeSide("n", { helmNet: { module: lib, weights: Float32Array.from(g) } }), a = D.duel(rule, rule, 3, "crossing"), z = D.duel(mk([0, 0]), mk([0, 0]), 3, "crossing"), n = D.duel(mk([-1, -1]), rule, 3, "crossing");
    ok("!! a fight with the ZERO gains at both helms is the fight with no helm network TO THE BIT, and the helms were asked every tick; gains that are not zero are another fight", z.fingerprint === a.fingerprint && JSON.stringify(z.scores) === JSON.stringify(a.scores) && z.brains.seated.join() === "1,1" && z.brains.asked >= 2 * z.ticks - 4 && n.fingerprint !== a.fingerprint && FS.WEIGHT_COUNT === 2 && FS.zeroWeights().length === 2);
    const SHIP = CS.createCapitalShip(), body = RB.createBody({ mass: SHIP.mass, I: [...SHIP.I] }), ctx = (pos) => ({ body, ship: SHIP, foe: { body: { pos, vel: [0, 0, 0] } }, thrustMax: 1500 }), rl = { torque: [7, 0, 0], thrust: 450 }, lim = (i) => 0.5 * SHIP.maxAlpha * body.I[i];
    const up = FS.helmFor(Float32Array.from([-40, -40]))(rl, ctx([300, 0, 200])), side = FS.helmFor(Float32Array.from([-40, -40]))(rl, ctx([300, 200, 0])), weak = FS.helmFor(Float32Array.from([-0.3, 0]))(rl, ctx([300, 0, 200])), h = FS.helmFor(Float32Array.from([1, 1]));
    ok("!! the correction is a torque about the two axes that are NOT the nose: the roll torque and the thrust are the rule's own; however large the gain it is within half the hull's torque limit about each axis; a gain on one axis leaves the other alone", up.torque[0] === 7 && up.thrust === 450 && side.torque[0] === 7 && [1, 2].every((i) => Math.abs(up.torque[i]) <= lim(i) * (1 + 1e-9) && Math.abs(side.torque[i]) <= lim(i) * (1 + 1e-9)) && Math.abs(up.torque[1]) > 0.9 * lim(1) && Math.abs(side.torque[2]) > 0.9 * lim(2) && weak.torque[2] === 0 && weak.torque[1] !== 0 && Math.abs(weak.torque[1]) < 0.5 * lim(1));
    const e1 = FS.helmFor(Float32Array.from([-40, -40])), o1 = e1(rl, ctx([300, 0, 200])), g1 = e1.last, o2 = e1(rl, ctx([300, 200, 0])), g2 = e1.last;
    ok("!! THE SAME ERROR GIVES THE SAME SIGN ABOUT EITHER AXIS: with a negative gain an enemy off the nose about the second axis is turned TOWARD about the second axis and one about the third about the third (the torque has the sign of the pointing error), and the helm remembers the angles it gave the circuit (goal less heading is that error)", (() => { const eu = Math.atan2(Math.sin(g1.G[0] - g1.H[0]), Math.cos(g1.G[0] - g1.H[0])), es = Math.atan2(Math.sin(g2.G[1] - g2.H[1]), Math.cos(g2.G[1] - g2.H[1])); return Math.abs(eu) > 0.3 && Math.abs(es) > 0.3 && Math.sign(o1.torque[1]) === Math.sign(eu) && Math.sign(o2.torque[2]) === Math.sign(es) && g1.D.length === 2; })());
    ok("with no enemy the rule's answer is handed back as it is; each helm from a factory is its own", JSON.stringify(h(rl, { ...ctx([1, 0, 0]), foe: null })) === JSON.stringify(rl) && h.last === null && ((f) => f() !== f())(FS.helmFactory(Float32Array.from([1, 1]))));
});

console.log("5. THE OTHER WIRINGS");
section(() => {
    const s1 = FS.wiringOf("shuffled:4242"), sine = FS.wiringOf("sine"), ts = FS.tuning(sine.steer);
    ok("!! `shuffled:4242` is one object a seed and not the fly's circuit (another D for the same angles); `shuffled:7` is another; `sine` is no circuit -- exactly -AMPLITUDE sin(goal - heading), so the same sign and size as the fly's mean with no wander; `fly` is this file's own; any other name is refused", s1 === FS.wiringOf("shuffled:4242") && s1 !== FS.wiringOf("shuffled:7") && s1.steer(1, 2) !== FS.steer(1, 2) && FS.wiringOf("shuffled:7").steer(1, 2) !== s1.steer(1, 2) && sine.steer(0.3, 1.3) === -FS.AMPLITUDE * Math.sin(1) && ts.corr < -0.999999 && ts.noise < 1e-12 && Math.abs(ts.amplitude - FS.AMPLITUDE) < 1e-3 && FS.wiringOf().steer(1, 2) === FS.steer(1, 2) && FS.wiringOf("fly").helmFor === FS.helmFor && throwsWith(() => FS.wiringOf("control:4242"), /a wiring is "fly", "sine" or "shuffled:<seed>" \(got control:4242\)/));
    ok("every wiring is the same helm with another D: two weights, the same limits, zero gains the rule", [s1, sine].every((l) => l.WEIGHT_COUNT === 2 && l.TORQUE_FRACTION === 0.5 && typeof l.helmFactory === "function" && l.zeroWeights().length === 2));
});

console.log("6. THE FRONT DOOR");
section(() => {
    const blob = PB.exportBrain(PB.describePolicy(FS.POLICY_ID, FS), Float32Array.from([-1, -0.5]), { by: "a fly-wired helm" }), r = D.sideFromBrains("s", [blob]), bad = D.sideFromBrains("b", [{ ...blob, weights: [1] }]);
    ok("!! a helmFlyWired brain file (two numbers) is seated AT THE HELM by battleshipDuel.sideFromBrains; one a weight short is refused with the count", r.refused.length === 0 && r.seated[0].role === "helm" && r.side.helmNet.module === FS && Array.from(r.side.helmNet.weights).join() === "-1,-0.5" && /weight count 1 does not match helmFlyWired's current 2/.test(bad.refused[0].reason) && FS.POLICY_ID === "helmFlyWired");
    const job = (wiring) => ({ x: { id: "n", helmNet: wiring ? { policy: "helmFlyWired", weights: [-1, -1], wiring } : { policy: "helmFlyWired", weights: [-1, -1] } }, y: { id: "rule" }, kind: "crossing", seed: 3 }), lf = leadOf(job(null)), ls = leadOf(job("shuffled:4242")), ln = leadOf(job("sine"));
    ok("!! the pool flies it over a named wiring: the fly's, the shuffled control's and the sine's are three different fights of the same gains, and the fly's by name is the fly's", lf !== ls && lf !== ln && ls !== ln && leadOf(job("fly")) === lf && lf === D.pair(D.makeSide("n", { helmNet: { module: FS, weights: Float32Array.from([-1, -1]) } }), D.makeSide("rule"), 3, "crossing", { countBrains: false }).lead, `leads ${lf.toFixed(3)}, ${ls.toFixed(3)}, ${ln.toFixed(3)}`);
    ok("the report says real numbers", /220 neurons, 7981 connections, no learned weight inside; D follows -sin\(goal - heading\): correlation -1\.000, amplitude 0\.056/.test(FS.reportLines()[1]));
    ok("the export list", Object.keys(FS).sort().join() === "AMPLITUDE,CONTROL_SEED,FEATURES,HIDDEN,INPUT_CELLS,OUTPUTS,POLICY_ID,STEPS,THRESHOLD,TORQUE_FRACTION,WEIGHT_COUNT,bridgeAngle,cells,columnAngle,epgAngle,handWeights,helmFactory,helmFor,reportLines,signOf,steer,topology,tuning,wiringOf,withThreshold,zeroWeights");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
