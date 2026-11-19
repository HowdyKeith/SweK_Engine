// WebGLEngine/tools/ship/takeEvadeAbroad.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_ABROAD_WIP.md, the gate tools/ship/takeEvadeAbroad-selfcheck.mjs)
//   node tools/ship/takeEvadeAbroad.mjs smoke                 the 44 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeAbroad.mjs dev  [--write]        the DEV read on geometries 132001 to 132096 (96); --write records brain/subEvadeAbroadDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeAbroad.mjs held --write          the HELD read on geometries 133001 to 133096 (96), flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeAbroadHeld.json exists
// THE QUESTION (brain/SUB_EVADE_ABROAD_WIP.md): does league7100 with pingEvery 40.0 (the bound) and with 25.0 do better or worse than league7100 as it is against each of the fourteen boats that are not league7100?
// THE MATCHUPS: OWN(v): league7100 with pingEvery v against league7100 (the top note's arm); and for each opponent o of the fourteen: BASE(o) (league7100 against o) and ARM(v, o) (league7100 with pingEvery v against o) for each v of 25.0 and 40.0: 2 + 14 x 3 = 44 a set. THE EFFECT of v against o is the PAIRED difference by geometry of ARM(v, o) over BASE(o) (`vOf`, `effectOf`); THE STEP against o is ARM(40, o) over ARM(25, o).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";
import { vOf, effectOf, boatTheta, opponentsOf } from "./takeEvadeAway.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeAbroadDev.json", HELD_FILE = "brain/subEvadeAbroadHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 132001, count: 96 }), held: Object.freeze({ first: 133001, count: 96 }) });
export const HUNTER = "league7100", VALUES = Object.freeze([25.0, 40.0]), LOW = 25.0, TOP = 40.0;
export const OPPONENTS = Object.freeze(opponentsOf(HUNTER));
export const GENERAL_AT = 12, COMMON_AT = 7, BAR_EDGE = 0.25;
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** The 44 matchups: { id, kind ("OWN", "BASE" or "ARM"), opponent (null for OWN), value (null for BASE), hi: { id, theta }, lo: { id, theta } }: the two OWN (league7100 with 25.0 and with 40.0 against league7100), then for each opponent in the order of BOATS its BASE, its ARM at 25.0 and its ARM at 40.0; the hunter (or the arm) is the first side. */
export function matchupsOf(runs, G) {
    const out = [], H = boatTheta(runs, G, HUNTER), arm = (v) => ({ id: `U:${HUNTER}@${v2(v)}`, theta: { ...H, pingEvery: v } });
    for (const v of VALUES) out.push({ id: `OWN:${v2(v)}`, kind: "OWN", opponent: null, value: v, hi: arm(v), lo: { id: `U:${HUNTER}`, theta: { ...H } } });
    for (const o of OPPONENTS) {
        out.push({ id: `BASE:${o}`, kind: "BASE", opponent: o, value: null, hi: { id: `U:${HUNTER}`, theta: { ...H } }, lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
        for (const v of VALUES) out.push({ id: `ARM:${v2(v)}>${o}`, kind: "ARM", opponent: o, value: v, hi: arm(v), lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
    }
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === HUNTER).final }; return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge, thetas } }. A row carries `v` (the per-geometry values), `identical`, and the lower side's evadeSpeed and evadeTurn. */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs), eq = [side("equal1", e1), side("equal2", e2)];
    const rows = matchups.map((m) => { const mt = T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts); return { ...rowOf({ id: m.id, kind: m.kind, finder: HUNTER }, mt, geos), opponent: m.opponent, value: m.value, v: vOf(mt.fights), loSpeed: m.lo.theta.evadeSpeed, loTurn: m.lo.theta.evadeTurn, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }; });
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
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (id) => boatTheta(runs, G, id);
    if (!matchups.every((m) => same(m.lo.theta, m.kind === "OWN" ? fin(HUNTER) : fin(m.opponent)) && (m.kind !== "BASE" || same(m.hi.theta, fin(HUNTER))))) c.push("a side is not the boat's final theta of the files (league7100's for an OWN, the opponent's for a BASE or an ARM), or a BASE's first side is not league7100's final");
    if (!matchups.every((m) => m.kind === "BASE" || same(m.hi.theta, { ...fin(HUNTER), pingEvery: m.value }))) c.push("an arm is not league7100's final with its pingEvery set to its value and nothing else moved");
    if (!same(matchups.filter((m) => m.kind === "OWN").map((m) => m.value), [25, 40]) || !OPPONENTS.every((o) => same(matchups.filter((m) => m.kind === "ARM" && m.opponent === o).map((m) => m.value), [25, 40]))) c.push("the values are not exactly 25 and 40 on every OWN and every opponent");
    if (rows.some((r) => !Array.isArray(r.v) || r.v.length !== count || r.v.some((x) => !Number.isFinite(x)) || Math.abs(mean(r.v) - r.edge) > 1e-9)) c.push("a row's per-geometry values are not as many as the set's geometries or do not average to its edge");
    if (!same(matchups.map((m) => m.id), [...VALUES.map((v) => `OWN:${v2(v)}`), ...OPPONENTS.flatMap((o) => [`BASE:${o}`, ...VALUES.map((v) => `ARM:${v2(v)}>${o}`)])])) c.push("the matchups are not the two OWN and then each opponent's BASE and its ARM at 25 and at 40, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

/** The status of a row (OWN) at the smaller bar. */
export const statusAt = (r) => (r.identical ? "IDENTICAL" : r.edge >= BAR_EDGE && r.z >= FIND_Z ? "PAYS" : r.edge <= -BAR_EDGE && r.z <= -FIND_Z ? "COSTS" : "NEUTRAL");
/** An EFFECT (a paired difference of an arm over its base) at the same bar: HELPS, HURTS or NEUTRAL. */
export const effectStatus = (e) => (e.edge >= BAR_EDGE && e.z >= FIND_Z ? "HELPS" : e.edge <= -BAR_EDGE && e.z <= -FIND_Z ? "HURTS" : "NEUTRAL");
/** A STEP (a paired difference of the arm at 40 over the arm at 25) at the same bar: RISES, FALLS or FLAT. */
export const stepStatus = (e) => (e.edge >= BAR_EDGE && e.z >= FIND_Z ? "RISES" : e.edge <= -BAR_EDGE && e.z <= -FIND_Z ? "FALLS" : "FLAT");
export const labelOf = (n) => (n >= GENERAL_AT ? "GENERAL" : n >= COMMON_AT ? "COMMON" : "NARROW");

/** R0, RA1 to RA4 and the forecast quantities from the 44 rows. */
export function rulesOf(rows) {
    const row = (id) => rows.find((r) => r.id === id), out = { own: {}, opponents: [], reach: {} };
    for (const v of VALUES) { const r = row(`OWN:${v2(v)}`); out.own[v] = { edge: r.edge, se: r.se, z: r.z, status: statusAt(r) }; }
    out.replicates = out.own[TOP].status === "PAYS";
    const pack = (e, st) => ({ edge: e.edge, se: e.se, z: e.z, status: st(e) });
    for (const o of OPPONENTS) {
        const b = row(`BASE:${o}`), a25 = row(`ARM:${v2(LOW)}>${o}`), a40 = row(`ARM:${v2(TOP)}>${o}`);
        out.opponents.push({ opponent: o, speed: b.loSpeed, turn: b.loTurn, baseEdge: b.edge, e25: pack(effectOf(a25.v, b.v), effectStatus), e40: pack(effectOf(a40.v, b.v), effectStatus), step: pack(effectOf(a40.v, a25.v), stepStatus) });
    }
    for (const [v, key] of [[TOP, "e40"], [LOW, "e25"]]) {
        const helps = out.opponents.filter((e) => e[key].status === "HELPS").map((e) => e.opponent), hurts = out.opponents.filter((e) => e[key].status === "HURTS").map((e) => e.opponent);
        out.reach[v] = { helps, hurts, n: helps.length, label: labelOf(helps.length) };
    }
    out.hurtsSomewhere = out.reach[TOP].hurts.length + out.reach[LOW].hurts.length > 0;
    out.common = OPPONENTS.filter((o) => out.reach[TOP].helps.includes(o) && out.reach[LOW].helps.includes(o));
    out.rises = out.opponents.filter((e) => e.step.status === "RISES").map((e) => e.opponent); out.falls = out.opponents.filter((e) => e.step.status === "FALLS").map((e) => e.opponent);
    out.median40 = median(out.opponents.map((e) => e.e40.edge));
    out.headline = `ABROAD: ${v2(TOP)} ${out.reach[TOP].label}, ${v2(LOW)} ${out.reach[LOW].label}${out.hurtsSomewhere ? ", HURTS SOMEWHERE" : ""}`;
    out.forecast = {
        general40: out.reach[TOP].label === "GENERAL", common40: out.reach[TOP].label === "COMMON", narrow40: out.reach[TOP].label === "NARROW", narrow25: out.reach[LOW].label === "NARROW", hurtsSomewhere: out.hurtsSomewhere,
        bothComparators: out.reach[TOP].helps.includes("league7001") && out.reach[TOP].helps.includes("exploit7204"), gHelped: out.reach[TOP].helps.includes("G"), atLeast3: out.reach[TOP].n >= 3,
        ownAboveMedian: out.own[TOP].edge > out.median40, stepRisesSome: out.rises.length >= 1, commonEmpty: out.common.length === 0,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), nm = (a) => (a.length ? a.join(", ") : "none"), zf = (z) => (Number.isFinite(z) ? z.toFixed(1) : String(z));
    const eff = (e) => `${f3(e.edge)} +- ${e.se.toFixed(3)} (z ${zf(e.z)}) ${e.status}`;
    L.push(`[takeEvadeAbroad] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the hunter ${HUNTER} alone, with pingEvery ${v2(TOP)} (the bound) and ${v2(LOW)}, against the fourteen of the fifteen boats that are not itself; BASE is the hunter, an ARM the hunter with that pingEvery; the EFFECT is the paired difference by geometry of the ARM over the BASE and HELPS at an edge of ${BAR_EDGE} and a z of ${FIND_Z} in favour, HURTS at the same bar against; the STEP is the arm at ${v2(TOP)} over the arm at ${v2(LOW)} (RISES, FALLS, FLAT); an OWN PAYS or COSTS at the same bar`);
    L.push(`  HUNTER ${HUNTER}`);
    for (const v of VALUES) { const r = row0(rows, `OWN:${v2(v)}`); L.push(`    ${r.id.padEnd(30)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${statusAt(r)}`); }
    for (const e of rules.opponents) L.push(`    against ${e.opponent.padEnd(11)} (evade ${v2(e.speed)}, ${v2(e.turn)})  BASE ${f3(e.baseEdge)}  EFFECT ${v2(LOW)} ${eff(e.e25)}  EFFECT ${v2(TOP)} ${eff(e.e40)}  STEP ${eff(e.step)}`);
    const q = rules.forecast, own = rules.own;
    L.push(`  R0 REPLICATES: OWN(${v2(TOP)}) is ${f3(own[TOP].edge)} (z ${own[TOP].z.toFixed(1)}), ${own[TOP].status}: ${rules.replicates ? "yes" : "NO"}`);
    for (const v of [TOP, LOW]) L.push(`  RA1 THE REACH OF ${v2(v)}: HELPS against ${rules.reach[v].n} of ${OPPONENTS.length} opponents  ->  ${rules.reach[v].label}  (HELPS: ${nm(rules.reach[v].helps)}; HURTS: ${nm(rules.reach[v].hurts)})`);
    L.push(`  RA2 THE COST: ${rules.hurtsSomewhere ? "HURTS SOMEWHERE" : "none"}`);
    L.push(`  RA3 THE COMMON OPPONENTS (HELPED by both values): ${nm(rules.common)}`);
    L.push(`  RA4 THE HEADLINE: ${rules.headline}`);
    L.push(`  THE STEP (reported): RISES against ${nm(rules.rises)}; FALLS against ${nm(rules.falls)}`);
    L.push(`  THE OWN EFFECTS (reported): ${v2(LOW)} ${f3(own[LOW].edge)} (z ${own[LOW].z.toFixed(1)}), ${v2(TOP)} ${f3(own[TOP].edge)} (z ${own[TOP].z.toFixed(1)}); the median of the ${OPPONENTS.length} effects at ${v2(TOP)} ${f3(rules.median40)}`);
    L.push(`  FORECAST QUANTITIES: GENERAL at ${v2(TOP)} ${yn(q.general40)}, COMMON ${yn(q.common40)}, NARROW ${yn(q.narrow40)}, NARROW at ${v2(LOW)} ${yn(q.narrow25)}, hurts somewhere ${yn(q.hurtsSomewhere)}, league7001 and exploit7204 both helped at ${v2(TOP)} ${yn(q.bothComparators)}, G helped ${yn(q.gHelped)}, at least 3 helped ${yn(q.atLeast3)}, the OWN effect above the median ${yn(q.ownAboveMedian)}, the step rises against some opponent ${yn(q.stepRisesSome)}, no common opponent ${yn(q.commonEmpty)}`);
    return L;
}
const row0 = (rows, id) => rows.find((r) => r.id === id);

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 132001 to 133096). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeAbroad.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeAbroad: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeAbroad: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeAbroad: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeAbroad: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeAbroad: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeAbroad: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeAbroad: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeAbroad: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeAbroad: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs, G);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeAbroad.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
