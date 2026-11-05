// WebGLEngine/brain/pilotSubPlain-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotSubPlain-selfcheck.mjs      (about 6 s)
//
// THE GATE OF brain/pilotSubPlain.mjs: the plain control of the 963-weight tank networks -- brain/pilotSubPolicy.mjs's pilot on a circuit with no edge, 14 features, 50 relu units, 4 controls, 954 weights. brain/pilotSubPolicy-selfcheck.mjs holds createSubPolicy() itself; this gate asks the questions that make THIS one the control it is claimed to be:
//   1 SHAPE        14 features, 50 neurons, no synapse at all, 4 outputs, 954 weights (14 x 50 + 50 + 0 + 50 x 4 + 4), within 1 percent of the fly network's 963; the zero weights output nothing; the topology is frozen and has no edge.
//   2 THE TOPOLOGY plainTopology(n): n neurons with ids 8000.., no edge, frozen; 7, 401, 1.5, "50" and NaN refused by name, 8 and 400 taken, the default 50; plainPolicy(n) has 14 n + n + 4 n + 4 weights (8 -> 156, 50 -> 954, 100 -> 1,904).
//   3 NO WIRING    the forward pass equals an independent restatement as a 14-n-4 relu net written here (two layers, no recurrence) over 200 random weight vectors and random features to 1e-9; the outputs clamp to [-1, 1]; a non-finite feature reads 0 -- so nothing in it is the connectome's, and a policy that quietly took three recurrent steps through an edge list, or read another circuit, is caught.
//   4 THE START    the hand weights have 26 non-zero numbers and are the PD autopilot: over 600 random states the controls equal autopilotSub.decide()'s to 1e-5, and the same weights written for the fly's circuit give the same controls (every circuit STARTS as one pilot).
//   5 TRAINING     a short search is deterministic for a seed, differs for another, never lowers its own score, and its reported score is its weights' (the recipe the tool uses, on 4 dives).
//   6 THE COMMAND  run as a program it prints the two report lines and exits 0; imported it prints nothing (the gate is registered to see an exit on import).
// SABOTAGED: see the log at the foot of this header.
// NOT CHECKED, said plainly: that a trained plain net is any good (tools/ship/trainSubPilot.mjs --circuit plain14 makes and grades one); that 954 is the right size for a control of the 963 (it is the nearest whole hidden layer: 50 units give 954, 51 give 973).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED: something it imported, or the gate itself, called process.exit()"); process.exitCode = 1; } });
const PP = await import("./pilotSubPlain.mjs");
const PS = await import("./pilotSubPolicy.mjs");
const AS = await import("./autopilotSub.mjs");
const T = await import("./subTask.mjs");
const S = await import("../physics/mechanics/subModel6dof.mjs");
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, KEYS = ["pitch", "yaw", "thrust", "ballast"];
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
console.log("pilotSubPlain-selfcheck -- the plain control of the 963-weight tank networks\n");

sec("1. SHAPE");
{
    const P = PP.PLAIN14;
    ok("!! 14 features, 50 neurons, 0 synapses, 4 outputs, 954 weights (14 x 50 + 50 + 0 + 50 x 4 + 4), within 1 percent of the fly network's 963", P.FEATURES === 14 && P.HIDDEN === 50 && P.REC_EDGES === 0 && P.OUTPUTS === 4 && P.WEIGHT_COUNT === 954 && 14 * 50 + 50 + 0 + 50 * 4 + 4 === 954 && PP.HIDDEN === 50 && Math.abs(954 - PS.FLY.WEIGHT_COUNT) / PS.FLY.WEIGHT_COUNT < 0.01 && PS.FLY.WEIGHT_COUNT === 963);
    const z = P.forward(P.zeroWeights(), new Array(14).fill(1));
    ok("the zero weights are 954 zeros, a fresh array each call, and output exactly zero for any features", P.zeroWeights().length === 954 && P.zeroWeights().every((v) => v === 0) && P.zeroWeights() !== P.zeroWeights() && KEYS.every((k) => z[k] === 0));
    ok("the pilot has the contract of createSubPolicy: the functions a trainer and a tank need", ["forward", "pilotFor", "handWeights", "zeroWeights", "evaluate", "train", "prune", "mutate", "perturb", "layersOf", "reportLines"].every((f) => typeof P[f] === "function"));
}

sec("2. THE TOPOLOGY");
{
    const t = PP.plainTopology(), t8 = PP.plainTopology(8);
    ok("!! plainTopology: 50 neurons by default with ids 8000..8049, no edge, frozen all through; 8 neurons give ids 8000..8007", t.NEURON_ORDER.length === 50 && t.NEURON_ORDER[0] === 8000 && t.NEURON_ORDER[49] === 8049 && t.EDGES.length === 0 && Object.isFrozen(t) && Object.isFrozen(t.NEURON_ORDER) && Object.isFrozen(t.EDGES) && t8.NEURON_ORDER.length === 8 && t8.NEURON_ORDER[7] === 8007);
    ok("!! 7, 401, 1.5, \"50\", NaN and null are refused with the range; 8 and 400 are taken", [7, 401, 1.5, "50", NaN, null].every((n) => /from 8 to 400/.test(throws(() => PP.plainTopology(n)) || "")) && throws(() => PP.plainTopology(8)) === null && throws(() => PP.plainTopology(400)) === null);
    ok("!! plainPolicy(n) has 19 n + 4 weights: 8 -> 156, 50 -> 954, 100 -> 1,904; the default is the 50; a name is kept and the default names the shape", PP.plainPolicy(8).WEIGHT_COUNT === 156 && PP.plainPolicy(50).WEIGHT_COUNT === 954 && PP.plainPolicy(100).WEIGHT_COUNT === 1904 && PP.plainPolicy().WEIGHT_COUNT === 954 && PP.plainPolicy(8).name === "a plain 14-8-4 relu net (no wiring)" && PP.plainPolicy(8, "mine").name === "mine" && PP.PLAIN14.name === "a plain 14-50-4 relu net (no wiring)");
}

sec("3. NO WIRING: AN INDEPENDENT 14-n-4 RELU NET");
{
    const P = PP.PLAIN14, r = rnd(11); let worst = 0, clampOk = true, nonzero = 0;
    for (let t = 0; t < 200; t++) {
        const w = Float32Array.from({ length: P.WEIGHT_COUNT }, () => (r() - 0.5) * 0.1), x = Array.from({ length: 14 }, () => (r() - 0.5) * 4), y = P.forward(w, x);
        const h = new Float64Array(50); for (let j = 0; j < 50; j++) { let s = w[14 * 50 + j]; for (let f = 0; f < 14; f++) s += w[j * 14 + f] * x[f]; h[j] = s > 0 ? s : 0; }
        const o0 = 14 * 50 + 50 + 0;   // after the input layer and its biases and the (empty) recurrent block
        KEYS.forEach((k, o) => { let s = w[o0 + 200 + o]; for (let j = 0; j < 50; j++) s += w[o0 + o * 50 + j] * h[j]; const want = Math.max(-1, Math.min(1, s)); worst = Math.max(worst, Math.abs(want - y[k])); if (Math.abs(want) < 1) nonzero++; if (!(Math.abs(y[k]) <= 1)) clampOk = false; });
    }
    ok("!! over 200 random weight vectors and random features the forward pass equals a 14-50-4 relu net written here (two layers, no recurrence), clamped to [-1, 1], to 1e-9", worst < 1e-9 && nonzero > 300, `worst ${worst.toExponential(2)}, ${nonzero} unclamped outputs of 800`);
    ok("the outputs never leave [-1, 1]; a non-finite feature reads 0 (NaN, Infinity and undefined in place of a feature give the controls of 0)", clampOk && (() => { const w = Float32Array.from({ length: 954 }, () => (r() - 0.5) * 0.1), a = P.forward(w, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), b = P.forward(w, [0, 1, 2, NaN, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), c = P.forward(w, [0, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]); return KEYS.every((k) => b[k] === c[k]) && KEYS.some((k) => a[k] !== c[k]) && KEYS.every((k) => P.forward(w, [Infinity, ...Array(13).fill(0)])[k] === P.forward(w, Array(14).fill(0))[k]); })());
    ok("with the output weights zero the net outputs its output biases whatever the input; with a zero input and a zero input bias it outputs the clamped output biases", (() => { const w = new Float32Array(954); for (let o = 0; o < 4; o++) w[950 + o] = [0.25, -0.5, 2, -3][o]; const y = P.forward(w, Array.from({ length: 14 }, () => 7)); return y.pitch === 0.25 && y.yaw === -0.5 && y.thrust === 1 && y.ballast === -1; })());
}

sec("4. THE START IS THE AUTOPILOT");
{
    const P = PP.PLAIN14, hand = P.handWeights(), hf = PS.FLY.handWeights(), r = rnd(5), model = S.createSubModel();
    ok("!! the hand weights are 954 numbers, 26 of them non-zero, the layout's recurrent block (there is none) empty", hand.length === 954 && hand.filter((v) => v !== 0).length === 26 && hf.filter((v) => v !== 0).length === 26);
    let worstA = 0, worstF = 0;
    for (let t = 0; t < 600; t++) {
        const st = S.createState({ depth: 10 + r() * 50, speed: 0.5 + r() * 4, heading: (r() - 0.5) * 6, pitch: (r() - 0.5) * 0.6, bank: (r() - 0.5) * 0.8, pos: [250, 150, -20], w: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3], model }), tg = { depth: 10 + r() * 40, heading: (r() - 0.5) * 6, speed: 1 + r() * 3 }, cur = [(r() - 0.5), (r() - 0.5), 0];
        const a = AS.decide(st, tg, cur), x = PS.features(st, tg, cur), p = P.forward(hand, x), f = PS.FLY.forward(hf, x);
        for (const k of KEYS) { worstA = Math.max(worstA, Math.abs(p[k] - a[k])); worstF = Math.max(worstF, Math.abs(p[k] - f[k])); }
    }
    ok("!! over 600 random states the hand weights give autopilotSub.decide()'s controls to 1e-5, and the fly's hand weights give the same controls (every circuit STARTS as one pilot)", worstA < 1e-5 && worstF < 1e-5, `worst ${worstA.toExponential(2)} and ${worstF.toExponential(2)}`);
    const pilot = P.pilotFor(hand), ref = AS.pilot(); let s = S.createState({ depth: 25, speed: 2, pos: [250, 150, -25], heading: 0.3, model }), d = 0;
    for (let i = 0; i < 300; i++) { const tg = { depth: 32, heading: 1.2, speed: 2.4 }, a = pilot(s, tg, [0, 0, 0]), b = ref(s, tg, [0, 0, 0]); for (const k of KEYS) d = Math.max(d, Math.abs(a[k] - b[k])); s = S.stepSub(model, s, a, S.DT, [0, 0, 0], 0).state; }
    ok("a whole 10 s dive flown by the hand-weight plain net matches the autopilot's commands tick for tick to 1e-5", d < 1e-5, d.toExponential(2));
}

sec("5. TRAINING");
{
    const P = PP.PLAIN14, set = T.TRAIN_SET.slice(0, 4), a = P.train({ seed: 3, iters: 6, trainSet: set }), b = P.train({ seed: 3, iters: 6, trainSet: set }), c = P.train({ seed: 4, iters: 6, trainSet: set }), start = P.evaluate(P.handWeights(), set).score;
    ok("!! a 6-child search is deterministic for a seed (the same weights and score twice), differs for another seed, and never ends below its start", J(Array.from(a.weights)) === J(Array.from(b.weights)) && a.trainScore === b.trainScore && J(Array.from(a.weights)) !== J(Array.from(c.weights)) && a.trainScore >= start - 1e-12 && c.trainScore >= start - 1e-12, `${start.toFixed(4)} -> ${a.trainScore.toFixed(4)} / ${c.trainScore.toFixed(4)}`);
    ok("its reported score is its weights' own score on that set, and it keeps 954 weights", Math.abs(P.evaluate(a.weights, set).score - a.trainScore) < 1e-9 && a.weights.length === 954);
}

sec("6. THE COMMAND");
{
    const child = spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", path.join(HERE, "pilotSubPlain.mjs")], { encoding: "utf8", timeout: 60000 });
    ok("!! run as a program it prints the two report lines (the shape, then the hand weights) and exits 0; the first line names 14-50-4, 50 neurons, 0 synapses and 954 weights", child.status === 0 && child.stdout.split("\n").filter(Boolean).length === 2 && /a plain 14-50-4 relu net \(no wiring\) \(50 neurons, 0 synapses\) as a submarine pilot: 14 features -> 4 controls, 954 weights/.test(child.stdout) && /26 of 954 non-zero/.test(child.stdout));
    ok("the reportLines function gives the same lines the program printed", PP.reportLines().join("\n") === PP.PLAIN14.reportLines().join("\n") && child.stdout.startsWith(PP.reportLines()[0]));
}
{
    const raw = fs.readFileSync(path.join(HERE, "pilotSubPlain.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! pure: no Math.random, no clock, no file, no network; the one static import is the policy", !/Math\.random|Date\.now|new Date|performance\.now|\bfs\b|node:fs|fetch\(/.test(code) && J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1])) === J(["./pilotSubPolicy.mjs"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
