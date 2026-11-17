// WebGLEngine/brain/lesion.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/lesion-selfcheck.mjs; the page is switchboard.html; the command is tools/ship/takeSwitchboard.mjs --lesion)
//
// THE LESION TOGGLE (brain/BACKLOG_2026-11-04_BRAINS.md, `lesion-toggle`; tools/ship/nextRounds.mjs has no entry of its own): silence a NAMED CLASS of a circuit pilot's neurons and fly it beside the same pilot with a RANDOM set of
// the same size silenced, on the same seeds of a switchboard task. The question it can answer is the wiring-versus-shuffle question in picture form: does losing THIS class cost more than losing as many neurons picked at random?
//   SILENCING IS EXACT AND IS A WEIGHT EDIT. brain/pilotSubPolicy.mjs's createSubPolicy forward() starts each hidden neuron at relu(W1 row . x + b1), then REC_STEPS times adds its own previous value (the identity) and the incoming
//   edges, then relu. Zero a neuron's W1 row, its bias and every recurrent edge INTO it, and it is 0 after the input layer and stays 0 through every step, whatever its outgoing weights are: the neuron is silent, exactly. The lesioned
//   pilot is an ordinary weight vector of the same length, so the tank (render/subAquariumSim.mjs) flies it through the same kind with no change and nothing in this file touches a shared file.
//   THE CONFOUND THIS FILE IS BUILT AROUND, said first: the trainers start from handWeights(), which write the autopilot's four laws through neurons 0 .. 2*OUTPUTS-1 (a relu pair per output). In the fly's Giant Fiber Circuit those
//   eight neurons are ALL GFC2 (GFC2 is neurons 0-9), so "lesion GFC2" removes the autopilot's own channels, and a large cost would say where the trainer started, not what the fly's GFC2 cells do. The random control is therefore
//   MATCHED by default: it silences the same number of hand-channel neurons as the class does (drawn from the hand channels) and the rest from the other neurons. `matched: false` gives the unmatched draw, named as such.
//   THE READING (lesionReading): per lesion its COST (intact score minus lesioned score, paired on the same scenarios), and the class's cost ranked among the random draws' costs: p = (1 + draws costing at least as much) / (1 + draws).
//   With R draws the smallest p is 1/(R+1): four draws can never read below 0.2, and the line says so. A class lesion that costs no more than its random sets has shown nothing about the class; one that costs more has shown it on
//   THOSE seeds and THOSE draws.
//   INERT NEURONS: a neuron with a zero input row, a bias <= 0 and no incoming edge from a neuron that can fire can never fire, and silencing it changes nothing. inertOf counts them, and the reading names how many of a lesion's
//   neurons were already inert, so a TIE that is a lesion of dead cells reads as that.
//   THE STATEFUL FLY (a RESERVOIR: brain/pilotSubCircuitState.mjs, the 1,729-weight heading-loop pilot; its topology is built by brain/lesionFlyCx.mjs and has KIND "reservoir"). Its 7,080 recurrent weights are NOT in the weight
//   vector (fixed, the signed count matrix scaled to a largest singular value of 1 over the WHOLE circuit), so cutting edges would rescale every other cell. Silencing is instead a BIAS CLAMP: the cell's bias is set to
//   LESION_BIAS (-1e30), and since its activity is relu(bias + inputs + recurrent), it is 0 on every tick while |inputs + recurrent| stays below 1e30 (brain/lesionFlyCx-selfcheck.mjs measures the margin on real flights).
//   Its random control is MATCHED ON ROLE (input cell, output cell, both, neither: the topology's STRATA) instead of on hand channels; the reservoir's autopilot laws sit outside the network, so it has no hand channels.
//   In this circuit a cell TYPE is exactly one role, so a whole type has no matched random set (the only matched set is the type itself) and is refused as matched: lesion it unmatched, or by type and side, or by glomerulus.
// Pure: no clock, no Math.random, no file, no DOM (the caller reads weight files and hands them in).
"use strict";
import { FEATURES, OUTPUTS, mulberry } from "./pilotSubPolicy.mjs";
import * as GFC from "./gfcTopology.mjs";
import * as ZF from "./zebrafishTopology.mjs";

/** The circuits a tank entry can name whose neurons have classes: the fly's Giant Fiber Circuit (the 963-weight networks) and the zebrafish TEN core (the 803-weight fish pilot). */
export const TOPOLOGIES = Object.freeze({ gfc: GFC, fish: ZF });
/** The bias a silenced reservoir cell is given: its activity relu(bias + inputs + recurrent) is then 0 while the rest stays below 1e30 (float32 holds it exactly enough: about -1.0000000150e30). */
export const LESION_BIAS = -1e30;
/** The topology an arm flies: the arm's own `topo` (a reservoir arm carries one, brain/lesionFlyCx.mjs) or the one its entry's circuit names in TOPOLOGIES; null when the arm has no entry, flies no weights (the autopilot), flies
 *  a circuit without classes here, or its weight count is not the topology's. */
export function topologyOf(arm) {
    if (!arm || typeof arm.entry !== "function") return null;
    const e = arm.entry("probe"), t = arm.topo || (e && TOPOLOGIES[e.circuit]);
    return t && e && Array.isArray(e.weights) && e.weights.length === dims(t).WEIGHT_COUNT ? t : null;
}

/** The neurons that carry the hand weights' laws: 0 .. 2*OUTPUTS-1 (handWeights' relu pair per output). */
export const HAND_CHANNELS = Object.freeze(Array.from({ length: 2 * OUTPUTS }, (_, i) => i));

/** The ways a topology's neurons can be grouped: its LABELS' keys (a reservoir: type, side, glomerulus), else type and instance. */
export const groupingsOf = (topo) => (topo && topo.LABELS ? Object.keys(topo.LABELS) : ["type", "instance"]);
/** The named classes of a topology: { by, classes: { name: [indices ascending] } }. A createSubPolicy topology groups by NEURON_TYPES ("type", default) or NEURON_INSTANCES ("instance"); a reservoir by its LABELS. A topology without the labels is refused. */
export function classesOf(topo, by = "type") {
    if (topo && topo.LABELS) {
        const lab = Object.prototype.hasOwnProperty.call(topo.LABELS, by) ? topo.LABELS[by] : null;
        if (!lab) throw new Error(`lesion.classesOf: by must be one of ${Object.keys(topo.LABELS).join(", ")} for this circuit, got ${JSON.stringify(by)}`);
        if (lab.length !== topo.NEURON_ORDER.length) throw new Error(`lesion.classesOf: the ${by} labels are not of its neurons' length`);
        const classes = {}; lab.forEach((l, i) => { (classes[l] ??= []).push(i); }); return { by, classes };
    }
    const labels = by === "type" ? topo && topo.NEURON_TYPES : by === "instance" ? topo && topo.NEURON_INSTANCES : null;
    if (by !== "type" && by !== "instance") throw new Error(`lesion.classesOf: by must be "type" or "instance", got ${JSON.stringify(by)}`);
    if (!labels || !topo.NEURON_ORDER || labels.length !== topo.NEURON_ORDER.length) throw new Error(`lesion.classesOf: the topology has no ${by === "type" ? "NEURON_TYPES" : "NEURON_INSTANCES"} of its neurons' length`);
    const classes = {};
    labels.forEach((l, i) => { (classes[l] ??= []).push(i); });
    return { by, classes };
}

function dims(topo) {
    if (!topo || !topo.NEURON_ORDER || !topo.EDGES) throw new Error("lesion: a topology is { NEURON_ORDER, EDGES }");
    if (topo.KIND === "reservoir") return { HIDDEN: topo.NEURON_ORDER.length, REC_EDGES: topo.EDGES.length, OFF_B: topo.OFF_B, SIGMA: topo.SIGMA_INDEX, WEIGHT_COUNT: topo.WEIGHT_COUNT, reservoir: true };
    const HIDDEN = topo.NEURON_ORDER.length, REC_EDGES = topo.EDGES.length;
    return { HIDDEN, REC_EDGES, REC: FEATURES * HIDDEN + HIDDEN, WEIGHT_COUNT: FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS };
}
function checkIdx(idx, HIDDEN) {
    if (!Array.isArray(idx)) throw new Error("lesion: the neurons to silence are a list of indices");
    for (const j of idx) if (!(Number.isInteger(j) && j >= 0 && j < HIDDEN)) throw new Error(`lesion: neuron ${JSON.stringify(j)} is not one of the circuit's ${HIDDEN}`);
    if (new Set(idx).size !== idx.length) throw new Error("lesion: a neuron is named twice");
}

/** A copy of weights `w` of a createSubPolicy pilot on `topo` with the neurons `idx` silenced exactly: their input rows, biases and every recurrent edge into them set to 0 (outgoing weights are left; a silent neuron sends nothing). */
export function lesionWeights(topo, w, idx) {
    const { HIDDEN, REC, WEIGHT_COUNT } = dims(topo);
    if (!w || w.length !== WEIGHT_COUNT) throw new Error(`lesion.lesionWeights: the circuit takes ${WEIGHT_COUNT} weights, got ${w ? w.length : "none"}`);
    checkIdx(idx, HIDDEN);
    if (topo.KIND === "reservoir") { const o = Array.from(w); for (const j of idx) o[topo.OFF_B + j] = LESION_BIAS; return o; }
    const o = Array.from(w), dead = new Set(idx);
    for (const j of dead) { for (let f = 0; f < FEATURES; f++) o[j * FEATURES + f] = 0; o[FEATURES * HIDDEN + j] = 0; }
    topo.EDGES.forEach(([to], k) => { if (dead.has(to)) o[REC + k] = 0; });
    return o;
}

/** The neurons of weights `w` that can never fire (sorted): a zero input row, a bias <= 0, and no non-zero incoming edge from a neuron that can fire (iterated to a fixed point). */
export function inertOf(topo, w) {
    const { HIDDEN, REC, WEIGHT_COUNT } = dims(topo);
    if (!w || w.length !== WEIGHT_COUNT) throw new Error(`lesion.inertOf: the circuit takes ${WEIGHT_COUNT} weights, got ${w ? w.length : "none"}`);
    const live = new Array(HIDDEN).fill(false);
    if (topo.KIND === "reservoir") {   // live: a bias > 0, an input cell with a non-zero input row, or an edge from a live cell while sigma > 0 (the recurrent gains are fixed and non-zero). Computed WITH recurrence, so for the no-state kind it can call a cell live that is not.
        const sigma = w[topo.SIGMA_INDEX] > 0, F = topo.STATE_FEATURES;
        for (let j = 0; j < HIDDEN; j++) live[j] = w[topo.OFF_B + j] > 0;
        topo.INPUTS.forEach((cell, a) => { for (let f = 0; f < F && !live[cell]; f++) if (w[a * F + f] !== 0) live[cell] = true; });
        if (sigma) for (let changed = true; changed;) { changed = false; topo.EDGES.forEach(([to, from]) => { if (!live[to] && live[from]) { live[to] = true; changed = true; } }); }
        return live.map((l, j) => (l ? -1 : j)).filter((j) => j >= 0);
    }
    for (let j = 0; j < HIDDEN; j++) { let any = w[FEATURES * HIDDEN + j] > 0; for (let f = 0; f < FEATURES && !any; f++) any = w[j * FEATURES + f] !== 0; live[j] = any; }
    for (let changed = true; changed;) { changed = false; topo.EDGES.forEach(([to, from], k) => { if (!live[to] && live[from] && w[REC + k] !== 0) { live[to] = true; changed = true; } }); }
    return live.map((l, j) => (l ? -1 : j)).filter((j) => j >= 0);
}

/**
 * `count` random sets of neurons the size of `cls` (indices), each distinct from `cls` and from each other, drawn with mulberry(seed). MATCHED (default): each set holds as many neurons of each STRATUM as `cls` does (a reservoir's roles,
 * topo.STRATA; otherwise the hand channels and the rest). Throws when the circuit cannot supply `count` distinct sets (e.g. a class that is every neuron).
 */
export function randomSets(topo, cls, { count = 4, seed = 1, matched = true } = {}) {
    const { HIDDEN } = dims(topo); checkIdx(cls, HIDDEN);
    if (!Number.isInteger(count) || count < 1) throw new Error(`lesion.randomSets: count must be a positive integer, got ${JSON.stringify(count)}`);
    const rng = mulberry(seed >>> 0), all = Array.from({ length: HIDDEN }, (_, j) => j);
    const pick = (pool, k) => { const p = [...pool]; for (let i = p.length - 1; i > 0; i--) { const r = Math.floor(rng() * (i + 1)); [p[i], p[r]] = [p[r], p[i]]; } return p.slice(0, k); };
    // the strata a matched draw keeps the class's counts in: a reservoir's roles, else the hand channels and the rest
    const strata = topo.STRATA ? topo.STRATA.map((g) => [...g]) : (() => { const hand = new Set(HAND_CHANNELS.filter((j) => j < HIDDEN)); return [all.filter((j) => hand.has(j)), all.filter((j) => !hand.has(j))]; })();
    const inCls = new Set(cls), need = strata.map((g) => g.filter((j) => inCls.has(j)).length);
    const key = (s) => [...s].sort((a, b) => a - b).join(","), seen = new Set([key(cls)]), out = [];
    for (let tries = 0; out.length < count && tries < 200 * count; tries++) {
        const s = matched ? strata.flatMap((g, i) => pick(g, need[i])) : pick(all, cls.length);
        const k = key(s); if (seen.has(k)) continue; seen.add(k); out.push(s.sort((a, b) => a - b));
    }
    if (out.length < count) throw new Error(`lesion.randomSets: the circuit has fewer than ${count} distinct ${matched ? "matched " : ""}sets of ${cls.length} neurons other than the class${matched ? " (a matched set keeps the class's count in every stratum, so a class that fills its strata has none: draw it unmatched)" : ""}`);
    return out;
}

/**
 * The switchboard arms of one lesion study (brain/switchboard.mjs addArm shape): the class lesion and `draws` random lesions of the same size, each held to the intact arm `base` (an arm with entry(id) -> { weights, ... }).
 * Ids: `${base.id}~${className}` and `${base.id}~rand<k>-${className}`. Each arm carries `lesion: { of, cls, neurons, random, matched, inert }` for the reading. `register` is the base arm's (the same kind flies the lesioned weights).
 */
export function lesionArms({ base, topo, className, by = "type", draws = 4, seed = 1, matched = true } = {}) {
    if (!base || typeof base.id !== "string" || typeof base.entry !== "function") throw new Error("lesion.lesionArms: base is an arm with an id and an entry()");
    const { classes } = classesOf(topo, by), cls = classes[className];
    if (!cls) throw new Error(`lesion.lesionArms: ${JSON.stringify(className)} is not a ${by} of this circuit (${Object.keys(classes).join(", ")})`);
    const w0 = base.entry("probe").weights, inert = new Set(inertOf(topo, w0));
    const mk = (id, neurons, random) => Object.freeze({
        id, layer: base.layer, controls: Object.freeze([base.id]),
        note: `${base.id} with ${neurons.length} neuron${neurons.length === 1 ? "" : "s"} silenced (${random ? `a ${matched ? "matched " : ""}random set the size of ${className}` : `the ${by} ${className}`}: ${neurons.join(" ")}${neurons.some((j) => inert.has(j)) ? `; ${neurons.filter((j) => inert.has(j)).length} already inert` : ""})`,
        entry: (id2) => { const e = base.entry(id2); return { ...e, weights: lesionWeights(topo, e.weights, neurons) }; },
        ...(base.register ? { register: base.register } : {}),
        lesion: Object.freeze({ of: base.id, cls: className, by, neurons: Object.freeze([...neurons]), random, matched, inert: neurons.filter((j) => inert.has(j)).length }),
    });
    const sets = randomSets(topo, cls, { count: draws, seed, matched });
    return [mk(`${base.id}~${className}`, cls, false), ...sets.map((s, k) => mk(`${base.id}~rand${k + 1}-${className}`, s, true))];
}

const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
/**
 * The lesion reading of a board result `res` (board.run's shape) and the board's arms: for each class lesion flown with its intact arm, its cost (intact minus lesioned, mean over the paired scenarios), every random draw's cost,
 * the class's rank p = (1 + draws costing >= the class) / (1 + draws), and lines. A lesion whose intact arm was not flown is reported as such.
 */
export function lesionReading(board, res) {
    const ids = Object.keys(res.runs), studies = [], lines = [];
    const cost = (lid, of) => meanOf(res.runs[of].map((r, i) => r.score - res.runs[lid][i].score));
    for (const id of ids) {
        const a = board.arms.get(id), L = a && a.lesion; if (!L || L.random) continue;
        if (!res.runs[L.of]) { studies.push({ id, of: L.of, missing: true }); lines.push(`${id}: its intact arm ${L.of} was not flown, so no lesion reading`); continue; }
        const rand = ids.filter((r) => { const b = board.arms.get(r).lesion; return b && b.random && b.of === L.of && b.cls === L.cls && b.by === L.by; });
        const c = cost(id, L.of), rc = rand.map((r) => cost(r, L.of)), atLeast = rc.filter((x) => x >= c - 1e-12).length, p = (1 + atLeast) / (1 + rc.length);
        studies.push({ id, of: L.of, cls: L.cls, neurons: L.neurons.length, inert: L.inert, cost: c, randomCosts: rc, draws: rc.length, p, matched: rand.length ? board.arms.get(rand[0]).lesion.matched : null });
        const head = `lesion ${L.cls} of ${L.of} (${L.neurons.length} neuron${L.neurons.length === 1 ? "" : "s"}${L.inert ? `, ${L.inert} already inert` : ""}): costs ${sgn(c)}`;
        if (!rc.length) { lines.push(`${head}; no random lesion of its size was flown, so it is not compared with anything`); continue; }
        const word = atLeast === 0 ? "MORE THAN EVERY" : atLeast === rc.length ? "NO MORE THAN ANY" : `more than ${rc.length - atLeast} of the`;
        lines.push(`${head}, ${word} ${rc.length} ${studies[studies.length - 1].matched ? "matched " : ""}random set${rc.length === 1 ? "" : "s"} of its size (${rc.map(sgn).join(", ")}); rank p = ${p.toFixed(3)}, the smallest ${rc.length} draws can give is ${(1 / (rc.length + 1)).toFixed(3)}`);
    }
    return { studies, lines };
}
