// WebGLEngine/tools/ship/subEstimatorStudyV5.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/subEstimatorStudyV5Cmd.mjs; the gate is tools/subReservoirV5-selfcheck.mjs)
//
// THE STUDY OF RUNG 4a, VERSION 5 ("THE RING MAP WITHOUT THE FLAG"), AS REGISTERED IN brain/SUBMARINE_WIP.md ("RUNG 4a VERSION 5", written before any code for it). The same question, senses, record of dives, ridge fit, scoring and verdict rule as versions 2 to 4 (tools/ship/subEstimatorStudy.mjs, which this file imports and leaves
// as it is), with the flag-free maps of tools/subReservoirV5.mjs and a fresh audit base (80000).
//   ARMS    RMF the heading rate into PEN_R (+) and PEN_L (-), nothing else connected; RMU the same rate into every PEN cell with one sign. Each arm is a complete study with its own verdict.
//   THE SIGNAL CHECK (new, registered): every record carries its skill on the FITTING dives; an arm has SIGNAL iff the mean in-sample skill over the ER, TYPE-BLOCK and DEGREE circuits is at least 0.05; otherwise the arm is NO SIGNAL and says nothing about the wiring.
//   BOTTOM LINE (registered reading d) and the RMF-versus-RMU line (reading e): see bottomLine and reportLines. An arm whose NO STATE control leaks (skill above 0.2) is not read.
//   node tools/ship/subEstimatorStudyV5Cmd.mjs run --specs <list> --out <results.jsonl> [--arms RMF,RMU] [--audit-base 80000] [--smoke] [--no-closed-loop]      (resumable: an (arm, circuit) already in --out is not run again)
//   node tools/ship/subEstimatorStudyV5Cmd.mjs report --in <results.jsonl>
// Pure apart from the files it reads and writes. No clock beyond the seconds it reports, no Math.random.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/subTask.mjs";
import * as A from "../../brain/autopilotSub.mjs";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import * as D from "../subDropout.mjs";
import * as E from "../subHeadingEstimator.mjs";
import * as V from "../subReservoirV5.mjs";
import * as S2 from "./subEstimatorStudy.mjs";
import { parseSpecs, specName, circuitFor, loadCircuit, AUDITS, FAMILIES, VERDICT_FAMILIES } from "./trainSubState.mjs";
import { meanOf, sdOf, readRecords } from "./trainSubCircuits.mjs";

export const TOP_FACTOR = V.FACTORS[V.FACTORS.length - 1], AUDIT_BASE = 80000, ARM_IDS = Object.freeze(["RMF", "RMU"]), SPECS = S2.SPECS;
const NAMES = { er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE", sign: "SIGN", count: "COUNT", nostate: "NO STATE" };

/** One circuit under one arm: the gains (the edge found once per circuit and kept in `opts.edgeCache`), the fit on the fitting dives, the choice on the held-out dives, the scores on the three audits and (unless `closedLoop` is false) the closed loop. Returns the record the file keeps. */
export function runCircuit(arm, spec, circuit, data, opts = {}) {
    const c = circuitFor(spec, circuit), persist = spec.family !== "nostate", rho = persist ? E.spectralRadius(CS.reservoirOf(c)) : 1, key = specName(spec);
    const win = V.windowFor(arm, c, data.fit);
    let edge = null;
    if (persist) { edge = opts.edgeCache ? opts.edgeCache.get(arm.id + "|" + key) : null; if (!edge) { edge = V.edgeGain(c, data.fit, { rho, win }); if (opts.edgeCache) opts.edgeCache.set(arm.id + "|" + key, edge); } }
    const found = V.gainsFor(arm, c, data.fit, { persist, rho, edge, win }), mk = (gain) => V.reservoirModel(c, { unit: arm.unit, gain, rho, persist, readAll: arm.readAll, inScale: found.inScale, win });
    const fit = E.fitModel(mk, found.settings, V.LAMBDAS, data.fit, data.sel), scores = {}, closedLoop = {};
    const fitScore = V.scoreWith(mk(fit.setting), fit.readout, data.fit);
    for (const a of AUDITS) scores[a] = V.scoreWith(mk(fit.setting), fit.readout, data.audits[a]);
    if (opts.closedLoop !== false) for (const a of AUDITS) closedLoop[a] = T.evaluate(D.dropout(E.estimatorPilot(mk(fit.setting), Float64Array.from(fit.readout), A.pilot())), data.sets[a]).score;
    return { spec: key, arm: arm.id, family: spec.family, index: spec.index, auditBase: opts.smoke ? null : (opts.auditBase ?? AUDIT_BASE), smoke: !!opts.smoke, rho: persist ? rho : null,
        calibration: { gStar: found.gStar, status: found.status, factor: found.gStar === null ? null : fit.setting / found.gStar, gain: fit.setting, inScale: found.inScale },
        chosen: { setting: fit.setting, lambda: fit.lambda, selRmse: fit.selRmse }, readout: fit.readout, fitScore: { rmse: fitScore.rmse, skill: fitScore.skill }, scores, closedLoop: opts.closedLoop === false ? null : closedLoop };
}

const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4)), f2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(2)), f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));
const readSkill = (k) => (k >= S2.READ_SKILL.integrates ? "integrates" : k >= S2.READ_SKILL.some ? "has some memory" : "does not integrate");

/** The verdict of one arm: version 2's rule over the arm's records. */
export const armVerdict = (records, armId) => S2.verdictOf(records.filter((r) => r.arm === armId && r.family !== "refs"));

/** The bottom line over the two arms (registered reading d): `verdicts` { RMF, RMU } of PASS / IN BETWEEN / FAIL / NOT ASSESSED (absent = no records), `leaks` { RMF, RMU } true when NO STATE leaked in that arm (the arm is then not read), `signal` { RMF, RMU } true / false / null (the signal check: null = not known). */
export function bottomLine(verdicts, leaks = {}, signal = {}) {
    const read = ARM_IDS.filter((id) => id in verdicts && !leaks[id] && verdicts[id] !== "NOT ASSESSED"), all = read.map((id) => id + " " + verdicts[id] + (signal[id] === false ? " (NO SIGNAL)" : "")).join(", ");
    if (read.length < ARM_IDS.length) return `RUNG 4a v5 BOTTOM LINE: NOT YET -- ${ARM_IDS.filter((id) => !read.includes(id)).map((id) => `arm ${id} ${!(id in verdicts) ? "has no records" : leaks[id] ? "is not read (leak)" : "is not assessed"}`).join("; ")}`;
    if (signal.RMF === false) return `RUNG 4a v5 BOTTOM LINE: NO SIGNAL in the flag-free ring-map arm (${all}) -- the input carries no readable signal in any wiring, so this arm says nothing about the wiring (the next change would be to the readout or the cells read, not the wiring)`;
    if (verdicts.RMF === "PASS") return signal.RMU !== false && verdicts.RMU === "PASS" ? `RUNG 4a v5 BOTTOM LINE: PASS in both arms (${all}) -- the real wiring's structure beats its controls under a rate-only drive whatever the sign of the input` : `RUNG 4a v5 BOTTOM LINE: PASS in the side-coded arm and not in the unsigned one (${all}) -- the side-coded turn signal is what let the real wiring beat its controls`;
    if (verdicts.RMF === "FAIL") return `RUNG 4a v5 BOTTOM LINE: FAIL in the flag-free ring-map arm with the signal check passed -- the v4 conclusion survives a ring map without the flag (unsigned control: ${verdicts.RMU}${signal.RMU === false ? ", NO SIGNAL" : ""}); not covered: the glomerulus-level shift, a bump-position decoder, a readout from other cells`;
    return `RUNG 4a v5 BOTTOM LINE: no PASS in the flag-free ring-map arm, reported as it is (${all})`;
}

/** The registered RMF-versus-RMU reading (e): over the six control families, the mean audit skill of each arm and the number of families in which RMF's exceeds RMU's by more than 0.05. */
export function sideCodingLine(records) {
    const fams = FAMILIES, mean = (id, f) => { const rs = records.filter((r) => r.arm === id && r.family === f); return rs.length ? meanOf(rs.map((r) => r.scores.audit.skill)) : null; };
    const rows = fams.map((f) => [f, mean("RMF", f), mean("RMU", f)]).filter((x) => x[1] !== null && x[2] !== null);
    if (!rows.length) return null;
    const better = rows.filter((x) => x[1] - x[2] > 0.05).length;
    return `  RMF against RMU (reading e), mean audit skill by family: ${rows.map((x) => `${NAMES[x[0]]} ${f2(x[1])} / ${f2(x[2])}`).join("; ")}; RMF exceeds RMU by more than 0.05 in ${better} of ${rows.length} families -- the side coding ${better * 2 > rows.length ? "matters" : "does not matter"} in most families`;
}

/** The lines of the report: the references, then for each arm that has records its cx line, its families, its closed loop and its verdict, then the bottom line over the arms. */
export function reportLines(records) {
    const refs = records.find((r) => r.family === "refs"), lines = [], verdicts = {}, leaks = {}, signals = {};
    if (refs) {
        lines.push(`references (RMSE of delta_hat in radians over the dark ticks; audit | safety audit | reserve): NONE ${AUDITS.map((a) => f4(refs.none[a])).join(" | ")}  ORACLE ${AUDITS.map((a) => f4(refs.oracle[a])).join(" | ")}`);
        lines.push(`  LEAKY1 (one unit, sigma ${refs.leaky.chosen.sigma}): ${AUDITS.map((a) => f4(refs.leaky.scores[a].rmse)).join(" | ")}  skill ${AUDITS.map((a) => f2(refs.leaky.scores[a].skill)).join(" | ")}`);
        if (refs.targetRange) lines.push(`  the target (cumulative heading change) on the audits: largest |change| ${AUDITS.map((a) => f2(refs.targetRange[a].maxAbs)).join(" | ")} rad; dives above pi ${AUDITS.map((a) => f2(refs.targetRange[a].overPi)).join(" | ")} (the ring is an angle modulo 2 pi: a share well above 0 means a linear readout of a bump is the wrong reader)`);
        if (refs.flights) lines.push(`  the autopilot flown on the audits: clean ${AUDITS.map((a) => f4(refs.flights[a].clean)).join(" | ")}; through the dropout ${AUDITS.map((a) => f4(refs.flights[a].dropout)).join(" | ")}; with the oracle navigator ${AUDITS.map((a) => f4(refs.flights[a].navigator)).join(" | ")}`);
    }
    for (const id of ARM_IDS) {
        const recs = records.filter((r) => r.arm === id && r.family !== "refs"); if (!recs.length) continue;
        const arm = V.ARMS[id], v = armVerdict(records, id), cx = recs.find((r) => r.family === "cx"); verdicts[id] = v.verdict;
        lines.push(`ARM ${id} (${arm.name}), ${recs.length} circuits:`);
        if (cx) lines.push(`  CX: g* ${f3(cx.calibration.gStar)} (${cx.calibration.status}), gain ${f3(cx.calibration.gain)}${cx.calibration.factor === null ? "" : " = " + f3(cx.calibration.factor) + " x g*"}, lambda ${cx.chosen.lambda} | RMSE ${AUDITS.map((a) => f4(cx.scores[a].rmse)).join(" | ")} | skill ${AUDITS.map((a) => f2(cx.scores[a].skill)).join(" | ")} | cap ticks ${AUDITS.map((a) => cx.scores[a].capHits).join(" | ")}`);
        for (const fam of FAMILIES) {
            const rs = recs.filter((r) => r.family === fam); if (!rs.length) continue;
            const d = v.families[fam], mk = AUDITS.map((a) => meanOf(rs.map((r) => r.scores[a].skill))), caps = rs.reduce((n, r) => n + AUDITS.reduce((m, a) => m + r.scores[a].capHits, 0), 0);
            lines.push(`  ${NAMES[fam]} x${rs.length}: RMSE ` + AUDITS.map((a) => (d ? `${f4(d.audits[a].m)} +- ${f4(d.audits[a].s)} (cx ${f4(d.audits[a].F)}; a win needs ${f4(d.audits[a].m - d.audits[a].needs)} or lower: ${d.audits[a].wins ? "WINS" : "no"})` : "n/a")).join(" | ") +
                ` | mean skill ${mk.map(f2).join(" | ")}: ${readSkill(mk[0])}` + (VERDICT_FAMILIES.includes(fam) ? "" : "   [reported, not in the verdict]") + (caps ? `; ${caps} ticks touched the cap` : ""));
        }
        const stateful = recs.filter((r) => r.family !== "nostate" && r.calibration.factor !== null), top = stateful.filter((r) => Math.abs(r.calibration.factor - TOP_FACTOR) < 1e-9).length;
        if (stateful.length) lines.push(`  circuits that chose the top factor ${TOP_FACTOR}: ${top} of ${stateful.length}${top * 2 >= stateful.length ? " -- at least half: the grid is still the limit (stated, not chased without a new registration)" : ""}`);
        const fams = [...new Set(recs.map((r) => r.family))].filter((f) => f !== "nostate" && f !== "cx" && meanOf(recs.filter((r) => r.family === f).map((r) => r.scores.audit.skill)) >= S2.READ_SKILL.some);
        lines.push(`  families whose mean skill on the audit reaches ${S2.READ_SKILL.some}: ${fams.length ? fams.map((f) => NAMES[f] || f).join(", ") : "none"}`);
        const ns = recs.filter((r) => r.family === "nostate");
        if (ns.length && ns.some((r) => r.scores.audit.skill > S2.READ_SKILL.leak)) { leaks[id] = true; lines.push(`  WARNING (reading a): NO STATE has a skill above ${S2.READ_SKILL.leak} in arm ${id} -- the target leaks through the senses and the arm is not read`); }
        if (recs.some((r) => r.closedLoop) && refs && refs.flights) {
            const row = (name, rs) => { const k = AUDITS.map((a) => { const s = meanOf(rs.map((r) => r.closedLoop[a])), fl = refs.flights[a]; return `${f4(s)} (${f2(fl.navigator - fl.dropout > 0 ? (s - fl.dropout) / (fl.navigator - fl.dropout) : null)})`; }); lines.push(`  closed loop, ${name}: ${k.join(" | ")}`); };
            if (cx && cx.closedLoop) row("cx", [cx]);
            for (const fam of FAMILIES) { const rs = recs.filter((r) => r.family === fam && r.closedLoop); if (rs.length) row(`${NAMES[fam]} mean of ${rs.length}`, rs); }
        }
        const sg = V.signalCheck(recs); signals[id] = sg.signal;
        lines.push(`  signal check (registered): mean in-sample skill over the ER, TYPE-BLOCK and DEGREE circuits ${f3(sg.mean)} (${sg.n} circuits; the arm needs ${V.SIGNAL_MIN}): ${sg.signal === null ? "NOT KNOWN" : sg.signal ? "SIGNAL" : "NO SIGNAL -- this arm says nothing about the wiring"}`);
        lines.push(`  RUNG 4a v5, arm ${id}: ${v.verdict} -- ${v.why}`);
    }
    const sc = sideCodingLine(records); if (sc) lines.push(sc);
    lines.push(bottomLine(verdicts, leaks, signals));
    return lines;
}

// ---- the command ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { specs: String, arms: String, out: String, "audit-base": Number, smoke: Boolean, "no-closed-loop": Boolean, "circuit-file": String } : { in: String }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <results file>"); return { cmd, in: given.in }; }
    if (!given.specs) throw new Error("run needs --specs <list> (the registered study: " + SPECS + ")");
    if (!given.out) throw new Error("run needs --out <results file>");
    parseSpecs(given.specs);
    const arms = (given.arms || ARM_IDS.join(",")).split(",").map((s) => s.trim());
    for (const id of arms) if (!ARM_IDS.includes(id)) throw new Error(`unknown arm ${JSON.stringify(id)} (the arms are ${ARM_IDS.join(", ")})`);
    if (new Set(arms).size !== arms.length) throw new Error(`an arm is named twice in ${JSON.stringify(given.arms)}`);
    return { cmd, specs: given.specs, arms, out: given.out, auditBase: given["audit-base"] ?? AUDIT_BASE, smoke: !!given.smoke, closedLoop: !given["no-closed-loop"], circuitFile: given["circuit-file"] || null };
}
const keyOf = (r) => (r.family === "refs" ? "refs" : `${r.arm}|${r.spec}`);
/**
 * THE COMMAND, as a function: `run` fits and scores the (arm, circuit) pairs not yet in --out (the references first, as one record `refs`), appending one line a record, then prints the report; `report` prints it for a results file. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument.
 * `io` is for the gate: { out, err, readFile, appendFile, exists, prepare, runCircuit, runReferences }.
 */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("subEstimatorStudyV5: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = readRecords(readFile(o.in)); } catch (e) { err("subEstimatorStudyV5: " + e.message); return 1; }
        if (!records.length) { err("subEstimatorStudyV5: the results file has no records"); return 1; }
        for (const l of reportLines(records)) out(l);
        return 0;
    }
    let circuit; try { circuit = o.circuitFile ? loadCircuit(o.circuitFile) : loadCircuit(); } catch (e) { err("subEstimatorStudyV5: cannot read the circuit file: " + e.message); return 1; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("subEstimatorStudyV5: " + e.message); return 1; } }
    const stale = have.filter((r) => r.auditBase !== (o.smoke ? null : o.auditBase));
    if (stale.length) { err(`subEstimatorStudyV5: ${o.out} holds ${stale.length} record(s) of another audit range or a smoke run (${stale.map((r) => keyOf(r)).join(", ")}): it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map(keyOf)), specs = parseSpecs(o.specs), pairs = specs.flatMap((s) => o.arms.map((id) => ({ s, id }))).filter(({ s, id }) => !done.has(`${id}|${specName(s)}`)), needRefs = !done.has("refs");
    out(`[subEstimatorStudyV5] ${specs.length} circuits x ${o.arms.length} arms (${o.arms.join(", ")}), ${specs.length * o.arms.length - pairs.length} already in ${o.out}, ${pairs.length} to run; references ${needRefs ? "to run" : "already there"}; audits on ${o.smoke ? "a few throwaway dives" : "base " + o.auditBase}; closed loop ${o.closedLoop ? "on" : "off"}`);
    if (!pairs.length && !needRefs) { for (const l of reportLines(have)) out(l); return 0; }
    const data = (io.prepare || S2.prepare)({ auditBase: o.auditBase, smoke: o.smoke }), records = [...have], edgeCache = new Map(), opts = { auditBase: o.auditBase, smoke: o.smoke, closedLoop: o.closedLoop, edgeCache };
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (needRefs) { const refsRec = (io.runReferences || S2.runReferences)(data, opts); refsRec.targetRange = Object.fromEntries(AUDITS.map((a) => [a, V.targetRange(data.audits[a])])); keep(refsRec); out("[subEstimatorStudyV5] references done"); }
    for (const { s, id } of pairs) { const rec = (io.runCircuit || runCircuit)(V.ARMS[id], s, circuit, data, opts); keep(rec); out(`[subEstimatorStudyV5] ${id} ${rec.spec} done: gain ${f3(rec.chosen.setting)}${rec.calibration.factor === null ? "" : " (" + f3(rec.calibration.factor) + " x g*)"}, lambda ${rec.chosen.lambda}; RMSE ${AUDITS.map((a) => f4(rec.scores[a].rmse)).join(" | ")}; skill ${AUDITS.map((a) => f2(rec.scores[a].skill)).join(" | ")}`); }
    for (const l of reportLines(records)) out(l);
    return 0;
}
