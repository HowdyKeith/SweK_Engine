// WebGLEngine/tools/ship/takeDeepPlain.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeDeepPlainCmd.mjs; the registration is brain/DEEP_PLAIN_WIP.md, written and committed BEFORE this file and before any dive was flown on the new block; the gate is tools/ship/takeDeepPlain-selfcheck.mjs)
//
// IS THE OLD PLAIN-FAMILY FOUR'S LEAD A FAR-AND-BOTH LEAD ONLY? The rule and the sixteen eligible old searches flown by tools/ship/takeRankingValidityCmd.mjs on seeds 120001 to 121000 of deep and plain (1,000 dives of each kind, 2,000 an arm), read beside the three earlier far-and-both audits (round 1's block, AUDIT 2, AUDIT 3: 1,800 dives of each of far and both) for the survey task's own four-kind weighting.
//   CHECKS (a failure is the first line and the verdicts are NOT WEIGHED): SPECS, ARMS, WEIGHTS, BLOCK, KEYS, SCORES, DISJOINT, EARLIER (the three earlier audits are the registered blocks with the same sixteen).
//   Q1 (VERDICT 1, DEEP) and Q2 (VERDICT 2, PLAIN): the average over the plain-family four (plain:2, plain:3, plain-priced:2, plain-priced:3) of the per-dive paired lead over the rule on that kind: z = mean / se; LEAD iff z >= 1.645, TRAIL iff z <= -1.645, else CANNOT BE TOLD APART. Q3 to Q5 REPORTED: all sixteen by kind and family, the four-kind lead, the hull.
// A library: no clock, no Math.random; the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RV from "./takeRankingValidity.mjs";
import * as PF from "./takePlainFamily.mjs";
import * as KM from "./takeKindMatched.mjs";
import * as B from "../../brain/switchboard.mjs";
import { hullNumbers } from "./takeThirdAudit.mjs";
import { keysOf } from "./takeDecisionCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const RULE = RV.RULE_ARM, OLD_FOUR = PF.OLD_FOUR, OLD_ELIGIBLE = PF.OLD_ELIGIBLE;
export const BLOCK = Object.freeze({ from: 120001, to: 121000, kinds: Object.freeze(["deep", "plain"]) });
export const FILES = Object.freeze({ audit: "brain/deepPlainAudit.jsonl", round1: KM.FILES.round1, audit2: KM.FILES.audit2, audit3: KM.FILES.audit3, h40: KM.FILES.h40, big: KM.FILES.big, mixed: KM.FILES.mixed });
export const EARLIER = Object.freeze(["round1", "audit2", "audit3"]), OTHERS = Object.freeze(["h40", "big", "mixed"]), FILE_NAMES = Object.freeze(["audit", ...OTHERS, ...EARLIER]);
export const KIND_ORDER = Object.freeze(["far", "both", "deep", "plain"]), Z_CRIT = PF.Z_CRIT;
const BLOCK_OF = Object.freeze({ audit: BLOCK, round1: KM.BLOCKS.round1, audit2: KM.BLOCKS.audit2, audit3: KM.BLOCKS.audit3, h40: KM.BLOCKS.h40, big: KM.BLOCKS.big, mixed: KM.BLOCKS.mixed });
const sameBlock = (rule, b) => !!rule && JSON.stringify(rule.range) === JSON.stringify({ from: b.from, to: b.to }) && JSON.stringify(rule.kinds) === JSON.stringify(b.kinds);
const J = JSON.stringify;
/** The words of the two verdicts: `kind` is "deep" or "plain"; z null (no spread) cannot be told apart. */
export const kindWord = (kind, z) => `THE FOUR OLD PLAIN-FAMILY SEARCHES ${z !== null && z >= Z_CRIT ? "LEAD THE RULE" : z !== null && z <= -Z_CRIT ? "TRAIL THE RULE" : "CANNOT BE TOLD APART FROM THE RULE"} ON ${kind.toUpperCase()} DIVES`;

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** An audit with only the dives of one kind in every arm. */
export const ofKind = (audit, kind) => KM.subAudit(audit, (k) => k.startsWith(kind + ":"));
/** The arms of several audit files joined dive by dive (the dives of one file after another), restricted to `kind`: a file { arms }. `ids` are the arms to join (the rule too). */
export function pool(audits, kind, ids) {
    const arms = {}; for (const id of ids) arms[id] = { runs: audits.flatMap((a) => ofKind(a, kind).arms[id].runs) };
    return { arms };
}
/** One arm's paired lead over the rule on one kind, the dives of several audit files joined: { n, mean, se, better, worse, same, badA, badB }. */
export function pooledLead(audits, kind, id) { const f = pool(audits, kind, [RULE, id]); return B.paired(f.arms[id].runs, f.arms[RULE].runs); }
/** One arm's paired lead over the rule on one kind of a file: { n, mean, se, better, worse, same, badA, badB }. */
export const leadOn = (audit, id, kind) => PF.leadIn(ofKind(audit, kind), id);
/** The mean of the four kind leads (the survey task's weighting) and its se with the four combined as independent: { mean, se }. */
export const fourKindOf = (parts) => ({ mean: parts.reduce((s, p) => s + p.mean, 0) / parts.length, se: Math.sqrt(parts.reduce((s, p) => s + p.se * p.se, 0)) / parts.length });
/** The four old searches' average lead on each kind of `kinds` (name -> pool of audits) and over the four kinds: { perKind: { kind: { n, mean, se, z } }, mean, se, z }. `pools` maps kind -> pseudo-file with the rule and the four. */
export function fourAverage(pools) {
    const perKind = Object.fromEntries(Object.entries(pools).map(([k, f]) => [k, PF.fourLead(f)])), ks = Object.values(perKind), mean = ks.reduce((s, p) => s + p.mean, 0) / ks.length, se = Math.sqrt(ks.reduce((s, p) => s + p.se * p.se, 0)) / ks.length;
    return { perKind, mean, se, z: se > 0 ? mean / se : null };
}

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The checks, in order: [{ name, ok, text }]. ctx = { oldRows, audit, earlier: { round1, audit2, audit3 }, others: { h40, big, mixed } } (readAudit results); `smoke` relaxes BLOCK and DISJOINT. */
export function checksOf(ctx, { smoke = false } = {}) {
    const rows = [], { oldRows, audit } = ctx, oldEl = oldRows.filter((r) => r.eligible).map((r) => r.id), want = [RULE, ...OLD_ELIGIBLE];
    rows.push({ name: "SPECS", ok: J(oldEl) === J(OLD_ELIGIBLE), text: J(oldEl) === J(OLD_ELIGIBLE) ? "the old eligible searches are the registered sixteen" : `the old eligible searches are ${oldEl.join(",")}, not the registered sixteen` });
    const names = Object.keys(audit.arms), armBad = J(names.slice().sort()) !== J(want.slice().sort());
    rows.push({ name: "ARMS", ok: !armBad, text: armBad ? `the arms are ${names.join(", ")}, not the rule and the registered sixteen once each` : "the rule and the sixteen eligible old searches, once each" });
    const wrong = oldRows.filter((r) => audit.arms[r.id] && audit.arms[r.id].digest !== r.digest).map((r) => r.id);
    rows.push({ name: "WEIGHTS", ok: wrong.length === 0, text: wrong.length ? `${wrong.join(", ")} flew other weights than their line of the old ledgers` : "every search flew the weights of its line of the old ledgers (by digest)" });
    const rule = audit.arms[RULE], blockOk = sameBlock(rule, BLOCK);
    rows.push({ name: "BLOCK", ok: smoke || blockOk, text: blockOk ? "the file flew seeds 120001 to 121000 of deep, plain" : rule ? (smoke ? `SMOKE, not weighed: the file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(", ")}` : `the file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(", ")}, not the registered block (120001 to 121000 of deep, plain)`) : "the file has no rule arm" });
    let keyBad = !rule; if (rule) { const want0 = keysOf(rule.range, rule.kinds); keyBad = names.some((n) => J(audit.arms[n].runs.map((r) => r.key)) !== J(want0) || J(audit.arms[n].range) !== J(rule.range) || J(audit.arms[n].kinds) !== J(rule.kinds)); }
    rows.push({ name: "KEYS", ok: !keyBad, text: keyBad ? "an arm did not fly the same dives in the same order as the rule" : `every arm flew the same ${rule.runs.length} dives in the same order` });
    const sBad = names.some((n) => audit.arms[n].runs.some((r) => !(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1) || !(r.maxStrain === null || Number.isFinite(r.maxStrain))));
    rows.push({ name: "SCORES", ok: !sBad, text: sBad ? "a score outside [0, 1] or a strain that is not a number" : "every score is a number in [0, 1] and every strain a number or null" });
    const keysOfFile = (f) => new Set(f && f.arms[RULE] ? f.arms[RULE].runs.map((r) => r.key) : []), mine = keysOfFile(audit), others = { ...ctx.others, ...ctx.earlier }, shared = [];
    for (const n of [...OTHERS, ...EARLIER]) { const c = [...keysOfFile(others[n])].filter((k) => mine.has(k)).length; if (c) shared.push(`AUDIT and ${n.toUpperCase()} share ${c} dives`); }
    rows.push({ name: "DISJOINT", ok: smoke || shared.length === 0, text: shared.length ? (smoke ? `SMOKE, not weighed: ${shared.join("; ")}` : shared.join("; ")) : "no dive is in the new file and in the 40-dive set, BIG, MIXED, round 1's block, AUDIT 2 or AUDIT 3" });
    const eb = []; for (const n of EARLIER) { const f = ctx.earlier[n], r = f && f.arms[RULE]; if (!sameBlock(r, BLOCK_OF[n])) eb.push(`${n} did not fly its registered block`); else { const bad = oldRows.filter((s) => s.eligible && (!f.arms[s.id] || f.arms[s.id].digest !== s.digest)).map((s) => s.id); if (bad.length) eb.push(`${n}: ${bad.join(", ")} missing or flew other weights`); } }
    rows.push({ name: "EARLIER", ok: eb.length === 0, text: eb.length ? eb.join("; ") : "the three earlier far-and-both audits are the registered blocks and hold the same sixteen searches with the same weights" });
    return rows;
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4)), zt = (z) => (z === null ? "n/a" : z.toFixed(2));
/** THE REPORT: the checks first (a failure is the first line and the verdicts are NOT WEIGHED), the table, Q1 to Q5, the bottom lines. `opts`: smoke. Returns the lines. */
export function report(ctx, opts = {}) {
    const L = [], smoke = !!opts.smoke, checks = checksOf(ctx, { smoke }), failed = checks.filter((c) => !c.ok), { oldRows, audit, earlier } = ctx, n = audit.arms[RULE] ? audit.arms[RULE].runs.length : 0;
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`);
    L.push(`DEEP AND PLAIN AUDIT (brain/DEEP_PLAIN_WIP.md): the rule and the sixteen eligible old searches on seeds 120001 to 121000 of deep and plain (${n} dives an arm), beside the three earlier far-and-both audits`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const tag = checks.some((c) => c.text.startsWith("SMOKE, not weighed")) ? " [SMOKE: not the registered block]" : "", ids = OLD_ELIGIBLE, ea = EARLIER.map((k) => earlier[k]);
    const rowOf = (id) => oldRows.find((r) => r.id === id);
    const part = Object.fromEntries(ids.map((id) => [id, { deep: leadOn(audit, id, "deep"), plain: leadOn(audit, id, "plain"), far: pooledLead(ea, "far", id), both: pooledLead(ea, "both", id) }]));
    const four = Object.fromEntries(ids.map((id) => [id, fourKindOf(KIND_ORDER.map((k) => part[id][k]))]));
    L.push("the sixteen eligible old searches: lead over the rule (se) on deep and on plain dives of this block (dives better / worse / same), on far and on both from the three earlier audits pooled, and the mean of the four kinds (se); CH a family champion");
    for (const id of ids) { const p = part[id], r = rowOf(id); L.push(`  ${id.padEnd(15)} ${r.champion ? "CH" : "  "} deep ${sg(p.deep.mean)} (se ${f4(p.deep.se)}; ${p.deep.better}/${p.deep.worse}/${p.deep.same})  plain ${sg(p.plain.mean)} (se ${f4(p.plain.se)}; ${p.plain.better}/${p.plain.worse}/${p.plain.same})  far ${sg(p.far.mean)}  both ${sg(p.both.mean)}  four-kind ${sg(four[id].mean)} (se ${f4(four[id].se)})`); }
    const fd = PF.fourLead(ofKind(pick(audit, [RULE, ...OLD_FOUR]), "deep")), fp = PF.fourLead(ofKind(pick(audit, [RULE, ...OLD_FOUR]), "plain"));
    L.push(`Q1 (VERDICT 1: DEEP) the average of ${OLD_FOUR.join(", ")} on the ${fd.n} deep dives: mean lead ${sg(fd.mean)} (se ${f4(fd.se)}), z ${zt(fd.z)}: ${kindWord("deep", fd.z)}`);
    L.push(`Q2 (VERDICT 2: PLAIN) the same on the ${fp.n} plain dives: mean lead ${sg(fp.mean)} (se ${f4(fp.se)}), z ${zt(fp.z)}: ${kindWord("plain", fp.z)}`);
    L.push("Q3 all sixteen by kind and family (reported; the searches share dives, so no test): the mean lead and how many are above 0");
    const mn = (x) => x.reduce((s, v) => s + v, 0) / x.length;
    for (const fam of RV.FAMILY_ORDER) { const fi = ids.filter((id) => rowOf(id).family === fam); if (!fi.length) continue; L.push(`  ${fam.padEnd(14)} deep: mean ${sg(mn(fi.map((id) => part[id].deep.mean)))}, ${fi.filter((id) => part[id].deep.mean > KM.TOL).length} of ${fi.length} above 0; plain: mean ${sg(mn(fi.map((id) => part[id].plain.mean)))}, ${fi.filter((id) => part[id].plain.mean > KM.TOL).length} of ${fi.length} above 0`); }
    const pools = Object.fromEntries(KIND_ORDER.map((k) => [k, k === "far" || k === "both" ? pool(ea, k, [RULE, ...OLD_FOUR]) : ofKind(pick(audit, [RULE, ...OLD_FOUR]), k)])), fa = fourAverage(pools);
    L.push("Q4 the four-kind lead (the survey task's weighting: the mean of the lead on far, both, deep and plain; reported, the far and both leads come from blocks already read)");
    L.push(`  the four old ones: far ${sg(fa.perKind.far.mean)}, both ${sg(fa.perKind.both.mean)}, deep ${sg(fa.perKind.deep.mean)}, plain ${sg(fa.perKind.plain.mean)}; four-kind lead ${sg(fa.mean)} (se ${f4(fa.se)}, z ${zt(fa.z)})`);
    const champs = ids.filter((id) => rowOf(id).champion);
    for (const id of champs) L.push(`  champion ${id.padEnd(15)} four-kind ${sg(four[id].mean)} (se ${f4(four[id].se)}): far ${sg(part[id].far.mean)}, both ${sg(part[id].both.mean)}, deep ${sg(part[id].deep.mean)}, plain ${sg(part[id].plain.mean)}`);
    L.push("Q5 the hull on the new block: dives above strain 0.92 and 0.95, the largest strain, crushed, stranded, on deep dives and on plain dives (the rule first)");
    const hl = (id) => ["deep", "plain"].map((k) => { const h = hullNumbers(ofKind(audit, k).arms[id].runs); return `${k}: ${h.above[0]} of ${h.dives} above 0.92, ${h.above[1]} above 0.95, largest ${f4(h.max)}, crushed ${h.crushed}, stranded ${h.stranded}`; }).join("; ");
    L.push(`  ${RULE.padEnd(15)} ${hl(RULE)}`); for (const id of ids) L.push(`  ${id.padEnd(15)} ${hl(id)}`);
    L.push(`BOTTOM LINE (DEEP): ${kindWord("deep", fd.z)}${tag} (mean lead ${sg(fd.mean)}, se ${f4(fd.se)}, z ${zt(fd.z)})`);
    L.push(`BOTTOM LINE (PLAIN): ${kindWord("plain", fp.z)}${tag} (mean lead ${sg(fp.mean)}, se ${f4(fp.se)}, z ${zt(fp.z)})`);
    return L;
}
/** A file with only the named arms. */
const pick = (audit, ids) => ({ arms: Object.fromEntries(ids.map((id) => [id, audit.arms[id]])) });

// ---- plan and the command --------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The registered flight's command. */
export const planLine = () => `node tools/ship/takeRankingValidityCmd.mjs fly --arms ${[RULE, ...OLD_ELIGIBLE].join(",")} --from ${BLOCK.from} --to ${BLOCK.to} --kinds ${BLOCK.kinds.join(",")} --out ${FILES.audit} --workers 4`;
/** `report [--smoke] [--audit f] [--round1 f] [--audit2 f] [--audit3 f] [--h40 f] [--big f] [--mixed f] [--old-decision f] [--old-station f]` and `plan`. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, exists }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    const [cmd, ...rest] = argv;
    if (cmd === "plan" && rest.length === 0) { out(planLine()); return 0; }
    if (cmd !== "report") { err(`takeDeepPlain: the first word must be report or plan, got ${JSON.stringify(cmd)}`); return 2; }
    const known = { ...Object.fromEntries(FILE_NAMES.map((k) => [k, String])), "old-decision": String, "old-station": String, smoke: Boolean }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takeDeepPlain: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!(k in known)) { err(`takeDeepPlain: unknown option ${JSON.stringify(a)} (known for report: ${Object.keys(known).map((n) => "--" + n).join(", ")})`); return 2; }
        if (known[k] === Boolean) { given[k] = true; continue; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takeDeepPlain: ${a} needs a value`); return 2; } given[k] = v;
    }
    const f = { ...FILES, ...Object.fromEntries(FILE_NAMES.filter((k) => given[k]).map((k) => [k, given[k]])) }, od = given["old-decision"] || RV.DECISION_FILE, os = given["old-station"] || RV.STATION_FILE;
    let lines;
    try {
        const oldRows = RV.searchesOf(readRecords(readFile(od)), readRecords(readFile(os))), ids = oldRows.map((r) => r.id), read = {};
        for (const k of FILE_NAMES) { if (!exists(f[k])) { err(`takeDeepPlain: the ${k} audit file ${f[k]} is not here`); return 1; } read[k] = RV.readAudit(readFile(f[k]), ids); if (!Object.keys(read[k].arms).length) { err(`takeDeepPlain: the ${k} audit file has no records`); return 1; } }
        lines = report({ oldRows, audit: read.audit, earlier: Object.fromEntries(EARLIER.map((k) => [k, read[k]])), others: Object.fromEntries(OTHERS.map((k) => [k, read[k]])) }, { smoke: !!given.smoke });
    } catch (e) { err("takeDeepPlain: " + e.message); return 1; }
    for (const l of lines) out(l);
    return 0;
}
