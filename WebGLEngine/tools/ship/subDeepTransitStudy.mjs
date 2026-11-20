// WebGLEngine/tools/ship/subDeepTransitStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 9 of brain/SUB_FIELD_NAV_WIP.md; the gate is
// tools/ship/subDeepTransitStudy-selfcheck.mjs)
//
//   node tools/ship/subDeepTransitStudy.mjs --set dev|held82 [--write]
// Flies the two arms of brain/subDeepTransit.mjs on hard-traffic: DEV (seeds 1-30, a sanity run, not a result) or HELD82 (7881-7940, flown once; --write puts every flight in
// brain/subDeepTransitHeld82.jsonl).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/subDeepTransit.mjs";
import { signTest, statsOf, pairOf } from "./subGiveWayStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subDeepTransitHeld82.jsonl", STORED_81 = "brain/subTrafficDiveHeld81.jsonl", GAIN = 5, P_LEVEL = 0.10, COPY_SEEDS = 5;
export const SETS = Object.freeze({ dev: P.DEV, held82: P.HELD82 });
export { signTest };
export function flySet(seeds, { fly = (sc, arm) => P.flyDeep(sc, arm), arms = P.ARM_NAMES } = {}) {
    const scs = seeds.map((s) => P.scenarioOf(s));
    return Object.fromEntries(arms.map((a) => [a, scs.map((sc) => fly(sc, a))]));
}
/** The registered verdict (FOLLOW-UP 8's): the designated arm against the reference. */
export function verdictOf(res) {
    const d = statsOf(res[P.DESIGNATED]), r = statsOf(res[P.REFERENCE]), pr = pairOf(res[P.DESIGNATED], res[P.REFERENCE]);
    const bars = { ships: 2 * d.ships <= r.ships, gain: pr.net >= GAIN && pr.p <= P_LEVEL, noExit: d.left === 0 };
    return { bars, pair: pr, verdict: bars.noExit && bars.ships && bars.gain ? "SUPPORTED" : bars.noExit && bars.ships !== bars.gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
/** Check 1, flown: the reference reproduces FOLLOW-UP 8's stored sweep+dive HELD81 flights on the first COPY_SEEDS seeds (status, ticks, path). */
export function copySame(stored, fly = (sc) => P.flyDeep(sc, P.REFERENCE)) {
    const want = new Map(stored.filter((r) => r.arm === P.REFERENCE).map((r) => [r.seed, r]));
    return P.HELD81.slice(0, COPY_SEEDS).every((s) => { const w = want.get(s), g = fly(P.scenarioOf(s)); return !!w && w.status === g.status && w.ticks === g.ticks && w.path === g.path; });
}
const key = (r) => `${r.status}|${r.ticks}|${r.path}`;
export function checksOf(res, { copy, n }) {
    const seeds = res[P.REFERENCE].map((r) => r.seed), rows = [];
    rows.push({ name: "THE COPY", ok: copy === true, text: `the reference reproduces FOLLOW-UP 8's stored sweep+dive HELD81 flights on its first ${COPY_SEEDS} seeds: ${copy}` });
    const aligned = P.ARM_NAMES.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i] && r.kind === P.KIND));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `both arms fly the same ${n} scenarios in the same order: ${aligned}` });
    const bite = res[P.DESIGNATED].some((r, i) => key(r) !== key(res[P.REFERENCE][i]));
    rows.push({ name: "DEEP BITES", ok: bite, text: `the deep transit changes at least one flight: ${bite}` });
    const crush = P.ARM_NAMES.some((a) => res[a].some((r) => r.status === "crushed"));
    rows.push({ name: "NO CRUSH", ok: !crush, text: `no flight is lost to depth: ${!crush}` });
    return rows;
}
export function report(res, { copy, n, set }) {
    const L = [`FOLLOW-UP 9 (a deep transit beneath the traffic): ${P.KIND}, set ${set} (${n} seeds)${set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { copy, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                reached  collided (ships)  left  timeout  deep ticks  dive ticks  deepest (m)  flights with a transit");
    for (const a of P.ARM_NAMES) { const s = statsOf(res[a]), rs = res[a], sum = (k) => rs.reduce((t, r) => t + r[k], 0);
        L.push(`  ${a.padEnd(17)} ${String(s.reached).padStart(3)}/${n}  ${String(s.collided).padStart(5)} (${s.ships})   ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(6)}  ${String(sum("deepTicks")).padStart(10)}  ${String(sum("diveTicks")).padStart(10)}  ${Math.max(...rs.map((r) => r.deepest)).toFixed(1).padStart(10)}  ${rs.filter((r) => r.transit !== null).length}`); }
    const v = verdictOf(res), d = statsOf(res[P.DESIGNATED]), r = statsOf(res[P.REFERENCE]);
    L.push(`  ${P.DESIGNATED} against ${P.REFERENCE}: gained ${v.pair.gained}, lost ${v.pair.lost}, net ${v.pair.net}, exact sign p ${v.pair.p.toFixed(4)} (weighed)`);
    L.push(`bars: ship collisions ${d.ships} at most half the reference's ${r.ships}: ${v.bars.ships}; net gain ${v.pair.net} >= ${GAIN} at p ${v.pair.p.toFixed(4)} <= ${P_LEVEL}: ${v.bars.gain}; no exit (${d.left}): ${v.bars.noExit}`);
    L.push(`VERDICT: ${v.verdict}${set === "held82" ? "" : " (not a result)"}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("subDeepTransitStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: subDeepTransitStudy.mjs --set dev|held82 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held82") { err("subDeepTransitStudy: --write goes with --set held82 only (DEV is a sanity run)"); return 2; }
    const res = (io.flySet || flySet)(SETS[set]), copy = (io.copySame || (() => copySame(fs.readFileSync(path.join(ENG, STORED_81), "utf8").trim().split("\n").map((l) => JSON.parse(l)))))();
    for (const l of report(res, { copy, n: SETS[set].length, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), P.ARM_NAMES.flatMap((a) => res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${P.ARM_NAMES.length * SETS[set].length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
