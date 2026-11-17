// WebGLEngine/brain/lesionFlyCx-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/lesionFlyCx-selfcheck.mjs      (about 5-10 s: the real circuit, recorded features and a few short tank flights)
//
// THE GATE OF brain/lesionFlyCx.mjs AND OF THE RESERVOIR HALF OF brain/lesion.mjs (backlog `lesion-toggle`, the stateful fly).
//   1 TOPOLOGY  the fly's heading loop as a reservoir topology: 148 cells, 7,080 edges, roles 42 / 18 / 46 / 42, the weight layout of createStatePolicy (1,729, the bias offset, sigma's index), the labels, glomerulusOf; refusals.
//   2 EXACT     the bias clamp IS silencing: a lesioned vector stepped by the policy's own update equals this gate's masked reference (the intact weights, the silenced cells forced to 0 after every tick and fed back as 0) on
//               random features AND on features recorded from a real tank flight, with and without memory; the silenced cells read exactly 0 on every tick; the margin (the largest positive inputs + recurrent sum on any cell, against 1e30) is measured.
//   3 INERT     the reservoir rule: the trained file has none; zero weights are all inert; a bias > 0 or an input row lights a cell and, with sigma > 0, everything downstream of it; sigma 0 lights nothing downstream.
//   4 RANDOM    role-matched draws keep each role's count; a whole type is refused matched (it fills its role) with the reason, and drawn unmatched.
//   5 ARMS      flyCxArms: ids, controls, topo, entry, the kind registered with memory on and off; checkFile's refusals; topologyOf finds the arm's own topo.
//   6 REAL      on the switchboard's dropout task: silencing every cell flies exactly the pilot whose readout weights are zero (both leave the readout bias alone); silencing nothing flies the intact pilot; a lesion moves it.
//   7 SOURCE    no clock, random number or file; the header says the type-is-a-role confound.
// NOT CHECKED, said plainly: whether any class matters (the experiment); the page.
// SABOTAGE LOG: brain/LESION_TOGGLE_WIP.md section 6.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const env = (k, f) => (process.env[k] ? new URL("file://" + process.env[k]) : new URL(f, import.meta.url));
const LESION_URL = env("LESION_UNDER_TEST", "./lesion.mjs"), FLY_URL = env("LESIONFLYCX_UNDER_TEST", "./lesionFlyCx.mjs");
const L = await import(LESION_URL.href), F = await import(FLY_URL.href);
import * as CS from "./pilotSubCircuitState.mjs";
import * as P from "./pilotSubPolicy.mjs";
import * as B from "./switchboard.mjs";
import * as A from "../render/subAquariumSim.mjs";
import * as FX from "../render/subAquariumFlyCx.mjs";
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const eng = new URL("../", import.meta.url), rd = (f) => JSON.parse(fs.readFileSync(new URL(f, eng), "utf8"));
const cj = rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"), circuit = { neurons: cj.neurons, edges: cj.edges, io: cj.io }, file = rd("brain/pilotSubFlyCxWip.json");
const src = fs.readFileSync(FLY_URL, "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), head = src.split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
console.log("lesionFlyCx-selfcheck -- lesions of the stateful fly\n");
const T = F.reservoirTopology(circuit), POL = CS.createStatePolicy(circuit, "gate"), NOS = CS.createStatePolicy(circuit, "gate", { persist: false });

sec("1. TOPOLOGY");
{
    ok("!! 148 cells, 7,080 edges as [to, from], kind reservoir, 88 input and 64 output cells", T.KIND === "reservoir" && T.NEURON_ORDER.length === 148 && T.EDGES.length === 7080 && T.INPUTS.length === 88 && T.OUTPUTS.length === 64 && J(T.EDGES[0]) === J([cj.edges[0][1], cj.edges[0][0]]));
    ok("!! the four roles: input only 42 (PEN_a + PEN_b), output only 18 (PEG), both 46 (EPG), neither 42 (Delta7), covering every cell once", J(T.STRATA.map((s) => s.length)) === "[42,18,46,42]" && T.STRATA.flat().sort((a, b) => a - b).join() === Array.from({ length: 148 }, (_, i) => i).join() && T.STRATA[1].every((i) => cj.neurons[i].cls === "PEG") && T.STRATA[3].every((i) => cj.neurons[i].cls === "Delta7"));
    ok("!! the weight layout is createStatePolicy's: 1,729 weights, the bias at 15 x 88, sigma at the policy's SIGMA_INDEX", T.WEIGHT_COUNT === POL.WEIGHT_COUNT && T.WEIGHT_COUNT === 1729 && T.OFF_B === 15 * 88 && T.SIGMA_INDEX === POL.SIGMA_INDEX && T.STATE_FEATURES === 15);
    const cl = (by) => Object.fromEntries(Object.entries(L.classesOf(T, by).classes).map(([k, v]) => [k, v.length]));
    ok("!! by type: EPG 46, PEN_a 20, PEN_b 22, Delta7 42, PEG 18; by side ten classes, PEN_b_L 11; groupings are type, side, glomerulus", J(cl("type")) === J({ PEN_b: 22, EPG: 46, PEN_a: 20, Delta7: 42, PEG: 18 }) && Object.keys(cl("side")).length === 10 && cl("side").PEN_b_L === 11 && J(L.groupingsOf(T)) === '["type","side","glomerulus"]');
    const g = L.classesOf(T, "glomerulus").classes;
    ok("!! by glomerulus: 18 glomeruli L1-L9 and R1-R9 plus one class of the 42 Delta7 that span several; L4 holds 8 cells of four types", Object.keys(g).length === 19 && g["spans several (Delta7)"].length === 42 && g.L4.length === 8 && new Set(g.L4.map((i) => cj.neurons[i].cls)).size === 4 && g.L4.every((i) => /_L4$/.test(cj.neurons[i].instance)));
    ok("!! glomerulusOf reads the trailing side and number, and a bare side is null", F.glomerulusOf("PEN_b(PB06b)_L4") === "L4" && F.glomerulusOf("EPG(PB08)_R12") === "R12" && F.glomerulusOf("Delta7(PB15)_L6R3_L") === null && F.glomerulusOf(undefined) === null);
    ok("!! refused: a bad grouping (naming the reservoir's), a neuron without a side, what reservoirOf refuses", /by must be one of type, side, glomerulus for this circuit, got "instance"/.test(thr(() => L.classesOf(T, "instance"))) && /neuron 3 needs cls, side/.test(thr(() => F.reservoirTopology({ ...circuit, neurons: circuit.neurons.map((n, i) => (i === 3 ? { ...n, side: "X" } : n)) }))) && /pilotSubCircuitState\.reservoirOf/.test(thr(() => F.reservoirTopology({ ...circuit, io: { inputs: [], outputs: [1] } }))));
}

// This gate's own meaning of "silenced": the policy's update on the INTACT weights, the silenced cells forced to 0 after every tick and fed back as 0.
function masked(pol, w, xs, dead) {
    let h = new Float64Array(148); const out = [];
    for (const x of xs) { const n = pol.update(w, x, h); out.push(Array.from(n, (v, i) => (dead.has(i) ? 0 : v))); h = Float64Array.from(out[out.length - 1]); }
    return out;
}
// The clamp's margin: only a POSITIVE inputs + recurrent sum above 1e30 could light a clamped cell, so this is the largest positive sum any cell reaches along xs (the intact trajectory, each tick's sum taken with the biases at 0).
function margin(pol, w, xs) {
    const w0 = Float32Array.from(w); for (let i = 0; i < 148; i++) w0[T.OFF_B + i] = 0;
    let h = new Float64Array(148), worst = 0;
    for (const x of xs) { for (const v of pol.update(w0, x, h)) worst = Math.max(worst, v); h = pol.update(w, x, h); }
    return worst;
}
function lesionedRun(pol, w, xs) { let h = new Float64Array(148); const out = []; for (const x of xs) { h = pol.update(w, x, h); out.push(Array.from(h)); } return out; }
const maxDiff = (a, b) => { let m = 0; for (let t = 0; t < a.length; t++) for (let i = 0; i < 148; i++) m = Math.max(m, Math.abs(a[t][i] - b[t][i])); return m; };

sec("2. EXACT");
// features recorded from a real tank flight of the stateful fly through the compass dropout (the 15th is compassValid)
const recorded = [];
{
    const kind = FX.flyCxKind(circuit), q = A.createTank();
    q.registerPilotKind("flycx", { ...kind, build: (w, ctx) => { const p = kind.build(w, ctx); return (s, t, c, aux) => { recorded.push([...P.features(s, t, c), aux && aux.compassValid === 0 ? 0 : 1]); return p(s, t, c, aux); }; } });
    q.sync([{ id: "g", name: "g", hue: 1, from: "gate", local: true, theta: null, pilot: "stateful", circuit: "flycx", weights: file.weights }]); q.setEvent("g", "dropout");
    for (let i = 0; i < 1800; i++) q.step(1 / 30);
}
{
    const w = Float32Array.from(file.weights), r = P.mulberry(77), rand = Array.from({ length: 300 }, () => Array.from({ length: 15 }, (_, f) => (f === 14 ? (r() < 0.5 ? 0 : 1) : (r() - 0.5) * 4)));
    const sets = [L.classesOf(T, "glomerulus").classes.L4, L.classesOf(T).classes.PEG, L.classesOf(T).classes.Delta7, L.classesOf(T, "side").classes.EPG_R, [0, 47, 100, 147]];
    let worst = 0, zeroOk = true, cases = 0, moved = 0;
    for (const [pol, label] of [[POL, "memory"], [NOS, "no state"]]) for (const xs of [recorded.slice(0, 900), rand]) for (const s of sets) {
        const lw = Float32Array.from(L.lesionWeights(T, Array.from(w), s)), dead = new Set(s), a = lesionedRun(pol, lw, xs), b = masked(pol, w, xs, dead);
        worst = Math.max(worst, maxDiff(a, b)); cases++; zeroOk = zeroOk && a.every((h) => s.every((j) => h[j] === 0));
        const d = maxDiff(a, lesionedRun(pol, w, xs)), hiddenNoState = pol === NOS && s === sets[2];
        if (hiddenNoState ? d === 0 : d > 1e-6) moved++;
    }
    ok("!! the clamp IS silencing: 20 runs (two policies x recorded and random features x five sets incl. input, output and hidden cells) match the masked reference to 1e-9 over every cell and tick", worst < 1e-9 && cases === 20 && recorded.length >= 900, `worst ${worst.toExponential(2)}, ${recorded.length} recorded ticks`);
    ok("!! the silenced cells read exactly 0 on every tick of every run; every lesion moves off the intact run EXCEPT Delta7 without memory, which is exactly the intact run (hidden cells reached only by recurrence never fire with no state)", zeroOk && moved === 20, `${moved} of 20 moved`);
    const m = Math.max(margin(POL, w, recorded), margin(POL, w, rand));
    ok("!! the margin: no cell's positive inputs + recurrent sum exceeds 1e3 on the recorded flight or the random features, against a clamp of 1e30", m < 1e3 && m > 0, `largest ${m.toFixed(3)}`);
    ok("!! LESION_BIAS is -1e30, and the clamp writes only the silenced cells' biases (every other weight equal)", L.LESION_BIAS === -1e30 && (() => { const o = L.lesionWeights(T, Array.from(w), [5, 90]); return o.every((v, i) => (i === T.OFF_B + 5 || i === T.OFF_B + 90 ? v === -1e30 : v === w[i])) && Math.fround(-1e30) < -9.99e29; })());
    ok("!! refused: a wrong weight count and a cell outside 148", /takes 1729 weights, got 963/.test(thr(() => L.lesionWeights(T, new Array(963).fill(0), [0]))) && /neuron 148 is not one of the circuit's 148/.test(thr(() => L.lesionWeights(T, Array.from(w), [148]))));
}

sec("3. INERT");
{
    ok("!! the trained file has no inert cell (every cell is reached from an input cell through the wiring)", L.inertOf(T, file.weights).length === 0);
    const z = new Array(1729).fill(0); z[T.SIGMA_INDEX] = 0.95;
    ok("!! zero input rows and zero biases: all 148 cells are inert", L.inertOf(T, z).length === 148);
    const reach = (seed) => { const live = new Set([seed]); for (let ch = true; ch;) { ch = false; for (const [to, from] of T.EDGES) if (live.has(from) && !live.has(to)) { live.add(to); ch = true; } } return live; };
    const hid = T.STRATA[3][0], z1 = [...z]; z1[T.OFF_B + hid] = 0.1;
    ok("!! a bias > 0 on one Delta7 lights it and, with sigma > 0, exactly the cells reachable from it", J(L.inertOf(T, z1)) === J(Array.from({ length: 148 }, (_, i) => i).filter((i) => !reach(hid).has(i))));
    const z2 = [...z1]; z2[T.SIGMA_INDEX] = 0;
    ok("!! with sigma 0 the same bias lights that cell alone", L.inertOf(T, z2).length === 147 && !L.inertOf(T, z2).includes(hid));
    const ai = T.INPUTS.findIndex((c, k) => c !== k), z3 = [...z]; z3[T.SIGMA_INDEX] = 0; z3[ai * 15 + 2] = -0.3;   // an input slot whose cell is not its own index, so a rule that lights the slot number instead of the cell is seen
    const z4 = [...z]; z4[T.SIGMA_INDEX] = 0; z4[T.OFF_B + 7] = -0.4;
    ok("!! an input cell's non-zero input row (either sign) lights it; a negative bias does not", ai > 0 && !L.inertOf(T, z3).includes(T.INPUTS[ai]) && L.inertOf(T, z3).length === 147 && L.inertOf(T, z4).includes(7));
    // The real circuit is strongly connected (every cell reaches every other), so direction cannot be seen on it: a three-cell chain a -> b -> c can.
    const nrn = (i) => ({ id: i, cls: "X", nt: "Exc", layer: 0, side: "L", instance: `X_L${i + 1}` }), chain = F.reservoirTopology({ neurons: [nrn(0), nrn(1), nrn(2)], edges: [[0, 1, 3, 1], [1, 2, 2, 1]], io: { inputs: [0], outputs: [2] } });
    const zc = new Array(chain.WEIGHT_COUNT).fill(0); zc[chain.SIGMA_INDEX] = 0.9; zc[chain.OFF_B + 1] = 0.2;
    ok("!! liveness runs along the edges' direction: in a -> b -> c a bias on b lights b and c, not a", J(L.inertOf(chain, zc)) === "[0]", J(L.inertOf(chain, zc)));
    const late = F.reservoirTopology({ neurons: [nrn(0), nrn(1), nrn(2)], edges: [[1, 2, 2, 1], [0, 1, 3, 1]], io: { inputs: [0], outputs: [2] } }), zl = new Array(late.WEIGHT_COUNT).fill(0); zl[late.SIGMA_INDEX] = 0.9; zl[late.OFF_B + 0] = 0.2;
    ok("!! liveness is a fixed point, not one pass: with b -> c listed before a -> b, a bias on a still lights c", L.inertOf(late, zl).length === 0, J(L.inertOf(late, zl)));
}

sec("4. RANDOM");
{
    const c = L.classesOf(T, "glomerulus").classes.L4, roleCount = (s) => J(T.STRATA.map((g) => g.filter((i) => s.includes(i)).length)), sets = L.randomSets(T, c, { count: 8, seed: 3 });
    ok("!! matched on role: eight sets of L4's size, each with L4's count in every role, none equal to L4", sets.every((s) => s.length === c.length && roleCount(s) === roleCount(c) && s.join() !== c.join()) && new Set(sets.map((s) => s.join())).size === 8, roleCount(c));
    ok("!! a side class is matched within its role: PEN_b_L's draws are all input-only cells", L.randomSets(T, L.classesOf(T, "side").classes.PEN_b_L, { count: 5 }).every((s) => s.every((i) => T.STRATA[0].includes(i))));
    ok("!! a whole type is refused matched, saying why, and drawn unmatched across roles", /fewer than 2 distinct matched sets of 18 .*a class that fills its strata has none: draw it unmatched/.test(thr(() => L.randomSets(T, L.classesOf(T).classes.PEG, { count: 2 }))) && L.randomSets(T, L.classesOf(T).classes.PEG, { count: 6, matched: false }).some((s) => s.some((i) => !T.STRATA[1].includes(i))));
}

sec("5. ARMS");
{
    const [sf, sl] = F.flyCxArms({ circuit, file }), regs = [], tank = { registerPilotKind: (c, k) => regs.push([c, k.persist, k.weightCount]) };
    sf.register(tank); sl.register(tank);
    ok("!! two flying arms, flycx-stateful and flycx-stateless, held to the autopilot, carrying the topology; the kind is registered as flycx with memory on and off", sf.id === "flycx-stateful" && sl.id === "flycx-stateless" && sf.layer === "flying" && J(sf.controls) === '["autopilot"]' && sf.topo.KIND === "reservoir" && J(regs) === J([["flycx", true, 1729], ["flycx", false, 1729]]));
    ok("!! entry() flies the file's weights as a stateful pilot on circuit flycx (a fresh array each call)", (() => { const e = sf.entry("x"), e2 = sf.entry("y"); return e.pilot === "stateful" && e.circuit === "flycx" && J(e.weights) === J(file.weights) && e.weights !== e2.weights; })());
    ok("!! topologyOf finds the arm's own topology; lesionArms on it gives role-matched arms that fly the clamped weights", L.topologyOf(sf) === sf.topo && (() => { const a = L.lesionArms({ base: sf, topo: sf.topo, className: "L4", by: "glomerulus", draws: 2 }); return a.length === 3 && a[0].entry("x").weights[T.OFF_B + a[0].lesion.neurons[0]] === -1e30 && a[0].register === sf.register; })());
    ok("!! checkFile refuses a wrong format, policy, circuit, count and a non-finite weight", /format must be/.test(thr(() => F.flyCxArms({ circuit, file: { ...file, format: "x" } }))) && /policy must be/.test(thr(() => F.flyCxArms({ circuit, file: { ...file, policy: "x" } }))) && /circuit must be flycx/.test(thr(() => F.flyCxArms({ circuit, file: { ...file, circuit: "gfc" } }))) && /takes 1729 weights/.test(thr(() => F.flyCxArms({ circuit, file: { ...file, weights: file.weights.slice(1) } }))) && /not a finite number/.test(thr(() => F.flyCxArms({ circuit, file: { ...file, weights: file.weights.map((v, i) => (i === 9 ? NaN : v)) } }))));
}

sec("6. REAL (the switchboard's dropout task)");
{
    const [sf] = F.flyCxArms({ circuit, file }), board = B.createBoard().addTask(B.dropoutTask).addArm(sf), w = file.weights;
    const all = L.lesionWeights(T, w, Array.from({ length: 148 }, (_, i) => i)), noOut = w.map((v, i) => (i >= T.SIGMA_INDEX + 1 && i < T.SIGMA_INDEX + 1 + 4 * 64 ? 0 : v));
    const arm = (id, weights) => board.addArm({ id, layer: "flying", controls: [sf.id], entry: () => ({ ...sf.entry(), weights }), register: sf.register });
    arm("all", all); arm("noOut", noOut); arm("none", L.lesionWeights(T, w, [])); arm("L4", L.lesionWeights(T, w, L.classesOf(T, "glomerulus").classes.L4));
    const res = board.run("dropout", [sf.id, "all", "noOut", "none", "L4"], { from: 0, to: 1 }, { seconds: 40 });
    ok("!! silencing all 148 cells flies exactly the pilot with a zero readout (both leave the autopilot plus the readout bias), seed for seed", J(res.runs.all) === J(res.runs.noOut), J(res.runs.all.map((r) => r.score.toFixed(4))));
    ok("!! silencing nothing flies the intact pilot exactly; silencing L4 moves the score", J(res.runs.none) === J(res.runs[sf.id]) && res.runs.L4.some((r, i) => Math.abs(r.score - res.runs[sf.id][i].score) > 1e-6));
}

sec("7. SOURCE");
{
    ok("!! no clock, no Math.random, no file or DOM in lesionFlyCx.mjs", !/Date\.now|new Date|performance\.now|Math\.random|node:fs|readFile|document\.|window\./.test(code));
    ok("!! its header says a type is one role here, so a whole type has no matched control", /each TYPE is exactly one role/.test(head) && /refuses it as matched/.test(head));
    const ls = fs.readFileSync(LESION_URL, "utf8");
    ok("!! lesion.mjs's header explains the bias clamp and why edges are not cut", /BIAS CLAMP/.test(ls) && /cutting edges would rescale every other cell/.test(ls));
}

finished = true;
console.log(`\n${fails ? "FAIL" : "PASS"}  lesionFlyCx-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
if (fails) process.exitCode = 1;
