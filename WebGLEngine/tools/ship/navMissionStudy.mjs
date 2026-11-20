// WebGLEngine/tools/ship/navMissionStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART 2 of brain/NAV_MISSIONS_WIP.md with its Amendment 1; the gate is
// brain/navMission-selfcheck.mjs)
//
//   node tools/ship/navMissionStudy.mjs --set dev|held83 [--write]
// Flies the three arms of brain/navMission.mjs over three-leg missions: DEV (seeds 1-30, a sanity run, not a result) or HELD83 (7941-8000, flown once; --write puts every mission in
// brain/navMissionHeld83.jsonl). A seed whose waypoints cannot be placed is skipped for every arm and REPORTED.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../../brain/navMission.mjs";
import * as E from "../../brain/navEnergy.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { signTest } from "./subGiveWayStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/navMissionHeld83.jsonl", GAIN = 5, PARTLY = 3, HARMFUL = -5, P_LEVEL = 0.10, COPY_SEEDS = Object.freeze([1, 2, 3, 4, 5]);
export const SETS = Object.freeze({ dev: M.DEV, held83: M.HELD83 });
export { signTest };
/** Every arm on every seed that has a mission: { res: { arm: [mission records, seed order] }, skipped: [seeds] }. */
export function flySet(seeds, { fly = (m, arm) => M.flyMission(m, arm), arms = M.ARM_NAMES, missionOf = M.missionOf } = {}) {   // missionOf is for the gate
    const ms = seeds.map((s) => missionOf(s)), ok = ms.filter(Boolean), skipped = seeds.filter((_, i) => !ms[i]);
    return { res: Object.fromEntries(arms.map((a) => [a, ok.map((m) => fly(m, a))])), skipped };
}
export const median = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
/** Missions completed, paired by seed: { gained, lost, net, p }. */
export function pairOf(a, b) {
    if (a.length !== b.length || a.some((r, i) => r.seed !== b[i].seed)) throw new Error("navMissionStudy.pairOf: the arms are not on the same seeds");
    const gained = a.filter((r, i) => r.completed && !b[i].completed).length, lost = a.filter((r, i) => !r.completed && b[i].completed).length;
    return { gained, lost, net: gained - lost, p: signTest(gained, gained + lost) };
}
export function verdictOf(res) {
    const pr = pairOf(res[M.DESIGNATED], res[M.REFERENCE]), sup = pr.net >= GAIN && pr.p <= P_LEVEL;
    return { pair: pr, harmful: pr.net <= HARMFUL, verdict: sup ? "SUPPORTED" : pr.net >= PARTLY ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
export const statsOf = (rs) => { const c = (st) => rs.filter((r) => r.status === st).length; return { n: rs.length, completed: c("completed"), legs: rs.reduce((t, r) => t + r.legs, 0), flat: c("flat"), collided: c("collided"), left: c("left"), timeout: c("timeout") }; };
/** Checks 1 and 2, flown: a one-waypoint mission is flyHard's flight (status, ticks, path; 260 s, the copied arms' cap) and its energy is PART 1's flyMetered's, on COPY_SEEDS, each copied arm. */
export function copyChecks({ bias = 1 } = {}) {   // bias scales the mission's energy: for the gate, to show a 0.1 percent miss is caught
    let leg = true, meter = true;
    for (const s of COPY_SEEDS) {
        const m = M.missionOf(s); if (!m) { leg = false; continue; }
        for (const arm of [M.REFERENCE, "any+predict"]) {
            const a = M.flyMission(m, arm, { waypoints: [m.sc.goal], legSeconds: H.SECONDS_HARD }), b = H.flyHard((q, t, c) => AP.decide(q, t, c), m.sc, arm), e = E.flyMetered(m.sc, arm);
            leg = leg && (a.status === "completed" ? "reached" : a.status) === b.status && a.ticks === b.ticks && a.path === b.path;
            meter = meter && Math.abs(a.energy * bias - e.energy) <= 1e-6 * Math.max(1, e.energy);
        }
    }
    return { leg, meter };
}
const key = (r) => `${r.status}|${r.ticks}|${r.path}`;
export function checksOf(res, { leg, meter, n }) {
    const seeds = res[M.REFERENCE].map((r) => r.seed), rows = [];
    rows.push({ name: "ONE LEG IS flyHard", ok: leg === true, text: `a one-waypoint mission is flyHard's flight on seeds ${COPY_SEEDS.join(", ")}, each copied arm: ${leg}` });
    rows.push({ name: "THE METER IS PART 1's", ok: meter === true, text: `its energy is flyMetered's (1e-6 relative): ${meter}` });
    const aligned = M.ARM_NAMES.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i]));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} missions in the same order: ${aligned}` });
    const bite = res[M.DESIGNATED].some((r, i) => key(r) !== key(res[M.REFERENCE][i]));
    rows.push({ name: "ECO BITES", ok: bite, text: `eco changes at least one mission: ${bite}` });
    return rows;
}
const kJ = (j) => (j === null ? "n/a" : `${(j / 1000).toFixed(0)} kJ`);
export function report(out, { leg, meter, set }) {
    const { res, skipped } = out, n = res[M.REFERENCE].length;
    const L = [`NAV MISSIONS PART 2 (three legs on one battery): ${M.KIND}, set ${set} (${n} missions${skipped.length ? `; ${skipped.length} seed(s) with no mission, skipped: ${skipped.join(", ")}` : ""})${set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { leg, meter, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                      completed  legs  flat  collided  left  timeout  median energy (completed)  median battery left");
    for (const a of M.ARM_NAMES) { const s = statsOf(res[a]), done = res[a].filter((r) => r.completed);
        L.push(`  ${a.padEnd(23)} ${String(s.completed).padStart(3)}/${n}  ${String(s.legs).padStart(4)}  ${String(s.flat).padStart(4)}  ${String(s.collided).padStart(8)}  ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(7)}  ${kJ(median(done.map((r) => r.energy))).padStart(22)}  ${(100 * (median(res[a].map((r) => r.battery)) ?? 0)).toFixed(0)}%`); }
    const v = verdictOf(res), rep = (a) => { const p = pairOf(res[a], res[M.REFERENCE]); return `  ${a} against ${M.REFERENCE}: gained ${p.gained}, lost ${p.lost}, net ${p.net}, exact sign p ${p.p.toFixed(4)}`; };
    L.push(rep(M.DESIGNATED) + " (weighed)", rep("any+predict") + " (reported)");
    L.push(`bars: net gain ${v.pair.net} >= ${GAIN} at p ${v.pair.p.toFixed(4)} <= ${P_LEVEL} -> SUPPORTED; ${PARTLY} or ${PARTLY + 1} -> PARTLY SUPPORTED`);
    L.push(`VERDICT: ${v.verdict}${v.harmful ? "   HARMFUL" : ""}${set === "held83" ? "" : " (not a result)"}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("navMissionStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: navMissionStudy.mjs --set dev|held83 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held83") { err("navMissionStudy: --write goes with --set held83 only (DEV is a sanity run)"); return 2; }
    const flown = (io.flySet || flySet)(SETS[set]), cc = (io.copyChecks || copyChecks)();
    for (const l of report(flown, { ...cc, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), M.ARM_NAMES.flatMap((a) => flown.res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${M.ARM_NAMES.length * flown.res[M.REFERENCE].length} missions to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
