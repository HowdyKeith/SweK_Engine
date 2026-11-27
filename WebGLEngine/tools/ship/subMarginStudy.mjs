// WebGLEngine/tools/ship/subMarginStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 9" in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subMarginStudy-selfcheck.mjs)
//
// THE SWEEP OF THE ANY-ANGLE ARM'S MARGINS: DEV flies the 20 cells (top rung x vertical margin, brain/subMarginSweep.mjs) on hard-islands and hard-gaps and chooses the best NON-INCUMBENT cell by the registered rule; HELD9 flies the incumbent and that cell once.
//   node tools/ship/subMarginStudy.mjs --set dev [--seeds N]                      DEV (seeds 1 to 30 of each kind): the sweep and the selection; not a result
//   node tools/ship/subMarginStudy.mjs --set held9 [--seeds N] [--cell T16V8] [--write]   HELD9, seeds 901 to 960, READ ONCE; the cell is the DEV selection (recomputed) unless --cell names it; --write puts every flight in brain/subMarginHeld9.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../brain/subMarginSweep.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subMarginHeld9.jsonl", SETS = M.SETS;
export const THRESH = Object.freeze({ gain: 5, kindLoss: 2, partlyLow: 3, devGain: 3 });
export const pilot = (s, t, c) => AP.decide(s, t, c);
const INC = M.cellName(M.INCUMBENT);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/** { cellName: { cell, n, reached, collided, left, timeout, other, noRoute, medianTime (arrivals), byKind: { kind: { n, reached } } } } in CELLS order, only the cells flown. */
export function summarize(runs) {
    const cells = {};
    for (const c of M.CELLS) {
        const nm = M.cellName(c), rs = runs.filter((r) => r.cell === nm);
        if (!rs.length) continue;
        const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached), byKind = {};
        for (const k of M.KINDS) { const ks = rs.filter((r) => r.kind === k); if (ks.length) byKind[k] = { n: ks.length, reached: ks.filter((r) => r.reached).length }; }
        cells[nm] = { cell: c, n: rs.length, reached: done.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, noRoute: rs.filter((r) => r.noRoute).length, medianTime: median(done.map((r) => r.t)), byKind };
    }
    return cells;
}
/** The distance of a cell from the incumbent: |top - 12| + |vert - 5|. */
export const distance = (c) => Math.abs(c.top - M.INCUMBENT.top) + Math.abs(c.vert - M.INCUMBENT.vert);
/**
 * The registered selection: the best NON-INCUMBENT cell of a DEV summary: the most reached, then the fewest collisions, then the smallest distance from the incumbent, then the smaller top rung, then the smaller vertical margin (this last tie-break was missing from the registration and was added
 * before HELD9 was read; see the DEV note). Returns the cell's name, or null when no non-incumbent cell was flown.
 */
export function chooseCell(cells) {
    const names = Object.keys(cells).filter((n) => !M.isIncumbent(cells[n].cell));
    if (!names.length) return null;
    names.sort((a, b) => { const x = cells[a], y = cells[b]; return (y.reached - x.reached) || (x.collided - y.collided) || (distance(x.cell) - distance(y.cell)) || (x.cell.top - y.cell.top) || (x.cell.vert - y.cell.vert); });
    return names[0];
}
/** The DEV predictions M1, M3, M4, M5 for a DEV summary and its chosen cell. A missing cell is a miss. */
export function judgeDev(dev, chosen) {
    const inc = dev[INC], ch = chosen && dev[chosen], thin = dev[M.cellName({ top: 8, vert: 2 })];
    const best = Object.keys(dev).filter((n) => n !== INC).reduce((m, n) => Math.max(m, dev[n].reached), -Infinity);
    return { m1: !!inc && best - inc.reached >= THRESH.devGain, m3: !!ch && ch.cell.top > M.INCUMBENT.top, m4: !!ch && ch.cell.vert > M.INCUMBENT.vert, m5: !!thin && !!inc && thin.reached < inc.reached };
}
/**
 * The verdict and M2, M6 for a HELD9 summary (the incumbent and the chosen cell). Pooled gain = chosen reached - incumbent reached. GAIN: pooled gain at least THRESH.gain AND in each kind the chosen cell reaches at least the incumbent's minus THRESH.kindLoss.
 * SUPPORTED if GAIN; NOT SUPPORTED if the pooled gain is at most 2 (the incumbent stands); PARTLY SUPPORTED otherwise. M2 the verdict is NOT SUPPORTED. M6 the chosen cell reaches at least as many as the incumbent. A missing cell is NOT SUPPORTED with every claim false.
 */
export function judgeHeld(held, chosen) {
    const inc = held[INC], ch = chosen && held[chosen];
    if (!inc || !ch) return { gain: NaN, kindsOk: false, verdict: "NOT SUPPORTED", m2: false, m6: false };
    const gain = ch.reached - inc.reached, kindsOk = M.KINDS.every((k) => !!ch.byKind[k] && !!inc.byKind[k] && ch.byKind[k].reached >= inc.byKind[k].reached - THRESH.kindLoss);
    const verdict = gain >= THRESH.gain && kindsOk ? "SUPPORTED" : gain <= THRESH.gain - THRESH.partlyLow ? "NOT SUPPORTED" : "PARTLY SUPPORTED";
    return { gain, kindsOk, verdict, m2: verdict === "NOT SUPPORTED", m6: gain >= 0 };
}
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
export function table(cells, title) {
    const lines = [title, "cell    ladder         | reached      | collided left timeout other | no route | median time (s) | islands gaps"];
    for (const c of M.CELLS) { const nm = M.cellName(c), x = cells[nm]; if (!x) continue; lines.push(`${nm.padEnd(7)} ${M.ladderFor(c.top).join().padEnd(14)} | ${(`${x.reached}/${x.n} ${pct(x.reached / x.n)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${String(x.noRoute).padStart(8)} | ${f2s(x.medianTime).padStart(15)} | ${String((x.byKind["hard-islands"] || { reached: "-" }).reached).padStart(7)} ${String((x.byKind["hard-gaps"] || { reached: "-" }).reached).padStart(4)}`); }
    return lines.join("\n");
}
export function devText(j, chosen) {
    const yn = (v) => (v ? "HELD" : "MISSED");
    return [`chosen (the best non-incumbent cell): ${chosen}`, `M1 some non-incumbent cell reaches at least ${THRESH.devGain} more than ${INC} on DEV: ${yn(j.m1)}`, `M3 the chosen cell's top rung is above ${M.INCUMBENT.top}: ${yn(j.m3)}`, `M4 the chosen cell's vertical margin is above ${M.INCUMBENT.vert}: ${yn(j.m4)}`, `M5 the thinnest cell T8V2 reaches fewer than ${INC} on DEV: ${yn(j.m5)}`].join("\n");
}
export function heldText(j, chosen) {
    const yn = (v) => (v ? "HELD" : "MISSED");
    return [`${chosen} against ${INC}: pooled gain ${j.gain} (at least ${THRESH.gain} to count), no kind loses more than ${THRESH.kindLoss}: ${yn(j.kindsOk)} => ${j.verdict}`, `M2 the verdict is NOT SUPPORTED (the incumbent stands): ${yn(j.m2)}`, `M6 the chosen cell reaches at least as many as ${INC}: ${yn(j.m6)}`].join("\n");
}
function flyCells(cells, seeds, kinds = M.KINDS) { const runs = []; for (const c of cells) for (const k of kinds) for (const s of seeds) runs.push(M.flyCell(pilot, s, k, c)); return runs; }
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false, cell: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subMarginStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subMarginStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else if (a === "--cell") { o.cell = argv[++i]; if (!M.CELLS.some((c) => M.cellName(c) === o.cell) || o.cell === INC) { err(`subMarginStudy: --cell needs one of the non-incumbent cells (T8V2 .. T24V12 but not ${INC})`); return 2; } }
        else { err(`subMarginStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held9") { err("subMarginStudy: --write goes with --set held9 only"); return 2; }
    if (o.cell && o.set !== "held9") { err("subMarginStudy: --cell goes with --set held9 only"); return 2; }
    const sweep = (seeds) => summarize(flyCells(M.CELLS, seeds)), title = `ladder: top rung then 12, 8, 6, 3 below it; vertical margin moved through minDepth; ${260} s a flight; arm ${M.ARM}`;
    if (o.set === "dev") {
        const seeds = o.seeds ? SETS.dev.slice(0, o.seeds) : SETS.dev;
        out(`DEV set: ${seeds.length} scenarios of each of ${M.KINDS.join(", ")} x ${M.CELLS.length} cells`);
        const dev = sweep(seeds), chosen = chooseCell(dev);
        out(""); out(table(dev, title)); out(devText(judgeDev(dev, chosen), chosen));
        return 0;
    }
    const devSeeds = SETS.dev, held = o.seeds ? SETS.held9.slice(0, o.seeds) : SETS.held9;
    let chosen = o.cell, devJ = null;
    if (!chosen) { const dev = sweep(devSeeds); chosen = chooseCell(dev); devJ = judgeDev(dev, chosen); out(`DEV selection (recomputed from seeds 1 to 30): ${chosen}`); if (devJ) out(devText(devJ, chosen)); }
    const cellOf = (nm) => M.CELLS.find((c) => M.cellName(c) === nm), runs = flyCells([M.INCUMBENT, cellOf(chosen)], held);
    out(`HELD9 set: ${held.length} scenarios of each of ${M.KINDS.join(", ")}, the incumbent ${INC} and ${chosen}`);
    const cells = summarize(runs);
    out(""); out(table(cells, title)); out(heldText(judgeHeld(cells, chosen), chosen));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
