// WebGLEngine/tools/ship/takeEvadePing.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_PING_WIP.md, the gate tools/ship/takeEvadePing-selfcheck.mjs)
//   node tools/ship/takeEvadePing.mjs smoke                 the 26 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadePing.mjs dev  [--write]        the DEV read on geometries 128001 to 128096 (96); --write records brain/subEvadePingDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadePing.mjs held --write          the HELD read on geometries 129001 to 129096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadePingHeld.json exists
// THE QUESTION (brain/SUB_EVADE_PING_WIP.md), in three parts at a pre-set bar of 0.25 (z of 2): A, the PIECE: does league7100's pingEvery (8.3047), set on league7001 and on exploit7204, pay? B, the DOSE: over the grid 5.0, 6.5, P, 11.0, 16.0, 25.0 which values pay, and does the largest cost? C, the TRACKER: does it pay on the same two boats with league7100's slow trackSpeed D (3.15) as with their own?
// THE MATCHUPS: LEAD (league7100 against each comparator: read at the standard bar of 0.5) and, for each of four bases (F:league7001, F:exploit7204: the finders' final thetas; S:league7001, S:exploit7204: the same with trackSpeed D), an ARM at each of the six values (the base with pingEvery v, nothing else moved) against the base: 2 + 4 x 6 = 26.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadePingDev.json", HELD_FILE = "brain/subEvadePingHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 128001, count: 96 }), held: Object.freeze({ first: 129001, count: 96 }) });
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const BASES = Object.freeze(["F:league7001", "F:exploit7204", "S:league7001", "S:exploit7204"]);
export const LOW_FIXED = Object.freeze([5.0, 6.5]), HIGH_FIXED = Object.freeze([11.0, 16.0, 25.0]);
export const BAR_EDGE = 0.25;
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2), famOf = (b) => b.split(":")[0], cmpOf = (b) => b.split(":")[1];

/** The six pingEvery values of the grid from the runs: 5.0, 6.5, league7100's own, 11.0, 16.0, 25.0. */
export const gridOf = (runs) => [...LOW_FIXED, runs.find((r) => r.id === DONOR).final.pingEvery, ...HIGH_FIXED];
/** league7100's own trackSpeed of the runs: D. */
export const dOf = (runs) => runs.find((r) => r.id === DONOR).final.trackSpeed;
/** A base as a theta (a copy): F is the comparator's final theta, S the same with trackSpeed D. */
export const baseTheta = (runs, base) => { const f = { ...runs.find((r) => r.id === cmpOf(base)).final }; return famOf(base) === "S" ? { ...f, trackSpeed: dOf(runs) } : f; };

/** The 26 matchups: { id, kind ("LEAD" or "ARM"), base (null for LEAD), family, comparator, value (null for LEAD), isP, hi: { id, theta }, lo: { id, theta } }: the two LEADs (league7001, exploit7204), then the six arms (lowest value first) of F:league7001, F:exploit7204, S:league7001, S:exploit7204; the arm (or the leader) is the first side. */
export function matchupsOf(runs) {
    const out = [], grid = gridOf(runs), P = grid[2], D = runs.find((r) => r.id === DONOR).final;
    for (const c of COMPARATORS) out.push({ id: `LEAD:${c}`, kind: "LEAD", base: null, family: null, comparator: c, value: null, isP: false, hi: { id: `U:${DONOR}`, theta: { ...D } }, lo: { id: `U:${c}`, theta: { ...runs.find((r) => r.id === c).final } } });
    for (const b of BASES) {
        const B = baseTheta(runs, b);
        for (const v of grid) out.push({ id: `ARM:${b}@${v2(v)}`, kind: "ARM", base: b, family: famOf(b), comparator: cmpOf(b), value: v, isP: v === P, hi: { id: `U:${b}@${v2(v)}`, theta: { ...B, pingEvery: v } }, lo: { id: `U:${b}`, theta: { ...B } } });
    }
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === DONOR).final }; return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge, thetas } } (the two thetas the equal flight was flown with, for the gate). A row carries `identical` (the two thetas are the same, so the edge is exactly 0). */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs), eq = [side("equal1", e1), side("equal2", e2)];
    const rows = matchups.map((m) => ({ ...rowOf({ id: m.id, kind: m.kind, finder: m.comparator }, T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts), geos), base: m.base, family: m.family, comparator: m.comparator, value: m.value, isP: m.isP, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }));
    return { rows, equal: { edge: T.matchup(eq[0], eq[1], geos, opts).summary.edge, thetas: [eq[0].theta, eq[1].theta] } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count }. */
export function checksOf({ rows, matchups, equal, G, runs, count }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (id) => runs.find((r) => r.id === id).final;
    if (!matchups.every((m) => (m.kind === "LEAD" ? same(m.hi.theta, fin(DONOR)) && same(m.lo.theta, fin(m.comparator)) : same(m.lo.theta, baseTheta(runs, m.base))))) c.push("a side is not the comparator's final theta of the files (with trackSpeed D, league7100's own, for a slow base) or a leader is not league7100's final");
    if (!matchups.every((m) => m.kind !== "ARM" || same(m.hi.theta, { ...baseTheta(runs, m.base), pingEvery: m.value }))) c.push("an arm is not its base with its pingEvery set to its value of the grid and nothing else moved");
    const grid = gridOf(runs), P = fin(DONOR).pingEvery;
    if (!grid.every((v, i) => i === 0 || v > grid[i - 1]) || !matchups.every((m) => m.kind !== "ARM" || m.isP === (m.value === P)) || !BASES.every((b) => matchups.filter((m) => m.base === b && m.isP).length === 1) || matchups.filter((m) => m.kind !== "ARM").some((m) => m.isP) || !BASES.every((b) => same(matchups.filter((m) => m.base === b).map((m) => m.value), grid))) c.push("the grid is not the six increasing values with league7100's own pingEvery marked on exactly one arm of each base");
    if (!same(matchups.map((m) => m.id), [...COMPARATORS.map((x) => `LEAD:${x}`), ...BASES.flatMap((b) => grid.map((v) => `ARM:${b}@${v2(v)}`))])) c.push("the matchups are not the two LEADs and then the six arms of each of the four bases, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

/** The status of an arm at the smaller bar (an edge of BAR_EDGE and a z of FIND_Z in size, in the arm's favour or against it). */
export const statusAt = (r) => (r.identical ? "IDENTICAL" : r.edge >= BAR_EDGE && r.z >= FIND_Z ? "PAYS" : r.edge <= -BAR_EDGE && r.z <= -FIND_Z ? "COSTS" : "NEUTRAL");
const label = (n) => (n === COMPARATORS.length ? "BOTH" : n > 0 ? "ONE" : "NONE");

/** R0, RE1 to RE5 and the forecast quantities from the 26 rows. */
export function rulesOf(rows) {
    const out = { lead: {}, arms: {} }, N = COMPARATORS.length;
    for (const c of COMPARATORS) { const r = rows.find((x) => x.id === `LEAD:${c}`); out.lead[c] = { edge: r.edge, z: r.z, decided: decided(r) && r.edge > 0 }; }
    out.replicates = COMPARATORS.every((c) => out.lead[c].decided);
    for (const b of BASES) out.arms[b] = rows.filter((r) => r.kind === "ARM" && r.base === b).sort((x, y) => x.value - y.value).map((r) => ({ value: r.value, edge: r.edge, z: r.z, status: statusAt(r), isP: r.isP }));
    const atP = (b) => out.arms[b].find((a) => a.isP), fast = COMPARATORS.map((c) => `F:${c}`), slow = COMPARATORS.map((c) => `S:${c}`);
    out.fastPays = fast.filter((b) => atP(b).status === "PAYS").length; out.piece = label(out.fastPays);
    out.size = { edges: fast.map((b) => atP(b).edge), mean: fast.reduce((s, b) => s + atP(b).edge, 0) / N, shares: COMPARATORS.map((c) => (out.lead[c].edge === 0 ? null : atP(`F:${c}`).edge / out.lead[c].edge)) };
    const grid = out.arms[fast[0]].map((a) => a.value);
    out.dose = Object.fromEntries(fast.map((b) => { const a = out.arms[b], best = a.reduce((m, x) => (x.edge > m.edge ? x : m), a[0]); return [b, { pays: a.filter((x) => x.status === "PAYS").map((x) => x.value), costs: a.filter((x) => x.status === "COSTS").map((x) => x.value), peak: best.value, peakEdge: best.edge }]; }));
    out.common = grid.filter((v) => fast.every((b) => out.arms[b].find((a) => a.value === v).status === "PAYS"));
    out.slowPays = slow.filter((b) => atP(b).status === "PAYS").length;
    out.costs = BASES.flatMap((b) => out.arms[b].filter((a) => a.status === "COSTS").map((a) => ({ base: b, value: a.value })));
    out.headline = out.piece === "NONE" ? "NO PIECE" : out.piece === "ONE" ? "ONE BASE" : out.slowPays === 0 ? "A PIECE, FAST TRACKERS ONLY" : out.slowPays === N ? "A PIECE, SLOW TRACKERS TOO" : "A PIECE, MIXED ON SLOW TRACKERS";
    const top = grid[grid.length - 1], P = atP(fast[0]).value;
    out.forecast = {
        both: out.piece === "BOTH", atLeastOne: out.fastPays >= 1, meanAtLeast25: out.size.mean >= BAR_EDGE, slowNone: out.slowPays === 0,
        fastOnly: out.headline === "A PIECE, FAST TRACKERS ONLY", slowToo: out.headline === "A PIECE, SLOW TRACKERS TOO", mixed: out.headline === "A PIECE, MIXED ON SLOW TRACKERS", oneBase: out.headline === "ONE BASE", noPiece: out.headline === "NO PIECE",
        peakMiddle: fast.every((b) => out.dose[b].peak === P || out.dose[b].peak === 11.0), topCosts: fast.some((b) => out.arms[b].find((a) => a.value === top).status === "COSTS"), anyCosts: out.costs.length > 0,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), nm = (a) => (a.length ? a.map(v2).join(", ") : "none");
    L.push(`[takeEvadePing] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the donor ${DONOR}, the comparators ${COMPARATORS.join(" and ")}; an ARM PAYS at an edge of ${BAR_EDGE} and a z of ${FIND_Z} in favour and COSTS at the same bar against; LEAD is read at ${FIND_EDGE} and ${FIND_Z}; bases F (the finder's own trackSpeed) and S (trackSpeed D, ${DONOR}'s own); pingEvery values ${LOW_FIXED.map(v2).join(", ")}, P (${DONOR}'s own), ${HIGH_FIXED.map(v2).join(", ")}`);
    for (const c of COMPARATORS) { const r = rows.find((x) => x.id === `LEAD:${c}`); L.push(`  LEAD ${r.id.padEnd(24)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${decided(r) ? (r.edge > 0 ? "decided for the first side" : "decided against the first side") : "not decided"}`); }
    for (const b of BASES) {
        L.push(`  BASE ${b} (each arm against ${b}, the arm first)`);
        for (const r of rows.filter((x) => x.base === b)) L.push(`    ${r.id.padEnd(28)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${statusAt(r)}`);
    }
    const lead = rules.lead, q = rules.forecast, sz = rules.size;
    L.push(`  R0 REPLICATES: ${DONOR} beats ${COMPARATORS.map((c) => `${c} (${f3(lead[c].edge)}, z ${lead[c].z.toFixed(1)})`).join(" and ")}, decided: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RE1 THE PIECE: the arm at P PAYS on ${rules.fastPays} of ${COMPARATORS.length} fast bases  ->  ${rules.piece}`);
    L.push(`  RE2 THE SIZE: the arm at P on F:${COMPARATORS[0]} ${f3(sz.edges[0])}, on F:${COMPARATORS[1]} ${f3(sz.edges[1])}; the mean ${f3(sz.mean)}; the shares of the lead ${sz.shares.map((x) => (x === null ? "n/a" : f3(x))).join(" and ")}`);
    for (const b of COMPARATORS.map((c) => `F:${c}`)) L.push(`  RE3 THE DOSE on ${b}: PAYS at ${nm(rules.dose[b].pays)}; COSTS at ${nm(rules.dose[b].costs)}; the peak ${v2(rules.dose[b].peak)} (${f3(rules.dose[b].peakEdge)})`);
    L.push(`  RE3 THE COMMON PAYING VALUES on the fast bases: ${nm(rules.common)}`);
    L.push(`  RE4 THE TRACKER: the arm at P PAYS on ${rules.slowPays} of ${COMPARATORS.length} slow bases`);
    L.push(`  THE COSTS (reported): ${rules.costs.length ? rules.costs.map((x) => `${x.base} at ${v2(x.value)}`).join("; ") : "none"}`);
    L.push(`  RE5 THE HEADLINE: ${rules.headline}`);
    L.push(`  FORECAST QUANTITIES: both fast bases ${yn(q.both)}, at least one ${yn(q.atLeastOne)}, mean at P 0.25 or more ${yn(q.meanAtLeast25)}, no slow base ${yn(q.slowNone)}, FAST TRACKERS ONLY ${yn(q.fastOnly)}, SLOW TRACKERS TOO ${yn(q.slowToo)}, MIXED ${yn(q.mixed)}, ONE BASE ${yn(q.oneBase)}, NO PIECE ${yn(q.noPiece)}, each peak at P or 11.00 ${yn(q.peakMiddle)}, the arm at 25.00 costs on a fast base ${yn(q.topCosts)}, some arm costs ${yn(q.anyCosts)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 128001 to 129096). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadePing.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadePing: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadePing: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadePing: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadePing: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadePing: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadePing: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadePing: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadePing: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadePing: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadePing.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
