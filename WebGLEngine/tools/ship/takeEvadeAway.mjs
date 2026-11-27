// WebGLEngine/tools/ship/takeEvadeAway.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/SUB_EVADE_AWAY_WIP.md, the gate tools/ship/takeEvadeAway-selfcheck.mjs)
//   node tools/ship/takeEvadeAway.mjs smoke                 the 87 matchups on geometries 1 to 4; never recorded, free to read: the command runs
//   node tools/ship/takeEvadeAway.mjs dev  [--write]        the DEV read on geometries 124001 to 124048; --write records brain/subEvadeAwayDev.json once; DEV decides whether HELD is spent (rule R0)
//   node tools/ship/takeEvadeAway.mjs held --write          the HELD read on geometries 125001 to 125048, flown ONCE: refuses without a recorded DEV that replicates and lists no failed check, refuses without --write, refuses if brain/subEvadeAwayHeld.json exists
// THE QUESTION (brain/SUB_EVADE_AWAY_WIP.md): does league7100's trackSpeed D (3.15), set on league7001, exploit7200 and exploit7204 (the hunters that gain against their own copy), change their result against the OTHER boats (the fourteen of the fifteen boats that are not the hunter)?
// THE MATCHUPS: for each hunter h: OWN (U(h) with trackSpeed D against U(h): the reach read's arm) and, for each opponent o, BASE (U(h) against U(o)) and SLOW (U(h) with trackSpeed D against U(o)): 29 a hunter, 87 a set. THE EFFECT against an opponent is the PAIRED difference by geometry of SLOW over BASE: per geometry the mean of the two seats' (X's score less Y's) (`vOf`), the difference of the two, its mean, standard error and z (`effectOf`).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "../../brain/subTournament.mjs";
import * as TA from "../../brain/subTactics.mjs";
import { loadRuns, decided, signed, FIND_EDGE, FIND_Z } from "./takeSubLeague.mjs";
import { rowOf } from "./takeEvadeTurn.mjs";

const ENG = fileURLToPath(new URL("../../", import.meta.url));
export const DEV_FILE = "brain/subEvadeAwayDev.json", HELD_FILE = "brain/subEvadeAwayHeld.json";
export const SETS = Object.freeze({ smoke: Object.freeze({ first: 1, count: 4 }), dev: Object.freeze({ first: 124001, count: 48 }), held: Object.freeze({ first: 125001, count: 48 }) });
export const DONOR = "league7100", HUNTERS = Object.freeze(["league7001", "exploit7200", "exploit7204"]);
export const BOATS = Object.freeze(["league7000", "league7001", "league7100", "league7101", "league7102", "league7103", "league7104", "league7105", "exploit7200", "exploit7201", "exploit7202", "exploit7203", "exploit7204", "exploit7205", "G"]);
export const GENERAL_AT = 12, COMMON_AT = 7;
export { decided };

const f3 = (v) => signed(v, 3), v2 = (v) => v.toFixed(2);
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sdOf = (xs) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };

/** The per-geometry values of a list of fights (two a geometry, seat A then seat B): the mean of the two seats' (X's score less Y's). */
export function vOf(fights) {
    if (!fights.length || fights.length % 2) throw new Error(`vOf(): ${fights.length} fights (two per geometry expected)`);
    const v = []; for (let i = 0; i < fights.length / 2; i++) v.push(((fights[2 * i].sx - fights[2 * i].sy) + (fights[2 * i + 1].sx - fights[2 * i + 1].sy)) / 2);
    return v;
}

/** The PAIRED effect of an arm over its base on the same geometries: { edge, se, z, n } of the differences arm less base (z is 0 when edge and se are 0, and infinite with the sign of the edge when only se is 0). */
export function effectOf(vArm, vBase) {
    if (vArm.length !== vBase.length || !vArm.length) throw new Error(`effectOf(): ${vArm.length} and ${vBase.length} geometries, not the same`);
    const d = vArm.map((x, i) => x - vBase[i]), n = d.length, edge = mean(d), se = sdOf(d) / Math.sqrt(n);
    return { edge, se, z: se > 0 ? edge / se : edge > 0 ? Infinity : edge < 0 ? -Infinity : 0, n };
}

/** The boats' thetas: a copy of the final theta of each finder of the runs, and G (a theta). */
export const boatTheta = (runs, G, id) => (id === "G" ? { ...G } : { ...runs.find((r) => r.id === id).final });
/** The fourteen opponents of a hunter: the fifteen boats but itself, in the order of BOATS. */
export const opponentsOf = (h) => BOATS.filter((o) => o !== h);
/** league7100's own trackSpeed of the runs: D. */
export const dOf = (runs) => runs.find((r) => r.id === DONOR).final.trackSpeed;

/** The 87 matchups: { id, kind ("OWN", "BASE" or "SLOW"), hunter, opponent (null for OWN), hi: { id, theta }, lo: { id, theta } }, a hunter at a time in the order of HUNTERS: its OWN, then for each opponent its BASE and its SLOW; the hunter (or the slowed hunter) is the first side. */
export function matchupsOf(runs, G) {
    const out = [], D = dOf(runs);
    for (const h of HUNTERS) {
        const H = boatTheta(runs, G, h), slow = { ...H, trackSpeed: D };
        out.push({ id: `OWN:${h}`, kind: "OWN", hunter: h, opponent: null, hi: { id: `U:${h}@D`, theta: { ...slow } }, lo: { id: `U:${h}`, theta: { ...H } } });
        for (const o of opponentsOf(h)) {
            out.push({ id: `BASE:${h}>${o}`, kind: "BASE", hunter: h, opponent: o, hi: { id: `U:${h}`, theta: { ...H } }, lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
            out.push({ id: `SLOW:${h}>${o}`, kind: "SLOW", hunter: h, opponent: o, hi: { id: `U:${h}@D`, theta: { ...slow } }, lo: { id: `O:${o}`, theta: boatTheta(runs, G, o) } });
        }
    }
    return out;
}

/** The two sides of the equal-thetas flight: U(league7100) and a copy of it (their edge against each other is exactly 0). */
export const equalPair = (runs) => { const D = { ...runs.find((r) => r.id === DONOR).final }; return [D, { ...D }]; };

/** Flies the matchups on a set ("smoke", "dev" or "held"), plus U(league7100) against a copy of itself (`equal`). Returns { rows, equal: { edge } }. A row carries `v` (the per-geometry values), `identical`, and the lower side's evadeSpeed and evadeTurn. */
export function fly(matchups, runs, setName, opts = {}) {
    const geos = T.geometries(SETS[setName].count, SETS[setName].first), side = (id, theta) => T.makeSide(id, { theta }), [e1, e2] = equalPair(runs);
    const rows = matchups.map((m) => { const mt = T.matchup(side(m.hi.id, m.hi.theta), side(m.lo.id, m.lo.theta), geos, opts); return { ...rowOf({ id: m.id, kind: m.kind, finder: m.hunter }, mt, geos), hunter: m.hunter, opponent: m.opponent, v: vOf(mt.fights), loSpeed: m.lo.theta.evadeSpeed, loTurn: m.lo.theta.evadeTurn, identical: JSON.stringify(m.hi.theta) === JSON.stringify(m.lo.theta) }; });
    return { rows, equal: { edge: T.matchup(side("equal1", e1), side("equal2", e2), geos, opts).summary.edge } };
}

/** The checks that VOID the read, by name and not weighed; every one is an identity or a file's own number. ctx { rows, matchups, equal, G, runs, count }. */
export function checksOf({ rows, matchups, equal, G, runs, count }) {
    const c = [];
    if (rows.some((r) => r.flew !== 2 * count || !r.seedsOk || (r.v !== undefined && r.v.length !== count))) c.push("a matchup did not fly the same geometries");
    if (rows.some((r) => !Number.isFinite(r.edge) || !Number.isFinite(r.z) || (r.v || []).some((x) => !Number.isFinite(x)))) c.push("a score is non-finite");
    if (matchups.some((m) => [m.hi, m.lo].some((s) => TA.THETA_NAMES.some((k) => TA.clampTheta(s.theta)[k] !== s.theta[k])))) c.push("a side has a theta that clampTheta changes");
    if (runs.some((r) => JSON.stringify(r.gen0) !== JSON.stringify(G))) c.push("a run's generation 0 is not G");
    if (equal.edge !== 0) c.push(`two equal thetas have an edge of ${equal.edge} against each other, not exactly 0`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), D = dOf(runs), fin = (id) => boatTheta(runs, G, id);
    const want = (m) => (m.kind === "OWN" ? [{ ...fin(m.hunter), trackSpeed: D }, fin(m.hunter)] : m.kind === "BASE" ? [fin(m.hunter), fin(m.opponent)] : [{ ...fin(m.hunter), trackSpeed: D }, fin(m.opponent)]);
    if (!matchups.every((m) => { const [h, l] = want(m); return same(m.hi.theta, h) && same(m.lo.theta, l); })) c.push("a side is not the boat's theta of the files, or the hunter with trackSpeed D and nothing else moved");
    const seq = (h) => ["OWN:" + h, ...opponentsOf(h).flatMap((o) => [`BASE:${h}>${o}`, `SLOW:${h}>${o}`])];
    if (!same(matchups.map((m) => m.id), HUNTERS.flatMap(seq))) c.push("the matchups are not each hunter's OWN and its BASE and SLOW against the fourteen other boats, in order");
    if (rows.some((r) => r.identical && r.edge !== 0)) c.push("an identical arm has an edge other than exactly 0");
    return c;
}

const statusOf = (r) => (r.identical ? "IDENTICAL" : decided(r) && r.edge > 0 ? "PAYS" : decided(r) && r.edge < 0 ? "COSTS" : "NEUTRAL");
const effectStatus = (e) => (decided(e) && e.edge > 0 ? "HELPS" : decided(e) && e.edge < 0 ? "HURTS" : "NEUTRAL");
const labelOf = (n) => (n >= GENERAL_AT ? "GENERAL" : n >= COMMON_AT ? "COMMON" : "NARROW");

/** R0, RA1 to RA4 and the forecast quantities from the 87 rows. */
export function rulesOf(rows) {
    const row = (id) => rows.find((r) => r.id === id), out = { hunters: {} };
    out.replicates = HUNTERS.every((h) => { const r = row(`OWN:${h}`); return decided(r) && r.edge > 0; });
    for (const h of HUNTERS) {
        const effects = opponentsOf(h).map((o) => { const b = row(`BASE:${h}>${o}`), s = row(`SLOW:${h}>${o}`), e = effectOf(s.v, b.v); return { opponent: o, baseEdge: b.edge, slowEdge: s.edge, edge: e.edge, se: e.se, z: e.z, status: effectStatus(e), speed: b.loSpeed, turn: b.loTurn }; });
        const helps = effects.filter((e) => e.status === "HELPS").map((e) => e.opponent), hurts = effects.filter((e) => e.status === "HURTS").map((e) => e.opponent);
        out.hunters[h] = { own: { edge: row(`OWN:${h}`).edge, z: row(`OWN:${h}`).z }, effects, helps, hurts, n: helps.length, label: labelOf(helps.length) };
    }
    const st = (h, o) => out.hunters[h].effects.find((e) => e.opponent === o).status, met = (o) => HUNTERS.filter((h) => h !== o);
    out.hurtsSomewhere = HUNTERS.some((h) => out.hunters[h].hurts.length > 0);
    out.common = BOATS.filter((o) => met(o).every((h) => st(h, o) === "HELPS"));
    out.headline = `AWAY: ${HUNTERS.map((h) => `${h} ${out.hunters[h].label}`).join(", ")}${out.hurtsSomewhere ? ", HURTS SOMEWHERE" : ""}`;
    out.forecast = {
        allNarrow: HUNTERS.every((h) => out.hunters[h].label === "NARROW"), someGeneral: HUNTERS.some((h) => out.hunters[h].label === "GENERAL"), hurtsSomewhere: out.hurtsSomewhere,
        l7100Common: out.common.includes("league7100"), strongCommon: HUNTERS.every((o) => out.common.includes(o)), gNever: HUNTERS.every((h) => st(h, "G") !== "HELPS"), l7103Hurt: HUNTERS.some((h) => st(h, "league7103") === "HURTS"),
    };
    return out;
}

/** The report of a read, one string a line. */
export function reportLines(rows, rules, name) {
    const S = SETS[name], L = [], yn = (b) => (b ? "yes" : "no"), nm = (a) => (a.length ? a.join(", ") : "none");
    L.push(`[takeEvadeAway] ${name} read: geometries ${S.first} to ${S.first + S.count - 1}, both seats (${2 * S.count} duels a matchup); ${rows.length} matchups; the hunters ${HUNTERS.join(", ")}, each against the fourteen of the fifteen boats that are not itself; BASE is the hunter, SLOW the hunter with trackSpeed D (${DONOR}'s own); the EFFECT is the paired difference by geometry of SLOW over BASE, decided at an edge of ${FIND_EDGE} and a z of ${FIND_Z} in size`);
    for (const h of HUNTERS) {
        const own = rows.find((r) => r.id === `OWN:${h}`);
        L.push(`  HUNTER ${h}`);
        L.push(`    ${own.id.padEnd(30)} edge ${f3(own.edge)} +- ${own.se.toFixed(3)} (z ${own.z.toFixed(1)}), ${own.winsX}-${own.draws}-${own.winsY}  seat A ${f3(own.seatA)}, seat B ${f3(own.seatB)}  ${statusOf(own)}`);
        for (const e of rules.hunters[h].effects) L.push(`    against ${e.opponent.padEnd(11)} (evade ${v2(e.speed)}, ${v2(e.turn)})  BASE ${f3(e.baseEdge)}  SLOW ${f3(e.slowEdge)}  EFFECT ${f3(e.edge)} +- ${e.se.toFixed(3)} (z ${e.z.toFixed(1)})  ${e.status}`);
    }
    const q = rules.forecast;
    L.push(`  R0 REPLICATES: OWN is decided for ${HUNTERS.map((h) => `${h} (${f3(rules.hunters[h].own.edge)}, z ${rules.hunters[h].own.z.toFixed(1)})`).join(", ")}: ${rules.replicates ? "yes" : "NO"}`);
    for (const h of HUNTERS) L.push(`  RA1 THE REACH OF ${h}: HELPS against ${rules.hunters[h].n} of ${rules.hunters[h].effects.length} opponents  ->  ${rules.hunters[h].label}  (HURTS against: ${nm(rules.hunters[h].hurts)})`);
    L.push(`  RA2 THE COST: ${rules.hurtsSomewhere ? "HURTS SOMEWHERE" : "none"}`);
    L.push(`  RA3 THE COMMON OPPONENTS (HELPS every hunter that meets them): ${nm(rules.common)}`);
    L.push(`  RA4 THE HEADLINE: ${rules.headline}`);
    L.push(`  FORECAST QUANTITIES: all three NARROW ${yn(q.allNarrow)}, some GENERAL ${yn(q.someGeneral)}, hurts somewhere ${yn(q.hurtsSomewhere)}, league7100 common ${yn(q.l7100Common)}, the strong three common ${yn(q.strongCommon)}, G helped by none ${yn(q.gNever)}, league7103 hurt ${yn(q.l7103Hurt)}`);
    return L;
}

const readJson = (f) => (fs.existsSync(ENG + f) ? JSON.parse(fs.readFileSync(ENG + f, "utf8")) : null);

/** The command: argv (after the program), io { log, exists, write, read, fly, devSet, heldSet } (defaults: the console and the file system; `read(path)` gives parsed JSON or null; `fly` replaces the flying and `devSet` / `heldSet` name a smaller set to fly in the DEV / HELD mode, all for the gate, which never flies 124001 to 125048). Returns the exit code. */
export function command(argv, io = {}) {
    const log = io.log || ((s) => console.log(s)), exists = io.exists || ((f) => fs.existsSync(ENG + f)), write = io.write || ((f, s) => fs.writeFileSync(ENG + f, s)), read = io.read || readJson, flyIt = io.fly || fly;
    const mode = argv[0];
    if (mode !== "smoke" && mode !== "dev" && mode !== "held") { log("usage: takeEvadeAway.mjs smoke | dev [--write] | held --write"); return 2; }
    for (const a of argv.slice(1)) if (a !== "--write") { log(`takeEvadeAway: unknown argument ${a}`); return 2; }
    const wr = argv.includes("--write");
    if (mode === "smoke" && wr) { log("takeEvadeAway: smoke is never recorded"); return 2; }
    if (mode === "dev" && wr && exists(DEV_FILE)) { log(`takeEvadeAway: ${DEV_FILE} exists; DEV is recorded once and a second record is refused`); return 2; }
    if (mode === "held" && !wr && !io.heldSet) { log("takeEvadeAway: the HELD set is read once and the read is recorded; run held with --write"); return 2; }
    if (mode === "held" && wr && exists(HELD_FILE)) { log(`takeEvadeAway: ${HELD_FILE} exists; the HELD set is read once and a second read is refused`); return 2; }
    if (mode === "held") {
        const dev = read(DEV_FILE);
        if (!dev) { log(`takeEvadeAway: ${DEV_FILE} is missing; HELD is flown only after DEV is recorded`); return 2; }
        if (dev.set !== "dev" || !dev.rules || dev.rules.replicates !== true) { log("takeEvadeAway: DEV did not replicate (R0) or is not a DEV record; HELD is not flown by this registration"); return 2; }
        if (!Array.isArray(dev.checks) || dev.checks.length) { log("takeEvadeAway: DEV has a failed check (or records none), so its read is void; HELD is not flown by this registration"); return 2; }
    }
    const L = loadRuns(io.read); if (L.error) { log("takeEvadeAway: " + L.error); return 2; }
    const G = L.runs[0].gen0, name = mode === "smoke" ? "smoke" : mode === "dev" ? (io.devSet || "dev") : (io.heldSet || "held"), matchups = matchupsOf(L.runs, G);   // loadRuns refuses unless every one of the fourteen runs exists
    const flown = flyIt(matchups, L.runs, name), rules = rulesOf(flown.rows), checks = checksOf({ rows: flown.rows, matchups, equal: flown.equal, G, runs: L.runs, count: SETS[name].count });
    for (const l of reportLines(flown.rows, rules, name)) log(l);
    if (checks.length) log("  CHECKS FAILED, NOT WEIGHED: " + checks.join("; "));
    if (mode === "dev") log(checks.length ? "  DEV: a check FAILED, the read is void; HELD is NOT flown by this registration" : rules.replicates ? "  DEV: R0 holds; HELD may be flown (node tools/ship/takeEvadeAway.mjs held --write)" : "  DEV: R0 FAILS; HELD is NOT flown by this registration");
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
