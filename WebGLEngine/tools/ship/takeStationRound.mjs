// WebGLEngine/tools/ship/takeStationRound.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeStationRoundCmd.mjs, which says the first-order orientation step out loud; the training is tools/ship/trainStation.mjs; the policies are brain/stationSeat.mjs; the registration is brain/STATION_AND_PRICE_WIP.md; the gate is tools/ship/takeStationRound-selfcheck.mjs)
//
// THE AUDIT OF THE STATION-AND-PRICE ROUND (registered in brain/STATION_AND_PRICE_WIP.md before any code): the survey run (noisy gauge sd 0.10, kinds far and both) flown through the switchboard (brain/switchboard.mjs) by SIX arms --
//   rule-low06 (the control of every verdict), twin-standard (the planner), circuit-plain (the decision-circuit round's plain-net champion, re-flown UNCHANGED from brain/decisionCircuitTraining.jsonl, digest c916e7f5), station-large and station-small (the station-only net trained on 40 and on 16 dives), plain-priced (the full 7-output plain net trained on the PRICED score)
// on the AUDIT block, seeds 18001 to 18300 of each kind (600 dives an arm), READ ONCE. A trained arm is flown from the CHAMPION its family's training file names (tools/ship/trainStation.mjs `championOf` = the decision-circuit round's rule, chosen before the audit was touched); a family with no eligible champion is flown as the untrained circuit, which IS rule-low06, and is reported as that.
// THE TASK is the switchboard's survey task REPLICATED (brain/switchboard.mjs surveyTask: the same scenarios, the same gauge, the same arms' pilots) with one difference: every dive's `maxStrain`, `crushed` and `stranded` are KEPT, because the registered price and the strain counts need them. The score of a dive is the task's own, unchanged (the price is a training objective, not a change of the score).
//   `fly` writes one JSON line a finished arm (and the START and MASK rows) to a results file, resumable, any number of worker processes; `report` reads that file and both training files, OFFLINE: the checks first, then the verdicts.
//   CHECKS (a failure is the first line of the report and the verdicts are NOT WEIGHED): TRAINING FILE (twelve searches, three families of four, one recipe a family, the starts agree), START (the untrained station-large, station-small and plain-priced equal rule-low06 on 24 baseline dives, scores AND fingerprints), MASK (with every readout pushed to +1 the station-only seat's surfacing, cap, pump and repair are the rule's on every call of those dives),
//   KEYS (every arm flew the registered scenarios in the registered order), CHAMPIONS (every trained arm was flown from the champion its training file names, by a digest of its weights; circuit-plain from the committed digest c916e7f5), SCORES (finite, in [0, 1]; every strain a finite number). CALIBRATION is a line that cannot fail: twin-standard minus rule-low06 on this block, to be read against +0.012 to +0.033.
//   REPORTED, in no verdict: per arm the priced mean, the dives with `maxStrain` above 0.92 and above 0.95, the crushed or stranded dives.
//   VERDICTS (pooled paired differences over the 600 dives): a pair BEATS iff the mean paired difference is positive, above 2 se AND at least 0.02 (the series' floor, MIN_EDGE); IS BELOW iff the mirror; else TIES. R0 circuit-plain / rule-low06; S1 station-large / rule-low06; S2 station-large / twin-standard; S3 station-large / station-small; P1 plain-priced / circuit-plain; P2 plain-priced / rule-low06;
//   H for each trained arm the crushed plus stranded dives against rule-low06's by Round 33's test (b - b0 <= 2 sqrt(b + b0)): NO WORSE / PAYS MORE. THREE BOTTOM LINES (STATION, PRICE, REPLICATION), each the first of its list that applies.
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
import * as ST from "../../brain/stationSeat.mjs";
import * as D from "./trainDecisionCircuit.mjs";
import * as TS from "./trainStation.mjs";
import { MIN_EDGE } from "./trainNeedsCircuit.mjs";
import { readRecords } from "./trainSubCircuits.mjs";
import { readingOf, hullOf, badCount, digestOf, keysOf, START_KINDS, START_SEEDS } from "./takeDecisionCircuit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const RANGE = Object.freeze({ from: 18001, to: 18300 }), KINDS = Object.freeze(["far", "both"]);
export const TRAINING_FILE = TS.OUT_FILE, LAST_TRAINING_FILE = D.OUT_FILE, AUDIT_FILE = "brain/stationRoundAudit.jsonl", PLAIN_DIGEST = "c916e7f5";
export const BASE_ARMS = Object.freeze(["rule-low06", "twin-standard"]), PLAIN_ARM = "circuit-plain", TRAINED_ARMS = Object.freeze([...TS.FAMILIES]);
export const ARM_IDS = Object.freeze([...BASE_ARMS, PLAIN_ARM, ...TRAINED_ARMS]), START = "START", MASK = "MASK", FLIGHTS = Object.freeze([...ARM_IDS, START, MASK]);
export const START_COUNT = 24, THRESHOLDS = Object.freeze([0.92, 0.95]), HULL_ARMS = Object.freeze([PLAIN_ARM, ...TRAINED_ARMS]);
export { MIN_EDGE, START_KINDS, START_SEEDS, keysOf, digestOf };

// ---- the task: the switchboard's survey task, with the strain kept -------------------------------------------------------------------------------------------------------------------------------
/** The survey task of brain/switchboard.mjs replicated, each dive also keeping crushed, stranded and maxStrain (a strain that is not a number is kept as null). opts.evaluate is a seam for the gate (default T.evaluate). */
export const strainTask = Object.freeze({
    name: "survey-strain", layer: "decision",
    run(arm, range, opts = {}) {
        if (typeof arm.pilot !== "function") throw new Error(`takeStationRound.strainTask: arm ${arm.id} has no pilot()`);
        const kinds = opts.kinds || [...KINDS], set = T.setOf(kinds, range.from, range.to);
        const r = (opts.evaluate || T.evaluate)(arm.pilot({ seconds: opts.seconds }), set, { gauge: { sd: opts.sd ?? T.GAUGE.sd, hz: T.GAUGE.hz }, ...(opts.seconds ? { seconds: opts.seconds } : {}) });
        return r.runs.map((x, i) => ({ key: `${set[i].kind}:${set[i].seed}`, score: x.score, bad: B.badOf(x), crushed: !!x.crushed, stranded: !!x.stranded, maxStrain: Number.isFinite(x.maxStrain) ? x.maxStrain : null }));
    },
});

// ---- the arms ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The pilot of a trained arm and the champion it is flown from: { pilot, champion: { family, k, seed, digest, asRule } }. circuit-plain is the decision-circuit round's plain champion (`last` = that round's training lines); the others are the champions of `training`. A family with no eligible champion is the untrained circuit (which IS rule-low06). */
export function trainedArm(armId, training, last) {
    const plain = armId === PLAIN_ARM;
    if (!plain && !TS.FAMILIES.includes(armId)) throw new Error(`takeStationRound.trainedArm: ${JSON.stringify(armId)} is not a trained arm (${[PLAIN_ARM, ...TS.FAMILIES].join(", ")})`);
    const family = plain ? "plain" : armId, Pol = plain ? D.familyPolicy("plain") : TS.familyPolicy(armId), c = plain ? D.championOf(last || [], "plain") : TS.championOf(training || [], armId);
    const w = c.record ? Float32Array.from(c.record.weights) : Pol.handWeights();
    if (w.length !== Pol.WEIGHT_COUNT) throw new Error(`takeStationRound.trainedArm: ${armId} has ${w.length} champion weights and its policy takes ${Pol.WEIGHT_COUNT}`);
    return { pilot: () => Pol.pilotFor(w), champion: { family, k: c.record ? c.record.index : null, seed: c.record ? c.record.seed : null, digest: digestOf(w), asRule: !c.record } };
}
/** The board of the round: the strain task, the switchboard's own rule-low06 and twin-standard (imported and not edited), and the four trained arms. */
export function boardOf(training, last) {
    const b = B.createBoard().addTask(strainTask), base = B.surveyArms();
    for (const id of BASE_ARMS) { const a = base.find((x) => x.id === id); if (!a) throw new Error(`takeStationRound.boardOf: the switchboard has no arm ${id}`); b.addArm(a); }
    for (const id of [PLAIN_ARM, ...TRAINED_ARMS]) b.addArm({ id, layer: "decision", controls: ["rule-low06"], pilot: trainedArm(id, training, last).pilot, note: id === PLAIN_ARM ? "the decision-circuit round's plain net" : `the ${id} net` });
    return b;
}
/** One arm flown once: the record the results file keeps. opts: range, kinds, seconds (the gate shortens the dive). */
export function flyArm(armId, training, last, { range = RANGE, kinds = KINDS, seconds = null } = {}) {
    if (!ARM_IDS.includes(armId)) throw new Error(`takeStationRound.flyArm: unknown arm ${JSON.stringify(armId)} (${ARM_IDS.join(", ")})`);
    const runs = boardOf(training, last).run("survey-strain", [armId], range, { kinds: [...kinds], ...(seconds ? { seconds } : {}) }).runs[armId];
    return { arm: armId, range: { ...range }, kinds: [...kinds], seconds: seconds || null, runs, ...(armId === PLAIN_ARM || TS.FAMILIES.includes(armId) ? { champion: trainedArm(armId, training, last).champion } : {}) };
}
const rule = () => T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS));
const startDives = () => START_KINDS.flatMap((kind) => Array.from({ length: START_SEEDS.to - START_SEEDS.from + 1 }, (_, i) => ({ kind, seed: START_SEEDS.from + i })));
/** The START rows: the untrained station-large, station-small and plain-priced pilots against rule-low06 on 24 baseline dives (seeds 501-506 of the four kinds, the noisy gauge): score and fingerprint of each. `fam` is the families' policies (a seam for the gate). */
export function startRows(seconds = null, fam = Object.fromEntries(TS.FAMILIES.map((f) => [f, TS.familyPolicy(f)]))) {
    const ruleP = rule(), rows = [];
    for (const { kind, seed } of startDives()) {
        const c = T.scenario(seed, kind), o = { gauge: T.GAUGE, ...(seconds ? { seconds } : {}) }, one = (p) => { const r = T.fly(p, c, o); return { score: r.score, fingerprint: r.fingerprint }; };
        rows.push({ key: `${kind}:${seed}`, rule: one(ruleP), ...Object.fromEntries(TS.FAMILIES.map((f) => [f, one(fam[f].pilotFor(fam[f].handWeights()))])) });
    }
    return { arm: START, seconds: seconds || null, rows };
}
/** The weights of a net with the bias of every readout output pushed to +1 and everything else the start's. */
const pushed = (Pol) => { const w = Pol.handWeights(); for (let o = 0; o < 7; o++) w[Pol.offsets.B2 + o] = 1; return w; };
/** The MASK rows: on the 24 baseline dives the RULE flies and, at every call, the station-only seat (every readout pushed to +1) and the UNMASKED plain net (pushed the same) decide on the same state and observation. A row: calls, mismatches (the station-only seat's surfacing, cap, pump or repair differing from the rule's), controlMismatches (the unmasked net's, which shows the comparison can see a difference), stationDiffs (reported: the station may differ). The policies are a seam for the gate (defaults: the station-only family and the plain net). */
export function maskRows(seconds = null, { station = TS.familyPolicy("station-large"), plain = D.familyPolicy("plain") } = {}) {
    const rows = [];
    for (const { kind, seed } of startDives()) {
        const row = { key: `${kind}:${seed}`, calls: 0, mismatches: 0, controlMismatches: 0, stationDiffs: 0 };
        const same = (a, b) => a.surface === b.surface && a.cap === b.cap && a.pump === b.pump && a.repair === b.repair;
        const probe = (ctx) => {
            const r = U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)(ctx), s = station.seatFor(pushed(station))(ctx), p = plain.seatFor(pushed(plain))(ctx);
            return (st, obs) => { const d = r(st, obs), e = s(st, obs), g = p(st, obs); row.calls++; if (!same(d, e)) row.mismatches++; if (!same(d, g)) row.controlMismatches++; if (d.station !== e.station) row.stationDiffs++; return d; };
        };
        T.fly(T.flyDecision(probe), T.scenario(seed, kind), { gauge: T.GAUGE, ...(seconds ? { seconds } : {}) });
        rows.push(row);
    }
    return { arm: MASK, seconds: seconds || null, rows };
}

// ---- the reading ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
export { readingOf, hullOf, badCount };
const rd = (au, a, b) => { const p = B.paired(au.runs[a], au.runs[b]); return { ...p, reading: readingOf(p) }; };
/** What an arm's dives add up to: { n, mean, priced, bad, crushed, stranded, above92, above95, nonNumeric, maxStrain }. `priced` is the mean of ST.pricedScore (the training objective, REPORTED here and in no verdict). */
export function summaryOf(runs) {
    const counts = ST.strainCounts(runs, THRESHOLDS), strains = runs.map((r) => r.maxStrain).filter((s) => Number.isFinite(s));
    return { n: runs.length, mean: meanOf(runs.map((r) => r.score)), priced: meanOf(runs.map(ST.pricedScore)), bad: badCount(runs), crushed: runs.filter((r) => r.crushed).length, stranded: runs.filter((r) => r.stranded).length, above92: counts[THRESHOLDS[0]], above95: counts[THRESHOLDS[1]], nonNumeric: runs.length - strains.length, maxStrain: strains.length ? Math.max(...strains) : null };
}
/** The audit as the verdicts read it: { runs: { armId: [...] } } -> { r0, s1, s2, s3, p1, p2, hull: { arm: { b, result } }, b0, calibration, summaries }. */
export function verdictsOf(au) {
    const b0 = badCount(au.runs["rule-low06"]);
    return { r0: rd(au, PLAIN_ARM, "rule-low06"), s1: rd(au, "station-large", "rule-low06"), s2: rd(au, "station-large", "twin-standard"), s3: rd(au, "station-large", "station-small"), p1: rd(au, "plain-priced", PLAIN_ARM), p2: rd(au, "plain-priced", "rule-low06"),
        hull: Object.fromEntries(HULL_ARMS.map((a) => { const b = badCount(au.runs[a]); return [a, { b, result: hullOf(b, b0) }]; })), b0, calibration: B.paired(au.runs["twin-standard"], au.runs["rule-low06"]), summaries: Object.fromEntries(ARM_IDS.map((a) => [a, summaryOf(au.runs[a])])) };
}
/** The STATION bottom line: the first of five that applies, then a hull that PAYS MORE for station-large, then S3 last. */
export function stationLine(v) {
    const s1 = v.s1.reading, s2 = v.s2.reading, nums = `S1 ${sgn(v.s1.mean)}, S2 ${sgn(v.s2.mean)}, S3 ${sgn(v.s3.mean)}`;
    const head = s1 === "BEATS" ? (s2 === "BEATS" ? "A LEARNED STATION CHOICE BEATS THE PLANNER" : s2 === "TIES" ? "A LEARNED STATION CHOICE BEATS ITS RULE AND CANNOT BE TOLD APART FROM THE PLANNER" : "A LEARNED STATION CHOICE BEATS ITS RULE AND NOT THE PLANNER") : s1 === "TIES" ? "THE LEARNED STATION CHOICE IS THE RULE" : "THE LEARNED STATION CHOICE IS WORSE THAN NEAREST-FIRST";
    const h = v.hull["station-large"], hull = h.result === "PAYS MORE" ? ` -- THE HULL PAYS MORE (station-large ${h.b} crushed or stranded dives against the rule's ${v.b0})` : "";
    const s3 = v.s3.reading === "BEATS" ? "MORE DATA HELPS" : v.s3.reading === "TIES" ? "MORE DATA CHANGES NOTHING THE SCORE CAN SEE" : "MORE DATA HURTS";
    return `${head} (${nums})${hull} -- ${s3}`;
}
/** The PRICE bottom line: P1, then the strain counts (dives above 0.95) of plain-priced against circuit-plain and the hull test of plain-priced. */
export function priceLine(v) {
    const head = v.p1.reading === "BEATS" ? "THE PRICE BUYS SCORE" : v.p1.reading === "IS BELOW" ? "THE PRICE COSTS SCORE" : "THE PRICE CHANGES NOTHING THE SCORE CAN SEE", a = v.summaries["plain-priced"], b = v.summaries[PLAIN_ARM], h = v.hull["plain-priced"];
    return `${head} (P1 ${sgn(v.p1.mean)}, se ${f4(v.p1.se)}); dives above a strain of 0.95: plain-priced ${a.above95} against circuit-plain ${b.above95} (${a.above95 < b.above95 ? "fewer" : "not fewer"}); the hull of plain-priced: ${h.result} (${h.b} crushed or stranded dives against the rule's ${v.b0})`;
}
/** The REPLICATION bottom line. */
export const replicationLine = (v) => `${v.r0.reading === "BEATS" ? "THE PLAIN NET'S POST HOC GAIN REPLICATES" : "THE PLAIN NET'S POST HOC GAIN DOES NOT REPLICATE"} (R0 ${sgn(v.r0.mean)}, se ${f4(v.r0.se)}, ${v.r0.reading})`;

// ---- the results file ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The lines of a results file: { arms: { armId: record }, start, mask }. A duplicate and an unknown arm are refused by name. */
export function readAudit(text) {
    const arms = {}; let start = null, mask = null;
    for (const r of readRecords(text)) {
        if (r.arm === START) { if (start) throw new Error("takeStationRound.readAudit: the START rows are in the file twice"); start = r; continue; }
        if (r.arm === MASK) { if (mask) throw new Error("takeStationRound.readAudit: the MASK rows are in the file twice"); mask = r; continue; }
        if (!ARM_IDS.includes(r.arm)) throw new Error(`takeStationRound.readAudit: unknown arm ${JSON.stringify(r.arm)}`);
        if (arms[r.arm]) throw new Error(`takeStationRound.readAudit: arm ${r.arm} is in the file twice (the audit is read once)`);
        arms[r.arm] = r;
    }
    return { arms, start, mask };
}
const startEq = (r, f) => r[f] && r.rule && r[f].score === r.rule.score && r[f].fingerprint === r.rule.fingerprint;
/** The checks, in order: [{ name, ok, text }]. `audit` is readAudit's result, `training` the lines of this round's training file, `last` the lines of the decision-circuit round's. opts.plainDigest: the committed digest of circuit-plain's champion (the gate hands another). */
export function checksOf(audit, training, last, { plainDigest = PLAIN_DIGEST } = {}) {
    const rows = [], arms = audit.arms;
    const tf = TS.checksOf(training || []); rows.push({ name: "TRAINING FILE", ok: tf.length === 0, text: tf.length ? tf.join("; ") : "twelve searches (three families of four), one recipe a family, the starts agree" });
    const s = audit.start, sOk = !!s && Array.isArray(s.rows) && s.rows.length === START_COUNT && new Set(s.rows.map((r) => r.key)).size === START_COUNT && s.rows.every((r) => TS.FAMILIES.every((f) => startEq(r, f)));
    rows.push({ name: "START", ok: sOk, text: !s ? "the START rows are missing" : sOk ? `the untrained station-large, station-small and plain-priced equal rule-low06 on ${START_COUNT} baseline dives, scores and fingerprints` : `the untrained pilots differ from rule-low06 on ${Array.isArray(s.rows) ? s.rows.filter((r) => !TS.FAMILIES.every((f) => startEq(r, f))).length : "?"} of ${Array.isArray(s.rows) ? s.rows.length : "?"} baseline dives (need ${START_COUNT} of ${START_COUNT})` });
    const m = audit.mask, mr = m && Array.isArray(m.rows) ? m.rows : [], calls = mr.reduce((x, r) => x + r.calls, 0), mis = mr.reduce((x, r) => x + r.mismatches, 0), ctl = mr.reduce((x, r) => x + r.controlMismatches, 0), sd = mr.reduce((x, r) => x + r.stationDiffs, 0);
    const mOk = !!m && mr.length === START_COUNT && new Set(mr.map((r) => r.key)).size === START_COUNT && mr.every((r) => r.calls > 0) && mis === 0 && ctl > 0;
    rows.push({ name: "MASK", ok: mOk, text: !m ? "the MASK rows are missing" : mOk ? `with every readout pushed to +1 the station-only seat's surfacing, cap, pump and repair were the rule's on all ${calls} calls of ${START_COUNT} dives (the unmasked net, pushed the same, differed on ${ctl}; the station differed on ${sd}, which it may)` : `the MASK rows: ${mr.length} dives (need ${START_COUNT}), ${calls} calls, the station-only seat differed from the rule on ${mis} (need 0), the unmasked control on ${ctl} (need above 0)` });
    const missing = ARM_IDS.filter((a) => !arms[a]);
    if (missing.length) { rows.push({ name: "KEYS", ok: false, text: `the arm(s) ${missing.join(", ")} are missing from the file` }); return rows; }
    const r0 = arms[ARM_IDS[0]], want = keysOf(r0.range, r0.kinds), sameFlight = ARM_IDS.every((a) => JSON.stringify(arms[a].range) === JSON.stringify(r0.range) && JSON.stringify(arms[a].kinds) === JSON.stringify(r0.kinds) && arms[a].seconds === r0.seconds);
    const keysOk = sameFlight && ARM_IDS.every((a) => arms[a].runs.length === want.length && arms[a].runs.every((r, i) => r.key === want[i]));
    rows.push({ name: "KEYS", ok: keysOk, text: keysOk ? `every arm flew the same ${want.length} dives in the same order (${r0.kinds.join(" and ")}, seeds ${r0.range.from} to ${r0.range.to})` : sameFlight ? "the arms did not all fly the same dives in the same order" : "the arms were not all flown over one range, one set of kinds and one dive length" });
    const bad = [];
    for (const id of [PLAIN_ARM, ...TRAINED_ARMS]) {
        const plain = id === PLAIN_ARM, c = plain ? D.championOf(last || [], "plain") : TS.championOf(training || [], id), got = arms[id].champion, wantW = c.record ? digestOf(c.record.weights) : null;
        const okc = !!got && (c.record ? !got.asRule && got.k === c.record.index && got.seed === c.record.seed && got.digest === wantW : got.asRule === true && got.k === null) && (!plain || got.digest === plainDigest);
        if (!okc) bad.push(`${id} was flown from ${got ? (got.asRule ? "the untrained circuit" : `k ${got.k} (digest ${got.digest})`) : "no champion record"} and ${plain ? `the committed champion is digest ${plainDigest}, the file names ${c.record ? `k ${c.record.index} (digest ${wantW})` : "none"}` : `the training file names ${c.record ? `k ${c.record.index}` : "none"}`}`);
    }
    rows.push({ name: "CHAMPIONS", ok: bad.length === 0, text: bad.length ? bad.join("; ") : `every trained arm was flown from the champion its file names (a family with none eligible, from the untrained circuit); circuit-plain from the committed digest ${plainDigest}` });
    const fin = ARM_IDS.every((a) => arms[a].runs.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 1)), strainOk = ARM_IDS.every((a) => arms[a].runs.every((r) => Number.isFinite(r.maxStrain) && r.maxStrain >= 0));
    rows.push({ name: "SCORES", ok: fin && strainOk, text: `every score is a number in [0, 1]: ${fin}; every strain is a finite number: ${strainOk}` });
    return rows;
}
/** The ledger of the training for the report: the training ledger, then per trained family the champion's movement from the start, then circuit-plain's champion and its digest. */
export function ledgerLines(training, last) {
    const out = [...TS.reportLines(training || [])];
    for (const f of TS.FAMILIES) {
        const c = TS.championOf(training || [], f); if (!c.record) continue;
        const hand = TS.familyPolicy(f).handWeights(), delta = c.record.weights.map((v, i) => Math.abs(v - hand[i])), large = Math.max(...delta);
        out.push(`  ${f.padEnd(13)} champion k ${c.record.index}: ${c.record.kept} weights moved from the start, the largest by ${large.toFixed(4)}; last training score ${f4(c.record.trainScore)} against the start's ${f4(c.record.start.train)} (${sgn(c.record.trainScore - c.record.start.train)})`);
    }
    const p = D.championOf(last || [], "plain");
    out.push(p.record ? `  circuit-plain champion of the decision-circuit round: k ${p.record.index}, digest ${digestOf(p.record.weights)} (committed ${PLAIN_DIGEST})` : "  circuit-plain: the decision-circuit round's plain family has no eligible champion");
    return out;
}
const fmtP = (p) => `${sgn(p.mean)} (se ${f4(p.se)}; better ${p.better}, worse ${p.worse}, same ${p.same}; bad ${p.badA} against ${p.badB}) ${p.reading}`;
/** THE REPORT: the checks first; if one failed the verdicts are NOT WEIGHED. Returns the lines. */
export function report(audit, training, last, opts = {}) {
    const L = [], checks = checksOf(audit, training, last, opts), failed = checks.filter((c) => !c.ok), arms = audit.arms, r0 = arms[ARM_IDS[0]];
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE VERDICTS ARE NOT WEIGHED`);
    L.push(`THE STATION-AND-PRICE ROUND: the survey, noisy gauge sd 0.10, ${r0 ? `${r0.kinds.join(" and ")}, seeds ${r0.range.from} to ${r0.range.to}${r0.seconds ? `, dives cut to ${r0.seconds} s` : ""}` : "no arms flown"}${r0 && (r0.range.from !== RANGE.from || r0.range.to !== RANGE.to || JSON.stringify(r0.kinds) !== JSON.stringify(KINDS) || r0.seconds) ? " -- NOT THE REGISTERED BLOCK (a DEV or smoke read, no verdict of the round)" : ""}`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    for (const l of ledgerLines(training, last)) L.push(l);
    if (failed.length) { L.push("BOTTOM LINES: NOT WEIGHED (a check failed)"); return L; }
    const au = { runs: Object.fromEntries(ARM_IDS.map((a) => [a, arms[a].runs])), range: r0.range, kinds: r0.kinds }, v = verdictsOf(au);
    L.push("means (bad = crushed or stranded dives; priced = the training objective, reported and in no verdict; >0.92 and >0.95 = dives by hull strain):");
    for (const a of ARM_IDS) { const s = v.summaries[a], asRule = arms[a].champion && arms[a].champion.asRule; L.push(`  ${a.padEnd(14)} ${f4(s.mean)}  priced ${f4(s.priced)}  bad ${s.bad} (crushed ${s.crushed}, stranded ${s.stranded})  >0.92: ${s.above92}  >0.95: ${s.above95}  largest strain ${f4(s.maxStrain)}${asRule ? "  (no eligible champion: this arm IS rule-low06)" : ""}`); }
    L.push("per kind: " + ARM_IDS.map((a) => `${a}: ` + au.kinds.map((k) => k + " " + f4(meanOf(au.runs[a].filter((r) => r.key.startsWith(k + ":")).map((r) => r.score)))).join(" ")).join(" | "));
    const cal = v.calibration;
    L.push(`CALIBRATION (cannot fail): twin-standard minus rule-low06 ${sgn(cal.mean)} (se ${f4(cal.se)}), to be read against +0.012 to +0.033 (Rounds 12, 22 and 33)`);
    L.push(`R0 circuit-plain against rule-low06 (replication): ${fmtP(v.r0)}`, `S1 station-large against rule-low06: ${fmtP(v.s1)}`, `S2 station-large against twin-standard: ${fmtP(v.s2)}`, `S3 station-large against station-small (data): ${fmtP(v.s3)}`, `P1 plain-priced against circuit-plain (the price): ${fmtP(v.p1)}`, `P2 plain-priced against rule-low06: ${fmtP(v.p2)}`);
    L.push("H the hull, crushed or stranded dives against rule-low06's " + v.b0 + ": " + HULL_ARMS.map((a) => `${a} ${v.hull[a].b} ${v.hull[a].result}`).join(", "));
    L.push(`BOTTOM LINE STATION: ${stationLine(v)}`, `BOTTOM LINE PRICE: ${priceLine(v)}`, `BOTTOM LINE REPLICATION: ${replicationLine(v)}`);
    return L;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "fly" && cmd !== "report") throw new Error(`the first word must be fly or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "fly" ? { arms: String, training: String, last: String, out: String, from: Number, to: Number, kinds: String, seconds: Number, workers: Number, one: String, quiet: Boolean } : { in: String, training: String, last: String }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <audit file>"); return { cmd, in: given.in, training: given.training || TRAINING_FILE, last: given.last || LAST_TRAINING_FILE }; }
    if (!given.one && !given.out) throw new Error("fly needs --out <audit file>");
    const o = { cmd, arms: given.arms || given.one || "all", one: given.one || null, out: given.out || null, training: given.training || TRAINING_FILE, last: given.last || LAST_TRAINING_FILE, range: { from: given.from ?? RANGE.from, to: given.to ?? RANGE.to }, kinds: given.kinds ? given.kinds.split(",") : [...KINDS], seconds: given.seconds ?? null, workers: given.workers ?? 1, quiet: !!given.quiet };
    if (!(Number.isInteger(o.range.from) && Number.isInteger(o.range.to) && o.range.from >= 1 && o.range.to >= o.range.from)) throw new Error(`--from and --to must be whole numbers with 1 <= from <= to, got ${o.range.from} and ${o.range.to}`);
    for (const k of o.kinds) if (!START_KINDS.includes(k)) throw new Error(`unknown kind ${JSON.stringify(k)} (${START_KINDS.join(", ")})`);
    if (new Set(o.kinds).size !== o.kinds.length) throw new Error("a kind is named twice");
    if (o.seconds !== null && !(o.seconds > 0)) throw new Error(`--seconds must be above 0, got ${o.seconds}`);
    if (!(Number.isInteger(o.workers) && o.workers >= 1)) throw new Error(`--workers must be a whole number of 1 or more, got ${o.workers}`);
    const names = parseFlights(o.arms); if (o.one && names.length !== 1) throw new Error("--one takes a single arm");
    return o;
}
/** "all" or a comma list of arm ids, START and MASK. */
export function parseFlights(text) {
    const t = String(text).trim(); if (t === "all") return [...FLIGHTS];
    const out = []; for (const raw of t.split(",")) { const n = raw.trim(); if (!n) throw new Error(`takeStationRound.parseFlights: an empty name in ${JSON.stringify(text)}`); if (!FLIGHTS.includes(n)) throw new Error(`takeStationRound.parseFlights: unknown arm ${JSON.stringify(n)} (${FLIGHTS.join(", ")})`); if (out.includes(n)) throw new Error(`takeStationRound.parseFlights: ${n} is named twice`); out.push(n); }
    return out;
}
const sameFlightAs = (rec, o) => rec.arm === START || rec.arm === MASK ? (rec.seconds || null) === o.seconds : JSON.stringify(rec.range) === JSON.stringify(o.range) && JSON.stringify(rec.kinds) === JSON.stringify(o.kinds) && (rec.seconds || null) === o.seconds;
/** THE COMMAND as a function. `fly` flies the arms not yet in --out (each in its own process when --workers is above 1), appending one line each; `report` prints the checks and the verdicts. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, readFile, appendFile, exists, flyer, spawner }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(path.resolve(ENG, f), "utf8")), appendFile = io.appendFile || ((f, t) => fs.appendFileSync(path.resolve(ENG, f), t)), exists = io.exists || ((f) => fs.existsSync(path.resolve(ENG, f)));
    let o; try { o = parseArgs(argv); } catch (e) { err("takeStationRound: " + e.message); return 2; }
    if (o.cmd === "report") {
        let audit, training, last; try { audit = readAudit(readFile(o.in)); training = readRecords(readFile(o.training)); last = readRecords(readFile(o.last)); } catch (e) { err("takeStationRound: " + e.message); return 1; }
        if (!Object.keys(audit.arms).length && !audit.start && !audit.mask) { err("takeStationRound: the audit file has no records"); return 1; }
        for (const l of report(audit, training, last)) out(l); return 0;
    }
    const names = parseFlights(o.arms), load = (f) => (exists(f) ? readRecords(readFile(f)) : []);
    const fly = (name) => (io.flyer ? io.flyer(name, o) : name === START ? startRows(o.seconds) : name === MASK ? maskRows(o.seconds) : flyArm(name, load(o.training), load(o.last), { range: o.range, kinds: o.kinds, seconds: o.seconds }));
    if (o.one) { let rec; try { rec = fly(names[0]); } catch (e) { err("takeStationRound: " + e.message); return 1; } out("RESULT " + JSON.stringify(rec)); return 0; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("takeStationRound: " + e.message); return 1; } }
    const stale = have.filter((r) => !sameFlightAs(r, o));
    if (stale.length) { err(`takeStationRound: ${o.out} holds ${stale.length} record(s) of another range, kinds or dive length (${stale.map((r) => r.arm).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.arm)), todo = names.filter((n) => !done.has(n)), queue = [...todo];
    const log = o.quiet ? () => {} : out;
    log(`[takeStationRound] ${names.length} flights, ${names.length - todo.length} already in ${o.out}, ${todo.length} to fly; ${o.workers} worker(s); seeds ${o.range.from}-${o.range.to} of ${o.kinds.join(",")}${o.seconds ? `, ${o.seconds} s` : ""}`);
    const spawner = io.spawner || ((name) => runChild(name, o));
    const worker = async () => { while (queue.length) { const n = queue.shift(), rec = o.workers > 1 ? await spawner(n) : fly(n); appendFile(o.out, JSON.stringify(rec) + "\n"); log(`[takeStationRound] ${n} done`); } };
    try { await Promise.all(Array.from({ length: Math.min(o.workers, queue.length) }, worker)); } catch (e) { err("takeStationRound: " + e.message + " (the flights finished so far are in " + o.out + "; run the same command again to resume)"); return 1; }
    log("[takeStationRound] all flights are in " + o.out + "; read them ONCE with: report --in " + o.out);
    return 0;
}
/** One flight in a child process (this command with --one; `script` is for the gate): resolves the record. */
export function runChild(name, o, script = path.join(HERE, "takeStationRoundCmd.mjs")) {
    return new Promise((resolve, reject) => {
        const args = [script, "fly", "--one", name, "--training", o.training, "--last", o.last, "--from", String(o.range.from), "--to", String(o.range.to), "--kinds", o.kinds.join(","), ...(o.seconds ? ["--seconds", String(o.seconds)] : [])];
        const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] }); let buf = "";
        p.stdout.on("data", (d) => { buf += d; }); p.on("error", reject);
        p.on("close", (code) => {
            const line = buf.split("\n").find((l) => l.startsWith("RESULT "));
            if (!line) return reject(new Error(`child for ${name} ended with ${code} and no RESULT`));
            try { resolve(JSON.parse(line.slice(7))); } catch (e) { reject(new Error(`child for ${name} printed a RESULT that is not JSON: ${e.message}`)); }
        });
    });
}
