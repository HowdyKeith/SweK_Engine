// WebGLEngine/tools/ship/trainNeedsCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the library; the command is tools/ship/trainNeedsCircuitCmd.mjs; the gate is tools/ship/trainNeedsCircuit-selfcheck.mjs)
//
// PIECE 4 OF THE NEEDS-AND-LIMITS IDEA, AS REGISTERED IN brain/NEEDS_AND_LIMITS.md ("Round 3" and its Amendments 1 and 2, written before any of this): the survey run (brain/needsTask.mjs) flown by a pilot whose decisions come from a circuit with memory (brain/pilotNeedsCircuit.mjs), the real heading loop
// against its controls and against the hand-written rules. This file trains each circuit by the recipe of rungs 3 and 4a and grades the family by the registered rules; it imports the arithmetic of tools/ship/trainSubCircuits.mjs and does not change it.
//   SPEC       `cx` (the circuit as vendored), `nostate` (the real wiring, state zeroed before every update), `withheld` (the real wiring, the charge/strain/damage/flood inputs zeroed), and `er:K`, `layer:K`, `degree:K` (the K-th control of that family). The registered study is `cx,nostate,withheld,er:0-2,layer:0-2,degree:0-2` (12 circuits).
//   CONDITION  `noisy` (the registered primary: the charge gauge reads with noise sd 0.1 at 1 Hz) or `clean` (cx, nostate and withheld only, as the check that the clean task cannot tell memory from none). One results file per condition.
//   THE RECIPE the sparse (1+1)-ES of rung 4a: RUNS searches x ITERS children, sigma, 1 to maxK weights a child, then a PRUNE toward the start by block halving with a budget of evaluations; fitness the mean survey-run score on TRAIN_SMALL (16 dives). ELIGIBLE: crushed in no more POOL runs than the start (the untrained pilot, which IS GUARDED-OBS). CHAMPION: the eligible search with the best HELD_OUT
//              mean; none -> the circuit is scored as its start. The champion is scored ONCE on each of the three audits (AUDIT, AUDIT2, RESERVE: seeds 51-62, 71-82, 91-102).
//   THE VERDICTS (registered, section 8): a pilot A beats B on an audit iff mean(A) - mean(B) > max(0.02, 2 sd of B's family). WIRING: PASS iff cx beats ER, TYPE-BLOCK and DEGREE on all three audits; FAIL iff against the strongest family it wins on fewer than two audits; else IN BETWEEN; NOT ASSESSED below three finished controls a family.
//              RULE: cx beats GUARDED on every audit by more than max(0.02, 2 se of the paired difference) and is crushed in no more audit runs. NO STATE and WITHHELD: reported by the same margin rule. THE FIRST LINES: the START CHECK, the MEMORY-NEED CHECK (noisy), the OBSERVATION-ONLY CHECK (clean) and the TASK RE-CHECK; a failure is stated before any verdict.
// Pure apart from the files it reads and the processes it starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as P from "../../brain/pilotNeedsCircuit.mjs";
import * as C from "../../brain/pilotSubCircuit.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { meanOf, sdOf, beats, readRecords, MIN_EDGE, SD_FACTOR, MIN_CONTROLS } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CIRCUIT_FILE = path.resolve(HERE, "..", "..", "vendor", "hemibrain", "hemibrain-cx-heading-loop.json");
export const RECIPE = Object.freeze({ runs: 4, iters: 300, sigma: 0.3, maxK: 4, pruneBudget: 60 });
export const SEARCH_BASE = 61000, MAX_INDEX = 19;
export const FAMILIES = Object.freeze(["nostate", "withheld", "er", "layer", "degree"]), VERDICT_FAMILIES = Object.freeze(["er", "layer", "degree"]);
export const CONTROL_BASE = Object.freeze({ er: 1000, layer: 2000, degree: 3000 });
export const STUDY = "cx,nostate,withheld,er:0-2,layer:0-2,degree:0-2", CLEAN_STUDY = "cx,nostate,withheld";
export const AUDITS = Object.freeze(["audit", "audit2", "reserve"]);
export const CONDITIONS = Object.freeze({ noisy: T.GAUGE, clean: null });
export { MIN_EDGE, SD_FACTOR, MIN_CONTROLS };
export const REFERENCE_NAMES = Object.freeze(["SPIN", "DIRECT", "HULLONLY", "GUARDED", "GUARDED_1T", "GUARDED_OBS", "GUARDED_FILTER"]);
const REFERENCE = { SPIN: T.SPIN, DIRECT: T.DIRECT, HULLONLY: T.HULLONLY, GUARDED: T.GUARDED, GUARDED_1T: T.GUARDED_1T, GUARDED_OBS: T.GUARDED_OBS, GUARDED_FILTER: T.GUARDED_FILTER };
const NAMES = { nostate: "NO STATE", withheld: "WITHHELD", er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE" };

/** The sets of the registration; `smoke` shrinks every one to a few dives. THE AUDITS ARE READ ONLY BY finish() (for a champion) and refsRecord() (for the reference rules, which select nothing). */
export function setsOf({ smoke = false } = {}) {
    const s = { train: T.TRAIN_SMALL_SET, heldOut: T.HELD_OUT_SET, pool: T.POOL_SET, audit: T.AUDIT_SET, audit2: T.AUDIT2_SET, reserve: T.RESERVE_SET };
    return smoke ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.filter((_, i) => i % 8 === 0)])) : s;
}

// ---- specs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseSpecs(text) {
    const out = [], seen = new Set();
    for (const raw of String(text).split(",")) {
        const part = raw.trim(); if (!part) throw new Error(`trainNeedsCircuit.parseSpecs: an empty spec in ${JSON.stringify(text)}`);
        if (part === "cx") { if (seen.has("cx")) throw new Error("trainNeedsCircuit.parseSpecs: cx is named twice"); seen.add("cx"); out.push({ family: "cx", index: 0 }); continue; }
        if (part === "nostate" || part === "withheld") { if (seen.has(part)) throw new Error(`trainNeedsCircuit.parseSpecs: ${part} is named twice`); seen.add(part); out.push({ family: part, index: 0 }); continue; }
        const m = /^([a-z]+):(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new Error(`trainNeedsCircuit.parseSpecs: cannot read ${JSON.stringify(part)} (a spec is cx, nostate, withheld, or family:K or family:K-L)`);
        if (!VERDICT_FAMILIES.includes(m[1])) throw new Error(`trainNeedsCircuit.parseSpecs: unknown family ${JSON.stringify(m[1])} (known: cx, nostate, withheld, ${VERDICT_FAMILIES.join(", ")})`);
        const lo = Number(m[2]), hi = m[3] === undefined ? lo : Number(m[3]);
        if (hi < lo) throw new Error(`trainNeedsCircuit.parseSpecs: the range ${JSON.stringify(part)} runs backwards`);
        if (hi > MAX_INDEX) throw new Error(`trainNeedsCircuit.parseSpecs: ${JSON.stringify(part)} is past index ${MAX_INDEX}`);
        for (let k = lo; k <= hi; k++) { const name = `${m[1]}:${k}`; if (seen.has(name)) throw new Error(`trainNeedsCircuit.parseSpecs: ${name} is named twice`); seen.add(name); out.push({ family: m[1], index: k }); }
    }
    return out;
}
export const specName = (s) => (s.family === "cx" || s.family === "nostate" || s.family === "withheld" ? s.family : `${s.family}:${s.index}`);
/** Where a spec sits in the fixed order cx, nostate, withheld, er 0-19, layer 0-19, degree 0-19: the first search seed is SEARCH_BASE + 10 x that. The condition does not change it (clean and noisy searches start from the same seeds). */
export const ordinalOf = (s) => (s.family === "cx" ? 0 : s.family === "nostate" ? 1 : s.family === "withheld" ? 2 : 3 + VERDICT_FAMILIES.indexOf(s.family) * (MAX_INDEX + 1) + s.index);
export const seedBaseOf = (s) => SEARCH_BASE + 10 * ordinalOf(s);
export function circuitFor(spec, circuit) { return VERDICT_FAMILIES.includes(spec.family) ? C.CONTROLS[spec.family](circuit, CONTROL_BASE[spec.family] + spec.index) : circuit; }
export function loadCircuit(file = CIRCUIT_FILE) { const j = JSON.parse(fs.readFileSync(file, "utf8")); return { neurons: j.neurons, edges: j.edges, io: j.io }; }
export const policyOf = (spec, circuit) => P.createNeedsPolicy(circuitFor(spec, circuit), specName(spec), { persist: spec.family !== "nostate", withheld: spec.family === "withheld" });

// ---- evaluation and one search -----------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A summary of an evaluate() result that a record can keep: { score, crashed, stranded, runs: [{ kind, score, crushed }], byKind }. */
export const summary = (e) => ({ score: e.score, crashed: e.crashed, stranded: e.stranded, runs: e.runs.map((r) => ({ kind: r.kind, score: r.score, crushed: !!r.crushed })), byKind: Object.fromEntries(Object.entries(e.byKind).map(([k, v]) => [k, { score: v.score, crushed: v.crushed, stranded: v.stranded }])) });
/** `Pol.evaluate` is a seam for the gate (a stub that counts and remembers its calls); a real policy has none. */
export const evaluateW = (Pol, w, set, gauge) => (Pol.evaluate || T.evaluate)(Pol.pilotFor(w), set, { gauge });

/** One search of the recipe from the start weights; returns { k, seed, weights, trainScore, improved, neutral, moved, kept, pruneEvals }. */
export function search(Pol, seed, k, recipe, trainSet, gauge) {
    const rng = mulberry(seed), hand = Pol.handWeights(), ev = (w) => evaluateW(Pol, w, trainSet, gauge).score;
    let best = Float32Array.from(hand), bestScore = ev(best), improved = 0, neutral = 0;
    for (let i = 1; i <= recipe.iters; i++) {
        const cand = Pol.mutate(best, recipe.sigma, rng, recipe.maxK), score = ev(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
    }
    const movedIdx = []; for (let i = 0; i < best.length; i++) if (best[i] !== hand[i]) movedIdx.push(i);
    // the prune toward the start by block halving: put a block of moved weights back; keep the reset if the train score does not fall
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

/** Train and grade one circuit. Returns the record the file keeps. */
export function runCircuit(spec, circuit, opts = {}, log = () => {}) {
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf({ smoke: !!opts.smoke }), condition = opts.condition || "noisy", gauge = CONDITIONS[condition];
    if (!(condition in CONDITIONS)) throw new Error(`trainNeedsCircuit.runCircuit: condition ${JSON.stringify(condition)} (noisy or clean)`);
    const name = specName(spec), Pol = (opts.policyOf || policyOf)(spec, circuit), base = seedBaseOf(spec), hand = Pol.handWeights(), startPool = evaluateW(Pol, hand, sets.pool, gauge);
    const runs = [];
    for (let k = 0; k < recipe.runs; k++) {
        const r = search(Pol, base + k, k, recipe, sets.train, gauge);
        const heldOut = evaluateW(Pol, r.weights, sets.heldOut, gauge), pool = evaluateW(Pol, r.weights, sets.pool, gauge);
        runs.push({ ...r, heldOut: heldOut.score, poolCrashed: pool.crashed, eligible: pool.crashed <= startPool.crashed });
        log(`  ${name}: search ${k + 1}/${recipe.runs} (seed ${base + k}): ${r.moved} moved weights pruned to ${r.kept} (${r.pruneEvals} evaluations), train ${r.trainScore.toFixed(4)}, held-out ${heldOut.score.toFixed(4)}, pool crushed ${pool.crashed} (start ${startPool.crashed}) ${pool.crashed <= startPool.crashed ? "eligible" : "NOT eligible"}`);
    }
    const eligible = runs.filter((r) => r.eligible).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k), c = eligible[0] || null;
    // THE AUDITS ARE READ HERE, ONCE, FOR THE CHAMPION; a circuit with no champion is scored as its start (the reference GUARDED_OBS), which the verdict takes from the references record
    const champion = c ? Object.fromEntries(AUDITS.map((a) => [a, summary(evaluateW(Pol, c.weights, sets[a], gauge))])) : null;
    return { spec: name, family: spec.family, index: spec.index, condition, smoke: !!opts.smoke, recipe, seedBase: base, weightCount: Pol.WEIGHT_COUNT, champion: c ? c.seed : null, asStart: !c,
        startPoolCrashed: startPool.crashed, searches: runs.map((r) => ({ k: r.k, seed: r.seed, trainScore: r.trainScore, heldOut: r.heldOut, poolCrashed: r.poolCrashed, eligible: r.eligible, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept })),
        movement: c ? { moved: c.moved, kept: c.kept, largest: Math.max(...Array.from(c.weights, (v, i) => Math.abs(v - hand[i]))) } : null, scores: { champion }, weights: c ? Array.from(c.weights, (v) => Math.round(v * 1e6) / 1e6) : null };
}

// ---- the references record (computed once per condition; reads the audits for rules that select nothing) ----------------------------------------------------------------------------
/** The reference rules on the three audits under a condition, the START CHECK (the untrained cx pilot against GUARDED-OBS on four baseline runs), and nothing else: the checks are READ from this record by `checksOf`. */
export function refsRecord(circuit, opts = {}) {
    const sets = opts.sets || setsOf({ smoke: !!opts.smoke }), condition = opts.condition || "noisy", gauge = CONDITIONS[condition], ref = {};
    for (const n of REFERENCE_NAMES) ref[n] = Object.fromEntries(AUDITS.map((a) => [a, summary(T.evaluate(REFERENCE[n], sets[a], { gauge }))]));
    const Pol = policyOf({ family: "cx", index: 0 }, circuit), hand = Pol.handWeights(), start = [], cases = [["far", 503, false], ["both", 501, true], ["deep", 502, false], ["plain", 501, true]];
    for (const [kind, seed, withGauge] of cases) { const g = withGauge ? T.GAUGE : null, a = T.fly(Pol.pilotFor(hand), T.scenario(seed, kind), { gauge: g }), b = T.fly(T.GUARDED_OBS, T.scenario(seed, kind), { gauge: g }); start.push({ kind, seed, gauge: !!g, same: a.fingerprint === b.fingerprint && a.score === b.score }); }
    return { family: "refs", spec: "refs", condition, smoke: !!opts.smoke, references: ref, startCheck: start };
}

// ---- the checks, the verdicts, the report --------------------------------------------------------------------------------------------------------------------------------------------------
const kindsOf = (s, kinds) => ({ runs: s.runs.filter((r) => kinds.includes(r.kind)) });
const margin = (p) => Math.max(MIN_EDGE, SD_FACTOR * p.se);
/** The four registered checks from a references record: { ok, lines, ... }. */
export function checksOf(refs) {
    const R = refs.references, FN = ["far", "both"], rows = [];
    const startOk = refs.startCheck.length > 0 && refs.startCheck.every((x) => x.same);
    rows.push({ name: "START CHECK", ok: startOk, text: `the untrained pilot is GUARDED-OBS on ${refs.startCheck.length} runs: ${refs.startCheck.map((x) => `${x.kind}${x.seed}${x.gauge ? "+gauge" : ""} ${x.same ? "same" : "DIFFERENT"}`).join(", ")}` });
    const fm = AUDITS.map((a) => T.paired(kindsOf(R.GUARDED_FILTER[a], FN), kindsOf(R.GUARDED_OBS[a], FN))), gm = AUDITS.map((a) => T.paired(kindsOf(R.GUARDED[a], FN), kindsOf(R.GUARDED_1T[a], FN)));
    if (refs.condition === "noisy") rows.push({ name: "MEMORY-NEED CHECK (noisy gauge)", ok: fm.every((p) => p.diff > margin(p)), text: `GUARDED-FILTER minus GUARDED-OBS on far and both: ${fm.map((p) => `${p.diff.toFixed(3)} (needs ${margin(p).toFixed(3)})`).join(" | ")}` });
    else rows.push({ name: "HYSTERESIS CHECK (clean gauge)", ok: gm.every((p) => p.diff > margin(p)), text: `GUARDED minus GUARDED-1T on far and both: ${gm.map((p) => `${p.diff.toFixed(3)} (needs ${margin(p).toFixed(3)})`).join(" | ")}` });
    const oo = AUDITS.map((a) => T.paired(kindsOf(R.GUARDED_OBS[a], FN), kindsOf(R.GUARDED[a], FN)));
    rows.push({ name: "OBSERVATION-ONLY CHECK", ok: true, info: true, fires: refs.condition === "clean" && oo.every((p) => Math.abs(p.diff) <= margin(p)), text: `GUARDED-OBS minus GUARDED on far and both: ${oo.map((p) => `${p.diff.toFixed(3)} (tie within ${margin(p).toFixed(3)})`).join(" | ")}${refs.condition === "clean" && oo.every((p) => Math.abs(p.diff) <= margin(p)) ? " -- THE CLEAN TASK NEEDS NO INTERNAL STATE" : ""}` });
    const sp = AUDITS.map((a) => T.paired(kindsOf(R.GUARDED[a], FN), kindsOf(R.SPIN[a], FN))), dc = AUDITS.map((a) => R.DIRECT[a].runs.filter((r) => r.kind === "deep" && r.crushed).length), deepN = AUDITS.map((a) => R.DIRECT[a].runs.filter((r) => r.kind === "deep").length);
    rows.push({ name: "TASK RE-CHECK", ok: sp.every((p) => p.diff > margin(p)) && dc.every((n, i) => n * 12 >= 3 * deepN[i]), text: `GUARDED minus SPIN on far and both: ${sp.map((p) => `${p.diff.toFixed(3)} (needs ${margin(p).toFixed(3)})`).join(" | ")}; DIRECT crushed in the deep runs: ${dc.map((n, i) => `${n} of ${deepN[i]}`).join(" | ")} (needs a quarter)` });
    return { ok: rows.filter((r) => !r.info).every((r) => r.ok), rows };
}

/** A circuit's summary per audit: the champion's, or (no champion) its start's, which is the reference GUARDED-OBS. */
export const effectiveOf = (rec, refs) => Object.fromEntries(AUDITS.map((a) => [a, rec.scores.champion ? rec.scores.champion[a] : refs.references.GUARDED_OBS[a]]));
const f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));

/** The verdicts over the records of one condition: { wiring, rule, pairs, families, checks }. */
export function verdictOf(records, refs) {
    const rs = records.filter((r) => r.family !== "refs"), cx = rs.find((r) => r.family === "cx");
    if (!cx || !refs) return { cx: null, wiring: { verdict: "NOT ASSESSED", why: !refs ? "no references record" : "no cx record" }, rule: null, pairs: {}, families: {}, checks: refs ? checksOf(refs) : null };
    const F = effectiveOf(cx, refs), eff = (r) => effectiveOf(r, refs), families = {}, strongest = {};
    for (const fam of VERDICT_FAMILIES) { const recs = rs.filter((r) => r.family === fam); if (!recs.length) continue; families[fam] = { n: recs.length, audits: {} }; for (const a of AUDITS) families[fam].audits[a] = { F: F[a].score, ...beats(F[a].score, recs.map((r) => eff(r)[a].score)) }; }
    const missing = VERDICT_FAMILIES.filter((f) => !families[f] || families[f].n < MIN_CONTROLS);
    let wiring;
    if (missing.length) wiring = { verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls` };
    else {
        for (const a of AUDITS) strongest[a] = VERDICT_FAMILIES.reduce((best, f) => (families[f].audits[a].m > families[best].audits[a].m ? f : best), VERDICT_FAMILIES[0]);
        const passes = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => families[f].audits[a].wins)), lost = AUDITS.filter((a) => !families[strongest[a]].audits[a].wins).length;
        wiring = { verdict: passes ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN", why: passes ? "cx beats ER, TYPE-BLOCK and DEGREE on all three audits" : lost >= 2 ? `against the strongest family cx wins on ${3 - lost} of 3 audits` : "cx does not beat every family on every audit, but wins against the strongest on at least two" };
    }
    const G = refs.references.GUARDED, ruleRows = AUDITS.map((a) => { const p = T.paired(F[a], G[a]); return { audit: a, diff: p.diff, se: p.se, needs: margin(p), wins: p.diff > margin(p), crushed: F[a].crashed, ruleCrushed: G[a].crashed }; });
    const rule = { verdict: ruleRows.every((x) => x.wins && x.crushed <= x.ruleCrushed) ? "BEATS THE RULE" : "DOES NOT BEAT THE RULE", rows: ruleRows };
    const pairs = {}; for (const fam of ["nostate", "withheld"]) { const r = rs.find((x) => x.family === fam); if (r) pairs[fam] = AUDITS.map((a) => ({ audit: a, F: F[a].score, other: eff(r)[a].score, ...beats(F[a].score, [eff(r)[a].score]) })); }
    return { cx, wiring, rule, pairs, families, strongest, checks: checksOf(refs) };
}

export function reportLines(records, condition) {
    const refs = records.find((r) => r.family === "refs"), rs = records.filter((r) => r.family !== "refs"), lines = [];
    if (!refs) return ["no references record in the file"];
    const v = verdictOf(records, refs);
    lines.push(`PIECE 4, condition ${refs.condition}${condition && condition !== refs.condition ? " (ASKED FOR " + condition + ")" : ""}: ${rs.length} circuits`);
    for (const r of v.checks.rows) lines.push(`  ${r.info ? "[reading]" : r.ok ? "[ok]     " : "[FAILED] "} ${r.name}: ${r.text}`);
    if (!v.checks.ok) lines.push("  A CHECK FAILED: the verdicts below are printed and NOT weighed");
    const R = refs.references; lines.push("  references (mean score on audit | audit2 | reserve): " + REFERENCE_NAMES.map((n) => `${n} ${AUDITS.map((a) => f3(R[n][a].score)).join(" | ")}`).join("; "));
    const cx = v.cx; if (cx) { const e = effectiveOf(cx, refs); lines.push(`  CX: ${cx.asStart ? "NO ELIGIBLE CHAMPION (scored as its start, GUARDED-OBS)" : "champion seed " + cx.champion + ", moved " + cx.movement.moved + " weights, " + cx.movement.kept + " kept, largest change " + f3(cx.movement.largest)} | ${AUDITS.map((a) => `${a} ${f3(e[a].score)} (crushed ${e[a].crashed}, stranded ${e[a].stranded})`).join(" | ")}`); }
    for (const fam of ["nostate", "withheld"]) { const r = rs.find((x) => x.family === fam); if (r) { const e = effectiveOf(r, refs); lines.push(`  ${NAMES[fam]}: ${r.asStart ? "no eligible champion (start)" : "champion seed " + r.champion} | ${AUDITS.map((a) => `${a} ${f3(e[a].score)}`).join(" | ")}${v.pairs[fam] ? "   cx vs it: " + v.pairs[fam].map((x) => `${f3(x.margin)} (needs ${f3(x.needs)}: ${x.wins ? "WINS" : "no"})`).join(" | ") : ""}`); } }
    for (const fam of VERDICT_FAMILIES) { const d = v.families[fam]; if (d) lines.push(`  ${NAMES[fam]} x${d.n}: ` + AUDITS.map((a) => `${a} ${f3(d.audits[a].m)} +- ${f3(d.audits[a].s)} (cx ${d.audits[a].margin >= 0 ? "+" : ""}${f3(d.audits[a].margin)}, needs ${f3(d.audits[a].needs)}: ${d.audits[a].wins ? "WINS" : "no"})`).join(" | ")); }
    lines.push(`  training: searches eligible ${rs.map((r) => `${r.spec} ${r.searches.filter((s) => s.eligible).length}/${r.searches.length}`).join(", ")}`);
    lines.push(`PIECE 4 WIRING VERDICT (${refs.condition}): ${v.wiring.verdict} -- ${v.wiring.why}`);
    if (v.rule) lines.push(`PIECE 4 RULE VERDICT (${refs.condition}): ${v.rule.verdict} -- ${v.rule.rows.map((x) => `${x.audit} ${x.diff >= 0 ? "+" : ""}${f3(x.diff)} (needs ${f3(x.needs)}; crushed ${x.crushed} against ${x.ruleCrushed})`).join(" | ")}`);
    lines.push(bottomLine(v, refs.condition));
    return lines;
}

/** The registered bottom line (reading c) for one condition. */
export function bottomLine(v, condition) {
    if (!v.checks || !v.checks.ok) return `PIECE 4 BOTTOM LINE (${condition}): NOT READ -- a check failed (${v.checks ? v.checks.rows.filter((r) => !r.info && !r.ok).map((r) => r.name).join(", ") : "no references"})`;
    if (v.wiring.verdict === "NOT ASSESSED") return `PIECE 4 BOTTOM LINE (${condition}): NOT YET -- ${v.wiring.why}`;
    const ns = v.pairs.nostate, wh = v.pairs.withheld, wins = (p) => !!p && p.every((x) => x.wins), tie = (p) => !!p && !p.some((x) => x.wins);
    const memory = wins(ns) ? "cx beats NO STATE on every audit: the memory bought something" : tie(ns) ? "cx ties NO STATE: the memory did not matter" : "cx beats NO STATE on some audits only", needs = wins(wh) ? "cx beats WITHHELD on every audit: the needs readings bought something" : tie(wh) ? "cx ties WITHHELD: the needs did not matter to what was learned" : "cx beats WITHHELD on some audits only";
    if (v.wiring.verdict === "PASS" && v.rule.verdict === "BEATS THE RULE" && wins(ns) && wins(wh)) return `PIECE 4 BOTTOM LINE (${condition}): the real wiring, with its memory, used the needs better than its controls and than the rule (${memory}; ${needs})`;
    return `PIECE 4 BOTTOM LINE (${condition}): wiring ${v.wiring.verdict}, ${v.rule.verdict.toLowerCase()}; ${memory}; ${needs}`;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, condition: String, workers: Number, runs: Number, iters: Number, sigma: Number, maxK: Number, "prune-budget": Number, "circuit-file": String, one: String, smoke: Boolean, quiet: Boolean } : { in: String, "allow-smoke": Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in, allowSmoke: !!given["allow-smoke"] }; }
    if (!given.one && !given.specs) throw new Error("run needs --specs <list> (the registered study: " + STUDY + ")");
    if (!given.one && !given.out) throw new Error("run needs --out <results file>");
    const condition = given.condition || "noisy"; if (!(condition in CONDITIONS)) throw new Error(`--condition must be noisy or clean, got ${JSON.stringify(condition)}`);
    const o = { cmd, specs: given.specs || given.one, one: given.one || null, out: given.out || null, condition, workers: given.workers ?? 1, recipe: { runs: given.runs ?? RECIPE.runs, iters: given.iters ?? RECIPE.iters, sigma: given.sigma ?? RECIPE.sigma, maxK: given.maxK ?? RECIPE.maxK, pruneBudget: given["prune-budget"] ?? RECIPE.pruneBudget }, circuitFile: given["circuit-file"] || CIRCUIT_FILE, smoke: !!given.smoke, quiet: !!given.quiet };
    for (const [k, v] of [["workers", o.workers], ["runs", o.recipe.runs], ["iters", o.recipe.iters], ["maxK", o.recipe.maxK]]) if (!(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number of 1 or more, got ${v}`);
    if (!(o.recipe.sigma > 0)) throw new Error(`--sigma must be above 0, got ${o.recipe.sigma}`);
    if (!(Number.isInteger(o.recipe.pruneBudget) && o.recipe.pruneBudget >= 0)) throw new Error(`--prune-budget must be a whole number of 0 or more, got ${o.recipe.pruneBudget}`);
    parseSpecs(o.specs); if (o.one && parseSpecs(o.one).length !== 1) throw new Error("--one takes a single spec");
    if (condition === "clean") for (const s of parseSpecs(o.specs)) if (!["cx", "nostate", "withheld"].includes(s.family)) throw new Error(`the clean condition is run for cx, nostate and withheld only (registered), not ${specName(s)}`);
    return o;
}
const sameRecipe = (rec, o) => ["runs", "iters", "sigma", "maxK", "pruneBudget"].every((k) => rec.recipe[k] === o.recipe[k]);
/**
 * THE COMMAND, as a function: `run` computes the references record (once per file), trains the specs not yet in --out (each in its own process when --workers is above 1, by --one), appends one line each, and prints the report; `report` prints it for a results file. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument.
 * `io` is for the gate: { out, err, readFile, appendFile, exists, runner, refsRunner, spawner }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("trainNeedsCircuit: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("trainNeedsCircuit: " + e.message); return 1; }
        if (!records.length) { err("trainNeedsCircuit: the results file has no records"); return 1; }
        if (records.some((r) => r.smoke) && !o.allowSmoke) { err("trainNeedsCircuit: the file holds smoke records (a throwaway recipe on a few dives): pass --allow-smoke to read them anyway"); return 1; }
        for (const l of reportLines(records)) out(l); return 0;
    }
    let circuit; try { circuit = loadCircuit(o.circuitFile); } catch (e) { err("trainNeedsCircuit: cannot read the circuit file: " + e.message); return 1; }
    const sets = setsOf({ smoke: o.smoke }), opts = { recipe: o.recipe, sets, smoke: o.smoke, condition: o.condition }, log = o.quiet ? () => {} : out;
    if (o.one) { const rec = (io.runner || runCircuit)(parseSpecs(o.one)[0], circuit, opts, o.quiet ? () => {} : (m) => err(m)); out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("trainNeedsCircuit: " + e.message); return 1; } }
    const stale = have.filter((r) => r.condition !== o.condition || !!r.smoke !== o.smoke || (r.family !== "refs" && !sameRecipe(r, o)));
    if (stale.length) { err(`trainNeedsCircuit: ${o.out} holds ${stale.length} record(s) of another condition, recipe or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), specs = parseSpecs(o.specs), todo = specs.filter((s) => !done.has(specName(s))), needRefs = !done.has("refs"), records = [...have];
    log(`[trainNeedsCircuit] ${o.condition}: ${specs.length} circuits, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to train; references ${needRefs ? "to compute" : "already there"}; ${o.workers} worker(s); recipe ${o.recipe.runs} x ${o.recipe.iters}${o.smoke ? " (SMOKE)" : ""}`);
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (needRefs) { keep((io.refsRunner || refsRecord)(circuit, opts)); log("[trainNeedsCircuit] references done"); }
    const spawner = io.spawner || ((spec) => runChild(spec, o)), queue = [...todo];
    const worker = async () => { while (queue.length) { const s = queue.shift(); const rec = o.workers > 1 ? await spawner(s) : (io.runner || runCircuit)(s, circuit, opts, o.quiet ? () => {} : (m) => log(m)); keep(rec); log(`[trainNeedsCircuit] ${specName(s)} done${rec.asStart ? " (no eligible champion)" : " (champion seed " + rec.champion + ")"}`); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(o.workers, queue.length || 1)) }, worker));
    for (const l of reportLines(records)) out(l);
    return 0;
}
/** One circuit in a child process (this file's command with --one): resolves the record. */
function runChild(spec, o) {
    return new Promise((resolve, reject) => {
        const args = [path.join(HERE, "trainNeedsCircuitCmd.mjs"), "run", "--one", specName(spec), "--condition", o.condition, "--runs", String(o.recipe.runs), "--iters", String(o.recipe.iters), "--sigma", String(o.recipe.sigma), "--maxK", String(o.recipe.maxK), "--prune-budget", String(o.recipe.pruneBudget), "--circuit-file", o.circuitFile, "--quiet", ...(o.smoke ? ["--smoke"] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => { const line = buf.split("\n").find((l) => l.startsWith("RESULT ")); if (code !== 0 || !line) reject(new Error(`child for ${specName(spec)} ended with ${code} and no RESULT`)); else resolve(JSON.parse(line.slice(7))); });
    });
}
