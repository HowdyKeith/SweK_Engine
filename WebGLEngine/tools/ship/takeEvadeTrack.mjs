// WebGLEngine/tools/ship/takeEvadeTrack.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_TRACK_WIP.md, the gate tools/ship/takeEvadeTrack-selfcheck.mjs)
//   node tools/ship/takeEvadeTrack.mjs smoke                 the 29 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeTrack.mjs dev  [--write]        the DEV read on geometries 118001 to 118048; --write records brain/subEvadeTrackDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeTrack.mjs held --write          the HELD read on geometries 119001 to 119048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeTrackHeld.json exists
// THE QUESTION (brain/SUB_EVADE_TRACK_WIP.md), in two parts. A, the ONSET: where does lowering trackSpeed start to pay for a boat that tracks at 4.07 (league7001) or 4.5 (exploit7204): at league7100's own value D (3.15) or already above it? B, the SLOW END: does a slower tracker keep paying to 1.0, flatten, or cost?
// THE ARMS: the grid V = 1.0, 1.5, 2.0, 2.5, 3.0, D, 3.5, 4.0, 4.5 (D is league7100's own trackSpeed of the files); an ARM is a base theta with its trackSpeed set to a value of V and nothing else moved, flown against its base; the bases are league7001 and exploit7204 (the rules) and league7100 (read, not ruled); LEAD is league7100 against each comparator: 2 + 9 + 9 + 9 = 29 matchups. An arm whose value is its base's own (D on league7100, 4.5 on exploit7204) is identical to its base (an edge of exactly 0, never decided).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeTrackDev.json", HELD_FILE = "brain/subEvadeTrackHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 118001, count: 48 }), held: Object.freeze({ first: 119001, count: 48 }) });
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const BASES = Object.freeze([...COMPARATORS, DONOR]);
export const LOW_FIXED = Object.freeze([1.0, 1.5, 2.0, 2.5, 3.0]), HIGH_FIXED = Object.freeze([3.5, 4.0, 4.5]);
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2);

/** The grid of nine trackSpeeds from the finders ([{ id, final }]): 1.0 to 3.0, then league7100's own, then 3.5, 4.0, 4.5. */
export const gridOf = (finders) => [...LOW_FIXED, finders.find((f) => f.id === DONOR).final.trackSpeed, ...HIGH_FIXED];

/** The finders as sides: a copy of the final theta of the file. */
export const uSideOf = (finders, id) => ({ ...finders.find((f) => f.id === id).final });

/** The 29 matchups: { id, kind ("LEAD" or "ARM"), base (the comparator of a LEAD), value (null for LEAD), isD, hi: { id, theta }, lo: { id, theta } }: for each comparator its LEAD then its nine arms (the lowest value first), then the donor's nine arms; the arm (or the leader) is the first side. */
export function matchupsOf(finders) {
    const out = [], grid = gridOf(finders), D = grid[5], arms = (b, B) => grid.forEach((v) => out.push({ id: `ARM:${b}@${v2(v)}`, kind: "ARM", base: b, value: v, isD: v === D, hi: { id: `U:${b}@${v2(v)}`, theta: { ...B, trackSpeed: v } }, lo: { id: `U:${b}`, theta: { ...B } } }));
    for (const c of COMPARATORS) {
        out.push({ id: `LEAD:${c}`, kind: "LEAD", base: c, value: null, isD: false, hi: { id: `U:${DONOR}`, theta: uSideOf(finders, DONOR) }, lo: { id: `U:${c}`, theta: uSideOf(finders, c) } });
        arms(c, uSideOf(finders, c));
    }
    arms(DONOR, uSideOf(finders, DONOR));
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (finders) => { const D = uSideOf(finders, DONOR); return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `identical` (the two thetas are the same, so the edge is exactly 0). */
export function fly(matchups, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(finders);
    const rows = matchups.map((m) => ({ ...rowOf({ id: m.id, kind: m.kind, finder: m.base }, T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts), geos), base: m.base, value: m.value, isD: m.isD, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }));
    return { rows, equal: { edge: T.matchup(side("equal1", e1), side("equal2", e2), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count, finders }. */
export function checksOf({ rows, matchups, equal, G, runs, count, finders }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const fin = (id) => finders.find((f) => f.id === id).final, same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!matchups.every((m) => same(m.lo.theta, fin(m.base))) || !matchups.filter((m) => m.kind === "LEAD").every((m) => same(m.hi.theta, fin(DONOR)))) c.push("a base side is not the finder's final theta of the files");
    if (!matchups.filter((m) => m.kind === "ARM").every((m) => same(m.hi.theta, { ...fin(m.base), trackSpeed: m.value }))) c.push("an arm is not its base with its trackSpeed set to its value of the grid");
    const grid = gridOf(finders);
    if (grid[5] !== fin(DONOR).trackSpeed || !grid.every((v, i) => i === 0 || v > grid[i - 1]) || !BASES.every((b) => same(matchups.filter((m) => m.kind === "ARM" && m.base === b).map((m) => m.value), grid))) c.push("the grid is not the nine increasing values with league7100's own trackSpeed in it, on every base");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

const statusOf = (r) => (r.identical ? "IDENTICAL" : decided(r) && r.edge > 0 ? "PAYS" : decided(r) && r.edge < 0 ? "COSTS" : "NEUTRAL");

/** R0, RD1 to RD4 and the forecast quantities from the 29 rows. */
export function rulesOf(rows) {
    const arms = (b) => rows.filter((r) => r.kind === "ARM" && r.base === b).sort((x, y) => x.value - y.value), N = COMPARATORS.length;
    const out = { lead: {}, arms: {}, peaks: {}, donor: {} };
    for (const c of COMPARATORS) { const r = rows.find((x) => x.id === `LEAD:${c}`); out.lead[c] = { edge: r.edge, z: r.z, decided: decided(r) && r.edge > 0 }; }
    out.replicates = COMPARATORS.every((c) => out.lead[c].decided);
    for (const b of BASES) out.arms[b] = arms(b).map((r) => ({ value: r.value, edge: r.edge, z: r.z, status: statusOf(r), isD: r.isD }));
    const grid = out.arms[COMPARATORS[0]].map((a) => a.value), at = (b, v) => out.arms[b].find((a) => a.value === v);
    out.rd1 = COMPARATORS.every((c) => out.arms[c].find((a) => a.isD).status === "PAYS");
    out.common = grid.filter((v) => COMPARATORS.every((c) => at(c, v).status === "PAYS"));
    out.onset = out.common.length ? Math.max(...out.common) : null;
    const dValue = out.arms[COMPARATORS[0]].find((a) => a.isD).value, low = grid[0], lows = COMPARATORS.map((c) => at(c, low).status);
    out.slowEnd = lows.every((s) => s === "PAYS") ? "PAYS" : lows.every((s) => s === "COSTS") ? "COSTS" : "MIXED";
    out.headline = !out.rd1 ? "NOT REPLICATED" : `ONSET ${out.onset > dValue ? "ABOVE" : "AT"} D / SLOW END ${out.slowEnd}`;
    for (const c of COMPARATORS) { const a = out.arms[c]; const best = a.reduce((m, x) => (x.edge > m.edge ? x : m), a[0]); out.peaks[c] = { value: best.value, edge: best.edge }; }
    out.donor.costs = out.arms[DONOR].filter((a) => a.status === "COSTS").map((a) => a.value);
    out.forecast = {
        rd1: out.rd1, onsetAbove: out.headline.startsWith("ONSET ABOVE"), onsetAt: out.headline.startsWith("ONSET AT"), notReplicated: out.headline === "NOT REPLICATED",
        slowPays: out.slowEnd === "PAYS", slowCosts: out.slowEnd === "COSTS", slowMixed: out.slowEnd === "MIXED",
        pays2: COMPARATORS.every((c) => at(c, 2.0).status === "PAYS"), peakLow: COMPARATORS.every((c) => out.peaks[c].value <= 3.0), donorCosts45: at(DONOR, 4.5).status === "COSTS",
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no");
    L.push(`[takeEvadeTrack] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the donor ${DONOR}, the comparators ${COMPARATORS.join(" and ")}; a matchup is decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size; an ARM PAYS when it beats its base decided and COSTS when its base beats it decided; the grid ${LOW_FIXED.map(v2).join(", ")}, D, ${HIGH_FIXED.map(v2).join(", ")} (D is ${DONOR}'s own trackSpeed)`);
    for (const b of BASES) {
        L.push(b === DONOR ? `  BASE ${b} (read, not ruled: ${b} with that trackSpeed against ${b})` : `  BASE ${b} (each arm against ${b}; the arm or the leader first)`);
        const lead = rows.find((r) => r.id === `LEAD:${b}`);
        for (const r of rows.filter((x) => x.base === b)) {
            const share = r.kind === "ARM" && lead ? `   share of the lead ${lead.edge === 0 ? "n/a" : f3(r.edge / lead.edge)}` : "";
            L.push(`    ${r.id.padEnd(24)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${r.kind === "LEAD" ? (decided(r) ? (r.edge > 0 ? "decided for the first side" : "decided against the first side") : "not decided") : statusOf(r)}${share}`);
        }
    }
    const lead = rules.lead, q = rules.forecast;
    L.push(`  PEAKS (the value of each comparator base's greatest arm edge; reported, not a rule): ${COMPARATORS.map((c) => `${c} ${v2(rules.peaks[c].value)} (${f3(rules.peaks[c].edge)})`).join("; ")}`);
    L.push(`  THE DONOR BASE: league7100 with that trackSpeed is decided against league7100 at: ${rules.donor.costs.length ? rules.donor.costs.map(v2).join(", ") : "none"}`);
    L.push(`  R0 REPLICATES: ${DONOR} beats ${COMPARATORS.map((c) => `${c} (${f3(lead[c].edge)}, z ${lead[c].z.toFixed(1)})`).join(" and ")}, decided: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RD1 THE GRAFT REPLICATES: the arm at D PAYS on ${COMPARATORS.filter((c) => rules.arms[c].find((a) => a.isD).status === "PAYS").length} of ${COMPARATORS.length} comparator bases: ${rules.rd1 ? "yes" : "NO"}`);
    L.push(`  RD2 THE ONSET: the values that PAY on both comparator bases: ${rules.common.length ? rules.common.map(v2).join(", ") : "none"}; the highest: ${rules.onset === null ? "none" : v2(rules.onset)}`);
    L.push(`  RD3 THE SLOW END (the arm at ${v2(rules.arms[COMPARATORS[0]][0].value)}): ${COMPARATORS.map((c) => `${c} ${rules.arms[c][0].status}`).join(", ")}  ->  SLOW END ${rules.slowEnd}`);
    L.push(`  RD4 THE HEADLINE: ${rules.headline}`);
    L.push(`  FORECAST QUANTITIES: RD1 ${yn(q.rd1)}, onset above D ${yn(q.onsetAbove)}, onset at D ${yn(q.onsetAt)}, not replicated ${yn(q.notReplicated)}, slow end pays ${yn(q.slowPays)}, slow end costs ${yn(q.slowCosts)}, slow end mixed ${yn(q.slowMixed)}, the arm at 2.00 pays on both ${yn(q.pays2)}, both peaks at 3.00 or below ${yn(q.peakLow)}, the donor's arm at 4.50 costs ${yn(q.donorCosts45)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 118001 to 119048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeTrack.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeTrack: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeTrack: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeTrack: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeTrack: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeTrack: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeTrack: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeTrack: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeTrack: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeTrack: " + L.error); return 2; }
    const finders = [DONOR, ...COMPARATORS].map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(finders);
    const flown = flyIt(matchups, finders, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeTrack.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
    if (wr) {
        const file = mode === "dev" ? DEV_FILE : HELD_FILE;
        write(file, JSON.stringify({ mode, set: name, first: SETS[name].first, count: SETS[name].count, rules, rows: flown.rows, checks }, null, 1) + "\n"); log(`  written ${file}`);
    }
    return checks.length ? 1 : 0;
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(command(process.argv.slice(2)));
}
