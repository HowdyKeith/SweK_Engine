// WebGLEngine/tools/ship/navEnergyStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART 1 of brain/NAV_MISSIONS_WIP.md; the gate is
// tools/ship/navEnergyStudy-selfcheck.mjs)
//
//   node tools/ship/navEnergyStudy.mjs --set dev|held80 [--write]
// Flies the three traffic arms with the energy meter of brain/navEnergy.mjs on hard-traffic: DEV (seeds 1-30, a sanity run, not a result) or HELD80 (7701-7820 after Amendment 1, flown once;
// --write puts every flight in brain/navEnergyHeld80.jsonl). Prints the checks, the table, the registered reading of the detour's price and what is reported beside it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../../brain/navEnergy.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as NE from "../../physics/mechanics/subNeeds.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KIND = "hard-traffic", ARMS = Object.freeze(["any+replan", "any+predict", "any+predict+edge+yield"]), OUT_FILE = "brain/navEnergyHeld80.jsonl";
export const SETS = Object.freeze({ dev: Object.freeze(range(1, 30)), held80: Object.freeze(range(7701, 7820)) });   // AMENDMENT 1 (brain/NAV_MISSIONS_WIP.md): widened from 7701-7760 on DEV, before any HELD80 seed was flown
export const COSTS = 0.03, CHEAP = 0.01, MIN_PAIRS = 20;
export function flySet(seeds, { fly = (sc, arm) => E.flyMetered(sc, arm) } = {}) {
    const scs = seeds.map((s) => H.hardScenario(s, KIND));
    return Object.fromEntries(ARMS.map((a) => [a, scs.map((sc) => fly(sc, a))]));
}
export const median = (xs) => { const v = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
/** The flights both arms reached, paired by seed: [{ seed, dE (a minus b, J), dPath (m) }]. */
export function pairedExtra(a, b) {
    if (a.length !== b.length || a.some((r, i) => r.seed !== b[i].seed)) throw new Error("navEnergyStudy.pairedExtra: the arms are not on the same seeds");
    return a.map((r, i) => [r, b[i]]).filter(([x, y]) => x.reached && y.reached).map(([x, y]) => ({ seed: x.seed, dE: x.energy - y.energy, dPath: x.path - y.path }));
}
/** The registered reading: the median paired extra energy of any+predict over any+replan, as a share of a battery. */
export function verdictOf(res) {
    const pairs = pairedExtra(res["any+predict"], res["any+replan"]), m = median(pairs.map((p) => p.dE)), share = m === null ? null : m / E.BATTERY_J;
    return { pairs: pairs.length, medianJ: m, share, verdict: share === null ? "NOT WEIGHED" : share >= COSTS ? "THE DETOUR COSTS" : share <= CHEAP ? "THE DETOUR IS CHEAP" : "IN BETWEEN" };
}
/** Check 1, part a: the meter against stepNeeds on a scripted run (a turning target, a current, the same commands): the trajectories agree and the meter equals the energy drop. */
export function meterMatchesNeeds(ticks = 900, { bias = 1 } = {}) {   // `bias` scales the meter's total: for the gate, to show a 0.1 percent miss is caught
    const m = E.navModel(), cv = [0.3, -0.2, 0], mp = E.meteredPilot((s, t, c) => AP.decide(s, t, c), { model: m });
    let a = S.createState({ pos: [0, 0, -20], speed: 2, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m }), b = a, needs = NE.initialNeeds("battery");
    for (let i = 0; i < ticks; i++) {
        const tgt = { heading: Math.sin(i / 120), depth: 20 + 5 * Math.sin(i / 200), speed: 1 + 2 * ((i / 300) % 1) }, cmd = mp.pilot(a, tgt, cv);   // the REAL metered pilot, in a current
        a = S.stepSub(m, a, cmd, S.DT, cv, 0).state; const r = NE.stepNeeds(m, b, needs, cmd, S.DT, cv); b = r.state; needs = r.needs;
    }
    const joules = mp.meter.joules * bias, drop = E.BATTERY_J - needs.energy, same = a.pos.every((x, k) => Math.abs(x - b.pos[k]) < 1e-9);
    return { same, joules, drop, ok: same && drop > 0 && Math.abs(joules - drop) / drop < 1e-6 };
}
/** Check 1, part b: a metered flight is the unmetered flight (status, ticks, path) on DEV seed 1, every arm. */
export const meterLeavesFlight = () => ARMS.every((arm) => { const sc = H.hardScenario(1, KIND), a = E.flyMetered(sc, arm), b = H.flyHard((s, t, c) => AP.decide(s, t, c), sc, arm); return a.status === b.status && a.ticks === b.ticks && a.path === b.path; });
export function checksOf(res, { meter, n }) {
    const seeds = res[ARMS[0]].map((r) => r.seed), rows = [], pairs = pairedExtra(res["any+predict"], res["any+replan"]).length;
    rows.push({ name: "THE METER IS THE MODEL'S", ok: meter === true, text: `the meter equals stepNeeds's energy drop (1e-6 relative) on the same commands and leaves every arm's flight unchanged: ${meter}` });
    const aligned = ARMS.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i] && r.kind === KIND && Number.isFinite(r.energy)));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} scenarios in the same order, each with an energy: ${aligned}` });
    rows.push({ name: "ENOUGH PAIRS", ok: pairs >= MIN_PAIRS, text: `${pairs} flights reached by both any+predict and any+replan (needs ${MIN_PAIRS})` });
    return rows;
}
const kJ = (j) => (j === null ? "n/a" : `${(j / 1000).toFixed(0)} kJ`), pc = (x) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
export function report(res, { meter, n, set }) {
    const L = [`NAV MISSIONS PART 1 (the price of a detour): ${KIND}, set ${set} (${n} seeds)${set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { meter, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the reading is NOT WEIGHED.", "READING: NOT WEIGHED"); return L; }
    L.push("arm                       reached  median path  median energy (reached)  median J/m  over one battery");
    for (const a of ARMS) { const rs = res[a], got = rs.filter((r) => r.reached); L.push(`  ${a.padEnd(24)} ${String(got.length).padStart(3)}/${n}  ${(median(got.map((r) => r.path)) ?? NaN).toFixed(0).padStart(8)} m  ${kJ(median(got.map((r) => r.energy))).padStart(12)} (${pc(median(got.map((r) => r.battery)))})  ${(median(got.map((r) => r.jPerM)) ?? NaN).toFixed(0).padStart(8)}  ${rs.filter((r) => r.battery > 1).length}`); }
    const v = verdictOf(res), pp = pairedExtra(res["any+predict"], res["any+replan"]), ref = pairedExtra(res["any+predict+edge+yield"], res["any+replan"]);
    L.push(`any+predict over any+replan on the ${v.pairs} flights both reached: median extra ${kJ(v.medianJ)} (${pc(v.share)} of a battery), median extra path ${(median(pp.map((p) => p.dPath)) ?? NaN).toFixed(0)} m (weighed)`);
    L.push(`any+predict+edge+yield over any+replan on the ${ref.length} flights both reached: median extra ${kJ(median(ref.map((p) => p.dE)))}, path ${(median(ref.map((p) => p.dPath)) ?? NaN).toFixed(0)} m (reported)`);
    L.push(`the bars: THE DETOUR COSTS at ${pc(COSTS)} of a battery or more, THE DETOUR IS CHEAP at ${pc(CHEAP)} or less`);
    L.push(`READING: ${v.verdict}${set === "dev" ? " (not a result)" : ""}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("navEnergyStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: navEnergyStudy.mjs --set dev|held80 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held80") { err("navEnergyStudy: --write goes with --set held80 only (DEV is a sanity run)"); return 2; }
    const res = (io.flySet || flySet)(SETS[set]), meter = (io.meterOk || (() => meterMatchesNeeds().ok && meterLeavesFlight()))();
    for (const l of report(res, { meter, n: SETS[set].length, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), ARMS.flatMap((a) => res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${ARMS.length * SETS[set].length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
