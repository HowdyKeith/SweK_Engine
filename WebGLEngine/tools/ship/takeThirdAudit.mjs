// WebGLEngine/tools/ship/takeThirdAudit.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeThirdAuditCmd.mjs; the registration is brain/PLAIN_THIRD_AUDIT_WIP.md, written BEFORE this file and before either arm was flown on the block; the gate is tools/ship/takeThirdAudit-selfcheck.mjs)
//
// THE THIRD AUDIT OF THE PLAIN NET: `circuit-plain` (the search `plain:2` of brain/decisionCircuitTraining.jsonl, digest c916e7f5) against `rule-low06` on seeds 20001 to 20600 of far and both (1,200 dives an arm), flown by `tools/ship/takeRankingValidityCmd.mjs fly --arms rule-low06,plain:2 --from 20001 --to 20600 --out brain/plainThirdAudit.jsonl`. THIS FILE FLIES NOTHING: it reads that file (and the earlier audit files) and prints the reading.
//   Q1 (THE VERDICT): the paired mean lead on the block: REPLICATES iff positive and above 2 se; BELOW iff negative and below -2 se; else a TIE. No edge floor is applied to this verdict (registered): the question is whether a lead of a few thousandths exists.
//   Q2 (REPORTED): the inverse-variance pool of the three audits and whether it reaches the series' floor (0.02); the better / worse / same dives; the hull (strain above 0.92 and 0.95, the largest strain, crushed and stranded dives, Round 33's test); the fourth reading from round 1's flight.
//   CHECKS (a failure is the first line and the verdict is NOT WEIGHED): ARMS (the rule and plain:2 once each, nothing else), WEIGHTS (the digest c916e7f5), KEYS (the same dives in the same order), SCORES (finite, in [0, 1], every strain a number or null).
// A library: no clock, no Math.random; the files are read through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../../brain/switchboard.mjs";
import { keysOf, hullOf } from "./takeDecisionCircuit.mjs";
import { MIN_EDGE } from "./trainNeedsCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const RANGE = Object.freeze({ from: 20001, to: 20600 }), KINDS = Object.freeze(["far", "both"]), AUDIT_FILE = "brain/plainThirdAudit.jsonl";
export const RULE_ARM = "rule-low06", PLAIN_ARM = "plain:2", ARM_IDS = Object.freeze([RULE_ARM, PLAIN_ARM]), PLAIN_DIGEST = "c916e7f5";
export const FIRST_FILE = "brain/decisionCircuitAudit.jsonl", SECOND_FILE = "brain/stationRoundAudit.jsonl", FOURTH_FILE = "brain/rankingValidityAudit.jsonl";
export const Z = B.SE_FACTOR, THRESHOLDS = Object.freeze([0.92, 0.95]), FLOOR = MIN_EDGE;

// ---- the audit file ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The lines of the audit file by arm; an arm that is not the rule or plain:2, an arm twice or a line with no arm is refused. */
export function readAudit(text) {
    const arms = {};
    for (const r of readRecords(text)) {
        if (typeof r.arm !== "string") throw new Error("takeThirdAudit.readAudit: a line has no arm");
        if (!ARM_IDS.includes(r.arm)) throw new Error(`takeThirdAudit.readAudit: unknown arm ${JSON.stringify(r.arm)} (${ARM_IDS.join(", ")})`);
        if (arms[r.arm]) throw new Error(`takeThirdAudit.readAudit: arm ${r.arm} is in the file twice (the audit is read once)`);
        arms[r.arm] = r;
    }
    return { arms };
}
/** The checks, in order: [{ name, ok, text }]. */
export function checksOf(audit) {
    const rows = [], missing = ARM_IDS.filter((a) => !audit.arms[a]), rule = audit.arms[RULE_ARM], plain = audit.arms[PLAIN_ARM];
    rows.push({ name: "ARMS", ok: missing.length === 0, text: missing.length ? `not flown: ${missing.join(", ")}` : `${RULE_ARM} and ${PLAIN_ARM}, once each` });
    rows.push({ name: "WEIGHTS", ok: !!plain && plain.digest === PLAIN_DIGEST, text: !plain ? `${PLAIN_ARM} was not flown` : plain.digest === PLAIN_DIGEST ? `${PLAIN_ARM} flew the weights of the plain net the earlier audits flew (digest ${PLAIN_DIGEST})` : `${PLAIN_ARM} flew other weights (digest ${plain.digest}) than the plain net the earlier audits flew (${PLAIN_DIGEST})` });
    let keyBad = null;
    if (rule && plain) { const want = keysOf(rule.range, rule.kinds); keyBad = [RULE_ARM, PLAIN_ARM].filter((n) => JSON.stringify(audit.arms[n].runs.map((r) => r.key)) !== JSON.stringify(want) || JSON.stringify(audit.arms[n].range) !== JSON.stringify(rule.range) || JSON.stringify(audit.arms[n].kinds) !== JSON.stringify(rule.kinds)); }
    rows.push({ name: "KEYS", ok: keyBad !== null && keyBad.length === 0, text: keyBad === null ? "both arms are needed to compare the dives" : keyBad.length ? `${keyBad.join(", ")} did not fly the dives of the rule's file in the same order` : `both arms flew the same ${rule.runs.length} dives in the same order (seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(" and ")})` });
    const sBad = ARM_IDS.filter((n) => audit.arms[n] && audit.arms[n].runs.some((r) => !(Number.isFinite(r.score) && r.score >= 0 && r.score <= 1) || !(r.maxStrain === null || Number.isFinite(r.maxStrain))));
    rows.push({ name: "SCORES", ok: sBad.length === 0 && missing.length === 0, text: sBad.length ? `${sBad.join(", ")} hold a score outside [0, 1] or a strain that is not a number` : missing.length ? "an arm is missing" : "every score is a number in [0, 1] and every strain a number or null" });
    return rows;
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Q1's reading of a paired lead { mean, se }: "REPLICATES" / "BELOW" / "TIE" (a mean within 1e-9 of 0 is a tie). */
export const readingOf = (p) => (Math.abs(p.mean) <= 1e-9 ? "TIE" : p.mean > 0 && p.mean > Z * p.se ? "REPLICATES" : p.mean < 0 && -p.mean > Z * p.se ? "BELOW" : "TIE");
export const bottomLine = (rd) => (rd === "REPLICATES" ? "THE PLAIN NET'S GAIN REPLICATES" : rd === "BELOW" ? "THE PLAIN NET IS BELOW THE RULE" : "THE PLAIN NET'S GAIN DOES NOT REPLICATE (A TIE)");
/** The inverse-variance pool of leads [{ mean, se }]: { mean, se, z, reachesFloor }. A lead with se 0 is refused (it would carry all the weight). */
export function pool(leads) {
    if (!leads.length) throw new Error("takeThirdAudit.pool: no leads");
    for (const l of leads) if (!(l.se > 0)) throw new Error("takeThirdAudit.pool: a lead has no spread (se " + l.se + ")");
    const w = leads.map((l) => 1 / (l.se * l.se)), sw = w.reduce((s, x) => s + x, 0), mean = leads.reduce((s, l, i) => s + l.mean * w[i], 0) / sw, se = Math.sqrt(1 / sw);
    return { mean, se, z: mean / se, reachesFloor: mean >= FLOOR };
}
/** The hull numbers of one arm's runs: dives with a strain above each threshold, the largest strain, crushed, stranded, and crushed-or-stranded (`bad`). */
export function hullNumbers(runs) {
    const strains = runs.map((r) => r.maxStrain).filter((x) => x !== null);
    return { dives: runs.length, above: THRESHOLDS.map((t) => runs.filter((r) => r.maxStrain !== null && r.maxStrain > t).length), max: strains.length ? Math.max(...strains) : null, crushed: runs.filter((r) => r.crushed).length, stranded: runs.filter((r) => r.stranded).length, bad: runs.filter((r) => r.bad).length };
}
/** An earlier audit's lead of plain-net arm `armId` over the rule from the file's text: { mean, se, n, range } or null when the file has no such arm or no rule. */
export function leadFrom(text, armId) {
    if (text == null) return null;
    const recs = readRecords(text), rule = recs.find((r) => r.arm === RULE_ARM), arm = recs.find((r) => r.arm === armId);
    if (!rule || !arm) return null;
    const p = B.paired(arm.runs, rule.runs);
    return { mean: p.mean, se: p.se, n: p.n, range: arm.range };
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4));
/** THE REPORT: the checks first (a failure is the first line and the verdict is NOT WEIGHED), Q1, Q2, the bottom line. `earlier`: { first, second, fourth } (leadFrom's results or null). Returns the lines. */
export function report(audit, earlier = {}) {
    const L = [], checks = checksOf(audit), failed = checks.filter((c) => !c.ok), rule = audit.arms[RULE_ARM];
    if (rule && (JSON.stringify(rule.range) !== JSON.stringify(RANGE) || JSON.stringify(rule.kinds) !== JSON.stringify(KINDS))) L.push(`NOT THE REGISTERED BLOCK: this file flew seeds ${rule.range.from} to ${rule.range.to} of ${rule.kinds.join(" and ")}; the registered block is ${RANGE.from} to ${RANGE.to} of ${KINDS.join(" and ")}. A smoke, not the read.`);
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICT IS NOT WEIGHED`);
    L.push(`THE THIRD AUDIT OF THE PLAIN NET (brain/PLAIN_THIRD_AUDIT_WIP.md): ${PLAIN_ARM} (circuit-plain) against ${RULE_ARM}, paired dive by dive`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const plain = audit.arms[PLAIN_ARM], p = B.paired(plain.runs, rule.runs), rd = readingOf(p);
    L.push(`Q1 (THE VERDICT) the lead on ${p.n} dives: ${sg(p.mean)} (se ${f4(p.se)}, ${f4(p.mean / p.se)} se); better ${p.better}, worse ${p.worse}, same ${p.same}: ${rd}`);
    const prev = [["first audit", earlier.first], ["second audit", earlier.second]].filter(([, x]) => x);
    const leads = [...prev.map(([, x]) => x), { mean: p.mean, se: p.se }];
    if (prev.length) { for (const [name, x] of prev) L.push(`  the ${name} (seeds ${x.range.from} to ${x.range.to}): ${sg(x.mean)} (se ${f4(x.se)}, ${x.n} dives)`); const q = pool(leads); L.push(`Q2a the pool of ${leads.length} audits by inverse variance: ${sg(q.mean)} (se ${f4(q.se)}, ${f4(q.z)} se); reaches the series' floor of ${FLOOR}: ${q.reachesFloor ? "YES" : "NO"}`); } else L.push("Q2a the pool of the audits: the earlier audit files are not here");
    const hp = hullNumbers(plain.runs), hr = hullNumbers(rule.runs);
    L.push(`Q2c the hull -- ${PLAIN_ARM}: strain above 0.92 in ${hp.above[0]} of ${hp.dives} dives, above 0.95 in ${hp.above[1]}, largest ${f4(hp.max)}, crushed ${hp.crushed}, stranded ${hp.stranded}; ${RULE_ARM}: ${hr.above[0]}, ${hr.above[1]}, largest ${f4(hr.max)}, crushed ${hr.crushed}, stranded ${hr.stranded}; Round 33's test (crushed plus stranded ${hp.bad} against ${hr.bad}): ${hullOf(hp.bad, hr.bad)}`);
    if (earlier.fourth) L.push(`Q2d the fourth reading, round 1's flight (seeds ${earlier.fourth.range.from} to ${earlier.fourth.range.to}, ${earlier.fourth.n} dives): ${sg(earlier.fourth.mean)} (se ${f4(earlier.fourth.se)}), beside this one and not pooled into the verdict`);
    L.push(`BOTTOM LINE: ${bottomLine(rd)} (${sg(p.mean)}, se ${f4(p.se)}, on ${p.n} dives of seeds ${rule.range.from} to ${rule.range.to}; the hull: ${hullOf(hp.bad, hr.bad)}, ${hp.above[0]} dives above 0.92 against ${hr.above[0]})`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `report --in <audit file> [--first f] [--second f] [--fourth f]`. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, exists }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    const [cmd, ...rest] = argv;
    if (cmd !== "report") { err(`takeThirdAudit: the first word must be report, got ${JSON.stringify(cmd)}`); return 2; }
    const known = ["in", "first", "second", "fourth"], given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takeThirdAudit: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!known.includes(k)) { err(`takeThirdAudit: unknown option ${JSON.stringify(a)} (known for report: ${known.map((n) => "--" + n).join(", ")})`); return 2; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takeThirdAudit: ${a} needs a value`); return 2; }
        given[k] = v;
    }
    if (!given.in) { err("takeThirdAudit: report needs --in <audit file>"); return 2; }
    const first = given.first || FIRST_FILE, second = given.second || SECOND_FILE, fourth = given.fourth || FOURTH_FILE;
    let audit, earlier; try { audit = readAudit(readFile(given.in)); earlier = { first: leadFrom(exists(first) ? readFile(first) : null, "circuit-plain"), second: leadFrom(exists(second) ? readFile(second) : null, "circuit-plain"), fourth: leadFrom(exists(fourth) ? readFile(fourth) : null, PLAIN_ARM) }; } catch (e) { err("takeThirdAudit: " + e.message); return 1; }
    if (!Object.keys(audit.arms).length) { err("takeThirdAudit: the audit file has no records"); return 1; }
    let lines; try { lines = report(audit, earlier); } catch (e) { err("takeThirdAudit: " + e.message); return 1; }
    for (const l of lines) out(l); return 0;
}
