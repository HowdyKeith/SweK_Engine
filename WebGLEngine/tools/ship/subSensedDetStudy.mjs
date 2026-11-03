// WebGLEngine/tools/ship/subSensedDetStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registrations are "FOLLOW-UP 8" to "FOLLOW-UP 24" of brain/SENSED_NAV_WIP.md, the specs are tools/ship/subSensedDetSpecs.mjs, the gate is tools/ship/subSensedDetStudy-selfcheck.mjs)
//
// THE STUDIES OF THE GENERAL DETECTOR, on the three static kinds of the harder test (hard-islands, hard-gaps, hard-current): one command for the seventeen specs of tools/ship/subSensedDetSpecs.mjs.
//   node tools/ship/subSensedDetStudy.mjs --study <name> --set dev [--seeds N]                 DEV (seeds 1 to 30 of each kind): a sanity run, not a result
//   node tools/ship/subSensedDetStudy.mjs --study <name> --set <heldN> [--seeds N] [--write]   the study's own set (HELD13 for follow-up 8 up to HELD29 for follow-up 24), READ ONCE; --write puts every flight in the study's file under brain/
// It prints the tables (a block for each kind, the three kinds pooled, the gaps by width) and the verdict: the bar's cells (the designated detector against exact's count, each kind, each condition), the predictions each held or missed, and the verdict.
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "../../brain/subSensedNav.mjs";
import * as D from "../../brain/subSensedDetect.mjs";
import * as H from "../../brain/subHardNav.mjs";
import { median, pilot } from "./subSensedStudy.mjs";
import { SPECS, STUDY_NAMES } from "./subSensedDetSpecs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export { median, pilot, SPECS, STUDY_NAMES };
export const BAR_RATE = 0.8;
export const SETS = Object.freeze({ dev: X.SENSE_SETS.dev, ...Object.fromEntries(STUDY_NAMES.map((n) => [SPECS[n].held, X.SENSE_SETS[SPECS[n].held]])) });
const KINDS = X.SENSE_KINDS, WIDTHS = H.GAP_WIDTHS;

const cellOf = (rs) => {
    if (!rs.length) return null;
    const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
    return { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)), medianSeen: median(rs.filter((r) => Number.isFinite(r.ensonified)).map((r) => r.ensonified)), medianOffsetEnd: median(rs.filter((r) => Number.isFinite(r.offsetEnd)).map((r) => r.offsetEnd)), medianPlans: median(rs.filter((r) => Number.isFinite(r.plans)).map((r) => r.plans)) };
};
/** The numbers per kind and arm for the arms of `spec`: { cells: { kind: { arm: cell } }, pooled: { arm: cell over the three kinds }, widths: { arm: { 24: { n, reached }, 32: ..., 40: ... } } (hard-gaps only) }; a cell is absent when the arm flew nothing. */
export function summarize(runs, spec) {
    const cells = {}, pooled = {}, widths = {};
    for (const kind of KINDS) { cells[kind] = {}; for (const arm of spec.arms) { const c = cellOf(runs.filter((r) => r.kind === kind && r.arm === arm)); if (c) cells[kind][arm] = c; } }
    for (const arm of spec.arms) {
        const c = cellOf(runs.filter((r) => r.arm === arm && KINDS.includes(r.kind))); if (c) pooled[arm] = c;
        const g = runs.filter((r) => r.arm === arm && r.kind === "hard-gaps"); if (g.length) { widths[arm] = {}; for (const w of WIDTHS) { const rs = g.filter((r) => r.gap === w); widths[arm][w] = { n: rs.length, reached: rs.filter((r) => r.reached).length }; } }
    }
    return { cells, pooled, widths };
}
/** The number a TERM stands for (see tools/ship/subSensedDetSpecs.mjs): an arm's reached count over the three kinds, one kind's ({ k, a }), a sum or a maximum of terms; NaN when an arm was not flown. */
export function value(sum, t) {
    if (typeof t === "string") return sum.pooled[t] ? sum.pooled[t].reached : NaN;
    if (t && t.sum) return t.sum.reduce((s, x) => s + value(sum, x), 0);
    if (t && t.max) return Math.max(...t.max.map((x) => value(sum, x)));
    if (t && t.k) return sum.cells[t.k] && sum.cells[t.k][t.a] ? sum.cells[t.k][t.a].reached : NaN;
    return NaN;
}
/** The bar for one arm: for each kind, does it reach at least BAR_RATE of what exact reaches there? { kind: boolean }. */
export function barKinds(sum, arm) {
    const out = {};
    for (const k of KINDS) { const e = sum.cells[k] && sum.cells[k].exact, c = sum.cells[k] && sum.cells[k][arm]; out[k] = !!(e && c) && c.reached / e.reached >= BAR_RATE; }
    return out;
}
const allKinds = (sum, arm) => KINDS.every((k) => barKinds(sum, arm)[k]);
/** One prediction of a spec: true when it held. */
export function holds(sum, p) {
    const a = () => value(sum, p.a), b = () => value(sum, p.b);
    switch (p.op) {
        case "ge": return a() - b() >= p.n;
        case "gt": return a() > b();
        case "le": return a() - b() <= p.n;
        case "within": return Math.abs(a() - b()) <= p.n;
        case "bar": return allKinds(sum, p.a);
        case "notBar": return KINDS.every((k) => !!(sum.cells[k] && sum.cells[k][p.a])) && !allKinds(sum, p.a);
        case "noBar": return KINDS.every((k) => !!(sum.cells[k] && sum.cells[k].exact && sum.cells[k][p.a]) && !barKinds(sum, p.a)[k]);
        case "eachGe": return p.arms.every((x) => value(sum, x) - value(sum, p.b) >= p.n);
        case "spread": { const v = p.arms.map((x) => value(sum, x)); return Math.max(...v) - Math.min(...v) <= p.n; }
        case "spreadGt": { const v = p.arms.map((x) => value(sum, x)); return Math.max(...v) - Math.min(...v) > p.n; }
        case "and": return p.of.every((q) => holds(sum, q));
        default: throw new Error(`subSensedDetStudy.holds: unknown operation "${p.op}"`);
    }
}
/** The bar, the verdict and the predictions of a spec: { cells: { condition: { kind: boolean } }, cellsHeld, total, verdict, preds: { id: boolean } }. SUPPORTED if every cell of the bar is held, PARTLY SUPPORTED if at least spec.verdict.partly, NOT SUPPORTED otherwise. */
export function judge(sum, spec) {
    const cells = {}; let cellsHeld = 0;
    for (const c of spec.bar.conds) { cells[c] = barKinds(sum, `${spec.bar.arm}@${c}`); cellsHeld += KINDS.filter((k) => cells[c][k]).length; }
    const verdict = cellsHeld >= spec.verdict.full ? "SUPPORTED" : cellsHeld >= spec.verdict.partly ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    return { cells, cellsHeld, total: spec.bar.conds.length * KINDS.length, verdict, preds: Object.fromEntries(spec.preds.map((p) => [p.id, holds(sum, p)])) };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const HEAD = "arm               | reached      | collided left timeout other | median time (s) | median path/chord | median min clearance (m) | grid ensonified | offset at end (m) | plans (median)";
/** The table: a block for each kind, the three kinds pooled and the gaps by width. */
export function table(sum, spec, title) {
    const lines = [title], row = (arm, x) => `${arm.padEnd(17)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padEnd(15)} | ${f2s(x.medianChord).padEnd(17)} | ${f2s(x.medianClearance).padEnd(24)} | ${pct(x.medianSeen).padEnd(15)} | ${f2s(x.medianOffsetEnd).padEnd(17)} | ${f2s(x.medianPlans)}`;
    for (const kind of KINDS) { lines.push("", kind, HEAD); for (const arm of spec.arms) { const x = sum.cells[kind][arm]; if (x) lines.push(row(arm, x)); } }
    lines.push("", "the three kinds together", HEAD); for (const arm of spec.arms) { const x = sum.pooled[arm]; if (x) lines.push(row(arm, x)); }
    lines.push("", "hard-gaps reached, by the width of the gap", `arm               | ${WIDTHS.map((w) => `${w} m`.padEnd(6)).join(" | ")}`); for (const arm of spec.arms) { const w = sum.widths[arm]; if (w) lines.push(`${arm.padEnd(17)} | ${WIDTHS.map((x) => String(w[x].reached).padEnd(6)).join(" | ")}`); }
    return lines.join("\n");
}
export function verdictText(j, spec) {
    const yn = (v) => (v ? "HELD" : "MISSED"), cond = (c) => `${c}: ${KINDS.map((k) => `${k} ${yn(j.cells[c][k])}`).join(", ")}`;
    return [`${spec.designated} (the designated detector of follow-up ${spec.followUp}) reaches at least ${pct(BAR_RATE)} of what exact reaches in each kind under each condition (the bar): ${spec.bar.conds.map(cond).join("; ")} (${j.cellsHeld} of ${j.total})`,
        ...spec.preds.map((p) => `${p.id} ${p.text}: ${yn(j.preds[p.id])}`), `VERDICT: ${j.verdict}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile, fly, root (the folder --write puts the file under: the engine folder) }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync, fly = io.fly || D.flyArm, root = io.root || ENG;
    const o = { study: null, set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--study") { o.study = argv[++i]; if (!SPECS[o.study]) { err(`subSensedDetStudy: --study needs one of ${STUDY_NAMES.join(", ")}`); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subSensedDetStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subSensedDetStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subSensedDetStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (!o.study) { err(`subSensedDetStudy: --study ${STUDY_NAMES.join("|")} is needed`); return 2; }
    const spec = SPECS[o.study];
    if (o.set !== "dev" && o.set !== spec.held) { err(`subSensedDetStudy: the ${o.study} study is flown on dev or ${spec.held}, not ${o.set}`); return 2; }
    if (o.write && o.set === "dev") { err(`subSensedDetStudy: --write goes with --set ${spec.held} only`); return 2; }
    const seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.study.toUpperCase()} study (follow-up ${spec.followUp}, ${spec.title}), ${o.set.toUpperCase()} set: ${seeds.length} scenarios of each of ${KINDS.join(", ")}, ${spec.arms.length} arms (${spec.arms.join(", ")})`);
    for (const kind of KINDS) for (const seed of seeds) { const sc = H.hardScenario(seed, kind); for (const arm of spec.arms) runs.push(fly(pilot, sc, arm)); }
    const sum = summarize(runs, spec);
    out(""); out(table(sum, spec, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, fix sigma ${X.FIX_SIGMA} m, drift ${X.DRIFT_SIGMA} m per root s, fix gain ${X.FIX_GAIN}`)); out(""); out(verdictText(judge(sum, spec), spec));
    if (o.write) { writeFile(path.join(root, spec.out), runs.map((r) => JSON.stringify({ study: o.study, set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${spec.out}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
