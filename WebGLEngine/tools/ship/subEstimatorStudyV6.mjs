// WebGLEngine/tools/ship/subEstimatorStudyV6.mjs -- UNNUMBERED (the version is chosen at ship time; the command is tools/ship/subEstimatorStudyV6Cmd.mjs; the gate is tools/subReservoirV6-selfcheck.mjs)
//
// THE STUDY OF RUNG 4a, VERSION 6 ("THE GLOMERULUS-SHIFT MAP"), AS REGISTERED IN brain/RUNG_4A_V6_SHIFT_MAP_WIP.md (d9243ffd, written before any code for it). The same question, senses, record of dives, ridge fit, scoring and verdict rule as
// versions 2 to 5 (tools/ship/subEstimatorStudy.mjs, imported and left as it is), with tools/subReservoirV6.mjs's starts and a fresh audit base (131000).
//   ARMS    SB a bump on the EPG cells by glomerulus angle at the start of every dive, v5's side-coded rate; SF the flat start of the same total, the same rate. Each arm is a complete study with its own verdict.
//   THE SIGNAL CHECK (v5's), THE BOTTOM LINE (reading d), SB AGAINST SF (reading e), THE MECHANISM CHECK (reading f: cx and the ER circuits, reported, not in the verdict).
//   node tools/ship/subEstimatorStudyV6Cmd.mjs run --specs <list> --out <results.jsonl> [--arms SB,SF] [--audit-base 131000] [--smoke] [--no-closed-loop]      (resumable)
//   node tools/ship/subEstimatorStudyV6Cmd.mjs report --in <results.jsonl>[,<more.jsonl>]
// Pure apart from the files it reads and writes. No clock beyond the seconds it reports, no Math.random.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/subTask.mjs";
import * as A from "../../brain/autopilotSub.mjs";
import * as CS from "../../brain/pilotSubCircuitState.mjs";
import * as D from "../subDropout.mjs";
import * as E from "../subHeadingEstimator.mjs";
import * as V from "../subReservoirV6.mjs";
import * as S2 from "./subEstimatorStudy.mjs";
import { parseSpecs, specName, circuitFor, loadCircuit, AUDITS, FAMILIES, VERDICT_FAMILIES } from "./trainSubState.mjs";
import { meanOf, readRecords } from "./trainSubCircuits.mjs";

export const AUDIT_BASE = 131000, ARM_IDS = Object.freeze(["SB", "SF"]), SPECS = S2.SPECS, TOP_FACTOR = V.FACTORS[V.FACTORS.length - 1];
const NAMES = { er: "ER", layer: "TYPE-BLOCK", degree: "DEGREE", sign: "SIGN", count: "COUNT", nostate: "NO STATE" };

/** One circuit under one arm: the input map, the amplitude scale, the edge under the arm's start at the larger amplitude, the 14 settings, the fit, the scores, the mechanism check and (unless closedLoop is false) the closed loop. */
export function runCircuit(arm, spec, circuit, data, opts = {}) {
    const c = circuitFor(spec, circuit), persist = spec.family !== "nostate", rho = persist ? E.spectralRadius(CS.reservoirOf(c)) : 1, key = specName(spec);
    const win = V.windowFor(c, data.fit), r = V.ampScale(c, data.fit), startAt = (amp) => V.startOf(arm.start, c, amp);
    const edge = persist ? V.edgeGainStart(c, data.fit, { win, rho, start: startAt(V.AMPS[V.AMPS.length - 1] * r) }) : null;
    const settings = V.settingsOf(edge ? edge.gain : null, r), mk = (s) => V.modelWithStart(c, { unit: arm.unit, gain: s.gain, rho, persist, readAll: arm.readAll, win }, startAt(s.amp));
    const fit = E.fitModel(mk, settings, V.LAMBDAS, data.fit, data.sel), scores = {}, closedLoop = {};
    const fitScore = V.scoreWith(mk(fit.setting), fit.readout, data.fit);
    for (const a of AUDITS) scores[a] = V.scoreWith(mk(fit.setting), fit.readout, data.audits[a]);
    const mech = V.mechanism(c, mk(fit.setting));
    if (opts.closedLoop !== false) for (const a of AUDITS) closedLoop[a] = T.evaluate(D.dropout(E.estimatorPilot(mk(fit.setting), Float64Array.from(fit.readout), A.pilot())), data.sets[a]).score;
    return { spec: key, arm: arm.id, family: spec.family, index: spec.index, auditBase: opts.smoke ? null : (opts.auditBase ?? AUDIT_BASE), smoke: !!opts.smoke, rho: persist ? rho : null,
        calibration: { gStar: edge ? edge.gain : null, status: edge ? edge.status : "noRecurrence", factor: fit.setting.factor, gain: fit.setting.gain, amp: fit.setting.amp, ampScale: r, ampMultiple: fit.setting.amp / r },
        chosen: { setting: fit.setting, lambda: fit.lambda, selRmse: fit.selRmse }, settingsTried: new Set(fit.candidates.map((x) => x.setting)).size, readout: fit.readout, fitScore: { rmse: fitScore.rmse, skill: fitScore.skill }, scores, mechanism: mech, closedLoop: opts.closedLoop === false ? null : closedLoop };
}

const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4)), f2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(2)), f3 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(3));
const f1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(1));
const readSkill = (k) => (k >= S2.READ_SKILL.integrates ? "integrates" : k >= S2.READ_SKILL.some ? "has some memory" : "does not integrate");
/** The verdict of one arm: version 2's rule over the arm's records. */
export const armVerdict = (records, armId) => S2.verdictOf(records.filter((r) => r.arm === armId && r.family !== "refs"));

/** The registered bottom line (reading d): `verdicts` { SB, SF }, `leaks` { SB, SF }, `signal` { SB, SF } (true / false / null). */
export function bottomLine(verdicts, leaks = {}, signal = {}) {
    const read = ARM_IDS.filter((id) => id in verdicts && !leaks[id] && verdicts[id] !== "NOT ASSESSED"), all = read.map((id) => id + " " + verdicts[id] + (signal[id] === false ? " (NO SIGNAL)" : "")).join(", ");
    if (read.length < ARM_IDS.length) return `RUNG 4a v6 BOTTOM LINE: NOT YET -- ${ARM_IDS.filter((id) => !read.includes(id)).map((id) => `arm ${id} ${!(id in verdicts) ? "has no records" : leaks[id] ? "is not read (leak)" : "is not assessed"}`).join("; ")}`;
    if (signal.SB === false) return `RUNG 4a v6 BOTTOM LINE: NO SIGNAL in the shift-map arm (${all}) -- the bump and the side-coded rate carry no readable signal in any wiring; this arm says nothing about the wiring`;
    if (verdicts.SB === "PASS" && signal.SB === true) return verdicts.SF === "PASS" && signal.SF !== false ? `RUNG 4a v6 BOTTOM LINE: PASS in both arms (${all}) -- the real wiring beats its controls under this drive whatever the start` : `RUNG 4a v6 BOTTOM LINE: PASS in the shift-map arm and not with a flat start (${all}) -- the bump the glomerulus numbers place, driven by the side-coded rate, lets the real wiring beat its controls: the first PASS of rung 4a, and it needs the heading-shaped start`;
    if (verdicts.SB === "FAIL" && signal.SB === true) return `RUNG 4a v6 BOTTOM LINE: FAIL in the shift-map arm with the signal check passed (${all}) -- the shift is in the wiring but a linear readout of this reservoir does not use it better than rewired controls do: rung 4a's conclusion survives the glomerulus-shift map`;
    return `RUNG 4a v6 BOTTOM LINE: reported as it is (${all})`;
}
/** Reading e: per family, the mean audit skill of SB and SF and the number of families in which SB's exceeds SF's by more than 0.05. */
export function bumpLine(records) {
    const mean = (id, f) => { const rs = records.filter((r) => r.arm === id && r.family === f); return rs.length ? meanOf(rs.map((r) => r.scores.audit.skill)) : null; };
    const rows = ["cx", ...FAMILIES].map((f) => [f, mean("SB", f), mean("SF", f)]).filter((x) => x[1] !== null && x[2] !== null);
    if (!rows.length) return null;
    const better = rows.filter((x) => x[1] - x[2] > 0.05).length;
    return `  SB against SF (reading e), mean audit skill: ${rows.map((x) => `${x[0] === "cx" ? "CX" : NAMES[x[0]]} ${f2(x[1])} / ${f2(x[2])}`).join("; ")}; SB exceeds SF by more than 0.05 in ${better} of ${rows.length}`;
}
/** Reading f: the mechanism check of an arm: cx's two angles and whether its bump moves, and the count of ER circuits whose bump moves. */
export function mechanismLine(records, armId) {
    const recs = records.filter((r) => r.arm === armId && r.mechanism), cx = recs.find((r) => r.family === "cx"), er = recs.filter((r) => r.family === "er");
    if (!cx && !er.length) return null;
    return `  mechanism check (reading f, reported): cx ${cx ? `+1 -> ${f1(cx.mechanism.plus)} deg, -1 -> ${f1(cx.mechanism.minus)} deg: ${cx.mechanism.moves ? "the bump MOVES WITH THE TURN" : "the bump does not move with the turn"}` : "not run"}; ER: the bump moves in ${er.filter((r) => r.mechanism.moves).length} of ${er.length}`;
}

/** The lines of the report. */
export function reportLines(records) {
    const refs = records.find((r) => r.family === "refs"), lines = [], verdicts = {}, leaks = {}, signals = {};
    if (refs) {
        lines.push(`references (RMSE of delta_hat in radians over the dark ticks; audit | safety audit | reserve): NONE ${AUDITS.map((a) => f4(refs.none[a])).join(" | ")}  ORACLE ${AUDITS.map((a) => f4(refs.oracle[a])).join(" | ")}`);
        lines.push(`  LEAKY1 (one unit, sigma ${refs.leaky.chosen.sigma}): ${AUDITS.map((a) => f4(refs.leaky.scores[a].rmse)).join(" | ")}  skill ${AUDITS.map((a) => f2(refs.leaky.scores[a].skill)).join(" | ")}`);
        if (refs.targetRange) lines.push(`  the target on the audits: largest |change| ${AUDITS.map((a) => f2(refs.targetRange[a].maxAbs)).join(" | ")} rad; dives above pi ${AUDITS.map((a) => f2(refs.targetRange[a].overPi)).join(" | ")}`);
        if (refs.flights) lines.push(`  the autopilot flown on the audits: clean ${AUDITS.map((a) => f4(refs.flights[a].clean)).join(" | ")}; through the dropout ${AUDITS.map((a) => f4(refs.flights[a].dropout)).join(" | ")}; with the oracle navigator ${AUDITS.map((a) => f4(refs.flights[a].navigator)).join(" | ")}`);
    }
    for (const id of ARM_IDS) {
        const recs = records.filter((r) => r.arm === id && r.family !== "refs"); if (!recs.length) continue;
        const arm = V.ARMS[id], v = armVerdict(records, id), cx = recs.find((r) => r.family === "cx"); verdicts[id] = v.verdict;
        lines.push(`ARM ${id} (${arm.name}), ${recs.length} circuits:`);
        if (cx) lines.push(`  CX: g* ${f3(cx.calibration.gStar)} (${cx.calibration.status}), factor ${f3(cx.calibration.factor)}, amplitude ${f2(cx.calibration.ampMultiple)} x r, lambda ${cx.chosen.lambda} | RMSE ${AUDITS.map((a) => f4(cx.scores[a].rmse)).join(" | ")} | skill ${AUDITS.map((a) => f2(cx.scores[a].skill)).join(" | ")} (in-sample ${f2(cx.fitScore.skill)}): ${readSkill(cx.scores.audit.skill)}`);
        for (const fam of FAMILIES) {
            const rs = recs.filter((r) => r.family === fam); if (!rs.length) continue;
            const d = v.families[fam], mk = AUDITS.map((a) => meanOf(rs.map((r) => r.scores[a].skill))), caps = rs.reduce((n, r) => n + AUDITS.reduce((m, a) => m + r.scores[a].capHits, 0), 0);
            lines.push(`  ${NAMES[fam]} x${rs.length}: RMSE ` + AUDITS.map((a) => (d ? `${f4(d.audits[a].m)} +- ${f4(d.audits[a].s)} (cx ${f4(d.audits[a].F)}; a win needs ${f4(d.audits[a].m - d.audits[a].needs)} or lower: ${d.audits[a].wins ? "WINS" : "no"})` : "n/a")).join(" | ") +
                ` | mean skill ${mk.map(f2).join(" | ")}: ${readSkill(mk[0])}` + (VERDICT_FAMILIES.includes(fam) ? "" : "   [reported, not in the verdict]") + (caps ? `; ${caps} ticks touched the cap` : ""));
        }
        const stateful = recs.filter((r) => r.family !== "nostate" && r.calibration.factor !== null), top = stateful.filter((r) => Math.abs(r.calibration.factor - TOP_FACTOR) < 1e-9).length, big = recs.filter((r) => Math.abs(r.calibration.ampMultiple - V.AMPS[1]) < 1e-9).length;
        if (stateful.length) lines.push(`  circuits that chose the top factor ${TOP_FACTOR}: ${top} of ${stateful.length}; that chose the larger amplitude: ${big} of ${recs.length}`);
        const ns = recs.filter((r) => r.family === "nostate");
        if (ns.length && ns.some((r) => r.scores.audit.skill > S2.READ_SKILL.leak)) { leaks[id] = true; lines.push(`  WARNING (reading a): NO STATE has a skill above ${S2.READ_SKILL.leak} in arm ${id} -- the target leaks through the senses and the arm is not read`); }
        if (recs.some((r) => r.closedLoop) && refs && refs.flights) {
            const row = (name, rs) => { const k = AUDITS.map((a) => { const s = meanOf(rs.map((r) => r.closedLoop[a])), fl = refs.flights[a]; return `${f4(s)} (${f2(fl.navigator - fl.dropout > 0 ? (s - fl.dropout) / (fl.navigator - fl.dropout) : null)})`; }); lines.push(`  closed loop, ${name}: ${k.join(" | ")}`); };
            if (cx && cx.closedLoop) row("cx", [cx]);
            for (const fam of FAMILIES) { const rs = recs.filter((r) => r.family === fam && r.closedLoop); if (rs.length) row(`${NAMES[fam]} mean of ${rs.length}`, rs); }
        }
        const ml = mechanismLine(records, id); if (ml) lines.push(ml);
        const sg = V.signalCheck(recs); signals[id] = sg.signal;
        lines.push(`  signal check (registered): mean in-sample skill over the ER, TYPE-BLOCK and DEGREE circuits ${f3(sg.mean)} (${sg.n} circuits; the arm needs ${V.SIGNAL_MIN}): ${sg.signal === null ? "NOT KNOWN" : sg.signal ? "SIGNAL" : "NO SIGNAL -- this arm says nothing about the wiring"}`);
        lines.push(`  RUNG 4a v6, arm ${id}: ${v.verdict} -- ${v.why}`);
    }
    const bl = bumpLine(records); if (bl) lines.push(bl);
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
/** THE COMMAND, as a function (v5's shape): `run` fits and scores the (arm, circuit) pairs not yet in --out (the references first), one line a record, then prints the report; `report` prints it for one or more results files (comma-separated; refs kept once). */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), appendFile = io.appendFile || fs.appendFileSync, exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("subEstimatorStudyV6: " + e.message); return 2; }
    if (o.cmd === "report") {
        let records; try { records = o.in.split(",").flatMap((f) => readRecords(readFile(f))); } catch (e) { err("subEstimatorStudyV6: " + e.message); return 1; }
        const seen = new Set(); records = records.filter((r) => { const k = keyOf(r); if (seen.has(k)) return false; seen.add(k); return true; });
        if (!records.length) { err("subEstimatorStudyV6: the results file has no records"); return 1; }
        for (const l of reportLines(records)) out(l);
        return 0;
    }
    let circuit; try { circuit = o.circuitFile ? loadCircuit(o.circuitFile) : loadCircuit(); } catch (e) { err("subEstimatorStudyV6: cannot read the circuit file: " + e.message); return 1; }
    let have = []; if (exists(o.out)) { try { have = readRecords(readFile(o.out)); } catch (e) { err("subEstimatorStudyV6: " + e.message); return 1; } }
    const stale = have.filter((r) => r.auditBase !== (o.smoke ? null : o.auditBase));
    if (stale.length) { err(`subEstimatorStudyV6: ${o.out} holds ${stale.length} record(s) of another audit range or a smoke run: it is not mixed with this run -- use another --out`); return 1; }
    const done = new Set(have.map(keyOf)), specs = parseSpecs(o.specs), pairs = specs.flatMap((s) => o.arms.map((id) => ({ s, id }))).filter(({ s, id }) => !done.has(`${id}|${specName(s)}`)), needRefs = !done.has("refs");
    out(`[subEstimatorStudyV6] ${specs.length} circuits x ${o.arms.length} arms (${o.arms.join(", ")}), ${specs.length * o.arms.length - pairs.length} already in ${o.out}, ${pairs.length} to run; references ${needRefs ? "to run" : "already there"}; audits on ${o.smoke ? "a few throwaway dives" : "base " + o.auditBase}; closed loop ${o.closedLoop ? "on" : "off"}`);
    if (!pairs.length && !needRefs) { for (const l of reportLines(have)) out(l); return 0; }
    const data = (io.prepare || S2.prepare)({ auditBase: o.auditBase, smoke: o.smoke }), records = [...have], opts = { auditBase: o.auditBase, smoke: o.smoke, closedLoop: o.closedLoop };
    const keep = (rec) => { appendFile(o.out, JSON.stringify(rec) + "\n"); records.push(rec); };
    if (needRefs) { const refsRec = (io.runReferences || S2.runReferences)(data, opts); refsRec.targetRange = Object.fromEntries(AUDITS.map((a) => [a, V.targetRange(data.audits[a])])); keep(refsRec); out("[subEstimatorStudyV6] references done"); }
    for (const { s, id } of pairs) { const rec = (io.runCircuit || runCircuit)(V.ARMS[id], s, circuit, data, opts); keep(rec); out(`[subEstimatorStudyV6] ${id} ${rec.spec} done: factor ${f3(rec.calibration.factor)}, amplitude ${f2(rec.calibration.ampMultiple)} x r, lambda ${rec.chosen.lambda}`); }
    for (const l of reportLines(records)) out(l);
    return 0;
}
