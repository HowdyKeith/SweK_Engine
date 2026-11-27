// WebGLEngine/tools/ship/subTurnSweepStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 7 of brain/SUB_FIELD_NAV_WIP.md; the gate is
// tools/ship/subTurnSweepStudy-selfcheck.mjs)
//
//   node tools/ship/subTurnSweepStudy.mjs --set dev|held79|held78 [--write]
// Flies the four arms of brain/subTurnSweep.mjs on hard-traffic: DEV (seeds 1-30, a sanity run, not a result), HELD79 (7601-7660, flown once; --write appends every flight to
// brain/subTurnSweepHeld79.jsonl) or HELD78 (7501-7560, the set whose exits chose the fix: a labelled POST HOC check, never a result, never written). Prints the checks, the
// table, the registered verdict and what is reported beside it. The engine's default orientation step is flown, as FOLLOW-UP 6 was (check 1 reproduces its stored flights).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as W from "../../brain/subTurnSweep.mjs";
import { signTest, statsOf, pairOf } from "./subGiveWayStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subTurnSweepHeld79.jsonl", STORED_78 = "brain/subGiveWayHeld78.jsonl", GAIN = 5, P_LEVEL = 0.10, COPY_SEEDS = 5;
export const SETS = Object.freeze({ dev: W.DEV, held79: W.HELD79, held78: W.HELD78 });
export { signTest };
/** Every arm on every seed: { arm: [record per seed, in seed order] }. `fly` is for the gate. */
export function flySet(seeds, { fly = (sc, arm) => W.flySweep(sc, arm), arms = W.ARM_NAMES } = {}) {
    const scs = seeds.map((s) => W.scenarioOf(s));
    return Object.fromEntries(arms.map((a) => [a, scs.map((sc) => fly(sc, a))]));
}
/** The registered verdict: the designated arm against ref. */
export function verdictOf(res) {
    const d = statsOf(res[W.DESIGNATED]), r = statsOf(res.ref), pr = pairOf(res[W.DESIGNATED], res.ref);
    const bars = { noExit: d.left === 0, gain: pr.net >= GAIN && pr.p <= P_LEVEL, ships: d.ships <= r.ships };
    return { bars, pair: pr, verdict: bars.noExit && bars.gain && bars.ships ? "SUPPORTED" : bars.noExit ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
/** Check 1, flown: the two sweep-off arms reproduce FOLLOW-UP 6's stored HELD78 flights on its first COPY_SEEDS seeds (status, ticks, path). */
export function copySame(stored, fly = (sc, arm) => W.flySweep(sc, arm)) {
    const want = new Map(stored.map((r) => [`${r.arm}|${r.seed}`, r]));
    return W.HELD78.slice(0, COPY_SEEDS).every((s) => { const sc = W.scenarioOf(s); return ["ref", "ref+free+giveway"].every((a) => { const w = want.get(`${a}|${s}`), g = fly(sc, a); return !!w && w.status === g.status && w.ticks === g.ticks && w.path === g.path; }); });
}
/** Check 2: the table is the model's turn (90-degree advance 25 to 40 m, 180-degree transfer 40 to 55 m, the measurement of the diagnosis), and the two directions mirror. */
export function tableOk(table = W.turnTable()) {
    const at = (d) => table.find((p) => p.deg === d), a90 = at(90), t180 = at(180);
    const mirror = [30, 90, 150].every((d) => { const p = W.sweepPoints(0, 0, 0, 1, d, table).at(-1), q = W.sweepPoints(0, 0, 0, -1, d, table).at(-1); return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] + q[1]) < 1e-9; });
    return !!a90 && !!t180 && a90.dx >= 25 && a90.dx <= 40 && Math.abs(t180.dy) >= 40 && Math.abs(t180.dy) <= 55 && mirror;
}
export function checksOf(res, { copy, table, n }) {
    const seeds = res.ref.map((r) => r.seed), rows = [];
    rows.push({ name: "THE COPY", ok: copy === true, text: `with the sweep off, ref and ref+free+giveway reproduce FOLLOW-UP 6's stored HELD78 flights on its first ${COPY_SEEDS} seeds: ${copy}` });
    rows.push({ name: "THE TABLE IS THE MODEL'S", ok: table === true, text: `90-degree advance 25-40 m, 180-degree transfer 40-55 m, the directions mirror: ${table}` });
    const aligned = W.ARM_NAMES.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i] && r.kind === W.KIND));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} scenarios in the same order: ${aligned}` });
    const bites = res[W.DESIGNATED].some((r) => r.sweepTicks > 0) || res["ref+sweep"].some((r) => r.sweepTicks > 0);
    rows.push({ name: "THE SWEEP BITES", ok: bites, text: `the sweep overrides at least one tick on the set: ${bites}` });
    return rows;
}
export function report(res, { copy, table, n, set }) {
    const L = [`FOLLOW-UP 7 (a turn that checks its own sweep): ${W.KIND}, set ${set} (${n} seeds)${set === "held78" ? " -- POST HOC: this set's exits chose the fix; NOT a result" : set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { copy, table, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                       reached  collided (ships)  left  timeout  sweep turns  ticks overridden");
    for (const a of W.ARM_NAMES) { const s = statsOf(res[a]), rs = res[a], turns = rs.reduce((k, r) => k + r.sweepTurns, 0), ticks = rs.reduce((k, r) => k + r.sweepTicks, 0), all = rs.reduce((k, r) => k + r.ticks, 0);
        L.push(`  ${a.padEnd(24)} ${String(s.reached).padStart(3)}/${n}  ${String(s.collided).padStart(5)} (${s.ships})   ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(6)}  ${String(turns).padStart(10)}  ${ticks} of ${all} (${((100 * ticks) / Math.max(1, all)).toFixed(2)}%)`); }
    const rep = (a, b) => { const p = pairOf(res[a], res[b]); return `  ${a} against ${b}: gained ${p.gained}, lost ${p.lost}, net ${p.net}, exact sign p ${p.p.toFixed(4)}`; };
    L.push(rep(W.DESIGNATED, "ref") + " (weighed)", rep(W.DESIGNATED, "ref+free+giveway") + " (reported: what the sweep adds to FOLLOW-UP 6's arm)", rep("ref+sweep", "ref") + " (reported)");
    const v = verdictOf(res), d = statsOf(res[W.DESIGNATED]), r = statsOf(res.ref);
    L.push(`bars: no exit (${d.left}): ${v.bars.noExit}; net gain ${v.pair.net} >= ${GAIN} at p ${v.pair.p.toFixed(4)} <= ${P_LEVEL}: ${v.bars.gain}; ship collisions ${d.ships} no more than ref's ${r.ships}: ${v.bars.ships}`);
    L.push(`VERDICT: ${v.verdict}${set === "held79" ? "" : " (not a result)"}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("subTurnSweepStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: subTurnSweepStudy.mjs --set dev|held79|held78 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held79") { err("subTurnSweepStudy: --write goes with --set held79 only (DEV is a sanity run and HELD78 is post hoc)"); return 2; }
    const fly = io.flySet || flySet, res = fly(SETS[set]);
    const copy = (io.copySame || (() => copySame(fs.readFileSync(path.join(ENG, STORED_78), "utf8").trim().split("\n").map((l) => JSON.parse(l)))))(), table = (io.tableOk || tableOk)();
    for (const l of report(res, { copy, table, n: SETS[set].length, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), W.ARM_NAMES.flatMap((a) => res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${W.ARM_NAMES.length * SETS[set].length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
