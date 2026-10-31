// WebGLEngine/tools/ship/plainNetStudy.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/plainNetStudyCmd.mjs; the gate is tools/ship/plainNetStudy-selfcheck.mjs)
//
// THE PLAIN-NET CONTROL OF RUNG 4b, AS REGISTERED IN brain/PLAIN_NET_CONTROL_WIP.md (the registration and its Amendment 1, both written before this file existed). It asks, on the four verdict cells of rung 4b (P/B, P/whole, E/E, E/whole), whether the extracted fish circuit gives the autopilot-plus-residual pilot
// anything that a plain relu net with the same four senses, the same mirrored readout and the same number of trained weights does not.
//   PILOTS       MN (brain/pilotSubPlainNet.mjs, one hidden layer, weight-matched to the circuit's NO STATE count; 8 a cell) and MG (4-32-32-4, the GPU Brain's width and depth; 4 a cell): 48 pilots, each the 4b recipe unchanged (trainSubVestibular.mjs's search()), search seeds 79000 + 10 x ordinal, init seed 4711 + ordinal
//   COMPARATORS  the 4b champions that already exist (brain/rig-results/*.jsonl keeps their weights): qns / qer / qcl / qdg and rl50 on 4b-P, ens / el50 / el99 on 4b-E, four each a cell, REBUILT by trainSubVestibular.mjs's own policyOf and flown ONCE on each fresh audit; first on their ORIGINAL audits, to show the rebuilt pilot is the trained one (to 1e-5: the records keep weights to six decimals)
//   AUDITS       4b-P seeds 86001-86060 (three blocks of 20 seeds x 3 kinds), 4b-E nominal seeds 88001-88048 (three blocks of 16 seeds x 2 sides x 2 launch times); the autopilot alone is read on them in refs:NP and refs:NE
//   THE TEST     per assessed cell, the 4 REAL NO STATE circuits (qns, ens) against the 8 MN pilots, each scored as the mean of its three audit scores, exact one-sided permutation test on Mann-Whitney U over all 495 splits, SUPPORTED iff p <= 0.05, direction fixed (real above plain). VALIDITY first: MN must beat the autopilot by more than 0.02 on 2 of 3 audits.
//   BESIDE IT    the margin rule per audit (needs the larger of 0.02 and 2 sd of MN), the share of REAL's gain MN keeps; on 4b-P the DECOMPOSITION (the 12 shuffled NO STATE circuits against MN, C(20,12) splits); MG and the leaky circuits reported, not judged.
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";
import * as V from "../../brain/pilotSubVestibular.mjs";
import * as P from "../../brain/pilotSubPlainNet.mjs";
import * as H from "../subVestibularTasks.mjs";
import * as TR from "./trainSubVestibular.mjs";
import { meanOf, sdOf, beats, readRecords, MIN_EDGE } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RIG_DIR = path.resolve(HERE, "..", "..", "brain", "rig-results");
export const RECIPE = TR.RECIPE, AUDITS = TR.AUDITS, RANK_ALPHA = TR.RANK_ALPHA;
export const CELLS = Object.freeze([["P", "B"], ["P", "whole"], ["E", "E"], ["E", "whole"]].map((c) => Object.freeze(c)));
export const CELL_NAMES = Object.freeze(CELLS.map(([t, a]) => `${t}/${a}`));
export const FAMILIES = Object.freeze({ mn: Object.freeze({ id: "mn", n: 8, offset: 0 }), mg: Object.freeze({ id: "mg", n: 4, offset: 8 }) });
export const PER_CELL = 12, SEARCH_BASE = 79000, REAL_N = 4, REPRO_TOL = 1e-5, START_PROBE = 4;
export const AUDIT_SEEDS = Object.freeze({ P: Object.freeze([[86001, 86020], [86021, 86040], [86041, 86060]]), E: Object.freeze([[88001, 88016], [88017, 88032], [88033, 88048]]) });
export const REFS = Object.freeze({ P: "refs:NP", E: "refs:NE" });
/** The comparators: the records they come from, per task, and the group names within them. */
export const COMPARATORS = Object.freeze({
    P: Object.freeze([Object.freeze({ file: "fishVestibularGen2.jsonl", groups: Object.freeze(["qns", "qer", "qcl", "qdg"]) }), Object.freeze({ file: "fishVestibularReplicates.jsonl", groups: Object.freeze(["rl50"]) })]),
    E: Object.freeze([Object.freeze({ file: "fishVestibularGen3.jsonl", groups: Object.freeze(["ens", "el50", "el99"]) })]),
});
export const REAL_GROUP = Object.freeze({ P: "qns", E: "ens" }), SHUFFLED = Object.freeze(["qer", "qcl", "qdg"]);
const f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));
const range = ([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---- jobs: a pilot to train or a comparator to re-fly ---------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The name of a job: a pilot `P/B/mn:3`, a comparator `cmp:P/B/qns:2`. */
export const specName = (s) => (s.kind === "cmp" ? `cmp:${s.task}/${s.arm}/${s.group}:${s.index}` : `${s.task}/${s.arm}/${s.family}:${s.index}`);
/** The name of the 4b record a comparator job is rebuilt from. */
export const sourceSpec = (s) => `${s.task}/${s.arm}/${s.group}:${s.index}`;
/** Where a pilot sits in the fixed order: 12 a cell, MN 0-7 then MG 8-11. */
export const ordinalOf = (s) => {
    const c = CELL_NAMES.indexOf(`${s.task}/${s.arm}`);
    if (c < 0 || !FAMILIES[s.family]) throw new Error(`plainNetStudy.ordinalOf: ${JSON.stringify(s)} is not a pilot of the study`);
    return PER_CELL * c + FAMILIES[s.family].offset + s.index;
};
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
export const initSeedOf = (s) => P.INIT.seed + ordinalOf(s);
const groupsOf = (task) => COMPARATORS[task].flatMap((c) => c.groups);
/** All 48 pilots, in ordinal order. */
export const pilotJobs = () => CELLS.flatMap(([task, arm]) => Object.values(FAMILIES).flatMap((f) => Array.from({ length: f.n }, (_, index) => ({ kind: "pilot", task, arm, family: f.id, index }))));
/** All 64 comparators. */
export const comparatorJobs = () => CELLS.flatMap(([task, arm]) => groupsOf(task).flatMap((group) => Array.from({ length: REAL_N }, (_, index) => ({ kind: "cmp", task, arm, group, index }))));
/** The specs of a list `P/B/mn:0-7,cmp:P/B/qns:0-3,...`; a range expands to its members. */
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`plainNetStudy.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        const m = /^(cmp:)?([A-Z])\/([A-Za-z]+)\/([a-z0-9]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`plainNetStudy.parseSpecs: cannot read ${JSON.stringify(part)} (a pilot is task/arm/mn:K or task/arm/mg:K-L, a comparator cmp:task/arm/group:K-L)`);
        const [, cmp, task, arm, name, a, b] = m, lo = Number(a), hi = b === undefined ? lo : Number(b);
        if (!CELL_NAMES.includes(`${task}/${arm}`)) throw new Error(`plainNetStudy.parseSpecs: ${task}/${arm} is not one of the four cells (${CELL_NAMES.join(", ")})`);
        if (hi < lo) throw new Error(`plainNetStudy.parseSpecs: the range ${a}-${b} runs backwards`);
        const limit = cmp ? REAL_N : (FAMILIES[name] || { n: 0 }).n;
        if (cmp ? !groupsOf(task).includes(name) : !FAMILIES[name]) throw new Error(`plainNetStudy.parseSpecs: ${JSON.stringify(name)} is not a ${cmp ? `comparator group of 4b-${task} (${groupsOf(task).join(", ")})` : `plain-net family (${Object.keys(FAMILIES).join(", ")})`}`);
        if (hi >= limit) throw new Error(`plainNetStudy.parseSpecs: ${part} runs past index ${limit - 1}`);
        for (let index = lo; index <= hi; index++) {
            const s = cmp ? { kind: "cmp", task, arm, group: name, index } : { kind: "pilot", task, arm, family: name, index }, n = specName(s);
            if (seen.has(n)) throw new Error(`plainNetStudy.parseSpecs: ${n} is named twice`); seen.add(n); out.push(s);
        }
    }
    return out;
}

// ---- the pilots, the sets -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let COUNTS = null;
/** The NO STATE weight count of each arm's circuit pilot (591, 655, 85): what MN is matched to. */
export const noStateCount = (arm) => { COUNTS = COUNTS || {}; return COUNTS[arm] || (COUNTS[arm] = V.createVestibularPolicy(TR.armCircuit(arm), arm, { persist: false }).WEIGHT_COUNT); };
export const widthsOf = (s) => (s.family === "mn" ? [P.matchedHidden(noStateCount(s.arm))] : [...P.MG_WIDTHS]);
/** The plain-net pilot of a job: the init draw seeded 4711 + ordinal, the task's scales, the 4b evaluator. */
export const policyOf = (s, scales) => P.createPlainNetPolicy(widthsOf(s), specName(s), { seed: initSeedOf(s), scales, evaluate: (pilot, set) => TR.evalDives(pilot, set) });
const SETS = new Map();
/** The sets of a task for this study: the 4b training and held-out dives and THIS ROUND'S fresh audits a1-a3; `smoke` shrinks each to every eighth dive. */
export function setsFor(task, { smoke = false } = {}) {
    const key = `${task}:${smoke}`; if (SETS.has(key)) return SETS.get(key);
    const base = TR.setsOf(task, { smoke }), mk = task === "P" ? (seeds) => T.KINDS.flatMap((kind) => seeds.map((seed) => TR.diveOf("P", T.scenario(seed, kind)))) : (seeds) => H.hazardDivesFor(seeds).map((d) => TR.diveOf("E", d.sc, d));
    const s = { train: base.train, heldOut: base.heldOut };
    AUDITS.forEach((a, i) => { const dives = mk(range(AUDIT_SEEDS[task][i])); s[a] = smoke ? dives.filter((_, j) => j % 8 === 0) : dives; });
    SETS.set(key, s); return s;
}

// ---- one pilot -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Train and grade one pilot. THE AUDITS ARE READ HERE, ONCE, FOR THE CHAMPION. Returns the record the file keeps. */
export function runPilot(spec, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsFor(spec.task, { smoke: !!opts.smoke }), scales = opts.scales || TR.scalesOf(sets.train);
    const name = specName(spec), Pol = (opts.policyOf || policyOf)(spec, scales), base = seedBaseOf(spec), hand = Pol.handWeights(), startHeld = Pol.evaluate(hand, sets.heldOut), runs = [];
    for (let k = 0; k < recipe.runs; k++) {
        const r = TR.search(Pol, base + k, k, recipe, sets.train), held = Pol.evaluate(r.weights, sets.heldOut);
        runs.push({ ...r, heldOut: held.score, heldEarly: held.early, eligible: held.early <= startHeld.early });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${r.moved} moved weights pruned to ${r.kept} (${r.pruneEvals} evaluations), train ${r.trainScore.toFixed(4)}, held-out ${held.score.toFixed(4)}, ended early ${held.early} (start ${startHeld.early}) ${held.early <= startHeld.early ? "eligible" : "NOT eligible"}`);
    }
    const eligible = runs.filter((r) => r.eligible).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k), c = eligible[0] || null;
    const champion = c ? Object.fromEntries(AUDITS.map((a) => [a, Pol.evaluate(c.weights, sets[a])])) : null;
    return { spec: name, task: spec.task, arm: spec.arm, family: spec.family, index: spec.index, smoke: !!opts.smoke, recipe, seedBase: base, initSeed: initSeedOf(spec), widths: Pol.widths, weightCount: Pol.WEIGHT_COUNT, reach: Pol.reach.pairs, scales, champion: c ? c.seed : null, asStart: !c, startHeldEarly: startHeld.early,
        searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut, heldEarly: r.heldEarly, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        movement: c ? { moved: c.moved, kept: c.kept, largest: Math.max(...Array.from(c.weights, (v, i) => Math.abs(v - hand[i]))) } : null, scores: { champion }, weights: c ? Array.from(c.weights, (v) => Math.round(v * 1e6) / 1e6) : null };
}

// ---- one comparator --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The 4b records the comparators come from, by name: Map(name -> { rec, file }). A file that is missing is an error naming it. */
export function sourceRecords(rigDir = RIG_DIR, readFile = (f) => fs.readFileSync(f, "utf8")) {
    const map = new Map();
    for (const task of Object.keys(COMPARATORS)) for (const { file } of COMPARATORS[task]) {
        let text; try { text = readFile(path.join(rigDir, file)); } catch (e) { throw new Error(`plainNetStudy.sourceRecords: cannot read ${path.join(rigDir, file)}: ${e.message}`); }
        for (const rec of readRecords(text)) if (rec.family !== "refs" && !map.has(rec.spec)) map.set(rec.spec, { rec, file });
    }
    return map;
}
/**
 * Rebuild a 4b champion from its record and fly it: on its ORIGINAL audits (the reproduction check, to REPRO_TOL; skipped, `ok: null`, under --smoke) and once on this round's fresh audits. A circuit with no eligible champion has no weights: its record says so and the reading uses the autopilot's score.
 * Returns { family: "cmp", spec, task, arm, group, index, source, reproduced: { ok, maxDiff, recorded, refly }, scores: { champion }, ... }.
 */
export function flyComparator(job, opts = {}) {
    const src = (opts.source || sourceRecords(opts.rigDir)).get(sourceSpec(job));
    if (!src) throw new Error(`plainNetStudy.flyComparator: ${sourceSpec(job)} is not in the 4b records (${COMPARATORS[job.task].map((c) => c.file).join(", ")})`);
    const { rec, file } = src, head = { family: "cmp", spec: specName(job), task: job.task, arm: job.arm, group: job.group, index: job.index, source: file, smoke: !!opts.smoke, asStart: !rec.weights };
    if (!rec.weights) return { ...head, weightCount: null, reproduced: { ok: true, maxDiff: 0, asStart: true, recorded: null, refly: null }, scores: { champion: null } };
    const Pol = TR.policyOf({ task: job.task, arm: job.arm, family: job.group, index: job.index }, rec.scales), w = Float32Array.from(rec.weights);
    if (Pol.WEIGHT_COUNT !== rec.weights.length) throw new Error(`plainNetStudy.flyComparator: ${sourceSpec(job)} has ${rec.weights.length} weights in its record and ${Pol.WEIGHT_COUNT} in the rebuilt pilot`);
    const fresh = opts.sets || setsFor(job.task, { smoke: !!opts.smoke });
    let reproduced;
    if (opts.smoke) reproduced = { ok: null, maxDiff: null, skipped: "smoke", recorded: null, refly: null };
    else {
        const original = TR.setsOf(job.task, { replicate: TR.replGenOf(rec.family) }), recorded = Object.fromEntries(AUDITS.map((a) => [a, rec.scores.champion[a].score])), refly = Object.fromEntries(AUDITS.map((a) => [a, Pol.evaluate(w, original[a]).score])), maxDiff = Math.max(...AUDITS.map((a) => Math.abs(refly[a] - recorded[a])));
        reproduced = { ok: maxDiff <= REPRO_TOL, maxDiff, recorded, refly };
    }
    return { ...head, weightCount: Pol.WEIGHT_COUNT, reproduced, scores: { champion: Object.fromEntries(AUDITS.map((a) => [a, Pol.evaluate(w, fresh[a])])) } };
}

// ---- the references record ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The autopilot alone on this round's audits, the 4b task re-check on the training dives, and the START CHECK of every plain-net pilot of the task's cells (the untrained pilot scores the autopilot on four training dives). */
export function refsRecord(task, opts = {}) {
    const sets = opts.sets || setsFor(task, { smoke: !!opts.smoke }), scales = opts.scales || TR.scalesOf(sets.train), arms = CELLS.filter((c) => c[0] === task).map((c) => c[1]);
    const rec = TR.refsRecord(task, { sets, scales, smoke: !!opts.smoke }), mk = opts.policyOf || policyOf;
    const probe = sets.train.slice(0, START_PROBE), want = TR.evalDives(AS.pilot(), probe).score;
    rec.spec = REFS[task]; rec.audits = AUDIT_SEEDS[task];
    rec.startCheck = arms.flatMap((arm) => Object.keys(FAMILIES).map((family) => { const Pol = mk({ kind: "pilot", task, arm, family, index: 0 }, scales), got = Pol.evaluate(Pol.handWeights(), probe).score; return { arm: `${arm}/${family}`, same: got === want || Math.abs(got - want) < 1e-9 }; }));
    return rec;
}

// ---- the readings --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const eff = (rec, refs) => TR.effectiveOf(rec, refs);
const stats = (v) => ({ mean: meanOf(v), sd: sdOf(v), min: Math.min(...v), max: Math.max(...v), n: v.length });
const readingOf = (b) => (b.margin > b.needs ? "ahead" : b.margin < -b.needs ? "behind" : "tie");
/** The members of a group in a cell, by index: pilots by family, comparators by group. */
const members = (recs, cell, g) => recs.filter((r) => `${r.task}/${r.arm}` === cell && (r.family === "cmp" ? r.group === g : r.family === g));
/**
 * The reading of one cell from its records and its task's references record: validity, the registered test, the margin view, the share kept, the decomposition (4b-P), and every other group's mean beside. Never throws on a partial file: a cell without its 4 REAL and 8 MN circuits is INCOMPLETE and not assessed.
 */
export function cellReading(cell, recs, refs) {
    const task = cell[0], real = members(recs, cell, REAL_GROUP[task]), plain = members(recs, cell, "mn"), mg = members(recs, cell, "mg");
    const out = { cell, n: { real: real.length, plain: plain.length, mg: mg.length }, status: null, audits: [], validity: null, test: null, decomposition: null, groups: [], stuck: plain.filter((r) => r.asStart).length };
    const vals = (rs) => Object.fromEntries(AUDITS.map((a) => [a, rs.map((r) => eff(r, refs)[a].score)])), per = (rs) => rs.map((r) => meanOf(AUDITS.map((a) => eff(r, refs)[a].score)));
    if (real.length !== REAL_N || plain.length !== FAMILIES.mn.n) { out.status = `NOT ASSESSED: INCOMPLETE (${real.length} of ${REAL_N} real, ${plain.length} of ${FAMILIES.mn.n} plain-net circuits)`; return out; }
    const R = vals(real), N = vals(plain);
    out.audits = AUDITS.map((a) => {
        const ap = refs.autopilot[a].score, r = stats(R[a]), p = stats(N[a]), b = beats(r.mean, N[a]), gainR = r.mean - ap, gainP = p.mean - ap;
        return { audit: a, autopilot: ap, real: r, plain: p, plainOffAutopilot: gainP > MIN_EDGE, margin: { margin: b.margin, needs: b.needs, reading: readingOf(b) }, kept: gainR > MIN_EDGE ? gainP / gainR : null };
    });
    out.validity = { learned: out.audits.filter((x) => x.plainOffAutopilot).length >= 2 };
    const t = TR.exactRankP(per(real), per(plain));
    out.test = { U: t.U, max: t.max, p: t.p, splits: t.splits, supported: t.p <= RANK_ALPHA, plainAhead: out.audits.filter((x) => x.margin.reading === "behind").length >= 2 };
    out.status = out.validity.learned ? (out.test.supported ? "SUPPORTED" : "NOT SUPPORTED") : "NOT ASSESSED: THE CONTROL DID NOT LEARN";
    if (task === "P") {
        const shuf = SHUFFLED.flatMap((g) => members(recs, cell, g));
        if (shuf.length === SHUFFLED.length * REAL_N) { const d = TR.exactRankP(per(shuf), per(plain)); out.decomposition = { U: d.U, max: d.max, p: d.p, splits: d.splits, supported: d.p <= RANK_ALPHA, n: shuf.length }; }
    }
    for (const g of [...groupsOf(task), "mg"]) {
        const rs = members(recs, cell, g); if (!rs.length || g === REAL_GROUP[task]) continue;
        const V_ = vals(rs);
        out.groups.push({ group: g, n: rs.length, stuck: rs.filter((r) => r.asStart).length, audits: AUDITS.map((a) => { const s = stats(V_[a]), b = beats(meanOf(R[a]), V_[a]), c = beats(meanOf(N[a]), V_[a]); return { audit: a, mean: s.mean, sd: s.sd, vsAutopilot: s.mean - refs.autopilot[a].score, realVs: readingOf(b), plainVs: readingOf(c) }; }) });
    }
    return out;
}
/** The overall line from the four cells' statuses: { word, assessed, supported }. */
export function overallOf(cells) {
    const assessed = cells.filter((c) => !c.status.startsWith("NOT ASSESSED")), supported = assessed.filter((c) => c.status === "SUPPORTED").length;
    const word = assessed.length === 0 ? "NOT ASSESSED" : supported === 0 ? "NOT SUPPORTED" : supported === CELLS.length ? "SUPPORTED" : "MIXED";
    return { word, assessed: assessed.length, supported };
}
/** The checks of the whole study from a results file: the two references records, the comparator reproduction. { ok, rows }. */
export function studyChecks(records) {
    const rows = []; let ok = true;
    for (const task of ["P", "E"]) {
        const refs = records.find((r) => r.spec === REFS[task]);
        if (!refs) { rows.push({ name: `REFERENCES 4b-${task}`, ok: false, text: `no ${REFS[task]} record in the file` }); ok = false; continue; }
        let c; try { c = TR.checksOf(refs); } catch (e) { rows.push({ name: `REFERENCES 4b-${task}`, ok: false, text: `the ${REFS[task]} record cannot be read: ${e.message}` }); ok = false; continue; }
        for (const r of c.rows) rows.push({ name: `4b-${task}: ${r.name}`, ok: r.ok, text: r.text }); if (!c.ok) ok = false;
    }
    const cmp = records.filter((r) => r.family === "cmp"), R = (r) => r.reproduced || { ok: false, maxDiff: Infinity }, bad = cmp.filter((r) => R(r).ok === false), skipped = cmp.filter((r) => R(r).ok === null), maxDiff = Math.max(0, ...cmp.map((r) => R(r).maxDiff).filter((d) => d !== null && Number.isFinite(d)));
    const repro = cmp.length > 0 && bad.length === 0;
    rows.push({ name: "COMPARATOR REPRODUCTION", ok: repro, text: cmp.length === 0 ? "no comparator in the file" : skipped.length === cmp.length ? `NOT CHECKED: all ${cmp.length} comparator(s) were flown under --smoke, and the recorded scores are of full audits` : bad.length ? `${bad.length} of ${cmp.length} comparator(s) do not reproduce their recorded audit scores to ${REPRO_TOL}: ${bad.map((r) => `${r.spec} (${R(r).maxDiff.toExponential(2)})`).join(", ")}` : `${cmp.length - skipped.length} of ${cmp.length} comparator champions, rebuilt from their records and flown on their original audits, reproduce the recorded scores to ${REPRO_TOL} (largest difference ${maxDiff.toExponential(2)})${skipped.length ? `; ${skipped.length} skipped (smoke)` : ""}` });
    if (!repro) ok = false;
    return { ok, rows };
}
/** The report of a results file, as lines. The checks come first; if one fails the verdicts are marked NOT READ. */
export function reportLines(records) {
    const L = [], refsBy = { P: records.find((r) => r.spec === REFS.P), E: records.find((r) => r.spec === REFS.E) }, checks = studyChecks(records), pilots = records.filter((r) => r.family === "mn" || r.family === "mg");
    L.push("THE PLAIN-NET CONTROL OF RUNG 4b (registered in brain/PLAIN_NET_CONTROL_WIP.md): does the extracted circuit give the autopilot-plus-residual pilot anything a plain relu net with the same senses and the same trained-weight count does not?");
    L.push(`${pilots.length} of ${pilotJobs().length} plain-net pilots and ${records.filter((r) => r.family === "cmp").length} of ${comparatorJobs().length} comparators in the file`);
    for (const r of checks.rows) L.push(`  CHECK ${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.text}`);
    if (!checks.ok) { L.push("A CHECK FAILED: it is stated above and the verdicts below are NOT READ."); return L; }
    const cells = CELL_NAMES.map((cell) => cellReading(cell, records, refsBy[cell[0]]));
    for (const c of cells) {
        L.push(`CELL ${c.cell}: ${c.status}`);
        if (!c.audits.length) continue;
        const sd = (s) => `${f3(s.mean)} (sd ${f3(s.sd)}, ${f3(s.min)} to ${f3(s.max)})`;
        for (const x of c.audits) L.push(`  ${x.audit}: autopilot ${f3(x.autopilot)} | REAL ${sd(x.real)} | PLAIN ${sd(x.plain)}${x.plainOffAutopilot ? "" : " (NOT off the autopilot)"} | REAL against PLAIN: ${x.margin.reading} (${f3(x.margin.margin)} against ${f3(x.margin.needs)}) | PLAIN keeps ${x.kept === null ? "n/a" : Math.round(100 * x.kept) + " percent"} of REAL's gain`);
        L.push(`  VALIDITY: the plain net ${c.validity.learned ? "learned (off the autopilot by more than 0.02 on at least 2 audits)" : "DID NOT LEARN (fewer than 2 audits)"}; ${c.stuck} of ${c.n.plain} plain-net circuits ended with no eligible champion`);
        L.push(`  REGISTERED TEST: REAL above PLAIN, U ${c.test.U} of ${c.test.max}, exact one-sided p ${c.test.p.toFixed(4)} over ${c.test.splits} splits -> ${c.test.supported ? "SUPPORTED" : "not supported"}${c.test.plainAhead ? "; the PLAIN NET is AHEAD of REAL by the margin rule on at least 2 audits" : ""}`);
        if (c.decomposition) L.push(`  DECOMPOSITION (reported): the ${c.decomposition.n} shuffled NO STATE circuits above PLAIN, U ${c.decomposition.U} of ${c.decomposition.max}, p ${c.decomposition.p.toFixed(4)} over ${c.decomposition.splits} splits -> ${c.decomposition.supported ? "above" : "not above"}`);
        for (const g of c.groups) L.push(`  ${g.group} (${g.n}${g.stuck ? `, ${g.stuck} stuck` : ""}): ${g.audits.map((a) => `${a.audit} ${f3(a.mean)} (sd ${f3(a.sd)}; off the autopilot ${f3(a.vsAutopilot)}; REAL ${a.realVs}, PLAIN ${a.plainVs})`).join(" | ")}`);
    }
    const o = overallOf(cells);
    L.push(`OVERALL: ${o.word} (${o.supported} of ${o.assessed} assessed cells supported; ${CELLS.length} cells in all)`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "prune-budget": Number, "rig-dir": String, one: String, smoke: Boolean, quiet: Boolean } : { in: String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (all, pilots, comparators, or a list such as P/B/mn:0-7,cmp:P/B/qns:0-3)");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const text = given.specs === "all" ? [...pilotJobs(), ...comparatorJobs()].map(specName).join(",") : given.specs === "pilots" ? pilotJobs().map(specName).join(",") : given.specs === "comparators" ? comparatorJobs().map(specName).join(",") : given.specs || given.one;
    const o = { cmd, specs: text, one: given.one || null, out: given.out || null, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK, pruneBudget: given["prune-budget"] ?? RECIPE.pruneBudget }, rigDir: given["rig-dir"] || RIG_DIR, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    if (!(Number.isInteger(o.recipe.pruneBudget) && o.recipe.pruneBudget >= 0)) throw new Error(`--prune-budget must be a whole number of 0 or more, got ${o.recipe.pruneBudget}`);
    parseSpecs(o.specs); if (o.one && parseSpecs(o.one).length !== 1) throw new Error("--one takes a single spec");
    return o;
}
const sameRecipe = (rec, o) => ["runs", "iters", "sigma", "maxK", "pruneBudget"].every((k) => rec.recipe[k] === o.recipe[k]);
/**
 * THE COMMAND, as a function: `run` writes the references record of each task it needs (once per file), then trains the pilots and re-flies the comparators not yet in --out (each job in its own process when --workers is above 1, by --one), appending one line each, and prints the report; `report` prints it for a results file.
 * Returns the exit code: 0, 1 a refusal while running, 2 a bad argument. `io` is for the gate: { out, err, readFile, appendFile, exists, runner, refsRunner, spawner }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("plainNetStudy: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("plainNetStudy: " + e.message); return 1; }
        if (!records.length) { err("plainNetStudy: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("plainNetStudy: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l); return 0;
    }
    const opts = { recipe: o.recipe, smoke: o.smoke, rigDir: o.rigDir }, log = o.quiet ? () => {} : out, runJob = (s, lg) => (io.runner ? io.runner(s, opts, lg) : s.kind === "cmp" ? flyComparator(s, opts) : runPilot(s, opts, lg));
    if (o.one) { const rec = runJob(parseSpecs(o.one)[0], o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("plainNetStudy: " + e.message); return 1; } }
    const stale = have.filter((r) => !!r.smoke !== o.smoke || (r.family !== "refs" && r.family !== "cmp" && !sameRecipe(r, o)));
    if (stale.length) { err(`plainNetStudy: ${o.out} holds ${stale.length} record(s) of another recipe or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const specs = parseSpecs(o.specs), done = new Set(have.map((r) => r.spec)), todo = specs.filter((s) => !done.has(specName(s))), tasks = ["P", "E"].filter((t) => specs.some((s) => s.task === t)), records = [...have];
    log(`[plainNetStudy] ${specs.length} jobs, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to run; ${o.workers} worker(s); recipe ${o.recipe.runs} x ${o.recipe.iters}${o.smoke ? " (SMOKE)" : ""}`);
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    for (const t of tasks) if (!done.has(REFS[t])) { keep((io.refsRunner || refsRecord)(t, opts)); log(`[plainNetStudy] references for 4b-${t} done`); }
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo.filter((s) => s.kind === "pilot"), ...todo.filter((s) => s.kind === "cmp")];
    const worker = async () => { while (queue.length) { const s = queue.shift(), rec = o.workers > 1 ? await spawner(s) : runJob(s, o.quiet ? () => {} : (m) => log(m)); keep(rec); log(`[plainNetStudy] ${specName(s)} done${s.kind === "cmp" ? (rec.reproduced.ok === false ? " (DOES NOT REPRODUCE)" : "") : rec.asStart ? " (no eligible champion)" : " (champion seed " + rec.champion + ")"}`); } };
    try { await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, queue.length || 1)) }, worker)); } catch (e) { err("plainNetStudy: " + e.message + " (the records finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    for (const l of reportLines(records)) out(l);
    return 0;
}
/** One job in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(spec, o, script = path.join(HERE, "plainNetStudyCmd.mjs")) {
    return new Promise((resolve, reject) => {
        const args = [script, "run", "--one", specName(spec), "--runs", String(o.recipe.runs), "--iters", String(o.recipe.iters), "--sigma", String(o.recipe.sigma), "--maxK", String(o.recipe.maxK), "--prune-budget", String(o.recipe.pruneBudget), "--rig-dir", o.rigDir, "--quiet", ...(o.smoke ? ["--smoke"] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => {
            const line = buf.split("\n").find((l) => l.startsWith("RESULT "));
            if (!line) return reject(new Error(`child for ${specName(spec)} ended with ${code} and no RESULT`));
            try { resolve(JSON.parse(line.slice(7))); } catch (e) { reject(new Error(`child for ${specName(spec)} printed a RESULT that is not JSON: ${e.message}`)); }
        });
    });
}
