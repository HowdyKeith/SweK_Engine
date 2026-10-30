// WebGLEngine/tools/ship/trainSubVestibular.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainSubVestibularCmd.mjs; the gate is tools/ship/trainSubVestibular-selfcheck.mjs)
//
// RUNG 4b: THE TRAINER AND THE VERDICTS, AS REGISTERED IN brain/FISH_VESTIBULAR_HELPER_WIP.md (Addenda 1, 2, 5 and 7, all written before any training). It trains the pilots of brain/pilotSubVestibular.mjs on the two tasks of tools/subVestibularTasks.mjs and grades each
// (task, arm) cell by rung 3's rule. It imports the arithmetic of tools/ship/trainSubCircuits.mjs and changes nothing in it.
//   TASKS      P  4b-P pitch-hold, ladder rung 1 (trim 1 kN m, kicks 0.1 rad/s), flown on the standard dives of brain/subTask.mjs        E  4b-E hazard escape, ladder rung 0 (flight time 8 s, reach 3 m), 10 nominal seeds x 2 sides x 2 launch times
//   ARMS       B (balance pathway), E (escape pathway), whole (all 47 cells). FOUR VERDICT CELLS: P/B, P/whole, E/E, E/whole. Two CROSS cells, P/E and E/B (the other pathway's circuit on the task), enter only the double-dissociation claim.
//   SPEC       task/arm/family: `cx` (the real wiring), `nostate` (the real wiring, lambda fixed at 0), and `er:K`, `class:K`, `degree:K` (the verdict controls), `count:K`, `tuning:K` (reported). e.g. E/E/cx, E/E/er:0-9. Stage A of a verdict cell is cx, nostate, er:0-9, class:0-9, degree:0-9, count:0-3, tuning:0-3; a cross cell is cx.
//   THE RECIPE the sparse (1+1)-ES of rungs 3 and 4a (RUNS searches x ITERS children, sigma, 1 to maxK weights a child, then a prune toward the start by block halving); fitness the mean dive score on the 40 TRAINING dives of the task. ELIGIBLE: ends early (crushed, grounded, broached, a hazard hit) in no more
//              HELD-OUT dives than the start (the autopilot). CHAMPION: the eligible search with the best held-out mean; none -> the circuit is scored as its start, which IS the autopilot. The champion is scored ONCE on each of the task's three fresh audits.
//   THE VERDICTS per cell: a pilot A beats B on an audit iff mean(A) - mean(B) > max(0.02, 2 sd of B's family). WIRING: PASS iff cx beats ER, CLASS and DEGREE on all three audits; FAIL iff against the strongest family it wins on fewer than two audits; else IN BETWEEN; NOT ASSESSED below three finished controls a family.
//              AUTOPILOT: cx beats the autopilot alone by the same margin rule on every audit. MEMORY: cx against NO STATE (the most informative single number, Addendum 5). REPORTED: COUNT, TUNING, the reach of every circuit with its rank correlation against score.
//              THE TWO-PATHWAY CLAIM holds iff the aligned arm (P/B, E/E) PASSES on its own task on both tasks AND each beats its cross arm by max(0.02, 2 sd of that cell's ER family) on at least two of three audits. How many of the four cells passed is printed whatever else is.
//   THE FIRST LINES: per task, the TASK RE-CHECK (the disturbance costs the autopilot >= 0.05 on the training dives; 4b-E: the best hand reflex wins back >= half of it, the cue detector fires on none of the cue-free dives, within 2 ticks on all hazard dives, on the right side), the runner and sign self-tests of
//              tools/subVestibularTasks.mjs, and the START CHECK (every arm's untrained pilot scores the autopilot on four dives). A failure is stated before any verdict and the verdicts are not weighed.
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as V from "../../brain/pilotSubVestibular.mjs";
import * as H from "../subVestibularTasks.mjs";
import * as F from "../fishVestibularCircuit.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { meanOf, sdOf, beats, spearman, readRecords, MIN_EDGE, SD_FACTOR, MIN_CONTROLS } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export { MIN_EDGE, SD_FACTOR, MIN_CONTROLS };
export const RECIPE = Object.freeze({ runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 });
export const SEARCH_BASE = 71000, MAX_INDEX = 19;
export const TASK_NAMES = Object.freeze(["P", "E"]), ARM_NAMES = Object.freeze(["B", "E", "whole"]);
export const RUNG = Object.freeze({ P: 1, E: 0 });
export const FAMILIES = Object.freeze(["er", "class", "degree", "count", "tuning"]), VERDICT_FAMILIES = Object.freeze(["er", "class", "degree"]);
export const CONTROL_BASE = Object.freeze({ er: 1000, class: 2000, degree: 3000, count: 4000, tuning: 5000 });
export const VERDICT_CELLS = Object.freeze([["P", "B"], ["P", "whole"], ["E", "E"], ["E", "whole"]]), CROSS_CELLS = Object.freeze([["P", "E"], ["E", "B"]]);
export const DENSE_FAMILIES = Object.freeze(["dcx", "dnostate"]), DENSE_CELL = "P/whole";   // Addendum 8: 4b-D exists on the whole arm of 4b-P only, reported and not judged, with no controls
/** Addendum 9 (post hoc, reported and not judged, no controls): the real wiring of 4b-P with a LOWER STARTING LAMBDA (lambda stays trained and free), on P/B and P/whole. */
export const LAMBDA_START = Object.freeze({ cxl50: 0.5, cxl90: 0.9 }), LAMBDA_FAMILIES = Object.freeze(Object.keys(LAMBDA_START)), LAMBDA_CELLS = Object.freeze(["P/B", "P/whole"]);
export const LAMBDA_SPECS = Object.freeze(LAMBDA_CELLS.flatMap((c) => LAMBDA_FAMILIES.map((f) => `${c}/${f}`))), LAMBDA_STUDY = LAMBDA_SPECS.join(",");
/** Addendum 10, REPORTED AND NOT JUDGED: replicate searches of the lower-lambda starts and of NO STATE on 4b-P, each with its own search seeds, scored on FRESH audit seeds read by nothing else. rl50 and rl70 start lambda at 0.5 and 0.7; rns is NO STATE. Indices 0-3. */
export const REPL_START = Object.freeze({ rl50: 0.5, rl70: 0.7, rns: null }), REPL_FAMILIES = Object.freeze(Object.keys(REPL_START)), REPL_CELLS = LAMBDA_CELLS, REPL_N = 4;
export const REPL_AUDIT_SEEDS = Object.freeze([[83001, 83020], [83021, 83040], [83041, 83060]]);
export const REPL_SPECS = Object.freeze(REPL_CELLS.flatMap((c) => REPL_FAMILIES.map((f) => `${c}/${f}:0-${REPL_N - 1}`))), REPL_STUDY = REPL_SPECS.join(",");
/** Addendum 11, REPORTED AND NOT JUDGED: the three shuffled-wiring controls of Stage A (ER, class-block, degree-preserving; the same shuffles, indices 0-3) trained from the SAME lower lambda start as rl50, on the same cells, recipe and fresh audits, so the real wiring's rl50 replicates can be set beside them. */
export const CTRL50 = Object.freeze({ er50: "er", cl50: "class", dg50: "degree" }), CTRL50_FAMILIES = Object.freeze(Object.keys(CTRL50)), CTRL50_START = 0.5;
export const CTRL50_SPECS = Object.freeze(REPL_CELLS.flatMap((c) => CTRL50_FAMILIES.map((f) => `${c}/${f}:0-${REPL_N - 1}`))), CTRL50_STUDY = CTRL50_SPECS.join(",");
export const isCtrl50 = (family) => CTRL50_FAMILIES.includes(family);
export const isRepl = (family) => REPL_FAMILIES.includes(family) || isCtrl50(family);
const replStart = (family) => (isCtrl50(family) ? CTRL50_START : REPL_START[family]);
/**
 * Addendum 12 and 13, REPORTED AND NOT JUDGED (the registered rules are in brain/FISH_VESTIBULAR_HELPER_WIP.md): two more generations of replicate circuits, each with its own fresh audit seeds and its own references record.
 *   GEN 2 (Addendum 12) 4b-P, P/B and P/whole: qns = NO STATE on the real wiring, qer / qcl / qdg = NO STATE on a SHUFFLED wiring (ER, class-block, degree-preserving; shuffle index 20 + k, never used before), indices 0-3, audits 84001-84060.
 *   GEN 3 (Addendum 13) 4b-E, E/E and E/whole: el99 = the registered start (lambda 0.99), el50 = lambda 0.5, ens = NO STATE, all on the real wiring, indices 0-3, audits 85001-85048 (16 nominal seeds x 4 dives a block).
 * `shuffle` names the Stage A control builder; `start` null means NO STATE (the trace switched off). Gen 1 (Addenda 10 and 11) keeps its own constants above.
 */
export const GENS = Object.freeze({
    2: Object.freeze({ gen: 2, task: "P", cells: Object.freeze(["P/B", "P/whole"]), families: Object.freeze({ qns: Object.freeze({ start: null, shuffle: null }), qer: Object.freeze({ start: null, shuffle: "er" }), qcl: Object.freeze({ start: null, shuffle: "class" }), qdg: Object.freeze({ start: null, shuffle: "degree" }) }), audits: Object.freeze([[84001, 84020], [84021, 84040], [84041, 84060]]), refs: "refs:PQ", firstOrdinal: 666, shuffleOffset: 20, keyword: "noStateShuffled" }),
    3: Object.freeze({ gen: 3, task: "E", cells: Object.freeze(["E/E", "E/whole"]), families: Object.freeze({ el99: Object.freeze({ start: 0.99, shuffle: null }), el50: Object.freeze({ start: 0.5, shuffle: null }), ens: Object.freeze({ start: null, shuffle: null }) }), audits: Object.freeze([[85001, 85016], [85017, 85032], [85033, 85048]]), refs: "refs:ER", firstOrdinal: 698, shuffleOffset: 0, keyword: "escapeReplicates" }),
});
export const GEN_N = 4;
/** The generation (2 or 3) a family belongs to, or 0. */
export const genOf = (family) => (Object.values(GENS).find((g) => family in g.families) || { gen: 0 }).gen;
export const GEN_SPECS = Object.freeze(Object.fromEntries(Object.values(GENS).map((g) => [g.gen, Object.freeze(g.cells.flatMap((c) => Object.keys(g.families).map((f) => `${c}/${f}:0-${GEN_N - 1}`)))])));
export const GEN_STUDY = Object.freeze(Object.fromEntries(Object.entries(GEN_SPECS).map(([g, v]) => [g, v.join(",")])));
/** Which generation's audits and references a family belongs to: 1 for Addenda 10 and 11 (replicate: true), 2 or 3 for the later ones, 0 for none. */
export const replGenOf = (family) => (isRepl(family) ? 1 : genOf(family));
export const ALIGNED = Object.freeze({ P: "B", E: "E" }), CROSS_OF = Object.freeze({ P: "E", E: "B" });
export const STAGE_A_CELL = "cx,nostate,er:0-9,class:0-9,degree:0-9,count:0-3,tuning:0-3", STAGE_B_CELL = "er:10-19,class:10-19,degree:10-19";
export const STAGE_A = [...VERDICT_CELLS.map(([t, a]) => STAGE_A_CELL.split(",").map((x) => `${t}/${a}/${x}`).join(",")), ...CROSS_CELLS.map(([t, a]) => `${t}/${a}/cx`), ...DENSE_FAMILIES.map((f) => `${DENSE_CELL}/${f}`)].join(",");
export const AUDITS = Object.freeze(["a1", "a2", "a3"]);
/** The fresh audit blocks, written in Addendum 7 BEFORE any training and read by nothing else in the tree: 4b-P, three blocks of 10 seeds x 3 kinds (30 dives each); 4b-E, three blocks of 8 nominal seeds x 2 sides x 2 launch times (32 dives each). */
export const AUDIT_SEEDS = Object.freeze({ P: Object.freeze([[81001, 81010], [81011, 81020], [81021, 81030]]), E: Object.freeze([[82001, 82008], [82009, 82016], [82017, 82024]]) });
export const HELD_OUT_SEEDS = Object.freeze({ P: Object.freeze([11, 20]), E: Object.freeze([11, 20]) });
export const COST_FLOOR = H.COST_FLOOR, RECOVER_FRACTION = H.RECOVER_FRACTION;
export const REFS_NAME = (task) => `refs:${task}`, REFS_REPL = "refs:PR";
const KIND3 = T.KINDS;
const range = ([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));

// ---- the dives -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A dive of a task: { task, kind, seed, side, fly(pilot) -> the result of tools/subVestibularTasks.run }. Each flight gets a COPY of the scenario with a target object of its own, so that a pilot whose state is reset when the target object changes starts every flight from rest even when two dives share a scenario. */
export function diveOf(task, sc, extra = {}) {
    const fresh = () => ({ ...sc, target: { ...sc.target } });
    if (task === "P") return Object.freeze({ task, sc, kind: sc.kind, seed: sc.seed, side: 0, fly: (pilot) => H.run(pilot, fresh(), { disturb: H.pitchDisturbance(sc, RUNG.P) }) });
    return Object.freeze({ task, sc, kind: sc.kind, seed: sc.seed, side: extra.side, t0: extra.t0, fly: (pilot) => H.run(pilot, fresh(), { disturb: H.hazardDisturbance({ sc, side: extra.side, t0: extra.t0 }, RUNG.E) }) });
}
const pitchDives = (seeds) => KIND3.flatMap((kind) => seeds.map((seed) => diveOf("P", T.scenario(seed, kind))));
const hazardDives = (seeds) => H.hazardDivesFor(seeds).map((d) => diveOf("E", d.sc, d));
/** The sets of a task: { train (the 40 dives of Addendum 2), heldOut, a1, a2, a3 }; `smoke` shrinks each to every eighth dive. */
export function setsOf(task, { smoke = false, replicate = false } = {}) {
    const gen = replicate === true ? 1 : replicate || 0, auditSeeds = gen === 0 ? AUDIT_SEEDS[task] : gen === 1 ? (task === "P" ? REPL_AUDIT_SEEDS : null) : GENS[gen].task === task ? GENS[gen].audits : null;
    if (gen && !auditSeeds) throw new Error(`trainSubVestibular.setsOf: the replicate audits of generation ${gen} do not exist for 4b-${task}`);
    if (!TASK_NAMES.includes(task)) throw new Error(`trainSubVestibular.setsOf: task ${JSON.stringify(task)} (${TASK_NAMES.join(", ")})`);
    const mk = task === "P" ? pitchDives : hazardDives;
    const trainP = () => T.TRAIN_SET.map((sc) => diveOf("P", sc)), s = { train: task === "P" ? trainP() : hazardDives(range([1, 10])), heldOut: mk(range(HELD_OUT_SEEDS[task])) };
    AUDITS.forEach((a, i) => { s[a] = mk(range(auditSeeds[i])); });
    return smoke ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.filter((_, i) => i % 8 === 0)])) : s;
}
/** Fly `dives` with `pilot`: { score (mean), early (dives that ended early), runs: [{ kind, seed, side, score, status }] }. */
export function evalDives(pilot, dives) {
    const runs = dives.map((d) => { const r = d.fly(pilot); return { kind: d.kind, seed: d.seed, side: d.side, score: r.score, status: r.status }; });
    return { score: meanOf(runs.map((r) => r.score)), early: runs.filter((r) => r.status !== "submerged").length, runs };
}
export const summary = (e) => ({ score: e.score, early: e.early, runs: e.runs.map((r) => ({ kind: r.kind, seed: r.seed, side: r.side, score: r.score, status: r.status })) });
/** The unit-RMS scales of the four tilt signals over the autopilot flying the task's dives with the disturbance (every third tick). */
export function scalesOf(dives) {
    const samples = [];
    for (const d of dives) { let k = 0; d.fly((state, tgt, cur) => { if (k++ % 3 === 0) samples.push(V.sense(state)); return AS.decide(state, tgt, cur); }); }
    return V.scalesFrom(samples);
}

// ---- specs -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`trainSubVestibular.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        const m = /^([A-Za-z]+)\/([A-Za-z]+)\/(cx|nostate|dcx|dnostate|cxl50|cxl90|(?:rl50|rl70|er50|cl50|dg50|qns|qer|qcl|qdg|el99|el50):\d+(?:-\d+)?|[a-z]+:\d+(?:-\d+)?)$/.exec(part);
        if (!m) throw new Error(`trainSubVestibular.parseSpecs: cannot read ${JSON.stringify(part)} (a spec is task/arm/cx, task/arm/nostate or task/arm/family:K or family:K-L)`);
        const [, task, arm, fam] = m;
        if (!TASK_NAMES.includes(task)) throw new Error(`trainSubVestibular.parseSpecs: unknown task ${JSON.stringify(task)} (${TASK_NAMES.join(", ")})`);
        if (!ARM_NAMES.includes(arm)) throw new Error(`trainSubVestibular.parseSpecs: unknown arm ${JSON.stringify(arm)} (${ARM_NAMES.join(", ")})`);
        const cell = CROSS_CELLS.some(([t, a]) => t === task && a === arm) ? "cross" : "verdict";   // the two tasks x the three arms are exactly the six cells
        const add = (family, index) => {
            if (cell === "cross" && family !== "cx") throw new Error(`trainSubVestibular.parseSpecs: the cross cell ${task}/${arm} is cx only, not ${family}`);
            const name = specName({ task, arm, family, index }); if (seen.has(name)) throw new Error(`trainSubVestibular.parseSpecs: ${name} is named twice`); seen.add(name); out.push({ task, arm, family, index });
        };
        const gq = /^(qns|qer|qcl|qdg|el99|el50|ens):(\d+)(?:-(\d+))?$/.exec(fam);
        if (gq) {
            const G = GENS[genOf(gq[1])];
            if (!G.cells.includes(`${task}/${arm}`)) throw new Error(`trainSubVestibular.parseSpecs: ${gq[1]} (generation ${G.gen}, Addendum ${G.gen === 2 ? 12 : 13}) exists on ${G.cells.join(" and ")} only, not ${task}/${arm}`);
            const lo = Number(gq[2]), hi = gq[3] === undefined ? lo : Number(gq[3]);
            if (hi < lo) throw new Error(`trainSubVestibular.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
            if (hi > GEN_N - 1) throw new Error(`trainSubVestibular.parseSpecs: ${JSON.stringify(part)} is past index ${GEN_N - 1}`);
            for (let k = lo; k <= hi; k++) add(gq[1], k);
            continue;
        }
        const rq = /^(rl50|rl70|rns|er50|cl50|dg50):(\d+)(?:-(\d+))?$/.exec(fam);
        if (rq) {
            if (!REPL_CELLS.includes(`${task}/${arm}`)) throw new Error(`trainSubVestibular.parseSpecs: ${rq[1]} (the replicates of Addendum 10) exist on ${REPL_CELLS.join(" and ")} only, not ${task}/${arm}`);
            const lo = Number(rq[2]), hi = rq[3] === undefined ? lo : Number(rq[3]);
            if (hi < lo) throw new Error(`trainSubVestibular.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
            if (hi > REPL_N - 1) throw new Error(`trainSubVestibular.parseSpecs: ${JSON.stringify(part)} is past index ${REPL_N - 1}`);
            for (let k = lo; k <= hi; k++) add(rq[1], k);
            continue;
        }
        if (LAMBDA_FAMILIES.includes(fam)) { if (!LAMBDA_CELLS.includes(`${task}/${arm}`)) throw new Error(`trainSubVestibular.parseSpecs: ${fam} (the lower-lambda start of Addendum 9) exists on ${LAMBDA_CELLS.join(" and ")} only, not ${task}/${arm}`); add(fam, 0); continue; }
        if (DENSE_FAMILIES.includes(fam)) { if (`${task}/${arm}` !== DENSE_CELL) throw new Error(`trainSubVestibular.parseSpecs: ${fam} (4b-D) exists on ${DENSE_CELL} only, not ${task}/${arm}`); add(fam, 0); continue; }
        if (fam === "cx" || fam === "nostate") { add(fam, 0); continue; }
        const q = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(fam);
        if (!FAMILIES.includes(q[1])) throw new Error(`trainSubVestibular.parseSpecs: unknown family ${JSON.stringify(q[1])} (known: cx, nostate, ${FAMILIES.join(", ")})`);
        const lo = Number(q[2]), hi = q[3] === undefined ? lo : Number(q[3]);
        if (hi < lo) throw new Error(`trainSubVestibular.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
        if (hi > MAX_INDEX) throw new Error(`trainSubVestibular.parseSpecs: ${JSON.stringify(part)} is past index ${MAX_INDEX}`);
        for (let k = lo; k <= hi; k++) add(q[1], k);
    }
    return out;
}
export const specName = (s) => `${s.task}/${s.arm}/${s.family === "cx" || s.family === "nostate" || DENSE_FAMILIES.includes(s.family) || LAMBDA_FAMILIES.includes(s.family) ? s.family : `${s.family}:${s.index}`}`;
const FAM_SLOT = Object.freeze({ cx: 0, nostate: 1, er: 2, class: 22, degree: 42, count: 62, tuning: 82 }), CELL_SLOTS = 102;
const CELL_ORDER = Object.freeze([...VERDICT_CELLS, ...CROSS_CELLS].map((c) => c.join("/")));
/** Where a spec sits in the fixed order (the six cells, then cx, nostate, er 0-19, class 0-19, degree 0-19, count 0-19, tuning 0-19): the first search seed is SEARCH_BASE + 10 x that. */
export const ordinalOf = (s) => (genOf(s.family) ? GENS[genOf(s.family)].firstOrdinal + GENS[genOf(s.family)].cells.indexOf(`${s.task}/${s.arm}`) * Object.keys(GENS[genOf(s.family)].families).length * GEN_N + Object.keys(GENS[genOf(s.family)].families).indexOf(s.family) * GEN_N + s.index : isCtrl50(s.family) ? CELL_ORDER.length * CELL_SLOTS + DENSE_FAMILIES.length + LAMBDA_SPECS.length + REPL_CELLS.length * REPL_FAMILIES.length * REPL_N + REPL_CELLS.indexOf(`${s.task}/${s.arm}`) * CTRL50_FAMILIES.length * REPL_N + CTRL50_FAMILIES.indexOf(s.family) * REPL_N + s.index : isRepl(s.family) ? CELL_ORDER.length * CELL_SLOTS + DENSE_FAMILIES.length + LAMBDA_SPECS.length + REPL_CELLS.indexOf(`${s.task}/${s.arm}`) * REPL_FAMILIES.length * REPL_N + REPL_FAMILIES.indexOf(s.family) * REPL_N + s.index : LAMBDA_FAMILIES.includes(s.family) ? CELL_ORDER.length * CELL_SLOTS + DENSE_FAMILIES.length + LAMBDA_SPECS.indexOf(`${s.task}/${s.arm}/${s.family}`) : DENSE_FAMILIES.includes(s.family) ? CELL_ORDER.length * CELL_SLOTS + DENSE_FAMILIES.indexOf(s.family) : CELL_ORDER.indexOf(`${s.task}/${s.arm}`) * CELL_SLOTS + FAM_SLOT[s.family] + s.index);
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
let EXTRACTION = null;
export const extraction = () => EXTRACTION || (EXTRACTION = F.extract());
export const armCircuit = (arm) => V.circuitOf(extraction(), arm);
export const circuitFor = (spec, x = extraction()) => { const base = V.circuitOf(x, spec.arm); if (isCtrl50(spec.family)) return V.CONTROLS[CTRL50[spec.family]](base, CONTROL_BASE[CTRL50[spec.family]] + spec.index);
    if (genOf(spec.family) && GENS[genOf(spec.family)].families[spec.family].shuffle) { const g = GENS[genOf(spec.family)], sh = g.families[spec.family].shuffle; return V.CONTROLS[sh](base, CONTROL_BASE[sh] + g.shuffleOffset + spec.index); }
    return VERDICT_FAMILIES.includes(spec.family) || spec.family === "count" || spec.family === "tuning" ? V.CONTROLS[spec.family](base, CONTROL_BASE[spec.family] + spec.index) : base; };
/** The policy of a spec on its task: the task's evaluator is the seam, the scales are the task's. */
export const policyOf = (spec, scales, circuit = circuitFor(spec)) => V.createVestibularPolicy(circuit, specName(spec), { persist: spec.family !== "nostate" && spec.family !== "dnostate" && spec.family !== "rns" && !(genOf(spec.family) && GENS[genOf(spec.family)].families[spec.family].start === null), dense: DENSE_FAMILIES.includes(spec.family), scales, evaluate: (pilot, set) => evalDives(pilot, set) }, LAMBDA_FAMILIES.includes(spec.family) ? { ...V.INIT, lambda0: LAMBDA_START[spec.family] } : replStart(spec.family) ? { ...V.INIT, lambda0: replStart(spec.family) } : genOf(spec.family) && GENS[genOf(spec.family)].families[spec.family].start ? { ...V.INIT, lambda0: GENS[genOf(spec.family)].families[spec.family].start } : V.INIT);

// ---- one search and one circuit -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** One search of the recipe from the start weights; returns { k, seed, weights, trainScore, improved, neutral, moved, kept, pruneEvals }. */
export function search(Pol, seed, k, recipe, trainSet) {
    const rng = mulberry(seed), hand = Pol.handWeights(), ev = (w) => Pol.evaluate(w, trainSet).score;
    let best = Float32Array.from(hand), bestScore = ev(best), improved = 0, neutral = 0;
    for (let i = 1; i <= recipe.iters; i++) {
        const cand = Pol.mutate(best, recipe.sigma, rng, recipe.maxK), score = ev(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    const movedIdx = []; for (let i = 0; i < best.length; i++) if (best[i] !== hand[i]) movedIdx.push(i);
    let budget = recipe.pruneBudget, cur = best, curScore = bestScore, evals = 0;
    const tryRevert = (idxs) => {
        if (!idxs.length || budget <= 0) return;
        const cand = Float32Array.from(cur); for (const i of idxs) cand[i] = hand[i];
        budget--; evals++; const s = ev(cand);
        if (s >= curScore - 1e-9) { cur = cand; curScore = s; return; }
        if (idxs.length === 1) return;
        const h = idxs.length >> 1; tryRevert(idxs.slice(0, h)); tryRevert(idxs.slice(h));
    };
    tryRevert(movedIdx);
    let kept = 0; for (let i = 0; i < cur.length; i++) if (cur[i] !== hand[i]) kept++;
    return { k, seed, weights: cur, trainScore: curScore, improved, neutral, moved: movedIdx.length, kept, pruneEvals: evals };
}
/** Train and grade one circuit. Returns the record the file keeps. THE AUDITS ARE READ HERE, ONCE, FOR THE CHAMPION. */
export function runCircuit(spec, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf(spec.task, { smoke: !!opts.smoke, replicate: replGenOf(spec.family) }), scales = opts.scales || scalesOf(sets.train);
    const name = specName(spec), Pol = (opts.policyOf || policyOf)(spec, scales), base = seedBaseOf(spec), hand = Pol.handWeights(), startHeld = Pol.evaluate(hand, sets.heldOut), runs = [];
    for (let k = 0; k < recipe.runs; k++) {
        const r = search(Pol, base + k, k, recipe, sets.train), held = Pol.evaluate(r.weights, sets.heldOut);
        runs.push({ ...r, heldOut: held.score, heldEarly: held.early, eligible: held.early <= startHeld.early });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${r.moved} moved weights pruned to ${r.kept} (${r.pruneEvals} evaluations), train ${r.trainScore.toFixed(4)}, held-out ${held.score.toFixed(4)}, ended early ${held.early} (start ${startHeld.early}) ${held.early <= startHeld.early ? "eligible" : "NOT eligible"}`);
    }
    const eligible = runs.filter((r) => r.eligible).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k), c = eligible[0] || null;
    const champion = c ? Object.fromEntries(AUDITS.map((a) => [a, summary(Pol.evaluate(c.weights, sets[a]))])) : null;
    return { spec: name, task: spec.task, arm: spec.arm, family: spec.family, index: spec.index, ...(replGenOf(spec.family) ? { replicate: replGenOf(spec.family) === 1 ? true : replGenOf(spec.family) } : {}), smoke: !!opts.smoke, recipe, seedBase: base, weightCount: Pol.WEIGHT_COUNT, reach: Pol.reach.pairs, scales, champion: c ? c.seed : null, asStart: !c, startHeldEarly: startHeld.early,
        searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut, heldEarly: r.heldEarly, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        movement: c ? { moved: c.moved, kept: c.kept, largest: Math.max(...Array.from(c.weights, (v, i) => Math.abs(v - hand[i]))), lambda: Pol.persist ? c.weights[Pol.LAMBDA_INDEX] : 0 } : null, scores: { champion }, weights: c ? Array.from(c.weights, (v) => Math.round(v * 1e6) / 1e6) : null };
}

// ---- the references record of a task (the autopilot on the audits, the task re-check, the start check) -------------------------------------------------------------------------------------------
/** The autopilot alone on the task's three audits (it selects nothing), the TASK RE-CHECK on the 40 training dives, the self-tests of the task module, and the START CHECK of every arm. */
export function refsRecord(task, opts = {}) {
    const TM = opts.tasks || H, mkPolicy = opts.policyOf || policyOf;
    const sets = opts.sets || setsOf(task, { smoke: !!opts.smoke, replicate: opts.replicate || false }), AP = AS.pilot(), scales = opts.scales || scalesOf(sets.train);
    const autopilot = Object.fromEntries(AUDITS.map((a) => [a, summary(evalDives(AP, sets[a]))]));
    const trainDist = evalDives(AP, sets.train), clean = meanOf(sets.train.map((d) => T.fly(AP, d.sc).score)), cost = clean - trainDist.score;
    const rec = { family: "refs", spec: opts.replicate ? (opts.replicate === true ? REFS_REPL : GENS[opts.replicate].refs) : REFS_NAME(task), task, ...(opts.replicate ? { replicate: opts.replicate } : {}), smoke: !!opts.smoke, autopilot, cleanTrain: clean, disturbedTrain: trainDist.score, cost, scales };
    const runner = TM.selfTestRunner(), signs = TM.selfTestSigns();
    rec.selfTests = { runnerBad: runner.bad, signsFailed: signs.filter(([, ok]) => !ok).map(([w]) => w) };
    if (task === "E") {
        const tt = TM.selfTestTrigger(); rec.trigger = { a: tt.a, b: tt.b, c: tt.c, n: tt.n };
        const dives = sets.train, base = trainDist;
        const rs = H.REFLEXES.map((R) => ({ name: R.name, score: meanOf(dives.map((d) => H.run(H.reflex(AP, R), d.sc, { disturb: H.hazardDisturbance(d, RUNG.E) }).score)) }));
        const best = rs.reduce((a, b) => (b.score > a.score ? b : a)); rec.reflex = { best: best.name, recovered: cost > 0 ? (best.score - base.score) / cost : NaN };
    }
    const starts = [...ARM_NAMES.map((arm) => ({ arm, family: "cx" })), ...(task === "P" ? [{ arm: "whole", family: "dcx", label: "whole-dense" }] : [])];
    rec.startCheck = starts.map(({ arm, family, label }) => { const Pol = mkPolicy({ task, arm, family, index: 0 }, scales), hand = Pol.handWeights(), probe = sets.train.slice(0, 4), a = Pol.evaluate(hand, probe), b = evalDives(AP, probe); return { arm: label || arm, same: a.score === b.score || Math.abs(a.score - b.score) < 1e-9 }; });
    return rec;
}

// ---- the checks, the verdicts, the report -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The registered checks of a task from its references record: { ok, rows }. */
export function checksOf(refs) {
    const rows = [], t = refs.task;
    rows.push({ name: `TASK RE-CHECK (4b-${t}, cost)`, ok: refs.cost >= COST_FLOOR, text: `the disturbance costs the autopilot ${f3(refs.cost)} of mean dive score on the training dives (needs ${COST_FLOOR})` });
    if (t === "E") {
        rows.push({ name: "TASK RE-CHECK (4b-E, reachable)", ok: refs.reflex.recovered >= RECOVER_FRACTION, text: `the best hand reflex (${refs.reflex.best}) wins back ${f3(refs.reflex.recovered)} of the cost (needs ${RECOVER_FRACTION})` });
        rows.push({ name: "CUE DETECTOR (Addendum 3)", ok: refs.trigger.a && refs.trigger.b && refs.trigger.c, text: `fires on none of the cue-free dives: ${refs.trigger.a}; within 2 ticks on all ${refs.trigger.n} hazard dives: ${refs.trigger.b}; on the right side on all: ${refs.trigger.c}` });
    }
    rows.push({ name: "RUNNER AND SIGN SELF-TESTS", ok: refs.selfTests.runnerBad.length === 0 && refs.selfTests.signsFailed.length === 0, text: refs.selfTests.runnerBad.length || refs.selfTests.signsFailed.length ? `failed: ${[...refs.selfTests.runnerBad, ...refs.selfTests.signsFailed].join("; ")}` : "run() reproduces subTask.fly() with no disturbance and every sign row holds" });
    rows.push({ name: "START CHECK", ok: refs.startCheck.length > 0 && refs.startCheck.every((x) => x.same), text: `every arm's untrained pilot is the autopilot on 4 training dives: ${refs.startCheck.map((x) => `${x.arm} ${x.same ? "same" : "DIFFERENT"}`).join(", ")}` });
    return { ok: rows.every((r) => r.ok), rows };
}
/** A circuit's summary per audit: the champion's, or (no champion) its start's, which is the autopilot. */
export const effectiveOf = (rec, refs) => Object.fromEntries(AUDITS.map((a) => [a, rec.scores.champion ? rec.scores.champion[a] : refs.autopilot[a]]));
const NAMES = { nostate: "NO STATE", er: "ER", class: "CLASS", degree: "DEGREE", count: "COUNT", tuning: "TUNING" };

/** The verdict of one cell from its records and its task's references record. */
export function cellVerdict(recs, refs) {
    const cx = recs.find((r) => r.family === "cx");
    if (!cx || !refs) return { cx: null, wiring: { verdict: "NOT ASSESSED", why: !refs ? "no references record" : "no cx record" }, autopilot: null, memory: null, families: {}, reach: null };
    const F_ = effectiveOf(cx, refs), eff = (r) => effectiveOf(r, refs), families = {}, strongest = {};
    for (const fam of FAMILIES) { const rs = recs.filter((r) => r.family === fam); if (!rs.length) continue; families[fam] = { n: rs.length, audits: {} }; for (const a of AUDITS) families[fam].audits[a] = { F: F_[a].score, ...beats(F_[a].score, rs.map((r) => eff(r)[a].score)) }; }
    const missing = VERDICT_FAMILIES.filter((f) => !families[f] || families[f].n < MIN_CONTROLS);
    let wiring;
    if (missing.length) wiring = { verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls` };
    else {
        for (const a of AUDITS) strongest[a] = VERDICT_FAMILIES.reduce((best, f) => (families[f].audits[a].m > families[best].audits[a].m ? f : best), VERDICT_FAMILIES[0]);
        const passes = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => families[f].audits[a].wins)), lost = AUDITS.filter((a) => !families[strongest[a]].audits[a].wins).length;
        wiring = { verdict: passes ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN", why: passes ? "cx beats ER, CLASS and DEGREE on all three audits" : lost >= 2 ? `against the strongest family cx wins on ${3 - lost} of 3 audits` : "cx does not beat every family on every audit, but wins against the strongest on at least two" };
    }
    const apRows = AUDITS.map((a) => { const o = refs.autopilot[a], diff = F_[a].score - o.score, needs = MIN_EDGE; return { audit: a, diff, needs, wins: diff > needs, early: F_[a].early, apEarly: o.early }; });
    const autopilot = { verdict: apRows.every((x) => x.wins && x.early <= x.apEarly) ? "BEATS THE AUTOPILOT" : "DOES NOT BEAT THE AUTOPILOT", rows: apRows };
    const ns = recs.find((r) => r.family === "nostate"), memory = ns ? AUDITS.map((a) => ({ audit: a, F: F_[a].score, other: eff(ns)[a].score, ...beats(F_[a].score, [eff(ns)[a].score]) })) : null;
    const reachRows = recs.filter((r) => ["cx", ...VERDICT_FAMILIES].includes(r.family)), reach = reachRows.length >= 3 ? AUDITS.map((a) => ({ audit: a, rho: spearman(reachRows.map((r) => r.reach), reachRows.map((r) => eff(r)[a].score)) })) : null;
    return { cx, wiring, autopilot, memory, families, strongest, reach };
}
/** 4b-D (Addendum 8), REPORTED AND NOT JUDGED: the dense-input variant on P/whole against the autopilot, against the tuning-derived P/whole cx and against its own NO STATE, per audit. null with no dcx record. */
export function denseReading(recs, refs, cxCell) {
    const d = recs.find((r) => r.family === "dcx");
    if (!d || !refs) return null;
    const F_ = effectiveOf(d, refs), ns = recs.find((r) => r.family === "dnostate"), cx = cxCell && cxCell.cx ? effectiveOf(cxCell.cx, refs) : null;
    const against = (other) => AUDITS.map((a) => ({ audit: a, ...beats(F_[a].score, [other[a].score]) }));
    return { rec: d, scores: F_, autopilot: AUDITS.map((a) => ({ audit: a, diff: F_[a].score - refs.autopilot[a].score })), vsCx: cx ? against(cx) : null, vsNoState: ns ? against(effectiveOf(ns, refs)) : null };
}
/** Addendum 9, REPORTED AND NOT JUDGED: each lower-lambda-start circuit of 4b-P against the autopilot, against its cell's registered cx (lambda 0.99) and against its cell's NO STATE. [] with none. */
export function lambdaReading(cellsRecs, refs) {
    if (!refs) return [];
    const out = [];
    for (const cell of LAMBDA_CELLS) {
        const recs = cellsRecs[cell] || [], cx = recs.find((r) => r.family === "cx"), ns = recs.find((r) => r.family === "nostate");
        for (const fam of LAMBDA_FAMILIES) {
            const r = recs.find((x) => x.family === fam); if (!r) continue;
            const F_ = effectiveOf(r, refs), against = (other) => AUDITS.map((a) => ({ audit: a, ...beats(F_[a].score, [other[a].score]) }));
            out.push({ cell, family: fam, start: LAMBDA_START[fam], rec: r, scores: F_, autopilot: AUDITS.map((a) => ({ audit: a, diff: F_[a].score - refs.autopilot[a].score })), vsCx: cx ? against(effectiveOf(cx, refs)) : null, vsNoState: ns ? against(effectiveOf(ns, refs)) : null });
        }
    }
    return out;
}
/** Addendum 10, REPORTED AND NOT JUDGED: per cell and per start (rl50, rl70, rns) the replicates' effective scores on the FRESH audits (mean, sd, range), each mean's difference from the autopilot, and the lower-lambda means against the cell's NO STATE replicates by the margin rule (ahead / tie / behind). [] with no replicate references record. */
export function replicateReading(cellsRecs, refs) {
    if (!refs) return [];
    const out = [];
    for (const cell of REPL_CELLS) {
        const recs = cellsRecs[cell] || [], by = (f) => recs.filter((r) => r.family === f).sort((a, b) => a.index - b.index);
        const scoresOf = (rs) => Object.fromEntries(AUDITS.map((a) => [a, rs.map((r) => effectiveOf(r, refs)[a].score)])), ns = by("rns"), nsS = scoresOf(ns);
        for (const fam of REPL_FAMILIES) {
            const rs = by(fam); if (!rs.length) continue;
            const S = scoresOf(rs);
            const audits = AUDITS.map((a) => {
                const v = S[a], m = meanOf(v), d = m - refs.autopilot[a].score, row = { audit: a, mean: m, sd: sdOf(v), min: Math.min(...v), max: Math.max(...v), vsAutopilot: d, offAutopilot: d > MIN_EDGE };
                if (fam !== "rns" && ns.length) { const b = beats(m, nsS[a]); row.vsNoState = { margin: b.margin, needs: b.needs, reading: b.margin > b.needs ? "ahead" : b.margin < -b.needs ? "behind" : "tie" }; }
                return row;
            });
            out.push({ cell, family: fam, start: REPL_START[fam], n: rs.length, stuck: rs.filter((r) => r.asStart).length, lambdas: rs.map((r) => (r.movement ? r.movement.lambda : null)), audits });
        }
        // Addendum 11: the shuffled-wiring controls at the same start, each set against the real wiring's rl50 mean by the margin rule (needs the larger of 0.02 and 2 sd of the control's replicates)
        const rl = by("rl50"), rlS = scoresOf(rl);
        for (const fam of CTRL50_FAMILIES) {
            const rs = by(fam); if (!rs.length) continue;
            const S = scoresOf(rs);
            const audits = AUDITS.map((a) => {
                const v = S[a], m = meanOf(v), d = m - refs.autopilot[a].score, row = { audit: a, mean: m, sd: sdOf(v), min: Math.min(...v), max: Math.max(...v), vsAutopilot: d, offAutopilot: d > MIN_EDGE };
                if (rl.length) { const b = beats(meanOf(rlS[a]), v); row.realVsControl = { margin: b.margin, needs: b.needs, reading: b.margin > b.needs ? "ahead" : b.margin < -b.needs ? "behind" : "tie" }; }
                return row;
            });
            out.push({ cell, family: fam, start: CTRL50_START, control: CTRL50[fam], n: rs.length, stuck: rs.filter((r) => r.asStart).length, lambdas: rs.map((r) => (r.movement ? r.movement.lambda : null)), audits });
        }
    }
    return out;
}
/** Addendum 11, REPORTED AND NOT JUDGED: per cell, on how many of the three audits the real wiring's rl50 replicates are AHEAD of each shuffled-wiring control's, and of all three families at once. [] with no control rows. */
export function wiringAtLowStart(repl) {
    const out = [];
    for (const cell of REPL_CELLS) {
        const rows = repl.filter((x) => x.cell === cell && x.audits[0].realVsControl); if (!rows.length) continue;
        const per = Object.fromEntries(rows.map((x) => [x.family, { ahead: x.audits.filter((a) => a.realVsControl.reading === "ahead").length, tie: x.audits.filter((a) => a.realVsControl.reading === "tie").length, behind: x.audits.filter((a) => a.realVsControl.reading === "behind").length }]));
        out.push({ cell, families: per, n: rows.length, aheadOfAll: rows.length === CTRL50_FAMILIES.length ? AUDITS.filter((a, i) => rows.every((x) => x.audits[i].realVsControl.reading === "ahead")).length : null });
    }
    return out;
}
/** Exact one-sided permutation p for "the `real` scores sit above the `others`": the share of all ways to pick |real| of the pooled scores whose Mann-Whitney U (ties 0.5) is at least the observed one. Smallest value 1 / C(n, k). */
export function exactRankP(real, others) {
    const all = [...real, ...others], n = all.length, k = real.length, U = (idx) => { let u = 0; const set = new Set(idx); for (const i of idx) for (let j = 0; j < n; j++) if (!set.has(j)) u += all[i] > all[j] ? 1 : all[i] === all[j] ? 0.5 : 0; return u; };
    const observed = U(real.map((_, i) => i)); let hit = 0, total = 0;
    const walk = (start, picked) => { if (picked.length === k) { total++; if (U(picked) >= observed - 1e-12) hit++; return; } for (let i = start; i < n; i++) walk(i + 1, [...picked, i]); };
    walk(0, []);
    return { U: observed, max: k * (n - k), p: hit / total, splits: total };
}
export const GEN_COMPARE = Object.freeze({ 2: Object.freeze([["qns", "qer"], ["qns", "qcl"], ["qns", "qdg"]]), 3: Object.freeze([["el99", "ens"], ["el50", "ens"], ["el50", "el99"]]) });
export const RANK_ALPHA = 0.05;
/**
 * Addenda 12 and 13, REPORTED AND NOT JUDGED: per cell and per family of generation `gen` the replicates' effective scores on that generation's FRESH audits (mean, sd, range), the difference from that generation's autopilot, and the registered comparisons (GEN_COMPARE: a family's mean against the other family's replicates by the margin rule, needs the larger of 0.02 and 2 sd of the OTHER family's replicates: ahead / tie / behind). Generation 2 adds, per cell, the registered rank test: the four qns searches (each scored as the mean of its three audits) against the pooled shuffled-wiring searches. { rows, cells } ; both [] with no references record of the generation.
 */
export function groupReading(cellsRecs, refs, gen) {
    if (!refs) return { rows: [], cells: [] };
    const G = GENS[gen], fams = Object.keys(G.families), rows = [], cells = [];
    for (const cell of G.cells) {
        const recs = cellsRecs[cell] || [], by = (f) => recs.filter((r) => r.family === f).sort((a, b) => a.index - b.index);
        const scoresOf = (rs) => Object.fromEntries(AUDITS.map((a) => [a, rs.map((r) => effectiveOf(r, refs)[a].score)])), group = Object.fromEntries(fams.map((f) => [f, by(f)])), S = Object.fromEntries(fams.map((f) => [f, scoresOf(group[f])]));
        for (const fam of fams) {
            const rs = group[fam]; if (!rs.length) continue;
            const audits = AUDITS.map((a) => {
                const v = S[fam][a], m = meanOf(v), d = m - refs.autopilot[a].score, row = { audit: a, mean: m, sd: sdOf(v), min: Math.min(...v), max: Math.max(...v), vsAutopilot: d, offAutopilot: d > MIN_EDGE, vs: {} };
                for (const [x, y] of GEN_COMPARE[gen]) if (x === fam && group[y].length) { const b = beats(m, S[y][a]); row.vs[y] = { margin: b.margin, needs: b.needs, reading: b.margin > b.needs ? "ahead" : b.margin < -b.needs ? "behind" : "tie" }; }
                return row;
            });
            rows.push({ cell, gen, family: fam, start: G.families[fam].start, shuffle: G.families[fam].shuffle, n: rs.length, stuck: rs.filter((r) => r.asStart).length, lambdas: rs.map((r) => (r.movement ? r.movement.lambda : null)), audits });
        }
        if (group.qns && group.qns.length) {
            const shuffled = ["qer", "qcl", "qdg"].flatMap((f) => group[f]); if (!shuffled.length) continue;
            const circ = (rs) => rs.map((r) => meanOf(AUDITS.map((a) => effectiveOf(r, refs)[a].score))), t = exactRankP(circ(group.qns), circ(shuffled));
            cells.push({ cell, nReal: group.qns.length, nShuffled: shuffled.length, complete: group.qns.length === GEN_N && shuffled.length === 3 * GEN_N, U: t.U, max: t.max, p: t.p, supported: t.p <= RANK_ALPHA });
        }
    }
    return { rows, cells };
}
/** The two-pathway claim from the four verdict cells' verdicts and the two cross cells' cx records: { holds, rows, passed }. */
export function pathwayClaim(cells, crossRecs, refsByTask) {
    const rows = []; let holds = true;
    for (const task of TASK_NAMES) {
        const a = cells[`${task}/${ALIGNED[task]}`], cross = crossRecs[`${task}/${CROSS_OF[task]}`], refs = refsByTask[task];
        if (!a || !a.cx || !cross || !refs) { rows.push({ task, status: "NOT ASSESSED", why: !a || !a.cx ? "no aligned cx record" : !cross ? "no cross record" : "no references record" }); holds = false; continue; }
        const er = a.families.er, F_ = effectiveOf(a.cx, refs), C = effectiveOf(cross, refs);
        const audits = AUDITS.map((x) => { const sd = er ? er.audits[x].s : 0, needs = Math.max(MIN_EDGE, SD_FACTOR * sd), diff = F_[x].score - C[x].score; return { audit: x, diff, needs, wins: diff > needs }; });
        const wins = audits.filter((x) => x.wins).length, pass = a.wiring.verdict === "PASS";
        rows.push({ task, status: pass && wins >= 2 ? "HOLDS" : "does not hold", aligned: ALIGNED[task], cross: CROSS_OF[task], alignedPasses: pass, crossWins: wins, audits }); if (!(pass && wins >= 2)) holds = false;
    }
    return { holds, rows };
}
const byCell = (records) => { const m = {}; for (const r of records.filter((x) => x.family !== "refs")) (m[`${r.task}/${r.arm}`] = m[`${r.task}/${r.arm}`] || []).push(r); return m; };
/** Every verdict over a results file's records: { checks: { P, E }, cells, claim, passed }. */
export function verdictOf(records) {
    const refsByTask = Object.fromEntries(records.filter((r) => r.family === "refs" && !r.replicate).map((r) => [r.task, r])), refsRepl = records.find((r) => r.family === "refs" && r.replicate === true) || null, refsGen = (g) => records.find((r) => r.family === "refs" && r.replicate === g) || null, cellsRecs = byCell(records), cells = {}, crossRecs = {};
    for (const [t, a] of VERDICT_CELLS) { const k = `${t}/${a}`; if (cellsRecs[k]) cells[k] = cellVerdict(cellsRecs[k], refsByTask[t]); }
    for (const [t, a] of CROSS_CELLS) { const k = `${t}/${a}`, c = (cellsRecs[k] || []).find((r) => r.family === "cx"); if (c) crossRecs[k] = c; }
    const checks = Object.fromEntries(TASK_NAMES.filter((t) => refsByTask[t]).map((t) => [t, checksOf(refsByTask[t])])), claim = pathwayClaim(cells, crossRecs, refsByTask), dense = denseReading(cellsRecs[DENSE_CELL] || [], refsByTask.P, cells[DENSE_CELL]), lambda = lambdaReading(cellsRecs, refsByTask.P);
    const repl = replicateReading(cellsRecs, refsRepl), wiring50 = wiringAtLowStart(repl), gen2 = groupReading(cellsRecs, refsGen(2), 2), gen3 = groupReading(cellsRecs, refsGen(3), 3);
    return { checks, cells, claim, dense, lambda, repl, wiring50, gen2, gen3, passed: Object.values(cells).filter((c) => c.wiring.verdict === "PASS").length, assessed: Object.values(cells).filter((c) => c.wiring.verdict !== "NOT ASSESSED").length, refsByTask };
}
export function reportLines(records) {
    const v = verdictOf(records), L = [], rs = records.filter((r) => r.family !== "refs");
    L.push(`RUNG 4b: ${rs.length} circuits in ${Object.keys(v.cells).length} verdict cell(s)`);
    for (const t of TASK_NAMES) { if (!v.checks[t]) continue; for (const r of v.checks[t].rows) L.push(`  ${r.ok ? "[ok]     " : "[FAILED] "} ${r.name}: ${r.text}`); if (!v.checks[t].ok) L.push(`  4b-${t}: A CHECK FAILED: its verdicts below are printed and NOT weighed`); }
    for (const [t, a] of VERDICT_CELLS) {
        const k = `${t}/${a}`, c = v.cells[k]; if (!c) continue;
        const refs = v.refsByTask[t], checkOk = v.checks[t] ? v.checks[t].ok : false;
        L.push(`  CELL ${k}${a === ALIGNED[t] ? " (aligned)" : ""}:`);
        if (c.cx) { const e = effectiveOf(c.cx, refs); L.push(`    CX: ${c.cx.asStart ? "NO ELIGIBLE CHAMPION (scored as its start, the autopilot)" : `champion seed ${c.cx.champion}, moved ${c.cx.movement.moved}, kept ${c.cx.movement.kept}, lambda ${f3(c.cx.movement.lambda)}`} | ${AUDITS.map((x) => `${x} ${f3(e[x].score)} (early ${e[x].early})`).join(" | ")}; the autopilot ${AUDITS.map((x) => f3(refs.autopilot[x].score)).join(" | ")}`); }
        if (c.memory) L.push(`    NO STATE: cx vs it ${c.memory.map((x) => `${f3(x.margin)} (needs ${f3(x.needs)}: ${x.wins ? "WINS" : "no"})`).join(" | ")}`);
        for (const fam of FAMILIES) { const d = c.families[fam]; if (d) L.push(`    ${NAMES[fam]} x${d.n}${VERDICT_FAMILIES.includes(fam) ? "" : " (reported)"}: ` + AUDITS.map((x) => `${x} ${f3(d.audits[x].m)} +- ${f3(d.audits[x].s)} (cx ${d.audits[x].margin >= 0 ? "+" : ""}${f3(d.audits[x].margin)}, needs ${f3(d.audits[x].needs)}: ${d.audits[x].wins ? "WINS" : "no"})`).join(" | ")); }
        if (c.reach) L.push(`    reach (pairs) vs score across cx and the verdict controls, rank correlation: ${c.reach.map((x) => `${x.audit} ${x.rho === null ? "n/a" : x.rho.toFixed(2)}`).join(" | ")}${c.wiring.verdict === "PASS" && c.reach.some((x) => x.rho !== null && x.rho > 0.5) ? " -- A PASS READ AS CONFOUNDED BY REACH" : ""}`);
        L.push(`    WIRING VERDICT ${k}: ${checkOk ? c.wiring.verdict : "NOT READ (a check failed)"} -- ${c.wiring.why}`);
        if (c.autopilot) L.push(`    AUTOPILOT VERDICT ${k}: ${c.autopilot.verdict} -- ${c.autopilot.rows.map((x) => `${x.audit} ${x.diff >= 0 ? "+" : ""}${f3(x.diff)} (needs ${f3(x.needs)}; early ${x.early} against ${x.apEarly})`).join(" | ")}`);
    }
    if (v.dense) {
        const d = v.dense, w = (rows) => rows.map((x) => `${f3(x.margin)} (needs ${f3(x.needs)}: ${x.wins ? "ahead" : "not ahead"})`).join(" | ");
        L.push(`  4b-D on ${DENSE_CELL} (REPORTED, NOT JUDGED, no controls): ${d.rec.asStart ? "NO ELIGIBLE CHAMPION (scored as its start, the autopilot)" : `champion seed ${d.rec.champion}, lambda ${f3(d.rec.movement.lambda)}`} | ${AUDITS.map((x) => `${x} ${f3(d.scores[x].score)}`).join(" | ")}; against the autopilot ${d.autopilot.map((x) => (x.diff >= 0 ? "+" : "") + f3(x.diff)).join(" | ")}`);
        if (d.vsCx) L.push(`    against the tuning-derived ${DENSE_CELL} cx (does the data's tilt encoding buy anything over a dense trained input?): ${w(d.vsCx)}`);
        if (d.vsNoState) L.push(`    against its own NO STATE: ${w(d.vsNoState)}`);
    }
    for (const x of v.lambda) {
        const w = (rows) => rows.map((y) => `${f3(y.margin)} (needs ${f3(y.needs)}: ${y.wins ? "ahead" : "not ahead"})`).join(" | ");
        L.push(`  LOWER LAMBDA START ${x.cell}/${x.family} (lambda ${x.start}, Addendum 9; REPORTED, NOT JUDGED, no controls): ${x.rec.asStart ? "NO ELIGIBLE CHAMPION (scored as its start, the autopilot)" : `champion seed ${x.rec.champion}, kept ${x.rec.movement.kept}, final lambda ${f3(x.rec.movement.lambda)}`} | ${AUDITS.map((a) => `${a} ${f3(x.scores[a].score)}`).join(" | ")}; against the autopilot ${x.autopilot.map((y) => (y.diff >= 0 ? "+" : "") + f3(y.diff)).join(" | ")}`);
        if (x.vsCx) L.push(`    against the registered cx of ${x.cell} (lambda 0.99): ${w(x.vsCx)}`);
        if (x.vsNoState) L.push(`    against ${x.cell} NO STATE: ${w(x.vsNoState)}`);
    }
    for (const x of v.repl) {
        const sm = (a) => `${f3(a.mean)} sd ${f3(a.sd)} [${f3(a.min)}..${f3(a.max)}]`;
        L.push(`  REPLICATES ${x.cell}/${x.family} (${x.family === "rns" ? "NO STATE" : x.control ? "the " + x.control + " control at lambda " + x.start : "lambda start " + x.start}, Addendum ${x.control ? 11 : 10}; REPORTED, NOT JUDGED, fresh audits 83001-83060): ${x.n} circuit(s), ${x.stuck} with no eligible champion; final lambdas ${x.lambdas.map((l) => (l === null ? "none" : f3(l))).join(" ")}`);
        L.push(`    ${x.audits.map((a) => `${a.audit} ${sm(a)}`).join(" | ")}; against the autopilot ${x.audits.map((a) => (a.vsAutopilot >= 0 ? "+" : "") + f3(a.vsAutopilot) + (a.offAutopilot ? " (off it)" : " (not off it)")).join(" | ")}`);
        if (x.audits[0].realVsControl) L.push(`    the real wiring's rl50 mean against these: ${x.audits.map((a) => `${f3(a.realVsControl.margin)} (needs ${f3(a.realVsControl.needs)}: ${a.realVsControl.reading})`).join(" | ")}`);
        if (x.audits[0].vsNoState) L.push(`    against the ${x.cell} NO STATE replicates: ${x.audits.map((a) => `${f3(a.vsNoState.margin)} (needs ${f3(a.vsNoState.needs)}: ${a.vsNoState.reading})`).join(" | ")}`);
    }
    for (const w of v.wiring50) L.push(`  WIRING AT LAMBDA 0.5 ${w.cell} (Addendum 11; REPORTED, NOT JUDGED): the real wiring is ahead of ${Object.entries(w.families).map(([f, c]) => `${CTRL50[f]} on ${c.ahead} of 3 (tie ${c.tie}, behind ${c.behind})`).join(", ")}; ahead of ${w.aheadOfAll === null ? "(not all three families are in)" : "all three families on " + w.aheadOfAll + " of 3 audits"}`);
    for (const [gk, g] of [[2, v.gen2], [3, v.gen3]]) {
        for (const x of g.rows) {
            const lab = gk === 2 ? (x.shuffle ? `NO STATE on a ${x.shuffle}-shuffled wiring` : "NO STATE on the real wiring") : (x.start === null ? "NO STATE" : `lambda start ${x.start}`);
            L.push(`  GEN ${gk} ${x.cell}/${x.family} (${lab}, Addendum ${gk === 2 ? 12 : 13}; REPORTED, NOT JUDGED, fresh audits ${GENS[gk].audits[0][0]}-${GENS[gk].audits[2][1]}): ${x.n} circuit(s), ${x.stuck} with no eligible champion${x.start === null ? "" : "; final lambdas " + x.lambdas.map((l) => (l === null ? "none" : f3(l))).join(" ")}`);
            L.push(`    ${x.audits.map((a) => `${a.audit} ${f3(a.mean)} sd ${f3(a.sd)} [${f3(a.min)}..${f3(a.max)}]`).join(" | ")}; against the autopilot ${x.audits.map((a) => (a.vsAutopilot >= 0 ? "+" : "") + f3(a.vsAutopilot) + (a.offAutopilot ? " (off it)" : " (not off it)")).join(" | ")}`);
            for (const other of Object.keys(x.audits[0].vs)) L.push(`    against the ${x.cell} ${other} replicates: ${x.audits.map((a) => `${f3(a.vs[other].margin)} (needs ${f3(a.vs[other].needs)}: ${a.vs[other].reading})`).join(" | ")}`);
        }
        for (const c of g.cells) L.push(`  WIRING WITHOUT MEMORY ${c.cell} (Addendum 12; REPORTED, NOT JUDGED): the ${c.nReal} real-wiring NO STATE searches against the ${c.nShuffled} shuffled ones, each scored as the mean of its three audits: U ${c.U} of ${c.max}, exact one-sided p ${c.p.toFixed(4)}${c.complete ? "" : " (NOT all searches are in)"}; registered line p <= ${RANK_ALPHA}: ${c.supported ? "MET" : "not met"}`);
    }
    for (const r of v.claim.rows) L.push(`  TWO-PATHWAY ${r.task}: ${r.status}${r.audits ? ` -- aligned ${r.aligned} ${r.alignedPasses ? "PASSES" : "does not pass"}; beats cross ${r.cross} on ${r.crossWins} of 3 audits (${r.audits.map((x) => `${f3(x.diff)} needs ${f3(x.needs)}`).join(" | ")})` : ` -- ${r.why}`}`);
    L.push(`RUNG 4b: ${v.passed} of ${v.assessed} assessed verdict cells PASSED (a pass in one of four is "one of four", not "the wiring works")`);
    L.push(`RUNG 4b TWO-PATHWAY CLAIM: ${v.claim.rows.length === TASK_NAMES.length && v.claim.rows.every((r) => r.status !== "NOT ASSESSED") && TASK_NAMES.every((t) => v.checks[t] && v.checks[t].ok) ? (v.claim.holds ? "HOLDS (a double dissociation)" : "DOES NOT HOLD") : "NOT ASSESSED"}`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "prune-budget": Number, one: String, smoke: Boolean, quiet: Boolean } : { in: String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (the registered stage A: --specs stageA; Addendum 9: --specs lambdaStudy)");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const text = given.specs === "stageA" ? STAGE_A : given.specs === "lambdaStudy" ? LAMBDA_STUDY : given.specs === "replicate" ? REPL_STUDY : given.specs === "lowControls" ? CTRL50_STUDY : given.specs === GENS[2].keyword ? GEN_STUDY[2] : given.specs === GENS[3].keyword ? GEN_STUDY[3] : given.specs || given.one;
    const o = { cmd, specs: text, one: given.one || null, out: given.out || null, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK, pruneBudget: given["prune-budget"] ?? RECIPE.pruneBudget }, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    if (!(Number.isInteger(o.recipe.pruneBudget) && o.recipe.pruneBudget >= 0)) throw new Error(`--prune-budget must be a whole number of 0 or more, got ${o.recipe.pruneBudget}`);
    parseSpecs(o.specs); if (o.one && parseSpecs(o.one).length !== 1) throw new Error("--one takes a single spec");
    return o;
}
const sameRecipe = (rec, o) => ["runs", "iters", "sigma", "maxK", "pruneBudget"].every((k) => rec.recipe[k] === o.recipe[k]);
/**
 * THE COMMAND, as a function: `run` computes the references record of each task it needs (once per file), trains the specs not yet in --out (each in its own process when --workers is above 1, by --one), appends one line each, and prints the report; `report` prints it for a results file.
 * Returns the exit code: 0, 1 a refusal while running, 2 a bad argument. `io` is for the gate: { out, err, readFile, appendFile, exists, runner, refsRunner, spawner }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("trainSubVestibular: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("trainSubVestibular: " + e.message); return 1; }
        if (!records.length) { err("trainSubVestibular: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("trainSubVestibular: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l); return 0;
    }
    const opts = { recipe: o.recipe, smoke: o.smoke }, log = o.quiet ? () => {} : out;
    if (o.one) { const rec = (io.runner || runCircuit)(parseSpecs(o.one)[0], opts, o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("trainSubVestibular: " + e.message); return 1; } }
    const stale = have.filter((r) => !!r.smoke !== o.smoke || (r.family !== "refs" && !sameRecipe(r, o)));
    if (stale.length) { err(`trainSubVestibular: ${o.out} holds ${stale.length} record(s) of another recipe or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), specs = parseSpecs(o.specs), todo = specs.filter((s) => !done.has(specName(s))), tasks = TASK_NAMES.filter((t) => specs.some((s) => s.task === t)), records = [...have];
    log(`[trainSubVestibular] ${specs.length} circuits, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to train; ${o.workers} worker(s); recipe ${o.recipe.runs} x ${o.recipe.iters}${o.smoke ? " (SMOKE)" : ""}`);
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (specs.some((s) => isRepl(s.family)) && !done.has(REFS_REPL)) { keep((io.refsRunner || refsRecord)("P", { ...opts, replicate: true })); log("[trainSubVestibular] references for the replicate audits (Addendum 10) done"); }
    for (const g of [2, 3]) if (specs.some((s) => genOf(s.family) === g) && !done.has(GENS[g].refs)) { keep((io.refsRunner || refsRecord)(GENS[g].task, { ...opts, replicate: g })); log(`[trainSubVestibular] references for the generation ${g} audits (Addendum ${g === 2 ? 12 : 13}) done`); }
    for (const t of tasks) if (!done.has(REFS_NAME(t))) { keep((io.refsRunner || refsRecord)(t, opts)); log(`[trainSubVestibular] references for 4b-${t} done`); }
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo];
    const worker = async () => { while (queue.length) { const s = queue.shift(); const rec = o.workers > 1 ? await spawner(s) : (io.runner || runCircuit)(s, opts, o.quiet ? () => {} : (m) => log(m)); keep(rec); log(`[trainSubVestibular] ${specName(s)} done${rec.asStart ? " (no eligible champion)" : " (champion seed " + rec.champion + ")"}`); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, queue.length || 1)) }, worker));
    for (const l of reportLines(records)) out(l);
    return 0;
}
/** One circuit in a child process (this file's command with --one): resolves the record. */
function runChild(spec, o) {
    return new Promise((resolve, reject) => {
        const args = [path.join(HERE, "trainSubVestibularCmd.mjs"), "run", "--one", specName(spec), "--runs", String(o.recipe.runs), "--iters", String(o.recipe.iters), "--sigma", String(o.recipe.sigma), "--maxK", String(o.recipe.maxK), "--prune-budget", String(o.recipe.pruneBudget), "--quiet", ...(o.smoke ? ["--smoke"] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => { const line = buf.split("\n").find((l) => l.startsWith("RESULT ")); if (!line) reject(new Error(`child for ${specName(spec)} ended with ${code} and no RESULT`)); else resolve(JSON.parse(line.slice(7))); });
    });
}
