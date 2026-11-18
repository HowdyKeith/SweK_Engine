// WebGLEngine/tools/ship/subTrafficUnderStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is FOLLOW-UP 10 of brain/SUB_FIELD_NAV_WIP.md, "UNDER EVERY KEEL";
// the gate is tools/ship/subTrafficUnderStudy-selfcheck.mjs)
//
//   node tools/ship/subTrafficUnderStudy.mjs --set dev               DEV (seeds 1-30, spent): checks 1 and 3 and a sanity run, no verdict
//   node tools/ship/subTrafficUnderStudy.mjs --set held88 --write    the registered read: checks 1 and 3 FIRST (a failure flies nothing, exit 3), then HELD88 (10201-10400) ONCE
// Three arms of brain/subDeepTransit.mjs (ARMS10): R the reference, U designated, L the attribution reading. Pure apart from the file. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../../brain/subDeepTransit.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import * as E from "../../brain/navEnergy.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import { statsOf, pairOf, signTest } from "./subGiveWayStudy.mjs";
import { parseOrExit } from "./cliArgs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT_FILE = "brain/subTrafficUnderHeld88.jsonl", STORED_82 = "brain/subDeepTransitHeld82.jsonl", GAIN = 5, P_LEVEL = 0.10, HARMFUL = -5, COPY_SEEDS = 5, BITE_DEPTH = 60.8, DAMAGE_DEPTH = 80, DEEP_KEEL = 53;
export const SETS = Object.freeze({ dev: P.DEV, held88: P.HELD88 });
const R = P.REFERENCE10, U = P.DESIGNATED10, L = P.ATTRIBUTION10, ARMS = P.ARM10_NAMES;

/** One flight with the energy meter and the clearance measurement (the record of flyDeep with measure, plus energy in J). */
export function flyOne(sc, arm) {
    const model = E.navModel(); let joules = 0;
    const base = (s, t, c) => { const cmd = AP.decide(s, t, c); joules += E.wattsOf(model, s, cmd, c || [0, 0, 0]).watts * S.DT; return cmd; };
    const r = P.flyDeep(sc, arm, { base, measure: true });
    return { ...r, energy: joules, deepKeel: sc.obstacles.some((o) => o.type === "ship" && o.keel > DEEP_KEEL) };
}
export function flySet(seeds, { fly = flyOne, arms = ARMS } = {}) { const scs = seeds.map((s) => P.scenarioOf(s)); return Object.fromEntries(arms.map((a) => [a, scs.map((sc) => fly(sc, a))])); }
const median = (xs) => { if (!xs.length) return NaN; const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
/** The registered test of one arm against R: (a) ships at most half, (b) net >= GAIN at p <= P_LEVEL, (c) exits no more than R's and at most 1. */
export function testOf(res, arm) {
    const d = statsOf(res[arm]), r = statsOf(res[R]), pr = pairOf(res[arm], res[R]);
    const bars = { ships: 2 * d.ships <= r.ships, gain: pr.net >= GAIN && pr.p <= P_LEVEL, exits: d.left <= r.left && d.left <= 1 };
    const verdict = bars.exits && bars.ships && bars.gain ? "SUPPORTED" : bars.exits && bars.ships !== bars.gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    return { bars, pair: pr, d, r, verdict, harmful: pr.net <= HARMFUL };
}
/** Check 1, flown: R reproduces FOLLOW-UP 9's stored HELD82 flights of sweep+dive+deep on the first COPY_SEEDS seeds. */
export function copySame(stored, fly = (sc) => P.flyDeep(sc, R)) {
    const want = new Map(stored.filter((r) => r.arm === R).map((r) => [r.seed, r]));
    return P.HELD82.slice(0, COPY_SEEDS).every((s) => { const w = want.get(s), g = fly(P.scenarioOf(s)); return !!w && w.status === g.status && w.ticks === g.ticks && w.path === g.path; });
}
/** Check 3, flown on DEV: some U flight goes deeper than BITE_DEPTH. */
export const limitBites = (devU) => devU.some((r) => r.deepest > BITE_DEPTH);
export function checksOf(res, { copy, bites, seeds }) {
    const rows = [{ name: "THE COPY", ok: copy === true, text: `the reference reproduces FOLLOW-UP 9's stored HELD82 flights on its first ${COPY_SEEDS} seeds: ${copy}` },
        { name: "THE LIMIT BITES", ok: bites === true, text: `on DEV some designated flight goes deeper than ${BITE_DEPTH} m: ${bites}` }];
    if (res) {
        const same = ARMS.every((a) => res[a].length === seeds.length && res[a].every((r, i) => r.seed === seeds[i] && r.kind === P.KIND));
        const deepest = Math.max(...ARMS.flatMap((a) => res[a].map((r) => r.deepest)));
        rows.push({ name: "SAME SCENARIOS", ok: same, text: `every arm flies the ${seeds.length} seeds in order: ${same}` }, { name: "NO HULL DAMAGE", ok: deepest < DAMAGE_DEPTH, text: `the deepest point of any arm is ${deepest.toFixed(1)} m, under ${DAMAGE_DEPTH}` });
    }
    return rows;
}
export function report(res, checks, { set, n }) {
    const dev = set === "dev", L2 = [`FOLLOW-UP 10 (under every keel): ${P.KIND}, set ${set} (${n} seeds)${dev ? " -- DEV: a sanity run, not a result" : ", flown once"}`];
    for (const c of checks) L2.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (!dev && checks.some((c) => !c.ok)) { L2.push("A CHECK FAILED: the verdict is NOT WEIGHED.", "VERDICT: NOT WEIGHED"); return L2; }
    L2.push("arm                              reached  collided (ships)  left  timeout  deepest  median min ship clearance  median energy (kJ)");
    for (const a of ARMS) { const s = statsOf(res[a]), rs = res[a]; L2.push(`  ${a.padEnd(31)} ${String(s.reached).padStart(3)}/${n}  ${String(s.collided).padStart(5)} (${s.ships})   ${String(s.left).padStart(4)}  ${String(s.timeout).padStart(6)}  ${Math.max(...rs.map((r) => r.deepest)).toFixed(1).padStart(6)}  ${median(rs.map((r) => r.minShipClear)).toFixed(2).padStart(10)}               ${(median(rs.filter((r) => r.reached).map((r) => r.energy)) / 1000).toFixed(0).padStart(8)}`); }
    const t = testOf(res, U), l = testOf(res, L);
    L2.push(`U against R: gained ${t.pair.gained}, lost ${t.pair.lost}, net ${t.pair.net}, exact sign p ${t.pair.p.toFixed(4)}`);
    L2.push(`bars: (a) ship collisions ${t.d.ships} at most half of R's ${t.r.ships}: ${t.bars.ships}; (b) net ${t.pair.net} >= ${GAIN} at p <= ${P_LEVEL}: ${t.bars.gain}; (c) exits ${t.d.left} no more than R's ${t.r.left} and at most 1: ${t.bars.exits}`);
    L2.push(`reported (moves nothing): L against R: gained ${l.pair.gained}, lost ${l.pair.lost}, net ${l.pair.net}, p ${l.pair.p.toFixed(4)}; ships ${l.d.ships} against ${l.r.ships}; exits ${l.d.left}`);
    const clr = (a) => res[a].map((r) => r.minShipClear), up = clr(U).filter((c, i) => c > clr(R)[i] + 1e-9).length, down = clr(U).filter((c, i) => c < clr(R)[i] - 1e-9).length;
    L2.push(`reported (moves nothing): minimum ship clearance, U against R: larger in ${up}, smaller in ${down}, exact sign p ${signTest(Math.min(up, down), up + down).toFixed(4)}`);
    for (const a of [R, U]) { const rs = res[a], shipC = rs.filter((r) => r.status === "collided" && r.hit === "ship"); L2.push(`reported (moves nothing): ${a} failures -- ship collisions in scenarios with a keel over ${DEEP_KEEL} m ${shipC.filter((r) => r.deepKeel).length}, in the others ${shipC.filter((r) => !r.deepKeel).length}; other collisions ${rs.filter((r) => r.status === "collided" && r.hit !== "ship").length}; exits ${rs.filter((r) => r.status === "left").length}; timeouts ${rs.filter((r) => r.status === "timeout").length} (coarser than the diagnosis's classes: the record does not say WHICH ship was hit)`); }
    L2.push(dev ? "DEV: a sanity run, not a result (no verdict is drawn on DEV)" : `VERDICT: ${t.verdict}${t.harmful ? "   HARMFUL" : ""}`);
    return L2;
}
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const cli = parseOrExit("subTrafficUnderStudy", { values: { "--set": "string" }, flags: ["--write"] }, argv, io.exitIo), set = cli.values["--set"] || null;
    if (!SETS[set]) { err("usage: subTrafficUnderStudy.mjs --set dev|held88 [--write]"); return 2; }
    if (set === "dev" && cli.flags.has("--write")) { err("subTrafficUnderStudy: --write goes with --set held88 only"); return 2; }
    if (set === "held88" && !cli.flags.has("--write")) { err("subTrafficUnderStudy: HELD88 is flown ONCE, so its flights are always written: add --write"); return 2; }
    if (set === "held88" && (io.exists || fs.existsSync)(path.join(ENG, OUT_FILE))) { err(`subTrafficUnderStudy: HELD88 was already flown (${OUT_FILE} exists); it is flown ONCE`); return 2; }
    const f = { flySet, copy: () => copySame(fs.readFileSync(path.join(ENG, STORED_82), "utf8").trim().split("\n").map((l) => JSON.parse(l))), ...(io.flights || {}) };
    const copy = f.copy(), devU = set === "dev" ? null : f.flySet(SETS.dev, { arms: [U] })[U];
    let res = null;
    if (set === "dev") res = f.flySet(SETS.dev);
    const bites = limitBites(set === "dev" ? res[U] : devU);
    if (set === "held88" && !(copy && bites)) { for (const c of checksOf(null, { copy, bites }).filter((c) => !c.ok)) out(`  FAIL ${c.name}: ${c.text}`); out("A CHECK FAILED before any HELD88 flight: HELD88 is NOT flown."); out("VERDICT: NOT WEIGHED"); return 3; }
    if (set === "held88") res = f.flySet(SETS.held88);
    // the flights are written the moment they exist
    if (cli.flags.has("--write")) { writeFile(path.join(ENG, OUT_FILE), ARMS.flatMap((a) => res[a]).map((r) => JSON.stringify({ set, ...r })).join("\n") + "\n"); out(`wrote ${ARMS.length * SETS[set].length} flights to ${OUT_FILE}`); }
    for (const l of report(res, checksOf(res, { copy, bites, seeds: SETS[set] }), { set, n: SETS[set].length })) out(l);
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
