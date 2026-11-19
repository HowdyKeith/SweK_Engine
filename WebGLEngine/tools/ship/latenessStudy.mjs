// WebGLEngine/tools/ship/latenessStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART A of "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE" in
// brain/RESERVOIR_GPU_WIP.md; the gate is brain/pilotLateness-selfcheck.mjs)
//
//   node tools/ship/latenessStudy.mjs [--write]
// Flies the fly heading-loop pilot (brain/pilotSubFlyCxWip.json, as the tank's fly type builds it) on time and 1, 2 and 4 ticks late (brain/pilotLateness.mjs) on auditSets(90000).safety
// (500 dives, flown ONCE), the instant vessel the tank flies (no actuator limits), and prints the checks, the table and the two registered readings. --write puts every dive's score in
// brain/rig-results/lateness-90000.json.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTask.mjs";
import * as L from "../../brain/pilotLateness.mjs";
import * as FX from "../../render/subAquariumFlyCx.mjs";
import { auditSets } from "../auditSubChampion.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const BASE = 90000, KS = Object.freeze([0, 1, 2, 4]), DESIGNATED = Object.freeze([1, 4]), MARGIN = 0.01, OUT_FILE = "brain/rig-results/lateness-90000.json", COPY_DIVES = 10;
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ENG, f), "utf8"));
export const circuit = () => { const cj = rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"); return { neurons: cj.neurons, edges: cj.edges, io: cj.io }; };
export const weights = () => rd("brain/pilotSubFlyCxWip.json").weights;
/** The tank's own fly type, built fresh (a fresh memory) on these weights. */
export const tankPilot = (C = circuit(), w = weights()) => FX.flyCxKind(C).build(w, {});
export const pilotOf = (k, C, w) => L.delayedPilot(tankPilot(C, w), k);
export const divesOf = (base = BASE) => auditSets(base).safety;
/** Every arm over the dives: { k: evaluate() result }. */
export function flyAll(dives = divesOf(), { C = circuit(), w = weights(), ks = KS } = {}) { return Object.fromEntries(ks.map((k) => [k, T.evaluate(pilotOf(k, C, w), dives)])); }
/** k against 0, paired by dive: { n, mean, se, lo, hi, reading }. */
export function readingOf(r0, rk, { margin = MARGIN } = {}) {
    if (r0.runs.length !== rk.runs.length || r0.runs.some((r, i) => r.seed !== rk.runs[i].seed || r.kind !== rk.runs[i].kind)) throw new Error("latenessStudy.readingOf: the arms are not on the same dives");
    const d = rk.runs.map((r, i) => r.score - r0.runs[i].score), n = d.length, mean = d.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)), se = sd / Math.sqrt(n), lo = mean - 2 * se, hi = mean + 2 * se;
    return { n, mean, se, lo, hi, reading: lo >= -margin && hi <= margin ? "COSTS NOTHING THAT MATTERS" : hi < -margin ? "COSTS" : "UNDECIDED" };
}
/** Check 1: delayed(0) flies bit for bit as the tank's own type, on the first COPY_DIVES dives. */
export function onTimeIsThePilot(dives, C = circuit(), w = weights(), make = pilotOf) {   // `make` is for the gate: a pilot that is late when it should not be must fail
    const a = T.evaluate(make(0, C, w), dives.slice(0, COPY_DIVES)), b = T.evaluate(tankPilot(C, w), dives.slice(0, COPY_DIVES));
    return a.runs.every((r, i) => r.score === b.runs[i].score && r.ticks === b.runs[i].ticks);
}
/** Check 2: on one recorded run's states, delayed(k)'s controls at tick n are delayed(0)'s at tick n - k (k = 1, 2, 4). */
export function delayIsExact(dive, C = circuit(), w = weights(), make = pilotOf) {   // `make` is for the gate
    const states = [];
    const p0 = tankPilot(C, w); T.fly((s, t, c, a) => { states.push([s, t, c, a]); return p0(s, t, c, a); }, dive);
    const outs = (k) => { const p = make(k, C, w); return states.map(([s, t, c, a]) => p(s, t, c, a)); }, o0 = outs(0);
    return [1, 2, 4].every((k) => { const ok = outs(k); return ok.length === o0.length && ok.every((u, n) => n < k || JSON.stringify(u) === JSON.stringify(o0[n - k])); }) && states.length > 100;
}
export function checksOf(res, { onTime, exact }) {
    const r0 = res[0].runs, same = KS.every((k) => res[k].runs.length === r0.length && res[k].runs.every((r, i) => r.seed === r0[i].seed && r.kind === r0[i].kind));
    return [{ name: "ON TIME IS THE PILOT", ok: onTime === true, text: `delayed(0) flies bit for bit as the tank's own type on the first ${COPY_DIVES} dives: ${onTime}` },
        { name: "THE DELAY IS EXACT", ok: exact === true, text: `on one recorded run's states, delayed(k) at tick n returns delayed(0)'s tick n - k (k = 1, 2, 4): ${exact}` },
        { name: "SAME DIVES", ok: same, text: `every arm flies the same ${r0.length} dives in the same order: ${same}` }];
}
export function report(res, checks) {
    const L2 = [`THE COST OF LATENESS: the fly heading-loop pilot on auditSets(${BASE}).safety (${res[0].runs.length} dives), on time and ${KS.slice(1).join(", ")} ticks late`];
    for (const c of checks) L2.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (checks.some((c) => !c.ok)) { L2.push("A CHECK FAILED: the readings are NOT WEIGHED.", "READING: NOT WEIGHED"); return L2; }
    L2.push("k (ticks late)  mean score  ended early  nominal  recovery  current   against on time: mean (2 se interval)");
    for (const k of KS) { const r = res[k], v = k === 0 ? null : readingOf(res[0], r); L2.push(`  ${String(k).padStart(2)}             ${r.score.toFixed(4)}   ${String(r.crashed).padStart(6)}      ${["nominal", "recovery", "current"].map((kk) => (r.byKind[kk] ?? NaN).toFixed(3)).join("    ")}   ${v ? `${v.mean >= 0 ? "+" : ""}${v.mean.toFixed(4)} (${v.lo.toFixed(4)} to ${v.hi.toFixed(4)})` : "-"}`); }
    L2.push(`the bars: COSTS NOTHING THAT MATTERS when the interval is inside -${MARGIN} to +${MARGIN}; COSTS when it is wholly below -${MARGIN}; otherwise UNDECIDED`);
    L2.push(`READING (ONE TICK): ONE TICK ${readingOf(res[0], res[1]).reading}`, `READING (FOUR TICKS): FOUR TICKS ${readingOf(res[0], res[4]).reading.replace("COSTS NOTHING", "COST NOTHING").replace(/^COSTS$/, "COST")}`);
    return L2;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("latenessStudy", { flags: ["--write"] }, argv), dives = (io.dives || divesOf)();
    const res = (io.flyAll || flyAll)(dives), onTime = (io.onTime || onTimeIsThePilot)(dives), exact = (io.exact || delayIsExact)(dives[0]);
    for (const l of report(res, checksOf(res, { onTime, exact }))) out(l);
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), JSON.stringify({ schema: 1, base: BASE, ks: KS, dives: res[0].runs.map((r, i) => ({ seed: r.seed, kind: r.kind, scores: KS.map((k) => res[k].runs[i].score), status: KS.map((k) => res[k].runs[i].status) })) }) + "\n"); out(`wrote ${res[0].runs.length} dives to ${OUT_FILE}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
