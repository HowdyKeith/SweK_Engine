// WebGLEngine/tools/ship/takeRankingReplication.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeRankingReplicationCmd.mjs; the registration is brain/RANKING_REPLICATION_WIP.md, written BEFORE this file and before any search was flown on either new block; the gate is tools/ship/takeRankingReplication-selfcheck.mjs)
//
// DOES THE HELD-OUT RANKING REPLICATE, AND DOES A BIGGER HELD-OUT SET RANK BETTER? The 24 searches of the decision-circuit and station-and-price rounds and rule-low06, flown by tools/ship/takeRankingValidityCmd.mjs on THREE blocks: AUDIT 2 (seeds 22001 to 22600 of far and both, 1,200 dives), the BIG held-out (seeds 23001 to 23100 of plain, deep, far and both, 400 dives) and the original held-out set (seeds 11 to 20 of the four kinds, 40 dives, a pipeline check). THIS FILE FLIES NOTHING: it reads the three audit files (and round 1's) and prints the reading.
//   CHECKS (a failure is the first line and the verdicts are NOT WEIGHED): SEARCHES, CHAMPIONS (as in round 1), ARMS / WEIGHTS / KEYS / SCORES (in all three files), DISJOINT (no dive in two blocks), H40 REPRODUCES (the 40-dive held-out re-flown through this pipeline equals the training lines' to 1e-9).
//   Q1 (VERDICT): round 1's exact within-family test of the 40-dive held-out lead against the AUDIT 2 lead over the eligible searches: REPLICATES iff p(S as large) <= 0.05, REVERSED iff p(S as small) <= 0.05, else DOES NOT REPLICATE. Q2 (VERDICT): the same with the BIG held-out lead. Q3 to Q6 REPORTED: the two held-outs side by side, the champion rule redone with the BIG held-out, both audit blocks pooled, the hull.
// A library: no clock, no Math.random; the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RV from "./takeRankingValidity.mjs";
import { hullNumbers } from "./takeThirdAudit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const ALL_KINDS = Object.freeze(["plain", "deep", "far", "both"]);
export const BLOCKS = Object.freeze({ audit: Object.freeze({ from: 22001, to: 22600, kinds: Object.freeze(["far", "both"]) }), big: Object.freeze({ from: 23001, to: 23100, kinds: ALL_KINDS }), h40: Object.freeze({ from: 11, to: 20, kinds: ALL_KINDS }) });
export const FILES = Object.freeze({ audit: "brain/rankingReplicationAudit.jsonl", big: "brain/rankingReplicationBig.jsonl", h40: "brain/rankingReplicationH40.jsonl", round1: RV.AUDIT_FILE });
export const KEYS = Object.freeze(["audit", "big", "h40"]), ALPHA = RV.ALPHA, TOL = 1e-9;
const SAME_BLOCK = (rule, b) => !!rule && JSON.stringify(rule.range) === JSON.stringify({ from: b.from, to: b.to }) && JSON.stringify(rule.kinds) === JSON.stringify(b.kinds);

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mean = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
/** The checks, in order: [{ name, ok, text }]. `files` = { audit, big, h40 } (readAudit's results), `searches` searchesOf's, `round1` round 1's audit (readAudit) or null. */
export function checksOf(files, searches, round1 = null) {
    const per = Object.fromEntries(KEYS.map((k) => [k, RV.checksOf(files[k], searches)])), by = (k, n) => per[k].find((r) => r.name === n), rows = [];
    rows.push({ name: "SEARCHES", ok: by("audit", "SEARCHES").ok, text: by("audit", "SEARCHES").text }, { name: "CHAMPIONS", ok: by("audit", "CHAMPIONS").ok, text: by("audit", "CHAMPIONS").text });
    for (const n of ["ARMS", "WEIGHTS", "KEYS", "SCORES"]) { const bad = KEYS.filter((k) => !by(k, n).ok); rows.push({ name: n, ok: bad.length === 0, text: bad.length ? bad.map((k) => `${k.toUpperCase()}: ${by(k, n).text}`).join("; ") : n === "KEYS" ? KEYS.map((k) => `${k.toUpperCase()}: ${by(k, n).text}`).join("; ") : `in all three files (audit, big, h40): ${by("audit", n).text}` }); }
    const keySets = Object.fromEntries([...KEYS.map((k) => [k, files[k].arms[RV.RULE_ARM] ? files[k].arms[RV.RULE_ARM].runs.map((r) => r.key) : []]), ...(round1 && round1.arms[RV.RULE_ARM] ? [["round1", round1.arms[RV.RULE_ARM].runs.map((r) => r.key)]] : [])]);
    const names = Object.keys(keySets), shared = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const b = new Set(keySets[names[j]]), n = keySets[names[i]].filter((k) => b.has(k)).length; if (n) shared.push(`${names[i].toUpperCase()} and ${names[j].toUpperCase()} share ${n} dives`); }
    rows.push({ name: "DISJOINT", ok: shared.length === 0, text: shared.length ? shared.join("; ") : `no dive is in two of the blocks (${names.join(", ")})` });
    const h = files.h40, start = searches.length ? searches[0].start : null, reBad = [];
    if (h.arms[RV.RULE_ARM] && start !== null && !(Math.abs(mean(h.arms[RV.RULE_ARM].runs) - start) <= TOL)) reBad.push(RV.RULE_ARM);
    for (const s of searches) if (h.arms[s.id] && !(Math.abs(mean(h.arms[s.id].runs) - s.heldOut) <= TOL)) reBad.push(s.id);
    rows.push({ name: "H40 REPRODUCES", ok: reBad.length === 0 && !!h.arms[RV.RULE_ARM], text: !h.arms[RV.RULE_ARM] ? "the 40-dive file has no rule-low06" : reBad.length ? `${reBad.join(", ")}: the 40-dive held-out re-flown here differs from the training line's (so the BIG held-out is not the quantity the champion rule read)` : "the 40-dive held-out of the rule and of every search, re-flown through this module's arms, equals the training lines' to 1e-9" });
    return rows;
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const inverse = (xs) => { if (xs.some((x) => !(x.se > 0))) return { mean: xs.reduce((s, x) => s + x.mean, 0) / xs.length, se: 0 }; const w = xs.map((x) => 1 / (x.se * x.se)), sw = w.reduce((s, x) => s + x, 0); return { mean: xs.reduce((s, x, i) => s + x.mean * w[i], 0) / sw, se: Math.sqrt(1 / sw) }; };
/** One row a search: { id, family, index, eligible, champion, lead40, big: paired, audit: paired, round1: paired | null, pooled: { mean, se } } (paired = { n, mean, se, better, worse, same, badA, badB } over the rule). */
export function leadsOf(files, searches, round1 = null) {
    const a = RV.leadsOf(files.audit, searches), g = RV.leadsOf(files.big, searches), r = round1 ? RV.leadsOf(round1, searches) : null;
    return a.map((row, i) => { const r1 = r ? r[i].audit : null; return { id: row.id, family: row.family, index: row.index, eligible: row.eligible, champion: row.champion, lead40: row.lead, big: g[i].audit, audit: row.audit, round1: r1, pooled: r1 ? inverse([row.audit, r1]) : { mean: row.audit.mean, se: row.audit.se } }; });
}
/** The exact within-family test of held-out measure `h(row)` against audit measure `a(row)` over the rows: RV.exactWithin's result. */
export const rankTest = (rows, h, a) => RV.exactWithin(rows.map(h), rows.map(a), rows.map((r) => r.family));
export const replicationWord = (t) => (t.pPos <= ALPHA ? "THE RANKING REPLICATES" : t.pNeg <= ALPHA ? "THE RANKING IS REVERSED" : "THE RANKING DOES NOT REPLICATE");
export const biggerWord = (t) => (t.pPos <= ALPHA ? "THE BIGGER HELD-OUT RANKS THE SEARCHES" : t.pNeg <= ALPHA ? "THE BIGGER HELD-OUT RANKS THEM BACKWARDS" : "THE BIGGER HELD-OUT DOES NOT RANK THE SEARCHES");
/** The champion of each family by BIG held-out lead among its eligible searches (ties to the lower k): [{ family, h40, big, differ, lead40pick, leadBigPick }] (null picks for a family with no eligible search). */
export function championsBig(rows) {
    return RV.FAMILY_ORDER.map((family) => {
        const el = rows.filter((r) => r.family === family && r.eligible).sort((a, b) => b.big.mean - a.big.mean || a.index - b.index), big = el[0] || null, h40 = el.find((r) => r.champion) || null;
        return { family, h40: h40 ? h40.id : null, big: big ? big.id : null, differ: (h40 ? h40.id : null) !== (big ? big.id : null), lead40pick: h40 ? h40.audit.mean : null, leadBigPick: big ? big.audit.mean : null };
    });
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4)), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
const slopeLine = (o) => (o.slope === null ? "slope not defined" : `slope ${o.slope.toFixed(3)} (se ${o.se.toFixed(3)}), intercept ${sg(o.intercept)}`);
/** THE REPORT: the checks first (a failure is the first line and the verdicts are NOT WEIGHED), the table, Q1 to Q6, the two bottom lines. `opts`: draws and seed of the Monte Carlo, round1 (readAudit's result of round 1's file). Returns the lines. */
export function report(files, searches, opts = {}) {
    const L = [], round1 = opts.round1 || null, checks = checksOf(files, searches, round1), failed = checks.filter((c) => !c.ok);
    for (const k of KEYS) { const rule = files[k].arms[RV.RULE_ARM], b = BLOCKS[k]; if (rule && !SAME_BLOCK(rule, b)) L.push(`NOT THE REGISTERED BLOCK (${k.toUpperCase()}): this file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(", ")}; the registered block is ${b.from} to ${b.to} of ${b.kinds.join(", ")}. A smoke, not the read.`); }
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`);
    L.push(`RANKING REPLICATION (brain/RANKING_REPLICATION_WIP.md): ${searches.length} searches and ${RV.RULE_ARM} on AUDIT 2, on the BIG held-out block and on the original held-out set`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const rows = leadsOf(files, searches, round1), el = rows.filter((r) => r.eligible), draws = opts.draws || RV.MC.draws, seed = opts.seed ?? RV.MC.seed, picks = championsBig(rows), bigPick = new Set(picks.map((p) => p.big));
    L.push("the searches: 40-dive held-out lead, BIG held-out lead (se), AUDIT 2 lead (se), dives better / worse / same, crushed or stranded (the rule's), and round 1's lead when it is here");
    for (const r of rows) L.push(`  ${r.id.padEnd(15)} ${r.champion ? "C40" : "   "} ${bigPick.has(r.id) ? "CBIG" : "    "} ${r.eligible ? "eligible" : "dropped "} h40 ${sg(r.lead40)}  big ${sg(r.big.mean)} (se ${f4(r.big.se)})  audit2 ${sg(r.audit.mean)} (se ${f4(r.audit.se)})  ${r.audit.better} / ${r.audit.worse} / ${r.audit.same}  bad ${r.audit.badA} (${r.audit.badB})${r.round1 ? `  round1 ${sg(r.round1.mean)}` : ""}`);
    const q1 = rankTest(el, (r) => r.lead40, (r) => r.audit.mean), q2 = rankTest(el, (r) => r.big.mean, (r) => r.audit.mean);
    L.push(`Q1 (THE REPLICATION VERDICT) the 40-dive held-out lead against AUDIT 2, within the families, the ${el.length} eligible searches: S = ${q1.s} (${q1.pairs} pairs, ${q1.untied} untied); exact over ${q1.arrangements} arrangements, p that S is as large or larger ${fp(q1.pPos)}, as small or smaller ${fp(q1.pNeg)}: ${replicationWord(q1)}`);
    L.push(`Q2 (THE BIGGER HELD-OUT) the BIG held-out lead against AUDIT 2, the same test: S = ${q2.s} (${q2.pairs} pairs, ${q2.untied} untied); exact over ${q2.arrangements} arrangements, p larger or equal ${fp(q2.pPos)}, smaller or equal ${fp(q2.pNeg)}: ${biggerWord(q2)}`);
    L.push(`Q3 side by side on AUDIT 2 (reported, no verdict): S of the 40-dive ${q1.s} and of the BIG ${q2.s}, the difference BIG minus 40 ${q2.s - q1.s >= 0 ? "+" : ""}${q2.s - q1.s}`);
    for (const [name, h] of [["40-dive", (r) => r.lead40], ["BIG", (r) => r.big.mean]]) {
        const ols = RV.olsOf(el.map(h), el.map((r) => r.audit.mean)), pe = RV.mcPooled(el.map(h), el.map((r) => r.audit.mean), { draws, seed }), pa = RV.mcPooled(rows.map(h), rows.map((r) => r.audit.mean), { draws, seed }), wa = rankTest(rows, h, (r) => r.audit.mean);
        L.push(`  ${name}: ${slopeLine(ols)}; pooled over the ${el.length} eligible S = ${pe.s}, Monte Carlo p (${pe.draws} draws, seed ${seed}) ${fp(pe.pPos)} / ${fp(pe.pNeg)}; pooled over all ${rows.length} S = ${pa.s}, p ${fp(pa.pPos)} / ${fp(pa.pNeg)}; within families over all ${rows.length} S = ${wa.s}, exact p ${fp(wa.pPos)} / ${fp(wa.pNeg)}`);
    }
    L.push("Q4 the champion rule redone with the BIG held-out (the champion of each family by BIG lead among its eligible searches, ties to the lower k), against the 40-dive champion; AUDIT 2 lead of each pick:");
    for (const p of picks) L.push(p.big === null ? `  ${p.family}: no eligible search` : `  ${p.family}: 40-dive ${p.h40} (${sg(p.lead40pick)}), BIG ${p.big} (${sg(p.leadBigPick)})${p.differ ? " -- DIFFERENT" : " -- the same"}`);
    const both = picks.filter((p) => p.big !== null), m40 = both.reduce((s, p) => s + p.lead40pick, 0) / both.length, mbig = both.reduce((s, p) => s + p.leadBigPick, 0) / both.length, hi = both.filter((p) => p.leadBigPick - p.lead40pick > TOL).length, lo = both.filter((p) => p.leadBigPick - p.lead40pick < -TOL).length;
    L.push(`  the picks differ in ${picks.filter((p) => p.differ).length} of ${picks.length} families; the mean AUDIT 2 lead of the six 40-dive champions ${sg(m40)}, of the six BIG picks ${sg(mbig)}, difference ${sg(mbig - m40)}; the BIG pick is higher in ${hi}, lower in ${lo}, the same in ${both.length - hi - lo} families`);
    if (round1) {
        const t1 = rankTest(el, (r) => r.lead40, (r) => r.pooled.mean), t2 = rankTest(el, (r) => r.big.mean, (r) => r.pooled.mean);
        L.push(`Q5 both audit blocks pooled by inverse variance (round 1's and AUDIT 2, 2,400 dives; reported): the 40-dive held-out against the pooled leads S = ${t1.s}, exact p ${fp(t1.pPos)} / ${fp(t1.pNeg)}; the BIG held-out S = ${t2.s}, exact p ${fp(t2.pPos)} / ${fp(t2.pNeg)}`);
        L.push("  the 40-dive champions' leads on round 1's block, on AUDIT 2 and pooled:");
        for (const r of rows.filter((x) => x.champion)) L.push(`    ${r.id.padEnd(15)} round 1 ${sg(r.round1.mean)} (se ${f4(r.round1.se)}), AUDIT 2 ${sg(r.audit.mean)} (se ${f4(r.audit.se)}), pooled ${sg(r.pooled.mean)} (se ${f4(r.pooled.se)}, ${r.pooled.se > 0 ? f4(r.pooled.mean / r.pooled.se) : "n/a"} se)`);
    } else L.push("Q5 both audit blocks pooled: round 1's audit file is not here");
    L.push("Q6 the hull on AUDIT 2 (dives above strain 0.92 and 0.95, the largest strain, crushed, stranded; the rule's: " + (() => { const h = hullNumbers(files.audit.arms[RV.RULE_ARM].runs); return `${h.above[0]}, ${h.above[1]}, ${f4(h.max)}, ${h.crushed}, ${h.stranded}`; })() + "):");
    const six = [...new Set([...rows.filter((r) => r.champion).map((r) => r.id), ...picks.filter((p) => p.big).map((p) => p.big)])];
    for (const id of six) { const h = hullNumbers(files.audit.arms[id].runs), r = rows.find((x) => x.id === id); L.push(`  ${id.padEnd(15)} ${r.champion ? "C40" : "   "} ${bigPick.has(id) ? "CBIG" : "    "} ${h.above[0]} of ${h.dives} above 0.92, ${h.above[1]} above 0.95, largest ${f4(h.max)}, crushed ${h.crushed}, stranded ${h.stranded}`); }
    L.push(`BOTTOM LINE (REPLICATION): ${replicationWord(q1)} (S = ${q1.s} of ${q1.untied} untied pairs, exact p ${fp(q1.pPos)} for a positive S and ${fp(q1.pNeg)} for a negative one)`);
    L.push(`BOTTOM LINE (BIGGER HELD-OUT): ${biggerWord(q2)} (S = ${q2.s} of ${q2.untied} untied pairs, exact p ${fp(q2.pPos)} and ${fp(q2.pNeg)}; the 40-dive S was ${q1.s})`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `report [--audit f] [--big f] [--h40 f] [--round1 f] [--decision f] [--station f] [--draws n]`. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, exists }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    const [cmd, ...rest] = argv;
    if (cmd !== "report") { err(`takeRankingReplication: the first word must be report, got ${JSON.stringify(cmd)}`); return 2; }
    const known = { audit: String, big: String, h40: String, round1: String, decision: String, station: String, draws: Number }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takeRankingReplication: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!(k in known)) { err(`takeRankingReplication: unknown option ${JSON.stringify(a)} (known for report: ${Object.keys(known).map((n) => "--" + n).join(", ")})`); return 2; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takeRankingReplication: ${a} needs a value`); return 2; }
        given[k] = known[k] === Number ? Number(v) : v;
        if (known[k] === Number && !(Number.isInteger(given[k]) && given[k] >= 1)) { err(`takeRankingReplication: ${a} needs a whole number of 1 or more, got ${JSON.stringify(v)}`); return 2; }
    }
    const f = { ...FILES, ...Object.fromEntries(["audit", "big", "h40", "round1"].filter((k) => given[k]).map((k) => [k, given[k]])) }, decision = given.decision || RV.DECISION_FILE, station = given.station || RV.STATION_FILE;
    let searches, files, round1 = null, lines;
    try {
        searches = RV.searchesOf(readRecords(readFile(decision)), readRecords(readFile(station)));
        const ids = searches.map((s) => s.id);
        files = Object.fromEntries(KEYS.map((k) => [k, RV.readAudit(readFile(f[k]), ids)]));
        if (exists(f.round1)) round1 = RV.readAudit(readFile(f.round1), ids);
        for (const k of KEYS) if (!Object.keys(files[k].arms).length) { err(`takeRankingReplication: the ${k} audit file has no records`); return 1; }
        lines = report(files, searches, { draws: given.draws, round1 });
    } catch (e) { err("takeRankingReplication: " + e.message); return 1; }
    for (const l of lines) out(l);
    return 0;
}
