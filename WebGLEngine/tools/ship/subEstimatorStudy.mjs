// WebGLEngine/tools/ship/subEstimatorStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/subEstimatorStudyCmd.mjs; the gate is tools/subHeadingEstimator-selfcheck.mjs)
//
// THE STUDY OF RUNG 4a, VERSION 2, AS REGISTERED IN brain/SUBMARINE_WIP.md ("THE ESTIMATOR", its AMENDMENT, written before any circuit was scored): the fly heading loop and its controls as reservoirs with a RIDGE readout (tools/subHeadingEstimator.mjs) that estimates how far the compass has
// drifted from the vessel's heading rate, scored on audits nothing has touched. For every circuit: the (radius, lambda) chosen on the held-out dives, the RMSE of delta_hat over the dark ticks of the three audit sets, the skill against saying zero, and (unless switched off) the closed loop
// -- the estimator in the place of the oracle navigator, flying the same audit dives.
//   SPEC         `cx`, or `family:K` (er, layer, degree, sign, count, nostate): the same circuits as tools/ship/trainSubState.mjs builds (the K-th control at its fixed seed). NO STATE is the cx wiring with the recurrence left out. `cx,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3,nostate:0` is the registered study.
//   REFERENCES   one record `refs`: NONE (say 0), ORACLE (the exact kinematic integral), LEAKY1 (one leaky unit fed the same heading-rate input), and the clean / dropout / navigator autopilots flown on the audit sets. Not in the verdict.
//   THE VERDICT  rung 3's rule turned for a lower-is-better score: cx BEATS a family on an audit iff (family mean RMSE - cx RMSE) > max(0.1 x family mean, 2 sd of the family). PASS iff cx beats ER, TYPE-BLOCK and DEGREE on all three audits; FAIL iff against the family with the lowest
//                mean cx wins on fewer than two audits; otherwise IN BETWEEN; NOT ASSESSED below three finished controls in a family. SIGN, COUNT, NO STATE and the references are printed, not in the verdict.
//   node tools/ship/subEstimatorStudyCmd.mjs run --specs <list> --out <results.jsonl> [--audit-base 50000] [--smoke] [--no-closed-loop]       (resumable: a circuit already in --out is not run again)
//   node tools/ship/subEstimatorStudyCmd.mjs report --in <results.jsonl>
// Pure apart from the files it reads and writes. No clock beyond the seconds it reports, no Math.random.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/subTask.mjs";
import * as A from "../../brain/autopilotSub.mjs";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import * as D from "../subDropout.mjs";
import * as E from "../subHeadingEstimator.mjs";
import { parseSpecs, specName, circuitFor, loadCircuit, setsOf, AUDITS, FAMILIES, VERDICT_FAMILIES } from "./trainSubState.mjs";
import { meanOf, sdOf, readRecords } from "./trainSubCircuits.mjs";
import { flyThree } from "./subNavigatorReference.mjs";

export const AUDIT_BASE = 50000, MIN_CONTROLS = 3, REL_EDGE = 0.1, SD_FACTOR = 2;
export const SPECS = "cx,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3,nostate:0";
export const READ_SKILL = Object.freeze({ integrates: 0.9, some: 0.5, leak: 0.2 });
const NAMES = { er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE", sign: "SIGN", count: "COUNT", nostate: "NO STATE" };

/** The recorded dives every circuit shares: the fitting dives, the selection dives, the three audit sets (and the scenario sets, for the closed loop). `smoke` shrinks them to a few dives. */
export function prepare({ auditBase = AUDIT_BASE, smoke = false } = {}) {
    const sets = setsOf({ auditBase, smoke }), fitSet = smoke ? T.TRAIN_SET.slice(0, 4) : T.TRAIN_SET, selSet = smoke ? T.HELD_OUT_SET.slice(0, 2) : T.HELD_OUT_SET;
    return { sets, fit: E.recordSet(fitSet), sel: E.recordSet(selSet), audits: Object.fromEntries(AUDITS.map((a) => [a, E.recordSet(sets[a])])) };
}

/** One circuit: fit, choose, score on the three audits, and (unless `closedLoop` is false) fly the audits with the fitted estimator in the loop. Returns the record the file keeps. */
export function runCircuit(spec, circuit, data, opts = {}) {
    const c = circuitFor(spec, circuit), persist = spec.family !== "nostate", rho = persist ? E.spectralRadius(CS.reservoirOf(c)) : 1, mk = (r) => E.circuitModel(c, r, persist, rho), settings = persist ? E.RADII : [E.RADII[0]];
    const fit = E.fitModel(mk, settings, E.LAMBDAS, data.fit, data.sel), scores = {}, closedLoop = {};
    for (const a of AUDITS) scores[a] = E.scoreFit(mk, fit, data.audits[a]);
    if (opts.closedLoop !== false) for (const a of AUDITS) closedLoop[a] = T.evaluate(D.dropout(E.estimatorPilot(mk(fit.setting), Float64Array.from(fit.readout), A.pilot())), data.sets[a]).score;
    return { spec: specName(spec), family: spec.family, index: spec.index, auditBase: opts.smoke ? null : (opts.auditBase ?? AUDIT_BASE), smoke: !!opts.smoke, rho: persist ? rho : null,
        chosen: { radius: fit.setting, lambda: fit.lambda, selRmse: fit.selRmse }, readout: fit.readout, scores, closedLoop: opts.closedLoop === false ? null : closedLoop };
}
/** The references on the audits: NONE, ORACLE, LEAKY1 (fitted like a circuit) and the clean / dropout / navigator autopilots. */
export function runReferences(data, opts = {}) {
    const mk = (s) => E.leakyModel(s), fit = E.fitModel(mk, E.LEAKY_SIGMAS, E.LAMBDAS, data.fit, data.sel), leaky = {}, none = {}, oracle = {}, flights = {};
    for (const a of AUDITS) { const r = E.referenceScores(data.audits[a]); none[a] = r.none; oracle[a] = r.oracle; leaky[a] = E.scoreFit(mk, fit, data.audits[a]); if (opts.closedLoop !== false) flights[a] = flyThree(data.sets[a]); }
    return { spec: "refs", family: "refs", index: 0, auditBase: opts.smoke ? null : (opts.auditBase ?? AUDIT_BASE), smoke: !!opts.smoke, none, oracle, leaky: { chosen: { sigma: fit.setting, lambda: fit.lambda, selRmse: fit.selRmse }, scores: leaky }, flights: opts.closedLoop === false ? null : flights };
}

/** rung 3's `beats`, turned for a lower-is-better score: F beats the family iff (mean - F) > max(0.1 mean, 2 sd). */
export function beatsLower(F, values) {
    const m = meanOf(values), s = sdOf(values), needs = Math.max(REL_EDGE * m, SD_FACTOR * s), margin = m - F;
    return { m, s, needs, margin, wins: margin > needs };
}
const rmseOfRec = (r, a) => r.scores[a].rmse;
/** The verdict over a list of records (one `cx` and the controls). Returns { cx, families, strongest, verdict, why }. */
export function verdictOf(records) {
    const cx = records.find((r) => r.family === "cx");
    if (!cx) return { cx: null, families: {}, strongest: {}, verdict: "NOT ASSESSED", why: "no cx record" };
    const families = {}, strongest = {};
    for (const fam of FAMILIES) {
        const recs = records.filter((r) => r.family === fam); if (!recs.length) continue;
        families[fam] = { n: recs.length, audits: {} };
        for (const a of AUDITS) families[fam].audits[a] = { F: rmseOfRec(cx, a), ...beatsLower(rmseOfRec(cx, a), recs.map((r) => rmseOfRec(r, a))) };
    }
    const missing = VERDICT_FAMILIES.filter((f) => !families[f] || families[f].n < MIN_CONTROLS);
    if (missing.length) return { cx, families, strongest, verdict: "NOT ASSESSED", why: `${missing.join(", ")} need at least ${MIN_CONTROLS} finished controls` };
    for (const a of AUDITS) strongest[a] = VERDICT_FAMILIES.reduce((best, f) => (families[f].audits[a].m < families[best].audits[a].m ? f : best), VERDICT_FAMILIES[0]);
    const passes = VERDICT_FAMILIES.every((f) => AUDITS.every((a) => families[f].audits[a].wins)), lost = AUDITS.filter((a) => !families[strongest[a]].audits[a].wins).length;
    const verdict = passes ? "PASS" : lost >= 2 ? "FAIL" : "IN BETWEEN";
    return { cx, families, strongest, verdict, why: passes ? "cx beats ER, TYPE-BLOCK and DEGREE on all three audits" : lost >= 2 ? `against the strongest family cx wins on ${3 - lost} of 3 audits` : "cx does not beat every family on every audit, but wins against the strongest on at least two" };
}
const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4)), f2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(2));
const readSkill = (k) => (k >= READ_SKILL.integrates ? "integrates" : k >= READ_SKILL.some ? "has some memory" : "does not integrate");
export function reportLines(records) {
    const circuits = records.filter((r) => r.family !== "refs"), refs = records.find((r) => r.family === "refs"), v = verdictOf(circuits), lines = [];
    if (refs) {
        lines.push(`references (RMSE of delta_hat in radians over the dark ticks; audit | safety audit | reserve): NONE ${AUDITS.map((a) => f4(refs.none[a])).join(" | ")}  ORACLE ${AUDITS.map((a) => f4(refs.oracle[a])).join(" | ")}`);
        lines.push(`  LEAKY1 (one unit, sigma ${refs.leaky.chosen.sigma}): ${AUDITS.map((a) => f4(refs.leaky.scores[a].rmse)).join(" | ")}  skill ${AUDITS.map((a) => f2(refs.leaky.scores[a].skill)).join(" | ")}`);
        if (refs.flights) lines.push(`  the autopilot flown on the audits: clean ${AUDITS.map((a) => f4(refs.flights[a].clean)).join(" | ")}; through the dropout ${AUDITS.map((a) => f4(refs.flights[a].dropout)).join(" | ")}; with the oracle navigator ${AUDITS.map((a) => f4(refs.flights[a].navigator)).join(" | ")}`);
    }
    const cx = circuits.find((r) => r.family === "cx");
    if (cx) lines.push(`CX (the vendored heading loop; spectral radius ${f2(cx.rho)}): radius ${cx.chosen.radius}, lambda ${cx.chosen.lambda} | RMSE ${AUDITS.map((a) => f4(cx.scores[a].rmse)).join(" | ")} | skill ${AUDITS.map((a) => f2(cx.scores[a].skill)).join(" | ")}`);
    for (const fam of FAMILIES) {
        const recs = circuits.filter((r) => r.family === fam); if (!recs.length) continue;
        const d = v.families[fam], mk = AUDITS.map((a) => meanOf(recs.map((r) => r.scores[a].skill))), reading = readSkill(mk[0]);
        lines.push(`${NAMES[fam]} x${recs.length}: RMSE ` + AUDITS.map((a) => (d ? `${f4(d.audits[a].m)} +- ${f4(d.audits[a].s)} (cx ${f4(d.audits[a].F)}; a win needs ${f4(d.audits[a].m - d.audits[a].needs)} or lower: ${d.audits[a].wins ? "WINS" : "no"})` : "n/a")).join(" | ") +
            ` | mean skill ${mk.map(f2).join(" | ")}: ${reading}` + (VERDICT_FAMILIES.includes(fam) ? "" : "   [reported, not in the verdict]"));
    }
    const ns = circuits.filter((r) => r.family === "nostate");
    if (ns.length && ns.some((r) => r.scores.audit.skill > READ_SKILL.leak)) lines.push(`WARNING (reading 1 of the registration): NO STATE has a skill above ${READ_SKILL.leak} -- the target leaks through the senses and nothing here is to be read until that is fixed`);
    if (refs && cx && refs.leaky.scores.audit.skill > meanOf(VERDICT_FAMILIES.flatMap((f) => circuits.filter((r) => r.family === f).map((r) => r.scores.audit.skill)))) lines.push("reading 3: the single leaky unit has a higher skill than the reservoirs' mean on the audit -- the reservoirs are worse memories than one leaky unit");
    if (circuits.some((r) => r.closedLoop) && refs && refs.flights) {
        lines.push("closed loop (the fitted estimator in the place of the oracle navigator; the audit score, and the fraction of the gap between the dropout autopilot and the oracle navigator it closes -- no learned residual is in the loop, so the fraction means what it says):");
        const row = (name, recs) => { const k = AUDITS.map((a) => { const s = meanOf(recs.map((r) => r.closedLoop[a])), fl = refs.flights[a]; return `${f4(s)} (${f2(fl.navigator - fl.dropout > 0 ? (s - fl.dropout) / (fl.navigator - fl.dropout) : null)})`; }); lines.push(`  ${name}: ${k.join(" | ")}`); };
        if (cx && cx.closedLoop) row("cx", [cx]);
        for (const fam of FAMILIES) { const recs = circuits.filter((r) => r.family === fam && r.closedLoop); if (recs.length) row(`${NAMES[fam]} mean of ${recs.length}`, recs); }
    }
    lines.push(`RUNG 4a v2 (the estimator): ${v.verdict} -- ${v.why}`);
    return lines;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, out: String, "audit-base": Number, smoke: Boolean, "no-closed-loop": Boolean, "circuit-file": String } : { in: String }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in }; }
    if (!given.specs) throw new Error("run needs --specs <list> (the registered study: " + SPECS + ")");
    if (!given.out) throw new Error("run needs --out <results file>");
    parseSpecs(given.specs);
    return { cmd, specs: given.specs, out: given.out, auditBase: given["audit-base"] ?? AUDIT_BASE, smoke: !!given.smoke, closedLoop: !given["no-closed-loop"], circuitFile: given["circuit-file"] || null };
}
/**
 * THE COMMAND, as a function: `run` fits and scores the circuits not yet in --out (the references first, as one record `refs`), appending one line a record, then prints the report; `report` prints it for a results file. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument.
 * `io` is for the gate: { out, err, readFile, appendFile, exists, prepare, runCircuit, runReferences }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("subEstimatorStudy: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("subEstimatorStudy: " + e.message); return 1; }
        if (!records.length) { err("subEstimatorStudy: the results file has no records"); return 1; }
        for (const l of reportLines(records)) out(l);
        return 0;
    }
    let circuit; try { circuit = o.circuitFile ? loadCircuit(o.circuitFile) : loadCircuit(); } catch (e) { err("subEstimatorStudy: cannot read the circuit file: " + e.message); return 1; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("subEstimatorStudy: " + e.message); return 1; } }
    const stale = have.filter((r) => r.smoke !== o.smoke || r.auditBase !== (o.smoke ? null : o.auditBase));
    if (stale.length) { err(`subEstimatorStudy: ${o.out} holds ${stale.length} record(s) of another audit range or a smoke run (${stale.map((r) => r.spec).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map((r) => r.spec)), specs = parseSpecs(o.specs), todo = specs.filter((s) => !done.has(specName(s))), needRefs = !done.has("refs");
    out(`[subEstimatorStudy] ${specs.length} circuits asked for, ${specs.length - todo.length} already in ${o.out}, ${todo.length} to run; references ${needRefs ? "to run" : "already there"}; audits on ${o.smoke ? "a few throwaway dives" : "base " + o.auditBase}; closed loop ${o.closedLoop ? "on" : "off"}`);
    if (!todo.length && !needRefs) { for (const l of reportLines(have)) out(l); return 0; }
    const data = (io.prepare || prepare)({ auditBase: o.auditBase, smoke: o.smoke }), records = [...have], opts = { auditBase: o.auditBase, smoke: o.smoke, closedLoop: o.closedLoop };
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (needRefs) { keep((io.runReferences || runReferences)(data, opts)); out("[subEstimatorStudy] references done"); }
    for (const s of todo) { const rec = (io.runCircuit || runCircuit)(s, circuit, data, opts); keep(rec); out(`[subEstimatorStudy] ${rec.spec} done: radius ${rec.chosen.radius}, lambda ${rec.chosen.lambda}; RMSE ${AUDITS.map((a) => f4(rec.scores[a].rmse)).join(" | ")}; skill ${AUDITS.map((a) => f2(rec.scores[a].skill)).join(" | ")}`); }
    for (const l of reportLines(records)) out(l);
    return 0;
}
