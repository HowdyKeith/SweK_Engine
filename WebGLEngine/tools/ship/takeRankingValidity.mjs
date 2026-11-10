// WebGLEngine/tools/ship/takeRankingValidity.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeRankingValidityCmd.mjs, which says the first-order orientation step out loud; the registration is brain/RANKING_VALIDITY_WIP.md, written BEFORE this file and before any search was flown on the block; the gate is tools/ship/takeRankingValidity-selfcheck.mjs)
//
// DOES THE HELD-OUT SCORE RANK THE SEARCHES? Every one of the 24 searches of the decision-circuit round (brain/decisionCircuitTraining.jsonl: cx, nostate, plain) and the station-and-price round (brain/stationRoundTraining.jsonl: station-large, station-small, plain-priced), four each, is flown as an arm on a FRESH block (seeds 19001 to 19600 of far and both, 1,200 dives an arm) with `rule-low06` beside them, and each search's mean PAIRED lead over the rule on that block is set against its held-out lead (the held-out score minus the start's, on the unpriced score: `heldOutRaw` for plain-priced). The champion rule (tools/ship/trainDecisionCircuit.mjs `championOf`) reads nothing but the held-out score, and only ever chooses WITHIN a family.
//   Q1 (THE VERDICT): S = the sum, over the pairs of ELIGIBLE searches (crushed in no more pool runs than the start) inside each family, of sign(held-out lead i - j) x sign(audit lead i - j) (a difference under 1e-9 is a tie and counts 0). EXACT: the audit leads are permuted inside each family and every arrangement counted. RANKS iff the one-sided p of S as large or larger is at most 0.05; BACKWARDS iff the p of S as small or smaller is; else DOES NOT RANK.
//   Q2 (REPORTED, in no verdict): S pooled over all eligible searches and over all 24 (a deterministic permutation Monte Carlo: mulberry32, seed 20261107, 1,000,000 draws, p = (1 + count) / (draws + 1)); S within families over all 24 (exact); the OLS slope of the audit lead on the held-out lead; each family's champion by audit rank among its eligible searches and against the mean of the others; the champions' leads on this block beside the ones the earlier audits gave them.
//   CHECKS (a failure is the first line of the report and the verdicts are NOT WEIGHED): SEARCHES (24 lines, the specs once each, one recipe, one start), ARMS (the rule and the 24 searches once each, nothing else), WEIGHTS (every arm flew the weights of its line, by digest), CHAMPIONS (the champion each family's records name has the digest the earlier audit files record), KEYS (every arm flew the same dives in the same order), SCORES (finite, in [0, 1], every strain a finite number or null).
//   `fly` writes one JSON line an arm to a results file, resumable, any number of worker processes; `report` reads that file and the two training files, OFFLINE. THE SEEDS ARE READ ONLY BY `fly`. A library: no clock, no Math.random; the files are read and written by the command, through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as B from "../../brain/switchboard.mjs";
import * as D from "./trainDecisionCircuit.mjs";
import * as TS from "./trainStation.mjs";
import { strainTask } from "./takeStationRound.mjs";
import { digestOf, keysOf } from "./takeDecisionCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const RANGE = Object.freeze({ from: 19001, to: 19600 }), KINDS = Object.freeze(["far", "both"]), AUDIT_FILE = "brain/rankingValidityAudit.jsonl";
export const DECISION_FILE = D.OUT_FILE, STATION_FILE = TS.OUT_FILE, EARLIER_DECISION = "brain/decisionCircuitAudit.jsonl", EARLIER_STATION = "brain/stationRoundAudit.jsonl";
export const RULE_ARM = "rule-low06", FAMILY_ORDER = Object.freeze([...D.FAMILIES, ...TS.FAMILIES]);
export const FILE_OF = Object.freeze({ cx: "decision", nostate: "decision", plain: "decision", "station-large": "station", "station-small": "station", "plain-priced": "station" });
export const CHAMPION_DIGESTS = Object.freeze({ cx: "8e9fb0c2", nostate: "fabc804d", plain: "c916e7f5", "station-large": "3079e794", "station-small": "adc0f039", "plain-priced": "3e0ed772" });
export const ALPHA = 0.05, TIE = 1e-9, MC = Object.freeze({ draws: 1000000, seed: 20261107 }), MAX_STRATUM = 8;

// ---- the searches ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The 24 searches, in family order (cx, nostate, plain, station-large, station-small, plain-priced) and index order: { id, file, family, index, seed, heldOut, start, lead, poolCrashed, startPool, eligible, champion, digest, weights, recipe }. `decision` and `station` are the lines of the two training files. The held-out lead is on the UNPRICED score (`heldOutRaw` when the line has one). */
export function searchesOf(decision, station) {
    const sets = { decision, station }, rows = [];
    for (const family of FAMILY_ORDER) {
        const file = FILE_OF[family], recs = (sets[file] || []).filter((r) => r.family === family).sort((a, b) => a.index - b.index), champ = D.championOf(sets[file] || [], family).record;
        for (const r of recs) {
            const held = r.heldOutRaw ?? r.heldOut, start = r.start.heldOutRaw ?? r.start.heldOut;
            rows.push({ id: r.spec, file, family, index: r.index, seed: r.seed, heldOut: held, start, lead: held - start, poolCrashed: r.poolCrashed, startPool: r.start.poolCrashed, eligible: r.poolCrashed <= r.start.poolCrashed, champion: !!champ && champ.index === r.index, digest: digestOf(r.weights), weights: r.weights, recipe: r.recipe });
        }
    }
    return rows;
}
/** The policy a search was trained in. */
export const policyOf = (s) => (s.file === "decision" ? D.familyPolicy(s.family) : TS.familyPolicy(s.family));
/** The pilot function of a search: its weights through its family's policy. */
export function pilotOf(s, Pol = policyOf(s)) {
    const w = Float32Array.from(s.weights);
    if (w.length !== Pol.WEIGHT_COUNT) throw new Error(`takeRankingValidity.pilotOf: ${s.id} has ${w.length} weights and its policy takes ${Pol.WEIGHT_COUNT}`);
    return () => Pol.pilotFor(w);
}
let RULE = null;
const ruleArm = () => RULE || (RULE = B.surveyArms().find((a) => a.id === RULE_ARM) || (() => { throw new Error(`takeRankingValidity: the switchboard has no arm ${RULE_ARM}`); })());
/** One arm flown once: the record the results file keeps. opts: range, kinds, seconds (the gate shortens the dive), evaluate (a seam for the gate). */
export function flyArm(id, searches, { range = RANGE, kinds = KINDS, seconds = null, evaluate = null } = {}) {
    const s = searches.find((x) => x.id === id);
    if (id !== RULE_ARM && !s) throw new Error(`takeRankingValidity.flyArm: unknown arm ${JSON.stringify(id)} (${RULE_ARM} or one of ${searches.length} searches)`);
    const runs = strainTask.run({ id, pilot: id === RULE_ARM ? ruleArm().pilot : pilotOf(s) }, range, { kinds: [...kinds], ...(seconds ? { seconds } : {}), ...(evaluate ? { evaluate } : {}) });
    return { arm: id, range: { ...range }, kinds: [...kinds], seconds: seconds || null, runs, ...(s ? { family: s.family, index: s.index, digest: s.digest, champion: s.champion } : {}) };
}

// ---- the statistics ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const sgn = (x) => (x > TIE ? 1 : x < -TIE ? -1 : 0);
/** S over the pairs inside a stratum (`strata` null = one stratum): { s, pairs, untied } -- the pairs, and the pairs whose held-out leads are not tied. */
export function sOf(h, a, strata = null) {
    let s = 0, pairs = 0, untied = 0;
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) {
        if (strata && strata[i] !== strata[j]) continue;
        pairs++; const t = sgn(h[i] - h[j]); if (t !== 0) untied++;
        s += t * sgn(a[i] - a[j]);
    }
    return { s, pairs, untied };
}
const permutations = (arr) => (arr.length <= 1 ? [arr.slice()] : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
/** The EXACT permutation test of S with the audit leads permuted inside each stratum: { s, pairs, untied, arrangements, pPos, pNeg } (pPos = share of arrangements with S as large or larger, pNeg as small or smaller; the observed arrangement is one of them). A stratum above MAX_STRATUM is refused. */
export function exactWithin(h, a, strata) {
    const groups = new Map(); strata.forEach((g, i) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
    let dist = new Map([[0, 1]]);
    for (const [g, idx] of groups) {
        if (idx.length > MAX_STRATUM) throw new Error(`takeRankingValidity.exactWithin: stratum ${JSON.stringify(g)} has ${idx.length} members (the exact test takes at most ${MAX_STRATUM})`);
        const d = new Map();
        for (const perm of permutations(idx.map((i) => a[i]))) { let s = 0; for (let p = 0; p < idx.length; p++) for (let q = p + 1; q < idx.length; q++) s += sgn(h[idx[p]] - h[idx[q]]) * sgn(perm[p] - perm[q]); d.set(s, (d.get(s) || 0) + 1); }
        const nd = new Map(); for (const [x, cx] of dist) for (const [y, cy] of d) nd.set(x + y, (nd.get(x + y) || 0) + cx * cy);
        dist = nd;
    }
    const o = sOf(h, a, strata); let total = 0, ge = 0, le = 0;
    for (const [s, c] of dist) { total += c; if (s >= o.s) ge += c; if (s <= o.s) le += c; }
    return { ...o, arrangements: total, pPos: ge / total, pNeg: le / total };
}
/** mulberry32: a deterministic generator of numbers in [0, 1). */
export function mulberry32(seed) {
    let t = seed >>> 0;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
/** The permutation Monte Carlo of S over ONE pool (no strata): { s, pairs, untied, draws, pPos, pNeg } with p = (1 + count) / (draws + 1). */
export function mcPooled(h, a, { draws = MC.draws, seed = MC.seed } = {}) {
    const o = sOf(h, a), rnd = mulberry32(seed), n = h.length, pi = [], pj = [], ps = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const t = sgn(h[i] - h[j]); if (t !== 0) { pi.push(i); pj.push(j); ps.push(t); } }
    const perm = Float64Array.from(a); let ge = 0, le = 0;
    for (let d = 0; d < draws; d++) {
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), x = perm[i]; perm[i] = perm[j]; perm[j] = x; }
        let s = 0; for (let k = 0; k < pi.length; k++) s += ps[k] * sgn(perm[pi[k]] - perm[pj[k]]);
        if (s >= o.s) ge++; if (s <= o.s) le++;
    }
    return { ...o, draws, pPos: (1 + ge) / (draws + 1), pNeg: (1 + le) / (draws + 1) };
}
/** The ordinary least squares line of y on x: { n, slope, intercept, se } (se of the slope; null when x has no spread or fewer than 3 points). */
export function olsOf(x, y) {
    const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0);
    if (n < 3 || !(sxx > 0)) return { n, slope: null, intercept: null, se: null };
    const slope = sxy / sxx, intercept = my - slope * mx, rss = x.reduce((s, v, i) => s + (y[i] - intercept - slope * v) ** 2, 0);
    return { n, slope, intercept, se: Math.sqrt(rss / (n - 2) / sxx) };
}
/** Q1's words. */
export const readingOf = (r) => (r.pPos <= ALPHA ? "RANKS" : r.pNeg <= ALPHA ? "BACKWARDS" : "DOES NOT RANK");
export const bottomLine = (rd) => (rd === "RANKS" ? "THE HELD-OUT SCORE RANKS THE SEARCHES" : rd === "BACKWARDS" ? "THE HELD-OUT SCORE RANKS THE SEARCHES BACKWARDS" : "THE HELD-OUT SCORE DOES NOT RANK THE SEARCHES");

// ---- the audit file and the leads ---------------------------------------------------------------------------------------------------------------------------------------------------
/** The audit file's lines by arm; an arm in the file twice, a name that is not the rule or one of `ids`, or a line with no arm is refused (the audit is read once). */
export function readAudit(text, ids) {
    const arms = {};
    for (const r of readRecords(text)) {
        if (typeof r.arm !== "string") throw new Error("takeRankingValidity.readAudit: a line has no arm");
        if (r.arm !== RULE_ARM && !ids.includes(r.arm)) throw new Error(`takeRankingValidity.readAudit: unknown arm ${JSON.stringify(r.arm)}`);
        if (arms[r.arm]) throw new Error(`takeRankingValidity.readAudit: arm ${r.arm} is in the file twice (the audit is read once)`);
        arms[r.arm] = r;
    }
    return { arms };
}
/** The audit leads: one row a search that was flown: { ...search, audit: { n, mean, se, better, worse, same, badA, badB } } (the paired lead over the rule, per dive). Throws what `paired` throws on a dive that is not the same. */
export function leadsOf(audit, searches) {
    const rule = audit.arms[RULE_ARM]; if (!rule) throw new Error(`takeRankingValidity.leadsOf: the audit has no ${RULE_ARM}`);
    return searches.filter((s) => audit.arms[s.id]).map((s) => ({ ...s, audit: B.paired(audit.arms[s.id].runs, rule.runs) }));
}
/** The earlier audits' leads of the champions: [{ family, source, range, mean, se }] from the two earlier audit files' lines (an arm a file does not carry is left out). */
export function earlierLeads(decisionText, stationText) {
    const out = [], read = (text, source, map) => {
        if (text == null) return;
        const recs = readRecords(text), rule = recs.find((r) => r.arm === RULE_ARM); if (!rule) return;
        for (const [arm, family] of Object.entries(map)) { const r = recs.find((x) => x.arm === arm); if (r) { const p = B.paired(r.runs, rule.runs); out.push({ family, source, range: r.range, mean: p.mean, se: p.se }); } }
    };
    read(decisionText, "decision-circuit audit", { "circuit-cx": "cx", "circuit-nostate": "nostate", "circuit-plain": "plain" });
    read(stationText, "station-and-price audit", { "station-large": "station-large", "station-small": "station-small", "plain-priced": "plain-priced", "circuit-plain": "plain" });
    return out;
}
/** Per family: the champion's rank by audit lead among the family's eligible searches (1 = best; a tie shares the better rank) and its lead minus the mean lead of the other eligible searches: [{ family, champion: id | null, eligible, rank, diff, above }]. `rows` are leadsOf's. */
export function championRows(rows) {
    return FAMILY_ORDER.map((family) => {
        const el = rows.filter((r) => r.family === family && r.eligible), c = el.find((r) => r.champion);
        if (!c) return { family, champion: null, eligible: el.length, rank: null, diff: null, above: null };
        const others = el.filter((r) => r !== c), diff = others.length ? c.audit.mean - others.reduce((s, r) => s + r.audit.mean, 0) / others.length : null;
        return { family, champion: c.id, eligible: el.length, rank: 1 + el.filter((r) => r.audit.mean > c.audit.mean + TIE).length, diff, above: diff === null ? null : diff > TIE };
    });
}

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The checks, in order: [{ name, ok, text }]. `searches` are searchesOf's; `audit` is readAudit's result. */
export function checksOf(audit, searches) {
    const rows = [], ids = searches.map((s) => s.id), bad = [];
    const want = []; for (const f of FAMILY_ORDER) for (let k = 0; k < 4; k++) want.push(`${f}:${k}`);
    if (JSON.stringify(ids) !== JSON.stringify(want)) bad.push(`the training files give ${ids.length} searches (${ids.length === 24 ? "not the 24 specs, once each, in order" : "want 24"}): ${ids.filter((x) => !want.includes(x)).concat(want.filter((x) => !ids.includes(x)).map((x) => "missing " + x)).join(", ") || "order differs"}`);
    const rec = (s) => JSON.stringify(s.recipe), starts = new Set(searches.map((s) => s.start.toFixed(9))), pools = new Set(searches.map((s) => s.startPool));
    if (new Set(searches.map(rec)).size > 1) bad.push("the searches were not trained by one recipe");
    if (starts.size > 1 || pools.size > 1) bad.push("the searches do not share one start");
    rows.push({ name: "SEARCHES", ok: bad.length === 0, text: bad.length ? bad.join("; ") : "24 searches (cx, nostate, plain, station-large, station-small, plain-priced, k 0 to 3), one recipe, one start" });
    const names = Object.keys(audit.arms), missing = [RULE_ARM, ...ids].filter((n) => !audit.arms[n]);
    rows.push({ name: "ARMS", ok: missing.length === 0, text: missing.length ? `not flown: ${missing.join(", ")}` : `${RULE_ARM} and the 24 searches, once each (${names.length} arms)` });
    const wrong = searches.filter((s) => audit.arms[s.id] && audit.arms[s.id].digest !== s.digest).map((s) => s.id);
    rows.push({ name: "WEIGHTS", ok: wrong.length === 0, text: wrong.length ? `${wrong.join(", ")} flew other weights than their line of the training file` : "every search flew the weights of its line of the training file (by digest)" });
    const champBad = FAMILY_ORDER.filter((f) => { const c = searches.find((s) => s.family === f && s.champion); return !c || c.digest !== CHAMPION_DIGESTS[f]; });
    rows.push({ name: "CHAMPIONS", ok: champBad.length === 0, text: champBad.length ? `the champion of ${champBad.join(", ")} is not the one the earlier audits flew (digests ${FAMILY_ORDER.map((f) => f + " " + CHAMPION_DIGESTS[f]).join(", ")})` : `the six champions are the ones the earlier audits flew (${FAMILY_ORDER.map((f) => CHAMPION_DIGESTS[f]).join(", ")})` });
    const rule = audit.arms[RULE_ARM]; let keyBad = [];
    if (rule) {
        const want0 = keysOf(rule.range, rule.kinds);
        keyBad = names.filter((n) => JSON.stringify(audit.arms[n].runs.map((r) => r.key)) !== JSON.stringify(want0) || JSON.stringify(audit.arms[n].range) !== JSON.stringify(rule.range) || JSON.stringify(audit.arms[n].kinds) !== JSON.stringify(rule.kinds) || (audit.arms[n].seconds || null) !== (rule.seconds || null));
    }
    rows.push({ name: "KEYS", ok: !!rule && keyBad.length === 0, text: !rule ? `no ${RULE_ARM} to compare the dives with` : keyBad.length ? `${keyBad.join(", ")} did not fly the same dives in the same order as ${RULE_ARM}` : `every arm flew the same ${rule.runs.length} dives in the same order (seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(" and ")})` });
    const sBad = names.filter((n) => audit.arms[n].runs.some((r) => !(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1) || !(r.maxStrain === null || Number.isFinite(r.maxStrain))));
    rows.push({ name: "SCORES", ok: sBad.length === 0, text: sBad.length ? `${sBad.join(", ")} hold a score outside [0, 1] or a strain that is not a number` : "every score is a number in [0, 1] and every strain a number or null" });
    return rows;
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4)), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
/** THE REPORT: the checks first (a failure is the first line and the verdicts are NOT WEIGHED), the table of the 24 searches, Q1, Q2, the bottom line. `opts`: draws and seed of the Monte Carlo, earlier (the earlierLeads rows). Returns the lines. */
export function report(audit, searches, opts = {}) {
    const L = [], checks = checksOf(audit, searches), failed = checks.filter((c) => !c.ok), rule = audit.arms[RULE_ARM];
    if (rule && (JSON.stringify(rule.range) !== JSON.stringify(RANGE) || JSON.stringify(rule.kinds) !== JSON.stringify(KINDS))) L.push(`NOT THE REGISTERED BLOCK: this file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(" and ")}; the registered block is ${RANGE.from} to ${RANGE.to} of ${KINDS.join(" and ")}. A smoke, not the read.`);
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`);
    L.push(`RANKING VALIDITY (brain/RANKING_VALIDITY_WIP.md): ${searches.length} searches of the decision-circuit and station-and-price rounds, each flown on the audit block and read as its mean paired lead over ${RULE_ARM}`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const rows = leadsOf(audit, searches);
    L.push("the searches: held-out lead (unpriced), pool crushed (start), audit lead (se), dives better / worse / same, crushed or stranded (the rule's)");
    for (const r of rows) L.push(`  ${r.id.padEnd(15)} ${r.champion ? "CHAMPION" : "        "} ${r.eligible ? "eligible" : "dropped "} held-out ${sg(r.lead)}  pool ${r.poolCrashed} (${r.startPool})  audit ${sg(r.audit.mean)} (se ${f4(r.audit.se)})  ${r.audit.better} / ${r.audit.worse} / ${r.audit.same}  bad ${r.audit.badA} (${r.audit.badB})`);
    const el = rows.filter((r) => r.eligible), draws = opts.draws || MC.draws, seed = opts.seed ?? MC.seed;
    const q1 = exactWithin(el.map((r) => r.lead), el.map((r) => r.audit.mean), el.map((r) => r.family)), rd = readingOf(q1);
    L.push(`Q1 (THE VERDICT) within the families, the ${el.length} eligible searches: S = ${q1.s} (${q1.pairs} pairs, ${q1.untied} untied in the held-out lead); exact over ${q1.arrangements} arrangements, p that S is as large or larger ${fp(q1.pPos)}, as small or smaller ${fp(q1.pNeg)}: ${rd}`);
    const pe = mcPooled(el.map((r) => r.lead), el.map((r) => r.audit.mean), { draws, seed }), pa = mcPooled(rows.map((r) => r.lead), rows.map((r) => r.audit.mean), { draws, seed }), wa = exactWithin(rows.map((r) => r.lead), rows.map((r) => r.audit.mean), rows.map((r) => r.family));
    L.push(`Q2a pooled over the ${el.length} eligible searches (${pe.pairs} pairs): S = ${pe.s}; Monte Carlo p (${pe.draws} draws, seed ${seed}) larger or equal ${fp(pe.pPos)}, smaller or equal ${fp(pe.pNeg)}`);
    L.push(`Q2a pooled over all ${rows.length} searches (${pa.pairs} pairs): S = ${pa.s}; Monte Carlo p larger or equal ${fp(pa.pPos)}, smaller or equal ${fp(pa.pNeg)}`);
    L.push(`Q2b within the families over all ${rows.length} searches (${wa.pairs} pairs): S = ${wa.s}; exact over ${wa.arrangements} arrangements, p larger or equal ${fp(wa.pPos)}, smaller or equal ${fp(wa.pNeg)}`);
    const ols = olsOf(el.map((r) => r.lead), el.map((r) => r.audit.mean));
    L.push(ols.slope === null ? `Q2c the slope of the audit lead on the held-out lead over the eligible: not defined` : `Q2c the slope of the audit lead on the held-out lead over the ${ols.n} eligible: ${ols.slope.toFixed(3)} (se ${ols.se.toFixed(3)}), intercept ${sg(ols.intercept)}`);
    const cr = championRows(rows);
    L.push("Q2d the champions against the other eligible searches of their family (rank by audit lead, 1 = best; the champion's lead minus the others' mean):");
    for (const c of cr) L.push(c.champion === null ? `  ${c.family}: no champion (no eligible search)` : `  ${c.family}: ${c.champion} is rank ${c.rank} of ${c.eligible}${c.diff === null ? ", no other eligible search" : `, ${sg(c.diff)} against the others' mean: ${c.above ? "ABOVE" : "NOT ABOVE"}`}`);
    const withOthers = cr.filter((c) => c.above !== null);
    L.push(`  champions above their family's other eligible mean: ${withOthers.filter((c) => c.above).length} of ${withOthers.length}`);
    const best = rows.reduce((b, r) => (r.audit.mean > b.audit.mean ? r : b), rows[0]);
    L.push(`  the search with the highest audit lead of the ${rows.length}: ${best.id} (${sg(best.audit.mean)})${best.champion ? ", a champion" : ", NOT a champion"}`);
    if (opts.earlier && opts.earlier.length) {
        L.push("Q2e the champions' audit leads over the rule, on the earlier block and on this one:");
        for (const f of FAMILY_ORDER) {
            const here = rows.find((r) => r.family === f && r.champion), was = opts.earlier.filter((e) => e.family === f);
            L.push(`  ${f}: here ${here ? `${sg(here.audit.mean)} (se ${f4(here.audit.se)})` : "no champion"}; ${was.length ? was.map((e) => `${e.source} (seeds ${e.range.from} to ${e.range.to}) ${sg(e.mean)} (se ${f4(e.se)})`).join("; ") : "not in an earlier audit"}`);
        }
    }
    L.push(`BOTTOM LINE: ${bottomLine(rd)} (${el.length} eligible searches in ${new Set(el.map((r) => r.family)).size} families, S = ${q1.s} of ${q1.untied} untied pairs, exact p ${fp(q1.pPos)} for a positive S and ${fp(q1.pNeg)} for a negative one)`);
    return L;
}

// ---- the command ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "fly" && cmd !== "report") throw new Error(`the first word must be fly or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "fly" ? { arms: String, decision: String, station: String, out: String, from: Number, to: Number, kinds: String, seconds: Number, workers: Number, one: String, quiet: Boolean } : { in: String, decision: String, station: String, draws: Number }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") {
        if (!given.in) throw new Error("report needs --in <audit file>");
        if (given.draws !== undefined && !(Number.isInteger(given.draws) && given.draws >= 1)) throw new Error(`--draws must be a whole number of 1 or more, got ${given.draws}`);
        return { cmd, in: given.in, decision: given.decision || DECISION_FILE, station: given.station || STATION_FILE, draws: given.draws ?? MC.draws };
    }
    if (!given.one && !given.out) throw new Error("fly needs --out <audit file>");
    const o = { cmd, arms: given.arms || given.one || "all", one: given.one || null, out: given.out || null, decision: given.decision || DECISION_FILE, station: given.station || STATION_FILE, range: { from: given.from ?? RANGE.from, to: given.to ?? RANGE.to }, kinds: given.kinds ? given.kinds.split(",") : [...KINDS], seconds: given.seconds ?? null, workers: given.workers ?? 1, quiet: !!given.quiet };
    if (!(Number.isInteger(o.range.from) && Number.isInteger(o.range.to) && o.range.from >= 1 && o.range.to >= o.range.from)) throw new Error(`--from and --to must be whole numbers with 1 <= from <= to, got ${o.range.from} and ${o.range.to}`);
    for (const k of o.kinds) if (!["plain", "deep", "far", "both"].includes(k)) throw new Error(`unknown kind ${JSON.stringify(k)} (plain, deep, far, both)`);
    if (new Set(o.kinds).size !== o.kinds.length) throw new Error("a kind is named twice");
    if (o.seconds !== null && !(o.seconds > 0)) throw new Error(`--seconds must be above 0, got ${o.seconds}`);
    if (!(Number.isInteger(o.workers) && o.workers >= 1)) throw new Error(`--workers must be a whole number of 1 or more, got ${o.workers}`);
    if (o.one && o.arms !== o.one) throw new Error("--one takes a single arm and no --arms");
    return o;
}
/** "all" (the rule first, then the 24 searches in family order) or a comma list of arm ids. */
export function parseFlights(text, ids) {
    const all = [RULE_ARM, ...ids], t = String(text).trim(); if (t === "all") return all;
    const out = []; for (const raw of t.split(",")) { const n = raw.trim(); if (!n) throw new Error(`takeRankingValidity.parseFlights: an empty name in ${JSON.stringify(text)}`); if (!all.includes(n)) throw new Error(`takeRankingValidity.parseFlights: unknown arm ${JSON.stringify(n)} (${RULE_ARM} or one of the 24 searches, e.g. cx:0)`); if (out.includes(n)) throw new Error(`takeRankingValidity.parseFlights: ${n} is named twice`); out.push(n); }
    return out;
}
const sameFlightAs = (rec, o) => JSON.stringify(rec.range) === JSON.stringify(o.range) && JSON.stringify(rec.kinds) === JSON.stringify(o.kinds) && (rec.seconds || null) === o.seconds;
/** THE COMMAND as a function. `fly` flies the arms not yet in --out (each in its own process when --workers is above 1), appending one line each; `report` prints the checks and the verdicts. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, exists, flyer, spawner }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("takeRankingValidity: " + e.message); return 2; }
    const load = (f) => readRecords(readFile(f));
    if (o.cmd === "report") {
        let audit, searches, earlier; try { searches = searchesOf(load(o.decision), load(o.station)); audit = readAudit(readFile(o.in), searches.map((s) => s.id)); earlier = earlierLeads(exists(EARLIER_DECISION) ? readFile(EARLIER_DECISION) : null, exists(EARLIER_STATION) ? readFile(EARLIER_STATION) : null); } catch (e) { err("takeRankingValidity: " + e.message); return 1; }
        if (!Object.keys(audit.arms).length) { err("takeRankingValidity: the audit file has no records"); return 1; }
        let lines; try { lines = report(audit, searches, { draws: o.draws, earlier }); } catch (e) { err("takeRankingValidity: " + e.message); return 1; }
        for (const l of lines) out(l); return 0;
    }
    let searches; try { searches = searchesOf(load(o.decision), load(o.station)); } catch (e) { err("takeRankingValidity: " + e.message); return 1; }
    let names; try { names = parseFlights(o.arms, searches.map((s) => s.id)); } catch (e) { err(e.message.replace("takeRankingValidity.parseFlights: ", "takeRankingValidity: ")); return 2; }
    const fly = (name) => (io.flyer ? io.flyer(name, o) : flyArm(name, searches, { range: o.range, kinds: o.kinds, seconds: o.seconds }));
    if (o.one) { let rec; try { rec = fly(names[0]); } catch (e) { err("takeRankingValidity: " + e.message); return 1; } out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("takeRankingValidity: " + e.message); return 1; } }
    const stale = have.filter((r) => !sameFlightAs(r, o));
    if (stale.length) { err(`takeRankingValidity: ${o.out} holds ${stale.length} record(s) of another range, kinds or dive length (${stale.map((r) => r.arm).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.arm)), todo = names.filter((n) => !done.has(n)), queue = [...todo], log = o.quiet ? () => {} : out;
    log(`[takeRankingValidity] ${names.length} flights, ${names.length - todo.length} already in ${o.out}, ${todo.length} to fly; ${o.workers} worker(s); seeds ${o.range.from}-${o.range.to} of ${o.kinds.join(",")}${o.seconds ? `, ${o.seconds} s` : ""}`);
    const spawner = io.spawner || ((name) => runChild(name, o));
    const worker = async () => { while (queue.length) { const n = queue.shift(), rec = o.workers > 1 ? await spawner(n) : fly(n); appendFile(o.out, JSON.stringify(rec) + "\n"); log(`[takeRankingValidity] ${n} done`); } };
    try { await Promise.all(Array.from({ length: Math.min(o.workers, queue.length) }, worker)); } catch (e) { err("takeRankingValidity: " + e.message + " (the flights finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    log("[takeRankingValidity] all flights are in " + o.out + "; read them ONCE with: report --in " + o.out);
    return 0;
}
/** One flight in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(name, o, script = path.join(HERE, "takeRankingValidityCmd.mjs")) {
    return new Promise((resolve, reject) => {
        const args = [script, "fly", "--one", name, "--decision", o.decision, "--station", o.station, "--from", String(o.range.from), "--to", String(o.range.to), "--kinds", o.kinds.join(","), ...(o.seconds ? ["--seconds", String(o.seconds)] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => {
            const line = buf.split("\n").find((l) => l.startsWith("RESULT "));
            if (!line) return reject(new Error(`child for ${name} ended with ${code} and no RESULT`));
            try { resolve(JSON.parse(line.slice(7))); } catch (e) { reject(new Error(`child for ${name} printed a RESULT that is not JSON: ${e.message}`)); }
        });
    });
}
