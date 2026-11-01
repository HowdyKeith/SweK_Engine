// WebGLEngine/tools/ship/subFieldNavStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_FIELD_NAV_WIP.md, the gate is tools/ship/subFieldNavStudy-selfcheck.mjs)
//
// THE STUDY OF FLOW-FIELD WAYPOINTS FOR THE SUBMARINE: flies the three guidance arms of brain/subFieldNav.mjs (straight, field-cell, field-smooth) through a set of obstacle scenarios on the PD autopilot and reads the result against the
// predictions R1 to R5 and the verdict rule that brain/SUB_FIELD_NAV_WIP.md registered before the HELD set was flown.
//   node tools/ship/subFieldNavStudy.mjs --sweep [--seeds N]            the DEV margin sweep of Amendment 1: success by margin, and the margin M* the selection rule picks
//   node tools/ship/subFieldNavStudy.mjs --set dev|held [--margin M] [--seeds N] [--write]
//                                                                         flies the set at M* (default: the amended 12 m; PRIMARY) and, for the held set, also at the registered 6 m (SECONDARY, labelled); prints the tables and the verdict
//                                                                         --write puts every flight (primary and secondary) in brain/subFieldNavHeld.jsonl (held only)
//   node tools/ship/subFieldNavStudy.mjs --set held2 [--margin M] [--seeds N] [--write]
//                                                                         THE ARRIVAL RULE'S SET (seeds 201 to 260, read once): the seven arms (straight, and each field arm plain, +approach, +approach+slow) at the primary margin, the tables and the verdict of the
//                                                                         follow-up in brain/SUB_FIELD_NAV_WIP.md (predictions A1 to A5); --write puts the flights in brain/subFieldNavHeld2.jsonl.  --arrivals adds the arrival arms to a dev run.
// HELD and HELD2 are each read ONCE, by this command, after the library and this gate are sabotaged. Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as N from "../../brain/subFieldNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const OUT = "brain/subFieldNavHeld.jsonl", OUT2 = "brain/subFieldNavHeld2.jsonl";
export const PRIMARY_MARGIN = 12, REGISTERED_MARGIN = N.MARGIN;
export const THRESH = Object.freeze({ r1BlockedMax: 0.25, r1UnblockedMin: 0.9, r2Still: 0.9, r2Current: 0.8, r3Smooth: 1.10, r3Cell: 1.15 });
const FIELD_ARMS = Object.freeze(["field-cell", "field-smooth"]);
export const pilot = (s, t, c) => AP.decide(s, t, c);

/** The median of a list (the mean of the two middle values when the count is even); NaN for an empty list. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const rate = (rs) => rs.filter((r) => r.reached).length / rs.length;   // (a cell is only summarised when it has flights)

/**
 * The numbers of a list of flights: { cells: { kind: { arm: { n, reached, rate, collided, left, timeout, other, noRoute, medianClearance, medianPathRatio (arm / straight on the scenarios both reach; null for straight), pairs } } },
 * straightBlocked: { nav: { blocked: { n, reached }, unblocked: { n, reached } } } }.
 */
export function summarize(runs) {
    const key = (r) => r.kind + "|" + r.seed, cells = {}, straightBy = new Map();
    for (const r of runs) if (r.arm === "straight") straightBy.set(key(r), r);
    for (const kind of N.KINDS) {
        cells[kind] = {};
        for (const arm of N.ALL_ARMS) {
            const rs = runs.filter((r) => r.kind === kind && r.arm === arm);
            if (!rs.length) continue;
            const count = (s) => rs.filter((r) => r.status === s).length, pairs = arm === "straight" ? [] : rs.filter((r) => r.reached && straightBy.has(key(r)) && straightBy.get(key(r)).reached);
            cells[kind][arm] = {
                n: rs.length, reached: rs.filter((r) => r.reached).length, rate: rate(rs), collided: count("collided"), left: count("left"), timeout: count("timeout"),
                other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, noRoute: rs.filter((r) => r.noRoute).length,
                medianClearance: median(rs.map((r) => r.minClearance)), medianPathRatio: arm === "straight" ? null : (pairs.length ? median(pairs.map((r) => r.path / straightBy.get(key(r)).path)) : NaN), pairs: pairs.length,
            };
        }
    }
    const sb = runs.filter((r) => r.arm === "straight" && r.kind === "nav");
    return { cells, straightBlocked: { nav: { blocked: { n: sb.filter((r) => r.blocked).length, reached: sb.filter((r) => r.blocked && r.reached).length }, unblocked: { n: sb.filter((r) => !r.blocked).length, reached: sb.filter((r) => !r.blocked && r.reached).length } } } };
}

/** R1 to R5 and the verdict from a summary (the rule of brain/SUB_FIELD_NAV_WIP.md). R5 is read as: BOTH field arms have a lower success in current than in still water. */
export function judge(sum) {
    const c = sum.cells, sb = sum.straightBlocked.nav, ok = (x) => Number.isFinite(x);
    const r1 = sb.blocked.n > 0 && sb.unblocked.n > 0 ? sb.blocked.reached / sb.blocked.n <= THRESH.r1BlockedMax && sb.unblocked.reached / sb.unblocked.n >= THRESH.r1UnblockedMin : null;
    const arms = {};
    for (const arm of FIELD_ARMS) {
        const still = c.nav && c.nav[arm], cur = c["nav-current"] && c["nav-current"][arm];
        const r2 = !!(still && cur && still.rate >= THRESH.r2Still && cur.rate >= THRESH.r2Current);
        const bound = arm === "field-smooth" ? THRESH.r3Smooth : THRESH.r3Cell, ratio = still ? still.medianPathRatio : NaN;
        arms[arm] = { r2, r3: ok(ratio) && ratio <= bound, ratio, bound };
    }
    const both = FIELD_ARMS.filter((a) => arms[a].r2 && arms[a].r3), r2only = FIELD_ARMS.filter((a) => arms[a].r2);
    const clr = (kind, arm) => c[kind] && c[kind][arm] ? c[kind][arm].medianClearance : NaN;
    const r4 = N.KINDS.every((k) => clr(k, "field-smooth") >= clr(k, "field-cell"));   // (a NaN clearance compares false: a missing number is a miss)
    const r5 = FIELD_ARMS.every((a) => c.nav && c.nav[a] && c["nav-current"] && c["nav-current"][a] && c["nav-current"][a].rate < c.nav[a].rate);
    return { r1, arms, r4, r5, verdict: both.length ? "SUPPORTED" : r2only.length ? "PARTLY SUPPORTED" : "NOT SUPPORTED", supportedBy: both, r2by: r2only };
}

const BASES = Object.freeze(["field-cell", "field-smooth"]);
/**
 * The arrival rule's predictions A1 to A5 and its verdict from a summary of the seven arms (brain/SUB_FIELD_NAV_WIP.md, "FOLLOW-UP: THE ARRIVAL RULE"). Each of A1 to A4 is read for every base arm and both kinds: A1 the `+approach` arm reaches at least as many as its plain arm; A2
 * field-smooth+approach times out in at most 2 of a kind's scenarios; A3 neither rule's arm collides more than its plain arm plus one; A4 `+approach+slow` reaches at least as many as `+approach`. A5 and the verdict: some arrival arm meets the success bars (R2's) and its path bound (R3's).
 */
export function judgeArrival(sum) {
    const c = sum.cells, cell = (kind, arm) => (c[kind] && c[kind][arm]) || null, both = (f) => BASES.every((b) => N.KINDS.every((k) => { const x = cell(k, b), y = cell(k, b + "+approach"), z = cell(k, b + "+approach+slow"); return !!(x && y && z) && f(x, y, z); }));
    const a1 = both((x, y) => y.reached >= x.reached), a3 = both((x, y, z) => y.collided <= x.collided + 1 && z.collided <= x.collided + 1), a4 = both((x, y, z) => z.reached >= y.reached);
    const a2 = N.KINDS.every((k) => { const y = cell(k, "field-smooth+approach"); return !!y && y.timeout <= 2; });
    const arms = {};
    for (const arm of N.ARRIVAL_ARMS) {
        const still = cell("nav", arm), cur = cell("nav-current", arm), smooth = arm.startsWith("field-smooth"), bound = smooth ? THRESH.r3Smooth : THRESH.r3Cell, ratio = still ? still.medianPathRatio : NaN;
        const success = !!(still && cur && still.rate >= THRESH.r2Still && cur.rate >= THRESH.r2Current);
        arms[arm] = { success, ratio, bound, path: Number.isFinite(ratio) && ratio <= bound };
    }
    const full = N.ARRIVAL_ARMS.filter((a) => arms[a].success && arms[a].path), succ = N.ARRIVAL_ARMS.filter((a) => arms[a].success);
    return { a1, a2, a3, a4, arms, verdict: full.length ? "SUPPORTED" : succ.length ? "PARTLY SUPPORTED" : "NOT SUPPORTED", supportedBy: full, successBy: succ };
}
/** The arrival block: A1 to A4 held or missed, the arrival arms against the bars, the verdict. */
export function arrivalText(j) {
    const yn = (v) => (v ? "HELD" : "MISSED"), lines = [`A1 each +approach arm reaches at least as many as its plain arm (both field arms, both kinds): ${yn(j.a1)}`, `A2 field-smooth+approach times out in at most 2 scenarios of each kind: ${yn(j.a2)}`,
        `A3 neither rule collides more than its plain arm plus one (both field arms, both kinds): ${yn(j.a3)}`, `A4 +approach+slow reaches at least as many as +approach (both field arms, both kinds): ${yn(j.a4)}`];
    for (const arm of N.ARRIVAL_ARMS) lines.push(`${arm}: success bars (>= ${pct(THRESH.r2Still)} still and >= ${pct(THRESH.r2Current)} current): ${j.arms[arm].success ? "HELD" : "MISSED"}; path bound (median ratio ${f2(j.arms[arm].ratio)} <= ${j.arms[arm].bound}): ${j.arms[arm].path ? "HELD" : "MISSED"}`);
    lines.push(`A5 / VERDICT: ${j.verdict}${j.supportedBy.length ? " (by " + j.supportedBy.join(", ") + ")" : j.successBy.length ? " (the success bars held for " + j.successBy.join(", ") + ")" : ""}`);
    return lines.join("\n");
}

/** The margin the DEV sweep picks: the highest mean success over the field arms and both kinds; ties go to the smaller margin. `byMargin` is { margin: runs }. Returns { margin, means: { margin: mean } }. */
export function chooseMargin(byMargin) {
    const means = {};
    for (const [m, runs] of Object.entries(byMargin)) { const fr = runs.filter((r) => r.arm !== "straight"); means[m] = fr.length ? fr.filter((r) => r.reached).length / fr.length : NaN; }
    let best = null;
    for (const m of Object.keys(means).map(Number).sort((a, b) => a - b)) if (Number.isFinite(means[m]) && (best === null || means[m] > means[best])) best = m;
    return { margin: best, means };
}

const pct = (v) => (100 * v).toFixed(0) + "%";
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
/** The table of a summary, one line a (kind, arm). */
export function table(sum, title) {
    const lines = [title, "kind         | arm          | reached      | collided left timeout noRoute | median path ratio vs straight (pairs) | median min clearance (m)"];
    for (const kind of N.KINDS) for (const arm of N.ALL_ARMS) {
        const x = sum.cells[kind] && sum.cells[kind][arm]; if (!x) continue;
        lines.push(`${kind.padEnd(12)} | ${arm.padEnd(12)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.noRoute).padStart(7)} | ${(x.medianPathRatio === null ? "-" : `${f2(x.medianPathRatio)} (${x.pairs})`).padEnd(37)} | ${f2(x.medianClearance)}`);
    }
    const sb = sum.straightBlocked.nav;
    lines.push(`straight in still water: blocked ${sb.blocked.reached}/${sb.blocked.n}, unblocked ${sb.unblocked.reached}/${sb.unblocked.n}`);
    return lines.join("\n");
}
/** The verdict block of a judgement. */
export function verdictText(j) {
    const yn = (v) => (v === null ? "n/a (no blocked or no unblocked scenario)" : v ? "HELD" : "MISSED");
    const lines = [`R1 straight fails the blocked, passes the unblocked: ${yn(j.r1)}`];
    for (const arm of FIELD_ARMS) lines.push(`${arm}: R2 (>= ${pct(THRESH.r2Still)} still and >= ${pct(THRESH.r2Current)} current): ${j.arms[arm].r2 ? "HELD" : "MISSED"}; R3 (median path ratio ${f2(j.arms[arm].ratio)} <= ${j.arms[arm].bound}): ${j.arms[arm].r3 ? "HELD" : "MISSED"}`);
    lines.push(`R4 smooth's median clearance >= cell's in both kinds: ${yn(j.r4)}`, `R5 both field arms do worse in current than still: ${yn(j.r5)}`, `VERDICT: ${j.verdict}${j.supportedBy.length ? " (by " + j.supportedBy.join(", ") + ")" : j.r2by.length ? " (R2 held for " + j.r2by.join(", ") + ")" : ""}`);
    return lines.join("\n");
}

/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { sweep: false, set: "dev", margin: PRIMARY_MARGIN, seeds: null, write: false, arrivals: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--sweep") o.sweep = true;
        else if (a === "--write") o.write = true;
        else if (a === "--arrivals") o.arrivals = true;
        else if (a === "--set") { o.set = argv[++i]; if (!N.SETS[o.set]) { err(`subFieldNavStudy: --set needs one of ${Object.keys(N.SETS).join(", ")}`); return 2; } }
        else if (a === "--margin" || a === "--seeds") { const v = Number(argv[++i]); if (!Number.isFinite(v) || v <= 0 || (a === "--seeds" && !Number.isInteger(v))) { err(`subFieldNavStudy: ${a} needs a positive number${a === "--seeds" ? " (a whole one)" : ""}`); return 2; } o[a.slice(2)] = v; }
        else { err(`subFieldNavStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (o.write && (o.sweep || (o.set !== "held" && o.set !== "held2"))) { err("subFieldNavStudy: --write goes with --set held or --set held2 only"); return 2; }
    if (o.arrivals && o.sweep) { err("subFieldNavStudy: --arrivals does not go with --sweep"); return 2; }
    const scenariosOf = (name) => { const seeds = o.seeds ? N.SETS[name].slice(0, o.seeds) : N.SETS[name]; return N.KINDS.flatMap((k) => seeds.map((s) => N.navScenario(s, k))); };
    if (o.sweep) {
        const set = scenariosOf("dev"), byMargin = {};
        for (const m of N.MARGINS) byMargin[m] = N.evaluate(pilot, set, FIELD_ARMS, { margin: m });
        const pick = chooseMargin(byMargin);
        out(`DEV margin sweep (${set.length} scenarios, field arms, both kinds): mean success by margin`);
        for (const m of N.MARGINS) { const fr = byMargin[m]; out(`  ${String(m).padStart(2)} m  ${pct(pick.means[m])}   noRoute ${fr.filter((r) => r.noRoute).length}/${fr.length}`); }
        out(`M* = ${pick.margin} m (the highest mean success; ties to the smaller)`);
        return 0;
    }
    const arrivalMode = o.set === "held2" || o.arrivals, arms = arrivalMode ? N.ALL_ARMS : N.ARMS, file = o.set === "held2" ? OUT2 : OUT;
    const set = scenariosOf(o.set), margins = o.set === "held" ? [o.margin, REGISTERED_MARGIN].filter((m, i, a) => a.indexOf(m) === i) : [o.margin], all = [];
    out(`${o.set.toUpperCase()} set: ${set.length / N.KINDS.length} scenarios of each kind, ${arms.length} arms`);
    margins.forEach((m, idx) => {
        const runs = N.evaluate(pilot, set, arms, { margin: m }), sum = summarize(runs);
        for (const r of runs) all.push({ set: o.set, role: idx === 0 ? "primary" : "as-registered", ...r });
        out(""); out(table(sum, `margin ${m} m -- ${idx === 0 ? "PRIMARY" : "SECONDARY, as first registered (reads nothing into the verdict)"}`)); out(arrivalMode ? arrivalText(judgeArrival(sum)) : verdictText(judge(sum)));
    });
    if (o.write) { writeFile(path.join(ENG, file), all.map((r) => JSON.stringify(r)).join("\n") + "\n"); out(`wrote ${all.length} flights to ${file}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
