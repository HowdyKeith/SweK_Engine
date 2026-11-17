// WebGLEngine/brain/flySteering.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S STEERING CIRCUIT WIRED AS THE FLY WIRES IT, AND A HELM THAT READS IT. Five searches in this tree trained a network over a fly circuit and not one kept a weight on a synapse: every feature could reach every neuron through a free encoder and every neuron every output through a free decoder, so a search
// never NEEDED the wiring, and what it found was the arena (throttle back; hold the trigger). Keith: wire the ship's heading and goal into the compass and goal cells the way the fly does. This file does, and takes the free parts away:
//
//   IN    a HEADING angle H goes to the 46 compass cells (EPG) as a bump, max(0, cos(H - phi)), phi each cell's own angle; a GOAL angle G goes to the 92 goal cells (FC2A, B, C) the same way at each cell's angle psi. Nothing else is driven.
//   CORE  the circuit of brain/cxInputsTopology.mjs with THE CONNECTOME'S OWN WEIGHTS: a connection's weight is its synapse count over all the synapses its target receives within the circuit, NEGATIVE where the source's predicted transmitter is glutamate or GABA (here: Delta7). No weight is learned. Three steps of
//         h <- max(0, h + W h - t), with the threshold t on the PFL2 and PFL3 cells only (THRESHOLD = 0.2).
//   OUT   D = DNa02 on the right less DNa02 on the left. One number.
//
// WHERE THE ANGLES COME FROM -- the cells' own names in the dataset, and two checks that the names carry what the literature says (the gate pins both):
//   phi   an EPG cell's protocerebral-bridge glomerulus, L8..L1 then R1..R8 along the bridge, 45 degrees a glomerulus. THE DELTA7 CELLS CONFIRM THE PERIOD: each is named for the glomeruli it joins (L8-R1, L7-R2, ... L1-R8), and the two are eight glomeruli apart -- one turn -- in eight of the twelve names and nine in the other four.
//   psi   an FC2 cell's fan-shaped-body column C1..C9, -45 degrees a column from -22.5. THE PFL CELLS FIX THAT LINE: each PFL3 is named for its glomerulus AND its column, and with this psi the left PFL3 cells sit 67.5 degrees to one side of their heading and the right ones 67.5 to the other -- the shift the fly literature
//         gives PFL3 -- while PFL2 sit at 157.5 (the literature's 180, a half-column off). One line fits both sides of both types; that is where its slope and intercept come from.
//
// WHAT IT COMPUTES, MEASURED (tuning(); pinned): over 48 headings and 24 errors G - H, the mean of D follows -sin(G - H) (correlation -1.000), amplitude 0.056; from heading to heading at one error D wanders with a standard deviation of 0.032 (the ring has 2-4 cells a glomerulus). WITH THE SAME CELLS AND THE SAME
// WEIGHTS BUT EACH PATHWAY'S TARGETS SHUFFLED within their type (`shuffled(seed)`: who is connected to how much stays, WHERE around the ring goes), the amplitude is 0.002 to 0.009. So the steering signal is in the fly's topography. With no threshold it is not there either (amplitude 0.001): the threshold is what turns
// two added bumps into a comparison.
//   *** THE THRESHOLD WAS CHOSEN ON THAT CURVE, by me, from seven values (0 to 0.7), before any fight: 0.2 is where the amplitude peaks. It is one number and it is not the fly's. The input bumps' shape (a rectified cosine), three steps, and the normalisation are choices too, said here and not searched. ***
//
// THE HELM (helmFor): a correction to the rule about the two axes that are not the nose, as brain/helmPolicy.mjs's. For each, the pointing error to the enemy about that axis is the angle G - H; H is an angle of the ship's own attitude in the world (so the bump moves round the ring as the ship turns; only G - H is the
// task); the circuit's D, over its amplitude, times a gain, through tanh, is the fraction of half the hull's torque limit added about that axis. TWO WEIGHTS: the two gains. The thrust and the roll are the rule's. Zero gains are the rule to the bit. wiringOf(name): "fly", "shuffled:<seed>", or "sine" -- no circuit, D
// = -AMPLITUDE sin(G - H), what an ideal comparator would hand the same helm.
//
// WHAT A SHIP MAKES OF IT (tools/ship/takeFlyWiredHelm.mjs; both studies registered before their pairs, each read once on 600): STUDY 1, the helm on `fly` as described above: it TRAILS the rule by 1.275 -- as its shuffled twin does (-1.305) -- while the sine helm LEADS by 1.069. STUDY 2, a second attempt, the helm on
// `fly2~odd` (below): it LEADS the rule by 1.019 (z 27), THE SHUFFLED CIRCUIT'S HELM LEADS BY NOTHING (+0.006), so the fly's wiring is worth 1.013 (z 22), and it cannot be told from the sine helm (-0.039). That is the first result in this tree in which a fly's wiring, and not a free weight beside it, does the work.
// What made the difference between the studies was not the circuit but how it is read: exactly nothing must be added when the ship is on its goal.
//
// WHAT IS NOT HERE: anything learned inside the circuit; dynamics (no time constants: three steps from rest each tick); the other 0.03 of each cell's inputs from outside these 220 neurons; a ring attractor (the bump is put where H says); DNa03's read-out; any claim that a fly steers a starship.
"use strict";
import * as CX from "./cxInputsTopology.mjs";
import * as SY from "./cxInputsSynapses.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";

export const POLICY_ID = "helmFlyWired", THRESHOLD = 0.2, STEPS = 3, AMPLITUDE = 0.056, CONTROL_SEED = 4242, TORQUE_FRACTION = 0.5;
export const FEATURES = 2, HIDDEN = CX.NEURON_ORDER.length, OUTPUTS = 2, WEIGHT_COUNT = 2;   // peerBrain's description of a brain: two angles in, 220 neurons, two torques out, two weights (the gains)
const RAD = Math.PI / 180, N = HIDDEN, TYPES = CX.NEURON_TYPES;
/** An EPG cell's angle from its instance name ("EPG(PB08)_L3"): its place along the bridge, L8..L1 then R1..R8, 45 degrees a glomerulus. Radians. */
export function epgAngle(instance) { const m = /_([LR])([1-8])$/.exec(instance); if (!m) throw new Error(`flySteering.epgAngle: no bridge glomerulus in "${instance}"`); return 45 * (m[1] === "L" ? 8 - Number(m[2]) : 7 + Number(m[2])) * RAD; }
/** An FC2 or PFL cell's fan-shaped-body column angle from its instance name ("FC2B_C4_L", "PFL3(PB12c)_L2_C4"): -45 degrees a column from -22.5. Radians. */
export function columnAngle(instance) { const m = /_C([1-9])(_|$)/.exec(instance); if (!m) throw new Error(`flySteering.columnAngle: no column in "${instance}"`); return (-45 * (Number(m[1]) - 1) - 22.5) * RAD; }
/** A PFL cell's bridge angle from its instance name ("PFL3(PB12c)_L2_C4"): the same line as an EPG cell's. */
export function bridgeAngle(instance) { const m = /_([LR])([1-9])_C/.exec(instance); if (!m) throw new Error(`flySteering.bridgeAngle: no bridge glomerulus in "${instance}"`); return 45 * (m[1] === "L" ? 8 - Number(m[2]) : 7 + Number(m[2])) * RAD; }
export const signOf = (nt) => (nt === "acetylcholine" ? 1 : -1);   // glutamate and GABA are taken as inhibitory (in the fly's brain glutamate commonly is); a PREDICTED transmitter, not a measured one

const EPG = [], FC2 = [], PFL = [], PHI = new Float64Array(N), PSI = new Float64Array(N);
TYPES.forEach((t, i) => { if (t === "EPG") { EPG.push(i); PHI[i] = epgAngle(CX.NEURON_INSTANCES[i]); } else if (t.startsWith("FC2")) { FC2.push(i); PSI[i] = columnAngle(CX.NEURON_INSTANCES[i]); } else if (t === "PFL2" || t === "PFL3") PFL.push(i); });
const DNA02_L = TYPES.findIndex((t, i) => t === "DNa02" && SY.NEURON_SOMA[i] === "L"), DNA02_R = TYPES.findIndex((t, i) => t === "DNa02" && SY.NEURON_SOMA[i] === "R");
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** The circuit as rows of (source, weight): the connectome's counts over each target's total, signed by the source's transmitter. `retarget(sourceType, to)` moves a connection's target (the shuffled control); null leaves the fly's. */
function matrixOf(retarget = null) {
    const rows = Array.from({ length: N }, () => new Map()), total = new Float64Array(N);
    CX.EDGES.forEach(([to0, from], k) => { const to = retarget ? retarget(TYPES[from], to0) : to0, c = SY.EDGE_COUNTS[k]; rows[to].set(from, (rows[to].get(from) || 0) + signOf(SY.NEURON_NT[from]) * c); total[to] += c; });
    const start = new Int32Array(N + 1), src = [], val = [];
    for (let i = 0; i < N; i++) { start[i] = src.length; for (const [j, v] of [...rows[i]].sort((a, b) => a[0] - b[0])) { src.push(j); val.push(v / total[i]); } }
    start[N] = src.length;
    return { start, src: Int32Array.from(src), val: Float64Array.from(val) };
}
/** A steering circuit over a matrix: steer(H, G) -> D, and cells(H, G) -> the 220 activities after the three steps (for a picture or a gate). */
function circuitOf(M, { threshold = THRESHOLD, perPlace = false } = {}) {
    const bias = new Float64Array(N); for (const i of PFL) bias[i] = -threshold;
    const share = new Float64Array(N).fill(1); if (perPlace) { const count = new Map(), place = (i) => (TYPES[i] === "EPG" ? "E" + PHI[i] : "F" + PSI[i]); for (const i of [...EPG, ...FC2]) count.set(place(i), (count.get(place(i)) || 0) + 1); for (const i of [...EPG, ...FC2]) share[i] = 1 / count.get(place(i)); }   // `perPlace`: a glomerulus's or a column's bump is shared among the cells there (2-4 compass cells a glomerulus, 9-11 goal cells a column), so every PLACE carries the same total
    function cells(H, G) {
        let h = new Float64Array(N);
        for (const i of EPG) { const c = Math.cos(H - PHI[i]); h[i] = c > 0 ? c * share[i] : 0; }
        for (const i of FC2) { const c = Math.cos(G - PSI[i]); h[i] = c > 0 ? c * share[i] : 0; }
        for (let s = 0; s < STEPS; s++) { const y = new Float64Array(N); for (let i = 0; i < N; i++) { let a = h[i] + bias[i]; for (let t = M.start[i], e = M.start[i + 1]; t < e; t++) a += M.val[t] * h[M.src[t]]; y[i] = a > 0 ? a : 0; } h = y; }
        return h;
    }
    return { cells, steer: (H, G) => { const h = cells(H, G); return h[DNA02_R] - h[DNA02_L]; } };
}
/** The target shuffle for a seed: for each pathway (source type -> target type) one random permutation of the target type's cells. Counts, signs and who-talks-to-which-type stay; where around the ring a connection lands does not. */
function retargetOf(seed) {
    const rng = mulberry(seed), byType = {}, maps = new Map(); TYPES.forEach((t, i) => (byType[t] ||= []).push(i));
    return (sourceType, to) => { const key = sourceType + ">" + TYPES[to]; if (!maps.has(key)) { const cells = byType[TYPES[to]], p = cells.slice(); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } maps.set(key, new Map(cells.map((v, k) => [v, p[k]]))); } return maps.get(key).get(to); };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** The helm library over a steering function steer(H, G) -> D: brain/helmPolicy.mjs's contract (helmFor, helmFactory, zeroWeights, WEIGHT_COUNT) with two weights. */
function libraryOf(name, steer, cells = null, amplitude = AMPLITUDE) {
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    function helmFor(w) {
        function helm(rule, ctx) {
            if (!ctx.foe) { helm.last = null; return rule; }
            if (w[0] === 0 && w[1] === 0) { helm.last = { H: [0, 0], G: [0, 0], D: [0, 0] }; return rule; }   // the zero gains are the rule: nothing is added, not even a zero
            const g = P6.geometry(ctx.body, { pos: ctx.foe.body.pos, vel: ctx.foe.body.vel }, { thrustForce: 0, standoff: 1e9 }), f = RB.rotateByQuat(ctx.body.q, [1, 0, 0]), u = RB.rotateByQuat(ctx.body.q, [0, 0, 1]);
            const H = [Math.atan2(u[1], u[0]), Math.atan2(f[1], f[0])], e = [g.eBody[1], g.eBody[2]], G = [wrap(H[0] + e[0]), wrap(H[1] + e[1])], D = [steer(H[0], G[0]), steer(H[1], G[1])], lim = ctx.ship.maxAlpha, torque = rule.torque.slice();
            for (let a = 0; a < 2; a++) torque[a + 1] += TORQUE_FRACTION * lim * ctx.body.I[a + 1] * Math.tanh(w[a] * D[a] / amplitude);
            helm.last = { H, G, D };
            return { torque, thrust: rule.thrust };
        }
        helm.last = null;
        return helm;
    }
    return Object.freeze({ name, amplitude, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT, TORQUE_FRACTION, steer, cells, zeroWeights, handWeights: zeroWeights, helmFor, helmFactory: (w) => () => helmFor(w) });
}
const FLY_CIRCUIT = circuitOf(matrixOf()), FLY = libraryOf("fly", FLY_CIRCUIT.steer, FLY_CIRCUIT.cells), SINE = libraryOf("sine", (H, G) => -AMPLITUDE * Math.sin(G - H)), SHUFFLED = new Map();
// THE SECOND VARIANT (`fly2`, `shuffled2:<seed>`), MADE AFTER THE FIRST STUDY WAS READ (tools/ship/takeFlyWiredHelm.mjs: the helm on `fly` TRAILS the rule by 1.3 while the sine helm LEADS it by 1.1 -- the mean signal is right and the wander from heading to heading ruins it). Here a glomerulus's or a column's bump is
// SHARED among the cells there, so every place carries the same total whatever its number of cells; the threshold is 0.05 (again chosen on the tuning curve, from 0.03, 0.05, 0.1, 0.2: the best ratio of amplitude to wander). Measured: correlation -0.991, amplitude 0.0127, wander 0.0027 -- a ratio of 4.6 where the first
// variant has 1.8. Everything else is the first variant's. It is a second attempt and is said to be one wherever it is used.
export const THRESHOLD2 = 0.05, AMPLITUDE2 = 0.0127;
const FLY2_CIRCUIT = circuitOf(matrixOf(), { threshold: THRESHOLD2, perPlace: true }), FLY2 = libraryOf("fly2", FLY2_CIRCUIT.steer, FLY2_CIRCUIT.cells, AMPLITUDE2), SHUFFLED2 = new Map();
/** The library for a wiring NAME: "fly"; "shuffled:<seed>" (the same cells and weights, each pathway's targets shuffled within their type); "sine" (no circuit: an ideal comparator of the fly circuit's amplitude and sign). */
const ODD = new Map();
export function wiringOf(name = "fly") {
    // "<wiring>~odd": THE SAME CIRCUIT ASKED TWICE, the goal on either side of the heading by the same error, and half the difference taken -- D(H, H + e) less D(H, H - e), over two. Odd in the error by construction, so EXACTLY ZERO WHEN THE SHIP IS ON ITS GOAL, whatever the heading; what a wander that does not depend on
    // the error's sign contributes is gone, and the circuit still does the comparing. A helm-side read-out, not a claim about a fly.
    if (typeof name === "string" && name.endsWith("~odd")) { if (!ODD.has(name)) { const base = wiringOf(name.slice(0, -4)); ODD.set(name, libraryOf(name, (H, G) => (base.steer(H, G) - base.steer(H, 2 * H - G)) / 2, null, base.amplitude)); } return ODD.get(name); }
    if (name === "fly") return FLY;
    if (name === "sine") return SINE;
    if (name === "fly2") return FLY2;
    const m2 = /^shuffled2:(\d+)$/.exec(String(name));
    if (m2) { const seed = Number(m2[1]); if (!SHUFFLED2.has(seed)) { const c = circuitOf(matrixOf(retargetOf(seed)), { threshold: THRESHOLD2, perPlace: true }); SHUFFLED2.set(seed, libraryOf(`shuffled2:${seed}`, c.steer, c.cells, AMPLITUDE2)); } return SHUFFLED2.get(seed); }
    const m = /^shuffled:(\d+)$/.exec(String(name)); if (!m) throw new Error(`flySteering.wiringOf: a wiring is "fly", "sine", "shuffled:<seed>", "fly2" or "shuffled2:<seed>" (got ${name})`);
    const seed = Number(m[1]); if (!SHUFFLED.has(seed)) { const c = circuitOf(matrixOf(retargetOf(seed))); SHUFFLED.set(seed, libraryOf(`shuffled:${seed}`, c.steer, c.cells)); }
    return SHUFFLED.get(seed);
}
/** THE SECOND HELM, as a policy of its own (`helmFlyWired2`): the second variant read the odd way (`fly2~odd`). A brain file for it is two gains, as the first's. */
export const POLICY_ID2 = "helmFlyWired2", second = wiringOf("fly2~odd");
/** Has this ship a cannon? battleshipDuel takes a side's cannon away by giving its hull a cannon that never finishes charging (waveGun.charge Infinity); the arena is not edited. */
export const hasCannon = (ship) => !!(ship && ship.waveGun && Number.isFinite(ship.waveGun.charge));
/**
 * THE THIRD HELM (`helmFlyWired3`): THE SECOND HELM THAT KNOWS WHICH FIGHT IT IS IN. tools/ship/takeFlyWiredNext.mjs's `together` read the second helm LEADING the rule by 0.945 with the cannon and TRAILING it by 0.692 without. Four weights: the two gains with a cannon (w[0], w[1]) and the two without (w[2], w[3]); each tick
 * the helm asks hasCannon(ctx.ship) and answers as the second helm at that pair of gains. With a cannon it IS the second helm at w[0..1] to the bit, without one at w[2..3] (the gate flies both); zero gains are the rule. tools/ship/takeFlyWiredHelmFix.mjs chose the gains without a cannon.
 */
export const POLICY_ID3 = "helmFlyWired3";
export const third = (() => {
    const zeroWeights = () => new Float32Array(4);
    function helmFor(w) {
        const withC = second.helmFor(Float32Array.from([w[0], w[1]])), without = second.helmFor(Float32Array.from([w[2], w[3]]));
        function helm(rule, ctx) { const h = hasCannon(ctx.ship) ? withC : without, out = h(rule, ctx); helm.last = h.last; helm.cannon = h === withC; return out; }
        helm.last = null; helm.cannon = null;
        return helm;
    }
    return Object.freeze({ name: "fly2~odd, cannon-aware", amplitude: second.amplitude, FEATURES, HIDDEN, OUTPUTS: 4, WEIGHT_COUNT: 4, TORQUE_FRACTION, steer: second.steer, zeroWeights, handWeights: zeroWeights, helmFor, helmFactory: (w) => () => helmFor(w) });
})();
/** The circuit with another threshold (for the gate's and the header's claim about what the threshold does). */
export const withThreshold = (threshold) => circuitOf(matrixOf(), { threshold });
export const steer = FLY.steer, cells = FLY.cells, zeroWeights = FLY.zeroWeights, handWeights = FLY.handWeights, helmFor = FLY.helmFor, helmFactory = FLY.helmFactory, topology = CX;
export const INPUT_CELLS = Object.freeze({ EPG: Object.freeze(EPG.slice()), FC2: Object.freeze(FC2.slice()), PFL: Object.freeze(PFL.slice()), DNa02: Object.freeze([DNA02_L, DNA02_R]) });

/**
 * What a steering function computes: over `headings` evenly spaced headings and `errors` evenly spaced errors e = G - H in [-180, 180), the mean of D at each error and how D wanders across headings.
 * -> { corr (of the mean curve with sin e), amplitude (half its range), noise (the mean over errors of D's standard deviation across headings), offset (the curve's mean), curve }.
 */
export function tuning(steerFn = steer, { headings = 48, errors = 24 } = {}) {
    const es = [], mean = [], sd = [];
    for (let k = 0; k < errors; k++) { const e = -Math.PI + 2 * Math.PI * k / errors, v = []; for (let j = 0; j < headings; j++) { const H = 2 * Math.PI * j / headings; v.push(steerFn(H, H + e)); } const m = v.reduce((a, b) => a + b, 0) / v.length; es.push(e); mean.push(m); sd.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)); }
    const s = es.map(Math.sin), mo = mean.reduce((a, b) => a + b, 0) / mean.length, den = Math.sqrt(mean.reduce((a, v) => a + (v - mo) ** 2, 0) * s.reduce((a, v) => a + v * v, 0));
    return { corr: den > 0 ? mean.reduce((a, v, i) => a + (v - mo) * s[i], 0) / den : 0, amplitude: (Math.max(...mean) - Math.min(...mean)) / 2, noise: sd.reduce((a, b) => a + b, 0) / sd.length, offset: mo, curve: mean };
}

export function reportLines() {
    const t = tuning(), c = [1, 2, 3].map((s) => tuning(wiringOf(`shuffled:${s}`).steer).amplitude);
    return ["[flySteering] the fly's steering circuit wired as the fly wires it: a heading bump into the 46 compass cells, a goal bump into the 92 goal cells, the connectome's own signed weights, DNa02 right less left out",
        `  ${N} neurons, ${CX.EDGES.length} connections, no learned weight inside; D follows -sin(goal - heading): correlation ${t.corr.toFixed(3)}, amplitude ${t.amplitude.toFixed(3)}, wandering ${t.noise.toFixed(3)} from heading to heading; with each pathway's targets shuffled the amplitude is ${c.map((v) => v.toFixed(3)).join(", ")}; the helm on it has two weights (two gains)`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
