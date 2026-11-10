// WebGLEngine/tools/ship/tankPairedReplicate.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/tankPairedReplicate-selfcheck.mjs; the registration is brain/TANK_PILOTS_WIP.md, "FOLLOW-UP 2: DOES THE DARK EFFECT OF THE MEMORY REPLICATE?", written before this file)
//
// THE REPLICATION OF THE PAIRED MEMORY TEST, POOLED: the stateful fly pilot against the same weights with the memory wiped every tick, in the Sub Aquarium's tank, on 24 FRESH ids (`rep-0`..`rep-23`) and, again from the committed code, the first 24 (`mem-0`..`mem-23`), judged on the pooled 48.
//   node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]      (the registered size is 24 ids of 240 s; any other size is a smoke run and makes no check and no verdict)
// It calls tools/tankFlyCxBench.mjs pairedBench (unchanged) twice and does the three things the bench cannot: (1) THE CHECK, run first: the first 24's re-flown means of P1, P2 and P3 must print as the first result's -0.0553, -0.1368 and -0.1037; if not, the code or the tank has moved since and the pooled reading is not made;
// (2) THE EXACT POOLED TEST: a two-sided sign-flip test over all 2^n sign assignments of the n pooled differences, done exactly by counting the assignments by their sum (a dynamic programme over the differences rounded to 1e-5, the rounding stated in the report) where the bench enumerates 2^24 by Gray code and cannot reach 2^48;
// (3) THE BOTTOM LINE on P3 by the rule written first. Reported and not in the verdict: the three tests on the new 24 alone and on the first 24 alone. Exit 0 read; 1 a usage error; 2 the check failed (the pooled reading was not made).
// Pure but for the flights. No clock, no random.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../tankFlyCxBench.mjs";

export const NEW_PREFIX = "rep-", OLD_PREFIX = B.PAIR_ID_PREFIX, QUANTUM = 1e-5, ALPHA = B.ALPHA;
/** The first run's printed means (brain/TANK_PILOTS_WIP.md, "RESULT OF THE PAIRED TEST"): what the re-flown first 24 must print as. */
export const FIRST_RESULT = Object.freeze({ p1: -0.0553, p2: -0.1368, p3: -0.1037 });
export const REGISTERED = Object.freeze({ ids: 24, seconds: 240 });

/**
 * The exact two-sided sign-flip permutation p of the differences `d` rounded to multiples of `q`: the share of ALL 2^n sign assignments whose |sum| is at least the observed |sum|, counted exactly over the sums (a dynamic programme: the number of assignments reaching each sum).
 * n from 1 to 52 (2^52 is the largest count a double holds exactly); a non-finite difference gives NaN. The rounding to q is the only approximation and moves a difference by at most q / 2.
 */
export function exactPooledP(d, q = QUANTUM) {
    const n = d.length;
    if (!Number.isInteger(n) || n < 1 || n > 52) throw new Error(`tankPairedReplicate.exactPooledP: needs 1 to 52 differences, got ${n}`);
    if (d.some((x) => !Number.isFinite(x))) return NaN;
    const a = d.map((x) => Math.round(Math.abs(x) / q)), obs = Math.abs(d.reduce((s, x, i) => s + Math.sign(x) * a[i], 0)), total = a.reduce((s, x) => s + x, 0);
    let cur = new Float64Array(2 * total + 1), nxt = new Float64Array(2 * total + 1), reach = 0; cur[total] = 1;
    for (const v of a) {
        nxt.fill(0);
        for (let s = total - reach; s <= total + reach; s++) { const c = cur[s]; if (c) { nxt[s + v] += c; nxt[s - v] += c; } }
        reach += v; const t = cur; cur = nxt; nxt = t;
    }
    let count = 0; for (let s = 0; s <= 2 * total; s++) if (Math.abs(s - total) >= obs) count += cur[s];
    return count / 2 ** n;
}

/** A paired test on `d`: { n, mean, sd, se, p (exactPooledP), better (below 0), holds (mean below 0 and p below ALPHA) }. */
export function testOf(d) {
    const m = B.meanSd(d), p = exactPooledP(d);
    return { n: m.n, mean: m.mean, sd: m.sd, se: m.sd / Math.sqrt(m.n), p, better: d.filter((x) => x < 0).length, holds: m.mean < 0 && p < ALPHA };
}
/** The three tests (p1, p2, p3) of a { p1, p2, p3 } of difference lists, and the bench's verdict of them. */
export function testsOf(diffs) {
    const tests = { p1: testOf(diffs.p1), p2: testOf(diffs.p2), p3: testOf(diffs.p3) };
    return { tests, verdict: B.pairedVerdict(tests.p1.holds, tests.p2.holds, tests.p3.holds) };
}
/** The two lists end to end, test by test: { p1, p2, p3 }. */
export const pool = (a, b) => ({ p1: [...a.p1, ...b.p1], p2: [...a.p2, ...b.p2], p3: [...a.p3, ...b.p3] });

/** THE CHECK: does the re-flown first set print the first result? { ok, lines } with each test's mean to four places beside the registered one. */
export function checkFirst(diffs) {
    const rows = ["p1", "p2", "p3"].map((k) => { const m = B.meanSd(diffs[k]).mean; return { k, got: m.toFixed(4), want: FIRST_RESULT[k].toFixed(4) }; });
    return { ok: rows.every((r) => r.got === r.want), lines: rows.map((r) => `  ${r.k}: re-flown ${r.got}, first result ${r.want}${r.got === r.want ? "" : "   MISMATCH"}`) };
}
/** The bottom line on P3 by the rule written first: (a) it holds pooled; (b) it does not and its mean minus two se is above the first estimate; (c) otherwise. */
export function bottomLine(p3) {
    if (p3.holds) return "THE MEMORY HELPS MORE IN THE DARK (48 IDS)";
    if (p3.mean - 2 * p3.se > FIRST_RESULT.p3) return "THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE";
    return "P3 IS STILL UNSETTLED";
}
/** The ids at which a mean of -0.05 with standard deviation `sd` reaches p 0.05 by the normal approximation (1.96 sd / 0.05)^2, rounded up: a figure and not a test. */
export const idsNeeded = (sd) => Math.ceil(((1.96 * sd) / 0.05) ** 2);

const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : "n/a"), fp = (v) => (Number.isFinite(v) ? (v < 0.0001 ? v.toExponential(1) : v.toFixed(4)) : "n/a");
const LABELS = [["p1", "P1  settled error, compass lit, no event"], ["p2", "P2  settled error, DARK windows"], ["p3", "P3  dark beyond lit (difference of differences)"]];
function table(title, t) {
    const L = [title, "test                                   |  mean diff | sd     | se     | ids better | exact p"];
    for (const [k, label] of LABELS) { const x = t.tests[k]; L.push(`${label.padEnd(38)} | ${f4(x.mean).padStart(10)} | ${f4(x.sd)} | ${f4(x.se)} | ${(x.better + "/" + x.n).padStart(10)} | ${fp(x.p)}${x.holds ? "   HOLDS" : ""}`); }
    L.push(`VERDICT: ${t.verdict}`);
    return L;
}
/** The report of a result { size, check, sets: { first, fresh, pooled } } as lines; a smoke run (size not the registered one) says so and has no check and no verdict. */
export function reportLines(res) {
    const L = [`paired test of the memory, replication: stateful minus stateless, ${res.ids} ids of ${res.seconds} s in each set (negative = the memory helps); exact two-sided sign-flip over 2^n assignments, counted over the differences rounded to ${QUANTUM.toExponential(0)}`];
    if (!res.registered) { L.push(`SMOKE RUN: ${res.ids} ids of ${res.seconds} s is not the registered ${REGISTERED.ids} of ${REGISTERED.seconds}; no check and no verdict are made`); L.push(...table(`the ${NEW_PREFIX} ids alone`, res.sets.fresh)); return L; }
    L.push("CHECK: the first set, re-flown, against the first result (brain/TANK_PILOTS_WIP.md)", ...res.check.lines);
    if (!res.check.ok) { L.push("THE CHECK FAILED: the code or the tank has changed since the first result; the pooled reading is NOT made"); return L; }
    L.push("", ...table(`POOLED, ${res.sets.pooled.tests.p3.n} ids (THE REGISTERED READING)`, res.sets.pooled), "", ...table(`the ${NEW_PREFIX} ids alone (reported)`, res.sets.fresh), "", ...table(`the ${OLD_PREFIX} ids alone (reported)`, res.sets.first));
    const p3 = res.sets.pooled.tests.p3;
    L.push("", `BOTTOM LINE ON P3: ${bottomLine(p3)}`, `(figure, not a test: a mean of -0.05 with this sd, ${f4(p3.sd)}, reaches p 0.05 at about ${idsNeeded(p3.sd)} ids)`);
    return L;
}

/** The two sets and their tests. `bench` is the flights (pairedBench; a stand-in in the gate). */
export function run({ ids = REGISTERED.ids, seconds = REGISTERED.seconds } = {}, bench = B.pairedBench) {
    const registered = ids === REGISTERED.ids && seconds === REGISTERED.seconds, fresh = bench({ ids, seconds, prefix: NEW_PREFIX }), first = bench({ ids, seconds, prefix: OLD_PREFIX });
    const res = { ids, seconds, registered, check: checkFirst(first.diffs), sets: { fresh: testsOf(fresh.diffs), first: testsOf(first.diffs) } };
    res.sets.pooled = testsOf(pool(first.diffs, fresh.diffs));
    return res;
}

/** The command. `io`: { print, err, bench } for the gate. */
export function main(argv, io = {}) {
    const print = io.print || ((t) => process.stdout.write(t)), err = io.err || console.error, opts = { ...REGISTERED };
    for (let i = 0; i < argv.length; i += 2) {
        const f = argv[i], v = argv[i + 1];
        if (f !== "--ids" && f !== "--seconds") { err(`usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (not understood: ${f})`); return 1; }
        const n = Number(v);
        if (!/^\d+$/.test(v) || (f === "--ids" ? n < 2 || n > 26 : n < 40 || n > 600)) { err(`usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (${f} is a whole number${f === "--ids" ? " from 2 to 26" : " from 40 to 600"}, got ${v})`); return 1; }
        opts[f.slice(2)] = n;
    }
    const res = run(opts, io.bench || B.pairedBench);
    print(reportLines(res).join("\n") + "\n");
    return res.registered && !res.check.ok ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
