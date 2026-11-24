// WebGLEngine/tools/ship/subTrafficDiveStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 8 of brain/SUB_FIELD_NAV_WIP.md with its clarification and
// Amendment 1; the gate is tools/ship/subTrafficDiveStudy-selfcheck.mjs)
//
//   node tools/ship/subTrafficDiveStudy.mjs --set dev|held81|held79 [--write]
// Flies the four arms of brain/subTrafficDive.mjs on hard-traffic: DEV (seeds 1-30, a sanity run, not a result), HELD81 (7821-7880, flown once; --write puts every flight in
// brain/subTrafficDiveHeld81.jsonl) or HELD79 (the set whose collisions chose the fix: a labelled POST HOC check, never a result, never written).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subTrafficDive.mjs";
import { signTest, statsOf, pairOf } from "./subGiveWayStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subTrafficDiveHeld81.jsonl", STORED_79 = "brain/subTurnSweepHeld79.jsonl", GAIN = 5, P_LEVEL = 0.10, COPY_SEEDS = 5;
export const SETS = Object.freeze({ dev: D.DEV, held81: D.HELD81, held79: D.HELD79 });
export { signTest };
export function flySet(seeds, { fly = (sc, arm) => D.flyTraffic(sc, arm), arms = D.ARM_NAMES } = {}) {
    const scs = seeds.map((s) => D.scenarioOf(s));
    return Object.fromEntries(arms.map((a) => [a, scs.map((sc) => fly(sc, a))]));
}
/** The registered verdict: the designated arm against the reference. */
export function verdictOf(res) {
    const d = statsOf(res[D.DESIGNATED]), r = statsOf(res[D.REFERENCE]), pr = pairOf(res[D.DESIGNATED], res[D.REFERENCE]);
    const bars = { ships: 2 * d.ships <= r.ships, gain: pr.net >= GAIN && pr.p <= P_LEVEL, noExit: d.left === 0 };
    return { bars, pair: pr, verdict: bars.noExit && bars.ships && bars.gain ? "SUPPORTED" : bars.noExit && bars.ships !== bars.gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED" };
}
/** Check 1, flown: the reference reproduces FOLLOW-UP 7's stored HELD79 flights of its designated arm on the first COPY_SEEDS seeds (status, ticks, path). */
export function copySame(stored, fly = (sc) => D.flyTraffic(sc, D.REFERENCE)) {
    const want = new Map(stored.filter((r) => r.arm === D.BASE).map((r) => [r.seed, r]));
    return D.HELD79.slice(0, COPY_SEEDS).every((s) => { const w = want.get(s), g = fly(D.scenarioOf(s)); return !!w && w.status === g.status && w.ticks === g.ticks && w.path === g.path; });
}
const key = (r) => `${r.status}|${r.ticks}|${r.path}`;
export function checksOf(res, { copy, n }) {
    const seeds = res[D.REFERENCE].map((r) => r.seed), rows = [];
    rows.push({ name: "THE COPY", ok: copy === true, text: `with both options off the reference reproduces FOLLOW-UP 7's stored HELD79 flights on its first ${COPY_SEEDS} seeds: ${copy}` });
    const aligned = D.ARM_NAMES.every((a) => res[a].length === n && res[a].every((r, i) => r.seed === seeds[i] && r.kind === D.KIND));
    rows.push({ name: "SAME SCENARIOS", ok: aligned, text: `every arm flies the same ${n} scenarios in the same order: ${aligned}` });
    const moves = (a) => res[a].some((r, i) => key(r) !== key(res[D.REFERENCE][i])), bite = moves("sweep+leastbad") && moves("sweep+dive");
    rows.push({ name: "EACH OPTION BITES", ok: bite, text: `each option changes at least one flight: ${bite}` });
    const crush = D.ARM_NAMES.some((a) => res[a].some((r) => r.status === "crushed"));
    rows.push({ name: "NO CRUSH", ok: !crush, text: `no flight is lost to depth: ${!crush}` });
    return rows;
}
export function report(res, { copy, n, set }) {
    const L = [`FOLLOW-UP 8 (least bad, and a dive under the keel): ${D.KIND}, set ${set} (${n} seeds)${set === "held79" ? " -- POST HOC: this set's collisions chose the fix; NOT a result" : set === "dev" ? " -- DEV: a sanity run, not a result" : ""}`];
    const checks = checksOf(res, { copy, n });
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L; }
    L.push("arm                    reached  collided (ships)  left  timeout  least-bad ticks  dive ticks  deepest (m)");
    for (const a of D.ARM_NAMES) { const s = statsOf(res[a]), rs = res[a], sum = (k) => rs.reduce((t, r) => t + r[k], 0);
        L.push(`  ${a.padEnd(21)} ${String(s.reached).padStart(3)}/${n}  ${String(s.collided).padStart(5)} (${s.ships})   ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(6)}  ${String(sum("leastbadTicks")).padStart(14)}  ${String(sum("diveTicks")).padStart(10)}  ${Math.max(...rs.map((r) => r.deepest)).toFixed(1)}`); }
    const rep = (a) => { const p = pairOf(res[a], res[D.REFERENCE]); return `  ${a} against ${D.REFERENCE}: gained ${p.gained}, lost ${p.lost}, net ${p.net}, exact sign p ${p.p.toFixed(4)}`; };
    L.push(rep(D.DESIGNATED) + " (weighed)", rep("sweep+leastbad") + " (reported)", rep("sweep+dive") + " (reported)");
    const v = verdictOf(res), d = statsOf(res[D.DESIGNATED]), r = statsOf(res[D.REFERENCE]);
    L.push(`bars: ship collisions ${d.ships} at most half the reference's ${r.ships}: ${v.bars.ships}; net gain ${v.pair.net} >= ${GAIN} at p ${v.pair.p.toFixed(4)} <= ${P_LEVEL}: ${v.bars.gain}; no exit (${d.left}): ${v.bars.noExit}`);
    L.push(`VERDICT: ${v.verdict}${set === "held81" ? "" : " (not a result)"}`);
    return L;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("subTrafficDiveStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: subTrafficDiveStudy.mjs --set dev|held81|held79 [--write]"); return 2; }
    if (cli.flags.has("--write") && set !== "held81") { err("subTrafficDiveStudy: --write goes with --set held81 only (DEV is a sanity run and HELD79 is post hoc)"); return 2; }
    const res = (io.flySet || flySet)(SETS[set]), copy = (io.copySame || (() => copySame(fs.readFileSync(path.join(ENG, STORED_79), "utf8").trim().split("\n").map((l) => JSON.parse(l)))))();
    for (const l of report(res, { copy, n: SETS[set].length, set })) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), D.ARM_NAMES.flatMap((a) => res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${D.ARM_NAMES.length * SETS[set].length} flights to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
