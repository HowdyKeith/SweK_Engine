// WebGLEngine/tools/ship/takeEvadeMove.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_MOVE_WIP.md, the gate tools/ship/takeEvadeMove-selfcheck.mjs)
//   node tools/ship/takeEvadeMove.mjs smoke                 the 28 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeMove.mjs dev  [--write]        the DEV read on geometries 116001 to 116048; --write records brain/subEvadeMoveDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeMove.mjs held --write          the HELD read on geometries 117001 to 117048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeMoveHeld.json exists
// THE QUESTION (brain/SUB_EVADE_MOVE_WIP.md): of league7100's two movement numbers (searchSpeed S, trackSpeed K) which carries its lead over league7001 and over exploit7204, and are its three pinging numbers (pingAfter A, pingEvery E, searchPing Q) a second piece?
// THE ARMS, a comparator c at a time, each flown against its own base: LEAD (league7100 over c), GRAFT(u) for u in S K A E Q (c with league7100's number u, against c), LESION(u) (league7100 with c's number u, against league7100), GRAFT(M), GRAFT(P), GRAFT(MP) (c with league7100's numbers of the set: M = S+K, P = A+E+Q, MP = all five, against c): 14 matchups a comparator, 28 in all. Q is the same number (0) in league7100 and league7001, so the two Q arms against league7001 are identical to their bases (an edge of exactly 0, never decided).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { graft, rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeMoveDev.json", HELD_FILE = "brain/subEvadeMoveHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 116001, count: 48 }), held: Object.freeze({ first: 117001, count: 48 }) });
export const DONOR = "league7100", COMPARATORS = Object.freeze(["league7001", "exploit7204"]);
export const UNIT_KEYS = Object.freeze(["S", "K", "A", "E", "Q"]), SET_KEYS = Object.freeze(["M", "P", "MP"]);
export const KEYS = Object.freeze({
    S: Object.freeze(["searchSpeed"]), K: Object.freeze(["trackSpeed"]), A: Object.freeze(["pingAfter"]), E: Object.freeze(["pingEvery"]), Q: Object.freeze(["searchPing"]),
    M: Object.freeze(["searchSpeed", "trackSpeed"]), P: Object.freeze(["pingAfter", "pingEvery", "searchPing"]), MP: Object.freeze(["searchSpeed", "trackSpeed", "pingAfter", "pingEvery", "searchPing"]),
});
export { decided };

const f3 = (v) => signed(v, 3);

/** The finders as sides: { id: finder } -> a copy of the final theta of the file. */
export const uSideOf = (finders, id) => ({ ...finders.find((f) => f.id === id).final });

/** The 28 matchups: { id, kind, comparator, group (or null), hi: { id, theta }, lo: { id, theta } }, a comparator at a time in the order LEAD, GRAFT S K A E Q, LESION S K A E Q, GRAFT M P MP; the arm (or the leader) is always the first side. */
export function matchupsOf(finders) {
    const out = [], D = uSideOf(finders, DONOR);
    for (const c of COMPARATORS) {
        const C = uSideOf(finders, c), add = (kind, group, hiId, hi, loId, lo) => out.push({ id: group ? `${kind}:${group}:${c}` : `${kind}:${c}`, kind, comparator: c, group, hi: { id: hiId, theta: hi }, lo: { id: loId, theta: lo } });
        add("LEAD", null, `U:${DONOR}`, { ...D }, `U:${c}`, { ...C });
        for (const u of UNIT_KEYS) add("GRAFT", u, `U:${c}+${u}`, graft(C, D, KEYS[u]), `U:${c}`, { ...C });
        for (const u of UNIT_KEYS) add("LESION", u, `U:${DONOR}-${u}`, graft(D, C, KEYS[u]), `U:${DONOR}`, { ...D });
        for (const g of SET_KEYS) add("GRAFT", g, `U:${c}+${g}`, graft(C, D, KEYS[g]), `U:${c}`, { ...C });
    }
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (finders) => { const D = uSideOf(finders, DONOR); return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus what the checks need: U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `identical` (the two thetas are the same, so the edge is exactly 0). */
export function fly(matchups, finders, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(finders);
    const rows = matchups.map((m) => ({ ...rowOf({ id: m.id, kind: m.kind, finder: m.comparator }, T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts), geos), comparator: m.comparator, group: m.group, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }));
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
    const lesion = (m) => m.kind === "LESION", baseId = (m) => (lesion(m) ? DONOR : m.comparator);
    if (!matchups.every((m) => same(m.lo.theta, fin(baseId(m)))) || !matchups.filter((m) => m.kind === "LEAD").every((m) => same(m.hi.theta, fin(DONOR)))) c.push("a base side is not the finder's final theta of the files");
    const baseOf = (m) => fin(baseId(m)), donorOf = (m) => fin(lesion(m) ? m.comparator : DONOR);
    if (!matchups.filter((m) => m.kind !== "LEAD").every((m) => same(m.hi.theta, { ...baseOf(m), ...Object.fromEntries(KEYS[m.group].map((k) => [k, donorOf(m)[k]])) }))) c.push("an arm is not its base with the donor's numbers of the unit or set");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

const label = (n) => (n === COMPARATORS.length ? "BOTH" : n > 0 ? "ONE" : "NONE");

/** R0, RM1 to RM3, RP1, RP2 and the forecast quantities from the 28 rows. */
export function rulesOf(rows) {
    const row = (id) => rows.find((r) => r.id === id), suff = (r) => decided(r) && r.edge > 0, nec = (r) => decided(r) && r.edge < 0, N = COMPARATORS.length;
    const out = { lead: {}, units: {}, sets: {}, mpOverM: {} };
    for (const c of COMPARATORS) { const r = row(`LEAD:${c}`); out.lead[c] = { edge: r.edge, z: r.z, decided: suff(r) }; }
    out.replicates = COMPARATORS.every((c) => out.lead[c].decided);
    for (const u of UNIT_KEYS) {
        const s = COMPARATORS.filter((c) => suff(row(`GRAFT:${u}:${c}`))).length, n = COMPARATORS.filter((c) => nec(row(`LESION:${u}:${c}`))).length;
        out.units[u] = { sufficient: s, necessary: n, sufficientLabel: label(s), necessaryLabel: label(n) };
    }
    for (const g of SET_KEYS) { const s = COMPARATORS.filter((c) => suff(row(`GRAFT:${g}:${c}`))).length; out.sets[g] = { sufficient: s, sufficientLabel: label(s) }; }
    for (const c of COMPARATORS) { const m = row(`GRAFT:M:${c}`).edge, mp = row(`GRAFT:MP:${c}`).edge; out.mpOverM[c] = { m, mp, added: mp - m, ratio: m === 0 ? null : mp / m }; }
    out.rm1 = out.sets.M.sufficient === N;
    const kS = out.units.K.sufficient === N, sS = out.units.S.sufficient === N;
    out.headline = !out.rm1 ? "MOVEMENT DOES NOT REPLICATE" : kS && !sS ? "TRACKSPEED" : sS && !kS ? "SEARCHSPEED" : kS && sS ? "BOTH" : "NEITHER ALONE";
    out.necessaryUnits = UNIT_KEYS.filter((u) => out.units[u].necessary === N);
    out.rp1 = out.sets.P.sufficient === N;
    out.pingUnits = ["A", "E"].filter((u) => out.units[u].sufficient === N);
    out.qExploit = suff(row("GRAFT:Q:exploit7204"));
    out.forecast = {
        rm1: out.rm1, trackspeed: out.headline === "TRACKSPEED", searchspeed: out.headline === "SEARCHSPEED", both: out.headline === "BOTH", neitherAlone: out.headline === "NEITHER ALONE", notReplicate: out.headline === "MOVEMENT DOES NOT REPLICATE",
        kNecessary: out.units.K.necessary === N, rp1: out.rp1, eSufficient: out.units.E.sufficient === N, aSufficient: out.units.A.sufficient === N, qExploit: out.qExploit,
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [];
    L.push(`[takeEvadeMove] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the donor ${DONOR}, the comparators ${COMPARATORS.join(" and ")}; a matchup is decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size; a GRAFT is SUFFICIENT when it beats its base decided, a LESION NECESSARY when its base beats it decided; units S ${KEYS.S}, K ${KEYS.K}, A ${KEYS.A}, E ${KEYS.E}, Q ${KEYS.Q}; sets M ${KEYS.M.join("+")}, P ${KEYS.P.join("+")}, MP all five`);
    for (const c of COMPARATORS) {
        L.push(`  AGAINST ${c} (each arm against its own base; the arm or the leader first)`);
        const lead = rows.find((r) => r.id === `LEAD:${c}`);
        for (const r of rows.filter((x) => x.comparator === c)) {
            const status = r.identical ? "identical" : decided(r) ? (r.edge > 0 ? "decided for the first side" : "decided against the first side") : "not decided", share = r.kind === "GRAFT" ? `   share of the lead ${lead.edge === 0 ? "n/a" : f3(r.edge / lead.edge)}` : "";
            L.push(`    ${r.id.padEnd(24)} edge ${f3(r.edge)} +- ${r.se.toFixed(3)} (z ${r.z.toFixed(1)}), ${r.winsX}-${r.draws}-${r.winsY}  seat A ${f3(r.seatA)}, seat B ${f3(r.seatB)}  ${status}${share}`);
        }
    }
    L.push("  THE UNITS (SUFFICIENT and NECESSARY over the two comparators: BOTH, ONE or NONE; Q is the same number in league7100 and league7001, so it is at most ONE)");
    for (const u of UNIT_KEYS) L.push(`    ${u} ${KEYS[u].join("+").padEnd(14)} SUFFICIENT ${rules.units[u].sufficientLabel.padEnd(4)} NECESSARY ${rules.units[u].necessaryLabel}`);
    L.push("  THE SETS (SUFFICIENT over the two comparators)");
    for (const g of SET_KEYS) L.push(`    ${g.padEnd(2)} ${KEYS[g].join("+").padEnd(53)} SUFFICIENT ${rules.sets[g].sufficientLabel}`);
    const lead = rules.lead, q = rules.forecast, yn = (b) => (b ? "yes" : "no");
    L.push(`  WHAT PINGING ADDS TO MOVEMENT (GRAFT(MP) against GRAFT(M), the edges): ${COMPARATORS.map((c) => `${c} ${f3(rules.mpOverM[c].mp)} against ${f3(rules.mpOverM[c].m)} (adds ${f3(rules.mpOverM[c].added)})`).join("; ")}`);
    L.push(`  R0 REPLICATES: ${DONOR} beats ${COMPARATORS.map((c) => `${c} (${f3(lead[c].edge)}, z ${lead[c].z.toFixed(1)})`).join(" and ")}, decided: ${rules.replicates ? "yes" : "NO"}`);
    L.push(`  RM1 THE MOVEMENT SET REPLICATES: ${rules.rm1 ? "yes" : "NO"} (GRAFT(M) sufficient for ${rules.sets.M.sufficient} of ${COMPARATORS.length})`);
    L.push(`  RM2 THE HEADLINE: ${rules.headline}`);
    L.push(`  RM3 THE NECESSARY UNITS: ${rules.necessaryUnits.length ? rules.necessaryUnits.join(",") : "none"}`);
    L.push(`  RP1 PINGING IS A SECOND PIECE: ${rules.rp1 ? "yes" : "NO"} (GRAFT(P) sufficient for ${rules.sets.P.sufficient} of ${COMPARATORS.length})`);
    L.push(`  RP2 THE PINGING UNITS: A and E sufficient: ${rules.pingUnits.length ? rules.pingUnits.join(",") : "none"}; Q's graft onto exploit7204 decided in its favour: ${yn(rules.qExploit)}`);
    L.push(`  FORECAST QUANTITIES: RM1 ${yn(q.rm1)}, headline TRACKSPEED ${yn(q.trackspeed)}, headline SEARCHSPEED ${yn(q.searchspeed)}, headline BOTH ${yn(q.both)}, headline NEITHER ALONE ${yn(q.neitherAlone)}, headline MOVEMENT DOES NOT REPLICATE ${yn(q.notReplicate)}, K necessary for both ${yn(q.kNecessary)}, RP1 ${yn(q.rp1)}, E sufficient ${yn(q.eSufficient)}, A sufficient ${yn(q.aSufficient)}, Q graft onto exploit7204 decided ${yn(q.qExploit)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 116001 to 117048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeMove.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeMove: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeMove: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeMove: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeMove: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeMove: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeMove: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeMove: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeMove: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeMove: " + L.error); return 2; }
    const finders = [DONOR, ...COMPARATORS].map((id) => L.runs.find((r) => r.id === id));   // loadRuns refuses unless every one of the twelve runs exists
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(finders);
    const flown = flyIt(matchups, finders, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count, finders });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeMove.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
