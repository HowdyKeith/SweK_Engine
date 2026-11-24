// WebGLEngine/tools/ship/takeKindMatched.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeKindMatchedCmd.mjs; the registration is brain/KIND_MATCHED_WIP.md, written and committed BEFORE this file and before any search was flown on a new block; the gate is tools/ship/takeKindMatched-selfcheck.mjs)
//
// DOES A HELD-OUT SET OF THE AUDIT'S OWN KINDS RANK THE SEARCHES, AND BETTER THAN A MIXED ONE OF THE SAME SIZE? The 24 searches of the decision-circuit and station-and-price rounds and rule-low06, flown by tools/ship/takeRankingValidityCmd.mjs on three fresh blocks: MIXED (seeds 24001 to 24150 of plain, deep, far and both, 600 dives), MATCHED (24151 to 24450 of far and both, 600 dives) and AUDIT 3 (25001 to 25600 of far and both, 1,200 dives); read beside four files already flown (round 1's audit, AUDIT 2, the BIG block, the 40-dive set).
//   CHECKS (a failure is the first line and the verdict is NOT WEIGHED): SEARCHES, CHAMPIONS, ARMS / WEIGHTS / KEYS / SCORES (in all seven files), DISJOINT (no dive in two files), H40 REPRODUCES. A file that is not its registered block is named as a smoke.
//   Q1 (THE VERDICT): the exact within-family test of the MATCHED held-out lead against TARGET (the three far-and-both audits' leads pooled by inverse variance, 3,600 dives) over the eligible searches: RANKS iff p(S as large) <= 0.05, BACKWARDS iff p(S as small) <= 0.05, else DOES NOT RANK. Q2 to Q7 REPORTED (no verdict): MATCHED beside MIXED with a paired bootstrap of the difference of S over seeds, the champion rule redone with each held-out and an oracle, how well the audits agree, the earlier held-outs against AUDIT 3, which kind carries it, the hull.
// A library: no clock, no Math.random; the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RV from "./takeRankingValidity.mjs";
import * as RR from "./takeRankingReplication.mjs";
import * as B from "../../brain/switchboard.mjs";
import { hullNumbers } from "./takeThirdAudit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const ALL_KINDS = RR.ALL_KINDS, FAR_BOTH = Object.freeze(["far", "both"]);
export const BLOCKS = Object.freeze({
    mixed: Object.freeze({ from: 24001, to: 24150, kinds: ALL_KINDS }), matched: Object.freeze({ from: 24151, to: 24450, kinds: FAR_BOTH }), audit3: Object.freeze({ from: 25001, to: 25600, kinds: FAR_BOTH }),
    audit2: RR.BLOCKS.audit, round1: Object.freeze({ from: RV.RANGE.from, to: RV.RANGE.to, kinds: RV.KINDS }), big: RR.BLOCKS.big, h40: RR.BLOCKS.h40,
});
export const FILES = Object.freeze({ mixed: "brain/kindMatchedMixed.jsonl", matched: "brain/kindMatchedMatched.jsonl", audit3: "brain/kindMatchedAudit3.jsonl", audit2: RR.FILES.audit, round1: RV.AUDIT_FILE, big: RR.FILES.big, h40: RR.FILES.h40 });
export const KEYS = Object.freeze(["mixed", "matched", "audit3", "audit2", "round1", "big", "h40"]), AUDITS = Object.freeze(["round1", "audit2", "audit3"]);
export const ALPHA = RV.ALPHA, TOL = 1e-9, BOOT = Object.freeze({ draws: 2000, seed: 20261108 });
const sameBlock = (rule, b) => !!rule && JSON.stringify(rule.range) === JSON.stringify({ from: b.from, to: b.to }) && JSON.stringify(rule.kinds) === JSON.stringify(b.kinds);

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mean = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
/** The checks, in order: [{ name, ok, text }]. `files` = readAudit's results by KEYS, `searches` searchesOf's. */
export function checksOf(files, searches) {
    const per = Object.fromEntries(KEYS.map((k) => [k, RV.checksOf(files[k], searches)])), by = (k, n) => per[k].find((r) => r.name === n), rows = [];
    rows.push({ name: "SEARCHES", ok: by("audit3", "SEARCHES").ok, text: by("audit3", "SEARCHES").text }, { name: "CHAMPIONS", ok: by("audit3", "CHAMPIONS").ok, text: by("audit3", "CHAMPIONS").text });
    for (const n of ["ARMS", "WEIGHTS", "KEYS", "SCORES"]) { const bad = KEYS.filter((k) => !by(k, n).ok); rows.push({ name: n, ok: bad.length === 0, text: bad.length ? bad.map((k) => `${k.toUpperCase()}: ${by(k, n).text}`).join("; ") : n === "KEYS" ? KEYS.map((k) => `${k.toUpperCase()}: ${by(k, n).text}`).join("; ") : `in all seven files (${KEYS.join(", ")}): ${by("audit3", n).text}` }); }
    const keySets = Object.fromEntries(KEYS.map((k) => [k, files[k].arms[RV.RULE_ARM] ? files[k].arms[RV.RULE_ARM].runs.map((r) => r.key) : []])), shared = [];
    for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) { const b = new Set(keySets[KEYS[j]]), n = keySets[KEYS[i]].filter((x) => b.has(x)).length; if (n) shared.push(`${KEYS[i].toUpperCase()} and ${KEYS[j].toUpperCase()} share ${n} dives`); }
    rows.push({ name: "DISJOINT", ok: shared.length === 0, text: shared.length ? shared.join("; ") : `no dive is in two of the seven files (${KEYS.join(", ")})` });
    const h = files.h40, start = searches.length ? searches[0].start : null, reBad = [];
    if (h.arms[RV.RULE_ARM] && start !== null && !(Math.abs(mean(h.arms[RV.RULE_ARM].runs) - start) <= TOL)) reBad.push(RV.RULE_ARM);
    for (const s of searches) if (h.arms[s.id] && !(Math.abs(mean(h.arms[s.id].runs) - s.heldOut) <= TOL)) reBad.push(s.id);
    rows.push({ name: "H40 REPRODUCES", ok: reBad.length === 0 && !!h.arms[RV.RULE_ARM], text: !h.arms[RV.RULE_ARM] ? "the 40-dive file has no rule-low06" : reBad.length ? `${reBad.join(", ")}: the 40-dive held-out re-flown here differs from the training line's (so the earlier held-outs are not the quantity the champion rule read)` : "the 40-dive held-out of the rule and of every search, re-flown through this module's arms, equals the training lines' to 1e-9" });
    return rows;
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const inverse = (xs) => { if (xs.some((x) => !(x.se > 0))) return { mean: xs.reduce((s, x) => s + x.mean, 0) / xs.length, se: 0 }; const w = xs.map((x) => 1 / (x.se * x.se)), sw = w.reduce((s, x) => s + x, 0); return { mean: xs.reduce((s, x, i) => s + x.mean * w[i], 0) / sw, se: Math.sqrt(1 / sw) }; };
const kindKeep = (kind) => (k) => k.startsWith(kind + ":"), farBoth = (k) => k.startsWith("far:") || k.startsWith("both:");
/** An audit with only the dives whose key `keep` accepts, in every arm. */
export const subAudit = (audit, keep) => ({ arms: Object.fromEntries(Object.entries(audit.arms).map(([id, a]) => [id, { ...a, runs: a.runs.filter((r) => keep(r.key)) }])) });
/** One row a search: { id, family, index, eligible, champion, lead40, mixed, matched, audit3, audit2, round1, big, bigFB (paired over the rule: { n, mean, se, better, worse, same, badA, badB }), kind: { plain, deep, far, both } (the MIXED block's, paired), target: { mean, se } (the three audits pooled by inverse variance) }. */
export function rowsOf(files, searches) {
    const lead = (au) => new Map(RV.leadsOf(au, searches).map((r) => [r.id, r.audit])), m = Object.fromEntries(KEYS.map((k) => [k, lead(files[k])])), bigFB = lead(subAudit(files.big, farBoth)), kinds = Object.fromEntries(ALL_KINDS.map((k) => [k, lead(subAudit(files.mixed, kindKeep(k)))]));
    return searches.filter((s) => KEYS.every((k) => m[k].has(s.id))).map((s) => ({
        id: s.id, family: s.family, index: s.index, eligible: s.eligible, champion: s.champion, lead40: s.lead,
        mixed: m.mixed.get(s.id), matched: m.matched.get(s.id), audit3: m.audit3.get(s.id), audit2: m.audit2.get(s.id), round1: m.round1.get(s.id), big: m.big.get(s.id), bigFB: bigFB.get(s.id),
        kind: Object.fromEntries(ALL_KINDS.map((k) => [k, kinds[k].get(s.id)])), target: inverse(AUDITS.map((k) => m[k].get(s.id))),
    }));
}
/** The exact within-family test of held-out measure `h(row)` against audit measure `a(row)`: RV.exactWithin's result. */
export const rankTest = (rows, h, a) => RV.exactWithin(rows.map(h), rows.map(a), rows.map((r) => r.family));
export const matchedWord = (t) => (t.pPos <= ALPHA ? "THE KIND-MATCHED HELD-OUT RANKS THE SEARCHES" : t.pNeg <= ALPHA ? "THE KIND-MATCHED HELD-OUT RANKS THEM BACKWARDS" : "THE KIND-MATCHED HELD-OUT DOES NOT RANK THE SEARCHES");
export const mixedWord = (t) => (t.pPos <= ALPHA ? "THE MIXED HELD-OUT OF THE SAME SIZE RANKS THE SEARCHES" : t.pNeg <= ALPHA ? "THE MIXED HELD-OUT OF THE SAME SIZE RANKS THEM BACKWARDS" : "THE MIXED HELD-OUT OF THE SAME SIZE DOES NOT RANK THE SEARCHES");
/** The champion of each family among its eligible searches by measure `h` (ties to the lower k), in family order: row | null. */
export const pickBy = (rows, h) => RV.FAMILY_ORDER.map((family) => rows.filter((r) => r.family === family && r.eligible).sort((a, b) => h(b) - h(a) || a.index - b.index)[0] || null);
/** The 40-dive champion of each family (the one the training files name), in family order: row | null. */
export const champions40 = (rows) => RV.FAMILY_ORDER.map((family) => rows.find((r) => r.family === family && r.eligible && r.champion) || null);
/** One seed's mean paired difference over the rule for arm `id`, for each seed of the file in order of first appearance. */
export function seedMeans(audit, id) {
    const rule = audit.arms[RV.RULE_ARM].runs, arm = audit.arms[id].runs, order = [], sums = new Map();
    arm.forEach((r, i) => { const seed = r.key.slice(r.key.indexOf(":") + 1); if (!sums.has(seed)) { sums.set(seed, []); order.push(seed); } sums.get(seed).push(r.score - rule[i].score); });
    return order.map((seed) => { const d = sums.get(seed); return d.reduce((s, x) => s + x, 0) / d.length; });
}
/** The paired bootstrap of S(MATCHED) minus S(MIXED) against TARGET over the eligible searches: the seeds of each block resampled with replacement (the same seeds for every search), `draws` draws, TARGET held fixed: { draws, seed, nMatched, nMixed, mean, lo, hi, above } (lo and hi the 2.5th and 97.5th percentiles, above the share of draws above 0). */
export function bootDiff(files, rows, { draws = BOOT.draws, seed = BOOT.seed } = {}) {
    const el = rows.filter((r) => r.eligible); if (!el.length) throw new Error("takeKindMatched.bootDiff: no eligible search");
    const strata = el.map((r) => r.family), a = el.map((r) => r.target.mean), dm = el.map((r) => seedMeans(files.matched, r.id)), dx = el.map((r) => seedMeans(files.mixed, r.id)), nm = dm[0].length, nx = dx[0].length, rnd = RV.mulberry32(seed), ds = [];
    for (let d = 0; d < draws; d++) {
        const im = Array.from({ length: nm }, () => Math.floor(rnd() * nm)), ix = Array.from({ length: nx }, () => Math.floor(rnd() * nx));
        const hm = dm.map((v) => im.reduce((s, i) => s + v[i], 0) / nm), hx = dx.map((v) => ix.reduce((s, i) => s + v[i], 0) / nx);
        ds.push(RV.sOf(hm, a, strata).s - RV.sOf(hx, a, strata).s);
    }
    const sorted = ds.slice().sort((p, q) => p - q), at = (q) => sorted[Math.floor(q * draws)];
    return { draws, seed, nMatched: nm, nMixed: nx, mean: ds.reduce((s, x) => s + x, 0) / draws, lo: at(0.025), hi: at(0.975), above: ds.filter((x) => x > 0).length / draws };
}
const sdOf = (x) => { const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4)), fp = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(4));
const slopeLine = (o) => (o.slope === null ? "slope not defined" : `slope ${o.slope.toFixed(3)} (se ${o.se.toFixed(3)}), intercept ${sg(o.intercept)}`);
const sLine = (t) => `S = ${t.s} (${t.pairs} pairs, ${t.untied} untied), exact p ${fp(t.pPos)} / ${fp(t.pNeg)}`;
/** THE REPORT: the checks first (a failure is the first line and the verdict is NOT WEIGHED), the table, Q1 to Q7, the bottom lines. `opts`: draws and seed of the bootstrap. Returns the lines. */
export function report(files, searches, opts = {}) {
    const L = [], checks = checksOf(files, searches), failed = checks.filter((c) => !c.ok), smoke = [];
    for (const k of KEYS) { const rule = files[k].arms[RV.RULE_ARM], b = BLOCKS[k]; if (rule && !sameBlock(rule, b)) { smoke.push(k); L.push(`NOT THE REGISTERED BLOCK (${k.toUpperCase()}): this file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(", ")}; the registered block is ${b.from} to ${b.to} of ${b.kinds.join(", ")}. A smoke, not the read.`); } }
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICT IS NOT WEIGHED`);
    L.push(`KIND-MATCHED HELD-OUT (brain/KIND_MATCHED_WIP.md): ${searches.length} searches and ${RV.RULE_ARM} on MIXED, MATCHED and AUDIT 3 (fresh) and on round 1's audit, AUDIT 2, the BIG block and the 40-dive set`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const rows = rowsOf(files, searches), el = rows.filter((r) => r.eligible), tag = smoke.length ? ` [SMOKE: ${smoke.map((k) => k.toUpperCase()).join(", ")} not the registered block]` : "";
    const draws = opts.draws || BOOT.draws, seed = opts.seed ?? BOOT.seed, c40 = champions40(rows), cM = pickBy(rows, (r) => r.matched.mean), cX = pickBy(rows, (r) => r.mixed.mean), cO = pickBy(rows, (r) => r.target.mean);
    const isC = (set, r) => set.includes(r);
    L.push("the searches: 40-dive held-out lead, MIXED lead (se), MATCHED lead (se), TARGET lead (se), AUDIT 3 lead (se), AUDIT 3 dives better / worse / same, crushed or stranded on AUDIT 3 (the rule's); C40 the 40-dive champion, CMA the MATCHED pick, CMI the MIXED pick");
    for (const r of rows) L.push(`  ${r.id.padEnd(15)} ${isC(c40, r) ? "C40" : "   "} ${isC(cM, r) ? "CMA" : "   "} ${isC(cX, r) ? "CMI" : "   "} ${r.eligible ? "eligible" : "dropped "} h40 ${sg(r.lead40)}  mixed ${sg(r.mixed.mean)} (se ${f4(r.mixed.se)})  matched ${sg(r.matched.mean)} (se ${f4(r.matched.se)})  target ${sg(r.target.mean)} (se ${f4(r.target.se)})  audit3 ${sg(r.audit3.mean)} (se ${f4(r.audit3.se)})  ${r.audit3.better} / ${r.audit3.worse} / ${r.audit3.same}  bad ${r.audit3.badA} (${r.audit3.badB})`);
    const q1 = rankTest(el, (r) => r.matched.mean, (r) => r.target.mean), q1m = rankTest(el, (r) => r.mixed.mean, (r) => r.target.mean);
    L.push(`Q1 (THE VERDICT) the MATCHED held-out lead (600 far-and-both dives) against TARGET (the three audits pooled), within the families, the ${el.length} eligible searches: ${sLine(q1)} over ${q1.arrangements} arrangements: ${matchedWord(q1)}`);
    L.push("Q2 MATCHED beside MIXED (600 dives each; reported, no verdict): each held-out against TARGET and against AUDIT 3 alone, the eligible, S and slope");
    for (const [name, h] of [["MATCHED", (r) => r.matched.mean], ["MIXED  ", (r) => r.mixed.mean]]) for (const [an, a] of [["TARGET ", (r) => r.target.mean], ["AUDIT 3", (r) => r.audit3.mean]]) {
        const t = rankTest(el, h, a), ols = RV.olsOf(el.map(h), el.map(a)), wa = rankTest(rows, h, a);
        L.push(`  ${name} against ${an}: ${sLine(t)}; ${slopeLine(ols)}; within families over all ${rows.length} S = ${wa.s}, exact p ${fp(wa.pPos)} / ${fp(wa.pNeg)}`);
    }
    const q2m = rankTest(el, (r) => r.matched.mean, (r) => r.audit3.mean), q2x = rankTest(el, (r) => r.mixed.mean, (r) => r.audit3.mean), bt = bootDiff(files, rows, { draws, seed });
    L.push(`  S(MATCHED) minus S(MIXED): ${q1.s - q1m.s >= 0 ? "+" : ""}${q1.s - q1m.s} against TARGET, ${q2m.s - q2x.s >= 0 ? "+" : ""}${q2m.s - q2x.s} against AUDIT 3; paired bootstrap over seeds of the difference against TARGET (${bt.nMatched} MATCHED seeds, ${bt.nMixed} MIXED seeds, ${bt.draws} draws, seed ${bt.seed}): mean ${bt.mean >= 0 ? "+" : ""}${bt.mean.toFixed(3)}, 2.5th to 97.5th percentile ${bt.lo} to ${bt.hi}, ${bt.above.toFixed(4)} of the draws above 0`);
    L.push("Q3 the champion rule redone (the champion of each family among its eligible searches by each held-out, ties to the lower k); the TARGET lead and the AUDIT 3 lead of each pick, and the oracle (the eligible search of highest TARGET lead):");
    const cell = (r) => (r ? `${r.id} (${sg(r.target.mean)}, ${sg(r.audit3.mean)})` : "none");
    RV.FAMILY_ORDER.forEach((family, i) => L.push(`  ${family}: 40-dive ${cell(c40[i])}, MATCHED ${cell(cM[i])}, MIXED ${cell(cX[i])}, oracle ${cell(cO[i])}`));
    const mu = (set, f) => { const x = set.filter((r) => r); return x.length ? x.reduce((s, r) => s + f(r), 0) / x.length : NaN; }, differ = (p, q) => p.filter((r, i) => (r ? r.id : null) !== (q[i] ? q[i].id : null)).length;
    L.push(`  the MATCHED picks differ from the 40-dive champions in ${differ(cM, c40)} of ${RV.FAMILY_ORDER.length} families, the MIXED picks in ${differ(cX, c40)}; the mean TARGET lead of the six picks: 40-dive ${sg(mu(c40, (r) => r.target.mean))}, MATCHED ${sg(mu(cM, (r) => r.target.mean))}, MIXED ${sg(mu(cX, (r) => r.target.mean))}, oracle ${sg(mu(cO, (r) => r.target.mean))}; the mean AUDIT 3 lead: 40-dive ${sg(mu(c40, (r) => r.audit3.mean))}, MATCHED ${sg(mu(cM, (r) => r.audit3.mean))}, MIXED ${sg(mu(cX, (r) => r.audit3.mean))}, oracle ${sg(mu(cO, (r) => r.audit3.mean))}`);
    L.push("Q4 how well the audits agree (the ceiling of any held-out; the eligible, within families):");
    for (const [x, y] of [["round1", "audit2"], ["round1", "audit3"], ["audit2", "audit3"]]) L.push(`  ${x} against ${y}: ${sLine(rankTest(el, (r) => r[x].mean, (r) => r[y].mean))}`);
    L.push(`  the standard deviation of the TARGET leads over the eligible ${f4(sdOf(el.map((r) => r.target.mean)))}, of the AUDIT 3 leads ${f4(sdOf(el.map((r) => r.audit3.mean)))}; the mean se of one audit's lead ${f4(el.reduce((s, r) => s + r.audit3.se, 0) / el.length)}, of TARGET's ${f4(el.reduce((s, r) => s + r.target.se, 0) / el.length)}`);
    L.push("Q5 the earlier held-outs against the audits (S of the eligible, within families; AUDIT 3 is fresh for all three, AUDIT 2 and round 1's block are where round 8's far-and-both cut was found):");
    for (const [name, h] of [["40-dive set (40)", (r) => r.lead40], ["BIG all kinds (400)", (r) => r.big.mean], ["BIG far and both (200)", (r) => r.bigFB.mean]]) L.push(`  ${name.padEnd(24)} AUDIT 3 ${sLine(rankTest(el, h, (r) => r.audit3.mean))}; AUDIT 2 S = ${rankTest(el, h, (r) => r.audit2.mean).s}; round 1 S = ${rankTest(el, h, (r) => r.round1.mean).s}`);
    L.push("Q6 which kind carries it: the MIXED block's lead from one kind's 150 dives against TARGET (the eligible):");
    for (const k of ALL_KINDS) L.push(`  ${k.padEnd(5)} (${el[0].kind[k].n} dives): ${sLine(rankTest(el, (r) => r.kind[k].mean, (r) => r.target.mean))}`);
    const rule = hullNumbers(files.audit3.arms[RV.RULE_ARM].runs);
    L.push(`Q7 the hull on AUDIT 3 (dives above strain 0.92 and 0.95, the largest strain, crushed, stranded; the rule's: ${rule.above[0]}, ${rule.above[1]}, ${f4(rule.max)}, ${rule.crushed}, ${rule.stranded}):`);
    for (const r of rows.filter((x) => isC(c40, x) || isC(cM, x))) { const h = hullNumbers(files.audit3.arms[r.id].runs); L.push(`  ${r.id.padEnd(15)} ${isC(c40, r) ? "C40" : "   "} ${isC(cM, r) ? "CMA" : "   "} ${h.above[0]} of ${h.dives} above 0.92, ${h.above[1]} above 0.95, largest ${f4(h.max)}, crushed ${h.crushed}, stranded ${h.stranded}`); }
    L.push(`BOTTOM LINE (KIND-MATCHED): ${matchedWord(q1)}${tag} (S = ${q1.s} of ${q1.untied} untied pairs, exact p ${fp(q1.pPos)} for a positive S and ${fp(q1.pNeg)} for a negative one)`);
    L.push(`BOTTOM LINE (MIXED, FOR COMPARISON, NO VERDICT): ${mixedWord(q1m)}${tag} (S = ${q1m.s} of ${q1m.untied} untied pairs, exact p ${fp(q1m.pPos)} and ${fp(q1m.pNeg)}; the MATCHED S was ${q1.s}; bootstrap 2.5th to 97.5th percentile of the difference ${bt.lo} to ${bt.hi})`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `report [--mixed f] [--matched f] [--audit3 f] [--audit2 f] [--round1 f] [--big f] [--h40 f] [--decision f] [--station f] [--draws n]`. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, exists }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    const [cmd, ...rest] = argv;
    if (cmd !== "report") { err(`takeKindMatched: the first word must be report, got ${JSON.stringify(cmd)}`); return 2; }
    const known = { ...Object.fromEntries(KEYS.map((k) => [k, String])), decision: String, station: String, draws: Number }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takeKindMatched: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!(k in known)) { err(`takeKindMatched: unknown option ${JSON.stringify(a)} (known for report: ${Object.keys(known).map((n) => "--" + n).join(", ")})`); return 2; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takeKindMatched: ${a} needs a value`); return 2; }
        given[k] = known[k] === Number ? Number(v) : v;
        if (known[k] === Number && !(Number.isInteger(given[k]) && given[k] >= 1)) { err(`takeKindMatched: ${a} needs a whole number of 1 or more, got ${JSON.stringify(v)}`); return 2; }
    }
    const f = { ...FILES, ...Object.fromEntries(KEYS.filter((k) => given[k]).map((k) => [k, given[k]])) }, decision = given.decision || RV.DECISION_FILE, station = given.station || RV.STATION_FILE;
    let searches, files, lines;
    try {
        searches = RV.searchesOf(readRecords(readFile(decision)), readRecords(readFile(station)));
        const ids = searches.map((s) => s.id);
        for (const k of KEYS) if (!exists(f[k])) { err(`takeKindMatched: the ${k} audit file ${f[k]} is not here`); return 1; }
        files = Object.fromEntries(KEYS.map((k) => [k, RV.readAudit(readFile(f[k]), ids)]));
        for (const k of KEYS) if (!Object.keys(files[k].arms).length) { err(`takeKindMatched: the ${k} audit file has no records`); return 1; }
        lines = report(files, searches, { draws: given.draws });
    } catch (e) { err("takeKindMatched: " + e.message); return 1; }
    for (const l of lines) out(l);
    return 0;
}
