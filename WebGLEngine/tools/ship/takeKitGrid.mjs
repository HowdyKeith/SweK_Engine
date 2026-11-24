// WebGLEngine/tools/ship/takeKitGrid.mjs -- UNNUMBERED (the version is chosen at ship time) (the command line is tools/ship/takeKitGridCmd.mjs; the registration is brain/KIT_GRID_WIP.md, written BEFORE this file and before scenarios 101 to 112 were flown under the subsets, scenario 105 excepted; the gate is tools/ship/takeKitGrid-selfcheck.mjs)
//
// WHICH COUNTERMEASURE TURNS A FIGHT? The eight subsets of the kit (decoy, screen, interceptor) flown on each of the twelve registered Sea OGRE scenarios (seeds 101 to 112, three defenders), through `subsetsOf` of tools/ship/takeCounterfactual.mjs (engine only; the empty kit is run B and the full kit run K of brain/afterAction.mjs). THE ENGINE'S DEFAULT (RK4) ORIENTATION STEP, as the after-action and counterfactual commands run: no setOrientationDefault here.
//   Q1 (pooled, per non-empty subset): the paired difference of the score against the empty kit over the twelve: mean, se, better / worse / same, and the series' reading (BEATS iff positive, above 2 se AND at least 0.02; IS BELOW iff the mirror; else TIES).
//   Q2 (which one carries the full kit): per non-empty subset, in how many scenarios its fight has the same outcome, defenders lost and score as the full kit's, and as the empty kit's.
//   Q3 (the 105 pattern): scenarios in which all seven non-empty subsets score below the empty kit, at least one below, at least one above.
//   Q4 (the first divergence from the empty kit): counts by kind over the (scenario, subset) pairs, and per subset the fights that never diverge.
//   CHECKS (a failure is the first line and the readings are NOT WEIGHED): SCENARIOS (the seeds asked, once each), SUBSETS (eight, in the registered order), ENDS (the empty kit repeats run B and the full kit run K in every scenario), DETERMINISM (scenario 105's table is the one in brain/COUNTERFACTUAL_WIP.md section 7, when 105 is among the scenarios), SCORES (finite).
// A library: no clock, no Math.random; the engine runs through the seam `io.grid` (default `subsetsOf`).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../../brain/switchboard.mjs";
import * as A from "../../brain/afterAction.mjs";
import * as CF from "../../brain/counterfactual.mjs";
import { subsetsOf } from "./takeCounterfactual.mjs";
import { readingOf } from "./takeDecisionCircuit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const REGISTERED = A.SETS.registered, TIE = 1e-9, ORDER = Object.freeze(CF.SUBSETS.map((k) => CF.kitName(k)));
/** Scenario 105's table (brain/COUNTERFACTUAL_WIP.md section 7): the outcome and score of each subset, in ORDER. */
export const KNOWN_105 = Object.freeze({ none: ["defended", "1.702"], decoy: ["breached", "-0.167"], screen: ["breached", "-0.467"], interceptor: ["breached", "-0.467"], "decoy+screen": ["breached", "-0.317"], "decoy+interceptor": ["breached", "-0.317"], "screen+interceptor": ["breached", "-0.317"], "decoy+screen+interceptor": ["breached", "-0.317"] });
export const seedsOf = (first = REGISTERED.first, count = REGISTERED.count) => Array.from({ length: count }, (_, i) => first + i);

// ---- the checks ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The checks, in order: [{ name, ok, text }]. `grid` is [{ seed, pair, rows }] (subsetsOf's results) and `seeds` the seeds asked. */
export function checksOf(grid, seeds) {
    const rows = [], got = grid.map((g) => g.seed);
    rows.push({ name: "SCENARIOS", ok: JSON.stringify(got) === JSON.stringify(seeds), text: JSON.stringify(got) === JSON.stringify(seeds) ? `${seeds.length} scenarios, seeds ${seeds[0]} to ${seeds[seeds.length - 1]}, once each` : `the grid holds seeds ${got.join(", ")} and ${seeds.join(", ")} were asked` });
    const subBad = grid.filter((g) => JSON.stringify(g.rows.map((r) => r.name)) !== JSON.stringify(ORDER)).map((g) => g.seed);
    rows.push({ name: "SUBSETS", ok: subBad.length === 0, text: subBad.length ? `scenario ${subBad.join(", ")} did not fly the eight subsets in the registered order (${ORDER.join(", ")})` : `eight subsets in every scenario, in the order ${ORDER.join(", ")}` });
    const endBad = grid.filter((g) => g.rows.length !== 8 || g.rows[0].repeats !== "B" || g.rows[7].repeats !== "K").map((g) => g.seed);
    rows.push({ name: "ENDS", ok: endBad.length === 0, text: endBad.length ? `scenario ${endBad.join(", ")}: the empty kit does not repeat run B or the full kit run K` : "the empty kit repeats run B and the full kit run K in every scenario (by fingerprint)" });
    const g105 = grid.find((g) => g.seed === 105), detBad = g105 ? ORDER.filter((n, i) => !g105.rows[i] || g105.rows[i].run.outcome !== KNOWN_105[n][0] || g105.rows[i].run.score.toFixed(3) !== KNOWN_105[n][1]) : null;
    rows.push({ name: "DETERMINISM", ok: detBad === null || detBad.length === 0, text: detBad === null ? "scenario 105 is not among these scenarios (nothing to compare)" : detBad.length ? `scenario 105's ${detBad.join(", ")} differ from the table of brain/COUNTERFACTUAL_WIP.md section 7` : "scenario 105's eight rows are the table of brain/COUNTERFACTUAL_WIP.md section 7 (outcomes and scores)" });
    const sBad = grid.filter((g) => g.rows.some((r) => !Number.isFinite(r.run.score))).map((g) => g.seed);
    rows.push({ name: "SCORES", ok: sBad.length === 0, text: sBad.length ? `scenario ${sBad.join(", ")} has a score that is not a number` : "every score is a number" });
    return rows;
}

// ---- the readings ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const same = (a, b) => a.run.outcome === b.run.outcome && a.run.lost === b.run.lost && Math.abs(a.run.score - b.run.score) <= TIE;
const runsOf = (grid, i) => grid.map((g) => ({ key: String(g.seed), score: g.rows[i].run.score }));
/** Q1: per non-empty subset { name, ...paired (n, mean, se, better, worse, same), reading }. */
export function pooled(grid) {
    return ORDER.slice(1).map((name, k) => { const p = B.paired(runsOf(grid, k + 1), runsOf(grid, 0)); return { name, ...p, reading: readingOf(p) }; });
}
/** Q2: per non-empty subset { name, matchesFull, matchesEmpty } (the full kit's own row matches itself everywhere), and the subsets (not the full kit) that match the full kit most often. */
export function carriers(grid) {
    const per = ORDER.slice(1).map((name, k) => ({ name, matchesFull: grid.filter((g) => same(g.rows[k + 1], g.rows[7])).length, matchesEmpty: grid.filter((g) => same(g.rows[k + 1], g.rows[0])).length }));
    const cand = per.slice(0, 6), top = Math.max(...cand.map((p) => p.matchesFull));
    return { per, top, named: cand.filter((p) => p.matchesFull === top).map((p) => p.name) };
}
/** Q3: { allBelow: [seeds], anyBelow: [seeds], anyAbove: [seeds] } (a difference within 1e-9 is neither). */
export function patterns(grid) {
    const d = (g) => g.rows.slice(1).map((r) => r.run.score - g.rows[0].run.score);
    return { allBelow: grid.filter((g) => d(g).every((x) => x < -TIE)).map((g) => g.seed), anyBelow: grid.filter((g) => d(g).some((x) => x < -TIE)).map((g) => g.seed), anyAbove: grid.filter((g) => d(g).some((x) => x > TIE)).map((g) => g.seed) };
}
export const KINDS = Object.freeze(["intercepted", "decoyed", "a different hit", "a loss", "a different fire", "something else", "none"]);
/** The kind of a first divergence ({ tick, base, kit } or null): by what the subset's fight did there, then what the empty kit's did. */
export function kindOf(div) {
    if (!div) return "none";
    const k = div.kit ? div.kit.type : null, b = div.base ? div.base.type : null;
    if (k === "intercepted") return "intercepted";
    if (k === "decoyed") return "decoyed";
    if (k === "loss" || b === "loss") return "a loss";
    if (k === "hit" && b === "hit") return "a different hit";
    if ((k && /fire/.test(k)) || (b && /fire/.test(b))) return "a different fire";
    return "something else";
}
/** Q4: { total: { kind: n }, divergent, pairs, perSubset: [{ name, none }] } over the non-empty subsets. */
export function divergences(grid) {
    const total = Object.fromEntries(KINDS.map((k) => [k, 0])); let pairs = 0;
    const perSubset = ORDER.slice(1).map((name, k) => { let none = 0; for (const g of grid) { const kind = kindOf(g.rows[k + 1].divergence); total[kind]++; pairs++; if (kind === "none") none++; } return { name, none }; });
    return { total, pairs, divergent: pairs - total.none, perSubset };
}

// ---- the report ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const f3 = (x) => x.toFixed(3), f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : String(x)), sg = (x) => (x.toFixed(4) === "-0.0000" ? "+0.0000" : (x >= 0 ? "+" : "") + x.toFixed(4));
/** THE REPORT of the grid: the checks first (a failure is the first line and the readings are NOT WEIGHED), the table, Q1 to Q4, the label that it is POST HOC. Returns the lines. */
export function report(grid, seeds) {
    const L = [], checks = checksOf(grid, seeds), failed = checks.filter((c) => !c.ok), isReg = JSON.stringify(seeds) === JSON.stringify(seedsOf());
    if (!isReg) L.push(`NOT THE REGISTERED SET: seeds ${seeds[0]} to ${seeds[seeds.length - 1]}; the registered set is ${REGISTERED.first} to ${REGISTERED.first + REGISTERED.count - 1}. A smoke, not the read.`);
    if (failed.length) L.push(`CHECK FAILED -- ${failed.map((c) => c.name).join(", ")}: THE CHECKS FAILED, THE READINGS ARE NOT WEIGHED`);
    L.push(`THE KIT GRID (brain/KIT_GRID_WIP.md; POST HOC: the pair of every scenario was read before): the eight subsets of the kit on ${seeds.length} Sea OGRE scenarios (${CF.DEFENDERS} defenders)`);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("the scores, one row a scenario (outcome, score, defenders lost for each subset in the order " + ORDER.join(", ") + "):");
    for (const g of grid) L.push(`  ${g.seed}: ${g.rows.map((r) => `${r.run.outcome[0]}${f3(r.run.score)}/${r.run.lost}`).join(" ")}`);
    L.push("Q1 pooled, each non-empty subset against the empty kit (score difference over the scenarios):");
    const q1 = pooled(grid);
    for (const p of q1) L.push(`  ${p.name.padEnd(26)} ${sg(p.mean)} (se ${f4(p.se)}); better ${p.better}, worse ${p.worse}, same ${p.same}: ${p.reading}`);
    const beats = q1.filter((p) => p.reading === "BEATS").map((p) => p.name), below = q1.filter((p) => p.reading === "IS BELOW").map((p) => p.name);
    const q2 = carriers(grid);
    L.push("Q2 in how many scenarios each subset's fight (outcome, defenders lost, score) is the full kit's, and the empty kit's:");
    for (const p of q2.per) L.push(`  ${p.name.padEnd(26)} the full kit's in ${p.matchesFull} of ${grid.length}; the empty kit's in ${p.matchesEmpty} of ${grid.length}`);
    L.push(`  the subset that matches the full kit most often, the full kit excluded: ${q2.named.join(", ")} (${q2.top} of ${grid.length})`);
    const q3 = patterns(grid), ls = (a) => (a.length ? a.join(", ") : "none");
    L.push(`Q3 all seven non-empty subsets below the empty kit in ${q3.allBelow.length} scenario(s): ${ls(q3.allBelow)}; at least one below in ${q3.anyBelow.length}: ${ls(q3.anyBelow)}; at least one above in ${q3.anyAbove.length}: ${ls(q3.anyAbove)}`);
    const q4 = divergences(grid);
    L.push(`Q4 the first divergence from the empty kit, over ${q4.pairs} (scenario, subset) fights: ${KINDS.map((k) => `${k} ${q4.total[k]}`).join(", ")}; divergent ${q4.divergent}`);
    L.push(`  fights that never diverge, per subset: ${q4.perSubset.map((p) => `${p.name} ${p.none}`).join(", ")}`);
    L.push(`BOTTOM LINE: ${beats.length ? `SUBSETS THAT BEAT THE EMPTY KIT: ${beats.join(", ")}` : "NO SUBSET BEATS THE EMPTY KIT"}; ${below.length ? `SUBSETS THAT ARE BELOW IT: ${below.join(", ")}` : "NO SUBSET IS BELOW IT"} (the series' reading over ${grid.length} scenarios; the pattern of 105 is in ${q3.allBelow.length} scenario(s))`);
    return L;
}

// ---- the command -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** `run [--first N --count M] [--out file]`: flies the grid (engine only), prints the report and, with --out, writes the rows as JSON. Returns 0, 1 (a refusal) or 2 (a bad argument). `io`: { out, err, writeFile, grid }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || ((f, t) => fs.writeFileSync(path.resolve(ENG, f), t)), grid = io.grid || subsetsOf;
    const [cmd, ...rest] = argv;
    if (cmd !== "run") { err(`takeKitGrid: the first word must be run, got ${JSON.stringify(cmd)}`); return 2; }
    const given = {}, known = { first: Number, count: Number, out: String };
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) { err(`takeKitGrid: unexpected argument ${JSON.stringify(a)}`); return 2; }
        const k = a.slice(2); if (!(k in known)) { err(`takeKitGrid: unknown option ${JSON.stringify(a)} (known for run: ${Object.keys(known).map((n) => "--" + n).join(", ")})`); return 2; }
        const v = rest[++i]; if (v == null || v.startsWith("--")) { err(`takeKitGrid: ${a} needs a value`); return 2; }
        given[k] = known[k] === Number ? Number(v) : v;
        if (known[k] === Number && !(Number.isInteger(given[k]) && given[k] >= 1)) { err(`takeKitGrid: ${a} needs a whole number of 1 or more, got ${JSON.stringify(v)}`); return 2; }
    }
    const seeds = seedsOf(given.first ?? REGISTERED.first, given.count ?? REGISTERED.count);
    let g; try { g = seeds.map((s) => grid(s)); } catch (e) { err("takeKitGrid: " + e.message); return 1; }
    if (given.out) { try { writeFile(given.out, JSON.stringify(g.map((x) => ({ seed: x.seed, rows: x.rows.map((r) => ({ name: r.name, outcome: r.run.outcome, score: r.run.score, lost: r.run.lost, repeats: r.repeats, decoyed: r.decoyed, intercepted: r.intercepted, divergence: r.divergence })) }))) + "\n"); } catch (e) { err("takeKitGrid: " + e.message); return 1; } }
    for (const l of report(g, seeds)) out(l);
    return 0;
}
