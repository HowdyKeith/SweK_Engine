// WebGLEngine/tools/ship/takeEvadeTop.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_TOP_WIP.md, the gate tools/ship/takeEvadeTop-selfcheck.mjs)
//   node tools/ship/takeEvadeTop.mjs smoke                 the 22 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeTop.mjs dev  [--write]        the DEV read on geometries 130001 to 130096 (96); --write records brain/subEvadeTopDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeTop.mjs held --write          the HELD read on geometries 131001 to 131096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeTopHeld.json exists
// THE QUESTIONS (brain/SUB_EVADE_TOP_WIP.md): A, THE TOP: on the two fast bases does the pingEvery arm keep rising above 25.0 up to the bound of 40, flatten or fall (the paired step from the arm at 25.0 to the arm at 40.0)? B, THE DONOR: does a longer pingEvery (25.0 and 40.0) pay league7100 itself?
// THE MATCHUPS: LEAD (league7100 against each comparator: read at the standard bar of 0.5) and, for each of four bases (F:league7001, F:exploit7204: the finders' final thetas; S:exploit7204: exploit7204 with trackSpeed D; D:league7100: league7100's own final), an ARM at each of the five values (the base with pingEvery v, nothing else moved) against the base: 2 + 4 x 5 = 22. Every row carries its per-geometry values (the mean of the two seats' score differences), so that a STEP (one arm over the next lower value of the same base) is a paired effect on the same geometries.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";
import { vOf, effectOf } from "./takeEvadeAway.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeTopDev.json", HELD_FILE = "brain/subEvadeTopHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 130001, count: 96 }), held: Object.freeze({ first: 131001, count: 96 }) });
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const BASES = Object.freeze(["F:league7001", "F:exploit7204", "S:exploit7204", "D:league7100"]);
export const FAST = Object.freeze(["F:league7001", "F:exploit7204"]), SLOW = "S:exploit7204", DONOR_BASE = "D:league7100";
export const GRID = Object.freeze([16.0, 25.0, 30.0, 35.0, 40.0]), ANCHOR = 25.0, BOUND = 40.0;
export const BAR_EDGE = 0.25;
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2), famOf = (b) => b.split(":")[0], cmpOf = (b) => b.split(":")[1];
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** A base as a theta (a copy): F is the comparator's final theta, S the same with trackSpeed D (league7100's own), D league7100's own final. */
export const dOf = (runs) => runs.find((r) => r.id === DONOR).final.trackSpeed;
export const baseTheta = (runs, base) => { const f = { ...runs.find((r) => r.id === cmpOf(base)).final }; return famOf(base) === "S" ? { ...f, trackSpeed: dOf(runs) } : f; };

/** The 22 matchups: { id, kind ("LEAD" or "ARM"), base (null for LEAD), family, comparator, value (null for LEAD), hi: { id, theta }, lo: { id, theta } }: the two LEADs (league7001, exploit7204), then the five arms (lowest value first) of F:league7001, F:exploit7204, S:exploit7204, D:league7100; the arm (or the leader) is the first side. */
export function matchupsOf(runs) {
    const out = [], D = runs.find((r) => r.id === DONOR).final;
    for (const c of COMPARATORS) out.push({ id: `LEAD:${c}`, kind: "LEAD", base: null, family: null, comparator: c, value: null, hi: { id: `U:${DONOR}`, theta: { ...D } }, lo: { id: `U:${c}`, theta: { ...runs.find((r) => r.id === c).final } } });
    for (const b of BASES) {
        const B = baseTheta(runs, b);
        for (const v of GRID) out.push({ id: `ARM:${b}@${v2(v)}`, kind: "ARM", base: b, family: famOf(b), comparator: cmpOf(b), value: v, hi: { id: `U:${b}@${v2(v)}`, theta: { ...B, pingEvery: v } }, lo: { id: `U:${b}`, theta: { ...B } } });
    }
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === DONOR).final }; return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge, thetas } }. A row carries `v` (the per-geometry values) and `identical` (the two thetas are the same, so the edge is exactly 0). */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs), eq = [side("equal1", e1), side("equal2", e2)];
    const rows = matchups.map((m) => { const mt = T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts); return { ...rowOf({ id: m.id, kind: m.kind, finder: m.comparator }, mt, geos), base: m.base, family: m.family, comparator: m.comparator, value: m.value, v: vOf(mt.fights), identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }; });
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
    if (!matchups.every((m) => (m.kind === "LEAD" ? same(m.hi.theta, fin(DONOR)) && same(m.lo.theta, fin(m.comparator)) : same(m.lo.theta, baseTheta(runs, m.base))))) c.push("a side is not the comparator's final theta of the files (with trackSpeed D, league7100's own, for the slow base) or league7100's own final, or a leader is not league7100's final");
    if (!matchups.every((m) => m.kind !== "ARM" || same(m.hi.theta, { ...baseTheta(runs, m.base), pingEvery: m.value }))) c.push("an arm is not its base with its pingEvery set to its value of the grid and nothing else moved");
    if (!BASES.every((b) => same(matchups.filter((m) => m.base === b).map((m) => m.value), [16, 25, 30, 35, 40]))) c.push("the grid is not exactly 16, 25, 30, 35, 40 on every base");
    if (rows.some((r) => !Array.isArray(r.v) || r.v.length !== count || r.v.some((x) => !Number.isFinite(x)) || Math.abs(mean(r.v) - r.edge) > 1e-9)) c.push("a row's per-geometry values are not as many as the set's geometries or do not average to its edge");
    if (!same(matchups.map((m) => m.id), [...COMPARATORS.map((x) => `LEAD:${x}`), ...BASES.flatMap((b) => GRID.map((v) => `ARM:${b}@${v2(v)}`))])) c.push("the matchups are not the two LEADs and then the five arms of each of the four bases, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

/** The status of an arm at the smaller bar (an edge of BAR_EDGE and a z of FIND_Z in size, in the arm's favour or against it). */
export const statusAt = (r) => (r.identical ? "IDENTICAL" : r.edge >= BAR_EDGE && r.z >= FIND_Z ? "PAYS" : r.edge <= -BAR_EDGE && r.z <= -FIND_Z ? "COSTS" : "NEUTRAL");
/** A STEP (a paired effect) at the same bar: RISES, FALLS or FLAT. */
export const stepOf = (e) => ({ edge: e.edge, se: e.se, z: e.z, status: e.edge >= BAR_EDGE && e.z >= FIND_Z ? "RISES" : e.edge <= -BAR_EDGE && e.z <= -FIND_Z ? "FALLS" : "FLAT" });

/** R0, RA1 to RA3, RB1, RT and the forecast quantities from the 22 rows. */
export function rulesOf(rows) {
    const out = { lead: {}, arms: {}, steps: {}, top: {} };
    for (const c of COMPARATORS) { const r = rows.find((x) => x.id === `LEAD:${c}`); out.lead[c] = { edge: r.edge, z: r.z, decided: decided(r) && r.edge > 0 }; }
    out.replicates = COMPARATORS.every((c) => out.lead[c].decided);
    for (const b of BASES) {
        const arms = rows.filter((r) => r.kind === "ARM" && r.base === b).sort((x, y) => x.value - y.value);
        out.arms[b] = arms.map((r) => ({ value: r.value, edge: r.edge, se: r.se, z: r.z, status: statusAt(r) }));
        out.steps[b] = arms.slice(1).map((r, i) => ({ from: arms[i].value, to: r.value, ...stepOf(effectOf(r.v, arms[i].v)) }));
        out.top[b] = stepOf(effectOf(arms.find((r) => r.value === BOUND).v, arms.find((r) => r.value === ANCHOR).v));
    }
    const arm = (b, v) => out.arms[b].find((a) => a.value === v);
    out.r = FAST.filter((b) => out.top[b].status === "RISES").length; out.f = FAST.filter((b) => out.top[b].status === "FALLS").length;
    out.raHeadline = out.r === FAST.length ? "RISES TO THE BOUND" : out.f === FAST.length ? "FALLS ABOVE 25" : out.r === 0 && out.f === 0 ? "PLATEAU" : "MIXED";
    out.boundPays = FAST.filter((b) => arm(b, BOUND).status === "PAYS").length; out.boundCosts = FAST.filter((b) => arm(b, BOUND).status === "COSTS").length;
    out.dose = Object.fromEntries(BASES.map((b) => { const a = out.arms[b], best = a.reduce((m, x) => (x.edge > m.edge ? x : m), a[0]); return [b, { pays: a.filter((x) => x.status === "PAYS").map((x) => x.value), costs: a.filter((x) => x.status === "COSTS").map((x) => x.value), peak: best.value, peakEdge: best.edge }]; }));
    const dn = [arm(DONOR_BASE, ANCHOR), arm(DONOR_BASE, BOUND)];
    out.p = dn.filter((a) => a.status === "PAYS").length; out.c = dn.filter((a) => a.status === "COSTS").length;
    out.rbHeadline = out.p === 2 ? "DONOR PAYS" : out.p === 1 && out.c === 0 ? "DONOR ONE VALUE" : out.p === 1 && out.c === 1 ? "DONOR MIXED" : out.p === 0 && out.c >= 1 ? "DONOR COSTS" : "DONOR NEUTRAL";
    out.headline = `${out.raHeadline} / ${out.rbHeadline}`;
    const fast25 = mean(FAST.map((b) => arm(b, ANCHOR).edge));
    out.contrast = { donor: dn[0].edge, fast: fast25, ratio: fast25 === 0 ? null : dn[0].edge / fast25 };
    out.costs = BASES.flatMap((b) => out.arms[b].filter((a) => a.status === "COSTS").map((a) => ({ base: b, value: a.value })));
    out.forecast = {
        plateau: out.raHeadline === "PLATEAU", rises: out.raHeadline === "RISES TO THE BOUND", falls: out.raHeadline === "FALLS ABOVE 25", mixed: out.raHeadline === "MIXED",
        boundPaysBoth: out.boundPays === FAST.length, boundCostsSome: out.boundCosts >= 1, peakHigh: FAST.every((b) => out.dose[b].peak >= 30), boundGreatest: FAST.some((b) => out.dose[b].peak === BOUND),
        donorPays: out.rbHeadline === "DONOR PAYS", donorOneValue: out.rbHeadline === "DONOR ONE VALUE", donorMixed: out.rbHeadline === "DONOR MIXED", donorCosts: out.rbHeadline === "DONOR COSTS", donorNeutral: out.rbHeadline === "DONOR NEUTRAL",
        donorSmaller: dn[0].edge < fast25, slowBoth: arm(SLOW, ANCHOR).status === "PAYS" && arm(SLOW, BOUND).status === "PAYS", anyCosts: out.costs.length > 0,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), nm = (a) => (a.length ? a.map(v2).join(", ") : "none"), zf = (z) => (Number.isFinite(z) ? z.toFixed(1) : String(z));
    L.push(`[takeEvadeTop] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the donor ${DONOR}, the comparators ${COMPARATORS.join(" and ")}; an ARM PAYS at an edge of ${BAR_EDGE} and a z of ${FIND_Z} in favour and COSTS at the same bar against; a STEP (the paired effect of one arm over the next lower value of its base) RISES and FALLS at the same bar; LEAD is read at ${FIND_EDGE} and ${FIND_Z}; bases F (the finder's own trackSpeed), S (trackSpeed D, ${DONOR}'s own; read, not ruled) and D (${DONOR} itself); pingEvery values ${GRID.map(v2).join(", ")} (the bound is ${v2(BOUND)})`);
    for (const c of COMPARATORS) { const r = rows.find((x) => x.id === `LEAD:${c}`); L.push(`  LEAD ${r.id.padEnd(24)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${decided(r) ? (r.edge > 0 ? "decided for the first side" : "decided against the first side") : "not decided"}`); }
    for (const b of BASES) {
        L.push(`  BASE ${b} (each arm against ${b}, the arm first)`);
        for (const r of rows.filter((x) => x.base === b)) L.push(`    ${r.id.padEnd(28)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${statusAt(r)}`);
        L.push(`    STEPS (paired, each value over the next lower): ${rules.steps[b].map((s) => `${v2(s.from)}>${v2(s.to)} ${f3(s.edge)} (z ${zf(s.z)}) ${s.status}`).join("; ")}; ${v2(ANCHOR)}>${v2(BOUND)} ${f3(rules.top[b].edge)} +- ${rules.top[b].se.toFixed(3)} (z ${zf(rules.top[b].z)}) ${rules.top[b].status}`);
    }
    const lead = rules.lead, q = rules.forecast, ct = rules.contrast;
    L.push(`  R0 REPLICATES: ${DONOR} beats ${COMPARATORS.map((c) => `${c} (${f3(lead[c].edge)}, z ${lead[c].z.toFixed(1)})`).join(" and ")}, decided: ${rules.replicates ? "yes" : "NO"}`);
    for (const b of FAST) L.push(`  RA1 THE TOP on ${b}: the step ${v2(ANCHOR)} to ${v2(BOUND)} is ${f3(rules.top[b].edge)} (z ${zf(rules.top[b].z)}): ${rules.top[b].status}`);
    L.push(`  RA1 THE TOP: ${rules.r} of ${FAST.length} fast bases RISE, ${rules.f} FALL  ->  ${rules.raHeadline}`);
    L.push(`  RA2 THE BOUND: the arm at ${v2(BOUND)} PAYS on ${rules.boundPays} of ${FAST.length} fast bases and COSTS on ${rules.boundCosts}`);
    for (const b of FAST) L.push(`  RA3 THE DOSE on ${b}: PAYS at ${nm(rules.dose[b].pays)}; COSTS at ${nm(rules.dose[b].costs)}; the peak ${v2(rules.dose[b].peak)} (${f3(rules.dose[b].peakEdge)})`);
    for (const b of [SLOW, DONOR_BASE]) L.push(`  THE DOSE on ${b} (read): PAYS at ${nm(rules.dose[b].pays)}; COSTS at ${nm(rules.dose[b].costs)}; the peak ${v2(rules.dose[b].peak)} (${f3(rules.dose[b].peakEdge)})`);
    L.push(`  RB1 THE DONOR: the arms of ${DONOR_BASE} at ${v2(ANCHOR)} and ${v2(BOUND)}: ${rules.p} PAY, ${rules.c} COST  ->  ${rules.rbHeadline}`);
    L.push(`  THE CONTRAST (reported): the donor's arm at ${v2(ANCHOR)} ${f3(ct.donor)}, the mean of the two fast arms at ${v2(ANCHOR)} ${f3(ct.fast)}, the ratio ${ct.ratio === null ? "n/a" : f3(ct.ratio)}`);
    L.push(`  THE COSTS (reported): ${rules.costs.length ? rules.costs.map((x) => `${x.base} at ${v2(x.value)}`).join("; ") : "none"}`);
    L.push(`  RT THE HEADLINE: ${rules.headline}`);
    L.push(`  FORECAST QUANTITIES: PLATEAU ${yn(q.plateau)}, RISES TO THE BOUND ${yn(q.rises)}, FALLS ABOVE 25 ${yn(q.falls)}, MIXED ${yn(q.mixed)}, the arm at ${v2(BOUND)} pays on both fast bases ${yn(q.boundPaysBoth)}, costs on some fast base ${yn(q.boundCostsSome)}, each fast peak at 30.00 or higher ${yn(q.peakHigh)}, the arm at ${v2(BOUND)} is the greatest on a fast base ${yn(q.boundGreatest)}, DONOR PAYS ${yn(q.donorPays)}, ONE VALUE ${yn(q.donorOneValue)}, MIXED ${yn(q.donorMixed)}, COSTS ${yn(q.donorCosts)}, NEUTRAL ${yn(q.donorNeutral)}, the donor's arm at ${v2(ANCHOR)} is smaller than the fast mean ${yn(q.donorSmaller)}, both of S:exploit7204's arms at ${v2(ANCHOR)} and ${v2(BOUND)} pay ${yn(q.slowBoth)}, some arm costs ${yn(q.anyCosts)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 130001 to 131096). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeTop.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeTop: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeTop: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeTop: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeTop: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeTop: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeTop: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeTop: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeTop: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeTop: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeTop.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
