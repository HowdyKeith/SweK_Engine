// WebGLEngine/tools/ship/constShift.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/constShiftCmd.mjs; the gate is tools/ship/constShift-selfcheck.mjs)
//
// ROUND 7 of brain/NEEDS_AND_LIMITS.md ("is the Round 6 residual just a retuned threshold?"), registered before this file existed. A CONSTANT shift of the surfacing threshold is the residual seat with the output bias set so the shift is the same on every tick and the cap cut is 0.
// The frozen Round 6 champion is read from a weights array the command passes in. THE AUDITS (421-472) ARE READ ONLY BY audits(). Pure: no clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as A from "../../brain/advisorChip.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import { judge, verdictOf } from "./trainResidual.mjs";
/** Flight options for every flight this library makes (the gate shortens the dives with { seconds } for the rows that do not depend on their length; the real runs never call this). */
let FLIGHT = {};
export const setFlight = (o) => { FLIGHT = { ...o }; };

export const GRID = Object.freeze(Array.from({ length: 15 }, (_, i) => i / 100));   // 0.00 .. 0.14
export const FIXED = Object.freeze({ "CONST-0.05": 0.05, "CONST-0.10": 0.1, "CONST-0.14": 0.14 });
export const ARMS = Object.freeze(["ALONE", "RULE-GF", "RESIDUAL", "CONST-0.05", "CONST-0.10", "CONST-0.14", "CONST-TUNED"]);
export const VALIDATION = T.setOf(T.KINDS, 271, 282);
export const AUDIT_RANGES = Object.freeze({ S1: [421, 432], S2: [441, 452], S3: [461, 472] }), AUDIT_NAMES = Object.freeze(["S1", "S2", "S3"]);
const GAUGE = T.GAUGE, brainSeat = (ctx) => T.ruleSeat("obs")(ctx);

/** The weights of a constant shift: the start (hidden spread, output layer zero) with the shift output's bias at atanh(shift / SHIFT_MAX). A shift of 0 is the start itself. */
export function constWeights(shift) {
    if (!(shift >= 0 && shift < R.SHIFT_MAX)) throw new Error(`constShift.constWeights: shift ${shift} is outside [0, ${R.SHIFT_MAX})`);
    const w = R.startWeights(); w[R.OUT_START + R.N_W2] = Math.atanh(shift / R.SHIFT_MAX); return w;
}
/** The pilot of one arm. `champion` is the frozen weights, `tuned` the chosen shift. */
export function pilotOf(arm, { champion = null, tuned = null } = {}) {
    if (arm === "ALONE") return T.GUARDED_OBS;
    const vet = (w) => A.advisedPilot(brainSeat, R.residualSeat(w), "VETO");
    if (arm === "RULE-GF") return A.advisedPilot(brainSeat, A.ADVISORS["GUARDED-FILTER"], "VETO");
    if (arm === "RESIDUAL") { if (!champion) throw new Error("constShift.pilotOf: RESIDUAL needs the champion weights"); return vet(Float64Array.from(champion)); }
    if (FIXED[arm] !== undefined) return vet(constWeights(FIXED[arm]));
    if (arm === "CONST-TUNED") { if (tuned === null) throw new Error("constShift.pilotOf: CONST-TUNED needs the tuned shift"); return vet(constWeights(tuned)); }
    throw new Error(`constShift.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export const scoreOf = (arm, opts, set) => T.evaluate(pilotOf(arm, opts), set, { gauge: GAUGE, ...FLIGHT });

/** The tuning: the shift in GRID with the best mean on `validation`, ties to the smaller. Returns { shift, curve: [{ shift, score }] }. */
export function tune(validation = VALIDATION, grid = GRID) {
    const curve = grid.map((s) => ({ shift: s, score: T.evaluate(A.advisedPilot(brainSeat, R.residualSeat(constWeights(s)), "VETO"), validation, { gauge: GAUGE, ...FLIGHT }).score }));
    let best = curve[0]; for (const c of curve) if (c.score > best.score) best = c;
    return { shift: best.shift, curve };
}
/** THE AUDITS: every arm once on the three sets. */
export function audits(opts, { ranges = AUDIT_RANGES, kinds = T.KINDS } = {}) {
    const out = {};
    for (const n of AUDIT_NAMES) { const set = T.setOf(kinds, ranges[n][0], ranges[n][1]); out[n] = Object.fromEntries(ARMS.map((a) => [a, scoreOf(a, opts, set)])); }
    return out;
}
/** RESIDUAL against CONST-TUNED per audit -> "BEATS" (all three), "NONE" (it beats on none), "MIXED" (some). */
export function winsOf(js) { const n = js.filter((j) => j.wins).length; return n === js.length ? "BEATS" : n === 0 ? "NONE" : "MIXED"; }
export function lineOf(constVsRule, residualWins) {
    if (residualWins === "BEATS") return "RESIDUAL READS SOMETHING";
    if (residualWins === "NONE" && constVsRule === "BEATS") return "TUNING EXPLAINS IT";
    return "MIXED";
}

export function checksOf(au, tuning, { identityShift = 0 } = {}) {
    const rows = [];
    for (const n of AUDIT_NAMES) {
        const a = au[n], idx = a.ALONE.runs.map((r, i) => (r.kind === "far" || r.kind === "both" ? i : -1)).filter((i) => i >= 0), sub = (res) => ({ runs: idx.map((i) => res.runs[i]) }), j = judge(sub(a["RULE-GF"]), sub(a.ALONE));
        rows.push({ name: `RULE NOT TRIVIAL ${n}`, ok: j.wins, text: `RULE-GF beats ALONE on far and both on ${n} by ${j.diff.toFixed(3)} (margin ${j.margin.toFixed(3)})` });
    }
    const z = scoreOf("CONST-TUNED", { tuned: identityShift }, [T.scenario(241, "far"), T.scenario(241, "both")]), g = scoreOf("RULE-GF", {}, [T.scenario(241, "far"), T.scenario(241, "both")]);
    rows.unshift({ name: "IDENTITY", ok: z.runs.every((r, i) => r.fingerprint === g.runs[i].fingerprint), text: "a constant shift of 0 equals RULE-GF dive for dive" });
    rows.push({ name: "TUNING CURVE", ok: tuning.curve.length === GRID.length, text: tuning.curve.map((c) => `${c.shift.toFixed(2)}:${c.score.toFixed(3)}`).join(" ") });
    return rows;
}
export function report(au, tuning, champInfo = "") {
    const L = [`ROUND 7: is the residual a retuned threshold? noisy gauge, brain GUARDED-OBS, VETO; audits ${AUDIT_NAMES.map((n) => `${n} ${AUDIT_RANGES[n][0]}-${AUDIT_RANGES[n][1]}`).join(", ")} (48 dives each, read once)`];
    L.push(`tuned shift ${tuning.shift.toFixed(2)} (best validation mean ${Math.max(...tuning.curve.map((c) => c.score)).toFixed(4)}), chosen BEFORE the audits were flown${champInfo ? "; " + champInfo : ""}`);
    const checks = checksOf(au, tuning), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + AUDIT_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(12)} ${AUDIT_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${AUDIT_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${AUDIT_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const v = (a, b) => AUDIT_NAMES.map((n) => judge(au[n][a], au[n][b])), show = (js) => js.map((j) => `${j.diff >= 0 ? "+" : ""}${j.diff.toFixed(3)} ${j.wins ? "WINS" : j.loses ? "LOSES" : "tie"}`).join(" | ");
    const cr = v("CONST-TUNED", "RULE-GF"), rc = v("RESIDUAL", "CONST-TUNED"), rr = v("RESIDUAL", "RULE-GF");
    L.push(`CONST-TUNED against RULE-GF: ${show(cr)} = ${verdictOf(cr)}`, `RESIDUAL against CONST-TUNED: ${show(rc)} = ${verdictOf(rc)} (wins on ${rc.filter((j) => j.wins).length} of 3)`, `RESIDUAL against RULE-GF (Round 6 again, fresh seeds): ${show(rr)} = ${verdictOf(rr)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : lineOf(verdictOf(cr), winsOf(rc))}`);
    return L;
}
