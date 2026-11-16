// WebGLEngine/tools/ship/takeEvadeReach.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_REACH_WIP.md, the gate tools/ship/takeEvadeReach-selfcheck.mjs)
//   node tools/ship/takeEvadeReach.mjs smoke                 the 28 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeReach.mjs dev  [--write]        the DEV read on geometries 122001 to 122048; --write records brain/subEvadeReachDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeReach.mjs held --write          the HELD read on geometries 123001 to 123048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeReachHeld.json exists
// THE QUESTION (brain/SUB_EVADE_REACH_WIP.md): on how many of 14 bases (the thirteen finders other than league7100, then generation 0, G) does league7100's trackSpeed D (3.15) pay when set on the base, does it cost any base, and the same for 2.5?
// THE ARMS: for each base b two arms flown against b: U(b) with trackSpeed D and U(b) with trackSpeed 2.5, nothing else moved: 28 matchups. R0: the arm at D pays on league7001 and on exploit7204 (the track round's finding).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeReachDev.json", HELD_FILE = "brain/subEvadeReachHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 122001, count: 48 }), held: Object.freeze({ first: 123001, count: 48 }) });
export const DONOR = "league7100", KNOWN = Object.freeze(["league7001", "exploit7204"]);
export const BASE_IDS = Object.freeze(["league7000", "league7001", "league7101", "league7102", "league7103", "league7104", "league7105", "exploit7200", "exploit7201", "exploit7202", "exploit7203", "exploit7204", "exploit7205", "G"]);
export const T_FIXED = 2.5, GENERAL_AT = 12, COMMON_AT = 7;
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2);

/** The two trackSpeeds of every base from the runs: league7100's own (D) then 2.5. */
export const valuesOf = (runs) => [runs.find((r) => r.id === DONOR).final.trackSpeed, T_FIXED];

/** The fourteen bases as { id, kind, theta } in the order of BASE_IDS: a copy of each finder's final theta of the runs ([{ id, kind, final }]), and G (a theta) last. */
export const basesOf = (runs, G) => BASE_IDS.map((id) => (id === "G" ? { id, kind: "G", theta: { ...G } } : { id, kind: runs.find((r) => r.id === id).kind, theta: { ...runs.find((r) => r.id === id).final } }));

/** The 28 matchups: { id: "ARM:base@value", kind: "ARM", base, baseKind, value, isD, hi: { id, theta }, lo: { id, theta } }: for each base its arm at D then its arm at 2.5; the arm is the first side. */
export function matchupsOf(runs, G) {
    const out = [], vals = valuesOf(runs), D = vals[0];
    for (const b of basesOf(runs, G)) for (const v of vals) out.push({ id: `ARM:${b.id}@${v2(v)}`, kind: "ARM", base: b.id, baseKind: b.kind, value: v, isD: v === D, hi: { id: `U:${b.id}@${v2(v)}`, theta: { ...b.theta, trackSpeed: v } }, lo: { id: `U:${b.id}`, theta: { ...b.theta } } });
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === DONOR).final }; return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `identical` (the two thetas are the same, so the edge is exactly 0) and the base's own trackSpeed, evadeSpeed and evadeTurn. */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs);
    const rows = matchups.map((m) => ({ ...rowOf({ id: m.id, kind: m.kind, finder: m.base }, T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts), geos), base: m.base, baseKind: m.baseKind, value: m.value, isD: m.isD, baseTrack: m.lo.theta.trackSpeed, baseSpeed: m.lo.theta.evadeSpeed, baseTurn: m.lo.theta.evadeTurn, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }));
    return { rows, equal: { edge: T.matchup(side("equal1", e1), side("equal2", e2), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count }. */
export function checksOf({ rows, matchups, equal, G, runs, count }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk)) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z))) c.push("a score is non-finite");
    if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const fin = (id) => (id === "G" ? G : runs.find((r) => r.id === id).final), same = (a, b) => JSON.stringify(a) === JSON.stringify(b), vals = valuesOf(runs);
    if (!matchups.every((m) => same(m.lo.theta, fin(m.base)))) c.push("a base side is not its base's theta of the files");
    if (!matchups.every((m) => same(m.hi.theta, { ...fin(m.base), trackSpeed: m.value }))) c.push("an arm is not its base with its trackSpeed set to its value");
    if (!matchups.every((m) => m.isD === (m.value === vals[0])) || !BASE_IDS.every((b) => same(matchups.filter((m) => m.base === b).map((m) => m.value), vals)) || !(vals[0] > T_FIXED)) c.push("an arm's value is not league7100's own trackSpeed (marked D) or 2.5, once each on every base");
    if (!same(matchups.map((m) => m.base), BASE_IDS.flatMap((b) => [b, b]))) c.push("the bases are not the thirteen finders other than league7100 and G, two arms each, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

const statusOf = (r) => (r.identical ? "IDENTICAL" : decided(r) && r.edge > 0 ? "PAYS" : decided(r) && r.edge < 0 ? "COSTS" : "NEUTRAL");
const labelOf = (n) => (n >= GENERAL_AT ? "GENERAL" : n >= COMMON_AT ? "COMMON" : "NARROW");

/** R0, RR1 to RR4 and the forecast quantities from the 28 rows. */
export function rulesOf(rows) {
    const out = { at: { D: [], T: [] } };
    for (const b of BASE_IDS) for (const key of ["D", "T"]) { const r = rows.find((x) => x.base === b && (key === "D" ? x.isD : !x.isD)); out.at[key].push({ base: b, kind: r.baseKind, value: r.value, edge: r.edge, z: r.z, status: statusOf(r) }); }
    const st = (key, b) => out.at[key].find((a) => a.base === b).status, list = (key, s) => out.at[key].filter((a) => a.status === s).map((a) => a.base);
    out.replicates = KNOWN.every((b) => st("D", b) === "PAYS");
    out.nD = list("D", "PAYS").length; out.nT = list("T", "PAYS").length;
    out.labelD = labelOf(out.nD); out.labelT = labelOf(out.nT);
    out.costsD = list("D", "COSTS"); out.costsT = list("T", "COSTS");
    out.notPayingD = BASE_IDS.filter((b) => st("D", b) !== "PAYS");
    out.tOnly = BASE_IDS.filter((b) => st("T", b) === "PAYS" && st("D", b) !== "PAYS"); out.dOnly = BASE_IDS.filter((b) => st("D", b) === "PAYS" && st("T", b) !== "PAYS");
    out.headline = `REACH ${out.labelD}${out.costsD.length ? ", COSTS SOMEWHERE" : ""} / 2.5 ${out.labelT}`;
    out.forecast = { general: out.labelD === "GENERAL", common: out.labelD === "COMMON", narrow: out.labelD === "NARROW", costsSomewhere: out.costsD.length > 0, generalT: out.labelT === "GENERAL", tAtLeastD: out.nT >= out.nD, gPays: st("D", "G") === "PAYS", l7103Pays: st("D", "league7103") === "PAYS" };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), nm = (a) => (a.length ? a.join(", ") : "none");
    L.push(`[takeEvadeReach] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; ${BASE_IDS.length} bases (the thirteen finders other than ${DONOR}, then G), two arms each: the base with trackSpeed D (${DONOR}'s own) and with ${v2(T_FIXED)}, flown against the base; a matchup is decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size; an ARM PAYS when it beats its base decided and COSTS when its base beats it decided`);
    for (const b of BASE_IDS) {
        const rs = rows.filter((r) => r.base === b);
        L.push(`  BASE ${b} (${rs[0].baseKind}; trackSpeed ${v2(rs[0].baseTrack)}, evadeSpeed ${v2(rs[0].baseSpeed)}, evadeTurn ${v2(rs[0].baseTurn)}; each arm against ${b}, the arm first)`);
        for (const r of rs) L.push(`    ${r.id.padEnd(26)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${statusOf(r)}`);
    }
    const at = (key, b) => rules.at[key].find((a) => a.base === b), q = rules.forecast;
    L.push(`  R0 REPLICATES: the arm at D against ${KNOWN.map((b) => `${b} (${f3(at("D", b).edge)}, z ${at("D", b).z.toFixed(1)}, ${at("D", b).status})`).join(" and ")}: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RR1 THE REACH AT D: PAYS on ${rules.nD} of ${BASE_IDS.length} bases  ->  ${rules.labelD}`);
    L.push(`  RR2 THE COST AT D: ${nm(rules.costsD)}`);
    L.push(`  RR3 THE REACH AT ${v2(T_FIXED)}: PAYS on ${rules.nT} of ${BASE_IDS.length} bases  ->  ${rules.labelT} (costs on: ${nm(rules.costsT)})`);
    L.push(`  NOT PAYING AT D (reported): ${nm(rules.notPayingD)}; PAYS AT ${v2(T_FIXED)} BUT NOT AT D: ${nm(rules.tOnly)}; PAYS AT D BUT NOT AT ${v2(T_FIXED)}: ${nm(rules.dOnly)}`);
    L.push(`  RR4 THE HEADLINE: ${rules.headline}`);
    L.push(`  FORECAST QUANTITIES: general at D ${yn(q.general)}, common at D ${yn(q.common)}, narrow at D ${yn(q.narrow)}, costs somewhere at D ${yn(q.costsSomewhere)}, general at ${v2(T_FIXED)} ${yn(q.generalT)}, ${v2(T_FIXED)} pays on at least as many as D ${yn(q.tAtLeastD)}, D pays on G ${yn(q.gPays)}, D pays on league7103 ${yn(q.l7103Pays)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 122001 to 123048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeReach.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeReach: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeReach: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeReach: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeReach: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeReach: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeReach: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeReach: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeReach: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeReach: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs, G);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeReach.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
