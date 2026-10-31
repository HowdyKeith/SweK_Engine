// WebGLEngine/brain/pilotSubPlainNet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubPlainNet-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/pilotSubPlainNet.mjs: the plain-net control of rung 4b (brain/PLAIN_NET_CONTROL_WIP.md, sections 2 and 10): the 4b pilot with the circuit replaced by a feed-forward relu net on the same four tilt signals. Built and gated BEFORE any training. Nothing here is trained;
// every number is worked out by hand on a toy net, then the real shapes are held to the registration's weight counts.
//
// THE TOY: widths [4], first layer the identity (hidden unit j reads signal j: pTonic, rTonic, pPhasic, rPhasic), biases 0, output layer routing hidden unit j to output j (pitch, yaw, thrust, ballast).
//   A nose-down body of 0.1 rad reads pTonic 0.1: both copies see it, so pitch gets 0.1 + 0.1 = 0.2 (even) and nothing else. A right-side-down body reads rTonic 0.1: the right copy sees +0.1 (yaw +0.1), the left copy sees -0.1 and its relu holds 0, so the residual yaw is +0.1; left-side-down gives -0.1.
//   A second toy routes every output from pTonic (the same value in both copies): pitch, thrust and ballast get 0.2 and yaw, odd, gets 0. The two-layer arithmetic is worked in section 2.
// WHAT IT HOLDS
//   1 THE LAYOUT   the offsets and the counts: 22 for [2], 85 / 589 / 652 for the weight-matched widths 9 / 65 / 72, 1,348 for the GPU Brain's 4-32-32-4; matchedHidden; the refusals; the real arms' NO STATE counts (591, 655, 85) give the registration's widths.
//   2 THE NET      the forward pass worked by hand, one and two hidden layers: the relu on every hidden layer and none on the output; the biases; a buffer that is not shared between passes.
//   3 THE START    the output layer is zero and the hidden layers are drawn at the registered scales from a seeded draw; the start IS the autopilot (scored, and the first command field by field), whatever the shape.
//   4 THE PILOT    each of the four signals goes to its own input with its own scale; the mirror (yaw odd, the rest even, the left copy's roll signals flipped); the relu; every clamp; non-finite weights; the output biases; the current; no state between calls or dives.
//   5 THE SEARCH   mutate on a stub task, the evaluate seam, and the trainer's own search() run on a plain net.
//   6 THE CONTRACT the fields the trainer reads; the report.
//   7 THE SOURCE   pure.
// NOT CHECKED, said plainly: what a TRAINED weight vector does (nothing is trained); that four signals and these widths can express any correction at all (the trainer decides that); the scales over the training dives (the trainer measures them); the speed of a long run.
//
// SABOTAGED -- 112 mutants of brain/pilotSubPlainNet.mjs, each run against a copy of this gate, 4 at a time, a mutant that runs past 120 s counted red (none did), and 111 red BY NAME (593 red rows in all; the fewest on any mutant is 1), the 112th an EQUIVALENT (below):
//   the layout: an empty list, a width of 0, a fractional width and a non-list accepted, the sizes of the layers, the offsets of the biases and of the layers, a relu on the output layer or missing on the last hidden layer, the output layer dropped, the matched width (output biases forgotten, hidden biases forgotten, rounded up, a negative
//   count giving a negative width), five signals; the forward pass: the bias not added, the wrong row of weights, the weights not multiplying the input or multiplying the wrong one, a relu on the outputs / no relu / a relu that lets a NaN through / a leaky relu, the next layer reading the input again, only the first output copied,
//   the internal buffer returned, nothing copied; the policy: the default evaluator, seed 0 read as the default, the seed option ignored, the scales option ignored or replacing the defaults, EIGHT terms of the autopilot's laws (pitch gain, pitch-rate damping, the heading gain's pi, yaw-rate and sideslip damping, the trim thrust,
//   the speed gain, the ballast gains), the start drawing the output layer, both hidden layers on the first scale, the scales swapped, a part of a layer drawn, a unit-scale draw, the draw ignoring or not having a seed, a zero vector of the wrong length, each of the four signals' scales crossed with another's (4) and two signals swapped between slots,
//   the left copy: each of its four signals flipped or not flipped (4), reading the right copy's roll, absent, the right copy twice, sharing the right copy's buffer; the parity of each of the four controls (4), each residual dropped (4), each control's non-finite guard (4) and each clamp bound (8), a call with no current taken as a current, the current dropped,
//   the default set, the evaluate seam (options, set), mutate (can change nothing, can change maxK + 1, maxK defaulting to 3, editing its input, a unit-scale step, always moving the first weight, a step of one sign), the contract (the cell count, the reach, a state, a lambda slot, an aliased width list, the weight count and the widths and the label of the report,
//   the feature count), the registered constants (seed, both scales, frozen or not, the GPU Brain's second width, frozen or not), the draw's variance and its angle, the clock.
//   FIRST RUN, THREE FINDINGS: L05 (SIGNALS and OUTPUTS swapped in the layer sizes) went 0 red and is EQUIVALENT: both are 4, so [SIGNALS, ...widths, OUTPUTS] and [OUTPUTS, ...widths, SIGNALS] are the same list; it would differ only if the number of tilt signals or of controls changed, and then rows 1 and 6 (the counts, the contract) would be the ones to
//   change with it. C67 (a step of one sign: abs of the normal draw) went 0 red because every row asked for the size of a step, never its direction: a row now counts the up-moves of 400 single-weight mutations. C83 (Box-Muller with cos(pi v) in place of cos(2 pi v)) went 0 red because the two draws have the SAME DISTRIBUTION (cosine of an angle uniform on a half
//   circle is distributed as of one uniform on the whole circle) and differ only in the numbers: the registered replicates must be re-creatable by anybody, so the seeded start is now pinned to the number (a GOLDEN row: seed 4711 and 4712, the first weights, the sum and the sum of magnitudes of a layer, three entries of the 4-32-32-4 net). The gate was edited after
//   those two runs, so ALL 112 mutants were run again on the edited gate: 111 red by name, L05 equivalent. Before the first run the gate itself had five red rows of its own: the autopilot's pitch command saturates at 1 near 0.08 rad of pitch and with any pitch rate, and a residual on a saturated command is clamped away, so the rows now use a 0.02 rad pitch for the
//   pitch signal and a second state (a bank and the rates) for the other three.
// NOT SABOTAGED: the report line's text beyond the label, the widths and the weight count; the speed of a long run.
"use strict";
import fs from "node:fs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";
import * as AS from "./autopilotSub.mjs";
import * as V from "./pilotSubVestibular.mjs";
import * as P from "./pilotSubPlainNet.mjs";
import * as F from "../tools/fishVestibularCircuit.mjs";
import * as TR from "../tools/ship/trainSubVestibular.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e, J = JSON.stringify, KEYS = ["pitch", "yaw", "thrust", "ballast"];
console.log("pilotSubPlainNet-selfcheck -- the plain-net control of rung 4b\n");

const X = F.extract();
const model = S.createSubModel(), st =(o) => S.createState({ depth: 30, speed: 2.5, ...o, model }), tgt = { depth: 30, heading: 0, speed: 2.5 };
const clampTo = (v) => Math.max(-1, Math.min(1, v));
/** The toy net of widths [4]: the identity first layer, unit j routed to output j (`route`: output o reads hidden unit route[o], weight `gain`), `hb` the hidden biases, `ob` the output biases. */
const toyNet = (route = [0, 1, 2, 3], gain = 1, hb = [0, 0, 0, 0], ob = [0, 0, 0, 0]) => {
    const p = P.createPlainNetPolicy([4], "toy"), L = P.layoutOf([4]).layers, w = new Float32Array(p.WEIGHT_COUNT);
    for (let j = 0; j < 4; j++) { w[L[0].offW + j * 4 + j] = 1; w[L[0].offB + j] = hb[j]; w[L[1].offB + j] = ob[j]; }
    for (let o = 0; o < 4; o++) w[L[1].offW + o * 4 + route[o]] = gain;
    return { p, w, L };
};
/** The residual of a pilot from the autopilot's own command on the same state, per control. */
const resid = (pilot, s, cur = [0, 0, 0]) => { const o = pilot(s, tgt, cur), b = AS.decide(s, tgt, cur); return KEYS.map((k) => o[k] - b[k]); };
const same = (a, b, e = 1e-6) => a.length === b.length && a.every((v, i) => near(v, b[i], e));

sec("1. THE LAYOUT (the offsets and the counts of the registration)");
{
    const l2 = P.layoutOf([2]), l4 = P.layoutOf([4]), mg = P.layoutOf(P.MG_WIDTHS);
    ok("!! one hidden layer of 2 units: 4 x 2 weights, 2 biases, 2 x 4 weights, 4 biases = 22 weights, the offsets 0 / 8 / 10 / 18, a relu on the hidden layer and none on the outputs", l2.count === 22 && J(l2.layers) === J([{ nIn: 4, nOut: 2, offW: 0, offB: 8, relu: true }, { nIn: 2, nOut: 4, offW: 10, offB: 18, relu: false }]));
    ok("!! 9H + 4 weights for one hidden layer of H units: 85 for H = 9, 589 for 65, 652 for 72", P.layoutOf([9]).count === 85 && P.layoutOf([65]).count === 589 && P.layoutOf([72]).count === 652 && l4.count === 40);
    ok("!! the GPU Brain's shape 4-32-32-4: 128 + 32, 1,024 + 32, 128 + 4 = 1,348 weights, the offsets 0 / 128 / 160 / 1184 / 1216 / 1344, a relu on both hidden layers and none on the outputs", mg.count === 1348 && J(mg.layers.map((x) => [x.nIn, x.nOut, x.offW, x.offB, x.relu])) === J([[4, 32, 0, 128, true], [32, 32, 160, 1184, true], [32, 4, 1216, 1344, false]]) && J(P.MG_WIDTHS) === J([32, 32]) && Object.isFrozen(P.MG_WIDTHS));
    ok("!! the layers are contiguous: every layer starts where the last one ended", mg.layers.every((x, i) => (i === 0 ? x.offW === 0 : x.offW === mg.layers[i - 1].offB + mg.layers[i - 1].nOut)) && l4.layers[1].offW === l4.layers[0].offB + 4);
    ok("!! four signals in, four controls out", P.SIGNALS === 4 && P.OUTPUTS === 4 && P.SIGNALS === V.SENSES.length);
    ok("!! matchedHidden is the largest H with 9H + 4 not above the count: 591 -> 65, 655 -> 72, 85 -> 9 (exactly), 84 -> 8, 13 -> 1, 12 -> 0, nothing -> 0", P.matchedHidden(591) === 65 && P.matchedHidden(655) === 72 && P.matchedHidden(85) === 9 && P.matchedHidden(84) === 8 && P.matchedHidden(13) === 1 && P.matchedHidden(12) === 0 && P.matchedHidden(0) === 0 && P.matchedHidden(-5) === 0);
    ok("!! matchedHidden never passes the count it is given, and one more unit would", [85, 100, 591, 655, 1000].every((n) => { const h = P.matchedHidden(n); return P.layoutOf([h]).count <= n && P.layoutOf([h + 1]).count > n; }));
    const bad = [null, [], [0], [2.5], [-1], ["8"], [4, 0], 9, "9", undefined].map((w) => throws(() => P.layoutOf(w)));
    ok("!! a list of hidden widths that is not a non-empty list of whole numbers of 1 or more is refused (ten bad lists), naming the module", bad.every((m) => m && /pilotSubPlainNet\.layoutOf/.test(m)));
    for (const [arm, T0, H0, W0] of [["B", 591, 65, 589], ["whole", 655, 72, 652], ["E", 85, 9, 85]]) {
        const c = V.circuitOf(X, arm), n = V.createVestibularPolicy(c, arm, { persist: false }).WEIGHT_COUNT, h = P.matchedHidden(n), pn = P.createPlainNetPolicy([h], arm);
        ok(`!! arm ${arm}: the circuit's NO STATE pilot has ${T0} trainable weights, the weight-matched plain net has ${H0} hidden units and ${W0} weights (the registration's table), never more than the circuit`, n === T0 && h === H0 && pn.WEIGHT_COUNT === W0 && pn.WEIGHT_COUNT <= n && n - pn.WEIGHT_COUNT < 9);
    }
}

sec("2. THE NET (worked by hand)");
{
    const fw = P.makeForward(P.layoutOf([2]).layers), w = new Float32Array(22), d = new Float64Array(4);
    // W1 rows (unit 0 reads signal 0, unit 1 reads signal 1), b1 = [0.1, -1]; W_out rows: pitch <- u0, yaw <- u1, thrust <- 0.5 u0, ballast <- 0.5 u1 - 1 u0; b_out = [0, 0, 0, 0.05]
    w[0] = 1; w[5] = 1; w[8] = 0.1; w[9] = -1; w[10] = 1; w[13] = 1; w[14] = 0.5; w[16] = -1; w[17] = 0.5; w[21] = 0.05;
    const a =Array.from(fw(w, Float64Array.from([0.2, 0.4, 0, 0]), d)), b = Array.from(fw(w, Float64Array.from([-0.5, 2, 0, 0]), d));
    // x = (0.2, 0.4): h = relu([0.2 + 0.1, 0.4 - 1]) = [0.3, 0]; out = [0.3, 0, 0.15, -0.3 + 0 + 0.05 = -0.25]
    ok("!! the forward pass, worked by hand: x = (0.2, 0.4) gives hidden relu([0.3, -0.6]) = [0.3, 0] and outputs [0.3, 0, 0.15, -0.25]: the hidden biases are added, the second unit's negative sum is held at 0 by the relu, the output -0.25 is NOT (no relu on the outputs)", same(a, [0.3, 0, 0.15, -0.25]));
    // x = (-0.5, 2): h = relu([-0.4, 1]) = [0, 1]; out = [0, 1, 0, 0.5 + 0.05]
    ok("!! and a negative first unit is held at 0 while the second passes: x = (-0.5, 2) gives [0, 1, 0, 0.55]", same(b, [0, 1, 0, 0.55]));
    const fw2 = P.makeForward(P.layoutOf([2, 2]).layers), L2 = P.layoutOf([2, 2]).layers, w2 = new Float32Array(P.layoutOf([2, 2]).count);
    // layer 1: u0 <- s0, u1 <- s1; layer 2: v0 = u0 - u1, v1 = 2 u1 + 0.1; outputs: pitch <- v0, yaw <- v1, thrust <- v0 + v1, ballast <- -v0, b_out ballast 0.05
    w2[L2[0].offW + 0] = 1; w2[L2[0].offW + 5] = 1; w2[L2[1].offW + 0] = 1; w2[L2[1].offW + 1] = -1; w2[L2[1].offW + 3] = 2; w2[L2[1].offB + 1] = 0.1;
    w2[L2[2].offW + 0] = 1; w2[L2[2].offW + 3] = 1; w2[L2[2].offW + 4] = 1; w2[L2[2].offW + 5] = 1; w2[L2[2].offW + 6] = -1; w2[L2[2].offB + 3] = 0.05;
    const c2 = Array.from(fw2(w2, Float64Array.from([0.5, 0.25, 0, 0]), d)), c3 = Array.from(fw2(w2, Float64Array.from([0.1, 0.4, 0, 0]), d));
    // x = (0.5, 0.25): u = [0.5, 0.25]; v = relu([0.25, 0.6]) = [0.25, 0.6]; out = [0.25, 0.6, 0.85, -0.25 + 0.05 = -0.2]
    ok("!! TWO hidden layers, worked by hand: x = (0.5, 0.25) gives u = [0.5, 0.25], v = relu([0.25, 0.6]) and outputs [0.25, 0.6, 0.85, -0.2]", same(c2, [0.25, 0.6, 0.85, -0.2]));
    // x = (0.1, 0.4): u = [0.1, 0.4]; v = relu([-0.3, 0.9]) = [0, 0.9]; out = [0, 0.9, 0.9, 0.05]
    ok("!! the relu holds the SECOND hidden layer too: x = (0.1, 0.4) makes v0 = -0.3 into 0, so the outputs are [0, 0.9, 0.9, 0.05]", same(c3, [0, 0.9, 0.9, 0.05]));
    const e1 = Array.from(fw(w, Float64Array.from([0.2, 0.4, 0, 0]), new Float64Array(4))), e2 = Array.from(fw(w, Float64Array.from([-0.5, 2, 0, 0]), new Float64Array(4))), e3 = Array.from(fw(w, Float64Array.from([0.2, 0.4, 0, 0]), new Float64Array(4)));
    ok("!! the passes do not leak into each other: a second pass on a different input does not disturb the first answer, and the same input gives the same answer again", same(e1, a) && same(e2, b) && same(e3, a));
    ok("!! the answer goes into the buffer it was given and that buffer is returned", (() => { const dest = new Float64Array(4); return fw(w, Float64Array.from([0.2, 0.4, 0, 0]), dest) === dest && near(dest[0], 0.3, 1e-6); })());
    const wz = new Float32Array(22); wz[8] = 5; wz[9] = 5; wz[18] = 0.3;
    ok("!! hidden biases alone drive the net with no input: biases [5, 5] and an output bias of 0.3 on pitch give pitch 0.3 (output weights zero)", near(fw(wz, new Float64Array(4), new Float64Array(4))[0], 0.3, 1e-6));
}

sec("3. THE START (zero readout, seeded hidden layers, the autopilot exactly)");
{
    for (const widths of [[9], [65], [72], P.MG_WIDTHS]) {
        const p = P.createPlainNetPolicy(widths, "s"), w = p.handWeights(), L = P.layoutOf(widths).layers, last = L[L.length - 1];
        let outZero = true; for (let i = last.offW; i < w.length; i++) if (w[i] !== 0) outZero = false;
        let biasZero = true; for (const l of L) if (l !== last) for (let j = 0; j < l.nOut; j++) if (w[l.offB + j] !== 0) biasZero = false;
        let hid = 0; for (let i = 0; i < L[0].nIn * L[0].nOut; i++) if (w[L[0].offW + i] !== 0) hid++;
        ok(`!! ${J(widths)}: the output layer and its biases are ALL zero, the hidden biases are zero and the first layer is drawn (${hid} of ${L[0].nIn * L[0].nOut} non-zero)`, outZero && biasZero && hid === L[0].nIn * L[0].nOut && w.length === p.WEIGHT_COUNT && p.zeroWeights().length === p.WEIGHT_COUNT && p.zeroWeights().every((v) => v === 0));
    }
    const sdOf = (w, off, n) => { let s = 0, q = 0; for (let i = 0; i < n; i++) { s += w[off + i]; q += w[off + i] ** 2; } const m = s / n; return Math.sqrt(q / n - m * m); };
    const mg = P.createPlainNetPolicy(P.MG_WIDTHS, "g"), wmg = mg.handWeights(), Lg = P.layoutOf(P.MG_WIDTHS).layers;
    const s1 = sdOf(wmg, Lg[0].offW, 128), s2 = sdOf(wmg, Lg[1].offW, 1024);
    ok("!! the registered scales: the first hidden layer ~ N(0, 0.5), the second ~ N(0, 0.25) (sample sd within 20 percent of each)", s1 > 0.4 && s1 < 0.6 && s2 > 0.2 && s2 < 0.3, `sd ${s1.toFixed(3)} and ${s2.toFixed(3)}`);
    const a = P.createPlainNetPolicy([9], "a").handWeights(), a2 = P.createPlainNetPolicy([9], "a", { seed: P.INIT.seed }).handWeights(), b = P.createPlainNetPolicy([9], "a", { seed: P.INIT.seed + 1 }).handWeights(), z = P.createPlainNetPolicy([9], "a", { seed: 0 }).handWeights();
    ok("!! the start is a seeded draw: the default seed is 4711, the same seed gives the same weights, another seed gives other ones (seed 0 is a seed too)", P.INIT.seed === 4711 && J(Array.from(a)) === J(Array.from(a2)) && J(Array.from(a)) !== J(Array.from(b)) && J(Array.from(z)) !== J(Array.from(a)) && z.some((v) => v !== 0));
    // GOLDEN VALUES: the start of a registered replicate must be re-creatable by anybody, so the seeded draw is pinned to the number (Box-Muller from mulberry(4711), the draw of the 4b-D variant)
    const g9 = P.createPlainNetPolicy([9], "g").handWeights(), gmg = mg.handWeights();
    let gsum = 0, gabs = 0; for (let i = 0; i < 36; i++) { gsum += g9[i]; gabs += Math.abs(g9[i]); }
    ok("!! GOLDEN: seed 4711, one hidden layer of 9: the first four weights are -0.11018455, -1.1117793, -0.94062519, 0.41447267, the sum of the 36 first-layer weights is -3.715324 and of their magnitudes 13.983778; the 4-32-32-4 net starts with the same first weight and its entries 127, 160 and 1183 are -0.81955606, -0.053735361, 0.090991765; seed 4712 starts with -0.9461652",
        [-0.11018455, -1.1117793, -0.94062519, 0.41447267].every((v, i) => near(g9[i], v, 2e-7)) && near(gsum, -3.715324, 2e-6) && near(gabs, 13.983778, 2e-6) && near(gmg[0], -0.11018455, 2e-7) && near(gmg[127], -0.81955606, 2e-7) && near(gmg[160], -0.053735361, 2e-7) && near(gmg[1183], 0.090991765, 2e-7) && near(P.createPlainNetPolicy([9], "g", { seed: 4712 }).handWeights()[0], -0.9461652, 2e-7));
    ok("!! the registered constants are frozen", Object.isFrozen(P.INIT) && P.INIT.layer1 === 0.5 && P.INIT.layer2 === 0.25);
    const set = T.BASELINE_SET.filter((s) => s.kind === "nominal").slice(0, 3), want = T.evaluate(AS.pilot(), set).score;
    for (const [widths, label] of [[[9], "MN H=9"], [[72], "MN H=72"], [P.MG_WIDTHS, "MG"]]) {
        const p = P.createPlainNetPolicy(widths, label);
        ok(`!! ${label}: the start IS the autopilot: the hand weights score exactly the PD autopilot on the dives (the readout is zero)`, near(p.evaluate(p.handWeights(), set).score, want, 1e-9));
    }
    const p9 = P.createPlainNetPolicy([9], "x");
    ok("!! and a zero weight vector is the autopilot too", near(p9.evaluate(p9.zeroWeights(), set).score, want, 1e-9));
    const s0 = st({ pitch: 0.05, bank: 0.1 }), ap = AS.decide(s0, set[0].target), got = p9.pilotFor(p9.handWeights())(s0, set[0].target, [0, 0, 0]);
    ok("!! the first command from the hand weights equals the autopilot's on the same state, field by field", KEYS.every((k) => near(got[k], ap[k], 1e-6)));
    const vp = V.createVestibularPolicy(V.circuitOf(X, "E"), "E", { persist: false }), vg = vp.pilotFor(vp.handWeights())(s0, set[0].target, [0, 0, 0]);
    ok("!! and equals the circuit pilot's own start on the same state: the autopilot's laws are the same laws", KEYS.every((k) => near(got[k], vg[k], 1e-6)));
}

sec("4. THE PILOT (the signals, the mirror, the relu, the clamps, no state)");
{
    const { p, w } = toyNet(), pilot = p.pilotFor(w);
    const nd = resid(pilot, st({ pitch: -0.02 })), nu = resid(pilot, st({ pitch: 0.02 })), rd = resid(pilot, st({ bank: 0.1 })), ld = resid(pilot, st({ bank: -0.1 })), rest = resid(pilot, st({}));
    ok("!! a NOSE-DOWN body of 0.02 rad reads pTonic 0.02 in BOTH copies: pitch residual 0.04 (even) and nothing on yaw, thrust or ballast (0.02 and not more: the autopilot's own pitch command saturates at 1 near 0.08 rad, and a residual on a saturated command is clamped away)", same(nd, [0.04, 0, 0, 0], 1e-5), J(nd.map((v) => +v.toFixed(5))));
    ok("!! a NOSE-UP body gives no pitch residual: the relu holds the negative signal at 0 (the net does not see signs it has no unit for)", same(nu, [0, 0, 0, 0], 1e-5));
    ok("!! a RIGHT-SIDE-DOWN body of 0.1 gives yaw +0.1: the right copy reads +0.1 and the left copy, whose roll signal is flipped, reads -0.1 and its relu holds 0", same(rd, [0, 0.1, 0, 0], 1e-5), J(rd.map((v) => +v.toFixed(5))));
    ok("!! MIRROR end to end: the LEFT-side-down body gives yaw -0.1 (the left copy answers it, its yaw negated), the same size as the right-side-down body and the opposite sign, and nothing else", same(ld, [0, -0.1, 0, 0], 1e-5));
    ok("!! at rest there is no residual at all (zero biases, zero signals)", same(rest, [0, 0, 0, 0], 1e-9));
    const sc = { pTonic: 2, rTonic: 3, pPhasic: 5, rPhasic: 7 };
    const sp = P.createPlainNetPolicy([4], "scaled", { scales: sc }), wq = toyNet([0, 1, 2, 3], 0.1).w;
    // two states, because the autopilot's pitch command saturates with any pitch rate: A (pitch attitude only) shows the pitch residual, B (a bank and the rates) shows the other three
    const sA = st({ pitch: -0.02 }), sB = st({ bank: 0.1, w: [0.1, 0.2, 0] }), sensA = V.sense(sA), sensB = V.sense(sB), both = (pol) => { const a = resid(pol.pilotFor(wq), sA), b = resid(pol.pilotFor(wq), sB); return { v: [a[0], b[1], b[2], b[3]], quiet: Math.max(Math.abs(a[1]), Math.abs(a[2]), Math.abs(a[3])) }; };
    const got = both(sp).v;
    // each signal times ITS OWN scale, times the output weight 0.1: pitch 2 x 0.02 x 0.1 x 2 copies; yaw 3 x 0.1 x 0.1 (right copy only); thrust 5 x 0.2 x 0.1 x 2; ballast 7 x 0.1 x 0.1 (right copy only: the left copy sees -0.7)
    ok("!! EACH SIGNAL GOES TO ITS OWN INPUT WITH ITS OWN SCALE (scales 2, 3, 5, 7 on pTonic, rTonic, pPhasic, rPhasic): pitch 2 x 0.1 x 0.1 x 2, yaw 3 x 0.1 x 0.1, thrust 5 x 0.2 x 0.1 x 2, ballast 7 x 0.1 x 0.1 (the lateral signals count in one copy only)", same(got, [2 * sensA.pTonic * 0.1 * 2, 3 * sensB.rTonic * 0.1, 5 * sensB.pPhasic * 0.1 * 2, 7 * sensB.rPhasic * 0.1], 1e-5) && both(sp).quiet < 1e-6, J(got.map((v) => +v.toFixed(5))));
    const gu = both(P.createPlainNetPolicy([4], "unscaled")).v;
    ok("!! with no scales given every scale is 1 (the same states read 2, 3, 5 and 7 times smaller)", same(gu, [sensA.pTonic * 0.1 * 2, sensB.rTonic * 0.1, sensB.pPhasic * 0.1 * 2, sensB.rPhasic * 0.1], 1e-5));
    const gpart = both(P.createPlainNetPolicy([4], "part", { scales: { pPhasic: 5 } })).v;
    ok("!! a scales option that names only some signals leaves the others at 1", same(gpart, [sensA.pTonic * 0.1 * 2, sensB.rTonic * 0.1, 5 * sensB.pPhasic * 0.1 * 2, sensB.rPhasic * 0.1], 1e-5));
    // parity of every output, with all four reading the SAME hidden unit (pTonic, seen alike by both copies)
    const par = toyNet([0, 0, 0, 0]), pp = resid(par.p.pilotFor(par.w), st({ pitch: -0.02 }));
    ok("!! PARITY of the four controls under the mirror: with every output reading pTonic, pitch, thrust and ballast get both copies (0.04 each) and yaw, odd, gets nothing", same(pp, [0.04, 0, 0.04, 0.04], 1e-5), J(pp.map((v) => +v.toFixed(5))));
    // hidden biases: a different bias per unit, so a bias added to the wrong unit shows
    const hb = toyNet([0, 1, 2, 3], 1, [0.01, 0.02, 0.03, 0.04]), hr = resid(hb.p.pilotFor(hb.w), st({}));
    ok("!! the hidden biases are added to their own units in both copies: biases [0.01, 0.02, 0.03, 0.04] give pitch 0.02, thrust 0.06, ballast 0.08 and yaw 0.02 - 0.02 = 0 (odd)", same(hr, [0.02, 0, 0.06, 0.08], 1e-6), J(hr.map((v) => +v.toFixed(6))));
    const ob = toyNet([0, 1, 2, 3], 1, [0, 0, 0, 0], [0, 0.07, 0.05, 0]), orr = resid(ob.p.pilotFor(ob.w), st({}));
    ok("!! the output biases are added in each copy: a thrust bias of 0.05 gives the thrust 0.10 (both copies, even) and a yaw bias of 0.07 gives the yaw nothing (odd, the copies cancel)", same(orr, [0, 0, 0.1, 0], 1e-6));
    // clamps
    const big = toyNet([0, 0, 0, 0], 1e6), cb = big.p.pilotFor(big.w)(st({ pitch: -0.1 }), tgt, [0, 0, 0]);
    ok("!! every control is clamped to [-1, 1], whatever the weights say (1e6 on every output): pitch, thrust and ballast reach +1", cb.pitch === 1 && cb.thrust === 1 && cb.ballast === 1 && cb.yaw >= -1 && cb.yaw <= 1);
    const bn = toyNet([0, 0, 0, 0], -1e6), cn = bn.p.pilotFor(bn.w)(st({ pitch: -0.1 }), tgt, [0, 0, 0]);
    ok("!! and at -1 on the low side (-1e6 on every output): pitch, thrust and ballast reach -1", cn.pitch === -1 && cn.thrust === -1 && cn.ballast === -1);
    const yb = toyNet([0, 1, 2, 3], 1e6), yr = yb.p.pilotFor(yb.w)(st({ bank: 0.1 }), tgt, [0, 0, 0]), yl = yb.p.pilotFor(yb.w)(st({ bank: -0.1 }), tgt, [0, 0, 0]);
    ok("!! yaw clamps at both ends (+1 from the right copy, -1 from the left copy's negated yaw)", yr.yaw === 1 && yl.yaw === -1);
    for (const [o, nm] of KEYS.map((k, i) => [i, k])) {
        const nan = toyNet(); nan.w[nan.L[1].offW + o * 4 + o] = NaN;
        const nc = nan.p.pilotFor(nan.w)(st({ pitch: -0.1, bank: 0.1, w: [0.1, 0.2, 0] }), tgt, [0, 0, 0]);
        ok(`!! a non-finite ${nm} readout weight cannot put a non-finite number on any control (it reads as 0)`, KEYS.every((k) => Number.isFinite(nc[k])));
    }
    const nanH = toyNet(); nanH.w[nanH.L[0].offW] = NaN;
    const nh = resid(nanH.p.pilotFor(nanH.w), st({ pitch: -0.02 }));
    ok("!! a non-finite first-layer weight is held by the relu: the unit it feeds reads as 0 in both copies, so the pitch residual is 0 (the command is the autopilot's, not zeroed) and every control is finite", same(nh, [0, 0, 0, 0], 1e-9) && KEYS.every((k) => Number.isFinite(nanH.p.pilotFor(nanH.w)(st({ pitch: -0.02 }), tgt, [0, 0, 0])[k])));
    // the current reaches the autopilot's laws
    const p9 = P.createPlainNetPolicy([9], "c"), cur = [0.4, 0.2, 0], moving = st({ speed: 2, bank: 0.05 }), withCur = p9.pilotFor(p9.handWeights())(moving, tgt, cur), apCur = AS.decide(moving, tgt, cur);
    ok("!! the water's current reaches the autopilot's laws and the features (at the hand weights the commands equal the autopilot's in a current, field by field, and differ from its command in still water)", KEYS.every((k) => near(withCur[k], apCur[k], 1e-6)) && Math.abs(withCur.thrust - AS.decide(moving, tgt, [0, 0, 0]).thrust) > 1e-3);
    const dflt = p9.pilotFor(p9.handWeights())(moving, tgt);
    ok("!! a call with no current is a call in still water", KEYS.every((k) => near(dflt[k], AS.decide(moving, tgt, [0, 0, 0])[k], 1e-9)));
    // no state
    const tn = toyNet(), fresher = () => tn.p.pilotFor(tn.w), mem = fresher(), s1 = st({ pitch: -0.1, bank: 0.1 }), s2 = st({ pitch: 0.05, bank: -0.2 });
    const first = mem(s1, tgt, [0, 0, 0]), second = mem(s2, tgt, [0, 0, 0]), fresh = fresher()(s2, tgt, [0, 0, 0]);
    ok("!! NO STATE: what the pilot did a tick ago does not change what it does now (a call after another state equals a fresh pilot's call), and the same input gives the same command again", KEYS.every((k) => near(second[k], fresh[k], 1e-12)) && KEYS.every((k) => near(mem(s1, tgt, [0, 0, 0])[k], first[k], 1e-12)));
    const other = { depth: 25, heading: 1, speed: 2 }, again = mem(s1, other, [0, 0, 0]), again2 = fresher()(s1, other, [0, 0, 0]);
    ok("!! a new target changes nothing about the net (there is no state to reset): the call equals a fresh pilot's", KEYS.every((k) => near(again[k], again2[k], 1e-12)));
    const wa = toyNet([0, 1, 2, 3], 1), wb = toyNet([0, 0, 0, 0], 1), pa = wa.p.pilotFor(wa.w), pb = wb.p.pilotFor(wb.w), a1 = pa(s1, tgt, [0, 0, 0]);
    pb(s1, tgt, [0, 0, 0]); pb(s2, tgt, [0, 0, 0]);
    ok("!! two pilots built from different weights do not share working memory: pilot A answers alike before and after pilot B has run", KEYS.every((k) => near(pa(s1, tgt, [0, 0, 0])[k], a1[k], 1e-12)));
}

sec("5. THE SEARCH (on a stub task: the score is how close the thrust at one fixed state is to 0.6, so the gate stays quick)");
{
    const rng0 = (a = 5) => () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return (a + 0.5) / 0x80000000; };
    const probe = st({ pitch: -0.1, w: [0, 0.2, 0] }), task = (pilot) => ({ score: -Math.abs(pilot(probe, tgt, [0, 0, 0]).thrust - 0.6) });
    const mk = (extra = {}) => P.createPlainNetPolicy([4], "toy", { evaluate: task, ...extra });
    const p = mk(), w = p.handWeights(), m = p.mutate(w, 5, rng0(), 4), changed = Array.from(m).filter((v, i) => v !== w[i]).length;
    ok("!! mutate changes between 1 and maxK weights, returns a Float32Array of the same length and does not touch its input", changed >= 1 && changed <= 4 && m instanceof Float32Array && m.length === w.length && m !== w && J(Array.from(w)) === J(Array.from(p.handWeights())));
    ok("!! mutate's number of changed weights is drawn from 1 to maxK: over 400 mutations of 40 weights with maxK 4 the fewest is 1 and the most is exactly 4, and maxK defaults to 4", (() => { const r = rng0(11); let lo = 99, hi = 0, hi2 = 0; for (let i = 0; i < 400; i++) { const q = p.mutate(w, 0.5, r, 4), n = Array.from(q).filter((v, j) => v !== w[j]).length; lo = Math.min(lo, n); hi = Math.max(hi, n); const q2 = p.mutate(w, 0.5, r), n2 = Array.from(q2).filter((v, j) => v !== w[j]).length; hi2 = Math.max(hi2, n2); } return lo === 1 && hi === 4 && hi2 === 4; })());
    ok("!! mutate's step is sigma times a unit normal: the mean absolute step over 2,000 single-weight moves is about 0.8 sigma (0.798)", (() => { const r = rng0(3); let s = 0, n = 0; for (let i = 0; i < 2000; i++) { const q = p.mutate(w, 2, r, 1); for (let j = 0; j < q.length; j++) if (q[j] !== w[j]) { s += Math.abs(q[j] - w[j]); n++; } } const mean = s / n; return n === 2000 && mean > 1.4 && mean < 1.8; })());
    ok("!! mutate's steps go both ways: over 400 single-weight moves of sigma 1 about half are up and half down (between 150 and 250 up)", (() => { const r = rng0(21); let up = 0; for (let i = 0; i < 400; i++) { const q = p.mutate(w, 1, r, 1); for (let j = 0; j < q.length; j++) if (q[j] > w[j]) up++; } return up > 150 && up < 250; })());
    ok("!! mutate is a function of its random source: the same stream gives the same child, another stream another", J(Array.from(p.mutate(w, 1, rng0(9), 4))) === J(Array.from(p.mutate(w, 1, rng0(9), 4))) && J(Array.from(p.mutate(w, 1, rng0(9), 4))) !== J(Array.from(p.mutate(w, 1, rng0(10), 4))));
    let seen = []; const seam = P.createPlainNetPolicy([4], "seam", { evaluate: (pilot, set, o) => { seen.push({ type: typeof pilot, set, o }); return { score: -1 }; } });
    const r = seam.evaluate(seam.handWeights(), "SET", { gauge: 1 });
    ok("!! the evaluate seam: the task is whatever `evaluate` says, called with the pilot, the set and the options; the default evaluator is the subTask one", r.score === -1 && seen.length === 1 && seen[0].type === "function" && seen[0].set === "SET" && seen[0].o.gauge === 1 && typeof P.createPlainNetPolicy([4], "d").evaluate === "function");
    const dflt = P.createPlainNetPolicy([4], "d"), setT = T.BASELINE_SET.filter((s) => s.kind === "nominal").slice(0, 2);
    ok("!! with no evaluator given the default scores the dives as subTask does, and the default set is the training set", near(dflt.evaluate(dflt.handWeights(), setT).score, T.evaluate(AS.pilot(), setT).score, 1e-9) && near(dflt.evaluate(dflt.handWeights()).score, T.evaluate(AS.pilot(), T.TRAIN_SET).score, 1e-9));
    // the trainer's own search() on a plain net
    const rec = { iters: 80, sigma: 0.3, maxK: 4, pruneBudget: 30 }, start = p.evaluate(p.handWeights(), "SET").score, s1 = TR.search(p, 3, 0, rec, "SET"), s2 = TR.search(p, 3, 0, rec, "SET"), s3 = TR.search(p, 4, 0, rec, "SET");
    ok("!! the 4b trainer's own search() runs on a plain net: the seed fixes the run, the score ends better than the start, the prune keeps no more than was moved, and every kept weight differs from the start", J(Array.from(s1.weights)) === J(Array.from(s2.weights)) && J(Array.from(s1.weights)) !== J(Array.from(s3.weights)) && s1.trainScore > start && s1.kept <= s1.moved && s1.kept >= 1 && s1.weights.length === p.WEIGHT_COUNT, `start ${start.toFixed(4)} -> ${s1.trainScore.toFixed(4)}, ${s1.moved} moved, ${s1.kept} kept`);
}

sec("6. THE CONTRACT (what the trainer reads) AND THE REPORT");
{
    const mn = P.createPlainNetPolicy([65], "P/B/mn:0"), mg = P.createPlainNetPolicy(P.MG_WIDTHS, "mg:0"), widths = [9];
    const p = P.createPlainNetPolicy(widths, "x"); widths.push(99);
    ok("!! the contract: name, FEATURES 14, OUTPUTS 4, WEIGHT_COUNT, INPUTS 4, CELLS (all hidden units), no state (persist false, no lambda slot), the functions the trainer calls", mn.name === "P/B/mn:0" && mn.FEATURES === 14 && mn.OUTPUTS === 4 && mn.WEIGHT_COUNT === 589 && mn.INPUTS === 4 && mn.CELLS === 65 && mg.CELLS === 64 && mg.WEIGHT_COUNT === 1348 && mn.persist === false && mn.LAMBDA_INDEX === -1 && ["zeroWeights", "handWeights", "pilotFor", "mutate", "evaluate", "reportLines"].every((k) => typeof mn[k] === "function"));
    ok("!! the widths are a copy (a caller editing its list afterwards does not change the pilot) and are reported", J(p.widths) === J([9]) && p.WEIGHT_COUNT === 85 && J(mg.widths) === J([32, 32]));
    ok("!! the reach is the number of input-to-hidden connections of the first layer (4 x H): 260 for 65 units, 128 for the 4-32-32-4 net", mn.reach.pairs === 260 && mg.reach.pairs === 128);
    ok("!! the default scales are all 1 and an option merges over them", J(mn.scales) === J({ pTonic: 1, rTonic: 1, pPhasic: 1, rPhasic: 1 }) && P.createPlainNetPolicy([4], "s", { scales: { rTonic: 4 } }).scales.rTonic === 4 && P.createPlainNetPolicy([4], "s", { scales: { rTonic: 4 } }).scales.pTonic === 1);
    const rep = mn.reportLines();
    ok("!! the report names the net, its widths, that it has no state, the four signals, the autopilot and the weight count", rep.length === 1 && /P\/B\/mn:0 \(65 relu units\) as a NO-STATE mirrored pair/.test(rep[0]) && /4 tilt signals/.test(rep[0]) && /added to the autopilot's/.test(rep[0]) && /589 trained weights/.test(rep[0]) && /32-32 relu units/.test(mg.reportLines()[0]) && /1348 trained weights/.test(mg.reportLines()[0]));
    ok("!! a hidden width list that is not one is refused when a pilot is made, too", /layoutOf/.test(throws(() => P.createPlainNetPolicy([])) || "") && /layoutOf/.test(throws(() => P.createPlainNetPolicy(null)) || ""));
}

sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./pilotSubPlainNet.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no file or network, no process", !/Math\.random|Date\.now|new Date|performance\.now|\bfs\b|node:fs|node:net|\bfetch\(|process\./.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
