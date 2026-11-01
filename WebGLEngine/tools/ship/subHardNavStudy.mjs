// WebGLEngine/tools/ship/subHardNavStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 3" and its Amendment 1 in brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subHardNavStudy-selfcheck.mjs)
//
// THE STUDY OF THE HARDER NAVIGATION TEST: flies the arms of brain/subHardNav.mjs (straight, smooth+approach, any, any-blind, any+replan, any+predict) through the four hard kinds (islands + icebergs with keels, a wall with one narrow gap, traffic, a strong
// unmodelled current) on the PD autopilot and reads the result against the bars, the verdict rule and the predictions H1 to H8 that brain/SUB_FIELD_NAV_WIP.md registered before HELD4 was flown.
//   node tools/ship/subHardNavStudy.mjs --set dev [--seeds N]            a sanity run of the code on the DEV seeds (not a result)
//   node tools/ship/subHardNavStudy.mjs --set held4 [--seeds N] [--write] HELD4, seeds 401 to 460 of each kind, READ ONCE: the tables, the splits, the verdict and H1 to H8; --write puts every flight in brain/subHardNavHeld4.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subHardNavHeld4.jsonl";
export const THRESH = Object.freeze({ straightMax: 0.3, replanGain: 5, noRouteMax: 3, gapTop: 0.9, blindExtraCollisions: 2 });
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const key = (r) => r.kind + "|" + r.seed;
/** The median of arm A's path over arm B's, on the scenarios of a kind that both reached: { ratio, pairs }. */
export function pathRatio(runs, kind, armA, armB) {
    const b = new Map(runs.filter((r) => r.kind === kind && r.arm === armB && r.reached).map((r) => [key(r), r]));
    const pairs = runs.filter((r) => r.kind === kind && r.arm === armA && r.reached && b.has(key(r)));
    return { ratio: pairs.length ? median(pairs.map((r) => r.path / b.get(key(r)).path)) : NaN, pairs: pairs.length };
}
const tally = (rs) => ({ n: rs.length, reached: rs.filter((r) => r.reached).length, collided: rs.filter((r) => r.status === "collided").length });

/**
 * The numbers of a list of flights: { cells: { kind: { arm: { n, reached, rate, collided, left, timeout, other, noRoute, medianClearance, medianChord (path over the start-to-waypoint chord, flights that arrived), medianTime, medianReplans, margins { "12": n, ... } } } },
 *   vsAny: { kind: { arm: { ratio, pairs } } }, anyOverBlind (hard-islands: any's path over any-blind's, { ratio, pairs }), gaps: { width: { arm: { n, reached, collided } } }, ships: { fast | slow: { arm: ... } }, current: { strong | weak: { arm: ... } } }.
 */
export function summarize(runs) {
    const cells = {}, vsAny = {};
    for (const kind of H.HARD_KINDS) {
        cells[kind] = {}; vsAny[kind] = {};
        for (const arm of H.ARMS_OF[kind]) {
            const rs = runs.filter((r) => r.kind === kind && r.arm === arm);
            if (!rs.length) continue;
            const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached), margins = {};
            for (const m of H.MARGIN_LADDER) margins[m] = rs.filter((r) => r.margin === m).length;
            cells[kind][arm] = {
                n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"),
                other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, noRoute: rs.filter((r) => r.noRoute).length,
                medianClearance: median(rs.map((r) => r.minClearance)), medianChord: median(done.map((r) => r.path / r.chord)), medianTime: median(done.map((r) => r.t)), medianReplans: median(rs.map((r) => r.replans)), margins,
            };
            if (arm !== "any") vsAny[kind][arm] = pathRatio(runs, kind, arm, "any");
        }
    }
    const split = (kind, pick) => { const out = {}; for (const [label, f] of Object.entries(pick)) { out[label] = {}; for (const arm of H.ARMS_OF[kind]) { const rs = runs.filter((r) => r.kind === kind && r.arm === arm && f(r)); if (rs.length) out[label][arm] = tally(rs); } } return out; };
    const gaps = {};
    for (const w of H.GAP_WIDTHS) { gaps[w] = {}; for (const arm of H.ARMS_OF["hard-gaps"]) { const rs = runs.filter((r) => r.kind === "hard-gaps" && r.arm === arm && r.gap === w); if (rs.length) gaps[w][arm] = tally(rs); } }
    return { cells, vsAny, anyOverBlind: pathRatio(runs, "hard-islands", "any", "any-blind"), gaps, ships: split("hard-traffic", { fast: (r) => r.shipSpeed > H.SHIP_FAST, slow: (r) => r.shipSpeed <= H.SHIP_FAST }), current: split("hard-current", { strong: (r) => r.currentMean > H.CURRENT_STRONG, weak: (r) => r.currentMean <= H.CURRENT_STRONG }) };
}

/**
 * The bars, the verdict and the predictions H1 to H8 from a summary (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP 3"). A kind's bar is read on its DESIGNATED arm: reached / n at least BARS[kind] (hard-islands also at most ISLAND_MAX_COLLISIONS collisions).
 * Verdict: SUPPORTED when all four bars hold; PARTLY SUPPORTED when hard-islands holds and at least one other kind does; NOT SUPPORTED otherwise.
 */
export function judge(sum) {
    const c = sum.cells, cell = (kind, arm) => (c[kind] && c[kind][arm]) || null, bars = {};
    for (const kind of H.HARD_KINDS) {
        const x = cell(kind, H.DESIGNATED[kind]);
        bars[kind] = { arm: H.DESIGNATED[kind], rate: x ? x.rate : NaN, collided: x ? x.collided : NaN, pass: !!x && x.rate >= H.BARS[kind] && (kind !== "hard-islands" || x.collided <= H.ISLAND_MAX_COLLISIONS) };
    }
    const others = H.HARD_KINDS.filter((k) => k !== "hard-islands" && bars[k].pass);
    const verdict = H.HARD_KINDS.every((k) => bars[k].pass) ? "SUPPORTED" : bars["hard-islands"].pass && others.length ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const each = (f) => H.HARD_KINDS.every((k) => f(k)), fieldArms = (k) => H.ARMS_OF[k].filter((a) => a !== "straight");
    const h1 = each((k) => { const x = cell(k, "straight"); return !!x && x.rate <= THRESH.straightMax; });
    const h2 = each((k) => { const x = cell(k, "any"), y = cell(k, "smooth+approach"); return !!x && !!y && x.reached >= y.reached; });
    const isl = cell("hard-islands", "any"), islBlind = cell("hard-islands", "any-blind"), h3ratio = sum.anyOverBlind ? sum.anyOverBlind.ratio : NaN;
    const h3 = Number.isFinite(h3ratio) && h3ratio <= 1 && !!isl && !!islBlind && isl.collided <= islBlind.collided + THRESH.blindExtraCollisions;
    const g = sum.gaps, gr = (w) => (g[w] && g[w].any && g[w].any.n ? g[w].any.reached / g[w].any.n : NaN);
    const h4 = gr(24) <= gr(32) && gr(32) <= gr(40) && gr(40) >= THRESH.gapTop;
    const ta = cell("hard-traffic", "any"), tr = cell("hard-traffic", "any+replan"), tp = cell("hard-traffic", "any+predict");
    const h5 = !!ta && !!tr && !!tp && tr.reached - ta.reached >= THRESH.replanGain && tp.reached >= tr.reached && tp.collided <= tr.collided;
    const ci = cell("hard-current", "any"), h6 = !!ci && !!isl && ci.reached < isl.reached;
    const h7 = each((k) => fieldArms(k).every((a) => { const x = cell(k, a); return !!x && x.noRoute <= THRESH.noRouteMax; }));
    const h8 = each((k) => fieldArms(k).every((a) => { const x = cell(k, a); return !!x && x.left === 0; }));
    return { bars, verdict, barsHeld: H.HARD_KINDS.filter((k) => bars[k].pass), h1, h2, h3, h3ratio, h4, gapRates: [gr(24), gr(32), gr(40)], h5, h6, h7, h8 };
}

const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
/** The table of a summary, one line a (kind, arm), then the splits. */
export function table(sum, title) {
    const lines = [title, "kind          | arm             | reached      | collided left timeout noRoute | median path/chord | median min clearance (m) | median time (s) | path vs any (pairs) | margins 12/8/6/3 | median replans"];
    for (const kind of H.HARD_KINDS) for (const arm of H.ARMS_OF[kind]) {
        const x = sum.cells[kind] && sum.cells[kind][arm]; if (!x) continue;
        const v = sum.vsAny[kind] && sum.vsAny[kind][arm];
        lines.push(`${kind.padEnd(13)} | ${arm.padEnd(15)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.noRoute).padStart(7)} | ${f2(x.medianChord).padEnd(17)} | ${f2(x.medianClearance).padEnd(24)} | ${f2(x.medianTime).padEnd(15)} | ${(v ? `${f2(v.ratio)} (${v.pairs})` : "-").padEnd(19)} | ${H.MARGIN_LADDER.map((m) => x.margins[m]).join("/").padEnd(16)} | ${f2(x.medianReplans)}`);
    }
    const row = (label, o) => Object.entries(o).map(([arm, t]) => `${arm} ${t.reached}/${t.n}${t.collided ? ` (${t.collided} hit)` : ""}`).join(", ") + ` [${label}]`;
    lines.push("hard-gaps by width (reached/n):");
    for (const w of H.GAP_WIDTHS) lines.push(`  ${w} m: ${row(w + " m", sum.gaps[w])}`);
    lines.push(`hard-traffic by the fastest ship (above ${H.SHIP_FAST} m/s = fast):`);
    for (const k of ["fast", "slow"]) lines.push(`  ${k}: ${row(k, sum.ships[k])}`);
    lines.push(`hard-current by the mean current (above ${H.CURRENT_STRONG} m/s = strong):`);
    for (const k of ["strong", "weak"]) lines.push(`  ${k}: ${row(k, sum.current[k])}`);
    return lines.join("\n");
}
/** The verdict block of a judgement. */
export function verdictText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), lines = [];
    for (const kind of H.HARD_KINDS) { const b = j.bars[kind]; lines.push(`${kind}: ${b.arm} reaches ${pct(b.rate)} (bar ${pct(H.BARS[kind])}${kind === "hard-islands" ? `, at most ${H.ISLAND_MAX_COLLISIONS} collisions; it has ${b.collided}` : ""}): ${yn(b.pass)}`); }
    lines.push(`H1 straight reaches at most ${pct(THRESH.straightMax)} in every kind: ${yn(j.h1)}`, `H2 any reaches at least as many as smooth+approach in every kind: ${yn(j.h2)}`, `H3 keels are worth using: any's path over any-blind's is ${f2(j.h3ratio)} (at most 1) and any has no more than ${THRESH.blindExtraCollisions} more collisions: ${yn(j.h3)}`,
        `H4 gaps: reach 24/32/40 m = ${j.gapRates.map(pct).join(" / ")}, not falling as the gap widens and at least ${pct(THRESH.gapTop)} at 40 m: ${yn(j.h4)}`, `H5 traffic: replan beats the frozen plan by at least ${THRESH.replanGain}, predict at least replan, predict's collisions at most replan's: ${yn(j.h5)}`,
        `H6 any reaches fewer in hard-current than in hard-islands: ${yn(j.h6)}`, `H7 no field arm has more than ${THRESH.noRouteMax} noRoute scenarios in a kind: ${yn(j.h7)}`, `H8 no field arm ever left the region: ${yn(j.h8)}`,
        `VERDICT: ${j.verdict}${j.barsHeld.length ? " (bars held in " + j.barsHeld.join(", ") + ")" : " (no bar held)"}`);
    return lines.join("\n");
}

/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--set") { o.set = argv[++i]; if (!H.HARD_SETS[o.set]) { err(`subHardNavStudy: --set needs one of ${Object.keys(H.HARD_SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subHardNavStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subHardNavStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && o.set !== "held4") { err("subHardNavStudy: --write goes with --set held4 only"); return 2; }
    const seeds = o.seeds ? H.HARD_SETS[o.set].slice(0, o.seeds) : H.HARD_SETS[o.set], set = H.HARD_KINDS.flatMap((k) => seeds.map((s) => H.hardScenario(s, k)));
    out(`${o.set.toUpperCase()} set: ${seeds.length} scenarios of each of ${H.HARD_KINDS.length} kinds`);
    const runs = H.evaluateHard(pilot, set), sum = summarize(runs);
    out(""); out(table(sum, `margin ladder ${H.MARGIN_LADDER.join(", ")} m (the first plan at the widest margin that leaves a route), ${H.SECONDS_HARD} s a flight`)); out(verdictText(judge(sum)));
    if (o.write) { writeFile(path.join(ENG, OUT), runs.map((r) => JSON.stringify({ set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUT}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
