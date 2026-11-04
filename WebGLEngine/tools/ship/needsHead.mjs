// WebGLEngine/tools/ship/needsHead.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/needsHeadCmd.mjs; the gate is tools/ship/needsHead-selfcheck.mjs)
//
// ROUND H3 of brain/HEAD_TO_HEAD.md (registered before this file existed): the survey task flown, through the switchboard (brain/switchboard.mjs), by sixteen decision-layer arms -- the rule the circuits started from
// (GUARDED_OBS), the tuned rule at the Round 8 constants and at low -0.06, the twin seat, and the twelve trained needs circuits of Piece 4 rebuilt from their recorded weights -- on fresh seeds of all four kinds, and read as
// paired differences, with the real wirings (cx, nostate, withheld) set against the nine shuffled controls.
// THE FIRST-ORDER ORIENTATION STEP, SAID OUT LOUD: every number of Rounds 8-33 was measured under it, the box3d line made RK4 the engine's default on 2026-11-04, and this round keeps the numbers comparable.
// Reads nothing from disk (the command hands the circuit and the records in). THE SEEDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import "../../physics/mechanics/rigidBody6dofEuler.mjs";   // 2026-11-04 -- every needs-and-limits number was measured under the first-order orientation step; RK4 is the default now
import * as T from "../../brain/needsTask.mjs";
import * as B from "../../brain/switchboard.mjs";
import * as C from "./trainNeedsCircuit.mjs";

export const CIRCUITS = Object.freeze(["cx", "nostate", "withheld", "er:0", "er:1", "er:2", "layer:0", "layer:1", "layer:2", "degree:0", "degree:1", "degree:2"]);
export const REAL = Object.freeze(["cx", "nostate", "withheld"]);
export const KINDS = Object.freeze(["plain", "deep", "far", "both"]);
export const RANGE = Object.freeze({ from: 15001, to: 15060 }), PER_ARM = 240;
const idOf = (spec) => "circ-" + spec.replace(":", "");
export const RULES = Object.freeze(["rule-obs", "rule-r8", "rule-low06", "twin-low06"]);
export const ARM_IDS = Object.freeze([...RULES, ...CIRCUITS.map(idOf)]);

/** The board of this round: the survey task and the sixteen arms. `circuit` is { neurons, edges, io } (the vendored heading loop), `records` the lines of the Piece 4 results file (the refs record is ignored): each circuit's champion weights are rebuilt through trainNeedsCircuit's own policyOf. Refuses a missing record, a record with no weights, or weights of another count than the policy's. */
export function boardOf(circuit, records) {
    const byName = new Map((records || []).filter((r) => r && r.spec && r.spec !== "refs" && Array.isArray(r.weights)).map((r) => [r.spec, r]));
    const b = B.createBoard().addTask(B.surveyTask);
    b.addArm({ id: "rule-obs", layer: "decision", controls: [], pilot: () => T.GUARDED_OBS, note: "GUARDED-OBS, the rule every circuit was trained from" });
    const base = B.surveyArms();
    for (const id of ["rule-r8", "rule-low06"]) { const a = base.find((x) => x.id === id); b.addArm({ ...a, controls: id === "rule-low06" ? ["rule-r8"] : [] }); }
    const tw = base.find((x) => x.id === "twin-standard"); b.addArm({ ...tw, id: "twin-low06", controls: ["rule-low06"], note: "the twin seat, standard profile, low -0.06" });
    for (const spec of CIRCUITS) {
        const rec = byName.get(spec); if (!rec) throw new Error(`needsHead.boardOf: the record of ${spec} is missing (or has no weights)`);
        const Pol = C.policyOf(C.parseSpecs(spec)[0], circuit);
        if (rec.weights.length !== Pol.WEIGHT_COUNT) throw new Error(`needsHead.boardOf: ${spec} has ${rec.weights.length} recorded weights and its policy takes ${Pol.WEIGHT_COUNT}`);
        const w = Float32Array.from(rec.weights);
        b.addArm({ id: idOf(spec), layer: "decision", controls: ["rule-obs", "rule-low06", "twin-low06"], pilot: () => Pol.pilotFor(w), note: `the trained needs circuit ${spec}` });
    }
    return b;
}
/** EVERY arm once on `range` seeds of `kinds` (the gate shortens both and the seconds). Returns { runs, range, kinds, seconds }. */
export function audit(circuit, records, { range = RANGE, kinds = KINDS, seconds = null } = {}) {
    const b = boardOf(circuit, records), res = b.run("survey", [...ARM_IDS], range, { kinds: [...kinds], ...(seconds ? { seconds } : {}) });
    return { runs: res.runs, range, kinds: [...kinds], seconds };
}
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const varOf = (a) => (a.length < 2 ? 0 : a.reduce((s, x) => s + (x - meanOf(a)) ** 2, 0) / (a.length - 1));
export const scoreMean = (runs) => meanOf(runs.map((r) => r.score));
const badOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0);
const rd = (au, a, b) => { const p = B.paired(au.runs[a], au.runs[b]); return { ...p, reading: B.readingOf(p) }; };
/** A circuit's three paired readings: against rule-obs, rule-low06 and twin-low06. */
export const readingsOf = (au, spec) => { const id = idOf(spec); return { spec, id, mean: scoreMean(au.runs[id]), bad: badOf(au.runs[id]), vsObs: rd(au, id, "rule-obs"), vsRule: rd(au, id, "rule-low06"), vsTwin: rd(au, id, "twin-low06") }; };
/** The family comparison: each circuit's own mean, the three real wirings against the nine controls, Welch on the means. */
export function familyOf(au) {
    const m = (s) => scoreMean(au.runs[idOf(s)]), real = REAL.map(m), ctrl = CIRCUITS.filter((s) => !REAL.includes(s)).map(m);
    const diff = meanOf(real) - meanOf(ctrl), se = Math.sqrt(varOf(real) / real.length + varOf(ctrl) / ctrl.length);
    return { real: meanOf(real), ctrl: meanOf(ctrl), diff, se, above: diff > 0 && diff > B.SE_FACTOR * se };
}
const list = (xs) => xs.join(", "), sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function bottomLines(au) {
    const rs = CIRCUITS.map((s) => readingsOf(au, s)), pick = (f) => rs.filter(f).map((r) => r.spec);
    const bo = pick((r) => r.vsObs.reading === "BETTER"), wo = pick((r) => r.vsObs.reading === "WORSE"), br = pick((r) => r.vsRule.reading === "BETTER"), wr = pick((r) => r.vsRule.reading === "WORSE");
    const best = rs.reduce((a, r) => (r.mean > a.mean ? r : a), rs[0]), tw = best.vsTwin, word = tw.reading === "BETTER" ? "BEATS" : tw.reading === "WORSE" ? "IS BELOW" : "TIES";
    const fam = familyOf(au), bads = rs.map((r) => r.bad);
    return [
        `${bo.length} OF ${CIRCUITS.length} CIRCUITS BEAT THEIR START (RULE-OBS) (${list(bo) || "none"})${wo.length ? `; ${list(wo)} ARE BELOW IT` : ""}`,
        `${br.length} OF ${CIRCUITS.length} CIRCUITS BEAT THE TUNED RULE AT THE SEAT'S CONSTANTS (${list(br) || "none"})${wr.length ? `; ${list(wr)} ARE BELOW IT` : ""}`,
        `THE BEST CIRCUIT (${best.spec}, ${best.mean.toFixed(4)}) ${word} THE TWIN SEAT (${sgn(tw.mean)})`,
        `THE REAL WIRINGS AVERAGE ${fam.real.toFixed(4)} AND THE SHUFFLED CONTROLS ${fam.ctrl.toFixed(4)}: ${fam.above ? "REAL ABOVE" : "NOT ABOVE"} (difference ${sgn(fam.diff)}, 2 se ${(B.SE_FACTOR * fam.se).toFixed(4)})`,
        `HULL: crushed or stranded dives: rule-low06 ${badOf(au.runs["rule-low06"])}, twin ${badOf(au.runs["twin-low06"])}, circuits ${bads.reduce((a, b) => a + b, 0)} (${Math.max(...bads)} in the worst)`,
    ];
}
/** The registered checks. `repro` = { "rule-r8": [scores], "rule-low06": [scores], "twin-low06": [scores] }, the first scores of Round 33's far-kind runs on seeds 12001..: the command flies the same three dives and the check compares them. */
export function checksOf(au, repro = null) {
    const rows = [], n = (au.range.to - au.range.from + 1) * au.kinds.length;
    const sizes = ARM_IDS.every((a) => au.runs[a] && au.runs[a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} dives: ${sizes}` });
    const same = ARM_IDS.every((a) => au.runs[a] && au.runs[a].every((r, i) => au.runs["rule-obs"][i] && r.key === au.runs["rule-obs"][i].key));
    rows.push({ name: "DIVES ALIGNED", ok: same, text: `the dives are the same in every arm, in the same order: ${same}` });
    const distinct = RULES.every((a, i) => RULES.slice(i + 1).every((b) => au.runs[a].some((r, k) => r.score !== au.runs[b][k].score)));
    rows.push({ name: "RULES DISTINCT", ok: distinct, text: `the four rules and the seat are pairwise different on at least one dive: ${distinct}` });
    const finite = ARM_IDS.every((a) => au.runs[a].every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 1));
    rows.push({ name: "SCORES IN [0, 1]", ok: finite, text: `every score is a number in [0, 1]: ${finite}` });
    if (repro) { const ok = ["rule-r8", "rule-low06", "twin-low06"].every((a) => Array.isArray(repro[a]) && repro[a].length >= 1 && repro[a].every((x) => Number.isFinite(x))); rows.push({ name: "REPRODUCTION", ok: !!repro.ok && ok, text: `the rules and the seat reproduce Round 33's scores on the same dives under the first-order step: ${!!repro.ok && ok}` }); }
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au, repro = null) {
    const L = [`ROUND H3: the survey, the twelve trained needs circuits against the rules and the seat. Seeds ${au.range.from}-${au.range.to} of ${au.kinds.join(", ")} (${(au.range.to - au.range.from + 1) * au.kinds.length} dives an arm), gauge sd 0.10, first-order orientation step; read once`];
    const checks = checksOf(au, repro), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("means (bad = crushed or stranded dives):");
    for (const a of ARM_IDS) L.push(`  ${a.padEnd(16)} ${scoreMean(au.runs[a]).toFixed(4)}  bad ${badOf(au.runs[a])}`);
    L.push("per kind: " + RULES.concat(["best circuit"]).map((a) => { const id = a === "best circuit" ? readingsOf(au, CIRCUITS.reduce((x, s) => (scoreMean(au.runs[idOf(s)]) > scoreMean(au.runs[idOf(x)]) ? s : x), CIRCUITS[0])).id : a; return `${a}: ` + au.kinds.map((k) => k + " " + scoreMean(au.runs[id].filter((r) => r.key.startsWith(k + ":"))).toFixed(3)).join(" "); }).join(" | "));
    for (const s of CIRCUITS) { const r = readingsOf(au, s); L.push(`${s}:`, `   vs rule-obs   ${fmt(r.vsObs)}`, `   vs rule-low06 ${fmt(r.vsRule)}`, `   vs twin-low06 ${fmt(r.vsTwin)}`); }
    L.push(`twin-low06 minus rule-low06 ${fmt(rd(au, "twin-low06", "rule-low06"))}`);
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
