// WebGLEngine/tools/ship/takeEvadeLadder.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_LADDER_WIP.md, the gate tools/ship/takeEvadeLadder-selfcheck.mjs)
//   node tools/ship/takeEvadeLadder.mjs smoke                 the 26 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeLadder.mjs dev  [--write]        the DEV read on geometries 114001 to 114048; --write records brain/subEvadeLadderDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeLadder.mjs held --write          the HELD read on geometries 115001 to 115048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeLadderHeld.json exists
// THE QUESTION (brain/SUB_EVADE_LADDER_WIP.md): among the four strong finders, which of league7100's other ten numbers (not its evadeSpeed and evadeTurn) carry its lead over league7001 and over exploit7204, and does the set of ten carry all of it?
// THE ARMS, a comparator c (league7001, exploit7204) at a time, each flown against its own base: LEAD (league7100 over c), GRAFT(g) (c with league7100's numbers of group g, against c), LESION(g) (league7100 with c's numbers of group g, against league7100), ALL (c with all ten of league7100's, against c), LESALL (league7100 with all ten of c's, against league7100): 13 matchups a comparator, 26 in all. The groups, by function: M (searchSpeed, trackSpeed), W (fireRange, aimTol), P (pingAfter, pingEvery, searchPing), L (echoWindow, blindSnr), T (evadeTime).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeLadderDev.json", HELD_FILE = "brain/subEvadeLadderHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 114001, count: 48 }), held: Object.freeze({ first: 115001, count: 48 }) });
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const GROUPS = Object.freeze({ M: Object.freeze(["searchSpeed", "trackSpeed"]), W: Object.freeze(["fireRange", "aimTol"]), P: Object.freeze(["pingAfter", "pingEvery", "searchPing"]), L: Object.freeze(["echoWindow", "blindSnr"]), T: Object.freeze(["evadeTime"]) });
export const GROUP_KEYS = Object.freeze(["M", "W", "P", "L", "T"]);
export const TEN = Object.freeze(GROUP_KEYS.flatMap((g) => GROUPS[g]));
export { decided };

const f3 = (v) => signed(v, 3);

/** The finders as sides: { id: finder } -> a copy of the final theta of the file. */
export const uSideOf = (finders, id) => ({ ...finders.find((f) => f.id === id).final });

/** The 26 matchups: { id, kind, comparator, group (or null), hi: { id, theta }, lo: { id, theta } }, a comparator at a time in the order LEAD, GRAFT M W P L T, LESION M W P L T, ALL, LESALL; the arm (or the leader) is always the first side. */
export function matchupsOf(finders) {
    const out = [], D = uSideOf(finders, DONOR);
    for (const c of COMPARATORS) {
        const C = uSideOf(finders, c), add = (kind, group, hiId, hi, loId, lo) => out.push({ id: group ? `${kind}:${group}:${c}` : `${kind}:${c}`, kind, comparator: c, group, hi: { id: hiId, theta: hi }, lo: { id: loId, theta: lo } });
        add("LEAD", null, `U:${DONOR}`, { ...D }, `U:${c}`, { ...C });
        for (const g of GROUP_KEYS) add("GRAFT", g, `U:${c}+${g}`, graft(C, D, GROUPS[g]), `U:${c}`, { ...C });
        for (const g of GROUP_KEYS) add("LESION", g, `U:${DONOR}-${g}`, graft(D, C, GROUPS[g]), `U:${DONOR}`, { ...D });
        add("ALL", null, `U:${c}+ten`, graft(C, D, TEN), `U:${c}`, { ...C });
        add("LESALL", null, `U:${DONOR}-ten`, graft(D, C, TEN), `U:${DONOR}`, { ...D });
    }
    return out;
}

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus what the checks need: U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `identical` (the two thetas are the same, so the edge is exactly 0). */
export function fly(matchups, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), D = uSideOf(finders, DONOR);
    const rows = matchups.map((m) => ({ ...rowOf({ id: m.id, kind: m.kind, finder: m.comparator }, T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts), geos), comparator: m.comparator, group: m.group, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }));
    return { rows, equal: { edge: T.matchup(side("equal1", D), side("equal2", { ...D }), geos, opts).summary.edge } };
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
    const lesion = (m) => m.kind === "LESION" || m.kind === "LESALL", baseId = (m) => (lesion(m) ? DONOR : m.comparator);
    if (!matchups.every((m) => same(m.lo.theta, fin(baseId(m)))) || !matchups.filter((m) => m.kind === "LEAD").every((m) => same(m.hi.theta, fin(DONOR)))) c.push("a base side is not the finder's final theta of the files");
    const keysOf = (m) => (m.kind === "ALL" || m.kind === "LESALL" ? TEN : GROUPS[m.group]);
    const baseOf = (m) => fin(baseId(m)), donorOf = (m) => fin(lesion(m) ? m.comparator : DONOR);
    if (!matchups.filter((m) => m.kind !== "LEAD").every((m) => same(m.hi.theta, { ...baseOf(m), ...Object.fromEntries(keysOf(m).map((k) => [k, donorOf(m)[k]])) }))) c.push("an arm is not its base with the donor's numbers of the group");
    return c;
}

const label = (n) => (n === COMPARATORS.length ? "BOTH" : n > 0 ? "ONE" : "NONE");

/** R0 to RL3 and the forecast quantities from the 26 rows. */
export function rulesOf(rows) {
    const row = (id) => rows.find((r) => r.id === id), suff = (r) => decided(r) && r.edge > 0, nec = (r) => decided(r) && r.edge < 0, N = COMPARATORS.length;
    const out = { lead: {}, groups: {}, all: {} };
    for (const c of COMPARATORS) { const r = row(`LEAD:${c}`); out.lead[c] = { edge: r.edge, z: r.z, decided: suff(r) }; }
    out.replicates = COMPARATORS.every((c) => out.lead[c].decided);
    for (const g of GROUP_KEYS) {
        const s = COMPARATORS.filter((c) => suff(row(`GRAFT:${g}:${c}`))).length, n = COMPARATORS.filter((c) => nec(row(`LESION:${g}:${c}`))).length;
        out.groups[g] = { sufficient: s, necessary: n, sufficientLabel: label(s), necessaryLabel: label(n) };
    }
    const allS = COMPARATORS.filter((c) => suff(row(`ALL:${c}`))).length, allN = COMPARATORS.filter((c) => nec(row(`LESALL:${c}`))).length;
    out.all = { sufficient: allS, necessary: allN, sufficientLabel: label(allS), necessaryLabel: label(allN) };
    out.rl1 = allS === N && allN === N;
    out.sufficientGroups = GROUP_KEYS.filter((g) => out.groups[g].sufficient === N);
    out.necessaryGroups = GROUP_KEYS.filter((g) => out.groups[g].necessary === N);
    out.headline = allS < N ? "THE TEN ARE NOT THE LEAD" : !out.rl1 ? "NO HEADLINE" : out.sufficientGroups.length === 1 ? `ONE GROUP: ${out.sufficientGroups[0]}` : out.sufficientGroups.length >= 2 ? `SEVERAL GROUPS: ${out.sufficientGroups.join(",")}` : "NO GROUP ALONE";
    out.forecast = {
        rl1: out.rl1, notTheTen: out.headline === "THE TEN ARE NOT THE LEAD", oneGroup: out.headline.startsWith("ONE GROUP"), severalGroups: out.headline.startsWith("SEVERAL GROUPS"), noGroupAlone: out.headline === "NO GROUP ALONE",
        sufficientP: out.sufficientGroups.includes("P"), sufficientL: out.sufficientGroups.includes("L"), sufficientM: out.sufficientGroups.includes("M"), sufficientW: out.sufficientGroups.includes("W"), sufficientT: out.sufficientGroups.includes("T"),
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [];
    L.push(`[takeEvadeLadder] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the donor ${DONOR}, the comparators ${COMPARATORS.join(" and ")}; a matchup is decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size; a GRAFT or ALL is SUFFICIENT when it beats its base decided, a LESION or LESALL NECESSARY when its base beats it decided; groups M ${GROUPS.M.join("+")}, W ${GROUPS.W.join("+")}, P ${GROUPS.P.join("+")}, L ${GROUPS.L.join("+")}, T ${GROUPS.T.join("+")}`);
    for (const c of COMPARATORS) {
        L.push(`  AGAINST ${c} (each arm against its own base; the arm or the leader first)`);
        const lead = rows.find((r) => r.id === `LEAD:${c}`);
        for (const r of rows.filter((x) => x.comparator === c)) {
            const status = r.identical ? "identical" : decided(r) ? (r.edge > 0 ? "decided for the first side" : "decided against the first side") : "not decided", share = r.kind === "GRAFT" || r.kind === "ALL" ? `   share of the lead ${lead.edge === 0 ? "n/a" : f3(r.edge / lead.edge)}` : "";
            L.push(`    ${r.id.padEnd(24)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${status}${share}`);
        }
    }
    L.push("  THE GROUPS (SUFFICIENT and NECESSARY over the two comparators: BOTH, ONE or NONE)");
    for (const g of GROUP_KEYS) L.push(`    ${g} ${GROUPS[g].join("+").padEnd(36)} SUFFICIENT ${rules.groups[g].sufficientLabel.padEnd(4)} NECESSARY ${rules.groups[g].necessaryLabel}`);
    L.push(`    ALL the ten                                 SUFFICIENT ${rules.all.sufficientLabel.padEnd(4)} NECESSARY ${rules.all.necessaryLabel}`);
    const lead = rules.lead, q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  R0 REPLICATES: ${DONOR} beats ${COMPARATORS.map((c) => `${c} (${f3(lead[c].edge)}, z ${lead[c].z.toFixed(1)})`).join(" and ")}, decided: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RL1 THE TEN CARRY THE LEAD: ${rules.rl1 ? "yes" : "NO"} (ALL sufficient for ${rules.all.sufficient} of ${COMPARATORS.length}, LESALL necessary for ${rules.all.necessary} of ${COMPARATORS.length})`);
    L.push(`  RL2 THE HEADLINE: ${rules.headline}`);
    L.push(`  RL3 THE NECESSARY GROUPS: ${rules.necessaryGroups.length ? rules.necessaryGroups.join(",") : "none"}`);
    L.push(`  FORECAST QUANTITIES: RL1 ${yn(q.rl1)}, headline THE TEN ARE NOT THE LEAD ${yn(q.notTheTen)}, headline ONE GROUP ${yn(q.oneGroup)}, headline SEVERAL GROUPS ${yn(q.severalGroups)}, headline NO GROUP ALONE ${yn(q.noGroupAlone)}, group P sufficient ${yn(q.sufficientP)}, group L sufficient ${yn(q.sufficientL)}, group M sufficient ${yn(q.sufficientM)}, group W sufficient ${yn(q.sufficientW)}, group T sufficient ${yn(q.sufficientT)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 114001 to 115048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeLadder.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeLadder: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeLadder: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeLadder: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeLadder: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeLadder: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeLadder: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeLadder: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeLadder: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeLadder: " + L.error); return 2; }
    const finders = [DONOR, ...COMPARATORS].map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(finders);
    const flown = flyIt(matchups, finders, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeLadder.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
