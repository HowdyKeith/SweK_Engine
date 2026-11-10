// WebGLEngine/tools/ship/takeDecisionCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeDecisionCircuitCmd.mjs, which says the first-order orientation step out loud; the training is tools/ship/trainDecisionCircuit.mjs; the policies are brain/circuitSeat.mjs; the registration is brain/DECISION_CIRCUIT_VS_TWIN_WIP.md; the gate is tools/ship/takeDecisionCircuit-selfcheck.mjs)
//
// THE STUDY OF THE DECISION CIRCUIT AGAINST THE TWIN (registered in brain/DECISION_CIRCUIT_VS_TWIN_WIP.md before any code): the survey run (noisy gauge sd 0.10, kinds far and both) flown through the switchboard (brain/switchboard.mjs) by SIX arms --
//   rule-r8 (the Round 8 constants; reported), rule-low06 (the circuit's control and the twin's control), twin-standard (the planner, replan 120 s), circuit-cx (the re-based reservoir with its memory), circuit-nostate (the same, state zeroed before every update), circuit-plain (a relu net of the same weight count)
// on the AUDIT block, seeds 17001 to 17300 of each kind (600 dives an arm), READ ONCE. A circuit arm is flown from the CHAMPION its family's training file names (tools/ship/trainDecisionCircuit.mjs `championOf`, chosen before the audit was touched); a family with no eligible champion is flown as the untrained circuit,
// which IS rule-low06, and is reported as that (Round 3 section 7).
//   `fly` writes one JSON line a finished arm (and the START rows) to a results file, resumable, any number of worker processes; `report` reads that file and the training file, OFFLINE: the checks first, then the verdicts.
//   CHECKS (a failure is the first line of the report and the verdicts are NOT WEIGHED): TRAINING FILE (twelve searches, one recipe, one start), START (the untrained cx, nostate and plain equal rule-low06 on 24 baseline dives, scores AND fingerprints), KEYS (every arm flew the registered scenarios in the registered order),
//   CHAMPIONS (every circuit arm was flown from the champion the training file names, by a digest of its weights), SCORES (finite, in [0, 1]). CALIBRATION is a line that cannot fail: twin-standard minus rule-low06 on this block, to be read against +0.012 to +0.033.
//   VERDICTS (pooled paired differences over the 600 dives): a pair BEATS iff the mean paired difference is positive, above 2 se AND at least 0.02 (the series' floor, MIN_EDGE); IS BELOW iff the mirror; else TIES. V1 cx / rule-low06; V2 cx / nostate and cx / plain; V3 cx / twin-standard;
//   V4 the hull, crushed plus stranded dives of cx against rule-low06's by Round 33's test (b - b0 <= 2 sqrt(b + b0)): NO WORSE / PAYS MORE. The BOTTOM LINE is the first of five that applies.
// THE SEEDS ARE READ ONLY BY `fly`. A library: no clock, no Math.random; the files are read and written by the command, through the seams `io` gives.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as T from "../../brain/needsTask.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as SV from "../../brain/surveySeat.mjs";
import * as D from "./trainDecisionCircuit.mjs";
import { MIN_EDGE } from "./trainNeedsCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const RANGE = Object.freeze({ from: 17001, to: 17300 }), KINDS = Object.freeze(["far", "both"]), TRAINING_FILE = D.OUT_FILE, AUDIT_FILE = "brain/decisionCircuitAudit.jsonl";
export const RULE_ARMS = Object.freeze(["rule-r8", "rule-low06"]), TWIN_ARM = "twin-standard", CIRCUIT_OF = Object.freeze({ "circuit-cx": "cx", "circuit-nostate": "nostate", "circuit-plain": "plain" });
export const ARM_IDS = Object.freeze([...RULE_ARMS, TWIN_ARM, ...Object.keys(CIRCUIT_OF)]), START = "START", FLIGHTS = Object.freeze([...ARM_IDS, START]);
export const START_KINDS = Object.freeze(["plain", "deep", "far", "both"]), START_SEEDS = Object.freeze({ from: 501, to: 506 }), START_COUNT = 24;
export { MIN_EDGE };

/** The registered scenario keys, kind-major: far:17001 .. far:17300, both:17001 .. both:17300. */
export const keysOf = (range = RANGE, kinds = KINDS) => kinds.flatMap((k) => Array.from({ length: range.to - range.from + 1 }, (_, i) => `${k}:${range.from + i}`));
/** A digest of a weight vector as the Float32 numbers a pilot is built from (FNV-1a over their bytes, eight hex digits). */
export function digestOf(weights) {
    const bytes = new Uint8Array(Float32Array.from(weights).buffer); let h = 0x811c9dc5;
    for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
}

// ---- the arms ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The pilot of a circuit arm and the champion it is flown from: { pilot, champion: { family, k, seed, digest, asRule } } -- the champion of the family's records, or the untrained circuit (which IS rule-low06) when none is eligible. */
export function circuitArm(armId, records) {
    const family = CIRCUIT_OF[armId]; if (!family) throw new Error(`takeDecisionCircuit.circuitArm: ${JSON.stringify(armId)} is not a circuit arm (${Object.keys(CIRCUIT_OF).join(", ")})`);
    const Pol = D.familyPolicy(family), c = D.championOf(records, family), w = c.record ? Float32Array.from(c.record.weights) : Pol.handWeights();
    if (w.length !== Pol.WEIGHT_COUNT) throw new Error(`takeDecisionCircuit.circuitArm: ${armId} has ${w.length} champion weights and its policy takes ${Pol.WEIGHT_COUNT}`);
    return { pilot: () => Pol.pilotFor(w), champion: { family, k: c.record ? c.record.index : null, seed: c.record ? c.record.seed : null, digest: digestOf(w), asRule: !c.record } };
}
/** The board of the study: the survey task and the six arms (the rules and the twin are the switchboard's own, imported and not edited). `records` are the lines of the training file. */
export function boardOf(records) {
    const b = B.createBoard().addTask(B.surveyTask), base = B.surveyArms();
    for (const id of [...RULE_ARMS, TWIN_ARM]) { const a = base.find((x) => x.id === id); if (!a) throw new Error(`takeDecisionCircuit.boardOf: the switchboard has no arm ${id}`); b.addArm(a); }
    for (const id of Object.keys(CIRCUIT_OF)) b.addArm({ id, layer: "decision", controls: ["rule-low06"], pilot: circuitArm(id, records).pilot, note: `the decision circuit, ${CIRCUIT_OF[id]}` });
    return b;
}
/** One arm flown once: the record the results file keeps. opts: range, kinds, seconds (the gate shortens the dive). */
export function flyArm(armId, records, { range = RANGE, kinds = KINDS, seconds = null } = {}) {
    if (!ARM_IDS.includes(armId)) throw new Error(`takeDecisionCircuit.flyArm: unknown arm ${JSON.stringify(armId)} (${ARM_IDS.join(", ")})`);
    const runs = boardOf(records).run("survey", [armId], range, { kinds: [...kinds], ...(seconds ? { seconds } : {}) }).runs[armId];
    return { arm: armId, range: { ...range }, kinds: [...kinds], seconds: seconds || null, runs: runs.map((r) => ({ key: r.key, score: r.score, bad: !!r.bad })), ...(CIRCUIT_OF[armId] ? { champion: circuitArm(armId, records).champion } : {}) };
}
/** The START rows: the untrained cx, nostate and plain pilots against rule-low06 on 24 baseline dives (seeds 501-506 of the four kinds, the noisy gauge): score and fingerprint of each. */
export function startRows(seconds = null) {
    const rule = T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), fam = Object.fromEntries(D.FAMILIES.map((f) => [f, D.familyPolicy(f)])), rows = [];
    for (const kind of START_KINDS) for (let seed = START_SEEDS.from; seed <= START_SEEDS.to; seed++) {
        const c = T.scenario(seed, kind), o = { gauge: T.GAUGE, ...(seconds ? { seconds } : {}) }, one = (p) => { const r = T.fly(p, c, o); return { score: r.score, fingerprint: r.fingerprint }; };
        rows.push({ key: `${kind}:${seed}`, rule: one(rule), ...Object.fromEntries(D.FAMILIES.map((f) => [f, one(fam[f].pilotFor(fam[f].handWeights()))])) });
    }
    return { arm: START, seconds: seconds || null, rows };
}

// ---- the reading ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
/** The registered reading of a paired difference: BEATS iff the mean is positive, above 2 se AND at least MIN_EDGE; IS BELOW iff the mirror; else TIES. */
export const readingOf = (p) => (p.mean > 0 && p.mean > B.SE_FACTOR * p.se && p.mean >= MIN_EDGE ? "BEATS" : p.mean < 0 && -p.mean > B.SE_FACTOR * p.se && -p.mean >= MIN_EDGE ? "IS BELOW" : "TIES");
/** Round 33's hull test: NO WORSE iff b - b0 <= 2 sqrt(b + b0) (b the arm's crushed plus stranded dives, b0 the control's), else PAYS MORE. */
export const hullOf = (b, b0) => (b - b0 <= 2 * Math.sqrt(b + b0) ? "NO WORSE" : "PAYS MORE");
export const badCount = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0);
const rd = (au, a, b) => { const p = B.paired(au.runs[a], au.runs[b]); return { ...p, reading: readingOf(p) }; };
/** The audit as the verdicts read it: { runs: { armId: [...] }, range, kinds } -> { v1, v2n, v2p, v3, v4, calibration, b, b0 }. */
export function verdictsOf(au) {
    const b = badCount(au.runs["circuit-cx"]), b0 = badCount(au.runs["rule-low06"]);
    return { v1: rd(au, "circuit-cx", "rule-low06"), v2n: rd(au, "circuit-cx", "circuit-nostate"), v2p: rd(au, "circuit-cx", "circuit-plain"), v3: rd(au, "circuit-cx", TWIN_ARM), v4: hullOf(b, b0), b, b0, calibration: B.paired(au.runs[TWIN_ARM], au.runs["rule-low06"]) };
}
/** The first of the five registered bottom lines that applies. */
export function bottomLine(v, n = null) {
    if (v.v4 === "PAYS MORE") return `THE CIRCUIT BUYS ITS SCORE WITH THE HULL (V4: ${v.b} crushed or stranded dives against the rule's ${v.b0})`;
    if (v.v1.reading !== "BEATS") return `THE CIRCUIT IS THE RULE (V1 ${v.v1.reading}: ${sgn(v.v1.mean)}, se ${f4(v.v1.se)})`;
    const both = `V2 against nostate ${v.v2n.reading}, against plain ${v.v2p.reading}; V4 ${v.v4}`;
    if (v.v3.reading === "IS BELOW") return `THE CIRCUIT BEATS ITS RULE AND NOT THE PLANNER (V1 ${sgn(v.v1.mean)}, V3 ${sgn(v.v3.mean)}; ${both})` + (v.v2n.reading === "TIES" && v.v2p.reading === "TIES" ? "; ...AND NEITHER ITS MEMORY NOR ITS RESERVOIR IS WHAT DID IT" : "");
    if (v.v3.reading === "TIES") return `THE CIRCUIT AND THE PLANNER CANNOT BE TOLD APART (V1 ${sgn(v.v1.mean)}, V3 ${sgn(v.v3.mean)}; ${n || v.v3.n} dives resolve a difference of about 2 se = ${f4(B.SE_FACTOR * v.v3.se)}; ${both})`;
    return `THE CIRCUIT BEATS THE PLANNER (V1 ${sgn(v.v1.mean)}, V3 ${sgn(v.v3.mean)}; ${both})`;
}

// ---- the results file --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The lines of a results file: { arms: { armId: record }, start: record | null }. A duplicate arm and an unknown arm are refused by name. */
export function readAudit(text) {
    const arms = {}; let start = null;
    for (const r of readRecords(text)) {
        if (r.arm === START) { if (start) throw new Error("takeDecisionCircuit.readAudit: the START rows are in the file twice"); start = r; continue; }
        if (!ARM_IDS.includes(r.arm)) throw new Error(`takeDecisionCircuit.readAudit: unknown arm ${JSON.stringify(r.arm)}`);
        if (arms[r.arm]) throw new Error(`takeDecisionCircuit.readAudit: arm ${r.arm} is in the file twice (the audit is read once)`);
        arms[r.arm] = r;
    }
    return { arms, start };
}
/** The checks, in order: [{ name, ok, text }]. `audit` is readAudit's result, `training` the lines of the training file. */
export function checksOf(audit, training) {
    const rows = [], arms = audit.arms, have = ARM_IDS.filter((a) => arms[a]);
    const tf = D.checksOf(training || []); rows.push({ name: "TRAINING FILE", ok: tf.length === 0, text: tf.length ? tf.join("; ") : "twelve searches (three families of four), one recipe, one start" });
    const s = audit.start, sOk = !!s && Array.isArray(s.rows) && s.rows.length === START_COUNT && new Set(s.rows.map((r) => r.key)).size === START_COUNT && s.rows.every((r) => D.FAMILIES.every((f) => r[f] && r.rule && r[f].score === r.rule.score && r[f].fingerprint === r.rule.fingerprint));
    rows.push({ name: "START", ok: sOk, text: !s ? "the START rows are missing" : sOk ? `the untrained cx, nostate and plain equal rule-low06 on ${START_COUNT} baseline dives, scores and fingerprints` : `the untrained circuits differ from rule-low06 on ${s.rows ? s.rows.filter((r) => !D.FAMILIES.every((f) => r[f] && r.rule && r[f].score === r.rule.score && r[f].fingerprint === r.rule.fingerprint)).length : "?"} of ${s.rows ? s.rows.length : "?"} baseline dives (need ${START_COUNT})` });
    const missing = ARM_IDS.filter((a) => !arms[a]);
    if (missing.length) { rows.push({ name: "KEYS", ok: false, text: `the arm(s) ${missing.join(", ")} are missing from the file` }); return rows; }
    const r0 = arms[ARM_IDS[0]], want = keysOf(r0.range, r0.kinds), sameFlight = ARM_IDS.every((a) => JSON.stringify(arms[a].range) === JSON.stringify(r0.range) && JSON.stringify(arms[a].kinds) === JSON.stringify(r0.kinds) && arms[a].seconds === r0.seconds);
    const keysOk = sameFlight && ARM_IDS.every((a) => arms[a].runs.length === want.length && arms[a].runs.every((r, i) => r.key === want[i]));
    rows.push({ name: "KEYS", ok: keysOk, text: keysOk ? `every arm flew the same ${want.length} dives in the same order (${r0.kinds.join(" and ")}, seeds ${r0.range.from} to ${r0.range.to})` : sameFlight ? "the arms did not all fly the same dives in the same order" : "the arms were not all flown over one range, one set of kinds and one dive length" });
    const bad = [];
    for (const id of Object.keys(CIRCUIT_OF)) {
        const c = D.championOf(training || [], CIRCUIT_OF[id]), got = arms[id].champion, wantW = c.record ? digestOf(c.record.weights) : null;
        const okc = !!got && (c.record ? !got.asRule && got.k === c.record.index && got.seed === c.record.seed && got.digest === wantW : got.asRule === true && got.k === null);
        if (!okc) bad.push(`${id} was flown from ${got ? (got.asRule ? "the untrained circuit" : `k ${got.k}`) : "no champion record"} and the training file names ${c.record ? `k ${c.record.index}` : "none"}`);
    }
    rows.push({ name: "CHAMPIONS", ok: bad.length === 0, text: bad.length ? bad.join("; ") : "every circuit arm was flown from the champion the training file names (a family with none eligible, from the untrained circuit)" });
    const fin = ARM_IDS.every((a) => arms[a].runs.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 1));
    rows.push({ name: "SCORES", ok: fin, text: `every score is a number in [0, 1]: ${fin}` });
    return rows;
}
/** The ledger of the training for the report (registered section 4): per family the eligible searches, the champion and its movement from the start. */
export function ledgerLines(training) {
    const out = [];
    for (const l of D.reportLines(training || [])) out.push(l);
    for (const f of D.FAMILIES) {
        const c = D.championOf(training || [], f); if (!c.record) continue;
        const hand = D.familyPolicy(f).handWeights(), delta = c.record.weights.map((v, i) => Math.abs(v - hand[i])), large = Math.max(...delta);
        out.push(`  ${f.padEnd(8)} champion k ${c.record.index}: ${c.record.kept} weights moved from the start, the largest by ${large.toFixed(4)}; last training score ${f4(c.record.trainScore)} against the start's ${f4(c.record.start.train)} (${sgn(c.record.trainScore - c.record.start.train)})`);
    }
    return out;
}
const fmtP = (p) => `${sgn(p.mean)} (se ${f4(p.se)}; better ${p.better}, worse ${p.worse}, same ${p.same}; bad ${p.badA} against ${p.badB}) ${p.reading}`;
/** THE REPORT: the checks first; if one failed the verdicts are NOT WEIGHED. Returns the lines. */
export function report(audit, training) {
    const L = [], checks = checksOf(audit, training), failed = checks.filter((c) => !c.ok);
    const arms = audit.arms, r0 = arms[ARM_IDS[0]];
    if (failed.length) { L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`); }
    L.push(`THE DECISION CIRCUIT AGAINST THE TWIN: the survey, noisy gauge sd 0.10, ${r0 ? `${r0.kinds.join(" and ")}, seeds ${r0.range.from} to ${r0.range.to}${r0.seconds ? `, dives cut to ${r0.seconds} s` : ""}` : "no arms flown"}${r0 && (r0.range.from !== RANGE.from || r0.range.to !== RANGE.to || JSON.stringify(r0.kinds) !== JSON.stringify(KINDS) || r0.seconds) ? " -- NOT THE REGISTERED BLOCK (a DEV or smoke read, no verdict of the round)" : ""}`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    for (const l of ledgerLines(training)) L.push(l);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const au = { runs: Object.fromEntries(ARM_IDS.map((a) => [a, arms[a].runs])), range: r0.range, kinds: r0.kinds };
    L.push("means (bad = crushed or stranded dives):");
    for (const a of ARM_IDS) { const asRule = CIRCUIT_OF[a] && arms[a].champion && arms[a].champion.asRule; L.push(`  ${a.padEnd(16)} ${f4(meanOf(au.runs[a].map((r) => r.score)))}  bad ${badCount(au.runs[a])}${asRule ? "  (no eligible champion: this arm IS rule-low06)" : ""}`); }
    L.push("per kind: " + ARM_IDS.map((a) => `${a}: ` + au.kinds.map((k) => k + " " + f4(meanOf(au.runs[a].filter((r) => r.key.startsWith(k + ":")).map((r) => r.score)))).join(" ")).join(" | "));
    const v = verdictsOf(au), cal = v.calibration;
    L.push(`CALIBRATION (cannot fail): twin-standard minus rule-low06 ${sgn(cal.mean)} (se ${f4(cal.se)}), to be read against +0.012 to +0.033 (Rounds 12, 22 and 33)`);
    L.push(`rule-low06 minus rule-r8 (reported): ${fmtP({ ...B.paired(au.runs["rule-low06"], au.runs["rule-r8"]), reading: "" }).trim()}`);
    L.push(`V1 circuit-cx against rule-low06: ${fmtP(v.v1)}`, `V2 circuit-cx against circuit-nostate (the memory): ${fmtP(v.v2n)}`, `V2 circuit-cx against circuit-plain (the reservoir): ${fmtP(v.v2p)}`, `V3 circuit-cx against twin-standard: ${fmtP(v.v3)}`, `V4 the hull: circuit-cx ${v.b} crushed or stranded dives, rule-low06 ${v.b0}: ${v.v4}`);
    L.push(`BOTTOM LINE: ${bottomLine(v, v.v3.n)}`);
    return L;
}

// ---- the command --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "fly" && cmd !== "report") throw new Error(`the first word must be fly or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "fly" ? { arms: String, training: String, out: String, from: Number, to: Number, kinds: String, seconds: Number, workers: Number, one: String, quiet: Boolean } : { in: String, training: String }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <audit file>"); return { cmd, in: given.in, training: given.training || TRAINING_FILE }; }
    if (!given.one && !given.out) throw new Error("fly needs --out <audit file>");
    const o = { cmd, arms: given.arms || given.one || "all", one: given.one || null, out: given.out || null, training: given.training || TRAINING_FILE, range: { from: given.from ?? RANGE.from, to: given.to ?? RANGE.to }, kinds: given.kinds ? given.kinds.split(",") : [...KINDS], seconds: given.seconds ?? null, workers: given.workers ?? 1, quiet: !!given.quiet };
    if (!(Number.isInteger(o.range.from) && Number.isInteger(o.range.to) && o.range.from >= 1 && o.range.to >= o.range.from)) throw new Error(`--from and --to must be whole numbers with 1 <= from <= to, got ${o.range.from} and ${o.range.to}`);
    for (const k of o.kinds) if (!START_KINDS.includes(k)) throw new Error(`unknown kind ${JSON.stringify(k)} (${START_KINDS.join(", ")})`);
    if (new Set(o.kinds).size !== o.kinds.length) throw new Error("a kind is named twice");
    if (o.seconds !== null && !(o.seconds > 0)) throw new Error(`--seconds must be above 0, got ${o.seconds}`);
    if (!(Number.isInteger(o.workers) && o.workers >= 1)) throw new Error(`--workers must be a whole number of 1 or more, got ${o.workers}`);
    const names = parseFlights(o.arms); if (o.one && names.length !== 1) throw new Error("--one takes a single arm");
    return o;
}
/** "all" or a comma list of arm ids and START. */
export function parseFlights(text) {
    const t = String(text).trim(); if (t === "all") return [...FLIGHTS];
    const out = []; for (const raw of t.split(",")) { const n = raw.trim(); if (!n) throw new Error(`takeDecisionCircuit.parseFlights: an empty name in ${JSON.stringify(text)}`); if (!FLIGHTS.includes(n)) throw new Error(`takeDecisionCircuit.parseFlights: unknown arm ${JSON.stringify(n)} (${FLIGHTS.join(", ")})`); if (out.includes(n)) throw new Error(`takeDecisionCircuit.parseFlights: ${n} is named twice`); out.push(n); }
    return out;
}
const sameFlightAs = (rec, o) => rec.arm === START ? (rec.seconds || null) === o.seconds : JSON.stringify(rec.range) === JSON.stringify(o.range) && JSON.stringify(rec.kinds) === JSON.stringify(o.kinds) && (rec.seconds || null) === o.seconds;
/** THE COMMAND as a function. `fly` flies the arms not yet in --out (each in its own process when --workers is above 1), appending one line each; `report` prints the checks and the verdicts. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, exists, flyer, spawner }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("takeDecisionCircuit: " + e.message); return 2; }
    if (o.cmd === "report") {
        let audit, training; try { audit = readAudit(readFile(o.in)); training = readRecords(readFile(o.training)); } catch (e) { err("takeDecisionCircuit: " + e.message); return 1; }
        if (!Object.keys(audit.arms).length && !audit.start) { err("takeDecisionCircuit: the audit file has no records"); return 1; }
        for (const l of report(audit, training)) out(l); return 0;
    }
    const names = parseFlights(o.arms), loadTraining = () => (exists(o.training) ? readRecords(readFile(o.training)) : []);
    const fly = (name) => (io.flyer ? io.flyer(name, o) : name === START ? startRows(o.seconds) : flyArm(name, loadTraining(), { range: o.range, kinds: o.kinds, seconds: o.seconds }));
    if (o.one) { let rec; try { rec = fly(names[0]); } catch (e) { err("takeDecisionCircuit: " + e.message); return 1; } out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("takeDecisionCircuit: " + e.message); return 1; } }
    const stale = have.filter((r) => !sameFlightAs(r, o));
    if (stale.length) { err(`takeDecisionCircuit: ${o.out} holds ${stale.length} record(s) of another range, kinds or dive length (${stale.map((r) => r.arm).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.arm)), todo = names.filter((n) => !done.has(n)), queue = [...todo];
    const log = o.quiet ? () => {} : out;
    log(`[takeDecisionCircuit] ${names.length} flights, ${names.length - todo.length} already in ${o.out}, ${todo.length} to fly; ${o.workers} worker(s); seeds ${o.range.from}-${o.range.to} of ${o.kinds.join(",")}${o.seconds ? `, ${o.seconds} s` : ""}`);
    const spawner = io.spawner || ((name) => runChild(name, o));
    const worker = async () => { while (queue.length) { const n = queue.shift(), rec = o.workers > 1 ? await spawner(n) : fly(n); appendFile(o.out, JSON.stringify(rec) + "\n"); log(`[takeDecisionCircuit] ${n} done`); } };
    try { await Promise.all(Array.from({ length: Math.min(o.workers, queue.length) }, worker)); } catch (e) { err("takeDecisionCircuit: " + e.message + " (the flights finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    log("[takeDecisionCircuit] all flights are in " + o.out + "; read them ONCE with: report --in " + o.out);
    return 0;
}
/** One flight in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(name, o, script = path.join(HERE, "takeDecisionCircuitCmd.mjs")) {
    return new Promise((resolve, reject) => {
        const args = [script, "fly", "--one", name, "--training", o.training, "--from", String(o.range.from), "--to", String(o.range.to), "--kinds", o.kinds.join(","), ...(o.seconds ? ["--seconds", String(o.seconds)] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => {
            const line = buf.split("\n").find((l) => l.startsWith("RESULT "));
            if (!line) return reject(new Error(`child for ${name} ended with ${code} and no RESULT`));
            try { resolve(JSON.parse(line.slice(7))); } catch (e) { reject(new Error(`child for ${name} printed a RESULT that is not JSON: ${e.message}`)); }
        });
    });
}
