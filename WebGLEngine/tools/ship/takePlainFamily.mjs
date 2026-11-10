// WebGLEngine/tools/ship/takePlainFamily.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takePlainFamilyCmd.mjs; the registration is brain/PLAIN_FAMILY_WIP.md, written and committed BEFORE this file, before any new search was trained and before any dive was flown on a new block; the gate is tools/ship/takePlainFamily-selfcheck.mjs)
//
// DO THE PLAIN-NET FAMILIES LEAD THE RULE AS A FAMILY? Thirty-two new searches (plain:4 to 19 and plain-priced:4 to 19, the recipe of the earlier rounds, trained by tools/ship/trainDecisionCircuitCmd.mjs and trainStationCmd.mjs into two ledgers), each ELIGIBLE one (crushed no more pool dives than the start) flown with the rule on its OWN block of 600 seeds of far and both (1,200 dives; slot s = 0 to 15 for plain, 16 to 31 for plain-priced, seeds 70001 + 600 s to 70600 + 600 s), because two searches' per-dive noise on shared dives is correlated (0.60 among the old plain-family searches) and the test treats searches as independent units; and the sixteen eligible OLD searches with the rule on one common block (seeds 90001 to 91200 of far and both, 2,400 dives).
//   CHECKS (a failure is the first line and the verdicts are NOT WEIGHED): SPECS, ELIGIBLE, ARMS, WEIGHTS, BLOCKS, KEYS, SCORES, DISJOINT.
//   Q1 (VERDICT 1, THE FAMILY): the exact sign-flip test of the sum of the eligible new searches' leads: LEAD iff p+ <= 0.05, BELOW iff p- <= 0.05, else CANNOT BE TOLD APART. Q2 (VERDICT 2, THE FOUR OLD ONES): the four old plain-family searches' average per-dive lead on the common block, z = mean / se: STILL LEAD iff z >= 1.645, TRAIL iff z <= -1.645, else CANNOT. Q3 to Q7 REPORTED: the families one by one, what the pool filter does, the old sixteen on the common block, the champion rule on the new searches, the hull.
// A library: no clock, no Math.random; the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RV from "./takeRankingValidity.mjs";
import * as B from "../../brain/switchboard.mjs";
import { hullNumbers } from "./takeThirdAudit.mjs";
import { keysOf } from "./takeDecisionCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const FAMILIES = Object.freeze(["plain", "plain-priced"]), FIRST_INDEX = 4, LAST_INDEX = 19, SEED_BASE = 96520;
export const FAR_BOTH = Object.freeze(["far", "both"]), SLOT_FROM = 70001, SLOT_SIZE = 600;
export const OLD_BLOCK = Object.freeze({ from: 90001, to: 91200, kinds: FAR_BOTH });
export const OLD_ELIGIBLE = Object.freeze(["cx:0", "cx:1", "nostate:1", "nostate:2", "nostate:3", "plain:2", "plain:3", "station-large:0", "station-large:1", "station-large:2", "station-small:0", "station-small:1", "station-small:2", "station-small:3", "plain-priced:2", "plain-priced:3"]);
export const OLD_FOUR = Object.freeze(["plain:2", "plain:3", "plain-priced:2", "plain-priced:3"]);
export const FILES = Object.freeze({ plain: "brain/plainFamilyTrainingPlain.jsonl", priced: "brain/plainFamilyTrainingPriced.jsonl", old: "brain/plainFamilyOld.jsonl", newDir: "brain/plainFamilyNew" });
export const ALPHA = 0.05, Z_CRIT = 1.645, TOL = 1e-12, MAX_N = 40;
const RULE = RV.RULE_ARM;
/** The ids of the 32 new searches in order: plain:4 to plain:19, then plain-priced:4 to plain-priced:19. */
export const newIds = () => FAMILIES.flatMap((f) => Array.from({ length: LAST_INDEX - FIRST_INDEX + 1 }, (_, i) => `${f}:${FIRST_INDEX + i}`));
/** The slot of a new search id (plain 0 to 15, plain-priced 16 to 31). */
export const slotOf = (id) => { const m = /^(plain|plain-priced):(\d+)$/.exec(id); if (!m) throw new Error(`takePlainFamily.slotOf: ${JSON.stringify(id)} is not a new search (plain:4 to 19 or plain-priced:4 to 19)`); const k = Number(m[2]); if (k < FIRST_INDEX || k > LAST_INDEX) throw new Error(`takePlainFamily.slotOf: index ${k} is outside ${FIRST_INDEX} to ${LAST_INDEX}`); return (m[1] === "plain-priced" ? LAST_INDEX - FIRST_INDEX + 1 : 0) + k - FIRST_INDEX; };
/** The block of a slot: { from, to, kinds }. */
export const blockOf = (slot) => ({ from: SLOT_FROM + SLOT_SIZE * slot, to: SLOT_FROM + SLOT_SIZE * slot + SLOT_SIZE - 1, kinds: [...FAR_BOTH] });
/** The file of a new search's flight: the id with ':' written '-' (a colon is not a file name on every machine). */
export const fileOfNew = (id, dir = FILES.newDir) => `${dir}/${id.replace(":", "-")}.jsonl`;
const sameBlock = (rule, b) => !!rule && JSON.stringify(rule.range) === JSON.stringify({ from: b.from, to: b.to }) && JSON.stringify(rule.kinds) === JSON.stringify(b.kinds);

// ---- the statistics --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The exact sign-flip test of the sum of `leads`: every assignment of signs to the absolute leads (|lead| below 1e-12 counts 0), counted exactly by splitting into two halves: { n, sum, assignments, pPos, pNeg } (pPos the share of assignments whose sum is at least the observed sum, pNeg at most it). */
export function signFlip(leads) {
    const n = leads.length; if (n > MAX_N) throw new Error(`takePlainFamily.signFlip: ${n} leads (the exact test takes at most ${MAX_N})`);
    const a = leads.map((x) => (Math.abs(x) < TOL ? 0 : Math.abs(x))), obs = leads.reduce((s, x) => s + (Math.abs(x) < TOL ? 0 : x), 0), h = n >> 1;
    const sums = (v) => { let s = [0]; for (const x of v) s = s.flatMap((t) => [t + x, t - x]); return s; };
    const sa = sums(a.slice(0, h)), sb = sums(a.slice(h)).sort((p, q) => p - q), m = sb.length;
    const lower = (v) => { let lo = 0, hi = m; while (lo < hi) { const mid = (lo + hi) >> 1; if (sb[mid] < v) lo = mid + 1; else hi = mid; } return lo; };
    const upper = (v) => { let lo = 0, hi = m; while (lo < hi) { const mid = (lo + hi) >> 1; if (sb[mid] <= v) lo = mid + 1; else hi = mid; } return lo; };
    let ge = 0, le = 0; for (const t of sa) { ge += m - lower(obs - TOL - t); le += upper(obs + TOL - t); }
    const total = sa.length * m; return { n, sum: obs, assignments: total, pPos: ge / total, pNeg: le / total };
}
const meanOf = (x) => x.reduce((s, v) => s + v, 0) / x.length;
const sdOf = (x) => { const m = meanOf(x); return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
const medianOf = (x) => { const s = x.slice().sort((p, q) => p - q), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
/** Welch's t of the difference of the means of a and b (a minus b): null with fewer than two of either, or no spread at all. */
export function welch(a, b) { if (a.length < 2 || b.length < 2) return null; const va = sdOf(a) ** 2 / a.length, vb = sdOf(b) ** 2 / b.length; if (!(va + vb > 0)) return null; return (meanOf(a) - meanOf(b)) / Math.sqrt(va + vb); }
export const familyWord = (t) => (t.pPos <= ALPHA ? "THE PLAIN FAMILIES LEAD THE RULE" : t.pNeg <= ALPHA ? "THE PLAIN FAMILIES ARE BELOW THE RULE" : "THE PLAIN FAMILIES CANNOT BE TOLD APART FROM THE RULE");
export const fourWord = (z) => (z >= Z_CRIT ? "THE FOUR OLD PLAIN-FAMILY SEARCHES STILL LEAD THE RULE" : z <= -Z_CRIT ? "THE FOUR OLD PLAIN-FAMILY SEARCHES TRAIL THE RULE" : "THE FOUR OLD PLAIN-FAMILY SEARCHES CANNOT BE TOLD APART FROM THE RULE ON THE FRESH BLOCK");
/** The four old searches' per-dive paired differences over the rule averaged over the four: { n, mean, se, z } (z null when the average has no spread). */
export function fourLead(oldFile) {
    const rule = oldFile.arms[RULE].runs, arms = OLD_FOUR.map((id) => oldFile.arms[id].runs), a = rule.map((_, i) => meanOf(arms.map((r) => r[i].score - rule[i].score))), m = meanOf(a), se = sdOf(a) / Math.sqrt(a.length);
    return { n: a.length, mean: m, se, z: se > 0 ? m / se : null };
}

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The new searches' rows from the two ledgers' records (the validity module's rows: id, family, index, seed, eligible, champion, heldOut, lead, start, startPool, poolCrashed, digest, recipe). */
export const newRowsOf = (plainRecs, pricedRecs) => RV.searchesOf(plainRecs, pricedRecs);
const recipeKey = (r) => J(["iters", "sigma", "maxK", "pruneBudget"].map((k) => r && r[k]));
const J = JSON.stringify;
/** The checks, in order: [{ name, ok, text }]. ctx = { newRows, oldRows, newFiles: { id: audit | null }, oldFile }; `smoke` relaxes BLOCKS and DISJOINT (and says so). */
export function checksOf(ctx, { smoke = false } = {}) {
    const rows = [], { newRows, oldRows, newFiles, oldFile } = ctx, want = newIds(), bad = [];
    if (J(newRows.map((r) => r.id)) !== J(want)) bad.push(`the ledgers give ${newRows.length} searches (${newRows.length ? newRows.map((r) => r.id).join(",") : "none"}), not ${want[0]} to ${want[want.length - 1]} in order`);
    else {
        const o0 = oldRows[0];
        if (newRows.some((r) => r.seed !== SEED_BASE + r.index)) bad.push(`a seed is not ${SEED_BASE} + its index: ${newRows.filter((r) => r.seed !== SEED_BASE + r.index).map((r) => r.id).join(", ")}`);
        if (o0 && newRows.some((r) => recipeKey(r.recipe) !== recipeKey(o0.recipe))) bad.push("the new searches were not trained by the old recipe (iterations, sigma, maxK, prune budget)");
        if (o0 && newRows.some((r) => r.start.toFixed(9) !== o0.start.toFixed(9) || r.startPool !== o0.startPool)) bad.push("the new searches do not start from the old start");
    }
    rows.push({ name: "SPECS", ok: bad.length === 0, text: bad.length ? bad.join("; ") : "the 32 new searches (plain:4 to 19, plain-priced:4 to 19) once each, the seed of index k 96520 + k, the old recipe, the old start" });
    const eligNew = newRows.filter((r) => r.eligible).map((r) => r.id), have = Object.keys(newFiles).filter((id) => newFiles[id]), missing = eligNew.filter((id) => !newFiles[id]), extra = have.filter((id) => !eligNew.includes(id)), oldEl = oldRows.filter((r) => r.eligible).map((r) => r.id), eb = [];
    if (missing.length) eb.push(`no flight for ${missing.join(", ")}`); if (extra.length) eb.push(`a flight for the ineligible ${extra.join(", ")}`); if (J(oldEl) !== J(OLD_ELIGIBLE)) eb.push(`the old eligible searches are ${oldEl.join(",")}, not the registered sixteen`);
    rows.push({ name: "ELIGIBLE", ok: eb.length === 0, text: eb.length ? eb.join("; ") : `${eligNew.length} of 32 new searches are eligible and each has its flight, none else; the old eligible are the registered sixteen` });
    const files = [...eligNew.filter((id) => newFiles[id]).map((id) => ({ name: id, audit: newFiles[id], ids: [id], digests: { [id]: newRows.find((r) => r.id === id).digest }, block: blockOf(slotOf(id)) })), { name: "old", audit: oldFile, ids: [...OLD_ELIGIBLE], digests: Object.fromEntries(oldRows.map((r) => [r.id, r.digest])), block: OLD_BLOCK }];
    const ab = files.filter((f) => J(Object.keys(f.audit.arms).sort()) !== J([RULE, ...f.ids].sort())).map((f) => f.name);
    rows.push({ name: "ARMS", ok: ab.length === 0, text: ab.length ? `${ab.join(", ")}: the arms are not the rule and the named searches once each` : `each new file holds the rule and its search, the old file the rule and the sixteen, once each` });
    const wb = files.flatMap((f) => f.ids.filter((id) => f.audit.arms[id] && f.audit.arms[id].digest !== f.digests[id]).map((id) => id));
    rows.push({ name: "WEIGHTS", ok: wb.length === 0, text: wb.length ? `${wb.join(", ")} flew other weights than their ledger line` : "every flight flew the weights of its ledger line (by digest)" });
    const bb = files.filter((f) => !sameBlock(f.audit.arms[RULE], f.block)).map((f) => `${f.name} (${f.audit.arms[RULE] ? `seeds ${f.audit.arms[RULE].range.from} to ${f.audit.arms[RULE].range.to} of ${f.audit.arms[RULE].kinds.join(", ")}` : "no rule"})`);
    rows.push({ name: "BLOCKS", ok: smoke || bb.length === 0, text: bb.length ? (smoke ? `SMOKE, not weighed: ${bb.join("; ")}` : `${bb.join("; ")} did not fly its registered block`) : "every file flew its registered block (a slot's 600 seeds of far and both; the old file's 90001 to 91200)" });
    const kb = files.filter((f) => { const r = f.audit.arms[RULE]; if (!r) return true; const want0 = keysOf(r.range, r.kinds); return Object.values(f.audit.arms).some((a) => J(a.runs.map((x) => x.key)) !== J(want0) || J(a.range) !== J(r.range) || J(a.kinds) !== J(r.kinds)); }).map((f) => f.name);
    rows.push({ name: "KEYS", ok: kb.length === 0, text: kb.length ? `${kb.join(", ")}: an arm did not fly the same dives in the same order as the rule` : "in every file the arms flew the same dives in the same order" });
    const sb = files.filter((f) => Object.values(f.audit.arms).some((a) => a.runs.some((r) => !(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1) || !(r.maxStrain === null || Number.isFinite(r.maxStrain))))).map((f) => f.name);
    rows.push({ name: "SCORES", ok: sb.length === 0, text: sb.length ? `${sb.join(", ")}: a score outside [0, 1] or a strain that is not a number` : "every score is a number in [0, 1] and every strain a number or null" });
    const keySets = files.map((f) => ({ name: f.name, keys: new Set(f.audit.arms[RULE] ? f.audit.arms[RULE].runs.map((r) => r.key) : []) })), shared = [];
    for (let i = 0; i < keySets.length; i++) for (let j = i + 1; j < keySets.length; j++) { const n = [...keySets[i].keys].filter((k) => keySets[j].keys.has(k)).length; if (n) shared.push(`${keySets[i].name} and ${keySets[j].name} share ${n} dives`); }
    rows.push({ name: "DISJOINT", ok: smoke || shared.length === 0, text: shared.length ? (smoke ? `SMOKE, not weighed: ${shared.join("; ")}` : shared.join("; ")) : `no dive is in two of the ${files.length} files` });
    return rows;
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The paired lead of arm `id` over the rule in an audit file: { n, mean, se, better, worse, same, badA, badB }. */
export const leadIn = (audit, id) => B.paired(audit.arms[id].runs, audit.arms[RULE].runs);
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4)), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
const tOf = (x) => (x.length > 1 && sdOf(x) > 0 ? (meanOf(x) / (sdOf(x) / Math.sqrt(x.length))).toFixed(2) : "n/a");
/** THE REPORT: the checks first (a failure is the first line and the verdicts are NOT WEIGHED), the table, Q1 to Q7, the bottom lines. `opts`: smoke. Returns the lines. */
export function report(ctx, opts = {}) {
    const L = [], smoke = !!opts.smoke, checks = checksOf(ctx, { smoke }), failed = checks.filter((c) => !c.ok), { newRows, oldRows, newFiles, oldFile } = ctx;
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`);
    const eligRows = newRows.filter((r) => r.eligible);
    L.push(`PLAIN FAMILY (brain/PLAIN_FAMILY_WIP.md): ${newRows.length} new searches (plain:4 to 19, plain-priced:4 to 19), ${eligRows.length} eligible, each flown with the rule on its own block of 1,200 dives; the sixteen eligible old searches and the rule on the common block of ${oldFile.arms[RULE] ? oldFile.arms[RULE].runs.length : 0} dives`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const tag = checks.some((c) => c.text.startsWith("SMOKE, not weighed")) ? " [SMOKE: not the registered blocks]" : "", lead = Object.fromEntries(eligRows.map((r) => [r.id, leadIn(newFiles[r.id], r.id)]));
    L.push("the eligible new searches: slot and block, the training-line held-out lead, the audit lead over the rule on its own block (se), dives better / worse / same, crushed or stranded (the rule's); CH the family's champion");
    for (const r of eligRows) { const p = lead[r.id], b = blockOf(slotOf(r.id)); L.push(`  ${r.id.padEnd(15)} ${r.champion ? "CH" : "  "} slot ${String(slotOf(r.id)).padStart(2)} seeds ${b.from}-${b.to}  held-out lead ${sg(r.lead)}  lead ${sg(p.mean)} (se ${f4(p.se)})  ${p.better} / ${p.worse} / ${p.same}  bad ${p.badA} (${p.badB})`); }
    const leads = eligRows.map((r) => lead[r.id].mean), q1 = signFlip(leads), nP = eligRows.filter((r) => r.family === "plain").length, nQ = eligRows.length - nP;
    L.push(`Q1 (VERDICT 1: THE FAMILY) the ${eligRows.length} eligible new searches (${nP} plain, ${nQ} plain-priced), each on its own 1,200 dives: ${eligRows.length ? `mean lead ${sg(meanOf(leads))} (sd ${eligRows.length > 1 ? f4(sdOf(leads)) : "n/a"}, ${leads.filter((x) => x > TOL).length} above 0); ` : ""}exact sign-flip over ${q1.assignments} assignments, p+ ${fp(q1.pPos)} / p- ${fp(q1.pNeg)}: ${familyWord(q1)}`);
    const fl = fourLead(oldFile);
    L.push(`Q2 (VERDICT 2: THE FOUR OLD ONES) on the common block (${fl.n} dives), the average of ${OLD_FOUR.join(", ")}: mean lead ${sg(fl.mean)} (se ${f4(fl.se)}), z ${fl.z === null ? "n/a" : fl.z.toFixed(2)}: ${fl.z === null ? "THE FOUR OLD PLAIN-FAMILY SEARCHES CANNOT BE TOLD APART FROM THE RULE ON THE FRESH BLOCK" : fourWord(fl.z)}`);
    L.push("Q3 the new searches by family (reported, no verdict): trained, eligible, above 0, mean lead, sd across the eligible, t, median, exact sign-flip p+ / p- for the family alone");
    const byFam = {};
    for (const f of FAMILIES) {
        const rs = eligRows.filter((r) => r.family === f), x = rs.map((r) => lead[r.id].mean), t = signFlip(x); byFam[f] = x;
        L.push(`  ${f.padEnd(12)} trained ${newRows.filter((r) => r.family === f).length}, eligible ${rs.length}, above 0 ${x.filter((v) => v > TOL).length}; ${rs.length ? `mean ${sg(meanOf(x))}, sd ${rs.length > 1 ? f4(sdOf(x)) : "n/a"}, t ${tOf(x)}, median ${sg(medianOf(x))}; ` : ""}p+ ${fp(t.pPos)} / p- ${fp(t.pNeg)}`);
    }
    const dw = welch(byFam["plain-priced"], byFam.plain), dm = byFam.plain.length && byFam["plain-priced"].length ? meanOf(byFam["plain-priced"]) - meanOf(byFam.plain) : null;
    L.push(`  plain-priced minus plain (the eligible new searches' means): ${dm === null ? "n/a" : sg(dm)}, Welch t ${dw === null ? "n/a" : dw.toFixed(2)}`);
    L.push("Q4 what the pool filter does (reported): the new searches that are not eligible (not flown), each with its pool crash count and its training-line held-out lead");
    for (const f of FAMILIES) { const no = newRows.filter((r) => r.family === f && !r.eligible); L.push(`  ${f.padEnd(12)} not eligible: ${no.length ? no.map((r) => `${r.id} (pool crashed ${r.poolCrashed}, held-out lead ${sg(r.lead)})`).join(", ") : "none"}`); }
    const ineligRows = newRows.filter((r) => !r.eligible);
    L.push(`  the mean training-line held-out lead of the eligible ${eligRows.length ? sg(meanOf(eligRows.map((r) => r.lead))) : "n/a"}, of the ineligible ${ineligRows.length ? sg(meanOf(ineligRows.map((r) => r.lead))) : "n/a"}`);
    L.push("Q5 the sixteen eligible old searches on the common block (reported; they share dives, so no test): lead (se), by family the mean lead and how many are above 0");
    const oldLead = Object.fromEntries(OLD_ELIGIBLE.map((id) => [id, leadIn(oldFile, id)]));
    for (const fam of RV.FAMILY_ORDER) { const ids = OLD_ELIGIBLE.filter((id) => oldRows.find((r) => r.id === id).family === fam); if (!ids.length) continue; const x = ids.map((id) => oldLead[id].mean); L.push(`  ${fam.padEnd(14)} ${ids.map((id) => `${id} ${sg(oldLead[id].mean)} (se ${f4(oldLead[id].se)})`).join(", ")}; mean ${sg(meanOf(x))}, ${x.filter((v) => v > TOL).length} of ${x.length} above 0`); }
    const circ = OLD_ELIGIBLE.filter((id) => !OLD_FOUR.includes(id)).map((id) => oldLead[id].mean), four = OLD_FOUR.map((id) => oldLead[id].mean), cw = welch(four, circ);
    L.push(`  the four plain-family ones: mean ${sg(meanOf(four))}; the twelve circuit-family ones: mean ${sg(meanOf(circ))}; difference ${sg(meanOf(four) - meanOf(circ))}, Welch t ${cw === null ? "n/a" : cw.toFixed(2)}`);
    L.push("Q6 the champion rule on the new searches (reported): the family's champion by the ledger (eligible, best held-out, ties to the lower k), its lead, its rank among the family's eligible leads");
    const champLeads = [];
    for (const f of FAMILIES) { const rs = eligRows.filter((r) => r.family === f), c = rs.find((r) => r.champion); if (!c) { L.push(`  ${f.padEnd(12)} no champion (no eligible search)`); continue; } const mine = lead[c.id].mean, rank = 1 + rs.filter((r) => lead[r.id].mean > mine + TOL).length; champLeads.push(mine); L.push(`  ${f.padEnd(12)} champion ${c.id}: lead ${sg(mine)}, rank ${rank} of ${rs.length} (the family's mean eligible lead ${sg(meanOf(rs.map((r) => lead[r.id].mean)))})`); }
    L.push("Q7 the hull (reported): dives above strain 0.92 and 0.95, the largest strain, crushed, stranded, with the rule's on the same block");
    const hl = (name, audit, id) => { const h = hullNumbers(audit.arms[id].runs), r = hullNumbers(audit.arms[RULE].runs); return `  ${name.padEnd(15)} ${h.above[0]} of ${h.dives} above 0.92, ${h.above[1]} above 0.95, largest ${f4(h.max)}, crushed ${h.crushed}, stranded ${h.stranded} (the rule: ${r.above[0]}, ${r.above[1]}, ${f4(r.max)}, ${r.crushed}, ${r.stranded})`; };
    for (const r of eligRows) L.push(hl(r.id, newFiles[r.id], r.id));
    for (const f of FAMILIES) { const hs = eligRows.filter((r) => r.family === f).map((r) => hullNumbers(newFiles[r.id].arms[r.id].runs)); L.push(`  ${f.padEnd(12)} total over ${hs.length} searches: ${hs.reduce((s, h) => s + h.above[0], 0)} dives above 0.92, ${hs.reduce((s, h) => s + h.above[1], 0)} above 0.95, crushed ${hs.reduce((s, h) => s + h.crushed, 0)}, stranded ${hs.reduce((s, h) => s + h.stranded, 0)}`); }
    for (const id of OLD_FOUR) L.push(hl(id + " (old)", oldFile, id));
    L.push(`BOTTOM LINE (FAMILY): ${familyWord(q1)}${tag} (${eligRows.length} eligible new searches, mean lead ${eligRows.length ? sg(meanOf(leads)) : "n/a"}, exact sign-flip p+ ${fp(q1.pPos)} and p- ${fp(q1.pNeg)})`);
    L.push(`BOTTOM LINE (THE FOUR OLD ONES): ${fl.z === null ? "THE FOUR OLD PLAIN-FAMILY SEARCHES CANNOT BE TOLD APART FROM THE RULE ON THE FRESH BLOCK" : fourWord(fl.z)}${tag} (mean lead ${sg(fl.mean)}, se ${f4(fl.se)}, z ${fl.z === null ? "n/a" : fl.z.toFixed(2)})`);
    return L;
}

// ---- plan and the command --------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The commands of the registration, from the ledgers: the two trainings, the common-block flight, and one flight for each eligible new search: [{ kind: "TRAIN" | "OLD" | "NEW", id, text }]. */
export function planOf(newRows) {
    const out = [
        { kind: "TRAIN", id: "plain", text: `node tools/ship/trainDecisionCircuitCmd.mjs run --specs plain:${FIRST_INDEX}-${LAST_INDEX} --runs ${LAST_INDEX + 1} --out ${FILES.plain} --workers 4` },
        { kind: "TRAIN", id: "plain-priced", text: `node tools/ship/trainStationCmd.mjs run --specs plain-priced:${FIRST_INDEX}-${LAST_INDEX} --runs ${LAST_INDEX + 1} --out ${FILES.priced} --workers 4` },
        { kind: "OLD", id: "old", text: `node tools/ship/takeRankingValidityCmd.mjs fly --arms ${[RULE, ...OLD_ELIGIBLE].join(",")} --from ${OLD_BLOCK.from} --to ${OLD_BLOCK.to} --kinds ${OLD_BLOCK.kinds.join(",")} --out ${FILES.old} --workers 4` },
    ];
    for (const r of newRows.filter((x) => x.eligible)) { const b = blockOf(slotOf(r.id)); out.push({ kind: "NEW", id: r.id, text: `node tools/ship/takeRankingValidityCmd.mjs fly --decision ${FILES.plain} --station ${FILES.priced} --arms ${RULE},${r.id} --from ${b.from} --to ${b.to} --kinds ${b.kinds.join(",")} --out ${fileOfNew(r.id)} --workers 2` }); }
    return out;
}
/** `report [--smoke] [--ledger-plain f] [--ledger-priced f] [--old f] [--new-dir d] [--old-decision f] [--old-station f]` and `plan [the ledgers]`. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, exists }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    const [cmd, ...rest] = argv;
    if (cmd !== "report" && cmd !== "plan") { err(`takePlainFamily: the first word must be report or plan, got ${JSON.stringify(cmd)}`); return 2; }
    const known = { "ledger-plain": String, "ledger-priced": String, "old-decision": String, "old-station": String, ...(cmd === "report" ? { old: String, "new-dir": String, smoke: Boolean } : {}) }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takePlainFamily: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!(k in known)) { err(`takePlainFamily: unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`); return 2; }
        if (known[k] === Boolean) { given[k] = true; continue; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takePlainFamily: ${a} needs a value`); return 2; } given[k] = v;
    }
    const lp = given["ledger-plain"] || FILES.plain, lq = given["ledger-priced"] || FILES.priced, od = given["old-decision"] || RV.DECISION_FILE, os = given["old-station"] || RV.STATION_FILE, dir = given["new-dir"] || FILES.newDir, oldF = given.old || FILES.old;
    let newRows, oldRows, lines;
    try {
        for (const [role, f] of [["plain ledger", lp], ["priced ledger", lq]]) if (!exists(f)) { err(`takePlainFamily: the ${role} ${f} is not here`); return 1; }
        newRows = newRowsOf(readRecords(readFile(lp)), readRecords(readFile(lq))); oldRows = RV.searchesOf(readRecords(readFile(od)), readRecords(readFile(os)));
        if (cmd === "plan") { for (const p of planOf(newRows)) out(`${p.kind} ${p.id}: ${p.text}`); return 0; }
        if (!exists(oldF)) { err(`takePlainFamily: the old-block file ${oldF} is not here`); return 1; }
        const oldFile = RV.readAudit(readFile(oldF), oldRows.map((r) => r.id)); if (!Object.keys(oldFile.arms).length) { err("takePlainFamily: the old-block file has no records"); return 1; }
        const newFiles = {}; for (const r of newRows) { const f = fileOfNew(r.id, dir); newFiles[r.id] = exists(f) ? RV.readAudit(readFile(f), [r.id]) : null; }
        lines = report({ newRows, oldRows, newFiles, oldFile }, { smoke: !!given.smoke });
    } catch (e) { err("takePlainFamily: " + e.message); return 1; }
    for (const l of lines) out(l);
    return 0;
}
