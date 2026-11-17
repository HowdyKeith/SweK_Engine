// WebGLEngine/tools/ship/subGiveWayStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 6" of brain/SUB_FIELD_NAV_WIP.md; the gate is tools/ship/subGiveWayStudy-selfcheck.mjs)
//
//   node tools/ship/subGiveWayStudy.mjs --set dev|held78 [--write]
// Flies the four arms of brain/subGiveWay.mjs on hard-traffic (DEV seeds 1-30, a sanity run and not a result; HELD78 seeds 7501-7560, flown once), prints the table, the checks and
// FOLLOW-UP 6's verdict, and with --write appends every flight to brain/subGiveWayHeld78.jsonl (HELD78 only). The engine's default orientation step (RK4) is flown.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as G from "../../brain/subGiveWay.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const KIND = "hard-traffic", OUT_FILE = "brain/subGiveWayHeld78.jsonl", BAR = 48, GAIN = 5, P_LEVEL = 0.10;
export const SETS = Object.freeze({ dev: G.DEV, held78: G.HELD78 });
export const pilot = (s, t, c) => AP.decide(s, t, c);
/** Every arm on every seed of a set: { arm: [record per seed, in seed order] }. `fly` is for the gate. */
export function flySet(seeds, { fly = (sc, arm) => G.flyGiveWay(pilot, sc, arm), arms = G.ARMS } = {}) {
    const scs = seeds.map((s) => H.hardScenario(s, KIND));
    return Object.fromEntries(arms.map((a) => [a, scs.map((sc) => fly(sc, a))]));
}
/** The exact two-sided sign test on n discordant pairs of which k favour one side. */
export function signTest(k, n) {
    if (n === 0) return 1;
    let c = 1, tail = 0; const lo = Math.min(k, n - k);
    for (let i = 0; i <= lo; i++) { tail += c; c = (c * (n - i)) / (i + 1); }
    return Math.min(1, (2 * tail) / 2 ** n);
}
export const statsOf = (rs) => ({ n: rs.length, reached: rs.filter((r) => r.reached).length, left: rs.filter((r) => r.status === "left").length, collided: rs.filter((r) => r.status === "collided").length,
    ships: rs.filter((r) => r.status === "collided" && r.hit === "ship").length, timeout: rs.filter((r) => r.status === "timeout").length });
/** An arm against `ref`, paired by seed: flights gained and lost, net, p. */
export function pairOf(a, ref) {
    if (a.length !== ref.length || a.some((r, i) => r.seed !== ref[i].seed)) throw new Error("subGiveWayStudy.pairOf: the arms are not on the same seeds");
    const gained = a.filter((r, i) => r.reached && !ref[i].reached).length, lost = a.filter((r, i) => !r.reached && ref[i].reached).length;
    return { gained, lost, net: gained - lost, p: signTest(gained, gained + lost) };
}
export function verdictOf(res) {
    const d = statsOf(res[G.DESIGNATED]), r = statsOf(res.ref), pr = pairOf(res[G.DESIGNATED], res.ref);
    const bars = { reach: d.reached >= BAR, noExit: d.left === 0, ships: 2 * d.ships <= r.ships, gain: pr.net >= GAIN && pr.p <= P_LEVEL };
    return { bars, pair: pr, verdict: bars.reach && bars.noExit && bars.ships && bars.gain ? "SUPPORTED" : bars.gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
/** The checks; `same` is check 1's result (the copy against flyHard on DEV), computed by the caller. */
export function checksOf(res, { same, n }) {
    const seeds = res.ref.map((r) => r.seed), rows = [];
    rows.push({ name: "THE COPY IS flyHard", ok: same === true, text: `with both options off the copy equals subHardNav.flyHard on every DEV flight: ${same}` });
    const aligned = G.ARMS.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i] && r.kind === KIND));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} scenarios in the same order: ${aligned}` });
    const key = (r) => `${r.status}|${r.ticks}|${r.path}`, moves = (a) => res[a].some((r, i) => key(r) !== key(res.ref[i]));
    const bite = moves("ref+free") && moves("ref+giveway");
    rows.push({ name: "EACH OPTION BITES", ok: bite, text: `each option changes at least one flight: ${bite}` });
    return rows;
}
/** Check 1: the copy with both options off against flyHard on DEV (status, ticks, path, minimum clearance). */
export function copySame(seeds = G.DEV, flyCopy = (sc) => G.flyGiveWay(pilot, sc, "ref")) {
    return seeds.every((s) => { const sc = H.hardScenario(s, KIND), a = H.flyHard(pilot, sc, G.BASE_ARM), b = flyCopy(sc); return a.status === b.status && a.ticks === b.ticks && a.path === b.path && a.minClearance === b.minClearance; });
}
const med = (xs) => { const v = xs.filter((x) => x !== null).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
export function report(res, { same, n, set }) {
    const L = [`FOLLOW-UP 6 (give way, and a way out of the edge band): ${KIND}, set ${set} (${n} seeds)`];
    const checks = checksOf(res, { same, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                 reached  collided (ships)  left  timeout  median t  path/chord  median min clearance");
    for (const a of G.ARMS) { const s = statsOf(res[a]), rs = res[a]; L.push(`  ${a.padEnd(18)} ${String(s.reached).padStart(3)}/${n}  ${String(s.collided).padStart(5)} (${s.ships})   ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(6)}   ${(med(rs.map((r) => r.t)) ?? NaN).toFixed(1).padStart(7)}  ${(med(rs.map((r) => r.path / r.chord))).toFixed(2).padStart(9)}  ${med(rs.map((r) => r.minClearance)).toFixed(2)}`); }
    for (const a of G.ARMS.filter((x) => x !== "ref")) { const p = pairOf(res[a], res.ref); L.push(`  ${a} against ref: gained ${p.gained}, lost ${p.lost}, net ${p.net}, exact sign p ${p.p.toFixed(4)}${a === G.DESIGNATED ? " (weighed)" : " (reported)"}`); }
    const v = verdictOf(res), d = statsOf(res[G.DESIGNATED]), r = statsOf(res.ref);
    L.push(`bars: reach ${d.reached} >= ${BAR}: ${v.bars.reach}; no exit (${d.left}): ${v.bars.noExit}; ship collisions ${d.ships} at most half of ref's ${r.ships}: ${v.bars.ships}; net gain ${v.pair.net} >= ${GAIN} at p ${v.pair.p.toFixed(4)} <= ${P_LEVEL}: ${v.bars.gain}`);
    L.push(`VERDICT: ${v.verdict}${set === "dev" ? " (DEV: a sanity run, not a result)" : ""}`);
    return L;
}
export function command(argv) {
    const cli = parseOrExit("subGiveWayStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;   // 2026-11-17: through the front door (cliArgs-selfcheck section 7 found it reading --set the silent way)
    if (!SETS[set]) { console.error("usage: subGiveWayStudy.mjs --set dev|held78 [--write]"); return 2; }
    const res = flySet(SETS[set]), lines = report(res, { same: copySame(), n: SETS[set].length, set });
    for (const l of lines) console.log(l);
    if (cli.flags.has("--write") && set === "held78") { fs.writeFileSync(path.join(ENG, OUT_FILE), G.ARMS.flatMap((a) => res[a]).map((r) => JSON.stringify(r)).join("\n") + "\n"); console.log(`wrote ${G.ARMS.length * SETS[set].length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
