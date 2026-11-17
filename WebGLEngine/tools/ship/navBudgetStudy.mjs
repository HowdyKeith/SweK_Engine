// WebGLEngine/tools/ship/navBudgetStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART 3 of brain/NAV_MISSIONS_WIP.md; the gate is brain/navBudget-selfcheck.mjs)
//
//   node tools/ship/navBudgetStudy.mjs --set dev|held84 [--write]
// Flies the reference, eco and budget (brain/navMission.mjs) over three-leg missions: DEV (seeds 1-30, a sanity run, not a result) or HELD84 (8001-8060, flown once; --write puts every
// mission in brain/navBudgetHeld84.jsonl). A seed with no mission is skipped for every arm and REPORTED.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../brain/navMission.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as NE from "../../physics/mechanics/subNeeds.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import * as E from "../../brain/navEnergy.mjs";
import { pairOf, statsOf, median } from "./navMissionStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const ARMS = Object.freeze(["any+predict+edge+yield", "eco", "budget"]), DESIGNATED = "budget", AGAINST = "eco", REFERENCE = "any+predict+edge+yield";
export const OUT_FILE = "brain/navBudgetHeld84.jsonl", STORED_83 = "brain/navMissionHeld83.jsonl", NOT_WORSE = 2, FASTER = 0.10, TABLE_TOL = 0.02, COPY_SEEDS = 5;
export const SETS = Object.freeze({ dev: M.DEV, held84: Object.freeze(range(8001, 8060)) });
export function flySet(seeds, { fly = (m, arm) => M.flyMission(m, arm), missionOf = M.missionOf } = {}) {
    const ms = seeds.map((s) => missionOf(s)), ok = ms.filter(Boolean), skipped = seeds.filter((_, i) => !ms[i]);
    return { res: Object.fromEntries(ARMS.map((a) => [a, ok.map((m) => fly(m, a))])), skipped };
}
/** The registered verdict: budget against eco -- (1) completed at least eco's minus NOT_WORSE, (2) on the missions both complete, the median time at least FASTER shorter. */
export function verdictOf(res) {
    const b = res[DESIGNATED], e = res[AGAINST], nb = b.filter((r) => r.completed).length, ne = e.filter((r) => r.completed).length;
    const both = b.map((r, i) => [r, e[i]]).filter(([x, y]) => x.completed && y.completed), tb = median(both.map(([x]) => x.t)), te = median(both.map(([, y]) => y.t));
    const notWorse = nb >= ne - NOT_WORSE, faster = tb !== null && te !== null && tb <= (1 - FASTER) * te;
    return { nb, ne, both: both.length, tb, te, notWorse, faster, pair: pairOf(b, e), verdict: notWorse && faster ? "SUPPORTED" : notWorse !== faster ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
/** Check 2: the table re-measured on the needs model (the explorer on the PD autopilot, 60 s settled then 60 s timed at 20 m, still water): { speed: J/m }. */
export function measureTable(speeds = M.BUDGET_SPEEDS) {
    const m = E.navModel(), cv = [0, 0, 0], out = {};
    for (const v of speeds) {
        let s = S.createState({ pos: [0, 0, -20], speed: v, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m }), needs = NE.initialNeeds("battery");
        for (let i = 0; i < 1800; i++) s = S.stepSub(m, s, AP.decide(s, { heading: 0, depth: 20, speed: v }, cv), S.DT, cv, 0).state;
        const x0 = s.pos[0];
        for (let i = 0; i < 1800; i++) { const r = NE.stepNeeds(m, s, needs, AP.decide(s, { heading: 0, depth: 20, speed: v }, cv), S.DT, cv); s = r.state; needs = r.needs; }
        out[v] = (NE.CLASSES.battery.capacityJ - needs.energy) / (s.pos[0] - x0);
    }
    return out;
}
export const tableOk = (measured = measureTable()) => M.BUDGET_SPEEDS.every((v) => Math.abs(measured[v] - M.BUDGET_JPM[v]) <= TABLE_TOL * M.BUDGET_JPM[v]);
/** Check 1, flown: eco reproduces PART 2's stored HELD83 eco missions on its first COPY_SEEDS seeds. */
export function copySame(stored) {
    const want = new Map(stored.filter((r) => r.arm === "eco").map((r) => [r.seed, r]));
    return M.HELD83.slice(0, COPY_SEEDS).every((s) => { const w = want.get(s), m = M.missionOf(s), g = m && M.flyMission(m, "eco"); return !!w && !!g && w.status === g.status && w.ticks === g.ticks && w.path === g.path; });
}
const key = (r) => `${r.status}|${r.ticks}|${r.path}`;
export function checksOf(res, { copy, table, n }) {
    const seeds = res[REFERENCE].map((r) => r.seed), rows = [];
    rows.push({ name: "THE COPY", ok: copy === true, text: `eco reproduces PART 2's stored HELD83 eco missions on its first ${COPY_SEEDS} seeds: ${copy}` });
    rows.push({ name: "THE TABLE IS THE MODEL'S", ok: table === true, text: `each energy per metre re-measured within ${TABLE_TOL * 100}% of the table: ${table}` });
    const aligned = ARMS.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i]));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} missions in the same order: ${aligned}` });
    const bite = res[DESIGNATED].some((r, i) => key(r) !== key(res[AGAINST][i]));
    rows.push({ name: "BUDGET BITES", ok: bite, text: `budget changes at least one mission against eco: ${bite}` });
    return rows;
}
export function report(out, { copy, table, set }) {
    const { res, skipped } = out, n = res[REFERENCE].length;
    const L = [`NAV MISSIONS PART 3 (a speed chosen from the battery): set ${set} (${n} missions${skipped.length ? `; ${skipped.length} seed(s) with no mission, skipped: ${skipped.join(", ")}` : ""})${set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { copy, table, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                      completed  legs  flat  collided  left  timeout  median time (completed)  median battery left");
    for (const a of ARMS) { const s = statsOf(res[a]), done = res[a].filter((r) => r.completed);
        L.push(`  ${a.padEnd(23)} ${String(s.completed).padStart(3)}/${n}  ${String(s.legs).padStart(4)}  ${String(s.flat).padStart(4)}  ${String(s.collided).padStart(8)}  ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(7)}  ${String((median(done.map((r) => r.t)) ?? NaN).toFixed(0)).padStart(16)} s  ${(100 * (median(res[a].map((r) => r.battery)) ?? 0)).toFixed(0)}%`); }
    const v = verdictOf(res), ch = res[DESIGNATED].flatMap((r) => r.speeds || []);
    L.push(`  budget's speed decisions: ${M.BUDGET_SPEEDS.map((sp) => `${sp} m/s ${((100 * ch.filter((x) => x === sp).length) / Math.max(1, ch.length)).toFixed(0)}%`).join(", ")} (${ch.length} decisions)`);
    for (const a of [DESIGNATED, AGAINST]) { const p = pairOf(res[a], res[REFERENCE]); L.push(`  ${a} against the reference: gained ${p.gained}, lost ${p.lost}, net ${p.net}, exact sign p ${p.p.toFixed(4)} (reported)`); }
    L.push(`(1) not worse at finishing: budget ${v.nb} against eco's ${v.ne} (needs at least ${v.ne - NOT_WORSE}): ${v.notWorse}; (2) faster: on the ${v.both} missions both complete, median ${v.tb === null ? "n/a" : v.tb.toFixed(0)} s against ${v.te === null ? "n/a" : v.te.toFixed(0)} s (needs at most ${v.te === null ? "n/a" : ((1 - FASTER) * v.te).toFixed(0)}): ${v.faster}`);
    L.push(`VERDICT: ${v.verdict}${set === "held84" ? "" : " (not a result)"}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("navBudgetStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: navBudgetStudy.mjs --set dev|held84 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held84") { err("navBudgetStudy: --write goes with --set held84 only (DEV is a sanity run)"); return 2; }
    const flown = (io.flySet || flySet)(SETS[set]), copy = (io.copySame || (() => copySame(fs.readFileSync(path.join(ENG, STORED_83), "utf8").trim().split("\n").map((l) => JSON.parse(l)))))(), table = (io.tableOk || tableOk)();
    for (const l of report(flown, { copy, table, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), ARMS.flatMap((a) => flown.res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${ARMS.length * flown.res[REFERENCE].length} missions to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
